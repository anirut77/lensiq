// tests/e2e/tryon-pose.e2e.mjs — pose-anchored garments on tryon.html (owner decision 2026-11-18: "Photo or camera on the
// device, garment placed and scaled on the body from pose landmarks, front view first ... a preview of placement and colour,
// not a realistic fitting. Nothing leaves the device."). FIXED TEST: hash-locked (evals-locks/tryon-pose.sha256,
// ~/LENSIQ-field/evals/tryon-pose/) BEFORE the pose code, the photo input and the model were added. Pure half:
// tests/unit/tryon-pose.test.js. Synthetic only: fake camera (a solid colour and a white box), a photo drawn in the page
// (solid colour, no person) and pose landmarks from the test seam ?fakepose=1 (window.__LQ_FAKE_POSE() -> [33 points] per
// person), because MediaPipe needs a GL context that headless Chrome may not have.
//   E1 lazy model: no request for the pose model before a pose item is picked (camera on, glasses worn); picking the demo
//      top fetches vendor/models/pose-landmarker/pose_landmarker_lite.task
//   E2 camera: the demo top is placed from the pose: shoulder tips outside the shoulder joints, hem near the hip line, the
//      garment colour drawn on the torso; trousers reach the ankles; two people -> nothing placed
//   E3 photo: consent first (no enabled file input before the tick; after it exactly one, image only, no capture attribute);
//      a picked photo shows the garment; the snapshot carries the preview mark
//   E4 nothing leaves the device (request hooks as in the print P5 re-lock): no non-GET request, no beacon / WebSocket / form,
//      no request body of 1 KB or more, no URL or body holding "data:image", a blob: URL or a piece of the photo's own data;
//      every network request is a same-origin GET of a file shipped in this repo; nothing with image data is stored
//   E5 the disclaimer "a preview of placement and colour, not a realistic fitting" is visible in the result card in TH / EN / ZH
//   E6 no horizontal overflow at 360 / 375 / 390 / 414 / 430 px in TH / EN / ZH (page and every element of the main column)
import { assert } from "./cdp.mjs";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const REPO = fileURLToPath(new URL("../../", import.meta.url));
const MODEL = "vendor/models/pose-landmarker/pose_landmarker_lite.task";
const FAKE_LM = `window.__LQ_FAKE_LM = () => {
  const base = { 33: [-45, 0], 133: [-15, 0], 362: [15, 0], 263: [45, 0], 168: [0, -2], 10: [0, -95], 152: [0, 110], 234: [-75, 15], 454: [75, 15], 127: [-72, -5], 356: [72, -5], 1: [0, 35] };
  const pts = []; for (let i = 0; i < 478; i++) { const [x, y] = base[i] || [0, 10]; pts.push({ x: (320 + x * .25) / 640, y: (75 + y * .25) / 480, z: 0 }); }
  return pts;
};`;
// one synthetic front-view person in a 640 x 480 frame: shoulder joints 285 / 355 at y 120, hips 295 / 345 at y 200,
// knees at y 290, ankles at y 380 (person's left = image right). Normalised, so the same points fit a photo of any size.
const POSE = `(() => {
  const P = { 0: [320, 80], 1: [326, 72], 2: [330, 72], 3: [334, 72], 4: [314, 72], 5: [310, 72], 6: [306, 72], 7: [337, 76], 8: [303, 76], 9: [325, 90], 10: [315, 90],
    11: [355, 120], 12: [285, 120], 13: [366, 165], 14: [274, 165], 15: [368, 205], 16: [272, 205], 17: [369, 212], 18: [271, 212], 19: [368, 214], 20: [272, 214],
    21: [365, 210], 22: [275, 210], 23: [345, 200], 24: [295, 200], 25: [342, 290], 26: [298, 290], 27: [340, 380], 28: [300, 380], 29: [340, 385], 30: [300, 385],
    31: [343, 395], 32: [297, 395] };
  const one = (dx = 0) => Array.from({ length: 33 }, (_, i) => ({ x: (P[i][0] + dx) / 640, y: P[i][1] / 480, z: 0, visibility: .97 }));
  window.__poseN = 1;
  window.__LQ_FAKE_POSE = () => (window.__poseN === 2 ? [one(-150), one(150)] : window.__poseN === 0 ? [] : [one()]);
})();`;
// P5 pattern: every way data can leave besides plain CDP request events
const NET_HOOK = `(() => {
  const L = window.__lqNet = [], S = window.__lqStore = [];
  const body = b => {
    if (b == null) return { type: "none", size: 0, text: "" };
    if (typeof b === "string") return { type: "string", size: b.length, text: b.slice(0, 200000) };
    if (b instanceof URLSearchParams) { const t = b.toString(); return { type: "params", size: t.length, text: t.slice(0, 200000) }; }
    if (typeof FormData !== "undefined" && b instanceof FormData) { let size = 0, text = "", file = false;
      for (const [, v] of b.entries()) { if (typeof v === "string") { size += v.length; text += v.slice(0, 200000); } else { file = true; size += v.size; } }
      return { type: file ? "formdata-file" : "formdata", size, text }; }
    if (typeof Blob !== "undefined" && b instanceof Blob) return { type: "blob", size: b.size, text: "" };
    if (b instanceof ArrayBuffer) return { type: "arraybuffer", size: b.byteLength, text: "" };
    if (ArrayBuffer.isView(b)) return { type: "view", size: b.byteLength, text: "" };
    return { type: typeof b, size: 0, text: String(b).slice(0, 2000) };
  };
  const rec = (kind, url, b, method) => {
    try { L.push(Object.assign({ kind, url: String(url), method: method || "GET" }, body(b))); }
    catch (e) { L.push({ kind, url: String(url), type: "error", size: 0, text: "" }); }
  };
  const abs = u => { try { return new URL(u, location.href).href; } catch (e) { return String(u); } };
  if (navigator.sendBeacon) { const sb = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function (u, d) { rec("beacon", abs(u), d, "POST"); return sb(u, d); }; }
  const WS = window.WebSocket;
  if (WS) { window.WebSocket = function (u, p) { const w = p === undefined ? new WS(u) : new WS(u, p); rec("ws", abs(u), null); return w; };
    window.WebSocket.prototype = WS.prototype; Object.setPrototypeOf(window.WebSocket, WS);
    const send = WS.prototype.send; WS.prototype.send = function (d) { rec("ws-send", this.url, d, "SEND"); return send.call(this, d); }; }
  const F = window.fetch;
  if (F) window.fetch = function (i, o) {
    const u = i && i.url ? i.url : i; rec("fetch", abs(u), o && o.body, (o && o.method) || (i && i.method) || "GET"); return F.apply(this, arguments);
  };
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__lqUrl = abs(u); this.__lqM = m; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (d) { rec("xhr", this.__lqUrl, d, this.__lqM); return XS.apply(this, arguments); };
  const fd = f => { try { return new FormData(f); } catch (e) { return null; } };
  window.addEventListener("submit", e => rec("form", abs(e.target.action || location.href), fd(e.target), "POST"), true);
  const FS = HTMLFormElement.prototype.submit; HTMLFormElement.prototype.submit = function () { rec("form", abs(this.action || location.href), fd(this), "POST"); return FS.apply(this, arguments); };
  const wrap = (st, name) => {
    try {
      const set = st.setItem.bind(st);
      st.setItem = (k, v) => { S.push({ where: name, k: String(k), n: String(v).length, img: /data:image|blob:/i.test(String(v)) }); return set(k, v); };
    } catch (e) {}
  };
  wrap(window.localStorage, "local"); wrap(window.sessionStorage, "session");
  try { const o = indexedDB.open.bind(indexedDB); indexedDB.open = (...a) => { S.push({ where: "idb", k: String(a[0]), n: 0, img: false }); return o(...a); }; } catch (e) {}
})();`;
// a synthetic "photo": 480 x 640 grey with a white box (no person), put into the page's file input like a user pick
const PICK_PHOTO = `(async () => {
  const c = document.createElement("canvas"); c.width = 480; c.height = 640; const x = c.getContext("2d");
  x.fillStyle = "#6b7280"; x.fillRect(0, 0, 480, 640); x.fillStyle = "#fff"; x.fillRect(150, 120, 180, 260);
  for (let i = 0; i < 400; i++) { x.fillStyle = "rgb(" + (i * 37 % 255) + "," + (i * 91 % 255) + "," + (i * 53 % 255) + ")"; x.fillRect((i * 29) % 470, (i * 47) % 630, 6, 6); }
  const url = c.toDataURL("image/png"), b64 = url.split(",")[1];
  window.__photoPiece = b64.slice(Math.floor(b64.length / 2), Math.floor(b64.length / 2) + 64);
  const blob = await new Promise(r => c.toBlob(r, "image/png")), f = new File([blob], "synthetic.png", { type: "image/png" });
  const inp = [...document.querySelectorAll("input[type=file]")].find(i => !i.disabled);
  if (!inp) return "no enabled file input";
  const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true }));
  return "ok";
})()`;
const consent = p => p.evaluate(() => { const c = document.getElementById("toConsent"); c.checked = true; c.dispatchEvent(new Event("change")); });
const wear = (p, cat) => p.evaluate(c => { const b = document.querySelector('#toItems [data-item][data-cat="' + c + '"]'); if (!b) return false; b.click(); return true; }, cat);
/** average colour of a 9 x 9 patch of the result canvas */
const px = (p, x, y) => p.evaluate((X, Y) => { const c = document.getElementById("toCanvas"), d = c.getContext("2d").getImageData(X - 4, Y - 4, 9, 9).data; let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } const n = d.length / 4; return [r / n, g / n, b / n]; }, x, y);
const blueish = c => c[2] > 150 && c[2] > c[0] + 60; // the demo top is #2563eb on a red (camera) or grey (photo) background
const NOTE = { th: [/ภาพตัวอย่างตำแหน่งและสี/, /ไม่ใช่การลองสวมที่สมจริง/], en: [/a preview of placement and colour, not a realistic fitting/i], zh: [/位置和颜色的预览/, /不是真实的试穿/] };

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const cams = "window.__LQ_FAKE_CAMS = { n: 1, mode: 'ok' };";
  try {
    await check("tryon-pose E1: the pose model is fetched only after a pose item is picked", async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams, cams, FAKE_LM] });
      await page.goto(`${base}/tryon.html?demo=1&fakelm=1`);
      await consent(page);
      await page.evaluate(() => document.getElementById("toStart").click());
      await page.waitFor("window.__tryon && window.__tryon.state.camera && window.__tryon.state.frames > 3", 15000);
      assert(await wear(page, "glasses"), "glasses item");
      await sleep(1500);
      const early = page.requests.filter(r => /pose_landmarker/.test(r.url));
      assert(!early.length, "pose model fetched before a pose item was picked: " + early.map(r => r.url));
      assert(await wear(page, "tops"), "demo top item");
      const end = Date.now() + 15000;
      while (Date.now() < end && !page.requests.some(r => r.url.endsWith(MODEL))) await sleep(100);
      assert(page.requests.some(r => r.url.endsWith(MODEL)), "pose model requested after the top was picked: " + page.requests.map(r => r.url).filter(u => /vendor/.test(u)).join(", "));
      await page.close();
    });

    let page;
    await check("tryon-pose E2: camera: the top follows the pose (shoulders, hip line, colour on the torso); trousers reach the ankles; two people -> nothing", async () => {
      page = await browser.newPage(null, { initScripts: [fakeCams, cams, FAKE_LM, POSE, NET_HOOK] });
      await page.goto(`${base}/tryon.html?demo=1&fakelm=1&fakepose=1`);
      await consent(page);
      await page.evaluate(() => document.getElementById("toStart").click());
      await page.waitFor("window.__tryon && window.__tryon.state.camera && window.__tryon.state.frames > 3", 15000);
      assert(await wear(page, "tops"), "demo top");
      await page.waitFor("window.__tryon.state.placed && window.__tryon.state.placed.cat === 'tops' && window.__tryon.state.placed.targets", 8000);
      const t = await page.evaluate(() => window.__tryon.state.placed.targets);
      assert(t.l.x < 285 && t.l.x > 285 - 30 && Math.abs(t.l.y - 120) < 15, "left shoulder tip outside the joint " + JSON.stringify(t.l));
      assert(t.r.x > 355 && t.r.x < 355 + 30 && Math.abs(t.r.y - 120) < 15, "right shoulder tip outside the joint " + JSON.stringify(t.r));
      assert(Math.abs((t.hl.y + t.hr.y) / 2 - 200) < 12 && t.hl.x < 295 && t.hr.x > 345, "hem on the hip line, outside the hip joints " + JSON.stringify([t.hl, t.hr]));
      await page.waitFor(`(() => { const d = document.getElementById("toCanvas").getContext("2d").getImageData(316, 156, 9, 9).data; return d[2] > 150 && d[2] > d[0] + 60; })()`, 8000);
      assert(blueish(await px(page, 320, 160)), "garment colour on the torso");
      assert(!blueish(await px(page, 60, 300)), "no garment colour far from the body");
      assert(await wear(page, "trousers"), "demo trousers");
      await page.waitFor("window.__tryon.state.placed && window.__tryon.state.placed.cat === 'trousers' && window.__tryon.state.placed.targets", 8000);
      const q = await page.evaluate(() => window.__tryon.state.placed.targets);
      assert(Math.abs(q.hlo.y - 380) < 15 && Math.abs(q.hro.y - 380) < 15 && q.hlo.x < 300 && q.hro.x > 340, "trousers reach the ankles " + JSON.stringify(q));
      await page.evaluate(() => { window.__poseN = 2; });
      await page.waitFor("window.__tryon.state.pose && window.__tryon.state.pose.n === 2 && !window.__tryon.state.placed", 8000);
      await sleep(500);
      assert(!blueish(await px(page, 320, 160)), "two people: no garment drawn");
      await page.evaluate(() => { window.__poseN = 1; });
    });

    await check("tryon-pose E3: photo after consent only; image-only input; the garment is placed on the photo; snapshot carries the mark", async () => {
      const p2 = await browser.newPage(null, { initScripts: [fakeCams, cams, FAKE_LM, POSE, NET_HOOK] });
      await p2.goto(`${base}/tryon.html?demo=1&fakelm=1&fakepose=1`);
      const before = await p2.evaluate(() => [...document.querySelectorAll("input[type=file]")].filter(i => !i.disabled).length);
      assert(before === 0, "an enabled file input before consent: " + before);
      assert((await p2.evaluate(PICK_PHOTO)) === "no enabled file input", "a photo cannot be picked before consent");
      await consent(p2);
      const ins = await p2.evaluate(() => [...document.querySelectorAll("input[type=file]")].filter(i => !i.disabled)
        .map(i => ({ accept: i.accept, capture: i.hasAttribute("capture"), multiple: i.multiple })));
      assert(ins.length === 1 && ins[0].accept === "image/*" && !ins[0].capture && !ins[0].multiple, "one image-only file input after consent " + JSON.stringify(ins));
      assert(await wear(p2, "tops"), "demo top");
      p2.mark = p2.requests.length; p2.markHook = await p2.evaluate(() => window.__lqNet.length);
      assert((await p2.evaluate(PICK_PHOTO)) === "ok", "photo picked");
      await p2.waitFor("window.__tryon.state.mode === 'photo' && window.__tryon.state.placed && window.__tryon.state.placed.cat === 'tops' && window.__tryon.state.placed.targets", 15000);
      const cw = await p2.evaluate(() => [document.getElementById("toCanvas").width, document.getElementById("toCanvas").height]);
      assert(cw[0] === 480 && cw[1] === 640, "canvas takes the photo size " + cw);
      const X = Math.round(320 / 640 * 480), Y = Math.round(160 / 480 * 640);
      await p2.waitFor(`(() => { const d = document.getElementById("toCanvas").getContext("2d").getImageData(${X - 4}, ${Y - 4}, 9, 9).data; return d[2] > 150 && d[2] > d[0] + 60; })()`, 8000);
      const snap = await p2.evaluate(() => window.__tryon.snapshot());
      assert(snap && snap.mark === "ภาพจำลอง · Virtual try-on preview · 虚拟试穿预览" && snap.w === 480, "snapshot mark " + JSON.stringify(snap));
      page.p2 = p2;
    });

    await check("tryon-pose E4: nothing leaves the device (no upload, no image in any request, only same-origin static GETs); nothing stored", async () => {
      for (const p of [page, page.p2]) {
        const hooks = await p.evaluate(() => window.__lqNet), store = await p.evaluate(() => window.__lqStore), piece = await p.evaluate(() => window.__photoPiece || "");
        const net = p.requests.filter(r => /^(https?|wss?):/i.test(r.url));
        assert(!net.some(r => r.method !== "GET"), "non-GET request: " + net.filter(r => r.method !== "GET").map(r => r.method + " " + r.url));
        const odd = hooks.filter(h => h.method !== "GET" || /beacon|ws|form/.test(h.kind));
        assert(!odd.length, "beacon / socket / form / non-GET: " + JSON.stringify(odd.slice(0, 3)));
        assert(!hooks.some(h => h.size >= 1024 || /formdata-file|blob|arraybuffer|view/.test(h.type)), "a request body: " + JSON.stringify(hooks.filter(h => h.size >= 1024).slice(0, 3)));
        const carries = s => /data:image/i.test(s) || /blob:/i.test(s) || (piece && s.includes(piece));
        assert(!net.some(r => carries(r.url) || carries(r.postData || "")), "a request carries image data");
        assert(!hooks.some(h => /^(https?|wss?):/i.test(h.url) && (carries(h.url) || carries(h.text))), "a hooked request carries image data");
        const origin = new URL(base).origin;
        const foreign = net.filter(r => new URL(r.url).origin !== origin);
        assert(!foreign.length, "requests to another origin: " + foreign.map(r => r.url).join(", "));
        const missing = net.map(r => decodeURIComponent(new URL(r.url).pathname).replace(/^\//, "")).filter(f => f && !existsSync(REPO + f));
        assert(!missing.length, "requests for files that are not shipped static files: " + missing.join(", "));
        assert(!store.some(s => s.img || /tryon|frame|snap|photo|pose/i.test(s.k)), "stored: " + JSON.stringify(store));
      }
      const after = page.p2.requests.slice(page.p2.mark).filter(r => /^(https?|wss?):/i.test(r.url));
      assert(after.every(r => r.method === "GET"), "after the photo pick: only GETs");
      await page.p2.close();
    });

    await check("tryon-pose E5: disclaimer visible in the result card in TH / EN / ZH", async () => {
      for (const lang of ["th", "en", "zh"]) {
        await page.goto(`${base}/tryon.html?demo=1&fakelm=1&fakepose=1&lang=${lang}`);
        await sleep(300);
        const r = await page.evaluate(() => { const n = document.querySelector('[data-i18n="to.pose.note"]'), cv = document.getElementById("toCanvas");
          if (!n) return null;
          const shown = !!(n.offsetWidth || n.offsetHeight) && getComputedStyle(n).visibility !== "hidden";
          return { text: n.textContent, shown, same: n.closest("section") === cv.closest("section") }; });
        assert(r && r.shown && r.same, lang + ": note shown in the result card " + JSON.stringify(r));
        for (const re of NOTE[lang]) assert(re.test(r.text), `${lang}: ${re} in "${r.text}"`);
      }
    });

    await check("tryon-pose E6: no horizontal overflow at 360-430 px in TH / EN / ZH", async () => {
      const bad = [];
      for (const lang of ["th", "en", "zh"]) for (const w of [360, 375, 390, 414, 430]) {
        await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 844, deviceScaleFactor: 1, mobile: true });
        await page.goto(`${base}/tryon.html?demo=1&fakelm=1&fakepose=1&lang=${lang}`);
        await sleep(350);
        await consent(page);
        await sleep(150);
        const o = await page.evaluate(() => {
          const cw = document.documentElement.clientWidth, out = [];
          for (const e of document.querySelectorAll("#main *")) {
            const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
            if (r.width <= 1 || cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed") continue;
            if (r.right > cw + 1 || r.left < -1) out.push((e.id || e.className || e.tagName) + " " + Math.round(r.left) + ".." + Math.round(r.right));
          }
          return { sw: document.documentElement.scrollWidth, cw, out: out.slice(0, 5) };
        });
        if (o.sw > o.cw + 1 || o.out.length) bad.push(`${lang} ${w}: ${JSON.stringify(o)}`);
      }
      await page.send("Emulation.clearDeviceMetricsOverride");
      assert(!bad.length, "overflow: " + bad.join(" | "));
      const errs = page.consoleErrors.filter(e => !/404/.test(e.text || ""));
      assert(!errs.length, "console errors " + JSON.stringify(errs.slice(0, 3)));
    });
  } finally { await browser.close(); }
}
