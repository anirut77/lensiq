// tests/e2e/csp.e2e.mjs — every page served by the real server.py (with its Content-Security-Policy and security headers)
// loads without CSP violations in headless Chrome, and the WASM/worker libraries still start under the policy:
// TF.js wasm backend (face-api), MediaPipe tasks-vision (hand landmarker), onnxruntime-web (MODNet) and the pdf.js worker.
// Starts server.py itself (repo .venv python, random port, temp LENSIQ_DATA_DIR); skipped when .venv is missing.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, assertWasmBackend } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on("error", rej); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });

// บันทึกทุก CSP violation ของหน้า (รวมจาก worker ที่ส่งต่อมาที่ document) ไว้ใน window.__csp
const RECORDER = `window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.effectiveDirective + " " + (e.blockedURI || "inline") + " @" + (e.sourceFile || "").replace(location.origin, "") + ":" + e.lineNumber), true);`;

async function startServer(repo) {
  const py = join(repo, ".venv", "bin", "python");
  if (!existsSync(py)) return { skip: ".venv/bin/python not found" };
  const port = await freePort(), dataDir = mkdtempSync(join(tmpdir(), "lq-csp-e2e-"));
  const proc = spawn(py, ["server.py"], { cwd: repo, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, LENSIQ_PORT: String(port), LENSIQ_DATA_DIR: dataDir, LENSIQ_MOBILE: "", LENSIQ_CSP: "" } });
  let err = ""; proc.stderr.on("data", d => { err += d; if (err.length > 8000) err = err.slice(-4000); });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    if (proc.exitCode != null) return { skip: "server.py exited: " + err.slice(-300) };
    try { if ((await fetch(base + "/index.html")).ok) return { base, proc, dataDir }; } catch { await sleep(100); }
  }
  proc.kill(); return { skip: "server.py did not start: " + err.slice(-300) };
}

const violations = async page => {
  const ev = await page.evaluate(() => window.__csp || []);
  const log = page.consoleErrors.filter(e => /Content Security Policy|Refused to (load|execute|apply|compile|create|connect|frame)/i.test(e.text || "")).map(e => e.text.slice(0, 200));
  return ev.concat(log);
};

export default async function ({ launch, check, skip, fakeCams, repo }) {
  const srv = await startServer(repo);
  if (srv.skip) { skip("pages load under server.py CSP", srv.skip); return; }
  const S = srv.base;
  const browser = await launch();
  const init = [RECORDER, fakeCams, "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}"];
  try {
    await check("security headers present on pages", async () => {
      const r = await fetch(S + "/index.html");
      const csp = r.headers.get("content-security-policy") || "";
      assert(/script-src 'self' 'wasm-unsafe-eval'/.test(csp), "CSP: " + csp);
      assert(r.headers.get("x-content-type-options") === "nosniff", "nosniff");
      assert(/camera=\(self\)/.test(r.headers.get("permissions-policy") || ""), "Permissions-Policy");
      assert(r.headers.get("referrer-policy"), "Referrer-Policy");
    });

    await check("harness sanity: an injected inline script is reported as a violation", async () => {
      const page = await browser.newPage(null, { initScripts: [RECORDER] });
      await page.goto(`${S}/index.html`);
      await page.evaluate(() => { const s = document.createElement("script"); s.textContent = "window.__ran = 1"; document.body.append(s); });
      await sleep(200);
      assert(!(await page.evaluate(() => window.__ran)), "inline script must not run");
      assert((await violations(page)).length > 0, "violation recorded");
      await page.close();
    });

    const pages = readdirSync(repo).filter(f => f.endsWith(".html")).sort();
    for (const f of pages) {
      await check(`${f} — no CSP violations`, async () => {
        const page = await browser.newPage(null, { initScripts: init });
        await page.goto(`${S}/${f}?cpu`);
        await sleep(1500);
        const v = await violations(page);
        assert(!v.length, v.join(" || "));
        const uncaught = page.consoleErrors.filter(e => e.kind === "exception");
        assert(!uncaught.length, "uncaught: " + uncaught.map(e => e.text).join(" || "));
        await page.close();
      });
    }

    await check("TF.js wasm backend + face-api models load under CSP", async () => {
      const page = await browser.newPage(null, { initScripts: init });
      await page.goto(`${S}/index.html?cpu`);
      await assertWasmBackend(page);
      await page.evaluate(async () => { await faceapi.nets.tinyFaceDetector.loadFromUri("vendor/models"); });
      const v = await violations(page);
      assert(!v.length, v.join(" || "));
      await page.close();
    });

    await check("MediaPipe hand landmarker (wasm) starts under CSP", async () => {
      const page = await browser.newPage(null, { initScripts: init });
      await page.goto(`${S}/signage.html?cpu`);
      const ok = await page.evaluate(async () => {
        const { FilesetResolver, HandLandmarker } = await import("./vendor/mediapipe/vision_bundle.mjs");
        const files = await FilesetResolver.forVisionTasks(new URL("vendor/mediapipe/wasm", location.href).href);
        const lm = await HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: "vendor/models/hand_landmarker.task", delegate: "CPU" }, runningMode: "IMAGE", numHands: 1 });
        lm.close(); // detect() needs WebGL for image input, absent in this headless profile; creation compiles the wasm
        return true;
      });
      assert(ok, "landmarker ran");
      const v = await violations(page);
      assert(!v.length, v.join(" || "));
      await page.close();
    });

    await check("onnxruntime-web (MODNet) starts under CSP", async () => {
      const page = await browser.newPage(null, { initScripts: init });
      await page.goto(`${S}/studio.html?cpu`);
      const n = await page.evaluate(async () => {
        ort.env.wasm.wasmPaths = new URL("vendor/ort/", location.href).href;
        ort.env.wasm.numThreads = 1;
        const s = await ort.InferenceSession.create("vendor/models/modnet.onnx", { executionProviders: ["wasm"] });
        return s.inputNames.length;
      });
      assert(n >= 1, "session created");
      const v = await violations(page);
      assert(!v.length, v.join(" || "));
      await page.close();
    });

    await check("pdf.js worker starts under CSP (converter)", async () => {
      const page = await browser.newPage(null, { initScripts: init });
      await page.goto(`${S}/converter.html`);
      const pages = await page.evaluate(async () => {
        const pdf = "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";
        const doc = await pdfjsLib.getDocument({ data: new TextEncoder().encode(pdf) }).promise;
        return doc.numPages;
      });
      assert(pages === 1, "pdf parsed in worker");
      const v = await violations(page);
      assert(!v.length, v.join(" || "));
      await page.close();
    });

    await check("cross-site POST to /api/convert is refused", async () => {
      const r = await fetch(S + "/api/convert", { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "multipart/form-data; boundary=x" }, body: "--x--\r\n" });
      assert(r.status === 403, "status " + r.status);
    });
  } finally {
    await browser.close();
    srv.proc.kill();
    try { rmSync(srv.dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
