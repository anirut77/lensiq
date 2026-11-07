#!/usr/bin/env node
// tools/fortune-review-ingest.mjs — read scored native-speaker review sheets and report (Markdown on stdout).
//
// Input: one or more review-sheet.csv files from tools/fortune-review-export.mjs, filled in by reviewers (any number of
// reviewers; one file each, or one file with a "reviewer" column). Optional: --reports <file> with "LENSIQ reading
// report v1" texts collected from the site's "report a problem" button (mailto / copy / saved), tallied separately.
//
// Report: per language and per criterion the mean, the share of scores ≥ 4 and the count; the same per domain and per
// tone; every flagged reading (any score ≤ 2 or safety = fail) with its comment; reviewer agreement where two or more
// reviewers scored the same id (mean |difference|, share within 1 point); and the acceptance gate below.
//
// Gate (docs/FORTUNE-REVIEW.md §4; --gate makes the exit code 1 when it fails):
//   per language: mean naturalness ≥ 4.0, mean cultural ≥ 4.0, mean gentleness on caution readings ≥ 4.0,
//   no domain with a mean below 3.5 on any criterion, zero safety fails, ≥ 90 % of rows scored.
//
//   node tools/fortune-review-ingest.mjs scored-A.csv scored-B.csv
//   node tools/fortune-review-ingest.mjs scored.csv --reports inbox.txt --json summary.json --gate
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SCORES = ["naturalness", "gentleness", "cultural"];
export const GATE = { natural: 4.0, cultural: 4.0, gentleCaution: 4.0, domainFloor: 3.5, scoredShare: 0.9 };

/** RFC 4180 CSV → array of objects (header row; handles quotes, doubled quotes, CRLF, newlines in cells, BOM). */
export function parseCSV(text) {
  text = String(text).replace(/^﻿/, "");
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = ""; if (row.some(x => x !== "")) rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some(x => x !== "")) rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/** "4" → 4 ; "" / "n/a" → null ; out of 1..5 → NaN (reported as invalid). */
export function score(v) {
  if (v == null || /^(|-|n\/?a)$/i.test(String(v).trim())) return null;
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : NaN;
}
/** safety: pass / fail (also ผ่าน / ไม่ผ่าน, 通过 / 不通过, ok, 1/0, y/n). */
export function safety(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return null;
  if (/^(pass|ok|y|yes|1|ผ่าน|通过|✓)$/.test(s)) return "pass";
  if (/^(fail|no|n|0|ไม่ผ่าน|不通过|✗|x)$/.test(s)) return "fail";
  return "invalid";
}

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const f2 = x => (x == null ? "–" : x.toFixed(2));
const pct = (a, b) => (b ? Math.round(100 * a / b) + " %" : "–");

/** Aggregate scored rows. rows: objects from parseCSV (one file or many concatenated, each row may carry "reviewer"). */
export function summarise(rows) {
  const bad = [], flagged = [], scored = [];
  for (const r of rows) {
    const s = { id: r.id, domain: r.domain, lang: r.lang, tone: r.tone, page: r.page, reviewer: r.reviewer || r._file || "?", comment: r.comment || "" };
    let any = false;
    for (const k of SCORES) { s[k] = score(r[k]); if (Number.isNaN(s[k])) bad.push(`${r.id}: ${k}="${r[k]}" (expected 1–5)`); if (s[k] != null && !Number.isNaN(s[k])) any = true; }
    s.safety = safety(r.safety); if (s.safety === "invalid") bad.push(`${r.id}: safety="${r.safety}" (expected pass/fail)`); if (s.safety) any = true;
    s.scored = any;
    scored.push(s);
    if (SCORES.some(k => s[k] != null && s[k] <= 2) || s.safety === "fail") flagged.push(s);
  }
  const ok = scored.filter(s => s.scored);
  const group = key => {
    const m = {};
    for (const s of ok) {
      const g = m[key(s)] = m[key(s)] || { n: 0, fails: 0 };
      g.n++; if (s.safety === "fail") g.fails++;
      for (const k of SCORES) if (s[k] != null && !Number.isNaN(s[k])) (g[k] = g[k] || []).push(s[k]);
    }
    for (const g of Object.values(m)) for (const k of SCORES) { const a = g[k] || []; g[k] = { mean: mean(a), hi: a.filter(x => x >= 4).length, n: a.length }; }
    return m;
  };
  const byLang = group(s => s.lang), byDomain = group(s => `${s.lang}/${s.domain}`), byTone = group(s => `${s.lang}/${s.tone}`);
  // agreement: same id scored by ≥ 2 reviewers
  const ids = {};
  for (const s of ok) (ids[s.id] = ids[s.id] || []).push(s);
  const diffs = [];
  for (const list of Object.values(ids)) if (list.length > 1) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) for (const k of SCORES) if (list[i][k] != null && list[j][k] != null) diffs.push(Math.abs(list[i][k] - list[j][k]));
  const agreement = { pairs: diffs.length, meanAbs: mean(diffs), within1: diffs.length ? diffs.filter(d => d <= 1).length / diffs.length : null };
  // gate
  const gate = [];
  for (const [lang, g] of Object.entries(byLang)) {
    const caut = byTone[`${lang}/caution`];
    const chk = (name, v, min) => gate.push({ lang, name, value: v, min, ok: v != null && v >= min });
    chk("mean naturalness", g.naturalness.mean, GATE.natural);
    chk("mean cultural accuracy", g.cultural.mean, GATE.cultural);
    chk("mean gentleness on caution readings", caut ? caut.gentleness.mean : null, GATE.gentleCaution);
    gate.push({ lang, name: "safety fails", value: g.fails, max: 0, ok: g.fails === 0 });
    const low = Object.entries(byDomain).filter(([k]) => k.startsWith(lang + "/")).filter(([, d]) => SCORES.some(k => d[k].mean != null && d[k].mean < GATE.domainFloor)).map(([k]) => k.split("/")[1]);
    gate.push({ lang, name: `domains below ${GATE.domainFloor} on any criterion`, value: low.length ? low.join(", ") : "none", ok: !low.length });
  }
  const share = rows.length ? ok.length / rows.length : 0;
  gate.push({ lang: "all", name: "rows scored", value: share, min: GATE.scoredShare, ok: share >= GATE.scoredShare });
  return { rows: rows.length, scored: ok.length, invalid: bad, flagged, byLang, byDomain, byTone, agreement, gate, pass: gate.every(g => g.ok) && !bad.length };
}

/** Parse "LENSIQ reading report v1" blocks (lensiq-report.js) from free text: e-mails, copied texts, saved exports. */
export function parseReports(text) {
  const out = [];
  for (const chunk of String(text).split(/(?=LENSIQ reading report v1)/)) {
    if (!/^LENSIQ reading report v1/.test(chunk)) continue;
    const head = chunk.split(/\n--- note ---/)[0];
    const f = {};
    for (const m of head.matchAll(/^(page|ui_lang|reading_lang|source|domain|category|date):\s*(.*)$/gm)) f[m[1]] = m[2].trim();
    const note = (chunk.split(/\n--- note ---\n/)[1] || "").split(/\n--- reading ---/)[0].trim();
    out.push({ ...f, note: note === "-" ? "" : note });
  }
  return out;
}

export function markdown(S, reports) {
  const L = [];
  L.push(`# Fortune native-speaker review — summary`, ``, `Rows: ${S.rows} · scored: ${S.scored} · flagged: ${S.flagged.length} · invalid cells: ${S.invalid.length}`, ``);
  L.push(`## Gate: ${S.pass ? "PASS" : "FAIL"}`, ``, `| Language | Check | Value | Target | Result |`, `|---|---|---|---|---|`);
  for (const g of S.gate) L.push(`| ${g.lang} | ${g.name} | ${typeof g.value === "number" ? (g.name === "rows scored" ? pct(g.value, 1) : g.name === "safety fails" ? g.value : f2(g.value)) : g.value ?? "–"} | ${g.min != null ? (g.name === "rows scored" ? "≥ " + pct(g.min, 1) : "≥ " + g.min.toFixed(1)) : g.max != null ? "≤ " + g.max : "none"} | ${g.ok ? "ok" : "**FAIL**"} |`);
  const table = (title, m) => {
    L.push(``, `## ${title}`, ``, `| Group | n | Naturalness | Gentleness | Cultural | Safety fails |`, `|---|---|---|---|---|---|`);
    for (const k of Object.keys(m).sort()) { const g = m[k]; L.push(`| ${k} | ${g.n} | ${f2(g.naturalness.mean)} (${pct(g.naturalness.hi, g.naturalness.n)} ≥ 4) | ${f2(g.gentleness.mean)} | ${f2(g.cultural.mean)} | ${g.fails} |`); }
  };
  table("By language", S.byLang); table("By tone", S.byTone); table("By domain", S.byDomain);
  L.push(``, `## Reviewer agreement`, ``, S.agreement.pairs ? `${S.agreement.pairs} paired scores · mean |difference| ${f2(S.agreement.meanAbs)} · within 1 point ${pct(S.agreement.within1, 1)} (aim: ≥ 80 %; below that, calibrate reviewers on 10 shared readings and re-score).` : `No reading was scored by two reviewers. Give 10–15 % of the rows to a second reviewer to measure agreement.`);
  if (S.flagged.length) {
    L.push(``, `## Flagged readings (any score ≤ 2 or safety fail)`, ``, `| id | page | lang | tone | N | G | C | Safety | Reviewer | Comment |`, `|---|---|---|---|---|---|---|---|---|---|`);
    for (const s of S.flagged) L.push(`| ${s.id} | ${s.page} | ${s.lang} | ${s.tone} | ${s.naturalness ?? "–"} | ${s.gentleness ?? "–"} | ${s.cultural ?? "–"} | ${s.safety ?? "–"} | ${s.reviewer} | ${String(s.comment).replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 200)} |`);
  }
  if (S.invalid.length) L.push(``, `## Invalid cells`, ``, ...S.invalid.map(x => `- ${x}`));
  if (reports) {
    L.push(``, `## Visitor reports ("report a problem with this reading")`, ``, `${reports.length} report(s).`, ``);
    const tally = k => { const m = {}; for (const r of reports) m[r[k] || "-"] = (m[r[k] || "-"] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([x, n]) => `${x} ${n}`).join(" · "); };
    L.push(`- by category: ${tally("category")}`, `- by page: ${tally("page")}`, `- by reading language: ${tally("reading_lang")}`, `- by source: ${tally("source")}`);
    const notes = reports.filter(r => r.note);
    if (notes.length) L.push(``, `Notes:`, ...notes.slice(0, 50).map(r => `- [${r.category}] ${r.page} (${r.reading_lang}): ${r.note.replace(/\s+/g, " ").slice(0, 200)}`));
  }
  L.push(``, `Next steps: fix every flagged reading at its source (knowledge-base text in *-kb.js / i18n/zh-kb-*.js or the composer frames), add a regression case for each safety fail, re-export and re-review the affected cells.`);
  return L.join("\n") + "\n";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const take = k => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const reportsFile = take("--reports"), jsonOut = take("--json");
  const gateOn = args.includes("--gate");
  const files = args.filter(a => !a.startsWith("--"));
  if (!files.length && !reportsFile) { console.error("usage: node tools/fortune-review-ingest.mjs scored.csv [more.csv] [--reports reports.txt] [--json out.json] [--gate]"); process.exit(2); }
  const rows = [];
  for (const f of files) for (const r of parseCSV(readFileSync(f, "utf8"))) rows.push({ ...r, _file: f });
  const S = summarise(rows);
  const reports = reportsFile ? parseReports(readFileSync(reportsFile, "utf8")) : null;
  process.stdout.write(markdown(S, reports));
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ ...S, reports }, null, 2) + "\n");
  if (gateOn && files.length && !S.pass) process.exit(1);
}
