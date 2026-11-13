#!/usr/bin/env node
// tools/look-probe.mjs — feasibility probe only (NOT a measurement): does MediaPipe Face Landmarker find the synthetic faces of
// tools/look-synth-face.js at all? Prints the detection count on a handful of seeds outside the locked set and writes one
// example PNG to the given folder (outside the repo). No number from this probe is a product claim.
import { mkdtempSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.argv[2] || tmpdir();
if ((resolve(outDir) + "/").startsWith(repo + "/")) { console.error("output must be outside the repo"); process.exit(2); }
const realChrome = process.env.LQ_CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const wrapDir = mkdtempSync(join(tmpdir(), "lq-look-"));
const wrapper = join(wrapDir, "chrome-webgl.sh");
writeFileSync(wrapper, ["#!/bin/bash", "args=()", `for a in "$@"; do case "$a" in --disable-webgl|--disable-3d-apis|--disable-gpu) ;; *) args+=("$a");; esac; done`,
  `exec ${JSON.stringify(realChrome)} --use-angle=swiftshader --enable-unsafe-swiftshader "\${args[@]}"`, ""].join("\n"));
chmodSync(wrapper, 0o755);
process.env.LQ_CHROME = wrapper;
const { launch } = await import("../tests/e2e/cdp.mjs");
const { serve } = await import("./static-server.mjs");
const srv = await serve(repo);
const browser = await launch();
try {
  const page = await browser.newPage(null, { isolated: true });
  await page.goto(`${srv.base}/about.html`);
  const r = await page.evaluate(async () => {
    const load = src => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    await load("tools/look-synth-face.js");
    const { FilesetResolver, FaceLandmarker } = await import("/vendor/mediapipe/vision_bundle.mjs");
    const files = await FilesetResolver.forVisionTasks("/vendor/mediapipe/wasm");
    const lm = await FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: "/vendor/models/face-landmarker/face_landmarker_lm.task", delegate: "CPU" }, runningMode: "IMAGE", numFaces: 1 });
    const out = []; let png = "";
    for (let s = 9000; s < 9014; s++) {
      const c = document.createElement("canvas"); c.width = 640; c.height = 480;
      const gt = window.LQSynthFace.draw(c.getContext("2d"), 640, 480, window.LQSynthFace.params(s));
      const res = lm.detect(c);
      const f = res.faceLandmarks && res.faceLandmarks[0];
      let lipErr = null;
      if (f) {
        // mouth corners 61 / 291 vs drawn corners
        const [L, R] = gt.mouthCorners;
        const p61 = [f[61].x * 640, f[61].y * 480], p291 = [f[291].x * 640, f[291].y * 480];
        const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
        lipErr = +(Math.min(d(p61, L) + d(p291, R), d(p61, R) + d(p291, L)) / 2 / gt.ipd).toFixed(3);
      }
      out.push({ s, found: !!f, lipCornerErrIpd: lipErr });
      if (s === 9000) png = c.toDataURL("image/png");
    }
    return { out, png };
  });
  console.log(JSON.stringify(r.out));
  writeFileSync(join(outDir, "synth-9000.png"), Buffer.from(r.png.split(",")[1], "base64"));
} finally { await browser.close(); srv.close && srv.close(); }
process.exit(0);
