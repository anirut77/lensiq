#!/usr/bin/env node
// tools/secrets-setup.mjs — `npm run secrets:setup`: the OWNER types each Worker secret into a hidden prompt and the value
// goes straight to `wrangler secret put <NAME> --env test` on that process's STDIN.
//
// Guarantees (tests/unit/deploy-tools.test.js, "B2 secrets:setup"):
//   - a value is never echoed, never printed (not even its length or a prefix), never put in argv, an environment
//     variable, a file, a log or the shell history; wrangler's own output is captured and dropped (one line per secret:
//     "NAME: set" / "NAME: FAILED (exit n)");
//   - the terminal stays in raw mode (no echo) for the WHOLE session, also while wrangler runs: anything typed or pasted
//     between two prompts is discarded, never shown. The terminal is restored on exit, Ctrl-C, SIGTERM and SIGHUP;
//   - refuses to start without a real terminal on stdin and stdout (exit 2): an agent, a pipe or a log capture cannot
//     run it; refuses in CI;
//   - the target Worker name is printed first and checked by tools/lib/cf-guard.mjs, including the name wrangler really
//     resolves for the secret commands (`--env test` only: adding `--name` would target "<name>-test"); exit 3, wrangler
//     never started;
//   - the Worker must already be DEPLOYED (read-only `wrangler deployments list`): `secret put` on a missing Worker would
//     create a draft Worker, so the script stops instead;
//   - SECRETS_KEK is generated here and never shown; an existing one is never replaced (the stored TOTP secret could
//     not be decrypted any more) unless --replace-kek;
//   - ADMIN_BOOTSTRAP_TOKEN is generated here and shown ONCE on the terminal, then the lines are erased. Erasing uses
//     terminal control codes: a scroll-back buffer, tmux or a screen recorder may still hold the text, so the owner is
//     told to clear the terminal, and the token is overwritten (closed) right after the bootstrap in any case;
//   - every secret can be skipped (Enter).
//   - the two LINE notification secrets get the Worker's own format check (backend/src/line-config.js, owner order
//     2026-11-15): spaces and line breaks around the value are trimmed; a wrong value is refused with the reason (never
//     the value) and is never "sent anyway" (tests/unit/secrets-setup-line.test.js).
//
//   npm run secrets:setup                           all "required now" secrets, then the optional ones
//   npm run secrets:setup -- --only TESTER_ACCESS_CODE     one secret (rotation: the old code stops working at once)
//   npm run secrets:setup -- --list                 names, required / later, set or not (names only; needs a terminal too)
//   npm run secrets:setup -- --dry-run              ask, check the shape, send nothing
//   npm run secrets:setup -- --env production       the PRODUCTION Worker "lensiq-prod-api" ([env.production]; secret commands get
//                                                   `--env production` only). OPENROUTER_API_KEY is "later" there: no AI key at
//                                                   launch (owner item 233). New values only: never copy a test value.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
// the ONE definition of a usable tester code: the Worker refuses a weak configured code too (backend/src/tester.js)
import { weakCode } from "../backend/src/tester.js";
// the ONE format check of the two LINE notification secrets (the Worker uses the same one; owner order 2026-11-15)
import { LINE_REASON_TEXT, LINE_SECRETS, LINE_TOKEN_ENTRY_TEXT, lineSecretProblem } from "../backend/src/line-config.js";
import {
  BACKEND, ENV, ENVS, GuardError, accountEnvRefusal, configArgs,
  assertEffective, assertOffline, assertSafeEnv, assertTarget, assertWranglerBundle, childEnv, deployedArgs, jsonArray, readTargets, wranglerBin
} from "./lib/cf-guard.mjs";

/** when: "now" = needed for the tester deploy · "later" = optional. gen: generated here. min: shortest accepted value. */
export const SECRETS = Object.freeze([
  { name: "SECRETS_KEK", when: "now", gen: "kek", typed: false, what: "key that encrypts the admin TOTP secret (generated, never shown)" },
  { name: "ADMIN_BOOTSTRAP_TOKEN", when: "now", gen: "token", showOnce: true, min: 32, what: "one-time token to create the owner account (generated, shown once)" },
  { name: "TURNSTILE_SECRET", when: "now", min: 20, what: "Cloudflare Turnstile widget SECRET key (dashboard -> Turnstile -> the LENSIQ widget)" },
  { name: "OPENROUTER_API_KEY", when: "now", min: 20, prefix: "sk-or-", what: "the separate OpenRouter key for this test (limit >= 10 USD)" },
  { name: "TESTER_ACCESS_CODE", when: "now", min: 16, strong: true,
    what: "the code you give to testers: you invent it, at least 16 characters, not one repeated character, not a run like 123456 / abcdef, no common word" },
  { name: "ALERT_WEBHOOK_URL", when: "later", min: 12, prefix: "https://", what: "optional: https webhook (Slack / Discord / ntfy) for owner alerts" },
  { name: "HEALTH_TOKEN", when: "later", gen: "token", min: 16, what: "optional: protects GET /health/deep (generated, shown once)", showOnce: true },
  { name: "OPENFDA_API_KEY", when: "later", min: 20, what: "optional: free openFDA key (raises its daily request limit)" },
  { name: "LINE_CHANNEL_ACCESS_TOKEN", when: "later", min: 20,
    what: "optional: LINE Messaging API channel access token (LINE OA LENSIQ @632yliiw) for new quote-request notifications" },
  { name: "LEAD_NOTIFY_LINE_TO", when: "later", min: 33,
    what: "optional: the owner's LINE user ID (U + 32 characters 0-9 a-f, LINE Developers console -> Basic settings -> Your user ID; not the @ account ID) that receives lead notifications" }
]);
export const REQUIRED_NOW = SECRETS.filter(s => s.when === "now").map(s => s.name);
/** Production differences (SELL-READY item 13 / runbook A.2): no AI key at launch, it is entered only with owner item 233. */
const PROD_WHEN = Object.freeze({
  OPENROUTER_API_KEY: { when: "later",
    what: "optional: OpenRouter key, ONLY after the owner's item 233 (AI on in production); AI routes are off at launch" }
});
/** The secret list of an environment ("test" = SECRETS unchanged). @param {string} env */
export function secretsFor(env = ENV) {
  if (!Object.hasOwn(ENVS, env)) throw new GuardError(`unknown environment ${JSON.stringify(String(env)).slice(0, 40)}`);
  if (env !== "production") return SECRETS;
  return Object.freeze(SECRETS.map(s => (PROD_WHEN[s.name] ? Object.freeze({ ...s, ...PROD_WHEN[s.name] }) : s)));
}
/** @param {string} env */
export const requiredNow = (env = ENV) => secretsFor(env).filter(s => s.when === "now").map(s => s.name);

/** The wrangler argument lists of this tool: secret commands get `--env <env>` ONLY (cf-guard.mjs explains why). */
export const secretArgs = Object.freeze({
  /** @param {string} [env] */
  list: (env = ENV) => ["secret", "list", ...configArgs(env), "--env", env, "--format", "json"],
  /** @param {string} name @param {string} [env] */
  put: (name, env = ENV) => ["secret", "put", name, ...configArgs(env), "--env", env]
});

export { weakCode };

const CTRL_C = 3, BACKSPACE = [8, 127];
/**
 * The terminal for the whole session: raw mode (no echo) from open() to close(). Input that arrives while no prompt is
 * waiting (for example while wrangler runs) is DISCARDED, never shown and never part of a later value; Ctrl-C at such a
 * moment is remembered (interrupted()). close() restores the terminal; it is also called from the signal handlers.
 *
 * Line breaks inside a pasted value (incident 2026-11-15: a LINE token copied with a line break was cut at the first
 * break, the first part was sent and reported "set"). Two independent guards, each marks the line `lineBreak: true` and
 * the session refuses it:
 *   - bracketed paste is switched on (ESC[?2004h, off again on close): between ESC[200~ and ESC[201~ a CR / LF is part of
 *     the value, never the end of the line;
 *   - a terminal without bracketed paste: after Enter the line is held for ENTER_WINDOW_MS; any further byte in that
 *     window (other than the LF of a CR LF Enter) means the Enter was a line break inside a paste.
 */
export const ENTER_WINDOW_MS = 120;
export const LINE_BREAK_TEXT = "the value contained a line break (it was copied over two lines). Copy it again with the console's copy button so it is one line";
/** A pasted value that held a line break: marked by the terminal, or a CR / LF left inside after trimming.
 *  @param {Buffer & {lineBreak?: boolean}} a @param {string} typed */
const lineBroken = (a, typed) => !!a.lineBreak || /[\r\n]/.test(typed);
export function openTerminal(stdin, proc = process, out = null) {
  const raw = typeof stdin.setRawMode === "function";
  /** @type {null | ((v: Buffer|null) => void)} */ let waiting = null;
  /** @type {number[]} */ let bytes = [];
  let esc = 0, seq = "", paste = false, stopped = false, closed = false;
  /** @type {null | {bytes: number[], afterCR: boolean, extra: boolean, timer: any}} */ let held = null;
  const settle = v => {
    const w = waiting; waiting = null; bytes.fill(0); bytes = []; esc = 0; seq = ""; paste = false;
    if (held) { clearTimeout(held.timer); held.bytes.fill(0); held = null; }
    if (w) w(v);
  };
  const release = () => {
    if (!held) return;
    const v = /** @type {Buffer & {lineBreak?: boolean}} */ (Buffer.from(held.bytes));
    if (held.extra) v.lineBreak = true;
    settle(v);
  };
  const hold = (/** @type {number} */ b) => {
    held = { bytes: bytes.slice(), afterCR: b === 13, extra: false, timer: setTimeout(release, ENTER_WINDOW_MS) };
    bytes.fill(0); bytes = [];
  };
  const onData = chunk => {
    for (const b of Buffer.from(chunk)) {
      if (held) { // Enter was pressed: anything more in the window means a line break inside a paste
        if (b === CTRL_C || b === 4) { stopped = true; settle(null); continue; }
        if (b === 10 && held.afterCR) { held.afterCR = false; continue; }
        held.afterCR = false; held.extra = true;
        clearTimeout(held.timer); held.timer = setTimeout(release, ENTER_WINDOW_MS);
        continue;
      }
      if (!waiting) { if (b === CTRL_C || b === 4) stopped = true; continue; } // stray input between prompts: dropped
      if (esc === 1) { esc = b === 91 || b === 79 ? 2 : 0; seq = ""; continue; } // ESC [ … / ESC O … (arrow keys, paste marks)
      if (esc === 2) {
        seq += String.fromCharCode(b);
        if (b >= 64 && b <= 126) { if (seq === "200~") paste = true; else if (seq === "201~") paste = false; esc = 0; seq = ""; }
        else if (seq.length > 8) { esc = 0; seq = ""; }
        continue;
      }
      if (b === 27) { esc = 1; continue; }
      if (b === CTRL_C || b === 4) { stopped = true; settle(null); continue; }
      if (b === 13 || b === 10 || b === 9) {
        if (paste) { bytes.push(b); continue; } // part of the pasted value: the checks refuse an inner line break
        if (b !== 9) hold(b);
        continue;
      }
      if (BACKSPACE.includes(b)) { bytes.pop(); continue; }
      if (b >= 32) bytes.push(b);
    }
  };
  const onEnd = () => { stopped = true; settle(null); };
  const close = () => {
    if (closed) return;
    closed = true;
    stdin.removeListener("data", onData); stdin.removeListener("end", onEnd);
    for (const [sig, fn] of handlers) proc.removeListener(sig, fn);
    if (out) { try { out.write("\x1b[?2004l"); } catch { /* terminal already gone */ } }
    if (raw) { try { stdin.setRawMode(false); } catch { /* terminal already gone */ } }
    stdin.pause();
    settle(null);
  };
  /** @type {[string, () => void][]} */
  const handlers = [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]].map(([sig, code]) => [String(sig), () => { close(); proc.exit(Number(code)); }]);
  if (raw) stdin.setRawMode(true);
  if (out) out.write("\x1b[?2004h"); // bracketed paste on: a pasted line break stays inside the value
  stdin.on("data", onData); stdin.once("end", onEnd);
  for (const [sig, fn] of handlers) proc.on(sig, fn);
  stdin.resume();
  return {
    /** One hidden line: a Buffer, or null on Ctrl-C / Ctrl-D / end of input. */
    read: () => new Promise(res => { if (stopped || closed) return res(null); waiting = res; }),
    interrupted: () => stopped,
    close
  };
}

/** Runs wrangler; `input` goes to its stdin. Its output is captured and never returned to the caller's screen. */
function runWrangler(env, args, input, spawnImpl = spawn, creds = false) {
  assertOffline(env, args); // tests never start the real wrangler
  return new Promise(resolve => {
    let out = "";
    let child;
    // allow-listed environment (childEnv refuses target- / endpoint-changing variables); never the caller's whole environment
    try { child = spawnImpl(process.execPath, [wranglerBin(env), ...args], { cwd: BACKEND, stdio: ["pipe", "pipe", "pipe"], env: childEnv(env, { creds }) }); }
    catch { return resolve({ status: 1, out: "" }); }
    child.stdout.on("data", d => { out += d; });
    child.stderr.on("data", () => { /* dropped: it may quote the input */ });
    child.on("error", () => resolve({ status: 1, out: "" }));
    child.on("close", code => resolve({ status: code == null ? 1 : code, out }));
    child.stdin.on("error", () => { /* closed early */ });
    child.stdin.end(input == null ? "" : input);
  });
}

/** Names of the secrets the Worker already has (wrangler secret list prints names only), or null when it cannot answer. */
export function parseSecretNames(out) {
  const j = jsonArray(out);
  return j ? j.map(x => String(x && x.name)).filter(Boolean) : null;
}

/**
 * @param {string[]} argv
 * @param {{stdin?: any, stdout?: any, stderr?: any, env?: any, spawn?: any, random?: (n: number) => Buffer, toml?: string, proc?: any}} [io]
 * @returns {Promise<number>} exit code: 0 ok · 1 a secret failed / Worker not reachable · 2 no terminal / CI / usage · 3 name guard · 130 Ctrl-C
 */
export async function main(argv, io = {}) {
  const stdin = io.stdin || process.stdin, stdout = io.stdout || process.stdout, env = io.env || process.env;
  const say = s => stdout.write(s + "\n");
  if (!stdin.isTTY || !stdout.isTTY) {
    (io.stderr || process.stderr).write("secrets:setup needs a real terminal (stdin and stdout). Run it yourself in your own terminal: it cannot be piped, logged or run by an agent.\n");
    return 2;
  }
  if (env.CI || env.GITHUB_ACTIONS) { say("REFUSED: secrets:setup never runs in CI."); return 2; }
  const envFlags = argv.filter(a => a === "--env" || a.startsWith("--env="));
  if (envFlags.length > 1) { say("REFUSED: --env given more than once. Nothing was sent."); return 2; }
  const ei = argv.findIndex(a => a === "--env" || a.startsWith("--env="));
  const envName = ei < 0 ? ENV : argv[ei] === "--env" ? argv[ei + 1] : argv[ei].slice(6);
  if (typeof envName !== "string" || !Object.hasOwn(ENVS, envName)) {
    say(`unknown environment ${JSON.stringify(String(envName ?? "")).slice(0, 40)}: use --env test (default) or --env production`);
    return 2;
  }
  // production: the owner's explicit go before anything reaches the account (also the read-only listing); a dry run sends nothing
  if (envName === "production" && !argv.includes("--dry-run") && !argv.includes("--confirm-production")) {
    say('REFUSED: secrets for the PRODUCTION Worker "lensiq-prod-api": repeat with --confirm-production once the owner has given the go (owner item 231). Nothing was sent.');
    return 3;
  }
  const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
  if (only && !SECRETS.some(s => s.name === only)) { say(`unknown secret "${String(only).slice(0, 40)}". Names: ${SECRETS.map(s => s.name).join(", ")}`); return 2; }
  // raw mode (no echo) from here to the end of the session, whatever happens
  const term = openTerminal(stdin, io.proc || process, stdout);
  try { return await session(argv, { ...io, stdin, stdout, env, say, term, only, envName }); }
  catch (e) { if (e instanceof GuardError) { say(e.message); return 3; } throw e; }
  finally { term.close(); }
}

async function session(argv, { stdout, env, say, term, only, spawn: spawnImpl, random = randomBytes, toml, envName = ENV }) {
  const creds = argv.includes("--account-confirmed"); // shell credentials reach wrangler only after the owner confirmed the account
  const dry = argv.includes("--dry-run"), listOnly = argv.includes("--list"), replaceKek = argv.includes("--replace-kek");
  const t = readTargets(toml, envName);
  const SECRETS = secretsFor(t.env), REQUIRED_NOW = requiredNow(t.env);
  say(`LENSIQ secrets · environment "${t.env}"`);
  say(`TARGET   Worker "${t.worker}" (secrets are set on this Worker only)`);
  assertTarget("worker", t.worker, t.env);
  // secret commands: --env only. The effective name wrangler resolves is checked for every argument list we build.
  const listArgs = secretArgs.list(t.env), putArgs = (/** @type {string} */ name) => secretArgs.put(name, t.env);
  assertSafeEnv(env);
  for (const a of [listArgs, putArgs("X"), deployedArgs(t)]) assertEffective(a, t);
  if (!dry) {
    assertWranglerBundle(env);
    const refuse = accountEnvRefusal(env, argv, say);
    if (refuse) { say(refuse); return 3; }
    if (!existsSync(wranglerBin(env))) { say("wrangler is not installed: run `npm ci` in backend/ first."); return 1; }
  }

  let have = /** @type {string[]|null} */ ([]);
  if (!dry) {
    say(`CHECK    Worker "${t.worker}" must already be deployed (read-only: npx wrangler ${deployedArgs(t).join(" ")})`);
    const d = await runWrangler(env, deployedArgs(t), null, spawnImpl, creds);
    const deployments = d.status === 0 ? jsonArray(d.out) : null;
    if (!deployments || !deployments.length) {
      const deployCmd = `npm run backend:deploy:${t.env === "production" ? "prod" : "test"}`;
      say(`STOP: Worker "${t.worker}" is not deployed, or wrangler is not logged in. Deploy it first (${deployCmd}) and run "npx wrangler login". ` +
        "A secret is never written to a Worker that does not exist. Nothing was set.");
      return 1;
    }
    say(`COMMAND  (cd backend && npx wrangler ${listArgs.join(" ")})   [names only]`);
    const l = await runWrangler(env, listArgs, null, spawnImpl, creds);
    have = l.status === 0 ? parseSecretNames(l.out) : null;
    if (!have) { say(`STOP: the secrets of Worker "${t.worker}" could not be listed. Nothing was set.`); return 1; }
  }
  const mark = s => (have && have.includes(s.name) ? "set" : "not set");
  say("");
  say("Required now: " + REQUIRED_NOW.join(", "));
  say("Later / optional: " + SECRETS.filter(s => s.when === "later").map(s => s.name).join(", "));
  if (listOnly) { for (const s of SECRETS) say(`  ${s.name.padEnd(22)} ${s.when === "now" ? "required now" : "later       "}  ${dry ? "" : mark(s)}`); return 0; }
  say("Nothing you type is shown, and anything typed between two questions is thrown away. Enter alone = skip that secret. Ctrl-C = stop (nothing more is sent).");

  const stop = () => { say("Stopped. Nothing more was sent."); return 130; };
  const todo = SECRETS.filter(s => (only ? s.name === only : true));
  let failed = 0, n = 0;
  for (const s of todo) {
    if (term.interrupted()) return stop();
    n++;
    say("");
    say(`[${n}/${todo.length}] ${s.name} — ${s.what} · ${s.when === "now" ? "REQUIRED NOW" : "optional"}${dry ? "" : " · currently " + mark(s)}`);
    /** @type {Buffer|null} */ let value = null;
    if (s.name === "SECRETS_KEK" && have && have.includes(s.name) && !replaceKek) {
      say("  kept: SECRETS_KEK already exists and is never replaced (the stored TOTP secret would be lost). Use --replace-kek only on a fresh install.");
      continue;
    }
    if (s.gen) {
      stdout.write(s.typed === false ? "  Enter = generate it now · s + Enter = skip: " : "  Enter = generate it now · s + Enter = skip · or type your own (hidden): ");
      const a = await term.read();
      stdout.write("\n");
      if (a === null) return stop();
      const typed = a.toString("utf8").trim();
      const broken = lineBroken(a, typed);
      a.fill(0);
      if (broken) { say(`  ${s.name}: skipped (${LINE_BREAK_TEXT}; run --only ${s.name} again)`); continue; }
      if (/^s$/i.test(typed)) { say(`  ${s.name}: skipped`); continue; }
      if (typed && s.typed !== false) {
        if (typed.length < (s.min || 1)) { say(`  ${s.name}: skipped (too short: at least ${s.min} characters are needed)`); continue; }
        value = Buffer.from(typed, "utf8");
      } else value = Buffer.from(s.gen === "kek" ? random(32).toString("base64") : random(32).toString("base64url"), "utf8");
    } else {
      for (let tries = 0; tries < 3 && !value; tries++) {
        stdout.write("  type or paste it (hidden), then Enter: ");
        const a = await term.read();
        stdout.write("\n");
        if (a === null) return stop();
        const typed = a.toString("utf8").trim();
        const broken = lineBroken(a, typed);
        a.fill(0);
        if (broken) { say(`  ${s.name}: not accepted: ${LINE_BREAK_TEXT}. Nothing was sent. Try again, or Enter to skip.`); continue; }
        if (!typed) break;
        if (LINE_SECRETS.includes(s.name)) {
          // the SAME check as the Worker (backend/src/line-config.js), stricter token length at entry: a wrong LINE value
          // is refused, never "sent anyway"
          const why = lineSecretProblem(s.name, typed, { entry: true });
          if (why) { say(`  ${s.name}: not accepted: ${why === "too_short" ? LINE_TOKEN_ENTRY_TEXT : LINE_REASON_TEXT[why]}. Nothing was sent. Try again, or Enter to skip.`); continue; }
          value = Buffer.from(typed, "utf8");
          continue;
        }
        if (typed.length < (s.min || 1)) { say(`  too short: at least ${s.min} characters are needed. Try again, or Enter to skip.`); continue; }
        if (s.strong && weakCode(typed)) { say(`  too easy to guess: ${weakCode(typed)}. Try again, or Enter to skip.`); continue; }
        if (s.prefix && !typed.startsWith(s.prefix)) {
          stdout.write(`  this does not look like the usual format for ${s.name}. Send it anyway? y + Enter = yes: `);
          const y = await term.read();
          stdout.write("\n");
          if (y === null) return stop();
          if (!/^y$/i.test(y.toString("utf8").trim())) continue;
        }
        value = Buffer.from(typed, "utf8");
      }
      if (!value) { say(`  ${s.name}: skipped`); continue; }
    }
    if (dry) { say(`  ${s.name}: would be set (dry run, nothing sent)`); value.fill(0); continue; }
    say(`  COMMAND  (cd backend && <value on stdin> | npx wrangler ${putArgs(s.name).join(" ")})   -> Worker "${assertEffective(putArgs(s.name), t).name}"`);
    const r = await runWrangler(env, putArgs(s.name), value, spawnImpl, creds);
    if (r.status !== 0) { failed++; say(`  ${s.name}: FAILED (exit ${r.status})`); value.fill(0); continue; }
    say(`  ${s.name}: set`);
    if (s.showOnce && s.gen && !(await showOnce(term, stdout, s.name, value))) { value.fill(0); return stop(); }
    value.fill(0);
  }
  say("");
  say(failed ? `Done with ${failed} failure(s). Run the command again for the failed ones.` : "Done. Each secret that was set is live on the Worker now (a new version per secret).");
  return failed ? 1 : 0;
}

/** Shows a generated value once, waits for Enter, then erases the lines from the visible screen. */
async function showOnce(term, stdout, name, value) {
  stdout.write(`\n  ${name} — shown ONCE. Copy it now (you paste it into the admin page), then press Enter:\n  `);
  stdout.write(value);
  stdout.write("\n  Enter = I have copied it (the line is erased): ");
  const a = await term.read();
  // erase the three lines (cursor up + clear line). This clears the visible screen only.
  stdout.write("\r\x1b[2K\x1b[1A\x1b[2K\x1b[1A\x1b[2K\x1b[1A\x1b[2K");
  stdout.write(`  ${name}: shown once and erased from this screen.\n`);
  stdout.write("  NOTE: the terminal's scroll-back, tmux or a screen recording may still hold it. Clear the terminal when you are done\n" +
    "  (macOS Terminal / VS Code: Cmd-K).\n");
  if (name === "ADMIN_BOOTSTRAP_TOKEN") {
    stdout.write("  The token is replaced by a random value right after the owner account is created (npm run backend:bootstrap:close),\n" +
      "  so a copy left on screen stops working then.\n");
  }
  if (a) a.fill(0);
  return a !== null;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main(process.argv.slice(2)).then(c => process.exit(c));
