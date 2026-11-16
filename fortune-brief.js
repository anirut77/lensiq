/* fortune-brief.js — two composer helpers of fortune-ai.js, split out so fortune-ai.js stays under its size cap (eslint.config.mjs).
   The 15 reading pages get it inside fortune-read.js (tools/fortune-read-embed.mjs; no extra request, speed budget), as
   window.LQFortuneBrief; fortune-ai.js requires it in Node.
   fortune-ai.js passes its own functions and tables in (no copies here), so both files always use the same rules.
   - repeatsUsed: a knowledge-base line that repeats a long phrase already used in the reading (a siam si slip's image in the
     overview and again in a group read as the same sentence twice)
   - briefMore: a short "in brief" group (under 90 characters) gets one more line on the same areas from what was found, a fuller
     wording of the same line, or the practical step the topic groups give; still too short, the composer leaves it out
   - closeAfter: the EN / ZH "pick one of these" closer only after two or more tips in the same group
   Quality round 3 (2026-11-16). Based on traditional beliefs; readers use their own judgement. */
(function (root) {
  "use strict";
  function make(D) {
    const RUN = 12;
    function repeatsUsed(ctx, c) {
      const t = String(c).replace(/\s+/g, "");
      if (t.length < RUN) return false;
      for (const u of ctx.used) {
        const v = String(u).replace(/\s+/g, "");
        if (v === t || v.length < RUN) continue;
        for (let i = 0; i + RUN <= t.length; i += 2) if (v.indexOf(t.slice(i, i + RUN)) >= 0) return true;
      }
      return false;
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B1
    const NEAR = { personality: ["overview"], social: ["personality", "overview"], timing: ["overview"], work: ["personality", "overview"], money: ["overview"], love: ["personality"], advice: [] };
    // notes: docs/FORTUNE-AI-NOTES.md #B2
    const readsOk = t => !D.grammarIssues(t).length && !D.thJoinIssues(t) && !/คือ[^\s]{0,30}คือ/.test(t);
    const say = (ctx, id, it, m) => { ctx.sec = id; ctx.secUnits = 1; ctx.gFirst = false; const u = D.itemSentence(ctx, it, m, "first"); return u && u.text ? D.tidy(u.text) : ""; };
    function moreLine(ctx, b, line) {
      const own = D.SECTION_KEYS[b.id] || [];
      for (const keys of [own, NEAR[b.id] || []]) {
        if (!keys.length) continue;
        for (const it of ctx.F.items.filter(x => D.hasKeys(x, keys))) {
          const m = D.pickMeaning(ctx, it, keys, b.id); if (!m) continue;
          if (keys !== own && (D.topicsIn(m).some(t => t !== b.id) || D.offTopic(m, b.id))) continue;
          const t = say(ctx, b.id, it, m);
          if (t && D.isSafe(t) && readsOk(line + " " + t)) return line + " " + t;
        }
      }
      return null;
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B3
    function fullerLine(ctx, b, line) {
      const own = D.SECTION_KEYS[b.id] || [];
      let best = null;
      for (const it of ctx.F.items.filter(x => D.hasKeys(x, own))) for (const k of own) for (const m0 of it.meanings[k] || []) {
        const c = D.cleanMeaning(m0);
        if (!c || ctx.used.has(c) || !D.isSafe(c) || D.offTopic(c, b.id) || D.loveOnlyIn(c, b.id) || repeatsUsed(ctx, c)) continue;
        if (![...ctx.used].some(u => String(u).length >= 6 && c.indexOf(u) >= 0 && line.indexOf(u) >= 0)) continue;
        if (!best || c.length > best.c.length) best = { it, c };
      }
      const t = best && say(ctx, b.id, best.it, best.c), full = t && D.BRIEF_TH[b.id] + " " + t;
      if (!full || !D.isSafe(full) || !readsOk(full)) return null;
      D.markUsed(ctx, best.c);
      return full;
    }
    // the practical step for this area that the topic groups give after a finding (same remedy table, same labels)
    function stepLine(ctx, b, line) {
      const it = ctx.F.items.find(x => D.hasKeys(x, D.SECTION_KEYS[b.id] || []));
      const rm = it && D.remedyFor(ctx.F, it, b.id);
      if (!rm || ctx.remedyKeys.has(rm.key) || !D.isSafe(rm.th) || D.offTopic(rm.th, b.id)) return null;
      ctx.remedyKeys.add(rm.key);
      return line + " " + D.pick(ctx.r, D.TRAD_REMEDY.has(rm.cat) ? D.REMEDY_FRAMES_TH : D.REMEDY_FRAMES_GENERAL_TH) + rm.th.replace(/^ตามตำรา/, "");
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B4
    function briefMore(ctx, briefs, lines) {
      briefs.forEach((b, i) => {
        lines[i] = moreLine(ctx, b, lines[i]) || lines[i];
        if (lines[i].length < 90) lines[i] = fullerLine(ctx, b, lines[i]) || lines[i];
      });
    }
    void stepLine;

    // notes: docs/FORTUNE-AI-NOTES.md #B5
    const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const PAREN = /\s*[(（][^)）]*[)）]/g;
    const VERB_TH = "(?:ตามตำรา|ตำรา)?(?:บ่งบอกว่า|สื่อว่า|ชี้ว่า|สะท้อนว่า|หมายความว่า|แสดงว่า|ตีความได้ว่า|แปลได้ว่า|อ่านได้ว่า|บอกว่า|อ่านว่า)";
    const LEAD_TH = "(?:ตาม|ในมุมของ|จาก|ดูที่|สำหรับ|ส่วน|ด้วย|ในส่วนของ|เมื่อดูที่)";
    // a rest that continues the clause it was cut from cannot open a group
    const TH_TAIL = /^(?:และ|หรือ|แต่|ซึ่ง|ที่|ได้\s?\d|ได้ |ของ|กับ|ว่า|ให้|ก็|จึง|[\d(（])/;
    // notes: docs/FORTUNE-AI-NOTES.md #B6
    const HEDGE = { th: /^(?:ตามความเชื่อ(?:ไทย|จีน)?(?:แล้ว)?|ตามตำรา(?:ไทย|จีน)?|ในตำรา(?:ไทย|จีน)?|ตามศาสตร์\S+)\s+(?=\S)/, en: /^(?:Traditionally|In traditional readings),\s+/, zh: /^(?:按传统说法|按照传统说法|传统上)，/ };
    function namesOf(items, lang) {
      const out = new Set();
      for (const it of items || []) for (const n of [it.label, it.short]) {
        if (!n) continue;
        const b = String(n).replace(PAREN, "").trim();
        for (const x of [String(n), b, b.replace(/\s*[\d.,]+\s*%?$/, "").trim()]) if (x.length >= 2) out.add(x);
      }
      return [...out].sort((a, b) => b.length - a.length);
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B7
    const PERSON_X = /^(?:ปกป้อง|ทุ่มเท|มีเป้าหมาย|รู้ใจ|รู้ตัว|เดินถูกทาง|บริหาร|โดดเด่น|ฉลาด|เชื่อมโยง|มีปัญญา|รู้จัก|จริงใจ|ช่วยเหลือ|รับฟัง|เปิดเผย|อบอุ่น|มีอารมณ์|มีเครือข่าย|มีรายได้|เก็บเล็กผสมน้อย|ลงมือ|เห็นอกเห็นใจ)/;
    const personTh = t => !/^คุณ/.test(t) && !D.isImperative(t) && (D.roleOf(t) === "vpPerson" || D.TRAIT_TH.test(t) || PERSON_X.test(t));
    // notes: docs/FORTUNE-AI-NOTES.md #B8
    const BARE_TH = new RegExp("^(?:มี(?!ความหมาย|โอกาสที่จะเกิด|ตัวเลือก|ทาง|สิ่ง|เรื่อง|ข่าว|อุปสรรค|ปัญหา|แรง|เป้าหมายร่วม|คนคอย|หลาย)|เป็น(?!ปี|ช่วง|จังหวะ|เวลา|สัญญาณ|ลาง|วัน|เดือน|เรื่อง|ภาพ)|" +
      "โรแมนติก|ประณีต|ประนีประนอม|อารมณ์ดี|มั่นคง|เข้ากับ|เด็ดขาด|ยุติธรรม|ลึกซึ้ง|หนักแน่น|ฉลาด|อ่อนโยน|อ่อนหวาน|ใจ(?:ดี|เย็น|กว้าง|ร้อน|อ่อน|สู้)|ช่าง(?:คิด|สังเกต|พูด|เจรจา)|" +
      "เก่ง|รัก(?!ษา)|ชอบ|มัก|กล้า|ขยัน|ร่าเริง|อบอุ่น|จริงใจ|ซื่อ|ละเอียด|รอบคอบ|อดทน|มุ่งมั่น|สุขุม|ทะเยอทะยาน|ตรงไปตรงมา|เปิดเผย|มั่นใจ|เรียบร้อย|สดใส|" +
      "คล่องแคล่ว|คุยเก่ง|พูดเก่ง|ยืดหยุ่น|ปรับตัว|สร้างสรรค์|มองการณ์|เห็นอกเห็นใจ|เอาใจใส่|ใส่ใจ|ให้ความสำคัญ|ถนัด|เหมาะกับ(?!การ)|ดู(?:อบอุ่น|สดใส|เรียบร้อย|น่า|เป็นคน|ดี)|" +
      "รักสงบ|น่าเชื่อถือ|น่ารัก|ทำงาน(?:เก่ง|ได้ดี|หนัก)|พูดจา|คิดเร็ว|คิดลึก)");
    const HAVE_TH = /^(?:สติปัญญา|ปัญญา|เสน่ห์|รสนิยม|บารมี|วาทศิลป์|ไหวพริบ)/;
    const ADVICE_HAVE = /^มี\S*ไว้(?:\s|$)/;
    const subjOf = t => (/^คุณ/.test(t) || D.isImperative(t) || ADVICE_HAVE.test(t) ? "" : HAVE_TH.test(t) ? "คุณมี" : personTh(t) || BARE_TH.test(t) ? "คุณ" : "");
    // notes: docs/FORTUNE-AI-NOTES.md #B9
    const SUBJ_OK = new RegExp("^(?:คุณ|ช่วง|จังหวะ|ดาว|คน|โซน|ตาม|ใน|ทิศ|ภายใน|ถ้า|หาก|เป็นปี|เป็นช่วง|หน้าผาก|รายได้|รายรับ|ด้าน|โต๊ะ|ธาตุ|ตำรา|สถานการณ์|งาน|การ|เรื่อง|เคล็ด|พลัง|ความ|ปี|ฝัน|ฝ่ามือ|จมูก|ปีกจมูก|มุม|เมื่อ|ราว|บาง|ทรัพย์|ครอบครัว|ไอเดีย|ข้อมูล|คำ|เส้น|บรรยากาศ|รอบตัว|สิ่ง|ฟ้า|น้ำ|ไฟ|ภูเขา|ทะเลสาบ|ลม|ดิน|ไม้|ทอง|แนวโน้ม|ใจ|เพื่อน|ด้วย|อาจ|ทั้ง|ชื่อเสียง|ศิลปะ|ดนตรี|ร่างกาย|สุขภาพ|ผล|โชค|ลาภ|เงิน|ชีวิต|อนาคต|โอกาส|ทุก|ยิ่ง|แม้|นี่|ที่|ผู้|หัวหน้า|ทีม|ลูก|บ้าน|ภาพ|เลข|คู่|ไพ่|ราศี|มือ|ใบหน้า|วัย|ภพ|ภูมิ|กว้า|ตรีแกรม|เซียมซี|นอกจาก|อีก|ส่วน|สำหรับ|จาก|ดูที่|หลัง|ก่อน|ตอน|วัน|เดือน|สัปดาห์|เช้า|ค่ำ|กลางวัน|เวลา|ระยะ|ข่าว|ปัญหา|อุปสรรค|เป้าหมาย|แผน|ลึก ๆ|เจ้าชะตา|ลัคนา|หู|ตา|ปาก|คิ้ว|คาง|แก้ม|โหนกแก้ม|ริมฝีปาก|ดวง|ฐาน|ทักษา|ตำแหน่ง|บทบาท|ลูกค้า|คู่ครอง|คนรัก|ญาติ|พ่อ|แม่|พี่|น้อง|แสง|เมฆ|ฝน|ต้นไม้|ทะเล|แม่น้ำ|ถนน|ประตู|หน้าต่าง|เตียง|ห้อง|พื้นที่|โครงการ|สัญญา|เอกสาร|ภาระ|หนี้|ค่าใช้จ่าย|รายจ่าย|บัญชี|เงินออม|การลงทุน|ใคร|อะไร|เหตุ|ผู้คน|มิตร|บริวาร|ศัตรู|คู่แข่ง|สี|ปลาย|เชื่อกันว่า|เชื่อว่า|เครือข่าย|อารมณ์|ศาสตร์|ไม่ต้อง|พูดกันตรง|คาน|สายลม)");
    const INSTR_OK = /^(?:ลอง|เลือก|จัด|ตั้ง(?!แต่|ใจ)|ใช้|เก็บ|เช็ก|ตรวจ|พัก|ปรึกษา|วางแผน|วาง|ให้|เริ่ม|ฝึก|อย่า|ควร|รักษา|เขียน|จด|แบ่ง|ชวน|ทบทวน|ระวัง|เตรียม|ออม|หมั่น|ทดลอง|ฉลอง|หยุด|ประกาศ|พัฒนา|เปิดใจ|หา(?!ก)|ทำ(?!งาน|ให้)|คุย|ขอ|ฟัง|อ่าน|เดิน|ปล่อย|มอง(?!การณ์)|ดูแล|เติม|หล่อเลี้ยง|ติดตาม|กล้า(?=พูด|เลือก|ลอง|ขอ)|ใจดีกับ|มีเงินสำรอง|มี\S*ไว้(?:\s|$))/;
    const QUALITY_TH = /^(?:สัญชาตญาณ|สติปัญญา|ปัญญา|เสน่ห์|รสนิยม|บารมี|วาทศิลป์|ไหวพริบ)/;
    function startTh(t, names) {
      if (!t || names.some(n => n.length >= 2 && t.startsWith(n)) || SUBJ_OK.test(t) || INSTR_OK.test(t) || D.isImperative(t)) return t;
      if (/^\d/.test(t)) return t; // the lead that carried the number is restored by the caller (framesTh never strips it)
      if (/^เหมาะกับการ/.test(t)) return "ช่วงนี้" + t;
      if (QUALITY_TH.test(t)) return "คุณมี" + t;
      const k = /^(\S{2,12}?)คือ(?=หลัก|สิ่ง|กุญแจ)/.exec(t); // a bare keyword ("รองรับคือหลักที่ช่วย…")
      if (k) return "การ" + t;
      return "คุณ" + t;
    }
    const subjTh = t => subjOf(t) + t;
    function openTh(t, names) {
      for (const n of names) {
        const e = esc(n), m = new RegExp("^(?:คน)?" + LEAD_TH + "\\s?" + e + "(?:\\s?[(（][^)）]*[)）])?(?:\\s?" + VERB_TH + "|\\s+(?:ว่ากันว่า|เชื่อกันว่า|ตามความเชื่อแล้ว|ตามตำรา)?)\\s?").exec(t) ||
          new RegExp("^" + e + "(?:\\s?[(（][^)）]*[)）])?\\s?(?:ตาม(?:ความเชื่อ)?\\s?)?" + VERB_TH + "\\s?").exec(t);
        if (!m) continue;
        const rest = t.slice(m[0].length), out = subjTh(rest);
        ST.name = n;
        // notes: docs/FORTUNE-AI-NOTES.md #B10
        if (rest.length < 15 || TH_TAIL.test(rest) || D.isImperative(rest)) return t;
        if (/^คุณ(?:เหมาะกับ|เป็นคน|มีความ|มักจะ|ชอบ)/.test(out) && out.split(" ")[0].length < 60 && !ST.kept) { ST.kept = 1; return t; }
        // notes: docs/FORTUNE-AI-NOTES.md #B11
        const sp = out.split(" ");
        if (/^คุณ/.test(out) && sp[0].length < 30 && sp.length > 1 && D.roleOf(sp.slice(1).join(" ")) === "vpPerson" && !ST.kept) { ST.kept = 1; return t; }
        return out;
      }
      // notes: docs/FORTUNE-AI-NOTES.md #B12
      const b = /^(\S{2,20}นี้)\s+(?=\S)/.exec(t);
      if (b && names.indexOf(b[1]) >= 0 && t.length - b[0].length >= 15 && !TH_TAIL.test(t.slice(b[0].length))) return subjTh(t.slice(b[0].length));
      const h = HEDGE.th.exec(t);
      return h && t.length - h[0].length >= 15 && !TH_TAIL.test(t.slice(h[0].length)) ? t.slice(h[0].length) : t;
    }
    const EN_VERB = "(?:also )?(?:is traditionally read to mean|is read to mean|are read to mean|suggests?|shows?|means?|indicates?|points to|reflects?|says?|adds?)(?: that)?";
    function openEn(t, names) {
      const lo = t.toLowerCase();
      for (const n of names) {
        const e = esc(n.toLowerCase()), m = new RegExp("^(?:looking at|as for|with|start with|starting with|turning to|when it comes to) (?:the |your )?" + e + "(?:\\s?\\([^)]*\\))?[,:] ").exec(lo) ||
          new RegExp("^(?:(?:traditionally|in traditional readings), )?(?:the |your )?" + e + "(?:\\s?\\([^)]*\\))?,? " + EN_VERB + ",? ").exec(lo);
        if (!m) continue;
        const rest = t.slice(m[0].length);
        if (rest.length < 20 || /^(?:and|or|but|which|that)\b/.test(rest)) return t;
        ST.name = t.slice(m.index, m[0].length).match(new RegExp(e, "i"))[0].replace(/^The /, "the "); return D.cap(rest);
      }
      const h = HEDGE.en.exec(t);
      return h ? D.cap(t.slice(h[0].length)) : t;
    }
    function openZh(t, names) {
      const c = /^([^，。：]{1,32})[，：]/.exec(t);
      if (c && names.some(n => c[1].indexOf(n) >= 0) && (/^(?:从|就|说到|先看|再看|至于|按|根据)/.test(c[1]) || /(?:显示|说明|提示|表示|意味着|意思是|来看|而言|这边)$/.test(c[1])) && t.length - c[0].length >= 6) return (ST.name = names.find(n => c[1].indexOf(n) >= 0)), t.slice(c[0].length);
      const h = HEDGE.zh.exec(t);
      return h && t.length - h[0].length >= 6 ? t.slice(h[0].length) : t;
    }
    const OPEN = { th: openTh, en: openEn, zh: openZh };
    const LABEL = { th: /^\S{2,12}:\s/, en: /^[A-Z][a-z]+:\s/, zh: /^\S{1,4}方面：/ };
    // Thai frames over the wrong kind of line, and the same source lead twice
    function framesTh(q, names, seen) {
      q = q.replace(/ชวนให้ให้/g, "ชวนให้");
      q = q.replace(new RegExp("ปีนี้" + VERB_TH + "(?:คุณ(?=หาก|ถ้า|เมื่อ))?", "g"), "ปีนี้ ").replace(/ปีนี้ (?=คุณ|เป็น)/g, "ปีนี้");
      q = q.replace(new RegExp("(\\S*?)(" + VERB_TH + ")\\s?(?=\\S)", "g"), (all, pre, v, at, s) => {
        const rest = s.slice(at + all.length);
        if (D.isImperative(rest)) return pre + (/^(?:คุณ)?อย่า/.test(rest) ? "เตือนว่า" : /^(?:ให้|พูด|ดู)/.test(rest) ? "ชวนคุณ" : "ชวนให้");
        return all + subjOf(rest);
      }).replace(/(ชวนให้|ชวนคุณ|เตือนว่า)\s?(?:คุณ)?ควร/g, "$1");
      for (const n of names) {
        const e = esc(n);
        q = q.replace(new RegExp("(^|\\s)((?:ตาม|ในมุมของ|ด้วย)" + e + ")\\s(?=\\S)", "g"), (all, sp, lead, at, s) => {
          // notes: docs/FORTUNE-AI-NOTES.md #B13
          const rest = s.slice(at + all.length);
          if (/^(?:หน้าผาก|โหนกแก้ม|คาง|ฝ่ามือ|นิ้ว|จมูก|คิ้ว|ริมฝีปาก|ดวงตา|ใบหู)/.test(rest)) return sp;
          return all + subjOf(rest);
        });
        q = q.replace(new RegExp("(^|\\s)((?:สำหรับ|จาก|ดูที่|ส่วน|ในส่วนของ)" + e + ")\\s(?=\\S)", "g"), (all, sp, lead, at, s) => all + subjOf(s.slice(at + all.length)));
        let head = false;
        q = q.replace(new RegExp("(^|\\s)(ตาม|ในมุมของ|จาก|ดูที่|สำหรับ)(" + e + ")(?=[\\s(])", "g"), (all, sp, lead, nm, at) => {
          const k = lead + nm; seen[k] = (seen[k] || 0) + 1;
          if (seen[k] === 1) return all;
          if (at === 0 && !/^\s*\d/.test(q.slice(all.length))) { head = true; return ""; } // a group never opens with a contrastive "ส่วน…": the content opens it
          const alt = "ส่วน" + nm; seen[alt] = (seen[alt] || 0) + 1;
          return sp + (seen[alt] === 1 ? alt : nm);
        });
        if (head) q = subjTh(q.replace(/^\s*(?:\([^)]*\)\s*)?/, ""));
      }
      return q;
    }
    function leadsOther(q, lang, names, seen) {
      if (!names.length) return q;
      const e = names.map(n => esc(lang === "en" ? n.toLowerCase() : n)).join("|"); // one pass: the longest name wins at each place
      const re = lang === "en" ? new RegExp("(^|\\. )(?:Looking at|As for) (?:the |your )?(?:" + e + ")(?:\\s?\\([^)]*\\))?, ", "gi") : new RegExp("(^|[。！？])(?:从(?:" + e + ")来看|说到(?:" + e + ")|就(?:" + e + ")而言)[，：]", "g");
      // notes: docs/FORTUNE-AI-NOTES.md #B14
      return q.replace(re, (all, sp) => {
        const k = all.replace(/^[.。！？\s]+/, "").toLowerCase().replace(/\s?\d.*$/, ""), n = seen[k] = (seen[k] || 0) + 1;
        const ka = k.replace(/^looking at/, "as for");
        return n === 1 ? all : lang === "en" && ka !== k && !seen[ka] ? (seen[ka] = 1, all.replace(/Looking at /i, "As for ")) : sp;
      })
        .replace(/(^|\. )([a-z])/g, (all, sp, ch) => (lang === "en" ? sp + ch.toUpperCase() : all));
    }
    function closerLast(s, lang) {
      const res = (D.CLOSE[lang] || []).map(c => new RegExp("(?:^|(?<=[\\s。！？]))" + esc(c).replace(/\\\{N\\\}/g, "\\S{1,12}?").replace(/\\\{(?:T|TW)\\\}/g, "\\S{1,24}?") + (lang === "zh" ? "。" : lang === "en" ? "\\." : "(?=\\s|$)")));
      for (let i = 0; i < s.paragraphs.length; i++) for (const re of res) {
        const m = re.exec(s.paragraphs[i]); if (!m) continue;
        const after = s.paragraphs[i].slice(m.index + m[0].length).trim();
        if (!after && i === s.paragraphs.length - 1) return;
        s.paragraphs[i] = (s.paragraphs[i].slice(0, m.index) + (lang === "zh" ? "" : " ") + after).trim();
        if (!s.paragraphs[i]) s.paragraphs.splice(i, 1);
        const last = s.paragraphs.length - 1;
        if (last >= 0) s.paragraphs[last] = s.paragraphs[last] + (lang === "zh" ? "" : " ") + m[0].trim(); else s.paragraphs.push(m[0].trim());
        return;
      }
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B15
    const SLOT = { TW: "\\S{1,30}?", X: ".{1,90}?", D: ".{0,30}?" };
    const someRe = lang => (((D.FALLBACK_LINE || {})[lang] || {}).some || []).map(f => new RegExp("^" + esc(f).replace(/\\\{(TW|X|D)\\\}/g, (a, k) => SLOT[k]) +
      (lang === "zh" ? "。" : lang === "en" ? "\\.\\s*" : "\\s+")));
    // notes: docs/FORTUNE-AI-NOTES.md #B16
    function sourced(line, lang, items, done) {
      const lo = lang === "en" ? line.toLowerCase() : line, low = x => (lang === "en" ? String(x).toLowerCase() : String(x));
      for (const it of items || []) for (const k of Object.keys(it.meanings || {})) for (const m of [].concat(it.meanings[k] || [])) {
        const c = String(m).trim(), key = low(c).slice(0, lang === "zh" ? 7 : 18);
        if (!it.label || key.length < (lang === "zh" ? 5 : 12) || lo.indexOf(key) < 0) continue;
        // notes: docs/FORTUNE-AI-NOTES.md #B17
        const bare = String(it.label).replace(PAREN, "").trim(), det = (String(it.label).match(/[(（]([^)）]*)[)）]/) || [])[1] || "";
        if (done && done.has(it.id)) return line; // one finding's source once per brief (a siam si slip is not repeated per line)
        let tail = "";
        if (lo.indexOf(low(bare)) < 0) tail = lang === "th" || !det ? bare : bare + (lang === "zh" ? "，" : ", ") + det;
        else if (lang !== "th" && det && lo.indexOf(low(det)) < 0) tail = det;
        // notes: docs/FORTUNE-AI-NOTES.md #B18
        if (tail && det && emptyCite(tail, lang) && !emptyCite(det, lang)) tail = bare + (lang === "zh" ? "，" : ", ") + det;
        if (!tail || tail.length < 2 || emptyCite(tail, lang) || /五黄|二黑|ห้าเหลือง|สองดำ|ดาว ?[25](?!\d)|\b(?:five yellow|two black|star [25])\b/i.test(tail)) return line;
        if (done) done.add(it.id);
        if (lang === "th") return line + " (" + tail + ")";
        // right after the sentence that carries the finding (not after a gloss that follows it)
        const at = lo.indexOf(key), rel = line.slice(at).search(lang === "zh" ? /[。！？]/ : /[.!?](?:\s|$)/), cut = rel < 0 ? line.length : at + rel;
        return line.slice(0, cut) + (lang === "zh" ? "（" + tail + "）" : " (" + tail + ")") + line.slice(cut);
      }
      return line;
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B19
    let ST = { kept: 0 };
    // notes: docs/FORTUNE-AI-NOTES.md #B20
    function briefPolish(lines, items, st) {
      ST = st || { kept: 0 }; const names = namesOf(items, "th"); const done = new Set();
      lines.forEach((q, i) => { const m = LABEL.th.exec(q); if (!m) return; const o = openTh(q.slice(m[0].length), names), t = /\)$/.test(o) ? o : sourced(o, "th", items, done); lines[i] = m[0] + t; });
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B21
    const units = (t, lang) => { if (lang === "en") return String(t).toLowerCase().match(/[a-z']+/g) || []; const c = [...String(t).replace(/[\s，。、：；！？,.()（）]/g, "")]; return c.slice(1).map((x, i) => c[i] + x); }; // words, or character pairs
    function nearCopy(f, all, lang) {
      const a = units(f, lang); if (a.length < 4) return false;
      const sens = lang === "zh" ? all.split(/(?<=[。！？])/) : lang === "en" ? all.split(/(?<=[.!?])\s/) : all.split(/\s+/);
      for (const x of sens) {
        const b = units(x, lang); if (b.length < 4) continue;
        const B = new Map(); for (const w of b) B.set(w, (B.get(w) || 0) + 1);
        let n = 0; for (const w of a) if (B.get(w)) { n++; B.set(w, B.get(w) - 1); }
        if (2 * n / (a.length + b.length) >= 0.6) return true;
      }
      return false;
    }
    const firstSen = (t, lang) => (lang === "zh" ? String(t).split(/(?<=[。！？])/)[0] : lang === "en" ? String(t).split(/(?<=[.!?])\s/)[0] : String(t).split(" ")[0]).trim();
    function polish(secs, lang, items, st) {
      ST = st || { kept: 0 }; CITED = {};
      const names = namesOf(items, lang), seen = {}, open = OPEN[lang], some = someRe(lang);
      const before = (secs || []).map(s => s.paragraphs.slice()), dup0 = new Set(D.nearDupPairs ? D.nearDupPairs(secs, lang).map(x => x.a + "|" + x.b) : []);
      for (const s of secs || []) {
        if (s.id !== "overview" && s.paragraphs.length) {
          for (const re of some) { const m = re.exec(s.paragraphs[0]); if (m && s.paragraphs[0].length - m[0].length >= 20 && !(lang === "th" && s.paragraphs.join(" ").length - m[0].length < 90)) s.paragraphs[0] = s.paragraphs[0].slice(m[0].length); }
          // the source in brackets once per brief (a one-finding reading does not repeat its slip on every line)
          const done = new Set();
          if (s.id === "brief" && lang !== "th") s.paragraphs = s.paragraphs.map(q => { const m = LABEL[lang].exec(q); if (!m) return q; const o0 = open(q.slice(m[0].length), names), others = secs.filter(x => x !== s).map(x => x.paragraphs.join(" ")).join(" "), o = nearCopy(firstSen(o0, lang), others, lang) ? q.slice(m[0].length) : o0, t = /[)）][.。]?$/.test(o) ? o : sourced(o, lang, items, done); return m[0] + t; });
          else if (s.id !== "brief") {
            ST.name = "";
            const p0 = s.paragraphs[0], o = open(p0, names), f = firstSen(o, lang), rest = secs.filter(x => x !== s).map(x => x.paragraphs.join(" ")).join(" ") + " " + o.slice(f.length);
            // notes: docs/FORTUNE-AI-NOTES.md #B22
            let o2 = o;
            const short = () => lang === "th" && s.paragraphs.join(" ").length - (p0.length - o2.length) < 90;
            // notes: docs/FORTUNE-AI-NOTES.md #B23
            if (short() && ST.name && o !== p0) o2 = emptyCite(ST.name.replace(PAREN, "").trim(), "th") ? o : placeTh(o.replace(/\s+$/, ""), ST.name, items);
            // notes: docs/FORTUNE-AI-NOTES.md #B24
            if (!short() && !(lang !== "th" && f.length >= 10 && nearCopy(f, rest, lang)) && !(lang !== "th" && GLOSS_LINE[lang].test(f))) { s.paragraphs[0] = o2; if (o2 !== p0 && ST.name) cite(s, lang, ST.name, items); }
          }
        }
        if (s.id === "overview" && lang !== "th") overviewLeads(s, lang, names, items);
        orphans(s, lang, names);
        s.paragraphs = s.paragraphs.map(q => (lang === "th" ? framesTh(q, names, seen) : leadsOther(q, lang, names, seen)));
        // notes: docs/FORTUNE-AI-NOTES.md #B25
        if (lang !== "th" && s.id !== "overview") { alsoPlain(s, lang, names); glossFirst(s, lang); }
        if (lang === "th" && s.id !== "overview") {
          let seenTh = "";
          s.paragraphs = s.paragraphs.map(q => { const out = q.replace(/ตำรายัง(บอก|ชี้|อ่าน|มอง)(?:ด้วย)?(ว่า)?/g, (a, v, w, at) => (names.some(n => n.length >= 3 && (seenTh + q.slice(0, at)).indexOf(n) >= 0) ? a : "ตำรา" + v + (w || ""))); seenTh += " " + out; return out; });
        }
        closerLast(s, lang);
      }
      // notes: docs/FORTUNE-AI-NOTES.md #B26
      if (lang === "th") for (const s of secs || []) if (s.id !== "brief" && s.id !== "advice" && s.paragraphs[0]) s.paragraphs[0] = startTh(subjTh(s.paragraphs[0]), names);
      // notes: docs/FORTUNE-AI-NOTES.md #B27
      (secs || []).forEach((s, i) => { if (lang === "th" && s.paragraphs.join(" ").length < 90 && before[i].join(" ").length >= 90) s.paragraphs = before[i]; });
      const fresh = D.nearDupPairs ? D.nearDupPairs(secs, lang).filter(x => !dup0.has(x.a + "|" + x.b)) : [];
      if (fresh.length) {
        const bad = new Set(fresh.flatMap(x => [x.a, x.b]));
        (secs || []).forEach((s, i) => {
          if (!s.paragraphs.some(p => [...bad].some(b => p.indexOf(b) >= 0))) return;
          s.paragraphs = before[i];
          // notes: docs/FORTUNE-AI-NOTES.md #B28
          if (s.id === "overview" && lang !== "th") overviewLeads(s, lang, names, items, secs.filter(x => x !== s).map(x => x.paragraphs.join(" ")).join(" "));
        });
      }
      return secs;
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B29
    const CONNECT_TH = "ที่สำคัญ|สำคัญคือ|ยิ่งไปกว่านั้น|เพิ่มเติม|ด้านหนึ่ง|นอกเหนือจากนี้|นอกจากนี้|พร้อมกันนั้น|อีกทั้ง|ถัดมา|ในทางกลับกัน|ขณะที่|อีกด้านหนึ่ง|ในอีกมุมหนึ่ง|ในขณะเดียวกัน|เช่นเดียวกัน|ในทำนองเดียวกัน|อีกความหมาย|ตำรายัง|ตำราบางสำนัก|ข้อแนะนำ|สิ่งที่ลงมือ|สิ่งที่ทำได้|ก้าวแรก|ถ้าเลือกทำ|วิธีปรับ|วิธีเสริม|เคล็ด|อีกข้อ|ในส่วนของ|ส่วน|ดูที่|ลอง|ถ้า|หาก|แต่";
    const itemOf = (items, name, lang) => (items || []).find(it => namesOf([it], lang).indexOf(name) >= 0) || null;
    // notes: docs/FORTUNE-AI-NOTES.md #B30
    function endTh(t, it, names) {
      const s = t.replace(/^คุณ(?:มี)?/, "");
      let best = -1;
      for (const k of Object.keys((it && it.meanings) || {})) for (const m0 of [].concat(it.meanings[k] || [])) {
        const m = String(m0).trim().replace(/^คุณ/, "");
        if (m.length < 14 || s.slice(0, 8) !== m.slice(0, 8)) continue;
        const tail = m.slice(-8), at = t.indexOf(tail, 8), e = at + tail.length;
        // the meaning's own end: near its length and at a word break (never inside a later line)
        if (at > 0 && e <= m.length + 24 && (e === t.length || /\s/.test(t[e])) && e > best) best = e;
      }
      if (best > 0) return best;
      const re = new RegExp("\\s(?=" + CONNECT_TH + (names.length ? "|(?:ตาม|ในมุมของ|จาก|สำหรับ|ด้วย)?(?:" + names.map(esc).join("|") + ")" : "") + ")", "g");
      let cut = t.length;
      for (const m of t.matchAll(re)) if (m.index >= 20) { cut = m.index; break; }
      // notes: docs/FORTUNE-AI-NOTES.md #B31
      const st = stemsTh(names);
      for (const m of t.matchAll(/\s(?=\S)/g)) {
        if (m.index < 20 || m.index >= cut) continue;
        const head = t.slice(m.index + 1, m.index + 1 + 24);
        if (st.some(x => head.indexOf(x) >= 0)) { cut = m.index; break; }
      }
      return cut;
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B32
    const KIND_TH = /^(?:ธาตุประจำตัว|ธาตุ|เจ้าชะตา|วันเกิด|เกิดวัน|ลัคนาราศี|ราศี|มือธาตุ|เลขชีวิต)/;
    const stemsTh = names => [...new Set(names.flatMap(n => [n, n.replace(KIND_TH, "").split(/[\s(（]/)[0]]))].filter(x => x.length >= 4);
    // round 6 (RECHECK-5 D4): a citation must name a finding, not a time, a topic or "this slip"
    const EMPTY_CITE = {
      th: /^(?:ปีนี้|เซียมซีใบนี้|\S{1,14}นี้|การงาน|การเงิน|ความรัก|ตัวตน)$/,
      en: /^(?:this |that |these |the (?:older|younger) person$|the success theme$|the winning dream$|(?:work|money|love)$)/i,
      zh: /^(?:今年|这|本|工作$|事业$|财运$|感情$|爱情$)/,
    };
    const emptyCite = (nm, lang) => EMPTY_CITE[lang].test(String(nm).trim());
    // notes: docs/FORTUNE-AI-NOTES.md #B33
    const GENERIC = /^(?:pair|slip|kua|card|line|star|house|area|year|month|element|planet|sign|hand|face|dream|คู่|ไพ่|เส้น|ดาว|ภพ|ภูมิ|数对|签|卦|命卦|星|宫)$/i;
    const BACKREF = { th: /อีกความหมายหนึ่งคือ|ตำรายัง/, en: /\bAnother side of this\b/i, zh: /另一层意思是/ };
    const numbered = n => (/\d/.test(n) && /[(（][^)）]+[)）]\s*$/.test(n) ? n.replace(/\s*[(（]([^)）]+)[)）]\s*$/, (a, x) => (/[\u4e00-\u9fff]/.test(x) ? "，" : ", ") + x).trim() : n.replace(PAREN, "").trim());
    const caseOf = (name, items, lang) => (lang === "en" ? namesOf(items, lang).find(n => n.toLowerCase() === String(name).toLowerCase()) || String(name) : String(name));
    const REPORT_AFTER = /^\s*(?:ตามตำรา|ตามความเชื่อ|ว่ากันว่า|เชื่อกันว่า|หมายความว่า|บ่งบอกว่า|ชี้ว่า|สะท้อนว่า|แสดงว่า|สื่อว่า|ตีความ|อ่านได้ว่า|แปลได้ว่า|บอกว่า|หมายถึง)/;
    function placeTh(t, name, items) {
      const it = itemOf(items, name, "th"), vars = it ? namesOf([it], "th") : [String(name)], nm = String(name).replace(PAREN, "").trim();
      let end = endTh(t, it, namesOf(items, "th").filter(n => vars.indexOf(n) < 0));
      if (REPORT_AFTER.test(t.slice(end))) end = t.length;
      const tail = t.slice(end);
      return t.slice(0, end).replace(/\s+$/, "") + " (" + nm + ")" + (tail && !/^\s/.test(tail) ? " " : "") + tail;
    }
    let CITED = {};
    const names0 = (items, lang) => namesOf(items, lang).filter(n => !GENERIC.test(n));
    function cite(s, lang, name, items) {
      name = caseOf(name, items, lang);
      if (/^(?:this|that|the) (?:year|month|time|period)$/i.test(String(name).trim())) return;
      const nm = numbered(String(name)), it = itemOf(items, name, lang), lo = x => (lang === "en" ? String(x).toLowerCase() : String(x));
      if (nm.length < 2 || emptyCite(nm, lang) || emptyCite(String(name).replace(PAREN, "").trim(), lang)) return;
      const vars0 = (it ? namesOf([it], lang) : [String(name)]).filter(v => v.length >= 2 && !GENERIC.test(v.trim()));
      // "kua number" (the name without its number) would match "your kua number" in a glossary line
      const vars = vars0.filter(v => !vars0.some(w => w !== v && /\d/.test(w) && w.replace(/\s*[\d.,]+\s*%?$/, "").replace(PAREN, "").trim() === v.trim())), alt = vars.map(v => esc(lang === "en" ? v.toLowerCase() : v)).join("|");
      // the back-reference to what is about to be named
      s.paragraphs = s.paragraphs.map(q => (lang === "th" ? q.replace(new RegExp("อีกความหมายของ(?:" + alt + ")(?:\\s?[(（][^)）]*[)）])?คือ", "g"), "อีกความหมายหนึ่งคือ")
        : lang === "en" ? q.replace(new RegExp("\\bAnother side of (?:the |your )?(?:" + alt + ")(?:\\s?\\([^)]*\\))? is\\b", "gi"), "Another side of this is")
          : q.replace(new RegExp("(^|[。！？])(?:" + alt + ")(?:（[^）]*）)?的另一层意思是", "g"), "$1另一层意思是")));
      const p0 = s.paragraphs[0];
      if (lo(p0).indexOf("(" + lo(nm)) >= 0 || p0.indexOf("（" + nm) >= 0) return;
      let end;
      if (lang === "th") end = endTh(p0, it, namesOf(items, "th").filter(n => vars.indexOf(n) < 0));
      else { const m = (lang === "zh" ? /[。！？]/ : /[.!?](?=\s|$)/).exec(p0); end = m ? m.index : p0.length; }
      // notes: docs/FORTUNE-AI-NOTES.md #B34
      const all0 = lo(s.paragraphs.join(" "));
      if ((CITED[nm] || 0) >= 2 && names0(items, lang).some(n => vars.indexOf(n) < 0 && n.length >= 3 && all0.indexOf(lo(n)) >= 0) &&
        !s.paragraphs.some(q => BACKREF[lang].test(q) || (lang !== "th" && (q.split(/(?<=[.!?。！？])\s*/).some(x => ALSO_LINE[lang].test(x) || GLOSS_LINE[lang].test(x)))))) return;
      // named again (anywhere after the opened start) before any back-reference: the reader already sees it
      const after = lo(p0.slice(1) + " " + s.paragraphs.slice(1).join(" ")), br = after.search(BACKREF[lang]);
      const at = Math.min(...vars.map(v => { const i = after.indexOf(lo(v)); return i < 0 ? Infinity : i; }));
      if (at < Infinity && (br < 0 || at < br)) return;
      // notes: docs/FORTUNE-AI-NOTES.md #B35
      if (lang !== "th") {
        const rest = p0.slice(end + 1), pr = lang === "zh" ? /^\s*它/ : /^\s+It (?!would|could|may|might|can|helps?|pays|takes|is (?:time|worth))/;
        if (pr.test(rest)) { const nmx = lang === "en" ? D.cap(String(name).replace(PAREN, "").trim()) : String(name).replace(PAREN, "").trim(); s.paragraphs[0] = p0.slice(0, end + 1) + rest.replace(lang === "zh" ? /^(\s*)它/ : /^(\s+)It /, (a, sp) => sp + nmx + (lang === "zh" ? "" : " ")); return; }
      }
      // notes: docs/FORTUNE-AI-NOTES.md #B36
      if (lang === "th" && /^\s*(?:ตามตำรา|ตามความเชื่อ|ว่ากันว่า|เชื่อกันว่า|หมายความว่า|บ่งบอกว่า|ชี้ว่า|สะท้อนว่า|แสดงว่า|สื่อว่า|ตีความ|อ่านได้ว่า|แปลได้ว่า|บอกว่า|หมายถึง)/.test(p0.slice(end))) end = p0.length;
      const tail = p0.slice(end);
      s.paragraphs[0] = p0.slice(0, end).replace(/\s+$/, "") + (lang === "zh" ? "（" + nm + "）" : " (" + nm + ")") + (lang === "th" && tail && !/^\s/.test(tail) ? " " : "") + tail;
      CITED[nm] = (CITED[nm] || 0) + 1;
    }
    // round 6 (RECHECK-5 D3)
    const GLOSS_LINE = {
      en: /^(?:In (?:Thai number reading|Eight Mansions|Taksa|BaZi|Chinese face reading|palm reading|palmistry|the I Ching|Siam Si|astrology)\b|Siam Si is\b|A hexagram is\b|The five mountains are\b|The twelve palaces are\b|Face reading splits\b|Each Chinese year carries\b)/,
      zh: /^(?:在(?:泰式数字|八宅|塔克萨|八字|面相|手相|易经)[^，。]{0,8}(?:里|中)|求签是|面相把|十二宫是|五岳是|卦是)/,
    };
    const ALSO_LINE = { en: /^((?:The |Your )?[A-Z][^,.]{0,60}?) (?:also (shows?|says?|means?|suggests?|points? to)|(adds?)) that\b/, zh: /^([^，。：；！？]{1,24}?)(?:也提示|还说明|也说明)/ };
    function alsoPlain(s, lang, names) {
      const lo = x => (lang === "en" ? String(x).toLowerCase() : String(x)), nn = names.filter(n => n.length >= 2 && !GENERIC.test(n)).map(lo);
      let seen = "";
      s.paragraphs = s.paragraphs.map(q => (lang === "zh" ? q.split(/(?<=[。！？])/) : q.split(/(?<=[.!?])\s+/)).map(x => {
        let y = x;
        if (!nn.some(n => lo(seen).indexOf(n) >= 0)) {
          // nothing named before: "X also shows that…" → "X shows that…"; "X也提示，…" → "X提示，…"
          if (lang === "en") y = x.replace(ALSO_LINE.en, (a, sub, v, add) => sub + " " + (add ? (/s$/.test(add) ? "shows" : "show") : v) + " that");
          else y = x.replace(/^([^，。：；！？]{1,24}?)(?:也提示|还说明|也说明)/, (a, sub) => sub + (/提示/.test(a) ? "提示" : "说明"));
        }
        seen += " " + y;
        return y;
      }).join(lang === "zh" ? "" : " "));
    }
    function glossFirst(s, lang) {
      const q = s.paragraphs[0] || "", f = (lang === "zh" ? q.split(/(?<=[。！？])/) : q.split(/(?<=[.!?])\s+/))[0] || "";
      if (!GLOSS_LINE[lang].test(f)) return;
      const m = lang === "zh" ? /（([^（）]{1,30})）。$/.exec(f) : /\s\(([^()]{2,80})\)\.$/.exec(f);
      if (!m) return;
      const body = f.slice(0, m.index) + (lang === "zh" ? "。" : ".");
      s.paragraphs[0] = (lang === "zh" ? m[1] + "：" + body : D.cap(m[1]) + ": " + body) + q.slice(f.length);
    }
    function orphans(s, lang, names) {
      const lo = x => (lang === "en" ? String(x).toLowerCase() : String(x)), alt = names.filter(n => n.length >= 2).map(n => esc(lang === "en" ? n.toLowerCase() : n)).join("|");
      if (!alt) return;
      const re = lang === "th" ? new RegExp("อีกความหมายของ(" + alt + ")(?:\\s?[(（][^)）]*[)）])?คือ\\s?", "g")
        : lang === "en" ? new RegExp("\\bAnother side of ((?:the |your )?(?:" + alt + ")(?:\\s?\\([^)]*\\))?) is that ", "gi")
          : new RegExp("(" + alt + ")((?:（[^）]*）)?)\\s?的另一层意思是，?", "g");
      let seen = "";
      s.paragraphs = s.paragraphs.map(q => {
        const out = q.replace(re, (all, x, x2, at) => {
          const nm = lang === "en" ? x.replace(/^(?:the |your )/i, "") : x;
          if (lo(seen + " " + q.slice(0, at)).indexOf(lo(nm)) >= 0) return all; // a second side of what the group already named
          if (lang === "th") return "ความหมายของ" + x + "คือ"; // notes: docs/FORTUNE-AI-NOTES.md #B37
          return "\u0001" + (lang === "zh" ? x + (x2 || "") : x.replace(/^(?:the |your )/i, m => m.toLowerCase())) + "\u0002";
        }).replace(lang === "zh" ? /\u0001([^\u0002]*)\u0002([^。！？]*)([。！？]?)/g : /\u0001([^\u0002]*)\u0002([^.!?]*(?:\([^)]*\)[^.!?]*)*)([.!?]?)/g, (all, x, body, end) => {
          const nm = x.replace(/\s?[(（][^)）]*[)）]$/, "").replace(/^(?:the |your )/i, ""), b = lang === "en" ? D.cap(body.trim()) : body;
          return lo(b).indexOf(lo(nm)) >= 0 || emptyCite(nm, lang) || emptyCite(x, lang) ? b + end : b + (lang === "zh" ? "（" + x + "）" : " (" + x + ")") + end;
        });
        seen += " " + out;
        return out;
      });
    }
    const OV_LEAD = { en: /^(?:Looking at|As for|With|Start with|Starting with|Turning to|Traditionally|In traditional readings)\b/, zh: /^(?:从|就|说到|先看|再看|至于|按|根据)/ };
    let OV_ITEMS = [];
    // notes: docs/FORTUNE-AI-NOTES.md #B38
    const dupOf = (r, safe, acc, lang) => !D.nearDupPairs ? nearCopy(r, safe + " " + acc.join(" "), lang) :
      D.nearDupPairs([{ id: "o", paragraphs: [safe] }, { id: "v", paragraphs: [acc.concat(r).join(lang === "zh" ? "" : " ")] }], lang).some(p => r.indexOf(String(p.a).trim()) >= 0 || r.indexOf(String(p.b).trim()) >= 0);
    function overviewLeads(s, lang, names, items, safe) {
      OV_ITEMS = items || [];
      const split = q => (lang === "zh" ? String(q).split(/(?<=[。！？])/) : String(q).split(/(?<=[.!?])\s+/)), acc = [];
      const pickSafe = x => { for (const c of [false, true]) { const r = conv(x, c); if (r === x) return x; if (!dupOf(r, safe, acc, lang)) { acc.push(r); return r; } } acc.push(x); return x; };
      s.paragraphs = s.paragraphs.map(q => split(q).map(x => (safe != null ? pickSafe(x) : conv(x, false))).join(lang === "zh" ? "" : " ")).map(q => {
        // notes: docs/FORTUNE-AI-NOTES.md #B39
        q = lang === "zh" ? q.replace(/(（[^（）]{2,40}）。)它(?=也|还)/g, "$1这") : q.replace(/(\s\([^()]{2,80}\)\.\s+)It also\b/g, "$1This also");
        const re = lang === "zh" ? /（([^（）]{2,40})）。它/g : /\s\(([^()]{2,80})\)\.\s+It (?!would|could|may|might|can|helps?|pays|takes|is (?:time|worth))/g;
        return q.replace(re, (a, x) => (lang === "zh" ? "。" + x.replace(/，.*$/, "") : ". " + D.cap(x.replace(/, .*$/, "")) + " "));
      });
      function conv(x, colon) {
        ST.name = "";
        // "按命盘，…" / "按泰国占星，…" (a system, not a finding): "命盘上，…"
        if (lang === "zh") { const a = /^按(?:照)?([^，。：]{2,8}?)(?:的看法|的说法)?，(?=\S)/.exec(x); if (a && !/传统/.test(a[1])) return a[1] + "上，" + x.slice(a[0].length); }
        let o = OPEN[lang](x, names);
        if (o === x || !ST.name) return x;
        // "Looking at your Sun in Cancer, with your Cancer Sun, you are…": the inner lead goes too
        if (lang === "en") { const w = /^With (?:your |the |a )?[^,]{3,40}, (?=[a-z])/.exec(o); if (w) o = D.cap(o.slice(w[0].length)); }
        const full = caseOf(String(ST.name).trim(), OV_ITEMS, lang), nm = numbered(full);
        // round 6 (D2): "Looking at the One White star, it stands for…" → "The One White star stands for…"
        if (lang === "en" && /^It /.test(o)) return D.cap(full.replace(PAREN, "").trim()) + " " + o.slice(3).replace(/^is /, "is ");
        if (lang === "zh" && /^它/.test(o)) return full.replace(PAREN, "").trim() + o.slice(1);
        if (emptyCite(nm, lang) || emptyCite(full.replace(PAREN, "").trim(), lang)) return lang === "en" ? hedged(o, x) : o;
        // notes: docs/FORTUNE-AI-NOTES.md #B40
        const other = names.some(n => n.length >= 2 && (lang === "en" ? n.toLowerCase() : n) !== (lang === "en" ? full.toLowerCase() : full) && full.indexOf(n) < 0 && (lang === "en" ? o.toLowerCase() : o).indexOf(lang === "en" ? n.toLowerCase() : n) >= 0);
        if (/^(?:your verse|签诗|签文)/i.test(o) || OV_LEAD[lang].test(o) || other || colon) return lang === "zh" ? full + "：" + o : D.cap(full) + ": " + o.replace(/^(?:Your|Traditionally|In)\b/, w => w.toLowerCase());
        if ((lang === "en" ? o.toLowerCase() : o).indexOf(lang === "en" ? nm.toLowerCase() : nm) >= 0) return o;
        if (lang === "zh" && /^日主./.test(nm) && o.indexOf(nm.slice(2)) >= 0) return o; // "你的日主是庚金" already names 日主庚金
        const m = (lang === "zh" ? /[。！？]$/ : /[.!?]$/).exec(o), body = m ? o.slice(0, -1) : o;
        return (lang === "en" ? hedged(body, x) : body) + (lang === "zh" ? "（" + nm + "）" : " (" + nm + ")") + (m ? m[0] : "");
      }
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B41
    const hedged = (o, x) => (/^(?:Traditionally|In traditional readings)\b/.test(x) && !/\btradition/i.test(o) ? "By tradition, " + o.replace(/^([A-Z])(?=[a-z])/, c => c.toLowerCase()).replace(/^i\b/, "I") : o);
    const PICK_ONE = /挑一条最适合你的|Pick the one suggestion/;
    const TIP_SEN = {
      en: new RegExp("^(?:Try|It would help|A good next step|This is a good time to|A simple adjustment|Set aside|Pick|Keep|Plan|Take|Make|Spend|Give|Write|" +
        "Ask|Talk|Rest|Start|Check|Save|Choose|Wear|Add|Place|Face|Turn|Put|Avoid|Leave|Note|Use)\\b"),
      zh: /建议|不妨|试着|可以先|可以|记得|调整的方法|先把|多留|留意|别急/,
    };
    function closeAfter(draw, s, lang) {
      const parts = s.flatMap(x => (lang === "zh" ? String(x).split(/(?<=[。！？])/) : String(x).split(/(?<=[.!?])\s+/)));
      const tips = parts.filter(x => TIP_SEN[lang].test(x.trim())).length;
      for (let k = 0; k < 6; k++) { const c = draw(); if (!PICK_ONE.test(c) || tips >= 2) return c; }
      return lang === "zh" ? "把这次解读当作参考，最后还是按自己的判断来决定" : "These are tendencies in traditional teachings, and what you actually do matters more";
    }
    return { repeatsUsed, briefMore, closeAfter, polish, briefPolish };
  }
  // notes: docs/FORTUNE-AI-NOTES.md #B42
  if (typeof module !== "undefined" && module.exports && !Object.keys(module.exports).length) module.exports = make;
  root.LQFortuneBrief = make;
})(typeof window !== "undefined" ? window : globalThis);
