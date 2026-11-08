/* lensiq-exam-clip.js — LQExamClip: opt-in 10-second evidence clip for LENSIQ Exam camera devices (exam-lab, exam-hall).
 * Browser: window.LQExamClip · Node: require("./lensiq-exam-clip.js") (pure parts + store with injected vault / db).
 *
 * PRINCIPLE (docs/EXAM.md "Evidence clip"): OFF by default, switched on per exam by the institution. While on, the camera
 * device keeps only the LAST ~10 seconds of video in memory (a ring of short MediaRecorder segments, video track only —
 * never audio). When a Watch / Check flag fires, that ring is copied into a short-lived in-memory "pending" slot. It is
 * written to disk ONLY when an invigilator taps "keep clip" on that flag (or immediately when the institution enabled
 * auto-keep). Kept clips are encrypted at rest with LQVault (AES-GCM 256, non-extractable key per clip in IndexedDB,
 * the clip id is the AAD), deleted automatically after N days, and deleting a clip also deletes its key (crypto-shred).
 * Clips are never uploaded: there is no network code in this file. Without WebCrypto / IndexedDB / a secure context
 * nothing is recorded at all (no plaintext fallback).
 *
 * API
 *   DAYS [1,7,14,30,90] · DEFAULTS {on:false, auto:false, days:14} · cleanCfg(c) · cfgFromParams(URLSearchParams, base)
 *   wantsClip(msg) -> boolean   Watch / Check events of an objective signal (CLIP_SIGS) — never info / setup / room
 *   pickSegs(segs, now, wantMs, maxMs?, minMs?) -> {segs, from, to, ms}   newest segments covering ~wantMs (never > maxMs
 *     when a shorter pick still covers >= minMs; defaults wantMs + 1.5 s / wantMs - 2.5 s)
 *   createPending({max=6, holdMs=600000}) -> {add(id, clip, now) -> droppedIds, take(id), has(id), expire(now) -> ids, size, ids()}
 *   createRing(stream, {segMs, wantMs, bps, MR, MS, now}) -> {snapshot() -> Promise<clip|null>, stop(), mime, running}
 *   createStore({vault, db, now}) -> {supported(), save(meta, clip, days), list(), load(id), del(id), delAll(), purge(now), count()}
 *   purgeDevice({vault, now}) -> Promise<ids>   auto-delete expired clips from any exam page (does not create the database)
 *   createPin({ls, subtle, now}) -> {has(), set(pin, old?), verify(pin), valid(pin)}   invigilator PIN for the kept-clip list
 *   ringSupported(root?) · blobToB64(blob) · b64ToBytes(s)
 */
(/** @param {any} root @param {(root: any) => any} factory */ function (root, factory) {
  const m = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = m;
  else {
    root.LQExamClip = m;
    // auto-delete expired clips on every page that loads this file (exam.html / exam-dashboard.html too), not only the camera pages
    if (root.setTimeout) root.setTimeout(() => { m.purgeDevice(); }, 0);
  }
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";
  const DAY = 86400000;
  const DAYS = Object.freeze([1, 7, 14, 30, 90]);
  const DEFAULTS = Object.freeze({ on: false, auto: false, days: 14 });
  const MAX_KEPT = 60; // per device; the oldest is never overwritten silently — save() fails with "full"
  const fin = v => typeof v === "number" && Number.isFinite(v);

  /** objective, observable events only (what the camera / browser saw) — the same list docs/EXAM.md shows */
  const CLIP_SIGS = Object.freeze(["noface", "multiface", "headturn", "phone", "object", "frozen", "virtualcam", "fsexit", "screens",
    "away", "paste", "early", "extra", "aisle", "lean", "empty"]);

  function cleanCfg(c) {
    const o = c && typeof c === "object" ? c : {};
    const on = o.on === true;
    const days = DAYS.includes(Number(o.days)) ? Number(o.days) : DEFAULTS.days;
    return { on, auto: on && o.auto === true, days };
  }
  /** ?clip=1&clipauto=1&clipdays=7 (an institution's exam link); anything else keeps `base` */
  function cfgFromParams(p, base) {
    const b = cleanCfg(base);
    if (!p || typeof p.get !== "function") return b;
    const on = p.get("clip"), auto = p.get("clipauto"), days = p.get("clipdays");
    return cleanCfg({ on: on == null ? b.on : on === "1", auto: auto == null ? b.auto : auto === "1", days: days == null ? b.days : Number(days) });
  }
  function wantsClip(m) {
    return !!(m && (m.lvl === "watch" || m.lvl === "check") && CLIP_SIGS.includes(m.sig));
  }

  /** newest segments first until they cover wantMs; if that overshoots maxMs and one segment fewer still covers minMs,
   * use the shorter pick (so a "10 s" clip stays ~9.5–11.5 s with 2 s segments). Returned oldest -> newest */
  function pickSegs(segs, now, wantMs = 10000, maxMs = wantMs + 1500, minMs = wantMs - 2500) {
    const out = []; let ms = 0;
    for (let i = (segs || []).length - 1; i >= 0 && ms < wantMs; i--) {
      const s = segs[i]; if (!s || !fin(s.t0) || !fin(s.t1) || s.t1 < s.t0) continue;
      const d = s.t1 - s.t0;
      if (out.length && ms + d > maxMs && ms >= minMs) break;
      out.unshift(s); ms += d;
    }
    return { segs: out, from: out.length ? out[0].t0 : now, to: out.length ? out[out.length - 1].t1 : now, ms };
  }

  /** flagged clips waiting in memory for an invigilator's "keep" — dropped (never written) after holdMs */
  function createPending({ max = 6, holdMs = 600000 } = {}) {
    const m = new Map();
    return {
      add(id, clip, now) {
        m.delete(id); m.set(id, { clip, until: now + holdMs });
        const dropped = [];
        while (m.size > max) { const k = m.keys().next().value; m.delete(k); dropped.push(k); }
        return dropped;
      },
      take(id) { const e = m.get(id); m.delete(id); return e ? e.clip : null; },
      has: id => m.has(id),
      expire(now) { const out = []; for (const [k, e] of m) if (e.until <= now) { m.delete(k); out.push(k); } return out; },
      clear() { const ids = [...m.keys()]; m.clear(); return ids; },
      ids: () => [...m.keys()],
      get size() { return m.size; }
    };
  }

  /* ---------- ring buffer (browser) ---------- */
  const MIMES = ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm", "video/mp4"];
  function pickMime(MR) {
    for (const t of MIMES) { try { if (MR.isTypeSupported && MR.isTypeSupported(t)) return t; } catch (e) { /* ignore */ } }
    return "";
  }
  function ringSupported(r = root) { return !!(r && r.MediaRecorder && typeof r.MediaRecorder === "function"); }

  /**
   * Rolling segments (each a complete, playable file): a new MediaRecorder starts every segMs, the old one is stopped,
   * segments older than wantMs + segMs are dropped. snapshot() closes the current segment early and returns the newest
   * segments covering >= wantMs (or less right after start). Video track only.
   */
  function createRing(stream, { segMs = 2000, wantMs = 10000, bps = 300000, MR = root.MediaRecorder, MS = root.MediaStream, now = () => Date.now() } = {}) {
    if (!MR || !MS || !stream || !stream.getVideoTracks) return null;
    const vt = stream.getVideoTracks();
    if (!vt.length) return null;
    const vs = new MS(vt); // video track only: audio is never recorded, even if the camera stream carried a microphone
    const mime = pickMime(MR);
    let segs = [], cur = null, timer = null, stopped = false, failed = false;
    // time-based (not a fixed count): many quick flags make many short segments and the clip must still cover ~10 s
    const trim = () => { const lim = now() - (wantMs + segMs + 1000); segs = segs.filter(s => s.t1 >= lim).slice(-40); };
    function begin() {
      let rec;
      try { rec = new MR(vs, mime ? { mimeType: mime, videoBitsPerSecond: bps } : { videoBitsPerSecond: bps }); } catch (e) { failed = true; cur = null; return; }
      const seg = { rec, chunks: [], t0: now(), waiters: [] };
      rec.ondataavailable = e => { if (e.data && e.data.size) seg.chunks.push(e.data); };
      rec.onstop = () => {
        if (seg.chunks.length) { segs.push({ blob: new Blob(seg.chunks, { type: mime || seg.chunks[0].type || "video/webm" }), t0: seg.t0, t1: now() }); trim(); }
        const w = seg.waiters; seg.waiters = []; w.forEach(f => f());
      };
      rec.onerror = () => { failed = true; };
      try { rec.start(); } catch (e) { failed = true; cur = null; return; }
      cur = seg;
      timer = setTimeout(rotate, segMs);
    }
    function rotate() {
      clearTimeout(timer);
      const old = cur;
      if (!stopped) begin(); else cur = null;
      return new Promise(res => {
        if (!old || old.rec.state === "inactive") return res();
        old.waiters.push(res);
        try { old.rec.stop(); } catch (e) { res(); }
        setTimeout(res, 3000); // a recorder that never fires onstop must not block the page
      });
    }
    begin();
    return {
      async snapshot() {
        if (stopped) return null;
        await rotate();
        const p = pickSegs(segs, now(), wantMs);
        if (!p.segs.length) return null;
        return { mime: mime || p.segs[0].blob.type || "video/webm", from: p.from, to: p.to, ms: p.ms, segs: p.segs.map(s => ({ blob: s.blob, t0: s.t0, t1: s.t1 })) };
      },
      stop() { stopped = true; clearTimeout(timer); if (cur) { try { cur.rec.stop(); } catch (e) { /* ignore */ } } cur = null; segs = []; },
      get running() { return !stopped && !!cur && !failed; },
      get failed() { return failed; },
      mime
    };
  }

  /* ---------- encoding ---------- */
  function bytesToB64(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 0x8000)));
    return root.btoa ? root.btoa(s) : Buffer.from(s, "binary").toString("base64");
  }
  function b64ToBytes(s) {
    const bin = root.atob ? root.atob(s) : Buffer.from(s, "base64").toString("binary");
    const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  async function blobToB64(b) { return bytesToB64(new Uint8Array(await b.arrayBuffer())); }

  /* ---------- encrypted store ---------- */
  /** IndexedDB "lq-exam-clips" / "clips" (keyPath id): {id, meta..., env} — env = LQVault envelope (AES-GCM) */
  function idbDb(name = "lq-exam-clips") {
    const open = () => new Promise((res, rej) => {
      const r = root.indexedDB.open(name, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("clips")) r.result.createObjectStore("clips", { keyPath: "id" }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error("IndexedDB blocked"));
    });
    const tx = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const t = db.transaction("clips", mode), st = t.objectStore("clips"); let out;
      fn(st, v => { out = v; });
      t.oncomplete = () => { db.close(); res(out); }; t.onerror = () => { db.close(); rej(t.error); }; t.onabort = () => { db.close(); rej(t.error || new Error("abort")); };
    }));
    return {
      put: rec => tx("readwrite", st => { st.put(rec); }),
      get: id => tx("readonly", (st, set) => { const r = st.get(id); r.onsuccess = () => set(r.result || null); }),
      all: () => tx("readonly", (st, set) => { const r = st.getAll(); r.onsuccess = () => set(r.result || []); }),
      del: id => tx("readwrite", st => { st.delete(id); })
    };
  }
  /** a one-key Storage stand-in so LQVault.write/read seal into memory and we keep the envelope in IndexedDB */
  function memLS() {
    const m = new Map();
    return {
      getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); },
      get length() { return m.size; }, key: i => [...m.keys()][i] || null
    };
  }
  const META = ["id", "room", "node", "seat", "sig", "lvl", "t", "from", "to", "ms", "size", "how", "kept", "exp", "mime"];
  const pickMeta = r => { const o = {}; for (const k of META) if (r[k] != null) o[k] = r[k]; return o; };
  const vname = id => "lqx-clip-" + id;
  const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

  /** @param {{vault?: any, db?: any, now?: () => number}} [o] */
  function createStore({ vault = root.LQVault, db = null, now = () => Date.now() } = {}) {
    let dbi = db || null;
    const getDb = () => dbi || (root.indexedDB ? (dbi = idbDb()) : null);
    const supported = () => !!(vault && vault.supported && vault.supported() && getDb());
    async function list() { const d = getDb(); if (!d) return []; return (await d.all()).map(pickMeta).sort((a, b) => a.t - b.t); }
    async function save(meta, clip, days) {
      if (!supported()) { const e = new Error("insecure"); /** @type {any} */ (e).code = "insecure"; throw e; }
      if (!meta || !ID_RE.test(String(meta.id)) || !clip || !Array.isArray(clip.segs) || !clip.segs.length) { const e = new Error("bad clip"); /** @type {any} */ (e).code = "bad"; throw e; }
      if ((await list()).length >= MAX_KEPT) { const e = new Error("full"); /** @type {any} */ (e).code = "full"; throw e; }
      const segs = [];
      let size = 0;
      for (const s of clip.segs) { const b = await blobToB64(s.blob); size += s.blob.size || 0; segs.push({ b, t0: s.t0, t1: s.t1 }); }
      const ls = memLS(), n = vname(meta.id);
      const mode = await vault.write(n, { v: 1, mime: clip.mime, segs }, ls); // throws VaultInsecureError — nothing is written in plaintext
      const env = ls.getItem(n);
      let envOk = false; try { envOk = !!(vault.isEnvelope && vault.isEnvelope(JSON.parse(String(env)))); } catch (e) { envOk = false; }
      // even if some script switched LQVault to allowPlaintext, a clip is never stored unencrypted
      if (mode !== "enc" || !envOk) { const e = new Error("insecure"); /** @type {any} */ (e).code = "insecure"; throw e; }
      const t = now(), d = DAYS.includes(Number(days)) ? Number(days) : DEFAULTS.days;
      const rec = Object.assign(pickMeta(meta), { from: clip.from, to: clip.to, ms: clip.ms, size, mime: clip.mime, kept: t, exp: t + d * DAY, env });
      await getDb().put(rec);
      return pickMeta(rec);
    }
    async function load(id) {
      const d = getDb(); if (!d) return null;
      const rec = await d.get(id); if (!rec || !rec.env) return null;
      if (!(rec.exp > now())) { await del(id); return null; } // past its auto-delete date: deleted, never played
      const ls = memLS(), n = vname(id); ls.setItem(n, rec.env);
      const r = await vault.read(n, ls);
      if (r.state !== "enc" || !r.data || !Array.isArray(r.data.segs)) return { meta: pickMeta(rec), locked: true, segs: [] };
      const type = r.data.mime || rec.mime || "video/webm";
      return { meta: pickMeta(rec), locked: false, mime: type, segs: r.data.segs.map(s => ({ t0: s.t0, t1: s.t1, blob: new Blob([b64ToBytes(s.b)], { type }) })) };
    }
    async function del(id) {
      const d = getDb(); if (d) await d.del(id);
      try { await vault.wipe([vname(id)], memLS()); } catch (e) { /* key already gone */ }
      return true;
    }
    async function purge(t = now()) {
      const out = [];
      for (const m of await list()) if (!(m.exp > t)) { await del(m.id); out.push(m.id); }
      return out;
    }
    async function delAll() { const out = []; for (const m of await list()) { await del(m.id); out.push(m.id); } return out; }
    return { supported, save, list, load, del, delAll, purge, count: async () => (await list()).length };
  }

  /** auto-delete for exam pages that do not show clips (exam.html, exam-dashboard.html): runs only if the clip database
   * already exists on this origin (indexedDB.databases()), so a page never creates it */
  async function purgeDevice({ vault = root.LQVault, now = () => Date.now() } = {}) {
    try {
      if (!root.indexedDB || !vault || !vault.supported || !vault.supported()) return [];
      if (typeof root.indexedDB.databases === "function") {
        const dbs = await root.indexedDB.databases();
        if (!dbs.some(d => d && d.name === "lq-exam-clips")) return [];
      }
      return await createStore({ vault, now }).purge(now());
    } catch (e) { return []; }
  }

  /* ---------- invigilator PIN (UI gate for the kept-clip list on shared camera devices) ---------- */
  // localStorage "lq-exam-clip-pin" = {v, salt, h, fails, until}: PBKDF2-SHA-256 hash, never the PIN. This hides the list,
  // player, save-as-file and delete from candidates on a shared lab computer; it is not encryption (the clips themselves
  // are encrypted with LQVault). 5 wrong tries -> 60 s wait.
  const PIN_KEY = "lq-exam-clip-pin", PIN_RE = /^\d{4,8}$/;
  function createPin({ ls = root.localStorage, subtle = root.crypto && root.crypto.subtle, rand = n => root.crypto.getRandomValues(new Uint8Array(n)), now = () => Date.now() } = {}) {
    const get = () => { try { const o = JSON.parse(ls.getItem(PIN_KEY) || "null"); return o && typeof o.h === "string" && typeof o.salt === "string" ? o : null; } catch (e) { return null; } };
    const put = o => { try { ls.setItem(PIN_KEY, JSON.stringify(o)); return true; } catch (e) { return false; } };
    async function hash(pin, salt) {
      const k = await subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
      const bits = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64ToBytes(salt), iterations: 150000 }, k, 256);
      return bytesToB64(new Uint8Array(bits));
    }
    const valid = pin => PIN_RE.test(String(pin || ""));
    async function verify(pin) {
      const o = get(); if (!o || !subtle) return { ok: false, why: "none" };
      if (o.until && o.until > now()) return { ok: false, why: "wait", wait: o.until - now() };
      const ok = valid(pin) && (await hash(String(pin), o.salt)) === o.h;
      if (ok) { o.fails = 0; o.until = 0; put(o); return { ok: true }; }
      o.fails = (o.fails || 0) + 1; if (o.fails >= 5) { o.fails = 0; o.until = now() + 60000; }
      put(o); return { ok: false, why: o.until > now() ? "wait" : "wrong", wait: o.until > now() ? o.until - now() : 0 };
    }
    /** a new PIN; when one exists the old PIN is needed (a candidate cannot reset it) */
    async function set(pin, old) {
      if (!subtle || !valid(pin)) return { ok: false, why: "bad" };
      if (get()) { const v = await verify(old); if (!v.ok) return v; }
      const salt = bytesToB64(rand(16));
      return put({ v: 1, salt, h: await hash(String(pin), salt), fails: 0, until: 0 }) ? { ok: true } : { ok: false, why: "store" };
    }
    return { has: () => !!get(), set, verify, valid, KEY: PIN_KEY };
  }

  return { DAY, DAYS, DEFAULTS, MAX_KEPT, CLIP_SIGS, cleanCfg, cfgFromParams, wantsClip, pickSegs, createPending, createRing, ringSupported, pickMime,
    createStore, purgeDevice, createPin, memLS, blobToB64, b64ToBytes, bytesToB64 };
});
