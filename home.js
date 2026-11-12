/* LENSIQ landing page: hero "camera vision" canvas + demo-request form */
(function () {
  "use strict";

  var reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
  // i18n (lensiq-i18n.js, loaded by nav.js): Thai text below is the default; keys in i18n/zh-common.js ("home.*")
  var T = function (key, thai, vars) {
    if (window.LQI18N) return window.LQI18N.tf(key, thai, vars);
    return vars ? thai.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? String(vars[k]) : m; }) : thai;
  };

  /* ================= Hero canvas ================= */
  var cv = /** @type {HTMLCanvasElement} */ (document.getElementById("visionCanvas"));
  if (cv && cv.getContext) {
    var ctx = cv.getContext("2d");
    var W = 640, H = 480, scale = 1, dpr = 1, ls = 1;
    var CYAN = "#22d3ee", VIOLET = "#8b78ff", FONT = "Prompt, 'IBM Plex Sans Thai', system-ui, sans-serif";
    var screen = { x: 230, y: 34, w: 180, h: 92 };

    var people = [
      { x: 120, y: 448, v: 18, base: 82, tone: 0, phase: 0.0, id: 3 },
      { x: 520, y: 372, v: -14, base: 64, tone: 1, phase: 1.7, id: 7 },
      { x: 330, y: 318, v: 10, base: 47, tone: 2, phase: 3.1, id: 12 },
      { x: 30, y: 352, v: 22, base: 71, tone: 1, phase: 0.6, id: 15 }
    ];
    var TONES = [["#3b4a8f", "#27325f"], ["#4b3d8f", "#2e2760"], ["#2f5b86", "#1f3b5a"]];
    var heat = [];
    var lastHeat = 0, running = false, raf = 0, t0 = 0, visible = true;

    var resize = function () {
      var w = cv.clientWidth || 640;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(w * 0.75 * dpr);
      scale = (w / W) * dpr;
      ls = Math.min(1.6, Math.max(1, 520 / w)); // keep labels legible on phones
      if (!running) draw(reduceMq.matches ? 6 : (performance.now() - t0) / 1000);
    };

    var rr = function (x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    };

    var drawBg = function (t) {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#0d1330"); g.addColorStop(1, "#111a3d");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // perspective floor grid
      ctx.strokeStyle = "rgba(139,120,255,.12)"; ctx.lineWidth = 1;
      var hz = 200;
      for (var i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 18, hz); ctx.lineTo(W / 2 + i * 120, H); ctx.stroke(); }
      for (var k = 0; k < 9; k++) { var yy = hz + Math.pow(k / 8, 1.8) * (H - hz); ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); }
      // ad screen
      var sg = ctx.createLinearGradient(screen.x, screen.y, screen.x + screen.w, screen.y + screen.h);
      sg.addColorStop(0, "#2b2470"); sg.addColorStop(1, "#14476a");
      ctx.fillStyle = sg; rr(screen.x, screen.y, screen.w, screen.h, 8); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = "500 13px " + FONT; ctx.textAlign = "center";
      ctx.fillText(T("home.cv.screen", "จอโฆษณา"), screen.x + screen.w / 2, screen.y + 40);
      ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.font = "11px " + FONT;
      ctx.fillText(T("home.cv.campaign", "แคมเปญ A · {n}/15 วิ", { n: Math.floor(t) % 15 + 1 }), screen.x + screen.w / 2, screen.y + 60);
      ctx.fillStyle = "rgba(34,211,238,.8)"; ctx.fillRect(screen.x + 20, screen.y + 72, (screen.w - 40) * ((t % 15) / 15), 3);
      ctx.textAlign = "left";
    };

    var drawHeat = function (now) {
      for (var i = heat.length - 1; i >= 0; i--) {
        var h = heat[i], age = (now - h.t) / 9000;
        if (age >= 1) { heat.splice(i, 1); continue; }
        var a = (1 - age) * 0.32, r = 26;
        var g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, r);
        g.addColorStop(0, h.c === 0 ? "rgba(255,93,115," + a + ")" : "rgba(139,120,255," + a + ")");
        g.addColorStop(1, "rgba(139,120,255,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(h.x, h.y, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      }
    };

    var personState = function (p, t) {
      var x = p.x + p.v * t;
      var span = W + 160;
      x = ((x + 80) % span + span) % span - 80;
      var sc = 0.55 + (p.y - 300) / 150 * 0.5;
      var interest = Math.max(5, Math.min(97, Math.round(p.base + 9 * Math.sin(t * 0.7 + p.phase))));
      return { x: x, y: p.y + Math.sin(t * 6 + p.phase) * 1.2, sc: sc, interest: interest };
    };

    var drawPerson = function (p, s, t) {
      var x = s.x, y = s.y, sc = s.sc, c = TONES[p.tone];
      var swing = Math.sin(t * 6 + p.phase) * 10 * sc;
      ctx.lineCap = "round";
      ctx.strokeStyle = c[1]; ctx.lineWidth = 16 * sc;
      ctx.beginPath(); ctx.moveTo(x - 9 * sc, y - 62 * sc); ctx.lineTo(x - 9 * sc + swing, y - 4 * sc); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 9 * sc, y - 62 * sc); ctx.lineTo(x + 9 * sc - swing, y - 4 * sc); ctx.stroke();
      var g = ctx.createLinearGradient(x, y - 150 * sc, x, y - 50 * sc);
      g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
      ctx.fillStyle = g; rr(x - 30 * sc, y - 148 * sc, 60 * sc, 95 * sc, 24 * sc); ctx.fill();
      var hy = y - 172 * sc;
      ctx.fillStyle = c[0]; ctx.beginPath(); ctx.arc(x, hy, 22 * sc, 0, Math.PI * 2); ctx.fill();
      // face landmark dots
      ctx.fillStyle = "rgba(34,211,238,.9)";
      var pts = [[-8, -4], [8, -4], [0, 4], [-7, 11], [0, 13], [7, 11], [-13, 2], [13, 2]];
      for (var i = 0; i < pts.length; i++) { ctx.beginPath(); ctx.arc(x + pts[i][0] * sc, hy + pts[i][1] * sc, 1.6 * Math.max(sc, .7), 0, Math.PI * 2); ctx.fill(); }
      return hy;
    };

    var corners = function (x, y, w, h, col, len) {
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
      ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
      ctx.moveTo(x + w, y + h - len); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - len, y + h);
      ctx.moveTo(x + len, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - len);
      ctx.stroke();
    };

    var label = function (x, y, text, col) {
      ctx.font = "500 " + Math.round(12 * ls) + "px " + FONT;
      var w = ctx.measureText(text).width + 14 * ls, h = 20 * ls;
      x = Math.max(4, Math.min(W - w - 4, x));
      ctx.fillStyle = col; rr(x, y - h, w, h, 5); ctx.fill();
      ctx.fillStyle = "#0b1024"; ctx.fillText(text, x + 7 * ls, y - 6 * ls);
    };

    var draw = function (t) {
      var now = performance.now();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawBg(t);
      drawHeat(now);
      var states = people.map(function (p) { return personState(p, t); });
      var order = people.map(function (p, i) { return i; }).sort(function (a, b) { return people[a].y - people[b].y; });
      var top = 0;
      states.forEach(function (s, i) { if (s.interest > states[top].interest) top = i; });
      var watching = 0, sum = 0;
      order.forEach(function (i) {
        var p = people[i], s = states[i];
        if (s.x < -60 || s.x > W + 60) return;
        var hy = drawPerson(p, s, t);
        var looking = s.interest >= 55;
        if (looking) {
          watching++;
          ctx.strokeStyle = "rgba(139,120,255,.35)"; ctx.setLineDash([4, 5]); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(s.x, hy - 10 * s.sc); ctx.lineTo(screen.x + screen.w / 2, screen.y + screen.h); ctx.stroke(); ctx.setLineDash([]);
        }
        sum += s.interest;
        var bx = s.x - 46 * s.sc, by = hy - 34 * s.sc, bw = 92 * s.sc, bh = s.y - by + 6;
        var col = i === top ? VIOLET : CYAN;
        corners(bx, by, bw, bh, col, 12 * s.sc + 4);
        ctx.strokeStyle = i === top ? "rgba(139,120,255,.9)" : "rgba(34,211,238,.6)"; ctx.lineWidth = 1.2;
        ctx.strokeRect(s.x - 26 * s.sc, hy - 28 * s.sc, 52 * s.sc, 54 * s.sc);
        label(bx, by - 4, T("home.cv.interest", "ความสนใจ {n}%", { n: s.interest }), col);
        if (i === top && s.sc > 0.75) label(bx, by - 8 - 20 * ls, T("home.cv.smile", "อารมณ์: ยิ้ม"), "#ffd27a");
      });
      // heat points from feet
      if (now - lastHeat > 260) {
        lastHeat = now;
        states.forEach(function (s, i) { if (s.x > 0 && s.x < W) heat.push({ x: s.x, y: s.y, t: now, c: i === top ? 0 : 1 }); });
        if (heat.length > 140) heat.splice(0, heat.length - 140);
      }
      // scan line
      var sy = (t * 90) % (H + 80) - 40;
      var sg = ctx.createLinearGradient(0, sy - 40, 0, sy);
      sg.addColorStop(0, "rgba(34,211,238,0)"); sg.addColorStop(1, "rgba(34,211,238,.16)");
      ctx.fillStyle = sg; ctx.fillRect(0, sy - 40, W, 40);
      ctx.fillStyle = "rgba(34,211,238,.5)"; ctx.fillRect(0, sy, W, 1);
      // HUD
      ctx.fillStyle = "rgba(10,15,38,.78)"; rr(12, H - 62, 230, 50, 10); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "500 13px " + FONT;
      ctx.fillText(T("home.cv.watching", "กำลังมองจอ {n} คน", { n: watching }), 24, H - 41);
      ctx.fillStyle = "#b9c1e0"; ctx.font = "12px " + FONT;
      ctx.fillText(T("home.cv.avg", "ความสนใจเฉลี่ย {n}%", { n: Math.round(sum / people.length) }), 24, H - 22);
      // mini bars
      ctx.fillStyle = "rgba(10,15,38,.78)"; rr(W - 152, H - 62, 140, 50, 10); ctx.fill(); ctx.stroke();
      var vals = [0.8, 0.55, 0.3, 0.62, 0.45, 0.72];
      for (var b = 0; b < vals.length; b++) {
        var v = Math.max(0.15, Math.min(1, vals[b] + 0.15 * Math.sin(t * 0.9 + b)));
        ctx.fillStyle = b % 2 ? VIOLET : CYAN;
        ctx.fillRect(W - 140 + b * 20, H - 20 - v * 30, 12, v * 30);
      }
    };

    var loop = function (now) {
      if (!running) return;
      draw((now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    var start = function () {
      if (running || reduceMq.matches || !visible || document.hidden) return;
      running = true; raf = requestAnimationFrame(loop);
    };
    var stop = function () { running = false; cancelAnimationFrame(raf); };
    var update = function () {
      if (reduceMq.matches) { stop(); heat.length = 0; seedHeat(); draw(6); } else start();
    };
    // Static frame: pre-fill a heat trail so the still image still reads as a heatmap.
    var seedHeat = function () {
      var now = performance.now();
      for (var k = 0; k < 24; k++) people.forEach(function (p, i) {
        var s = personState(p, 6 - k * 0.25);
        heat.push({ x: s.x, y: s.y, t: now - k * 200, c: i === 0 ? 0 : 1 });
      });
    };

    t0 = performance.now();
    resize();
    window.addEventListener("resize", resize);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; visible ? start() : stop(); }).observe(cv);
    }
    document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
    if (reduceMq.addEventListener) reduceMq.addEventListener("change", update);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!running) update(); });
    update();
  }

  /* ================= Demo request form ================= */
  var form = document.getElementById("leadForm");
  if (form) {
    /** @param {string} id @returns {HTMLInputElement} form controls (input / select / textarea share .value) */
    var $ = function (id) { return /** @type {HTMLInputElement} */ (document.getElementById(id)); };
    var msg = $("leadMsg");
    var rules = {
      lqName: function (v) { return v.trim().length >= 2 ? "" : T("home.err.name", "กรุณากรอกชื่ออย่างน้อย 2 ตัวอักษร"); },
      // one contact is enough (owner decision 2026-11-12: only what a quote needs): e-mail or phone
      lqEmail: function (v) {
        if (!v.trim()) return $("lqPhone").value.trim() ? "" : T("home.err.contact", "กรุณากรอกอีเมลหรือเบอร์โทรอย่างน้อยหนึ่งช่อง");
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? "" : T("home.err.email", "กรุณากรอกอีเมลให้ถูกต้อง เช่น name@company.com");
      },
      lqPhone: function (v) { var d = v.replace(/[\s\-()+]/g, ""); return !d || /^\d{9,12}$/.test(d) ? "" : T("home.err.phone", "เบอร์โทรควรเป็นตัวเลข 9–12 หลัก (เว้นว่างได้)"); },
      lqInterest: function (v) { return v ? "" : T("home.err.interest", "กรุณาเลือกด้านที่สนใจ"); },
      lqConsent: function (_, el) { return el.checked ? "" : T("home.err.consent", "กรุณายืนยันการให้ติดต่อกลับ"); }
    };
    var check = function (id) {
      var el = $(id), err = rules[id](el.value, el);
      var out = $(id + "Err");
      if (out) out.textContent = err;
      el.classList.toggle("invalid", !!err);
      el.setAttribute("aria-invalid", err ? "true" : "false");
      return !err;
    };
    Object.keys(rules).forEach(function (id) {
      var el = $(id);
      el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "blur", function () { check(id); });
      el.addEventListener("input", function () { if (el.classList.contains("invalid")) check(id); });
    });
    // a phone number typed after the "e-mail or phone" message clears it
    $("lqPhone").addEventListener("input", function () { if ($("lqEmail").classList.contains("invalid")) check("lqEmail"); });

    document.querySelectorAll("[data-plan]").forEach(function (a) {
      // the package choice is no longer collected (owner decision 2026-11-12); the buttons only jump to the form
      a.addEventListener("click", function () { var p = $("lqPlan"); if (p) p.value = a.getAttribute("data-plan") || ""; });
    });
    // product pages link here as index.html?interest=store#contact (retail / hr / creative / fortune)
    try {
      var want = new URLSearchParams(location.search).get("interest");
      if (want && /^[a-z]{2,20}$/.test(want) && $("lqInterest").querySelector('option[value="' + want + '"]')) $("lqInterest").value = want;
    } catch (e) { /* old browser */ }

    // how the form is delivered (lensiq-leads.js): API -> sent to the team; mailto / LINE -> the visitor sends it;
    // neither -> not sent (honest wording, stored in this browser only as before)
    var note = document.getElementById("leadNote");
    var mode = function () {
      // "api" only while the owner has switched the quote-request form on (LENSIQ_LEADS_FORM, on by default since 2026-11-12)
      var L = /** @type {any} */ (window).LQLeads;
      if (L && typeof L.serverOn === "function" && L.serverOn()) return "api";
      var f = L ? L.fallback() : { any: false };
      return f.any ? "fallback" : "none";
    };
    var showMode = function () {
      if (!note) return;
      var m = mode();
      note.setAttribute("data-mode", m);
      var b = note.querySelector("b"), sp = note.querySelector("span");
      if (!b || !sp) return;
      b.textContent = m === "api" ? T("home.form.mode.apiB", "ส่งถึงทีมงาน:") : T("home.form.demo.b", "โหมดเดโม:");
      sp.textContent = m === "api" ? T("home.form.mode.api", "คำขอจะส่งถึงทีมงาน LENSIQ โดยตรง (ป้องกันบอทด้วย Cloudflare Turnstile) ใช้เพื่อติดต่อกลับเท่านั้น")
        : m === "fallback" ? T("home.form.mode.fallback", "ระบบรับคำขอออนไลน์ยังไม่เปิด หลังกดส่ง เราจะเตรียมอีเมลหรือ LINE ให้คุณส่งถึงทีมงานเอง")
        : T("home.form.mode.none", "ระบบรับคำขอออนไลน์ยังไม่เปิด และช่องทางติดต่อของผู้ให้บริการจะประกาศก่อนเปิดขาย แบบฟอร์มนี้จึงยังไม่ส่งข้อมูลไปที่ใด (เก็บไว้ในเบราว์เซอร์นี้เท่านั้น)");
    };
    window.addEventListener("load", showMode);
    window.addEventListener("lq-lang", showMode);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      msg.className = "form-msg"; msg.textContent = "";
      var bad = Object.keys(rules).filter(function (id) { return !check(id); });
      if (bad.length) {
        msg.className = "form-msg err";
        msg.textContent = T("home.err.fix", "กรุณาแก้ไขข้อมูลที่ไฮไลต์ไว้ {n} รายการ", { n: bad.length });
        $(bad[0]).focus();
        return;
      }
      var lead = {
        id: Date.now().toString(36), createdAt: new Date().toISOString(),
        name: $("lqName").value.trim(), org: $("lqOrg").value.trim(), email: $("lqEmail").value.trim(),
        phone: $("lqPhone").value.trim(), interest: $("lqInterest").value,
        message: $("lqMsg").value.trim()
      };
      var keepLocal = function () {
        // round 12: lensiq-leads.js keeps it in the same "lq-leads" list (capped) and shows the "not sent yet" box
        var LQ = /** @type {any} */ (window).LQLeads;
        if (LQ && typeof LQ.queue === "function") return LQ.queue(lead);
        try {
          var list = JSON.parse(localStorage.getItem("lq-leads") || "[]");
          if (!Array.isArray(list)) list = [];
          list.push(lead);
          localStorage.setItem("lq-leads", JSON.stringify(list));
          return true;
        } catch (err) { return false; }
      };
      var done = function () {
        /** @type {HTMLFormElement} */ (form).reset();
        Object.keys(rules).forEach(function (id) { $(id).classList.remove("invalid"); $(id).removeAttribute("aria-invalid"); });
      };
      var L = /** @type {any} */ (window).LQLeads;
      var btn = /** @type {HTMLButtonElement|null} */ (form.querySelector("button[type=submit]"));
      if (btn) btn.disabled = true;
      msg.textContent = T("home.form.sending", "กำลังส่ง…");
      var sent = L ? L.submit(Object.assign({}, lead, { source: "index", lang: window.LQI18N ? window.LQI18N.lang : "th" }), { subject: "LENSIQ demo request" }) : Promise.resolve({ via: "none", ok: false });
      sent.then(function (/** @type {any} */ r) {
        if (btn) btn.disabled = false;
        msg.textContent = "";
        if (r && r.ok) {
          done();
          msg.className = "form-msg ok";
          var ql = L && typeof L.quoteLine === "function" ? L.quoteLine() : "";
          msg.textContent = ql
            ? T("home.ok.sentLine", "ขอบคุณคุณ{name} ส่งคำขอถึงทีมงานแล้ว เราจะติดต่อกลับตามข้อมูลที่ให้ไว้ หรือแอด LINE: {id}", { name: lead.name, id: ql })
            : T("home.ok.sent", "ขอบคุณคุณ{name} ส่งคำขอเดโมถึงทีมงานแล้ว ทีมงานจะติดต่อกลับทางอีเมลที่ให้ไว้", { name: lead.name });
          return;
        }
        var saved = keepLocal();
        if (r && (r.href || r.line)) {
          // not sent yet: the visitor's own mail app / LINE sends it — say so plainly
          msg.className = "form-msg";
          msg.appendChild(document.createTextNode(T("home.ok.fallback", "ยังไม่ได้ส่ง: ระบบรับคำขอออนไลน์ยังไม่เปิด กดส่งต่อทางอีเมลหรือ LINE ด้านล่างเพื่อให้ถึงทีมงาน", { name: lead.name }) + " "));
          if (r.href) { var a = document.createElement("a"); a.href = r.href; a.className = "btn ghost"; a.textContent = T("home.ok.mailto", "ส่งทางอีเมล"); msg.appendChild(a); msg.appendChild(document.createTextNode(" ")); }
          if (r.line) { var b2 = document.createElement("a"); b2.href = r.line; b2.target = "_blank"; b2.rel = "noopener"; b2.className = "btn ghost"; b2.textContent = T("home.ok.line", "แชตทาง LINE {id}", { id: r.lineId || "" }); msg.appendChild(b2); }
          return;
        }
        done();
        msg.className = "form-msg ok";
        msg.textContent = saved
          ? T("home.ok.notSent", "ขอบคุณคุณ{name} — ยังไม่ได้ส่งคำขอนี้: ระบบรับคำขอออนไลน์และช่องทางติดต่อของผู้ให้บริการจะประกาศก่อนเปิดขาย (บันทึกไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น)", { name: lead.name })
          : T("home.ok.unsaved", "ขอบคุณคุณ{name} ได้รับคำขอเดโมแล้ว (โหมดเดโม: เบราว์เซอร์ไม่อนุญาตให้บันทึกข้อมูล จึงไม่ได้เก็บไว้)", { name: lead.name });
      });
    });
  }

  // language switch: refresh visible validation messages in the new language
  window.addEventListener("lq-lang", function () {
    if (!form) return;
    Array.prototype.forEach.call(form.querySelectorAll(".invalid"), function (el) {
      el.dispatchEvent(new Event(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "blur"));
    });
  });

  var y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());
})();
