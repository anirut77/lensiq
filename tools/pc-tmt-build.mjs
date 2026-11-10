#!/usr/bin/env node
// tools/pc-tmt-build.mjs — Product Check P4: Thai brand -> active ingredient / strength / dose form table from TMT.
//
//   node tools/pc-tmt-build.mjs                        source tmt-2563 (TMT 2020-02-17, CC BY): download if missing, build
//   node tools/pc-tmt-build.mjs --source <id>          another release from tools/pc-drug-sources.json (refresh). REFUSED
//                                                      unless that source's licence is recorded as allowed there
//   ... --force-download                               re-download even when the files exist
//   ... --check                                        build in memory and compare with the committed table (exit 1 if
//                                                      different); no download (the files must already be there)
//
// Downloads go to ~/LENSIQ-field/drug-data/<dir>/ (never into the repo). Output: vendor/pc-drugs/tmt-2563.json, a DERIVED
// lookup table (credit + "data as of" + input checksum inside), and vendor/pc-drugs/tmt/ (meta.json + one small shard per
// 2-character key prefix, built with LQPCLookup.buildTmtShards): the page loads only the shards a label needs, so a phone
// never holds the whole index (owner decision 2026-11-10, review S7). --check compares the table AND every shard. Only trade name, ingredient, strength, dose form and
// manufacturer (a company) are kept; FSN text, TPU codes, pack sizes and every other column are dropped.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { readXls } from "./lib/xls-biff8.mjs";
import { REPO, download, fieldDir, requireAllowed, sha256 } from "./lib/pc-drug-source.mjs";

export const SCHEMA = "lensiq-pc-tmt/1";
export const SHARD_SCHEMA = "lensiq-pc-tmt-shards/1";
const L = createRequire(import.meta.url)("../lensiq-pc-lookup.js");
/** Table -> {"meta.json": text, "<shard>.json": text, ...} (pure; unit-tested). @param {any} t */
export function shardFiles(t) {
  const shards = L.buildTmtShards(t);
  const meta = { schema: SHARD_SCHEMA, source: t.source, credit: t.credit, note: t.note + " Shards of the index; matching loads only those a label needs.",
    ing: t.ing, form: t.form, shards: shards.map((/** @type {any} */ x) => x[0]), products: t.p.length };
  /** @type {Record<string, string>} */ const files = { "meta.json": JSON.stringify(meta) + "\n" };
  for (const [name, sh] of shards) files[name + ".json"] = JSON.stringify(sh) + "\n";
  return files;
}
export const CREDIT = {
  en: "Thai Medicines Terminology (TMT), release TMTRF20200217, by สำนักพัฒนามาตรฐานระบบข้อมูลสุขภาพไทย (สมสท.), data.go.th, " +
    "licensed Creative Commons Attribution. Modified: converted to a lookup table; columns dropped.",
  th: "บัญชีข้อมูลยาและรหัสยามาตรฐานไทย (TMT) ฉบับเผยแพร่ 17 ก.พ. 2563 โดย สมสท. ที่มา data.go.th สัญญาอนุญาต CC BY ดัดแปลง: แปลงเป็นตารางค้นหา",
  zh: "泰国药品术语集 (TMT) 2020-02-17 版，发布者 สมสท.，来源 data.go.th，CC BY 许可。已改编：转换为查询表。"
};
const COLS = ["TPUCode", "ActiveIngredient", "Strength", "Dosageform", "Contvalue", "Contunit", "DispUnit", "TradeName", "Manufacturer", "FSN", "Status"];
const clean = s => String(s == null ? "" : s).normalize("NFC").replace(/\s+/g, " ").trim();

/**
 * Rows of MasterTMT (header first) -> compact table. Pure; unit-tested.
 * @param {string[][]} rows @param {any} src @param {{sha256: string, built?: string}} meta
 */
export function buildTmtTable(rows, src, meta) {
  const head = rows[0].map(clean);
  for (const c of ["ActiveIngredient", "Strength", "Dosageform", "TradeName", "Manufacturer"]) if (!head.includes(c)) throw new Error("MasterTMT column missing: " + c);
  const ix = Object.fromEntries(COLS.map(c => [c, head.indexOf(c)]));
  const dict = () => { const m = new Map(); return { m, id: v => { if (!m.has(v)) m.set(v, m.size); return m.get(v); } }; };
  const ing = dict(), form = dict(), maker = dict();
  const seen = new Set(), p = [];
  let input = 0, inactive = 0;
  for (const r of rows.slice(1)) {
    if (!r || !clean(r[ix.TradeName])) continue;
    input++;
    if (ix.Status >= 0 && clean(r[ix.Status]) && clean(r[ix.Status]) !== "0") { inactive++; continue; }
    const name = clean(r[ix.TradeName]), i = clean(r[ix.ActiveIngredient]).toLowerCase(), s = clean(r[ix.Strength]), f = clean(r[ix.Dosageform]).toLowerCase();
    const mk = clean(r[ix.Manufacturer]);
    const key = [name, i, s, f, mk].join("\u0001");
    if (seen.has(key)) continue; // TPU rows that differ only by pack size
    seen.add(key);
    p.push([name, ing.id(i), s, form.id(f), maker.id(mk)]);
  }
  p.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  return {
    schema: SCHEMA,
    source: { id: src.id, title: src.title, publisher: src.publisher, url: src.dataset_url, licence: src.licence, licence_url: src.licence_url || "",
      as_of: src.as_of, input_sha256: meta.sha256, input_rows: input, inactive_rows_dropped: inactive, built: meta.built || "" },
    credit: CREDIT,
    note: "Derived lookup table. Brand -> ingredient facts as of the release date; products registered later are missing. Not a register: " +
      "a missing name says nothing about a product's registration. Thai FDA registration numbers are not in TMT.",
    columns: ["trade_name", "ingredient#", "strength", "dose_form#", "manufacturer#"],
    ing: [...ing.m.keys()], form: [...form.m.keys()], maker: [...maker.m.keys()], p
  };
}

async function main() {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const id = opt("--source") || "tmt-2563";
  const src = requireAllowed(id, "tmt"); // refuses unknown sources and sources whose licence is not recorded as allowed
  const check = a.includes("--check");
  const dir = fieldDir(src);
  if (!check) await download(src, { force: a.includes("--force-download"), log: s => console.log(s) });
  const path = join(dir, src.master);
  if (!existsSync(path)) throw new Error(`missing ${path}: run without --check to download it`);
  const buf = readFileSync(path);
  const rows = readXls(buf).sheets[0].rows;
  const out = join(REPO, src.out);
  const prev = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : null;
  const t = buildTmtTable(rows, src, { sha256: sha256(buf), built: check && prev ? prev.source.built : new Date().toISOString().slice(0, 10) });
  const text = JSON.stringify(t) + "\n";
  const kb = n => (n / 1024).toFixed(0) + " KB";
  console.log(`${src.id}: ${t.source.input_rows} rows -> ${t.p.length} products, ${t.ing.length} ingredients, ${t.form.length} forms, ` +
    `${t.maker.length} makers; ${kb(Buffer.byteLength(text))} (${kb(gzipSync(text).length)} gzip)`);
  const files = shardFiles(t), sdir = join(dirname(out), "tmt");
  const sizes = Object.entries(files).filter(([n]) => n !== "meta.json").map(([, v]) => Buffer.byteLength(v)).sort((a, b) => a - b);
  console.log(`shards: ${sizes.length} + meta ${kb(Buffer.byteLength(files["meta.json"]))}; total ${kb(sizes.reduce((a, b) => a + b, 0))}; ` +
    `per shard median ${sizes[Math.floor(sizes.length / 2)]} B, p95 ${kb(sizes[Math.floor(sizes.length * 0.95)])}, max ${kb(sizes[sizes.length - 1])}`);
  if (check) {
    if (!prev || JSON.stringify(prev) + "\n" !== text) { console.error(`DIFFERENT: ${src.out} does not match a fresh build`); process.exit(1); }
    const have = existsSync(sdir) ? readdirSync(sdir).filter(n => n.endsWith(".json")).sort() : [];
    const want = Object.keys(files).sort();
    const bad = want.filter(n => !existsSync(join(sdir, n)) || readFileSync(join(sdir, n), "utf8") !== files[n]).concat(have.filter(n => !(n in files)));
    if (bad.length) { console.error(`DIFFERENT: vendor/pc-drugs/tmt/ (${bad.length} file(s), e.g. ${bad.slice(0, 3).join(", ")})`); process.exit(1); }
    console.log(`OK: ${src.out} and ${want.length} shard files match a fresh build`);
    return;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  if (existsSync(sdir)) for (const n of readdirSync(sdir)) if (n.endsWith(".json")) rmSync(join(sdir, n));
  mkdirSync(sdir, { recursive: true });
  for (const [n, v] of Object.entries(files)) writeFileSync(join(sdir, n), v);
  console.log(`wrote ${src.out} + vendor/pc-drugs/tmt/ (${Object.keys(files).length} files)`);
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) main().catch(e => { console.error(String(e.message || e)); process.exit(1); });
