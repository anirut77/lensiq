/* lensiq-agg.js — รวมสรุป "1 เครื่องต่อ 1 จุด" (มือถือ/แท็บเล็ตหลายเครื่อง -> เครื่องหลัก)
   แต่ละเครื่องประมวลผลภาพเองในเบราว์เซอร์ แล้วส่งออกเฉพาะ "ตัวเลขสรุปรายวัน" (pack) — ไม่มีภาพ วิดีโอ ฮีตแมป
   descriptor/embedding หรือกรอบตัวคน
   pack v1 (สัญญาเดียวกับ server.py clean_agg — แก้ต้องแก้ทั้งสองที่):
     { v:1, format?:"lensiq-agg", node?:"n<8-24 a-z0-9>", name:"<=40", date:"YYYY-MM-DD",
       in, out, occ?, peak?, peakAt?, maxQueue?, t?,                       // จำนวนเต็ม >= 0
       hourlyIn?:[24 int], hourlyOut?:[24 int],
       zones?:{ "c1:<zoneId>": {name, visits, dwellSum, dwellN, peak} } (<= 64),
       byCam?:{ "c1".."c4": {name, in, out} } }
   คีย์อื่นถูกปฏิเสธทั้ง pack (ไม่ตัดทิ้งเงียบ ๆ) เพื่อไม่ให้ข้อมูลอื่นหลุดออกจากเครื่องโดยไม่ตั้งใจ
   เบราว์เซอร์: window.LQAgg · Node: require("./lensiq-agg.js") */
(function (root, factory) {
  const m = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = m; else root.LQAgg = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const LIM = { name: 40, zones: 64, cams: 4, int: 10000000, ms: 1e13, bytes: 16384 };
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, SLOT_RE = /^c[1-4]$/, ZONE_RE = /^c[1-4]:[A-Za-z0-9_.-]{1,40}$/, NODE_RE = /^n[a-z0-9]{8,24}$/;
  const TOP = ["v", "format", "node", "name", "date", "in", "out", "occ", "peak", "peakAt", "maxQueue", "t", "hourlyIn", "hourlyOut", "zones", "byCam"];
  const ZONE_KEYS = ["name", "visits", "dwellSum", "dwellN", "peak"], CAM_KEYS = ["name", "in", "out"];
  const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);

  class AggError extends Error {}
  const fail = m => { throw new AggError(m); };

  /* ชื่อสั้น: ตัดอักขระควบคุมและ <> ออก ยุบช่องว่าง ยาวไม่เกิน 40 (ยาวกว่านี้ = ปฏิเสธ) */
  function cleanName(v, field) {
    if (typeof v !== "string") fail(`${field} ต้องเป็นข้อความ`);
    const s = v.replace(/[\u0000-\u001f\u007f-\u009f<>]/g, " ").replace(/\s+/g, " ").trim();
    if (!s) fail(`${field} ว่าง`);
    if (s.length > LIM.name) fail(`${field} ยาวเกิน ${LIM.name} ตัวอักษร`);
    return s;
  }
  function int(v, field, max = LIM.int) {
    if (typeof v !== "number" || !Number.isFinite(v)) fail(`${field} ต้องเป็นตัวเลข`);
    if (v < 0 || v > max) fail(`${field} อยู่นอกช่วง`);
    return Math.round(v);
  }
  function only(o, keys, field) { for (const k of Object.keys(o)) if (!keys.includes(k)) fail(`${field}: ไม่รู้จักคีย์ "${String(k).slice(0, 20)}"`); }
  function hours(v, field) {
    if (!Array.isArray(v) || v.length !== 24) fail(`${field} ต้องเป็นตัวเลข 24 ช่อง`);
    return v.map((x, i) => int(x, `${field}[${i}]`));
  }

  /* ตรวจ pack ตามสัญญา -> {ok:true, pack} | {ok:false, error} */
  function cleanPack(raw, { maxBytes = LIM.bytes } = {}) {
    try {
      if (!isObj(raw)) fail("ข้อมูลต้องเป็นออบเจกต์");
      if (JSON.stringify(raw).length > maxBytes) fail("ข้อมูลใหญ่เกินกำหนด");
      only(raw, TOP, "pack");
      if (raw.v !== 1) fail("เวอร์ชันไม่รองรับ");
      if (raw.format != null && raw.format !== "lensiq-agg") fail("format ไม่ถูกต้อง");
      if (typeof raw.date !== "string" || !DATE_RE.test(raw.date) || isNaN(Date.parse(raw.date))) fail("date ไม่ถูกต้อง");
      const p = { v: 1, date: raw.date, name: cleanName(raw.name, "name"), in: int(raw.in, "in"), out: int(raw.out, "out") };
      if (raw.node != null) { if (typeof raw.node !== "string" || !NODE_RE.test(raw.node)) fail("node ไม่ถูกต้อง"); p.node = raw.node; }
      for (const k of ["occ", "peak", "maxQueue"]) p[k] = raw[k] == null ? 0 : int(raw[k], k);
      for (const k of ["peakAt", "t"]) p[k] = raw[k] == null ? 0 : int(raw[k], k, LIM.ms);
      p.hourlyIn = raw.hourlyIn == null ? Array(24).fill(0) : hours(raw.hourlyIn, "hourlyIn");
      p.hourlyOut = raw.hourlyOut == null ? Array(24).fill(0) : hours(raw.hourlyOut, "hourlyOut");
      p.zones = {};
      if (raw.zones != null) {
        if (!isObj(raw.zones)) fail("zones ต้องเป็นออบเจกต์");
        const ks = Object.keys(raw.zones);
        if (ks.length > LIM.zones) fail(`zones เกิน ${LIM.zones}`);
        for (const k of ks) {
          const z = raw.zones[k];
          if (!ZONE_RE.test(k) || !isObj(z)) fail("zone ไม่ถูกต้อง");
          only(z, ZONE_KEYS, "zone");
          p.zones[k] = { name: cleanName(z.name, "zone.name"), visits: int(z.visits ?? 0, "visits"), dwellSum: int(z.dwellSum ?? 0, "dwellSum", LIM.ms), dwellN: int(z.dwellN ?? 0, "dwellN"), peak: int(z.peak ?? 0, "zone.peak") };
        }
      }
      p.byCam = {};
      if (raw.byCam != null) {
        if (!isObj(raw.byCam)) fail("byCam ต้องเป็นออบเจกต์");
        const ks = Object.keys(raw.byCam);
        if (ks.length > LIM.cams) fail(`byCam เกิน ${LIM.cams}`);
        for (const k of ks) {
          const b = raw.byCam[k];
          if (!SLOT_RE.test(k) || !isObj(b)) fail("byCam ไม่ถูกต้อง");
          only(b, CAM_KEYS, "byCam");
          p.byCam[k] = { name: cleanName(b.name, "byCam.name"), in: int(b.in ?? 0, "byCam.in"), out: int(b.out ?? 0, "byCam.out") };
        }
      }
      return { ok: true, pack: p };
    } catch (e) {
      if (e instanceof AggError) return { ok: false, error: e.message };
      throw e;
    }
  }

  const trunc = (s, fb) => { const v = String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, LIM.name); return v || fb; };
  const n0 = (v, max = LIM.int) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(Math.round(v), max) : 0);
  /* สรุปวันของ store.js (st-day-*) -> pack (คัดเฉพาะตัวเลข ตัดชื่อให้สั้น ข้ามโซน/กล้องที่คีย์ผิดรูป) */
  function packFromDay(day, name, node, now = Date.now()) {
    const h = (day && day.hourly) || {};
    const arr = a => Array.from({ length: 24 }, (_, i) => n0(Array.isArray(a) ? a[i] : 0));
    const p = {
      v: 1, format: "lensiq-agg", name: trunc(name, "เครื่องไม่มีชื่อ"), date: day.date,
      in: n0(day.in), out: n0(day.out), occ: n0(day.occ), peak: n0(day.peak), peakAt: n0(day.peakAt, LIM.ms), maxQueue: n0(day.maxQueue), t: now,
      hourlyIn: arr(h.in), hourlyOut: arr(h.out), zones: {}, byCam: {}
    };
    if (node && NODE_RE.test(node)) p.node = node;
    for (const [k, z] of Object.entries(isObj(day.zones) ? day.zones : {})) {
      if (!ZONE_RE.test(k) || !isObj(z) || Object.keys(p.zones).length >= LIM.zones) continue;
      p.zones[k] = { name: trunc(z.name, k.split(":")[1]), visits: n0(z.visits), dwellSum: n0(z.dwellSum, LIM.ms), dwellN: n0(z.dwellN), peak: n0(z.peak) };
    }
    for (const [k, b] of Object.entries(isObj(day.byCam) ? day.byCam : {})) {
      if (!SLOT_RE.test(k) || !isObj(b)) continue;
      p.byCam[k] = { name: trunc(b.name, k), in: n0(b.in), out: n0(b.out) };
    }
    return p;
  }

  /* รหัสเครื่องแบบสุ่ม (ไม่ผูกกับตัวตน) */
  function newNodeId(rand = Math.random) {
    let s = "n"; const A = "abcdefghijklmnopqrstuvwxyz0123456789";
    const r = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(14)) : null;
    for (let i = 0; i < 14; i++) s += A[(r ? r[i] : Math.floor(rand() * 256)) % 36];
    return s;
  }
  /* รหัสจับคู่: ตัวพิมพ์ใหญ่ ไม่มีขีด/ช่องว่าง */
  const normCode = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);

  /* รวมยอด: local = วันของเครื่องนี้ (st-day หรือ null) ; packs = [pack ที่ผ่าน cleanPack แล้ว + node]
     - in/out/hourly = ผลรวม ; occ = max(0, Σin − Σout) (คนเข้าประตูหนึ่งออกอีกประตูได้)
     - peak (ประมาณ) = max(peak ของแต่ละเครื่อง, ยอดสะสม Σin−Σout ณ สิ้นแต่ละชั่วโมง)
     - maxQueue = ค่าสูงสุดของแต่ละเครื่อง
     คืน {in, out, occ, peak, maxQueue, hourlyIn, hourlyOut, rows:[{id, name, in, out, occ, peak, t, local, src}]} */
  function mergeDay(local, packs = []) {
    const rows = [];
    if (local && (local.in || local.out || !packs.length)) {
      rows.push({ id: "local", name: "เครื่องนี้", local: true, in: n0(local.in), out: n0(local.out), occ: n0(local.occ), peak: n0(local.peak), maxQueue: n0(local.maxQueue), t: 0,
        hourlyIn: (local.hourly && local.hourly.in) || [], hourlyOut: (local.hourly && local.hourly.out) || [] });
    }
    for (const p of packs) rows.push({ id: p.node || "?", name: p.name, local: false, src: p.src || "hub", in: p.in, out: p.out, occ: p.occ, peak: p.peak, maxQueue: p.maxQueue, t: p.receivedAt || p.t || 0, hourlyIn: p.hourlyIn, hourlyOut: p.hourlyOut });
    const hourlyIn = Array(24).fill(0), hourlyOut = Array(24).fill(0);
    for (const r of rows) for (let h = 0; h < 24; h++) { hourlyIn[h] += n0(r.hourlyIn[h]); hourlyOut[h] += n0(r.hourlyOut[h]); }
    const sIn = rows.reduce((s, r) => s + r.in, 0), sOut = rows.reduce((s, r) => s + r.out, 0);
    let cum = 0, est = 0;
    for (let h = 0; h < 24; h++) { cum = Math.max(0, cum + hourlyIn[h] - hourlyOut[h]); est = Math.max(est, cum); }
    const peak = Math.max(est, ...rows.map(r => r.peak), 0);
    return { in: sIn, out: sOut, occ: Math.max(0, sIn - sOut), peak, maxQueue: Math.max(0, ...rows.map(r => r.maxQueue || 0)), hourlyIn, hourlyOut,
      rows: rows.map(({ hourlyIn: _a, hourlyOut: _b, ...r }) => r) };
  }

  /* แคชในเครื่อง st-agg-YYYY-MM-DD = {v:1, nodes:{id: pack+{src, receivedAt}}}
     upsert(cache, pack, src) -> cache ใหม่ (src "hub" แทนที่ได้ทุกอย่าง ; "import" ไม่ทับข้อมูลจาก hub ที่ใหม่กว่า) */
  function cacheUpsert(cache, pack, src, receivedAt = Date.now()) {
    const c = isObj(cache) && isObj(cache.nodes) ? { v: 1, nodes: { ...cache.nodes } } : { v: 1, nodes: {} };
    const id = pack.node;
    if (!id) return c;
    const old = c.nodes[id];
    if (old && src === "import" && old.src === "hub" && (old.t || 0) >= (pack.t || 0)) return c;
    c.nodes[id] = { ...pack, src, receivedAt };
    return c;
  }
  /* อ่านแคช -> รายการ pack ที่ผ่านการตรวจ (ข้อมูลเสีย/ถูกแก้ = ข้าม) */
  function cachePacks(cache, date) {
    const out = [];
    if (!isObj(cache) || !isObj(cache.nodes)) return out;
    for (const [id, raw] of Object.entries(cache.nodes)) {
      if (!NODE_RE.test(id) || !isObj(raw)) continue;
      const { src, receivedAt, ...rest } = raw;
      const r = cleanPack({ ...rest, node: id });
      if (!r.ok || (date && r.pack.date !== date)) continue;
      out.push({ ...r.pack, src: src === "import" ? "import" : "hub", receivedAt: typeof receivedAt === "number" ? receivedAt : 0 });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "th") || a.node.localeCompare(b.node));
  }

  /* รวมผลจาก GET /api/agg (rows ของวันหนึ่ง) เข้าแคช: แถวจาก hub ที่ไม่มีแล้ว = ถูกลบที่เซิร์ฟเวอร์ -> ลบออก ; ไฟล์นำเข้าคงไว้
     คืนแคชใหม่ หรือ null ถ้าว่าง */
  function cacheFromServer(cache, rows) {
    rows = Array.isArray(rows) ? rows : [];
    let c = isObj(cache) && isObj(cache.nodes) ? { v: 1, nodes: { ...cache.nodes } } : { v: 1, nodes: {} };
    for (const id of Object.keys(c.nodes)) if (!isObj(c.nodes[id]) || (c.nodes[id].src !== "import" && !rows.some(r => r && r.node === id))) delete c.nodes[id];
    for (const raw of rows) {
      if (!isObj(raw)) continue;
      const { receivedAt, ...rest } = raw, r = cleanPack(rest);
      if (r.ok && r.pack.node) c = cacheUpsert(c, r.pack, "hub", typeof receivedAt === "number" ? receivedAt : 0);
    }
    return Object.keys(c.nodes).length ? c : null;
  }

  return { cacheFromServer, LIM, DATE_RE, SLOT_RE, ZONE_RE, NODE_RE, cleanPack, packFromDay, newNodeId, normCode, mergeDay, cacheUpsert, cachePacks };
});
