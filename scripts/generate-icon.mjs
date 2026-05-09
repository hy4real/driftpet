// Generates a minimal 512x512 PNG icon for driftpet using only Node.js built-ins.
// The icon is a simple colored circle on a dark rounded background.

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SIZE = 512;
const OUTPUT = "assets/icon.png";

// Precomputed CRC-32 table
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, dataOrFn) {
  const data =
    typeof dataOrFn === "function"
      ? (() => {
          const b = Buffer.alloc(32);
          const len = dataOrFn(b);
          return b.subarray(0, len);
        })()
      : dataOrFn;

  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);

  const typeBuf = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(crcInput);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = pngChunk("IHDR", (buf) => {
    buf.writeUInt32BE(width, 0);
    buf.writeUInt32BE(height, 4);
    buf.writeUInt8(8, 8);
    buf.writeUInt8(6, 9);
    buf.writeUInt8(0, 10);
    buf.writeUInt8(0, 11);
    buf.writeUInt8(0, 12);
    return 13;
  });

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = deflateSync(raw, { level: 9 });
  const idat = pngChunk("IDAT", compressed);

  const iend = pngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

// Build pixel data
const pixels = Buffer.alloc(SIZE * SIZE * 4);

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const idx = (y * SIZE + x) * 4;
    const cornerRadius = SIZE * 0.22;

    // Check if pixel is inside rounded rect
    const inRect =
      x >= cornerRadius &&
      x <= SIZE - cornerRadius &&
      y >= cornerRadius &&
      y <= SIZE - cornerRadius;

    let inCorner = false;
    const corners = [
      [cornerRadius, cornerRadius],
      [SIZE - cornerRadius, cornerRadius],
      [cornerRadius, SIZE - cornerRadius],
      [SIZE - cornerRadius, SIZE - cornerRadius],
    ];
    for (const [cx, cy] of corners) {
      if (Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) <= cornerRadius) {
        inCorner = true;
        break;
      }
    }

    if (!inRect && !inCorner) {
      pixels[idx + 3] = 0;
      continue;
    }

    // Pet body circle
    const petDist = Math.sqrt((x - SIZE * 0.5) ** 2 + (y - SIZE * 0.42) ** 2);
    const petRadius = SIZE * 0.28;

    if (petDist <= petRadius) {
      const eyeLDist = Math.sqrt((x - SIZE * 0.38) ** 2 + (y - SIZE * 0.36) ** 2);
      const eyeRDist = Math.sqrt((x - SIZE * 0.62) ** 2 + (y - SIZE * 0.36) ** 2);
      const eyeRadius = SIZE * 0.06;
      const pupilRadius = SIZE * 0.025;

      if (eyeLDist <= pupilRadius || eyeRDist <= pupilRadius) {
        pixels[idx] = 26; pixels[idx + 1] = 26; pixels[idx + 2] = 46; pixels[idx + 3] = 255;
      } else if (eyeLDist <= eyeRadius || eyeRDist <= eyeRadius) {
        pixels[idx] = 255; pixels[idx + 1] = 255; pixels[idx + 2] = 255; pixels[idx + 3] = 255;
      } else if (
        Math.abs(y - SIZE * 0.44) <= SIZE * 0.018 &&
        x > SIZE * 0.38 && x < SIZE * 0.62 &&
        Math.sqrt((x - SIZE * 0.5) ** 2 + (y - SIZE * 0.46) ** 2) <= SIZE * 0.1
      ) {
        pixels[idx] = 26; pixels[idx + 1] = 26; pixels[idx + 2] = 46; pixels[idx + 3] = 255;
      } else {
        pixels[idx] = 233; pixels[idx + 1] = 69; pixels[idx + 2] = 96; pixels[idx + 3] = 255;
      }
    } else if (
      x > SIZE * 0.52 && x < SIZE * 0.85 &&
      y > SIZE * 0.06 && y < SIZE * 0.22
    ) {
      pixels[idx] = 255; pixels[idx + 1] = 255; pixels[idx + 2] = 255; pixels[idx + 3] = 255;
    } else {
      const bgR = 26 + (22 - 26) * (y / SIZE);
      const bgG = 26 + (33 - 26) * (y / SIZE);
      const bgB = 46 + (62 - 46) * (y / SIZE);
      pixels[idx] = bgR; pixels[idx + 1] = bgG; pixels[idx + 2] = bgB; pixels[idx + 3] = 255;
    }
  }
}

const png = createPng(SIZE, SIZE, pixels);
writeFileSync(OUTPUT, png);
console.log(`Icon written to ${OUTPUT} (${png.length} bytes)`);
