// tests/e2e/fortune-zh.e2e.mjs — 中文 mode audit of all 11 fortune pages.
// Each page is opened with lq-lang = zh, measured on load, then a reading is produced (forms filled, cards drawn,
// fake camera + scripted detector for face/palm) and measured again. "Visible text" = text nodes that are rendered
// (same rule as the evaluator's zh.mjs: not display:none / hidden / zero-size). Asserts per page:
//   * Thai characters ≤ 5 % of Thai + Chinese characters, before and after the reading
//   * the reading itself (every .fa-section) contains no Thai at all and is longer than 120 汉字
// Prints a table of Thai share per page (also the measurement script for docs/I18N.md: node tests/e2e/run.mjs fortune-zh).
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const MEASURE = `(() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let th = 0, zh = 0, n; const samples = [];
  while ((n = w.nextNode())) {
    const el = n.parentElement; if (!el) continue;
    const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || el.closest("[hidden]")) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const t = n.textContent.trim(); if (!t) continue;
    const a = (t.match(/[\\u0E00-\\u0E7F]/g) || []).length, c = (t.match(/[\\u4e00-\\u9fff]/g) || []).length;
    th += a; zh += c; if (a > 2 && samples.length < 4) samples.push(t.slice(0, 50));
  }
  const rd = [...document.querySelectorAll(".fa-section, .fs-sec")].map(s => s.textContent).join("");
  return { th, zh, share: th / (th + zh || 1), samples, readingThai: (rd.match(/[\\u0E00-\\u0E7F]/g) || []).length, readingZh: (rd.match(/[\\u4e00-\\u9fff]/g) || []).length };
})()`;
const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const zhInit = `try { localStorage.setItem("lq-lang", "zh"); } catch (e) {}`;
const ev = (page, fn, ...a) => page.evaluate(fn, ...a);
const sections = n => `document.querySelectorAll(".fa-section, .fs-sec").length >= ${n} && ![...document.querySelectorAll(".fa-section, .fs-sec")].some(s => /กำลังเรียบเรียง/.test(s.textContent))`;
const setSel = (id, v) => `(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;

// page → { url, cam, read(page) } ; read() produces a reading (or null for the hub)
const PAGES = [
  { page: "fortune.html", read: null },
  { page: "iching.html", read: async p => { await ev(p, () => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); }); await p.waitFor(sections(3), 20000); } },
  { page: "zodiac.html", read: async p => { await ev(p, () => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); }); await p.waitFor(sections(3), 15000); } },
  { page: "astro.html", read: async p => { await ev(p, setSel("asDay", "15")); await ev(p, setSel("asMonth", "5")); await ev(p, setSel("asYear", "2533")); await ev(p, () => document.getElementById("asForm").requestSubmit()); await p.waitFor(sections(3), 15000); } },
  { page: "dream.html", read: async p => { await ev(p, setSel("drText", "梦见家里有一条大蛇，后来坐飞机去了海边")); await p.waitFor(`!document.getElementById("drGo").disabled`, 5000); await ev(p, () => document.getElementById("drGo").click()); await p.waitFor(sections(3), 15000); } },
  { page: "tarot.html", read: async p => { await ev(p, () => { document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click(); document.getElementById("trStart").click(); }); await sleep(600); await ev(p, () => document.getElementById("trAuto").click()); await sleep(900); await ev(p, () => document.getElementById("trReveal").click()); await p.waitFor(sections(3), 25000); } },
  { page: "horoscope.html", read: async p => { await ev(p, setSel("hsDay", "15")); await ev(p, setSel("hsMonth", "8")); await ev(p, setSel("hsYear", "1990")); await ev(p, () => document.getElementById("hsGo").click()); await p.waitFor(sections(3), 20000); } },
  { page: "numbers.html", read: async p => { await ev(p, setSel("nmPhone", "0812345678")); await ev(p, () => document.getElementById("nmGo").click()); await p.waitFor(sections(2), 15000); } },
  { page: "fengshui.html", read: async p => { await ev(p, setSel("fsDay", "15")); await ev(p, setSel("fsMonth", "6")); await ev(p, setSel("fsYear", "2533")); await ev(p, () => document.getElementById("fsKuaForm").requestSubmit()); await sleep(500); await ev(p, () => document.getElementById("fsReadBtn").click()); await p.waitFor(sections(2), 15000); } },
  { page: "faceread.html", q: "?cpu&fakedet", cam: true, read: async p => {
    await ev(p, () => document.getElementById("frStartCam").click());
    await p.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
    await ev(p, d => { window.__dets = d; }, [FACE]);
    await p.waitFor(`!document.getElementById("frRead").disabled`, 8000);
    await ev(p, () => document.getElementById("frRead").click());
    await p.waitFor(`!document.getElementById("frResult").hidden && ` + sections(3), 20000);
  } },
  { page: "palm.html", q: "?cpu&fakedet", cam: true, read: async p => {
    await p.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
    await ev(p, () => document.getElementById("plStartCam").click());
    await p.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 10000);
    await ev(p, d => { window.__dets = d; }, [HAND]);
    await sleep(600);
    await ev(p, () => document.getElementById("plSnap").click());
    await p.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
    await ev(p, () => document.getElementById("plRead").click());
    await p.waitFor(`!document.getElementById("plResult").hidden && document.querySelectorAll("#plNarr .fa-section").length >= 3`, 20000);
  } },
];

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const rows = [];
  try {
    for (const P of PAGES) {
      await check(`zh: ${P.page} is ≥ 95 % Chinese before and after a reading; the reading has no Thai`, async () => {
        const page = await browser.newPage(null, { initScripts: [zhInit].concat(P.cam ? [fakeCams, detScript] : []) });
        try {
          await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
          await page.goto(`${base}/${P.page}${P.q || ""}`);
          await page.waitFor(`document.documentElement.lang === "zh-Hans"`, 8000);
          await sleep(900);
          const before = await page.evaluate(MEASURE);
          let after = null;
          if (P.read) { await P.read(page); await sleep(700); after = await page.evaluate(MEASURE); }
          rows.push({ page: P.page, before, after });
          assert(before.share <= 0.05, `${P.page} before reading: Thai ${(before.share * 100).toFixed(1)} % — ${before.samples.join(" / ")}`);
          if (after) {
            assert(after.share <= 0.05, `${P.page} after reading: Thai ${(after.share * 100).toFixed(1)} % — ${after.samples.join(" / ")}`);
            assert(after.readingThai === 0, `${P.page}: reading contains ${after.readingThai} Thai chars`);
            assert(after.readingZh > 120, `${P.page}: reading too short (${after.readingZh} 汉字)`);
          }
        } finally { await page.close(); }
      });
    }
  } finally {
    await browser.close();
    const pct = m => (m ? (m.share * 100).toFixed(1).padStart(5) + " %  (" + m.th + " th / " + m.zh + " zh)" : "      —");
    console.log("\n  zh audit — Thai share of visible text (390 px)\n  page               before reading                 after reading                  reading Thai/汉字");
    for (const r of rows) console.log("  " + r.page.padEnd(18) + " " + pct(r.before).padEnd(30) + " " + pct(r.after).padEnd(30) + " " + (r.after ? r.after.readingThai + " / " + r.after.readingZh : "—"));
  }
}
