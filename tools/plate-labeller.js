/* tools/plate-labeller.js — page script of the local plate labeller (served by tools/plate-labeller.mjs on 127.0.0.1).
 * Per photo: plate boxes (+ text, category, province, sure), "ignore" boxes (tiny unreadable plates), blur boxes (faces,
 * people, phone numbers / names on vehicles) proposed by BlazeFace (LQPCRun.faceRuns + LQPC.faceBlurPlan, the measured
 * Product Check setting) and corrected by a person, and the "checked" tick. Saves labels/plates-photo-labels.csv (the
 * format of tools/plate-field-eval.mjs) and labels/privacy.json; "export" writes blurred/<photo> with every blur box
 * blurred and pixelated (LQPCRun.faceBlur, irreversible; re-encoding drops EXIF). Owner tool, Thai + English. */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), $ = s => /** @type {any} */ (document.querySelector(s));
  const cv = $("#cv"), cx = cv.getContext("2d");
  const CATS = ["white", "yellow", "green", "red", "blue", "moto", "night", "graphic", "other"];
  /** state: file -> {none, plates: [{box, text, cat, province, sure}], ignore: [box], blur: [[x0,y0,x1,y1,kind]], checked} */
  const S = {}; let photos = [], blurredSet = new Set(), cur = null, img = null, mode = "plate", sel = null, drag = null, dirty = false;
  // this run's key from the start URL (tools/plate-labeller.mjs): required on /api/* and /photos/*
  const TOKEN = new URLSearchParams(location.search).get("t") || "", H = { "X-LQ-Token": TOKEN };
  const photoUrl = f => "/photos/" + encodeURIComponent(f) + "?t=" + encodeURIComponent(TOKEN);
  const msg = (t, k) => { $("#msg").textContent = t; $("#msg").className = "note " + (k || ""); };

  function parseCsv(text) {
    const rows = []; let row = [], cell = "", q = false; const s = String(text || "").replace(/^﻿/, "");
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
      if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim() !== ""));
  }
  const entry = f => S[f] || (S[f] = { none: false, plates: [], ignore: [], blur: [], checked: false, auto: false });
  function load(state) {
    photos = state.photos; blurredSet = new Set(state.blurred || []);
    $("#root").textContent = state.root;
    const rows = parseCsv(state.labels), head = (rows[0] || []).map(h => h.trim().toLowerCase()), col = k => head.indexOf(k);
    for (const r of rows.slice(1)) {
      const g = k => (col(k) >= 0 ? String(r[col(k)] || "").trim() : ""), f = g("file");
      if (!f || /^EXAMPLE|^#/.test(f)) continue;
      const e = entry(f), box = ["x0", "y0", "x1", "y1"].map(k => g(k)), b = box.every(v => v !== "") ? box.map(Number) : null;
      if (g("category") === "none") e.none = true;
      else if (g("category") === "ignore") { if (b) e.ignore.push(b); }
      else e.plates.push({ box: b, text: g("plate"), cat: g("category"), province: g("province"), sure: !/^n/i.test(g("sure")) });
    }
    for (const [f, v] of Object.entries((state.privacy && state.privacy.files) || {})) { const e = entry(f); e.blur = (v.regions || []).slice(); e.checked = v.checked === true; e.auto = true; }
    renderList();
    if (photos.length) open(photos[0]);
  }
  function renderList() {
    $("#list").innerHTML = "";
    let done = 0;
    for (const f of photos) {
      const e = S[f], ok = e && (e.none || e.plates.length) && e.checked;
      if (ok) done++;
      const b = document.createElement("button");
      b.textContent = (ok ? "✓ " : "· ") + f + (blurredSet.has(f) ? " ◐" : "");
      b.className = f === cur ? "on" : ""; b.onclick = () => open(f);
      $("#list").append(b);
    }
    $("#stat").textContent = `${photos.length} photos · ${done} labelled + checked · ${blurredSet.size} blurred`;
  }
  async function open(f) {
    cur = f; sel = null; img = new Image(); img.src = photoUrl(f);
    await img.decode();
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const e = entry(f);
    if (!e.auto) await autoFaces();
    syncForm(); draw(); renderList();
  }
  async function autoFaces() {
    const e = entry(cur), c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    msg("กำลังหาใบหน้า... / finding faces...");
    try {
      // exactly the measured Product Check setting (FACE_BLUR, round 2: 3 x 3 tiles, 20 % overlap, threshold 0.5, pad 0.15,
      // the whole frame + tiles + the image at upload size 1,024 px; docs/product-check/FACE-BLUR-RESULTS.md §5)
      const F = W.LQPC.FACE_BLUR;
      const st = await W.LQPCRun.faceRuns(c, null, { tiles: F.tiles, grid: F.grid, overlap: F.overlap, upscale: F.upscale, close: F.close });
      const plan = W.LQPC.faceBlurPlan(st, c.width, c.height, { scale: st.scale });
      if (plan.textOnly) { msg("ตัวหาใบหน้าทำงานไม่ได้ ให้วาดกรอบเบลอเอง / face finder failed: draw the blur boxes by hand", "err"); }
      else {
        e.blur = e.blur.filter(r => r[4] !== "auto-face").concat(plan.regions.map(r =>
          [r.x / st.scale, r.y / st.scale, (r.x + r.w) / st.scale, (r.y + r.h) / st.scale].map(Math.round).concat(["auto-face"])));
        msg(`เสนอกรอบใบหน้า ${plan.regions.length} กรอบ ตรวจทุกใบหน้าเอง / ${plan.regions.length} face box(es) proposed: check every face yourself`, "warn");
      }
    } catch (err) { msg("face finder: " + (err && err.message || err), "err"); }
    e.auto = true; e.checked = false; dirty = true;
  }
  function syncForm() {
    const e = entry(cur), p = sel && sel.kind === "plate" ? e.plates[sel.i] : null;
    $("#none").checked = e.none; $("#checked").checked = e.checked;
    for (const id of ["#cat", "#text", "#prov", "#unsure"]) $(id).disabled = !p;
    $("#cat").value = p ? (CATS.includes(p.cat) ? p.cat : "white") : "white"; $("#text").value = p ? p.text : ""; $("#prov").value = p ? p.province : ""; $("#unsure").checked = p ? !p.sure : false;
    const li = (k, i, t) => `<li class="${sel && sel.kind === k && sel.i === i ? "sel" : ""}">${t}</li>`;
    $("#boxes").innerHTML = e.plates.map((p, i) => li("plate", i, `plate ${i + 1}: ${p.text || "?"} (${p.cat})`)).join("")
      + e.blur.map((b, i) => li("blur", i, `blur ${i + 1} (${b[4]})`)).join("") + e.ignore.map((b, i) => li("ignore", i, `ignore ${i + 1}`)).join("");
  }
  function draw() {
    if (!img) return;
    cx.drawImage(img, 0, 0);
    const e = entry(cur), lw = Math.max(2, cv.width / 400);
    const rect = (b, col, on) => { cx.lineWidth = on ? lw * 2 : lw; cx.strokeStyle = col; cx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); };
    e.blur.forEach((b, i) => { cx.fillStyle = "rgba(255,107,94,.35)"; cx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); rect(b, "#ff6b5e", sel && sel.kind === "blur" && sel.i === i); });
    e.plates.forEach((p, i) => p.box && rect(p.box, "#3ddc84", sel && sel.kind === "plate" && sel.i === i));
    e.ignore.forEach((b, i) => rect(b, "#a9b3e0", sel && sel.kind === "ignore" && sel.i === i));
    if (drag && drag.b) rect(drag.b, "#22d3ee", true);
  }
  const pt = ev => { const r = cv.getBoundingClientRect(); return [Math.round((ev.clientX - r.left) * cv.width / r.width), Math.round((ev.clientY - r.top) * cv.height / r.height)]; };
  const inside = (b, p) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
  cv.addEventListener("pointerdown", ev => { if (!img) return; drag = { a: pt(ev), b: null }; });
  cv.addEventListener("pointermove", ev => { if (!drag) return; const p = pt(ev), a = drag.a;
    drag.b = [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[0], p[0]), Math.max(a[1], p[1])]; draw(); });
  cv.addEventListener("pointerup", ev => {
    const e = entry(cur), d = drag; drag = null;
    if (d && d.b && d.b[2] - d.b[0] >= 4 && d.b[3] - d.b[1] >= 3) {
      if (mode === "plate") { e.plates.push({ box: d.b, text: "", cat: $("#cat").value, province: "", sure: true }); e.none = false; sel = { kind: "plate", i: e.plates.length - 1 }; }
      else if (mode === "blur") { e.blur.push(d.b.concat(["face"])); sel = { kind: "blur", i: e.blur.length - 1 }; e.checked = false; }
      else { e.ignore.push(d.b); sel = { kind: "ignore", i: e.ignore.length - 1 }; }
      dirty = true;
    } else {
      const p = pt(ev); sel = null;
      e.plates.forEach((x, i) => { if (x.box && inside(x.box, p)) sel = { kind: "plate", i }; });
      if (!sel) e.blur.forEach((x, i) => { if (inside(x, p)) sel = { kind: "blur", i }; });
      if (!sel) e.ignore.forEach((x, i) => { if (inside(x, p)) sel = { kind: "ignore", i }; });
    }
    syncForm(); draw();
  });
  function del() {
    if (!sel) return; const e = entry(cur);
    ({ plate: e.plates, blur: e.blur, ignore: e.ignore })[sel.kind].splice(sel.i, 1);
    if (sel.kind === "blur") e.checked = false;
    sel = null; dirty = true; syncForm(); draw();
  }
  document.addEventListener("keydown", ev => { if ((ev.key === "Delete" || ev.key === "Backspace") && !/INPUT|SELECT/.test(/** @type {any} */ (ev.target).tagName)) del(); });
  $("#del").onclick = del;
  for (const [id, m] of [["#modePlate", "plate"], ["#modeBlur", "blur"], ["#modeIgnore", "ignore"]]) $(id).onclick = () => {
    mode = m; for (const x of ["#modePlate", "#modeBlur", "#modeIgnore"]) $(x).setAttribute("aria-pressed", String(x === id));
  };
  const edit = () => { const e = entry(cur), p = sel && sel.kind === "plate" ? e.plates[sel.i] : null; if (!p) return;
    p.cat = $("#cat").value; p.text = $("#text").value.trim(); p.province = $("#prov").value.trim(); p.sure = !$("#unsure").checked; dirty = true; syncForm(); };
  for (const id of ["#cat", "#text", "#prov", "#unsure"]) $(id).addEventListener("change", edit);
  $("#none").onchange = () => { const e = entry(cur); e.none = $("#none").checked; if (e.none) e.plates = []; dirty = true; syncForm(); draw(); };
  $("#checked").onchange = () => { entry(cur).checked = $("#checked").checked; dirty = true; renderList(); };
  $("#auto").onclick = async () => { await autoFaces(); syncForm(); draw(); };

  const cell = v => { const s = v == null ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function serialise() {
    const rows = ["file,category,plate,province,x0,y0,x1,y1,split,sure,notes"], files = {};
    for (const f of photos) {
      const e = S[f]; if (!e) continue;
      if (e.none) rows.push([f, "none", "", "", "", "", "", "", "", "", ""].map(cell).join(","));
      for (const p of e.none ? [] : e.plates) rows.push([f, p.cat || "white", p.text, p.province, ...(p.box || ["", "", "", ""]), "", p.sure ? "" : "n", ""].map(cell).join(","));
      if (e.none || e.plates.length) for (const b of e.ignore) rows.push([f, "ignore", "", "", ...b, "", "", ""].map(cell).join(","));
      if (e.auto || e.blur.length || e.checked) files[f] = { checked: e.checked, regions: e.blur };
    }
    return { labels: rows.join("\n") + "\n", privacy: { v: 1, files } };
  }
  async function save() {
    const r = await fetch("/api/save", { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(serialise()) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { dirty = false; msg("บันทึกแล้ว / saved", "ok"); } else msg("บันทึกไม่ได้ / not saved: " + (j.errors || []).slice(0, 5).join(" · "), "err");
    renderList();
  }
  $("#save").onclick = save;
  $("#export").onclick = async () => {
    if (dirty) await save();
    let n = 0, skipped = 0;
    for (const f of photos) {
      const e = S[f];
      if (!e || !e.checked || !(e.none || e.plates.length)) { skipped++; continue; }
      const im = new Image(); im.src = photoUrl(f); await im.decode();
      const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext("2d").drawImage(im, 0, 0);
      W.LQPCRun.faceBlur(c, e.blur.map(b => ({ x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] })));
      const type = /\.png$/i.test(f) ? "image/png" : "image/jpeg";
      const blob = await new Promise(res => c.toBlob(res, type, 0.92));
      const r = await fetch("/api/blurred/" + encodeURIComponent(f), { method: "POST", headers: H, body: blob });
      if (r.ok) { n++; blurredSet.add(f); }
      msg(`ส่งออก / exported ${n} …`);
    }
    msg(`ส่งออกภาพที่เบลอแล้ว ${n} ภาพ (ข้าม ${skipped} ภาพที่ยังไม่ได้ติ๊ก "ตรวจแล้ว") / exported ${n}, skipped ${skipped} not checked`, "ok");
    renderList();
  };
  window.addEventListener("beforeunload", ev => { if (dirty) { ev.preventDefault(); ev.returnValue = ""; } });
  fetch("/api/state", { headers: H }).then(r => r.json()).then(load).catch(e => msg("load: " + e.message, "err"));
  W.__LQ_LABELLER = { get state() { return S; }, serialise, open };
})();
