/* exam-clip-ui.js — LQExamClipUI: the evidence-clip controller shared by the two camera pages (exam-lab.html, exam-hall.html).
 * Uses LQExamClip (lensiq-exam-clip.js: ring buffer, pending slots, encrypted store) + LQVault (lensiq-facevault.js crypto).
 * OFF unless the institution switched it on for this exam (cfg.on). See docs/EXAM.md "Evidence clip".
 *
 * create({send, ctx, listEl, statusEl, onState, staff}) -> {
 *   cfg, setCfg(c), arm(stream), disarm(), onFlag(msg), onMessage(m), keep(id, how), stateOf(id), render(), purge(), lock(), store, pending, pin }
 * The kept-clip list (play / save as file / delete) is behind an invigilator PIN (LQExamClip.createPin): candidates on a
 *   shared lab computer see only the number of clips. arm() refuses to record until a PIN is set on this device.
 * Pending clips survive disarm() (end of exam / stop monitoring / camera reconnect) until their 10-minute window ends, so an
 *   invigilator can still keep them; only a page reload drops them (memory only, by design).
 * Expired clips are purged every minute while the page is open, on every list refresh, and load() refuses them.
 *   send(msg)            sends a clip-status message through exam-link (JSON only: {type:"clip", id, st, days?} — never video)
 *   ctx() -> {room, node, src}
 *   onState(id, st)      the page shows "clip on this device" next to its own event
 * Status values st: "pending" (in memory, waiting for an invigilator's keep) · "kept" (keep tapped) · "auto" (institution
 *   auto-keep) · "gone" (not kept in time: dropped from memory, never written) · "fail" (could not encrypt / store) · "del" (deleted)
 */
(function (root) {
  "use strict";
  const C = () => root.LQExamClip, U = () => root.LQExamUI;
  const T = (k, th, v) => U().T(k, th, v);

  /** @param {{send?: (m: any) => any, ctx: () => any, listEl?: HTMLElement|null, statusEl?: HTMLElement|null, onState?: (id: string, st: string) => void, now?: () => number}} o */
  function create(o) {
    const now = o.now || (() => Date.now());
    const store = C().createStore({ vault: root.LQVault });
    const pending = C().createPending({ max: 6, holdMs: 10 * 60000 });
    const pin = C().createPin();
    const states = new Map(), metas = new Map();
    let cfg = C().cleanCfg(null), ring = null, kept = [], playing = null, lastStatus = null, unlocked = false, lockTimer = null, pinMsg = null, ticks = 0;

    function status(fn, kind) {
      lastStatus = [fn, kind];
      if (!o.statusEl) return;
      o.statusEl.textContent = fn ? fn() : ""; o.statusEl.className = "status" + (kind ? " " + kind : ""); o.statusEl.hidden = !fn;
    }
    function setState(id, st, extra) {
      states.set(id, st);
      const c = o.ctx(), m = metas.get(id) || {};
      const msg = { v: 1, type: "clip", room: c.room, node: c.node, src: c.src, seat: m.seat || "", t: now(), id, st };
      if (extra && extra.days) msg.days = extra.days;
      try { o.send && o.send(msg); } catch (e) { /* link closed */ }
      try { o.onState && o.onState(id, st); } catch (e) { console.warn(e); }
    }
    function setCfg(c) { cfg = C().cleanCfg(c); render(); return cfg; }
    /** start the 10 s ring (video only) — only when switched on AND clips can be encrypted on this device */
    function arm(stream) {
      disarm(true); // stops the ring only: pending clips stay until their window ends
      if (!cfg.on) { status(null); return false; }
      if (!pin.has()) {
        status(() => T("exam.clip.needPin", "ยังไม่ได้ตั้ง PIN ผู้คุมสอบสำหรับคลิปในเครื่องนี้ — ระบบจะไม่บันทึกภาพเลย"), "warn");
        return false;
      }
      if (!store.supported()) {
        status(() => T("exam.clip.insecure",
          "เก็บคลิปไม่ได้ในเบราว์เซอร์นี้ (ต้องเปิดผ่าน https:// หรือ localhost และมี IndexedDB) — ระบบจะไม่บันทึกภาพเลย"), "warn");
        return false;
      }
      if (!C().ringSupported(root) || !stream) { status(() => T("exam.clip.noRec", "เบราว์เซอร์นี้บันทึกวิดีโอไม่ได้ (MediaRecorder) — ไม่มีคลิป"), "warn"); return false; }
      ring = C().createRing(stream, { segMs: 2000, wantMs: 10000, bps: 300000 });
      if (!ring) { status(() => T("exam.clip.noRec", "เบราว์เซอร์นี้บันทึกวิดีโอไม่ได้ (MediaRecorder) — ไม่มีคลิป"), "warn"); return false; }
      status(() => (cfg.auto ? T("exam.clip.armedAuto",
        "คลิปหลักฐานเปิดอยู่: เครื่องนี้จำภาพ 10 วินาทีล่าสุดในหน่วยความจำ และเก็บอัตโนมัติเมื่อมีการแจ้ง (สถาบันตั้งไว้) · เข้ารหัส · ลบเองใน {d} วัน · ไม่ส่งออกจากเครื่อง", { d: cfg.days })
        : T("exam.clip.armed",
          "คลิปหลักฐานเปิดอยู่: เครื่องนี้จำภาพ 10 วินาทีล่าสุดในหน่วยความจำเท่านั้น เก็บเมื่อผู้คุมสอบกด “เก็บคลิป” · เข้ารหัส · ลบเองใน {d} วัน · ไม่ส่งออกจากเครื่อง", { d: cfg.days })), "ok");
      return true;
    }
    /** stop the memory ring; pending clips are NOT dropped here (the tick drops them when their window ends) */
    function disarm(quiet) {
      if (ring) { ring.stop(); ring = null; }
      if (!quiet) status(null);
    }
    function tick() {
      for (const id of pending.expire(now())) setState(id, "gone");
      if (++ticks % 4 === 0) refresh(); // refresh() purges expired clips first
    }
    const tickTimer = setInterval(tick, 15000);

    /** a Watch / Check event this page just sent (msg has id) -> copy the ring into a pending slot (or keep it at once) */
    async function onFlag(msg) {
      if (!cfg.on || !ring || !msg || !msg.id || !C().wantsClip(msg)) return null;
      metas.set(msg.id, { seat: msg.seat || "", sig: msg.sig, lvl: msg.lvl, t: msg.t });
      let clip = null;
      try { clip = await ring.snapshot(); } catch (e) { clip = null; }
      if (!clip) return null;
      if (cfg.auto) return keepClip(msg.id, clip, "auto");
      for (const id of pending.add(msg.id, clip, now())) setState(id, "gone");
      setState(msg.id, "pending");
      return "pending";
    }
    async function keepClip(id, clip, how) {
      const c = o.ctx(), m = metas.get(id) || {};
      try {
        await store.save({ id: c.node + "-" + id, room: c.room, node: c.node, seat: m.seat, sig: m.sig, lvl: m.lvl, t: m.t, how }, clip, cfg.days);
        setState(id, how === "auto" ? "auto" : "kept", { days: cfg.days });
        await refresh();
        return how === "auto" ? "auto" : "kept";
      } catch (e) {
        console.warn("clip", e);
        setState(id, "fail");
        status(() => (e && e.code === "full" ? T("exam.clip.full", "เก็บคลิปไม่ได้: เครื่องนี้มีคลิปครบ {n} คลิปแล้ว — ลบคลิปเก่าก่อน", { n: C().MAX_KEPT })
          : T("exam.clip.failed", "เก็บคลิปไม่สำเร็จ (เข้ารหัสหรือพื้นที่ไม่พอ) — ไม่มีการเก็บแบบไม่เข้ารหัส")), "warn");
        return "fail";
      }
    }
    /** invigilator "keep" (from the dashboard message, or the hall node's own button) */
    async function keep(id, how = "kept") {
      const clip = pending.take(id);
      if (!clip) { if (!["kept", "auto"].includes(states.get(id))) setState(id, "gone"); return states.get(id); }
      return keepClip(id, clip, how);
    }
    function onMessage(m) {
      const c = o.ctx();
      if (m && m.type === "keep" && m.node === c.node && m.room === c.room && m.id) keep(m.id, "kept");
    }

    /* ---------- kept-clips list (play / save file / delete) ---------- */
    async function refresh() {
      try { await store.purge(now()); } catch (e) { /* ignore */ }
      try { kept = await store.list(); } catch (e) { kept = []; }
      render();
    }
    const purge = () => refresh();
    const esc = s => U().esc(s);
    /** a one-line label naming the clip, so repeated buttons are distinguishable for screen readers */
    const what = k => `${U().time(k.t)} · ${k.seat ? T("exam.c.seatN", "ที่นั่ง {s}", { s: k.seat }) : T("exam.clip.room", "ทั้งห้อง")} · ${U().sig(k.sig)}`;
    function lock() {
      clearTimeout(lockTimer); lockTimer = null;
      if (unlocked) stopPlay();
      unlocked = false; pinMsg = null; render();
    }
    function unlock() { unlocked = true; pinMsg = null; clearTimeout(lockTimer); lockTimer = setTimeout(lock, 5 * 60000); render(); }
    function pinForm() {
      const has = pin.has(), msg = pinMsg ? `<p class="form-msg" role="status">${esc(pinMsg())}</p>` : "";
      const count = `<p class="note">${esc(kept.length ? T("exam.clip.count", "มีคลิปเข้ารหัสเก็บในเครื่องนี้ {n} คลิป", { n: kept.length }) : T("exam.clip.none", "ไม่มีคลิปที่เก็บไว้ในเครื่องนี้"))}</p>`;
      return count + (has
        ? `<form class="form clip-pin" data-cunlock novalidate><label><span>${esc(T("exam.clip.pinL", "PIN ผู้คุมสอบ (ดู บันทึก หรือลบคลิป)"))}</span>
            <input type="password" inputmode="numeric" autocomplete="off" maxlength="8" data-cpin></label>
            <div class="row-actions"><button class="btn ghost" type="submit">${esc(T("exam.clip.unlock", "เปิดรายการคลิป"))}</button></div>${msg}</form>`
        : `<form class="form clip-pin" data-cset novalidate><p class="note">${esc(T("exam.clip.setPinP", "ผู้คุมสอบ: ตั้ง PIN 4–8 หลักก่อนเปิดคลิปหลักฐาน ผู้เข้าสอบจะเห็นเฉพาะจำนวนคลิป ไม่เห็นรายการ"))}</p>
            <label><span>${esc(T("exam.clip.pinNew", "PIN ใหม่ (ตัวเลข 4–8 หลัก)"))}</span><input type="password" inputmode="numeric" autocomplete="off" maxlength="8" data-cpin></label>
            <label><span>${esc(T("exam.clip.pin2", "ยืนยัน PIN"))}</span><input type="password" inputmode="numeric" autocomplete="off" maxlength="8" data-cpin2></label>
            <div class="row-actions"><button class="btn ghost" type="submit">${esc(T("exam.clip.setPin", "ตั้ง PIN"))}</button></div>${msg}</form>`);
    }
    function render() {
      const el = o.listEl; if (!el) return;
      if (!unlocked) { el.innerHTML = pinForm(); return; }
      const day = d => new Date(d).toLocaleDateString(({ th: "th-TH", en: "en-GB", zh: "zh-CN" })[U().lang()] || "th-TH");
      const aria = (k, key, th) => esc(T(key, th) + " · " + what(k));
      el.innerHTML = (kept.length ? `<ul class="clip-list">${kept.slice().reverse().map(k => `<li data-cid="${esc(k.id)}">
          <span><time>${esc(U().time(k.t))}</time> · ${esc(k.seat ? T("exam.c.seatN", "ที่นั่ง {s}", { s: k.seat }) : T("exam.clip.room", "ทั้งห้อง"))} · ${esc(U().sig(k.sig))}</span>
          <span class="note">${esc(k.how === "auto" ? T("exam.clip.howAuto", "เก็บอัตโนมัติ") : T("exam.clip.howKeep", "ผู้คุมสอบกดเก็บ"))}
            · ${esc(T("exam.clip.secs", "{n} วินาที", { n: Math.round((k.ms || 0) / 1000) }))} · ${esc(T("exam.clip.until", "ลบเองวันที่ {d}", { d: day(k.exp) }))}</span>
          <span class="acts"><button class="btn ghost" type="button" data-cplay aria-label="${aria(k, "exam.clip.play", "เล่น")}">${esc(T("exam.clip.play", "เล่น"))}</button>
            <button class="btn ghost" type="button" data-csave aria-label="${aria(k, "exam.clip.save", "บันทึกเป็นไฟล์")}">${esc(T("exam.clip.save", "บันทึกเป็นไฟล์"))}</button>
            <button class="btn ghost danger" type="button" data-cdel aria-label="${aria(k, "exam.clip.del", "ลบคลิป")}">${esc(T("exam.clip.del", "ลบคลิป"))}</button></span></li>`).join("")}</ul>
          <div class="row-actions"><button class="btn ghost danger" type="button" data-cdelall>${esc(T("exam.clip.delAll", "ลบคลิปทั้งหมดในเครื่องนี้"))}</button></div>`
        : `<p class="empty">${esc(T("exam.clip.none", "ไม่มีคลิปที่เก็บไว้ในเครื่องนี้"))}</p>`) +
        `<div class="clip-player" hidden><video controls playsinline muted aria-label="${esc(T("exam.clip.video", "วิดีโอคลิปหลักฐาน"))}"></video><div class="row-actions"><button class="btn ghost" type="button" data-cclose>${esc(T("exam.clip.close", "ปิดวิดีโอ"))}</button></div></div>` +
        `<div class="row-actions"><button class="btn ghost" type="button" data-clock>${esc(T("exam.clip.lock", "ล็อกรายการคลิป"))}</button></div>`;
    }
    function stopPlay() {
      if (playing) { playing.urls.forEach(u => URL.revokeObjectURL(u)); playing = null; }
      const p = o.listEl && o.listEl.querySelector(".clip-player"); if (p) { /** @type {HTMLElement} */ (p).hidden = true; const v = p.querySelector("video"); v.removeAttribute("src"); v.load(); }
    }
    async function play(id) {
      stopPlay();
      const r = await store.load(id);
      if (!r || r.locked || !r.segs.length) { status(() => T("exam.clip.locked", "เปิดคลิปนี้ไม่ได้ (กุญแจในเบราว์เซอร์นี้หายไป) — ลบคลิปนี้ได้"), "warn"); return; }
      const urls = r.segs.map(s => URL.createObjectURL(s.blob)), p = o.listEl.querySelector(".clip-player"), v = p.querySelector("video");
      playing = { urls, i: 0 };
      const k = kept.find(x => x.id === id); if (k) v.setAttribute("aria-label", T("exam.clip.video", "วิดีโอคลิปหลักฐาน") + " · " + what(k));
      v.onended = () => { if (playing && playing.i < urls.length - 1) { playing.i++; v.src = urls[playing.i]; v.play().catch(() => {}); } };
      /** @type {HTMLElement} */ (p).hidden = false; v.src = urls[0]; v.play().catch(() => {});
    }
    async function saveFile(id) {
      if (!unlocked) return;
      const r = await store.load(id);
      if (!r || r.locked || !r.segs.length) return;
      const ext = /mp4/.test(r.mime) ? "mp4" : "webm";
      r.segs.forEach((s, i) => {
        const a = document.createElement("a"); a.href = URL.createObjectURL(s.blob); a.download = `lensiq-exam-clip-${id}${r.segs.length > 1 ? "-" + (i + 1) : ""}.${ext}`;
        document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      });
    }
    if (o.listEl) o.listEl.addEventListener("submit", async e => {
      const f = /** @type {HTMLFormElement} */ (e.target); e.preventDefault();
      const v = /** @type {HTMLInputElement|null} */ (f.querySelector("[data-cpin]")), v2 = /** @type {HTMLInputElement|null} */ (f.querySelector("[data-cpin2]"));
      const val = v ? v.value.trim() : "";
      const say = fn => { pinMsg = fn; render(); const i = o.listEl.querySelector("[data-cpin]"); if (i) /** @type {HTMLElement} */ (i).focus(); };
      if (f.hasAttribute("data-cset")) {
        if (!pin.valid(val)) return say(() => T("exam.clip.pinBad", "PIN ต้องเป็นตัวเลข 4–8 หลัก"));
        if (!v2 || v2.value.trim() !== val) return say(() => T("exam.clip.pinMismatch", "PIN สองช่องไม่ตรงกัน"));
        const r = await pin.set(val);
        if (!r.ok) return say(() => T("exam.clip.pinFail", "ตั้ง PIN ไม่สำเร็จ"));
        status(null); unlock(); return;
      }
      if (f.hasAttribute("data-cunlock")) {
        const r = await pin.verify(val);
        if (r.ok) return unlock();
        const s = Math.ceil((r.wait || 0) / 1000);
        return say(r.why === "wait" ? () => T("exam.clip.pinWait", "ใส่ PIN ผิดหลายครั้ง รอ {n} วินาที", { n: s }) : () => T("exam.clip.pinWrong", "PIN ไม่ถูกต้อง"));
      }
    });
    if (o.listEl) o.listEl.addEventListener("click", async e => {
      const b = /** @type {HTMLElement} */ (e.target).closest("button"); if (!b) return;
      if (b.hasAttribute("data-clock")) return lock();
      if (!unlocked) return;
      const li = b.closest("[data-cid]"), id = li && li.getAttribute("data-cid");
      if (b.hasAttribute("data-cclose")) return stopPlay();
      if (b.hasAttribute("data-cdelall")) { if (confirm(T("exam.clip.delAllQ", "ลบคลิปหลักฐานทั้งหมดในเครื่องนี้? กู้คืนไม่ได้"))) { stopPlay(); await store.delAll(); await refresh(); } return; }
      if (!id) return;
      if (b.hasAttribute("data-cplay")) return play(id);
      if (b.hasAttribute("data-csave")) return saveFile(id);
      if (b.hasAttribute("data-cdel") && confirm(T("exam.clip.delQ", "ลบคลิปนี้? กู้คืนไม่ได้"))) {
        stopPlay(); await store.del(id); const ev = id.slice(id.indexOf("-") + 1); if (states.has(ev)) setState(ev, "del"); await refresh();
      }
    });
    root.addEventListener && root.addEventListener("lq-lang", () => { render(); if (lastStatus) status(lastStatus[0], lastStatus[1]); });
    refresh();

    return {
      setCfg, arm, disarm, onFlag, onMessage, keep, render, purge, refresh, lock, store, pending, pin,
      stateOf: id => states.get(id) || null,
      stopAll() { disarm(true); clearInterval(tickTimer); },
      get cfg() { return cfg; }, get armed() { return !!(ring && ring.running); }, get kept() { return kept; }, get unlocked() { return unlocked; }
    };
  }
  /** "clip on this device" label for a status (used by the camera pages next to their own events) */
  function stateText(st) {
    return {
      pending: T("exam.clip.stPending", "คลิป 10 วินาทีรอในหน่วยความจำ (ยังไม่เก็บ)"),
      kept: T("exam.clip.stKept", "คลิปเก็บในเครื่องนี้ (เข้ารหัส)"),
      auto: T("exam.clip.stKept", "คลิปเก็บในเครื่องนี้ (เข้ารหัส)"),
      gone: T("exam.clip.stGone", "ไม่ได้เก็บคลิป (ลบจากหน่วยความจำแล้ว)"),
      fail: T("exam.clip.stFail", "เก็บคลิปไม่สำเร็จ"),
      del: T("exam.clip.stDel", "ลบคลิปแล้ว")
    }[st] || "";
  }
  root.LQExamClipUI = { create, stateText };
})(typeof self !== "undefined" ? self : this);
