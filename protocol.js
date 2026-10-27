// Protocole com.wl.earbuds de l'app UGREEN (CommandFrame, EarbudsParser, StreamAnalyserImpl).
// Envoi        : AA BB CC | cmd | len | data | crc16 LE (sur cmd + len + data)
// Reponse      : DD EE FF | cmd | statut | len | data | crc16
// Notification : 85 86 87 | len | type | data (len compte type + data, sans crc)

export const CMD = {
  VERSION: 1, CONFIG: 4, EQ: 5, DUAL: 6, GAME: 8, ANC: 9, GESTURE: 10, HQ: 11,
  VOICE: 12, DEVICES: 13, RESET: 14, CODEC: 15, TIPS_VOLUME: 17, SPACE: 18, WEAR: 19,
};

const NOTIFY = { BATTERY: 1, ANC: 2, GAME: 4, EQ: 5, CODEC: 7, SPACE: 10 };

export const ANC_MODE = { OFF: 0, ON: 1, TRANSPARENCY: 2 };
export const ANC_LEVEL = { DEEP: 10, MEDIUM: 11, LIGHT: 12, AUTO: 13 };
export const CODEC = { 0: 'SBC', 2: 'AAC', 255: 'LDAC' };

export function crc16(bytes) {
  let crc = 0xffff;
  for (const b of bytes) {
    crc = (((crc | (crc >> 8)) << 8) & 0xffff) ^ b;
    crc ^= (crc & 0xff) >> 4;
    crc = (crc ^ (crc << 12)) & 0xffff;
    crc = (crc ^ ((crc & 0xff) << 5)) & 0xffff;
  }
  return crc;
}

export function frame(cmd, data = []) {
  const body = [cmd, data.length, ...data];
  const crc = crc16(body);
  return Uint8Array.from([0xaa, 0xbb, 0xcc, ...body, crc & 0xff, crc >> 8]);
}

export const encode = {
  anc: (mode, level) => frame(CMD.ANC, [(level << 4) | mode]),
  eq: (preset) => frame(CMD.EQ, [preset]),
  dual: (on) => frame(CMD.DUAL, [on ? 1 : 0]),
  disconnect: (index, mac) => frame(CMD.DUAL, [0, index, ...mac]),
  game: (on) => frame(CMD.GAME, [on ? 1 : 0]),
  hq: (on) => frame(CMD.HQ, [on ? 1 : 0]),
  space: (on) => frame(CMD.SPACE, [on ? 1 : 0]),
  voice: (value) => frame(CMD.VOICE, [value]),
  tipsVolume: (value) => frame(CMD.TIPS_VOLUME, [value]),
  wear: (value) => frame(CMD.WEAR, [value]),
  // setGesture2 du casque : un appui, deux appuis et appui long aux octets 0, 1 et 3.
  gestures: ({ single, double, long }) => frame(CMD.GESTURE, [single, double, 0, long, 0, 0, 0, 0]),
  query: (cmd) => frame(cmd),
};

export function decodeBattery(b) {
  return { level: b & 0x7f, charging: (b & 0x80) !== 0 };
}

export function decodeConfig(d) {
  return {
    battery: decodeBattery(d[0]),
    anc: { mode: d[3] & 0x0f, level: d[3] >> 4 },
    eq: d[4],
    dual: d[5] === 1,
    game: d[6] === 1,
    hq: d[7] === 1,
    gestures: { single: d[8], double: d[9], long: d[11] },
    voice: d[16],
    tipsVolume: d[19],
    space: d[20] === 1,
    wear: d[21],
  };
}

export function decodeVersion(d) {
  return { firmware: `${d[0]}.${d[1]}.${d[2]}`, hardware: `${d[3]}.${d[4]}.${d[5]}` };
}

export function decodeDevice(d) {
  return {
    total: d[0],
    index: d[1],
    name: new TextDecoder().decode(d.slice(2, d.length - 6)),
    mac: Array.from(d.slice(d.length - 6)),
  };
}

export function decodeCodecs(d) {
  const out = {};
  for (let i = 0; i + 1 < d.length; i += 2) {
    out[d[i]] = CODEC[d[i + 1]] ?? `#${d[i + 1]}`;
  }
  return out;
}

export function decodeNotify(type, d) {
  switch (type) {
    case NOTIFY.BATTERY: return { battery: decodeBattery(d[0]) };
    case NOTIFY.ANC: return { anc: { mode: d[0] & 0x0f, level: d[0] >> 4 } };
    case NOTIFY.GAME: return { game: d[0] === 1 };
    case NOTIFY.EQ: return { eq: d[0] };
    case NOTIFY.CODEC: return { codecs: decodeCodecs(d) };
    case NOTIFY.SPACE: return { space: d[0] === 1 };
    default: return null;
  }
}

/** Decoupe un flux d'octets en trames ; garde le reste incomplet pour le paquet suivant. */
export class FrameReader {
  #buf = [];

  push(chunk) {
    this.#buf.push(...chunk);
    const out = [];
    for (;;) {
      const start = this.#findStart();
      if (start < 0) {
        this.#buf = this.#buf.slice(-2);
        return out;
      }
      this.#buf = this.#buf.slice(start);
      const b = this.#buf;
      if (b[0] === 0xdd) {
        if (b.length < 6 || b.length < 8 + b[5]) {
          return out;
        }
        out.push({ kind: 'response', cmd: b[3], ok: b[4] === 1, data: Uint8Array.from(b.slice(6, 6 + b[5])) });
        this.#buf = b.slice(8 + b[5]);
      } else {
        if (b.length < 4 || b.length < 4 + b[3]) {
          return out;
        }
        out.push({ kind: 'notify', type: b[4], data: Uint8Array.from(b.slice(5, 4 + b[3])) });
        this.#buf = b.slice(4 + b[3]);
      }
    }
  }

  #findStart() {
    const b = this.#buf;
    for (let i = 0; i + 2 < b.length; i++) {
      if ((b[i] === 0xdd && b[i + 1] === 0xee && b[i + 2] === 0xff) || (b[i] === 0x85 && b[i + 1] === 0x86 && b[i + 2] === 0x87)) {
        return i;
      }
    }
    return -1;
  }
}
