// tests/e2e/style-s4.e2e.mjs — Style S4 (style.html: daily outfit and hair colour match from a flat-lay or garment photo,
// docs/STYLE-DESIGN.md §1.4, §3.4). FIXED TEST: hash-locked in evals-locks/style-s4.sha256 BEFORE style.html / style.js /
// lensiq-outfit.js were written. Synthetic only: the "photo" is a canvas drawn in the page (garment rectangles with noise
// on a plain background, no person) handed to the file input through DataTransfer. The switch is turned on only by an init
// script (window.LENSIQ_STYLE = true before lensiq-config.js), never by the URL. One browser.
import { assert, privacyScan } from "./cdp.mjs";
import { measureOnce } from "../../tools/perf-measure.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ON = "window.LENSIQ_STYLE = true;";
// window.__S4_FILE(kind) -> Promise<File>: "three" = navy / beige / brick-red garments on a light background; "clash" = two
// strong near-complementary colours at the same lightness; "empty" = background only
const SCENE = `(() => {
  const G = {
    three: [[[31, 45, 92], 50, 50, 230, 170], [[226, 212, 186], 360, 50, 220, 170], [[170, 72, 58], 200, 280, 200, 150]],
    clash: [[[214, 40, 40], 60, 80, 240, 300], [[0, 150, 160], 340, 80, 240, 300]],
    empty: []
  };
  window.__S4_TRUTH = G;
  window.__S4_FILE = kind => new Promise(res => {
    const W = 640, H = 480, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const cx = cv.getContext("2d"), id = cx.createImageData(W, H), d = id.data;
    let s = 9; const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c = [232, 228, 220], n = 3;
      for (const g of G[kind]) if (x >= g[1] && x < g[1] + g[3] && y >= g[2] && y < g[2] + g[4]) { c = g[0]; n = 6; }
      const i = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) d[i + k] = c[k] + (r() - 0.5) * 2 * n;
      d[i + 3] = 255;
    }
    cx.putImageData(id, 0, 0);
    cv.toBlob(b => res(new File([b], kind + ".png", { type: "image/png" })), "image/png");
  });
  window.__S4_ADD = async kind => {
    const f = await window.__S4_FILE(kind), dt = new DataTransfer(); dt.items.add(f);
    const inp = document.getElementById("styFile"); inp.files = dt.files;
    window.__S4_T0 = performance.now();
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  };
})();`;
const HEAVY = /lensiq-outfit\.js|lensiq-colour\.js|lensiq-luckycolor\.js|vendor\/(ort|mediapipe|models|style)\/|lensiq-style\.js|lensiq-camera\.js|photobooth-hq\.js/;
const RESEARCH = /face_expression|age_gender|faceparse|bisenet|face_landmark|tiny_face|face-api|multiclass/i;
const st = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__styleS4.state)));

async function addPhoto(page, kind) {
  const before = (await st(page)).photos;
  await page.evaluate(k => window.__S4_ADD(k), kind);
  await page.waitFor(`window.__styleS4.state.photos === ${before + 1} || window.__styleS4.state.error`, 15000);
  return page.evaluate(() => ({ ms: performance.now() - window.__S4_T0, s: JSON.parse(JSON.stringify(window.__styleS4.state)) }));
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("style-s4: switch OFF by default: 'not available yet' in TH / EN / ZH, app hidden, nothing loaded; the URL cannot turn it on", async () => {
      for (const q of ["", "?lang=en", "?lang=zh", "?style=1&LENSIQ_STYLE=true&demo=1"]) {
        const page = await browser.newPage(null, { initScripts: [SCENE], isolated: true });
        await page.goto(`${base}/style.html${q}`);
        await sleep(1000);
        const s = await page.evaluate(() => {
          const off = document.getElementById("styOff"), app = document.getElementById("styApp");
          return { off: !!off && off.offsetParent !== null, txt: off ? off.textContent : "", app: !!app && app.hidden && app.offsetParent === null,
            flag: window.LENSIQ_STYLE, hook: !!window.__styleS4, files: [...document.querySelectorAll("input[type=file]")].filter(e => e.offsetParent !== null).length };
        });
        assert(s.off, q + " notice visible");
        assert(/ยังไม่เปิดให้ใช้งาน/.test(s.txt) && /not available yet/i.test(s.txt) && /尚未开放/.test(s.txt), q + " notice in 3 languages");
        assert(s.app && s.flag === false && !s.hook && s.files === 0, q + " app hidden, flag off, no hook, no file input: " + JSON.stringify(s));
        const heavy = page.requests.filter(r => HEAVY.test(r.url) || RESEARCH.test(r.url));
        assert(!heavy.length, q + " loaded while off: " + heavy.map(r => r.url).join(", "));
        assert(!page.consoleErrors.length, q + " console errors " + JSON.stringify(page.consoleErrors));
        await page.close();
      }
    });

    await check("style-s4: ON: flat-lay photo -> 3 colour chips near the garments, colour harmony score with its label and reasons; nothing kept", async () => {
      const page = await browser.newPage(null, { initScripts: [SCENE, ON], isolated: true });
      await page.goto(`${base}/style.html`);
      await page.waitFor("window.__styleS4 && window.__styleS4.state.ready === true", 10000);
      const keys0 = await page.evaluate(() => ({ l: Object.keys(localStorage).sort(), s: Object.keys(sessionStorage).sort() }));
      const s0 = await page.evaluate(() => ({ txt: document.getElementById("styApp").textContent, look: document.getElementById("styLook").offsetParent !== null,
        res: document.getElementById("styResult").offsetParent !== null }));
      assert(/ประมวลผลในเครื่อง|บนเครื่องนี้/.test(s0.txt) && /ไม่เก็บภาพ/.test(s0.txt), "privacy notice");
      assert(/สังเคราะห์/.test(s0.txt), "claim states synthetic testing only");
      assert(!s0.look && !s0.res, "no result and no look suggestions before a photo");
      const { ms, s } = await addPhoto(page, "three");
      assert(!s.error, "error " + s.error);
      assert(ms <= 1500, "speed budget: photo to result " + Math.round(ms) + " ms > 1500");
      assert(s.items.length === 3, "3 chips: " + JSON.stringify(s.items.map(i => i.hex)));
      const dE = await page.evaluate(() => window.__S4_TRUTH.three.map(g => Math.min(...window.__styleS4.state.items.map(i => window.LQColour.deltaE2000(i.lab, window.LQColour.rgbToLab(g[0]))))));
      assert(dE.every(v => v <= 6), "chips within dE00 6 of the drawn garments: " + dE.map(v => v.toFixed(1)));
      const ui = await page.evaluate(() => ({ chips: document.querySelectorAll("#styChips [data-chip]").length, score: document.getElementById("styScore").textContent,
        label: document.getElementById("styResult").textContent, reasons: document.querySelectorAll("#styReasons li").length,
        exp: window.LQOutfit.harmony(window.__styleS4.state.items).score, imgs: [...document.querySelectorAll("img")].filter(i => /^(blob|data):/.test(i.src)).length,
        canv: document.querySelectorAll("canvas").length }));
      assert(ui.chips === 3, "chips in the DOM " + ui.chips);
      assert(ui.score.includes(String(ui.exp)) && s.harmony.score === ui.exp, "score shown = LQOutfit.harmony: " + ui.score + " vs " + ui.exp);
      assert(/คะแนนความกลมกลืนของสี/.test(ui.label), "score label");
      assert(ui.reasons >= 1, "at least one reason");
      assert(ui.imgs === 0 && ui.canv === 0, "the photo is not kept in the page (img " + ui.imgs + ", canvas " + ui.canv + ")");
      // remove a chip -> score recomputed; add a colour by hand
      await page.evaluate(() => document.querySelector("#styChips [data-chip] [data-remove]").click());
      await sleep(200);
      assert((await st(page)).items.length === 2, "chip removed");
      await page.evaluate(() => { const c = document.getElementById("styPick"); c.value = "#2f6b3a"; c.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("styPickAdd").click(); });
      await sleep(200);
      assert((await st(page)).items.length === 3, "colour added by hand");
      // a background-only photo says so and adds nothing
      const e = await page.evaluate(async () => { await window.__S4_ADD("empty"); await new Promise(r => setTimeout(r, 1500)); return JSON.parse(JSON.stringify(window.__styleS4.state)); });
      assert(e.items.length === 3 && /empty/.test(e.notice || ""), "empty photo: notice, no chips " + JSON.stringify({ n: e.items.length, notice: e.notice }));
      // clear
      await page.evaluate(() => document.getElementById("styClear").click());
      await sleep(200);
      const c = await st(page);
      assert(c.items.length === 0 && c.harmony === null, "clear removes everything");
      const keys1 = await page.evaluate(() => ({ l: Object.keys(localStorage).sort(), s: Object.keys(sessionStorage).sort() }));
      assert(JSON.stringify(keys0) === JSON.stringify(keys1), "no storage written: " + JSON.stringify([keys0, keys1]));
      await privacyScan(page);
      const out = page.requests.filter(r => r.method !== "GET" || !(r.url.startsWith(base) || r.url.startsWith("data:")) || r.postData);
      assert(!out.length, "nothing sent: " + out.map(r => r.method + " " + r.url).join(", "));
      assert(!page.requests.some(r => RESEARCH.test(r.url)), "no face or research model loaded");
      assert(!page.consoleErrors.length, "console errors " + JSON.stringify(page.consoleErrors));
      await page.close();
    });

    await check("style-s4: clash photo -> low band with the 'strong colours compete' reason; lucky link optional with the belief label", async () => {
      const page = await browser.newPage(null, { initScripts: [SCENE, ON], isolated: true });
      await page.goto(`${base}/style.html`);
      await page.waitFor("window.__styleS4 && window.__styleS4.state.ready === true", 10000);
      const { s } = await addPhoto(page, "clash");
      assert(s.items.length === 2, "2 chips");
      assert(s.harmony.band === "low" && s.harmony.reasons.includes("strongCompete"), "clash: " + JSON.stringify(s.harmony));
      const off = await page.evaluate(() => ({ vis: document.getElementById("styLuckyOut").offsetParent !== null, lucky: window.__styleS4.state.lucky }));
      assert(!off.vis && off.lucky === null, "lucky link off by default");
      await page.evaluate(() => { const b = document.getElementById("styLuckyOn"); b.click(); });
      await sleep(200);
      await page.evaluate(() => { const d = document.getElementById("styDay"); d.value = "3"; d.dispatchEvent(new Event("change", { bubbles: true }));
        const g = document.getElementById("styGoal"); g.value = "money"; g.dispatchEvent(new Event("change", { bubbles: true })); });
      await sleep(200);
      const on = await page.evaluate(() => ({ txt: document.getElementById("styLuckyOut").textContent, lucky: JSON.parse(JSON.stringify(window.__styleS4.state.lucky)),
        exp: JSON.parse(JSON.stringify(window.LQOutfit.lucky(window.__styleS4.state.items, 3, "money", window.LQLucky))) }));
      assert(/ตามความเชื่อ โปรดใช้วิจารณญาณ/.test(on.txt), "belief label next to the lucky link");
      assert(JSON.stringify(on.lucky) === JSON.stringify(on.exp), "lucky = LQOutfit.lucky(items, Wed, money)");
      assert(!/กาลกิณี|อัปมงคล|ห้าม/.test(on.txt), "positive wording only");
      await page.close();
    });

    await check("style-s4: look suggestions and hair colour only after the 18+ confirmation (not stored); suggestions are colour swaps / accents", async () => {
      const page = await browser.newPage(null, { initScripts: [SCENE, ON], isolated: true });
      await page.goto(`${base}/style.html`);
      await page.waitFor("window.__styleS4 && window.__styleS4.state.ready === true", 10000);
      await addPhoto(page, "clash");
      const a = await page.evaluate(() => ({ look: document.getElementById("styLook").offsetParent !== null, body: document.getElementById("styLookBody").offsetParent !== null }));
      assert(a.look && !a.body, "adult gate shown, suggestions hidden");
      await page.evaluate(() => document.getElementById("styAdult").click());
      await sleep(200);
      await page.evaluate(() => { const h = document.getElementById("styHair"); h.value = "darkBrown"; h.dispatchEvent(new Event("change", { bubbles: true })); });
      await sleep(200);
      const b = await page.evaluate(() => ({ body: document.getElementById("styLookBody").offsetParent !== null, sug: [...document.querySelectorAll("#stySuggest li")].map(l => l.dataset.key),
        hair: document.getElementById("styHairScore").textContent, st: JSON.parse(JSON.stringify(window.__styleS4.state)) }));
      assert(b.body, "suggestions visible after 18+");
      assert(b.sug.length >= 1 && b.sug.every(k => ["keep", "swapNeutral", "addAccentToday", "hairAccessory", "addContrast"].includes(k)), "suggestion keys " + b.sug);
      assert(b.sug.includes("swapNeutral") && b.sug.includes("hairAccessory"), "clash -> swap one piece; hair -> accessory colour");
      assert(b.st.hairMatch && b.hair.includes(String(b.st.hairMatch.score)), "hair harmony shown " + b.hair);
      const ls = await page.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)).filter(k => /adult|18|style|sty/i.test(k)));
      assert(!ls.length, "18+ not stored: " + ls);
      await page.reload();
      await page.waitFor("window.__styleS4 && window.__styleS4.state.ready === true", 10000);
      assert(!(await st(page)).adult, "18+ asked again after reload");
      await page.close();
    });

    await check("style-s4: 360 and 430 px, TH / EN / ZH: no sideways scroll, buttons >= 44 px, no Thai left in EN / ZH", async () => {
      for (const lang of ["th", "en", "zh"]) for (const w of [360, 430]) {
        const page = await browser.newPage(null, { initScripts: [SCENE, ON], isolated: true });
        await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 860, deviceScaleFactor: 2, mobile: true });
        await page.goto(`${base}/style.html${lang === "th" ? "" : "?lang=" + lang}`);
        await page.waitFor("window.__styleS4 && window.__styleS4.state.ready === true", 10000);
        await addPhoto(page, "three");
        await page.evaluate(() => { document.getElementById("styLuckyOn").click(); document.getElementById("styAdult").click(); });
        await sleep(lang === "th" ? 300 : 1200);
        const r = await page.evaluate(() => {
          const app = document.getElementById("styApp"), de = document.documentElement;
          const small = [...app.querySelectorAll("button, select, input[type=checkbox], label.sty-file")].filter(e => e.offsetParent !== null)
            .map(e => { const b = e.getBoundingClientRect(); const lab = e.closest("label"); const lb = lab ? lab.getBoundingClientRect() : b; return { id: e.id || e.className, h: Math.max(b.height, lb.height) }; })
            .filter(x => x.h < 44);
          const wide = [...app.querySelectorAll("*")].filter(e => e.getBoundingClientRect().right > de.clientWidth + 1).map(e => e.id || e.className).slice(0, 5);
          return { sw: de.scrollWidth, cw: de.clientWidth, small, wide, thai: /[฀-๿]/.test(app.innerText) };
        });
        assert(r.sw <= r.cw + 1 && !r.wide.length, `${lang} ${w}px sideways scroll ${r.sw} > ${r.cw}: ${r.wide}`);
        assert(!r.small.length, `${lang} ${w}px controls under 44 px: ${JSON.stringify(r.small)}`);
        if (lang !== "th") assert(!r.thai, `${lang} ${w}px Thai text left in the app`);
        await page.close();
      }
    });

    await check("style-s4: page weight budget before any user action: OFF <= 480 KB / 24 requests; ON <= 560 KB / 28 requests", async () => {
      const off = await measureOnce(browser, base, "style.html", { fast: true, capSec: 60 });
      console.log(`       style.html off: ${off.kb} KB, ${off.requests} requests`);
      assert(off.kb <= 480 && off.requests <= 24, `off ${off.kb} KB / ${off.requests} req`);
      const on = await measureOnce(browser, base, "style.html", { fast: true, capSec: 60, initScripts: [ON] });
      console.log(`       style.html on: ${on.kb} KB, ${on.requests} requests`);
      assert(on.kb <= 560 && on.requests <= 28, `on ${on.kb} KB / ${on.requests} req`);
    });
  } finally { await browser.close(); }
}
