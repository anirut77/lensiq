/* lensiq-tryon-core.js — Try-On MVP, pure geometry + drawing helpers for tryon.html (docs/TRYON-DESIGN.md T4 subset).
 * Browser: window.LQTryOn · Node: module.exports (tests/unit/tryon-core.test.js).
 *
 * Everything runs on the device. Face-anchored items (glasses, hats, earrings, necklaces) attach to the MediaPipe Face
 * Landmarker 478-point mesh (Face Mesh V2, Apache-2.0, vendored without the facial-movement model:
 * vendor/models/face-landmarker/README.txt). Only these points are read: 33 / 263 (outer eye corners), 127 / 356 (temples),
 * 234 / 454 (face sides, at the ears), 10 (forehead), 152 (chin). No expression, identity or emotion is computed.
 * Pose-anchored garments (owner decision 2026-11-18; front view, one person): MediaPipe Pose Landmarker lite (BlazePose
 * GHUM 3D, Apache-2.0, vendor/models/pose-landmarker/README.txt) gives 33 joint points; bodyAnchors turns the shoulders,
 * hips, knees and ankles into the body OUTLINE points a garment hangs on (neck base, shoulder tips, waist, hip outline,
 * crotch, knee and ankle outline), garmentTargets maps a garment's own anchor points onto them per category (tops /
 * outerwear: hem on the hip line; dresses / skirts: hem on the knee line; trousers: waist, crotch, ankles), and
 * studio-core templateWarpTo + warpRGBA warps the cut-out. Only positions are read: no identity, no size in centimetres,
 * no depth. When the pose engine cannot run, tops fall back to the selfie-mask fit of the studio (item 24).
 * Measured on a synthetic set only (tests/unit/fixtures/tryon-pose-set.js, docs/TRYON-POSE-RESULTS.md).
 *
 *   CATEGORIES               [{id, anchor}] — the same list as backend/src/tryon.js (no underwear / swimwear values)
 *   faceAnchors(pts, W, H)   -> {eyeL, eyeR, mid, roll, templeW, faceW, faceH, forehead, chin, earL, earR, down} | null
 *   place(cat, A, {aspect})  -> {cat, x, y, w, h, rot} (glasses: centre; hats: bottom centre; necklaces: top centre)
 *                               earrings -> [left, right] (top centre of each)
 *   faceForStudio(A)         -> {cx, chinX, chinY, fw, eyeY} for studio-core
 *   MARK / stamp(ctx, W, H)  the preview mark burned into every snapshot
 *   DEMO + drawDemo(kind, colour) built-in drawn demo items (no photo of anything or anyone)
 *   poseFor(poses)           the ONE person's 33 pose points, or null with no person or more than one
 *   bodyAnchors(lms, W, H)   -> {ok, B, across, down, has, neck, shoulderL/R, waistL/R, hipL/R, crotch, knee*, ankle*}
 *                               or {ok: false, reason: "shoulders" | "hips" | "side"}; L / R = image left / right
 *   missingFor(cat, body)    first body part the category needs that is not in the picture (POSE_NEEDS), or null
 *   garmentTargets(cat, body, anchors) -> {ok, targets: [{k, x, y}] in the order of anchors} | {ok: false, reason}
 *   garmentAnchorsFromAlpha(cat, alpha, w, h, SC) anchor points of a cut-out (tops etc.: SC.templateAnchors)
 *   demoGarment(kind) / rasterGarment(g) drawn demo garments as polygons (browser and Node) and their RGBA pixels
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
    { id: "demo-tee", category: "tops", draw: "tee", colour: "#2563eb", name: { th: "เสื้อยืด (ตัวอย่าง)", en: "T-shirt (sample)", zh: "T恤（示例）" } },
    { id: "demo-jacket", category: "outerwear", draw: "jacket", colour: "#047857", name: { th: "แจ็กเก็ต (ตัวอย่าง)", en: "Jacket (sample)", zh: "夹克（示例）" } },
    { id: "demo-dress", category: "dresses", draw: "dress", colour: "#be185d", name: { th: "ชุดเดรส (ตัวอย่าง)", en: "Dress (sample)", zh: "连衣裙（示例）" } },
    { id: "demo-skirt", category: "skirts", draw: "skirt", colour: "#7c3aed", name: { th: "กระโปรง (ตัวอย่าง)", en: "Skirt (sample)", zh: "半身裙（示例）" } },
    { id: "demo-trousers", category: "trousers", draw: "trousers", colour: "#1e3a8a", name: { th: "กางเกงขายาว (ตัวอย่าง)", en: "Trousers (sample)", zh: "长裤（示例）" } }
  ];
  const SIZE = { glasses: [400, 144], sunglasses: [400, 144], hat: [400, 280], earring: [60, 108] };
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
    } else if (GARMENTS[kind]) {
      const g = demoGarment(kind);
      c.width = g.w; c.height = g.h;
      x.fillStyle = colour;
      for (const poly of g.polys) { x.beginPath(); poly.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath(); x.fill(); }
      // a little shading so the drape direction reads (inside the shape only)
      x.globalCompositeOperation = "source-atop"; x.fillStyle = "rgba(0,0,0,.12)";
      for (const [x0, y0, ww, hh] of g.shade || []) x.fillRect(x0, y0, ww, hh);
      x.globalCompositeOperation = "source-over";
    }
    return c;
  }

  /* ---------- pose-anchored garments (front view, one person) ---------- */
  /** demo garment shapes: polygons in the garment's own pixels; skirts / trousers carry their anchors by construction */
  const GARMENTS = {
    tee: { category: "tops", w: 400, h: 420, polys: [[[150, 30], [175, 44], [200, 50], [225, 44], [250, 30], [330, 52], [396, 150], [340, 178], [320, 150],
      [320, 412], [80, 412], [80, 150], [60, 178], [4, 150], [70, 52]]], shade: [[190, 60, 20, 352]] },
    jacket: { category: "outerwear", w: 420, h: 470, polys: [[[160, 26], [185, 70], [210, 92], [235, 70], [260, 26], [345, 50], [405, 250], [362, 262],
      [335, 160], [335, 460], [85, 460], [85, 160], [58, 262], [15, 250], [75, 50]]], shade: [[206, 92, 8, 368], [85, 300, 250, 10]] },
    dress: { category: "dresses", w: 420, h: 640, polys: [[[160, 28], [185, 46], [210, 52], [235, 46], [260, 28], [335, 50], [372, 130], [338, 146],
      [322, 120], [318, 250], [395, 630], [25, 630], [102, 250], [98, 120], [82, 146], [48, 130], [85, 50]]], shade: [[98, 240, 224, 12]] },
    skirt: { category: "skirts", w: 400, h: 310, polys: [[[100, 10], [300, 10], [360, 300], [40, 300]]], shade: [[100, 10, 200, 14]],
      anchors: [{ k: "wl", x: 100, y: 10 }, { k: "wr", x: 300, y: 10 }, { k: "hl", x: 40, y: 300 }, { k: "hr", x: 360, y: 300 }] },
    // trousers: the inseams open from the crotch in a short curve, then run almost straight down to the hems
    trousers: { category: "trousers", w: 320, h: 610, polys: [[[60, 10], [260, 10], [280, 600], [185, 600], [175, 200], [166, 168], [160, 152],
      [154, 168], [145, 200], [135, 600], [40, 600]]], shade: [[60, 10, 200, 14]],
      anchors: [{ k: "wl", x: 60, y: 10 }, { k: "wr", x: 260, y: 10 }, { k: "c", x: 160, y: 152 }, { k: "hlo", x: 40, y: 600 }, { k: "hli", x: 135, y: 600 },
        { k: "hri", x: 185, y: 600 }, { k: "hro", x: 280, y: 600 }] }
  };
  /** {kind, category, w, h, polys, shade, anchors?} of a demo garment, or null */
  function demoGarment(kind) {
    const g = GARMENTS[kind];
    return g ? { kind, category: g.category, w: g.w, h: g.h, polys: g.polys, shade: g.shade, anchors: g.anchors ? g.anchors.map(a => ({ ...a })) : null } : null;
  }
  const inPoly = (poly, x, y) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  /** RGBA pixels (Uint8ClampedArray) of a demo garment, 2 x 2 samples per pixel; colour "#rrggbb" (default mid grey) */
  function rasterGarment(g, colour = "#808080") {
    const out = new Uint8ClampedArray(g.w * g.h * 4), n = parseInt(colour.slice(1), 16), rgb = [n >> 16 & 255, n >> 8 & 255, n & 255];
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      let k = 0;
      for (const [sx, sy] of [[.25, .25], [.75, .25], [.25, .75], [.75, .75]]) if (g.polys.some(p => inPoly(p, x + sx, y + sy))) k++;
      if (!k) continue;
      const o = (y * g.w + x) * 4; out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = Math.round(k * 63.75);
    }
    return out;
  }

  const POSE_NEEDS = { tops: ["shoulders", "hips"], outerwear: ["shoulders", "hips"], dresses: ["shoulders", "hips", "knees"],
    skirts: ["shoulders", "hips", "knees"], trousers: ["shoulders", "hips", "knees", "ankles"] };
  const POSE_CATS = Object.keys(POSE_NEEDS);
  /** the ONE person's points; nothing with no person or with more than one (the model card: single person only) */
  const poseFor = poses => (Array.isArray(poses) && poses.length === 1 && Array.isArray(poses[0]) ? poses[0] : null);
  /**
   * Body outline points from the 33 pose joints (front view). Offsets in units of the shoulder-joint distance s and the
   * torso length T (shoulder centre to hip centre), fixed before measuring (mid-points of adult front-view proportions):
   * neck base 0.06 s above the shoulder line; shoulder tips 0.16 s out and 0.04 s up from each joint; hip outline half-width
   * 1.55 x half the hip-joint distance; natural waist at 0.64 T, half-width 0.82 x the hip outline; crotch 0.35 s below the
   * hip centre; knee outline 0.11 s out / 0.09 s in, ankle outline 0.06 s out / 0.05 s in from the joint.
   * A point counts when its visibility is at least 0.5 and it lies in the picture. Left / right = image left / right
   * (sorted across the body), so a mirrored selfie works the same. Side view (s / T < 0.45): refused.
   */
  function bodyAnchors(lms, W, H) {
    if (!Array.isArray(lms) || lms.length < 29) return null;
    const P = i => {
      const p = lms[i]; if (!p) return { ok: false };
      const x = p.x * W, y = p.y * H, v = p.visibility == null ? 1 : p.visibility;
      return { x, y, ok: v >= .5 && x >= -.01 * W && x <= 1.01 * W && y >= -.01 * H && y <= 1.01 * H };
    };
    const s1 = P(11), s2 = P(12), h1 = P(23), h2 = P(24);
    if (!s1.ok || !s2.ok) return { ok: false, reason: "shoulders" };
    if (!h1.ok || !h2.ok) return { ok: false, reason: "hips" };
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), Sm = mid(s1, s2), Hm = mid(h1, h2);
    const T = Math.hypot(Hm.x - Sm.x, Hm.y - Sm.y);
    if (T < 4) return { ok: false, reason: "hips" };
    const down = { x: (Hm.x - Sm.x) / T, y: (Hm.y - Sm.y) / T }, across = { x: down.y, y: -down.x };
    const pr = p => (p.x - Hm.x) * across.x + (p.y - Hm.y) * across.y, lr = (a, b) => (pr(a) <= pr(b) ? [a, b] : [b, a]);
    const at = (p, a, d) => ({ x: p.x + across.x * a + down.x * d, y: p.y + across.y * a + down.y * d });
    const [sL, sR] = lr(s1, s2), [hL, hR] = lr(h1, h2), s = pr(sR) - pr(sL), wh = pr(hR) - pr(hL);
    if (s / T < .45) return { ok: false, reason: "side" };
    const hipHalf = wh / 2 * 1.55, wc = at(Sm, 0, .64 * T), wHalf = .82 * hipHalf;
    const A = {
      ok: true, s, T, across, down, neck: at(Sm, 0, -.06 * s), shoulderL: at(sL, -.16 * s, -.04 * s), shoulderR: at(sR, .16 * s, -.04 * s),
      waistL: at(wc, -wHalf, 0), waistR: at(wc, wHalf, 0), hipL: at(hL, -.55 * wh / 2, 0), hipR: at(hR, .55 * wh / 2, 0), crotch: at(Hm, 0, .35 * s)
    };
    A.B = Math.hypot(A.shoulderR.x - A.shoulderL.x, A.shoulderR.y - A.shoulderL.y);
    const k1 = P(25), k2 = P(26), a1 = P(27), a2 = P(28);
    A.has = { shoulders: true, hips: true, knees: k1.ok && k2.ok, ankles: k1.ok && k2.ok && a1.ok && a2.ok };
    if (A.has.knees) {
      const [kL, kR] = lr(k1, k2);
      Object.assign(A, { kneeLo: at(kL, -.11 * s, 0), kneeLi: at(kL, .09 * s, 0), kneeRi: at(kR, -.09 * s, 0), kneeRo: at(kR, .11 * s, 0) });
    }
    if (A.has.ankles) {
      const [aL, aR] = lr(a1, a2);
      Object.assign(A, { ankleLo: at(aL, -.06 * s, 0), ankleLi: at(aL, .05 * s, 0), ankleRi: at(aR, -.05 * s, 0), ankleRo: at(aR, .06 * s, 0) });
    }
    return A;
  }
  /** first body part a category needs that the picture does not show, or null */
  const missingFor = (cat, body) => ((POSE_NEEDS[cat] || []).find(n => !(body && body.has && body.has[n])) || null);
  /**
   * Garment anchor points (in the garment picture) -> target points on the body, same order as anchors.
   *  tops / outerwear: neck, collar (cl / cr, from their canon u / v), shoulder tips l / r, hem hl / hr on the hip line,
   *    hem half-width = max(hip outline, B / 2 x the garment's hem / shoulder width)  (a boxy top keeps its width)
   *  dresses: as tops, hem on the knee line, half-width = max(knee outline, hip outline, B / 2 x hem / shoulder width)
   *  skirts: wl / wr on the waist outline; hem on the knee line, half-width = max(knee, hip, waist half x hem / waist width)
   *  trousers: wl / wr waist, c crotch, hlo / hli / hri / hro the ankle outline points
   * The length shown is the category's line (hip, knee, ankle), not the item's real length.
   */
  function garmentTargets(cat, body, anchors) {
    if (!body || !body.ok) return { ok: false, reason: (body && body.reason) || "none" };
    if (!POSE_NEEDS[cat]) return { ok: false, reason: "category" };
    const miss = missingFor(cat, body);
    if (miss) return { ok: false, reason: miss };
    if (!Array.isArray(anchors) || anchors.length < 3) return { ok: false, reason: "anchors" };
    const ac = body.across, dn = body.down, B = body.B, by = k => anchors.find(a => a.k === k);
    const at = (p, a, d) => ({ x: p.x + ac.x * a + dn.x * d, y: p.y + ac.y * a + dn.y * d });
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), len = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const half = (l, r) => Math.abs((r.x - l.x) * ac.x + (r.y - l.y) * ac.y) / 2;
    const map = {};
    if (cat === "tops" || cat === "outerwear" || cat === "dresses") {
      const gl = by("l"), gr = by("r"), hl = by("hl"), hr = by("hr");
      if (!gl || !gr || !hl || !hr || len(gl, gr) < 2) return { ok: false, reason: "anchors" };
      const ratio = len(hl, hr) / len(gl, gr);
      map.neck = body.neck; map.l = body.shoulderL; map.r = body.shoulderR;
      for (const k of ["cl", "cr"]) { const a = by(k); if (a) map[k] = at(body.neck, (a.u || 0) / 2.9 * B, ((a.v || 0) + .05) / 2.9 * B); }
      let c, h;
      if (cat === "dresses") { c = mid(body.kneeLo, body.kneeRo); h = Math.max(half(body.kneeLo, body.kneeRo), half(body.hipL, body.hipR), B / 2 * ratio); }
      else { c = mid(body.hipL, body.hipR); h = Math.max(half(body.hipL, body.hipR), B / 2 * ratio); }
      map.hl = at(c, -h, 0); map.hr = at(c, h, 0);
    } else if (cat === "skirts") {
      const wl = by("wl"), wr = by("wr"), hl = by("hl"), hr = by("hr");
      if (!wl || !wr || !hl || !hr || len(wl, wr) < 2) return { ok: false, reason: "anchors" };
      const c = mid(body.kneeLo, body.kneeRo);
      const h = Math.max(half(body.kneeLo, body.kneeRo), half(body.hipL, body.hipR), half(body.waistL, body.waistR) * len(hl, hr) / len(wl, wr));
      Object.assign(map, { wl: body.waistL, wr: body.waistR, hl: at(c, -h, 0), hr: at(c, h, 0) });
    } else {
      Object.assign(map, { wl: body.waistL, wr: body.waistR, c: body.crotch, hlo: body.ankleLo, hli: body.ankleLi, hri: body.ankleRi, hro: body.ankleRo });
      for (const k of ["wl", "wr", "c", "hlo", "hli", "hri", "hro"]) if (!by(k)) return { ok: false, reason: "anchors" };
    }
    const targets = [];
    for (const a of anchors) { const t = map[a.k]; if (!t) return { ok: false, reason: "anchors" }; targets.push({ k: a.k, x: t.x, y: t.y }); }
    return { ok: true, targets };
  }
  /**
   * Anchor points of a garment cut-out from its alpha (0..1, w x h). tops / outerwear / dresses: SC.templateAnchors.
   * skirts: waistband ends (top row) and hem ends (bottom row). trousers: waistband ends, the four hem edges of the two legs
   * (bottom row) and the crotch (where the inner edges of the legs, followed upwards as straight lines, meet). null when the
   * cut-out has no such shape.
   */
  function garmentAnchorsFromAlpha(cat, alpha, w, h, SC) {
    if (cat === "tops" || cat === "outerwear" || cat === "dresses") return SC && SC.templateAnchors ? SC.templateAnchors(alpha, w, h) : null;
    const on = (x, y) => alpha[y * w + x] > .5;
    const runs = y => { const r = []; let a = -1; for (let x = 0; x <= w; x++) { const v = x < w && on(x, y); if (v && a < 0) a = x; if (!v && a >= 0) { r.push([a, x - 1]); a = -1; } } return r; };
    let y0 = -1, y1 = -1;
    for (let y = 0; y < h; y++) if (runs(y).length) { if (y0 < 0) y0 = y; y1 = y; }
    if (y0 < 0 || y1 - y0 < 8) return null;
    const top = runs(y0), bot = runs(y1), wl = { k: "wl", x: top[0][0], y: y0 }, wr = { k: "wr", x: top[top.length - 1][1], y: y0 };
    if (cat === "skirts") return [wl, wr, { k: "hl", x: bot[0][0], y: y1 }, { k: "hr", x: bot[bot.length - 1][1], y: y1 }];
    if (cat !== "trousers") return null;
    const legs = rr => rr.slice().sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 2).sort((a, b) => a[0] - b[0]);
    if (legs(bot).length < 2) return null;
    let yg = -1;
    for (let y = y0; y <= y1; y++) if (runs(y).length >= 2) { yg = y; break; }
    if (yg < 0 || y1 - yg < 8) return null;
    // inner edges of the two legs, sub-pixel (from the alpha next to the edge), in every row of the legs; a straight line
    // through each (least squares) and the crotch where the two lines meet (the legs meet at a small angle, so single rows
    // would be too coarse)
    const A = (x, y) => (x < 0 || x >= w ? 0 : alpha[y * w + x]);
    const sumA = (x0, x1, y) => { let t = 0; for (let x = x0; x <= x1; x++) t += A(x, y); return t; };
    const fit = pts => {
      const n = pts.length; if (n < 4) return null;
      let sy = 0, sx = 0, syy = 0, sxy = 0; for (const [y, x] of pts) { sy += y; sx += x; syy += y * y; sxy += x * y; }
      const dd = n * syy - sy * sy; if (Math.abs(dd) < 1e-9) return null;
      const m = (n * sxy - sx * sy) / dd; return { m, q: (sx - m * sy) / n };
    };
    const le = [], re = [];
    for (let y = Math.round(yg + .15 * (y1 - yg)); y <= Math.round(y1 - .05 * (y1 - yg)); y++) {
      const L = legs(runs(y)); if (L.length < 2) continue;
      const b = L[0][1], a = L[1][0];
      le.push([y + .5, b - 2 + sumA(b - 2, b + 3, y)]); re.push([y + .5, a + 3 - sumA(a - 3, a + 2, y)]);
    }
    const fl = fit(le), fr = fit(re);
    // default: the top of the gap (a crotch that opens in a curve); the meeting point of the two lines only when it lies just
    // above that row (a sharp, narrow V, where the first open row is too coarse)
    const g0 = legs(runs(yg));
    let c = { k: "c", x: g0.length >= 2 ? (g0[0][1] + g0[1][0] + 1) / 2 : (wl.x + wr.x) / 2, y: yg };
    if (fl && fr && Math.abs(fr.m - fl.m) > 1e-6) {
      const cy = (fl.q - fr.q) / (fr.m - fl.m);
      if (cy >= Math.max(y0, yg - .15 * (y1 - yg)) && cy <= yg + 1) c = { k: "c", x: fl.m * cy + fl.q, y: cy };
    }
    const L = legs(bot);
    return [wl, wr, c, { k: "hlo", x: L[0][0], y: y1 }, { k: "hli", x: L[0][1], y: y1 }, { k: "hri", x: L[1][0], y: y1 }, { k: "hro", x: L[1][1], y: y1 }];
  }

  /** categories this page can draw (skirts / trousers since 2026-11-18: lower-body anchors from the pose) */
  const DRAWABLE = ["glasses", "hats", "earrings", "necklaces", "tops", "outerwear", "dresses", "skirts", "trousers"];
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

  const api = { CATEGORIES, DRAWABLE, LM, faceAnchors, anchorsFor, place, faceForStudio, formStatus, parseBaht, MARK, stamp, DEMO, drawDemo,
    POSE_NEEDS, POSE_CATS, poseFor, bodyAnchors, missingFor, garmentTargets, garmentAnchorsFromAlpha, demoGarment, rasterGarment };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.LQTryOn = api;
})(typeof window !== "undefined" ? window : globalThis);
