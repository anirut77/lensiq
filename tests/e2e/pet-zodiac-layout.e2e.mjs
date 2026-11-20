// tests/e2e/pet-zodiac-layout.e2e.mjs — FIXED TEST SET, review round 2 of the Pet zodiac cards (independent review round 1 FAILED
// on bdeeed49, 2026-11-19), headless Chrome. Locked (evals-locks/pet-zodiac.sha256) BEFORE the fixes. Pictures are synthetic.
//   X1  exclusion zones, all 13 templates x post / story x TH / EN, with a long pet name: the card is drawn twice from the same
//       model, with decoration and with opts.decor === false; inside every text box the renderer reports (header: brand line,
//       name, headline; body: lucky chip, reading lines; footer: honest line, disclaimer, "จาก LENSIQ" line) the two are
//       pixel-equal (no channel differs by more than 3), while outside the boxes the decoration is really drawn (>= 1 % of the
//       card differs). Guards: >= 3 header boxes above the picture frame, >= 3 footer boxes below the reading, the brand box
//       >= 200 px wide, the footer link box >= 400 px wide
//   X2  the secret card's label ribbon does not cover the top of the pet picture: it lies in the lower half of the frame and does
//       not overlap the medallion; for every template the ribbon and the medallion do not overlap
//   X3  person blur in zodiac mode, per template: a checkerboard person (score 0.9 and 0.2) away from the pet; the share of sharp
//       pixels in the card's picture frame exceeds the same template's no-person baseline by less than 1 point (or the photo
//       is refused with a note)
//   X4  detector unavailable, per template: the photo is refused on every template (data-photo="0") with a plain note
// RE-LOCK 4 (2026-11-20, owner decision 184 ก; ledger evals-locks/pet-zodiac.sha256 "relock-4"): X1 only. The footer carries the
// site address only when window.LENSIQ_CARD_SHOW_ADDRESS is true. X1 now runs its full loop (13 templates x post / story x
// TH / EN, every check unchanged) twice: switch off (default; footer = brand line, last footer box >= 200 px) and switch on
// (footer = brand + address, last footer box >= 400 px as before). Equal or stricter; nothing else changed.
import { assert } from "./cdp.mjs";
import { sleep } from "./zones-lib.mjs";

const PET = { cls: 15, score: 0.91, x: 0.2, y: 0.15, w: 0.5, h: 0.7 };
const ZODIAC = ["rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "goat", "monkey", "rooster", "dog", "pig"];
const ALL = ZODIAC.concat(["secret"]);
const ZON = `window.LENSIQ_PET_ZODIAC = true;`;
const LANG = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const detInit = dets => `window.__PET_DETS = ${JSON.stringify(dets)}; window.__LQ_FAKE_DET = function (key) { return key === "pet" ? window.__PET_DETS : []; };`;
const synth = persons => `(() => { const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d");
  x.fillStyle = "#5b8bd6"; x.fillRect(0, 0, 640, 480); x.fillStyle = "#e08a2e"; x.beginPath(); x.ellipse(288, 264, 150, 160, 0, 0, 7); x.fill();
  for (const p of ${JSON.stringify(persons)}) { const X = Math.round(p.x * 640), Y = Math.round(p.y * 480), W = Math.round(p.w * 640), H = Math.round(p.h * 480);
    for (let j = 0; j < H; j += 2) for (let i = 0; i < W; i += 2) { x.fillStyle = ((i + j) / 2) % 2 ? "#000" : "#fff"; x.fillRect(X + i, Y + j, 2, 2); } }
  return c.toDataURL("image/png"); })()`;
const SHARP = `(() => { const cv = document.getElementById("petCard"); const f = (cv.dataset.frame || "").split(",").map(Number);
  if (f.length !== 4 || !f[2]) return { frame: false };
  const d = cv.getContext("2d").getImageData(f[0], f[1], f[2], f[3]).data, W = f[2], H = f[3]; let n = 0, s = 0;
  const L = i => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) { const i = (y * W + x) * 4; n++; if (Math.abs(L(i) - L(i + 4)) > 60 || Math.abs(L(i) - L(i + W * 4)) > 60) s++; }
  return { frame: true, share: s / n }; })()`;

async function open(browser, base, { lang = "th", dets = [PET], query = "?fakedet&nosw", init = [] } = {}) {
  const page = await browser.newPage(null, { isolated: true, initScripts: [LANG(lang), detInit(dets), ZON, ...init] });
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
  await page.waitFor("document.getElementById('petCard').dataset.drawn === '1' && !!document.getElementById('petCard').dataset.template", 15000);
}
async function photoOn(page) { await page.evaluate(() => { const c = document.getElementById("petPhotoOn"); if (!c.checked) c.click(); }); await sleep(500); }
async function useTpl(page, id) {
  await page.evaluate(i => window.__LQPET.zodiacDraw(i), id);
  await page.waitFor(`document.getElementById("petCard").dataset.template === ${JSON.stringify(id)}`, 8000);
  await sleep(100);
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("X1 exclusion zones: no decoration under any text box, 13 templates x post / story x TH / EN, long name", async () => {
      const NAME = { th: "ส้มจี๊ดจอมซนแห่งบ้านริมคลองใหญ่", en: "Sir Fluffington the Third of Maple Lane" };
      for (const show of [false, true]) for (const lang of ["th", "en"]) {
        const page = await open(browser, base, { lang, init: show ? ["window.LENSIQ_CARD_SHOW_ADDRESS = true;"] : [] });
        await readWith(page, [], NAME[lang]);
        const r = await page.evaluate(ids => {
          const out = [];
          for (const id of ids) for (const size of ["post", "story"]) {
            const m = Object.assign({}, window.__LQPET.model(), { size, template: id });
            const label = window.LQPetDraw.label(id, m.lang);
            const a = document.createElement("canvas"), b = document.createElement("canvas");
            const ia = window.LQPetZodiacArt.drawCard(a, m, { template: id, label, size });
            window.LQPetZodiacArt.drawCard(b, m, { template: id, label, size, decor: false });
            const W = a.width, H = a.height, da = a.getContext("2d").getImageData(0, 0, W, H).data, db = b.getContext("2d").getImageData(0, 0, W, H).data;
            const boxes = ia.textBoxes || [], fr = ia.frame || [0, 0, 0, 0];
            const inBox = new Uint8Array(W * H); let bad = 0, badBox = "";
            for (const bx of boxes) {
              const x0 = Math.max(0, Math.floor(bx.x)), y0 = Math.max(0, Math.floor(bx.y)), x1 = Math.min(W, Math.ceil(bx.x + bx.w)), y1 = Math.min(H, Math.ceil(bx.y + bx.h));
              for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                const p = y * W + x; inBox[p] = 1; const i = p * 4;
                if (Math.abs(da[i] - db[i]) > 3 || Math.abs(da[i + 1] - db[i + 1]) > 3 || Math.abs(da[i + 2] - db[i + 2]) > 3) { bad++; if (!badBox) badBox = bx.kind + "@" + [x, y].join(","); }
              }
            }
            let diffOut = 0; for (let p = 0; p < W * H; p++) if (!inBox[p]) { const i = p * 4; if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 12) diffOut++; }
            const head = boxes.filter(b => b.kind === "header"), foot = boxes.filter(b => b.kind === "footer");
            out.push({ id, size, n: boxes.length, head: head.length, foot: foot.length, headAbove: head.every(b => b.y + b.h <= fr[1] + 2),
              footBelow: foot.every(b => b.y >= fr[1] + fr[3]), brandW: head.length ? head[0].w : 0, linkW: foot.length ? foot[foot.length - 1].w : 0,
              bad, badBox, decorShare: diffOut / (W * H) });
          }
          return out;
        }, ALL);
        for (const x of r) {
          const tag = `${lang} ${x.id} ${x.size} address=${show ? "on" : "off"}`;
          assert(x.head >= 3 && x.foot >= 3 && x.headAbove && x.footBelow, `${tag}: text boxes reported ${JSON.stringify(x)}`);
          assert(x.brandW >= 200 && x.linkW >= (show ? 400 : 200), `${tag}: box sizes ${JSON.stringify(x)}`);
          assert(x.bad === 0, `${tag}: decoration under text (${x.bad} px, first ${x.badBox})`);
          assert(x.decorShare >= 0.01, `${tag}: decoration not drawn (${x.decorShare})`);
        }
        await page.close();
      }
    });

    await check("X2 the secret ribbon stays off the top of the picture; ribbon and medallion never overlap", async () => {
      const page = await open(browser, base);
      await readWith(page, []);
      const r = await page.evaluate(ids => ids.map(id => {
        const m = Object.assign({}, window.__LQPET.model(), { template: id });
        const c = document.createElement("canvas");
        const i = window.LQPetZodiacArt.drawCard(c, m, { template: id, label: window.LQPetDraw.label(id, m.lang) });
        return { id, frame: i.frame, ribbon: i.ribbon || null, med: i.medallion || null };
      }), ALL);
      for (const x of r) {
        assert(x.ribbon && x.med, `${x.id}: ribbon / medallion rectangles reported ${JSON.stringify(x)}`);
        const a = x.ribbon, b = x.med, ov = !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
        assert(!ov, `${x.id}: ribbon overlaps the medallion ${JSON.stringify(x)}`);
        if (x.id === "secret") assert(a.y >= x.frame[1] + x.frame[3] * 0.5, `secret ribbon covers the top of the picture ${JSON.stringify(x)}`);
      }
      await page.close();
    });

    await check("X3 person blur per template (scores 0.9 and 0.2) vs the same template's no-person baseline", async () => {
      const base0 = await open(browser, base, { dets: [PET] });
      await readWith(base0, []); await photoOn(base0);
      const baseline = {};
      for (const id of ALL) { await useTpl(base0, id); baseline[id] = (await base0.evaluate(SHARP)).share; }
      await base0.close();
      for (const score of [0.9, 0.2]) {
        const person = { cls: 0, score, x: 0.74, y: 0.1, w: 0.22, h: 0.6 };
        const page = await open(browser, base, { dets: [PET, person] });
        await readWith(page, [person]); await photoOn(page);
        for (const id of ALL) {
          await useTpl(page, id);
          const r = await page.evaluate(`({ photo: document.getElementById("petCard").dataset.photo, note: document.getElementById("petCardNote").textContent, s: ${SHARP} })`);
          const ok = r.photo === "0" ? r.note.trim().length > 8 : (r.s.frame && r.s.share - baseline[id] < 0.01);
          assert(ok, `${id} score ${score}: person may be visible (share ${r.s.share} vs baseline ${baseline[id]}) ${JSON.stringify(r)}`);
        }
        await page.close();
      }
    });

    await check("X4 detector unavailable: the photo is refused on every template, with a note", async () => {
      const page = await open(browser, base, { query: "?nosw" });
      await page.send("Network.setBlockedURLs", { urls: ["*.onnx*", "*ort.wasm*", "*ort-wasm*", "*lensiq-detect*"] });
      const person = { x: 0.74, y: 0.1, w: 0.22, h: 0.6 };
      await readWith(page, [person]);
      assert(await page.evaluate(() => window.__LQPET.st.detFailed === true), "the blocked detector did not fail");
      await photoOn(page);
      for (const id of ALL) {
        await useTpl(page, id);
        const r = await page.evaluate(() => ({ photo: document.getElementById("petCard").dataset.photo, note: document.getElementById("petCardNote").textContent }));
        assert(r.photo === "0" && r.note.trim().length > 8, `${id}: photo without a person check ${JSON.stringify(r)}`);
      }
      await page.close();
    });
  } finally { await browser.close(); }
}
