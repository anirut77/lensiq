// tests/e2e/attendance.e2e.mjs — WP3: multi-face check-in (unique assignment, 2-frame confirmation, per-face results).
// Faces come from window.__LQ_FAKE_DET and matches from window.__LQ_FAKE_MATCH (both only honoured with ?fakedet on localhost).
import { assert, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const D = v => Array.from({ length: 128 }, (_, k) => +(Math.sin(k * v) * 0.1).toFixed(5));
const PEOPLE = [
  { id: "pA", name: "สมชาย ทดสอบ", code: "A01", descriptor: D(1) },
  { id: "pB", name: "สมหญิง ทดสอบ", code: "B02", descriptor: D(2) }
];
// init script: scripted faces + fake matcher; every detector call records how many logs exist BEFORE that frame runs
const HOOKS = `
  window.__faces = [];
  window.__calls = [];
  window.__LQ_FAKE_DET = (key, now) => {
    let n = 0; try { n = JSON.parse(localStorage.getItem("att-logs") || "[]").length; } catch {}
    window.__calls.push(n);
    return window.__faces.map(f => Object.assign({ score: 0.95 }, f));
  };
  window.__LQ_FAKE_MATCH = d => d && d.who ? { label: d.who, distance: d.dist == null ? 0.3 : d.dist } : { label: "unknown", distance: 0.9 };
`;
const FACE = (x, who, dist) => ({ x, y: 0.3, w: 0.18, h: 0.3, who, dist });

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    const page = await browser.newPage(null, { initScripts: [fakeCams, HOOKS] });
    const url = `${base}/attendance.html?cpu&fakedet`;
    await page.goto(url);
    await page.evaluate(p => { localStorage.clear(); localStorage.setItem("att-people", JSON.stringify(p)); }, PEOPLE);
    await page.reload();
    await page.waitFor("ready === true && people.length === 2", 15000);

    const logs = () => page.evaluate(() => JSON.parse(localStorage.getItem("att-logs") || "[]"));
    const setSession = s => page.evaluate(s => { const el = document.querySelector("#session"); el.value = s; el.dispatchEvent(new Event("input")); }, s);
    const startScan = () => page.evaluate(() => { if (!scanning) document.querySelector("#startScan").click(); return scanning; });
    const stopScan = () => page.evaluate(() => { if (scanning) document.querySelector("#startScan").click(); return scanning; });
    const kinds = () => page.evaluate(() => [...document.querySelectorAll("#faceResults li")].map(li => li.dataset.kind));
    // empty frames long enough for the confirmation window (1.5 s) to forget everyone
    const clearFaces = async () => { await page.evaluate(() => { window.__faces = []; }); await sleep(1900); };

    await check("2 known faces: both checked in only after the 2nd frame, once each", async () => {
      await setSession("รอบ 1");
      await page.evaluate(f => { window.__faces = f; window.__calls = []; }, [FACE(0.1, "pA"), FACE(0.6, "pB")]);
      assert(await startScan(), "scanning started");
      await page.waitFor("window.__calls.length >= 5", 8000);
      const calls = await page.evaluate(() => window.__calls.slice());
      assert(calls[0] === 0 && calls[1] === 0, "no check-in after frame 1: " + JSON.stringify(calls));
      assert(calls[2] === 2, "both checked in after frame 2: " + JSON.stringify(calls));
      assert(calls.slice(2).every(n => n === 2), "no further check-ins: " + JSON.stringify(calls));
      const l = await logs();
      assert(l.length === 2 && l.filter(x => x.pid === "pA").length === 1 && l.filter(x => x.pid === "pB").length === 1, "one log each: " + JSON.stringify(l));
      const k = await kinds();
      assert(k.length === 2 && k.every(x => x === "ok"), "per-face results ok,ok: " + k);
      const lab = await page.evaluate(() => document.querySelector("#faceResults").textContent);
      assert(lab.includes("สมชาย") && lab.includes("สมหญิง"), "both names listed");
    });

    await check("2 faces matching the same person: one check-in, the other face shown as unknown", async () => {
      await clearFaces();
      await setSession("รอบ 2");
      await page.evaluate(f => { window.__faces = f; window.__calls = []; }, [FACE(0.1, "pA", 0.4), FACE(0.6, "pA", 0.2)]);
      await page.waitFor("window.__calls.length >= 5", 8000);
      const l = (await logs()).filter(x => x.session === "รอบ 2");
      assert(l.length === 1 && l[0].pid === "pA", "exactly one check-in for pA: " + JSON.stringify(l));
      const k = await kinds();
      assert(k.includes("unknown") && k.filter(x => x === "ok").length === 1, "results ok + unknown: " + k);
    });

    await check("1 match + 1 unknown: both results visible; unknown notice does not overwrite success", async () => {
      await clearFaces();
      await setSession("รอบ 3");
      await page.evaluate(f => { window.__faces = f; window.__calls = []; }, [FACE(0.1, "pB"), FACE(0.6, null)]);
      await page.waitFor("window.__calls.length >= 5", 8000);
      const k = await kinds();
      assert(k.includes("ok") && k.includes("unknown"), "results ok + unknown: " + k);
      const r = await page.evaluate(() => ({
        banner: document.querySelector("#banner").className, text: document.querySelector("#banner").textContent,
        note: !document.querySelector("#unknownNote").hidden
      }));
      assert(/\bok\b/.test(r.banner) && r.text.includes("สมหญิง"), "banner keeps the success: " + JSON.stringify(r));
      assert(r.note, "unknown note visible");
      const l = (await logs()).filter(x => x.session === "รอบ 3");
      assert(l.length === 1 && l[0].pid === "pB", "one check-in: " + JSON.stringify(l));
      await stopScan();
    });

    await check("registration still rejects more than one face", async () => {
      await page.evaluate(f => {
        window.__faces = f;
        document.querySelector('.tab[data-t="register"]').click();
        const fm = document.querySelector("#regForm");
        fm.name.value = "คนใหม่"; fm.code.value = "C03"; fm.consent.checked = true;
        fm.requestSubmit();
      }, [FACE(0.1, null), FACE(0.6, null)]);
      await page.waitFor(() => document.querySelector("#regMsg").textContent.includes("พบใบหน้าหลายคน"), 5000);
      const n = await page.evaluate(() => JSON.parse(localStorage.getItem("att-people")).length);
      assert(n === 2, "nobody added: " + n);
    });

    await check("registration with exactly one face still works", async () => {
      await page.evaluate(f => { window.__faces = f; document.querySelector("#regForm").requestSubmit(); }, [Object.assign(FACE(0.3, null), { descriptor: D(7) })]);
      await page.waitFor(() => document.querySelector("#regMsg").textContent.includes("สำเร็จ"), 6000);
      const n = await page.evaluate(() => JSON.parse(localStorage.getItem("att-people")).length);
      assert(n === 3, "one person added: " + n);
    });

    await check("privacy: no images, no /api, unknown faces never stored, no uncaught errors", async () => {
      await privacyScan(page);
      const st = await page.evaluate(() => ({ people: JSON.parse(localStorage.getItem("att-people")), keys: Object.keys(localStorage) }));
      assert(st.people.length === 3 && st.people.every(p => ["pA", "pB"].includes(p.id) || p.code === "C03"), "only enrolled people stored");
      assert(!st.keys.some(k => /desc|face|unknown/i.test(k)), "no extra descriptor keys: " + st.keys);
      const errs = page.consoleErrors.filter(e => e.kind !== "log");
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
    });
    await page.close();

    await check("attendance.html?cpu (real models, WASM): no console errors, no horizontal overflow at 390px", async () => {
      const p = await browser.newPage(null, { initScripts: [fakeCams] });
      await p.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await p.goto(`${base}/attendance.html?cpu`);
      await p.waitFor("ready === true || !document.querySelector('#camMsg').classList.contains('hide') && /ไม่|ลองใหม่/.test(document.querySelector('#camMsg').textContent) && 'err'", 30000);
      const ok = await p.evaluate(() => ready);
      assert(ok, "page ready with real models: " + await p.evaluate(() => document.querySelector("#camMsg").textContent));
      for (const t of ["checkin", "register", "records"]) {
        await p.evaluate(t => document.querySelector(`.tab[data-t="${t}"]`).click(), t);
        const w = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        assert(w.sw <= w.cw, `no horizontal overflow on ${t}: ${JSON.stringify(w)}`);
      }
      const errs = p.consoleErrors.filter(e => e.kind !== "log");
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await p.close();
    });
  } finally { await browser.close(); }
}
