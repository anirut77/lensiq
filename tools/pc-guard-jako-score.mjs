#!/usr/bin/env node
// tools/pc-guard-jako-score.mjs — scorer for the Japanese / Korean personal-data guard sets (stream F, 2026-11-13).
// Written and locked BEFORE the guard change (evals-locks/pc-f.sha256). Source of every number: synthetic.
//
// A set item: {id, lang, type: "personal"|"product"|"product+personal", text, facts?: {gtins?, regs?},
//              personal: [{kind, value, cue: "field"|"honorific"|"none"}]}
// Per personal value (every occurrence of value in text):
//   removed   every character of every occurrence lies inside a span of LQPCGuard.scan() (partial = not removed)
//   text leak the gate allows AI (aiGate(text, facts).allow) and the value is not removed
//   image leak the gate allows AI and imageCheck(text).block is false (the whole photo would go)
//   one-tap leak the gate allows AI, scan() finds nothing, possibleNames() finds nothing and autoBlock() is false
//             (the tester one-tap path sends the text with no preview)
// Per product item (no personal data):
//   falseRedaction  scan() removes something        falsePhotoBlock  imageCheck().block
//   gateRefused     aiGate().allow is false          oneTapLost       possibleNames() or autoBlock() stops one-tap
//
// Usage: node tools/pc-guard-jako-score.mjs <set.json> [--json] [--guard <path to lensiq-pc-guard.js>]
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/** @param {string} text @param {string} value @param {{start: number, end: number}[]} spans */
export function covered(text, value, spans) {
  if (!value) return true;
  let at = text.indexOf(value), any = false;
  while (at >= 0) {
    any = true;
    for (let i = at; i < at + value.length; i++) {
      if (/\s/.test(text[i])) continue;
      if (!spans.some(s => s.start <= i && i < s.end)) return false;
    }
    at = text.indexOf(value, at + 1);
  }
  return any;
}

const wilson = (k, n) => {
  if (!n) return [0, 1];
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - h) / d), Math.min(1, (c + h) / d)].map(x => Math.round(x * 1000) / 1000);
};

/** @param {any[]} items @param {any} G the guard module */
export function scoreSet(items, G) {
  const r = {
    values: 0, removed: 0, byCue: /** @type {Record<string, {n: number, removed: number}>} */ ({}), byKind: /** @type {Record<string, {n: number, removed: number}>} */ ({}),
    byLang: /** @type {Record<string, {n: number, removed: number}>} */ ({}),
    textLeak: 0, imageLeak: 0, oneTapLeak: 0, leakItems: /** @type {any[]} */ ([]), misses: /** @type {any[]} */ ([]),
    products: 0, falseRedaction: 0, falsePhotoBlock: 0, gateRefused: 0, oneTapLost: 0, productDetail: /** @type {any[]} */ ([]),
    personalDocs: 0, personalGateRefused: 0
  };
  const bump = (/** @type {any} */ m, /** @type {string} */ k, /** @type {boolean} */ ok) => { m[k] = m[k] || { n: 0, removed: 0 }; m[k].n++; if (ok) m[k].removed++; };
  for (const it of items) {
    const text = String(it.text);
    const facts = it.facts || {};
    const spans = G.scan(text);
    const gate = G.aiGate(text, facts);
    const img = G.imageCheck(text);
    const oneTapClear = spans.length === 0 && G.possibleNames(text).length === 0 && !G.autoBlock(text);
    const pv = Array.isArray(it.personal) ? it.personal : [];
    if (pv.length === 0) {
      r.products++;
      const d = { id: it.id, falseRedaction: spans.length > 0, photoBlock: img.block, gate: gate.reason, oneTapLost: !oneTapClear };
      if (d.falseRedaction) r.falseRedaction++;
      if (d.photoBlock) r.falsePhotoBlock++;
      if (!gate.allow) r.gateRefused++;
      if (!oneTapClear) r.oneTapLost++;
      if (d.falseRedaction || d.photoBlock || !gate.allow) r.productDetail.push({ ...d, removed: spans.map((/** @type {any} */ s) => s.kind + "=" + text.slice(s.start, s.end)) });
      continue;
    }
    r.personalDocs++;
    if (!gate.allow) r.personalGateRefused++;
    for (const p of pv) {
      r.values++;
      const ok = covered(text, p.value, spans);
      if (ok) r.removed++; else r.misses.push({ id: it.id, kind: p.kind, cue: p.cue, gate: gate.reason });
      bump(r.byCue, p.cue || "none", ok); bump(r.byKind, p.kind, ok); bump(r.byLang, it.lang, ok);
      if (gate.allow) {
        const leak = { id: it.id, kind: p.kind, cue: p.cue, text: !ok, image: !img.block, oneTap: oneTapClear };
        if (!ok) r.textLeak++;
        if (!img.block) r.imageLeak++;
        if (oneTapClear) r.oneTapLeak++;
        if (leak.text || leak.image || leak.oneTap) r.leakItems.push(leak);
      }
    }
  }
  const r3 = (/** @type {number} */ x) => Math.round(x * 1000) / 1000;
  const cued = Object.entries(r.byCue).filter(([k]) => k !== "none").reduce((a, [, v]) => ({ n: a.n + v.n, removed: a.removed + v.removed }), { n: 0, removed: 0 });
  return {
    ...r,
    recall: r3(r.removed / Math.max(1, r.values)), recallCI: wilson(r.removed, r.values),
    recallCued: r3(cued.removed / Math.max(1, cued.n)), recallCuedCI: wilson(cued.removed, cued.n), cued,
    falseRedactionRate: r3(r.falseRedaction / Math.max(1, r.products)), gateRefusedRate: r3(r.gateRefused / Math.max(1, r.products))
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--guard");
  if (!file) { console.error("usage: node tools/pc-guard-jako-score.mjs <set.json> [--json] [--guard <file>]"); process.exit(2); }
  const gi = args.indexOf("--guard");
  const G = require(gi >= 0 ? resolve(args[gi + 1]) : fileURLToPath(new URL("../lensiq-pc-guard.js", import.meta.url)));
  const set = JSON.parse(readFileSync(file, "utf8"));
  const m = scoreSet(set.items, G);
  if (args.includes("--json")) console.log(JSON.stringify(m, null, 1));
  else {
    const { leakItems, misses, productDetail, ...head } = m;
    console.log(JSON.stringify(head));
    console.log("leaks:", JSON.stringify(leakItems));
    console.log("misses:", JSON.stringify(misses));
    console.log("product refusals / redactions:", JSON.stringify(productDetail));
  }
}
