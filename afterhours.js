/* afterhours.js — afterhours.html: restricted-zone / after-hours presence alert. A person box whose foot point stays in a
 * drawn zone for persistSec while the page is armed (configured hours, or "always") raises ONE alert per zone, then that
 * zone stays quiet for cooldownSec. The alert asks a person to check (camera view / walk over); it never accuses anyone
 * and never identifies anyone. No faces, no recording; the log keeps time + zone + text only.
 * Test hooks: window.__LQZ (+ __LQZ.armed()). ?fakedet: LQDetect.fake("afterhours").
 */
(function () {
  "use strict";
  const ZC = /** @type {any} */ (window).LQZoneCam, Z = /** @type {any} */ (window).LQZones, T = ZC.T;
  const $ = id => document.getElementById(id);
  const DAYS = { all: [0, 1, 2, 3, 4, 5, 6], weekdays: [1, 2, 3, 4, 5], weekend: [0, 6] };
  let rule = null, demoOn = false, lastAt = 0;
  const present = new Map();
  // persistence (debounce) + 5 s release + per-zone cooldown — LQZones.createThresholdAlert (tests/unit/zones.test.js)
  const mk = s => { rule = Z.createThresholdAlert({ holdMs: s.persistSec * 1000, clearMs: 5000, cooldownMs: s.cooldownSec * 1000 }); };
  const newDay = () => ({ alerts: 0, perZone: {}, lastAt: 0 });

  function armed(s, d = new Date()) {
    if (demoOn) return true;
    if (s.mode === "always") return true;
    if (s.mode === "off") return false;
    return Z.inSchedule({ day: d.getDay(), min: d.getHours() * 60 + d.getMinutes() }, [{ days: DAYS[s.days] || DAYS.all, from: s.from, to: s.to }]);
  }
  function onFrame(dets, now, P) {
    const s = P.settings;
    if (!rule) mk(s);
    const on = armed(s);
    const people = dets.filter(d => d.label === "person" && d.h >= s.minH / 100);
    for (const z of P.zones) {
      const inZ = on && people.some(d => Z.boxInZone(d, z.poly, "foot"));
      present.set(z.id, inZ);
      if (rule.update(z.id, inZ, now) === "raise") {
        P.day.alerts++; P.day.perZone[z.id] = (P.day.perZone[z.id] || 0) + 1; P.day.lastAt = Date.now(); lastAt = P.day.lastAt;
        P.clear(z.id);
        P.alert(z.id, T("za.alert", "พบคนในพื้นที่ \"{zone}\" ช่วงเวลาที่ตั้งไว้ ({t}) — ให้เจ้าหน้าที่ตรวจสอบ (อาจเป็นพนักงานหรือผู้มีสิทธิ์)",
          { zone: z.name, t: ZC.fmtClock(Date.now()) }), z.name);
      }
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
    const s = P.settings, on = armed(s);
    const modeTxt = demoOn ? T("za.m.demo", "โหมดตัวอย่าง (เฝ้าตลอด)") : s.mode === "always" ? T("za.m.always", "เฝ้าตลอดเวลา")
      : s.mode === "off" ? T("za.m.off", "ปิดการเฝ้า") : T("za.m.sched", "ตามช่วงเวลา {from}–{to}", { from: s.from, to: s.to });
    const inNow = P.zones.filter(z => present.get(z.id)).length;
    tiles.textContent = "";
    tiles.append(
      tile(T("za.t.state", "สถานะ"), on ? T("za.armed", "กำลังเฝ้า") : T("za.disarmed", "ไม่ได้เฝ้า"), modeTxt, false),
      tile(T("za.t.now", "โซนที่มีคนตอนนี้"), `${inNow}/${P.zones.length}`, on ? "" : T("za.t.nowOff", "นอกเวลาเฝ้า ไม่นับ"), on && inNow > 0),
      tile(T("za.t.alerts", "แจ้งเตือนวันนี้"), String(P.day.alerts), T("za.t.cool", "แต่ละโซนเงียบ {s} วินาทีหลังแจ้ง", { s: s.cooldownSec })),
      tile(T("za.t.last", "แจ้งล่าสุด"), P.day.lastAt ? ZC.fmtClock(P.day.lastAt) : "—", "")
    );
    const b = $("armBadge");
    if (b) { b.textContent = on ? T("za.armed", "กำลังเฝ้า") : T("za.disarmed", "ไม่ได้เฝ้า"); b.dataset.on = on ? "1" : "0"; }
  }
  function csv(P) {
    const rows = [[T("zc.csv.time", "เวลา"), T("zc.csv.zone", "โซน"), T("zc.csv.event", "เหตุการณ์"), T("zc.csv.check", "ผลการตรวจโดยพนักงาน")]];
    for (const e of P.log.items) rows.push([new Date(e.t).toISOString(), e.zone, e.text, e.v === "tp" ? T("zc.log.isTp", "ยืนยันว่าจริง") : e.v === "fp" ? T("zc.log.isFp", "แจ้งผิด") : ""]);
    rows.push([]);
    rows.push([T("za.t.alerts", "แจ้งเตือนวันนี้"), P.day.alerts]);
    return rows;
  }
  // demo: one person walks into the zone every 40 s and stays ~10 s
  function demo(ms) {
    const t = (ms / 1000) % 40;
    if (t > 20) return [];
    const x = t < 8 ? 0.05 + t * 0.07 : t < 18 ? 0.61 : 0.61 + (t - 18) * 0.15;
    return [{ x, y: 0.3, w: 0.09, h: 0.5, score: 0.9, label: "person" }];
  }

  const P = ZC.page({
    ns: "lqa", key: "afterhours", classes: ["person"], anchorKind: "foot", csvName: "lensiq-afterhours",
    zoneName: i => T("za.zoneName", "พื้นที่หวงห้าม {n}", { n: i + 1 }),
    defaults: { mode: "schedule", from: "22:00", to: "06:00", days: "all", persistSec: 2, cooldownSec: 120, minH: 5, sound: true },
    newDay, onFrame, render, csv, demo,
    demoZones: [[{ x: 0.5, y: 0.4 }, { x: 0.85, y: 0.4 }, { x: 0.85, y: 0.95 }, { x: 0.5, y: 0.95 }]],
    zoneColor: z => present.get(z.id) ? "#f87171" : null,
    onSettings: P2 => { mk(P2.settings); },
    onZones: () => { present.clear(); },
    onDemo: () => { demoOn = true; },
    onClear: () => { lastAt = 0; }
  });
  $("stopCam").addEventListener("click", () => { demoOn = false; P.render(); });
  $("startCam").addEventListener("click", () => { demoOn = false; });
  $("testAlert").addEventListener("click", () => {
    P.clear("test");
    P.alert("test", T("za.test", "ทดสอบการแจ้งเตือน: เสียงและแถบแจ้งเตือนทำงาน (รายการนี้ไม่ใช่เหตุการณ์จริง)"), "", { test: true });
  });
  setInterval(() => P.render(), 30000); // armed / disarmed follows the clock even while the camera is stopped
  const W = /** @type {any} */ (window);
  W.__LQZ.armed = () => armed(P.settings);
  W.__LQZ.lastAt = () => lastAt;
})();
