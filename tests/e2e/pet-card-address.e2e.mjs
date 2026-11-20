// tests/e2e/pet-card-address.e2e.mjs — FIXED TEST SET, owner change 2026-11-20 (with go-live decision 152), headless Chrome.
// Until the site is live on its own domain the pet share card prints the brand only ("จาก LENSIQ" / "From LENSIQ" / "来自 LENSIQ"),
// no URL anywhere on the card, in every zodiac template, the 4 classic themes and the save-image / share / text fallback. The
// switch window.LENSIQ_CARD_SHOW_ADDRESS (lensiq-config.js, default false) brings the address back; coordinator decision: the
// QR code (it encodes the URL) follows the same switch. Locked (evals-locks/pet-card-address.sha256) BEFORE the product change.
// Node half: tests/unit/pet-card-address.test.js. Pictures: none (the card's own drawing); no real photo.
// Every fillText / strokeText on any canvas of the page is recorded (window.__TXT) to read what the card prints.
//   B1  zodiac mode (LENSIQ_PET_ZODIAC on, switch at its default): TH / EN / ZH x 13 templates x post / story: the card prints
//       the brand line, no URL / domain / "github" / "http"; __LQPET.cardText() (text fallback) the same; no QR drawn
//   B2  classic mode (zodiac off, and zodiac on with LENSIQ_PET_CARD_CLASSIC): TH / EN / ZH x 4 themes x post / story: same
//   B3  QR while the switch is off: the QR option is not shown; forcing it on draws no QR and loads no QR library
//   B4  share / save fallback while the switch is off: navigator.share gets the PNG and no URL in text / url / title; without
//       file sharing the card is saved as a PNG; no network request
//   B5  switch on (test only): the footer is "<brand> · anirut77.github.io/lensiq/petread.html" (zodiac and classic, TH / EN / ZH);
//       the QR option is shown and draws the QR
import { assert } from "./cdp.mjs";
import { sleep } from "./zones-lib.mjs";

const PET = { cls: 15, score: 0.91, x: 0.2, y: 0.15, w: 0.5, h: 0.7 };
const DET = `window.__PET_DETS = ${JSON.stringify([PET])}; window.__LQ_FAKE_DET = function (key) { return key === "pet" ? window.__PET_DETS : []; };`;
const ZON = `window.LENSIQ_PET_ZODIAC = true;`;
const CLASSIC = `window.LENSIQ_PET_CARD_CLASSIC = true;`;
const SHOW = `window.LENSIQ_CARD_SHOW_ADDRESS = true;`;
const LANG = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const CAP = `(() => { window.__TXT = []; for (const P of [CanvasRenderingContext2D.prototype]) for (const k of ["fillText", "strokeText"]) {
  const f = P[k]; P[k] = function (t, ...a) { window.__TXT.push(String(t)); return f.call(this, t, ...a); }; } })();`;
const LANGS = ["th", "en", "zh"];
const BRAND = { th: "จาก LENSIQ", en: "From LENSIQ", zh: "来自 LENSIQ" };
const ADDR = "anirut77.github.io/lensiq/petread.html";
const ZODIAC = ["rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "goat", "monkey", "rooster", "dog", "pig"];
const ALL = ZODIAC.concat(["secret"]);
const THEMES = ["sunny", "night", "mint", "blossom"];
const URLISH = /https?:|:\/\/|www\.|github|anirut77|\.html?\b|\/lensiq\b|\b[a-z0-9-]+\.(?:io|com|net|org|app|dev|co|th|ai|me|page|site|link|ly|xyz)\b/i;
const vis = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return !e.closest("[hidden]") && cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0; })()`;

async function open(browser, base, { lang = "th", init = [] } = {}) {
  const page = await browser.newPage(null, { isolated: true, initScripts: [LANG(lang), DET, CAP, ...init] });
  await page.goto(`${base}/petread.html?fakedet&nosw${lang !== "th" ? "&lang=" + lang : ""}`);
  await page.waitFor("window.__LQPET && window.__LQPET.ready", 15000);
  if (lang !== "th") await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
  return page;
}
async function readCard(page, zodiac) {
  await page.evaluate(() => {
    const s = document.querySelector('input[name="petSpecies"][value="cat"]'); if (s && !s.checked) s.click();
    const el = document.getElementById("petName"); el.value = "Mochi"; el.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("petRead").click();
  });
  await page.waitFor("document.querySelectorAll('#petReading .fa-section').length >= 2", 10000);
  await page.waitFor(`document.getElementById('petCard').dataset.drawn === '1'${zodiac ? " && !!document.getElementById('petCard').dataset.template" : ""}`, 10000);
  await sleep(200);
}
const snap = page => page.evaluate(() => ({ txt: window.__TXT.slice(), text: window.__LQPET.cardText(), qr: document.getElementById("petCard").dataset.qr,
  tpl: document.getElementById("petCard").dataset.template || "", theme: document.getElementById("petCard").dataset.theme || "",
  h: document.getElementById("petCard").height }));
function brandOnly(r, lang, tag) {
  assert(r.txt.length >= 5, `${tag}: nothing drawn`);
  assert(r.txt.includes(BRAND[lang]), `${tag}: brand footer not drawn: ${JSON.stringify(r.txt.slice(-3))}`);
  const bad = r.txt.concat(r.text).filter(t => URLISH.test(t));
  assert(!bad.length, `${tag}: URL on the card ${JSON.stringify(bad)}`);
  assert(r.text.includes(BRAND[lang]), `${tag}: text fallback lacks the brand line ${JSON.stringify(r.text.slice(-2))}`);
  assert(r.qr === "0", `${tag}: QR drawn`);
}
async function setSize(page, size) {
  const h = size === "story" ? 1920 : 1350;
  await page.evaluate(sz => document.querySelector(`.pet-size[data-size="${sz}"]`).click(), size);
  await page.waitFor(`document.getElementById('petCard').height === ${h}`, 4000);
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("B1 zodiac: 13 templates x post / story x TH / EN / ZH print the brand line, no URL, no QR", async () => {
      for (const lang of LANGS) {
        const page = await open(browser, base, { lang, init: [ZON] });
        await readCard(page, true);
        for (const size of ["post", "story"]) {
          await setSize(page, size);
          for (const id of ALL) {
            await page.evaluate(() => { window.__TXT.length = 0; });
            await page.evaluate(i => window.__LQPET.zodiacDraw(i), id);
            await page.waitFor(`document.getElementById("petCard").dataset.template === ${JSON.stringify(id)}`, 8000);
            const r = await snap(page);
            assert(r.tpl === id, `${lang} ${id}: template ${r.tpl}`);
            brandOnly(r, lang, `${lang} ${id} ${size}`);
          }
        }
        await page.close();
      }
    });

    await check("B2 classic: 4 themes x post / story x TH / EN / ZH (zodiac off, and zodiac on + classic) print the brand line, no URL", async () => {
      for (const [mode, init] of [["off", []], ["classic", [ZON, CLASSIC]]]) for (const lang of LANGS) {
        const page = await open(browser, base, { lang, init });
        await readCard(page, false);
        for (const size of ["post", "story"]) {
          await setSize(page, size);
          for (const theme of THEMES) {
            await page.evaluate(() => { window.__TXT.length = 0; });
            await page.evaluate(t => document.querySelector(`.pet-theme[data-theme="${t}"]`).click(), theme);
            await page.waitFor(`document.getElementById("petCard").dataset.theme === ${JSON.stringify(theme)}`, 4000);
            await sleep(60);
            const r = await snap(page);
            assert(!r.tpl, `${mode} ${lang}: a zodiac template in classic mode`);
            brandOnly(r, lang, `${mode} ${lang} ${theme} ${size}`);
          }
        }
        await page.close();
      }
    });

    await check("B3 switch off: no QR option shown; forcing it on draws no QR and loads no QR library", async () => {
      for (const init of [[], [ZON]]) {
        const page = await open(browser, base, { init });
        await readCard(page, init.length > 0);
        const shown = await page.evaluate(vis("#petQrOn"));
        assert(!shown, (init.length ? "zodiac" : "classic") + ": QR option shown while the switch is off");
        page.requests.length = 0;
        await page.evaluate(() => { window.__TXT.length = 0; const q = document.getElementById("petQrOn"); q.checked = true; q.dispatchEvent(new Event("change", { bubbles: true })); });
        await sleep(1200);
        const r = await snap(page);
        assert(r.qr === "0", "QR drawn after forcing the option: " + r.qr);
        assert(!page.requests.some(q => /qrcode/.test(q.url)), "QR library loaded: " + page.requests.map(q => q.url).join(", "));
        await page.close();
      }
    });

    await check("B4 share / save fallback: shared PNG with no URL in text / url / title; saved PNG without file sharing; no network", async () => {
      const HOOK = `window.__shared = []; window.__saved = [];
        const ck = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__saved.push({ name: this.download, href: this.href }); return; } return ck.call(this); };`;
      const MODES = {
        share: `navigator.canShare = () => true; navigator.share = d => { window.__shared.push({ text: d.text == null ? "" : String(d.text), url: d.url == null ? "" : String(d.url),
          title: d.title == null ? "" : String(d.title), files: (d.files || []).map(f => f.type) }); return Promise.resolve(); };`,
        none: `navigator.canShare = undefined; navigator.share = undefined;`,
      };
      for (const lang of LANGS) for (const [mode, js] of Object.entries(MODES)) {
        const page = await open(browser, base, { lang, init: [ZON, HOOK, js] });
        await readCard(page, true);
        page.requests.length = 0;
        await page.evaluate(() => document.getElementById("petCardShare").click());
        await sleep(1200);
        const r = await page.evaluate(() => ({ shared: window.__shared, saved: window.__saved }));
        if (mode === "share") {
          assert(r.shared.length === 1 && r.shared[0].files.length === 1 && r.shared[0].files[0] === "image/png" && !r.saved.length, `${lang} shared ${JSON.stringify(r)}`);
          const s = r.shared[0];
          assert(!URLISH.test(s.text) && !URLISH.test(s.url) && !URLISH.test(s.title), `${lang}: URL in the share data ${JSON.stringify(s)}`);
        } else assert(r.saved.length === 1 && /\.png$/.test(r.saved[0].name) && /^blob:/.test(r.saved[0].href), `${lang} ${mode}: saved ${JSON.stringify(r)}`);
        brandOnly(await snap(page), lang, `${lang} ${mode} fallback card`);
        const net = page.requests.filter(q => /^https?:/.test(q.url));
        assert(!net.length, `${lang} ${mode}: network ` + net.map(q => q.url).join(", "));
        await page.close();
      }
    });

    await check("B5 switch on (test only): footer brand · address, zodiac and classic, TH / EN / ZH; the QR option returns and draws", async () => {
      for (const lang of LANGS) for (const [mode, init] of [["zodiac", [ZON, SHOW]], ["classic", [SHOW]]]) {
        const page = await open(browser, base, { lang, init });
        await readCard(page, mode === "zodiac");
        const want = BRAND[lang] + " · " + ADDR;
        const r = await snap(page);
        assert(r.txt.includes(want), `${lang} ${mode}: footer ${JSON.stringify(r.txt.slice(-3))}`);
        assert(r.text.includes(want), `${lang} ${mode}: text fallback ${JSON.stringify(r.text.slice(-2))}`);
        const shown = await page.evaluate(vis("#petQrOn"));
        assert(shown, `${lang} ${mode}: QR option hidden with the switch on`);
        await page.evaluate(() => document.getElementById("petQrOn").click());
        await page.waitFor("document.getElementById('petCard').dataset.qr === '1'", 6000);
        await page.close();
      }
    });
  } finally { await browser.close(); }
}
