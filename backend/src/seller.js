// @ts-check
// backend/src/seller.js — "ข้อมูลกิจการ" seller (business) details and the quotation / invoice / receipt documents generated
// from them (owner order 2026-11-18, "needed for selling"). Routes in index.js, OWNER ONLY (read included):
//
//   GET    /admin/api/seller                    masked view: tax ID, bank account number and phone as the last 4 digits
//   PUT    /admin/api/seller                    {field: value | "" (clear), ..., password, totp}  step-up: owner 2-step
//                                               verification on + password + a fresh 6-digit code IN the request
//   GET    /admin/api/seller/logo               the stored logo (image bytes)
//   PUT    /admin/api/seller/logo               {mime, data (base64), password, totp}             same step-up
//   DELETE /admin/api/seller/logo               {password, totp}                                  same step-up
//   GET    /admin/api/seller/prices             the approved price lines (price-list.js, excl. 7 % VAT)
//   GET    /admin/api/seller/docs               list
//   POST   /admin/api/seller/docs               {doc_type, buyer, lines: [{id, qty}], valid_days?, due_days?, paid_on?, ref?, note?}
//   GET    /admin/api/seller/docs/:id[?format=json]   print-ready A4 HTML (the browser saves it as PDF) / data
//   POST   /admin/api/seller/docs/:id/issue     refused (409 seller_incomplete) while required details are missing, before
//                                               any step-up; then re-auth (password + code, or the 5-min sudo window);
//                                               takes the next number in one D1 batch and freezes the seller details
//   POST   /admin/api/seller/docs/:id/void      re-auth; the number stays used (never reused)
//
// Privacy rules (owner order): the details live in D1 only (never in the repository, which is public); this module never
// writes a log line and imports nothing that talks to AI, mail, LINE or analytics; error messages name the field, never
// the value; the audit (index.js) records who / when / which fields only. Logo: PNG / JPEG / WebP checked by their bytes,
// at most LOGO_MAX_BYTES, kept in D1 (this Cloudflare account has no R2 binding today; see tryon-store.js).
import { baht, thaiDate } from "./receipt.js";
import { PRICE_LINES, lineAmount, priceLine } from "./price-list.js";
import { fromB64, randomId, randomToken, sha256Hex, toB64 } from "./crypto.js";
import { HttpError, now } from "./util.js";
import { DOC_FONT_CSS, DOC_FONT_FAMILY } from "./doc-font.js";

export const LOGO_MAX_BYTES = 200000;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const DOC_TYPES = ["quotation", "invoice", "receipt"];
const DOC_CODE = { quotation: "QT", invoice: "IV", receipt: "RC" };

const CTRL = /[\u0000-\u0008\u000b-\u001f\u007f]/;
const digits = v => String(v).replace(/[\s-]/g, "");
const bad = (field, code = "bad_field") => new HttpError(400, `invalid value for ${field} (${code})`, { code, field });

/** text field: trimmed, at most `max`, no control characters (address may have line breaks) */
const text = (max, multi = false) => (v, f) => {
  if (typeof v !== "string") throw bad(f);
  const s = v.trim();
  if (s.length > max || (multi ? CTRL.test(s) : /[\u0000-\u001f\u007f]/.test(s))) throw bad(f);
  return s;
};
const pattern = (re, norm = x => x) => (v, f) => {
  if (typeof v !== "string") throw bad(f);
  const s = norm(v.trim());
  if (s && !re.test(s)) throw bad(f);
  return s;
};

/** column -> validator. "" clears a text field. */
const FIELDS = {
  legal_name: text(160),
  tax_id: pattern(/^\d{13}$/, digits),
  branch: text(60),
  address: text(300, true),
  vat_registered: (v, f) => { if (typeof v !== "boolean") throw bad(f); return v ? 1 : 0; },
  // approved prices are excl. 7 % VAT: a VAT-registered seller charges 7 % (another rate needs an owner decision first)
  vat_rate_bp: (v, f) => { if (v !== 700) throw bad(f); return v; },
  bank_name: text(80),
  bank_account_name: text(120),
  bank_account_no: pattern(/^\d{6,20}$/, digits),
  contact_phone: pattern(/^\+?\d{9,15}$/, digits),
  contact_email: pattern(/^[^\s@]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/),
  contact_line: pattern(/^@?[A-Za-z0-9._-]{1,40}$/),
  doc_prefix: pattern(/^[A-Z0-9][A-Z0-9-]{0,9}$/, s => s.toUpperCase())
};
export const SELLER_FIELDS = Object.keys(FIELDS);
const TEXT_KEYS = SELLER_FIELDS.filter(k => k !== "vat_registered" && k !== "vat_rate_bp");
export const REQUIRED = ["legal_name", "tax_id", "address", "vat_status", "bank_name", "bank_account_name", "bank_account_no", "contact", "doc_prefix"];

/** Field labels in Thai / English / Chinese (documents and the missing-data block). */
export const LABELS = {
  legal_name: ["ชื่อกิจการ", "Business name", "商家名称"], tax_id: ["เลขประจำตัวผู้เสียภาษี", "Tax ID", "纳税人识别号"],
  branch: ["สาขา", "Branch", "分支"], address: ["ที่อยู่", "Address", "地址"], vat_status: ["สถานะภาษีมูลค่าเพิ่ม", "VAT status", "增值税状态"],
  bank_name: ["ธนาคาร", "Bank", "银行"], bank_account_name: ["ชื่อบัญชี", "Account name", "账户名"], bank_account_no: ["เลขที่บัญชี", "Account number", "账号"],
  contact: ["ติดต่อ", "Contact", "联系"], doc_prefix: ["อักษรนำหน้าเลขที่เอกสาร", "Document number prefix", "单据编号前缀"],
  contact_phone: ["โทรศัพท์", "Phone", "电话"], contact_email: ["อีเมล", "E-mail", "电子邮件"], contact_line: ["LINE", "LINE", "LINE"]
};

const filled = v => v != null && String(v).trim() !== "";

/** @param {any} p seller row (or frozen snapshot) */
export function missingFields(p) {
  const m = [];
  for (const k of ["legal_name", "tax_id", "address"]) if (!filled(p[k])) m.push(k);
  if (p.vat_registered == null) m.push("vat_status");
  for (const k of ["bank_name", "bank_account_name", "bank_account_no"]) if (!filled(p[k])) m.push(k);
  if (!filled(p.contact_phone) && !filled(p.contact_email) && !filled(p.contact_line)) m.push("contact");
  if (!filled(p.doc_prefix)) m.push("doc_prefix");
  return m;
}

const mask = v => (filled(v) ? "•".repeat(Math.max(4, String(v).length - 4)) + String(v).slice(-4) : null);

/** The single seller row exists (re-created if it was removed by hand), so an update answered 200 is really stored. @param {any} db */
const ensureRow = db => db.prepare("INSERT INTO seller_profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING").run();

/** @param {any} db */
async function row(db) {
  const r = await db.prepare("SELECT * FROM seller_profile WHERE id = 1").first();
  return r || { id: 1 };
}

/** The owner's view: full text for name / address / bank / contacts, the last 4 digits for tax ID, bank number and phone. */
export function maskedView(p) {
  const set = {};
  for (const k of TEXT_KEYS) set[k] = filled(p[k]);
  set.vat_registered = p.vat_registered != null;
  const missing = missingFields(p);
  return {
    profile: {
      legal_name: p.legal_name || null, tax_id_masked: mask(p.tax_id), branch: p.branch || null, address: p.address || null,
      vat_registered: p.vat_registered == null ? null : !!p.vat_registered, vat_rate_bp: p.vat_rate_bp == null ? null : Number(p.vat_rate_bp),
      bank_name: p.bank_name || null, bank_account_name: p.bank_account_name || null, bank_account_no_masked: mask(p.bank_account_no),
      contact_phone_masked: mask(p.contact_phone), contact_email: p.contact_email || null, contact_line: p.contact_line || null,
      doc_prefix: p.doc_prefix || null, updated_at: p.updated_at || null
    },
    set, missing, complete: missing.length === 0, required: REQUIRED,
    logo: { set: !!p.logo_data, mime: p.logo_data ? p.logo_mime : null, bytes: p.logo_data ? Number(p.logo_bytes) : 0 }
  };
}

/** GET /seller @param {any} env */
export async function getSeller(env) { return maskedView(await row(env.DB)); }

/**
 * Validates a PUT body (without password / totp). Returns {cols: {column: value}, fields: [names]}. Unknown keys are refused
 * without echoing them. @param {any} b
 */
export function cleanUpdate(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new HttpError(400, "invalid request body", { code: "bad_body" });
  const cols = {};
  for (const [k, v] of Object.entries(b)) {
    if (!Object.prototype.hasOwnProperty.call(FIELDS, k)) throw new HttpError(400, "unknown field in the request (unknown_field)", { code: "unknown_field" });
    if (v === null || v === "") { cols[k] = null; continue; }
    cols[k] = FIELDS[k](v, k);
    if (cols[k] === "") cols[k] = null;
  }
  if (cols.vat_registered === 1 && !("vat_rate_bp" in cols)) cols.vat_rate_bp_default = 700;
  const fields = Object.keys(cols).filter(k => k !== "vat_rate_bp_default");
  if (!fields.length) throw new HttpError(400, "nothing to change", { code: "empty" });
  return { cols, fields };
}

/** Applies a cleaned update. @param {any} env @param {{cols: Record<string, any>}} u */
export async function applyUpdate(env, u) {
  const sets = [], vals = [];
  for (const [k, v] of Object.entries(u.cols)) {
    if (k === "vat_rate_bp_default") { sets.push("vat_rate_bp = COALESCE(vat_rate_bp, ?" + (vals.length + 1) + ")"); vals.push(v); continue; }
    sets.push(`${k} = ?${vals.length + 1}`); vals.push(v);
  }
  sets.push(`updated_at = ?${vals.length + 1}`); vals.push(now());
  await ensureRow(env.DB);
  await env.DB.prepare(`UPDATE seller_profile SET ${sets.join(", ")} WHERE id = 1`).bind(...vals).run();
  return getSeller(env);
}

// ---- logo -------------------------------------------------------------------------------------------------------------
/** @param {Uint8Array} b */
function sniff(b) {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
/** Request body limit of PUT /seller/logo (base64 of the cap + room for the JSON and the step-up fields). */
export const LOGO_BODY_MAX = Math.ceil(LOGO_MAX_BYTES * 4 / 3) + 8192;

/** Checks {mime, data} (no step-up fields). Returns {mime, bytes}. @param {any} b */
export function checkLogo(b) {
  const keys = Object.keys(b || {});
  if (!b || typeof b !== "object" || keys.some(k => k !== "mime" && k !== "data")) throw new HttpError(400, "invalid request body", { code: "bad_body" });
  if (!LOGO_TYPES.includes(b.mime)) throw new HttpError(415, "logo must be PNG, JPEG or WebP (logo_type)", { code: "logo_type" });
  let bytes;
  try { bytes = fromB64(String(b.data || "")); } catch { throw new HttpError(400, "logo data is not base64", { code: "bad_body" }); }
  if (bytes.length > LOGO_MAX_BYTES) throw new HttpError(413, `logo larger than ${LOGO_MAX_BYTES} bytes (logo_too_large)`, { code: "logo_too_large" });
  if (!bytes.length || sniff(bytes) !== b.mime) throw new HttpError(415, "logo content is not the declared PNG / JPEG / WebP (logo_type)", { code: "logo_type" });
  return { mime: b.mime, bytes };
}
/** @param {any} env @param {{mime: string, bytes: Uint8Array}} l */
export async function setLogo(env, l) {
  await ensureRow(env.DB);
  await env.DB.prepare("UPDATE seller_profile SET logo_mime = ?1, logo_data = ?2, logo_bytes = ?3, updated_at = ?4 WHERE id = 1").bind(l.mime, toB64(l.bytes), l.bytes.length, now()).run();
  return getSeller(env);
}
/** @param {any} env */
export async function removeLogo(env) {
  await ensureRow(env.DB);
  await env.DB.prepare("UPDATE seller_profile SET logo_mime = NULL, logo_data = NULL, logo_bytes = NULL, updated_at = ?1 WHERE id = 1").bind(now()).run();
  return getSeller(env);
}
/** @param {any} env @returns {Promise<Response>} */
export async function logoResponse(env) {
  const p = await row(env.DB);
  if (!p.logo_data) throw new HttpError(404, "no logo");
  return new Response(fromB64(p.logo_data), { headers: { "Content-Type": p.logo_mime, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox", "Referrer-Policy": "no-referrer" } });
}

// ---- documents ----------------------------------------------------------------------------------------------------------
/** source_row = the row of docs/PRICING-RESEARCH.md §3 that approved the price (shown so the owner can check it) */
export const priceList = () => ({ lines: PRICE_LINES.map(l => ({ ...l })), vat_note: "excl. 7% VAT" });

const BUYER_KEYS = { name: text(160), tax_id: pattern(/^\d{13}$/, digits), address: text(300, true), branch: text(60) };
const EXTRA_KEYS = {
  valid_days: (v, f) => { if (!Number.isInteger(v) || v < 1 || v > 180) throw bad(f); return v; },
  due_days: (v, f) => { if (!Number.isInteger(v) || v < 0 || v > 180) throw bad(f); return v; },
  paid_on: (v, f) => {
    const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
    const t = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
    if (!m || +m[1] < 2020 || +m[1] > 2100 || new Date(t).toISOString().slice(0, 10) !== v) throw bad(f);
    return v;
  }, ref: text(80), note: text(300, true)
};

/** POST /seller/docs @param {any} env @param {any} b */
export async function createDoc(env, b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new HttpError(400, "invalid request body", { code: "bad_body" });
  const extra = {};
  for (const [k, v] of Object.entries(b)) {
    if (k === "doc_type" || k === "buyer" || k === "lines") continue;
    if (!Object.prototype.hasOwnProperty.call(EXTRA_KEYS, k)) throw new HttpError(400, "unknown field in the request (unknown_field)", { code: "unknown_field" });
    if (v === null || v === "") continue;
    extra[k] = EXTRA_KEYS[k](v, k);
  }
  if (!DOC_TYPES.includes(b.doc_type)) throw bad("doc_type");
  const by = b.buyer;
  if (!by || typeof by !== "object" || Array.isArray(by)) throw bad("buyer");
  const buyer = {};
  for (const [k, v] of Object.entries(by)) {
    if (!Object.prototype.hasOwnProperty.call(BUYER_KEYS, k)) throw new HttpError(400, "unknown field in the request (unknown_field)", { code: "unknown_field" });
    if (v === null || v === "") continue;
    const c = BUYER_KEYS[k](v, "buyer." + k);
    if (c) buyer[k] = c;
  }
  if (!buyer.name) throw bad("buyer.name");
  if (!Array.isArray(b.lines) || !b.lines.length || b.lines.length > 20) throw bad("lines");
  const lines = b.lines.map((l, i) => {
    if (!l || typeof l !== "object" || Object.keys(l).some(k => k !== "id" && k !== "qty")) throw bad(`lines[${i}]`);
    if (!priceLine(l.id)) throw bad(`lines[${i}].id`, "not_on_price_list");
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > 100000) throw bad(`lines[${i}].qty`);
    return { id: l.id, qty: l.qty };
  });
  const id = randomId(16), t = now();
  await env.DB.prepare("INSERT INTO seller_docs (id, doc_type, status, buyer_json, lines_json, extra_json, created_at) VALUES (?1, ?2, 'draft', ?3, ?4, ?5, ?6)")
    .bind(id, b.doc_type, JSON.stringify(buyer), JSON.stringify(lines), JSON.stringify(extra), t).run();
  const d = await docData(env, id);
  return { doc: summary(d) };
}

/** @param {any} d */
const summary = d => ({ id: d.id, doc_type: d.doc_type, status: d.status, number: d.number, buyer_name: d.buyer.name, subtotal_satang: d.subtotal_satang,
  vat_satang: d.vat_satang, total_satang: d.total_satang, created_at: d.created_at, issued_at: d.issued_at, issuable: d.issuable, missing_seller_fields: d.missing_seller_fields,
  unavailable_lines: d.unavailable_lines });

/** Lines of a draft from the CURRENT price list; a line that left the list is marked unavailable (amount 0, not issuable).
 *  @param {{id: string, qty: number}[]} raw */
function draftLines(raw) {
  return raw.map(l => {
    const pl = priceLine(l.id);
    if (!pl) {
      return { id: l.id, qty: l.qty, unavailable: true, name_th: l.id, name_en: l.id, name_zh: l.id, unit_th: "", unit_en: "", unit_zh: "", unit_satang: 0, min_satang: 0,
        regular_th: "—", regular_en: "—", regular_zh: "—", amount_satang: 0 };
    }
    return { id: l.id, qty: l.qty, name_th: pl.name_th, name_en: pl.name_en, name_zh: pl.name_zh, unit_th: pl.unit_th, unit_en: pl.unit_en, unit_zh: pl.unit_zh,
      unit_satang: pl.pilot_satang, min_satang: pl.min_satang || 0, regular_th: pl.regular_th, regular_en: pl.regular_en, regular_zh: pl.regular_zh,
      amount_satang: lineAmount(pl, l.qty) };
  });
}

/** Totals of a document row: frozen at issue time, or computed for a draft from the current list and seller VAT status.
 *  @param {any} r seller_docs row @param {any} p seller details (current, or the frozen copy) */
function figures(r, p) {
  const frozen = r.status !== "draft" && r.lines_frozen_json;
  const lines = frozen ? JSON.parse(r.lines_frozen_json) : draftLines(JSON.parse(r.lines_json));
  let subtotal = lines.reduce((x, l) => x + l.amount_satang, 0), rate = p.vat_registered ? Number(p.vat_rate_bp == null ? 700 : p.vat_rate_bp) : 0;
  let vat = Math.round(subtotal * rate / 10000), total = subtotal + vat;
  if (r.status !== "draft" && r.subtotal_satang != null) { subtotal = r.subtotal_satang; rate = r.vat_rate_bp || 0; vat = r.vat_satang; total = r.total_satang; }
  return { lines, subtotal, rate, vat, total, unavailable: lines.some(l => l.unavailable) };
}

/** Builds the structured document from a row (no further query). @param {any} r @param {any} p @param {any} [logo] */
function build(r, p, logo) {
  const missing = missingFields(p);
  const f = figures(r, p);
  const seller = {};
  for (const k of SELLER_SNAPSHOT_KEYS) seller[k] = p[k] == null ? null : p[k];
  seller.logo_data = logo ? logo.data : null;
  seller.logo_mime = logo ? logo.mime : null;
  return {
    id: r.id, doc_type: r.doc_type, status: r.status, number: r.number, created_at: r.created_at, issued_at: r.issued_at, voided_at: r.voided_at,
    buyer: JSON.parse(r.buyer_json), extra: r.extra_json ? JSON.parse(r.extra_json) : {}, lines: f.lines,
    vat_registered: p.vat_registered == null ? null : !!p.vat_registered, vat_rate_bp: f.rate, subtotal_satang: f.subtotal, vat_satang: f.vat, total_satang: f.total,
    seller: missing.length ? null : seller, missing_seller_fields: missing, unavailable_lines: f.lines.filter(l => l.unavailable).map(l => l.id),
    issuable: r.status === "draft" && missing.length === 0 && !f.unavailable
  };
}

const LIST_COLS = "id, doc_type, status, number, buyer_json, lines_json, lines_frozen_json, extra_json, seller_json, subtotal_satang, vat_rate_bp, vat_satang, " +
  "total_satang, created_at, issued_at, voided_at";

/** GET /seller/docs: ONE query for the documents + one for the seller row, whatever the number of documents (Workers Free
 *  allows 50 D1 queries per request). The frozen seller copy is read only for its VAT status. @param {any} env */
export async function listDocs(env) {
  const rows = (await env.DB.prepare(`SELECT ${LIST_COLS} FROM seller_docs ORDER BY created_at DESC, id LIMIT 200`).all()).results || [];
  const p = await row(env.DB);
  return { docs: rows.map(r => summary(build(r, r.seller_json ? JSON.parse(r.seller_json) : p, null))) };
}

const SELLER_SNAPSHOT_KEYS = [...TEXT_KEYS, "vat_registered", "vat_rate_bp"];

/** Structured document: a draft uses the current seller details and price list, an issued / void one its frozen copy.
 *  @param {any} env @param {string} id */
export async function docData(env, id) {
  const r = await env.DB.prepare(`SELECT ${LIST_COLS}, logo_hash FROM seller_docs WHERE id = ?1`).bind(id).first();
  if (!r) throw new HttpError(404, "document not found");
  if (r.seller_json) {
    const logo = r.logo_hash ? await env.DB.prepare("SELECT mime, data FROM seller_logos WHERE hash = ?1").bind(r.logo_hash).first() : null;
    return build(r, JSON.parse(r.seller_json), logo);
  }
  const p = await row(env.DB);
  return build(r, p, p.logo_data ? { mime: p.logo_mime, data: p.logo_data } : null);
}

/** Pre-check of POST /docs/:id/issue (no secret needed): 404 / 409 already_issued / 409 not_on_price_list, or the missing
 *  fields. @param {any} env @param {string} id */
export async function issueCheck(env, id) {
  const d = await docData(env, id);
  if (d.status !== "draft") throw new HttpError(409, "this document was already issued or voided (already_issued)", { code: "already_issued" });
  if (d.unavailable_lines.length) throw new HttpError(409, "a line of this draft is no longer on the price list (not_on_price_list)", { code: "not_on_price_list" });
  return { missing: d.missing_seller_fields };
}

/** Takes the next number of the document type and freezes the seller details, the lines and the logo reference, all in ONE
 *  D1 batch: the sequence moves only when this request turned the draft into "issued" (changes() = 1), so numbers are
 *  gap-free and never reused. The logo is stored once per distinct image (seller_logos, content hash).
 *  @param {any} env @param {string} id */
export async function issueDoc(env, id) {
  const p = await row(env.DB);
  const missing = missingFields(p);
  if (missing.length) return { missing };
  const r = await env.DB.prepare(`SELECT ${LIST_COLS} FROM seller_docs WHERE id = ?1`).bind(id).first();
  if (!r) throw new HttpError(404, "document not found");
  const d = build(r, p, null);
  if (d.unavailable_lines.length) throw new HttpError(409, "a line of this draft is no longer on the price list (not_on_price_list)", { code: "not_on_price_list" });
  const snap = {};
  for (const k of SELLER_SNAPSHOT_KEYS) snap[k] = p[k] == null ? null : p[k];
  const logoHash = p.logo_data ? await sha256Hex(String(p.logo_data)) : null;
  const tok = randomToken(16), t = now(), db = env.DB;
  const logoStmt = logoHash
    ? [db.prepare("INSERT INTO seller_logos (hash, mime, data, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (hash) DO NOTHING").bind(logoHash, p.logo_mime, p.logo_data, t)] : [];
  await db.batch([
    ...logoStmt,
    db.prepare("UPDATE seller_docs SET status = 'issued', issued_at = ?1, issue_token = ?2, seller_json = ?3, subtotal_satang = ?4, vat_rate_bp = ?5, vat_satang = ?6, " +
      "total_satang = ?7, lines_frozen_json = ?8, logo_hash = ?9 WHERE id = ?10 AND status = 'draft'")
      .bind(t, tok, JSON.stringify(snap), d.subtotal_satang, d.vat_rate_bp, d.vat_satang, d.total_satang, JSON.stringify(d.lines), logoHash, id),
    db.prepare("INSERT INTO seller_doc_seq (doc_type, last) SELECT ?1, 1 WHERE changes() = 1 ON CONFLICT (doc_type) DO UPDATE SET last = last + 1").bind(d.doc_type),
    db.prepare("UPDATE seller_docs SET seq = (SELECT last FROM seller_doc_seq WHERE doc_type = ?1), " +
      "number = ?2 || '-' || ?3 || '-' || printf('%06d', (SELECT last FROM seller_doc_seq WHERE doc_type = ?1)) WHERE id = ?4 AND issue_token = ?5")
      .bind(d.doc_type, String(p.doc_prefix), DOC_CODE[d.doc_type], id, tok)
  ]);
  const after = await db.prepare("SELECT issue_token, seq FROM seller_docs WHERE id = ?1").bind(id).first();
  if (!after || after.issue_token !== tok) throw new HttpError(409, "this document was already issued or voided (already_issued)", { code: "already_issued" });
  const out = await docData(env, id);
  return { doc: summary(out), seq: Number(after.seq) };
}

/** @param {any} env @param {string} id */
export async function voidDoc(env, id) {
  const r = await env.DB.prepare("UPDATE seller_docs SET status = 'void', voided_at = ?1 WHERE id = ?2 AND status IN ('draft', 'issued') RETURNING status, number").bind(now(), id).first();
  if (!r) {
    const e = await env.DB.prepare("SELECT status FROM seller_docs WHERE id = ?1").bind(id).first();
    if (!e) throw new HttpError(404, "document not found");
    throw new HttpError(409, "already voided", { code: "already_void" });
  }
  return { doc: summary(await docData(env, id)) };
}

// ---- rendering (print-ready A4 HTML; the browser saves it as PDF) -------------------------------------------------------
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/** "TH <small>EN · ZH</small>" @param {string[]} l */
const tri = l => `${esc(l[0])}<small>${esc(l[1])} · ${esc(l[2])}</small>`;
const L = {
  seller: ["ผู้ขาย", "Seller", "卖方"], customer: ["ลูกค้า", "Customer", "客户"], no: ["เลขที่", "No.", "编号"], date: ["วันที่", "Date", "日期"],
  desc: ["รายการ", "Description", "项目"], qty: ["จำนวน", "Quantity", "数量"], unit: ["ราคานำร่องต่อหน่วย", "Pilot unit price", "试点单价"],
  amount: ["จำนวนเงิน (บาท)", "Amount (THB)", "金额（泰铢）"],
  regular: ["ราคาปกติหลังผ่านเกณฑ์นำร่อง (เพื่อเปรียบเทียบ ไม่คิดเงิน)", "Regular price after the pilot thresholds (for comparison, not charged)", "试点达标后的正常价格（仅供比较，不收费）"],
  subtotal: ["รวมเป็นเงิน (ไม่รวมภาษีมูลค่าเพิ่ม)", "Subtotal (excl. VAT)", "小计（不含增值税）"], total: ["รวมทั้งสิ้น", "Total", "合计"],
  pay: ["โอนเงินเข้าบัญชี", "Bank transfer", "银行转账"], validUntil: ["ใช้ได้ถึง", "Valid until", "有效期至"], due: ["กำหนดชำระ", "Payment due", "付款期限"],
  paidOn: ["วันที่รับชำระ", "Paid on", "付款日期"], ref: ["อ้างอิง", "Reference", "参考"], note: ["หมายเหตุ", "Note", "备注"], branch: ["สาขา", "Branch", "分支"]
};
const TITLE = { quotation: ["ใบเสนอราคา", "Quotation", "报价单"], invoice: ["ใบแจ้งหนี้", "Invoice", "账单"], receipt: ["ใบเสร็จรับเงิน", "Receipt", "收据"] };
const addDaysT = (t, n) => t + n * 86400;

/** @param {any} d */
export function renderDoc(d) {
  const title = TITLE[d.doc_type];
  const s = d.seller;
  const sf = (k, v) => `<span data-seller-field="${k}">${esc(v)}</span>`;
  const dateT = d.issued_at || d.created_at;
  const dt = thaiDate(dateT);
  const metaRows = [
    `<tr><th>${tri(L.no)}</th><td>${d.number ? esc(d.number) : "—"}</td></tr>`,
    `<tr><th>${tri(L.date)}</th><td>${esc(dt.th)} (${esc(dt.iso)})</td></tr>`
  ];
  const dateRow = (lab, t) => { const v = thaiDate(t); metaRows.push(`<tr><th>${tri(lab)}</th><td>${esc(v.th)} (${esc(v.iso)})</td></tr>`); };
  if (d.doc_type === "quotation" && d.extra.valid_days) dateRow(L.validUntil, addDaysT(dateT, d.extra.valid_days));
  if (d.doc_type === "invoice" && d.extra.due_days != null) dateRow(L.due, addDaysT(dateT, d.extra.due_days));
  if (d.doc_type === "receipt" && d.extra.paid_on) metaRows.push(`<tr><th>${tri(L.paidOn)}</th><td>${esc(d.extra.paid_on)}</td></tr>`);
  if (d.extra.ref) metaRows.push(`<tr><th>${tri(L.ref)}</th><td>${esc(d.extra.ref)}</td></tr>`);

  let sellerBlock;
  if (!s) {
    sellerBlock = `<section class="missing" data-seller-missing role="alert">
  <p class="big">ยังไม่ได้กรอกข้อมูลกิจการ<small>Business details not filled in yet · 尚未填写商家信息</small></p>
  <p>เอกสารนี้ยังออกเป็นฉบับจริงไม่ได้ กรุณากรอกในหน้า "ข้อมูลกิจการ" ของหลังบ้าน
    <small>This document cannot be issued until the owner fills in the "Business details" page of the back office ·
    在后台"商家信息"页面填写完整之前，本单据不能正式开具</small></p>
  <p>ยังขาด <small>Still missing · 尚缺</small></p>
  <ul>${d.missing_seller_fields.map(k => `<li data-missing="${esc(k)}">${tri(LABELS[k])}</li>`).join("")}</ul>
</section>`;
  } else {
    const contact = [s.contact_phone && sf("contact_phone", s.contact_phone), s.contact_email && sf("contact_email", s.contact_email),
      s.contact_line && sf("contact_line", "LINE " + s.contact_line)].filter(Boolean).join(" · ");
    const branchHtml = s.branch ? sf("branch", s.branch) : `<span data-seller-field="branch">${tri(["สำนักงานใหญ่", "Head office", "总公司"])}</span>`;
    sellerBlock = `<div class="party">
  ${s.logo_data ? `<img class="logo" alt="" src="data:${esc(s.logo_mime)};base64,${esc(s.logo_data)}">` : ""}
  <div><b>${sf("legal_name", s.legal_name)}</b></div>
  <div>${sf("address", s.address)}</div>
  <div>${tri(LABELS.tax_id)} ${sf("tax_id", s.tax_id)} · ${tri(L.branch)} ${branchHtml}</div>
  <div>${tri(LABELS.contact)} ${contact}</div>
</div>`;
  }
  const b = d.buyer;
  const quote = d.doc_type === "quotation";
  const head = `<tr><th>#</th><th>${tri(L.desc)}</th><th class="num">${tri(L.qty)}</th><th class="num">${tri(L.unit)}</th>` +
    `${quote ? `<th class="num">${tri(L.regular)}</th>` : ""}<th class="num">${tri(L.amount)}</th></tr>`;
  const regCell = l => `<td class="num">${esc(l.regular_th)}<small>${esc(l.regular_en)} · ${esc(l.regular_zh)}</small></td>`;
  const gone = (l, i) => `<tr data-unavailable-line="${esc(l.id)}"><td>${i + 1}</td>` +
    `<td>${tri(["ไม่อยู่ในรายการราคาที่อนุมัติแล้ว", "No longer on the approved price list", "已不在批准的价目表中"])}</td>` +
    `<td class="num">${l.qty}</td><td class="num">—</td>${quote ? `<td class="num">—</td>` : ""}<td class="num">—</td></tr>`;
  const rows = d.lines.map((l, i) => l.unavailable ? gone(l, i) : `<tr><td>${i + 1}</td><td>${esc(l.name_th)}<small>${esc(l.name_en)} · ${esc(l.name_zh)}</small>` +
    `<small>${esc(l.unit_th)} · ${esc(l.unit_en)} · ${esc(l.unit_zh)}${l.min_satang ? ` · ขั้นต่ำ / minimum / 最低 ${baht(l.min_satang)}` : ""}</small></td>` +
    `<td class="num">${l.qty}</td><td class="num">${baht(l.unit_satang)}</td>${quote ? regCell(l) : ""}<td class="num">${baht(l.amount_satang)}</td></tr>`).join("");
  const span = quote ? 5 : 4;
  const vatRow = d.vat_registered === true
    ? `<tr><td colspan="${span}">ภาษีมูลค่าเพิ่ม ${(d.vat_rate_bp / 100).toFixed(0)}%<small>VAT · 增值税</small></td><td class="num">${baht(d.vat_satang)}</td></tr>`
    : d.vat_registered === false ? `<tr><td colspan="${span + 1}" class="muted">ผู้ขายไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม ไม่มีภาษีมูลค่าเพิ่ม
      <small>Seller not VAT-registered: no VAT charged · 卖方未登记增值税，不收增值税</small></td></tr>`
      : `<tr><td colspan="${span}">ภาษีมูลค่าเพิ่ม: ยังไม่ได้ระบุ<small>VAT: not stated yet · 增值税：尚未填写</small></td><td class="num">—</td></tr>`;
  let payBlock = "";
  if (d.doc_type !== "receipt") {
    payBlock = `<section class="pay"><h2>${tri(L.pay)}</h2>${s ? `<table class="meta">
  <tr><th>${tri(LABELS.bank_name)}</th><td>${sf("bank_name", s.bank_name)}</td></tr>
  <tr><th>${tri(LABELS.bank_account_name)}</th><td>${sf("bank_account_name", s.bank_account_name)}</td></tr>
  <tr><th>${tri(LABELS.bank_account_no)}</th><td>${sf("bank_account_no", s.bank_account_no)}</td></tr></table>
  <p class="muted">ระบุเลขที่เอกสารในบันทึกการโอน ไม่มีการชำระเงินออนไลน์<small>Put the document number in the transfer note. No online payment · 转账备注请填写单据编号，不提供在线支付</small></p>`
      : `<p class="muted">ดูรายการที่ยังขาดด้านบน<small>See the missing details above · 见上方缺少的信息</small></p>`}</section>`;
  }
  const status = d.status === "void" ? `<p class="stamp">ยกเลิก<small>VOID · 作废</small></p>`
    : d.status === "draft" ? `<p class="stamp">ฉบับร่าง ยังไม่ได้ออกเลขที่<small>DRAFT, not issued · 草稿，未开具</small></p>` : "";
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title[0])} ${esc(d.number || "")}</title>
<style>
${DOC_FONT_CSS /* self-hosted Thai font inline: no machine fallback, no U+F700–F71A in the PDF (decision 161) */}
  :root { color-scheme: light; }
  body { font: 13px/1.5 ${DOC_FONT_FAMILY},"Noto Sans SC",system-ui,sans-serif; color: #111; background: #fff; margin: 0; padding: 24px; }
  .doc { max-width: 780px; margin: 0 auto; } h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 14px 0 4px; }
  small { display: block; font-size: 10.5px; color: #555; font-weight: 400; }
  .head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 10px; }
  .logo { max-height: 56px; max-width: 200px; display: block; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; vertical-align: top; padding: 5px 6px; }
  .meta { width: auto; } .meta th { font-weight: 600; padding-right: 12px; }
  .items { margin-top: 12px; border-top: 1px solid #999; } .items thead th { border-bottom: 1px solid #999; background: #f3f3f3; font-weight: 600; }
  .num { text-align: right; white-space: nowrap; } .total td { border-top: 2px solid #111; font-weight: 700; font-size: 15px; }
  .muted { color: #444; font-size: 12px; } .stamp { border: 3px solid #b00; color: #b00; padding: 4px 10px; font-weight: 700; display: inline-block; margin: 6px 0; }
  .missing { border: 3px solid #b00; padding: 10px 14px; margin: 8px 0; } .missing .big { font-size: 18px; font-weight: 700; color: #b00; margin: 0 0 6px; }
  @media print { body { padding: 0; } @page { size: A4; margin: 14mm; } }
</style></head><body><div class="doc" data-doc-type="${esc(d.doc_type)}">
${status}
<div class="head">
  <div><h1>${tri(title)}</h1><h2>${tri(L.seller)}</h2>${sellerBlock}</div>
  <table class="meta">${metaRows.join("")}</table>
</div>
<h2>${tri(L.customer)}</h2>
<table class="meta">
  <tr><th>${tri(LABELS.legal_name)}</th><td>${esc(b.name)}</td></tr>
  <tr><th>${tri(LABELS.address)}</th><td>${esc(b.address || "—")}</td></tr>
  ${b.tax_id ? `<tr><th>${tri(LABELS.tax_id)}</th><td>${esc(b.tax_id)}${b.branch ? " · " + esc(b.branch) : ""}</td></tr>` : ""}
</table>
<table class="items"><thead>${head}</thead><tbody>${rows}
  <tr><td colspan="${span}">${tri(L.subtotal)}</td><td class="num">${baht(d.subtotal_satang)}</td></tr>
  ${vatRow}
  <tr class="total"><td colspan="${span}">${tri(L.total)}</td><td class="num">${baht(d.total_satang)}</td></tr>
</tbody></table>
${d.vat_registered === false ? `<p class="muted">ราคานำร่องตามรายการราคาที่อนุมัติ ผู้ขายไม่เรียกเก็บภาษีมูลค่าเพิ่ม
  <small>Pilot prices from the approved price list; the seller charges no VAT · 批准价目表中的试点价格；卖方不收增值税</small></p>`
    : `<p class="muted">ราคาไม่รวมภาษีมูลค่าเพิ่ม${d.vat_registered ? " " + (d.vat_rate_bp / 100).toFixed(0) + "%" : ""} (ราคานำร่องตามรายการราคาที่อนุมัติ)
    <small>Prices excl. VAT (pilot prices from the approved price list) · 价格不含增值税（批准价目表中的试点价格）</small></p>`}
${payBlock}
${d.extra.note ? `<p class="muted">${tri(L.note)} ${esc(d.extra.note)}</p>` : ""}
</div></body></html>`;
}

export const DOC_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
};

/** Every /admin/api/seller route (owner only, read included). @param {string} route */
export const isSellerRoute = route => route === "/seller" || route.startsWith("/seller/");
