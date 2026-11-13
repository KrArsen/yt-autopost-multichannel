import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const v0x = cx - ax;
  const v0y = cy - ay;
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = px - ax;
  const v2y = py - ay;
  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;
  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
  return u >= 0 && v >= 0 && u + v <= 1;
}

function drawIconRgba(size) {
  const buf = Buffer.alloc(size * size * 4);
  const pad = size * 0.06;
  const r = size * 0.22;
  const min = pad;
  const max = size - pad;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const px = x + 0.5;
      const py = y + 0.5;

      // Rounded rect distance
      const qx = Math.max(min + r - px, 0, px - (max - r));
      const qy = Math.max(min + r - py, 0, py - (max - r));
      const dist = Math.hypot(qx, qy) - r;

      if (dist > 0.75) {
        buf[idx + 3] = 0;
        continue;
      }

      // Smooth edge alpha
      const alpha = dist > -0.75 ? Math.round(((0.75 - dist) / 1.5) * 255) : 255;

      // Gradient crimson background
      const t = (px + py) / (2 * size);
      let red = Math.round(244 - t * 35);
      let green = Math.round(63 - t * 35);
      let blue = Math.round(94 - t * 48);

      // Play triangle in center
      const ax = size * 0.39;
      const ay = size * 0.30;
      const bx = size * 0.39;
      const by = size * 0.70;
      const cx = size * 0.71;
      const cy = size * 0.50;

      if (pointInTriangle(px, py, ax, ay, bx, by, cx, cy)) {
        red = 255;
        green = 255;
        blue = 255;
      }

      buf[idx] = red;
      buf[idx + 1] = green;
      buf[idx + 2] = blue;
      buf[idx + 3] = alpha;
    }
  }
  return buf;
}

function buildIco(pngBuffers) {
  // ICONDIR: 6 bytes, ICONDIRENTRY: 16 bytes each
  const header = Buffer.alloc(6 + pngBuffers.length * 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = ICO
  header.writeUInt16LE(pngBuffers.length, 4);

  let offset = header.length;
  for (let i = 0; i < pngBuffers.length; i++) {
    const { size, png } = pngBuffers[i];
    const entryOffset = 6 + i * 16;
    header[entryOffset] = size >= 256 ? 0 : size;
    header[entryOffset + 1] = size >= 256 ? 0 : size;
    header[entryOffset + 2] = 0;
    header[entryOffset + 3] = 0;
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(png.length, entryOffset + 8);
    header.writeUInt32LE(offset, entryOffset + 12);
    offset += png.length;
  }

  return Buffer.concat([header, ...pngBuffers.map((p) => p.png)]);
}

const outDir = path.resolve('electron/assets');
fs.mkdirSync(outDir, { recursive: true });

const sizes = [16, 32, 48, 256];
const pngs = sizes.map((size) => ({
  size,
  png: encodePng(size, size, drawIconRgba(size)),
}));

fs.writeFileSync(path.join(outDir, 'icon.png'), pngs[pngs.length - 1].png);
fs.writeFileSync(path.join(outDir, 'icon.ico'), buildIco(pngs));
console.log('Generated electron/assets/icon.png and electron/assets/icon.ico');
