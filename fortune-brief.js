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
    // nearby areas whose lines may fill a short area, when they do not name another topic
    // round 4: a little wider (overview lines too), now that a short brief is no longer padded with a general step
    const NEAR = { personality: ["overview"], social: ["personality", "overview"], timing: ["overview"], work: ["personality", "overview"], money: ["overview"], love: ["personality"], advice: [] };
    // the longer line reads cleanly: no new grammar or join problem ("…คือพลังหลักของช่วงนี้คือ…")
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
    // a fuller wording of the same line: it contains the line's meaning, so it adds what the finding says (e.g. the slip's image)
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
    // round 4: a short brief is no longer padded with the topic's general step (stepLine): the same step read the same for every
    // user ("ข้อแนะนำทั่วไปคือทักทายเพื่อนเก่า…"); a brief that stays short is left out, in every language
    function briefMore(ctx, briefs, lines) {
      briefs.forEach((b, i) => {
        lines[i] = moreLine(ctx, b, lines[i]) || lines[i];
        if (lines[i].length < 90) lines[i] = fullerLine(ctx, b, lines[i]) || lines[i];
      });
    }
    void stepLine;

    /* ---- round 4 (RECHECK-3 N1 / N3 and the wrong-type frames): polish of a composed reading, TH / EN / ZH ----
       - a group opens with what the finding says, not with its source ("ตามวันเกิดพุธ คุณ…", "วันเกิดพุธสื่อว่าคุณ…", "Looking at X, …",
         "X suggests that …", "从X来看，…", "X显示，…" → the finding's content); the source stays named in the overview and in the
         later lines of the group
       - the same source lead ("ดูที่เส้นหัวใจ", "As for your Sunday birth", "就周日生人而言") at most once per reading
       - Thai frames: a reporting verb never wraps an instruction (→ "ชวนให้…"), never stands with no subject (→ "…ว่าคุณ…");
         "ปีนี้" is a time, not a source ("ปีนี้สะท้อนว่า…" → "ปีนี้ …")
       - the closing line ("ลองเลือกสักหนึ่งข้อ…", "Pick the one suggestion…", "把这次解读当作参考…") is the last line of its group */
    const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const PAREN = /\s*[(（][^)）]*[)）]/g;
    const VERB_TH = "(?:ตามตำรา|ตำรา)?(?:บ่งบอกว่า|สื่อว่า|ชี้ว่า|สะท้อนว่า|หมายความว่า|แสดงว่า|ตีความได้ว่า|แปลได้ว่า|อ่านได้ว่า|บอกว่า|อ่านว่า)";
    const LEAD_TH = "(?:ตาม|ในมุมของ|จาก|ดูที่|สำหรับ|ส่วน|ด้วย|ในส่วนของ|เมื่อดูที่)";
    // a rest that continues the clause it was cut from cannot open a group
    const TH_TAIL = /^(?:และ|หรือ|แต่|ซึ่ง|ที่|ได้\s?\d|ได้ |ของ|กับ|ว่า|ให้|ก็|จึง|[\d(（])/;
    const HEDGE = { th: /^(?:ตามความเชื่อ(?:แล้ว)?|ตามตำรา|ในตำรา|ตามศาสตร์\S+)\s?(?=\S)/, en: /^(?:Traditionally|In traditional readings),\s+/, zh: /^(?:按传统说法|按照传统说法|传统上)，/ };
    function namesOf(items, lang) {
      const out = new Set();
      for (const it of items || []) for (const n of [it.label, it.short]) {
        if (!n) continue;
        const b = String(n).replace(PAREN, "").trim();
        for (const x of [String(n), b, b.replace(/\s*[\d.,]+\s*%?$/, "").trim()]) if (x.length >= 2) out.add(x);
      }
      return [...out].sort((a, b) => b.length - a.length);
    }
    // a line about the person with no subject gets "คุณ" ("บริหารเงินเก่ง…" → "คุณบริหารเงินเก่ง…")
    const PERSON_X = /^(?:ปกป้อง|ทุ่มเท|มีเป้าหมาย|รู้ใจ|รู้ตัว|เดินถูกทาง|บริหาร|โดดเด่น|ฉลาด|เชื่อมโยง|มีปัญญา|รู้จัก|จริงใจ|ช่วยเหลือ|รับฟัง|เปิดเผย|อบอุ่น|มีอารมณ์|มีเครือข่าย|มีรายได้|เก็บเล็กผสมน้อย|ลงมือ|เห็นอกเห็นใจ)/;
    const personTh = t => !/^คุณ/.test(t) && !D.isImperative(t) && (D.roleOf(t) === "vpPerson" || D.TRAIT_TH.test(t) || PERSON_X.test(t));
    const subjTh = t => (personTh(t) ? "คุณ" + t : t);
    function openTh(t, names) {
      for (const n of names) {
        const e = esc(n), m = new RegExp("^(?:คน)?" + LEAD_TH + "\\s?" + e + "(?:\\s?[(（][^)）]*[)）])?(?:\\s?" + VERB_TH + "|\\s+(?:ว่ากันว่า|เชื่อกันว่า|ตามความเชื่อแล้ว|ตามตำรา)?)\\s?").exec(t) ||
          new RegExp("^" + e + "(?:\\s?[(（][^)）]*[)）])?\\s?(?:ตาม(?:ความเชื่อ)?\\s?)?" + VERB_TH + "\\s?").exec(t);
        if (!m) continue;
        const rest = t.slice(m[0].length), out = subjTh(rest);
        ST.name = n;
        // a short "คุณ…" clause alone would be a stock-looking visible start ("คุณเหมาะกับงานที่…" in many readings): keep the source
        // (once per reading; a second such group opens with the content after all)
        if (rest.length < 15 || TH_TAIL.test(rest)) return t;
        if (/^คุณ(?:เหมาะกับ|เป็นคน|มีความ|มักจะ|ชอบ)/.test(out) && out.split(" ")[0].length < 60 && !ST.kept) { ST.kept = 1; return t; }
        // a very short first clause whose predicate goes on after the space ("คุณขยันและมีวิสัยทัศน์ ชอบเรียนรู้…") would be cut alone
        const sp = out.split(" ");
        if (/^คุณ/.test(out) && sp[0].length < 30 && sp.length > 1 && D.roleOf(sp.slice(1).join(" ")) === "vpPerson" && !ST.kept) { ST.kept = 1; return t; }
        return out;
      }
      // a bare "this …" label before a statement ("เซียมซีใบนี้ ความรักเติบโต…")
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
          new RegExp("^(?:(?:traditionally|in traditional readings), )?(?:the |your )?" + e + "(?:\\s?\\([^)]*\\))? " + EN_VERB + ",? ").exec(lo);
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
        return all + (personTh(rest) ? "คุณ" : "");
      }).replace(/(ชวนให้|ชวนคุณ|เตือนว่า)\s?(?:คุณ)?ควร/g, "$1");
      for (const n of names) {
        const e = esc(n);
        q = q.replace(new RegExp("(^|\\s)((?:ตาม|ในมุมของ|ด้วย)" + e + ")\\s(?=\\S)", "g"), (all, sp, lead, at, s) => {
          // the feature itself opens the line ("ตามธาตุไฟ หน้าผากกว้าง…" → "หน้าผากกว้าง…"): evidence is not a point of view
          const rest = s.slice(at + all.length);
          if (/^(?:หน้าผาก|โหนกแก้ม|คาง|ฝ่ามือ|นิ้ว|จมูก|คิ้ว|ริมฝีปาก|ดวงตา|ใบหู)/.test(rest)) return sp;
          return all + (personTh(rest) ? "คุณ" : "");
        });
        let head = false;
        q = q.replace(new RegExp("(^|\\s)(ตาม|ในมุมของ|จาก|ดูที่|สำหรับ)(" + e + ")(?=[\\s(])", "g"), (all, sp, lead, nm, at) => {
          const k = lead + nm; seen[k] = (seen[k] || 0) + 1;
          if (seen[k] === 1) return all;
          if (at === 0) { head = true; return ""; } // a group never opens with a contrastive "ส่วน…": the content opens it
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
      // the same lead twice ("Looking at pair 45, … Looking at pair 56, …"): the second reads "As for …", a third drops the lead
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
    // the topic fallback's "some" line ("เรื่องการงานครั้งนี้ ตำราดูจากทิศเซิงชี่ ขอเล่าว่านำมาใช้กับเรื่องการงานได้อย่างไร") says
    // nothing: the group opens with the finding it names (RECHECK-3, fengshui)
    const SLOT = { TW: "\\S{1,30}?", X: ".{1,90}?", D: ".{0,30}?" };
    const someRe = lang => (((D.FALLBACK_LINE || {})[lang] || {}).some || []).map(f => new RegExp("^" + esc(f).replace(/\\\{(TW|X|D)\\\}/g, (a, k) => SLOT[k]) +
      (lang === "zh" ? "。" : lang === "en" ? "\\.\\s*" : "\\s+")));
    // a brief line that does not name its finding in full says where it comes from, in brackets at its end ("การเงิน: ช่วงนี้การเงิน…
    // (เส้นการเงินช่วงอายุ 60–66)"): the line is this reading's, not a line every user with the same tone gets (round 4, U8)
    function sourced(line, lang, items, done) {
      const lo = lang === "en" ? line.toLowerCase() : line, low = x => (lang === "en" ? String(x).toLowerCase() : String(x));
      for (const it of items || []) for (const k of Object.keys(it.meanings || {})) for (const m of [].concat(it.meanings[k] || [])) {
        const c = String(m).trim(), key = low(c).slice(0, lang === "zh" ? 7 : 18);
        if (!it.label || key.length < (lang === "zh" ? 5 : 12) || lo.indexOf(key) < 0) continue;
        // the bare label (no brackets) and its bracketed detail ("your Yan Nian direction" + "southwest"); Thai shows the bare label only
        const bare = String(it.label).replace(PAREN, "").trim(), det = (String(it.label).match(/[(（]([^)）]*)[)）]/) || [])[1] || "";
        if (done && done.has(it.id)) return line; // one finding's source once per brief (a siam si slip is not repeated per line)
        let tail = "";
        if (lo.indexOf(low(bare)) < 0) tail = lang === "th" || !det ? bare : bare + (lang === "zh" ? "，" : ", ") + det;
        else if (lang !== "th" && det && lo.indexOf(low(det)) < 0) tail = det;
        // never a warning in the brief's source (a flying star stays where the reading shows it in full)
        if (!tail || tail.length < 2 || /五黄|二黑|ห้าเหลือง|สองดำ|ดาว ?[25](?!\d)|\b(?:five yellow|two black|star [25])\b/i.test(tail)) return line;
        if (done) done.add(it.id);
        if (lang === "th") return line + " (" + tail + ")";
        // right after the sentence that carries the finding (not after a gloss that follows it)
        const at = lo.indexOf(key), rel = line.slice(at).search(lang === "zh" ? /[。！？]/ : /[.!?](?:\s|$)/), cut = rel < 0 ? line.length : at + rel;
        return line.slice(0, cut) + (lang === "zh" ? "（" + tail + "）" : " (" + tail + ")") + line.slice(cut);
      }
      return line;
    }
    // one kept source lead per reading (TH: the brief and the groups of the same reading share it): st.kept, st = the reading's state
    let ST = { kept: 0 };
    // the Thai brief lines as they will be shown (lead dropped, source once), so the 90-character rule reads the shown text
    function briefPolish(lines, items, st) {
      ST = st || { kept: 0 }; const names = namesOf(items, "th"); const done = new Set();
      lines.forEach((q, i) => { const m = LABEL.th.exec(q); if (!m) return; const o = openTh(q.slice(m[0].length), names), t = /\)$/.test(o) ? o : sourced(o, "th", items, done); lines[i] = m[0] + t; });
    }
    // the opened first line is (nearly) a line the reading already has: dice over words (EN) or character pairs (TH / ZH) >= 0.6
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
      ST = st || { kept: 0 };
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
            // keep the source where dropping it would leave a Thai group under 90 characters, or make its first line a copy of another line
            let o2 = o;
            const short = () => lang === "th" && s.paragraphs.join(" ").length - (p0.length - o2.length) < 90;
            // short: the source moves to the end of the paragraph in brackets ("… (เจ้าชะตาดิน)") rather than leading it
            if (short() && ST.name && o !== p0) o2 = o + " (" + ST.name.replace(PAREN, "").trim() + ")";
            // a numbered source (a flying star, a line, a pair) is what the line is about: EN / ZH keep it after the first sentence
            if (lang !== "th" && ST.name && o !== p0 && /\d|星|\bstar\b/i.test(ST.name)) { const f1 = firstSen(o, lang), endp = /[.。！？!?]$/.test(f1) ? f1.slice(-1) : ""; o2 = (endp ? f1.slice(0, -1) : f1) + (lang === "zh" ? "（" + ST.name.replace(PAREN, "").trim() + "）" : " (" + ST.name.replace(PAREN, "").trim() + ")") + endp + o.slice(f1.length); }
            if (!short() && !(lang !== "th" && f.length >= 10 && nearCopy(f, rest, lang))) s.paragraphs[0] = o2;
          }
        }
        s.paragraphs = s.paragraphs.map(q => (lang === "th" ? framesTh(q, names, seen) : leadsOther(q, lang, names, seen)));
        closerLast(s, lang);
      }
      // safety net: a group the polish left under 90 Thai characters, or a line it made a near copy of another, goes back as it was
      (secs || []).forEach((s, i) => { if (lang === "th" && s.paragraphs.join(" ").length < 90 && before[i].join(" ").length >= 90) s.paragraphs = before[i]; });
      const fresh = D.nearDupPairs ? D.nearDupPairs(secs, lang).filter(x => !dup0.has(x.a + "|" + x.b)) : [];
      if (fresh.length) {
        const bad = new Set(fresh.flatMap(x => [x.a, x.b]));
        (secs || []).forEach((s, i) => { if (s.paragraphs.some(p => [...bad].some(b => p.indexOf(b) >= 0))) s.paragraphs = before[i]; });
      }
      return secs;
    }
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
  // exports only from its own file: the copy inside fortune-read.js (tools/fortune-read-embed.mjs) leaves that module's exports alone
  if (typeof module !== "undefined" && module.exports && !Object.keys(module.exports).length) module.exports = make;
  root.LQFortuneBrief = make;
})(typeof window !== "undefined" ? window : globalThis);
