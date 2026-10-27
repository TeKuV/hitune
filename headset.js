import {
  CMD, FrameReader, decodeCodecs, decodeConfig, decodeDevice, decodeNotify, decodeVersion, encode, frame,
} from './protocol.js';

const SERVICE = '66666666-6666-6666-6666-666666666666';
const CHARACTERISTIC = '77777777-7777-7777-7777-777777777777';
const REPLY_TIMEOUT = 2500;

/** Liaison BLE (Web Bluetooth) : caracteristique 7777, ecriture et notification. */
class BleLink {
  constructor(onBytes, onClose) {
    this.onBytes = onBytes;
    this.onClose = onClose;
  }

  async open() {
    const step = async (name, fn) => {
      try {
        return await fn();
      } catch (e) {
        e.step = name;
        throw e;
      }
    };
    if (!(await navigator.bluetooth.getAvailability?.() ?? true)) {
      throw Object.assign(new Error('Bluetooth indisponible'), { name: 'AdapterError', step: 'adapter' });
    }
    this.device = await step('choose', () => navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'UGREEN' }, { services: ['0000ae30-0000-1000-8000-00805f9b34fb'] }],
      optionalServices: [SERVICE],
    }));
    this.device.addEventListener('gattserverdisconnected', () => this.onClose());
    const server = await step('gatt', () => this.device.gatt.connect());
    const service = await step('service', () => server.getPrimaryService(SERVICE));
    this.char = await step('characteristic', () => service.getCharacteristic(CHARACTERISTIC));
    this.char.addEventListener('characteristicvaluechanged', (e) => {
      this.onBytes(new Uint8Array(e.target.value.buffer));
    });
    await step('notify', () => this.char.startNotifications());
    return this.device.name ?? 'UGREEN HiTune Max6';
  }

  write(bytes) {
    return this.char.writeValueWithResponse(bytes);
  }

  close() {
    this.device?.gatt?.disconnect();
  }
}

/** Casque simule pour l'apercu : repond avec de vraies trames, comme le Max6 (firmware 1.0.4). */
class DemoLink {
  #config = Uint8Array.from([0x4e, 0xff, 0xff, 0xa1, 0x00, 0x01, 0x00, 0x00, 0x08, 0x0b, 0x00, 0x07, 0, 0, 0, 0, 0x02, 0, 0, 0x09, 0x00, 0x00]);

  constructor(onBytes, onClose) {
    this.onBytes = onBytes;
    this.onClose = onClose;
  }

  async open() {
    return 'UGREEN HiTune Max6';
  }

  async write(bytes) {
    const [cmd, , ...rest] = bytes.slice(3);
    const data = rest.slice(0, bytes[4]);
    const c = this.#config;
    const reply = (payload = data) => {
      const body = [cmd, 1, payload.length, ...payload];
      setTimeout(() => this.onBytes(Uint8Array.from([0xdd, 0xee, 0xff, ...body, 0, 0])), 120 + Math.random() * 160);
    };
    switch (cmd) {
      case CMD.VERSION: return reply([1, 0, 4, 0, 0, 0]);
      case CMD.CONFIG: return reply([...c]);
      case CMD.CODEC: return reply([1, 2, 2, 2]);
      case CMD.DEVICES:
        reply([2, 1, ...new TextEncoder().encode('iPhone 17 Pro Max'), 0x30, 0xc6, 0xb9, 0x05, 0x9d, 0x28]);
        return reply([2, 2, ...new TextEncoder().encode('DESKTOP-R65OLGN'), 0x2a, 0xd1, 0x6c, 0xb1, 0xd5, 0x28]);
      case CMD.ANC: c[3] = data[0]; return reply();
      case CMD.EQ: c[4] = data[0]; return reply();
      case CMD.DUAL: if (data.length === 1) { c[5] = data[0]; } return reply([data.length === 1 ? data[0] : 0]);
      case CMD.GAME: c[6] = data[0]; return reply();
      case CMD.HQ: c[7] = data[0]; return reply();
      case CMD.GESTURE: c[8] = data[0]; c[9] = data[1]; c[11] = data[3]; return reply();
      case CMD.VOICE: c[16] = data[0]; return reply();
      case CMD.TIPS_VOLUME: c[19] = data[0]; return reply();
      case CMD.SPACE: c[20] = data[0]; return reply();
      case CMD.WEAR: c[21] = data[0]; return reply();
      default: return reply([]);
    }
  }

  close() {
    this.onClose();
  }
}

/**
 * Le casque vu par l'app : une commande a la fois, chaque reglage relu sur le casque.
 * Evenements : 'state' (etat complet), 'disconnect'.
 */
export class Headset extends EventTarget {
  state = null;
  #reader = new FrameReader();
  #queue = Promise.resolve();
  #waiting = null;
  #link = null;

  static get supported() {
    return 'bluetooth' in navigator;
  }

  async connect({ demo = false } = {}) {
    const Link = demo ? DemoLink : BleLink;
    this.#link = new Link((bytes) => this.#onBytes(bytes), () => this.#onClose());
    const name = await this.#link.open();
    this.state = { name, demo, devices: {}, codecs: {} };
    await this.#send(CMD.VERSION);
    await this.#send(CMD.CONFIG);
    await this.#send(CMD.CODEC);
    await this.refreshDevices();
    return this.state;
  }

  disconnect() {
    this.#link?.close();
  }

  refreshDevices() {
    this.state.devices = {};
    return this.#send(CMD.DEVICES);
  }

  /** Envoie un reglage puis relit la configuration : seule la relecture fait foi. */
  async set(name, ...args) {
    const reply = await this.#send(null, encode[name](...args));
    await this.#send(CMD.CONFIG);
    if (name === 'disconnect') {
      await this.refreshDevices();
    }
    return reply;
  }

  async reset() {
    return this.#send(CMD.RESET);
  }

  #send(cmd, bytes = frame(cmd)) {
    const run = () => new Promise((resolve, reject) => {
      const expected = bytes[3];
      const timer = setTimeout(() => {
        this.#waiting = null;
        reject(new Error('Le casque ne répond pas.'));
      }, REPLY_TIMEOUT);
      this.#waiting = { cmd: expected, resolve: (r) => { clearTimeout(timer); resolve(r); } };
      this.#link.write(bytes).catch((e) => { clearTimeout(timer); this.#waiting = null; reject(e); });
    });
    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => {});
    return next;
  }

  #onBytes(bytes) {
    for (const f of this.#reader.push(bytes)) {
      if (f.kind === 'notify') {
        const patch = decodeNotify(f.type, f.data);
        if (patch) {
          this.#patch(patch);
        }
        continue;
      }
      if (f.ok) {
        this.#absorb(f.cmd, f.data);
      }
      if (this.#waiting && this.#waiting.cmd === f.cmd) {
        const w = this.#waiting;
        this.#waiting = null;
        w.resolve(f);
      }
    }
  }

  #absorb(cmd, data) {
    switch (cmd) {
      case CMD.CONFIG: return this.#patch(decodeConfig(data));
      case CMD.VERSION: return this.#patch({ version: decodeVersion(data) });
      case CMD.CODEC: return this.#patch({ codecs: decodeCodecs(data) });
      case CMD.DEVICES: {
        const d = decodeDevice(data);
        return this.#patch({ devices: { ...this.state.devices, [d.index]: d } });
      }
      default: return undefined;
    }
  }

  #patch(patch) {
    Object.assign(this.state, patch);
    this.dispatchEvent(new CustomEvent('state', { detail: this.state }));
  }

  #onClose() {
    this.#waiting = null;
    this.dispatchEvent(new Event('disconnect'));
  }
}
