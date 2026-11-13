/* lensiq-pc-live.js — LQPCLive: pure logic of the Product Check LIVE SCAN (owner order 2026-11-12 after phone testing:
 * "not real-time, the box has to be aimed carefully, too many taps"). Browser: window.LQPCLive · Node: module.exports
 * (no DOM; unit-tested in tests/unit/pc-live.test.js). The camera loop that uses it is lensiq-pc-live-ui.js.
 *
 * PER FRAME (a downscaled frame, <= CFG.side px; heuristic thresholds chosen on synthetic frames, NOT measured on phone
 * video; the page shows them as hints only):
 *   frameStats(img, prevThumb) -> {sharp, edge, area, mean, darkClip, brightClip, glare, glareBox, motion, thumb}
 *     sharp  variance of the Laplacian over the text-like cells (independent of how much of the frame is label)
 *     edge   share of strong-gradient pixels · area  share of 20 px cells that look like text ("label present")
 *     motion mean absolute difference of a 64 x 48 grey thumbnail against the previous frame (0-255)
 *   hintOf(stats) -> "dark" | "bright" | "nolabel" | "closer" | "glare" | "hold" | "ok"
 *   makeStabilizer() -> {push(stats) -> {stable, run, cut, hint}, reset()}   auto-capture after CFG.stableFrames steady good
 *     frames; a steady view that is only blurred or shows glare after CFG.blurPatience frames (the OCR decides; the user
 *     is never stuck); cut =
 *     another object (large motion, or the label left the frame for 2 frames): the merged reading starts over
 *   interval(cfg) -> ms between analysed frames (never more than 5 per second)
 * READING MERGED ACROSS FRAMES (one steady view at a time; a scene cut resets it, so two objects are never merged):
 *   makeMerger() -> {add(lines), lines() -> [{text, votes, conf}], text(), frames, reset()}   lines cluster by similarity
 *     (Levenshtein, >= CFG.lineSim); per cluster the most-voted reading wins, a tie goes to the longest; a line is kept
 *     when seen at least twice, or while fewer than three readings exist; the label's order is kept
 *   similarity(a, b) -> 0..1
 *   sameObject(mergedLines, newLines) -> boolean   at least half of the new reading's lines match a merged line; otherwise
 *     the new reading is another object and the merged reading starts over (a content-based scene cut, added after the
 *     independent review: two objects must never end up in one text)
 * CHECKLIST · PRODUCT KEY
 *   checklist(text, codes, {P, G}) -> {barcode, reg, ingredients}   P = LQPC, G = LQPCGuard
 *   productKey({gtins, regs, text}) -> "g:<gtin>" | "r:<reg>" | "t:<8 hex>"   never the label text itself
 * TESTER-ONLY ONE-TAP SEND (no preview, never automatic) (owner order 2026-11-12; public flow unchanged: preview and confirm every time)
 *   autoTextCheck(G, text, facts, opts?) -> {gate, hits, maybe}   LQPCGuard.aiGate (session evidence is never passed on),
 *     guard hits (scan), possible names (possibleNames) + the stricter block list (LQPCGuard.autoBlock)
 *   autoDecision({tester, autoOn, hidden, gate, hits, maybe, face:{ran, faces}, key, sent, count, cap}) -> {send, reason}
 *     reasons, in this order: not-tester, no-auto-consent, hidden, gate:<aiGate reason>, name-guard, face / face-unknown,
 *     already-sent, session-cap; "ok" = send. Anything refused behaves as today (manual "ask AI" with the preview).
 */
(function (root, factory) {
  const node = typeof module !== "undefined" && module.exports;
  const m = factory(root, node ? require("./lensiq-thai-canon.js") : null);
  if (node) module.exports = m; else /** @type {any} */ (root).LQPCLive = m;
})(typeof self !== "undefined" ? self : this, function (/** @type {any} */ root, /** @type {any} */ TC) {
  "use strict";
  const CFG = Object.freeze({
    fps: 4, side: 320, cell: 20, edgeT: 60, cellDensity: 0.06, thumbW: 64, thumbH: 48,
    stableFrames: 3, motionMax: 8, cutMotion: 30, sharpMin: 500, blurPatience: 8,
    textArea: 0.12, glareBlob: 0.006, glareV: 250, glareS: 0.12, dark: 45, darkClip: 0.35, brightClip: 0.25,
    readsPerScene: 3, lineSim: 0.6, maxLines: 80, autoCap: 10
  });

  /* ---------------- per-frame statistics ---------------- */
  function gray(img) {
    const d = img.data, n = img.width * img.height, g = new Uint8Array(n);
    for (let i = 0; i < n; i++) g[i] = (d[4 * i] * 77 + d[4 * i + 1] * 150 + d[4 * i + 2] * 29) >> 8;
    return g;
  }
  function thumbOf(g, w, h, tw, th) {
    const t = new Uint8Array(tw * th);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const x0 = Math.floor((x * w) / tw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / tw)), y0 = Math.floor((y * h) / th), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / th));
      let s = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { s += g[yy * w + xx]; n++; }
      t[y * tw + x] = n ? Math.round(s / n) : 0;
    }
    return t;
  }
  /** largest compact near-white, low-saturation blob (specular glare) as a share of the frame, and its box */
  function glareOf(img, c) {
    const w = img.width, h = img.height, d = img.data, n = w * h, mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const r = d[4 * i], g = d[4 * i + 1], b = d[4 * i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx >= c.glareV && (mx ? (mx - mn) / mx : 0) <= c.glareS) mask[i] = 1;
    }
    let best = 0, box = null;
    const stack = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      if (mask[i] !== 1) continue;
      let sp = 0, size = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      stack[sp++] = i; mask[i] = 2;
      while (sp) {
        const p = stack[--sp], x = p % w, y = (p - x) / w;
        size++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && mask[p - 1] === 1) { mask[p - 1] = 2; stack[sp++] = p - 1; }
        if (x < w - 1 && mask[p + 1] === 1) { mask[p + 1] = 2; stack[sp++] = p + 1; }
        if (y > 0 && mask[p - w] === 1) { mask[p - w] = 2; stack[sp++] = p - w; }
        if (y < h - 1 && mask[p + w] === 1) { mask[p + w] = 2; stack[sp++] = p + w; }
      }
      if (size > best) { best = size; box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; }
    }
    return { blob: n ? best / n : 0, boxFrac: box ? (box.w * box.h) / n : 0 };
  }
  /**
   * frameStats(img, prevThumb?, cfg?) — img = ImageData-like {data RGBA, width, height}, already downscaled (<= cfg.side).
   * @param {{data: ArrayLike<number>, width: number, height: number}} img @param {Uint8Array|null} [prev] @param {any} [cfg]
   */
  function frameStats(img, prev, cfg) {
    const c = cfg || CFG, w = img.width, h = img.height, g = gray(img), C = c.cell;
    const cw = Math.max(1, Math.floor(w / C)), ch = Math.max(1, Math.floor(h / C)), cnt = new Uint32Array(cw * ch);
    let strong = 0, sum = 0, dark = 0, bright = 0;
    for (let i = 0; i < g.length; i++) { const v = g[i]; sum += v; if (v <= 5) dark++; else if (v >= 250) bright++; }
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, gx = g[i + 1] - g[i - 1], gy = g[i + w] - g[i - w];
      if (Math.abs(gx) + Math.abs(gy) > c.edgeT) {
        strong++;
        const cx = Math.floor(x / C), cy = Math.floor(y / C);
        if (cx < cw && cy < ch) cnt[cy * cw + cx]++;
      }
    }
    const isText = new Uint8Array(cw * ch);
    let cells = 0;
    for (let k = 0; k < cw * ch; k++) if (cnt[k] / (C * C) >= c.cellDensity) { isText[k] = 1; cells++; }
    let s = 0, s2 = 0, n = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const cx = Math.floor(x / C), cy = Math.floor(y / C);
      if (cx >= cw || cy >= ch || !isText[cy * cw + cx]) continue;
      const i = y * w + x, v = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
      s += v; s2 += v * v; n++;
    }
    const m = n ? s / n : 0, N = w * h || 1;
    const thumb = thumbOf(g, w, h, c.thumbW, c.thumbH);
    let motion = 0;
    if (prev && prev.length === thumb.length) { let d = 0; for (let i = 0; i < thumb.length; i++) d += Math.abs(thumb[i] - prev[i]); motion = d / thumb.length; }
    const gl = glareOf(img, c);
    return { sharp: n ? s2 / n - m * m : 0, edge: strong / N, area: cells / (cw * ch), cells, mean: sum / N, darkClip: dark / N, brightClip: bright / N,
      glare: gl.blob, glareBox: gl.boxFrac, motion, thumb };
  }
  /** one short hint for the frame. @param {any} s frameStats() @param {any} [cfg] */
  function hintOf(s, cfg) {
    const c = cfg || CFG;
    if (s.mean < c.dark || s.darkClip > c.darkClip) return "dark";
    if (s.brightClip > c.brightClip && !(s.cells > 0)) return "bright";
    if (!(s.cells > 0)) return "nolabel";
    if (s.area < c.textArea) return "closer";
    if (s.motion > c.motionMax) return "hold"; // a moving camera first: "hold still" matters more than a bright spot
    if (s.glare >= c.glareBlob && s.glareBox < 0.5) return "glare";
    if (s.sharp < c.sharpMin) return "hold";
    return "ok";
  }
  /** milliseconds between analysed frames: never more than 5 frames per second. @param {any} [cfg] */
  const interval = cfg => Math.max(200, Math.round(1000 / Math.max(0.1, (cfg || CFG).fps)));

  /** auto-capture decision over consecutive frames. @param {any} [cfg] */
  function makeStabilizer(cfg) {
    const c = cfg || CFG;
    let run = 0, blurRun = 0, gone = 0, seen = false;
    return {
      /** @param {any} s frameStats() */
      push(s) {
        const hint = hintOf(s, c);
        let cut = s.motion > c.cutMotion;
        if (!(s.cells > 0)) { gone++; if (gone >= 2 && seen) { cut = true; seen = false; } } else { gone = 0; seen = true; }
        const steady = s.motion <= c.motionMax && s.cells > 0 && s.area >= c.textArea && hint !== "dark";
        // soft problems (blur, or a white area that may be glare) do not block: a steady view is read after the patience
        // window and the OCR decides (white packaging reads as "glare" too, so glare alone must never stop the scan)
        const blurOnly = steady && ((hint === "hold" && s.sharp < c.sharpMin) || hint === "glare");
        if (hint === "ok") { run++; blurRun = 0; } else if (blurOnly) { blurRun++; run = 0; } else { run = 0; blurRun = 0; }
        const stable = run >= c.stableFrames || blurRun >= c.blurPatience;
        return { stable, run: hint === "ok" ? run : blurRun, cut, hint };
      },
      reset() { run = 0; blurRun = 0; gone = 0; seen = false; }
    };
  }

  /* ---------------- reading merged across frames ---------------- */
  /* NFKC (full-width forms) DECOMPOSES sara am ำ into nikhahit + sara aa (review 2026-11-14: the guard then missed a home
     address and took คำเตือน for a name), so the line is put back into the canonical Thai shape (lensiq-thai-canon.js) */
  /** @param {any} s @returns {string} */
  const canon = s => { const C = TC || (root && root.LQThaiCanon); return C ? C.canon(s) : String(s == null ? "" : s).normalize("NFC"); };
  const normLine = (/** @type {any} */ s) => canon(String(s == null ? "" : s).normalize("NFKC")).replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
  function lev(a, b) {
    const A = [...a], B = [...b], m = A.length, n = B.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }
  /** @param {string} a @param {string} b */
  function similarity(a, b) {
    const x = normLine(a).toLowerCase(), y = normLine(b).toLowerCase(), L = Math.max([...x].length, [...y].length);
    return L ? 1 - lev(x, y) / L : 1;
  }
  /** @param {any} [cfg] */
  function makeMerger(cfg) {
    const c = cfg || CFG;
    /** @type {{variants: Map<string, {votes: number, conf: number}>, pos: number[], frames: Set<number>}[]} */
    let clusters = [];
    let frames = 0;
    const best = cl => {
      let top = null, tv = -1, tl = -1;
      for (const [t, v] of cl.variants) { const len = [...t].length; if (v.votes > tv || (v.votes === tv && len > tl)) { top = t; tv = v.votes; tl = len; } }
      return /** @type {string} */ (top);
    };
    const keep = cl => cl.frames.size >= 2 || frames < 3;
    const meanPos = cl => cl.pos.reduce((a, b) => a + b, 0) / cl.pos.length;
    const api = {
      get frames() { return frames; },
      /** one OCR reading: lines in reading order, as strings or {text, conf} @param {any[]} lines */
      add(lines) {
        const L = (lines || []).map(l => (typeof l === "string" ? { text: l, conf: 1 } : { text: String((l && l.text) || ""), conf: l && typeof l.conf === "number" ? l.conf : 1 }))
          .map(l => ({ ...l, text: normLine(l.text) })).filter(l => l.text);
        frames++;
        const used = new Set();
        L.forEach((l, i) => {
          const pos = L.length > 1 ? i / (L.length - 1) : 0;
          let bi = -1, bs = 0;
          clusters.forEach((cl, k) => {
            if (used.has(k)) return;
            const sim = Math.max(...[...cl.variants.keys()].map(t => similarity(t, l.text)));
            if (sim >= c.lineSim && sim > bs) { bs = sim; bi = k; }
          });
          if (bi < 0) {
            if (clusters.length >= c.maxLines) return;
            clusters.push({ variants: new Map(), pos: [], frames: new Set() }); bi = clusters.length - 1;
          }
          used.add(bi);
          const cl = clusters[bi], v = cl.variants.get(l.text) || { votes: 0, conf: 0 };
          v.votes++; v.conf += l.conf; cl.variants.set(l.text, v); cl.pos.push(pos); cl.frames.add(frames);
        });
      },
      lines() {
        return clusters.filter(keep).sort((a, b) => meanPos(a) - meanPos(b)).map(cl => {
          const t = best(cl), v = /** @type {any} */ (cl.variants.get(t));
          return { text: t, votes: cl.frames.size, conf: v.conf / v.votes };
        });
      },
      text() { return api.lines().map(l => l.text).join("\n"); },
      reset() { clusters = []; frames = 0; }
    };
    return api;
  }

  /** @param {string[]} merged @param {string[]} next @param {any} [cfg] */
  function sameObject(merged, next, cfg) {
    const c = cfg || CFG, a = (merged || []).map(normLine).filter(Boolean), b = (next || []).map(normLine).filter(Boolean);
    if (!a.length || !b.length) return true;
    const hit = b.filter(l => a.some(m => similarity(m, l) >= c.lineSim)).length;
    return hit / b.length >= 0.5;
  }

  /* ---------------- checklist, product key ---------------- */
  /** @param {string} text @param {{rawValue: string, format?: string}[]} codes @param {{P: any, G: any}} deps */
  function checklist(text, codes, deps) {
    const P = deps && deps.P, G = deps && deps.G, t = String(text || "");
    const barcode = !!(P && (codes || []).some(cd => { const b = P.barcodeInfo(cd.rawValue, cd.format); return b && b.gtin && b.gtinValid; }));
    const reg = !!(P && P.findRegNumbers(t).some((/** @type {any} */ r) => r.ok !== false));
    const ingredients = !!(G && t.trim() && G.productEvidence(t).evidence.includes("ingredients"));
    return { barcode, reg, ingredients };
  }
  function fnv(s) { let h = 2166136261; for (const ch of s) { h ^= /** @type {number} */ (ch.codePointAt(0)); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, "0"); }
  /** @param {{gtins?: string[], regs?: string[], text?: string}} o */
  function productKey(o) {
    const g = ((o && o.gtins) || []).map(String).filter(Boolean).sort()[0];
    if (g) return "g:" + g;
    const r = ((o && o.regs) || []).map(x => String(x).normalize("NFKC").toUpperCase().replace(/[^0-9A-Zก-๙]/g, "")).filter(Boolean).sort()[0];
    if (r) return "r:" + r;
    return "t:" + fnv(String((o && o.text) || "").normalize("NFKC").split("\n").map(l => l.replace(/\s+/g, "")).filter(Boolean).join("\n").toLowerCase());
  }

  /* ---------------- tester-only one-tap send ---------------- */
  /** The text-side checks of an one-tap send. Session evidence (option ข) is never passed on. @param {any} G LQPCGuard
   *  @param {string} text @param {{gtins?: string[], regs?: string[]}} facts @param {any} [_opts] ignored on purpose (no session facts) */
  // eslint-disable-next-line no-unused-vars
  function autoTextCheck(G, text, facts, _opts) {
    const t = String(text || "");
    const gate = G.aiGate(t, { gtins: (facts && facts.gtins) || [], regs: (facts && facts.regs) || [] });
    // possible names are counted on the canonical copy (thai-canon-2: a name split by an invisible character still counts)
    // a possible name, or the stricter block list (phone-like digits, a form of address, letter / note wording), stops it
    return { gate, hits: G.scan(t).length, maybe: (G.possibleNames ? G.possibleNames(canon(t)).length : 0) + (G.autoBlock && G.autoBlock(t) ? 1 : 0) };
  }
  /** @param {any} o */
  function autoDecision(o) {
    const no = (/** @type {string} */ reason) => ({ send: false, reason });
    if (!o || !o.tester) return no("not-tester");
    if (!o.autoOn) return no("no-auto-consent");
    if (o.hidden) return no("hidden");
    if (!o.gate || !o.gate.allow) return no("gate:" + ((o.gate && o.gate.reason) || "no-product"));
    if (o.hits > 0 || o.maybe > 0) return no("name-guard");
    if (!o.face || !o.face.ran) return no("face-unknown");
    if (o.face.faces > 0) return no("face");
    const sent = o.sent instanceof Set ? o.sent : new Set(o.sent || []);
    if (sent.has(o.key)) return no("already-sent");
    if (o.count >= o.cap) return no("session-cap");
    return { send: true, reason: "ok" };
  }

  return { CFG, frameStats, hintOf, interval, makeStabilizer, makeMerger, similarity, sameObject, checklist, productKey, autoTextCheck, autoDecision };
});
