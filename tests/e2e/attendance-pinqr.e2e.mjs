// tests/e2e/attendance-pinqr.e2e.mjs — FIXED TEST (Attendance PIN / QR to 90, acceptance sheet docs/acceptance/attendance.md),
// locked in evals-locks/attendance-time.sha256 (~/LENSIQ-field/evals/attendance-time/) BEFORE the product change.
// Headless Chrome, attendance.html?mode=employee WITHOUT ?fakedet (the real page path), one fake camera that shows a QR badge
// (tests/e2e/qr-cam.js), the browser's own BarcodeDetector removed (so the decoder that iPhone Safari uses is the one tested).
// Synthetic data only: made-up employees, no person filmed.
//   S2  PIN mode loads no face model: no face-api.js, no file under vendor/models/, no weights / shard / TF.js file is
//       requested while the page loads, while an employee clocks in by PIN, and while a badge is scanned with the camera;
//       choosing the face camera still loads face-api.js and its models (nothing removed).
//   F2  camera badge scan without a native BarcodeDetector: the QR on the camera is read and a "qr" punch is saved.
//   L3  the payroll, daily and audit CSV headers are in the chosen language (th: Thai with the English key; en: no Thai;
//       zh: Chinese, no Thai), same columns in the same order, the English key of every column kept; the badge card carries
//       a title in the chosen language (en / zh: no Thai outside the employee's own data).
//   X   badge print: the print button calls print() with only the badge marked for printing; in print media only the badge
//       card is visible, and its QR decodes to the employee's own badge text.
//   E   storage near full (over 3,500 KB of time records): the data tab shows its own "storage almost full" line in the
//       page language with the warning style; below the limit it does not.
//   P4  main flow at 360 x 780 and 430 x 932 (mobile): add an employee with a PIN, clock in by PIN, monthly summary, payroll
//       CSV; no horizontal scroll at any step; the PIN / QR controls and the CSV button are at least 44 px tall.
import { assert } from "./cdp.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const QR_CAM = readFileSync(join(here, "qr-cam.js"), "utf8");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NO_NATIVE = "try { delete window.BarcodeDetector; } catch (e) {} try { Object.defineProperty(window, 'BarcodeDetector', { value: undefined, configurable: true }); delete window.BarcodeDetector; } catch (e) {}";
const HOOKS = `
  window.__blobs = [];
  const _cou = URL.createObjectURL.bind(URL);
  URL.createObjectURL = b => { window.__blobs.push(b); return _cou(b); };
  HTMLAnchorElement.prototype.click = function () { window.__lastDownload = this.download; };
  window.__printed = [];
  window.print = () => { window.__printed.push(document.body.classList.contains("att-print-badge")); };
  window.confirm = () => true; window.alert = () => {};
`;
const FACE_RE = /face-api\.js|\/vendor\/models\/|weights_manifest\.json|-shard\d|tfjs|\.tflite|\.onnx/i;
const THAI = /[฀-๿]/, HAN = /[一-鿿]/;
const NEAR = { th: /พื้นที่จัดเก็บใกล้เต็ม/, en: /storage is almost full/i, zh: /存储空间即将用完/ };
const BADGE_TITLE = { th: /บัตรลงเวลา/, en: /time card/i, zh: /考勤卡/ };

export default async function ({ base, launch, check }) {
  const browser = await launch();
  const open = async (lang, extra = "") => {
    const page = await browser.newPage(null, { initScripts: [NO_NATIVE, QR_CAM, HOOKS], isolated: true });
    await page.goto(`${base}/attendance.html?mode=employee&lang=${lang}${extra}`);
    await page.evaluate(l => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("lq-lang", l); }, lang);
    await page.reload();
    await page.waitFor(`window.LQHR && !!window.__ATT_CORE && window.LQI18N && LQI18N.lang === "${lang}"`, 20000);
    return page;
  };
  const click = (page, sel) => page.evaluate(sel => document.querySelector(sel).click(), sel);
  const addEmp = (page, code, name, pin) => page.evaluate(([code, name, pin]) => {
    document.querySelector('.hr-tab[data-h="emp"]').click();
    const f = document.querySelector("#hrEmpForm"); f.code.value = code; f.name.value = name; f.dept.value = "Test"; f.pin.value = pin || ""; f.noFace.checked = true; f.requestSubmit();
    return LQHR.state.emps.some(e => e.code === code);
  }, [code, name, pin]);
  const pinPunch = async (page, code, pin) => {
    await click(page, '.tab[data-t="pin"]');
    await page.evaluate(([code, pin]) => { document.querySelector("#hrCode").value = code; document.querySelector("#hrPin").value = pin; document.querySelector("#hrPinForm").requestSubmit(); }, [code, pin]);
    return page.evaluate(() => ({ cls: document.querySelector("#hrPunchMsg").className, text: document.querySelector("#hrPunchMsg").textContent }));
  };
  const badge = async (page, code) => page.evaluate(code => {
    const e = LQHR.state.emps.find(x => x.code === code);
    document.querySelector('.hr-tab[data-h="emp"]').click();
    document.querySelector(`[data-badge="${e.id}"]`).click();
    const e2 = LQHR.state.emps.find(x => x.code === code);
    return { id: e2.id, text: "LQAT1." + encodeURIComponent(e2.code) + "." + e2.qr };
  }, code);
  const blobs = page => page.evaluate(async () => Promise.all(window.__blobs.map(b => b.text())));
  try {
    await check("S2 + F2: PIN mode and the camera badge scan (no native BarcodeDetector) load no face library and no face model", async () => {
      const page = await open("th");
      try {
        assert(await page.evaluate(() => !("BarcodeDetector" in window)), "the native BarcodeDetector is still there: the fallback is not tested");
        assert(await addEmp(page, "A01", "Pin Test", "1357"), "employee A01 added");
        assert(await addEmp(page, "B02", "Qr Test", "2468"), "employee B02 added");
        const r = await pinPunch(page, "A01", "1357");
        assert(/\bok\b/.test(r.cls), "PIN punch accepted: " + JSON.stringify(r));
        const b = await badge(page, "B02");
        await page.evaluate(t => { window.__QR_TEXT = t; }, b.text);
        await click(page, '.tab[data-t="pin"]');
        const btn = await page.evaluate(() => { const el = document.querySelector("#hrQrCam"); return { hidden: el.hidden || !el.getClientRects().length }; });
        assert(!btn.hidden, "the camera QR button is shown without a native BarcodeDetector");
        await click(page, "#hrQrCam");
        const got = await page.waitFor(`LQHR.state.punches.some(p => p.emp === ${JSON.stringify(b.id)} && p.method === "qr")`, 30000).then(() => true, () => false);
        const msg = await page.evaluate(() => ({ cls: document.querySelector("#hrPunchMsg").className, text: document.querySelector("#hrPunchMsg").textContent }));
        assert(got, "a qr punch was saved from the camera within 30 s: " + JSON.stringify(msg));
        assert(/\bok\b/.test(msg.cls) && /Qr Test/.test(msg.text), "the punch line names the employee: " + JSON.stringify(msg));
        await sleep(1500);
        const urls = page.requests.map(x => x.url);
        const face = urls.filter(u => FACE_RE.test(u));
        assert(!face.length, "face library / model requested in PIN / QR mode: " + face.slice(0, 5).join(" "));
        assert(urls.some(u => /\/vendor\/zxing\//.test(u)), "the self-hosted QR decoder (vendor/zxing) was used");
        assert(await page.evaluate(() => typeof window.faceapi === "undefined"), "window.faceapi exists in PIN / QR mode");
        assert(await page.evaluate(() => (window.__QR_CAM && window.__QR_CAM.opens) >= 1), "the test camera was opened");
        const errs = page.consoleErrors.filter(e => e.kind !== "log");
        assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      } finally { await page.close(); }
    });

    await check("S2: choosing the face camera in employee mode still loads face-api.js and its models (nothing removed)", async () => {
      const page = await open("th");
      try {
        await click(page, "#camPower");
        await page.waitFor(() => !!window.faceapi, 30000);
        const ok = await page.waitFor(() => performance.getEntriesByType("resource").some(e => /\/vendor\/models\//.test(e.name)), 30000).then(() => true, () => false);
        assert(ok, "no face model requested after choosing the face camera");
      } finally { await page.close(); }
    });

    for (const lang of ["th", "en", "zh"]) {
      await check(`L3 (${lang}): payroll / daily / audit CSV headers and the badge card are in the chosen language`, async () => {
        const page = await open(lang);
        try {
          assert(await addEmp(page, "C03", "Csv Test", "1122"), "employee added");
          assert(/\bok\b/.test((await pinPunch(page, "C03", "1122")).cls), "PIN punch");
          await click(page, '.hr-tab[data-h="month"]');
          await click(page, "#hrPayCsv"); await click(page, "#hrDetailCsv"); await click(page, "#hrAuditCsv");
          const files = await blobs(page);
          assert(files.length === 3, "three CSV files: " + files.length);
          const heads = files.map(f => f.replace(/^﻿/, "").split("\r\n")[0]);
          const keys = [/"[^"]*\bmonth"/, /"[^"]*\bdate"/, /"[^"]*\bat"/];
          heads.forEach((h, i) => {
            assert(keys[i].test(h), `CSV ${i}: English key kept: ${h.slice(0, 120)}`);
            if (lang === "th") assert(THAI.test(h), `CSV ${i} th header has Thai: ${h.slice(0, 120)}`);
            if (lang === "en") assert(!THAI.test(h) && !HAN.test(h), `CSV ${i} en header has no Thai / Chinese: ${h.slice(0, 160)}`);
            if (lang === "zh") assert(HAN.test(h) && !THAI.test(h), `CSV ${i} zh header is Chinese, no Thai: ${h.slice(0, 160)}`);
          });
          const cols = heads.map(h => h.split('","').length);
          assert(cols[0] === 29 && cols[1] === 19 && cols[2] === 11, "column counts 29 / 19 / 11: " + cols);
          assert(/late_minutes/.test(heads[0]) && /ot_hours/.test(heads[0]) && /week_normal_over_48h/.test(heads[0]), "payroll keys");
          await badge(page, "C03");
          const card = await page.evaluate(() => {
            const box = document.querySelector("#hrBadge .badge-card"), c = box.cloneNode(true);
            c.querySelectorAll("[data-i18n-skip], svg").forEach(x => x.remove());
            return { text: c.textContent.trim(), hint: document.querySelector("#hrBadge").textContent };
          });
          assert(BADGE_TITLE[lang].test(card.text), `badge card title in ${lang}: "${card.text}"`);
          if (lang !== "th") assert(!THAI.test(card.text) && !THAI.test(card.hint.replace(/Csv Test|C03|Test/g, "")), `no Thai on the ${lang} badge: "${card.hint.slice(0, 200)}"`);
        } finally { await page.close(); }
      });
    }

    await check("X: badge print prints only the badge card, and the printed QR decodes to the badge text", async () => {
      const page = await open("th");
      try {
        assert(await addEmp(page, "D04", "Print Test", "4455"), "employee added");
        const b = await badge(page, "D04");
        await page.evaluate(() => document.querySelector("#hrBadge [data-print]").click());
        const printed = await page.evaluate(() => window.__printed.slice());
        assert(printed.length === 1 && printed[0] === true, "print() called once with the badge marked: " + JSON.stringify(printed));
        await page.evaluate(() => document.body.classList.add("att-print-badge"));
        await page.send("Emulation.setEmulatedMedia", { media: "print" });
        const vis = await page.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll("body *")) {
            if (!el.childElementCount && (el.textContent || "").trim() || el.tagName === "svg") {
              const r = el.getBoundingClientRect(), s = getComputedStyle(el);
              if (r.width && r.height && s.visibility === "visible" && s.display !== "none") out.push({ inCard: !!el.closest("#hrBadge .badge-card"), tag: el.tagName, t: (el.textContent || "").trim().slice(0, 40) });
            }
          }
          return out;
        });
        await page.send("Emulation.setEmulatedMedia", { media: "" });
        const outside = vis.filter(v => !v.inCard);
        assert(!outside.length, "visible in print outside the badge card: " + JSON.stringify(outside.slice(0, 5)));
        assert(vis.some(v => v.tag === "svg") && vis.some(v => v.t === "Print Test"), "QR and name printed: " + JSON.stringify(vis.slice(0, 6)));
        const raw = await page.evaluate(async () => {
          if (!window.BarcodeDetectionAPI) await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "vendor/zxing/barcode-detector-ponyfill.js"; s.onload = res; s.onerror = rej; document.head.append(s); });
          const api = window.BarcodeDetectionAPI;
          api.prepareZXingModule({ overrides: { locateFile: p => new URL("vendor/zxing/" + p, location.href).href } });
          const svg = document.querySelector("#hrBadge .badge-card svg"), xml = new XMLSerializer().serializeToString(svg);
          const img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml); await img.decode();
          const cv = document.createElement("canvas"); cv.width = 400; cv.height = 400;
          const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 400, 400); ctx.drawImage(img, 20, 20, 360, 360);
          const r = await new api.BarcodeDetector({ formats: ["qr_code"] }).detect(cv);
          return r[0] ? r[0].rawValue : "";
        });
        assert(raw === b.text, `printed QR decodes to the badge text: "${raw}" vs "${b.text}"`);
      } finally { await page.close(); }
    });

    for (const lang of ["th", "en", "zh"]) {
      await check(`E (${lang}): storage near full (> 3,500 KB) shows its own warning line in the page language`, async () => {
        const page = await open(lang);
        try {
          assert(await addEmp(page, "E05", "Store Test", "5566"), "employee added");
          await page.evaluate(() => { document.querySelector('.hr-tab[data-h="data"]').click(); });
          const low = await page.evaluate(() => ({ cls: document.querySelector("#hrDataMsg").className, text: document.querySelector("#hrDataMsg").textContent }));
          assert(!NEAR[lang].test(low.text) && !/\bwarn\b/.test(low.cls), "no near-full line on an almost empty device: " + JSON.stringify(low));
          await page.evaluate(() => {
            const e = LQHR.state.emps.find(x => x.code === "E05"), now = Date.now(), P = [];
            for (let i = 0; i < 19000; i++) P.push({ id: "fill-" + i + "-xxxxxxxxxxxxxxxxxxxx", emp: e.id, ts: now - (i + 10) * 1800000, type: i % 2 ? "out" : "in", method: "pin", dev: "dfill000001" });
            localStorage.setItem("att-hr-punches", JSON.stringify(P));
          });
          const size = await page.evaluate(() => localStorage.getItem("att-hr-punches").length * 2 / 1024);
          assert(size > 3500, "filled above 3,500 KB: " + Math.round(size));
          await page.reload();
          await page.waitFor(`window.LQHR && LQI18N.lang === "${lang}"`, 30000);
          await page.evaluate(() => { document.querySelector('.hr-tab[data-h="data"]').click(); });
          const hi = await page.evaluate(() => ({ cls: document.querySelector("#hrDataMsg").className, text: document.querySelector("#hrDataMsg").textContent }));
          assert(NEAR[lang].test(hi.text) && /\bwarn\b/.test(hi.cls), `near-full line in ${lang} with the warning style: ` + JSON.stringify(hi).slice(0, 300));
          if (lang !== "th") assert(!THAI.test(hi.text), "no Thai in the " + lang + " line: " + hi.text.slice(0, 200));
        } finally { await page.close(); }
      });
    }

    for (const [w, h] of [[360, 780], [430, 932]]) {
      await check(`P4: main flow at ${w} px (add employee, PIN clock-in, month summary, payroll CSV), no horizontal scroll, 44 px controls`, async () => {
        const page = await browser.newPage(null, { initScripts: [NO_NATIVE, QR_CAM, HOOKS], isolated: true });
        try {
          await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
          await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
          await page.goto(`${base}/attendance.html?mode=employee&lang=th`);
          await page.evaluate(() => { localStorage.clear(); localStorage.setItem("lq-lang", "th"); });
          await page.reload();
          await page.waitFor("window.LQHR && !!window.__ATT_CORE", 20000);
          const over = async step => { const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); assert(r.sw <= r.cw, `${w}px ${step}: horizontal scroll ${r.sw} > ${r.cw}`); };
          await over("load");
          const big = async (step, sels) => {
            const small = await page.evaluate(sels => sels.map(s => { const el = document.querySelector(s); if (!el || !el.getClientRects().length) return { s, missing: true }; const b = el.getBoundingClientRect(); return { s, h: b.height, right: b.right, vw: innerWidth }; })
              .filter(x => x.missing || x.h < 44 || x.right > x.vw + 1), sels);
            assert(!small.length, `${w}px ${step}: controls missing, under 44 px or off screen: ${JSON.stringify(small)}`);
          };
          await click(page, '.tab[data-t="pin"]');
          await big("PIN pad", ["#hrCode", "#hrPin", "#hrPinForm button[type=submit]", "#hrQrCam"]);
          assert(await addEmp(page, "F06", "Phone Test", "7788"), "employee added");
          await over("employee added");
          const r = await pinPunch(page, "F06", "7788");
          assert(/\bok\b/.test(r.cls), "PIN punch at " + w + ": " + JSON.stringify(r));
          await over("PIN punch");
          await click(page, '.hr-tab[data-h="month"]');
          await sleep(200);
          const row = await page.evaluate(() => (document.querySelector("#hrSumBody").textContent || "").includes("F06"));
          assert(row, "the month summary lists the employee");
          await over("month summary");
          await big("month", ["#hrPayCsv"]);
          await click(page, "#hrPayCsv");
          const f = await blobs(page);
          assert(f.length === 1 && f[0].replace(/^﻿/, "").split("\r\n").length === 2 && /"F06"/.test(f[0]), "payroll CSV with the employee row");
          const errs = page.consoleErrors.filter(e => e.kind !== "log");
          assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
}
