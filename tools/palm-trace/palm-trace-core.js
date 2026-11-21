/* tools/palm-trace/palm-trace-core.js — pure logic of the local palm tap-to-trace labelling tool (owner decision 174 ก,
 * 2026-11-21). OWNER TOOL, LOCAL ONLY: never published (tools/ is outside the site allow-list), never linked from the site.
 *
 * The owner opens one of their own palm photos, taps along each main line (life, head, heart, fate) and exports a JSON label
 * file: ground truth for the palm-line measurement. The label holds the photo's width / height (as displayed, EXIF orientation
 * applied by the browser), its file name and sha256 (to match label and photo later), one polyline per line in normalised
 * coordinates, the labeller, a timestamp and the tool version. It never holds image data, a thumbnail or EXIF: validateLabel()
 * is strict and refuses any extra field.
 *
 * Shared by the page (window.LQPalmTrace) and the unit tests (CommonJS). Locked tests: tests/unit/palm-trace.test.js,
 * tests/e2e/palm-trace.e2e.mjs (evals-locks/palm-trace.sha256). */
(function (root) {
  "use strict";
  const SCHEMA = "lensiq-palm-trace/1";
  const TOOL_VERSION = "1.0.0";
  const LINES = ["life", "head", "heart", "fate"];
  const STATUS = ["traced", "notVisible", "notLabelled"];
  const HANDS = ["left", "right", "unknown"];
  const COORD_SPACE = "normalised: x = px / image.width, y = px / image.height, origin top-left of the photo as the browser shows it (camera rotation applied)";
  const MAX_POINTS = 500;
  const TOP_KEYS = ["schema", "tool", "labeller", "createdAt", "image", "hand", "coordSpace", "lines"];
  const IMAGE_KEYS = ["width", "height", "name", "sha256"];

  const r4 = v => Math.round(v * 10000) / 10000;
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const isInt = v => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 100000;

  /** photo pixels -> normalised [x, y] in [0, 1], 4 decimals, clamped to the photo edge */
  function normPoint(x, y, w, h) {
    if (!(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0)) throw new Error("normPoint: bad image size (width / height)");
    if (!(Number.isFinite(x) && Number.isFinite(y))) throw new Error("normPoint: point is not finite");
    return [r4(clamp01(x / w)), r4(clamp01(y / h))];
  }
  /** a tap at client (x, y) on an element shown at rect (getBoundingClientRect: zoom and scroll included) -> normalised point */
  function clientToNorm(clientX, clientY, rect) {
    return normPoint(clientX - rect.left, clientY - rect.top, rect.width, rect.height);
  }
  /** normalised point -> photo pixels */
  function toPx(p, w, h) { return [p[0] * w, p[1] * h]; }

  function newState() {
    const lines = {};
    for (const id of LINES) lines[id] = { status: "notLabelled", points: [] };
    return { lines };
  }
  function checkLine(id) { if (!LINES.includes(id)) throw new Error("unknown line: " + id); }
  /** copy of the state with one line replaced */
  function withLine(state, id, line) {
    const lines = {};
    for (const k of LINES) lines[k] = k === id ? line : { status: state.lines[k].status, points: state.lines[k].points.map(p => [p[0], p[1]]) };
    return { lines };
  }
  function addPoint(state, id, p) {
    checkLine(id);
    if (!Array.isArray(p) || p.length !== 2 || !p.every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw new Error("point out of range [0, 1]");
    const q = [r4(p[0]), r4(p[1])], cur = state.lines[id];
    const pts = cur.status === "traced" ? cur.points.map(a => [a[0], a[1]]) : [];
    const last = pts[pts.length - 1];
    if (last && last[0] === q[0] && last[1] === q[1]) return withLine(state, id, { status: "traced", points: pts });
    if (pts.length >= MAX_POINTS) throw new Error("max " + MAX_POINTS + " points per line");
    pts.push(q);
    return withLine(state, id, { status: "traced", points: pts });
  }
  function undo(state, id) {
    checkLine(id);
    const cur = state.lines[id];
    if (cur.status === "notLabelled") return state;
    if (cur.status === "notVisible") return withLine(state, id, { status: "notLabelled", points: [] });
    const pts = cur.points.slice(0, -1).map(a => [a[0], a[1]]);
    return withLine(state, id, pts.length ? { status: "traced", points: pts } : { status: "notLabelled", points: [] });
  }
  function clearLine(state, id) { checkLine(id); return withLine(state, id, { status: "notLabelled", points: [] }); }
  function markNotVisible(state, id) { checkLine(id); return withLine(state, id, { status: "notVisible", points: [] }); }

  const NAME_OK = n => typeof n === "string" && n.length <= 200 && !/[/\\]/.test(n) && !/^data:/i.test(n) && !/[\u0000-\u001f]/.test(n);
  const ISO_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{3})?Z$/;
  const sameKeys = (o, keys) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));

  /** [] = valid. Strict: exactly the documented fields, so nothing else (image bytes, thumbnail, EXIF) can ride along. */
  function validateLabel(j) {
    const e = [];
    if (!sameKeys(j, TOP_KEYS)) return ["label must have exactly the fields " + TOP_KEYS.join(", ")];
    if (j.schema !== SCHEMA) e.push("schema must be " + SCHEMA);
    const toolOk = sameKeys(j.tool, ["name", "version"]) && j.tool.name === "palm-trace" && typeof j.tool.version === "string" && /^\d+\.\d+\.\d+$/.test(j.tool.version);
    if (!toolOk) e.push("tool must be {name: palm-trace, version}");
    if (typeof j.labeller !== "string" || !j.labeller.trim() || j.labeller.length > 64) e.push("labeller: 1 to 64 characters");
    if (typeof j.createdAt !== "string" || !ISO_RE.test(j.createdAt) || isNaN(Date.parse(j.createdAt))) e.push("createdAt must be an ISO UTC time");
    if (!sameKeys(j.image, IMAGE_KEYS)) e.push("image must have exactly " + IMAGE_KEYS.join(", "));
    else {
      if (!isInt(j.image.width) || !isInt(j.image.height)) e.push("image width / height must be whole pixels");
      if (!NAME_OK(j.image.name)) e.push("image name must be a plain file name (no folder, no data URL)");
      if (!(j.image.sha256 === null || (typeof j.image.sha256 === "string" && /^[0-9a-f]{64}$/.test(j.image.sha256)))) e.push("image sha256 must be 64 hex characters or null");
    }
    if (!HANDS.includes(j.hand)) e.push("hand must be " + HANDS.join(" / "));
    if (j.coordSpace !== COORD_SPACE) e.push("coordSpace must be the documented normalised space");
    if (!sameKeys(j.lines, LINES)) e.push("lines must have exactly " + LINES.join(", "));
    else {
      let any = false;
      for (const id of LINES) {
        const l = j.lines[id];
        if (!sameKeys(l, ["status", "points"]) || !STATUS.includes(l.status) || !Array.isArray(l.points)) { e.push(id + ": {status, points} expected"); continue; }
        const okPts = l.points.every(p => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1));
        if (!okPts) e.push(id + ": every point is [x, y] with 0 <= x, y <= 1");
        if (l.points.length > MAX_POINTS) e.push(id + ": at most " + MAX_POINTS + " points");
        if (l.status === "traced" && l.points.length < 2) e.push(id + ": a traced line needs at least 2 points");
        if (l.status !== "traced" && l.points.length) e.push(id + ": only a traced line has points");
        if (l.status !== "notLabelled") any = true;
      }
      if (!any) e.push("nothing traced or marked not visible");
    }
    return e;
  }

  /** state + photo facts -> {label, errors}. meta: {width, height, labeller, hand, imageName, imageSha256, now} */
  function buildLabel(state, meta) {
    const m = meta || {};
    const lines = {};
    for (const id of LINES) lines[id] = { status: state.lines[id].status, points: state.lines[id].points.map(p => [p[0], p[1]]) };
    const label = {
      schema: SCHEMA,
      tool: { name: "palm-trace", version: TOOL_VERSION },
      labeller: typeof m.labeller === "string" ? m.labeller.trim() : "",
      createdAt: (m.now instanceof Date ? m.now : new Date()).toISOString(),
      image: { width: m.width, height: m.height, name: typeof m.imageName === "string" ? m.imageName : "", sha256: m.imageSha256 || null },
      hand: m.hand || "unknown",
      coordSpace: COORD_SPACE,
      lines
    };
    return { label, errors: validateLabel(label) };
  }

  /** the file text; throws on an invalid label */
  function labelJson(label) {
    const errs = validateLabel(label);
    if (errs.length) throw new Error("invalid label: " + errs.join("; "));
    return JSON.stringify(label, null, 1) + "\n";
  }

  /** <photo stem>.palm-trace.json, ASCII letters / digits / . _ - only */
  function labelFileName(imageName) {
    const base = String(imageName || "").split(/[/\\]/).pop() || "";
    const stem = base.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+|[._]+$/g, "").slice(0, 100);
    return (/[A-Za-z0-9]/.test(stem) ? stem : "palm") + ".palm-trace.json";
  }

  const T = {
    th: {
      title: "ลากเส้นลายมือ (ในเครื่องนี้เท่านั้น)",
      local_only: "รูปอยู่ในเครื่องนี้เท่านั้น ไม่มีการส่งออก ไม่มีการอัปโหลด ไฟล์ที่บันทึกมีแต่ตำแหน่งจุด ไม่มีรูปและไม่มีข้อมูล EXIF",
      open_photo: "เปิดรูปฝ่ามือ",
      no_photo: "ยังไม่ได้เปิดรูป",
      labeller: "ชื่อผู้ลากเส้น",
      hand: "มือ",
      hand_left: "ซ้าย", hand_right: "ขวา", hand_unknown: "ไม่ระบุ",
      line_life: "เส้นชีวิต", line_head: "เส้นสมอง", line_heart: "เส้นหัวใจ", line_fate: "เส้นวาสนา",
      choose_line: "เลือกเส้น แล้วแตะตามเส้นบนรูปจากปลายด้านหนึ่งไปอีกด้าน",
      undo: "ย้อนจุดล่าสุด", clear: "ล้างเส้นนี้", not_visible: "มองไม่เห็นเส้นนี้",
      zoom: "ซูม",
      export: "บันทึกไฟล์ JSON",
      save_hint: "บันทึกไว้ข้างรูป หรือในโฟลเดอร์ ~/LENSIQ-field/ ห้ามใส่ใน repo",
      status_traced: "จุด", status_notVisible: "มองไม่เห็น", status_notLabelled: "ยังไม่ได้ลาก",
      loaded: "เปิดรูปแล้ว", saved: "บันทึกแล้ว", cancelled: "ยกเลิกการบันทึก",
      err_photo: "เปิดรูปไม่ได้", err_export: "ยังบันทึกไม่ได้", err_labeller: "ใส่ชื่อผู้ลากเส้นก่อน",
      unsaved: "ยังมีเส้นที่ไม่ได้บันทึก"
    },
    en: {
      title: "Palm line tracing (this device only)",
      local_only: "The photo stays on this device. Nothing is sent or uploaded. The saved file holds only point positions: no photo and no EXIF data.",
      open_photo: "Open palm photo",
      no_photo: "No photo open",
      labeller: "Labeller name",
      hand: "Hand",
      hand_left: "Left", hand_right: "Right", hand_unknown: "Not stated",
      line_life: "Life line", line_head: "Head line", line_heart: "Heart line", line_fate: "Fate line",
      choose_line: "Choose a line, then tap along it on the photo from one end to the other",
      undo: "Undo last point", clear: "Clear this line", not_visible: "Line not visible",
      zoom: "Zoom",
      export: "Save JSON file",
      save_hint: "Save it next to the photo or in ~/LENSIQ-field/. Never in the repo.",
      status_traced: "points", status_notVisible: "not visible", status_notLabelled: "not traced yet",
      loaded: "Photo open", saved: "Saved", cancelled: "Save cancelled",
      err_photo: "Could not open the photo", err_export: "Cannot save yet", err_labeller: "Enter the labeller name first",
      unsaved: "Some lines are not saved yet"
    },
    zh: {
      title: "掌纹描线（仅限本设备）",
      local_only: "照片只留在本设备上，不会发送或上传。保存的文件只包含点的位置，不含照片，也不含 EXIF 数据。",
      open_photo: "打开手掌照片",
      no_photo: "尚未打开照片",
      labeller: "标注人姓名",
      hand: "手",
      hand_left: "左手", hand_right: "右手", hand_unknown: "未说明",
      line_life: "生命线", line_head: "智慧线", line_heart: "感情线", line_fate: "事业线",
      choose_line: "先选择一条线，然后在照片上沿着这条线从一端点到另一端",
      undo: "撤销上一个点", clear: "清除这条线", not_visible: "看不到这条线",
      zoom: "缩放",
      export: "保存 JSON 文件",
      save_hint: "请保存在照片旁边或 ~/LENSIQ-field/ 文件夹中，切勿放进代码仓库。",
      status_traced: "个点", status_notVisible: "看不到", status_notLabelled: "尚未描线",
      loaded: "照片已打开", saved: "已保存", cancelled: "已取消保存",
      err_photo: "无法打开照片", err_export: "暂时无法保存", err_labeller: "请先输入标注人姓名",
      unsaved: "还有未保存的描线"
    }
  };
  function t(lang, key) { const d = T[lang] || T.th; return d[key] != null ? d[key] : T.th[key]; }

  const api = { SCHEMA, TOOL_VERSION, LINES, STATUS, HANDS, COORD_SPACE, MAX_POINTS, normPoint, clientToNorm, toPx, newState, addPoint, undo,
    clearLine, markNotVisible, buildLabel, validateLabel, labelJson, labelFileName, T, t };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LQPalmTrace = api;
})(typeof window !== "undefined" ? window : globalThis);
