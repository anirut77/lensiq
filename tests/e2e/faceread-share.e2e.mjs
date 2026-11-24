// tests/e2e/faceread-share.e2e.mjs — acceptance sheet docs/acceptance/faceread.md row X, "share" item, on the page as it is on main:
// the "share result card" button. A reading is made with the test detector (?fakedet on localhost: a scripted face, no model, no
// person, no photo of anyone: the upload is a plain grey picture). Per language TH / EN / ZH:
//  S1 Web Share available: one PNG card 1080 x 1350 is handed to navigator.share with a title and a text in the chosen language
//     (EN / ZH: no Thai letters), and the card is shown on the page;
//  S2 photo OFF by default: the result photo is not drawn on the card; with "put my photo on the card" ticked it is (the user's choice);
//  S3 no Web Share: the card is saved as a PNG download instead and a toast says so in the chosen language;
//  S4 nothing is sent anywhere: no request leaves the page while the card is made and shared.
import { assert } from "./cdp.mjs";

const THAI = /[฀-๿]/;
const INIT = `window.__LQ_FAKE_DET = function () { return [{ x: 0.3, y: 0.2, w: 0.4, h: 0.55, score: 0.97 }]; };
  window.__shared = []; window.__downloads = []; window.__drawsFromResult = 0;
  (function () {
    var d = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (src) { if (src && src.id === "frResCanvas" && this.canvas && this.canvas.width === 1080) window.__drawsFromResult++; return d.apply(this, arguments); };
    var c = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__downloads.push(this.download); return; } return c.apply(this, arguments); };
  })();`;
const SHARE_ON = `navigator.canShare = function () { return true; };
  navigator.share = function (d) { window.__shared.push(d); return Promise.resolve(); };`;
const SHARE_OFF = "navigator.canShare = undefined; navigator.share = undefined;";
const GREY = async () => {
  const cv = document.createElement("canvas"); cv.width = 640; cv.height = 480;
  const g = cv.getContext("2d"); g.fillStyle = "#8a8a8a"; g.fillRect(0, 0, 640, 480);
  const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", 0.9));
  const inp = document.querySelector("#frFile"), dt = new DataTransfer();
  dt.items.add(new File([blob], "grey.jpg", { type: "image/jpeg" })); inp.files = dt.files;
  inp.dispatchEvent(new Event("change", { bubbles: true }));
};

async function reading(browser, base, lang, extra) {
  const p = await browser.newPage(null, { initScripts: [INIT, extra], isolated: true, timeout: 30000 });
  await p.goto(`${base}/faceread.html?lang=${lang}&fakedet`);
  await p.waitFor("!!window.FRCore && !!document.querySelector('#frFile') && !!window.LQI18N", 20000);
  await p.evaluate(GREY);
  await p.waitFor("(() => { const f = document.querySelector('#frForce'); if (f && !f.hidden) f.click(); return !document.querySelector('#frResult').hidden && document.querySelector('#frNarr').textContent.trim().length > 20 && document.querySelector('#frNarr').getAttribute('aria-busy') !== 'true'; })()", 30000);
  return p;
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const lang of ["th", "en", "zh"]) {
      await check(`faceread share ${lang}: S1 card handed to Web Share in ${lang}, S2 photo off by default / on when ticked, S4 nothing sent`, async () => {
        const p = await reading(browser, base, lang, SHARE_ON);
        assert(await p.evaluate(() => document.querySelector("#frPhotoCard").checked === false), "photo-on-card is off by default");
        const before = p.requests.length;
        await p.evaluate(() => document.querySelector("#frShare").click());
        await p.waitFor("window.__shared.length === 1", 15000);
        const s = await p.evaluate(async () => {
          const d = window.__shared[0], f = d.files && d.files[0], bm = f ? await createImageBitmap(f) : null;
          return { n: d.files ? d.files.length : 0, type: f && f.type, name: f && f.name, w: bm && bm.width, h: bm && bm.height, title: d.title, text: d.text,
            shown: !document.querySelector("#frCardImg").hidden, draws: window.__drawsFromResult };
        });
        assert(s.n === 1 && s.type === "image/png" && s.w === 1080 && s.h === 1350, "one PNG card 1080x1350: " + JSON.stringify(s));
        assert(s.title && s.title.length > 3 && s.text && s.text.length > 3, "title and text: " + JSON.stringify(s));
        if (lang !== "th") assert(!THAI.test(s.title + " " + s.text + " " + s.name), `${lang}: no Thai in the shared title / text / file name: ` + JSON.stringify(s));
        assert(s.shown, "the card is shown on the page");
        assert(s.draws === 0, "S2: the photo is not on the card by default (draws from the result photo: " + s.draws + ")");
        // the user's own choice: tick "put my photo on the card"
        await p.evaluate(() => { const c = document.querySelector("#frPhotoCard"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); document.querySelector("#frShare").click(); });
        await p.waitFor("window.__shared.length === 2", 15000);
        assert(await p.evaluate(() => window.__drawsFromResult > 0), "S2: with the box ticked the photo is on the card");
        const sent = p.requests.slice(before).filter(r => /^https?:/.test(r.url) && !/\/fonts?\/|\.woff2?(\?|$)|fonts\.g(static|oogleapis)\.com/.test(r.url));
        assert(!sent.length, "S4: requests while sharing: " + sent.map(r => r.method + " " + r.url).join(", "));
        await p.close();
      });
      await check(`faceread share ${lang}: S3 no Web Share -> PNG download and a toast in ${lang}`, async () => {
        const p = await reading(browser, base, lang, SHARE_OFF);
        await p.evaluate(() => document.querySelector("#frShare").click());
        await p.waitFor("window.__downloads.length === 1", 15000);
        const r = await p.evaluate(() => ({ file: window.__downloads[0], toast: document.querySelector("#frToast").textContent }));
        assert(/\.png$/.test(r.file), "download is a PNG: " + r.file);
        assert(r.toast.trim().length > 2, "toast shown: " + JSON.stringify(r));
        if (lang !== "th") assert(!THAI.test(r.toast + r.file), `${lang}: no Thai in the toast / file name: ` + JSON.stringify(r));
        await p.close();
      });
    }
  } finally { await browser.close(); }
}
