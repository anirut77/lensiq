// tools/lib/pc-drug-source.mjs — shared by the Product Check drug-data build tools (P4).
//   sources()                 the registry tools/pc-drug-sources.json
//   requireAllowed(id, kind)  the source entry, or throws when it is unknown, of another kind, or its licence is not
//                             recorded as allowed (the refresh guard: a newer release needs its licence recorded first)
//   fieldDir(src, root?)      ~/LENSIQ-field/drug-data/<dir> (downloads never go into the repo)
//   download(src, opts)       fetch the exact registry URLs into fieldDir (skips files that exist unless force)
//   sha256(buf)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REGISTRY = join(REPO, "tools", "pc-drug-sources.json");
export const FIELD_ROOT = join(homedir(), "LENSIQ-field", "drug-data");

/** @returns {Record<string, any>} */
export function sources(file = REGISTRY) { return JSON.parse(readFileSync(file, "utf8")).sources; }

/** @param {string} id @param {string} kind @param {Record<string, any>} [reg] */
export function requireAllowed(id, kind, reg = sources()) {
  const s = reg[id];
  if (!s) throw new Error(`unknown source "${id}": add it to tools/pc-drug-sources.json with its licence first (known: ${Object.keys(reg).join(", ")})`);
  if (s.kind !== kind) throw new Error(`source "${id}" is a ${s.kind} source, not ${kind}`);
  if (s.licence_allowed !== true) throw new Error(`refused: the licence of "${id}" is not recorded as allowed (${s.licence}). Record the licence or written permission first.`);
  if (!s.files || !Object.keys(s.files).length || !s.master) throw new Error(`source "${id}" has no files`);
  return { id, ...s };
}

export const insideRepo = (p, repo = REPO) => { const r = relative(repo, resolve(p)); return !r.startsWith("..") && !isAbsolute(r); };

/** @param {any} src @param {string} [root] */
export function fieldDir(src, root = FIELD_ROOT) {
  const d = join(root, src.dir || src.id);
  if (insideRepo(d)) throw new Error("refused: downloads must stay outside the repo (" + d + ")");
  return d;
}

export const sha256 = buf => createHash("sha256").update(buf).digest("hex");

/** @param {any} src @param {{root?: string, force?: boolean, fetch?: typeof fetch, log?: (s: string) => void}} [o] */
export async function download(src, o = {}) {
  const dir = fieldDir(src, o.root), log = o.log || (() => {}), f = o.fetch || fetch;
  mkdirSync(dir, { recursive: true });
  const got = {};
  for (const [name, url] of Object.entries(src.files)) {
    const u = new URL(String(url));
    if (u.protocol !== "https:") throw new Error("refused: not https " + url);
    const path = join(dir, name);
    if (existsSync(path) && !o.force) { got[name] = { path, sha256: sha256(readFileSync(path)), cached: true }; log(`have ${name}`); continue; }
    const r = await f(u.href, { redirect: "follow" });
    if (!r.ok) throw new Error(`download failed ${r.status} ${u.href}`);
    const buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(path, buf);
    got[name] = { path, sha256: sha256(buf), cached: false };
    log(`downloaded ${name} (${buf.length} B)`);
  }
  return { dir, files: got };
}
