/* queue.js — queue.html: queue length + wait-time alert ("open another counter") from anonymous person counts in
 * drawn queue zones. Runs on LQZoneCam (camera + detector + zone UI) and LQZones (pure maths, tests/unit/zones.test.js).
 * The alert is a suggestion for staff to look at the queue; it never acts on its own. No faces, no identity, no images.
 * Test hooks: window.__LQZ (+ __LQZ.q = per-zone state). ?fakedet on localhost: scripted boxes via LQDetect.fake("queue").
 */
(function () {
  "use strict";
  const ZC = /** @type {any} */ (window).LQZoneCam, Z = /** @type {any} */ (window).LQZones, T = ZC.T;
  const $ = id => document.getElementById(id);
  const DEMO_SPEED = 3;
  const smooth = new Map(), waits = new Map(), q = new Map();
  const dwell = Z.createDwell({ graceMs: 2500 });
  let rule = null, lastNow = 0;
  const mkRule = s => Z.createThresholdAlert({ holdMs: s.holdSec * 1000, clearMs: s.clearSec * 1000, cooldownMs: s.cooldownMin * 60000 });
  const newDay = () => ({ maxQueue: 0, maxAt: 0, alerts: 0, overMs: 0, waits: [], hourly: { cnt: Array(24).fill(0), ms: Array(24).fill(0) } });

  function onFrame(dets, now, P) {
    const s = P.settings, dt = lastNow ? Math.min(2000, Math.max(0, now - lastNow)) : 0;
    lastNow = now;
    if (!rule) rule = mkRule(s);
    const people = dets.filter(d => d.label === "person");
    let total = 0;
    for (const z of P.zones) {
      const inZ = people.filter(d => Z.boxInZone(d, z.poly, "foot"));
      if (!smooth.has(z.id)) smooth.set(z.id, Z.createSmoother(5));
      const count = Math.round(smooth.get(z.id).push(inZ.length));
      const r = dwell.update(z.id, inZ.filter(d => d.id).map(d => d.id), now);
      const zw = waits.get(z.id) || [];
      for (const e of r.ended) if (e.ms >= 5000) { zw.push(e.ms / 1000); P.day.waits.push(Math.round(e.ms / 1000)); }
      waits.set(z.id, zw.slice(-30));
      if (P.day.waits.length > 300) P.day.waits = P.day.waits.slice(-300);
      const w = Z.queueWait({ count, serviceSec: s.serviceSec, counters: s.counters, recentWaits: zw });
      const longest = r.active.length ? r.active[0].ms / 1000 : 0;
      const over = count >= s.threshold || (s.slaSec > 0 && w.sec >= s.slaSec);
      const ev = rule.update(z.id, over, now);
      if (ev === "raise") {
        P.day.alerts++;
        P.alert(z.id, T("zq.alert", "คิวที่ \"{zone}\" มี {n} คน (รอราว {w}) — พิจารณาเปิดเคาน์เตอร์เพิ่ม · ให้พนักงานดูหน้างานก่อนตัดสินใจ",
          { zone: z.name, n: count, w: ZC.fmtMS(w.sec * 1000) }), z.name);
      } else if (ev === "clear") P.clear(z.id, T("zq.clear", "คิวที่ \"{zone}\" กลับสู่ปกติ ({n} คน)", { zone: z.name, n: count }), z.name);
      if (rule.isOn(z.id)) P.day.overMs += dt;
      q.set(z.id, { count, w, longest, on: rule.isOn(z.id) });
      total += count;
    }
    if (total > P.day.maxQueue) { P.day.maxQueue = total; P.day.maxAt = Date.now(); }
    const h = new Date().getHours();
    P.day.hourly.cnt[h] += total * dt; P.day.hourly.ms[h] += dt;
  }

  function tile(k, v, sub, hot) {
    const d = document.createElement("div"); d.className = "tile" + (hot ? " hot" : "");
    const a = document.createElement("div"); a.className = "k"; a.textContent = k;
    const b = document.createElement("div"); b.className = "v"; b.textContent = v;
    d.append(a, b);
    if (sub) { const c = document.createElement("div"); c.className = "s"; c.textContent = sub; d.appendChild(c); }
    return d;
  }
  function render(P) {
    const tiles = $("tiles"); if (!tiles) return;
    tiles.textContent = "";
    let total = 0, est = 0, longest = 0, anyOn = false;
    for (const z of P.zones) { const v = q.get(z.id); if (!v) continue; total += v.count; est = Math.max(est, v.w.sec); longest = Math.max(longest, v.longest); anyOn = anyOn || v.on; }
    tiles.append(
      tile(T("zq.t.now", "คนในคิวตอนนี้"), String(total), T("zq.t.zones", "{n} โซนคิว", { n: P.zones.length }), anyOn),
      tile(T("zq.t.wait", "เวลารอโดยประมาณ"), ZC.fmtMS(est * 1000), T("zq.t.waitS", "จำนวนคน × เวลาบริการ ÷ เคาน์เตอร์ หรือเวลารอที่วัดได้")),
      tile(T("zq.t.longest", "คนที่รอนานสุดตอนนี้"), ZC.fmtMS(longest * 1000), T("zq.t.longestS", "นับจากเข้าโซนคิว (ไม่ระบุตัวตน)")),
      tile(T("zq.t.max", "คิวยาวสุดวันนี้"), String(P.day.maxQueue), P.day.maxAt ? ZC.fmtClock(P.day.maxAt) : "—"),
      tile(T("zq.t.alerts", "แจ้งเตือนวันนี้"), String(P.day.alerts), T("zq.t.over", "คิวยาวเกินเกณฑ์รวม {m}", { m: ZC.fmtMin(P.day.overMs) })),
      tile(T("zq.t.measured", "เวลารอที่วัดได้ (มัธยฐาน)"), P.day.waits.length >= 3 ? ZC.fmtMS(Z.median(P.day.waits) * 1000) : "—",
        T("zq.t.measuredS", "จาก {n} คนที่ออกจากคิววันนี้", { n: P.day.waits.length }))
    );
    const ul = $("zoneState"); if (!ul) return;
    ul.textContent = "";
    for (const z of P.zones) {
      const v = q.get(z.id) || { count: 0, w: { sec: 0 }, on: false };
      const li = document.createElement("li"); li.className = "zc-state" + (v.on ? " hot" : "");
      li.textContent = T("zq.zoneLine", "{zone}: {n} คน · รอราว {w} · {st}", {
        zone: z.name, n: v.count, w: ZC.fmtMS(v.w.sec * 1000),
        st: v.on ? T("zq.st.long", "คิวยาว — ควรดูหน้างาน") : T("zq.st.ok", "ปกติ")
      });
      ul.appendChild(li);
    }
  }
  function csv(P) {
    const rows = [[T("zq.csv.h1", "ชั่วโมง"), T("zq.csv.h2", "คนในคิวเฉลี่ย"), T("zq.csv.h3", "นาทีที่วัด")]];
    P.day.hourly.ms.forEach((ms, h) => { if (ms > 0) rows.push([`${String(h).padStart(2, "0")}:00`, (P.day.hourly.cnt[h] / ms).toFixed(2), (ms / 60000).toFixed(1)]); });
    rows.push([]);
    rows.push([T("zq.csv.sum", "สรุป"), T("zq.t.max", "คิวยาวสุดวันนี้"), P.day.maxQueue, T("zq.t.alerts", "แจ้งเตือนวันนี้"), P.day.alerts,
      T("zq.csv.overMin", "นาทีที่คิวยาวเกินเกณฑ์"), (P.day.overMs / 60000).toFixed(1)]);
    rows.push([]);
    rows.push([T("zc.csv.time", "เวลา"), T("zc.csv.zone", "โซน"), T("zc.csv.event", "เหตุการณ์"), T("zc.csv.check", "ผลการตรวจโดยพนักงาน")]);
    for (const e of P.log.items) rows.push([new Date(e.t).toISOString(), e.zone, e.text, e.v === "tp" ? T("zc.log.isTp", "ยืนยันว่าจริง") : e.v === "fp" ? T("zc.log.isFp", "แจ้งผิด") : ""]);
    return rows;
  }
  // demo: a queue that grows to 8 people and shrinks again every ~60 s (accelerated clock)
  function demo(ms) {
    const t = ms * DEMO_SPEED / 1000;
    const n = Math.max(0, Math.round(4.5 + 3.8 * Math.sin(2 * Math.PI * t / 90)));
    const out = [];
    for (let i = 0; i < n; i++) out.push({ x: 0.16 + i * 0.085, y: 0.36 + 0.02 * Math.sin(t + i), w: 0.065, h: 0.46, score: 0.9, label: "person" });
    return out;
  }

  ZC.page({
    ns: "lqq", key: "queue", classes: ["person"], anchorKind: "foot", csvName: "lensiq-queue", demoSpeed: DEMO_SPEED,
    zoneName: i => T("zq.zoneName", "คิว {n}", { n: i + 1 }),
    defaults: { threshold: 5, holdSec: 20, clearSec: 30, cooldownMin: 5, serviceSec: 60, counters: 1, slaSec: 0, sound: false },
    newDay, onFrame, render, csv, demo,
    demoZones: [[{ x: 0.12, y: 0.3 }, { x: 0.9, y: 0.3 }, { x: 0.9, y: 0.95 }, { x: 0.12, y: 0.95 }]],
    zoneColor: (z) => q.get(z.id) && q.get(z.id).on ? "#f87171" : null,
    zoneLabel: z => { const v = q.get(z.id); return v ? T("zq.label", "{zone}: {n} คน", { zone: z.name, n: v.count }) : z.name; },
    onSettings: P => { rule = mkRule(P.settings); },
    onZones: () => { smooth.clear(); dwell.reset(); },
    onDemo: () => { lastNow = 0; rule = null; },
    onClear: () => { waits.clear(); }
  });
  /** @type {any} */ (window).__LQZ.q = q;
})();
