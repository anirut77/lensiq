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
// Rules (CLAUDE.md "Remedies and merit", Fortune bans): every text is linted (lintMerit, TH/EN/ZH) for guarantees,
// "fix your luck", fear, health, lottery, prices, purchase / shop words, urgency, links and personal data. Items have no
// price, vendor or link field. The belief label and the no-guarantee line are fixed strings on the page, not item text.
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
const ID_RE = /^[a-z0-9][a-z0-9_-]{2,40}$/;
const REQ_ID_RE = /^[a-f0-9]{24}$/;
const LIMITS = { title: 120, body: 1200, place: 120, area: 80 };
export const MERIT_CONSENT_VERSION = "m1";

/** Builds a RegExp from source chunks (kept under the line-width limit; same .source as one literal). @param {string[]} parts @param {string} [flags] */
const rx = (parts, flags) => new RegExp(parts.join(""), flags);

/* ---------------- crisis net (same patterns as fortune-ai.js; tests/unit/merit.test.js R8 keeps them equal) ---------------- */
export const CRISIS_TH = rx([
  String.raw`ฆ่าตัว(?:ตาย)?|อยากตาย|อยากจะตาย|ไม่อยาก(?:มีชีวิต(?:อยู่)?|อยู่(?:แล้ว|ต่อ|บนโลก)|ตื่น(?:ขึ้นมา)?อีก)|`,
  String.raw`อยากหายไป(?:จากโลก)?|ไม่อยากตื่น(?:มา|ขึ้นมา)?เจอ(?:วัน)?พรุ่งนี้|ชีวิต(?:นี้)?ไม่มี(?:ความหมาย|ค่า)|(?:ควร|`,
  String.raw`อยาก)จบ(?:ทุกอย่าง|ทุกสิ่ง|มันซะ)|ไม่อยากอยู่บนโลกนี้|อยากจบชีวิต|จบชีวิต(?:ตัวเอง|ตนเอง)|ทำร้ายตัวเอง|`,
  String.raw`ทำร้ายตนเอง|กรีด(?:ข้อมือ|แขน|ตัวเอง)|ปลิดชีพ|กินยาตาย|กินยาเกินขนาด|กระโดด(?:ตึก|สะพาน)|ผูกคอ|(?:ถูก|`,
  String.raw`โดน)(?:ทำร้าย(?:ร่างกาย)?|ทุบตี|ตบตี|ซ้อม|ข่มขืน|ล่วงละเมิด|ทารุณ|กักขัง)|ข่มขืน|ล่วงละเมิดทางเพศ|`,
  String.raw`ความรุนแรงในครอบครัว|(?:แฟน|สามี|ภรรยา|พ่อ|แม่|พ่อเลี้ยง|แม่เลี้ยง)[^\s]{0,8}(?:ตบ|ตี|ทุบ|ทำร้าย|ซ้อม)(?:ฉัน|`,
  String.raw`หนู|ผม|เรา|ดิฉัน)`
]);
export const CRISIS_EN = rx([
  String.raw`\b(?:suicid\w*|kill(?:ing)? myself|end(?:ing)? my life|end it all|take my (?:own )?life|want(?:ed)? to die|`,
  String.raw`wanna die|wish I (?:was|were) dead|self[- ]?harm\w*|hurt(?:ing)? myself|cut(?:ting)? myself|`,
  String.raw`don'?t want to (?:live|be alive|wake up)|no reason to live|overdos\w*|can'?t go on(?: anymore| any longer)?|`,
  String.raw`want(?:ed)? to disappear|(?:should I|I want to|I'll) (?:just )?end it(?! (?:with|between|off))(?: all)?|`,
  String.raw`no point (?:in )?(?:living|being alive)|life (?:is|feels) (?:meaningless|pointless))\b|\b(?:he|she|they|`,
  String.raw`my (?:partner|husband|wife|boyfriend|girlfriend|father|mother|dad|mum|mom|stepfather|stepmother))\s+(?:hits|`,
  String.raw`beats|abuses|rapes|hurts|chokes)\s+me\b|\b(?:being|been|was|am|got)\s+(?:abused|raped|molested|assaulted|`,
  String.raw`attacked|beaten up)\b|\bdomestic (?:violence|abuse)\b|\bsexual(?:ly)? (?:abuse|assault\w*)\b`
], "i");
export const CRISIS_ZH = rx([
  String.raw`自杀|自尽|轻生|想死|不想活|活不下去|活着没意思|活着好累|活着没有意义|不想再醒来|不想醒来|想消失|结束一切|结束(?:自己的)?生命|自残|自伤|割腕|跳楼|寻死|吞药|服药过量|家暴|家庭暴力|`,
  String.raw`被(?:人)?(?:打|殴打|袭击|虐待|性侵|强奸|侵犯|猥亵)|性侵|强奸|(?:他|她|老公|老婆|丈夫|妻子|男朋友|女朋友|爸爸|妈妈|继父|继母)(?:经常|总是|一直)?(?:打|殴打|虐待)我`
]);
/** @param {...any} texts */
export function crisisCheck(...texts) {
  for (const x of texts) {
    const t = String(x == null ? "" : x).normalize("NFC");
    if (!t) continue;
    if (CRISIS_TH.test(t.replace(/\s+/g, "")) || CRISIS_EN.test(t) || CRISIS_ZH.test(t)) return true;
  }
  return false;
}
/** Help lines returned with a refused request (same numbers as the fortune pages' support card). */
export const SUPPORT_LINES = [
  { n: "1323", th: "สายด่วนสุขภาพจิต กรมสุขภาพจิต — โทรฟรี ตลอด 24 ชั่วโมง", en: "Thai Department of Mental Health hotline — free, 24 hours", zh: "泰国心理健康热线 — 免费，24 小时" },
  { n: "1669", th: "เจ็บป่วยฉุกเฉิน / ต้องการรถพยาบาล", en: "Medical emergency / ambulance", zh: "医疗急救 / 救护车" },
  { n: "191", th: "เหตุด่วนเหตุร้าย / แจ้งตำรวจ", en: "Police emergency", zh: "报警（泰国警察）" },
  { n: "1300", th: "ศูนย์ช่วยเหลือสังคม — ความรุนแรงในครอบครัวและการถูกทำร้าย", en: "Social Assistance Center — domestic violence and abuse", zh: "泰国社会援助中心 — 家庭暴力和受虐求助" }
];

/* ---------------- wording lint (TH / EN / ZH) ---------------- */
// Thai is tested with spaces removed (Thai has no word spaces; an inserted space must not dodge the rule).
/** @type {Record<string, {th?: RegExp, en?: RegExp, zh?: RegExp, any?: RegExp}>} */
const LINT = {
  guarantee: {
    th: /การันตี|รับประกัน|แน่นอน|ได้ผลแน่|ได้ผล100|ร้อยเปอร์เซ็นต์|ศักดิ์สิทธิ์ที่สุด|ขออะไรได้หมด|สมหวังแน่/,
    en: /\bguarantee[ds]?\b|\bpromise[ds]?\b|\bdefinitely\b|\bcertain(?:ly)? to\b|\bsure to\b|\bwill (?:surely|certainly)\b|\b100 ?%|\bmost powerful\b/i,
    zh: /保证|包准|保准|一定(?:会|能|灵)|百分之百|绝对|必定|有求必应|最灵/,
    any: /\b100\s?%/
  },
  fix_luck: {
    th: /แก้ดวง|เปลี่ยนดวง|แก้เคราะห์|ตัดกรรม|สะเดาะเคราะห์|หายชง|แก้ชงได้ผล|ดวงดีขึ้น|เสริมดวงทันที|รวยทันที|ปลดหนี้|แก้ซวย|พลิกดวง/,
    en: rx([
      String.raw`\bfix(?:es|ed|ing)? (?:your |the )?(?:bad )?(?:luck|fortune|clash)\b|\bremove[sd]? (?:your |the )?(?:bad luck|`,
      String.raw`misfortune|clash|curse)|\bchange (?:your )?(?:luck|fortune|destiny)\b|\bturn (?:your )?luck\b|`,
      String.raw`\bluck (?:will )?improves?\b|\bimproves? (?:your )?luck\b|\bend (?:your )?bad luck\b|\bget rich\b`
    ], "i"),
    zh: /改运|转运|化解一切|消灾|驱邪|破解|去霉运|改命|立即转运|好运马上/
  },
  fear: {
    th: /ซวย|เคราะห์ร้าย|อัปมงคล|หายนะ|ภัยพิบัติ|อุบัติเหตุ|ความตาย|เสียชีวิต|ถึงชีวิต|ถึงตาย|โชคร้าย|ดวงไม่ดี|ภัยร้าย|คำสาป|ดวงตก/,
    en: /\bbad luck\b|\bmisfortune\b|\bdisasters?\b|\bcatastroph\w*|\bdoom\w*|\bcurse[ds]?\b|\bdeath\b|\bdie\b|\baccidents?\b|\bdanger\w*|\bunlucky\b/i,
    zh: /霉运|厄运|倒霉|灾祸|灾难|大难|血光|死亡|意外|诅咒|不吉利/
  },
  health: {
    th: /รักษาโรค|หายป่วย|หายจากโรค|เจ็บป่วย|โรคร้าย|มะเร็ง|ตั้งครรภ์|มีลูกง่าย|ลดน้ำหนัก|รักษาอาการ/,
    en: /\bcure[sd]?\b|\bheal(?:s|ing|ed)?\b|\billness\w*|\bdiseases?\b|\bsickness\b|\bpregnan\w*|\bfertility\b|\bweight loss\b/i,
    zh: /治病|治疗|病愈|疾病|怀孕|求子|减肥/
  },
  lottery: {
    th: /หวย|เลขเด็ด|ลอตเตอรี่|ล็อตเตอรี่|สลากกินแบ่ง|เลขนำโชค/,
    en: /\blotter\w*|\blucky numbers?\b|\bwinning numbers?\b|\bjackpot\b/i,
    zh: /彩票|中奖号码|幸运号码|六合彩|特码/
  },
  price: {
    th: /\d[\d,.]*(?:บาท|฿)|฿\d|ราคา|ค่าบูชา|ค่าใช้จ่าย/,
    en: /\b(?:thb|baht|usd)\b|[$฿€£]\s?\d|\bprices?\b|\bpriced\b|\bcosts?\b|\bfees?\b/i,
    zh: /\d+\s*(?:元|块|泰铢|铢)|价格|费用|价钱/
  },
  purchase: {
    th: /สั่งซื้อ|ซื้อได้ที่|ซื้อเลย|เช่าบูชา|จำหน่าย|โอนเงิน|ชำระเงิน|ร้านค้า|ร้านเรา|ช้อป/,
    en: /\bbuy\w*|\bpurchas\w*|\bshop\w*|\border now\b|\bfor sale\b|\bsell(?:s|ing)?\b/i,
    zh: /购买|下单|购物|出售|售卖|商店|网店|请购/
  },
  urgency: {
    th: /ด่วน|วันนี้เท่านั้น|หมดเขต|จำนวนจำกัด|เหลือเพียง|เหลืออีก\d|นับถอยหลัง|ก่อนสาย|รีบ/,
    en: rx([
      String.raw`\blimited (?:time|offer|slots?|stock|spots?|places?)\b|\bonly \d+ (?:slots? |places? |spots? )?(?:left|`,
      String.raw`remaining)\b|\bhurry\b|\blast chance\b|\bact now\b|\bcount ?down\b|\bdon'?t miss\b|\btoday only\b|\btoo late\b`
    ], "i"),
    zh: /限时|名额有限|仅剩|只剩|倒计时|立即|马上|错过|最后机会|今天截止/
  },
  link: {
    any: /https?:\/\/|\bwww\.|\.(?:com|net|org|shop|co\.th|in\.th)\b|line\.me|lin\.ee/i
  },
  personal: {
    any: /(?:\+?66[\s-]?|\b0)\d{1,2}[\s-]?\d{3}[\s-]?\d{3,4}\b|[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}/i
  }
};
export const LINT_CODES = Object.keys(LINT);

/**
 * Wording check of one text in any of the three languages. Returns [] when clean, else [{code, match}].
 * @param {any} text @param {{only?: string[]}} [opts] only = limit to these categories
 */
export function lintMerit(text, opts = {}) {
  const t = String(text == null ? "" : text).normalize("NFC");
  if (!t.trim()) return [];
  const nospace = t.replace(/\s+/g, "");
  const out = [];
  for (const [code, rx] of Object.entries(LINT)) {
    if (opts.only && !opts.only.includes(code)) continue;
    let m = null;
    if (rx.th) m = rx.th.exec(nospace);
    if (!m && rx.en) m = rx.en.exec(t);
    if (!m && rx.zh) m = rx.zh.exec(t);
    if (!m && rx.any) m = rx.any.exec(t);
    if (m) out.push({ code, match: m[0].slice(0, 40) });
  }
  return out;
}

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
  if (status !== "published" && status !== "hidden") throw bad("status must be published or hidden");
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
  return { items: rows.map(rowItem), interest_form: interestEnabled(env) };
}

/* ---------------- admin ---------------- */
/** @param {any} env */
export async function adminListItems(env) {
  const rows = (await env.DB.prepare("SELECT * FROM merit_items ORDER BY tradition, type, sort, id").all()).results || [];
  return { items: rows.map(rowItem), types: TYPES, traditions: TRADITIONS, keys_allowed: KEYS_ALLOWED, interest_form: interestEnabled(env) };
}

/** @param {any} env @param {any} item */
async function writeItem(env, item, create) {
  const t = now();
  const j = (/** @type {any} */ v) => (v == null ? null : JSON.stringify(v));
  if (create) {
    await env.DB.prepare("INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)")
      .bind(item.id, item.type, item.tradition, j(item.title), j(item.body), j(item.place), j(item.area), j(item.keys), item.sample ? 1 : 0, item.status, item.sort, t).run();
  } else {
    await env.DB.prepare("UPDATE merit_items SET type = ?2, tradition = ?3, title = ?4, body = ?5, place = ?6, area = ?7, match_keys = ?8, sample = ?9, status = ?10, " +
      "sort = ?11, updated_at = ?12 WHERE id = ?1")
      .bind(item.id, item.type, item.tradition, j(item.title), j(item.body), j(item.place), j(item.area), j(item.keys), item.sample ? 1 : 0, item.status, item.sort, t).run();
  }
  return rowItem(await env.DB.prepare("SELECT * FROM merit_items WHERE id = ?1").bind(item.id).first());
}

/** @param {any} env @param {any} body */
export async function adminCreateItem(env, body) {
  const b = { ...(body || {}) };
  delete b.id; // ids are made here
  const item = cleanItem(b);
  item.id = "mi-" + randomId(6);
  return writeItem(env, item, true);
}

/** Partial update: the stored item merged with the given fields, then validated as a whole. @param {any} env @param {string} id @param {any} body */
export async function adminUpdateItem(env, id, body) {
  if (!ID_RE.test(String(id || ""))) throw new HttpError(404, "item not found");
  const row = await env.DB.prepare("SELECT * FROM merit_items WHERE id = ?1").bind(id).first();
  if (!row) throw new HttpError(404, "item not found");
  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("invalid item");
  const changed = Object.keys(body).filter(k => k !== "id");
  const cur = rowItem(row);
  /** @type {any} */
  const merged = { id: cur.id, type: cur.type, tradition: cur.tradition, title: cur.title, body: cur.body, place: cur.place, area: cur.area, keys: cur.keys,
    sample: cur.sample, status: cur.status, sort: cur.sort };
  for (const k of changed) merged[k] = body[k];
  const item = cleanItem(merged);
  item.id = cur.id;
  return { item: await writeItem(env, item, false), changed };
}

/** @param {any} env @param {string} id */
export async function adminDeleteItem(env, id) {
  if (!ID_RE.test(String(id || ""))) throw new HttpError(404, "item not found");
  const r = await env.DB.prepare("DELETE FROM merit_items WHERE id = ?1").bind(id).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(404, "item not found");
  return { ok: true };
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
