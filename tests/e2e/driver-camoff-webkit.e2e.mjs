// tests/e2e/driver-camoff-webkit.e2e.mjs — webkit-flake-fix 2026-11-16 (privacy rule: a camera-off control is always available).
// FIXED TEST: written and locked (~/LENSIQ-field/evals/webkit-flake-fix/, sha256 in evals-locks/webkit-flake-fix.sha256)
// BEFORE the fix. Real WebKit, iPhone 13 profile (touch, mobile UA), fake camera (tests/e2e/fake-cams.js) and ?fakedet
// scripted face; nothing real is filmed.
//   DC-1  during a trip at 390 px (TH / EN / ZH): a camera-off control in the page language can be reached and tapped:
//         visible, at least 44 px tall, inside the screen width, not covered (the element at its centre is the control
//         itself) once it is scrolled into view; a real tap ends the trip and stops every camera track
//   DC-2  during a trip in driving mode (TH): portrait 390 × 664 and landscape 844 × 390: the same, and the control is on
//         the screen without scrolling the page
// PASS RULE: the trip starts on the fake camera, the control passes every check above, the tap leaves no live track and
// ends the trip, no page error, no crash, no reload (phone-kit passRule).
import { assert } from "./cdp.mjs";
import { openFlow, launchWebKit, passRule, waitFor, sleep } from "./phone-kit.mjs";

// a visible camera-off control in each language ("เปิดกล้อง" = camera ON contains "ปิดกล้อง", so it is excluded)
const OFF = { th: "(^|[^เ])ปิดกล้อง", en: "camera off|turn off (the )?camera|stop (the )?camera|close (the )?camera", zh: "关闭摄像头|关闭相机" };
const DRIVER = { x: 0.30, y: 0.25, w: 0.30, h: 0.42, score: 0.95, ear: 0.30, mar: 0.10 };
const DETS = `window.__LQ_FAKE_DET = key => key === "driver" ? [${JSON.stringify(DRIVER)}] : null;`;

/** finds the camera-off control and measures it where it is (no scrolling) */
const measure = (page, re) => page.evaluate(re => {
  const rx = new RegExp(re, "i");
  const vis = e => e.getClientRects().length > 0 && !e.closest("[hidden]") && getComputedStyle(e).visibility !== "hidden" && !e.disabled;
  const all = [...document.querySelectorAll("button, [role=button]")];
  const b = all.find(e => vis(e) && rx.test((e.textContent || "").trim() || e.getAttribute("aria-label") || ""));
  if (!b) return { found: false, buttons: all.filter(vis).map(e => (e.textContent || "").trim()).slice(0, 30) };
  document.querySelectorAll("[data-dc-off]").forEach(e => e.removeAttribute("data-dc-off"));
  b.setAttribute("data-dc-off", "1");
  const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hit = cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight ? document.elementFromPoint(cx, cy) : null;
  return { found: true, text: (b.textContent || "").trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left),
    right: Math.round(r.right), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, pe: getComputedStyle(b).pointerEvents,
    onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
    hitSelf: !!hit && (hit === b || b.contains(hit)), hitWhat: hit ? hit.tagName + "#" + hit.id + "." + hit.className : null };
}, re);

async function startTrip(page) {
  await waitFor(page, () => document.querySelector("#engine") && document.querySelector("#engine").dataset.state === "ready", null, 20000);
  await waitFor(page, () => window.__LQ_FAKE && window.__LQ_FAKE.live().length > 0, null, 15000);
  await page.evaluate(() => { const f = document.querySelector("#tripForm"); f.driver.value = "ทดสอบ"; f.plate.value = "1กข 1234"; f.requestSubmit(); });
  await waitFor(page, () => document.body.classList.contains("on-trip"), null, 10000);
  await waitFor(page, () => window.__LQ_DR && window.__LQ_DR.phase === "trip", null, 15000);
}

/** the control is reachable (after scrolling it into view unless onScreenNow) and a real tap stops the camera and the trip */
async function reachAndTap(page, lang, label, { onScreenNow = false } = {}) {
  let m = await measure(page, OFF[lang]);
  assert(m.found, `${label}: no visible camera-off control in ${lang}; buttons: ${JSON.stringify(m.buttons)}`);
  if (onScreenNow) assert(m.onScreen, `${label}: the camera-off control is off the screen in driving mode: ${JSON.stringify(m)}`);
  else {
    await page.locator("[data-dc-off]").scrollIntoViewIfNeeded({ timeout: 5000 });
    await sleep(300);
    m = await measure(page, OFF[lang]);
  }
  assert(m.onScreen, `${label}: the camera-off control is not on the screen: ${JSON.stringify(m)}`);
  assert(m.h >= 44, `${label}: the camera-off control is ${m.h} px tall (< 44): ${JSON.stringify(m)}`);
  assert(m.pe !== "none", `${label}: the camera-off control does not take taps (pointer-events: none): ${JSON.stringify(m)}`);
  assert(m.hitSelf, `${label}: the camera-off control is covered by ${m.hitWhat}: ${JSON.stringify(m)}`);
  await page.tap("[data-dc-off]", { timeout: 5000 });
  await waitFor(page, () => window.__LQ_FAKE.live().length === 0, null, 5000).catch(() => {});
  await sleep(500);
  const after = await page.evaluate(() => ({ live: window.__LQ_FAKE.live().length, onTrip: document.body.classList.contains("on-trip"), phase: window.__LQ_DR && window.__LQ_DR.phase }));
  assert(after.live === 0, `${label}: ${after.live} camera track(s) still live after tapping "${m.text}"`);
  assert(!after.onTrip, `${label}: the trip is still running after the camera was switched off: ${JSON.stringify(after)}`);
}

export default async function ({ base, check, fakeCams }) {
  const browser = await launchWebKit();
  try {
    for (const lang of ["th", "en", "zh"]) {
      await check(`DC-1 [${lang}] WebKit iPhone 390: during a trip the camera-off control can be reached and tapped`, async () => {
        const f = await openFlow(browser, `${base}/driver.html?cpu&fakedet&nosw`, { lang, cams: fakeCams, init: [DETS] });
        try {
          const vw = await f.page.evaluate(() => innerWidth);
          assert(vw === 390, `viewport is ${vw} px, not 390`);
          await startTrip(f.page);
          await reachAndTap(f.page, lang, `DC-1 [${lang}]`);
          await passRule(f.page, f.st, `DC-1 [${lang}]`);
        } finally { await f.ctx.close(); }
      });
    }
    for (const vp of [{ width: 390, height: 664, name: "portrait 390 × 664" }, { width: 844, height: 390, name: "landscape 844 × 390" }]) {
      await check(`DC-2 [th] WebKit iPhone, driving mode ${vp.name}: the camera-off control is on the screen and can be tapped`, async () => {
        const f = await openFlow(browser, `${base}/driver.html?cpu&fakedet&nosw`, { lang: "th", cams: fakeCams, init: [DETS] });
        try {
          await f.page.setViewportSize({ width: vp.width, height: vp.height });
          await startTrip(f.page);
          await f.page.evaluate(() => /** @type {HTMLElement} */ (document.getElementById("driveMode")).click());
          await waitFor(f.page, () => document.body.classList.contains("driving"), null, 5000);
          await sleep(600);
          await reachAndTap(f.page, "th", `DC-2 ${vp.name}`, { onScreenNow: true });
          await passRule(f.page, f.st, `DC-2 ${vp.name}`);
        } finally { await f.ctx.close(); }
      });
    }
  } finally { await browser.close(); }
}
