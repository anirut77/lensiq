// tests/e2e/attendance-hr.e2e.mjs — employee time attendance on attendance.html (attendance-hr.js + lensiq-timeclock.js):
// mode switch (training check-in untouched), face punch, PIN + QR fallback (non-biometric alternative), opt-out blocks face
// enrolment, manager correction with append-only audit, monthly summary + payroll CSV, kiosk, multi-device import,
// zh / en coverage of the new UI (0 % Thai), phone widths 320/360/390 (no overflow, 44 px targets), privacy.
// Faces come from window.__LQ_FAKE_DET and matches from window.__LQ_FAKE_MATCH (?fakedet on localhost only).
import { assert, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const D = v => Array.from({ length: 128 }, (_, k) => +(Math.sin(k * v) * 0.1).toFixed(5));
const PEOPLE = [{ id: "pA", name: "สมชาย ทดสอบ", code: "A01", descriptor: D(1) }];
const HOOKS = `
  window.__faces = [];
  window.__LQ_FAKE_DET = () => window.__faces.map(f => Object.assign({ score: 0.95 }, f));
  window.__LQ_FAKE_MATCH = d => d && d.who ? { label: d.who, distance: 0.3 } : { label: "unknown", distance: 0.9 };
  window.__blobs = [];
  const _cou = URL.createObjectURL.bind(URL);
  URL.createObjectURL = b => { window.__blobs.push(b); return _cou(b); };
  HTMLAnchorElement.prototype.click = function () { window.__lastDownload = this.download; };
`;
const FACE = (x, who) => ({ x, y: 0.3, w: 0.2, h: 0.3, who });

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    const page = await browser.newPage(null, { initScripts: [fakeCams, HOOKS] });
    const url = `${base}/attendance.html?cpu&fakedet`;
    await page.goto(url);
    await page.evaluate(p => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("att-people", JSON.stringify(p)); }, PEOPLE);
    await page.reload();
    await page.waitFor("ready === true && people.length === 1 && window.LQHR", 15000);
    const st = () => page.evaluate(() => JSON.parse(JSON.stringify(LQHR.state)));
    const lastBlob = () => page.evaluate(async () => window.__blobs.length ? await window.__blobs[window.__blobs.length - 1].text() : "");
    const fill = (sel, v) => page.evaluate((sel, v) => { const el = document.querySelector(sel); if (el.type === "checkbox") el.checked = !!v; else el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, sel, v);
    const click = sel => page.evaluate(sel => document.querySelector(sel).click(), sel);
    const hrTab = h => click(`.hr-tab[data-h="${h}"]`);
    const addEmp = async (code, name, dept, pin, noFace) => {
      await hrTab("emp");
      await page.evaluate((code, name, dept, pin, noFace) => { const f = document.querySelector("#hrEmpForm"); f.code.value = code; f.name.value = name; f.dept.value = dept; f.pin.value = pin || ""; f.noFace.checked = !!noFace; f.requestSubmit(); }, code, name, dept, pin, noFace);
    };

    await check("training mode is the default and unchanged; employee mode adds the HR UI without removing anything", async () => {
      const r = await page.evaluate(() => ({ body: document.body.className, session: getComputedStyle(document.querySelector(".session")).display, admin: getComputedStyle(document.querySelector("#hrAdmin")).display,
        tabs: [...document.querySelectorAll(".tab")].filter(t => getComputedStyle(t).display !== "none").map(t => t.dataset.t) }));
      assert(!/att-emp/.test(r.body) && r.session !== "none" && r.admin === "none", "training default: " + JSON.stringify(r));
      assert(r.tabs.join() === "checkin,register,records,check", "original tabs only: " + r.tabs);
      await click('.mode-btn[data-mode="employee"]');
      const e = await page.evaluate(() => ({ session: getComputedStyle(document.querySelector(".session")).display, admin: getComputedStyle(document.querySelector("#hrAdmin")).display, notice: document.querySelector("#hrNotice").open,
        tabs: [...document.querySelectorAll(".tab")].filter(t => getComputedStyle(t).display !== "none").map(t => t.dataset.t), set: JSON.parse(localStorage.getItem("att-hr-settings")) }));
      assert(e.session === "none" && e.admin !== "none" && e.notice, "employee UI + PDPA notice opened: " + JSON.stringify(e));
      assert(e.tabs.join() === "checkin,register,records,check,pin", "PIN/QR tab added: " + e.tabs);
      assert(e.set.mode === "employee" && e.set.retYears === 2 && /^d[a-z0-9]{8,}$/.test(e.set.dev), "settings: " + JSON.stringify(e.set));
    });

    await check("employees: add with department, PIN and face opt-out; opt-out blocks face enrolment", async () => {
      await addEmp("A01", "สมชาย ทดสอบ", "ผลิต");
      await addEmp("B02", "สมศรี ไม่ใช้ใบหน้า", "บัญชี", "4321", true);
      await addEmp("C03", "สมปอง บัตร", "ผลิต", "", false);
      const s = await st();
      assert(s.emps.length === 3 && s.emps.every(e => e.qr && e.qr.length === 20), "3 employees with badge tokens");
      const b = s.emps.find(e => e.code === "B02");
      assert(b.noFace && b.pinHash && b.pinHash.length === 64 && !JSON.stringify(b).includes("4321"), "PIN stored only as a salted hash");
      assert(s.audit.filter(a => a.action === "emp_add").length === 3, "employee adds are in the audit log");
      await fill("#hrDeptE", "ผลิต");
      const n = await page.evaluate(() => document.querySelectorAll("#hrEmpBody tr").length);
      assert(n === 2, "department filter shows 2 rows: " + n);
      await fill("#hrDeptE", "");
      // a PIN/QR-only employee cannot be enrolled with a face
      await page.evaluate(f => { window.__faces = f; document.querySelector('.tab[data-t="register"]').click(); const fm = document.querySelector("#regForm"); fm.name.value = "สมศรี"; fm.code.value = "B02"; fm.consent.checked = true; fm.requestSubmit(); }, [FACE(0.3, null)]);
      await page.waitFor(() => /ไม่ใช้ใบหน้า/.test(document.querySelector("#regMsg").textContent), 5000);
      assert(await page.evaluate(() => people.length === 1), "no face stored for the opted-out employee");
    });

    await check("face scan in employee mode records a time punch (no session needed, training logs untouched); repeat scans ignored", async () => {
      await click('.tab[data-t="checkin"]');
      await page.evaluate(f => { window.__faces = f; }, [FACE(0.3, "pA")]);
      await click("#startScan");
      await page.waitFor(() => JSON.parse(localStorage.getItem("att-hr-punches") || "[]").length === 1, 8000);
      await sleep(1500);
      const r = await page.evaluate(() => ({ p: JSON.parse(localStorage.getItem("att-hr-punches")), logs: JSON.parse(localStorage.getItem("att-logs") || "[]"), banner: document.querySelector("#banner").textContent }));
      assert(r.p.length === 1 && r.p[0].method === "face" && r.p[0].type === "auto", "one face punch: " + JSON.stringify(r.p));
      assert(r.logs.length === 0, "training log not written");
      assert(/เข้างาน|ลงเวลาแล้ว/.test(r.banner), "banner: " + r.banner);
      await page.evaluate(() => { window.__faces = []; if (scanning) document.querySelector("#startScan").click(); });
    });

    await check("PIN fallback: wrong PIN refused without saying which part is wrong; right PIN punches; QR badge punches", async () => {
      await click('.tab[data-t="pin"]');
      assert(await page.evaluate(() => !document.querySelector("#pane-pin").hidden), "PIN pane shown");
      await fill("#hrCode", "B02"); await fill("#hrPin", "1111");
      await page.evaluate(() => document.querySelector("#hrPinForm").requestSubmit());
      assert(/ไม่ถูกต้อง/.test(await page.evaluate(() => document.querySelector("#hrPunchMsg").textContent)), "wrong PIN refused");
      await fill("#hrCode", "B02"); await fill("#hrPin", "4321");
      await page.evaluate(() => document.querySelector("#hrPinForm").requestSubmit());
      const m = await page.evaluate(() => document.querySelector("#hrPunchMsg").textContent);
      assert(/สมศรี/.test(m) && /เข้างาน/.test(m), "PIN punch: " + m);
      const qr = await page.evaluate(() => { const e = LQHR.state.emps.find(x => x.code === "C03"); return LQClock.qrPayload(e.code, e.qr); });
      await page.evaluate(v => { const el = document.querySelector("#hrQr"); el.value = v; el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); }, qr);
      await page.evaluate(v => { const el = document.querySelector("#hrQr"); el.value = v.slice(0, -2) + "zz"; el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); }, qr);
      assert(/QR/.test(await page.evaluate(() => document.querySelector("#hrPunchMsg").textContent)), "forged badge refused");
      const p = (await st()).punches;
      assert(p.length === 3 && p.map(x => x.method).sort().join() === "face,pin,qr", "face + pin + qr punches: " + JSON.stringify(p.map(x => x.method)));
      assert(await page.evaluate(() => document.querySelectorAll("#hrToday li").length === 3), "today list shows 3");
    });

    await check("manager correction: needs who + reason, appends to a verified audit chain, shows in the monthly report", async () => {
      await hrTab("audit");
      const b02 = (await st()).emps.find(e => e.code === "B02").id;
      await fill("#hrFixEmp", b02);
      await page.evaluate(() => { const f = document.querySelector("#hrFixForm"); f.time.value = "17:30"; f.type.value = "out"; f.requestSubmit(); });
      assert(/ชื่อผู้ดูแล/.test(await page.evaluate(() => document.querySelector("#hrFixMsg").textContent)), "asks who");
      await fill("#hrBy", "หัวหน้า ทดสอบ");
      await page.evaluate(() => document.querySelector("#hrFixForm").requestSubmit());
      assert(/เหตุผล/.test(await page.evaluate(() => document.querySelector("#hrFixMsg").textContent)), "asks for a reason");
      await fill("#hrFixReason", "ลืมสแกนออก");
      await page.evaluate(() => document.querySelector("#hrFixForm").requestSubmit());
      const s = await st(), fix = s.audit.find(a => a.action === "punch_add");
      assert(fix && fix.by === "หัวหน้า ทดสอบ" && fix.reason === "ลืมสแกนออก" && fix.after.method === "manual" && fix.before === null, "audit entry: " + JSON.stringify(fix));
      assert(s.punches.length === 3, "raw punches unchanged (corrections live in the audit log)");
      const chain = await page.evaluate(() => document.querySelector("#hrChain").textContent);
      assert(/ครบถ้วน/.test(chain), "chain verified: " + chain);
      assert(await page.evaluate(() => /ลืมสแกนออก/.test(document.querySelector("#hrAuditBody").textContent)), "audit table shows the reason");
      // tampering with the stored log is detected
      await page.evaluate(() => { const a = JSON.parse(localStorage.getItem("att-hr-audit")); a[0].reason = "x"; localStorage.setItem("att-hr-audit", JSON.stringify(a)); });
      await page.reload(); await page.waitFor("window.LQHR && ready === true", 15000);
      await hrTab("audit");
      assert(/ไม่ตรงลำดับ|แก้ไขภายนอก/.test(await page.evaluate(() => document.querySelector("#hrChain").textContent)), "tampering flagged");
      await page.evaluate(() => { const a = JSON.parse(localStorage.getItem("att-hr-audit")); a[0].reason = ""; localStorage.setItem("att-hr-audit", JSON.stringify(a)); });
      await page.reload(); await page.waitFor("window.LQHR && ready === true", 15000);
      await hrTab("month");
      const row = await page.evaluate(() => [...document.querySelectorAll("#hrSumBody tr")].map(tr => [...tr.cells].map(c => c.textContent)).find(c => c[0] === "B02"));
      assert(row && row[11] === "1", "corrections column = 1: " + JSON.stringify(row));
    });

    await check("payroll CSV: one row per employee, bilingual headers, minutes and hours; daily + audit CSV", async () => {
      // a past month with known punches: late 12 min, OT 1 h, and one absence
      await page.evaluate(() => {
        const C = LQClock, s = LQHR.state, e = s.emps.find(x => x.code === "A01"), T = (d, h) => C.dayStart(d) + C.hm(h) * 60000;
        const P = JSON.parse(localStorage.getItem("att-hr-punches"));
        P.push({ id: "t1", emp: e.id, ts: T("2026-10-05", "08:12"), type: "auto", method: "face", dev: s.S.dev }, { id: "t2", emp: e.id, ts: T("2026-10-05", "18:05"), type: "auto", method: "face", dev: s.S.dev });
        localStorage.setItem("att-hr-punches", JSON.stringify(P));
      });
      await page.reload(); await page.waitFor("window.LQHR && ready === true", 15000);
      await hrTab("month"); await fill("#hrMonth", "2026-10");
      await click("#hrPayCsv");
      const csv = await lastBlob();
      const lines = csv.replace(/^﻿/, "").split("\r\n");
      assert(lines.length === 4 && /late_minutes/.test(lines[0]) && /ot_hours/.test(lines[0]), "header + 3 rows: " + lines.length);
      const a = lines.find(l => l.includes('"A01"')).split(",").map(x => x.replace(/"/g, ""));
      assert(a[6] === "1" && a[8] === "12" && a[11] === "1.00", "A01: worked 1 day, late 12 min, OT 1.00 h: " + a.join("|"));
      assert(a[5] === "20" && a[22] === "19", "Oct 2026: 20 scheduled days (Oct 13 + 23 are holidays), 19 absences: " + a[5] + "/" + a[22]);
      await click("#hrDetailCsv");
      assert(/2026-10-05/.test(await lastBlob()) && /late/.test(await lastBlob()), "daily CSV");
      await click("#hrAuditCsv");
      assert(/ลืมสแกนออก/.test(await lastBlob()), "audit CSV has the correction");
      // PDPA access request: one employee's own month + the corrections made to them
      const b02 = (await st()).emps.find(e => e.code === "B02").id;
      await fill("#hrMonth", (await page.evaluate(() => LQClock.dateKey(Date.now()).slice(0, 7))));
      await page.evaluate(id => document.querySelector(`#hrSumBody [data-day="${id}"]`).click(), b02);
      await click("#hrEmpCsv");
      const mine = await lastBlob();
      assert(/"B02"/.test(mine) && !/"A01"/.test(mine) && /ลืมสแกนออก/.test(mine) && /lensiq-my-records-/.test(await page.evaluate(() => window.__lastDownload)), "per-employee export");
    });

    await check("holidays (Thai list, editable) and leave (needs who) feed the summary", async () => {
      await hrTab("cal");
      const n = await page.evaluate(() => document.querySelectorAll("#hrHolBody tr").length);
      assert(n >= 15, "default Thai holidays listed: " + n);
      assert(/13/.test(await page.evaluate(() => document.querySelector("#hrHolNote").textContent)), "13-day rule note");
      const a01 = (await st()).emps.find(e => e.code === "A01").id;
      await page.evaluate(id => { const f = document.querySelector("#hrLeaveForm"); f.emp.value = id; f.from.value = "2026-10-06"; f.to.value = "2026-10-07"; f.type.value = "sick"; f.requestSubmit(); }, a01);
      const s = await st();
      assert(s.leave.length === 2 && s.audit.filter(x => x.action === "leave_add").length === 2, "2 leave days + audit");
      await hrTab("month"); await fill("#hrMonth", "2026-10");
      const row = await page.evaluate(() => [...document.querySelectorAll("#hrSumBody tr")].map(tr => [...tr.cells].map(c => c.textContent)).find(c => c[0] === "A01"));
      assert(row[8] === "2", "leave column = 2: " + JSON.stringify(row));
      await hrTab("cal");
      const use = await page.evaluate(() => [...document.querySelectorAll("#hrLeaveUse tr")].map(tr => [...tr.cells].map(c => c.textContent)));
      assert(use.length === 1 && use[0][1] === "2 / 30", "leave used this year vs the 30-day reference: " + JSON.stringify(use));
      // shift change with an effective date keeps earlier days on the old shift
      await hrTab("emp");
      await page.evaluate(id => document.querySelector(`#hrEmpBody [data-edit="${id}"]`).click(), a01);
      await page.evaluate(() => { const f = document.querySelector("#hrEmpForm"); f.shift.value = "night"; f.shiftFrom.value = "2026-10-20"; f.requestSubmit(); });
      const e = (await st()).emps.find(x => x.code === "A01");
      assert(e.shift === "night" && e.shiftHist.length === 2 && e.shiftHist[0].shift === "day" && e.shiftHist[1].from === "2026-10-20", "shift history: " + JSON.stringify(e.shiftHist));
      const lateOct = await page.evaluate(() => { const s = LQHR.state; return LQClock.monthSummary({ emps: s.emps, shifts: s.shifts, punches: s.punches, audit: s.audit, leave: s.leave, holidays: s.holidays, month: "2026-10" }).rows.find(r => r.code === "A01").lateMin; });
      assert(lateOct === 12, "Oct 5 still measured against the day shift: " + lateOct);
    });

    await check("multi-device: an exported pack from another device merges once (no PIN hash / QR token in the file)", async () => {
      await hrTab("data");
      await click("#hrExport");
      const pack = JSON.parse(await lastBlob());
      assert(pack.format === "lensiq-timeclock" && pack.punches.length >= 5, "pack exported");
      const txt = JSON.stringify(pack);
      assert(!/pinHash|pinSalt|"qr":|descriptor|data:image/.test(txt), "no secrets / face data in the pack");
      const other = Object.assign({}, pack, { dev: "dothertest01", devName: "สาขา 2", punches: [{ id: "o1", emp: pack.emps[0].id, ts: Date.now() - 3600e3, type: "in", method: "pin", dev: "dothertest01" }], audit: [] });
      const r = await page.evaluate(async o => {
        const inp = document.querySelector("#hrImport"), dt = new DataTransfer();
        dt.items.add(new File([JSON.stringify(o)], "a.json", { type: "application/json" })); dt.items.add(new File([JSON.stringify(o)], "b.json", { type: "application/json" }));
        inp.files = dt.files; inp.dispatchEvent(new Event("change"));
        await new Promise(r => setTimeout(r, 400));
        return { msg: document.querySelector("#hrDataMsg").textContent, n: LQHR.state.punches.filter(p => p.id === "o1").length };
      }, other);
      assert(r.n === 1, "merged once: " + JSON.stringify(r));
      const bad = await page.evaluate(async o => {
        const inp = document.querySelector("#hrImport"), dt = new DataTransfer(); o.punches[0].photo = "data:image/png;base64,AAAA";
        dt.items.add(new File([JSON.stringify(o)], "c.json")); inp.files = dt.files; inp.dispatchEvent(new Event("change"));
        await new Promise(r => setTimeout(r, 400)); return document.querySelector("#hrDataMsg").className;
      }, other);
      assert(/err/.test(bad), "a pack with unknown keys is refused");
    });

    await check("kiosk mode: one punching screen, admin hidden; exit needs the manager PIN once set", async () => {
      await hrTab("data");
      await fill("#hrMgrPinNew", "9999"); await click("#hrDataSave");
      await click("#hrKiosk");
      const k = await page.evaluate(() => ({ kiosk: document.body.classList.contains("att-kiosk"), nav: getComputedStyle(document.querySelector("#siteNav")).display, admin: getComputedStyle(document.querySelector("#hrAdmin")).display,
        pin: getComputedStyle(document.querySelector("#pane-pin")).display, scan: getComputedStyle(document.querySelector("#pane-checkin")).display }));
      assert(k.kiosk && k.nav === "none" && k.admin === "none" && k.pin !== "none" && k.scan !== "none", "kiosk layout: " + JSON.stringify(k));
      await click("#hrKiosk");
      await fill("#hrKioskPin", "0000"); await page.evaluate(() => document.querySelector("#hrKioskExit").requestSubmit());
      assert(await page.evaluate(() => document.body.classList.contains("att-kiosk")), "wrong PIN keeps kiosk");
      await fill("#hrKioskPin", "9999"); await page.evaluate(() => document.querySelector("#hrKioskExit").requestSubmit());
      assert(await page.evaluate(() => !document.body.classList.contains("att-kiosk")), "manager PIN exits kiosk");
      if (await page.evaluate(() => scanning)) await click("#startScan");
    });

    await check("back to training mode: the original face check-in still writes training logs", async () => {
      await click('.mode-btn[data-mode="training"]');
      await page.evaluate(() => { const el = document.querySelector("#session"); el.value = "รอบ HR"; el.dispatchEvent(new Event("input")); window.__faces = []; });
      await click("#startScan"); await sleep(1900); // empty frames: the 2-frame confirmation forgets earlier faces
      await page.evaluate(f => { window.__faces = f; }, [FACE(0.3, "pA")]);
      await page.waitFor(() => JSON.parse(localStorage.getItem("att-logs") || "[]").some(l => l.session === "รอบ HR"), 8000);
      await page.evaluate(() => { window.__faces = []; if (scanning) document.querySelector("#startScan").click(); });
      const n = (await st()).punches.length;
      assert(n === 6, "no extra punch in training mode: " + n);
    });

    await check("privacy + no console errors", async () => {
      await privacyScan(page);
      const errs = page.consoleErrors.filter(e => e.kind !== "log");
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
    });

    for (const lang of ["zh", "en"]) {
      await check(`${lang}: the employee-mode UI has no Thai left (user data excluded)`, async () => {
        await page.goto(`${base}/attendance.html?cpu&fakedet&mode=employee&lang=${lang}`);
        await page.waitFor(`window.LQHR && ready === true && window.LQI18N && LQI18N.lang === "${lang}"`, 15000);
        await sleep(400);
        const worst = [];
        for (const h of ["emp", "shift", "cal", "month", "audit", "data"]) {
          await hrTab(h);
          await page.evaluate(() => { const b = document.querySelector("#hrSumBody [data-day]"); if (b) b.click(); document.querySelector("#hrNotice").open = true; });
          await sleep(250);
          const c = await page.evaluate(() => ["#hrAdmin", "#hrBar", ".att-mode", "#hrNotice", "#pane-checkin"].map(s => LQI18N.coverage(document.querySelector(s), { top: 3 })));
          c.forEach((x, i) => { if (x.thai) worst.push({ h, i, pct: x.pct, top: x.top }); });
        }
        await click('.tab[data-t="pin"]'); await sleep(200);
        const p = await page.evaluate(() => LQI18N.coverage(document.querySelector("#pane-pin"), { top: 3 }));
        if (p.thai) worst.push({ h: "pin", top: p.top });
        assert(!worst.length, "Thai left: " + JSON.stringify(worst).slice(0, 900));
        const errs = page.consoleErrors.filter(e => e.kind !== "log");
        assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      });
    }
    await page.evaluate(() => localStorage.setItem("lq-lang", "th"));
    await page.close();

    await check("phones 320 / 360 / 390: no horizontal overflow, HR controls >= 44 px", async () => {
      const p = await browser.newPage(null, { initScripts: [fakeCams, HOOKS] });
      for (const w of [320, 360, 390]) {
        await p.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 2, mobile: true });
        await p.goto(`${base}/attendance.html?cpu&fakedet&mode=employee&lang=th`);
        await p.waitFor("window.LQHR && ready === true", 15000);
        for (const h of ["emp", "shift", "cal", "month", "audit", "data", "kiosk"]) {
          if (h === "kiosk") await p.evaluate(() => LQHR.enterKiosk(false)); else await p.evaluate(h => document.querySelector(`.hr-tab[data-h="${h}"]`).click(), h);
          const r = await p.evaluate(() => {
            const sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
            const small = [...document.querySelectorAll("#hrAdmin button, #hrAdmin select, #hrAdmin input:not([type=checkbox]):not([type=file]), #hrBar button, #hrBar select, .att-mode button, #pane-pin button, #pane-pin input")]
              .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden").map(el => { const b = el.getBoundingClientRect(); return { id: el.id || el.className || el.name, w: b.width, h: b.height }; })
              .filter(b => b.h < 44 || b.w < 44);
            return { sw, cw, small: small.slice(0, 5) };
          });
          assert(r.sw <= r.cw, `no overflow at ${w}px on ${h}: ${r.sw} > ${r.cw}`);
          assert(!r.small.length, `44 px targets at ${w}px on ${h}: ${JSON.stringify(r.small)}`);
          if (h === "kiosk") await p.evaluate(() => LQHR.exitKiosk());
        }
      }
      const errs = p.consoleErrors.filter(e => e.kind !== "log");
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await p.close();
    });
  } finally { await browser.close(); }
}
