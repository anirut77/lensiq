/* fortune-caution-core.js — the "สิ่งที่ควรระวัง" section (owner item 177): rule matcher, three-part model (be mindful of ->
 * encouragement -> guidance) and its HTML. The shell fortune-caution.js loads it only after the disclaimer is accepted, with one
 * rule pack of the page (tools/fortune-caution-pack.mjs). Node: full registry + fortune-caution-filter.js. Behind
 * LENSIQ_FORTUNE_CAUTIONS (off). Locked tests: tests/unit/fortune-caution-*.test.js, tests/e2e/fortune-caution*.e2e.mjs. */
(function (root) {
  "use strict";
  var NODE = typeof module !== "undefined" && module.exports && typeof require === "function";
  /** @param {string} th @param {string} en @param {string} zh */
  var T = function (th, en, zh) { return { th: th, en: en, zh: zh }; };
  var LANGS = ["th", "en", "zh"];
  var LABELS = {
    title: T("สิ่งที่ควรระวัง", "Things to be mindful of", "需要留意的事项"),
    top: T("ตามความเชื่อ โปรดใช้วิจารณญาณ", "According to belief; please use your own judgement.", "依据传统信仰，请自行判断。"),
    overall: T("ภาพรวม", "Overall", "整体"),
    period: T("ช่วงเวลานี้", "This period", "这段时间"),
    mind: T("ระวัง", "Be mindful of", "留意"),
    cheer: T("กำลังใจ", "Encouragement", "鼓励"),
    guide: T("แนวทาง", "Guidance", "建议方向"),
    none: T("ตามหลักของศาสตร์นี้ ไม่พบเรื่องที่ต้องระวังเป็นพิเศษในส่วนนี้", "By this discipline's rules there is nothing in particular to watch for here.", "按该术数的规则，这部分没有特别需要留意的事项。"),
    noPeriod: T("ศาสตร์นี้ไม่ได้อ่านตามช่วงเวลา", "This discipline does not read by time period.", "该术数不按时间段解读。"),
    close: T("ปิดส่วนนี้", "Close", "收起"),
    modern: T("ตามความนิยมสมัยใหม่", "Modern practice", "现代流行做法"),
    "school.th": T("ตำราไทย", "Thai tradition", "泰式传统"),
    "school.cn": T("ตำราจีน", "Chinese tradition", "中式传统"),
    "school.w": T("ตำราตะวันตก", "Western tradition", "西方传统"),
  };
  /** page domain -> rule schools and whether the discipline reads by time period (wave 0: the pages whose rules exist) */
  var DOMAINS = {
    horoscope: { schools: ["th", "cn"], periodic: true }, bazi: { schools: ["cn"], periodic: true }, taksa: { schools: ["th"], periodic: true },
    zodiac: { schools: ["cn"], periodic: true }, astro: { schools: ["w"], periodic: true },
  };
  // D-4, D-5, the hub (a menu, not a reading); lek7 (its rule has one source, T5) and lifegraph (team weights, no source): review 2026-11-20
  var EXCLUDED = ["planner", "petread", "fortune", "lek7", "lifegraph"];

  /* the section's filter (fortune-caution-filter.js): Node only; the browser packs hold only texts it allowed */
  var FILTER = NODE ? require("./fortune-caution-filter.js") : root.LQFortuneCautionFilter || null;
  /** "" = allowed, else the reason (see fortune-caution-filter.js) @param {string} text @param {string} kind @param {any} [ctx] */
  var check = function (text, kind, ctx) { return FILTER ? FILTER.check(text, kind, ctx) : "no-filter"; };

  /* ---------------- rules ---------------- */
  var nodeRules = null;
  /** every rule loaded (Node: the full registry; browser: the page's pack) */
  function rules() {
    if (NODE) {
      if (!nodeRules) nodeRules = require("./fortune-caution-rules-th.js").concat(require("./fortune-caution-rules-cn.js"), require("./fortune-caution-rules-w.js"));
      return nodeRules.slice();
    }
    return (root.LQCautionRules || []).slice();
  }
  /** @param {any} r @param {any} it */
  function fires(r, it) {
    return !!it && typeof it.id === "string" && r.trigger.some(function (t) {
      return new RegExp(t.id).test(it.id) && (!t.tone || it.tone === t.tone) && (!t.polarity || it.polarity === t.polarity);
    });
  }
  /** ids of the rules one engine item fires on this page domain (no school / status filter) @param {string} domain @param {any} item */
  function match(domain, item) {
    return rules().filter(function (r) { return r.domains.indexOf(domain) >= 0 && fires(r, item); }).map(function (r) { return r.id; });
  }
  /** the pack file of a page domain in one language (browser) @param {string} domain @param {string} lang */
  function files(domain, lang) { return DOMAINS[domain] ? ["fortune-caution-pack-" + domain + "-" + (LANGS.indexOf(lang) >= 0 ? lang : "th") + ".js"] : []; }

  /**
   * The section model of one reading, or null (no section).
   * @param {{domain: string, facts?: {items?: any[]}, period?: any, lang?: string}} input
   * @param {{drafts?: boolean, cnWest?: boolean}} [opts]
   */
  function build(input, opts) {
    var o = opts || {}, domain = input && input.domain, D = DOMAINS[domain];
    if (!D || EXCLUDED.indexOf(domain) >= 0) return null;
    var lang = LANGS.indexOf(input.lang) >= 0 ? input.lang : "th";
    var avail = rules().filter(function (r) {
      return r.domains.indexOf(domain) >= 0 && D.schools.indexOf(r.school) >= 0 && (o.cnWest === true || r.school === "th") && (o.drafts === true || r.status === "expert-ok");
    });
    if (!avail.length) return null;
    var items = (input.facts && Array.isArray(input.facts.items)) ? input.facts.items : [];
    /** @type {Map<any, number>} */
    var fired = new Map();
    items.forEach(function (it) {
      avail.forEach(function (r) { if (fires(r, it)) { var s = Number(it.strength) || 0; fired.set(r, Math.max(fired.has(r) ? /** @type {number} */ (fired.get(r)) : -1, s)); } });
    });
    // owner rule 2026-11-20: month ranges, never a single day — a one-day period gets no "this period" part
    var per = input.period && typeof input.period === "object" && input.period.span !== "day" ? input.period : null;
    var perRules = per && avail.some(function (r) { return r.kind === "period" && (r.spans || []).indexOf(per.span) >= 0; });
    /** @param {any} r @param {string} f */
    var tx = function (r, f) { return r[f] && typeof r[f][lang] === "string" ? r[f][lang] : ""; };
    /** @param {string} part */
    function mk(part) {
      var ctx = { part: part, span: per ? per.span : undefined };
      /** @param {any} r @param {string} f @param {string} kind */
      var ok = function (r, f, kind) { return !!tx(r, f) && (!FILTER || check(tx(r, f), kind, ctx) === ""); };
      var list = [];
      fired.forEach(function (s, r) { if (r.kind === part && (part === "overall" || (r.spans || []).indexOf(ctx.span) >= 0)) list.push([r, s]); });
      list.sort(function (a, b) { return b[1] - a[1] || avail.indexOf(a[0]) - avail.indexOf(b[0]); });
      var cautions = list.filter(function (x) { return x[0].polarity === "caution" && ok(x[0], "mind", "mind") && ok(x[0], "do", "do"); }).slice(0, 3);
      var goods = list.filter(function (x) { return x[0].polarity === "good" && ok(x[0], "luck", "luck"); });
      var p = { part: part, period: part === "period" && per ? String(per[lang] || "") : null, none: !cautions.length, noPeriod: false,
        mind: cautions.map(function (x, i) { return { n: i + 1, rule: x[0].id, text: tx(x[0], "mind"), school: x[0].school, modern: !!x[0].modern }; }),
        cheer: /** @type {any[]} */ ([]),
        guide: cautions.map(function (x, i) { return { n: /** @type {number|null} */ (i + 1), rule: x[0].id, text: tx(x[0], "do") }; }) };
      if (goods.length) p.cheer = goods.slice(0, 2).map(function (x) { return { rule: x[0].id, text: tx(x[0], "luck"), luck: true }; });
      else {
        var own = cautions.filter(function (x) { return ok(x[0], "cheer", "cheer"); })[0];
        if (own) p.cheer = [{ rule: own[0].id, text: tx(own[0], "cheer"), luck: false }];
      }
      var extra = goods.slice(0, 2).filter(function (x) { return ok(x[0], "do", "do"); })[0];
      if (extra) p.guide.push({ n: null, rule: extra[0].id, text: tx(extra[0], "do") });
      return p;
    }
    // a part shows only when the page has an available rule of that kind (never an empty "nothing to watch" for rules not built)
    var parts = avail.some(function (r) { return r.kind === "overall"; }) ? [mk("overall")] : [];
    if (!D.periodic) parts.push({ part: "period", period: null, none: false, noPeriod: true, mind: [], cheer: [], guide: [] });
    else if (perRules) parts.push(mk("period"));
    return parts.length ? { domain: domain, lang: lang, parts: parts } : null;
  }

  /** @param {any} s */
  var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
  var attr = function (/** @type {any} */ s) { return esc(s).replace(/"/g, "&quot;"); };
  /** the section body (parts in order; each part: be mindful of, encouragement, guidance) @param {any} m */
  function html(m) {
    if (!m) return "";
    var l = m.lang, L = function (/** @type {string} */ k) { return esc(LABELS[k][l]); };
    var out = ['<p class="lq-caution-top">' + L("top") + "</p>"];
    m.parts.forEach(function (/** @type {any} */ p) {
      out.push('<div class="lq-caution-part" data-part="' + p.part + '"><h4 class="lq-caution-h">' + L(p.part) +
        (p.period ? '<span class="lq-caution-period"> — ' + esc(p.period) + "</span>" : "") + "</h4>");
      if (p.noPeriod) { out.push('<p class="lq-caution-none">' + L("noPeriod") + "</p></div>"); return; }
      out.push('<h5 class="lq-caution-sub">' + L("mind") + "</h5>");
      if (p.none) out.push('<p class="lq-caution-none">' + L("none") + "</p>");
      else {
        out.push('<ol class="lq-caution-mind">' + p.mind.map(function (/** @type {any} */ x) {
          return '<li data-rule="' + attr(x.rule) + '" data-n="' + x.n + '">' + esc(x.text) + ' <span class="lq-caution-tag">' + L("school." + x.school) +
            (x.modern ? " · " + L("modern") : "") + "</span></li>";
        }).join("") + "</ol>");
      }
      if (p.cheer.length) {
        out.push('<h5 class="lq-caution-sub">' + L("cheer") + '</h5><div class="lq-caution-cheer">' + p.cheer.map(function (/** @type {any} */ x) {
          return '<p data-rule="' + attr(x.rule) + '"' + (x.luck ? ' data-luck="1"' : "") + ">" + esc(x.text) + "</p>";
        }).join("") + "</div>");
      }
      if (p.guide.length) {
        out.push('<h5 class="lq-caution-sub">' + L("guide") + '</h5><ol class="lq-caution-guide">' + p.guide.map(function (/** @type {any} */ x) {
          return x.n == null ? '<li class="lq-caution-extra" data-rule="' + attr(x.rule) + '">' + esc(x.text) + "</li>"
            : '<li data-rule="' + attr(x.rule) + '" data-n="' + x.n + '">' + esc(x.text) + "</li>";
        }).join("") + "</ol>");
      }
      out.push("</div>");
    });
    return out.join("");
  }

  var api = { LABELS: LABELS, DOMAINS: DOMAINS, EXCLUDED: EXCLUDED, check: check, rules: rules, match: match, files: files, build: build, html: html };
  if (NODE) module.exports = api; else root.LQFortuneCautionCore = api;
})(typeof window !== "undefined" ? window : globalThis);
