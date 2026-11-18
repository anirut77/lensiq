/* tools/hall-faces-scene.js — synthetic exam-hall frames for tools/hall-faces-eval.mjs (small and distant faces).
 * NO photo of any person: every face is drawn from numbers by tools/look-synth-face.js (LQSynthFace), then scaled into a
 * drawn hall (wall, windows, lights, rows of desks, bodies, papers, bags). Deterministic per seed. Runs in headless
 * Chrome only (canvas); not part of the site build.
 *
 *   LQHallScene.render(canvas, spec) -> { faces: [{x, y, w, h, px}], backs: n, persons: n }
 *     spec = { seed, W, H, sizePx (face width in frame px, 0 = no faces), kind: "faces" | "empty" | "backs" }
 *   Ground-truth face box (frame px): x / w = the face oval, ear excluded (w === sizePx); y from the top of the hair cap
 *   to the chin (h ≈ 1.27 w). A "back" is a person seen from behind (hair only): NOT a face; a box on it counts as false.
 */
(function (root) {
  "use strict";
  var SF = root.LQSynthFace;
  function rng(seed) {
    var a = (seed * 2654435761 + 12345) >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var col = function (c) { return "rgb(" + c.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))); }).join(",") + ")"; };
  var SHIRT = [[245, 245, 245], [235, 238, 245], [40, 60, 110], [120, 30, 40], [30, 30, 32], [90, 120, 90], [200, 180, 120], [70, 110, 160], [160, 160, 170]];
  var HAIR = [[22, 18, 16], [45, 32, 24], [70, 48, 32], [110, 78, 50], [30, 26, 26]];

  /** one drawn face (look-synth-face) on a transparent canvas, cropped to the head; returns {c, ovalL, ovalR, top, chin} in that canvas */
  function faceSprite(seed, r) {
    var p = SF.params(seed);
    p.cx = 0.5; p.cy = 0.42; p.ipd = 80; p.roll = lerp(-10, 10, r());
    var S = 512, c = document.createElement("canvas"); c.width = S; c.height = S;
    var g = c.getContext("2d"), first = true, fr = g.fillRect.bind(g);
    g.fillRect = function () { if (first) { first = false; return; } return fr.apply(null, arguments); }; // skip the background fill
    SF.draw(g, S, S, p, {});
    var u = p.ipd, cx = 0.5 * S, cy = 0.42 * S;
    return { c: c, ovalL: cx - p.faceW * u, ovalR: cx + p.faceW * u, top: cy - 1.37 * u, chin: cy + 1.85 * u, cx: cx, cy: cy, u: u, faceW: p.faceW };
  }
  /** downscale in halving steps (box-like filter), then the last step to the exact size */
  function drawScaled(g, src, sx, sy, sw, sh, dx, dy, dw, dh) {
    var cur = src, cx = sx, cy = sy, cw = sw, ch = sh;
    while (cw / 2 > dw * 1.01 && ch / 2 > dh * 1.01) {
      var t = document.createElement("canvas"); t.width = Math.max(1, Math.ceil(cw / 2)); t.height = Math.max(1, Math.ceil(ch / 2));
      var tg = t.getContext("2d"); tg.imageSmoothingQuality = "high"; tg.drawImage(cur, cx, cy, cw, ch, 0, 0, t.width, t.height);
      cur = t; cx = 0; cy = 0; cw = t.width; ch = t.height;
    }
    g.imageSmoothingQuality = "high"; g.drawImage(cur, cx, cy, cw, ch, dx, dy, dw, dh);
  }
  function room(g, W, H, r) {
    var wall = [lerp(170, 235, r()), lerp(170, 230, r()), lerp(160, 225, r())];
    var gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, col(wall.map(function (v) { return v * 1.03; }))); gr.addColorStop(1, col(wall.map(function (v) { return v * 0.8; })));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // ceiling lights
    for (var i = 0; i < 6; i++) { g.fillStyle = "rgba(255,255,250," + lerp(0.6, 0.95, r()) + ")"; g.fillRect(r() * W, r() * H * 0.08, lerp(0.06, 0.14, r()) * W, H * 0.012); }
    // windows / board on the back wall
    var nw = 1 + Math.floor(r() * 4);
    for (var j = 0; j < nw; j++) {
      var wx = r() * W * 0.85, ww = lerp(0.08, 0.2, r()) * W, wy = H * lerp(0.08, 0.16, r()), wh = H * lerp(0.12, 0.22, r());
      g.fillStyle = r() < 0.6 ? col([lerp(200, 250, r()), lerp(220, 250, r()), 255]) : col([40, 70, 50]);
      g.fillRect(wx, wy, ww, wh); g.strokeStyle = "rgb(90,90,90)"; g.lineWidth = Math.max(2, W * 0.002); g.strokeRect(wx, wy, ww, wh);
    }
    // a round wall clock and posters (round and face-sized blobs that are not faces)
    var ck = { x: r() * W, y: H * lerp(0.05, 0.2, r()), rr: lerp(12, 40, r()) * W / 1920 };
    g.beginPath(); g.arc(ck.x, ck.y, ck.rr, 0, Math.PI * 2); g.fillStyle = "rgb(245,245,240)"; g.fill(); g.lineWidth = ck.rr * 0.12; g.strokeStyle = "rgb(30,30,30)"; g.stroke();
    g.beginPath(); g.moveTo(ck.x, ck.y); g.lineTo(ck.x + ck.rr * 0.6, ck.y - ck.rr * 0.3); g.moveTo(ck.x, ck.y); g.lineTo(ck.x, ck.y - ck.rr * 0.8); g.lineWidth = ck.rr * 0.08; g.stroke();
    for (var k = 0; k < 3; k++) { g.fillStyle = col([r() * 255, r() * 255, r() * 255]); g.fillRect(r() * W, H * lerp(0.05, 0.25, r()), lerp(20, 80, r()) * W / 1920, lerp(30, 100, r()) * W / 1920); }
    // floor
    var fy = H * lerp(0.28, 0.36, r());
    g.fillStyle = col([lerp(120, 190, r()), lerp(110, 170, r()), lerp(100, 150, r())]); g.fillRect(0, fy, W, H - fy);
    g.strokeStyle = "rgba(0,0,0,0.12)"; g.lineWidth = 1; for (var f = 0; f < 14; f++) { g.beginPath(); g.moveTo(W / 2, fy); g.lineTo((f / 13) * W * 3 - W, H); g.stroke(); }
    return fy;
  }
  function desk(g, x, y, w, h, r) {
    g.fillStyle = col([lerp(150, 210, r()), lerp(110, 170, r()), lerp(70, 120, r())]); g.fillRect(x, y, w, h * 0.18);
    g.fillStyle = "rgba(60,40,20,0.9)"; g.fillRect(x + w * 0.04, y + h * 0.18, w * 0.05, h * 0.8); g.fillRect(x + w * 0.91, y + h * 0.18, w * 0.05, h * 0.8);
    g.fillStyle = col([lerp(100, 160, r()), lerp(80, 120, r()), lerp(50, 90, r())]); g.fillRect(x, y + h * 0.18, w, h * 0.32);
    // exam paper and a pen
    g.save(); g.translate(x + w * lerp(0.25, 0.6, r()), y + h * 0.05); g.rotate(lerp(-0.2, 0.2, r()));
    g.fillStyle = "rgb(250,250,248)"; g.fillRect(0, 0, w * 0.3, h * 0.1); g.restore();
    g.fillStyle = "rgb(20,40,140)"; g.fillRect(x + w * lerp(0.1, 0.8, r()), y + h * 0.07, w * 0.12, Math.max(1, h * 0.012));
  }
  function body(g, cx, neckY, fw, shirt, r) {
    var sw = fw * lerp(2.2, 2.7, r()), sh = fw * 2.4;
    g.beginPath(); g.moveTo(cx - fw * 0.28, neckY); g.lineTo(cx + fw * 0.28, neckY);
    g.quadraticCurveTo(cx + sw * 0.5, neckY + fw * 0.2, cx + sw * 0.55, neckY + sh); g.lineTo(cx - sw * 0.55, neckY + sh);
    g.quadraticCurveTo(cx - sw * 0.5, neckY + fw * 0.2, cx - fw * 0.28, neckY); g.closePath();
    g.fillStyle = col(shirt); g.fill();
    // arms on the desk
    g.fillStyle = col(shirt.map(function (v) { return v * 0.85; }));
    g.fillRect(cx - sw * 0.55, neckY + sh * 0.55, sw * 0.35, fw * 0.45); g.fillRect(cx + sw * 0.2, neckY + sh * 0.55, sw * 0.35, fw * 0.45);
  }
  function backOfHead(g, cx, cy, fw, r) {
    var hair = HAIR[Math.floor(r() * HAIR.length)];
    g.beginPath(); g.ellipse(cx, cy, fw * 0.6, fw * 0.72, 0, 0, Math.PI * 2); g.fillStyle = col(hair); g.fill();
    g.beginPath(); g.ellipse(cx - fw * 0.15, cy - fw * 0.25, fw * 0.2, fw * 0.15, 0, 0, Math.PI * 2); g.fillStyle = "rgba(255,255,255,0.08)"; g.fill();
    g.fillStyle = col([200, 160, 130]); g.fillRect(cx - fw * 0.22, cy + fw * 0.62, fw * 0.44, fw * 0.3); // nape
  }

  /** seat layout: rows of seats with a horizontal pitch of about 3.2 face widths; rows drawn back to front */
  function render(canvas, spec) {
    var W = spec.W, H = spec.H, r = rng(spec.seed), g = canvas.getContext("2d");
    canvas.width = W; canvas.height = H;
    var fy = room(g, W, H, r);
    var s = spec.sizePx || 0, kind = spec.kind || "faces";
    var fw = s || lerp(20, 60, r());          // face width used for the layout (also for empty / backs frames)
    var pitchX = fw * lerp(3.0, 3.6, r()), pitchY = fw * lerp(3.4, 4.0, r());
    var cols = Math.max(1, Math.floor((W * 0.92) / pitchX)), rows = Math.max(1, Math.floor((H - fy - fw * 1.0) / pitchY));
    cols = Math.min(cols, 10); rows = Math.min(rows, 3);
    // spread the seats over the whole frame (small faces are far away, not clustered in the centre)
    pitchX = Math.max(pitchX, (W * 0.92) / cols); pitchY = Math.max(pitchY, Math.min(fw * 8, (H - fy - fw * 4.5) / rows));
    var x0 = (W - cols * pitchX) / 2 + pitchX / 2 + (r() - 0.5) * pitchX * 0.3, y0 = fy + fw * 1.2;
    var out = { faces: [], backs: 0, persons: 0 };
    for (var ri = 0; ri < rows; ri++) for (var ci = 0; ci < cols; ci++) {
      var cx = x0 + ci * pitchX + (r() - 0.5) * pitchX * 0.25, cy = y0 + ri * pitchY + (r() - 0.5) * fw * 0.3;
      var occupied = kind !== "empty" && r() < 0.85, isBack = kind === "backs" || (kind === "faces" && r() < 0.15);
      var shirt = SHIRT[Math.floor(r() * SHIRT.length)], seedFace = spec.seed * 100 + ri * 10 + ci;
      if (occupied) {
        out.persons++;
        body(g, cx, cy + fw * 0.75, fw, shirt, r);
        if (isBack) { backOfHead(g, cx, cy, fw, r); out.backs++; }
        else {
          var sp = faceSprite(seedFace, r);
          var k = fw / (sp.ovalR - sp.ovalL);               // sprite px -> frame px; face oval width = fw
          var squash = lerp(0.86, 1.0, r());                 // a mild head-down look (vertical squash)
          var sx = 0, sy = 0, sw = sp.c.width, sh = sp.c.height;
          var dw = sw * k, dh = sh * k * squash, dx = cx - sp.cx * k, dy = cy - sp.cy * k * squash;
          drawScaled(g, sp.c, sx, sy, sw, sh, dx, dy, dw, dh);
          var top = dy + sp.top * k * squash, chin = dy + sp.chin * k * squash;
          out.faces.push({ x: dx + sp.ovalL * k, y: top, w: fw, h: chin - top, px: fw });
        }
      } else if (r() < 0.5) {
        // empty chair back and a bag
        g.fillStyle = "rgb(60,60,70)"; g.fillRect(cx - fw * 0.9, cy - fw * 0.2, fw * 1.8, fw * 1.4);
        g.beginPath(); g.ellipse(cx + fw * 0.6, cy + fw * 1.6, fw * 0.5, fw * 0.4, 0, 0, Math.PI * 2); g.fillStyle = col(SHIRT[Math.floor(r() * SHIRT.length)]); g.fill();
      }
      desk(g, cx - pitchX * 0.46, cy + fw * 1.9, pitchX * 0.92, fw * 2.2, r);
    }
    // sensor noise
    var img = g.getImageData(0, 0, W, H), d = img.data, nz = lerp(2, 7, r());
    for (var i = 0; i < d.length; i += 4) { var n = (r() - 0.5) * 2 * nz; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
    return out;
  }
  root.LQHallScene = { render: render };
})(typeof window !== "undefined" ? window : globalThis);
