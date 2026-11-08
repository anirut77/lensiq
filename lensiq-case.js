/* lensiq-case.js — LQCase: the pure logic behind case-review.html (case review of local video clips).
 *
 * NOT lie / deception detection. Nothing here looks at the pictures: no face, emotion, voice or "truthfulness" analysis.
 * A reviewer watches the clip and records what they saw (timestamp tags, notes, case status). Every action is an entry
 * in an APPEND-ONLY, HASH-CHAINED audit log; the case state (clips, tags, notes, status) is a replay of that log, so the
 * log is the single source of truth and an edited / removed entry breaks the chain (verify()).
 * LIMIT: the chain is unkeyed SHA-256, so it is TAMPER-EVIDENT against edits made outside this page (a hand-edited
 * localStorage value, a doctored export), NOT tamper-proof: anyone with the device can rebuild a whole consistent chain.
 * The real anchor is the head hash on a printed summary / an export kept elsewhere — compare against it. (A device
 * HMAC key would not change that — the page itself can still sign — and would stop exports verifying on other devices.)
 *
 *   entry = {seq, at (ISO), who, act, data, prev, hash}   hash = SHA-256(canon({seq, at, who, act, data, prev}))
 *   prev of entry 0 = GENESIS (64 zeros). Corrections never rewrite: tag.retract / note.amend are new entries.
 *
 * Storage (browser): case logs in localStorage "lqcase-cases" (text only, no media); clips are NOT stored unless the
 * reviewer opts in per clip — then CaseVault encrypts them (WebCrypto AES-GCM 256, non-extractable key in IndexedDB
 * "lensiq-case", same scheme as LQVault / lensiq-facevault.js but a separate key store, so "delete all face data"
 * elsewhere does not lock case clips and vice versa). Nothing is sent anywhere: no fetch / XHR / beacon in this file.
 *
 * Node (tests): const C = require("./lensiq-case.js") ; browser: window.LQCase
 */
(function (root) {
  "use strict";

  // ---------- SHA-256 (sync, FIPS 180-4; checked against node:crypto in tests/unit/case.test.js) ----------
  const frac = (x) => ((x - Math.floor(x)) * 0x100000000) >>> 0;
  const PRIMES = []; for (let n = 2; PRIMES.length < 64; n++) if (PRIMES.every(p => n % p)) PRIMES.push(n);
  const K = new Uint32Array(PRIMES.map(p => frac(Math.cbrt(p))));
  const H0 = PRIMES.slice(0, 8).map(p => frac(Math.sqrt(p)));
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const utf8 = s => new TextEncoder().encode(String(s));

  /** @param {string|Uint8Array} input @returns {string} lowercase hex */
  function sha256Hex(input) {
    const bytes = typeof input === "string" ? utf8(input) : input;
    const l = bytes.length, n = Math.ceil((l + 9) / 64) * 64;
    const buf = new Uint8Array(n); buf.set(bytes); buf[l] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(n - 8, Math.floor(l / 0x20000000)); dv.setUint32(n - 4, (l * 8) >>> 0);
    const h = H0.slice(), w = new Uint32Array(64);
    for (let off = 0; off < n; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15], b = w[i - 2];
        w[i] = (w[i - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[i - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) | 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    return h.map(x => (x >>> 0).toString(16).padStart(8, "0")).join("");
  }

  /** Canonical JSON: object keys sorted, undefined dropped — the exact bytes that are hashed. */
  function canon(v) {
    if (v === undefined || v === null || typeof v === "number" && !isFinite(v)) return "null";
    if (typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    return "{" + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  }

  const GENESIS = "0".repeat(64);
  const STATUS = ["open", "review", "closed"];
  // what a reviewer can tag: observable facts only — no "suspicious", "nervous", "lying" or any judgement of a person
  const TAG_KINDS = [
    { id: "event", th: "เหตุการณ์ที่เห็นในคลิป" },
    { id: "statement", th: "ช่วงที่มีการพูด / ถ้อยคำสำคัญ" },
    { id: "object", th: "เอกสาร / สิ่งของที่ปรากฏ" },
    { id: "enter", th: "มีคนเข้า / ออกจากภาพ" },
    { id: "quality", th: "ภาพหรือเสียงไม่ชัด" },
    { id: "recheck", th: "ควรให้อีกคนตรวจซ้ำ" },
    { id: "other", th: "อื่น ๆ" }
  ];
  const ACTS = ["case.create", "case.edit", "status", "clip.add", "clip.attach", "clip.store", "clip.unstore", "clip.purge",
    "tag.add", "tag.retract", "note.add", "note.amend", "export", "import"];
  const LIMITS = { who: 80, title: 120, ref: 60, text: 2000, name: 200 };

  const rnd = () => {
    const c = root.crypto;
    if (c && c.getRandomValues) return Array.from(c.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, "0")).join("");
    return Math.random().toString(16).slice(2, 14).padEnd(12, "0");
  };
  const newId = (p) => p + "-" + rnd();
  const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);

  class CaseError extends Error { constructor(code, msg) { super(msg || code); this.name = "CaseError"; this.code = code; } }

  const body = e => ({ seq: e.seq, at: e.at, who: e.who, act: e.act, data: e.data, prev: e.prev });
  const hashOf = e => sha256Hex(canon(body(e)));

  /** New entry chained to the end of `log` (log is not mutated). */
  function makeEntry(log, { who, act, data, at }) {
    const w = clean(who, LIMITS.who);
    if (!w) throw new CaseError("no-reviewer", "reviewer name required");
    if (ACTS.indexOf(act) < 0) throw new CaseError("bad-act", "unknown action " + act);
    const last = log.length ? log[log.length - 1] : null;
    const e = { seq: log.length, at: new Date(at == null ? Date.now() : at).toISOString(), who: w, act, data: JSON.parse(JSON.stringify(data || {})), prev: last ? last.hash : GENESIS };
    e.hash = hashOf(e);
    return e;
  }

  /** Re-computes the whole chain. ok=false names the first bad entry (edited, removed, re-ordered or inserted). */
  function verify(log) {
    const warnings = [];
    if (!Array.isArray(log)) return { ok: false, n: 0, head: null, brokenAt: 0, reason: "not-a-log", warnings };
    let prev = GENESIS, prevAt = 0;
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      if (!e || typeof e !== "object") return { ok: false, n: log.length, head: null, brokenAt: i, reason: "not-an-entry", warnings };
      if (e.seq !== i) return { ok: false, n: log.length, head: null, brokenAt: i, reason: "seq", warnings };
      if (e.prev !== prev) return { ok: false, n: log.length, head: null, brokenAt: i, reason: "prev", warnings };
      if (e.hash !== hashOf(e)) return { ok: false, n: log.length, head: null, brokenAt: i, reason: "hash", warnings };
      const t = Date.parse(e.at);
      if (!isFinite(t)) return { ok: false, n: log.length, head: null, brokenAt: i, reason: "time", warnings };
      if (t < prevAt) warnings.push({ seq: i, code: "clock-back" }); // device clock moved back: shown, not fatal
      prevAt = t; prev = e.hash;
    }
    if (log.length && log[0].act !== "case.create") return { ok: false, n: log.length, head: null, brokenAt: 0, reason: "first", warnings };
    return { ok: true, n: log.length, head: log.length ? prev : null, brokenAt: -1, reason: null, warnings };
  }

  /** tag.add / note.add made while the loaded file is NOT the clip's original (mismatch) or could not be checked */
  const loadedOf = d => (d.loaded && typeof d.loaded === "object" ? { sha256: d.loaded.sha256 || null, match: d.loaded.match === false ? false : null } : null);
  /** -> {sha256: hex|null, match: false|null} | undefined (undefined = the original file is loaded, nothing recorded) */
  const cleanLoaded = l => (l && typeof l === "object" && l.match !== true ? { sha256: /^[0-9a-f]{64}$/.test(l.sha256 || "") ? l.sha256 : null, match: l.match === false ? false : null } : undefined);

  /** Case state = fold of the log. Unknown / malformed entries are skipped (verify() reports integrity). */
  function replay(log) {
    const s = { id: null, title: "", ref: "", status: "open", createdAt: null, createdBy: null, updatedAt: null,
      clips: [], tags: [], notes: [], reviewers: [], exports: 0 };
    const clip = id => s.clips.find(c => c.id === id);
    for (const e of log || []) {
      const d = e && e.data || {};
      if (e && e.who && s.reviewers.indexOf(e.who) < 0) s.reviewers.push(e.who);
      if (e) s.updatedAt = e.at;
      switch (e && e.act) {
        case "case.create": s.id = d.id; s.title = d.title || ""; s.ref = d.ref || ""; s.createdAt = e.at; s.createdBy = e.who; break;
        case "case.edit": if (d.title != null) s.title = d.title; if (d.ref != null) s.ref = d.ref; break;
        case "status": if (STATUS.indexOf(d.to) >= 0) s.status = d.to; break;
        case "clip.add": if (d.clip && !clip(d.clip.id)) s.clips.push(Object.assign({ stored: false, addedBy: e.who, addedAt: e.at, attachments: [] }, d.clip)); break;
        case "clip.attach": { const c = clip(d.clipId); if (c) c.attachments.push({ at: e.at, who: e.who, match: d.match == null ? null : !!d.match, sha256: d.sha256 || null }); break; }
        case "clip.store": { const c = clip(d.clipId); if (c) c.stored = true; break; }
        case "clip.unstore": case "clip.purge": { const c = clip(d.clipId); if (c) c.stored = false; break; }
        case "tag.add": s.tags.push({ id: d.id, clipId: d.clipId, t: +d.t || 0, kind: d.kind, text: d.text || "", by: e.who, at: e.at, retracted: null, loaded: loadedOf(d) }); break;
        case "tag.retract": { const t = s.tags.find(x => x.id === d.id); if (t && !t.retracted) t.retracted = { by: e.who, at: e.at, reason: d.reason || "" }; break; }
        case "note.add": s.notes.push({ id: d.id, text: d.text || "", clipId: d.clipId || null, t: d.t == null ? null : +d.t, by: e.who, at: e.at, amends: null, amendedBy: null, loaded: loadedOf(d) }); break;
        case "note.amend": {
          const o = s.notes.find(x => x.id === d.of);
          s.notes.push({ id: d.id, text: d.text || "", clipId: o ? o.clipId : null, t: o ? o.t : null, by: e.who, at: e.at, amends: d.of, amendedBy: null });
          if (o) o.amendedBy = d.id;
          break;
        }
        case "export": s.exports++; break;
        default: break;
      }
    }
    s.tags.sort((a, b) => (a.clipId === b.clipId ? a.t - b.t : 0));
    return s;
  }

  /**
   * Validated action on a case log -> new log (input not mutated). Throws CaseError:
   *   opts.at = timestamp (tests). Codes: no-reviewer, bad-act, closed (case closed: reopen first), no-clip, no-tag, no-note, bad-status, empty, broken (chain broken)
   */
  function act(log, who, a, data, opts) {
    data = Object.assign({}, data || {});
    if (!log.length && a !== "case.create") throw new CaseError("bad-act", "first entry must create the case");
    if (log.length) { const v = verify(log); if (!v.ok) throw new CaseError("broken", "audit log integrity check failed at entry " + v.brokenAt); }
    const s = replay(log);
    const editing = ["tag.add", "tag.retract", "note.add", "note.amend", "clip.add", "case.edit"].indexOf(a) >= 0;
    if (editing && s.status === "closed") throw new CaseError("closed", "case is closed");
    switch (a) {
      case "case.create":
        if (log.length) throw new CaseError("bad-act", "case already created");
        data = { id: data.id || newId("c"), title: clean(data.title, LIMITS.title), ref: clean(data.ref, LIMITS.ref) };
        if (!data.title) throw new CaseError("empty", "title required");
        break;
      case "case.edit": data = { title: data.title == null ? undefined : clean(data.title, LIMITS.title), ref: data.ref == null ? undefined : clean(data.ref, LIMITS.ref) }; break;
      case "status":
        if (STATUS.indexOf(data.to) < 0) throw new CaseError("bad-status", "unknown status");
        if (data.to === s.status) throw new CaseError("bad-status", "already " + s.status);
        data = { from: s.status, to: data.to, reason: clean(data.reason, LIMITS.text) || undefined };
        break;
      case "clip.add": {
        const c = data.clip || {};
        data = { clip: { id: c.id || newId("v"), name: clean(c.name, LIMITS.name) || "clip", size: Math.max(0, +c.size || 0), type: clean(c.type, 60),
          sha256: /^[0-9a-f]{64}$/.test(c.sha256 || "") ? c.sha256 : null, dur: c.dur > 0 ? Math.round(c.dur * 10) / 10 : null } };
        break;
      }
      case "clip.attach":
        if (!s.clips.some(c => c.id === data.clipId)) throw new CaseError("no-clip", "unknown clip");
        // match: true = same fingerprint, false = different file, null = could not be verified (too large / no hash)
        data = { clipId: data.clipId, sha256: /^[0-9a-f]{64}$/.test(data.sha256 || "") ? data.sha256 : null, match: data.match == null ? null : !!data.match };
        break;
      case "clip.store": case "clip.unstore": case "clip.purge":
        if (!s.clips.some(c => c.id === data.clipId)) throw new CaseError("no-clip", "unknown clip");
        break;
      case "tag.add": {
        if (!s.clips.some(c => c.id === data.clipId)) throw new CaseError("no-clip", "unknown clip");
        const kind = TAG_KINDS.some(k => k.id === data.kind) ? data.kind : "other";
        data = { id: data.id || newId("t"), clipId: data.clipId, t: Math.max(0, Math.round((+data.t || 0) * 10) / 10), kind, text: clean(data.text, LIMITS.text), loaded: cleanLoaded(data.loaded) };
        break;
      }
      case "tag.retract": {
        const t = s.tags.find(x => x.id === data.id);
        if (!t || t.retracted) throw new CaseError("no-tag", "unknown or already retracted tag");
        data = { id: data.id, reason: clean(data.reason, LIMITS.text) };
        break;
      }
      case "note.add": {
        const text = clean(data.text, LIMITS.text);
        if (!text) throw new CaseError("empty", "note text required");
        data = { id: data.id || newId("n"), text, clipId: data.clipId || undefined, t: data.t == null || data.t === "" ? undefined : Math.max(0, +data.t || 0),
          loaded: data.clipId ? cleanLoaded(data.loaded) : undefined };
        break;
      }
      case "note.amend": {
        const o = s.notes.find(x => x.id === data.of);
        if (!o || o.amendedBy) throw new CaseError("no-note", "unknown note or already amended");
        const text = clean(data.text, LIMITS.text);
        if (!text) throw new CaseError("empty", "note text required");
        data = { id: data.id || newId("n"), of: data.of, text };
        break;
      }
      case "export": data = { fmt: ["csv", "json", "print"].indexOf(data.fmt) >= 0 ? data.fmt : "other" }; break;
      case "import": data = { file: clean(data.file, LIMITS.name), n: +data.n || 0 }; break;
      default: throw new CaseError("bad-act", "unknown action " + a);
    }
    return log.concat([makeEntry(log, { who, act: a, data, at: opts && opts.at })]);
  }

  // ---------- time / formatting ----------
  function fmtTime(sec) {
    sec = Math.max(0, +sec || 0);
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = Math.floor(sec % 60), d = Math.floor(sec * 10 % 10);
    const mmss = String(m).padStart(h ? 2 : 1, "0") + ":" + String(s).padStart(2, "0") + (d ? "." + d : "");
    return h ? h + ":" + mmss : mmss;
  }
  /** "83", "1:23", "01:23.5", "1:02:03" -> seconds, or null */
  function parseTime(str) {
    const s = String(str == null ? "" : str).trim().replace(",", ".");
    if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(s)) return null;
    const parts = s.split(":").map(Number);
    if (parts.slice(1).some(p => p >= 60)) return null;
    return parts.reduce((a, p) => a * 60 + p, 0);
  }
  const short = h => (h ? String(h).slice(0, 12) : "—");

  // ---------- exports ----------
  /** Spreadsheet-safe CSV cell: quotes, and a leading = + - @ (formula injection) is neutralised with an apostrophe. */
  function csvCell(v) {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  /** labels: {head: [9 column names], act(code)->label, detail(entry)->text} */
  function toCSV(log, labels) {
    const L = labels || {};
    const head = L.head || ["seq", "time_utc", "reviewer", "action", "action_label", "detail", "data_json", "prev_hash", "hash"];
    const rows = [head].concat((log || []).map(e => [e.seq, e.at, e.who, e.act, L.act ? L.act(e.act) : e.act, L.detail ? L.detail(e) : "", canon(e.data), e.prev, e.hash]));
    return "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }
  const FORMAT = "lensiq-case-audit/1";
  function toJSON(log, extra) {
    const s = replay(log), v = verify(log);
    return Object.assign({ format: FORMAT, exportedAt: new Date().toISOString(),
      note: "Hash-chained audit log: hash = SHA-256(canonical JSON of {seq, at, who, act, data, prev}); prev of entry 0 = 64 zeros. Video is not included.",
      case: { id: s.id, title: s.title, ref: s.ref, status: s.status }, integrity: { ok: v.ok, entries: v.n, head: v.head }, log }, extra || {});
  }
  /** Parsed export -> {ok, log, reason} (chain re-verified; nothing is trusted from the file's own "integrity" field). */
  function fromJSON(obj) {
    if (!obj || obj.format !== FORMAT || !Array.isArray(obj.log)) return { ok: false, log: null, reason: "format" };
    const log = obj.log.map(e => e && ({ seq: e.seq, at: e.at, who: e.who, act: e.act, data: e.data, prev: e.prev, hash: e.hash }));
    const v = verify(log);
    if (!v.ok || !log.length) return { ok: false, log: null, reason: v.reason || "empty", brokenAt: v.brokenAt };
    // a chain can be valid yet carry no usable case (crafted file): require a case id and title on entry 0
    const d0 = log[0].data;
    if (!d0 || typeof d0 !== "object" || Array.isArray(d0) || typeof d0.id !== "string" || !d0.id.trim() || d0.id.length > 80
      || typeof d0.title !== "string" || !d0.title.trim()) return { ok: false, log: null, reason: "format" };
    return { ok: true, log, reason: null };
  }

  // ---------- local store (localStorage; text only) ----------
  const KEY = "lqcase-cases", LEDGER = "lqcase-ledger";
  function createStore(ls) {
    const get = (k, d) => { try { const r = ls && ls.getItem(k); return r ? JSON.parse(r) : d; } catch { return d; } };
    const set = (k, v) => { ls.setItem(k, JSON.stringify(v)); }; // quota errors propagate to the page (message shown)
    const ledgerEntry = (who, a, data) => {
      const led = get(LEDGER, []);
      const e = { seq: led.length, at: new Date().toISOString(), who: clean(who, LIMITS.who) || "?", act: a, data: JSON.parse(JSON.stringify(data || {})), prev: led.length ? led[led.length - 1].hash : GENESIS };
      e.hash = hashOf(e);
      return e;
    };
    const all = () => { const o = get(KEY, null); return o && Array.isArray(o.cases) ? o.cases : []; };
    return {
      list: () => all().map(c => ({ id: c.id, log: c.log })),
      get: id => { const c = all().find(x => x.id === id); return c ? c.log : null; },
      /** append-only write: the stored log must be a prefix of the new one (another tab's newer entries are never lost) */
      put(id, log) {
        const cases = all(), i = cases.findIndex(c => c.id === id);
        if (i >= 0) {
          const old = cases[i].log || [];
          if (old.length > log.length || old.some((e, k) => !log[k] || log[k].hash !== e.hash)) throw new CaseError("conflict", "the case changed in another tab");
          cases[i] = { id, log };
        } else cases.push({ id, log });
        set(KEY, { v: 1, cases });
      },
      /** erasure: the case disappears; a hash-chained device ledger keeps who deleted which case id when, and its head hash */
      remove(id, who) {
        const cases = all(), c = cases.find(x => x.id === id);
        if (!c) return false;
        const v = verify(c.log);
        const e = ledgerEntry(who, "case.delete", { id, entries: c.log.length, head: v.head, intact: v.ok });
        set(KEY, { v: 1, cases: cases.filter(x => x.id !== id) });
        set(LEDGER, get(LEDGER, []).concat([e]));
        return true;
      },
      /** device-level event that belongs to no case log (retention change, a purge whose case log could not take the entry) */
      note(who, a, data) { set(LEDGER, get(LEDGER, []).concat([ledgerEntry(who, a, data)])); },
      ledger: () => get(LEDGER, []),
      wipe() { try { ls.removeItem(KEY); ls.removeItem(LEDGER); } catch {} }
    };
  }

  // ---------- encrypted clip vault (browser: IndexedDB + WebCrypto) ----------
  const DB = "lensiq-case", KEY_ID = "case-clips-v1";
  function createVault(idb, subtle) {
    idb = idb || root.indexedDB; subtle = subtle || (root.crypto && root.crypto.subtle);
    const reason = () => (root.isSecureContext === false ? "insecure-context" : !subtle ? "no-webcrypto" : !idb ? "no-indexeddb" : null);
    const open = () => new Promise((res, rej) => {
      const r = idb.open(DB, 1);
      r.onupgradeneeded = () => { for (const s of ["keys", "blobs", "meta"]) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error("IndexedDB blocked"));
    });
    const tx = (stores, mode, fn) => open().then(db => new Promise((res, rej) => {
      const t = db.transaction(stores, mode); let out;
      fn(stores.map(s => t.objectStore(s)), v => { out = v; });
      t.oncomplete = () => { db.close(); res(out); }; t.onerror = () => { db.close(); rej(t.error); }; t.onabort = () => { db.close(); rej(t.error || new Error("abort")); };
    }));
    const req = (r, set, map) => { r.onsuccess = () => set(map ? map(r.result) : r.result); };
    let keyP = null;
    function key() {
      if (!keyP) keyP = (async () => {
        let k = await tx(["keys"], "readonly", ([st], set) => req(st.get(KEY_ID), set));
        if (!k) {
          const fresh = await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
          try { await tx(["keys"], "readwrite", ([st]) => { st.add(fresh, KEY_ID); }); k = fresh; } catch { k = await tx(["keys"], "readonly", ([st], set) => req(st.get(KEY_ID), set)); }
        }
        return k;
      })().catch(e => { keyP = null; throw e; });
      return keyP;
    }
    const aad = (caseId, clipId) => utf8("lqcase:" + caseId + ":" + clipId);
    return {
      reason, supported: () => !reason(),
      async put(caseId, clipId, blob, meta) {
        if (reason()) throw new CaseError("insecure", reason());
        const iv = root.crypto.getRandomValues(new Uint8Array(12));
        const ct = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(caseId, clipId) }, await key(), await blob.arrayBuffer());
        const m = { caseId, clipId, name: meta && meta.name || "", type: blob.type || "", size: blob.size, storedAt: Date.now() };
        await tx(["blobs", "meta"], "readwrite", ([b, mt]) => { b.put({ iv, ct }, clipId); mt.put(m, clipId); });
        return m;
      },
      /** -> Blob, or null when not stored; throws when the key is gone (cannot decrypt) */
      async get(caseId, clipId) {
        if (reason()) return null;
        const rec = await tx(["blobs", "meta"], "readonly", ([b, mt], set) => {
          const out = {}; req(b.get(clipId), v => { out.b = v; set(out); }); req(mt.get(clipId), v => { out.m = v; set(out); });
        });
        if (!rec || !rec.b || !rec.m) return null;
        const pt = await subtle.decrypt({ name: "AES-GCM", iv: rec.b.iv, additionalData: aad(caseId, clipId) }, await key(), rec.b.ct);
        return new Blob([pt], { type: rec.m.type });
      },
      async del(clipIds) { if (reason()) return; await tx(["blobs", "meta"], "readwrite", ([b, mt]) => { for (const id of clipIds) { b.delete(id); mt.delete(id); } }); },
      async meta() { if (reason()) return []; return tx(["meta"], "readonly", ([mt], set) => req(mt.getAll(), set)); },
      /** stored clips older than `days` -> their meta records (the page deletes them and logs clip.purge) */
      async expired(days, now) { const lim = (now || Date.now()) - days * 86400000; return (await this.meta()).filter(m => m.storedAt < lim); },
      wipe: () => new Promise(res => { keyP = null; if (!idb) return res(false); const r = idb.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res(true); })
    };
  }

  /** Largest file hashed in memory: WebCrypto digest needs the whole file as one ArrayBuffer, so phones / low-memory
   *  devices stop at 256 MB (a 1 GB arrayBuffer() can kill a mobile tab). Larger files are recorded "unverified". */
  function hashLimit() {
    const n = /** @type {any} */ (root.navigator || {}), mm = root.matchMedia;
    const small = (n.deviceMemory && n.deviceMemory <= 4) || (mm && mm("(pointer: coarse)").matches);
    return (small ? 256 : 1024) * 1024 * 1024;
  }
  /** SHA-256 of a File/Blob for the clip fingerprint (WebCrypto when present; sync fallback up to 64 MB) -> hex | null */
  async function fileHash(blob, maxBytes) {
    const max = maxBytes || hashLimit();
    if (!blob || blob.size > max) return null;
    const buf = await blob.arrayBuffer(), subtle = root.crypto && root.crypto.subtle;
    if (subtle) { const d = new Uint8Array(await subtle.digest("SHA-256", buf)); return Array.from(d, b => b.toString(16).padStart(2, "0")).join(""); }
    return blob.size <= 64 * 1024 * 1024 ? sha256Hex(new Uint8Array(buf)) : null;
  }

  const RETENTION_DAYS = [7, 30, 90, 180, 365];
  const api = { sha256Hex, canon, GENESIS, STATUS, TAG_KINDS, ACTS, LIMITS, RETENTION_DAYS, FORMAT, CaseError,
    makeEntry, verify, replay, act, fmtTime, parseTime, short, csvCell, toCSV, toJSON, fromJSON, createStore, createVault, fileHash, hashLimit, newId };
  root.LQCase = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
