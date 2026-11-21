// tests/e2e/categories.e2e.mjs — round 16 item 1 (S1): packaging by the 7 work categories.
//   1. reachability: the links in the shared header (every menu panel, also closed ones), index.html and the 7 category
//      landing pages cover EVERY *.html page of the repo except the deliberate exceptions in tools/cat-data.cjs UNLINKED
//      (admin.html), and every linked page answers 200;
//   2. each cat-*.html lists exactly its tools (Crowd: dense limit); [before 223: with a status tag and source-labelled
//      accuracy lines]
//      re-lock 2026-11-21 (owner decision 223 / 223-1, inversion): each card shows its customer badge (none / รุ่นทดลอง /
//      รุ่นทดลอง ยังไม่เปิดขาย / เร็ว ๆ นี้, D.badgeOf) and its two approved lines (D.LINES), and NO accuracy list, source
//      label, "why this status" or legend, and none of the banned wording of tests/unit/accuracy-removal-223.spec.json;
//      every accuracy line and status reason the card used to show is held verbatim in docs/tech-sheets/*.md; the count
//      is exactly "<n> เครื่องมือ" over the tools that are not demo-only; demo-only cards are hidden outside demo mode;
//   3. desktop 1024 px: bar (no drawer), panel intro link and the breadcrumb open the category page;
//   4. phones 320 / 360 / 390 px: no horizontal overflow, 44 px targets, the drawer lists the 8 groups with their landing page;
//   5. English and Chinese: no Thai left on the 7 landing pages.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { noErrors, mobileCheck, langCheck, assert, sleep } from "./zones-lib.mjs";

const require = createRequire(import.meta.url);

export default async function ({ base, launch, check, fakeCams, repo }) {
  const D = require(join(repo, "tools", "cat-data.cjs"));
  const all = readdirSync(repo).filter(f => f.endsWith(".html")).sort();
  const cats = D.CATEGORIES.map(c => `cat-${c.slug}.html`);
  const browser = await launch();
  const links = page => page.evaluate(() => [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href")));
  const file = h => (h.split("#")[0].split("?")[0].split("/").pop() || "").toLowerCase();
  try {
    await check("reachability: header + index + 7 category pages link every page (except the listed exceptions)", async () => {
      const found = new Map(); // page -> first page that links it
      const crawl = async start => {
        const page = await browser.newPage(`${base}/${start}?nosw`);
        await page.waitFor(() => document.querySelectorAll("#siteNav .nav-sub a").length > 40, 8000);
        for (const h of await links(page)) { const f = file(h); if (f.endsWith(".html") && !found.has(f)) found.set(f, start); }
        noErrors(page);
        await page.close();
      };
      for (const p of ["index.html", ...cats]) await crawl(p);
      const missing = all.filter(f => !found.has(f) && !D.UNLINKED[f.replace(/\.html$/, "")]);
      assert(!missing.length, "not linked from header / home / category pages: " + missing.join(", "));
      const broken = [];
      for (const f of found.keys()) {
        const r = await fetch(`${base}/${f}`);
        await r.arrayBuffer().catch(() => null); // drain the body (undici asserts on unconsumed bodies)
        if (r.status !== 200) broken.push(`${f} ${r.status} (from ${found.get(f)})`);
      }
      assert(!broken.length, "broken links: " + broken.join(", "));
      const unlinked = Object.keys(D.UNLINKED).map(p => p + ".html").filter(f => found.has(f));
      const nLinked = [...found.keys()].filter(f => all.includes(f)).length;
      console.log(`       ${all.length} pages, ${nLinked} linked, deliberately unlinked: ${Object.keys(D.UNLINKED).join(", ")}` + (unlinked.length ? " (now linked: " + unlinked + ")" : ""));
    });

    await check("landing pages (re-lock 223): each tool with its badge + two plain lines, no accuracy / source / why / legend (held in the technical sheets); counts; Crowd dense limit", async () => {
      // decision 223: the technical sheets that hold every original accuracy line and status reason (TH: th; EN: en + zh)
      const S223 = require(join(repo, "tests", "unit", "accuracy-removal-223.spec.json"));
      const BANNED = S223.banned.map(b => ({ id: b.id, re: new RegExp(b.re, b.flags || "") }));
      const sq = x => String(x).replace(/\s+/g, " ");
      const sheetDir = join(repo, "docs", "tech-sheets");
      const sheets = re => readdirSync(sheetDir).filter(f => re.test(f)).map(f => sq(readFileSync(join(sheetDir, f), "utf8"))).join("\n");
      const SHEET = { th: sheets(/-TH\.md$|^README\.md$/), en: sheets(/-EN\.md$|^README\.md$/) };
      // the favicon data URI is split over lines in the generated pages: the browser must decode the same SVG as on
      // solutions.html (whitespace aside) and the icon must render
      const svgOf = () => {
        const href = document.querySelector("link[rel=icon]").href, pre = "data:image/svg+xml,";
        return href.startsWith(pre) ? decodeURIComponent(href.slice(pre.length)).replace(/\s+/g, " ") : "not a data URI: " + href.slice(0, 40);
      };
      const ref = await browser.newPage(`${base}/solutions.html?nosw`);
      await ref.waitFor(() => !!document.querySelector("link[rel=icon]"), 8000);
      const favicon = await ref.evaluate(svgOf);
      await ref.close();
      for (const c of D.CATEGORIES) {
        const page = await browser.newPage(`${base}/cat-${c.slug}.html?nosw`);
        await page.waitFor(() => !!document.querySelector(".cat-tool"), 8000);
        const r = await page.evaluate(() => ({
          h1: document.querySelector("h1").textContent.trim(),
          crumbs: [...document.querySelectorAll(".lq-crumbs li")].map(li => li.textContent.trim()),
          tools: [...document.querySelectorAll(".cat-tool")].map(a => ({
            page: a.dataset.page, st: a.dataset.status, tag: (a.querySelector(".cat-st") || {}).className || "",
            badge: ((a.querySelector(".cat-st") || {}).textContent || "").trim(), demoOnly: a.hasAttribute("data-demo-only"),
            shown: a.getClientRects().length > 0,
            lines: [...a.querySelectorAll(".cat-ln [data-i18n]")].map(e => e.dataset.i18n + "=" + e.textContent.replace(/\s+/g, " ").trim()),
            // decision 223 (inverted from "the accuracy lines with their source chip"): count what is left of them
            src: [...a.querySelectorAll(".cat-acc li, .cat-src, .cat-why, .cat-srcs, .cat-legend, .sl-legend, .claims")].map(e => e.className || e.tagName),
            // re-lock 2026-11-18 (owner decision 2026-11-18: fortune cards carry no accuracy field; business products unchanged):
            // a fortune card is one link, so its page link is that link; every other card keeps its .sl-go page link
            go: (a.querySelector(".sl-go") || a.querySelector("a[href]") || { getAttribute: () => "" }).getAttribute("href"), text: a.textContent,
            html: a.outerHTML
          })),
          count: document.getElementById("catCount").textContent,
          // decision 223: no accuracy list, source label, "why this status" or legend anywhere on the page
          removed: [...document.querySelectorAll(".cat-acc, .cat-why, .cat-srcs, .cat-legend, .sl-legend, .claims")].length,
          main: (document.querySelector("main") || document.body).innerText
        }));
        const fav = await page.evaluate(`(${svgOf})()`);
        const iconW = await page.evaluate(() => new Promise(res => {
          const im = new Image(); im.onload = () => res(im.naturalWidth); im.onerror = () => res(0); im.src = document.querySelector("link[rel=icon]").href;
        }));
        assert(fav === favicon && /^<svg /.test(favicon) && iconW > 0, `${c.slug} favicon (rendered width ${iconW}): ${fav.slice(0, 80)}`);
        assert(r.h1.includes(c.name.th), c.slug + " h1 " + r.h1);
        assert(r.crumbs.length === 3 && r.crumbs[1] === c.name.th, c.slug + " crumbs " + r.crumbs.join(" / "));
        assert(JSON.stringify(r.tools.map(t => t.page)) === JSON.stringify(c.pages), c.slug + " tools " + r.tools.map(t => t.page));
        for (const t of r.tools) {
          const want = D.PAGES[t.page];
          // re-lock 2026-11-22 (owner decision 223, inversion of the 2026-11-18 "every other card needs at least one accuracy
          // line"): NO card shows an accuracy line or a source chip; the internal data still hold at least one accuracy line per
          // business page (only category 6 has none), and those lines are checked against the technical sheets below
          assert(c.noAccuracy ? (c.n === 6 && want.claims.length === 0) : want.claims.length >= 1, `${t.page} internal accuracy lines (tools/cat-data.cjs): ${want.claims.length}`);
          assert(t.src.length === 0 && !/data-src=|class="cat-src\b/.test(t.html), `${t.page} shows an accuracy line or source chip: ${t.src}`);
          // each card listed in the locked spec (lines[].cards) shows its two approved lines, exactly the spec's Thai text
          const specLn = S223.lines.find(x => (x.cards || []).includes(t.page));
          if (specLn) for (const n of ["1", "2"]) if (specLn[n]) {
            const got = t.lines.find(l => l.startsWith(`ln.${specLn.id}.${n}=`));
            assert(got === `ln.${specLn.id}.${n}=` + sq(specLn[n].th).trim(), `${t.page}: line ${n} of ${specLn.id} (spec): ${got}`);
          }
          // owner order 2026-11-17 (remove สาธิต tag from fortune): noStatusTag categories show no status tag and no data-status
          if (c.noStatusTag) assert(t.st === undefined && t.tag === "", `${t.page} must show no status tag: ${t.st}/${t.tag}`);
          else {
            // decision 223 (was: data-status === PAGES[page].st and the status class): the customer badge, exactly
            const b = D.badgeOf(t.page);
            if (b === "") assert(t.st === undefined && t.tag === "" && t.badge === "", `${t.page} must show no badge: ${t.st}/${t.tag}/${t.badge}`);
            else assert(t.st === b && t.tag.split(/\s+/).includes(b) && t.badge === D.BADGE[b].th, `${t.page} badge ${t.st}/${t.tag}/${t.badge} (want ${b})`);
            assert(t.st !== want.st || want.st === b, `${t.page}: old status ${want.st} still shown`);
          }
          // decision 223 (inverted from "one accuracy line per claim with its source label"): none on the card ...
          assert(t.src.length === 0, `${t.page} still shows accuracy / source / why / legend parts: ${t.src}`);
          for (const B of BANNED) { const m = t.text.match(B.re); assert(!m, `${t.page} card shows banned wording ${B.id}: "${m && m[0]}"`); }
          // ... and each line and the status reason it used to show is in the technical sheets verbatim
          for (const k of want.claims) {
            const cl = D.CLAIMS[k];
            assert(SHEET.th.includes(sq(cl.th)) && SHEET.en.includes(sq(cl.en)) && SHEET.en.includes(sq(cl.zh)), `${t.page}: accuracy line ${k} missing from docs/tech-sheets`);
          }
          if (want.why && D.REASONS[want.why]) assert(SHEET.th.includes(sq(D.REASONS[want.why].th))
             && SHEET.en.includes(sq(D.REASONS[want.why].en)), `${t.page}: status reason ${want.why} missing from docs/tech-sheets`);
          // decision 223: the two approved lines of the product, exactly (cards without an entry in D.LINES show none)
          const ln = Object.entries(D.LINES).find(([, v]) => v.cards.includes(t.page));
          const wantLines = ln ? ["1", "2"].filter(n => ln[1][n]).map(n => `ln.${ln[0]}.${n}=` + sq(ln[1][n]).trim()) : [];
          assert(JSON.stringify(t.lines) === JSON.stringify(wantLines), `${t.page} lines ${JSON.stringify(t.lines)} (want ${JSON.stringify(wantLines)})`);
          // decision 223: demo-only cards are marked and hidden outside demo mode
          assert(t.demoOnly === D.DEMO_ONLY.includes(t.page), `${t.page} data-demo-only ${t.demoOnly}`);
          if (t.demoOnly) assert(!t.shown, `${t.page}: demo-only card shown outside demo mode`);
          // walk-through 2026-11-16 D-02: the attendance card's page link opens the PIN / QR time clock (exact href)
          assert(t.go === (t.page === "attendance" ? "attendance.html?mode=employee" : t.page + ".html"), t.page + " link " + t.go);
        }
        // decision 223 (was: "^<all pages> เครื่องมือ" followed by the status breakdown): exactly the tools shown outside demo mode
        assert(r.count.trim() === c.pages.filter(p => !D.DEMO_ONLY.includes(p)).length + " เครื่องมือ", c.slug + " count " + r.count);
        assert(r.removed === 0, c.slug + ": accuracy / why / legend elements on the page: " + r.removed);
        for (const B of BANNED) { const m = r.main.match(B.re); assert(!m, `${c.slug} page shows banned wording ${B.id}: "${m && m[0]}"`); }
        if (c.slug === "marketing") assert(/ยังไม่เหมาะกับฝูงชนหนาแน่น/.test(r.tools.find(t => t.page === "crowd").text), "crowd dense-crowd limit");
        noErrors(page);
        await page.close();
      }
    });

    await check("desktop 1024 px: bar (no drawer), panel link + breadcrumb open the category page", async () => {
      const page = await browser.newPage(null);
      await page.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
      await page.goto(`${base}/exam-hall.html?cpu&nosw`);
      await page.waitFor(() => !!document.querySelector(".lq-crumbs a[href='cat-education.html']"), 8000);
      const r = await page.evaluate(() => {
        const t = document.querySelector(".nav-toggle");
        const btn = document.querySelector("[aria-controls='navsub-edu']"); btn.click();
        const sub = document.getElementById("navsub-edu");
        return { toggle: getComputedStyle(t).display, open: sub.classList.contains("open") && sub.offsetHeight > 0,
          intro: sub.querySelector(".mega-all").getAttribute("href"), first: sub.querySelector(".mega-links a").getAttribute("href"),
          current: btn.classList.contains("is-current"), crumbs: [...document.querySelectorAll(".lq-crumbs li")].map(li => li.textContent.trim()).join(" / ") };
      });
      assert(r.toggle === "none" && r.open && r.current, JSON.stringify(r));
      assert(r.intro === "cat-education.html" && r.first === "cat-education.html", JSON.stringify(r));
      assert(r.crumbs === "หน้าแรก / การศึกษาและการสอบ / เครื่องกล้องในห้องสอบ", r.crumbs);
      noErrors(page);
      await page.close();
    });

    await check("phones 320/360/390 px: category pages, index, solutions fit; drawer lists 8 groups with their landing page", async () => {
      for (const f of [...cats, "index.html", "solutions.html"]) {
        const page = await browser.newPage(`${base}/${f}?nosw`);
        await mobileCheck(page);
        noErrors(page);
        await page.close();
      }
      const page = await browser.newPage(null);
      await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
      await page.goto(`${base}/cat-health.html?nosw`);
      await page.waitFor(() => !!document.querySelector(".nav-toggle"), 8000);
      await page.evaluate(() => document.querySelector(".nav-toggle").click());
      await sleep(350);
      const r = await page.evaluate(() => ({
        groups: [...document.querySelectorAll("#siteMenu .has-sub > .nav-link .nav-lbl-f")].map(s => s.textContent),
        open: [...document.querySelectorAll(".nav-sub.open")].map(s => s.id),
        firsts: [...document.querySelectorAll("#siteMenu .nav-sub")].map(s => s.querySelector(".mega-links a").getAttribute("href")),
        sw: document.documentElement.scrollWidth, vw: innerWidth
      }));
      assert(r.groups.length === 8 && r.groups[0] === "ความปลอดภัยและการเข้าออก" && r.groups[7] === "เกี่ยวกับ", r.groups.join(" | "));
      assert(r.open.includes("navsub-health"), "current group expanded in the drawer " + r.open);
      assert(JSON.stringify(r.firsts.slice(0, 7)) === JSON.stringify(cats), r.firsts.join(","));
      assert(r.sw <= r.vw, "drawer overflow");
      noErrors(page);
      await page.close();
    });

    await check("English and Chinese: no Thai left on the 7 category pages", async () => {
      for (const f of cats) await langCheck(browser, base, fakeCams, f, null);
    });
  } finally { await browser.close(); }
}
