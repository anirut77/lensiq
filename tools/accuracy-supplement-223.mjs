#!/usr/bin/env node
// tools/accuracy-supplement-223.mjs — owner decision 223: every original customer-facing text that decision 223 removed or
// changed and that the base snapshot (docs/tech-sheets/ORIGINAL-FIGURES-223.json, tools/accuracy-snapshot-223.mjs) does
// not already hold verbatim, read from the base commit with git (so the texts are the originals, unchanged):
//   A  page elements (data-i18n) whose Thai changed and that carry a number or a banned term (prices excepted)
//   B  data-i18n keys that no longer exist on any page (removed blocks), all three languages
//   C  EN / ZH dictionary values that changed or went away and carry a figure, a banned term or a removed key
//   D  the in-page EN / ZH answers of help.html and about.html that changed (#h-accuracy and its en- / zh- copies …)
//   E  script string literals of the base that are gone and carry a figure, a banned term or the lie-research citation
//   F  lines of the buyer documents (one-pagers, decks, demo scripts, onboarding) that are gone and carry a number, a
//      banned term or a "no accuracy figure" row
//   G  the exam-hall camera-placement panel: the 16 recall values (4 detectors x 4 size bands) with their n and source,
//      rendered with the base panel wording in TH / EN / ZH, and the band counts
// Output docs/tech-sheets/SUPPLEMENT-223.json, read by tools/tech-sheets.mjs (sheets + admin data). The locked contract
// (tests/unit/accuracy-removal-223.test.js, re-lock 2) checks every entry is in the sheets and the admin data verbatim.
//   node tools/accuracy-supplement-223.mjs           write the file
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const L = require(join(repo, "tests", "unit", "accuracy-removal-223.lib.js"));
const SPEC = JSON.parse(readFileSync(join(repo, "tests", "unit", "accuracy-removal-223.spec.json"), "utf8"));
export const BASE = "ecb783b6";
const OUT = "docs/tech-sheets/SUPPLEMENT-223.json";
const git = f => { try { return execFileSync("git", ["show", `${BASE}:${f}`], { cwd: repo, encoding: "utf8", maxBuffer: 1e8 }); } catch { return null; } };
const ls = dir => execFileSync("git", ["ls-tree", "--name-only", BASE, dir], { cwd: repo, encoding: "utf8" }).split("\n").filter(Boolean);
const now = f => existsSync(join(repo, f)) ? readFileSync(join(repo, f), "utf8") : "";
const BANNED = SPEC.banned.filter(b => b.id !== "beta").map(b => new RegExp(b.re, b.flags || ""));
const PRICE = /VAT|บาท|฿|คืนเงิน|退款|增值税/;
const FIG = /\d\s?%|\bn\s?=\s?\d|\d\s?\/\s?\d|\d จาก \d|\d of \d/;
const banned = t => BANNED.some(re => re.test(t));
const NOFIG = /ไม่มีตัวเลข|no accuracy figure|没有准确率|无准确率/i;
const LIE = /Bond|DePaulo|24,483|\b54 ?%/;

function dictsAt(get, files) {
  const out = { en: {}, zh: {} };
  for (const f of files) {
    const win = { LQI18N_Q: [], LQI18N_RT: [] };
    try { vm.runInNewContext(get(f), { window: win, document: undefined, console }); } catch { continue; }
    for (const p of win.LQI18N_Q) for (const l of ["en", "zh"]) if (p && p[l]) for (const [k, v] of Object.entries(p[l])) if (!(k in out[l])) out[l][k] = String(v);
  }
  return out;
}

export function supplement() {
  const snap = JSON.parse(readFileSync(join(repo, "docs/tech-sheets/ORIGINAL-FIGURES-223.json"), "utf8"));
  const known = new Set(snap.entries.flatMap(e => [e.th, e.en, e.zh, e.text]).concat(snap.catData.flatMap(e => [e.th, e.en, e.zh])).filter(Boolean).map(L.squash));
  const isKnown = t => !t || known.has(L.squash(t));
  const entries = [], seen = new Set();
  const add = (part, e) => {
    const id = JSON.stringify([e.file, e.key || "", e.th || "", e.en || "", e.zh || "", e.text || ""]);
    if (seen.has(id) || ["th", "en", "zh", "text"].every(l => isKnown(e[l]))) return;
    seen.add(id);
    entries.push({ part, ...e });
  };
  const dfiles = ls("i18n/").filter(f => /^i18n\/(en|zh)-.*\.js$/.test(f) && !/-admin\.js$/.test(f));
  const B = dictsAt(git, dfiles), N = dictsAt(now, dfiles.filter(f => existsSync(join(repo, f))));
  const pages = L.customerFiles().filter(f => f.endsWith(".html") && f !== "terms.html");
  const nowKeys = new Set(pages.flatMap(f => L.keysOf(now(f))));
  const removed = new Set(SPEC.removedKeys), removedRe = SPEC.removedKeyPatterns.map(p => new RegExp(p.re));
  const isRemovedKey = k => removed.has(k) || removedRe.some(re => re.test(k));
  // A + B: page elements
  const baseKeyText = new Map();
  for (const f of pages) {
    const base = git(f);
    if (!base) continue;
    const cur = new Map(L.elementTexts(now(f)).map(e => [e.key, e.text]));
    for (const e of L.elementTexts(base)) {
      if (!baseKeyText.has(e.key)) baseKeyText.set(e.key, e.text);
      if (cur.get(e.key) === e.text) continue;
      const gone = !nowKeys.has(e.key);
      const num = /\d/.test(e.text) && !PRICE.test(e.text);
      if (!(gone || isRemovedKey(e.key) || num || banned(e.text) || LIE.test(e.text))) continue;
      add(gone ? "B" : "A", { file: f, key: e.key, th: e.text, en: B.en[e.key] || "", zh: B.zh[e.key] || "" });
    }
  }
  // C: dictionary values (EN / ZH) that changed or went away
  for (const l of ["en", "zh"]) for (const [k, v] of Object.entries(B[l])) {
    if (N[l][k] === v || /^ad[a-z]*\./.test(k)) continue;
    const gone = !(k in N[l]);
    if (!(isRemovedKey(k) || banned(v) || LIE.test(v) || FIG.test(v) || (gone && /\d/.test(v)))) continue;
    if (PRICE.test(v) && !gone) continue;
    if (entries.some(e => e.key === k)) continue; // already recorded with its page element (A / B), all three languages
    add("C", { file: `i18n/${l}-*`, key: k, th: baseKeyText.get(k) || "", en: B.en[k] || "", zh: B.zh[k] || "" });
  }
  // D: in-page EN / ZH answers (help.html, about.html): every changed <details id> block
  for (const f of ["help.html", "about.html"]) {
    const base = git(f), cur = now(f);
    for (const m of base.matchAll(/<details id="([^"]+)"[\s\S]*?<\/details>/g)) {
      const c = cur.match(new RegExp(`<details id="${m[1]}"[\\s\\S]*?</details>`));
      const t = L.htmlFlat(m[0]);
      if (c && L.htmlFlat(c[0]) === t) continue;
      add("D", { file: f, key: "#" + m[1], text: t });
    }
  }
  // E: script string literals of the base that are gone
  for (const f of L.customerFiles().filter(f => f.endsWith(".js") && !f.startsWith("i18n/"))) {
    const base = git(f);
    if (!base) continue;
    const cur = new Set(L.jsStrings(now(f)));
    for (const t of L.jsStrings(base)) {
      if (cur.has(t) || t.length < 7 || !/[ก-๛a-z]/i.test(t) || PRICE.test(t)) continue;
      if (banned(t) || LIE.test(t) || FIG.test(t)) add("E", { file: f, key: "", text: t });
    }
  }
  // F: buyer documents: lines that are gone
  for (const f of L.salesDocs()) {
    const base = git(f);
    if (!base) continue;
    const cur = new Set(now(f).split("\n").map(s => s.trim()));
    for (const line of base.split("\n").map(s => s.trim())) {
      if (!line || cur.has(line) || (PRICE.test(line) && !FIG.test(line))) continue;
      if (/\d/.test(line) || banned(line) || NOFIG.test(line) || LIE.test(line)) add("F", { file: f, key: "", text: line });
    }
  }
  // G: the exam-hall camera-placement panel at base: 16 recall values with n and source, in the base wording
  const ex = git("lensiq-exam.js");
  const recall = JSON.parse(ex.match(/const PLACE_RECALL = (\{[^}]+\});/)[1].replace(/([{,]\s*)([a-z][\w-]*):/g, '$1"$2":'));
  const bands = JSON.parse(ex.match(/const PLACE_BANDS = (\[[^\]]+\]);/)[1]), ns = JSON.parse(ex.match(/n: Object\.freeze\((\[[^\]]+\])\)/)[1]);
  const tpl = { th: (git("exam-hall.js").match(/"exam\.hall\.pcRate", "([^"]+)"/) || [])[1], en: B.en["exam.hall.pcRate"], zh: B.zh["exam.hall.pcRate"] };
  if (!tpl.th || !tpl.en || !tpl.zh) throw new Error("base exam.hall.pcRate wording not found");
  const src = (ex.match(/source: "([^"]+)"/) || [])[1] || "";
  const fill = (t, v) => t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
  for (const [det, r] of Object.entries(recall)) r.forEach((rec, i) => {
    const v = { range: i === bands.length - 1 ? bands[i] + "+" : bands[i] + "–" + bands[i + 1], r: rec.toFixed(1), n: ns[i] };
    add("G", { file: "exam-hall.js", key: `exam.hall.pcRate[${det}][${v.range}]`, th: fill(tpl.th, v), en: fill(tpl.en, v), zh: fill(tpl.zh, v) });
  });
  add("G", { file: "lensiq-exam.js", key: "HALL_PLACE", text: `HALL_PLACE (base ${BASE}): size bands ${bands.join(" / ")} px; n per band ` +
    `${ns.join(" / ")} people; ` + Object.entries(recall).map(([d, r]) => `${d} recall ${r.map(x => x.toFixed(1) + "%").join(" / ")}`).join("; ") +
    `; source: ${src}` });
  return { $comment: `Owner decision 223: original customer-facing texts (base ${BASE}) removed or changed by 223 and not already in ` +
    "ORIGINAL-FIGURES-223.json (parts A-G, see tools/accuracy-supplement-223.mjs). Generated; never edited by hand.", base: BASE, entries };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = JSON.stringify(supplement(), null, 1) + "\n";
  writeFileSync(join(repo, OUT), s);
  const e = JSON.parse(s).entries, by = {};
  for (const x of e) by[x.part] = (by[x.part] || 0) + 1;
  console.log(`${OUT}: ${e.length} entries ${JSON.stringify(by)}`);
}
