// tests/e2e/fortune-cards.e2e.mjs — owner order 2026-11-18 (fortune only): clean fortune cards. FIXED TEST: written and
// locked (~/LENSIQ-field/evals/fortune-cards/, sha256 in evals-locks/fortune-cards.sha256) BEFORE the change on branch
// fortune-cards-clean (base b2a6e76 = origin/main). Rendered, phone widths 360 / 375 / 393 / 414 / 430 px, TH / EN / ZH:
//   E1  cat-fortune.html: nothing in <main> names measured accuracy, "no accuracy claim", filters or banned topics, and no
//       element carries a removed key; the disclaimer is shown exactly once, small, in the hero above the first card and on
//       the first screen; no horizontal scroll;
//   E2  each fortune card is ONE link: the link covers the whole card (every tap point inside the card hits it), holds the
//       name, one short line and a visible small illustration, and there is no other link in the card; a tap near the
//       card's corner opens the tool;
//   E3  the other listings (index.html fortune cards, solutions.html fortune cards, the fortune menu panel) show none of the
//       removed items and no per-card disclaimer;
//   E4  business categories unchanged: on the six other category pages every card still shows the measured-accuracy heading
//       and one accuracy line per claim with its source label (TH / EN / ZH, 360 and 430 px);
//   E5  crisis v3 unaffected on cat-fortune.html: the one "อยากมีคนรับฟัง 1323" control (tel:1323, >= 44 px) is on the first
//       screen, it is the only help number in the normal state, and no crisis-only number shows.
import { createRequire } from "node:module";
import { join } from "node:path";
import { noErrors, assert } from "./zones-lib.mjs";

const require = createRequire(import.meta.url);
const LANGS = ["th", "en", "zh"];
const SIZES = [[360, 640], [375, 667], [393, 659], [414, 715], [430, 750]];
const DISC = {
  th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
  en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
  zh: "基于命理学原则，属个人信仰，请自行判断。",
};
const DISC_RE = { th: "โปรดใช้วิจารณญาณ|ความเชื่อส่วนบุคคล", en: "use your own judgement|matter of personal belief", zh: "请自行判断|属个人信仰" };
const REMOVED = {
  th: "ความแม่นยำ|ต้องห้าม|ตัวกรอง|กรองคำ|กรองถ้อยคำ",
  en: "accuracy|banned|forbidden|filter",
  zh: "准确率|禁用|过滤|违禁",
};
const REMOVED_KEYS = ["cat.acc.h", "cat.src.na", "cat.src.h", "cat.src.d", "cat.method", "cat.c.fortune", "cat.open", "cat.why", "cat.r.fortune"];
const ACC_H = { th: "ความแม่นยำที่วัดได้", en: "Measured accuracy", zh: "已测准确率" };

export default async function ({ base, launch, check, fakeCams, repo }) {
  const D = require(join(repo, "tools", "cat-data.cjs"));
  const FORT = D.CATEGORIES.find(c => c.slug === "fortune");
  const browser = await launch();
  const open = async (file, lang, [w, h] = [360, 640]) => {
    const page = await browser.newPage(null, { initScripts: [fakeCams] });
    await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await page.goto(`${base}/${file}${file.includes("?") ? "&" : "?"}nosw&cpu&lang=${lang}`);
    await page.waitFor(`!!window.LQI18N && LQI18N.lang === ${JSON.stringify(lang)} && document.readyState === "complete"`, 15000);
    await new Promise(r => setTimeout(r, 400));
    return page;
  };
  try {
    await check("E1 + E2 cat-fortune.html at 360-430 px (TH / EN / ZH): no removed item, one small disclaimer, one-link cards", async () => {
      const bad = [];
      for (const lang of LANGS) for (const size of SIZES) {
        const page = await open("cat-fortune.html", lang, size);
        const r = await page.evaluate((args) => {
          const { lang, disc, discRe, removed, keys, pages } = args;
          const out = { issues: [] };
          const main = document.querySelector("main");
          const mt = main.innerText;
          const rm = mt.match(new RegExp(removed, lang === "en" ? "i" : ""));
          if (rm) out.issues.push("removed item in main: " + rm[0]);
          for (const el of main.querySelectorAll("[data-i18n], [data-i18n-attr]")) {
            const k = (el.getAttribute("data-i18n") || "") + " " + (el.getAttribute("data-i18n-attr") || "");
            for (const key of keys) if (new RegExp("(^|[\\s:;])" + key.replace(/\./g, "\\.") + "($|[\\s;])").test(k)) out.issues.push("removed key " + key);
          }
          // the disclaimer: once in the whole visible page, small, in the hero, above the first card, on the first screen
          const bt = document.body.innerText;
          const n = bt.split(disc).length - 1;
          if (n !== 1) out.issues.push("disclaimer shown " + n + " times");
          const dn = (bt.match(new RegExp(discRe, "g")) || []).length;
          if (dn !== 2) out.issues.push("disclaimer words shown " + dn + " times (expected only inside the one line)");
          const line = [...document.querySelectorAll("[data-i18n='fortune.disc.line']")].filter(e => e.getClientRects().length);
          if (line.length !== 1) out.issues.push("fortune.disc.line elements: " + line.length);
          const cards = [...document.querySelectorAll(".cat-tool")];
          if (line[0]) {
            const lr = line[0].getBoundingClientRect(), fs = parseFloat(getComputedStyle(line[0]).fontSize);
            if (!line[0].closest(".pd-hero")) out.issues.push("disclaimer not in the hero");
            if (fs > 14) out.issues.push("disclaimer font " + fs + " px");
            if (lr.bottom > innerHeight) out.issues.push("disclaimer below the first screen: " + Math.round(lr.bottom));
            if (cards[0] && lr.bottom > cards[0].getBoundingClientRect().top) out.issues.push("disclaimer not above the first card");
          }
          if (document.documentElement.scrollWidth > innerWidth) out.issues.push("horizontal scroll " + document.documentElement.scrollWidth);
          // cards
          if (cards.map(c => c.dataset.page).join() !== pages.join()) out.issues.push("cards " + cards.map(c => c.dataset.page));
          for (const c of cards) {
            const p = c.dataset.page, links = c.querySelectorAll("a[href], [role=link], button");
            if (links.length !== 1 || links[0].tagName !== "A") { out.issues.push(p + ": " + links.length + " links / controls"); continue; }
            const a = links[0];
            if (a.getAttribute("href") !== p + ".html") out.issues.push(p + ": href " + a.getAttribute("href"));
            const h3 = a.querySelector("h3"), ps = [...a.querySelectorAll("p")].filter(e => e.getClientRects().length);
            const ill = a.querySelector(".cat-ill, .ft-ill");
            if (!h3 || !h3.innerText.trim()) out.issues.push(p + ": no name in the link");
            if (ps.length !== 1 || !ps[0].innerText.trim()) out.issues.push(p + ": lines in the link " + ps.length);
            const ir = ill && ill.getBoundingClientRect();
            if (!ir || ir.width < 12 || ir.height < 12) out.issues.push(p + ": illustration not visible " + (ir ? ir.width + "x" + ir.height : "none"));
            else if (ir.width > 72 || ir.height > 72) out.issues.push(p + ": illustration not small " + ir.width + "x" + ir.height);
            if (c.querySelector(".cat-st, .cat-acc, .cat-h, .sl-go, .cat-why")) out.issues.push(p + ": extra item in the card");
            const t = c.innerText.replace(/\s+/g, " ").trim(), want = (h3 ? h3.innerText : "") + " " + (ps[0] ? ps[0].innerText : "");
            if (t.replace(/\s+/g, "") !== want.replace(/\s+/g, "")) out.issues.push(p + ": card text beyond name + line: " + t.slice(0, 80));
            const cr = c.getBoundingClientRect(), ar = a.getBoundingClientRect();
            if (ar.left > cr.left + 1 || ar.top > cr.top + 1 || ar.right < cr.right - 1 || ar.bottom < cr.bottom - 1)
              out.issues.push(`${p}: link ${Math.round(ar.width)}x${Math.round(ar.height)} does not cover the card ${Math.round(cr.width)}x${Math.round(cr.height)}`);
          }
          return out;
        }, { lang, disc: DISC[lang], discRe: DISC_RE[lang], removed: REMOVED[lang], keys: REMOVED_KEYS, pages: FORT.pages });
        // every tap point of every card (corners inset 3 px, edges, centre) hits the card's link
        const miss = [];
        for (const p of FORT.pages) {
          const m = await page.evaluate(async (p) => {
            const c = document.querySelector(`.cat-tool[data-page='${p}']`);
            c.scrollIntoView({ block: "center" });
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const r = c.getBoundingClientRect(), a = c.querySelector("a");
            const pts = [[r.left + 3, r.top + 3], [r.right - 3, r.top + 3], [r.left + 3, r.bottom - 3], [r.right - 3, r.bottom - 3],
              [r.left + r.width / 2, r.top + r.height / 2], [r.left + 3, r.top + r.height / 2], [r.right - 3, r.top + r.height / 2]];
            return pts.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return !e || !a || e.closest("a") !== a; }).length;
          }, p);
          if (m) miss.push(`${p}: ${m}/7 tap points miss the link`);
        }
        for (const i of r.issues.concat(miss)) bad.push(`${lang} ${size[0]}px: ${i}`);
        noErrors(page);
        await page.close();
      }
      assert(!bad.length, bad.slice(0, 40).join("\n") + (bad.length > 40 ? `\n… ${bad.length} in all` : ""));
    });

    await check("E2 a tap near a fortune card's corner opens the tool (TH / EN / ZH, 360 px)", async () => {
      for (const lang of LANGS) {
        const page = await open("cat-fortune.html", lang);
        const pt = await page.evaluate(async () => {
          const c = document.querySelector(".cat-tool[data-page='palm']");
          c.scrollIntoView({ block: "center" });
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          const r = c.getBoundingClientRect();
          return { x: r.right - 6, y: r.bottom - 6 };
        });
        for (const type of ["mousePressed", "mouseReleased"]) await page.send("Input.dispatchMouseEvent", { type, x: pt.x, y: pt.y, button: "left", clickCount: 1 });
        await page.waitFor(() => /\/palm\.html/.test(location.pathname), 10000);
        await page.close();
      }
    });

    await check("E3 other listings (TH / EN / ZH, 360 px): index, solutions and the fortune menu panel show no removed item and no per-card disclaimer", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const scan = `((removed, discRe, sels) => {
          const out = [];
          for (const sel of sels) {
            const els = [...document.querySelectorAll(sel)];
            if (!els.length) out.push("missing " + sel);
            for (const el of els) {
              const t = el.innerText || el.textContent;
              const m = t.match(new RegExp(removed, "i")), d = t.match(new RegExp(discRe, "i"));
              if (m) out.push(sel + ": removed item " + m[0]);
              if (d) out.push(sel + ": disclaimer " + d[0]);
            }
          }
          return out;
        })`;
        const idx = await open("index.html", lang);
        for (const i of await idx.evaluate(`${scan}(${JSON.stringify(REMOVED[lang])}, ${JSON.stringify(DISC_RE[lang])}, ["a.pd-card[href='fortune.html']", "a.pd-card[href='cat-fortune.html']"])`)) bad.push(`${lang} index: ${i}`);
        // the fortune menu panel, opened
        await idx.evaluate(() => { const t = document.querySelector(".nav-toggle"); if (t && getComputedStyle(t).display !== "none") t.click(); });
        await new Promise(r => setTimeout(r, 300));
        await idx.evaluate(() => { const b = document.querySelector("[aria-controls='navsub-fortune']"); if (b) b.click(); });
        await new Promise(r => setTimeout(r, 300));
        for (const i of await idx.evaluate(`${scan}(${JSON.stringify(REMOVED[lang])}, ${JSON.stringify(DISC_RE[lang])}, ["#navsub-fortune"])`)) bad.push(`${lang} menu: ${i}`);
        const open2 = await idx.evaluate(() => { const s = document.getElementById("navsub-fortune"); return !!s && s.offsetHeight > 0; });
        if (!open2) bad.push(`${lang} menu: the fortune panel did not open`);
        noErrors(idx);
        await idx.close();
        const sol = await open("solutions.html", lang);
        const sels = ["e3", "e8", "e9", "e10", "e11", "e12", "e13"].map(i => "#sol-" + i);
        for (const i of await sol.evaluate(`${scan}(${JSON.stringify(REMOVED[lang])}, ${JSON.stringify(DISC_RE[lang])}, ${JSON.stringify(sels)})`)) bad.push(`${lang} solutions: ${i}`);
        noErrors(sol);
        await sol.close();
      }
      assert(!bad.length, bad.join("\n"));
    });

    await check("E4 business categories unchanged (TH / EN / ZH, 360 and 430 px): every card shows measured accuracy with its source", async () => {
      const bad = [];
      for (const c of D.CATEGORIES.filter(c => c.slug !== "fortune")) for (const lang of LANGS) for (const size of [[360, 640], [430, 750]]) {
        const page = await open(`cat-${c.slug}.html`, lang, size);
        const r = await page.evaluate(() => [...document.querySelectorAll(".cat-tool")].map(card => ({
          page: card.dataset.page,
          h: (card.querySelector(".cat-h") || {}).innerText || "",
          src: [...card.querySelectorAll(".cat-acc li")].filter(li => li.getClientRects().length).map(li => li.dataset.src + ":" + ((li.querySelector(".cat-src") || {}).innerText || "").trim()),
          lines: [...card.querySelectorAll(".cat-acc li")].map(li => li.innerText.trim().length),
          go: !!card.querySelector(".sl-go")
        })));
        if (r.map(t => t.page).join() !== c.pages.join()) bad.push(`${c.slug} ${lang}: cards ${r.map(t => t.page)}`);
        for (const t of r) {
          const want = D.PAGES[t.page].claims.map(id => D.CLAIMS[id].src + ":" + D.SOURCE[D.CLAIMS[id].src][lang]);
          if (t.h.trim() !== ACC_H[lang]) bad.push(`${c.slug} ${lang} ${size[0]}: ${t.page} heading "${t.h}"`);
          if (JSON.stringify(t.src) !== JSON.stringify(want)) bad.push(`${c.slug} ${lang} ${size[0]}: ${t.page} sources ${t.src} != ${want}`);
          if (!want.length || t.lines.some(n => n < 12)) bad.push(`${c.slug} ${lang} ${size[0]}: ${t.page} accuracy lines ${t.lines}`);
          if (!t.go) bad.push(`${c.slug} ${lang} ${size[0]}: ${t.page} lost its page link`);
        }
        noErrors(page);
        await page.close();
      }
      assert(!bad.length, bad.slice(0, 40).join("\n"));
    });

    await check("E5 crisis v3 unaffected on cat-fortune.html: one 1323 control on the first screen, >= 44 px, no other help number", async () => {
      const bad = [];
      for (const lang of LANGS) for (const size of SIZES) {
        const page = await open("cat-fortune.html", lang, size);
        const r = await page.evaluate(() => {
          const tels = [...document.querySelectorAll("a[href^='tel:']")].filter(a => a.getClientRects().length);
          const top = document.querySelector("#lqHelpTop a[href='tel:1323']");
          const rr = top && top.getBoundingClientRect();
          return { tels: tels.map(a => a.getAttribute("href")), top: !!top, h: rr ? rr.height : 0, w: rr ? rr.width : 0, bottom: rr ? rr.bottom : 9e9,
            other: /\b(1669|1300|191)\b/.test(document.body.innerText), scrollY };
        });
        if (!r.top) bad.push(`${lang} ${size[0]}: no 1323 control`);
        if (r.tels.join() !== "tel:1323") bad.push(`${lang} ${size[0]}: visible tel links ${r.tels}`);
        if (r.h < 44 || r.w < 44) bad.push(`${lang} ${size[0]}: 1323 control ${r.w}x${r.h}`);
        if (r.bottom > size[1] || r.scrollY !== 0) bad.push(`${lang} ${size[0]}: 1323 control not on the first screen (${r.bottom})`);
        if (r.other) bad.push(`${lang} ${size[0]}: a crisis-only number shows in the normal state`);
        await page.close();
      }
      assert(!bad.length, bad.join("\n"));
    });
  } finally { await browser.close(); }
}
