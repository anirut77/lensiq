#!/usr/bin/env node
// tools/omr-eval.mjs — measures the OMR reader (lensiq-omr.js read(), the exact call omr.js processGray() makes) on the
// locked synthetic set made by tools/omr-eval-gen.mjs, PER MARK (every bubble), per condition. Numbers only; no image is
// written. Source of every number: synthetic (programmatically drawn sheets), not field data.
//
//   node tools/omr-eval.mjs [--dir ~/LENSIQ-field/evals/omr] [--json <out.json>] [--md <out.md>]
//
// eval-guard first (owner rule 2026-11-13): manifest.json and every PNG it names must be under ~/LENSIQ-field/evals/omr/
// and their sha256 committed in evals-locks/omr.sha256 at HEAD, or nothing is measured (exit 2).
//
// Per bubble (question bubbles; the student number is scored separately): truth filled / empty from the manifest, read =
// r.marks[q] includes c. A sheet the page refuses (no markers, no orientation, wrong format code) is not measured per
// bubble: it is counted as "refused" (the page tells the teacher; nothing is guessed).
//   mark accuracy      correct bubbles / bubbles on read sheets
//   false-mark rate    empty bubbles read as filled / empty bubbles
//   missed-mark rate   filled bubbles read as empty / filled bubbles
//   target bubbles     the bubbles the condition is about (faint marks, off-centre marks, double marks, erased bubbles);
//                      for clean / skew / shadow / angle every filled bubble
//   flagged vs silent  a wrong bubble whose item carries flag "multi" or "unsure" is FLAGGED (the page counts it in
//                      "needs check", omr.js needs()); flag "blank" is listed in the review grid but not counted as a
//                      check; no flag = SILENT (the score uses the guess and nothing asks the teacher to look)
// 95 % intervals: Wilson score.
import { createRequire } from "node:module";
import { inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { assertLocked } from "./eval-guard.mjs";

const require = createRequire(import.meta.url);
const O = require("../lensiq-omr.js");

/** decode the 8-bit gray, filter-0 PNGs written by omr-eval-gen.mjs */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let off = 8, w = 0, h = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); if (data[8] !== 8 || data[9] !== 0) throw new Error("expects 8-bit gray"); }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { if (raw[y * (w + 1)] !== 0) throw new Error("expects filter 0"); raw.copy(g, y * w, y * (w + 1) + 1, (y + 1) * (w + 1)); }
  return { g, w, h };
}
export function wilson(k, n, z = 1.96) {
  if (!n) return [null, null];
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - m), Math.min(1, c + m)];
}
const pct = (k, n) => n ? (100 * k / n).toFixed(2) : "—";
const ci = (k, n) => { const [a, b] = wilson(k, n); return a == null ? "—" : `${(100 * a).toFixed(2)}–${(100 * b).toFixed(2)}`; };
const isTarget = (cond, tag) => tag !== "none" && (["clean", "skew", "shadow", "angle"].includes(cond) ? true :
  cond === "light" ? tag.startsWith("light") : cond === "outside" ? tag.startsWith("outside") : cond === "double" ? tag === "double" : tag.startsWith("erased"));

function newAcc() { return { sheets: 0, refused: 0, why: {}, bub: 0, ok: 0, empty: 0, fp: 0, filled: 0, fn: 0, errFlag: 0, errBlankList: 0, errSilent: 0,
  tBub: 0, tOk: 0, tErrFlag: 0, tErrSilent: 0, tFlagged: 0, items: 0, itemOk: 0, itemFlagged: 0, itemFlaggedOk: 0, itemSilentWrong: 0, unsureGraded: 0,
  multiTruth: 0, multiFlagged: 0, idDigits: 0, idOk: 0, idSilentWrong: 0, ms: [] }; }

export function measure(dir) {
  const man = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const files = ["manifest.json", ...man.sheets.map(s => s.file)];
  const guard = assertLocked("omr", files);
  const acc = {}, all = newAcc(), perSheet = [];
  for (const c of man.conditions) acc[c] = newAcc();
  for (const s of man.sheets) {
    const A = acc[s.cond], { g, w, h } = decodePng(readFileSync(join(dir, s.file)));
    const L = O.layout({ n: s.n, choices: s.choices, idDigits: s.idDigits, labels: s.labels });
    const t0 = process.hrtime.bigint(), r = O.read(g, w, h, L), ms = Number(process.hrtime.bigint() - t0) / 1e6;
    for (const X of [A, all]) { X.sheets++; X.ms.push(ms); }
    // omr.js processGray(): refused when read fails or the format code is read but does not match
    const refused = !r.ok ? r.why : r.code.ok && !r.code.match ? "format" : null;
    if (refused) { for (const X of [A, all]) { X.refused++; X.why[refused] = (X.why[refused] || 0) + 1; } perSheet.push({ file: s.file, refused }); continue; }
    let sheetErr = 0;
    for (let q = 0; q < s.n; q++) {
      const tr = s.truth[q], rd = r.marks[q], f = r.flags[q], flagged = f === "multi" || f === "unsure";
      const same = tr.length === rd.length && tr.every((c, i) => c === rd[i]);
      for (const X of [A, all]) {
        X.items++; if (same) X.itemOk++; if (flagged) { X.itemFlagged++; if (same) X.itemFlaggedOk++; } if (!same && !flagged) X.itemSilentWrong++;
        if (f === "unsure" && rd.length === 1) X.unsureGraded++;
        if (tr.length > 1) { X.multiTruth++; if (f === "multi") X.multiFlagged++; }
      }
      for (let c = 0; c < s.choices; c++) {
        const t = tr.includes(c), p = rd.includes(c), ok = t === p, tgt = isTarget(s.cond, s.tag[q][c]);
        for (const X of [A, all]) {
          X.bub++; if (ok) X.ok++;
          if (t) { X.filled++; if (!p) X.fn++; } else { X.empty++; if (p) X.fp++; }
          if (!ok) { if (flagged) X.errFlag++; else if (f === "blank") X.errBlankList++; else X.errSilent++; }
          if (tgt) { X.tBub++; if (ok) X.tOk++; if (flagged) X.tFlagged++; if (!ok) { if (flagged) X.tErrFlag++; else X.tErrSilent++; } }
        }
        if (!ok) sheetErr++;
      }
    }
    for (let d = 0; d < s.idDigits; d++) {
      const got = r.id[d], ok = got === s.sid[d];
      for (const X of [A, all]) { X.idDigits++; if (ok) X.idOk++; else if (got !== "?" && !r.idFlags[d]) X.idSilentWrong++; }
    }
    perSheet.push({ file: s.file, rot: r.rot, thr: r.thr, gap: r.quality.gap, unsure: r.quality.unsure, bubbleErrors: sheetErr, id: r.id, sid: s.sid, ms: +ms.toFixed(1) });
  }
  return { guard, man, acc, all, perSheet };
}

export function report(res) {
  const { acc, all, guard } = res, rows = [], med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  rows.push(`OMR baseline — synthetic locked set (${res.man.sheets.length} sheets), lensiq-omr.js read() as omr.js calls it`);
  rows.push(`eval-guard: phase ${guard.phase}, ${guard.files.length} files match ${guard.lockFile} (commit ${guard.lockCommit})`);
  rows.push("");
  rows.push("| condition | sheets read | bubbles | mark accuracy % (95 % CI) | false-mark % (CI) | missed-mark % (CI) | target bubbles | " +
    "target accuracy % (CI) | wrong bubbles: flagged / listed blank / silent | target wrong: flagged / silent | items flagged % | item accuracy % | " +
    "silent wrong items | ID digits ok | read ms (median) |");
  rows.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const [name, X] of [...Object.entries(acc), ["ALL", all]]) {
    rows.push(`| ${name} | ${X.sheets - X.refused}/${X.sheets}${X.refused ? " (refused: " + Object.entries(X.why).map(([k, v]) => k + " " + v).join(", ") + ")" : ""} | ${X.bub} | ` +
      `${pct(X.ok, X.bub)} (${ci(X.ok, X.bub)}) | ${pct(X.fp, X.empty)} (${ci(X.fp, X.empty)}) | ${pct(X.fn, X.filled)} (${ci(X.fn, X.filled)}) | ${X.tBub} | ` +
      `${pct(X.tOk, X.tBub)} (${ci(X.tOk, X.tBub)}) | ${X.errFlag} / ${X.errBlankList} / ${X.errSilent} | ${X.tErrFlag} / ${X.tErrSilent} | ` +
      `${pct(X.itemFlagged, X.items)} | ${pct(X.itemOk, X.items)} (${ci(X.itemOk, X.items)}) | ${X.itemSilentWrong} | ${X.idOk}/${X.idDigits} | ${med(X.ms).toFixed(0)} |`);
  }
  rows.push("");
  rows.push(`double-mark items flagged "multi": ${all.multiFlagged}/${all.multiTruth} · flagged items that were read right anyway (teacher workload): ` +
    `${all.itemFlaggedOk}/${all.itemFlagged} · "unsure" items still given a provisional single answer in the score: ${all.unsureGraded} · ` +
    `wrong ID digits with no flag: ${all.idSilentWrong}`);
  return rows.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const dir = resolve((arg("--dir") || join(homedir(), "LENSIQ-field", "evals", "omr")).replace(/^~(?=\/)/, homedir()));
  let res;
  try { res = measure(dir); } catch (e) { console.error(String(/** @type {any} */ (e).message || e)); process.exit(2); }
  const text = report(res);
  console.log(text);
  if (arg("--md")) writeFileSync(resolve(arg("--md")), text + "\n");
  if (arg("--json")) {
    const out = { at: new Date().toISOString(), lock: res.guard.lockCommit, acc: res.acc, all: res.all, perSheet: res.perSheet };
    writeFileSync(resolve(arg("--json")), JSON.stringify(out, null, 1) + "\n");
  }
}
