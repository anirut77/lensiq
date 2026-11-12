// tests/e2e/fortune-sources.e2e.mjs — owner order 2026-11-12 (Part B): no fortune page shows source citations to users.
// Every fortune page is opened in Thai, English and Chinese (lq-lang); on every page that has a reading, a reading is
// produced first (forms filled, cards drawn, fake camera + scripted detector for face / palm, a sample report). Then every
// <details> box is opened (e.g. horoscope "ดูวิธีคำนวณ") and the RENDERED text must contain no citation heading or
// footnote words, no source name (site / author / book from the knowledge bases' source lists) and no link to a source
// URL. The tarot card-image credit (#trCredit) is a media licence credit, not a citation, and is the one element left out.
// Admin (back office) lists the sources: checked in tests/unit/fortune-sources.test.js.
// Extended after the independent review 2026-11-12 (a "(Meeus)" in horoscope's calculation box was only visible after a reading).
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const KBS = readdirSync(repo).filter(f => /-kb\.js$/.test(f));
const ALL = KBS.flatMap(f => { const K = require(join(repo, f)); return [].concat(K.sources || [], K.readingSources || []); });
const GENERIC = new Set(["Central", "All About", "China Travel"]);
const NAMES = [...new Set(ALL.flatMap(s => [String(s.label).split(" — ")[0].trim(), new URL(s.url).hostname.replace(/^www\./, "")]))]
  .filter(n => n.length >= 3 && !GENERIC.has(n)).concat(["Meeus", "Rider–Waite", "Rider-Waite", "Wikipedia", "维基"]);
const URLS = ALL.map(s => s.url);
const CITE = "แหล่งอ้างอิง|อ้างอิงจาก|บรรณานุกรม|ที่มา:|\\b(?:References?|Sources?:|Bibliography|Cited|Citation)\\b|参考资料|参考文献|出处|来源[:：]";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const ev = (page, fn, ...a) => page.evaluate(fn, ...a);
const sections = n => `document.querySelectorAll(".fa-section").length >= ${n} && !document.querySelector(".fa-loading, [aria-busy=true] .fa-section")`;
const setSel = (id, v) => `(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
const lcFill = async p => {
  await p.evaluate(() => {
    document.getElementById("lcDay").value = "12"; document.getElementById("lcMonth").value = "5"; document.getElementById("lcYear").value = "2533";
    document.getElementById("lcTime").value = "08:00"; document.querySelector("#lcForm button[type=submit]").click();
  });
  await p.waitFor(sections(2), 15000);
};
// page → read(page) produces a reading (null: no reading on that page)
const PAGES = {
  fortune: null, planner: null, luckycolor: null,
  iching: async p => { await ev(p, () => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); }); await p.waitFor(sections(3), 20000); },
  zodiac: async p => {
    await ev(p, () => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); });
    await p.waitFor(sections(3), 15000);
  },
  astro: async p => {
    await ev(p, setSel("asDay", "15")); await ev(p, setSel("asMonth", "5")); await ev(p, setSel("asYear", "2533"));
    await ev(p, () => document.getElementById("asForm").requestSubmit()); await p.waitFor(sections(3), 15000);
  },
  dream: async p => {
    await ev(p, setSel("drText", "ฝันเห็นงูใหญ่ในบ้าน แล้วนั่งเครื่องบินไปทะเล")); await p.waitFor(`!document.getElementById("drGo").disabled`, 5000);
    await ev(p, () => document.getElementById("drGo").click()); await p.waitFor(sections(3), 15000);
  },
  tarot: async p => {
    await ev(p, () => { document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click(); document.getElementById("trStart").click(); });
    await sleep(600); await ev(p, () => document.getElementById("trAuto").click()); await sleep(900); await ev(p, () => document.getElementById("trReveal").click());
    await p.waitFor(sections(3), 25000);
  },
  horoscope: async p => {
    await ev(p, setSel("hsDay", "15")); await ev(p, setSel("hsMonth", "8")); await ev(p, setSel("hsYear", "1990"));
    await ev(p, () => document.getElementById("hsGo").click()); await p.waitFor(sections(3), 20000);
  },
  numbers: async p => { await ev(p, setSel("nmPhone", "0812345678")); await ev(p, () => document.getElementById("nmGo").click()); await p.waitFor(sections(2), 15000); },
  fengshui: async p => {
    await ev(p, setSel("fsDay", "15")); await ev(p, setSel("fsMonth", "6")); await ev(p, setSel("fsYear", "2533"));
    await ev(p, () => document.getElementById("fsKuaForm").requestSubmit()); await sleep(500); await ev(p, () => document.getElementById("fsReadBtn").click());
    await p.waitFor(sections(2), 15000);
  },
  bazi: lcFill, taksa: lcFill, lek7: lcFill, lifegraph: lcFill,
  report: async p => {
    await p.waitFor(() => window.__rp && document.getElementById("rpMode").textContent.length > 10, 8000);
    await ev(p, () => {
      document.querySelector('[data-rp-type="report_basic"]').click();
      document.getElementById("rpAYear").value = document.documentElement.lang === "th" ? "2533" : "1990"; document.getElementById("rpGo").click();
    });
    await p.waitFor(() => document.querySelectorAll("#rpOut .rp-part").length >= 3, 10000);
  },
  faceread: async p => {
    await ev(p, () => document.getElementById("frStartCam").click());
    await p.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
    await ev(p, d => { window.__dets = d; }, [FACE]);
    await p.waitFor(`!document.getElementById("frRead").disabled`, 8000);
    await ev(p, () => document.getElementById("frRead").click());
    await p.waitFor(`!document.getElementById("frResult").hidden && ` + sections(3), 20000);
  },
  palm: async p => {
    await p.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
    await ev(p, () => document.getElementById("plStartCam").click());
    await p.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 10000);
    await ev(p, d => { window.__dets = d; }, [HAND]);
    await sleep(600);
    await ev(p, () => document.getElementById("plSnap").click());
    await p.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
    await ev(p, () => document.getElementById("plRead").click());
    await p.waitFor(`!document.getElementById("plResult").hidden && document.querySelectorAll("#plNarr .fa-section").length >= 3`, 20000);
  },
};
const CAM = new Set(["faceread", "palm"]);
const SCAN = `((names, urls, cite) => {
  document.querySelectorAll("details").forEach(d => { d.open = true; });
  const re = new RegExp(cite);
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; const text = [];
  while ((n = w.nextNode())) {
    const el = n.parentElement; if (!el || el.closest("script,style,noscript,#trCredit")) continue;
    if (el.closest("[hidden]") || getComputedStyle(el).display === "none") continue;
    const t = n.textContent.trim(); if (t) text.push(t);
  }
  const all = text.join("\\n");
  const links = [...document.querySelectorAll("a[href]")].map(a => a.href);
  return { len: all.length, cite: (all.match(re) || [])[0] || "", names: names.filter(x => all.includes(x)),
    links: links.filter(h => urls.some(u => h === new URL(u).href)), sections: document.querySelectorAll(".fa-section, .rp-part").length };
})`;

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const lang of ["th", "en", "zh"]) {
      await check(`fortune pages (${lang}): after a reading, no citation heading, source name or source link — ${Object.keys(PAGES).length} pages`, async () => {
        const rows = [];
        for (const [p, read] of Object.entries(PAGES)) {
          const init = [`try { localStorage.setItem("lq-lang", ${JSON.stringify(lang)}); } catch (e) {}`].concat(CAM.has(p) ? [fakeCams, detScript] : []);
          const page = await browser.newPage(null, { initScripts: init, isolated: p === "report" });
          try {
            await page.goto(`${base}/${p}.html${CAM.has(p) ? "?cpu&fakedet" : ""}`);
            await page.waitFor(() => document.readyState === "complete", 10000);
            await sleep(600);
            if (read) await read(page);
            await sleep(400);
            const r = await page.evaluate(`${SCAN}(${JSON.stringify(NAMES)}, ${JSON.stringify(URLS)}, ${JSON.stringify(CITE)})`);
            rows.push(p + ":" + r.len + (read ? "/" + r.sections : ""));
            assert(r.len > 200, `${p} (${lang}) rendered text too short: ${r.len}`);
            if (read) assert(r.sections >= 2, `${p} (${lang}) no reading: ${r.sections}`);
            assert(!r.cite, `${p} (${lang}) shows citation words: ${r.cite}`);
            assert(!r.names.length, `${p} (${lang}) names sources: ${r.names.join(", ")}`);
            assert(!r.links.length, `${p} (${lang}) links sources: ${r.links.join(", ")}`);
          } finally { await page.close(); }
        }
        console.log("    " + lang + " " + rows.join(" "));
      });
    }
  } finally {
    await browser.close();
  }
}
