/* lensiq-pet-card.js — LQPetCard: the shareable Pet face reading card, drawn on a <canvas> on the device (owner order
 * 2026-11-16 part B item 5: the card is the main feature, free). Nothing is uploaded: the caller saves the canvas as a local
 * PNG or hands it to the phone's own share sheet.
 * Kept separate from petread.js so it can move onto the shared share / print module (branch fortune-share-print) later:
 * draw() takes only plain data (LQPet.cardModel) plus an optional picture and an optional QR matrix.
 *
 *   THEMES {sunny, night, mint, blossom} · SIZES {post: 1080 x 1350 (4:5), story: 1080 x 1920 (9:16)}
 *   draw(canvas, model, {theme, size, photo, pet: box|null, persons: [box], detOk: bool, qr: {n, dark(r, c)}|null}) -> info
 *     boxes are normalised {x,y,w,h} on the photo. PRIVACY (review round 1, D1): the photo is drawn only when model.photo is
 *     true (the owner ticked it; off by default) AND the detector ran (detOk); it is refused when any person box touches or
 *     overlaps the pet box (a face inside or next to the pet cannot be told apart from the pet); every other person box is
 *     pixelated in WHOLE (coarse mosaic, no hole). info = {photo, blur, refused: "" | "nodet" | "person", theme, size, qr,
 *     frame: [x, y, w, h] of the picture area in canvas pixels}
 *   opts.skin: a zodiac template from lensiq-pet-zodiac-art.js (LQPetZodiacArt.skin(id, label)): its colours, background, border,
 *     art over the picture frame and footer "จาก LENSIQ · <link>" (model.from); info.template = its id. Without it: the 4 themes.
 *   wrap(ctx, text, maxWidth, lang) -> lines (Thai / Chinese without spaces: by word segments when the browser has them)
 * Browser: window.LQPetCard · Node: module.exports (no canvas work at load). */
(function (root) {
  "use strict";
  const SIZES = { post: { w: 1080, h: 1350 }, story: { w: 1080, h: 1920 } };
  const THEMES = {
    sunny: { bg: ["#fff6e5", "#ffd8a8"], ink: "#3d2410", soft: "#7a4a22", accent: "#e8590c", chip: "#ffffff", frame: "rgba(255,255,255,.6)",
      glow: "rgba(255,255,255,.55)" },
    night: { bg: ["#16193d", "#3a2c74"], ink: "#fff8e6", soft: "#e2dcff", accent: "#ffd43b", chip: "#2b2f66", frame: "#262b63",
      glow: "rgba(255,212,59,.16)" },
    mint: { bg: ["#e6fcf5", "#b2f2bb"], ink: "#0b3d2e", soft: "#2b6b50", accent: "#0ca678", chip: "#ffffff", frame: "rgba(255,255,255,.6)",
      glow: "rgba(255,255,255,.55)" },
    blossom: { bg: ["#fff0f6", "#fcc2d7"], ink: "#4d1030", soft: "#86325a", accent: "#d6336c", chip: "#ffffff", frame: "rgba(255,255,255,.6)",
      glow: "rgba(255,255,255,.55)" },
  };
  const COAT = { black: ["#2b2b2b", "#3d3d3d"], white: ["#f8f9fa", "#e9ecef"], grey: ["#9aa3ad", "#c3c9d0"], orange: ["#f08c00", "#ffc078"],
    brown: ["#8b5a2b", "#b07a45"], cream: ["#f3e1c0", "#fff4e0"], tabby: ["#b07a45", "#6b4423"], tricolour: ["#f8f9fa", "#f08c00"],
    bicolour: ["#343a40", "#f8f9fa"], tortie: ["#3b2a20", "#e8590c"], merle: ["#8f9bb0", "#495057"], fawn: ["#d9b38c", "#f1dcc0"] };
  const EYE = { gold: "#e8a317", green: "#3fa34d", blue: "#4dabf7", brown: "#7a4a22", hazel: "#8a7a2a", odd: ["#4dabf7", "#e8a317"] };
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
  /** a friendly drawn face (no photo): coat colours, eye colour and ear shape as the owner picked them */
  function drawPet(c, cx, cy, r, m) {
    const [c0, c1] = COAT[m.coat] || COAT.orange;
    const ears = m.ears || (m.species === "dog" ? "fold" : "up");
    c.save(); c.fillStyle = c0;
    if (ears === "fold") { // folded / floppy ears
      for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * r * 0.92, cy - r * 0.08, r * 0.3, r * 0.6, s * -0.35, 0, Math.PI * 2); c.fill(); }
    } else if (ears === "round") {
      for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * r * 0.62, cy - r * 0.72, r * 0.3, 0, Math.PI * 2); c.fill(); }
    } else { // upright, pointed
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(cx + s * r * 0.85, cy - r * 0.2); c.lineTo(cx + s * r * 0.64, cy - r * 1.14); c.lineTo(cx + s * r * 0.12, cy - r * 0.78); c.fill();
      }
      c.fillStyle = "rgba(255,150,170,.55)";
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(cx + s * r * 0.7, cy - r * 0.42); c.lineTo(cx + s * r * 0.62, cy - r * 0.94); c.lineTo(cx + s * r * 0.3, cy - r * 0.72); c.fill();
      }
      c.fillStyle = c0;
    }
    c.beginPath(); c.ellipse(cx, cy, r, r * 0.88, 0, 0, Math.PI * 2); c.fill();
    if (m.coat === "tricolour" || m.coat === "tortie") {
      c.fillStyle = m.coat === "tortie" ? "#e8590c" : "#2b2b2b";
      c.beginPath(); c.ellipse(cx - r * 0.45, cy - r * 0.35, r * 0.4, r * 0.32, 0.4, 0, Math.PI * 2); c.fill();
    }
    if (m.coat === "merle") {
      c.fillStyle = c1;
      for (const [dx, dy, k] of [[-0.5, -0.3, 0.18], [0.45, -0.45, 0.14], [0.55, 0.2, 0.12]]) { c.beginPath(); c.arc(cx + dx * r, cy + dy * r, k * r, 0, Math.PI * 2); c.fill(); }
    }
    if (m.coat === "tabby") {
      c.strokeStyle = c1; c.lineWidth = r * 0.07;
      for (const dx of [-0.25, 0, 0.25]) { c.beginPath(); c.moveTo(cx + dx * r, cy - r * 0.85); c.lineTo(cx + dx * r * 0.7, cy - r * 0.45); c.stroke(); }
    }
    c.fillStyle = m.coat === "bicolour" ? "#f8f9fa" : c1; c.beginPath(); c.ellipse(cx, cy + r * 0.38, r * 0.48, r * 0.36, 0, 0, Math.PI * 2); c.fill();
    for (const s of [-1, 1]) { // eyes in the chosen colour
      const col = Array.isArray(EYE[m.eyes]) ? EYE[m.eyes][s < 0 ? 0 : 1] : (EYE[m.eyes] || EYE.gold);
      c.fillStyle = "#fff"; c.beginPath(); c.ellipse(cx + s * r * 0.36, cy - r * 0.08, r * 0.16, r * 0.18, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = col; c.beginPath(); c.ellipse(cx + s * r * 0.36, cy - r * 0.07, r * 0.13, r * 0.15, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#1a1a1a"; c.beginPath(); c.ellipse(cx + s * r * 0.36, cy - r * 0.06, r * 0.05, r * 0.11, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#fff"; c.beginPath(); c.arc(cx + s * r * 0.36 + r * 0.04, cy - r * 0.13, r * 0.035, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = "#2b2b2b"; c.beginPath(); c.moveTo(cx - r * 0.09, cy + r * 0.22); c.lineTo(cx + r * 0.09, cy + r * 0.22); c.lineTo(cx, cy + r * 0.32); c.closePath(); c.fill();
    c.strokeStyle = "#2b2b2b"; c.lineWidth = r * 0.04; c.lineCap = "round";
    for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * r * 0.1, cy + r * 0.36, r * 0.1, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke(); }
    c.fillStyle = "rgba(255,120,150,.4)";
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * r * 0.6, cy + r * 0.22, r * 0.13, r * 0.08, 0, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
  const touches = (a, b, pad) => !(a.x + a.w < b.x - pad || b.x + b.w + pad < a.x || a.y + a.h < b.y - pad || b.y + b.h + pad < a.y);

  /** the photo in the frame. Refused when a person touches the pet box; every other person box pixelated in whole. */
  function drawPhoto(c, img, pet, persons, fx, fy, fw, fh) {
    const iw = img.naturalWidth || img.videoWidth || img.width, ih = img.naturalHeight || img.videoHeight || img.height;
    const P = pet || { x: 0, y: 0, w: 1, h: 1 }, ps = persons || [];
    if (pet && ps.some(b => touches(b, P, 0.01))) return { blur: 0, refused: "person" };
    const ar = fw / fh; let cw = P.w * iw * 1.3, ch = P.h * ih * 1.3;
    if (cw / ch > ar) ch = cw / ar; else cw = ch * ar;
    if (cw > iw) { cw = iw; ch = cw / ar; }
    if (ch > ih) { ch = ih; cw = ch * ar; }
    let sx = (P.x + P.w / 2) * iw - cw / 2, sy = (P.y + P.h / 2) * ih - ch / 2;
    sx = Math.max(0, Math.min(iw - cw, sx)); sy = Math.max(0, Math.min(ih - ch, sy));
    c.save(); roundRect(c, fx, fy, fw, fh, 36); c.clip();
    c.drawImage(img, sx, sy, cw, ch, fx, fy, fw, fh);
    const k = fw / cw;
    let blur = 0;
    const tmp = root.document.createElement("canvas"), tx = tmp.getContext("2d");
    for (const b of ps) {
      // the whole person box, padded 6 %, as a coarse mosaic (blocks of about 36 card pixels)
      const px = b.w * 0.06, py = b.h * 0.06;
      const r = { x: fx + ((b.x - px) * iw - sx) * k, y: fy + ((b.y - py) * ih - sy) * k, w: (b.w + 2 * px) * iw * k, h: (b.h + 2 * py) * ih * k };
      const x0 = Math.max(fx, r.x), y0 = Math.max(fy, r.y), x1 = Math.min(fx + fw, r.x + r.w), y1 = Math.min(fy + fh, r.y + r.h);
      if (x1 <= x0 || y1 <= y0) continue;
      const bw = Math.max(1, Math.round((x1 - x0) / 36)), bh = Math.max(1, Math.round((y1 - y0) / 36));
      tmp.width = bw; tmp.height = bh; tx.imageSmoothingEnabled = true;
      tx.drawImage(c.canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, bw, bh);
      c.imageSmoothingEnabled = false; c.drawImage(tmp, 0, 0, bw, bh, x0, y0, x1 - x0, y1 - y0); c.imageSmoothingEnabled = true;
      c.fillStyle = "rgba(255,255,255,.18)"; c.fillRect(x0, y0, x1 - x0, y1 - y0);
      blur++;
    }
    c.restore();
    return { blur, refused: "" };
  }
  /** qr = {n, dark(row, col)} from vendor/qrcode-generator (made on the device by the caller) */
  function drawQR(c, qr, x, y, s) {
    const n = qr.n, cell = s / (n + 2);
    c.fillStyle = "#ffffff"; roundRect(c, x, y, s, s, 12); c.fill();
    c.fillStyle = "#111111";
    for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) if (qr.dark(r, q)) c.fillRect(Math.floor(x + (q + 1) * cell), Math.floor(y + (r + 1) * cell), Math.ceil(cell), Math.ceil(cell));
  }

  function draw(canvas, model, opts) {
    // o.skin (zodiac card mode, lensiq-pet-zodiac-art.js): {id, theme, base(c, W, H), decor(c, W, H), overFrame(c, fx, fy, fw, fh,
    // env) -> {ribbon, medallion}, after(c, W, H, env)} replaces the colour theme and adds the template art. Review round 1: the
    // decoration (stickers, sprinkles, border, corner art) is drawn on its own layers AFTER the text is laid out, with every text
    // box (info.textBoxes, padded) erased from those layers, so no art ever sits under text; o.decor === false leaves it out
    // (the exclusion-zone test compares the two).
    const o = opts || {}, sk = o.skin || null, th = sk ? sk.theme : (THEMES[o.theme || model.theme] || THEMES.sunny), lang = model.lang || "th";
    const sizeKey = SIZES[o.size || model.size] ? (o.size || model.size) : "post", S = SIZES[sizeKey], W = S.w, H = S.h, story = sizeKey === "story";
    canvas.width = W; canvas.height = H;
    const c = canvas.getContext("2d"), font = FONT();
    /** text boxes: kind "header" | "body" | "footer", in canvas pixels, around the drawn text */
    const boxes = [], tb = (kind, x, y, w, fsz) => boxes.push({ kind, x: x - 6, y: y - fsz * 0.3, w: w + 12, h: fsz * 1.6 });
    if (!sk) {
      const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, th.bg[0]); g.addColorStop(1, th.bg[1]);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.globalAlpha = 0.09;
      for (const [x, y, s] of [[110, 120, 60], [960, 230, 46], [80, H - 340, 52], [990, H - 370, 64], [540, H - 60, 40]]) paw(c, x, y, s, th.ink);
      c.globalAlpha = 1;
      c.strokeStyle = th.accent; c.lineWidth = 6; roundRect(c, 24, 24, W - 48, H - 48, 48); c.stroke();
    }
    const PAD = 76, TW = W - PAD * 2;
    c.textBaseline = "top"; c.textAlign = "left";
    // header: brand line, the typed pet name (big), the headline type
    const HW = sk ? TW - 140 : TW; // zodiac mode: the header text stays clear of the corner sticker
    c.fillStyle = th.accent; c.font = `700 30px ${font}`; paw(c, PAD + 18, 86, 26, th.accent); c.fillText(model.title || "LENSIQ", PAD + 56, 70);
    boxes.push({ kind: "header", x: PAD - 14, y: 52, w: 56 + c.measureText(model.title || "LENSIQ").width + 26, h: 64 });
    let y = story ? 150 : 128;
    const nfs = story ? 96 : 80; c.fillStyle = th.ink; c.font = `800 ${nfs}px ${font}`;
    for (const l of wrap(c, model.petName || "", HW, lang).slice(0, 1)) { c.fillText(l, PAD, y); tb("header", PAD, y, c.measureText(l).width, nfs); y += story ? 112 : 92; }
    if (model.headline) {
      const hfs = story ? 52 : 44, hl = wrap(c, model.headline, HW, lang)[0] || "";
      c.fillStyle = th.accent; c.font = `700 ${hfs}px ${font}`;
      c.fillText(hl, PAD, y); tb("header", PAD, y, c.measureText(hl).width, hfs); y += story ? 74 : 62;
    }
    // picture frame
    const fy = y + 10, fh = story ? 760 : 430, fx = PAD, fw = TW;
    const info = { photo: false, blur: 0, refused: "", theme: sk ? "" : (o.theme || model.theme || "sunny"), template: sk ? sk.id : "", size: sizeKey, qr: false,
      frame: [fx, fy, fw, fh] };
    if (model.photo && o.photo) {
      if (o.detOk === false) info.refused = "nodet";
      else { const r = drawPhoto(c, o.photo, o.pet, o.persons, fx, fy, fw, fh); info.blur = r.blur; info.refused = r.refused; info.photo = !r.refused; }
    }
    if (!info.photo) {
      c.save(); roundRect(c, fx, fy, fw, fh, 36); c.fillStyle = th.frame; c.fill(); c.strokeStyle = th.accent; c.globalAlpha = 0.35; c.lineWidth = 3; c.stroke(); c.restore();
      c.fillStyle = th.glow; c.beginPath(); c.arc(W / 2, fy + fh / 2, fh * 0.42, 0, Math.PI * 2); c.fill();
      c.fillStyle = model.hex || th.accent; c.globalAlpha = 0.3; c.beginPath(); c.arc(W / 2, fy + fh / 2, fh * 0.36, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
      drawPet(c, W / 2, fy + fh / 2 + fh * 0.07, fh * 0.29, model);
    }
    const env = { story, font, lang, roundRect };
    if (sk && sk.overFrame) { const r = sk.overFrame(c, fx, fy, fw, fh, env) || {}; info.ribbon = r.ribbon || null; info.medallion = r.medallion || null; }
    y = fy + fh + 30;
    // lucky chip
    if (model.lucky) {
      c.font = `700 34px ${font}`; const lw = Math.min(TW, c.measureText(model.lucky).width + 112);
      c.fillStyle = th.chip; roundRect(c, PAD, y, lw, 68, 34); c.fill();
      c.fillStyle = model.hex || th.accent; c.beginPath(); c.arc(PAD + 38, y + 34, 20, 0, Math.PI * 2); c.fill();
      c.fillStyle = th.ink; c.fillText(wrap(c, model.lucky, lw - 84, lang)[0] || "", PAD + 72, y + 15);
      boxes.push({ kind: "body", x: PAD - 6, y: y - 6, w: lw + 12, h: 80 });
      y += 96;
    }
    // reading lines: the space down to the footer is shared out
    const footTop = H - (o.qr ? 250 : 230), fs = story ? 40 : 35, LH = Math.round(fs * 1.38);
    c.font = `500 ${fs}px ${font}`; c.fillStyle = th.ink;
    const paras = (model.lines || []).map(p => wrap(c, p, TW, lang));
    let budget = Math.floor((footTop - 20 - y) / LH) - (paras.length - 1) * 0.4;
    for (const ls of paras) {
      if (budget < 1) break;
      const take = Math.min(ls.length, Math.floor(budget));
      for (let i = 0; i < take; i++) { const cut = i === take - 1 && take < ls.length, t = cut ? ls[i].replace(/.$/u, "…") : ls[i];
        c.fillText(t, PAD, y); tb("body", PAD, y, c.measureText(t).width, fs); y += LH; }
      budget -= take + 0.4; y += Math.round(LH * 0.4);
    }
    // footer: honest line, disclaimer, link back (and the optional QR code to the same link)
    const qs = 170, tw2 = o.qr ? TW - qs - 24 : TW;
    let fy2 = footTop; c.fillStyle = th.soft; c.font = `500 25px ${font}`;
    for (const t of [model.honest, model.disclaimer]) for (const l of wrap(c, t, tw2, lang).slice(0, 2)) { c.fillText(l, PAD, fy2); tb("footer", PAD, fy2, c.measureText(l).width, 25); fy2 += 34; }
    c.fillStyle = th.accent; c.font = `700 28px ${font}`;
    const foot = sk && model.from ? model.from : String(model.link || "").replace(/^https:\/\//, "");
    if (sk) for (let f = 28; f > 18 && c.measureText(foot).width > tw2; f--) c.font = `700 ${f - 1}px ${font}`; // one line, never cut
    const ly = Math.max(fy2 + 8, H - 92), lfs = parseInt(/(\d+)px/.exec(c.font)[1], 10);
    c.fillText(foot, PAD, ly); tb("footer", PAD, ly, c.measureText(foot).width, lfs);
    if (o.qr && o.qr.n) { drawQR(c, o.qr, W - PAD - qs, H - 64 - qs, qs); info.qr = true; boxes.push({ kind: "footer", x: W - PAD - qs - 6, y: H - 64 - qs - 6, w: qs + 12, h: qs + 12 }); }
    info.textBoxes = boxes;
    if (sk) skinLayers(c, sk, W, H, env, boxes, o.decor !== false);
    return info;
  }

  /** zodiac layers around the finished foreground: corner art on top, then decoration and the base BEHIND it
   *  (destination-over); every text box (padded 6 px) is erased from the art layers first */
  function skinLayers(c, sk, W, H, env, boxes, decor) {
    const layer = draw => { const t = root.document.createElement("canvas"); t.width = W; t.height = H; const x = t.getContext("2d"); draw(x); return t; };
    const erase = t => { const x = t.getContext("2d"); x.save(); x.globalCompositeOperation = "destination-out"; x.fillStyle = "#000";
      for (const b of boxes) x.fillRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12); x.restore(); return t; };
    c.save();
    if (decor) {
      if (sk.after) c.drawImage(erase(layer(x => sk.after(x, W, H, env))), 0, 0);
      c.globalCompositeOperation = "destination-over";
      c.drawImage(erase(layer(x => sk.decor(x, W, H))), 0, 0);
    }
    c.globalCompositeOperation = "destination-over";
    c.drawImage(layer(x => sk.base(x, W, H)), 0, 0);
    c.restore();
  }

  const api = { THEMES, SIZES, draw, wrap, paw, roundRect, W: SIZES.post.w, H: SIZES.post.h };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LQPetCard = api;
})(typeof window !== "undefined" ? window : globalThis);
