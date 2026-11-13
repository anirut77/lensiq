/* lensiq-crashguard.js — LQCrashGuard: notices that a page restarted after a crash (iOS Safari reloads a tab whose page
 * was killed for memory; no pagehide fires then) and switches that load to a lighter mode.
 * Browser: window.LQCrashGuard · Node: module.exports (pure parts, for tests/unit/crashguard.test.js).
 *
 * Privacy: on the device only. Stores ONE boolean in sessionStorage ("lq-heavy" = "1") while heavy work runs (a camera is
 * live); nothing else is stored or sent. sessionStorage belongs to this tab and is gone when the tab closes.
 *
 * How it works
 *   begin(id) — heavy work started (lensiq-camera.js calls it when a camera stream starts): sets the marker.
 *   end(id)   — that work stopped (camera stopped / paused / ended): the marker is cleared when nothing heavy is left.
 *   pagehide  — leaving or reloading the page normally clears the marker (a normal reload is not a crash).
 *   At load: a marker still present means the last page died while heavy work ran -> recovered = lite = true for this
 *   load, the marker is consumed (the next normal load is clean) and a short note is shown (TH / EN / ZH):
 *   "the page restarted; we switched to a lighter mode".
 *   Lighter mode: LQCam asks the camera for at most 640 px wide (liteIdeal); pages may read LQCrashGuard.lite to pick a
 *   smaller model or a lower analysis rate.
 *
 * API: KEY, create({storage}) -> {recovered, lite, begin, end, left}, liteIdeal(ideal), text(lang) -> {note, close},
 *      window.LQCrashGuard = {recovered, lite, begin, end, liteIdeal, text, showNote()}
 */
(function (root) {
  "use strict";
  const KEY = "lq-heavy";
  const LITE_W = 640;
  const TEXT = {
    th: { note: "หน้านี้เพิ่งเริ่มใหม่ (เครื่องอาจหน่วยความจำไม่พอ) เราจึงสลับเป็นโหมดเบา: กล้องความละเอียดต่ำลง เพื่อให้ใช้งานต่อได้", close: "ปิด" },
    en: { note: "This page restarted (the phone may have run low on memory), so we switched to a lighter mode: a lower camera resolution, to keep it running.", close: "Close" },
    zh: { note: "页面刚刚重新启动（手机内存可能不足），我们已切换到轻量模式：降低摄像头分辨率，以便继续使用。", close: "关闭" }
  };
  /** @param {string} lang @returns {{note: string, close: string}} */
  const text = lang => TEXT[/** @type {"th"|"en"|"zh"} */ (lang)] || TEXT.th;

  /** one rung capped at LITE_W wide, aspect kept, never raised */
  function cap(r) {
    if (!r || !(r.width > 0) || !(r.height > 0)) return { width: 640, height: 480 };
    if (r.width <= LITE_W) return { width: r.width, height: r.height };
    return { width: LITE_W, height: Math.round(r.height * LITE_W / r.width) };
  }
  /** camera request for the lighter mode: one ideal or a ladder (distinct capped rungs, highest first) */
  function liteIdeal(ideal) {
    if (!Array.isArray(ideal)) return cap(ideal);
    const out = [];
    for (const r of ideal.map(cap)) if (!out.some(o => o.width === r.width && o.height === r.height)) out.push(r);
    return out.sort((a, b) => b.width - a.width);
  }

  /** @param {{storage?: any}} [o] */
  function create(o) {
    const st = o && o.storage;
    const get = () => { try { return st ? st.getItem(KEY) : null; } catch { return null; } };
    const set = () => { try { if (st) st.setItem(KEY, "1"); } catch { /* storage blocked: no guard */ } };
    const del = () => { try { if (st) st.removeItem(KEY); } catch { /* storage blocked */ } };
    const recovered = get() === "1";
    if (recovered) del();
    const active = new Set();
    return {
      recovered, lite: recovered,
      begin(id) { active.add(String(id)); set(); },
      end(id) { active.delete(String(id)); if (!active.size) del(); },
      left() { active.clear(); del(); }
    };
  }

  const api = { KEY, create, liteIdeal, text };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (!root || typeof root.document === "undefined") return;

  let storage = null;
  try { storage = root.sessionStorage; } catch { storage = null; }
  const g = create({ storage });
  root.addEventListener("pagehide", () => g.left());
  // the note's English / Chinese go through LQI18N too (shared-component coverage); the text above is the source
  (root.LQI18N_Q = root.LQI18N_Q || []).push({ en: { "crash.note": TEXT.en.note, "crash.close": TEXT.en.close }, zh: { "crash.note": TEXT.zh.note, "crash.close": TEXT.zh.close } });
  const lang = () => { const I = root.LQI18N; return String((I && I.lang) || root.document.documentElement.lang || "th").slice(0, 2); };
  let note = null;
  function render() {
    if (!note) return;
    const l = lang(), t = text(l);
    note.querySelector("p").textContent = t.note;
    note.querySelector("button").textContent = t.close;
    note.setAttribute("lang", l);
  }
  function showNote() {
    const d = root.document;
    if (note || !d.body) return;
    note = d.createElement("div");
    note.className = "lq-crash-note";
    note.setAttribute("role", "status");
    note.innerHTML = "<p></p><button type=\"button\"></button>";
    note.style.cssText = "display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:8px 16px;padding:10px 14px;" +
      "border:1px solid #b45309;border-radius:10px;background:#fffbeb;color:#1f2937;font-size:15px;line-height:1.5";
    const p = note.querySelector("p"); p.style.cssText = "margin:0;flex:1 1 220px;color:#1f2937";
    const b = note.querySelector("button");
    b.style.cssText = "min-width:44px;min-height:44px;padding:0 14px;border-radius:8px;border:1px solid #92400e;background:#fff;color:#92400e;font:inherit;cursor:pointer";
    b.addEventListener("click", () => { note.hidden = true; note.style.display = "none"; });
    render();
    const main = d.querySelector("main");
    if (main) main.insertBefore(note, main.firstChild); else d.body.insertBefore(note, d.body.firstChild);
  }
  root.addEventListener("lq-lang", render);
  if (g.recovered) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", showNote, { once: true });
    else showNote();
  }
  root.LQCrashGuard = Object.assign({}, api, {
    get recovered() { return g.recovered; },
    get lite() { return g.lite; },
    begin: g.begin, end: g.end, showNote
  });
})(typeof window !== "undefined" ? window : null);
