#!/usr/bin/env node
// tools/cat-pages.mjs — round 16 item 1 (S1): builds the 7 category landing pages from tools/cat-data.cjs.
//
//   node tools/cat-pages.mjs           write cat-<slug>.html, i18n/en-cat.js, i18n/zh-cat.js, the category chooser and footer
//                                      column in index.html and the table in docs/PAGE-STATUS.md (between their markers)
//   node tools/cat-pages.mjs --check   write nothing; exit 1 and list the files that are out of date
//
// Thai is the default text in the markup; English and Chinese go to the dictionaries (keys cat.*). Tool names and
// one-line descriptions are the nav.js menu entries (keys nav.<page>.title|desc, translated in i18n/{en,zh}-common.js),
// parsed from nav.js so the menu and the landing pages cannot disagree. The CSP <meta> is copied from index.html
// (npm run csp:meta keeps that one current). Pure static pages: they read without JavaScript.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { metaPolicy, metaTag } from "./csp-meta.mjs";
import { snippet as helpLine } from "./helpline.mjs";

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

function counts(cat) {
  const n = { all: cat.pages.length };
  for (const st of Object.keys(D.STATUS)) n[st] = cat.pages.filter(p => D.PAGES[p].st === st).length;
  return n;
}
const COUNT_TPL = {
  th: (n) => `${n.all} เครื่องมือ · พร้อมนำร่อง ${n["pilot-ready"]} · ทดลอง ${n.experimental} · สาธิต ${n.demo}` + (n.support ? ` · หน้าประกอบ ${n.support}` : ""),
  en: (n) => `${n.all} tools · pilot-ready ${n["pilot-ready"]} · experimental ${n.experimental} · demo ${n.demo}` + (n.support ? ` · support pages ${n.support}` : ""),
  zh: (n) => `${n.all} 个工具 · 可试点 ${n["pilot-ready"]} · 实验性 ${n.experimental} · 演示 ${n.demo}` + (n.support ? ` · 辅助页面 ${n.support}` : "")
};

/** Fixed UI strings of the landing pages (and the index.html category chooser). */
const UI = {
  "cat.eyebrow": { th: "LENSIQ · หมวดงาน", en: "LENSIQ · Work categories", zh: "LENSIQ · 业务类别" },
  "cat.cta.pilot": { th: "ขอโครงการนำร่อง", en: "Request a pilot", zh: "申请试点" },
  "cat.cta.all": { th: "ระบบทั้งหมด", en: "All solutions", zh: "全部系统" },
  "cat.legend.h": { th: "สถานะหมายถึงอะไร", en: "What the status means", zh: "状态说明" },
  "cat.src.h": { th: "ที่มาของตัวเลข", en: "Where the numbers come from", zh: "数据来源" },
  "cat.src.d": { th: "ทุกตัวเลขบอกที่มา: ข้อมูลสังเคราะห์ ชุดข้อมูลสาธารณะ หรือภาคสนาม ยังไม่มีระบบใดมีตัวเลขภาคสนาม ก่อนใช้ตัวเลขจริงให้ทดลองหน้างานพร้อมนับเทียบ",
    en: "Every number names its source: synthetic, public dataset or field. No tool has a field figure yet. Before relying on a number, run an on-site trial with a manual count.",
    zh: "每个数字都注明来源：合成数据、公开数据集或实地。目前没有任何工具有实地数据。依赖数字前，请先在现场试用并人工比对计数。" },
  "cat.tools.h": { th: "เครื่องมือในหมวดนี้", en: "Tools in this category", zh: "本类别的工具" },
  "cat.acc.h": { th: "ความแม่นยำที่วัดได้", en: "Measured accuracy", zh: "已测准确率" },
  "cat.why": { th: "ทำไมสถานะนี้", en: "Why this status", zh: "为何是此状态" },
  "cat.open": { th: "เปิดหน้า", en: "Open page", zh: "打开页面" },
  "cat.method": { th: "วิธีวัดและชุดข้อมูล", en: "How it was measured", zh: "测量方法与数据集" },
  "cat.others.h": { th: "หมวดอื่น", en: "Other categories", zh: "其他类别" },
  "cat.all.h": { th: "เลือกตามหมวดงาน", en: "Browse by work category", zh: "按业务类别浏览" },
  "cat.all.sub": { th: "เจ็ดหมวดงาน ทุกหน้ายังอยู่ครบ แต่ละหมวดบอกสถานะและความแม่นยำที่วัดได้พร้อมที่มา",
    en: "Seven work categories. Every page is still here; each category shows status and measured accuracy with its source.",
    zh: "七个业务类别。所有页面都保留；每个类别都标明状态以及已测准确率和来源。" },
  "cat.all.kicker": { th: "หมวดงาน", en: "Categories", zh: "类别" },
  "cat.go": { th: "ดูหมวดนี้ →", en: "View category →", zh: "查看类别 →" },
  "cat.foot.h": { th: "หมวดงาน", en: "Work categories", zh: "业务类别" },
  "cat.foot.ana": { th: "วิเคราะห์", en: "Analytics", zh: "分析" }
};

/** Every dictionary entry: key -> {th, en, zh}. */
export function entries() {
  const e = { ...UI };
  for (const [st, v] of Object.entries(D.STATUS)) { e["cat.st." + st] = v; e["cat.std." + st] = D.STATUS_DEF[st]; }
  for (const [k, v] of Object.entries(D.SOURCE)) e["cat.src." + k] = v;
  for (const [k, v] of Object.entries(D.CLAIMS)) e["cat.c." + k] = { th: v.th, en: v.en, zh: v.zh };
  for (const [k, v] of Object.entries(D.REASONS)) e["cat.r." + k] = v;
  for (const c of D.CATEGORIES) {
    e[`cat.${c.slug}.name`] = c.name;
    e[`cat.${c.slug}.intro`] = c.intro;
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
export const FAVICON_ONE_LINE = readFileSync(join(repo, "solutions.html"), "utf8").match(/<link rel="icon"[^>]*>/)[0];
const FAVICON = splitFavicon(FAVICON_ONE_LINE);

function card(page, nav) {
  const p = D.PAGES[page], t = nav[page];
  if (!t) throw new Error(`${page}.html is in a category but not in the nav.js menu`);
  const acc = p.claims.map(id => {
    const c = D.CLAIMS[id];
    return `          <li data-src="${c.src}"><span class="cat-src ${c.src}" data-i18n="cat.src.${c.src}">${esc(D.SOURCE[c.src].th)}</span> <span data-i18n="cat.c.${id}">${esc(c.th)}</span></li>`;
  }).join("\n");
  return `      <article class="pd-card cat-tool" data-page="${page}" data-status="${p.st}">
        <div class="cat-top"><h3 data-i18n="nav.${page}.title">${esc(t.title)}</h3><span class="cat-st ${p.st}" data-i18n="cat.st.${p.st}">${esc(D.STATUS[p.st].th)}</span></div>
        <p data-i18n="nav.${page}.desc">${esc(t.desc)}</p>
        <p class="cat-h" data-i18n="cat.acc.h">ความแม่นยำที่วัดได้</p>
        <ul class="cat-acc">
${acc}
        </ul>
        <p class="cat-why"><b data-i18n="cat.why">ทำไมสถานะนี้</b> <span data-i18n="cat.r.${p.why}">${esc(D.REASONS[p.why].th)}</span></p>
        <a class="sl-go" href="${page}.html"><span data-i18n="cat.open">เปิดหน้า</span> <span class="cat-arrow" aria-hidden="true">→</span></a>
      </article>`;
}

export function pageHtml(cat, nav = navEntries()) {
  const n = counts(cat);
  const legend = Object.keys(D.STATUS).map(st =>
    `        <li><span class="cat-st ${st}" data-i18n="cat.st.${st}">${esc(D.STATUS[st].th)}</span> <span data-i18n="cat.std.${st}">${esc(D.STATUS_DEF[st].th)}</span></li>`).join("\n");
  const srcs = ["synthetic", "public", "prelim", "field", "none", "na"].map(k =>
    `<span class="cat-src ${k}" data-i18n="cat.src.${k}">${esc(D.SOURCE[k].th)}</span>`).join(" ");
  const others = D.CATEGORIES.filter(c => c !== cat).map(c =>
    `        <a href="cat-${c.slug}.html"><span aria-hidden="true">${c.icon}</span><span data-i18n="cat.${c.slug}.name">${esc(c.name.th)}</span></a>`).join("\n");
  return head([
    "<!doctype html>",
    '<html lang="th">',
    "<head>",
    '<meta charset="utf-8">',
    cspMeta(),
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="theme-color" content="#0e1430">',
    FAVICON,
    `<!-- GENERATED by tools/cat-pages.mjs from tools/cat-data.cjs (round 16, item 1). Edit the data, then run the tool. -->`,
    `<title data-i18n="cat.${cat.slug}.title">${esc(cat.name.th)} | LENSIQ</title>`,
    `<meta name="description" data-i18n-attr="content:cat.${cat.slug}.intro" content="${esc(cat.intro.th)}">`,
    '<link rel="stylesheet" href="styles.css?v=12">',
    '<link rel="stylesheet" href="products.css?v=2">',
    '<link rel="stylesheet" href="solutions.css?v=1">',
    '<link rel="stylesheet" href="cat.css?v=1">',
    "</head>",
    "<body>",
    '<header class="nav" id="siteNav"></header>',
    '<script src="nav.js?v=16"></script>',
    '<script src="i18n/zh-cat.js?v=1"></script>',
    // the fortune category carries the always-visible help line (owner order 2026-11-12; tools/helpline.mjs)
    ...(cat.slug === "fortune" ? [helpLine("lqHelpTop")] : []),
    `<main class="pd cat" id="main" data-cat="${cat.slug}">`,
    `  <section class="pd-hero" aria-labelledby="catH">`,
    `    <span class="eyebrow" data-i18n="cat.eyebrow">LENSIQ · หมวดงาน</span>`,
    `    <h1 id="catH"><span aria-hidden="true">${cat.icon}</span> <span data-i18n="cat.${cat.slug}.name">${esc(cat.name.th)}</span></h1>`,
    `    <p data-i18n="cat.${cat.slug}.intro">${esc(cat.intro.th)}</p>`,
    `    <div class="pd-cta">`,
    `      <a class="btn primary" href="index.html?interest=solutions#contact" data-i18n="cat.cta.pilot">ขอโครงการนำร่อง</a>`,
    `      <a class="btn ghost light" href="cameras.html" data-i18n="cat.cta.all">ระบบทั้งหมด</a>`,
    `    </div>`,
    `  </section>`,
    `  <div class="pd-body">`,
    `    <section aria-labelledby="catToolsH">`,
    `      <h2 id="catToolsH" data-i18n="cat.tools.h">เครื่องมือในหมวดนี้</h2>`,
    `      <p class="pd-sub" id="catCount" data-i18n="cat.${cat.slug}.count">${esc(COUNT_TPL.th(n))}</p>`,
    `      <div class="pd-grid cat-grid">`,
    cat.pages.map(p => card(p, nav)).join("\n"),
    `      </div>`,
    `    </section>`,
    `    <section aria-labelledby="catLegendH">`,
    `      <h2 id="catLegendH" data-i18n="cat.legend.h">สถานะหมายถึงอะไร</h2>`,
    `      <ul class="sl-legend cat-legend">`,
    legend,
    `      </ul>`,
    `      <h2 class="cat-h2" data-i18n="cat.src.h">ที่มาของตัวเลข</h2>`,
    `      <p class="pd-sub" data-i18n="cat.src.d">${esc(UI["cat.src.d"].th)}</p>`,
    `      <p class="cat-srcs">${srcs}</p>`,
    `      <p class="pd-note"><a href="cameras.html#accuracy" data-i18n="cat.method">วิธีวัดและชุดข้อมูล</a></p>`,
    `    </section>`,
    `    <section aria-labelledby="catOthersH">`,
    `      <h2 id="catOthersH" data-i18n="cat.others.h">หมวดอื่น</h2>`,
    `      <nav class="pd-others" aria-labelledby="catOthersH">`,
    others,
    `      </nav>`,
    `    </section>`,
    `  </div>`,
    ...(cat.slug === "fortune" ? [helpLine("lqHelpEnd", "  ")] : []),
    `</main>`,
    '<script src="lensiq-config.js?v=10"></script>',
    "</body>",
    "</html>",
    ""
  ]);
}

/** index.html regions between <!-- name:start --> / <!-- name:end --> markers: category chooser + footer column. */
export function indexRegions() {
  const cards = D.CATEGORIES.map(c => `      <a class="pd-card" href="cat-${c.slug}.html"><span class="pd-ic" aria-hidden="true">${c.icon}</span>` +
    `<h3 data-i18n="cat.${c.slug}.name">${esc(c.name.th)}</h3><p data-i18n="cat.${c.slug}.intro">${esc(c.intro.th)}</p>` +
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
  const rows = ["| Page | Category | Proposed status | Why (EN) | เหตุผล (TH) | Accuracy shown, with source | Evidence |", "|---|---|---|---|---|---|---|"];
  const order = D.CATEGORIES.flatMap(c => c.pages).concat(D.PLATFORM, ["index"], Object.keys(D.UNLINKED));
  const seen = new Set();
  for (const p of order) {
    if (seen.has(p)) continue;
    seen.add(p);
    const v = D.PAGES[p];
    const acc = v.claims.map(id => `**${D.SOURCE[D.CLAIMS[id].src].en}:** ${D.CLAIMS[id].en}`).join("<br>");
    const ev = [...new Set(v.claims.map(id => D.CLAIMS[id].ref))].join("; ");
    rows.push(`| \`${p}.html\` | ${catOf[p].join(" + ")} | **${v.st}** | ${D.REASONS[v.why].en} | ${D.REASONS[v.why].th} | ${acc} | ${ev} |`);
  }
  for (const c of D.CATEGORIES) {
    const n = counts(c);
    rows.push(`| \`cat-${c.slug}.html\` (new) | ${c.n} ${c.name.en} | landing page | Lists the category's ${n.all} tools with status and accuracy | ` +
      "หน้ารวมหมวด แสดงเครื่องมือ สถานะ และความแม่นยำ | — | tools/cat-data.cjs |");
  }
  const tally = {};
  for (const p of Object.keys(D.PAGES)) tally[D.PAGES[p].st] = (tally[D.PAGES[p].st] || 0) + 1;
  const products = Object.keys(D.PAGES).length - (tally.support || 0);
  const ready = Object.keys(D.STATUS).filter(st => st !== "support");
  rows.push("", `Totals over the ${Object.keys(D.PAGES).length} existing pages: **${products} product pages** — ` +
    ready.map(st => `${st} ${tally[st] || 0}`).join(" · ") + ` — and **${tally.support || 0} support pages** (directory, notices, information, ` +
    "legal, account; no readiness status, not counted with the products).");
  rows.push("", "Per category (tools; booth counts in 4 and 7):", "", "| # | Category | Tools | pilot-ready | experimental | demo | support pages |",
    "|---|---|---|---|---|---|---|");
  for (const c of D.CATEGORIES) {
    const n = counts(c);
    rows.push(`| ${c.n} | ${c.name.en} · ${c.name.th} | ${n.all} | ${n["pilot-ready"]} | ${n.experimental} | ${n.demo} | ${n.support} |`);
  }
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
