#!/usr/bin/env node
// tools/plate-train-prep.mjs — prepares the owner's own Thai plate photos for training a plate DETECTOR (YOLOX-nano,
// Apache-2.0; docs/PLATE-TRAINING.md). Everything stays on this machine, in a folder OUTSIDE the repo
// (default ~/LENSIQ-field/plates-train):
//
//   photos/                       the owner's photos (JPEG / PNG), one flat folder (names must be unique)
//   CONSENT.md                    how the photos were taken: site, date, notice / consent, retention date (template in the doc)
//   labels/plates-photo-labels.csv  plate boxes + text (same format as tools/plate-field-eval.mjs; made with tools/plate-labeller.html)
//   labels/privacy.json           blur regions per photo (faces, people, other personal text) + "checked" by a person
//   blurred/                      the photos with every privacy region blurred (written by the labeller); training uses ONLY these
//   splits/split-<version>.json   the fixed train / val / test split (SPLIT_RULE), locked by sha256 before any training
//   dataset/                      YOLOX / COCO layout: train2017/ val2017/ test2017/ annotations/{train,val,test}.json,
//                                 test2017/plates-photo-labels.csv (held-out labels for plate-field-eval), MANIFEST.json
//   runs/                         training runs (tools/plate_train.py)
//
//   node tools/plate-train-prep.mjs init   [--root DIR]   create the folders + CONSENT.md template
//   node tools/plate-train-prep.mjs status [--root DIR]   counts: photos, labelled, privacy-checked, blurred, per category
//   node tools/plate-train-prep.mjs split  [--root DIR] [--dev-batch] [--train-only FIRST-BATCH/MANIFEST.json]
//        --dev-batch: the first factory batch (dev only, never an adoption decision; locked as plate-split-v1-devbatch)
//        --train-only: photos of the first batch never go to the test split of the main set
//   (split) make the fixed split and LOCK it (evals-locks/plate-train-split.sha256 + ~/LENSIQ-field/evals/plate-train/)
//   node tools/plate-train-prep.mjs export [--root DIR]   write dataset/ from blurred photos of the locked split (checked photos only)
//
// SPLIT RULE (plate-split-v1, locked in tests/unit/plate-train-prep.test.js): photos that share a plate are one group
// (union over every plate key on a photo, so the same car on different days never sits in train AND test); a plate-less
// photo is its own group "photo-none:<file>"; group -> sha256("lensiq-plate-split:v1:" + key) -> first 8 hex mod 100:
// < 70 train, < 85 val, else test. No plate text and no province ever goes into the training files (boxes only).
import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseLabels } from "./plate-field-eval.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SPLIT_RULE = Object.freeze({ version: "plate-split-v1", salt: "lensiq-plate-split:v1", train: 70, val: 15 });
export const ROOT_DEFAULT = join(homedir(), "LENSIQ-field", "plates-train");

export function checkRoot(root, repoRoot = repo) {
  const rel = relative(resolve(repoRoot), resolve(root));
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)))
    throw new Error(`the training folder must be outside the repo (${root}): photos of plates and people are personal data`);
  return true;
}
export function paths(root) {
  return { photos: join(root, "photos"), labels: join(root, "labels", "plates-photo-labels.csv"), privacy: join(root, "labels", "privacy.json"),
    blurred: join(root, "blurred"), splits: join(root, "splits"), dataset: join(root, "dataset"), runs: join(root, "runs"), consent: join(root, "CONSENT.md") };
}

export function bucket(key) {
  const v = parseInt(createHash("sha256").update(SPLIT_RULE.salt + ":" + key).digest("hex").slice(0, 8), 16) % 100;
  return v < SPLIT_RULE.train ? "train" : v < SPLIT_RULE.train + SPLIT_RULE.val ? "val" : "test";
}
const plateKey = p => String(p.key || p.text || "").replace(/\s+/g, "");
/** photos (parseLabels().photos) -> Map(file -> group key); union-find over shared plate keys */
export function groups(photos) {
  const parent = new Map(), find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const add = x => { if (!parent.has(x)) parent.set(x, x); };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) { if (a < b) parent.set(b, a); else parent.set(a, b); } };
  const keysOf = ph => [...new Set(ph.plates.map(plateKey).filter(k => k && k !== "?"))];
  for (const ph of photos.values()) {
    const ks = keysOf(ph).map(k => "plate:" + k);
    ks.forEach(add);
    for (let i = 1; i < ks.length; i++) union(ks[0], ks[i]);
  }
  // group key = the smallest plate key of the component (stable whatever the photo order)
  const minOf = new Map();
  for (const k of parent.keys()) { const r = find(k), cur = minOf.get(r); if (cur == null || k < cur) minOf.set(r, k); }
  const out = new Map();
  for (const ph of photos.values()) {
    const ks = keysOf(ph);
    out.set(ph.file, ks.length ? minOf.get(find("plate:" + ks[0])).slice(6) : "photo-none:" + ph.file);
  }
  return out;
}
/**
 * o.trainOnly: Set of files that must never be in the test split (the first factory dev batch, already looked at): a file
 * whose group lands in test goes to train instead. Without it the split is exactly plate-split-v1.
 */
export function makeSplit(photos, o = {}) {
  const g = groups(photos), files = {}, counts = { train: {}, val: {}, test: {} }, only = o.trainOnly || new Set();
  let moved = 0;
  for (const f of [...g.keys()].sort()) {
    let part = bucket(g.get(f));
    if (part === "test" && only.has(f)) { part = "train"; moved++; }
    files[f] = part;
    const cat = photos.get(f).cat; counts[part][cat] = (counts[part][cat] || 0) + 1;
  }
  // the hash covers each photo's labels too (review S2): editing a held-out label after the lock is refused at export
  const labels = Object.fromEntries(Object.keys(files).map(f => { const ph = photos.get(f); return [f, [ph.cat,
    ph.plates.map(p => [p.text, p.key, p.cat, p.box || null, p.sure, p.province || ""]), (ph.ignore || []).map(b => b.slice())]]; }));
  const canon = JSON.stringify({ rule: SPLIT_RULE.version, files, labels });
  const out = { rule: SPLIT_RULE.version, files, groups: new Set(g.values()).size, counts, sha256: createHash("sha256").update(canon).digest("hex") };
  if (only.size) out.trainOnly = moved;
  return out;
}
/** the first factory batch: same rule, locked under its own label so it never takes the held-out lock of plate-split-v1 */
export const devBatchRule = s => ({ ...s, rule: SPLIT_RULE.version + "-devbatch", devBatch: true });
/** hash of a photo's blur boxes (order-insensitive, kind ignored): recorded at blurred export, checked at dataset export */
export function regionsHash(regions) {
  const r = (regions || []).map(b => b.slice(0, 4).map(v => Math.round(Number(v)))).map(b => b.join(",")).sort();
  return createHash("sha256").update(JSON.stringify(r)).digest("hex");
}
/** EXIF in a JPEG (APP1 "Exif") or PNG (eXIf chunk) */
export function hasExif(buf) {
  const b = Buffer.from(buf || []);
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 4 <= b.length && b[i] === 0xff) {
      const m = b[i + 1];
      if (m === 0xda || m === 0xd9) break;
      const len = b.readUInt16BE(i + 2);
      if (m === 0xe1 && b.toString("latin1", i + 4, i + 10).startsWith("Exif")) return true;
      i += 2 + len;
    }
    return false;
  }
  if (b.length > 8 && b.readUInt32BE(0) === 0x89504e47) {
    let i = 8;
    while (i + 8 <= b.length) { const len = b.readUInt32BE(i), t = b.toString("latin1", i + 4, i + 8); if (t === "eXIf") return true; if (t === "IEND") break; i += 12 + len; }
  }
  return false;
}
/** append "<rule> <sha256>" once; a different hash under the same rule version is refused */
export function lockSplit(split, lockFile) {
  const have = existsSync(lockFile) ? readFileSync(lockFile, "utf8") : "";
  const line = have.split("\n").find(l => l.startsWith(split.rule + " "));
  if (line) {
    if (line.split(" ")[1] === split.sha256) return { locked: false };
    throw new Error(`a different ${split.rule} split is already locked (${line.split(" ")[1].slice(0, 12)}…): photos or labels changed after the lock. `
      + `A new split needs a new rule version and is a new held-out set`);
  }
  mkdirSync(dirname(lockFile), { recursive: true });
  appendFileSync(lockFile, `${split.rule} ${split.sha256}\n`);
  return { locked: true };
}

export function parsePrivacy(text) {
  const errors = [], files = {};
  let j; try { j = JSON.parse(text); } catch { return { files, errors: ["privacy.json is not valid JSON"] }; }
  for (const [f, v] of Object.entries((j && j.files) || {})) {
    const regions = [];
    let bad = false;
    for (const r of (v && v.regions) || []) {
      const b = r.slice(0, 4).map(Number);
      if (b.some(x => !Number.isFinite(x)) || !(b[2] > b[0] && b[3] > b[1])) { bad = true; continue; }
      regions.push([...b, String(r[4] || "face")]);
    }
    if (bad) errors.push(`${f}: a blur region needs x0,y0,x1,y1 with x1 > x0 and y1 > y0`);
    files[f] = { checked: !!(v && v.checked === true), regions };
  }
  return { files, errors };
}

export function imageSize(buf) {
  const b = Buffer.from(buf || []);
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + len;
    }
  }
  return null;
}
/** items [{name, width, height, plates: [{box}]}] -> COCO json, one class "plate" (id 1), boxes only */
export function buildCoco(items) {
  const images = [], annotations = [];
  items.forEach((it, id) => {
    images.push({ id, file_name: it.name, width: it.width, height: it.height });
    for (const p of it.plates || []) {
      if (!p.box) continue;
      const [x0, y0, x1, y1] = p.box;
      annotations.push({ id: annotations.length, image_id: id, category_id: 1, bbox: [x0, y0, x1 - x0, y1 - y0], area: (x1 - x0) * (y1 - y0), iscrowd: 0 });
    }
  });
  return { images, annotations, categories: [{ id: 1, name: "plate" }] };
}
const csvCell = v => { const s = v == null ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function exportDataset({ root, photos, privacy, split }) {
  const P = paths(root), refused = [], parts = { train: [], val: [], test: [] }, manifest = [];
  rmSync(P.dataset, { recursive: true, force: true });
  for (const part of Object.keys(parts)) mkdirSync(join(P.dataset, part + "2017"), { recursive: true });
  mkdirSync(join(P.dataset, "annotations"), { recursive: true });
  for (const f of Object.keys(split.files).sort()) {
    const ph = photos.get(f), pv = privacy[f];
    if (!ph) continue;
    if (!pv || !pv.checked) { refused.push({ file: f, why: "not checked for faces / personal data by a person (labeller: 'faces checked')" }); continue; }
    const src = join(P.blurred, f);
    if (!existsSync(src)) { refused.push({ file: f, why: "not blurred yet (labeller: 'export blurred photos')" }); continue; }
    const buf = readFileSync(src), size = imageSize(buf);
    if (!size) { refused.push({ file: f, why: "not a JPEG / PNG" }); continue; }
    if (hasExif(buf)) { refused.push({ file: f, why: "the blurred photo carries EXIF (export blurred photos again)" }); continue; }
    const part = split.files[f], name = `${part}_${String(parts[part].length).padStart(6, "0")}${extname(f).toLowerCase()}`;
    copyFileSync(src, join(P.dataset, part + "2017", name));
    parts[part].push({ name, width: size[0], height: size[1], plates: ph.plates, ph });
    manifest.push({ file: f, part, name });
  }
  for (const [part, items] of Object.entries(parts)) writeFileSync(join(P.dataset, "annotations", part + ".json"), JSON.stringify(buildCoco(items)));
  // held-out labels for tools/plate-field-eval.mjs / plate-det-compare.mjs (plate text needed to score reads; stays outside the repo)
  const head = "file,category,plate,province,x0,y0,x1,y1,split,sure,notes";
  const rows = [head];
  for (const it of parts.test) {
    const ph = it.ph;
    if (ph.cat === "none") rows.push([it.name, "none", "", "", "", "", "", "", "heldout", "", ""].map(csvCell).join(","));
    for (const p of ph.plates) rows.push([it.name, p.cat || ph.cat, p.text, p.province, ...(p.box || ["", "", "", ""]), "heldout", p.sure ? "" : "n", ""].map(csvCell).join(","));
    for (const b of ph.ignore || []) rows.push([it.name, "ignore", "", "", ...b, "heldout", "", ""].map(csvCell).join(","));
  }
  writeFileSync(join(P.dataset, "test2017", "plates-photo-labels.csv"), rows.join("\n") + "\n");
  writeFileSync(join(P.dataset, "MANIFEST.json"), JSON.stringify({ rule: split.rule, sha256: split.sha256, devBatch: !!split.devBatch, files: manifest }, null, 1));
  return { refused, counts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length])) };
}

export const CONSENT_TEMPLATE = `# Photo set record (บันทึกชุดภาพ) — stays in this folder, never in the repo. No names in this folder.

Basis for this batch / ฐานของชุดภาพนี้ (tick ONE; docs/PLATE-TRAINING.md §2.1):
- [ ] A. Site owner's written permission + PDPA camera notice sign posted during shooting + no people photographed
      ได้รับอนุญาตเป็นหนังสือจากเจ้าของสถานที่ + ติดป้ายแจ้ง PDPA ระหว่างถ่าย + ไม่ถ่ายคน
      (needs counsel's OK before use for a model that is sold: docs/PDPA-NOTES-FOR-COUNSEL.md H(c))
- [ ] B. Only vehicles whose vehicle owner (or regular driver) agreed before the photo, e.g. staff at our own factory
      ถ่ายเฉพาะรถที่เจ้าของรถ (หรือผู้ขับประจำ) ตกลงก่อนถ่าย เช่น รถพนักงานในโรงงานของเรา
      The signed agreement sheets are kept ON PAPER in the office, not in this folder; write only the count below.

- Site(s) / สถานที่:
- Site owner's written permission (A) — document and date / หนังสืออนุญาตของเจ้าของสถานที่ (เลขที่ / วันที่):
- PDPA sign posted (A) — where, from / to / ติดป้าย PDPA ที่ไหน ตั้งแต่-ถึง:
- Vehicle owners who agreed (B) — count only, no names / จำนวนเจ้าของรถที่ตกลง (จำนวนเท่านั้น ไม่มีชื่อ):
- Date(s) / วันที่ถ่าย:
- Who took the photos / ผู้ถ่าย (role, not name):
- People in the photos / มีคนในภาพหรือไม่: avoided; any face or person is blurred and checked by a person before training
- Retention / ลบเมื่อ: originals (photos/) deleted on ____ (proposal: 30 days after export); blurred set kept until the model card is done
- Who can open this folder / ผู้เข้าถึงได้:
`;

function status(root) {
  const P = paths(root);
  const photos = existsSync(P.photos) ? readdirSync(P.photos).filter(f => /\.(jpe?g|png)$/i.test(f)) : [];
  const lab = existsSync(P.labels) ? parseLabels(readFileSync(P.labels, "utf8")) : { photos: new Map(), errors: [] };
  const pv = existsSync(P.privacy) ? parsePrivacy(readFileSync(P.privacy, "utf8")) : { files: {}, errors: [] };
  const blurred = existsSync(P.blurred) ? new Set(readdirSync(P.blurred)) : new Set();
  const cats = {};
  for (const ph of lab.photos.values()) cats[ph.cat] = (cats[ph.cat] || 0) + 1;
  return { photos: photos.length, labelled: lab.photos.size, labelErrors: lab.errors, checked: Object.values(pv.files).filter(v => v.checked).length,
    privacyErrors: pv.errors, blurred: photos.filter(f => blurred.has(f)).length, categories: cats, consent: existsSync(P.consent) };
}

export async function main(argv, io = {}) {
  const log = io.log || console.log, err = io.err || console.error;
  const cmd = argv[0], ri = argv.indexOf("--root"), root = resolve(ri >= 0 ? argv[ri + 1] : ROOT_DEFAULT);
  const lockRepo = io.lockRepo || join(repo, "evals-locks", "plate-train-split.sha256");
  const lockField = io.lockField || join(homedir(), "LENSIQ-field", "evals", "plate-train", "locked.sha256");
  try {
    checkRoot(root, io.repo || repo);
    const P = paths(root);
    if (cmd === "init") {
      for (const d of [P.photos, dirname(P.labels), P.blurred, P.splits, P.runs]) mkdirSync(d, { recursive: true });
      if (!existsSync(P.consent)) writeFileSync(P.consent, CONSENT_TEMPLATE);
      log(`ready: ${root}\n  put the photos in ${P.photos} and fill ${P.consent}\n  then label: node tools/plate-labeller.mjs --root ${root}`);
      return 0;
    }
    if (cmd === "status") { log(JSON.stringify(status(root), null, 1)); return 0; }
    const lab = parseLabels(readFileSync(P.labels, "utf8"));
    if (lab.errors.length) { err("labelling sheet:\n  " + lab.errors.join("\n  ")); return 2; }
    if (cmd === "split") {
      if (!existsSync(P.consent)) { err(`no ${P.consent}: write down how the photos were taken (notice / consent, retention) first`); return 2; }
      const devBatch = argv.includes("--dev-batch"), ti = argv.indexOf("--train-only");
      // --train-only FILE: the first batch's MANIFEST.json (or a plain list, one photo name per line) -> never in test
      let trainOnly = new Set();
      if (ti >= 0) {
        const t = readFileSync(argv[ti + 1], "utf8");
        try { trainOnly = new Set(JSON.parse(t).files.map(x => x.file)); } catch { trainOnly = new Set(t.split(/\r?\n/).map(x => x.trim()).filter(Boolean)); }
      }
      const s0 = makeSplit(lab.photos, { trainOnly }), s = devBatch ? devBatchRule(s0) : s0;
      mkdirSync(P.splits, { recursive: true });
      const file = join(P.splits, `split-${SPLIT_RULE.version}.json`);
      const r1 = lockSplit(s, lockField);
      lockSplit(s, lockRepo);
      if (trainOnly.size) s.trainOnlyFiles = [...trainOnly].filter(f => s.files[f]).sort();
      writeFileSync(file, JSON.stringify(s, null, 1));
      mkdirSync(dirname(lockField), { recursive: true }); copyFileSync(file, join(dirname(lockField), basename(file)));
      log(`${s.rule}: ${Object.keys(s.files).length} photos in ${s.groups} groups -> ${JSON.stringify(s.counts)}\nsha256 ${s.sha256} ${r1.locked ? "LOCKED now" : "(already locked)"}`);
      log(`commit ${relative(repo, lockRepo)} BEFORE training or measuring (owner rule 2026-11-13)`);
      return 0;
    }
    if (cmd === "export") {
      const file = join(P.splits, `split-${SPLIT_RULE.version}.json`);
      if (!existsSync(file)) { err("no locked split: run `split` first"); return 2; }
      const s = JSON.parse(readFileSync(file, "utf8"));
      const now = makeSplit(lab.photos, { trainOnly: new Set(Object.keys(s.files).filter(f => s.trainOnlyFiles && s.trainOnlyFiles.includes(f))) });
      if (now.sha256 !== s.sha256) { err("the labels changed after the split was locked (photos added / plate text changed): new split = new version"); return 2; }
      const pv = parsePrivacy(readFileSync(P.privacy, "utf8"));
      if (pv.errors.length) { err("privacy.json:\n  " + pv.errors.join("\n  ")); return 2; }
      // review S3: a photo whose blur boxes changed after its blurred export (or with no record of it) is left out
      const idxFile = join(dirname(P.labels), "blurred-index.json");
      const idx = existsSync(idxFile) ? JSON.parse(readFileSync(idxFile, "utf8")).files || {} : {};
      const stale = [], privacy = {};
      for (const [f, v] of Object.entries(pv.files)) {
        const rec = idx[f];
        if (v.checked && (!rec || rec.regions !== regionsHash(v.regions))) stale.push({ file: f, why: rec ? "blur boxes changed after the blurred export: export blurred photos again"
          : "no record of a blurred export (blurred-index.json): export blurred photos again" });
        else privacy[f] = v;
      }
      const r = exportDataset({ root, photos: lab.photos, privacy, split: s });
      r.refused = stale.filter(x => s.files[x.file]).concat(r.refused.filter(x => !stale.some(y => y.file === x.file)));
      log(`dataset: ${JSON.stringify(r.counts)} -> ${P.dataset}`);
      if (r.refused.length) { log(`left out (${r.refused.length}):`); for (const x of r.refused.slice(0, 30)) log(`  ${x.file}: ${x.why}`); }
      return 0;
    }
    err("usage: node tools/plate-train-prep.mjs init|status|split|export [--root DIR]"); return 2;
  } catch (e) { err("plate-train-prep: " + (e && e.message || e)); return 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
