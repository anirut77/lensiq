"use strict";
// tests/unit/fortune-depth-warnings.test.js — FIXED TEST SET, fortune-depth review round 3 (owner decision 99 ก, 2026-11-18:
// "Warning sentences are never folded; lock the test."). Locked (evals-locks/fortune-depth__warnings.sha256,
// ~/LENSIQ-field/evals/fortune-depth/warnings/) BEFORE the fix. Round 2 of the independent review found four tarot depth texts
// that state a tradition warning without the {c: true} mark, so they folded behind "อ่านเพิ่มเติม" (num.4, suit.swords,
// rank.12, major.18; TH 3, EN 3, ZH 19 folds on the 30 locked tarot profiles).
//
// Corpus: the locked synthetic profile set ~/LENSIQ-field/evals/fortune-depth/profiles.json (480 profiles, 16 pages; its
// sha256 is in evals-locks/fortune-depth.sha256). On CI the folder does not exist, so the set is regenerated with the audit
// tool's own generator and must hash to the same locked sha256 (else the test fails). Every profile is read in TH, EN and ZH
// through the page path (tools/fortune-depth-audit.mjs readingOf -> FortuneAI.compose -> LQRead.planSection).
//
// What is a warning (fixed before the fix; independent of the product's own marks):
//   (1) keywords, per language: TH เตือน ระวัง อย่าเพิ่ง อย่ารีบ ควรเพิ่มความรอบคอบ รอบคอบขึ้น; EN caution, warn, beware,
//       be careful, careful not to, take care not to, don't / do not / never rush, hold off; ZH 提醒 谨慎 小心 注意 别急 警惕
//       当心 警告 慎重. Before matching, these non-warning uses are removed from the text (each judged by hand, reason given):
//         TH เตือนใจ                   "keep in mind / reminder" (horoscope element word, tarot one-card "a reminder, not a verdict")
//         TH เตือนเบา ๆ ว่าอย่าลืม       "gently reminds: don't forget to …" (a to-do, no risk named)
//         TH ไม่มีคู่ที่ควรระวัง           negation: "there is no pair to be careful of"
//         TH การเฝ้าระวัง               the Mountain trigram's theme noun ("watching"), not advice to the reader
//         TH คุณระมัดระวัง               a trait ("you are careful")
//         EN not a literal warning      negation (the Devil card)
//         ZH 提醒自己                   "a reminder to oneself"
//         ZH 而非字面的警告              negation (the Devil card)
//         ZH 注意到                     "noticed"
//         ZH 沉稳谨慎 / 耐心、谨慎 / 花钱谨慎 / 谨慎穿越难关   traits and a trigram attribute
//         ZH 的画面提醒你 / 梦见X提醒你   dream image "reminds you to" + practical advice (TH / EN: ชวน / reminds; any other
//                                       keyword in the sentence still counts)
//         ZH 礼貌提醒                   "a polite reminder" (to a debtor)
//         ZH 也提醒你留心听听别人的意见   numbers dom.1 advice (TH ควรเผื่อใจฟัง…, EN suggests leaving room to hear …)
//   (2) the {c: true} mark: a depth key marked {c: true} in any language is a warning in all three; the four keys of the
//       review are warnings whatever their mark. Their literal text (the pieces between {X} placeholders) must not be folded:
//       no 40-character (ZH 16) window of such a piece may appear in a folded part (windows that also occur in a depth text of
//       a non-warning key are shared template phrases and do not count; a shorter shared phrase, such as bazi none.metal's
//       "สีขาวหรือเงิน จัดโต๊ะให้โล่ง" (29 characters) inside the composer's own remedy line, is not a match).
// Tests:
//   F  fixtures: num.4, suit.swords, rank.12, major.18 are marked {c: true} in TH / EN / ZH (every variant).
//   X  a depth key marked {c: true} in one language is marked in all three.
//   S  static sweep: every depth-table text (all disciplines, TH / EN / ZH) that the keyword detector calls a warning is
//      marked {c: true}.
//   C  corpus: 480 profiles x TH / EN / ZH, 0 folded parts with a warning (1) or a warning-key window (2); every fixture key
//      is composed at least once in the corpus (not vacuous).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..", "..");
const LANGS = ["th", "en", "zh"];
const FIXTURES = ["num.4", "suit.swords", "rank.12", "major.18"];
const PROFILES_SHA = "f0b3bf19c04e6c1b58fa9fc70c31d05cbffada2c6e52c63a0f869d43ffd0af71";

const KW = {
  th: /เตือน|ระวัง|อย่าเพิ่ง|อย่ารีบ|ควรเพิ่มความรอบคอบ|รอบคอบขึ้น/,
  en: /caution|\bwarn|beware|\bbe careful|careful not to|take care not to|\b(?:don['’]t|do not|never) rush|hold off/i,
  zh: /提醒|谨慎|小心|注意|别急|警惕|当心|警告|慎重/,
};
const NOT_WARNING = {
  th: [/เตือนใจ/g, /เตือนเบา ๆ ว่าอย่าลืม/g, /ไม่มีคู่ที่ควรระวัง/g, /การเฝ้าระวัง/g, /คุณระมัดระวัง/g],
  en: [/not a literal warning/gi],
  zh: [/提醒自己/g, /而非字面的警告/g, /注意到/g, /沉稳谨慎/g, /耐心、谨慎/g, /花钱谨慎/g, /谨慎穿越难关/g, /的画面提醒你/g,
    /梦见[^，。]{1,4}提醒你/g, /礼貌提醒/g, /也提醒你留心听听别人的意见/g],
};
const isWarning = (t, L) => { let s = String(t); for (const re of NOT_WARNING[L]) s = s.replace(re, " "); return KW[L].test(s); };
const SENT = { th: /\S+(?: ๆ)?\s*/g, en: /[^.!?]+[.!?]*\s*/g, zh: /[^。！？]+[。！？]*/g };
const sentences = (t, L) => (String(t).match(SENT[L]) || []).map(x => x.trim()).filter(Boolean);

for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
global.PALM_KB = global.PALM_KB || require("../../palm-kb.js");
for (const f of ["tarot-kb.js", "iching-kb.js", "lifecal-kb.js", "numbers-kb.js", "dream-kb.js", "fortune-ai.js"]) require(path.join(ROOT, f));
const TABLES = () => globalThis.LQ_DEPTH.text;
/** every variant of a table value as {t, c} */
const variants = v => (Array.isArray(v) ? v.flatMap(variants) : v && typeof v === "object" && "t" in v ? [{ t: String(v.t), c: !!v.c }] : typeof v === "string" ? [{ t: v, c: false }] : []);
function eachKey(fn) {
  const T = TABLES();
  for (const L of LANGS) for (const [dom, tab] of Object.entries(T[L] || {})) for (const [k, v] of Object.entries(tab)) {
    if (k[0] === "_" || typeof v === "function") continue;
    fn(L, dom, k, variants(v));
  }
}
/** domain|key of every warning key: marked {c: true} in any language, plus the review's four (tarot) */
function warningKeys() {
  const out = new Set(FIXTURES.map(k => "tarot|" + k));
  eachKey((L, dom, k, vs) => { if (vs.some(x => x.c)) out.add(dom + "|" + k); });
  return out;
}
/** windows of the literal pieces of every warning key's text, per language; a window that also occurs in a non-warning
 *  depth text (a shared template phrase such as "ตามวงธาตุ แปลว่าสถานการณ์ภายนอก…") is not a warning window */
function warningWindows() {
  const W = { th: new Map(), en: new Map(), zh: new Map() }, other = { th: new Set(), en: new Set(), zh: new Set() }, keys = warningKeys();
  eachKey((L, dom, k, vs) => {
    const n = L === "zh" ? 16 : 40, warn = keys.has(dom + "|" + k);
    for (const v of vs) for (const piece of v.t.split(/\{\w+\}/)) {
      const p = L === "en" ? piece.toLowerCase() : piece;
      for (let i = 0; i + n <= p.length; i++) { const w = p.slice(i, i + n); if (warn) W[L].set(w, dom + "|" + k); else other[L].add(w); }
    }
  });
  for (const L of LANGS) for (const w of other[L]) W[L].delete(w);
  return W;
}
function windowHit(text, L, W) {
  const n = L === "zh" ? 16 : 40, t = L === "en" ? String(text).toLowerCase() : String(text);
  for (let i = 0; i + n <= t.length; i++) { const k = W[L].get(t.slice(i, i + n)); if (k) return k; }
  return null;
}

let corpus = null;
async function loadCorpus() {
  if (corpus) return corpus;
  const tool = await import(path.join(ROOT, "tools", "fortune-depth-audit.mjs"));
  const locked = path.join(os.homedir(), "LENSIQ-field", "evals", "fortune-depth", "profiles.json");
  const bytes = fs.existsSync(locked) ? fs.readFileSync(locked) : Buffer.from(JSON.stringify(tool.makeProfiles(), null, 1) + "\n");
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha, PROFILES_SHA, "profiles.json is not the locked set (evals-locks/fortune-depth.sha256)");
  assert.ok(fs.readFileSync(path.join(ROOT, "evals-locks", "fortune-depth.sha256"), "utf8").includes(PROFILES_SHA + "  profiles.json"));
  const set = JSON.parse(bytes.toString("utf8")), now = new Date(set.now);
  const RD = require("../../fortune-read.js"), out = [];
  for (const L of LANGS) for (const p of set.profiles) {
    const rd = tool.readingOf(p, now, L);
    for (const s of rd.sections) for (const part of RD.planSection(s, L)) out.push({ id: p.id, L, sec: s.id, visible: !!part.visible, text: String(part.text) });
  }
  corpus = { n: set.profiles.length * LANGS.length, parts: out };
  return corpus;
}

test("F: the review's four warning texts are marked {c: true} in TH / EN / ZH", () => {
  const T = TABLES(), miss = [];
  for (const L of LANGS) for (const k of FIXTURES) {
    const vs = variants(T[L].tarot[k]);
    assert.ok(vs.length, `${L} tarot ${k} missing`);
    if (!vs.every(x => x.c)) miss.push(`${L} ${k}`);
  }
  assert.deepEqual(miss, [], `not marked {c: true}: ${miss.join(", ")}`);
});

test("X: a depth key marked {c: true} in one language is marked in all three", () => {
  const T = TABLES(), keys = warningKeys(), miss = [];
  for (const dk of keys) {
    const [dom, k] = dk.split("|");
    for (const L of LANGS) { const vs = variants(((T[L] || {})[dom] || {})[k]); if (vs.length && !vs.every(x => x.c)) miss.push(`${L} ${dom} ${k}`); }
  }
  assert.deepEqual(miss, [], `warning key not marked in every language: ${miss.join(", ")}`);
});

test("S: every depth-table text that states a warning (keyword detector) is marked {c: true}", () => {
  const miss = [];
  let n = 0;
  eachKey((L, dom, k, vs) => { for (const v of vs) { n++; if (!v.c && isWarning(v.t, L)) miss.push(`${L} ${dom} ${k}: ${v.t.slice(0, 90)}`); } });
  assert.ok(n >= 1800, `depth tables scanned: ${n}`);
  assert.deepEqual(miss, [], `${miss.length} unmarked warning texts:\n${miss.join("\n")}`);
});

test("C: on the locked profiles x TH / EN / ZH no warning sentence is folded behind อ่านเพิ่มเติม", async () => {
  const { n, parts } = await loadCorpus(), W = warningWindows(), bad = [], seen = new Set();
  assert.equal(n, 1440);
  for (const x of parts) {
    const key = windowHit(x.text, x.L, W);
    if (key) seen.add(key);
    if (x.visible) continue;
    if (key) { bad.push(`${x.L} ${x.id} ${x.sec} [${key}] ${x.text.slice(0, 120)}`); continue; }
    if (!isWarning(x.text, x.L)) continue; // the whole part, so a multi-word exclusion is never cut by the sentence split
    const s = sentences(x.text, x.L).find(t => isWarning(t, x.L)) || x.text;
    bad.push(`${x.L} ${x.id} ${x.sec} [keyword] ${s.slice(0, 120)}`);
  }
  for (const k of FIXTURES) assert.ok(seen.has("tarot|" + k), `fixture tarot ${k} never composed in the corpus`);
  assert.deepEqual(bad, [], `${bad.length} folded warning parts:\n${bad.slice(0, 60).join("\n")}`);
});
