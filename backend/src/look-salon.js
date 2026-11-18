// @ts-check
// backend/src/look-salon.js — salon catalogue approval step (owner decision 2026-11-18 "build the salon content approval
// step so salon mode can be switched on"; docs/BEAUTY-IMAGE-DESIGN.md §4; CLAUDE.md "Look suggestions"). Migration
// 0022_look_salon.sql. NOT deployed by the builder; the owner applies the migration and deploys.
//
//   Public (only while the Worker var LOOK_SALON = "on"; otherwise 404 look_salon_off before any database access):
//   GET  /v1/look/salon/catalog                    approved entries only, public fields only, re-linted at serve time
//   Admin (existing admin sign-in; every action audited with ids, versions, statuses, field names and lint codes only):
//   GET  /admin/api/look-salon/entries             every entry + can_approve for this account
//   POST /admin/api/look-salon/entries             new entry -> always 'pending', version 1
//   PUT  /admin/api/look-salon/entries/:id         edit -> 'pending' again, version + 1, approval cleared
//   POST /admin/api/look-salon/entries/:id/approve {version}   only the approver roles; only the exact pending version;
//                                                  only when the strict lint finds nothing (no exception for method names)
//   POST /admin/api/look-salon/entries/:id/reject  {version, reason}   reason from REJECT_REASONS (no free text)
//   POST /admin/api/look-salon/entries/:id/hide    takes an entry off the public list (an edit brings it back as pending)
//   GET  /admin/api/look-salon/entries/:id/history
//
// Roles: owner (the LENSIQ owner); restricted accounts (admin_reviewers.role) "lensiq_admin" (LENSIQ admin: create, edit,
// reject, hide; approve only when allowed below) and "salon_editor" (the salon's staff: create and edit only). Every other
// restricted account gets 403 forbidden_role on these routes (index.js).
// Approvers (decision recorded in docs/BEAUTY-IMAGE-DESIGN.md §4, reversible): the LENSIQ owner only, by default. The Worker
// var LOOK_SALON_APPROVERS = "owner,lensiq_admin" also lets LENSIQ admins approve. No value can add salon editors, and the
// owner can always approve.
// Wording: the salon's text goes through lensiq-look-lint.js in its STRICT form (the "salon" source that lifts method names
// is not used here): a procedure name (tattooing, microblading, semi-permanent pigment, injections, thread lifts, laser,
// surgery), whitening, "feature is bad", beauty scores, threats, prices, purchase words and links are refused on save AND
// at approval. The lint is a first check and is not a complete filter (held-out measures 59/104 and 64/97, synthetic);
// a person approves every entry.
import LookLint from "../../lensiq-look-lint.js";
import { randomId } from "./crypto.js";
import { HttpError, now } from "./util.js";

export const KINDS = ["brow", "lip", "liner", "hair"];
export const STATUSES = ["pending", "approved", "rejected", "hidden"];
export const ROLES = ["lensiq_admin", "salon_editor"];
export const REJECT_REASONS = ["wording", "procedure", "rights", "shape", "other"];
export const LINER_STYLES = ["thin", "wing-short", "wing-long", "tight"];
const CARDS = {
  brow: ["brow-arch", "brow-extend", "brow-lift", "brow-define", "brow-fill", "brow-open"],
  lip: ["lip-warm", "lip-center", "lip-matte", "lip-gloss"]
};
const TEXT = ["name_th", "name_en", "name_zh", "desc_th", "desc_en", "desc_zh", "code"];
const FIELDS = ["kind", "name_th", "name_en", "name_zh", "desc_th", "desc_en", "desc_zh", "code", "shape", "rights_ok"];
const ID_RE = /^[a-f0-9]{12}$/;
const SALON = "demo";

/** @param {any} env */
export const lookSalonEnabled = env => String((env && env.LOOK_SALON) || "").trim().toLowerCase() === "on";
export const LOOK_SALON_OFF_BODY = Object.freeze({ error: "the salon catalogue is not enabled on this server (look_salon_off)", code: "look_salon_off" });
/** @param {string} p */
export const isLookSalonPublicPath = p => p === "/v1/look/salon" || p.startsWith("/v1/look/salon/");
/** @param {string} route */
export const isLookSalonAdminRoute = route => route === "/look-salon" || route.startsWith("/look-salon/");
/** @param {any} role */
export const isLookSalonRole = role => ROLES.includes(role);

/** the approver roles from LOOK_SALON_APPROVERS: always the owner; lensiq_admin only when listed; nothing else @param {any} env */
export function approverRoles(env) {
  const listed = String((env && env.LOOK_SALON_APPROVERS) || "").split(",").map(s => s.trim().toLowerCase());
  return listed.includes("lensiq_admin") ? ["owner", "lensiq_admin"] : ["owner"];
}
/** @param {any} env @param {{role: string}} who */
export const canApprove = (env, who) => approverRoles(env).includes(who.role);

const ENTRY = "\\/look-salon\\/entries\\/[a-f0-9]{12}";
const EDITOR_ROUTES = [["GET", /^\/me$/], ["POST", /^\/logout$/], ["GET", /^\/look-salon\/entries$/], ["POST", /^\/look-salon\/entries$/],
  ["PUT", new RegExp("^" + ENTRY + "$")], ["GET", new RegExp("^" + ENTRY + "\\/history$")],
  // the approve route is reachable so the refusal is decided (and audited) by the approver rule below
  ["POST", new RegExp("^" + ENTRY + "\\/approve$")]];
const ADMIN_ROUTES = EDITOR_ROUTES.concat([["POST", new RegExp("^" + ENTRY + "\\/(?:reject|hide)$")]]);
/** Default deny: the routes a salon account may use. @param {string} role @param {string} m @param {string} route */
export function roleAllowed(role, m, route) {
  const list = role === "lensiq_admin" ? ADMIN_ROUTES : role === "salon_editor" ? EDITOR_ROUTES : [];
  return list.some(([rm, re]) => rm === m && /** @type {RegExp} */ (re).test(route));
}
/** anonymous calls to these routes answer 403 (not 401) @param {string} route @param {any} e */
export function anonymous(route, e) {
  if (isLookSalonAdminRoute(route) && e && e.status === 401) return new HttpError(403, "sign in first (not_signed_in)", { code: "not_signed_in" });
  return e;
}

const bad = (/** @type {string} */ code, /** @type {string} */ msg) => new HttpError(400, msg, { code });

/* ---------------- validation ---------------- */
const num01 = (/** @type {any} */ v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
/** @param {string} kind @param {any} s @returns {Record<string, any>} */
function cleanShape(kind, s) {
  const no = () => bad("invalid_shape", "the shape does not fit this kind of entry");
  if (!s || typeof s !== "object" || Array.isArray(s)) throw no();
  const keys = Object.keys(s);
  const only = (/** @type {string[]} */ allowed) => { if (keys.some(k => !allowed.includes(k))) throw no(); };
  /** @type {Record<string, any>} */
  const o = {};
  if (kind === "brow") {
    only(["card", "points"]);
    if (s.card === undefined && s.points === undefined) throw no();
    if (s.card !== undefined) { if (!CARDS.brow.includes(s.card)) throw no(); o.card = s.card; }
    if (s.points !== undefined) {
      if (!Array.isArray(s.points) || s.points.length < 3 || s.points.length > 24) throw no();
      for (const p of s.points) if (!Array.isArray(p) || p.length !== 2 || !num01(p[0]) || !num01(p[1])) throw no();
      o.points = s.points.map((/** @type {number[]} */ p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]);
    }
  } else if (kind === "lip") {
    only(["hex", "gloss", "card"]);
    if (typeof s.hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(s.hex)) throw no();
    o.hex = s.hex.toLowerCase();
    if (s.gloss !== undefined) { if (!num01(s.gloss)) throw no(); o.gloss = s.gloss; }
    if (s.card !== undefined) { if (!CARDS.lip.includes(s.card)) throw no(); o.card = s.card; }
  } else if (kind === "liner") {
    only(["style"]);
    if (!LINER_STYLES.includes(s.style)) throw no();
    o.style = s.style;
  } else if (kind === "hair") {
    only(["path"]);
    // SVG path data only (commands, numbers, spaces, commas): no markup, no url(), no attribute breakout
    if (typeof s.path !== "string" || s.path.length > 4000 || !/^[Mm][MmLlHhVvCcSsQqTtAaZz0-9 ,.\-]*$/.test(s.path)) throw no();
    o.path = s.path;
  } else throw no();
  return o;
}
/** Validates the fields present in body (partial = update). Returns column values. @param {any} body @param {any} [cur] */
export function cleanEntry(body, cur = null) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("bad_body", "invalid request body");
  for (const k of Object.keys(body)) if (!FIELDS.includes(k)) throw bad("unknown_field", "unknown field: " + k.slice(0, 40));
  const has = (/** @type {string} */ k) => body[k] !== undefined;
  /** @type {Record<string, any>} */
  const o = {};
  const kind = has("kind") ? body.kind : cur ? cur.kind : undefined;
  if (!KINDS.includes(kind)) throw bad("invalid_kind", "unknown kind of entry");
  if (has("kind")) o.kind = kind;
  if (!cur || has("rights_ok")) {
    if (body.rights_ok !== true) throw bad("rights_required", "tick the box: the salon owns or may use this shape or drawing");
    o.rights_ok = 1;
  }
  for (const k of ["name_th", "name_en", "name_zh"]) {
    if (!has(k) && !(k === "name_th" && !cur)) continue;
    const v = body[k];
    const req = k === "name_th";
    if (v === null && !req) { o[k] = null; continue; }
    if (typeof v !== "string" || v.length > 80 || (req && !v.trim()) ) throw bad("invalid_name", "Thai name 1-80 characters, other names up to 80");
    o[k] = v.trim() ? v.trim() : null;
  }
  for (const k of ["desc_th", "desc_en", "desc_zh"]) {
    if (!has(k)) continue;
    const v = body[k];
    if (v === null) { o[k] = null; continue; }
    if (typeof v !== "string" || v.length > 300) throw bad("invalid_desc", "descriptions up to 300 characters");
    o[k] = v.trim() ? v.trim() : null;
  }
  if (has("code")) {
    const v = body.code;
    if (v !== null && (typeof v !== "string" || v.length > 24)) throw bad("invalid_code", "the colour / style code is up to 24 characters");
    o.code = v && v.trim() ? v.trim() : null;
  }
  if (has("shape") || !cur || has("kind")) {
    if (!has("shape")) throw bad("invalid_shape", "a new kind needs a new shape");
    o.shape = JSON.stringify(cleanShape(kind, body.shape));
  }
  return o;
}

/** strict wording check of every text field: [{field, codes}] (empty = clean) @param {Record<string, any>} row */
export function lintEntry(row) {
  /** @type {{field: string, codes: string[]}[]} */
  const out = [];
  for (const f of TEXT) {
    const v = row[f];
    if (v == null || v === "") continue;
    const codes = [...new Set(LookLint.lintLook(String(v)).map((/** @type {any} */ h) => String(h.code)))];
    if (codes.length) out.push({ field: f, codes });
  }
  return out;
}
const lintCodes = (/** @type {{codes: string[]}[]} */ l) => [...new Set(l.flatMap(x => x.codes))];
const lintError = (/** @type {{field: string, codes: string[]}[]} */ l) =>
  new HttpError(422, "the wording check refused this text; change the words and save again (lint_failed)", { code: "lint_failed", fields: l });

/* ---------------- storage ---------------- */
/** @param {any} r */
const adminView = r => ({
  id: r.id, kind: r.kind, name_th: r.name_th, name_en: r.name_en, name_zh: r.name_zh, desc_th: r.desc_th, desc_en: r.desc_en, desc_zh: r.desc_zh,
  code: r.code, shape: JSON.parse(r.shape), rights_ok: !!r.rights_ok, status: r.status, version: Number(r.version), approved_version: r.approved_version == null ? null : Number(r.approved_version),
  approved_by: r.approved_by, approved_at: r.approved_at, reject_reason: r.reject_reason, created_by: r.created_by, updated_by: r.updated_by,
  created_at: r.created_at, updated_at: r.updated_at, lint: lintEntry(r)
});
/** @param {any} r */
const publicView = r => ({
  id: r.id, kind: r.kind, status: "approved", version: Number(r.version),
  name: { th: r.name_th, en: r.name_en || "", zh: r.name_zh || "" }, desc: { th: r.desc_th || "", en: r.desc_en || "", zh: r.desc_zh || "" },
  code: r.code || "", shape: JSON.parse(r.shape)
});
/** @param {any} env @param {string} id */
const getRow = async (env, id) => env.DB.prepare("SELECT * FROM look_salon_entries WHERE id = ?1 AND salon = ?2").bind(id, SALON).first();
/** @param {any} env @param {string} id */
async function mustRow(env, id) {
  const r = ID_RE.test(id) ? await getRow(env, id) : null;
  if (!r) throw new HttpError(404, "entry not found", { code: "not_found" });
  return r;
}
/** history row (no text values) @param {any} env @param {string} entryId @param {number|null} version @param {string} action
 *  @param {string} actor @param {string|null} from @param {string|null} to @param {Record<string, any>|null} detail */
const event = (env, entryId, version, action, actor, from, to, detail) =>
  env.DB.prepare("INSERT INTO look_salon_events (entry_id, version, action, actor, from_status, to_status, detail, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
    .bind(entryId, version, action, actor, from, to, detail ? JSON.stringify(detail) : null, now());

/**
 * Admin router for /look-salon/*. `act(action, detail)` writes the central audit row (index.js). Returns a Response body
 * object + status, or null when no route matched.
 * @param {any} env @param {string} m @param {string} route @param {() => Promise<any>} body
 * @param {{actor: string, name: string, role: string}} who @param {(a: string, d: any) => Promise<void>} act
 * @returns {Promise<{status: number, body: any} | null>}
 */
export async function adminRoute(env, m, route, body, who, act) {
  if (route === "/look-salon/entries" && m === "GET") {
    const rows = (await env.DB.prepare("SELECT * FROM look_salon_entries WHERE salon = ?1 ORDER BY updated_at DESC, id").bind(SALON).all()).results || [];
    return { status: 200, body: { entries: rows.map(adminView), can_approve: canApprove(env, who), approvers: approverRoles(env), kinds: KINDS,
      liner_styles: LINER_STYLES, cards: CARDS, reject_reasons: REJECT_REASONS } };
  }
  if (route === "/look-salon/entries" && m === "POST") {
    const o = cleanEntry(await body());
    const l = lintEntry(o);
    if (l.length) {
      await act("look_salon.lint_refused", { fields: l.map(x => x.field), hits: lintCodes(l) });
      throw lintError(l);
    }
    const id = randomId(6), t = now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO look_salon_entries (id, salon, kind, name_th, name_en, name_zh, desc_th, desc_en, desc_zh, code, shape, rights_ok, rights_at, status, version, " +
        "created_by, updated_by, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12, 'pending', 1, ?13, ?13, ?12, ?12)")
        .bind(id, SALON, o.kind, o.name_th, o.name_en ?? null, o.name_zh ?? null, o.desc_th ?? null, o.desc_en ?? null, o.desc_zh ?? null, o.code ?? null, o.shape, t, who.actor),
      event(env, id, 1, "created", who.actor, null, "pending", { kind: o.kind, fields: Object.keys(o).filter(k => k !== "rights_ok") })
    ]);
    await act("look_salon.created", { id, kind: o.kind, version: 1, status: "pending" });
    return { status: 201, body: { entry: adminView(await getRow(env, id)) } };
  }
  const mm = /^\/look-salon\/entries\/([a-f0-9]{12})(\/approve|\/reject|\/hide|\/history)?$/.exec(route);
  if (!mm) return null;
  const id = mm[1], sub = mm[2] || "";
  if (sub === "" && m === "PUT") {
    const cur = await mustRow(env, id);
    const o = cleanEntry(await body(), cur);
    // only real changes count; an edit that changes nothing is refused (never a silent re-approval)
    const changed = Object.keys(o).filter(k => k !== "rights_ok" && String(o[k] ?? "") !== String(cur[k] ?? ""));
    if (!changed.length) throw bad("no_change", "nothing was changed");
    const next = { ...cur, ...o };
    const l = lintEntry(next);
    if (l.length) {
      await env.DB.batch([event(env, id, Number(cur.version), "lint_refused", who.actor, cur.status, cur.status, { fields: l.map(x => x.field), hits: lintCodes(l) })]);
      await act("look_salon.lint_refused", { id, version: Number(cur.version), fields: l.map(x => x.field), hits: lintCodes(l) });
      throw lintError(l);
    }
    const v = Number(cur.version) + 1, t = now();
    const sets = changed.map((k, i) => `${k} = ?${i + 6}`).join(", ");
    const res = await env.DB.prepare(`UPDATE look_salon_entries SET ${sets}, status = 'pending', version = ?1, approved_version = NULL, approved_by = NULL, ` +
      "approved_at = NULL, reject_reason = NULL, rights_ok = 1, rights_at = ?2, updated_by = ?3, updated_at = ?2 WHERE id = ?4 AND version = ?5")
      .bind(v, t, who.actor, id, Number(cur.version), ...changed.map(k => o[k] ?? null)).run();
    if (!res.meta || res.meta.changes !== 1) throw new HttpError(409, "someone else changed this entry; reload and try again (stale_version)", { code: "stale_version" });
    await env.DB.batch([event(env, id, v, "updated", who.actor, cur.status, "pending", { fields: changed })]);
    await act("look_salon.updated", { id, version: v, fields: changed, from: cur.status, to: "pending" });
    return { status: 200, body: { entry: adminView(await getRow(env, id)) } };
  }
  if (sub === "/approve" && m === "POST") {
    const cur = await mustRow(env, id);
    const b = await body();
    const refuse = async (/** @type {string} */ why, /** @type {any} */ err, /** @type {Record<string, any>} */ extra = {}) => {
      await env.DB.batch([event(env, id, Number(cur.version), "approve_refused", who.actor, cur.status, cur.status, { why, ...extra })]);
      await act("look_salon.approve_refused", { id, version: Number(cur.version), why, ...extra });
      throw err;
    };
    if (!canApprove(env, who)) {
      await refuse("approver_not_allowed", new HttpError(403, "only the LENSIQ owner may approve salon entries on this server (approver_not_allowed)", { code: "approver_not_allowed" }));
    }
    if (!Number.isInteger(b.version)) throw bad("invalid_version", "send the version you reviewed");
    if (cur.status !== "pending") await refuse("not_pending", new HttpError(409, "only a pending entry can be approved (not_pending)", { code: "not_pending" }));
    if (b.version !== Number(cur.version)) {
      await refuse("stale_version", new HttpError(409, "the entry changed after you opened it; review the new version (stale_version)", { code: "stale_version" }));
    }
    const l = lintEntry(cur);
    if (l.length) await refuse("lint_failed", lintError(l), { fields: l.map(x => x.field), hits: lintCodes(l) });
    if (!cur.rights_ok) await refuse("rights_required", bad("rights_required", "the rights box is not ticked"));
    const t = now();
    const res = await env.DB.prepare("UPDATE look_salon_entries SET status = 'approved', approved_version = version, approved_by = ?1, approved_at = ?2 " +
      "WHERE id = ?3 AND version = ?4 AND status = 'pending'").bind(who.actor, t, id, b.version).run();
    if (!res.meta || res.meta.changes !== 1) await refuse("stale_version", new HttpError(409, "the entry changed after you opened it (stale_version)", { code: "stale_version" }));
    await env.DB.batch([event(env, id, b.version, "approved", who.actor, "pending", "approved", null)]);
    await act("look_salon.approved", { id, version: b.version, from: "pending", to: "approved" });
    return { status: 200, body: { entry: adminView(await getRow(env, id)) } };
  }
  if (sub === "/reject" && m === "POST") {
    const cur = await mustRow(env, id);
    const b = await body();
    for (const k of Object.keys(b)) if (!["version", "reason"].includes(k)) throw bad("unknown_field", "unknown field: " + k.slice(0, 40));
    if (!REJECT_REASONS.includes(b.reason)) throw bad("invalid_reason", "choose a reason from the list");
    if (!Number.isInteger(b.version)) throw bad("invalid_version", "send the version you reviewed");
    if (cur.status !== "pending") throw new HttpError(409, "only a pending entry can be sent back (not_pending)", { code: "not_pending" });
    const res = await env.DB.prepare("UPDATE look_salon_entries SET status = 'rejected', reject_reason = ?1, updated_at = ?2 WHERE id = ?3 AND version = ?4 AND status = 'pending'")
      .bind(b.reason, now(), id, b.version).run();
    if (!res.meta || res.meta.changes !== 1) throw new HttpError(409, "the entry changed after you opened it (stale_version)", { code: "stale_version" });
    await env.DB.batch([event(env, id, b.version, "rejected", who.actor, "pending", "rejected", { reason: b.reason })]);
    await act("look_salon.rejected", { id, version: b.version, reason: b.reason, from: "pending", to: "rejected" });
    return { status: 200, body: { entry: adminView(await getRow(env, id)) } };
  }
  if (sub === "/hide" && m === "POST") {
    const cur = await mustRow(env, id);
    if (cur.status === "hidden") throw new HttpError(409, "already hidden (not_changed)", { code: "not_changed" });
    await env.DB.prepare("UPDATE look_salon_entries SET status = 'hidden', updated_at = ?1 WHERE id = ?2").bind(now(), id).run();
    await env.DB.batch([event(env, id, Number(cur.version), "hidden", who.actor, cur.status, "hidden", null)]);
    await act("look_salon.hidden", { id, version: Number(cur.version), from: cur.status, to: "hidden" });
    return { status: 200, body: { entry: adminView(await getRow(env, id)) } };
  }
  if (sub === "/history" && m === "GET") {
    await mustRow(env, id);
    const rows = (await env.DB.prepare("SELECT version, action, actor, from_status, to_status, detail, at FROM look_salon_events WHERE entry_id = ?1 ORDER BY id").bind(id).all()).results || [];
    return { status: 200, body: { events: rows.map((/** @type {any} */ r) => ({ version: r.version, action: r.action, actor: r.actor, from: r.from_status, to: r.to_status,
      detail: r.detail ? JSON.parse(r.detail) : null, at: r.at })) } };
  }
  return null;
}

/** GET /v1/look/salon/catalog: approved entries only, re-linted now (an entry whose stored text fails is dropped) @param {any} env */
export async function publicCatalog(env) {
  const rows = (await env.DB.prepare("SELECT * FROM look_salon_entries WHERE salon = ?1 AND status = 'approved' AND approved_version = version ORDER BY id").bind(SALON).all()).results || [];
  return { entries: rows.filter((/** @type {any} */ r) => KINDS.includes(r.kind) && !lintEntry(r).length).map(publicView) };
}
