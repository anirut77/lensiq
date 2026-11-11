// tests/e2e/demo-mode.e2e.mjs — sales demo mode (`?demo=1`, "Sellable pack" item 3): a 10-minute demo of Exam (lab mode),
// Attendance (PIN / QR), Gate (assisted: village + parking) and Crowd (events) with NO camera, NO real person and NO customer
// data. FIXED TEST (written before the feature; sha256 locked in ~/LENSIQ-field/evals/demo/locked.sha256).
// For each of exam-lab.html, attendance.html?mode=employee, village.html, parking.html and crowd.html, with ?demo=1:
//   1. a clear, persistent banner #lqSampleBar "โหมดสาธิต: ข้อมูลตัวอย่าง ไม่ใช่ข้อมูลจริง" (EN "Demo mode: sample data, not
//      real data", ZH "演示模式：示例数据，并非真实数据") that stays in the viewport when the page is scrolled;
//   2. the page's normal views are filled with built-in synthetic sample data (invented, clearly fake names such as
//      "ตัวอย่าง 01"); real data already on the device is NEVER shown;
//   3. no network request leaves the origin (and a cross-origin fetch / sendBeacon attempted by the page is refused);
//   4. nothing from the demo is written to the page's real storage: real localStorage and real IndexedDB content are
//      byte-identical after a demo session (demo databases, if any, carry "demo" in their name);
//   5. every download is named SAMPLE…, and a CSV says SAMPLE / ตัวอย่าง in its first line;
//   6. no camera is opened (getUserMedia is never called) and no <img>/<video> appears in the demo UI;
//   7. Gate: auto-open stays off and every plate read waits for the guard's button (nothing is logged by itself);
//      Parking: no PromptPay ID in the demo (no real money destination);
//   8. Crowd: says experimental / not for dense crowds; scenes with small (far) people and with 15+ people show the
//      "people look small" hint and the "≈ estimate" label;
//   9. no emotion, lie, deception or cheating output in the demo UI or the sample views;
//  10. TH / EN / ZH: banner and demo panels fully translated (0 Thai letters outside lang="th"/translate="no" sample data);
//  11. phone: no horizontal overflow at 320 / 360 px; demo controls >= 44 px; demo text >= 12 px;
//  12. without ?demo=1 the page is untouched: no banner, native localStorage / fetch / Blob / indexedDB, real data shown.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const BAR = { th: "โหมดสาธิต: ข้อมูลตัวอย่าง ไม่ใช่ข้อมูลจริง", en: "Demo mode: sample data, not real data", zh: "演示模式：示例数据，并非真实数据" };
const FORBIDDEN = /อารมณ์|สีหน้า|โกหก|หลอกลวง|ทุจริต|emotion|expression|deception|\blie\b|\blying\b|cheat|情绪|表情|谎|欺骗|作弊/i;
const NAME_FAKE = /ตัวอย่าง|SAMPLE|DEMO/i;

const INIT = `
  window.confirm = () => true; window.print = () => {}; window.prompt = () => "test"; window.alert = () => {};
  window.__gum = 0;
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = c => { window.__gum++; return g(c); };
  }
  window.__dl = []; window.__dlBlobs = {};
  (function () {
    const o = URL.createObjectURL.bind(URL);
    URL.createObjectURL = b => { const u = o(b); window.__dlBlobs[u] = b; return u; };
    const c = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.push({ name: this.download, href: this.href }); return; } return c.call(this); };
  })();
  window.__plate = { text: "1กข 2345", conf: 0.97, province: "bangkok" }; window.__LQ_FAKE_PLATE = () => window.__plate;
  window.__relay = []; window.__LQ_RELAY_HOOK = async r => { window.__relay.push(r); return { ok: true, how: "sent" }; };
`;

/* ---------- real data on the device before the demo (must never be shown, must be unchanged afterwards) ---------- */
async function seedReal(page, base) {
  await page.goto(`${base}/requirements.txt`);
  await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem("att-hr-emps", JSON.stringify([{ id: "eREAL1", code: "REAL-1", name: "REALNAME-ONE", dept: "REALDEPT", shift: "day", created: 1, qr: "realqrtoken0000000000" }]));
    localStorage.setItem("att-hr-settings", JSON.stringify({ mode: "training", dev: "drealdevice0001" }));
    localStorage.setItem("att-logs", JSON.stringify([{ pid: "pR", name: "REALNAME-TWO", code: "REAL-2", session: "REALSESSION", date: "2026-01-02", time: "09:00" }]));
    localStorage.setItem("lq-exam-lab", JSON.stringify({ room: "REALROOM", seat: "77" }));
    localStorage.setItem("lq-exam-lab-log", JSON.stringify([{ t: 1700000000000, sig: "away", lvl: "watch", id: "e1-real" }]));
    localStorage.setItem("lq-gate-village-cfg", JSON.stringify({ operator: "REALGUARD" }));
    localStorage.setItem("lq-gate-parking-cfg", JSON.stringify({ operator: "REALGUARD", siteName: "REALSITE" }));
    localStorage.setItem("lqcr-ack", JSON.stringify({ at: 1 }));
    const poly = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }, { x: 0.1, y: 0.9 }];
    localStorage.setItem("lqcr-zones", JSON.stringify([{ id: "zr", name: "REALZONE", role: "area", cap: 0, area: 0, poly }]));
    localStorage.setItem("lq-lang", "th");
    const put = (name, recs) => new Promise((res, rej) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("rec")) r.result.createObjectStore("rec", { keyPath: "id" }); };
      r.onerror = () => rej(r.error);
      r.onsuccess = () => {
        const db = r.result, t = db.transaction("rec", "readwrite");
        for (const x of recs) t.objectStore("rec").put(x);
        t.oncomplete = () => { db.close(); res(); }; t.onerror = () => rej(t.error);
      };
    });
    await put("lq-gate-village", [{ id: "res-real", kind: "res", at: 1, house: "REALHOUSE", key: "ฮฮ9999", province: "" }]);
    await put("lq-gate-parking", [{ id: "ev-real", kind: "ev", at: Date.now() - 3600000, dir: "in", key: "ฮฮ8888", province: "", by: "REALGUARD" }]);
  });
}
async function snapshot(page, base) {
  await page.goto(`${base}/requirements.txt`);
  return page.evaluate(async () => {
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
    const dbs = {};
    for (const d of await indexedDB.databases()) {
      const db = await new Promise((res, rej) => { const r = indexedDB.open(d.name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const stores = {};
      for (const s of db.objectStoreNames) {
        stores[s] = await new Promise(res => {
          const q = db.transaction(s).objectStore(s).getAll();
          q.onsuccess = () => { try { res(JSON.stringify(q.result)); } catch { res("unserialisable:" + q.result.length); } };
          q.onerror = () => res("ERR");
        });
      }
      db.close(); dbs[d.name] = stores;
    }
    return { ls, dbs };
  });
}
function sameStorage(before, after, label) {
  const lb = JSON.stringify(Object.keys(before.ls).sort().map(k => [k, before.ls[k]]));
  const la = JSON.stringify(Object.keys(after.ls).sort().map(k => [k, after.ls[k]]));
  assert(lb === la, `${label}: real localStorage changed by the demo\n before ${lb.slice(0, 600)}\n after  ${la.slice(0, 600)}`);
  for (const name of Object.keys(before.dbs)) {
    assert(name in after.dbs, `${label}: real IndexedDB "${name}" disappeared`);
    assert(JSON.stringify(before.dbs[name]) === JSON.stringify(after.dbs[name]), `${label}: real IndexedDB "${name}" changed: ${JSON.stringify(after.dbs[name]).slice(0, 400)}`);
  }
  for (const name of Object.keys(after.dbs)) if (!(name in before.dbs)) assert(/demo/i.test(name), `${label}: the demo created a non-demo IndexedDB "${name}"`);
}

/* ---------- common demo checks ---------- */
async function openDemo(page, url) {
  await page.goto(url);
  await page.waitFor(`document.querySelector("#lqSampleBar") && document.querySelector("#lqSampleBar").innerText.trim().length > 0`, 10000);
}
async function barCheck(page, lang = "th") {
  const r = await page.evaluate(async () => {
    const bar = document.querySelector("#lqSampleBar");
    const inView = () => {
      const b = bar.getBoundingClientRect(), s = getComputedStyle(bar);
      return s.display !== "none" && s.visibility !== "hidden" && b.height > 0 && b.top >= 0 && b.bottom <= innerHeight + 0.5;
    };
    window.scrollTo(0, 0); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const top = inView();
    window.scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const bottom = inView();
    window.scrollTo(0, 0);
    return { text: bar.innerText.replace(/\s+/g, " ").trim(), top, bottom };
  });
  assert(r.text.includes(BAR[lang]), `banner text (${lang}) "${r.text}" should contain "${BAR[lang]}"`);
  assert(r.top && r.bottom, "banner must stay in view at the top and the bottom of the page " + JSON.stringify(r));
}
async function networkCheck(page, base) {
  const refused = await page.evaluate(async () => {
    let fetchRefused = false;
    try { await fetch("https://example.com/lensiq-demo-probe", { mode: "no-cors" }); } catch { fetchRefused = true; }
    let beacon = true;
    try { beacon = navigator.sendBeacon("https://example.com/lensiq-demo-probe", "x"); } catch { beacon = false; }
    return { fetchRefused, beacon };
  });
  assert(refused.fetchRefused && refused.beacon === false, "a cross-origin fetch / sendBeacon must be refused in demo mode " + JSON.stringify(refused));
  const origin = new URL(base).origin;
  const out = page.requests.filter(r => !/^(data|blob|about|chrome-extension):/.test(r.url) && (() => { try { return new URL(r.url).origin !== origin; } catch { return true; } })());
  assert(!out.length, "requests left the origin: " + out.map(r => r.url).slice(0, 5).join(", "));
  const api = page.requests.filter(r => { try { return new URL(r.url).pathname.startsWith("/api/"); } catch { return false; } });
  assert(!api.length, "/api/ requests in demo mode: " + api.map(r => r.url).join(", "));
}
async function noCameraNoImages(page) {
  const r = await page.evaluate(() => ({ gum: window.__gum, media: document.querySelectorAll("[data-lq-demo] img, [data-lq-demo] video, #lqSampleBar img").length }));
  assert(r.gum === 0, "the demo must not open a camera (getUserMedia calls: " + r.gum + ")");
  assert(r.media === 0, "no images / video in the demo UI");
}
async function forbiddenCheck(page, sels) {
  const text = await page.evaluate(sels => [...document.querySelectorAll(["#lqSampleBar", "[data-lq-demo]", ...sels].join(","))].map(e => e.innerText || e.textContent || "").join("\n"), sels);
  const m = FORBIDDEN.exec(text);
  assert(!m, `emotion / lie / deception / cheating wording in the demo output: "${m && text.slice(Math.max(0, m.index - 40), m.index + 40)}"`);
}
async function noRealData(page, words) {
  const all = await page.evaluate(() => document.body.innerText + " " + [...document.querySelectorAll("input,select,textarea")].map(e => e.value).join(" "));
  for (const w of words) assert(!all.includes(w), `real data "${w}" is shown in demo mode`);
}
async function lastDownload(page) {
  return page.evaluate(async () => {
    const d = window.__dl[window.__dl.length - 1]; if (!d) return null;
    const b = window.__dlBlobs[d.href];
    return { name: d.name, text: b ? await b.text() : null, n: window.__dl.length };
  });
}
function csvLabelled(dl, what) {
  assert(dl && dl.text != null, what + ": no CSV download captured");
  assert(/SAMPLE/i.test(dl.name), what + ": file name must say SAMPLE: " + dl.name);
  const first = dl.text.replace(/^﻿/, "").split(/\r?\n/)[0];
  assert(/SAMPLE/.test(first) && /ตัวอย่าง/.test(first), what + ": first CSV line must say SAMPLE / ตัวอย่าง: " + first.slice(0, 160));
}
async function langCheck(page) {
  for (const lang of ["en", "zh", "th"]) {
    await page.evaluate(l => window.LQI18N.setLang(l), lang);
    await page.waitFor(`document.querySelector("#lqSampleBar").innerText.includes(${JSON.stringify(BAR[lang])})`, 10000);
    await sleep(150);
    if (lang === "th") break;
    const thai = await page.evaluate(l => [...document.querySelectorAll("#lqSampleBar, [data-lq-demo]")].map(e => {
      const c = window.LQI18N.coverage(e, { all: true, lang: l, top: 3 });
      return { thai: c.thai, top: (c.top || []).map(t => t.text.slice(0, 40)) };
    }), lang);
    for (const t of thai) assert(t.thai === 0, `${lang}: Thai left in the demo UI: ${JSON.stringify(t.top)}`);
  }
}
async function phoneCheck(page) {
  for (const w of [320, 360]) {
    await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 780, deviceScaleFactor: 1, mobile: true });
    await sleep(400);
    const r = await page.evaluate(() => {
      const de = document.documentElement, bad = [], tiny = [];
      const vis = e => {
        const s = getComputedStyle(e), b = e.getBoundingClientRect();
        return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0 && !e.closest("[hidden]");
      };
      for (const e of document.querySelectorAll("#lqSampleBar :is(button,a[href],select,input), [data-lq-demo] :is(button,a[href],select,input,summary)")) {
        if (!vis(e)) continue;
        const b = e.getBoundingClientRect();
        if (b.width < 43.5 || b.height < 43.5) bad.push(`${e.tagName} "${(e.textContent || "").trim().slice(0, 20)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
      }
      for (const host of document.querySelectorAll("#lqSampleBar, [data-lq-demo]")) {
        const tw = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
        for (let n = tw.nextNode(); n; n = tw.nextNode()) {
          if (!n.nodeValue.trim() || !n.parentElement || !vis(n.parentElement)) continue;
          const fs = parseFloat(getComputedStyle(n.parentElement).fontSize);
          if (fs < 11.95) tiny.push(`${fs}px "${n.nodeValue.trim().slice(0, 20)}"`);
        }
      }
      return { sw: de.scrollWidth, cw: de.clientWidth, bad, tiny };
    });
    assert(r.sw <= r.cw, `${w}px: horizontal overflow ${r.sw} > ${r.cw}`);
    assert(!r.bad.length, `${w}px: demo controls under 44 px: ${r.bad.join(" | ")}`);
    assert(!r.tiny.length, `${w}px: demo text under 12 px: ${r.tiny.join(" | ")}`);
  }
  await page.send("Emulation.clearDeviceMetricsOverride", {});
}
async function ackGate(page) {
  await page.evaluate(() => {
    document.querySelector("#gkOp").value = "ยามตัวอย่าง";
    document.querySelector("#gkAck1").click(); document.querySelector("#gkAck2").click(); document.querySelector("#gkAckBtn").click();
  });
}
function noExceptions(page) {
  const ex = page.consoleErrors.filter(e => e.kind === "exception");
  assert(!ex.length, "page exceptions: " + JSON.stringify(ex.slice(0, 3)));
}
async function untouchedWithoutDemo(page, url, realSel, realWord) {
  await page.goto(url);
  await sleep(800);
  const r = await page.evaluate((sel) => ({
    bar: !!document.querySelector("#lqSampleBar"), panel: !!document.querySelector("[data-lq-demo]"),
    demoOn: !!(window.LQDemo && window.LQDemo.on),
    ls: localStorage instanceof Storage, ss: sessionStorage instanceof Storage,
    natives: [fetch, Blob, indexedDB.open, XMLHttpRequest.prototype.open, navigator.sendBeacon].every(f => /\[native code\]/.test(Function.prototype.toString.call(f))),
    bc: typeof BroadcastChannel === "undefined" || /\[native code\]/.test(Function.prototype.toString.call(BroadcastChannel)),
    real: sel ? (document.querySelector(sel) || {}).textContent || (document.querySelector(sel) || {}).value || "" : ""
  }), realSel);
  assert(!r.bar && !r.panel && !r.demoOn, "without ?demo=1 there is no demo banner / panel " + JSON.stringify(r));
  assert(r.ls && r.ss && r.natives && r.bc, "without ?demo=1 storage / fetch / Blob / indexedDB / BroadcastChannel are the browser's own " + JSON.stringify(r));
  if (realWord) assert(r.real.includes(realWord), `without ?demo=1 the real data "${realWord}" is shown again (${realSel}: "${r.real.slice(0, 80)}")`);
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  // demo(page): the demo session; then real storage must be byte-identical; then real(page): the page without ?demo=1
  const session = async (name, demo, real) => check(name, async () => {
    const page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}", INIT], isolated: true });
    try {
      await seedReal(page, base);
      const before = await snapshot(page, base);
      page.requests.length = 0;
      await demo(page);
      noExceptions(page);
      const after = await snapshot(page, base);
      sameStorage(before, after, name);
      await real(page);
    } finally { await page.close(); }
  });
  try {
    /* ------------------------------------------------------------ Exam (lab mode) */
    await session("exam-lab ?demo=1: camera-free sample session, sample log, simulated events, SAMPLE export, real data untouched", async page => {
      await openDemo(page, `${base}/exam-lab.html?demo=1`);
      await barCheck(page);
      const r0 = await page.evaluate(() => ({
        own: [...document.querySelectorAll("#ownLog li:not(.empty)")].length, room: document.querySelector("#room").value,
        sigs: document.querySelectorAll("[data-lq-demo] [data-demo-sig]").length
      }));
      assert(r0.own >= 3, "sample events shown in the candidate's own log: " + r0.own);
      assert(r0.room !== "REALROOM", "real room code not shown");
      assert(r0.sigs >= 3, "demo panel offers simulated events: " + r0.sigs);
      await noRealData(page, ["REALROOM"]);
      await page.evaluate(() => {
        if (!document.querySelector("#room").value) document.querySelector("#room").value = "DEMO1";
        if (!document.querySelector("#seat").value) document.querySelector("#seat").value = "S01";
        const c = document.querySelector("#consent"); if (!c.checked) c.click();
        document.querySelector("#toCam").click();
      });
      await page.waitFor(`window.__LQ_EXAM_LAB && window.__LQ_EXAM_LAB.phase === "exam"`, 10000);
      assert(await page.evaluate(() => !document.querySelector("#monitor").hidden), "monitoring indicator shown in the sample session");
      const n0 = await page.evaluate(() => window.__LQ_EXAM_LAB.own.length);
      await page.evaluate(() => document.querySelector("[data-lq-demo] [data-demo-sig]").click());
      await page.waitFor(`window.__LQ_EXAM_LAB.own.length === ${n0 + 1} && !document.querySelector("#prompt").hidden`, 5000);
      await page.evaluate(() => document.querySelector("#exportOwn").click());
      const dl = await lastDownload(page);
      assert(dl && /SAMPLE/i.test(dl.name), "exported log is named SAMPLE: " + (dl && dl.name));
      await noCameraNoImages(page);
      await forbiddenCheck(page, ["#ownLog", "#prompt"]);
      await networkCheck(page, base);
      await langCheck(page);
      await phoneCheck(page);
    }, page => untouchedWithoutDemo(page, `${base}/exam-lab.html`, "#room", "REALROOM"));

    /* ------------------------------------------------------------ Attendance (PIN / QR, employee mode) */
    await session("attendance ?mode=employee&demo=1: 8 sample employees, a month of punches, month summary, SAMPLE payroll CSV", async page => {
      await openDemo(page, `${base}/attendance.html?mode=employee&demo=1`);
      await barCheck(page);
      await page.waitFor(`document.body.classList.contains("att-emp") && document.querySelectorAll("#hrEmpBody tr").length === 8`, 10000);
      const names = await page.evaluate(() => [...document.querySelectorAll("#hrEmpBody tr")].map(tr => tr.children[1].textContent.trim()));
      assert(names.length === 8 && names.every(n => NAME_FAKE.test(n)), "8 clearly fake sample employees: " + names.join(", "));
      await noRealData(page, ["REALNAME-ONE", "REALNAME-TWO", "REALDEPT", "REAL-1"]);
      const rows = await page.evaluate(() => {
        document.querySelector('.hr-tab[data-h="month"]').click();
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
        const m = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        const el = document.querySelector("#hrMonth"); el.value = m; el.dispatchEvent(new Event("change", { bubbles: true }));
        return [...document.querySelectorAll("#hrSumBody tr")].map(tr => tr.children[3] ? tr.children[3].textContent : "");
      });
      assert(rows.length === 8, "month summary has 8 rows: " + rows.length);
      assert(rows.filter(t => +String(t).split("/")[0] > 0).length >= 6, "the previous month has punches for most sample employees: " + rows.join(" "));
      await page.evaluate(() => document.querySelector("#hrPayCsv").click());
      const dl = await lastDownload(page);
      csvLabelled(dl, "payroll CSV");
      assert(/ตัวอย่าง 01/.test(dl.text) && !/REALNAME/.test(dl.text), "payroll CSV holds the sample employees only");
      await noCameraNoImages(page);
      await forbiddenCheck(page, ["#hrEmpBody", "#hrSumBody", "#hrMonthNote"]);
      await networkCheck(page, base);
      await langCheck(page);
      await phoneCheck(page);
    }, page => untouchedWithoutDemo(page, `${base}/attendance.html?mode=employee`, "#hrEmpBody", "REALNAME-ONE"));

    /* ------------------------------------------------------------ Gate: village (assisted) */
    await session("village ?demo=1: sample houses, cars, visitor pass, deny list; every read waits for the guard; SAMPLE CSV", async page => {
      await openDemo(page, `${base}/village.html?demo=1&cpu&fakedet`);
      await barCheck(page);
      await page.waitFor(`window.__LQ_VG && window.__LQ_VG.residents().length >= 3 && window.__LQ_VG.store.list("deny").length >= 1 && window.__LQ_VG.store.list("pass").some(p => p.key)`, 10000);
      const s = await page.evaluate(() => ({
        houses: window.__LQ_VG.residents().map(h => h.house), auto: window.__LQ_VG.kit.cfg().autoOpen,
        res: window.__LQ_VG.residents()[0].plates[0], deny: window.__LQ_VG.store.list("deny")[0], pass: window.__LQ_VG.store.list("pass").find(p => p.key),
        evs: window.__LQ_VG.store.list("ev").length
      }));
      assert(!s.houses.includes("REALHOUSE"), "real resident list not shown: " + s.houses);
      assert(!s.auto || s.auto.on === false, "auto-open is off in the demo " + JSON.stringify(s.auto));
      await noRealData(page, ["REALHOUSE", "REALGUARD"]);
      await page.waitFor(`document.querySelector("#gkAck1")`, 8000);
      await ackGate(page);
      await page.evaluate(() => document.querySelector("#gkDemoBtn").click());
      await page.waitFor(`!document.querySelector("#gkReadBtn").disabled`, 8000);
      const read = async (key, province) => {
        await page.evaluate((k, p) => { window.__plate = { text: window.LQPlate.format(k), conf: 0.99, province: p || "" }; }, key, province);
        await page.evaluate(() => document.querySelector("#gkReadBtn").click());
        await page.waitFor(`document.querySelector("#gkPlate").value !== "" && window.__LQ_VG.kit.lane.read && !window.__LQ_VG.kit.lane.busy`, 8000);
        await sleep(80);
        return page.evaluate(() => { const b = document.querySelector("#gkExtra .gk-banner"); return b ? b.dataset.s : null; });
      };
      assert((await read(s.res.key, s.res.province)) === "resident", "sample resident car -> resident");
      assert((await page.evaluate(() => window.__LQ_VG.store.list("ev").length)) === s.evs && (await page.evaluate(() => window.__relay.length)) === 0, "a read is never logged or opened by itself");
      await page.evaluate(() => document.querySelector('[data-act="open"]').click());
      await sleep(150);
      const e = await page.evaluate(() => window.__LQ_VG.store.list("ev"));
      assert(e.length === s.evs + 1 && e[e.length - 1].how === "guard", "the guard's button logs the event " + JSON.stringify(e[e.length - 1]));
      assert((await read(s.deny.key, s.deny.province)) === "deny", "sample deny-list car -> deny");
      assert((await read(s.pass.key, s.pass.province)) === "visitor", "sample visitor car -> visitor pass");
      assert((await read("ฮฮ1234", "")) === "unknown", "unlisted car -> unknown");
      assert((await page.evaluate(() => window.__LQ_VG.store.list("ev").length)) === s.evs + 1, "reads without the guard's button log nothing");
      await page.evaluate(() => { document.querySelector("#t-log").click(); document.querySelector("#vgCsv").click(); });
      csvLabelled(await lastDownload(page), "village CSV");
      await page.evaluate(() => document.querySelector("#t-gate").click());
      await noCameraNoImages(page);
      await forbiddenCheck(page, ["#vgResBody", "#vgVisBody", "#vgDenyList", "#vgLogBody", "#gkExtra"]);
      await networkCheck(page, base);
      await langCheck(page);
      await phoneCheck(page);
    }, async page => {
      await untouchedWithoutDemo(page, `${base}/village.html`, null, null);
      await page.waitFor(`window.__LQ_VG && window.__LQ_VG.residents().some(h => h.house === "REALHOUSE")`, 8000);
    });

    /* ------------------------------------------------------------ Gate: parking */
    await session("parking ?demo=1: fee rules, shop stamps and parked cars preloaded; exit fee after the guard confirms; no PromptPay ID; SAMPLE CSV", async page => {
      await openDemo(page, `${base}/parking.html?demo=1&cpu&fakedet`);
      await barCheck(page);
      await page.waitFor(`window.__LQ_PK && window.LQGateRules.occupancy(window.__LQ_PK.store.list("ev")).length >= 3 && window.__LQ_PK.shopList().length >= 2`, 10000);
      const s = await page.evaluate(() => ({
        lot: window.LQGateRules.occupancy(window.__LQ_PK.store.list("ev")), cfg: window.__LQ_PK.kit.cfg(),
        stamps: [...document.querySelectorAll("[data-lq-demo] [data-demo-stamp]")].map(b => b.dataset.demoStamp || b.textContent.trim())
      }));
      assert(!s.lot.some(e => e.key === "ฮฮ8888"), "real parked car not shown");
      assert(!s.cfg.ppId, "no PromptPay ID in the demo (no real money destination): " + s.cfg.ppId);
      assert(s.stamps.length >= 1, "demo panel lists sample shop stamp codes");
      await noRealData(page, ["REALSITE", "REALGUARD", "ฮฮ 8888"]);
      await page.waitFor(`document.querySelector("#gkAck1")`, 8000);
      await ackGate(page);
      await page.evaluate(() => document.querySelector("#gkDemoBtn").click());
      await page.waitFor(`!document.querySelector("#gkReadBtn").disabled`, 8000);
      const car = s.lot[0], n0 = await page.evaluate(() => window.__LQ_PK.store.list("ev").length);
      await page.evaluate((k, p) => { window.__plate = { text: window.LQPlate.format(k), conf: 0.99, province: p || "" }; }, car.key, car.province);
      await page.evaluate(() => document.querySelector("#gkReadBtn").click());
      await page.waitFor(`document.querySelector("#gkPlate").value !== "" && window.__LQ_PK.kit.lane.read && !window.__LQ_PK.kit.lane.busy`, 8000);
      await sleep(80);
      assert((await page.evaluate(() => window.__LQ_PK.store.list("ev").length)) === n0, "a read is never recorded by itself");
      await page.evaluate(() => document.querySelector('[data-act="out"]').click());
      await page.waitFor(`!document.querySelector("#pkPay").hidden && document.querySelector("#pkFee").textContent.trim() !== ""`, 5000);
      assert(await page.evaluate(() => !!window.__LQ_PK.pay.entry), "the exit is paired with the sample entry");
      await page.evaluate(code => { document.querySelector("#pkStamp").value = code; document.querySelector("#pkStampBtn").click(); }, s.stamps[0]);
      const sm = await page.evaluate(() => ({ kind: document.querySelector("#pkStampMsg").dataset.kind, text: document.querySelector("#pkStampMsg").textContent }));
      assert(sm.kind === "ok", "a sample shop stamp code is accepted: " + sm.text);
      await page.evaluate(() => document.querySelector("#pkPayCancel").click());
      await page.evaluate(() => { document.querySelector("#t-log").click(); document.querySelector("#pkCsv").click(); });
      csvLabelled(await lastDownload(page), "parking CSV");
      await page.evaluate(() => document.querySelector("#t-lane").click());
      await noCameraNoImages(page);
      await forbiddenCheck(page, ["#pkLotBody", "#pkLogBody", "#pkSpList", "#pkMpList", "#gkExtra"]);
      await networkCheck(page, base);
      await langCheck(page);
      await phoneCheck(page);
    }, async page => {
      await untouchedWithoutDemo(page, `${base}/parking.html`, null, null);
      await page.waitFor(`window.__LQ_PK && window.LQGateRules.occupancy(window.__LQ_PK.store.list("ev")).some(e => e.key === "ฮฮ8888")`, 8000);
    });

    /* ------------------------------------------------------------ Crowd (events) */
    await session("crowd ?demo=1: starts without a camera, experimental / not for dense crowds, small-people and 15+ scenes show both warnings, SAMPLE CSV", async page => {
      await openDemo(page, `${base}/crowd.html?demo=1`);
      await barCheck(page);
      await page.waitFor(`window.__LQZ && window.__LQZ.zc.running && window.__LQZ.zc.demo`, 10000);
      const panel = await page.evaluate(() => [...document.querySelectorAll("[data-lq-demo]")].map(e => e.innerText).join(" "));
      assert(/ทดลอง/.test(panel) && /ฝูงชนหนาแน่น/.test(panel), "demo panel says experimental, not for dense crowds: " + panel.slice(0, 200));
      await noRealData(page, ["REALZONE"]);
      const scenes = await page.evaluate(() => [...document.querySelectorAll("[data-lq-demo] [data-demo-scene]")].map(b => b.dataset.demoScene));
      assert(scenes.includes("small") && scenes.includes("crowd"), "scenes offered: " + scenes);
      // the start scene shows both warnings at once
      await page.waitFor(`!document.querySelector("#crQual").hidden && /ตัวเล็ก/.test(document.querySelector("#crQual").textContent) && /≈/.test(document.querySelector("#tiles").textContent)`, 20000);
      await page.evaluate(() => document.querySelector('[data-lq-demo] [data-demo-scene="crowd"]').click());
      await page.waitFor(`/≈/.test(document.querySelector("#tiles").textContent) && /ค่าประมาณ/.test(document.querySelector("#crQual").textContent)`, 20000);
      await page.evaluate(() => document.querySelector('[data-lq-demo] [data-demo-scene="small"]').click());
      await page.waitFor(`/ตัวเล็ก/.test(document.querySelector("#crQual").textContent)`, 20000);
      await page.evaluate(() => document.querySelector("#exportCsv").click());
      csvLabelled(await lastDownload(page), "crowd CSV");
      await noCameraNoImages(page);
      await forbiddenCheck(page, ["#tiles", "#zoneState", "#crQual"]);
      await networkCheck(page, base);
      await langCheck(page);
      await phoneCheck(page);
    }, async page => {
      await untouchedWithoutDemo(page, `${base}/crowd.html`, null, null);
      assert(await page.evaluate(() => !(window.__LQZ && window.__LQZ.zc.running)), "without ?demo=1 nothing starts by itself");
    });
  } finally {
    await browser.close();
  }
}
