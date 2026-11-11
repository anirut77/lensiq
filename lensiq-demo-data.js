/* lensiq-demo-data.js — built-in sample data for the sales demo mode (?demo=1, lensiq-demo.js). Every name, plate, house,
 * shop and event here is invented ("ตัวอย่าง 01" / "Sample 01" / "示例 01", house "99/1" …); there are no real people, no photos and no faces.
 * Only used when LQDemo.on; data is generated relative to "now" so the demo always looks current.
 * Pages: exam-lab, attendance (employee mode), village, parking, crowd. Text: i18n/{en,zh}-demo.js ("demo.*"). */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), D = W.LQDemo;
  if (!D || !D.on) return;
  const page = D.page(), MIN = 60000, HOUR = 3600000;
  const now = Date.now();
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /** deterministic pseudo-random numbers (same sample data on every load) */
  const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const btn = (attrs, key, th) => `<button type="button" class="btn ghost" ${attrs} data-i18n="${key}">${esc(th)}</button>`;
  const TH = s => `<span lang="th" translate="no">${esc(s)}</span>`;
  /** sample names in the language the demo opens in (?lang= or the device's choice); plates and house numbers stay Thai */
  const LANG = (() => {
    const q = /[?&]lang=(th|en|zh)/i.exec(location.search || "");
    let v = q ? q[1] : null;
    if (!v) try { v = localStorage.getItem("lq-lang"); } catch (e) { v = null; }
    v = String(v || "").toLowerCase();
    return v.indexOf("zh") === 0 ? "zh" : v.indexOf("en") === 0 ? "en" : "th";
  })();
  const L = (th, en, zh) => (LANG === "en" ? en : LANG === "zh" ? zh : th);
  const GUARD = L("ยามตัวอย่าง", "Sample guard", "示例保安");

  const GATE_VG = L("ประตูหน้า (ตัวอย่าง)", "Front gate (sample)", "正门（示例）"), GATE_PK = L("ทางเข้า-ออก (ตัวอย่าง)", "Entry / exit (sample)", "出入口（示例）");

  /* ================================================================ Exam: candidate page (lab mode) */
  if (page === "exam-lab") {
    D.seed("lq-exam-lab", { room: "DEMO1", seat: "S01" });
    D.seed("lq-exam-lab-log", [
      { t: now - 16 * MIN, sig: "setup", lvl: "setup", what: "backlight", id: "e1-demo" },
      { t: now - 12 * MIN, sig: "noface", lvl: "watch", dur: 7000, id: "e2-demo" },
      { t: now - 9 * MIN, sig: "away", lvl: "info", dur: 4000, id: "e3-demo" },
      { t: now - 6 * MIN, sig: "phone", lvl: "check", what: "phone", id: "e4-demo" },
      { t: now - 3 * MIN, sig: "paste", lvl: "info", cnt: 120, id: "e5-demo" }
    ]);
    D.onReady(body => {
      body.innerHTML = `<p data-i18n="demo.exam.p">เซสชันตัวอย่างไม่ใช้กล้อง: ติ๊กยินยอมแล้วกด "ถัดไป: ตรวจกล้องและแสง" ระบบจะข้ามการเปิดกล้องและไปที่หน้าทำข้อสอบทันที
บันทึกเหตุการณ์ด้านล่างเป็นตัวอย่าง กดปุ่มด้านล่างเพื่อจำลองเหตุการณ์ที่ผู้คุมสอบจะเห็น ทุกการแจ้งเป็นเพียง "ให้ผู้คุมสอบไปดู" ผู้คุมสอบเป็นผู้ตัดสินเสมอ</p>
<div class="lq-demo-btns">${[["noface", "noface", "จำลอง: ไม่เห็นใบหน้า"], ["phone", "phone", "จำลอง: โทรศัพท์ในภาพ"], ["multiface", "multi", "จำลอง: มีคนอื่นในภาพ"],
  ["away", "away", "จำลอง: สลับหน้าต่าง"]].map(([sig, k, th]) => btn(`data-demo-sig="${sig}"`, "demo.exam." + k, th)).join("")}</div>`;
      body.addEventListener("click", e => {
        const b = /** @type {any} */ (e.target).closest("[data-demo-sig]");
        if (b && W.__LQ_EXAM_LAB && W.__LQ_EXAM_LAB.demoEvent) W.__LQ_EXAM_LAB.demoEvent(b.dataset.demoSig);
      });
    });
  }

  /* ================================================================ Attendance: employee time clock (PIN / QR) */
  if (page === "attendance") {
    const DEPTS = [L("ขาย", "Sales", "销售"), L("คลัง", "Stock", "仓库"), L("บัญชี", "Accounts", "财务")]; // short: table cells on a phone are narrow
    const emps = () => {
      const C = W.LQClock;
      return Array.from({ length: 8 }, (_, i) => {
        const n = String(i + 1).padStart(2, "0"), salt = "demo-salt-" + n;
        return { id: "edemo" + n, code: "S" + n, name: L("ตัวอย่าง ", "Sample ", "示例 ") + n, dept: DEPTS[i % 3], shift: "day", shiftHist: [{ from: "2000-01-01", shift: "day" }],
          created: now - 90 * 24 * HOUR, qr: "demoqrtoken0000000" + n, noFace: true, pinSalt: salt, pinHash: C.pinHash("10" + n, salt) };
      });
    };
    const shifts = () => [{ id: "day", start: "08:00", end: "17:00" }, { id: "night", start: "20:00", end: "05:00" }].map(W.LQClock.normShift);
    const holidays = () => W.LQClock.thaiHolidays(new Date().getFullYear());
    /** punches from the 1st of last month to yesterday: mostly on time, a few late / early / OT, one absent and one missing exit */
    const punches = () => {
      const C = W.LQClock, sh = shifts()[0], hmap = C.holidayMap(holidays(), sh.days), out = [], r = rng(20261111), today = C.dateKey(now);
      const d0 = new Date(now); d0.setDate(1); d0.setMonth(d0.getMonth() - 1); d0.setHours(12, 0, 0, 0);
      for (let d = C.dateKey(d0.getTime()); d < today; d = C.addDays(d, 1)) {
        if (C.dayKind(sh, d, hmap) !== "work") continue;
        const start = C.shiftWindow(sh, d).start;
        for (let i = 0; i < 8; i++) {
          const x = r();
          if (i === 6 && x < 0.08) continue; // an absent day now and then (the summary flags it "ให้ตรวจ")
          const late = x > 0.9 ? 6 + Math.round(r() * 20) : -Math.round(r() * 15);
          const ot = i === 2 || i === 5 ? (r() < 0.5 ? 60 + Math.round(r() * 60) : 0) : r() < 0.15 ? 45 : 0;
          const early = r() > 0.94 ? 20 : 0;
          const m = i % 2 ? "qr" : "pin", inTs = start + late * MIN, outTs = start + (9 * 60 + ot - early) * MIN + Math.round(r() * 8) * MIN;
          out.push({ id: "ddemo00000001-" + inTs.toString(36) + i, emp: "edemo0" + (i + 1), ts: inTs, type: "auto", method: m, dev: "ddemo00000001" });
          if (!(i === 3 && x < 0.05)) out.push({ id: "ddemo00000001-" + outTs.toString(36) + i, emp: "edemo0" + (i + 1), ts: outTs, type: "auto", method: m, dev: "ddemo00000001" });
        }
      }
      return out;
    };
    const leave = () => {
      const C = W.LQClock, d = new Date(now); d.setDate(1); d.setMonth(d.getMonth() - 1); d.setDate(10);
      const day = C.dateKey(d.getTime());
      return [{ id: "ldemo01", emp: "edemo04", date: day, type: "sick", part: 1, reason: L("ลาป่วย (ตัวอย่าง)", "Sick leave (sample)", "病假（示例）"), at: now - 30 * 24 * HOUR },
        { id: "ldemo02", emp: "edemo07", date: C.addDays(day, 3), type: "personal", part: 0.5,
          reason: L("ลากิจครึ่งวัน (ตัวอย่าง)", "Half-day personal leave (sample)", "半天事假（示例）"), at: now - 28 * 24 * HOUR }];
    };
    D.seed("att-hr-settings", { mode: "employee", dev: "ddemo00000001", devName: L("จุดลงเวลาตัวอย่าง", "Sample time clock", "示例打卡点"), retYears: 2, noticeSeen: false, kiosk: false, devs: {} });
    D.seed("att-hr-emps", emps);
    D.seed("att-hr-shifts", shifts);
    D.seed("att-hr-holidays", holidays);
    D.seed("att-hr-punches", punches);
    D.seed("att-hr-leave", leave);
    D.seed("att-hr-audit", []);
    D.onReady(body => {
      body.innerHTML = `<p data-i18n="demo.att.p">พนักงานสมมติ 8 คน (ตัวอย่าง 01–08) พร้อมบันทึกเวลาตั้งแต่ต้นเดือนที่แล้วถึงเมื่อวาน ลงเวลาด้วย PIN หรือบัตร QR
(ไม่ใช้ใบหน้า) ลองลงเวลาด้วย PIN ได้ที่แท็บ PIN: รหัส S01 ถึง S08 ใช้ PIN 1001 ถึง 1008 ตามลำดับ</p>
<div class="lq-demo-btns">${btn("data-demo-month", "demo.att.month", "ดูสรุปเดือนที่แล้วและส่งออก CSV")}</div>`;
      body.addEventListener("click", e => {
        if (!(/** @type {any} */ (e.target).closest("[data-demo-month]"))) return;
        const tab = /** @type {any} */ (document.querySelector('.hr-tab[data-h="month"]')); if (tab) tab.click();
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
        const el = /** @type {any} */ (document.querySelector("#hrMonth"));
        if (el) { el.value = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); el.dispatchEvent(new Event("change", { bubbles: true })); el.scrollIntoView({ block: "center" }); }
      });
    });
  }

  /* ================================================================ Gate: village / condo guard post */
  if (page === "village") {
    D.seed("lq-gate-village-cfg", { gate: GATE_VG, autoOpen: { on: false, minConf: 0.95, minAgree: 0.8 }, relay: { kind: "", url: "", channel: 0, pulseSec: 1, token: "" } });
    D.addRecords("lq-gate-village", () => {
      const GR = W.LQGateRules, r = rng(7);
      const res = [["99/1", "1กข2345", "bangkok"], ["99/1", "2กข1111", "bangkok"], ["12/3", "9กก9999", "bangkok"], ["8/8", "5กก5555", "nonthaburi"]]
        .map(([house, key, province], i) => ({ id: "res-demo" + i, kind: "res", at: now - 40 * 24 * HOUR, house, key, province }));
      const p1 = GR.passMake({ house: "99/1", plate: "ขค 789", name: L("ผู้มาเยือนตัวอย่าง 01", "Sample visitor 01", "示例访客 01"), from: now - HOUR, to: now + 3 * HOUR, uses: 0 }, r);
      const p2 = GR.passMake({ house: "12/3", plate: "6กก6666", name: L("ผู้มาเยือนตัวอย่าง 02", "Sample visitor 02", "示例访客 02"), from: now - 4 * HOUR, to: now - 40 * MIN, uses: 1 }, r);
      p1.province = "chonburi";
      // issued in advance (list order = issue time): the valid pass first, then the one that has run out
      const passes = [p1, p2].map((p, i) => ({ id: "pass-" + p.code, kind: "pass", ...p, at: now - (6 - i) * HOUR }));
      passes[1].used = 1;
      const why = L("ตัวอย่าง: นิติบุคคลแจ้งห้ามเข้า", "Sample: barred by the management office", "示例：物业通知禁止进入");
      const deny = [{ id: "deny-demo1", kind: "deny", at: now - 10 * 24 * HOUR, key: "3ฒพ12", province: "chiangmai", why, by: GUARD }];
      const ev = (i, min, o) => ({ id: "ev-demo" + i, kind: "ev", at: now - min * MIN, dir: "in", province: "bangkok", moto: false, gate: GATE_VG,
        by: GUARD, pass: "", opened: true, how: "guard", relay: "none", conf: 0.97, agree: 0.9, auto: false, edited: false, ...o });
      const evs = [
        ev(1, 230, { key: p2.key, status: "visitor", house: "12/3", pass: p2.code, province: "" }),
        ev(2, 180, { key: "1กข2345", status: "resident", house: "99/1" }),
        ev(3, 150, { key: "9กก9999", status: "resident", house: "12/3", dir: "out" }),
        ev(4, 95, { key: "กท4567", status: "unknown", house: "", opened: false, how: "refused", province: "nonthaburi" }),
        ev(5, 60, { key: "", status: "manual", house: "", how: "manual", conf: null, agree: null, province: "" }),
        ev(6, 25, { key: "5กก5555", status: "resident", house: "8/8", province: "nonthaburi" })];
      return [...res, ...passes, ...deny, ...evs];
    });
    D.onReady(body => {
      body.innerHTML = `<p data-i18n="demo.vg.p">บ้านและรถสมมติ บัตรผู้มาเยือน และรายการห้ามเข้าโหลดไว้แล้ว ยืนยันประกาศด้านล่าง แล้วกด "ใช้ภาพตัวอย่าง"
และ "รถคันถัดไป (ตัวอย่าง)" เพื่อดูการตัดสินแต่ละแบบ ทุกการอ่านป้ายต้องให้ รปภ. กดปุ่มยืนยันเอง การเปิดอัตโนมัติปิดอยู่</p>
<ul><li>${TH("1กข 2345")} — <span data-i18n="demo.vg.res">รถลูกบ้าน (บ้าน 99/1)</span></li>
<li>${TH("ขค 789")} — <span data-i18n="demo.vg.vis">ผู้มาเยือน มีบัตรผ่าน (บ้าน 99/1)</span></li>
<li>${TH("3ฒพ 12")} — <span data-i18n="demo.vg.deny">อยู่ในรายการห้ามเข้า</span></li>
<li>${TH("กท 4567")} — <span data-i18n="demo.vg.unk">รถไม่รู้จัก (ขึ้นแจ้งเตือน)</span></li></ul>
<p data-i18n="demo.vg.over">บัตรผ่านตัวอย่างอีกใบ (บ้าน 12/3) หมดเวลาแล้วแต่รถยังไม่ออก จึงขึ้นแจ้งเตือนผู้มาเยือนอยู่เกินเวลา</p>`;
      const auto = /** @type {any} */ (document.querySelector("#vgAutoOn"));
      if (auto) {
        auto.checked = false; auto.disabled = true;
        const n = document.createElement("p"); n.className = "hint"; n.setAttribute("data-lq-demo", ""); n.setAttribute("data-i18n", "demo.vg.autoOff");
        n.textContent = "โหมดสาธิต: เปิดไม้กั้นอัตโนมัติไม่ได้ ทุกการอ่านป้ายต้องให้ รปภ. กดยืนยันเอง (ตั้งค่านี้ได้ในระบบจริงเท่านั้น)";
        const lab = auto.closest("label") || auto; lab.after(n);
      }
      const line = /** @type {any} */ (document.querySelector("#vgVisLine"));
      if (line) {
        line.hidden = true; line.removeAttribute("href");
        const n = document.createElement("p"); n.className = "hint"; n.setAttribute("data-lq-demo", ""); n.setAttribute("data-i18n", "demo.vg.noLine");
        n.textContent = "โหมดสาธิต: ไม่มีปุ่มส่งทาง LINE เพราะไม่ส่งข้อมูลออกนอกเว็บไซต์นี้";
        line.after(n);
      }
    });
  }

  /* ================================================================ Gate: parking lot */
  if (page === "parking") {
    const SECRET = "demo-stamp-secret-0001";
    D.seed("lq-gate-parking-cfg", { siteName: L("ลานจอดตัวอย่าง (SAMPLE)", "Sample car park (SAMPLE)", "示例停车场（SAMPLE）"), gate: GATE_PK, ppId: "", capacity: 40, laneDir: "both", stampSecret: SECRET,
      fees: { freeMin: 15, freeDeduct: false, unitMin: 60, rate: 20, firstRate: null, graceMin: 0, dailyCap: 200, overnightAt: "", overnightFee: 0, lostFee: 200 } });
    D.addRecords("lq-gate-parking", () => {
      const shop = (code, name, freeMin, discount) => ({ id: "shop-" + code, kind: "shop", at: now - 30 * 24 * HOUR, code, name, freeMin, discount, serial: 3, active: true });
      const ev = (i, min, key, province, dir, o) => ({ id: "ev-demo" + i, kind: "ev", at: now - min * MIN, dir, key, province, moto: false, gate: GATE_PK,
        by: GUARD, conf: 0.96, agree: 0.9, auto: false, edited: false, ...(o || {}) });
      return [shop("S1", L("ร้านกาแฟตัวอย่าง", "Sample café", "示例咖啡店"), 60, 0), shop("S2", L("ร้านหนังสือตัวอย่าง", "Sample bookshop", "示例书店"), 0, 20),
        { id: "mp-demo1", kind: "mpass", at: now - 5 * 24 * HOUR, key: "9กก9999", province: "bangkok", until: now + 25 * 24 * HOUR },
        ev(1, 35, "1กข2345", "bangkok", "in"), ev(2, 130, "ขค789", "chonburi", "in"), ev(3, 320, "3ฒพ12", "chiangmai", "in"), ev(4, 50, "9กก9999", "bangkok", "in"),
        ev(5, 360, "กท4567", "nonthaburi", "in"), ev(6, 180, "กท4567", "nonthaburi", "out", { paid: true })];
    });
    D.onReady(body => {
      const GR = W.LQGateRules, codes = GR ? [0, 1, 2].map(i => GR.stampMake(SECRET, i < 2 ? "S1" : "S2", i)) : [];
      body.innerHTML = `<p data-i18n="demo.pk.p">กติกาค่าจอด (ฟรี 15 นาที ชั่วโมงละ 20 บาท สูงสุดวันละ 200 บาท) ร้านค้า 2 ร้าน บัตรรายเดือน 1 คัน และรถในลาน 4 คันโหลดไว้แล้ว
ยืนยันประกาศด้านล่าง กด "ใช้ภาพตัวอย่าง" อ่านป้าย แล้วให้ รปภ. กด "รถออก: คิดค่าจอด" เพื่อคิดเงิน พร้อมเพย์ไม่ได้ตั้งไว้ในโหมดสาธิต เพื่อไม่ให้มีการโอนเงินจริง</p>
<p data-i18n="demo.pk.codes">รหัสตราประทับร้านค้าตัวอย่าง (ใช้ได้ครั้งเดียว):</p>
<div class="lq-demo-btns">${codes.map(c => `<button type="button" class="btn ghost lq-demo-code" data-demo-stamp="${esc(c)}" translate="no">${esc(c)}</button>`).join("")}</div>`;
      const pp = /** @type {any} */ (document.querySelector("#pkPpId"));
      if (pp) {
        pp.value = ""; pp.disabled = true;
        const n = document.createElement("p"); n.className = "hint"; n.setAttribute("data-lq-demo", ""); n.setAttribute("data-i18n", "demo.pk.noPp");
        n.textContent = "โหมดสาธิต: ใส่พร้อมเพย์ไม่ได้ และไม่สร้าง QR รับเงินจริง เพื่อไม่ให้มีการโอนเงินจริง";
        (pp.closest("label") || pp).after(n);
      }
      body.addEventListener("click", e => {
        const b = /** @type {any} */ (e.target).closest("[data-demo-stamp]"), inp = /** @type {any} */ (document.querySelector("#pkStamp"));
        if (b && inp) { inp.value = b.dataset.demoStamp; if (!(/** @type {any} */ (document.querySelector("#pkPay"))).hidden) inp.focus(); }
      });
    });
  }

  /* ================================================================ Crowd: events */
  if (page === "crowd") {
    D.seed("lqcr-ack", { at: now });
    D.onReady(body => {
      const SC = [["far", "demo.cr.far", "ฝูงชนไกลกล้อง (คนดูเล็ก + 15 คนขึ้นไป)"], ["small", "demo.cr.small", "คนดูเล็ก (ไกลกล้อง)"], ["crowd", "demo.cr.crowd", "คน 15 คนขึ้นไป"],
        ["shop", "demo.cr.shop", "หน้าร้าน (คนเดินผ่าน)"]];
      body.innerHTML = `<p data-i18n="demo.cr.p">ระบบนี้อยู่ในขั้นทดลอง ยังไม่เหมาะกับฝูงชนหนาแน่น ตัวเลขเป็นค่าประมาณ ฉากด้านล่างเป็นภาพจำลอง (กล่องสีเทา ไม่มีภาพคน)
เลือกฉากเพื่อดูคำเตือน "คนดูเล็ก" และป้าย ≈ "ค่าประมาณ"</p>
<div class="lq-demo-btns" role="group">${SC.map(([id, k, th]) => btn(`data-demo-scene="${id}" aria-pressed="${id === "far"}"`, k, th)).join("")}</div>`;
      body.addEventListener("click", e => {
        const b = /** @type {any} */ (e.target).closest("[data-demo-scene]"); if (!b) return;
        if (D.crowdScene) D.crowdScene(b.dataset.demoScene);
        body.querySelectorAll("[data-demo-scene]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      });
    });
  }
})();
