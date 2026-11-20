/* palm-v2.js — palm reading upgrade v1 core (switch window.LENSIQ_PALM_V2, default false). Pure functions, Node-testable:
     const PV = require("./palm-v2.js")   ·   browser: window.PalmV2
   Owner order 2026-11-19; design ~/Desktop/LENSIQ-review/palm/PALM-UPGRADE-DESIGN-TH.md; acceptance sheet docs/acceptance/palm.md.
   Everything runs on the device. Nothing here sends, stores or keeps a photo; storage holds line geometry only (serialize()).
   Tier 1 only: all of this is our own code. Landmarks come from the 7-tap mode (handFromTaps) or any landmark source that
   gives the knuckles and the wrist: guides are computed from the palm frame alone (frameFromHand), so a tier-1 landmarker can
   plug in later. The MediaPipe hand model (M6 / M7) is tier 2-U and is used only by the UI when the separate switch
   LENSIQ_PALM_LANDMARKS allows it (off in customer builds, LICENSES/TIERS.md).
   Parts: texts and states (statuses found / notFound / added / absentConfirmed) · guides per school · the drawing layer used for
   screen, print and share · reading and AI facts · capture metrics, hints, auto shutter, full-resolution still · the classical
   line finder (ridge / valley filters: Frangi-type Hessian, Gabor, black-hat; skeleton; geometry).
   PROVISIONAL: every threshold (CAPTURE_T, THRESH, UPLOAD_MIN, the finder's constants) until calibrated on consented real photos. */
(function (root) {
  "use strict";
  var KB = root.PALM_V2_KB || (typeof require === "function" ? require("./palm-v2-kb.js") : null);

  var LINES = ["life", "head", "heart", "fate", "sun", "mercury", "marriage", "girdle", "bracelet", "simian"];
  var SCHOOLS = ["thai", "chinese", "western"];
  var LANGS = ["th", "en", "zh"];
  var LI = { th: 0, en: 1, zh: 2 };
  var STATUS = { FOUND: "found", NOT_FOUND: "notFound", ADDED: "added", ABSENT: "absentConfirmed" };
  var READ_ST = { found: 1, added: 1, absentConfirmed: 1 };
  /* Okabe-Ito colours (colour-blind safe); every line also carries its number and name, never colour alone */
  var COLORS = { life: "#D55E00", head: "#0072B2", heart: "#CC79A7", fate: "#009E73", sun: "#E69F00", mercury: "#56B4E9",
    marriage: "#F0E442", girdle: "#000000", bracelet: "#999999", simian: "#CC79A7" };
  /* may the finder report the line as found? Minor lines stay guide-only until the field false-line gate (<= 5 %) is measured
     (acceptance sheet M6-M8); the finder still scores them, the score is shown only as "not clear". */
  var AUTO = { life: true, head: true, heart: true, fate: true, sun: false, mercury: false, marriage: false, girdle: false, bracelet: false, simian: false };
  /* confidence thresholds per line, PROVISIONAL (set on the synthetic set only) */
  var THRESH = { life: 0.5, head: 0.5, heart: 0.5, fate: 0.55, sun: 0.6, mercury: 0.6, marriage: 0.65, girdle: 0.65, bracelet: 0.6, simian: 0.7, PROVISIONAL: true };
  var STORE_KEY = "lq-palm-v2";
  var MIN_TRACE = 0.08; // palm widths: a shorter trace is refused

  var clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  var lerp = function (a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  var r4 = function (v) { return Math.round(v * 1e4) / 1e4; };
  var sigmoid = function (x) { return 1 / (1 + Math.exp(-x)); };
  /** drop floating-point noise (1e-12) so a knuckle maps to exactly 0 / 1 */
  var clean = function (v) { return Math.round(v * 1e9) / 1e9 + 0; };
  var lang3 = function (l) { return LI[l] == null ? "th" : l; };

  /* ================= UI strings (TH / EN / ZH) ================= */
  var UI = {
    "status.found": ["พบ", "Found", "已找到"],
    "status.notFound": ["ไม่พบในภาพ", "Not found in this photo", "照片中未找到"],
    "status.added": ["เพิ่มเอง", "Added by you", "自行添加"],
    "status.absentConfirmed": ["มือฉันไม่มีเส้นนี้", "My hand doesn't have this line", "我的手没有这条线"],
    "status.unclear": ["ไม่ชัดในภาพนี้", "Not clear in this photo", "此照片中不清楚"],
    "status.outside": ["อยู่นอกภาพ", "Outside the photo", "不在照片范围内"],
    "readingUsesOnly": ["คำอ่านใช้เฉพาะเส้นที่พบและเส้นที่คุณยืนยัน", "The reading uses only lines that were found or that you confirmed", "解读只使用已找到或您确认过的掌纹"],
    "consent.other": ["ถ่ายภาพมือของคนอื่นได้เฉพาะเมื่อเจ้าของมือรู้และยินยอมแล้วเท่านั้น ภาพไม่ถูกบันทึกและไม่ถูกส่งออกจากเครื่องนี้",
      "Photograph another person's hand only when they know and agree. The photo is not saved and does not leave this device.",
      "仅在对方知情并同意的情况下拍摄其手掌。照片不会被保存，也不会离开本设备。"],
    "consent.box": ["เจ้าของมือรู้และยินยอมแล้ว", "They know and agree", "对方已知情并同意"],
    "capture.beforeGreen": ["ถ่ายก่อนกรอบเป็นสีเขียว เส้นบางเส้นอาจไม่ชัดในภาพนี้", "Taken before the outline turned green: some lines may not be clear in this photo", "在轮廓变绿前拍摄：部分掌纹在此照片中可能不清楚"],
    "capture.lowRes": ["ภาพละเอียดไม่พอสำหรับเส้นรอง ระบบหาเฉพาะเส้นหลัก", "The photo is not detailed enough for the minor lines; only the main lines are looked for", "照片分辨率不足以识别细纹，只查找主要掌纹"],
    "btn.trace": ["วาดเส้นนี้", "Trace this line", "描这条线"],
    "btn.absent": ["มือฉันไม่มีเส้นนี้", "My hand doesn't have this line", "我的手没有这条线"],
    "btn.remove": ["ลบเส้นนี้", "Remove this line", "删除这条线"],
    "btn.adjust": ["ปรับเส้น", "Adjust", "调整"],
    "btn.undo": ["ย้อนสถานะ", "Undo", "撤销"],
    "btn.done": ["เสร็จ", "Done", "完成"],
    "trace.help": ["ลากนิ้วตามเส้นในภาพ ตามแนวเส้นประ แล้วยกนิ้ว", "Drag your finger along the line in the photo, following the dashed guide, then lift", "沿着照片中的掌纹、顺着虚线拖动手指，然后松开"],
    "trace.tooShort": ["เส้นสั้นเกินไป ลากให้ยาวตามเส้นในมือ", "Too short: trace along the line on your hand", "太短了：请沿着手上的掌纹描画"],
    "adjust.help": ["ลากจุดกลมเพื่อปรับเส้น", "Drag the round handles to adjust the line", "拖动圆点调整掌纹"],
    "legend": ["เส้นทึบ = พบในภาพ · เส้นประ = ไม่พบในภาพ (ไม่ได้นำมาอ่าน) · ✋ = เพิ่มเอง", "Solid = found in the photo · Dashed = not found in this photo (not read) · ✋ = added by you",
      "实线 = 照片中找到 · 虚线 = 照片中未找到（不参与解读）· ✋ = 自行添加"],
    "guide.note": ["เส้นประคือตำแหน่งที่ตำรามักพบเส้นนั้น ไม่ใช่เส้นที่พบในภาพ", "A dashed line shows where the line usually lies; it was not found in this photo", "虚线表示该掌纹通常的位置，并非照片中找到的掌纹"],
    "mode.self": ["ถ่ายมือตัวเอง", "My own hand", "拍自己的手"],
    "mode.other": ["ถ่ายมือคนอื่น (กล้องหลัง)", "Another person's hand (rear camera)", "拍别人的手（后置摄像头）"],
    "side.left": ["มือซ้าย", "Left hand", "左手"], "side.right": ["มือขวา", "Right hand", "右手"],
    "school.label": ["สำนัก", "School", "流派"],
    "tap.wrist": ["แตะกลางข้อมือ", "Tap the middle of the wrist", "点按手腕中央"],
    "tap.indexBase": ["แตะรอยพับโคนนิ้วชี้", "Tap the crease at the base of the index finger", "点按食指根部的折痕"],
    "tap.pinkyBase": ["แตะรอยพับโคนนิ้วก้อย", "Tap the crease at the base of the little finger", "点按小指根部的折痕"],
    "tap.indexTip": ["แตะปลายนิ้วชี้", "Tap the tip of the index finger", "点按食指指尖"],
    "tap.middleTip": ["แตะปลายนิ้วกลาง", "Tap the tip of the middle finger", "点按中指指尖"],
    "tap.ringTip": ["แตะปลายนิ้วนาง", "Tap the tip of the ring finger", "点按无名指指尖"],
    "tap.pinkyTip": ["แตะปลายนิ้วก้อย", "Tap the tip of the little finger", "点按小指指尖"],
    "tap.why": ["แตะ 7 จุดบนภาพ ระบบใช้จุดเหล่านี้กำหนดกรอบฝ่ามือ", "Tap 7 points on the photo; they set the palm frame", "在照片上点按 7 个点，用来确定手掌框架"],
    "detect.busy": ["กำลังหาเส้นจากภาพ...", "Looking for lines in the photo...", "正在照片中查找掌纹..."],
    "list.title": ["เส้นบนฝ่ามือ", "Lines on the palm", "手掌上的掌纹"],
    "reading.title": ["คำอ่านตามตำรา", "Reading by tradition", "传统解读"],
    "belief": ["ตามความเชื่อ โปรดใช้วิจารณญาณ", "According to belief, please use your own judgement", "依据传统信仰，请自行判断"],
    "privacy": ["ภาพอยู่ในเครื่องนี้เท่านั้น ไม่ถูกบันทึกและไม่ถูกส่งออก เส้นที่คุณวาดเก็บเฉพาะในแท็บนี้",
      "The photo stays on this device and is neither saved nor sent. Lines you draw are kept in this tab only.",
      "照片只留在本设备上，不保存也不发送。你描画的掌纹只保存在此标签页中。"],
    "lm.label": ["จุดบนมืออัตโนมัติ (โมเดลทดลอง ใบอนุญาตรอทนายยืนยัน ปิดในเวอร์ชันลูกค้า)", "Automatic hand points (trial model; licence awaiting legal review; off in customer builds)",
      "自动手部关键点（试用模型；许可待法律确认；客户版关闭）"],
    "draft.school": ["ร่างคำอ่าน รอผู้เชี่ยวชาญตรวจ", "Draft reading, awaiting the expert check", "解读草稿，待专家审核"],
    /* pre-capture guidance: owner-approved wording, decision 172 (2026-11-20), EXACT (byte for byte; do not edit) */
    "tips.guide": ["ถ่ายข้างหน้าต่างให้แสงส่องฝ่ามือจากด้านข้าง ไม่ใช่จากด้านหน้า ปิดแฟลช (ตั้งเป็น 'ปิด' ไม่ใช่ 'อัตโนมัติ') ปล่อยมือสบาย ๆ งุ้มเล็กน้อย ไม่ต้องเหยียดตึง และให้เห็นทั้งฝ่ามือและนิ้วอยู่ในกรอบ",
      "Stand beside a window so the light falls across your palm from the side, not from the front. Turn the flash off (set it to 'off', not 'auto'). Keep your hand relaxed and slightly cupped, not stretched flat, with the whole palm and fingers inside the frame.",
      "站在窗边，让光线从侧面照到手掌，而不是从正面。关闭闪光灯（设为“关闭”，不要用“自动”）。手放松、略微弯曲，不要用力伸平，并让整个手掌和手指都在画面内。"],
    /* the retake message: owner decision 179 ก (2026-11-20), EXACT (byte for byte; do not edit) */
    "quality.retake": ["ภาพเล็กเกินไปหรือสว่างจ้าจากแฟลช ลองถ่ายใหม่ให้ฝ่ามือเต็มกรอบและปิดแฟลช",
      "The photo is too small or washed out by the flash. Please retake it with your palm filling the frame and the flash off.",
      "照片太小或被闪光灯照得过亮。请让手掌占满画面并关闭闪光灯后重新拍摄。"]
  };
  function T(key, lang) { var e = UI[key]; return e ? e[LI[lang3(lang)]] : key; }

  /* live hints: [self, other] x [th, en, zh] */
  var HINTS = {
    noHand: [["วางฝ่ามือในกรอบ ปล่อยมือตามสบาย", "Hold your palm inside the outline, hand relaxed", "把手掌放进轮廓内，手放松"], ["ขอให้เจ้าของมือวางฝ่ามือในกรอบ ปล่อยมือตามสบาย",
      "Ask them to hold their palm inside the outline, hand relaxed", "请对方把手掌放进轮廓内，手放松"]],
    many: [["ใช้มือเดียวในกรอบ", "One hand in the frame, please", "画面中只放一只手"], ["ใช้มือเดียวในกรอบ", "One hand in the frame, please", "画面中只放一只手"]],
    back: [["หันฝ่ามือเข้าหากล้อง", "Turn your palm towards the camera", "请将掌心朝向镜头"], ["ขอให้เขาหันฝ่ามือเข้าหากล้อง", "Ask them to turn their palm towards the camera", "请对方将掌心朝向镜头"]],
    far: [["ขยับมือเข้าใกล้อีกนิด", "Bring your hand a little closer", "手再靠近一点"], ["ขยับกล้องเข้าใกล้มืออีกนิด", "Move the phone a little closer to their hand", "把手机再靠近对方的手一点"]],
    near: [["ถอยมือออกเล็กน้อย ให้เห็นนิ้วและข้อมือครบ", "Move back a little so fingers and wrist show", "稍微后退，让手指和手腕都在画面内"],
      ["ถอยกล้องออกเล็กน้อย ให้เห็นนิ้วและข้อมือครบ", "Move the phone back a little so their fingers and wrist show", "手机稍微后退，让对方的手指和手腕都在画面内"]],
    center: [["เลื่อนมือมาไว้กลางกรอบ", "Move your hand to the centre of the outline", "把手移到轮廓中间"], ["เลื่อนกล้องให้มืออยู่กลางกรอบ", "Move the phone so their hand is in the centre",
      "移动手机，让对方的手在轮廓中间"]],
    open: [["ผ่อนมือตามสบาย นิ้วแยกกันเล็กน้อย ฝ่ามือห่อเล็กน้อย ไม่ต้องเหยียดตึง", "Relax your hand: fingers slightly apart, palm slightly cupped, not stretched flat",
      "手放松：手指稍微分开，掌心微微拱起，不要绷直撑平"], ["ขอให้เขาผ่อนมือตามสบาย นิ้วแยกกันเล็กน้อย ฝ่ามือห่อเล็กน้อย ไม่ต้องเหยียดตึง",
      "Ask them to relax their hand: fingers slightly apart, palm slightly cupped, not stretched flat", "请对方手放松：手指稍微分开，掌心微微拱起，不要绷直撑平"]],
    tilt: [["ตั้งมือให้ตรงกับกรอบ", "Straighten your hand to match the outline", "把手摆正，与轮廓对齐"], ["ขอให้เขาตั้งมือให้ตรงกับกรอบ", "Ask them to straighten their hand to match the outline",
      "请对方把手摆正，与轮廓对齐"]],
    turn: [["วางฝ่ามือให้ขนานกับกล้อง ไม่เอียงเข้าออก", "Face your palm straight at the camera, not angled", "手掌与镜头保持平行，不要倾斜"], ["ขอให้เขาวางฝ่ามือขนานกับกล้อง",
      "Ask them to face their palm straight at the camera", "请对方让手掌与镜头保持平行"]],
    dark: [["แสงน้อย ไปที่สว่างทั่วถึง เช่นแสงกลางวันจากด้านข้าง ไม่ใช้แฟลช", "Too dark: move to bright, even daylight, ideally from the side; no flash",
      "光线太暗：请到明亮均匀的日光下，最好光从侧面来，不开闪光灯"], ["แสงน้อย ไปที่สว่างทั่วถึง เช่นแสงกลางวันจากด้านข้าง ไม่ใช้แฟลช",
      "Too dark: move to bright, even daylight, ideally from the side; no flash", "光线太暗：请到明亮均匀的日光下，最好光从侧面来，不开闪光灯"]],
    bright: [["แสงจ้าเกินไป เลี่ยงแสงส่องตรง และไม่ใช้แฟลช", "Too bright: avoid direct light; no flash", "光线太强：请避开直射光，不开闪光灯"], ["แสงจ้าเกินไป เลี่ยงแสงส่องตรง และไม่ใช้แฟลช",
      "Too bright: avoid direct light; no flash", "光线太强：请避开直射光，不开闪光灯"]],
    uneven: [["แสงไม่สม่ำเสมอ ขยับให้เงาไม่ตกบนฝ่ามือ", "Uneven light: keep shadows off the palm", "光线不均匀，别让阴影落在掌心"], ["แสงไม่สม่ำเสมอ ขยับให้เงาไม่ตกบนฝ่ามือ",
      "Uneven light: keep shadows off the palm", "光线不均匀，别让阴影落在掌心"]],
    glare: [["มีแสงสะท้อนบนฝ่ามือ ไม่ใช้แฟลชหรือไฟฉาย แล้วเอียงมือเล็กน้อย", "Glare on the palm: no flash or torch, and tilt your hand slightly", "掌心有反光：不开闪光灯或手电筒，稍微调整手的角度"],
      ["มีแสงสะท้อนบนฝ่ามือ ไม่ใช้แฟลชหรือไฟฉาย แล้วปรับมุมกล้อง", "Glare on the palm: no flash or torch, and change the angle", "掌心有反光：不开闪光灯或手电筒，调整拍摄角度"]],
    blur: [["ภาพไม่ชัด เช็ดเลนส์แล้วถือให้นิ่ง", "Blurry: wipe the lens and hold still", "画面模糊，请擦拭镜头并保持稳定"], ["ภาพไม่ชัด เช็ดเลนส์แล้วถือกล้องให้นิ่ง",
      "Blurry: wipe the lens and hold the phone still", "画面模糊，请擦拭镜头并拿稳手机"]],
    still: [["ถือนิ่ง ๆ สักครู่", "Hold still for a moment", "请保持不动"], ["ขอให้เขาถือมือนิ่ง ๆ สักครู่", "Ask them to hold still for a moment", "请对方保持不动"]],
    ok: [["ดีแล้ว ถือนิ่ง ๆ", "Good, hold still", "很好，请保持不动"], ["ดีแล้ว ถือนิ่ง ๆ", "Good, hold still", "很好，请保持不动"]]
  };
  function hintText(id, lang, other) { var h = HINTS[id] || HINTS.noHand; return h[other ? 1 : 0][LI[lang3(lang)]]; }

  function lineName(id, school, lang) { var n = KB.NAMES[id]; if (!n) return ""; return (n[school] || n.thai)[LI[lang3(lang)]]; }
  function lineAbout(id, school, lang) { var a = id === "mercury" && school === "western" ? KB.ABOUT.mercuryWest : KB.ABOUT[id]; return a ? a[LI[lang3(lang)]] : ""; }
  function schoolName(school, lang) { var s = KB.SCHOOL_NAMES[school]; return s ? s[LI[lang3(lang)]] : school; }
  function readText(id, school, kind, lang) { var r = KB.READ[id] && KB.READ[id][school]; return r ? r[kind][LI[lang3(lang)]] : ""; }

  /* ================= guides: the usual position of each line, in the palm frame (u, v) =================
     u = 0 index knuckle -> 1 little-finger knuckle; v = 0 knuckle line -> 1 wrist. Majors from palm.js TEMPLATES; minors from
     the design (B-Draw D, textbook positions, INFERRED, expert check pending). Mercury differs by school. */
  var BASE_GUIDES = {
    life: { cp: [[-0.06, 0.32], [0.12, 0.46], [0.24, 0.62], [0.29, 0.8], [0.29, 0.98]], band: 0.09 },
    head: { cp: [[-0.07, 0.3], [0.18, 0.37], [0.42, 0.44], [0.66, 0.5], [0.86, 0.57]], band: 0.09 },
    heart: { cp: [[1.1, 0.25], [0.85, 0.22], [0.6, 0.19], [0.38, 0.15], [0.2, 0.07]], band: 0.085 },
    fate: { cp: [[0.5, 1.0], [0.5, 0.8], [0.48, 0.6], [0.46, 0.42], [0.43, 0.24]], band: 0.08 },
    sun: { cp: [[0.64, 0.45], [0.65, 0.27], [0.66, 0.08]], band: 0.06 },
    mercury: { cp: [[0.9, 0.4], [0.91, 0.26], [0.92, 0.12]], band: 0.06 },
    marriage: { cp: [[1.02, 0.1], [0.96, 0.11], [0.9, 0.12]], band: 0.04 },
    girdle: { cp: [[0.22, 0.03], [0.5, 0.09], [0.8, 0.04]], band: 0.04 },
    bracelet: { cp: [[0.15, 1.06], [0.5, 1.08], [0.9, 1.06]], band: 0.05 },
    simian: { cp: [[1.08, 0.27], [0.7, 0.28], [0.35, 0.3], [-0.06, 0.31]], band: 0.045 }
  };
  var WEST_MERCURY = { cp: [[0.7, 0.95], [0.82, 0.55], [0.95, 0.15]], band: 0.06 };
  function guides(school) {
    var out = {};
    LINES.forEach(function (id) {
      var g = id === "mercury" && school === "western" ? WEST_MERCURY : BASE_GUIDES[id];
      out[id] = { cp: g.cp.map(function (q) { return q.slice(); }), band: g.band };
    });
    return out;
  }

  /* ================= hand, palm frame ================= */
  var TAP_ORDER = ["wrist", "indexBase", "pinkyBase", "indexTip", "middleTip", "ringTip", "pinkyTip"];
  /** the 7 points a person taps -> hand (knuckles = creases moved 10 % towards the wrist; same rule as palm.js) */
  function handFromTaps(t) {
    var A = t.indexBase, B = t.pinkyBase, W = t.wrist, M = lerp(A, B, 0.5);
    var down = [(W[0] - M[0]) * 0.1, (W[1] - M[1]) * 0.1], sh = function (p) { return [p[0] + down[0], p[1] + down[1]]; };
    var a = sh(A), b = sh(B);
    return { source: "tap", wrist: W.slice(), mcp: { index: a, middle: lerp(a, b, 1 / 3), ring: lerp(a, b, 2 / 3), pinky: b },
      tip: { thumb: null, index: t.indexTip, middle: t.middleTip, ring: t.ringTip, pinky: t.pinkyTip }, thumbBase: null, pts: null };
  }
  /** any hand {wrist, mcp:{index, pinky}} -> palm frame; landmark-source independent */
  function frameFromHand(h) {
    var A = h.mcp.index, B = h.mcp.pinky, W = h.wrist, M = lerp(A, B, 0.5);
    var U = [B[0] - A[0], B[1] - A[1]], V = [W[0] - M[0], W[1] - M[1]];
    var pw = Math.hypot(U[0], U[1]), asp = Math.hypot(V[0], V[1]) / (pw || 1), det = U[0] * V[1] - U[1] * V[0];
    return {
      A: A, U: U, V: V, pw: pw, asp: asp, det: det, mirrored: det < 0,
      toImg: function (q) { return [A[0] + q[0] * U[0] + q[1] * V[0], A[1] + q[0] * U[1] + q[1] * V[1]]; },
      toUV: function (p) { var x = p[0] - A[0], y = p[1] - A[1]; return [clean((x * V[1] - y * V[0]) / det), clean((U[0] * y - U[1] * x) / det)]; }
    };
  }
  /** bounding box (image px) of the inner palm, for the capture metrics */
  function palmRoi(F, w, h) {
    var c = [[0.1, 0.15], [0.9, 0.15], [0.9, 0.9], [0.1, 0.9]].map(F.toImg);
    var xs = c.map(function (p) { return p[0]; }), ys = c.map(function (p) { return p[1]; });
    var x0 = clamp(Math.floor(Math.min.apply(null, xs)), 0, w - 1), x1 = clamp(Math.ceil(Math.max.apply(null, xs)), 1, w);
    var y0 = clamp(Math.floor(Math.min.apply(null, ys)), 0, h - 1), y1 = clamp(Math.ceil(Math.max.apply(null, ys)), 1, h);
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }

  /* ================= curves ================= */
  function catmull(cp, n) {
    n = n || 48;
    if (!cp || cp.length < 2) return cp ? cp.slice() : [];
    var out = [], m = cp.length;
    if (m === 2) { for (var j = 0; j < n; j++) out.push(lerp(cp[0], cp[1], j / (n - 1))); return out; }
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1) * (m - 1), k = Math.min(m - 2, Math.floor(t)), f = t - k;
      var p0 = cp[Math.max(0, k - 1)], p1 = cp[k], p2 = cp[k + 1], p3 = cp[Math.min(m - 1, k + 2)];
      out.push([0, 1].map(function (d) {
        return 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * f + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * f * f + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * f * f * f);
      }));
    }
    return out;
  }
  function polyLen(P, asp) { var s = 0, a = asp || 1; for (var i = 1; i < P.length; i++) s += Math.hypot(P[i][0] - P[i - 1][0], (P[i][1] - P[i - 1][1]) * a); return s; }
  function resample(P, n) {
    if (P.length < 2) return P.slice();
    var L = [0], i;
    for (i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    var tot = L[L.length - 1] || 1, out = [], j = 0;
    for (var k = 0; k < n; k++) {
      var t = tot * k / (n - 1);
      while (j < L.length - 2 && L[j + 1] < t) j++;
      var seg = (L[j + 1] - L[j]) || 1;
      out.push(lerp(P[j], P[j + 1] || P[j], clamp((t - L[j]) / seg, 0, 1)));
    }
    return out;
  }
  /** Ramer-Douglas-Peucker down to at most max points */
  function simplify(P, max) {
    if (P.length <= max) return P.slice();
    var eps = 0.002, out = P;
    for (var it = 0; it < 30 && out.length > max; it++) { out = rdp(P, eps); eps *= 1.5; }
    return out.length > max ? resample(P, max) : out;
  }
  function rdp(P, eps) {
    if (P.length < 3) return P.slice();
    var a = P[0], b = P[P.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9, best = -1, bi = 0;
    for (var i = 1; i < P.length - 1; i++) { var d = Math.abs(dy * P[i][0] - dx * P[i][1] + b[0] * a[1] - b[1] * a[0]) / L; if (d > best) { best = d; bi = i; } }
    if (best <= eps) return [a, b];
    var l = rdp(P.slice(0, bi + 1), eps), r = rdp(P.slice(bi), eps);
    return l.slice(0, -1).concat(r);
  }
  function cleanCp(cp) {
    if (!Array.isArray(cp)) return null;
    var c = cp.filter(function (q) { return Array.isArray(q) && q.length >= 2 && isFinite(q[0]) && isFinite(q[1]); }).map(function (q) { return [r4(+q[0]), r4(+q[1])]; });
    return c.length >= 2 ? simplify(c, 8) : null;
  }

  /* ================= state ================= */
  function blankLine(id) { return { id: id, status: STATUS.NOT_FOUND, cp: null, conf: 0, unclear: false, edited: false }; }
  function newState(o) {
    o = o || {};
    var st = { v: 1, side: o.side === "left" ? "left" : "right", school: SCHOOLS.indexOf(o.school) >= 0 ? o.school : "thai", asp: o.asp || 1.45, lines: {} };
    LINES.forEach(function (id) { st.lines[id] = blankLine(id); });
    return st;
  }
  /** set a line's status: found (adjusted) / added (traced) need control points; notFound = removed; absentConfirmed */
  function setLine(st, id, o) {
    var L = st && st.lines && st.lines[id];
    if (!L) return { ok: false, error: "unknown line" };
    var s = o && o.status;
    if (s === STATUS.FOUND || s === STATUS.ADDED) {
      var cp = cleanCp(o.cp);
      if (!cp) return { ok: false, error: "no line" };
      if (s === STATUS.ADDED && polyLen(cp, st.asp || 1.45) < MIN_TRACE) return { ok: false, error: "tooShort" };
      L.status = s; L.cp = cp; L.edited = true; L.unclear = false;
      return { ok: true };
    }
    if (s === STATUS.NOT_FOUND || s === STATUS.ABSENT) { L.status = s; L.cp = null; L.edited = s === STATUS.ABSENT || L.edited; if (s === STATUS.ABSENT) L.unclear = false; return { ok: true }; }
    return { ok: false, error: "bad status" };
  }
  function threshold(id) { return THRESH[id] || 0.6; }
  /** detector output -> statuses: found only at or above the line's threshold (and only for AUTO lines); below = notFound "not clear" */
  function applyDetection(st, det) {
    if (det && det.asp) st.asp = det.asp;
    var lines = (det && det.lines) || {};
    Object.keys(lines).forEach(function (id) {
      var L = st.lines[id], d = lines[id];
      if (!L || !d) return;
      if (L.status === STATUS.ADDED || L.status === STATUS.ABSENT) return; // the user's own choice stays
      var conf = clamp(+d.conf || 0, 0, 1), cp = cleanCp(d.cp);
      L.conf = Math.round(conf * 100) / 100;
      if (AUTO[id] && cp && conf >= threshold(id)) { L.status = STATUS.FOUND; L.cp = cp; L.unclear = false; L.edited = false; }
      else { L.status = STATUS.NOT_FOUND; L.cp = null; L.unclear = conf > 0.05; }
    });
    return st;
  }

  /* ================= reading, AI facts, list ================= */
  function readingFor(st, o) {
    o = o || {};
    var lang = lang3(o.lang), school = st.school, items = [];
    LINES.forEach(function (id) {
      var L = st.lines[id];
      if (!L || !READ_ST[L.status]) return;
      var kind = L.status === STATUS.ABSENT ? "a" : "p";
      items.push({ id: id, status: L.status, title: lineName(id, school, lang), text: readText(id, school, kind, lang) });
    });
    // "read it straight" (o.straight): the palm engine has no unfavourable result, so both modes read the same
    return { items: items, text: items.map(function (i) { return i.title + ": " + i.text; }).join("\n") };
  }
  /** facts for the optional AI wording: line ids, statuses and the reading sentence; no coordinates, no geometry */
  function aiFacts(st, o) {
    var lang = lang3(o && o.lang);
    return { page: "palm-v2", school: st.school, side: st.side, lang: lang,
      lines: readingFor(st, { lang: lang }).items.map(function (i) { return { id: i.id, status: i.status, name: i.title, meaning: i.text }; }) };
  }
  function listRows(st, lang) {
    lang = lang3(lang);
    return LINES.map(function (id, i) {
      var L = st.lines[id];
      var row = { id: id, num: i + 1, name: lineName(id, st.school, lang), status: L.status, label: T("status." + L.status, lang), about: lineAbout(id, st.school, lang),
        unclear: !!(L.status === STATUS.NOT_FOUND && L.unclear), note: "" };
      if (row.unclear) row.note = T("status.unclear", lang);
      if (L.status === STATUS.NOT_FOUND && L.outside) row.note = T("status.outside", lang);
      return row;
    });
  }
  function allTexts() {
    var out = [];
    SCHOOLS.forEach(function (school) {
      LINES.forEach(function (id) {
        LANGS.forEach(function (lang) {
          out.push({ kind: "name", school: school, line: id, lang: lang, text: lineName(id, school, lang) });
          out.push({ kind: "about", school: school, line: id, lang: lang, text: lineAbout(id, school, lang) });
          out.push({ kind: "present", school: school, line: id, lang: lang, text: readText(id, school, "p", lang) });
          out.push({ kind: "absent", school: school, line: id, lang: lang, text: readText(id, school, "a", lang) });
        });
      });
      LANGS.forEach(function (lang) { out.push({ kind: "ui", key: "school." + school, lang: lang, text: schoolName(school, lang) }); });
    });
    Object.keys(UI).forEach(function (k) { LANGS.forEach(function (lang) { out.push({ kind: "ui", key: k, lang: lang, text: T(k, lang) }); }); });
    ["left", "right"].forEach(function (d) { LANGS.forEach(function (lang) {
      out.push({ kind: "ui", key: "side.ask." + d, lang: lang, text: sideAskText(d, d === "left" ? "right" : "left", lang) }); }); });
    Object.keys(HINTS).forEach(function (k) { [0, 1].forEach(function (o) { LANGS.forEach(function (lang) { out.push({ kind: "hint", key: k + (o ? ".other" : ""), lang: lang,
      text: hintText(k, lang, !!o) }); }); }); });
    return out;
  }

  /* ================= storage: line geometry only ================= */
  function serialize(st) {
    return JSON.stringify({ v: 1, side: st.side === "left" ? "left" : "right", school: SCHOOLS.indexOf(st.school) >= 0 ? st.school : "thai",
      lines: LINES.map(function (id) {
        var L = st.lines[id] || blankLine(id), o = { id: id, status: L.status };
        var cp = L.status === STATUS.FOUND || L.status === STATUS.ADDED ? cleanCp(L.cp) : null;
        if (cp) o.cp = cp.slice(0, 12);
        return o;
      }) });
  }
  function deserialize(s) {
    var o;
    try { o = JSON.parse(s); } catch (e) { return null; }
    if (!o || o.v !== 1 || !Array.isArray(o.lines)) return null;
    var st = newState({ side: o.side, school: o.school });
    o.lines.forEach(function (l) {
      if (!l || LINES.indexOf(l.id) < 0) return;
      if (l.status === STATUS.FOUND || l.status === STATUS.ADDED) { var cp = cleanCp(l.cp); if (cp) { st.lines[l.id].status = l.status; st.lines[l.id].cp = cp; } }
      else if (l.status === STATUS.ABSENT) st.lines[l.id].status = STATUS.ABSENT;
    });
    // lines of unknown ids are dropped
    var keep = {}; LINES.forEach(function (id) { keep[id] = st.lines[id]; }); st.lines = keep;
    return st;
  }

  /* ================= the one drawing layer: screen, print and share ================= */
  /** draws the lines of st on ctx. target: "screen" | "print" | "share". opts: {toPx(uv) -> [x, y], lang, scale, focus}
      found / added: solid in the line's colour on a contrasting halo, numbered and named (added: + "✋ added by you");
      notFound: faint dashed guide, hollow dashed end ring, "? not found in this photo" (never on the share card);
      absentConfirmed: nothing. Heart / head guides are hidden while a simian line is shown. */
  function drawLineLayer(ctx, st, target, opts) {
    opts = opts || {};
    var toPx = opts.toPx, sc = opts.scale || 1, lang = lang3(opts.lang), school = st.school, G = guides(school);
    var simian = st.lines.simian && (st.lines.simian.status === STATUS.FOUND || st.lines.simian.status === STATUS.ADDED);
    var px = function (cp) { return catmull(cp, 40).map(toPx); };
    var path = function (P) { ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (var i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]); };
    var small = Math.round(10 * sc) + "px system-ui, sans-serif";
    var font = Math.round(12 * sc) + "px system-ui, -apple-system, 'Noto Sans Thai', 'Noto Sans SC', sans-serif";
    var label = function (text, at, color, faint) {
      ctx.save();
      ctx.setLineDash([]);
      ctx.font = faint ? small : font; ctx.textBaseline = "middle";
      var w = ctx.measureText(text).width, h = 16 * sc, x = clamp(at[0] + 6 * sc, 2, Math.max(2, (ctx.canvas && ctx.canvas.width || 9999) - w - 10 * sc)), y = at[1];
      ctx.globalAlpha = faint ? 0.72 : 0.9;
      ctx.fillStyle = faint ? "rgba(30,30,30,0.75)" : "rgba(255,255,255,0.92)";
      ctx.fillRect(x - 3 * sc, y - h / 2, w + 6 * sc, h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = faint ? "#f2f2f2" : (color === "#F0E442" || color === "#999999" ? "#222222" : color);
      ctx.fillText(text, x, y);
      ctx.restore();
    };
    var order = LINES.slice();
    // guides first (under), then the drawn lines on top
    if (target !== "share") order.forEach(function (id) {
      var L = st.lines[id];
      if (!L || L.status !== STATUS.NOT_FOUND || L.outside) return;
      if (simian && (id === "heart" || id === "head")) return;
      var P = px(G[id].cp), end = P[P.length - 1];
      ctx.save();
      ctx.lineCap = "butt"; ctx.lineJoin = "round";
      ctx.setLineDash([7 * sc, 6 * sc]);
      ctx.globalAlpha = 0.35; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 3.6 * sc; path(P); ctx.stroke();
      ctx.globalAlpha = 0.45; ctx.strokeStyle = target === "print" ? "#6b6b6b" : "#f4f4f4"; ctx.lineWidth = 1.8 * sc; path(P); ctx.stroke();
      ctx.setLineDash([2 * sc, 2 * sc]);
      ctx.beginPath(); ctx.arc(end[0], end[1], 4.5 * sc, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      label("? " + (LINES.indexOf(id) + 1) + " " + T("status.notFound", lang), end, null, true);
    });
    order.forEach(function (id) {
      var L = st.lines[id];
      if (!L || !(L.status === STATUS.FOUND || L.status === STATUS.ADDED) || !L.cp) return;
      var P = px(L.cp), col = COLORS[id], end = P[P.length - 1];
      ctx.save();
      ctx.setLineDash([]);
      ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.globalAlpha = 1;
      ctx.strokeStyle = id === "girdle" ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.7)"; ctx.lineWidth = 5.5 * sc; path(P); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 3 * sc; path(P); ctx.stroke();
      if (id === "bracelet") { ctx.lineWidth = 1 * sc; ctx.strokeStyle = "#ffffff"; path(P); ctx.stroke(); }
      if (opts.focus === id && target === "screen") { // handles for adjusting
        L.cp.map(toPx).forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 7 * sc, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.lineWidth = 2 * sc;
          ctx.strokeStyle = col; ctx.stroke(); });
      }
      ctx.restore();
      var txt = (LINES.indexOf(id) + 1) + " " + lineName(id, school, lang) + (L.status === STATUS.ADDED ? " · ✋ " + T("status.added", lang) : "");
      label(txt, end, col, false);
    });
  }

  /* ================= capture: metrics, hints, shutter, still, consent ================= */
  /* PROVISIONAL: set on the synthetic hand (tests/fixtures/palm-v2/synth-hand.js); to calibrate on consented real photos
     (design B2.5: bad photos accepted <= 5 %, good rejected <= 10 %, per phone) */
  var CAPTURE_T = { PROVISIONAL: true, medLo: 90, medHi: 215, p5Lo: 30, clip: 0.02, blob: 0.005, uneven: 1.8, sharp: 6, fillLo: 0.15, fillHi: 0.85, offset: 0.25, tilt: 20 };
  /** metrics of the inner palm (roi {x,y,w,h}, image px), resampled to 160 px wide */
  function captureMetrics(rgba, w, h, roi) {
    roi = roi || { x: 0, y: 0, w: w, h: h };
    var W = 160, H = Math.max(8, Math.round(W * roi.h / roi.w)), n = W * H, Y = new Float32Array(n), clip = new Uint8Array(n), i, x, y;
    var fx = roi.w / W, fy = roi.h / H;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) { // box average of the source block (no aliasing of the fine lines)
      var sx0 = Math.floor(roi.x + x * fx), sy0 = Math.floor(roi.y + y * fy), sx1 = Math.max(sx0 + 1, Math.floor(roi.x + (x + 1) * fx)), sy1 = Math.max(sy0 + 1, Math.floor(roi.y + (y + 1) * fy));
      var acc = 0, cnt = 0, cl = 0, stp = Math.max(1, Math.floor((sx1 - sx0) / 4));
      for (var yy = sy0; yy < sy1 && yy < h; yy += stp) for (var xx = sx0; xx < sx1 && xx < w; xx += stp) {
        var j = (yy * w + xx) * 4, r = rgba[j], g = rgba[j + 1], b = rgba[j + 2];
        acc += 0.299 * r + 0.587 * g + 0.114 * b; cnt++;
        if (r >= 250 || g >= 250 || b >= 250) cl++;
      }
      i = y * W + x; Y[i] = cnt ? acc / cnt : 0; clip[i] = cl * 2 > cnt ? 1 : 0;
    }
    var srt = Array.prototype.slice.call(Y).sort(function (a, b) { return a - b; });
    var q = function (p) { return srt[Math.min(n - 1, Math.floor(n * p))]; };
    var med = q(0.5), p5 = q(0.05), p95 = q(0.95);
    var nClip = 0; for (i = 0; i < n; i++) nClip += clip[i];
    var blob = largestComponent(clip, W, H);
    // evenness: 3 x 3 cells, max / min of the cell medians
    var cells = [];
    for (var cy = 0; cy < 3; cy++) for (var cx = 0; cx < 3; cx++) {
      var vs = [];
      for (y = Math.floor(cy * H / 3); y < Math.floor((cy + 1) * H / 3); y++) for (x = Math.floor(cx * W / 3); x < Math.floor((cx + 1) * W / 3); x++) vs.push(Y[y * W + x]);
      vs.sort(function (a, b) { return a - b; }); cells.push(vs[Math.floor(vs.length / 2)] || 0);
    }
    var uneven = Math.max.apply(null, cells) / Math.max(1, Math.min.apply(null, cells));
    // sharpness: variance of the Laplacian (after a light blur) over the squared mean
    var B = blur3(Y, W, H), lap = 0, lap2 = 0, m = 0;
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) { i = y * W + x; var L = B[i - 1] + B[i + 1] + B[i - W] + B[i + W] - 4 * B[i]; lap += L; lap2 += L * L; m++; }
    var lm = lap / m, sharp = (lap2 / m - lm * lm) / Math.max(1, (med * med) / 1e4);
    return { med: med, p5: p5, p95: p95, clip: nClip / n, blob: blob / n, uneven: uneven, sharp: sharp, w: W, h: H };
  }
  function blur3(src, w, h) {
    var out = new Float32Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var s = 0, c = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        var k = (dx ? 1 : 2) * (dy ? 1 : 2); s += src[yy * w + xx] * k; c += k; }
      out[y * w + x] = s / c;
    }
    return out;
  }
  function largestComponent(mask, w, h) {
    var seen = new Uint8Array(w * h), best = 0, stack = [];
    for (var i = 0; i < w * h; i++) {
      if (!mask[i] || seen[i]) continue;
      var cnt = 0; stack.push(i); seen[i] = 1;
      while (stack.length) {
        var p = stack.pop(), x = p % w, y = (p - x) / w; cnt++;
        if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
        if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
        if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
        if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
      }
      if (cnt > best) best = cnt;
    }
    return best;
  }
  /** first failing check, in the faceread order: frame, then pose, then light, sharpness and stillness */
  function captureHint(o) {
    var m = o.metrics || {}, h = o.hand || {}, C = CAPTURE_T;
    if (!h.found) return "noHand";
    if ((h.count || 1) > 1) return "many";
    if (h.back) return "back";
    if (h.fill != null && h.fill < C.fillLo) return "far";
    if (h.fill != null && h.fill > C.fillHi) return "near";
    if (h.offset != null && h.offset > C.offset) return "center";
    if (h.open === false) return "open";
    if (h.tilt != null && Math.abs(h.tilt) > C.tilt) return "tilt";
    if (h.turn) return "turn";
    if (m.med != null && (m.med < C.medLo || m.p5 < C.p5Lo)) return "dark";
    if (m.med != null && m.med > C.medHi) return "bright";
    if (m.uneven != null && m.uneven > C.uneven) return "uneven";
    if (m.clip != null && (m.clip > C.clip || m.blob > C.blob)) return "glare";
    if (m.sharp != null && m.sharp < C.sharp) return "blur";
    if (h.still === false) return "still";
    return "ok";
  }
  /** a hand from the skin colour alone (no landmark model): found, count, fill, offset, open, tilt; image downscaled to 160 px */
  function handFromSkin(rgba, w, h) {
    var W = 160, H = Math.max(8, Math.round(W * h / w)), n = W * H, m = new Uint8Array(n), x, y, i;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var j = (Math.min(h - 1, Math.floor((y + 0.5) * h / H)) * w + Math.min(w - 1, Math.floor((x + 0.5) * w / W))) * 4, r = rgba[j], g = rgba[j + 1], b = rgba[j + 2];
      var cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b, yy = 0.299 * r + 0.587 * g + 0.114 * b;
      m[y * W + x] = yy > 40 && cr > 133 && cr < 180 && cb > 77 && cb < 130 && r > b ? 1 : 0;
    }
    // components
    var lab = new Int32Array(n), comps = [], stack = [];
    for (i = 0; i < n; i++) {
      if (!m[i] || lab[i]) continue;
      var id = comps.length + 1, c = { n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, x0: W, x1: 0, y0: H, y1: 0 };
      lab[i] = id; stack.push(i);
      while (stack.length) {
        var p = stack.pop(), px = p % W, py = (p - px) / W;
        c.n++; c.sx += px; c.sy += py; c.sxx += px * px; c.syy += py * py; c.sxy += px * py;
        if (px < c.x0) c.x0 = px; if (px > c.x1) c.x1 = px; if (py < c.y0) c.y0 = py; if (py > c.y1) c.y1 = py;
        [p - 1, p + 1, p - W, p + W].forEach(function (q, k) {
          if (q < 0 || q >= n || (k === 0 && px === 0) || (k === 1 && px === W - 1)) return;
          if (m[q] && !lab[q]) { lab[q] = id; stack.push(q); }
        });
      }
      c.id = id; comps.push(c);
    }
    comps.sort(function (a, b) { return b.n - a.n; });
    var big = comps[0];
    if (!big || big.n < n * 0.02) return { found: false, count: 0 };
    var count = comps.filter(function (c) { return c.n >= big.n * 0.25; }).length;
    var mx = big.sx / big.n, my = big.sy / big.n, cxx = big.sxx / big.n - mx * mx, cyy = big.syy / big.n - my * my, cxy = big.sxy / big.n - mx * my;
    var tilt = 0.5 * Math.atan2(2 * cxy, cyy - cxx) * 180 / Math.PI; // angle of the major axis from vertical
    var fill = ((big.x1 - big.x0 + 1) * (big.y1 - big.y0 + 1)) / n;
    var offset = Math.hypot(mx / W - 0.5, my / H - 0.5);
    // open hand: in the top part of the blob, a row crosses >= 3 separate fingers
    var runsMax = 0, bh = big.y1 - big.y0 + 1;
    for (y = big.y0 + Math.floor(bh * 0.08); y <= big.y0 + Math.floor(bh * 0.3); y++) {
      var runs = 0, on = false, len = 0;
      for (x = big.x0; x <= big.x1; x++) {
        var s = lab[y * W + x] === big.id;
        if (s) { len++; if (!on) on = true; } else { if (on && len >= 2) runs++; on = false; len = 0; }
      }
      if (on && len >= 2) runs++;
      if (runs > runsMax) runsMax = runs;
    }
    return { found: true, count: count, fill: fill, offset: offset, open: runsMax >= 3, tilt: tilt, back: false, fingers: runsMax };
  }
  /** automatic capture: a steady green count of countMs fires once; movement restarts the count; re-armed after rearmMs off green */
  function createAutoShutter(o) {
    o = o || {};
    var countMs = o.countMs || 2400, rearmMs = o.rearmMs || 1500, armed = true, start = null, offSince = null;
    return {
      feed: function (f) {
        var now = f.now;
        if (!f.ok) { start = null; if (offSince == null) offSince = now; if (!armed && now - offSince >= rearmMs) armed = true; return { fire: false, counting: false }; }
        offSince = null;
        if (f.moved || start == null) start = now;
        if (!armed) return { fire: false, counting: false };
        var left = countMs - (now - start);
        if (left <= 0) { armed = false; start = null; return { fire: true, counting: false }; }
        return { fire: false, counting: true, left: left };
      },
      manual: function (f) { return { fire: true, beforeGreen: !(f && f.ok) }; },
      reset: function () { armed = true; start = null; offSince = null; }
    };
  }
  function stillPlan(o) {
    if (o.hasImageCapture) return { method: "takePhoto" };
    return { method: "trackFrame", width: o.videoWidth, height: o.videoHeight };
  }
  /** the full-resolution still: ImageCapture.takePhoto() when it works, else the track frame at the track's full size; never
      the preview (the element's on-screen size), never downscaled */
  function grabStill(o) {
    var IC = o.ImageCapture, track = o.track, video = o.video;
    var mk = o.createCanvas || function (w, h) { var c = root.document.createElement("canvas"); c.width = w; c.height = h; return c; };
    var decode = o.decode || function (b) { return root.createImageBitmap(b, { imageOrientation: "from-image" }); };
    var frame = function () {
      var w = video.videoWidth, h = video.videoHeight;
      if (!(w > 0 && h > 0)) return Promise.reject(new Error("no video frame"));
      var c = mk(w, h);
      c.getContext("2d").drawImage(video, 0, 0, w, h);
      return Promise.resolve({ source: "trackFrame", width: w, height: h, image: c });
    };
    if (typeof IC === "function" && track && track.readyState !== "ended") {
      var p;
      try {
        var ic = new IC(track);
        // no flash (owner order 2026-11-20): ask for fillLightMode "off" when the track lists it; otherwise the plain call
        var caps = typeof ic.getPhotoCapabilities === "function" ? Promise.resolve().then(function () { return ic.getPhotoCapabilities(); }).catch(function () { return null; }) :
          Promise.resolve(null);
        p = caps.then(function (c) { var set = photoSettings(c); return set ? ic.takePhoto(set) : ic.takePhoto(); });
      } catch (e) { p = Promise.reject(e); }
      return Promise.resolve(p).then(function (blob) {
        if (!blob) throw new Error("no photo");
        return decode(blob).then(function (img) { return { source: "takePhoto", width: img.width, height: img.height, image: img }; });
      }).catch(function () { return frame(); });
    }
    return frame();
  }
  /** takePhoto settings: the flash off where the track supports it (never "flash" or "auto") */
  function photoSettings(caps) {
    var m = caps && caps.fillLightMode;
    return Array.isArray(m) && m.indexOf("off") >= 0 ? { fillLightMode: "off" } : null;
  }
  /** camera options for LQCam.create: rear camera, the torch never turned on (owner order 2026-11-20: no flash) */
  var CAM_OPTS = { facing: "environment", torch: false };

  /* ================= photo minimum (owner order 2026-11-20) =================
     PROVISIONAL first values, accepted by the owner to calibrate on the pilot (trial 2: flash S x 10^4 0.72-0.85, dim light 0.98-1.11,
     daylight 1.17-2.17; blown-out 12 % and 67 % with flash). Uploads: palm width and blow-out; camera stills taken on green: blow-out only
     (the live hints already gate size before the shutter); a manual still before green: the full minimum (170 ก). Owner decision 171 ก (2026-11-20): sharpness is NOT part of the minimum (the best real
     photo pair scored S x 10^4 0.42-0.99); photoQuality still measures it as a value to look at only; it never blocks a photo and is
     never shown to the user. */
  var UPLOAD_MIN = { PROVISIONAL: true, pw: 360, clip: 0.02 };
  var GK5 = [0.0545, 0.2442, 0.4026, 0.2442, 0.0545]; // Gaussian, sigma 1
  /** the B2.3 measure on the palm ROI (u 0..1, v 0.05..0.95 of the palm frame) resampled to 256 px wide (box average of the source):
      sharp = S x 10^4, S = variance of the 4-neighbour Laplacian of the sigma-1 Gaussian of Y (BT.601) / mean(Y)^2; clip = share of
      ROI pixels with a channel >= 250; pw = index-to-little-finger knuckle distance (image px; o.pw when rgba is a scaled crop) */
  function photoQuality(rgba, w, h, hand, o) {
    var F = frameFromHand(hand), RW = 256, RH = Math.max(8, Math.round(0.9 * F.asp * 256)), n = RW * RH, Y = new Float32Array(n), nclip = 0, x, y, i;
    var k = Math.max(1, Math.min(4, Math.ceil(F.pw / 256)));
    for (y = 0; y < RH; y++) for (x = 0; x < RW; x++) {
      var r = 0, g = 0, b = 0, c = 0;
      for (var sy = 0; sy < k; sy++) for (var sx = 0; sx < k; sx++) {
        var p = F.toImg([(x + (sx + 0.5) / k) / RW, 0.05 + 0.9 * (y + (sy + 0.5) / k) / RH]);
        var px = clamp(Math.floor(p[0]), 0, w - 1), py = clamp(Math.floor(p[1]), 0, h - 1), j = (py * w + px) * 4;
        r += rgba[j]; g += rgba[j + 1]; b += rgba[j + 2]; c++;
      }
      r /= c; g /= c; b /= c;
      Y[y * RW + x] = 0.299 * r + 0.587 * g + 0.114 * b;
      if (r >= 250 || g >= 250 || b >= 250) nclip++;
    }
    var mean = 0; for (i = 0; i < n; i++) mean += Y[i]; mean /= n;
    var G1 = new Float32Array(n), G2 = new Float32Array(n), s, t;
    for (y = 0; y < RH; y++) for (x = 0; x < RW; x++) { s = 0; for (t = -2; t <= 2; t++) s += GK5[t + 2] * Y[y * RW + clamp(x + t, 0, RW - 1)]; G1[y * RW + x] = s; }
    for (y = 0; y < RH; y++) for (x = 0; x < RW; x++) { s = 0; for (t = -2; t <= 2; t++) s += GK5[t + 2] * G1[clamp(y + t, 0, RH - 1) * RW + x]; G2[y * RW + x] = s; }
    var ls = 0, ls2 = 0, ln = 0;
    for (y = 3; y < RH - 3; y++) for (x = 3; x < RW - 3; x++) { i = y * RW + x; var L = G2[i - 1] + G2[i + 1] + G2[i - RW] + G2[i + RW] - 4 * G2[i]; ls += L; ls2 += L * L; ln++; }
    var lapVar = ln ? ls2 / ln - (ls / ln) * (ls / ln) : 0;
    return { pw: (o && o.pw) || F.pw, sharp: lapVar / (mean * mean + 1e-6) * 1e4, clip: nclip / n, mean: mean };
  }
  /** which limits a photo misses: source "upload" (default) checks pw and clip; "camera" checks clip only, except a still taken with
      the manual button before the outline turned green (o.beforeGreen, owner decision 170 ก, 2026-11-20), which must pass the full
      minimum (pw and clip) because the live hints never confirmed its size; sharpness never (171 ก) */
  function qualityVerdict(q, o) {
    var M = UPLOAD_MIN, cam = o && o.source === "camera" && !o.beforeGreen, fails = [];
    var num = function (x) { return typeof x === "number" && x === x; }; // a missing, null or NaN measure fails closed
    if (!cam && !(num(q.pw) && q.pw >= M.pw)) fails.push("pw");
    if (!(num(q.clip) && q.clip <= M.clip)) fails.push("clip");
    return { ok: fails.length === 0, fails: fails };
  }

  /* ================= handedness (owner order 2026-11-20: the landmark model's label was reversed on 6 / 6 rear-camera photos) =====
     Decided from the thumb position relative to the palm only; the model's handedness label is NOT read. Palm side, image not
     mirrored: with the fingers up, a right hand has its thumb (and index knuckle) on the image right. A mirrored image (front camera
     preview, mirrored selfie) flips that; facing "user" counts as mirrored unless o.mirrored says what the pixels are. */
  var flipSide = function (s) { return s === "left" ? "right" : s === "right" ? "left" : s; };
  function handSide(o) {
    o = o || {};
    var h = o.hand, none = { side: null, raw: null, by: null, conf: 0, mirrored: false };
    if (!h || !h.wrist || !h.mcp || !h.mcp.index || !h.mcp.pinky) return none;
    var W = h.wrist, I = h.mcp.index, P = h.mcp.pinky, C = lerp(I, P, 0.5), Mm = h.mcp.middle || C;
    var b = [Mm[0] - W[0], Mm[1] - W[1]], bl = Math.hypot(b[0], b[1]), pw = Math.hypot(I[0] - P[0], I[1] - P[1]);
    if (!(bl > 0 && pw > 0)) return none;
    var perp = [-b[1] / bl, b[0] / bl]; // the image right when the fingers point up
    var off = function (q) { return ((q[0] - W[0]) * perp[0] + (q[1] - W[1]) * perp[1]) / pw; };
    var idx = off(I) - off(P), th = h.tip && h.tip.thumb ? off(h.tip.thumb) - off(C) : null, s, by;
    if (th != null) {
      if (Math.abs(th) < 0.25 || (th > 0) !== (idx > 0)) return Object.assign({}, none, { by: "thumb" }); // folded thumb: no decision
      s = th; by = "thumb";
    } else {
      if (Math.abs(idx) < 0.3) return Object.assign({}, none, { by: "index" });
      s = idx; by = "index";
    }
    var raw = s > 0 ? "right" : "left", mir = o.mirrored != null ? !!o.mirrored : o.facing === "user";
    return { side: mir ? flipSide(raw) : raw, raw: raw, by: by, conf: Math.round(Math.min(1, Math.abs(s)) * 100) / 100, mirrored: mir };
  }
  /** the user's choice stays the side; a geometry that disagrees asks the user (never a silent override) */
  function sideCheck(chosen, geo) {
    var d = geo && geo.side;
    return { side: chosen, ask: !!(d && chosen && d !== chosen), detected: d || null };
  }
  function sideAskText(detected, chosen, lang) {
    var l = LI[lang3(lang)], nm = function (s) { return s === "left" ? ["ซ้าย", "left", "左"][l] : ["ขวา", "right", "右"][l]; };
    return [
      "ดูจากตำแหน่งนิ้วโป้ง ภาพนี้น่าจะเป็นมือ" + nm(detected) + " แต่คุณเลือกมือ" + nm(chosen) + " ช่วยยืนยันว่าเป็นมือข้างไหน",
      "From the thumb position, this looks like a " + nm(detected) + " hand, but you chose the " + nm(chosen) + " hand. Please confirm which hand it is.",
      "从拇指的位置看，这像是" + nm(detected) + "手，但您选择的是" + nm(chosen) + "手。请确认是哪只手。"
    ][l];
  }

  /** rear camera always; another person's hand: consent first */
  function cameraGate(o) { var other = o && o.mode === "other"; return { facing: "environment", consentRequired: other, open: !other || !!(o && o.consent) }; }
  function consentAfterCapture() { return false; }

  var api = {
    LINES: LINES, SCHOOLS: SCHOOLS, LANGS: LANGS, STATUS: STATUS, COLORS: COLORS, AUTO: AUTO, THRESH: THRESH, STORE_KEY: STORE_KEY, TAP_ORDER: TAP_ORDER,
    T: T, hintText: hintText, lineName: lineName, lineAbout: lineAbout, schoolName: schoolName, guides: guides,
    handFromTaps: handFromTaps, frameFromHand: frameFromHand, palmRoi: palmRoi, catmull: catmull,
    newState: newState, setLine: setLine, threshold: threshold, applyDetection: applyDetection,
    readingFor: readingFor, aiFacts: aiFacts, listRows: listRows, allTexts: allTexts, serialize: serialize, deserialize: deserialize,
    drawLineLayer: drawLineLayer,
    CAPTURE_T: CAPTURE_T, captureMetrics: captureMetrics, captureHint: captureHint, handFromSkin: handFromSkin, createAutoShutter: createAutoShutter,
    stillPlan: stillPlan, grabStill: grabStill, cameraGate: cameraGate, consentAfterCapture: consentAfterCapture,
    CAM_OPTS: CAM_OPTS, photoSettings: photoSettings, UPLOAD_MIN: UPLOAD_MIN, photoQuality: photoQuality, qualityVerdict: qualityVerdict,
    handSide: handSide, sideCheck: sideCheck, sideAskText: sideAskText,
    _util: { clamp: clamp, lerp: lerp, r4: r4, sigmoid: sigmoid, resample: resample }
  };
  // the classical line finder lives in palm-v2-detect.js (loaded first in the browser): PV.detect, PV.classify, PV.DET
  var DM = root.PalmV2Detect || (typeof require === "function" ? require("./palm-v2-detect.js") : null);
  if (DM) DM.install(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PalmV2 = api;
})(typeof window !== "undefined" ? window : globalThis);
