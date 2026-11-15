#!/usr/bin/env node
// tools/merit-places-notes.mjs — builds the COMPLETE replacement batch "<batch>-notes" from an original places file (owner order
// 2026-11-15). The original is only read, never changed or moved. Every item is copied as it is; only the back-office note
// `uncertain` (the yellow "ผู้ตรวจโปรดตรวจ" box on the review screen, never shown to users) gets the reviewer warning for the item's
// verification level first, then the writer's own note:
//   official_unopened : the writer saw only a search summary of the official page; open the page, then raise it to official
//   secondary         : media / journal / encyclopaedia only, no official page
//   word_of_mouth     : only the place is confirmed, the purpose is popular telling; the marker words must stay
//   official          : an official page was read; still check the details
// An item whose note already starts with "ผู้ตรวจโปรดตรวจ:" (a warning specific to that place, for example which Ganesha shrine) keeps
// it first and the level warning follows. Every item also gets the common warning (native Thai / Chinese read-through, match keys).
//
//   node tools/merit-places-notes.mjs [<in.json> [<out.json>]]      (npm run merit:notes)
//   defaults: in = ~/LENSIQ-field/merit/places-2026-11-14.json, out = ~/LENSIQ-field/merit/places-2026-11-14-notes.json (the batch id inside is places-2026-11-14-notes;
//   the file name matches the batch id so it cannot be mistaken for the original)
// Refuses (exit 1): an input that is not a places-<date> batch, an input that is already a -notes batch, an output that exists or is the
// input, a note that would pass 2000 characters. Exit 2: usage or unreadable input. Prints the sha256 of the new file.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const home = process.env.HOME || homedir();
const args = process.argv.slice(2);
if (args.length > 2 || args.some(a => a.startsWith("--"))) { console.error("usage: node tools/merit-places-notes.mjs [<in.json> [<out.json>]]"); process.exit(2); }
const inPath = resolve(args[0] || join(home, "LENSIQ-field", "merit", "places-2026-11-14.json"));
const outPath = resolve(args[1] || join(home, "LENSIQ-field", "merit", "places-2026-11-14-notes.json"));
const fail = (/** @type {string} */ m) => { console.error("REFUSED: " + m); process.exit(1); };

let buf;
try { buf = readFileSync(inPath); } catch (e) { console.error(`cannot read ${inPath}: ${e.message}`); process.exit(2); }
let data;
try { data = JSON.parse(buf.toString("utf8")); } catch (e) { console.error(`${inPath} is not valid JSON: ${e.message}`); process.exit(2); }

const batch = data && !Array.isArray(data) && typeof data.batch === "string" ? data.batch : null;
if (!Array.isArray(data && data.items)) fail("the input has no item list");
if (!batch || !/^places-\d{4}-\d{2}-\d{2}$/.test(batch)) {
  fail(batch && /-notes$/.test(batch) ? `batch ${batch} is already a -notes batch; build the notes from the original places file` : `batch ${batch} is not an original places batch (places-<date>)`);
}
if (data.items.some((/** @type {any} */ it) => !it || it.type !== "place")) fail("every item of a places batch must be a place");
let same = outPath === inPath;
try { if (existsSync(outPath) && realpathSync(outPath) === realpathSync(inPath)) same = true; } catch { /* compared by path above */ }
if (same) fail("the output is the input; the original file is never changed");
if (existsSync(outPath)) fail(`${outPath} already exists; it is never overwritten (choose another output name or remove it yourself)`);

const PREFIX = "ผู้ตรวจโปรดตรวจ:";
const LEVEL = {
  official_unopened: `${PREFIX} (แหล่งทางการ ยังไม่ได้เปิดอ่านหน้าต้นทาง) ผู้เขียนอ่านได้แค่สรุปจากเครื่องมือค้นหา โปรดเปิดลิงก์ทางการในเบราว์เซอร์ ถ้าตรงจึงกดยกระดับเป็นแหล่งทางการ ` +
    `(Reviewer, official_unopened: the writer saw only a search summary of the official page; open the link in a browser and raise it to official only if it matches.)`,
  secondary: `${PREFIX} (แหล่งรอง) มีเพียงสื่อ บทความ หรือสารานุกรม ไม่มีหน้าทางการยืนยัน โปรดตรวจจุดประสงค์และรายละเอียดกับแหล่งที่มา ` +
    `(Reviewer, secondary: media, journal or encyclopaedia only, no official page; check the purpose and details against the sources.)`,
  word_of_mouth: `${PREFIX} (ตามที่เล่าต่อกันมา) ยืนยันได้เฉพาะว่ามีสถานที่นี้ จุดประสงค์มาจากการเล่าต่อ ห้ามลบคำว่า "ตามที่เล่าต่อกันมา" ออกจากข้อความทั้ง 3 ภาษา ` +
    `(Reviewer, word_of_mouth: only the place is confirmed, the purpose is popular telling; keep the word-of-mouth marker in Thai, English and Chinese.)`,
  official: `${PREFIX} (แหล่งทางการ) อ่านหน้าทางการแล้ว ยังตรวจรายละเอียดเช่นเวลาเปิดและกฎของสถานที่ก่อนอนุมัติ ` +
    `(Reviewer, official: an official page was read; still check opening hours and site rules before approving.)`
};
const COMMON = `ทุกรายการ: ให้เจ้าของภาษาไทยและจีนอ่านทวนก่อนอนุมัติ และตรวจคีย์จับคู่ ซึ่งเป็นการเลือกของบรรณาธิการ ` +
  `(Every item: native Thai and Chinese read-through before approval; the match keys are an editorial choice.)`;

const items = data.items.map((/** @type {any} */ it, /** @type {number} */ i) => {
  const lvl = LEVEL[it.verification];
  if (!lvl) fail(`item #${i + 1} has verification "${it.verification}", expected one of ${Object.keys(LEVEL).join(", ")}`);
  const old = typeof it.uncertain === "string" ? it.uncertain.trim() : Array.isArray(it.uncertain) ? it.uncertain.join("\n").trim() : "";
  const specific = old.startsWith(PREFIX);
  const parts = specific ? [old, lvl, COMMON] : [lvl, ...(old ? [old] : []), COMMON];
  const uncertain = parts.join(" | ");
  if ([...uncertain].length > 2000) fail(`item #${i + 1}: the note would be ${[...uncertain].length} characters, the limit is 2000`);
  return { ...it, uncertain };
});
const out = { ...data, batch: batch + "-notes", items };

const text = JSON.stringify(out, null, 1) + "\n";
writeFileSync(outPath, text, { flag: "wx" });
const sha = createHash("sha256").update(text).digest("hex");
console.log(`merit-places-notes: ${items.length} item(s) · batch ${out.batch}`);
console.log(`input:   ${inPath} (not changed)`);
console.log(`output:  ${outPath}`);
console.log(`sha256:  ${sha}`);
console.log("This is a complete replacement for the original places file: import THIS file instead of it, never both.");
