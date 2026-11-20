/* admin-lead-notify.js — LINE notification wording for the quote-request inbox (owner order 2026-11-15, "LINE lead
 * notification is never silent"; review round 1). Loaded right BEFORE admin.js, which uses window.LQLeadNotify for the
 * status line under the inbox, the row badges and the detail field. Only secret NAMES and reason codes ever reach the page
 * (GET /admin/api/leads/notify), never a value. TH default; EN / ZH in i18n/en-admin.js, i18n/zh-admin.js (adl.nf.*, and
 * adl.nh.* for the health box shown while the Worker var LEAD_NOTIFY_HEALTH is "on"). */
(function () {
  "use strict";
  /** Inbox rows that get a badge: the owner was not (or maybe not) told on LINE. */
  var MISS = ["skipped", "failed", "capped", "unknown"];
  /** @param {Function} G @param {string} code */
  function reason(G, code) {
    var T = /** @type {Record<string, string>} */ ({
      missing: G("adl.nf.r.missing", "ยังไม่ได้ตั้งค่า"),
      whitespace: G("adl.nf.r.whitespace", "มีช่องว่างหรือขึ้นบรรทัดอยู่ข้างใน"),
      too_short: G("adl.nf.r.too_short", "สั้นเกินไป (ไม่ใช่ channel access token ที่ถูกต้อง)"),
      starts_with_at: G("adl.nf.r.starts_with_at", "ขึ้นต้นด้วย @ ซึ่งเป็น ID ของบัญชี LINE OA ไม่ใช่ user ID ของคุณ (ต้องเป็น U ตามด้วย 32 ตัว)"),
      wrong_length: G("adl.nf.r.wrong_length", "ความยาวไม่ถูกต้อง (ต้องมี 33 ตัว: U ตามด้วย 32 ตัว)"),
      not_u32hex: G("adl.nf.r.not_u32hex", "รูปแบบไม่ถูกต้อง (ต้องเป็น U ตามด้วยตัวเลข 0-9 และตัวอักษร a-f ตัวเล็ก 32 ตัว)")
    });
    return T[code] || code;
  }
  /** @param {Function} G @param {string} detail e.g. "http_401", "error", "unrecorded" */
  function failText(G, detail) {
    var m = /^http_(\d{1,3})$/.exec(String(detail || ""));
    var n = m ? Number(m[1]) : -1;
    if (n === 0) return G("adl.nf.http0", "LINE ไม่ตอบ (เครือข่ายขัดข้องหรือหมดเวลา)");
    if (n === 401) return G("adl.nf.http401", "LINE ตอบรหัส 401: token ไม่ถูกต้องหรือหมดอายุ ให้ออก token ใหม่แล้วตั้งค่าอีกครั้ง");
    if (n === 400) return G("adl.nf.http400", "LINE ตอบรหัส 400: ตรวจ LEAD_NOTIFY_LINE_TO และเพิ่ม @632yliiw เป็นเพื่อนในโทรศัพท์ของคุณ");
    if (n === 429) return G("adl.nf.http429", "LINE ตอบรหัส 429: ใช้โควตาข้อความของ LINE OA เดือนนี้หมดแล้ว");
    if (detail === "unrecorded") return G("adl.nf.unrecorded", "บันทึกผลการแจ้ง LINE ของคำขอล่าสุดไม่ได้ (ดูบันทึก alert.lead_line_unrecorded ของ Worker)");
    if (detail === "error") return G("adl.nf.error", "เกิดข้อผิดพลาดในระบบก่อนส่ง LINE (ดูบันทึก alert.lead_line_unrecorded ของ Worker)");
    return G("adl.nf.http", "LINE ตอบรหัส {n}", { n: n < 0 ? "?" : n });
  }
  /** "LENSIQ_TO missing; ..." from a skipped lead's detail ("NAME:reason,NAME:reason"). @param {Function} G @param {string} detail */
  function skipText(G, detail) {
    return String(detail || "").split(",").map(function (x) {
      var i = x.indexOf(":"); return i > 0 ? x.slice(0, i) + " " + reason(G, x.slice(i + 1)) : x;
    }).join("; ");
  }
  /** Status line text. @param {Function} G @param {Function} dt @param {any} r answer of /leads/notify, or {state: "unavailable"} */
  function line(G, dt, r) {
    var st = String(r.state || "unavailable");
    if (st === "unavailable") return G("adl.nf.unknown", "ตรวจสถานะการแจ้งเตือนทาง LINE ไม่ได้ ลองกดโหลดใหม่");
    var parts = [];
    parts.push(G("adl.nf.label", "การแจ้งเตือนทาง LINE") + G("adl.nf.sep", ": ") + (st === "ok" ? G("adl.nf.ok", "ทำงาน")
      : st === "capped" ? G("adl.nf.capped", "หยุดชั่วคราว ครบจำนวนต่อวันแล้ว (คำขอยังเข้ากล่องนี้ตามปกติ)")
      : st === "unconfirmed" ? G("adl.nf.unconfirmed", "ตั้งค่าถูกต้องแล้ว รอคำขอถัดไปเพื่อยืนยันว่าส่งได้") : G("adl.nf.off", "ไม่ทำงาน")));
    if (st === "off") {
      parts.push(G("adl.nf.why", "สาเหตุ: {r}", { r: (r.problems || []).map(function (/** @type {any} */ p) { return p.secret + " " + reason(G, p.reason); }).join("; ") }));
    } else if (st === "failing") {
      parts.push(G("adl.nf.why", "สาเหตุ: {r}", { r: failText(G, r.last && r.last.detail) }));
    }
    parts.push(r.last_sent_at ? G("adl.nf.last", "ส่งสำเร็จล่าสุด: {t}", { t: dt(r.last_sent_at) }) : G("adl.nf.never", "ยังไม่เคยส่งสำเร็จ"));
    return parts.join(" · ");
  }
  /** Badge text + tooltip for an inbox row, or null. @param {Function} G @param {any} notify */
  function badge(G, notify) {
    if (MISS.indexOf(notify) < 0) return null;
    return notify === "unknown"
      ? { text: G("adl.nf.badgeUnknown", "ไม่ทราบผลแจ้ง LINE"), title: G("adl.nf.unknownTip", "ไม่รู้ว่ามีข้อความ LINE แจ้งคำขอนี้หรือไม่ โปรดตรวจเอง") }
      : { text: G("adl.nf.badge", "ยังไม่ได้แจ้งทาง LINE"), title: G("adl.nf.badgeTip", "ไม่มีข้อความ LINE แจ้งคำขอนี้ โปรดตรวจเอง") };
  }
  /** Detail-view field of one lead. @param {Function} G @param {Function} dt @param {any} l */
  function field(G, dt, l) {
    var sep = G("adl.nf.sep", ": ");
    return l.notify === "sent" ? G("adl.nf.sent", "ส่งแล้ว {t}", { t: dt(l.notify_at) })
      : l.notify === "failed" ? G("adl.nf.badge", "ยังไม่ได้แจ้งทาง LINE") + sep + failText(G, l.notify_detail)
      : l.notify === "unknown" ? G("adl.nf.badgeUnknown", "ไม่ทราบผลแจ้ง LINE") + sep + failText(G, "unrecorded")
      : l.notify === "capped" ? G("adl.nf.capped", "หยุดชั่วคราว ครบจำนวนต่อวันแล้ว (คำขอยังเข้ากล่องนี้ตามปกติ)")
      : l.notify === "skipped" ? G("adl.nf.badge", "ยังไม่ได้แจ้งทาง LINE") + sep + skipText(G, l.notify_detail) : null;
  }
  /** Reason of a bad LEAD_NOTIFY_LINE_DAY value. @param {Function} G @param {string} code */
  function dayReason(G, code) {
    return code === "not_integer" ? G("adl.nh.r.not_integer", "ไม่ใช่ตัวเลขจำนวนเต็ม")
      : code === "out_of_range" ? G("adl.nh.r.out_of_range", "ต้องอยู่ระหว่าง 1 ถึง 1000") : code;
  }
  /** Plain reason of a recorded failure. @param {Function} G @param {any} f {state, detail, at} */
  function failureText(G, f) {
    return f.state === "skipped" ? skipText(G, f.detail) : f.state === "capped" ? G("adl.nf.capped", "หยุดชั่วคราว ครบจำนวนต่อวันแล้ว (คำขอยังเข้ากล่องนี้ตามปกติ)")
      : f.state === "unknown" ? failText(G, "unrecorded") : failText(G, f.detail);
  }
  /** Health box under the status line (Worker var LEAD_NOTIFY_HEALTH = "on", A3 2026-11-20): one line per notify setting
   *  (configured, format OK or the plain reason), the last success, the last failure, failures in 7 days, and a flag while
   *  requests were not notified since the last success or a LINE secret is missing / malformed. Hidden when the Worker
   *  sends no health (switch off). Secret NAMES and reason codes only, never a value.
   *  @param {HTMLElement|null} el @param {Function} G @param {Function} dt @param {any} r answer of /leads/notify */
  function health(el, G, dt, r) {
    if (!el) return;
    var h = r && r.health;
    el.textContent = "";
    if (!h) { el.hidden = true; el.removeAttribute("data-flagged"); return; }
    el.hidden = false;
    el.setAttribute("data-flagged", h.flagged ? "1" : "0");
    el.className = "adl-health" + (h.flagged ? " adl-nf-bad" : "");
    /** @param {string} key @param {string} text */
    var add = function (key, text) {
      var p = document.createElement("p");
      p.setAttribute("data-health-row", key);
      p.textContent = text;
      el.appendChild(p);
    };
    var head = document.createElement("h4");
    head.textContent = G("adl.nh.title", "สถานะการแจ้งเตือนทาง LINE");
    el.appendChild(head);
    var sep = G("adl.nf.sep", ": ");
    (h.settings || []).forEach(function (/** @type {any} */ s) {
      var t = s.kind === "var"
        ? (!s.configured ? G("adl.nh.dayDefault", "ไม่ได้ตั้ง ใช้ค่าเริ่มต้น {n} ครั้งต่อวัน", { n: s.effective })
          : s.format_ok ? G("adl.nh.day", "{n} ครั้งต่อวัน", { n: s.effective })
          : G("adl.nh.dayBad", "ตั้งค่าแล้ว แต่รูปแบบไม่ถูกต้อง ({r}) ใช้ {n} ครั้งต่อวันแทน", { r: dayReason(G, s.reason), n: s.effective }))
        : (!s.configured ? G("adl.nh.unset", "ยังไม่ได้ตั้งค่า")
          : s.format_ok ? G("adl.nh.ok", "ตั้งค่าแล้ว รูปแบบถูกต้อง")
          : G("adl.nh.bad", "ตั้งค่าแล้ว แต่รูปแบบไม่ถูกต้อง ({r})", { r: reason(G, s.reason) }));
      add(String(s.name), s.name + sep + t);
    });
    add("last_success", h.last_success_at ? G("adl.nf.last", "ส่งสำเร็จล่าสุด: {t}", { t: dt(h.last_success_at) }) : G("adl.nf.never", "ยังไม่เคยส่งสำเร็จ"));
    var f = h.last_failure;
    add("last_failure", f ? G("adl.nh.lastFail", "ไม่สำเร็จล่าสุด: {t} · {r}", { t: f.at ? dt(f.at) : "—", r: failureText(G, f) })
      : G("adl.nh.noFail", "ยังไม่มีครั้งที่ไม่สำเร็จ"));
    add("week", G("adl.nh.week", "ไม่สำเร็จใน 7 วันที่ผ่านมา: {n} รายการ", { n: Number(h.failures_7d) || 0 }));
    if (Number(h.failures_since_success) > 0) {
      add("flag", G("adl.nh.flag", "คำขอ {n} รายการยังไม่ได้แจ้งทาง LINE ตั้งแต่ส่งสำเร็จครั้งล่าสุด ตรวจคำขอที่มีป้ายในรายการด้านบน", { n: Number(h.failures_since_success) }));
    } else if (!h.configured) {
      add("flag", G("adl.nh.flagConfig", "การตั้งค่า LINE ยังไม่ครบหรือรูปแบบไม่ถูกต้อง คำขอใหม่จะไม่มีข้อความ LINE"));
    }
  }
  /** @type {any} */ (window).LQLeadNotify = { MISS: MISS, line: line, badge: badge, field: field, health: health };
})();
