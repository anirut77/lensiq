// @ts-check
// backend/src/tryon.js — Try-On MVP merchant back-office + public catalogue (docs/TRYON-DESIGN.md T2 subset).
// NOT DEPLOYED by the builder; migration 0017_tryon.sql is applied by the owner.
//
//   GET  /v1/tryon/catalog                 published items of the demo shop, public fields only (cacheable)
//   GET  /v1/tryon/asset/:id               the garment cut-out of a PUBLISHED item (exact type, nosniff), else 404
//   Admin (existing admin sign-in, BO-1; every write audited by index.js with ids / field names only):
//   GET    /admin/api/tryon/items              items + categories + store kind
//   POST   /admin/api/tryon/items              create            PUT /admin/api/tryon/items/:id   partial update
//   POST   /admin/api/tryon/items/:id/status   {status} publish / hide / back to draft (owner, tryon_admin)
//   PUT    /admin/api/tryon/items/:id/asset    {mime, data (base64), w, h, face_check} the cut-out image
//   DELETE /admin/api/tryon/items/:id          item + image (owner, tryon_admin)
//
// Roles (admin_reviewers.role, migration 0017): owner (the platform owner) and tryon_admin = everything above;
// tryon_editor = create / edit / upload, status draft or in_review only (an editor's change to a published item sends it
// back to in_review). Merit reviewers never reach these routes; try-on accounts never reach any other admin route.
// Safety: the category list has no underwear / lingerie / swimwear / bodysuit / sleepwear value (design 5.4). Images are
// garment cut-outs made on the merchant's device after the Product Check face blur; the editor confirms "no visible face
// remains" (face_check) — the Worker refuses an upload without it. Customer photos are never sent here (tryon.html has no
// upload path at all).
import { randomId, sha256Hex, fromB64 } from "./crypto.js";
import { assetStore, storeFor } from "./tryon-store.js";
import { HttpError, now } from "./util.js";

/** Fixed category list; anchor = what the on-device overlay attaches the item to. Same list in lensiq-tryon-core.js. */
export const CATEGORIES = [
  { id: "glasses", anchor: "face" }, { id: "hats", anchor: "face" }, { id: "earrings", anchor: "face" }, { id: "necklaces", anchor: "face" },
  { id: "tops", anchor: "pose" }, { id: "outerwear", anchor: "pose" }, { id: "dresses", anchor: "pose" }, { id: "skirts", anchor: "pose" },
  { id: "trousers", anchor: "pose" }
];
const CAT = new Map(CATEGORIES.map(c => [c.id, c.anchor]));
export const ROLES = ["merit", "tryon_admin", "tryon_editor"];
export const STATUSES = ["draft", "in_review", "published", "hidden"];
export const ASSET_MAX_BODY = 1400 * 1024;
export const MAX_PX = 2048;
const ID_RE = /^[a-f0-9]{12}$/;
const FIELDS = ["category", "name_th", "name_en", "name_zh", "price", "sale_price", "vat_included", "sizes", "colours", "product_url", "notes", "status"];
const SHOP = "demo";

const ITEM = "\\/tryon\\/items\\/[a-f0-9]{12}";
const EDITOR_ROUTES = [["GET", /^\/me$/], ["POST", /^\/logout$/], ["GET", /^\/tryon\/items$/], ["POST", /^\/tryon\/items$/], ["PUT", new RegExp("^" + ITEM + "$")],
  ["PUT", new RegExp("^" + ITEM + "\\/asset$")]];
const ADMIN_ROUTES = EDITOR_ROUTES.concat([["DELETE", new RegExp("^" + ITEM + "$")], ["POST", new RegExp("^" + ITEM + "\\/status$")]]);
/** Default deny: the routes a try-on account may use. @param {string} role @param {string} m @param {string} route */
export function roleAllowed(role, m, route) {
  const list = role === "tryon_admin" ? ADMIN_ROUTES : role === "tryon_editor" ? EDITOR_ROUTES : [];
  return list.some(([rm, re]) => rm === m && /** @type {RegExp} */ (re).test(route));
}
/** @param {any} role */
export function cleanRole(role) {
  if (role === undefined || role === null) return "merit";
  if (!ROLES.includes(role)) throw new HttpError(400, "unknown account role", { code: "invalid_role" });
  return role;
}
const canPublish = who => who.role === "owner" || who.role === "tryon_admin";
const bad = (code, msg) => new HttpError(400, msg, { code });

/* ---------------- validation ---------------- */
const nameOk = (v, req) => (v === undefined || v === null ? !req : typeof v === "string" && v.trim().length >= 1 && v.length <= 120);
const satang = v => v === undefined || v === null || (Number.isInteger(v) && v >= 0 && v <= 1e9);
/** Validates the fields present in body (partial = update). Returns the cleaned column values. @param {any} body */
export function cleanItem(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("bad_body", "invalid request body");
  for (const k of Object.keys(body)) if (!FIELDS.includes(k)) throw bad("unknown_field", "unknown field: " + k.slice(0, 40));
  const has = k => body[k] !== undefined, o = {};
  if (has("category") || !partial) {
    if (!CAT.has(body.category)) throw bad("invalid_category", "unknown category");
    o.category = body.category; o.anchor = CAT.get(body.category);
  }
  if (!nameOk(body.name_th, !partial || has("name_th"))) throw bad("invalid_name", "Thai name: 1–120 characters");
  for (const k of ["name_en", "name_zh"]) if (!nameOk(body[k], false)) throw bad("invalid_name", "name: up to 120 characters");
  for (const k of ["name_th", "name_en", "name_zh"]) if (has(k)) o[k] = body[k] === null ? null : String(body[k]).trim();
  for (const k of ["price", "sale_price"]) { if (!satang(body[k])) throw bad("invalid_price", "price: whole satang, 0 or more"); if (has(k)) o[k] = body[k]; }
  if (has("vat_included")) { if (typeof body.vat_included !== "boolean") throw bad("invalid_vat", "vat_included: true or false"); o.vat_included = body.vat_included ? 1 : 0; }
  if (has("sizes")) {
    const s = body.sizes;
    if (!Array.isArray(s) || s.length > 20 || !s.every(x => typeof x === "string" && x.trim().length >= 1 && x.length <= 16)) throw bad("invalid_sizes", "sizes: up to 20, each 1–16 characters");
    o.sizes = JSON.stringify(s.map(x => x.trim()));
  }
  if (has("colours")) {
    const c = body.colours;
    if (!Array.isArray(c) || c.length > 12 || !c.every(x => x && typeof x.name === "string" && x.name.length >= 1 && x.name.length <= 30 && /^#[0-9a-fA-F]{6}$/.test(String(x.hex)))) {
      throw bad("invalid_colours", "colours: up to 12, each {name, hex #RRGGBB}");
    }
    o.colours = JSON.stringify(c.map(x => ({ name: x.name, hex: String(x.hex).toLowerCase() })));
  }
  if (has("product_url")) {
    const u = body.product_url;
    let ok = u === null;
    if (!ok) try { ok = new URL(String(u)).protocol === "https:" && String(u).length <= 500; } catch { /* not a URL */ }
    if (!ok) throw bad("invalid_url", "product link: https only");
    o.product_url = u;
  }
  if (has("notes")) { if (body.notes !== null && (typeof body.notes !== "string" || body.notes.length > 2000)) throw bad("invalid_notes", "notes: up to 2000 characters"); o.notes = body.notes; }
  if (has("status")) { if (!STATUSES.includes(body.status)) throw bad("invalid_status", "unknown status"); o.status = body.status; }
  return o;
}

/* ---------------- rows ---------------- */
const parse = s => { try { return s ? JSON.parse(s) : []; } catch { return []; } };
async function getItem(env, id) {
  if (!ID_RE.test(id)) throw new HttpError(404, "not found", { code: "not_found" });
  const r = await env.DB.prepare("SELECT * FROM tryon_items WHERE id = ?1").bind(id).first();
  if (!r) throw new HttpError(404, "not found", { code: "not_found" });
  return r;
}
const assetRow = (env, id) => env.DB.prepare("SELECT id, item_id, mime, bytes, w, h, sha256, store, created_at FROM tryon_assets WHERE item_id = ?1").bind(id).first();
const adminView = (r, a) => ({ ...r, sizes: parse(r.sizes), colours: parse(r.colours), vat_included: !!r.vat_included,
  asset: a ? { mime: a.mime, bytes: a.bytes, w: a.w, h: a.h, store: a.store } : null });

/** @param {any} env */
export async function adminList(env) {
  const rows = (await env.DB.prepare("SELECT * FROM tryon_items WHERE shop = ?1 ORDER BY updated_at DESC").bind(SHOP).all()).results || [];
  const assets = new Map(((await env.DB.prepare("SELECT item_id, mime, bytes, w, h, store FROM tryon_assets").all()).results || []).map(a => [a.item_id, a]));
  return { items: rows.map(r => adminView(r, assets.get(r.id))), categories: CATEGORIES, statuses: STATUSES, store: assetStore(env).kind, max_px: MAX_PX, max_bytes: assetStore(env).maxBytes };
}

/** editor: only draft / in_review. @param {any} who @param {string|undefined} status */
function statusAllowed(who, status) {
  if (status !== undefined && !canPublish(who) && !["draft", "in_review"].includes(status)) {
    throw new HttpError(403, "an editor can save a draft or send it for review; publishing is for the shop admin", { code: "forbidden_status" });
  }
}

/** @param {any} env @param {any} body @param {any} who */
export async function adminCreate(env, body, who) {
  const o = cleanItem(body, false);
  statusAllowed(who, o.status);
  if (o.status === "published") throw new HttpError(409, "add an image before publishing", { code: "asset_required" });
  const id = randomId(6), t = now();
  const cols = { id, shop: SHOP, status: "draft", ...o, created_by: who.name, updated_by: who.name, created_at: t, updated_at: t };
  const keys = Object.keys(cols);
  await env.DB.prepare(`INSERT INTO tryon_items (${keys.join(", ")}) VALUES (${keys.map((_, i) => "?" + (i + 1)).join(", ")})`).bind(...keys.map(k => cols[k])).run();
  return adminView(await getItem(env, id), null);
}

/** @param {any} env @param {string} id @param {any} body @param {any} who */
export async function adminUpdate(env, id, body, who) {
  const cur = await getItem(env, id);
  const o = cleanItem(body, true);
  statusAllowed(who, o.status);
  const changed = Object.keys(body);
  if (o.status === "published" && !(await assetRow(env, id))) throw new HttpError(409, "add an image before publishing", { code: "asset_required" });
  // an editor's change to a live item needs approval again (off the public list until then)
  if (!canPublish(who) && (cur.status === "published" || cur.status === "hidden") && o.status === undefined) o.status = "in_review";
  const set = { ...o, updated_by: who.name, updated_at: now() }, keys = Object.keys(set);
  await env.DB.prepare(`UPDATE tryon_items SET ${keys.map((k, i) => `${k} = ?${i + 1}`).join(", ")} WHERE id = ?${keys.length + 1}`).bind(...keys.map(k => set[k]), id).run();
  const r = await getItem(env, id);
  return { item: adminView(r, await assetRow(env, id)), changed, from: cur.status, to: r.status };
}

/** owner / tryon_admin. @param {any} env @param {string} id @param {any} body @param {any} who */
export async function adminSetStatus(env, id, body, who) {
  const cur = await getItem(env, id), status = body && body.status;
  if (!STATUSES.includes(status)) throw bad("invalid_status", "unknown status");
  if (status === "published" && !(await assetRow(env, id))) throw new HttpError(409, "add an image before publishing", { code: "asset_required" });
  await env.DB.prepare("UPDATE tryon_items SET status = ?1, updated_by = ?2, updated_at = ?3 WHERE id = ?4").bind(status, who.name, now(), id).run();
  return { id, from: cur.status, to: status };
}

/** @param {any} env @param {string} id */
export async function adminDelete(env, id) {
  await getItem(env, id);
  const a = await env.DB.prepare("SELECT * FROM tryon_assets WHERE item_id = ?1").bind(id).first();
  if (a) await storeFor(env, a).del(a);
  await env.DB.batch([env.DB.prepare("DELETE FROM tryon_assets WHERE item_id = ?1").bind(id), env.DB.prepare("DELETE FROM tryon_items WHERE id = ?1").bind(id)]);
  return { ok: true, id };
}

/* ---------------- images ---------------- */
const MAGIC = {
  "image/png": b => b.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v),
  "image/jpeg": b => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": b => b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP"
};
const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

/** Checks an upload; returns {bytes, mime, w, h, faces}. Order: type, data, magic, PNG size, pixels, bytes, face check. */
export function checkAsset(body, maxBytes) {
  const mime = body && body.mime;
  if (!Object.prototype.hasOwnProperty.call(MAGIC, mime)) throw bad("invalid_type", "PNG, WebP or JPEG only");
  const data = typeof body.data === "string" ? body.data : "";
  if (!data || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw bad("invalid_data", "image data must be base64");
  let bytes; try { bytes = fromB64(data); } catch { throw bad("invalid_data", "image data must be base64"); }
  if (!MAGIC[mime](bytes)) throw bad("magic_mismatch", "the file content is not the declared type");
  const w = body.w, h = body.h;
  if (mime === "image/png" && (u32(bytes, 16) !== w || u32(bytes, 20) !== h)) throw bad("size_mismatch", "declared size differs from the image");
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > MAX_PX || h > MAX_PX) throw bad("too_large_px", `1–${MAX_PX} px per side`);
  if (bytes.length > maxBytes) throw bad("too_large_bytes", `at most ${maxBytes} bytes`);
  const fc = body.face_check;
  if (!fc || fc.ran !== true || fc.confirmed !== true || !Number.isInteger(fc.faces) || fc.faces < 0) {
    throw bad("face_check_required", "run the face blur on the device and confirm that no face remains");
  }
  return { bytes, mime, w, h, faces: fc.faces };
}

/** @param {any} env @param {string} id @param {any} body @param {any} who */
export async function adminSetAsset(env, id, body, who) {
  const cur = await getItem(env, id), st = assetStore(env), a = checkAsset(body, st.maxBytes);
  const old = await env.DB.prepare("SELECT * FROM tryon_assets WHERE item_id = ?1").bind(id).first();
  const aid = randomId(8), put = await st.put(aid, a.bytes, a.mime), t = now();
  const stmts = [];
  if (old) stmts.push(env.DB.prepare("DELETE FROM tryon_assets WHERE item_id = ?1").bind(id));
  stmts.push(env.DB.prepare("INSERT INTO tryon_assets (id, item_id, mime, bytes, w, h, sha256, store, data, face_check, created_by, created_at) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)")
    .bind(aid, id, a.mime, a.bytes.length, a.w, a.h, await sha256Hex(a.bytes), st.kind, put.data, JSON.stringify({ ran: true, faces: a.faces, confirmed: true }), who.name, t));
  const back = !canPublish(who) && (cur.status === "published" || cur.status === "hidden");
  stmts.push(env.DB.prepare("UPDATE tryon_items SET updated_by = ?1, updated_at = ?2" + (back ? ", status = 'in_review'" : "") + " WHERE id = ?3").bind(who.name, t, id));
  await env.DB.batch(stmts);
  if (old) await storeFor(env, old).del(old);
  return { id, asset: { mime: a.mime, bytes: a.bytes.length, w: a.w, h: a.h, store: st.kind }, faces: a.faces, status: back ? "in_review" : cur.status };
}

/* ---------------- public ---------------- */
/** @param {any} env */
export async function publicCatalog(env) {
  const rows = (await env.DB.prepare("SELECT i.*, a.mime AS a_mime, a.w AS a_w, a.h AS a_h FROM tryon_items i JOIN tryon_assets a ON a.item_id = i.id " +
    "WHERE i.shop = ?1 AND i.status = 'published' ORDER BY i.updated_at DESC")
    .bind(SHOP).all()).results || [];
  return {
    items: rows.map(r => ({
      id: r.id, category: r.category, anchor: r.anchor, name: { th: r.name_th, en: r.name_en || null, zh: r.name_zh || null },
      price: r.price, sale_price: r.sale_price, vat_included: !!r.vat_included, sizes: parse(r.sizes), colours: parse(r.colours), product_url: r.product_url || null,
      asset: { url: "/v1/tryon/asset/" + r.id, mime: r.a_mime, w: r.a_w, h: r.a_h }
    })),
    categories: CATEGORIES
  };
}
/** The image of a published item, or null. @param {any} env @param {string} id */
export async function publicAsset(env, id) {
  if (!ID_RE.test(id)) return null;
  const a = await env.DB.prepare("SELECT a.* FROM tryon_assets a JOIN tryon_items i ON i.id = a.item_id WHERE a.item_id = ?1 AND i.status = 'published'").bind(id).first();
  if (!a) return null;
  const bytes = await storeFor(env, a).get(a);
  return bytes ? { bytes, mime: a.mime } : null;
}
