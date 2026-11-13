// tests/e2e/cdp.mjs — zero-dependency Chrome DevTools Protocol client (Node 22: global WebSocket + fetch).
// Launches headless Chrome WITHOUT WebGL, with fake media flags, in a throw-away profile under os.tmpdir().
// Never writes screenshots or anything else into the repo.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, lstatSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Chrome binary: LQ_CHROME / CHROME_PATH (browser-actions/setup-chrome output), else the usual macOS / Linux / Windows paths
const CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
];
export const CHROME = process.env.LQ_CHROME || process.env.CHROME_PATH || CANDIDATES.find(p => existsSync(p)) || CANDIDATES[0];
// CI containers run as root without a user namespace sandbox
const CI_ARGS = process.env.CI ? ["--no-sandbox", "--disable-dev-shm-usage"] : [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- throw-away profile bookkeeping (owner request 2026-11-13: 41 left-over profiles, 1.5 GB, filled the disk) ----------
// Every profile folder is "lq-e2e-*" under os.tmpdir() with ".lq-owner" = this Node process id and ".lq-chrome" = Chrome's.
// close() removes it; the exit / SIGINT / SIGTERM / SIGHUP handlers below kill Chrome and remove every folder still open;
// a SIGKILLed test process cannot clean up, so sweepStale() (run.mjs calls it first) removes folders whose owner is gone.
const PREFIX = "lq-e2e-";
const live = new Map(); // dir -> Chrome ChildProcess
const created = [];     // every profile folder this process made (run.mjs checks none is left at the end)
const rmDir = dir => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* checked by leftoverProfiles() */ } };
function killAllSync() {
  for (const [dir, proc] of live) {
    try { if (proc.exitCode == null) proc.kill("SIGKILL"); } catch { /* gone */ }
    rmDir(dir);
  }
  live.clear();
}
process.on("exit", killAllSync);
for (const [sig, n] of [["SIGINT", 2], ["SIGTERM", 15], ["SIGHUP", 1]]) {
  process.on(sig, () => { killAllSync(); process.exit(128 + n); });
}
/** Chrome browsers this process launched and has not closed yet. */
export const openBrowsers = () => live.size;
/** Profile folders this process created that still exist on disk. */
export const leftoverProfiles = () => created.filter(d => existsSync(d));
/** Close every browser this process still has open (run.mjs: after each test file). */
export async function closeAll() {
  for (const [dir, proc] of [...live]) {
    if (proc.exitCode == null) { proc.kill("SIGKILL"); await Promise.race([new Promise(r => proc.once("exit", r)), sleep(3000)]); }
    rmDir(dir); live.delete(dir);
  }
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
const readPid = f => { try { const t = readFileSync(f, "utf8").trim(); return /^[1-9]\d{0,9}$/.test(t) ? +t : 0; } catch { return 0; } };
/**
 * Remove "lq-e2e-*" profile folders under root whose ".lq-owner" process has exited. Folders without a valid owner
 * file, with a running owner, or with any other name are never touched. An orphaned Chrome still using the folder is
 * killed first, but only after `ps` confirms that pid is a process started with this exact --user-data-dir.
 * @param {string} [root] @returns {{removed: string[], kept: string[]}}
 */
export function sweepStale(root = tmpdir()) {
  const removed = [], kept = [];
  let names = [];
  try { names = readdirSync(root); } catch { return { removed, kept }; }
  for (const name of names) {
    if (!name.startsWith(PREFIX) || name.length === PREFIX.length) continue;
    const dir = join(root, name);
    try { if (!lstatSync(dir).isDirectory()) continue; } catch { continue; }
    const owner = readPid(join(dir, ".lq-owner"));
    if (!owner || alive(owner) || live.has(dir)) { kept.push(dir); continue; }
    const chrome = readPid(join(dir, ".lq-chrome"));
    if (chrome && alive(chrome) && process.platform !== "win32") {
      const cmd = spawnSync("ps", ["-p", String(chrome), "-o", "command="], { encoding: "utf8" }).stdout || "";
      if (cmd.includes(`--user-data-dir=${dir}`)) { try { process.kill(chrome, "SIGKILL"); } catch { /* gone */ } }
    }
    rmDir(dir);
    (existsSync(dir) ? kept : removed).push(dir);
  }
  return { removed, kept };
}

export async function launch({ headless = true, extraArgs = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), PREFIX));
  created.push(dir);
  writeFileSync(join(dir, ".lq-owner"), String(process.pid));
  const args = [
    headless ? "--headless=new" : "", "--disable-gpu", "--disable-webgl", "--disable-3d-apis",
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=0", `--user-data-dir=${dir}`, "--no-first-run", "--no-default-browser-check",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--disable-extensions", "--disable-component-update", "--disable-sync", "--metrics-recording-only", "--mute-audio",
    ...CI_ARGS, ...extraArgs, "about:blank"
  ].filter(Boolean);
  let proc;
  try { proc = spawn(CHROME, args, { stdio: ["ignore", "ignore", "pipe"] }); } catch (e) { rmDir(dir); throw e; }
  live.set(dir, proc);
  proc.once("error", () => {}); // a missing binary surfaces as "Chrome exited" below
  if (proc.pid) writeFileSync(join(dir, ".lq-chrome"), String(proc.pid));
  const fail = msg => { try { if (proc.exitCode == null) proc.kill("SIGKILL"); } catch { /* gone */ } live.delete(dir); rmDir(dir); return new Error(msg); };
  let stderr = "";
  proc.stderr.on("data", d => { stderr += d; if (stderr.length > 20000) stderr = stderr.slice(-10000); });
  const portFile = join(dir, "DevToolsActivePort");
  let wsUrl = null;
  const startMs = +process.env.LQ_CHROME_START_MS || 30000; // busy CI runners can take > 10 s to start Chrome
  for (let i = 0; i < startMs / 50 && !wsUrl; i++) {
    if (proc.exitCode != null || proc.signalCode != null || !proc.pid) throw fail("Chrome exited: " + stderr.slice(-2000));
    if (existsSync(portFile)) {
      const [port, path] = readFileSync(portFile, "utf8").trim().split("\n");
      if (port && path) wsUrl = `ws://127.0.0.1:${port}${path}`;
    }
    if (!wsUrl) await sleep(50);
  }
  if (!wsUrl) throw fail("Chrome did not expose DevToolsActivePort");

  const ws = new WebSocket(wsUrl);
  try { await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("CDP websocket failed")); }); }
  catch (e) { throw fail(e.message); }
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
  // isolated: true -> own browser context (separate localStorage/cookies), e.g. several "devices" in one Chrome
  async function newPage(url, { initScripts = [], timeout = 20000, isolated = false } = {}) {
    const ctxId = isolated ? (await send("Target.createBrowserContext", { disposeOnDetach: true })).browserContextId : undefined;
    const { targetId } = await send("Target.createTarget", ctxId ? { url: "about:blank", browserContextId: ctxId } : { url: "about:blank" });
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
        case "Network.requestWillBeSent": requests.push({ url: p.request.url, method: p.request.method, type: p.type, postData: p.request.postData }); break;
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
      if (ctxId) try { await send("Target.disposeBrowserContext", { browserContextId: ctxId }); } catch { /* ignore */ }
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
    if (proc.exitCode == null) { proc.kill("SIGKILL"); await Promise.race([new Promise(r => proc.once("exit", r)), sleep(3000)]); }
    live.delete(dir);
    rmDir(dir);
  }
  // on(fn): raw CDP events ({method, params, sessionId}) — e.g. Debugger.paused when diagnosing a hung page
  const on = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  return { newPage, close, send, proc, on, dir };
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
