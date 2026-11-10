/* exam-ui.js — LQExamUI: small helpers shared by the LENSIQ Exam pages (translation, labels, formatting, downloads).
 * Thai is the default text; English / Chinese come from i18n/en-exam.js / i18n/zh-exam.js through LQI18N.tf(). */
(function (root) {
  "use strict";
  const T = (key, thai, vars) => (root.LQI18N ? root.LQI18N.tf(key, thai, vars) : String(thai).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m)));
  const E = () => root.LQExam;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sig = id => T("exam.sig." + id, (E().SIGNALS[id] || { th: id }).th);
  const lvl = l => T("exam.lvl." + l, E().LEVEL_TH[l] || l);
  const WHAT_TH = { phone: "โทรศัพท์", book: "หนังสือ", laptop: "แล็ปท็อป", screen: "จอภาพ", copy: "คัดลอก", cut: "ตัด", contextmenu: "คลิกขวา",
    print: "สั่งพิมพ์", printscreen: "ปุ่มจับภาพหน้าจอ", offline: "หลุด", online: "กลับมา",
    dark: "มืดเกินไป", bright: "สว่างเกินไป", backlight: "แสงย้อน", blur: "ภาพเบลอ", flat: "ภาพไม่มีรายละเอียด",
    faceoff: "ตัวตรวจใบหน้าทำงานในเครื่องนี้ไม่ได้" };
  const what = w => (w && WHAT_TH[w] ? T("exam.what." + w, WHAT_TH[w]) : "");
  const lang = () => (root.LQI18N && root.LQI18N.lang) || "th";
  const locale = () => ({ th: "th-TH", en: "en-GB", zh: "zh-CN" }[lang()] || "th-TH");
  const time = t => new Date(t).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  function dur(ms) {
    const s = Math.max(0, Math.round((ms || 0) / 1000));
    return s < 60 ? T("exam.c.sec", "{n} วินาที", { n: s }) : T("exam.c.min", "{m} นาที {s} วินาที", { m: Math.floor(s / 60), s: s % 60 });
  }
  /** plain-language reason for an event: label + what + duration/count */
  function reason(e) {
    let s = sig(e.sig);
    const w = what(e.what || e.code);
    if (w) s += " · " + w;
    if (e.dur) s += " · " + dur(e.dur);
    if (e.sig === "multiface" && e.cnt) s += " · " + T("exam.c.faces", "{n} ใบหน้า", { n: e.cnt });
    if (e.sig === "headturn" && e.lvl === "watch" && e.cnt) s += " · " + T("exam.c.times5", "{n} ครั้งใน 5 นาที", { n: e.cnt });
    if (e.sig === "paste" && e.cnt) s += " · " + T("exam.c.chars", "{n} ตัวอักษร", { n: e.cnt });
    return s;
  }
  function download(name, text, type) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" })); a.download = name;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  const params = () => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(); } };
  const cleanRoom = v => String(v || "").trim().replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 24);
  const cleanSeat = v => String(v || "").trim().replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 16);
  root.LQExamUI = { T, esc, sig, lvl, what, time, dur, reason, download, store, params, cleanRoom, cleanSeat, lang };
})(typeof self !== "undefined" ? self : this);
