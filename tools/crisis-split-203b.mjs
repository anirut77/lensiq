#!/usr/bin/env node
// tools/crisis-split-203b.mjs — owner decision 203 ข (2026-11-20, built 2026-11-21): the crisis-rules-1323 e2e files that open every
// fortune page in TH / EN / ZH (a: N1-N4 171 page loads, c: K1 57 + P1 9, e: E1-E4 171 x 6 scroll positions) are split by LANGUAGE
// into one file per language, with an EQUAL relock: same checks, pages, widths, assertions, timeouts and thresholds.
// Each split file is the original file plus a header that ends with MARKER and exactly these edits (EDITS), nothing else:
//   1. one line after the import line: const SLICE = LANGS.filter(l => l === "<lang>"); const PART = " [203 ข: <lang>]";
//   2. `for (const lang of LANGS)` -> `for (const lang of SLICE)` (every language loop; each language keeps its own tab, as before);
//   3. every check name gets ` + PART` (", async () =>" -> " + PART, async () =>");
//   4. file a only: `for (const on of [false, true])` -> `for (const on of SLICE.includes("th") ? [false, true] : [])`
//      (N5 / N6 are TH only in the original, so they run in the TH file only).
// unsplit(source) undoes 1-4 and drops the header; the result must be byte-identical to the original (sha256 in the manifest).
// matrix(source, kit) reads the code (no run) and lists every check ID x page x language x width it covers.
//   node tools/crisis-split-203b.mjs --baseline <kit> <original e2e files...>   prints the baseline manifest JSON (stdout)
//   node tools/crisis-split-203b.mjs --matrix <kit> <e2e files...>              prints the cells of the given files (stdout)
//   node tools/crisis-split-203b.mjs --make <lang> <original e2e file>          prints the split file for that language (stdout)
// Guard: tests/unit/crisis-split-203b.test.js (manifest tests/unit/crisis-split-203b-manifest.json).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

export const MARKER = "// ---- 203 ข: the original file follows; only the four edits listed above are applied ----";
export const LOOP_ALL = "for (const lang of LANGS)";
export const LOOP_SLICE = "for (const lang of SLICE)";
export const ON_ALL = "for (const on of [false, true])";
export const ON_SLICE = 'for (const on of SLICE.includes("th") ? [false, true] : [])';
export const NAME_ALL = ", async () =>";
export const NAME_SLICE = " + PART, async () =>";
export const IMPORT_END = 'from "./crisis-rules-kit.mjs";\n';
/** @param {string} lang */
export const sliceLine = lang => `const SLICE = LANGS.filter(l => l === ${JSON.stringify(lang)}); const PART = " [203 ข: ${lang}]";\n`;
const SLICE_RE = /^const SLICE = LANGS\.filter\(l => l === "(th|en|zh)"\); const PART = " \[203 ข: \1\]";\n/m;

/** @param {string|Buffer} s */
export const sha256 = s => createHash("sha256").update(s).digest("hex");

/** @param {string} s @param {string} a @param {string} b */
const swap = (s, a, b) => s.split(a).join(b);

/** the lines of the check calls (await check(...)) @param {string} src */
const checkLines = src => src.split("\n").filter(l => /\bawait check\(/.test(l));

/** @param {string} lang @param {string} original @param {string} file original file name @param {string} header */
export function make(lang, original, file, header) {
  if (!original.includes(IMPORT_END)) throw new Error(`${file}: no import line from crisis-rules-kit.mjs`);
  if (original.includes("SLICE") || original.includes("PART")) throw new Error(`${file}: already uses SLICE / PART`);
  let body = original.replace(IMPORT_END, IMPORT_END + sliceLine(lang));
  body = swap(body, LOOP_ALL, LOOP_SLICE);
  body = swap(body, ON_ALL, ON_SLICE);
  body = body.split("\n").map(l => (/\bawait check\(/.test(l) ? l.replace(NAME_ALL, NAME_SLICE) : l)).join("\n");
  for (const l of checkLines(body)) if (!l.includes(NAME_SLICE)) throw new Error(`${file}: check line without the slice tag: ${l.trim().slice(0, 80)}`);
  return header + MARKER + "\n" + body;
}

/** undo make(): drop the header and the four edits @param {string} src */
export function unsplit(src) {
  const i = src.indexOf(MARKER + "\n");
  if (i < 0) throw new Error("no 203 ข marker line");
  let body = src.slice(i + MARKER.length + 1);
  const m = body.match(SLICE_RE);
  if (!m) throw new Error("no SLICE line");
  body = body.replace(SLICE_RE, "");
  body = swap(body, LOOP_SLICE, LOOP_ALL);
  body = swap(body, ON_SLICE, ON_ALL);
  body = swap(body, NAME_SLICE, NAME_ALL);
  return body;
}

/** the slice language of a split file, or null for an original @param {string} src */
export const sliceOf = src => { const m = src.match(SLICE_RE); return m ? m[1] : null; };

/** a string array literal from the kit: export const NAME = [ ... ]; @param {string} kit @param {string} name @returns {string[]} */
function kitList(kit, name) {
  const m = kit.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`));
  if (!m) throw new Error(`kit has no ${name}`);
  return [...m[1].matchAll(/"([^"]+)"|(\d+)/g)].map(x => x[1] || x[2]);
}

/** the source of each check(...) call with its name and the enclosing `on` loop (if any)
 * @param {string} src @returns {{name: string, body: string, onLoop: string | null}[]} */
function checks(src) {
  /** @type {{name: string, body: string, onLoop: string | null}[]} */ const out = [];
  const re = /\bawait check\(/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 0, j = m.index + m[0].length - 1, q = "", esc = false;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (q) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === q) q = ""; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { q = ch; continue; }
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") { depth--; if (!depth) break; }
    }
    const body = src.slice(m.index, j + 1);
    const nm = body.match(/^await check\((["`])((?:\\.|(?!\1).)*)\1/);
    if (!nm) throw new Error("check without a literal name: " + body.slice(0, 80));
    const before = src.slice(Math.max(0, m.index - 200), m.index);
    const on = [ON_ALL, ON_SLICE].filter(x => before.includes(x)).pop() || null;
    out.push({ name: nm[2], body, onLoop: on });
  }
  return out;
}

/** every cell (check ID | page | lang | width) a file covers, read from the code
 * @param {string} src @param {string} kit @returns {{checks: Record<string, string[]>, ids: string[]}} */
export function matrix(src, kit) {
  const FORTUNE = kitList(kit, "FORTUNE"), LANGS = kitList(kit, "LANGS"), WIDTHS = kitList(kit, "WIDTHS");
  const slice = sliceOf(src);
  /** @type {Record<string, string[]>} */ const out = {};
  for (const c of checks(src)) {
    const b = c.body;
    /** @type {string[]} */ let langs;
    if (b.includes(LOOP_ALL)) langs = LANGS;
    else if (b.includes(LOOP_SLICE)) { if (!slice) throw new Error("SLICE loop without a SLICE line"); langs = LANGS.filter(l => l === slice); }
    else {
      const fixed = [...b.matchAll(/load\(page, base, p, "(th|en|zh)"\)/g)].map(x => x[1]);
      if (!fixed.length) throw new Error(`${c.name.slice(0, 40)}: no language loop or fixed language`);
      langs = [...new Set(fixed)];
    }
    /** @type {string[]} */ let widths;
    if (b.includes("for (const w of WIDTHS)")) widths = WIDTHS;
    else {
      const fixed = [...b.matchAll(/phone\(page, (\d+)\)/g)].map(x => x[1]);
      if (!fixed.length) throw new Error(`${c.name.slice(0, 40)}: no width`);
      widths = [...new Set(fixed)];
    }
    /** @type {string[]} */ let pages;
    if (b.includes("for (const p of FORTUNE)")) pages = FORTUNE;
    else {
      const lit = b.match(/for \(const p of \[([^\]]*)\]\)/);
      if (lit) pages = [...lit[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
      else {
        const fixed = [...b.matchAll(/load\(page, base, "([a-z-]+)", lang\)/g)].map(x => x[1]);
        if (!fixed.length) throw new Error(`${c.name.slice(0, 40)}: no pages`);
        pages = [...new Set(fixed)];
      }
    }
    /** @type {string[]} */ let ids;
    const id = c.name.startsWith("N${on ? 6 : 5}:") ? "N${on ? 6 : 5}" : c.name.split(":")[0];
    if (id === "N${on ? 6 : 5}") {
      if (!c.onLoop) throw new Error("N5 / N6 without the on loop");
      const runs = c.onLoop === ON_ALL || slice === "th" ? [false, true] : [];
      ids = runs.map(on => (on ? "N6" : "N5"));
    } else if (id.includes("${")) throw new Error("unknown template check name: " + id);
    else ids = [id];
    for (const i of ids) {
      const cells = out[i] || (out[i] = []);
      for (const p of pages) for (const l of langs) for (const w of widths) cells.push(`${p}|${l}|${w}`);
    }
  }
  return { checks: out, ids: Object.keys(out) };
}

/** @param {string} kitPath @param {string[]} files */
function baseline(kitPath, files) {
  const kit = readFileSync(kitPath, "utf8");
  /** @type {Record<string, unknown>} */ const originals = {};
  let total = 0;
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const m = matrix(src, kit);
    const counts = Object.fromEntries(m.ids.map(i => [i, m.checks[i].length]));
    const n = Object.values(counts).reduce((a, b) => a + b, 0);
    total += n;
    originals[basename(f)] = { sha256: sha256(src), checkIds: m.ids, checkCount: m.ids.length, checkCalls: checkLines(src).length, cellsPerCheck: counts,
      cellCount: n, cells: m.checks };
  }
  return { kit: { file: basename(kitPath), sha256: sha256(kit) }, cellFormat: "page|lang|width", originals, totalCells: total };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === "--baseline") process.stdout.write(JSON.stringify(baseline(rest[0], rest.slice(1)), null, 1) + "\n");
  else if (mode === "--matrix") {
    const kit = readFileSync(rest[0], "utf8");
    process.stdout.write(JSON.stringify(Object.fromEntries(rest.slice(1).map(f => [basename(f), matrix(readFileSync(f, "utf8"), kit).checks])), null, 1) + "\n");
  } else if (mode === "--make") {
    const [lang, file] = rest, name = basename(file);
    const out = name.replace(/\.e2e\.mjs$/, `-${lang}.e2e.mjs`);
    const header = [
      `// tests/e2e/${out} — owner decision 203 ข (2026-11-21): the ${lang.toUpperCase()} slice of ${name}, split by language with an EQUAL`,
      `// relock (same checks, pages, widths, assertions, timeouts and thresholds; the shared kit is unchanged). The three language files`,
      `// together cover exactly the cells of the original (check x page x language x width): tests/unit/crisis-split-203b.test.js proves it`,
      `// against the baseline manifest tests/unit/crisis-split-203b-manifest.json, and that undoing the edits gives the original bytes.`,
      `// Edits (tools/crisis-split-203b.mjs): 1 the SLICE / PART line after the import; 2 \`${LOOP_ALL}\` -> \`${LOOP_SLICE}\`;`,
      `// 3 every check name + PART; 4 (file a) the N5 / N6 loop runs only in the TH file, as the original runs them in TH only.`,
      "",
    ].join("\n");
    process.stdout.write(make(lang, readFileSync(file, "utf8"), name, header));
  } else { console.error("usage: --baseline <kit> <files...> | --matrix <kit> <files...> | --make <lang> <file>"); process.exit(2); }
}
