/* lensiq-facevault.js — เก็บค่าลักษณะใบหน้า (face descriptor) แบบเข้ารหัสใน localStorage
 *
 * - เข้ารหัสด้วย WebCrypto AES-GCM 256 บิต ; กุญแจสร้างครั้งเดียวแบบ "ส่งออกไม่ได้" (extractable = false)
 *   และเก็บเป็น CryptoKey ใน IndexedDB "lensiq-vault" (สคริปต์อ่านค่ากุญแจดิบไม่ได้ ใช้ได้แค่เข้า/ถอดรหัสในเบราว์เซอร์นี้)
 * - ซองข้อมูลใน localStorage: {"enc":"lq1","iv":"<base64 12 ไบต์>","ct":"<base64>"} ; ชื่อคีย์ localStorage ใช้เป็น AAD
 *   (ย้ายซองไปคีย์อื่นจะถอดไม่ได้)
 * - ข้อมูลเดิมที่เป็นข้อความธรรมดา (ก่อนมีระบบนี้) อ่านได้ และถูกเข้ารหัสใหม่อัตโนมัติเมื่อบันทึก (splitLoad)
 * - ไม่มี crypto.subtle / IndexedDB / secure context (เช่นเปิดผ่าน http:// บนเครื่องอื่น, private mode บางแบบ):
 *   ค่าเริ่มต้น = "ปฏิเสธการเขียน" (โยน VaultInsecureError, state "insecure") — ไม่มีการเก็บค่าใบหน้าแบบไม่เข้ารหัส
 *   หน้าเว็บเรียก LQVault.enrollBlockReason() ก่อนเริ่มลงทะเบียนใบหน้า แล้วแสดงข้อความนั้นแทนปุ่มลงทะเบียน
 *   (โหมดเดิมที่เก็บ {"plain":"lq1","data":...} เปิดได้เฉพาะเมื่อตั้ง LQVault.configure({allowPlaintext:true}) เอง — ไม่แนะนำ)
 * - ข้อมูลเดิมที่ไม่เข้ารหัสยังอ่านได้ (ลบได้) แต่ไม่เขียนกลับแบบไม่เข้ารหัส
 * - ถอดรหัสไม่ได้ (กุญแจหาย เช่นล้าง IndexedDB) -> สถานะ "locked": ไม่ลบเอง ไม่เขียนทับ จนกว่าผู้ใช้กด "ลบข้อมูลใบหน้าทั้งหมด"
 *
 * เบราว์เซอร์: window.LQVault ; Node (ทดสอบ): require("./lensiq-facevault.js") แล้ว LQVault._setKeyStore(...)
 */
(function (root) {
  "use strict";
  const DB = "lensiq-vault", STORE = "keys", TAG = "lq1";
  const keyId = name => "face-v1:" + name; // กุญแจแยกต่อคีย์ข้อมูล: ลบของระบบหนึ่งไม่กระทบอีกระบบ
  const DAY = 86400000;

  class VaultLockedError extends Error {
    constructor(key) { super("ข้อมูลใบหน้าที่เข้ารหัสไว้ถอดรหัสไม่ได้ (กุญแจในเบราว์เซอร์นี้หายไป)"); this.name = "VaultLockedError"; this.key = key; }
  }
  const INSECURE_TH = "บันทึกข้อมูลใบหน้าไม่ได้: เบราว์เซอร์นี้เข้ารหัสไม่ได้ ต้องเปิดผ่าน https:// หรือ localhost และไม่ใช้โหมดส่วนตัวที่ปิด IndexedDB";
  /** เขียนไม่ได้เพราะไม่มี secure context / WebCrypto / IndexedDB (หรือเข้ารหัสล้มเหลว) — ไม่มีการเก็บแบบไม่เข้ารหัส */
  class VaultInsecureError extends Error {
    constructor(key, reason) { super(INSECURE_TH); this.name = "VaultInsecureError"; this.code = "insecure-context"; this.key = key; this.reason = reason || "insecure"; }
  }
  const cfg = { allowPlaintext: false };

  const subtle = () => (root.crypto && root.crypto.subtle) || null;
  const storage = () => { try { return root.localStorage || null; } catch { return null; } };

  // ---------- ที่เก็บกุญแจ (IndexedDB) — เปลี่ยนได้ในการทดสอบ ----------
  function idbOpen() {
    return new Promise((res, rej) => {
      const r = root.indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error("IndexedDB blocked"));
    });
  }
  function idbTx(mode, fn) {
    return idbOpen().then(db => new Promise((res, rej) => {
      const tx = db.transaction(STORE, mode), st = tx.objectStore(STORE);
      let out;
      Promise.resolve(fn(st, v => { out = v; })).catch(rej);
      tx.oncomplete = () => { db.close(); res(out); };
      tx.onerror = () => { db.close(); rej(tx.error); };
      tx.onabort = () => { db.close(); rej(tx.error || new Error("abort")); };
    }));
  }
  const idbStore = {
    get: id => idbTx("readonly", (st, set) => { const r = st.get(id); r.onsuccess = () => set(r.result || null); }),
    // add = ไม่เขียนทับกุญแจที่อีกแท็บสร้างไว้ก่อน (ConstraintError -> อ่านของเดิม)
    add: (id, key) => idbTx("readwrite", st => { st.add(key, id); }),
    del: id => idbTx("readwrite", st => { st.delete(id); }),
    clear: () => idbTx("readwrite", st => { st.clear(); })
  };
  let keyStore = null;
  const getKeyStore = () => keyStore || (root.indexedDB ? idbStore : null);

  function supported() {
    return !!(subtle() && getKeyStore() && (root.isSecureContext !== false));
  }
  /** เหตุผลที่เขียนแบบเข้ารหัสไม่ได้ ("insecure-context" | "no-webcrypto" | "no-indexeddb") หรือ null */
  function insecureReason() {
    if (root.isSecureContext === false) return "insecure-context";
    if (!subtle()) return "no-webcrypto";
    if (!getKeyStore()) return "no-indexeddb";
    return null;
  }
  /** ข้อความภาษาไทยให้หน้าเว็บแสดงแทนการลงทะเบียนใบหน้า หรือ null เมื่อพร้อม */
  function enrollBlockReason() {
    return supported() || cfg.allowPlaintext ? null : INSECURE_TH;
  }
  function configure(o) {
    if (o && typeof o.allowPlaintext === "boolean") cfg.allowPlaintext = o.allowPlaintext;
    return Object.assign({}, cfg);
  }

  const keyP = new Map(); // แคชกุญแจของหน้านี้ ต่อคีย์ข้อมูล
  async function getKey(name, create) {
    if (!supported()) return null;
    const id = keyId(name);
    if (keyP.has(id)) { const k = await keyP.get(id); if (k || !create) return k; }
    const ks = getKeyStore();
    const p = (async () => {
      let k = await ks.get(id);
      if (!k && create) {
        const fresh = await subtle().generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
        try { await ks.add(id, fresh); k = fresh; } catch { k = await ks.get(id); }
      }
      return k || null;
    })();
    keyP.set(id, p);
    try { return await p; } catch (e) { keyP.delete(id); throw e; }
  }

  const b64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return root.btoa ? root.btoa(s) : Buffer.from(s, "binary").toString("base64"); };
  const unb64 = s => { const bin = root.atob ? root.atob(s) : Buffer.from(s, "base64").toString("binary"); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const enc = new TextEncoder(), dec = new TextDecoder();

  async function seal(name, data, key) {
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(name) }, key, enc.encode(JSON.stringify(data)));
    return JSON.stringify({ enc: TAG, iv: b64(iv), ct: b64(new Uint8Array(ct)) });
  }

  const isEnvelope = o => !!(o && typeof o === "object" && o.enc === TAG && typeof o.iv === "string" && typeof o.ct === "string");
  const locked = new Set();

  /** อ่านคีย์ -> {data, state} ; state: "empty" | "enc" (ถอดรหัสแล้ว) | "plain" (ยังไม่เข้ารหัส) | "locked" */
  async function read(name, ls = storage()) {
    let raw = null;
    try { raw = ls && ls.getItem(name); } catch { raw = null; }
    if (raw == null) { locked.delete(name); return { data: null, state: "empty" }; }
    let o; try { o = JSON.parse(raw); } catch { o = undefined; }
    if (o === undefined) { locked.add(name); return { data: null, state: "locked" }; } // อ่านไม่ออก — ไม่แตะ
    if (isEnvelope(o)) {
      try {
        const key = await getKey(name, false);
        if (!key) throw new Error("no key");
        const pt = await subtle().decrypt({ name: "AES-GCM", iv: unb64(o.iv), additionalData: enc.encode(name) }, key, unb64(o.ct));
        locked.delete(name);
        return { data: JSON.parse(dec.decode(pt)), state: "enc" };
      } catch { locked.add(name); return { data: null, state: "locked" }; }
    }
    locked.delete(name);
    if (o && typeof o === "object" && o.plain === TAG) return { data: o.data, state: "plain" };
    return { data: o, state: "plain" }; // ข้อมูลรุ่นเก่า
  }

  /** เขียนคีย์ -> "enc" ("plain" เฉพาะเมื่อ configure({allowPlaintext:true})) ; คีย์ที่ถอดรหัสไม่ได้ (locked) ห้ามเขียนทับ เว้นแต่ {force:true}
   *  เข้ารหัสไม่ได้ -> โยน VaultInsecureError (e.code === "insecure-context") และไม่เขียนอะไรลง localStorage */
  async function write(name, data, ls = storage(), opts = {}) {
    if (locked.has(name) && !opts.force) throw new VaultLockedError(name);
    let out, mode;
    if (supported()) {
      try { out = await seal(name, data, await getKey(name, true)); mode = "enc"; } catch (e) {
        if (!cfg.allowPlaintext) throw new VaultInsecureError(name, "encrypt-failed");
        console.warn("LQVault: encrypt failed, storing unencrypted (allowPlaintext)", e);
      }
    } else if (!cfg.allowPlaintext) throw new VaultInsecureError(name, insecureReason());
    if (!out) { out = JSON.stringify({ plain: TAG, data }); mode = "plain"; }
    ls.setItem(name, out); // พื้นที่เต็ม = โยน error ให้ผู้เรียกแจ้งผู้ใช้
    locked.delete(name);
    return mode;
  }

  /** ลบคีย์ที่ระบุ + ลบกุญแจของคีย์นั้นใน IndexedDB (สำเนาซองเข้ารหัสที่ค้างอยู่ที่ใดก็ถอดไม่ได้อีก) */
  async function wipe(names, ls = storage()) {
    const ks = getKeyStore();
    for (const n of names) {
      try { ls && ls.removeItem(n); } catch {}
      locked.delete(n); keyP.delete(keyId(n));
      if (ks) { try { await ks.del(keyId(n)); } catch {} }
    }
  }

  // ---------- รูปแบบที่ใช้ร่วมกัน: ระเบียนข้อมูล (อ่านได้) + ค่าใบหน้าแยกไว้ในคีย์เข้ารหัส ----------
  const strip = (recs, field) => recs.map(r => { if (!r || typeof r !== "object" || !(field in r)) return r; const { [field]: _, ...rest } = r; return rest; });

  /**
   * โหลด metaKey (อาร์เรย์ระเบียน {id,...}) และค่าใบหน้าจาก vaultKey {v:1, faces:{id: number[]}}
   * แล้วแนบกลับเป็น rec[field] ในหน่วยความจำ ; ระเบียนรุ่นเก่าที่มี rec[field] ในคีย์ meta จะถูกย้ายเข้าคีย์เข้ารหัส
   * (เขียนคีย์เข้ารหัสสำเร็จก่อน จึงค่อยเขียน meta ที่ไม่มีค่าใบหน้า -> ไม่มีจังหวะที่ข้อมูลหาย)
   * คืน {records, state, migrated}
   */
  async function splitLoad(metaKey, vaultKey, field = "descriptor", ls = storage(), opts = {}) {
    let recs = [];
    try { recs = JSON.parse(ls.getItem(metaKey)); } catch { recs = []; }
    if (!Array.isArray(recs)) recs = [];
    const r = await read(vaultKey, ls);
    const faces = (r.data && typeof r.data === "object" && r.data.faces && typeof r.data.faces === "object") ? r.data.faces : {};
    let legacy = false, stamped = false;
    for (const rec of recs) {
      if (!rec || typeof rec !== "object") continue;
      if (Array.isArray(rec[field])) { legacy = true; if (r.state !== "locked") faces[rec.id] = rec[field]; }
      if (opts.stamp && !rec.created) { rec.created = opts.now || Date.now(); stamped = true; } // ระเบียนเก่าไม่มีวันสร้าง: เริ่มนับวันเก็บจากวันนี้
    }
    const ids = new Set(recs.map(x => x && x.id));
    let pruned = false;
    for (const id of Object.keys(faces)) if (!ids.has(id)) { delete faces[id]; pruned = true; } // ระเบียนถูกลบที่อื่น (เช่นล้างข้อมูลทั้งหมด)
    const records = recs.map(rec => {
      if (!rec || typeof rec !== "object") return rec;
      const o = Object.assign({}, rec); delete o[field]; // created ที่เพิ่งประทับก็อยู่ใน rec แล้ว
      if (Array.isArray(faces[rec.id])) o[field] = faces[rec.id];
      else if (Array.isArray(rec[field])) o[field] = rec[field]; // ซองเดิมถอดไม่ได้: ใช้ค่ารุ่นเก่าในหน่วยความจำต่อ (ไม่ย้าย)
      return o;
    });
    let state = r.state, migrated = false;
    const needEncrypt = r.state === "plain" && supported();
    const canWrite = supported() || cfg.allowPlaintext;
    if (!canWrite && (legacy || pruned)) {
      // เข้ารหัสไม่ได้: ไม่ย้ายค่าใบหน้ารุ่นเก่า (ไม่เขียนสำเนาไม่เข้ารหัสใหม่) — ใช้ในหน่วยความจำ แล้วเขียน meta ที่ประทับวันได้
      legacy = false; pruned = false;
    }
    if (r.state !== "locked" && (legacy || pruned || needEncrypt || stamped)) {
      try {
        if (legacy || pruned || needEncrypt) state = await write(vaultKey, { v: 1, faces }, ls);
        ls.setItem(metaKey, JSON.stringify(canWrite ? strip(recs, field) : recs)); // เขียนเข้ารหัสไม่ได้: ไม่ตัดค่ารุ่นเก่าทิ้ง (ไม่ทำข้อมูลหาย)
        migrated = legacy;
      } catch (e) { console.warn("LQVault: migration skipped", e); }
    }
    if (state === "empty") state = supported() ? "enc" : cfg.allowPlaintext ? "plain" : "insecure";
    else if (state === "plain" && !canWrite) state = "insecure";
    return { records, state, migrated };
  }

  /** บันทึกระเบียน: ค่าใบหน้าเข้ารหัสก่อน แล้วจึงเขียน meta ; faces:false = เขียนเฉพาะ meta (เช่นอัปเดต lastSeen) */
  async function splitSave(metaKey, vaultKey, records, field = "descriptor", ls = storage(), opts = {}) {
    let mode = null;
    if (opts.faces !== false) {
      const faces = {};
      for (const r of records) if (r && Array.isArray(r[field])) faces[r.id] = Array.from(r[field], x => +x);
      // ไม่มีค่าใบหน้าให้เก็บ + เข้ารหัสไม่ได้ (เช่นลบสมาชิกคนสุดท้ายบน http) -> ลบซองเดิมแทนการเขียน ไม่โยน error
      if (!Object.keys(faces).length && !supported() && !cfg.allowPlaintext) { try { ls.removeItem(vaultKey); } catch {} mode = "insecure"; }
      else mode = await write(vaultKey, { v: 1, faces }, ls);
    }
    ls.setItem(metaKey, JSON.stringify(strip(records, field)));
    return mode;
  }

  /** คิวเขียนตามลำดับ (เรียกแบบไม่ await ได้ ลำดับการเขียนไม่สลับกัน) */
  function queue() {
    let p = Promise.resolve();
    return fn => (p = p.then(fn, fn));
  }

  /** ระเบียนที่ไม่ได้ใช้เกิน days วัน (นับจาก lastSeen หรือ created) ; days <= 0 = ไม่หมดอายุ */
  function expired(records, days, now = Date.now(), field = "descriptor") {
    if (!(days > 0)) return [];
    return records.filter(r => r && Array.isArray(r[field]) && (now - (r.lastSeen || r.created || now)) > days * DAY).map(r => r.id);
  }

  /** round 11: ระเบียนที่จะหมดอายุภายใน withinDays วัน (ยังไม่หมด) -> [{id, daysLeft}] เรียงจากใกล้หมดก่อน — สำหรับป้ายแจ้งเตือน */
  function expiringSoon(records, days, withinDays = 30, now = Date.now(), field = "descriptor") {
    if (!(days > 0)) return [];
    return records.filter(r => r && Array.isArray(r[field])).map(r => ({ id: r.id, daysLeft: days - (now - (r.lastSeen || r.created || now)) / DAY }))
      .filter(x => x.daysLeft > 0 && x.daysLeft <= withinDays).map(x => ({ id: x.id, daysLeft: Math.ceil(x.daysLeft) })).sort((a, b) => a.daysLeft - b.daysLeft);
  }
  /** คีย์ข้อมูลชีวมิติที่รู้จักบนอุปกรณ์นี้: ค่าใบหน้าเข้ารหัส -> ระเบียนที่ใช้ไม่ได้อีกเมื่อไม่มีค่าใบหน้า (null = เก็บระเบียนไว้) */
  const BIOMETRIC_KEYS = Object.freeze({ "lqv-att-faces": "att-people", "lqv-cx-faces": null });
  /**
   * round 11 — "ลบข้อมูลชีวมิติทั้งหมดในเครื่องนี้" (admin): ลบค่าใบหน้าเข้ารหัสทุกคีย์ lqv-* ใน localStorage, ระเบียนผู้ลงทะเบียน
   * เช็คชื่อ (ไม่มีประโยชน์เมื่อไม่มีใบหน้า) และกุญแจทุกดอกใน IndexedDB (สำเนาซองที่ค้างอยู่ที่ใดก็ถอดไม่ได้อีก)
   * สมาชิกร้านและประวัติการสั่งยังอยู่ (ค้นหาด้วยชื่อได้) ; บันทึกการเข้าเรียนยังอยู่ -> คืนรายชื่อคีย์ที่ลบ
   */
  async function wipeAll(ls = storage()) {
    const names = new Set(Object.keys(BIOMETRIC_KEYS));
    try { if (ls) for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && /^lqv-/.test(k)) names.add(k); } } catch {}
    await wipe([...names], ls);
    for (const meta of Object.values(BIOMETRIC_KEYS)) if (meta) { try { ls && ls.removeItem(meta); } catch {} }
    const ks = getKeyStore();
    if (ks && typeof ks.clear === "function") { try { await ks.clear(); } catch {} }
    keyP.clear(); locked.clear();
    return [...names];
  }

  const RETENTION_CHOICES = [30, 90, 180, 365, 730];
  const STATE_TH = {
    enc: "ข้อมูลใบหน้าเข้ารหัส (AES-GCM) ด้วยกุญแจที่อยู่ในเบราว์เซอร์นี้เท่านั้น",
    plain: "เบราว์เซอร์นี้เข้ารหัสไม่ได้ (ต้องเปิดผ่าน https:// หรือ localhost) — ข้อมูลใบหน้าเก็บแบบไม่เข้ารหัส",
    insecure: INSECURE_TH,
    locked: "ข้อมูลใบหน้าเดิมถอดรหัสไม่ได้ (กุญแจในเบราว์เซอร์นี้หายไป) — กด \"ลบข้อมูลใบหน้าทั้งหมด\" เพื่อเริ่มใหม่"
  };

  const api = { supported, insecureReason, enrollBlockReason, configure, read, write, wipe, wipeAll, splitLoad, splitSave, queue, expired, expiringSoon, isEnvelope, BIOMETRIC_KEYS,
    VaultLockedError, VaultInsecureError, RETENTION_CHOICES, STATE_TH, DAY,
    _setKeyStore(ks) { keyStore = ks; keyP.clear(); }, _reset() { keyP.clear(); locked.clear(); cfg.allowPlaintext = false; } };
  root.LQVault = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
