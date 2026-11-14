#!/usr/bin/env node
// tools/merit-drafts-check.mjs — check a merit drafts file BEFORE importing it in the admin page (Belief guidance tab →
// "Check the file before importing"). Runs the Worker's own validation (backend/src/merit.js cleanItem: complete TH / EN /
// ZH, fixed types / traditions / keys, wording lint lensiq-merit-lint.js) on this computer; nothing is sent anywhere.
//
//   node tools/merit-drafts-check.mjs ~/LENSIQ-field/merit-content/drafts-2026-11-12.json
//
// File format: a JSON list of items, or {"items": [...]}. Each item:
//   {"type": "place|offering|chong|lucky_item", "tradition": "thai_buddhist|chinese_folk|hindu_brahman|general",
//    "title": {"th","en","zh"}, "body": {"th","en","zh"}, "place": {"th","en","zh"} | null, "area": {...} | null,
//    "keys": ["any" | "chong" | "weak" | "domain:<page>" | "animal:<0-11>" | "element:<wood|fire|earth|metal|water>"], "sort": 0}
// "status", "sample" and "id" are ignored on import (everything comes in as a draft). Reviewer notes "draft_id",
// "disciplines", "sources" [{url, publisher, title, accessed}] and "uncertain" are kept for the review screen only (never
// shown to users). Place notes "purposes" [work|money|love|health|protection|barami], "province" (English name) and
// "verification" (official|secondary|word_of_mouth; word_of_mouth needs the marker in the TH / EN / ZH body) are kept the same
// way (owner order 2026-11-14 Part C); the count per purpose and per verification is printed. Any other field is refused.
// Exit 0 when every item passes, 1 otherwise (the list of problems is printed).
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2];
if (!file) { console.error("usage: node tools/merit-drafts-check.mjs <drafts.json>"); process.exit(2); }
const { cleanItem, splitReviewMeta } = await import(pathToFileURL(join(repo, "backend", "src", "merit.js")).href);
let data;
try { data = JSON.parse(readFileSync(file, "utf8")); } catch (e) { console.error("cannot read JSON: " + e.message); process.exit(2); }
const items = Array.isArray(data) ? data : data && Array.isArray(data.items) ? data.items : null;
if (!items) { console.error("expected a list of items or {\"items\": [...]}"); process.exit(2); }
let bad = 0;
/** @type {Record<string, number>} */
const count = {};
items.forEach((raw, i) => {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("not an item");
    const { meta, rest } = splitReviewMeta(raw);
    const b = { ...rest };
    delete b.id; delete b.status; delete b.sample;
    cleanItem({ ...b, status: "draft" });
    for (const p of (meta && meta.purposes) || []) count["purpose " + p] = (count["purpose " + p] || 0) + 1;
    if (meta && meta.verification) count["verification " + meta.verification] = (count["verification " + meta.verification] || 0) + 1;
  } catch (e) {
    bad++;
    const t = raw && raw.title && (raw.title.th || raw.title.en) ? ` "${String(raw.title.th || raw.title.en).slice(0, 40)}"` : "";
    console.log(`#${i + 1}${t}: ${e.message}`);
  }
});
for (const k of Object.keys(count).sort()) console.log(`${k}: ${count[k]}`);
console.log(`merit-drafts-check: ${items.length - bad} of ${items.length} item(s) pass${bad ? `, ${bad} need fixing` : ""} (max 300 per import)`);
process.exit(bad || items.length > 300 ? 1 : 0);
