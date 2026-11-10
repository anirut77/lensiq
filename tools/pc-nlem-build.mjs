#!/usr/bin/env node
// tools/pc-nlem-build.mjs — Product Check P4: National List of Essential Medicines (บัญชียาหลักแห่งชาติ) lookup table.
//
//   node tools/pc-nlem-build.mjs                    source nlem-2567 (thai-nlem-api CSV, MIT): download if missing, build
//   node tools/pc-nlem-build.mjs --source <id>      another edition from tools/pc-drug-sources.json (refused unless its
//                                                   licence is recorded as allowed)
//   node tools/pc-nlem-build.mjs --check            compare a fresh in-memory build with the committed table (no download)
//   node tools/pc-nlem-build.mjs --gazette FILE.txt cross-check (L32): text extracted from the Royal Gazette announcement
//                                                   (outside the repo); reports which of a fixed 40-name sample appear in it
//   node tools/pc-nlem-build.mjs --tmt-overlap      internal consistency: share of NLEM generic names found as TMT ingredients
//
// Kept per entry: generic name, synonym, dosage forms, NLEM category (ก–จ), therapeutic group (level 1 / 2), the
// controlled-drug note (narcotic / psychotropic / orphan) and whether conditions apply. The conditions, warnings and notes
// TEXT is not copied (link to the announcement instead). Entries marked "ตัดออก" (removed) are dropped.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseCsv } from "./lib/csv.mjs";
import { REPO, download, fieldDir, insideRepo, requireAllowed, sha256 } from "./lib/pc-drug-source.mjs";

export const SCHEMA = "lensiq-pc-nlem/1";
export const CREDIT = {
  en: "National List of Essential Medicines 2567 (บัญชียาหลักแห่งชาติ), announcement of the National Drug System Development Committee, " +
    "Royal Gazette (public government announcement, Thai Copyright Act s.7). Compiled from the thai-nlem-api CSV by suradet-ps (MIT License).",
  th: "บัญชียาหลักแห่งชาติ พ.ศ. 2567 ประกาศคณะกรรมการพัฒนาระบบยาแห่งชาติ ราชกิจจานุเบกษา (ประกาศของรัฐ มาตรา 7 พ.ร.บ.ลิขสิทธิ์) " +
    "เรียบเรียงจากไฟล์ CSV ของ thai-nlem-api โดย suradet-ps (MIT)",
  zh: "泰国国家基本药物目录 2567（国家药物系统发展委员会公告，皇家公报；政府公告）。数据整理自 suradet-ps 的 thai-nlem-api CSV（MIT 许可）。"
};
const clean = s => String(s == null ? "" : s).normalize("NFC").replace(/\s+/g, " ").trim();
const CAT = /^(ก|ข|ค|ง|จ\(1\)|จ\(2\))$/;

/** CSV rows (header first) -> table. Pure; unit-tested. @param {string[][]} rows @param {any} src @param {{sha256: string, built?: string}} meta */
export function buildNlemTable(rows, src, meta) {
  const h = rows[0].map(clean);
  const c = n => { const i = h.indexOf(n); if (i < 0) throw new Error("NLEM column missing: " + n); return i; };
  const ix = { g1: c("name1"), g2: c("name2"), gen: c("generic name"), syn: c("syn name"), dos: c("dosage"), ed: c("ED"), type: c("ประเภทยา"),
    cond: c("เงื่อนไข"), edit: c("edit") };
  const groups = new Map(), gid = g => { if (!groups.has(g)) groups.set(g, groups.size); return groups.get(g); };
  const e = [];
  let dropped = 0, badCat = 0;
  for (const r of rows.slice(1)) {
    const gen = clean(r[ix.gen]);
    if (!gen) continue;
    if (/ตัดออก/.test(r[ix.edit] || "")) { dropped++; continue; }
    const cat = clean(r[ix.ed]);
    if (!CAT.test(cat)) badCat++;
    e.push([gen, clean(r[ix.syn]), clean(r[ix.dos]), CAT.test(cat) ? cat : "", gid(clean(r[ix.g1])), gid(clean(r[ix.g2])), clean(r[ix.type]).slice(0, 80), clean(r[ix.cond]) ? 1 : 0]);
  }
  return {
    schema: SCHEMA,
    source: { id: src.id, title: src.title, publisher: src.publisher, url: src.dataset_url, licence: src.licence, licence_url: src.licence_url || "",
      as_of: src.as_of, input_sha256: meta.sha256, entries: e.length, removed_dropped: dropped, unknown_category: badCat, built: meta.built || "",
      gazette_checked: false, gazette_note: "Cross-check against the Royal Gazette text pending (L32): ratchakitcha.soc.go.th answered a bot challenge " +
        "(HTTP 403) on 2026-11-10. Run --gazette with the announcement text to record it." },
    credit: CREDIT,
    columns: ["generic", "synonym", "dosage_forms", "category", "group1#", "group2#", "controlled_note", "has_conditions"],
    groups: [...groups.keys()], e
  };
}

/** Fixed sample of generic names for the Gazette cross-check. @param {any} t */
export function gazetteSample(t, n = 40) {
  const k = s => createHash("sha256").update("lensiq-pc-p4-nlem|" + s).digest("hex");
  return t.e.map(x => x[0]).sort((a, b) => (k(a) < k(b) ? -1 : 1)).slice(0, n);
}
const fold = s => s.toLowerCase().normalize("NFKC").replace(/[^a-z0-9ก-๙]+/g, " ").trim();

async function main() {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const src = requireAllowed(opt("--source") || "nlem-2567", "nlem");
  const check = a.includes("--check") || a.includes("--gazette") || a.includes("--tmt-overlap");
  if (!check) await download(src, { force: a.includes("--force-download"), log: s => console.log(s) });
  const path = join(fieldDir(src), src.master);
  if (!existsSync(path)) throw new Error(`missing ${path}: run without --check to download it`);
  const buf = readFileSync(path);
  const out = join(REPO, src.out);
  const prev = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : null;
  const t = buildNlemTable(parseCsv(buf.toString("utf8")), src, { sha256: sha256(buf), built: check && prev ? prev.source.built : new Date().toISOString().slice(0, 10) });
  if (a.includes("--gazette")) {
    const f = opt("--gazette");
    if (!f || insideRepo(f)) throw new Error("--gazette needs a text file OUTSIDE the repo");
    const g = " " + fold(readFileSync(f, "utf8")) + " ";
    const sample = gazetteSample(t), found = sample.filter(n => g.includes(" " + fold(n) + " "));
    console.log(JSON.stringify({ checked: new Date().toISOString().slice(0, 10), sample: sample.length, found: found.length,
      missing: sample.filter(n => !found.includes(n)) }, null, 1));
    return;
  }
  if (a.includes("--tmt-overlap")) {
    const tmt = JSON.parse(readFileSync(join(REPO, "vendor/pc-drugs/tmt-2563.json"), "utf8"));
    const ing = new Set(tmt.ing.flatMap(s => s.split(/\s*\+\s*/)).map(fold));
    const single = t.e.filter(x => !/\+/.test(x[0]));
    const hit = single.filter(x => ing.has(fold(x[0])) || (x[1] && ing.has(fold(x[1]))));
    console.log(JSON.stringify({ single_ingredient_entries: single.length, found_as_tmt_ingredient: hit.length,
      share: +(hit.length / single.length).toFixed(3) }));
    return;
  }
  const text = JSON.stringify(t) + "\n";
  console.log(`${src.id}: ${t.e.length} entries (${t.source.removed_dropped} removed rows dropped, ${t.source.unknown_category} without a category), ` +
    `${t.groups.length} groups; ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`);
  if (a.includes("--check")) {
    if (!prev || JSON.stringify(prev) + "\n" !== text) { console.error(`DIFFERENT: ${src.out} does not match a fresh build`); process.exit(1); }
    console.log(`OK: ${src.out} matches a fresh build`);
    return;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  writeFileSync(join(dirname(out), "LICENSE-thai-nlem-api.txt"), readFileSync(join(fieldDir(src), "LICENSE")));
  console.log("wrote " + src.out + " + LICENSE-thai-nlem-api.txt (MIT notice kept)");
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) main().catch(e => { console.error(String(e.message || e)); process.exit(1); });
