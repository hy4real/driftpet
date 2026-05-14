// Generates the driftpet application icon using only Node.js built-ins.
// Keep this deterministic so `npm run icon:generate` always refreshes the
// checked-in PNG instead of falling back to the old placeholder blob.

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SIZE = 512;
const OUTPUT = "assets/icon.png";
const pixels = Buffer.alloc(SIZE * SIZE * 4);

const TAU = Math.PI * 2;

// Precomputed CRC-32 table for PNG chunks.
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
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));

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

  return Buffer.concat([
    signature,
    ihdr,
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function color(hex, alpha = 255) {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
    a: alpha,
  };
}

function putPixel(x, y, rgba) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const idx = (Math.floor(y) * SIZE + Math.floor(x)) * 4;
  const alpha = clamp(rgba.a ?? 255) / 255;
  const inv = 1 - alpha;
  pixels[idx] = clamp(rgba.r * alpha + pixels[idx] * inv);
  pixels[idx + 1] = clamp(rgba.g * alpha + pixels[idx + 1] * inv);
  pixels[idx + 2] = clamp(rgba.b * alpha + pixels[idx + 2] * inv);
  pixels[idx + 3] = clamp((alpha + (pixels[idx + 3] / 255) * inv) * 255);
}

function fillMask(maskFn, paintFn, bounds = [0, 0, SIZE, SIZE]) {
  const [minX, minY, maxX, maxY] = bounds.map((v, i) =>
    i < 2 ? Math.max(0, Math.floor(v)) : Math.min(SIZE, Math.ceil(v)),
  );
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const coverage = clamp(maskFn(x + 0.5, y + 0.5), 0, 1);
      if (coverage <= 0) continue;
      const rgba = paintFn(x + 0.5, y + 0.5, coverage);
      putPixel(x, y, { ...rgba, a: (rgba.a ?? 255) * coverage });
    }
  }
}

function roundedRectMask(x, y, left, top, right, bottom, radius, feather = 1.5) {
  const px = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const py = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  const dist = Math.hypot(x - px, y - py);
  return 1 - smoothstep(radius - feather, radius + feather, dist);
}

function ellipseMask(x, y, cx, cy, rx, ry, feather = 1.5) {
  const dist = Math.hypot((x - cx) / rx, (y - cy) / ry);
  return 1 - smoothstep(1 - feather / Math.max(rx, ry), 1 + feather / Math.max(rx, ry), dist);
}

function capsuleMask(x, y, x1, y1, x2, y2, radius, feather = 1.4) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : clamp(((x - x1) * dx + (y - y1) * dy) / lenSq, 0, 1);
  const px = x1 + dx * t;
  const py = y1 + dy * t;
  const dist = Math.hypot(x - px, y - py);
  return 1 - smoothstep(radius - feather, radius + feather, dist);
}

function ringMask(x, y, cx, cy, rx, ry, width, start = 0, end = TAU, feather = 1.4) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  let angle = Math.atan2(dy, dx);
  if (angle < 0) angle += TAU;

  let inArc = false;
  if (start <= end) {
    inArc = angle >= start && angle <= end;
  } else {
    inArc = angle >= start || angle <= end;
  }
  if (!inArc) return 0;

  const dist = Math.abs(Math.hypot(dx, dy) - 1) * Math.max(rx, ry);
  return 1 - smoothstep(width - feather, width + feather, dist);
}

function drawRoundedRect(left, top, right, bottom, radius, paintFn) {
  fillMask(
    (x, y) => roundedRectMask(x, y, left, top, right, bottom, radius),
    paintFn,
    [left - 3, top - 3, right + 3, bottom + 3],
  );
}

function drawEllipse(cx, cy, rx, ry, paintFn) {
  fillMask(
    (x, y) => ellipseMask(x, y, cx, cy, rx, ry),
    paintFn,
    [cx - rx - 4, cy - ry - 4, cx + rx + 4, cy + ry + 4],
  );
}

function drawCapsule(x1, y1, x2, y2, radius, paintFn) {
  fillMask(
    (x, y) => capsuleMask(x, y, x1, y1, x2, y2, radius),
    paintFn,
    [
      Math.min(x1, x2) - radius - 4,
      Math.min(y1, y2) - radius - 4,
      Math.max(x1, x2) + radius + 4,
      Math.max(y1, y2) + radius + 4,
    ],
  );
}

function drawRing(cx, cy, rx, ry, width, start, end, paintFn) {
  fillMask(
    (x, y) => ringMask(x, y, cx, cy, rx, ry, width, start, end),
    paintFn,
    [cx - rx - width - 4, cy - ry - width - 4, cx + rx + width + 4, cy + ry + width + 4],
  );
}

function drawStar(cx, cy, radius, paintFn) {
  fillMask(
    (x, y) => {
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      const diamond = 1 - smoothstep(radius - 1.2, radius + 1.2, dx + dy);
      const glow = 1 - smoothstep(radius * 1.4, radius * 3.1, Math.hypot(x - cx, y - cy));
      return Math.max(diamond, glow * 0.28);
    },
    paintFn,
    [cx - radius * 4, cy - radius * 4, cx + radius * 4, cy + radius * 4],
  );
}

function drawSparkPixel(x, y, size, rgba) {
  drawRoundedRect(x, y, x + size, y + size, size * 0.22, () => rgba);
}

function background() {
  drawRoundedRect(24, 24, 488, 488, 112, (x, y) => {
    const t = y / SIZE;
    const radial = 1 - clamp(Math.hypot(x - 184, y - 120) / 430, 0, 1);
    return {
      r: mix(14, 24, t) + radial * 20,
      g: mix(27, 48, t) + radial * 30,
      b: mix(49, 69, t) + radial * 18,
      a: 255,
    };
  });

  drawRoundedRect(40, 40, 472, 472, 96, (x, y) => {
    const edge = Math.min(x - 40, 472 - x, y - 40, 472 - y);
    const alpha = (1 - smoothstep(0, 34, edge)) * 34;
    return color("#ffffff", alpha);
  });

  drawEllipse(378, 146, 172, 92, () => color("#49d6cc", 16));
  drawEllipse(160, 365, 142, 96, () => color("#ff9f45", 15));
}

function orbitalElements() {
  drawRing(255, 275, 164, 93, 8, 3.46, 0.92, (x) => {
    const t = x / SIZE;
    return {
      r: mix(255, 82, t),
      g: mix(183, 219, t),
      b: mix(81, 213, t),
      a: 150,
    };
  });

  drawRing(258, 280, 194, 118, 4, 1.08, 2.95, () => color("#9cf6e8", 62));
  drawCapsule(82, 389, 212, 407, 7, () => color("#111827", 52));
  drawCapsule(289, 399, 428, 378, 6, () => color("#111827", 42));

  drawStar(398, 112, 9, () => color("#fff5c7", 190));
  drawStar(114, 165, 7, () => color("#8af6eb", 150));
  drawStar(414, 326, 5, () => color("#ffbd6b", 140));

  drawSparkPixel(362, 190, 14, color("#fb7185", 210));
  drawSparkPixel(385, 206, 10, color("#38d8c9", 180));
  drawSparkPixel(103, 306, 12, color("#ffd166", 170));
}

function petShadow() {
  drawEllipse(256, 373, 116, 29, () => color("#06101f", 100));
  drawEllipse(256, 362, 92, 18, () => color("#0c2235", 74));
}

function petBody() {
  // Ears sit behind the head and give the icon a recognizable silhouette.
  drawEllipse(180, 203, 50, 72, (x, y) => {
    const t = clamp((y - 128) / 140, 0, 1);
    return {
      r: mix(52, 39, t),
      g: mix(223, 186, t),
      b: mix(199, 181, t),
      a: 255,
    };
  });
  drawEllipse(333, 203, 50, 72, (x, y) => {
    const t = clamp((y - 128) / 140, 0, 1);
    return {
      r: mix(52, 39, t),
      g: mix(223, 186, t),
      b: mix(199, 181, t),
      a: 255,
    };
  });

  drawEllipse(181, 210, 24, 39, () => color("#18334c", 145));
  drawEllipse(331, 210, 24, 39, () => color("#18334c", 145));

  drawEllipse(256, 260, 105, 116, (x, y) => {
    const t = clamp((y - 148) / 228, 0, 1);
    const light = 1 - clamp(Math.hypot(x - 216, y - 190) / 230, 0, 1);
    return {
      r: mix(58, 35, t) + light * 18,
      g: mix(230, 185, t) + light * 16,
      b: mix(206, 180, t) + light * 10,
      a: 255,
    };
  });

  drawEllipse(256, 306, 75, 61, (x, y) => {
    const t = clamp((y - 250) / 116, 0, 1);
    return {
      r: mix(255, 255, t),
      g: mix(226, 205, t),
      b: mix(161, 147, t),
      a: 238,
    };
  });

  drawEllipse(218, 252, 28, 34, () => color("#fff8ed", 252));
  drawEllipse(294, 252, 28, 34, () => color("#fff8ed", 252));
  drawEllipse(221, 256, 13, 16, () => color("#142238", 255));
  drawEllipse(291, 256, 13, 16, () => color("#142238", 255));
  drawEllipse(216, 248, 5, 6, () => color("#ffffff", 210));
  drawEllipse(286, 248, 5, 6, () => color("#ffffff", 210));

  drawEllipse(256, 285, 11, 8, () => color("#142238", 240));
  drawCapsule(234, 307, 278, 307, 4, () => color("#142238", 220));
  drawEllipse(256, 314, 17, 8, () => color("#ff9eb7", 210));

  drawEllipse(173, 288, 13, 11, () => color("#ff98aa", 126));
  drawEllipse(339, 288, 13, 11, () => color("#ff98aa", 126));

  drawCapsule(175, 344, 215, 337, 15, (x) => {
    const t = clamp((x - 165) / 58, 0, 1);
    return {
      r: mix(255, 236, t),
      g: mix(207, 169, t),
      b: mix(126, 98, t),
      a: 246,
    };
  });
  drawCapsule(296, 337, 337, 344, 15, (x) => {
    const t = clamp((x - 288) / 58, 0, 1);
    return {
      r: mix(236, 255, t),
      g: mix(169, 207, t),
      b: mix(98, 126, t),
      a: 246,
    };
  });

  drawCapsule(181, 386, 225, 386, 13, () => color("#1f3d57", 232));
  drawCapsule(288, 386, 332, 386, 13, () => color("#1f3d57", 232));

  drawCapsule(161, 169, 350, 158, 4, () => color("#ffffff", 34));
  drawCapsule(196, 182, 272, 176, 3, () => color("#ffffff", 50));
}

function petAntenna() {
  drawCapsule(251, 151, 244, 107, 5, () => color("#44d7cb", 235));
  drawCapsule(263, 151, 286, 113, 5, () => color("#44d7cb", 225));
  drawEllipse(243, 100, 14, 14, () => color("#fff2a7", 235));
  drawEllipse(291, 107, 12, 12, () => color("#ffac62", 230));
}

function foregroundBadge() {
  drawRoundedRect(324, 346, 421, 404, 24, (x, y) => {
    const t = clamp((x - 324) / 97, 0, 1);
    return {
      r: mix(29, 37, t),
      g: mix(215, 235, t),
      b: mix(201, 226, t),
      a: 246,
    };
  });
  drawCapsule(349, 374, 379, 374, 6, () => color("#f7fafc", 230));
  drawCapsule(374, 374, 396, 374, 4, () => color("#f7fafc", 162));
}

background();
orbitalElements();
petShadow();
petAntenna();
petBody();
foregroundBadge();

const png = createPng(SIZE, SIZE, pixels);
writeFileSync(OUTPUT, png);
console.log(`Icon written to ${OUTPUT} (${png.length} bytes)`);
