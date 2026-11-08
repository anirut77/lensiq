/* crowd.js — crowd.html: crowd counting & density for events, booths and shopfronts (Marketing menu).
 * People in view / per drawn zone, density heatmap (person-seconds by foot position, numbers only) + time series, peak hours,
 * entry/exit line counter, dwell per zone, visitors per hour (approx.), conversion against numbers the operator types in,
 * optional shopfront funnel (passers-by -> stopped -> entered), CSV export, printable summary, LQAgg summary pack (file).
 * Round 15: density heatmap per hour (slider + small multiples), printable peak-hour report, entry/exit per 15 minutes with
 * net occupancy, marketing CSV (labelled columns, UTF-8 BOM), and a "density estimate, not an exact count" label when the
 * measured limits of the person detector are reached (docs/CROWD-ACCURACY.md; LQCrowd.countQuality).
 * Runs on LQZoneCam (camera + detector + zone UI) and LQCrowd / LQZones (pure maths, tests/unit/crowd.test.js).
 * Privacy: frames are analysed in memory and dropped; only counts and aggregates are stored (localStorage, this device).
 * No faces, no identity, no images, no network. Capacity alerts are for staff to look at — they never act on their own.
 * Test hooks: window.__LQZ (+ __LQZ.cr = {live, line, counter}). ?fakedet on localhost: scripted boxes via LQDetect.fake("crowd").
 */
(function () {
  "use strict";
  const W = /** @type {any} */ (window);
  const ZC = W.LQZoneCam, Z = W.LQZones, C = W.LQCrowd, T = ZC.T;
  const $ = id => /** @type {any} */ (document.getElementById(id));
  const DEMO_SPEED = 2, NS = "lqcr", LINE_KEY = NS + "-line", DAY_PREFIX = NS + "-day-", DEMO_LOG = NS + "-demo-log";
  const ROLES = ["area", "pass", "stop"];
  const roleName = r => r === "pass" ? T("cr.role.pass", "ทางเดินหน้าร้าน") : r === "stop" ? T("cr.role.stop", "หน้าตู้โชว์/บูธ") : T("cr.role.area", "พื้นที่");
  const levelName = l => ({
    low: T("cr.lv.low", "โล่ง"), busy: T("cr.lv.busy", "เริ่มหนาแน่น"),
    crowded: T("cr.lv.crowded", "แน่น"), critical: T("cr.lv.critical", "แน่นมาก — ควรดูหน้างาน")
  })[l] || "";
  const pct = v => v == null ? "—" : Math.round(v * 100) + "%";
  const hh = h => String(h).padStart(2, "0") + ":00";
  const mm = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const clampN = (v, lo, hi, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  function loadLine() {
    const l = ZC.store.get(LINE_KEY, null);
    if (!l || !l.a || !l.b) return null;
    const pt = p => ({ x: clampN(p.x, 0, 1), y: clampN(p.y, 0, 1) });
    const a = pt(l.a), b = pt(l.b);
    return Math.hypot(a.x - b.x, a.y - b.y) < 0.02 ? null : { a, b, swap: !!l.swap };
  }
  // the demo door line lives in memory only (line.demo); a line the operator draws or swaps is saved
  const saveLine = () => { if (line && !line.demo) ZC.store.set(LINE_KEY, { a: line.a, b: line.b, swap: !!line.swap }); };

  let line = loadLine(), lineDraft = null, rule = null, lastNow = 0, total = 0, hourKey = -1, dayRef = null;
  const counter = C.createLineCounter();
  const dwell = Z.createDwell({ graceMs: 2000 });
  const totalSmooth = Z.createSmoother(5), smooth = new Map(), live = new Map(), counted = new Map();
  let hourSeen = new Set(), passSeen = new Set(), stopSeen = new Set();
  // count quality: median person-box height over the last ~5 s (25 frames at 5 Hz) + the busiest zone's people per m²
  const medSmooth = Z.createSmoother(25);
  let qual = { estimate: false, small: false, collapse: false }, heatSel = -1; // heatSel: -1 = whole day, 0..23 = that hour's grid
  // per-zone runtime state is keyed by zone id; a zone whose shape changed (or an id reused after a delete) gets a new
  // generation so only that zone's dwell starts over — people inside the other zones keep their time and are not re-counted
  const zoneSig = new Map(), zoneGen = new Map();
  const dwellKey = z => z.id + "#" + (zoneGen.get(z.id) || 0);
  const polySig = z => JSON.stringify(z.poly);
  const mkRule = s => Z.createThresholdAlert({ holdMs: s.holdSec * 1000, clearMs: s.clearSec * 1000, cooldownMs: s.cooldownMin * 60000 });
  function resetRuntime() {
    smooth.clear(); live.clear(); counted.clear(); dwell.reset(); counter.reset(); totalSmooth.reset(); medSmooth.reset();
    qual = { estimate: false, small: false, collapse: false };
    hourSeen = new Set(); passSeen = new Set(); stopSeen = new Set(); hourKey = -1; lastNow = 0;
  }

  // ---------- per frame ----------
  function onFrame(dets, now, P) {
    const s = P.settings, dt = lastNow ? Math.min(2000, Math.max(0, now - lastNow)) : 0;
    lastNow = now;
    if (!rule) rule = mkRule(s);
    if (P.zc.demo && !(P.day && P.day.demo)) enterDemo(P); // also after a day rollover during the demo
    if (dayRef !== P.day) { if (dayRef && !P.day.demo) pruneDays(); C.ensureDay(P.day); dayRef = P.day; passSeen = new Set(); stopSeen = new Set(); hourSeen = new Set(); counted.clear(); }
    const day = P.day, d = new Date(), h = d.getHours();
    const people = dets.filter(x => x.label === "person");
    total = Math.round(totalSmooth.push(people.length));
    if (total > day.peak) { day.peak = total; day.peakAt = Date.now(); }
    day.hourly.occSum[h] += total * dt; day.hourly.occMs[h] += dt;
    day.hourly.peak[h] = Math.max(day.hourly.peak[h], total);
    C.addMinute(day, h * 60 + d.getMinutes(), total, dt);
    if (h !== hourKey) { hourKey = h; hourSeen = new Set(); }
    const hg = dt > 0 && people.length ? C.heatHour(day, h) : null;
    for (const p of people) {
      if (dt > 0) { const a = Z.anchor(p, "foot"); C.gridAdd(day.heat, a, dt / 1000); C.gridAdd(hg, a, dt / 1000); }
      if (p.id && !hourSeen.has(p.id)) { hourSeen.add(p.id); day.hourly.uniq[h]++; }
    }
    const minVisit = s.minVisitSec * 1000, stopMs = s.stopSec * 1000;
    for (const z of P.zones) {
      const inZ = people.filter(b => Z.boxInZone(b, z.poly, "foot"));
      if (!smooth.has(z.id)) smooth.set(z.id, Z.createSmoother(5));
      const count = Math.round(smooth.get(z.id).push(inZ.length));
      const zs = C.zoneStat(day, z); zs.name = z.name; zs.role = z.role;
      zs.peak = Math.max(zs.peak, count); zs.occSum += count * dt; zs.occMs += dt;
      const r = dwell.update(dwellKey(z), inZ.filter(b => b.id).map(b => b.id), now);
      const cs = counted.get(z.id) || new Set(); counted.set(z.id, cs);
      for (const a of r.active) {
        if (a.ms >= minVisit && !cs.has(a.id)) { cs.add(a.id); zs.visits++; }
        if ((z.role === "pass" || z.role === "stop") && !passSeen.has(a.id)) { passSeen.add(a.id); day.funnel.pass++; }
        if (z.role === "stop" && a.ms >= stopMs && !stopSeen.has(a.id)) { stopSeen.add(a.id); day.funnel.stop++; }
      }
      for (const e of r.ended) if (cs.has(e.id)) { zs.dwellSum += e.ms; zs.dwellN++; cs.delete(e.id); }
      const over = z.cap > 0 && count >= z.cap;
      const ev = rule.update(z.id, over, now);
      if (ev === "raise") P.alert(z.id, T("cr.alert", "โซน \"{zone}\" มี {n} คน ถึงจำนวนสูงสุดที่ตั้งไว้ ({cap} คน) — ให้เจ้าหน้าที่ดูหน้างานก่อนตัดสินใจจัดการฝูงชน",
        { zone: z.name, n: count, cap: z.cap }), z.name);
      else if (ev === "clear") P.clear(z.id, T("cr.clear", "โซน \"{zone}\" กลับสู่ปกติ ({n} คน)", { zone: z.name, n: count }), z.name);
      live.set(z.id, { count, dens: C.density(count, z.area), on: rule.isOn(z.id), longest: r.active.length ? r.active[0].ms : 0 });
    }
    if (line) for (const c of counter.update(people, line, line.swap, now)) {
      if (c.dir === "in") { day.in++; day.hourly.in[h]++; } else { day.out++; day.hourly.out[h]++; }
      C.addCross(day, h * 60 + d.getMinutes(), c.dir);
    }
    const hs = people.map(b => b.h).sort((a, b) => a - b), medH = hs.length ? medSmooth.push(hs[hs.length >> 1]) : medSmooth.value();
    let perM2 = null;
    for (const v of live.values()) if (v.dens != null && (perM2 == null || v.dens > perM2)) perM2 = v.dens;
    qual = C.countQuality({ count: total, medH: Number.isFinite(medH) ? medH : null, perM2, expected: Number(P.settings.expectCrowd) || 0 });
  }

  // ---------- drawing on the camera canvas ----------
  function draw(c, P) {
    const cv = P.zc.canvas, Wd = cv.width, Hd = cv.height;
    if (P.settings.heatOverlay && P.day && P.day.heat) {
      const G = P.day.heat, m = C.gridMax(G);
      if (m > 0) {
        c.save();
        for (let i = 0; i < G.d.length; i++) {
          const t = Math.sqrt(G.d[i] / m); if (t < 0.05) continue;
          const [r, g, b] = C.heatColor(t);
          c.fillStyle = `rgba(${r},${g},${b},${(0.12 + 0.38 * t).toFixed(2)})`;
          c.fillRect((i % G.cols) * Wd / G.cols, Math.floor(i / G.cols) * Hd / G.rows, Wd / G.cols + 1, Hd / G.rows + 1);
        }
        c.restore();
      }
    }
    const ln = lineDraft && lineDraft.length === 1 ? null : line;
    if (lineDraft && lineDraft.length === 1) {
      const p = lineDraft[0]; c.fillStyle = "#facc15"; c.beginPath(); c.arc(p.x * Wd, p.y * Hd, Math.max(5, Wd / 120), 0, Math.PI * 2); c.fill();
    }
    if (ln) {
      P.zc.drawPoly(c, [ln.a, ln.b], { color: "#facc15", fill: 0 });
      const mx = (ln.a.x + ln.b.x) / 2, my = (ln.a.y + ln.b.y) / 2, dx = ln.b.x - ln.a.x, dy = ln.b.y - ln.a.y, len = Math.hypot(dx, dy) || 1;
      const k = 0.07 * (ln.swap ? -1 : 1), nx = -dy / len * k, ny = dx / len * k; // +normal = side 1 = "in" (unless swapped)
      const cl = v => Math.max(0.05, Math.min(0.95, v));
      P.zc.textAt(c, T("cr.line.in", "เข้า {n}", { n: P.day ? P.day.in : 0 }), { x: cl(mx + nx), y: cl(my + ny) }, "#34d399");
      P.zc.textAt(c, T("cr.line.out", "ออก {n}", { n: P.day ? P.day.out : 0 }), { x: cl(mx - nx), y: cl(my - ny) }, "#fb923c");
    }
  }

  // ---------- rendering ----------
  function tile(k, v, sub, hot) {
    const d = document.createElement("div"); d.className = "tile" + (hot ? " hot" : "");
    const a = document.createElement("div"); a.className = "k"; a.textContent = k;
    const b = document.createElement("div"); b.className = "v"; b.textContent = v;
    d.append(a, b);
    if (sub) { const e = document.createElement("div"); e.className = "s"; e.textContent = sub; d.appendChild(e); }
    return d;
  }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function dwellAll(P) {
    let s = 0, n = 0;
    for (const z of P.zones) { const zs = P.day.zones[z.id]; if (zs) { s += zs.dwellSum; n += zs.dwellN; } }
    return n ? s / n : 0;
  }
  function render(P) {
    const tiles = $("tiles"); if (!tiles || !P.day) return;
    C.ensureDay(P.day);
    const day = P.day, h = new Date().getHours(), top = C.peakHours(day, 1)[0];
    const anyOn = P.zones.some(z => live.get(z.id) && live.get(z.id).on);
    tiles.textContent = "";
    tiles.append(
      tile(T("cr.t.now", "คนในภาพตอนนี้"), qual.estimate ? "≈ " + total : String(total),
        qual.estimate ? T("cr.q.tile", "ค่าประมาณความหนาแน่น ไม่ใช่ยอดนับที่แน่นอน") : T("cr.t.zones", "{n} โซน", { n: P.zones.length }), anyOn),
      tile(T("cr.t.peak", "มากสุดวันนี้"), String(day.peak), day.peakAt ? ZC.fmtClock(day.peakAt) : "—"),
      tile(T("cr.t.inout", "เข้า / ออก (เส้นนับ)"), line ? `${day.in} / ${day.out}` : "—",
        line ? T("cr.t.inside", "คงอยู่ข้างในราว {n} คน", { n: Math.max(0, day.in - day.out) }) : T("cr.t.noLine", "ยังไม่มีเส้นนับ")),
      tile(T("cr.t.net", "สุทธิ 15 นาทีล่าสุด (เข้า − ออก)"), line ? fmtNet(lastQuarter(day)) : "—", line ? T("cr.t.netS", "นับจากเส้นนับ ไม่ระบุตัวตน") : T("cr.t.noLine", "ยังไม่มีเส้นนับ")),
      tile(T("cr.t.hour", "ผู้เข้าชมชั่วโมงนี้ (ประมาณ)"), String(day.hourly.uniq[h]), T("cr.t.hourS", "นับตามรหัสชั่วคราว ไม่ระบุตัวตน")),
      tile(T("cr.t.busy", "ชั่วโมงที่คนเยอะสุด"), top ? hh(top.h) : "—", top ? T("cr.t.busyS", "เฉลี่ย {a} คน · สูงสุด {p}", { a: top.avg.toFixed(1), p: top.peak }) : T("cr.t.busyNone", "ต้องเก็บข้อมูลอย่างน้อย 1 นาที")),
      tile(T("cr.t.dwell", "เวลาอยู่ในโซนเฉลี่ย"), dwellAll(P) ? ZC.fmtMS(dwellAll(P)) : "—", T("cr.t.dwellS", "เฉพาะคนที่ออกจากโซนแล้ว"))
    );
    const q = $("crQual");
    if (q) {
      const msgs = [];
      if (qual.collapse) msgs.push(T("cr.q.collapse",
        "ตั้งไว้ว่าคาดว่าจะมีคนราว {e} คน แต่ตรวจพบเพียง {n} คน: ในฝูงชนแน่นตัวตรวจจับนับได้ลดลงจนเกือบเป็นศูนย์ ใช้ตัวเลขนี้นับจำนวนไม่ได้",
        { e: Number(P.settings.expectCrowd) || 0, n: total }));
      if (qual.estimate) msgs.push(T("cr.q.est", "ค่าประมาณความหนาแน่น ไม่ใช่ยอดนับที่แน่นอน: คนในภาพมากหรือแน่น ตัวตรวจจับนับขาดเมื่อคนยืนบังกัน (วัดได้: ฝูงชนหลายร้อยคนถูกนับได้แทบเป็นศูนย์)"));
      if (qual.small) msgs.push(T("cr.q.small", "คนในภาพดูตัวเล็ก (ไกลกล้อง) ตัวตรวจจับมักนับขาด — วัดได้ว่านับต่ำกว่าจริงราว 37–59% ย้ายกล้องให้ใกล้ขึ้นหรือวาดโซนเฉพาะช่วงใกล้กล้อง"));
      q.hidden = !msgs.length; q.textContent = msgs.join(" · ");
    }
    const ul = $("zoneState");
    if (ul) {
      ul.textContent = "";
      for (const z of P.zones) {
        const v = live.get(z.id) || { count: 0, dens: null, on: false }, zs = day.zones[z.id];
        const li = el("li", "zc-state" + (v.on ? " hot" : ""));
        const lv = C.densityLevel(v.dens);
        li.textContent = T("cr.zoneLine", "{zone} ({role}): {n} คน{dens} · เข้าโซน {v} ครั้ง · อยู่เฉลี่ย {d}", {
          zone: z.name, role: roleName(z.role), n: v.count,
          dens: v.dens == null ? "" : T("cr.densPart", " · {d} คน/ตร.ม. ({lv})", { d: v.dens.toFixed(2), lv: levelName(lv) }),
          v: zs ? zs.visits : 0, d: zs && zs.dwellN ? ZC.fmtMS(C.avgDwellSec(zs) * 1000) : "—"
        });
        ul.appendChild(li);
      }
    }
    const t = Date.now();
    if (t - lastSlow > 1000 || P._force) { lastSlow = t; P._force = false; renderSlow(P); }
  }
  let lastSlow = 0;
  function renderSlow(P) { renderHeat(P); renderHeatHours(P); renderSeries(P); renderHourly(P); renderFunnel(P); renderQ15(P); renderConv(P); renderSummary(P); renderPeak(P); }
  const fmtNet = n => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n);
  // Net in-out of the latest 15-minute slot: today = the wall-clock slot; a seeded/demo or earlier day = its last slot with data.
  function lastQuarter(day) {
    const d = new Date(), q = day.q15 || {};
    if (day.date === ZC.dayKey(d)) { const r = q[String(Math.floor((d.getHours() * 60 + d.getMinutes()) / 15))]; return r ? r[0] - r[1] : 0; }
    const ks = Object.keys(q).map(Number).filter(Number.isFinite).sort((a, b) => a - b), r = ks.length ? q[String(ks[ks.length - 1])] : null;
    return r ? r[0] - r[1] : 0;
  }

  function renderHeat(P) {
    const cv = $("heat"); if (!cv) return;
    const hours = C.heatHours(P.day);
    if (heatSel >= 0 && !hours.includes(heatSel)) heatSel = -1;
    const c = cv.getContext("2d"), G = heatSel >= 0 ? P.day.heatH[String(heatSel)] : P.day.heat, m = C.gridMax(G), Wd = cv.width, Hd = cv.height;
    c.fillStyle = "#1b2347"; c.fillRect(0, 0, Wd, Hd);
    for (let i = 0; i < G.d.length; i++) {
      const v = m ? Math.sqrt(G.d[i] / m) : 0;
      if (v < 0.02) continue;
      const [r, g, b] = C.heatColor(v);
      c.fillStyle = `rgb(${r},${g},${b})`;
      c.fillRect((i % G.cols) * Wd / G.cols, Math.floor(i / G.cols) * Hd / G.rows, Wd / G.cols + 0.5, Hd / G.rows + 0.5);
    }
    c.strokeStyle = "rgba(255,255,255,.5)"; c.lineWidth = 2;
    for (const z of P.zones) {
      c.beginPath(); z.poly.forEach((p, i) => i ? c.lineTo(p.x * Wd, p.y * Hd) : c.moveTo(p.x * Wd, p.y * Hd)); c.closePath(); c.stroke();
    }
    if (line) { c.strokeStyle = "#facc15"; c.beginPath(); c.moveTo(line.a.x * Wd, line.a.y * Hd); c.lineTo(line.b.x * Wd, line.b.y * Hd); c.stroke(); }
    if (!m) { c.fillStyle = "#c9d0ea"; c.font = "16px Prompt, Inter, sans-serif"; c.textAlign = "center"; c.fillText(T("cr.heatEmpty", "ยังไม่มีข้อมูลวันนี้"), Wd / 2, Hd / 2); }
    const sl = $("heatHour"), lb = $("heatHourLbl");
    if (sl) {
      sl.max = String(Math.max(0, hours.length)); sl.value = String(heatSel >= 0 ? hours.indexOf(heatSel) + 1 : 0); sl.disabled = !hours.length;
      const txt = heatSel >= 0 ? T("cr.heatH.one", "ช่วง {from}–{to}", { from: hh(heatSel), to: hh((heatSel + 1) % 24) }) : T("cr.heatH.all", "ทั้งวัน");
      sl.setAttribute("aria-valuetext", txt);
      if (lb) lb.textContent = txt;
    }
  }
  // small multiples: one mini heatmap per hour with data; tapping one (or moving the slider) shows that hour above
  let hoursSig = "";
  function renderHeatHours(P) {
    const box = $("heatHours"); if (!box) return;
    const hours = C.heatHours(P.day), sig = hours.join(",") + "|" + heatSel + "|" + (W.LQI18N ? W.LQI18N.lang : "");
    if (sig !== hoursSig) {
      hoursSig = sig; box.textContent = "";
      if (!hours.length) { box.appendChild(el("p", "hint", T("cr.heatH.none", "ยังไม่มีข้อมูลรายชั่วโมง"))); }
      for (const h of hours) {
        const b = /** @type {HTMLButtonElement} */ (el("button", "cr-hm" + (h === heatSel ? " on" : "")));
        b.type = "button"; b.dataset.h = String(h); b.setAttribute("aria-pressed", String(h === heatSel));
        b.setAttribute("aria-label", T("cr.heatH.btn", "ดูฮีตแมปช่วง {from}–{to}", { from: hh(h), to: hh((h + 1) % 24) }));
        const cv = /** @type {HTMLCanvasElement} */ (el("canvas")); cv.width = 96; cv.height = 56;
        b.append(cv, el("span", "", hh(h)));
        b.addEventListener("click", () => { heatSel = heatSel === h ? -1 : h; P._force = true; P.render(); });
        box.appendChild(b);
      }
    }
    for (const b of box.querySelectorAll("button")) {
      const G = P.day.heatH[b.dataset.h], cv = b.querySelector("canvas"); if (!G || !cv) continue;
      const c = cv.getContext("2d"), m = C.gridMax(G);
      c.fillStyle = "#1b2347"; c.fillRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < G.d.length; i++) {
        const v = m ? Math.sqrt(G.d[i] / m) : 0; if (v < 0.02) continue;
        const [r, g, bl] = C.heatColor(v); c.fillStyle = `rgb(${r},${g},${bl})`;
        c.fillRect((i % G.cols) * cv.width / G.cols, Math.floor(i / G.cols) * cv.height / G.rows, cv.width / G.cols + 0.5, cv.height / G.rows + 0.5);
      }
    }
  }
  const SVGNS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); return e; }
  function renderSeries(P) {
    const sv = $("series"); if (!sv) return;
    const d = new Date(), nowM = d.getHours() * 60 + d.getMinutes(), from = Math.max(0, nowM - 119);
    const pts = C.series(P.day, from, nowM);
    sv.textContent = "";
    const Wd = 480, Hd = 200, pad = 22, max = Math.max(4, ...pts.map(p => p.max));
    const x = m => pad + (m - from) / Math.max(1, nowM - from) * (Wd - pad - 6), y = v => Hd - pad - v / max * (Hd - pad - 10);
    sv.appendChild(svgEl("rect", { x: 0, y: 0, width: Wd, height: Hd, fill: "#f6f7fb" }));
    for (const g of [0, 0.5, 1]) {
      sv.appendChild(svgEl("line", { x1: pad, x2: Wd - 6, y1: y(max * g), y2: y(max * g), stroke: "#d7dbea", "stroke-width": 1 }));
      const tx = svgEl("text", { x: 2, y: y(max * g) + 4, "font-size": 12, fill: "#5b6280" }); tx.textContent = String(Math.round(max * g)); sv.appendChild(tx);
    }
    if (pts.length) {
      sv.appendChild(svgEl("polyline", { points: pts.map(p => `${x(p.m).toFixed(1)},${y(p.max).toFixed(1)}`).join(" "), fill: "none", stroke: "#a78bfa", "stroke-width": 1.5, "stroke-dasharray": "4 3" }));
      sv.appendChild(svgEl("polyline", { points: pts.map(p => `${x(p.m).toFixed(1)},${y(p.avg).toFixed(1)}`).join(" "), fill: "none", stroke: "#4b36d6", "stroke-width": 2.5 }));
    }
    const lab = (m, anchor) => { const t = svgEl("text", { x: x(m), y: Hd - 4, "font-size": 12, fill: "#5b6280", "text-anchor": anchor }); t.textContent = mm(m); sv.appendChild(t); };
    lab(from, "start"); lab(nowM, "end");
    const cap = $("seriesCap");
    if (cap) cap.textContent = pts.length
      ? T("cr.seriesCap", "เส้นทึบ = คนในภาพเฉลี่ยต่อนาที · เส้นประ = สูงสุดต่อนาที ({from}–{to})", { from: mm(from), to: mm(nowM) })
      : T("cr.seriesNone", "ยังไม่มีข้อมูลใน 2 ชั่วโมงล่าสุด");
  }
  function renderHourly(P) {
    const box = $("crHourly"); if (!box) return;
    box.textContent = "";
    const peaks = C.peakHours(P.day, 3), hot = new Set(peaks.map(p => p.h));
    const avgs = Array.from({ length: 24 }, (_, h) => C.hourAvg(P.day, h) || 0), max = Math.max(1, ...avgs);
    // the values for screen readers / touch: every hour with data, in the label of the chart itself
    const withData = avgs.map((a, h) => ({ a, h })).filter(x => C.hourAvg(P.day, x.h) != null);
    box.setAttribute("aria-label", withData.length
      ? T("cr.hourlyAriaV", "คนในภาพเฉลี่ยรายชั่วโมง: {list}", { list: withData.map(x => T("cr.hourTip", "{h}: เฉลี่ย {a} คน", { h: hh(x.h), a: x.a.toFixed(1) })).join(", ") })
      : T("cr.hourlyAria", "กราฟแท่งคนเฉลี่ยรายชั่วโมง"));
    avgs.forEach((a, h) => {
      const col = el("div", "cr-hcol" + (hot.has(h) ? " hot" : ""));
      const bar = el("i", "cr-bar"); bar.style.height = Math.round(a / max * 100) + "%";
      col.title = T("cr.hourTip", "{h}: เฉลี่ย {a} คน", { h: hh(h), a: a.toFixed(1) });
      col.append(bar, el("span", "cr-hl", h % 3 === 0 ? String(h) : ""));
      box.appendChild(col);
    });
    const pe = $("peaks");
    if (pe) pe.textContent = peaks.length
      ? T("cr.peaks", "ช่วงเวลาคนเยอะ: {list}", { list: peaks.map(p => T("cr.peakItem", "{h} (เฉลี่ย {a} คน)", { h: hh(p.h), a: p.avg.toFixed(1) })).join(" · ") })
      : T("cr.peaksNone", "ยังไม่มีชั่วโมงที่มีข้อมูลครบ 1 นาที");
  }
  function renderFunnel(P) {
    const ol = $("funnel"); if (!ol) return;
    ol.textContent = "";
    const f = P.day.funnel, hasRoles = P.zones.some(z => z.role === "pass" || z.role === "stop"), r = C.funnelRates({ pass: f.pass, stop: f.stop, enter: P.day.in });
    const step = (k, v, sub) => { const li = el("li", "cr-step"); li.append(el("span", "k", k), el("b", "v", v)); if (sub) li.appendChild(el("span", "s", sub)); ol.appendChild(li); };
    if (hasRoles) {
      step(T("cr.f.pass", "เดินผ่าน"), String(f.pass), T("cr.f.passS", "เห็นในโซนทางเดิน/หน้าตู้โชว์"));
      step(T("cr.f.stop", "หยุดดู"), String(f.stop), T("cr.f.rate", "{p} ของคนเดินผ่าน", { p: pct(r.stopRate) }));
    }
    step(T("cr.f.enter", "เข้า (เส้นนับ)"), line ? String(P.day.in) : "—", line
      ? (hasRoles ? T("cr.f.enterS", "{p} ของคนเดินผ่าน · {q} เทียบกับคนหยุดดู", { p: pct(r.overall), q: pct(r.enterRate) }) : T("cr.f.out", "ออก {n}", { n: P.day.out }))
      : T("cr.t.noLine", "ยังไม่มีเส้นนับ"));
  }
  function renderQ15(P) {
    const box = $("q15"); if (!box) return;
    const rows = C.quarterTable(P.day);
    box.textContent = "";
    if (!rows.length) { box.appendChild(el("p", "hint", line ? T("cr.q15.none", "ยังไม่มีคนข้ามเส้นนับวันนี้") : T("cr.t.noLine", "ยังไม่มีเส้นนับ"))); return; }
    const tw = el("div", "cr-tw cr-q15w"), tb = el("table", "cr-table"), tr = el("tr");
    for (const hd of [T("cr.q15.time", "ช่วงเวลา"), T("cr.q15.in", "เข้า (คน)"), T("cr.q15.out", "ออก (คน)"), T("cr.q15.net", "สุทธิ (เข้า − ออก)"),
      T("cr.q15.occ", "คงอยู่ข้างใน (ประมาณ)")]) tr.appendChild(el("th", "", hd));
    const th = el("thead"); th.appendChild(tr); tb.appendChild(th);
    const body = el("tbody");
    for (const r of rows.slice().reverse()) { // newest first
      const row = el("tr");
      for (const v of [r.from + "–" + r.to, r.in, r.out, fmtNet(r.net), r.occ]) row.appendChild(el("td", "", String(v)));
      body.appendChild(row);
    }
    tb.appendChild(body); tw.appendChild(tb); box.appendChild(tw);
  }
  // ---------- peak-hour report (printable) ----------
  function renderPeak(P) {
    const box = $("peakBody"); if (!box) return;
    const rp = C.peakReport(P.day, P.zones), name = String(P.settings.siteName || "").trim();
    box.textContent = "";
    box.appendChild(el("p", "cr-sum-h", T("cr.sum.head", "{site}วันที่ {date} · {zc}", { site: name ? name + " · " : "", date: P.day.date,
      zc: P.day.demo ? T("cr.sum.demo", "ข้อมูลจำลอง (โหมดตัวอย่าง)") : T("cr.sum.real", "ตัวเลขประมาณจากกล้อง") })));
    if (!rp.hours.length) box.appendChild(el("p", "hint", T("cr.peaksNone", "ยังไม่มีชั่วโมงที่มีข้อมูลครบ 1 นาที")));
    else {
      const tw = el("div", "cr-tw"), tb = el("table", "cr-table"), tr = el("tr");
      for (const hd of [T("cr.rep.rank", "อันดับ"), T("zq.csv.h1", "ชั่วโมง"), T("cr.csv.avg", "คนในภาพเฉลี่ย"), T("cr.csv.max", "สูงสุด"),
        T("cr.csv.uniq", "ผู้เข้าชม (ประมาณ)"), T("cr.csv.in", "เข้า"), T("cr.csv.out", "ออก")]) tr.appendChild(el("th", "", hd));
      const th = el("thead"); th.appendChild(tr); tb.appendChild(th);
      const body = el("tbody");
      rp.hours.forEach((p, i) => {
        const row = el("tr");
        const io = line || p.in || p.out;
        for (const v of [i + 1, hh(p.h) + "–" + hh((p.h + 1) % 24), p.avg.toFixed(1), p.peak, p.uniq, io ? p.in : "—", io ? p.out : "—"]) row.appendChild(el("td", "", String(v)));
        body.appendChild(row);
      });
      tb.appendChild(body); tw.appendChild(tb); box.appendChild(tw);
    }
    const dl = el("dl", "cr-dl");
    const kv = (k, v) => { dl.append(el("dt", "", k), el("dd", "", v)); };
    kv(T("cr.rep.zone", "โซนที่คนเยอะสุด"), rp.zone ? T("cr.rep.zoneV", "{zone}: เฉลี่ย {a} คน · สูงสุด {p} คน · เข้าโซน {v} ครั้ง{dens}", {
      zone: rp.zone.name, a: rp.zone.avg.toFixed(1), p: rp.zone.peak, v: rp.zone.visits,
      dens: rp.zone.peakPerM2 == null ? "" : T("cr.rep.dens", " · สูงสุด {d} คน/ตร.ม. ({lv})", { d: rp.zone.peakPerM2.toFixed(2), lv: levelName(rp.zone.level) }) }) : "—");
    const rq = rp.quarter;
    kv(T("cr.rep.q", "15 นาทีที่คนเข้า–ออกมากสุด"), rq ? T("cr.rep.qV", "{from}–{to}: เข้า {i} · ออก {o}", { from: rq.from, to: rq.to, i: rq.in, o: rq.out }) : "—");
    kv(T("cr.rep.hot", "ความกระจุกตัว"), rp.hot == null ? "—" : T("cr.rep.hotV", "{p} ของเวลาที่มีคนอยู่ รวมอยู่ใน 10% ของพื้นที่ภาพที่คนเยอะสุด", { p: pct(rp.hot) }));
    kv(T("cr.sum.visitors", "ผู้เข้าชมรวม (ประมาณ)"), String(rp.visitors));
    box.appendChild(dl);
    box.appendChild(el("p", "hint", T("cr.rep.note", "ตัวเลขเป็นค่าประมาณจากกล้อง (ดูหมายเหตุความแม่นยำด้านบน) ไม่มีภาพหรือข้อมูลระบุตัวบุคคล")));
  }
  const convLabel = P => P.settings.convKind === "signup" ? T("cr.conv.signupN", "ยอดลงทะเบียน") : P.settings.convKind === "other" ? T("cr.conv.otherN", "ผลลัพธ์") : T("cr.conv.buyN", "ยอดซื้อ");
  function convRows(P) {
    const rows = P.zones.map(z => ({ id: z.id, name: z.name, entries: (P.day.zones[z.id] || {}).visits || 0 }));
    if (line) rows.unshift({ id: "_line", name: T("cr.conv.line", "ทางเข้า (เส้นนับ)"), entries: P.day.in });
    return rows.map(r => ({ ...r, outcome: clampN(P.day.conv[r.id], 0, 1e7, null), rate: C.rate(clampN(P.day.conv[r.id], 0, 1e7, NaN), r.entries) }));
  }
  let convSig = "";
  function renderConv(P) {
    const ul = $("conv"); if (!ul) return;
    const rows = convRows(P), sig = rows.map(r => r.id + ":" + r.name).join("|") + "|" + convLabel(P) + "|" + (W.LQI18N ? W.LQI18N.lang : "");
    if (sig !== convSig || !ul.children.length) {
      convSig = sig; ul.textContent = "";
      if (!rows.length) { ul.appendChild(el("li", "zc-empty", T("cr.conv.none", "เพิ่มโซนหรือเส้นนับก่อน แล้วกรอกยอดที่นี่"))); return; }
      for (const r of rows) {
        const li = el("li", "cr-crow"); li.dataset.id = r.id;
        const lab = el("label", "cr-cin");
        const inp = /** @type {HTMLInputElement} */ (el("input"));
        inp.type = "number"; inp.min = "0"; inp.max = "10000000"; inp.inputMode = "numeric"; inp.name = "conv-" + r.id;
        inp.value = r.outcome == null ? "" : String(r.outcome);
        lab.append(el("span", "", T("cr.conv.in", "{kind} วันนี้", { kind: convLabel(P) })), inp);
        inp.addEventListener("change", () => {
          const v = inp.value === "" ? null : clampN(inp.value, 0, 1e7, null);
          if (v == null) delete P.day.conv[r.id]; else P.day.conv[r.id] = Math.round(v);
          inp.value = v == null ? "" : String(Math.round(v));
          P.saveDay(true); P._force = true; P.render();
        });
        li.append(el("b", "cr-cn", r.name), el("span", "cr-ce"), lab, el("span", "cr-cr"));
        ul.appendChild(li);
      }
    }
    for (const r of rows) {
      const li = ul.querySelector(`[data-id="${r.id}"]`); if (!li) continue;
      li.querySelector(".cr-ce").textContent = T("cr.conv.entries", "คนเข้า {n}", { n: r.entries });
      li.querySelector(".cr-cr").textContent = T("cr.conv.rate", "อัตราแปลง {p}", { p: pct(r.rate) });
    }
  }
  function renderSummary(P) {
    const box = $("sumBody"); if (!box) return;
    const day = P.day, peaks = C.peakHours(day, 3), visitors = day.hourly.uniq.reduce((a, b) => a + b, 0);
    box.textContent = "";
    const name = String(P.settings.siteName || "").trim();
    box.appendChild(el("p", "cr-sum-h", T("cr.sum.head", "{site}วันที่ {date} · {zc}", { site: name ? name + " · " : "", date: day.date, zc: day.demo ? T("cr.sum.demo", "ข้อมูลจำลอง (โหมดตัวอย่าง)") : T("cr.sum.real", "ตัวเลขประมาณจากกล้อง") })));
    const dl = el("dl", "cr-dl");
    const kv = (k, v) => { dl.append(el("dt", "", k), el("dd", "", v)); };
    kv(T("cr.t.peak", "มากสุดวันนี้"), day.peakAt ? T("cr.sum.peakV", "{n} คน เวลา {t}", { n: day.peak, t: ZC.fmtClock(day.peakAt) }) : "—");
    kv(T("cr.sum.visitors", "ผู้เข้าชมรวม (ประมาณ)"), String(visitors));
    kv(T("cr.t.inout", "เข้า / ออก (เส้นนับ)"), line || day.in || day.out ? `${day.in} / ${day.out}` : "—");
    kv(T("cr.sum.peakH", "ช่วงเวลาคนเยอะ"), peaks.length ? peaks.map(p => hh(p.h)).join(", ") : "—");
    kv(T("cr.t.dwell", "เวลาอยู่ในโซนเฉลี่ย"), dwellAll(P) ? ZC.fmtMS(dwellAll(P)) : "—");
    if (day.funnel.pass) kv(T("cr.sum.funnel", "กรวยหน้าร้าน"), T("cr.sum.funnelV", "ผ่าน {p} → หยุดดู {s} → เข้า {e}", { p: day.funnel.pass, s: day.funnel.stop, e: day.in }));
    box.appendChild(dl);
    const rows = convRows(P);
    if (rows.length) {
      const tw = el("div", "cr-tw"), tb = el("table", "cr-table"), tr = el("tr");
      for (const hd of [T("zc.csv.zone", "โซน"), T("cr.csv.visits", "คนเข้า"), T("cr.csv.dwell", "อยู่เฉลี่ย (วินาที)"), T("cr.csv.zpeak", "สูงสุดพร้อมกัน"), convLabel(P), T("cr.csv.rate", "อัตราแปลง")]) tr.appendChild(el("th", "", hd));
      const th = el("thead"); th.appendChild(tr); tb.appendChild(th);
      const body = el("tbody");
      for (const r of rows) {
        const zs = day.zones[r.id], row = el("tr");
        for (const v of [r.name, r.entries, zs && zs.dwellN ? Math.round(C.avgDwellSec(zs)) : "—", zs ? zs.peak : "—", r.outcome == null ? "—" : r.outcome, pct(r.rate)]) row.appendChild(el("td", "", String(v)));
        body.appendChild(row);
      }
      tb.appendChild(body); tw.appendChild(tb); box.appendChild(tw);
    }
    box.appendChild(el("p", "hint", T("cr.sum.note", "ตัวเลขทั้งหมดเป็นค่าประมาณจากการนับกรอบตัวคนแบบไม่ระบุตัวตน ไม่มีภาพหรือข้อมูลระบุตัวบุคคล ยอดซื้อ/ลงทะเบียนเป็นตัวเลขที่ผู้ใช้กรอกเอง")));
  }

  // ---------- CSV ----------
  function csv(P) {
    const day = C.ensureDay(P.day), rows = [];
    if (day.demo) rows.push([T("cr.csv.demo", "ข้อมูลจำลอง (โหมดตัวอย่าง) — ไม่ใช่ตัวเลขจริง")]);
    rows.push([T("cr.csv.site", "จุด/อีเวนต์"), String(P.settings.siteName || ""), T("cr.csv.date", "วันที่"), day.date]);
    rows.push([T("cr.t.peak", "มากสุดวันนี้"), day.peak, day.peakAt ? new Date(day.peakAt).toISOString() : "", T("cr.csv.in", "เข้า"), day.in, T("cr.csv.out", "ออก"), day.out,
      T("cr.sum.visitors", "ผู้เข้าชมรวม (ประมาณ)"), day.hourly.uniq.reduce((a, b) => a + b, 0)]);
    rows.push([]);
    rows.push([T("zq.csv.h1", "ชั่วโมง"), T("cr.csv.avg", "คนในภาพเฉลี่ย"), T("cr.csv.max", "สูงสุด"), T("cr.csv.in", "เข้า"), T("cr.csv.out", "ออก"), T("cr.csv.uniq", "ผู้เข้าชม (ประมาณ)"), T("zq.csv.h3", "นาทีที่วัด")]);
    for (let h = 0; h < 24; h++) {
      const a = C.hourAvg(day, h);
      if (a != null || day.hourly.in[h] || day.hourly.out[h]) rows.push([hh(h), a == null ? "" : a.toFixed(2), day.hourly.peak[h], day.hourly.in[h], day.hourly.out[h], day.hourly.uniq[h], (day.hourly.occMs[h] / 60000).toFixed(1)]);
    }
    rows.push([]);
    rows.push([T("zc.csv.zone", "โซน"), T("cr.csv.role", "บทบาท"), T("cr.csv.visits", "คนเข้า"), T("cr.csv.dwell", "อยู่เฉลี่ย (วินาที)"), T("cr.csv.zpeak", "สูงสุดพร้อมกัน"),
      T("cr.csv.zavg", "คนเฉลี่ยในโซน"), T("cr.csv.area", "พื้นที่ (ตร.ม.)"), T("cr.csv.dens", "คน/ตร.ม. เฉลี่ย"), convLabel(P), T("cr.csv.rate", "อัตราแปลง")]);
    const conv = new Map(convRows(P).map(r => [r.id, r]));
    if (conv.has("_line")) { const r = conv.get("_line"); rows.push([r.name, "", r.entries, "", "", "", "", "", r.outcome == null ? "" : r.outcome, r.rate == null ? "" : (r.rate * 100).toFixed(1) + "%"]); }
    for (const z of P.zones) {
      const zs = day.zones[z.id] || {}, avg = zs.occMs ? zs.occSum / zs.occMs : 0, r = conv.get(z.id) || {};
      rows.push([z.name, roleName(z.role), zs.visits || 0, zs.dwellN ? C.avgDwellSec(zs).toFixed(1) : "", zs.peak || 0, avg.toFixed(2), z.area || "",
        z.area ? (avg / z.area).toFixed(3) : "", r.outcome == null ? "" : r.outcome, r.rate == null ? "" : (r.rate * 100).toFixed(1) + "%"]);
    }
    rows.push([]);
    const fr = C.funnelRates({ pass: day.funnel.pass, stop: day.funnel.stop, enter: day.in });
    rows.push([T("cr.sum.funnel", "กรวยหน้าร้าน"), T("cr.f.pass", "เดินผ่าน"), day.funnel.pass, T("cr.f.stop", "หยุดดู"), day.funnel.stop, T("cr.f.enter", "เข้า (เส้นนับ)"), day.in,
      T("cr.csv.overall", "เข้า ÷ เดินผ่าน"), fr.overall == null ? "" : (fr.overall * 100).toFixed(1) + "%"]);
    rows.push([]);
    rows.push([T("cr.csv.minute", "นาที"), T("cr.csv.avg", "คนในภาพเฉลี่ย"), T("cr.csv.max", "สูงสุด")]);
    for (const p of C.series(day, 0, 1439)) rows.push([mm(p.m), p.avg.toFixed(2), p.max]);
    rows.push([]);
    rows.push([T("cr.csv.heat", "ฮีตแมป (0–100 ต่อช่อง แถวบนลงล่าง)"), `${day.heat.cols}x${day.heat.rows}`]);
    const hn = C.gridNorm(day.heat);
    for (let y = 0; y < day.heat.rows; y++) rows.push(hn.slice(y * day.heat.cols, (y + 1) * day.heat.cols));
    rows.push([]);
    rows.push([T("zc.csv.time", "เวลา"), T("zc.csv.zone", "โซน"), T("zc.csv.event", "เหตุการณ์"), T("zc.csv.check", "ผลการตรวจโดยพนักงาน")]);
    for (const e of P.log.items) rows.push([new Date(e.t).toISOString(), e.zone, e.text, e.v === "tp" ? T("zc.log.isTp", "ยืนยันว่าจริง") : e.v === "fp" ? T("zc.log.isFp", "แจ้งผิด") : ""]);
    return rows;
  }

  // ---------- marketing CSV: labelled sections for a report (opens in Excel with Thai text: UTF-8 BOM via ZC.downloadCsv) ----------
  function csvMarketing(P) {
    const day = C.ensureDay(P.day), t = C.marketingTables(day, P.zones), rows = [], f1 = v => v == null ? "" : v.toFixed(1), f2 = v => v == null ? "" : v.toFixed(2);
    rows.push([T("cr.mk.title", "รายงานจำนวนคนสำหรับการตลาด — LENSIQ นับคนและความหนาแน่น")]);
    if (day.demo) rows.push([T("cr.csv.demo", "ข้อมูลจำลอง (โหมดตัวอย่าง) — ไม่ใช่ตัวเลขจริง")]);
    rows.push([T("cr.csv.site", "จุด/อีเวนต์"), String(P.settings.siteName || ""), T("cr.csv.date", "วันที่"), day.date]);
    rows.push([T("cr.mk.acc", "หมายเหตุ: ตัวเลขทั้งหมดเป็นค่าประมาณจากกล้อง ความแม่นยำสุดท้ายรอการนับเทียบโดยคน (ผลเบื้องต้น: นับต่ำกว่าจริงเมื่อคนตัวเล็ก/ไกล หรือแน่นมาก)")]);
    rows.push([]);
    rows.push([T("cr.mk.sumH", "สรุป")]);
    rows.push([T("cr.mk.k", "ตัวชี้วัด"), T("cr.mk.v", "ค่า")]);
    const pk = t.peak, top = pk.hours[0];
    rows.push([T("cr.sum.visitors", "ผู้เข้าชมรวม (ประมาณ)"), pk.visitors]);
    rows.push([T("cr.mk.in", "เข้าทั้งวัน (เส้นนับ, คน)"), day.in]);
    rows.push([T("cr.mk.out", "ออกทั้งวัน (เส้นนับ, คน)"), day.out]);
    rows.push([T("cr.mk.peakN", "คนในภาพสูงสุดพร้อมกัน (คน)"), day.peak]);
    rows.push([T("cr.mk.peakAt", "เวลาที่คนในภาพสูงสุด"), day.peakAt ? ZC.fmtClock(day.peakAt) : ""]);
    rows.push([T("cr.mk.peakH", "ชั่วโมงที่คนเยอะสุด"), top ? hh(top.h) + "–" + hh((top.h + 1) % 24) : ""]);
    rows.push([T("cr.mk.peakHs", "3 ชั่วโมงที่คนเยอะสุด"), pk.hours.map(p => hh(p.h)).join(" / ")]);
    rows.push([T("cr.mk.zone", "โซนที่คนเยอะสุด"), pk.zone ? pk.zone.name : ""]);
    rows.push([T("cr.mk.hot", "สัดส่วนเวลาใน 10% ของพื้นที่ที่คนเยอะสุด (%)"), pk.hot == null ? "" : (pk.hot * 100).toFixed(1)]);
    rows.push([]);
    rows.push([T("cr.mk.hourH", "ผู้เข้าชมรายชั่วโมง")]);
    rows.push([T("cr.mk.hour", "ชั่วโมง (เริ่ม)"), T("cr.mk.visitors", "ผู้เข้าชม (ประมาณ, คน)"), T("cr.mk.avg", "คนในภาพเฉลี่ย (คน)"), T("cr.mk.max", "คนในภาพสูงสุด (คน)"),
      T("cr.mk.inH", "เข้า (คน)"), T("cr.mk.outH", "ออก (คน)"), T("cr.mk.net", "สุทธิ เข้า − ออก (คน)")]);
    for (const r of t.hourly) rows.push([hh(r.h), r.uniq, f2(r.avg), r.peak, r.in, r.out, r.net]);
    rows.push([]);
    rows.push([T("cr.mk.qH", "เข้า–ออกราย 15 นาที (เส้นนับ)")]);
    rows.push([T("cr.mk.qFrom", "เริ่ม"), T("cr.mk.qTo", "สิ้นสุด"), T("cr.mk.inH", "เข้า (คน)"), T("cr.mk.outH", "ออก (คน)"), T("cr.mk.net", "สุทธิ เข้า − ออก (คน)"),
      T("cr.mk.occ", "คงอยู่ข้างใน ณ สิ้นช่วง (ประมาณ, คน)")]);
    for (const r of t.quarters) rows.push([r.from, r.to, r.in, r.out, r.net, r.occ]);
    rows.push([]);
    rows.push([T("cr.mk.zH", "เวลาอยู่และความหนาแน่นรายโซน")]);
    rows.push([T("zc.csv.zone", "โซน"), T("cr.csv.role", "บทบาท"), T("cr.mk.visits", "เข้าโซน (ครั้ง)"), T("cr.mk.dwell", "อยู่เฉลี่ย (วินาที)"), T("cr.mk.zavg", "คนเฉลี่ยในโซน (คน)"),
      T("cr.mk.zpeak", "สูงสุดพร้อมกัน (คน)"), T("cr.mk.area", "พื้นที่ (ตร.ม.)"), T("cr.mk.dAvg", "ความหนาแน่นเฉลี่ย (คน/ตร.ม.)"),
      T("cr.mk.dPeak", "ความหนาแน่นสูงสุด (คน/ตร.ม.)"), T("cr.mk.level", "ระดับที่จุดสูงสุด")]);
    for (const z of t.zones) rows.push([z.name, roleName(z.role), z.visits, z.dwellSec ? z.dwellSec.toFixed(1) : "", f2(z.avg), z.peak, z.area || "",
      z.avgPerM2 == null ? "" : z.avgPerM2.toFixed(3), z.peakPerM2 == null ? "" : z.peakPerM2.toFixed(3), z.level ? levelName(z.level) : ""]);
    rows.push([]);
    rows.push([T("cr.mk.dH", "สรุปความหนาแน่นตามช่วงเวลา (คน-วินาที ตามตำแหน่งเท้า รวมทั้งภาพ)")]);
    rows.push([T("cr.mk.hour", "ชั่วโมง (เริ่ม)"), T("cr.mk.ps", "คน-วินาทีรวม"), T("cr.mk.hotH", "สัดส่วนใน 10% ของพื้นที่ที่คนเยอะสุด (%)")]);
    for (const h of C.heatHours(day)) {
      const G = day.heatH[String(h)], tot = G.d.reduce((a, b) => a + b, 0), hs = C.hotShare(G);
      rows.push([hh(h), f1(tot), hs == null ? "" : (hs * 100).toFixed(1)]);
    }
    return rows;
  }

  // ---------- demo: walkers along a shopfront, some stop at the window, some walk in through the door line ----------
  const AGENTS = [
    { o: 0, y: 0.5, v: 0.11, stop: 0, enter: true }, { o: 3, y: 0.22, v: 0.13, stop: 0, enter: false },
    { o: 5, y: 0.45, v: 0.1, stop: 4, enter: true }, { o: 8, y: 0.25, v: 0.12, stop: 3.5, enter: false },
    { o: 11, y: 0.55, v: 0.12, stop: 0, enter: true }, { o: 13, y: 0.2, v: 0.14, stop: 0, enter: false },
    { o: 16, y: 0.5, v: 0.1, stop: 5, enter: true }, { o: 19, y: 0.28, v: 0.11, stop: 0, enter: false }
  ];
  function demo(ms) {
    const t = ms / 1000, out = [], CYCLE = 24;
    for (const a of AGENTS) {
      let u = (t - a.o) % CYCLE; if (u < 0) continue;
      const stopX = 0.52, tStop = (stopX + 0.1) / a.v;
      let x = -0.1 + a.v * u;
      if (a.stop && u > tStop) x = u < tStop + a.stop ? stopX : -0.1 + a.v * (u - a.stop);
      if (x < -0.06 || x > 1.0) continue;
      out.push({ x: Math.max(0, x), y: a.y + 0.01 * Math.sin(t * 3 + a.o), w: 0.06, h: 0.32, score: 0.9, label: "person" });
    }
    return out;
  }
  const DEMO_ZONES = [
    { poly: [{ x: 0.02, y: 0.3 }, { x: 0.4, y: 0.3 }, { x: 0.4, y: 0.98 }, { x: 0.02, y: 0.98 }], role: "pass", name: () => T("cr.demo.pass", "ทางเดิน") },
    { poly: [{ x: 0.42, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.7, y: 0.98 }, { x: 0.42, y: 0.98 }], role: "stop", name: () => T("cr.demo.stop", "หน้าตู้โชว์"), area: 6, cap: 4 }
  ];
  const DEMO_LINE = { a: { x: 0.8, y: 0.68 }, b: { x: 0.8, y: 0.98 }, swap: true };

  // ---------- demo isolation: the demo never touches the real day record, alert list or counting line ----------
  // enterDemo stashes the real day + log and swaps in an in-memory demo day ({demo: true}, never saved) and a separate
  // demo alert list (its own key, deleted on leave). leaveDemo (stop / start camera) restores them and resets the runtime
  // memories, whose timestamps ran on the 2x demo clock.
  let demoSave = null;
  function enterDemo(P) {
    if (!demoSave) {
      P.saveDay(true);
      demoSave = { day: P.day, log: P.log };
      ZC.store.del(DEMO_LOG);
      P.log = ZC.createLog({ list: $("log"), statsEl: $("logStats"), key: DEMO_LOG });
      P.log.render();
    } else if (P.day && !P.day.demo) demoSave.day = P.day;
    P.day = Object.assign(C.newDay(ZC.dayKey()), { demo: true });
    dayRef = null;
  }
  function leaveDemo(P) {
    if (!demoSave) return;
    for (const k of [...P.active.keys()]) P.clear(k); // demo banners; no log entry
    P.day = demoSave.day; P.log = demoSave.log; demoSave = null;
    ZC.store.del(DEMO_LOG);
    if (line && line.demo) line = null;
    resetRuntime(); rule = null; dayRef = null;
    P.log.render(); P._force = true; P.render(); P.zc.repaint();
  }

  // ---------- storage budget: past days lose the per-minute map, only the newest DAY_KEEP days are kept ----------
  function pruneDays() {
    let keys = [];
    try { keys = Object.keys(localStorage); } catch { return; }
    const plan = C.planPrune(keys, DAY_PREFIX, ZC.dayKey());
    for (const k of plan.drop) ZC.store.del(k);
    for (const k of plan.compact) {
      const d = ZC.store.get(k, null);
      if (!d || typeof d !== "object") { ZC.store.del(k); continue; }
      if (d.minutes && typeof d.minutes === "object" && Object.keys(d.minutes).length) ZC.store.set(k, C.compactDay(d));
    }
  }
  pruneDays();
  let saveWarned = false;
  function storeFull() {
    if (saveWarned) return;
    saveWarned = true;
    const m = $("saveMsg");
    if (m) { m.hidden = false; m.textContent = T("cr.saveFull", "บันทึกสถิติในเครื่องนี้ไม่ได้ (พื้นที่เก็บของเบราว์เซอร์เต็ม) — ส่งออก CSV แล้วกด \"ลบข้อมูลสถิติทั้งหมด\""); }
  }

  // ---------- page ----------
  let demoFresh = false;
  $("demoCam").addEventListener("click", () => { demoFresh = !(W.__LQZ && W.__LQZ.zones.length); }); // runs before the scaffold's handler
  const P = ZC.page({
    ns: NS, key: "crowd", classes: ["person"], anchorKind: "foot", csvName: "lensiq-crowd", demoSpeed: DEMO_SPEED,
    zoneName: i => T("cr.zoneName", "โซน {n}", { n: i + 1 }),
    zoneFields: z => ({ role: ROLES.includes(z.role) ? z.role : "area", cap: Math.round(clampN(z.cap, 0, 10000)), area: Math.round(clampN(z.area, 0, 100000) * 10) / 10 }),
    defaults: { siteName: "", minVisitSec: 2, stopSec: 5, holdSec: 10, clearSec: 15, cooldownMin: 5, convKind: "buy", heatOverlay: true, sound: false, expectCrowd: 0 },
    newDay: () => C.newDay(ZC.dayKey()), onFrame, render, csv, demo, draw,
    demoZones: DEMO_ZONES.map(d => d.poly),
    zoneColor: z => live.get(z.id) && live.get(z.id).on ? "#f87171" : null,
    zoneLabel: z => { const v = live.get(z.id); return v ? T("cr.label", "{zone}: {n} คน", { zone: z.name, n: v.count }) : z.name; },
    zoneExtra: (li, z, P) => {
      const sel = /** @type {HTMLSelectElement} */ (el("select"));
      sel.setAttribute("aria-label", T("cr.zone.roleA", "บทบาทของโซน {name}", { name: z.name }));
      for (const r of ROLES) { const o = /** @type {HTMLOptionElement} */ (el("option", "", roleName(r))); o.value = r; o.selected = z.role === r; sel.appendChild(o); }
      sel.addEventListener("change", () => { z.role = ROLES.includes(sel.value) ? sel.value : "area"; P.saveZones(); P._force = true; P.render(); });
      const num = (field, max, step, ph, aria) => {
        const inp = /** @type {HTMLInputElement} */ (el("input", "cr-num"));
        inp.type = "number"; inp.min = "0"; inp.max = String(max); inp.step = step; inp.inputMode = "decimal";
        inp.value = z[field] ? String(z[field]) : ""; inp.placeholder = ph; inp.setAttribute("aria-label", aria);
        inp.addEventListener("change", () => {
          const v = clampN(inp.value, 0, max); z[field] = field === "cap" ? Math.round(v) : Math.round(v * 10) / 10;
          inp.value = z[field] ? String(z[field]) : ""; P.saveZones(); P._force = true; P.render();
        });
        return inp;
      };
      li.append(sel,
        num("cap", 10000, "1", T("cr.zone.capP", "คนสูงสุด"), T("cr.zone.capA", "จำนวนคนสูงสุดของโซน {name} (0 = ไม่เตือน)", { name: z.name })),
        num("area", 100000, "0.1", T("cr.zone.areaP", "ตร.ม."), T("cr.zone.areaA", "พื้นที่ของโซน {name} (ตารางเมตร)", { name: z.name })));
    },
    onSettings: P => { rule = mkRule(P.settings); },
    onZones: P => syncZones(P),
    onDemo: P => {
      lastNow = 0; rule = null; resetRuntime(); enterDemo(P);
      if (demoFresh && P.zones.length === DEMO_ZONES.length) {
        P.zones.forEach((z, i) => { const d = DEMO_ZONES[i]; z.role = d.role; z.name = d.name(); z.cap = d.cap || 0; z.area = d.area || 0; });
        P.saveZones(); P.renderZones();
      }
      if (!line) line = { ...DEMO_LINE, demo: true }; // memory only: a real camera started later does not count on it
    },
    onClear: P => {
      resetRuntime(); dayRef = null; P._force = true;
      if (demoSave) { // the scaffold cleared the demo list and made a fresh real day: clear the real list too, stay in demo
        demoSave.log.clear(); demoSave.day = P.day;
        P.day = Object.assign(C.newDay(ZC.dayKey()), { demo: true });
      }
    }
  });
  function syncZones(P) {
    const ids = new Set(P.zones.map(z => z.id));
    const drop = id => { smooth.delete(id); live.delete(id); counted.delete(id); };
    for (const id of [...zoneSig.keys()]) if (!ids.has(id)) { zoneSig.delete(id); zoneGen.set(id, (zoneGen.get(id) || 0) + 1); drop(id); }
    for (const z of P.zones) {
      const sig = polySig(z);
      if (zoneSig.has(z.id) && zoneSig.get(z.id) !== sig) { zoneGen.set(z.id, (zoneGen.get(z.id) || 0) + 1); drop(z.id); }
      zoneSig.set(z.id, sig);
    }
  }
  syncZones(P);
  // day records: never save the demo day; key by the record's own date; say so once if the browser storage is full
  P.saveDay = (() => {
    let last = 0;
    return force => {
      if (!P.day || P.day.demo) return true;
      const n = Date.now();
      if (!force && n - last <= 5000) return true;
      last = n;
      const k = DAY_PREFIX + (P.day.date || ZC.dayKey());
      if (ZC.store.set(k, P.day)) return true;
      pruneDays(); // make room (past days compacted / dropped), then try once more
      const ok = ZC.store.set(k, P.day);
      if (!ok) storeFull();
      return ok;
    };
  })();
  $("startCam").addEventListener("click", () => leaveDemo(P)); // runs before the camera's first frame
  $("stopCam").addEventListener("click", () => leaveDemo(P));

  // ---------- entry / exit line: two taps on the camera view ----------
  const cv = P.zc.canvas, msg = $("drawMsg");
  function lineMsg() {
    if (!msg) return;
    msg.textContent = lineDraft ? T("cr.line.hint", "แตะ 2 จุดบนภาพเพื่อวางเส้นนับ ({n}/2) · ฝั่งที่เขียนว่า \"เข้า\" คือด้านในงาน/ร้าน · Esc ยกเลิก", { n: lineDraft.length }) : "";
  }
  $("drawLine").addEventListener("click", () => {
    if (!$("cancelZone").hidden) $("cancelZone").click(); // never draw a zone and a line at the same time
    lineDraft = []; cv.classList.add("drawing"); lineMsg(); P.zc.repaint(); });
  $("drawZone").addEventListener("click", () => { if (lineDraft) { lineDraft = null; cv.classList.remove("drawing"); } });
  cv.addEventListener("pointerup", ev => {
    if (!lineDraft) return;
    ev.preventDefault();
    lineDraft.push(P.zc.toNorm(ev));
    if (lineDraft.length >= 2) {
      const [a, b] = lineDraft;
      lineDraft = null; cv.classList.remove("drawing");
      if (Math.hypot(a.x - b.x, a.y - b.y) < 0.02) { if (msg) msg.textContent = T("cr.line.short", "เส้นสั้นเกินไป ลองใหม่"); return; }
      line = { a, b, swap: false }; saveLine(); counter.reset();
      if (msg) msg.textContent = T("cr.line.saved", "บันทึกเส้นนับแล้ว · ถ้าทิศเข้า/ออกกลับกัน กด \"สลับทิศเข้า/ออก\"");
      P._force = true; P.render();
    } else lineMsg();
    P.zc.repaint();
  });
  document.addEventListener("keydown", ev => { if (lineDraft && ev.key === "Escape") { lineDraft = null; cv.classList.remove("drawing"); lineMsg(); P.zc.repaint(); } });
  $("swapLine").addEventListener("click", () => {
    if (!line) { if (msg) msg.textContent = T("cr.line.none", "ยังไม่มีเส้นนับ — กด \"วาดเส้นนับเข้า–ออก\" ก่อน"); return; }
    line.swap = !line.swap; saveLine(); counter.reset();
    if (msg) msg.textContent = T("cr.line.swapped", "สลับทิศแล้ว");
    P._force = true; P.render(); P.zc.repaint();
  });
  $("clearLine").addEventListener("click", () => {
    line = null; ZC.store.del(LINE_KEY); counter.reset();
    if (msg) msg.textContent = T("cr.line.cleared", "ลบเส้นนับแล้ว (ยอดเข้า–ออกของวันนี้ยังอยู่)");
    P._force = true; P.render(); P.zc.repaint();
  });

  // ---------- printable summary + summary pack (file only, never sent) ----------
  $("printSummary").addEventListener("click", () => {
    P._force = true; P.render();
    const de = document.documentElement; de.classList.add("cr-print-sum");
    const done = () => { de.classList.remove("cr-print-sum"); W.removeEventListener("afterprint", done); };
    W.addEventListener("afterprint", done);
    try { W.print(); } finally { setTimeout(done, 1500); }
  });
  $("exportPack").addEventListener("click", () => {
    const pm = $("packMsg");
    if (!W.LQAgg) { if (pm) pm.textContent = T("cr.pack.na", "ส่งออกไม่ได้ในเบราว์เซอร์นี้"); return; }
    if (P.day && P.day.demo) { if (pm) pm.textContent = T("cr.pack.demo", "โหมดตัวอย่างใช้ข้อมูลจำลอง จึงไม่ส่งออกไฟล์สรุปรวมยอด — กด \"หยุด\" แล้วส่งออกตัวเลขจริง"); return; }
    const pack = W.LQAgg.packFromDay(C.aggDay(C.ensureDay(P.day), P.zones), String(P.settings.siteName || "").trim() || T("cr.pack.name", "จุดนับคน"));
    const r = W.LQAgg.cleanPack(pack);
    if (!r.ok) { if (pm) pm.textContent = T("cr.pack.bad", "สร้างไฟล์สรุปไม่สำเร็จ: {m}", { m: r.error }); return; }
    const blob = new Blob([JSON.stringify(r.pack, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `lensiq-crowd-pack-${P.day.date}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    if (pm) pm.textContent = T("cr.pack.ok", "ดาวน์โหลดไฟล์สรุปแล้ว (ตัวเลขล้วน ไม่มีภาพ) นำเข้าได้ที่หน้าวิเคราะห์หน้าร้าน > เชื่อมหลายเครื่อง > นำเข้าสรุปจากเครื่องอื่น");
  });

  $("printPeak").addEventListener("click", () => {
    P._force = true; P.render();
    const de = document.documentElement; de.classList.add("cr-print-peak");
    const done = () => { de.classList.remove("cr-print-peak"); W.removeEventListener("afterprint", done); };
    W.addEventListener("afterprint", done);
    try { W.print(); } finally { setTimeout(done, 1500); }
  });
  $("exportMkt").addEventListener("click", () => {
    P._force = true; P.render();
    ZC.downloadCsv(`lensiq-crowd-marketing-${(P.day && P.day.date) || ZC.dayKey()}.csv`, csvMarketing(P));
  });
  $("heatHour").addEventListener("input", ev => {
    const hours = C.heatHours(P.day), i = Number(/** @type {HTMLInputElement} */ (ev.target).value) | 0;
    heatSel = i > 0 && hours[i - 1] != null ? hours[i - 1] : -1; P._force = true; P.render();
  });

  W.addEventListener("lq-lang", () => { convSig = ""; hoursSig = ""; P._force = true; P.render(); });
  P._force = true; P.render();
  W.__LQZ.cr = { live, get line() { return line; }, counter, get qual() { return qual; }, csvMarketing: () => csvMarketing(P), get heatSel() { return heatSel; } };
})();
