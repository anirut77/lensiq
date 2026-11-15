// tools/lib/cf-guard.mjs — Cloudflare account safety for every LENSIQ deploy script (owner rule 2026-11-10).
//
// The owner's Cloudflare account is SHARED with other projects. LENSIQ may create and change only its own, clearly named
// resources. Every script that would create or change a Cloudflare resource:
//   1. reads the target names from backend/wrangler.toml [env.test] (never from a free-typed argument),
//   2. PRINTS the target before anything else,
//   3. calls assertTarget(): the name must start with "lensiq-", must be one of the names this repo deploys
//      (ALLOWED) and must not be one of the owner's other resources (PROTECTED). A refusal throws GuardError BEFORE
//      wrangler is started (scripts exit with code 3),
//   4. starts wrangler only through wrangler() below, which works out the EFFECTIVE target of that exact argument list
//      the way wrangler itself resolves it (effectiveTarget) and refuses unless it is exactly ALLOWED.
//
// Why step 4 exists (review finding 2026-11-10): wrangler does not resolve names the same way in every command.
//   deploy, rollback, versions *, deployments *   script = --name ?? the environment's `name`
//   secret put | list | delete | bulk, tail       script = `${--name}-${--env}` when BOTH are given (getLegacyScriptName),
//                                                  else --name ?? the environment's `name`
// So `secret put X --env test --name lensiq-api-test` would target "lensiq-api-test-test" and, with piped input,
// silently create a DRAFT Worker of that name. Secret commands therefore get `--env test` ONLY, whose name is read from
// [env.test] (= "lensiq-api-test"; checked with wrangler's own config reader in tests/integration). assertWranglerBundle()
// re-checks these rules against the INSTALLED wrangler before any mutating action, so an upgrade that changes them stops
// the scripts instead of redirecting them.
// D1 commands take the database NAME as an argument but act on the database_id written in [env.test]: verifyD1() checks
// (read-only `d1 list --json`) that this id really is the database named "lensiq-test" before anything is written.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BACKEND = join(REPO, "backend");
export const WRANGLER_TOML = join(BACKEND, "wrangler.toml");
export const ENV = "test";
/** The owner's other resources in the same account: never a target. */
export const PROTECTED = Object.freeze(["dearday-staging", "aidanex-staging", "aidanex-pet-clinic-pilot", "faksak.com", "tripsdna.com"]);
/** The only resources LENSIQ scripts may create or change. */
export const ALLOWED = Object.freeze({ worker: "lensiq-api-test", d1: "lensiq-test" });
export const D1_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
const NAME_RE = /^lensiq-[a-z0-9][a-z0-9-]{0,50}$/;

export class GuardError extends Error {}

/** Throws GuardError unless `name` is a LENSIQ resource of that kind. @param {"worker"|"d1"} kind @param {unknown} name */
export function assertTarget(kind, name) {
  const n = typeof name === "string" ? name : "";
  const why = !n ? "no target name" : PROTECTED.includes(n.toLowerCase()) ? "it is one of the owner's other resources"
    : !NAME_RE.test(n) ? 'the name does not start with "lensiq-"' : ALLOWED[kind] !== n ? `the only ${kind} this repo deploys is "${ALLOWED[kind]}"` : "";
  if (why) throw new GuardError(`REFUSED: ${kind} target "${n}" — ${why}. Nothing was sent to Cloudflare.`);
  return n;
}

/** Body of one TOML table ("[env.test]" or "[[env.test.d1_databases]]") up to the next table header. */
function section(toml, header) {
  const lines = String(toml).split(/\r?\n/);
  const at = lines.findIndex(l => l.trim() === header);
  if (at < 0) return "";
  const out = [];
  for (let i = at + 1; i < lines.length && !/^\s*\[/.test(lines[i]); i++) out.push(lines[i]);
  return out.join("\n");
}
const str = (body, key) => { const m = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m").exec(body); return m ? m[1] : ""; };
/** key = "value" pairs of a table body (comments skipped). */
export function pairs(body) {
  return Object.fromEntries([...String(body).matchAll(/^([A-Za-z0-9_]+)\s*=\s*(?:"([^"]*)"|(true|false|[\d.]+))\s*(?:#.*)?$/gm)].map(m => [m[1], m[2] ?? m[3]]));
}

/** Target names and settings of [env.test] in wrangler.toml text. */
export function readTargets(toml = readFileSync(WRANGLER_TOML, "utf8")) {
  const env = section(toml, `[env.${ENV}]`), d1 = section(toml, `[[env.${ENV}.d1_databases]]`);
  return {
    env: ENV, worker: str(env, "name"), workersDev: /^\s*workers_dev\s*=\s*true\s*$/m.test(env), previewUrls: /^\s*preview_urls\s*=\s*true\s*$/m.test(env),
    d1: str(d1, "database_name"), d1Id: str(d1, "database_id"), d1Binding: str(d1, "binding"),
    vars: pairs(section(toml, `[env.${ENV}.vars]`)), topVars: pairs(section(toml, "[vars]")), topName: str(toml.split(/^\[/m)[0], "name"),
    observability: pairs(section(toml, `[env.${ENV}.observability]`)),
    crons: (/crons\s*=\s*\[([^\]]*)\]/.exec(section(toml, `[env.${ENV}.triggers]`)) || ["", ""])[1].split(",").map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean)
  };
}

/** wrangler.toml text with the [env.test] D1 id set. Only that one line changes. @param {string} toml @param {string} id */
export function fillDatabaseId(toml, id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(id)) || id === D1_PLACEHOLDER) throw new Error("not a D1 database id");
  const lines = String(toml).split(/\r?\n/);
  const at = lines.findIndex(l => l.trim() === `[[env.${ENV}.d1_databases]]`);
  if (at < 0) throw new Error("no [[env.test.d1_databases]] table in wrangler.toml");
  for (let i = at + 1; i < lines.length && !/^\s*\[/.test(lines[i]); i++) {
    if (/^\s*database_id\s*=/.test(lines[i])) { lines[i] = `database_id = "${id}"`; return lines.join("\n"); }
  }
  throw new Error("no database_id line in [[env.test.d1_databases]]");
}

/** JSON array in a wrangler answer (it may print a banner first), or null. */
export function jsonArray(output) {
  const text = String(output || "");
  for (let at = text.indexOf("["); at >= 0; at = text.indexOf("[", at + 1)) {
    try { const j = JSON.parse(text.slice(at)); if (Array.isArray(j)) return j; } catch { /* not here */ }
  }
  return null;
}

/** The database id in the output of `wrangler d1 create` / an entry of `wrangler d1 list --json` for `name`. */
export function parseDatabaseId(output, name) {
  const text = String(output || "");
  const j = jsonArray(text);
  const row = j ? j.find(d => d && d.name === name) : null;
  if (row && typeof row.uuid === "string") return row.uuid;
  const m = /"?database_id"?\s*[=:]\s*"([0-9a-f-]{36})"/.exec(text);
  return m ? m[1] : "";
}

/* ---------------- how wrangler resolves the target of an argument list ---------------- */
const flagOf = (args, long, short) => {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === long || (short && args[i] === short)) return args[i + 1];
    if (args[i].startsWith(long + "=")) return args[i].slice(long.length + 1);
  }
  return undefined;
};
/** Commands whose script name is `${name}-${env}` when both flags are given (wrangler getLegacyScriptName). */
const LEGACY = new Set(["secret", "tail"]);
/** Commands whose script name is --name ?? the environment's name. */
const PLAIN = new Set(["deploy", "rollback", "versions", "deployments"]);

/**
 * The resource a wrangler argument list acts on, resolved the way the installed wrangler does it.
 * @param {string[]} args @param {{worker: string, d1: string}} cfg names of [env.test] in wrangler.toml
 * @returns {{kind: "worker"|"d1"|"none", name: string}}  Throws GuardError for a command these tools do not use.
 */
export function effectiveTarget(args, cfg) {
  const sub = args[0], name = flagOf(args, "--name"), env = flagOf(args, "--env", "-e");
  if (sub === "whoami") return { kind: "none", name: "" };
  // the configuration wrangler will read: [env.test] only when --env test is given; otherwise the template's top level
  const cfgName = env === ENV ? cfg.worker : env == null ? "(top-level name: not a LENSIQ deploy target)" : `(unknown environment ${env})`;
  if (LEGACY.has(sub) || (sub === "versions" && args[1] === "secret")) return { kind: "worker", name: name && env ? `${name}-${env}` : name ?? cfgName };
  if (PLAIN.has(sub)) return { kind: "worker", name: name ?? cfgName };
  if (sub === "d1") {
    if (args[1] === "list") return { kind: "none", name: "" };
    if (args[1] === "create" || args[1] === "execute") return { kind: "d1", name: String(args[2] || "") };
    if (args[1] === "migrations" && (args[2] === "apply" || args[2] === "list")) return { kind: "d1", name: String(args[3] || "") };
  }
  throw new GuardError(`REFUSED: "wrangler ${args.slice(0, 3).join(" ")}" is not a command LENSIQ scripts run. Nothing was sent to Cloudflare.`);
}
/** Throws GuardError unless the EFFECTIVE target of `args` is LENSIQ's own resource. Returns the target. */
export function assertEffective(args, cfg) {
  const t = effectiveTarget(args, cfg);
  if (t.kind !== "none") assertTarget(t.kind, t.name);
  if (t.kind === "d1" && args[1] !== "create" && flagOf(args, "--env", "-e") !== ENV && !args.includes("--local")) {
    throw new GuardError("REFUSED: a D1 command without --env test would read the template's database entry. Nothing was sent to Cloudflare.");
  }
  return t;
}

export const WRANGLER_BUNDLE = join(BACKEND, "node_modules", "wrangler", "wrangler-dist", "cli.js");
/** The resolution rules effectiveTarget() models, as they appear in wrangler's bundle (checked for wrangler 4.158.0). */
export const BUNDLE_RULES = Object.freeze([
  ["getLegacyScriptName", "return args.name && args.env ? `${args.name}-${args.env}` : args.name ?? config2.name;"],
  ["getScriptName", "function getScriptName(args, config2) {\n  return args.name ?? config2.name;\n}"]
]);
/** {ok, problems[]}: does the installed wrangler still resolve names the way effectiveTarget() assumes? */
export function checkWranglerBundle(file = WRANGLER_BUNDLE) {
  let src;
  try { src = readFileSync(file, "utf8"); } catch { return { ok: false, problems: ["wrangler is not installed (backend/node_modules): run `npm ci` in backend/"] }; }
  const problems = [];
  for (const [what, text] of BUNDLE_RULES) if (!src.includes(text)) problems.push(`${what} no longer has the expected body`);
  const lines = src.split("\n");
  // every secret command must use the legacy rule, and deploy / rollback / versions / deployments the plain one
  const uses = { legacy: new Set(), plain: new Set() };
  lines.forEach((l, i) => {
    const legacy = /= getLegacyScriptName\(/.test(l), plain = /= getScriptName\(args, config2\)|= args\.name \?\? config2\.name;/.test(l);
    if (!legacy && !plain) return;
    for (let j = i; j > i - 140 && j >= 0; j--) { const m = /description: "([^"]{0,80})/.exec(lines[j]); if (m) { uses[legacy ? "legacy" : "plain"].add(m[1]); break; } }
  });
  const need = (set, re, what) => { if (![...set].some(d => re.test(d))) problems.push(`${what}: name resolution not found where expected`); };
  need(uses.legacy, /^Create or update a secret for a Worker/, "secret put");
  need(uses.legacy, /^List all secrets for a Worker/, "secret list");
  need(uses.legacy, /^Delete a secret from a Worker/, "secret delete");
  need(uses.plain, /Rollback a deployment for a Worker/, "rollback");
  need(uses.plain, /^List the 10 most recent Versions/, "versions list");
  need(uses.plain, /^Displays the 10 most recent deployments/, "deployments list");
  if ([...uses.plain].some(d => /secret/i.test(d))) problems.push("a secret command uses the plain rule: re-check effectiveTarget()");
  return { ok: !problems.length, problems };
}

/* ---------------- the environment wrangler is started with ----------------
 * wrangler reads many environment variables; some change WHICH Worker or WHICH API it talks to without any argument
 * (WRANGLER_CI_OVERRIDE_NAME replaces the Worker name of `deploy`; CLOUDFLARE_ENV selects an environment;
 * CLOUDFLARE_API_BASE_URL sends everything to another endpoint). So:
 *   - wrangler never inherits the caller's environment: childEnv() builds it from an allow-list;
 *   - any variable of the classes "target" or "endpoint" below, and any WRANGLER_* / CLOUDFLARE_* / CF_* variable this
 *     table does not know (a newer wrangler), is a REFUSAL (GuardError naming the variable, before anything starts);
 *   - credentials are passed on only for read-only actions and after --account-confirmed (accountEnvRefusal).
 * The classes list every such variable named in the installed wrangler 4.158.0 bundle (docs/DEPLOY.md section 0).
 */
export const ENV_CLASS = Object.freeze({
  /** identify the account / the caller: replace `wrangler login` */
  credential: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_KEY", "CLOUDFLARE_EMAIL", "CLOUDFLARE_API_USER_SERVICE_KEY", "CF_API_TOKEN", "CF_ACCOUNT_ID",
    "CF_API_KEY", "CF_EMAIL"],
  /** change which Worker, environment or configuration a command acts on */
  target: ["WRANGLER_CI_OVERRIDE_NAME", "WRANGLER_CI_MATCH_TAG", "WRANGLER_CI_GENERATE_PREVIEW_ALIAS", "WRANGLER_CI_OVERRIDE_NETWORK_MODE_HOST", "WRANGLER_CI_DISABLE_CONFIG_WATCHING",
    "CLOUDFLARE_ENV", "CLOUDFLARE_INCLUDE_PROCESS_ENV", "CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV", "WRANGLER_C3_COMMAND", "WRANGLER_BUILD_CONDITIONS", "WRANGLER_BUILD_PLATFORM",
    "WRANGLER_D1_EXTRA_LOCATION_CHOICES", "WRANGLER_DISABLE_SUBDOMAIN_MIXED_STATE_CHECK", "WRANGLER_OUTPUT_FILE_DIRECTORY", "WRANGLER_OUTPUT_FILE_PATH", "WRANGLER_REGISTRY_PATH",
    "CLOUDFLARE_PAGES", "CLOUDFLARE_WORKERS", "CLOUDFLARE_PREVIEW_BUILD", "CF_PAGES", "CF_PAGES_COMMIT_SHA", "CF_PAGES_UPLOAD_JWT", "CF_BUILD_ID", "CF_PULL_REQUEST_ID", "CF_PULL_REQUEST_NUMBER"],
  /** change which API, login service or network path is used, or add authentication to it */
  endpoint: ["WRANGLER_API_ENVIRONMENT", "CLOUDFLARE_API_ENVIRONMENT", "CLOUDFLARE_API_BASE_URL", "CF_API_BASE_URL", "CLOUDFLARE_BASE_URL", "CLOUDFLARE_COMPLIANCE_REGION",
    "WRANGLER_AUTH_DOMAIN", "WRANGLER_AUTH_URL", "WRANGLER_TOKEN_URL", "WRANGLER_REVOKE_URL", "WRANGLER_CLIENT_ID", "CLOUDFLARE_CLIENT_ID", "WRANGLER_CF_AUTHORIZATION_TOKEN",
    "CLOUDFLARE_CF_AUTH", "CLOUDFLARE_ACCESS_CLIENT_ID", "CLOUDFLARE_ACCESS_CLIENT_SECRET", "WRANGLER_BASIN_SQL_AUTH_TOKEN", "CLOUDFLARE_CONTAINER_REGISTRY", "WRANGLER_DOCKER_HOST",
    "WRANGLER_DOCKER_BIN", "WRANGLER_HTTPS_CERT_PATH", "WRANGLER_HTTPS_KEY_PATH", "WRANGLER_DISABLE_REQUEST_BODY_DRAINING", "WRANGLER_CONTAINER_IMAGE_COMPRESSION"],
  /** cannot change a target: passed on */
  harmless: ["WRANGLER_HIDE_BANNER", "WRANGLER_SEND_METRICS", "WRANGLER_SEND_ERROR_REPORTS", "WRANGLER_LOG", "WRANGLER_LOG_PATH", "WRANGLER_LOG_SANITIZE", "WRANGLER_WRITE_LOGS",
    "WRANGLER_CACHE_DIR", "WRANGLER_NO_SKILLS_UPDATE_PROMPTS", "WRANGLER_DISABLE_EXPERIMENTAL_WARNING", "WRANGLER_TRACE_ID", "CLOUDFLARE_AUTH_USE_KEYRING"]
});
/** Prefix families that also count: per-binding connection strings. */
const ENV_PREFIX_REFUSED = ["WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_", "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_"];
/** Ordinary variables wrangler needs to run and to find the owner's login. Proxies and extra CA files are NOT passed. */
const ENV_BASE = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TERM", "COLORTERM", "TERM_PROGRAM", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TZ", "NO_COLOR", "FORCE_COLOR",
  "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP"];
const isSet = v => typeof v === "string" && v.trim() !== "";

/** [{name, class}] of every set variable that must stop a run ("target", "endpoint" or "unknown"). */
export function dangerousEnv(env) {
  const out = [];
  for (const [k, v] of Object.entries(env || {})) {
    if (!isSet(v) || !/^(WRANGLER|CLOUDFLARE|CF)_/.test(k)) continue;
    const cls = ENV_CLASS.target.includes(k) || ENV_PREFIX_REFUSED.some(p => k.startsWith(p)) ? "target" : ENV_CLASS.endpoint.includes(k) ? "endpoint"
      : ENV_CLASS.credential.includes(k) || ENV_CLASS.harmless.includes(k) ? "" : "unknown";
    if (cls) out.push({ name: k, class: cls });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
/** Throws GuardError (naming the variables, never their values) when a target- or endpoint-changing variable is set. */
export function assertSafeEnv(env) {
  const bad = dangerousEnv(env);
  if (!bad.length) return;
  const why = { target: "it can change which Worker or configuration wrangler acts on", endpoint: "it can change which API or login service wrangler talks to",
    unknown: "these scripts do not know what it does in this wrangler version" };
  throw new GuardError("REFUSED: " + bad.map(b => `${b.name} is set (${why[b.class]})`).join("; ") + ". Unset it and run again. Nothing was sent to Cloudflare.");
}
/**
 * The environment wrangler is started with: an allow-list, never the caller's whole environment.
 * @param {any} env the caller's environment @param {{creds?: boolean}} [o] creds: also pass the Cloudflare credential
 *   variables (read-only actions, or after the owner confirmed the account)
 */
export function childEnv(env, o = {}) {
  assertSafeEnv(env);
  const out = {};
  for (const k of [...ENV_BASE, ...ENV_CLASS.harmless, ...(o.creds ? ENV_CLASS.credential : [])]) if (isSet(env[k])) out[k] = env[k];
  if (env.NODE_ENV === "test") for (const k of ["NODE_ENV", "LQ_WRANGLER_BIN", "LQ_FAKE_LOG", "LQ_FAKE_MODE"]) if (isSet(env[k])) out[k] = env[k]; // the test fake only
  return out;
}

/** The wrangler entry script. LQ_WRANGLER_BIN (a fake, for tests) is honoured only with NODE_ENV=test. */
export function wranglerBin(env = process.env) {
  if (env.LQ_WRANGLER_BIN && env.NODE_ENV === "test") return env.LQ_WRANGLER_BIN;
  return join(BACKEND, "node_modules", "wrangler", "bin", "wrangler.js");
}
const isFake = env => !!(env.LQ_WRANGLER_BIN && env.NODE_ENV === "test");
/** Throws GuardError when the installed wrangler no longer matches the resolution rules (skipped for the test fake). */
export function assertWranglerBundle(env = process.env) {
  if (isFake(env)) return;
  const r = checkWranglerBundle();
  if (!r.ok) throw new GuardError(`REFUSED: the installed wrangler does not resolve Worker names as these scripts expect (${r.problems.join("; ")}). Nothing was sent to Cloudflare.`);
}

/** Names of Cloudflare credential variables set in the environment (they override `wrangler login`). */
export const accountEnvSet = env => ENV_CLASS.credential.filter(k => isSet(env[k]));
/**
 * A token or account id in the environment silently replaces the owner's `wrangler login` (it could belong to another
 * account). Mutating actions are refused unless the owner confirmed the account `whoami` shows (--account-confirmed).
 * Returns null (fine) or the refusal text; always prints the warning. Values are never printed.
 */
export function accountEnvRefusal(env, argv, print) {
  const set = accountEnvSet(env);
  if (!set.length) return null;
  print(`WARNING  ${set.join(", ")} ${set.length > 1 ? "are" : "is"} set in this shell: wrangler will use ${set.length > 1 ? "them" : "it"} INSTEAD of your "wrangler login".`);
  if (argv.includes("--account-confirmed")) { print("         --account-confirmed given: the owner has confirmed the account shown by `npm run backend:whoami`."); return null; }
  return "REFUSED: run `npm run backend:whoami`, let the owner confirm that the account shown is the right one, then repeat with `-- --account-confirmed` " +
    "(or unset the variable). Nothing was sent to Cloudflare.";
}

/**
 * Runs wrangler (cwd backend/) after printing the target and the exact command, and after checking the EFFECTIVE target
 * of these arguments (assertEffective; GuardError before anything starts). opts.input is written to stdin and never
 * printed. Returns {status, stdout, stderr}.
 * @param {string[]} args @param {{input?: string, print?: (s: string) => void, printOnly?: boolean, capture?: boolean,
 *   quiet?: boolean, creds?: boolean, target: string, env?: any, cfg?: {worker: string, d1: string}}} opts
 */
export function wrangler(args, opts) {
  const print = opts.print || (s => console.log(s));
  const callerEnv = opts.env || process.env;
  // allow-listed environment; refuses (before anything is printed or started) when a target- or endpoint-changing variable is set
  const cenv = childEnv(callerEnv, { creds: opts.creds === true });
  const eff = assertEffective(args, opts.cfg || readTargets());
  if (!opts.quiet) {
    print(`TARGET   ${opts.target}${eff.kind === "none" ? "" : ` · wrangler resolves this command to ${eff.kind === "d1" ? "D1" : "Worker"} "${eff.name}"`}`);
    print(`COMMAND  (cd backend &&${opts.input != null ? " <value on stdin> |" : ""} npx wrangler ${args.map(a => (/[\s"';]/.test(a) ? JSON.stringify(a) : a)).join(" ")})`);
  }
  if (opts.printOnly) return { status: 0, stdout: "", stderr: "", printed: true };
  const bin = wranglerBin(callerEnv);
  if (!existsSync(bin)) throw new Error("wrangler is not installed: run `npm ci` in backend/ first");
  const r = spawnSync(process.execPath, [bin, ...args], { cwd: BACKEND, input: opts.input, encoding: "utf8",
    stdio: [opts.input != null ? "pipe" : "inherit", opts.capture ? "pipe" : "inherit", opts.capture ? "pipe" : "inherit"], env: cenv });
  return { status: r.status == null ? 1 : r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

/** Read-only argument lists of the two existence checks. */
export const deployedArgs = t => ["deployments", "list", "--env", ENV, "--name", t.worker, "--json"];
export const D1_LIST_ARGS = ["d1", "list", "--json"];

/**
 * Read-only: is the Worker deployed? `secret put` on a Worker that does not exist creates a DRAFT Worker, so every
 * secret path asks this first and refuses otherwise. @returns {boolean}
 */
export function workerDeployed(t, o) {
  const r = wrangler(deployedArgs(t), { ...o, capture: true, quiet: true, cfg: t, target: "" });
  const j = r.status === 0 ? jsonArray(r.stdout) : null;
  return !!(j && j.length);
}

/**
 * Read-only: the database_id in [env.test] must be the id of the database NAMED "lensiq-test" in the account.
 * Returns "" when it is, else the reason. @param {ReturnType<typeof readTargets>} t
 */
export function verifyD1(t, o) {
  if (t.d1Id === D1_PLACEHOLDER) return 'the D1 id is still the placeholder (run "npm run backend:d1:create")';
  const r = wrangler(D1_LIST_ARGS, { ...o, capture: true, quiet: true, cfg: t, target: "" });
  const j = r.status === 0 ? jsonArray(r.stdout) : null;
  if (!j) return "the account's D1 databases could not be listed (not logged in?)";
  const byId = j.find(d => d && d.uuid === t.d1Id), byName = j.find(d => d && d.name === t.d1);
  if (!byId) return `no database in this account has the id written in wrangler.toml [env.test]`;
  if (byId.name !== t.d1) return `the id in wrangler.toml [env.test] belongs to the database "${String(byId.name).slice(0, 60)}", not "${t.d1}"`;
  if (!byName || byName.uuid !== t.d1Id) return `the database "${t.d1}" has another id than wrangler.toml [env.test]`;
  return "";
}
