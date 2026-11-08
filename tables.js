/* tables.js — tables.html: restaurant table occupancy and turnover. Each drawn zone is one table (table + its chairs);
 * anonymous person boxes whose centre lies in the zone make it "occupied" after seatSec, "needs clearing" after the party
 * has been gone leaveSec, and free again when staff tap "cleared" (or after autoClearMin). COCO "dining table" boxes can
 * be turned into table zones with one tap. Numbers only: per-table minutes, seatings, average stay. No faces, no images.
 * Test hooks: window.__LQZ (+ __LQZ.tbl = Map zoneId -> table state). ?fakedet: LQDetect.fake("tables").
 */
(function () {
  "use strict";
  const ZC = /** @type {any} */ (window).LQZoneCam, Z = /** @type {any} */ (window).LQZones, T = ZC.T;
  const $ = id => document.getElementById(id);
  const DEMO_SPEED = 30;
  const tbl = new Map(); // zone id -> LQZones table state
  const COL = { free: "#34d399", occupied: "#60a5fa", clearing: "#fb923c" };
  const newDay = () => ({ seatings: 0, seatMsSum: 0, peakOcc: 0, alerts: 0, perTable: {} });
  const cfgOf = s => ({ seatMs: s.seatSec * 1000, leaveMs: s.leaveSec * 1000, minSeatMs: s.minSeatMin * 60000, autoClearMs: s.autoClearMin * 60000 });
  let nowRef = Date.now();

  function onFrame(dets, now, P) {
    nowRef = now;
    const s = P.settings, cfg = cfgOf(s);
    const people = dets.filter(d => d.label === "person");
    let occ = 0;
    for (const z of P.zones) {
      const n = people.filter(d => Z.boxInZone(d, z.poly, "center")).length;
      const prev = tbl.get(z.id) || Z.newTable(now);
      const r = Z.tableStep(prev, n, now, cfg);
      tbl.set(z.id, r.tbl);
      const pt = P.day.perTable[z.id] || (P.day.perTable[z.id] = { name: z.name, seatings: 0, seatMsSum: 0 });
      pt.name = z.name;
      if (r.event === "left") {
        const stay = r.tbl.seatMsSum - prev.seatMsSum;
        pt.seatings++; pt.seatMsSum += stay; P.day.seatings++; P.day.seatMsSum += stay;
        P.log.add({ kind: "left", zone: z.name, text: T("zt.ev.left", "ลูกค้าลุกจากโต๊ะ (นั่ง {m})", { m: ZC.fmtMin(stay) }) });
      } else if (r.event === "seated") {
        P.log.add({ kind: "seated", zone: z.name, text: T("zt.ev.seated", "มีลูกค้านั่ง") });
        P.clear("clear-" + z.id);
      } else if (r.event === "cleared") P.clear("clear-" + z.id);
      if (r.tbl.state === "occupied") occ++;
      if (r.tbl.state === "clearing" && s.clearAlertMin > 0 && now - r.tbl.since >= s.clearAlertMin * 60000 && !P.active.has("clear-" + z.id)) {
        P.day.alerts++;
        P.alert("clear-" + z.id, T("zt.alert", "โต๊ะ \"{zone}\" รอเก็บมา {m} — ให้พนักงานไปดูและเก็บโต๊ะ", { zone: z.name, m: ZC.fmtMin(now - r.tbl.since) }), z.name);
      }
    }
    P.day.peakOcc = Math.max(P.day.peakOcc, occ);
  }
  function clearTbl(P, z) {
    const t = tbl.get(z.id); if (!t) return;
    tbl.set(z.id, Z.clearTable(t, nowRef).tbl);
    P.clear("clear-" + z.id);
    P.log.add({ kind: "cleared", zone: z.name, text: T("zt.ev.cleared", "พนักงานเก็บโต๊ะแล้ว") });
    P.render(); P.zc.repaint();
  }
  const stateText = (t, now) => !t || t.state === "free" ? T("zt.st.free", "ว่าง")
    : t.state === "occupied" ? T("zt.st.occ", "มีลูกค้า {m}", { m: ZC.fmtMin(now - (t.seatedAt || t.since)) })
      : T("zt.st.clear", "รอเก็บโต๊ะ {m}", { m: ZC.fmtMin(now - t.since) });

  function tile(k, v, sub) {
    const d = document.createElement("div"); d.className = "tile";
    const a = document.createElement("div"); a.className = "k"; a.textContent = k;
    const b = document.createElement("div"); b.className = "v"; b.textContent = v;
    d.append(a, b);
    if (sub) { const c = document.createElement("div"); c.className = "s"; c.textContent = sub; d.appendChild(c); }
    return d;
  }
  function render(P) {
    const tiles = $("tiles"); if (!tiles) return;
    const now = nowRef;
    let occ = 0, clr = 0;
    for (const z of P.zones) { const t = tbl.get(z.id); if (t && t.state === "occupied") occ++; if (t && t.state === "clearing") clr++; }
    const total = P.zones.length;
    tiles.textContent = "";
    tiles.append(
      tile(T("zt.t.occ", "โต๊ะที่มีลูกค้า"), `${occ}/${total}`, total ? T("zt.t.rate", "{p}% ของโต๊ะ", { p: Math.round(100 * occ / total) }) : ""),
      tile(T("zt.t.clear", "รอเก็บโต๊ะ"), String(clr), T("zt.t.clearS", "กด \"เก็บแล้ว\" เมื่อพร้อมรับลูกค้าใหม่")),
      tile(T("zt.t.turns", "รอบการนั่งวันนี้"), String(P.day.seatings), T("zt.t.turnsS", "เฉลี่ย {r} รอบต่อโต๊ะ", { r: total ? (P.day.seatings / total).toFixed(1) : "0" })),
      tile(T("zt.t.avg", "เวลานั่งเฉลี่ย"), P.day.seatings ? ZC.fmtMin(P.day.seatMsSum / P.day.seatings) : "—", T("zt.t.peak", "สูงสุดพร้อมกัน {n} โต๊ะ", { n: P.day.peakOcc }))
    );
    const grid = $("tableGrid"); if (!grid) return;
    grid.textContent = "";
    for (const z of P.zones) {
      const t = tbl.get(z.id), st = t ? t.state : "free";
      const li = document.createElement("li"); li.className = "zt-card " + st;
      const h = document.createElement("b"); h.textContent = z.name;
      const p = document.createElement("span"); p.className = "zt-st"; p.textContent = stateText(t, now);
      const pt = P.day.perTable[z.id];
      const m = document.createElement("span"); m.className = "zt-m";
      m.textContent = T("zt.card.day", "วันนี้ {n} รอบ · เฉลี่ย {m}", { n: pt ? pt.seatings : 0, m: pt && pt.seatings ? ZC.fmtMin(pt.seatMsSum / pt.seatings) : "—" });
      li.append(h, p, m);
      if (st === "clearing" || st === "occupied") {
        const b = document.createElement("button"); b.type = "button"; b.className = "btn ghost small";
        b.textContent = st === "clearing" ? T("zt.btn.cleared", "เก็บแล้ว") : T("zt.btn.free", "ตั้งเป็นว่าง");
        b.setAttribute("aria-label", T("zt.btn.aria", "{b}: {zone}", { b: b.textContent, zone: z.name }));
        b.dataset.zone = z.id;
        b.onclick = () => clearTbl(P, z);
        li.appendChild(b);
      }
      grid.appendChild(li);
    }
  }
  // "dining table" boxes -> table zones (box grown by 30 % so the chairs are inside); skips tables already covered
  function suggest(P) {
    const dets = (P.dets || []).filter(d => d.label === "dining table");
    let added = 0;
    for (const d of dets) {
      const c = { x: d.x + d.w / 2, y: d.y + d.h / 2 };
      if (P.zones.some(z => Z.pointInPolygon(c, z.poly))) continue;
      const g = 0.15, r = { x: Math.max(0, d.x - d.w * g), y: Math.max(0, d.y - d.h * g), w: Math.min(1, d.w * (1 + 2 * g)), h: Math.min(1, d.h * (1 + 2 * g)) };
      r.w = Math.min(r.w, 1 - r.x); r.h = Math.min(r.h, 1 - r.y);
      if (P.addZone(Z.rectPoly(r))) added++;
    }
    $("drawMsg").textContent = added ? T("zt.sug.ok", "เพิ่มโต๊ะจากภาพ {n} โต๊ะ — ปรับชื่อโต๊ะได้ในรายการ", { n: added })
      : T("zt.sug.none", "ยังไม่พบโต๊ะในภาพ (ตัวตรวจจับรู้จัก \"โต๊ะอาหาร\" ได้ไม่ทุกมุม) — วาดโซนเองได้");
  }
  function csv(P) {
    const rows = [[T("zt.csv.h1", "โต๊ะ"), T("zt.csv.h2", "รอบการนั่ง"), T("zt.csv.h3", "นาทีรวม"), T("zt.csv.h4", "นาทีเฉลี่ยต่อรอบ")]];
    for (const [id, v] of Object.entries(P.day.perTable)) rows.push([v.name || id, v.seatings, (v.seatMsSum / 60000).toFixed(1), v.seatings ? (v.seatMsSum / v.seatings / 60000).toFixed(1) : ""]);
    rows.push([]);
    rows.push([T("zc.csv.time", "เวลา"), T("zc.csv.zone", "โซน"), T("zc.csv.event", "เหตุการณ์"), T("zc.csv.check", "ผลการตรวจโดยพนักงาน")]);
    for (const e of P.log.items) rows.push([new Date(e.t).toISOString(), e.zone, e.text, e.v === "tp" ? T("zc.log.isTp", "ยืนยันว่าจริง") : e.v === "fp" ? T("zc.log.isFp", "แจ้งผิด") : ""]);
    return rows;
  }
  // demo: 4 tables; parties of 2–4 arrive and leave on staggered cycles (clock ×30)
  const DEMO_T = [{ x: 0.08, y: 0.1 }, { x: 0.56, y: 0.1 }, { x: 0.08, y: 0.55 }, { x: 0.56, y: 0.55 }];
  function demo(ms) {
    const t = ms * DEMO_SPEED / 1000, out = [];
    DEMO_T.forEach((p, i) => {
      out.push({ x: p.x + 0.1, y: p.y + 0.12, w: 0.16, h: 0.12, score: 0.8, label: "dining table" });
      const cyc = (t + i * 700) % 2400; // 40 min cycle: seated ~25 min, empty ~15 min
      if (cyc < 1500) for (let k = 0; k < 2 + (i % 3); k++) out.push({ x: p.x + 0.02 + k * 0.09, y: p.y + 0.02, w: 0.07, h: 0.3, score: 0.9, label: "person" });
    });
    return out;
  }

  const P = ZC.page({
    ns: "lqt", key: "tables", classes: ["person", "dining table"], anchorKind: "center", csvName: "lensiq-tables", demoSpeed: DEMO_SPEED,
    zoneName: i => T("zt.zoneName", "โต๊ะ {n}", { n: i + 1 }),
    defaults: { seatSec: 60, leaveSec: 90, minSeatMin: 2, autoClearMin: 0, clearAlertMin: 5, sound: false },
    newDay, onFrame, render, csv, demo,
    demoZones: DEMO_T.map(p => Z.rectPoly({ x: p.x, y: p.y, w: 0.36, h: 0.38 })),
    zoneColor: z => COL[(tbl.get(z.id) || { state: "free" }).state],
    zoneLabel: z => `${z.name} · ${stateText(tbl.get(z.id), nowRef)}`,
    onZones: P2 => { for (const id of [...tbl.keys()]) if (!P2.zones.some(z => z.id === id)) tbl.delete(id); },
    onDemo: () => { tbl.clear(); },
    onClear: () => { tbl.clear(); }
  });
  $("suggestTables").addEventListener("click", () => suggest(P));
  /** @type {any} */ (window).__LQZ.tbl = tbl;
})();
