// tests/e2e/cdp.mjs — zero-dependency Chrome DevTools Protocol client (Node 22: global WebSocket + fetch).
// Launches headless Chrome WITHOUT WebGL, with fake media flags, in a throw-away profile under os.tmpdir().
// Never writes screenshots or anything else into the repo.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CHROME = process.env.LQ_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ headless = true, extraArgs = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "lq-e2e-"));
  const args = [
    headless ? "--headless=new" : "", "--disable-gpu", "--disable-webgl", "--disable-3d-apis",
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=0", `--user-data-dir=${dir}`, "--no-first-run", "--no-default-browser-check",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--disable-extensions", "--disable-component-update", "--disable-sync", "--metrics-recording-only", "--mute-audio",
    ...extraArgs, "about:blank"
  ].filter(Boolean);
  const proc = spawn(CHROME, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", d => { stderr += d; if (stderr.length > 20000) stderr = stderr.slice(-10000); });
  const portFile = join(dir, "DevToolsActivePort");
  let wsUrl = null;
  for (let i = 0; i < 200 && !wsUrl; i++) {
    if (proc.exitCode != null) throw new Error("Chrome exited: " + stderr.slice(-2000));
    if (existsSync(portFile)) {
      const [port, path] = readFileSync(portFile, "utf8").trim().split("\n");
      if (port && path) wsUrl = `ws://127.0.0.1:${port}${path}`;
    }
    if (!wsUrl) await sleep(50);
  }
  if (!wsUrl) { proc.kill("SIGKILL"); throw new Error("Chrome did not expose DevToolsActivePort"); }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("CDP websocket failed")); });
  let seq = 0;
  const pending = new Map(), listeners = new Set();
  ws.onmessage = ev => {
    const m = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString());
    if (m.id != null && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(`${p.method}: ${m.error.message}${m.error.data ? " " + m.error.data : ""}`)) : p.res(m.result);
    } else if (m.method) for (const l of listeners) l(m);
  };
  ws.onclose = () => { for (const p of pending.values()) p.rej(new Error("CDP closed")); pending.clear(); };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = ++seq; pending.set(id, { res, rej, method });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });

  const pages = new Set();
  async function newPage(url, { initScripts = [], timeout = 20000 } = {}) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    const consoleErrors = [], consoleLog = [], requests = [];
    let loadWaiters = [];
    const onEvent = m => {
      if (m.sessionId !== sessionId) return;
      const p = m.params || {};
      switch (m.method) {
        case "Runtime.exceptionThrown": {
          const d = p.exceptionDetails || {};
          consoleErrors.push({ kind: "exception", text: (d.exception && (d.exception.description || d.exception.value)) || d.text, url: d.url, line: d.lineNumber });
          break;
        }
        case "Runtime.consoleAPICalled": {
          const text = (p.args || []).map(a => a.value !== undefined ? String(a.value) : a.description || a.type).join(" ");
          consoleLog.push({ type: p.type, text });
          if (p.type === "error" || p.type === "assert") consoleErrors.push({ kind: "console", text });
          break;
        }
        case "Log.entryAdded":
          if (p.entry && p.entry.level === "error") consoleErrors.push({ kind: "log", text: p.entry.text, url: p.entry.url, source: p.entry.source });
          break;
        case "Network.requestWillBeSent": requests.push({ url: p.request.url, method: p.request.method, type: p.type }); break;
        case "Page.loadEventFired": { const w = loadWaiters; loadWaiters = []; w.forEach(f => f()); break; }
      }
    };
    listeners.add(onEvent);
    await Promise.all([s("Runtime.enable"), s("Page.enable"), s("Network.enable"), s("Log.enable")]);
    for (const src of initScripts) await s("Page.addScriptToEvaluateOnNewDocument", { source: src });
    const waitLoad = () => new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error("page load timeout")), timeout);
      loadWaiters.push(() => { clearTimeout(t); res(); });
    });

    async function evaluate(fnOrExpr, ...args) {
      const expression = typeof fnOrExpr === "function"
        ? `(${fnOrExpr.toString()})(...${JSON.stringify(args)})`
        : String(fnOrExpr);
      const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error("evaluate: " + ((d.exception && (d.exception.description || d.exception.value)) || d.text));
      }
      return r.result ? r.result.value : undefined;
    }
    async function waitFor(fnString, ms = 5000, every = 50) {
      const expr = typeof fnString === "function" ? `(${fnString.toString()})()` : `(${fnString})`;
      const end = Date.now() + ms;
      let last;
      while (Date.now() < end) {
        try { last = await evaluate(`Promise.resolve(${expr}).then(v => v, e => ({__err: String(e)}))`); } catch (e) { last = { __err: String(e) }; }
        if (last && !last.__err) return last;
        await sleep(every);
      }
      throw new Error(`waitFor timed out after ${ms} ms: ${String(fnString).slice(0, 160)} (last: ${JSON.stringify(last)})`);
    }
    async function goto(u) { const w = waitLoad(); await s("Page.navigate", { url: u }); await w; }
    async function reload() { const w = waitLoad(); await s("Page.reload", { ignoreCache: true }); await w; }
    async function close() {
      listeners.delete(onEvent); pages.delete(page);
      try { await send("Target.closeTarget", { targetId }); } catch { /* already closed */ }
    }
    const page = { targetId, sessionId, send: s, evaluate, waitFor, goto, reload, close, consoleErrors, consoleLog, requests };
    pages.add(page);
    if (url) await goto(url);
    return page;
  }

  async function close() {
    for (const p of [...pages]) await p.close();
    try { await send("Browser.close"); } catch { /* ignore */ }
    try { ws.close(); } catch { /* ignore */ }
    await Promise.race([new Promise(r => proc.once("exit", r)), sleep(3000)]);
    if (proc.exitCode == null) proc.kill("SIGKILL");
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  return { newPage, close, send, proc };
}

// ---------- shared assertions ----------
export function assert(cond, msg) { if (!cond) throw new Error("assertion failed: " + msg); }

/** WebGL must be absent; returns details. */
export async function assertNoWebGL(page) {
  const r = await page.evaluate(() => {
    const c = document.createElement("canvas");
    let gl = null, gl2 = null;
    try { gl2 = c.getContext("webgl2"); } catch { /* ignore */ }
    try { gl = c.getContext("webgl") || c.getContext("experimental-webgl"); } catch { /* ignore */ }
    return { webgl: !!gl, webgl2: !!gl2 };
  });
  assert(!r.webgl && !r.webgl2, "WebGL must be absent, got " + JSON.stringify(r));
  return r;
}

/** Loads vendor/face-api.js + lensiq-detect.js if needed and asserts LQDetect.tfBackend() === 'wasm'. */
export async function assertWasmBackend(page) {
  const name = await page.evaluate(async () => {
    const load = src => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("load " + src)); document.head.appendChild(s); });
    if (typeof faceapi === "undefined") await load("vendor/face-api.js");
    if (!window.LQDetect) await load("lensiq-detect.js");
    return LQDetect.tfBackend();
  });
  assert(name === "wasm", "tf backend should be wasm, got " + name);
  return name;
}

/** Privacy: no images or huge blobs in localStorage; no /api/* requests. */
export async function privacyScan(page) {
  const ls = await page.evaluate(() => Object.keys(localStorage).map(k => ({ k, n: (localStorage.getItem(k) || "").length, img: /data:image/i.test(localStorage.getItem(k) || "") })));
  const bad = ls.filter(e => e.img || e.n > 200 * 1024);
  assert(!bad.length, "localStorage holds image/huge values: " + JSON.stringify(bad));
  const api = page.requests.filter(r => { try { return new URL(r.url).pathname.startsWith("/api/"); } catch { return false; } });
  assert(!api.length, "/api/* requests made: " + api.map(r => r.url).join(", "));
  return { keys: ls.length };
}
