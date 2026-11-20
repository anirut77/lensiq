/* tests/fixtures/palm-v2/synth-orient.js — FIXED TEST SET "palm-capture-orient" (owner request 2026-11-20: palm capture when
 * someone else takes the photo; the hand may point any way and may be mirrored). Locked in evals-locks/palm-capture-orient.sha256
 * BEFORE the product change. DRAWN SYNTHETIC images only (tests/fixtures/palm-v2/synth-capture.js palmImage), never a photo of a
 * person; every number measured on them is SYNTHETIC. Pure JavaScript (Node and browser global PalmOrientSynth).
 *   quarter(img, q)     -> img turned q x 90 degrees CLOCKWISE (lossless pixel move), with its points moved the same way
 *   mirror(img)         -> img flipped left-right, points too
 *   pad(img, side, bg)  -> img centred on a side x side square of colour bg (so every rotation keeps the same frame)
 *   rotate(img, deg, bg)-> img turned deg degrees clockwise about its centre, same size (bilinear; corners bg)
 *   shrink(img, W)      -> img box-averaged down to W px wide (what the live check sees, 160 px)
 *   grain(img, amp, seed)-> img with seeded per-pixel noise of +- amp grey levels (a camera preview's sensor grain; without it a
 *                          drawn hand shrunk to 160 px is smoother than any camera frame and reads as "blurry")
 *   img = { w, h, rgba, taps?, hand?, pts? } ; points are continuous image coordinates (pixel i covers [i, i + 1)).
 *   mapHand(hand, fn), mapTaps(taps, fn): every point through fn. */
(function (root) {
  "use strict";
  var BG = [60, 80, 110];
  function mapPts(o, fn) {
    if (!o) return o;
    if (Array.isArray(o)) return typeof o[0] === "number" ? fn(o) : o.map(function (p) { return mapPts(p, fn); });
    var out = {};
    Object.keys(o).forEach(function (k) { var v = o[k]; out[k] = v && typeof v === "object" ? mapPts(v, fn) : v; });
    return out;
  }
  function carry(img, out, fn) {
    if (img.taps) out.taps = mapPts(img.taps, fn);
    if (img.hand) out.hand = mapPts(img.hand, fn);
    if (img.pts) out.pts = mapPts(img.pts, fn);
    if (img.thumbTip) out.thumbTip = fn(img.thumbTip);
    return out;
  }
  /** q x 90 degrees clockwise: (x, y) -> (H - y, x) per quarter */
  function quarter(img, q) {
    q = ((q % 4) + 4) % 4;
    var cur = img;
    for (var k = 0; k < q; k++) {
      var W = cur.w, H = cur.h, src = cur.rgba, o = new Uint8ClampedArray(src.length);
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var s = (y * W + x) * 4, d = (x * H + (H - 1 - y)) * 4;
        o[d] = src[s]; o[d + 1] = src[s + 1]; o[d + 2] = src[s + 2]; o[d + 3] = src[s + 3];
      }
      cur = carry(cur, { w: H, h: W, rgba: o }, (function (HH) { return function (p) { return [HH - p[1], p[0]]; }; })(H));
    }
    if (q === 0) cur = carry(img, { w: img.w, h: img.h, rgba: img.rgba }, function (p) { return [p[0], p[1]]; });
    return cur;
  }
  function mirror(img) {
    var W = img.w, H = img.h, src = img.rgba, o = new Uint8ClampedArray(src.length);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var s = (y * W + x) * 4, d = (y * W + (W - 1 - x)) * 4;
      o[d] = src[s]; o[d + 1] = src[s + 1]; o[d + 2] = src[s + 2]; o[d + 3] = src[s + 3];
    }
    return carry(img, { w: W, h: H, rgba: o }, function (p) { return [W - p[0], p[1]]; });
  }
  function pad(img, side, bg) {
    bg = bg || BG;
    var o = new Uint8ClampedArray(side * side * 4), dx = Math.floor((side - img.w) / 2), dy = Math.floor((side - img.h) / 2), x, y;
    for (var i = 0; i < side * side; i++) { o[i * 4] = bg[0]; o[i * 4 + 1] = bg[1]; o[i * 4 + 2] = bg[2]; o[i * 4 + 3] = 255; }
    for (y = 0; y < img.h; y++) for (x = 0; x < img.w; x++) {
      var X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= side || Y >= side) continue;
      var s = (y * img.w + x) * 4, d = (Y * side + X) * 4;
      o[d] = img.rgba[s]; o[d + 1] = img.rgba[s + 1]; o[d + 2] = img.rgba[s + 2]; o[d + 3] = 255;
    }
    return carry(img, { w: side, h: side, rgba: o }, function (p) { return [p[0] + dx, p[1] + dy]; });
  }
  /** deg clockwise about the centre, same size; bilinear; outside = bg */
  function rotate(img, deg, bg) {
    bg = bg || BG;
    var W = img.w, H = img.h, src = img.rgba, o = new Uint8ClampedArray(W * H * 4), a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), cx = W / 2, cy = H / 2;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var px = x + 0.5 - cx, py = y + 0.5 - cy;
      // inverse of the clockwise turn (image y down): source = R(-a) * dest
      var sx = c * px + s * py + cx - 0.5, sy = -s * px + c * py + cy - 0.5, d = (y * W + x) * 4;
      var x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) { o[d] = bg[0]; o[d + 1] = bg[1]; o[d + 2] = bg[2]; o[d + 3] = 255; continue; }
      for (var k = 0; k < 3; k++) {
        var i00 = (y0 * W + x0) * 4 + k, i10 = i00 + 4, i01 = i00 + W * 4, i11 = i01 + 4;
        o[d + k] = (src[i00] * (1 - fx) + src[i10] * fx) * (1 - fy) + (src[i01] * (1 - fx) + src[i11] * fx) * fy;
      }
      o[d + 3] = 255;
    }
    return carry(img, { w: W, h: H, rgba: o }, function (p) { var px = p[0] - cx, py = p[1] - cy; return [c * px - s * py + cx, s * px + c * py + cy]; });
  }
  function shrink(img, Wn) {
    var W = img.w, H = img.h, Hn = Math.max(8, Math.round(Wn * H / W)), o = new Uint8ClampedArray(Wn * Hn * 4), fx = W / Wn, fy = H / Hn;
    for (var y = 0; y < Hn; y++) for (var x = 0; x < Wn; x++) {
      var x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx)), y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
      var r = 0, g = 0, b = 0, n = 0;
      for (var yy = y0; yy < y1 && yy < H; yy++) for (var xx = x0; xx < x1 && xx < W; xx++) { var j = (yy * W + xx) * 4; r += img.rgba[j]; g += img.rgba[j + 1]; b += img.rgba[j + 2]; n++; }
      var d = (y * Wn + x) * 4; o[d] = r / n; o[d + 1] = g / n; o[d + 2] = b / n; o[d + 3] = 255;
    }
    return carry(img, { w: Wn, h: Hn, rgba: o }, function (p) { return [p[0] / fx, p[1] / fy]; });
  }
  function grain(img, amp, seed) {
    var s = (seed >>> 0) || 7, o = new Uint8ClampedArray(img.rgba.length);
    var rnd = function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    for (var i = 0; i < o.length; i += 4) { var d = (rnd() * 2 - 1) * amp; o[i] = img.rgba[i] + d; o[i + 1] = img.rgba[i + 1] + d; o[i + 2] = img.rgba[i + 2] + d; o[i + 3] = 255; }
    return carry(img, { w: img.w, h: img.h, rgba: o }, function (p) { return [p[0], p[1]]; });
  }
  var api = { BG: BG, quarter: quarter, mirror: mirror, pad: pad, rotate: rotate, shrink: shrink, grain: grain,
    mapHand: function (h, fn) { return mapPts(h, fn); }, mapTaps: function (t, fn) { return mapPts(t, fn); } };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PalmOrientSynth = api;
})(typeof window !== "undefined" ? window : globalThis);
