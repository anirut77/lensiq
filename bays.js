/* bays.js — bays.html: parking-bay free-space count WITHOUT reading plates. Each drawn zone is one bay (car or
 * motorcycle); a COCO car / motorcycle / truck / bus box whose centre is in the bay, or that covers >= coverMin of it,
 * makes the bay occupied after onSec (hysteresis: free again after offSec without a vehicle). Shows free bays per type,
 * a large "free spaces" board for an entrance screen and an optional "car park full" notice for staff. Vehicles only:
 * no plates, no people, no images. Test hooks: window.__LQZ (+ __LQZ.occ = Map bayId -> boolean). ?fakedet: LQDetect.fake("bays").
 */
(function () {
  "use strict";
  const ZC = /** @type {any} */ (window).LQZoneCam, Z = /** @type {any} */ (window).LQZones, T = ZC.T;
  const $ = id => document.getElementById(id);
  const DEMO_SPEED = 5;
  const VEH = new Set(["car", "motorcycle", "truck", "bus"]);
  const occ = new Map();
  let hyst = null, lastNow = 0;
  const mk = s => { hyst = Z.createHysteresis({ onMs: s.onSec * 1000, offMs: s.offSec * 1000 }); };
  const newDay = () => ({ peakOcc: 0, fullMs: 0, perBay: {}, hourly: { occ: Array(24).fill(0), ms: Array(24).fill(0) } });

  function hasVehicle(z, vehicles, s) {
    const want = z.type === "moto" ? ["motorcycle"] : ["car", "truck", "bus"];
    return vehicles.some(d => want.includes(d.label) &&
      (Z.boxInZone(d, z.poly, "center") || Z.coverage(d, z.poly) >= s.coverMin / 100));
  }
  function counts(P) {
    const c = { car: { total: 0, free: 0 }, moto: { total: 0, free: 0 } };
    for (const z of P.zones) { const k = z.type === "moto" ? "moto" : "car"; c[k].total++; if (!occ.get(z.id)) c[k].free++; }
    return c;
  }
  function onFrame(dets, now, P) {
    const s = P.settings, dt = lastNow ? Math.min(2000, Math.max(0, now - lastNow)) : 0;
    lastNow = now;
    if (!hyst) mk(s);
    const vehicles = dets.filter(d => VEH.has(d.label));
    let n = 0;
    for (const z of P.zones) {
      const r = hyst.update(z.id, hasVehicle(z, vehicles, s), now);
      occ.set(z.id, r.on);
      const pb = P.day.perBay[z.id] || (P.day.perBay[z.id] = { name: z.name, ms: 0, arrivals: 0 });
      pb.name = z.name;
      if (r.on) { n++; pb.ms += dt; }
      if (r.changed && r.on) pb.arrivals++;
    }
    P.day.peakOcc = Math.max(P.day.peakOcc, n);
    const h = new Date().getHours();
    P.day.hourly.occ[h] += n * dt; P.day.hourly.ms[h] += dt;
    const total = P.zones.length, free = total - n;
    if (total && free === 0) P.day.fullMs += dt;
    if (s.alertFull && total) {
      if (free === 0) P.alert("full", T("zb.full", "ที่จอดเต็มทุกช่อง ({n} ช่อง) — ให้พนักงานแจ้งผู้ขับขี่หรือเปิดป้าย \"เต็ม\"", { n: total }));
      else if (P.active.has("full")) P.clear("full", T("zb.notFull", "มีช่องว่างแล้ว {n} ช่อง", { n: free }));
    }
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
    const c = counts(P), total = c.car.total + c.moto.total, free = c.car.free + c.moto.free;
    tiles.textContent = "";
    tiles.append(
      tile(T("zb.t.free", "ช่องว่างตอนนี้"), `${free}/${total}`, total ? T("zb.t.occP", "ใช้อยู่ {p}%", { p: Math.round(100 * (total - free) / total) }) : "", total > 0 && free === 0),
      tile(T("zb.t.car", "ช่องรถยนต์ว่าง"), `${c.car.free}/${c.car.total}`, ""),
      tile(T("zb.t.moto", "ช่องจักรยานยนต์ว่าง"), `${c.moto.free}/${c.moto.total}`, ""),
      tile(T("zb.t.peak", "ใช้พร้อมกันสูงสุดวันนี้"), String(P.day.peakOcc), T("zb.t.fullFor", "เต็มรวม {m}", { m: ZC.fmtMin(P.day.fullMs) }))
    );
    const board = $("board");
    if (board) {
      $("boardNum").textContent = String(free);
      $("boardSub").textContent = total && free === 0 ? T("zb.b.full", "เต็ม") : T("zb.b.sub", "ช่องว่าง · รถยนต์ {c} · จักรยานยนต์ {m}", { c: c.car.free, m: c.moto.free });
      board.dataset.full = total && free === 0 ? "1" : "0";
    }
  }
  function csv(P) {
    const rows = [[T("zb.csv.h1", "ช่องจอด"), T("zb.csv.h2", "นาทีที่มีรถ"), T("zb.csv.h3", "จำนวนครั้งที่มีรถเข้า")]];
    for (const [id, v] of Object.entries(P.day.perBay)) rows.push([v.name || id, (v.ms / 60000).toFixed(1), v.arrivals]);
    rows.push([]);
    rows.push([T("zq.csv.h1", "ชั่วโมง"), T("zb.csv.h4", "ช่องที่ใช้เฉลี่ย")]);
    P.day.hourly.ms.forEach((ms, h) => { if (ms > 0) rows.push([`${String(h).padStart(2, "0")}:00`, (P.day.hourly.occ[h] / ms).toFixed(2)]); });
    return rows;
  }
  // demo: 6 bays in a row (5 car + 1 motorcycle); vehicles arrive and leave on staggered cycles
  const DEMO_B = [0, 1, 2, 3, 4, 5].map(i => ({ x: 0.04 + i * 0.16, y: 0.3, w: 0.14, h: 0.5 }));
  function demo(ms) {
    const t = ms * DEMO_SPEED / 1000, out = [];
    DEMO_B.forEach((b, i) => {
      const cyc = (t + i * 37) % (90 + i * 20);
      if (cyc < 55 + i * 8) out.push({ x: b.x + 0.015, y: b.y + 0.08, w: b.w - 0.03, h: b.h - 0.16, score: 0.9, label: i === 5 ? "motorcycle" : "car" });
    });
    return out;
  }

  ZC.page({
    ns: "lqb", key: "bays", classes: ["car", "motorcycle", "truck", "bus"], anchorKind: "center", csvName: "lensiq-bays", demoSpeed: DEMO_SPEED,
    minScore: 0.35, maxZones: 40,
    zoneName: i => T("zb.zoneName", "ช่อง {n}", { n: i + 1 }),
    zoneFields: z => ({ type: z && z.type === "moto" ? "moto" : "car" }),
    defaults: { onSec: 3, offSec: 6, coverMin: 35, alertFull: false, sound: false },
    newDay, onFrame, render, csv, demo,
    demoZones: DEMO_B.map(b => Z.rectPoly(b)),
    zoneColor: z => occ.get(z.id) ? "#f87171" : "#34d399",
    zoneLabel: z => `${z.name} · ${occ.get(z.id) ? T("zb.occ", "มีรถ") : T("zb.free", "ว่าง")}`,
    zoneExtra: (li, z, P) => {
      const sel = document.createElement("select");
      sel.setAttribute("aria-label", T("zb.type", "ประเภทช่อง {name}", { name: z.name }));
      [["car", T("zb.type.car", "รถยนต์")], ["moto", T("zb.type.moto", "จักรยานยนต์")]].forEach(([v, l]) => {
        const o = document.createElement("option"); o.value = v; o.textContent = l; sel.appendChild(o);
      });
      sel.value = z.type || "car";
      sel.addEventListener("change", () => { z.type = sel.value === "moto" ? "moto" : "car"; P.saveZones(); P.render(); });
      li.appendChild(sel);
    },
    onSettings: P => { mk(P.settings); },
    onZones: P => { for (const id of [...occ.keys()]) if (!P.zones.some(z => z.id === id)) occ.delete(id); },
    onDemo: P => { occ.clear(); lastNow = 0; const last = P.zones[5]; if (last && P.zones.length === 6 && last.type !== "moto") { last.type = "moto"; P.saveZones(); P.renderZones(); } }
  });
  const board = $("board"), btn = $("boardBtn");
  btn.addEventListener("click", () => {
    const on = board.hidden;
    board.hidden = !on; btn.setAttribute("aria-pressed", on ? "true" : "false");
    if (on && board.requestFullscreen && !(/** @type {any} */ (window).LQDetect && LQDetect.isTest())) board.requestFullscreen().catch(() => {});
  });
  board.addEventListener("click", () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); board.hidden = true; btn.setAttribute("aria-pressed", "false"); });
  /** @type {any} */ (window).__LQZ.occ = occ;
})();
