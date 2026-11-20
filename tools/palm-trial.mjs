#!/usr/bin/env node
// tools/palm-trial.mjs — TRIAL of the palm v2 classical line finder on the owner's own photos (owner decision D-P2, 2026-11-19:
// a 1-2 day trial before the route-ข hours). A smoke look, NOT an accuracy measurement: two photos give no rate, and nothing
// measured here may be quoted as a number (acceptance sheet docs/acceptance/palm.md, field rows M1-M9 stay "not measured").
//
//   node tools/palm-trial.mjs [--landmarks] [photo ...]
//     photos: file names (or absolute paths) in ~/LENSIQ-field/evals/palm/owner-photos/ (default: every .jpg / .jpeg / .png there)
//     hand points per photo: "<photo>.taps.json" next to the photo = {"wrist":[x,y],"indexBase":[x,y],"pinkyBase":[x,y],
//       "indexTip":[x,y],"middleTip":[x,y],"ringTip":[x,y],"pinkyTip":[x,y]} in image pixels (the 7-tap mode, tier 1); without
//       it, --landmarks lets the MediaPipe hand model (tier 2-U, internal trial only, never in a customer build) find them.
//   Output (never in the repo): ~/Desktop/LENSIQ-review/palm/trial/<photo>-user.png (what a user would see: found solid,
//     "not found" dashed guide), <photo>-trial.png (every line the finder scored, minor lines included although they stay
//     guide-only in the product, with their confidence), trial.json + TRIAL.md (per photo, per school, per line: status, confidence).
// Locked sets persist (owner rule 2026-11-13): every input file (photos and .taps.json) must be locked first, hashes only in
// the repo — node tools/eval-guard.mjs lock palm__owner-photos <files>; git add evals-locks/palm__owner-photos.sha256; git commit.
// The guard (assertLocked) refuses to run otherwise. Photos are read from the field folder and passed to a headless page on
// 127.0.0.1 in memory; nothing is uploaded, nothing is written next to the photos, nothing is committed. One headless browser.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { assertFreeSpace } from "./disk-guard.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PHASE = "palm__owner-photos";
const DIR = phaseDir(PHASE);
const OUT = join(homedir(), "Desktop", "LENSIQ-review", "palm", "trial");
const args = process.argv.slice(2);
const useLm = args.includes("--landmarks");
let photos = args.filter(a => !a.startsWith("--")).map(a => isAbsolute(a) ? basename(a) : a);
if (!existsSync(DIR)) { console.error(`palm-trial: ${DIR} does not exist yet (the owner's photos go there)`); process.exit(2); }
if (!photos.length) photos = readdirSync(DIR).filter(f => /\.(jpe?g|png)$/i.test(f)).sort();
if (!photos.length) { console.error(`palm-trial: no photo in ${DIR}`); process.exit(2); }
const inputs = [];
for (const p of photos) { inputs.push(p); const t = p + ".taps.json"; if (existsSync(join(DIR, t))) inputs.push(t); else if (!useLm) {
  console.error(`palm-trial: ${t} missing (tap 7 points, or run with --landmarks)`); process.exit(2); } }
assertLocked(PHASE, inputs); // refuses unless every input is under the field folder and its sha256 is committed
assertFreeSpace({ label: "tools/palm-trial.mjs" });
mkdirSync(OUT, { recursive: true });

const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on("error", rej); s.listen(0, "127.0.0.1", () => { const { port } = s.address();
  s.close(() => res(port)); }); });
const port = await freePort();
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", repo], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 700));
const { launch } = await import(join(repo, "tests", "e2e", "cdp.mjs"));
const browser = await launch();
const report = { at: new Date().toISOString(), note: "TRIAL on the owner's photos: a smoke look, not an accuracy number", landmarks: useLm, photos: [] };
try {
  const init = ["window.LENSIQ_PALM_V2 = true; window.LENSIQ_PALM_LANDMARKS = true; window.LENSIQ_PROFILE = " + (useLm ? '"demo"' : '"commercial"') + ";"];
  const page = await browser.newPage(null, { initScripts: init, timeout: 60000 });
  await page.goto(`http://127.0.0.1:${port}/palm.html`);
  await page.waitFor("!!(window.PalmV2 && window.PalmV2.detect)", 20000);
  for (const name of photos) {
    const mime = /\.png$/i.test(name) ? "image/png" : "image/jpeg";
    const url = `data:${mime};base64,` + readFileSync(join(DIR, name)).toString("base64");
    const tf = join(DIR, name + ".taps.json"), taps = existsSync(tf) ? JSON.parse(readFileSync(tf, "utf8")) : null;
    const r = await page.evaluate(async (url, taps) => {
      const PV = window.PalmV2, im = new Image(); im.src = url; await im.decode();
      const W = im.naturalWidth, H = im.naturalHeight, c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").drawImage(im, 0, 0);
      let hand = null, source = "taps";
      if (taps) hand = PV.handFromTaps(taps);
      else if (window.__palm && window.__palm.loadModels) { await window.__palm.loadModels(); const h = await window.__palm.detectHand(c, false); if (h && h.pts) {
        hand = window.PalmCore.handFromLandmarks(h.pts);
        source = "landmarks (tier 2-U, trial only)"; } }
      if (!hand) return { error: "no hand points" };
      const F = PV.frameFromHand(hand);
      const corners = [[-0.4, -0.15], [1.35, -0.15], [1.35, 1.25], [-0.4, 1.25]].map(F.toImg);
      const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
      const rx = Math.max(0, Math.floor(Math.min(...xs))), ry = Math.max(0, Math.floor(Math.min(...ys)));
      const rw = Math.min(W, Math.ceil(Math.max(...xs))) - rx, rh = Math.min(H, Math.ceil(Math.max(...ys))) - ry, f = Math.min(1, 360 / F.pw);
      const cw = Math.round(rw * f), ch = Math.round(rh * f), k = document.createElement("canvas"); k.width = cw; k.height = ch;
      const g = k.getContext("2d"); g.drawImage(c, rx, ry, rw, rh, 0, 0, cw, ch);
      const px = g.getImageData(0, 0, cw, ch).data, mp = p => [(p[0] - rx) * f, (p[1] - ry) * f];
      const hc = { source: hand.source, wrist: mp(hand.wrist), mcp: { index: mp(hand.mcp.index), middle: mp(hand.mcp.middle), ring: mp(hand.mcp.ring), pinky: mp(hand.mcp.pinky) }, tip: {} };
      const det = PV.detect(px, cw, ch, hc, { school: "thai" });
      const out = { W, H, pw: Math.round(F.pw), source, ms: det.ms, lowRes: det.lowRes, schools: {} }, imgs = {};
      const scale = Math.min(1, 1400 / W), view = q => { const a = F.toImg(q); return [a[0] * scale, a[1] * scale]; };
      for (const school of PV.SCHOOLS) {
        const lines = school === "thai" ? det.lines : PV.classify(det._D, school), st = PV.newState({ school, asp: det.asp });
        PV.applyDetection(st, { lines, asp: det.asp });
        out.schools[school] = PV.LINES.map(id => ({ id, status: st.lines[id].status, conf: lines[id] ? lines[id].conf : 0, auto: PV.AUTO[id], threshold: PV.threshold(id) }));
        if (school !== "thai") continue;
        for (const kind of ["user", "trial"]) {
          const cv = document.createElement("canvas"); cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
          const x = cv.getContext("2d"); x.drawImage(c, 0, 0, cv.width, cv.height);
          let s2 = st;
          if (kind === "trial") { // every scored line at or above its threshold drawn solid, minor lines included (product: guide-only)
            s2 = PV.newState({ school, asp: det.asp });
            PV.LINES.forEach(id => { const L = lines[id]; if (L && L.cp && L.conf >= PV.threshold(id)) PV.setLine(s2, id, { status: "found", cp: L.cp }); });
          }
          PV.drawLineLayer(x, s2, "screen", { toPx: view, lang: "th", scale: Math.max(1, cv.width / 500) });
          x.setLineDash([]); x.globalAlpha = 1; x.fillStyle = "rgba(0,0,0,0.65)"; x.fillRect(0, 0, cv.width, 34);
          x.fillStyle = "#fff"; x.font = "16px sans-serif";
          x.fillText(kind === "trial" ? "TRIAL: every scored line >= threshold (minor lines are guide-only in the product)" : "What a user sees (found = solid, not found = dashed)", 8, 22);
          imgs[kind] = cv.toDataURL("image/png");
        }
      }
      return { out, imgs };
    }, url, taps);
    if (r.error) { console.error(`${name}: ${r.error}`); report.photos.push({ name, error: r.error }); continue; }
    const stem = name.replace(/\.[^.]+$/, "");
    for (const [kind, data] of Object.entries(r.imgs)) writeFileSync(join(OUT, `${stem}-${kind}.png`), Buffer.from(data.split(",")[1], "base64"));
    report.photos.push(Object.assign({ name }, r.out));
    console.log(`${name}: ${r.out.W}x${r.out.H}, palm width ${r.out.pw} px, ${r.out.ms} ms, hand points: ${r.out.source}`);
    for (const l of r.out.schools.thai) console.log(`  ${l.id.padEnd(9)} ${l.status.padEnd(16)} conf ${String(l.conf).padEnd(6)} ${l.auto ? "" : "(guide-only in v1)"}`);
  }
  await page.close();
} finally { await browser.close(); server.kill(); }
writeFileSync(join(OUT, "trial.json"), JSON.stringify(report, null, 2));
const md = ["# Palm v2 trial on the owner's photos", "",
  `Run ${report.at}. ${report.note}. Hand points: ${useLm ? "MediaPipe (tier 2-U, trial only) unless a .taps.json exists" : "7 taps (.taps.json)"}.`, ""];
for (const p of report.photos) {
  md.push(`## ${p.name}`, "");
  if (p.error) { md.push(`Error: ${p.error}`, ""); continue; }
  md.push(`${p.W} x ${p.H} px, palm width ${p.pw} px${p.lowRes ? " (below 350 px: minor lines not reliable)" : ""}, ${p.ms} ms. Overlays: ${p.name.replace(/\.[^.]+$/, "")}-user.png, -trial.png`, "");
  md.push("| line | Thai | Chinese | Western | conf (Thai) | v1 |", "|---|---|---|---|---|---|");
  for (let i = 0; i < p.schools.thai.length; i++) {
    const t = p.schools.thai[i];
    md.push(`| ${t.id} | ${t.status} | ${p.schools.chinese[i].status} | ${p.schools.western[i].status} | ${t.conf} (thr ${t.threshold}) | ${t.auto ? "auto" : "guide-only"} |`);
  }
  md.push("");
}
writeFileSync(join(OUT, "TRIAL.md"), md.join("\n"));
console.log("written: " + OUT);
