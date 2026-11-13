/* lensiq-colour.js — Personal Colour MVP maths (docs/STYLE-DESIGN.md §1.2, §1.3, §3.1, §3.3; owner approval 2026-11-10:
 * palette with the white-balance card step). Pure functions, on the device only: no network, nothing stored.
 *
 *   rgbToLab([r,g,b]) -> [L,a,b] (sRGB 0..255, D65)   labToRgb(lab) -> [r,g,b]   deltaE2000(lab1, lab2)
 *   cardGains(samples, {card}) -> {ok, why, gains}   why: "" | "clipped" | "dark" | "uneven" | "colour"
 *     card "grey" (18 % grey card, default) or "white" (white card / copy paper). The card fixes both the colour cast and the
 *     exposure, so the skin's L* is comparable between lights.
 *   correct(rgb, gains) -> rgb
 *   measure({card, skin, cardType}) -> {ok, why, lab, L, hue, chroma, spread, gains}   (medians over the sampled pixels)
 *   undertone({hue, chroma, spread}) -> one of BANDS (operational definition: CIELAB hue angle of skin, STYLE-DESIGN §3.1)
 *   seasons(lab) -> [{id, parent, d, name}] closest first (12 seasons under 4 parents, distance in a warm / value / clarity space)
 *   PALETTES[parent] -> [{hex, role, name: {th, en, zh}}]   (our own colour names)   TEXT[lang]   BANDS   SEASONS
 *
 * Seasons and undertone are a matter of taste with no ground truth (STYLE-DESIGN §3.2: 40 % agreement between people in the
 * Thai study). The thresholds below are our operational choices, set before the first synthetic run (S-D8 targets) and
 * owner-editable later; the page never calls them "accuracy". No skin-tone category, ethnicity or "whitening" wording.
 */
(function (root) {
  "use strict";
  var lin = function (/** @type {number} */ v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  var enc = function (/** @type {number} */ v) {
    var x = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(x * 255)));
  };
  var XN = 0.95047, ZN = 1.08883;
  /** @param {number[]} l linear sRGB @returns {number[]} */
  function linToLab(l) {
    var X = (l[0] * 0.4124 + l[1] * 0.3576 + l[2] * 0.1805) / XN, Y = l[0] * 0.2126 + l[1] * 0.7152 + l[2] * 0.0722, Z = (l[0] * 0.0193 + l[1] * 0.1192 + l[2] * 0.9505) / ZN;
    var f = function (/** @type {number} */ t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; };
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  }
  /** @param {number[]} rgb */
  function rgbToLab(rgb) { return linToLab([lin(rgb[0]), lin(rgb[1]), lin(rgb[2])]); }
  /** @param {number[]} lab */
  function labToRgb(lab) {
    var fy = (lab[0] + 16) / 116, fx = fy + lab[1] / 500, fz = fy - lab[2] / 200;
    var inv = function (/** @type {number} */ t) { var c = t * t * t; return c > 0.008856 ? c : (t - 16 / 116) / 7.787; };
    var X = XN * inv(fx), Y = inv(fy), Z = ZN * inv(fz);
    return [enc(3.2406 * X - 1.5372 * Y - 0.4986 * Z), enc(-0.9689 * X + 1.8758 * Y + 0.0415 * Z), enc(0.0557 * X - 0.2040 * Y + 1.0570 * Z)];
  }
  /** CIEDE2000 (Sharma, Wu, Dalal 2005) @param {number[]} p @param {number[]} q */
  function deltaE2000(p, q) {
    var R = Math.PI / 180, L1 = p[0], a1 = p[1], b1 = p[2], L2 = q[0], a2 = q[1], b2 = q[2];
    var C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
    var a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    var h = function (/** @type {number} */ b, /** @type {number} */ a) { if (b === 0 && a === 0) return 0; var d = Math.atan2(b, a) / R; return d < 0 ? d + 360 : d; };
    var h1 = h(b1, a1p), h2 = h(b2, a2p), dL = L2 - L1, dC = C2p - C1p, dh = 0;
    if (C1p * C2p !== 0) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
    var dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * R / 2);
    var Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2, hb = h1 + h2;
    if (C1p * C2p !== 0) { hb = Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : (h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2); }
    var T = 1 - 0.17 * Math.cos((hb - 30) * R) + 0.24 * Math.cos(2 * hb * R) + 0.32 * Math.cos((3 * hb + 6) * R) - 0.20 * Math.cos((4 * hb - 63) * R);
    var dTh = 30 * Math.exp(-Math.pow((hb - 275) / 25, 2)), RC = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
    var SL = 1 + 0.015 * Math.pow(Lb - 50, 2) / Math.sqrt(20 + Math.pow(Lb - 50, 2)), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
    var RT = -Math.sin(2 * dTh * R) * RC;
    return Math.sqrt(Math.pow(dL / SL, 2) + Math.pow(dC / SC, 2) + Math.pow(dH / SH, 2) + RT * (dC / SC) * (dH / SH));
  }

  var median = function (/** @type {number[]} */ a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s.length ? s[(s.length - 1) >> 1] : NaN; };
  var CARD_Y = /** @type {Record<string, number>} */ ({ grey: 0.184, white: 0.85 });
  /** @param {number[][]} samples sRGB pixels from the card @param {{card?: string}} [o] */
  function cardGains(samples, o) {
    var type = (o && o.card) || "grey";
    if (!samples || samples.length < 5) return { ok: false, why: "dark", gains: null };
    var clipped = samples.filter(function (s) { return s[0] >= 250 || s[1] >= 250 || s[2] >= 250; }).length;
    if (clipped / samples.length > 0.1) return { ok: false, why: "clipped", gains: null };
    var L = samples.map(function (s) { return [lin(s[0]), lin(s[1]), lin(s[2])]; });
    var Ys = L.map(function (l) { return l[0] * 0.2126 + l[1] * 0.7152 + l[2] * 0.0722; });
    var Ym = median(Ys);
    if (!(Ym >= 0.03)) return { ok: false, why: "dark", gains: null };
    var mean = Ys.reduce(function (s, v) { return s + v; }, 0) / Ys.length;
    var cv = Math.sqrt(Ys.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / Ys.length) / mean;
    if (cv > 0.15) return { ok: false, why: "uneven", gains: null };
    var m = [0, 1, 2].map(function (i) { return median(L.map(function (l) { return l[i]; })); });
    // a white / grey card under a real light looks warm (yellow-orange), neutral or cool (blue), with little green-magenta;
    // a clearly red, pink, purple or green area is not a card
    var lab = linToLab(m);
    if (lab[1] > 0.55 * Math.abs(lab[2]) + 10 || lab[1] < -14 || lab[2] < -35) return { ok: false, why: "colour", gains: null };
    var t = CARD_Y[type] || CARD_Y.grey;
    return { ok: true, why: "", gains: m.map(function (v) { return t / Math.max(v, 1e-6); }) };
  }
  /** @param {number[]} rgb @param {number[]} g */
  function correct(rgb, g) { return [0, 1, 2].map(function (i) { return enc(lin(rgb[i]) * g[i]); }); }
  /** @param {number[]} lab */
  var hueOf = function (lab) { var d = Math.atan2(lab[2], lab[1]) * 180 / Math.PI; return d < 0 ? d + 360 : d; };
  /** @param {{card: number[][], skin: number[][], cardType?: string}} input */
  function measure(input) {
    var g = cardGains(input.card, { card: input.cardType });
    if (!g.ok) return { ok: false, why: g.why };
    var skin = (input.skin || []).filter(function (s) { return Math.max(s[0], s[1], s[2]) < 250 && Math.max(s[0], s[1], s[2]) > 12; });
    if (skin.length < 5) return { ok: false, why: "skin" };
    var L = skin.map(function (s) { return [lin(s[0]) * g.gains[0], lin(s[1]) * g.gains[1], lin(s[2]) * g.gains[2]]; });
    var m = [0, 1, 2].map(function (i) { return median(L.map(function (l) { return l[i]; })); });
    var lab = linToLab(m), hues = L.map(function (l) { return hueOf(linToLab(l)); });
    var hm = hues.reduce(function (s, v) { return s + v; }, 0) / hues.length;
    var spread = Math.sqrt(hues.reduce(function (s, v) { return s + (v - hm) * (v - hm); }, 0) / hues.length);
    return { ok: true, why: "", lab: lab, L: lab[0], hue: hueOf(lab), chroma: Math.hypot(lab[1], lab[2]), spread: spread, gains: g.gains };
  }

  var BANDS = ["warm", "neutral-warm", "neutral", "neutral-cool", "cool", "unsure"];
  // h_ab thresholds (degrees): skin hue angles mostly fall between about 40 and 75 degrees; higher = more yellow (warm)
  var BAND_AT = [64, 58, 52, 46];
  /** @param {{hue: number, chroma: number, spread?: number}} m */
  function undertone(m) {
    if (!m || !(m.chroma >= 6) || (m.spread != null && m.spread > 6)) return "unsure";
    var h = m.hue;
    return h >= BAND_AT[0] ? "warm" : h >= BAND_AT[1] ? "neutral-warm" : h >= BAND_AT[2] ? "neutral" : h >= BAND_AT[3] ? "neutral-cool" : "cool";
  }

  /* 12 seasons under 4 parents: prototypes in (warmth, value, clarity) units
     warmth = (h_ab - 55) / 8, value = (L* - 55) / 12, clarity = (C*ab - 22) / 5 */
  /** @type {any[]} */
  var SEASONS = [
    { id: "light-spring", parent: "spring", p: [0.7, 1.0, 0.3], name: { th: "สปริงสว่าง", en: "Light Spring", zh: "浅春型" } },
    { id: "true-spring", parent: "spring", p: [1.2, 0.3, 0.6], name: { th: "สปริงแท้", en: "True Spring", zh: "暖春型" } },
    { id: "bright-spring", parent: "spring", p: [0.5, 0.2, 1.2], name: { th: "สปริงสดใส", en: "Bright Spring", zh: "净春型" } },
    { id: "light-summer", parent: "summer", p: [-0.7, 1.0, -0.3], name: { th: "ซัมเมอร์สว่าง", en: "Light Summer", zh: "浅夏型" } },
    { id: "true-summer", parent: "summer", p: [-1.2, 0.3, -0.5], name: { th: "ซัมเมอร์แท้", en: "True Summer", zh: "冷夏型" } },
    { id: "soft-summer", parent: "summer", p: [-0.5, 0.0, -1.2], name: { th: "ซัมเมอร์นุ่ม", en: "Soft Summer", zh: "柔夏型" } },
    { id: "soft-autumn", parent: "autumn", p: [0.5, -0.1, -1.2], name: { th: "ออทัมน์นุ่ม", en: "Soft Autumn", zh: "柔秋型" } },
    { id: "true-autumn", parent: "autumn", p: [1.2, -0.4, -0.4], name: { th: "ออทัมน์แท้", en: "True Autumn", zh: "暖秋型" } },
    { id: "deep-autumn", parent: "autumn", p: [0.7, -1.1, 0.0], name: { th: "ออทัมน์ลึก", en: "Deep Autumn", zh: "深秋型" } },
    { id: "deep-winter", parent: "winter", p: [-0.7, -1.1, 0.3], name: { th: "วินเทอร์ลึก", en: "Deep Winter", zh: "深冬型" } },
    { id: "true-winter", parent: "winter", p: [-1.2, -0.4, 0.6], name: { th: "วินเทอร์แท้", en: "True Winter", zh: "冷冬型" } },
    { id: "bright-winter", parent: "winter", p: [-0.5, 0.2, 1.2], name: { th: "วินเทอร์สดใส", en: "Bright Winter", zh: "净冬型" } }
  ];
  /** @param {number[]} lab */
  function seasons(lab) {
    var h = hueOf(lab), c = Math.hypot(lab[1], lab[2]);
    var f = [(h - 55) / 8, (lab[0] - 55) / 12, (c - 22) / 5];
    return SEASONS.map(function (s) {
      return { id: s.id, parent: s.parent, name: s.name, d: Math.hypot(f[0] - s.p[0], f[1] - s.p[1], f[2] - s.p[2]) };
    }).sort(function (a, b) { return a.d - b.d; });
  }

  /** @param {string} hex @param {string} role @param {string} th @param {string} en @param {string} zh */
  var sw = function (hex, role, th, en, zh) { return { hex: hex, role: role, name: { th: th, en: en, zh: zh } }; };
  var PALETTES = {
    spring: [sw("#f4e3c1", "base", "ครีมนม", "Milk cream", "奶油色"), sw("#d8b07a", "base", "อูฐอ่อน", "Light camel", "浅驼色"), sw("#8a6a4a", "base", "น้ำตาลโกโก้อุ่น", "Warm cocoa", "暖可可色"),
      sw("#f6a58a", "accent", "พีช", "Peach", "蜜桃色"), sw("#f47c5c", "accent", "คอรัล", "Coral", "珊瑚色"), sw("#ffcf5c", "accent", "เหลืองดอกทานตะวัน", "Sunflower", "向日葵黄"),
      sw("#9ccc65", "accent", "เขียวใบอ่อน", "Fresh leaf", "嫩叶绿"), sw("#4fc3b0", "accent", "เขียวน้ำทะเลอุ่น", "Warm aqua", "暖水绿"), sw("#5b9bd5", "accent", "ฟ้าสดใส", "Clear sky", "晴空蓝"),
      sw("#e85a71", "accent", "แตงโม", "Watermelon", "西瓜红"), sw("#c9a24b", "metal", "ทองอ่อน", "Light gold", "浅金色"), sw("#2f5d62", "away", "เขียวหัวเป็ดอ่อน", "Soft teal", "柔青色")],
    summer: [sw("#eef0f2", "base", "ขาวหมอก", "Mist white", "雾白色"), sw("#b8bcc8", "base", "เทาฟ้า", "Blue grey", "蓝灰色"), sw("#5d6b82", "base", "กรมท่าอ่อน", "Soft navy", "柔海军蓝"),
      sw("#f2b8c6", "accent", "ชมพูกุหลาบอ่อน", "Rose pink", "玫瑰粉"), sw("#c97b9a", "accent", "ชมพูหม่น", "Dusty pink", "灰粉色"), sw("#b39ddb", "accent", "ลาเวนเดอร์", "Lavender", "薰衣草紫"),
      sw("#8fb3d9", "accent", "ฟ้าพาสเทล", "Powder blue", "粉蓝色"), sw("#7fb5a8", "accent", "เขียวเซจ", "Sage", "鼠尾草绿"), sw("#a05c7b", "accent", "ม่วงพลัม", "Soft plum", "柔梅紫"),
      sw("#d4e4f0", "accent", "ฟ้าน้ำแข็ง", "Ice blue", "冰蓝色"), sw("#c0c0c8", "metal", "เงิน", "Silver", "银色"), sw("#7a5c6e", "away", "ม่วงองุ่นหม่น", "Muted mauve", "灰紫红")],
    autumn: [sw("#efe2c8", "base", "ครีมข้าวโอ๊ต", "Oat cream", "燕麦色"), sw("#b08955", "base", "อูฐ", "Camel", "驼色"), sw("#5a3e2b", "base", "น้ำตาลช็อกโกแลต", "Chocolate", "巧克力色"),
      sw("#c8693c", "accent", "อิฐส้ม", "Terracotta", "陶土橙"), sw("#d9a441", "accent", "มัสตาร์ด", "Mustard", "芥末黄"), sw("#7c8c3c", "accent", "เขียวมะกอก", "Olive", "橄榄绿"),
      sw("#2e6b5e", "accent", "เขียวป่า", "Forest green", "森林绿"), sw("#9c3d2e", "accent", "แดงอิฐ", "Brick red", "砖红色"), sw("#b5784b", "accent", "ซินนามอน", "Cinnamon", "肉桂色"),
      sw("#2f5f73", "accent", "ฟ้าเป็ดเข้ม", "Deep teal", "深青色"), sw("#b8893a", "metal", "ทองเหลือง", "Brass gold", "黄铜金"), sw("#6d5a7b", "away", "ม่วงหม่น", "Muted violet", "灰紫色")],
    winter: [sw("#ffffff", "base", "ขาวสะอาด", "Pure white", "纯白色"), sw("#7a7f8a", "base", "เทาถ่าน", "Charcoal grey", "炭灰色"), sw("#1b1f2a", "base", "ดำกรมท่า", "Ink navy", "墨蓝色"),
      sw("#d81b60", "accent", "ชมพูบานเย็น", "Fuchsia", "紫红色"), sw("#c62828", "accent", "แดงทับทิม", "Ruby red", "宝石红"), sw("#6a1b9a", "accent", "ม่วงเข้ม", "Royal purple", "皇家紫"),
      sw("#1565c0", "accent", "น้ำเงินรอยัล", "Royal blue", "宝蓝色"), sw("#00897b", "accent", "เขียวมรกต", "Emerald", "祖母绿"), sw("#e1f5fe", "accent", "ฟ้าน้ำแข็งใส", "Icy blue", "冰晶蓝"),
      sw("#f8bbd0", "accent", "ชมพูน้ำแข็ง", "Icy pink", "冰粉色"), sw("#b0b7c3", "metal", "เงินเงา", "Bright silver", "亮银色"), sw("#4e342e", "away", "น้ำตาลเข้ม", "Dark brown", "深棕色")]
  };

  var TEXT = {
    th: {
      title: "พาเลตสีส่วนตัว", notice: "วิเคราะห์สี ไม่ใช่หน้าตา · ประมวลผลในเครื่อง · ไม่เก็บภาพ · ผลเป็นคำแนะนำด้านสี ไม่ใช่ข้อเท็จจริงเกี่ยวกับตัวคุณ",
      start: "เปิดกล้อง", sample: "ลองกับภาพตัวอย่าง (ภาพวาด)", upload: "เลือกรูปในเครื่อง",
      step1: "ขั้นที่ 1: ถือการ์ดสีเทาหรือกระดาษขาวไว้ข้างแก้มในแสงเดียวกัน แล้วแตะที่การ์ดบนภาพ",
      step2: "ขั้นที่ 2: แตะที่แก้ม (ผิวเรียบ ไม่มีเงาหรือแสงสะท้อน)", capture: "หยุดภาพ", again: "เริ่มใหม่",
      cardGrey: "การ์ดสีเทา 18%", cardWhite: "กระดาษขาว / การ์ดขาว",
      why: { clipped: "การ์ดสว่างเกินไป ลองขยับออกจากแสงตรงหรือใช้การ์ดสีเทา", dark: "ภาพมืดเกินไป ลองหันเข้าหาแสง", uneven: "แสงบนการ์ดไม่สม่ำเสมอ ลองให้การ์ดอยู่ในแสงเดียวกันทั้งแผ่น",
        colour: "จุดที่แตะไม่ใช่การ์ดสีเทาหรือขาว ลองแตะกลางการ์ดอีกครั้ง", skin: "จุดที่แตะบนแก้มมืดหรือสว่างเกินไป ลองแตะใหม่", ok: "การ์ดพร้อม" },
      undertone: "อันเดอร์โทน", seasons: "ซีซันสีที่ใกล้ที่สุด 2 อันดับ", palette: "พาเลตสีแนะนำ",
      bands: { warm: "อุ่น", "neutral-warm": "กลางค่อนอุ่น", neutral: "กลาง", "neutral-cool": "กลางค่อนเย็น", cool: "เย็น", unsure: "ยังสรุปไม่ได้" },
      unsure: "ยังสรุปไม่ได้ ลองอีกครั้งใต้แสงธรรมชาติ",
      roles: { base: "สีพื้น", accent: "สีเน้น", metal: "โลหะ", away: "สีที่ใช้ห่างจากใบหน้าได้ดี" },
      disclaimer: "ระบบซีซันสีเป็นความชอบเชิงอัตวิสัย ผลนี้เป็นคำแนะนำด้านสี ไม่ใช่การประเมินตัวคุณ",
      measured: "ตัวเลขการวัดซ้ำมาจากข้อมูลสังเคราะห์ (สีจำลองใต้แสงจำลอง) ยังไม่ได้วัดกับอาสาสมัคร",
      privacy: "ภาพอยู่ในเครื่องนี้เท่านั้น ไม่ส่งออก ไม่บันทึก ปิดหน้านี้แล้วทุกอย่างหายไป", lucky: "ดูสีมงคลประจำวัน",
      reason: { warm: "อันเดอร์โทนค่อนไปทางอุ่น", cool: "อันเดอร์โทนค่อนไปทางเย็น", light: "ค่าความสว่างสูง", deep: "ค่าความสว่างต่ำ", clear: "สีสด", soft: "สีหม่นนุ่ม" }
    },
    en: {
      title: "Personal colour palette", notice: "We analyse colour, not looks · processed on your device · no photos stored · the result is a colour suggestion, not a fact about you",
      start: "Start camera", sample: "Try the drawn sample", upload: "Choose a photo on this device",
      step1: "Step 1: hold a grey card or white paper next to your cheek in the same light, then tap the card in the picture",
      step2: "Step 2: tap your cheek (smooth skin, no shadow or shine)", capture: "Freeze picture", again: "Start again",
      cardGrey: "18% grey card", cardWhite: "White paper / white card",
      why: { clipped: "The card is too bright; move out of direct light or use a grey card", dark: "The picture is too dark; face the light", uneven: "The light on the card is uneven; keep the whole card in the same light",
        colour: "That spot is not a grey or white card; tap the middle of the card again", skin: "The cheek spot is too dark or too bright; tap again", ok: "Card ready" },
      undertone: "Undertone", seasons: "Two closest colour seasons", palette: "Suggested palette",
      bands: { warm: "Warm", "neutral-warm": "Neutral-warm", neutral: "Neutral", "neutral-cool": "Neutral-cool", cool: "Cool", unsure: "Not sure yet" },
      unsure: "Not sure yet; try again in natural light",
      roles: { base: "Base", accent: "Accent", metal: "Metal", away: "Works well away from the face" },
      disclaimer: "Colour seasons are a matter of taste. This is a colour suggestion, not an assessment of you.",
      measured: "Repeatability numbers come from synthetic data (simulated colours under simulated lights), not yet from volunteers",
      privacy: "The picture stays on this device; nothing is sent or saved, and everything is gone when you close this page", lucky: "See today's lucky colours",
      reason: { warm: "undertone leans warm", cool: "undertone leans cool", light: "high lightness", deep: "low lightness", clear: "clear colours", soft: "soft, muted colours" }
    },
    zh: {
      title: "个人色彩调色板", notice: "我们分析的是颜色，不是外貌 · 在你的设备上处理 · 不保存照片 · 结果是配色建议，并非关于你本人的事实",
      start: "打开相机", sample: "用示例图试试（绘制图）", upload: "选择本机照片",
      step1: "第 1 步：在同样的光线下把灰卡或白纸放在脸颊旁，然后在画面中点一下卡片",
      step2: "第 2 步：点一下脸颊（平整的皮肤，没有阴影或反光）", capture: "定格画面", again: "重新开始",
      cardGrey: "18% 灰卡", cardWhite: "白纸 / 白卡",
      why: { clipped: "卡片太亮，请避开直射光或改用灰卡", dark: "画面太暗，请面向光源", uneven: "卡片上的光线不均匀，请让整张卡片处于同样的光线下",
        colour: "点的位置不是灰卡或白卡，请再点一下卡片中央", skin: "脸颊上点的位置太暗或太亮，请重新点", ok: "卡片已就绪" },
      undertone: "底调", seasons: "最接近的两个色彩季型", palette: "推荐色板",
      bands: { warm: "暖", "neutral-warm": "中性偏暖", neutral: "中性", "neutral-cool": "中性偏冷", cool: "冷", unsure: "暂时无法判断" },
      unsure: "暂时无法判断，请在自然光下再试一次",
      roles: { base: "基础色", accent: "点缀色", metal: "金属色", away: "适合远离脸部使用" },
      disclaimer: "色彩季型属于主观偏好。本结果仅为配色建议，并非对您本人的评价。",
      measured: "重复性数据来自合成数据（模拟光线下的模拟颜色），尚未在志愿者身上测量",
      privacy: "画面只留在本设备上，不发送也不保存，关闭本页后全部清除", lucky: "查看今日幸运色",
      reason: { warm: "底调偏暖", cool: "底调偏冷", light: "明度较高", deep: "明度较低", clear: "颜色清澈", soft: "颜色柔和" }
    }
  };

  var api = { rgbToLab: rgbToLab, labToRgb: labToRgb, deltaE2000: deltaE2000, cardGains: cardGains, correct: correct, measure: measure,
    undertone: undertone, seasons: seasons, BANDS: BANDS, BAND_AT: BAND_AT, SEASONS: SEASONS, PALETTES: PALETTES, TEXT: TEXT };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else /** @type {any} */ (root).LQColour = api;
})(typeof window !== "undefined" ? window : globalThis);
