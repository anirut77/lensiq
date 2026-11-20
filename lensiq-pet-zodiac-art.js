/* lensiq-pet-zodiac-art.js — LQPetZodiacArt: the 13 share-card templates of the Pet zodiac cards (owner spec 2026-11-19).
 * ORIGINAL ART, LENSIQ: every animal, sticker, border and effect below is drawn with canvas paths written for this project; no
 * third-party pictures, fonts or icon sets (LICENSES/THIRD_PARTY.md: "original, LENSIQ").
 * Loaded by petread.js only when a zodiac card is made (never on page load, never in a crisis session).
 *
 *   STYLES {rat … pig, secret}: {name, bg [2], ink, soft, accent, chip, frame, glow, border, stickers [names], motif, effect?}
 *   ANIMALS {id: (ctx, cx, cy, r) => void}   the illustration of each template, about 2r wide
 *   skin(id, label) -> the opts.skin object for LQPetCard.draw: {base (gradient / foil), decor (sprinkles, margin stickers, border),
 *     overFrame (medallion + label ribbon, returns their rectangles), after (corner sticker, the secret card's edge sparkles)};
 *     LQPetCard.draw erases every text box from the decor and after layers, so no art sits under text
 *   drawCard(canvas, model, opts) = LQPetCard.draw(canvas, model, {...opts, skin: skin(opts.template, opts.label)})
 *   drawSlot(canvas, id, {found}) -> one collection slot: found = the template's colours and animal; missing = a grey
 *     silhouette with "?"; the secret slot keeps its star outline so it reads as the secret slot
 * Browser: window.LQPetZodiacArt · Node: module.exports (nothing is drawn at load). */
(function (root) {
  "use strict";
  const TAU = Math.PI * 2;
  const STYLES = {
    rat: { bg: ["#eef2ff", "#bcc8f5"], ink: "#1f2a4d", soft: "#3d4a7a", accent: "#4c5bd4", chip: "#ffffff", frame: "rgba(255,255,255,.6)", glow: "rgba(255,255,255,.55)",
      border: "dotted", stickers: ["star", "cheese", "paw"], motif: "grey mouse with round pink ears and whiskers" },
    ox: { bg: ["#fff4e0", "#e6c08f"], ink: "#3b2a17", soft: "#6b4a28", accent: "#8d5a2b", chip: "#ffffff", frame: "rgba(255,255,255,.6)", glow: "rgba(255,255,255,.55)",
      border: "stitch", stickers: ["leaf", "flower", "paw"], motif: "brown ox with cream horns and a wide muzzle" },
    tiger: { bg: ["#fff1e0", "#ffb066"], ink: "#3a1d05", soft: "#7a3f0c", accent: "#e8590c", chip: "#ffffff", frame: "rgba(255,255,255,.6)", glow: "rgba(255,255,255,.55)",
      border: "zigzag", stickers: ["star", "leaf", "paw"], motif: "orange tiger with dark stripes and white cheeks" },
    rabbit: { bg: ["#f8f0ff", "#dcc3f7"], ink: "#3b1a4d", soft: "#6a3d80", accent: "#9c36b5", chip: "#ffffff", frame: "rgba(255,255,255,.6)", glow: "rgba(255,255,255,.55)",
      border: "beads", stickers: ["carrot", "heart", "moon"], motif: "white rabbit with long ears and a pink nose" },
    dragon: { bg: ["#e8fff4", "#8fe3c0"], ink: "#06372a", soft: "#1f6b52", accent: "#0b8a5f", chip: "#ffffff", frame: "rgba(255,255,255,.6)", glow: "rgba(255,255,255,.55)",
      border: "double", stickers: ["cloud", "pearl", "sparkle"], motif: "green dragon with gold antlers and long whiskers" },
    snake: { bg: ["#e6fbff", "#94d3e3"], ink: "#073642", soft: "#1f5f70", accent: "#0e7c95", chip: "#ffffff", frame: "rgba(255,255,255,.6)", glow: "rgba(255,255,255,.55)",
      border: "dashed", stickers: ["diamond", "leaf", "wave"], motif: "green snake in a coil with a forked tongue" },
    horse: { bg: ["#1b2a4a", "#34508a"], ink: "#fff8e6", soft: "#dfe6ff", accent: "#ffc94d", chip: "#24365e", frame: "#22345a", glow: "rgba(255,201,77,.16)",
      border: "ticket", stickers: ["star", "clover", "sparkle"], motif: "chestnut horse with a dark mane and a white blaze, night sky" },
    goat: { bg: ["#fbfff0", "#d6eba8"], ink: "#2d3a10", soft: "#4f6420", accent: "#6c8f1d", chip: "#ffffff", frame: "rgba(255,255,255,.6)", glow: "rgba(255,255,255,.55)",
      border: "scallop", stickers: ["flower", "cloud", "heart"], motif: "cream goat with curled horns and a small beard" },
    monkey: { bg: ["#fffbe6", "#ffdd6b"], ink: "#3d2e00", soft: "#6e5400", accent: "#b07b00", chip: "#ffffff", frame: "rgba(255,255,255,.6)", glow: "rgba(255,255,255,.55)",
      border: "zigzag", stickers: ["banana", "leaf", "star"], motif: "brown monkey with a peach heart-shaped face" },
    rooster: { bg: ["#fff3ec", "#ff9f87"], ink: "#4a1208", soft: "#7d2a18", accent: "#d63a1f", chip: "#ffffff", frame: "rgba(255,255,255,.6)", glow: "rgba(255,255,255,.55)",
      border: "ticket", stickers: ["sun", "feather", "star"], motif: "cream rooster with a red comb and a yellow beak" },
    dog: { bg: ["#eaf6ff", "#a5d3ff"], ink: "#0d2c4d", soft: "#2a4f78", accent: "#1c7ed6", chip: "#ffffff", frame: "rgba(255,255,255,.6)", glow: "rgba(255,255,255,.55)",
      border: "stitch", stickers: ["bone", "heart", "paw"], motif: "tan puppy with floppy ears and an eye patch" },
    pig: { bg: ["#fff0f3", "#ffbfcf"], ink: "#4d1a2a", soft: "#7d3550", accent: "#e64980", chip: "#ffffff", frame: "rgba(255,255,255,.6)", glow: "rgba(255,255,255,.55)",
      border: "scallop", stickers: ["bubble", "flower", "heart"], motif: "pink piglet with a round snout" },
    secret: { bg: ["#120a2e", "#3b1466"], ink: "#fff8e6", soft: "#e9dcff", accent: "#ffd166", chip: "#2a1650", frame: "#1f1240", glow: "rgba(255,209,102,.18)",
      border: "royal", stickers: ["sparkle", "star", "moon"], motif: "gold starburst crest with a paw, holographic foil and sparkles",
      effect: "holo" },
  };
  const IDS = Object.keys(STYLES);

  /* ---------- small drawing helpers ---------- */
  function ell(c, x, y, rx, ry, fill, rot) { c.beginPath(); c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot || 0, 0, TAU); c.fillStyle = fill; c.fill(); }
  function circ(c, x, y, r, fill) { ell(c, x, y, r, r, fill); }
  function poly(c, pts, fill, stroke, lw) {
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); }
  }
  function line(c, pts, col, lw) {
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.strokeStyle = col; c.lineWidth = lw; c.lineCap = "round"; c.lineJoin = "round"; c.stroke();
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function starPath(c, x, y, n, ro, ri, rot) {
    c.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = (rot || -Math.PI / 2) + i * Math.PI / n, r = i % 2 ? ri : ro; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.closePath();
  }
  /** kawaii eyes: dark oval + white glint */
  function eyes(c, cx, cy, r, dx, dy, k) {
    const s = k || 1;
    for (const sg of [-1, 1]) {
      ell(c, cx + sg * dx * r, cy + dy * r, 0.075 * r * s, 0.095 * r * s, "#1d1d29");
      circ(c, cx + sg * dx * r + 0.025 * r * s, cy + dy * r - 0.035 * r * s, 0.028 * r * s, "#ffffff");
    }
  }
  function blush(c, cx, cy, r, dx, dy, col) { for (const sg of [-1, 1]) ell(c, cx + sg * dx * r, cy + dy * r, 0.12 * r, 0.07 * r, col || "rgba(255,110,140,.45)"); }
  function smile(c, cx, cy, r, w, col) {
    c.beginPath(); c.arc(cx - w * r * 0.5, cy, w * r * 0.5, 0.15 * Math.PI, 0.85 * Math.PI); c.moveTo(cx + w * r, cy);
    c.arc(cx + w * r * 0.5, cy, w * r * 0.5, 0.15 * Math.PI, 0.85 * Math.PI);
    c.strokeStyle = col || "#3a2a2a"; c.lineWidth = 0.035 * r; c.lineCap = "round"; c.stroke();
  }

  /* ---------- the 12 animals + the secret crest (original drawings, unit r) ---------- */
  const ANIMALS = {
    rat(c, x, y, r) {
      for (const s of [-1, 1]) { circ(c, x + s * 0.6 * r, y - 0.5 * r, 0.36 * r, "#9aa3b5"); circ(c, x + s * 0.6 * r, y - 0.5 * r, 0.22 * r, "#f7b6c8"); }
      ell(c, x, y + 0.08 * r, 0.74 * r, 0.66 * r, "#b8c0cf");
      ell(c, x, y + 0.36 * r, 0.32 * r, 0.22 * r, "#e6e9f0");
      for (const s of [-1, 1]) { line(c, [[x + s * 0.28 * r, y + 0.34 * r], [x + s * 0.86 * r, y + 0.24 * r]], "#5f6677", 0.025 * r);
        line(c, [[x + s * 0.28 * r, y + 0.4 * r], [x + s * 0.86 * r, y + 0.46 * r]], "#5f6677", 0.025 * r); }
      poly(c, [[x - 0.06 * r, y + 0.46 * r], [x + 0.06 * r, y + 0.46 * r], [x + 0.06 * r, y + 0.56 * r], [x - 0.06 * r, y + 0.56 * r]], "#ffffff", "#5f6677", 0.02 * r);
      circ(c, x, y + 0.27 * r, 0.075 * r, "#f06595");
      eyes(c, x, y, r, 0.27, 0.0); blush(c, x, y, r, 0.48, 0.22);
    },
    ox(c, x, y, r) {
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(x + s * 0.42 * r, y - 0.42 * r); c.quadraticCurveTo(x + s * 0.98 * r, y - 0.5 * r, x + s * 0.88 * r, y - 0.98 * r);
        c.quadraticCurveTo(x + s * 0.74 * r, y - 0.62 * r, x + s * 0.26 * r, y - 0.58 * r); c.closePath(); c.fillStyle = "#f4e3c1"; c.fill();
        c.strokeStyle = "#b08d57"; c.lineWidth = 0.03 * r; c.stroke();
        ell(c, x + s * 0.8 * r, y - 0.12 * r, 0.26 * r, 0.12 * r, "#8b5a2b", s * 0.35); ell(c, x + s * 0.8 * r, y - 0.12 * r, 0.16 * r, 0.06 * r, "#e8a87c", s * 0.35);
      }
      ell(c, x, y + 0.02 * r, 0.64 * r, 0.7 * r, "#a0673a");
      for (const dx of [-0.08, 0.06]) circ(c, x + dx * r, y - 0.6 * r, 0.1 * r, "#6b3d1f");
      ell(c, x, y + 0.4 * r, 0.5 * r, 0.3 * r, "#f2c9a0");
      for (const s of [-1, 1]) ell(c, x + s * 0.17 * r, y + 0.4 * r, 0.06 * r, 0.09 * r, "#6b3d1f");
      eyes(c, x, y, r, 0.27, -0.12); blush(c, x, y, r, 0.46, 0.12);
    },
    tiger(c, x, y, r) {
      for (const s of [-1, 1]) { circ(c, x + s * 0.56 * r, y - 0.56 * r, 0.24 * r, "#e8590c"); circ(c, x + s * 0.56 * r, y - 0.56 * r, 0.13 * r, "#fff3e0"); }
      ell(c, x, y + 0.04 * r, 0.82 * r, 0.7 * r, "#f59f00");
      for (const s of [-1, 1]) ell(c, x + s * 0.27 * r, y + 0.32 * r, 0.3 * r, 0.22 * r, "#fff8f0");
      const ST = "#3b2a1a";
      for (const dx of [-0.2, 0, 0.2]) poly(c, [[x + (dx - 0.06) * r, y - 0.64 * r], [x + (dx + 0.06) * r, y - 0.64 * r], [x + dx * r, y - 0.4 * r]], ST);
      for (const s of [-1, 1]) for (const dy of [-0.08, 0.14]) poly(c, [[x + s * 0.82 * r, y + (dy - 0.05) * r], [x + s * 0.82 * r, y + (dy + 0.05) * r], [x + s * 0.56 * r, y + dy * r]], ST);
      poly(c, [[x - 0.09 * r, y + 0.2 * r], [x + 0.09 * r, y + 0.2 * r], [x, y + 0.3 * r]], "#d6336c");
      smile(c, x, y + 0.34 * r, r, 0.12, "#3b2a1a");
      eyes(c, x, y, r, 0.3, -0.06);
    },
    rabbit(c, x, y, r) {
      for (const s of [-1, 1]) { ell(c, x + s * 0.26 * r, y - 0.62 * r, 0.16 * r, 0.44 * r, "#ffffff", s * 0.12); ell(c, x + s * 0.26 * r, y - 0.6 * r, 0.08 * r, 0.32 * r, "#f8b4cf", s * 0.12); }
      c.save(); ell(c, x, y + 0.2 * r, 0.66 * r, 0.56 * r, "#ffffff"); c.strokeStyle = "#d9d0e6"; c.lineWidth = 0.025 * r; c.stroke(); c.restore();
      poly(c, [[x - 0.07 * r, y + 0.28 * r], [x + 0.07 * r, y + 0.28 * r], [x, y + 0.36 * r]], "#f06595");
      smile(c, x, y + 0.4 * r, r, 0.1, "#7a5a6a");
      for (const s of [-1, 1]) poly(c, [[x + s * 0.005 * r, y + 0.47 * r], [x + s * 0.075 * r, y + 0.47 * r], [x + s * 0.075 * r, y + 0.57 * r], [x + s * 0.005 * r, y + 0.57 * r]], "#ffffff", "#b9a8c4", 0.015 * r);
      eyes(c, x, y + 0.12 * r, r, 0.26, 0); blush(c, x, y, r, 0.42, 0.34, "rgba(255,120,170,.5)");
    },
    dragon(c, x, y, r) {
      const spikes = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * (1.05 + i * 0.09), ro = i % 2 ? 0.86 : 0.98; spikes.push([x + Math.cos(a) * ro * r, y + 0.05 * r + Math.sin(a) * ro * r]); }
      poly(c, [[x - 0.7 * r, y + 0.25 * r]].concat(spikes, [[x + 0.7 * r, y + 0.25 * r]]), "#2b8a3e");
      for (const s of [-1, 1]) {
        line(c, [[x + s * 0.3 * r, y - 0.45 * r], [x + s * 0.46 * r, y - 0.98 * r]], "#e0a400", 0.09 * r);
        line(c, [[x + s * 0.4 * r, y - 0.78 * r], [x + s * 0.66 * r, y - 0.88 * r]], "#e0a400", 0.07 * r);
      }
      ell(c, x, y + 0.02 * r, 0.68 * r, 0.6 * r, "#51cf66");
      ell(c, x, y + 0.34 * r, 0.44 * r, 0.27 * r, "#b2f2bb");
      for (const s of [-1, 1]) {
        circ(c, x + s * 0.14 * r, y + 0.28 * r, 0.045 * r, "#2b8a3e");
        c.beginPath(); c.moveTo(x + s * 0.4 * r, y + 0.36 * r); c.bezierCurveTo(x + s * 0.75 * r, y + 0.3 * r, x + s * 0.8 * r, y + 0.7 * r, x + s * 1.02 * r, y + 0.56 * r);
        c.strokeStyle = "#e0a400"; c.lineWidth = 0.04 * r; c.lineCap = "round"; c.stroke();
        line(c, [[x + s * 0.4 * r, y - 0.2 * r], [x + s * 0.16 * r, y - 0.16 * r]], "#2b8a3e", 0.05 * r);
      }
      eyes(c, x, y + 0.02 * r, r, 0.27, -0.04);
    },
    snake(c, x, y, r) {
      c.beginPath(); c.ellipse(x, y + 0.56 * r, 0.72 * r, 0.28 * r, 0, 0, TAU); c.strokeStyle = "#2f9e44"; c.lineWidth = 0.24 * r; c.stroke();
      c.beginPath(); c.ellipse(x, y + 0.56 * r, 0.72 * r, 0.28 * r, 0, 0, TAU); c.strokeStyle = "#69db7c"; c.lineWidth = 0.14 * r; c.stroke();
      c.beginPath(); c.moveTo(x - 0.05 * r, y + 0.3 * r); c.lineTo(x, y + 0.54 * r); c.lineTo(x - 0.07 * r, y + 0.64 * r); c.moveTo(x, y + 0.54 * r); c.lineTo(x + 0.07 * r, y + 0.64 * r);
      c.strokeStyle = "#e03131"; c.lineWidth = 0.035 * r; c.lineCap = "round"; c.stroke();
      ell(c, x, y - 0.08 * r, 0.52 * r, 0.44 * r, "#69db7c");
      for (const [dx, dy] of [[-0.18, -0.36], [0, -0.42], [0.18, -0.36]]) poly(c, [[x + dx * r, y + (dy - 0.06) * r], [x + (dx + 0.06) * r, y + dy * r], [x + dx * r, y + (dy + 0.06) * r], [x + (dx - 0.06) * r, y + dy * r]], "#2f9e44");
      for (const s of [-1, 1]) circ(c, x + s * 0.08 * r, y + 0.16 * r, 0.025 * r, "#2b8a3e");
      eyes(c, x, y - 0.1 * r, r, 0.2, 0); blush(c, x, y, r, 0.32, 0.1);
    },
    horse(c, x, y, r) {
      for (const s of [-1, 1]) poly(c, [[x + s * 0.18 * r, y - 0.62 * r], [x + s * 0.44 * r, y - 0.98 * r], [x + s * 0.46 * r, y - 0.5 * r]], "#a0522d");
      ell(c, x, y, 0.5 * r, 0.78 * r, "#b5651d");
      for (const [dx, dy, k] of [[-0.24, -0.7, 0.16], [-0.06, -0.78, 0.17], [0.12, -0.72, 0.15], [-0.36, -0.5, 0.13]]) circ(c, x + dx * r, y + dy * r, k * r, "#4a2c17");
      ell(c, x, y - 0.22 * r, 0.07 * r, 0.26 * r, "#fff8ee");
      ell(c, x, y + 0.5 * r, 0.4 * r, 0.28 * r, "#e9c29b");
      for (const s of [-1, 1]) ell(c, x + s * 0.14 * r, y + 0.5 * r, 0.05 * r, 0.08 * r, "#6b3d1f");
      eyes(c, x, y, r, 0.26, -0.08); blush(c, x, y, r, 0.38, 0.2);
    },
    goat(c, x, y, r) {
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(x + s * 0.2 * r, y - 0.5 * r); c.bezierCurveTo(x + s * 0.3 * r, y - 1.0 * r, x + s * 0.86 * r, y - 0.9 * r, x + s * 0.7 * r, y - 0.5 * r);
        c.strokeStyle = "#868e96"; c.lineWidth = 0.13 * r; c.lineCap = "round"; c.stroke();
        ell(c, x + s * 0.72 * r, y - 0.14 * r, 0.27 * r, 0.1 * r, "#f1e6d2", s * 0.25); ell(c, x + s * 0.72 * r, y - 0.14 * r, 0.16 * r, 0.05 * r, "#f8b4cf", s * 0.25);
      }
      poly(c, [[x - 0.14 * r, y + 0.56 * r], [x + 0.14 * r, y + 0.56 * r], [x, y + 0.96 * r]], "#e2d3b8");
      c.save(); ell(c, x, y, 0.54 * r, 0.66 * r, "#f8f0e3"); c.strokeStyle = "#d8c8aa"; c.lineWidth = 0.025 * r; c.stroke(); c.restore();
      for (const dx of [-0.12, 0, 0.12]) circ(c, x + dx * r, y - 0.58 * r, 0.1 * r, "#efe2c8");
      line(c, [[x - 0.08 * r, y + 0.3 * r], [x, y + 0.36 * r], [x + 0.08 * r, y + 0.3 * r]], "#6d5c44", 0.03 * r);
      line(c, [[x, y + 0.36 * r], [x, y + 0.44 * r]], "#6d5c44", 0.03 * r);
      eyes(c, x, y, r, 0.24, -0.08); blush(c, x, y, r, 0.34, 0.16);
    },
    monkey(c, x, y, r) {
      for (const s of [-1, 1]) { circ(c, x + s * 0.74 * r, y + 0.02 * r, 0.25 * r, "#8d5524"); circ(c, x + s * 0.74 * r, y + 0.02 * r, 0.15 * r, "#f5cba7"); }
      circ(c, x, y, 0.72 * r, "#8d5524");
      for (const [dx, k] of [[-0.12, 0.1], [0.02, 0.12], [0.15, 0.09]]) circ(c, x + dx * r, y - 0.72 * r, k * r, "#8d5524");
      for (const s of [-1, 1]) circ(c, x + s * 0.21 * r, y - 0.08 * r, 0.3 * r, "#f5cba7");
      ell(c, x, y + 0.26 * r, 0.46 * r, 0.32 * r, "#f5cba7");
      for (const s of [-1, 1]) circ(c, x + s * 0.05 * r, y + 0.16 * r, 0.025 * r, "#6b3d1f");
      smile(c, x, y + 0.3 * r, r, 0.16, "#6b3d1f");
      eyes(c, x, y, r, 0.21, -0.1); blush(c, x, y, r, 0.36, 0.2);
    },
    rooster(c, x, y, r) {
      for (const [dx, dy, k] of [[-0.2, -0.66, 0.16], [0, -0.78, 0.18], [0.2, -0.66, 0.16]]) circ(c, x + dx * r, y + dy * r, k * r, "#e03131");
      for (const s of [-1, 1]) poly(c, [[x + s * 0.5 * r, y + 0.1 * r], [x + s * 0.86 * r, y - 0.06 * r], [x + s * 0.78 * r, y + 0.26 * r]], "#ff922b");
      c.save(); circ(c, x, y, 0.62 * r, "#fff9db"); c.strokeStyle = "#e9d8a6"; c.lineWidth = 0.025 * r; c.stroke(); c.restore();
      ell(c, x, y + 0.46 * r, 0.09 * r, 0.14 * r, "#e03131");
      poly(c, [[x - 0.17 * r, y + 0.16 * r], [x + 0.17 * r, y + 0.16 * r], [x, y + 0.04 * r]], "#fab005");
      poly(c, [[x - 0.17 * r, y + 0.16 * r], [x + 0.17 * r, y + 0.16 * r], [x, y + 0.34 * r]], "#f08c00");
      eyes(c, x, y, r, 0.25, -0.12); blush(c, x, y, r, 0.38, 0.1);
    },
    dog(c, x, y, r) {
      ell(c, x, y + 0.04 * r, 0.66 * r, 0.6 * r, "#e0a96d");
      for (const s of [-1, 1]) ell(c, x + s * 0.66 * r, y + 0.06 * r, 0.22 * r, 0.44 * r, "#7f4f24", s * 0.3);
      ell(c, x + 0.27 * r, y - 0.06 * r, 0.17 * r, 0.16 * r, "#a86e3a");
      ell(c, x, y + 0.32 * r, 0.34 * r, 0.25 * r, "#fff4e6");
      ell(c, x, y + 0.5 * r, 0.08 * r, 0.11 * r, "#f783ac");
      ell(c, x, y + 0.21 * r, 0.11 * r, 0.075 * r, "#262626");
      smile(c, x, y + 0.31 * r, r, 0.12, "#3a2a2a");
      eyes(c, x, y, r, 0.27, -0.06); blush(c, x, y, r, 0.42, 0.2);
    },
    pig(c, x, y, r) {
      for (const s of [-1, 1]) { poly(c, [[x + s * 0.28 * r, y - 0.5 * r], [x + s * 0.7 * r, y - 0.78 * r], [x + s * 0.66 * r, y - 0.3 * r]], "#f783ac");
        poly(c, [[x + s * 0.4 * r, y - 0.5 * r], [x + s * 0.62 * r, y - 0.64 * r], [x + s * 0.6 * r, y - 0.4 * r]], "#e64980"); }
      ell(c, x, y + 0.04 * r, 0.74 * r, 0.64 * r, "#fcc2d7");
      ell(c, x, y + 0.24 * r, 0.3 * r, 0.2 * r, "#f783ac");
      for (const s of [-1, 1]) ell(c, x + s * 0.1 * r, y + 0.24 * r, 0.05 * r, 0.08 * r, "#c2255c");
      smile(c, x, y + 0.48 * r, r, 0.1, "#9c2c55");
      eyes(c, x, y, r, 0.3, -0.12); blush(c, x, y, r, 0.48, 0.16);
    },
    secret(c, x, y, r) {
      const g = c.createRadialGradient(x, y - 0.2 * r, 0.1 * r, x, y, r);
      g.addColorStop(0, "#fff3bf"); g.addColorStop(0.55, "#fcc419"); g.addColorStop(1, "#e67700");
      starPath(c, x, y, 12, 0.98 * r, 0.74 * r, -Math.PI / 2); c.fillStyle = g; c.fill();
      circ(c, x, y, 0.6 * r, "#5f3dc4");
      c.beginPath(); c.arc(x, y, 0.6 * r, 0, TAU); c.strokeStyle = "#ffe066"; c.lineWidth = 0.05 * r; c.stroke();
      const P = "#ffd43b";
      ell(c, x, y + 0.14 * r, 0.22 * r, 0.18 * r, P);
      for (const [dx, dy] of [[-0.24, -0.06], [-0.09, -0.22], [0.09, -0.22], [0.24, -0.06]]) ell(c, x + dx * r, y + dy * r, 0.075 * r, 0.095 * r, P);
      for (const [dx, dy, k] of [[-0.78, -0.78, 0.14], [0.8, -0.7, 0.11], [0.84, 0.74, 0.1]]) { starPath(c, x + dx * r, y + dy * r, 4, k * r, k * 0.3 * r, 0); c.fillStyle = "#fff9db"; c.fill(); }
    },
  };

  /* ---------- stickers (faint, like the classic paw prints) ---------- */
  const STICK = {
    paw(c, x, y, s, col) {
      ell(c, x, y + s * 0.35, s * 0.42, s * 0.34, col);
      for (const [dx, dy] of [[-0.42, -0.12], [-0.15, -0.42], [0.15, -0.42], [0.42, -0.12]]) ell(c, x + dx * s, y + dy * s, s * 0.14, s * 0.18, col);
    },
    star(c, x, y, s, col) { starPath(c, x, y, 5, s * 0.55, s * 0.24); c.fillStyle = col; c.fill(); },
    sparkle(c, x, y, s, col) { starPath(c, x, y, 4, s * 0.6, s * 0.16, 0); c.fillStyle = col; c.fill(); },
    heart(c, x, y, s, col) {
      c.beginPath(); c.moveTo(x, y + s * 0.45); c.bezierCurveTo(x - s * 0.7, y, x - s * 0.4, y - s * 0.55, x, y - s * 0.18);
      c.bezierCurveTo(x + s * 0.4, y - s * 0.55, x + s * 0.7, y, x, y + s * 0.45); c.fillStyle = col; c.fill();
    },
    flower(c, x, y, s, col) { for (let i = 0; i < 5; i++) { const a = i * TAU / 5; circ(c, x + Math.cos(a) * s * 0.28, y + Math.sin(a) * s * 0.28, s * 0.2, col); } circ(c, x, y, s * 0.13, "rgba(255,255,255,.9)"); },
    cloud(c, x, y, s, col) { for (const [dx, dy, k] of [[-0.3, 0.05, 0.22], [0, -0.1, 0.3], [0.3, 0.05, 0.22]]) circ(c, x + dx * s, y + dy * s, k * s, col); ell(c, x, y + 0.14 * s, 0.5 * s, 0.14 * s, col); },
    moon(c, x, y, s, col) { c.beginPath(); c.arc(x, y, s * 0.45, 0.35 * Math.PI, 1.65 * Math.PI); c.arc(x + s * 0.18, y - s * 0.02, s * 0.36, 1.55 * Math.PI, 0.45 * Math.PI, true); c.fillStyle = col; c.fill(); },
    leaf(c, x, y, s, col) { c.beginPath(); c.moveTo(x - s * 0.45, y + s * 0.3); c.quadraticCurveTo(x - s * 0.3, y - s * 0.5, x + s * 0.45, y - s * 0.3); c.quadraticCurveTo(x + s * 0.3, y + s * 0.5, x - s * 0.45, y + s * 0.3); c.fillStyle = col; c.fill(); },
    cheese(c, x, y, s, col) {
      poly(c, [[x - s * 0.45, y + s * 0.3], [x + s * 0.45, y + s * 0.3], [x + s * 0.45, y - s * 0.05], [x - s * 0.45, y - s * 0.3]], col);
      c.save(); c.globalCompositeOperation = "destination-out"; circ(c, x - s * 0.1, y + s * 0.08, s * 0.08, "#000"); circ(c, x + s * 0.22, y + s * 0.16, s * 0.06, "#000"); c.restore();
    },
    carrot(c, x, y, s, col) { poly(c, [[x - s * 0.16, y - s * 0.2], [x + s * 0.16, y - s * 0.2], [x, y + s * 0.5]], col); for (const dx of [-0.1, 0, 0.1]) line(c, [[x, y - s * 0.2], [x + dx * s * 2, y - s * 0.48]], col, s * 0.07); },
    pearl(c, x, y, s, col) { circ(c, x, y, s * 0.32, col); circ(c, x - s * 0.1, y - s * 0.1, s * 0.08, "rgba(255,255,255,.8)"); },
    diamond(c, x, y, s, col) { poly(c, [[x, y - s * 0.45], [x + s * 0.32, y], [x, y + s * 0.45], [x - s * 0.32, y]], col); },
    wave(c, x, y, s, col) { c.beginPath(); c.moveTo(x - s * 0.5, y); for (let i = 0; i < 4; i++) c.quadraticCurveTo(x - s * 0.5 + (i + 0.5) * s * 0.25, y + (i % 2 ? s * 0.2 : -s * 0.2), x - s * 0.5 + (i + 1) * s * 0.25, y); c.strokeStyle = col; c.lineWidth = s * 0.1; c.lineCap = "round"; c.stroke(); },
    clover(c, x, y, s, col) { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; circ(c, x + Math.cos(a) * s * 0.2, y + Math.sin(a) * s * 0.2, s * 0.19, col); } line(c, [[x, y], [x + s * 0.2, y + s * 0.5]], col, s * 0.07); },
    banana(c, x, y, s, col) { c.beginPath(); c.arc(x, y - s * 0.3, s * 0.6, 0.2 * Math.PI, 0.8 * Math.PI); c.arc(x, y - s * 0.55, s * 0.7, 0.75 * Math.PI, 0.25 * Math.PI, true); c.closePath(); c.fillStyle = col; c.fill(); },
    sun(c, x, y, s, col) { circ(c, x, y, s * 0.24, col); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; line(c, [[x + Math.cos(a) * s * 0.34, y + Math.sin(a) * s * 0.34], [x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5]], col, s * 0.07); } },
    feather(c, x, y, s, col) { ell(c, x, y, s * 0.16, s * 0.48, col, 0.5); line(c, [[x - s * 0.24, y + s * 0.44], [x + s * 0.2, y - s * 0.36]], "rgba(255,255,255,.7)", s * 0.04); },
    bone(c, x, y, s, col) { line(c, [[x - s * 0.3, y], [x + s * 0.3, y]], col, s * 0.16); for (const sx of [-1, 1]) for (const sy of [-1, 1]) circ(c, x + sx * s * 0.36, y + sy * s * 0.09, s * 0.12, col); },
    bubble(c, x, y, s, col) { c.beginPath(); c.arc(x, y, s * 0.36, 0, TAU); c.strokeStyle = col; c.lineWidth = s * 0.08; c.stroke(); circ(c, x - s * 0.12, y - s * 0.12, s * 0.07, col); },
  };

  /* ---------- backgrounds, borders, art over the frame ---------- */
  /** a small seeded generator for the fixed sprinkle positions (the look of a template never changes between draws) */
  function seeded(n) { let s = n * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
  /** base layer: the gradient (and the secret card's holographic foil) — no stickers, sprinkles or border */
  function base(id) {
    const st = STYLES[id];
    return function (c, W, H) {
      const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, st.bg[0]); g.addColorStop(1, st.bg[1]);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      if (st.effect === "holo") {
        c.save(); c.globalCompositeOperation = "screen";
        const cols = ["#ff6ec7", "#7afcff", "#feff9c", "#b28dff", "#7cffcb"];
        for (let i = 0; i < 5; i++) {
          const x0 = (i / 5) * W * 1.6 - W * 0.4, hg = c.createLinearGradient(x0, 0, x0 + W * 0.5, H);
          hg.addColorStop(0, "rgba(0,0,0,0)"); hg.addColorStop(0.5, cols[i]); hg.addColorStop(1, "rgba(0,0,0,0)");
          c.globalAlpha = 0.16; c.fillStyle = hg; c.beginPath(); c.moveTo(x0, 0); c.lineTo(x0 + W * 0.22, 0); c.lineTo(x0 + W * 0.62, H); c.lineTo(x0 + W * 0.4, H); c.closePath(); c.fill();
        }
        c.restore();
      }
    };
  }
  /** decoration layer (drawn behind the card's content, with every text box erased by lensiq-pet-card.js): sprinkles, the
   *  faint stickers in the side margins, and the border */
  function decor(id) {
    const st = STYLES[id], idx = IDS.indexOf(id), drawBorder = border(id);
    return function (c, W, H) {
      const rnd = seeded(idx + 3);
      if (st.effect === "holo") {
        for (let i = 0; i < 110; i++) { c.globalAlpha = 0.25 + rnd() * 0.6; circ(c, rnd() * W, rnd() * H, 1 + rnd() * 2.6, "#ffffff"); }
        c.globalAlpha = 1;
      } else {
        c.globalAlpha = 0.07;
        for (let i = 0; i < 46; i++) circ(c, rnd() * W, rnd() * H, 4 + rnd() * 7, st.ink);
        c.globalAlpha = 1;
      }
      // side margins only (review round 1: nothing in the header or footer text area)
      const spots = [[962, 236, 46], [48, H * 0.36, 38], [W - 48, H * 0.44, 40], [48, H * 0.64, 40], [W - 48, H * 0.6, 38], [W - 48, H * 0.78, 40], [46, H * 0.84, 36]];
      spots.forEach(([x, y, s], i) => {
        c.globalAlpha = st.effect ? 0.4 : 0.15;
        STICK[st.stickers[i % st.stickers.length]](c, x, y, s, i % 2 ? st.accent : st.ink);
      });
      c.globalAlpha = 1;
      drawBorder(c, W, H);
    };
  }
  function edgePoints(x, y, w, h, step) {
    const pts = [];
    for (let t = x; t <= x + w; t += step) pts.push([t, y, 0]);
    for (let t = y; t <= y + h; t += step) pts.push([x + w, t, 1]);
    for (let t = x + w; t >= x; t -= step) pts.push([t, y + h, 2]);
    for (let t = y + h; t >= y; t -= step) pts.push([x, t, 3]);
    return pts;
  }
  function border(id) {
    const st = STYLES[id], A = st.accent;
    return function (c, W, H) {
      const x = 24, y = 24, w = W - 48, h = H - 48;
      c.save(); c.strokeStyle = A; c.lineCap = "round"; c.lineJoin = "round";
      switch (st.border) {
        case "dotted": c.lineWidth = 11; c.setLineDash([0, 24]); rr(c, x, y, w, h, 48); c.stroke(); break;
        case "dashed": c.lineWidth = 7; c.setLineDash([30, 16]); rr(c, x, y, w, h, 48); c.stroke(); break;
        case "double": c.lineWidth = 6; rr(c, x, y, w, h, 48); c.stroke(); c.lineWidth = 3; rr(c, x + 16, y + 16, w - 32, h - 32, 36); c.stroke(); break;
        case "stitch": c.lineWidth = 5; rr(c, x, y, w, h, 48); c.stroke(); c.lineWidth = 3; c.setLineDash([14, 10]); rr(c, x + 14, y + 14, w - 28, h - 28, 38); c.stroke(); break;
        case "beads": c.lineWidth = 3; rr(c, x + 6, y + 6, w - 12, h - 12, 44); c.stroke(); c.lineWidth = 16; c.setLineDash([0, 38]); rr(c, x + 6, y + 6, w - 12, h - 12, 44); c.stroke(); break;
        case "zigzag": {
          c.lineWidth = 5; c.beginPath(); const z = 14, step = 28; let first = true;
          for (const [px, py, side] of edgePoints(x + 10, y + 10, w - 20, h - 20, step)) {
            const k = Math.round((px + py) / step) % 2 ? z : -z, ox = side % 2 ? k : 0, oy = side % 2 ? 0 : k;
            if (first) { c.moveTo(px + ox, py + oy); first = false; } else c.lineTo(px + ox, py + oy);
          }
          c.closePath(); c.stroke(); break;
        }
        case "scallop": {
          c.lineWidth = 5; const R = 18, step = 36;
          for (const [px, py, side] of edgePoints(x + 12, y + 12, w - 24, h - 24, step)) {
            const a0 = [Math.PI, -Math.PI / 2, 0, Math.PI / 2][side]; c.beginPath(); c.arc(px, py, R, a0, a0 + Math.PI); c.stroke();
          }
          break;
        }
        case "ticket": {
          c.lineWidth = 6; rr(c, x, y, w, h, 48); c.stroke();
          // corner stars on the rounded corners of the border, clear of the brand line and the footer text (review round 1)
          c.fillStyle = A; for (const [cx, cy] of [[x + 14, y + 14], [x + w - 14, y + 14], [x + 14, y + h - 14], [x + w - 14, y + h - 14]]) { starPath(c, cx, cy, 4, 18, 5, 0); c.fill(); }
          break;
        }
        case "royal": {
          const gg = c.createLinearGradient(0, 0, W, H); gg.addColorStop(0, "#fff3bf"); gg.addColorStop(0.3, "#fcc419"); gg.addColorStop(0.6, "#ffe8a3"); gg.addColorStop(1, "#e67700");
          c.strokeStyle = gg; c.lineWidth = 10; rr(c, x, y, w, h, 48); c.stroke();
          c.lineWidth = 3; rr(c, x + 18, y + 18, w - 36, h - 36, 34); c.stroke();
          c.fillStyle = gg;
          for (const [cx, cy] of [[x + 18, y + 18], [x + w - 18, y + 18], [x + 18, y + h - 18], [x + w - 18, y + h - 18]]) {
            poly(c, [[cx, cy - 30], [cx + 16, cy], [cx, cy + 30], [cx - 16, cy]], null); c.fill(); circ(c, cx, cy, 8, "#5f3dc4");
          }
          for (const [cx, cy] of [[W / 2, y], [W / 2, y + h]]) { starPath(c, cx, cy, 8, 26, 11); c.fillStyle = gg; c.fill(); }
          break;
        }
        default: c.lineWidth = 6; rr(c, x, y, w, h, 48); c.stroke();
      }
      c.restore();
    };
  }
  /** the round medallion with the template's animal */
  function medallion(c, id, cx, cy, R) {
    const st = STYLES[id];
    c.save();
    c.shadowColor = "rgba(0,0,0,.22)"; c.shadowBlur = R * 0.18; c.shadowOffsetY = R * 0.05;
    circ(c, cx, cy, R, st.chip); c.restore();
    c.save();
    const g = c.createRadialGradient(cx, cy - R * 0.3, R * 0.1, cx, cy, R * 0.9); g.addColorStop(0, st.effect ? "#4b2a8a" : "#ffffff"); g.addColorStop(1, st.bg[1]);
    circ(c, cx, cy, R * 0.9, g);
    c.beginPath(); c.arc(cx, cy, R * 0.95, 0, TAU); c.strokeStyle = st.accent; c.lineWidth = R * 0.07; c.stroke();
    c.beginPath(); c.arc(cx, cy, R * 0.86, 0, TAU); c.clip();
    ANIMALS[id](c, cx, cy + R * 0.08, R * (id === "secret" ? 0.78 : 0.62));
    c.restore();
  }
  function overFrame(id, label) {
    const st = STYLES[id];
    return function (c, fx, fy, fw, fh, env) {
      const font = env.font, story = env.story, R = story ? 132 : 104, mx = fx + fw - R - 18, my = fy + fh - R - 18;
      medallion(c, id, mx, my, R);
      const out = { ribbon: null, medallion: { x: mx - R, y: my - R, w: 2 * R, h: 2 * R } };
      if (!label) return out;
      if (st.effect) { // the secret card: a big gold ribbon along the BOTTOM of the picture (review round 1: never over the pet's head)
        let fs = story ? 54 : 46; c.font = `800 ${fs}px ${font}`;
        const room = fw - 2 * R - 18 - 26 - 70 - 26; // from the left edge (+ point) to the medallion, with the sparkle
        while (c.measureText(label).width + 120 > room && fs > 26) { fs -= 2; c.font = `800 ${fs}px ${font}`; }
        const tw = c.measureText(label).width, bw = tw + 120, bh = fs + 40, bx = fx + 22 + 26, by = fy + fh - bh - 24;
        const gg = c.createLinearGradient(bx, by, bx + bw, by + bh); gg.addColorStop(0, "#fff3bf"); gg.addColorStop(0.45, "#fcc419"); gg.addColorStop(1, "#f08c00");
        c.save(); c.shadowColor = "rgba(255,209,102,.7)"; c.shadowBlur = 26;
        poly(c, [[bx - 26, by + bh / 2], [bx, by], [bx + bw, by], [bx + bw + 26, by + bh / 2], [bx + bw, by + bh], [bx, by + bh]], gg); c.restore();
        c.fillStyle = "#2b1055"; c.textBaseline = "middle"; c.textAlign = "center"; c.fillText(label, bx + bw / 2, by + bh / 2 + 2);
        c.textAlign = "left"; c.textBaseline = "top";
        starPath(c, bx + bw + 58, by + bh / 2, 4, 22, 6, 0); c.fillStyle = "#fff9db"; c.fill();
        starPath(c, bx + bw * 0.5, by - 18, 4, 14, 4, 0); c.fill();
        out.ribbon = { x: bx - 26, y: by, w: bw + 52, h: bh };
        return out;
      }
      let fs = story ? 38 : 32; c.font = `700 ${fs}px ${font}`;
      while (c.measureText(label).width > fw - 2 * R - 120 && fs > 20) { fs -= 2; c.font = `700 ${fs}px ${font}`; }
      const tw = c.measureText(label).width, bw = tw + 48, bh = fs + 26, bx = fx + 18, by = fy + 18;
      c.save(); c.shadowColor = "rgba(0,0,0,.18)"; c.shadowBlur = 12; rr(c, bx, by, bw, bh, bh / 2); c.fillStyle = st.accent; c.fill(); c.restore();
      c.fillStyle = id === "horse" ? "#1b2a4a" : "#ffffff"; c.textBaseline = "middle"; c.fillText(label, bx + 24, by + bh / 2 + 1); c.textBaseline = "top";
      out.ribbon = { x: bx, y: by, w: bw, h: bh };
      return out;
    };
  }
  function after(id) {
    const st = STYLES[id];
    return function (c, W, H) {
      // one full-colour sticker on the top-right corner (the brand line sits on the left)
      c.save(); c.translate(W - 104, 102); c.rotate(0.18);
      circ(c, 0, 0, 44, st.chip); c.beginPath(); c.arc(0, 0, 44, 0, TAU); c.strokeStyle = st.accent; c.lineWidth = 4; c.stroke();
      STICK[st.stickers[0]](c, 0, 2, 52, st.accent);
      c.restore();
      if (st.effect) { // sparkles along the edges
        const rnd = seeded(77);
        for (let i = 0; i < 26; i++) {
          // on the gold border only (never over the footer text): within 14 px of the edge line
          const side = i % 4, t = rnd(), x = side === 0 || side === 2 ? 40 + t * (W - 80) : (side === 1 ? W - 22 - rnd() * 8 : 22 + rnd() * 8),
            y = side === 1 || side === 3 ? 40 + t * (H - 80) : (side === 2 ? H - 22 - rnd() * 8 : 22 + rnd() * 8), s = 6 + rnd() * 9;
          c.globalAlpha = 0.6 + rnd() * 0.4; starPath(c, x, y, 4, s, s * 0.25, 0); c.fillStyle = i % 3 ? "#fff9db" : "#ffd166"; c.fill();
        }
        c.globalAlpha = 1;
      }
    };
  }
  function skin(id, label) {
    const k = STYLES[id] ? id : "rat";
    return { id: k, theme: STYLES[k], base: base(k), decor: decor(k), overFrame: overFrame(k, label || ""), after: after(k) };
  }
  function drawCard(canvas, model, opts) {
    const o = Object.assign({}, opts || {}), id = o.template || model.template;
    o.skin = skin(id, o.label);
    return root.LQPetCard.draw(canvas, model, o);
  }
  /** one collection slot: found = colours + animal; missing = grey silhouette + "?"; secret slot keeps its star outline */
  function drawSlot(canvas, id, opts) {
    const o = opts || {}, S = canvas.width = canvas.height = o.size || 160, c = canvas.getContext("2d"), st = STYLES[id];
    c.clearRect(0, 0, S, S);
    if (o.found) {
      const g = c.createLinearGradient(0, 0, S, S); g.addColorStop(0, st.bg[0]); g.addColorStop(1, st.bg[1]);
      rr(c, 3, 3, S - 6, S - 6, 22); c.fillStyle = g; c.fill(); c.strokeStyle = st.accent; c.lineWidth = 5; c.stroke();
      medallion(c, id, S / 2, S / 2, S * 0.36);
      return;
    }
    rr(c, 3, 3, S - 6, S - 6, 22); c.fillStyle = "#e9ecef"; c.fill(); c.strokeStyle = "#ced4da"; c.lineWidth = 4; c.setLineDash(id === "secret" ? [10, 8] : []); c.stroke(); c.setLineDash([]);
    const t = root.document.createElement("canvas"); t.width = t.height = S; const x = t.getContext("2d");
    if (id === "secret") { starPath(x, S / 2, S / 2, 12, S * 0.34, S * 0.25); x.fillStyle = "#000"; x.fill(); }
    else ANIMALS[id](x, S / 2, S / 2 + S * 0.03, S * 0.3);
    x.globalCompositeOperation = "source-in"; x.fillStyle = "#adb5bd"; x.fillRect(0, 0, S, S);
    c.drawImage(t, 0, 0);
    c.fillStyle = "#495057"; c.font = `800 ${Math.round(S * 0.24)}px sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("?", S / 2, S / 2 + S * 0.04);
  }

  const api = { STYLES, ANIMALS, STICKERS: STICK, skin, drawCard, drawSlot, medallion };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LQPetZodiacArt = api;
})(typeof window !== "undefined" ? window : globalThis);
