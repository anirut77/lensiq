/* tools/palm-trace/palm-trace.js — page script of the local palm tap-to-trace labelling tool (owner decision 174 ก).
 * OWNER TOOL, LOCAL ONLY. The owner opens their own palm photo with the file input (the bytes stay in this page), chooses a
 * line, taps along it, and saves a JSON label (LQPalmTrace.buildLabel: point positions only, never image data or EXIF) with
 * the system save dialog, or as a download where that dialog is missing. The page has no network code and its CSP sets
 * connect-src 'none'. Only the labeller name and the language are remembered (localStorage); the photo never is. */
(function () {
  "use strict";
  const C = /** @type {any} */ (window).LQPalmTrace;
  const $ = s => /** @type {any} */ (document.querySelector(s));
  const $$ = s => /** @type {any[]} */ ([...document.querySelectorAll(s)]);
  const cv = $("#cv"), cx = cv.getContext("2d"), wrap = $("#wrap");
  const COLORS = { life: "#ff5e5e", head: "#3fc1ff", heart: "#ffd23f", fate: "#6dff8f" };
  const MAX_SIDE = 2048; // display canvas size limit (phones); the label keeps the photo's own pixel size
  const TAP_SLOP = 10; // css px: a pointer that moved further is a pan / scroll, not a tap

  let lang = "th", state = C.newState(), line = "life", zoom = 1, dirty = false;
  /** @type {{bmp: ImageBitmap, w: number, h: number, name: string, sha: string|null}|null} */
  let photo = null;
  let down = null;

  const store = {
    get(k) { try { return localStorage.getItem("lq-palm-trace-" + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem("lq-palm-trace-" + k, String(v).slice(0, 64)); } catch { /* private mode: not remembered */ } }
  };
  const tr = k => C.t(lang, k);
  function msg(text, kind) { const m = $("#msg"); m.textContent = text; m.className = "note" + (kind ? " " + kind : ""); }

  function counts() {
    for (const b of $$("[data-line]")) {
      const l = state.lines[b.dataset.line];
      b.querySelector(".ct").textContent = "(" + (l.status === "traced" ? l.points.length + " " + tr("status_traced") : tr("status_" + l.status)) + ")";
      b.setAttribute("aria-pressed", String(b.dataset.line === line));
    }
    for (const b of $$("[data-zoom]")) b.setAttribute("aria-pressed", String(Number(b.dataset.zoom) === zoom));
  }

  function setLang(l) {
    lang = C.T[l] ? l : "th";
    document.documentElement.lang = lang;
    $("#title").textContent = tr("title");
    document.title = tr("title");
    $("#local").textContent = tr("local_only");
    for (const el of $$("[data-t]")) el.textContent = tr(el.dataset.t);
    for (const b of $$("[data-line]")) b.querySelector(".nm").textContent = tr("line_" + b.dataset.line);
    $("#undo").textContent = tr("undo"); $("#clear").textContent = tr("clear"); $("#notvis").textContent = tr("not_visible");
    $("#export").textContent = tr("export");
    if (!photo) $("#photoname").textContent = tr("no_photo");
    for (const b of $$("[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
    store.set("lang", lang);
    counts();
  }

  function draw() {
    if (!photo) { cx.fillStyle = "#000"; cx.fillRect(0, 0, cv.width, cv.height); return; }
    cx.drawImage(photo.bmp, 0, 0, cv.width, cv.height);
    const lw = Math.max(2, cv.width / 320), r = lw * 1.8;
    for (const id of C.LINES) {
      const l = state.lines[id];
      if (l.status !== "traced") continue;
      const pts = l.points.map(p => C.toPx(p, cv.width, cv.height));
      cx.strokeStyle = COLORS[id]; cx.fillStyle = COLORS[id];
      cx.lineWidth = id === line ? lw * 1.6 : lw; cx.lineJoin = "round"; cx.lineCap = "round";
      cx.beginPath(); pts.forEach((p, i) => (i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1]))); cx.stroke();
      for (const p of pts) { cx.beginPath(); cx.arc(p[0], p[1], r, 0, Math.PI * 2); cx.fill(); }
    }
  }
  function update(next) { state = next; dirty = true; draw(); counts(); }

  function setZoom(z) {
    const prev = zoom, fx = (wrap.scrollLeft + wrap.clientWidth / 2) / Math.max(1, cv.clientWidth), fy = (wrap.scrollTop + wrap.clientHeight / 2) / Math.max(1, cv.clientHeight);
    zoom = z;
    cv.style.width = (zoom * 100) + "%";
    if (prev !== zoom) { wrap.scrollLeft = fx * cv.clientWidth - wrap.clientWidth / 2; wrap.scrollTop = fy * cv.clientHeight - wrap.clientHeight / 2; }
    counts();
  }

  async function sha256Hex(file) {
    try {
      if (!(window.crypto && crypto.subtle)) return null;
      const d = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
      return [...d].map(b => b.toString(16).padStart(2, "0")).join("");
    } catch { return null; }
  }

  async function openPhoto(file) {
    if (!file) return;
    if (dirty && !window.confirm(tr("unsaved"))) return;
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const sha = await sha256Hex(file);
      if (photo) photo.bmp.close();
      photo = { bmp, w: bmp.width, h: bmp.height, name: String(file.name || "").split(/[/\\]/).pop() || "", sha };
      const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      cv.width = Math.max(1, Math.round(bmp.width * s)); cv.height = Math.max(1, Math.round(bmp.height * s));
      state = C.newState(); line = "life"; dirty = false;
      setZoom(1); draw(); counts();
      $("#photoname").textContent = photo.name + " · " + photo.w + " × " + photo.h;
      document.body.dataset.ready = "1";
      msg(tr("loaded"), "ok");
    } catch {
      msg(tr("err_photo"), "err");
    }
  }

  function onDown(e) { if (e.isPrimary) down = { id: e.pointerId, x: e.clientX, y: e.clientY }; }
  function onUp(e) {
    const d = down; down = null;
    if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP || !photo) return;
    const p = C.clientToNorm(e.clientX, e.clientY, cv.getBoundingClientRect());
    try { update(C.addPoint(state, line, p)); } catch (err) { msg(String(err && err.message || err), "err"); }
  }

  async function save() {
    const labeller = $("#labeller").value.trim();
    if (!photo) { msg(tr("err_export") + ": " + tr("no_photo"), "err"); return; }
    if (!labeller) { msg(tr("err_labeller"), "err"); return; }
    const { label, errors } = C.buildLabel(state, { width: photo.w, height: photo.h, labeller, hand: $("#hand").value, imageName: photo.name, imageSha256: photo.sha });
    if (errors.length) { msg(tr("err_export") + ": " + errors.slice(0, 3).join("; "), "err"); return; }
    const text = C.labelJson(label), name = C.labelFileName(photo.name);
    const W = /** @type {any} */ (window);
    try {
      if (typeof W.showSaveFilePicker === "function") {
        const h = await W.showSaveFilePicker({ suggestedName: name, types: [{ description: "JSON", accept: { "application/json": [".json"] } }] });
        const w = await h.createWritable(); await w.write(text); await w.close();
      } else {
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      dirty = false;
      msg(tr("saved") + ": " + name, "ok");
    } catch (err) {
      msg(err && err.name === "AbortError" ? tr("cancelled") : tr("err_export") + ": " + String(err && err.message || err), err && err.name === "AbortError" ? "" : "err");
    }
  }

  // wiring
  $("#photo").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; openPhoto(f); e.target.value = ""; });
  for (const b of $$("[data-lang]")) b.addEventListener("click", () => setLang(b.dataset.lang));
  for (const b of $$("[data-line]")) b.addEventListener("click", () => { line = b.dataset.line; draw(); counts(); });
  for (const b of $$("[data-zoom]")) b.addEventListener("click", () => setZoom(Number(b.dataset.zoom)));
  $("#undo").addEventListener("click", () => update(C.undo(state, line)));
  $("#clear").addEventListener("click", () => update(C.clearLine(state, line)));
  $("#notvis").addEventListener("click", () => update(C.markNotVisible(state, line)));
  $("#export").addEventListener("click", save);
  $("#labeller").addEventListener("change", e => store.set("labeller", e.target.value.trim()));
  cv.addEventListener("pointerdown", onDown);
  cv.addEventListener("pointerup", onUp);
  cv.addEventListener("pointercancel", () => { down = null; });
  window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  $("#labeller").value = store.get("labeller") || "owner";
  setLang(store.get("lang") || "th");
  draw();
})();
