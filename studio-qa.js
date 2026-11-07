/* studio-qa.js — ตัวตรวจคุณภาพอัตโนมัติของผลแต่งชุด: studio.js เรียก evaluate(S, SC, { gate: true }) (ชุดตรวจเต็ม) หลังรวมภาพทุกครั้ง ผลที่ไม่ผ่านไม่ถูกแสดงเป็นผลหลัก (แสดงแบบไม่ใส่ชุดแทน);
 *  ตรวจรอยต่อกราม/หูบนครอปมาตรฐาน (jawCrop/jawFeatures), ความมั่นใจที่ปรับเทียบ (confidence), ตรวจรูปติดบัตร (idSpecCheck) และชุดในรูปติดบัตรของตู้ถ่ายรูป (boothCheck) — ผลวัดใน ACCURACY.md §11
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
  /** ก้อนผิดปกติติดแนวกราม (เทียบกับภาพเดิม — ไม่ปรับเกณฑ์ตามชุดภาพ):
   *  ในแถบรอบแนวกราม P2–P14 (ห่างไม่เกิน 0.3 หน้า) พิกเซลผลลัพธ์ที่
   *   (ก) "มืดผิดปกติ": ไม่ใช่ผม/ชุดใหม่ และความสว่างต่ำกว่าผิวหน้าเดิม (ค่าเฉลี่ย − 2.5 SD และ < 0.55 เท่า)
   *   (ข) "สว่างผิดปกติ": ไม่ใช่ชุดใหม่ และสว่างกว่าผิวหน้าเดิม + 2.5 SD (เศษฉาก/ขอบขาว)
   *   (ค) "ช่องฉาก": ภาพเดิมเป็นผิวคน (alpha สูง สีผิว) แต่ผลลัพธ์เป็นฉาก
   *  รวมเป็นก้อน (4-connected); ก้อนที่ใหญ่ ≥ X และ "ทึบ" (พื้นที่/กรอบ ≥ 0.5 = ทรงสี่เหลี่ยม/ก้อน ไม่ใช่เส้นบาง) = ผิดปกติ
   *  คืน { area (fw², ก้อนใหญ่สุดที่ทึบ), kind } */
  function jawBlob({ out, src, srcA, fg, frontA, hair, W, H, face, mono = false }) {
    const fw = face.fw, P = face.P; if (!P || P.length < 68) return { area: 0, kind: "" };
    // สถิติผิวหน้าเดิม: ภายในวงแก้ม (P1–P15 หดเข้า) ใต้ตา
    let s1 = 0, s2 = 0, c = 0; const fx0 = Math.round(P[1].x + (P[15].x - P[1].x) * .2), fx1 = Math.round(P[15].x - (P[15].x - P[1].x) * .2), fy0 = Math.round((P[36].y + P[45].y) / 2 + fw * .1), fy1 = Math.round(P[57].y);
    for (let y = Math.max(0, fy0); y < Math.min(H, fy1); y += 2) for (let x = Math.max(0, fx0); x < Math.min(W, fx1); x += 2) { const i = y * W + x, l = lum(src, i); s1 += l; s2 += l * l; c++; }
    if (c < 20) return { area: 0, kind: "" };
    const m = s1 / c, sd = Math.max(8, Math.sqrt(Math.max(0, s2 / c - m * m)));
    const jaw = P.slice(2, 15), x0 = Math.max(0, Math.floor(Math.min(...jaw.map(p => p.x)) - fw * .3)), x1 = Math.min(W - 1, Math.ceil(Math.max(...jaw.map(p => p.x)) + fw * .3));
    const y0 = Math.max(0, Math.floor(Math.min(...jaw.map(p => p.y)))), y1 = Math.min(H - 1, Math.ceil(Math.max(...jaw.map(p => p.y)) + fw * .3)), bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const near = (x, y) => { for (const p of jaw) if ((p.x - x) ** 2 + (p.y - y) ** 2 < (fw * .3) ** 2) return true; return false; };
    const K = new Uint8Array(bw * bh); // 1 มืด 2 สว่าง 3 ช่องฉาก
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!near(x, y)) continue; const i = y * W + x, k = (y - y0) * bw + x - x0, l = lum(out, i);
      if (fg[i] < .3) { const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2]; if (srcA[i] > .85 && (mono || (r > g && g > b && r - b > 15)) && Math.abs(lum(src, i) - m) < 2 * sd) K[k] = 3; continue; }
      if (frontA[i] > .5 || (hair && hair[i] > .4)) continue;
      if (l < m - 2.5 * sd && l < m * .55) K[k] = 1; else if (l > m + 2.5 * sd) K[k] = 2;
    }
    const seen = new Uint8Array(bw * bh); let best = 0, kind = "";
    for (let s0 = 0; s0 < bw * bh; s0++) {
      if (!K[s0] || seen[s0]) continue; const t = K[s0], st = [s0]; seen[s0] = 1; let n = 0, ax = 1e9, bx = -1, ay = 1e9, by = -1;
      while (st.length) { const k = st.pop(), x = k % bw, y = (k / bw) | 0; n++; ax = Math.min(ax, x); bx = Math.max(bx, x); ay = Math.min(ay, y); by = Math.max(by, y); for (const kk of [x > 0 ? k - 1 : -1, x < bw - 1 ? k + 1 : -1, k - bw, k + bw]) if (kk >= 0 && kk < bw * bh && K[kk] === t && !seen[kk]) { seen[kk] = 1; st.push(kk); } }
      const a = n / (fw * fw), solid = n / ((bx - ax + 1) * (by - ay + 1));
      if (solid >= .5 && a > best) { best = a; kind = t === 1 ? "dark" : t === 2 ? "light" : "gap"; }
    }
    return { area: +best.toFixed(4), kind };
  }
  /** ฉากโผล่ใหม่ข้างศีรษะ (เทียบกับภาพเดิม — ไม่ขึ้นกับชนิดความผิดพลาด): พิกเซลที่ภาพเดิมเป็นตัวคน (alpha > .8)
   *  แต่ผลลัพธ์เป็นฉาก (fg < .3) ห่างจากศีรษะ/ผมที่แสดง (keep) ไม่เกิน 0.12 หน้า ในแถบระดับตาถึงใต้คาง 0.6 หน้า (|dx| < 1.1 หน้า)
   *  = รอยตัดข้างกราม/ใต้หู ช่องขาวระหว่างผมกับคอ เศษที่หายจากขอบหน้า — คืนพื้นที่ / fw² */
  function revealed({ fg, srcA, keepA, W, H, face, SC }) {
    const fw = face.fw; if (!SC || !SC.dilateR) return 0;
    const x0 = Math.max(0, Math.floor(face.cx - fw * 1.1)), x1 = Math.min(W, Math.ceil(face.cx + fw * 1.1)), y0 = Math.max(0, Math.floor(face.eyeY)), y1 = Math.min(H, Math.ceil(face.chinY + fw * .6)), bw = x1 - x0, bh = y1 - y0;
    if (bw < 4 || bh < 4) return 0;
    const on = new Uint8Array(bw * bh); for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) on[y * bw + x] = keepA[(y + y0) * W + x + x0] > .5 ? 1 : 0;
    const near = SC.dilateR(on, bw, bh, Math.max(1, Math.round(fw * .12)));
    let c = 0; for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const k = y * bw + x, i = (y + y0) * W + x + x0; if (near[k] && !on[k] && srcA[i] > .8 && fg[i] < .3) c++; }
    return +(c / (fw * fw)).toFixed(4);
  }
  /** ข้างกรามที่ผมบัง: สัดส่วนของแถบข้างกรามล่าง (ระดับติ่งหู → คาง, |dx| 0.3–0.7 หน้า) ที่ผลลัพธ์แสดงผมของผู้ถ่าย
   *  คืนค่าด้านที่น้อยกว่า (0 = ข้างกรามเปิดทั้งแถบ) — รอยต่อกราม/ใต้หูเป็นจุดที่ผลแต่งชุดพลาดบ่อยที่สุด เมื่อผมบังจะไม่เห็น */
  function jawCover({ keepA, hair, W, H, face }) {
    const fw = face.fw, P = face.P, cx = face.chinX != null ? face.chinX : face.cx; if (!hair) return 0;
    const yA = Math.round(P && P.length >= 17 ? (P[3].y + P[13].y) / 2 : face.chinY - fw * .3), yB = Math.round(face.chinY);
    const side = sd => { let c = 0, t = 0; for (let y = Math.max(0, yA); y < Math.min(H, yB); y += 2) for (let d = fw * .3; d < fw * .7; d += 2) { const x = Math.round(cx + sd * d); if (x < 0 || x >= W) continue; const i = y * W + x; t++; if (keepA[i] > .5 && hair[i] > .5) c++; } return t ? c / t : 0; };
    return +Math.min(side(-1), side(1)).toFixed(3);
  }
  /**
   * ครอปบริเวณกราม/หู/คอ ที่สเกลมาตรฐาน (ความกว้างหน้า = JC.fw พิกเซล) สำหรับตัวชี้วัดรอยต่อ (jawFeatures) และประตูที่เรียนรู้ (learnedGate)
   * ช่องข้อมูล (Uint8 0–255): out RGB, fgAlpha, keep, srcAlpha, hair, neck, front, src RGB — ฟังก์ชันล้วน ใช้ได้ทั้งในหน้าเว็บและ Node
   * คืน { w, h, ch: {name: Uint8Array}, jaw: [{x,y}] (จุดกราม 17 จุดในพิกัดครอป หรือ null), chin: {x,y}, eyeY }
   */
  const JC = { fw: 64, x0: -1.15, x1: 1.15, y0: -.2, y1: 1.7 };
  function jawCrop({ out, fg, keepA, srcA, hair, neckA, frontA, src, W, H, face }) {
    const k = face.fw / JC.fw, cx = face.chinX != null ? face.chinX : face.cx, w = Math.round((JC.x1 - JC.x0) * JC.fw), h = Math.round((JC.y1 - JC.y0) * JC.fw);
    const ox = cx + JC.x0 * face.fw, oy = face.eyeY + JC.y0 * face.fw, n = w * h;
    const names = ["r", "g", "b", "fg", "keep", "srcA", "hair", "neck", "front", "sr", "sg", "sb"], ch = {}; for (const q of names) ch[q] = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = Math.round(ox + (x + .5) * k - .5), Y = Math.round(oy + (y + .5) * k - .5), j = y * w + x;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const i = Y * W + X;
      ch.r[j] = out[i * 4]; ch.g[j] = out[i * 4 + 1]; ch.b[j] = out[i * 4 + 2];
      ch.fg[j] = fg[i] * 255; ch.keep[j] = keepA[i] * 255; ch.srcA[j] = srcA[i] * 255; ch.hair[j] = hair ? hair[i] * 255 : 0;
      ch.neck[j] = neckA ? neckA[i] * 255 : 0; ch.front[j] = frontA[i] * 255; ch.sr[j] = src[i * 4]; ch.sg[j] = src[i * 4 + 1]; ch.sb[j] = src[i * 4 + 2];
    }
    const map = p => ({ x: (p.x - ox) / k, y: (p.y - oy) / k });
    return { w, h, ch, jaw: face.P && face.P.length >= 17 ? face.P.slice(0, 17).map(map) : null, chin: map({ x: cx, y: face.chinY }), eyeY: (face.eyeY - oy) / k };
  }
  /**
   * ตัวชี้วัดรอยต่อกราม/ใต้หูบนครอปมาตรฐาน (หน่วยพิกเซลครอป, fw = 64) — ค่ามาก = แย่ ทุกค่าคิดแยกซ้าย/ขวาแล้วเอาด้านที่แย่กว่า
   *  seam    = ความต่างสีเฉลี่ย (RGB) ข้ามขอบของชั้นศีรษะ (keep) ใต้แนวกราม ที่อีกด้านไม่ใช่ฉาก — รอยต่อสีระหว่างหน้า/คอจริงกับคอที่สร้าง
   *  gapEdge = สัดส่วนขอบล่างของศีรษะ (ช่วงติ่งหู → คาง) ที่ติดฉากหลังโดยตรง ในภาพเดิมเป็นตัวคน (ช่องขาวใต้หู)
   *  straight= ความยาวขอบแนวตั้ง/แนวนอนที่ตรงผิดธรรมชาติของเงาตัวคนในแถบข้างกราม (เส้นตัดตรง) / fw
   *  jump    = การกระโดดของขอบนอกเงาตัวคนรายแถว (ระดับติ่งหู → คอเสื้อ) สูงสุด / fw (บาก/ขั้น)
   *  lumStep = ความต่างความสว่างระหว่างผิวใต้กราม (ชั้นศีรษะ) กับคอที่สร้างใต้ลงไป / 255
   *  open    = สัดส่วนแถบข้างกรามล่างที่ไม่มีผมบัง (1 = เปิดทั้งแถบ)
   *  exposed = พื้นที่คอที่สร้าง (neck ไม่ถูกชุดบัง ไม่ใช่ศีรษะ) / fw²
   */
  function jawFeatures(C) {
    const { w, h, ch } = C, F = JC.fw, A = q => ch[q], at = (q, x, y) => x < 0 || y < 0 || x >= w || y >= h ? 0 : A(q)[y * w + x];
    const jawY = (() => {
      if (C.jaw) { const J = C.jaw.slice().sort((a, b) => a.x - b.x); return x => { if (x <= J[0].x) return J[0].y; if (x >= J[16].x) return J[16].y; let i = 0; while (i < 15 && J[i + 1].x < x) i++; const a = J[i], b = J[i + 1], t = (x - a.x) / Math.max(1e-6, b.x - a.x); return a.y + (b.y - a.y) * t; }; }
      const hw = F / 2, top = C.eyeY; return x => { const t = (x - C.chin.x) / hw; return Math.abs(t) >= 1 ? top : top + (C.chin.y - top) * Math.sqrt(1 - t * t); };
    })();
    const cx = C.chin.x, earY = C.jaw ? (C.jaw[2].y + C.jaw[14].y) / 2 : C.chin.y - F * .45, rgbD = (i, j) => Math.hypot(A("r")[i] - A("r")[j], A("g")[i] - A("g")[j], A("b")[i] - A("b")[j]);
    const res = { seam: 0, gapEdge: 0, straight: 0, jump: 0, lumStep: 0, open: 0, exposed: 0 };
    let expo = 0; for (let i = 0; i < w * h; i++) if (A("neck")[i] > 128 && A("front")[i] < 128 && A("keep")[i] < 128 && A("fg")[i] > 128) expo++;
    res.exposed = +(expo / (F * F)).toFixed(3);
    for (const sd of [-1, 1]) {
      // ขอบล่างของชั้นศีรษะ: แต่ละคอลัมน์จากแนวกลางคอออกไปถึงหู (0.15–0.62 fw) ไล่ลงจากแนวกรามหา keep → ไม่ keep
      let sN = 0, sT = 0, gN = 0, gT = 0, lN = 0, lT = 0, oN = 0, oT = 0;
      for (let d = Math.round(F * .15); d <= Math.round(F * .62); d++) {
        const x = Math.round(cx + sd * d); if (x < 1 || x >= w - 1) continue;
        const y0 = Math.max(0, Math.round(jawY(x) - F * .12)), yMax = Math.min(h - 3, Math.round(jawY(x) + F * .35));
        let y = y0; while (y < yMax && at("keep", x, y) > 128) y++;
        if (y >= yMax || y <= y0) continue;
        const i = (y - 2) * w + x, j = (y + 2) * w + x; // ศีรษะด้านบน ↔ ด้านล่าง
        if (at("hair", x, y - 2) > 100) continue; // ปลายผม: ตัดตรงได้ตามธรรมชาติ
        gT++; if (A("fg")[j] < 128 && A("srcA")[j] > 200) gN++;
        if (A("fg")[j] >= 128 && A("front")[j] < 128) { sT++; sN += rgbD(i, j); }
        // ผิวใต้กราม vs คอที่สร้าง
        const k2 = Math.min(h - 1, y + Math.round(F * .1)) * w + x;
        if (A("neck")[k2] > 128 && A("front")[k2] < 128 && A("keep")[k2] < 128) { const L = q => .299 * A("r")[q] + .587 * A("g")[q] + .114 * A("b")[q]; lT++; lN += Math.abs(L(i) - L(k2)); }
      }
      // แถบข้างกรามล่างที่ผมบัง
      for (let y = Math.round(earY); y < Math.round(C.chin.y); y++) for (let d = Math.round(F * .3); d < Math.round(F * .7); d++) { const x = Math.round(cx + sd * d); if (x < 0 || x >= w) continue; oT++; if (at("keep", x, y) > 128 && at("hair", x, y) > 128) oN++; }
      res.seam = Math.max(res.seam, sT ? sN / sT : 0); res.gapEdge = Math.max(res.gapEdge, gT ? gN / gT : 0); res.lumStep = Math.max(res.lumStep, lT ? lN / lT / 255 : 0);
      res.open = Math.max(res.open, oT ? 1 - oN / oT : 1);
      // ขอบนอกของเงาตัวคน (fg) ต่อแถว จากติ่งหูถึง 0.9 fw ใต้คาง: ขั้น/เส้นตรง
      const B = []; for (let y = Math.round(earY); y < Math.min(h, Math.round(C.chin.y + F * .9)); y++) { let x = Math.round(cx), lim = Math.round(F * 1.1); let e = -1; for (let d = 0; d < lim; d++) { const X = x + sd * d; if (X < 0 || X >= w) break; if (at("fg", X, y) > 128 && at("hair", X, y) < 100) e = d; else if (e >= 0 && d - e > 2) break; } B.push(e); }
      let run = 0, best = 0; for (let k = 1; k < B.length; k++) { if (B[k] < 0 || B[k - 1] < 0) { run = 0; continue; } const dj = Math.abs(B[k] - B[k - 1]); res.jump = Math.max(res.jump, dj / F); if (dj === 0) { run++; best = Math.max(best, run); } else run = 0; }
      res.straight = Math.max(res.straight, best / F);
    }
    // หูถูกตัดเป็นเส้นตรง: ขอบนอกของชั้นศีรษะ (keep, ไม่ใช่ผม) ระดับตาถึงมุมกราม ที่ตรงแนวตั้ง (±0.5 px) ต่อเนื่อง
    // และนอกเส้นนั้นภาพเดิมเป็นตัวคน แต่ผลลัพธ์เป็นฉาก — earCut = ความยาวสูงสุด / fw, cutPx = พิกเซลที่ถูกตัด / fw²
    res.earCut = 0; res.cutPx = 0;
    { let cut = 0; const yA = Math.max(0, Math.round(C.eyeY)), yB = Math.min(h, Math.round(C.chin.y - F * .1));
      for (const sd of [-1, 1]) { let run = 0, best = 0, prev = null;
        for (let y = yA; y < yB; y++) {
          let e = -1; for (let d = Math.round(F * .3); d < Math.round(F * .9); d++) { const X = Math.round(cx + sd * d); if (X < 0 || X >= w) break; if (at("keep", X, y) > 128) e = X; }
          if (e < 0 || at("hair", e, y) > 100) { run = 0; prev = null; continue; }
          let c = 0; for (let k = 1; k <= 3; k++) { const X = e + sd * k; if (at("srcA", X, y) > 128 && at("fg", X, y) < 128 && at("hair", X, y) < 100) c++; }
          cut += c;
          if (c >= 2 && prev != null && Math.abs(e - prev) <= .5) { run++; best = Math.max(best, run); } else if (c < 2) run = 0;
          prev = e;
        }
        res.earCut = Math.max(res.earCut, best / F);
      }
      res.cutPx = cut / (F * F);
    }
    for (const q of Object.keys(res)) res[q] = +(+res[q]).toFixed(4);
    return res;
  }
  /** ครอป + ตัวชี้วัดจากสถานะของ studio.js หลังรวมภาพ (ใช้ร่วมกับ evaluate) */
  function jawCropOf(S) {
    const n = S.W * S.H, frontA = new Float32Array(n), front = S.cache.front, cov = S.cache.cover; if (front) for (let i = 0; i < n; i++) frontA[i] = front[i * 4 + 3] / 255;
    let neckA = S.cache.neck ? S.cache.neck.alpha : null;
    if (cov) { neckA = null; for (let i = 0; i < n; i++) { const a = cov.alpha[i]; if (a > 0) frontA[i] = Math.max(frontA[i], a); } }
    return jawCrop({ out: S.out, fg: S.fgAlpha, keepA: S.keepA, srcA: S.alpha, hair: S.layers.hair, neckA, frontA, src: S.px, W: S.W, H: S.H, face: S.face });
  }
  /**
   * ตรวจรูปติดบัตรตามข้อกำหนดทั่วไป (ค่าประมาณ ไม่ใช่การรับรองของหน่วยงาน) — ฟังก์ชันล้วน ทดสอบใน Node
   *  px/alpha = รูปติดบัตร RGBA และ alpha ของตัวคน (พิกัดเดียวกัน W×H), face = { cx, eyeY, chinY, fw } ในพิกัดรูป, size = { w, h } ซม.
   * ข้อที่ตรวจ: size (พิกเซลตรงขนาดที่ dpi), head (กระหม่อมถึงคาง 50–75% ของความสูง), top (ที่เหนือศีรษะ 3–20%), center,
   *  bg (ฉากหลังเรียบ: ส่วนเบี่ยงเบน RGB < 10 และเห็นฉาก ≥ 5%), exposure (ความสว่างผิวหน้า 95–215, สว่าง/มืดจนสุด < 3%), outfit (ไม่มีชุดจำลอง)
   * คืน { items: [{ k, ok, v }], pass, icao } — icao = ขนาด 3.5×4.5 ซม. (หนังสือเดินทางใช้ศีรษะ 71–80%)
   */
  function idSpecCheck({ px, alpha, W, H, face, size, dpi = 300, outfit = false }) {
    const items = [], add = (k, ok, v) => items.push({ k, ok: !!ok, v });
    const ew = Math.round(size.w / 2.54 * dpi), eh = Math.round(size.h / 2.54 * dpi);
    add("size", Math.abs(W - ew) <= 1 && Math.abs(H - eh) <= 1, { w: W, h: H, cw: size.w.toFixed(1), ch: size.h.toFixed(1) });
    const cx = Math.round(face.cx), band = Math.max(2, Math.round(face.fw * .2)); let crown = -1;
    for (let y = 0; y < H && crown < 0; y++) { let c = 0, t = 0; for (let x = Math.max(0, cx - band); x <= Math.min(W - 1, cx + band); x++) { t++; if (alpha[y * W + x] > .5) c++; } if (t && c / t > .3) crown = y; }
    const headP = crown >= 0 ? (face.chinY - crown) / H : NaN, topP = crown >= 0 ? crown / H : NaN;
    add("head", headP >= .5 && headP <= .75, { p: Number.isFinite(headP) ? Math.round(headP * 100) : "?", lo: 50, hi: 75 });
    add("top", topP >= .03 && topP <= .2, { p: Number.isFinite(topP) ? Math.round(topP * 100) : 0 });
    add("center", Math.abs(face.cx - W / 2) / W < .05);
    let n = 0; const s = [0, 0, 0], s2 = [0, 0, 0];
    for (let i = 0; i < W * H; i++) { if (alpha[i] >= .02) continue; n++; for (let c = 0; c < 3; c++) { const v = px[i * 4 + c]; s[c] += v; s2[c] += v * v; } }
    const sd = n ? Math.sqrt([0, 1, 2].reduce((t, c) => t + Math.max(0, s2[c] / n - (s[c] / n) ** 2), 0) / 3) : NaN;
    add("bg", n >= W * H * .05 && sd < 10, { sd: Number.isFinite(sd) ? sd.toFixed(1) : "?" });
    let fl = 0, fn = 0, clip = 0; const x0 = Math.max(0, Math.round(face.cx - face.fw * .3)), x1 = Math.min(W, Math.round(face.cx + face.fw * .3)), y0 = Math.max(0, Math.round(face.eyeY)), y1 = Math.min(H, Math.round(face.eyeY + (face.chinY - face.eyeY) * .7));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x, l = lum(px, i); fl += l; fn++; if (l >= 250 || l <= 8) clip++; }
    const fL = fn ? fl / fn : NaN, cp = fn ? 100 * clip / fn : 0;
    add("exposure", fL >= 95 && fL <= 215 && cp < 3, { l: Number.isFinite(fL) ? Math.round(fL) : "?", c: cp.toFixed(1) });
    add("outfit", !outfit);
    return { items, pass: items.every(i => i.ok), icao: size.w === 3.5 && size.h === 4.5 };
  }
  /**
   * ตรวจชุดบนรูปติดบัตรของตู้ถ่ายรูป (photobooth.js renderIdPhoto: วางชุดภาพวาดใต้คาง แล้ววาดศีรษะทับเหนือเส้น clipY)
   *  pa = alpha ของตัวคน, oa = alpha ของชุด (พิกัดรูปติดบัตร W×H), face = { cx, eyeY, chinY, fw } ในพิกัดรูป, clipY = เส้นที่ศีรษะถูกวาดทับ
   *  hairCut = ความยาวที่ตัวคน (ผม/บ่า) นอกช่วงกรามถูกชุดตัดเป็นเส้นตรงที่ clipY / fw
   *  hole    = % ช่องฉากหลังที่ถูกล้อมด้วยตัวคน/ชุด ในแถบคอ (คาง → 0.8 หน้าใต้คาง, |dx| < 0.6 หน้า) — ช่องขาว/บากระหว่างคอกับคอเสื้อ
   *  leftover= เสื้อเดิมที่โผล่นอกชุด (ตัวคนแต่ไม่ใช่ชุด ใต้คาง 0.3 หน้า นอกแถบคอ) / fw²
   * คืน { pass, fails, m } — เกณฑ์ BOOTH_LIMITS ตั้งจากชุด dev (ACCURACY.md §11b)
   */
  const BOOTH_LIMITS = { hairCut: .12, hole: 1.5, leftover: .05 };
  function boothCheck({ pa, oa, W, H, face, clipY, L = BOOTH_LIMITS }) {
    const fw = face.fw, cx = face.cx, y = Math.round(clipY);
    let cut = 0;
    if (y > 2 && y < H - 3) for (let x = 0; x < W; x++) { if (Math.abs(x - cx) < fw * .45) continue; if (pa[(y - 2) * W + x] > .5 && oa[(y + 2) * W + x] > .5) cut++; }
    let hole = 0, band = 0;
    for (let yy = Math.max(0, Math.round(face.chinY)); yy < Math.min(H, Math.round(face.chinY + fw * .8)); yy++) {
      const xa = Math.max(0, Math.round(cx - fw * .6)), xb = Math.min(W - 1, Math.round(cx + fw * .6)); let l = -1, r = -1;
      for (let x = xa; x <= xb; x++) if (pa[yy * W + x] > .5 || oa[yy * W + x] > .5) { if (l < 0) l = x; r = x; }
      band += xb - xa + 1; if (l < 0) continue;
      for (let x = l; x <= r; x++) if (pa[yy * W + x] <= .5 && oa[yy * W + x] <= .5) hole++;
    }
    let left = 0;
    for (let yy = Math.max(0, Math.round(face.chinY + fw * .3)); yy < H; yy++) for (let x = 0; x < W; x++) { if (Math.abs(x - cx) < fw * .35) continue; const i = yy * W + x; if (pa[i] > .5 && oa[i] < .3) left++; }
    const m = { hairCut: +(cut / fw).toFixed(3), hole: band ? +(100 * hole / band).toFixed(2) : 0, leftover: +(left / (fw * fw)).toFixed(3) };
    const fails = boothVerdict(m, L);
    return { pass: !fails.length, fails, m };
  }
  function boothVerdict(m, L = BOOTH_LIMITS) { const f = []; if (m.hairCut > L.hairCut) f.push("hair-cut"); if (m.hole > L.hole) f.push("neck-gap"); if (m.leftover > L.leftover) f.push("leftover"); return f; }
  /** เกณฑ์ผ่าน (ปรับเทียบกับการดูภาพ) */
  const LIMITS = { hairCutRows: 3, neckBgPct: 1.2, neckDE: 16, neckL: [.2, 1.2], neckWide: .75, neckLen: .75, bgChunk: .03, hemRough: .045, bodyWide: 3.75, hemHolePct: .3, shoulderDy: .2, shoulderRaised: .25, accessory: .012, skinIsland: .012, handsOrphan: 0, floatingHand: .02, neckJoinGap: 2.5, neckJoinFringe: 2, neckFlatArea: .06, neckFlatCv: .045, stray: .01, leftover: .12, neckNotch: .25, faceIsland: .004, neckRelArea: .05, neckRelL: .45, neckRelTex: .45, jawBlob: .015 }; // jawBlob: ตั้งไว้ล่วงหน้า (ก้อนทึบ ≥ 1.5% ของพื้นที่หน้า²) ไม่ได้ปรับตามชุดภาพ
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
    if (m.jawBlob && m.jawBlob.area > L.jawBlob) f.push("jaw-blob");
    if (m.stray > L.stray) f.push("stray");
    if (m.leftover > L.leftover) f.push("leftover");
    return f;
  }

  /**
   * ประตูที่เรียนรู้ (learned gate): logistic regression ขนาดเล็กบนตัวชี้วัด QA + ตัวชี้วัดรอยต่อกราม/หู (jawFeatures)
   * ฝึกบนชุด dev (คนละคนกับชุด test) ประเมินบนชุด test ครั้งเดียว — วิธีฝึกและผลอยู่ใน ACCURACY.md §11 และ tests/bench/studio.bench.mjs (stage 2b)
   * confidence(m, jf, { cover }) -> { p: ความน่าจะเป็นที่ "ไม่มีรอยให้เห็น", t: เกณฑ์, show: p ≥ t }
   */
  const GATE_FEATS = {
    nFails: (m) => verdict(m).length, revealed: (m) => m.revealed || 0, bodyWide: (m) => m.hem ? m.hem.wide : 0, jawCover: (m) => m.jawCover || 0,
    neckL: (m) => m.neck ? Math.abs(Math.log(m.neck.lRatio || 1)) : 0, open: (m, j) => j.open, gapEdge: (m, j) => j.gapEdge, earCut: (m, j) => j.earCut,
    cutPx: (m, j) => j.cutPx, jump: (m, j) => j.jump, straight: (m, j) => j.straight, cover: (m, j, c) => c ? 1 : 0
  };
  // ตัวจำแนก LR บนคุณลักษณะข้างบน (ฝึกบน dev, ตรวจไขว้แยกตามบุคคล) ได้ AUC 0.40–0.47 = แยกไม่ได้ จึงไม่ใช้ตัดสินรายภาพ
  // สิ่งที่ใช้ = ความน่าจะเป็นที่ปรับเทียบแล้วตามกลุ่ม (ผ่านประตูกฎ × แบบคอสูง/แบบเดิม) วัดบนชุด dev ด้วยผู้ประเมินคนที่สอง
  // เกณฑ์แสดงชุดเองโดยไม่ต้องกด (t) = 0.5: ทุกกลุ่มต่ำกว่าเกณฑ์ หน้าเว็บจึงเริ่มที่แบบไม่ใส่ชุดเสมอ
  let GATE = { kind: "calibrated", t: .5, clean: { cover: .45, plain: .41 }, n: { cover: 53, plain: 17 }, source: "dev split, second rater, round 10" };
  function gateScore(m, jf, { cover = false } = {}, G = GATE) {
    let z = G.b; G.feats.forEach((k, i) => { z += G.w[i] * ((GATE_FEATS[k](m, jf || {}, cover) - G.mu[i]) / G.sd[i]); });
    return 1 / (1 + Math.exp(-z)); // ความน่าจะเป็นที่มีรอย (defect)
  }
  function confidence(m, jf, opt = {}, G = GATE) {
    if (!G || !m) return null;
    const p = G.kind === "calibrated" ? (verdict(m).length ? null : G.clean[opt.cover ? "cover" : "plain"]) : 1 - gateScore(m, jf, opt, G);
    return p == null ? null : { p: +p.toFixed(3), t: G.t, show: p >= G.t };
  }
  /** เลือกชุดให้เองตอนเปิดรูปได้หรือไม่: เฉพาะเมื่อมีกลุ่มที่ความน่าจะเป็น "ไม่มีรอย" ถึงเกณฑ์ */
  const defaultOutfitAllowed = (G = GATE) => !!G && (G.kind !== "calibrated" || Math.max(...Object.values(G.clean)) >= G.t);
  /** ประเมินสถานะของ studio.js (window.__studio.state) หลังรวมภาพ — ต้องมี StudioCore */
  /** ชุดตรวจเร็วสำหรับหน้าเว็บ (หลังรวมภาพทุกครั้ง): รอยต่อคอ/กราม เศษขอบหน้า คอเรียบ/มืด เกาะหลุด รูในคอ — ไม่รวมตัวตรวจที่ช้า (ผม ชายชุด ไหล่ มือ) */
  // jawBlob ไม่อยู่ในชุดเร็วของหน้าเว็บ: เตือนผิดบ่อย (ผมสีเข้ม/เงาใกล้กราม) — ใช้ในชุดทดสอบ/โหมดรายงานเท่านั้น
  const FAST = new Set(["neck", "neckJoin", "neckNotch", "faceIsland", "neckRel", "stray"]);
  function evaluate(S, SC = root.StudioCore, { fast = false, gate = false } = {}) {
    if (gate) fast = false;
    const W = S.W, H = S.H, n = W * H, f = S.face, L = S.layers, fit = S.cache.fit, front = S.cache.front, neck = S.cache.neck;
    const frontA = new Float32Array(n); if (front) for (let i = 0; i < n; i++) frontA[i] = front[i * 4 + 3] / 255;
    let neckA = neck ? neck.alpha : new Float32Array(n); const keepA = S.keepA, fg = S.fgAlpha, src = S.px, out = S.out, labOf = SC.rgbToLab;
    // แบบคอสูง: ผ้าคอเต่า (S.cache.cover) เป็นส่วนของชุด และไม่มีคอที่สร้างแสดง (studio.js วางเฉพาะผ้า)
    const cov = S.cache.cover; if (cov) { neckA = new Float32Array(n); for (let i = 0; i < n; i++) { const a = cov.alpha[i]; if (a > 0) frontA[i] = Math.max(frontA[i], a); } }
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
    if (want("jawBlob")) m.jawBlob = jawBlob({ out, src, srcA: S.alpha, fg, frontA, hair: L.hair, W, H, face: f, mono });
    if (want("stray")) m.stray = strayParts({ fg, W, H, face: f });
    if (want("jawCover")) m.jawCover = jawCover({ keepA, hair: L.hair, W, H, face: f });
    if (want("revealed")) m.revealed = revealed({ fg, srcA: S.alpha, keepA, W, H, face: f, SC });
    if (want("leftover")) m.leftover = leftover({ keepA, src, W, H, face: f, hands: S.handsUsed || S.hands, hair: L.hair });
    const fails = verdict(m);
    return { pass: !fails.length, fails, m };
  }

  /**
   * ตรวจรูปชุดที่ผู้ใช้ถ่ายเอง (วางราบบนพื้นเรียบ) ก่อนใช้เป็นเทมเพลต — ฟังก์ชันล้วน ทดสอบได้ใน Node
   *  px/alpha = ภาพเดิม RGBA และ matte ของชุด (ขนาด W×H), anchors = SC.templateAnchors(...) หรือ null, labOf = rgbToLab
   *  hasBg = false เมื่อเป็น PNG พื้นใส (ข้ามการตรวจฉาก/คอนทราสต์)
   * คืน { ok, issues: [{ k, level: "fail"|"warn" }], m } — k: notFound, tooSmall, fillsFrame, cutOff, lowContrast, unevenBg,
   *  busyBg, exposure, pieces, tilted, folds (คำแนะนำต่อ k อยู่ใน studio.js)
   */
  function garmentPhotoCheck({ px, alpha, W, H, anchors, labOf, hasBg = true }) {
    const n = W * H, m = {}, issues = [], add = (k, level) => issues.push({ k, level });
    let cov = 0; for (let i = 0; i < n; i++) if (alpha[i] > .5) cov++;
    m.coverage = +(cov / n).toFixed(3);
    if (!anchors || cov < 50) { add("notFound", "fail"); return { ok: false, issues, m }; }
    if (m.coverage < .08) add("tooSmall", "warn");
    if (hasBg && m.coverage > .88) add("fillsFrame", "fail");
    // ชุดชนขอบภาพ (ถูกตัด): สัดส่วนพิกเซลชุดบนแถบขอบ 1% ด้านบน/ซ้าย/ขวา (ล่าง = ชายเสื้อ เตือนอย่างเดียว)
    const b = Math.max(1, Math.round(Math.min(W, H) * .01)), edge = side => { let c = 0, t = 0; const L = side === "t" || side === "b" ? W : H;
      for (let k = 0; k < L; k++) for (let d = 0; d < b; d++) { const x = side === "l" ? d : side === "r" ? W - 1 - d : k, y = side === "t" ? d : side === "b" ? H - 1 - d : k; t++; if (alpha[y * W + x] > .5) c++; } return c / t; };
    if (hasBg) { // PNG พื้นใสถูกครอปชิดตัวชุดแล้ว: ไม่ตรวจขอบ
      m.edge = { t: +edge("t").toFixed(3), l: +edge("l").toFixed(3), r: +edge("r").toFixed(3), b: +edge("b").toFixed(3) };
      if (m.edge.t > .02 || m.edge.l > .02 || m.edge.r > .02) add("cutOff", "fail"); else if (m.edge.b > .05) add("cutOff", "warn");
    }
    // สถิติ L*a*b* ของชุด (alpha > .9) และฉาก (alpha < .1) จากกริดหยาบ
    const step = Math.max(1, Math.round(Math.sqrt(n / 40000))), G = [0, 0, 0, 0], B = [0, 0, 0, 0], gl = [], quad = [[0, 0], [0, 0], [0, 0], [0, 0]];
    let clip = 0;
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
      const i = y * W + x, a = alpha[i], q = labOf(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
      if (a > .9) { G[0] += q[0]; G[1] += q[1]; G[2] += q[2]; G[3]++; gl.push(q[0]); if (q[0] > 97 || q[0] < 3) clip++; }
      else if (a < .1) { B[0] += q[0]; B[1] += q[1]; B[2] += q[2]; B[3]++; const k = (y < H / 2 ? 0 : 2) + (x < W / 2 ? 0 : 1); quad[k][0] += q[0]; quad[k][1]++; }
    }
    if (G[3]) { m.clipped = +(clip / G[3]).toFixed(3); if (m.clipped > .15) add("exposure", "warn"); }
    if (hasBg && G[3] && B[3] > 50) {
      const g = G.slice(0, 3).map(v => v / G[3]), bg = B.slice(0, 3).map(v => v / B[3]);
      m.contrast = +Math.hypot(g[0] - bg[0], g[1] - bg[1], g[2] - bg[2]).toFixed(1);
      if (m.contrast < 12) add("lowContrast", "fail"); else if (m.contrast < 20) add("lowContrast", "warn");
      const qm = quad.filter(q => q[1] > 20).map(q => q[0] / q[1]);
      m.bgRange = qm.length >= 2 ? +(Math.max(...qm) - Math.min(...qm)).toFixed(1) : 0;
      if (m.bgRange > 18) add("unevenBg", "warn");
      // ฉากลาย/ไม่เรียบ: ส่วนเบี่ยงเบน L ของฉาก รอบค่าเฉลี่ยของแต่ละแถว (ไม่นับการไล่แสงช้า ๆ)
      let s2 = 0, c2 = 0; for (let y = 0; y < H; y += step) { let s = 0, c = 0; const row = []; for (let x = 0; x < W; x += step) { const i = y * W + x; if (alpha[i] < .1) { const l = labOf(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])[0]; row.push(l); s += l; c++; } } if (c < 5) continue; const mu = s / c; for (const l of row) { s2 += (l - mu) ** 2; c2++; } }
      m.bgStd = c2 ? +Math.sqrt(s2 / c2).toFixed(1) : 0;
      if (m.bgStd > 5) add("busyBg", "warn");
    }
    // ชิ้นส่วนแยก: ก้อน alpha > .5 นอกก้อนใหญ่สุด ที่ใหญ่กว่า 0.5% ของชุด (ฉากลาย/เงาที่ถูกตัดเป็นชุด)
    { const lab = new Int32Array(n).fill(-1), sizes = []; for (let s0 = 0; s0 < n; s0++) { if (alpha[s0] <= .5 || lab[s0] >= 0) continue; const st = [s0], id = sizes.length; lab[s0] = id; let c = 0; while (st.length) { const i = st.pop(), x = i % W; c++; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < n && alpha[j] > .5 && lab[j] < 0) { lab[j] = id; st.push(j); } } sizes.push(c); }
      const big = Math.max(...sizes); m.pieces = sizes.filter(v => v !== big && v > cov * .005).length; if (m.pieces > 0) add("pieces", "warn"); }
    // วางเอียง: ไหล่สองข้างต่างระดับ หรือช่องคอไม่อยู่กลางไหล่ (หน่วยความกว้างไหล่)
    const A = k => anchors.find(p => p.k === k), l = A("l"), r = A("r"), nk = A("neck");
    if (l && r && nk) { const sw = Math.max(1, r.x - l.x); m.tilt = +(Math.abs(l.y - r.y) / sw).toFixed(3); m.offCentre = +(Math.abs(nk.x - (l.x + r.x) / 2) / sw).toFixed(3); if (m.tilt > .08 || m.offCentre > .08) add("tilted", m.tilt > .15 || m.offCentre > .15 ? "fail" : "warn"); }
    // รอยพับ/เงาแรง: ความแปรปรวนของความสว่างเฉลี่ยเฉพาะที่ (ไม่ใช่ลายผ้าละเอียด) — CV ของ L ในชุดหลังเฉลี่ยบล็อก
    if (gl.length > 100) { const bs = Math.max(4, Math.round(Math.min(W, H) / 24)), blk = new Map(); for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) { const i = y * W + x; if (alpha[i] <= .9) continue; const k = ((y / bs) | 0) * 9999 + ((x / bs) | 0), v = blk.get(k) || [0, 0]; v[0] += labOf(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])[0]; v[1]++; blk.set(k, v); }
      const mv = [...blk.values()].filter(v => v[1] >= 4).map(v => v[0] / v[1]); if (mv.length > 8) { const mu = mv.reduce((a, b) => a + b, 0) / mv.length, sd = Math.sqrt(mv.reduce((a, b) => a + (b - mu) ** 2, 0) / mv.length); m.shadeCv = +(sd / Math.max(5, mu)).toFixed(3); if (m.shadeCv > .2) add("folds", "warn"); } }
    return { ok: !issues.some(i => i.level === "fail"), issues, m };
  }

  /**
   * ตรวจความเหมาะสมของรูปก่อนเสนอชุดตัวอย่าง (pre-flight) — ฟังก์ชันล้วน ทดสอบใน Node
   *  px = RGBA, alpha = matte ตัวคน, hair/neck/body = ชั้นจาก StudioCore.personLayers (0..1), face = { cx, chinX?, eyeY, chinY, fw, angle?, P? (68 จุด) }
   * ข้อที่ตรวจ (ค่าวัดใน m):
   *  frontal  : หน้าตรง — yaw = ระยะปลายจมูกจากกึ่งกลางตา / ระยะห่างตา, tilt = มุมเอียงศีรษะ (องศา); ไม่มี landmark = ตรวจไม่ได้ (ok = null)
   *  neck     : เห็นคอ — สัดส่วนแถบใต้คาง (คาง → 0.35 หน้า, |dx| < 0.3 หน้า) ที่เป็นคอ/ผิว
   *  hair     : ผมไม่คลุมไหล่ — พื้นที่ผมใต้คาง 0.2 หน้า นอกแถบคอ (|dx| > 0.45 หน้า) / หน้า² และผมข้างกราม (แถบ 0.35–0.6 หน้า) สัดส่วน
   *  clothes  : เสื้อเรียบ — ความแปรปรวนความสว่างเฉพาะที่ (ลาย/เครื่องประดับ) บนเสื้อ ช่วง 0.5–1.6 หน้าใต้คาง
   *  framing  : เห็นไหล่ในภาพ — ภาพยาวลงไปถึง 1 หน้าใต้คาง
   * เกณฑ์ PRE_LIMITS ตั้งจากชุด dev (27 คน) แล้วประเมินบน test ครั้งเดียว (tests/bench/studio-tables.mjs, ACCURACY.md §11 รอบ 11):
   *  บน dev แยกได้ (คนที่ไม่ผ่าน: ภาพชุด 52/56 มีรอย, ผ่าน: 18/52) แต่บน test แยกไม่ได้ (37/76 เทียบ 31/64) — จึงเป็น "คำแนะนำ" เท่านั้น ไม่ใช้กันชุด
   *  jawHair (ผมข้างกราม) วัดและรายงาน แต่ไม่ใช้ตัดสิน (บน dev ไม่แยก) คืน { ok, items: [{ k, ok, v }], m }
   */
  const PRE_LIMITS = { yaw: .12, tilt: 6, neck: .25, hairSh: .1, clothTex: 20, framing: 1 };
  function photoSuitability({ px, alpha, hair, neck, W, H, face, L = PRE_LIMITS }) {
    const fw = face.fw, cx = face.chinX != null ? face.chinX : face.cx, cy = face.chinY, m = {}, items = [], add = (k, ok, v) => items.push({ k, ok, v });
    const A = i => alpha[i] > .5, at = (x, y) => Math.round(y) * W + Math.round(x);
    // frontal
    if (face.P && face.P.length >= 68) {
      const P = face.P, c = a => ({ x: a.reduce((s, p) => s + p.x, 0) / a.length, y: a.reduce((s, p) => s + p.y, 0) / a.length }), e1 = c(P.slice(36, 42)), e2 = c(P.slice(42, 48)), ed = Math.hypot(e2.x - e1.x, e2.y - e1.y) || 1;
      m.yaw = +((P[30].x - (e1.x + e2.x) / 2) / ed).toFixed(3); m.tilt = +(Math.abs((face.angle || 0) * 180 / Math.PI)).toFixed(1);
      add("frontal", Math.abs(m.yaw) <= L.yaw && m.tilt <= L.tilt, { yaw: m.yaw, tilt: m.tilt });
    } else add("frontal", null, {});
    // neck visible
    let nk = 0, nt = 0;
    for (let y = Math.round(cy + fw * .03); y < Math.min(H, cy + fw * .35); y++) for (let x = Math.max(0, Math.round(cx - fw * .3)); x <= Math.min(W - 1, cx + fw * .3); x++) { const i = y * W + x; nt++; if (A(i) && neck[i] > .5 && hair[i] < .5) nk++; }
    m.neck = nt ? +(nk / nt).toFixed(3) : 0;
    add("neck", m.neck >= L.neck, { p: Math.round(100 * m.neck) });
    // hair on the shoulders / beside the jaw
    let hs = 0; for (let y = Math.max(0, Math.round(cy + fw * .2)); y < H; y++) for (let x = 0; x < W; x++) { if (Math.abs(x - cx) <= fw * .45) continue; const i = y * W + x; if (A(i) && hair[i] > .5) hs++; }
    m.hairSh = +(hs / (fw * fw)).toFixed(3);
    let jh = [0, 0], jt = [0, 0];
    for (let y = Math.max(0, Math.round(cy - fw * .25)); y < Math.min(H, cy + fw * .2); y++) for (const s of [0, 1]) for (let d = Math.round(fw * .35); d <= fw * .6; d++) { const x = Math.round(cx + (s ? d : -d)); if (x < 0 || x >= W) continue; const i = y * W + x; jt[s]++; if (A(i) && hair[i] > .5) jh[s]++; }
    m.jawHair = +Math.min(jt[0] ? jh[0] / jt[0] : 1, jt[1] ? jh[1] / jt[1] : 1).toFixed(3); // ด้านที่เปิดกว่า
    add("hair", m.hairSh <= L.hairSh, { a: m.hairSh, j: Math.round(100 * m.jawHair) });
    // plain clothes: ค่าเฉลี่ย |ความสว่าง − ค่าเฉลี่ยบล็อก 3×3| บนเสื้อ (ไม่ใช่ผม/คอ)
    const lum = i => .299 * px[i * 4] + .587 * px[i * 4 + 1] + .114 * px[i * 4 + 2], st = Math.max(1, Math.round(fw / 60));
    let tex = 0, tn = 0;
    for (let y = Math.round(cy + fw * .5); y < Math.min(H - st, cy + fw * 1.6); y += st) for (let x = Math.max(st, Math.round(cx - fw * 1.3)); x < Math.min(W - st, cx + fw * 1.3); x += st) {
      const i = y * W + x; if (!(alpha[i] > .9) || hair[i] > .3 || neck[i] > .3) continue;
      let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += lum(at(x + dx * st, y + dy * st));
      tex += Math.abs(lum(i) - s / 9); tn++;
    }
    m.clothTex = tn > 30 ? +(tex / tn).toFixed(2) : 0;
    add("clothes", m.clothTex <= L.clothTex, { t: m.clothTex });
    m.framing = +((H - cy) / fw).toFixed(2);
    add("framing", m.framing >= L.framing, { r: m.framing });
    return { ok: items.every(i => i.ok !== false), items, m };
  }

  /**
   * ตรวจรูปติดบัตรแบบไม่ใส่ชุดก่อนพิมพ์ (ขั้น "ตรวจก่อนพิมพ์" ของตู้ถ่ายรูป และ studio) — ฟังก์ชันล้วน ทดสอบใน Node
   *  pa = alpha ของตัวคนในพิกัดรูปติดบัตร W×H, face = { cx, chinY, fw } ในพิกัดรูป
   * หา: islands = เศษที่ไม่ต่อกับตัวคน (ธง เก้าอี้ ฉากที่ matte ติดมา) ≥ 0.15% ของรูป
   *     cuts    = ลำตัวถูกตัดเป็นเส้นตรง: bottom = ลำตัวจบเหนือขอบล่างของรูป (ภาพต้นฉบับสั้นกว่ากรอบ หรือ matte ตัดตรง),
   *               left/right = ขอบตัวคนเป็นเส้นตั้งตรงยาวที่ไม่ใช่ขอบรูป (ขอบภาพต้นฉบับอยู่ในกรอบ)
   * คืน { islands: [{ x, y, w, h, area }], cuts: [{ k, x0, y0, x1, y1 }], ok }
   */
  function idLeftovers({ pa, W, H, face }) {
    const n = W * H, on = new Uint8Array(n); for (let i = 0; i < n; i++) on[i] = pa[i] > .5 ? 1 : 0;
    const lab = new Int32Array(n).fill(-1), comps = [];
    for (let s0 = 0; s0 < n; s0++) {
      if (!on[s0] || lab[s0] >= 0) continue;
      const id = comps.length, st = [s0], c = { area: 0, x0: W, y0: H, x1: -1, y1: -1 }; lab[s0] = id;
      while (st.length) { const i = st.pop(), x = i % W, y = (i - x) / W; c.area++; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < n && on[j] && lab[j] < 0) { lab[j] = id; st.push(j); } }
      comps.push(c);
    }
    const islands = [], cuts = [];
    if (!comps.length) return { islands, cuts: [{ k: "empty", x0: 0, y0: 0, x1: W, y1: H }], ok: false };
    let main = 0; for (let k = 1; k < comps.length; k++) if (comps[k].area > comps[main].area) main = k;
    comps.forEach((c, k) => { if (k !== main && c.area >= n * .0015) islands.push({ x: c.x0, y: c.y0, w: c.x1 - c.x0 + 1, h: c.y1 - c.y0 + 1, area: c.area }); });
    const M = i => lab[i] === main, fw = face.fw, yT = Math.round(Math.min(H - 1, face.chinY + fw * .3));
    // ลำตัวจบเหนือขอบล่าง: ความกว้างตัวคนแถวล่างสุดเทียบกับแถวที่กว้างที่สุดใต้คาง
    const rowW = y => { let c = 0; for (let x = 0; x < W; x++) if (M(y * W + x)) c++; return c; };
    let wMax = 0, yMax = yT; for (let y = yT; y < H; y++) { const w = rowW(y); if (w > wMax) { wMax = w; yMax = y; } }
    if (wMax > fw * .8 && rowW(H - 1) < wMax * .5) { let y = H - 1; while (y > yMax && rowW(y) < wMax * .5) y--; cuts.push({ k: "bottom", x0: 0, y0: y + 1, x1: W - 1, y1: y + 1 }); }
    // ขอบตั้งตรงยาว (≥ 0.4 หน้า) ที่ไม่ใช่ขอบรูป ใต้คาง: คอลัมน์แรก/สุดท้ายของตัวคนคงที่ ±1 พิกเซลหลายแถวติดกัน
    for (const side of ["left", "right"]) {
      let run = 0, best = 0, prev = null, y0 = 0, bestY = 0, bestX = 0;
      for (let y = yT; y < H; y++) {
        let e = -1; if (side === "left") { for (let x = 0; x < W; x++) if (M(y * W + x)) { e = x; break; } } else { for (let x = W - 1; x >= 0; x--) if (M(y * W + x)) { e = x; break; } }
        const inner = e > 1 && e < W - 2;
        // ทั้งช่วงต้องอยู่ห่างจากคอลัมน์แรกของช่วงไม่เกิน 1 พิกเซล (ขอบแขนจริงเอียงทีละน้อย ไม่ตรงเป๊ะ)
        if (inner && prev != null && Math.abs(e - prev) <= 1) { run++; if (run > best) { best = run; bestY = y0; bestX = prev; } } else { run = 0; y0 = y; prev = inner ? e : null; }
      }
      if (best >= fw * .4) cuts.push({ k: side, x0: bestX, y0: bestY, x1: bestX, y1: bestY + best });
    }
    return { islands, cuts, ok: !islands.length && !cuts.length };
  }

  const api = { idLeftovers, photoSuitability, PRE_LIMITS, garmentPhotoCheck, revealed, jawCover, jawCrop, jawCropOf, jawFeatures, JC, idSpecCheck, boothCheck, boothVerdict, BOOTH_LIMITS, GATE_FEATS, gateScore, confidence, defaultOutfitAllowed, get GATE() { return GATE; }, set GATE(g) { GATE = g; }, hairCut, neckNotch, faceIsland, neckRel, jawBlob, neckCheck, bgChunk, hemCheck, shoulderCheck, accessory, skinIsland, handsCheck, floatingHand, neckJoin, neckFlat, strayParts, leftover, verdict, evaluate, LIMITS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.StudioQA = api;
})(typeof window !== "undefined" ? window : globalThis);
