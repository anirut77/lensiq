// tests/e2e/pet-card-headline.e2e.mjs — FIXED TEST SET for the share-card headline (independent review round 2 of
// pet-zodiac-cards, owner decision 145 ก: round 3 fixes only the headline cut at lensiq-pet-card.js). Headless Chrome.
// Locked (evals-locks/pet-zodiac.sha256) BEFORE the fix. The renderer reports the headline it drew as info.headline.
//   H1  for post and story sizes, TH and EN, classic mode (LQPetCard.draw) and zodiac mode (LQPetZodiacArt.drawCard), with short,
//       medium (fits at the headline size but not at the pet-name size) and long headlines: when the full headline fits the
//       header width at the headline font, the drawn headline IS the full headline; otherwise it ends in "…", the text before
//       the "…" is a prefix of the headline, and the drawn line fits the header width but is not cut early (at least 60 % of it)
//   Header width: classic 928 px (the card width 1080 minus 2 x 76), zodiac 788 px (minus the corner sticker room, 140 px).
//   Headline font: 700 weight, 44 px (post) / 52 px (story), the page font.
import { assert } from "./cdp.mjs";

const PET = { cls: 15, score: 0.91, x: 0.2, y: 0.15, w: 0.5, h: 0.7 };
const INIT = [`try { localStorage.setItem("lq-lang", "th"); } catch (e) {}`, `window.LENSIQ_PET_ZODIAC = true;`,
  `window.__PET_DETS = ${JSON.stringify([PET])}; window.__LQ_FAKE_DET = function (key) { return key === "pet" ? window.__PET_DETS : []; };`];
const HEADLINES = {
  th: ["ดวงอาทิตย์ประจำบ้าน", "ดวงอาทิตย์ดวงน้อยประจำบ้านหลังนี้",
    "ดวงอาทิตย์ดวงน้อยประจำบ้านผู้ร่าเริงที่สุดในซอยและเป็นที่รักของทุกคนในครอบครัวใหญ่หลังนี้"],
  en: ["Little sunshine", "The household's little sunshine",
    "The cheerful little sunshine of the whole house, loved by every neighbour on the street and beyond"],
};

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("H1 headline drawn in full when it fits, else a maximal prefix + …; post / story x TH / EN x classic / zodiac", async () => {
      const page = await browser.newPage(null, { isolated: true, initScripts: INIT });
      await page.goto(`${base}/petread.html?fakedet&nosw`);
      await page.waitFor("window.__LQPET && window.__LQPET.ready", 15000);
      await page.evaluate(() => { document.querySelector('input[name="petSpecies"][value="cat"]').click(); document.getElementById("petRead").click(); });
      await page.waitFor("!!window.LQPetZodiacArt && document.getElementById('petCard').dataset.drawn === '1'", 15000);
      const r = await page.evaluate(H => {
        const out = [], fam = getComputedStyle(document.body).fontFamily, mc = document.createElement("canvas").getContext("2d");
        for (const lang of ["th", "en"]) for (const headline of H[lang]) for (const size of ["post", "story"]) for (const mode of ["classic", "zodiac"]) {
          const m = Object.assign({}, window.__LQPET.model(), { lang, headline, size, photo: false });
          delete m.template; delete m.from;
          const cv = document.createElement("canvas");
          const info = mode === "classic" ? window.LQPetCard.draw(cv, m, { theme: "sunny", size })
            : window.LQPetZodiacArt.drawCard(cv, Object.assign(m, { template: "rat" }), { template: "rat", label: window.LQPetDraw.label("rat", lang), size });
          const HW = mode === "classic" ? 928 : 788;
          mc.font = `700 ${size === "story" ? 52 : 44}px ${fam}`;
          const drawn = info.headline, fits = mc.measureText(headline).width <= HW;
          out.push({ lang, size, mode, headline, drawn, fits, w: typeof drawn === "string" ? mc.measureText(drawn).width : -1, HW });
        }
        return out;
      }, HEADLINES);
      for (const x of r) {
        const tag = `${x.lang} ${x.size} ${x.mode} "${x.headline.slice(0, 24)}…"`;
        assert(typeof x.drawn === "string", `${tag}: info.headline not reported`);
        if (x.fits) assert(x.drawn === x.headline, `${tag}: fits but drawn as "${x.drawn}"`);
        else {
          const pre = x.drawn.replace(/…$/, "").trimEnd();
          assert(x.drawn.endsWith("…") && pre.length > 0 && x.headline.startsWith(pre), `${tag}: overflow must be a prefix + "…", got "${x.drawn}"`);
          assert(x.w <= x.HW + 1 && x.w >= x.HW * 0.6, `${tag}: drawn width ${x.w.toFixed(0)} of ${x.HW} ("${x.drawn}")`);
        }
      }
      assert(r.some(x => !x.fits) && r.some(x => x.fits && x.headline.length > 25), "the set has overflowing and medium headlines");
      await page.close();
    });
  } finally { await browser.close(); }
}
