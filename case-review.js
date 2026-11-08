/* case-review.js — case-review.html: review local video clips as a case — timestamp tags, notes, reviewer name on every
 * action, case status, append-only hash-chained audit log (LQCase, lensiq-case.js), CSV / JSON export, printable summary.
 * NOT lie / deception detection: this page never analyses the video (no AI, no faces, no emotion, no voice). The
 * reviewer watches and records; the tool only keeps the record honest (who / what / when, tamper-evident).
 * Clips come from <input type=file> and stay on the device (object URLs). They are kept only when the reviewer taps
 * "store encrypted on this device" (LQCase.createVault: IndexedDB + AES-GCM), and auto-deleted after N days (checked
 * when this page is opened, so a clip past retention is removed on the next visit).
 * The hash chain is tamper-evident against edits made outside this page, not tamper-proof: see lensiq-case.js header.
 * Test hook: window.__LQCASE.
 */
(function () {
  "use strict";
  const W = /** @type {any} */ (window);
  const C = W.LQCase;
  const $ = id => document.getElementById(id);
  const T = (key, thai, vars) => W.LQI18N ? W.LQI18N.tf(key, thai, vars) : String(thai).replace(/\{(\w+)\}/g, (m, k) => vars && vars[k] != null ? vars[k] : m);
  const LS = (() => { try { return window.localStorage; } catch { return null; } })();
  const lsGet = (k, d) => { try { const v = LS && LS.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const lsSet = (k, v) => { try { LS && LS.setItem(k, JSON.stringify(v)); } catch {} };
  const store = C.createStore(LS), vault = C.createVault();
  const SYSTEM = "LENSIQ (auto)";

  let cur = null, log = [], active = null;
  const urls = new Map(), blobs = new Map();
  /** clipId -> {sha256, match:false|null} while the loaded file is NOT the verified original (different / unverifiable) */
  const loadedState = new Map();

  // ---------- labels ----------
  const locale = () => ({ en: "en-GB", zh: "zh-CN" })[W.LQI18N && W.LQI18N.lang] || "th-TH";
  const fmtDate = iso => { const d = new Date(iso); return isFinite(+d) ? d.toLocaleString(locale()) : "—"; };
  const fmtMB = n => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + " MB";
  const STATUS_L = () => ({ open: T("cr.st.open", "เปิด"), review: T("cr.st.review", "กำลังทบทวน"), closed: T("cr.st.closed", "ปิดแล้ว") });
  const KIND_L = () => ({
    event: T("cr.kind.event", "เหตุการณ์ที่เห็นในคลิป"), statement: T("cr.kind.statement", "ช่วงที่มีการพูด / ถ้อยคำสำคัญ"),
    object: T("cr.kind.object", "เอกสาร / สิ่งของที่ปรากฏ"), enter: T("cr.kind.enter", "มีคนเข้า / ออกจากภาพ"),
    quality: T("cr.kind.quality", "ภาพหรือเสียงไม่ชัด"), recheck: T("cr.kind.recheck", "ควรให้อีกคนตรวจซ้ำ"), other: T("cr.kind.other", "อื่น ๆ")
  });
  const ACT_L = () => ({
    "case.create": T("cr.act.create", "เปิดเคส"), "case.edit": T("cr.act.edit", "แก้ชื่อเคส"), status: T("cr.act.status", "เปลี่ยนสถานะ"),
    "clip.add": T("cr.act.clipAdd", "เพิ่มคลิป"), "clip.attach": T("cr.act.clipAttach", "เปิดไฟล์คลิปอีกครั้ง"),
    "clip.store": T("cr.act.clipStore", "เก็บคลิปแบบเข้ารหัส"), "clip.unstore": T("cr.act.clipUnstore", "ลบสำเนาคลิปที่เก็บไว้"),
    "clip.purge": T("cr.act.clipPurge", "ลบคลิปอัตโนมัติ (ครบกำหนด)"), "tag.add": T("cr.act.tagAdd", "ใส่แท็ก"),
    "tag.retract": T("cr.act.tagRetract", "ถอนแท็ก"), "note.add": T("cr.act.noteAdd", "เพิ่มบันทึก"), "note.amend": T("cr.act.noteAmend", "แก้บันทึก (ฉบับใหม่)"),
    export: T("cr.act.export", "ส่งออก"), import: T("cr.act.import", "นำเข้าเคส")
  });
  const ERR = e => {
    const code = e && e.code;
    if (code === "no-reviewer") return T("cr.err.who", "กรอกชื่อผู้ตรวจก่อน (บันทึกไว้กับทุกการกระทำ)");
    if (code === "closed") return T("cr.err.closed", "เคสปิดแล้ว กด \"เปิดเคส / เปิดใหม่\" ก่อนแก้ไข");
    if (code === "broken") return T("cr.err.broken", "บันทึกตรวจสอบของเคสนี้ไม่ครบถ้วน (มีการแก้ไขข้อมูลในเครื่อง) ดูและส่งออกได้ แต่เพิ่มรายการไม่ได้");
    if (code === "conflict") return T("cr.err.conflict", "เคสนี้ถูกแก้ในอีกแท็บ โหลดข้อมูลล่าสุดแล้ว ลองอีกครั้ง");
    if (code === "empty") return T("cr.err.empty", "กรอกข้อความก่อน");
    if (code === "bad-status") return T("cr.err.status", "เคสอยู่ในสถานะนี้แล้ว");
    if (e && e.name === "QuotaExceededError") return T("cr.err.quota", "พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม ส่งออกแล้วลบเคสเก่าก่อน");
    return T("cr.err.other", "ทำรายการไม่สำเร็จ");
  };
  const state = () => C.replay(log);
  const clipName = (s, id) => { const c = s.clips.find(x => x.id === id); return c ? c.name : "?"; };
  /** a tag / note made while the open file was not the verified original: say so wherever it is shown */
  const loadedNote = (l, sep) => !l ? "" : sep + (l.match === false
    ? T("cr.d.otherFile", "ทำขณะเปิดไฟล์ที่ไม่ใช่ไฟล์เดิม (SHA-256 {h})", { h: C.short(l.sha256) })
    : T("cr.d.unverFile", "ทำขณะเปิดไฟล์ที่ยืนยันไม่ได้ว่าเป็นไฟล์เดิม"));
  function detail(e, s) { try { return detail0(e, s); } catch { return ""; } } // imported logs may carry odd data
  function detail0(e, s) {
    const d = e.data || {}, K = KIND_L(), S = STATUS_L();
    switch (e.act) {
      case "case.create": return d.title + (d.ref ? " · " + d.ref : "");
      case "case.edit": return [d.title, d.ref].filter(Boolean).join(" · ");
      case "status": return (S[d.from] || d.from) + " → " + (S[d.to] || d.to) + (d.reason ? " · " + d.reason : "");
      case "clip.add": return d.clip.name + " · " + fmtMB(d.clip.size) + " · SHA-256 " + C.short(d.clip.sha256);
      case "clip.attach": return clipName(s, d.clipId) + " · " + (d.match ? T("cr.d.match", "ตรงกับไฟล์เดิม") : d.match === false ? T("cr.d.nomatch", "ไม่ตรงกับไฟล์เดิม")
        : T("cr.d.unverified", "ยืนยันไม่ได้ว่าเป็นไฟล์เดิม (ไม่ได้คำนวณลายนิ้วมือ)")) + (d.sha256 ? " · SHA-256 " + C.short(d.sha256) : "");
      case "clip.store": case "clip.unstore": case "clip.purge": return clipName(s, d.clipId);
      case "tag.add": return clipName(s, d.clipId) + " @ " + C.fmtTime(d.t) + " · " + (K[d.kind] || d.kind) + (d.text ? " · " + d.text : "") + loadedNote(d.loaded, " · ");
      case "tag.retract": { const t = s.tags.find(x => x.id === d.id); return (t ? C.fmtTime(t.t) + " · " + (K[t.kind] || t.kind) : d.id) + (d.reason ? " · " + d.reason : ""); }
      case "note.add": case "note.amend": return (d.text.length > 120 ? d.text.slice(0, 120) + "…" : d.text) + loadedNote(d.loaded, " · ");
      case "export": return d.fmt.toUpperCase();
      case "import": return d.file + " · " + d.n;
      default: return "";
    }
  }

  // ---------- small DOM helpers ----------
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const user = text => { const s = el("span", "cr-u", text); s.setAttribute("translate", "no"); return s; }; // user-entered content: never machine-translated
  const wrap = (tag, cls, child) => { const n = el(tag, cls); n.append(child); return n; };
  const btn = (cls, text, fn) => { const b = el("button", "btn " + cls, text); b.type = "button"; b.addEventListener("click", fn); return b; };
  /** two-step confirm without window.confirm(): first tap arms the button for 5 s; the prompt is also written to the
   *  role=status line `msgId` so screen readers hear it */
  function confirm2(b, label, fn, msgId) {
    if (b.dataset.armed === "1") { b.dataset.armed = ""; fn(); return; }
    const orig = b.textContent; b.dataset.armed = "1"; b.textContent = label;
    if (msgId) msg(msgId, label);
    setTimeout(() => {
      if (b.dataset.armed === "1") { b.dataset.armed = ""; b.textContent = orig; const m = msgId && $(msgId); if (m && m.textContent === label) msg(msgId, ""); }
    }, 5000);
  }
  const msg = (id, text, bad) => { const m = $(id); if (m) { m.textContent = text || ""; m.classList.toggle("bad", !!bad); } };
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch {} }, 4000);
  }
  const safeName = s => String(s || "case").replace(/[^\w฀-๿-]+/g, "_").slice(0, 40);

  // ---------- reviewer ----------
  const whoIn = /** @type {HTMLInputElement} */ ($("reviewer"));
  const reviewer = () => (whoIn.value || "").trim();
  whoIn.value = lsGet("lqcase-reviewer", "") || "";
  $("reviewer").addEventListener("change", () => lsSet("lqcase-reviewer", reviewer()));

  /** one validated action on the current case, written append-only; returns true on success */
  function doAct(a, data, who) {
    if (!cur) return false;
    const w = who || reviewer();
    try {
      const fresh = store.get(cur);
      if (!fresh) { gone(); return false; } // deleted in another tab (or a stale bfcache page): never write it back
      const next = C.act(fresh, w, a, data);
      store.put(cur, next);
      log = next;
      if (!who) lsSet("lqcase-reviewer", w);
      msg("wsMsg", "");
      render();
      return true;
    } catch (e) {
      if (e && e.code === "conflict") log = store.get(cur) || log;
      msg("wsMsg", ERR(e), true);
      if (e && e.code === "no-reviewer") $("reviewer").focus();
      render();
      return false;
    }
  }

  /** the open case no longer exists in storage: close the workspace instead of resurrecting it */
  function gone() {
    for (const u of urls.values()) { try { URL.revokeObjectURL(u); } catch {} }
    urls.clear(); blobs.clear(); loadedState.clear();
    cur = null; log = []; active = null; $("ws").hidden = true;
    try { player.removeAttribute("src"); player.load(); } catch {}
    msg("caseMsg", T("cr.gone", "เคสที่เปิดอยู่ถูกลบออกจากเครื่องนี้แล้ว (อาจลบจากอีกแท็บ)"), true);
    render();
  }

  // ---------- cases ----------
  function renderCases() {
    const ul = $("caseList"); ul.textContent = "";
    const S = STATUS_L(), list = store.list();
    if (!list.length) { ul.appendChild(el("li", "cr-empty", T("cr.cases.none", "ยังไม่มีเคสในเครื่องนี้"))); return; }
    for (const c of list) {
      const s = C.replay(c.log), li = el("li", "cr-case");
      const b = el("button", "cr-case-btn"); b.type = "button"; b.dataset.open = c.id;
      if (c.id === cur) b.setAttribute("aria-current", "true");
      b.append(user(s.title || c.id), el("span", "pill", S[s.status] || s.status),
        el("span", "cr-m", T("cr.cases.meta", "{n} รายการ · ล่าสุด {t}", { n: c.log.length, t: fmtDate(s.updatedAt) })));
      li.appendChild(b); ul.appendChild(li);
    }
  }
  $("caseList").addEventListener("click", e => { const b = /** @type {HTMLElement} */ (e.target).closest("[data-open]"); if (b) openCase(b.getAttribute("data-open")); });

  $("newCase").addEventListener("submit", e => {
    e.preventDefault();
    const f = /** @type {HTMLFormElement} */ (e.target), title = f.elements.namedItem("title"), ref = f.elements.namedItem("ref");
    try {
      const next = C.act([], reviewer(), "case.create", { title: /** @type {HTMLInputElement} */ (title).value, ref: /** @type {HTMLInputElement} */ (ref).value });
      const id = next[0].data.id;
      store.put(id, next); lsSet("lqcase-reviewer", reviewer());
      f.reset(); msg("caseMsg", T("cr.new.done", "เปิดเคสแล้ว"));
      openCase(id);
    } catch (err) {
      msg("caseMsg", err && err.code === "empty" ? T("cr.err.title", "กรอกชื่อเคสก่อน") : ERR(err), true);
      if (err && err.code === "no-reviewer") $("reviewer").focus();
    }
  });

  async function openCase(id) {
    for (const u of urls.values()) { try { URL.revokeObjectURL(u); } catch {} }
    urls.clear(); blobs.clear(); loadedState.clear(); active = null;
    const p = /** @type {HTMLVideoElement} */ ($("player")); p.removeAttribute("src"); p.load();
    cur = id; log = store.get(id) || [];
    lsSet("lqcase-last", id);
    $("ws").hidden = false;
    render();
    // stored (encrypted) clips of this case: decrypt into object URLs
    for (const c of state().clips) if (c.stored) {
      try { const b = await vault.get(id, c.id); if (b && cur === id) bind(c.id, b); }
      catch { msg("wsMsg", T("cr.vault.locked", "ถอดรหัสคลิปที่เก็บไว้ไม่ได้ (กุญแจในเบราว์เซอร์นี้หายไป) เลือกไฟล์จากเครื่องอีกครั้ง"), true); }
    }
    if (cur === id) render();
  }

  // ---------- clips ----------
  function bind(clipId, blob) {
    if (urls.has(clipId)) { try { URL.revokeObjectURL(urls.get(clipId)); } catch {} }
    urls.set(clipId, URL.createObjectURL(blob)); blobs.set(clipId, blob);
    if (!active) select(clipId);
  }
  const probeDur = blob => new Promise(res => {
    const v = document.createElement("video"), u = URL.createObjectURL(blob);
    const done = d => { clearTimeout(tm); try { URL.revokeObjectURL(u); } catch {} v.removeAttribute("src"); res(d); };
    const tm = setTimeout(() => done(null), 3000);
    v.preload = "metadata"; v.muted = true;
    v.onloadedmetadata = () => done(isFinite(v.duration) ? v.duration : null); v.onerror = () => done(null);
    v.src = u;
  });
  async function addFiles(files) {
    if (!cur) return;
    if (!reviewer()) { msg("wsMsg", ERR({ code: "no-reviewer" }), true); $("reviewer").focus(); return; }
    for (const f of Array.from(files || [])) {
      msg("wsMsg", T("cr.clips.hashing", "กำลังคำนวณลายนิ้วมือของ {name}…", { name: f.name }));
      const sha = await C.fileHash(f).catch(() => null);
      const same = sha && state().clips.find(c => c.sha256 === sha);
      if (same) { if (doAct("clip.attach", { clipId: same.id, sha256: sha, match: true })) { loadedState.delete(same.id); bind(same.id, f); } continue; }
      const dur = await probeDur(f);
      const before = state().clips.length;
      if (doAct("clip.add", { clip: { name: f.name, size: f.size, type: f.type, sha256: sha, dur } })) {
        const c = state().clips[before];
        if (c) bind(c.id, f);
        msg("wsMsg", sha ? "" : T("cr.clips.noHash", "ไฟล์ใหญ่เกินไป ไม่ได้คำนวณลายนิ้วมือ"), !sha);
      }
    }
    render();
  }
  async function reattach(clipId, f) {
    const c = state().clips.find(x => x.id === clipId); if (!c) return;
    const sha = await C.fileHash(f).catch(() => null);
    // true = same fingerprint; false = different file; null = cannot tell (this file or the original has no fingerprint)
    const match = sha && c.sha256 ? sha === c.sha256 : null;
    if (!doAct("clip.attach", { clipId, sha256: sha, match })) return;
    if (match) loadedState.delete(clipId); else loadedState.set(clipId, { sha256: sha, match });
    bind(clipId, f); select(clipId);
    if (match === false) msg("wsMsg", T("cr.clips.mismatch", "ไฟล์นี้ไม่ตรงกับไฟล์เดิมของคลิป (ลายนิ้วมือต่างกัน) บันทึกไว้ในบันทึกตรวจสอบแล้ว"), true);
    else if (match === null) msg("wsMsg", T("cr.clips.unverified", "ยืนยันไม่ได้ว่าเป็นไฟล์เดิม (ไฟล์ใหญ่เกินกว่าจะคำนวณลายนิ้วมือในเครื่องนี้) บันทึกไว้ในบันทึกตรวจสอบแล้ว"), true);
  }
  async function storeClip(clipId) {
    const b = blobs.get(clipId), c = state().clips.find(x => x.id === clipId);
    if (!b || !c) return;
    if (!reviewer()) { msg("wsMsg", ERR({ code: "no-reviewer" }), true); return; }
    if (loadedState.has(clipId)) return; // only the verified original is ever stored as this clip
    const caseId = cur;
    try {
      await vault.put(caseId, clipId, b, { name: c.name });
      if (!doAct("clip.store", { clipId })) { try { await vault.del([clipId]); } catch {} } // no log entry -> no stored copy
    } catch (e) { msg("wsMsg", T("cr.vault.fail", "เก็บคลิปแบบเข้ารหัสไม่ได้ (ต้องเปิดผ่าน https:// หรือ localhost และพื้นที่ในเครื่องต้องพอ)"), true); }
  }
  async function unstoreClip(clipId) {
    if (!reviewer()) { msg("wsMsg", ERR({ code: "no-reviewer" }), true); return; }
    try { await vault.del([clipId]); } catch {}
    doAct("clip.unstore", { clipId });
  }
  function renderClips(s) {
    const ul = $("clipList"); ul.textContent = "";
    if (!s.clips.length) { ul.appendChild(el("li", "cr-empty", T("cr.clips.none", "ยังไม่มีคลิปในเคสนี้"))); return; }
    for (const c of s.clips) {
      const li = el("li", "cr-clip" + (c.id === active ? " on" : "")), loaded = urls.has(c.id);
      const head = el("div", "cr-clip-h"); head.append(user(c.name));
      if (c.stored) head.append(el("span", "pill cr-stored", T("cr.clips.stored", "เก็บแบบเข้ารหัสในเครื่องนี้")));
      li.append(head, el("p", "cr-m", T("cr.clips.meta", "{size} · {dur} · SHA-256 {sha} · เพิ่มโดย {who}", {
        size: fmtMB(c.size), dur: c.dur ? C.fmtTime(c.dur) : "—", sha: C.short(c.sha256), who: c.addedBy })));
      const ls = loadedState.get(c.id);
      if (ls) li.append(el("p", "cr-warn", ls.match === false ? T("cr.clips.mismatchS", "ไฟล์ที่เปิดอยู่ไม่ตรงกับไฟล์เดิม")
        : T("cr.clips.unverifiedS", "ไฟล์ที่เปิดอยู่ยืนยันไม่ได้ว่าเป็นไฟล์เดิม")));
      if (!loaded) li.append(el("p", "cr-m", T("cr.clips.notLoaded", "ยังไม่ได้เปิดไฟล์ในหน้านี้ เลือกไฟล์เดิมอีกครั้งเพื่อดู")));
      const row = el("div", "row-actions");
      if (loaded) row.append(btn(c.id === active ? "primary" : "ghost", T("cr.clips.view", "ดูคลิปนี้"), () => select(c.id)));
      else {
        const lab = el("label", "btn ghost cr-file"), inp = document.createElement("input");
        lab.append(el("span", null, T("cr.clips.reattach", "เลือกไฟล์เดิม")));
        inp.type = "file"; inp.accept = "video/*"; inp.setAttribute("aria-label", T("cr.clips.reattach", "เลือกไฟล์เดิม")); inp.dataset.reattach = c.id;
        inp.addEventListener("change", () => { if (inp.files && inp.files[0]) reattach(c.id, inp.files[0]); });
        lab.append(inp); row.append(lab);
      }
      if (loaded && !c.stored && !ls && vault.supported()) row.append(btn("ghost", T("cr.clips.store", "เก็บแบบเข้ารหัสในเครื่องนี้"), () => storeClip(c.id)));
      if (c.stored) {
        const b = btn("ghost danger", T("cr.clips.unstore", "ลบสำเนาที่เก็บไว้"), () => confirm2(b, T("cr.confirm", "กดอีกครั้งเพื่อยืนยัน"), () => unstoreClip(c.id), "wsMsg"));
        row.append(b);
      }
      li.append(row); ul.append(li);
    }
  }
  $("clipFile").addEventListener("change", e => { const i = /** @type {HTMLInputElement} */ (e.target); addFiles(i.files).finally(() => { i.value = ""; }); });

  // ---------- player + timeline ----------
  const player = /** @type {HTMLVideoElement} */ ($("player"));
  function select(clipId) {
    if (!urls.has(clipId)) return;
    active = clipId;
    if (player.getAttribute("src") !== urls.get(clipId)) player.src = urls.get(clipId);
    render();
  }
  const duration = s => {
    const c = s.clips.find(x => x.id === active);
    if (isFinite(player.duration) && player.duration > 0) return player.duration;
    const tmax = Math.max(0, ...s.tags.filter(t => t.clipId === active).map(t => t.t));
    return Math.max(c && c.dur || 0, tmax + 1, 1);
  };
  /** length of the active clip when known (the player's, else the duration probed when it was added), else null */
  function knownLength() {
    if (isFinite(player.duration) && player.duration > 0 && player.getAttribute("src") === urls.get(active)) return player.duration;
    const c = state().clips.find(x => x.id === active);
    return c && c.dur > 0 ? c.dur : null;
  }
  function renderTimeline(s) {
    const marks = $("tlMarks"); marks.textContent = "";
    const d = duration(s), K = KIND_L();
    for (const t of s.tags.filter(x => x.clipId === active && !x.retracted)) {
      const b = el("button", "cr-mark k-" + t.kind); b.type = "button";
      b.style.left = Math.min(100, t.t / d * 100) + "%";
      b.setAttribute("aria-label", C.fmtTime(t.t) + " " + (K[t.kind] || t.kind));
      b.title = C.fmtTime(t.t) + " · " + (K[t.kind] || t.kind) + (t.text ? " · " + t.text : "");
      b.addEventListener("click", () => seek(t.t));
      marks.appendChild(b);
    }
    tick();
  }
  function tick() {
    const s = active ? state() : null;
    $("tlPos").style.width = s ? Math.min(100, (player.currentTime || 0) / duration(s) * 100) + "%" : "0";
    $("nowTime").textContent = active ? T("cr.play.now", "ตำแหน่งปัจจุบัน {t}", { t: C.fmtTime(player.currentTime || 0) }) : "";
  }
  function seek(t) { try { player.currentTime = t; } catch {} tick(); }
  player.addEventListener("timeupdate", tick);
  player.addEventListener("loadedmetadata", () => { if (active) renderTimeline(state()); });
  $("timeline").querySelector(".cr-tl-bar").addEventListener("click", e => {
    if (!active) return;
    const r = /** @type {HTMLElement} */ (e.currentTarget).getBoundingClientRect();
    seek(Math.max(0, Math.min(1, (/** @type {MouseEvent} */ (e).clientX - r.left) / r.width)) * duration(state()));
  });

  // ---------- tags ----------
  const kindSel = /** @type {HTMLSelectElement} */ ($("tagKind"));
  function fillKinds() {
    const v = kindSel.value, K = KIND_L(); kindSel.textContent = "";
    for (const k of C.TAG_KINDS) { const o = el("option", null, K[k.id]); o.value = k.id; kindSel.appendChild(o); }
    if (v) kindSel.value = v;
  }
  $("tagForm").addEventListener("submit", e => {
    e.preventDefault();
    const f = /** @type {HTMLFormElement} */ (e.target), timeIn = /** @type {HTMLInputElement} */ (f.elements.namedItem("time")), text = /** @type {HTMLInputElement} */ (f.elements.namedItem("text"));
    if (!active) { msg("wsMsg", T("cr.err.noClip", "เลือกคลิปที่จะใส่แท็กก่อน"), true); return; }
    let t = player.currentTime || 0;
    if (timeIn.value.trim()) {
      const p = C.parseTime(timeIn.value); if (p == null) { msg("wsMsg", T("cr.err.time", "รูปแบบเวลาไม่ถูกต้อง ใช้ นาที:วินาที เช่น 1:23"), true); return; }
      const len = knownLength();
      if (len && p > len + 0.05) { msg("wsMsg", T("cr.err.timeLong", "เวลาเกินความยาวคลิป ({d})", { d: C.fmtTime(len) }), true); timeIn.focus(); return; }
      t = p;
    }
    if (doAct("tag.add", { clipId: active, t, kind: kindSel.value, text: text.value, loaded: loadedState.get(active) })) { text.value = ""; timeIn.value = ""; }
  });
  function renderTags(s) {
    const ul = $("tagList"); ul.textContent = "";
    const K = KIND_L(), list = s.tags.filter(t => t.clipId === active);
    if (!list.length) { ul.appendChild(el("li", "cr-empty", T("cr.tags.none", "ยังไม่มีแท็ก"))); return; }
    for (const t of list) {
      const li = el("li", "cr-item" + (t.retracted ? " off" : ""));
      const row = el("div", "cr-item-h");
      row.append(btn("ghost cr-time", C.fmtTime(t.t), () => seek(t.t)), el("b", null, K[t.kind] || t.kind));
      li.append(row);
      if (t.text) li.append(wrap("p", null, user(t.text)));
      if (t.loaded) li.append(el("p", "cr-warn", loadedNote(t.loaded, "")));
      li.append(el("p", "cr-m", T("cr.by", "โดย {who} · {t}", { who: t.by, t: fmtDate(t.at) })));
      if (t.retracted) li.append(el("p", "cr-m", T("cr.tags.retracted", "ถอนแล้วโดย {who} · {t}", { who: t.retracted.by, t: fmtDate(t.retracted.at) })));
      else if (s.status !== "closed") {
        const b = btn("ghost small", T("cr.tags.retract", "ถอนแท็ก"), () => confirm2(b, T("cr.confirm", "กดอีกครั้งเพื่อยืนยัน"), () => doAct("tag.retract", { id: t.id, reason: "" }), "wsMsg"));
        li.append(b);
      }
      ul.append(li);
    }
  }

  // ---------- notes ----------
  $("noteForm").addEventListener("submit", e => {
    e.preventDefault();
    const f = /** @type {HTMLFormElement} */ (e.target);
    const text = /** @type {HTMLTextAreaElement} */ (f.elements.namedItem("text")), at = /** @type {HTMLInputElement} */ (f.elements.namedItem("atTime"));
    const tie = at.checked && active;
    if (doAct("note.add", { text: text.value, clipId: tie ? active : undefined, t: tie ? player.currentTime || 0 : undefined,
      loaded: tie ? loadedState.get(active) : undefined })) { text.value = ""; at.checked = false; }
  });
  function renderNotes(s) {
    const ul = $("noteList"); ul.textContent = "";
    if (!s.notes.length) { ul.appendChild(el("li", "cr-empty", T("cr.notes.none", "ยังไม่มีบันทึก"))); return; }
    for (const n of s.notes.slice().reverse()) {
      const li = el("li", "cr-item" + (n.amendedBy ? " off" : ""));
      li.append(wrap("p", "cr-note", user(n.text)));
      const meta = [T("cr.by", "โดย {who} · {t}", { who: n.by, t: fmtDate(n.at) })];
      if (n.clipId) meta.push(clipName(s, n.clipId) + (n.t != null ? " @ " + C.fmtTime(n.t) : ""));
      if (n.amends) meta.push(T("cr.notes.isAmend", "ฉบับแก้ไขของบันทึกก่อนหน้า"));
      if (n.amendedBy) meta.push(T("cr.notes.amended", "มีฉบับแก้ไขแล้ว (ฉบับนี้เก็บไว้ในบันทึกตรวจสอบ)"));
      li.append(el("p", "cr-m", meta.join(" · ")));
      if (n.loaded) li.append(el("p", "cr-warn", loadedNote(n.loaded, "")));
      if (!n.amendedBy && s.status !== "closed") li.append(btn("ghost small", T("cr.notes.amend", "แก้บันทึกนี้"), () => amendForm(li, n)));
      ul.append(li);
    }
  }
  function amendForm(li, n) {
    if (li.querySelector("form")) return;
    const f = el("form", "cr-form"), lab = el("label", "cr-field"), ta = document.createElement("textarea");
    ta.rows = 3; ta.maxLength = 2000; ta.value = n.text;
    lab.append(el("span", null, T("cr.notes.amendL", "ข้อความฉบับแก้ไข")), ta);
    const ok = el("button", "btn primary small", T("cr.notes.amendOk", "บันทึกฉบับแก้ไข")); ok.type = "submit";
    f.append(lab, ok);
    f.addEventListener("submit", e => { e.preventDefault(); doAct("note.amend", { of: n.id, text: ta.value }); });
    li.append(f); ta.focus();
  }

  // ---------- audit log, integrity, exports ----------
  function renderLog(s) {
    const ol = $("auditLog"); ol.textContent = "";
    const A = ACT_L();
    for (const e of log.slice().reverse()) {
      const li = el("li", "cr-entry");
      li.append(el("span", "cr-seq", "#" + e.seq), el("span", "cr-m", fmtDate(e.at)), user(e.who), el("b", null, A[e.act] || e.act));
      const d = detail(e, s); if (d) li.append(user(d));
      const h = el("code", "cr-hash", C.short(e.hash)); h.title = e.hash; li.append(h);
      ol.append(li);
    }
  }
  function integrity() {
    const v = C.verify(log), b = $("integrity");
    b.dataset.ok = v.ok ? "1" : "0";
    b.textContent = v.ok ? T("cr.int.ok", "ห่วงโซ่แฮชต่อเนื่อง · {n} รายการ · แฮชล่าสุด {h}", { n: v.n, h: C.short(v.head) })
      : T("cr.int.bad", "บันทึกไม่ครบถ้วน: ขาด/ถูกแก้ที่รายการ #{i}", { i: v.brokenAt });
    return v;
  }
  $("verifyBtn").addEventListener("click", () => {
    const v = integrity();
    const clock = v.warnings.length ? " " + T("cr.int.clock", "(พบเวลาเครื่องย้อนกลับ {n} ครั้ง)", { n: v.warnings.length }) : "";
    msg("wsMsg", v.ok ? T("cr.int.okMsg", "ตรวจแล้ว: ทั้ง {n} รายการเชื่อมกันครบ ไม่พบการแก้ไขจากนอกหน้านี้ ยืนยันได้เต็มที่เมื่อแฮชล่าสุดตรงกับฉบับที่พิมพ์หรือส่งออกเก็บไว้ที่อื่น", { n: v.n }) + clock
      : T("cr.int.badMsg", "ตรวจแล้ว: รายการ #{i} ถูกแก้ ลบ หรือแทรก บันทึกหลังจากนั้นเชื่อถือไม่ได้", { i: v.brokenAt }), !v.ok);
  });
  const stamp = () => new Date().toISOString().slice(0, 10);
  const exportPrep = fmt => { if (C.verify(log).ok && !doAct("export", { fmt })) return false; return true; };
  $("csvBtn").addEventListener("click", () => {
    if (!cur || !exportPrep("csv")) return;
    const s = state(), A = ACT_L();
    const csv = C.toCSV(log, {
      head: [T("cr.csv.seq", "ลำดับ"), T("cr.csv.at", "เวลา (UTC)"), T("cr.csv.who", "ผู้ตรวจ"), T("cr.csv.act", "รหัสการกระทำ"), T("cr.csv.actL", "การกระทำ"),
        T("cr.csv.detail", "รายละเอียด"), T("cr.csv.data", "ข้อมูล (JSON)"), T("cr.csv.prev", "แฮชก่อนหน้า"), T("cr.csv.hash", "แฮช")],
      act: a => A[a] || a, detail: e => detail(e, s)
    });
    download(`lensiq-case-${safeName(s.ref || s.title)}-${stamp()}.csv`, csv, "text/csv;charset=utf-8");
  });
  $("jsonBtn").addEventListener("click", () => {
    if (!cur || !exportPrep("json")) return;
    const s = state();
    download(`lensiq-case-${safeName(s.ref || s.title)}-${stamp()}.json`, JSON.stringify(C.toJSON(log), null, 2), "application/json");
  });
  $("printBtn").addEventListener("click", () => {
    if (!cur || !exportPrep("print")) return;
    buildSummary(); window.print();
  });
  function buildSummary() {
    const s = state(), v = C.verify(log), K = KIND_L(), S = STATUS_L(), A = ACT_L(), box = $("summary");
    box.textContent = "";
    const add = (tag, text, cls) => box.appendChild(el(tag, cls, text));
    add("h1", T("cr.sum.h", "สรุปการทบทวนเคส"));
    box.appendChild(el("p")).append(user(s.title), document.createTextNode(s.ref ? " · " + s.ref : ""));
    add("p", T("cr.sum.meta", "สถานะ {st} · เปิดเมื่อ {c} โดย {who} · พิมพ์เมื่อ {t}", { st: S[s.status], c: fmtDate(s.createdAt), who: s.createdBy, t: fmtDate(new Date().toISOString()) }));
    add("p", $("banner").querySelector("span").textContent.replace(/\s+/g, " ").trim(), "cr-sum-note"); // the (translated) banner text
    add("p", v.ok ? T("cr.int.ok", "ห่วงโซ่แฮชต่อเนื่อง · {n} รายการ · แฮชล่าสุด {h}", { n: v.n, h: v.head }) : T("cr.int.bad", "บันทึกไม่ครบถ้วน: ขาด/ถูกแก้ที่รายการ #{i}", { i: v.brokenAt }));
    add("p", T("cr.sum.anchor", "เก็บสรุปนี้ไว้นอกเครื่อง: แฮชล่าสุดด้านบนใช้ตรวจภายหลังว่าบันทึกในเครื่องยังตรงกับฉบับนี้"), "cr-sum-note");
    add("p", T("cr.sum.reviewers", "ผู้ตรวจที่มีส่วนร่วม: {list}", { list: s.reviewers.join(", ") }));
    const table = (head, rows) => {
      const t = el("table"), tr = el("tr");
      for (const h of head) tr.appendChild(el("th", null, h));
      t.appendChild(el("thead")).appendChild(tr);
      const tb = t.appendChild(el("tbody"));
      for (const r of rows) { const row = el("tr"); for (const c of r) row.appendChild(el("td", null, c)); tb.appendChild(row); }
      box.appendChild(t);
    };
    add("h2", T("cr.clips.h", "คลิปวิดีโอ"));
    table([T("cr.sum.name", "ไฟล์"), T("cr.sum.size", "ขนาด"), "SHA-256", T("cr.sum.added", "เพิ่มโดย")],
      s.clips.map(c => [c.name, fmtMB(c.size), c.sha256 || "—", c.addedBy + " · " + fmtDate(c.addedAt)]));
    add("h2", T("cr.sum.tags", "แท็ก"));
    table([T("cr.sum.clip", "คลิป"), T("cr.sum.time", "เวลา"), T("cr.tag.kind", "ประเภทแท็ก"), T("cr.sum.text", "ข้อความ"), T("cr.sum.by", "ผู้ตรวจ")],
      s.tags.map(t => [clipName(s, t.clipId), C.fmtTime(t.t), K[t.kind] || t.kind, t.text + (t.retracted ? " (" + T("cr.sum.retracted", "ถอนแล้ว") + ")" : "") + loadedNote(t.loaded, " · "), t.by + " · " + fmtDate(t.at)]));
    add("h2", T("cr.notes.h", "บันทึกของผู้ตรวจ"));
    table([T("cr.sum.text", "ข้อความ"), T("cr.sum.by", "ผู้ตรวจ")], s.notes.map(n => [n.text + (n.amendedBy ? " (" + T("cr.sum.superseded", "มีฉบับแก้ไข") + ")" : "") + loadedNote(n.loaded, " · "), n.by + " · " + fmtDate(n.at)]));
    add("h2", T("cr.log.h", "บันทึกตรวจสอบ (เพิ่มได้อย่างเดียว)"));
    table(["#", T("cr.csv.at", "เวลา (UTC)"), T("cr.csv.who", "ผู้ตรวจ"), T("cr.csv.actL", "การกระทำ"), T("cr.csv.detail", "รายละเอียด"), T("cr.csv.hash", "แฮช")],
      log.map(e => [String(e.seq), e.at, e.who, A[e.act] || e.act, detail(e, s), C.short(e.hash)]));
    add("p", T("cr.sum.sign", "ลงชื่อผู้ตรวจ ____________________ วันที่ ____________"), "cr-sign");
  }

  // ---------- status / delete / import / wipe ----------
  document.querySelector("#ws").addEventListener("click", e => {
    const b = /** @type {HTMLElement} */ (e.target).closest("[data-status]"); if (!b) return;
    if (doAct("status", { to: b.getAttribute("data-status"), reason: /** @type {HTMLInputElement} */ ($("statusReason")).value })) /** @type {HTMLInputElement} */ ($("statusReason")).value = "";
  });
  $("delCase").addEventListener("click", e => {
    const b = /** @type {HTMLButtonElement} */ (e.currentTarget);
    if (!reviewer()) { msg("wsMsg", ERR({ code: "no-reviewer" }), true); return; }
    confirm2(b, T("cr.del.confirm", "กดอีกครั้งเพื่อลบเคสนี้"), async () => {
      const ids = state().clips.map(c => c.id);
      try { await vault.del(ids); } catch {}
      store.remove(cur, reviewer());
      cur = null; log = []; active = null; $("ws").hidden = true;
      try { LS && LS.removeItem("lqcase-last"); } catch {}
      msg("caseMsg", T("cr.del.done", "ลบเคสแล้ว"));
      render();
    }, "wsMsg");
  });
  $("importFile").addEventListener("change", e => {
    importCase(/** @type {HTMLInputElement} */ (e.target)).catch(err => msg("caseMsg", ERR(err), true));
  });
  async function importCase(inp) {
    const f = inp.files && inp.files[0]; inp.value = "";
    if (!f) return;
    if (!reviewer()) { msg("caseMsg", ERR({ code: "no-reviewer" }), true); return; }
    let r;
    try { r = C.fromJSON(JSON.parse(await f.text())); } catch { r = { ok: false, reason: "format" }; }
    if (!r.ok) {
      msg("caseMsg", r.reason === "format" ? T("cr.imp.format", "ไฟล์นี้ไม่ใช่ไฟล์ส่งออกของหน้าทบทวนเคส")
        : T("cr.imp.broken", "นำเข้าไม่ได้: บันทึกในไฟล์ไม่ครบถ้วน (รายการ #{i})", { i: r.brokenAt }), true);
      return;
    }
    const id = r.log[0].data.id, have = store.get(id);
    if (have && (have.length > r.log.length || have.some((x, i) => x.hash !== r.log[i].hash))) {
      msg("caseMsg", T("cr.imp.conflict", "มีเคสนี้ในเครื่องแล้วและบันทึกแตกต่างกัน นำเข้าไม่ได้"), true);
      return;
    }
    try { store.put(id, r.log); } catch (err) { msg("caseMsg", ERR(err), true); return; }
    cur = id; log = r.log;
    doAct("import", { file: f.name, n: r.log.length });
    msg("caseMsg", T("cr.imp.done", "นำเข้าแล้ว: ตรวจบันทึก {n} รายการครบถ้วน", { n: r.log.length }));
    await openCase(id);
  }
  $("wipeAll").addEventListener("click", e => {
    confirm2(/** @type {HTMLButtonElement} */ (e.currentTarget), T("cr.wipe.confirm", "กดอีกครั้งเพื่อลบทั้งหมด (ย้อนกลับไม่ได้)"), async () => {
      store.wipe(); await vault.wipe();
      try { for (const k of ["lqcase-last", "lqcase-settings", "lqcase-reviewer"]) LS && LS.removeItem(k); } catch {}
      for (const u of urls.values()) { try { URL.revokeObjectURL(u); } catch {} }
      urls.clear(); blobs.clear(); loadedState.clear(); cur = null; log = []; active = null; $("ws").hidden = true; whoIn.value = "";
      msg("wipeMsg", T("cr.wipe.done", "ลบข้อมูลทบทวนเคสทั้งหมดในเครื่องนี้แล้ว"));
      render();
    }, "wipeMsg");
  });

  // ---------- retention (stored clips only) ----------
  const settings = () => Object.assign({ retentionDays: 30 }, lsGet("lqcase-settings", {}));
  function fillRetention() {
    const sel = /** @type {HTMLSelectElement} */ ($("retention")); sel.textContent = "";
    for (const d of C.RETENTION_DAYS) { const o = el("option", null, T("cr.ret.days", "{n} วัน", { n: d })); o.value = String(d); sel.appendChild(o); }
    sel.value = String(settings().retentionDays);
  }
  // a retention change is a device-level setting: it needs a reviewer name, is written to the device ledger, and a
  // shorter period that would delete stored clips right now must be chosen twice (within 10 s)
  let pendingRet = 0, pendingTm = 0;
  $("retention").addEventListener("change", e => { changeRetention(/** @type {HTMLSelectElement} */ (e.target)).catch(() => {}); });
  async function changeRetention(sel) {
    const to = +sel.value, from = settings().retentionDays;
    if (to === from) return;
    sel.value = String(from); // applied only below
    if (!reviewer()) { msg("retMsg", ERR({ code: "no-reviewer" }), true); $("reviewer").focus(); return; }
    let n = 0;
    if (to < from) { try { n = (await vault.expired(to)).length; } catch {} }
    if (n && pendingRet !== to) {
      pendingRet = to; clearTimeout(pendingTm); pendingTm = setTimeout(() => { pendingRet = 0; }, 10000);
      msg("retMsg", T("cr.ret.confirm", "ตั้ง {d} วันจะลบคลิปที่เก็บไว้ {k} คลิปทันที เลือก {d} วันอีกครั้งภายใน 10 วินาทีเพื่อยืนยัน", { d: to, k: n }), true);
      return;
    }
    pendingRet = 0; clearTimeout(pendingTm);
    lsSet("lqcase-settings", Object.assign(settings(), { retentionDays: to }));
    sel.value = String(to);
    try { store.note(reviewer(), "settings.retention", { from, to }); } catch {}
    msg("retMsg", T("cr.ret.done", "ตั้งค่าแล้ว: ลบคลิปที่เก็บไว้เมื่อครบ {d} วัน (บันทึกชื่อผู้ตั้งไว้แล้ว)", { d: to }));
    await purge();
  }
  async function purge() {
    let gone = [];
    try { gone = await vault.expired(settings().retentionDays); } catch { return; }
    if (!gone.length) return;
    try { await vault.del(gone.map(m => m.clipId)); } catch { return; }
    for (const m of gone) {
      const l = store.get(m.caseId);
      let logged = false;
      if (l) { try { store.put(m.caseId, C.act(l, SYSTEM, "clip.purge", { clipId: m.clipId })); logged = true; } catch {} }
      // the case log could not take the entry (case gone, chain broken, storage full): keep the fact in the device ledger
      if (!logged) { try { store.note(SYSTEM, "clip.purge", { caseId: m.caseId, clipId: m.clipId, inCaseLog: false }); } catch {} }
    }
    if (cur) {
      const l = store.get(cur);
      if (!l) { gone(); return; }
      log = l; for (const m of gone) if (m.caseId === cur) { urls.delete(m.clipId); blobs.delete(m.clipId); } render();
    }
  }

  // ---------- render ----------
  function render() {
    renderCases();
    if (!cur) return;
    const s = state(), S = STATUS_L();
    $("caseTitle").textContent = ""; $("caseTitle").append(user(s.title + (s.ref ? " · " + s.ref : "")));
    const st = $("caseStatus"); st.textContent = S[s.status] || s.status; st.dataset.s = s.status;
    $("caseMeta").textContent = T("cr.case.meta", "เปิดเมื่อ {t} โดย {who} · ผู้ตรวจ {n} คน · ส่งออกแล้ว {x} ครั้ง",
      { t: fmtDate(s.createdAt), who: s.createdBy, n: s.reviewers.length, x: s.exports });
    for (const b of document.querySelectorAll("[data-status]")) {
      const on = b.getAttribute("data-status") === s.status;
      b.setAttribute("aria-pressed", on ? "true" : "false"); /** @type {HTMLButtonElement} */ (b).disabled = on;
    }
    const closed = s.status === "closed";
    for (const f of ["tagForm", "noteForm"]) for (const c of $(f).querySelectorAll("input,select,textarea,button")) /** @type {HTMLInputElement} */ (c).disabled = closed;
    /** @type {HTMLInputElement} */ ($("clipFile")).disabled = closed; $("addClipBtn").classList.toggle("off", closed);
    const c = s.clips.find(x => x.id === active);
    $("playName").textContent = ""; if (c) $("playName").append(user(c.name)); else $("playName").textContent = T("cr.play.none", "ยังไม่ได้เลือกคลิป");
    renderClips(s); renderTimeline(s); renderTags(s); renderNotes(s); renderLog(s); integrity();
    $("vaultState").textContent = vault.supported() ? T("cr.vault.ok", "คลิปที่เก็บไว้เข้ารหัส AES-GCM ด้วยกุญแจที่อยู่ในเบราว์เซอร์นี้เท่านั้น")
      : T("cr.vault.no", "เบราว์เซอร์นี้เก็บคลิปแบบเข้ารหัสไม่ได้ (ต้องเปิดผ่าน https:// หรือ localhost) ดูคลิปได้ตามปกติแต่ไม่เก็บ");
  }
  window.addEventListener("lq-lang", () => { fillKinds(); fillRetention(); render(); });
  /** re-read the open case from storage (another tab may have changed or deleted it) */
  function resync() { if (cur) { const l = store.get(cur); if (!l) { gone(); return; } log = l; } render(); }
  window.addEventListener("storage", e => { if (e.key === "lqcase-cases") resync(); });
  window.addEventListener("pageshow", e => { if (/** @type {PageTransitionEvent} */ (e).persisted) resync(); }); // bfcache restore misses storage events

  fillKinds(); fillRetention(); render();
  const last = lsGet("lqcase-last", null);
  if (last && store.get(last)) openCase(last);
  purge();

  W.__LQCASE = { C, store, vault, addFiles, openCase, purge, get cur() { return cur; }, get log() { return log; }, get active() { return active; }, state };
})();
