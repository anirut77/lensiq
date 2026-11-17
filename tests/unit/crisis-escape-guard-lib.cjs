// tests/unit/crisis-escape-guard-lib.cjs — helpers of the FIXED TEST SET "crisis-escape-guard" (incident 2026-11-16, owner order
// 2026-11-17: "a test that fails when a new input or result element is added"). Pure Node, no DOM library.
//   readingPages(root)          every *.html page that can draw a fortune reading or the crisis card: it loads fortune-read.js,
//                               fortune-ai.js or fortune-crisis.js (so a NEW fortune page is found without editing a list)
//   ownScripts(html)            the page's own scripts (local, not vendor/, not i18n/)
//   writeTargets(src)           ids a script writes into or reveals: innerHTML / textContent / innerText / outerHTML =,
//                               insertAdjacentHTML / append / appendChild / prepend / replaceChildren / replaceWith (, .hidden = false,
//                               removeAttribute("hidden"), either on the lookup itself or on a variable bound to it
//   ancestry(html)              Map id -> [{tag, id, attrs}] from the element itself up to <html> (tiny tag-stack parser)
//   inRoot(chain)               true when the element or an ancestor is a takeover ROOT (lensiq-crisis-takeover.js ROOTS)
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const READING_SCRIPTS = /^(?:fortune-read|fortune-ai|fortune-crisis)\.js$/;
const scriptsOf = html => [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1].split("?")[0]);
const ownScripts = html => scriptsOf(html).filter(s => !/^https?:/.test(s) && !s.startsWith("vendor/") && !s.startsWith("i18n/"));
function readingPages(root) {
  return fs.readdirSync(root).filter(f => f.endsWith(".html")).sort().filter(f => {
    const html = fs.readFileSync(path.join(root, f), "utf8");
    return scriptsOf(html).some(s => READING_SCRIPTS.test(s));
  }).map(f => f.replace(/\.html$/, ""));
}

const WRITE = String.raw`\s*\.\s*(?:(?:innerHTML|textContent|innerText|outerHTML)\s*(?:\+?=)(?!=)|(?:insertAdjacentHTML|append|appendChild|prepend|replaceChildren|replaceWith)\s*\(|hidden\s*=\s*(?:false|!1)\b|removeAttribute\(\s*["']hidden["']\s*\))`;
// a lookup of one element by id: getElementById("x"), $("x") / $("#x"), querySelector("#x"), byId("x") …
const REF = String.raw`(?:(?:getElementById|\bbyId|(?<![\w$])\$id|(?<![\w$])\$)\(\s*["']#?([A-Za-z][\w-]*)["']\s*\)|\bquerySelector\(\s*["']#([A-Za-z][\w-]*)["']\s*\))`;
function writeTargets(src) {
  const out = new Set();
  for (const m of src.matchAll(new RegExp(REF + "(?:\\s*\\))?" + WRITE, "g"))) out.add(m[1] || m[2]);
  // variables bound to a lookup: const box = $("#x"); … box.innerHTML = …
  for (const m of src.matchAll(new RegExp(String.raw`\b(?:const|let|var)\s+([\w$]+)\s*=\s*(?:/\*\*[^*]*\*/\s*\(\s*)?(?:[\w$.]+\.)?` + REF, "g"))) {
    const v = m[1].replace(/\$/g, "\\$"), id = m[2] || m[3];
    if (new RegExp("(?<![\\w$.])" + v + WRITE).test(src)) out.add(id);
  }
  // object maps of elements: el.x = $("#x") … el.x.innerHTML (common in page scripts)
  for (const m of src.matchAll(new RegExp(String.raw`\b([\w$]+)\s*[:=]\s*(?:/\*\*[^*]*\*/\s*\(\s*)?(?:[\w$.]+\.)?` + REF, "g"))) {
    const v = m[1].replace(/\$/g, "\\$"), id = m[2] || m[3];
    if (new RegExp("\\.\\s*" + v + WRITE).test(src)) out.add(id);
  }
  return [...out].sort();
}

const VOID = /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
const RAW = /^(?:script|style|template|textarea|title)$/i;
function attrsOf(tag) {
  const a = {};
  for (const m of tag.matchAll(/\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) a[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return a;
}
function ancestry(html) {
  const map = new Map(), stack = [];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let m;
  while ((m = re.exec(html))) {
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) { // closing tag: pop to the matching open tag
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
      continue;
    }
    const node = { tag, attrs: attrsOf(" " + (m[3] || "")) };
    node.id = node.attrs.id || "";
    if (node.id && !map.has(node.id)) map.set(node.id, [node].concat(stack.slice().reverse()));
    if (VOID.test(tag) || m[4]) continue;
    if (RAW.test(tag)) { const end = html.indexOf("</" + tag, re.lastIndex); if (end > 0) re.lastIndex = end; continue; }
    stack.push(node);
  }
  return map;
}
// ---------------- free-text inputs (the crisis net must see every one) ----------------
const FREE = /^(?:text|search|tel|email|url|textarea|contenteditable)$/;
const attrRaw = (tag, k) => { const m = tag.match(new RegExp("\\s" + k + "\\s*=\\s*(?:\\\\\"([^\\\\\"]*)\\\\\"|\"([^\"]*)\"|'([^']*)')", "i")); return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null; };
/** source without comments: HTML <!-- -->, JS block comments and whole-line // comments (so documentation is not scanned) */
const strip = src => src.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
/** free-text fields in HTML or script source: [{type, id, cls, name}]; an id built in script (id="cpNick' + i + '") keeps its
 *  literal prefix and is marked templ */
function freeInputs(raw) {
  const out = [], src = strip(raw);
  for (const m of src.matchAll(/<(textarea|input)\b[^>]*>/gi)) {
    const tag = m[0], type = m[1].toLowerCase() === "textarea" ? "textarea" : (attrRaw(tag, "type") || "text").toLowerCase();
    if (!FREE.test(type)) continue;
    const rawId = attrRaw(tag, "id") || "", id = (rawId.match(/^[A-Za-z][\w-]*/) || [""])[0];
    out.push({ type, id, templ: !!rawId && rawId !== id, cls: ((attrRaw(tag, "class") || "").split(/\s+/)[0] || "").replace(/['"+\s].*$/, ""), name: attrRaw(tag, "name") || "" });
  }
  for (const m of src.matchAll(/<[a-z][\w-]*\b[^>]*\scontenteditable(?:\s*=\s*["']?(?!false)[^"'\s>]*["']?)?[^>]*>/gi)) {
    const rawId = attrRaw(m[0], "id") || "", id = (rawId.match(/^[A-Za-z][\w-]*/) || [""])[0];
    out.push({ type: "contenteditable", id, templ: !!rawId && rawId !== id, cls: ((attrRaw(m[0], "class") || "").split(/\s+/)[0] || ""), name: "" });
  }
  // created in script: createElement("textarea"), createElement("input") whose .type (same variable, next 400 chars) is free
  // text or never set, and .contentEditable = true / "true"
  for (const m of src.matchAll(/(?:var|let|const)?\s*([\w$]+)\s*=\s*[\w$.]*createElement\(\s*["'](input|textarea)["']\s*\)/g)) {
    const v = m[1].replace(/\$/g, "\\$"), rest = src.slice(m.index, m.index + 400);
    const t = m[2] === "textarea" ? "textarea" : ((rest.match(new RegExp("\\b" + v + "\\.type\\s*=\\s*[\"'](\\w+)[\"']")) || [])[1] || "text").toLowerCase();
    if (FREE.test(t)) out.push({ type: t, id: (rest.match(new RegExp("\\b" + v + "\\.id\\s*=\\s*[\"']([\\w-]+)[\"']")) || [])[1] || "", cls: "", name: "", script: true });
  }
  for (const m of src.matchAll(/\.contentEditable\s*=\s*(?:true|["'](?:true|plaintext-only)["'])/g)) out.push({ type: "contenteditable", id: "", cls: "", name: "", script: true, at: m.index });
  return out;
}
/** scripts a page gets: its own <script src>, the scripts nav.js injects on every page ("x.js?v=N" literals in nav.js), and
 *  "x.js" / "x.js?v=N" literals in the page's own scripts (scripts those load at run time) */
function pageScriptsAll(root, html) {
  const seen = new Set(ownScripts(html));
  const lit = f => { try { return [...fs.readFileSync(path.join(root, f), "utf8").matchAll(/["']([\w-]+\.js)(?:\?v=\d+)?["']/g)].map(m => m[1]); } catch (e) { return []; } };
  for (const s of [...seen]) for (const f of lit(s)) if (fs.existsSync(path.join(root, f))) seen.add(f);
  return [...seen].filter(f => fs.existsSync(path.join(root, f)));
}
/** a crisis entry point: the page has a free-text field (HTML or its scripts), or it loads fortune-ai.js (FortuneAI readings
 *  get the "report a problem" dialog with a free-text note and the merit interest form) */
function entryPoint(root, page) {
  const html = fs.readFileSync(path.join(root, page + ".html"), "utf8");
  if (scriptsOf(html).some(s => s === "fortune-ai.js")) return "fortune-ai.js";
  if (freeInputs(html).length) return "free-text field in " + page + ".html";
  for (const s of ownScripts(html)) { try { if (freeInputs(fs.readFileSync(path.join(root, s), "utf8")).length) return "free-text field created by " + s; } catch (e) { /* missing */ } }
  return "";
}

// the takeover's roots (lensiq-crisis-takeover.js): [data-lq-result], [id$="Result"], [id$="Stats"]
const isRoot = n => "data-lq-result" in n.attrs || /(?:Result|Stats)$/.test(n.id);
const inRoot = chain => chain.some(isRoot);

/** the first <form> between the element and the root that holds it (the takeover keeps forms: content there stays visible) */
const formInside = chain => { for (const n of chain) { if (isRoot(n)) return null; if (n.tag === "form") return n; } return null; };

module.exports = { readingPages, ownScripts, scriptsOf, pageScriptsAll, writeTargets, freeInputs, entryPoint, ancestry, inRoot, isRoot, formInside, ROOTS: '[data-lq-result], [id$="Result"], [id$="Stats"]' };
