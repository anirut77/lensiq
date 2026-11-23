#!/usr/bin/env node
// tools/faceread-calibrate-mp.mjs — calibration of FRCore for the tier-1 engine (lensiq-face-mesh68.js, MediaPipe Face Landmarker)
// by the SAME method faceread.js documents for the face-api engine (NORMS comment): each photo through the page's own pipeline,
// photos that fail the page's quality check dropped, NORMS = [median, IQR / 1.349]; keys that depend on the hairline only on
// photos where the hairline was found; HAIR.fallbackRatio = median foreheadH; raw thresholds THRESH at the percentiles named
// next to each one in faceread.js (P25 / P75, eyes P10 / P90). z-based thresholds (zoneDom, typeZ, tiltZ, palaceZ) unchanged.
// Photos: the 34 DEV ids of the locked London split (neutral front), never the 68 test ids that C1 / C2 measure. Numbers only;
// no image is opened or viewed. Source class: public dataset (Face Research Lab London Set, CC BY 4.0).
// Needs WebGL for MediaPipe: Chrome runs with SwiftShader (the wrapper below, as tools/exam-face-eval.mjs does).
//   node tools/faceread-calibrate-mp.mjs   -> ~/LENSIQ-field/evals/faceread-90/calibration-mp.json (refuses to overwrite)
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { assertFreeSpace } from "./disk-guard.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PHASE = "faceread-90", DIR = phaseDir(PHASE), AF = phaseDir("attendance-face");
assertLocked(PHASE, ["london-manifest.jsonl", "london-split-protocol.json"]);
const OUT = join(DIR, "calibration-mp.json");
if (existsSync(OUT)) { console.error("calibration-mp.json exists; refusing to overwrite"); process.exit(2); }
const sha = b => createHash("sha256").update(b).digest("hex");
const MAN = readFileSync(join(DIR, "london-manifest.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
const DEV = JSON.parse(readFileSync(join(DIR, "london-split-protocol.json"), "utf8")).split.dev;

export function chromeWithWebGL() {
  const real = process.env.LQ_CHROME_REAL || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => existsSync(p));
  const w = join(mkdtempSync(join(tmpdir(), "lq-frmp-")), "chrome-webgl.sh");
  writeFileSync(w, ["#!/bin/bash", "args=()",
    `for a in "$@"; do case "$a" in --disable-webgl|--disable-3d-apis|--disable-gpu) ;; *) args+=("$a");; esac; done`,
    `exec ${JSON.stringify(real)} --use-angle=swiftshader --enable-unsafe-swiftshader "\${args[@]}"`, ""].join("\n"));
  chmodSync(w, 0o755);
  return w;
}
process.env.LQ_CHROME = chromeWithWebGL();
const { launch } = await import("../tests/e2e/cdp.mjs");
const { serve } = await import("./static-server.mjs");

const ONE = async (b64) => {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), img = new Image(), u = URL.createObjectURL(new Blob([bin], { type: "image/jpeg" }));
  await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = u; });
  // the page's upload path: longest side <= 1280 px
  const sc = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement("canvas");
  cv.width = Math.round(img.naturalWidth * sc); cv.height = Math.round(img.naturalHeight * sc);
  const g = cv.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(u);
  if (!window.__mp) window.__mp = await window.LQFaceMesh68.create();
  const list = window.LQFaceMesh68.detect(window.__mp, cv), F = window.FRCore;
  const pk = F.pickFace(list, null, cv.width, cv.height), d = pk.index >= 0 ? list[pk.index] : null;
  if (!d) return { face: false };
  const data = g.getImageData(0, 0, cv.width, cv.height);
  const q = F.quality(d, cv.width, cv.height, F.lightStats(data, d.box), list.length);
  const pass = q.length > 1 && q.every(x => x.ok || x.id === "light");
  const hair = F.estimateHairline(data, d.pts), m = F.measure(d.pts, hair);
  return { face: true, pass, hair: !!(hair && hair.point && !hair.estimated), m };
};

assertFreeSpace({ label: "tools/faceread-calibrate-mp.mjs" });
const { base, close } = await serve(repo);
const browser = await launch();
const rows = [];
try {
  const page = await browser.newPage(`${base}/faceread.html?lang=th`, { isolated: true, timeout: 60000 });
  await page.waitFor("!!window.FRCore", 30000);
  await page.evaluate(() => new Promise((ok, bad) => { const s = document.createElement("script"); s.src = "lensiq-face-mesh68.js"; s.onload = ok; s.onerror = bad; document.head.append(s); }));
  for (const id of DEV) {
    const m = MAN.find(r => r.id === id && r.view === "neutral_front"), b = readFileSync(join(AF, m.file));
    if (sha(b) !== m.sha256) throw new Error("sha256 mismatch " + m.file);
    rows.push({ id, ...(await page.evaluate(ONE, b.toString("base64"))) });
  }
} finally { await browser.close(); await close(); }

const HAIRKEYS = ["lengthRatio", "upperShare", "middleShare", "lowerShare", "foreheadH"];
const q = (a, p) => { const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r3 = v => +v.toPrecision(4);
const used = rows.filter(r => r.face && r.pass), withHair = used.filter(r => r.hair);
const KEYS = ["lengthRatio", "jawRatio", "foreheadRatio", "chinWidth", "chinAngle", "jawCorner", "lowerShare", "upperShare", "middleShare", "mlRatio",
  "browEye", "browGap", "browRise", "browArch", "interBrow", "eyeAspect", "eyeGap", "eyeTilt", "underEye", "templeW", "noseLen", "alarWidth", "noseBridge",
  "philtrumShare", "mouthW", "lipTotal", "lipRatio", "mouthTilt", "cheekProm", "cheekL", "cheekR", "foreheadH", "templeSpan", "jawLowW", "browAsym",
  "mouthAsym", "alarAsym", "eyeAsym"];
const NORMS = {};
for (const k of KEYS) { const v = (HAIRKEYS.includes(k) ? withHair : used).map(r => r.m[k]); NORMS[k] = [r3(q(v, 0.5)), r3((q(v, 0.75) - q(v, 0.25)) / 1.349)]; }
const col = k => used.map(r => r.m[k]);
const THRESH = {
  browHigh: r3(q(col("browGap"), 0.75)), browLow: r3(q(col("browGap"), 0.25)),
  eyeWide: r3(q(col("eyeGap"), 0.9)), eyeClose: r3(q(col("eyeGap"), 0.1)),
  mouthUp: r3(q(col("mouthTilt"), 0.75)),
  browGapWide: r3(q(col("interBrow"), 0.75)), browGapNarrow: r3(q(col("interBrow"), 0.25)),
  philLong: r3(q(col("philtrumShare"), 0.75)), philShort: r3(q(col("philtrumShare"), 0.25)),
  chinBroad: r3(q(col("chinWidth"), 0.75)), chinPointed: r3(q(col("chinWidth"), 0.25)),
  chinAngleBroad: r3(q(col("chinAngle"), 0.75)), chinAnglePointed: r3(q(col("chinAngle"), 0.25))
};
const out = { at: new Date().toISOString(), tool: "tools/faceread-calibrate-mp.mjs", source: "public dataset: London Set dev split (34 neutral fronts), CC BY 4.0",
  photos: rows.length, faceFound: rows.filter(r => r.face).length, passedQuality: used.length, hairlineFound: withHair.length,
  NORMS, THRESH, fallbackRatio: NORMS.foreheadH[0] };
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`photos ${out.photos}, face ${out.faceFound}, quality pass ${out.passedQuality}, hairline ${out.hairlineFound}`);
console.log(JSON.stringify({ NORMS, THRESH, fallbackRatio: out.fallbackRatio }));
