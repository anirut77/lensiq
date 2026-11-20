// tests/e2e/crisis-rules-1323-e.e2e.mjs — FIXED TEST SET "crisis-rules-1323" part E (independent review 2026-11-17, defect 3):
// the SHIPPED rule-6 switch (no override; lensiq-config.js says LENSIQ_HELP_TOP_STICKY = true, decisions 69 ค + 75 ก: a small 1323
// icon INSIDE the sticky top bar #siteNav, with the confirmation dialog, never overlapping content). Locked BEFORE the fix.
// 19 fortune pages x TH / EN / ZH x 360 / 393 / 430 px, at scroll positions 0, 300, 900, 1600, the middle and the bottom:
//   E1 the top 1323 control is inside #siteNav and its box lies wholly inside the bar's box (it never reaches the page content);
//   E2 it overlaps no other visible control or text of the bar (logo, language switch, menu toggle, links);
//   E3 every point of its box shows the bar (elementFromPoint belongs to #siteNav): nothing of the page is drawn there and it covers
//      no page text or control;
//   E4 the normal-state rules hold with the shipped value: 1669 / 191 / 1300 / Samaritans 0 times, 1323 in <= 2 taps, no help
//      element inside <main>, and no pinned help element except the icon in the bar.
//   E5 the icon opens the confirmation dialog: a tel:1323 call button (>= 44 px) and the "ช่องทางให้คำปรึกษา" link to
//      counselling.html (TH / EN / ZH, 393 px, tarot and fortune).
import { FORTUNE, LANGS, WIDTHS, COUNSEL, IN_CONTENT, PINNED, S, VIS, assert, load, noOtherNumbers, phone, sleep, taps1323, loadFailText } from "./crisis-rules-kit.mjs";

const ICON = `(() => { ${VIS}
  const nav = document.getElementById("siteNav");
  const c = [...document.querySelectorAll('#siteNav a[href="tel:1323"], #siteNav [aria-haspopup="dialog"], #lqHelpTop a[href="tel:1323"]')].find(vis);
  if (!c) return { found: false };
  const r = c.getBoundingClientRect(), n = nav ? nav.getBoundingClientRect() : null;
  const inBar = !!nav && nav.contains(c) && r.left >= n.left - 1 && r.right <= n.right + 1 && r.top >= n.top - 1 && r.bottom <= n.bottom + 1;
  const own = e => c.contains(e) || e.contains(c);
  const hits = [];
  if (nav) for (const e of nav.querySelectorAll("a, button, input, select, [role=button], .logo, .lang-switch, span, b, small, svg")) {
    if (own(e) || !vis(e)) continue;
    const q = e.getBoundingClientRect();
    if (q.left < r.right - 1 && r.left < q.right - 1 && q.top < r.bottom - 1 && r.top < q.bottom - 1) hits.push(name(e));
  }
  const out = [];
  for (let i = 1; i <= 4; i++) for (let j = 1; j <= 3; j++) {
    const x = r.left + (r.width * i) / 5, y = r.top + (r.height * j) / 4;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) { out.push("off-screen"); continue; }
    const t = document.elementFromPoint(x, y);
    if (!t || !nav || !nav.contains(t)) out.push(t ? name(t) : "none");
  }
  return { found: true, inBar, hits: [...new Set(hits)], out: [...new Set(out)], w: Math.round(r.width), h: Math.round(r.height), y: Math.round(scrollY) };
})()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("E1-E4: shipped switch, 19 fortune pages x TH / EN / ZH x 360 / 393 / 430 x 6 scroll positions: the 1323 icon sits inside the bar, covers nothing", async () => {
      const bad = [];
      let cases = 0;
      for (const lang of LANGS) {
        const page = await browser.newPage(null, { isolated: true });
        try {
          for (const w of WIDTHS) {
            await phone(page, w);
            for (const p of FORTUNE) {
              const where = `${p} ${lang} ${w}px`;
              cases++;
              try { await load(page, base, p, lang); } catch (e) { bad.push(`${where}: ${loadFailText(e)}`); continue; }
              bad.push(...await noOtherNumbers(page, where));
              if (await taps1323(page) > 2) bad.push(`${where}: 1323 not reachable in 2 taps`);
              const inContent = await page.evaluate(IN_CONTENT);
              if (inContent.length) bad.push(`${where}: help element between content sections ${S(inContent)}`);
              const pins = await page.evaluate(PINNED(true));
              if (pins.length) bad.push(`${where}: pinned help element outside the bar ${S(pins)}`);
              const tall = await page.evaluate("document.documentElement.scrollHeight - innerHeight");
              for (const y of [...new Set([0, 300, 900, 1600, Math.round(tall / 2), tall].filter(v => v >= 0 && v <= tall))]) {
                await page.evaluate(`window.scrollTo({ top: ${y}, behavior: "instant" })`);
                await sleep(120);
                const r = await page.evaluate(ICON);
                if (!r.found) { bad.push(`${where} @${y}: no top 1323 control`); break; }
                if (!r.inBar) bad.push(`${where} @${y}: E1 the 1323 control is not inside the bar ${S(r)}`);
                if (r.hits.length) bad.push(`${where} @${y}: E2 overlaps bar items ${S(r.hits)}`);
                if (r.out.length) bad.push(`${where} @${y}: E3 page content at the icon ${S(r.out)}`);
              }
            }
          }
        } finally { await page.close(); }
      }
      console.log(`    shipped switch: ${cases} page loads checked`);
      assert(!bad.length, bad.length + " problem(s):\n      " + bad.slice(0, 80).join("\n      "));
    });

    await check("E5: the icon opens the confirmation dialog with tel:1323 (>= 44 px) and the counselling link (TH / EN / ZH, 393 px)", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await browser.newPage(null, { isolated: true });
        try {
          await phone(page, 393);
          for (const p of ["tarot", "fortune"]) {
            await load(page, base, p, lang);
            const r = await page.evaluate(`(() => { ${VIS}
              const c = [...document.querySelectorAll('#siteNav [aria-haspopup="dialog"]')].find(vis);
              if (!c) return { icon: false };
              c.click();
              const d = [...document.querySelectorAll("dialog[open]")][0];
              if (!d) return { icon: true, dialog: false };
              const t = d.querySelector('a[href="tel:1323"]'), l = d.querySelector('a[href$="counselling.html"]');
              const tb = t ? t.getBoundingClientRect() : null;
              const out = { icon: true, dialog: true, tel: !!t, telW: tb ? Math.round(tb.width) : 0, telH: tb ? Math.round(tb.height) : 0, link: l ? l.textContent.trim() : "",
                others: [...d.querySelectorAll('a[href^="tel:"]')].map(a => a.getAttribute("href")).filter(h => h !== "tel:1323") };
              d.close(); return out; })()`);
            if (!r.icon || !r.dialog) { bad.push(`${p} ${lang}: no icon / dialog ${S(r)}`); continue; }
            if (!r.tel || r.telW < 44 || r.telH < 44) bad.push(`${p} ${lang}: dialog call button ${S(r)}`);
            if (!COUNSEL[lang].test(r.link)) bad.push(`${p} ${lang}: dialog counselling link ${S(r.link)}`);
            if (r.others.length) bad.push(`${p} ${lang}: other numbers in the dialog ${S(r.others)}`);
          }
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.join("\n      "));
    });
  } finally {
    await browser.close();
  }
}
