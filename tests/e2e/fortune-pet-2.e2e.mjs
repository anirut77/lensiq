// tests/e2e/fortune-pet-2.e2e.mjs — FIXED TEST SET, review round 1 of the Pet face reading (independent review NOT OK on
// fortune-pet @ 36c6594, 2026-11-16), headless Chrome. Locked (evals-locks/fortune-pet.sha256) BEFORE the fixes.
// Pictures are synthetic: a flat background, a flat orange "pet" ellipse and a 2-px black/white checkerboard where the
// scripted person box is (the only high-frequency texture in the picture). A person region drawn sharp on the card shows up
// as many neighbouring pixels with a large brightness step; a pixelated (or refused) one does not.
//   S1  D1 a person box overlapping the pet box by 10 / 25 / 49 %: with the card photo ticked, the card has no sharp person
//       region (sharp-pixel share in the card's photo frame < 1 %) or the photo is refused with a plain note
//   S2  D1 a person away from the pet (score 0.9) and a LOW-SCORE person (0.2): no sharp person region on the card
//   S3  D1 the detector cannot load (model / runtime blocked): the photo is refused for the card, with a plain note (TH/EN/ZH)
//   S4  D2 first screen at 360 / 375 / 393 / 414 / 430 px wide, 659 px high (Safari's visible height), TH / EN / ZH: the
//       title, then the disclaimer, a description of at most 2 lines, and the photo + camera buttons fully on screen; once a
//       photo is set, a Read button is on screen and gives the reading
//   S5  D3 camera denied: the first step is the page title (TH / EN / ZH), before the Settings fallback
//   S6  card: the typed Thai name is kept on the English card; story size 1080 x 1920; QR off by default, on = drawn on the
//       device with zero network requests
import { assert } from "./cdp.mjs";
import { sleep } from "./zones-lib.mjs";

const PET = { cls: 15, score: 0.91, x: 0.2, y: 0.15, w: 0.5, h: 0.7 };
const detInit = dets => `window.__PET_DETS = ${JSON.stringify(dets)}; window.__LQ_FAKE_DET = function (key) { return key === "pet" ? window.__PET_DETS : []; };`;
/** synthetic picture: checkerboard over every person box (also where it overlaps the pet) */
const synth = persons => `(() => { const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d");
  x.fillStyle = "#5b8bd6"; x.fillRect(0, 0, 640, 480); x.fillStyle = "#e08a2e"; x.beginPath(); x.ellipse(288, 264, 150, 160, 0, 0, 7); x.fill();
  for (const p of ${JSON.stringify(persons)}) { const X = Math.round(p.x * 640), Y = Math.round(p.y * 480), W = Math.round(p.w * 640), H = Math.round(p.h * 480);
    for (let j = 0; j < H; j += 2) for (let i = 0; i < W; i += 2) { x.fillStyle = ((i + j) / 2) % 2 ? "#000" : "#fff"; x.fillRect(X + i, Y + j, 2, 2); } }
  return c.toDataURL("image/png"); })()`;
/** share of pixels with a brightness step > 60 to the right or below, inside the card's photo frame (dataset.frame) */
const SHARP = `(() => { const cv = document.getElementById("petCard"); const f = (cv.dataset.frame || "").split(",").map(Number);
  if (f.length !== 4 || !f[2]) return { frame: false };
  const d = cv.getContext("2d").getImageData(f[0], f[1], f[2], f[3]).data, W = f[2], H = f[3]; let n = 0, s = 0;
  const L = i => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) { const i = (y * W + x) * 4; n++; if (Math.abs(L(i) - L(i + 4)) > 60 || Math.abs(L(i) - L(i + W * 4)) > 60) s++; }
  return { frame: true, share: s / n }; })()`;

async function open(browser, base, { lang = "th", dets = [PET], query = "?fakedet&nosw", init = [] } = {}) {
  const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${JSON.stringify(lang)}); } catch (e) {}`, detInit(dets), ...init] });
  await page.goto(`${base}/petread.html${query}${lang !== "th" ? "&lang=" + lang : ""}`);
  await page.waitFor("window.__LQPET && window.__LQPET.ready", 15000);
  if (lang !== "th") await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
  return page;
}
async function readWith(page, persons, name = "Mochi") {
  await page.evaluate(`window.__LQPET.useImage(${synth(persons)})`);
  await page.waitFor("window.__LQPET.st.detected === true || window.__LQPET.st.detFailed === true", 60000);
  await page.evaluate(n => {
    const s = document.querySelector('input[name="petSpecies"][value="cat"]'); if (s && !s.checked) s.click();
    const el = document.getElementById("petName"); el.value = n; el.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("petRead").click();
  }, name);
  await page.waitFor("document.getElementById('petCard').dataset.drawn === '1'", 10000);
}
async function photoOn(page) {
  await page.evaluate(() => { const c = document.getElementById("petPhotoOn"); if (!c.checked) c.click(); });
  await sleep(600);
  return page.evaluate(`(() => { const cv = document.getElementById("petCard"); return { photo: cv.dataset.photo, note: document.getElementById("petCardNote").textContent, sharp: ${SHARP} }; })()`);
}
const privateOk = r => r.photo === "0" ? r.note.trim().length > 8 : (r.sharp.frame && r.sharp.share < 0.01);

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("S1 D1 person overlapping the pet box by 10 / 25 / 49 %: no sharp person region on the card (or refused with a note)", async () => {
      for (const f of [0.10, 0.25, 0.49]) {
        const person = { cls: 0, score: 0.9, x: +(0.7 - 0.5 * f).toFixed(4), y: 0.15, w: +(0.5 * f + 0.2).toFixed(4), h: 0.7 };
        const page = await open(browser, base, { dets: [PET, person] });
        await readWith(page, [person]);
        const r = await photoOn(page);
        assert(privateOk(r), `overlap ${f * 100} %: a person may be visible on the card ${JSON.stringify(r)}`);
        await page.close();
      }
    });

    await check("S2 D1 a person away from the pet (0.9) and a low-score person (0.2): no sharp person region on the card", async () => {
      for (const score of [0.9, 0.2]) {
        const person = { cls: 0, score, x: 0.74, y: 0.1, w: 0.22, h: 0.6 };
        const page = await open(browser, base, { dets: [PET, person] });
        await readWith(page, [person]);
        const r = await photoOn(page);
        assert(privateOk(r), `person score ${score}: ${JSON.stringify(r)}`);
        await page.close();
      }
    });

    await check("S3 D1 detector cannot load: the photo is refused for the card with a plain note (TH / EN / ZH)", async () => {
      const NOTE = { th: /รูป/, en: /photo/i, zh: /照片/ };
      for (const lang of ["th", "en", "zh"]) {
        const page = await open(browser, base, { lang, query: "?nosw" });
        await page.send("Network.setBlockedURLs", { urls: ["*.onnx*", "*ort.wasm*", "*ort-wasm*", "*lensiq-detect*"] });
        const person = { x: 0.74, y: 0.1, w: 0.22, h: 0.6 };
        await readWith(page, [person]);
        const failed = await page.evaluate(() => window.__LQPET.st.detFailed === true);
        assert(failed, lang + ": the blocked detector did not fail");
        const r = await photoOn(page);
        assert(r.photo === "0", lang + ": the photo went on the card without a person check " + JSON.stringify(r));
        assert(NOTE[lang].test(r.note) && r.note.length > 8, lang + ": plain note " + r.note);
        await page.close();
      }
    });

    await check("S4 D2 first screen at 360-430 px x 659 px (TH / EN / ZH): title, disclaimer, short description, photo + camera buttons; Read reachable after a photo", async () => {
      for (const lang of ["th", "en", "zh"]) {
        const page = await open(browser, base, { lang });
        for (const width of [360, 375, 393, 414, 430]) {
          await page.send("Emulation.setDeviceMetricsOverride", { width, height: 659, deviceScaleFactor: 3, mobile: true });
          await page.evaluate(() => window.scrollTo(0, 0)); await sleep(350);
          const r = await page.evaluate(() => {
            const rect = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height) }; };
            const lead = document.querySelector("main .lead"); const cs = lead ? getComputedStyle(lead) : null;
            const lh = cs ? (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5) : 0;
            return { h1: rect("main h1"), disc: rect("main .fk-disclaimer"), lead: rect("main .lead"), lh, file: rect("label.pet-file"), cam: rect("#petCamOn"), sx: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
          });
          const tag = `${lang} ${width}x659`;
          assert(r.file && r.cam && r.file.t >= 0 && r.file.b <= 659 && r.cam.t >= 0 && r.cam.b <= 659, `${tag}: photo / camera buttons not on the first screen ${JSON.stringify(r)}`);
          assert(r.h1 && r.disc && r.h1.t < r.disc.t && r.disc.b <= r.file.t, `${tag}: order title -> disclaimer -> photo buttons ${JSON.stringify(r)}`);
          assert(r.lead && r.lead.h <= r.lh * 2.6, `${tag}: description longer than 2 lines ${JSON.stringify(r)}`);
          assert(r.sx <= r.cw, `${tag}: horizontal scroll`);
        }
        await page.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 659, deviceScaleFactor: 3, mobile: true });
        await page.evaluate(`window.__LQPET.useImage(${synth([])})`);
        await page.waitFor("window.__LQPET.st.detected === true", 15000); await sleep(400);
        const bar = await page.evaluate(() => { const e = document.getElementById("petReadBar"); if (!e) return null; const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
          return { t: b.top, b: b.bottom, vis: cs.display !== "none" && cs.visibility !== "hidden" && !e.closest("[hidden]") && b.height >= 44 }; });
        assert(bar && bar.vis && bar.t >= 0 && bar.b <= 659, lang + ": a Read button on screen after the photo " + JSON.stringify(bar));
        await page.evaluate(() => document.getElementById("petReadBar").click());
        await page.waitFor("document.querySelectorAll('#petReading .fa-section').length >= 4", 8000);
        await page.send("Emulation.clearDeviceMetricsOverride");
        await page.close();
      }
    });

    await check("S5 D3 camera denied: the first step is the page title, then the Settings fallback (TH / EN / ZH)", async () => {
      const FIRST = { th: "แตะชื่อหน้าด้านบนสุด", en: "Tap the page title at the very top", zh: "点按最上方的页面标题" }, SET = { th: /การตั้งค่า/, en: /Settings/, zh: /设置/ };
      const DENY = `navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));`;
      for (const lang of ["th", "en", "zh"]) {
        const page = await open(browser, base, { lang, init: [DENY] });
        await page.evaluate(() => document.getElementById("petCamOn").click());
        await page.waitFor("document.getElementById('petCamMsg').textContent.length > 10", 6000);
        const m = await page.evaluate(() => document.getElementById("petCamMsg").textContent);
        const i = m.indexOf(FIRST[lang]), s = m.search(SET[lang]);
        assert(i >= 0 && s > i, `${lang}: ${m}`);
        await page.close();
      }
    });

    await check("S6 card: Thai name kept on the English card, story size, QR off by default and drawn on the device", async () => {
      const page = await open(browser, base, { lang: "en" });
      await readWith(page, [], "ส้มจี๊ด");
      const m = await page.evaluate(() => window.__LQPET.model());
      assert(m && m.petName === "ส้มจี๊ด", "typed Thai name kept on the English card " + JSON.stringify(m && m.petName));
      page.requests.length = 0;
      await page.evaluate(() => document.querySelector('.pet-size[data-size="story"]').click());
      await page.waitFor("document.getElementById('petCard').height === 1920", 4000);
      const q0 = await page.evaluate(() => ({ on: document.getElementById("petQrOn").checked, qr: document.getElementById("petCard").dataset.qr }));
      assert(!q0.on && q0.qr === "0", "QR off by default " + JSON.stringify(q0));
      await page.evaluate(() => document.getElementById("petQrOn").click());
      await page.waitFor("document.getElementById('petCard').dataset.qr === '1'", 6000);
      await page.evaluate(() => document.querySelector('.pet-size[data-size="post"]').click());
      await page.waitFor("document.getElementById('petCard').height === 1350", 4000);
      const net = page.requests.filter(r => /^https?:/.test(r.url) && !/vendor\/qrcode-generator\/qrcode\.js/.test(r.url));
      assert(!net.length, "network requests: " + net.map(r => r.url).join(", "));
      assert(!page.requests.some(r => /^https?:/.test(r.url) && !r.url.startsWith(base)), "an off-site request");
      await page.close();
    });
  } finally { await browser.close(); }
}
