#!/usr/bin/env node
// tools/pages-deploy-guard.mjs — the ONLY way the production site reaches Cloudflare Pages (production move step A4).
//
// Where it runs: on the owner's machine after `npx wrangler login`, like every other change to the shared Cloudflare account
// (tools/backend-deploy.mjs). NEVER in CI: the locked rule of tests/unit/deploy-tools.test.js ("no deploy script or
// Cloudflare credential in CI", evals-locks/leads.sha256) forbids a Cloudflare token in any workflow, so
// .github/workflows/deploy-prod.yml only builds and verifies the bundle (owner decision pending: see the round report).
//
// It refuses unless
//   - the project is exactly "lensiq-prod-site" (a production name, tools/lib/cf-guard.mjs isProdName) and the operator typed
//     the same name again as --confirm;
//   - it is not CI, and no wrangler variable that changes the target or the endpoint is set (cf-guard assertSafeEnv);
//   - the checkout is exactly origin/main with a clean tree, and CI succeeded for that commit (`gh run list`);
//   - a Cloudflare credential variable in the shell is used only after --account-confirmed (cf-guard accountEnvSet);
//   - the site folder exists, has index.html and _headers, its lensiq-config.js carries the customer lock
//     (tools/build-site.mjs CUSTOMER_LOCK) and no file is over 25 MiB.
//
//   node tools/pages-deploy-guard.mjs --check --project lensiq-prod-site --confirm lensiq-prod-site [--dir _site-prod]
//   node tools/pages-deploy-guard.mjs --run   --project lensiq-prod-site --confirm lensiq-prod-site --dir _site-prod
// --check starts nothing (without --dir: the inputs, the checkout and the environment only). --run checks everything, then
// starts wrangler (backend/node_modules) with exactly  pages deploy <dir> --project-name lensiq-prod-site --branch main
// and an allow-listed environment (cf-guard childEnv). First run only with the owner's item 232 (first public deploy).
// Exit 0 ok · 1 refused / failed · 2 usage.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BACKEND, GuardError, PROD_PAGES_PROJECT, REPO, accountEnvSet, assertOffline, assertSafeEnv, childEnv, isProdName, wranglerBin } from "./lib/cf-guard.mjs";
import { CUSTOMER_LOCK } from "./build-site.mjs";
import { oversized } from "./build-prod-site.mjs";

export const PROJECT = PROD_PAGES_PROJECT;

/** The exact wrangler argument list. Throws for any other project. @param {string} dir @param {string} project */
export function pagesDeployArgs(dir, project) {
  if (project !== PROJECT || !isProdName(project)) throw new GuardError(`REFUSED: Pages project "${String(project).slice(0, 60)}" is not "${PROJECT}".`);
  return ["pages", "deploy", dir, "--project-name", project, "--branch", "main"];
}

/** The checkout: HEAD, origin/main and whether the tree is clean (read-only git). */
export function gitState(cwd = REPO) {
  const git = (/** @type {string[]} */ a) => { try { return execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
  return { head: git(["rev-parse", "HEAD"]), main: git(["rev-parse", "origin/main"]), clean: git(["status", "--porcelain", "--untracked-files=no"]) === "" };
}
/** Did the CI workflow succeed for this commit? (read-only `gh run list`) @param {string} sha */
export function ciGreen(sha) {
  if (!/^[0-9a-f]{40}$/.test(sha)) return false;
  try {
    const n = execFileSync("gh", ["run", "list", "--workflow", "CI", "--commit", sha, "--status", "success", "--json", "databaseId", "--jq", "length"],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return Number(n) >= 1;
  } catch { return false; }
}

/**
 * Everything that stops a deploy ([] = go). Names and reasons only, never a value.
 * @param {{env: any, project: string, confirm: string, dir: string, skipDir?: boolean, accountConfirmed?: boolean,
 *   git: {head: string, main: string, clean: boolean}, ci: boolean}} o @returns {string[]}
 */
export function deployProblems(o) {
  const env = o.env || {}, out = [];
  if (o.project !== PROJECT || !isProdName(o.project)) out.push(`project "${String(o.project ?? "").slice(0, 60)}" is not the production Pages project "${PROJECT}"`);
  if (o.confirm !== o.project) out.push("--confirm must repeat the project name exactly");
  if (env.CI || env.GITHUB_ACTIONS) out.push("never from CI: the production site is deployed from the owner's machine after `npx wrangler login` (no Cloudflare credential in any workflow)");
  try { assertSafeEnv(env); } catch (e) { out.push(String(/** @type {Error} */ (e).message).replace(/^REFUSED: /, "")); }
  const creds = accountEnvSet(env);
  if (creds.length && !o.accountConfirmed) {
    out.push(`${creds.join(", ")} set in this shell would replace your wrangler login: run npm run backend:whoami, confirm the account, then add --account-confirmed (or unset it)`);
  }
  const g = o.git || { head: "", main: "", clean: false };
  if (!g.head || !g.main || g.head !== g.main) out.push("only the commit at origin/main is deployed (git fetch, then check out origin/main)");
  if (!g.clean) out.push("the checkout has uncommitted changes: deploy only a clean origin/main");
  if (!o.ci) out.push(`CI has not succeeded for ${String(g.head || "this commit").slice(0, 12)} (gh run list --workflow CI)`);
  if (o.skipDir) return out;
  const dir = String(o.dir || "");
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) out.push(`site folder ${dir || "(none)"} not found (build it with node tools/build-prod-site.mjs)`);
  else {
    for (const f of ["index.html", "_headers", "lensiq-config.js"]) if (!existsSync(join(dir, f))) out.push(`site folder: ${f} is missing`);
    const cfg = join(dir, "lensiq-config.js");
    if (existsSync(cfg) && !readFileSync(cfg, "utf8").startsWith(CUSTOMER_LOCK)) out.push("site folder: lensiq-config.js has no customer lock (build it with node tools/build-prod-site.mjs)");
    for (const b of oversized(dir)) out.push(`site folder: ${b.file} is over 25 MiB`);
  }
  return out;
}

/** @param {string[]} argv @param {{print?: (s: string) => void, env?: any, git?: {head: string, main: string, clean: boolean}, ciGreen?: (sha: string) => boolean}} [io]
 *  @returns {number} */
export function main(argv, io = {}) {
  const print = io.print || (s => console.log(s));
  const env = io.env || process.env;
  const arg = k => (argv.includes(k) ? String(argv[argv.indexOf(k) + 1] ?? "") : "");
  const mode = argv.includes("--run") ? "run" : argv.includes("--check") ? "check" : "";
  if (!mode) { print("usage: node tools/pages-deploy-guard.mjs --check|--run --project lensiq-prod-site --confirm lensiq-prod-site --dir _site-prod [--account-confirmed]"); return 2; }
  const git = io.git || gitState();
  const o = { env, project: arg("--project"), confirm: arg("--confirm"), dir: arg("--dir") ? resolve(arg("--dir")) : "", skipDir: mode === "check" && !argv.includes("--dir"),
    accountConfirmed: argv.includes("--account-confirmed"), git, ci: (io.ciGreen || ciGreen)(git.head) };
  print(`LENSIQ production site · ${mode} · TARGET Cloudflare Pages project "${o.project}" (branch main) · folder ${o.dir || "(none)"} · commit ${String(git.head).slice(0, 12) || "?"}`);
  const probs = deployProblems(o);
  if (probs.length) { for (const p of probs) print("REFUSED: " + p); print("Nothing was sent to Cloudflare."); return 1; }
  if (mode === "check") { print("check: OK (nothing was started)"); return 0; }
  try {
    const args = pagesDeployArgs(o.dir, o.project);
    const cenv = childEnv(env, { creds: o.accountConfirmed });
    assertOffline(env, args);
    const bin = wranglerBin(env);
    if (!existsSync(bin)) { print("wrangler is not installed: run `npm ci` in backend/ first"); return 1; }
    print(`COMMAND  (cd backend && npx wrangler ${args.join(" ")})`);
    const r = spawnSync(process.execPath, [bin, ...args], { cwd: BACKEND, stdio: "inherit", env: cenv });
    const code = r.status == null ? 1 : r.status;
    print(code === 0 ? "deploy: OK" : `deploy: FAILED (exit ${code})`);
    return code === 0 ? 0 : 1;
  } catch (e) { if (e instanceof GuardError) { print(e.message); return 1; } throw e; }
}

const isMain = (() => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) process.exit(main(process.argv.slice(2)));
