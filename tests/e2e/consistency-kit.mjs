// tests/e2e/consistency-kit.mjs — shared runner of the site-wide consistency gate (owner order 2026-11-14 B), split over
// tests/e2e/consistency-<k>.e2e.mjs (k = 1..PARTS; part k checks every page whose index in the sorted ./*.html list is
// k-1 modulo PARTS). The probe is tools/consistency-probe.mjs (375×667 and 1280×800, TH / EN / 中文).
// Rules, per page:
//   overflow, header, untranslated, states   0 findings, except the known exceptions in
//                                             tests/e2e/consistency-exceptions.json (append-only: each entry names the
//                                             page, the category, a text the finding contains and why it needs the owner)
//   buttons                                  ratchet: the page's count (all languages and both viewports) may not rise
//                                             above tests/e2e/consistency-buttons-max.json; the maximum is only ever
//                                             lowered (like TYPECHECK_MAX in ci.yml), never raised
// Locked before any product fix: evals-locks/consistency.sha256.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";
import { LANGS, PAGES, SHARED_BUTTON, probePage } from "../../tools/consistency-probe.mjs";

export const PARTS = 6;
const here = dirname(fileURLToPath(import.meta.url));
const EXC = JSON.parse(readFileSync(join(here, "consistency-exceptions.json"), "utf8")).exceptions;
const BMAX = JSON.parse(readFileSync(join(here, "consistency-buttons-max.json"), "utf8")).max;
const STRICT = ["overflow", "header", "untranslated", "states"];

/** @param {string} page @param {string} cat @param {string} finding */
export const excepted = (page, cat, finding) => EXC.some(e => e.page === page && e.category === cat && finding.includes(e.contains));

export async function runPart(ctx, k) {
  const { base, launch, check } = ctx;
  const pages = PAGES.filter((_, i) => i % PARTS === k - 1);
  await check(`part ${k}/${PARTS} has pages; every exception has a reason`, async () => {
    assert(pages.length > 0, "no pages in this part");
    const css = readFileSync(join(here, "..", "..", "styles.css"), "utf8");
    for (const c of SHARED_BUTTON) assert(new RegExp(`(^|[},\\s])\\.${c}\\{`, "m").test(css), `shared button class .${c} is not defined in styles.css`);
    for (const e of EXC) assert(e.page && e.category && e.contains && e.reason && e.reason.length > 20, "exception without page / category / contains / reason: " + JSON.stringify(e));
  });
  const browser = await launch();
  try {
    for (const page of pages) {
      await check(`${page}: 375 px + desktop, TH / EN / 中文 — no overflow, shared header, translated, states; buttons <= ratchet`, async () => {
        const bad = [];
        let buttons = 0;
        for (const lang of LANGS) {
          const r = await probePage(browser, base, page, lang);
          for (const vp of ["phone", "desktop"]) {
            for (const cat of STRICT) for (const f of r[vp][cat]) if (!excepted(page, cat, f)) bad.push(`${lang} ${vp} ${cat}: ${f}`);
            buttons += r[vp].buttons.length;
          }
        }
        const max = BMAX[page] || 0;
        if (buttons > max) bad.push(`buttons without a shared class (.btn / .chip): ${buttons} > ratchet ${max}`);
        if (buttons < max) console.log(`       note: ${page} buttons ${buttons} < ratchet ${max} — lower tests/e2e/consistency-buttons-max.json`);
        assert(!bad.length, `${bad.length} finding(s):\n         ` + bad.slice(0, 25).join("\n         "));
      });
    }
  } finally { await browser.close(); }
}
