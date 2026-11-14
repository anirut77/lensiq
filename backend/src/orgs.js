// @ts-check
// backend/src/orgs.js — organisation account LITE (stream G, owner decision 2026-11-13): organisation name, billing
// details, admins and staff, invitations, a per-organisation audit log, and licence orders entered in the back office
// after a quotation and a bank transfer (no online payment). NO syncing of the customer's people data: there is no
// table, route or field for employees, plates, residents, candidates or any other record about the customer's people —
// that data stays on the customer's devices (unknown request fields are refused with unknown_field).
//
// Member side (Authorization: Bearer <member token>):
//   GET    /api/me/orgs                               my organisations + role
//   GET    /api/orgs/:id                              any member: name + own role; admins also billing, members, invitations
//   POST   /api/orgs/:id/profile {name?, billing?}    admin
//   POST   /api/orgs/:id/invites {role, email?}       admin -> {invite_id, link_path "account.html#org_invite=<token>", expires_at}
//   DELETE /api/orgs/:id/invites/:inviteId            admin (revoke)
//   POST   /api/org-invites/accept {token}            any signed-in member
//   POST   /api/orgs/:id/members/:userId/role {role}  admin + fresh confirmation; the owner is protected
//   DELETE /api/orgs/:id/members/:userId              admin + fresh confirmation, or a member leaving (not the owner)
//   POST   /api/orgs/:id/transfer {user_id}           owner + fresh confirmation, to an active admin
//   GET    /api/orgs/:id/audit                        admin: entries + chain_ok
//   GET    /api/orgs/:id/licences                     any member: licence status per product, the 14-day offline window
//                                                     and the free tiers (counted on the device, NOT enforced)
//   GET|POST /api/orgs/:id/export {credential?, nonce?} admin + fresh confirmation: the organisation's own data as
//                                                     lensiq-org-export v1 (org-p1). ALWAYS available (owner decision
//                                                     2026-11-13 "export always"): also suspended / closed, any licence state
// org-p1 (order 2026-11-14): OFF unless the Worker var ORG_ACCOUNTS = "on" (orgsEnabled). Off: every member-side and
// back-office organisation route answers 404 org_accounts_off before any session or database lookup (index.js), and
// /v1/config + /admin/api/me report org_accounts: false. The pages also need window.LENSIQ_ORG_ACCOUNTS = true.
// Back office (LENSIQ owner, /admin/api, see index.js): orgs list / create (+ owner invitation), detail, update (status
// change needs re-auth), owner-invite (re-auth), licence orders add / cancel (re-auth), audit, licence-plans.
// Roles: admin (one of them is_owner) and staff. Unknown organisation, or not a member: 404 (no existence leak).
// Suspended organisation: reads and leaving still work; every other member-side change answers 403 org_suspended.
import { kekHmacHex, randomId, randomToken, sha256Hex } from "./crypto.js";
import { FREE_TIERS, FREE_TIER_ENFORCE, OFFLINE_LICENCE_DAYS, offlineUntil } from "./freetier.js";
import { requireFreshMember } from "./members.js";
import { actorRef, orgAudit, verifyOrgAudit } from "./orgaudit.js";
import { audit, hit } from "./store.js";
import { HttpError, now } from "./util.js";

export { verifyOrgAudit };
export const INVITE_TTL = 72 * 3600;
/** org-p1 off switch: only the var value "on" (trimmed, any case) switches organisation accounts on. @param {any} env */
export const orgsEnabled = env => String((env && env.ORG_ACCOUNTS) || "").trim().toLowerCase() === "on";
export const ORGS_OFF_BODY = { error: "organisation accounts are not enabled (org_accounts_off)", code: "org_accounts_off" };
/** member-side paths behind the switch @param {string} p */
export const isOrgMemberPath = p => p === "/api/me/orgs" || p === "/api/orgs" || p.startsWith("/api/orgs/") || p === "/api/org-invites/accept";
/** back-office routes (after /admin/api) behind the switch @param {string} route */
export const isOrgAdminRoute = route => route === "/orgs" || route.startsWith("/orgs/") || route === "/licence-plans";
export const EXPORT_PER_HOUR = 30;
const ROLES = ["admin", "staff"];
const STATUSES = ["active", "suspended", "closed"];
const ID_RE = /^[a-f0-9]{32}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{1,60}$/;
const BILLING = { name: 120, tax_id: 13, address: 300, branch: 60, email: 254 };

const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n + 1);
const notFound = () => new HttpError(404, "organisation not found", { code: "org_not_found" });
const forbidden = () => new HttpError(403, "not allowed for your role in this organisation (org_forbidden)", { code: "org_forbidden" });
const unknownField = k => new HttpError(400, `unknown field ${String(k).slice(0, 32)} (unknown_field)`, { code: "unknown_field" });
const onlyKeys = (body, keys) => { for (const k of Object.keys(body || {})) if (!keys.includes(k)) throw unknownField(k); };

/** @param {any} v */
function orgName(v) {
  const s = clean(v, 120);
  if (s.length < 2 || s.length > 120) throw new HttpError(400, "organisation name must be 2–120 characters");
  return s;
}

/** Validates a billing patch; returns {column: value|null}. Empty string clears a field. */
function billingPatch(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new HttpError(400, "billing must be an object");
  onlyKeys(b, Object.keys(BILLING));
  /** @type {Record<string, string|null>} */
  const out = {};
  for (const [k, max] of Object.entries(BILLING)) {
    if (!(k in b)) continue;
    const v = clean(b[k], max);
    if (v.length > max) throw new HttpError(400, `billing ${k} is too long (max ${max})`);
    if (v && k === "tax_id" && !/^\d{13}$/.test(v)) throw new HttpError(400, "tax id must be 13 digits");
    if (v && k === "email" && !EMAIL_RE.test(v)) throw new HttpError(400, "billing e-mail is not valid");
    out["billing_" + k] = v ? (k === "email" ? v.toLowerCase() : v) : null;
  }
  return out;
}
const billingOf = o => ({ name: o.billing_name ?? null, tax_id: o.billing_tax_id ?? null, address: o.billing_address ?? null, branch: o.billing_branch ?? null, email: o.billing_email ?? null });
const publicOrg = o => ({ id: o.id, name: o.name, status: o.status });

async function updateOrg(db, orgId, name, patch, t) {
  const sets = [], args = [];
  if (name != null) { sets.push("name = ?"); args.push(name); }
  for (const [c, v] of Object.entries(patch || {})) { sets.push(`${c} = ?`); args.push(v); }
  if (!sets.length) return;
  sets.push("updated_at = ?"); args.push(t);
  await db.prepare(`UPDATE orgs SET ${sets.join(", ")} WHERE id = ?`).bind(...args, orgId).run();
}

async function newInvite(env, orgId, { role, owner = false, email = null, byRef }, t) {
  let emailHmac = null;
  if (email) {
    emailHmac = await kekHmacHex(env.SECRETS_KEK, "lensiq-org-invite-email", String(email).toLowerCase());
    if (!emailHmac) throw new HttpError(503, "e-mail-bound invitations need SECRETS_KEK on the server (kek_missing)", { code: "kek_missing" });
  }
  const id = randomId(16), token = randomToken(32);
  await env.DB.prepare("INSERT INTO org_invites (id, org_id, role, owner_invite, token_hash, email_hmac, created_by_ref, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")
    .bind(id, orgId, role, owner ? 1 : 0, await sha256Hex(token), emailHmac, byRef, t, t + INVITE_TTL).run();
  const path = "account.html#org_invite=" + token;
  // absolute link when SITE_URL (the public site, may include a path such as /lensiq) is set; else the page path only
  const base = String(env.SITE_URL || "").trim().replace(/\/+$/, "");
  const link = /^https:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._~-]+)*$/.test(base) ? base + "/" + path : null;
  return { invite_id: id, link_path: path, link, expires_at: t + INVITE_TTL, role, owner_invite: owner };
}

// ---- member side ------------------------------------------------------------------------------------------------------

/** The caller's membership in an organisation (404 when unknown, closed or not a member; `allowClosed` only for export). */
async function membership(env, mem, orgId, { allowClosed = false } = {}) {
  if (!ID_RE.test(String(orgId || ""))) throw notFound();
  const r = await env.DB.prepare("SELECT o.*, m.role AS m_role, m.is_owner AS m_owner, m.status AS m_status FROM orgs o JOIN org_members m ON m.org_id = o.id " +
    "WHERE o.id = ?1 AND m.user_id = ?2").bind(orgId, mem.user.id).first();
  if (!r || (r.status === "closed" && !allowClosed) || r.m_status !== "active") throw notFound();
  return { org: r, role: String(r.m_role), owner: r.m_owner === 1, ref: await actorRef(mem.user.id) };
}
const needAdmin = ms => { if (ms.role !== "admin") throw forbidden(); };
const needActive = ms => { if (ms.org.status !== "active") throw new HttpError(403, "this organisation is suspended (org_suspended)", { code: "org_suspended" }); };

export async function myOrgs(env, mem) {
  const rows = (await env.DB.prepare("SELECT o.id, o.name, o.status, m.role, m.is_owner FROM org_members m JOIN orgs o ON o.id = m.org_id " +
    "WHERE m.user_id = ?1 AND m.status = 'active' AND (o.status != 'closed' OR m.role = 'admin') ORDER BY o.name").bind(mem.user.id).all()).results || [];
  // org-p1b (review L1): a closed organisation stays listed for its admins as export-only (export is always available);
  // every other route of it answers 404
  return { orgs: rows.map(r => ({ id: r.id, name: r.name, status: r.status, role: r.role, is_owner: r.is_owner === 1, export_only: r.status === "closed" })) };
}

async function membersOf(db, orgId) {
  const rows = (await db.prepare("SELECT m.user_id, u.display_name, u.email, m.role, m.is_owner, m.status, m.created_at FROM org_members m JOIN users u ON u.id = m.user_id " +
    "WHERE m.org_id = ?1 ORDER BY m.is_owner DESC, m.created_at").bind(orgId).all()).results || [];
  return rows.map(r => ({ user_id: r.user_id, display_name: r.display_name || null, email: r.email || null, role: r.role, is_owner: r.is_owner === 1, status: r.status, created_at: r.created_at }));
}
async function openInvites(db, orgId, t) {
  const rows = (await db.prepare("SELECT id, role, owner_invite, email_hmac, created_at, expires_at FROM org_invites " +
    "WHERE org_id = ?1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?2 ORDER BY created_at DESC")
    .bind(orgId, t).all()).results || [];
  return rows.map(r => ({ id: r.id, role: r.role, owner_invite: r.owner_invite === 1, email_bound: !!r.email_hmac, created_at: r.created_at, expires_at: r.expires_at }));
}

export async function orgView(env, mem, orgId) {
  const ms = await membership(env, mem, orgId);
  const out = { org: publicOrg(ms.org), role: ms.role, is_owner: ms.owner };
  if (ms.role !== "admin") return out;
  return { ...out, billing: billingOf(ms.org), members: await membersOf(env.DB, orgId), invites: await openInvites(env.DB, orgId, now()) };
}

export async function updateProfile(env, mem, orgId, body) {
  const ms = await membership(env, mem, orgId);
  needAdmin(ms); needActive(ms);
  if (!body || typeof body !== "object") throw new HttpError(400, "invalid request");
  onlyKeys(body, ["name", "billing"]);
  const t = now();
  const name = body.name != null ? orgName(body.name) : null;
  const patch = body.billing != null ? billingPatch(body.billing) : null;
  if (name == null && !patch) throw new HttpError(400, "nothing to change");
  await updateOrg(env.DB, orgId, name, patch, t);
  if (name != null) await orgAudit(env.DB, orgId, { actorKind: "user", actorRef: ms.ref, action: "org.renamed" }, t);
  if (patch) await orgAudit(env.DB, orgId, { actorKind: "user", actorRef: ms.ref, action: "org.billing.updated", detail: { fields: Object.keys(patch).map(k => k.slice(8)) } }, t);
  return { ok: true };
}

export async function createInvite(env, mem, orgId, body) {
  const ms = await membership(env, mem, orgId);
  needAdmin(ms); needActive(ms);
  if (!body || typeof body !== "object") throw new HttpError(400, "invalid request");
  onlyKeys(body, ["role", "email"]);
  if (!ROLES.includes(body.role)) throw new HttpError(400, "role must be admin or staff");
  let email = null;
  if (body.email != null && body.email !== "") {
    email = clean(body.email, 254);
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "invitation e-mail is not valid");
  }
  const t = now();
  const rl = await hit(env.DB, `orginv:${orgId}`, 30, 3600, t);
  if (!rl.ok) throw new HttpError(429, "too many invitations this hour — try again later", { retryAfter: rl.retryAfter });
  const inv = await newInvite(env, orgId, { role: body.role, email, byRef: ms.ref }, t);
  await orgAudit(env.DB, orgId, { actorKind: "user", actorRef: ms.ref, action: "invite.created", ref: inv.invite_id, detail: { role: body.role, email_bound: !!email } }, t);
  return inv;
}

export async function revokeInvite(env, mem, orgId, inviteId) {
  const ms = await membership(env, mem, orgId);
  needAdmin(ms);
  if (!ID_RE.test(String(inviteId || ""))) throw new HttpError(404, "invitation not found");
  const t = now();
  const r = await env.DB.prepare("UPDATE org_invites SET revoked_at = ?1 WHERE id = ?2 AND org_id = ?3 AND accepted_at IS NULL AND revoked_at IS NULL").bind(t, inviteId, orgId).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(404, "invitation not found");
  await orgAudit(env.DB, orgId, { actorKind: "user", actorRef: ms.ref, action: "invite.revoked", ref: inviteId }, t);
  return { ok: true };
}

export async function acceptInvite(env, mem, body) {
  if (!body || typeof body.token !== "string" || !TOKEN_RE.test(body.token)) throw new HttpError(400, "invitation token required");
  onlyKeys(body, ["token"]);
  const t = now();
  const rl = await hit(env.DB, `orgacc:${mem.user.id}`, 20, 900, t);
  if (!rl.ok) throw new HttpError(429, "too many attempts — try again later", { retryAfter: rl.retryAfter });
  const gone = () => new HttpError(410, "this invitation is no longer valid — ask for a new one (invite_invalid)", { code: "invite_invalid" });
  const inv = await env.DB.prepare("SELECT i.*, o.name AS org_name, o.status AS org_status FROM org_invites i JOIN orgs o ON o.id = i.org_id WHERE i.token_hash = ?1")
    .bind(await sha256Hex(body.token)).first();
  if (!inv || inv.accepted_at || inv.revoked_at || inv.expires_at <= t || inv.org_status === "closed") throw gone();
  if (inv.email_hmac) {
    const mine = mem.user.email ? await kekHmacHex(env.SECRETS_KEK, "lensiq-org-invite-email", String(mem.user.email).toLowerCase()) : null;
    if (!mine || mine !== inv.email_hmac) throw new HttpError(403, "this invitation was sent to another e-mail address (invite_email_mismatch)", { code: "invite_email_mismatch" });
  }
  const already = await env.DB.prepare("SELECT 1 AS x FROM org_members WHERE org_id = ?1 AND user_id = ?2").bind(inv.org_id, mem.user.id).first();
  if (already) throw new HttpError(409, "you are already a member of this organisation (already_member)", { code: "already_member" });
  const claim = await env.DB.prepare("UPDATE org_invites SET accepted_at = ?1 WHERE id = ?2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?1").bind(t, inv.id).run();
  if (!claim.meta || !claim.meta.changes) throw gone();
  const owner = inv.owner_invite === 1;
  const role = owner ? "admin" : String(inv.role);
  const prevOwner = owner ? await env.DB.prepare("SELECT user_id FROM org_members WHERE org_id = ?1 AND is_owner = 1").bind(inv.org_id).first() : null;
  const others = owner ? ((await env.DB.prepare("SELECT id FROM org_invites WHERE org_id = ?1 AND owner_invite = 1 AND accepted_at IS NULL AND revoked_at IS NULL AND id != ?2")
    .bind(inv.org_id, inv.id).all()).results || []).map(r => String(r.id)) : [];
  await env.DB.batch([
    ...(owner ? [env.DB.prepare("UPDATE org_members SET is_owner = 0 WHERE org_id = ?1").bind(inv.org_id),
      // security review L2: an accepted owner link revokes every other open owner link of the organisation
      env.DB.prepare("UPDATE org_invites SET revoked_at = ?1 WHERE org_id = ?2 AND owner_invite = 1 AND accepted_at IS NULL AND revoked_at IS NULL AND id != ?3").bind(t, inv.org_id, inv.id)] : []),
    env.DB.prepare("INSERT INTO org_members (org_id, user_id, role, is_owner, status, created_at) VALUES (?1, ?2, ?3, ?4, 'active', ?5)").bind(inv.org_id, mem.user.id, role, owner ? 1 : 0, t)
  ]);
  const ref = await actorRef(mem.user.id);
  const org = String(inv.org_id);
  for (const id of others) await orgAudit(env.DB, org, { actorKind: "system", action: "invite.revoked", ref: id, detail: { reason: "owner_link_used" } }, t);
  if (prevOwner) await orgAudit(env.DB, org, { actorKind: "system", action: "org.owner_replaced", ref: await actorRef(String(prevOwner.user_id)), detail: { via: "owner_invite" } }, t);
  await orgAudit(env.DB, org, { actorKind: "user", actorRef: ref, action: "member.joined", ref: inv.id, detail: { role, owner } }, t);
  return { org: { id: inv.org_id, name: inv.org_name }, role, is_owner: owner };
}

async function targetOf(db, orgId, userId) {
  if (!ID_RE.test(String(userId || ""))) throw new HttpError(404, "member not found");
  const r = await db.prepare("SELECT * FROM org_members WHERE org_id = ?1 AND user_id = ?2").bind(orgId, userId).first();
  if (!r) throw new HttpError(404, "member not found");
  return r;
}
const ownerProtected = () => new HttpError(403, "the organisation owner cannot be changed or removed — transfer ownership first (org_owner_protected)", { code: "org_owner_protected" });

export async function setRole(env, mem, orgId, userId, body, deps = {}) {
  const ms = await membership(env, mem, orgId);
  needAdmin(ms); needActive(ms);
  onlyKeys(body, ["role", "credential", "nonce"]);
  await requireFreshMember(env, mem, body, deps);
  const role = body && body.role;
  if (!ROLES.includes(role)) throw new HttpError(400, "role must be admin or staff");
  const tg = await targetOf(env.DB, orgId, userId);
  if (tg.is_owner === 1) throw ownerProtected();
  const t = now();
  await env.DB.prepare("UPDATE org_members SET role = ?1 WHERE org_id = ?2 AND user_id = ?3").bind(role, orgId, userId).run();
  await orgAudit(env.DB, orgId, { actorKind: "user", actorRef: ms.ref, action: "member.role_changed", ref: await actorRef(userId), detail: { role } }, t);
  return { ok: true, role };
}

export async function removeMember(env, mem, orgId, userId, body, deps = {}) {
  const ms = await membership(env, mem, orgId);
  const self = userId === mem.user.id;
  onlyKeys(body, ["credential", "nonce"]);
  const tg = await targetOf(env.DB, orgId, userId);
  if (tg.is_owner === 1) throw ownerProtected();
  if (!self) { needAdmin(ms); needActive(ms); await requireFreshMember(env, mem, body, deps); }
  const t = now();
  await env.DB.prepare("DELETE FROM org_members WHERE org_id = ?1 AND user_id = ?2").bind(orgId, userId).run();
  await orgAudit(env.DB, orgId, { actorKind: "user", actorRef: ms.ref, action: self ? "member.left" : "member.removed", ref: await actorRef(userId) }, t);
  return { ok: true };
}

export async function transferOwner(env, mem, orgId, body, deps = {}) {
  const ms = await membership(env, mem, orgId);
  if (!ms.owner) throw forbidden();
  needActive(ms);
  onlyKeys(body, ["user_id", "credential", "nonce"]);
  await requireFreshMember(env, mem, body, deps);
  const uid = body && body.user_id;
  const tg = ID_RE.test(String(uid || "")) ? await env.DB.prepare("SELECT * FROM org_members WHERE org_id = ?1 AND user_id = ?2").bind(orgId, uid).first() : null;
  if (!tg || tg.role !== "admin" || tg.status !== "active" || uid === mem.user.id) throw new HttpError(409,
      "ownership can only go to another active admin of this organisation (transfer_target)", { code: "transfer_target" });
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE org_members SET is_owner = 0 WHERE org_id = ?1").bind(orgId),
    env.DB.prepare("UPDATE org_members SET is_owner = 1 WHERE org_id = ?1 AND user_id = ?2").bind(orgId, uid)
  ]);
  await orgAudit(env.DB, orgId, { actorKind: "user", actorRef: ms.ref, action: "org.owner_transferred", ref: await actorRef(String(uid)) }, t);
  return { ok: true };
}

/** Audit entries with actor names for current members (refs of former members show as null). */
async function auditEntries(db, orgId) {
  const rows = (await db.prepare("SELECT id, ts, actor_kind, actor_ref, action, ref, detail FROM org_audit WHERE org_id = ?1 ORDER BY id DESC LIMIT 200").bind(orgId).all()).results || [];
  const names = new Map();
  for (const m of await membersOf(db, orgId)) names.set(await actorRef(m.user_id), m.display_name || m.email || null);
  return rows.map(r => ({ id: r.id, ts: r.ts, actor_kind: r.actor_kind, actor: r.actor_kind === "lensiq_owner" ? "LENSIQ" : r.actor_ref ? names.get(r.actor_ref) ?? null : null,
    action: r.action, detail: r.detail ? JSON.parse(String(r.detail)) : null }));
}

export async function orgAuditView(env, mem, orgId) {
  const ms = await membership(env, mem, orgId);
  needAdmin(ms);
  return { chain_ok: (await verifyOrgAudit(env.DB, orgId)).ok, entries: await auditEntries(env.DB, orgId) };
}

// ---- export (org-p1) ----------------------------------------------------------------------------------------------------

const EXPORT_README = {
  th: "ไฟล์นี้คือข้อมูลบัญชีองค์กรของคุณจาก LENSIQ: ชื่อองค์กร ข้อมูลออกเอกสาร รายชื่อผู้ดูแลและเจ้าหน้าที่ (ชื่อ อีเมล สิทธิ์) ลิงก์เชิญที่ยังเปิดอยู่ (ไม่มีตัวลิงก์) " +
    "สถานะใบอนุญาต (ไม่มีจำนวนเงิน) และบันทึกการเปลี่ยนแปลงทั้งหมดขององค์กร ไม่มีข้อมูลพนักงาน ทะเบียนรถ ผู้สอบ ใบหน้า หรือภาพใด ๆ เพราะข้อมูลเหล่านั้นอยู่ในเครื่องของคุณเท่านั้น " +
    "ตรวจบันทึกเองได้: hash ของแต่ละรายการ = SHA-256 ของ prev_hash + \"|\" + JSON ของ [org_id, ts, actor_kind, actor_ref, action, ref, detail] และ prev_hash ของรายการแรกคือเลข 0 จำนวน 64 ตัว",
  en: "This file is your organisation account data from LENSIQ: the organisation name, billing details, admins and staff (name, e-mail, role), open invitations " +
    "(without the links), licence status (without amounts) and the organisation's full change log. It holds no employees, plates, candidates, faces or images: " +
    "that data stays on your devices. To verify the log yourself: each hash = SHA-256 of prev_hash + \"|\" + the JSON of [org_id, ts, actor_kind, actor_ref, " +
    "action, ref, detail]; the first prev_hash is 64 zeros.",
  zh: "本文件是您在 LENSIQ 的机构账户数据：机构名称、开票信息、管理员和工作人员（姓名、电子邮箱、角色）、尚未使用的邀请（不含链接）、许可证状态（不含金额）以及机构的完整变更日志。" +
    "其中不含员工、车牌、考生、人脸或任何图像：这些数据只保存在您的设备上。自行核验日志：每条的 hash = SHA-256(prev_hash + \"|\" + [org_id, ts, actor_kind, actor_ref, action, ref, detail] 的 JSON)，" +
    "第一条的 prev_hash 为 64 个 0。"
};

/**
 * The organisation's own data for its admins (design §7, lite: no synced records exist). Fresh confirmation required;
 * ALWAYS available whatever the organisation status (active / suspended / closed) or licence state. Never included:
 * invitation tokens or their hashes, e-mail HMACs, Google / LINE account ids, user ids, order references, amounts, notes.
 */
export async function exportOrg(env, mem, orgId, body, deps = {}) {
  const ms = await membership(env, mem, orgId, { allowClosed: true });
  needAdmin(ms);
  if (body != null) {
    if (typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "invalid request");
    onlyKeys(body, ["credential", "nonce"]);
  }
  await requireFreshMember(env, mem, body, deps);
  const t = now();
  // org-p1b (review L4): per organisation AND per person, so one admin at the cap never locks the other admins out
  const rl = await hit(env.DB, `orgexp:${orgId}:${mem.user.id}`, EXPORT_PER_HOUR, 3600, t);
  if (!rl.ok) throw new HttpError(429, "too many exports this hour — try again later", { retryAfter: rl.retryAfter });
  const db = env.DB, o = ms.org;
  const members = (await membersOf(db, orgId)).map(m => ({ display_name: m.display_name, email: m.email, role: m.role, is_owner: m.is_owner, status: m.status, joined_at: m.created_at }));
  const invites = (await openInvites(db, orgId, t)).map(i => ({ role: i.role, owner_invite: i.owner_invite, email_bound: i.email_bound, created_at: i.created_at, expires_at: i.expires_at }));
  const licences = ((await db.prepare("SELECT l.plan_id, p.product, p.unit, l.quantity, l.starts_at, l.ends_at, l.status FROM org_licences l JOIN licence_plans p ON p.id = l.plan_id " +
    "WHERE l.org_id = ?1 ORDER BY l.starts_at, l.created_at").bind(orgId).all()).results || [])
    .map(r => ({ plan_id: r.plan_id, product: r.product, unit: r.unit, quantity: r.quantity, starts_at: r.starts_at, ends_at: r.ends_at, status: r.status }));
  const entries = ((await db.prepare("SELECT id, org_id, ts, actor_kind, actor_ref, action, ref, detail, prev_hash, hash FROM org_audit WHERE org_id = ?1 ORDER BY id").bind(orgId).all()).results || [])
    .map(r => ({ id: r.id, org_id: r.org_id, ts: r.ts, actor_kind: r.actor_kind, actor_ref: r.actor_ref ?? null, action: r.action, ref: r.ref ?? null, detail: r.detail ?? null,
      prev_hash: r.prev_hash, hash: r.hash }));
  const out = {
    format: "lensiq-org-export", v: 1, exported_at: t, org: publicOrg(o), billing: billingOf(o), members, invites, licences,
    audit: { chain_ok: (await verifyOrgAudit(db, orgId)).ok, entries }, readme: EXPORT_README
  };
  await orgAudit(db, orgId, { actorKind: "user", actorRef: ms.ref, action: "org.exported",
    detail: { members: members.length, invites: invites.length, licences: licences.length, audit: entries.length } }, t);
  return out;
}

/** Licence status per product for devices: an active licence that has not ended (it may start later). */
export async function licenceStatus(db, orgId, t = now()) {
  const rows = (await db.prepare("SELECT l.id, l.plan_id, p.product, p.unit, l.quantity, l.starts_at, l.ends_at, l.status FROM org_licences l JOIN licence_plans p ON p.id = l.plan_id " +
    "WHERE l.org_id = ?1 ORDER BY l.starts_at").bind(orgId).all()).results || [];
  /** @type {Record<string, any>} */
  const products = {};
  for (const p of Object.keys(FREE_TIERS)) {
    const live = rows.filter(r => r.product === p && r.status === "active" && r.ends_at > t);
    if (!live.length) { products[p] = { licensed: false }; continue; }
    const ends = Math.max(...live.map(r => Number(r.ends_at)));
    products[p] = { licensed: true, quantity: live.reduce((a, r) => a + Number(r.quantity), 0), starts_at: Math.min(...live.map(r => Number(r.starts_at))), ends_at: ends,
        offline_until: offlineUntil(t, ends) };
  }
  return {
    checked_at: t, offline_days: OFFLINE_LICENCE_DAYS, enforced: FREE_TIER_ENFORCE, free_tiers: FREE_TIERS, products,
    licences: rows.map(r => ({ id: r.id, plan_id: r.plan_id, product: r.product, unit: r.unit, quantity: r.quantity, starts_at: r.starts_at, ends_at: r.ends_at, status: r.status }))
  };
}

export async function orgLicences(env, mem, orgId) {
  await membership(env, mem, orgId);
  return licenceStatus(env.DB, orgId);
}

// ---- back office (LENSIQ owner) ---------------------------------------------------------------------------------------

const ownerAct = (env, orgId, action, ref = null, detail = null, t = now()) => orgAudit(env.DB, orgId, { actorKind: "lensiq_owner", action, ref, detail }, t);

export async function adminListOrgs(env) {
  const rows = (await env.DB.prepare("SELECT o.id, o.name, o.status, o.created_at, " +
    "(SELECT COUNT(*) FROM org_members m WHERE m.org_id = o.id) AS members, " +
    "(SELECT COUNT(*) FROM org_members m WHERE m.org_id = o.id AND m.is_owner = 1) AS owners, " +
    "(SELECT COUNT(*) FROM org_licences l WHERE l.org_id = o.id AND l.status = 'active' AND l.ends_at > ?1) AS licences " +
    "FROM orgs o ORDER BY o.created_at DESC LIMIT 500").bind(now()).all()).results || [];
  return { orgs: rows.map(r => ({ id: r.id, name: r.name, status: r.status, created_at: r.created_at, members: Number(r.members), licences: Number(r.licences),
      needs_owner: Number(r.owners) === 0 })) };
}

export async function adminCreateOrg(env, body) {
  if (!body || typeof body !== "object") throw new HttpError(400, "invalid request");
  onlyKeys(body, ["name", "billing"]);
  const name = orgName(body.name);
  const patch = body.billing != null ? billingPatch(body.billing) : null;
  const t = now(), id = randomId(16);
  await env.DB.prepare("INSERT INTO orgs (id, name, status, created_at, updated_at) VALUES (?1, ?2, 'active', ?3, ?3)").bind(id, name, t).run();
  if (patch) await updateOrg(env.DB, id, null, patch, t);
  await ownerAct(env, id, "org.created", null, null, t);
  const inv = await newInvite(env, id, { role: "admin", owner: true, byRef: "lensiq_owner" }, t);
  await ownerAct(env, id, "invite.created", inv.invite_id, { role: "admin", owner: true }, t);
  await audit(env, "owner", "org.created", { org: id });
  return { org: { id, name, status: "active" }, owner_invite: inv };
}

async function orgRow(db, id) {
  if (!ID_RE.test(String(id || ""))) throw notFound();
  const o = await db.prepare("SELECT * FROM orgs WHERE id = ?1").bind(id).first();
  if (!o) throw notFound();
  return o;
}

export async function adminOrg(env, id) {
  const o = await orgRow(env.DB, id);
  const members = (await membersOf(env.DB, id)).map(m => ({ display_name: m.display_name, role: m.role, is_owner: m.is_owner, status: m.status, created_at: m.created_at }));
  const licences = (await env.DB.prepare("SELECT l.*, p.product, p.unit FROM org_licences l JOIN licence_plans p ON p.id = l.plan_id " +
    "WHERE l.org_id = ?1 ORDER BY l.created_at DESC").bind(id).all()).results || [];
  return {
    org: publicOrg(o), created_at: o.created_at, billing: billingOf(o), members, needs_owner: !members.some(m => m.is_owner),
    invites: await openInvites(env.DB, id, now()), licences
  };
}

/** PUT /admin/api/orgs/:id {name?, status?, billing?} — the caller (index.js) requires re-auth when status is present. */
export async function adminUpdateOrg(env, id, body) {
  const o = await orgRow(env.DB, id);
  onlyKeys(body, ["name", "status", "billing"]);
  const t = now();
  const name = body.name != null ? orgName(body.name) : null;
  const patch = body.billing != null ? billingPatch(body.billing) : null;
  if (body.status != null && !STATUSES.includes(body.status)) throw new HttpError(400, "status must be active, suspended or closed");
  await updateOrg(env.DB, id, name, { ...(patch || {}), ...(body.status != null ? { status: body.status } : {}) }, t);
  if (name != null) await ownerAct(env, id, "org.renamed", null, null, t);
  if (patch) await ownerAct(env, id, "org.billing.updated", null, { fields: Object.keys(patch).map(k => k.slice(8)) }, t);
  if (body.status != null && body.status !== o.status) {
    await ownerAct(env, id, "org.status", null, { from: o.status, to: body.status }, t);
    await audit(env, "owner", "org.status", { org: id, to: body.status });
  }
  return adminOrg(env, id);
}

export async function adminOwnerInvite(env, id) {
  const o = await orgRow(env.DB, id);
  if (o.status === "closed") throw new HttpError(409, "organisation is closed");
  const t = now();
  const inv = await newInvite(env, id, { role: "admin", owner: true, byRef: "lensiq_owner" }, t);
  await ownerAct(env, id, "invite.created", inv.invite_id, { role: "admin", owner: true }, t);
  await audit(env, "owner", "org.owner_invite", { org: id });
  return inv;
}

const bkkDate = (s, what) => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new HttpError(400, `${what} must be YYYY-MM-DD`);
  const t = Date.parse(s + "T00:00:00+07:00") / 1000;
  if (!Number.isFinite(t)) throw new HttpError(400, `${what} is not a date`);
  return t;
};

/** POST /admin/api/orgs/:id/licences — a back-office order after a quotation and a bank transfer (re-auth in index.js). */
export async function adminAddLicence(env, id, body) {
  await orgRow(env.DB, id);
  onlyKeys(body, ["plan_id", "quantity", "starts_on", "ends_on", "order_ref", "amount_satang", "note"]);
  const plan = typeof body.plan_id === "string" ? await env.DB.prepare("SELECT * FROM licence_plans WHERE id = ?1").bind(body.plan_id).first() : null;
  if (!plan) throw new HttpError(400, "unknown licence plan");
  const q = body.quantity;
  if (!Number.isInteger(q) || q < 1 || q > 100000) throw new HttpError(400, "quantity must be an integer 1–100000");
  const starts = bkkDate(body.starts_on, "starts_on"), ends = bkkDate(body.ends_on, "ends_on");
  if (ends <= starts || ends - starts > 3 * 366 * 86400) throw new HttpError(400, "ends_on must be after starts_on (at most 3 years)");
  const amt = body.amount_satang;
  if (amt != null && !(Number.isInteger(amt) && amt >= 0 && amt <= 1e11)) throw new HttpError(400, "amount_satang must be a whole number of satang");
  const ref = body.order_ref != null ? clean(body.order_ref, 80) : "";
  const note = body.note != null ? clean(body.note, 300) : "";
  if (ref.length > 80 || note.length > 300) throw new HttpError(400, "order_ref max 80, note max 300 characters");
  const t = now(), lid = randomId(16);
  await env.DB.prepare("INSERT INTO org_licences (id, org_id, plan_id, quantity, starts_at, ends_at, status, order_ref, amount_satang, note, created_at) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7, ?8, ?9, ?10)")
    .bind(lid, id, plan.id, q, starts, ends, ref || null, amt ?? null, note || null, t).run();
  await ownerAct(env, id, "licence.added", lid, { plan: plan.id, quantity: q }, t);
  await audit(env, "owner", "org.licence.added", { org: id, licence: lid, plan: plan.id });
  return { licence: await env.DB.prepare("SELECT * FROM org_licences WHERE id = ?1").bind(lid).first() };
}

export async function adminSetLicence(env, id, lid, body) {
  await orgRow(env.DB, id);
  onlyKeys(body, ["status"]);
  if (body.status !== "cancelled") throw new HttpError(400, "status must be cancelled");
  if (!ID_RE.test(String(lid || ""))) throw new HttpError(404, "licence not found");
  const t = now();
  const r = await env.DB.prepare("UPDATE org_licences SET status = 'cancelled', cancelled_at = ?1 WHERE id = ?2 AND org_id = ?3 AND status = 'active'").bind(t, lid, id).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(404, "licence not found");
  await ownerAct(env, id, "licence.cancelled", lid, null, t);
  await audit(env, "owner", "org.licence.cancelled", { org: id, licence: lid });
  return { ok: true };
}

export async function adminOrgAudit(env, id) {
  await orgRow(env.DB, id);
  return { chain_ok: (await verifyOrgAudit(env.DB, id)).ok, entries: await auditEntries(env.DB, id) };
}

export async function adminLicencePlans(env) {
  return { plans: (await env.DB.prepare("SELECT id, product, unit, name_th, name_en, name_zh, status FROM licence_plans ORDER BY sort").all()).results || [] };
}
