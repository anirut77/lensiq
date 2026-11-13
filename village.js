/* village.js — LENSIQ Gate · หมู่บ้าน/คอนโด (village.html). Resident allow-list by house, deny list, time-limited visitor
 * passes (code + QR + LINE share link), unknown-plate alert, gate log per house, guard "open" button -> configurable relay
 * (Shelly Gen2 RPC / webhook) with manual opening always available, owner-enabled auto-open (exact allow-listed plates
 * above a confidence threshold only), overstay alerts, CSV, accuracy check. Rules: gate-rules.js decide() (unit-tested).
 * Test hook: window.__LQ_VG for tests/e2e/gate-village.e2e.mjs. */
(function () {
  "use strict";
  const W = /** @type {any} */ (window);
  const LP = W.LQPlate, GR = W.LQGateRules, PP = W.LQPromptPay;
  const kit = W.GateKit.init({ ns: "lq-gate-village", page: "village", defaults: {
    relay: { kind: "", url: "", channel: 0, pulseSec: 1, token: "" }, autoOpen: { on: false, minConf: 0.95, minAgree: 0.8 }, graceMin: 15, maxPlates: 4 } });
  const { T, esc, store, fmtTime } = kit;
  const $ = s => /** @type {any} */ (document.querySelector(s));
  const $$ = s => /** @type {any[]} */ ([...document.querySelectorAll(s)]);
  const C = () => kit.cfg();
  const evs = () => store.list("ev");
  const residents = () => {
    const by = new Map();
    for (const r of store.list("res")) { if (!by.has(r.house)) by.set(r.house, { house: r.house, plates: [] }); by.get(r.house).plates.push({ key: r.key, province: r.province, id: r.id }); }
    return [...by.values()];
  };
  const deny = () => store.list("deny");
  const passes = () => store.list("pass");
  const state = { decision: null, relayLog: [] };
  // sales demo mode (?demo=1, lensiq-demo.js): auto-open is always off (every read waits for the guard) and nothing links
  // outside the site (no LINE share link)
  const DEMO = !!(W.LQDemo && W.LQDemo.on);
  const autoCfg = () => (DEMO ? { on: false, minConf: 1, minAgree: 1 } : C().autoOpen);
  W.__LQ_VG = { kit, state, store, residents };

  /* ---------- tabs ---------- */
  const tabs = $$("[data-tab]");
  function showTab(id) {
    tabs.forEach(b => { const on = b.dataset.tab === id; b.setAttribute("aria-selected", String(on)); const p = document.getElementById("tab-" + b.dataset.tab); if (p) p.hidden = !on; });
    if (id === "res") renderRes(); if (id === "vis") renderVis(); if (id === "deny") renderDeny(); if (id === "log") renderLog();
  }
  tabs.forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));

  /* ---------- relay ---------- */
  let cspBlocked = false;
  document.addEventListener("securitypolicyviolation", e => { if (/connect-src/.test(e.violatedDirective || e.effectiveDirective || "")) cspBlocked = true; });
  /** -> {ok, how:'sent'|'opaque'|'none'|'csp'|'error', msg} — never throws; the guard can always open by hand */
  async function openRelay(reason, gate) {
    const cfg = C().relay || {}, req = cfg.kind ? GR.relayRequest(cfg, { gate: gate || C().gate, reason }) : null;
    const msg = $("#vgRelayMsg");
    msg.textContent = ""; msg.dataset.kind = "";
    if (!req) { msg.textContent = T("vg.relay.manual", "ไม่ได้ต่อรีเลย์ — เปิดไม้กั้นที่ตู้ควบคุม (บันทึกแล้ว)"); msg.dataset.kind = ""; return { ok: true, how: "none" }; }
    if (W.__LQ_RELAY_HOOK) { const r = await W.__LQ_RELAY_HOOK(req); state.relayLog.push(req); msg.textContent = T("vg.relay.sent", "ส่งคำสั่งเปิดไม้กั้นแล้ว"); msg.dataset.kind = "ok"; return r || { ok: true, how: "sent" }; }
    cspBlocked = false;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: ctl.signal, cache: "no-store", credentials: "omit" });
      msg.textContent = r.ok ? T("vg.relay.sent", "ส่งคำสั่งเปิดไม้กั้นแล้ว") : T("vg.relay.http", "รีเลย์ตอบกลับผิดพลาด ({s}) — เปิดที่ตู้ควบคุม", { s: r.status }); msg.dataset.kind = r.ok ? "ok" : "err";
      return { ok: r.ok, how: "sent" };
    } catch (e) {
      await new Promise(r => setTimeout(r, 30));
      if (cspBlocked) { msg.textContent = T("vg.relay.cspErr", "นโยบายความปลอดภัยของหน้าไม่อนุญาตที่อยู่นี้ — ใช้ตัวกลางในวง LAN หรือเพิ่มที่อยู่ใน connect-src (docs/GATE.md) แล้วเปิดที่ตู้ควบคุม"); msg.dataset.kind = "err"; return { ok: false, how: "csp" }; }
      if (req.method === "GET") { // a device without CORS headers: send anyway, the answer cannot be read
        try { await fetch(req.url, { mode: "no-cors", signal: ctl.signal, cache: "no-store", credentials: "omit" }); msg.textContent = T("vg.relay.opaque", "ส่งคำสั่งแล้ว แต่ยืนยันผลจากอุปกรณ์ไม่ได้ — ดูว่าไม้กั้นเปิดจริง"); msg.dataset.kind = ""; return { ok: true, how: "opaque" }; } catch { /* fall through */ }
      }
      msg.textContent = T("vg.relay.fail", "ส่งคำสั่งไม่สำเร็จ — เปิดไม้กั้นที่ตู้ควบคุม (บันทึกแล้ว)"); msg.dataset.kind = "err";
      return { ok: false, how: "error" };
    } finally { clearTimeout(timer); }
  }

  /* ---------- decision banner ---------- */
  const STATUS = {
    resident: ["vg.s.resident", "รถลูกบ้าน · บ้าน {h}"], visitor: ["vg.s.visitor", "ผู้มาเยือน (บัตรผ่าน) · บ้าน {h}"], expired: ["vg.s.expired", "บัตรผ่านหมดอายุหรือใช้ครบแล้ว · บ้าน {h}"],
    unknown: ["vg.s.unknown", "รถไม่รู้จัก — สอบถามและติดต่อบ้านปลายทางก่อนเปิด"], deny: ["vg.s.deny", "อยู่ในรายการห้ามเข้า — อย่าเปิด แจ้งหัวหน้า"]
  };
  function banner(d, cur) {
    if (!d) return "";
    const s = STATUS[d.status], lk = d.match && !d.match.exact ? `<small>${esc(T("vg.s.look", "ทะเบียนใกล้เคียง {p} (อักษรคล้ายกัน) — ตรวจให้แน่ใจ", { p: LP.format(d.match.item.key) }))}</small>` : "";
    const pv = d.match && d.match.provinceOk === null && cur.province === "" ? `<small>${esc(T("vg.s.prov", "ยังไม่ได้เลือกจังหวัด — ดูจังหวัดบนป้ายด้วย"))}</small>` : "";
    const why = d.status === "deny" && d.why ? `<small lang="th" translate="no">${esc(d.why)}</small>` : "";
    const pass = d.pass ? `<small>${esc(T("vg.s.until", "บัตรผ่าน {c} ใช้ได้ถึง {t}", { c: d.pass.code, t: fmtTime(d.pass.to) }))}${d.pass.name ? " · " : ""}</small>` : "";
    const auto = d.auto ? `<small>${esc(T("vg.s.auto", "ตรงเงื่อนไขเปิดอัตโนมัติ"))}</small>` : "";
    return `<p class="gk-banner" data-s="${esc(d.status)}" role="status">${esc(T(s[0], s[1], { h: d.house }))}${lk}${pv}${why}${pass}${auto}</p>`;
  }
  function alertUnknown(d, cur) {
    const box = $("#vgAlerts"), old = box.querySelector("[data-unk]");
    if (old) old.remove();
    if (!d || (d.status !== "unknown" && d.status !== "deny")) return;
    const el = document.createElement("p");
    el.className = "gk-alert" + (d.status === "deny" ? " deny" : ""); el.dataset.unk = "1"; el.setAttribute("role", "alert");
    el.innerHTML = esc(d.status === "deny" ? T("vg.a.deny", "แจ้งเตือน: รถในรายการห้ามเข้า") : T("vg.a.unknown", "แจ้งเตือน: รถไม่อยู่ในรายชื่อ")) + " " + kit.plateHTML(cur.key);
    box.prepend(el);
  }

  /* ---------- lane ---------- */
  kit.mountSetup($("#vgSetup"));
  kit.mountLane($("#vgLane"), {
    actions: [{ id: "open", key: "vg.act.open", th: "เปิดไม้กั้นและบันทึก", cls: "go" }, { id: "log", key: "vg.act.log", th: "บันทึกโดยไม่เปิด", cls: "ghost" }, { id: "refuse", key: "vg.act.refuse", th: "ไม่ให้ผ่าน", cls: "danger ghost" }],
    onRead(cur, read) {
      const x = $("#gkExtra"); if (!x) return;
      if (!cur.ok) { x.innerHTML = ""; state.decision = null; alertUnknown(null); return; }
      const d = GR.decide({ key: cur.key, province: cur.province, conf: read ? read.conf : 0, agree: read ? read.agree : 0 },
        { residents: residents(), deny: deny(), passes: passes(), autoOpen: autoCfg() });
      // auto-open only for the system's own unedited read (a typed / edited plate always needs the guard)
      if (d.auto && !(read && !read.done && read.key === cur.key && $("#vgDir").value === "in")) d.auto = false;
      state.decision = d;
      x.innerHTML = banner(d, cur);
      alertUnknown(d, cur);
      if (d.auto && read && !read.autoOpened) { read.autoOpened = true; autoOpen(cur, read, d); }
    },
    async onAction(id, fin) {
      if (!kit.cfg().ack) { kit.toast(T("gk.st.ack", "ยืนยันประกาศ PDPA ด้านบนก่อนเปิดกล้อง"), "err"); return false; }
      const d = GR.decide({ key: fin.key, province: fin.province, conf: 0, agree: 0 }, { residents: residents(), deny: deny(), passes: passes() });
      if (id === "open" && d.status === "deny" && !confirm(T("vg.q.deny", "รถคันนี้อยู่ในรายการห้ามเข้า ยืนยันเปิดไม้กั้น?"))) return false;
      let relay = null;
      if (id === "open") relay = await openRelay("guard");
      return logEvent(fin, d, { opened: id === "open", how: id === "open" ? "guard" : id === "refuse" ? "refused" : "logged", relay });
    }
  });
  async function autoOpen(cur, read, d) {
    if (DEMO) return;
    const relay = await openRelay("auto");
    logEvent({ key: cur.key, province: cur.province, moto: cur.moto, auto: read, edited: false, at: Date.now() }, d, { opened: true, how: "auto", relay });
    read.done = true; kit.setRead(null);
    kit.toast(T("vg.st.autoOpened", "เปิดอัตโนมัติ: รถลูกบ้าน {p}", { p: LP.format(cur.key) }));
  }
  function logEvent(fin, d, o) {
    const dir = $("#vgDir").value;
    const ev = store.put({ id: kit.uid("ev-"), kind: "ev", at: fin.at || Date.now(), dir, key: fin.key || "", province: fin.province || "", moto: !!fin.moto, gate: C().gate || "", by: o.how === "auto" ? "auto" : kit.operator(),
      status: d ? d.status : "manual", house: d ? d.house : "", pass: d && d.pass ? d.pass.code : "", opened: !!o.opened, how: o.how, relay: o.relay ? o.relay.how : "",
      conf: fin.auto ? fin.auto.conf : null, agree: fin.auto ? fin.auto.agree : null, auto: !!fin.auto, edited: !!fin.edited });
    if (d && d.pass && dir === "in" && o.opened) { const p = store.get(d.pass.id) || d.pass; p.used = (p.used || 0) + 1; store.put(p); }
    if (/** @type {any} */ (window).LQFreeTier) /** @type {any} */ (window).LQFreeTier.count("gate", "plates", 1); // free-tier counting only (stream G), never blocks
    renderRecent(); renderAlerts();
    return ev;
  }
  $("#vgManual").addEventListener("click", async () => {
    const relay = await openRelay("manual");
    logEvent({ key: "", at: Date.now() }, null, { opened: true, how: "manual", relay });
    kit.toast(T("vg.st.manual", "เปิดไม้กั้นโดยเจ้าหน้าที่ (ไม่ระบุทะเบียน) บันทึกแล้ว"));
  });

  /* ---------- visitor pass check at the gate ---------- */
  function checkPass(code) {
    const c = String(code || "").toUpperCase().replace(/\s/g, ""), p = passes().find(x => x.code === c), out = $("#vgPassRes");
    out.hidden = false;
    if (!p) { out.dataset.s = "unknown"; out.textContent = T("vg.pass.none", "ไม่พบบัตรผ่านนี้ในเครื่องป้อมยาม"); return null; }
    const ok = GR.passValid(p, Date.now());
    out.dataset.s = ok ? "visitor" : "expired";
    out.textContent = (ok ? T("vg.pass.ok", "บัตรผ่านใช้ได้ · บ้าน {h} · ถึง {t}", { h: p.house, t: fmtTime(p.to) }) : T("vg.pass.bad", "บัตรผ่านหมดอายุหรือใช้ครบแล้ว · บ้าน {h}", { h: p.house })) + (p.key ? " · " + LP.format(p.key) : "");
    if (ok && !p.key) { const cur = kit.current(); if (cur.ok) { p.key = cur.key; p.province = cur.province; store.put(p); kit.toast(T("vg.pass.bound", "ผูกทะเบียน {p} กับบัตรผ่านแล้ว", { p: LP.format(cur.key) })); } }
    return p;
  }
  $("#vgPassCheck").addEventListener("click", () => checkPass($("#vgPassCode").value));
  const fromHash = () => { const m = /[#&]pass=([A-Z0-9-]{4,12})/i.exec(location.hash); if (m) { $("#vgPassCode").value = m[1].toUpperCase(); store.ready.then(() => checkPass(m[1])); } };

  /* ---------- alerts: overstays ---------- */
  function renderAlerts() {
    const box = $("#vgAlerts"); box.querySelectorAll("[data-over]").forEach(x => x.remove());
    for (const o of GR.overstays(passes(), evs(), Date.now(), C().graceMin)) {
      const el = document.createElement("p"); el.className = "gk-alert"; el.dataset.over = o.pass.code;
      el.textContent = T("vg.a.over", "ผู้มาเยือนอยู่เกินเวลา {m} นาที · บัตร {c} · บ้าน {h}", { m: o.overMin, c: o.pass.code, h: o.pass.house });
      box.append(el);
    }
  }
  setInterval(renderAlerts, 60000);
  function renderRecent() {
    const H = { guard: ["vg.h.guard", "เจ้าหน้าที่เปิด"], auto: ["vg.h.auto", "เปิดอัตโนมัติ"], manual: ["vg.h.manual", "เปิดเอง (ไม่ระบุทะเบียน)"], logged: ["vg.h.logged", "บันทึก ไม่เปิด"], refused: ["vg.h.refused", "ไม่ให้ผ่าน"] };
    $("#vgRecent").innerHTML = evs().slice(-8).reverse().map(e => `<li>${esc(kit.fmtClock(e.at))} · ${e.key ? kit.plateHTML(e.key) : "—"} · ${esc(e.house || "")} · ${esc(T(H[e.how][0], H[e.how][1]))}</li>`).join("") || `<li>${esc(T("vg.none", "ยังไม่มีรายการ"))}</li>`;
  }

  /* ---------- residents ---------- */
  function addResident(house, plate, prov) {
    const h = String(house || "").trim(), p = LP.parse(plate), pm = p.ok ? p : LP.parse(plate, { moto: true });
    if (!h) return T("vg.res.noHouse", "ใส่บ้านเลขที่/ห้อง");
    if (!pm.ok) return T("gk.v.bad", "รูปแบบไม่ถูก: ตัวเลข (ถ้ามี) + อักษร 2 ตัว + เลข 1–4 หลัก");
    const mine = store.list("res").filter(r => r.house === h);
    if (mine.some(r => r.key === pm.key)) return T("vg.res.dup", "ทะเบียนนี้อยู่ในบ้านนี้แล้ว");
    if (mine.length >= (C().maxPlates || 4)) return T("vg.res.max", "บ้านนี้มีรถครบ {n} คันแล้ว", { n: C().maxPlates || 4 });
    store.put({ id: kit.uid("res-"), kind: "res", at: Date.now(), house: h, key: pm.key, province: prov || "" });
    return "";
  }
  const provId = s => { const t = String(s || "").trim(); if (!t) return ""; const p = LP.PROVINCES.find(x => x.id === t.toLowerCase() || x.th === t || x.en.toLowerCase() === t.toLowerCase()); return p ? p.id : ""; };
  $("#vgResAdd").addEventListener("click", () => {
    const e = addResident($("#vgResHouse").value, $("#vgResPlate").value, $("#vgResProv").value), m = $("#vgResMsg");
    m.textContent = e || T("vg.res.ok", "เพิ่มแล้ว"); m.dataset.kind = e ? "err" : "ok";
    if (!e) { $("#vgResPlate").value = ""; renderRes(); }
  });
  $("#vgBulkAdd").addEventListener("click", () => {
    let ok = 0, bad = 0;
    for (const line of $("#vgBulk").value.split(/\r?\n/)) { const [h, p, pr] = line.split(/[,\t;]/); if (!h || !p) continue; addResident(h, p, provId(pr)) ? bad++ : ok++; }
    const m = $("#vgResMsg"); m.textContent = T("vg.res.bulkOk", "นำเข้า {a} คัน ข้าม {b} รายการ", { a: ok, b: bad }); m.dataset.kind = bad ? "warn" : "ok";
    renderRes();
  });
  function renderRes() {
    const rows = store.list("res").sort((a, b) => a.house.localeCompare(b.house, "th", { numeric: true }));
    $("#vgResBody").innerHTML = rows.map(r => `<tr><td lang="th" translate="no">${esc(r.house)}</td><td>${kit.plateHTML(r.key)}</td><td>${esc(kit.provName(r.province) || "—")}</td><td><button class="btn ghost small" type="button" data-del="${esc(r.id)}">${esc(T("vg.del", "ลบ"))}</button></td></tr>`).join("") || `<tr><td colspan="4">${esc(T("vg.res.none", "ยังไม่มีรถลูกบ้าน"))}</td></tr>`;
    const houses = [...new Set(rows.map(r => r.house).concat(passes().map(p => p.house)))].sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
    const sel = $("#vgLogHouse"), v = sel.value;
    sel.innerHTML = `<option value="">${esc(T("vg.log.all", "ทุกบ้าน"))}</option>` + houses.map(h => `<option value="${esc(h)}">${esc(h)}</option>`).join(""); sel.value = v;
  }

  /* ---------- visitor passes ---------- */
  const localDT = ms => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
  $("#vgVisFrom").value = localDT(Date.now()); $("#vgVisTo").value = localDT(Date.now() + 4 * 3600000);
  $("#vgVisMake").addEventListener("click", () => {
    const house = $("#vgVisHouse").value.trim();
    if (!house) { kit.toast(T("vg.res.noHouse", "ใส่บ้านเลขที่/ห้อง"), "err"); return; }
    const from = new Date($("#vgVisFrom").value).getTime() || Date.now(), to = new Date($("#vgVisTo").value).getTime() || from + 4 * 3600000;
    if (!(to > from)) { kit.toast(T("vg.vis.badTime", "เวลาสิ้นสุดต้องหลังเวลาเริ่ม"), "err"); return; }
    const p = GR.passMake({ house, plate: $("#vgVisPlate").value, name: $("#vgVisName").value, from, to, uses: +$("#vgVisUses").value }, () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296);
    store.put({ id: "pass-" + p.code, kind: "pass", ...p });
    const link = location.href.split("#")[0] + "#pass=" + p.code;
    PP.draw($("#vgVisQr"), link, { scale: 5, margin: 4 });
    $("#vgVisCode").textContent = p.code;
    $("#vgVisWhen").textContent = T("vg.vis.when", "บ้าน {h} · {a} ถึง {b}", { h: house, a: fmtTime(from), b: fmtTime(to) });
    const text = T("vg.vis.msg", "บัตรผ่านเข้าโครงการ บ้าน {h} รหัส {c} ใช้ได้ {a} ถึง {b}", { h: house, c: p.code, a: fmtTime(from), b: fmtTime(to) });
    if (DEMO) { $("#vgVisLine").hidden = true; $("#vgVisLine").removeAttribute("href"); } else $("#vgVisLine").href = "https://line.me/R/share?text=" + encodeURIComponent(text + "\n" + link);
    $("#vgVisOut").hidden = false; W.__LQ_VG.lastPass = p;
    renderVis();
  });
  function renderVis() {
    const now = Date.now(), rows = passes().filter(p => p.to > now - 86400000 && !p.revoked).sort((a, b) => a.to - b.to);
    $("#vgVisBody").innerHTML = rows.map(p => `<tr${GR.passValid(p, now) ? "" : ' class="bad"'}><td lang="th" translate="no">${esc(p.code)}</td><td lang="th" translate="no">${esc(p.house)}</td><td>${p.key ? kit.plateHTML(p.key) : "—"}</td><td>${esc(fmtTime(p.to))}</td><td>${p.used || 0}/${p.uses || "∞"}</td>
      <td><button class="btn ghost small" type="button" data-revoke="${esc(p.id)}">${esc(T("vg.vis.revoke", "ยกเลิกบัตร"))}</button></td></tr>`).join("") || `<tr><td colspan="6">${esc(T("vg.vis.none", "ไม่มีบัตรผ่านที่ใช้ได้"))}</td></tr>`;
  }

  /* ---------- deny list ---------- */
  $("#vgDenyAdd").addEventListener("click", () => {
    const p = LP.parse($("#vgDenyPlate").value), why = $("#vgDenyWhy").value.trim();
    if (!p.ok) { kit.toast(T("gk.v.bad", "รูปแบบไม่ถูก: ตัวเลข (ถ้ามี) + อักษร 2 ตัว + เลข 1–4 หลัก"), "err"); return; }
    if (!why) { kit.toast(T("vg.deny.needWhy", "ต้องใส่เหตุผล"), "err"); return; }
    store.put({ id: kit.uid("deny-"), kind: "deny", at: Date.now(), key: p.key, province: $("#vgDenyProv").value, why, by: kit.operator() });
    $("#vgDenyPlate").value = ""; $("#vgDenyWhy").value = ""; renderDeny();
  });
  function renderDeny() {
    $("#vgDenyList").innerHTML = deny().map(d => `<li>${kit.plateHTML(d.key)} ${esc(kit.provName(d.province))} · <span lang="th" translate="no">${esc(d.why)}</span> <button class="btn ghost small" type="button" data-del="${esc(d.id)}">${esc(T("vg.del", "ลบ"))}</button></li>`).join("") || `<li>${esc(T("vg.deny.none", "ไม่มีรายการห้ามเข้า"))}</li>`;
  }
  document.addEventListener("click", e => {
    const t = /** @type {any} */ (e.target);
    const d = t.closest && t.closest("[data-del]");
    if (d) { store.del(d.dataset.del); renderRes(); renderDeny(); return; }
    const r = t.closest && t.closest("[data-revoke]");
    if (r) { const p = store.get(r.dataset.revoke); if (p) { p.revoked = true; store.put(p); renderVis(); } }
  });

  /* ---------- log per house ---------- */
  const ST = { resident: ["vg.l.resident", "ลูกบ้าน"], visitor: ["vg.l.visitor", "ผู้มาเยือน"], expired: ["vg.l.expired", "บัตรหมดอายุ"], unknown: ["vg.l.unknown", "ไม่รู้จัก"], deny: ["vg.l.deny", "ห้ามเข้า"], manual: ["vg.l.manual", "เปิดเอง"] };
  function renderLog() {
    const h = $("#vgLogHouse").value, q = LP.normalize($("#vgSearch").value);
    const rows = evs().filter(e => (!h || e.house === h) && (!q || (e.key || "").includes(q))).slice(-300).reverse();
    $("#vgLogBody").innerHTML = rows.map(e => `<tr><td>${esc(fmtTime(e.at))}</td><td>${esc(e.dir === "out" ? T("vg.dir.out", "ขาออก") : T("vg.dir.in", "ขาเข้า"))}</td><td>${e.key ? kit.plateHTML(e.key) : "—"}</td><td lang="th" translate="no">${esc(e.house || "")}</td>
      <td>${esc(T((ST[e.status] || ST.manual)[0], (ST[e.status] || ST.manual)[1]))}</td><td>${esc(e.opened ? (e.how === "auto" ? T("vg.h.auto", "เปิดอัตโนมัติ") : T("vg.o.yes", "เปิด")) : T("vg.o.no", "ไม่เปิด"))}</td><td lang="th" translate="no">${esc(e.by || "")}</td></tr>`).join("") || `<tr><td colspan="7">${esc(T("vg.none", "ยังไม่มีรายการ"))}</td></tr>`;
  }
  $("#vgLogHouse").addEventListener("change", renderLog);
  $("#vgSearch").addEventListener("input", renderLog);
  $("#vgCsv").addEventListener("click", () => {
    const h = $("#vgLogHouse").value;
    kit.csv(h ? "village-log-" + h.replace(/[^\w-]+/g, "_") + ".csv" : "village-log.csv", evs().filter(e => !h || e.house === h), [{ k: "at", label: "time", v: r => new Date(r.at).toISOString() }, { k: "dir" }, { k: "key", label: "plate", v: r => LP.format(r.key) },
      { k: "province", v: r => LP.provinceName(r.province, "en") }, { k: "house" }, { k: "status" }, { k: "pass" }, { k: "opened" }, { k: "how" }, { k: "relay" }, { k: "auto" }, { k: "conf" }, { k: "edited" }, { k: "gate" }, { k: "by" }]);
  });
  kit.mountAudit($("#vgAudit"));

  /* ---------- settings ---------- */
  function fillSettings() {
    const r = C().relay || {}, a = C().autoOpen || {};
    $("#vgRelayKind").value = r.kind || ""; $("#vgRelayUrl").value = r.url || ""; $("#vgRelayCh").value = r.channel || 0; $("#vgRelayPulse").value = r.pulseSec || 1; $("#vgRelayToken").value = r.token || "";
    $("#vgAutoOn").checked = !DEMO && !!a.on; $("#vgAutoOn").disabled = DEMO;
    $("#vgAutoConf").value = a.minConf || 0.95; $("#vgAutoAgree").value = a.minAgree || 0.8; $("#vgGrace").value = C().graceMin; $("#vgMax").value = C().maxPlates;
    ["#vgResProv", "#vgDenyProv"].forEach(s => kit.provinceOptions($(s), C().common, $(s).value));
  }
  $("#vgAutoOn").addEventListener("change", () => {
    if ($("#vgAutoOn").checked && !confirm(T("vg.q.auto", "เปิดไม้กั้นอัตโนมัติสำหรับรถลูกบ้านที่ทะเบียนตรงทุกตัว? ควรผ่านการตรวจความแม่นยำหน้างานก่อน และมีเจ้าหน้าที่ประจำป้อมเสมอ"))) $("#vgAutoOn").checked = false;
  });
  $("#vgSetSave").addEventListener("click", () => {
    const url = $("#vgRelayUrl").value.trim(), kind = $("#vgRelayKind").value;
    if (kind && !GR.relayRequest({ kind, url })) { $("#vgSetMsg").textContent = T("vg.relay.badUrl", "ที่อยู่รีเลย์ไม่ถูกต้อง (ต้องขึ้นต้นด้วย http:// https:// หรือ /)"); return; }
    kit.setCfg({ relay: { kind, url, channel: Math.max(0, Math.min(3, +$("#vgRelayCh").value || 0)), pulseSec: Math.max(0.2, Math.min(30, +$("#vgRelayPulse").value || 1)), token: $("#vgRelayToken").value },
      autoOpen: { on: !DEMO && $("#vgAutoOn").checked, minConf: Math.max(0.9, Math.min(0.99, +$("#vgAutoConf").value || 0.95)), minAgree: Math.max(0.6, Math.min(1, +$("#vgAutoAgree").value || 0.8)) },
      graceMin: Math.max(0, +$("#vgGrace").value || 0), maxPlates: Math.max(1, Math.min(10, +$("#vgMax").value || 4)) });
    $("#vgSetMsg").textContent = T("vg.set.saved", "บันทึกแล้ว"); fillSettings();
  });
  $("#vgRelayTest").addEventListener("click", () => openRelay("test"));
  kit.mountRetention($("#vgRetention"));
  kit.mountCheck($("#vgCheck"));

  store.ready.then(() => { fillSettings(); renderRes(); renderVis(); renderDeny(); renderLog(); renderRecent(); renderAlerts(); fromHash(); });
  window.addEventListener("hashchange", fromHash);
  window.addEventListener("lq-lang", () => { fillSettings(); renderRes(); renderVis(); renderDeny(); renderLog(); renderRecent(); renderAlerts(); });
})();
