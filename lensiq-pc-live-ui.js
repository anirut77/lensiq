/* lensiq-pc-live-ui.js — the camera loop of the Product Check LIVE SCAN (owner order 2026-11-12: "not real-time, the box has
 * to be aimed carefully, too many taps. Redesign the capture as a live scan. Keep all privacy filters."). Browser only; the
 * pure logic (frame checks, auto-capture, merged reading, checklist) is lensiq-pc-live.js (LQPCLive, unit-tested).
 *
 * window.LQPCLiveUI.start(video) / stop() — called by lensiq-pc-ui.js when the camera button opens the camera with
 * "#pcLiveOn" ticked (the default) / when the camera closes, a photo is taken by hand, or the tab is left.
 *   - a framing guide over the video (#pcLiveGuide) and one short live hint (#pcLiveHint data-hint = nolabel | dark |
 *     bright | closer | glare | hold | ok | reading | done | turn | paused; turn = a side read in full with nothing on the
 *     checklist, most likely the front of the pack: turn to the side with the ingredients, registration number or barcode);
 *   - every frame analysed is a <= 320 px copy of the video (memory only), at most CFG.fps (<= 5) per second; nothing runs
 *     while the page is hidden (the loop stops; LQCam releases the camera) and the reading starts over when it is visible;
 *   - after CFG.stableFrames steady good frames the frame is read on the device (barcodes first, then OCR) — no shutter;
 *     up to CFG.readsPerScene readings of one steady view are merged (vote per line, LQPCLive.makeMerger); then reading
 *     pauses until the view changes (battery). A scene cut (another object, or the label leaves the frame) starts a new
 *     reading, so two objects are never merged into one text;
 *   - the checklist (#pcLiveList: barcode / registration number / ingredients) follows the merged reading;
 *   - the merged reading goes to the page with lensiq-pc-ui.js liveApply(): on-device results first, then the risk-signal
 *     card (official lookup, AI step) as before. The live scan sends nothing itself.
 * Timings for the measurement (performance.now(), ms): st.t = {stable, firstResult, firstOcr} of the current view.
 * Test hook: window.__LQ_PCLIVE = {st, cfg, start, stop}.
 */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), L = W.LQPCLive, $ = s => /** @type {any} */ (document.querySelector(s));
  if (!L || !$("#tab-pc") || !$("#pcLive")) return;
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, x) => (v && x in v ? String(v[x]) : m));
  const T = (k, th, v) => (W.LQI18N ? W.LQI18N.tf(k, th, v) : fill(th, v));
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const C = L.CFG;
  /** @type {any} */
  const st = { on: false, frames: 0, captures: 0, reads: 0, sceneReads: 0, hint: "", list: { barcode: false, reg: false, ingredients: false }, codes: [], scene: 0,
    t: { stable: 0, firstResult: 0, firstOcr: 0 }, log: [] };
  W.__LQ_PCLIVE = { st, cfg: C, start, stop };
  let video = null, timer = 0, reading = false, prevThumb = null;
  const stab = L.makeStabilizer(), merger = L.makeMerger();
  const small = document.createElement("canvas");
  const sctx = () => /** @type {CanvasRenderingContext2D} */ (small.getContext("2d", { willReadFrequently: true }));

  const HINTS = () => ({
    nolabel: T("md.pc.live.h.nolabel", "หันกล้องไปที่ฉลากสินค้า"), dark: T("md.pc.live.h.dark", "มืดเกินไป ย้ายไปที่สว่างขึ้น"),
    bright: T("md.pc.live.h.bright", "สว่างจ้าเกินไป ย้ายออกจากแสงไฟ"), closer: T("md.pc.live.h.closer", "ขยับเข้าใกล้ฉลากอีกนิด"),
    glare: T("md.pc.live.h.glare", "มีแสงสะท้อน เอียงสินค้าเล็กน้อย"), hold: T("md.pc.live.h.hold", "ถือนิ่ง ๆ"), ok: T("md.pc.live.h.ok", "ภาพนิ่งแล้ว กำลังจะอ่าน"),
    reading: T("md.pc.live.h.reading", "กำลังอ่านบนเครื่องนี้…"), done: T("md.pc.live.h.done", "อ่านด้านนี้แล้ว หันไปอีกด้านหรือสินค้าชิ้นอื่นได้"),
    paused: T("md.pc.live.h.paused", "หยุดอ่านชั่วคราวระหว่างขั้นตอนอื่น"),
    turn: T("md.pc.live.h.turn", "ด้านนี้ไม่มีเลขทะเบียน ส่วนประกอบ หรือบาร์โค้ด (น่าจะเป็นด้านหน้า) หมุนกล่องไปด้านที่มีส่วนประกอบ เลขทะเบียน หรือบาร์โค้ด")
  });
  function setHint(h) {
    if (h === st.hint) return;
    st.hint = h;
    const el = $("#pcLiveHint");
    if (el) { el.dataset.hint = h; el.textContent = HINTS()[h] || ""; }
  }
  function paintList() {
    for (const li of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll("#pcLiveList [data-item]"))) {
      const ok = !!st.list[/** @type {string} */ (li.dataset.item)];
      li.dataset.ok = ok ? "1" : "0";
      const m = li.querySelector(".pc-live-mark"); if (m) m.textContent = ok ? "✓" : "○";
    }
  }
  function show(on) {
    const o = $("#pcLive"), list = $("#pcLiveList"), crop = $("#pcCropHint");
    if (o) o.hidden = !on;
    if (list) list.hidden = !on;
    if (crop) crop.hidden = on; // "drag on the picture to place the box" does not apply to the live scan
  }
  function newScene() {
    st.scene++; st.sceneReads = 0; st.codes = []; st.t = { stable: 0, firstResult: 0, firstOcr: 0 };
    merger.reset(); stab.reset();
  }
  function start(v) {
    video = v;
    st.on = true; st.hint = "";
    st.list = { barcode: false, reg: false, ingredients: false };
    prevThumb = null; newScene(); show(true); paintList(); setHint("nolabel");
    schedule(0);
    fire();
  }
  function stop() {
    const was = st.on;
    st.on = false; clearTimeout(timer); timer = 0; reading = false;
    show(false);
    if (was) fire();
  }
  /** "lq-pc-live" {detail: {on}}: the AI step shows its tester one-tap send control only while the live scan runs */
  const fire = () => { try { W.dispatchEvent(new CustomEvent("lq-pc-live", { detail: { on: st.on } })); } catch { /* old browser */ } };
  function schedule(d) { clearTimeout(timer); timer = 0; if (st.on && !document.hidden) timer = setTimeout(tick, Math.max(0, d)); }
  // a hidden page analyses nothing (LQCam pauses the camera itself); back on screen the view may be another object
  document.addEventListener("visibilitychange", () => {
    if (!st.on) return;
    if (document.hidden) { clearTimeout(timer); timer = 0; return; }
    prevThumb = null; newScene(); schedule(L.interval());
  });

  function tick() {
    timer = 0;
    if (!st.on || document.hidden) return;
    const t0 = now();
    const vw = video && video.videoWidth, vh = video && video.videoHeight;
    if (vw && vh && video.readyState >= 2) {
      const k = Math.min(1, C.side / Math.max(vw, vh));
      const w = Math.max(1, Math.round(vw * k)), h = Math.max(1, Math.round(vh * k));
      if (small.width !== w || small.height !== h) { small.width = w; small.height = h; }
      const x = sctx();
      x.drawImage(video, 0, 0, w, h);
      const s = L.frameStats(x.getImageData(0, 0, w, h), prevThumb);
      prevThumb = s.thumb;
      st.frames++;
      const r = stab.push(s);
      if (r.cut) newScene(); // another object: never merged with the last one
      const blocked = W.__LQ_PC && W.__LQ_PC.liveBlocked && W.__LQ_PC.liveBlocked();
      if (reading) setHint("reading");
      // a side read in full: "turn" when nothing on the checklist was found (most likely the front of the pack), else "done"
      else if (st.sceneReads >= C.readsPerScene && (r.hint === "ok" || r.hint === "hold")) setHint(L.sideHint ? L.sideHint(st.list) : "done");
      else if (blocked && r.stable) setHint("paused");
      else setHint(r.hint);
      if (r.stable && !reading && !blocked && st.sceneReads < C.readsPerScene) {
        if (!st.t.stable) st.t.stable = now();
        read();
      }
    }
    schedule(L.interval() - (now() - t0));
  }

  const mergeCodes = (a, b) => { const seen = new Set(a.map(c => c.rawValue)); return a.concat((b || []).filter(c => c && c.rawValue && !seen.has(c.rawValue) && seen.add(c.rawValue))); };
  function apply(ms) {
    const text = merger.text(), P = W.LQPC, G = W.LQPCGuard;
    st.list = L.checklist(text, st.codes, { P, G });
    paintList();
    if (W.__LQ_PC && W.__LQ_PC.liveApply) W.__LQ_PC.liveApply({ text, lines: merger.lines(), codes: { engine: "live", codes: st.codes }, frames: merger.frames, ms });
    if (!st.t.firstResult && (text || st.codes.length)) st.t.firstResult = now();
  }
  async function read() {
    reading = true; setHint("reading");
    const scene = st.scene;
    if (st.sceneReads === 0) st.captures++;
    try {
      const r = await W.__LQ_PC.liveRead(video, video.videoWidth, video.videoHeight, {
        onCodes: (/** @type {any} */ c) => {
          if (!st.on || scene !== st.scene || !c || !c.codes || !c.codes.length) return;
          const before = st.codes.length;
          st.codes = mergeCodes(st.codes, c.codes);
          if (st.codes.length > before && !merger.frames) apply({ total: 0 }); // barcodes first: shown before the OCR finishes
        },
        // progressive reading (stream F, 2026-11-13): while the first reading of a view runs, the checklist ticks as soon as a
        // line read so far shows a registration number / ingredients. Ticks only: the partial text is not applied, not
        // merged and not shown as the capture's text (that stays the full merged reading below); nothing is sent.
        onLines: (/** @type {any[]} */ ls) => {
          if (!st.on || scene !== st.scene || merger.frames) return;
          const partial = L.checklist(ls.map(l => l.text).join("\n"), st.codes, { P: W.LQPC, G: W.LQPCGuard });
          const next = { barcode: st.list.barcode || partial.barcode, reg: st.list.reg || partial.reg, ingredients: st.list.ingredients || partial.ingredients };
          if (next.reg !== st.list.reg || next.ingredients !== st.list.ingredients || next.barcode !== st.list.barcode) {
            st.list = next; paintList();
            if (!st.t.firstResult) st.t.firstResult = now();
            if (!st.t.firstPartial) st.t.firstPartial = now();
          }
        }
      });
      if (!r || !st.on || scene !== st.scene) return;
      // another object in view (few lines in common with the merged reading): start over, never merge the two
      const lines = r.ocr.lines.map((/** @type {any} */ l) => l.text);
      if (merger.frames && !L.sameObject(merger.lines().map(l => l.text), lines)) { newScene(); st.captures++; }
      st.reads++; st.sceneReads++;
      merger.add(r.ocr.lines.map((/** @type {any} */ l) => ({ text: l.text, conf: l.conf })));
      st.codes = mergeCodes(st.codes, r.codes && r.codes.codes);
      apply(r.ocr.ms);
      if (!st.t.firstOcr) st.t.firstOcr = now();
      st.log.push({ scene, read: st.sceneReads, stable: st.t.stable, firstResult: st.t.firstResult, ocr: now(), ocrMs: r.ocr.ms && r.ocr.ms.total });
      if (st.log.length > 50) st.log.shift();
    } catch (e) {
      console.warn("live read", e);
    } finally { reading = false; }
  }

  W.LQPCLiveUI = { start, stop };
  W.addEventListener("lq-lang", () => { const h = st.hint; st.hint = ""; if (h) setHint(h); });
})();
