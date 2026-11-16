/* lensiq-pet-card.js — LQPetCard: the shareable Pet face reading card, drawn on a <canvas> on the device (owner order
 * 2026-11-16 part B item 5: the card is the main feature, free). Nothing is uploaded: the caller saves the canvas as a local
 * PNG or hands it to the phone's own share sheet.
 * Kept separate from petread.js so it can move onto the shared share / print module (branch fortune-share-print) later:
 * draw() takes only plain data (LQPet.cardModel) plus an optional picture.
 *
 *   THEMES {sunny, night, mint, blossom} -> {bg:[c0,c1], ink, soft, accent, chip}
 *   draw(canvas, model, {theme, photo: HTMLImageElement|HTMLCanvasElement|null, pet: box|null, persons: [box]}) -> info
 *     boxes are normalised {x,y,w,h} on the photo. The photo is drawn only when model.photo is true (the owner ticked it;
 *     off by default). Every person box is pixelated beyond recognition outside the pet box; when a person covers more than
 *     half of the pet box the photo is refused and the drawing is used instead.
 *     info = {photo: bool, blur: number of person regions pixelated, refused: bool, theme}
 *   wrap(ctx, text, maxWidth, lang) -> lines (Thai / Chinese without spaces: by word segments when the browser has them)
 * Browser: window.LQPetCard · Node: module.exports (no canvas work at load). */
(function (root) {
  "use strict";
  const W = 1080, H = 1350;
  const THEMES = {
    sunny: { bg: ["#fff6e5", "#ffd8a8"], ink: "#3d2410", soft: "#7a4a22", accent: "#e8590c", chip: "#ffffff" },
    night: { bg: ["#1b1f4a", "#41307a"], ink: "#fff8e6", soft: "#d9d2ff", accent: "#ffd43b", chip: "#2b2f66" },
    mint: { bg: ["#e6fcf5", "#b2f2bb"], ink: "#0b3d2e", soft: "#2b6b50", accent: "#0ca678", chip: "#ffffff" },
    blossom: { bg: ["#fff0f6", "#fcc2d7"], ink: "#4d1030", soft: "#86325a", accent: "#d6336c", chip: "#ffffff" },
  };
  const COAT = { black: ["#2b2b2b", "#2b2b2b"], white: ["#f8f9fa", "#f8f9fa"], grey: ["#9aa3ad", "#c3c9d0"], orange: ["#f08c00", "#ffc078"],
    brown: ["#8b5a2b", "#b07a45"], cream: ["#f3e1c0", "#fff4e0"], tabby: ["#b07a45", "#6b4423"], tricolour: ["#f8f9fa", "#f08c00"],
    bicolour: ["#343a40", "#f8f9fa"], tortie: ["#3b2a20", "#e8590c"], merle: ["#8f9bb0", "#495057"], fawn: ["#d9b38c", "#f1dcc0"] };
  const FONT = () => { try { return (root.getComputedStyle && root.document && root.getComputedStyle(root.document.body).fontFamily) || "sans-serif"; } catch (e) { return "sans-serif"; } };

  function segments(text, lang) {
    const t = String(text || "");
    if (lang === "en") return t.split(/(\s+)/).filter(s => s.length);
    try { if (root.Intl && Intl.Segmenter) return [...new Intl.Segmenter(lang === "zh" ? "zh" : "th", { granularity: "word" }).segment(t)].map(s => s.segment); } catch (e) { /* older engine */ }
    // fallback: one cluster per base character (Thai vowels and tone marks stay on their consonant)
    return t.match(/.[ัิ-ฺ็-๎]*/gu) || [t];
  }
  function wrap(ctx, text, maxW, lang) {
    const out = []; let line = "";
    for (const s of segments(text, lang)) {
      const next = line + s;
      if (ctx.measureText(next).width <= maxW || !line.trim()) { line = next; continue; }
      out.push(line.trim()); line = s.trimStart();
      while (ctx.measureText(line).width > maxW && line.length > 1) { // a single segment wider than the line
        let k = line.length - 1; while (k > 1 && ctx.measureText(line.slice(0, k)).width > maxW) k--;
        out.push(line.slice(0, k)); line = line.slice(k);
      }
    }
    if (line.trim()) out.push(line.trim());
    return out;
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x,
    y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function paw(c, x, y, s, col) {
    c.fillStyle = col;
    c.beginPath(); c.ellipse(x, y + s * 0.35, s * 0.42, s * 0.34, 0, 0, Math.PI * 2); c.fill();
    for (const [dx, dy] of [[-0.42, -0.12], [-0.15, -0.42], [0.15, -0.42], [0.42, -0.12]]) { c.beginPath(); c.ellipse(x + dx * s, y + dy * s, s * 0.14, s * 0.18, 0, 0, Math.PI * 2); c.fill(); }
  }
  /** a friendly drawn face (no photo): coloured by the coat, ears by species */
  function drawPet(c, cx, cy, r, species, coat, th) {
    const [c0, c1] = COAT[coat] || COAT.orange, ink = coat === "black" || coat === "tortie" || coat === "bicolour" ? "#f8f9fa" : "#2b2b2b";
    c.save();
    c.fillStyle = c0;
    if (species === "dog") { // floppy ears
      c.beginPath(); c.ellipse(cx - r * 0.95, cy - r * 0.05, r * 0.32, r * 0.62, 0.35, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(cx + r * 0.95, cy - r * 0.05, r * 0.32, r * 0.62, -0.35, 0, Math.PI * 2); c.fill();
    } else { // pointed ears
      c.beginPath(); c.moveTo(cx - r * 0.85, cy - r * 0.2); c.lineTo(cx - r * 0.62, cy - r * 1.12); c.lineTo(cx - r * 0.12, cy - r * 0.78); c.fill();
      c.beginPath(); c.moveTo(cx + r * 0.85, cy - r * 0.2); c.lineTo(cx + r * 0.62, cy - r * 1.12); c.lineTo(cx + r * 0.12, cy - r * 0.78); c.fill();
    }
    c.beginPath(); c.ellipse(cx, cy, r, r * 0.88, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = c1; c.beginPath(); c.ellipse(cx, cy + r * 0.38, r * 0.48, r * 0.36, 0, 0, Math.PI * 2); c.fill(); // muzzle
    if (coat === "tabby") { c.strokeStyle = c1; c.lineWidth = r * 0.07; for (const dx of [-0.25, 0, 0.25]) { c.beginPath(); c.moveTo(cx + dx * r, cy - r * 0.85);
      c.lineTo(cx + dx * r * 0.7, cy - r * 0.45); c.stroke(); } }
    c.fillStyle = ink;
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * r * 0.36, cy - r * 0.08, r * 0.1, r * 0.13, 0, 0, Math.PI * 2); c.fill(); }
    c.beginPath(); c.moveTo(cx - r * 0.09, cy + r * 0.22); c.lineTo(cx + r * 0.09, cy + r * 0.22); c.lineTo(cx, cy + r * 0.32); c.closePath(); c.fill();
    c.strokeStyle = ink; c.lineWidth = r * 0.04; c.lineCap = "round";
    c.beginPath(); c.arc(cx - r * 0.1, cy + r * 0.36, r * 0.1, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
    c.beginPath(); c.arc(cx + r * 0.1, cy + r * 0.36, r * 0.1, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
    c.fillStyle = "rgba(255,120,150,.35)"; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * r * 0.58, cy + r * 0.22, r * 0.13, r * 0.08, 0, 0, Math.PI * 2); c.fill(); }
    c.restore();
    void th;
  }
  const inter = (a, b) => { const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h); return x2 > x
    && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null; };

  /** the photo inside the art frame; persons pixelated outside the pet box. Returns {blur, refused} */
  function drawPhoto(c, img, pet, persons, fx, fy, fw, fh) {
    const iw = img.naturalWidth || img.videoWidth || img.width, ih = img.naturalHeight || img.videoHeight || img.height;
    const P = pet || { x: 0, y: 0, w: 1, h: 1 };
    const pp = (persons || []).map(b => ({ b, i: inter(b, P) }));
    if (pp.some(o => o.i && o.i.w * o.i.h > 0.5 * P.w * P.h)) return { blur: 0, refused: true };
    // crop: the pet box, padded, at the frame's aspect
    const ar = fw / fh; let cw = P.w * iw * 1.3, ch = P.h * ih * 1.3;
    if (cw / ch > ar) ch = cw / ar; else cw = ch * ar;
    if (cw > iw) { cw = iw; ch = cw / ar; } if (ch > ih) { ch = ih; cw = ch * ar; }
    let sx = (P.x + P.w / 2) * iw - cw / 2, sy = (P.y + P.h / 2) * ih - ch / 2;
    sx = Math.max(0, Math.min(iw - cw, sx)); sy = Math.max(0, Math.min(ih - ch, sy));
    c.save(); roundRect(c, fx, fy, fw, fh, 36); c.clip();
    c.drawImage(img, sx, sy, cw, ch, fx, fy, fw, fh);
    const k = fw / cw, toF = b => ({ x: fx + (b.x * iw - sx) * k, y: fy + (b.y * ih - sy) * k, w: b.w * iw * k, h: b.h * ih * k });
    let blur = 0;
    const doc = root.document, tmp = doc.createElement("canvas"), tx = tmp.getContext("2d");
    for (const o of pp) {
      const r = toF(o.b), fr = inter(r, { x: fx, y: fy, w: fw, h: fh }); if (!fr) continue;
      // a coarse mosaic of the person region (outside the pet box): nothing recognisable is left
      tmp.width = Math.max(1, Math.round(fr.w / 40)); tmp.height = Math.max(1, Math.round(fr.h / 40));
      tx.imageSmoothingEnabled = true; tx.drawImage(c.canvas, fr.x, fr.y, fr.w, fr.h, 0, 0, tmp.width, tmp.height);
      c.save(); c.beginPath(); c.rect(fr.x, fr.y, fr.w, fr.h);
      if (o.i) { const pr = toF(o.i); c.rect(pr.x + pr.w, pr.y, -pr.w, pr.h); } // a hole where the pet is (opposite winding)
      c.clip("nonzero"); c.imageSmoothingEnabled = false; c.drawImage(tmp, 0, 0, tmp.width, tmp.height, fr.x, fr.y, fr.w, fr.h);
      c.fillStyle = "rgba(255,255,255,.25)"; c.fillRect(fr.x, fr.y, fr.w, fr.h); c.restore();
      blur++;
    }
    c.restore();
    return { blur, refused: false };
  }

  function draw(canvas, model, opts) {
    const o = opts || {}, th = THEMES[o.theme || model.theme] || THEMES.sunny, lang = model.lang || "th";
    canvas.width = W; canvas.height = H;
    const c = canvas.getContext("2d"), font = FONT();
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, th.bg[0]); g.addColorStop(1, th.bg[1]);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.09; for (const [x, y, s] of [[110, 120, 60], [960, 230, 46], [80, 1010, 52], [990, 980, 64], [540, 1290, 40]]) paw(c, x, y, s, th.ink); c.globalAlpha = 1;
    c.strokeStyle = th.accent; c.lineWidth = 6; roundRect(c, 24, 24, W - 48, H - 48, 48); c.stroke();
    const PAD = 76, TW = W - PAD * 2;
    // header
    c.fillStyle = th.accent; c.font = `700 30px ${font}`; c.textBaseline = "top"; c.textAlign = "left";
    paw(c, PAD + 18, 86, 26, th.accent); c.fillText("LENSIQ", PAD + 56, 70);
    c.fillStyle = th.ink; c.font = `800 58px ${font}`;
    let y = 128; for (const l of wrap(c, model.title, TW, lang).slice(0, 2)) { c.fillText(l, PAD, y); y += 70; }
    // picture frame
    const fy = y + 14, fh = 470, fx = PAD, fw = TW;
    let info = { photo: false, blur: 0, refused: false, theme: o.theme || model.theme || "sunny" };
    const wantPhoto = !!(model.photo && o.photo);
    if (wantPhoto) { const r = drawPhoto(c, o.photo, o.pet, o.persons, fx, fy, fw, fh); info = Object.assign(info, r, { photo: !r.refused }); }
    if (!info.photo) {
      c.save(); roundRect(c, fx, fy, fw, fh, 36); c.fillStyle = "rgba(255,255,255,.35)"; c.fill(); c.restore();
      c.fillStyle = model.hex || th.accent; c.globalAlpha = 0.28; c.beginPath(); c.arc(W / 2, fy + fh / 2, 205, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
      drawPet(c, W / 2, fy + fh / 2 + 30, 150, model.species, model.coat, th);
    }
    y = fy + fh + 30;
    // lucky chip
    if (model.lucky) {
      c.font = `700 32px ${font}`; const lw = Math.min(TW, c.measureText(model.lucky).width + 110);
      c.fillStyle = th.chip; roundRect(c, PAD, y, lw, 64, 32); c.fill();
      c.fillStyle = model.hex || th.accent; c.beginPath(); c.arc(PAD + 36, y + 32, 18, 0, Math.PI * 2); c.fill();
      c.fillStyle = th.ink; c.fillText(wrap(c, model.lucky, lw - 80, lang)[0] || "", PAD + 68, y + 14);
      y += 88;
    }
    // reading lines (short): at most 8 lines in all
    c.font = `500 33px ${font}`; c.fillStyle = th.ink;
    const LH = 46, maxY = H - 250; let used = 0;
    for (const p of model.lines || []) {
      const ls = wrap(c, p, TW, lang);
      for (let i = 0; i < ls.length && y + LH <= maxY && used < 8; i++, used++) {
        const last = (i === ls.length - 1) || y + 2 * LH > maxY || used === 7;
        c.fillText(last && i < ls.length - 1 ? ls[i].replace(/.$/u, "…") : ls[i], PAD, y); y += LH;
        if (last && i < ls.length - 1) break;
      }
      y += 14;
    }
    // footer: honest line, disclaimer, link back
    let fy2 = H - 220; c.fillStyle = th.soft; c.font = `500 25px ${font}`;
    for (const t of [model.honest, model.disclaimer]) for (const l of wrap(c, t, TW, lang).slice(0, 2)) { c.fillText(l, PAD, fy2); fy2 += 34; }
    c.fillStyle = th.accent; c.font = `700 28px ${font}`; c.fillText(String(model.link || "").replace(/^https:\/\//, ""), PAD, Math.max(fy2 + 8, H - 92));
    return info;
  }

  const api = { THEMES, draw, wrap, W, H };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LQPetCard = api;
})(typeof window !== "undefined" ? window : globalThis);
