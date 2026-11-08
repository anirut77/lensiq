/* lensiq-promptpay.js — LQPromptPay: PromptPay (Thai QR Payment, EMVCo merchant-presented mode) payload + QR, built on
 * this device. No network, no payment provider: the QR simply asks the payer's banking app to transfer an exact amount
 * to the site's PromptPay ID. Whether money ARRIVED must still be checked in the receiving bank app (the page says so).
 * Browser: window.LQPromptPay (QR drawing needs vendor/qrcode-generator/qrcode.js -> window.qrcode) · Node: module.exports.
 * Payload layout follows the MIT reference implementation dtinth/promptpay-qr (same field order and target formatting).
 *
 *   crc16(str) -> "ABCD"          CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), upper-case hex — the EMVCo tag 63 value
 *   targetType(id) -> '01' phone | '02' national / tax ID (13 digits) | '03' e-wallet (15 digits)
 *   formatTarget(id) -> phone 08x-xxx-xxxx -> "0066" + 9 digits (13 chars); 13 / 15 digits unchanged
 *   validTarget(id) -> boolean    10-digit mobile starting 0, 13-digit ID (checksum), 15-digit e-wallet
 *   payload(id, amount?) -> string   amount > 0 -> dynamic QR (01 = 12) with tag 54 = amount.toFixed(2); else static (11)
 *   parse(payload) -> {ok, crcOk, tags:{id: value}, target, amount}   TLV parse + CRC check (tests, receipts)
 *   matrix(text, ecc='M') -> {size, get(r, c)}       QR modules (vendored MIT encoder)
 *   draw(canvas, text, {scale=6, margin=4, ecc='M'}) -> size in px
 */
(function (root, factory) {
  const m = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = m; else /** @type {any} */ (root).LQPromptPay = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const g = /** @type {any} */ (typeof self !== "undefined" ? self : {});
  const GUID = "A000000677010111";
  const tlv = (id, v) => id + String(v.length).padStart(2, "0") + v;
  function crc16(s) {
    let c = 0xffff;
    for (let i = 0; i < s.length; i++) {
      c ^= (s.charCodeAt(i) & 0xff) << 8;
      for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    }
    return c.toString(16).toUpperCase().padStart(4, "0");
  }
  const digits = id => String(id == null ? "" : id).replace(/[^0-9]/g, "");
  function targetType(id) { const d = digits(id); return d.length >= 15 ? "03" : d.length >= 13 ? "02" : "01"; }
  function formatTarget(id) {
    const d = digits(id);
    if (d.length >= 13) return d;
    return ("0000000000000" + d.replace(/^0/, "66")).slice(-13);
  }
  function thaiIdOk(d) {
    if (!/^\d{13}$/.test(d)) return false;
    let s = 0; for (let i = 0; i < 12; i++) s += +d[i] * (13 - i);
    return (11 - (s % 11)) % 10 === +d[12];
  }
  function validTarget(id) {
    const d = digits(id);
    return /^0[689]\d{8}$/.test(d) || thaiIdOk(d) || /^\d{15}$/.test(d);
  }
  /** @param {string} id @param {number} [amount] */
  function payload(id, amount) {
    const a = Number(amount);
    const dyn = Number.isFinite(a) && a > 0;
    if (dyn && a > 9999999.99) throw new Error("amount");
    const parts = [
      tlv("00", "01"),
      tlv("01", dyn ? "12" : "11"),
      tlv("29", tlv("00", GUID) + tlv(targetType(id), formatTarget(id))),
      tlv("58", "TH"),
      tlv("53", "764")
    ];
    if (dyn) parts.push(tlv("54", (Math.round(a * 100) / 100).toFixed(2)));
    const body = parts.join("") + "6304";
    return body + crc16(body);
  }
  function parseTLV(s) {
    const out = {}; let i = 0;
    while (i + 4 <= s.length) {
      const id = s.slice(i, i + 2), n = parseInt(s.slice(i + 2, i + 4), 10);
      if (!Number.isFinite(n) || i + 4 + n > s.length) return null;
      out[id] = s.slice(i + 4, i + 4 + n); i += 4 + n;
    }
    return i === s.length ? out : null;
  }
  function parse(p) {
    const s = String(p || ""), tags = parseTLV(s);
    if (!tags) return { ok: false, crcOk: false, tags: {}, target: "", amount: null };
    const crcOk = !!tags["63"] && s.endsWith(tags["63"]) && crc16(s.slice(0, -4)) === tags["63"];
    const m = tags["29"] ? parseTLV(tags["29"]) || {} : {};
    const target = m["01"] || m["02"] || m["03"] || "";
    return { ok: tags["00"] === "01" && m["00"] === GUID && tags["53"] === "764" && tags["58"] === "TH", crcOk, tags, target, amount: tags["54"] ? Number(tags["54"]) : null };
  }
  function lib() {
    // path in a variable so the type-check program does not pull the vendored (untyped UMD) library in
    const vendorPath = "./vendor/qrcode-generator/qrcode.js";
    const q = g.qrcode || (typeof module !== "undefined" && module.exports ? require(vendorPath) : null);
    if (!q) throw new Error("qrcode-generator not loaded");
    return q;
  }
  function matrix(text, ecc = "M") {
    const q = lib()(0, ecc);
    q.addData(String(text), "Byte"); q.make();
    const size = q.getModuleCount();
    return { size, get: (r, c) => q.isDark(r, c) };
  }
  /** @param {HTMLCanvasElement} canvas @param {string} text */
  function draw(canvas, text, o = {}) {
    const m = matrix(text, o.ecc || "M"), sc = o.scale || 6, mg = o.margin == null ? 4 : o.margin, px = (m.size + 2 * mg) * sc;
    canvas.width = px; canvas.height = px;
    const x = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
    x.fillStyle = "#fff"; x.fillRect(0, 0, px, px); x.fillStyle = "#000";
    for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.get(r, c)) x.fillRect((c + mg) * sc, (r + mg) * sc, sc, sc);
    return px;
  }
  return { GUID, crc16, targetType, formatTarget, validTarget, thaiIdOk, payload, parse, matrix, draw };
});
