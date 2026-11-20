// tests/e2e/pet-capture.e2e.mjs — FIXED TEST SET for the pet capture guide and the required / optional field markers (owner's
// full pet-reading scope, relayed 2026-11-19, items 1 and 2; branch pet-zodiac-cards), headless Chrome with the fake camera.
// Locked (evals-locks/pet-zodiac.sha256) BEFORE the product code for these items; node half: tests/unit/pet-capture.test.js.
//   G1  flag on, load: the camera is not asked for before a tap; the guide is hidden
//   G2  flag on, tap "open camera": a pet-shaped guide is visible over the live picture, centred, 25-90 % of the picture area,
//       with a hint about fitting the pet inside the frame (TH / EN / ZH)
//   G3  camera off, and taking a photo: the guide hides and every camera track is stopped; leaving the page stops it too
//   G4  flag off: the camera works as before with no guide (nothing new shows)
//   G5  flag on, form (TH / EN / ZH): exactly one required marker, on the species choice (aria-required="true"); every other trait
//       group and the photo / name / birth date fields say optional; the behaviour matches: no species -> an error and no reading;
//       species only (no photo, name or dates) -> a reading
import { assert } from "./cdp.mjs";
import { sleep } from "./zones-lib.mjs";

const ZON = `window.LENSIQ_PET_ZODIAC = true;`;
const LANG = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const GUM = `window.__gum = 0; { const md = navigator.mediaDevices; if (md && md.getUserMedia) { const o = md.getUserMedia.bind(md); md.getUserMedia = c => { window.__gum++; return o(c); }; } }`;
const FRAME = { th: /กรอบ/, en: /frame/i, zh: /框/ };
const OPT = { th: /ไม่บังคับ/, en: /optional/i, zh: /可选|选填/ };
const REQ = { th: /จำเป็น|ต้องเลือก/, en: /required/i, zh: /必填|必选/ };

async function open(browser, base, { lang = "th", zodiac = true } = {}) {
  const page = await browser.newPage(null, { isolated: true, initScripts: [LANG(lang), GUM, ...(zodiac ? [ZON] : [])] });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/petread.html?nosw${lang !== "th" ? "&lang=" + lang : ""}`);
  await page.waitFor("window.__LQPET && window.__LQPET.ready", 15000);
  if (lang !== "th") await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
  return page;
}
const VIS = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return { on: !e.closest("[hidden]") && cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0, x: b.left, y: b.top, w: b.width, h: b.height,
    text: e.textContent.trim() }; })()`;
const camOn = async page => { await page.evaluate(() => document.getElementById("petCamOn").click()); await page.waitFor("!!document.getElementById('petVideo').videoWidth", 10000); await sleep(300); };
const tracksEnded = `(() => { const s = window.__LQPET.lastStream; return !!s && s.getTracks().every(t => t.readyState === "ended"); })()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("G1 flag on, load: no camera before a tap; guide hidden", async () => {
      const page = await open(browser, base);
      await sleep(600);
      const r = await page.evaluate(`({ gum: window.__gum, g: ${VIS("#petGuide")} })`);
      assert(r.gum === 0, "camera asked for at load");
      assert(r.g && !r.g.on, "guide hidden at load " + JSON.stringify(r.g));
      await page.close();
    });

    await check("G2 flag on, camera tapped: pet-shaped guide over the live picture with a frame hint (TH / EN / ZH)", async () => {
      for (const lang of ["th", "en", "zh"]) {
        const page = await open(browser, base, { lang });
        await camOn(page);
        const r = await page.evaluate(`({ gum: window.__gum, g: ${VIS("#petGuide")}, v: ${VIS("#petVideo")}, hint: ${VIS("#petGuideHint")} })`);
        assert(r.gum === 1, lang + ": one camera request after the tap");
        assert(r.g && r.g.on && r.v && r.v.on, lang + ": guide visible over the video " + JSON.stringify(r));
        const cx = r.g.x + r.g.w / 2, cy = r.g.y + r.g.h / 2, vcx = r.v.x + r.v.w / 2, vcy = r.v.y + r.v.h / 2;
        assert(Math.abs(cx - vcx) <= r.v.w * 0.08 && Math.abs(cy - vcy) <= r.v.h * 0.12, lang + ": guide centred on the picture " + JSON.stringify(r));
        const area = (Math.min(r.g.w, r.v.w) * Math.min(r.g.h, r.v.h)) / (r.v.w * r.v.h);
        assert(area >= 0.25 && area <= 0.9, lang + ": guide size " + area.toFixed(2));
        assert(r.hint && r.hint.on && FRAME[lang].test(r.hint.text) && (lang === "th" || !/[฀-๿]/.test(r.hint.text)), lang + ": hint " + JSON.stringify(r.hint));
        await page.evaluate(() => document.getElementById("petCamOff").click());
        await page.close();
      }
    });

    await check("G3 camera off / photo taken / page left: guide hidden and every track stopped", async () => {
      const page = await open(browser, base);
      await camOn(page);
      await page.evaluate(() => document.getElementById("petCamOff").click()); await sleep(300);
      let r = await page.evaluate(`({ g: ${VIS("#petGuide")}, ended: ${tracksEnded} })`);
      assert(r.g && !r.g.on && r.ended, "camera off " + JSON.stringify(r));
      await camOn(page);
      await page.evaluate(() => document.getElementById("petSnap").click()); await sleep(500);
      r = await page.evaluate(`({ g: ${VIS("#petGuide")}, ended: ${tracksEnded} })`);
      assert(r.g && !r.g.on && r.ended, "after the photo " + JSON.stringify(r));
      await camOn(page);
      await page.evaluate(() => window.dispatchEvent(new Event("pagehide"))); await sleep(300);
      r = await page.evaluate(`({ ended: ${tracksEnded} })`);
      assert(r.ended, "pagehide releases the camera");
      await page.close();
    });

    await check("G4 flag off: camera as before, no guide", async () => {
      const page = await open(browser, base, { zodiac: false });
      await camOn(page);
      const r = await page.evaluate(`({ g: ${VIS("#petGuide")}, req: document.querySelectorAll("#petForm .pet-req").length })`);
      assert(!r.g || !r.g.on, "no guide with the flag off");
      assert(r.req === 0, "no new markers with the flag off");
      await page.evaluate(() => document.getElementById("petCamOff").click());
      await page.close();
    });

    await check("G5 flag on, form (TH / EN / ZH): one required marker on the species, the rest optional; behaviour matches", async () => {
      for (const lang of ["th", "en", "zh"]) {
        const page = await open(browser, base, { lang });
        const r = await page.evaluate(() => {
          const req = [...document.querySelectorAll("#petForm .pet-req")].map(e => ({ t: e.textContent, g: (e.closest("fieldset") || {}).id || "" }));
          const groups = [...document.querySelectorAll("#petTraits fieldset")].map(fs => ({ legend: fs.querySelector("legend").textContent,
            aria: (fs.querySelector("[aria-required]") || fs).getAttribute("aria-required"), species: !!fs.querySelector('input[name="petSpecies"]') }));
          const labels = ["#petName", "#petBirth", "#petOwnerBirth"].map(s => document.querySelector(s).closest("label").textContent);
          return { req, groups, labels, photoH: document.getElementById("petPhotoH").textContent };
        });
        assert(r.req.length === 1 && REQ[lang].test(r.req[0].t), lang + ": exactly one required marker " + JSON.stringify(r.req));
        const sp = r.groups.find(g => g.species);
        assert(sp && REQ[lang].test(sp.legend) && sp.aria === "true", lang + ": species marked required " + JSON.stringify(sp));
        for (const g of r.groups.filter(x => !x.species)) assert(OPT[lang].test(g.legend) && g.aria !== "true", lang + ": optional group " + JSON.stringify(g));
        for (const l of r.labels.concat([r.photoH])) assert(OPT[lang].test(l), lang + ": optional field " + l);
        // behaviour: no species -> error, no reading
        await page.evaluate(() => document.getElementById("petRead").click()); await sleep(400);
        const e = await page.evaluate(() => ({ msg: document.getElementById("petMsg").textContent, res: !document.getElementById("petResult").hidden }));
        assert(e.msg.trim().length > 3 && !e.res, lang + ": no species gives an error and no reading " + JSON.stringify(e));
        // species only -> reading
        await page.evaluate(() => { document.querySelector('input[name="petSpecies"][value="dog"]').click(); document.getElementById("petRead").click(); });
        await page.waitFor("document.querySelectorAll('#petReading .fa-section').length >= 2", 8000);
        await page.close();
      }
    });
  } finally { await browser.close(); }
}
