/* lensiq-demo.js — LENSIQ sales demo mode (`?demo=1`): a 10-minute demo with built-in sample data, no camera, no real
 * person and no customer data. Without ?demo=1 this file only sets window.LQDemo = {on: false} and changes nothing.
 * Load it in <head> before every other script (it must run before page code touches storage), then lensiq-demo-data.js
 * (the per-page sample data) and i18n/zh-demo.js (English: i18n/en-demo.js, loaded on demand).
 *
 * In demo mode (memory only, nothing of the demo reaches the device's real records):
 *   localStorage / sessionStorage   replaced by in-memory stores that start EMPTY (real data is never read or shown) and
 *                                   are pre-filled only with the page's sample data (LQDemo.seed); the language choice
 *                                   "lq-lang" is read through so the demo opens in the presenter's language
 *   indexedDB                       every database name gets the prefix "lq-demo~" and starts fresh on each page load
 *   BroadcastChannel                channel names get the same prefix (a real exam dashboard never hears the demo)
 *   fetch / XHR / sendBeacon / WebSocket / EventSource   refused unless same-origin and outside /api/
 *   camera                          getUserMedia refused; the real camera start buttons are hidden
 *   downloads                       file name "SAMPLE-…"; a CSV starts with the line "ตัวอย่าง / SAMPLE …"
 *   UI                              a fixed banner #lqSampleBar (always in view) + a demo panel [data-lq-demo] at the top of
 *                                   <main> with the page's guide, buttons, "reset sample data" and "leave demo mode"
 * API: LQDemo = {on, seed(key, value | () => value), records(ns) -> [...] | null, addRecords(ns, () => [...]),
 *               page() -> "exam-lab" | …, onReady(fn(panelBody)), t(key, th, vars), LABEL}
 * Text: Thai here; English / Chinese in i18n/{en,zh}-demo.js ("demo.*"). */
(function () {
  "use strict";
  const W = /** @type {any} */ (window);
  const on = /[?&]demo=1(?:[&#]|$)/.test(location.search || "");
  const seeds = new Map(), recs = new Map(), ready = [];
  const page = () => (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "");
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m));
  /** @param {string} k @param {string} th @param {object} [v] */
  const t = (k, th, v) => (W.LQI18N && W.LQI18N.tf ? W.LQI18N.tf(k, th, v) : fill(th, v));
  const LABEL = "\"ตัวอย่าง / SAMPLE: ข้อมูลสมมติจากโหมดสาธิต ไม่ใช่ข้อมูลจริง / demo sample data, not real data / 示例数据\"";
  const api = {
    on, page, t, LABEL,
    /** sample value for a storage key (object -> JSON); a function is called on first read (page libraries are loaded by then) */
    seed(key, value) { seeds.set(String(key), value); },
    addRecords(ns, fn) { recs.set(ns, fn); },
    /** sample records for a GateKit store (gate-kit.js openStore), or null outside demo mode */
    records(ns) { if (!on || !recs.has(ns)) return null; try { return recs.get(ns)() || null; } catch (e) { console.warn("demo records", e); return null; } },
    onReady(fn) { ready.push(fn); }
  };
  W.LQDemo = api;
  if (!on) return;

  /* ---------- storage: in memory, starts empty, sample data only ---------- */
  let realLS = null;
  try { realLS = W.localStorage; } catch (e) { realLS = null; }
  const PASS = new Set(["lq-lang"]); // read-through only (never written back)
  /** @param {boolean} seeded */
  function memStore(seeded) {
    const m = new Map();
    const fromSeed = k => {
      if (!seeded || !seeds.has(k)) return undefined;
      let v = seeds.get(k);
      try { if (typeof v === "function") v = v(); } catch (e) { console.warn("demo seed " + k, e); return undefined; }
      if (v == null) return undefined;
      seeds.delete(k);
      const s = typeof v === "string" ? v : JSON.stringify(v);
      m.set(k, s); return s;
    };
    const keys = () => { if (seeded) for (const k of [...seeds.keys()]) fromSeed(k); return [...m.keys()]; };
    const st = {
      getItem(k) {
        k = String(k);
        if (m.has(k)) return m.get(k);
        const s = fromSeed(k); if (s !== undefined) return s;
        if (seeded && PASS.has(k) && realLS) { try { return realLS.getItem(k); } catch (e) { return null; } }
        return null;
      },
      setItem(k, v) { k = String(k); if (seeded) seeds.delete(k); m.set(k, String(v)); },
      removeItem(k) { k = String(k); if (seeded) seeds.delete(k); m.delete(k); },
      clear() { if (seeded) seeds.clear(); m.clear(); },
      key(i) { const a = keys(); return i >= 0 && i < a.length ? a[i] : null; },
      get length() { return keys().length; }
    };
    return new Proxy(st, {
      get(o, p) {
        if (typeof p === "symbol" || p in o) { const v = Reflect.get(o, p, o); return typeof v === "function" ? v.bind(o) : v; }
        const v = o.getItem(p); return v === null ? undefined : v;
      },
      set(o, p, v) { if (typeof p === "symbol" || p in o) return false; o.setItem(p, v); return true; },
      has(o, p) { return p in o || (typeof p === "string" && o.getItem(p) !== null); },
      deleteProperty(o, p) { if (typeof p === "string") o.removeItem(p); return true; },
      ownKeys() { return keys(); },
      getOwnPropertyDescriptor(o, p) {
        if (typeof p !== "string" || p in o) return undefined;
        const v = o.getItem(p); return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true };
      }
    });
  }
  const LS = memStore(true), SS = memStore(false);
  try {
    Object.defineProperty(W, "localStorage", { configurable: true, enumerable: true, get: () => LS });
    Object.defineProperty(W, "sessionStorage", { configurable: true, enumerable: true, get: () => SS });
  } catch (e) { console.error("LENSIQ demo: cannot isolate storage", e); }

  /* ---------- IndexedDB + BroadcastChannel: separate "lq-demo~" namespace ---------- */
  const NS = "lq-demo~";
  const idb = W.indexedDB;
  if (idb) {
    const rOpen = idb.open.bind(idb), rDel = idb.deleteDatabase.bind(idb), rDbs = typeof idb.databases === "function" ? idb.databases.bind(idb) : null;
    const fresh = new Set();
    idb.open = function (name, version) {
      const n = NS + name;
      if (!fresh.has(n)) { fresh.add(n); try { rDel(n); } catch (e) { /* queued before the open: the demo starts clean */ } }
      return version === undefined ? rOpen(n) : rOpen(n, version);
    };
    idb.deleteDatabase = name => rDel(NS + name);
    if (rDbs) idb.databases = () => rDbs().then(a => a.filter(d => d && String(d.name).indexOf(NS) === 0).map(d => ({ name: d.name.slice(NS.length), version: d.version })));
  }
  if (typeof W.BroadcastChannel === "function") {
    const BC = W.BroadcastChannel;
    const Demo = function (name) { return new BC(NS + name); };
    Demo.prototype = BC.prototype;
    W.BroadcastChannel = Demo;
  }

  /* ---------- network: nothing leaves this site ---------- */
  const local = u => {
    try {
      const x = new URL(String(u), location.href);
      return (x.protocol === "data:" || x.protocol === "blob:" || x.origin === location.origin) && x.pathname.indexOf("/api/") !== 0;
    } catch (e) { return false; }
  };
  const refuse = () => new TypeError(t("demo.net", "โหมดสาธิต: ไม่ส่งข้อมูลออกนอกเว็บไซต์นี้"));
  if (typeof W.fetch === "function") {
    const rf = W.fetch;
    W.fetch = function (input, init) {
      const u = typeof input === "string" || input instanceof URL ? String(input) : input && input.url;
      return local(u) ? rf.call(this, input, init) : Promise.reject(refuse());
    };
  }
  if (W.XMLHttpRequest) {
    const xo = W.XMLHttpRequest.prototype.open;
    W.XMLHttpRequest.prototype.open = function (m, u) { if (!local(u)) throw refuse(); return xo.apply(this, /** @type {any} */ (arguments)); };
  }
  if (navigator.sendBeacon) {
    const sb = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (u, d) => (local(u) ? sb(u, d) : false);
  }
  for (const k of ["WebSocket", "EventSource"]) if (W[k]) W[k] = function () { throw refuse(); };

  /* ---------- no camera: the demo runs on sample data only (no live view of the people in the room) ---------- */
  const md = navigator.mediaDevices;
  if (md && typeof md.getUserMedia === "function") {
    md.getUserMedia = () => Promise.reject(Object.assign(new Error(t("demo.cam", "โหมดสาธิตไม่เปิดกล้อง — ออกจากโหมดสาธิตเพื่อใช้กล้องจริง")), { name: "NotAllowedError" }));
  }

  /* ---------- downloads: SAMPLE in the name, CSV labelled in its first line ---------- */
  const RB = W.Blob;
  const DemoBlob = function (parts, opts) {
    if (opts && /csv/i.test(String(opts.type || "")) && Array.isArray(parts)) {
      parts = parts.slice();
      if (typeof parts[0] === "string") {
        const s = parts[0], bom = s.charAt(0) === "﻿";
        parts[0] = (bom ? "﻿" : "") + LABEL + "\r\n" + (bom ? s.slice(1) : s);
      } else parts.unshift(LABEL + "\r\n");
    }
    return new RB(parts, opts);
  };
  DemoBlob.prototype = RB.prototype;
  W.Blob = DemoBlob;
  const aClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && !/^SAMPLE-/i.test(this.download)) this.download = "SAMPLE-" + this.download;
    return aClick.apply(this, /** @type {any} */ (arguments));
  };

  /* ---------- banner + panel ---------- */
  const css = `
#lqSampleBar{position:fixed;left:0;right:0;bottom:0;z-index:80;margin:0;padding:8px 16px calc(8px + env(safe-area-inset-bottom,0px));
  background:#9a3412;color:#fff;font:600 .95rem/1.35 Inter,Prompt,"Noto Sans Thai",system-ui,sans-serif;text-align:center;
  box-shadow:0 -4px 16px rgba(0,0,0,.18);overflow-wrap:anywhere}
body.lq-sample{padding-bottom:var(--lq-sample-h,48px)}
body.lq-sample .ex-monitor,body.lq-sample .toast,body.lq-sample .gk-toast{bottom:calc(var(--lq-sample-h,48px) + 12px)}
.lq-demo-panel{border:2px dashed #c2410c;background:#fff7ed;color:#431407;border-radius:14px;padding:14px 16px;margin:12px 0 16px;max-width:100%;
  box-sizing:border-box;overflow-wrap:anywhere}
.lq-demo-panel h2{font-size:1.1rem;margin:0 0 6px;color:#9a3412}
.lq-demo-panel p,.lq-demo-panel li{font-size:.95rem;margin:4px 0}
.lq-demo-panel ul{margin:4px 0;padding-left:20px}
.lq-demo-btns{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 2px}
.lq-demo-btns .btn{min-height:44px;min-width:44px;white-space:normal}
.lq-demo-btns .btn[aria-pressed=true]{outline:3px solid #c2410c;outline-offset:1px}
.lq-demo-code{font-family:ui-monospace,Menlo,monospace;font-size:.95rem}
html[data-lq-demo-mode] :is(#startCam,#gkCamBtn,#startScan,#hrQrCam){display:none!important}
@media print{#lqSampleBar{position:static}}`;
  document.documentElement.setAttribute("data-lq-demo-mode", "1"); // camera start buttons hidden (css below)
  function mount() {
    const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
    document.body.classList.add("lq-sample");
    const bar = document.createElement("p");
    bar.id = "lqSampleBar"; bar.setAttribute("role", "note"); bar.setAttribute("data-i18n", "demo.bar");
    bar.textContent = "โหมดสาธิต: ข้อมูลตัวอย่าง ไม่ใช่ข้อมูลจริง";
    document.body.appendChild(bar);
    const fit = () => document.body.style.setProperty("--lq-sample-h", Math.ceil(bar.getBoundingClientRect().height) + "px");
    fit(); W.addEventListener("resize", fit);

    const main = document.querySelector("main") || document.body;
    const panel = document.createElement("section");
    panel.className = "card lq-demo-panel"; panel.id = "lqDemoPanel"; panel.setAttribute("data-lq-demo", "");
    panel.setAttribute("aria-labelledby", "lqDemoH");
    const exit = location.pathname + location.search.replace(/([?&])demo=1(&|$)/, (m, a, b) => (b ? a : "")).replace(/[?&]$/, "") + location.hash;
    panel.innerHTML = `<h2 id="lqDemoH" data-i18n="demo.h">โหมดสาธิตสำหรับการนำเสนอ</h2>
<p data-i18n="demo.p">หน้านี้ใช้ข้อมูลตัวอย่างที่สร้างขึ้นเอง ชื่อทั้งหมดเป็นชื่อสมมติ ไม่ใช้กล้อง ไม่มีภาพบุคคล
ไม่ส่งข้อมูลออกจากเครื่อง และไม่เขียนทับข้อมูลจริงในเครื่องนี้ ไฟล์ที่ส่งออกมีคำว่า SAMPLE กำกับ</p>
<div class="lq-demo-body"></div>
<div class="lq-demo-btns"><button type="button" class="btn ghost" id="lqDemoReset" data-i18n="demo.reset">เริ่มข้อมูลตัวอย่างใหม่</button>
<a class="btn ghost" id="lqDemoExit" data-i18n="demo.exit">ออกจากโหมดสาธิต</a></div>`;
    /** @type {HTMLAnchorElement} */ (panel.querySelector("#lqDemoExit")).href = exit;
    /** @type {HTMLElement} */ (panel.querySelector("#lqDemoReset")).addEventListener("click", () => location.reload());
    const h1 = main.querySelector("h1");
    if (h1 && h1.parentNode === main) main.insertBefore(panel, h1.nextSibling); else main.insertBefore(panel, main.firstChild);
    const body = /** @type {HTMLElement} */ (panel.querySelector(".lq-demo-body"));
    for (const fn of ready) { try { fn(body); } catch (e) { console.error("demo panel", e); } }
    const tr = () => { if (W.LQI18N && W.LQI18N.apply) { W.LQI18N.apply(bar); W.LQI18N.apply(panel); } fit(); };
    tr(); W.addEventListener("lq-lang", tr);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
