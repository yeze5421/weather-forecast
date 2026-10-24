/* Original Cirrus icon, rendered from geometry with no runtime dependencies. */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const tag = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  tag.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([tag, data])), data.length + 8);
  return result;
}

function encodePNG(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6; // 8-bit RGBA
  const scanlines = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    pixels.copy(scanlines, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function roundedBox(x, y, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(x - cx) - halfW + radius;
  const dy = Math.abs(y - cy) - halfH + radius;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
}

function cloudDistance(x, y) {
  return Math.min(
    Math.hypot(x - 84, y - 152) - 27,
    Math.hypot(x - 118, y - 129) - 37,
    Math.hypot(x - 166, y - 152) - 29,
    roundedBox(x, y, 124, 163, 44, 16, 15),
  );
}

function mix(color, overlay, alpha) {
  for (let i = 0; i < 3; i++) color[i] = color[i] * (1 - alpha) + overlay[i] * alpha;
}

function sample(x, y) {
  if (roundedBox(x, y, 128, 128, 120, 120, 52) > 0) return [0, 0, 0, 0];

  // Lavender tile with a restrained warm highlight, darkening toward the base.
  const progress = Math.max(0, Math.min(1, (y - 8) / 240));
  const color = [146 - 38 * progress, 139 - 35 * progress, 200 - 19 * progress];
  const highlight = Math.max(0, 1 - Math.hypot(x - 56, y - 20) / 220) * 0.13;
  mix(color, [255, 241, 235], highlight);

  const sunDistance = Math.hypot(x - 161, y - 94);
  if (sunDistance < 59) mix(color, [255, 223, 155], (1 - sunDistance / 59) * 0.18);
  if (sunDistance < 42) {
    const depth = Math.max(0, Math.min(1, (y - 52) / 84));
    mix(color, [255 - depth * 4, 221 - depth * 42, 143 - depth * 30], 1);
  }
  // The cloud's tiny offset shadow gives it lift without a photographic blur.
  const shadowDistance = cloudDistance(x, y - 5);
  if (shadowDistance < 3) mix(color, [67, 63, 115], Math.max(0, Math.min(0.14, (3 - shadowDistance) / 22)));
  if (cloudDistance(x, y) < 0) {
    const depth = Math.max(0, Math.min(1, (y - 93) / 88));
    mix(color, [255 - depth * 18, 255 - depth * 19, 255 - depth * 7], 1);
  }
  return [...color, 255];
}

function renderIcon(size) {
  const supersample = size <= 16 ? 8 : size <= 32 ? 6 : size <= 48 ? 4 : 3;
  const samples = supersample * supersample;
  const result = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < supersample; sy++) {
        for (let sx = 0; sx < supersample; sx++) {
          const rgba = sample((x + (sx + 0.5) / supersample) * 256 / size, (y + (sy + 0.5) / supersample) * 256 / size);
          const alpha = rgba[3] / 255;
          for (let channel = 0; channel < 3; channel++) sum[channel] += rgba[channel] * alpha;
          sum[3] += rgba[3];
        }
      }
      const offset = (y * size + x) * 4;
      const coverage = sum[3] / 255;
      for (let channel = 0; channel < 3; channel++) result[offset + channel] = coverage ? Math.round(sum[channel] / coverage) : 0;
      result[offset + 3] = Math.round(sum[3] / samples);
    }
  }
  return encodePNG(size, result);
}

function encodeICO(entries) {
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map(entry => entry.png)]);
}

const output = path.resolve(__dirname, '..', 'build');
fs.mkdirSync(output, { recursive: true });
const entries = [16, 32, 48, 256].map(size => ({ size, png: renderIcon(size) }));
fs.writeFileSync(path.join(output, 'icon.png'), entries.at(-1).png);
fs.writeFileSync(path.join(output, 'icon.ico'), encodeICO(entries));
console.log('Generated build/icon.png (256 px) and build/icon.ico (16, 32, 48, 256 px).');
