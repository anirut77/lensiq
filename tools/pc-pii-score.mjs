#!/usr/bin/env node
// tools/pc-pii-score.mjs — owner decision 127 (2026-11-19): personal data that reaches the AI payload when the user presses
// "Send this text" after the preview WITHOUT removing or restoring anything (the defaults). Target 0 in every language
// (th, en, zh, ja, ko). Written and locked (evals-locks/pc-pii.sha256) BEFORE the automatic removal it measures was built.
// Source of every number: synthetic.
//
// The default path it replays (lensiq-pc-ai.js ask -> previewText -> previewSend -> sendAll):
//   1. aiGate(text, facts) must allow (otherwise nothing is sent: no leak possible);
//   2. the preview starts from LQPCGuard.previewRedact(text) (automatic removal, on by default, on the device);
//   3. "Send this text" unchanged: provenance(previewText, ocr = text).text, then redact() again (the existing re-check);
//   4. that string is the payload of pc_fields / pc_claims / pc_translate.
// Per personal value (set item {personal: [{kind, value, cue}]}):
//   detected  every non-space character of every occurrence of the value lies inside a previewRedact span
//   leak      the gate allows AND (not detected OR the value, spaces removed, still stands in the payload, spaces removed)
//   workerOk  the Worker (backend/src/ai/pc-features.js buildFields, previewed) would accept that payload (reported;
//             a leak counts whether or not the Worker accepts, so the number is the page's own)
// Per product item (personal: []):
//   falseRemoval  previewRedact removed anything (item level), with the characters removed and what was removed
//   lostAI        the gate allowed the original text but the Worker refuses the default payload (no AI answer by default)
// Usage: node tools/pc-pii-score.mjs <set.json> [--json]
import { createRequire } from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocked, EVALS_ROOT } from "./eval-guard.mjs";

const require = createRequire(import.meta.url);
const G = require("../lensiq-pc-guard.js");
const PF = await import("../backend/src/ai/pc-features.js");

/** only a set locked under ~/LENSIQ-field/evals/<phase>/ is scored @param {string} f */
function guardSet(f) {
  const p = realpathSync(f), r = relative(realpathSync(EVALS_ROOT), p);
  if (!r || r.startsWith("..") || isAbsolute(r)) throw new Error(`eval-guard: ${f} is not under ${EVALS_ROOT}`);
  assertLocked(r.split(sep)[0], [p]);
}

/** @param {string} text @param {string} value @param {{start: number, end: number}[]} spans */
function covered(text, value, spans) {
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
const squash = (/** @type {string} */ s) => String(s).normalize("NFKC").replace(/\s+/g, "");

/** the payload the default path sends, or null when nothing is sent @param {string} text @param {any} facts */
export function defaultPayload(text, facts) {
  const gate = G.aiGate(text, facts);
  const pr = G.previewRedact(text);
  const kept = G.provenance(pr.text, text).text;
  const payload = G.redact(kept).text;
  return { gate, pr, payload };
}

/** @param {any[]} items */
export function score(items) {
  const lang = /** @type {Record<string, any>} */ ({});
  const L = (/** @type {string} */ k) => (lang[k] = lang[k] || { values: 0, detected: 0, leaks: 0, leaksWorkerAccepted: 0, products: 0, falseRemoval: 0,
    productChars: 0, productCharsRemoved: 0, lostAI: 0, gateRefusedPersonalItems: 0 });
  const leaks = /** @type {any[]} */ ([]), falseRemovals = /** @type {any[]} */ ([]), errors = /** @type {any[]} */ ([]), byKind = /** @type {Record<string, any>} */ ({});
  for (const it of items) {
    const text = String(it.text), facts = it.facts || {}, l = L(it.lang);
    const script = it.lang === "ko" ? "ko" : it.lang === "zh" || it.lang === "ja" ? "cjk" : "th";
    const { gate, pr, payload } = defaultPayload(text, facts);
    const src = String(pr.source);
    let workerOk = false;
    try { PF.buildFields({ text: payload, script, gtins: facts.gtins || [], regs: facts.regs || [], previewed: true }, { mode: "text" }); workerOk = true; } catch { workerOk = false; }
    const pv = Array.isArray(it.personal) ? it.personal : [];
    if (!pv.length) {
      l.products++;
      l.productChars += src.replace(/\s/g, "").length;
      const removedChars = pr.spans.reduce((a, /** @type {any} */ s) => a + src.slice(s.start, s.end).replace(/\s/g, "").length, 0);
      l.productCharsRemoved += removedChars;
      if (pr.spans.length) { l.falseRemoval++; falseRemovals.push({ id: it.id, removed: pr.removed.map((/** @type {any} */ r) => r.kind + "=" + r.text) }); }
      if (gate.allow && !workerOk) l.lostAI++;
      continue;
    }
    if (!gate.allow) l.gateRefusedPersonalItems++;
    for (const p of pv) {
      l.values++;
      const k = (byKind[it.lang + "/" + p.kind] = byKind[it.lang + "/" + p.kind] || { values: 0, leaks: 0 });
      k.values++;
      const v = String(p.value).normalize("NFC");
      if (src.indexOf(v) < 0) errors.push({ id: it.id, value: p.value, why: "value not found in the canonical text" });
      const det = src.indexOf(v) >= 0 && covered(src, v, pr.spans);
      if (det) l.detected++;
      const inPayload = squash(payload).includes(squash(v));
      const leak = gate.allow && (!det || inPayload);
      if (leak) {
        l.leaks++; k.leaks++;
        if (workerOk) l.leaksWorkerAccepted++;
        leaks.push({ id: it.id, lang: it.lang, kind: p.kind, cue: p.cue, value: p.value, workerOk });
      }
    }
  }
  const total = Object.values(lang).reduce((a, x) => { for (const k in x) a[k] = (a[k] || 0) + x[k]; return a; }, /** @type {Record<string, number>} */ ({}));
  return { lang, total, byKind, leaks, falseRemovals, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), file = args.find(a => !a.startsWith("--"));
  if (!file) { console.error("usage: node tools/pc-pii-score.mjs <set.json> [--json]"); process.exit(2); }
  guardSet(file);
  const m = score(JSON.parse(readFileSync(file, "utf8")).items);
  if (args.includes("--json")) console.log(JSON.stringify(m, null, 1));
  else {
    console.log("per language:", JSON.stringify(m.lang));
    console.log("total:", JSON.stringify(m.total));
    console.log("leaks:", JSON.stringify(m.leaks));
    console.log("false removals:", JSON.stringify(m.falseRemovals));
    if (m.errors.length) console.log("set errors:", JSON.stringify(m.errors));
  }
}
