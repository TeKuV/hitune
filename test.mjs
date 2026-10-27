// node test.mjs : verifie le protocole contre des trames captees sur le casque (firmware 1.0.4).
import assert from 'node:assert/strict';
import { FrameReader, decodeConfig, decodeDevice, decodeVersion, encode, frame } from './protocol.js';

const hex = (s) => Uint8Array.from(s.split(' ').map((x) => parseInt(x, 16)));
const out = (u) => Array.from(u, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

assert.equal(out(frame(1)), 'AA BB CC 01 00 00 EF');
assert.equal(out(frame(4)), 'AA BB CC 04 00 00 BF');
assert.equal(out(encode.dual(true)), 'AA BB CC 06 01 01 21 FF');
assert.equal(out(encode.voice(0)), 'AA BB CC 0C 01 00 00 AF');
assert.equal(out(encode.voice(3)), 'AA BB CC 0C 01 03 63 9F');

const reader = new FrameReader();
const config = 'DD EE FF 04 01 1F 0A FF FF A1 00 01 00 00 08 0B 00 07 00 00 00 00 02 00 00 09 00 00 04 05 00 00 00 0D 0E 0C 00 D8 6F';
const [half1, half2] = [hex(config).slice(0, 10), hex(config).slice(10)];
assert.equal(reader.push(half1).length, 0);
const [cfg] = reader.push(half2);
assert.equal(cfg.cmd, 4);
const c = decodeConfig(cfg.data);
assert.deepEqual(c.battery, { level: 10, charging: false });
assert.deepEqual(c.anc, { mode: 1, level: 10 });
assert.equal(c.dual, true);
assert.equal(c.voice, 2);
assert.equal(c.tipsVolume, 9);
assert.deepEqual(c.gestures, { single: 8, double: 11, long: 7 });

const devices = reader.push(hex('DD EE FF 0D 01 0E 02 01 41 44 4D 49 4E 30 C6 B9 05 9D 28 F4 3D B8 DD EE FF 0D 01 0F 02 02 41 64 6D 69 6E 20 31 2A D1 6C B1 D5 28 5B 4E 85 86 87 02 01 8A'));
assert.equal(devices.length, 3);
assert.equal(decodeDevice(devices[0].data).name, 'ADMIN0');
assert.deepEqual(decodeDevice(devices[1].data), { total: 2, index: 2, name: 'Admin 1', mac: [0x2a, 0xd1, 0x6c, 0xb1, 0xd5, 0x28] });
assert.deepEqual(devices[2], { kind: 'notify', type: 1, data: Uint8Array.from([0x8a]) });

const [ver] = new FrameReader().push(hex('DD EE FF 01 01 06 01 00 04 00 00 00 F6 9A'));
assert.equal(decodeVersion(ver.data).firmware, '1.0.4');

console.log('protocole : ok');
