// tests/e2e/gate-detect.e2e.mjs — LENSIQ Gate plate DETECTOR on the fixed synthetic demo set (LQPlate.DEMO_SET: seed
// 20261108, 8 categories x 20 scenes, drawn by GateKit.drawScene with the self-hosted Prompt font — no system fonts),
// the shipped pipeline (classical proposals + LPD-YuNet when the classical box is weak, ONNX Runtime Web WASM, no WebGL).
// Asserts the MEASURED baseline (no regression; docs/GATE.md "Detection demo set"), not the 90 % target: the target is
// reported met / not met per category. Same pass rule on CI and dev machines: a tolerance of 2 scenes per category for
// rasterisation differences between platforms. Also: real Thai OCR exact reads on the first 5 scenes of each category.
import { assert, assertNoWebGL, privacyScan } from "./cdp.mjs";

// measured 2026-11-08 (macOS, Chrome headless) with tools/plate-det-eval.mjs — top-1 box IoU >= 0.5, out of 20
const MEASURED = { white: 20, yellow: 19, green: 20, red: 20, blue: 20, moto: 19, night: 19 };
const MEASURED_FP = 1;      // plate-less scenes (of 20) whose top box would start an auto-read
const MEASURED_READS = 23;  // exact reads, first 5 scenes of each of the 7 plate categories (35)
const TOL = 2, TOL_READS = 3;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("detector demo set: per-colour / motorcycle / night top-1 detection >= measured baseline; false triggers; exact reads", async () => {
      const page = await browser.newPage(null, { initScripts: ["window.confirm=()=>true;"] });
      await page.goto(`${base}/parking.html?cpu`);
      await assertNoWebGL(page);
      await page.waitFor("!!(window.GateKit && window.GateKit.demoEval)", 15000);
      const fontOk = await page.evaluate(async () => { await document.fonts.load("600 46px Prompt", "กข 0123456789"); await document.fonts.load("500 24px Prompt",
        "กรุงเทพมหานคร"); return document.fonts.check("600 46px Prompt", "1กข 2345"); });
      assert(fontOk, "Prompt (Thai + Latin) loaded before drawing the scenes");
      const r = await page.evaluate(async () => {
        const res = await window.GateKit.demoEval({ ocr: 5 });
        const P = window.LQPlate, misses = res.rows.filter(x => x.truth && !(x.boxes[0] && P.iou(x.boxes[0], x.truth) >= 0.5))
          .map(x => ({ i: x.i, cat: x.cat, top: x.boxes[0] || null }));
        return { s: res.summary, model: P.plateDetReady(), misses };
      });
      const s = r.s, table = Object.entries(s).map(([k, v]) => k === "none" ? `none fp ${v.fp.x}/${v.neg}`
        : `${k} ${v.det.x}/${v.n} (top3 ${v.det3.x}, read ${v.read.x}/${v.read.n}, 90%: ${v.target})`).join(" · ");
      console.log("       " + table + (r.model ? "" : " · LPD-YuNet NOT loaded"));
      assert(r.model, "LPD-YuNet loaded from vendor/models/plate-det");
      for (const [cat, m] of Object.entries(MEASURED)) {
        assert(s[cat] && s[cat].n === 20, cat + " has 20 scenes");
        assert(s[cat].det.x >= m - TOL, `${cat}: detection ${s[cat].det.x}/20 below the measured ${m} - ${TOL} · ${table} · misses ${JSON.stringify(r.misses.filter(x => x.cat === cat))}`);
      }
      assert(s.none.neg === 20 && s.none.fp.x <= MEASURED_FP + TOL, `false triggers ${s.none.fp.x}/20 · ${table}`);
      const reads = Object.entries(s).filter(([k]) => k !== "none").reduce((a, [, v]) => a + v.read.x, 0);
      const readN = Object.entries(s).filter(([k]) => k !== "none").reduce((a, [, v]) => a + v.read.n, 0);
      assert(readN === 35 && reads >= MEASURED_READS - TOL_READS, `exact reads ${reads}/${readN} below the measured ${MEASURED_READS} - ${TOL_READS} · ${table}`);
      const ext = page.requests.filter(q => !q.url.startsWith(base) && !/^(data|blob):/.test(q.url));
      assert(!ext.length, "third-party requests " + ext.map(q => q.url));
      assert(page.requests.some(q => /plate-det\/license_plate_detection_lpd_yunet_2023mar\.onnx/.test(q.url)), "plate finder model loaded locally");
      await privacyScan(page);
      await page.close();
    });
  } finally { await browser.close(); }
}
