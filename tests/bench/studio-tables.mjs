#!/usr/bin/env node
// tests/bench/studio-tables.mjs — recompute every ACCURACY.md §11 / §11b table from the committed labels and per-render logs.
// No portraits, no browser, no dataset: runs in CI.
//
//   node tests/bench/studio-tables.mjs            print every table (markdown)
//   node tests/bench/studio-tables.mjs --check    exit 1 when a count (k/n) printed here is missing from ACCURACY.md §11–§11b
//   node tests/bench/studio-tables.mjs --json f   write all metrics (with their per-person rows) as JSON
//
// Inputs (all in tests/bench/):
//   studio-gate-log-r10.json      per render: person, garment, variant (plain | cover | none), what the page showed, gate pass /
//                                 fails, QA measurements m, jaw-strip features jf, timings (studio.bench.mjs --log)
//   photobooth-gate-log-r10.json  per render: person, outfit, shown, boothCheck pass / fails / m (photobooth.bench.mjs --log)
//   studio-labels.json            round-9 rater (plain renders), studio-labels-r10.json second rater (plain + cover + none),
//   photobooth-labels.json        photo booth ID photo labels (none, civil, khaki)
//
// Every metric keeps the per-person rows it was counted from ({ id, y } with y = 0/1), so the interval method can be swapped:
// `tables({ interval })` takes `(rows) => [lo, hi]`; the default is Wilson 95 % on k/n. A person-cluster bootstrap only needs
// to resample the ids in `rows` (several rows per person — renders of one person are not independent).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const QA = require(join(REPO, "studio-qa.js"));
const J = f => JSON.parse(readFileSync(f, "utf8"));
export const GARMENTS = ["civil", "khaki", "suit_navy", "lady"], OUTFITS = ["civil", "khaki"], COVER_OPEN = .5;

export function wilson(rows) {
  const n = rows.length, k = rows.reduce((t, r) => t + r.y, 0); if (!n) return [NaN, NaN];
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export function load(root = REPO) {
  const b = f => join(root, "tests/bench", f), opt = f => { try { return J(b(f)); } catch { return null; } };
  return { slog: J(b("studio-gate-log-r10.json")), plog: J(b("photobooth-gate-log-r10.json")), L9: J(b("studio-labels.json")).labels, L10: J(b("studio-labels-r10.json")).labels, LP: J(b("photobooth-labels.json")).labels,
    // round 11 (optional): no-outfit renders with the clean-up + ID-photo edge extension, pre-flight measurements, review findings, and their labels
    slog11: opt("studio-gate-log-r11.json"), plog11: opt("photobooth-gate-log-r11.json"), L11: (opt("studio-labels-r11.json") || {}).labels || null };
}

/** pre-flight verdict recomputed from the logged measurements with the current limits (studio-qa.js PRE_LIMITS; "frontal" not checked without landmarks) */
export function preOk(m, L = QA.PRE_LIMITS) {
  if (m.yaw != null && (Math.abs(m.yaw) > L.yaw || m.tilt > L.tilt)) return false;
  return m.neck >= L.neck && m.hairSh <= L.hairSh && m.clothTex <= L.clothTex && m.framing >= L.framing;
}
/** logistic regression exactly as studio.bench.mjs stage 2b (3000 steps, lr 0.1, L2 1, z-scored GATE_FEATS) */
function fitLR(R) {
  const X = r => Object.keys(QA.GATE_FEATS).map(k => QA.GATE_FEATS[k](r.m, r.jf, r.cover));
  const F = R.map(X), d = F[0].length, mu = Array(d).fill(0).map((_, j) => F.reduce((t, f) => t + f[j], 0) / F.length), sd = mu.map((m, j) => Math.sqrt(F.reduce((t, f) => t + (f[j] - m) ** 2, 0) / F.length) || 1), Z = F.map(f => f.map((v, j) => (v - mu[j]) / sd[j]));
  const w = Array(d).fill(0); let b = 0;
  for (let it = 0; it < 3000; it++) { const gw = Array(d).fill(0); let gb = 0; Z.forEach((z, i) => { const e = 1 / (1 + Math.exp(-(b + z.reduce((t, v, j) => t + v * w[j], 0)))) - R[i].y; gb += e; z.forEach((v, j) => { gw[j] += e * v; }); }); for (let j = 0; j < d; j++) w[j] -= .1 * (gw[j] + w[j]) / Z.length; b -= .1 * gb / Z.length; }
  return r => 1 / (1 + Math.exp(-(b + X(r).reduce((t, v, j) => t + (v - mu[j]) / sd[j] * w[j], 0))));
}
const aucOf = (R, p) => { const pos = R.filter(r => r.y).map(p), neg = R.filter(r => !r.y).map(p); let a = 0; for (const u of pos) for (const v of neg) a += u > v ? 1 : u === v ? .5 : 0; return a / pos.length / neg.length; };

/**
 * All §11 / §11b metrics. Returns [{ table, split, key, label, rows, k, n, lo, hi }] plus scalar values ({ value } instead of rows).
 */
export function tables({ data = load(), interval = wilson } = {}) {
  const { slog, plog, L9, L10, LP } = data, out = [];
  const M = (table, split, key, label, rows, extra = {}) => { const k = rows.reduce((t, r) => t + r.y, 0), n = rows.length, [lo, hi] = n ? interval(rows) : [NaN, NaN]; out.push({ table, split, key, label, k, n, lo, hi, rows, ...extra }); };
  const V = (table, split, key, label, value, extra = {}) => out.push({ table, split, key, label, value, ...extra });
  const people = slog.people, R = {};
  for (const r of slog.renders) ((R[r.id] = R[r.id] || {})[r.g === "none" ? "none" : r.g + (r.v === "cover" ? "+cover" : "")] = r);
  const ids = sp => Object.keys(people).filter(id => people[id].split === sp).sort();
  for (const sp of ["dev", "test"]) {
    // ---- §11 round 9 table: plain renders (cover off = the round-9 page), round-9 rater
    const raw = [], caught = [], clean = [], shownAfter = [], page = [], safe = [], allClean = [];
    for (const id of ids(sp)) {
      const L = L9[id]; if (!L || L.none == null) continue;
      safe.push({ id, y: L.none }); let bad = 0;
      for (const g of GARMENTS) { const v = R[id] && R[id][g]; if (!v || L[g] == null) continue; const y = L[g], wh = v.shown === "safe"; bad += y;
        raw.push({ id, y }); if (y) caught.push({ id, y: wh ? 1 : 0 }); else clean.push({ id, y: wh ? 1 : 0 }); if (!wh) shownAfter.push({ id, y }); page.push({ id, y: wh ? L.none : y }); }
      allClean.push({ id, y: bad === 0 ? 1 : 0 });
    }
    const t9 = "§11 round 9 (round-9 rater)";
    M(t9, sp, "r9.raw", "outfit renders with a visible defect, before the check", raw);
    M(t9, sp, "r9.recall", "defects the automatic check catches (outfit withheld)", caught);
    M(t9, sp, "r9.falseAlarm", "clean outfit renders the check withholds anyway", clean);
    M(t9, sp, "r9.shownBad", "outfit renders shown after the check that still have a defect", shownAfter);
    M(t9, sp, "r9.page", "what the page shows (outfit, or the no-outfit version when withheld) with a visible defect", page);
    M(t9, sp, "r9.none", "no-outfit version (new background + retouch) with a defect", safe);
    M(t9, sp, "r9.allClean", "people with all four outfits clean", allClean);

    // ---- §11 round 10: second rater, plain + cover, auto policy (cover when the plain render's jaw strip is open) + rule gate
    const pRaw = [], cRaw = [], autoRaw = [], oldPage = [], oldShown = [], newPage = [], newShown = [], oldRec = [], oldPrec = [], newRec = [], newPrec = [], none10 = [], calib = { cover: [], plain: [] }, agree = [];
    let fixed = 0, broke = 0;
    for (const id of ids(sp)) {
      const L = L10[id]; if (!L) continue; if (L.none != null) none10.push({ id, y: L.none });
      for (const g of GARMENTS) {
        const p = R[id] && R[id][g], c = R[id] && R[id][g + "+cover"]; if (!p || !c || L[g] == null || L[g + "+cover"] == null) continue;
        const yp = L[g], yc = L[g + "+cover"], pp = !QA.verdict(p.m).length, cp = !QA.verdict(c.m).length;
        pRaw.push({ id, y: yp }); cRaw.push({ id, y: yc }); if (yp && !yc) fixed++; if (!yp && yc) broke++;
        if (L9[id] && L9[id][g] != null) agree.push({ id, y: L9[id][g] === yp ? 1 : 0 });
        oldPage.push({ id, y: pp ? yp : L.none }); if (pp) oldShown.push({ id, y: yp }); if (yp) oldRec.push({ id, y: pp ? 0 : 1 }); if (!pp) oldPrec.push({ id, y: yp });
        const cov = p.jf && p.jf.open >= COVER_OPEN, y = cov ? yc : yp, pass = cov ? cp : pp;
        autoRaw.push({ id, y }); newPage.push({ id, y: pass ? y : L.none }); if (pass) { newShown.push({ id, y }); calib[cov ? "cover" : "plain"].push({ id, y: 1 - y }); }
        if (y) newRec.push({ id, y: pass ? 0 : 1 }); if (!pass) newPrec.push({ id, y });
      }
    }
    const t10 = "§11 round 10 (second rater)";
    M(t10, sp, "r10.plainRaw", "outfit render with a visible defect, plain (round 9 page)", pRaw);
    M(t10, sp, "r10.coverRaw", "outfit render with a visible defect, with the cover", cRaw);
    M(t10, sp, "r10.autoRaw", "outfit render with a visible defect, auto mode (cover when the jaw strip is open)", autoRaw);
    V(t10, sp, "r10.fixedBroke", "pairs the cover fixed / broke", `${fixed} / ${broke}`, { fixed, broke });
    M(t10, sp, "r10.oldShown", "round 9 page: outfit renders shown (gate passed) that are defective", oldShown);
    M(t10, sp, "r10.newShown", "round 10 page: outfit renders shown (gate passed) that are defective", newShown);
    M(t10, sp, "r10.oldPage", "round 9 page: what is shown once an outfit is picked, with a defect", oldPage);
    M(t10, sp, "r10.newPage", "round 10 page: what is shown once an outfit is picked, with a defect", newPage);
    M(t10, sp, "r10.oldRecall", "round 9 page: defects the gate withholds (recall)", oldRec);
    M(t10, sp, "r10.oldPrecision", "round 9 page: withheld renders that were defective (precision)", oldPrec);
    M(t10, sp, "r10.newRecall", "round 10 page: defects the gate withholds (recall)", newRec);
    M(t10, sp, "r10.newPrecision", "round 10 page: withheld renders that were defective (precision)", newPrec);
    M(t10, sp, "r10.none", "what the page shows on opening a photo (no outfit), with a defect", none10);
    M(t10, sp, "r10.calibCover", "calibrated confidence: rule-passing cover renders that were clean", calib.cover);
    M(t10, sp, "r10.calibPlain", "calibrated confidence: rule-passing plain renders that were clean", calib.plain);
    M(t10, sp, "r10.agree", "round-9 and round-10 raters agree on the plain render", agree);

    // ---- §11b photo booth ID photo
    const pb = {}; for (const r of plog.renders) (pb[r.id] = pb[r.id] || {})[r.g] = r;
    const bRaw = [], bWith = [], bLet = [], bNone = [];
    for (const id of Object.keys(plog.people).filter(i => plog.people[i].split === sp).sort()) {
      const L = LP[id]; if (!L || L.none == null) continue; bNone.push({ id, y: L.none });
      for (const g of OUTFITS) { const v = pb[id] && pb[id][g]; if (!v || L[g] == null) continue; const wh = !v.m || v.fails.includes("no-matte") || QA.boothVerdict(v.m).length > 0;
        bRaw.push({ id, y: L[g] }); bWith.push({ id, y: wh ? 1 : 0 }); if (!wh) bLet.push({ id, y: L[g] }); }
    }
    const tb = "§11b photo booth ID photo";
    M(tb, sp, "pb.raw", "drawn outfit with a visible defect", bRaw);
    M(tb, sp, "pb.withheld", "the outfit check (boothCheck) withholds", bWith);
    M(tb, sp, "pb.letThroughBad", "outfit renders the check lets through that are still defective", bLet);
    M(tb, sp, "pb.none", "no-outfit ID photo with a defect", bNone);
  }
  // ---- learned gate (§11): logistic regression on dev, person-grouped 5-fold CV, then the dev model scored once on test
  const rows = [];
  for (const id of Object.keys(people)) { const L = L10[id] || {}; for (const g of GARMENTS) for (const v of ["", "+cover"]) { const x = R[id] && R[id][g + v]; if (x && x.m && x.jf && L[g + v] != null) rows.push({ id, sp: people[id].split, cover: !!v, y: L[g + v], m: x.m, jf: x.jf }); } }
  const dev = rows.filter(r => r.sp === "dev"), dids = [...new Set(dev.map(r => r.id))].sort(), cv = new Map();
  for (let k = 0; k < 5; k++) { const te = new Set(dids.filter((_, i) => i % 5 === k)), f = fitLR(dev.filter(r => !te.has(r.id))); for (const r of dev.filter(r => te.has(r.id))) cv.set(r, f(r)); }
  const full = fitLR(dev);
  V("§11 learned gate", "dev", "lr.cvAuc", "learned gate AUC, person-grouped 5-fold CV on dev", +aucOf(dev, r => cv.get(r)).toFixed(3));
  V("§11 learned gate", "test", "lr.testAuc", "learned gate AUC on test (model trained on all dev, scored once)", +aucOf(rows.filter(r => r.sp === "test"), full).toFixed(3));
  // ---- round 11: pre-flight photo check (advice, tuned on dev) vs the round-10 outfit labels (auto-mode render per person × garment)
  if (data.slog11) {
    const P11 = data.slog11.people;
    for (const sp of ["dev", "test"]) {
      const flagged = [], passed = [];
      for (const id of ids(sp)) {
        const pre = P11[id] && P11[id].pre, L = L10[id]; if (!pre || !L) continue;
        const fl = (QA.photoSuitability && pre.m) ? !preOk(pre.m) : !pre.ok;
        for (const g of GARMENTS) { const p = R[id] && R[id][g]; if (!p || L[g] == null || L[g + "+cover"] == null) continue; const y = p.jf && p.jf.open >= COVER_OPEN ? L[g + "+cover"] : L[g]; (fl ? flagged : passed).push({ id, y }); }
      }
      const t = "§11 round 11 pre-flight (advice)";
      M(t, sp, "pre.flaggedBad", "photo flagged by the pre-flight: outfit renders (auto mode) with a visible defect", flagged);
      M(t, sp, "pre.passedBad", "photo passed the pre-flight: outfit renders (auto mode) with a visible defect", passed);
      M(t, sp, "pre.flaggedPeople", "people whose photo the pre-flight flags", ids(sp).filter(id => P11[id] && P11[id].pre).map(id => ({ id, y: preOk(P11[id].pre.m) ? 0 : 1 })));
    }
  }
  // ---- round 11: no-outfit renders after the clean-up (studio) and the edge extension + clean-up (photo booth ID), labels in studio-labels-r11.json
  if (data.L11) {
    for (const sp of ["dev", "test"]) {
      const st = [], pb = [], stOld = [], pbOld = [], pbFlag = [], pbFalse = [];
      for (const id of ids(sp)) {
        const l = data.L11[id]; if (!l) continue;
        if (l.none != null) { st.push({ id, y: l.none }); if (L10[id] && L10[id].none != null) stOld.push({ id, y: L10[id].none }); }
        if (l.pbNone != null) { pb.push({ id, y: l.pbNone }); if (LP[id] && LP[id].none != null) pbOld.push({ id, y: LP[id].none }); }
        const rv = data.plog11 && data.plog11.people[id] && data.plog11.people[id].review; if (rv && l.pbNone === 1) pbFlag.push({ id, y: rv.findings.length || (rv.spec && rv.spec.length) ? 1 : 0 });
        if (rv && l.pbNone === 0) pbFalse.push({ id, y: rv.findings.length ? 1 : 0 });
      }
      const t = "§11 round 11 no-outfit output";
      M(t, sp, "r11.stNoneOld", "studio no-outfit render with a defect, round 10 (second rater)", stOld);
      M(t, sp, "r11.stNone", "studio no-outfit render with a defect, round 11", st);
      M(t, sp, "r11.pbNoneOld", "photo booth no-outfit ID photo with a defect, round 10", pbOld);
      M(t, sp, "r11.pbNone", "photo booth no-outfit ID photo with a defect, round 11", pb);
      M(t, sp, "r11.reviewCatches", "defective round-11 ID photos on which the review step shows a finding", pbFlag);
      M(t, sp, "r11.reviewFalse", "clean round-11 ID photos on which the review step marks a leftover or cut", pbFalse);
    }
  }
  if (data.slog11) for (const sp of ["dev", "test"]) {
    const P = data.slog11.people, t = ids(sp).map(id => P[id] && P[id].firstMs).filter(Number.isFinite).sort((a, b) => a - b), q = p => t[Math.min(t.length - 1, Math.floor(p * t.length))];
    if (t.length) { V("timings", sp, "first11.p50", "round 11: first result after load, median ms", q(.5)); V("timings", sp, "first11.p95", "round 11: first result after load, p95 ms", q(.95)); }
  }
  // ---- timings (§11 performance): first result after load, per person
  for (const sp of ["dev", "test"]) {
    const t = ids(sp).map(id => people[id].firstMs).filter(Number.isFinite).sort((a, b) => a - b), q = p => t[Math.min(t.length - 1, Math.floor(p * t.length))];
    V("timings", sp, "first.p50", "first result after load, median ms (900–1200 px portraits, CPU)", q(.5));
    V("timings", sp, "first.p95", "first result after load, p95 ms", q(.95));
  }
  return out;
}

const pct = x => Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "—";
export function markdown(ms) {
  const lines = [];
  for (const t of [...new Set(ms.map(m => m.table))]) {
    lines.push(`\n### ${t}\n`, "| metric | dev | test |", "| --- | --- | --- |");
    for (const key of [...new Set(ms.filter(m => m.table === t).map(m => m.key))]) {
      const cell = sp => { const m = ms.find(x => x.table === t && x.key === key && x.split === sp); return !m ? "" : m.value != null ? String(m.value) : m.n ? `${pct(m.k / m.n)} [${pct(m.lo)}–${pct(m.hi)}] (${m.k}/${m.n})` : "—"; };
      lines.push(`| ${ms.find(x => x.key === key).label} | ${cell("dev")} | ${cell("test")} |`);
    }
  }
  return lines.join("\n");
}

/** counts that ACCURACY.md §11–§11b states; each must appear there as "k/n" (the interval method may change, the counts may not) */
export const STATED = {
  test: ["r9.raw", "r9.recall", "r9.falseAlarm", "r9.shownBad", "r9.page", "r9.allClean", "r10.plainRaw", "r10.coverRaw", "r10.oldShown", "r10.newShown", "r10.oldPage", "r10.newPage", "r10.oldRecall", "r10.oldPrecision", "r10.newRecall", "r10.newPrecision", "r10.none", "r10.calibCover", "r10.calibPlain", "r10.agree", "pb.raw", "pb.withheld", "pb.letThroughBad", "pb.none", "pre.flaggedBad", "pre.passedBad", "r11.stNone", "r11.pbNone", "r11.reviewCatches", "r11.reviewFalse"],
  dev: ["r9.raw", "r9.recall", "r9.shownBad", "r10.plainRaw", "r10.coverRaw", "r10.autoRaw", "r10.oldPage", "r10.newPage", "r10.calibCover", "r10.calibPlain", "r10.agree", "pb.raw", "pb.withheld", "pb.letThroughBad", "pb.none", "pre.flaggedBad", "pre.passedBad", "r11.stNone", "r11.pbNone"]
};
export function check(ms = tables(), md = readFileSync(join(REPO, "ACCURACY.md"), "utf8")) {
  const a = md.indexOf("## 11. "), b = md.indexOf("## 12. "), sec = md.slice(a, b > a ? b : undefined), bad = [];
  for (const [sp, keys] of Object.entries(STATED)) for (const key of keys) {
    const m = ms.find(x => x.split === sp && x.key === key);
    if (!m || !m.n) { bad.push(`${sp} ${key}: no data`); continue; }
    if (!new RegExp(`(^|[^0-9])${m.k}/${m.n}([^0-9]|$)`).test(sec)) bad.push(`${sp} ${key}: ${m.k}/${m.n} (${m.label}) not found in ACCURACY.md §11–§11b`);
  }
  // the fixed / broke counts and the learned-gate AUCs are quoted in prose
  for (const sp of ["dev", "test"]) { const m = ms.find(x => x.split === sp && x.key === "r10.fixedBroke"); if (!new RegExp(`fixed ${m.fixed}\\b[^.]*\\b${m.broke}\\b`).test(sec.replace(/\s+/g, " "))) bad.push(`${sp} cover fixed ${m.fixed} / broke ${m.broke} not found`); }
  const cvA = ms.find(x => x.key === "lr.cvAuc").value, teA = ms.find(x => x.key === "lr.testAuc").value;
  if (!(cvA >= .395 && cvA < .475)) bad.push(`learned gate CV AUC ${cvA} outside the stated 0.40–0.47`);
  if (!sec.includes("AUC " + teA.toFixed(2))) bad.push(`learned gate test AUC ${teA.toFixed(2)} not stated`);
  return bad;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), ms = tables();
  console.log(markdown(ms));
  const j = args.indexOf("--json"); if (j >= 0) writeFileSync(args[j + 1], JSON.stringify(ms, null, 1));
  if (args.includes("--check")) { const bad = check(ms); if (bad.length) { console.error("\nACCURACY.md §11 mismatches:\n- " + bad.join("\n- ")); process.exit(1); } console.log("\nACCURACY.md §11–§11b counts: all found"); }
}
