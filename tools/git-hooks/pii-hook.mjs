#!/usr/bin/env node
// tools/git-hooks/pii-hook.mjs — owner order 2026-11-19: block personal data at PUSH time (when it actually leaks) and at
// commit time, in every worktree, including branches that do not contain tools/pii-scan.mjs yet.
//   node pii-hook.mjs push [<remote> <url>]   reads git's pre-push stdin ("<local ref> <local sha> <remote ref> <remote sha>")
//   node pii-hook.mjs commit                  scans the staged change
// Called by tools/git-hooks/pre-push and tools/git-hooks/pre-commit; tools/install-hooks.mjs copies all three to a stable
// folder outside any repo (default ~/.config/lensiq/git-hooks) and points core.hooksPath at it.
// What is scanned (push): per pushed ref, only the commits being pushed: <remote sha>..<local sha> for an existing branch;
// <merge-base with origin/main>..<local sha> for a new branch (or when the remote sha is not known locally); never the full
// history; deletions are skipped. Commits already on origin/main are public already and are not re-scanned.
// Scanner + allow-list, always as a pair from one source (a newer allow-list can name types an older scanner rejects):
// the pushed commit's own tools/pii-scan.mjs + tools/pii-allow.json when it has them (what CI runs for that commit; for
// a commit: the staged ones), else `git show <ref>:tools/...` from origin/main, else origin/pii-guard (override:
// LENSIQ_PII_SCANNER_REFS="ref1,ref2"), written to a temp folder. Output: type, path:line, commit; never a value.
// Fails closed: no scanner, a git error or a scan error blocks the push with a clear message. Exit 0 = clean, 1 = findings,
// 2 = could not check. The bypass (owner only, after checking): git push --no-verify / git commit --no-verify.
// Locked test: tests/unit/pii-prepush.test.js (evals-locks/pii-prepush.sha256).
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ZERO = /^0+$/;
const MAIN = "refs/remotes/origin/main";
const SCANNER_REFS = ["refs/remotes/origin/main", "refs/remotes/origin/pii-guard"];

/** @param {string} text @returns {Array<{localRef: string, localSha: string, remoteRef: string, remoteSha: string}>} */
export function parsePushLines(text) {
  return String(text || "").split("\n").map(s => s.trim()).filter(Boolean).map(line => {
    const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
    return { localRef, localSha, remoteRef, remoteSha };
  });
}

/**
 * one bounded A..B range per pushed ref (never a single revision, which would mean full history)
 * @param {ReturnType<typeof parsePushLines>} lines
 * @param {{hasCommit: (sha: string) => boolean, mergeBase: (sha: string) => string | null}} env
 * @returns {Array<{ref: string, localSha?: string, range?: string, skip?: string, error?: string}>}
 */
export function planRanges(lines, env) {
  return lines.map(l => {
    const ref = l.remoteRef || l.localRef;
    if (!l.localSha || ZERO.test(l.localSha)) return { ref, skip: "delete" };
    if (l.remoteSha && !ZERO.test(l.remoteSha) && env.hasCommit(l.remoteSha)) {
      return { ref, localSha: l.localSha, range: `${l.remoteSha}..${l.localSha}` };
    }
    const base = env.mergeBase(l.localSha);
    if (!base) return { ref, localSha: l.localSha, error: "no merge-base with origin/main (run `git fetch origin` and push again)" };
    return { ref, localSha: l.localSha, range: `${base}..${l.localSha}` };
  });
}

/** @param {string} repo @param {string[]} args */
const git = (repo, args) => execFileSync("git", args, { cwd: repo, maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "pipe"] });
/** @param {string} repo @param {string[]} args */
const gitOk = (repo, args) => { try { return git(repo, args).toString("utf8").trim(); } catch { return null; } };

/** run the scanner's main() in-process, capturing its output @param {any} S @param {string[]} argv */
function runScanner(S, argv) {
  const out = [], log = console.log, err = console.error;
  console.log = (...a) => out.push(a.join(" "));
  console.error = (...a) => out.push(a.join(" "));
  let code;
  try { code = S.main(argv); } finally { console.log = log; console.error = err; }
  return { code, text: out.join("\n") };
}

/** @param {"push" | "commit"} mode @param {string} why */
function cannotCheck(mode, why) {
  const verb = mode === "push" ? "Push" : "Commit";
  console.error(`pii-${mode}: could not run the personal-data check: ${why}`);
  console.error(`${verb} BLOCKED (the check fails closed). Fix the cause above and try again.`);
  console.error(`Owner only, after checking by hand that nothing personal is in it: git ${mode} --no-verify`);
  return 2;
}

/** @param {"push" | "commit"} mode @param {{repo?: string, stdin?: string, env?: NodeJS.ProcessEnv}} [o] */
export async function run(mode, o = {}) {
  const env = o.env || process.env;
  const repo = o.repo || gitOk(process.cwd(), ["rev-parse", "--show-toplevel"]);
  if (!repo) return cannotCheck(mode, "not inside a git work tree");

  let plan = [];
  if (mode === "push") {
    plan = planRanges(parsePushLines(o.stdin || ""), {
      hasCommit: sha => gitOk(repo, ["cat-file", "-e", `${sha}^{commit}`]) !== null,
      mergeBase: sha => gitOk(repo, ["merge-base", sha, MAIN])
    });
    const bad = plan.find(p => p.error);
    if (bad) return cannotCheck(mode, `${bad.ref}: ${bad.error}`);
    plan = plan.filter(p => p.range);
    if (!plan.length) return 0;
  }

  const refs = (env.LENSIQ_PII_SCANNER_REFS || "").split(",").map(s => s.trim()).filter(Boolean);
  const scannerRef = (refs.length ? refs : SCANNER_REFS).find(r => gitOk(repo, ["cat-file", "-e", `${r}:tools/pii-scan.mjs`]) !== null);
  if (!scannerRef) {
    return cannotCheck(mode, `no scanner found (tools/pii-scan.mjs is on none of ${(refs.length ? refs : SCANNER_REFS).join(", ")}; run \`git fetch origin\`)`);
  }

  const tmp = mkdtempSync(join(tmpdir(), "lensiq-pii-hook-"));
  try {
    /** @type {Map<string, any>} */
    const loaded = new Map();
    /** scanner + allow-list from one tree-ish ("<rev>:" or ":" for the index) @param {string} at */
    const pairAt = async at => {
      const blob = gitOk(repo, ["rev-parse", "-q", "--verify", `${at}tools/pii-scan.mjs`]);
      const allowBlob = gitOk(repo, ["rev-parse", "-q", "--verify", `${at}tools/pii-allow.json`]);
      if (!blob || !allowBlob) return null;
      if (!loaded.has(blob)) {
        const f = join(tmp, `pii-scan-${blob}.mjs`);
        writeFileSync(f, git(repo, ["cat-file", "blob", blob]));
        const S = await import(pathToFileURL(f).href);
        if (typeof S.main !== "function") throw new Error("scanner has no main()");
        loaded.set(blob, S);
      }
      const allow = join(tmp, `pii-allow-${allowBlob}.json`);
      writeFileSync(allow, git(repo, ["cat-file", "blob", allowBlob]));
      return { S: loaded.get(blob), allow, from: at };
    };
    let refPair = null;
    try { refPair = await pairAt(`${scannerRef}:`); } catch (e) { return cannotCheck(mode, `scanner on ${scannerRef} did not load (${String(e).split("\n")[0]})`); }
    if (!refPair) return cannotCheck(mode, `no tools/pii-allow.json next to the scanner on ${scannerRef}`);
    /** @param {string} at */
    const pairFor = async at => { try { return (await pairAt(at)) || refPair; } catch { return refPair; } };

    /** @type {Array<{type: string, path: string, line?: number, commit?: string, ref?: string}>} */
    const findings = [];
    /** @param {string[]} args @param {{S: any, allow: string, from: string}} pair @param {string} [ref] */
    const scan = (args, pair, ref) => {
      const r = runScanner(pair.S, [...args, "--repo", repo, "--allow", pair.allow, "--json"]);
      if (r.code !== 0 && r.code !== 1) return `scanner (${pair.from}) exit ${r.code}: ${r.text.split("\n")[0]}`;
      let j;
      try { j = JSON.parse(r.text); } catch { return "scanner output was not JSON"; }
      for (const f of j.findings || []) findings.push({ type: f.type, path: f.path, line: f.line, commit: f.commit, ref });
      return null;
    };

    if (mode === "commit") {
      const e = scan(["--staged"], await pairFor(":"));
      if (e) return cannotCheck(mode, e);
    } else {
      for (const p of plan) {
        const pair = await pairFor(`${p.localSha}:`);
        // commits already on origin/main are public and were scanned there: when the range holds some (a merge of main),
        // scan only the others, one commit each (<sha>^! = that commit alone)
        const [a, b] = /** @type {string} */ (p.range).split("..");
        const inRange = gitOk(repo, ["rev-list", "--count", `${a}..${b}`]);
        const own = gitOk(repo, ["rev-list", b, `^${a}`, `^${MAIN}`]);
        if (inRange === null || own === null) return cannotCheck(mode, `${p.ref}: git rev-list failed`);
        const ownList = own.split("\n").filter(Boolean);
        if (!ownList.length) continue;
        if (ownList.length === Number(inRange)) {
          const e = scan(["--range", /** @type {string} */ (p.range)], pair, p.ref);
          if (e) return cannotCheck(mode, `${p.ref}: ${e}`);
        } else {
          for (const sha of ownList) {
            const e = scan(["--range", `${sha}^!`], pair, p.ref);
            if (e) return cannotCheck(mode, `${p.ref}: ${e}`);
          }
        }
      }
    }

    if (!findings.length) return 0;
    const what = mode === "push" ? "the commits being pushed" : "the staged change";
    console.error(`pii-${mode}: BLOCKED. ${findings.length} possible personal-data finding(s) in ${what}. Values are never printed.`);
    for (const f of findings) {
      const at = f.line ? `${f.path}:${f.line}` : f.path;
      const c = f.commit ? ` commit ${String(f.commit).slice(0, 12)}` : "";
      const r = f.ref ? ` (${f.ref})` : "";
      console.error(`  ${f.type}  ${at}${c}${r}`);
    }
    if (mode === "push") {
      console.error("Remove the data from those commits (amend or rewrite them, so it is in no pushed commit), then push again.");
    } else {
      console.error("Remove the data from the staged files, then commit again.");
    }
    console.error("A synthetic test fixture only: add path + type + max count + kind + reason to tools/pii-allow.json. Never allow-list real personal data.");
    console.error(`Owner only, after checking it is not personal data: git ${mode} --no-verify`);
    return 1;
  } catch (e) {
    return cannotCheck(mode, `unexpected error (${String(e).split("\n")[0]})`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** @returns {Promise<string>} */
function readStdin() {
  return new Promise(res => {
    if (process.stdin.isTTY) return res("");
    let s = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", d => { s += d; });
    process.stdin.on("end", () => res(s));
    process.stdin.on("error", () => res(s));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode !== "push" && mode !== "commit") {
    console.error("usage: node pii-hook.mjs push [<remote> <url>] < pre-push stdin | node pii-hook.mjs commit");
    process.exitCode = 2;
  } else {
    const stdin = mode === "push" ? await readStdin() : "";
    process.exitCode = await run(mode, { stdin });
  }
}
