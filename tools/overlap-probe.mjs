#!/usr/bin/env node
// tools/overlap-probe.mjs — "nothing may cover a button" probe (owner order 2026-11-14, part D1). Visits every ./*.html
// (plus the demo-mode and API-on variants in EXTRA below) in TH, EN and 中文 at four viewports (360×640, 375×667,
// 414×736 phones, 1280×800 desktop) and, at each viewport, in two states: the initial state (scrolled to the top) and
// after scrolling to the bottom of the page.
//
// Method, per state: every visible tappable control (a[href], button, input, select, textarea, summary, [role=button],
// a label of an input) whose centre is inside the viewport is hit-tested with document.elementFromPoint at its centre.
// It is COVERED when the hit element is neither the control nor its descendant (nor the control's label / labelled
// control) and belongs to a fixed or sticky ancestor that does not contain the control (sticky bars, notices, the pinned
// help-line bar, consent / analytics prompts, floating buttons, the device-fit notice, toasts …).
//   literal   every covered control (the owner's method as written; reported, not gated)
//   blocking  a covered control that stays covered after trying to scroll it clear: the probe scrolls the window (and
//             any scrolling ancestor) so the control's centre sits at 50 %, 35 % and 65 % of the viewport height, and
//             hit-tests again; the scroll is restored afterwards. A control that ends up clear somewhere is only
//             scrolled UNDER a docked bar (a sticky header, a bottom bar) and can be tapped after a normal scroll; a
//             control that can never be cleared is blocked: the last controls of a page under a bottom bar without
//             page padding, a control under a floating button or prompt that moves with the viewport, a control inside a
//             bar that another bar sits on. tests/e2e/overlap-kit.mjs gates "blocking" at 0.
// Stricter rules (overlap-d2, coordinator order 2026-11-15 after the independent review of overlap-d):
//   prompt     a control covered by the analytics consent prompt ([data-lq-analytics-banner]) is BLOCKING even when a
//              scroll would clear it: paying, reading or any other action must never depend on answering the prompt
//   protected  a PINNED help line (.lq-helpline, its tel links) or crisis support card (.fa-support), i.e. fixed, or sticky
//              and stuck at its top / bottom offset (the calm help line docked under a reading), must stay reachable at all
//              times: covered at the top, at the bottom OR at any of STEPS evenly spaced scroll positions in between (each
//              viewport) is BLOCKING, never excused by a scroll. A help line in the page flow may scroll under the site
//              header like any content (normal rule), but under the consent prompt it is always blocking (prompt rule)
//   targets    + checkout.html with the API and analytics on (the pay bar and the prompt together) and tarot.html after a
//              three-card reading in a calm session with the API and analytics on (the sticky calm help line)
// Not counted: controls behind a full-screen overlay (>= 85 % of the viewport, a modal by design) or outside an open
// modal <dialog>, inert subtrees, controls whose centre is outside the viewport, pointer-events:none overlays (they do not
// block a tap; elementFromPoint passes through them).
//
// Order per target and language: load at 360×640 -> top, bottom -> resize to 375×667 -> top, bottom -> 414×736 -> 1280×800.
//
//   node tools/overlap-probe.mjs                      all targets, summary on stdout
//   node tools/overlap-probe.mjs exam gate            only targets whose id contains a word
//   node tools/overlap-probe.mjs --json out.json      full result as JSON
//   node tools/overlap-probe.mjs --details            list the covered controls
// The command line measures only with the locked probe (tools/eval-guard.mjs assertLocked, phase overlap-d2): the repo
// copies of the probe and the gate must equal the locked copies in ~/LENSIQ-field/evals/overlap-d2/.
// Library: import { TARGETS, LANGS, VIEWPORTS, probeTarget } from "./overlap-probe.mjs" (tests/e2e/overlap-kit.mjs).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const LANGS = ["th", "en", "zh"];
export const VIEWPORTS = [
  { id: "360", width: 360, height: 640, mobile: true },
  { id: "375", width: 375, height: 667, mobile: true },
  { id: "414", width: 414, height: 736, mobile: true },
  { id: "1280", width: 1280, height: 800, mobile: false }
];
export const STATES = ["top", "bottom"];
// no dialog ever blocks the probe; no camera prompt is answered (Chrome's fake device)
export const INIT = "window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;";
// API on (as on the pages listed in deploy/public-site.json, with analytics switched on): loads lensiq-api.js, the
// analytics consent prompt and the member chip; the address is unreachable on purpose (nothing is sent anywhere)
const API_INIT = "window.LENSIQ_API_BASE='http://127.0.0.1:9';";
// calm session of the fortune pages (fortune-crisis.js, crisis fix 4): the reading's help line is docked (sticky)
const CALM_INIT = "try { sessionStorage.setItem('lq-fortune-calm', '1'); } catch (e) {}";
export const STEPS = 40;
const PROTECTED = ".lq-helpline, .fa-support";
// "stuck" = a fixed help line / card, or a sticky one at its top / bottom offset (the calm help line docked at the bottom of
// the viewport while its reading is on screen); a help line in the page flow may scroll under the site header like any
// other content, but is never excused under the consent prompt
const PROMPT = "[data-lq-analytics-banner]";
const HTML = readdirSync(repo).filter(f => f.endsWith(".html")).sort();
const DEMO = HTML.filter(f => /lensiq-demo\.js/.test(readFileSync(join(repo, f), "utf8")));
// targets: every page as served, every page with the sales demo (?demo=1: the fixed sample-data bar), and the pages
// that carry the API on the live site (deploy/public-site.json) with the API and analytics on (consent prompt)
export const EXTRA = [
  ...DEMO.map(f => ({ id: `${f}?demo=1`, page: f, query: "&demo=1", init: [] })),
  ...["index.html", "medicine.html"].map(f => ({ id: `${f}+api`, page: f, query: "", init: [API_INIT] })),
  // overlap-d2: the pay bar with the consent prompt; the sticky calm help line after a reading, with the consent prompt
  { id: "checkout.html+api", page: "checkout.html", query: "", init: [API_INIT] },
  { id: "tarot.html+calm+api", page: "tarot.html", query: "", init: [API_INIT, CALM_INIT], act: "tarot-reading" }
];
export const TARGETS = [...HTML.map(f => ({ id: f, page: f, query: f === "insights.html" ? "&demo" : "", init: [] })), ...EXTRA];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Runs inside the page: covered controls in the current state (o.steps: also scan STEPS scroll positions for the
// protected help line / crisis card and for the prompt; the scroll is restored afterwards).
function inPage(o) {
  const W = document.documentElement.clientWidth, H = window.innerHeight;
  const SEL = "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],label";
  const cs = el => getComputedStyle(el);
  const name = el => {
    const t = (el.getAttribute("aria-label") || el.textContent || el.value || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 28);
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls}${t ? ` "${t}"` : ""}`;
  };
  const visible = el => {
    if (!el.getClientRects().length) return false;
    if (cs(el).visibility !== "visible") return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) if (+cs(p).opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  };
  const modal = document.querySelector("dialog:modal");
  // a help line / crisis card that is pinned and currently stuck at its offset (fixed, or sticky at its top / bottom
  // edge): it must never be covered; a help line in the page flow follows the normal rule (and never the prompt)
  const prot = el => {
    const box = el.closest(o.protectedSel);
    if (!box) return false;
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
      const s2 = getComputedStyle(p);
      if (s2.position === "fixed") return true;
      if (s2.position === "sticky") {
        const r = p.getBoundingClientRect(), b = parseFloat(s2.bottom), t = parseFloat(s2.top);
        if ((!isNaN(b) && Math.abs(r.bottom - (H - b)) < 2) || (!isNaN(t) && Math.abs(r.top - t) < 2)) return true;
      }
      if (p === box) break;
    }
    return false;
  };
  const controls = [...document.querySelectorAll(SEL + "," + o.protectedSel + ",.lq-helpline-tel")].filter(el => {
    if (el.tagName === "LABEL" && !el.control) return false;
    if (el.closest("[inert]") || (modal && !modal.contains(el))) return false;
    return visible(el);
  });
  const pinned = el => { for (let p = el; p && p.nodeType === 1; p = p.parentElement) { const pos = cs(p).position; if (pos === "fixed" || pos === "sticky") return p; } return null; };
  const centre = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const inView = c => c.x >= 0 && c.x < W && c.y >= 0 && c.y < H;
  const related = (el, hit) => {
    if (hit === el || el.contains(hit)) return true;
    const lab = hit.closest("label");
    if (lab && lab.control === el) return true; // the input's own label: tapping it reaches the input
    if (el.tagName === "LABEL" && el.control && (hit === el.control || el.control.contains(hit))) return true;
    return false;
  };
  // null = clear, "modal" = behind a full-screen overlay, else the covering bar
  const coverOf = el => {
    const c = centre(el);
    if (!inView(c)) return "out";
    const hit = document.elementFromPoint(c.x, c.y);
    if (!hit || related(el, hit)) return null;
    const bar = pinned(hit);
    if (!bar || bar.contains(el)) return null;
    const r = bar.getBoundingClientRect();
    const area = Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0));
    if (area >= 0.85 * W * H) return "modal";
    return { bar, hit };
  };
  const scrollers = el => {
    const out = [];
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const s = cs(p);
      if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (p.scrollHeight > p.clientHeight || p.scrollWidth > p.clientWidth)) out.push(p);
    }
    return out;
  };
  const literal = [], blocking = [];
  let checked = 0, modals = 0;
  for (const el of controls) {
    const cov = coverOf(el);
    if (cov === "out") continue;
    checked++;
    if (cov === null) continue;
    if (cov === "modal") { modals++; continue; }
    const item = `${name(el)} under ${name(cov.bar)}`;
    literal.push(item);
    // the consent prompt and the help line / crisis card: never excused by a scroll
    if (cov.bar.matches(o.promptSel) || cov.bar.closest(o.promptSel) || prot(el)) { blocking.push(item + (prot(el) ? " [help line / crisis card]" : " [consent prompt]")); continue; }
    // try to scroll it clear (window + scrolling ancestors), then restore every scroll position
    const sx = window.scrollX, sy = window.scrollY, inner = scrollers(el).map(p => [p, p.scrollTop, p.scrollLeft]);
    let clear = false;
    for (const f of [0.5, 0.35, 0.65]) {
      for (const [p] of inner) {
        const pr = p.getBoundingClientRect(), r = el.getBoundingClientRect();
        p.scrollTop += (r.top + r.height / 2) - (pr.top + pr.height / 2);
        p.scrollLeft += (r.left + r.width / 2) - (pr.left + pr.width / 2);
      }
      const c = centre(el);
      window.scrollTo({ left: window.scrollX, top: window.scrollY + c.y - f * H, behavior: "instant" });
      const again = coverOf(el);
      if (again === null || again === "modal") { clear = true; break; }
    }
    for (const [p, t, l] of inner) { p.scrollTop = t; p.scrollLeft = l; }
    window.scrollTo({ left: sx, top: sy, behavior: "instant" });
    if (!clear) blocking.push(item);
  }
  if (o.steps && document.querySelector(o.protectedSel + "," + o.promptSel)) {
    // every STEPS-th of the page: the help line / crisis card and every control under the prompt, at each scroll position
    const sx = window.scrollX, sy = window.scrollY;
    const max = Math.max(0, document.documentElement.scrollHeight - H);
    const seen = new Set(blocking);
    for (let i = 0; i <= o.steps; i++) {
      window.scrollTo({ left: 0, top: Math.round(max * i / o.steps), behavior: "instant" });
      for (const el of controls) {
        const cov = coverOf(el);
        if (!cov || cov === "out" || cov === "modal") continue;
        const byPrompt = !!cov.bar.closest(o.promptSel);
        if (!prot(el) && !byPrompt) continue;
        const item = `${name(el)} under ${name(cov.bar)}` + (prot(el) ? " [help line / crisis card]" : " [consent prompt]");
        if (seen.has(item)) continue;
        seen.add(item);
        blocking.push(item + ` (scroll step ${i}/${o.steps})`);
      }
    }
    window.scrollTo({ left: sx, top: sy, behavior: "instant" });
  }
  return { checked, modals, literal, blocking };
}

/** One target in one language at every viewport and state.
 * @returns {Promise<Record<string, {checked:number, modals:number, literal:string[], blocking:string[]}>>} keyed "<vp>/<state>" */
export async function probeTarget(browser, base, target, lang) {
  const p = await browser.newPage(null, { initScripts: [INIT, ...target.init], isolated: true });
  const res = {};
  try {
    const v0 = VIEWPORTS[0];
    await p.send("Emulation.setDeviceMetricsOverride", { width: v0.width, height: v0.height, deviceScaleFactor: 1, mobile: v0.mobile });
    await p.goto(`${base}/${target.page}?cpu&nosw&lang=${lang}${target.query}`);
    const htmlLang = lang === "zh" ? "zh-Hans" : lang;
    const ready = `document.readyState === "complete" && (!document.getElementById("siteNav") || (window.LQI18N && document.documentElement.lang === ${JSON.stringify(htmlLang)}))`;
    await p.waitFor(ready, 10000).catch(() => null);
    await sleep(900);
    if (target.act === "tarot-reading") {
      // a three-card love reading, as tests/e2e/fortune-en.e2e.mjs; in the calm session its help line is docked (sticky)
      await p.evaluate(() => { document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click(); document.getElementById("trStart").click(); });
      await sleep(600);
      await p.evaluate(() => document.getElementById("trAuto").click());
      await sleep(900);
      await p.evaluate(() => document.getElementById("trReveal").click());
      await p.waitFor(`document.querySelectorAll(".fa-section").length >= 3 && !document.querySelector(".fa-loading, [aria-busy=true] .fa-section")`, 25000);
      await sleep(400);
    }
    const opts = { protectedSel: PROTECTED, promptSel: PROMPT, steps: 0 };
    for (const vp of VIEWPORTS) {
      if (vp !== v0) {
        await p.send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile });
        await sleep(250);
      }
      await p.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
      await sleep(120);
      res[`${vp.id}/top`] = await p.evaluate(inPage, { ...opts, steps: STEPS });
      await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: "instant" }));
      await sleep(250);
      await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: "instant" }));
      await sleep(60);
      res[`${vp.id}/bottom`] = await p.evaluate(inPage, opts);
    }
  } finally { await p.close(); }
  return res;
}

// the files of the locked set (evals-locks/overlap-d2.sha256); the command line refuses to measure with any other copy
export const LOCKED = ["tools/overlap-probe.mjs", "tests/e2e/overlap-kit.mjs", "tests/e2e/overlap-exceptions.json"];

async function main() {
  const { assertLocked } = await import("./eval-guard.mjs");
  try {
    const g = assertLocked("overlap-d2", LOCKED);
    const sha = f => createHash("sha256").update(readFileSync(f)).digest("hex");
    for (const f of LOCKED) {
      const want = g.files.find(x => x.path.endsWith("/" + f));
      if (!want || sha(join(repo, f)) !== want.sha256) throw new Error(`eval-guard: ${f} in the repo differs from the locked copy (${g.lockFile}); re-lock before measuring`);
    }
    console.error(`eval-guard OK: phase overlap-d2, ${LOCKED.length} files (commit ${g.lockCommit})`);
  } catch (e) { console.error(String((e && e.message) || e)); process.exit(2); }
  const { launch } = await import("../tests/e2e/cdp.mjs");
  const { serve } = await import("./static-server.mjs");
  const argv = process.argv.slice(2);
  const jsonAt = argv.indexOf("--json"), jsonOut = jsonAt >= 0 ? argv[jsonAt + 1] : null;
  const details = argv.includes("--details");
  const words = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--json");
  const targets = TARGETS.filter(t => !words.length || words.some(w => t.id.includes(w)));
  const srv = await serve(repo);
  const browser = await launch();
  const rows = [];
  const t0 = Date.now();
  try {
    for (const t of targets) for (const lang of LANGS) {
      const s = Date.now();
      const r = await probeTarget(browser, srv.base, t, lang);
      for (const [k, v] of Object.entries(r)) rows.push({ target: t.id, lang, at: k, checked: v.checked, modals: v.modals, literal: v.literal, blocking: v.blocking });
      const lit = Object.values(r).reduce((n, v) => n + v.literal.length, 0), blk = Object.values(r).reduce((n, v) => n + v.blocking.length, 0);
      const per = VIEWPORTS.map(vp => `${vp.id}:${r[vp.id + "/top"].blocking.length}+${r[vp.id + "/bottom"].blocking.length}`).join(" ");
      console.log(`${t.id.padEnd(26)} ${lang}  blocking ${String(blk).padStart(3)}  literal ${String(lit).padStart(3)}   [${per}]  ${Date.now() - s} ms`);
      if (details) for (const [k, v] of Object.entries(r)) {
        for (const f of v.blocking) console.log(`      ${k} BLOCKING ${f}`);
        for (const f of v.literal) if (!v.blocking.includes(f)) console.log(`      ${k} scroll-clear ${f}`);
      }
    }
  } finally { await browser.close(); await srv.close(); }
  const blk = rows.reduce((n, r) => n + r.blocking.length, 0), lit = rows.reduce((n, r) => n + r.literal.length, 0);
  console.log(`\n${targets.length} target(s) x ${LANGS.length} languages x ${VIEWPORTS.length} viewports x 2 states: blocking ${blk}, literal ${lit} — ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (jsonOut) { writeFileSync(jsonOut, JSON.stringify({ when: new Date().toISOString(), blocking: blk, literal: lit, rows }, null, 1)); console.log("wrote " + jsonOut); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
