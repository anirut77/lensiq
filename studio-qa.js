/* studio-qa.js — ตัวตรวจคุณภาพอัตโนมัติของผลแต่งชุด (studio.html) สำหรับชุดทดสอบภาพถดถอย และโหลดในหน้า studio.html (ชุดตรวจเร็ว evaluate(S, SC, { fast: true }) หลังรวมภาพ เพื่อแจ้งผู้ใช้อย่างสุภาพ)
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
    let area = 0, holes = 0; const q = Math.max(2, Math.round(s * .15)), G = /** @type {(x: number, y: number) => any} */ ((x, y) => x >= 0 && y >= 0 && x < W && y < H && frontA[y * W + x] > .5);
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
  /**
   * รอยต่อคอ-คอเสื้อ (แถบจากแนวกรามถึงโคนคอ N, |dx| < 0.6 หน้า): ฉากหลังที่ถูกล้อมซ้าย-ขวา (รอยบาก/ช่อง) และขอบโปร่งครึ่งเดียวของชุด
   * (เศษขาว/เทาจากขอบเทมเพลต) — คืน { gapPct, fringePct } (% ของพิกเซลในแถบ)
   */
  function neckJoin({ fg, frontA, keepA, W, H, face, fit, neckA = null, hair = null }) {
    // ช่อง: ฉากโผล่ "ภายใน" ผิว (ขอบซ้ายและขวาของช่องเป็นหน้า/คอ ไม่ใช่ผม/ชุด) และแคบกว่า 0.25 หน้า = รู/บากในคอ
    // (ฉากจริงระหว่างคอกับผมยาว หรือระหว่างคอกับบ่าเสื้อ ไม่นับ — เดิมนับทั้งหมด ทำให้ภาพผมยาวถูกตีตกเกือบทุกภาพ)
    const fw = face.fw, cx = Math.round(face.chinX != null ? face.chinX : face.cx), y0 = Math.round(face.chinY - fw * .05), y1 = Math.min(H - 1, Math.round(fit.N.y + fit.s * .1));
    const skin = i => fg[i] >= .5 && frontA[i] < .5 && (!hair || hair[i] < .4) && Math.max(keepA[i], neckA ? neckA[i] : 0) > .5;
    let n = 0, gap = 0, fr = 0;
    for (let y = Math.max(0, y0); y <= y1; y++) {
      const xa = Math.max(1, cx - Math.round(fw * .6)), xb = Math.min(W - 2, cx + Math.round(fw * .6));
      for (let x = xa; x <= xb; x++) {
        const i = y * W + x; n++; if (frontA[i] > .08 && frontA[i] < .55 && keepA[i] < .3) fr++;
        if (fg[i] >= .5 || !skin(i - 1)) continue;
        let e = x; while (e < xb && fg[y * W + e + 1] < .5) e++;
        if (e < xb && e - x + 1 < fw * .25 && skin(y * W + e + 1)) gap += e - x + 1;
        x = e;
      }
    }
    return { gapPct: n ? +(100 * gap / n).toFixed(2) : 0, fringePct: n ? +(100 * fr / n).toFixed(2) : 0 };
  }
  /** คอแบน: ส่วนเบี่ยงเบนความสว่าง/ค่าเฉลี่ย (CV) ของคอที่มองเห็น — คอที่สร้างเป็นสีเรียบ (แผ่นสีน้ำตาล/เทา) มี CV ต่ำมาก; คืน { cv, area (fw²) } */
  function neckFlat({ out, neckA, frontA, keepA, W, H, face }) {
    const fw = face.fw; let s1 = 0, s2 = 0, c = 0;
    for (let y = Math.round(face.chinY); y < Math.min(H, face.chinY + fw * 1.2); y++) for (let x = Math.max(0, Math.round(face.cx - fw * .6)); x < Math.min(W, face.cx + fw * .6); x++) {
      const i = y * W + x; if (neckA[i] * (1 - frontA[i]) * (1 - keepA[i]) < .7) continue; const l = lum(out, i); s1 += l; s2 += l * l; c++;
    }
    if (c < 30) return { cv: 1, area: 0 };
    const m = s1 / c; return { cv: +(Math.sqrt(Math.max(0, s2 / c - m * m)) / Math.max(1, m)).toFixed(3), area: +(c / (fw * fw)).toFixed(3) };
  }
  /** เกาะหลุด: ก้อนของตัวคนในผลลัพธ์ (fg > .5) ที่ไม่ต่อกับก้อนใหญ่สุด — พิกเซลรวม / fw² */
  function strayParts({ fg, W, H, face }) {
    const n = W * H, lab = new Int32Array(n).fill(-1), sizes = []; let id = 0;
    for (let s0 = 0; s0 < n; s0++) { if (fg[s0] <= .5 || lab[s0] >= 0) continue; const st = [s0]; lab[s0] = id; let c = 0; while (st.length) { const i = st.pop(), x = i % W; c++; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < n && fg[j] > .5 && lab[j] < 0) { lab[j] = id; st.push(j); } } sizes.push(c); id++; }
    if (sizes.length < 2) return 0;
    const big = sizes.indexOf(Math.max(...sizes)); let t = 0; sizes.forEach((v, k) => { if (k !== big && v > 20) t += v; });
    return +(t / (face.fw * face.fw)).toFixed(3);
  }
  /** สีชุดเดิมที่ค้าง: พิกเซลที่วางหน้าชุด (keep) ลึกกว่าคาง 0.6 หน้า ที่ไม่ใช่มือ/ผม และเรียบไม่มีลาย (ไม่ใช่ผ้าคลุมลวดลาย) — fw² */
  function leftover({ keepA, src, W, H, face, hands, hair }) {
    const fw = face.fw, r = 2; let c = 0;
    for (let y = Math.round(face.chinY + fw * .6); y < H - r; y += 2) for (let x = r; x < W - r; x += 2) {
      const i = y * W + x; if (keepA[i] < .6 || (hands && hands[i] > .3) || (hair && hair[i] > .3)) continue;
      let s1 = 0, s2 = 0; for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) { const l = lum(src, i + dy * W + dx); s1 += l; s2 += l * l; }
      const sd = Math.sqrt(Math.max(0, s2 / 9 - (s1 / 9) ** 2)); if (sd < 6) c += 4;
    }
    return +(c / (fw * fw)).toFixed(3);
  }
  /** บากเป็นขั้น: ขอบซ้าย/ขวาของแถบผิว (หน้า+คอที่มองเห็น) ที่กึ่งกลางคาง กระโดด > 0.06 หน้าในแถวเดียว โดยก่อนและหลังเป็นแนวตั้งตรง
   *  (มุมฉากแบบ "ขั้นบันได" ที่ปลายกราม/บนคอ — กรามโค้งจริงเปลี่ยนต่อเนื่อง ไม่นับ) — คืน { steps, maxJump (fw) } */
  function neckNotch({ keepA, neckA, frontA, W, H, face, collarY, hair = null }) {
    const fw = face.fw, cx = Math.round(face.chinX != null ? face.chinX : face.cx), y0 = Math.max(0, Math.round(face.P && face.P.length >= 17 ? Math.min(face.P[4].y, face.P[12].y) : face.chinY - fw * .25)), y1 = Math.min(H - 1, Math.round(collarY));
    const vis = i => (!hair || hair[i] < .4) && Math.max(keepA[i], neckA[i] * (1 - frontA[i])) > .5, BL = [], BR = []; // ไม่นับผม (ปลายผมตัดตรงเป็นธรรมชาติได้)
    for (let y = y0; y <= y1; y++) {
      if (!vis(y * W + cx)) { BL.push(null); BR.push(null); continue; }
      let l = cx, r = cx; while (l > 0 && cx - l < fw && vis(y * W + l - 1)) l--; while (r < W - 1 && r - cx < fw && vis(y * W + r + 1)) r++;
      BL.push(l); BR.push(r);
    }
    let steps = 0, maxJ = 0; const tol = fw * .015, big = fw * .06;
    for (const B of [BL, BR]) for (let k = 3; k < B.length - 4; k++) {
      const a = B[k], b = B[k + 1]; if (a == null || b == null || B[k - 3] == null || B[k + 4] == null) continue;
      const j = Math.abs(b - a); if (j < big) continue;
      if (Math.abs(B[k - 3] - a) < tol && Math.abs(B[k + 4] - b) < tol) { steps++; maxJ = Math.max(maxJ, j / fw); }
    }
    return { steps, maxJump: +maxJ.toFixed(3) };
  }
  /** เศษติดขอบหน้า: ส่วนของ keep (ไม่ใช่ผม) ใต้ระดับตา ใกล้แนวกราม (< 0.15 หน้า) ที่หายไปเมื่อ opening รัศมี 2.5% หน้า
   *  (เส้นบาง/เศษสว่างข้างกราม-ข้างหู) — คืนพื้นที่ / fw² */
  function faceIsland({ keepA, hair, W, H, face, SC }) {
    const fw = face.fw; if (!SC || !SC.erodeR) return 0;
    const x0 = Math.max(0, Math.floor(face.cx - fw * 1.3)), x1 = Math.min(W, Math.ceil(face.cx + fw * 1.3)), y0 = Math.max(0, Math.floor(face.eyeY)), y1 = Math.min(H, Math.ceil(face.chinY + fw * .9)), bw = x1 - x0, bh = y1 - y0;
    if (bw < 4 || bh < 4) return 0;
    const on = new Uint8Array(bw * bh); for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) on[y * bw + x] = keepA[(y + y0) * W + x + x0] > .5 ? 1 : 0;
    const r = Math.max(1, Math.round(fw * .025)), op = SC.dilateR(SC.erodeR(on, bw, bh, r), bw, bh, r + 1);
    const jaw = face.P && face.P.length >= 17 ? face.P.slice(0, 17) : null;
    const nearJaw = (x, y) => { if (!jaw) return Math.abs(x - face.cx) > fw * .3 && y > face.eyeY + fw * .2; let d = 1e9; for (const p of jaw) d = Math.min(d, Math.hypot(p.x - x, p.y - y)); return d < fw * .15; };
    let c = 0;
    for (let y = 0; y < bh; y += 1) for (let x = 0; x < bw; x++) { const k = y * bw + x, i = (y + y0) * W + x + x0; if (!on[k] || op[k] || (hair && hair[i] > .4)) continue; if (nearJaw(x + x0, y + y0)) c++; }
    return +(c / (fw * fw)).toFixed(4);
  }
  /** คอเรียบ/มืดเมื่อเทียบกับหน้า: ความสว่างเฉลี่ยของคอที่มองเห็น / ผิวหน้าส่วนล่าง และลายผิวความถี่สูง (|L - เฉลี่ย 5×5|) คอ / หน้า
   *  แผ่นคอสีเข้มเรียบ = lRel ต่ำ และ texRel ต่ำ — คืน { lRel, texRel, area (fw²) } */
  function neckRel({ out, neckA, frontA, keepA, W, H, face, mono = false }) {
    const fw = face.fw, cx = face.chinX != null ? face.chinX : face.cx;
    const hp = i => { const x = i % W, y = (i / W) | 0; if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) return 0; let s = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += lum(out, i + dy * W + dx); return Math.abs(lum(out, i) - s / 25); };
    let nL = 0, nT = 0, nc = 0, fL = 0, fT = 0, fc = 0;
    for (let y = Math.max(2, Math.round(face.chinY + fw * .08)); y < Math.min(H - 2, face.chinY + fw * 1.2); y += 2) for (let x = Math.max(2, Math.round(cx - fw * .5)); x < Math.min(W - 2, cx + fw * .5); x += 2) {
      const i = y * W + x; if (neckA[i] * (1 - frontA[i]) * (1 - keepA[i]) < .9 || neckA[i - 3] < .9 || neckA[i + 3] < .9 || frontA[i + 3 * W] > .1 || keepA[i - 3 * W] > .1) continue; /* ไม่นับขอบคอ (ขอบตัดกับฉาก/ชุด/คาง) */ nL += lum(out, i); nT += hp(i); nc++;
    }
    for (let y = Math.max(2, Math.round(face.chinY - fw * .42)); y < Math.round(face.chinY - fw * .1); y += 2) for (let x = Math.max(2, Math.round(cx - fw * .3)); x < Math.min(W - 2, cx + fw * .3); x += 2) {
      const i = y * W + x; if (keepA[i] < .9) continue; const l = lum(out, i); if (!mono && (l < 25 || l > 240)) continue; fL += l; fT += hp(i); fc++;
    }
    if (nc < 20 || fc < 20) return { lRel: 1, texRel: 1, area: +(nc * 4 / (fw * fw)).toFixed(3) };
    return { lRel: +((nL / nc) / Math.max(1, fL / fc)).toFixed(3), texRel: +((nT / nc) / Math.max(.1, fT / fc)).toFixed(3), area: +(nc * 4 / (fw * fw)).toFixed(3) };
  }
  /** เกณฑ์ผ่าน (ปรับเทียบกับการดูภาพ) */
  const LIMITS = { hairCutRows: 3, neckBgPct: 1.2, neckDE: 16, neckL: [.2, 1.2], neckWide: .75, neckLen: .75, bgChunk: .03, hemRough: .045, bodyWide: 3.75, hemHolePct: .3, shoulderDy: .2, shoulderRaised: .25, accessory: .012, skinIsland: .012, handsOrphan: 0, floatingHand: .02, neckJoinGap: 2.5, neckJoinFringe: 2, neckFlatArea: .06, neckFlatCv: .045, stray: .01, leftover: .12, neckNotch: .25, faceIsland: .004, neckRelArea: .05, neckRelL: .45, neckRelTex: .45 };
  function verdict(m, L = LIMITS) {
    const f = [];
    if (m.hairCut && m.hairCut.rows > L.hairCutRows) f.push("hair-cut");
    if (m.neck && m.neck.bgPct > L.neckBgPct) f.push("neck-hole");
    if (m.neck && m.neck.visible > 10 && (m.neck.dE > L.neckDE || m.neck.lRatio < L.neckL[0] || m.neck.lRatio > L.neckL[1])) f.push("neck-colour");
    if (m.neck && m.neck.wide > L.neckWide) f.push("neck-box");
    if (m.neck && m.neck.len > L.neckLen) f.push("neck-long");
    if (m.bgChunk > L.bgChunk) f.push("bg-chunk");
    if (m.hem && (m.hem.rough > L.hemRough || m.hem.holePct > L.hemHolePct)) f.push("hem");
    if (m.hem && m.hem.wide > L.bodyWide) f.push("balloon");
    if (m.shoulder && m.shoulder.n >= 2 && m.shoulder.dy > L.shoulderDy) f.push("shoulder-line");
    if (m.shoulder && m.shoulder.raised > L.shoulderRaised) f.push("shoulder-raised");
    if (m.accessory > L.accessory) f.push("accessory");
    if (m.skinIsland > L.skinIsland) f.push("skin-island");
    if (m.hands && m.hands.orphan > L.handsOrphan) f.push("hand-no-sleeve");
    if (m.floatingHand > L.floatingHand) f.push("floating-hand");
    if (m.neckJoin && (m.neckJoin.gapPct > L.neckJoinGap || m.neckJoin.fringePct > L.neckJoinFringe)) f.push("neck-join");
    if (m.neckFlat && m.neckFlat.area > L.neckFlatArea && m.neckFlat.cv < L.neckFlatCv) f.push("neck-flat");
    if (m.neckNotch && m.neckNotch.maxJump > L.neckNotch) f.push("neck-notch");
    if (m.faceIsland > L.faceIsland) f.push("face-island");
    if (m.neckRel && m.neckRel.area > L.neckRelArea && m.neckRel.lRel < L.neckRelL && m.neckRel.texRel < L.neckRelTex) f.push("neck-flat-rel");
    if (m.stray > L.stray) f.push("stray");
    if (m.leftover > L.leftover) f.push("leftover");
    return f;
  }

  /** ประเมินสถานะของ studio.js (window.__studio.state) หลังรวมภาพ — ต้องมี StudioCore */
  /** ชุดตรวจเร็วสำหรับหน้าเว็บ (หลังรวมภาพทุกครั้ง): รอยต่อคอ/กราม เศษขอบหน้า คอเรียบ/มืด เกาะหลุด รูในคอ — ไม่รวมตัวตรวจที่ช้า (ผม ชายชุด ไหล่ มือ) */
  const FAST = new Set(["neck", "neckJoin", "neckNotch", "faceIsland", "neckRel", "stray"]);
  function evaluate(S, SC = root.StudioCore, { fast = false } = {}) {
    const W = S.W, H = S.H, n = W * H, f = S.face, L = S.layers, fit = S.cache.fit, front = S.cache.front, neck = S.cache.neck;
    const frontA = new Float32Array(n); if (front) for (let i = 0; i < n; i++) frontA[i] = front[i * 4 + 3] / 255;
    const neckA = neck ? neck.alpha : new Float32Array(n), keepA = S.keepA, fg = S.fgAlpha, src = S.px, out = S.out, labOf = SC.rgbToLab;
    const hw = S.headwear || null, hairK = fast ? null : new Float32Array(n); if (hairK) for (let i = 0; i < n; i++) hairK[i] = L.hair[i] * S.alpha[i];
    let hairLab = null; if (!fast) { let a = 0, b = 0, c = 0, k = 0; for (let y = 0; y < Math.round(f.eyeY - f.fw * .4); y += 2) for (let x = 0; x < W; x += 2) { const i = y * W + x; if (L.hair[i] > .6 && S.alpha[i] > .8) { const q = labOf(src[i * 4], src[i * 4 + 1], src[i * 4 + 2]); a += q[0]; b += q[1]; c += q[2]; k++; } } if (k > 20) hairLab = [a / k, b / k, c / k]; }
    const skinLab = S.harm && S.harm.skin ? S.harm.skin.mean : null, mono = !!(S.harm && S.harm.mono);
    const collarY = neck && neck.yCollar != null ? neck.yCollar : f.chinY + f.fw * .4;
    const m = {}, want = k => !fast || FAST.has(k);
    if (want("hairCut")) m.hairCut = hairCut(keepA, src, S.alpha, W, H, f);
    if (want("neck")) m.neck = neckCheck({ out, fg, neckA, frontA, keepA, W, H, face: f, collarY, skinLab, mono, labOf });
    if (want("bgChunk")) m.bgChunk = bgChunk({ keepA, src, W, H, face: f, hairLab, labOf, hw });
    if (want("hem")) m.hem = hemCheck({ frontA, fg, W, H, fit });
    if (want("shoulder")) m.shoulder = shoulderCheck({ frontA, W, H, fit, samples: S.fitAuto && !S.manual ? S.fitAuto.samples : null, hair: hairK });
    if (want("accessory")) m.accessory = accessory({ keepA, src, W, H, face: f, jaw: SC.jawCurve(f), hw, mono, skinY: S.harm && S.harm.faceLum || 140, hair: L.hair });
    if (want("skinIsland")) m.skinIsland = skinIsland({ keepA, frontA, hands: S.handsUsed || S.hands, hair: L.hair, W, H, face: f, hw });
    if (want("hands")) m.hands = handsCheck({ hands: S.handsUsed || null, W, H, fit, arms: S.cache.clip && S.cache.clip.arms });
    if (want("floatingHand")) m.floatingHand = floatingHand({ keepA, frontA, W, H, face: f, hands: S.hands });
    if (want("neckJoin")) m.neckJoin = neckJoin({ fg, frontA, keepA, W, H, face: f, fit, neckA, hair: L.hair });
    if (want("neckFlat")) m.neckFlat = neckFlat({ out, neckA, frontA, keepA, W, H, face: f });
    if (want("faceIsland")) m.faceIsland = faceIsland({ keepA, hair: L.hair, W, H, face: f, SC });
    if (want("neckRel")) m.neckRel = neckRel({ out, neckA, frontA, keepA, W, H, face: f, mono });
    if (want("neckNotch")) m.neckNotch = hw ? { steps: 0, maxJump: 0 } : neckNotch({ keepA, neckA, frontA, W, H, face: f, collarY, hair: L.hair });
    if (want("stray")) m.stray = strayParts({ fg, W, H, face: f });
    if (want("leftover")) m.leftover = leftover({ keepA, src, W, H, face: f, hands: S.handsUsed || S.hands, hair: L.hair });
    const fails = verdict(m);
    return { pass: !fails.length, fails, m };
  }

  const api = { hairCut, neckNotch, faceIsland, neckRel, neckCheck, bgChunk, hemCheck, shoulderCheck, accessory, skinIsland, handsCheck, floatingHand, neckJoin, neckFlat, strayParts, leftover, verdict, evaluate, LIMITS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.StudioQA = api;
})(typeof window !== "undefined" ? window : globalThis);
