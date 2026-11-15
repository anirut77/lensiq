/* admin-lead-notify.js — LINE notification wording for the quote-request inbox (owner order 2026-11-15, "LINE lead
 * notification is never silent"; review round 1). Loaded right BEFORE admin.js, which uses window.LQLeadNotify for the
 * status line under the inbox, the row badges and the detail field. Only secret NAMES and reason codes ever reach the page
 * (GET /admin/api/leads/notify), never a value. TH default; EN / ZH in i18n/en-admin.js, i18n/zh-admin.js (adl.nf.*). */
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
  /** @type {any} */ (window).LQLeadNotify = { MISS: MISS, line: line, badge: badge, field: field };
})();
