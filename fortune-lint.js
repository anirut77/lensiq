"use strict";
/* fortune-lint.js — the language checks of the local fortune composer (FortuneAI.lint / lintSemantic / lintEn / lintZh), moved
 * out of fortune-ai.js unchanged (2026-11-16, fortune quality round) so the composer stays under its size cap (eslint.config.mjs
 * SIZE_CAPS). Used by the unit tests and the review tools in Node only; pages never call these checks, so the file is not
 * loaded in the browser. fortune-ai.js passes the composer internals the checks read (I) and loads this file on first use. */
module.exports = function makeLint(I) {
  const { ACTION_FRAMES, ADVICE_FRAMES, ADVICE_STATEMENT_FRAMES, ADV_TOPIC, AXES, BRIDGES, CLOSERS, COLOR_LINES, CONNECTORS, DIRECTION_LINES, ENERGY_LINES, EN_ACTION_RE, EN_CHAIN, EN_CHAL, EN_FILLER_RE, EN_FIRST, EN_NEXT, EN_OMEN, EN_OPENERS, EN_PLAIN_FIRST, EN_PLAIN_NEXT, EN_REL, EN_THAT_COND, FILLER_BUDGET, FILLER_RE, FOREIGN, FRAME_STEMS, GLOSSARY, HEADLINES, INTROS, INTRO_DATA, INTRO_TOPIC, LINT_RULES, LOVE_STRICT, OPENERS, OPENERS_BY_DOMAIN, OWN_LEX, PHRASE_BUDGET, SECTION_KEYS, SYN_CONTRAST, SYN_PAIR, TOPIC_LEX, TRAIT_OPP, ZH_CHAL, ZH_FILLER_RE, ZH_FIRST, ZH_NEXT, ZH_OPENERS, ZH_REL, adviceKeysOf, adviceOffTopic, cautionIssues, enLabelEcho, enLoad, enSentences, grammarIssues, habitAsTradRe, hasKeys, isSafe, labelEcho, loveOnlyIn, nearDupPairs, normalizeFacts, phrasesIn, reEsc, remedyIssues, sentences, speaksTo, tautology, topicsIn, traitsOf, unsafeCategory } = I;
  /* ---------- English lint: no Thai/Chinese, no empty sections or unfilled slots, safe, clean punctuation and sentence case,
     no duplicate sentences, no doubled words, the same subject not named twice in a row, label-echo / report-chain,
     filler budget, plus the shared advice-topic, caution-gentle, remedy-safety and remedy-match rules ---------- */
  const enFrameRe = f => new RegExp("^" + reEsc(f).replace(/\\\{[NS]\\\}/g, "(.{3,70}?)").replace(/\\\{M\\\}$/, ""), "i");
  const EN_SUBJ_RES = Array.from(new Set(EN_FIRST.concat(EN_NEXT, EN_CHAL, EN_REL, EN_PLAIN_FIRST, EN_PLAIN_NEXT))).map(enFrameRe);
  const enBase = n => String(n).replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
  function enSubject(sen) { const t = sen.trim(); for (const re of EN_SUBJ_RES) { const m = re.exec(t); if (m) return enBase(m[1]); } return ""; }
  function lintEn(result) {
    const out = [], secs = (result && result.sections) || [];
    const push = (rule, section, excerpt) => out.push({ rule, section: section || "", excerpt: String(excerpt).slice(0, 140) });
    if (!secs.length) push("empty-reading", "", "");
    const seen = new Set();
    for (const s of secs) {
      const t = (s.paragraphs || []).join(" ");
      if (!t.trim()) push("empty-section", s.id, s.title);
      if (FOREIGN.test(t + (s.title || ""))) push("foreign-script", s.id, t.match(/.{0,20}[฀-๿⺀-鿿豈-﫿　-〿＀-￯]+.{0,20}/)[0]);
      if (/\{[A-Za-z]+\}/.test(t)) push("unfilled-slot", s.id, t);
      if (/·|•|→|←|\s\|\s/.test(t)) push("raw-separator", s.id, t.match(/.{0,12}(?:·|•|→|←|\s\|\s).{0,12}/)[0]);
      if (/\s[,.;:!?]|[,;:]\.|\.\.|,,|\(\s*\)/.test(t)) push("punctuation", s.id, t.match(/.{0,15}(?:\s[,.;:!?]|[,;:]\.|\.\.|,,|\(\s*\)).{0,15}/)[0]);
      const d = /\b([A-Za-z]{3,})\s+\1\b/i.exec(t); if (d && !/^(?:that|had|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|nineteen|very|so)$/i.test(d[1])) push("doubled-word", s.id, d[0]);
      const sens = (s.paragraphs || []).flatMap(enSentences);
      for (const x of sens) {
        if (/^["“(]?[a-z]/.test(x)) push("sentence-case", s.id, x.slice(0, 60));
        if (!isSafe(x)) push("unsafe", s.id, (unsafeCategory(x) || "banned") + ": " + x.slice(0, 80));
        if (x.length >= 20 && seen.has(x)) push("dup-sentence", s.id, x); seen.add(x);
        const e = enLabelEcho(x); if (e) push("label-echo", s.id, e.word + ": " + x.slice(0, 100));
        if (EN_CHAIN.test(x)) push("report-chain", s.id, x.slice(0, 100));
        if (EN_THAT_COND.test(x)) push("that-clause", s.id, x.slice(0, 100));
      }
      for (let i = 1; i < sens.length; i++) { const a = enSubject(sens[i - 1]), b = enSubject(sens[i]); if (a && a === b) push("repeat-subject", s.id, sens[i - 1].slice(0, 40) + " | " + sens[i].slice(0, 40)); }
    }
    const all = secs.map(s => (s.paragraphs || []).join(" ")).join(" ");
    const fl = all.match(EN_FILLER_RE) || [];
    if (fl.length > FILLER_BUDGET) push("filler-budget", "", fl.join(","));
    const sm = result && result.summary;
    if (sm) for (const l of sm.lines || []) { if (FOREIGN.test(l.k + l.t)) push("foreign-script", "summary", l.k + l.t); if (!isSafe(l.t)) push("unsafe", "summary", l.t); }
    if (result && result.reminder && (FOREIGN.test(result.reminder) || !isSafe(result.reminder))) push("reminder", "", result.reminder);
    for (const p of (result && result.plan && result.plan.items) || []) if (FOREIGN.test(p.t + p.for) || !isSafe(p.t)) push("plan", "plan", p.for + " " + p.t);
    out.push(...adviceTopicIssues(result), ...cautionIssues(result), ...remedyIssues(result));
    for (const d of nearDupPairs(result && result.sections, "en")) out.push({ rule: "near-duplicate", section: d.secB, excerpt: d.sim.toFixed(2) + ": " + d.b.slice(0, 70) });
    return out;
  }

  /* ---------- 中文检查：不得出现泰文、空章节、未填的占位符、禁用词、重复句、超额的"都提到了"、
     建议句式里多余的副词（"可以先也…"）、同一主语连续两句点名（"坤卦也提示…坤卦还说明…"）、
     "这次的重点在A"之后紧接着再点名A ---------- */
  const zhFrameRe = f => new RegExp("^" + reEsc(f).replace(/\\\{[NS]\\\}/g, "([^，。：；]{2,24}?)").replace(/\\\{M\\\}$/, ""));
  const ZH_SUBJ_RES = Array.from(new Set(ZH_FIRST.concat(ZH_NEXT, ZH_CHAL, ZH_REL))).map(zhFrameRe);
  const ZH_HEAD_RE = /^这次(?:最突出的是|的重点在)(.+?)。?$/;
  const zhBase = n => String(n).replace(/[（(][^）)]*[）)]/g, "").trim();
  function zhSubject(sen) { const t = sen.trim(); for (const re of ZH_SUBJ_RES) { const m = re.exec(t); if (m) return zhBase(m[1]); } return ""; }
  const ZH_ADV_DUP = /可以先(?:先|也|还|再|又|都|就)|(?:建议你|不妨|试着)(?:也|还|又|都)(?![是要])/;
  /* advice-topic: ถามเรื่องเงิน/งาน/รัก แต่คำแนะนำ (หัวข้อคำแนะนำ หรือประโยคปิดของหัวข้อที่ถาม) เป็นเรื่องของหัวข้ออื่น */
  const ACTION_RE = new RegExp("(?:" + ACTION_FRAMES.map(f => reEsc(f).replace(/\\\{TW\\\}/g, "\\S{1,24}?").replace(/\\\{M\\\}/g, "")).join("|") + ")(.+)");
  const ZH_ACTION_RE = /(?:建议你|不妨|试着|可以先|记得|多|先)[^。！？]*[。！？]?/;
  function adviceTopicIssues(result) {
    const out = [], topic = result && result.topic;
    // ถามภาพรวม: ประโยคปิดของหัวข้อหลัก (ตัวตน) ต้องเป็นคำแนะนำกลาง ๆ ไม่ใช่คำแนะนำเรื่องรัก/เงิน/งาน
    const overall = topic === "overall";
    if (!ADV_TOPIC[topic] && !overall) return out;
    const zh = result.lang === "zh", en = result.lang === "en", own = overall ? "personality" : topic;
    const off = m => (overall ? topicsIn(m).length > 0 : adviceOffTopic(m, topic));
    for (const s of (result.sections || [])) {
      if (overall ? s.id !== own : s.id !== "advice" && s.id !== topic) continue;
      for (const p of s.paragraphs || []) {
        const sens = zh ? p.split(/(?<=[。！？])/).map(x => x.trim()).filter(Boolean) : en ? enSentences(p) : sentences(p);
        sens.forEach((x, i) => {
          let m = null;
          if (s.id === "advice") m = x;
          else if (en) { const a = EN_ACTION_RE.exec(x); m = a ? a[1] : null; }
          else if (zh) m = ZH_ACTION_RE.test(x) && /建议|不妨|试着|可以先/.test(x) ? x : null;
          else { const a = ACTION_RE.exec(x); m = a ? a[1] : null; }
          // ประโยคที่ถูกแบ่งกลางคำแนะนำ ("…เป็นรายได้เสริม เช่น | สอนหรือรับงานพิเศษ") ตัดสินรวมกับชิ้นก่อนหน้า
          if (m && off(m) && (s.id !== "advice" || !i || off(sens[i - 1] + " " + m))) out.push({ rule: "advice-topic", section: s.id, excerpt: topic + " ← " + topicsIn(m)[0] + ": " + x.slice(0, 100) });
        });
      }
    }
    return out;
  }
  function lintZh(result) {
    const out = [], secs = (result && result.sections) || [];
    const push = (rule, section, excerpt) => out.push({ rule, section: section || "", excerpt: String(excerpt).slice(0, 120) });
    if (!secs.length) push("empty-reading", "", "");
    const seen = new Set();
    for (const s of secs) {
      const t = (s.paragraphs || []).join("");
      if (!t.trim()) push("empty-section", s.id, s.title);
      if (/[฀-๿]/.test(t + (s.title || ""))) push("thai-in-zh", s.id, t.match(/.{0,20}[฀-๿]+.{0,20}/)[0]);
      if (/\{[A-Za-z]+\}/.test(t)) push("unfilled-slot", s.id, t);
      if (/·|•|→|←|\s\|\s/.test(t)) push("raw-separator", s.id, t.match(/.{0,12}(?:·|•|→|←|\s\|\s).{0,12}/)[0]);
      if (!isSafe(t)) push("unsafe", s.id, t);
      if (/[，。、]{2,}|。，|，。|：。/.test(t)) push("punctuation", s.id, t.match(/.{0,10}(?:[，。、]{2,}|。，|，。|：。).{0,10}/)[0]);
      for (const x of t.split(/(?<=[。！？])/)) { const k = x.trim(); if (k.length >= 8 && seen.has(k)) push("dup-sentence", s.id, k); seen.add(k); }
      if (ZH_ADV_DUP.test(t)) push("adverb-slot", s.id, t.match(new RegExp(".{0,8}(?:" + ZH_ADV_DUP.source + ").{0,12}"))[0]);
      const sens = t.split(/(?<=[。！？])/).map(x => x.trim()).filter(Boolean);
      for (let i = 1; i < sens.length; i++) {
        const a = zhSubject(sens[i - 1]), b = zhSubject(sens[i]);
        if (a && a === b) push("repeat-subject", s.id, sens[i - 1].slice(0, 30) + "｜" + sens[i].slice(0, 30));
        const h = ZH_HEAD_RE.exec(sens[i - 1]);
        if (h && b && zhBase(h[1]).indexOf(b) >= 0) push("repeat-subject", s.id, sens[i - 1].slice(0, 30) + "｜" + sens[i].slice(0, 30));
      }
    }
    const all = secs.map(s => (s.paragraphs || []).join("")).join("");
    const fl = all.match(ZH_FILLER_RE) || [];
    if (fl.length > FILLER_BUDGET) push("filler-budget", "", fl.join(","));
    const sm = result && result.summary;
    if (sm) for (const l of sm.lines || []) if (/[฀-๿]/.test(l.k + l.t)) push("thai-in-zh", "summary", l.k + l.t);
    out.push(...adviceTopicIssues(result), ...cautionIssues(result), ...remedyIssues(result));
    for (const d of nearDupPairs(result && result.sections, "zh")) out.push({ rule: "near-duplicate", section: d.secB, excerpt: d.sim.toFixed(2) + ": " + d.b.slice(0, 40) });
    return out;
  }
  /* (the Thai lint rules LINT_RULES stay in fortune-ai.js: the composer uses them too) */
  const LINT_CONN_RE = new RegExp("(^|\\s)(" + CONNECTORS.slice().sort((a, b) => b.length - a.length).map(reEsc).join("|") + ")\\s", "g");
  const LINT_STEMS = new Set(FRAME_STEMS.filter(x => ["ชวนให้", "แนะให้", "ที่ปรากฏนี้", "ไม่เพียงเท่านั้น"].indexOf(x) < 0));
  function lint(result) {
    if (result && result.lang === "zh") return lintZh(result);
    if (result && result.lang === "en") return lintEn(result);
    const out = [];
    const secs = (result && result.sections) || [];
    const all = secs.map(s => (s.paragraphs || []).join(" ")).join(" ");
    for (const s of secs) {
      const t = (s.paragraphs || []).join(" ");
      if (t.length < 90) out.push({ rule: "thin-section", section: s.id, excerpt: t });
      for (const p of s.paragraphs || []) for (const [rule, re] of LINT_RULES) {
        const m = re.exec(p);
        if (m) out.push({ rule, section: s.id, excerpt: p.slice(Math.max(0, m.index - 30), m.index + 40) });
      }
      if (s.id === "money") for (const cl of t.split(" ")) if (cl.length >= 20 && TOPIC_LEX.love.test(cl) && !TOPIC_LEX.money.test(cl)) out.push({ rule: "off-topic", section: s.id, excerpt: cl.slice(0, 80) });
      if (loveOnlyIn(t, s.id)) out.push({ rule: "topic-mismatch", section: s.id, excerpt: t.split(/\s+/).find(c => c.length >= 12 && LOVE_STRICT.test(c) && !OWN_LEX[s.id].test(c)) });
      for (const p of s.paragraphs || []) for (const g of grammarIssues(p)) out.push({ rule: g.rule, section: s.id, excerpt: p.slice(Math.max(0, g.at - 30), g.at + 40) });
      // "X บ่งบอกว่า X…": ชื่อที่อยู่ติดหน้ากริยารายงานถูกพูดซ้ำในเนื้อความ
      for (const p of s.paragraphs || []) { const e = labelEcho(p); if (e) out.push({ rule: "label-echo", section: s.id, excerpt: e.word + ": " + p.slice(Math.max(0, e.at - 40), e.at + 50) }); }
      // เนื้อหาต้องห้าม/คำฟันธง ("…แน่นอน") ต้องไม่อยู่ในคำทำนาย
      for (const p of s.paragraphs || []) for (const x of sentences(p)) if (!isSafe(x)) out.push({ rule: "unsafe", section: s.id, excerpt: (unsafeCategory(x) || "banned") + ": " + x.slice(0, 80) });
    }
    // ประโยคกลาง ๆ แบบ "ชี้ไปทางเดียวกัน/สอดคล้องกัน/ควรให้น้ำหนัก" ไม่เกิน FILLER_BUDGET ต่อคำทำนาย
    const fl = all.match(FILLER_RE) || [];
    if (fl.length > FILLER_BUDGET) out.push({ rule: "filler-budget", section: "", excerpt: fl.join(", ") });
    // ขั้วความหมายที่ขัดกันบนแกนเดียวกัน (เบื่องานซ้ำ ↔ ยิ่งอยู่สายเดิมยิ่งดี ฯลฯ)
    for (const [id, a, b] of AXES) { const x = a.exec(all), y = b.exec(all); if (x && y) out.push({ rule: "polarity-conflict", section: "", excerpt: id + ": " + x[0] + " ↔ " + y[0] }); }
    // คำเชื่อมนับเฉพาะเมื่อใช้เป็นคำเชื่อมจริง (ต้นอนุประโยค ตามด้วยช่องว่าง) — "ที่สำคัญที่สุด" ไม่นับ
    const counts = {};
    for (const m of all.matchAll(LINT_CONN_RE)) counts[m[2]] = (counts[m[2]] || 0) + 1;
    for (const p of phrasesIn(all)) if (LINT_STEMS.has(p)) counts[p] = (counts[p] || 0) + 1;
    for (const p in counts) if (counts[p] > PHRASE_BUDGET) out.push({ rule: "connector-overuse", section: "", excerpt: p + " ×" + counts[p] });
    out.push(...adviceTopicIssues(result), ...cautionIssues(result), ...remedyIssues(result));
    for (const d of nearDupPairs(secs, "th", result && result._dupNames)) out.push({ rule: "near-duplicate", section: d.secB, excerpt: d.sim.toFixed(2) + ": " + d.b.slice(0, 70) });
    // habit-as-tradition: นิสัยทั่วไป (habit.* และวิธีที่ไม่ใช่สี/ธาตุ/ทิศ) ต้องไม่ถูกนำหน้าด้วย "ตามตำรา"/"เคล็ดเสริมดวง"
    for (const s of secs) for (const p of s.paragraphs || []) { const m = habitAsTradRe().exec(p.replace(/\s+/g, "")); if (m) out.push({ rule: "habit-as-tradition", section: s.id, excerpt: m[0].slice(0, 80) }); }
    for (const it of (result && result.plan && result.plan.items) || []) if (habitAsTradRe().test(String(it.t).replace(/\s+/g, ""))) out.push({ rule: "habit-as-tradition", section: "plan", excerpt: String(it.t).slice(0, 80) });
    return out;
  }

  /* ---------- ตัวตรวจความสอดคล้องเชิงความหมาย (semantic lint) — ใช้ได้กับทุกศาสตร์ ----------
     lintSemantic(facts, result) ต้องใช้ผลจาก compose(facts, { trace: true }) (มี _claims/_sentences)
     คืน [{ rule, section, excerpt }] — กฎ:
      omen-vs-reflect  ฝันที่ตำราไม่ถือเป็นลาง (register "reflect") ต้องไม่มีถ้อยคำทำนายล่วงหน้า (ลางดี/สัญญาณของ…/จะมีโชคเข้ามา)
      claim-support    ประโยคผสาน "A กับ B หนุนเรื่อง X" ต้องเป็นสิ่งที่พบซึ่งพูดถึงเรื่อง X จริง (focus/tags + มีความหมายของหัวข้อนั้น)
                       และประโยคของสิ่งที่พบในหัวข้อใด ต้องมาจากสิ่งที่พบที่มีความหมายของหัวข้อนั้น
      number-evidence  ตัวเลขทุกตัวในคำทำนายต้องมีอยู่ในข้อมูลที่วัด/คำนวณได้ (facts) หรือในคลังสำนวน — ห้ามแต่งตัวเลข
      trait-conflict   ลักษณะนิสัยที่ขัดกันเอง (ใจร้อน/ใจเย็น, เก็บตัว/ชอบเข้าสังคม …) ต้องไม่อยู่ในคำทำนายเดียวกัน
      advice-repeat    คำแนะนำหมวดเดียวกัน (สีมงคล กระเป๋าสตางค์ ทำบุญ ทิศ …) ใช้ได้ครั้งเดียวต่อคำทำนาย
      tense-position   ไพ่/สิ่งที่พบในตำแหน่ง "อดีต/รากเหง้า" ต้องไม่ใช้กาลอนาคต
      section-fit      หัวข้อที่ไม่เหมาะกับศาสตร์ (เช่น "บุคลิกและตัวตน" ในการทำนายฝัน) ต้องไม่ปรากฏ
      formulaic        กรอบสำเร็จรูป "X ยังบอกอีกว่า/ยังช่วยเสริมด้วยว่า" ต้องไม่ปรากฏ
      summary          การ์ดสรุปต้องมี 2–3 บรรทัด ปลอดภัย และ (ฝันแบบภาพสะท้อนใจ) ไม่มีถ้อยคำทำนายล่วงหน้า */
  const OMEN_CLAIM = /(?<!มากกว่า|ไม่ใช่|ไม่ได้เป็น)ลาง(?:ดี|ร้าย|ของ|มงคล|บอกเหตุ)|(?<!ไม่ใช่|ไม่ได้|ไม่ถือ)เป็นลาง|สัญญาณ(?:ของ|บวก|ดี|ว่า)|นิมิตมงคล|เห็นผลเร็ว|(?:กำลัง|จะ)เข้ามา|ไหลมาเทมา|โชคดีที่กำลัง/;
  const FUTURE = /(?<!ไม่)จะ(?!ๆ)|ในอนาคต|กำลังจะ|ต่อจากนี้ไป|(?<!สถานการณ์)ตอนนี้|ขณะนี้/;
  const PAST_ITEM = it => /\.(?:past|root)/.test(it.id) || /^(?:อดีต|รากเหง้า|ที่มา)$/.test(it.group || "");
  const DOMAIN_NO_SECTIONS = { dream: ["personality", "social"], siamsee: [], numbers: [] };
  const numsIn = t => (String(t).match(/\d+(?:[.,]\d+)?/g) || []).map(n => n.replace(",", "."));
  let BANK_NUMS = null;
  function bankNums() {
    if (BANK_NUMS) return BANK_NUMS;
    const all = [OPENERS, CONNECTORS, CLOSERS, ADVICE_FRAMES, ADVICE_STATEMENT_FRAMES, HEADLINES, BRIDGES, SYN_PAIR, SYN_CONTRAST, COLOR_LINES, ENERGY_LINES, DIRECTION_LINES, INTRO_DATA, INTRO_TOPIC, ACTION_FRAMES]
      .concat(Object.values(INTROS), Object.values(OPENERS_BY_DOMAIN), GLOSSARY.map(g => [g[2]])).flat().join(" ");
    BANK_NUMS = new Set(numsIn(all));
    return BANK_NUMS;
  }
  const ZH_OMEN = /预示|将会|即将|好运要来|必有|注定/;
  /* ดูคู่ (variant "pair"): ประโยคที่เล่าถึง "อีกฝ่าย" ต้องเป็นบุคคลที่สาม (อีกฝ่าย/对方) ไม่ใช่ "คุณ…/你…",
     และประโยคเปิดต้องเป็นของการดูคู่ ไม่ใช่ประโยคเปิดของดวงรายปี */
  function pairChecks(F, result, lang) {
    const out = [];
    if (F.variant !== "pair") return out;
    const partnerWord = lang === "zh" ? /对方/ : lang === "en" ? /\bthe other person\b/i : /อีกฝ่าย/;
    for (const c of (result && result._claims) || []) if (c.kind === "item" && /^b\./.test(c.ids[0]) && !partnerWord.test(c.text)) out.push({ rule: "partner-person", section: c.sec || "", excerpt: c.text.slice(0, 100) });
    const first = (((result && result.sections) || [])[0] || {}).paragraphs || [];
    const yearly = lang === "zh" ? ZH_OPENERS[F.domain] || [] : lang === "en" ? EN_OPENERS[F.domain] || [] : (OPENERS_BY_DOMAIN[F.domain] || []).map(o => o.split("{N}")[0]);
    if (first[0] && yearly.some(o => o && first[0].startsWith(o))) out.push({ rule: "pair-opener", section: "overview", excerpt: first[0].slice(0, 80) });
    return out;
  }
  /* รอบ 11 — plan-element: ธาตุที่แผนให้เสริมต้องเป็นธาตุที่ผังต้องการ (facts.helpful); ใช้กับทุกภาษา */
  function planElementIssues(facts, result) {
    const help = facts && Array.isArray(facts.helpful) ? facts.helpful : null, out = [];
    if (!help || !help.length) return out;
    for (const p of (result && result.plan && result.plan.items) || []) {
      const e = (/^el\.(\w+)$/.exec(p.key || "") || [])[1];
      if (e && help.indexOf(e) < 0) out.push({ rule: "plan-element", section: "plan", excerpt: e + " ∉ " + help.join("/") + ": " + String(p.t).slice(0, 60) });
    }
    return out;
  }
  function lintSemantic(facts, result) {
    return lintSemantic0(facts, result).concat(planElementIssues(facts, result));
  }
  function lintSemantic0(facts, result) {
    if (result && result.lang === "en") {
      // English: numbers must come from the facts / phrase banks, reflective dreams carry no omen wording, sections fit the domain
      const out = [], F = normalizeFacts(facts), secs = result.sections || [];
      const known = new Set(numsIn(JSON.stringify(facts)).concat(Array.from(bankNums()), numsIn(JSON.stringify(enLoad()[F.domain] || {}))));
      const reflect = F.register === "reflect";
      for (const s of secs) for (const p of s.paragraphs || []) {
        for (const n of numsIn(p)) if (!known.has(n)) out.push({ rule: "number-evidence", section: s.id, excerpt: n + " in: " + p.slice(0, 60) });
        if (reflect && EN_OMEN.test(p)) out.push({ rule: "omen-vs-reflect", section: s.id, excerpt: p.slice(0, 80) });
      }
      for (const s of secs) if ((DOMAIN_NO_SECTIONS[F.domain] || []).indexOf(s.id) >= 0) out.push({ rule: "section-fit", section: s.id, excerpt: s.title });
      out.push(...pairChecks(F, result, "en"), ...remedyIssues(result, facts).filter(x => x.rule === "remedy-match"));
      return out;
    }
    if (result && result.lang === "zh") {
      // 中文：数字须来自资料、梦（心绪之梦）不得有预言式说法、总结须安全
      const out = [], F = normalizeFacts(facts), secs = result.sections || [];
      const known = new Set(numsIn(JSON.stringify(facts)).concat(Array.from(bankNums())));
      const reflect = F.register === "reflect";
      for (const s of secs) for (const p of s.paragraphs || []) {
        for (const n of numsIn(p)) if (!known.has(n)) out.push({ rule: "number-evidence", section: s.id, excerpt: n + " in: " + p.slice(0, 60) });
        if (reflect && ZH_OMEN.test(p)) out.push({ rule: "omen-vs-reflect", section: s.id, excerpt: p.slice(0, 80) });
      }
      for (const s of secs) if ((DOMAIN_NO_SECTIONS[F.domain] || []).indexOf(s.id) >= 0) out.push({ rule: "section-fit", section: s.id, excerpt: s.title });
      out.push(...pairChecks(F, result, "zh"), ...remedyIssues(result, facts).filter(x => x.rule === "remedy-match"));
      return out;
    }
    const out = [], F = normalizeFacts(facts), byId = new Map(F.items.map(it => [it.id, it]));
    const secs = (result && result.sections) || [];
    const all = secs.map(s => (s.paragraphs || []).join(" ")).join(" ");
    const push = (rule, section, excerpt) => out.push({ rule, section: section || "", excerpt: String(excerpt).slice(0, 160) });
    const present = t => { const k = String(t); if (all.indexOf(k) >= 0) return true; const mid = k.slice(Math.floor(k.length / 3), Math.floor(k.length / 3) + 24); return mid.length >= 12 && all.indexOf(mid) >= 0; };
    const reflect = F.register === "reflect" || F.items.some(it => facts.items && facts.items.find(x => x.id === it.id && x.omen === false));
    // omen vs reflect
    if (reflect) {
      for (const s of secs) for (const p of s.paragraphs || []) { const m = OMEN_CLAIM.exec(p); if (m) push("omen-vs-reflect", s.id, p.slice(Math.max(0, m.index - 40), m.index + 50)); }
    }
    // claims
    const ovItems = new Set(((result && result._claims) || []).filter(c => c.kind === "item" && c.sec === "overview").map(c => c.ids[0]));
    for (const c of (result && result._claims) || []) {
      if (!present(c.text)) continue;
      const its = c.ids.map(id => byId.get(id));
      if (its.some(x => !x)) { push("claim-support", c.sec, "unknown item " + c.ids.join(",")); continue; }
      if (c.kind === "pair" || c.kind === "contrast") {
        // "ภาพรวม": สิ่งที่พบต้องถูกเล่าในภาพรวมด้วยประโยคของตัวเอง
        const ok = it => (c.tag === "overview" ? ovItems.has(it.id) : speaksTo(it, c.tag));
        for (const it of its) if (!ok(it)) push("claim-support", c.sec, it.id + " ↛ " + c.tag + ": " + c.text);
      } else if (c.kind === "item" && c.sec && SECTION_KEYS[c.sec]) {
        if (!hasKeys(its[0], SECTION_KEYS[c.sec])) push("claim-support", c.sec, its[0].id + " has no " + c.sec + " meaning: " + c.text);
      } else if (c.kind === "intro") {
        for (const it of its) if (!speaksTo(it, c.tag)) push("claim-support", c.sec, it.id + " named in intro ↛ " + c.tag);
      }
      // tense: past-position items
      if (c.kind === "item" && PAST_ITEM(its[0])) { const m = FUTURE.exec(c.text); if (m) push("tense-position", c.sec, c.text); }
    }
    // numbers
    const known = new Set(numsIn(JSON.stringify(facts)).concat(Array.from(bankNums())));
    for (const s of secs) for (const p of s.paragraphs || []) for (const n of numsIn(p)) if (!known.has(n)) push("number-evidence", s.id, n + " in: " + p.slice(0, 80));
    // traits
    const tr = traitsOf(all);
    for (const k of tr) if (tr.indexOf(TRAIT_OPP[k]) >= 0 && k < TRAIT_OPP[k]) push("trait-conflict", "", k + "/" + TRAIT_OPP[k]);
    // advice repeats (ประโยคที่ยังอยู่ในคำทำนายจริง)
    const seenK = {};
    for (const snt of ((result && result._sentences) || []).filter(present)) for (const k of adviceKeysOf(snt)) { if (seenK[k]) push("advice-repeat", "", k + ": " + seenK[k].slice(0, 60) + " ‖ " + snt.slice(0, 60)); else seenK[k] = snt; }
    // ซ้ำชื่อสิ่งที่พบ: "{ชื่อ} หมายถึง…{ชื่อ}"
    const names = F.items.map(it => it.label).concat(F.items.map(it => it.short).filter(Boolean));
    for (const s of secs) for (const p of s.paragraphs || []) { const c = tautology(p, names); if (c) push("label-tautology", s.id, c + ": " + p.slice(Math.max(0, p.indexOf(c) - 10), p.indexOf(c) + 90)); }
    // ศาสตร์ตัวเลข: ห้ามบอกให้เลี่ยงคู่เลขที่อยู่ในเลขนี้และถูกอ่านว่าดี (และห้ามชมคู่ที่ตำราจัดว่าควรระวังว่าเป็นคู่ที่ "นิยม")
    if (F.domain === "numbers") {
      const good = new Set(F.items.filter(it => /^pair\.\d\d$/.test(it.id) && it.polarity !== "challenge").map(it => it.id.slice(5)));
      const care = new Set(F.items.filter(it => /^pair\.\d\d$/.test(it.id) && it.polarity === "challenge").map(it => it.id.slice(5)));
      for (const s of secs) for (const p of s.paragraphs || []) for (const cl of p.split(/\s+(?=[^\d\s/])/)) {
        const prs = cl.match(/\b\d\d\b/g) || [];
        if (/เลี่ยง/.test(cl)) for (const x of prs) if (good.has(x)) push("numbers-polarity", s.id, "avoid " + x + " (read as good): " + cl.slice(0, 90));
        if (/นิยม|ยอดนิยม|มั่นคง/.test(cl) && !/เลี่ยง|ระวัง|ใส่ใจ/.test(cl)) for (const x of prs) if (care.has(x)) push("numbers-polarity", s.id, "praise " + x + " (care pair): " + cl.slice(0, 90));
      }
    }
    // sections that don't fit the domain
    for (const s of secs) if ((DOMAIN_NO_SECTIONS[F.domain] || []).indexOf(s.id) >= 0) push("section-fit", s.id, s.title);
    out.push(...pairChecks(F, result, "th"), ...remedyIssues(result, facts).filter(x => x.rule === "remedy-match"));
    // ถามเรื่องเงิน/งาน แต่ประโยคของสิ่งที่พบในภาพรวมเล่าเรื่องรักล้วน ๆ ("ถามเรื่องเงิน → คู่ 56 แปลได้ว่าความรักมั่นคง")
    if (OWN_LEX[F.topic]) for (const c of (result && result._claims) || []) if (c.kind === "item" && c.sec === "overview" && present(c.text) && byId.get(c.ids[0]) && loveOnlyIn([byId.get(c.ids[0]).label, byId.get(c.ids[0]).short].filter(Boolean).reduce((t, n) => t.split(n).join(" "), c.text).replace(/\s*[(（][^)）]*[)）]/g, ""), F.topic)) push("overview-topic", "overview", F.topic + ": " + c.text);
    // formulaic frames
    for (const f of ["ยังบอกอีกว่า", "ยังช่วยเสริมด้วยว่า"]) if (all.indexOf(f) >= 0) push("formulaic", "", f);
    // summary card
    const sm = result && result.summary;
    if (sm) {
      if (!Array.isArray(sm.lines) || sm.lines.length < 2 || sm.lines.length > 3) push("summary", "", "lines " + (sm.lines || []).length);
      for (const l of sm.lines || []) {
        if (!isSafe(l.t)) push("summary", "", "unsafe: " + l.t);
        if (reflect && OMEN_CLAIM.test(l.t)) push("omen-vs-reflect", "summary", l.t);
        for (const n of numsIn(l.t)) if (!known.has(n)) push("number-evidence", "summary", n + " in: " + l.t);
      }
    }
    return out;
  }

  return { lint, lintEn, lintZh, lintSemantic };
};
