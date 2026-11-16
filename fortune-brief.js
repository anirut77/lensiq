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
    const NEAR = { personality: ["overview"], social: ["personality"], timing: ["overview"], work: ["personality"], money: [], love: [], advice: [] };
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
    function briefMore(ctx, briefs, lines) {
      briefs.forEach((b, i) => {
        lines[i] = moreLine(ctx, b, lines[i]) || lines[i];
        if (lines[i].length < 90) lines[i] = fullerLine(ctx, b, lines[i]) || lines[i];
        if (lines.join(" ").length < 90) lines[i] = stepLine(ctx, b, lines[i]) || lines[i];
      });
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
    return { repeatsUsed, briefMore, closeAfter };
  }
  // exports only from its own file: the copy inside fortune-read.js (tools/fortune-read-embed.mjs) leaves that module's exports alone
  if (typeof module !== "undefined" && module.exports && !Object.keys(module.exports).length) module.exports = make;
  root.LQFortuneBrief = make;
})(typeof window !== "undefined" ? window : globalThis);
