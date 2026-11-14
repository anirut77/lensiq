// tests/e2e/overlap-kit.mjs — shared runner of the "nothing may cover a button" gate (owner order 2026-11-14, part D1),
// split over tests/e2e/overlap-<k>.e2e.mjs (k = 1..PARTS; part k checks every (target, language) pair whose index in the
// list TARGETS x LANGS of tools/overlap-probe.mjs is k-1 modulo PARTS, so no file runs much over 90 s).
// The probe is tools/overlap-probe.mjs: every page (+ the ?demo=1 and API-on variants), TH / EN / 中文, at 360×640,
// 375×667, 414×736 and 1280×800, scrolled to the top and to the bottom.
// Rule: 0 BLOCKING covered controls (a tappable control under a fixed / sticky element that no scroll can clear), except
// the known exceptions in tests/e2e/overlap-exceptions.json (APPEND-ONLY: each entry names the target, a text the finding
// contains, why it cannot be fixed without the owner, and the date added). The literal count (controls only scrolled
// under a docked bar) is printed, not gated.
// Locked before any product fix: evals-locks/overlap-d.sha256.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";
import { LANGS, TARGETS, probeTarget } from "../../tools/overlap-probe.mjs";

export const PARTS = 16;
const here = dirname(fileURLToPath(import.meta.url));
const EXC = JSON.parse(readFileSync(join(here, "overlap-exceptions.json"), "utf8")).exceptions;

/** @param {string} target @param {string} finding */
export const excepted = (target, finding) => EXC.some(e => e.target === target && finding.includes(e.contains));

export const PAIRS = TARGETS.flatMap(t => LANGS.map(lang => ({ t, lang })));

export async function runPart(ctx, k) {
  const { base, launch, check } = ctx;
  const pairs = PAIRS.filter((_, i) => i % PARTS === k - 1);
  await check(`part ${k}/${PARTS} has pairs; every exception has a reason`, async () => {
    assert(pairs.length > 0, "no pages in this part");
    for (const e of EXC) assert(e.target && e.contains && e.reason && e.reason.length > 20 && e.added, "exception without target / contains / reason / added: " + JSON.stringify(e));
  });
  const browser = await launch();
  try {
    for (const { t, lang } of pairs) {
      await check(`${t.id} ${lang}: 360 / 375 / 414 / 1280, top + bottom — no control covered by a fixed or sticky element`, async () => {
        const r = await probeTarget(browser, base, t, lang);
        const bad = [];
        let literal = 0;
        for (const [at, v] of Object.entries(r)) {
          literal += v.literal.length;
          for (const f of v.blocking) if (!excepted(t.id, f)) bad.push(`${at}: ${f}`);
        }
        if (literal) console.log(`       note: ${t.id} ${lang}: ${literal} control(s) only scrolled under a docked bar (clear after a scroll)`);
        assert(!bad.length, `${bad.length} covered control(s):\n         ` + bad.slice(0, 25).join("\n         "));
      });
    }
  } finally { await browser.close(); }
}
