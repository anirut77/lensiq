// @ts-check
// tools/lib/tester-policy.mjs — owner decision D-3 (2026-11-19): "enforce the tester code on the live site".
// Until counsel has signed off the terms and the privacy notice (LEGAL_TERMS_READY and LEGAL_PRIVACY_READY both "true"),
// a deployment that serves the gated routes (AI, fortune AI, the testing-only lookup sources) must run with the tester gate
// (backend/src/tester.js: TESTER_GATE = "required" + secret TESTER_ACCESS_CODE), and a public site that talks to it must
// carry the page side of the gate (deploy/public-site.json "testerGate": true, lensiq-tester.js).
//
// One switch: deploy/tester-gate.json {"enforce": false | true}. Off = the deploy tool and the site build print a WARNING
// naming each problem; on = they refuse (tools/backend-deploy.mjs exit 3, tools/build-site.mjs exit 1) before anything is
// changed. Customer bundles are never checked (their tester gate is always off: customerSiteConfig).
// The live test deployment already meets the rule (tests/unit/tester-gate-d3.test.js T5), so turning enforce on changes
// nothing users see; it stops a later deploy or build (for example the production environment of
// docs/PRODUCTION-MOVE-PLAN.md) from going out without the gate. Docs: docs/DEPLOY.md "Tester gate policy (D-3)".
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const POLICY_FILE = join(REPO, "deploy", "tester-gate.json");
/** Routes the Worker gates with the tester code (backend/src/index.js, med.js, pc.js). */
export const GATED_ROUTES = Object.freeze(["/v1/ai/*", "/api/fortune", "/api/fortune/status", "/api/med/*", "/api/pc/*"]);

/** The switch. A missing file = off; anything but {note?, enforce: boolean} throws. @param {string} [file] @returns {{enforce: boolean}} */
export function readTesterPolicy(file = POLICY_FILE) {
  if (!existsSync(file)) return { enforce: false };
  const j = JSON.parse(readFileSync(file, "utf8"));
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("deploy/tester-gate.json: must be an object");
  for (const k of Object.keys(j)) if (k !== "note" && k !== "enforce") throw new Error("deploy/tester-gate.json: unknown key " + k);
  if (typeof j.enforce !== "boolean") throw new Error("deploy/tester-gate.json: enforce must be true or false");
  return { enforce: j.enforce };
}

/** @param {Record<string, any>} vars */
export const legalReady = vars => String(vars.LEGAL_TERMS_READY) === "true" && String(vars.LEGAL_PRIVACY_READY) === "true";

/** Gated routes this deployment serves. PUBLIC_ROUTES unset or empty = every route (the Worker's default). "/a/*" = prefix.
 *  @param {Record<string, any>} vars @returns {string[]} */
export function gatedRoutesOpen(vars) {
  const list = String(vars.PUBLIC_ROUTES ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!list.length) return GATED_ROUTES.slice();
  const base = (/** @type {string} */ r) => (r.endsWith("/*") ? r.slice(0, -1) : r);
  return GATED_ROUTES.filter(g => list.some(e => {
    if (e === g) return true;
    if (e.endsWith("/*") && base(g).startsWith(base(e))) return true; // a wider entry covers the gated route
    if (g.endsWith("/*") && e.startsWith(base(g))) return true; // one route under a gated prefix
    return false;
  }));
}

/** Worker rule. @param {Record<string, any>} vars [env.<name>.vars] @returns {string[]} problems ([] = fine) */
export function workerTesterProblems(vars) {
  if (legalReady(vars)) return [];
  const open = gatedRoutesOpen(vars);
  if (!open.length) return [];
  const gate = String(vars.TESTER_GATE ?? "").trim().toLowerCase();
  if (gate === "required") return [];
  return [`TESTER_GATE is ${JSON.stringify(String(vars.TESTER_GATE ?? ""))}; it must be "required" while LEGAL_TERMS_READY and LEGAL_PRIVACY_READY are not both "true" (owner decision D-3). Gated routes served: ${open.join(", ")}`];
}

/** Site rule. @param {{testerGate?: boolean} | null} siteCfg readSiteConfig() result (null = no API) @param {Record<string, any>} vars @returns {string[]} */
export function siteTesterProblems(siteCfg, vars) {
  if (!siteCfg || legalReady(vars)) return [];
  if (siteCfg.testerGate === true) return [];
  return ['deploy/public-site.json: "testerGate" must be true while LEGAL_TERMS_READY and LEGAL_PRIVACY_READY are not both "true" (owner decision D-3)'];
}

/** @param {{enforce: boolean}} policy @param {string[]} problems @returns {{enforce: boolean, problems: string[], refuse: boolean}} */
export function testerVerdict(policy, problems) {
  return { enforce: policy.enforce === true, problems, refuse: policy.enforce === true && problems.length > 0 };
}

/** [env.test.vars] of a wrangler.toml text ({} when the section is missing). @param {string} toml @param {string} [env] */
export function testVars(toml, env = "test") {
  const s = String(toml), head = `[env.${env}.vars]`, i = s.indexOf(head);
  if (i < 0) return {};
  const rest = s.slice(i + head.length), end = rest.search(/^\[/m);
  const body = end < 0 ? rest : rest.slice(0, end);
  return Object.fromEntries([...body.matchAll(/^([A-Za-z0-9_]+)\s*=\s*(?:"([^"]*)"|(true|false|[\d.]+))\s*(?:#.*)?$/gm)].map(m => [m[1], m[2] ?? m[3]]));
}

/** [env.test.vars] of the repo's backend/wrangler.toml ({} when the file is absent, e.g. a release tarball). */
export function repoTestVars() {
  const f = join(REPO, "backend", "wrangler.toml");
  return existsSync(f) ? testVars(readFileSync(f, "utf8")) : {};
}
