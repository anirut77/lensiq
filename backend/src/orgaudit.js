// @ts-check
// backend/src/orgaudit.js — per-organisation audit log (stream G, organisation account lite): a SHA-256 hash chain per
// organisation (tamper evidence, not a legal signature). People appear only as pseudonymous refs (actorRef): SHA-256 of
// "org-actor|" + users.id, 32 hex. After a member's erasure the users row is gone and the ref links to nobody, so the
// chain never has to be rewritten. `detail` carries field names / counts / roles only, never values (no tax id, e-mail,
// address).
import { sha256Hex } from "./crypto.js";
import { now } from "./util.js";

export const GENESIS = "0".repeat(64);
/** @param {string} userId */
export const actorRef = async userId => (await sha256Hex("org-actor|" + userId)).slice(0, 32);

const material = (prev, r) => prev + "|" + JSON.stringify([r.org_id, r.ts, r.actor_kind, r.actor_ref ?? null, r.action, r.ref ?? null, r.detail ?? null]);

/**
 * Appends one entry. Concurrent writers to the same organisation could both read the same previous hash (D1 has no
 * read-and-insert lock); verifyOrgAudit then reports the fork, which is what tamper evidence is for. Volumes are tiny.
 * @param {D1Database} db @param {string} orgId
 * @param {{actorKind: "user"|"lensiq_owner"|"system", actorRef?: string|null, action: string, ref?: string|null, detail?: any}} e
 */
export async function orgAudit(db, orgId, e, t = now()) {
  const last = await db.prepare("SELECT hash FROM org_audit WHERE org_id = ?1 ORDER BY id DESC LIMIT 1").bind(orgId).first();
  const prev = last ? String(last.hash) : GENESIS;
  const detail = e.detail == null ? null : JSON.stringify(e.detail).slice(0, 1000);
  const row = { org_id: orgId, ts: t, actor_kind: e.actorKind, actor_ref: e.actorRef ?? null, action: e.action, ref: e.ref ?? null, detail };
  const hash = await sha256Hex(material(prev, row));
  await db.prepare("INSERT INTO org_audit (org_id, ts, actor_kind, actor_ref, action, ref, detail, prev_hash, hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")
    .bind(orgId, t, row.actor_kind, row.actor_ref, row.action, row.ref, detail, prev, hash).run();
}

/** Recomputes the chain of one organisation. @param {D1Database} db @param {string} orgId */
export async function verifyOrgAudit(db, orgId) {
  const rows = (await db.prepare("SELECT * FROM org_audit WHERE org_id = ?1 ORDER BY id").bind(orgId).all()).results || [];
  let prev = GENESIS;
  for (const r of rows) {
    if (r.prev_hash !== prev || r.hash !== (await sha256Hex(material(prev, r)))) return { ok: false, n: rows.length, broken_at: r.id };
    prev = String(r.hash);
  }
  return { ok: true, n: rows.length };
}
