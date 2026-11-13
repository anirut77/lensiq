#!/usr/bin/env node
// tools/plate-field-eval.mjs — LENSIQ Gate on REAL photos: the owner's own phone photos of Thai plates (field set) or any
// other labelled folder (e.g. the Wikimedia Commons benchmark). Runs every photo through the shipped auto-read path in
// headless Chrome (GateKit.autoReadFrame: finder -> LPD-YuNet -> Thai OCR -> plate-likeness guard) and reports per
// category: detection, exact read, false auto-reads (before / after the guard) and taps needed, with the synthetic demo-set
// numbers as a SEPARATE column. Nothing leaves the machine; nothing is written into the repo.
//
//   node tools/plate-field-eval.mjs [--dir DIR] [--labels CSV] [--source TEXT] [--split dev|heldout|all]
//        [--synthetic N|0] [--seed N] [--max-side PX] [--json] [--out FILE]
//
//   --dir DIR      photo folder (default ~/LENSIQ-field/plates). Keep it OUTSIDE the repo; inside the repo only under
//                  field-data/ (git-ignored). Photos of plates are personal data (PDPA): never commit them.
//   --labels CSV   labelling sheet (default DIR/plates-photo-labels.csv; template: docs/field-pilot/plates-photo-labels.csv)
//   --source TEXT  source label printed on every number (default "field (owner photos)")
//   --split S      only rows whose split column is S (default all)
//   --synthetic N  synthetic demo-set column: N scenes per category with OCR (default 20 = the full set; 0 = skip)
//   --seed N       demo-set seed for the synthetic column (default the development seed)
//   --max-side PX  scale photos so the long side is at most PX (default 1920 = a 1080p camera frame)
//   --json         print the full result as JSON;  --out FILE  also write the JSON to FILE (outside the repo)
//   --det-model F  ALSO register a trained YOLOX plate detector (ONNX, raw head, one class; tools/plate_train.py) as an
//                  extra proposal source (LQPlate.registerDetector(fn, {proposals: true}), docs/PLATE-DATASETS.md §4); the
//                  file stays outside the repo (or under vendor/models/ once shipped). tools/plate-det-compare.mjs runs both.
//   Every result row also carries ms = time of the shipped auto-read path for that photo (this machine).
//
// Labelling sheet columns: file, category, plate, province, x0, y0, x1, y1, split, sure, notes
//   category = white | yellow | green | red | blue | moto | night | none | other (graphic = white with a picture)
//   plate    = the text as written on line 1 (motorcycle: line 1 + line 3), e.g. "1กข 2345"; empty for "none";
//              one row per plate (a photo with two plates has two rows)
//   x0..y1   optional plate box in pixels of the photo as a viewer shows it; without a box, detection is judged by the
//            read (the box is "on the plate" when the read is within one character of the label)
//   sure     n = the person labelling could not read the plate for certain (left out of the exact-read count)
//   ignore region: a row with category "ignore", an empty plate and a box (required) marks a region of that photo — a tiny,
//            unreadable plate — where a detection is neither rewarded nor counted as false. The photo keeps its own
//            category from its other row(s) (e.g. "none"). See "Ignore regions" below and docs/GATE.md.
// Metrics (docs/GATE.md): det = the box the auto-read uses is on a labelled plate (IoU >= 0.5); exact = auto-read text ==
// label (standard plates only); false auto-read = an auto-read proposal on something that is not a plate (IoU < 0.3 with
// every labelled plate / every proposal on a "none" photo); wrong auto-read = on the plate, wrong text; taps needed = a
// plate photo without an exact auto-read (the guard taps or types); tap read = the read on the labelled box.
// Ignore regions (labels v3, 2026-11-12): an auto-read proposal whose box falls in an ignore region (IoU >= 0.3 with it, or
// at least half of the proposal's area inside it) is "ignored" in that mode: not a false auto-read, not a wrong read, never
// an exact read, never a detection. A plate-less photo whose proposal is ignored leaves that mode's plate-less denominator
// (it is neither a clean photo nor a false auto-read); the report prints "+k ignored". Ignore regions never turn a miss
// into a hit, so they cannot raise detection or exact-read numbers.
// Photos Chrome cannot decode (iPhone HEIC / HEIF, RAW, TIFF, a broken file) never stop the run: each is listed as "could not
// decode" with the reason (HEIC: convert to JPEG first) and left out of every number. The labelling sheet holds plate numbers
// (personal data): inside the repo it is refused unless under field-data/ (or it is the unchanged template).
// Exit codes: 0 ok · 2 usage / browser error.
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, dirname, extname, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const P = createRequire(import.meta.url)(join(repo, "lensiq-plate.js"));

export const CATS = ["white", "yellow", "green", "red", "blue", "moto", "night", "graphic", "other", "none"];
export const SOURCE_FIELD = "field (owner photos)";
// photo types Chrome can decode. iPhone HEIC / HEIF is NOT one of them: such files are listed as "convert to JPEG first"
// (iPhone: Settings > Camera > Formats > Most Compatible, or export / share as JPEG) and never stop the run.
const IMG = new Set([".jpg", ".jpeg", ".png", ".webp"]);
export const CONVERT = new Set([".heic", ".heif", ".avif", ".dng", ".tif", ".tiff"]);
export const CONVERT_HINT = "convert to JPEG first (iPhone: Settings > Camera > Formats > Most Compatible, or export as JPEG)";

export function parseArgs(argv, env = process.env) {
  const a = { dir: join(env.HOME || homedir(), "LENSIQ-field", "plates"), labels: null, source: SOURCE_FIELD, split: "all", synthetic: 20, seed: null, maxSide: 1920,
    json: false, out: null, detModel: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => { if (argv[i + 1] == null || argv[i + 1].startsWith("--")) throw new Error(`${k} needs a value`); return argv[++i]; };
    if (k === "--dir") a.dir = v();
    else if (k === "--labels") a.labels = v();
    else if (k === "--source") a.source = v();
    else if (k === "--split") a.split = v();
    else if (k === "--synthetic") a.synthetic = parseInt(v(), 10);
    else if (k === "--seed") a.seed = parseInt(v(), 10);
    else if (k === "--max-side") a.maxSide = parseInt(v(), 10);
    else if (k === "--json") a.json = true;
    else if (k === "--out") a.out = v();
    else if (k === "--det-model") a.detModel = v();
    else throw new Error(`unknown argument ${k}`);
  }
  if (!["all", "dev", "heldout"].includes(a.split)) throw new Error("--split must be all, dev or heldout");
  if (!(a.synthetic >= 0)) throw new Error("--synthetic must be 0 or more");
  if (a.seed != null && !(a.seed > 0)) throw new Error("--seed must be a positive integer");
  if (!(a.maxSide >= 320)) throw new Error("--max-side must be at least 320");
  a.dir = resolve(a.dir);
  a.labels = resolve(a.labels || join(a.dir, "plates-photo-labels.csv"));
  return a;
}

/** a trained detector to compare: an .onnx file outside the repo, or under vendor/models/ once it is shipped */
export function checkModel(file, root = repo) {
  if (extname(file).toLowerCase() !== ".onnx") throw new Error(`--det-model must be an .onnx file: ${file}`);
  const rel = relative(root, resolve(file));
  const inside = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (inside && !(rel.startsWith("vendor/models/") || rel.startsWith("vendor\\models\\")))
    throw new Error(`--det-model inside the repo must be under vendor/models/ (${rel})`);
  return true;
}

/** photos must not live in the repo, except under the git-ignored field-data/ folder */
export function checkDir(dir, root = repo) {
  const rel = relative(root, resolve(dir));
  const inside = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (inside && !(rel === "field-data" || rel.startsWith("field-data/") || rel.startsWith("field-data\\")))
    throw new Error(`the photo folder is inside the repo (${rel || "."}): keep owner photos outside it, or under field-data/ (git-ignored)`);
  return true;
}

/**
 * the labelling sheet holds plate numbers (personal data): inside the repo it may only live under field-data/, except the
 * unchanged template (only EXAMPLE rows) at docs/field-pilot/plates-photo-labels.csv
 */
export function checkLabels(file, text, root = repo) {
  const rel = relative(root, resolve(file));
  const inside = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (!inside || rel === "field-data" || rel.startsWith("field-data/") || rel.startsWith("field-data\\")) return true;
  if (text != null && parseLabels(text).photos.size === 0) return true; // the template / a sheet with no real row
  throw new Error(`the labelling sheet is inside the repo (${rel}) and has real rows (plate numbers are personal data): copy the template `
    + "next to the photos (outside the repo, or under field-data/) and fill it in there");
}

/** first bytes of a file -> "jpeg" | "png" | "webp" | "gif" | "heic" (HEIC / HEIF / AVIF container) | null (unknown) */
export function sniffType(buf) {
  const b = Buffer.from(buf || []);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) return "png";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.toString("latin1", 0, 6))) return "gif";
  if (b.length >= 12 && b.toString("latin1", 4, 8) === "ftyp") return "heic";
  return null;
}

/** RFC 4180 CSV (quotes, doubled quotes, CRLF) -> rows of cells */
export function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ""));
}

/**
 * labelling sheet -> {photos: Map(file -> {file, cat, split, plates: [...]}), errors: [...]}. Lines starting with "#" and
 * the template's example rows (file starting with "EXAMPLE") are skipped.
 */
export function parseLabels(text) {
  const rows = parseCsv(text), errors = [], photos = new Map(), ignores = [];
  if (!rows.length) return { photos, errors: ["the labelling sheet is empty"] };
  const head = rows[0].map(h => h.trim().toLowerCase());
  const miss = ["file", "category", "plate"].filter(h => !head.includes(h));
  if (miss.length) return { photos, errors: [`missing column(s): ${miss.join(", ")} — use docs/field-pilot/plates-photo-labels.csv`] };
  const col = k => head.indexOf(k);
  rows.slice(1).forEach((r, i) => {
    const get = k => (col(k) >= 0 ? String(r[col(k)] == null ? "" : r[col(k)]).trim() : "");
    const line = i + 2, file = get("file");
    if (!file || file.startsWith("#") || /^EXAMPLE/i.test(file)) return;
    const cat = get("category").toLowerCase();
    if (cat === "ignore") { // ignore region: box required, no plate text; attached to the photo after every row is read
      const v = ["x0", "y0", "x1", "y1"].map(k => get(k)), b = v.map(Number);
      if (get("plate")) { errors.push(`line ${line}: an ignore region has no plate text`); return; }
      if (v.some(x => x === "") || b.some(x => !Number.isFinite(x)) || !(b[2] > b[0] && b[3] > b[1])) {
        errors.push(`line ${line}: an ignore region needs a box x0,y0,x1,y1 with x1 > x0 and y1 > y0`); return;
      }
      ignores.push({ line, file, box: b }); return;
    }
    if (!CATS.includes(cat)) { errors.push(`line ${line}: category "${cat}" (use ${CATS.join(" / ")})`); return; }
    const plate = get("plate"), split = get("split").toLowerCase() || "all", sureCell = get("sure").toLowerCase();
    const nums = ["x0", "y0", "x1", "y1"].map(k => get(k));
    let box = null;
    if (nums.some(x => x !== "")) {
      const v = nums.map(Number);
      if (v.some(x => !Number.isFinite(x)) || !(v[2] > v[0] && v[3] > v[1])) { errors.push(`line ${line}: box x0,y0,x1,y1 must be numbers with x1 > x0 and y1 > y0`); return; }
      box = v;
    }
    const ph = photos.get(file) || { file, cat, split, plates: [] };
    if (!photos.has(file)) photos.set(file, ph);
    else if (ph.cat === "none" || cat === "none") { errors.push(`line ${line}: "${file}" is labelled "none" and also has a plate`); return; }
    if (cat === "none") { if (plate) errors.push(`line ${line}: category none but a plate is given`); return; }
    const moto = cat === "moto", pr = plate && plate !== "?" ? P.parse(plate, { moto }) : null;
    ph.plates.push({ key: pr && pr.ok ? pr.key : P.normalize(plate === "?" ? "" : plate), text: plate, province: get("province"), box, cat, moto,
      standard: !!(pr && pr.ok && !pr.legacy), sure: sureCell !== "n" && sureCell !== "no" && plate !== "?" && plate !== "" });
  });
  for (const g of ignores) {
    const ph = photos.get(g.file);
    if (!ph) { errors.push(`line ${g.line}: ignore region for "${g.file}", which has no plate / none row`); continue; }
    (ph.ignore || (ph.ignore = [])).push(g.box);
  }
  return { photos, errors };
}

/** photos in the folder vs the sheet -> {items, missing (labelled, no file), unlabelled (file, no label)} */
export function matchFolder(files, photos, split = "all") {
  const have = new Set(files), items = [], missing = [];
  for (const ph of photos.values()) {
    if (split !== "all" && ph.split !== split) continue;
    if (have.has(ph.file)) items.push(ph); else missing.push(ph.file);
  }
  const unlabelled = files.filter(f => !photos.has(f));
  return { items, missing, unlabelled };
}

export function listPhotos(dir) {
  return readdirSync(dir).filter(f => IMG.has(extname(f).toLowerCase()) && statSync(join(dir, f)).isFile()).sort();
}
/** photos in a format Chrome cannot decode (HEIC from an iPhone, RAW, TIFF): reported with CONVERT_HINT, never read */
export function listConvert(dir) {
  return readdirSync(dir).filter(f => CONVERT.has(extname(f).toLowerCase()) && statSync(join(dir, f)).isFile()).sort();
}

const toNorm = (b, W, H) => ({ x: b[0] / W, y: b[1] / H, w: (b[2] - b[0]) / W, h: (b[3] - b[1]) / H });
/** a proposal box (normalised) falls in an ignore region r: IoU >= 0.3, or at least half of the box's area inside r */
export function inRegion(box, r) {
  if (!box || !r || !(box.w > 0 && box.h > 0)) return false;
  const ix = Math.max(0, Math.min(box.x + box.w, r.x + r.w) - Math.max(box.x, r.x)), iy = Math.max(0, Math.min(box.y + box.h, r.y + r.h) - Math.max(box.y, r.y));
  return P.iou(box, r) >= 0.3 || (ix * iy) / (box.w * box.h) >= 0.5;
}

export const MODES = ["before", "guard1", "after"];
export const MODE_LABEL = { before: "round 15: top box, no guard", guard1: "guard, top box only", after: "guard + first plate-like box (shipped)" };

/**
 * one photo's labels + its browser result -> flags. res = {size: [W, H] (of the labelled photo), auto: autoReadFrame()
 * result, taps: [{key}] = reads of the labelled boxes (same order as ph.plates; null when no box)}.
 * Three ways to decide what is auto-read, all from the same reads: before = the top box's read (round 15, no guard);
 * guard1 = the top box's read only when it passes the guard; after = the first candidate whose read passes (shipped).
 */
export function scorePhoto(ph, res) {
  const [W, H] = res.size, A = res.auto || {};
  const truths = ph.plates.map(p => (p.box ? toNorm(p.box, W, H) : null));
  const ignores = (ph.ignore || []).map(b => toNorm(b, W, H)), ignored = box => !!box && ignores.some(r => inRegion(box, r));
  const near = (k, p) => !!k && !!p.key && P.plateDist(k, p.key) <= 1;
  const target = ph.plates.find(p => p.standard && p.sure);
  const exactKey = k => !!k && ph.plates.some(p => p.standard && p.sure && P.normalize(k) === P.normalize(p.key));
  // which labelled plate a box is on: by IoU when boxes are labelled, else by the read text (within one character)
  const onPlate = (box, key) => {
    if (!box) return { on: -1, by: "none", overlaps: false };
    let on = -1, by = "none";
    truths.forEach((t, i) => { if (t && on < 0 && P.iou(box, t) >= 0.5) { on = i; by = "box"; } });
    if (on < 0 && key) ph.plates.forEach((p, i) => { if (on < 0 && !p.box && near(key, p)) { on = i; by = "read"; } });
    return { on, by, overlaps: truths.some(t => t && P.iou(box, t) >= 0.3) };
  };
  const top = (A.tried || []).find(t => t.i === 0) || null, trig = !!A.trigger;
  const pick = { before: top && top.read.key ? top : null, guard1: top && top.read.key && top.guard && top.guard.ok ? top : null, after: A.picked || null };
  const topBox = top ? top.read.box : (A.cands || [])[0] || null, d = onPlate(topBox, top && top.read.key);
  if (d.on >= 0 && d.by === "read" && ignored(topBox)) { d.on = -1; d.by = "none"; } // never a hit inside an ignore region
  const f = { file: ph.file, cat: ph.cat, plates: ph.plates.length, hasBox: truths.some(Boolean), scorable: !!target,
    det: ph.cat !== "none" ? d.on >= 0 : null, detBy: d.by, trigger: trig, read: top ? top.read.key : "", guardReasons: top && top.guard ? top.guard.reasons : [],
    picked: A.picked ? A.picked.read.key : "", pickedIdx: A.picked ? A.picked.i : -1, tapRead: null, tapExact: null };
  for (const m of MODES) {
    const x = trig ? pick[m] : null, key = x ? x.read.key : "";
    const o = x ? onPlate(x.read.box, key) : null;
    // off the plate: every proposal on a "none" photo; else not on a labelled plate and not overlapping one (without
    // labelled boxes: a read more than one character away from every label — pessimistic, it may be a misread)
    // a proposal in an ignore region (and not on a labelled plate) is neither rewarded nor counted as false
    const ign = !!x && (ph.cat === "none" || o.on < 0) && ignored(x.read.box);
    const off = !!x && !ign && (ph.cat === "none" || (o.on < 0 && !o.overlaps && (truths.some(Boolean) || ph.plates.every(p => !near(key, p)))));
    // wrong = on the plate with the wrong text; only judged against a sure, standard label
    f[m] = { proposal: !!x, ignored: ign, false: off, wrong: !!target && !!x && !ign && !off && !exactKey(key), exact: !!target && !!x && !ign && exactKey(key) };
  }
  f.detUsed = ph.cat !== "none" ? !!(f.after.proposal && !f.after.false && !f.after.ignored) : null;
  f.tapNeeded = ph.cat !== "none" ? !f.after.exact : null;
  if (f.tapNeeded && target && res.taps) {
    const t = res.taps[ph.plates.indexOf(target)];
    if (t) { f.tapRead = t.key || ""; f.tapExact = P.normalize(t.key || "") === P.normalize(target.key); }
  }
  return f;
}

const W95 = (x, n) => P.wilson(x, n);
/** flags -> per category + "all plates" + "none" summary */
export function summarize(flags) {
  const by = {};
  const add = (k, f) => (by[k] || (by[k] = [])).push(f);
  for (const f of flags) { add(f.cat, f); if (f.cat !== "none") add("all plates", f); }
  const out = {};
  for (const [k, F] of Object.entries(by)) {
    const pl = F.filter(f => f.cat !== "none"), sc = F.filter(f => f.scorable), tn = pl.filter(f => f.tapNeeded), tr = tn.filter(f => f.tapExact != null);
    const s = { photos: F.length, plates: F.reduce((a, f) => a + f.plates, 0), triggers: F.filter(f => f.trigger).length,
      det: pl.length ? W95(pl.filter(f => f.det).length, pl.length) : null, detByRead: pl.filter(f => f.detBy === "read").length,
      tapsNeeded: pl.length ? W95(tn.length, pl.length) : null, tapFixed: tr.length ? `${tr.filter(f => f.tapExact).length}/${tr.length}` : "—" };
    for (const m of MODES) s[m] = { exact: sc.length ? W95(sc.filter(f => f[m].exact).length, sc.length) : null, false: F.filter(f => f[m].false).length,
      wrong: F.filter(f => f[m].wrong).length, proposals: F.filter(f => f[m].proposal).length, ignored: F.filter(f => f[m].ignored).length };
    out[k] = s;
  }
  return out;
}

const pct = w => (w && w.p != null ? `${w.x}/${w.n} ${(w.p * 100).toFixed(0)}%` : "—");
function table(head, rows) {
  const all = [head, ...rows], w = head.map((_, i) => Math.max(...all.map(r => [...String(r[i])].length)));
  const line = r => r.map((c, i) => String(c) + " ".repeat(w[i] - [...String(c)].length)).join("  ").trimEnd();
  return [line(head), w.map(x => "-".repeat(x)).join("  "), ...rows.map(line)].join("\n");
}
/** synthetic = LQPlate.detEval summary of the demo set (with the guard), or null */
export function formatReport(sum, o = {}) {
  const syn = o.synthetic || null, src = o.source || SOURCE_FIELD;
  const order = [...CATS.filter(c => sum[c] && c !== "none"), "all plates", "none"].filter(c => sum[c]);
  const sy = c => {
    if (!syn) return "—";
    if (c === "none") { const s = syn.none; return s && s.fpReadG ? `false auto-reads ${s.fpRead.x} → ${s.fpReadG.x} of ${s.neg}` : "—"; }
    const ks = c === "all plates" ? Object.keys(syn).filter(k => k !== "none") : [c];
    const S = ks.map(k => syn[k]).filter(Boolean);
    if (!S.length) return "—";
    const n = S.reduce((a, s) => a + s.n, 0), d = S.reduce((a, s) => a + s.det.x, 0), rn = S.reduce((a, s) => a + (s.readG ? s.readG.n : 0), 0);
    const r0 = S.reduce((a, s) => a + s.read.x, 0), r = S.reduce((a, s) => a + (s.readG ? s.readG.x : 0), 0);
    const w0 = S.reduce((a, s) => a + (s.wrong || 0), 0), w = S.reduce((a, s) => a + (s.wrongG || 0), 0);
    return `det ${d}/${n} · exact ${rn ? `${r0} → ${r}/${rn}` : "—"} · wrong ${w0} → ${w}`;
  };
  const arrow = (s, k, f) => MODES.map(m => f(s[m][k])).join(" → ");
  const rows = order.map(c => {
    const s = sum[c], none = c === "none";
    return [c, s.photos, none ? "—" : pct(s.det) + (s.detByRead ? ` (${s.detByRead} by read)` : ""), none ? "—" : arrow(s, "exact", pct),
      MODES.map(m => String(s[m].false) + (s[m].ignored ? ` (+${s[m].ignored} ignored)` : "")).join(" → "),
      none ? "—" : arrow(s, "wrong", String), none ? "—" : pct(s.tapsNeeded), none ? "—" : s.tapFixed, sy(c)];
  });
  return [`Source: ${src}. Columns with arrows: ${MODES.map(m => MODE_LABEL[m]).join(" → ")}.`,
    "Synthetic column: LENSIQ demo set (synthetic, separate), top box, without → with the guard.",
    table(["category", "photos", "detection (top box)", "exact read (auto)", "false auto-reads", "wrong auto-reads", "taps needed (shipped)", "tap read exact",
      "synthetic (demo set)"], rows)].join("\n");
}

/**
 * the whole run. o.evaluate(items, opts) -> [{file, size, auto, taps}] does the browser part (injected by the unit test).
 */
export async function run(a, o = {}) {
  checkDir(a.dir, o.root || repo);
  if (!existsSync(a.dir)) throw new Error(`photo folder not found: ${a.dir} (create it and put the photos + plates-photo-labels.csv there)`);
  if (!existsSync(a.labels)) throw new Error(`labelling sheet not found: ${a.labels} (copy docs/field-pilot/plates-photo-labels.csv)`);
  const labelText = readFileSync(a.labels, "utf8");
  checkLabels(a.labels, labelText, o.root || repo);
  const { photos, errors } = parseLabels(labelText);
  if (errors.length) throw new Error("labelling sheet:\n  " + errors.join("\n  "));
  const conv = listConvert(a.dir);
  const m = matchFolder([...listPhotos(a.dir), ...conv], photos, a.split);
  // a photo that cannot be decoded never stops the run: it is listed as "could not decode" with the reason and left out
  const failed = [], items = [];
  for (const ph of m.items) {
    const ext = extname(ph.file).toLowerCase();
    if (CONVERT.has(ext)) { failed.push({ file: ph.file, error: `${ext.slice(1).toUpperCase()}: ${CONVERT_HINT}` }); continue; }
    let head = null;
    try { head = readFileSync(join(a.dir, ph.file)).subarray(0, 32); } catch (e) { failed.push({ file: ph.file, error: "could not open: " + (e && e.message || e) }); continue; }
    const t = sniffType(head);
    if (t === "heic") failed.push({ file: ph.file, error: `HEIC / HEIF content (named ${ext}): ${CONVERT_HINT}` });
    else if (!t || t === "gif") failed.push({ file: ph.file, error: "not a JPEG / PNG / WebP photo (could not decode)" });
    else items.push({ ...ph, mime: "image/" + t });
  }
  const unlabelledConvert = m.unlabelled.filter(f => CONVERT.has(extname(f).toLowerCase()));
  const unlabelled = m.unlabelled.filter(f => !CONVERT.has(extname(f).toLowerCase())), missing = m.missing;
  if (!items.length && !failed.length) throw new Error("no labelled photo found in the folder");
  const evaluate = o.evaluate || browserEvaluate;
  if (a.detModel) checkModel(a.detModel, o.root || repo);
  const { results, synthetic } = items.length ? await evaluate(items, { dir: a.dir, maxSide: a.maxSide, synthetic: a.synthetic, seed: a.seed, detModel: a.detModel })
    : { results: [], synthetic: null };
  for (const r of results) if (r.error) failed.push({ file: r.file, error: "could not decode: " + r.error });
  const byFile = new Map(results.filter(r => !r.error).map(r => [r.file, r]));
  const done = items.filter(ph => byFile.has(ph.file));
  for (const ph of items) if (!byFile.has(ph.file) && !failed.some(f => f.file === ph.file)) failed.push({ file: ph.file, error: "no result from the browser" });
  const flags = done.map(ph => scorePhoto(ph, byFile.get(ph.file)));
  const summary = summarize(flags);
  return { source: a.source, split: a.split, n: done.length, missing, unlabelled, unlabelledConvert, failed, summary, synthetic, flags,
    results: results.filter(r => !r.error) };
}

async function browserEvaluate(items, o) {
  const { serve } = await import(pathToFileURL(join(repo, "tools/static-server.mjs")).href);
  const { launch } = await import(pathToFileURL(join(repo, "tests/e2e/cdp.mjs")).href);
  const srv = await serve(repo, o.detModel ? { mounts: { "/__detmodel": dirname(resolve(o.detModel)) } } : {});
  let browser = null;
  try {
    browser = await launch();
    const page = await browser.newPage(null, { initScripts: ["window.confirm=()=>true;"] });
    await page.goto(`${srv.base}/parking.html?cpu`);
    await page.waitFor("!!(window.GateKit && window.GateKit.autoReadFrame && window.LQPlate)", 15000);
    await page.evaluate(async () => { await Promise.all([window.LQPlate.loadOcr(), window.LQPlate.loadPlateDet().catch(() => null)]); });
    if (o.detModel) { // the trained detector as an extra proposal source (same code as docs/PLATE-DATASETS.md §4)
      const ok = await page.evaluate(async url => {
        const LP = window.LQPlate, ort = window.ort, S = 416;
        const session = await ort.InferenceSession.create(url, { executionProviders: ["wasm"] });
        LP.registerDetector(async canvas => {
          const k = Math.min(S / canvas.width, S / canvas.height), c = document.createElement("canvas"); c.width = S; c.height = S;
          const x = c.getContext("2d", { willReadFrequently: true }); x.fillStyle = "rgb(114,114,114)"; x.fillRect(0, 0, S, S);
          x.drawImage(canvas, 0, 0, canvas.width * k, canvas.height * k);
          const d = x.getImageData(0, 0, S, S).data, P = S * S, buf = new Float32Array(3 * P);
          for (let i = 0; i < P; i++) { buf[i] = d[4 * i + 2]; buf[P + i] = d[4 * i + 1]; buf[2 * P + i] = d[4 * i]; }
          const out = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", buf, [1, 3, S, S]) });
          const t = out[session.outputNames[0]];
          return window.LQDetect.decodeYolox(t.data, t.dims[1], t.dims[2], S, { classes: [0], minScore: 0.3, scale: k })
            .map(b => ({ x: b.x / canvas.width, y: b.y / canvas.height, w: b.w / canvas.width, h: b.h / canvas.height, score: b.score, src: "model" }));
        }, { proposals: true });
        return true;
      }, `${srv.base}/__detmodel/${encodeURIComponent(basename(o.detModel))}`);
      if (!ok) throw new Error("the trained detector did not load");
    }
    const results = [];
    for (const ph of items) { // one photo per call: phone photos are large; one bad photo never stops the run
      const mime = ph.mime || "image/" + extname(ph.file).slice(1).toLowerCase().replace("jpg", "jpeg");
      let r;
      try {
        const url = `data:${mime};base64,` + readFileSync(join(o.dir, ph.file)).toString("base64");
        r = await page.evaluate(async (url, ph, maxSide) => {
          const el = new Image(); el.src = url;
          try { await el.decode(); } catch (e) { return { error: "the browser could not decode this photo (" + (e && e.name || "error") + ")" }; }
          if (!el.naturalWidth || !el.naturalHeight) return { error: "the photo has no pixels" };
          const W0 = el.naturalWidth, H0 = el.naturalHeight, k = Math.min(1, maxSide / Math.max(W0, H0));
          const c = document.createElement("canvas"); c.width = Math.round(W0 * k); c.height = Math.round(H0 * k);
          c.getContext("2d").drawImage(el, 0, 0, c.width, c.height);
          const moto = ph.cat === "moto", t0 = performance.now(), auto = await window.GateKit.autoReadFrame(c, { moto }), ms = Math.round(performance.now() - t0);
          const taps = [];
          for (const p of ph.plates) {
            if (!p.box) { taps.push(null); continue; }
            const b = { x: p.box[0] / W0, y: p.box[1] / H0, w: (p.box[2] - p.box[0]) / W0, h: (p.box[3] - p.box[1]) / H0 };
            const t = await window.LQPlate.readPlate(c, b, { moto: p.moto });
            taps.push({ key: t && t.key ? t.key : "" });
          }
          return { size: [W0, H0], auto, taps, ms };
        }, url, ph, o.maxSide);
      } catch (e) { r = { error: String(e && e.message || e).slice(0, 200) }; }
      results.push({ file: ph.file, ...r });
      process.stderr.write(r.error ? "x" : ".");
    }
    process.stderr.write("\n");
    let synthetic = null;
    if (o.synthetic > 0) {
      synthetic = await page.evaluate(async (per, seed) => (await window.GateKit.demoEval({ perCat: per, ocr: per, ...(seed ? { seed } : {}) })).summary, o.synthetic, o.seed);
    }
    return { results, synthetic };
  } finally { try { if (browser) await browser.close(); } catch { /* already gone */ } await srv.close(); }
}

async function main() {
  let a;
  try { a = parseArgs(process.argv.slice(2)); } catch (e) {
    console.error(`plate-field-eval: ${e.message}\nusage: node tools/plate-field-eval.mjs [--dir DIR] [--labels CSV] [--source TEXT] [--split dev|heldout|all]`
      + " [--synthetic N] [--seed N] [--max-side PX] [--json] [--out FILE] [--det-model FILE.onnx]");
    return 2;
  }
  try {
    const out = await run(a);
    if (a.out) { checkDir(dirname(resolve(a.out))); writeFileSync(a.out, JSON.stringify(out, null, 1)); }
    if (a.json) console.log(JSON.stringify(out, null, 1));
    else {
      console.log(`LENSIQ Gate — real photos: ${out.n} labelled photos (${a.dir}, split ${a.split})`);
      if (out.missing.length) console.log(`labelled but not in the folder: ${out.missing.length} (${out.missing.slice(0, 5).join(", ")}${out.missing.length > 5 ? " …" : ""})`);
      if (out.unlabelled.length) console.log(`in the folder but not labelled (skipped): ${out.unlabelled.length}`);
      if (out.unlabelledConvert.length) console.log(`HEIC / RAW photos in the folder, not labelled: ${out.unlabelledConvert.length} — ${CONVERT_HINT}`);
      if (out.failed.length) {
        console.log(`could not decode (left out of every number): ${out.failed.length}`);
        for (const f of out.failed.slice(0, 20)) console.log(`  ${f.file}: ${f.error}`);
        if (out.failed.length > 20) console.log(`  … ${out.failed.length - 20} more (use --json for the full list)`);
      }
      console.log(formatReport(out.summary, { synthetic: out.synthetic, source: out.source }));
    }
    return 0;
  } catch (e) { console.error("plate-field-eval:", e && e.message || e); return 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
