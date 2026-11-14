/* lensiq-tryon-core.js — Try-On MVP, pure geometry + drawing helpers for tryon.html (docs/TRYON-DESIGN.md T4 subset).
 * Browser: window.LQTryOn · Node: module.exports (tests/unit/tryon-core.test.js).
 *
 * Everything runs on the device. Face-anchored items (glasses, hats, earrings, necklaces) attach to the MediaPipe Face
 * Landmarker 478-point mesh (Face Mesh V2, Apache-2.0, vendored without the facial-movement model:
 * vendor/models/face-landmarker/README.txt). Only these points are read: 33 / 263 (outer eye corners), 127 / 356 (temples),
 * 234 / 454 (face sides, at the ears), 10 (forehead), 152 (chin). No expression, identity or emotion is computed.
 * Pose-anchored tops use studio-core.js (selfie mask -> measureShoulders -> personTargets -> templateWarpTo), the same
 * per-point garment fit as the studio (item 24).
 *
 *   CATEGORIES               [{id, anchor}] — the same list as backend/src/tryon.js (no underwear / swimwear values)
 *   faceAnchors(pts, W, H)   -> {eyeL, eyeR, mid, roll, templeW, faceW, faceH, forehead, chin, earL, earR, down} | null
 *   place(cat, A, {aspect})  -> {cat, x, y, w, h, rot} (glasses: centre; hats: bottom centre; necklaces: top centre)
 *                               earrings -> [left, right] (top centre of each)
 *   faceForStudio(A)         -> {cx, chinX, chinY, fw, eyeY} for studio-core
 *   MARK / stamp(ctx, W, H)  the preview mark burned into every snapshot
 *   DEMO + drawDemo(kind, colour) built-in drawn demo items (no photo of anything or anyone)
 */
(function (root) {
  "use strict";
  const CATEGORIES = [
    { id: "glasses", anchor: "face" }, { id: "hats", anchor: "face" }, { id: "earrings", anchor: "face" }, { id: "necklaces", anchor: "face" },
    { id: "tops", anchor: "pose" }, { id: "outerwear", anchor: "pose" }, { id: "dresses", anchor: "pose" }, { id: "skirts", anchor: "pose" },
    { id: "trousers", anchor: "pose" }
  ];
  const LM = { eyeL: 33, eyeR: 263, templeL: 127, templeR: 356, sideL: 234, sideR: 454, forehead: 10, chin: 152 };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function faceAnchors(pts, W, H) {
    if (!pts || pts.length < 468) return null;
    const P = i => ({ x: pts[i].x * W, y: pts[i].y * H });
    const eyeL = P(LM.eyeL), eyeR = P(LM.eyeR), mid = { x: (eyeL.x + eyeR.x) / 2, y: (eyeL.y + eyeR.y) / 2 };
    const roll = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x), forehead = P(LM.forehead), chin = P(LM.chin);
    return {
      eyeL, eyeR, mid, roll, forehead, chin, earL: P(LM.sideL), earR: P(LM.sideR),
      templeW: dist(P(LM.templeL), P(LM.templeR)), faceW: dist(P(LM.sideL), P(LM.sideR)), faceH: dist(forehead, chin),
      down: { x: -Math.sin(roll), y: Math.cos(roll) }
    };
  }

  /** Placement of one item on the face; aspect = item height / width (the item's own image or drawing). */
  function place(cat, A, { aspect = null } = {}) {
    if (!A) return null;
    const d = A.down, at = (p, k) => ({ x: p.x + d.x * k * A.faceH, y: p.y + d.y * k * A.faceH });
    if (cat === "glasses") { const w = A.templeW * 1.08; return { cat, x: A.mid.x, y: A.mid.y, w, h: w * (aspect || .36), rot: A.roll }; }
    if (cat === "hats") { const w = A.faceW * 1.45, p = at(A.forehead, -.04); return { cat, x: p.x, y: p.y, w, h: w * (aspect || .7), rot: A.roll }; }
    if (cat === "earrings") {
      const w = A.faceW * .11, h = w * (aspect || 1.8);
      return [A.earL, A.earR].map(e => { const p = at(e, .14); return { cat, x: p.x, y: p.y, w, h, rot: A.roll }; });
    }
    if (cat === "necklaces") { const w = A.faceW * 1.1, p = at(A.chin, .3); return { cat, x: p.x, y: p.y, w, h: w * (aspect || .5), rot: A.roll }; }
    return null;
  }

  /** face object for studio-core (measureShoulders / personTargets) */
  const faceForStudio = A => ({ cx: A.mid.x, chinX: A.chin.x, chinY: A.chin.y, fw: A.faceW, eyeY: A.mid.y, detected: true });

  const MARK = "ภาพจำลอง · Virtual try-on preview · 虚拟试穿预览";
  /** Burns the preview mark into a snapshot: a dark band along the bottom edge with the mark in three languages. */
  function stamp(ctx, W, H) {
    const fs = Math.max(12, Math.round(Math.min(W, H) / 28)), pad = Math.round(fs * .5);
    ctx.save && ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(0, H - fs - pad * 2, W, fs + pad * 2);
    ctx.font = `600 ${fs}px "Noto Sans Thai", system-ui, sans-serif`;
    ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.textAlign = "center";
    ctx.fillText(MARK, W / 2, H - pad - fs / 2, W - pad * 2);
    ctx.restore && ctx.restore();
  }

  /* ---------- built-in demo items: simple drawings (no photo), used when no shop catalogue is reachable ---------- */
  const DEMO = [
    { id: "demo-glasses", category: "glasses", draw: "glasses", colour: "#1f2937", name: { th: "แว่นกรอบดำ (ตัวอย่าง)", en: "Black frames (sample)", zh: "黑框眼镜（示例）" } },
    { id: "demo-sun", category: "glasses", draw: "sunglasses", colour: "#7c2d12", name: { th: "แว่นกันแดด (ตัวอย่าง)", en: "Sunglasses (sample)", zh: "太阳镜（示例）" } },
    { id: "demo-hat", category: "hats", draw: "hat", colour: "#b45309", name: { th: "หมวกปีก (ตัวอย่าง)", en: "Brim hat (sample)", zh: "宽檐帽（示例）" } },
    { id: "demo-earrings", category: "earrings", draw: "earring", colour: "#d4af37", name: { th: "ต่างหูห่วง (ตัวอย่าง)", en: "Hoop earrings (sample)", zh: "圈形耳环（示例）" } },
    { id: "demo-tee", category: "tops", draw: "tee", colour: "#2563eb", name: { th: "เสื้อยืด (ตัวอย่าง)", en: "T-shirt (sample)", zh: "T恤（示例）" } }
  ];
  const SIZE = { glasses: [400, 144], sunglasses: [400, 144], hat: [400, 280], earring: [60, 108], tee: [400, 420] };
  /** Draws a demo item on a new canvas (browser only). Returns the canvas; anchors for tops come from SC.templateAnchors. */
  function drawDemo(kind, colour) {
    const [w, h] = SIZE[kind] || [200, 200], c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d"); x.fillStyle = colour; x.strokeStyle = colour; x.lineJoin = "round"; x.lineCap = "round";
    if (kind === "glasses" || kind === "sunglasses") {
      x.lineWidth = 12;
      for (const cx of [105, 295]) {
        x.beginPath(); x.roundRect(cx - 80, 22, 160, 100, 34); x.stroke();
        if (kind === "sunglasses") { x.globalAlpha = .75; x.fill(); x.globalAlpha = 1; }
      }
      x.beginPath(); x.moveTo(185, 58); x.quadraticCurveTo(200, 42, 215, 58); x.stroke();
      x.beginPath(); x.moveTo(25, 50); x.lineTo(6, 40); x.moveTo(375, 50); x.lineTo(394, 40); x.stroke();
    } else if (kind === "hat") {
      x.beginPath(); x.ellipse(200, 240, 196, 36, 0, 0, 7); x.fill();
      x.beginPath(); x.moveTo(90, 240); x.bezierCurveTo(90, 40, 310, 40, 310, 240); x.fill();
      x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(92, 196, 216, 26);
    } else if (kind === "earring") {
      x.lineWidth = 7; x.beginPath(); x.arc(30, 66, 24, 0, 7); x.stroke(); x.beginPath(); x.moveTo(30, 4); x.lineTo(30, 42); x.stroke();
    } else if (kind === "tee") {
      x.beginPath(); x.moveTo(150, 30); x.quadraticCurveTo(200, 70, 250, 30); x.lineTo(330, 52); x.lineTo(396, 150); x.lineTo(340, 178); x.lineTo(320, 150);
      x.lineTo(320, 412); x.lineTo(80, 412); x.lineTo(80, 150); x.lineTo(60, 178); x.lineTo(4, 150); x.lineTo(70, 52); x.closePath(); x.fill();
    }
    return c;
  }

  /** categories this page can draw today (skirts / trousers need a lower-body anchor: not built, so not listed) */
  const DRAWABLE = ["glasses", "hats", "earrings", "necklaces", "tops", "outerwear", "dresses"];
  /** anchors of the ONE face in the picture; with no face or more than one face nothing is drawn (null) */
  const anchorsFor = (faces, W, H) => (Array.isArray(faces) && faces.length === 1 ? faceAnchors(faces[0], W, H) : null);
  /** back-office form: the status to send — the chosen one, or undefined when empty or unchanged (never "") */
  const formStatus = (selected, current) => (selected && selected !== current ? String(selected) : undefined);
  /** "1,200.50" baht -> 120050 satang; "" -> null; anything else (letters, minus, 3 decimals, symbols) -> NaN */
  function parseBaht(v) {
    const t = String(v == null ? "" : v).trim().replace(/,/g, "");
    if (!t) return null;
    return /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : NaN;
  }

  const api = { CATEGORIES, DRAWABLE, LM, faceAnchors, anchorsFor, place, faceForStudio, formStatus, parseBaht, MARK, stamp, DEMO, drawDemo };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.LQTryOn = api;
})(typeof window !== "undefined" ? window : globalThis);
