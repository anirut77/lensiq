"use strict";
// tests/unit/attendance-preload.test.js — guards the Attendance S2 load order (2026-11-18). A CSP <meta> turns off Chrome's
// preload scanner, so attendance.html lists its PIN / QR scripts as <link rel="preload">. A preload whose URL drifts from its
// <script src> (a ?v= bump) would download the file twice; this test fails first. Also: no face-api.js page script (it is
// loaded only when face is chosen) and the PIN / QR time clock runs before the face check-in part.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "attendance.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const preloads = [...html.matchAll(/<link rel="preload" as="script" href="([^"]+)">/g)].map(m => m[1]);

test("every script preload matches a script tag, or a file nav.js adds with nav.js's own ?v=", () => {
  const nav = scripts.find(s => s.startsWith("nav.js"));
  const q = nav.slice(nav.indexOf("?"));
  const injected = ["lensiq-i18n.js" + q, "i18n/zh-common.js" + q];
  assert.ok(preloads.length >= 10, "preloads present");
  for (const p of preloads) assert.ok(scripts.includes(p) || injected.includes(p), "preload without a matching script: " + p);
  assert.equal(new Set(preloads).size, preloads.length, "no duplicate preload");
});

test("no face-api.js page script; the PIN / QR scripts come before the face check-in part", () => {
  assert.ok(!scripts.some(s => /face-api/.test(s)) && !preloads.some(s => /face-api/.test(s)));
  const at = n => scripts.findIndex(s => s.startsWith(n + "?"));
  for (const n of ["lensiq-timeclock.js", "attendance-qr.js", "attendance-hr.js"]) assert.ok(at(n) >= 0 && at(n) < at("attendance.js"), n + " before attendance.js");
  assert.match(fs.readFileSync(path.join(ROOT, "attendance.js"), "utf8"), /s\.src = "vendor\/face-api\.js"/, "attendance.js loads face-api.js on demand");
});
