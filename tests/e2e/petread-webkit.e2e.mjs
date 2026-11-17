// tests/e2e/petread-webkit.e2e.mjs — FIXED TEST SET, Pet face reading on the iOS engine (owner order 2026-11-16, part B:
// "iPhone WebKit tests"). Locked (evals-locks/fortune-pet.sha256) BEFORE any product code on branch fortune-pet.
// Playwright WebKit, iPhone 13 profile (390 px, touch, mobile UA), the real CSP. Pictures are synthetic (a drawn shape);
// detections scripted with ?fakedet except in W2, which loads the real detector on tap. Pass rule of phone-kit.mjs on every
// flow: no page error, no crash, no reload, no horizontal overflow at 390 px.
//   W1  photo through the real file input (fakedet cat) -> species pre-filled -> Read -> grouped reading -> card drawn,
//       photo off by default, honest line + disclaimer on the page, one 1323 button
//   W2  real detector, loaded only on tap: nothing detector-related requested before the photo; after the photo, within
//       60 s either a pet is found or a plain "pick the traits yourself" message; the reading still works
//   W3  camera on / off with the fake camera: every track ended after "off"
//   W4  crisis typed in the pet's name (TH), crisis v3 (re-lock 2026-11-17): the reading continues, no card, no echo, the share
//       card is hidden, one closing 1323 line last
//   W5  English at 390 px: reading and card text have no Thai; ZH: the same
import { assert } from "./cdp.mjs";
import { flow, launchWebKit, sleep, waitFor } from "./phone-kit.mjs";
import { readFileSync } from "node:fs";

const FAKECAMS = readFileSync(new URL("./fake-cams.js", import.meta.url), "utf8");
const SYNTH = () => { const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d");
  x.fillStyle = "#5b8bd6"; x.fillRect(0, 0, 640, 480); x.fillStyle = "#e08a2e"; x.beginPath(); x.ellipse(300, 280, 150, 120, 0, 0, 7); x.fill();
  x.beginPath(); x.moveTo(190, 200); x.lineTo(220, 90); x.lineTo(270, 180); x.fill(); x.beginPath(); x.moveTo(330, 180); x.lineTo(380, 90); x.lineTo(410, 200); x.fill();
  return c.toDataURL("image/png"); };
const DETS = dets => `window.__PET_DETS = ${JSON.stringify(dets)}; window.__LQ_FAKE_DET = function (key) { return key === "pet" ? window.__PET_DETS : []; };`;
const CAT = { cls: 15, score: 0.91, x: 0.2, y: 0.15, w: 0.5, h: 0.7 };
const HONEST = "คำอ่านนี้ดัดแปลงจากความเชื่อเรื่องการดูลักษณะ ไม่ใช่ตำราดั้งเดิม";
const DISC = "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ";
const THAI = /[฀-๿]/;

async function photo(page) {
  const url = await page.evaluate(SYNTH);
  await page.setInputFiles("#petFile", { name: "synthetic.png", mimeType: "image/png", buffer: Buffer.from(url.split(",")[1], "base64") });
}
async function read(page, name = "Mochi") {
  await page.fill("#petName", name);
  await page.fill("#petBirth", "2021-03-14");
  await page.fill("#petOwnerBirth", "1990-07-02");
  await page.locator("#petRead").tap();
}
const SECTIONS = n => document.querySelectorAll("#petReading .fa-section").length >= n;

export default async function ({ base, check }) {
  const browser = await launchWebKit();
  try {
    await flow(check, browser, "petread W1: file input photo (fakedet cat) -> reading -> card, photo off by default", `${base}/petread.html?fakedet`, { init: [DETS([CAT])] }, async ({ page }) => {
      const top = await page.evaluate(() => ({ tels: [...document.querySelectorAll('a[href^="tel:"]')].map(a => a.getAttribute("href")), main: document.querySelector("main").innerText }));
      assert(top.tels.length === 1 && top.tels[0] === "tel:1323", "one help button " + JSON.stringify(top.tels));
      assert(top.main.includes(HONEST) && top.main.includes(DISC), "honest line + disclaimer on the page");
      await photo(page);
      await waitFor(page, () => window.__LQPET && window.__LQPET.st.detected === true, null, 15000);
      assert(await page.evaluate(() => !!document.querySelector('input[name="petSpecies"][value="cat"]:checked')), "species cat pre-filled");
      await read(page);
      await waitFor(page, SECTIONS, 5, 15000);
      await waitFor(page, () => document.getElementById("petCard").dataset.drawn === "1", null, 10000);
      const c = await page.evaluate(() => ({ on: document.getElementById("petPhotoOn").checked, photo: document.getElementById("petCard").dataset.photo,
        grouped: !!document.querySelector("#petReading [data-lq-grouped]") }));
      assert(!c.on && c.photo === "0" && c.grouped, "card photo off by default, grouped layout " + JSON.stringify(c));
    });

    await flow(check, browser, "petread W2: real detector loads only on tap -> found or a plain trait-picker message; reading works", `${base}/petread.html`, {}, async ({ page }) => {
      const reqs = []; page.on("request", r => reqs.push(r.url()));
      await sleep(800);
      assert(!reqs.some(u => /onnx|ort[.-]|\.wasm|yolox|cocossd|tfjs/i.test(u)), "detector requested before the photo: " + reqs.filter(u => /onnx|wasm|ort/.test(u)).join(", "));
      await photo(page);
      await waitFor(page, () => window.__LQPET && (window.__LQPET.st.detected === true || window.__LQPET.st.detFailed === true), null, 60000);
      const r = await page.evaluate(() => ({ msg: document.getElementById("petDetMsg").textContent, found: !!(window.__LQPET.st.det && window.__LQPET.st.det.pet) }));
      assert(r.found || (/เลือก/.test(r.msg) && r.msg.length > 10), "plain outcome after the real detector: " + JSON.stringify(r));
      await page.evaluate(() => document.querySelector('input[name="petSpecies"][value="dog"]').click());
      await read(page, "");
      await waitFor(page, SECTIONS, 4, 15000);
    });

    await flow(check, browser, "petread W3: camera on / off stops every track", `${base}/petread.html?fakedet`, { cams: FAKECAMS, init: [DETS([CAT]), "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}"] }, async ({ page }) => {
      await page.locator("#petCamOn").tap();
      await waitFor(page, () => { const v = document.getElementById("petVideo"); return !!(v.srcObject && v.srcObject.active); }, null, 15000);
      await page.locator("#petCamOff").tap();
      await sleep(400);
      const off = await page.evaluate(() => { const s = window.__LQPET.lastStream; return { t: s ? s.getTracks().map(x => x.readyState) : null, src: !!document.getElementById("petVideo").srcObject }; });
      assert(off.t && off.t.length && off.t.every(x => x === "ended") && !off.src, "tracks after off " + JSON.stringify(off));
    });

    // RE-LOCK 2026-11-17 (crisis v3; ledger docs/CRISIS-V3-RELOCKS.md "fortune-pet"): no support card in v3. Kept: no share card.
    // Added: crisis state set, the reading continues, no card / soft step, no echo, one closing tel:1323 line after the last section.
    await flow(check, browser, "petread W4: crisis in the pet's name (v3) -> reading continues, nothing flagged, no echo, no share card, closing 1323 line last", `${base}/petread.html?fakedet`, { init: [DETS([CAT])] }, async ({ page }) => {
      await photo(page);
      await waitFor(page, () => window.__LQPET && window.__LQPET.st.detected === true, null, 15000);
      await read(page, "อยากตาย");
      await waitFor(page, () => document.documentElement.getAttribute("data-lq-crisis") === "1" && document.querySelectorAll("#petReading .fa-section").length >= 2, null, 15000);
      await new Promise(r => setTimeout(r, 600));
      const r = await page.evaluate(() => {
        const vis = e => !!e && !e.closest("[hidden]") && e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== "none";
        const secs = [...document.querySelectorAll("#petReading .fa-section")].filter(vis), last = secs[secs.length - 1];
        const lines = [...document.querySelectorAll(".lq-helpline-result")].filter(vis);
        return { s: secs.length, flagged: [...document.querySelectorAll(".fa-support, .fa-soft")].some(vis), card: vis(document.getElementById("petCardSec")),
          echo: document.querySelector("main").innerText.replace(/\s+/g, "").includes("อยากตาย"),
          close: lines.length === 1 && !!lines[0].querySelector('a[href="tel:1323"]') && !!last && !!(last.compareDocumentPosition(lines[0]) & Node.DOCUMENT_POSITION_FOLLOWING) };
      });
      assert(r.s >= 2 && !r.flagged && !r.card && !r.echo && r.close, "crisis state (v3) " + JSON.stringify(r));
    });

    for (const lang of ["en", "zh"]) {
      await flow(check, browser, `petread W5 (${lang}): reading and card text without Thai at 390 px`, `${base}/petread.html?fakedet&lang=${lang}`, { lang, init: [DETS([CAT])] }, async ({ page }) => {
        await waitFor(page, l => window.LQI18N && window.LQI18N.lang === l, lang, 10000);
        await photo(page);
        await waitFor(page, () => window.__LQPET && window.__LQPET.st.detected === true, null, 15000);
        await read(page);
        await waitFor(page, SECTIONS, 5, 15000);
        await waitFor(page, () => document.getElementById("petCard").dataset.drawn === "1", null, 10000);
        const t = await page.evaluate(() => ({ r: document.getElementById("petReading").innerText, c: window.__LQPET.cardText().join("\n") }));
        assert(!THAI.test(t.r) && !THAI.test(t.c), lang + ": Thai left " + (t.r.match(/.{0,20}[฀-๿].{0,20}/) || t.c.match(/.{0,20}[฀-๿].{0,20}/) || [""])[0]);
      });
    }
  } finally { await browser.close(); }
}
