// tests/e2e/crisis-rules-1323-c.e2e.mjs — FIXED TEST SET "crisis-rules-1323" part C (owner decision 2026-11-16 crisis one-number
// rules; see crisis-rules-kit.mjs).
//   P1 counselling.html ("ช่องทางให้คำปรึกษา"), TH / EN / ZH x 360 / 393 / 430: each service (1323, 1669, 191, 1300, Samaritans
//      02 113 6789) is ONE row: its label and its call button share one line (the label's first line and the button overlap
//      vertically, the button to the right), a tel: button at least 44 x 44 px, not covered; the title is in the page
//      language; the crisis net is loaded (window.LQFortuneCrisis); no reading content and no ads or offers; nothing pinned.
//   K1 calm state (the tab's crisis flag set before load), 19 fortune pages x TH / EN / ZH at 393 px: 1669 / 191 / 1300 /
//      Samaritans 0 times, 1323 in <= 2 taps, no pinned help element.
//   K2 calm reading (dream, TH / EN / ZH, 393 px): the help line comes AFTER the reading (below the last section), holds only
//      tel:1323 and the counselling link, and is not sticky or fixed.
import { FORTUNE, LANGS, PINNED, S, STICKY, VIS, WIDTHS, COUNSEL, assert, load, noOtherNumbers, phone, sleep, taps1323 } from "./crisis-rules-kit.mjs";

const CALM = `try { sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) {}`;
const TITLE = { th: /ช่องทางให้คำปรึกษา/, en: /counsel/i, zh: /咨询/ };

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("P1: counselling.html, TH / EN / ZH x 360 / 393 / 430: five services, one row each with a tel: button >= 44 px; crisis net loaded; no reading, no ads", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await browser.newPage(null, { isolated: true, initScripts: [STICKY(false)] });
        try {
          for (const w of WIDTHS) {
            await phone(page, w);
            const where = `counselling ${lang} ${w}px`;
            try { await load(page, base, "counselling", lang); } catch (e) { bad.push(`${where}: did not load`); continue; }
            const r = await page.evaluate(`(() => { ${VIS}
              const rows = [...document.querySelectorAll("main [data-lq-call]")].filter(vis).map(c => {
                const a = c.querySelector('a[href^="tel:"]'), l = c.querySelector(".lq-call-t");
                if (!a) return { id: c.getAttribute("data-lq-call"), tel: null };
                const b = a.getBoundingClientRect(); let one = true, right = true;
                if (l && vis(l)) { const rg = document.createRange(); rg.selectNodeContents(l); const f = rg.getClientRects()[0] || l.getBoundingClientRect();
                  one = f.top < b.bottom && b.top < f.bottom; right = b.left >= f.left; }
                const hit = document.elementFromPoint(b.left + b.width / 2, Math.min(innerHeight - 1, Math.max(0, b.top + b.height / 2)));
                const onScreen = b.top >= 0 && b.bottom <= innerHeight;
                return { id: c.getAttribute("data-lq-call"), tel: a.getAttribute("href"), w: Math.round(b.width), h: Math.round(b.height), one, right,
                  covered: onScreen && !(hit && (hit === a || a.contains(hit))) };
              });
              return { rows, title: (document.querySelector("main h1") || {}).textContent || "", net: !!window.LQFortuneCrisis && typeof window.LQFortuneCrisis.check === "function",
                reading: [...document.querySelectorAll(".fa-section, .fa-summary, .fa-plan, [data-lq-result]")].filter(vis).length,
                ads: [...document.querySelectorAll("[data-lq-upsell], [data-lq-remedy], [data-lq-paid], [data-lq-merit], .ad, [data-ad], ins")].filter(vis).length,
                price: /฿|บาท|THB|ราคา|价格|\\bprice/i.test(document.querySelector("main") ? document.querySelector("main").innerText : "") }; })()`);
            const want = { 1323: "tel:1323", 1669: "tel:1669", 191: "tel:191", 1300: "tel:1300", samaritans: "tel:021136789" };
            for (const [id, tel] of Object.entries(want)) {
              const row = r.rows.filter(x => x.id === id);
              if (row.length !== 1) { bad.push(`${where}: ${id} shows in ${row.length} rows`); continue; }
              const x = row[0];
              if (x.tel !== tel) bad.push(`${where}: ${id} links ${x.tel}`);
              if (x.w < 44 || x.h < 44) bad.push(`${where}: ${id} button ${x.w}x${x.h}`);
              if (!x.one || !x.right) bad.push(`${where}: ${id} label and button are not one row ${S(x)}`);
              if (x.covered) bad.push(`${where}: ${id} button covered`);
            }
            if (!TITLE[lang].test(r.title)) bad.push(`${where}: title ${S(r.title)}`);
            if (!r.net) bad.push(`${where}: crisis net not loaded`);
            if (r.reading) bad.push(`${where}: reading content on the page`);
            if (r.ads || r.price) bad.push(`${where}: ads / offers / prices on the page`);
            const pins = await page.evaluate(PINNED(false));
            if (pins.length) bad.push(`${where}: pinned ${S(pins)}`);
          }
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n      " + bad.join("\n      "));
    });

    await check("K1: calm state (tab flag), 19 fortune pages x TH / EN / ZH, 393 px: only 1323, in <= 2 taps, nothing pinned", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await browser.newPage(null, { isolated: true, initScripts: [STICKY(false), CALM] });
        try {
          await phone(page, 393);
          for (const p of FORTUNE) {
            const where = `${p} ${lang} calm`;
            try { await load(page, base, p, lang); } catch (e) { bad.push(`${where}: did not load`); continue; }
            bad.push(...await noOtherNumbers(page, where));
            if (await taps1323(page) > 2) bad.push(`${where}: 1323 not reachable in 2 taps`);
            const pins = await page.evaluate(PINNED(false));
            if (pins.length) bad.push(`${where}: pinned ${S(pins)}`);
          }
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n      " + bad.slice(0, 60).join("\n      "));
    });

    await check("K2: calm reading (dream, TH / EN / ZH, 393 px): the help line comes after the reading, only 1323 + the counselling link, not pinned", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await browser.newPage(null, { isolated: true, initScripts: [STICKY(false), CALM] });
        try {
          await phone(page, 393);
          await load(page, base, "dream", lang);
          await page.evaluate(() => { const t = document.getElementById("drText"); t.value = "ฝันว่างูตัวใหญ่ไล่ตาม แล้วฟันหลุด"; t.dispatchEvent(new Event("input")); });
          await page.waitFor(() => document.querySelectorAll("#drSel .dr-x").length >= 1, 4000);
          await page.evaluate(() => {
            document.querySelector('input[name="drMood"][value="happy"]').click(); document.querySelector('input[name="drTime"][value="dawn"]').click(); document.getElementById("drGo").click();
          });
          await page.waitFor(() => { const b = document.getElementById("drRd-body"); return !!b && b.querySelectorAll(".fa-section").length >= 3; }, 12000);
          await sleep(800);
          const r = await page.evaluate(`(() => { ${VIS}
            const secs = [...document.querySelectorAll(".fa-section")].filter(vis), last = secs[secs.length - 1];
            const lines = [...document.querySelectorAll(".lq-helpline")].filter(e => vis(e) && e.id !== "lqHelpTop" && !e.closest("#lqHelpTop"));
            return { secs: secs.length, lines: lines.map(l => ({ tels: [...l.querySelectorAll('a[href^="tel:"]')].map(a => a.getAttribute("href")),
              link: !!l.querySelector('a[href*="counselling.html"]'), linkText: (l.querySelector('a[href*="counselling.html"]') || {}).textContent || "",
              after: !!last && !!(last.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING) && l.getBoundingClientRect().top >= last.getBoundingClientRect().bottom - 1,
              pinned: !!pinned(l) })) }; })()`);
          if (!r.lines.length) bad.push(`${lang}: no help line with the calm reading ${S(r)}`);
          for (const l of r.lines) {
            if (S(l.tels) !== S(["tel:1323"])) bad.push(`${lang}: calm line tel links ${S(l.tels)}`);
            if (!l.link || !COUNSEL[lang].test(l.linkText)) bad.push(`${lang}: calm line has no counselling link ${S(l.linkText)}`);
            if (!l.after) bad.push(`${lang}: calm line is not after the reading`);
            if (l.pinned) bad.push(`${lang}: calm line is sticky or fixed`);
          }
          bad.push(...await noOtherNumbers(page, `dream ${lang} calm reading`));
        } catch (e) { bad.push(`${lang}: ${e.message.slice(0, 140)}`); } finally { await page.close(); }
      }
      assert(!bad.length, bad.join("\n      "));
    });
  } finally {
    await browser.close();
  }
}
