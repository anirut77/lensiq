/* ชุดสำเร็จรูป (สร้างด้วยโค้ดทั้งหมด ไม่มีภาพลิขสิทธิ์ ไม่มีตรา เครื่องหมายราชการ หรือยศ) — ใช้ร่วมกันระหว่าง photobooth.js (รูปติดบัตร) และ studio.js
 *
 * ชุดถูกวาดใน "พิกัดมาตรฐาน" (หน่วย = ~ความกว้างใบหน้า): จุด N = (0,0) กึ่งกลางแนวไหล่ที่โคนคอ, ไหล่กว้าง (เดลตอยด์) 3.0 หน่วย,
 * แล้วแปลง (ย่อขยาย/หมุน/เลื่อน) ลงพิกัดภาพโดยตรง จึงคมชัดไม่ต้องดัดภาพ จากนั้นให้แสงเงาแบบภาพถ่ายต่อพิกเซล:
 *   albedo (สีผ้า) + height map (ชั้นผ้า ปก/สาบ/กระดุม ยกสูงกว่า) + รูปทรงลำตัว/แขน (ทรงกระบอก) + รอยยับ (สันนูนตามเส้นโค้ง)
 *   -> normal -> Lambert + ambient occlusion จากความต่างระดับ + เงาวาว (sheen) + ลายทอผ้า (twill) + noise ความถี่ต่ำ + ตะเข็บ
 * ชุดแบ่งเป็น 2 ชั้น: back (ปกเสื้อด้านหลังคอ อยู่หลังคอ) และ front (ตัวเสื้อ อยู่หน้าคอ) เพื่อให้ลำดับชั้น ฉาก → ปกหลัง → คอ → เสื้อ → ศีรษะ/ผม
 *
 * window.PBOutfits = {
 *   NAMES, CANON,
 *   layers(kind, {W, H, s, theta, N:{x,y}, light, seed}) -> {front, back} canvas W×H
 *   draw(ctx, kind, cx, chinY, u, H)   — วาดลง ctx (รูปติดบัตร): u = ความกว้างหน้า, คางที่ (cx, chinY)
 *   render(kind, u) -> {canvas, chin, fw, N, s} — ภาพตัวอย่าง/เทมเพลต
 * }
 */
(function (root) {
  "use strict";
  const NAMES = {
    civil: "ชุดข้าราชการปกติขาว", khaki: "ชุดกากี", suit: "สูทสากลเทาเข้ม", suit_navy: "สูทกรมท่า",
    shirt_tie: "เชิ้ตขาวผูกเนคไท", lady: "สูทสุภาพสตรีกรมท่า", lady_black: "สูทสุภาพสตรีดำ", student: "นักศึกษาชาย", student_f: "นักศึกษาหญิง"
  };
  /** จุดยึดในพิกัดมาตรฐาน: N = โคนคอ, L/R = บนไหล่ใกล้ปลายไหล่, width = ความกว้างไหล่ (เดลตอยด์) ที่แถว N.y + 0.45 */
  const CANON = { N: { x: 0, y: 0 }, L: { x: -1.4, y: .24 }, R: { x: 1.4, y: .24 }, width: 3.0, lineY: .07, deltoidY: .68, collarY: -.22 };
  const NW = .33, NY = -.22, SH = 1.5, BOT = 7;

  // ---------------------------------------------------------------- เส้นทาง (พิกัดมาตรฐาน)
  /** โครงร่างตัวเสื้อ: ไหล่ลาด (trapezius) → เดลตอยด์ → แขนตกลงด้านล่าง; ด้านบนระหว่างคอคือคอเสื้อด้านหน้า (neckline(path, x->y)) */
  /** ไหล่ด้านหนึ่ง (sd = -1 ซ้ายภาพ, 1 ขวาภาพ) จากข้างคอ (sd*nw, ny) ลงไปถึงขอบล่าง */
  function side(c, sd, nw, ny) {
    c.bezierCurveTo(sd * .6, ny + .09, sd * .95, .03, sd * 1.2, .13);
    c.bezierCurveTo(sd * 1.4, .2, sd * SH, .38, sd * SH, .74);
    c.bezierCurveTo(sd * (SH + .02), 1.4, sd * (SH + .06), 2.6, sd * (SH + .14), BOT);
  }
  function silhouette(c, frontDip = .1, nw = NW, ny = NY) {
    c.moveTo(nw, ny); side(c, 1, nw, ny);
    c.lineTo(-SH - .14, BOT);
    c.bezierCurveTo(-SH - .06, 2.6, -SH - .02, 1.4, -SH, .74);
    c.bezierCurveTo(-SH, .38, -1.4, .2, -1.2, .13);
    c.bezierCurveTo(-.95, .03, -.6, ny + .09, -nw, ny);
    c.bezierCurveTo(-nw * .6, ny + frontDip * .8, -nw * .25, ny + frontDip, 0, ny + frontDip);
    c.bezierCurveTo(nw * .25, ny + frontDip, nw * .6, ny + frontDip * .8, nw, ny);
    c.closePath();
  }
  /** สูท: แผงหน้าซ้าย/ขวา (เว้นช่องวีถึงจุดกระดุม vy) ซ้อนกันที่แนวกระดุม */
  function jacketPanel(c, sd, nw, ny, vy) {
    c.moveTo(sd * nw, ny); side(c, sd, nw, ny); c.lineTo(-sd * .1, BOT); c.lineTo(-sd * .03, vy + .05); c.lineTo(sd * .06, vy); c.closePath();
  }
  const poly = (c, pts) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };
  const mirror = pts => pts.map(([x, y]) => [-x, y]);

  // ---------------------------------------------------------------- ตัววาด: albedo / height / ตะเข็บ
  /** ตัวห่อ context: แปลงพิกัดทุกจุดด้วย warp (ใช้ลดระดับคอเสื้อลงตามความยาวคอจริง โดยไม่เปลี่ยนไหล่/ลำตัว) */
  function warpCtx(c, warp) {
    const p = (x, y) => warp(x, y);
    return {
      moveTo(x, y) { const q = p(x, y); c.moveTo(q[0], q[1]); }, lineTo(x, y) { const q = p(x, y); c.lineTo(q[0], q[1]); },
      bezierCurveTo(a, b, d, e, x, y) { const q1 = p(a, b), q2 = p(d, e), q = p(x, y); c.bezierCurveTo(q1[0], q1[1], q2[0], q2[1], q[0], q[1]); },
      quadraticCurveTo(a, b, x, y) { const q1 = p(a, b), q = p(x, y); c.quadraticCurveTo(q1[0], q1[1], q[0], q[1]); },
      arc(x, y, r, a0, a1) { const q = p(x, y); c.moveTo(q[0] + r, q[1]); c.arc(q[0], q[1], r, a0, a1); },
      rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); c.closePath(); },
      closePath() { c.closePath(); }
    };
  }
  function painter(W, H, T, drop = 0) {
    const warp = (x, y) => [x, y + drop * (1 - smooth01((y - NY - .05) / (1.0 - NY - .05)))];
    const mkc = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d", { willReadFrequently: true }); x.setTransform(T.a, T.b, T.c, T.d, T.e, T.f); x.lineJoin = "round"; x.lineCap = "round"; return [c, x]; };
    const [ca, A0] = mkc(), [ch, H0] = mkc(), [cs, S0] = mkc();
    const wrapC = x => { const w = warpCtx(x, warp); return new Proxy(x, { get: (t, k) => k in w ? w[k] : (typeof t[k] === "function" ? t[k].bind(t) : t[k]), set: (t, k, v) => { t[k] = v; return true; } }); };
    const A = wrapC(A0), Hc = wrapC(H0), S = wrapC(S0);
    const P = {
      ca, ch, cs, folds: [], forms: [],
      /** ชิ้นผ้า: fill สี + ระดับความสูง (0..1) */
      part(path, color, h = .3, rule = "nonzero") {
        A.fillStyle = color; A.beginPath(); path(A); A.fill(rule);
        const g = Math.round(clamp01(h) * 255); Hc.fillStyle = `rgb(${g},${g},${g})`; Hc.beginPath(); path(Hc); Hc.fill(rule);
      },
      /** ตะเข็บ/รอยต่อ: เส้นมืดใน seam canvas (ใช้เป็นร่องใน height) */
      seam(path, w = .012, k = .9) { S.strokeStyle = `rgba(0,0,0,${k})`; S.lineWidth = w; S.beginPath(); path(S); S.stroke(); },
      /** เส้นสีบนผ้า (ลายเนคไท/ขอบ) */
      line(path, color, w = .01) { A.strokeStyle = color; A.lineWidth = w; A.beginPath(); path(A); A.stroke(); },
      button(x, y, r, color, h = .75) {
        P.part(c => c.arc(x, y, r, 0, 7), color, h);
        Hc.fillStyle = "rgba(255,255,255,.35)"; Hc.beginPath(); Hc.arc(x - r * .15, y - r * .15, r * .55, 0, 7); Hc.fill();
        S.fillStyle = "rgba(0,0,0,.5)"; for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { S.beginPath(); S.arc(x + dx * r * .28, y + dy * r * .28, r * .1, 0, 7); S.fill(); }
      },
      /** รอยยับ: สันนูนตามเส้นตรง (x0,y0)-(x1,y1) กว้าง w สูง amp (ลบ = ร่อง) */
      fold(x0, y0, x1, y1, w, amp) { const a = warp(x0, y0), b = warp(x1, y1); P.folds.push([a[0], a[1], b[0], b[1], w, amp]); },
      ctx: { A, Hc, S }
    };
    return P;
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth01(t) { t = clamp01(t); return t * t * (3 - 2 * t); }

  // ---------------------------------------------------------------- ชิ้นส่วนที่ใช้ซ้ำ
  function shirtCollar(P, col, sd, spread = .24, len = .32, h = .62) {
    // คอปกด้านหน้าบรรจบกันใต้ขอบบนเล็กน้อย (แบบเชิ้ตจริง) แล้วปลายปกแผ่ลง
    P.part(c => poly(c, [[sd * (NW - .02), NY - .05], [sd * .05, NY + .17], [sd * spread, len - .08], [sd * (NW + .14), .0], [sd * (NW + .07), NY + .02]]), col, h);
    P.seam(c => { c.moveTo(sd * .07, NY + .18); c.lineTo(sd * spread * .96, len - .11); }, .006, .35);
  }
  function backBand(P, col, top = NY - .06, h = .2) { // ปกด้านหลังคอ (ชั้น back)
    P.part(c => { c.moveTo(-NW - .07, top + .05); c.quadraticCurveTo(0, top - .04, NW + .07, top + .05); c.lineTo(NW + .03, top + .3); c.quadraticCurveTo(0, top + .22, -NW - .03, top + .3); c.closePath(); }, col, h);
  }
  function tie(P, col, stripe, d = -.11) {
    P.part(c => poly(c, [[-.075, .05 + d], [.075, .05 + d], [.05, .2 + d], [-.05, .2 + d]]), col, .8); // ปม
    P.part(c => poly(c, [[-.05, .2 + d], [.05, .2 + d], [.14, 1.1], [.155, 1.9], [0, 2.05], [-.155, 1.9], [-.14, 1.1]]), col, .55);
    P.fold(0, .21 + d, 0, .5, .05, -.02);
    if (stripe) for (let i = 0; i < 14; i++) { const y = .26 + d + i * .13; P.line(c => { c.moveTo(-.16, y); c.lineTo(.16, y + .12); }, stripe, .018); }
    P.seam(c => { c.moveTo(-.05, .2 + d); c.lineTo(.05, .2 + d); }, .008, .6);
  }
  function sleeveSeams(P, k = .8) {
    for (const sd of [-1, 1]) {
      P.seam(c => { c.moveTo(sd * (NW + .12), NY + .1); c.bezierCurveTo(sd * .7, -.0, sd * .98, .05, sd * 1.2, .14); }, .01, k * .7); // ตะเข็บไหล่
      P.seam(c => { c.moveTo(sd * 1.2, .14); c.bezierCurveTo(sd * 1.2, .55, sd * 1.16, .95, sd * 1.16, 1.36); }, .011, k); // วงแขน
      P.seam(c => { c.moveTo(sd * 1.16, 1.32); c.bezierCurveTo(sd * 1.17, 1.9, sd * 1.19, 2.6, sd * 1.2, BOT); }, .02, k * .55); // แนวแขนแนบลำตัว
      // รอยยับใต้รักแร้/ข้อพับ
      P.fold(sd * 1.17, 1.25, sd * 1.42, 1.5, .06, .025); P.fold(sd * 1.18, 1.6, sd * 1.44, 1.78, .06, .02); P.fold(sd * 1.2, 2.0, sd * 1.43, 2.3, .07, .018);
    }
  }
  function lapels(P, col, sd, { vy = 1.3, peak = [.8, .44], notch = true } = {}) {
    const pts = notch
      ? [[sd * (NW + .02), NY + .03], [sd * .6, -.04], [sd * .64, .31], [sd * .56, .36], [sd * peak[0], peak[1]], [sd * .52, .82], [sd * .07, vy], [sd * (NW + .02), NY + .03]]
      : [[sd * (NW + .02), NY + .03], [sd * .62, -.02], [sd * .74, .45], [sd * .5, .95], [sd * .07, vy], [sd * (NW + .02), NY + .03]];
    P.part(c => poly(c, pts), col, .52);
    if (notch) P.seam(c => { c.moveTo(sd * .64, .31); c.lineTo(sd * .44, .34); }, .008, .7);
    P.seam(c => poly(c, pts), .007, .45);
    P.fold(sd * .3, .2, sd * .1, 1.15, .05, .03); // รอยม้วนปก
  }
  function pocketWelt(P, x0, y0, x1, y1) { P.seam(c => { c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x1, y1 + .05); c.lineTo(x0, y0 + .05); c.closePath(); }, .008, .55); P.fold((x0 + x1) / 2, (y0 + y1) / 2 + .025, (x0 + x1) / 2 + .01, (y0 + y1) / 2 + .03, .04, .03); }
  function flapPocket(P, col, cx, y, w = .42, hgt = .4, btn = null) {
    P.seam(c => { c.rect(cx - w / 2, y, w, hgt); }, .009, .5);
    P.part(c => { c.moveTo(cx - w / 2 - .02, y - .02); c.lineTo(cx + w / 2 + .02, y - .02); c.lineTo(cx + w / 2 + .02, y + .1); c.lineTo(cx, y + .15); c.lineTo(cx - w / 2 - .02, y + .1); c.closePath(); }, col, .5);
    P.seam(c => { c.moveTo(cx - w / 2 - .02, y + .1); c.lineTo(cx, y + .15); c.lineTo(cx + w / 2 + .02, y + .1); }, .007, .5);
    if (btn) P.button(cx, y + .1, .03, btn, .8);
  }
  function placket(P, y0, n, gap, btn, r = .028) {
    P.seam(c => { c.moveTo(-.07, y0 - .05); c.lineTo(-.07, BOT); c.moveTo(.07, y0 - .05); c.lineTo(.07, BOT); }, .006, .35);
    for (let i = 0; i < n; i++) P.button(0, y0 + i * gap, r, btn, .7);
  }
  function shoulderBoard(P, col, sd) { // อินทรธนูแบบเรียบ ไม่มียศ/ตรา
    const a = sd * .2, cs = Math.cos(a), sn = Math.sin(a), pt = (x, y) => [sd * .86 + x * cs - y * sn, .02 + x * sn + y * cs];
    P.part(c => poly(c, [pt(-.33, -.07), pt(.33, -.07), pt(.33, .07), pt(-.33, .07)]), col, .62);
  }

  // ---------------------------------------------------------------- ชุดแต่ละแบบ
  // แต่ละแบบ: fabric (สีหลัก, ลายผ้า, เงาวาว), back(P) วาดชั้นหลังคอ, front(P) วาดชั้นหน้า
  const KINDS = {
    suit: suitKind("#2d3138", "#353a42", "#7a1f2b", "rgba(255,255,255,.10)"),
    suit_navy: suitKind("#1d2c48", "#22355a", "#2b4f93", "rgba(255,255,255,.14)"),
    lady: ladyKind("#2a3c5c", "#2f4468"),
    lady_black: ladyKind("#1e1e22", "#26262b"),
    shirt_tie: {
      fabric: { twill: .018, mottle: .02, sheen: .05, period: .045 },
      back: P => backBand(P, "#e9ebee"),
      front: P => {
        P.part(c => silhouette(c, .2), "#f4f5f6", .3);
        sleeveSeams(P, .55);
        P.seam(c => { c.moveTo(.42, .95); c.lineTo(.84, .95); c.lineTo(.84, 1.38); c.quadraticCurveTo(.63, 1.44, .42, 1.38); c.closePath(); }, .008, .4);
        P.fold(.55, .5, .95, .75, .07, .03); P.fold(-.55, .5, -.95, .75, .07, .03);
        for (const sd of [-1, 1]) shirtCollar(P, "#f7f8f9", sd);
        tie(P, "#1f3b6e", "rgba(255,255,255,.10)");
      }
    },
    student: {
      fabric: { twill: .016, mottle: .02, sheen: .05, period: .045 },
      back: P => backBand(P, "#e9ebee"),
      front: P => {
        P.part(c => silhouette(c, .2), "#f4f5f6", .3);
        sleeveSeams(P, .55);
        placket(P, .3, 5, .4, "#e8e8e6");
        P.seam(c => { c.moveTo(.42, .95); c.lineTo(.84, .95); c.lineTo(.84, 1.38); c.quadraticCurveTo(.63, 1.44, .42, 1.38); c.closePath(); }, .008, .4);
        P.fold(.55, .55, .95, .8, .07, .03); P.fold(-.55, .55, -.95, .8, .07, .03);
        for (const sd of [-1, 1]) shirtCollar(P, "#f7f8f9", sd, .27, .34);
        P.button(0, .12, .026, "#e8e8e6", .8);
      }
    },
    student_f: {
      fabric: { twill: .014, mottle: .02, sheen: .05, period: .04 },
      back: P => backBand(P, "#eceef0", NY - .02),
      front: P => {
        P.part(c => silhouette(c, .34), "#f6f7f8", .3);
        sleeveSeams(P, .5);
        placket(P, .55, 4, .38, "#ededeb", .024);
        for (const sd of [-1, 1]) { // คอบัว
          const pts = c => { c.moveTo(sd * (NW - .01), NY - .02); c.bezierCurveTo(sd * .55, NY + .02, sd * .68, .25, sd * .5, .4); c.quadraticCurveTo(sd * .25, .5, sd * .04, .14); c.quadraticCurveTo(sd * .18, 0, sd * (NW - .01), NY - .02); };
          P.part(c => pts(c), "#fbfbfc", .62); P.seam(c => pts(c), .006, .35);
        }
        P.button(-.62, .78, .055, "#c9a24a", .85); // เข็มกลัดเรียบ ไม่มีตรา
      }
    },
    civil: {
      fabric: { twill: .02, mottle: .02, sheen: .07, period: .05 },
      back: P => backBand(P, "#e6e6e0", NY - .14),
      front: P => {
        P.part(c => silhouette(c, .16), "#f3f2ec", .3);
        sleeveSeams(P, .6);
        P.seam(c => { c.moveTo(0, .02); c.lineTo(0, BOT); }, .008, .45);
        for (let i = 0; i < 5; i++) P.button(0, .32 + i * .4, .045, "#cfa846", .85);
        for (const sd of [-1, 1]) { flapPocket(P, "#efeee7", sd * .58, .78, .44, .42, "#cfa846"); flapPocket(P, "#efeee7", sd * .62, 1.95, .5, .5, "#cfa846"); shoulderBoard(P, "#1d2b44", sd); }
        // คอตั้ง (ปิดรอบคอ)
        P.part(c => { c.moveTo(-NW - .05, NY - .1); c.quadraticCurveTo(0, NY + .02, NW + .05, NY - .1); c.lineTo(NW + .07, NY + .1); c.quadraticCurveTo(0, .1, -NW - .07, NY + .1); c.closePath(); }, "#f5f4ee", .65);
        P.seam(c => { c.moveTo(-NW - .07, NY + .1); c.quadraticCurveTo(0, .1, NW + .07, NY + .1); }, .008, .5);
      }
    },
    khaki: {
      fabric: { twill: .03, mottle: .03, sheen: .04, period: .05 },
      back: P => backBand(P, "#9f8760"),
      front: P => {
        P.part(c => silhouette(c, .2), "#b39b6c", .3);
        sleeveSeams(P, .7);
        placket(P, .5, 5, .4, "#c4a24c", .034);
        for (const sd of [-1, 1]) { flapPocket(P, "#ac9466", sd * .6, .78, .44, .44, "#c4a24c"); shoulderBoard(P, "#a88f62", sd); }
        for (const sd of [-1, 1]) shirtCollar(P, "#ad9566", sd, .3, .36);
        P.button(0, .12, .03, "#c4a24c", .8);
      }
    }
  };
  function suitKind(jacket, lapel, tieCol, stripe) {
    return {
      fabric: { twill: .03, mottle: .035, sheen: .09, period: .035 },
      back: P => backBand(P, "#e3e5e8"),
      front: P => {
        // เสื้อเชิ้ต (เห็นในช่องคอวี)
        P.part(c => poly(c, [[-NW - .04, NY + .02], [-.04, NY + .17], [.04, NY + .17], [NW + .04, NY + .02], [.66, 0], [0, 1.4], [-.66, 0]]), "#f4f5f7", .35);
        for (const sd of [-1, 1]) shirtCollar(P, "#f8f9fa", sd);
        tie(P, tieCol, stripe);
        // ตัวสูท (เว้นช่องวี)
        for (const sd of [-1, 1]) P.part(c => jacketPanel(c, sd, NW + .05, NY + .05, 1.32), jacket, .42);
        sleeveSeams(P, .9);
        P.seam(c => { c.moveTo(.0, 1.32); c.bezierCurveTo(.0, 2, .02, 2.6, .1, BOT); }, .012, .8); // ขอบหน้าใต้กระดุม
        for (const sd of [-1, 1]) { P.seam(c => { c.moveTo(sd * .74, 1.25); c.bezierCurveTo(sd * .72, 1.8, sd * .71, 2.4, sd * .7, BOT); }, .007, .35); lapels(P, lapel, sd); }
        pocketWelt(P, .52, .98, .94, .94);
        P.button(0, 1.5, .05, "#15171b", .8); P.button(0, 2.0, .05, "#15171b", .8);
        P.fold(.08, 1.5, .7, 1.3, .08, .014); P.fold(-.08, 1.5, -.7, 1.3, .08, .014); P.fold(.1, 1.56, .72, 1.85, .09, .012); P.fold(-.1, 1.56, -.72, 1.85, .09, .012);
      }
    };
  }
  function ladyKind(jacket, lapel) {
    return {
      fabric: { twill: .025, mottle: .03, sheen: .1, period: .033 },
      back: P => backBand(P, "#d9dbdf", NY + .02),
      front: P => {
        // เสื้อด้านใน (คอกลม)
        P.part(c => { c.moveTo(-NW - .04, NY + .04); c.quadraticCurveTo(0, .38, NW + .04, NY + .04); c.lineTo(.7, 0); c.lineTo(0, 1.6); c.lineTo(-.7, 0); c.closePath(); }, "#f2f3f5", .34);
        P.seam(c => { c.moveTo(-NW - .04, NY + .04); c.quadraticCurveTo(0, .38, NW + .04, NY + .04); }, .008, .4);
        for (const sd of [-1, 1]) P.part(c => jacketPanel(c, sd, NW + .06, NY + .06, 1.55), jacket, .42);
        sleeveSeams(P, .9);
        P.seam(c => { c.moveTo(0, 1.55); c.bezierCurveTo(0, 2.1, .04, 2.6, .14, BOT); }, .012, .8);
        for (const sd of [-1, 1]) { P.seam(c => { c.moveTo(sd * .7, 1.0); c.bezierCurveTo(sd * .62, 1.6, sd * .64, 2.4, sd * .66, BOT); }, .007, .4); lapels(P, lapel, sd, { vy: 1.55, notch: false }); }
        P.button(0, 1.72, .05, "#111215", .8);
        P.fold(.08, 1.72, .7, 1.5, .08, .014); P.fold(-.08, 1.72, -.7, 1.5, .08, .014);
      }
    };
  }

  // ---------------------------------------------------------------- แสงเงาต่อพิกเซล
  function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y, s) { // value noise ต่อเนื่อง
    const xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  /** รูปทรงลำตัว (หน่วยมาตรฐาน): ลำตัวโค้งแบบกระบอก + แขนสองข้าง + หัวไหล่กลม */
  function bodyForm(x, y) {
    const ax = Math.abs(x);
    let h = .42 * Math.sqrt(Math.max(0, 1 - (x / 1.65) ** 2));
    const d = (ax - 1.32) / .24; // แขน: ทรงกระบอกแนวตั้ง ค่อย ๆ ชัดขึ้นจากหัวไหล่ลงมา
    if (Math.abs(d) < 1) { const arm = .17 + .17 * Math.sqrt(1 - d * d), t = Math.min(1, Math.max(0, (y - .15) / .8)), k = t * t * (3 - 2 * t); h = h + (Math.max(h, arm) - h) * k; }
    if (y < .5) h -= (.5 - y) * (.5 - y) * .5 * Math.min(1, ax / .6); // ไหล่ลาดไปด้านหลัง
    return h;
  }
  function shade(P, W, H, T, inv, fabric, light, seed, s) {
    const box = bboxAlpha(P.ca, W, H); if (!box) return null;
    const { x0, y0, x1, y1 } = box, bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const A = P.ca.getContext("2d").getImageData(x0, y0, bw, bh), a = A.data;
    // ระดับชั้นผ้า: เบลอเล็กน้อยให้ขอบมน (ผ่าน canvas filter — ไม่ใช้ WebGL)
    const blurred = r => { const c = document.createElement("canvas"); c.width = bw; c.height = bh; const x = c.getContext("2d", { willReadFrequently: true }); x.filter = `blur(${r.toFixed(2)}px)`; x.drawImage(P.ch, x0, y0, bw, bh, 0, 0, bw, bh); return x.getImageData(0, 0, bw, bh).data; };
    const h1 = blurred(Math.max(.6, s * .012)), h2 = blurred(Math.max(2, s * .09));
    const sm = P.cs.getContext("2d").getImageData(x0, y0, bw, bh).data;
    const n = bw * bh, Ht = new Float32Array(n), seamA = new Float32Array(n);
    const folds = P.folds, f = fabric;
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
      const k = j * bw + i; if (!a[k * 4 + 3]) continue;
      const p = inv(i + x0 + .5, j + y0 + .5);
      let h = bodyForm(p.x, p.y) + h1[k * 4] / 255 * .22;
      for (let q = 0; q < folds.length; q++) {
        const [fx0, fy0, fx1, fy1, fw, amp] = folds[q], dx = fx1 - fx0, dy = fy1 - fy0, L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((p.x - fx0) * dx + (p.y - fy0) * dy) / L2)), ex = p.x - fx0 - t * dx, ey = p.y - fy0 - t * dy, d2 = (ex * ex + ey * ey) / (fw * fw);
        if (d2 < 9) h += amp * Math.exp(-d2) * Math.sin(Math.PI * Math.min(1, t * 1.2 + .1));
      }
      const sv = sm[k * 4 + 3] / 255; seamA[k] = sv; h -= sv * .012;
      Ht[k] = h * s; // เป็นพิกเซล
    }
    const L = norm3(light.x, -.8, .75), flat = L[2], amb = .5, kd = .62, out = new ImageData(bw, bh), o = out.data;
    const tw = f.period * s; // คาบลายทอเป็นพิกเซล
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
      const k = j * bw + i, al = a[k * 4 + 3]; if (!al) continue;
      const hx = (Ht[i < bw - 1 && a[(k + 1) * 4 + 3] ? k + 1 : k] - Ht[i > 0 && a[(k - 1) * 4 + 3] ? k - 1 : k]) * .5;
      const hy = (Ht[j < bh - 1 && a[(k + bw) * 4 + 3] ? k + bw : k] - Ht[j > 0 && a[(k - bw) * 4 + 3] ? k - bw : k]) * .5;
      const nn = norm3(-hx, -hy, 1), dif = Math.max(0, nn[0] * L[0] + nn[1] * L[1] + nn[2] * L[2]);
      let sh = (amb + kd * dif) / (amb + kd * flat);
      const ao = 1 - Math.min(.45, Math.max(0, (h2[k * 4] - h1[k * 4]) / 255) * 2.2); // ร่อง/ใต้ชิ้นที่ยกสูง = มืด
      sh *= ao * (1 - seamA[k] * .28);
      // เงาวาว (Blinn-Phong อย่างหยาบ) + ลายทอ + noise
      const hv = norm3(L[0], L[1], L[2] + 1), spec = Math.pow(Math.max(0, nn[0] * hv[0] + nn[1] * hv[1] + nn[2] * hv[2]), 18) * f.sheen;
      const X = i + x0, Y = j + y0, twill = Math.sin((X + Y) * 2 * Math.PI / Math.max(2.2, tw)) * f.twill + (hash2(X, Y, seed) - .5) * f.twill * 1.4;
      const p = inv(X + .5, Y + .5), mott = (vnoise(p.x * 7, p.y * 7, seed) - .5) * f.mottle * 2 + (vnoise(p.x * 22, p.y * 22, seed + 3) - .5) * f.mottle;
      const m = sh * (1 + twill + mott);
      for (let c = 0; c < 3; c++) o[k * 4 + c] = a[k * 4 + c] * m + 255 * spec;
      o[k * 4 + 3] = al;
    }
    const c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").putImageData(out, x0, y0);
    return c;
  }
  const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  function bboxAlpha(canvas, W, H) {
    const d = canvas.getContext("2d").getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }

  /** วาดชุดลงพิกัดภาพ: s = พิกเซลต่อหน่วย, theta = มุมแนวไหล่, N = ตำแหน่งโคนคอ; คืน {front, back} (canvas W×H) */
  function layers(kind, { W, H, s, theta = 0, N, light = { x: -.3 }, seed = 7, drop = 0 }) {
    const K = KINDS[kind]; if (!K) return null;
    const cs = Math.cos(theta), sn = Math.sin(theta);
    const T = { a: s * cs, b: s * sn, c: -s * sn, d: s * cs, e: N.x, f: N.y };
    const inv = (X, Y) => { const dx = X - N.x, dy = Y - N.y; return { x: (dx * cs + dy * sn) / s, y: (-dx * sn + dy * cs) / s }; };
    const out = {};
    for (const part of ["back", "front"]) {
      const P = painter(W, H, T, Math.max(-.3, Math.min(.6, drop))); K[part](P);
      out[part] = shade(P, W, H, T, inv, K.fabric, light, seed + (part === "back" ? 11 : 0), s) || P.ca;
      if (part === "back") { // ด้านในปกหลังคอ: มืดกว่า (อยู่ในเงาของคอ)
        const x = out.back.getContext("2d"); x.globalCompositeOperation = "source-atop"; x.fillStyle = "rgba(20,24,30,.28)"; x.fillRect(0, 0, W, H); x.globalCompositeOperation = "source-over";
      }
    }
    return out;
  }

  /** วาดชุดลง ctx (รูปติดบัตร photobooth): คาง (cx, chinY), ความกว้างหน้า u */
  function drawOutfit(c, kind, cx, chinY, u, H) {
    if (kind === "none" || !KINDS[kind]) return;
    const W = c.canvas.width, HH = c.canvas.height, s = u * 1.0;
    const L = layers(kind, { W, H: HH, s, theta: 0, N: { x: cx, y: chinY + .42 * u } });
    c.drawImage(L.back, 0, 0); c.drawImage(L.front, 0, 0);
  }

  /** ภาพตัวอย่างชุดที่ความกว้างหน้า u: คืน {canvas, chin, fw, N, s} */
  function render(kind, u = 200) {
    const W = Math.round(3.6 * u), H = Math.round(3.3 * u), N = { x: W / 2, y: Math.round(.7 * u) };
    const c = Object.assign(document.createElement("canvas"), { width: W, height: H });
    const L = layers(kind, { W, H, s: u, N });
    if (L) { const x = c.getContext("2d"); x.drawImage(L.back, 0, 0); x.drawImage(L.front, 0, 0); }
    return { canvas: c, chin: { x: N.x, y: N.y - .42 * u }, fw: u, N, s: u };
  }
  const api = { NAMES, CANON, KINDS: Object.keys(KINDS), layers, draw: drawOutfit, render, bodyForm };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.PBOutfits = api;
})(typeof window !== "undefined" ? window : globalThis);
