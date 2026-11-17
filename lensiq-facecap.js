/* lensiq-facecap.js — LQFaceCap: bank-style face capture guidance for a face photo (owner order 2026-11-16, item A).
 * Browser: window.LQFaceCap (loaded by faceread.js only when the camera starts) · Node: module.exports (pure parts).
 * Privacy: works on the 68 face points the page's on-device detector already found, plus a few hundred pixel samples of
 * the frame the page already holds. Nothing is stored or sent; no liveness, identity, emotion or beauty judgement.
 * Docs and the maths behind the numbers: docs/FACE-CAPTURE.md.
 *
 * SIZE  iodFrac = eye distance (mean of points 36-41 to mean of 42-47) / the picture's SHORT side (= its width when the
 *       phone is upright). Accepted 0.12 .. 0.32 = a face at about 30-40 cm on common phone front cameras (23-26 mm
 *       equivalent, 16:9 or 4:3), adult eye distance 58-68 mm. Hysteresis 0.003 (review 2026-11-17): leaving "far" needs >= 0.123, leaving "near" <= 0.317.
 * OVAL  centre (0.5 W, 0.42 H), radii 0.27 x 0.36 of the short side (a face at about 35-40 cm fills it).
 * STATES, in priority order (ONE instruction at a time; the first that applies wins):
 *   wait      no picture size yet
 *   multi     more than one face
 *   near      too large                                   -> "move back a little"
 *   cut       part of the face is outside the picture     -> plain message
 *   out       no face, or the face centre is off the oval  -> "into the oval"
 *   far       too small                                   -> "move closer"
 *   dark      face too dark                                -> "more light needed"
 *   backlight background much brighter than the face       -> "turn towards the light"
 *   turn      head turned left/right (yaw)                 -> "face forward"
 *   tilt      head tilted sideways (roll)                  -> "keep your head level"
 *   chinUp    chin too far down                            -> "raise your chin"
 *   chinDown  chin too far up                              -> "lower your chin"
 *   glare     specular glare on glasses in the eye area    -> plain message
 *   blur      picture not sharp                            -> plain message
 *   still     everything passes but the face is moving     -> "hold still"  (guide stays green)
 *   ok        everything passes                            -> guide green
 * classify(input, prev?) -> state
 *   input = {pts:[[x,y] x68]|null, n, W, H, px?: pixelChecks() result, moving?: bool}
 * measure(pts, W, H) -> {iod, iodFrac, eye, centre, off, cut, yaw, roll, pitch}
 * oval(W, H) -> {cx, cy, rx, ry}
 * pixelChecks(img{data,width,height}, pts) -> {faceLuma, bgLuma, dark, backlight, glareFrac, glare, blurRatio, blur}
 *   blurRatio: on the strongest 5 % of edges in the brow/eye band, mean |I(i+16g)-I(i)| / mean of the largest of its four
 *   4g sub-steps, g = max(1 px, eye distance / 120): 1.0 for a crisp edge, up to 4.0 for an edge wider than 16g. blur when
 *   >= 2 (an edge wider than about 8g = 0.07 eye distances); null = not measurable (coarse contrast under 25).
 * createGuide({holdMs}) -> {update(input, now) -> {state, raw, green}, reset()}
 *   the first state shows at once; a new state shows after holdMs, EXCEPT that a green state never outlives the raw
 *   state: when the raw state stops being green the line changes at once.
 * green(state) -> state is ok or still
 * createAuto({stepMs=800, moveTol=0.12, sizeTol=0.06, rearmMs=1500}) -> {update({green, eye, iod}, now), reset()}
 *   -> {phase:'idle'|'count'|'fire'|'done', n (3,2,1 while counting), moved}
 *   counts 3-2-1 only while the guide is green and the face stays within moveTol x eye distance (and sizeTol of its size)
 *   of where the count started; any move restarts the count at 3. 'fire' once; then 'done' until the guide has been
 *   non-green for rearmMs (a new person / a new try). hold() = the same "done" after a manual capture.
 * manualEnabled(state, n) -> the manual capture button: enabled whenever exactly one face is found, whatever the
 *   guidance says; disabled with no face (nothing to read) and with two or more faces (never read a bystander).
 * text(state, mode='self'|'other') -> the line in the current language; DICT {th, en, zh}; mode 'other' = rear camera,
 *   worded for the person holding the phone.
 * mount(after, {id, host}) -> UI {el, set(state, mode), state, destroy()}  (DOM; same markup and CSS as LQHint.mount)
 */
(function (root) {
  "use strict";

  var RANGE = Object.freeze({ far: 0.12, near: 0.32, hyst: 0.003 });
  var LIMITS = Object.freeze({ off: 0.4, offBack: 0.33, yaw: 0.14, yawBack: 0.11, roll: 9, rollBack: 7, pitchHi: 0.46, pitchLo: 0.16, pitchHyst: 0.03,
    lumaLo: 65, backlightGap: 70, backlightBg: 170, glare: 0.08, glareFaceMax: 200, blur: 2, blurContrast: 25, edge: 0.005 });
  var STATES = Object.freeze(["wait", "multi", "near", "cut", "out", "far", "dark", "backlight", "turn", "tilt", "chinUp", "chinDown", "glare", "blur", "still", "ok"]);

  var DICT = {
    th: {
      "fcap.self.far": "ไกลไป ขยับเข้ามาใกล้อีกนิด",
      "fcap.self.near": "ใกล้ไป ถอยออกหน่อย",
      "fcap.self.out": "ให้อยู่ในกรอบ",
      "fcap.self.cut": "ใบหน้าเกินขอบภาพ ขยับให้ทั้งหน้าอยู่ในวงรี",
      "fcap.self.multi": "ให้มีคนเดียวในกรอบ",
      "fcap.self.dark": "มืดไป เพิ่มแสงอีกหน่อย",
      "fcap.self.backlight": "แสงอยู่ด้านหลัง หันหน้าเข้าหาแสง",
      "fcap.self.turn": "หันหน้าตรงเข้ากล้อง",
      "fcap.self.tilt": "มองตรง ตั้งศีรษะให้ตรง",
      "fcap.self.chinUp": "เงยคางขึ้นเล็กน้อย",
      "fcap.self.chinDown": "ก้มคางลงเล็กน้อย",
      "fcap.self.glare": "แว่นสะท้อนแสง ขยับมุมแว่นหรือเลี่ยงแสงที่ส่องตรง",
      "fcap.self.blur": "ภาพไม่ชัด เช็ดเลนส์กล้องแล้วถือให้นิ่ง",
      "fcap.self.still": "อยู่นิ่ง ๆ สักครู่",
      "fcap.self.ok": "ดีแล้ว อยู่นิ่ง ๆ",
      "fcap.other.far": "ขยับโทรศัพท์เข้าไปใกล้อีกนิด",
      "fcap.other.near": "ถอยโทรศัพท์ออกเล็กน้อย",
      "fcap.other.out": "เล็งให้ใบหน้าของเขาอยู่ในวงรี",
      "fcap.other.cut": "ใบหน้าของเขาเกินขอบภาพ เล็งให้ทั้งหน้าอยู่ในวงรี",
      "fcap.other.multi": "ให้มีคนเดียวในภาพ",
      "fcap.other.dark": "มืดไป ย้ายไปที่สว่างขึ้น",
      "fcap.other.backlight": "แสงอยู่ด้านหลังเขา เปลี่ยนมุมให้แสงส่องหน้าเขา",
      "fcap.other.turn": "ขอให้เขาหันหน้าตรงเข้ากล้อง",
      "fcap.other.tilt": "ขอให้เขาตั้งศีรษะตรง หรือถือโทรศัพท์ให้ตรง",
      "fcap.other.chinUp": "ขอให้เขาเงยคางขึ้นเล็กน้อย",
      "fcap.other.chinDown": "ขอให้เขาก้มคางลงเล็กน้อย",
      "fcap.other.glare": "แว่นของเขาสะท้อนแสง ขอให้ขยับมุมแว่นเล็กน้อย หรือเปลี่ยนมุมถ่าย",
      "fcap.other.blur": "ภาพไม่ชัด เช็ดเลนส์กล้องแล้วถือโทรศัพท์ให้นิ่ง",
      "fcap.other.still": "ถือโทรศัพท์นิ่ง ๆ สักครู่",
      "fcap.other.ok": "ดีแล้ว ถือโทรศัพท์นิ่ง ๆ"
    },
    en: {
      "fcap.self.far": "Too far — move closer",
      "fcap.self.near": "Too close — move back a little",
      "fcap.self.out": "Move into the frame",
      "fcap.self.cut": "Part of your face is out of the picture — move fully into the oval",
      "fcap.self.multi": "Only one person in the frame",
      "fcap.self.dark": "Too dark — more light needed",
      "fcap.self.backlight": "The light is behind you — turn to face the light",
      "fcap.self.turn": "Face the camera straight on",
      "fcap.self.tilt": "Look straight, keep your head level",
      "fcap.self.chinUp": "Raise your chin a little",
      "fcap.self.chinDown": "Lower your chin a little",
      "fcap.self.glare": "Glare on your glasses — tilt them slightly or move out of direct light",
      "fcap.self.blur": "The picture is blurry — wipe the camera lens and hold steady",
      "fcap.self.still": "Hold still for a moment",
      "fcap.self.ok": "Good — stay still",
      "fcap.other.far": "Move the phone a little closer to them",
      "fcap.other.near": "Move the phone back a little",
      "fcap.other.out": "Aim so their face is inside the oval",
      "fcap.other.cut": "Part of their face is out of the picture — aim so the whole face is in the oval",
      "fcap.other.multi": "Only one person in the picture",
      "fcap.other.dark": "Too dark — move to a brighter place",
      "fcap.other.backlight": "The light is behind them — change the angle so the light falls on their face",
      "fcap.other.turn": "Ask them to face the camera straight on",
      "fcap.other.tilt": "Ask them to keep their head level, or hold the phone level",
      "fcap.other.chinUp": "Ask them to raise their chin a little",
      "fcap.other.chinDown": "Ask them to lower their chin a little",
      "fcap.other.glare": "Glare on their glasses — ask them to tilt the glasses slightly, or change your angle",
      "fcap.other.blur": "The picture is blurry — wipe the lens and hold the phone steady",
      "fcap.other.still": "Hold the phone still for a moment",
      "fcap.other.ok": "Good — hold the phone still"
    },
    zh: {
      "fcap.self.far": "太远了，再靠近一点",
      "fcap.self.near": "太近了，稍微往后退一点",
      "fcap.self.out": "请进入框内",
      "fcap.self.cut": "脸部有一部分在画面外，请让整张脸进入椭圆框",
      "fcap.self.multi": "框内只能有一个人",
      "fcap.self.dark": "太暗了，需要更多光线",
      "fcap.self.backlight": "光线在你身后，请面向光源",
      "fcap.self.turn": "请正对镜头",
      "fcap.self.tilt": "请正视镜头，头部摆正",
      "fcap.self.chinUp": "请把下巴稍微抬高一点",
      "fcap.self.chinDown": "请把下巴稍微放低一点",
      "fcap.self.glare": "眼镜反光，请稍微调整眼镜角度或避开直射光",
      "fcap.self.blur": "画面模糊，请擦拭镜头并保持稳定",
      "fcap.self.still": "请保持不动片刻",
      "fcap.self.ok": "很好，保持不动",
      "fcap.other.far": "请把手机再靠近对方一点",
      "fcap.other.near": "请把手机稍微拿远一点",
      "fcap.other.out": "请对准，让对方的脸在椭圆框内",
      "fcap.other.cut": "对方的脸有一部分在画面外，请对准让整张脸进入椭圆框",
      "fcap.other.multi": "画面中只能有一个人",
      "fcap.other.dark": "太暗了，请换到更亮的地方",
      "fcap.other.backlight": "光线在对方身后，请换个角度让光照到对方脸上",
      "fcap.other.turn": "请对方正对镜头",
      "fcap.other.tilt": "请对方把头摆正，或把手机拿正",
      "fcap.other.chinUp": "请对方把下巴稍微抬高一点",
      "fcap.other.chinDown": "请对方把下巴稍微放低一点",
      "fcap.other.glare": "对方眼镜反光，请对方稍微调整眼镜角度，或换个拍摄角度",
      "fcap.other.blur": "画面模糊，请擦拭镜头并拿稳手机",
      "fcap.other.still": "请拿稳手机片刻",
      "fcap.other.ok": "很好，拿稳不动"
    }
  };
  if (typeof window !== "undefined") (window.LQI18N_Q = window.LQI18N_Q || []).push({ zh: DICT.zh, en: DICT.en });

  var num = function (v) { return typeof v === "number" && isFinite(v); };
  var mean = function (pts, a, b) { var x = 0, y = 0; for (var i = a; i <= b; i++) { x += pts[i][0]; y += pts[i][1]; } return [x / (b - a + 1), y / (b - a + 1)]; };

  function oval(W, H) { var s = Math.min(W, H); return { cx: W / 2, cy: H * 0.42, rx: 0.27 * s, ry: 0.36 * s }; }

  /** eye frame: centre between the eyes, angle of the eye line, eye distance; img(x, y) maps aligned units to pixels */
  function eyeFrame(pts) {
    var L = mean(pts, 36, 41), R = mean(pts, 42, 47), th = Math.atan2(R[1] - L[1], R[0] - L[0]), iod = Math.hypot(R[0] - L[0], R[1] - L[1]) || 1;
    var c = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2], co = Math.cos(th), si = Math.sin(th);
    return { L: L, R: R, c: c, iod: iod, th: th,
      img: function (x, y) { return [c[0] + iod * (x * co - y * si), c[1] + iod * (x * si + y * co)]; },
      al: function (p) { var dx = p[0] - c[0], dy = p[1] - c[1]; return [(dx * co + dy * si) / iod, (-dx * si + dy * co) / iod]; } };
  }

  function measure(pts, W, H) {
    var F = eyeFrame(pts), a = function (i) { return F.al(pts[i]); };
    var s = Math.min(W, H), o = oval(W, H), chin = pts[8];
    var centre = [F.c[0] + 0.2 * (chin[0] - F.c[0]), F.c[1] + 0.2 * (chin[1] - F.c[1])];
    var off = Math.max(Math.abs(centre[0] - o.cx) / o.rx, Math.abs(centre[1] - o.cy) / o.ry);
    // yaw: same rule as faceread.js headPose (nose tip to each side of the face, points 0-2 and 14-16)
    var n = a(30), dl = Math.abs(n[0] - (a(0)[0] + a(1)[0] + a(2)[0]) / 3), dr = Math.abs((a(14)[0] + a(15)[0] + a(16)[0]) / 3 - n[0]);
    var yaw = (dl - dr) / (dl + dr || 1);
    // pitch: nose tip height / chin height below the eye line (smaller = chin up)
    var ch = a(8)[1], pitch = ch > 0 ? n[1] / ch : 0;
    // cut: the jaw line, the chin or the forehead (1.1 eye distances above the eyes) at or past an edge of the picture
    var m = LIMITS.edge * s, ext = pts.slice(0, 17).concat([F.img(0, -1.1), F.img(-1.1, -0.6), F.img(1.1, -0.6)]);
    var cut = ext.some(function (p) { return p[0] < m || p[1] < m || p[0] > W - m || p[1] > H - m; });
    return { iod: F.iod, iodFrac: F.iod / s, eye: F.c, centre: centre, off: off, cut: cut, yaw: yaw, roll: F.th * 180 / Math.PI, pitch: pitch };
  }

  /** @param {any} m @param {string|null} [prev] @returns {string} */
  function classify(m, prev) {
    if (!m || !(m.W > 0) || !(m.H > 0)) return "wait";
    if (num(m.n) && m.n > 1) return "multi";
    var px = m.px || null;
    if (!m.pts || m.pts.length < 68) return px && px.dark ? "dark" : "out";
    var g = measure(m.pts, m.W, m.H), L = LIMITS, R = RANGE;
    if (g.iodFrac > (prev === "near" ? R.near - R.hyst : R.near)) return "near";
    if (g.cut) return "cut";
    if (g.off > (prev === "out" ? L.offBack : L.off)) return "out";
    if (g.iodFrac < (prev === "far" ? R.far + R.hyst : R.far)) return "far";
    if (px && px.dark) return "dark";
    if (px && px.backlight) return "backlight";
    if (Math.abs(g.yaw) > (prev === "turn" ? L.yawBack : L.yaw)) return "turn";
    if (Math.abs(g.roll) > (prev === "tilt" ? L.rollBack : L.roll)) return "tilt";
    if (g.pitch > (prev === "chinUp" ? L.pitchHi - L.pitchHyst : L.pitchHi)) return "chinUp";
    if (g.pitch < (prev === "chinDown" ? L.pitchLo + L.pitchHyst : L.pitchLo)) return "chinDown";
    if (px && px.glare) return "glare";
    if (px && px.blur) return "blur";
    if (m.moving) return "still";
    return "ok";
  }
  function green(state) { return state === "ok" || state === "still"; }
  function manualEnabled(state, n) { return n === 1 && state !== "multi"; }

  /* ---------------- pixel checks (a few hundred samples; no picture is kept) ---------------- */
  // img may be a region of the picture: img.x0 / img.y0 = its top-left corner in picture pixels (0 when absent)
  function lumaAt(img, x, y) {
    x = Math.round(x) - (img.x0 || 0); y = Math.round(y) - (img.y0 || 0);
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return -1;
    var i = (y * img.width + x) * 4, d = img.data;
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  function minAt(img, x, y) {
    x = Math.round(x) - (img.x0 || 0); y = Math.round(y) - (img.y0 || 0);
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return -1;
    var i = (y * img.width + x) * 4, d = img.data;
    return Math.min(d[i], d[i + 1], d[i + 2]);
  }
  var BUF = {};
  /** a reused typed buffer of at least n entries (the pixel checks run every 250 ms; no new big arrays each time) */
  function buf(name, n, Type) { if (!BUF[name] || BUF[name].length < n) BUF[name] = new Type(Math.max(n, 1)); return BUF[name]; }
  /** k-th largest of a[0..n) (1 <= k <= n), by quickselect on a reused copy */
  function kthLargest(a, n, k) {
    var w = buf("s", n, Float64Array), lo = 0, hi = n - 1, want = k - 1, i, j, piv, tmp;
    for (i = 0; i < n; i++) w[i] = a[i];
    while (lo < hi) {
      piv = w[(lo + hi) >> 1]; i = lo; j = hi;
      while (i <= j) { while (w[i] > piv) i++; while (w[j] < piv) j--; if (i <= j) { tmp = w[i]; w[i] = w[j]; w[j] = tmp; i++; j--; } }
      if (want <= j) hi = j; else if (want >= i) lo = i; else break;
    }
    return w[want];
  }
  function pixelChecks(img, pts) {
    var F = eyeFrame(pts), L = LIMITS, i, j, p, v;
    // face: cheeks, nose and mouth (no eyes, brows or hair)
    var fs = 0, fn = 0;
    for (i = 0; i < 12; i++) for (j = 0; j < 10; j++) { p = F.img(-0.8 + 1.6 * i / 11, 0.3 + 1.2 * j / 9); v = lumaAt(img, p[0], p[1]); if (v >= 0) { fs += v; fn++; } }
    var faceLuma = fn ? fs / fn : null;
    // background: beside the head and above it
    var bs = 0, bn = 0;
    var bgPt = function (x, y) { var q = F.img(x, y), w = lumaAt(img, q[0], q[1]); if (w >= 0) { bs += w; bn++; } };
    for (i = 0; i < 8; i++) for (j = 0; j < 4; j++) { var y = -1.5 + 2.3 * i / 7, x = 1.75 + 0.6 * j / 3; bgPt(-x, y); bgPt(x, y); }
    for (i = 0; i < 9; i++) for (j = 0; j < 2; j++) bgPt(-1 + 2 * i / 8, -2.4 + 0.2 * j);
    var bgLuma = bn >= 10 ? bs / bn : null;
    var dark = faceLuma != null && faceLuma < L.lumaLo;
    var backlight = !dark && faceLuma != null && bgLuma != null && bgLuma - faceLuma >= L.backlightGap && bgLuma >= L.backlightBg;
    // glare: share of saturated white samples in each lens area (0.84 x 0.6 eye distances around each eye)
    var glareFrac = 0;
    [F.al(F.L), F.al(F.R)].forEach(function (e) {
      var hit = 0, all = 0;
      for (var a = 0; a < 24; a++) for (var b = 0; b < 14; b++) {
        var q = F.img(e[0] - 0.42 + 0.84 * a / 23, e[1] - 0.3 + 0.6 * b / 13), mn = minAt(img, q[0], q[1]);
        if (mn >= 0) { all++; if (mn >= 240) hit++; }
      }
      if (all) glareFrac = Math.max(glareFrac, hit / all);
    });
    var glare = !dark && glareFrac >= L.glare && (faceLuma == null || faceLuma < L.glareFaceMax);
    // blur: edge width on the sharpest edges of the brow/eye band. Memory (review D3): reused typed buffers, no per-sample
    // arrays or closures, the top 5 % found by selection (same result as the stable full sort it replaces)
    var gstep = Math.max(1, F.iod / 120), nx = Math.round(1.8 * F.iod / gstep), ny = Math.round(0.85 * F.iod / gstep), grid = buf("g", nx * ny, Float32Array), ok = true;
    var cx = F.c[0], cy = F.c[1], cs = Math.cos(F.th), sn = Math.sin(F.th), ax, ay;
    for (j = 0; j < ny && ok; j++) for (i = 0; i < nx; i++) {
      ax = -0.9 + i * gstep / F.iod; ay = -0.55 + j * gstep / F.iod;
      v = lumaAt(img, cx + F.iod * (ax * cs - ay * sn), cy + F.iod * (ax * sn + ay * cs)); if (v < 0) { ok = false; break; } grid[j * nx + i] = v;
    }
    var blurRatio = null;
    if (ok) {
      // coarse step 16g against the largest of its four 4g sub-steps: 1 for a crisp edge, up to 4 for an edge wider than 16g
      var m = Math.max(0, ny * (nx - 16)) + Math.max(0, (ny - 16) * nx), cv = buf("c", m, Float64Array), qv = buf("q", m, Float64Array), n = 0, t, o, q4, d;
      for (j = 0; j < ny; j++) for (i = 0; i + 16 < nx; i++) {
        o = j * nx + i; q4 = 0; for (t = 0; t < 16; t += 4) { d = Math.abs(grid[o + t + 4] - grid[o + t]); if (d > q4) q4 = d; }
        cv[n] = Math.abs(grid[o + 16] - grid[o]); qv[n++] = q4;
      }
      for (j = 0; j + 16 < ny; j++) for (i = 0; i < nx; i++) {
        o = j * nx + i; q4 = 0; for (t = 0; t < 16; t += 4) { d = Math.abs(grid[o + (t + 4) * nx] - grid[o + t * nx]); if (d > q4) q4 = d; }
        cv[n] = Math.abs(grid[o + 16 * nx] - grid[o]); qv[n++] = q4;
      }
      var k = Math.max(20, Math.round(n * 0.05)), take = Math.min(k, n), s2 = 0, s1 = 0;
      if (take) {
        var T = kthLargest(cv, n, take), got = 0;
        for (i = 0; i < n; i++) if (cv[i] > T) { got++; s2 += cv[i]; s1 += qv[i]; }
        for (i = 0; i < n && got < take; i++) if (cv[i] === T) { got++; s2 += cv[i]; s1 += qv[i]; } // ties in scan order, as the stable sort did
      }
      if (k && s2 / k >= L.blurContrast && s1 > 0) blurRatio = s2 / s1;
    }
    var blur = !dark && blurRatio != null && blurRatio >= L.blur;
    var r2 = function (x) { return x == null ? null : Math.round(x * 1000) / 1000; };
    return { faceLuma: r2(faceLuma), bgLuma: r2(bgLuma), dark: dark, backlight: backlight, glareFrac: r2(glareFrac), glare: glare, blurRatio: r2(blurRatio), blur: blur };
  }
  /** mean luma of a coarse grid over the whole picture (for "too dark" when no face is found) */
  function frameLuma(img) {
    var s = 0, n = 0;
    for (var i = 0; i < 16; i++) for (var j = 0; j < 16; j++) { var v = lumaAt(img, (i + 0.5) * img.width / 16, (j + 0.5) * img.height / 16); if (v >= 0) { s += v; n++; } }
    return n ? s / n : null;
  }

  /* ---------------- trackers ---------------- */
  function createGuide(opts) {
    var o = Object.assign({ holdMs: 300 }, opts || {});
    var shown = null, cand = null, since = 0;
    return {
      get state() { return shown; },
      reset: function () { shown = null; cand = null; since = 0; },
      update: function (m, now) {
        var raw = classify(m, shown);
        if (shown === null || (green(shown) && !green(raw))) { shown = raw; cand = raw; since = now; return { state: shown, raw: raw, green: green(shown) }; }
        if (raw === shown) { cand = raw; since = now; return { state: shown, raw: raw, green: green(shown) }; }
        if (raw !== cand) { cand = raw; since = now; }
        if (now - since >= o.holdMs) shown = raw;
        return { state: shown, raw: raw, green: green(shown) };
      }
    };
  }
  function createAuto(opts) {
    var o = Object.assign({ stepMs: 800, moveTol: 0.12, sizeTol: 0.06, rearmMs: 1500 }, opts || {});
    var anchor = null, start = 0, done = false, offSince = 0;
    var api = {
      reset: function () { anchor = null; start = 0; done = false; offSince = 0; },
      /** a capture was taken another way (the manual button): no automatic one until the guide has been off green for rearmMs */
      hold: function () { anchor = null; done = true; offSince = 0; },
      update: function (f, now) {
        if (done) {
          if (f && f.green) { offSince = 0; return { phase: "done", n: 0, moved: false }; }
          if (!offSince) offSince = now;
          if (now - offSince >= o.rearmMs) { done = false; offSince = 0; anchor = null; }
          return { phase: done ? "done" : "idle", n: 0, moved: false };
        }
        if (!f || !f.green || !f.eye || !(f.iod > 0)) { anchor = null; return { phase: "idle", n: 0, moved: false }; }
        var moved = !!anchor && (Math.hypot(f.eye[0] - anchor.eye[0], f.eye[1] - anchor.eye[1]) / anchor.iod > o.moveTol || Math.abs(f.iod / anchor.iod - 1) > o.sizeTol);
        if (!anchor || moved) { anchor = { eye: f.eye.slice(), iod: f.iod }; start = now; }
        var el = now - start;
        if (el >= 3 * o.stepMs) { done = true; anchor = null; return { phase: "fire", n: 0, moved: moved }; }
        return { phase: "count", n: 3 - Math.floor(el / o.stepMs), moved: moved };
      }
    };
    return api;
  }

  /* ---------------- text and UI ---------------- */
  function keyOf(state, mode) { return state && state !== "wait" && STATES.indexOf(state) >= 0 ? "fcap." + (mode === "other" ? "other" : "self") + "." + state : null; }
  function text(state, mode) {
    var key = keyOf(state, mode); if (!key) return "";
    var I = typeof window !== "undefined" && window.LQI18N;
    if (I && typeof I.tf === "function") return I.tf(key, DICT.th[key]);
    return DICT.th[key];
  }
  var ICONS = { ok: "✓", still: "✓", far: "+", near: "−", out: "□", cut: "□", turn: "↔", tilt: "↻", chinUp: "↑", chinDown: "↓", dark: "◐", backlight: "◑", glare: "✦", blur: "≈", multi: "1" };
  function icon(state) { return ICONS[state] || ""; }
  function color(state) { return green(state) ? "#22c55e" : "rgba(255,255,255,.85)"; }

  function mount(after, opts) {
    opts = opts || {};
    var host = opts.host || after;
    var el = document.createElement("p");
    el.className = "lq-chint lq-fcap"; if (opts.id) el.id = opts.id;
    el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); el.dataset.state = "wait";
    var ic = document.createElement("span"); ic.className = "lq-chint-ic"; ic.setAttribute("aria-hidden", "true");
    var tx = document.createElement("span"); tx.className = "lq-chint-tx";
    el.append(ic, tx); after.after(el); host.setAttribute("data-chint", "wait");
    var cur = "wait", mode = "self";
    var render = function () {
      el.dataset.state = cur; el.dataset.mode = mode; host.setAttribute("data-chint", cur);
      ic.textContent = icon(cur); tx.textContent = text(cur, mode);
    };
    var onLang = function () { render(); };
    window.addEventListener("lq-lang", onLang);
    render();
    return {
      el: el,
      get state() { return cur; },
      set: function (state, m) {
        var s = state && STATES.indexOf(state) >= 0 ? state : "wait", md = m === "other" ? "other" : "self";
        if (s === cur && md === mode) return;
        cur = s; mode = md; render();
      },
      destroy: function () { window.removeEventListener("lq-lang", onLang); el.remove(); host.removeAttribute("data-chint"); }
    };
  }

  /** page controller (DOM): one guide line under the camera box, the oval on the overlay canvas, the manual button, the 3-2-1
   *  count and the automatic capture. o = {cam, canvas, count, button, busy() -> bool, fire()}; frame(det, list, img, W, H, now, mode) */
  function controller(o) {
    var ui = mount(o.cam, { id: o.id || "frHint" }), guide = createGuide(), auto = createAuto(), lastMoveAt = -1e9, ctx = o.canvas.getContext("2d");
    var api2 = { state: "wait", n: 0, mode: "self", auto: auto };
    ui.el.hidden = true;
    function count(n) { if (o.busy()) return; if (n) { o.count.textContent = String(n); o.count.hidden = false; } else o.count.hidden = true; }
    function draw(det, isGreen, others) {
      var w = o.canvas.width, h = o.canvas.height, ov = oval(w, h); ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = Math.max(4, Math.min(w, h) / 130); ctx.setLineDash(isGreen ? [] : [w / 50, w / 80]);
      ctx.strokeStyle = color(isGreen ? "ok" : "wait");
      ctx.beginPath(); ctx.ellipse(ov.cx, ov.cy, ov.rx, ov.ry, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      if (det) { // face points in raw picture pixels (the canvas is mirrored by CSS together with the video)
        ctx.fillStyle = isGreen ? "rgba(34,211,238,.9)" : "rgba(255,255,255,.7)";
        det.pts.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(1.5, w / 500), 0, Math.PI * 2); ctx.fill(); });
      }
      (others || []).forEach(function (d) { // other faces: dimmed, never read
        var b = d.box; ctx.fillStyle = "rgba(14,20,48,.55)"; ctx.fillRect(b.x, b.y, b.width, b.height);
        ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = Math.max(2, w / 400); ctx.strokeRect(b.x, b.y, b.width, b.height);
      });
    }
    api2.setMode = function (m) { api2.mode = m === "other" ? "other" : "self"; ui.set(ui.state, api2.mode); };
    api2.frame = function (det, list, img, W, H, now) {
      var n = list.length, px = null;
      if (img) px = det && !img.small ? pixelChecks(img, det.pts) : { dark: (frameLuma(img) || 255) < LIMITS.lumaLo };
      var r = guide.update({ pts: det ? det.pts : null, n: n, W: W, H: H, px: px, moving: now - lastMoveAt < 700 }, now);
      api2.state = r.state; api2.n = n;
      ui.el.hidden = false; ui.set(r.state, api2.mode);
      o.cam.setAttribute("data-guide", r.green ? "green" : "grey");
      o.button.disabled = o.busy() || !manualEnabled(r.state, n);
      var m = det ? measure(det.pts, W, H) : null, a = auto.update({ green: r.green && n === 1, eye: m && m.eye, iod: m && m.iod }, now);
      if (a.moved) lastMoveAt = now;
      count(a.phase === "count" ? a.n : 0);
      draw(det, r.green, list.filter(function (d) { return d !== det; }));
      if (a.phase === "fire") o.fire();
      return r;
    };
    api2.hide = function () {
      guide.reset(); auto.reset(); api2.state = "wait"; api2.n = 0; lastMoveAt = -1e9;
      ui.set("wait", api2.mode); ui.el.hidden = true; o.cam.removeAttribute("data-guide"); count(0);
    };
    api2.manualOk = function () { return manualEnabled(api2.state, api2.n); };
    /* the pixels the checks need (review D3, memory): with a face, only the region around it (2.8 eye distances to each side,
       2.8 above the eyes, 2.0 below; the checks sample inside it); with no face, a 32 x 32 copy for "too dark". One canvas of
       each kind is reused. -> {data, width, height, x0, y0} */
    var rc = document.createElement("canvas"), rctx = rc.getContext("2d", { willReadFrequently: true });
    var sc = document.createElement("canvas"), sctx = sc.getContext("2d", { willReadFrequently: true }); sc.width = sc.height = 32;
    api2.read = function (src, W, H, det) {
      if (!det) { sctx.drawImage(src, 0, 0, W, H, 0, 0, 32, 32); var sm = sctx.getImageData(0, 0, 32, 32); return { data: sm.data, width: 32, height: 32, x0: 0, y0: 0, small: true }; }
      var F = eyeFrame(det.pts), r = 2.8 * F.iod;
      var x0 = Math.max(0, Math.floor(F.c[0] - r)), y0 = Math.max(0, Math.floor(F.c[1] - r)), x1 = Math.min(W, Math.ceil(F.c[0] + r)), y1 = Math.min(H, Math.ceil(F.c[1] + 2.0 * F.iod + r * 0.3));
      var w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
      if (rc.width < w || rc.height < h) { rc.width = Math.max(rc.width, w); rc.height = Math.max(rc.height, h); }
      rctx.drawImage(src, x0, y0, w, h, 0, 0, w, h);
      var im = rctx.getImageData(0, 0, w, h);
      return { data: im.data, width: w, height: h, x0: x0, y0: y0 };
    };
    return api2;
  }

  var api = { RANGE: RANGE, LIMITS: LIMITS, STATES: STATES, DICT: DICT, oval: oval, measure: measure, classify: classify, green: green, manualEnabled: manualEnabled, controller: controller,
    pixelChecks: pixelChecks, frameLuma: frameLuma, createGuide: createGuide, createAuto: createAuto, text: text, icon: icon, color: color, mount: mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.LQFaceCap = api;
})(typeof window !== "undefined" ? window : globalThis);
