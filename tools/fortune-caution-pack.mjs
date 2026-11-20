#!/usr/bin/env node
// tools/fortune-caution-pack.mjs — writes the browser rule packs of the "สิ่งที่ควรระวัง" section (owner item 177) from the rules
// (fortune-caution-rules-*.js, which hold wording ids only) and the APPROVED-WORDING REGISTER (fortune-caution-wording.js):
//   fortune-caution-pack-<domain>-<lang>.js         live pack: only rules whose every text is a register entry with status "reviewed" or
//                                                   "expert-ok" (the only texts that can ship with the drafts switch off)
//   fortune-caution-pack-<domain>-<lang>-draft.js   draft pack: the other rules; loaded only with LENSIQ_FORTUNE_CAUTIONS_DRAFTS
// Any text that is not a register entry is refused (checkRules), and every entry must also pass the section's filter in every place its
// rule can show it (defence in depth). The tool stamps fortune-caution.js with the version V of the lazy files and with the schools that
// have rules per page (all) and live rules per page (live), so the shell mounts nothing on a page that has no rule it may show.
//   node tools/fortune-caution-pack.mjs           write the packs and the stamps
//   node tools/fortune-caution-pack.mjs --check   exit 1 when a pack or a stamp is out of date (tests/unit/fortune-caution-pack.test.js)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const LANGS = ["th", "en", "zh"];
const TEXTS = ["mind", "do", "cheer", "luck"];
const KEEP = ["id", "school", "kind", "spans", "polarity", "topic", "trigger", "modern", "status"];
const RANK = { draft: 0, reviewed: 1, "expert-ok": 2 };
const SHELL = join(repo, "fortune-caution.js");
const RULE_FILES = ["fortune-caution-rules-th.js", "fortune-caution-rules-cn.js", "fortune-caution-rules-w.js"];

/**
 * Problems of raw rules against the register: every text field must be the id of a register entry of the same kind (guidance: of the
 * rule's category); for a live pack (live: true) every entry must be "reviewed" or "expert-ok".
 * @param {any[]} rules raw rules (ids, not text) @param {{ENTRIES: any[]}} wording @param {{live?: boolean}} [o] @returns {string[]}
 */
export function checkRules(rules, wording, o = {}) {
  const by = new Map(wording.ENTRIES.map(e => [e.id, e])), out = [];
  for (const r of rules) for (const f of TEXTS) {
    if (r[f] === undefined) continue;
    if (typeof r[f] !== "string") { out.push(`${r.id}.${f}: free text, not a register id`); continue; }
    const e = by.get(r[f]);
    if (!e) { out.push(`${r.id}.${f}: ${r[f]} is not in the register`); continue; }
    if (e.cat.split(":")[0] !== f) out.push(`${r.id}.${f}: register entry ${e.id} is a ${e.cat}`);
    if (f === "do" && e.cat !== "do:" + r.doCat) out.push(`${r.id}.do: register entry ${e.id} is ${e.cat}, the rule says ${r.doCat}`);
    if (o.live && !(RANK[e.status] >= 1)) out.push(`${r.id}.${f}: ${e.id} is ${e.status}, not reviewed`);
  }
  return out;
}

const rawRules = () => RULE_FILES.flatMap(f => require(join(repo, f)));
const rankOf = (r, by) => Math.min(...TEXTS.filter(f => r[f] !== undefined).map(f => RANK[by.get(r[f]).status]));

/** @returns {{files: Record<string, string>, all: Record<string, string[]>, live: Record<string, string[]>}} */
export function build() {
  const core = require(join(repo, "fortune-caution-core.js")), W = require(join(repo, "fortune-caution-wording.js"));
  const raw = rawRules(), by = new Map(W.ENTRIES.map(e => [e.id, e]));
  const bad = checkRules(raw, W);
  for (const r of raw) for (const f of TEXTS) if (r[f] !== undefined && by.get(r[f])) for (const lang of LANGS) {
    const ctxs = r.kind === "period" ? (r.spans || []).map(span => ({ part: "period", span })) : [{ part: "overall" }];
    for (const ctx of ctxs) { const why = core.check(by.get(r[f])[lang], f, ctx); if (why) bad.push(`${r.id}.${f}.${lang} (${ctx.span || ctx.part}): ${why}`); }
  }
  if (bad.length) throw new Error("fortune-caution-pack: refused:\n  " + bad.join("\n  "));
  /** @type {Record<string, string>} */
  const files = {};
  /** @type {Record<string, string[]>} */
  const all = {}, live = {};
  for (const domain of Object.keys(core.DOMAINS)) {
    const mine = raw.filter(r => r.domains.includes(domain));
    all[domain] = [...new Set(mine.map(r => r.school))].sort();
    const lv = [...new Set(mine.filter(r => r.status === "expert-ok" && rankOf(r, by) >= 1).map(r => r.school))].sort();
    if (lv.length) live[domain] = lv; // pages with no live rule are left out (the shell mounts nothing there)
    for (const lang of LANGS) for (const draft of [false, true]) {
      const list = mine.filter(r => (rankOf(r, by) >= 1) !== draft).map(r => {
        /** @type {Record<string, any>} */
        const o = { domains: [domain] };
        for (const k of KEEP) if (r[k] !== undefined) o[k] = r[k];
        for (const f of TEXTS) if (r[f] !== undefined) o[f] = { [lang]: by.get(r[f])[lang] };
        o.wordingRank = rankOf(r, by);
        return o;
      });
      const name = `fortune-caution-pack-${domain}-${lang}${draft ? "-draft" : ""}.js`;
      files[name] = "/* " + name + " — generated by tools/fortune-caution-pack.mjs; do not edit.\n" +
        " * From fortune-caution-rules-*.js and the approved-wording register fortune-caution-wording.js.\n" +
        " * " + (draft ? "DRAFT wording: loaded only with LENSIQ_FORTUNE_CAUTIONS_DRAFTS." : "Reviewed wording only.") + " */\n" +
        "(function (w) {\n  var R = " + JSON.stringify(list, null, 1) + ";\n" +
        "  var all = w.LQCautionRules = w.LQCautionRules || [];\n" +
        "  R.forEach(function (r) {\n" +
        "    var o = all.filter(function (x) { return x.id === r.id; })[0];\n" +
        "    if (!o) { all.push(r); return; }\n" +
        "    r.domains.forEach(function (d) { if (o.domains.indexOf(d) < 0) o.domains.push(d); });\n" +
        "    [\"mind\", \"do\", \"cheer\", \"luck\"].forEach(function (f) { if (r[f]) o[f] = Object.assign(o[f] || {}, r[f]); });\n" +
        "  });\n})(window);\n";
    }
  }
  return { files, all, live };
}
/** @returns {Record<string, string>} */
export function packs() { return build().files; }

/** version of the lazily loaded files: first 8 hex of sha256(core + packs) @param {Record<string, string>} p */
export function version(p) {
  const h = createHash("sha256").update(readFileSync(join(repo, "fortune-caution-core.js")));
  for (const k of Object.keys(p).sort()) h.update(k).update(p[k]);
  return h.digest("hex").slice(0, 8);
}

const VRE = /var V = "([0-9a-f]{8})";/, MRE = /var SCHOOLS = (\{[^\n]*\});/;
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const b = build(), p = b.files, v = version(p), check = process.argv.includes("--check");
  const maps = JSON.stringify({ all: b.all, live: b.live });
  const shell = readFileSync(SHELL, "utf8");
  if (!VRE.test(shell) || !MRE.test(shell)) { console.error("fortune-caution.js needs `var V = \"<8 hex>\";` and `var SCHOOLS = {...};` lines"); process.exit(2); }
  const stale = Object.keys(p).filter(f => !existsSync(join(repo, f)) || readFileSync(join(repo, f), "utf8") !== p[f]);
  const next = shell.replace(VRE, `var V = "${v}";`).replace(MRE, `var SCHOOLS = ${maps};`);
  if (check) {
    if (stale.length || next !== shell) { console.error("out of date: " + stale.join(", ") + (next !== shell ? " (shell stamps)" : "")); process.exit(1); }
    console.log("fortune-caution packs OK (" + Object.keys(p).length + " files, version " + v + ")");
  } else {
    for (const f of stale) writeFileSync(join(repo, f), p[f]);
    if (next !== shell) writeFileSync(SHELL, next);
    console.log("wrote " + stale.length + " pack(s); version " + v);
  }
}
