#!/usr/bin/env node
// tools/pc-photo-labels.mjs — Product Check P1: validate the photo labelling sheet (design §9.1,
// docs/product-check/PHOTO-SET-PROTOCOL.md) before any detector is run on the owner's photos.
//
//   node tools/pc-photo-labels.mjs SHEET.csv            check columns, required fields, dates, registration-number formats,
//                                                      privacy flags; print counts per stratum against the §9.1 minimums
//   node tools/pc-photo-labels.mjs SHEET.csv --json     machine-readable report
//
// The filled sheet describes real products and lives OUTSIDE the repo (~/LENSIQ-field/products/labels.csv). The tool
// refuses to read a sheet inside the repo, except the committed template docs/product-check/photo-labels-template.csv
// (fake example rows only). Exit 0 = valid, 1 = problems found, 2 = usage / refused.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { insideRepo, REPO } from "./pc-texts.mjs";

export const TEMPLATE = resolve(REPO, "docs", "product-check", "photo-labels-template.csv");

/** Columns in order. `req` = must be non-empty on every row. */
export const COLUMNS = [
  { name: "photo_id", req: true }, { name: "file_name", req: true }, { name: "taken_date", req: true },
  { name: "taken_by", req: true }, { name: "stratum", req: true }, { name: "country_of_sale", req: true },
  { name: "country_of_origin" }, { name: "product_type", req: true }, { name: "brand" }, { name: "product_name" },
  { name: "active_ingredients_inn" }, { name: "strength" }, { name: "dosage_form" },
  { name: "registration_number" }, { name: "registration_country" }, { name: "registration_kind" },
  { name: "manufacturer" }, { name: "lot" }, { name: "expiry" }, { name: "claims_on_pack" },
  { name: "registration_status", req: true }, { name: "status_checked_date" }, { name: "status_source_url" },
  { name: "on_warning_list", req: true }, { name: "warning_source_url" }, { name: "warning_date" },
  { name: "overclaim_on_pack", req: true }, { name: "expected_rule_ids" }, { name: "conditions" },
  { name: "face_in_frame", req: true }, { name: "patient_label_in_frame", req: true },
  { name: "labeller_1", req: true }, { name: "labeller_2" }, { name: "adjudicated_by" }, { name: "notes" },
];

/** §9.1 strata and minimum photo counts (illegal / warned products are their own stratum; over-claim may overlap). */
export const STRATA = {
  "th-drug": 40, "th-supplement": 40, "th-cosmetic": 30, "th-food": 30,
  "foreign-cn": 15, "foreign-jp": 15, "foreign-kr": 15, "foreign-my-sg": 15, "foreign-us": 15, "foreign-eu": 15,
  "illegal-warned": 75,
};
export const OVERCLAIM_MIN = 40;
export const PRODUCT_TYPES = ["drug", "supplement", "cosmetic", "food", "herbal", "device", "other"];
export const REG_KINDS = ["drug", "food", "cosmetic", "herbal", "device", "advert", "other"];
export const REG_STATUS = ["active", "cancelled", "expired", "not_found", "not_checked", "no_number"];
export const CONDITIONS = ["angle", "glare", "curved", "small_print", "low_light", "night", "indoor", "outdoor", "blur", "partial", "reflective", "handheld"];
const YES_NO_UNKNOWN = ["yes", "no", "unknown"];
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Registration-number shapes by country and kind. A miss is an error for Thailand (the formats are known) and a warning
 * elsewhere. Sources: Thai FDA number formats as used today in lensiq-med.js; others from the regulators' public pages
 * [formats outside Thailand are SECONDARY and checked as warnings only].
 */
export const REG_FORMATS = {
  TH: {
    food: [/^\d{2}-\d-\d{5}-\d-\d{4}$/, /^\d{13}$/],
    cosmetic: [/^\d{2}-\d-\d{10}$/, /^\d{13}$/],
    drug: [/^(?:[12]\s?[A-Z]|[GK])\s?\d{1,5}\/\d{2}(?:\s?\([A-Z]{1,3}\))?$/], // same shape as LQMed.parseThaiReg
    herbal: [/^(?:[12]\s?)?[GK]\s?\d{1,5}\/\d{2}$/, /^\d{2}-\d-\d{5}-\d-\d{4}$/, /^\d{13}$/], // Herbal Act numbers: format UNVERIFIED
    advert: [/^(?:ฆท|ฆอ|ฆพ|ฆสมพ)\.?\s?[A-Z]{0,2}\d{1,5}\/\d{2,4}[A-Z]?$/],
  },
  MY: { any: [/^MAL\d{8}[A-Z]{0,3}$/, /^NOT\d{6,9}K$/] },
  SG: { any: [/^SIN\d{5}P$/] },
  US: { drug: [/^\d{4}-\d{4}-\d{2}$/, /^\d{5}-\d{3}-\d{2}$/, /^\d{5}-\d{4}-\d$/, /^\d{11}$/] },
  CN: { any: [/^国药准字[HZSJBTF]\d{8}$/, /^国食健(?:注|字)?[GJ]\d{8}$/, /^国妆特字G?\d{8}$/] },
  EU: { drug: [/^EU\/\d\/\d{2}\/\d{3,4}\/\d{3}$/] },
  CA: { any: [/^\d{8}$/] },
  AU: { any: [/^AUST\s?[LR]\s?\d{4,6}$/] },
};

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF / LF). @param {string} text */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim() !== ""));
}

/** Check one registration number; returns null (ok), "error: …" or "warning: …". */
export function regNumberProblem(number, country, kind) {
  if (!number) return null;
  const n = number.trim();
  const byCountry = REG_FORMATS[(country || "").toUpperCase()];
  if (!byCountry) return null; // no known format (JP, KR, …): free text
  const pats = byCountry[kind] || byCountry.any;
  if (!pats) return null;
  if (pats.some(p => p.test(n))) return null;
  // errors only where the format is known (Thai food / cosmetic / drug / advert); herbal and other countries: warnings
  const sev = (country || "").toUpperCase() === "TH" && kind !== "herbal" ? "error" : "warning";
  return `${sev}: registration_number "${n}" does not match the ${country.toUpperCase()} ${kind || "any"} format`;
}

/** Validate a parsed sheet. @param {string[][]} rows */
export function validateSheet(rows) {
  const errors = [], warnings = [];
  if (!rows.length) return { errors: ["empty sheet"], warnings, counts: {} };
  const header = rows[0].map(h => h.trim());
  const want = COLUMNS.map(c => c.name);
  const missing = want.filter(c => !header.includes(c));
  if (missing.length) errors.push(`missing columns: ${missing.join(", ")}`);
  const extra = header.filter(h => !want.includes(h));
  if (extra.length) warnings.push(`unknown columns ignored: ${extra.join(", ")}`);
  if (!missing.length && header.join(",") !== want.join(",")) warnings.push("columns are not in the template order");
  const ix = Object.fromEntries(header.map((h, i) => [h, i]));
  const ids = new Set(), files = new Set();
  const counts = Object.fromEntries(Object.keys(STRATA).map(s => [s, 0]));
  let overclaim = 0;
  rows.slice(1).forEach((r, k) => {
    const line = k + 2;
    const get = (c) => (ix[c] === undefined ? "" : (r[ix[c]] ?? "").trim());
    const err = (m) => errors.push(`row ${line}: ${m}`), warn = (m) => warnings.push(`row ${line}: ${m}`);
    if (r.length !== header.length) err(`has ${r.length} fields, header has ${header.length}`);
    for (const c of COLUMNS) if (c.req && ix[c.name] !== undefined && !get(c.name)) err(`${c.name} is required`);
    const id = get("photo_id");
    if (id && !/^P\d{4}$/.test(id)) err(`photo_id "${id}" must look like P0001`);
    if (id && ids.has(id)) err(`duplicate photo_id ${id}`);
    ids.add(id);
    const file = get("file_name"), stratum = get("stratum");
    if (stratum && !(stratum in STRATA)) err(`stratum "${stratum}" must be one of ${Object.keys(STRATA).join(", ")}`);
    else if (stratum) counts[stratum]++;
    if (file && !/^[a-z]{2,7}(?:-[a-z]{2,10})?-\d{4}-(?:front|back|side|label|leaflet|blister|barcode|detail)\d?\.(?:jpe?g|heic|png)$/.test(file)) {
      err(`file_name "${file}" must look like th-drug-0001-front.jpg (stratum-number-shot.ext)`);
    } else if (file && stratum && !file.startsWith(stratum + "-")) err(`file_name "${file}" does not start with its stratum "${stratum}-"`);
    if (file && files.has(file)) err(`duplicate file_name ${file}`);
    files.add(file);
    for (const c of ["taken_date", "status_checked_date", "warning_date"]) if (get(c) && !DATE.test(get(c))) err(`${c} "${get(c)}" must be YYYY-MM-DD`);
    if (get("expiry") && !DATE.test(get("expiry")) && !MONTH.test(get("expiry"))) err(`expiry "${get("expiry")}" must be YYYY-MM or YYYY-MM-DD as printed`);
    if (get("product_type") && !PRODUCT_TYPES.includes(get("product_type"))) err(`product_type must be one of ${PRODUCT_TYPES.join("/")}`);
    if (get("registration_kind") && !REG_KINDS.includes(get("registration_kind"))) err(`registration_kind must be one of ${REG_KINDS.join("/")}`);
    if (get("registration_status") && !REG_STATUS.includes(get("registration_status"))) err(`registration_status must be one of ${REG_STATUS.join("/")}`);
    for (const c of ["country_of_sale", "country_of_origin", "registration_country"]) {
      if (get(c) && !/^[A-Z]{2}$/.test(get(c))) err(`${c} "${get(c)}" must be an ISO 3166 two-letter code (TH, CN, …; EU for the EU register)`);
    }
    if (get("on_warning_list") && !YES_NO_UNKNOWN.includes(get("on_warning_list"))) err("on_warning_list must be yes / no / unknown");
    if (get("overclaim_on_pack") && !YES_NO_UNKNOWN.includes(get("overclaim_on_pack"))) err("overclaim_on_pack must be yes / no / unknown");
    if (get("overclaim_on_pack") === "yes") overclaim++;
    if (get("on_warning_list") === "yes" && !/^https?:\/\//.test(get("warning_source_url"))) err("on_warning_list = yes needs warning_source_url");
    if (stratum === "illegal-warned" && get("on_warning_list") !== "yes") err("stratum illegal-warned needs on_warning_list = yes with its source");
    if (["active", "cancelled", "expired", "not_found"].includes(get("registration_status")) && !get("status_checked_date")) err("a looked-up registration_status needs status_checked_date");
    if (get("registration_number") && get("registration_status") === "no_number") err("registration_status no_number but a registration_number is given");
    const reg = regNumberProblem(get("registration_number"), get("registration_country"), get("registration_kind"));
    if (reg) (reg.startsWith("error") ? err : warn)(reg.replace(/^\w+: /, ""));
    if (get("registration_number") && !get("registration_country")) err("registration_number needs registration_country");
    if (get("expected_rule_ids") && !get("expected_rule_ids").split(/\s+/).every(x => /^[DFHC]\d{2}$/.test(x))) err("expected_rule_ids must be space-separated ids like F06 F13");
    for (const t of get("conditions").split(";").map(s => s.trim()).filter(Boolean)) {
      if (!CONDITIONS.includes(t)) err(`unknown condition tag "${t}" (allowed: ${CONDITIONS.join(", ")})`);
    }
    // privacy: no people, no patient labels (design §9.1, CLAUDE.md)
    if (get("face_in_frame") && get("face_in_frame") !== "no") err("face_in_frame must be no: retake the photo without any person");
    if (get("patient_label_in_frame") && get("patient_label_in_frame") !== "no") err("patient_label_in_frame must be no: retake without the dispensing label (patient name)");
    if (get("labeller_2") && get("labeller_2") === get("labeller_1")) err("labeller_2 must be a different person from labeller_1");
    if (get("taken_by") && /\s/.test(get("taken_by")) && get("taken_by").split(/\s+/).length > 1) warn("taken_by: use a role or initials, not a full name");
  });
  return { errors, warnings, counts, overclaim, total: rows.length - 1 };
}

/** Counts vs the §9.1 minimums. */
export function shortfall(counts, overclaim) {
  const out = Object.entries(STRATA).filter(([s, min]) => (counts[s] || 0) < min).map(([s, min]) => `${s}: ${counts[s] || 0} / ${min}`);
  if ((overclaim || 0) < OVERCLAIM_MIN) out.push(`overclaim_on_pack=yes: ${overclaim || 0} / ${OVERCLAIM_MIN}`);
  return out;
}

/** Refuse sheets inside the repo, except the committed template. */
export function allowedPath(p, repo = REPO) {
  if (!insideRepo(p, repo)) return true;
  return resolve(p) === resolve(repo, "docs", "product-check", "photo-labels-template.csv");
}

function main(argv) {
  const args = argv.slice(2);
  const file = args.find(a => !a.startsWith("--"));
  if (!file) { console.error("usage: node tools/pc-photo-labels.mjs SHEET.csv [--json]"); return 2; }
  if (!allowedPath(file)) { console.error(`refusing to read ${file}: the filled sheet must stay outside the repo (~/LENSIQ-field/products/labels.csv); only the template is allowed`); return 2; }
  const res = validateSheet(parseCsv(readFileSync(file, "utf8").replace(/^﻿/, "")));
  const short = shortfall(res.counts, res.overclaim);
  if (args.includes("--json")) console.log(JSON.stringify({ file, ...res, shortfall: short }, null, 2));
  else {
    console.log(`${file}: ${res.total ?? 0} photos, ${res.errors.length} errors, ${res.warnings.length} warnings`);
    for (const [s, n] of Object.entries(res.counts)) console.log(`  ${s.padEnd(16)} ${String(n).padStart(4)} / ${STRATA[s]}`);
    console.log(`  over-claim on pack ${res.overclaim ?? 0} / ${OVERCLAIM_MIN} (may overlap)`);
    if (short.length) console.log(`  below the §9.1 minimums: ${short.length} strata`);
    for (const e of res.errors.slice(0, 50)) console.log("  ERROR " + e);
    for (const w of res.warnings.slice(0, 30)) console.log("  warn  " + w);
  }
  return res.errors.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv); } catch (e) { console.error(e.message); process.exitCode = 2; }
}
