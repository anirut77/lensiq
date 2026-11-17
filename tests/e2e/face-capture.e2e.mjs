// tests/e2e/face-capture.e2e.mjs — FACE CAPTURE REDESIGN on faceread.html (owner order 2026-11-16, item A; testers had to
// stretch the arm fully). FIXED TEST, locked in ~/LENSIQ-field/evals/face-capture/ before the page was built.
// Headless Chrome with an Android phone profile, faceread.html?cpu&fakedet, one fake phone (front + back camera) whose
// picture is a SYNTHETIC face (tests/fixtures/face-capture/face-model.js + tests/e2e/face-capture-cam.js; flat shapes, no
// photo, no person); the fake detector returns that face's 68 points.
//   A self mode at 393 px: grey oval while the face is too far, green at 35 cm, 3-2-1, automatic capture
//   B every guidance message, one at a time (TH), each image-quality check with its own message
//   C the count restarts while the face moves; it never captures while moving
//   D manual capture: enabled with one face whatever the guidance says; not with none or two
//   E rear camera: consent line + tick before the back camera opens; wording for the person holding the phone (TH/EN/ZH);
//     the flip control cannot bypass the consent
//   F privacy: no request leaves except the page's own static files (no POST, no /api/), no image in any storage
//   G layout: 360, 393, 412 and 430 px, no horizontal scroll, controls inside the screen
//   H speed: lensiq-facecap.js is fetched only when the camera starts
import { readFileSync } from "node:fs";
import { assert, privacyScan } from "./cdp.mjs";

const MODEL = readFileSync(new URL("../fixtures/face-capture/face-model.js", import.meta.url), "utf8");
const CAM = readFileSync(new URL("./face-capture-cam.js", import.meta.url), "utf8");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

// storage and network spies, installed before any page script
const SPY = `(() => {
  const log = window.__SPY = { storage: [], idb: 0, caches: 0, beacons: 0, ws: 0, xhr: [], fetch: [] };
  const wrap = (st, name) => { try { const set = st.setItem.bind(st);
    st.setItem = (k, v) => { log.storage.push({ where: name, k: String(k), n: String(v).length, img: /data:image|blob:/i.test(String(v)) }); return set(k, v); }; } catch (e) {} };
  wrap(window.localStorage, "local"); wrap(window.sessionStorage, "session");
  try { const o = indexedDB.open.bind(indexedDB); indexedDB.open = (...a) => { log.idb++; return o(...a); }; } catch (e) {}
  try { if (window.caches) { const o = caches.open.bind(caches); caches.open = (...a) => { log.caches++; return o(...a); }; } } catch (e) {}
  try { const b = navigator.sendBeacon && navigator.sendBeacon.bind(navigator); if (b) navigator.sendBeacon = (...a) => { log.beacons++; return b(...a); }; } catch (e) {}
  try { const W = window.WebSocket; window.WebSocket = function (...a) { log.ws++; return new W(...a); }; } catch (e) {}
  try { const f = window.fetch.bind(window); window.fetch = (u, o) => { log.fetch.push({ u: String(u && u.url || u), m: (o && o.method) || "GET" }); return f(u, o); }; } catch (e) {}
})();`;

const TH = {
  far: "ไกลไป ขยับเข้ามาใกล้อีกนิด", near: "ใกล้ไป ถอยออกหน่อย", out: "ให้อยู่ในกรอบ", cut: "ใบหน้าเกินขอบภาพ ขยับให้ทั้งหน้าอยู่ในวงรี",
  multi: "ให้มีคนเดียวในกรอบ", dark: "มืดไป เพิ่มแสงอีกหน่อย", backlight: "แสงอยู่ด้านหลัง หันหน้าเข้าหาแสง", turn: "หันหน้าตรงเข้ากล้อง",
  tilt: "มองตรง ตั้งศีรษะให้ตรง", chinUp: "เงยคางขึ้นเล็กน้อย", chinDown: "ก้มคางลงเล็กน้อย", glare: "แว่นสะท้อนแสง ขยับมุมแว่นหรือเลี่ยงแสงที่ส่องตรง",
  blur: "ภาพไม่ชัด เช็ดเลนส์กล้องแล้วถือให้นิ่ง", still: "อยู่นิ่ง ๆ สักครู่", ok: "ดีแล้ว อยู่นิ่ง ๆ"
};
const TH_OTHER = { far: "ขยับโทรศัพท์เข้าไปใกล้อีกนิด", turn: "ขอให้เขาหันหน้าตรงเข้ากล้อง", ok: "ดีแล้ว ถือนิ่ง ๆ", near: "ถอยโทรศัพท์ออกเล็กน้อย" };
const EN_OTHER = { far: "Move the phone a little closer to them", turn: "Ask them to face the camera straight on" };
const ZH_OTHER = { far: "请把手机再靠近对方一点", turn: "请对方正对镜头" };
const CONSENT = {
  th: /ถ่ายภาพคนอื่นได้เฉพาะเมื่อเจ้าตัวรู้และยินยอมแล้ว.*ไม่ถูกบันทึกและไม่ถูกส่งออกจากเครื่อง/,
  en: /Only photograph another person if they know and agree.*not saved and does not leave this device/,
  zh: /只有在对方知情并同意时才能为其拍照.*不会被保存.*不会离开本设备/
};

const OK = { profile: "iphone-front-16x9", d: 350 };
const SCENES = [
  ["near", { profile: "iphone-front-16x9", d: 180 }], ["far", { profile: "iphone-front-16x9", d: 900 }], ["out", { ...OK, tx: 0.3 }],
  ["cut", { ...OK, tx: 0.08 }], ["turn", { ...OK, yaw: 20 }], ["tilt", { ...OK, roll: 20 }], ["chinUp", { ...OK, pitch: -28 }],
  ["chinDown", { ...OK, pitch: 28 }], ["dark", { ...OK, dark: true }], ["backlight", { ...OK, backlight: true }], ["glare", { ...OK, glare: true }],
  ["blur", { ...OK, blur: 6 }]
];

async function phone(browser, width, { lang = "th", android = true } = {}) {
  const page = await browser.newPage(null, { initScripts: [SPY, MODEL, CAM, `try { localStorage.setItem("lq-lang", ${JSON.stringify(lang)}); } catch (e) {}`] });
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: 860, deviceScaleFactor: 2.625, mobile: true });
  if (android) await page.send("Emulation.setUserAgentOverride", { userAgent: ANDROID_UA, platform: "Linux armv8l" });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  return page;
}
const setScene = (page, scene, n = 1) => page.evaluate((s, k) => window.__FC.set(s, k), scene, n);
const click = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
const stats = page => page.evaluate(() => { try { return (JSON.parse(localStorage.getItem("fr-stats")) || {}).total || 0; } catch (e) { return 0; } });
async function hint(page, state, text, ms = 8000) {
  await page.waitFor(`(() => { const e = document.getElementById("frHint"); return !!e && !e.hidden && e.dataset.state === ${JSON.stringify(state)}
    && e.querySelector(".lq-chint-tx").textContent === ${JSON.stringify(text)}; })()`, ms);
  return page.evaluate(() => {
    const lines = [...document.querySelectorAll("#frStage .lq-chint")].filter(e => !e.hidden && getComputedStyle(e).display !== "none");
    const cam = document.getElementById("frCam");
    return { lines: lines.length, host: cam.getAttribute("data-chint"), guide: cam.getAttribute("data-guide"), outline: getComputedStyle(cam).outlineColor,
      live: document.getElementById("frHint").getAttribute("aria-live") };
  });
}
const isGreen = css => { const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(css || ""); return !!m && +m[2] > +m[1] + 40 && +m[2] > +m[3] + 40; };
async function startSelf(page) {
  await click(page, "#frStartCam");
  await page.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
}
/** polls the count overlay every 40 ms until a reading is stored; returns the numbers seen, in order */
async function watchCount(page, total0, ms = 9000) {
  const seen = [], end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await page.evaluate(() => { const c = document.getElementById("frCount"); return { t: c.hidden ? "" : c.textContent.trim() }; });
    if (/^[123]$/.test(s.t) && seen[seen.length - 1] !== s.t) seen.push(s.t);
    if (await stats(page) > total0) return { seen, fired: true };
    await sleep(40);
  }
  return { seen, fired: false };
}
async function noLeak(page, label) {
  // the site's own status pings (GET /api/<name>/status, no data sent) are not image traffic; the other e2e tests drop them too
  for (let i = page.requests.length - 1; i >= 0; i--) {
    const r = page.requests[i];
    if (r.method === "GET" && /^\/api\/[a-z]+\/status$/.test(new URL(r.url).pathname)) page.requests.splice(i, 1);
  }
  await privacyScan(page);
  const spy = await page.evaluate(() => window.__SPY);
  const badStore = spy.storage.filter(s => s.img || s.n > 4096);
  assert(!badStore.length, label + ": image-like or large storage write " + JSON.stringify(badStore.slice(0, 3)));
  assert(spy.idb === 0 && spy.caches === 0 && spy.beacons === 0 && spy.ws === 0, label + ": IndexedDB / Cache / beacon / socket used " + JSON.stringify(spy));
  const origin = await page.evaluate(() => location.origin);
  const bad = page.requests.filter(r => { const u = new URL(r.url);
    return u.protocol !== "data:" && u.protocol !== "blob:" && (r.method !== "GET" || u.origin !== origin || /^\/api\//.test(u.pathname)); });
  assert(!bad.length, label + ": requests that leave the page: " + JSON.stringify(bad.slice(0, 3).map(r => [r.method, r.url])));
  const posts = spy.fetch.filter(f => f.m !== "GET");
  assert(!posts.length, label + ": non-GET fetch " + JSON.stringify(posts));
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("A+H self at 393 px: lensiq-facecap.js only on camera start; grey oval when far, green at 35 cm, 3-2-1, automatic capture", async () => {
      const page = await phone(browser, 393);
      await page.goto(`${base}/faceread.html?cpu&fakedet`);
      await page.waitFor(`!!document.getElementById("frStartCam")`, 10000);
      await sleep(800);
      assert(!page.requests.some(r => /lensiq-facecap\.js/.test(r.url)), "lensiq-facecap.js must not load with the page");
      await setScene(page, { profile: "iphone-front-16x9", d: 900 });
      await startSelf(page);
      assert(page.requests.filter(r => /lensiq-facecap\.js\?v=\d+/.test(r.url)).length === 1, "lensiq-facecap.js fetched once on camera start");
      let h = await hint(page, "far", TH.far);
      assert(h.lines === 1 && h.live === "polite", "one polite line: " + JSON.stringify(h));
      assert(h.guide === "grey" && !isGreen(h.outline), "grey oval when far: " + JSON.stringify(h));
      assert(await page.evaluate(() => !document.getElementById("frRead").disabled), "manual capture available while far");
      const t0 = await stats(page);
      await setScene(page, OK);
      h = await hint(page, "ok", TH.ok);
      assert(h.guide === "green" && h.host === "ok" && isGreen(h.outline), "green oval at 35 cm: " + JSON.stringify(h));
      const w = await watchCount(page, t0);
      assert(w.fired, "automatic capture after the count: " + JSON.stringify(w));
      assert(w.seen.join("") === "321", "count 3-2-1 before the capture, got " + JSON.stringify(w.seen));
      await page.waitFor(`!document.getElementById("frResult").hidden`, 8000);
      await noLeak(page, "A");
      await page.close();
    });

    await check("B every guidance message, one at a time (TH), and each image-quality check with its own message", async () => {
      const page = await phone(browser, 393);
      await page.goto(`${base}/faceread.html?cpu&fakedet`);
      await page.waitFor(`!!document.getElementById("frStartCam")`, 10000);
      await setScene(page, SCENES[0][1]);
      await startSelf(page);
      const t0 = await stats(page), seen = new Set();
      for (const [state, scene] of SCENES) {
        await setScene(page, scene);
        const h = await hint(page, state, TH[state]);
        assert(h.lines === 1, state + ": exactly one instruction line, got " + h.lines);
        assert(h.guide === "grey" && !isGreen(h.outline), state + ": oval not green " + JSON.stringify(h));
        assert(await page.evaluate(() => !document.getElementById("frRead").disabled), state + ": manual capture stays available");
        seen.add(await page.evaluate(() => document.querySelector("#frHint .lq-chint-tx").textContent));
      }
      await setScene(page, OK, 2);
      const h = await hint(page, "multi", TH.multi);
      assert(h.lines === 1, "multi: one line");
      assert(await page.evaluate(() => document.getElementById("frRead").disabled), "two faces: no capture (never read a bystander)");
      await setScene(page, OK, 0);
      await hint(page, "out", TH.out);
      assert(await page.evaluate(() => document.getElementById("frRead").disabled), "no face: nothing to capture");
      assert(seen.size === SCENES.length, "a different line for each condition");
      assert(await stats(page) === t0, "nothing was captured while the guide was not green");
      await noLeak(page, "B");
      await page.close();
    });

    await check("C the count restarts while the face moves and never captures; once still it counts 3-2-1 and captures", async () => {
      const page = await phone(browser, 393);
      await page.goto(`${base}/faceread.html?cpu&fakedet`);
      await page.waitFor(`!!document.getElementById("frStartCam")`, 10000);
      await setScene(page, OK); await page.evaluate(() => window.__FC.wobble(true));
      await startSelf(page);
      const t0 = await stats(page), seen = new Set(), states = new Set(), end = Date.now() + 5000;
      while (Date.now() < end) {
        const s = await page.evaluate(() => ({ c: document.getElementById("frCount").hidden ? "" : document.getElementById("frCount").textContent.trim(),
          st: document.getElementById("frHint").dataset.state }));
        if (s.c) seen.add(s.c); states.add(s.st); await sleep(40);
      }
      assert(await stats(page) === t0, "no capture while moving");
      assert(!seen.has("1"), "the count never reaches 1 while moving: " + JSON.stringify([...seen]));
      assert(states.has("still"), "'hold still' shown while moving: " + JSON.stringify([...states]));
      await page.evaluate(() => window.__FC.wobble(false));
      const w = await watchCount(page, t0);
      assert(w.fired && w.seen.join("") === "321", "still again: 3-2-1 and capture " + JSON.stringify(w));
      await page.close();
    });

    await check("D manual capture works while the guide is not green (face too far)", async () => {
      const page = await phone(browser, 393);
      await page.goto(`${base}/faceread.html?cpu&fakedet`);
      await page.waitFor(`!!document.getElementById("frStartCam")`, 10000);
      await setScene(page, { profile: "iphone-front-16x9", d: 800 });
      await startSelf(page);
      await hint(page, "far", TH.far);
      const t0 = await stats(page);
      await click(page, "#frRead");
      await page.waitFor(`!document.getElementById("frResult").hidden`, 10000);
      assert(await stats(page) === t0 + 1, "one reading from the manual button");
      await page.close();
    });

    await check("E rear camera: consent first, wording for the person holding the phone (TH/EN/ZH), flip cannot bypass consent", async () => {
      const page = await phone(browser, 393);
      await page.goto(`${base}/faceread.html?cpu&fakedet`);
      await page.waitFor(`!!document.getElementById("frModeOther")`, 10000);
      await click(page, "#frModeOther");
      const c = await page.evaluate(() => ({ shown: !document.getElementById("frConsent").hidden, line: document.getElementById("frConsentLine").textContent.trim(),
        pressed: document.getElementById("frModeOther").getAttribute("aria-pressed"), start: document.getElementById("frStartCam").disabled }));
      assert(c.shown && CONSENT.th.test(c.line), "consent line TH: " + JSON.stringify(c));
      assert(c.pressed === "true" && c.start, "start disabled until consent: " + JSON.stringify(c));
      await click(page, "#frConsentOk");
      assert(await page.evaluate(() => !document.getElementById("frStartCam").disabled), "start enabled after the tick");
      await setScene(page, { profile: "rear-26-16x9", d: 900 });
      await click(page, "#frStartCam");
      await page.waitFor(`document.querySelector("#frCam.live") && !document.getElementById("frRead").hidden`, 10000);
      const f = await page.evaluate(() => ({ facing: window.__FC.facings.slice(-1)[0], mirror: document.getElementById("frCam").classList.contains("mirror") }));
      assert(f.facing === "environment" && !f.mirror, "back camera, not mirrored: " + JSON.stringify(f));
      await hint(page, "far", TH_OTHER.far);
      await setScene(page, { profile: "rear-26-16x9", d: 350, yaw: 20 });
      await hint(page, "turn", TH_OTHER.turn);
      await page.evaluate(() => LQI18N.setLang("en"));
      await hint(page, "turn", EN_OTHER.turn);
      assert(CONSENT.en.test(await page.evaluate(() => document.getElementById("frConsentLine").textContent)), "consent line EN");
      await setScene(page, { profile: "rear-26-16x9", d: 900 });
      await hint(page, "far", EN_OTHER.far);
      await page.evaluate(() => LQI18N.setLang("zh"));
      await hint(page, "far", ZH_OTHER.far);
      assert(CONSENT.zh.test(await page.evaluate(() => document.getElementById("frConsentLine").textContent)), "consent line ZH");
      await setScene(page, { profile: "rear-26-16x9", d: 350, yaw: 20 });
      await hint(page, "turn", ZH_OTHER.turn);
      await page.evaluate(() => LQI18N.setLang("th"));
      await noLeak(page, "E");
      await page.close();

      // the flip control in self mode: the back camera does not stay open without the consent tick
      const p2 = await phone(browser, 393);
      await p2.goto(`${base}/faceread.html?cpu&fakedet`);
      await p2.waitFor(`!!document.getElementById("frStartCam")`, 10000);
      await setScene(p2, OK);
      await startSelf(p2);
      await p2.waitFor(`!!document.querySelector("#frCam .cam-flip") && !document.querySelector("#frCam .cam-ctl").hidden`, 8000);
      await click(p2, "#frCam .cam-flip");
      await p2.waitFor(`!document.getElementById("frConsent").hidden && document.getElementById("frModeOther").getAttribute("aria-pressed") === "true"`, 8000);
      await sleep(600);
      const st = await p2.evaluate(() => ({ live: !!document.querySelector("#frCam.live"), ok: document.getElementById("frConsentOk").checked }));
      assert(!st.live && !st.ok, "no live back camera without consent: " + JSON.stringify(st));
      await p2.close();
    });

    await check("G layout: 360 / 393 / 412 / 430 px, no horizontal scroll, controls inside the screen (self and rear)", async () => {
      for (const width of [360, 393, 412, 430]) {
        const page = await phone(browser, width);
        await page.goto(`${base}/faceread.html?cpu&fakedet`);
        await page.waitFor(`!!document.getElementById("frStartCam")`, 10000);
        await setScene(page, { profile: "iphone-front-16x9", d: 900 });
        await startSelf(page);
        await hint(page, "far", TH.far);
        await click(page, "#frModeOther");
        await page.waitFor(`!document.getElementById("frConsent").hidden`, 5000);
        const r = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
          const ids = ["frModeSelf", "frModeOther", "frConsent", "frConsentOk", "frStartCam", "frCam"];
          const out = ids.map(id => { const e = document.getElementById(id); const b = e.getBoundingClientRect(); return { id, l: b.left, r: b.right, h: b.height }; });
          return { vw, sw, out };
        });
        assert(r.sw <= r.vw + 1, `${width}px: horizontal scroll ${r.sw} > ${r.vw}`);
        for (const o of r.out) assert(o.l >= -1 && o.r <= r.vw + 1, `${width}px: ${o.id} outside the screen ${JSON.stringify(o)}`);
        for (const o of r.out.filter(x => /^frMode|frStartCam/.test(x.id))) assert(o.h >= 44, `${width}px: ${o.id} touch target ${o.h} px`);
        await page.close();
      }
    });
  } finally { await browser.close(); }
}
