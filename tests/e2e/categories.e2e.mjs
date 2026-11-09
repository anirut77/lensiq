// tests/e2e/categories.e2e.mjs — round 16 item 1 (S1): packaging by the 7 work categories.
//   1. reachability: the links in the shared header (every menu panel, also closed ones), index.html and the 7 category
//      landing pages cover EVERY *.html page of the repo except the deliberate exceptions in tools/cat-data.cjs UNLINKED
//      (admin.html), and every linked page answers 200;
//   2. each cat-*.html lists exactly its tools with a status tag and source-labelled accuracy lines (Crowd: dense limit);
//   3. desktop 1024 px: bar (no drawer), panel intro link and the breadcrumb open the category page;
//   4. phones 320 / 360 / 390 px: no horizontal overflow, 44 px targets, the drawer lists the 8 groups with their landing page;
//   5. English and Chinese: no Thai left on the 7 landing pages.
import { readdirSync } from "node:fs";
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

    await check("landing pages: each tool with status tag + accuracy lines with a source label; counts; Crowd dense limit", async () => {
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
            src: [...a.querySelectorAll(".cat-acc li")].map(li => li.dataset.src + ":" + (li.querySelector(".cat-src") || {}).textContent),
            go: (a.querySelector(".sl-go") || {}).getAttribute ? a.querySelector(".sl-go").getAttribute("href") : "", text: a.textContent
          })),
          count: document.getElementById("catCount").textContent
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
          assert(t.st === want.st && t.tag.includes(want.st), `${t.page} status ${t.st}/${t.tag}`);
          assert(t.src.length === want.claims.length && t.src.every((s, i) => s === D.CLAIMS[want.claims[i]].src + ":" + D.SOURCE[D.CLAIMS[want.claims[i]].src].th), `${t.page} sources ${t.src}`);
          assert(t.go === t.page + ".html", t.page + " link " + t.go);
        }
        assert(new RegExp("^" + c.pages.length + " เครื่องมือ").test(r.count), c.slug + " count " + r.count);
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
