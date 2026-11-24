#!/usr/bin/env node
// tools/faceread-consistency-eval.mjs — acceptance rows C1 and C2 of docs/acceptance/faceread.md (targets copied, not changed).
// MEASURES ONLY: it changes no product file. Protocol (fixed before any measurement): ~/LENSIQ-field/evals/faceread-90/protocol.json,
// locked with this harness in evals-locks/faceread-90.sha256; assertLocked() refuses to run otherwise. Images: Face Research Lab
// London Set (CC BY 4.0) from the locked attendance-face manifest; each image's sha256 is checked against that manifest before use.
// No image is opened or viewed by a person or an agent; only numbers and trait values are written. Source class: public dataset.
//
// C1  same image -> identical reading: run A (fresh page, list order) vs run B (new isolated context, reversed order); TH on 136
//     images (neutral + smiling front of the 68 test ids), EN and ZH on the first 30 neutral fronts. Identical = #frResult innerText
//     and the recorded traits are equal. Pass: 100 % in every language and >= 30 TH images with a reading.
// C2  5 captures per person (2 photos + 3 camera-like variations, protocol "captures"), 8 headline traits; a trait is unchanged
//     when all 5 captures agree; a capture with no reading makes all 8 changed. Pass: >= 80 % unchanged, >= 50 people.
//
//   node tools/faceread-consistency-eval.mjs [--only=c1|c2] [--limit=N] [--json out]
// Exit 0 = both pass, 1 = a target missed, 2 = invalid run (see protocol "invalid_run").
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { assertFreeSpace } from "./disk-guard.mjs";
import { serve } from "./static-server.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PHASE = "faceread-90", DIR = phaseDir(PHASE), AF = phaseDir("attendance-face");
// RE-LOCK v2 (2026-11-23, before any measurement: v1 refused to run because evals-locks/attendance-face.sha256 is not on main):
// byte-identical copies of the attendance-face manifest and split (same sha256 as that phase's field lock, d97a65c0… / 0ca1c41b…)
// are locked in THIS phase as london-manifest.jsonl and london-split-protocol.json. Nothing else changed.
assertLocked(PHASE, ["protocol.json", "faceread-consistency-eval.mjs", "london-manifest.jsonl", "london-split-protocol.json"]);
const argv = process.argv.slice(2);
const arg = (n, d) => { const a = argv.find(x => x.startsWith("--" + n + "=")); return a ? a.slice(n.length + 3) : d; };
const ONLY = arg("only", ""), LIMIT = +arg("limit", 0) || 0;
// RE-LOCK v3 (2026-11-23, after the v2 baseline on face-api, before any tier-1 measurement): --engine=faceapi|mp picks the page's
// face model through faceread.html?frengine= (localhost only); default faceapi = the v2 run. mp (MediaPipe Face Landmarker) needs
// WebGL, so Chrome then runs with SwiftShader (as tools/exam-face-eval.mjs). Same protocol, sets, definitions and targets.
const ENGINE = arg("engine", "faceapi");
if (!["faceapi", "mp"].includes(ENGINE)) { console.error("--engine must be faceapi or mp"); process.exit(2); }
if (ENGINE === "mp") {
  const { chmodSync, mkdtempSync } = await import("node:fs"), { tmpdir } = await import("node:os"), { existsSync } = await import("node:fs");
  const real = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => existsSync(p));
  const w = join(mkdtempSync(join(tmpdir(), "lq-frc-")), "chrome-webgl.sh");
  writeFileSync(w, ["#!/bin/bash", "args=()", `for a in "$@"; do case "$a" in --disable-webgl|--disable-3d-apis|--disable-gpu) ;; *) args+=("$a");; esac; done`,
    `exec ${JSON.stringify(real)} --use-angle=swiftshader --enable-unsafe-swiftshader "\${args[@]}"`, ""].join("\n"));
  chmodSync(w, 0o755); process.env.LQ_CHROME = w;
}
const { launch } = await import("../tests/e2e/cdp.mjs");
const sha = b => createHash("sha256").update(b).digest("hex");

const MAN = readFileSync(join(DIR, "london-manifest.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
let TEST = JSON.parse(readFileSync(join(DIR, "london-split-protocol.json"), "utf8")).split.test;
if (LIMIT) TEST = TEST.slice(0, LIMIT);
const imageOf = (id, view) => {
  const m = MAN.find(r => r.id === id && r.view === view);
  if (!m) throw Object.assign(new Error(`no manifest line for ${id} ${view}`), { invalid: true });
  const b = readFileSync(join(AF, m.file));
  if (sha(b) !== m.sha256) throw Object.assign(new Error(`sha256 mismatch for ${m.file}`), { invalid: true });
  return b.toString("base64");
};
const TRAITS = ["element", "zone", "brow", "eye", "nose", "mouth", "yintang", "chin"];
const CAPS = [["c1", "neutral_front", "orig"], ["c2", "smiling_front", "orig"], ["c3", "neutral_front", "land"], ["c4", "smiling_front", "port"], ["c5", "neutral_front", "expo"]];

// In-page: build the capture, feed it through the real upload input, wait for the reading (or the page's stop line).
const READ = async (b64, make) => {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  let blob = new Blob([bin], { type: "image/jpeg" });
  if (make !== "orig") {
    const img = new Image(); const u = URL.createObjectURL(blob);
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = u; });
    const cv = document.createElement("canvas"), g = cv.getContext("2d");
    if (make === "land") { cv.width = 1280; cv.height = 960; g.fillStyle = "#808080"; g.fillRect(0, 0, 1280, 960); g.drawImage(img, 120, 30, 900, 900); }
    else if (make === "port") { cv.width = 960; cv.height = 1280; g.fillStyle = "#808080"; g.fillRect(0, 0, 960, 1280); g.drawImage(img, 60, 160, 860, 860); }
    else { cv.width = img.naturalWidth; cv.height = img.naturalHeight; g.filter = "brightness(0.85) contrast(0.9)"; g.drawImage(img, 0, 0); }
    URL.revokeObjectURL(u);
    blob = await new Promise(r => cv.toBlob(r, "image/jpeg", make === "expo" ? 0.8 : 0.92));
  }
  if (!window.__frWrapped) {
    const F = window.FRCore, orig = F.analyze;
    F.analyze = function () { const r = orig.apply(this, arguments); window.__lastR = r; return r; };
    window.__frWrapped = true;
  }
  window.__lastR = null;
  const inp = document.querySelector("#frFile"), dt = new DataTransfer();
  dt.items.add(new File([blob], "capture.jpg", { type: "image/jpeg" }));
  inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true }));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const eng = () => document.querySelector("#frEngine");
  let q = true; const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    await sleep(50);
    if (window.__lastR) break;
    const f = document.querySelector("#frForce");
    if (f && !f.hidden) { q = false; f.click(); continue; }
    if (eng().classList.contains("err") && !(f && !f.hidden)) return { reading: false, stop: eng().textContent.slice(0, 120) };
  }
  if (!window.__lastR) return { reading: false, stop: "timeout" };
  const narr = document.querySelector("#frNarr");
  while (Date.now() - t0 < 90000 && (narr.getAttribute("aria-busy") === "true" || !narr.textContent.trim())) await sleep(50);
  await sleep(250);
  const R = window.__lastR, c = R.cls;
  return {
    reading: true, q,
    traits: { element: R.el.top.id, zone: c.zones.dominant || "balanced", brow: c.brow.cat, eye: c.eye.cat, nose: c.nose.cat, mouth: c.mouth.cat, yintang: c.yintang.cat, chin: c.chin.cat },
    ranking: R.el.ranked.map(x => x.id).join(","),
    text: document.querySelector("#frResult").innerText
  };
};

async function session(browser, base, lang) {
  const page = await browser.newPage(`${base}/faceread.html?lang=${lang}&frengine=${ENGINE}`, { isolated: true, timeout: 60000 });
  await page.waitFor("!!window.FRCore && !!document.querySelector('#frFile')", 30000);
  return page;
}
const readOn = (page, b64, make) => page.evaluate(READ, b64, make);

// RE-LOCK v4 (2026-11-23, before any further run): the disk guard before the browser (tests/unit/disk-guard.test.js); nothing else changed.
assertFreeSpace({ label: "tools/faceread-consistency-eval.mjs" });
const { base, close } = await serve(repo);
const browser = await launch();
const out = { at: new Date().toISOString(), head: "", protocol: "faceread-90 v1", engine: ENGINE, source: "public dataset (London Set, CC BY 4.0), headless Chrome without WebGL", c1: null, c2: null };
let invalid = false;
try {
  const { execFileSync } = await import("node:child_process");
  out.head = execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"]).toString().trim();
  if (ONLY !== "c2") {
    const sets = { th: TEST.flatMap(id => [[id, "neutral_front"], [id, "smiling_front"]]), en: TEST.slice(0, 30).map(id => [id, "neutral_front"]), zh: TEST.slice(0, 30).map(id => [id, "neutral_front"]) };
    out.c1 = {};
    for (const [lang, list] of Object.entries(sets)) {
      const A = {}, B = {};
      let p = await session(browser, base, lang);
      for (const [id, v] of list) A[id + "/" + v] = await readOn(p, imageOf(id, v), "orig");
      await p.close();
      p = await session(browser, base, lang);
      for (const [id, v] of [...list].reverse()) B[id + "/" + v] = await readOn(p, imageOf(id, v), "orig");
      await p.close();
      let withReading = 0, identical = 0, none = 0; const diff = [];
      for (const k of Object.keys(A)) {
        const a = A[k], b = B[k];
        if (!a.reading && !b.reading) { none++; continue; }
        withReading++;
        const same = a.reading && b.reading && a.text === b.text && JSON.stringify(a.traits) === JSON.stringify(b.traits) && a.ranking === b.ranking;
        if (same) identical++; else diff.push(k);
      }
      out.c1[lang] = { images: list.length, withReading, identical, noReadingBoth: none, notIdentical: diff, qFalse: Object.values(A).filter(r => r.reading && !r.q).length };
      console.log(`C1 ${lang}: ${identical}/${withReading} identical (${none} with no reading in both runs)`);
    }
    out.c1.pass = ["th", "en", "zh"].every(l => out.c1[l].withReading > 0 && out.c1[l].identical === out.c1[l].withReading) && out.c1.th.withReading >= 30;
    if (out.c1.th.withReading < 30 && !LIMIT) invalid = true;
  }
  if (ONLY !== "c1") {
    const p = await session(browser, base, "th");
    const people = [];
    for (const id of TEST) {
      const caps = [];
      for (const [cid, view, make] of CAPS) { const r = await readOn(p, imageOf(id, view), make); caps.push({ id: cid, reading: r.reading, q: r.q, traits: r.traits || null, stop: r.stop }); }
      people.push({ id, caps });
    }
    await p.close();
    let unchanged = 0; const perTrait = Object.fromEntries(TRAITS.map(t => [t, 0])); let modeAgree = 0, modeN = 0, anyReading = 0;
    for (const pp of people) {
      const ok = pp.caps.every(c => c.reading);
      if (pp.caps.some(c => c.reading)) anyReading++;
      for (const t of TRAITS) {
        const vals = pp.caps.map(c => c.reading ? c.traits[t] : null);
        if (ok && vals.every(v => v === vals[0])) { unchanged++; perTrait[t]++; }
        const cnt = {}; vals.filter(v => v != null).forEach(v => { cnt[v] = (cnt[v] || 0) + 1; });
        modeAgree += Math.max(0, ...Object.values(cnt)); modeN += vals.length;
      }
    }
    const share = unchanged / (TRAITS.length * people.length);
    out.c2 = { people: people.length, peopleWithAnyReading: anyReading, unchanged, total: TRAITS.length * people.length, share: +share.toFixed(4),
      perTrait: Object.fromEntries(TRAITS.map(t => [t, +(perTrait[t] / people.length).toFixed(3)])), modeAgreement: +(modeAgree / modeN).toFixed(4),
      capturesNoReading: people.flatMap(pp => pp.caps.filter(c => !c.reading).map(c => pp.id + "/" + c.id)),
      capturesQFalse: people.reduce((n, pp) => n + pp.caps.filter(c => c.reading && !c.q).length, 0),
      perPerson: people.map(pp => ({ id: pp.id, caps: pp.caps.map(c => c.reading ? TRAITS.map(t => c.traits[t]).join("|") + (c.q ? "" : " q=false") : "no reading") })) };
    out.c2.pass = share >= 0.8 && people.length >= 50;
    if (anyReading < 50 && !LIMIT) invalid = true;
    console.log(`C2: ${(share * 100).toFixed(1)} % unchanged (${unchanged}/${TRAITS.length * people.length}), ${people.length} people; per trait ${JSON.stringify(out.c2.perTrait)}; mode agreement ${(out.c2.modeAgreement * 100).toFixed(1)} %`);
  }
} catch (e) {
  console.error(e); invalid = true; out.error = String(e && e.message || e);
} finally { await browser.close(); await close(); }
mkdirSync(join(DIR, "results"), { recursive: true });
const file = arg("json", join(DIR, "results", `consistency-${ENGINE}-${out.at.replace(/[:.]/g, "-")}${LIMIT ? "-limit" + LIMIT : ""}.json`));
writeFileSync(file, JSON.stringify(out, null, 1));
console.log("written " + file);
const pass = (!out.c1 || out.c1.pass) && (!out.c2 || out.c2.pass);
process.exit(invalid ? 2 : pass ? 0 : 1);
