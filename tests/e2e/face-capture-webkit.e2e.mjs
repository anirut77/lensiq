// tests/e2e/face-capture-webkit.e2e.mjs — FACE CAPTURE REDESIGN on the iOS engine (owner order 2026-11-16, item A7: iPhone
// WebKit and Android Chrome, 360-430 px). FIXED TEST, locked in ~/LENSIQ-field/evals/face-capture/ before the page was built.
// Playwright WebKit, iPhone 13 profile (390 px, touch, mobile UA) and the same phone at 360 and 430 px; faceread.html?cpu&fakedet;
// a fake front + back camera showing a SYNTHETIC face (face-model.js + face-capture-cam.js; no photo, no person).
//   1 390 px: oval grey when far, green at 35 cm, count 3-2-1, automatic capture; nothing leaves the page
//   2 rear camera: consent line + tick before the back camera opens, wording for the person holding the phone (TH)
//   3 360 and 430 px: no horizontal scroll with the camera on, in both modes
// Pass rule of tests/e2e/phone-kit.mjs too: no page error, no crash, no reload, no horizontal overflow.
// Source: synthetic, Playwright WebKit on macOS; not a real iPhone.
import { readFileSync } from "node:fs";
import { assert } from "./cdp.mjs";
import { IPHONE, MD_SHIM, flow, launchWebKit, passRule, sleep, waitFor } from "./phone-kit.mjs";

const MODEL = readFileSync(new URL("../fixtures/face-capture/face-model.js", import.meta.url), "utf8");
const CAM = readFileSync(new URL("./face-capture-cam.js", import.meta.url), "utf8");
const TH = { far: "ไกลไป ขยับเข้ามาใกล้อีกนิด", ok: "ดีแล้ว อยู่นิ่ง ๆ" };
const TH_OTHER = { far: "ขยับโทรศัพท์เข้าไปใกล้อีกนิด" };
const CONSENT_TH = /ถ่ายภาพคนอื่นได้เฉพาะเมื่อเจ้าตัวรู้และยินยอมแล้ว.*ไม่ถูกบันทึกและไม่ถูกส่งออกจากเครื่อง/;
const FAR = { profile: "iphone-front-16x9", d: 900 }, OK = { profile: "iphone-front-16x9", d: 350 };

const hintIs = (page, state, text, ms = 10000) => waitFor(page, ([s, t]) => {
  const e = document.getElementById("frHint");
  return !!e && e.dataset.state === s && e.querySelector(".lq-chint-tx").textContent === t;
}, [state, text], ms);
const stats = page => page.evaluate(() => { try { return (JSON.parse(localStorage.getItem("fr-stats")) || {}).total || 0; } catch (e) { return 0; } });

export default async function ({ base, check }) {
  const browser = await launchWebKit();
  try {
    await flow(check, browser, "face capture: grey -> green -> 3-2-1 -> automatic capture, nothing leaves the page", `${base}/faceread.html?cpu&fakedet`,
      { init: [MD_SHIM, MODEL, CAM], expectCam: false }, async ({ page }) => {
        const reqs = [];
        page.on("request", r => reqs.push({ m: r.method(), u: r.url() }));
        await page.evaluate(s => window.__FC.set(s), FAR);
        await page.locator("#frStartCam").tap();
        await waitFor(page, () => !document.getElementById("frRead").hidden && !!document.querySelector("#frCam.live"), null, 15000);
        await hintIs(page, "far", TH.far);
        assert(await page.evaluate(() => document.getElementById("frCam").getAttribute("data-guide")) === "grey", "grey oval when far");
        const t0 = await stats(page);
        await page.evaluate(s => window.__FC.set(s), OK);
        await hintIs(page, "ok", TH.ok);
        assert(await page.evaluate(() => document.getElementById("frCam").getAttribute("data-guide")) === "green", "green oval at 35 cm");
        const seen = [], end = Date.now() + 10000;
        let fired = false;
        while (Date.now() < end && !fired) {
          const c = await page.evaluate(() => { const e = document.getElementById("frCount"); return e.hidden ? "" : e.textContent.trim(); });
          if (/^[123]$/.test(c) && seen[seen.length - 1] !== c) seen.push(c);
          fired = (await stats(page)) > t0; await sleep(40);
        }
        assert(fired && seen.join("") === "321", "3-2-1 then capture: " + JSON.stringify({ fired, seen }));
        await waitFor(page, () => !document.getElementById("frResult").hidden, null, 10000);
        const origin = new URL(base).origin;
        const bad = reqs.filter(r => !/^(data|blob):/.test(r.u) && (r.m !== "GET" || new URL(r.u).origin !== origin || /^\/api\/(?![a-z]+\/status$)/.test(new URL(r.u).pathname)));
        assert(!bad.length, "requests leaving the page: " + JSON.stringify(bad.slice(0, 3)));
        const store = await page.evaluate(() => Object.keys(localStorage).filter(k => /data:image|blob:/i.test(localStorage.getItem(k) || "") || (localStorage.getItem(k) || "").length > 4096));
        assert(!store.length, "image-like storage: " + store.join(","));
      });

    await flow(check, browser, "face capture: rear camera needs the consent tick; wording for the person holding the phone", `${base}/faceread.html?cpu&fakedet`,
      { init: [MD_SHIM, MODEL, CAM], expectCam: false }, async ({ page }) => {
        await page.locator("#frModeOther").tap();
        const c = await page.evaluate(() => ({ line: document.getElementById("frConsentLine").textContent, shown: !document.getElementById("frConsent").hidden,
          start: document.getElementById("frStartCam").disabled }));
        assert(c.shown && CONSENT_TH.test(c.line) && c.start, "consent first: " + JSON.stringify(c));
        await page.locator("#frConsentOk").tap();
        await page.evaluate(s => window.__FC.set(s), { profile: "rear-26-16x9", d: 900 });
        await page.locator("#frStartCam").tap();
        await waitFor(page, () => !!document.querySelector("#frCam.live"), null, 15000);
        assert(await page.evaluate(() => window.__FC.facings.slice(-1)[0]) === "environment", "back camera");
        await hintIs(page, "far", TH_OTHER.far);
      });

    for (const width of [360, 430]) {
      await check(`WebKit iPhone ${width}: face capture layout, no horizontal scroll (self and rear)`, async () => {
        const ctx = await browser.newContext({ ...IPHONE, viewport: { width, height: 760 } });
        const page = await ctx.newPage();
        const st = { errors: [], crashed: false, loads: 0, gotos: 1, mark: "" };
        page.on("pageerror", e => st.errors.push(String(e && e.message || e).slice(0, 300)));
        page.on("crash", () => { st.crashed = true; }); page.on("load", () => { st.loads++; });
        for (const s of [`try { localStorage.setItem("lq-lang", "th"); } catch (e) {}`, MD_SHIM, MODEL, CAM]) await page.addInitScript(s);
        try {
          await page.goto(`${base}/faceread.html?cpu&fakedet`, { waitUntil: "load", timeout: 60000 });
          st.mark = "m" + width; await page.evaluate(m => { window.__lqPhoneMark = m; }, st.mark);
          await page.evaluate(s => window.__FC.set(s), FAR);
          await page.locator("#frStartCam").tap();
          await hintIs(page, "far", TH.far);
          let ov = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
          assert(ov[0] <= ov[1] + 1, `${width}: overflow with the camera on ${ov}`);
          await page.locator("#frModeOther").tap();
          await waitFor(page, () => !document.getElementById("frConsent").hidden, null, 5000);
          ov = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
          assert(ov[0] <= ov[1] + 1, `${width}: overflow with the consent shown ${ov}`);
          await passRule(page, st, `iPhone ${width}`);
        } finally { await ctx.close(); }
      });
    }
  } finally { await browser.close(); }
}
