// tests/e2e/fortune-reword-note.e2e.mjs — owner inbox entry 20 (2026-11-23): the sentence explaining the re-word button
// ("ทุกครั้งที่กด ระบบจะเรียบเรียงใหม่จากผลวัดชุดเดิม ความหมายหลักไม่เปลี่ยน", EN/ZH and variants) is not shown on palm
// and face reading in TH / EN / ZH, on screen or in print; the button is still there, re-words the same reading (opening
// and closing sections kept) and is enabled again afterwards. Fake camera + scripted detector, 390 px.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const VARIANTS = [
  "ทุกครั้งที่กด[^\\n]{0,60}เรียบเรียง", "เรียบเรียง(?:ใหม่)?จากผลวัด", "ผลวัดชุดเดิม", "ความหมายหลัก(?:ยัง)?ไม่เปลี่ยน",
  "\\b(?:each|every)\\s+(?:tap|press|click)\\b[^\\n]{0,80}\\b(?:re-?word|rephras|re-?arrang|re-?compos)",
  "\\bfrom the same (?:set of )?measurements\\b", "\\b(?:core|main) meaning (?:stays|remains|is) (?:the same|unchanged)\\b",
  "每次(?:点击|按|点)[^\\n]{0,60}重新(?:组织|措辞|表述|编排)", "同一组测量", "(?:核心|主要)含义不变",
];
// visible text + every hidden/print-only text node + attributes (title / aria-label) — nothing of the sentence anywhere in the DOM
const SCAN = `(() => {
  const res = ${JSON.stringify(VARIANTS)}.map(s => new RegExp(s, "i"));
  const parts = [document.body.innerText, document.body.textContent];
  for (const el of document.querySelectorAll("[title],[aria-label],[data-i18n]")) parts.push(el.getAttribute("title") || "", el.getAttribute("aria-label") || "");
  const all = parts.join("\\n");
  return { hits: res.filter(r => r.test(all)).map(String), keys: [...document.querySelectorAll("[data-i18n$='regenNote']")].length };
})()`;
const SECS = sel => `[...document.querySelectorAll("${sel} .fa-section")].map(s => s.getAttribute("data-section"))`;
const TEXT = sel => `[...document.querySelectorAll("${sel} .fa-section")].map(s => s.textContent).join("|")`;
const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const ev = (page, fn, ...a) => page.evaluate(fn, ...a);
const LANG_ATTR = { th: "th", en: "en", zh: "zh-Hans" };

const PAGES = [
  { page: "faceread.html", narr: "#frNarr", btn: "frRegen", read: async p => {
    await ev(p, () => document.getElementById("frStartCam").click());
    await p.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
    await ev(p, d => { window.__dets = d; }, [FACE]);
    await p.waitFor(`!document.getElementById("frRead").disabled`, 8000);
    await ev(p, () => document.getElementById("frRead").click());
    await p.waitFor(`!document.getElementById("frResult").hidden && document.querySelectorAll("#frNarr .fa-section").length >= 3 && !document.getElementById("frRegen").disabled`, 20000);
  } },
  { page: "palm.html", narr: "#plNarr", btn: "plRegen", read: async p => {
    await p.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
    await ev(p, () => document.getElementById("plStartCam").click());
    await p.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 10000);
    await ev(p, d => { window.__dets = d; }, [HAND]);
    await sleep(600);
    await ev(p, () => document.getElementById("plSnap").click());
    await p.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
    await ev(p, () => document.getElementById("plRead").click());
    await p.waitFor(`!document.getElementById("plResult").hidden && document.querySelectorAll("#plNarr .fa-section").length >= 3 && !document.getElementById("plRegen").disabled`, 20000);
  } },
];

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const P of PAGES) for (const lang of ["th", "en", "zh"]) {
      await check(`entry 20: ${P.page} (${lang}) shows no re-word explanation on screen or in print; the button still re-words the same reading`, async () => {
        const init = `try { localStorage.setItem("lq-lang", ${JSON.stringify(lang)}); } catch (e) {}`;
        const page = await browser.newPage(null, { initScripts: [init, fakeCams, detScript] });
        try {
          await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
          await page.goto(`${base}/${P.page}?cpu&fakedet`);
          await page.waitFor(`document.documentElement.lang === ${JSON.stringify(LANG_ATTR[lang])}`, 8000);
          const s0 = await page.evaluate(SCAN);
          assert(!s0.hits.length && !s0.keys, `${P.page} ${lang} before reading: ${s0.hits.join(", ")} keys ${s0.keys}`);
          await P.read(page);
          await sleep(500);
          const s1 = await page.evaluate(SCAN);
          assert(!s1.hits.length && !s1.keys, `${P.page} ${lang} after reading: ${s1.hits.join(", ")}`);
          const btnOk = await ev(page, id => { const b = document.getElementById(id); return !!b && !b.hidden && b.offsetWidth > 0 && b.textContent.trim().length > 0; }, P.btn);
          assert(btnOk, `${P.page} ${lang}: re-word button missing or hidden`);
          const secs1 = await page.evaluate(SECS(P.narr)), text1 = await page.evaluate(TEXT(P.narr));
          // press up to 4 times: every press keeps the opening and closing sections; at least one press re-words
          let changed = false;
          for (let i = 0; i < 4 && !changed; i++) {
            await ev(page, id => document.getElementById(id).click(), P.btn);
            await page.waitFor(`!document.getElementById(${JSON.stringify(P.btn)}).disabled && !document.querySelector("${P.narr}").hasAttribute("aria-busy") && document.querySelectorAll("${P.narr} .fa-section").length >= 3`, 20000);
            const secs2 = await page.evaluate(SECS(P.narr)), text2 = await page.evaluate(TEXT(P.narr));
            assert(secs2[0] === secs1[0] && secs2[secs2.length - 1] === secs1[secs1.length - 1], `${P.page} ${lang}: press changed the reading frame ${secs1} → ${secs2}`);
            changed = text2 !== text1;
          }
          assert(changed, `${P.page} ${lang}: four presses gave the same wording (re-word broken)`);
          const s2 = await page.evaluate(SCAN);
          assert(!s2.hits.length, `${P.page} ${lang} after a press: ${s2.hits.join(", ")}`);
          await page.send("Emulation.setEmulatedMedia", { media: "print" });
          await sleep(200);
          const s3 = await page.evaluate(SCAN);
          assert(!s3.hits.length, `${P.page} ${lang} print: ${s3.hits.join(", ")}`);
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
}
