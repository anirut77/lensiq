#!/usr/bin/env node
// tools/palm-v3-landmarks.mjs — palm v3 line-finder SPIKE (owner order 2026-11-20), development only. Runs the page's own hand
// landmark model (MediaPipe, tier 2-U, trial only) ONCE per owner development photo in one headless Chrome on this Mac and writes
// the 21 landmarks + the hand frame (numbers only, no pixels) to the file named by --out (outside the repo). The photos are read
// from ~/LENSIQ-field/evals/palm/owner-photos/ after the eval-guard check, never copied, never uploaded, never modified.
// These numbers are for development overlays only: never an accuracy figure.
//   node tools/palm-v3-landmarks.mjs --out <file.json> <photo ...>
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { assertFreeSpace } from "./disk-guard.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PHASE = "palm__owner-photos";
const args = process.argv.slice(2), oi = args.indexOf("--out");
const out = oi >= 0 ? args[oi + 1] : null;
const photos = args.filter((a, i) => !a.startsWith("--") && i !== oi + 1);
if (!out || !photos.length) { console.error("usage: palm-v3-landmarks.mjs --out <file.json> <photo ...>"); process.exit(2); }
if (resolve(out).startsWith(repo)) { console.error("palm-v3-landmarks: --out must be outside the repo"); process.exit(2); }
assertLocked(PHASE, photos);
assertFreeSpace({ label: "tools/palm-v3-landmarks.mjs" });
const DIR = phaseDir(PHASE);
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on("error", rej); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });
const port = await freePort();
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", repo], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 700));
const { launch } = await import(join(repo, "tests", "e2e", "cdp.mjs"));
const browser = await launch();
const result = { note: "palm v3 spike: landmarks of the owner's development photos, numbers only, local only, never an accuracy figure", photos: {} };
try {
  const init = ['window.LENSIQ_PALM_V2 = true; window.LENSIQ_PALM_LANDMARKS = true; window.LENSIQ_PROFILE = "demo";'];
  const page = await browser.newPage(null, { initScripts: init, timeout: 240000 });
  await page.goto(`http://127.0.0.1:${port}/palm.html`);
  await page.waitFor("!!(window.PalmV2 && window.__palm)", 20000);
  for (const name of photos) {
    const url = "data:image/jpeg;base64," + readFileSync(join(DIR, name)).toString("base64");
    const r = await page.evaluate(async url => {
      const PC = window.PalmCore, im = new Image(); im.src = url; await im.decode();
      const W = im.naturalWidth, H = im.naturalHeight, c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").drawImage(im, 0, 0);
      await window.__palm.loadModels();
      const h = await window.__palm.detectHand(c, false);
      if (!h || !h.pts) return { error: "no hand found" };
      const hand = PC.handFromLandmarks(h.pts);
      return { W, H, pts: h.pts, hand };
    }, url);
    result.photos[name] = r;
    console.log(name, r.error || `${r.W}x${r.H} ok`);
  }
} finally { await browser.close(); server.kill(); }
writeFileSync(out, JSON.stringify(result));
console.log("wrote", out);
