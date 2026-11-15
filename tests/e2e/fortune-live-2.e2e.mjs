// tests/e2e/fortune-live-2.e2e.mjs — FIXED TEST SET, fortune go-live review round 1 (independent review of 518dd0b, NOT OK),
// locked BEFORE the fixes (evals-locks/fortune-live.sha256, ~/LENSIQ-field/evals/fortune-live/). Static half:
// tests/unit/fortune-live-2.test.js.
//   A1  site-wide: no page shows an idle technical status at rest. Every page (TH / EN / ZH, 375 px) is loaded and, after it
//       settles, the visible text of every status element ([role=status], .engine, [id$=Engine], [id$=engine]) must not be a
//       "ready / the model loads when …" line or name the processing backend. Loading and failure messages are allowed;
//       usage instructions ("Ready — press …") are allowed when they name no backend; a failure (.err) may name it (owner rule: show a status only while
//       loading or on failure).
//   B1  the fortune pages never show "for entertainment" (TH / EN / ZH) — not in the page DOM and not in the opened menu.
//   E1  no horizontal scroll at 320 px on every fortune page, TH / EN / ZH, at load and after a reading (every group opened).
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ALL_PAGES = readdirSync(REPO).filter(f => f.endsWith(".html")).map(f => f.slice(0, -5)).sort();
const FORTUNE = ["fortune", "cat-fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui",
  "dream", "zodiac", "astro", "lifegraph", "planner", "luckycolor", "report"];
const LANGS = ["th", "en", "zh"];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const IDLE = /โหลดเมื่อ|จะโหลด|loads? when|will load|加载模型|时才加载|时加载|^\s*(?:พร้อม|Ready|就绪|可以使用)|พร้อมใช้งาน|พร้อม —|Ready —|就绪 —/i;
const BACKEND = /ตัวประมวลผล|\bbackend\b|后端|处理器|\b(?:WASM|WEBGL|WEBGPU|CPU|GPU)\b/i;
const INSTR = /กด|แตะ|\bpress\b|\btap\b|\bclick\b|点击|按下|轻触/i;
const BAN = /บันเทิง|entertain|娱乐|for fun/i;

const open = (browser, lang, extra = {}) => browser.newPage(null, Object.assign({ initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] }, extra));
const phone = (page, w) => page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 2, mobile: true });

const STATUSES = `(() => { const vis = e => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  return [...new Set(document.querySelectorAll('[role="status"], .engine, [id$="Engine"], [id$="engine"]'))].filter(vis)
    .map(e => ({ id: e.id || String(e.className), err: e.classList.contains("err"), text: (e.innerText || "").replace(/\\s+/g, " ").trim() })).filter(x => x.text); })()`;

// reading recipes (same as tests/e2e/fortune-layout.e2e.mjs, camera pages are checked at load only)
const ev = (page, fn) => page.evaluate(fn);
const sections = n => `document.querySelectorAll(".fa-section").length >= ${n} && !document.querySelector(".fa-loading, [aria-busy=true] .fa-section")`;
const setSel = (id, v) => `(() => { const e = document.getElementById(${S(id)}); e.value = ${S(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
const lcFill = async p => {
  await p.evaluate(() => {
    document.getElementById("lcDay").value = "12"; document.getElementById("lcMonth").value = "5"; document.getElementById("lcYear").value = "2533";
    document.getElementById("lcTime").value = "08:00"; document.querySelector("#lcForm button[type=submit]").click();
  });
  await p.waitFor(sections(2), 15000);
};
const READ = {
  iching: async p => { await ev(p, () => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); }); await p.waitFor(sections(3), 20000); },
  zodiac: async p => { await ev(p, () => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); }); await p.waitFor(sections(3), 15000); },
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
};
const OPEN_ALL = `(() => { for (const b of document.querySelectorAll("button.lq-more")) if (b.getAttribute("aria-expanded") === "false") b.click();
  document.querySelectorAll("details").forEach(d => { d.open = true; }); })()`;
const WIDTH = `(() => { const d = document.documentElement, wide = [];
  if (d.scrollWidth > d.clientWidth + 1) for (const e of document.querySelectorAll("main *")) { const r = e.getBoundingClientRect();
    if (r.right > d.clientWidth + 1 && r.width > 0 && getComputedStyle(e).position !== "fixed" && !e.closest("[data-lq-hscroll]")) wide.push(e.tagName + "." + String(e.className).slice(0, 40) + " " + Math.round(r.right)); }
  return { sw: d.scrollWidth, cw: d.clientWidth, wide: wide.slice(0, 3) }; })()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("A1: no idle technical status at rest on any page (TH / EN / ZH, 375 px): no 'ready / loads when …', no backend name", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await open(browser, lang);
        try {
          await phone(page, 375);
          for (const p of ALL_PAGES) {
            try { await page.goto(`${base}/${p}.html?nosw`); } catch (e) { bad.push(`${p} ${lang}: load ${e.message}`); continue; }
            await sleep(1800);
            for (const s of await page.evaluate(STATUSES)) {
              const backend = !s.err && BACKEND.test(s.text), idle = IDLE.test(s.text) && !INSTR.test(s.text);
              if (backend || idle) bad.push(`${p} ${lang} #${s.id}: ${s.text.slice(0, 140)}`);
            }
          }
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.slice(0, 60).join("\n"));
    });

    await check("B1: fortune pages never say 'for entertainment' (TH / EN / ZH): page DOM and the opened menu", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await open(browser, lang);
        try {
          await phone(page, 375);
          for (const p of FORTUNE) {
            await page.goto(`${base}/${p}.html?nosw`);
            try { await page.waitFor(`document.documentElement.lang === ${S(HTML_LANG[lang])} && !!document.querySelector(".nav-toggle")`, 10000); } catch (e) { bad.push(`${p} ${lang}: did not load`); continue; }
            await sleep(400);
            await page.evaluate(`document.querySelector(".nav-toggle").click()`);
            await sleep(400);
            const r = await page.evaluate(`(() => { const m = document.getElementById("siteMenu"), re = ${BAN.toString()};
              const html = document.body.cloneNode(true); html.querySelectorAll("script, style").forEach(e => e.remove());
              const all = html.outerHTML + " " + document.title + " " + [...document.querySelectorAll("meta")].map(x => x.content || "").join(" ");
              const hit = (t) => { const k = t.search(re); return k < 0 ? "" : t.slice(Math.max(0, k - 60), k + 30).replace(/\\s+/g, " "); };
              return { open: !!m && m.getClientRects().length > 0, menuText: hit((m && (m.innerText + " " + m.textContent)) || ""), dom: hit(all) }; })()`);
            if (!r.open) bad.push(`${p} ${lang}: menu did not open`);
            if (r.menuText) bad.push(`${p} ${lang} menu: …${r.menuText}…`);
            if (r.dom) bad.push(`${p} ${lang} DOM: …${r.dom}…`);
          }
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.slice(0, 60).join("\n"));
    });

    await check("E1: no horizontal scroll at 320 px on every fortune page, TH / EN / ZH, at load and after a reading (groups opened)", async () => {
      const bad = [];
      for (const lang of LANGS) {
        for (const p of FORTUNE) {
          const page = await open(browser, lang, { isolated: p === "report" });
          try {
            await phone(page, 320);
            await page.goto(`${base}/${p}.html?nosw`);
            await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])}`, 10000);
            await sleep(600);
            let w = await page.evaluate(WIDTH);
            if (w.sw > w.cw + 1) bad.push(`${p} ${lang} 320 load: page ${w.sw} px wide ${S(w.wide)}`);
            if (READ[p]) {
              try { await READ[p](page); } catch (e) { bad.push(`${p} ${lang}: reading did not appear (${e.message.slice(0, 80)})`); continue; }
              await page.evaluate(OPEN_ALL); await sleep(400);
              w = await page.evaluate(WIDTH);
              if (w.sw > w.cw + 1) bad.push(`${p} ${lang} 320 reading: page ${w.sw} px wide ${S(w.wide)}`);
            }
          } catch (e) { bad.push(`${p} ${lang}: ${e.message.slice(0, 120)}`); } finally { await page.close(); }
        }
      }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.slice(0, 60).join("\n"));
    });
  } finally {
    await browser.close();
  }
}
