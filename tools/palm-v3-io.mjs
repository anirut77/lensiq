// tools/palm-v3-io.mjs — palm v3 spike helpers (development only): JPEG decode through the local djpeg (libjpeg-turbo) with the
// EXIF orientation applied, a minimal PNG writer (zlib), colour maps and simple drawing. Nothing is uploaded; callers decide
// where files go (never the repo for anything made from a photo).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

/** EXIF orientation (1-8) of a JPEG buffer, 1 when absent */
export function exifOrientation(buf) {
  let i = 2;
  while (i < buf.length - 4) {
    if (buf[i] !== 0xff) return 1;
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m === 0xe1 && buf.toString("latin1", i + 4, i + 8) === "Exif") {
      const t = i + 10, le = buf.toString("latin1", t, t + 2) === "II", r16 = o => le ? buf.readUInt16LE(o) : buf.readUInt16BE(o), r32 = o => le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
      const ifd = t + r32(t + 4), n = r16(ifd);
      for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (r16(e) === 0x0112) return r16(e + 8); }
      return 1;
    }
    if (m === 0xda) return 1;
    i += 2 + len;
  }
  return 1;
}
/** decode a JPEG file to RGBA in display orientation (orientations 1, 3, 6, 8) */
export function readJpeg(path) {
  const buf = readFileSync(path), ori = exifOrientation(buf);
  const ppm = execFileSync("djpeg", ["-pnm", path], { maxBuffer: 1 << 28 });
  let k = 0, fields = [];
  while (fields.length < 4) { while (ppm[k] === 0x20 || ppm[k] === 0x0a) k++; let s = ""; while (ppm[k] !== 0x20 && ppm[k] !== 0x0a) s += String.fromCharCode(ppm[k++]); fields.push(s); }
  k++;
  const w = +fields[1], h = +fields[2];
  const W = ori === 6 || ori === 8 ? h : w, H = ori === 6 || ori === 8 ? w : h, rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let X = x, Y = y;
    if (ori === 6) { X = h - 1 - y; Y = x; } else if (ori === 8) { X = y; Y = w - 1 - x; } else if (ori === 3) { X = w - 1 - x; Y = h - 1 - y; }
    const s = k + (y * w + x) * 3, d = (Y * W + X) * 4;
    rgba[d] = ppm[s]; rgba[d + 1] = ppm[s + 1]; rgba[d + 2] = ppm[s + 2]; rgba[d + 3] = 255;
  }
  return { w: W, h: H, rgba, orientation: ori };
}
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, c]); }
/** write RGBA (w x h) as PNG */
export function writePng(path, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const hdr = Buffer.alloc(13); hdr.writeUInt32BE(w, 0); hdr.writeUInt32BE(h, 4); hdr[8] = 8; hdr[9] = 6; hdr[10] = 0; hdr[11] = 0; hdr[12] = 0;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", hdr), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]));
}
const INFERNO = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
export function cmap(t) { t = Math.max(0, Math.min(1, t)) * (INFERNO.length - 1); const i = Math.min(INFERNO.length - 2, Math.floor(t)), f = t - i; return INFERNO[i].map((v,
    j) => Math.round(v + (INFERNO[i + 1][j] - v) * f)); }
/** float map -> RGBA heat image, scaled lo..hi */
export function heat(map, w, h, lo, hi) {
  const o = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const c = cmap((map[i] - lo) / (hi - lo || 1)); o[i * 4] = c[0]; o[i * 4 + 1] = c[1]; o[i * 4 + 2] = c[2]; o[i * 4 + 3] = 255; }
  return o;
}
/** grey float (0..255) -> RGBA */
export function greyRgba(g, w, h, lo = 0, hi = 255) {
  const o = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const v = (g[i] - lo) / (hi - lo) * 255; o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = v; o[i * 4 + 3] = 255; }
  return o;
}
/** draw a polyline (pixel coords) onto RGBA, width px, colour [r,g,b], dashed when dash > 0 */
export function drawPath(rgba, w, h, pts, col, width = 2, dash = 0) {
  let run = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L * 2));
    for (let t = 0; t <= n; t++) {
      run += L / n;
      if (dash && Math.floor(run / dash) % 2) continue;
      const x = a[0] + (b[0] - a[0]) * t / n, y = a[1] + (b[1] - a[1]) * t / n, r = width / 2;
      for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || Math.hypot(xx - x, yy - y) > r) continue;
        const i = (yy * w + xx) * 4; rgba[i] = col[0]; rgba[i + 1] = col[1]; rgba[i + 2] = col[2]; rgba[i + 3] = 255;
      }
    }
  }
}
export function dot(rgba, w, h, p, col, r = 4) { drawPath(rgba, w, h, [p, [p[0] + 0.01, p[1]]], col, r * 2); }
/** a few EXIF fields (ISO, exposure time, flash fired, brightness value) of a JPEG buffer */
export function exifBasics(buf) {
  let i = 2;
  while (i < buf.length - 4) {
    if (buf[i] !== 0xff) return {};
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m === 0xe1 && buf.toString("latin1", i + 4, i + 8) === "Exif") {
      const t = i + 10, le = buf.toString("latin1", t, t + 2) === "II", r16 = o => le ? buf.readUInt16LE(o) : buf.readUInt16BE(o), r32 = o => le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
      const rat = o => r32(t + r32(o)) / (r32(t + r32(o) + 4) || 1),
          srat = o => (le ? buf.readInt32LE(t + r32(o)) : buf.readInt32BE(t + r32(o))) / ((le ? buf.readInt32LE(t + r32(o) + 4) : buf.readInt32BE(t + r32(o) + 4)) || 1);
      const out = {}, ifd0 = t + r32(t + 4), n0 = r16(ifd0); let sub = 0;
      for (let k = 0; k < n0; k++) { const e = ifd0 + 2 + k * 12; if (r16(e) === 0x8769) sub = t + r32(e + 8); }
      if (!sub) return out;
      const n = r16(sub);
      for (let k = 0; k < n; k++) { const e = sub + 2 + k * 12, tag = r16(e);
        if (tag === 0x829a) out.exposureS = +rat(e + 8).toFixed(5); else if (tag === 0x8827) out.iso = r16(e + 8); else if (tag === 0x9209) out.flashFired = !!(r16(e + 8) & 1);
            else if (tag === 0x9203) out.brightness = +srat(e + 8).toFixed(2); }
      return out;
    }
    if (m === 0xda) return {};
    i += 2 + len;
  }
  return {};
}
