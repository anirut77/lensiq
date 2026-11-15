#!/usr/bin/env node
// tools/merit-import-guard.mjs — the step BEFORE the admin page import (Belief guidance tab), so the two Merit files can
// never be mixed up (owner order 2026-11-15). It reads one file, changes nothing in it, imports nothing and sends nothing.
//
//   npm run merit:import:drafts   (= node tools/merit-import-guard.mjs drafts [file])  the 108 drafts, batch merit-108-2026-11-12
//   npm run merit:import:places   (= node tools/merit-import-guard.mjs places [file])  the 35 places, batch places-2026-11-14-notes
//   add --idempotent-confirmed to look at a batch that was already confirmed here (the admin page still refuses a second import)
//
// What it does, in this order:
//   1. prints the file, the batch id, the item count and the sha256 of the file;
//   2. refuses (exit 1, "REFUSED <code>") when: the file has no batch id (batch_missing); the batch id or the items are not of the
//      command's kind (kind_mismatch, item_kind, batch_count); an item fails the Worker's own validation (item_invalid, the same
//      cleanItem / splitReviewMeta as tools/merit-drafts-check.mjs); the batch was already confirmed here (already_confirmed);
//      the batch id was confirmed with other content (file_changed); the other places batch of the same date was confirmed
//      (same_places_other_batch: places-2026-11-14 and places-2026-11-14-notes hold the same 35 places);
//   3. asks you to type the batch id; anything else cancels (exit 1);
//   4. records the batch in a ledger (default ~/LENSIQ-field/merit/import-ledger.json, env LENSIQ_MERIT_LEDGER overrides) and
//      says what to do next in the admin page. The ledger is the only file this tool writes.
// With no file argument each command uses its own default file under ~/LENSIQ-field. Exit 2 = usage or unreadable file.
// Kinds: drafts = merit-<count>-<date>, items of any type, no place-only notes; places = places-<date>[-notes], every item a place
// with purposes, province and verification.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = () => process.env.HOME || homedir();

const KINDS = {
  drafts: {
    re: /^merit-(\d+)-\d{4}-\d{2}-\d{2}$/,
    shape: "merit-<count>-<date>, for example merit-108-2026-11-12",
    other: "places",
    dflt: () => join(home(), "LENSIQ-field", "merit-content", "drafts-2026-11-12.json"),
    label: "ร่างคำแนะนำ (drafts) / guidance drafts"
  },
  places: {
    re: /^places-\d{4}-\d{2}-\d{2}(-notes)?$/,
    shape: "places-<date> or places-<date>-notes, for example places-2026-11-14-notes",
    other: "drafts",
    dflt: () => join(home(), "LENSIQ-field", "merit", "places-2026-11-14-notes.json"),
    label: "สถานที่ไหว้ขอพร (places) / places to pay respect"
  }
};
const PLACE_NOTES = ["purposes", "province", "verification"];

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith("--")));
const pos = args.filter(a => !a.startsWith("--"));
const kind = pos[0];
const refuse = (/** @type {string} */ code, /** @type {string} */ th, /** @type {string} */ en) => {
  console.error(`REFUSED ${code}: ${th}\n         ${en}`);
  process.exit(1);
};
if (!KINDS[kind] || pos.length > 2 || [...flags].some(f => f !== "--idempotent-confirmed")) {
  console.error("usage: node tools/merit-import-guard.mjs <drafts|places> [file.json] [--idempotent-confirmed]");
  process.exit(2);
}
const K = KINDS[kind];
const file = resolve(pos[1] || K.dflt());
let buf;
try { buf = readFileSync(file); } catch (e) {
  console.error(`cannot read ${file}: ${e.message}\nไม่พบไฟล์ / file not found. Check the path (the ${kind} command's default file is ${K.dflt()}).`);
  process.exit(2);
}
let data;
try { data = JSON.parse(buf.toString("utf8")); } catch (e) { console.error(`${file} is not valid JSON: ${e.message}`); process.exit(2); }
const sha256 = createHash("sha256").update(buf).digest("hex");
const items = Array.isArray(data) ? data : data && Array.isArray(data.items) ? data.items : null;
const batch = data && !Array.isArray(data) && typeof data.batch === "string" ? data.batch : null;

console.log(`merit-import-guard: ${kind} · ${K.label}`);
console.log(`file:    ${file}`);
console.log(`batch:   ${batch === null ? "(none)" : batch}`);
console.log(`items:   ${items ? items.length : "(no item list)"}`);
console.log(`sha256:  ${sha256}`);

if (!items) refuse("batch_missing", "ไฟล์นี้ไม่มีรายการ (items)", "the file has no item list");
if (batch === null) {
  refuse("batch_missing", "ไฟล์นี้ไม่มีรหัสชุด (batch) หน้าหลังบ้านจะไม่ยอมนำเข้า", "the file has no batch id; the admin page refuses such a file");
}
if (!K.re.test(batch)) {
  const o = KINDS[K.other].re.test(batch);
  refuse("kind_mismatch",
    o ? `รหัสชุด ${batch} เป็นของไฟล์ ${K.other} แต่คุณสั่ง ${kind} (ใช้ผิดคำสั่ง)` : `รหัสชุด ${batch} ไม่ตรงรูปแบบของ ${kind} (${K.shape})`,
    o ? `batch ${batch} belongs to a ${K.other} file but you ran the ${kind} command; run: npm run merit:import:${K.other}` : `batch ${batch} does not look like a ${kind} batch (${K.shape})`);
}
const countInBatch = kind === "drafts" ? Number(K.re.exec(batch)[1]) : null;
if (countInBatch !== null && countInBatch !== items.length) {
  refuse("batch_count", `รหัสชุด ${batch} บอกว่า ${countInBatch} รายการ แต่ไฟล์มี ${items.length}`,
    `batch ${batch} says ${countInBatch} items but the file has ${items.length}; this is not the file it claims to be`);
}

// ---- item checks: kind first, then the Worker's own validation -------------------------------------------------------------------
const { cleanItem, splitReviewMeta } = await import(pathToFileURL(join(repo, "backend", "src", "merit.js")).href);
/** @type {string[]} */
const kindProblems = [];
/** @type {string[]} */
const invalid = [];
items.forEach((raw, i) => {
  const n = i + 1;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) { kindProblems.push(`#${n}: not an item`); return; }
  const hasNotes = PLACE_NOTES.filter(k => k in raw);
  if (kind === "places") {
    if (raw.type !== "place") kindProblems.push(`#${n}: type is "${raw.type}", a places file holds places only`);
    else if (hasNotes.length !== PLACE_NOTES.length) kindProblems.push(`#${n}: a place needs ${PLACE_NOTES.join(", ")} (missing ${PLACE_NOTES.filter(k => !(k in raw)).join(", ")})`);
  } else if (hasNotes.length) kindProblems.push(`#${n}: carries place-only notes (${hasNotes.join(", ")}); this looks like a places file`);
  if (!kindProblems.some(p => p.startsWith(`#${n}:`))) {
    try {
      const { rest } = splitReviewMeta(raw);
      const b = { ...rest };
      delete b.id; delete b.status; delete b.sample;
      cleanItem({ ...b, status: "draft" });
    } catch (e) {
      const t = raw.title && (raw.title.th || raw.title.en) ? ` "${String(raw.title.th || raw.title.en).slice(0, 40)}"` : "";
      invalid.push(`#${n}${t}: ${e.message}`);
    }
  }
});
if (kindProblems.length) {
  refuse("item_kind", `รายการในไฟล์ไม่ใช่ชนิด ${kind}:\n  ${kindProblems.slice(0, 10).join("\n  ")}`,
    `${kindProblems.length} item(s) are not of kind ${kind}:\n  ${kindProblems.slice(0, 10).join("\n  ")}`);
}
if (invalid.length) {
  refuse("item_invalid", `${invalid.length} จาก ${items.length} รายการไม่ผ่านการตรวจของเซิร์ฟเวอร์:\n  ${invalid.slice(0, 10).join("\n  ")}`,
    `${invalid.length} of ${items.length} item(s) fail the Worker's validation:\n  ${invalid.slice(0, 10).join("\n  ")}`);
}
console.log(`checks:  ${items.length} of ${items.length} item(s) pass (batch id, item kind, Worker validation)`);

// ---- ledger ------------------------------------------------------------------------------------------------------------------------
const ledgerPath = process.env.LENSIQ_MERIT_LEDGER || join(home(), "LENSIQ-field", "merit", "import-ledger.json");
/** @type {{version: number, entries: any[]}} */
let ledger = { version: 1, entries: [] };
if (existsSync(ledgerPath)) {
  try {
    ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    if (!ledger || !Array.isArray(ledger.entries)) throw new Error("no entries list");
  } catch (e) {
    console.error(`the ledger ${ledgerPath} cannot be read (${e.message}); not guessing. Fix or move that file, then run again.`);
    process.exit(2);
  }
}
const family = (/** @type {string} */ b) => (kind === "places" ? b.replace(/-notes$/, "") : b);
const same = ledger.entries.find(e => e.batch === batch);
const sibling = ledger.entries.find(e => e.kind === kind && e.batch !== batch && family(e.batch) === family(batch));
if (sibling) {
  refuse("same_places_other_batch", `ชุด ${sibling.batch} (วันที่ ${sibling.confirmed_at}) มีสถานที่ชุดเดียวกันนี้อยู่แล้ว นำเข้าได้ชุดเดียว ถ้านำเข้าทั้งสองจะได้สถานที่ซ้ำ`,
    `batch ${sibling.batch} (confirmed ${sibling.confirmed_at}) holds the same places as ${batch}; import only one of them or every place will appear twice`);
}
if (same && same.sha256 !== sha256) {
  refuse("file_changed", `รหัสชุด ${batch} เคยยืนยันกับไฟล์ที่เนื้อหาต่างจากไฟล์นี้ (sha256 เดิม ${same.sha256.slice(0, 8)}…) ห้ามนำเข้า`,
    `batch ${batch} was confirmed with different content (earlier sha256 ${same.sha256.slice(0, 8)}…); this file is not the one you confirmed. Do not import it`);
}
if (same && !flags.has("--idempotent-confirmed")) {
  refuse("already_confirmed", `ชุด ${batch} ยืนยันไปแล้วเมื่อ ${same.confirmed_at} นำเข้าได้ครั้งเดียว ถ้าแค่ต้องการดูซ้ำ ใส่ --idempotent-confirmed`,
    `batch ${batch} was already confirmed on ${same.confirmed_at}; each batch is imported once. To look again without importing, add --idempotent-confirmed`);
}
if (same) console.log(`note:    batch ${batch} already confirmed on ${same.confirmed_at} (idempotent look: the admin page refuses a second import, nothing is added to the ledger)`);

// ---- confirmation --------------------------------------------------------------------------------------------------------------------
process.stdout.write(`\nตรวจ batch id sha256 และจำนวนข้างบนให้ตรงกับที่คาดไว้ แล้วพิมพ์รหัสชุด / Type the batch id to confirm (anything else cancels): `);
const rl = createInterface({ input: process.stdin });
const first = await rl[Symbol.asyncIterator]().next();
rl.close();
const answer = first.done ? "" : String(first.value).trim();
process.stdout.write("\n");
if (answer !== batch) {
  console.error(`cancelled: "${answer}" is not the batch id ${batch}. Nothing was recorded. ยกเลิก ไม่มีอะไรถูกบันทึก`);
  process.exit(1);
}
if (!same) {
  ledger.entries.push({ batch, kind, count: items.length, sha256, file, confirmed_at: new Date().toISOString().replace(/\.\d+Z$/, "Z") });
  mkdirSync(dirname(ledgerPath), { recursive: true });
  const tmp = ledgerPath + ".tmp";
  writeFileSync(tmp, JSON.stringify(ledger, null, 1) + "\n");
  renameSync(tmp, ledgerPath);
}
console.log(`confirmed: ${batch} · ${items.length} item(s) · sha256 ${sha256.slice(0, 8)}…${same ? "" : ` · recorded in ${ledgerPath}`}`);
console.log("This did NOT import anything. Next: admin page > Belief guidance (คำแนะนำตามความเชื่อ) > choose this same file >");
console.log("Check the file before importing (ตรวจไฟล์ก่อนนำเข้า) > Import as drafts (นำเข้าเป็นร่าง).");
console.log("ขั้นนี้ยังไม่ได้นำเข้าอะไร ไปต่อที่หลังบ้าน แท็บ คำแนะนำตามความเชื่อ เลือกไฟล์เดียวกันนี้ แล้วกด ตรวจไฟล์ก่อนนำเข้า และ นำเข้าเป็นร่าง");
