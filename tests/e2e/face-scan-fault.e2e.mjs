// tests/e2e/face-scan-fault.e2e.mjs — FIXED TEST (faceread-ios round 2, independent review 2026-11-15), locked
// (~/LENSIQ-field/evals/faceread-ios/locked.sha256) before the product change.
// attendance.html and customers.html scan with LQDetect.detectFacesCascade (face-api). When the detector throws or never
// returns, the scan must not freeze silently with the camera on. RULE: within the limit the page stops scanning and shows
// a plain line in the page language that says scanning stopped:
//   TH  "หยุดสแกน" and no technical text (Error / Timeout / undefined)
//   ZH / EN  the same line translated: no Thai letters left, Chinese text / the word "stopped"
// Faults are injected on faceapi.nets.tinyFaceDetector.locateFaces (every face-api detection goes through it), with
// ?fakedet and window.__LQ_FAKE_DET returning null so the page takes its real detector path.
//   attendance  throws (TH, ZH) 15 s · never returns (TH) 30 s     customers  throws (TH, EN) 15 s
// Headless Chrome, fake camera (tests/e2e/fake-cams.js); synthetic, no person.
import { assert } from "./cdp.mjs";

const D = v => Array.from({ length: 128 }, (_, k) => +(Math.sin(k * v) * 0.1).toFixed(5));
const NOW = Date.now();
const PEOPLE = [{ id: "pA", name: "สมชาย ทดสอบ", code: "A01", descriptor: D(1) }];
const MEMBERS = [{ id: "mA", name: "แอน", phone: "0811111111", descriptor: D(1), created: NOW, consentAt: NOW }];
const HOOKS = "window.__LQ_FAKE_DET = () => null;";
const THAI = /[฀-๿]/;
const TECH = /Error|Timeout|undefined/;

const THROW = () => { window.faceapi.nets.tinyFaceDetector.locateFaces = () => { throw new Error("simulated detector failure"); }; return true; };
const HANG = () => { window.faceapi.nets.tinyFaceDetector.locateFaces = () => new Promise(() => { /* never */ }); return true; };

/** polls fn(page) until it returns a truthy value or ms passes; returns the last value */
async function poll(fn, ms) {
  const end = Date.now() + ms; let v;
  while (Date.now() < end) { v = await fn(); if (v && v.done) return v; await new Promise(r => setTimeout(r, 250)); }
  return v;
}
const plain = (lang, t) => lang === "th" ? /หยุดสแกน/.test(t) && !TECH.test(t)
  : lang === "zh" ? !THAI.test(t) && /[一-鿿]/.test(t) && !TECH.test(t) : !THAI.test(t) && /stopped/i.test(t) && !TECH.test(t);

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    const attendance = async (lang, fault, ms, label) => check(`attendance (${lang}): detector ${label} -> scanning stops with a plain line within ${ms / 1000} s`, async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams, HOOKS] });
      try {
        await page.goto(`${base}/attendance.html?cpu&fakedet`);
        await page.evaluate(([p, l]) => { localStorage.clear(); localStorage.setItem("att-people", JSON.stringify(p)); localStorage.setItem("lq-lang", l); }, [PEOPLE, lang]);
        await page.reload();
        await page.waitFor("ready === true && people.length === 1 && !!window.faceapi", 20000);
        await page.evaluate(() => { const el = document.querySelector("#session"); el.value = "รอบทดสอบ"; el.dispatchEvent(new Event("input")); });
        assert(await page.evaluate(fault), "fault injected");
        assert(await page.evaluate(() => { if (!scanning) document.querySelector("#startScan").click(); return scanning; }), "scanning started");
        const v = await poll(async () => {
          const s = await page.evaluate(() => ({ scanning, text: document.querySelector("#scanMsg").textContent.trim(), err: document.querySelector("#scanMsg").classList.contains("err") }));
          return Object.assign(s, { done: !s.scanning && s.err && plain(lang, s.text) });
        }, ms);
        assert(v && v.done, `attendance ${lang} ${label}: no plain stop line within ${ms / 1000} s — ${JSON.stringify(v)}`);
      } finally { await page.close(); }
    });
    await attendance("th", THROW, 15000, "throws");
    await attendance("zh", THROW, 15000, "throws");
    await attendance("th", HANG, 30000, "never returns");

    for (const lang of ["th", "en"]) {
      await check(`customers (${lang}): detector throws -> scanning stops with a plain line within 15 s`, async () => {
        const page = await browser.newPage(null, { initScripts: [fakeCams, HOOKS] });
        try {
          await page.goto(`${base}/customers.html?cpu&fakedet`);
          await page.evaluate(([m, l]) => { localStorage.clear(); localStorage.setItem("cx-members", JSON.stringify(m)); localStorage.setItem("lq-lang", l); }, [MEMBERS, lang]);
          await page.reload();
          await page.waitFor(() => !!window.faceapi && document.querySelector("#engine").classList.contains("ok"), 20000);
          assert(await page.evaluate(THROW), "fault injected");
          await page.evaluate(() => document.querySelector("#nextCustomer").click()); // resets the customer and starts scanning
          const start = await page.evaluate(() => document.querySelector("#scanToggle").textContent);
          const v = await poll(async () => {
            const s = await page.evaluate(() => ({ btn: document.querySelector("#scanToggle").textContent.trim(), text: document.querySelector("#scanStatus").textContent.trim() }));
            return Object.assign(s, { done: s.btn !== start && plain(lang, s.text) });
          }, 15000);
          assert(v && v.done, `customers ${lang}: no plain stop line within 15 s (scan button "${start}") — ${JSON.stringify(v)}`);
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
}
