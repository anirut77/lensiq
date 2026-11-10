#!/usr/bin/env node
// tools/pc-hc-build.mjs — Product Check P4 (owner decision 2026-11-10, review S5): Health Canada recalls as small static
// shards, so no request ever parses the ~16 MB open-data file (works on the Workers free plan and on *.workers.dev; the
// search runs on the device from these files, nothing is sent to anyone).
//
//   node tools/pc-hc-build.mjs                    download HCRSAMOpenData.json if missing, build vendor/pc-recalls/hc/
//   node tools/pc-hc-build.mjs --force-download   re-download (run this on each new Health Canada release)
//   node tools/pc-hc-build.mjs --check            rebuild in memory from the downloaded file and compare every file
//
// Output: meta.json (credit, licence, data date, counts), i/<n>.json item chunks (newest first: NID, title, product, issue,
// last-updated date, official URL, organisation; the long "What you should do" text is dropped), t/<xx>.json word postings
// for words starting with <xx>. Items: recalls updated in the 3 years before the newest item, official recalls-rappels links only.
// Licence: Open Government Licence – Canada (tools/pc-drug-sources.json "hc-recalls"; the guard refuses it otherwise).
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { REPO, download, fieldDir, requireAllowed, sha256 } from "./lib/pc-drug-source.mjs";

const L = createRequire(import.meta.url)("../lensiq-pc-lookup.js");
export const SCHEMA = "lensiq-pc-hc-recalls/1";
export const CHUNK = 100;
export const CREDIT = {
  en: "Contains information licensed under the Open Government Licence – Canada (https://open.canada.ca/en/open-government-licence-canada). " +
    "Source: Health Canada, Recalls and Safety Alerts. Modified: fields selected, split into an index. Health Canada does not endorse LENSIQ.",
  th: "มีข้อมูลภายใต้สัญญาอนุญาต Open Government Licence – Canada ที่มา: Health Canada (รายการเรียกคืนและประกาศเตือน) ดัดแปลง: เลือกบางช่องและแบ่งเป็นดัชนี",
  zh: "包含根据加拿大开放政府许可 (Open Government Licence – Canada) 授权的信息。来源：加拿大卫生部召回和安全警示。已改编：选取部分字段并拆分为索引。"
};
const short = (s, n) => { const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const isObj = x => !!x && typeof x === "object" && !Array.isArray(x);

/** A truncated or partial download never overwrites the shards (re-review 8): the file had 34,361 items on 2026-11-10. */
export const MIN_ITEMS = 10000;
/** Share of items that must carry NID, URL and Title, and share of the DATED items whose "Last updated" must be a valid date.
 *  Items with an EMPTY date are skipped and counted (the 2026-11-10 file has 2,717 undated Transport Canada vehicle recalls). */
export const MIN_COMPLETE = 0.99;
const validDay = s => { const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); if (!d) return ""; const t = Date.parse(`${d[1]}-${d[2]}-${d[3]}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === `${d[1]}-${d[2]}-${d[3]}` ? `${d[1]}-${d[2]}-${d[3]}` : ""; };
/**
 * Open-data body -> {"meta.json": text, "i/0.json": text, "t/ab.json": text, ...}. Pure; unit-tested. The body must be the
 * file's shape: a JSON array, or the array-like object the file actually is ({"0": {...}, "1": {...}, ...} with consecutive
 * keys). Refuses (throws) on anything else, on fewer than minItems items, when under 99 % of items carry NID / URL / Title,
 * or when under 99 % of the non-empty dates are valid calendar dates.
 * @param {any} body @param {any} src @param {{sha256: string, minItems?: number}} m
 */
export function hcFiles(body, src, m) {
  let list = null;
  if (Array.isArray(body)) list = body;
  else if (isObj(body)) { const k = Object.keys(body); if (k.length && k.every((x, i) => x === String(i))) list = k.map(x => body[x]); }
  if (!list) throw new Error("not the Health Canada open-data shape (a JSON array of items, or the file's numbered object)");
  const min = m.minItems == null ? MIN_ITEMS : m.minItems;
  if (list.length < min) throw new Error(`refused: only ${list.length} items (minimum ${min}); a truncated download never replaces the shards`);
  const ident = list.filter(x => isObj(x) && x.NID && x.URL && x.Title);
  if (ident.length < MIN_COMPLETE * list.length) throw new Error(`refused: only ${ident.length} of ${list.length} items have NID, URL and Title (need ${MIN_COMPLETE * 100} %)`);
  const withDate = ident.filter(x => String(x["Last updated"] || "").trim());
  const complete = withDate.filter(x => validDay(x["Last updated"]));
  if (!withDate.length || complete.length < MIN_COMPLETE * withDate.length) {
    throw new Error(`refused: only ${complete.length} of ${withDate.length} dated items have a valid "Last updated" date (need ${MIN_COMPLETE * 100} %)`);
  }
  const asOf = complete.reduce((mx, x) => (validDay(x["Last updated"]) > mx ? validDay(x["Last updated"]) : mx), "");
  if (!asOf) throw new Error("refused: no valid date in the file");
  const cut = new Date(Date.parse(asOf + "T00:00:00Z") - 3 * 365 * 86400e3).toISOString().slice(0, 10);
  const dated = complete;
  const rows = dated.filter(x => validDay(x["Last updated"]) >= cut && /^https:\/\/recalls-rappels\.canada\.ca\//.test(String(x.URL || "")))
    .map(x => [String(x.NID || ""), short(x.Title, 200), short(x.Product, 120), short(x.Issue, 60), validDay(x["Last updated"]), String(x.URL), short(x.Organization, 40)]);
  const { chunks, tokens } = L.buildHcShards(rows, CHUNK);
  const prefixes = [...tokens.keys()].sort();
  const meta = { schema: SCHEMA, source: { id: src.id, title: src.title, publisher: src.publisher, url: src.dataset_url, licence: src.licence, licence_url: src.licence_url,
    input_sha256: m.sha256, input_items: list.length, undated_skipped: ident.length - withDate.length, items: rows.length, as_of: asOf, window_from: cut },
    credit: CREDIT, chunk: CHUNK, chunks: chunks.length, prefixes,
    note: "Derived index of Health Canada recalls. A recall found by name is a possible match to compare with the pack; not finding one says nothing about safety." };
  /** @type {Record<string, string>} */ const files = { "meta.json": JSON.stringify(meta) + "\n" };
  chunks.forEach((c, n) => { files[`i/${n}.json`] = JSON.stringify(c) + "\n"; });
  for (const p of prefixes) files[`t/${p}.json`] = JSON.stringify(tokens.get(p)) + "\n";
  return files;
}

const listDir = d => [...(existsSync(join(d, "i")) ? readdirSync(join(d, "i")).map(n => "i/" + n) : []), ...(existsSync(join(d, "t")) ? readdirSync(join(d, "t")).map(n => "t/" + n) : []),
  ...(existsSync(join(d, "meta.json")) ? ["meta.json"] : [])].sort();

async function main() {
  const a = process.argv.slice(2);
  const src = requireAllowed("hc-recalls", "recalls");
  const check = a.includes("--check");
  if (!check) await download(src, { force: a.includes("--force-download"), log: s => console.log(s) });
  const path = join(fieldDir(src), src.master);
  if (!existsSync(path)) throw new Error(`missing ${path}: run without --check to download it`);
  const buf = readFileSync(path);
  const files = hcFiles(JSON.parse(buf.toString("utf8")), src, { sha256: sha256(buf) });
  const out = join(REPO, src.out), meta = JSON.parse(files["meta.json"]);
  const sizes = Object.entries(files).filter(([n]) => n !== "meta.json").map(([n, v]) => [n, Buffer.byteLength(v)]);
  const kb = n => (n / 1024).toFixed(1) + " KB";
  const t = sizes.filter(([n]) => n.startsWith("t/")).map(x => x[1]).sort((x, y) => x - y), i = sizes.filter(([n]) => n.startsWith("i/")).map(x => x[1]);
  console.log(`hc-recalls: ${meta.source.input_items} items in the file -> ${meta.source.items} (updated ${meta.source.window_from} .. ${meta.source.as_of}); ` +
    `${i.length} item chunks (${kb(i.reduce((x, y) => x + y, 0))}), ${t.length} word shards (${kb(t.reduce((x, y) => x + y, 0))}; median ${t[Math.floor(t.length / 2)]} B, ` +
    `max ${kb(t[t.length - 1])}), meta ${kb(Buffer.byteLength(files["meta.json"]))}`);
  if (check) {
    const have = listDir(out), want = Object.keys(files).sort();
    const bad = want.filter(n => !existsSync(join(out, n)) || readFileSync(join(out, n), "utf8") !== files[n]).concat(have.filter(n => !(n in files)));
    if (bad.length) { console.error(`DIFFERENT: ${src.out} (${bad.length} file(s), e.g. ${bad.slice(0, 3).join(", ")})`); process.exit(1); }
    console.log(`OK: ${src.out} (${want.length} files) matches a fresh build`);
    return;
  }
  for (const n of listDir(out)) rmSync(join(out, n));
  mkdirSync(join(out, "i"), { recursive: true }); mkdirSync(join(out, "t"), { recursive: true });
  for (const [n, v] of Object.entries(files)) writeFileSync(join(out, n), v);
  console.log(`wrote ${src.out} (${Object.keys(files).length} files)`);
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) main().catch(e => { console.error(String(e.message || e)); process.exit(1); });
