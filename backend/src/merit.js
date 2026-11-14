// @ts-check
// backend/src/merit.js — Merit MVP (owner order 2026-11-12; docs/MERIT-DESIGN.md, docs/MERIT-RESULTS.md).
//
// Belief guidance that admins manage (places to pray, what to offer and how, ชง customs, lucky items), shown FREE on the
// fortune pages under a reading. Matching runs on the device (lensiq-merit-core.js); the Worker only serves every
// published item, so nothing about the reader (result, chosen tradition) is ever sent.
//
//   GET  /v1/merit/guidance                {items: [published items], interest_form: bool}   (cacheable, no personal data)
//   POST /v1/merit/interest                "request interest" in the paid on-your-behalf service. OFF unless the Worker var
//                                          MERIT_INTEREST_FORM = "on" (wrangler.toml ships "off"; legal review L42 / L43
//                                          first). Turnstile action "merit" (fail closed), consent, minimum fields only,
//                                          crisis text refused with the help lines (never stored). Purged after
//                                          MERIT_INTEREST_DAYS (90) by retention.js.
//   Admin (existing admin sign-in; every write audited by index.js, delete = re-auth):
//   GET    /admin/api/merit/items          all items + the fixed types / traditions / allowed keys (the picker's list)
//   POST   /admin/api/merit/items          create          PUT /admin/api/merit/items/:id   partial update (merged, re-validated)
//   DELETE /admin/api/merit/items/:id      delete (re-auth)
//   GET    /admin/api/merit/interest       interest requests + switch state      DELETE /admin/api/merit/interest/:id (re-auth)
//
// Rules (CLAUDE.md "Remedies and merit", Fortune bans): every text is linted (lensiq-merit-lint.js, TH/EN/ZH, disguises
// normalised) for guarantees, "fix your luck", fear, health, lottery, prices, purchase / shop words, urgency, links,
// markup and personal data. Items have no
// price, vendor or link field. The belief label and the no-guarantee line are fixed strings on the page, not item text.
import FortuneAIModule from "../../fortune-ai.js";
import MeritLint from "../../lensiq-merit-lint.js";
import { randomId } from "./crypto.js";
import { callerHash, hit } from "./store.js";
import { verifyTurnstile } from "./turnstile.js";
import { BKK_OFFSET, HttpError, intVar, log, now } from "./util.js";

export const TRADITIONS = ["thai_buddhist", "chinese_folk", "hindu_brahman", "general"];
export const TYPES = ["place", "offering", "chong", "lucky_item"];
export const DOMAINS = ["zodiac", "bazi", "taksa", "lek7", "horoscope", "tarot", "siamsee", "iching", "dream", "astro", "numbers", "fengshui", "face", "palm",
  "lifegraph", "luckycolor", "planner"];
export const ELEMENTS = ["wood", "fire", "earth", "metal", "water"];
/** Every key an item may match on (the admin picker shows exactly this list; free text is never accepted). */
export const KEYS_ALLOWED = ["any", "chong", "weak"].concat(DOMAINS.map(d => "domain:" + d), Array.from({ length: 12 }, (_, i) => "animal:" + i), ELEMENTS.map(e => "element:" + e));
const KEY_SET = new Set(KEYS_ALLOWED);
const LANGS = ["th", "en", "zh"];
/** Review notes for places (owner order 2026-11-14 Part C; back office only). */
export const PURPOSES = ["work", "money", "love", "health", "protection", "barami"];
export const VERIFICATIONS = ["official", "secondary", "word_of_mouth"];
/** The marker a word-of-mouth item must carry in its user text, per language (C3). */
const WORD_OF_MOUTH = { th: "ตามที่เล่าต่อกันมา", en: "word of mouth", zh: "民间流传" };
const ID_RE = /^[a-z0-9][a-z0-9_-]{2,40}$/;
const REQ_ID_RE = /^[a-f0-9]{24}$/;
const LIMITS = { title: 120, body: 1200, place: 120, area: 80 };
export const MERIT_CONSENT_VERSION = "m1";

/* ---------------- crisis net: the fortune pages' own check (fortune-ai.js FortuneAI.crisis.check), imported, not copied,
   so a pattern change there applies to the interest form automatically ---------------- */
/** @param {...any} texts */
export function crisisCheck(...texts) { return !!FortuneAIModule.crisis.check(...texts); }
/** Help lines returned with a refused request (same numbers as the fortune pages' support card). */
export const SUPPORT_LINES = [
  { n: "1323", th: "สายด่วนสุขภาพจิต กรมสุขภาพจิต — โทรฟรี ตลอด 24 ชั่วโมง", en: "Thai Department of Mental Health hotline — free, 24 hours", zh: "泰国心理健康热线 — 免费，24 小时" },
  { n: "1669", th: "เจ็บป่วยฉุกเฉิน / ต้องการรถพยาบาล", en: "Medical emergency / ambulance", zh: "医疗急救 / 救护车" },
  { n: "191", th: "เหตุด่วนเหตุร้าย / แจ้งตำรวจ", en: "Police emergency", zh: "报警（泰国警察）" },
  { n: "1300", th: "ศูนย์ช่วยเหลือสังคม — ความรุนแรงในครอบครัวและการถูกทำร้าย", en: "Social Assistance Center — domestic violence and abuse", zh: "泰国社会援助中心 — 家庭暴力和受虐求助" }
];

/* ---------------- wording lint: one module shared with the page (lensiq-merit-lint.js) ---------------- */
/** @type {(text: any, opts?: {only?: string[]}) => {code: string, match: string}[]} */
export const lintMerit = MeritLint.lintMerit;
export const LINT_CODES = MeritLint.LINT_CODES;

/* ---------------- item validation ---------------- */
const ITEM_FIELDS = ["id", "type", "tradition", "title", "body", "place", "area", "keys", "sample", "status", "sort"];
const bad = (/** @type {string} */ msg) => new HttpError(400, msg, { code: "merit_invalid" });
const cleanText = (/** @type {any} */ v) => String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();

/** @param {string} field @param {any} v @param {boolean} required */
function cleanTri(field, v, required) {
  if (v == null || (typeof v === "object" && !Array.isArray(v) && LANGS.every(l => v[l] == null || v[l] === ""))) {
    if (required) throw bad(`${field} is required in Thai, English and Chinese`);
    return null;
  }
  if (typeof v !== "object" || Array.isArray(v)) throw bad(`${field} must be {th, en, zh}`);
  for (const k of Object.keys(v)) if (!LANGS.includes(k)) throw bad(`${field}: unknown language ${String(k).slice(0, 8)}`);
  /** @type {Record<string, string>} */
  const out = {};
  for (const l of LANGS) {
    if (typeof v[l] !== "string") throw bad(`${field}.${l} is missing (every text needs Thai, English and Chinese)`);
    const s = cleanText(v[l]);
    if (!s) throw bad(`${field}.${l} is empty (every text needs Thai, English and Chinese)`);
    if ([...s].length > LIMITS[field]) throw bad(`${field}.${l} is too long (max ${LIMITS[field]} characters)`);
    const hits = lintMerit(s);
    if (hits.length) {
      throw new HttpError(400, `wording not allowed in ${field}.${l}: ${hits.map(h => h.code).join(", ")} ("${hits[0].match}")`,
        { code: "merit_wording" });
    }
    out[l] = s;
  }
  return out;
}

/**
 * Validates a whole item (create, or the merged result of an update). Throws 400 merit_invalid / merit_wording.
 * @param {any} body
 */
export function cleanItem(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("invalid item");
  for (const k of Object.keys(body)) if (!ITEM_FIELDS.includes(k)) throw bad(`unknown field ${String(k).slice(0, 32)} (items have no price, vendor, link or personal fields)`);
  if (body.id != null && !ID_RE.test(String(body.id))) throw bad("invalid id");
  if (!TYPES.includes(body.type)) throw bad("type must be one of " + TYPES.join(", "));
  if (!TRADITIONS.includes(body.tradition)) throw bad("tradition must be one of " + TRADITIONS.join(", "));
  const status = body.status == null ? "published" : body.status;
  if (!["published", "hidden", "draft"].includes(status)) throw bad("status must be draft, published or hidden (reviewed / rejected come from the review step)");
  if (!Array.isArray(body.keys) || body.keys.length < 1 || body.keys.length > 12) throw bad("choose 1 to 12 matching keys");
  const keys = [];
  for (const k of body.keys) {
    if (typeof k !== "string" || !KEY_SET.has(k)) throw bad("unknown matching key " + String(k).slice(0, 24));
    if (!keys.includes(k)) keys.push(k);
  }
  if (body.type === "chong" && !keys.includes("chong")) throw bad("a ชง (chong) item must have the chong key, so it only shows for a ชง reading");
  const sort = body.sort == null || body.sort === "" ? 0 : Number(body.sort);
  if (!Number.isInteger(sort) || sort < 0 || sort > 9999) throw bad("sort must be a whole number 0–9999");
  if (body.sample != null && typeof body.sample !== "boolean") throw bad("sample must be true or false");
  return {
    id: body.id == null ? null : String(body.id), type: body.type, tradition: body.tradition,
    title: cleanTri("title", body.title, true), body: cleanTri("body", body.body, true),
    place: cleanTri("place", body.place, false), area: cleanTri("area", body.area, false),
    keys, sample: body.sample === true, status, sort
  };
}

/** Row -> API object. @param {any} r */
function rowItem(r) {
  return {
    id: r.id, type: r.type, tradition: r.tradition, title: JSON.parse(r.title), body: JSON.parse(r.body),
    place: r.place == null ? null : JSON.parse(r.place), area: r.area == null ? null : JSON.parse(r.area),
    keys: JSON.parse(r.match_keys), sample: !!r.sample, status: r.status, sort: Number(r.sort) || 0, updated_at: Number(r.updated_at) || 0
  };
}
const PUBLIC_MAX = 500;

/** @param {any} env */
export const interestEnabled = env => String(env.MERIT_INTEREST_FORM || "").trim().toLowerCase() === "on";
/** @param {any} env */
export const interestDays = env => intVar(env.MERIT_INTEREST_DAYS, 90, 7, 365);

/** @param {any} env */
export async function publicGuidance(env) {
  const rows = (await env.DB.prepare("SELECT * FROM merit_items WHERE status = 'published' ORDER BY tradition, type, sort, id LIMIT ?1").bind(PUBLIC_MAX).all()).results || [];
  return { items: rows.map(rowItem), interest_form: interestEnabled(env), interest_retention_days: interestDays(env) };
}

/* ---------------- admin (owner, and reviewers for merit content: index.js REVIEWER_ROUTES) ---------------- */
// Review queue (owner decision 2026-11-12, migration 0016): draft -> reviewed -> published; rejected (with a comment) from
// draft / reviewed / published; hidden by the owner. Only "published" is served (publicGuidance). A reviewer cannot set
// the status or the sample flag directly, and any content edit by a reviewer sends the item back to "draft" (it needs an
// approval again). The owner may still publish, hide or set back to draft directly (owner authority; in the history).
// who = {actor: "owner" | "reviewer:<id>", name: "owner" | username, role: "owner" | "reviewer"}
export const STATUSES = ["draft", "reviewed", "published", "rejected", "hidden"];
const OWNER_SETS = ["draft", "published", "hidden"];
const CONTENT = ["type", "tradition", "title", "body", "place", "area", "keys", "sort"];
const IMPORT_MAX = 300;
const forbiddenField = (/** @type {string} */ f) => new HttpError(403, `a reviewer cannot set ${f} (forbidden_field)`, { code: "forbidden_field" });

/** Admin view of a row: the public fields + review fields (review_meta: notes for reviewers, never served). @param {any} r */
function adminRow(r) {
  let meta = null;
  try { meta = r.review_meta ? JSON.parse(r.review_meta) : null; } catch { meta = null; }
  return { ...rowItem(r), review_comment: r.review_comment || null, reviewed_by: r.reviewed_by || null, reviewed_at: Number(r.reviewed_at) || null,
    source: r.source || (r.sample ? "sample" : "admin"), review_meta: meta };
}

/** Reviewer notes that a drafts file may carry next to an item: draft_id, disciplines, sources, uncertain. They are kept
 *  for the review screen only (sources are where the writer found the belief; links are allowed here and nowhere else).
 *  Returns {meta (null when none), rest (the item without these fields)}; throws 400 on a malformed note.
 *  @param {any} raw */
export function splitReviewMeta(raw) {
  const rest = { ...raw };
  /** @type {any} */
  const meta = {};
  if ("draft_id" in rest) {
    if (typeof rest.draft_id !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(rest.draft_id)) throw bad("draft_id: 1 to 80 letters, digits, . _ -");
    meta.draft_id = rest.draft_id;
  }
  if ("disciplines" in rest) {
    const d = rest.disciplines;
    if (!Array.isArray(d) || d.length > 20 || !d.every(x => typeof x === "string" && /^[a-z0-9_-]{1,30}$/.test(x))) throw bad("disciplines: a list of up to 20 short names");
    meta.disciplines = d;
  }
  if ("sources" in rest) {
    const s = rest.sources;
    if (!Array.isArray(s) || s.length > 10) throw bad("sources: a list of up to 10 sources");
    meta.sources = s.map((x, i) => {
      if (!x || typeof x !== "object" || typeof x.url !== "string" || !/^https?:\/\/[^\s<>"]{3,500}$/.test(x.url)) throw bad(`sources[${i}].url must be an http(s) address`);
      const t = (/** @type {any} */ v, n) => (v == null ? null : cleanText(String(v)).slice(0, n));
      return { url: x.url, publisher: t(x.publisher, 200), title: t(x.title, 300), accessed: t(x.accessed, 20) };
    });
  }
  if ("uncertain" in rest) {
    const u = Array.isArray(rest.uncertain) ? rest.uncertain.join("\n") : rest.uncertain;
    if (u != null && (typeof u !== "string" || [...u].length > 2000)) throw bad("uncertain: a note of at most 2000 characters");
    if (u) meta.uncertain = cleanText(u);
  }
  // places to pay respect (owner order 2026-11-14 Part C): what people visit the place for, its province and how the writer
  // confirmed it. Back office only, like the notes above; nothing here is served to users.
  if ("purposes" in rest) {
    const p = rest.purposes;
    if (!Array.isArray(p) || p.length < 1 || p.length > PURPOSES.length || !p.every(x => PURPOSES.includes(x)) || new Set(p).size !== p.length) {
      throw bad("purposes: 1 to " + PURPOSES.length + " of " + PURPOSES.join(", ") + ", no repeats");
    }
    meta.purposes = p.slice();
  }
  if ("province" in rest) {
    if (typeof rest.province !== "string" || !/^[A-Za-z][A-Za-z .'()-]{1,59}$/.test(rest.province)) throw bad("province: the English name, 2 to 60 letters");
    meta.province = rest.province;
  }
  if ("verification" in rest) {
    const v = rest.verification;
    if (!VERIFICATIONS.includes(v)) throw bad("verification must be one of " + VERIFICATIONS.join(", "));
    if (v === "word_of_mouth") {
      const body = rest.body && typeof rest.body === "object" ? rest.body : {};
      for (const [l, mark] of Object.entries(WORD_OF_MOUTH)) {
        if (typeof body[l] !== "string" || !body[l].toLowerCase().includes(mark)) {
          throw bad(`verification word_of_mouth: body.${l} must say "${mark}" so the reader knows it is passed on by word of mouth`);
        }
      }
    }
    meta.verification = v;
  }
  for (const k of ["draft_id", "disciplines", "sources", "uncertain", "purposes", "province", "verification"]) delete rest[k];
  return { meta: Object.keys(meta).length ? meta : null, rest };
}
/** One history row. @param {any} env @param {string} itemId @param {any} who @param {string} action
 *  @param {{decision?: string|null, fields?: string[]|null, comment?: string|null, from?: string|null, to?: string|null}} [o] */
function revision(env, itemId, who, action, o = {}) {
  return env.DB.prepare("INSERT INTO merit_revisions (item_id, ts, actor, actor_name, action, decision, fields, comment, from_status, to_status) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)")
    .bind(itemId, now(), who.actor, who.name, action, o.decision || null, o.fields ? JSON.stringify(o.fields) : null, o.comment || null, o.from || null, o.to || null);
}
/** @param {any} env @param {string} id */
async function rowOr404(env, id) {
  if (!ID_RE.test(String(id || ""))) throw new HttpError(404, "item not found");
  const row = await env.DB.prepare("SELECT * FROM merit_items WHERE id = ?1").bind(id).first();
  if (!row) throw new HttpError(404, "item not found");
  return row;
}

/** @param {any} env */
export async function adminListItems(env) {
  const rows = (await env.DB.prepare("SELECT * FROM merit_items ORDER BY tradition, type, sort, id").all()).results || [];
  return { items: rows.map(adminRow), types: TYPES, traditions: TRADITIONS, statuses: STATUSES, keys_allowed: KEYS_ALLOWED, interest_form: interestEnabled(env) };
}

/** @param {any} env @param {any} item @param {number} t @param {string} source @param {any} [meta] */
function insertStmt(env, item, t, source, meta = null) {
  const j = (/** @type {any} */ v) => (v == null ? null : JSON.stringify(v));
  return env.DB.prepare("INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at, source, review_meta) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12, ?13, ?14)")
    .bind(item.id, item.type, item.tradition, j(item.title), j(item.body), j(item.place), j(item.area), j(item.keys), item.sample ? 1 : 0, item.status, item.sort, t,
      source, j(meta));
}

/** @param {any} env @param {any} body @param {any} who */
export async function adminCreateItem(env, body, who) {
  const b = { ...(body || {}) };
  delete b.id; // ids are made here
  if (who.role === "reviewer") {
    for (const f of ["status", "sample"]) if (f in b) throw forbiddenField(f);
    b.status = "draft";
  }
  const item = cleanItem(b);
  item.id = "mi-" + randomId(6);
  await env.DB.batch([insertStmt(env, item, now(), "admin"), revision(env, item.id, who, "create", { fields: CONTENT.filter(k => k in b), to: item.status })]);
  return adminRow(await env.DB.prepare("SELECT * FROM merit_items WHERE id = ?1").bind(item.id).first());
}

/** Partial update: the stored item merged with the given fields, then validated as a whole. @param {any} env @param {string} id @param {any} body @param {any} who */
export async function adminUpdateItem(env, id, body, who) {
  const row = await rowOr404(env, id);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("invalid item");
  if (who.role === "reviewer") for (const f of ["status", "sample"]) if (f in body) throw forbiddenField(f);
  const changed = Object.keys(body).filter(k => k !== "id");
  const cur = rowItem(row);
  /** @type {any} */
  const merged = { id: cur.id, type: cur.type, tradition: cur.tradition, title: cur.title, body: cur.body, place: cur.place, area: cur.area, keys: cur.keys,
    sample: cur.sample, status: cur.status, sort: cur.sort };
  for (const k of changed) merged[k] = body[k];
  if (!("status" in body)) merged.status = OWNER_SETS.includes(cur.status) ? cur.status : "draft"; // validated below, restored after
  const item = cleanItem(merged);
  item.id = cur.id;
  const content = changed.filter(k => CONTENT.includes(k));
  item.status = "status" in body ? item.status : who.role === "reviewer" && content.length ? "draft" : cur.status;
  const t = now(), j = (/** @type {any} */ v) => (v == null ? null : JSON.stringify(v));
  await env.DB.batch([
    env.DB.prepare("UPDATE merit_items SET type = ?2, tradition = ?3, title = ?4, body = ?5, place = ?6, area = ?7, match_keys = ?8, sample = ?9, status = ?10, " +
      "sort = ?11, updated_at = ?12 WHERE id = ?1")
      .bind(item.id, item.type, item.tradition, j(item.title), j(item.body), j(item.place), j(item.area), j(item.keys), item.sample ? 1 : 0, item.status, item.sort, t),
    revision(env, item.id, who, content.length ? "edit" : "status", { fields: changed, from: cur.status, to: item.status })
  ]);
  return { item: adminRow(await env.DB.prepare("SELECT * FROM merit_items WHERE id = ?1").bind(item.id).first()), changed };
}

/** Review decision. @param {any} env @param {string} id @param {any} body @param {any} who */
export async function reviewItem(env, id, body, who) {
  const row = await rowOr404(env, id);
  const decision = body && body.decision;
  const FROM = /** @type {Record<string, string[]>} */ ({ reviewed: ["draft", "rejected"], approve: ["reviewed"], reject: ["draft", "reviewed", "published"] });
  const TO = /** @type {Record<string, string>} */ ({ reviewed: "reviewed", approve: "published", reject: "rejected" });
  if (!FROM[decision]) throw new HttpError(400, "decision must be reviewed, approve or reject", { code: "merit_invalid" });
  const comment = body.comment == null ? "" : cleanText(String(body.comment));
  if ([...comment].length > 1000) throw bad("comment: at most 1000 characters");
  if (decision === "reject" && !comment) throw new HttpError(400, "a rejection needs a comment saying what to fix", { code: "comment_required" });
  if (!FROM[decision].includes(row.status)) {
    throw new HttpError(409, `cannot ${decision} an item that is ${row.status} (bad_transition)`, { code: "bad_transition" });
  }
  const to = TO[decision], t = now();
  const r = await env.DB.batch([
    env.DB.prepare("UPDATE merit_items SET status = ?1, review_comment = ?2, reviewed_by = ?3, reviewed_at = ?4, updated_at = ?4 WHERE id = ?5 AND status = ?6")
      .bind(to, comment || null, who.name, t, id, row.status),
    revision(env, id, who, "review", { decision, comment: comment || null, from: row.status, to })
  ]);
  if (!r[0].meta || !r[0].meta.changes) throw new HttpError(409, "the item changed meanwhile — reload (bad_transition)", { code: "bad_transition" });
  return { item: adminRow(await env.DB.prepare("SELECT * FROM merit_items WHERE id = ?1").bind(id).first()), decision, from: row.status, to };
}

/** @param {any} env @param {string} id */
export async function itemHistory(env, id) {
  await rowOr404(env, id);
  const rows = (await env.DB.prepare("SELECT * FROM merit_revisions WHERE item_id = ?1 ORDER BY id").bind(id).all()).results || [];
  return {
    history: rows.map(r => ({ ts: Number(r.ts), actor: r.actor_name, action: r.action, decision: r.decision || null,
      fields: r.fields ? JSON.parse(r.fields) : [], comment: r.comment || null, from_status: r.from_status || null, to_status: r.to_status || null }))
  };
}

/** @param {any} env @param {string} id @param {any} who */
export async function adminDeleteItem(env, id, who) {
  if (!ID_RE.test(String(id || ""))) throw new HttpError(404, "item not found");
  const row = await env.DB.prepare("SELECT status FROM merit_items WHERE id = ?1").bind(id).first();
  if (!row) throw new HttpError(404, "item not found");
  await env.DB.batch([env.DB.prepare("DELETE FROM merit_items WHERE id = ?1").bind(id), revision(env, id, who, "delete", { from: row.status })]);
  return { ok: true };
}

/**
 * Import drafts (owner, re-auth in index.js). body {items: [...], dry_run?}. Each item is validated like an admin save
 * (complete TH/EN/ZH, fixed keys, wording lint); a status, sample flag or id in the file is ignored: everything comes in
 * as a non-sample DRAFT and must go through review. Reviewer notes (draft_id, disciplines, sources, uncertain) are kept
 * in review_meta for the review screen only. Invalid items are reported with their index and skipped.
 * @param {any} env @param {any} body @param {any} who
 */
export async function importItems(env, body, who) {
  const list = body && Array.isArray(body.items) ? body.items : null;
  if (!list || !list.length) throw bad("items: a non-empty list is needed");
  if (list.length > IMPORT_MAX) throw bad(`at most ${IMPORT_MAX} items per import`);
  const ok = [], refused = [];
  for (let i = 0; i < list.length; i++) {
    const raw = list[i];
    try {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw bad("not an item");
      const { meta, rest } = splitReviewMeta(raw);
      const b = { ...rest };
      delete b.id; delete b.status; delete b.sample;
      b.status = "draft";
      const item = cleanItem(b);
      item.sample = false;
      ok.push({ item, meta });
    } catch (e) {
      refused.push({ index: i, error: String((e && e.message) || "invalid").slice(0, 300), code: (e && e.extra && e.extra.code) || "merit_invalid" });
    }
  }
  if (body.dry_run === true) return { dry_run: true, ok_count: ok.length, imported: 0, refused };
  const t = now(), stmts = [];
  for (const { item, meta } of ok) {
    item.id = "mi-" + randomId(6);
    stmts.push(insertStmt(env, item, t, "import", meta), revision(env, item.id, who, "import", { fields: CONTENT, to: "draft" }));
  }
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  return { dry_run: false, ok_count: ok.length, imported: ok.length, refused, ids: ok.map(x => x.item.id) };
}

/** @param {any} env @param {Record<string, string>} q */
export async function adminInterest(env, q = {}) {
  const limit = intVar(q.limit, 200, 1, 500);
  const rows = (await env.DB.prepare("SELECT * FROM merit_interest ORDER BY created_at DESC LIMIT ?1").bind(limit).all()).results || [];
  return { requests: rows, interest_form: interestEnabled(env), retention_days: interestDays(env) };
}

/** @param {any} env @param {string} id */
export async function adminDeleteInterest(env, id) {
  if (!REQ_ID_RE.test(String(id || ""))) throw new HttpError(404, "request not found");
  const r = await env.DB.prepare("DELETE FROM merit_interest WHERE id = ?1").bind(id).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(404, "request not found");
  return { ok: true };
}

/* ---------------- public interest form ---------------- */
const INTEREST_FIELDS = ["name", "channel", "contact", "item_id", "date_from", "date_to", "consent", "consent_version", "lang"];
const CHANNELS = ["line", "phone", "email"];
const DATE_RE = /^(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MAX_WINDOW_DAYS = 60;
const invalid = (/** @type {string} */ msg) => new HttpError(400, msg, { code: "merit_interest_invalid" });

/** @param {string} s */
function dayNum(s) {
  const m = DATE_RE.exec(s);
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCDate() === +m[3] ? t / 86400000 : NaN;
}

/**
 * Validates an interest request. Returns {crisis: true} when the free text holds crisis wording (checked before the
 * other fields, so the person always gets the help lines), else the row to store.
 * @param {any} body
 */
export function cleanInterest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("invalid request");
  for (const k of Object.keys(body)) if (!INTEREST_FIELDS.includes(k)) throw invalid(`unknown field ${String(k).slice(0, 32)} (only the minimum is accepted)`);
  for (const k of ["name", "contact", "item_id", "date_from", "date_to", "channel"]) if (body[k] != null && typeof body[k] !== "string") throw invalid(k + " must be text");
  if (crisisCheck(body.name, body.contact)) return { crisis: true };
  if (body.consent !== true) throw new HttpError(400, "please agree to the notice (consent_required)", { code: "consent_required" });
  const name = cleanText(body.name || "");
  if (!name || [...name].length > 60) throw invalid("name or nickname: 1 to 60 characters");
  if (!CHANNELS.includes(body.channel)) throw invalid("channel must be line, phone or email");
  const contact = cleanText(body.contact || "");
  const okContact = body.channel === "line" ? /^@?[A-Za-z0-9._-]{2,40}$/.test(contact)
    : body.channel === "phone" ? /^[0-9+()\s-]{6,20}$/.test(contact) && (contact.match(/\d/g) || []).length >= 6
      : /^[^\s@<>"]{1,64}@[^\s@<>"]{1,180}\.[^\s@<>"]{2,}$/.test(contact) && contact.length <= 254;
  if (!okContact) throw invalid("contact does not look like a " + body.channel + " contact");
  if (!ID_RE.test(String(body.item_id || ""))) throw invalid("unknown guidance item");
  const from = dayNum(String(body.date_from || "")), to = dayNum(String(body.date_to || ""));
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw invalid("dates must be YYYY-MM-DD");
  if (to < from) throw invalid("the end date is before the start date");
  if (to - from > MAX_WINDOW_DAYS) throw invalid(`the date window is at most ${MAX_WINDOW_DAYS} days`);
  const lang = ["th", "en", "zh"].includes(body.lang) ? body.lang : "th";
  return { crisis: false, name, channel: body.channel, contact: body.channel === "email" ? contact.toLowerCase() : contact, item_id: String(body.item_id),
    date_from: String(body.date_from), date_to: String(body.date_to), lang };
}

/**
 * POST /v1/merit/interest. Returns [body, status].
 * @param {any} env @param {Request} request @param {any} body @param {{fetch?: typeof fetch}} [deps]
 * @returns {Promise<[any, number]>}
 */
export async function submitInterest(env, request, body, deps = {}) {
  if (!interestEnabled(env)) throw new HttpError(404, "the interest form is not open (merit_interest_off)", { code: "merit_interest_off" });
  const ts = await verifyTurnstile(env, request, "merit", deps.fetch);
  if (!ts.ok) throw ts.code === "turnstile_not_configured"
    ? new HttpError(503, "the form is unavailable: Turnstile is not configured on the server (turnstile_not_configured)", { code: "turnstile_not_configured" })
    : new HttpError(403, "bot check failed (turnstile_failed)", { code: "turnstile_failed" });
  const v = cleanInterest(body);
  if (v.crisis) {
    log("merit.interest.support", {}); // a counter only: the text is never logged or stored
    return [{ error: "support", code: "support", support: true, lines: SUPPORT_LINES }, 403];
  }
  const item = await env.DB.prepare("SELECT id FROM merit_items WHERE id = ?1 AND status = 'published'").bind(v.item_id).first();
  if (!item) throw invalid("unknown guidance item");
  const who = await callerHash(env, request, "merit");
  const a = await hit(env.DB, `merit:${who}`, 5, 3600);
  if (!a.ok) throw new HttpError(429, "too many requests — try again later", { retryAfter: a.retryAfter });
  const g = await hit(env.DB, "merit:global", intVar(env.MERIT_INTEREST_GLOBAL_DAY, 100, 1, 10000), 86400, now(), BKK_OFFSET);
  if (!g.ok) throw new HttpError(429, "the form is full for today — please try again tomorrow", { retryAfter: g.retryAfter });
  const id = randomId(12);
  await env.DB.prepare("INSERT INTO merit_interest (id, created_at, item_id, name, channel, contact, date_from, date_to, lang, consent_version, status) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'new')")
    .bind(id, now(), v.item_id, v.name, v.channel, v.contact, v.date_from, v.date_to, v.lang, MERIT_CONSENT_VERSION).run();
  log("alert.merit_interest", {});
  return [{ ok: true, id }, 201];
}
