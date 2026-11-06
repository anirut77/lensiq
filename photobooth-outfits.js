/* ชุดจำลองแบบภาพวาดเวกเตอร์ (ไม่มีตรา เครื่องหมายราชการ หรือยศ) — ใช้ร่วมกันระหว่าง photobooth.js (รูปติดบัตร) และ studio.js
 * window.PBOutfits = { NAMES, draw(ctx, kind, cx, chinY, u, H), render(kind, u) -> {canvas, chin:{x,y}} }
 *   u = ความกว้างใบหน้า (px) ที่ชุดจะเข้ารูป, chinY = ตำแหน่งคาง, H = ขอบล่างของภาพ
 */
(function (root) {
  "use strict";
  const NAMES = {
    civil: "ชุดข้าราชการปกติขาว", khaki: "ชุดกากี", suit: "สูทสากลเทาเข้ม", suit_navy: "สูทกรมท่า",
    shirt_tie: "เชิ้ตขาวผูกเนคไท", lady: "สูทสุภาพสตรีกรมท่า", lady_black: "สูทสุภาพสตรีดำ", student: "นักศึกษาชาย", student_f: "นักศึกษาหญิง"
  };
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  // แสงเงาให้ชุดดูมีมิติ: มืดที่ขอบ สว่างกลางอก
  function shade(c, cx, top, u, H) {
    c.save(); bodyPath(c, cx, top, u, H); c.clip();
    const g = c.createLinearGradient(cx - 1.8 * u, 0, cx + 1.8 * u, 0);
    g.addColorStop(0, "rgba(0,0,0,.28)"); g.addColorStop(.3, "rgba(0,0,0,0)"); g.addColorStop(.5, "rgba(255,255,255,.07)"); g.addColorStop(.7, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.28)");
    c.fillStyle = g; c.fillRect(cx - 2 * u, top, 4 * u, H);
    const v = c.createLinearGradient(0, top, 0, top + .5 * u); v.addColorStop(0, "rgba(0,0,0,.18)"); v.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = v; c.fillRect(cx - 2 * u, top, 4 * u, .5 * u);
    c.restore();
  }
  function tie(c, cx, top, u, col) {
    c.fillStyle = col; c.beginPath(); c.moveTo(cx - .08 * u, top + .2 * u); c.lineTo(cx + .08 * u, top + .2 * u); c.lineTo(cx + .05 * u, top + .3 * u); c.lineTo(cx + .11 * u, top + .95 * u); c.lineTo(cx, top + 1.07 * u); c.lineTo(cx - .11 * u, top + .95 * u); c.lineTo(cx - .05 * u, top + .3 * u); c.closePath(); c.fill();
    c.fillStyle = "rgba(255,255,255,.12)"; for (let i = 0; i < 5; i++) { c.save(); c.beginPath(); c.rect(cx - .11 * u, top + (.35 + i * .13) * u, .22 * u, .04 * u); c.clip(); c.beginPath(); c.moveTo(cx - .08 * u, top + .2 * u); c.lineTo(cx + .11 * u, top + .95 * u); c.lineTo(cx, top + 1.07 * u); c.lineTo(cx - .11 * u, top + .95 * u); c.closePath(); c.fill(); c.restore(); }
  }

  function bodyPath(c, cx, top, u, H, neck = .42) {
    c.beginPath(); c.moveTo(cx - neck * u, top);
    c.bezierCurveTo(cx - .75 * u, top + .12 * u, cx - 1.25 * u, top + .2 * u, cx - 1.48 * u, top + .52 * u);
    c.lineTo(cx - 1.8 * u, H + 5); c.lineTo(cx + 1.8 * u, H + 5); c.lineTo(cx + 1.48 * u, top + .52 * u);
    c.bezierCurveTo(cx + 1.25 * u, top + .2 * u, cx + .75 * u, top + .12 * u, cx + neck * u, top); c.closePath();
  }
  function buttons(c, cx, y0, gap, n, r, col) { c.fillStyle = col; for (let i = 0; i < n; i++) { c.beginPath(); c.arc(cx, y0 + i * gap, r, 0, 7); c.fill(); c.strokeStyle = "rgba(0,0,0,.25)"; c.lineWidth = r * .25; c.stroke(); } }
  function collarWings(c, cx, top, u, fill, stroke, spread = .5, len = .42) {
    [-1, 1].forEach(sd => { c.beginPath(); c.moveTo(cx, top + .26 * u); c.lineTo(cx + sd * .4 * u, top - .02 * u); c.lineTo(cx + sd * spread * u, top + len * u); c.closePath(); c.fillStyle = fill; c.fill(); c.strokeStyle = stroke; c.lineWidth = u * .015; c.stroke(); });
  }
  /* วาดชุดแบบเวกเตอร์ (ภาพจำลอง ไม่มีตราหรือเครื่องหมายยศ) */
  function drawOutfit(c, kind, cx, chinY, u, H) {
    if (kind === "none") return;
    const top = chinY + .16 * u, lw = u * .015;
    c.save(); c.lineJoin = "round";
    if (kind === "civil") {
      bodyPath(c, cx, top + .1 * u, u, H, .44); c.fillStyle = "#f6f6f2"; c.fill(); c.strokeStyle = "#cfcfc8"; c.lineWidth = lw; c.stroke();
      c.fillStyle = "#f6f6f2"; rrect(c, cx - .44 * u, top - .08 * u, .88 * u, .24 * u, .06 * u); c.fill(); c.stroke(); // คอตั้ง
      c.strokeStyle = "#bdbdb5"; c.beginPath(); c.moveTo(cx, top + .16 * u); c.lineTo(cx, H); c.stroke();
      buttons(c, cx, top + .34 * u, .36 * u, 5, .05 * u, "#d9b45a");
      [-1, 1].forEach(sd => { c.save(); c.translate(cx + sd * 1.05 * u, top + .3 * u); c.rotate(sd * .38); c.fillStyle = "#1d2b44"; rrect(c, -.28 * u, -.07 * u, .56 * u, .14 * u, .04 * u); c.fill(); c.restore(); }); // อินทรธนูแบบเรียบ ไม่มียศ
      [-1, 1].forEach(sd => { c.strokeStyle = "#d0d0c8"; c.strokeRect(cx + sd * .55 * u - (sd > 0 ? 0 : .42 * u), top + .75 * u, .42 * u, .36 * u); });
    } else if (kind === "khaki") {
      bodyPath(c, cx, top, u, H); c.fillStyle = "#b39a6b"; c.fill(); c.strokeStyle = "#8a744b"; c.lineWidth = lw; c.stroke();
      c.fillStyle = "#c9b48a"; c.beginPath(); c.moveTo(cx - .4 * u, top); c.lineTo(cx, top + .3 * u); c.lineTo(cx + .4 * u, top); c.closePath(); c.fill();
      collarWings(c, cx, top, u, "#a88e5f", "#7d6942", .55, .45);
      c.strokeStyle = "#8a744b"; c.beginPath(); c.moveTo(cx, top + .3 * u); c.lineTo(cx, H); c.stroke();
      buttons(c, cx, top + .55 * u, .38 * u, 4, .04 * u, "#c8a24a");
      [-1, 1].forEach(sd => { c.fillStyle = "#a88e5f"; rrect(c, cx + sd * .62 * u - .22 * u, top + .7 * u, .44 * u, .14 * u, .03 * u); c.fill(); c.stroke(); c.save(); c.translate(cx + sd * 1.05 * u, top + .3 * u); c.rotate(sd * .38); rrect(c, -.26 * u, -.06 * u, .52 * u, .12 * u, .04 * u); c.fill(); c.stroke(); c.restore(); });
    } else if (kind === "suit" || kind === "suit_navy") {
      const [jacket, lapel, tieCol] = kind === "suit" ? ["#2b2f36", "#353a42", "#7a1f2b"] : ["#1c2c4a", "#24375a", "#2f5aa8"];
      bodyPath(c, cx, top, u, H); c.fillStyle = jacket; c.fill();
      c.fillStyle = "#fbfbfb"; c.beginPath(); c.moveTo(cx - .4 * u, top); c.lineTo(cx, top + 1.0 * u); c.lineTo(cx + .4 * u, top); c.closePath(); c.fill();
      collarWings(c, cx, top, u, "#ffffff", "#d0d0d0", .42, .3);
      tie(c, cx, top, u, tieCol);
      c.fillStyle = lapel; [-1, 1].forEach(sd => { c.beginPath(); c.moveTo(cx + sd * .4 * u, top); c.lineTo(cx + sd * .62 * u, top + .55 * u); c.lineTo(cx + sd * .5 * u, top + .62 * u); c.lineTo(cx + sd * .04 * u, top + 1.05 * u); c.lineTo(cx, top + 1.0 * u); c.closePath(); c.fill(); c.strokeStyle = "rgba(0,0,0,.35)"; c.lineWidth = lw; c.stroke(); });
      buttons(c, cx, top + 1.2 * u, .3 * u, 2, .045 * u, "#111");
    } else if (kind === "shirt_tie") {
      bodyPath(c, cx, top, u, H); c.fillStyle = "#fbfbfb"; c.fill(); c.strokeStyle = "#d4d4d4"; c.lineWidth = lw; c.stroke();
      collarWings(c, cx, top, u, "#ffffff", "#cfcfcf", .48, .36);
      c.strokeStyle = "#dadada"; c.beginPath(); c.moveTo(cx, top + 1.05 * u); c.lineTo(cx, H); c.stroke();
      tie(c, cx, top, u, "#1f3b6e");
      c.strokeRect(cx + .5 * u, top + .75 * u, .38 * u, .4 * u);
    } else if (kind === "student_f") {
      bodyPath(c, cx, top, u, H, .4); c.fillStyle = "#fdfdfd"; c.fill(); c.strokeStyle = "#d6d6d6"; c.lineWidth = lw; c.stroke();
      [-1, 1].forEach(sd => { c.beginPath(); c.moveTo(cx, top + .2 * u); c.quadraticCurveTo(cx + sd * .2 * u, top - .04 * u, cx + sd * .42 * u, top - .02 * u); c.quadraticCurveTo(cx + sd * .62 * u, top + .3 * u, cx + sd * .08 * u, top + .42 * u); c.closePath(); c.fillStyle = "#ffffff"; c.fill(); c.stroke(); }); // คอบัว
      buttons(c, cx, top + .62 * u, .36 * u, 4, .035 * u, "#ececec");
      c.fillStyle = "#c9a24a"; c.beginPath(); c.arc(cx - .62 * u, top + .7 * u, .07 * u, 0, 7); c.fill(); // เข็มกลัดแบบเรียบ ไม่มีตรา
    } else if (kind === "lady" || kind === "lady_black") {
      bodyPath(c, cx, top, u, H); c.fillStyle = kind === "lady" ? "#2c3e5a" : "#1d1d20"; c.fill();
      c.fillStyle = "#ffffff"; c.beginPath(); c.moveTo(cx - .42 * u, top); c.quadraticCurveTo(cx, top + .9 * u, cx + .42 * u, top); c.closePath(); c.fill();
      [-1, 1].forEach(sd => { c.beginPath(); c.moveTo(cx + sd * .42 * u, top - .02 * u); c.quadraticCurveTo(cx + sd * .75 * u, top + .3 * u, cx + sd * .5 * u, top + .55 * u); c.quadraticCurveTo(cx + sd * .3 * u, top + .3 * u, cx + sd * .06 * u, top + .5 * u); c.closePath(); c.fillStyle = "#fafafa"; c.fill(); c.strokeStyle = "#d6d6d6"; c.lineWidth = lw; c.stroke(); });
      c.strokeStyle = "#3a5175"; c.lineWidth = lw * 2; [-1, 1].forEach(sd => { c.beginPath(); c.moveTo(cx + sd * .55 * u, top + .5 * u); c.lineTo(cx + sd * .2 * u, H); c.stroke(); });
    } else if (kind === "student") {
      bodyPath(c, cx, top, u, H); c.fillStyle = "#fbfbfb"; c.fill(); c.strokeStyle = "#d4d4d4"; c.lineWidth = lw; c.stroke();
      collarWings(c, cx, top, u, "#ffffff", "#cfcfcf", .5, .4);
      c.strokeStyle = "#d4d4d4"; c.beginPath(); c.moveTo(cx - .05 * u, top + .3 * u); c.lineTo(cx - .05 * u, H); c.moveTo(cx + .05 * u, top + .3 * u); c.lineTo(cx + .05 * u, H); c.stroke();
      buttons(c, cx, top + .5 * u, .38 * u, 4, .035 * u, "#e9e9e9");
      c.strokeRect(cx + .5 * u, top + .75 * u, .38 * u, .4 * u);
    }
    shade(c, cx, top, u, H);
    c.restore();
  }

  /** วาดชุดลง canvas ใหม่ที่ความกว้างหน้า u: คืน {canvas, chin} (chin = จุดที่คางของผู้สวมควรอยู่) */
  function render(kind, u = 200) {
    const W = Math.round(4.2 * u), H = Math.round(3.4 * u), chin = { x: W / 2, y: Math.round(.25 * u) };
    const c = Object.assign(document.createElement("canvas"), { width: W, height: H });
    drawOutfit(c.getContext("2d"), kind, chin.x, chin.y, u, H);
    return { canvas: c, chin, fw: u };
  }
  const api = { NAMES, draw: drawOutfit, render };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.PBOutfits = api;
})(typeof window !== "undefined" ? window : globalThis);
