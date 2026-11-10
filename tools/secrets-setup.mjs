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
//
//   npm run secrets:setup                           all "required now" secrets, then the optional ones
//   npm run secrets:setup -- --only TESTER_ACCESS_CODE     one secret (rotation: the old code stops working at once)
//   npm run secrets:setup -- --list                 names, required / later, set or not (names only; needs a terminal too)
//   npm run secrets:setup -- --dry-run              ask, check the shape, send nothing
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
// the ONE definition of a usable tester code: the Worker refuses a weak configured code too (backend/src/tester.js)
import { weakCode } from "../backend/src/tester.js";
import {
  BACKEND, ENV, GuardError, accountEnvRefusal, assertEffective, assertSafeEnv, assertTarget, assertWranglerBundle, childEnv, deployedArgs, jsonArray, readTargets, wranglerBin
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
  { name: "OPENFDA_API_KEY", when: "later", min: 20, what: "optional: free openFDA key (raises its daily request limit)" }
]);
export const REQUIRED_NOW = SECRETS.filter(s => s.when === "now").map(s => s.name);

/** The wrangler argument lists of this tool: secret commands get `--env test` ONLY (cf-guard.mjs explains why). */
export const secretArgs = Object.freeze({
  list: () => ["secret", "list", "--env", ENV, "--format", "json"],
  /** @param {string} name */
  put: name => ["secret", "put", name, "--env", ENV]
});

export { weakCode };

const CTRL_C = 3, BACKSPACE = [8, 127];
/**
 * The terminal for the whole session: raw mode (no echo) from open() to close(). Input that arrives while no prompt is
 * waiting (for example while wrangler runs) is DISCARDED, never shown and never part of a later value; Ctrl-C at such a
 * moment is remembered (interrupted()). close() restores the terminal; it is also called from the signal handlers.
 */
export function openTerminal(stdin, proc = process) {
  const raw = typeof stdin.setRawMode === "function";
  /** @type {null | ((v: Buffer|null) => void)} */ let waiting = null;
  /** @type {number[]} */ let bytes = [];
  let esc = 0, stopped = false, closed = false;
  const settle = v => { const w = waiting; waiting = null; bytes.fill(0); bytes = []; esc = 0; if (w) w(v); };
  const onData = chunk => {
    for (const b of Buffer.from(chunk)) {
      if (!waiting) { if (b === CTRL_C || b === 4) stopped = true; continue; } // stray input between prompts: dropped
      if (esc === 1) { esc = b === 91 || b === 79 ? 2 : 0; continue; }          // ESC [ … / ESC O … (arrow keys, paste marks)
      if (esc === 2) { if (b >= 64 && b <= 126) esc = 0; continue; }
      if (b === 27) { esc = 1; continue; }
      if (b === CTRL_C || b === 4) { stopped = true; settle(null); continue; }
      if (b === 13 || b === 10) { settle(Buffer.from(bytes)); continue; }
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
    if (raw) { try { stdin.setRawMode(false); } catch { /* terminal already gone */ } }
    stdin.pause();
    settle(null);
  };
  /** @type {[string, () => void][]} */
  const handlers = [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]].map(([sig, code]) => [String(sig), () => { close(); proc.exit(Number(code)); }]);
  if (raw) stdin.setRawMode(true);
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
  const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
  if (only && !SECRETS.some(s => s.name === only)) { say(`unknown secret "${String(only).slice(0, 40)}". Names: ${SECRETS.map(s => s.name).join(", ")}`); return 2; }
  // raw mode (no echo) from here to the end of the session, whatever happens
  const term = openTerminal(stdin, io.proc || process);
  try { return await session(argv, { ...io, stdin, stdout, env, say, term, only }); }
  catch (e) { if (e instanceof GuardError) { say(e.message); return 3; } throw e; }
  finally { term.close(); }
}

async function session(argv, { stdout, env, say, term, only, spawn: spawnImpl, random = randomBytes, toml }) {
  const creds = argv.includes("--account-confirmed"); // shell credentials reach wrangler only after the owner confirmed the account
  const dry = argv.includes("--dry-run"), listOnly = argv.includes("--list"), replaceKek = argv.includes("--replace-kek");
  const t = readTargets(toml);
  say(`LENSIQ secrets · environment "${t.env}"`);
  say(`TARGET   Worker "${t.worker}" (secrets are set on this Worker only)`);
  assertTarget("worker", t.worker);
  // secret commands: --env only. The effective name wrangler resolves is checked for every argument list we build.
  const listArgs = secretArgs.list(), putArgs = secretArgs.put;
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
      say(`STOP: Worker "${t.worker}" is not deployed, or wrangler is not logged in. Deploy it first (npm run backend:deploy:test) and run "npx wrangler login". ` +
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
      a.fill(0);
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
        a.fill(0);
        if (!typed) break;
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
