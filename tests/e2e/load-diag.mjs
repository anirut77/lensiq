// tests/e2e/load-diag.mjs — shared e2e helper (owner decision 203 ค, 2026-11-20): when a page load fails, record the machine load
// (os.loadavg()), the page load time and the timeout, and say which case it is. BOTH cases are failures; only the message and the
// recorded data differ. Nothing here changes a timeout, a page list or an assertion.
//   "slow machine"      the load timed out while the 1-minute load average was above LOAD_HIGH (10, owner rule 203 ก), or the page
//                       loaded late (it is ready when probed right after the timeout);
//   "page did not load" a real failure: a navigation error, an HTTP error (>= 400), any non-timeout error, or no ready page after the
//                       timeout while the load was normal.
// Tests: tests/unit/crisis-load-diag.test.js (locked, evals-locks/crisis-load-diag.sha256).
import { cpus as osCpus, loadavg as osLoadavg } from "node:os";

export const LOAD_HIGH = 10;
export const KIND = { SLOW: "slow machine", NOT_LOADED: "page did not load" };
const PROBE_MS = 1500;

const fmtLoad = l => (l || []).map(v => Number(v).toFixed(1)).join(" / ");

/** pure: { error, url, phase, ms, timeoutMs, loadavg, cpus, probe } -> { kind, fail: true, message, data } */
export function classifyLoadFailure({ error, url = "", phase = "load", ms = 0, timeoutMs = 0, loadavg = [0, 0, 0], cpus = 0, probe = null }) {
  const err = String((error && error.message) || error || "");
  const p = probe && !probe.error ? probe : null;
  const high = Number(loadavg[0]) > LOAD_HIGH;
  const timedOut = /page load timeout|timed out/i.test(err) || (timeoutMs > 0 && ms >= timeoutMs);
  let kind, reason;
  if (/net::ERR_|Page\.navigate:|chrome-error:/.test(err) || (p && /^chrome-error:/.test(p.href || ""))) {
    kind = KIND.NOT_LOADED; reason = "navigation error";
  } else if (p && p.status >= 400) {
    kind = KIND.NOT_LOADED; reason = `HTTP ${p.status}`;
  } else if (timedOut && p && p.done) {
    kind = KIND.SLOW; reason = "the page loaded late (ready when probed after the timeout)";
  } else if (timedOut && high) {
    kind = KIND.SLOW; reason = `the load timed out while the 1-minute load average was above ${LOAD_HIGH}`;
  } else if (timedOut) {
    kind = KIND.NOT_LOADED;
    reason = !p ? "no ready page after the timeout (probe: " + ((probe && probe.error) || "none") + ") while the load was normal"
      : p.sameUrl === false ? "navigation never reached the page (another page still shown) while the load was normal"
        : !p.nodes ? "no DOM after the timeout while the load was normal"
          : "the page never became ready (language not applied) while the load was normal";
  } else {
    kind = KIND.NOT_LOADED; reason = "error";
  }
  const data = { kind, phase, ms, timeoutMs, loadavg: loadavg.slice(0, 3), cpus, url, error: err.slice(0, 200), probe: probe || null };
  const facts = `${phase} ${ms} ms, timeout ${timeoutMs} ms; load average 1/5/15 min ${fmtLoad(loadavg)} on ${cpus} CPUs; ${url}`;
  const message = kind === KIND.SLOW
    ? `slow machine (still a failure): ${reason}; ${facts}`
    : `page did not load: ${reason}${reason === "error" ? " " + err.slice(0, 120) : ""}; ${facts}`;
  return { kind, fail: true, message, data };
}

const PROBE = (url, ready) => `(() => { let nav = null, done = false;
  try { nav = performance.getEntriesByType("navigation")[0] || null; } catch (e) {}
  try { done = document.readyState === "complete" && location.href === ${JSON.stringify(url)} && !!(${ready}); } catch (e) {}
  return { href: location.href, sameUrl: location.href === ${JSON.stringify(url)}, ready: document.readyState, lang: document.documentElement.lang,
    nodes: document.body ? document.body.getElementsByTagName("*").length : 0, status: (nav && nav.responseStatus) || 0, done }; })()`;

/** probe the page once (bounded), classify, log one LOAD-DIAG line and return an Error carrying the data (err.lqLoad) */
export async function diagnoseLoadFailure(page, error, { url, phase, ms, timeoutMs, ready = "true" }, opts = {}) {
  const loadavg = opts.loadavg || osLoadavg();
  const cpus = opts.cpus != null ? opts.cpus : osCpus().length;
  let probe, timer;
  try {
    probe = await Promise.race([
      Promise.resolve().then(() => page.evaluate(PROBE(url, ready))),
      new Promise(res => { timer = setTimeout(() => res({ error: "probe timed out" }), opts.probeMs || PROBE_MS); }),
    ]);
  } catch (e) { probe = { error: "probe failed: " + String((e && e.message) || e).slice(0, 80) }; } finally { clearTimeout(timer); }
  const r = classifyLoadFailure({ error, url, phase, ms, timeoutMs, loadavg, cpus, probe });
  if (!opts.quiet) console.log("    LOAD-DIAG " + JSON.stringify(r.data));
  return Object.assign(new Error(r.message), { lqLoad: r.data });
}

/** the failure line for a load() error: its classified message; any other error is a real failure */
export function loadFailText(e) {
  if (e && e.lqLoad) return e.message;
  return `${KIND.NOT_LOADED}: ${String((e && e.message) || e).slice(0, 140)} (no load diagnostics)`;
}
