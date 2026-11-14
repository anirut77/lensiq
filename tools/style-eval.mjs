#!/usr/bin/env node
// tools/style-eval.mjs — Style MVP measurement on the LOCKED synthetic set S (~/LENSIQ-field/evals/style-mvp/; design
// docs/STYLE-DESIGN.md §4.1 row S, analogue of sets A and C). Source label of every number: synthetic.
//   node tools/style-eval.mjs [--out <name>]     writes <evals>/style-mvp/<name>.json and .md (default results-<date>)
// It refuses to run unless set.json, render.mjs, score.mjs and targets.json are locked and committed (tools/eval-guard.mjs).
// What runs is the PRODUCT code: lensiq-colour.js (card gains) and lensiq-style.js (robust sampling, aggregation, undertone,
// dimensions, closest seasons, no drapes) with the bundled vendor/style/content.json thresholds. render.mjs and score.mjs
// (locked with the set) do the pixel rendering and the scoring with their own colour maths.
// Capture rule: each capture of the set has 5 independently rendered frames; the live page needs >= 10 frames
// (thresholds.unsure.minFrames), so each frame counts 6 times (= 30 frames with the same spread). Card refusals stay
// refusals: a frame whose card is refused does not count, and a shot whose card is refused gives no colour (listed).
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertLocked, phaseDir } from "./eval-guard.mjs";

const require = createRequire(import.meta.url);
const PHASE = "style-mvp", DIR = phaseDir(PHASE);
const argv = process.argv.slice(2), oi = argv.indexOf("--out");
const name = oi >= 0 ? argv[oi + 1] : `results-${new Date().toISOString().slice(0, 10)}`;
if (!/^[a-z0-9][a-z0-9._-]*$/.test(name || "")) { console.error("--out: a plain file name"); process.exit(2); }

const g = assertLocked(PHASE, ["set.json", "render.mjs", "score.mjs", "targets.json"]);
const { readFileSync } = await import("node:fs");
const set = JSON.parse(readFileSync(join(DIR, "set.json"), "utf8")), targets = JSON.parse(readFileSync(join(DIR, "targets.json"), "utf8"));
const R = await import(pathToFileURL(join(DIR, "render.mjs")).href), SC = await import(pathToFileURL(join(DIR, "score.mjs")).href);
const C = require("../lensiq-colour.js"), S = require("../lensiq-style.js"), CONTENT = require("../vendor/style/content.json");

const person = new Map(set.persons.map(p => [p.id, p]));
const captures = [];
let refusedFrames = 0;
for (const c of set.captures) {
  const p = person.get(c.person), card = set.cards[c.card], frames = [];
  for (const seed of c.seeds) {
    const img = R.renderFrame({ skin: p.skin, hair: p.hair, card, phone: set.phones[c.phone], light: c.light, exposure: c.exposure, seed });
    const st = C.cardStats(img, img.boxes.card, { target: card.target });
    if (!st.ok) { refusedFrames++; frames.push({ ok: false }); continue; }
    const sk = S.sampleRect(img, img.boxes.skin, st.gains), hr = S.sampleRect(img, img.boxes.hair, st.gains);
    frames.push(sk ? { ok: true, skin: sk.lab, hair: hr ? hr.lab : null } : { ok: false });
  }
  const okN = frames.filter(f => f.ok).length, x6 = frames.flatMap(f => [f, f, f, f, f, f]);
  const agg = S.aggregate(x6), share = okN / frames.length;
  let band = "unsure", top2 = ["-", "-"], h = NaN, L = NaN;
  if (agg.n) {
    h = agg.skin.h; L = agg.skin.L;
    if (share >= CONTENT.thresholds.unsure.minCardShare) {
      band = S.undertone(agg, CONTENT).band;
      if (band !== "unsure") { const t = S.closest(S.dimensions(agg, CONTENT), CONTENT); top2 = [t[0].id, t[1].id]; }
    }
  }
  captures.push({ person: c.person, phone: c.phone, light: c.light, capture: c.capture, h, L, band, top2, cardShare: share });
}
const ref = set.checker.patches.map(R.d50ToD65Lab), shots = [], refusedShots = [];
for (const s of set.shots) {
  const card = set.cards[s.card];
  const img = R.renderChecker({ patches: ref, card, phone: set.phones[s.phone], light: s.light, exposure: s.exposure, seed: s.seed });
  const st = C.cardStats(img, img.card, { target: card.target });
  if (!st.ok) { refusedShots.push({ card: s.card, phone: s.phone, light: s.light, shot: s.shot, reasons: st.reasons }); continue; }
  const med = b => {
    const ch = [[], [], []];
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { const i = (y * img.width + x) * 4; for (let k = 0; k < 3; k++) ch[k].push(img.data[i + k]); }
    return ch.map(C.median);
  };
  const rgbs = img.boxes.map(med);
  shots.push({ card: s.card, phone: s.phone, light: s.light, shot: s.shot, after: rgbs.map(v => C.correctedLab(v, st.gains)), before: rgbs.map(v => C.rgbToLab(v)) });
}
const res = SC.score(set, { captures, shots }, targets);
const f2 = v => (typeof v === "number" ? v.toFixed(2) : String(v)), pct = s => `${(s.p * 100).toFixed(1)} % (${s.k}/${s.n}; 95 % CI ${(s.ci[0] * 100).toFixed(1)}-${(s.ci[1] * 100).toFixed(1)} %)`;
const A = res.metrics.A, lines = [
  `# Style MVP — synthetic set S results (${name})`, "",
  `Source: **synthetic** (locked set ~/LENSIQ-field/evals/style-mvp/, lock ${g.lockFile} @ ${g.lockCommit}). Not field numbers; no accuracy claim.`,
  `Product thresholds: ${CONTENT.thresholds.version} (ownerApproved: ${CONTENT.thresholds.ownerApproved}). Overall: **${res.pass ? "all targets met" : "some targets missed"}**.`, "",
  "## Set A analogue (30 colour-only persons x 2 phones x 4 lights x 3 captures, grey card, no drapes)", "",
  `- skin hue angle SD within person: median ${f2(A.hue_sd_median)}°, 90th pct ${f2(A.hue_sd_p90)}° (target median <= 2.0°)`,
  `- skin L* SD within person: median ${f2(A.L_sd_median)} (target <= 2.0)`,
  `- same undertone band in all 24 captures: ${pct(A.band_same)} (target >= 80 %)`,
  `- same top-1 season in all 24 captures: ${pct(A.season_top1_same)} (target >= 70 %)`,
  `- every top-2 contains the person's usual top-1: ${pct(A.season_top2_contains)} (target >= 90 %)`,
  `- hue SD <= 2.0°: ${pct(A.hue_sd_le2)}`,
  `- by L* tertile (1 / 2 / 3): band same ${A.tertiles.bandSame.map(v => (v * 100).toFixed(0)).join(" / ")} %, top-1 same ${A.tertiles.top1Same.map(v => (v * 100).toFixed(0)).join(" / ")} %, top-2 contains ${A.tertiles.top2Contains.map(v => (v * 100).toFixed(0)).join(" / ")} %, hue SD <= 2 ${A.tertiles.hueLe2.map(v => (v * 100).toFixed(0)).join(" / ")} %; largest gap ${f2(A.tertile_gap_pp)} pp (target <= 10)`,
  `- frames whose card was refused: ${refusedFrames} of ${set.captures.length * 5}`, "",
  "## Set C analogue (ColorChecker 24 patches, CIEDE2000 to the D65 reference; 5 shots per condition)", "",
  "| card | phone | light | n | median after | p90 after | median before (camera only) |", "|---|---|---|---|---|---|---|",
  ...res.metrics.C.map(c => `| ${c.card} | ${c.phone} | ${c.light} | ${c.n} | ${f2(c.median_after)} | ${f2(c.p90_after)} | ${f2(c.median_before)} |`), "",
  `Shots whose card was refused (no colour given, as on the page): ${refusedShots.length}` +
    (refusedShots.length ? " — " + [...new Set(refusedShots.map(r => `${r.card}/${r.phone}/${r.light}: ${r.reasons.join("+")}`))].join("; ") : ""), "",
  "## Pass / fail per target", "", "| metric | value | target | met |", "|---|---|---|---|",
  ...res.table.map(r => `| ${r.name} | ${f2(r.value)} | ${r.target} | ${r.ok ? "yes" : "**no**"} |`), ""
];
writeFileSync(join(DIR, name + ".json"), JSON.stringify({ name, lock: g, thresholds: CONTENT.thresholds.version, refusedFrames, refusedShots, ...res }, null, 1) + "\n");
writeFileSync(join(DIR, name + ".md"), lines.join("\n"));
console.log(lines.join("\n"));
