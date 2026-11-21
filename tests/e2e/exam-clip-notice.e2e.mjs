// tests/e2e/exam-clip-notice.e2e.mjs — Exam lab evidence-clip notice race (investigation EXAMFACES-CLIP-2026-11-21, task 2).
// With ?clip=1 the notice and consent text must say "clip ON" as soon as the page script has run, NOT only after the kept-clip
// list has been read from IndexedDB. Before the fix exam-lab.js ran `clips.refresh().then(clipNotice)`, so until the
// IndexedDB reads finished (or forever, if indexedDB.open never answers) the page showed the clip-OFF wording ("no image or
// audio recording") and the clip-OFF consent sentence while recording was configured on, and a tick given under that
// wording survived. FIXED TEST written and locked (evals-locks/exam-clip-notice.sha256) BEFORE the product change.
// How: an init script holds every indexedDB.open of "lq-exam-clips" (the request answers only after window.__idbRelease()),
// so the checks run while refresh() is provably still waiting (window.__idbHeld > 0). The same init script snapshots the page
// at the exact moment exam-lab.js finishes (its last statement assigns window.__LQ_EXAM_LAB; a setter records the state in
// that same synchronous step, before any language-file event can re-render the notice).
//   N1 ?clip=1&clipdays=7, IndexedDB held, in Thai, English and Chinese (fresh isolated page each): at the end of the page script
//      and again once the language file is in: clip-ON lead, "what is not
//      done" (n2c), clip notice (n5c: 10 s, 7 days, not sent off the device), clip-ON consent sentence, clip switch ticked,
//      and every clip-OFF counterpart hidden; then IndexedDB answers and the wording is still clip-ON.
//   N2 ?clip=1&clipauto=1, IndexedDB held: the auto-keep notice (n5a wording) is shown at once.
//   N3 clips OFF, one kept (not expired) clip record already on the device, IndexedDB held: clips.kept starts as [] and the
//      clip box stays hidden; after IndexedDB answers clips.kept has the record and the clip box is shown (the second
//      clipNotice after refresh() still runs). The clip-OFF wording is shown throughout (the setting is off).
// No camera is started; no photo of a person; nothing is sent.
import { assert } from "./cdp.mjs";
import { exceptions, sleep } from "./exam-kit.mjs";

const THAI = /[ก-ฺเ-๛]/;
const lang = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
// holds indexedDB.open("lq-exam-clips") until window.__idbRelease(); every other database opens normally
const HOLD = `(() => {
  if (!/[?&]idbhold\\b/.test(location.search) || !window.indexedDB) return;
  const idb = window.indexedDB, open0 = idb.open.bind(idb);
  let release; const gate = new Promise(r => { release = r; });
  window.__idbHeld = 0; window.__idbRelease = () => release();
  // the state at the moment exam-lab.js finishes: its last statement assigns window.__LQ_EXAM_LAB (synchronous, same task)
  Object.defineProperty(window, "__LQ_EXAM_LAB", { configurable: true, get() { return undefined; }, set(lab) {
    Object.defineProperty(window, "__LQ_EXAM_LAB", { value: lab, writable: true, configurable: true, enumerable: true });
    try {
      const $ = q => document.querySelector(q), vis = q => !$(q).hidden;
      window.__snap = { held: window.__idbHeld, kept: lab.clips.kept.length, cfgOn: lab.clipCfg.on, cfgAuto: lab.clipCfg.auto,
        lead: vis("#lead"), leadC: vis("#leadC"), n2: vis("#n2"), n2c: vis("#n2c"), n5c: vis("#n5c"), n5len: $("#n5c").textContent.length,
        consentTxt: vis("#consentTxt"), consentClip: vis("#consentClip"), clipOn: $("#clipOn").checked, clipAuto: $("#clipAuto").checked,
        clipBox: vis("#clipBox"), days: $("#clipDays").value };
    } catch (e) { window.__snap = { error: String(e) }; }
  } });
  idb.open = function (name, v) {
    if (name !== "lq-exam-clips") return open0(name, v);
    window.__idbHeld++;
    let r = null;
    const fake = { onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null,
      get result() { return r ? r.result : undefined; }, get error() { return r ? r.error : null; }, get readyState() { return r ? r.readyState : "pending"; } };
    gate.then(() => {
      window.__idbHeld--;
      r = open0(name, v);
      for (const k of ["onsuccess", "onerror", "onupgradeneeded", "onblocked"]) r[k] = e => { if (typeof fake[k] === "function") fake[k].call(fake, e); };
    });
    return fake;
  };
})();`;

const RE = {
  th: { s10: /10 วินาที/, d7: /7 วัน/, off: /ไม่ถูกส่งออก/, auto: /โดยอัตโนมัติ/ },
  en: { s10: /10 seconds/, d7: /7 days/, off: /never sent off/, auto: /automatically/ },
  zh: { s10: /10 秒/, d7: /7 天/, off: /不会发送出/, auto: /自动/ }
};

const read = () => {
  const $ = s => document.querySelector(s);
  const vis = s => !$(s).hidden;
  return {
    held: window.__idbHeld || 0, kept: window.__LQ_EXAM_LAB ? window.__LQ_EXAM_LAB.clips.kept.length : -1,
    cfgOn: window.__LQ_EXAM_LAB ? window.__LQ_EXAM_LAB.clipCfg.on : null,
    lead: vis("#lead"), leadC: vis("#leadC"), n2: vis("#n2"), n2c: vis("#n2c"), n5c: vis("#n5c"), n5: $("#n5c").textContent,
    consentTxt: vis("#consentTxt"), consentClip: vis("#consentClip"), clipOn: $("#clipOn").checked, clipAuto: $("#clipAuto").checked,
    clipBox: vis("#clipBox"), days: $("#clipDays").value
  };
};

function assertOn(s, l, label, { auto = false } = {}) {
  const r = RE[l];
  assert(s.cfgOn === true, `${label} [${l}]: clipCfg.on is not true: ${JSON.stringify(s)}`);
  assert(!s.lead && s.leadC, `${label} [${l}]: lead text is not the clip-ON one: ${JSON.stringify(s)}`);
  assert(!s.n2 && s.n2c, `${label} [${l}]: "what is not done" is not the clip-ON one (n2 says no image recording): ${JSON.stringify(s)}`);
  assert(!s.consentTxt && s.consentClip, `${label} [${l}]: consent sentence is not the clip-ON one: ${JSON.stringify(s)}`);
  assert(s.n5c && r.s10.test(s.n5) && r.off.test(s.n5), `${label} [${l}]: clip notice missing or incomplete: ${JSON.stringify(s.n5)}`);
  if (auto) assert(s.clipAuto && r.auto.test(s.n5), `${label} [${l}]: auto-keep notice not shown: ${JSON.stringify(s)}`);
  else assert(!s.clipAuto && r.d7.test(s.n5) && s.days === "7", `${label} [${l}]: keep period not in the notice: ${JSON.stringify(s)}`);
  assert(s.clipOn, `${label} [${l}]: clip switch not ticked: ${JSON.stringify(s)}`);
  if (l !== "th") assert(!THAI.test(s.n5), `${label} [${l}]: Thai letters in the notice: ${s.n5.slice(0, 120)}`);
}

/** language-independent clip-ON checks on the snapshot taken when exam-lab.js finished */
function assertSnapOn(n, label, { auto = false, days = "7" } = {}) {
  assert(n && !n.error, `${label}: no snapshot at the end of exam-lab.js: ${JSON.stringify(n)}`);
  assert(n.held > 0, `${label}: IndexedDB was not held when exam-lab.js finished: ${JSON.stringify(n)}`);
  assert(n.kept === 0, `${label}: clips.kept should start empty: ${JSON.stringify(n)}`);
  assert(n.cfgOn === true && n.cfgAuto === auto, `${label}: clip setting not read from the address: ${JSON.stringify(n)}`);
  assert(!n.lead && n.leadC && !n.n2 && n.n2c && n.n5c && n.n5len > 40 && !n.consentTxt && n.consentClip && n.clipOn && n.clipAuto === auto,
    `${label}: clip-OFF wording or consent still shown when the page script finished: ${JSON.stringify(n)}`);
  if (!auto) assert(n.days === days, `${label}: keep period ${n.days}, expected ${days}`);
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const LAB = `${base}/exam-lab.html?cpu&fakedet&idbhold`;
  try {
    for (const l of ["th", "en", "zh"]) {
      await check(`exam-clip-notice N1 [${l}]: ?clip=1 shows the clip-ON notice and consent before IndexedDB answers`, async () => {
        const page = await browser.newPage(null, { isolated: true, initScripts: [fakeCams, lang(l), HOLD] });
        try {
          await page.goto(`${LAB}&clip=1&clipdays=7`);
          await page.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
          assertSnapOn(await page.evaluate(() => window.__snap), `N1 end of page script [${l}]`);
          if (l !== "th") await page.waitFor(`!${THAI}.test(document.querySelector("#n5c").textContent) && document.querySelector("#n5c").textContent.length > 20`, 8000).catch(() => {});
          const s = await page.evaluate(read);
          assert(s.held > 0, `N1 [${l}]: IndexedDB was not held (the check must run before refresh() resolves): ${JSON.stringify(s)}`);
          assert(s.kept === 0, `N1 [${l}]: clips.kept should start empty: ${JSON.stringify(s)}`);
          assertOn(s, l, "N1 held");
          await page.evaluate(() => window.__idbRelease());
          await page.waitFor("window.__idbHeld === 0", 5000);
          await sleep(500);
          const after = await page.evaluate(read);
          assertOn(after, l, "N1 after IndexedDB answered");
          const ex = exceptions(page);
          assert(!ex.length, `N1 [${l}]: page exceptions: ${JSON.stringify(ex).slice(0, 400)}`);
        } finally { await page.close(); }
      });
    }

    await check("exam-clip-notice N2: ?clip=1&clipauto=1 shows the auto-keep notice before IndexedDB answers", async () => {
      const page = await browser.newPage(null, { isolated: true, initScripts: [fakeCams, lang("th"), HOLD] });
      try {
        await page.goto(`${LAB}&clip=1&clipauto=1`);
        await page.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
        assertSnapOn(await page.evaluate(() => window.__snap), "N2 end of page script", { auto: true });
        const s = await page.evaluate(read);
        assert(s.held > 0, `N2: IndexedDB was not held: ${JSON.stringify(s)}`);
        assertOn(s, "th", "N2 held", { auto: true });
      } finally { await page.close(); }
    });

    await check("exam-clip-notice N3: clips off, a kept clip on the device: clip box hidden while held, shown after IndexedDB answers", async () => {
      const page = await browser.newPage(null, { isolated: true, initScripts: [fakeCams, lang("th"), HOLD] });
      try {
        // seed one kept, not yet expired clip record (metadata only; env is a placeholder, it is never played here)
        await page.goto(`${base}/exam-lab.html?cpu&fakedet`);
        await page.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
        const seeded = await page.evaluate(() => new Promise(res => {
          const r = indexedDB.open("lq-exam-clips", 1);
          r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("clips")) r.result.createObjectStore("clips", { keyPath: "id" }); };
          r.onerror = () => res(false);
          r.onsuccess = () => {
            const db = r.result, t = Date.now(), tx = db.transaction("clips", "readwrite");
            tx.objectStore("clips").put({ id: "nT3st-e1-abcd", room: "NOTE1", node: "nT3st", seat: "3", sig: "away", lvl: 2, t, from: t - 5000, to: t,
              ms: 5000, size: 10, how: "kept", kept: t, exp: t + 3 * 86400000, mime: "video/webm", env: "{}" });
            tx.oncomplete = () => { db.close(); res(true); }; tx.onerror = () => { db.close(); res(false); };
          };
        }));
        assert(seeded, "N3: could not seed the clip record");
        await page.goto(LAB);
        await page.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
        const n = await page.evaluate(() => window.__snap);
        assert(n && n.held > 0 && n.kept === 0 && n.cfgOn === false && !n.clipBox && n.n2 && n.consentTxt && !n.consentClip,
          `N3 end of page script: kept [] / clip box hidden / clip-OFF wording expected: ${JSON.stringify(n)}`);
        const s = await page.evaluate(read);
        assert(s.held > 0, `N3: IndexedDB was not held: ${JSON.stringify(s)}`);
        assert(s.cfgOn === false && s.kept === 0 && !s.clipBox, `N3 held: clips off, kept [] and clip box hidden expected: ${JSON.stringify(s)}`);
        assert(s.lead && !s.leadC && s.n2 && !s.n2c && !s.n5c && s.consentTxt && !s.consentClip && !s.clipOn, `N3 held: clip-OFF wording expected: ${JSON.stringify(s)}`);
        await page.evaluate(() => window.__idbRelease());
        await page.waitFor("window.__idbHeld === 0 && window.__LQ_EXAM_LAB.clips.kept.length === 1", 5000);
        await sleep(300);
        const after = await page.evaluate(read);
        assert(after.clipBox && after.kept === 1, `N3 after: clip box must be shown when a kept clip exists: ${JSON.stringify(after)}`);
        assert(after.n2 && !after.n2c && after.consentTxt && !after.consentClip, `N3 after: clip-OFF wording expected: ${JSON.stringify(after)}`);
        await page.evaluate(() => new Promise(res => { const d = indexedDB.deleteDatabase("lq-exam-clips"); d.onsuccess = d.onerror = d.onblocked = () => res(); }));
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
}
