"use strict";
// tests/unit/legal-links.test.js — every public page links the Terms, the Privacy notice and Help: either in its own
// markup or through nav.js (legal footer for pages without a <footer>, missing links added to pages with one); the
// frame buster covers account / pricing / checkout and the camera pages.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const NAV = readFileSync(join(ROOT, "nav.js"), "utf8");
const pages = readdirSync(ROOT).filter(f => f.endsWith(".html") && f !== "admin.html");

test("nav.js legal footer covers terms / privacy / help, also for pages with their own footer", () => {
  for (const d of ["terms.html", "privacy.html", "help.html"]) assert.ok(NAV.includes(`"${d}"`) || NAV.includes(`href="${d}"`), d);
  assert.match(NAV, /footer:not\(\.lq-legal-foot\)/, "pages with a <footer> get missing links");
});

test("every page links terms, privacy and help (own markup or nav.js)", () => {
  const bad = [];
  for (const p of pages) {
    const html = readFileSync(join(ROOT, p), "utf8");
    if (/<script src="nav\.js/.test(html)) continue;
    for (const d of ["terms.html", "privacy.html", "help.html"]) if (!html.includes(`href="${d}`)) bad.push(`${p} -> ${d}`);
  }
  assert.deepEqual(bad, []);
});

test("account.html footer links terms (incl. refunds), privacy and help directly", () => {
  const html = readFileSync(join(ROOT, "account.html"), "utf8");
  const foot = html.slice(html.indexOf("<footer"));
  for (const d of ['href="terms.html"', 'href="terms.html#t9"', 'href="privacy.html"', 'href="help.html"']) assert.ok(foot.includes(d), d);
});

test("frame buster: account, pricing, checkout and the camera pages", () => {
  const m = NAV.match(/var NOFRAME = \/\^\(([^)]+)\)/);
  assert.ok(m, "NOFRAME list");
  const list = m[1].split("|");
  for (const p of ["account", "pricing", "checkout", "store", "booth", "photobooth", "studio", "attendance", "driver", "faceread", "palm", "qc", "signage", "customers", "interview", "neuro", "teamface"]) assert.ok(list.includes(p), p);
  for (const p of list) assert.ok(pages.includes(p + ".html"), p + ".html exists");
  // each of them loads nav.js (the buster lives there)
  for (const p of list) assert.match(readFileSync(join(ROOT, p + ".html"), "utf8"), /<script src="nav\.js/, p);
});
