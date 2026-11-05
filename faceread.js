/* โหงวเฮ้ง AI — อ่านโหงวเฮ้งจากจุดบนใบหน้า 68 จุด (face-api) เพื่อความบันเทิง
   ประมวลผลในเบราว์เซอร์ทั้งหมด ไม่ส่งและไม่บันทึกภาพ
   ส่วนแรก (FRCore) เป็นฟังก์ชันล้วน ทดสอบใน Node ได้:  const FR = require("./faceread.js")
   ส่วนหลัง (UI) ทำงานเฉพาะในเบราว์เซอร์

   ดัชนีจุด 68 จุด (iBUG/dlib) ในภาพ: 0–16 กรอบหน้า (0 = ขอบซ้ายของภาพ, 8 = ปลายคาง), 17–21 คิ้วซ้ายภาพ, 22–26 คิ้วขวาภาพ,
   27–30 สันจมูก (30 = ปลายจมูก), 31–35 ฐานจมูก/ปีกจมูก (33 = กึ่งกลาง), 36–41 ตาซ้ายภาพ, 42–47 ตาขวาภาพ,
   48–59 ริมฝีปากนอก (48/54 = มุมปาก, 51 = ขอบบนกลาง, 57 = ขอบล่างกลาง), 60–67 ริมฝีปากใน (62 = บนใน, 66 = ล่างใน) */
(function (root) {
  "use strict";
  var KB = root.FR_KB || (typeof require === "function" ? require("./faceread-kb.js") : null);

  /* ================= เรขาคณิตพื้นฐาน ================= */
  var dist = function (a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); };
  var mid = function (a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  var meanPt = function (ps) { var x = 0, y = 0; ps.forEach(function (p) { x += p[0]; y += p[1]; }); return [x / ps.length, y / ps.length]; };
  var range = function (a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; };
  var pick = function (pts, idx) { return idx.map(function (i) { return pts[i]; }); };
  /** มุม (องศา) ที่จุด b ระหว่าง a–b–c */
  function angleAt(a, b, c) {
    var v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    var cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]) || 1);
    return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
  }
  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  var round = function (v, d) { var k = Math.pow(10, d == null ? 2 : d); return Math.round(v * k) / k; };

  /** กรอบอ้างอิง: จุดกึ่งกลางระหว่างตา, มุมเอียง (roll), ระยะระหว่างรูม่านตา (IPD) */
  function frame(pts) {
    var L = meanPt(pick(pts, range(36, 41))), R = meanPt(pick(pts, range(42, 47)));
    var theta = Math.atan2(R[1] - L[1], R[0] - L[0]);
    return { c: mid(L, R), theta: theta, ipd: dist(L, R) || 1, eyeL: L, eyeR: R };
  }
  /** แปลงจุดภาพ → พิกัดมาตรฐาน (หมุนให้ตาอยู่แนวนอน, หน่วย = IPD, จุดกำเนิด = กึ่งกลางระหว่างตา, y ชี้ลง) */
  function toAligned(F, p) {
    var dx = p[0] - F.c[0], dy = p[1] - F.c[1], c = Math.cos(-F.theta), s = Math.sin(-F.theta);
    return [(dx * c - dy * s) / F.ipd, (dx * s + dy * c) / F.ipd];
  }
  function toImage(F, q) {
    var x = q[0] * F.ipd, y = q[1] * F.ipd, c = Math.cos(F.theta), s = Math.sin(F.theta);
    return [x * c - y * s + F.c[0], x * s + y * c + F.c[1]];
  }
  function align(pts) { var F = frame(pts); return { F: F, a: pts.map(function (p) { return toAligned(F, p); }) }; }

  /** ท่าศีรษะ: roll (องศา), yaw (−1..1 ประมาณจากความไม่สมมาตรของระยะปลายจมูกถึงขอบหน้าสองข้าง) */
  function headPose(pts) {
    var A = align(pts), a = A.a;
    var dl = Math.abs(a[30][0] - (a[0][0] + a[1][0] + a[2][0]) / 3), dr = Math.abs((a[14][0] + a[15][0] + a[16][0]) / 3 - a[30][0]);
    return { roll: A.F.theta * 180 / Math.PI, yaw: (dl - dr) / (dl + dr || 1) };
  }

  /** เฉลี่ยจุดจากหลายเฟรม (ตัดเฟรมที่เบี่ยงจากค่ามัธยฐานมากที่สุด 20% ออก) */
  function averageLandmarks(list) {
    if (!list.length) return null;
    if (list.length === 1) return list[0].map(function (p) { return p.slice(); });
    var n = list[0].length;
    var med = range(0, n - 1).map(function (i) {
      var xs = list.map(function (l) { return l[i][0]; }).sort(function (a, b) { return a - b; });
      var ys = list.map(function (l) { return l[i][1]; }).sort(function (a, b) { return a - b; });
      var m = Math.floor(xs.length / 2); return [xs[m], ys[m]];
    });
    var scored = list.map(function (l) { var e = 0; for (var i = 0; i < n; i++) e += dist(l[i], med[i]); return { l: l, e: e }; })
      .sort(function (a, b) { return a.e - b.e; });
    var keep = scored.slice(0, Math.max(1, Math.ceil(scored.length * 0.8))).map(function (s) { return s.l; });
    return range(0, n - 1).map(function (i) { return meanPt(keep.map(function (l) { return l[i]; })); });
  }

  /* ================= แนวผม (ไม่มีในจุด 68 จุด) =================
     สุ่มสีผิวหน้าผากเหนือหว่างคิ้ว (YCbCr) แล้วไล่ขึ้นตามแนวตั้งฉากกับแนวตา
     จนแถบตัวอย่างมีสัดส่วนพิกเซลที่คล้ายผิวต่ำกว่า 45% ติดกัน 4 แถว = แนวผม
     ตรวจความสมเหตุสมผล: ความสูงหน้าผาก (คิ้ว→แนวผม) ต้องอยู่ 0.65–1.45 เท่าของส่วนกลาง (คิ้ว→ฐานจมูก)
     ถ้าไม่ผ่าน (หน้าม้า หมวก ศีรษะล้าน แสงไม่พอ) ใช้ค่ามาตรฐาน = ส่วนกลาง × 1.0 และระบุว่า "ประมาณการ" */
  var HAIR = { minRatio: 0.65, maxRatio: 1.45, fallbackRatio: 1.0, skinFrac: 0.45, run: 4, dC: 11, dY: 48 };
  function ycc(d, i) {
    var r = d[i], g = d[i + 1], b = d[i + 2];
    return [0.299 * r + 0.587 * g + 0.114 * b, 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, 128 + 0.5 * r - 0.418688 * g - 0.081312 * b];
  }
  function samplePx(img, x, y) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
    return ycc(img.data, (y * img.width + x) * 4);
  }
  function estimateHairline(img, pts) {
    var A = align(pts), F = A.F, a = A.a;
    var browY = meanPt(pick(a, range(17, 26)))[1], middle = a[33][1] - browY;
    var fallback = function (reason) {
      return { point: toImage(F, [a[27][0], browY - middle * HAIR.fallbackRatio]), upper: middle * HAIR.fallbackRatio, estimated: true, reason: reason };
    };
    if (!img || !img.data) return fallback("ไม่มีข้อมูลภาพ");
    var cx = (a[21][0] + a[22][0]) / 2, step = 1 / F.ipd; // 1 พิกเซลในหน่วย IPD
    // สีผิวอ้างอิง: บริเวณเหนือหว่างคิ้ว 0.12–0.3 IPD
    var ref = [], s, t, k;
    for (t = 0.12; t <= 0.3; t += 0.03) for (k = -0.2; k <= 0.2; k += 0.05) {
      var p = toImage(F, [cx + k, browY - t]); s = samplePx(img, p[0], p[1]); if (s) ref.push(s);
    }
    if (ref.length < 10) return fallback("ภาพไม่ครอบคลุมหน้าผาก");
    var r0 = [0, 1, 2].map(function (j) { return ref.reduce(function (q, v) { return q + v[j]; }, 0) / ref.length; });
    // ผิวทั่วไปมี Cb≈77–127, Cr≈133–173 ถ้าบริเวณนี้ไม่ใช่ผิว (เช่น หน้าม้าปิด) ใช้ค่ามาตรฐาน
    if (r0[1] < 70 || r0[1] > 135 || r0[2] < 128 || r0[2] > 180) return fallback("หน้าผากถูกปิดหรือแสงไม่พอ");
    var low = 0;
    for (t = 0.3; t < middle * HAIR.maxRatio + 0.2; t += step) {
      var hit = 0, tot = 0;
      for (k = -0.3; k <= 0.3001; k += 0.06) {
        var q = toImage(F, [cx + k, browY - t]); s = samplePx(img, q[0], q[1]);
        if (!s) { tot = 0; break; }
        tot++;
        if (Math.abs(s[1] - r0[1]) < HAIR.dC && Math.abs(s[2] - r0[2]) < HAIR.dC && Math.abs(s[0] - r0[0]) < HAIR.dY) hit++;
      }
      if (!tot) return fallback("แนวผมอยู่นอกภาพ");
      if (hit / tot < HAIR.skinFrac) { if (++low >= HAIR.run) { var up = t - (HAIR.run - 1) * step; return check(up); } }
      else low = 0;
    }
    return fallback("ไม่พบขอบแนวผม");
    function check(up) {
      var ratio = up / middle;
      if (ratio < HAIR.minRatio || ratio > HAIR.maxRatio) return fallback("ตำแหน่งที่พบไม่สมเหตุสมผล");
      return { point: toImage(F, [cx, browY - up]), upper: up, estimated: false, reason: "พบขอบผิว→ผม" };
    }
  }

  /* ================= การวัด ================= */
  /** คืนค่าสัดส่วนทั้งหมด (หน่วย IPD หรือไม่มีหน่วย) — hair = ผลจาก estimateHairline (ถ้ามี) */
  function measure(pts, hair) {
    var A = align(pts), a = A.a, F = A.F;
    var eyeW = (dist(a[36], a[39]) + dist(a[42], a[45])) / 2;
    var eyeH = (dist(a[37], a[41]) + dist(a[38], a[40]) + dist(a[43], a[47]) + dist(a[44], a[46])) / 4;
    var innerEye = dist(a[39], a[42]);
    var browY = meanPt(pick(a, range(17, 26)))[1];
    var middle = a[33][1] - browY, lower = a[8][1] - a[33][1];
    var upper, upperEst;
    if (hair && hair.point && !hair.estimated) { upper = browY - toAligned(F, hair.point)[1]; upperEst = false; }
    else { upper = middle * HAIR.fallbackRatio; upperEst = true; }
    var total = upper + middle + lower;
    var fullW = dist(a[0], a[16]), cheekW = dist(a[1], a[15]), jawW = dist(a[4], a[12]), chinW = dist(a[6], a[10]), browSpan = dist(a[17], a[26]);
    var mouthW = dist(a[48], a[54]);
    var lipC = mid(a[62], a[66]), corners = mid(a[48], a[54]);
    var pose = headPose(pts);
    return {
      ipdPx: F.ipd, roll: pose.roll, yaw: pose.yaw,
      upper: upper, middle: middle, lower: lower, upperEstimated: upperEst,
      upperShare: upper / total, middleShare: middle / total, lowerShare: lower / total,
      lengthRatio: total / fullW,             // ความยาวหน้า (แนวผม→คาง) / ความกว้างหน้า (0–16)
      jawRatio: jawW / cheekW,                // ความกว้างกราม (4–12) / ความกว้างโหนกแก้ม (1–15)
      foreheadRatio: browSpan / jawW,         // ช่วงคิ้ว (17–26) แทนความกว้างหน้าผาก / กราม
      chinWidth: chinW / cheekW,              // ความกว้างคาง (6–10) / โหนกแก้ม
      chinAngle: angleAt(a[6], a[8], a[10]),  // มุมที่ปลายคาง ยิ่งน้อยยิ่งแหลม
      jawCorner: (angleAt(a[2], a[4], a[6]) + angleAt(a[10], a[12], a[14])) / 2, // มุมกราม ยิ่งน้อยยิ่งเหลี่ยม
      browEye: ((dist(a[17], a[21]) + dist(a[22], a[26])) / 2) / eyeW, // ความยาวคิ้ว / ความยาวตา
      browGap: (((a[37][1] + a[38][1]) / 2 - (a[19][1] + a[20][1]) / 2) + ((a[43][1] + a[44][1]) / 2 - (a[23][1] + a[24][1]) / 2)) / 2, // คิ้ว→เปลือกตาบน (IPD)
      browRise: ((a[21][1] - a[17][1]) + (a[22][1] - a[26][1])) / 2, // หางคิ้วสูงกว่าหัวคิ้ว (+) (IPD)
      interBrow: dist(a[21], a[22]) / eyeW,   // หว่างคิ้ว (อิ้นตึ๊ง) / ความยาวตา
      eyeAspect: eyeW / (eyeH || 1e-6),       // ความยาวตา / ความสูงตา
      eyeGap: innerEye / eyeW,                // หัวตาถึงหัวตา / ความยาวตา (ทั่วไป ≈ 1)
      noseLen: dist(a[27], a[33]),            // ความยาวจมูก 27→33 (IPD)
      alarWidth: dist(a[31], a[35]) / innerEye, // ฐานจมูก 31–35 / ระยะหัวตา
      philtrum: dist(a[33], a[51]),           // ร่องใต้จมูก 33→51 (IPD)
      philtrumShare: dist(a[33], a[51]) / (lower || 1),
      mouthW: mouthW,                         // ความกว้างปาก 48–54 (IPD)
      lipUpper: dist(a[51], a[62]), lipLower: dist(a[66], a[57]),
      lipTotal: dist(a[51], a[62]) + dist(a[66], a[57]),
      mouthTilt: (lipC[1] - corners[1]) / mouthW // มุมปากสูงกว่ากึ่งกลางปาก (+) = ยกขึ้น
    };
  }

  /* ค่าเฉลี่ย/ส่วนเบี่ยงเบนอ้างอิง [mean, sd] — สอบเทียบคร่าว ๆ จากภาพหน้าตรงสาธารณสมบัติไม่กี่ภาพ
     (เป็นค่าตั้งต้นเพื่อความบันเทิง ไม่ใช่ค่าประชากร) ปรับได้เมื่อเก็บตัวอย่างมากขึ้น
     ใช้แปลงเป็นค่า z สำหรับคิดคะแนนธาตุ */
  var NORMS = {
    lengthRatio: [1.37, 0.06], jawRatio: [0.835, 0.02], foreheadRatio: [0.965, 0.04], chinWidth: [0.535, 0.025],
    chinAngle: [128, 8], jawCorner: [155, 4], lowerShare: [0.35, 0.025]
  };
  var z = function (m, k) { var n = NORMS[k]; return clamp((m[k] - n[0]) / n[1], -2.5, 2.5); };

  /* ================= เกณฑ์จัดหมวด (แก้ไขได้) ================= */
  var T = {
    browLong: 1.78, browShort: 1.48, browRise: 0.0, browHigh: 0.32, browLow: 0.21,  // คิ้ว: browEye ทั่วไป ≈1.65, browRise ทั่วไป ≈ −0.045
    eyeLong: 3.8, eyeRound: 3.0, eyeWide: 1.75, eyeClose: 1.45,                     // ตา: eyeAspect ≈3.4, eyeGap ≈1.6 (จุดตาของ face-api แคบกว่าตาจริง)
    alarFull: 0.78, alarRefined: 0.62, noseLong: 0.8,                               // จมูก: alarWidth ≈0.68, noseLen ≈0.73 IPD
    mouthWide: 1.1, mouthSmall: 0.86, lipFull: 0.25, mouthUp: 0.06,                 // ปาก: mouthW ≈0.98, lipTotal ≈0.21
    browGapWide: 1.65, browGapNarrow: 1.35,                                         // อิ้นตึ๊ง: interBrow ≈1.5
    philLong: 0.23, philShort: 0.155,                                               // ร่องใต้จมูก ÷ ส่วนล่าง ≈0.18
    chinBroad: 0.56, chinPointed: 0.5, chinAngleBroad: 136, chinAnglePointed: 118,  // คาง: chinWidth ≈0.535, chinAngle ≈128°
    zoneBalanced: 0.045 // ส่วนต่างสัดส่วนสูงสุด–ต่ำสุดของสามส่วนที่ถือว่าสมดุล
  };

  function classify(m) {
    var brow = m.browEye >= T.browLong ? "long" : m.browEye <= T.browShort ? "short" : m.browRise >= T.browRise ? "rising" : "balanced";
    var browNote = m.browGap >= T.browHigh ? "high" : m.browGap <= T.browLow ? "low" : null;
    var eye = m.eyeAspect >= T.eyeLong ? "long" : m.eyeAspect <= T.eyeRound ? "round" : "balanced";
    var eyeNote = m.eyeGap >= T.eyeWide ? "wide" : m.eyeGap <= T.eyeClose ? "close" : "normal";
    var nose = m.alarWidth >= T.alarFull ? "full" : m.noseLen >= T.noseLong ? "long" : m.alarWidth <= T.alarRefined ? "refined" : "balanced";
    var mouth = m.mouthW >= T.mouthWide ? "wide" : m.lipTotal >= T.lipFull ? "full" : m.mouthW <= T.mouthSmall ? "small" : "balanced";
    var mouthNote = m.mouthTilt >= T.mouthUp ? "up" : "level";
    var yintang = m.interBrow >= T.browGapWide ? "wide" : m.interBrow <= T.browGapNarrow ? "narrow" : "balanced";
    var philtrum = m.philtrumShare >= T.philLong ? "long" : m.philtrumShare <= T.philShort ? "short" : "balanced";
    var chin = (m.chinWidth >= T.chinBroad || m.chinAngle >= T.chinAngleBroad) && m.chinAngle > T.chinAnglePointed ? "broad"
      : (m.chinWidth <= T.chinPointed || m.chinAngle <= T.chinAnglePointed) ? "pointed" : "balanced";
    var shares = { upper: m.upperShare, middle: m.middleShare, lower: m.lowerShare };
    var keys = Object.keys(shares).sort(function (x, y) { return shares[y] - shares[x]; });
    var balanced = shares[keys[0]] - shares[keys[2]] < T.zoneBalanced;
    // ถ้าส่วนบนเป็นค่าประมาณการ ไม่ตัดสินว่าส่วนบนเด่น
    var dom = balanced ? null : keys[0];
    if (dom === "upper" && m.upperEstimated) dom = null;
    return {
      brow: { cat: brow, note: browNote }, eye: { cat: eye, note: eyeNote }, nose: { cat: nose },
      mouth: { cat: mouth, note: mouthNote }, ear: { cat: "na" },
      yintang: { cat: yintang }, philtrum: { cat: philtrum }, chin: { cat: chin },
      zones: { balanced: !dom, dominant: dom, shares: shares }
    };
  }

  /* ================= คะแนนห้าธาตุ =================
     ใช้ค่า z ของสัดส่วนรูปหน้า แล้วแปลงเป็น % ด้วย softmax
     ไม้: หน้ายาว กรามแคบ | ไฟ: หน้าผากกว้างกว่ากราม คางแหลม | ดิน: ช่วงล่างยาว กรามและคางกว้าง
     ทอง: กรามกว้าง มุมกรามเหลี่ยม สัดส่วนกลาง ๆ | น้ำ: หน้าสั้นกลม คางมน มุมกรามโค้ง */
  var ELEMENTS = ["wood", "fire", "earth", "metal", "water"];
  function elementScores(m) {
    var zL = z(m, "lengthRatio"), zJ = z(m, "jawRatio"), zF = z(m, "foreheadRatio"), zW = z(m, "chinWidth"),
      zC = z(m, "chinAngle"), zK = z(m, "jawCorner"), zLo = z(m, "lowerShare");
    var raw = {
      wood: 1.3 * zL - 0.4 * zJ - 0.2 * zLo - 0.2 * zC,
      fire: 0.9 * zF - 0.8 * zC - 0.4 * zJ - 0.4 * zW,
      earth: 0.7 * zLo + 0.6 * zJ + 0.6 * zW - 0.3 * zL,
      metal: 0.9 * zJ - 0.8 * zK - 0.4 * Math.abs(zL) + 0.2 * zW - 0.2 * zC,
      water: -1.1 * zL + 0.6 * zC + 0.6 * zK + 0.2 * zW - 0.2 * zLo
    };
    var ex = {}, sum = 0;
    ELEMENTS.forEach(function (k) { ex[k] = Math.exp(1.2 * raw[k]); sum += ex[k]; });
    var ranked = ELEMENTS.map(function (k) { return { id: k, pct: Math.round(ex[k] / sum * 100), score: raw[k] }; })
      .sort(function (a, b) { return b.score - a.score; });
    return { raw: raw, ranked: ranked, top: ranked[0], second: ranked[1], z: { lengthRatio: zL, jawRatio: zJ, foreheadRatio: zF, chinWidth: zW, chinAngle: zC, jawCorner: zK, lowerShare: zLo } };
  }

  function ageArea(age) {
    if (!KB || !(age >= 1)) return null;
    for (var i = 0; i < KB.ageMap.length; i++) if (age >= KB.ageMap[i].from && age <= KB.ageMap[i].to) return KB.ageMap[i];
    return null;
  }

  /** ประกอบคำทำนาย (เชิงบวกทั้งหมด) จากผลจัดหมวด */
  function buildReading(m, cls, el, age) {
    var E = KB.elements[el.top.id], E2 = KB.elements[el.second.id], f = KB.features, p = KB.points, z_ = KB.zones;
    var c = function (feat, k) { return f[feat].cats[cls[feat].cat][k]; };
    var pc = function (pt, k) { return p[pt].cats[cls[pt].cat][k]; };
    var zoneText = cls.zones.dominant ? z_[cls.zones.dominant].dominant : z_.balanced;
    var eyeNote = f.eye.notes[cls.eye.note];
    var browNote = cls.brow.note ? f.brow.notes[cls.brow.note] : "";
    var aa = ageArea(age);
    return {
      element: E, elementId: el.top.id, second: E2, secondId: el.second.id,
      overview: E.overview + " และมีพลังธาตุ" + E2.th + "เสริม (" + E2.traits[0] + ") " + zoneText,
      work: E.work + " ตำแหน่งคิ้วของคุณเป็นแบบ " + c("brow", "label") + " " + c("brow", "meaning") + " และอิ้นตึ๊งแบบ " + pc("yintang", "label") + " " + pc("yintang", "meaning"),
      money: E.money + " จมูกแบบ " + c("nose", "label") + " " + c("nose", "meaning"),
      love: E.love + " ดวงตาแบบ " + c("eye", "label") + " " + c("eye", "meaning") + " ส่วนปากแบบ " + c("mouth", "label") + " " + c("mouth", "meaning"),
      notes: [browNote, eyeNote, f.mouth.notes[cls.mouth.note]].filter(Boolean),
      tips: [E.tip, f.nose.tip, p.yintang.tip, f.mouth.tip].filter(Boolean),
      colors: E.colors,
      age: aa
    };
  }

  /** ตรวจคุณภาพภาพก่อนอ่าน: light = { mean, lr } จาก lightStats */
  var Q = { minFacePx: 110, minFaceFrac: 0.16, yaw: 0.14, roll: 9, lumaLo: 65, lumaHi: 215, lr: 38 };
  function quality(det, frameW, frameH, light) {
    var items = [];
    if (!det) return [{ id: "face", ok: false, label: "พบใบหน้า", tip: "ให้ใบหน้าอยู่ในกรอบวงรี" }];
    items.push({ id: "face", ok: true, label: "พบใบหน้า" });
    var w = det.box.width, frac = w / Math.min(frameW, frameH);
    items.push({ id: "size", ok: w >= Q.minFacePx && frac >= Q.minFaceFrac, label: "ใบหน้าใหญ่พอ", tip: "ขยับเข้าใกล้กล้องอีกนิด" });
    var pose = headPose(det.pts);
    items.push({ id: "yaw", ok: Math.abs(pose.yaw) <= Q.yaw, label: "หันหน้าตรง", tip: "มองตรงเข้ากล้อง ไม่หันซ้าย–ขวา" });
    items.push({ id: "roll", ok: Math.abs(pose.roll) <= Q.roll, label: "ศีรษะไม่เอียง", tip: "ตั้งศีรษะให้ตรง" });
    if (light) items.push({ id: "light", ok: light.mean >= Q.lumaLo && light.mean <= Q.lumaHi && light.lr <= Q.lr, label: "แสงสว่างพอและสม่ำเสมอ",
      tip: light.mean < Q.lumaLo ? "เพิ่มแสงด้านหน้า" : light.mean > Q.lumaHi ? "แสงจ้าเกินไป" : "แสงด้านข้างไม่เท่ากัน หันเข้าหาแสง" });
    return items;
  }
  /** ความสว่างเฉลี่ยในกรอบหน้า และผลต่างครึ่งซ้าย–ขวา */
  function lightStats(img, box) {
    var sL = 0, nL = 0, sR = 0, nR = 0, N = 20;
    for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
      var x = box.x + box.width * (0.15 + 0.7 * i / (N - 1)), y = box.y + box.height * (0.15 + 0.7 * j / (N - 1));
      var s = samplePx(img, x, y); if (!s) continue;
      if (i < N / 2) { sL += s[0]; nL++; } else { sR += s[0]; nR++; }
    }
    var mL = nL ? sL / nL : 0, mR = nR ? sR / nR : 0;
    return { mean: (sL + sR) / ((nL + nR) || 1), lr: Math.abs(mL - mR) };
  }

  /** คำอธิบายค่าที่วัดได้ (ใช้ใน "ดูวิธีคำนวณ") */
  var METRICS = [
    ["lengthRatio", "ความยาวหน้า ÷ ความกว้างหน้า", "(แนวผม→คาง 8) ÷ (จุด 0–16)"],
    ["jawRatio", "กราม ÷ โหนกแก้ม", "(4–12) ÷ (1–15)"],
    ["foreheadRatio", "ช่วงคิ้ว (แทนหน้าผาก) ÷ กราม", "(17–26) ÷ (4–12)"],
    ["chinWidth", "คาง ÷ โหนกแก้ม", "(6–10) ÷ (1–15)"],
    ["chinAngle", "มุมปลายคาง (องศา)", "มุม 6–8–10"],
    ["jawCorner", "มุมกราม (องศา)", "เฉลี่ยมุม 2–4–6 และ 10–12–14"],
    ["upperShare", "สัดส่วนส่วนบน", "แนวผม→แนวคิ้ว ÷ ทั้งหน้า"],
    ["middleShare", "สัดส่วนส่วนกลาง", "แนวคิ้ว→ฐานจมูก 33 ÷ ทั้งหน้า"],
    ["lowerShare", "สัดส่วนส่วนล่าง", "ฐานจมูก 33→คาง 8 ÷ ทั้งหน้า"],
    ["browEye", "ความยาวคิ้ว ÷ ความยาวตา", "(17–21, 22–26) ÷ (36–39, 42–45)"],
    ["browGap", "ระยะคิ้ว→เปลือกตา (IPD)", "19/20→37/38 และ 23/24→43/44"],
    ["browRise", "หางคิ้วสูงกว่าหัวคิ้ว (IPD)", "y(21)−y(17), y(22)−y(26)"],
    ["interBrow", "หว่างคิ้ว ÷ ความยาวตา", "(21–22) ÷ ความยาวตา"],
    ["eyeAspect", "ความยาวตา ÷ ความสูงตา", "(36–39) ÷ (37–41, 38–40)"],
    ["eyeGap", "ระยะหัวตา ÷ ความยาวตา", "(39–42) ÷ ความยาวตา"],
    ["noseLen", "ความยาวจมูก (IPD)", "27→33"],
    ["alarWidth", "ฐานจมูก ÷ ระยะหัวตา", "(31–35) ÷ (39–42)"],
    ["philtrumShare", "ร่องใต้จมูก ÷ ส่วนล่าง", "(33→51) ÷ (33→8)"],
    ["mouthW", "ความกว้างปาก (IPD)", "48–54"],
    ["lipTotal", "ความหนาริมฝีปากบน+ล่าง (IPD)", "(51→62) + (66→57)"],
    ["mouthTilt", "มุมปากยก (+) ÷ ความกว้างปาก", "กึ่งกลาง 62/66 เทียบ 48/54"],
    ["yaw", "การหันซ้าย–ขวา (0 = ตรง)", "ระยะปลายจมูก 30 ถึงขอบหน้าสองข้าง"],
    ["roll", "ศีรษะเอียง (องศา)", "แนวตาซ้าย–ขวา"]
  ];

  /** สถิติแบบไม่ระบุตัวตน (localStorage "fr-stats") — รับ/คืนออบเจ็กต์ ไม่แตะ storage เอง */
  function addStat(st, el, now) {
    st = st && typeof st === "object" ? st : {};
    var d = new Date(now || Date.now());
    var day = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    var out = { v: 1, total: (st.total || 0) + 1, el: Object.assign({ wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }, st.el || {}), days: Object.assign({}, st.days || {}), first: st.first || d.toISOString(), last: d.toISOString() };
    out.el[el] = (out.el[el] || 0) + 1;
    out.days[day] = (out.days[day] || 0) + 1;
    return out;
  }

  /** วิเคราะห์ครบชุด: pts (68 จุดในพิกัดภาพ), img (ImageData-like สำหรับหาแนวผม) */
  function analyze(pts, img, age) {
    var hair = estimateHairline(img, pts);
    var m = measure(pts, hair);
    var cls = classify(m);
    var el = elementScores(m);
    var reading = KB ? buildReading(m, cls, el, age) : null;
    return { hair: hair, m: m, cls: cls, el: el, reading: reading };
  }

  var FRCore = {
    dist: dist, angleAt: angleAt, frame: frame, toAligned: toAligned, toImage: toImage, align: align, headPose: headPose,
    averageLandmarks: averageLandmarks, estimateHairline: estimateHairline, measure: measure, classify: classify,
    elementScores: elementScores, buildReading: buildReading, ageArea: ageArea, quality: quality, lightStats: lightStats,
    analyze: analyze, addStat: addStat, round: round, NORMS: NORMS, THRESH: T, HAIR: HAIR, QUALITY: Q, METRICS: METRICS, ELEMENTS: ELEMENTS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = FRCore;
  root.FRCore = FRCore;
})(typeof window !== "undefined" ? window : globalThis);

/* ===================================================================================== */
/* ================================== ส่วนติดต่อผู้ใช้ ================================== */
/* ===================================================================================== */
if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("frApp")) (function () {
  "use strict";
  var FR = window.FRCore, KB = window.FR_KB;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var HTTPS_MSG = "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด";
  var STATS_KEY = "fr-stats", PREF_KEY = "fr-prefs", FRAMES = 10, IDLE_MS = 60000;
  var lsGet = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  var lsSet = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* โหมดส่วนตัว */ } };

  var video = $("#frVideo"), cam = $("#frCam"), ov = $("#frOverlay"), octx = ov.getContext("2d");
  var btnCam = $("#frStartCam"), btnRead = $("#frRead"), fileIn = $("#frFile"), qcList = $("#frQc"), countEl = $("#frCount");
  var resultSec = $("#frResult"), resCanvas = $("#frResCanvas");
  var ready = false, busy = false, looping = false, lastDet = null, lastQ = null, current = null, forceRead = null;
  var prefs = Object.assign({ stats: true, photoOnCard: false }, lsGet(PREF_KEY, {}));

  function engine(msg, cls) { var e = $("#frEngine"); e.textContent = msg; e.className = "fr-engine " + (cls || ""); }

  /* ---------- กล้อง (รูปแบบเดียวกับ booth.js/neuro.js) ---------- */
  function createCamera(video, o) {
    o = o || {};
    var c = { stream: null, facing: "user", deviceId: "", currentId: "", devices: [], mirror: true, active: false, paused: false };
    video.muted = true; video.playsInline = true; video.autoplay = true;
    video.setAttribute("playsinline", ""); video.setAttribute("muted", ""); video.setAttribute("autoplay", "");
    c.stop = function () { if (c.stream) c.stream.getTracks().forEach(function (t) { t.stop(); }); c.stream = null; c.active = false; video.srcObject = null; };
    c.start = async function () {
      if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error(HTTPS_MSG), { name: "Insecure" });
      c.stop();
      var base = { width: { ideal: 1280 }, height: { ideal: 720 } };
      var want = c.deviceId ? Object.assign({}, base, { deviceId: { exact: c.deviceId } }) : Object.assign({}, base, { facingMode: { ideal: c.facing } });
      var s;
      try { s = await navigator.mediaDevices.getUserMedia({ video: want, audio: false }); }
      catch (e) {
        if (["OverconstrainedError", "NotFoundError", "NotReadableError"].indexOf(e.name) < 0 || !(c.deviceId || c.facing !== "user")) throw e;
        c.deviceId = ""; s = await navigator.mediaDevices.getUserMedia({ video: base, audio: false });
      }
      c.stream = s; video.srcObject = s;
      try { await video.play(); } catch (e) { console.warn("video.play", e); }
      if (!video.videoWidth) await new Promise(function (r) { video.addEventListener("loadedmetadata", r, { once: true }); setTimeout(r, 3000); });
      var tr = s.getVideoTracks()[0], st = (tr && tr.getSettings && tr.getSettings()) || {}, label = (tr && tr.label) || "";
      try { c.devices = (await navigator.mediaDevices.enumerateDevices()).filter(function (d) { return d.kind === "videoinput" && d.deviceId; }); } catch (e) { c.devices = []; }
      var fm = st.facingMode || (/back|rear|environment|หลัง/i.test(label) ? "environment" : /front|user|หน้า|facetime/i.test(label) ? "user" : c.deviceId ? "user" : c.facing);
      c.facing = fm === "environment" ? "environment" : "user";
      c.mirror = c.facing === "user"; // กลับด้านเฉพาะกล้องหน้า
      c.currentId = st.deviceId || "";
      c.active = true;
      if (c.renderControls) c.renderControls();
      if (o.onChange) o.onChange(c);
      return c;
    };
    c.flip = function () { c.facing = c.facing === "user" ? "environment" : "user"; c.deviceId = ""; return c.start(); };
    c.use = function (id) { c.deviceId = id; return c.start(); };
    c.mountControls = function (host) {
      var box = document.createElement("div"); box.className = "cam-ctl"; box.hidden = true;
      box.innerHTML = '<button type="button" class="cam-flip" aria-label="สลับกล้องหน้า/หลัง" title="สลับกล้องหน้า/หลัง"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h11l-3-3M20 16H9l3 3"/></svg><span>สลับกล้อง</span></button><select class="cam-pick" aria-label="เลือกกล้อง"></select>';
      host.append(box);
      var flip = box.querySelector(".cam-flip"), pickEl = box.querySelector(".cam-pick");
      var run = function (p) { box.classList.add("busy"); p.catch(function (e) { if (o.onError) o.onError(e); }).finally(function () { box.classList.remove("busy"); }); };
      flip.onclick = function () { run(c.flip()); };
      pickEl.onchange = function () { run(c.use(pickEl.value)); };
      c.renderControls = function () {
        box.hidden = c.devices.length < 2;
        pickEl.innerHTML = c.devices.map(function (d, i) { return '<option value="' + esc(d.deviceId) + '">' + esc(d.label || "กล้อง " + (i + 1)) + "</option>"; }).join("");
        if (c.currentId) pickEl.value = c.currentId;
      };
    };
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { if (c.stream) { c.paused = true; c.stop(); if (o.onChange) o.onChange(c); } }
      else if (c.paused) { c.paused = false; c.start().catch(function (e) { if (o.onError) o.onError(e); }); }
    });
    window.addEventListener("pagehide", function () { if (c.stream) { c.paused = true; c.stop(); } });
    window.addEventListener("pageshow", function (e) { if (e.persisted && c.paused) { c.paused = false; c.start().catch(function (err) { if (o.onError) o.onError(err); }); } });
    return c;
  }
  function showHttpsNote(before) {
    if (window.isSecureContext || document.querySelector(".https-note")) return;
    var p = document.createElement("p"); p.className = "https-note"; p.setAttribute("role", "alert");
    p.innerHTML = 'บนมือถือต้องเปิดผ่าน <b>https://</b> — ดูวิธีในหน้า <a href="cameras.html">ระบบทั้งหมด</a>';
    before.before(p);
  }
  var camErr = function (e) {
    console.error(e);
    if (e.name === "Insecure") showHttpsNote($("#frEngine"));
    var m = { Insecure: HTTPS_MSG, NotAllowedError: "ไม่ได้รับอนุญาตให้ใช้กล้อง — ใช้ปุ่ม อัปโหลดรูป แทนได้", NotFoundError: "ไม่พบกล้อง — ใช้ปุ่ม อัปโหลดรูป แทนได้", NotReadableError: "กล้องถูกโปรแกรมอื่นใช้อยู่" }[e.name];
    engine(m || "เปิดกล้องไม่ได้: " + (e.message || e.name), "err");
  };
  function layoutCam() {
    var vw = video.videoWidth, vh = video.videoHeight; if (!vw) return;
    if (ov.width !== vw || ov.height !== vh) { ov.width = vw; ov.height = vh; }
    cam.style.aspectRatio = vw + " / " + vh;
  }
  var camera = createCamera(video, {
    onChange: function (c) { cam.classList.toggle("mirror", c.mirror); cam.classList.toggle("live", c.active); layoutCam(); if (c.active) startLoop(); },
    onError: camErr
  });
  camera.mountControls(cam);
  video.addEventListener("resize", layoutCam);

  /* ---------- โมเดล ---------- */
  async function initBackend() {
    var tf = faceapi.tf;
    tf.setWasmPaths("vendor/");
    var names = ["webgl", "wasm", "cpu"];
    for (var i = 0; i < names.length; i++) {
      try { if (await tf.setBackend(names[i])) { await tf.ready(); return names[i]; } } catch (e) { console.warn(names[i], e); }
    }
    throw new Error("no backend");
  }
  var modelsP = null;
  function loadModels() {
    if (!modelsP) modelsP = initBackend().then(function (b) {
      return Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri("vendor/models/"), faceapi.nets.faceLandmark68Net.loadFromUri("vendor/models/")]).then(function () { return b; });
    }).then(function (b) {
      ready = true;
      engine("พร้อมใช้งาน (ตัวประมวลผล: " + b.toUpperCase() + (b === "webgl" ? "" : " — อาจช้ากว่าปกติเล็กน้อย") + ")", "ok");
      return b;
    }).catch(function (e) { console.error(e); engine("โหลดโมเดลไม่สำเร็จ: " + (e.message || e), "err"); modelsP = null; throw e; });
    return modelsP;
  }
  async function detect(input, size) {
    var r = await faceapi.detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: size || 320, scoreThreshold: 0.45 })).withFaceLandmarks();
    if (!r) return null;
    var b = r.detection.box;
    return { box: { x: b.x, y: b.y, width: b.width, height: b.height }, score: r.detection.score, pts: r.landmarks.positions.map(function (p) { return [p.x, p.y]; }) };
  }

  /* ---------- ตรวจคุณภาพสด + วงรีนำทาง ---------- */
  var probe = document.createElement("canvas"), pctx = probe.getContext("2d", { willReadFrequently: true });
  function grabFrame(target, mirror) {
    var w = video.videoWidth, h = video.videoHeight;
    target.width = w; target.height = h;
    var c = target.getContext("2d", { willReadFrequently: true });
    c.save(); if (mirror) { c.translate(w, 0); c.scale(-1, 1); } c.drawImage(video, 0, 0, w, h); c.restore();
    return c;
  }
  function renderQc(items) {
    qcList.innerHTML = items.map(function (q) {
      return '<li class="' + (q.ok ? "ok" : "no") + '"><span class="dot" aria-hidden="true">' + (q.ok ? "✓" : "!") + "</span><span>" + esc(q.label) + (q.ok || !q.tip ? "" : ' <small>— ' + esc(q.tip) + "</small>") + "</span></li>";
    }).join("");
  }
  function qOk(items) { return items.length > 1 && items.every(function (q) { return q.ok || q.id === "light"; }); }
  function drawGuide(det, ok) {
    var w = ov.width, h = ov.height; octx.clearRect(0, 0, w, h);
    var rx = Math.min(w, h) * 0.24, ry = rx * 1.3;
    octx.lineWidth = Math.max(3, w / 220); octx.setLineDash([w / 60, w / 90]);
    octx.strokeStyle = ok ? "#22d3ee" : "rgba(255,255,255,.85)";
    octx.beginPath(); octx.ellipse(w / 2, h * 0.48, rx, ry, 0, 0, Math.PI * 2); octx.stroke(); octx.setLineDash([]);
    if (det) { // จุดบนใบหน้า (พิกัดภาพดิบ: canvas ถูก mirror ด้วย CSS ไปพร้อมวิดีโอ)
      octx.fillStyle = ok ? "rgba(34,211,238,.9)" : "rgba(255,255,255,.7)";
      det.pts.forEach(function (p) { octx.beginPath(); octx.arc(p[0], p[1], Math.max(1.5, w / 500), 0, Math.PI * 2); octx.fill(); });
    }
  }
  async function startLoop() {
    if (looping) return; looping = true;
    while (camera.active && looping) {
      if (!busy && ready && video.videoWidth) {
        try {
          var det = await detect(video, 224);
          var light = null;
          if (det) { grabFrame(probe, false); light = FR.lightStats(pctx.getImageData(0, 0, probe.width, probe.height), det.box); }
          lastDet = det; lastQ = FR.quality(det, video.videoWidth, video.videoHeight, light);
          if (!busy) { renderQc(lastQ); drawGuide(det, qOk(lastQ)); btnRead.disabled = !qOk(lastQ); }
        } catch (e) { console.warn(e); }
      }
      await sleep(250);
    }
    looping = false;
  }

  btnCam.addEventListener("click", async function () {
    btnCam.disabled = true;
    engine("กำลังเปิดกล้องและโหลดโมเดล...");
    try {
      await Promise.all([camera.start(), loadModels()]);
      $("#frCamHint").hidden = true;
      engine("กล้องพร้อม — จัดใบหน้าให้อยู่ในวงรี มองตรง แล้วกด อ่านโหงวเฮ้ง", "ok");
      btnCam.hidden = true; btnRead.hidden = false;
    } catch (e) { camErr(e); btnCam.disabled = false; }
  });

  /* ---------- อ่านจากกล้อง: นับถอยหลัง 3-2-1 แล้วเก็บ ~10 เฟรม ---------- */
  btnRead.addEventListener("click", async function () {
    if (busy || !camera.active) return;
    busy = true; btnRead.disabled = true; touch();
    try {
      for (var n = 3; n >= 1; n--) { countEl.textContent = n; countEl.hidden = false; await sleep(800); }
      countEl.textContent = "กำลังอ่าน..."; countEl.classList.add("small");
      var frames = [], snaps = [];
      for (var i = 0; i < FRAMES + 4 && frames.length < FRAMES; i++) {
        var cv = document.createElement("canvas"); grabFrame(cv, camera.mirror);
        var d = await detect(cv, 320);
        if (d) { var pose = FR.headPose(d.pts); if (Math.abs(pose.yaw) <= FR.QUALITY.yaw * 1.3 && Math.abs(pose.roll) <= FR.QUALITY.roll * 1.3) { frames.push(d.pts); snaps.push({ cv: cv, d: d }); } }
        countEl.textContent = "กำลังอ่าน " + Math.round(frames.length / FRAMES * 100) + "%";
      }
      if (frames.length < 4) { engine("ยังจับใบหน้าได้ไม่นิ่งพอ ลองมองตรงและอยู่นิ่ง ๆ อีกครั้ง", "err"); return; }
      var avg = FR.averageLandmarks(frames);
      var snap = snaps[Math.floor(snaps.length / 2)];
      showResult(snap.cv, avg, snap.d.box);
    } catch (e) { console.error(e); engine("อ่านไม่สำเร็จ: " + (e.message || e), "err"); }
    finally { countEl.hidden = true; countEl.classList.remove("small"); busy = false; btnRead.disabled = !(lastQ && qOk(lastQ)); }
  });

  /* ---------- อัปโหลดรูป ---------- */
  fileIn.addEventListener("change", async function () {
    var f = fileIn.files && fileIn.files[0]; fileIn.value = "";
    if (!f) return;
    touch();
    engine("กำลังโหลดโมเดลและอ่านรูป...");
    try {
      await loadModels();
      var url = URL.createObjectURL(f), img = new Image();
      await new Promise(function (res, rej) { img.onload = res; img.onerror = function () { rej(new Error("เปิดไฟล์รูปไม่ได้")); }; img.src = url; });
      var sc = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
      var cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * sc); cv.height = Math.round(img.naturalHeight * sc);
      cv.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      var d = await detect(cv, 512) || await detect(cv, 320);
      var light = d ? FR.lightStats(cv.getContext("2d").getImageData(0, 0, cv.width, cv.height), d.box) : null;
      var q = FR.quality(d, cv.width, cv.height, light);
      renderQc(q);
      if (!d) { engine("ไม่พบใบหน้าในรูปนี้ ลองใช้รูปหน้าตรงที่เห็นใบหน้าชัด", "err"); return; }
      if (!qOk(q)) {
        engine("รูปนี้ยังไม่ผ่านเกณฑ์ (ดูรายการตรวจด้านล่าง) ผลอาจคลาดเคลื่อน", "err");
        forceRead = function () { showResult(cv, d.pts, d.box); };
        $("#frForce").hidden = false;
        return;
      }
      engine("อ่านรูปเรียบร้อย", "ok");
      showResult(cv, d.pts, d.box);
    } catch (e) { console.error(e); engine("อ่านรูปไม่สำเร็จ: " + (e.message || e), "err"); }
  });
  $("#frForce").addEventListener("click", function () { $("#frForce").hidden = true; if (forceRead) forceRead(); forceRead = null; });

  /* ---------- แสดงผล ---------- */
  function showResult(cv, pts, box) {
    $("#frForce").hidden = true;
    var img = cv.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height);
    var ageV = parseInt($("#frAge").value, 10);
    var R = FR.analyze(pts, img, ageV >= 1 && ageV <= 120 ? ageV : null);
    current = { cv: cv, pts: pts, box: box, R: R };
    drawResultImage(resCanvas, cv, pts, R);
    renderReading(R);
    if (prefs.stats) { lsSet(STATS_KEY, FR.addStat(lsGet(STATS_KEY, null), R.el.top.id)); renderStats(); }
    resultSec.hidden = false;
    $("#frCardImg").hidden = true;
    resultSec.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    $("#frResTitle").focus({ preventScroll: true });
    touch();
  }

  /** ภาพผล: ครอปรอบใบหน้า + แถบสามส่วน + เส้นรอบอวัยวะ + ป้ายจุดสำคัญ */
  function drawResultImage(canvas, src, pts, R) {
    var F = FR.frame(pts), a = pts.map(function (p) { return FR.toAligned(F, p); });
    var browY = (function () { var s = 0; for (var i = 17; i <= 26; i++) s += a[i][1]; return s / 10; })();
    var hairY = browY - R.m.upper, noseY = a[33][1], chinY = a[8][1];
    var xs = a.map(function (p) { return p[0]; }), minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    // กรอบครอป (หน่วย IPD) สัดส่วน 4:5
    var top = hairY - 0.45, bot = chinY + 0.3, h = bot - top, w = Math.max(h * 0.8, (maxX - minX) + 1.6), cxA = (minX + maxX) / 2;
    h = w / 0.8; top = (top + bot) / 2 - h / 2;
    var W = 900, H = 1125, s = W / w; canvas.width = W; canvas.height = H;
    var c = canvas.getContext("2d");
    // วาดภาพแบบหมุนตามแนวตาให้ตรง
    c.save();
    c.fillStyle = "#0e1430"; c.fillRect(0, 0, W, H);
    c.translate(W / 2, -top * s); c.scale(s / F.ipd, s / F.ipd); c.translate(-cxA * F.ipd, 0); c.rotate(-F.theta); c.translate(-F.c[0], -F.c[1]);
    c.drawImage(src, 0, 0);
    c.restore();
    var P = function (q) { return [W / 2 + (q[0] - cxA) * s, (q[1] - top) * s]; };
    c.fillStyle = "rgba(14,20,48,.18)"; c.fillRect(0, 0, W, H);
    // แถบสามส่วน
    var x0 = P([minX - 0.12, 0])[0], x1 = P([maxX + 0.12, 0])[0];
    var bands = [[hairY, browY, "rgba(103,79,242,.16)", "บน"], [browY, noseY, "rgba(34,211,238,.14)", "กลาง"], [noseY, chinY, "rgba(240,180,60,.16)", "ล่าง"]];
    var fs = Math.round(W / 34);
    c.font = "500 " + fs + "px Prompt, system-ui, sans-serif"; c.textBaseline = "middle";
    bands.forEach(function (b, i) {
      var y0 = P([0, b[0]])[1], y1 = P([0, b[1]])[1];
      c.fillStyle = b[2]; c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 2; c.setLineDash(i === 0 && R.m.upperEstimated ? [10, 8] : []);
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y0); c.stroke(); c.setLineDash([]);
      var share = Math.round([R.m.upperShare, R.m.middleShare, R.m.lowerShare][i] * 100);
      pill(c, b[3] + " " + share + "%", 14, (y0 + y1) / 2, fs * 0.85, "left", "rgba(14,20,48,.78)", "#fff");
    });
    var yc = P([0, chinY])[1]; c.strokeStyle = "rgba(255,255,255,.55)"; c.beginPath(); c.moveTo(x0, yc); c.lineTo(x1, yc); c.stroke();
    // เส้นรอบอวัยวะ
    var line = function (idx, close, color) {
      c.beginPath(); idx.forEach(function (i, k) { var p = P(a[i]); if (k) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
      if (close) c.closePath(); c.strokeStyle = color; c.lineWidth = 3; c.lineJoin = "round"; c.stroke();
    };
    var rg = function (x, y) { var r = []; for (var i = x; i <= y; i++) r.push(i); return r; };
    line(rg(0, 16), false, "rgba(255,255,255,.75)");
    line(rg(17, 21), false, "#c4b5fd"); line(rg(22, 26), false, "#c4b5fd");
    line(rg(36, 41), true, "#67e8f9"); line(rg(42, 47), true, "#67e8f9");
    line(rg(27, 30), false, "#fcd34d"); line([31, 32, 33, 34, 35], false, "#fcd34d");
    line(rg(48, 59), true, "#fda4af");
    // ป้ายจุดสำคัญ (ด้านขวา/ซ้ายสลับกัน พร้อมเส้นโยง)
    var mp = function (i, j) { return [(a[i][0] + a[j][0]) / 2, (a[i][1] + a[j][1]) / 2]; };
    var labels = [
      [[a[27][0], hairY], "แนวผม" + (R.m.upperEstimated ? " (ประมาณการ)" : ""), "R"],
      [mp(21, 22), "อิ้นตึ๊ง", "L"],
      [a[33], "จมูก (ทรัพย์)", "R"],
      [mp(33, 51), "ร่องใต้จมูก", "L"],
      [a[54], "มุมปาก", "R"],
      [a[8], "คาง", "L"]
    ];
    labels.forEach(function (l) {
      var p = P(l[0]), right = l[2] === "R", lx = right ? W - 14 : 14;
      c.strokeStyle = "rgba(255,255,255,.8)"; c.lineWidth = 2;
      c.beginPath(); c.arc(p[0], p[1], 6, 0, Math.PI * 2); c.fillStyle = "#22d3ee"; c.fill();
      var tw = c.measureText(l[1]).width + fs, ex = right ? lx - tw : lx + tw;
      c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(ex, p[1]); c.stroke();
      pill(c, l[1], lx, p[1], fs * 0.85, right ? "right" : "left", "rgba(255,255,255,.95)", "#0e1430");
    });
  }
  function pill(c, text, x, y, size, align, bg, fg) {
    c.font = "500 " + Math.round(size) + "px Prompt, system-ui, sans-serif";
    var w = c.measureText(text).width + size, h = size * 1.6, x0 = align === "right" ? x - w : x;
    c.fillStyle = bg; c.beginPath();
    if (c.roundRect) c.roundRect(x0, y - h / 2, w, h, h / 2); else c.rect(x0, y - h / 2, w, h);
    c.fill(); c.fillStyle = fg; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(text, x0 + size / 2, y + 1);
  }

  var fmt = function (v, d) { return typeof v === "number" ? (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d) : String(v); };
  function renderReading(R) {
    var rd = R.reading, E = rd.element, cls = R.cls, m = R.m;
    $("#frElement").style.setProperty("--el", E.color);
    $("#frElement").style.setProperty("--el-soft", E.soft);
    $("#frElName").textContent = "ธาตุ" + E.th;
    $("#frElPct").textContent = R.el.top.pct + "%";
    $("#frElShape").textContent = E.shape;
    $("#frElSecond").innerHTML = "ธาตุรอง: <b>" + esc(rd.second.th) + "</b> " + R.el.second.pct + "%";
    $("#frElBars").innerHTML = R.el.ranked.map(function (r) {
      var e = KB.elements[r.id];
      return '<div class="elbar"><span>' + esc(e.th) + '</span><i style="--w:' + r.pct + '%;--c:' + e.color + '"></i><b>' + r.pct + "%</b></div>";
    }).join("");
    $("#frElTraits").innerHTML = E.traits.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    $("#frOverview").textContent = rd.overview;
    $("#frWork").textContent = rd.work;
    $("#frMoney").textContent = rd.money;
    $("#frLove").textContent = rd.love;
    $("#frNotes").innerHTML = rd.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("");

    // ตารางห้าอวัยวะ + จุดสำคัญ
    var f = KB.features, p = KB.points;
    var row = function (name, val, cat) { return "<tr><th scope=\"row\">" + esc(name) + "</th><td>" + val + "</td><td><b>" + esc(cat.label) + "</b></td><td>" + esc(cat.meaning) + "</td></tr>"; };
    var rows = [
      row("คิ้ว", "ยาว " + fmt(m.browEye, 2) + "× ของตา<br>ห่างตา " + fmt(m.browGap, 2) + " IPD", f.brow.cats[cls.brow.cat]),
      row("ตา", "ยาว/สูง " + fmt(m.eyeAspect, 2) + "<br>ระยะหัวตา " + fmt(m.eyeGap, 2) + "× ตา", f.eye.cats[cls.eye.cat]),
      row("จมูก", "ยาว " + fmt(m.noseLen, 2) + " IPD<br>ฐาน " + fmt(m.alarWidth, 2) + "× ระยะหัวตา", f.nose.cats[cls.nose.cat]),
      row("ปาก", "กว้าง " + fmt(m.mouthW, 2) + " IPD<br>ริมฝีปาก " + fmt(m.lipTotal, 2) + " IPD", f.mouth.cats[cls.mouth.cat]),
      row("หู", "—", f.ear.cats.na),
      row("อิ้นตึ๊ง (หว่างคิ้ว)", fmt(m.interBrow, 2) + "× ความยาวตา", p.yintang.cats[cls.yintang.cat]),
      row("ร่องใต้จมูก", fmt(m.philtrumShare * 100, 0) + "% ของส่วนล่าง", p.philtrum.cats[cls.philtrum.cat]),
      row("มุมปาก", (m.mouthTilt >= 0 ? "+" : "") + fmt(m.mouthTilt, 3), { label: cls.mouth.note === "up" ? "มุมปากยกขึ้น" : "มุมปากเรียบตรง", meaning: f.mouth.notes[cls.mouth.note].split(": ")[1] }),
      row("คาง", "มุม " + fmt(m.chinAngle, 0) + "°<br>กว้าง " + fmt(m.chinWidth, 2) + "× โหนกแก้ม", p.chin.cats[cls.chin.cat])
    ];
    $("#frFeatures").innerHTML = rows.join("");

    // สามส่วน
    var Z = KB.zones, zs = [["upper", m.upperShare], ["middle", m.middleShare], ["lower", m.lowerShare]];
    $("#frZones").innerHTML = zs.map(function (zz) {
      var k = zz[0], dom = cls.zones.dominant === k;
      return '<div class="zone' + (dom ? " dom" : "") + '"><div class="zbar"><i style="--w:' + Math.round(zz[1] * 100 / 0.5) + '%"></i></div><div><b>' + esc(Z[k].th) + "</b> " + Math.round(zz[1] * 100) + "%" +
        (k === "upper" && m.upperEstimated ? ' <span class="est">ประมาณการ</span>' : "") + "<small>" + esc(Z[k].age) + " · " + esc(Z[k].theme) + "</small></div></div>";
    }).join("");
    $("#frZoneText").textContent = (cls.zones.dominant ? Z[cls.zones.dominant].dominant : Z.balanced) + (m.upperEstimated ? " (แนวผมเป็นค่าประมาณการ จึงไม่ประเมินว่าส่วนบนเด่น)" : "");

    // ช่วงวัย
    var aa = rd.age;
    $("#frAges").innerHTML = KB.ageMap.map(function (g) {
      var on = aa && aa === g;
      return '<li class="' + (on ? "on" : "") + '"><b>' + g.from + (g.to >= 120 ? "+ ปี" : "–" + g.to + " ปี") + "</b><span>" + esc(g.th) + "</span>" + (on ? '<p>' + esc(g.msg) + "</p>" : "") + "</li>";
    }).join("");
    $("#frAgeHint").textContent = aa ? "ไฮไลต์ช่วงวัยปัจจุบันของคุณ" : "กรอกอายุ (ไม่บังคับ) ก่อนอ่าน เพื่อดูตำแหน่งที่เด่นในช่วงวัยของคุณ";

    // เคล็ดเสริมดวง & สีมงคล
    $("#frTips").innerHTML = rd.tips.concat(KB.generalTips.slice(0, 1)).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    $("#frColors").innerHTML = rd.colors.map(function (c) { return '<li><i style="background:' + c.hex + '"></i>' + esc(c.name) + "</li>"; }).join("");

    // วิธีคำนวณ
    $("#frHairNote").textContent = "แนวผม: " + (R.hair.estimated ? "ประมาณการ (" + R.hair.reason + ") ใช้ความสูงหน้าผาก = ส่วนกลาง × " + FR.HAIR.fallbackRatio : "ตรวจพบจากการเปลี่ยนสีผิว→ผม (YCbCr)");
    $("#frRaw").innerHTML = FR.METRICS.map(function (mm) {
      var v = m[mm[0]], zv = R.el.z[mm[0]];
      return "<tr><td>" + esc(mm[1]) + "</td><td class=\"num\">" + fmt(v, mm[0] === "chinAngle" || mm[0] === "jawCorner" || mm[0] === "roll" ? 1 : 3) + "</td><td>" + esc(mm[2]) + (zv != null ? "<br><small>z = " + fmt(zv, 2) + "</small>" : "") + "</td></tr>";
    }).join("");
    $("#frScoreRaw").innerHTML = R.el.ranked.map(function (r) { return "<li>" + esc(KB.elements[r.id].th) + ": คะแนน " + fmt(r.score, 2) + " → " + r.pct + "%</li>"; }).join("");
  }

  /* ---------- การ์ดแชร์ 1080×1350 ---------- */
  function wrapTh(c, text, maxW) {
    var segs = (typeof Intl !== "undefined" && Intl.Segmenter) ? Array.from(new Intl.Segmenter("th", { granularity: "word" }).segment(text), function (s) { return s.segment; }) : text.split("");
    var lines = [], cur = "";
    segs.forEach(function (sg) { if (c.measureText(cur + sg).width > maxW && cur) { lines.push(cur.trim()); cur = sg.trimStart(); } else cur += sg; });
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  }
  async function makeCard() {
    var R = current.R, rd = R.reading, E = rd.element;
    try { await Promise.all([document.fonts.load("700 60px Prompt"), document.fonts.load("500 30px Prompt"), document.fonts.load("400 30px Prompt")]); } catch (e) { /* ใช้ฟอนต์ระบบ */ }
    var W = 1080, H = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d"), F = "Prompt, system-ui, sans-serif";
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0e1430"); g.addColorStop(1, "#1e2a5a");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // แสงสีธาตุ
    var rg = c.createRadialGradient(W / 2, 470, 40, W / 2, 470, 520); rg.addColorStop(0, E.color + "88"); rg.addColorStop(1, "rgba(14,20,48,0)");
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    // โลโก้
    c.save(); c.translate(72, 64);
    c.fillStyle = "#fff"; c.strokeStyle = "#22d3ee"; c.lineWidth = 4; c.lineCap = "round";
    c.beginPath(); if (c.roundRect) c.roundRect(0, 0, 60, 60, 18); else c.rect(0, 0, 60, 60); c.fillStyle = "rgba(255,255,255,.08)"; c.fill();
    c.beginPath(); [[14, 24, 14, 14, 24, 14], [46, 24, 46, 14, 36, 14], [14, 36, 14, 46, 24, 46], [46, 36, 46, 46, 36, 46]].forEach(function (q) { c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); c.lineTo(q[4], q[5]); }); c.stroke();
    c.beginPath(); c.arc(30, 30, 8, 0, Math.PI * 2); c.fillStyle = "#8b78ff"; c.fill();
    c.restore();
    c.textBaseline = "middle"; c.textAlign = "left";
    c.font = "700 40px " + F; c.fillStyle = "#fff"; c.fillText("LENS", 148, 96); var lw = c.measureText("LENS").width; c.fillStyle = "#a99bff"; c.fillText("IQ", 148 + lw, 96);
    c.textAlign = "right"; c.font = "500 34px " + F; c.fillStyle = "#c9d0ea"; c.fillText("โหงวเฮ้ง AI", W - 72, 96);
    // วงกลมธาตุ / รูป
    var cy = 460, r = 210;
    c.beginPath(); c.arc(W / 2, cy, r + 14, 0, Math.PI * 2); c.fillStyle = E.color; c.fill();
    c.save(); c.beginPath(); c.arc(W / 2, cy, r, 0, Math.PI * 2); c.clip();
    if (prefs.photoOnCard) { c.drawImage(resCanvas, 0, resCanvas.height * 0.08, resCanvas.width, resCanvas.width, W / 2 - r, cy - r, r * 2, r * 2); }
    else {
      c.fillStyle = "#0e1430"; c.fillRect(W / 2 - r, cy - r, r * 2, r * 2);
      drawElementGlyph(c, R.el.top.id, W / 2, cy, r * 0.62, E.color);
    }
    c.restore();
    c.textAlign = "center"; c.fillStyle = "#fff";
    c.font = "700 92px " + F; c.fillText("ธาตุ" + E.th, W / 2, 770);
    c.font = "400 34px " + F; c.fillStyle = "#c9d0ea";
    c.fillText(R.el.top.pct + "% · ธาตุรอง" + rd.second.th + " " + R.el.second.pct + "%", W / 2, 850);
    // 3 จุดเด่น
    c.font = "500 40px " + F;
    var y = 950;
    E.traits.slice(0, 3).forEach(function (t) {
      c.fillStyle = "rgba(255,255,255,.08)"; c.beginPath(); if (c.roundRect) c.roundRect(150, y - 40, W - 300, 80, 40); else c.rect(150, y - 40, W - 300, 80); c.fill();
      c.fillStyle = "#fff"; c.fillText(t, W / 2, y + 2); y += 100;
    });
    // สีมงคล
    c.font = "400 30px " + F; c.fillStyle = "#c9d0ea";
    var colTxt = "สีมงคล: " + E.colors.map(function (q) { return q.name.replace(/ \(.+\)/, ""); }).join(" · ");
    c.fillText(colTxt, W / 2, 1240);
    c.font = "400 24px " + F; c.fillStyle = "#8f9bc4";
    wrapTh(c, KB.disclaimerShort + " · ประมวลผลในเครื่อง ไม่บันทึกภาพ", W - 160).forEach(function (l, i) { c.fillText(l, W / 2, 1296 + i * 30); });
    return cv;
  }
  function drawElementGlyph(c, id, x, y, s, col) {
    c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = s * 0.09; c.lineCap = "round"; c.lineJoin = "round";
    c.beginPath();
    if (id === "wood") { c.moveTo(0, s); c.lineTo(0, -s); c.moveTo(0, -s * 0.2); c.lineTo(-s * 0.55, -s * 0.7); c.moveTo(0, s * 0.25); c.lineTo(s * 0.55, -s * 0.25); c.stroke(); }
    else if (id === "fire") { c.moveTo(0, -s); c.bezierCurveTo(s * 0.9, -s * 0.2, s * 0.7, s, 0, s); c.bezierCurveTo(-s * 0.7, s, -s * 0.9, -s * 0.2, 0, -s); c.stroke(); }
    else if (id === "earth") { c.rect(-s * 0.8, -s * 0.55, s * 1.6, s * 1.1); c.moveTo(-s * 0.8, 0); c.lineTo(s * 0.8, 0); c.stroke(); }
    else if (id === "metal") { c.arc(0, 0, s * 0.85, 0, Math.PI * 2); c.moveTo(s * 0.4, 0); c.arc(0, 0, s * 0.4, 0, Math.PI * 2); c.stroke(); }
    else { c.moveTo(0, -s); c.bezierCurveTo(s * 0.4, -s * 0.3, s * 0.75, s * 0.1, s * 0.75, s * 0.35); c.arc(0, s * 0.35, s * 0.75, 0, Math.PI); c.bezierCurveTo(-s * 0.75, s * 0.1, -s * 0.4, -s * 0.3, 0, -s); c.stroke(); }
    c.restore();
  }
  var cardUrl = null;
  $("#frShare").addEventListener("click", async function () {
    if (!current) return; touch();
    var b = this; b.disabled = true;
    try {
      var cv = await makeCard();
      var blob = await new Promise(function (r) { cv.toBlob(r, "image/png"); });
      if (cardUrl) URL.revokeObjectURL(cardUrl);
      cardUrl = URL.createObjectURL(blob);
      var im = $("#frCardImg"); im.src = cardUrl; im.hidden = false;
      var file = new File([blob], "lensiq-โหงวเฮ้ง.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "โหงวเฮ้ง AI — LENSIQ", text: "ธาตุ" + current.R.reading.element.th + " " + KB.disclaimerShort }); return; }
        catch (e) { if (e.name === "AbortError") return; }
      }
      var a = document.createElement("a"); a.href = cardUrl; a.download = "lensiq-faceread.png"; document.body.append(a); a.click(); a.remove();
      toast("บันทึกการ์ดแล้ว");
    } catch (e) { console.error(e); toast("สร้างการ์ดไม่สำเร็จ"); }
    finally { b.disabled = false; }
  });
  $("#frPrint").addEventListener("click", function () { touch(); window.print(); });
  $("#frAgain").addEventListener("click", reset);
  $("#frPhotoCard").checked = !!prefs.photoOnCard;
  $("#frPhotoCard").addEventListener("change", function () { prefs.photoOnCard = this.checked; lsSet(PREF_KEY, prefs); });

  function toast(msg) { var t = $("#frToast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("show"); }, 2200); }

  function reset() {
    resultSec.hidden = true; current = null;
    var ctx = resCanvas.getContext("2d"); ctx.clearRect(0, 0, resCanvas.width, resCanvas.height);
    $("#frCardImg").hidden = true; if (cardUrl) { URL.revokeObjectURL(cardUrl); cardUrl = null; }
    if (document.body.classList.contains("fr-kiosk")) $("#frAge").value = "";
    $("#frStage").scrollIntoView({ block: "start" });
    engine(ready ? "พร้อมอ่านคนถัดไป" : "พร้อมใช้งาน", "ok");
  }

  /* ---------- สถิติบูธ (ไม่ระบุตัวตน) ---------- */
  function renderStats() {
    var st = lsGet(STATS_KEY, null), box = $("#frStats");
    if (!st || !st.total) { box.innerHTML = '<p class="muted">ยังไม่มีการอ่านในเครื่องนี้</p>'; return; }
    var today = (function () { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
    box.innerHTML = '<p class="stat-n"><b>' + st.total + "</b> ครั้ง <small>(วันนี้ " + (st.days[today] || 0) + ")</small></p>" +
      FR.ELEMENTS.map(function (k) { var n = st.el[k] || 0, e = KB.elements[k]; return '<div class="elbar"><span>' + esc(e.th) + '</span><i style="--w:' + Math.round(n / st.total * 100) + "%;--c:" + e.color + '"></i><b>' + n + "</b></div>"; }).join("");
  }
  $("#frStatsOn").checked = !!prefs.stats;
  $("#frStatsOn").addEventListener("change", function () { prefs.stats = this.checked; lsSet(PREF_KEY, prefs); });
  $("#frStatsClear").addEventListener("click", function () { if (confirm("ล้างสถิติการอ่านในเครื่องนี้?")) { try { localStorage.removeItem(STATS_KEY); } catch (e) { /* ไม่เป็นไร */ } renderStats(); } });
  renderStats();

  /* ---------- โหมดบูธ: เต็มจอ ปุ่มใหญ่ กลับหน้าเริ่มอัตโนมัติเมื่อไม่มีการใช้งาน 60 วินาที ---------- */
  var idleT = null, idleTick = null, wasFs = false;
  function touch() {
    clearTimeout(idleT); clearInterval(idleTick);
    var el = $("#frIdle"); el.hidden = true;
    if (!document.body.classList.contains("fr-kiosk") || resultSec.hidden) return;
    var until = Date.now() + IDLE_MS;
    idleTick = setInterval(function () {
      var left = Math.ceil((until - Date.now()) / 1000);
      if (left <= 15) { el.hidden = false; el.textContent = "กลับหน้าเริ่มต้นใน " + left + " วินาที — แตะเพื่ออยู่ต่อ"; }
    }, 1000);
    idleT = setTimeout(function () { clearInterval(idleTick); el.hidden = true; reset(); }, IDLE_MS);
  }
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) { document.addEventListener(ev, function () { if (document.body.classList.contains("fr-kiosk")) touch(); }, { passive: true }); });
  function setKiosk(on) {
    document.body.classList.toggle("fr-kiosk", on);
    $("#frKiosk").setAttribute("aria-pressed", on ? "true" : "false");
    $("#frKioskExit").hidden = !on;
    if (on) {
      var de = document.documentElement;
      if (de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen().then(function () { wasFs = true; }).catch(function () { /* iOS ไม่รองรับ ใช้โหมดบูธได้ปกติ */ });
      if (!camera.active) btnCam.click();
      $("#frStage").scrollIntoView({ block: "start" });
    } else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    touch();
  }
  $("#frKiosk").addEventListener("click", function () { setKiosk(!document.body.classList.contains("fr-kiosk")); });
  $("#frKioskExit").addEventListener("click", function () { setKiosk(false); });
  document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && wasFs) { wasFs = false; setKiosk(false); } });

  // แหล่งอ้างอิงและข้อความจาก KB
  $("#frSources").innerHTML = KB.sources.map(function (s) { return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.label) + "</a></li>"; }).join("");
  $("#frElNote").textContent = KB.elementsNote;

  // โหลดโมเดลล่วงหน้า (ไม่ขอสิทธิ์กล้องจนกว่าจะกดปุ่ม)
  if (!window.isSecureContext) showHttpsNote($("#frEngine"));
  engine("กำลังโหลดโมเดลวิเคราะห์ใบหน้า...");
  loadModels().catch(function () {});
  window.__fr = { get current() { return current; }, makeCard: makeCard, reset: reset }; // ใช้ทดสอบ
})();
