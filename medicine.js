/* medicine.js — LENSIQ medicine checker screen (medicine.html). Pure rules live in lensiq-med.js (LQMed, unit-tested).
 * Modes: (1) package — Thai registration no. / food อย. no. / barcode / NDC / drug name, typed, OCR'd from a crop box
 * (PP-OCRv5 Thai, already vendored for Gate) or scanned (BarcodeDetector); (2) loose pill — imprint + colour + shape +
 * size -> CANDIDATES from slim NLM Pillbox data (lazy-loaded). Results show verbatim sourced label text only.
 * Privacy: images stay in memory on this device and are never stored or sent. Online lookups (openFDA, RxNav direct;
 * Thai FDA via the Worker /api/med/*) happen only after the explicit opt-in toggle and send text only.
 * Test seams (localhost only): ?fakenet -> window.__LQ_MED_FETCH(url, init) replaces fetch; ?fakeocr ->
 * window.__LQ_FAKE_OCR() / window.__LQ_FAKE_BARCODE() replace the OCR model / BarcodeDetector. Hook: window.__LQ_MED.
 * The "Product Check" tab (round 17 P2) lives in lensiq-pc-ui.js; it reads cfg.hist from window.__LQ_MED and adds
 * history rows of kind "pc" (text facts only) through the same opt-in history. */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), M = W.LQMed;
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, x) => (v && x in v ? String(v[x]) : m));
  const T = (k, th, v) => (W.LQI18N ? W.LQI18N.tf(k, th, v) : fill(th, v));
  const $ = s => /** @type {any} */ (document.querySelector(s));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const flagOn = f => local && new URLSearchParams(location.search).has(f);
  const net = (url, init) => (flagOn("fakenet") && typeof W.__LQ_MED_FETCH === "function" ? W.__LQ_MED_FETCH(url, init) : fetch(url, init));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: works without it */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  };
  const CFG = "lq-med-cfg", HIST = "lq-med-history", CODES = "lq-med-codes";
  // The online-lookup consent lasts for this browser session only (sessionStorage); the other toggles are remembered.
  const ONLINE = "lq-med-online";
  const SS = {
    get() { try { return sessionStorage.getItem(ONLINE) === "1"; } catch { return false; } },
    set(v) { try { if (v) sessionStorage.setItem(ONLINE, "1"); else sessionStorage.removeItem(ONLINE); } catch { /* storage blocked */ } }
  };
  const saved = LS.get(CFG, {});
  const cfg = { pharm: !!saved.pharm, hist: !!saved.hist, online: SS.get() };
  if ("online" in saved) LS.set(CFG, { pharm: cfg.pharm, hist: cfg.hist }); // drop a consent remembered by an older version
  const saveCfg = () => { LS.set(CFG, { pharm: cfg.pharm, hist: cfg.hist }); SS.set(cfg.online); };
  const PILLBOX_URL = "vendor/pillbox/pillbox-2020-v1.json";
  const THFDA_SITE = M.thfdaSearchUrl();
  const st = { blocks: [], last: null, pill: null, pillData: null, lastBarcode: "", cam: null, still: false, guide: { x: 0.1, y: 0.39, w: 0.8, h: 0.22 } };
  W.__LQ_MED = { st, cfg };

  const status = (el, text, kind) => { el.textContent = text || ""; if (kind) el.dataset.kind = kind; else delete el.dataset.kind; };
  const link = (href, text, cls) => `<a${cls ? ` class="${cls}"` : ""} href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
  const badge = (text, k) => `<span class="md-badge"${k ? ` data-k="${k}"` : ""}>${esc(text)}</span>`;
  const en = s => `<span lang="en" translate="no">${esc(s)}</span>`;
  const btn = (act, text, data = {}) => `<button class="btn ghost small" type="button" data-act="${act}"${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join("")}>${esc(text)}</button>`;

  /* ---------- settings ---------- */
  const apiOn = () => !!(W.LQApi && W.LQApi.enabled());
  function cspAllows(origin) {
    const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const c = m && /connect-src([^;]*)/.exec(m.getAttribute("content") || "");
    return !c || c[1].trim().split(/\s+/).some(x => x === origin || x === "*" || x === "https:");
  }
  function renderServer() {
    const el = $("#mdServer");
    if (!cfg.online) return status(el, T("md.sv.off", "การค้นออนไลน์ปิดอยู่: ทุกอย่างทำงานในเครื่องนี้ ไม่มีข้อมูลออกจากเครื่อง"), "");
    const us = cspAllows(M.OPENFDA) ? T("md.sv.direct", "openFDA / RxNav: ส่งตรงจากเบราว์เซอร์") : apiOn() ? T("md.sv.proxy", "openFDA / RxNav: ผ่านเซิร์ฟเวอร์ของผู้ให้บริการ") : T("md.sv.usNo", "openFDA / RxNav: ยังใช้ไม่ได้บนเว็บนี้ (ต้องตั้งค่าเซิร์ฟเวอร์)");
    const th = apiOn() ? T("md.sv.thOk", "ทะเบียนยาไทย: ผ่านเซิร์ฟเวอร์ของผู้ให้บริการ") : T("md.sv.thNo", "ทะเบียนยาไทย: ต้องมีเซิร์ฟเวอร์ (ยังไม่ได้ตั้งค่า)");
    status(el, us + " · " + th, apiOn() || cspAllows(M.OPENFDA) ? "ok" : "warn");
  }
  function applyCfg() {
    $("#mdOnline").checked = !!cfg.online; $("#mdPharm").checked = !!cfg.pharm; $("#mdHist").checked = !!cfg.hist;
    $("#main").classList.toggle("md-dense", !!cfg.pharm);
    renderServer(); renderHist();
  }
  $("#mdOnline").addEventListener("change", e => {
    cfg.online = e.target.checked; saveCfg(); renderServer();
    if (cfg.online && st.last && st.blocks.length) check(st.last.q, st.last.from); else renderOut();
  });
  $("#mdPharm").addEventListener("change", e => { cfg.pharm = e.target.checked; saveCfg(); applyCfg(); renderOut(); renderPill(); });
  $("#mdHist").addEventListener("change", e => {
    cfg.hist = e.target.checked; saveCfg();
    if (!cfg.hist && (LS.get(HIST, []).length || Object.keys(LS.get(CODES, {})).length) && confirm(T("md.hi.offQ", "ปิดการเก็บประวัติแล้ว ลบประวัติที่เก็บไว้ด้วยหรือไม่?"))) { LS.del(HIST); LS.del(CODES); }
    renderHist(); renderOut();
  });

  /* ---------- tabs ---------- */
  const tabs = /** @type {HTMLElement[]} */ ([...document.querySelectorAll("[data-tab]")]);
  function showTab(id) {
    tabs.forEach(b => { const on = b.dataset.tab === id; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; $("#tab-" + b.dataset.tab).hidden = !on; });
    if (id !== "pack") stopCam();
    if (id === "hist") renderHist();
  }
  tabs.forEach((b, i) => {
    b.addEventListener("click", () => showTab(b.dataset.tab));
    b.addEventListener("keydown", e => { // WAI-ARIA tabs: arrows / Home / End move and activate
      const n = tabs.length, j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
      if (j < 0) return;
      e.preventDefault(); showTab(tabs[j].dataset.tab); tabs[j].focus();
    });
  });

  /* ---------- safety ---------- */
  function emergencyCheck(text) {
    const e = M.emergency(text);
    if (!e.poison) return false;
    const box = $("#mdEmerg");
    box.hidden = false; $("#mdEmSelf").hidden = !e.self;
    box.scrollIntoView({ block: "start" }); box.focus({ preventScroll: true });
    return true;
  }

  /* ---------- network (text only) ---------- */
  async function getJSON(url, ms = 15000) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
    try {
      const r = await net(url, { method: "GET", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", signal: ac.signal });
      let j = null; try { j = await r.json(); } catch { /* not JSON */ }
      return { ok: r.ok, status: r.status, j };
    } catch { return { ok: false, status: 0, j: null }; } finally { clearTimeout(t); }
  }
  const viaApi = path => (apiOn() ? getJSON(W.LQApi.url(path)) : Promise.resolve({ ok: false, status: 0, j: null, noServer: true }));
  async function openfda(o) {
    if (cspAllows(M.OPENFDA)) {
      const r = await getJSON(M.openfdaLabelUrl(o));
      if (r.status === 404) return { ok: true, status: 200, j: { results: [], meta: r.j && r.j.meta } };
      if (r.status) return r;
    }
    const by = o.setid ? "setid" : o.ndc ? "ndc" : "name", q = o.setid || (o.ndc ? [].concat(o.ndc).join(" ") : o.name);
    return viaApi(`/api/med/openfda?by=${by}&q=${encodeURIComponent(q)}`);
  }
  async function rxnav(term) {
    if (cspAllows(M.RXNAV)) { const r = await getJSON(M.rxnavApproxUrl(term)); if (r.status) return r; }
    return viaApi(`/api/med/rxnav?term=${encodeURIComponent(M.cleanTerm(term))}`);
  }

  /* ---------- history ---------- */
  // never store emergency / self-harm wording, even with history on
  function addHist(kind, q, r) { if (cfg.hist && !M.emergency(q).poison) LS.set(HIST, M.historyAdd(LS.get(HIST, []), { kind, q, r })); }
  const KIND = () => ({ pack: T("md.hi.k.pack", "กล่อง/ฉลาก"), pill: T("md.hi.k.pill", "เม็ดยา"), label: T("md.hi.k.label", "ฉลาก"), thfda: T("md.hi.k.thfda", "ทะเบียนไทย"),
    pc: T("md.hi.k.pc", "ตรวจสินค้า") });
  function renderHist() {
    const list = LS.get(HIST, []), box = $("#mdHistList");
    $("#mdHistNote").textContent = cfg.hist ? T("md.hi.on", "กำลังเก็บประวัติในเบราว์เซอร์นี้ (สูงสุด 200 รายการ) ไม่ส่งออกจากเครื่อง")
      : T("md.hi.offNote", "ไม่ได้เก็บประวัติ (ค่าเริ่มต้น) เปิด 'เก็บประวัติการค้นในเครื่องนี้' ด้านบนถ้าต้องการ");
    if (!list.length) { box.innerHTML = `<p class="hint">${esc(T("md.hi.empty", "ยังไม่มีประวัติ"))}</p>`; return; }
    const k = KIND();
    box.innerHTML = `<div class="table-wrap"><table class="md-table"><thead><tr><th>${esc(T("md.hi.when", "เวลา"))}</th><th>${esc(T("md.hi.kind", "ประเภท"))}</th><th>${esc(T("md.hi.q", "ค้นด้วย"))}</th><th>${esc(T("md.hi.r", "ผลที่พบ"))}</th></tr></thead><tbody>` +
      list.map(e => `<tr><td>${esc(new Date(e.at).toLocaleString())}</td><td>${esc(k[e.kind] || e.kind)}</td><td translate="no">${esc(e.q)}</td><td translate="no">${esc(e.r)}</td></tr>`).join("") + "</tbody></table></div>";
  }
  $("#mdHistClear").addEventListener("click", () => { if (confirm(T("md.hi.clearQ", "ลบประวัติและบาร์โค้ดที่จำไว้ทั้งหมดในเครื่องนี้?"))) { LS.del(HIST); LS.del(CODES); renderHist(); } });
  $("#mdHistCsv").addEventListener("click", () => {
    const rows = LS.get(HIST, []).map(e => ({ time: new Date(e.at).toISOString(), kind: e.kind, query: e.q, result: e.r }));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + M.toCSV(rows, ["time", "kind", "query", "result"])], { type: "text/csv;charset=utf-8" }));
    a.download = "lensiq-medicine-history.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  /* ---------- package: result blocks ---------- */
  const offMsg = what => `<p class="md-status" data-kind="warn">${esc(T("md.r.off", "การค้นออนไลน์ปิดอยู่ เปิด 'อนุญาตค้นข้อมูลออนไลน์' ด้านบนเพื่อค้น {src} (ส่งเฉพาะข้อความ)", { src: what }))}</p>${btn("go-online", T("md.r.goOnline", "ไปที่การตั้งค่า"))}`;
  const card = (k, inner) => `<section class="card md-res" data-k="${k}">${inner}</section>`;
  function renderOut() { $("#mdOut").innerHTML = st.blocks.map(b => b.render()).join(""); }
  function addBlock(b) { st.blocks.push(b); renderOut(); return b; }

  function regBlock(r) {
    const b = { state: "idle", rows: [], render() {
      let h = `<h3>${esc(T("md.r.reg", "เลขทะเบียนยาไทย"))} <span translate="no">${esc(r.norm)}</span></h3>` +
        `<p class="hint">${esc(T("md.r.regYear", "ปีที่ขึ้นทะเบียนตามเลข: พ.ศ. {y} ความหมายของตัวเลขและตัวอักษรอื่นยังไม่ได้ยืนยันกับ อย. ระบบจึงไม่แปลความหมาย", { y: r.yearBE }))}</p>` +
        (r.uncertain ? `<p class="md-status" data-kind="warn">${esc(T("md.r.regUnsure", "เลขนี้ไม่มีตัวเลขนำหน้า อาจเป็นเลขครั้งที่ผลิตหรือวันหมดอายุ ไม่ใช่เลขทะเบียน ตรวจกับกล่องอีกครั้ง"))}</p>` : "");
      if (!cfg.online) h += offMsg(T("md.src.thfda", "ทะเบียนยาไทย (อย.)"));
      else if (!apiOn()) h += `<p class="md-status" data-kind="warn">${esc(T("md.r.noServer", "ต้องมีเซิร์ฟเวอร์: การตรวจทะเบียนยาไทยต้องผ่านเซิร์ฟเวอร์ตัวกลาง ซึ่งเว็บนี้ยังไม่ได้ตั้งค่า ตรวจเองได้ที่เว็บไซต์ อย."))}</p><p>${link(THFDA_SITE, T("md.r.thSite", "ค้นที่เว็บไซต์ อย."))}</p>`;
      else if (b.state === "loading") h += `<p class="md-status">${esc(T("md.r.loading", "กำลังค้น…"))}</p>`;
      else if (b.state === "error") h += `<p class="md-status" data-kind="err">${esc(T("md.r.err", "ค้นไม่สำเร็จ ลองใหม่ภายหลัง หรือตรวจเองที่เว็บไซต์ อย."))}</p><p>${link(THFDA_SITE, T("md.r.thSite", "ค้นที่เว็บไซต์ อย."))}</p>`;
      else if (b.state === "done") h += thRows(b.rows, b.fetched);
      return card(b.state === "done" && b.rows.some(x => x.status === "active") ? "ok" : b.state === "done" ? "warn" : "info", h);
    } };
    addBlock(b);
    if (cfg.online && apiOn()) thLookup(b, r.norm);
    return b;
  }
  async function thLookup(b, q) {
    b.state = "loading"; renderOut();
    const r = await viaApi(`/api/med/thfda?q=${encodeURIComponent(q)}`);
    if (!r.ok || !r.j || !Array.isArray(r.j.rows)) { b.state = "error"; renderOut(); return; }
    b.state = "done"; b.rows = r.j.rows; b.fetched = r.j.fetched || ""; b.q = q;
    addHist("thfda", q, b.rows.slice(0, 3).map(x => `${x.lcnno} ${x.name_en || x.name_th} (${x.status})`).join("; "));
    renderOut();
  }
  const STATUS = () => ({ active: [T("md.th.active", "ทะเบียนยังคงอยู่"), "ok"], cancelled: [T("md.th.cancelled", "ทะเบียนถูกยกเลิก"), "bad"], expired: [T("md.th.expired", "ทะเบียนหมดอายุ"), "bad"], pending: [T("md.th.pending", "รอตรวจสอบสถานะ"), "warn"], unknown: [T("md.th.unknown", "ไม่ทราบสถานะ"), "warn"] });
  const KINDS = () => ({ dangerous: [T("md.th.dangerous", "ยาอันตราย: ต้องจ่ายโดยเภสัชกร"), "warn"], special: [T("md.th.special", "ยาควบคุมพิเศษ: ใช้ตามใบสั่งและการดูแลของแพทย์"), "bad"],
    household: [T("md.th.household", "ยาสามัญประจำบ้าน"), "ok"], nondangerous: [T("md.th.nondangerous", "ยาที่ไม่ใช่ยาอันตรายหรือยาควบคุมพิเศษ"), ""], unknown: [T("md.th.kindUnknown", "ประเภทยาตามทะเบียน (ดูข้อความต้นฉบับ)"), ""] });
  function thRows(rows, fetched) {
    if (!rows.length) return `<p class="md-status" data-kind="warn">${esc(T("md.th.none", "ไม่พบเลขนี้ในบริการค้นข้อมูลของ อย. ตรวจว่าพิมพ์ถูกต้อง หรือสอบถามเภสัชกร ยาที่ไม่มีทะเบียนอาจผิดกฎหมาย"))}</p><p>${link(THFDA_SITE, T("md.r.thSite", "ค้นที่เว็บไซต์ อย."))}</p>`;
    const S = STATUS(), K = KINDS();
    const out = rows.slice(0, cfg.pharm ? 50 : 10).map(x => {
      const s = S[x.status] || S.unknown, k = K[M.thfdaKind(x.kind)] || K.unknown;
      return `<div class="md-cand"><div class="md-badges">${badge(s[0], s[1])}${badge(k[0], k[1])}</div>` +
        `<dl class="md-kv"><dt>${esc(T("md.th.no", "เลขทะเบียน"))}</dt><dd translate="no">${esc(x.lcnno)}</dd>` +
        `<dt>${esc(T("md.th.nameTh", "ชื่อ (ไทย)"))}</dt><dd lang="th">${esc(x.name_th)}</dd><dt>${esc(T("md.th.nameEn", "ชื่อ (อังกฤษ)"))}</dt><dd translate="no">${esc(x.name_en)}</dd>` +
        `<dt>${esc(T("md.th.lic", "ผู้รับอนุญาต"))}</dt><dd lang="th">${esc(x.licensee)}</dd><dt>${esc(T("md.th.statusRaw", "สถานะตามต้นฉบับ"))}</dt><dd lang="th">${esc(x.status_text)}</dd>` +
        `<dt>${esc(T("md.th.kindRaw", "ประเภทตามต้นฉบับ"))}</dt><dd lang="th">${esc([x.use, x.kind].filter(Boolean).join(" · "))}</dd></dl>` +
        `<div class="md-row">${x.url ? link(x.url, T("md.th.page", "หน้าข้อมูลผลิตภัณฑ์ที่ อย."), "btn ghost small") : ""}` +
        `${x.name_en && /[A-Za-z]{3}/.test(x.name_en) ? btn("rx-name", T("md.th.usLabel", "หาฉลากสหรัฐฯ จากชื่อภาษาอังกฤษ (อาจต่างจากยาไทย)"), { q: x.name_en.replace(/\d.*$/, "").trim() || x.name_en }) : ""}` +
        `${cfg.hist && st.lastBarcode ? btn("remember", T("md.th.remember", "จำบาร์โค้ด {b} คู่กับเลขนี้ในเครื่องนี้", { b: st.lastBarcode }), { reg: x.lcnno }) : ""}</div></div>`;
    }).join("");
    return `<p class="hint">${esc(T("md.th.src", "แหล่งข้อมูล: บริการค้นข้อมูลทะเบียนยา สำนักงานคณะกรรมการอาหารและยา ค้นเมื่อ {t} ข้อมูลทะเบียนไม่มีข้อบ่งใช้หรือวิธีใช้ ให้อ่านจากฉลากและเอกสารกำกับยา", { t: fetched ? new Date(fetched).toLocaleString() : "-" }))}</p><div class="md-cands">${out}</div>`;
  }
  function foodBlock(f) {
    addBlock({ render: () => card("warn", `<h3>${esc(T("md.r.food", "เลขสารบบอาหาร (อย. 13 หลัก)"))} <span translate="no">${esc(f.norm)}</span></h3>` +
      `<p><b>${esc(T("md.r.foodB", "นี่ไม่ใช่เลขทะเบียนยา"))}</b> ${esc(T("md.r.foodT", "ผลิตภัณฑ์ที่มีเลขนี้ขึ้นทะเบียนเป็นอาหารหรือผลิตภัณฑ์เสริมอาหาร ไม่ใช่ยา อาหารไม่ควรอ้างว่ารักษา บรรเทา หรือป้องกันโรค ถ้ามีการโฆษณาแบบนั้นให้สอบถามเภสัชกร"))}</p>` +
      `<p>${link(THFDA_SITE, T("md.r.thSite", "ค้นที่เว็บไซต์ อย."))}</p>`) });
  }
  function barcodeBlock(b) {
    const remembered = cfg.hist ? LS.get(CODES, {})[b.digits] : "";
    addBlock({ render: () => {
      let h = `<h3>${esc(T("md.r.bar", "บาร์โค้ด"))} <span translate="no">${esc(b.digits)}</span></h3><div class="md-badges">${badge(b.type.toUpperCase())}${b.valid ? badge(T("md.r.barOk", "เลขตรวจสอบถูกต้อง"), "ok") : badge(T("md.r.barBad", "เลขตรวจสอบไม่ตรง: อ่านหรือพิมพ์ใหม่"), "warn")}</div>`;
      if (b.thai) h += `<p>${esc(T("md.r.barTh", "บาร์โค้ด GS1 ประเทศไทย (885) ยังไม่มีฐานข้อมูลเปิดที่จับคู่บาร์โค้ดกับยา ให้ใช้เลขทะเบียนยาบนกล่อง (เช่น 1A 15/50) แทน"))}</p>`;
      else if (!b.ndcs.length) h += `<p>${esc(T("md.r.barOther", "ไม่รู้จักรูปแบบบาร์โค้ดนี้ว่าเป็นยา ให้ใช้เลขทะเบียนยาหรือชื่อยาบนกล่องแทน"))}</p>`;
      else h += `<p>${esc(T("md.r.barNdc", "บาร์โค้ดยาสหรัฐฯ: มีรหัส NDC อยู่ข้างใน (ค้นได้หลายรูปแบบ {n})", { n: b.ndcs.join(", ") }))}</p>`;
      if (remembered) h += `<p>${esc(T("md.r.barMem", "เคยจำไว้ในเครื่องนี้คู่กับเลขทะเบียน {r}", { r: remembered }))}</p>${btn("check", T("md.r.barMemGo", "ตรวจเลขทะเบียนนี้"), { q: remembered })}`;
      return card("info", h);
    } });
    if (b.ndcs.length) labelBlock({ ndc: b.ndcs }, "ndc");
  }
  function labelBlock(o, ctx) {
    const b = { state: "idle", labels: [], meta: null, render() {
      const what = o.setid ? T("md.l.bySet", "ฉลากตาม set id") : o.ndc ? T("md.l.byNdc", "ฉลากตามรหัส NDC {n}", { n: [].concat(o.ndc).join(", ") }) : T("md.l.byName", "ฉลากยาสหรัฐฯ ที่ชื่อตรงกับ {n}", { n: o.name });
      let h = `<h3>${esc(what)}</h3>`;
      if (!cfg.online) return card("info", h + offMsg("openFDA"));
      if (b.state === "loading") return card("info", h + `<p class="md-status">${esc(T("md.r.loading", "กำลังค้น…"))}</p>`);
      if (b.state === "noserver") return card("warn", h + `<p class="md-status" data-kind="warn">${esc(T("md.l.noRoute", "ยังค้น openFDA จากเว็บนี้ไม่ได้: ต้องเพิ่ม api.fda.gov ในนโยบายความปลอดภัยของหน้า หรือตั้งค่าเซิร์ฟเวอร์"))}</p>`);
      if (b.state === "error") return card("warn", h + `<p class="md-status" data-kind="err">${esc(T("md.l.err", "ค้น openFDA ไม่สำเร็จ (อาจเกินโควตารายวัน) ลองใหม่ภายหลัง"))}</p>`);
      if (b.state !== "done") return card("info", h);
      if (!b.labels.length) return card("warn", h + `<p>${esc(T("md.l.none", "ไม่พบฉลากใน openFDA (มีเฉพาะยาในตลาดสหรัฐฯ) ใช้ฉลากและเอกสารกำกับยาในกล่อง หรือสอบถามเภสัชกร"))}</p>`);
      h += `<p class="md-warn">${esc(T("md.l.us", "ฉลากของสหรัฐฯ อาจต่างจากฉลากยาที่ขายในไทย ข้อความด้านล่างเป็นภาษาอังกฤษตามต้นฉบับ ไม่ได้แปล ไม่ใช่คำแนะนำให้ใช้ยา"))}</p>`;
      h += b.labels.map(renderLabel).join("");
      h += `<p class="hint">${esc(T("md.l.disc", "ข้อความจาก openFDA (ต้นฉบับ):"))} ${en((b.meta && b.meta.disclaimer) || "Do not rely on openFDA to make decisions regarding medical care. While we make every effort to ensure that data is accurate, you should assume all results are unvalidated.")}</p>`;
      return card("info", h);
    } };
    addBlock(b);
    if (cfg.online) fetchLabel(b, o, ctx);
    return b;
  }
  async function fetchLabel(b, o, ctx) {
    b.state = "loading"; renderOut();
    const r = await openfda(o);
    if (r.noServer) { b.state = "noserver"; renderOut(); return; }
    if (!r.ok || !r.j) { b.state = "error"; renderOut(); return; }
    b.labels = (r.j.results || []).slice(0, cfg.pharm ? 3 : 2).map(x => M.labelSections(x, { maxChars: cfg.pharm ? 12000 : 4000 }));
    b.meta = r.j.meta || null; b.state = "done";
    addHist("label", o.setid || (o.ndc ? [].concat(o.ndc).join(" ") : o.name), b.labels.map(l => l.title || l.generic).join("; ") || "-");
    renderOut();
  }
  const SEC = () => ({ boxed_warning: T("md.sec.boxed", "คำเตือนในกรอบ (Boxed warning)"), purpose: T("md.sec.purpose", "วัตถุประสงค์ของยา"), indications_and_usage: T("md.sec.ind", "ข้อบ่งใช้"),
    dosage_and_administration: T("md.sec.dose", "วิธีใช้ตามฉลาก (ข้อความต้นฉบับ สำหรับผู้ใหญ่ตามที่ฉลากเขียน)"), contraindications: T("md.sec.contra", "ข้อห้ามใช้"), do_not_use: T("md.sec.dnu", "ห้ามใช้"),
    warnings: T("md.sec.warn", "คำเตือน"), warnings_and_cautions: T("md.sec.wc", "คำเตือนและข้อควรระวัง"), ask_doctor: T("md.sec.askDr", "ปรึกษาแพทย์ก่อนใช้"),
    ask_doctor_or_pharmacist: T("md.sec.askPh", "ปรึกษาแพทย์หรือเภสัชกรก่อนใช้"), stop_use: T("md.sec.stop", "หยุดใช้และปรึกษาแพทย์เมื่อ"), pregnancy_or_breast_feeding: T("md.sec.preg", "ตั้งครรภ์หรือให้นมบุตร"),
    keep_out_of_reach_of_children: T("md.sec.kids", "เก็บให้พ้นมือเด็ก"), overdosage: T("md.sec.over", "การได้รับยาเกินขนาด"), storage_and_handling: T("md.sec.store", "การเก็บรักษา"),
    active_ingredient: T("md.sec.active", "ตัวยาสำคัญ"), inactive_ingredient: T("md.sec.inactive", "ส่วนประกอบอื่น") });
  const OPEN = new Set(["boxed_warning", "indications_and_usage", "dosage_and_administration", "contraindications", "do_not_use", "warnings"]);
  function renderLabel(l) {
    const S = SEC();
    const rx = /PRESCRIPTION/i.test(l.rx) ? badge(T("md.l.rx", "ยาตามใบสั่งแพทย์ (สหรัฐฯ)"), "warn") : /OTC/i.test(l.rx) ? badge(T("md.l.otc", "ยาที่ซื้อเองได้ (สหรัฐฯ)")) : "";
    return `<div class="md-label md-cand"><p class="md-imp" translate="no">${esc(l.title || l.generic || "-")}</p><div class="md-badges">${badge(T("md.l.usB", "ฉลากสหรัฐฯ"), "warn")}${rx}</div>` +
      `<dl class="md-kv"><dt>${esc(T("md.l.generic", "ชื่อสามัญ"))}</dt><dd translate="no">${esc(l.generic || "-")}</dd><dt>${esc(T("md.l.brand", "ชื่อการค้า"))}</dt><dd translate="no">${esc(l.brand || "-")}</dd>` +
      `<dt>${esc(T("md.l.maker", "ผู้ผลิต/ผู้จัดจำหน่าย"))}</dt><dd translate="no">${esc(l.manufacturer || "-")}</dd><dt>${esc(T("md.l.date", "ฉลากฉบับวันที่"))}</dt><dd>${esc(l.effective || "-")}</dd>` +
      `<dt>${esc(T("md.l.src", "แหล่งที่มา"))}</dt><dd>${l.source ? link(l.source, "DailyMed (NLM)") : "openFDA"}</dd></dl>` +
      (l.setid ? `<p class="md-ref" translate="no">set id ${esc(l.setid)}</p>` : "") +
      l.sections.map(s => `<details${cfg.pharm || OPEN.has(s.id) ? " open" : ""}><summary>${esc(S[s.id] || s.id)}</summary><div class="md-text" lang="en" translate="no">${esc(s.text)}</div>` +
        (s.cut ? `<p class="hint">${esc(T("md.l.cut", "ข้อความยาวกว่านี้ อ่านฉบับเต็มที่แหล่งที่มา"))}</p>` : "") + "</details>").join("");
  }
  function nameBlock(q) {
    const b = { state: "idle", cands: [], render() {
      let h = `<h3>${esc(T("md.n.h", "ชื่อยา"))} <span translate="no">${esc(q)}</span></h3>`;
      const latin = /[A-Za-z]{3}/.test(q);
      if (!latin) h += `<p class="hint">${esc(T("md.n.thai", "ฐานข้อมูลฉลากที่เปิดให้ใช้มีเฉพาะชื่อภาษาอังกฤษ พิมพ์ชื่อสามัญภาษาอังกฤษ เช่น paracetamol หรือใช้เลขทะเบียนยาบนกล่อง"))}</p>`;
      if (!cfg.online) return card("info", h + offMsg("RxNav / openFDA" + (apiOn() ? " / " + T("md.src.thfda", "ทะเบียนยาไทย (อย.)") : "")));
      if (latin) {
        if (b.state === "loading") h += `<p class="md-status">${esc(T("md.r.loading", "กำลังค้น…"))}</p>`;
        else if (b.state === "error") h += `<p class="md-status" data-kind="warn">${esc(T("md.n.err", "ค้นชื่อใน RxNav ไม่สำเร็จ ยังค้นฉลากด้วยชื่อที่พิมพ์ได้"))}</p>`;
        else if (b.state === "done") h += b.cands.length ? `<p>${esc(T("md.n.sugg", "ชื่อที่ใกล้เคียงใน RxNorm (เลือกเพื่อดูฉลาก):"))}</p><div class="md-sugg">${b.cands.slice(0, 6).map(c => btn("label-name", c.name || "RxCUI " + c.rxcui, { q: c.name || q })).join("")}</div>` : `<p>${esc(T("md.n.none", "ไม่พบชื่อที่ใกล้เคียงใน RxNorm"))}</p>`;
      }
      h += `<div class="md-row">${latin ? btn("label-name", T("md.n.label", "ดูฉลากสหรัฐฯ ด้วยชื่อ {n}", { n: q }), { q }) : ""}${apiOn() ? btn("th-name", T("md.n.th", "ค้นชื่อนี้ในทะเบียนยาไทย"), { q }) : ""}</div>`;
      return card("info", h);
    } };
    addBlock(b);
    if (cfg.online && /[A-Za-z]{3}/.test(q)) (async () => {
      b.state = "loading"; renderOut();
      const r = await rxnav(q);
      if (!r.ok || !r.j) { b.state = "error"; renderOut(); return; }
      const seen = new Set();
      b.cands = M.rxnavCandidates(r.j).filter(c => c.name && !seen.has(c.name.toLowerCase()) && seen.add(c.name.toLowerCase()));
      b.state = "done"; renderOut();
    })();
  }

  async function check(text, from = "text") {
    const q = String(text || "").trim(), out = $("#mdPkStatus");
    if (!q) { status(out, T("md.st.empty", "พิมพ์ สแกน หรืออ่านข้อมูลจากกล่องก่อน"), "warn"); return; }
    emergencyCheck(q);
    const det = M.classify(q, { from });
    st.blocks = []; st.lastBarcode = ""; st.last = { q, from };
    if (!det.length) { status(out, T("md.st.unknown", "ไม่รู้จักรูปแบบนี้ ลองพิมพ์เลขทะเบียน (เช่น 1A 15/50) หรือชื่อยา"), "warn"); renderOut(); return; }
    status(out, T("md.st.found", "พบ {n} รายการที่ตรวจได้", { n: det.length }), "ok");
    for (const d of det) {
      if (d.kind === "thai-reg") regBlock(d);
      else if (d.kind === "food") foodBlock(d);
      else if (d.kind === "barcode") { st.lastBarcode = d.digits; barcodeBlock(d); }
      else if (d.kind === "ndc") labelBlock({ ndc: d.ndc }, "ndc");
      else if (d.kind === "name") nameBlock(d.q);
    }
    addHist("pack", q, det.map(d => d.kind).join(", "));
  }
  $("#mdCheck").addEventListener("click", () => check($("#mdQ").value));
  $("#mdQ").addEventListener("keydown", e => { if (e.key === "Enter") check($("#mdQ").value); });
  $("#mdOut").addEventListener("click", e => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const a = t.dataset.act;
    if (a === "go-online") { $("#mdOnline").scrollIntoView({ block: "center" }); $("#mdOnline").focus(); }
    else if (a === "label-name" || a === "rx-name") { if (a === "rx-name") nameBlock(t.dataset.q); else labelBlock({ name: t.dataset.q }, "name"); }
    else if (a === "th-name") thLookup(addBlock({ state: "idle", rows: [], render() { return card(this.state === "done" && this.rows.length ? "ok" : "info", `<h3>${esc(T("md.n.thH", "ทะเบียนยาไทยที่ชื่อตรงกับ {n}", { n: t.dataset.q }))}</h3>` + (this.state === "loading" ? `<p class="md-status">${esc(T("md.r.loading", "กำลังค้น…"))}</p>` : this.state === "error" ? `<p class="md-status" data-kind="err">${esc(T("md.r.err", "ค้นไม่สำเร็จ ลองใหม่ภายหลัง หรือตรวจเองที่เว็บไซต์ อย."))}</p>` : this.state === "done" ? thRows(this.rows, this.fetched) : "")); } }), t.dataset.q);
    else if (a === "remember" && cfg.hist && st.lastBarcode) { const c = LS.get(CODES, {}); c[st.lastBarcode] = t.dataset.reg; LS.set(CODES, c); t.disabled = true; t.textContent = T("md.th.remembered", "จำไว้แล้วในเครื่องนี้"); }
    else if (a === "check") { $("#mdQ").value = t.dataset.q; check(t.dataset.q); }
  });

  /* ---------- camera / still image + crop box (images stay in memory only) ---------- */
  const video = $("#mdVideo"), still = $("#mdStill"), camBox = $("#mdCam"), guideEl = $("#mdGuide");
  function placeGuide() { const g = st.guide; Object.assign(guideEl.style, { left: g.x * 100 + "%", top: g.y * 100 + "%", width: g.w * 100 + "%", height: g.h * 100 + "%" }); }
  function fit(cw, ch, mw, mh) { const k = Math.min(cw / mw, ch / mh), w = mw * k, h = mh * k; return { x: (cw - w) / 2, y: (ch - h) / 2, w, h, k }; }
  function source() {
    if (st.still) return { el: still, w: still.width, h: still.height };
    if (st.cam && st.cam.active && video.videoWidth) return { el: video, w: video.videoWidth, h: video.videoHeight };
    return null;
  }
  function cropCanvas() {
    const s = source();
    if (!s) return null;
    const r = camBox.getBoundingClientRect(), f = fit(r.width, r.height, s.w, s.h), g = st.guide;
    const x0 = Math.max(0, (g.x * r.width - f.x) / f.k), y0 = Math.max(0, (g.y * r.height - f.y) / f.k);
    const w = Math.min(s.w - x0, (g.w * r.width) / f.k), h = Math.min(s.h - y0, (g.h * r.height) / f.k);
    if (!(w > 8 && h > 6)) return null;
    const c = document.createElement("canvas"), sc = Math.min(3, Math.max(1, 320 / w));
    c.width = Math.round(w * sc); c.height = Math.round(h * sc);
    /** @type {CanvasRenderingContext2D} */ (c.getContext("2d")).drawImage(s.el, x0, y0, w, h, 0, 0, c.width, c.height);
    return c;
  }
  let drag = null;
  camBox.addEventListener("pointerdown", e => { const r = camBox.getBoundingClientRect(); drag = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; camBox.setPointerCapture(e.pointerId); });
  camBox.addEventListener("pointermove", e => {
    if (!drag) return;
    const r = camBox.getBoundingClientRect(), x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    if (Math.abs(x - drag.x) > 0.04 && Math.abs(y - drag.y) > 0.03) { st.guide = { x: Math.min(x, drag.x), y: Math.min(y, drag.y), w: Math.abs(x - drag.x), h: Math.abs(y - drag.y) }; placeGuide(); }
  });
  camBox.addEventListener("pointerup", () => { drag = null; });
  camBox.addEventListener("keydown", e => { // keyboard: arrows move the crop box, Shift + arrows resize it
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const g = { ...st.guide }, step = 0.02, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    if (e.shiftKey) { g.w = clamp(g.w + d[0] * step, 0.08, 1 - g.x); g.h = clamp(g.h + d[1] * step, 0.06, 1 - g.y); }
    else { g.x = clamp(g.x + d[0] * step, 0, 1 - g.w); g.y = clamp(g.y + d[1] * step, 0, 1 - g.h); }
    st.guide = g; placeGuide();
  });
  async function startCam() {
    const out = $("#mdPkStatus");
    $("#mdCamWrap").hidden = false; st.still = false; still.hidden = true; video.hidden = false;
    try {
      if (!st.cam) st.cam = W.LQCam.create(video, { facing: "environment", ideal: { width: 1280, height: 720 }, mirror: false });
      await st.cam.start();
      status(out, T("md.st.camOn", "กล้องเปิดอยู่ ภาพไม่ถูกบันทึกหรือส่งออก"), "ok");
    } catch (err) { status(out, W.LQCam && W.LQCam.errorText ? W.LQCam.errorText(err) : T("md.st.camErr", "เปิดกล้องไม่ได้"), "err"); }
  }
  function stopCam() {
    if (st.cam) { try { st.cam.stop(); } catch { /* already stopped */ } }
    if (st.still) { const x = still.getContext("2d"); x.clearRect(0, 0, still.width, still.height); still.width = still.height = 1; st.still = false; }
    $("#mdCamWrap").hidden = true;
  }
  $("#mdCamBtn").addEventListener("click", startCam);
  $("#mdCamStop").addEventListener("click", () => { stopCam(); status($("#mdPkStatus"), T("md.st.camOff", "ปิดกล้องและล้างรูปแล้ว"), ""); });
  $("#mdFile").addEventListener("change", async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (st.cam) { try { st.cam.stop(); } catch { /* ignore */ } }
    const url = URL.createObjectURL(f);
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      still.width = Math.round(img.naturalWidth * k); still.height = Math.round(img.naturalHeight * k);
      /** @type {CanvasRenderingContext2D} */ (still.getContext("2d")).drawImage(img, 0, 0, still.width, still.height);
      st.still = true; still.hidden = false; video.hidden = true; $("#mdCamWrap").hidden = false;
      status($("#mdPkStatus"), T("md.st.still", "โหลดรูปแล้ว (อยู่ในหน่วยความจำเท่านั้น) ลากบนรูปเพื่อเลือกบริเวณเลขทะเบียน"), "ok");
    } catch { status($("#mdPkStatus"), T("md.st.imgErr", "เปิดรูปนี้ไม่ได้"), "err"); } finally { URL.revokeObjectURL(url); }
  });
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
  async function ocr(crop) {
    if (flagOn("fakeocr") && typeof W.__LQ_FAKE_OCR === "function") return String(W.__LQ_FAKE_OCR() || "");
    if (!W.ort) await loadScript("vendor/ort/ort.wasm.min.js");
    if (!W.LQPlate) await loadScript("lensiq-plate.js?v=3");
    const P = W.LQPlate, whole = (await P.recognize(P.tightText ? P.tightText(crop) : crop)).text || "";
    if (M.classify(whole).some(d => d.kind !== "name")) return whole;
    const g = P.grayOf(crop, crop.width), bands = P.splitLines(g.gray, g.W, g.H).slice(0, 3), lines = [];
    for (const bd of bands) {
      const h = bd.y1 - bd.y0;
      if (h < 8) continue;
      const bc = document.createElement("canvas"), px = Math.round(h * 0.3);
      bc.width = crop.width + 2 * px; bc.height = h;
      const x = /** @type {CanvasRenderingContext2D} */ (bc.getContext("2d"));
      x.fillStyle = "#fff"; x.fillRect(0, 0, bc.width, h); x.drawImage(crop, 0, bd.y0, crop.width, h, px, 0, crop.width, h);
      lines.push((await P.recognize(P.tightText ? P.tightText(bc) : bc)).text || "");
    }
    return lines.length ? lines.join(" ") + " " + whole : whole;
  }
  W.__LQ_MED.ocr = ocr;
  $("#mdOcrBtn").addEventListener("click", async () => {
    const out = $("#mdPkStatus"), crop = flagOn("fakeocr") ? document.createElement("canvas") : cropCanvas();
    if (!crop) { status(out, T("md.st.noSrc", "เปิดกล้องหรือเลือกรูปก่อน แล้ววางกรอบให้ครอบเลข"), "warn"); return; }
    status(out, T("md.st.ocr", "กำลังอ่านตัวอักษรในเครื่องนี้ (ครั้งแรกโหลดโมเดลประมาณ 7.5 MB)…"), "");
    try {
      const text = (await ocr(crop)).trim();
      if (!text) { status(out, T("md.st.ocrNone", "อ่านตัวอักษรไม่ได้ ลองถ่ายให้ชัดขึ้น ใกล้ขึ้น หรือพิมพ์เอง"), "warn"); return; }
      const det = M.classify(text), best = det.find(d => d.kind === "thai-reg" && !d.uncertain) || det.find(d => d.kind === "thai-reg") || det.find(d => d.kind === "food") || det.find(d => d.kind === "ndc");
      $("#mdQ").value = best ? best.norm || best.ndc : text.slice(0, 120);
      status(out, T("md.st.ocrDone", "อ่านได้: \"{t}\" ตรวจและแก้ข้อความในช่องด้านบน แล้วกดตรวจ", { t: text.slice(0, 80) }), "ok");
      $("#mdQ").focus();
    } catch { status(out, T("md.st.ocrErr", "โหลดหรือรันโมเดลอ่านตัวอักษรไม่ได้ พิมพ์เลขเองแทน"), "err"); }
  });
  $("#mdScanBtn").addEventListener("click", async () => {
    const out = $("#mdPkStatus");
    try {
      let raw = "";
      if (flagOn("fakeocr") && typeof W.__LQ_FAKE_BARCODE === "function") raw = String(W.__LQ_FAKE_BARCODE() || "");
      else {
        if (!("BarcodeDetector" in W)) { status(out, T("md.st.noBar", "เบราว์เซอร์นี้สแกนบาร์โค้ดไม่ได้ พิมพ์ตัวเลขใต้บาร์โค้ดแทน"), "warn"); return; }
        const s = source();
        if (!s) { status(out, T("md.st.noSrc", "เปิดกล้องหรือเลือกรูปก่อน แล้ววางกรอบให้ครอบเลข"), "warn"); return; }
        const det = new W.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "data_matrix", "qr_code"] });
        const codes = await det.detect(s.el);
        raw = codes.length ? String(codes[0].rawValue || "") : "";
      }
      if (!raw) { status(out, T("md.st.barNone", "ไม่พบบาร์โค้ด ลองให้บาร์โค้ดเต็มกรอบและไม่สะท้อนแสง"), "warn"); return; }
      $("#mdQ").value = raw.replace(/[\u0000-\u001f]/g, "").slice(0, 120);
      check(raw, /^[\d\s]+$|^\(?01\)?\d{14}/.test(raw) ? "barcode" : "text");
    } catch { status(out, T("md.st.barErr", "สแกนบาร์โค้ดไม่สำเร็จ พิมพ์ตัวเลขใต้บาร์โค้ดแทน"), "err"); }
  });

  /* ---------- loose pill ---------- */
  const COLOR_TH = { WHITE: "ขาว", YELLOW: "เหลือง", ORANGE: "ส้ม", PINK: "ชมพู", RED: "แดง", PURPLE: "ม่วง", BLUE: "น้ำเงิน/ฟ้า", TURQUOISE: "เขียวอมฟ้า",
    GREEN: "เขียว", BROWN: "น้ำตาล", GRAY: "เทา", BLACK: "ดำ" };
  const SHAPE_TH = { ROUND: "กลม", OVAL: "วงรี", CAPSULE: "ทรงแคปซูล", RECTANGLE: "สี่เหลี่ยมผืนผ้า", SQUARE: "สี่เหลี่ยมจัตุรัส", TRIANGLE: "สามเหลี่ยม",
    DIAMOND: "สี่เหลี่ยมขนมเปียกปูน", PENTAGONSIDED: "ห้าเหลี่ยม", HEXAGONSIDED: "หกเหลี่ยม", OCTAGONSIDED: "แปดเหลี่ยม", BULLET: "หัวกระสุน", TEAR: "หยดน้ำ",
    TRAPEZOID: "สี่เหลี่ยมคางหมู", SEMICIRCLE: "ครึ่งวงกลม", DOUBLECIRCLE: "วงกลมซ้อน", CLOVER: "ใบโคลเวอร์", FREEFORM: "รูปทรงอิสระ" };
  const colorName = c => (c ? c.split(";").map(x => (COLOR_TH[x] ? T("md.c." + x, COLOR_TH[x]) : x)).join(" / ") : "-");
  const shapeName = s => { const k = String(s || "").replace(/[^A-Z]/g, ""); return SHAPE_TH[k] ? T("md.sh." + k, SHAPE_TH[k]) : s || "-"; };
  function fillPickers() {
    const c = $("#mdColor"), s = $("#mdShape"), cv = c.value, sv = s.value;
    c.innerHTML = `<option value="">${esc(T("md.pl.any", "ไม่ระบุ"))}</option>` + M.COLORS.map(x => `<option value="${x}">${esc(colorName(x))}</option>`).join("");
    s.innerHTML = `<option value="">${esc(T("md.pl.any", "ไม่ระบุ"))}</option>` + M.SHAPES.map(x => `<option value="${esc(x)}">${esc(shapeName(x))}</option>`).join("");
    c.value = cv; s.value = sv;
  }
  async function loadPillbox() {
    if (st.pillData) return st.pillData;
    status($("#mdPlStatus"), T("md.pl.loading", "กำลังโหลดข้อมูลเม็ดยา Pillbox (ประมาณ 1.1 MB ครั้งแรกครั้งเดียว)…"), "");
    const r = await fetch(PILLBOX_URL);
    if (!r.ok) throw new Error("pillbox " + r.status);
    st.pillData = await r.json();
    return st.pillData;
  }
  const SRC = () => ({ HRX: T("md.src.HRX", "ยาตามใบสั่งแพทย์ (สหรัฐฯ)"), HOTC: T("md.src.HOTC", "ยาที่ซื้อเองได้ (สหรัฐฯ)"), HOMEO: T("md.src.HOMEO", "ผลิตภัณฑ์โฮมีโอพาธี (สหรัฐฯ)"), ANIMAL: T("md.src.ANIMAL", "ยาสำหรับสัตว์"), REMAIN: T("md.src.REMAIN", "อื่น ๆ") });
  function renderPill() {
    const box = $("#mdPillOut"), r = st.pill;
    if (!r) { box.innerHTML = ""; return; }
    if (!r.list.length) {
      box.innerHTML = card("warn", `<h3>${esc(r.withheld ? T("md.pl.fewH", "พบน้อยกว่า 3 รายการ: ไม่แสดงผล") : T("md.pl.noneH", "ไม่พบรายการที่ตรงกัน"))}</h3><p>${esc(r.withheld
        ? T("md.pl.few", "ระบบไม่แสดงผลเมื่อพบเพียง 1–2 รายการ เพื่อไม่ให้ดูเหมือนคำตอบว่าเม็ดยาคือยาตัวไหน นำเม็ดยาไปให้เภสัชกรตรวจ")
        : T("md.pl.none", "ข้อมูลนี้มีเฉพาะยาในตลาดสหรัฐฯ ถึงปี 2020 ยาไทยส่วนใหญ่ไม่มีในข้อมูล ตรวจตัวอักษรที่พิมพ์อีกครั้ง หรือนำเม็ดยาไปให้เภสัชกรตรวจ"))}</p>`);
      return;
    }
    const S = SRC();
    const items = r.list.map(c => `<div class="md-cand" data-loose="${c.loose}"><p class="md-imp" translate="no">${esc(c.imprint.split(";").join(" / "))}</p>` +
      `<div class="md-badges">${r.padded ? badge(T("md.pl.impOnly", "เทียบเฉพาะตัวอักษรบนเม็ด: สี รูปร่าง และขนาดอาจต่างจากที่ใส่"), "warn") : c.loose ? badge(T("md.pl.loose", "ตรงบางส่วน: สี รูปร่าง ขนาด หรือตัวอักษรต่างจากที่ใส่"), "warn") : badge(T("md.pl.match", "ลักษณะตรงกับที่ใส่"), "ok")}${badge(S[c.source] || c.source)}${c.dea ? badge(T("md.pl.dea", "ยาควบคุมของสหรัฐฯ (DEA {d})", { d: c.dea }), "bad") : ""}</div>` +
      `<dl class="md-kv"><dt>${esc(T("md.pl.name", "ชื่อในฐานข้อมูล"))}</dt><dd translate="no">${esc(c.name)}</dd><dt>${esc(T("md.pl.strength", "ตัวยาและความแรง"))}</dt><dd translate="no">${esc(c.strength || "-")}</dd>` +
      `<dt>${esc(T("md.pl.color", "สี"))}</dt><dd>${esc(colorName(c.color))}</dd><dt>${esc(T("md.pl.shape", "รูปร่าง"))}</dt><dd>${esc(shapeName(c.shape))}</dd>` +
      `<dt>${esc(T("md.pl.sizeK", "ขนาด"))}</dt><dd>${c.size ? esc(c.size + " mm") : "-"}</dd></dl>` +
      `<p class="md-ref" translate="no">RxCUI ${esc(c.rxcui || "-")} · set id ${esc(c.setid || "-")} · SPL ×${esc(c.n)}</p>` +
      `<div class="md-row">${c.setid ? link(M.dailymedUrl(c.setid), T("md.pl.dm", "ฉลากที่ DailyMed (NLM)"), "btn ghost small") : ""}${btn("pill-label", T("md.pl.label", "ดูข้อความฉลาก (ออนไลน์)"), { setid: c.setid, q: c.name })}</div></div>`).join("");
    box.innerHTML = card("info", `<h3>${esc(r.padded
      ? T("md.pl.resPadH", "{n} รายการที่ตัวอักษรบนเม็ดคล้ายกัน: รายการที่ตรงทุกลักษณะมีไม่ถึง 3 รายการ จึงไม่แยกแสดง ไม่ใช่คำตอบว่าเม็ดยาของคุณคือยาตัวไหน", { n: r.list.length })
      : T("md.pl.resH", "{n} รายการที่ลักษณะตรงกัน: ไม่ใช่คำตอบว่าเม็ดยาของคุณคือยาตัวไหน", { n: r.list.length }))}</h3>` +
      `<p class="md-warn">${esc(T("md.pl.resWarn", "ยาต่างชนิดอาจมีลักษณะเหมือนกัน ข้อมูลเป็นยาในตลาดสหรัฐฯ ถึงปี 2020 ห้ามใช้รายการนี้ตัดสินใจกินยา ยืนยันกับเภสัชกรทุกครั้ง"))} ${en("NLM: \"These files will not be updated and should not be used for pill identification.\"")}</p>` +
      `<div class="md-cands">${items}</div><div id="mdPillLabel"></div>`);
  }
  $("#mdPillOut").addEventListener("click", e => {
    const t = e.target.closest("[data-act=pill-label]");
    if (!t) return;
    showTab("pack");
    st.blocks = [];
    labelBlock(t.dataset.setid ? { setid: t.dataset.setid } : { name: t.dataset.q }, "pill");
    $("#mdOut").scrollIntoView({ block: "start" });
  });
  $("#mdPillBtn").addEventListener("click", async () => {
    const out = $("#mdPlStatus"), imp = $("#mdImp").value;
    if (emergencyCheck(imp)) return;
    if (!M.normImprint(imp).joined) { status(out, T("md.pl.needImp", "ใส่ตัวอักษรหรือตัวเลขที่เห็นบนเม็ดยาก่อน (ถ้าไม่มีเลย ระบบหาให้ไม่ได้ ให้สอบถามเภสัชกร)"), "warn"); return; }
    try {
      const data = await loadPillbox();
      st.pill = M.candidates(data, { imprint: imp, color: $("#mdColor").value, shape: $("#mdShape").value, size: $("#mdSize").value, score: $("#mdScore").value }, { max: cfg.pharm ? 40 : 20 });
      status(out, T("md.pl.done", "ค้นในข้อมูล Pillbox (NLM, สหรัฐฯ, ถึงปี 2020) บนเครื่องนี้แล้ว"), "ok");
      addHist("pill", [imp, $("#mdColor").value, $("#mdShape").value, $("#mdSize").value].filter(Boolean).join(" · "), st.pill.list.slice(0, 5).map(c => c.name).join("; ") || "-");
      renderPill();
    } catch { status(out, T("md.pl.loadErr", "โหลดข้อมูลเม็ดยาไม่ได้ ตรวจการเชื่อมต่อแล้วลองใหม่"), "err"); }
  });

  window.addEventListener("lq-lang", () => { fillPickers(); renderServer(); renderOut(); renderPill(); renderHist(); });
  window.addEventListener("pagehide", stopCam);
  placeGuide(); fillPickers(); applyCfg();
})();
