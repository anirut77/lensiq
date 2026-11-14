// tests/e2e/style.e2e.mjs — Style MVP (style.html: personal colour palette with the white-balance step,
// docs/STYLE-DESIGN.md §1.1-§1.3, §1.5, §3.3, §5). FIXED TEST: hash-locked in evals-locks/style-mvp.sha256 BEFORE
// style.html / style.js were written. Synthetic camera only (no person): a canvas with a skin-coloured block, a hair block,
// a grey (or white) card and a noisy background, optionally under a colour cast; the face mesh comes from the ?fakelm seam
// (window.__LQ_FAKE_LM) and the hair mask from ?fakeseg (window.__LQ_FAKE_SEG). The flag is turned on only by an init
// script (window.LENSIQ_STYLE = true before lensiq-config.js), never by the URL.
import { assert, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
// fake camera: canvas.captureStream from a synthetic scene; window.__STY_SCENE = {cast: [r, g, b] linear gains, card: [r, g, b]}
const SCENE = `(() => {
  const md = navigator.mediaDevices; if (!md) return;
  window.__STY = { gum: 0 };
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const enc = l => { l = Math.max(0, Math.min(1, l)); return 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055); };
  const frames = [];
  function build() {
    const s = Object.assign({ cast: [1, 1, 1], card: [118, 118, 118] }, window.__STY_SCENE || {}), W = 640, H = 480;
    const c = s.cast, col = v => v.map((x, i) => enc(lin(x) * c[i]));
    const skin = col([187, 140, 108]), hair = col([79, 63, 51]), card = col(s.card);
    let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    for (let f = 0; f < 3; f++) {
      const id = new ImageData(W, H), d = id.data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let v;
        if (x >= 220 && x < 420 && y >= 60 && y < 120) v = hair.map(q => q + (rnd() - 0.5) * 4);
        else if (x >= 220 && x < 420 && y >= 120 && y < 400) v = rnd() < 0.03 ? [250, 248, 246] : skin.map(q => q + (rnd() - 0.5) * 4);
        else if (x >= 480 && x < 570 && y >= 200 && y < 330) v = card.map(q => q + (rnd() - 0.5) * 3);
        else v = col([70, 90, 120]).map(q => q + (rnd() - 0.5) * 70);
        const i = (y * W + x) * 4; d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = 255;
      }
      frames.push(id);
    }
  }
  md.getUserMedia = async () => {
    window.__STY.gum++;
    if (!frames.length) build();
    const cv = document.createElement("canvas"); cv.width = 640; cv.height = 480;
    const cx = cv.getContext("2d"); let k = 0;
    const paint = () => { cx.putImageData(frames[k++ % frames.length], 0, 0); };
    paint(); const t = setInterval(paint, 66);
    const st = cv.captureStream(15); st.getTracks().forEach(tr => tr.addEventListener("ended", () => clearInterval(t)));
    window.__STY.stream = st;
    return st;
  };
  md.enumerateDevices = async () => [{ kind: "videoinput", deviceId: "sty-cam", label: "synthetic", groupId: "g" }];
})();`;
const FAKE_LM = `window.__LQ_FAKE_LM = () => { let s = 5; const r = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
  const pts = []; for (let i = 0; i < 478; i++) pts.push({ x: (240 + r() * 160) / 640, y: (140 + r() * 240) / 480, z: 0 });
  pts[0] = { x: 230 / 640, y: 250 / 480, z: 0 }; pts[1] = { x: 410 / 640, y: 250 / 480, z: 0 }; return pts; };
window.__LQ_FAKE_SEG = () => ({ hair: { x0: 225 / 640, y0: 62 / 480, x1: 415 / 640, y1: 118 / 480 } });`;
const ON = "window.LENSIQ_STYLE = true;";
const HEAVY = /vendor\/(ort|mediapipe|models|style)\/|lensiq-style\.js|lensiq-colour\.js|photobooth-hq\.js|lensiq-camera\.js/;
const RESEARCH = /face_expression|age_gender|faceparse|bisenet|face_landmark_68|tiny_face|face-api/i;

async function measure(page, { drapes = "skip" } = {}) {
  await page.waitFor("window.__style && window.__style.state.step === 'start'", 10000);
  await page.evaluate(() => document.getElementById("styGoA").click());
  await page.waitFor("window.__style.state.step === 'light'", 5000);
  await page.evaluate(() => document.getElementById("styOpen").click());
  await page.waitFor("window.__style.state.step === 'card' && window.__style.state.camera", 15000);
  await page.waitFor("window.__style.state.card && window.__style.state.card.ok === true", 15000);
  await page.waitFor("document.getElementById('styCardOk').disabled === false", 5000);
  await page.evaluate(() => document.getElementById("styCardOk").click());
  await page.waitFor("window.__style.state.step === 'drapes' || window.__style.state.step === 'result'", 30000);
  if (await page.evaluate(() => window.__style.state.step === "drapes")) {
    if (drapes === "skip") await page.evaluate(() => document.getElementById("stySkipDrapes").click());
    else for (const dim of ["warmth", "value", "chroma"]) {
      await page.evaluate((d, s) => document.querySelector(`#styDrapes [data-dim="${d}"][data-side="${s}"]`).click(), dim, drapes[dim] || "a");
      await sleep(150);
    }
  }
  await page.waitFor("window.__style.state.step === 'result'", 15000);
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__style.state.result)));
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("style: flag OFF by default: 'not available yet' in TH / EN / ZH, app hidden, nothing heavy loaded, no camera; URL cannot turn it on", async () => {
      for (const q of ["", "?lang=en", "?lang=zh", "?fakelm=1&fakeseg=1&demo=1&style=1&LENSIQ_STYLE=true"]) {
        const page = await browser.newPage(null, { initScripts: [SCENE] });
        await page.goto(`${base}/style.html${q}`);
        await sleep(1200);
        const s = await page.evaluate(() => {
          const off = document.getElementById("styOff"), app = document.getElementById("styApp");
          return { off: !!off && off.offsetParent !== null, txt: off ? off.textContent : "", app: !!app && app.hidden && app.offsetParent === null,
            flag: window.LENSIQ_STYLE, gum: window.__STY ? window.__STY.gum : -1, hook: !!window.__style, videos: document.querySelectorAll("video").length };
        });
        assert(s.off, q + " notice visible");
        assert(/ยังไม่เปิดให้ใช้งาน/.test(s.txt) && /not available yet/i.test(s.txt) && /尚未开放/.test(s.txt), q + " notice in 3 languages: " + s.txt);
        assert(s.app, q + " app hidden");
        assert(s.flag === false, q + " flag " + s.flag);
        assert(s.gum === 0, q + " camera never asked");
        const heavy = page.requests.filter(r => HEAVY.test(r.url) || RESEARCH.test(r.url));
        assert(!heavy.length, q + " heavy requests while off: " + heavy.map(r => r.url).join(", "));
        const errs = page.consoleErrors.filter(e => !/404/.test(e.text || ""));
        assert(!errs.length, q + " console errors " + JSON.stringify(errs));
        await page.close();
      }
    });

    let neutral;
    await check("style: flag ON (init script): start notice, card step finds the grey card, measurement gives two closest seasons + 12-16 swatches + confidence + disclaimer", async () => {
      const page = await browser.newPage(null, { initScripts: [SCENE, ON, FAKE_LM] });
      await page.goto(`${base}/style.html?fakelm=1&fakeseg=1`);
      await page.waitFor("window.__style && window.__style.state.step === 'start'", 10000);
      const s0 = await page.evaluate(() => ({ off: document.getElementById("styOff").offsetParent !== null, app: document.getElementById("styApp").hidden,
        txt: document.getElementById("styApp").textContent, c: document.getElementById("styGoC").offsetParent !== null, gum: window.__STY.gum,
        files: document.querySelectorAll("input[type=file]").length }));
      assert(!s0.off && !s0.app, "app shown, notice hidden");
      assert(/วิเคราะห์สี ไม่ใช่หน้าตา/.test(s0.txt) && /ประมวลผลในเครื่อง/.test(s0.txt) && /ไม่เก็บภาพ/.test(s0.txt), "start notice");
      assert(!s0.c, "entry C hidden: nothing saved on this device");
      assert(s0.gum === 0, "no camera before the user opens it");
      assert(s0.files === 0, "no upload of someone else's photo in the MVP");
      neutral = await measure(page);
      assert(neutral.status === "ok", "status " + JSON.stringify(neutral));
      assert(neutral.seasons.length === 2 && neutral.seasons[0] !== neutral.seasons[1], "two closest seasons");
      const ui = await page.evaluate(() => ({
        seasons: [...document.querySelectorAll("#stySeasons [data-season]")].map(e => e.dataset.season),
        swatches: document.querySelectorAll("#styPalette [data-hex]").length,
        band: (document.querySelector("#styUndertone [data-band]") || {}).dataset,
        conf: document.getElementById("styConf").textContent.trim(),
        disc: document.getElementById("styDisclaimer").textContent,
        away: document.getElementById("styResult").textContent,
        cam: window.__STY.stream.getTracks().every(t => t.readyState === "ended"),
        chart: !!document.querySelector("#styChart svg [data-dot]")
      }));
      assert(ui.seasons.join() === neutral.seasons.join(), "seasons shown " + ui.seasons);
      assert(ui.swatches >= 12 && ui.swatches <= 16, "swatches " + ui.swatches);
      assert(ui.band && ui.band.band === neutral.undertone.band, "undertone marker");
      assert(/สูง|กลาง|ต่ำ/.test(ui.conf), "confidence in words: " + ui.conf);
      assert(ui.disc.includes("ระบบซีซันสีเป็นความชอบเชิงอัตวิสัย ผลนี้เป็นคำแนะนำด้านสี ไม่ใช่การประเมินตัวคุณ"), "disclaimer on the result");
      assert(ui.away.includes("สีที่ใช้ห่างจากใบหน้าได้ดี"), "away-from-face group");
      assert(ui.chart, "2-D position chart");
      assert(ui.cam, "camera stopped once the result is shown");
      assert(!page.requests.some(r => RESEARCH.test(r.url)), "no research-licence model requested");
      await page.close();
    });

    await check("style: white-balance step: the same scene under a strong warm cast gives the same undertone band and top season", async () => {
      const page = await browser.newPage(null, { initScripts: ["window.__STY_SCENE = { cast: [1.35, 1.0, 0.62] };", SCENE, ON, FAKE_LM] });
      await page.goto(`${base}/style.html?fakelm=1&fakeseg=1`);
      const warm = await measure(page);
      assert(warm.status === "ok", "status " + warm.status);
      assert(warm.undertone.band === neutral.undertone.band, `band ${warm.undertone.band} vs ${neutral.undertone.band}`);
      assert(warm.seasons[0] === neutral.seasons[0], `top season ${warm.seasons[0]} vs ${neutral.seasons[0]}`);
      // drapes are the user's choice: gold + light + clear moves the result, nothing says what "looks better"
      await page.evaluate(() => document.getElementById("styAgain").click());
      const draped = await measure(page, { drapes: { warmth: "a", value: "a", chroma: "a" } });
      assert(draped.status === "ok" && draped.drapes && draped.drapes.warmth === "a", "drapes recorded " + JSON.stringify(draped.drapes));
      await page.close();
    });

    await check("style: a clipped white card is refused (no result, a clear reason), never a guess", async () => {
      const page = await browser.newPage(null, { initScripts: ["window.__STY_SCENE = { card: [255, 255, 255] };", SCENE, ON, FAKE_LM] });
      await page.goto(`${base}/style.html?fakelm=1&fakeseg=1`);
      await page.waitFor("window.__style && window.__style.state.step === 'start'", 10000);
      await page.evaluate(() => document.getElementById("styGoA").click());
      await page.evaluate(() => { const s = document.getElementById("styCardType"); s.value = "white"; s.dispatchEvent(new Event("change")); });
      await page.evaluate(() => document.getElementById("styOpen").click());
      await page.waitFor("window.__style.state.step === 'card' && window.__style.state.camera", 15000);
      await sleep(2500);
      const s = await page.evaluate(() => ({ card: window.__style.state.card, ok: document.getElementById("styCardOk").disabled,
        msg: document.getElementById("styCardMsg").textContent, res: window.__style.state.result }));
      assert(!s.card || s.card.ok !== true, "card not accepted " + JSON.stringify(s.card));
      assert(s.ok === true, "confirm stays disabled");
      assert(/สว่างเกิน|ขาวจัด|แสงจ้า|clipped/i.test(s.msg), "reason shown: " + s.msg);
      assert(!s.res, "no result");
      await page.close();
    });

    await check("style: card PNG from swatches only, opt-in save of derived colours, entry C, delete; nothing sent", async () => {
      const page = await browser.newPage(null, { initScripts: [SCENE, ON, FAKE_LM] });
      await page.goto(`${base}/style.html?fakelm=1&fakeseg=1`);
      const before = await page.evaluate(() => Object.keys(localStorage).filter(k => /style|palette|season/i.test(k)));
      assert(!before.length, "nothing stored before " + before);
      await measure(page);
      const stored0 = await page.evaluate(() => Object.keys(localStorage).filter(k => /style|palette|season/i.test(k)));
      assert(!stored0.length, "nothing stored by default " + stored0);
      const png = await page.evaluate(async () => {
        let n = 0; const orig = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function () { n++; return orig.apply(this, arguments); };
        const r = await window.__style.cardPng();
        CanvasRenderingContext2D.prototype.drawImage = orig;
        return { n, w: r && r.w, h: r && r.h, type: r && r.type };
      });
      assert(png.n === 0, "the card is drawn from swatches and text only (no picture): drawImage x" + png.n);
      assert(png.w > 0 && png.h > 0 && png.type === "image/png", "PNG " + JSON.stringify(png));
      await page.evaluate(() => { const c = document.getElementById("styRemember"); c.checked = true; c.dispatchEvent(new Event("change")); });
      const saved = await page.evaluate(() => { const k = Object.keys(localStorage).filter(x => /style/i.test(x)); return { k, v: k.length ? localStorage.getItem(k[0]) : "" }; });
      assert(saved.k.length === 1 && saved.k[0] === "lq-style-palette", "one key " + saved.k);
      const obj = JSON.parse(saved.v);
      assert(Object.keys(obj).sort().join() === "date,seasons,swatches,undertone,v", "derived colours only: " + saved.v);
      assert(!/data:image|"L"|"lab"|"skin"/i.test(saved.v), "no image, no skin values");
      await page.reload();
      await page.waitFor("window.__style && window.__style.state.step === 'start'", 10000);
      assert(await page.evaluate(() => document.getElementById("styGoC").offsetParent !== null), "entry C shown after an opt-in save");
      await page.evaluate(() => document.getElementById("styGoC").click());
      await page.waitFor("document.querySelectorAll('#styPalette [data-hex]').length >= 12", 5000);
      await page.evaluate(() => document.getElementById("styForget").click());
      await sleep(200);
      assert(await page.evaluate(() => localStorage.getItem("lq-style-palette") === null), "delete clears the saved palette");
      assert(!page.requests.some(r => r.method && r.method !== "GET"), "no non-GET request");
      const origin = new URL(base).origin;
      const off = page.requests.filter(r => /^https?:/.test(r.url) && new URL(r.url).origin !== origin);
      assert(!off.length, "no request leaves the site: " + off.map(r => r.url).join(", "));
      await privacyScan(page);
      const errs = page.consoleErrors.filter(e => !/404/.test(e.text || ""));
      assert(!errs.length, "console errors " + JSON.stringify(errs));
      await page.close();
    });

    await check("style: EN / ZH disclaimer and labels, no overflow at 390 px", async () => {
      for (const [lang, h1, disc] of [["en", /colou?r/i, "Colour seasons are a matter of taste. This is a colour suggestion, not an assessment of you."],
        ["zh", /色/, "色彩季型属于主观偏好。本结果仅为配色建议，并非对您本人的评价。"]]) {
        const page = await browser.newPage(null, { initScripts: [SCENE, ON, FAKE_LM] });
        await page.goto(`${base}/style.html?fakelm=1&fakeseg=1&lang=${lang}`);
        await page.waitFor("window.__style && window.__style.state.step === 'start'", 10000);
        await sleep(400);
        const t = await page.evaluate(() => document.querySelector("#styApp h1").textContent);
        assert(h1.test(t), lang + " h1 " + t);
        await measure(page);
        await sleep(300);
        const d = await page.evaluate(() => document.getElementById("styDisclaimer").textContent);
        assert(d.includes(disc), lang + " disclaimer " + d);
        await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await sleep(400);
        const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        await page.send("Emulation.clearDeviceMetricsOverride");
        assert(o.sw <= o.cw + 1, lang + " overflow at 390 " + JSON.stringify(o));
        await page.close();
      }
    });
  } finally {
    await browser.close();
  }
}
