/* studio-qa.js — ตัวตรวจคุณภาพอัตโนมัติของผลแต่งชุด (studio.html) สำหรับชุดทดสอบภาพถดถอย (ไม่ได้โหลดในหน้าเว็บ ไม่มีผลต่อความเร็ว)
 * Browser: window.StudioQA · Node: module.exports (ทดสอบใน tests/unit/studio-qa.test.js)
 *
 * แต่ละตัวชี้วัดตรวจความผิดพลาดหนึ่งประเภทที่ผู้ประเมินพบ (คืนค่าตัวเลข + ผ่าน/ไม่ผ่านตามเกณฑ์ที่ปรับเทียบกับการดูภาพด้วยตา):
 *   hairCut      — ผม/ผ้าคลุมศีรษะถูกตัดเป็นเส้นตรงแนวนอน ทั้งที่ภาพเดิมยังต่อเนื่อง (ฮิญาบถูกตัดที่คาง)
 *   neck         — คอมีรู/ฉากหลังโผล่, สีคอไม่ใช่ผิว (เทา/ม่วง), คอกว้างผิดรูป ("กล่อง" ผิวข้างคอ), คอยาวผิดจริง
 *   bgChunk      — เศษฉาก/วัตถุที่ไม่ใช่ผิวหรือผมค้างอยู่ข้างศีรษะ (เป้ชุดอวกาศ พนักเก้าอี้)
 *   hem          — ขอบข้าง/ชายชุดหยักเป็นคลื่น, รูในชุด
 *   shoulder     — ขอบบนของชุดไม่ตรงแนวไหล่ที่วัดได้ / ไหล่ยกขึ้นเหนือผม
 *   accessory    — เศษสร้อยคอ/ลูกปัดค้างบนคอหรือคอเสื้อ
 *   skinIsland   — ผิวโผล่เป็นเกาะกลางอก (คอวีเดิม)
 *   hands        — มือที่ไม่มีแขนเสื้อต่อถึง (มือ "แปะ" บนชุด) / มือลอยนอกชุด
 */
(function (root) {
  "use strict";
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lum = (d, i) => .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2];
  const rgbDist = (d, i, j) => Math.hypot(d[i * 4] - d[j * 4], d[i * 4 + 1] - d[j * 4 + 1], d[i * 4 + 2] - d[j * 4 + 2]);
  /** ความเป็นสีผิว (YCbCr แบบหยาบ) */
  const skinLike = (r, g, b) => { const cb = 128 - .168736 * r - .331264 * g + .5 * b, cr = 128 + .5 * r - .418688 * g - .081312 * b, y = .299 * r + .587 * g + .114 * b; return y > 35 && cr > 136 && cr < 180 && cb > 85 && cb < 135; };

  /**
   * เส้นตัดตรงแนวนอนบนผม/ผ้าคลุม: แถว y ใต้คางที่ keep (ศีรษะ+ผม) จบจาก > .7 เป็น < .1 ภายใน 2 พิกเซล ต่อเนื่องเกิน 0.22 หน้า
   * โดยที่ภาพเดิมสีต่อเนื่องข้ามเส้น (ระยะ RGB < 28) และยังเป็นตัวคน — ปลายผมจริงไม่เป็นเส้นตรงยาวขนาดนี้
   * คืน { rows, maxRun } (maxRun หน่วยความกว้างหน้า)
   */
  function hairCut(keepA, src, alpha, W, H, face) {
    const fw = face.fw, need = fw * .22; let rows = 0, maxRun = 0;
    for (let y = Math.max(1, Math.round(face.chinY - fw * .2)); y < H - 3; y++) {
      let run = 0, best = 0;
      for (let x = 0; x < W; x++) {
        const i = y * W + x, j = i + 2 * W;
        if (keepA[i] > .7 && keepA[j] < .1 && alpha[j] > .8 && rgbDist(src, i, j) < 28) { run++; if (run > best) best = run; } else run = 0;
      }
      if (best > need) rows++;
      maxRun = Math.max(maxRun, best / fw);
    }
    return { rows, maxRun: +maxRun.toFixed(2) };
  }

  /**
   * คอ: ช่วงคาง -> ขอบบนคอเสื้อ ในแนวกลางคอ
   *  bgPct   = % พิกเซลที่เป็นฉากหลัง (fg < .5) ที่ถูกล้อมด้วยตัวคนทั้งซ้ายและขวา (รู/ช่องว่างที่คอ)
   *  dE      = ระยะสี a*b* ของคอที่มองเห็น (ไม่ถูกชุด/ศีรษะบัง) จากผิวหน้า (ภาพขาวดำ = 0), lRatio = ความสว่างคอ / ผิวหน้า
   *  wide    = ความกว้างคอที่มองเห็นสูงสุด / ความกว้างหน้า (> 0.75 = "กล่อง" ผิวด้านข้าง)
   */
  function neckCheck({ out, fg, neckA, frontA, keepA, W, H, face, collarY, skinLab, mono, labOf }) {
    const fw = face.fw, cx = Math.round(face.chinX != null ? face.chinX : face.cx);
    let bg = 0, cnt = 0, L = 0, A = 0, B = 0, nv = 0, wide = 0;
    for (let y = Math.round(face.chinY + fw * .02); y < Math.min(H, Math.round(collarY)); y++) {
      let l = -1, r = -1; const xa = Math.max(0, cx - Math.round(fw * .7)), xb = Math.min(W - 1, cx + Math.round(fw * .7));
      for (let x = xa; x <= xb; x++) if (fg[y * W + x] >= .5) { if (l < 0) l = x; r = x; }
      for (let x = Math.max(l, cx - Math.round(fw * .22)); l >= 0 && x <= Math.min(r, cx + Math.round(fw * .22)); x++) { cnt++; if (fg[y * W + x] < .5) bg++; }
      let vl = -1, vr = -1;
      for (let x = xa; x <= xb; x++) {
        const i = y * W + x, vis = neckA[i] * (1 - frontA[i]) * (1 - keepA[i]); if (vis < .6) continue;
        if (vl < 0) vl = x; vr = x;
        if ((x + y) % 3) continue; const q = labOf(out[i * 4], out[i * 4 + 1], out[i * 4 + 2]); L += q[0]; A += q[1]; B += q[2]; nv++;
      }
      if (vl >= 0) wide = Math.max(wide, (vr - vl + 1) / fw);
    }
    // ความยาวคอที่เห็น (คาง -> ขอบบนของชุด/ผ้าคลุม ที่แนวกลาง) หน่วยความกว้างหน้า — คอจริงที่เห็นเหนือคอเสื้อ ~0.2–0.6
    let len = 0; for (let y = Math.round(face.chinY); y < H; y++) { const i = y * W + cx; if (frontA[i] > .5 || (keepA[i] > .5 && y > face.chinY + fw * .1)) break; len = (y - face.chinY) / fw; }
    const res = { bgPct: cnt ? +(100 * bg / cnt).toFixed(2) : 0, dE: 0, lRatio: 1, wide: +wide.toFixed(2), visible: nv, len: +len.toFixed(2) };
    if (nv > 10 && skinLab) { res.dE = mono ? 0 : +Math.hypot(A / nv - skinLab[1], B / nv - skinLab[2]).toFixed(1); res.lRatio = +((L / nv) / Math.max(1, skinLab[0])).toFixed(2); }
    return res;
  }

  /** เศษฉาก/วัตถุข้างศีรษะ: พิกเซลที่วางหน้าชุด (keep) เหนือคาง ห่างจากกลางหน้า > 0.8 หน้า ที่ไม่ใช่ผม/ผิว/ผ้าคลุม (สีต่างจากผมมาก) — หน่วย fw² */
  function bgChunk({ keepA, src, W, H, face, hairLab, labOf, hw = null }) {
    const fw = face.fw, cx = face.cx; let c = 0;
    if (!hairLab) return 0;
    for (let y = Math.max(0, Math.round(face.eyeY - fw * 1.6)); y < Math.min(H, Math.round(face.chinY)); y += 2) for (let x = 0; x < W; x += 2) {
      const i = y * W + x; if (keepA[i] < .6 || Math.abs(x - cx) < fw * .8 || (hw && hw[i] > .5)) continue;
      const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2]; if (skinLike(r, g, b)) continue;
      const q = labOf(r, g, b); if (Math.hypot(q[0] - hairLab[0], (q[1] - hairLab[1]) * 1.5, (q[2] - hairLab[2]) * 1.5) > 38) c += 4;
    }
    return +(c / (fw * fw)).toFixed(3);
  }

  /**
   * ขอบชุด: ความหยักของขอบซ้าย/ขวา (ผลต่างอันดับสองของตำแหน่งขอบรายแถว ห่าง k = 0.1 s, หน่วย s) และรูในชุด (% ของพื้นที่ชุด)
   * วัดเฉพาะใต้รักแร้ (v > 1.1) — ช่วงไหล่โค้งตามธรรมชาติ
   */
  function hemCheck({ frontA, fg, W, H, fit }) {
    const s = fit.s, y0 = Math.round(fit.N.y + s * 1.1), k = Math.max(2, Math.round(s * .1)), Ls = [], Rs = [];
    // รูในชุด = ฉากหลังที่ถูกชุดล้อมทั้ง 4 ทิศภายใน 0.15 s (รูเล็ก/เศษ matte) — ช่องว่างจริงระหว่างแขนกับลำตัว (ใหญ่กว่านี้) ไม่นับ
    let area = 0, holes = 0; const q = Math.max(2, Math.round(s * .15)), G = (x, y) => x >= 0 && y >= 0 && x < W && y < H && frontA[y * W + x] > .5;
    for (let y = Math.max(0, y0); y < H; y++) {
      let l = -1, r = -1; for (let x = 0; x < W; x++) if (frontA[y * W + x] > .5) { if (l < 0) l = x; r = x; }
      Ls.push(l); Rs.push(r); if (l < 0) continue;
      for (let x = l; x <= r; x++) {
        area++; if (fg[y * W + x] >= .5) continue;
        let L = 0, R = 0, U = 0, D = 0; for (let k = 1; k <= q; k++) { L |= G(x - k, y); R |= G(x + k, y); U |= G(x, y - k); D |= G(x, y + k) || y + k >= H; }
        if (L && R && U && D) holes++;
      }
    }
    const rough = E => { let t = 0, c = 0; for (let j = k; j < E.length - k; j++) { if (E[j] < 0 || E[j - k] < 0 || E[j + k] < 0) continue; t += Math.abs(E[j + k] - 2 * E[j] + E[j - k]); c++; } return c ? t / c / s : 0; };
    let wmax = 0; for (let j = 0; j < Ls.length; j++) if (Ls[j] >= 0) wmax = Math.max(wmax, Rs[j] - Ls[j] + 1);
    // wide = ความกว้างชุดสูงสุดใต้รักแร้ / s (ไหล่มาตรฐาน = 3.0) — ชุดพองเป็นถุงจากวัตถุที่ถือ/ชุดอวกาศ
    return { rough: +Math.max(rough(Ls), rough(Rs)).toFixed(3), holePct: area ? +(100 * holes / area).toFixed(2) : 0, wide: +(wmax / s).toFixed(2) };
  }

  /**
   * แนวไหล่: ขอบบนของชุด ณ ตำแหน่งจุดวัดไหล่จริง (fit.samples: ขอบบนของไหล่ที่เห็น ไม่ถูกผมบัง) — ค่าเฉลี่ย |dy| หน่วย s
   * raised = ชุดสูงกว่าแนวไหล่ที่วัดได้เกิน 0.15 s ใต้ผม (ไหล่ "ยก" ขึ้นทับผม) — นับคอลัมน์ (หน่วย s)
   */
  function shoulderCheck({ frontA, W, H, fit, samples, hair = null }) {
    const s = fit.s, top = x => { x = clamp(Math.round(x), 0, W - 1); for (let y = 0; y < H; y++) if (frontA[y * W + x] > .5) return y; return -1; };
    let t = 0, c = 0;
    for (const p of samples || []) { const y = top(p.x); if (y < 0) continue; t += Math.abs(y - p.y); c++; }
    let raised = 0;
    if (samples && samples.length >= 2 && hair) {
      const ys = samples.map(p => p.y).sort((a, b) => a - b), yLine = ys[ys.length >> 1];
      for (let x = 0; x < W; x += 2) { const y = top(x); if (y < 0) continue; const dx = Math.abs(x - fit.N.x) / s; if (dx < .7 || dx > 1.5) continue; if (y < yLine - s * .35 && hair[Math.max(0, y - 2) * W + x] > .3) raised += 2; }
    }
    return { dy: c ? +(t / c / s).toFixed(3) : 0, n: c, raised: +(raised / s).toFixed(2) };
  }

  /** เศษเครื่องประดับที่คอ: พิกเซลจากตัวคนเดิม (keep) ในช่วงคอใต้กราม ที่ไม่ใช่ผิว (สร้อย/ลูกปัด) — หน่วย fw² */
  function accessory({ keepA, src, W, H, face, jaw, hw = null, mono = false, skinY = 140, hair = null }) {
    const fw = face.fw, cx = face.chinX != null ? face.chinX : face.cx; let c = 0;
    for (let y = Math.round(face.chinY + fw * .12); y < Math.min(H, Math.round(face.chinY + fw * .8)); y++) for (let x = Math.max(0, Math.round(cx - fw * .5)); x < Math.min(W, Math.round(cx + fw * .5)); x++) {
      const i = y * W + x; if (keepA[i] < .5 || (hw && hw[i] > .3) || (hair && hair[i] > .3) || y < jaw(x) + fw * .1) continue;
      const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2];
      if (mono ? Math.abs(lum(src, i) - skinY) > 45 : !skinLike(r, g, b)) c++;
    }
    return +(c / (fw * fw)).toFixed(3);
  }

  /** เกาะผิวกลางอก: พิกเซลที่วางหน้าชุด (keep) ใต้คาง 0.9 หน้า ในพื้นที่ชุด ที่ไม่ใช่มือ/ผม/ผ้าคลุม — หน่วย fw² */
  function skinIsland({ keepA, frontA, hands, hair, W, H, face, hw = null }) {
    const fw = face.fw; let c = 0;
    for (let y = Math.round(face.chinY + fw * .9); y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (keepA[i] < .5 || (hands && hands[i] > .3) || (hair && hair[i] > .3) || (hw && hw[i] > .3)) continue;
      if (frontA[i] > .5 || (x > 0 && frontA[i - 1] > .5 && x < W - 1 && frontA[i + 1] > .5)) c++;
    }
    return +(c / (fw * fw)).toFixed(3);
  }

  /** มือ: ก้อนมือขนาดใหญ่ที่ไม่มีแขนเสื้อ (arms[].hand) ปลายใกล้ (≤ 0.45 s) — จำนวนมือที่ "แปะ" */
  function handsCheck({ hands, W, H, fit, arms }) {
    if (!hands) return { n: 0, orphan: 0 };
    const n = W * H, seen = new Uint8Array(n), s = fit.s, cs = Math.cos(fit.theta || 0), sn = Math.sin(fit.theta || 0);
    // ปลายแขนเสื้อ: ข้อมือ (แขนที่มีมือ) หรือศอก (แขนท่อนล่างเปลือย เช่น แขนสามส่วน ต่อจากปลายแขนเสื้อที่ศอก)
    const P2 = p => ({ x: fit.N.x + s * (cs * p.u - sn * p.v), y: fit.N.y + s * (sn * p.u + cs * p.v) });
    const ends = (arms || []).flatMap(a => a.hand ? [P2(a.Wr)] : a.E ? [P2(a.E)] : []);
    let cntH = 0, orphan = 0;
    for (let s0 = 0; s0 < n; s0++) {
      if (hands[s0] <= .5 || seen[s0]) continue;
      const st = [s0], pts = []; seen[s0] = 1;
      while (st.length) { const i = st.pop(), x = i % W; pts.push(i); for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < n && hands[j] > .5 && !seen[j]) { seen[j] = 1; st.push(j); } }
      if (pts.length < s * s * .03) continue;
      cntH++;
      let best = Infinity; for (const e of ends) for (let k = 0; k < pts.length; k += 7) { const x = pts[k] % W, y = (pts[k] / W) | 0; best = Math.min(best, Math.hypot(x - e.x, y - e.y)); }
      if (best > s * .45) orphan++;
    }
    return { n: cntH, orphan };
  }

  /** มือลอย: ก้อนมือที่แสดง (keep) ใต้คาง 0.9 หน้า ที่ไม่แตะชุดเลย (ห่าง > 0.15 หน้าทุกจุด) — มือถือวัตถุนอกลำตัว ลอยกลางฉาก; หน่วย fw² */
  function floatingHand({ keepA, frontA, W, H, face, hands }) {
    if (!hands) return 0;
    const fw = face.fw, r = Math.max(2, Math.round(fw * .15)), n = W * H, y0 = Math.round(face.chinY + fw * .9), seen = new Uint8Array(n); let c = 0;
    const touches = (x, y) => { for (let k = -r; k <= r; k += 2) for (let q = -r; q <= r; q += 2) { const xx = x + q, yy = y + k; if (xx >= 0 && yy >= 0 && xx < W && yy < H && frontA[yy * W + xx] > .5) return true; } return false; };
    for (let s0 = Math.max(0, y0) * W; s0 < n; s0++) {
      if (seen[s0] || keepA[s0] < .5 || hands[s0] < .5) continue;
      const st = [s0], comp = []; seen[s0] = 1;
      while (st.length) { const i = st.pop(), x = i % W; comp.push(i); for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < n && !seen[j] && keepA[j] >= .5 && hands[j] >= .5) { seen[j] = 1; st.push(j); } }
      let t = false; for (let k = 0; k < comp.length && !t; k += 5) t = touches(comp[k] % W, (comp[k] / W) | 0);
      if (!t) c += comp.length;
    }
    return +(c / (fw * fw)).toFixed(3);
  }
  /** เกณฑ์ผ่าน (ปรับเทียบกับการดูภาพ) */
  const LIMITS = { hairCutRows: 3, neckBgPct: 1.5, neckDE: 16, neckL: [.35, 1.2], neckWide: .75, neckLen: .75, bgChunk: .03, hemRough: .045, bodyWide: 3.75, hemHolePct: .3, shoulderDy: .2, shoulderRaised: .25, accessory: .012, skinIsland: .012, handsOrphan: 0, floatingHand: .02 };
  function verdict(m, L = LIMITS) {
    const f = [];
    if (m.hairCut.rows > L.hairCutRows) f.push("hair-cut");
    if (m.neck.bgPct > L.neckBgPct) f.push("neck-hole");
    if (m.neck.visible > 10 && (m.neck.dE > L.neckDE || m.neck.lRatio < L.neckL[0] || m.neck.lRatio > L.neckL[1])) f.push("neck-colour");
    if (m.neck.wide > L.neckWide) f.push("neck-box");
    if (m.neck.len > L.neckLen) f.push("neck-long");
    if (m.bgChunk > L.bgChunk) f.push("bg-chunk");
    if (m.hem.rough > L.hemRough || m.hem.holePct > L.hemHolePct) f.push("hem");
    if (m.hem.wide > L.bodyWide) f.push("balloon");
    if (m.shoulder.n >= 2 && m.shoulder.dy > L.shoulderDy) f.push("shoulder-line");
    if (m.shoulder.raised > L.shoulderRaised) f.push("shoulder-raised");
    if (m.accessory > L.accessory) f.push("accessory");
    if (m.skinIsland > L.skinIsland) f.push("skin-island");
    if (m.hands.orphan > L.handsOrphan) f.push("hand-no-sleeve");
    if (m.floatingHand > L.floatingHand) f.push("floating-hand");
    return f;
  }

  /** ประเมินสถานะของ studio.js (window.__studio.state) หลังรวมภาพ — ต้องมี StudioCore */
  function evaluate(S, SC = root.StudioCore) {
    const W = S.W, H = S.H, n = W * H, f = S.face, L = S.layers, fit = S.cache.fit, front = S.cache.front, neck = S.cache.neck;
    const frontA = new Float32Array(n); if (front) for (let i = 0; i < n; i++) frontA[i] = front[i * 4 + 3] / 255;
    const neckA = neck ? neck.alpha : new Float32Array(n), keepA = S.keepA, fg = S.fgAlpha, src = S.px, out = S.out, labOf = SC.rgbToLab;
    const hw = S.headwear || null, hairK = new Float32Array(n); for (let i = 0; i < n; i++) hairK[i] = L.hair[i] * S.alpha[i];
    let hairLab = null; { let a = 0, b = 0, c = 0, k = 0; for (let y = 0; y < Math.round(f.eyeY - f.fw * .4); y += 2) for (let x = 0; x < W; x += 2) { const i = y * W + x; if (L.hair[i] > .6 && S.alpha[i] > .8) { const q = labOf(src[i * 4], src[i * 4 + 1], src[i * 4 + 2]); a += q[0]; b += q[1]; c += q[2]; k++; } } if (k > 20) hairLab = [a / k, b / k, c / k]; }
    const skinLab = S.harm && S.harm.skin ? S.harm.skin.mean : null, mono = !!(S.harm && S.harm.mono);
    const collarY = neck && neck.yCollar != null ? neck.yCollar : f.chinY + f.fw * .4;
    const m = {
      hairCut: hairCut(keepA, src, S.alpha, W, H, f),
      neck: neckCheck({ out, fg, neckA, frontA, keepA, W, H, face: f, collarY, skinLab, mono, labOf }),
      bgChunk: bgChunk({ keepA, src, W, H, face: f, hairLab, labOf, hw }),
      hem: hemCheck({ frontA, fg, W, H, fit }),
      shoulder: shoulderCheck({ frontA, W, H, fit, samples: S.fitAuto && !S.manual ? S.fitAuto.samples : null, hair: hairK }),
      accessory: accessory({ keepA, src, W, H, face: f, jaw: SC.jawCurve(f), hw, mono, skinY: S.harm && S.harm.faceLum || 140, hair: L.hair }),
      skinIsland: skinIsland({ keepA, frontA, hands: S.handsUsed || S.hands, hair: L.hair, W, H, face: f, hw }),
      hands: handsCheck({ hands: S.handsUsed || null, W, H, fit, arms: S.cache.clip && S.cache.clip.arms }),
      floatingHand: floatingHand({ keepA, frontA, src: null, W, H, face: f, hands: S.hands })
    };
    const fails = verdict(m);
    return { pass: !fails.length, fails, m };
  }

  const api = { hairCut, neckCheck, bgChunk, hemCheck, shoulderCheck, accessory, skinIsland, handsCheck, floatingHand, verdict, evaluate, LIMITS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.StudioQA = api;
})(typeof window !== "undefined" ? window : globalThis);
