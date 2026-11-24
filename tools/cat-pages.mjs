#!/usr/bin/env node
// tools/cat-pages.mjs — round 16 item 1 (S1): builds the 7 category landing pages from tools/cat-data.cjs.
//
//   node tools/cat-pages.mjs           write cat-<slug>.html, i18n/en-cat.js, i18n/zh-cat.js, the category chooser and footer
//                                      column in index.html and the table in docs/PAGE-STATUS.md (between their markers)
//   node tools/cat-pages.mjs --check   write nothing; exit 1 and list the files that are out of date
//
// Thai is the default text in the markup; English and Chinese go to the dictionaries (keys cat.*). Tool names and
// one-line descriptions are the nav.js menu entries (keys nav.<page>.title|desc, translated in i18n/{en,zh}-common.js),
// parsed from nav.js so the menu and the landing pages cannot disagree. Owner decision 223: each card shows the name, a
// short badge, the menu line and the two approved lines (no accuracy, legend, sources or reasons); counts are tools only. The CSP <meta> is copied from index.html
// (npm run csp:meta keeps that one current). Pure static pages: they read without JavaScript.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { metaPolicy, metaTag } from "./csp-meta.mjs";
import { snippet as helpLine, topStyle } from "./helpline.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const D = require("./cat-data.cjs");

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const jsStr = s => JSON.stringify(String(s));

/** nav.js menu entries -> { page: { title, desc } } (Thai defaults). */
export function navEntries(navSrc = readFileSync(join(repo, "nav.js"), "utf8")) {
  const out = {};
  for (const m of navSrc.matchAll(/\{ href: "([a-z0-9-]+)\.html", title: "([^"]+)", desc: "([^"]+)" \}/g)) if (!out[m[1]]) out[m[1]] = { title: m[2], desc: m[3] };
  return out;
}

/** decision 226: the visibility list (page -> on / off) of nav.js, the single source of what customers see */
export function visibility(navSrc = readFileSync(join(repo, "nav.js"), "utf8")) {
  const m = navSrc.match(/var VISIBILITY = (\{[\s\S]*?\});/);
  if (!m) throw new Error("nav.js: var VISIBILITY = { … } missing");
  return JSON.parse(m[1].replace(/([{,]\s*)([a-z][\w-]*)\s*:/g, '$1"$2":').replace(/,\s*\}/, "}"));
}
const VIS = visibility();
const isOn = p => VIS[p] !== false;
function counts(cat) {
  // decision 226: the number of tools a customer can see (switched-off products are not listed or counted)
  const listed = cat.pages.filter(isOn);
  const n = { all: listed.length, noTag: !!cat.noStatusTag };
  for (const st of Object.keys(D.STATUS)) n[st] = cat.pages.filter(p => D.PAGES[p].st === st).length; // internal (PAGE-STATUS.md)
  return n;
}
/** owner decision 223 (audit 1.0): every category shows the number of tools only, as the fortune category already did */
const COUNT_TPL = {
  th: (n) => `${n.all} เครื่องมือ`,
  en: (n) => `${n.all} tools`,
  zh: (n) => `${n.all} 个工具`
};

/** Fixed UI strings of the landing pages (and the index.html category chooser). */
const UI = {
  "cat.eyebrow": { th: "LENSIQ · หมวดงาน", en: "LENSIQ · Work categories", zh: "LENSIQ · 业务类别" },
  "cat.cta.pilot": { th: "ขอโครงการนำร่อง", en: "Request a pilot", zh: "申请试点" },
  "cat.cta.all": { th: "ระบบทั้งหมด", en: "All solutions", zh: "全部系统" },
  "cat.more": { th: "อ่านเพิ่มเติม", en: "Read more", zh: "阅读更多" },
  "cat.tools.h": { th: "เครื่องมือในหมวดนี้", en: "Tools in this category", zh: "本类别的工具" },
  "cat.open": { th: "เปิดหน้า", en: "Open page", zh: "打开页面" },
  "cat.openTimeclock": { th: "เปิดลงเวลาทำงาน PIN / QR", en: "Open the PIN / QR time clock", zh: "打开 PIN / QR 考勤打卡" },
  "cat.others.h": { th: "หมวดอื่น", en: "Other categories", zh: "其他类别" },
  "cat.all.h": { th: "เลือกตามหมวดงาน", en: "Browse by work category", zh: "按业务类别浏览" },
  "cat.all.sub": { th: "เจ็ดหมวดงาน เลือกหมวดเพื่อดูเครื่องมือทั้งหมด", en: "Seven work categories. Pick one to see all its tools.",
    zh: "七个业务类别，选择类别查看全部工具。" },
  "cat.all.kicker": { th: "หมวดงาน", en: "Categories", zh: "类别" },
  "cat.go": { th: "ดูหมวดนี้ →", en: "View category →", zh: "查看类别 →" },
  "cat.foot.h": { th: "หมวดงาน", en: "Work categories", zh: "业务类别" },
  "cat.foot.ana": { th: "วิเคราะห์", en: "Analytics", zh: "分析" }
};

/** Every dictionary entry: key -> {th, en, zh}. */
export function entries() {
  const e = { ...UI };
  // owner decision 223: only the short customer badges; the old status, source, accuracy and reason texts stay in
  // tools/cat-data.cjs for docs/PAGE-STATUS.md and are not written to the dictionaries
  for (const c of D.CATEGORIES) {
    e[`cat.${c.slug}.name`] = c.name;
    e[`cat.${c.slug}.intro`] = c.intro;
    if (c.lead) e[`cat.${c.slug}.lead`] = c.lead;
    if (c.disc) e["fortune.disc.line"] = c.disc;
    e[`cat.${c.slug}.title`] = { th: c.name.th + " | LENSIQ", en: c.name.en + " | LENSIQ", zh: c.name.zh + " | LENSIQ" };
    const n = counts(c);
    e[`cat.${c.slug}.count`] = { th: COUNT_TPL.th(n), en: COUNT_TPL.en(n), zh: COUNT_TPL.zh(n) };
  }
  return e;
}

function dict(lang) {
  const e = entries();
  const name = lang === "en" ? "English" : "Chinese (Simplified)";
  let s = `/* i18n/${lang}-cat.js — ${name} for the category landing pages (cat-*.html) and the category chooser on index.html.\n` +
    `   GENERATED by tools/cat-pages.mjs from tools/cat-data.cjs — edit the data file, then run the tool. */\n` +
    `(window.LQI18N_Q = window.LQI18N_Q || []).push({ ${lang}: {\n`;
  const keys = Object.keys(e);
  keys.forEach((k, i) => { s += `  ${jsStr(k)}: ${jsStr(e[k][lang])}${i < keys.length - 1 ? "," : ""}\n`; });
  return s + "} });\n";
}

/** The CSP <meta> of index.html (npm run csp:meta keeps it current), re-written by tools/csp-meta.mjs metaTag() so the
 *  category pages carry exactly the same tag, one directive per line, as every page csp-meta.mjs writes. */
function cspMeta() {
  const pol = metaPolicy(readFileSync(join(repo, "index.html"), "utf8"));
  if (!pol) throw new Error("index.html has no CSP meta (run npm run csp:meta)");
  return metaTag(pol);
}
function head(lines) { return wrapHtml(lines.filter(Boolean).join("\n")); }

/** Keeps generated markup under the format-check width: a line over WRAP characters is broken at a space between
 *  attributes or in text (HTML collapses the new line + indent to one space). The CSP <meta> is already written one
 *  directive per line by tools/csp-meta.mjs metaTag(). The favicon data URI is split by splitFavicon() instead. */
const WRAP = 160;
export function wrapHtml(src) {
  return src.split("\n").map(line => {
    if ([...line].length <= WRAP || /<link rel="icon"/.test(line)) return line;
    const indent = line.match(/^\s*/)[0] + "  ";
    const out = [];
    let cur = "", inTag = false, quote = "", lastBreak = -1;
    for (const ch of line) {
      if (inTag) { if (quote) { if (ch === quote) quote = ""; } else if (ch === '"' || ch === "'") quote = ch; else if (ch === ">") inTag = false; }
      else if (ch === "<") inTag = true;
      if (ch === " " && !quote && cur.trim()) lastBreak = cur.length;
      cur += ch;
      if ([...cur].length > WRAP && lastBreak > 0) {
        out.push(cur.slice(0, lastBreak));
        cur = indent + cur.slice(lastBreak + 1);
        lastBreak = -1;
      }
    }
    out.push(cur);
    return out.join("\n");
  }).join("\n");
}

/** The favicon of every page (copied from solutions.html), its data URI split over lines of at most FAV_W characters.
 *  A line break goes only right before a space that is already in the SVG text (between attributes or inside a
 *  space-separated list such as viewBox or a path), so whatever a browser does with the line feed in the URL (the
 *  WHATWG URL parser drops it; Chrome keeps it as %0A in a data URL) the SVG only gains whitespace where it already had
 *  some. tests/e2e/categories.e2e.mjs checks that the decoded SVG equals the solutions.html one and that it renders. */
const FAV_W = 150;
export function splitFavicon(tag) {
  const m = tag.match(/^(<link rel="icon" href=")([^"]*)(">)$/);
  if (!m) throw new Error("unexpected favicon tag: " + tag.slice(0, 60));
  const parts = [];
  let rest = m[1] + m[2];
  while (rest.length > FAV_W) {
    const cut = rest.lastIndexOf(" ", FAV_W);
    if (cut <= m[1].length) throw new Error("favicon: no space to split at");
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  parts.push(rest + m[3]);
  return parts.join("\n");
}
/** quote-form interest preselected by each category's CTA (index.html #lqInterest options; buyer walkthrough W-017) */
const CAT_INTEREST = { security: "gate", education: "exam", hr: "attendance", marketing: "crowd", health: "addons", fortune: "fortune", studio: "photobooth" };
export const FAVICON_ONE_LINE = readFileSync(join(repo, "solutions.html"), "utf8").match(/<link rel="icon"[^>]*>/)[0];
const FAVICON = splitFavicon(FAVICON_ONE_LINE);

/** A fortune card (owner decision 2026-11-18): the whole card is one link holding the small illustration, the name and one
 *  short line (the nav.js menu line); no status, no accuracy, no disclaimer, no separate "open page" link. The illustration is
 *  drawn by CSS from data-ic (cat.css) so the card's text is only the name and the line. Inside it sits the theme's gold line
 *  illustration slot (svg.ft-ill, filled by fortune-entry.js): the theme shows the gold drawing instead of the emoji
 *  (fortune-theme.css), classic hides the slot and keeps the emoji. */
function oneLinkCard(page, t, ill) {
  return `      <article class="pd-card cat-tool" data-page="${page}">
        <a class="cat-card" href="${SL_GO[page] || page + ".html"}">
          <div class="cat-top"><span class="cat-ill" data-ic="${ill || ""}" aria-hidden="true"><svg class="ft-ill" data-ic="${page}" aria-hidden="true" focusable="false"></svg></span><h3 data-i18n="nav.${page}.title">${esc(t.title)}</h3></div>
          <p data-i18n="nav.${page}.desc">${esc(t.desc)}</p>
        </a>
      </article>`;
}

const openLink = page => `        <a class="sl-go" href="${SL_GO[page] || page + ".html"}"><span data-i18n="cat.open">เปิดหน้า</span> ` +
  `<span class="cat-arrow" aria-hidden="true">→</span></a>`;
const ENTRY_BTN = `        <a class="btn primary cat-entry" href="attendance.html?mode=employee" data-i18n="cat.openTimeclock">เปิดลงเวลาทำงาน PIN / QR</a>\n`;
function card(page, nav, noTag = false, cat = null) {
  const t = nav[page];
  if (!t) throw new Error(`${page}.html is in a category but not in the nav.js menu`);
  if (cat && cat.noAccuracy) return oneLinkCard(page, t, (cat.ill || {})[page] || cat.icon);
  // owner decisions 223 + 226: name, the menu line and the two approved lines (what it is for, its main limit); no status
  // label (labels live in the back office), no accuracy list, no "why this status"
  const ln = Object.entries(D.LINES).find(([, v]) => v.cards.includes(page));
  const lines = ln ? `        <p class="cat-ln">` + ["1", "2"].filter(n => ln[1][n]).map(n => `<span data-i18n="ln.${ln[0]}.${n}">${esc(ln[1][n])}</span>`).join("<br>") + "</p>\n" : "";
  return `      <article class="pd-card cat-tool" data-page="${page}">
        <div class="cat-top"><h3 data-i18n="nav.${page}.title">${esc(t.title)}</h3></div>
        <p data-i18n="nav.${page}.desc">${esc(t.desc)}</p>
${lines}${page === "attendance" ? ENTRY_BTN : ""}${openLink(page)}
      </article>`;
}

// walk-through 2026-11-16 D-02: the attendance card sells the PIN / QR time clock, so its page link opens that mode
// (the bare attendance.html is the face-scan training check-in)
const SL_GO = /** @type {Record<string, string>} */ ({ attendance: "attendance.html?mode=employee" });

export function pageHtml(cat, nav = navEntries()) {
  const n = counts(cat);
  const others = D.CATEGORIES.filter(c => c !== cat).map(c =>
    `        <a href="cat-${c.slug}.html"><span aria-hidden="true">${c.icon}</span><span data-i18n="cat.${c.slug}.name">${esc(c.name.th)}</span></a>`).join("\n");
  return head([
    "<!doctype html>",
    // the fortune category wears the fortune theme "ราตรีคราม" (owner approval 2026-11-17; fortune-theme.css, fortune-entry.js)
    cat.slug === "fortune" ? '<html lang="th" class="lq-ft lq-ft-menu">' : '<html lang="th">',
    "<head>",
    '<meta charset="utf-8">',
    cspMeta(),
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="theme-color" content="#0e1430">',
    FAVICON,
    `<!-- GENERATED by tools/cat-pages.mjs from tools/cat-data.cjs (round 16, item 1). Edit the data, then run the tool. -->`,
    `<title data-i18n="cat.${cat.slug}.title">${esc(cat.name.th)} | LENSIQ</title>`,
    `<meta name="description" data-i18n-attr="content:cat.${cat.slug}.intro" content="${esc(cat.intro.th)}">`,
    '<link rel="stylesheet" href="styles.css?v=24">',
    '<link rel="stylesheet" href="products.css?v=3">',
    '<link rel="stylesheet" href="solutions.css?v=5">',
    '<link rel="stylesheet" href="cat.css?v=3">',
    cat.slug === "fortune" ? '<link rel="stylesheet" href="fortune-theme.css?v=3">' : "",
    '<script src="lensiq-busy.js?v=3"></script>',
    cat.slug === "fortune" ? '<script src="fortune-entry.js?v=5"></script>' : "",
    "</head>",
    "<body>",
    '<header class="nav" id="siteNav"></header>',
    '<script src="nav.js?v=40"></script>',
    '<script src="i18n/zh-cat.js?v=8"></script>',
    // the fortune category carries the always-visible help button, in one place (owner orders 2026-11-12, 2026-11-15; tools/helpline.mjs)
    ...(cat.slug === "fortune" ? [topStyle(), helpLine("lqHelpTop")] : []),
    `<main class="pd cat${cat.discMore ? " lq-ftop" : ""}" id="main" data-cat="${cat.slug}">`,
    `  <section class="pd-hero" aria-labelledby="catH">`,
    `    <span class="eyebrow" data-i18n="cat.eyebrow">LENSIQ · หมวดงาน</span>`,
    `    <h1 id="catH"><span aria-hidden="true">${cat.icon}</span> <span data-i18n="cat.${cat.slug}.name">${esc(cat.name.th)}</span></h1>`,
    ...(cat.lead && cat.disc ? [
      // fortune (owner order 2026-11-15 item 2): the lead, then the same one-line notice every fortune page shows
      `    <p data-i18n="cat.${cat.slug}.lead">${esc(cat.lead.th)}</p>`,
      // owner order 2026-11-16 item 4: one small line under the title; "อ่านเพิ่มเติม" links to the fortune answer on help.html
      `    <p class="lq-notice lq-top" role="note"><b class="lq-disc-line" data-i18n="fortune.disc.line">${esc(cat.disc.th)}</b>` +
        (cat.discMore ? ` <a href="${cat.discMore}" data-i18n="cat.more">อ่านเพิ่มเติม</a>` : "") + `</p>`,
    ] : [`    <p data-i18n="cat.${cat.slug}.intro">${esc(cat.intro.th)}</p>`]),
    `    <div class="pd-cta">`,
    `      <a class="btn primary" href="index.html?interest=${CAT_INTEREST[cat.slug] || "unsure"}#contact" data-i18n="cat.cta.pilot">ขอโครงการนำร่อง</a>`,
    `      <a class="btn ghost light" href="cameras.html" data-i18n="cat.cta.all">ระบบทั้งหมด</a>`,
    `    </div>`,
    `  </section>`,
    `  <div class="pd-body">`,
    `    <section aria-labelledby="catToolsH">`,
    `      <h2 id="catToolsH" data-i18n="cat.tools.h">เครื่องมือในหมวดนี้</h2>`,
    `      <p class="pd-sub" id="catCount" data-i18n="cat.${cat.slug}.count">${esc(COUNT_TPL.th(n))}</p>`,
    `      <div class="pd-grid cat-grid">`,
    cat.pages.filter(isOn).map(p => card(p, nav, !!cat.noStatusTag, cat)).join("\n"),
    `      </div>`,
    `    </section>`,
    // owner decision 223: no status legend, no "where the numbers come from" section and no method link on any category page
    `    <section aria-labelledby="catOthersH">`,
    `      <h2 id="catOthersH" data-i18n="cat.others.h">หมวดอื่น</h2>`,
    `      <nav class="pd-others" aria-labelledby="catOthersH">`,
    others,
    `      </nav>`,
    `    </section>`,
    `  </div>`,
    `</main>`,
    '<script src="lensiq-config.js?v=31"></script>',
    "</body>",
    "</html>",
    ""
  ]);
}

/** index.html regions between <!-- name:start --> / <!-- name:end --> markers: category chooser + footer column. */
export function indexRegions() {
  const cards = D.CATEGORIES.map(c => `      <a class="pd-card" href="cat-${c.slug}.html"><span class="pd-ic" aria-hidden="true">${c.icon}</span>` +
    // owner order 2026-11-18: no per-card disclaimer where fortune is listed, so a category with a lead + notice line shows the lead
    (c.lead && c.disc ? `<h3 data-i18n="cat.${c.slug}.name">${esc(c.name.th)}</h3><p data-i18n="cat.${c.slug}.lead">${esc(c.lead.th)}</p>`
      : `<h3 data-i18n="cat.${c.slug}.name">${esc(c.name.th)}</h3><p data-i18n="cat.${c.slug}.intro">${esc(c.intro.th)}</p>`) +
    `<p class="cat-n" data-i18n="cat.${c.slug}.count">${esc(COUNT_TPL.th(counts(c)))}</p><span class="pd-go" data-i18n="cat.go">ดูหมวดนี้ →</span></a>`).join("\n");
  const chooser = [
    `  <section class="pd-chooser cat-chooser" id="categories" aria-labelledby="catAllH">`,
    `    <p class="kicker" data-i18n="cat.all.kicker">หมวดงาน</p>`,
    `    <h2 id="catAllH" data-i18n="cat.all.h">เลือกตามหมวดงาน</h2>`,
    `    <p class="pd-sub" data-i18n="cat.all.sub">${esc(UI["cat.all.sub"].th)}</p>`,
    `    <div class="pd-grid">`, cards, `    </div>`, `  </section>`].join("\n");
  const foot = `    <nav aria-label="หมวดงาน" data-i18n-attr="aria-label:cat.foot.h"><h3 data-i18n="cat.foot.h">หมวดงาน</h3>` +
    D.CATEGORIES.map(c => `<a href="cat-${c.slug}.html" data-i18n="cat.${c.slug}.name">${esc(c.name.th)}</a>`).join("") + `</nav>`;
  return { "cat-chooser": wrapHtml(chooser), "cat-foot": wrapHtml(foot) };
}
/** solutions.html region: the 7 categories above the sector catalogue. Its keys (sl.cats.*) live in the page's own
 *  dictionaries i18n/{en,zh}-solutions.js (generated block between the cat-sol markers), like every other solutions key. */
function solutionsKeys() {
  const e = { "sl.cats.h": UI["cat.all.h"], "sl.cats.sub": UI["cat.all.sub"] };
  for (const c of D.CATEGORIES) e[`sl.cats.${c.slug}`] = c.name;
  return e;
}
export function solutionsRegions() {
  const links = D.CATEGORIES.map(c => `        <a href="cat-${c.slug}.html"><span aria-hidden="true">${c.icon}</span><span data-i18n="sl.cats.${c.slug}">${esc(c.name.th)}</span></a>`).join("\n");
  return { "cat-sol": wrapHtml([
    `    <section class="sl-cats" aria-labelledby="slCatH">`,
    `      <h2 id="slCatH" data-i18n="sl.cats.h">เลือกตามหมวดงาน</h2>`,
    `      <p class="pd-sub" data-i18n="sl.cats.sub">${esc(UI["cat.all.sub"].th)}</p>`,
    `      <nav class="pd-others" aria-labelledby="slCatH">`, links, `      </nav>`, `    </section>`].join("\n")) };
}
function solutionsDict(lang) {
  const e = solutionsKeys();
  return `(window.LQI18N_Q = window.LQI18N_Q || []).push({ ${lang}: {\n` +
    Object.keys(e).map(k => `  ${jsStr(k)}: ${jsStr(e[k][lang])}`).join(",\n") + "\n} });";
}
function fillRegions(src, regions, file, js = false) {
  let out = src;
  for (const [name, body] of Object.entries(regions)) {
    const a = js ? `// ${name}:start` : `<!-- ${name}:start -->`, b = js ? `// ${name}:end` : `<!-- ${name}:end -->`;
    const i = out.indexOf(a), j = out.indexOf(b);
    if (i < 0 || j < i) throw new Error(`${file}: markers ${a} / ${b} missing`);
    const indent = out.slice(out.lastIndexOf("\n", j) + 1, j);
    out = out.slice(0, i + a.length) + "\n" + body + "\n" + indent + out.slice(j);
  }
  return out;
}

/** Markdown table of every page (docs/PAGE-STATUS.md). */
export function statusTable() {
  const catOf = {};
  for (const c of D.CATEGORIES) for (const p of c.pages) (catOf[p] = catOf[p] || []).push(`${c.n} ${c.name.en}`);
  for (const p of D.PLATFORM.concat(["index"], Object.keys(D.UNLINKED))) catOf[p] = catOf[p] || ["Platform"];
  // owner decision 223: the internal status, reason and accuracy columns stay here (back-office document); the badge column is
  // back office only since decision 226 (no label on any customer page); visibility = the nav.js list
  const rows = ["| Page | Category | Proposed status | Status label (back office only, 226) · visibility | Why (EN) | เหตุผล (TH) | Accuracy (internal), with source | Evidence |",
    "|---|---|---|---|---|---|---|---|"];
  const order = D.CATEGORIES.flatMap(c => c.pages).concat(D.PLATFORM, ["index"], Object.keys(D.UNLINKED));
  const seen = new Set();
  for (const p of order) {
    if (seen.has(p)) continue;
    seen.add(p);
    const v = D.PAGES[p];
    const noAcc = D.CATEGORIES.some(c => c.noAccuracy && c.pages.includes(p));
    const acc = noAcc ? "none shown (owner decision 2026-11-18: fortune cards carry no accuracy field)"
      : v.claims.map(id => `**${D.SOURCE[D.CLAIMS[id].src].en}:** ${D.CLAIMS[id].en}`).join("<br>");
    const ev = noAcc ? "—" : [...new Set(v.claims.map(id => D.CLAIMS[id].ref))].join("; ");
    const noTag = D.CATEGORIES.some(c => c.noStatusTag && c.pages.includes(p)) ? " (no tag shown on the site, owner order 2026-11-17)" : "";
    const bd = (noTag ? "—" : (D.badgeOf(p) || "none")) + (isOn(p) ? " · shown" : " · OFF (not listed, decision 226)");
    rows.push(`| \`${p}.html\` | ${catOf[p].join(" + ")} | **${v.st}**${noTag} | ${bd} | ${D.REASONS[v.why].en} | ${D.REASONS[v.why].th} | ${acc} | ${ev} |`);
  }
  for (const c of D.CATEGORIES) {
    const n = counts(c);
    rows.push(`| \`cat-${c.slug}.html\` (new) | ${c.n} ${c.name.en} | landing page | — | ` +
      `Lists the category's ${n.all} tools (customer build) with two plain lines and no status label (decisions 223, 226) | ` +
      "หน้ารวมหมวด แสดงเครื่องมือ ป้ายสั้น และสองบรรทัด (ข้อ 223) | — | tools/cat-data.cjs |");
  }
  const tally = {};
  for (const p of Object.keys(D.PAGES)) tally[D.PAGES[p].st] = (tally[D.PAGES[p].st] || 0) + 1;
  const products = Object.keys(D.PAGES).length - (tally.support || 0);
  const ready = Object.keys(D.STATUS).filter(st => st !== "support");
  rows.push("", `Totals over the ${Object.keys(D.PAGES).length} existing pages: **${products} product pages** — ` +
    ready.map(st => `${st} ${tally[st] || 0}`).join(" · ") + ` — and **${tally.support || 0} support pages** (directory, notices, information, ` +
    "legal, account; no readiness status, not counted with the products).");
  rows.push("", "Per category (tools; booth counts in 4 and 7):", "", "| # | Category | Tools (customer build) | pilot-ready | experimental | demo | support pages |",
    "|---|---|---|---|---|---|---|");
  for (const c of D.CATEGORIES) {
    const n = counts(c);
    rows.push(`| ${c.n} | ${c.name.en} · ${c.name.th} | ${n.all} | ${n["pilot-ready"]} | ${n.experimental} | ${n.demo} | ${n.support} |`);
  }
  // owner decision 223 (audit 1.10): the "still needed" notes of the coming-soon catalogue cards, moved off solutions.html
  rows.push("", "Coming-soon cards on solutions.html: what is still needed (internal roadmap; moved off the customer page by owner " +
    "decision 223, verbatim):", "", "| Card | Title | ยังขาด (TH) | Still needed (EN) |", "|---|---|---|---|");
  for (const r of D.SOON_ROADMAP) rows.push(`| \`${r.card}\` | ${r.title} | ${r.th} | ${r.en} |`);
  return rows.join("\n");
}

/** All generated outputs: path -> content. */
export function build() {
  const nav = navEntries();
  const out = {};
  for (const c of D.CATEGORIES) out[`cat-${c.slug}.html`] = pageHtml(c, nav);
  out["index.html"] = fillRegions(readFileSync(join(repo, "index.html"), "utf8"), indexRegions(), "index.html");
  out["solutions.html"] = fillRegions(readFileSync(join(repo, "solutions.html"), "utf8"), solutionsRegions(), "solutions.html");
  for (const l of ["en", "zh"]) {
    const f = `i18n/${l}-solutions.js`;
    out[f] = fillRegions(readFileSync(join(repo, f), "utf8"), { "cat-sol": solutionsDict(l) }, f, true);
  }
  out["i18n/en-cat.js"] = dict("en");
  out["i18n/zh-cat.js"] = dict("zh");
  const mdPath = "docs/PAGE-STATUS.md";
  const md = readFileSync(join(repo, mdPath), "utf8");
  const a = "<!-- status-table:start -->", b = "<!-- status-table:end -->";
  const i = md.indexOf(a), j = md.indexOf(b);
  if (i < 0 || j < i) throw new Error(mdPath + ": status-table markers missing");
  out[mdPath] = md.slice(0, i + a.length) + "\n" + statusTable() + "\n" + md.slice(j);
  return out;
}

/** Files whose content differs from build(). */
export function stale(files = build()) {
  return Object.entries(files).filter(([p, s]) => { try { return readFileSync(join(repo, p), "utf8") !== s; } catch { return true; } }).map(([p]) => p);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = build();
  const bad = stale(files);
  if (process.argv.includes("--check")) {
    if (bad.length) { console.error("out of date (run node tools/cat-pages.mjs): " + bad.join(", ")); process.exit(1); }
    console.log(`cat-pages: ${Object.keys(files).length} files up to date`);
  } else {
    for (const p of bad) writeFileSync(join(repo, p), files[p]);
    console.log(`cat-pages: wrote ${bad.length} of ${Object.keys(files).length} files` + (bad.length ? ": " + bad.join(", ") : ""));
  }
}
