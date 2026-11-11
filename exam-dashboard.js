/* exam-dashboard.js — LENSIQ Exam room dashboard (exam-dashboard.html), both modes.
 * Receives JSON events from exam-lab / exam-hall pages (exam-link.js: BroadcastChannel, optional relay, or an imported
 * file) into LQExam.createBoard: decaying seat levels, alert queue (triage order: Check, then Watch, oldest first),
 * invigilator actions (Going / No issue / Note / Escalate, always with a name), accommodation profiles (sent to the nodes),
 * room mute, on-site precision tally, per-room summary, CSV (time order) and a printable committee report.
 * No images, ever. Test hook: window.__LQ_EXAM_DB.
 * Evidence clip (opt-in on the camera device): a flag row shows its time + "clip on device" status; "Keep clip" (named,
 * like every action) sends a JSON keep message to that device. The video itself never comes to the dashboard.
 */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), E = W.LQExam, U = W.LQExamUI, L = W.LQExamLink, T = U.T;
  const $ = s => document.querySelector(s);
  const P = U.params();
  const K = { db: "lq-exam-db", board: r => "lq-exam-board-" + r };
  let lastImport = null;
  const importMsg = () => { if (lastImport) $("#importMsg").textContent = T("exam.db.imported", "นำเข้า {n} เหตุการณ์ (ข้าม {k})", lastImport); };
  let room = "", board = null, link = null, ver = 0, saveT = null, rendered = -1;
  const knownNodes = new Set();

  let lastEngine = null; // re-rendered on every language switch (status text is written by JS, not data-i18n)
  function engine(text, kind) {
    lastEngine = [text, kind];
    const el = $("#engine"); el.textContent = typeof text === "function" ? text() : text; el.className = "status" + (kind ? " " + kind : "");
  }
  function who() { return String($("#who").value || "").trim().slice(0, 40); }
  function parseRange(s) {
    const out = [];
    for (const part of String(s || "").split(/[,\s]+/).filter(Boolean)) {
      const m = /^(\d{1,4})-(\d{1,4})$/.exec(part);
      if (m) { const a = +m[1], b = Math.min(+m[2], a + 199); for (let i = a; i <= b; i++) out.push(String(i)); }
      else { const id = U.cleanSeat(part); if (id) out.push(id); }
      if (out.length >= 200) break;
    }
    return out.slice(0, 200);
  }
  const seatSort = (a, b) => { const x = +a, y = +b; return Number.isFinite(x) && Number.isFinite(y) ? x - y : String(a).localeCompare(String(b)); };
  function changed() { ver++; clearTimeout(saveT); saveT = setTimeout(save, 300); render(); }
  function save() { if (board) U.store.set(K.board(room), board.toJSON()); }

  /* ---------- join / messages ---------- */
  function join(r) {
    room = r;
    board = E.createBoard({ room });
    const saved = U.store.get(K.board(room), null);
    if (saved) board.load(saved);
    board.addSeats(parseRange($("#seatRange").value));
    U.store.set(K.db, { room, who: who(), seats: $("#seatRange").value });
    if (link) link.close();
    link = L.create({ room, onMessage });
    knownNodes.clear();
    engine(() => T("exam.db.joined", "เปิดแดชบอร์ดห้อง {r} แล้ว — รอเหตุการณ์จากเครื่องในห้อง", { r: room }), "ok");
    sendProfiles();
    changed();
  }
  function onMessage(m) {
    if (!board) return;
    const r = board.ingest(m, Date.now());
    if (r.ok && r.kind === "hb" && !knownNodes.has(m.node)) { knownNodes.add(m.node); sendProfiles(); }
    if (r.ok && r.kind !== "hb") changed(); else renderNodes();
  }
  function sendProfiles() { if (link && board) link.send({ v: 1, type: "prof", room, t: Date.now(), profiles: board.profiles }); }

  /* ---------- rendering ---------- */
  function spark(seat, now) {
    const s = board.spark(seat, now, { spanMs: 600000, n: 30 }), max = Math.max(2.5, ...s), W = 120, H = 32;
    const pts = s.map((v, i) => `${(i * W / (s.length - 1)).toFixed(1)},${(H - 2 - (v / max) * (H - 4)).toFixed(1)}`).join(" ");
    const wy = (H - 2 - (1 / max) * (H - 4)).toFixed(1), cy = (H - 2 - (2.5 / max) * (H - 4)).toFixed(1);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${U.esc(T("exam.db.sparkL", "ระดับของที่นั่ง {s} ใน 10 นาทีล่าสุด", { s: seat }))}">` +
      `<line x1="0" x2="${W}" y1="${wy}" y2="${wy}" stroke="#b7791f" stroke-dasharray="3 3"/><line x1="0" x2="${W}" y1="${cy}" y2="${cy}" stroke="#c0392b" stroke-dasharray="3 3"/>` +
      `<polyline fill="none" stroke="#0e1430" stroke-width="2" points="${pts}"/></svg>`;
  }
  function renderNodes() {
    if (!board) return;
    const now = Date.now(), list = Object.values(board.nodes);
    $("#nodes").innerHTML = list.length ? list.map(n => {
      const age = Math.round((now - n.last) / 1000), stale = age > 20;
      const kind = n.src === "hall" ? T("exam.db.nodeHall", "เครื่องกล้องในห้องสอบ") : T("exam.db.nodeLab", "ผู้สอบ");
      const label = n.name ? `<span translate="no">${U.esc(n.name)}</span>` : U.esc(n.seats && n.seats.length === 1 ? T("exam.c.seatN", "ที่นั่ง {s}", { s: n.seats[0] }) : n.node.slice(0, 6));
      return `<span>${U.esc(kind)} ${label} · ` +
        `${stale ? U.esc(T("exam.db.nodeStale", "ขาดการติดต่อ {n} วินาที", { n: age })) : U.esc(T("exam.db.nodeOk", "ออนไลน์"))}${n.walk ? " · " + U.esc(T("exam.db.nodeWalk", "เดินตรวจ")) : ""}${n.clip ? " · " + U.esc(T("exam.db.nodeClip", "คลิปหลักฐานเปิด")) : ""}</span>`;
    }).join("") : `<span>${U.esc(T("exam.db.noNodes", "ยังไม่มีเครื่องเชื่อมต่อ"))}</span>`;
    const mu = board.mutedUntil(), ms = $("#muteState");
    ms.textContent = now < mu ? T("exam.db.muted", "พักแจ้งเตือนถึง {t}", { t: U.time(mu) }) : "";
  }
  function renderMap(now) {
    const lv = board.levels(now), prof = board.profiles;
    const ids = [...new Set([...board.seats(), ...Object.keys(lv)])].sort(seatSort);
    $("#seatMap").innerHTML = ids.length ? ids.map(id => {
      const l = (lv[id] && lv[id].level) || "ok";
      return `<div class="seat lv-${l}${prof[id] ? " acc" : ""}" role="img" aria-label="${U.esc(T("exam.db.seatL", "ที่นั่ง {s}: {l}", { s: id, l: U.lvl(l) }))}"><b>${U.esc(id)}</b><span>${U.esc(U.lvl(l))}</span></div>`;
    }).join("") : `<p class="empty">${U.esc(T("exam.db.noSeats", "ยังไม่มีที่นั่ง — กรอกช่วงที่นั่ง หรือรอเหตุการณ์จากเครื่องในห้อง"))}</p>`;
  }
  /** "clip on device" text for a flag (null = no clip for it) */
  function clipText(c) {
    if (!c) return "";
    if (c.st === "pending") return T("exam.db.clipPending", "คลิป 10 วินาทีรออยู่ในเครื่องกล้อง — ยังไม่เก็บ (หมดเวลาใน 10 นาที)");
    if (c.st === "kept" || c.st === "auto") {
      return (c.st === "auto" ? T("exam.db.clipAuto", "คลิปอยู่ในเครื่องกล้อง (เก็บอัตโนมัติ)") : T("exam.db.clipKept", "คลิปอยู่ในเครื่องกล้อง (เก็บแล้ว)")) +
        (c.days ? " · " + T("exam.db.clipDays", "ลบเองใน {d} วัน", { d: c.days }) : "");
    }
    if (c.st === "fail") return T("exam.db.clipFail", "เครื่องกล้องเก็บคลิปไม่สำเร็จ");
    if (c.st === "del") return T("exam.db.clipDel", "คลิปถูกลบจากเครื่องกล้องแล้ว");
    return T("exam.db.clipGone", "ไม่ได้เก็บคลิป (หมดเวลา)");
  }
  function renderQueue(now) {
    const q = board.queue(now);
    $("#qCount").textContent = String(q.length);
    $("#queue").innerHTML = q.length ? q.map(a => {
      const going = a.acts.filter(x => x.a === "going").map(x => x.who);
      return `<article class="alert lvl-${a.lvl}" data-id="${a.id}">
        <header><span class="pill lv-${a.lvl}">${U.esc(U.lvl(a.lvl))}</span><b>${U.esc(a.seat ? T("exam.c.seatN", "ที่นั่ง {s}", { s: a.seat }) : T("exam.db.roomWide", "ทั้งห้อง"))}</b>
          <time>${U.esc(U.time(a.t))}</time>${a.n > 1 ? `<span class="note">${U.esc(T("exam.db.times", "{n} ครั้ง", { n: a.n }))}</span>` : ""}${a.seat ? spark(a.seat, now) : ""}</header>
        <p class="why">${U.esc(U.reason(a))}</p>
        ${(() => { const c = board.clipState(a); return c ? `<p class="clip-tag" data-clip="${U.esc(c.st)}">${U.esc(clipText(c))}</p>` : ""; })()}
        ${going.length ? `<p class="note">${U.esc(T("exam.db.goingBy", "{w} กำลังไปดู", { w: "\u0001" })).replace("\u0001", `<span translate="no">${U.esc(going.join(", "))}</span>`)}</p>` : ""}
        <label><span>${U.esc(T("exam.db.noteL", "บันทึก (ไม่บังคับ)"))}</span><input class="note-in" maxlength="300" autocomplete="off"></label>
        <div class="acts">
          <button class="btn primary" type="button" data-act="going">${U.esc(T("exam.db.going", "กำลังไปดู"))}</button>
          <button class="btn ghost" type="button" data-act="noissue">${U.esc(T("exam.db.noissue", "ไม่มีปัญหา"))}</button>
          <button class="btn ghost" type="button" data-act="note">${U.esc(T("exam.db.note", "บันทึก"))}</button>
          <button class="btn ghost danger" type="button" data-act="escalate">${U.esc(T("exam.db.escalate", "ส่งต่อคณะกรรมการ"))}</button>
          ${board.clipsOf(a).some(c => c.st === "pending") ? `<button class="btn ghost" type="button" data-act="keepclip">${U.esc(T("exam.db.keepClip", "เก็บคลิป (ในเครื่องกล้อง)"))}</button>` : ""}
        </div>
        <div class="acts"><span class="note">${U.esc(T("exam.db.tallyQ", "ระบบแจ้งถูกไหม:"))}</span>
          <button class="btn ghost" type="button" data-v="1" aria-pressed="${a.verdict === "right"}">${U.esc(T("exam.db.right", "แจ้งถูก"))}</button>
          <button class="btn ghost" type="button" data-v="0" aria-pressed="${a.verdict === "wrong"}">${U.esc(T("exam.db.wrong", "แจ้งผิด"))}</button></div>
      </article>`;
    }).join("") : `<p class="empty">${U.esc(T("exam.db.qEmpty", "ไม่มีที่ต้องไปดูตอนนี้"))}</p>`;
  }
  const OUT = { open: ["exam.db.oOpen", "ยังไม่ตรวจ"], going: ["exam.db.oGoing", "กำลังไปดู"], closed: ["exam.db.oClosed", "ไม่มีปัญหา"], escalated: ["exam.db.oEsc", "ส่งต่อคณะกรรมการ"] };
  const outcome = a => (OUT[a.status] ? T(OUT[a.status][0], OUT[a.status][1]) : "");
  function renderLog() {
    const rows = board.rows().slice(-300);
    $("#logBody").innerHTML = rows.length ? rows.map(e => {
      const names = e.kind === "alert" ? [...new Set(e.acts.map(x => x.who))].join(", ") : "";
      const whoTxt = (names ? `<span translate="no">${U.esc(names)}</span>` + (outcome(e) ? " · " : "") : "") + U.esc(e.kind === "alert" ? outcome(e) : e.kind === "muted" ? T("exam.db.wasMuted", "อยู่ในช่วงพักแจ้งเตือน") : "");
      const tally = e.kind === "alert" ? `<button class="btn ghost" type="button" data-lid="${e.id}" data-v="1" aria-pressed="${e.verdict === "right"}">${U.esc(T("exam.db.right", "แจ้งถูก"))}</button> <button class="btn ghost" type="button" data-lid="${e.id}" data-v="0" aria-pressed="${e.verdict === "wrong"}">${U.esc(T("exam.db.wrong", "แจ้งผิด"))}</button>` : "";
      const ct = e.kind === "alert" ? clipText(board.clipState(e)) : "";
      return `<tr><td>${U.esc(U.time(e.t))}</td><td>${U.esc(e.seat || "–")}</td><td>${U.esc(U.reason(e))}${ct ? `<br><span class="clip-tag">${U.esc(ct)}</span>` : ""}</td>` +
        `<td><span class="pill lv-${U.esc(e.lvl)}">${U.esc(U.lvl(e.lvl))}</span></td><td>${whoTxt}</td><td>${tally}</td></tr>`;
    }).join("") : `<tr><td colspan="6" class="empty">${U.esc(T("exam.db.logEmpty", "ยังไม่มีเหตุการณ์"))}</td></tr>`;
  }
  function renderSummary() {
    const s = board.summary();
    const parts = [
      T("exam.db.sAlerts", "แจ้งให้ไปดู {n}", { n: s.alerts }), T("exam.db.sAck", "ตอบสนองแล้ว {n}", { n: s.acknowledged }),
      T("exam.db.sDismiss", "ไม่มีปัญหา {n}", { n: s.dismissed }), T("exam.db.sEsc", "ส่งต่อ {n}", { n: s.escalated }), T("exam.db.sOpen", "ยังเปิดอยู่ {n}", { n: s.open }),
      s.medianResponseS != null ? T("exam.db.sResp", "เวลาตอบสนองกลาง {n} วินาที", { n: s.medianResponseS }) : T("exam.db.sRespNa", "ยังไม่มีเวลาตอบสนอง"),
      T("exam.db.sEarly", "ออกก่อนเวลา {n} ที่นั่ง{list}", { n: s.earlyLeavers.length, list: s.earlyLeavers.length ? " (" + s.earlyLeavers.join(", ") + ")" : "" }),
      T("exam.db.sSetup", "ปัญหาการติดตั้ง {n}", { n: s.setup }), T("exam.db.sMuted", "ระหว่างพักแจ้งเตือน {n}", { n: s.muted })
    ];
    for (const [k, n] of Object.entries(s.byType).sort((a, b) => b[1] - a[1])) parts.push(U.sig(k) + ": " + n);
    $("#summary").innerHTML = parts.map(p => `<span>${U.esc(p)}</span>`).join("");
    const pr = board.precision(), pct = v => (v == null ? "–" : Math.round(v * 100) + "%");
    const rows = Object.entries(pr.bySig);
    $("#precBody").innerHTML = rows.length ? rows.map(([k, b]) => `<tr><td>${U.esc(U.sig(k))}</td><td>${b.right}</td><td>${b.wrong}</td><td>${pct(b.p)} (${pct(b.lo)}–${pct(b.hi)})</td></tr>`).join("") +
      `<tr><td><b>${U.esc(T("exam.db.all", "รวม"))}</b></td><td>${pr.all.x}</td><td>${pr.all.n - pr.all.x}</td><td>${pct(pr.all.p)} (${pct(pr.all.lo)}–${pct(pr.all.hi)})</td></tr>`
      : `<tr><td colspan="4" class="empty">${U.esc(T("exam.db.precEmpty", "ยังไม่มีการนับ — กด แจ้งถูก / แจ้งผิด ในรายการ"))}</td></tr>`;
  }
  function renderAcc() {
    const ps = board.profiles, ids = Object.keys(ps).sort(seatSort);
    const desc = p => [p.gazeOff && T("exam.db.pGaze", "ไม่ดูสายตา"), p.readAloud && T("exam.db.pRead", "อ่านออกเสียงได้"), p.breaks && T("exam.db.pBreaks", "พักได้บ่อยขึ้น"),
      p.noFaceX > 1 && T("exam.db.pNoFace", "ไม่เห็นใบหน้า ×{n}", { n: p.noFaceX }), p.ticX > 1 && T("exam.db.pTic", "เกณฑ์การเคลื่อนไหว ×{n}", { n: p.ticX })].filter(Boolean).join(" · ");
    $("#accList").innerHTML = ids.length ? ids.map(id => `<li><b>${U.esc(T("exam.c.seatN", "ที่นั่ง {s}", { s: id }))}</b> <span>${U.esc(desc(ps[id]))}</span> <button class="btn ghost" type="button" data-unacc="${U.esc(id)}">${U.esc(T("exam.db.accDel", "ยกเลิกเงื่อนไข"))}</button></li>`).join("")
      : `<li class="empty">${U.esc(T("exam.db.accEmpty", "ยังไม่มีเงื่อนไขเฉพาะบุคคล"))}</li>`;
  }
  function render() {
    if (!board) return;
    const now = Date.now();
    renderMap(now); renderNodes();
    if (rendered !== ver) { renderQueue(now); renderLog(); renderSummary(); renderAcc(); rendered = ver; }
  }
  function tick() {
    if (!board) return;
    const now = Date.now();
    renderMap(now); renderNodes();
    document.querySelectorAll("#queue .alert").forEach(card => {
      const a = board.alerts.find(x => x.id === card.getAttribute("data-id")), sp = card.querySelector(".spark");
      if (a && a.seat && sp) sp.outerHTML = spark(a.seat, now);
    });
  }
  setInterval(tick, 2000);

  /* ---------- actions ---------- */
  $("#queue").addEventListener("click", e => {
    const b = /** @type {HTMLElement} */ (e.target).closest("button"); if (!b) return;
    const card = b.closest(".alert"), id = card && card.getAttribute("data-id"); if (!id) return;
    if (b.hasAttribute("data-v")) { board.verdict(id, b.getAttribute("data-v") === "1"); changed(); return; }
    const act = b.getAttribute("data-act"); if (!act) return;
    if (!who()) { engine(() => T("exam.db.needWho", "กรอกชื่อผู้คุมสอบก่อน — ทุกการตรวจต้องมีชื่อผู้ตรวจ"), "warn"); $("#who").focus(); return; }
    if (act === "keepclip") {
      const msgs = board.keepClip(id, who(), Date.now());
      for (const m of msgs) if (link) link.send(m);
      engine(() => (msgs.length ? T("exam.db.keepSent", "ขอให้เครื่องกล้องเก็บคลิปแล้ว — คลิปอยู่ในเครื่องนั้นเท่านั้น")
        : T("exam.db.keepNone", "ไม่มีคลิปที่รอเก็บสำหรับการแจ้งนี้")), msgs.length ? "ok" : "warn");
      changed(); return;
    }
    const note = /** @type {HTMLInputElement} */ (card.querySelector(".note-in")).value;
    if ((act === "note" || act === "escalate") && !note.trim()) { engine(() => T("exam.db.needNote", "เขียนบันทึกสั้น ๆ ก่อนกด บันทึก หรือ ส่งต่อ"), "warn"); /** @type {HTMLElement} */ (card.querySelector(".note-in")).focus(); return; }
    board.act(id, act, { who: who(), note }, Date.now());
    U.store.set(K.db, { room, who: who(), seats: $("#seatRange").value });
    changed();
  });
  $("#logBody").addEventListener("click", e => {
    const b = /** @type {HTMLElement} */ (e.target).closest("button[data-lid]"); if (!b) return;
    board.verdict(b.getAttribute("data-lid"), b.getAttribute("data-v") === "1"); changed();
  });
  $("#joinForm").addEventListener("submit", e => {
    e.preventDefault();
    const r = U.cleanRoom($("#room").value);
    if (!r) { engine(() => T("exam.db.needRoom", "กรอกรหัสห้องสอบ (ตัวอักษรอังกฤษหรือตัวเลข)"), "warn"); return; }
    $("#room").value = r; join(r);
  });
  $("#muteBtn").addEventListener("click", () => {
    if (!board) return engine(() => T("exam.db.joinFirst", "เปิดแดชบอร์ดห้องก่อน"), "warn");
    const now = Date.now(); board.mute(now, 60000);
    if (link) link.send({ v: 1, type: "mute", room, t: now, ms: 60000 });
    changed();
  });
  $("#accForm").addEventListener("submit", e => {
    e.preventDefault();
    if (!board) return engine(() => T("exam.db.joinFirst", "เปิดแดชบอร์ดห้องก่อน"), "warn");
    const seat = U.cleanSeat($("#accSeat").value);
    if (!seat) return engine(() => T("exam.db.needSeat", "กรอกเลขที่นั่ง"), "warn");
    board.setProfile(seat, { gazeOff: $("#accGaze").checked, readAloud: $("#accRead").checked, breaks: $("#accBreaks").checked, noFaceX: +$("#accNoFace").value, ticX: +$("#accTic").value });
    board.addSeats([seat]); sendProfiles(); changed();
    engine(() => T("exam.db.accSaved", "บันทึกเงื่อนไขของที่นั่ง {s} และส่งให้เครื่องในห้องแล้ว", { s: seat }), "ok");
  });
  $("#accList").addEventListener("click", e => {
    const b = /** @type {HTMLElement} */ (e.target).closest("[data-unacc]"); if (!b) return;
    board.setProfile(b.getAttribute("data-unacc"), null); sendProfiles(); changed();
  });
  const csvLabels = () => ({
    sig: U.sig, lvl: U.lvl, outcome, time: t => new Date(t).toLocaleString(), clip: clipText, clipHead: T("exam.db.cClip", "คลิปหลักฐาน (อยู่ในเครื่องกล้อง)"),
    head: [T("exam.db.tTime", "เวลา"), T("exam.db.cRoom", "ห้อง"), T("exam.db.tSeat", "ที่นั่ง"), T("exam.db.tReason", "เหตุผล"), T("exam.db.tLvl", "ระดับ"),
      T("exam.db.cWho", "ผู้ตรวจ"), T("exam.db.cOut", "ผลการตรวจ"), T("exam.db.cResp", "เวลาตอบสนอง (วินาที)"), T("exam.db.cNote", "บันทึก")]
  });
  $("#csvBtn").addEventListener("click", () => { if (board) U.download(`lensiq-exam-${room}-${new Date().toISOString().slice(0, 10)}.csv`, board.csv(csvLabels()), "text/csv;charset=utf-8"); });
  $("#printBtn").addEventListener("click", () => {
    if (!board) return;
    const s = board.summary(), rows = board.rows();
    $("#report").innerHTML = `<h1>${U.esc(T("exam.db.rH", "รายงานเหตุการณ์ระหว่างสอบ สำหรับคณะกรรมการสอบ"))}</h1>
      <p>${U.esc(T("exam.db.rMeta", "ห้อง {r} · พิมพ์เมื่อ {t}", { r: room, t: new Date().toLocaleString() }))}</p>
      <p>${U.esc(T("exam.db.rNote", "ระบบช่วยชี้ที่นั่งให้ผู้คุมสอบไปดูเท่านั้น ไม่ใช่หลักฐานการทุจริต ผลการตรวจในรายงานนี้บันทึกโดยผู้คุมสอบ รายการเรียงตามเวลา"))}</p>
      <p>${U.esc(T("exam.db.sAlerts", "แจ้งให้ไปดู {n}", { n: s.alerts }))} · ${U.esc(T("exam.db.sDismiss", "ไม่มีปัญหา {n}", { n: s.dismissed }))} · ${U.esc(T("exam.db.sEsc", "ส่งต่อ {n}", { n: s.escalated }))}</p>
      <table><thead><tr>${csvLabels().head.slice(0, 1).concat(csvLabels().head.slice(2, 9)).map(h => `<th>${U.esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(e => {
        const acts = e.acts || [], fr = e.kind === "alert" ? board.firstResp(e) : null; // same rule as CSV / summary: notes and keep-clip are not responses
        const ct = e.kind === "alert" ? clipText(board.clipState(e)) : "";
        return `<tr><td>${U.esc(U.time(e.t))}</td><td>${U.esc(e.seat || "–")}</td><td>${U.esc(U.reason(e))}${ct ? " · " + U.esc(ct) : ""}</td><td>${U.esc(U.lvl(e.lvl))}</td>` +
          `<td translate="no">${U.esc([...new Set(acts.map(x => x.who))].join(", "))}</td><td>${U.esc(e.kind === "alert" ? outcome(e) : "")}</td><td>${fr != null ? Math.round(fr / 1000) : ""}</td><td>${U.esc(acts.filter(x => x.note).map(x => x.note).join(" | "))}</td></tr>`;
      }).join("")}</tbody></table>
      <p>${U.esc(T("exam.db.rSign", "ลงชื่อผู้คุมสอบ ____________________ วันที่ ____________"))}</p>`;
    window.print();
  });
  $("#clearBtn").addEventListener("click", () => {
    if (!board || !confirm(T("exam.db.clearQ", "ล้างเหตุการณ์และผลการตรวจของห้องนี้ในเบราว์เซอร์นี้? (ส่งออก CSV ก่อนถ้าต้องเก็บ)"))) return;
    U.store.del(K.board(room)); join(room);
  });
  $("#importFile").addEventListener("change", async e => {
    const f = /** @type {HTMLInputElement} */ (e.target).files[0]; if (!f) return;
    if (!board) { const r = U.cleanRoom($("#room").value); if (!r) { $("#importMsg").textContent = T("exam.db.needRoom", "กรอกรหัสห้องสอบ (ตัวอักษรอังกฤษหรือตัวเลข)"); return; } join(r); }
    const res = L.parseFile(await f.text());
    let n = 0; for (const m of res.msgs) if (m.room === room && board.ingest(m, m.t).ok) n++;
    lastImport = { n, k: res.rejected + res.msgs.length - n }; importMsg();
    changed();
  });

  /* ---------- demo: a scripted exam so the page can be tried without cameras ---------- */
  $("#demoBtn").addEventListener("click", () => {
    if (!board) { if (!$("#room").value) $("#room").value = "DEMO"; if (!$("#seatRange").value) $("#seatRange").value = "1-12"; join(U.cleanRoom($("#room").value) || "DEMO"); }
    const now = Date.now(), lab = "demolab0001", hall = "demohall0001";
    const ev = (dt, src, node, seat, sig, lvl, x) => board.ingest(Object.assign({ v: 1, type: "ev", room, node, src, seat, sig, lvl, t: now - dt }, x || {}), now);
    board.ingest({ v: 1, type: "hb", room, node: hall, src: "hall", name: T("exam.db.demoCam", "กล้องหน้าห้อง (สาธิต)"), seats: ["1", "2", "3", "4", "5", "6", "7", "8"], t: now, fps: 3, q: 80, pos: "front" }, now);
    board.ingest({ v: 1, type: "hb", room, node: lab, src: "lab", name: "", seats: ["9"], t: now, fps: 4, q: 72 }, now);
    ev(540000, "hall", hall, "3", "empty", "info", { dur: 20000 });
    ev(420000, "hall", hall, "3", "back", "info", { dur: 140000 });
    ev(300000, "lab", lab, "9", "away", "info", { dur: 1500 });
    ev(240000, "lab", lab, "9", "noface", "watch", { dur: 10000 });
    ev(200000, "hall", hall, "", "aisle", "watch", { n: 1, dur: 8000 });
    ev(120000, "hall", hall, "5", "lean", "watch", { dur: 4000 });
    ev(60000, "hall", hall, "", "setup", "setup", { code: "backlight" });
    ev(30000, "hall", hall, "6", "phone", "check");
    ev(10000, "lab", lab, "9", "fsexit", "watch");
    changed();
    engine(() => T("exam.db.demoOn", "สาธิต: เพิ่มเหตุการณ์ตัวอย่างแล้ว (ไม่มีกล้องจริง)"), "ok");
  });

  /* ---------- start ---------- */
  const saved = U.store.get(K.db, null);
  if (saved) { $("#room").value = saved.room || ""; $("#who").value = saved.who || ""; $("#seatRange").value = saved.seats || ""; }
  if (P.get("room")) $("#room").value = U.cleanRoom(P.get("room"));
  if (P.get("room") || (saved && saved.room)) join(U.cleanRoom($("#room").value));
  if (!board) engine(() => T("exam.db.engine0", "ยังไม่ได้เข้าห้องสอบ"));
  window.addEventListener("lq-lang", () => { rendered = -1; render(); importMsg(); if (lastEngine) engine(lastEngine[0], lastEngine[1]); });

  /** @type {any} */ (window).__LQ_EXAM_DB = { get board() { return board; }, get room() { return room; }, get link() { return link; }, join, render: () => { rendered = -1; render(); } };
})();
