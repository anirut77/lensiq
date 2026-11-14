"use strict";
// tests/unit/helpline-call.test.js — FIXED TEST SET, "tap-to-call help lines" (owner order 2026-11-14, Part B), locked BEFORE
// the build on branch helpline-b (base ea509e0). One shared component (lensiq-helpline.js, global LQHelpline) draws every
// help line as a tap-to-call button with a phone icon (tel: link); on a computer the number is also shown as large text.
//  B1  every help number (1323, 1669, 191, 1300, Samaritans 02 113 6789) shown in a page is inside the component, and every
//      tel: link anywhere carries the number its text shows.
//  B2  1323 wording exactly as the owner wrote it (button, second line, small print); forbidden words are absent from the
//      button and the second line of every line in TH / EN / ZH.
//  B3  each number has a row in docs/CRISIS-RESOURCES.md checked 2026-11-14 against the agency's own page; "24 hours" and
//      "free" are claimed only where that row says so; a scheduled workflow re-checks the official pages (no secrets, not
//      part of the CI gate).
//  B4  the new wording is on the professional-review list (docs/LEGAL-PACKET.md L63, docs/CRISIS-RESOURCES.md).
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const THAI = /[\u0E00-\u0E7F]/;
const IDS = ["1323", "1669", "191", "1300", "samaritans"];
const TELS = { 1323: "1323", 1669: "1669", 191: "191", 1300: "1300", samaritans: "021136789" };
const LANGS = ["th", "en", "zh"];
const OWNER_1323 = { btn: "อยากมีคนรับฟัง โทร 1323", sub: "พูดคุยได้ตลอด 24 ชั่วโมง กับผู้ที่พร้อมรับฟัง", org: "บริการของกรมสุขภาพจิต" };
// the owner's lists (2026-11-14); the component may forbid more, never less
const OWNER_FORBIDDEN = {
  th: ["ผู้ป่วย", "โรค", "จิตเวช", "อาการ", "ภาวะ", "ปัญหาสุขภาพจิต"],
  en: ["patient", "disease", "illness", "psychiatric", "symptom", "disorder", "mental health problem"],
  zh: ["患者", "病", "精神科", "症状", "障碍", "心理疾病"],
};
/** pages that show help numbers (fortune pages, the fortune category page, medicine, nutrition, terms) */
const PAGES = ["fortune", "cat-fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui",
  "dream", "zodiac", "astro", "lifegraph", "planner", "luckycolor", "report", "medicine", "nutrition", "terms"];

const H = () => { const p = join(ROOT, "lensiq-helpline.js"); delete require.cache[require.resolve(p)]; return require(p); };
const digits = s => String(s).replace(/\D/g, "");
const stripTags = h => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
/** does `text` contain the forbidden word `w` (English: from a word start, so plurals count; case-insensitive) */
const hasWord = (text, w, lang) => lang === "en" ? new RegExp("\\b" + w.replace(/\s+/g, "\\s+"), "i").test(text) : text.includes(w);

/** every <tag ... data-lq-call="id"> element (balanced on its tag), as {id, html, start, end} */
function components(html) {
  const out = [];
  const re = /<(\w+)\b[^>]*\bdata-lq-call="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1], t = new RegExp("<" + tag + "\\b|</" + tag + ">", "g");
    t.lastIndex = m.index;
    let depth = 0, x;
    while ((x = t.exec(html))) { depth += x[0][1] === "/" ? -1 : 1; if (depth === 0) break; }
    assert.ok(x, "unbalanced component at " + m.index);
    out.push({ id: m[2], html: html.slice(m.index, t.lastIndex), start: m.index, end: t.lastIndex });
    re.lastIndex = t.lastIndex;
  }
  return out;
}
/** page HTML without scripts, styles, comments and the components themselves (what is left must not show a help number) */
function outside(html) {
  let h = html.replace(/<script\b[\s\S]*?<\/script>/g, " ").replace(/<style\b[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const cs = components(h);
  for (let i = cs.length - 1; i >= 0; i--) h = h.slice(0, cs[i].start) + " " + h.slice(cs[i].end);
  return stripTags(h);
}

/** docs/CRISIS-RESOURCES.md "## Verified" table -> {number: {hours, cost, source, date, quote}} */
function verified() {
  const md = read("docs/CRISIS-RESOURCES.md");
  const sec = md.split(/^## Verified\s*$/m)[1].split(/^## /m)[0];
  const out = {};
  for (const line of sec.split("\n")) {
    const c = line.split("|").map(s => s.trim());
    if (c.length < 8 || !/^\d[\d ]+$/.test(c[1])) continue;
    out[c[1].replace(/\s+/g, "")] = { hours: c[3], cost: c[4], source: c[5], date: c[6], quote: c[7] };
  }
  return out;
}

test("component table: five lines in order, digits-only tel, the number in every button, TH / EN / ZH complete, no Thai in EN / ZH", () => {
  const L = H();
  assert.deepEqual(L.ORDER, IDS);
  for (const id of IDS) {
    const x = L.LINES[id];
    assert.ok(x, id);
    assert.equal(x.tel, TELS[id], id + " tel");
    assert.equal(digits(x.n), x.tel, id + ": shown number = tel digits");
    for (const lang of LANGS) {
      for (const f of ["btn", "sub", "org"]) assert.ok(x[lang] && typeof x[lang][f] === "string" && x[lang][f].trim(), id + " " + lang + "." + f);
      assert.ok(x[lang].btn.includes(x.n), id + " " + lang + ": the button shows " + x.n + ": " + x[lang].btn);
      if (lang !== "th") for (const f of ["btn", "sub", "org"]) assert.doesNotMatch(x[lang][f], THAI, id + " " + lang + "." + f + " has Thai");
    }
  }
});

test("B2: 1323 Thai wording is exactly the owner's", () => {
  const x = H().LINES["1323"].th;
  assert.equal(x.btn, OWNER_1323.btn); assert.equal(x.sub, OWNER_1323.sub); assert.equal(x.org, OWNER_1323.org);
});

test("B2: forbidden words (owner lists, TH / EN / ZH) are absent from every button and second line", () => {
  const L = H();
  for (const lang of LANGS) for (const w of OWNER_FORBIDDEN[lang]) assert.ok(L.FORBIDDEN[lang].includes(w), "component forbids " + lang + " '" + w + "'");
  const bad = [];
  for (const id of IDS) for (const lang of LANGS) for (const f of ["btn", "sub"]) {
    const t = L.LINES[id][lang][f];
    for (const l2 of LANGS) for (const w of L.FORBIDDEN[l2]) if (hasWord(t, w, l2)) bad.push(id + " " + lang + "." + f + " has '" + w + "': " + t);
  }
  assert.deepEqual(bad, []);
  // the checker the component exports finds them
  assert.ok(L.forbiddenIn("โทรหาเราเมื่อมีอาการ", "th").length > 0); assert.ok(L.forbiddenIn("call our patients line", "en").length > 0);
  assert.equal(L.forbiddenIn(OWNER_1323.btn + " " + OWNER_1323.sub, "th").length, 0);
  assert.ok(L.forbiddenIn("call if you have a mental health problem", "en").length > 0); assert.ok(L.forbiddenIn("心理疾病热线", "zh").length > 0);
});

test("B1: the component's HTML: tel link = the line's number, phone icon, text shows the number; Thai carries data-i18n keys; >= 1 class hook", () => {
  const L = H();
  for (const id of IDS) for (const lang of LANGS) {
    const h = L.html(id, { lang });
    const cs = components(h);
    assert.equal(cs.length, 1, id + " " + lang + ": one component");
    assert.equal(cs[0].id, id);
    const tels = [...h.matchAll(/href="tel:([^"]*)"/g)].map(m => m[1]);
    assert.deepEqual(tels, [TELS[id]], id + " " + lang + " tel");
    assert.match(h, /<a\b[^>]*class="[^"]*\blq-call-btn\b/, id + " " + lang + ": button class");
    assert.match(h, /<svg\b[^>]*class="[^"]*\blq-call-ico\b[^"]*"[^>]*aria-hidden="true"/, id + " " + lang + ": phone icon");
    const a = /<a\b[\s\S]*?<\/a>/.exec(h)[0];
    assert.ok(stripTags(a).includes(L.LINES[id].n), id + " " + lang + ": the link text shows the number");
    assert.ok(stripTags(a).includes(L.LINES[id][lang].btn), id + " " + lang + ": the link text is the button wording");
    assert.match(h, /class="[^"]*\blq-call-num\b[^"]*"[^>]*>[^<]*<\/span>/, id + " " + lang + ": large number for computers");
    assert.ok(stripTags(h).includes(L.LINES[id][lang].sub), id + " " + lang + ": second line");
    assert.ok(stripTags(h).includes(L.LINES[id][lang].org), id + " " + lang + ": small print");
    if (lang === "th") for (const f of ["btn", "sub", "org"]) assert.ok(h.includes('data-i18n="call.' + id + "." + f + '"'), id + ": key call." + id + "." + f);
    else assert.doesNotMatch(h, /data-i18n=/, id + " " + lang + ": fixed language, no keys");
  }
  // an extra class goes on the link (old hooks: lq-helpline-tel, fa-tel); compact drops the second line except for 1323
  assert.match(L.html("1669", { cls: "lq-helpline-tel", compact: true }), /<a\b[^>]*class="lq-call-btn lq-helpline-tel"/);
  assert.ok(!stripTags(L.html("1669", { compact: true })).includes(L.LINES["1669"].th.sub), "compact 1669 has no second line");
  assert.ok(stripTags(L.html("1323", { compact: true })).includes(OWNER_1323.sub), "1323 always keeps its second line");
  assert.ok(stripTags(L.html("1323", { compact: true })).includes(OWNER_1323.org), "1323 always keeps its small print");
});

test("i18n: en-common / zh-common carry every call.* key and equal the component's EN / ZH text", () => {
  const L = H();
  for (const lang of ["en", "zh"]) {
    const src = read("i18n/" + lang + "-common.js");
    for (const id of IDS) for (const f of ["btn", "sub", "org"]) {
      const m = new RegExp('"call\\.' + id + "\\." + f + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"').exec(src);
      assert.ok(m, lang + "-common call." + id + "." + f);
      assert.equal(JSON.parse('"' + m[1] + '"'), L.LINES[id][lang][f], lang + " call." + id + "." + f);
    }
  }
});

test("B1: every page that shows a help number shows it only inside the component (TH / EN / ZH static text included)", () => {
  const bad = [];
  for (const p of PAGES) {
    const html = read(p + ".html");
    const cs = components(html);
    if (!cs.length) bad.push(p + ": no component");
    const rest = outside(html);
    const m = rest.match(/\b(?:1323|1669|1300|191)\b|02[\s-]?113[\s-]?6789/g);
    if (m) bad.push(p + ": help number outside the component: " + [...new Set(m)].join(", "));
  }
  assert.deepEqual(bad, []);
});

test("B1: every tel: link in every page carries the number its text shows; help numbers only through the component", () => {
  const files = readdirSync(ROOT).filter(f => f.endsWith(".html"));
  const L = H(), bad = [];
  for (const f of files) {
    const html = read(f);
    for (const m of html.matchAll(/<a\b([^>]*)\bhref="tel:([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g)) {
      const tel = m[2], attrs = m[1] + m[3], txt = stripTags(m[4]);
      if (!/^\d{3,10}$/.test(tel)) { bad.push(f + ": tel:" + tel + " is not digits only"); continue; }
      if (!digits(txt).includes(tel)) bad.push(f + ": tel:" + tel + " but the text says '" + txt + "'");
      const id = IDS.find(i => TELS[i] === tel);
      if (id && !/\blq-call-btn\b/.test(attrs)) bad.push(f + ": tel:" + tel + " is not the shared component");
    }
    for (const c of components(html)) {
      const tels = [...c.html.matchAll(/href="tel:([^"]*)"/g)].map(x => x[1]);
      if (!L.LINES[c.id] || JSON.stringify(tels) !== JSON.stringify([L.LINES[c.id].tel])) bad.push(f + ": component " + c.id + " links " + tels.join(","));
    }
  }
  assert.deepEqual(bad, []);
});

test("B1: fortune-ai's support card lines come from the component (same numbers, same wording)", () => {
  const p = join(ROOT, "fortune-ai.js"); delete require.cache[require.resolve(p)];
  const FA = require(p), L = H();
  for (const lang of LANGS) {
    const s = FA.crisis.result({ lang }).support;
    const ids = s.lines.map(l => l.id);
    assert.deepEqual(ids, IDS, lang + ": card lines are the component's, in order");
    for (const l of s.lines) {
      assert.equal(String(l.tel), L.LINES[l.id].tel, lang + " " + l.id + " tel");
      assert.equal(l.t, L.LINES[l.id][lang].sub, lang + " " + l.id + " second line from the component");
      assert.equal(l.btn, L.LINES[l.id][lang].btn, lang + " " + l.id + " button from the component");
    }
  }
});

test("B3: CRISIS-RESOURCES.md rows checked 2026-11-14 on the agency's own page; '24' and 'free' claimed only where the row says so", () => {
  const V = verified(), L = H();
  const OFFICIAL = { 1323: /https:\/\/(?:www\.)?dmh\.go\.th\//, 1669: /https:\/\/(?:www\.)?niems\.go\.th\//, 191: /https:\/\/(?:www\.)?191\.go\.th\//,
    1300: /https:\/\/1300thailand\.m-society\.go\.th\//, samaritans: /https:\/\/(?:www\.)?samaritansthai\.com\// };
  for (const id of IDS) {
    const r = V[L.LINES[id].tel];
    assert.ok(r, id + ": verified row");
    assert.match(r.source, OFFICIAL[id], id + ": official source " + r.source);
    assert.match(r.date, /2026-11-14/, id + ": checked 2026-11-14 (" + r.date + ")");
    assert.ok(r.quote && r.quote.length > 10, id + ": quote from the page");
    for (const lang of LANGS) {
      const t = L.LINES[id][lang].btn + " " + L.LINES[id][lang].sub;
      if (/24\s*(?:ชั่วโมง|ชม|hours?|小时)/i.test(t)) assert.match(r.hours, /24 hours/, id + " " + lang + " claims 24 h: " + t);
      if (/ฟรี|\bfree\b|免费/i.test(t)) assert.match(r.cost, /^Free/, id + " " + lang + " claims free: " + t);
      if (/12:00/.test(r.hours)) assert.match(t, /12:00\s*[–-]\s*22:00/, id + " " + lang + ": hours as the page says");
    }
  }
  // 1323: the owner's second line says 24 hours, so the official page must say 24 hours
  assert.match(V["1323"].hours, /24 hours/); assert.match(V["1323"].quote, /24 ชั่วโมง/);
  // 1669: the official page shows no hours, so no line claims them
  if (!/24 hours/.test(V["1669"].hours)) for (const lang of LANGS) assert.doesNotMatch(L.LINES["1669"][lang].sub + L.LINES["1669"][lang].btn, /24|ฟรี|free|免费/i);
});

test("B3: scheduled re-check workflow: cron, no secrets, read-only, not part of the CI gate; checks every verified number's official page", () => {
  const wf = ".github/workflows/helpline-recheck.yml";
  assert.ok(existsSync(join(ROOT, wf)), wf);
  const y = read(wf);
  assert.match(y, /^on:\s*$[\s\S]*^\s+schedule:\s*$[\s\S]*cron:\s*["'][^"']+["']/m, "runs on a schedule");
  assert.doesNotMatch(y, /^\s+(?:push|pull_request|pull_request_target|workflow_run):/m, "not triggered by pushes or PRs");
  assert.doesNotMatch(y, /secrets\./, "uses no secrets");
  assert.match(y, /permissions:\s*\n\s+contents:\s*read/, "read-only token");
  assert.doesNotMatch(y, /\bwrite\b/, "no write permission");
  assert.match(y, /node tools\/helpline-recheck\.mjs/, "runs the checker");
  assert.doesNotMatch(read(".github/workflows/ci.yml"), /helpline-recheck/, "not in the CI gate");
  const { SOURCES } = JSON.parse(read("tools/helpline-sources.json"));
  const V = verified(), L = H();
  for (const id of IDS) {
    const tel = L.LINES[id].tel, src = SOURCES.filter(s => s.tel === tel);
    assert.ok(src.length >= 1, id + ": re-checked");
    for (const s of src) {
      assert.ok(V[tel].source.includes(s.url), id + ": " + s.url + " is the verified source");
      assert.ok(Array.isArray(s.phrases) && s.phrases.length >= 1, id + ": phrases");
      for (const ph of s.phrases) assert.ok(V[tel].quote.includes(ph), id + ": phrase '" + ph + "' is quoted in the doc");
    }
  }
});

test("B4: the new wording is on the professional review list (LEGAL-PACKET L63 and CRISIS-RESOURCES)", () => {
  const legal = read("docs/LEGAL-PACKET.md"), cr = read("docs/CRISIS-RESOURCES.md");
  const l63 = legal.split(/^#+ .*\bL63\b.*$/m)[1];
  assert.ok(l63, "LEGAL-PACKET has an L63 heading");
  const sec = l63.split(/^#+ /m)[0];
  for (const w of Object.values(OWNER_1323)) { assert.ok(sec.includes(w), "L63 lists '" + w + "'"); assert.ok(cr.includes(w), "CRISIS-RESOURCES lists '" + w + "'"); }
  const L = H();
  for (const id of IDS) for (const lang of ["en", "zh"]) assert.ok(cr.includes(L.LINES[id][lang].btn), "CRISIS-RESOURCES lists " + id + " " + lang + " button");
  assert.match(cr, /professional review/i);
});
