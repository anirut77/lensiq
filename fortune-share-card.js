/* fortune-share-card.js — the share dialog and the result card of fortune-share.js (owner order 2026-11-16 item 1).
 * Fetched by fortune-share.js as soon as a result is on screen (never during the first page load), so making and sharing the card
 * needs no network request at all: the card is drawn on a canvas in this browser, the image stays in memory (blob: URL) and is
 * handed to the phone's share sheet or saved; LINE gets text + link only, Facebook the page link only. Nothing is uploaded.
 * Card: 1080 × 1350 (the look of the earlier fortune cards): LENSIQ mark, page name, date, the overview gist, optional photo (face /
 * palm pages, off by default), optional birth line (off by default), the 1323 help line, the disclaimer line, the page link. */
(function (root) {
  "use strict";
  const doc = document;
  const W = 1080, H = 1350, F = 'Prompt, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif';
  const WEIGHTS = ["700", "500", "400"];
  /** load the card's font faces (Thai + Latin subsets of Prompt) for this text, before the tap */
  function fonts(text) {
    if (!doc.fonts || !doc.fonts.load) return Promise.resolve();
    const sample = "LENSIQ กขคงจฉ ABCabc 0123456789 ·…:/" + String(text || "").slice(0, 200);
    return Promise.all(WEIGHTS.map(w => doc.fonts.load(w + " 40px Prompt", sample).catch(() => null))).then(() => undefined);
  }
  function wrap(c, text, maxW) {
    const s = String(text || ""), zh = /[一-鿿]/.test(s) && !/[฀-๿]/.test(s);
    let segs;
    if (zh) segs = s.split("");
    else if (typeof Intl !== "undefined" && Intl.Segmenter) segs = Array.from(new Intl.Segmenter(/[฀-๿]/.test(s) ? "th" : "en", { granularity: "word" }).segment(s), x => x.segment);
    else segs = s.split(/(\s+)/);
    const lines = []; let cur = "";
    for (const sg of segs) { if (c.measureText(cur + sg).width > maxW && cur.trim()) { lines.push(cur.trim()); cur = sg.trimStart(); } else cur += sg; }
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  }
  const rr = (c, x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
  function mulberry(a) {
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  /** draw the card for model m (fortune-share.js cardModel); photo: a canvas or null */
  function draw(m, photo, art) {
    const cv = doc.createElement("canvas"); cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0e1430"); g.addColorStop(1, "#24195e");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const rnd = mulberry(11); c.fillStyle = "rgba(165,243,252,.5)";
    for (let i = 0; i < 80; i++) { c.beginPath(); c.arc(rnd() * W, rnd() * H, rnd() * 2.2 + 0.4, 0, Math.PI * 2); c.fill(); }
    const rg = c.createRadialGradient(W / 2, 380, 40, W / 2, 380, 560); rg.addColorStop(0, "rgba(103,79,242,.45)"); rg.addColorStop(1, "rgba(14,20,48,0)");
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    // LENSIQ mark
    c.save(); c.translate(72, 64);
    rr(c, 0, 0, 60, 60, 18); c.fillStyle = "rgba(255,255,255,.08)"; c.fill();
    c.strokeStyle = "#22d3ee"; c.lineWidth = 4; c.lineCap = "round"; c.beginPath();
    for (const q of [[14, 24, 14, 14, 24, 14], [46, 24, 46, 14, 36, 14], [14, 36, 14, 46, 24, 46], [46, 36, 46, 46, 36, 46]]) { c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); c.lineTo(q[4], q[5]); }
    c.stroke(); c.beginPath(); c.arc(30, 30, 8, 0, Math.PI * 2); c.fillStyle = "#8b78ff"; c.fill();
    c.restore();
    c.textBaseline = "middle"; c.textAlign = "left";
    c.font = "700 40px " + F; c.fillStyle = "#fff"; c.fillText("LENS", 148, 96); const lw = c.measureText("LENS").width; c.fillStyle = "#a99bff"; c.fillText("IQ", 148 + lw, 96);
    c.textAlign = "right"; c.font = "500 30px " + F; c.fillStyle = "#c9d0ea"; c.fillText(m.dateText, W - 72, 96);
    c.textAlign = "center";
    let y = 200;
    if (m.photo && photo) {
      const r = 150, cy = y + r;
      c.beginPath(); c.arc(W / 2, cy, r + 10, 0, Math.PI * 2); c.fillStyle = "#8b78ff"; c.fill();
      c.save(); c.beginPath(); c.arc(W / 2, cy, r, 0, Math.PI * 2); c.clip();
      const s = Math.min(photo.width, photo.height), sx = (photo.width - s) / 2, sy = Math.max(0, (photo.height - s) * 0.3);
      try { c.drawImage(photo, sx, sy, s, s, W / 2 - r, cy - r, 2 * r, 2 * r); } catch (e) { /* tainted or empty */ }
      c.restore();
      y = cy + r + 60;
    } else if (art) {
      c.save(); try { art(c, 90, 160, W - 180, 340, F); } catch (e) { /* the page's art failed: no art */ } c.restore();
      c.textAlign = "center"; c.textBaseline = "middle";
      y = 540;
    } else {
      // a small emblem instead of a photo: crescent and stars
      c.save(); c.translate(W / 2, y + 60);
      c.fillStyle = "#f3c969"; c.beginPath(); c.arc(0, 0, 48, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#1a1846"; c.beginPath(); c.arc(20, -12, 44, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#a5f3fc"; for (const [x, yy, r] of [[-96, -30, 5], [92, 26, 6], [70, -48, 4], [-70, 40, 4]]) { c.beginPath(); c.arc(x, yy, r, 0, Math.PI * 2); c.fill(); }
      c.restore();
      y += 170;
    }
    c.font = "700 56px " + F; c.fillStyle = "#fff";
    const tl = wrap(c, m.title, W - 160).slice(0, 2); tl.forEach((l, k) => c.fillText(l, W / 2, y + k * 66)); y += tl.length * 66 + 10;
    for (const n of m.names || []) { c.font = "500 32px " + F; c.fillStyle = "#f3c969"; c.fillText(wrap(c, n, W - 200)[0] || "", W / 2, y); y += 48; }
    // the overview
    const bottom = m.birthLine ? 1090 : 1140, fs = 34, lh = 50;
    c.font = "500 " + fs + "px " + F;
    let rows = [];
    for (const l of m.lines) rows = rows.concat(wrap(c, l, W - 260), [""]);
    rows = rows.slice(0, -1);
    const maxRows = Math.max(1, Math.floor((bottom - y - 60) / lh));
    if (rows.length > maxRows) { rows = rows.slice(0, maxRows); rows[maxRows - 1] = rows[maxRows - 1].replace(/.$/, "") + "…"; }
    const boxH = rows.length * lh + 56;
    y += Math.max(0, Math.round((bottom - 40 - y - boxH) / 2)); // a short overview sits in the middle of the free space
    rr(c, 90, y, W - 180, boxH, 28); c.fillStyle = "rgba(255,255,255,.09)"; c.fill();
    c.fillStyle = "#fff"; rows.forEach((l, k) => { if (l) c.fillText(l, W / 2, y + 28 + lh / 2 + k * lh); });
    y += boxH + 30;
    if (m.birthLine) { c.font = "400 28px " + F; c.fillStyle = "#c9d0ea"; c.fillText(wrap(c, m.birthLine, W - 180)[0] || "", W / 2, Math.min(y, 1130)); }
    c.font = "500 24px " + F; c.fillStyle = "#a5f3fc";
    wrap(c, m.help, W - 160).slice(0, 2).forEach((l, k) => c.fillText(l, W / 2, 1178 + k * 30));
    c.font = "400 22px " + F; c.fillStyle = "#c9d0ea";
    wrap(c, m.disclaimer, W - 160).slice(0, 2).forEach((l, k) => c.fillText(l, W / 2, 1246 + k * 27));
    c.font = "500 22px " + F; c.fillStyle = "#8b78ff";
    c.fillText(m.link.replace(/^https?:\/\//, ""), W / 2, 1316, W - 120);
    return cv;
  }

  /* ---------- dialog ---------- */
  let dlg = null, state = null, url = "";
  function el(tag, attrs, text) { const e = doc.createElement(tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
  function build(S) {
    const T = k => S.L[lang(S)][k];
    const d = el("div", { id: "lqShareDlg", class: "lq-sp-dlg", role: "dialog", "aria-modal": "true", "aria-labelledby": "lqSpTitle" });
    d.hidden = true;
    const box = el("div", { class: "lq-sp-box" });
    box.appendChild(el("h2", { id: "lqSpTitle" }, T("title")));
    const img = el("img", { id: "lqSpPreview", alt: T("preview") }); box.appendChild(img);
    const tog = (id, k) => {
      const lab = el("label", { for: id, "data-lq-sp-tog": k });
      lab.appendChild(el("input", { type: "checkbox", id })); lab.appendChild(el("span", { "data-k": k }, T(k))); return lab;
    };
    box.appendChild(tog("lqSpPhoto", "photo")); box.appendChild(tog("lqSpBirth", "birth"));
    box.appendChild(el("p", { class: "lq-sp-note", "data-k": "note" }, T("note")));
    const acts = el("div", { class: "lq-sp-acts" });
    for (const [k, cls] of [["native", "btn primary"], ["line", "btn ghost"], ["fb", "btn ghost"], ["save", "btn ghost"], ["close", "btn ghost"]]) {
      const b = el("button", { type: "button", class: cls, "data-lq-sp-act": k, "data-k": k === "fb" ? "facebook" : k }, T(k === "fb" ? "facebook" : k)); acts.appendChild(b);
    }
    box.appendChild(acts); d.appendChild(box); doc.body.appendChild(d);
    d.addEventListener("click", e => { if (e.target === d) close(); });
    d.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    d.querySelector("#lqSpPhoto").addEventListener("change", () => render());
    d.querySelector("#lqSpBirth").addEventListener("change", () => render());
    acts.addEventListener("click", e => { const b = e.target.closest("[data-lq-sp-act]"); if (b) act(b.getAttribute("data-lq-sp-act")); });
    return d;
  }
  const lang = S => {
    try { const l = /** @type {string} */ (root.LQI18N && root.LQI18N.lang); if (l === "en" || l === "zh") return l; } catch (e) { /* none */ }
    const h = /** @type {string} */ (String(doc.documentElement.lang || "").slice(0, 2)); return h === "en" || h === "zh" ? h : "th";
  };
  function relabel(S) {
    const L = S.L[lang(S)];
    for (const e of dlg.querySelectorAll("[data-k]")) e.textContent = L[e.getAttribute("data-k")];
    dlg.querySelector("#lqSpTitle").textContent = L.title; dlg.querySelector("#lqSpPreview").alt = L.preview;
  }
  async function render() {
    const S = state.S, my = ++state.n;
    const inc = { photo: dlg.querySelector("#lqSpPhoto").checked, birth: dlg.querySelector("#lqSpBirth").checked };
    S.last = null;
    try {
      const m = S.model(state.r, inc);
      const cv = draw(m, m.photo ? S.photo() : null, S.artFor(state.r));
      const blob = await new Promise(r => cv.toBlob(r, "image/png"));
      if (my !== state.n || !blob) return;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      state.blob = blob; state.m = m;
      state.file = new File([blob], "lensiq-" + S.page + "-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + ".png", { type: "image/png" });
      const nat = dlg.querySelector('[data-lq-sp-act="native"]');
      let can = false; try { can = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [state.file] })); } catch (e) { can = false; }
      nat.hidden = !can;
      const img = dlg.querySelector("#lqSpPreview"); img.src = url;
      S.last = { page: m.page, lang: m.lang, lines: m.lines, text: m.text, photo: m.photo, birth: m.birth, birthLine: m.birthLine, link: m.link };
    } catch (e) { console.warn(e); S.toast(S.L[lang(S)].fail); }
  }
  function open(S, r) {
    if (!S.allowed(doc)) return false;
    if (!dlg) dlg = build(S);
    relabel(S);
    state = { S, r, n: 0 };
    const P = S.config() || {};
    const ph = dlg.querySelector("#lqSpPhoto"), bi = dlg.querySelector("#lqSpBirth");
    ph.checked = false; bi.checked = false; // off every time the dialog opens
    ph.closest("label").hidden = !(P.photo && S.photo());
    bi.closest("label").hidden = !P.personal;
    dlg.querySelector('[data-lq-sp-act="native"]').hidden = true;
    // an overlay over the current view (absolute, not fixed: it stays a normal box in the page); page scroll paused while open
    dlg.style.top = (root.scrollY || 0) + "px"; dlg.style.height = (root.innerHeight || 640) + "px";
    doc.documentElement.classList.add("lq-sp-open");
    dlg.hidden = false;
    S.last = null;
    render();
    try { dlg.querySelector('[data-lq-sp-act="close"]').focus({ preventScroll: true }); } catch (e) { /* old browser */ }
    return true;
  }
  function close() { if (dlg) dlg.hidden = true; doc.documentElement.classList.remove("lq-sp-open"); }
  function shareText(m) {
    const sep = m.lang === "zh" ? "" : " ";
    let g = m.lines.join(sep); if (g.length > 220) g = g.slice(0, 219) + "…";
    return [m.title, g, m.disclaimer].filter(Boolean).join("\n");
  }
  async function act(k) {
    const S = state && state.S; if (!S) return;
    if (k === "close") { close(); return; }
    if (!S.allowed(doc)) { close(); S.toast(S.L[lang(S)].refused); return; }
    const m = state.m; if (!m) return;
    if (k === "native") {
      try { await navigator.share({ files: [state.file], title: m.title + " — LENSIQ", text: shareText(m) }); }
      catch (e) { if (!e || e.name !== "AbortError") act("save"); }
      return;
    }
    if (k === "line") { root.open(S.lineUrl(shareText(m), m.link), "_blank", "noopener"); return; }
    if (k === "fb") { try { root.open(S.fbUrl(m.link), "_blank", "noopener"); } catch (e) { S.toast(S.L[lang(S)].fail); } return; }
    if (k === "save") {
      const a = doc.createElement("a"); a.href = url; a.download = state.file.name; doc.body.appendChild(a); a.click(); a.remove();
      S.toast(S.L[lang(S)].saved);
    }
  }
  /** @type {any} */ (root).LQShareCard = { fonts, draw, open, close };
})(window);
