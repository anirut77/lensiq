#!/usr/bin/env node
// tools/palm-v3-majors.mjs — palm v3 DEVELOPMENT check on the owner's development photos (numbers only, never viewed, never an
// accuracy figure): z and solid / not clear per major line, so a change can be checked for removing real lines. Photos are read
// through the eval-guard, never copied, never uploaded, never modified; the landmark file stays outside the repo.
//   node tools/palm-v3-majors.mjs --lm <landmarks.json> <photo ...>
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { assertFreeSpace } from "./disk-guard.mjs";
import { readJpeg } from "./palm-v3-io.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const V3 = createRequire(import.meta.url)(join(repo, "palm-v3-lines.js"));
const A = process.argv.slice(2), opt = k => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const photos = A.filter((a, i) => !a.startsWith("--") && !A[i - 1]?.startsWith("--"));
if (resolve(opt("--lm")).startsWith(repo)) { console.error("the landmark file must be outside the repo"); process.exit(2); }
const LM = JSON.parse(readFileSync(opt("--lm")));
assertLocked("palm__owner-photos", photos);
assertFreeSpace({ label: "tools/palm-v3-majors.mjs" });
for (const name of photos) {
  const key = basename(name), im = readJpeg(join(phaseDir("palm__owner-photos"), name)), d = V3.detect(im.rgba, im.w, im.h, LM.photos[key].hand, {});
  console.log(key, "(DEV only)", ["heart", "head", "life"].map(id => `${id} z ${d.lines[id].z} ${d.lines[id].solid ? "solid" : "-"}`).join(" | "));
}
