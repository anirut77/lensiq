// tools/lib/nut-lock.mjs — the nutrition set's own lock check (locked.sha256 next to the set), used by tools/nut-eval.mjs
// before tools/eval-guard.mjs. Lines: "<sha256>  <name>"; anything after " #" is a comment (lines written by
// tools/eval-guard.mjs lock put the timestamp on its own "# locked" line; older lines may carry "  # ..." suffixes).
//   images/*.png ...  = sha256 of the sorted per-file list (cd images && shasum -a 256 *.png | shasum -a 256)
//   tests/...         = a file in the repo
//   anything else     = a file in the set folder
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** @param {string} f */
const sha = f => createHash("sha256").update(readFileSync(f)).digest("hex");

/** name of a lock line, without a trailing " # ..." comment @param {string} rest */
export const lockName = rest => rest.replace(/\s+#.*$/, "").trim();

/**
 * Verify every hash line of <set>/locked.sha256; throws naming the first changed file.
 * @param {string} set @param {string} repo @returns {{checked: number}}
 */
export function checkNutLock(set, repo) {
  const lines = readFileSync(join(set, "locked.sha256"), "utf8").split("\n").filter(l => /^[0-9a-f]{64} {2}/.test(l));
  for (const l of lines) {
    const h = l.slice(0, 64), name = lockName(l.slice(66));
    if (name.startsWith("images/*.png")) {
      const list = execFileSync("/bin/sh", ["-c", "cd images && shasum -a 256 *.png | shasum -a 256"], { cwd: set }).toString().split(" ")[0];
      if (list !== h) throw new Error("nut-eval: images changed after locking");
    } else if (name.startsWith("tests/")) {
      if (sha(join(repo, name)) !== h) throw new Error("nut-eval: locked test changed: " + name);
    } else if (sha(join(set, name)) !== h) throw new Error("nut-eval: locked file changed: " + name);
  }
  return { checked: lines.length };
}
