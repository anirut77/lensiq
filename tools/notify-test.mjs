#!/usr/bin/env node
// tools/notify-test.mjs — `npm run backend:notify-test [-- --base https://lensiq-api-test.<sub>.workers.dev]`
// Owner-run check of the LINE notification for new quote requests (owner decision 2026-11-12): asks the deployed test
// Worker to send ONE test push "LENSIQ: ทดสอบการแจ้งเตือน <time>" to LEAD_NOTIFY_LINE_TO (POST /health/notify-test).
//   - target: only LENSIQ's own test Worker (lensiq-api-test on workers.dev, or a hostname approved in deploy/domains.json);
//     any other name is refused. Without --base the API origin of deploy/public-site.json is used. Printed first.
//   - auth: the Worker's HEALTH_TOKEN (the secret set with `npm run secrets:setup`, shown once then). It is typed into a
//     hidden prompt here, sent only in the Authorization header, never echoed, printed, logged, put in argv / env or saved.
//   - the Worker allows 3 tests per hour and answers only ok / LINE's HTTP status; it never returns the LINE token or the
//     recipient. Never runs in CI.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkBase } from "./backend-smoke.mjs";
import { ALLOWED, DOMAINS_FILE, approvedApiHosts } from "./lib/cf-guard.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Hidden prompt on a real terminal (raw mode, nothing echoed). Resolves "" when cancelled. @param {string} q */
function hiddenPrompt(q) {
  return new Promise(res => {
    const { stdin, stdout } = process;
    stdout.write(q);
    let buf = "";
    stdin.setRawMode(true); stdin.resume();
    const done = (/** @type {string} */ v) => { stdin.setRawMode(false); stdin.pause(); stdin.removeListener("data", on); stdout.write("\n"); res(v); };
    const on = (/** @type {Buffer} */ d) => {
      for (const ch of d.toString("utf8")) {
        if (ch === "\r" || ch === "\n") return done(buf);
        if (ch === "\u0003") return done("");
        if (ch === "\u007f" || ch === "\b") buf = buf.slice(0, -1); else if (ch >= " ") buf += ch;
      }
    };
    stdin.on("data", on);
  });
}

/** @param {string[]} argv
 *  @param {{print?: (s: string) => void, env?: any, fetch?: typeof fetch, domains?: string, site?: string, readSecret?: () => Promise<string>, tty?: boolean}} [io] */
export async function main(argv, io = {}) {
  const print = io.print || (s => console.log(s));
  const env = io.env || process.env;
  const f = io.fetch || fetch;
  const arg = k => (argv.includes(k) ? String(argv[argv.indexOf(k) + 1] || "") : "");
  if (env.CI || env.GITHUB_ACTIONS) { print("REFUSED: the LINE test never runs in CI."); return 3; }
  let approved;
  try { approved = approvedApiHosts(io.domains || join(repo, DOMAINS_FILE), p => readFileSync(p, "utf8")); } catch (e) { print("REFUSED: " + e.message); return 3; }
  let base = arg("--base");
  if (!base) { try { base = String(JSON.parse(readFileSync(io.site || join(repo, "deploy", "public-site.json"), "utf8")).apiBase || ""); } catch { base = ""; } }
  const b = checkBase(base, approved);
  if (!b || b.local) {
    print(`REFUSED: the target must be the test Worker https://${ALLOWED.worker}.<subdomain>.workers.dev (or a hostname listed in ${DOMAINS_FILE}).`);
    return 2;
  }
  print(`TARGET   ${b.origin}  (Worker "${ALLOWED.worker}")`);
  print("Sends ONE test LINE message to the recipient set on the Worker (LEAD_NOTIFY_LINE_TO). 3 tests per hour.");
  const tty = io.tty != null ? io.tty : !!(process.stdin.isTTY && process.stdout.isTTY);
  if (!io.readSecret && !tty) { print("REFUSED: run this in a terminal (the HEALTH_TOKEN is typed into a hidden prompt)."); return 3; }
  const tok = (await (io.readSecret ? io.readSecret() : hiddenPrompt("HEALTH_TOKEN (hidden, Enter): "))).trim();
  if (!tok) { print("Cancelled. Nothing was sent."); return 130; }
  let r, j = null;
  try {
    r = await f(b.origin + "/health/notify-test", { method: "POST", redirect: "manual",
      headers: { Authorization: "Bearer " + tok, "User-Agent": "Mozilla/5.0 (compatible; lensiq-notify-test/1.0)" } });
    try { j = await r.json(); } catch { j = null; }
  } catch { print("FAILED: the Worker could not be reached."); return 1; }
  if (r.status === 401) { print("FAILED: the HEALTH_TOKEN was not accepted."); return 1; }
  if (r.status === 503 && j && j.code === "health_token_not_set") { print("FAILED: HEALTH_TOKEN is not set on the Worker: npm run secrets:setup -- --only HEALTH_TOKEN"); return 1; }
  if (r.status === 404) { print("FAILED: /health/notify-test is not enabled on this Worker (deploy the current backend first)."); return 1; }
  if (r.status === 429) { print("FAILED: test limit reached (3 per hour). Try again later."); return 1; }
  if (!j || r.status !== 200) { print(`FAILED: unexpected answer (HTTP ${r.status}).`); return 1; }
  if (!j.configured) {
    print("NOT SET: " + (Array.isArray(j.missing) ? j.missing.join(", ") : "LINE settings") + " (npm run secrets:setup -- --only <NAME>). Nothing was sent.");
    return 1;
  }
  print(j.ok ? `OK: LINE accepted the test message (HTTP ${j.line_status}). Check the LINE app.`
    : `FAILED: LINE answered HTTP ${j.line_status} (401 = token wrong or expired, 400 = user ID wrong or not a friend of the account).`);
  return j.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main(process.argv.slice(2)).then(c => process.exit(c));
