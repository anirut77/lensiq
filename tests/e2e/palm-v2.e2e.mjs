// tests/e2e/palm-v2.e2e.mjs — FIXED TEST SET "palm-layers" (palm reading upgrade v1, owner order 2026-11-19), locked in
// evals-locks/palm-layers.sha256 BEFORE any product code. palm.html with window.LENSIQ_PALM_V2 = true (set before load; the shipped
// default is false and is checked first). A DRAWN SYNTHETIC hand (tests/fixtures/palm-v2/synth-hand.js), never a photo of a person.
//  S   switch off by default: no v2 section, the current page as today.
//  D-a1 screen and D-a2 print: every stroke on a "not found" guide is dashed and faint; D-a3 share card: no guide at all.
//  D-b1 the reading never names a line whose status is "not found" (after the user removes a found line too).
//  D-c1 a traced line never leaves the device: no request (fetch / XHR / beacon / WebSocket / form, CDP network log) carries a
//       unique coordinate or any line geometry; D-c2 storage holds only line geometry ({v, side, school, lines:[{id,status,cp}]},
//       < 8 KB, no data:image / blob: / long base64), no palm IndexedDB, no blob: in Cache Storage.
//  CAM still: ImageCapture.takePhoto when available, otherwise the full track frame (video.videoWidth), never the preview;
//       rear camera; another person's hand: the consent line (TH / EN / ZH) is shown and the camera stays shut until it is ticked;
//       the tick is cleared after the capture.
//  CR  crisis v3: a crisis phrase hides the reading, the share / print card and paid content; the 1323 help stays.
// TH / EN / ZH at 393 px.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SYNTH = readFileSync(join(here, "..", "fixtures", "palm-v2", "synth-hand.js"), "utf8");
const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const NOT_FOUND = { th: "ไม่พบในภาพ", en: "Not found in this photo", zh: "照片中未找到" };
const ADDED = { th: "เพิ่มเอง", en: "Added by you", zh: "自行添加" };
const FOUND = { th: "พบ", en: "Found", zh: "已找到" };
const ABSENT = { th: "มือฉันไม่มีเส้นนี้", en: "My hand doesn't have this line", zh: "我的手没有这条线" };
const CONSENT = { th: "ถ่ายภาพมือของคนอื่นได้เฉพาะเมื่อเจ้าของมือรู้และยินยอมแล้วเท่านั้น ภาพไม่ถูกบันทึกและไม่ถูกส่งออกจากเครื่องนี้",
  en: "Photograph another person's hand only when they know and agree. The photo is not saved and does not leave this device.",
  zh: "仅在对方知情并同意的情况下拍摄其手掌。照片不会被保存，也不会离开本设备。" };
const PHRASE = { th: "อยากตายจริงๆ", en: "I want to die tonight", zh: "我不想活了" };
const TAP_ORDER = ["wrist", "indexBase", "pinkyBase", "indexTip", "middleTip", "ringTip", "pinkyTip"];
const UNIQUE = 0.123457;

const LANG = lang => `try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`;
const ON = "window.LENSIQ_PALM_V2 = true;";
/* records every stroke / text on canvases that carry data-pv2-target, and every outgoing payload made from the page */
const RECORDER = `(() => {
  window.__pv2rec = []; window.__pv2net = [];
  const P = CanvasRenderingContext2D.prototype, cur = new WeakMap();
  const T = c => (c && c.canvas && c.canvas.dataset && c.canvas.dataset.pv2Target) || "";
  const pt = (c, x, y) => { const m = c.getTransform(); return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; };
  const path = c => { let p = cur.get(c); if (!p) { p = [[]]; cur.set(c, p); } return p; };
  const wrap = (n, f) => { const o = P[n]; P[n] = function (...a) { try { if (T(this)) f(this, a); } catch (e) {} return o.apply(this, a); }; };
  wrap("beginPath", c => cur.set(c, [[]]));
  wrap("moveTo", (c, a) => { const p = path(c); p.push([pt(c, a[0], a[1])]); });
  wrap("lineTo", (c, a) => { const p = path(c); p[p.length - 1].push(pt(c, a[0], a[1])); });
  wrap("quadraticCurveTo", (c, a) => { const p = path(c), s = p[p.length - 1], A = s.length ? s[s.length - 1] : pt(c, a[0], a[1]), C = pt(c, a[0], a[1]), B = pt(c, a[2], a[3]);
    for (let i = 1; i <= 8; i++) { const t = i / 8, u = 1 - t; s.push([u * u * A[0] + 2 * u * t * C[0] + t * t * B[0], u * u * A[1] + 2 * u * t * C[1] + t * t * B[1]]); } });
  wrap("bezierCurveTo", (c, a) => { const p = path(c), s = p[p.length - 1], A = s.length ? s[s.length - 1] : pt(c, a[0], a[1]), C1 = pt(c, a[0], a[1]), C2 = pt(c, a[2], a[3]), B = pt(c, a[4], a[5]);
    for (let i = 1; i <= 10; i++) { const t = i / 10, u = 1 - t; s.push([0, 1].map(k => u * u * u * A[k] + 3 * u * u * t * C1[k] + 3 * u * t * t * C2[k] + t * t * t * B[k])); } });
  wrap("arc", (c, a) => { const p = path(c), s = []; for (let i = 0; i <= 12; i++) { const t = a[3] + (a[4] - a[3]) * i / 12; s.push(pt(c, a[0] + a[2] * Math.cos(t),
    a[1] + a[2] * Math.sin(t))); } p.push(s); });
  wrap("stroke", c => window.__pv2rec.push({ k: "stroke", t: T(c), dash: c.getLineDash().filter(v => v > 0), alpha: c.globalAlpha, style: String(c.strokeStyle),
    subs: path(c).filter(s => s.length) }));
  wrap("fillText", (c, a) => window.__pv2rec.push({ k: "text", t: T(c), text: String(a[0]) }));
  const net = (kind, url, body) => { try { window.__pv2net.push({ kind, url: String(url),
    body: body == null ? "" : typeof body === "string" ? body : (body instanceof Blob ? "[blob " + body.size + "]" : JSON.stringify(body)) }); } catch (e) { window.__pv2net.push({ kind,
    url: String(url), body: "[?]" }); } };
  const f = window.fetch.bind(window);
  window.fetch = (u, o) => { net("fetch", u && u.url || u, o && o.body); return f(u, o); };
  const xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return xo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) { net("xhr", this.__u, b); return xs.apply(this, arguments); };
  if (navigator.sendBeacon) { const sb = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (u, b) => { net("beacon", u, b); return sb(u, b); }; }
  const WS = window.WebSocket;
  window.WebSocket = function (u, p) { net("ws-open", u, ""); const w = new WS(u, p); const s = w.send.bind(w); w.send = d => { net("ws", u, d); return s(d); }; return w; };
  const fs = HTMLFormElement.prototype.submit; HTMLFormElement.prototype.submit = function () { net("form", this.action, new URLSearchParams(new FormData(this)).toString());
    return fs.apply(this, arguments); };
  document.addEventListener("submit", e => { try { net("form", e.target.action, new URLSearchParams(new FormData(e.target)).toString()); } catch (x) {} }, true);
  window.print = () => { window.__printed = (window.__printed || 0) + 1; };
})();`;
/* ImageCapture whose takePhoto() returns a PNG of the synthetic hand at 1800 x 2400 (bigger than the 1920 x 1080 stream) */
const FAKE_IC = `window.__tp = 0; window.ImageCapture = class { constructor(t) { this.track = t; }
  takePhoto() { window.__tp++; const h = PalmSynth.synthHand({ seed: 21, scale: 1 }); const c = document.createElement("canvas"); c.width = 1800; c.height = 2400;
    const s = document.createElement("canvas"); s.width = h.w; s.height = h.h; s.getContext("2d").putImageData(new ImageData(h.rgba, h.w, h.h), 0, 0);
    c.getContext("2d").drawImage(s, 0, 0, 1800, 2400); return new Promise(r => c.toBlob(r, "image/png")); }
  grabFrame() { return Promise.reject(new Error("not used")); } };`;
const NO_IC = "try { delete window.ImageCapture; window.ImageCapture = undefined; } catch (e) {}";

async function open(browser, base, { lang = "th", v2 = true, extra = [], fakeCams = null, cams = null, calm = false } = {}) {
  const init = [LANG(lang), RECORDER, SYNTH].concat(v2 ? [ON] : [], calm ? ['try { sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) {}'] : [],
    fakeCams ? [fakeCams, `window.__LQ_FAKE_CAMS = ${S(cams || { n: 1, mode: "ok", res: { w: 1920, h: 1080 } })};`] : [], extra);
  const page = await browser.newPage(null, { initScripts: init });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/palm.html?cpu`);
  if (v2) await page.waitFor(`!!(window.__palmV2 && window.__palmV2.ready)`, 15000);
  return page;
}
const click = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) throw new Error("no " + s); e.scrollIntoView({ block: "center" }); e.click(); return true; }, sel);
async function mouse(page, type, p) { await page.send("Input.dispatchMouseEvent", { type, x: p[0], y: p[1], button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1,
  pointerType: "mouse" }); }
async function tapAt(page, p) { await mouse(page, "mousePressed", p); await mouse(page, "mouseReleased", p); await sleep(60); }
/** synthetic hand -> upload path -> 7 taps -> detection -> 10 rows */
async function loadAndTap(page, opt = { seed: 3, lines: ["heart", "head", "life", "fate"] }) {
  const taps = await page.evaluate(async o => {
    const h = PalmSynth.synthHand(o), c = document.createElement("canvas"); c.width = h.w; c.height = h.h;
    c.getContext("2d").putImageData(new ImageData(h.rgba, h.w, h.h), 0, 0);
    await window.__palmV2.useImage(c.toDataURL("image/png"));
    return h.taps;
  }, opt);
  for (const k of TAP_ORDER) {
    const p = await page.evaluate(q => window.__palmV2.imgToClient(q), taps[k]);
    await tapAt(page, p);
  }
  await page.waitFor(`document.querySelectorAll("#pv2List [data-line]").length === 10 && !window.__palmV2.busy`, 30000);
}
const status = (page, id) => page.evaluate(i => { const r = document.querySelector(`#pv2List [data-line="${i}"]`); return r ? { s: r.dataset.status,
  t: (r.querySelector(".pv2-status") || r).textContent } : null; }, id);
function polyDist(p, P) { let b = Infinity; for (let i = 0; i < P.length - 1; i++) { const a = P[i], c = P[i + 1], dx = c[0] - a[0], dy = c[1] - a[1], l2 = dx * dx + dy * dy || 1e-9;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; t = Math.max(0, Math.min(1, t)); b = Math.min(b, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)); } return b; }
const plen = P => P.reduce((s, p, i) => i ? s + Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) : 0, 0);
function onLine(strokes, P, tol) {
  const L = plen(P);
  return strokes.filter(s => { const pts = s.subs.flat(); if (pts.length < 2) return false; const near = pts.filter(p => polyDist(p, P) <= tol).length / pts.length;
    return near >= 0.8 && s.subs.reduce((a, q) => a + plen(q), 0) >= 0.4 * L; });
}
/** D-a rules on one canvas target: strokes recorded since the last clear vs the page layout of that canvas */
async function checkTarget(page, target, lang, where) {
  const { rec, lay } = await page.evaluate(t => ({ rec: window.__pv2rec.filter(r => r.t === t), lay: window.__palmV2.layout(t) }), target);
  const strokes = rec.filter(r => r.k === "stroke"), texts = rec.filter(r => r.k === "text").map(r => r.text);
  assert(lay && lay.lines && lay.lines.length === 10, `${where}: layout of ${target}: ${S(lay).slice(0, 200)}`);
  const tol = Math.max(4, lay.pw * 0.025);
  assert(strokes.length > 0, `${where}: nothing drawn on ${target}`);
  for (const L of lay.lines) {
    if (L.status === "notFound" && L.px && L.px.length > 1) {
      const on = onLine(strokes, L.px, tol);
      for (const s of on) assert(s.dash.length > 0 && s.alpha <= 0.5 + 1e-9, `${where}: ${target}: guide ${L.id} stroked solid / opaque ${S({ dash: s.dash, alpha: s.alpha })}`);
      if (target === "share") assert(on.length === 0, `${where}: guide ${L.id} on the share card`);
      else if (!L.hidden) assert(on.length > 0, `${where}: ${target}: guide ${L.id} not drawn`);
    }
    if ((L.status === "found" || L.status === "added") && L.px) {
      const on = onLine(strokes, L.px, tol * 0.6);
      assert(on.some(s => s.dash.length === 0), `${where}: ${target}: ${L.id} ${L.status} not solid`);
    }
  }
  if (target === "share") assert(!strokes.some(s => s.dash.length > 0), `${where}: dashed stroke on the share card`);
  else if (lay.lines.some(L => L.status === "notFound" && !L.hidden && L.px)) assert(texts.some(t => t.includes(NOT_FOUND[lang])), `${where}: ${target}: no "${NOT_FOUND[lang]}" label`);
  if (lay.lines.some(L => L.status === "added")) assert(texts.some(t => t.includes(ADDED[lang])), `${where}: ${target}: no "${ADDED[lang]}" mark`);
}
/** everything that left the page, from the CDP network log and the in-page recorder */
async function payloads(page) {
  const inPage = await page.evaluate(() => window.__pv2net.slice());
  return page.requests.map(r => ({ kind: "cdp", url: r.url, body: r.postData || "" })).concat(inPage);
}
async function storageFacts(page) {
  return page.evaluate(async () => {
    const dump = st => Object.keys(st).map(k => ({ k, v: st.getItem(k) || "" }));
    const dbs = indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : [];
    const cacheUrls = [];
    try { for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) cacheUrls.push(r.url); } catch (e) { /* no caches */ }
    return { ls: dump(localStorage), ss: dump(sessionStorage), dbs, cacheUrls, key: window.PalmV2 && window.PalmV2.STORE_KEY };
  });
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("S switch off by default: LENSIQ_PALM_V2 === false, #plV2 hidden, the current palm page shows", async () => {
      const page = await open(browser, base, { v2: false });
      try {
        await page.waitFor(`document.readyState === "complete"`, 10000); await sleep(500);
        const f = await page.evaluate(() => ({ flag: window.LENSIQ_PALM_V2, v2: (() => { const e = document.getElementById("plV2"); return e ? { hidden: e.hidden,
          shown: !!e.offsetParent } : null; })(),
          stage: !!(document.getElementById("plStage") && document.getElementById("plStage").offsetParent) }));
        assert(f.flag === false, "flag " + S(f));
        assert(f.v2 && f.v2.hidden && !f.v2.shown, "v2 section " + S(f));
        assert(f.stage, "legacy stage visible " + S(f));
      } finally { await page.close(); }
    });

    for (const lang of LANGS) {
      await check(`${lang}: synthetic hand -> 7 taps -> three layers (screen / print / share), list, trace, remove, not-on-my-hand, reading, privacy, storage`, async () => {
        const page = await open(browser, base, { lang });
        try {
          await loadAndTap(page);
          const where = `${lang}`;
          for (const id of ["heart", "head", "life"]) { const s = await status(page, id); assert(s && s.s === "found" && s.t.includes(FOUND[lang]), `${where}: ${id} ${S(s)}`); }
          const mar = await status(page, "marriage");
          assert(mar && mar.s === "notFound" && mar.t.includes(NOT_FOUND[lang]), `${where}: marriage ${S(mar)}`);
          // D-a1 screen
          await page.evaluate(() => { window.__pv2rec = []; window.__palmV2.redraw(); });
          await checkTarget(page, "screen", lang, where + " screen");
          // layer c: trace the sun line along its guide (pointer), not-on-my-hand for the girdle, remove the found fate line
          await click(page, `#pv2List [data-line="sun"] [data-act="trace"]`);
          await sleep(300);
          const guv = await page.evaluate(() => { const g = window.PalmV2.guides(window.__palmV2.state().school).sun.cp; const out = []; for (let i = 0; i < g.length - 1;
            i++) for (let k = 0; k < 6; k++) { const t = k / 6; out.push([g[i][0] + (g[i + 1][0] - g[i][0]) * t, g[i][1] + (g[i + 1][1] - g[i][1]) * t]); } out.push(g[g.length - 1]);
            return out; });
          const pts = [];
          for (const q of guv) pts.push(await page.evaluate(u => window.__palmV2.uvToClient(u), q));
          await mouse(page, "mousePressed", pts[0]);
          for (const p of pts.slice(1)) { await mouse(page, "mouseMoved", p); await sleep(15); }
          await mouse(page, "mouseReleased", pts[pts.length - 1]);
          await page.waitFor(`(document.querySelector('#pv2List [data-line="sun"]') || {dataset:{}}).dataset.status === "added"`, 5000);
          const sun = await status(page, "sun");
          assert(sun.t.includes(ADDED[lang]), `${where}: traced sun ${S(sun)}`);
          await click(page, `#pv2List [data-line="girdle"] [data-act="absent"]`);
          await page.waitFor(`document.querySelector('#pv2List [data-line="girdle"]').dataset.status === "absentConfirmed"`, 3000);
          assert((await status(page, "girdle")).t.includes(ABSENT[lang]), where + " girdle label");
          const fate0 = await status(page, "fate");
          if (fate0.s === "found") {
            await click(page, `#pv2List [data-line="fate"] [data-act="remove"]`);
            await page.waitFor(`document.querySelector('#pv2List [data-line="fate"]').dataset.status === "notFound"`, 3000);
          }
          await page.evaluate(u => window.__palmV2.setLine("bracelet", { status: "added", cp: [[u, 1.06], [0.5, 1.07], [0.9, 1.06]] }), UNIQUE);
          await page.evaluate(() => { window.__pv2rec = []; window.__palmV2.redraw(); });
          await checkTarget(page, "screen", lang, where + " screen after edits");
          // reading: no notFound line named (D-b1)
          await click(page, "#pv2Read");
          await page.waitFor(`(() => { const r = document.getElementById("pv2Result"); return r && !r.hidden && document.getElementById("pv2Reading").textContent.trim().length > 20; })()`, 10000);
          const rd = await page.evaluate(() => { const st = window.__palmV2.state(); return { text: document.getElementById("pv2Reading").textContent,
            nf: window.PalmV2.LINES.filter(id => st.lines[id].status === "notFound").map(id => window.PalmV2.SCHOOLS.flatMap(s => ["th", "en", "zh"].map(l => window.PalmV2.lineName(id, s, l)))) }; });
          for (const names of rd.nf) for (const n of names) assert(!rd.text.toLowerCase().includes(n.toLowerCase()), `${where}: reading names a not-found line "${n}"`);
          // D-a2 print, D-a3 share
          await page.evaluate(() => { window.__pv2rec = []; });
          await click(page, "#pv2Print");
          await page.waitFor(`(window.__printed || 0) >= 1`, 8000);
          await checkTarget(page, "print", lang, where + " print");
          await page.evaluate(() => { window.__pv2rec = []; });
          await click(page, "#pv2Share");
          await page.waitFor(`(() => { const i = document.getElementById("pv2Card"); return i && !i.hidden && /^(data:image|blob:)/.test(i.src); })()`, 8000);
          await checkTarget(page, "share", lang, where + " share");
          // D-c1 privacy
          await sleep(500);
          for (const p of await payloads(page)) {
            const blob = (p.url || "") + " " + (p.body || "");
            assert(!blob.includes("123457"), `${where}: the traced coordinate left the device: ${p.kind} ${p.url}`);
            assert(!/"cp"\s*:|"lines"\s*:\s*\[/.test(blob), `${where}: line geometry in a request: ${p.kind} ${p.url}`);
            assert(!/data:image|^blob:/.test(p.body || ""), `${where}: an image in a request body: ${p.kind} ${p.url}`);
            assert(!/^(ws-open|ws)$/.test(p.kind), `${where}: a WebSocket was used: ${p.url}`);
          }
          // D-c2 storage
          const sf = await storageFacts(page);
          for (const e of sf.ls.concat(sf.ss)) {
            assert(!/data:image|blob:/i.test(e.v) && !/[A-Za-z0-9+/=]{1024,}/.test(e.v), `${where}: storage ${e.k} holds image-like data`);
          }
          const own = sf.ls.concat(sf.ss).filter(e => e.k === sf.key);
          assert(own.length === 1, `${where}: the v2 key ${sf.key} once in storage: ${S(sf.ls.concat(sf.ss).map(e => e.k))}`);
          const o = JSON.parse(own[0].v);
          assert(S(Object.keys(o).sort()) === S(["lines", "school", "side", "v"]) && own[0].v.length < 8192, `${where}: stored schema ${own[0].v.slice(0, 200)}`);
          for (const l of o.lines) assert(Object.keys(l).every(k => ["id", "status", "cp"].includes(k)), `${where}: stored line keys ${S(Object.keys(l))}`);
          assert(!sf.ls.some(e => e.k === sf.key), `${where}: line geometry kept in localStorage (session only)`);
          assert(!sf.dbs.some(n => /palm/i.test(n || "")), `${where}: palm IndexedDB ${S(sf.dbs)}`);
          assert(!sf.cacheUrls.some(u => /^blob:|data:image/.test(u)), `${where}: image in Cache Storage`);
        } finally { await page.close(); }
      });
    }

    await check("CAM: takePhoto still when ImageCapture exists; full track frame otherwise; rear camera; consent line for another person's hand (TH / EN / ZH)", async () => {
      for (const lang of LANGS) {
        const page = await open(browser, base, { lang, fakeCams, extra: [FAKE_IC] });
        try {
          await click(page, `[data-pv2-mode="other"]`);
          const c1 = await page.evaluate(() => ({ text: (document.getElementById("pv2ConsentText") || {}).textContent, shown: !!(document.getElementById("pv2ConsentText") || {}).offsetParent,
            disabled: document.getElementById("pv2Start").disabled }));
          assert(c1.shown && (c1.text || "").trim() === CONSENT[lang], `${lang}: consent line ${S(c1)}`);
          assert(c1.disabled === true, `${lang}: the camera can open before consent ${S(c1)}`);
          await click(page, "#pv2Start");
          await sleep(500);
          assert(!(await page.evaluate(() => !!(window.__LQ_FAKE && window.__LQ_FAKE.opens && window.__LQ_FAKE.opens.length))), `${lang}: a camera opened without consent`);
          await click(page, "#pv2Consent");
          await page.waitFor(`!document.getElementById("pv2Start").disabled`, 3000);
          await click(page, "#pv2Start");
          await page.waitFor(`!!(window.__LQ_FAKE && window.__LQ_FAKE.opens.length) && !document.getElementById("pv2Snap").hidden`, 8000);
          const req = await page.evaluate(() => JSON.stringify(window.__LQ_FAKE.requests));
          assert(/environment/.test(req), `${lang}: rear camera not asked: ${req.slice(0, 200)}`);
          await click(page, "#pv2Snap");
          await page.waitFor(`!!(window.__palmV2.lastStill)`, 10000);
          const st = await page.evaluate(() => Object.assign({}, window.__palmV2.lastStill, { tp: window.__tp, consent: document.getElementById("pv2Consent").checked }));
          assert(st.source === "takePhoto" && st.tp >= 1 && st.width === 1800 && st.height === 2400, `${lang}: still ${S(st)}`);
          assert(st.consent === false, `${lang}: consent tick kept after the capture`);
        } finally { await page.close(); }
      }
      const page = await open(browser, base, { lang: "th", fakeCams, extra: [NO_IC] });
      try {
        await click(page, `[data-pv2-mode="self"]`);
        await click(page, "#pv2Start");
        await page.waitFor(`!document.getElementById("pv2Snap").hidden`, 8000);
        await page.waitFor(`document.querySelector("#plV2 video").videoWidth > 0`, 5000);
        await click(page, "#pv2Snap");
        await page.waitFor(`!!(window.__palmV2.lastStill)`, 10000);
        const st = await page.evaluate(() => { const v = document.querySelector("#plV2 video"); return Object.assign({}, window.__palmV2.lastStill, { vw: v.videoWidth, vh: v.videoHeight,
          cw: v.clientWidth }); });
        assert(st.source === "trackFrame" && st.width === st.vw && st.height === st.vh && st.width > st.cw, `track frame still ${S(st)}`);
      } finally { await page.close(); }
    });

    await check("CR crisis v3: a crisis phrase hides the reading, the share / print card and paid content; 1323 stays (TH / EN / ZH)", async () => {
      for (const lang of LANGS) {
        const page = await open(browser, base, { lang });
        try {
          await page.evaluate(t => { const e = document.getElementById("pv2Nick"); e.value = t; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", {
            bubbles: true })); }, PHRASE[lang]);
          await loadAndTap(page);
          await click(page, "#pv2Read").catch(() => {});
          await page.waitFor(`!!document.querySelector(".fa-support") && document.querySelector(".fa-support").offsetParent !== null`, 10000);
          await sleep(500);
          const f = await page.evaluate(() => {
            const vis = e => !!(e && e.offsetParent !== null && e.getClientRects().length);
            const reading = document.getElementById("pv2Reading");
            return { reading: vis(reading) ? reading.textContent.trim().length : 0, share: vis(document.getElementById("pv2Share")), print: vis(document.getElementById("pv2Print")),
              card: vis(document.getElementById("pv2Card")), paid: [...document.querySelectorAll("[data-lq-paid], [data-lq-remedy], [data-lq-upsell], .lq-paid")].filter(vis).length,
              lines: vis(document.getElementById("pv2List")), tel: [...document.querySelectorAll('a[href="tel:1323"]')].some(vis) };
          });
          assert(f.reading === 0 && !f.share && !f.print && !f.card && f.paid === 0 && f.tel, `${lang}: crisis ${S(f)}`);
        } finally { await page.close(); }
      }
    });
  } finally { await browser.close(); }
}
