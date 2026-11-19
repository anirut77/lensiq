// tests/e2e/palm-honesty.e2e.mjs — owner decision 163 ก (2026-11-19), LIVE palm page honesty fix. Locked BEFORE the fix
// (phase palm-honesty). The page gets a SYNTHETIC upload (no photo of a person): a flat skin-tone image, optionally with
// dark creases drawn along the life / head / heart templates of the hand the scripted detector reports (?fakedet).
//   E1 (TH, EN, ZH) no crease: life / head / heart / fate are in the "not clear" state, each line chip and each result
//      card says ไม่ชัดในภาพนี้ / Not clear in this photo / 此照片中不清楚, no line is drawn in a line colour on the editor
//      or the result image, the reading (narrative, line cards, extras, mounts, tips, raw values) names none of them,
//      the facts hold no line item, and the fate line is not read as absent
//   E2 (TH) control: creases on life / head / heart -> those three are detected, drawn and read; fate (no crease) is
//      "not clear", not drawn, not read and not read as absent
//   E3 (TH, EN, ZH) placeholder until the owner approves the wording: the old mounts label "(ประเมินจากภาพ)" /
//      "(estimated from the photo)" / "（根据照片估算）" is gone
import { assert, assertNoWebGL, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const HAND = { x: 0.3, y: 0.15, w: 0.4, h: 0.7, score: 0.95, side: "left" };
const IDS = ["life", "head", "heart", "fate"];
const UNCLEAR = { th: "ไม่ชัดในภาพนี้", en: "Not clear in this photo", zh: "此照片中不清楚" };
const NAMES = {
  th: { life: ["เส้นชีวิต"], head: ["เส้นสมอง"], heart: ["เส้นหัวใจ"], fate: ["เส้นวาสนา"] },
  en: { life: ["life line"], head: ["head line"], heart: ["heart line"], fate: ["fate line"] },
  zh: { life: ["生命线"], head: ["智慧线"], heart: ["感情线"], fate: ["事业线"] }
};
const ABSENT = { th: ["มองไม่เห็นเส้นวาสนา", "ไม่มีเส้นวาสนา"], en: ["no fate line", "not distinct"], zh: ["看不到事业线", "没有事业线", "不明显"] };
const OLD_MEST = { th: "(ประเมินจากภาพ)", en: "(estimated from the photo)", zh: "（根据照片估算）" };
const COLORS = { life: "#f97316", head: "#22d3ee", heart: "#f472b6", fate: "#a78bfa" };

const detScript = `(() => { window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const langInit = lang => `try { localStorage.setItem("lq-lang", ${JSON.stringify(lang)}); } catch (e) {}`;

/** synthetic palm upload: flat skin tone (+ optional creases along the templates of the scripted hand) */
async function upload(page, creases) {
  await page.evaluate(async (box, cr) => {
    const W = 900, H = 1100, c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d"); x.fillStyle = "rgb(214,172,142)"; x.fillRect(0, 0, W, H);
    if (cr.length) {
      const PC = window.PalmCore, h = PC.handFromLandmarks(PC.synthHand({ x: box.x * W, y: box.y * H, w: box.w * W, h: box.h * H }, box.side)), F = PC.palmFrame(h);
      x.strokeStyle = "rgb(150,104,84)"; x.lineWidth = 3; x.lineCap = "round"; x.lineJoin = "round";
      for (const id of cr) { const sp = PC.spline(PC.TEMPLATES[id].pts, 120).map(F.toImg); x.beginPath(); sp.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke(); }
    }
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    const dt = new DataTransfer(); dt.items.add(new File([blob], "synthetic-palm.png", { type: "image/png" }));
    const inp = document.getElementById("plFile"); inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true }));
  }, HAND, creases);
  await page.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
}
/** pixels in a canvas close to a line colour */
const colourCount = (page, sel) => page.evaluate((s, cols) => {
  const cv = document.querySelector(s), d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data, out = {};
  for (const [id, hex] of Object.entries(cols)) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r) < 24 && Math.abs(d[i + 1] - g) < 24 && Math.abs(d[i + 2] - b) < 24) n++;
    out[id] = n;
  }
  return out;
}, sel, COLORS);
/** the reading as shown: narrative, found-line cards, fingers, extras, mounts, tips, raw values (status cards excluded) */
const readingText = page => page.evaluate(() => {
  const parts = ["#plNarr", "#plFingers", "#plExtras", "#plMountEst", "#plTips", "#plRaw", "#plElement"].map(s => (document.querySelector(s) || {}).textContent || "");
  document.querySelectorAll("#plLines .line-card:not(.unclear)").forEach(e => parts.push(e.textContent));
  return parts.join("\n");
});
function realErrors(page) {
  return page.consoleErrors.filter(e => !/\/api\/[a-z]+\/status/.test((e.url || "") + " " + (e.text || "")) && !(e.kind !== "exception" && /404/.test(e.text || "") && /\/api\//.test(e.url || "")));
}
async function open(browser, base, lang) {
  const page = await browser.newPage(null, { initScripts: [langInit(lang), detScript] });
  await page.goto(`${base}/palm.html?cpu&fakedet`);
  await page.waitFor(`!!(window.__palm && window.PalmCore && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
  if (lang !== "th") await page.waitFor(`document.documentElement.lang === ${JSON.stringify(lang === "zh" ? "zh-Hans" : "en")}`, 8000);
  await page.evaluate(d => { window.__dets = d; }, [HAND]);
  return page;
}
async function read(page) {
  await page.evaluate(() => document.getElementById("plRead").click());
  await page.waitFor(`!document.getElementById("plResult").hidden && document.querySelectorAll("#plNarr .fa-section").length >= 2`, 20000);
  await sleep(300);
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const lang of ["th", "en", "zh"]) {
      await check(`palm honesty ${lang}: no crease -> life/head/heart/fate 'not clear', not drawn, not read; fate not read as absent; old mounts label gone`, async () => {
        const page = await open(browser, base, lang);
        try {
          await assertNoWebGL(page);
          await upload(page, []);
          const st = await page.evaluate(() => { const S = window.__palm.S; return Object.fromEntries(["life", "head", "heart", "fate"].map(id => [id, { present: S.auto[id].present, unclear: S.auto[id].unclear, lp: S.lines[id].present, lu: S.lines[id].unclear }])); });
          for (const id of IDS) assert(st[id].present === false && st[id].unclear === true && st[id].lp === false && st[id].lu === true, `${lang} ${id} state ` + JSON.stringify(st[id]));
          const chips = await page.evaluate(() => [...document.querySelectorAll("#plLineChips [data-line]")].map(b => ({ id: b.dataset.line, t: b.textContent })));
          assert(chips.length === 4, "chips " + JSON.stringify(chips));
          for (const c of chips) assert(c.t.includes(UNCLEAR[lang]), `${lang} chip ${c.id}: "${c.t}"`);
          assert(!(await page.evaluate(() => document.getElementById("plFateNone").checked)), `${lang}: 'no fate line' ticked by the detector`);
          // editor: no line drawn in a line colour, whichever line is selected
          for (const id of IDS) {
            await page.evaluate(i => document.querySelector(`#plLineChips [data-line="${i}"]`).click(), id);
            await sleep(80);
            const n = await colourCount(page, "#plEditCanvas");
            for (const k of IDS) assert(n[k] < 30, `${lang} editor (${id} selected): ${k} drawn in its line colour (${n[k]} px)`);
          }
          await read(page);
          const n2 = await colourCount(page, "#plResCanvas");
          for (const k of IDS) assert(n2[k] < 30, `${lang} result image: ${k} drawn (${n2[k]} px)`);
          const cards = await page.evaluate(() => ({ found: document.querySelectorAll("#plLines .line-card:not(.unclear)").length,
            unclear: [...document.querySelectorAll("#plLines .line-card.unclear")].map(e => ({ id: e.dataset.line, t: e.textContent })) }));
          assert(cards.found === 0, `${lang}: ${cards.found} line cards read`);
          assert(cards.unclear.length === 4 && IDS.every(id => cards.unclear.some(u => u.id === id && u.t.includes(UNCLEAR[lang]))), `${lang} unclear cards ` + JSON.stringify(cards.unclear));
          const txt = await readingText(page), low = txt.toLowerCase();
          for (const id of IDS) for (const nm of NAMES[lang][id]) assert(!low.includes(nm.toLowerCase()), `${lang}: reading names ${nm} (${id} not clear): …${txt.slice(Math.max(0, low.indexOf(nm.toLowerCase()) - 60), low.indexOf(nm.toLowerCase()) + 60)}…`);
          for (const a of ABSENT[lang]) assert(!low.includes(a.toLowerCase()), `${lang}: fate read as absent ("${a}")`);
          const ids = await page.evaluate(() => window.__palm.S.facts.items.map(i => i.id));
          assert(!ids.some(i => /^(life|head|heart|fate)\./.test(i)), `${lang}: line facts ` + ids.join(","));
          const mest = await page.evaluate(() => (document.querySelector('[data-i18n="palm.mestSmall"]') || {}).textContent || "");
          assert(mest.trim(), `${lang}: mounts label missing`);
          assert(mest.trim() !== OLD_MEST[lang], `${lang}: old mounts label still shown "${mest}"`);
          await privacyScan(page);
          const errs = realErrors(page);
          assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
        } finally { await page.close(); }
      });
    }

    await check("palm honesty control (th): creases on life/head/heart -> detected, drawn, read; fate without crease -> not clear, not drawn, not read as absent", async () => {
      const page = await open(browser, base, "th");
      try {
        await upload(page, ["life", "head", "heart"]);
        const st = await page.evaluate(() => { const S = window.__palm.S; return Object.fromEntries(["life", "head", "heart", "fate"].map(id => [id, { present: S.auto[id].present, unclear: !!S.auto[id].unclear, conf: S.auto[id].auto.conf }])); });
        for (const id of ["life", "head", "heart"]) assert(st[id].present === true && st[id].unclear === false, `${id} not detected ` + JSON.stringify(st[id]));
        assert(st.fate.present === false && st.fate.unclear === true, "fate " + JSON.stringify(st.fate));
        const chip = await page.evaluate(() => document.querySelector('#plLineChips [data-line="fate"]').textContent);
        assert(chip.includes(UNCLEAR.th), "fate chip " + chip);
        await read(page);
        const n = await colourCount(page, "#plResCanvas");
        for (const id of ["life", "head", "heart"]) assert(n[id] >= 30, `result image: ${id} not drawn (${n[id]} px)`);
        assert(n.fate < 30, `result image: fate drawn (${n.fate} px)`);
        const cards = await page.evaluate(() => ({ found: [...document.querySelectorAll("#plLines .line-card:not(.unclear)")].map(e => e.dataset.line),
          unclear: [...document.querySelectorAll("#plLines .line-card.unclear")].map(e => e.dataset.line) }));
        assert(cards.found.sort().join() === "head,heart,life" && cards.unclear.join() === "fate", JSON.stringify(cards));
        const txt = await readingText(page);
        assert(!txt.includes("เส้นวาสนา") && !txt.includes("มองไม่เห็นเส้นวาสนา") && !txt.includes("ไม่มีเส้นวาสนา"), "fate named / read as absent: " + txt.slice(Math.max(0, txt.indexOf("วาสนา") - 60), txt.indexOf("วาสนา") + 60));
        assert(txt.includes("เส้นชีวิต") && txt.includes("เส้นสมอง") && txt.includes("เส้นหัวใจ"), "found lines not read");
        const ids = await page.evaluate(() => window.__palm.S.facts.items.map(i => i.id));
        assert(!ids.some(i => /^fate\./.test(i)) && ["life.", "head.", "heart."].every(p => ids.some(i => i.startsWith(p))), "facts " + ids.join(","));
        const errs = realErrors(page);
        assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
}
