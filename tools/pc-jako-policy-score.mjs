#!/usr/bin/env node
// tools/pc-jako-policy-score.mjs — what reaches AI on each PATH under the Japanese / Korean rule (owner decision 2026-11-14,
// option ข and stricter), on a locked JA / KO set. Written and locked BEFORE the first measurement with the rule
// (evals-locks/pc-jk.sha256). Source of every number: synthetic. Reuses the locked guard scorer (pc-guard-jako-score.mjs:
// same item shape, same "removed" rule) and adds the product's real decisions per path:
//   explicit text   the user's own "Send this text" after the open preview: gate allows, value not removed (= the guard
//                   scorer's text leak; the rule does not stop this path, the guard and the user's own check do)
//   photo           page: aiGate allows AND imageCheck does not block AND the text has no JA / KO script (decide());
//                   Worker: buildFields image mode refuses JA / KO text (ai_off_jako_photo)
//   one-tap         LQPCLive.autoTextCheck + autoDecision (tester, consent, visible page, face check passed) say send
//                   AND the Worker accepts the auto request (build + autoCheck) for every feature
//   unpreviewed     a request WITHOUT the previewed mark (any page path that skipped the preview) that the Worker accepts
// Per product item (no personal data): photo refused by the rule, one-tap lost, Worker refusal of the previewed text.
// Usage: node tools/pc-jako-policy-score.mjs <set.json> [--json]
import { createRequire } from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocked, EVALS_ROOT } from "./eval-guard.mjs";
import { covered } from "./pc-guard-jako-score.mjs";

const require = createRequire(import.meta.url);
const G = require("../lensiq-pc-guard.js");
const LV = require("../lensiq-pc-live.js");
const PF = await import("../backend/src/ai/pc-features.js");

/** only a set locked under ~/LENSIQ-field/evals/<phase>/ is scored @param {string} f */
function guardSet(f) {
  const p = realpathSync(f), r = relative(realpathSync(EVALS_ROOT), p);
  if (!r || r.startsWith("..") || isAbsolute(r)) throw new Error(`eval-guard: ${f} is not under ${EVALS_ROOT}`);
  assertLocked(r.split(sep)[0], [p]);
}

/** the Worker's answer for one feature: "ok" or the refusal code @param {Function} build @param {any} input @param {string} mode @param {boolean} auto */
function worker(build, input, mode, auto) {
  try { build(input, { mode }); if (auto) PF.autoCheck(input); return "ok"; } catch (e) { return PF.refusalCode(e) || "error"; }
}
const BUILDS = [PF.buildFields, PF.buildClaims, PF.buildTranslate];

/** @param {any[]} items */
export function policyScore(items) {
  const r = { values: 0, explicitText: 0, photo: 0, oneTap: 0, unpreviewed: 0, products: 0, productPhotoRuleRefused: 0,
    productOneTapLost: 0, productPreviewedRefused: 0, jakoItems: 0, details: /** @type {any[]} */ ([]) };
  for (const it of items) {
    const text = String(it.text), facts = it.facts || {}, gtins = facts.gtins || [], regs = facts.regs || [];
    const script = it.lang === "ko" ? "ko" : it.lang === "zh" ? "cjk" : it.lang === "ja" ? "cjk" : "th";
    const jako = G.jakoScript(text, { script });
    if (jako) r.jakoItems++;
    const gate = G.aiGate(text, facts), img = G.imageCheck(text), spans = G.scan(text);
    const red = G.redact(text).text;
    const base = { text: red, script, gtins, regs };
    const photoPage = gate.allow && !img.block && !jako;
    const photoWorker = worker(PF.buildFields, { ...base, images: [{ mime: "image/jpeg", base64: "AA==", width: 1, height: 1 }], previewed: true }, "image", false) === "ok";
    const tc = LV.autoTextCheck(G, text, facts, { script });
    const tap = LV.autoDecision({ tester: true, autoOn: true, hidden: false, ...tc, face: { ran: true, faces: 0 }, key: "k", sent: [], count: 0, cap: 1 }).send;
    // the one-tap path sends the device text unchanged (no redaction: it needs a capture where the guard found nothing)
    const tapWorker = BUILDS.every(b => worker(b, { text, script, gtins, regs }, "text", true) === "ok");
    const unprev = gate.allow && BUILDS.some(b => worker(b, base, "text", false) === "ok");
    const pv = Array.isArray(it.personal) ? it.personal : [];
    if (!pv.length) {
      r.products++;
      if (gate.allow && !img.block && jako) r.productPhotoRuleRefused++;
      if (!tap) r.productOneTapLost++;
      if (gate.allow && BUILDS.some(b => worker(b, { ...base, previewed: true }, "text", false) !== "ok")) r.productPreviewedRefused++;
      continue;
    }
    for (const p of pv) {
      r.values++;
      const removed = covered(text, p.value, spans);
      const d = { id: it.id, kind: p.kind, cue: p.cue, jako,
        explicitText: gate.allow && !removed, photo: photoPage && photoWorker, oneTap: tap && tapWorker, unpreviewed: unprev && !removed };
      if (d.explicitText) r.explicitText++;
      if (d.photo) r.photo++;
      if (d.oneTap) r.oneTap++;
      if (d.unpreviewed) r.unpreviewed++;
      if (d.explicitText || d.photo || d.oneTap || d.unpreviewed) r.details.push(d);
    }
  }
  return r;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), file = args.find(a => !a.startsWith("--"));
  if (!file) { console.error("usage: node tools/pc-jako-policy-score.mjs <set.json> [--json]"); process.exit(2); }
  guardSet(file);
  const m = policyScore(JSON.parse(readFileSync(file, "utf8")).items);
  if (args.includes("--json")) console.log(JSON.stringify(m, null, 1));
  else { const { details, ...head } = m; console.log(JSON.stringify(head)); console.log("by value:", JSON.stringify(details)); }
}
