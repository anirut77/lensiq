// tests/e2e/palm-hands.e2e.mjs — palm reading: left / right / auto / both-hands modes, hand-shaped guide outline that follows the
// chosen (or detected) side and the mirrored front-camera preview, live fit score, wrong-hand warning, comparison of two hands.
// Pages run with ?cpu&fakedet: window.__dets (normalised boxes + side) is what every fake detector call returns.
import { assert, assertNoWebGL, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95 };
const H2 = { x: 0.02, y: 0.3, w: 0.25, h: 0.5, score: 0.9 };
const L = Object.assign({ side: "left" }, HAND), R = Object.assign({ side: "right" }, HAND);

const detScript = `(() => {
  window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" };
  window.__dets = [];
  window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d));
  if (window.__LQ_FRONT) { // report the fake camera as a front (selfie) camera -> mirrored preview
    const md = navigator.mediaDevices, g = md.getUserMedia;
    md.getUserMedia = async c => { const s = await g.call(md, c), t = s.getVideoTracks()[0], gs = t.getSettings.bind(t); t.getSettings = () => Object.assign({}, gs(), { facingMode: "user" }); return s; };
  }
})();`;

function realErrors(page) {
  return page.consoleErrors.filter(e => !/\/api\/[a-z]+\/status/.test((e.url || "") + " " + (e.text || "")) && !(e.kind !== "exception" && /404/.test(e.text || "") && /\/api\//.test(e.url || "")));
}
async function privacy(page) {
  for (let i = page.requests.length - 1; i >= 0; i--) {
    const r = page.requests[i];
    if (r.method === "GET" && /\/api\/[a-z]+\/status$/.test(new URL(r.url).pathname)) page.requests.splice(i, 1);
  }
  return privacyScan(page);
}
async function open(browser, base, fakeCams, pre = "") {
  const page = await browser.newPage(null, { initScripts: [pre, fakeCams, detScript].filter(Boolean) });
  await page.goto(`${base}/palm.html?cpu&fakedet`);
  await page.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
  return page;
}
async function noOverflow(page, width) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: width < 500 ? 844 : 900, deviceScaleFactor: width < 500 ? 2 : 1, mobile: width < 500 });
  await sleep(400);
  const r = await page.evaluate(() => {
    const cw = document.documentElement.clientWidth, wide = [];
    document.querySelectorAll("#plApp *").forEach(el => { const b = el.getBoundingClientRect(); if (b.width && b.right > cw + 1 && !el.closest(".table-wrap")) wide.push((el.id || el.className || el.tagName) + ":" + Math.round(b.right)); });
    return { sw: document.documentElement.scrollWidth, cw, wide: wide.slice(0, 5) };
  });
  await page.send("Emulation.clearDeviceMetricsOverride");
  assert(r.sw <= r.cw + 1 && !r.wide.length, `horizontal overflow at ${width}px: ` + JSON.stringify(r));
}
const setDets = (page, dets) => page.evaluate(d => { window.__dets = d; }, dets);
const click = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
async function startCam(page) {
  await click(page, "#plStartCam");
  await page.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 8000);
}
/** snap -> editor (auto lines) -> อ่านลายมือ -> result with local narration */
async function snapAndRead(page) {
  await click(page, "#plSnap");
  await page.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
  await click(page, "#plRead");
  await page.waitFor(`!document.getElementById("plResult").hidden && document.querySelectorAll("#plNarr .fa-section").length >= 3`, 15000);
}
const guide = page => page.evaluate(() => window.__palm.guide);

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("palm left mode: left-hand outline, fit score, wrong-hand warning, 2-hand warning kept, result says มือซ้าย", async () => {
      const page = await open(browser, base, fakeCams);
      await assertNoWebGL(page);
      await click(page, '[data-side="left"]');
      assert(await page.evaluate(() => document.querySelector('[data-side="left"]').getAttribute("aria-checked") === "true"), "left selected");
      await startCam(page);
      await setDets(page, [R]);
      const w = await page.waitFor(`(() => { const e = document.getElementById("plWrong"); return !e.hidden && e.offsetWidth > 0 && e.textContent; })()`, 5000);
      assert(w === "ตอนนี้เห็นมือขวา — เลือกมือซ้ายไว้", "wrong-hand text: " + w);
      const g1 = await guide(page);
      assert(g1.side === "left" && g1.wrong === true && g1.seen === "right" && g1.mirrored === false, "guide " + JSON.stringify(g1));
      assert(await page.evaluate(() => [...document.querySelectorAll("#plQc li")].some(l => l.textContent.includes("เป็นมือซ้ายตามที่เลือก") && l.classList.contains("no"))), "qc side item fails");
      await setDets(page, [L]);
      await page.waitFor(`document.getElementById("plWrong").hidden && /ตรงกรอบ \\d+%/.test(document.getElementById("plFit").textContent)`, 5000);
      const g2 = await guide(page);
      assert(g2.side === "left" && g2.wrong === false && g2.fit > 0 && g2.fit <= 1, "guide " + JSON.stringify(g2));
      assert(await page.evaluate(() => document.getElementById("plGuideSide").textContent === "กรอบมือซ้าย"), "guide chip");
      // the existing two-hand warning still works
      await setDets(page, [L, Object.assign({ side: "left" }, H2)]);
      await page.waitFor(`!document.getElementById("plMulti").hidden && document.getElementById("plWrong").hidden`, 5000);
      await setDets(page, [L]);
      await page.waitFor(`document.getElementById("plMulti").hidden`, 5000);
      await snapAndRead(page);
      const r = await page.evaluate(() => ({ side: window.__palm.S.side, badge: document.getElementById("plSideBadge").textContent, mest: document.querySelectorAll("#plMountEst .mest").length,
        top: document.querySelectorAll("#plMountEst .mest.top").length, fingers: document.querySelectorAll("#plFingers li").length, cmp: document.getElementById("plCompare").hidden, next: document.getElementById("plPairNext").hidden,
        ids: window.__palm.S.facts.items.map(i => i.id) }));
      assert(r.side === "left" && r.badge.includes("อ่านจากมือซ้าย") && r.badge.includes("ศักยภาพที่ติดตัว"), "badge " + r.badge);
      assert(r.mest === 7 && r.top >= 1 && r.fingers >= 5 && r.cmp && r.next, JSON.stringify(r));
      for (const p of [/^pinky\./, /^fingerdom\./, /^spread\./, /^mount\./, /^bagua\./, /^side\.other$/]) assert(r.ids.some(i => p.test(i)), "facts " + p + " in " + r.ids.join(","));
      await page.evaluate(() => window.__palm.makeCard());
      await privacy(page);
      await noOverflow(page, 390); await noOverflow(page, 1280);
      const errs = realErrors(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("palm right mode, mirrored front camera: outline mirrors with the preview; wrong-hand snap warns and can be swapped", async () => {
      const page = await open(browser, base, fakeCams, "window.__LQ_FRONT = true;");
      await click(page, '[data-side="right"]');
      await startCam(page);
      await page.waitFor(`!!document.querySelector("#plCam.mirror")`, 5000);
      await setDets(page, [L]);
      const w = await page.waitFor(`(() => { const e = document.getElementById("plWrong"); return !e.hidden && e.textContent; })()`, 5000);
      assert(w === "ตอนนี้เห็นมือซ้าย — เลือกมือขวาไว้", "wrong-hand text: " + w);
      const g = await guide(page);
      // right hand in a selfie preview: the user sees the thumb on the screen's left; the canvas is CSS-mirrored with the video
      assert(g.side === "right" && g.mirrored === true && g.thumbOnScreen === "left", "guide " + JSON.stringify(g));
      assert(await page.evaluate(() => getComputedStyle(document.getElementById("plOverlay")).transform !== "none"), "overlay mirrored with the video");
      // snap the wrong hand anyway -> editor warns, swap to the detected side
      await click(page, "#plSnap");
      await page.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
      const warn = await page.evaluate(() => { const e = document.querySelector("#plReadSide .warn"); return e && e.textContent; });
      assert(warn && warn.includes("ดูเหมือนมือซ้าย") && warn.includes("เลือกอ่านมือขวา"), "editor warning: " + warn);
      assert(await page.evaluate(() => document.getElementById("plSideSwap").textContent === "สลับเป็นมือซ้าย"), "swap label");
      await click(page, "#plSideSwap");
      const st = await page.evaluate(() => ({ side: window.__palm.S.side, warn: !!document.querySelector("#plReadSide .warn") }));
      assert(st.side === "left" && !st.warn, "after swap " + JSON.stringify(st));
      await click(page, "#plRead");
      await page.waitFor(`!document.getElementById("plResult").hidden && document.getElementById("plSideBadge").textContent.includes("อ่านจากมือซ้าย")`, 15000);
      // ถ่ายใหม่ with the right hand -> no warning, reads มือขวา
      await click(page, "#plBack");
      await setDets(page, [R]);
      await page.waitFor(`document.getElementById("plWrong").hidden && window.__palm.guide && window.__palm.guide.seen === "right"`, 5000);
      await snapAndRead(page);
      const b = await page.evaluate(() => ({ badge: document.getElementById("plSideBadge").textContent, warn: !!document.querySelector("#plReadSide .warn") }));
      assert(b.badge.includes("อ่านจากมือขวา") && !b.warn, JSON.stringify(b));
      const errs = realErrors(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("palm auto mode: outline snaps to the detected side; result shows the detected hand", async () => {
      const page = await open(browser, base, fakeCams);
      await click(page, '[data-side="auto"]');
      await startCam(page);
      await setDets(page, [R]);
      await page.waitFor(`window.__palm.S.liveSide === "right" && window.__palm.guide.side === "right" && document.getElementById("plGuideSide").textContent === "กรอบมือขวา (ตรวจพบ)"`, 6000);
      assert(await page.evaluate(() => document.getElementById("plWrong").hidden), "no wrong-hand warning in auto mode");
      assert(await page.evaluate(() => document.getElementById("plSideNote").textContent.includes("ตอนนี้เห็น มือขวา")), "side note shows the detected hand");
      await setDets(page, [L]);
      await page.waitFor(`window.__palm.S.liveSide === "left" && window.__palm.guide.side === "left"`, 6000);
      await snapAndRead(page);
      const r = await page.evaluate(() => ({ side: window.__palm.S.side, src: window.__palm.S.sideSrc, badge: document.getElementById("plSideBadge").textContent }));
      assert(r.side === "left" && r.src === "detect" && r.badge.includes("อ่านจากมือซ้าย") && r.badge.includes("ตรวจจากภาพ"), JSON.stringify(r));
      const errs = realErrors(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("palm both-hands mode: hand 1 (inborn) then hand 2 (made) -> comparison table + comparison section in the reading", async () => {
      const page = await open(browser, base, fakeCams);
      await click(page, '[data-dom="right"]');
      await click(page, '[data-side="both"]');
      const note = await page.evaluate(() => document.getElementById("plSideNote").textContent);
      assert(note.includes("มือที่ 1: มือซ้าย") && note.includes("ศักยภาพที่ติดตัว") && note.includes("สิ่งที่สร้างขึ้นเอง"), "note " + note);
      await startCam(page);
      await setDets(page, [L]);
      await page.waitFor(`window.__palm.guide && window.__palm.guide.side === "left" && !window.__palm.guide.wrong`, 5000);
      await snapAndRead(page);
      const p1 = await page.evaluate(() => ({ next: !document.getElementById("plPairNext").hidden, btn: document.getElementById("plNextHand").textContent, cmp: document.getElementById("plCompare").hidden }));
      assert(p1.next && p1.btn.includes("มือขวา") && p1.cmp, JSON.stringify(p1));
      await click(page, "#plNextHand");
      await page.waitFor(`document.getElementById("plResult").hidden && document.getElementById("plEdit").hidden && window.__palm.S.pairStep === 1`, 5000);
      // still the left hand in view -> warning for hand 2
      await page.waitFor(`(() => { const e = document.getElementById("plWrong"); return !e.hidden && e.textContent === "ตอนนี้เห็นมือซ้าย — รอบนี้อ่านมือขวาไว้"; })()`, 5000);
      await setDets(page, [R]);
      await page.waitFor(`window.__palm.guide.side === "right" && document.getElementById("plWrong").hidden`, 5000);
      await snapAndRead(page);
      const r = await page.evaluate(() => ({
        cmp: !document.getElementById("plCompare").hidden, rows: document.querySelectorAll("#plCmpRows tr").length,
        a: document.getElementById("plCmpA").textContent, b: document.getElementById("plCmpB").textContent,
        sec: [...document.querySelectorAll("#plNarr .fa-section h3")].map(h => h.textContent),
        badge: document.getElementById("plSideBadge").textContent, ids: window.__palm.S.facts.items.map(i => i.id), next: document.getElementById("plPairNext").hidden
      }));
      assert(r.cmp && r.rows >= 6 && r.a.includes("มือซ้าย") && r.a.includes("ศักยภาพที่ติดตัว") && r.b.includes("มือขวา") && r.b.includes("สิ่งที่สร้างขึ้นเอง"), JSON.stringify(r));
      assert(r.sec[1] && r.sec[1].includes("เทียบสองมือ"), "comparison section after the overview: " + r.sec.join(" | "));
      assert(r.badge.includes("อ่านจากมือขวา") && r.badge.includes("มือที่ 2/2") && r.next, JSON.stringify(r));
      assert(r.ids.some(i => /^compare\.(same|shift)$/.test(i)) && r.ids.includes("side.dominant"), r.ids.join(","));
      // regenerate keeps the comparison section
      await click(page, "#plRegen");
      await page.waitFor(`[...document.querySelectorAll("#plNarr .fa-section h3")].some(h => h.textContent.includes("เทียบสองมือ")) && !document.getElementById("plRegen").disabled`, 8000);
      await privacy(page);
      await noOverflow(page, 390); await noOverflow(page, 1280);
      // อ่านคนถัดไป clears the pair
      await click(page, "#plAgain");
      const z = await page.evaluate(() => ({ step: window.__palm.S.pairStep, pair: window.__palm.S.pair.length, cmp: document.getElementById("plCompare").hidden }));
      assert(z.step === 0 && z.pair === 0 && z.cmp, JSON.stringify(z));
      const errs = realErrors(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });
  } finally { await browser.close(); }
}
