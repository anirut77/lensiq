/* ป้ายโฆษณาอัจฉริยะ — เลือกโฆษณาตามกลุ่มผู้ชม วัดผลแบบไม่ระบุตัวตน และคีออสก์สั่งงานด้วยมือ
   ไม่บันทึกภาพ เก็บเฉพาะสถิติรวมใน localStorage (sg-*) และรูปโฆษณาที่ผู้ใช้อัปโหลดใน IndexedDB */

// ================= ส่วนคำนวณ (ไม่ใช้ DOM ทดสอบแยกได้) =================
const SG = {
  YAW_LIMIT: 0.3,      // |yaw| น้อยกว่านี้ = หันมองจอ
  IOU_MIN: 0.3,        // IoU ขั้นต่ำที่ถือว่าเป็นใบหน้าเดิม
  TRACK_TTL_MS: 1500,  // หายไปเกินนี้ย้ายเข้าพูล "ถูกบัง"
  LOST_MS: 1500,       // อยู่ในพูลถูกบังได้อีกเท่านี้ ถ้ากลับมาใกล้ตำแหน่งเดิมใช้ id เดิม (กัน OTS นับซ้ำ)
  DIST_MAX: 0.2,       // ระยะจุดกึ่งกลาง (สัดส่วนภาพ) ที่ยังถือว่าเป็นใบหน้าเดิม
  REVIVE_DIST: 0.3,    // ระยะกลับมาจากพูลถูกบัง
  MIN_FRAMES: 3,       // เห็นอย่างน้อย 3 เฟรมจึงนับ (กันตรวจจับผิด)
  MAX_DT_S: 0.6,       // ช่วงห่างสูงสุดระหว่างเฟรมที่นำมาคิดเวลา
  HAPPY_P: 0.5,        // ความน่าจะเป็น happy ที่ถือว่ายิ้ม
  HAPPY_SHARE: 0.35    // สัดส่วนเฟรมที่ยิ้มจึงจัดเป็นกลุ่ม "ยิ้ม"
};
const BANDS = ["u18", "18_34", "35_54", "55p"];
const BAND_TH = { u18: "ต่ำกว่า 18", "18_34": "18–34", "35_54": "35–54", "55p": "55+" };
const GENDER_TH = { any: "ทุกเพศ", male: "ชาย", female: "หญิง", unk: "ไม่แน่ใจ" };
const MOOD_TH = { any: "ทุกอารมณ์", happy: "กำลังยิ้ม", neutral: "สีหน้าปกติ" };
const GESTURES = ["swipe_left", "swipe_right", "pinch", "hold", "palm"];
const GESTURE_TH = { swipe_left: "ปัดซ้าย", swipe_right: "ปัดขวา", pinch: "จีบนิ้วเลือก", hold: "ชี้ค้างเลือก", palm: "แบมือย้อนกลับ" };

function ageBand(age) { return age < 18 ? "u18" : age < 35 ? "18_34" : age < 55 ? "35_54" : "55p"; }

// yaw จากจุดกลางตาสองข้างกับปลายจมูก: 0 = หน้าตรง, บวก/ลบ = หันข้าง
function estimateYaw(le, re, nose) {
  const mid = (le.x + re.x) / 2, eye = Math.abs(re.x - le.x) || 1;
  return (nose.x - mid) / eye;
}
const isLooking = (yaw, lim = SG.YAW_LIMIT) => Math.abs(yaw) < lim;

function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width), y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const uni = a.width * a.height + b.width * b.height - inter;
  return uni > 0 ? inter / uni : 0;
}

// ตัวติดตามใช้ LQTrack (Hungarian + ระยะจุดกึ่งกลาง + ทำนายความเร็ว + พูลหายชั่วคราว) แล้วผูก id "T"+seq ของหน้านี้ไว้
const LQT = typeof LQTrack !== "undefined" ? LQTrack : (typeof require === "function" ? require("./lensiq-track.js") : null);
function lqCfg(cfg) {
  return {
    ...LQT.PRESET.face, IOU_MIN: cfg.IOU_MIN ?? SG.IOU_MIN,
    DIST_MAX: cfg.DIST_MAX ?? SG.DIST_MAX,              // ลูปราว 5 fps ใบหน้าขยับได้ไกลกว่า preset ต่อเฟรม
    MAX_MISSED_MS: cfg.TRACK_TTL_MS ?? SG.TRACK_TTL_MS,
    LOST_TTL_MS: (cfg.TRACK_TTL_MS ?? SG.TRACK_TTL_MS) + (cfg.LOST_MS ?? SG.LOST_MS), // นับจากเห็นล่าสุด
    REVIVE_DIST: cfg.REVIVE_DIST ?? SG.REVIVE_DIST
  };
}
function newTracker() { return { seq: 0, tracks: [], lq: LQT.newTracker(lqCfg(SG)), byLq: new Map() }; }

// det: { box, look:bool, happy:bool, age?:number, male?:number(0..1) }  box = {x,y,width,height} พิกเซล (หรือ 0..1 ถ้าไม่ส่ง size)
// size: { W, H } ขนาดภาพต้นทาง (ค่าเริ่มต้น 1 = box เป็นค่าปกติ 0..1 อยู่แล้ว)
// คืน { present: tracks ที่เห็นเฟรมนี้, ended: tracks ที่ LQTrack ลบทิ้งแล้ว (หายเกิน TRACK_TTL_MS + LOST_MS) }
function updateTracks(T, dets, now, cfg = SG, size = {}) {
  if (!T.lq) { T.lq = LQT.newTracker(lqCfg(cfg)); T.byLq = new Map(); }
  const W = size.W || 1, H = size.H || 1;
  const lqDets = dets.map((d, i) => ({ ...LQT.toNorm(d.box, W, H), score: 1, i }));
  const r = LQT.updateTracker(T.lq, lqDets, now, lqCfg(cfg));
  const present = [];
  const apply = (t, d) => {
    const dt = Math.min(cfg.MAX_DT_S, Math.max(0, (now - t.lastSeen) / 1000));
    t.box = d.box; t.frames++; t.lastSeen = now;
    t.lookNow = !!d.look; t.happyNow = !!d.happy;
    if (d.look) { t.lookFrames++; t.attnS += dt; }
    if (d.happy) t.happyFrames++;
    if (typeof d.age === "number" && isFinite(d.age)) { t.ageSum += d.age; t.ageN++; }
    if (typeof d.male === "number" && isFinite(d.male)) { t.maleSum += d.male; t.maleN++; }
    present.push(t);
  };
  for (const lt of r.seen) {
    const d = dets[lt.det.i];
    let t = T.byLq.get(lt.id);
    if (!t) {
      t = { id: "T" + (++T.seq), box: d.box, first: now, lastSeen: now, frames: 0, lookFrames: 0, attnS: 0, happyFrames: 0, ageSum: 0, ageN: 0, maleSum: 0, maleN: 0, lookNow: false, happyNow: false };
      T.byLq.set(lt.id, t); T.tracks.push(t);
    }
    apply(t, d);
  }
  const ended = [];
  for (const id of r.removed) { const t = T.byLq.get(id); if (t) { ended.push(t); T.byLq.delete(id); } }
  if (ended.length) { const gone = new Set(ended); T.tracks = T.tracks.filter(t => !gone.has(t)); }
  return { present, ended };
}

// ค่าประมาณที่เสถียรต่อคน: เฉลี่ยอายุ/เพศทุกเฟรม
function trackProfile(t, cfg = SG) {
  const age = t.ageN ? t.ageSum / t.ageN : null, male = t.maleN ? t.maleSum / t.maleN : null;
  return {
    age, band: age == null ? null : ageBand(age),
    gender: male == null ? "unk" : male > 0.6 ? "male" : male < 0.4 ? "female" : "unk",
    mood: t.frames && t.happyFrames / t.frames >= cfg.HAPPY_SHARE ? "happy" : "neutral",
    looking: t.lookFrames > 0
  };
}

// กลุ่มผู้ชมหลักจากคนที่อยู่หน้าจอ (ถ้ามีคนมองจอ ใช้เฉพาะคนที่มอง)
function dominantSegment(tracks, useDemo = true, cfg = SG) {
  let pool = tracks.filter(t => t.frames >= cfg.MIN_FRAMES);
  if (!pool.length) return null;
  const lookers = pool.filter(t => t.lookNow);
  if (lookers.length) pool = lookers;
  const P = pool.map(t => trackProfile(t, cfg)), n = P.length;
  const argmax = obj => Object.entries(obj).sort((a, b) => b[1] - a[1])[0];
  let band = null, bandShare = 0, gender = null, genderShare = 0;
  if (useDemo) {
    const bc = {}; P.forEach(p => { if (p.band) bc[p.band] = (bc[p.band] || 0) + 1; });
    const bb = argmax(bc); if (bb) { band = bb[0]; bandShare = bb[1] / n; }
    const gc = {}; P.forEach(p => { if (p.gender !== "unk") gc[p.gender] = (gc[p.gender] || 0) + 1; });
    const gb = argmax(gc); if (gb && gb[1] / n > 0.5) { gender = gb[0]; genderShare = gb[1] / n; }
  }
  const happy = P.filter(p => p.mood === "happy").length;
  return { n, lookers: lookers.length, band, bandShare, gender, genderShare, mood: happy * 2 >= n ? "happy" : "neutral" };
}

// เลือกโฆษณา: ไม่มีผู้ชม = วนตามลำดับ, มีผู้ชม = โฆษณาที่ตรงกลุ่มมากที่สุด
function selectAd(ads, seg, { lastId = null, useDemo = true } = {}) {
  const list = ads.filter(a => a.enabled !== false);
  if (!list.length) return null;
  const loopNext = () => { const i = list.findIndex(a => a.id === lastId); return list[(i + 1) % list.length]; };
  if (!seg || !seg.n) return { ad: loopNext(), reason: "loop", why: "วนตามลำดับ — ยังไม่มีผู้ชมหน้าจอ" };
  const scored = [];
  for (const a of list) {
    let s = 0, ok = true; const parts = [];
    const ages = a.ages || [];
    if (useDemo && ages.length) { if (seg.band && ages.includes(seg.band)) { s += 2; parts.push(BAND_TH[seg.band]); } else ok = false; }
    if (useDemo && a.gender && a.gender !== "any") { if (seg.gender === a.gender) { s += 1; parts.push(GENDER_TH[a.gender]); } else ok = false; }
    if (a.mood && a.mood !== "any") { if (seg.mood === a.mood) { s += 1; parts.push(MOOD_TH[a.mood]); } else ok = false; }
    if (ok && s > 0) scored.push({ a, s, parts });
  }
  if (!scored.length) return { ad: loopNext(), reason: "fallback", why: "ไม่มีโฆษณาที่ตรงกลุ่มผู้ชม — วนตามลำดับ" };
  const best = Math.max(...scored.map(x => x.s));
  const top = scored.filter(x => x.s === best);
  const i = top.findIndex(x => x.a.id === lastId);
  const pick = top[(i + 1) % top.length]; // ถ้ามีหลายตัวเท่ากัน หมุนเวียนกัน
  return { ad: pick.a, reason: "target", why: "แสดงเพราะผู้ชมส่วนใหญ่ " + pick.parts.join(" · ") };
}

// ---------- สถิติ (สะสมแบบไม่ระบุตัวตน) ----------
function newStats(now = Date.now()) {
  const demo = {}; BANDS.forEach(b => { demo[b] = { male: 0, female: 0, unk: 0 }; });
  const gestures = {}; GESTURES.forEach(g => { gestures[g] = 0; });
  return { v: 1, since: now, ads: {}, demo, hourly: {}, totals: { ots: 0, viewers: 0, dwell: 0, attn: 0 }, gestures, selects: {} };
}
function adStat(S, ad) {
  const id = typeof ad === "string" ? ad : ad.id;
  if (!S.ads[id]) S.ads[id] = { title: "", plays: 0, ots: 0, viewers: 0, attn: 0, look: 0, happy: 0 };
  if (typeof ad === "object" && ad.title) S.ads[id].title = ad.title;
  return S.ads[id];
}
function newPlay(adId) { return { adId, seen: new Set(), looked: new Set() }; }

// นับต่อเฟรมให้โฆษณาที่กำลังเล่น: OTS = คนที่อยู่หน้าจอ, viewers = คนที่หันมอง, attention = วินาทีที่มอง (คน·วินาที)
function recordFrame(S, play, present, dt, cfg = SG) {
  if (!play) return;
  const st = adStat(S, play.adId);
  dt = Math.min(cfg.MAX_DT_S, Math.max(0, dt));
  for (const t of present) {
    if (t.frames < cfg.MIN_FRAMES) continue;
    if (!play.seen.has(t.id)) { play.seen.add(t.id); st.ots++; }
    if (t.lookNow) {
      if (!play.looked.has(t.id)) { play.looked.add(t.id); st.viewers++; }
      st.attn += dt; st.look++;
      if (t.happyNow) st.happy++;
    }
  }
}

// เมื่อคนออกจากหน้าจอ: บันทึกเฉพาะสถิติรวม แล้วทิ้งข้อมูลคนนั้น
function finalizeTrack(S, t, useDemo = true, cfg = SG) {
  if (t.frames < cfg.MIN_FRAMES) return false;
  const h = String(new Date(t.first).getHours());
  const H = S.hourly[h] || (S.hourly[h] = { ots: 0, viewers: 0 });
  S.totals.ots++; H.ots++;
  S.totals.dwell += Math.max(0, (t.lastSeen - t.first) / 1000);
  if (t.lookFrames >= 2) { S.totals.viewers++; H.viewers++; S.totals.attn += t.attnS; }
  if (useDemo) { const p = trackProfile(t, cfg); if (p.band) S.demo[p.band][p.gender]++; }
  return true;
}

function adRows(S, ads) {
  const ids = [...new Set([...ads.map(a => a.id), ...Object.keys(S.ads)])];
  return ids.map(id => {
    const s = S.ads[id] || { plays: 0, ots: 0, viewers: 0, attn: 0, look: 0, happy: 0 };
    const ad = ads.find(a => a.id === id);
    return {
      id, title: ad ? ad.title : (s.title || id) + " (ลบแล้ว)",
      plays: s.plays, ots: s.ots, viewers: s.viewers, attn: s.attn,
      avgAttn: s.viewers ? s.attn / s.viewers : 0,
      happyPct: s.look ? s.happy / s.look * 100 : 0,
      viewRate: s.ots ? s.viewers / s.ots * 100 : 0
    };
  });
}

function csvCell(v) { v = v == null ? "" : String(v); if (/^[=+\-@]/.test(v) && isNaN(+v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; }
function buildCsv(S, ads) {
  const out = [["section", "key", "label", "plays", "ots", "viewers", "attention_s", "avg_attention_s", "happy_pct"]];
  adRows(S, ads).forEach(r => out.push(["ad", r.id, r.title, r.plays, r.ots, r.viewers, r.attn.toFixed(1), r.avgAttn.toFixed(1), r.happyPct.toFixed(1)]));
  out.push(["total", "all", "รวมทั้งหมด", "", S.totals.ots, S.totals.viewers, S.totals.attn.toFixed(1), (S.totals.viewers ? S.totals.attn / S.totals.viewers : 0).toFixed(1), ""]);
  BANDS.forEach(b => ["male", "female", "unk"].forEach(g => out.push(["audience_estimate", `${b}_${g}`, `${BAND_TH[b]} ${GENDER_TH[g]}`, "", S.demo[b][g], "", "", "", ""])));
  Object.keys(S.hourly).map(Number).sort((a, b) => a - b).forEach(h => out.push(["hourly", String(h).padStart(2, "0") + ":00", "", "", S.hourly[h].ots, S.hourly[h].viewers, "", "", ""]));
  GESTURES.forEach(g => out.push(["gesture", g, GESTURE_TH[g], S.gestures[g] || 0, "", "", "", "", ""]));
  Object.entries(S.selects).forEach(([k, n]) => out.push(["kiosk_select", k, "", n, "", "", "", "", ""]));
  return "﻿" + out.map(r => r.map(csvCell).join(",")).join("\r\n");
}

// ---------- ท่ามือ (MediaPipe 21 จุด, พิกัด 0..1 ของภาพกล้องที่ยังไม่กลับด้าน) ----------
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function handSize(lm) { return d2(lm[0], lm[9]) || 1e-6; }
function pinchRatio(lm) { return d2(lm[4], lm[8]) / handSize(lm); }
function isOpenPalm(lm) {
  const fingers = [[8, 6], [12, 10], [16, 14], [20, 18]];
  return fingers.every(([tip, pip]) => d2(lm[tip], lm[0]) > d2(lm[pip], lm[0]) * 1.15) && pinchRatio(lm) > 0.6;
}
// ปลายนิ้วชี้ -> ตำแหน่งบนจอ (กลับด้านเหมือนกระจก และขยายขอบให้เอื้อมถึงง่าย)
function mapCursor(p, margin = 0.12) {
  const c = v => Math.min(1, Math.max(0, v));
  return { x: c(((1 - p.x) - margin) / (1 - 2 * margin)), y: c((p.y - margin) / (1 - 2 * margin)) };
}

function createGestureRecognizer(opts = {}) {
  const cfg = { SWIPE_WIN_MS: 400, SWIPE_DX: 0.16, SWIPE_RATIO: 1.5, PINCH_ON: 0.35, PINCH_OFF: 0.55, PALM_HOLD_MS: 700, PALM_STILL: 0.06, COOLDOWN_MS: 700, ...opts };
  let hist = [], pinched = false, palmSince = null, palmX = 0, palmY = 0, palmFired = false, lastFire = -Infinity;
  const fire = (type, t) => { lastFire = t; hist = []; palmSince = null; return { type, t }; };
  return {
    cfg,
    update(lm, t) {
      if (!lm) { hist = []; pinched = false; palmSince = null; palmFired = false; return null; }
      const sx = 1 - lm[0].x, sy = lm[0].y; // ข้อมือในพิกัดจอ (กลับด้าน)
      hist.push({ t, x: sx, y: sy });
      while (hist.length && t - hist[0].t > cfg.SWIPE_WIN_MS) hist.shift();
      const cool = t - lastFire < cfg.COOLDOWN_MS;
      // จีบนิ้ว (มี hysteresis กันสั่น)
      const pr = pinchRatio(lm);
      if (!pinched && pr < cfg.PINCH_ON) { pinched = true; if (!cool) return fire("pinch", t); }
      else if (pinched && pr > cfg.PINCH_OFF) pinched = false;
      if (cool) return null;
      // ปัดซ้าย/ขวา จากความเร็วข้อมือ
      if (!pinched && hist.length >= 3) {
        const dx = sx - hist[0].x, dy = sy - hist[0].y;
        if (Math.abs(dx) >= cfg.SWIPE_DX && Math.abs(dx) >= cfg.SWIPE_RATIO * Math.abs(dy)) return fire(dx < 0 ? "swipe_left" : "swipe_right", t);
      }
      // แบมือนิ่ง ๆ = ย้อนกลับ
      if (isOpenPalm(lm)) {
        if (palmSince == null || Math.hypot(sx - palmX, sy - palmY) > cfg.PALM_STILL) { palmSince = t; palmX = sx; palmY = sy; }
        else if (!palmFired && t - palmSince >= cfg.PALM_HOLD_MS) { palmFired = true; return fire("palm", t); }
      } else { palmSince = null; palmFired = false; }
      return null;
    }
  };
}

// ชี้ค้างบนปุ่มจนครบเวลา = เลือก (ต้องออกจากปุ่มก่อนจึงเลือกซ้ำได้)
function createHoldSelector(holdMs = 1200) {
  let id = null, since = 0, done = false;
  return {
    update(target, t) {
      if (target !== id) { id = target; since = t; done = false; }
      if (!id) return { id: null, progress: 0, fired: false };
      if (done) return { id, progress: 1, fired: false };
      const progress = Math.min(1, (t - since) / holdMs);
      if (progress >= 1) { done = true; return { id, progress: 1, fired: true }; }
      return { id, progress, fired: false };
    }
  };
}

// ---------- โหมดสำรอง: ตรวจจับการเคลื่อนไหว (ไม่ต้องใช้ WebGL) ----------
function toGray(rgba) {
  const g = new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  return g;
}
// จุดศูนย์กลางของพิกเซลที่เปลี่ยน (พิกัด 0..1 ของภาพกล้อง ยังไม่กลับด้าน)
function motionCentroid(prev, cur, w, h, thr = 28) {
  let n = 0, sx = 0, sy = 0;
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) if (Math.abs(cur[i] - prev[i]) > thr) { n++; sx += x; sy += y; }
  return n ? { n, frac: n / (w * h), x: (sx / n + 0.5) / w, y: (sy / n + 0.5) / h } : { n: 0, frac: 0, x: 0.5, y: 0.5 };
}
function createMotionSwipe(opts = {}) {
  const cfg = { WIN_MS: 450, DX: 0.25, RATIO: 1.5, MIN_FRAC: 0.008, MAX_FRAC: 0.35, COOLDOWN_MS: 900, ...opts };
  let hist = [], lastFire = -Infinity;
  return {
    cfg,
    update(m, t) {
      if (!m || m.frac < cfg.MIN_FRAC || m.frac > cfg.MAX_FRAC) { if (hist.length && t - hist.at(-1).t > 150) hist = []; return null; }
      const x = 1 - m.x, y = m.y;
      hist.push({ t, x, y });
      while (hist.length && t - hist[0].t > cfg.WIN_MS) hist.shift();
      if (t - lastFire < cfg.COOLDOWN_MS || hist.length < 3) return null;
      const dx = x - hist[0].x, dy = y - hist[0].y;
      if (Math.abs(dx) >= cfg.DX && Math.abs(dx) >= cfg.RATIO * Math.abs(dy)) { lastFire = t; hist = []; return { type: dx < 0 ? "swipe_left" : "swipe_right", t }; }
      return null;
    }
  };
}

// แบรนด์ตัวอย่างสำหรับเดโม (ร้านกาแฟ) — id คงเดิมเพื่อให้สถิติเดิมและแดชบอร์ดรวมอ้างอิงได้
const DEMO_BRAND = "LENSIQ CAFÉ";
const DEFAULT_ADS = [
  { id: "ad-sport", title: "Matcha Fizz เย็นซ่า", text: "มัทฉะโซดามะนาว สดชื่นหลังเลิกเรียนและออกกำลังกาย", color: "#2563eb", duration: 8, ages: ["u18", "18_34"], gender: "any", mood: "any", enabled: true },
  { id: "ad-family", title: "เซ็ตครอบครัว 4 แก้ว", text: "เลือกเมนูไหนก็ได้ 4 แก้ว พร้อมขนมปังอบใหม่ คุ้มกว่าเดิม 20%", color: "#0f766e", duration: 8, ages: ["35_54"], gender: "any", mood: "any", enabled: true },
  { id: "ad-alkaline", title: "ชาเขียวอุ่น หวานน้อย", text: "ชาเขียวคั่วอุ่น ๆ ไม่เติมน้ำตาล ดื่มง่ายทุกช่วงวัย", color: "#3f6212", duration: 8, ages: ["35_54", "55p"], gender: "any", mood: "any", enabled: true },
  { id: "ad-beauty", title: "Berry Yogurt Smoothie", text: "สมูทตี้เบอร์รี่โยเกิร์ต ไม่เติมน้ำตาล อร่อยแบบไม่รู้สึกผิด", color: "#be185d", duration: 8, ages: ["18_34", "35_54"], gender: "female", mood: "any", enabled: true },
  { id: "ad-smile", title: "ยิ้มรับส่วนลด 15%", text: "ยิ้มให้จอวันนี้ รับโค้ด SMILE15 ที่เคาน์เตอร์", color: "#c2410c", duration: 7, ages: [], gender: "any", mood: "happy", enabled: true },
  { id: "ad-classic", title: "Signature Latte", text: "เอสเปรสโซคั่วกลางกับนมสดฟองนุ่ม เมนูประจำร้าน", color: "#5b3a29", duration: 8, ages: [], gender: "any", mood: "any", enabled: true }
];

const PRODUCTS = [
  { id: "p-classic", name: "Signature Latte", size: "16 ออนซ์", price: "฿65", desc: "เอสเปรสโซคั่วกลางกับนมสดฟองนุ่ม หอมกลมกล่อม", color: "#5b3a29", code: "LATTE10", promo: "ลด 10% เมื่อซื้อครบ 2 แก้ว" },
  { id: "p-sport", name: "Matcha Fizz", size: "16 ออนซ์", price: "฿75", desc: "มัทฉะโซดามะนาว ซ่าสดชื่น หวานน้อย", color: "#15803d", code: "FIZZ15", promo: "ลด 15% สำหรับนักเรียน/นักศึกษา" },
  { id: "p-alkaline", name: "ชาเขียวอุ่น", size: "12 ออนซ์", price: "฿55", desc: "ชาเขียวคั่วอุ่น ๆ ไม่เติมน้ำตาล", color: "#3f6212", code: "TEA20", promo: "แก้วที่ 2 ลด 20 บาท" },
  { id: "p-family", name: "เซ็ตครอบครัว", size: "4 แก้ว + ขนมปัง", price: "฿239", desc: "เลือกเครื่องดื่มได้ 4 แก้ว พร้อมขนมปังอบใหม่", color: "#0f766e", code: "FAMILY", promo: "ฟรีคุกกี้ 2 ชิ้นวันนี้" },
  { id: "p-collagen", name: "Berry Smoothie", size: "16 ออนซ์", price: "฿85", desc: "สมูทตี้เบอร์รี่โยเกิร์ต ไม่เติมน้ำตาล", color: "#be185d", code: "GLOW12", promo: "ซื้อ 5 แก้ว แถม 1 แก้ว" }
];

if (typeof module !== "undefined" && module.exports) module.exports = {
  SG, BANDS, ageBand, estimateYaw, isLooking, iou, newTracker, updateTracks, trackProfile, dominantSegment, selectAd,
  newStats, adStat, newPlay, recordFrame, finalizeTrack, adRows, buildCsv, csvCell,
  pinchRatio, isOpenPalm, mapCursor, createGestureRecognizer, createHoldSelector, toGray, motionCentroid, createMotionSwipe, DEFAULT_ADS, PRODUCTS, DEMO_BRAND
};

// ================= ส่วนหน้าจอ =================
if (typeof document !== "undefined" && typeof faceapi !== "undefined") (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtS = s => s < 60 ? `${s.toFixed(1)} วิ` : `${Math.floor(s / 60)} นาที ${Math.round(s % 60)} วิ`;
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { engine("พื้นที่จัดเก็บเต็ม กรุณาส่งออก CSV แล้วล้างข้อมูล", "err"); } };

  const video = $("#video"), overlay = $("#overlay");
  let ads = load("sg-ads", null); if (!Array.isArray(ads) || !ads.length) ads = structuredClone(DEFAULT_ADS);
  // ย้ายโฆษณาตัวอย่างชุดเก่า (ร้านน้ำดื่ม) เป็นชุดตัวอย่างใหม่ — คงรูปแบบข้อมูลและ id เดิม แก้เฉพาะข้อความ/สี
  { const OLD = /AQUALINE|น้ำแร่|น้ำดื่ม|น้ำด่าง/; let moved = false;
    ads.forEach(a => { const d = DEFAULT_ADS.find(x => x.id === a.id); if (d && OLD.test(`${a.title} ${a.text}`)) { Object.assign(a, { title: d.title, text: d.text, color: d.color }); moved = true; } });
    if (moved) try { localStorage.setItem("sg-ads", JSON.stringify(ads)); } catch {} }
  let stats = load("sg-stats", null); if (!stats || stats.v !== 1) stats = newStats();
  const settings = { useDemo: true, pip: true, ...load("sg-settings", {}) };
  const persistStats = () => save("sg-stats", stats);
  const persistAds = () => save("sg-ads", ads);
  const persistSettings = () => save("sg-settings", settings);

  function engine(msg, cls = "", retry) {
    const e = $("#engine"); e.textContent = msg; e.className = "engine " + cls;
    if (retry) { const b = document.createElement("button"); b.className = "btn ghost"; b.type = "button"; b.textContent = "ลองใหม่"; b.style.cssText = "margin-left:10px;padding:4px 14px"; b.onclick = retry; e.append(b); }
  }

  // ---------- แท็บ ----------
  let tab = "player";
  function setTab(name) {
    tab = name;
    $$(".tabs [role=tab]").forEach(b => { const on = b.dataset.tab === name; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
    $$("[role=tabpanel]").forEach(p => { p.hidden = p.id !== "tab-" + name; });
    // ใช้กล้องตัวเดียว ย้ายวิดีโอไปไว้ที่แท็บที่เปิดอยู่ และหยุดงานของอีกแท็บเพื่อประหยัดการประมวลผล
    if (name === "kiosk") { $("#kpip").prepend(video); if (faceRunning) stopFace(); }
    else { $("#pip").prepend(video); if (handRunning) stopHand(); }
    if (name === "report") renderReport();
    const pf = document.querySelector(".pseudo-fs"); if (pf && !pf.closest("#tab-" + name)) toggleFs();
  }
  $$(".tabs [role=tab]").forEach(b => {
    b.onclick = () => setTab(b.dataset.tab);
    b.onkeydown = e => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const tabs = $$(".tabs [role=tab]"), i = tabs.indexOf(b), n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      n.focus(); setTab(n.dataset.tab);
    };
  });

  // ---------- กล้อง (มือถือ/แท็บเล็ต): เลือกกล้องหน้า/หลัง · สะท้อนภาพเฉพาะกล้องหน้า · ปิดกล้องเมื่อสลับแอปแล้วเปิดต่อ ----------
  const INSECURE_MSG = "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด";
  function createCamera(video, o = {}) {
    const opt = { facing: "user", constraints: {}, layout() {}, onError(e) { console.error(e); }, ...o };
    const BACK = /back|rear|environment|หลัง/i;
    let stream = null, want = { facing: opt.facing, deviceId: "" }, cur = { facing: opt.facing, deviceId: "" }, devices = [], resume = false;
    const uis = [];
    const gum = v => navigator.mediaDevices.getUserMedia({ video: { ...opt.constraints, ...v }, audio: false });
    function halt() { stream?.getTracks().forEach(t => t.stop()); stream = null; if (video.srcObject) video.srcObject = null; }
    async function start(next) {
      if (next) want = { facing: next.facing || want.facing, deviceId: next.deviceId || "" };
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("insecure context"), { name: "Insecure" });
      halt();
      let s;
      try { s = await gum(want.deviceId ? { deviceId: { exact: want.deviceId } } : { facingMode: { ideal: want.facing } }); }
      catch (e) { if (!want.deviceId || !/Overconstrained|NotFound/.test(e.name)) throw e; want.deviceId = ""; s = await gum({ facingMode: { ideal: want.facing } }); }
      stream = s;
      const tr = s.getVideoTracks()[0], st = tr?.getSettings?.() || {};
      cur = { deviceId: st.deviceId || want.deviceId, facing: st.facingMode || (BACK.test(tr?.label || "") ? "environment" : "user") };
      if (tr) tr.addEventListener("ended", () => { if (stream === s) stream = null; });
      video.muted = true; video.playsInline = true; video.setAttribute("playsinline", ""); video.setAttribute("muted", "");
      video.srcObject = s;
      try { await video.play(); } catch (e) { if (e.name !== "AbortError") throw e; }
      if (!video.videoWidth) await new Promise(r => video.addEventListener("loadedmetadata", r, { once: true }));
      opt.layout(api); refreshDevices();
      return s;
    }
    async function refreshDevices() {
      try { devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput"); } catch { devices = []; }
      for (const ui of uis) {
        ui.hidden = devices.length < 2;
        const [flip, sel] = ui.children;
        flip.textContent = cur.facing === "environment" ? "ใช้กล้องหน้า" : "ใช้กล้องหลัง";
        sel.innerHTML = devices.map((d, i) => `<option value="${d.deviceId.replace(/"/g, "&quot;")}">${(d.label || "กล้อง " + (i + 1)).replace(/[<&]/g, "")}</option>`).join("");
        if (cur.deviceId) sel.value = cur.deviceId;
      }
    }
    function switchTo(n) {
      if (!stream) { want = { facing: n.facing || want.facing, deviceId: n.deviceId || "" }; cur = { ...cur, ...want }; return refreshDevices(); }
      start(n).catch(opt.onError);
    }
    const api = {
      start, refreshDevices,
      stop() { resume = false; halt(); },
      get active() { return !!stream && stream.active; },
      get mirrored() { return cur.facing !== "environment"; },
      attach(el) {
        uis.push(el); el.hidden = true;
        el.innerHTML = `<button class="btn ghost" type="button">ใช้กล้องหลัง</button><select aria-label="เลือกกล้อง"></select>`;
        el.children[0].onclick = () => switchTo({ facing: cur.facing === "environment" ? "user" : "environment" });
        el.children[1].onchange = e => switchTo({ deviceId: e.target.value });
        refreshDevices();
      }
    };
    video.addEventListener("resize", () => { if (stream) opt.layout(api); });
    let rt = 0; const relayout = () => { clearTimeout(rt); rt = setTimeout(() => { if (stream) opt.layout(api); }, 150); };
    addEventListener("resize", relayout); addEventListener("orientationchange", relayout);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { if (stream) { resume = true; halt(); } }
      else if (resume) { resume = false; start().catch(opt.onError); }
    });
    addEventListener("pagehide", halt);
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return api;
  }

  // ใช้กล้องตัวเดียวร่วมกันทั้งจอโฆษณาและคีออสก์ (กล้องหน้าเป็นค่าเริ่มต้น เพราะจอหันเข้าหาผู้ชม)
  const CAM_ERR = { Insecure: INSECURE_MSG, NotAllowedError: "ไม่ได้รับอนุญาตให้ใช้กล้อง — กดอนุญาตที่แถบที่อยู่ของเบราว์เซอร์", NotFoundError: "ไม่พบกล้องในเครื่องนี้", NotReadableError: "กล้องถูกโปรแกรมอื่นใช้อยู่ — ปิดโปรแกรมนั้นแล้วลองใหม่", OverconstrainedError: "กล้องไม่รองรับความละเอียดที่ขอ" };
  function camLayout(c) {
    $("#pip").classList.toggle("mirror", c.mirrored); $("#kpip").classList.toggle("mirror", c.mirrored);
    $("#pip").classList.add("on"); $("#kpip").classList.add("on");
    const w = video.videoWidth, h = video.videoHeight; if (!w || !h) return;
    if (overlay.width !== w || overlay.height !== h) { overlay.width = w; overlay.height = h; }
    const hc = $("#hoverlay"); if (hc.width !== w || hc.height !== h) { hc.width = w; hc.height = h; }
    $("#pip").style.aspectRatio = $("#kpip").style.aspectRatio = `${w} / ${h}`;
    mPrev = null;
  }
  const camera = createCamera(video, { constraints: { width: { ideal: 640 }, height: { ideal: 480 } }, layout: camLayout, onError: e => camError(e, "เปิดกล้อง", () => (tab === "kiosk" ? startHand : startFace)()) });
  camera.attach($("#camSwitch")); camera.attach($("#kCamSwitch"));
  async function ensureCamera() { if (!camera.active) await camera.start(); }
  function camError(e, what, retry) {
    console.error(e);
    const m = CAM_ERR[e.name];
    engine(`${what}ไม่สำเร็จ: ${m || "โหลดโมเดลไม่สำเร็จ"} (${e.name}: ${e.message || "-"})`, "err", retry);
  }

  // ---------- โมเดลใบหน้า ----------
  let faceReady = null, backend = "";
  const initBackend = () => LQDetect.tfBackend(); // webgl → wasm → cpu (?cpu ข้าม webgl)
  function loadFace() {
    faceReady ??= initBackend().then(async b => {
      backend = b;
      await Promise.all(["tinyFaceDetector", "faceLandmark68Net", "faceExpressionNet", "ageGenderNet"].map(n => faceapi.nets[n].loadFromUri("vendor/models/")));
    }).catch(e => { faceReady = null; throw e; });
    return faceReady;
  }
  const detOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  const center = pts => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
  async function detectFaces() {
    let q = faceapi.detectAllFaces(video, detOpts).withFaceLandmarks().withFaceExpressions();
    if (settings.useDemo) q = q.withAgeAndGender();
    const rs = await q;
    return rs.map(r => {
      const lm = r.landmarks, yaw = estimateYaw(center(lm.getLeftEye()), center(lm.getRightEye()), lm.getNose()[3]);
      const b = r.detection.box, d = { box: { x: b.x, y: b.y, width: b.width, height: b.height }, look: isLooking(yaw), happy: (r.expressions.happy || 0) >= SG.HAPPY_P };
      if (settings.useDemo && typeof r.age === "number") { d.age = r.age; d.male = r.gender === "male" ? r.genderProbability : 1 - r.genderProbability; }
      return d;
    });
  }

  // ---------- เครื่องเล่นโฆษณา ----------
  const imgUrls = {};
  let cur = null, play = null, seg = null, tracker = newTracker(), faceRunning = false, fpsTimes = [];

  function renderSlide(ad) {
    const el = document.createElement("div");
    el.className = "slide";
    el.style.background = ad.color || "#12425d";
    if (ad.hasImage && imgUrls[ad.id]) el.style.backgroundImage = `linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.65)),url("${imgUrls[ad.id]}")`;
    el.innerHTML = `<div class="slide-in"><small>${DEMO_BRAND}</small><h2>${esc(ad.title)}</h2><p>${esc(ad.text || "")}</p></div>`;
    return el;
  }
  function showAd(sel) {
    if (!sel) { $("#ad").innerHTML = `<div class="slide empty"><div class="slide-in"><h2>ยังไม่มีโฆษณาที่เปิดใช้งาน</h2><p>เพิ่มหรือเปิดใช้โฆษณาในคลังโฆษณาด้านล่าง</p></div></div>`; cur = null; play = null; return; }
    cur = { ...sel, start: performance.now() };
    play = newPlay(sel.ad.id);
    adStat(stats, sel.ad).plays++;
    const box = $("#ad"), old = [...box.children], el = renderSlide(sel.ad);
    box.append(el); requestAnimationFrame(() => el.classList.add("in"));
    old.forEach(o => { o.classList.remove("in"); setTimeout(() => o.remove(), 600); });
    const why = $("#why"); why.textContent = sel.why; why.className = "why " + sel.reason;
    renderNow();
  }
  const nextAd = () => showAd(selectAd(ads, seg, { lastId: cur?.ad.id, useDemo: settings.useDemo }));
  setInterval(() => {
    if (!cur) return;
    const el = performance.now() - cur.start, dur = Math.max(3, +cur.ad.duration || 8) * 1000;
    $("#adProgress").style.width = Math.min(100, el / dur * 100) + "%";
    if (el >= dur) return nextAd();
    // มีผู้ชมเข้ามาระหว่างเล่นโฆษณาทั่วไป: เปลี่ยนไปโฆษณาที่ตรงกลุ่มเร็วขึ้น
    if (cur.reason !== "target" && seg && el > 3000) {
      const s = selectAd(ads, seg, { lastId: cur.ad.id, useDemo: settings.useDemo });
      if (s && s.reason === "target" && s.ad.id !== cur.ad.id) showAd(s);
    }
  }, 250);
  $("#skip").onclick = nextAd;

  function renderNow() {
    if (!cur) { $("#nowPlaying").innerHTML = `<p class="hint">—</p>`; return; }
    const s = stats.ads[cur.ad.id] || {};
    $("#nowPlaying").innerHTML = `<div class="now"><i style="background:${esc(cur.ad.color)}"></i><div><b>${esc(cur.ad.title)}</b><span>${esc(cur.why)}</span></div></div>
      <div class="now-stats"><span>รอบนี้: เห็น ${play?.seen.size || 0} · มอง ${play?.looked.size || 0} คน</span><span>สะสม: เล่น ${s.plays || 0} ครั้ง · มอง ${(s.attn || 0).toFixed(0)} วิ</span></div>`;
  }
  function renderLive(present) {
    const lookers = present.filter(t => t.lookNow && t.frames >= SG.MIN_FRAMES).length;
    const segTxt = !seg ? "—" : [seg.band ? BAND_TH[seg.band] : null, seg.gender ? GENDER_TH[seg.gender] : null, MOOD_TH[seg.mood]].filter(Boolean).join(" · ");
    $("#liveTiles").innerHTML = [
      ["หน้าจอตอนนี้ (OTS)", present.filter(t => t.frames >= SG.MIN_FRAMES).length, "คนที่กล้องเห็น"],
      ["กำลังมองจอ", lookers, "หันหน้าตรงเข้าจอ"],
      ["กลุ่มผู้ชมหลัก", segTxt, settings.useDemo ? "ค่าประมาณ อาจคลาดเคลื่อน" : "ปิดการใช้อายุ/เพศ"],
      ["ผู้ชมสะสม", stats.totals.viewers, `ผ่านหน้าจอ ${stats.totals.ots} คน`]
    ].map(([k, v, s]) => `<div class="tile"><div class="k">${k}</div><div class="v${typeof v === "string" && v.length > 6 ? " sm" : ""}">${esc(v)}</div><div class="s">${s}</div></div>`).join("");
    renderNow();
  }

  function drawFaces(present) {
    const ctx = overlay.getContext("2d"), W = overlay.width;
    ctx.clearRect(0, 0, W, overlay.height);
    ctx.lineWidth = 3; ctx.font = "600 16px Prompt, sans-serif";
    present.forEach(t => {
      const b = t.box, x = camera.mirrored ? W - b.x - b.width : b.x, p = trackProfile(t);
      ctx.strokeStyle = t.lookNow ? "#2ecc71" : "#e6a23c"; ctx.strokeRect(x, b.y, b.width, b.height);
      const label = settings.useDemo && p.band ? `${BAND_TH[p.band]} ${p.gender !== "unk" ? GENDER_TH[p.gender] : ""}` : (t.lookNow ? "มองจอ" : "ไม่ได้มอง");
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = "rgba(11,42,60,.85)"; ctx.fillRect(x, b.y - 24, tw, 22);
      ctx.fillStyle = "#fff"; ctx.fillText(label, x + 5, b.y - 7);
    });
  }

  async function faceLoop() {
    let lastT = Date.now(), lastUi = 0, lastSave = 0;
    while (faceRunning) {
      const t0 = performance.now();
      try {
        if (video.readyState >= 2) {
          const dets = await detectFaces();
          if (!faceRunning) break;
          const now = Date.now();
          const { present, ended } = updateTracks(tracker, dets, now, SG, { W: video.videoWidth || 1, H: video.videoHeight || 1 });
          ended.forEach(t => finalizeTrack(stats, t, settings.useDemo));
          recordFrame(stats, play, present, (now - lastT) / 1000); lastT = now;
          seg = dominantSegment(tracker.tracks.filter(t => now - t.lastSeen < 1000), settings.useDemo);
          drawFaces(present);
          fpsTimes.push(performance.now()); fpsTimes = fpsTimes.filter(x => x > performance.now() - 3000);
          $("#fps").textContent = `${present.length} ใบหน้า · ${(fpsTimes.length / 3).toFixed(1)} fps`;
          if (now - lastUi > 700) { renderLive(present); lastUi = now; }
          if (now - lastSave > 5000) { persistStats(); lastSave = now; }
        }
      } catch (e) { console.error(e); }
      await sleep(Math.max(0, 200 - (performance.now() - t0))); // ~5 fps สูงสุด ไม่ซ้อนงาน เบาพอสำหรับ WASM
    }
  }
  function stopFace() {
    faceRunning = false;
    tracker.tracks.forEach(t => finalizeTrack(stats, t, settings.useDemo));
    tracker = newTracker(); seg = null;
    overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
    $("#startFace").textContent = "เริ่มวัดผู้ชม"; $("#fps").textContent = "หยุดแล้ว";
    persistStats(); renderLive([]);
  }
  async function startFace() {
    $("#startFace").disabled = true;
    engine("กำลังเปิดกล้องและโหลดโมเดลวิเคราะห์ใบหน้า...");
    try {
      await Promise.all([ensureCamera(), loadFace()]);
      overlay.width = video.videoWidth; overlay.height = video.videoHeight;
      engine(`กำลังวัดผู้ชม (ตัวประมวลผล: ${backend.toUpperCase()}${backend === "webgl" ? "" : " — โหมดประหยัด ประมวลผลทุก 0.2 วินาที"})`, "ok");
      faceRunning = true; $("#startFace").textContent = "หยุดวัดผู้ชม";
      faceLoop();
    } catch (e) { camError(e, "เริ่มวัดผู้ชม", startFace); }
    finally { $("#startFace").disabled = false; }
  }
  $("#startFace").onclick = () => faceRunning ? stopFace() : startFace();

  function applyPip() { $("#pip").hidden = !settings.pip; $("#pipToggle").textContent = settings.pip ? "ซ่อนภาพกล้อง" : "แสดงภาพกล้อง"; }
  $("#pipToggle").onclick = () => { settings.pip = !settings.pip; applyPip(); persistSettings(); };
  $("#demoToggle").checked = settings.useDemo;
  $("#demoToggle").onchange = e => {
    settings.useDemo = e.target.checked; persistSettings();
    engine(settings.useDemo ? "เปิดการเลือกโฆษณาตามอายุ/เพศ (ค่าประมาณ)" : "ปิดการใช้อายุ/เพศแล้ว — เลือกโฆษณาจากอารมณ์และการมองเท่านั้น และไม่เก็บสถิติอายุ/เพศ", "ok");
  };
  // เต็มจอ: ใช้ Fullscreen API ถ้ามี (รวม iPad แบบ webkit) ไม่งั้นขยายเต็มหน้าต่างด้วย CSS (iPhone)
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || document.querySelector(".pseudo-fs");
  function toggleFs(el) {
    const cur = fsEl();
    if (cur) {
      if (cur.classList.contains("pseudo-fs")) { cur.classList.remove("pseudo-fs"); document.documentElement.classList.remove("fs-lock"); syncFs(); }
      else (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      return;
    }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    const pseudo = () => { el.classList.add("pseudo-fs"); document.documentElement.classList.add("fs-lock"); syncFs(); };
    if (!req) return pseudo();
    try { const r = req.call(el); if (r?.catch) r.catch(pseudo); } catch { pseudo(); }
  }
  function syncFs() {
    const cur = fsEl();
    $("#fs").textContent = cur === $("#stage") ? "ออกจากเต็มจอ" : "เต็มจอ";
    $("#kFs").textContent = cur === kiosk ? "ออกจากเต็มจอ" : "เต็มจอ";
    if (tab === "report") renderReport();
  }
  $("#fs").onclick = () => toggleFs($("#stage"));
  $$(".fs-exit").forEach(b => { b.onclick = e => { e.stopPropagation(); toggleFs(); }; });
  document.addEventListener("fullscreenchange", syncFs); document.addEventListener("webkitfullscreenchange", syncFs);

  // ---------- คลังโฆษณา (รูปเก็บใน IndexedDB) ----------
  const DB = { name: "sg-media", store: "images" };
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB.name, 1); r.onupgradeneeded = () => r.result.createObjectStore(DB.store); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function idbDo(mode, fn) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(DB.store, mode), st = tx.objectStore(DB.store), r = fn(st); tx.oncomplete = () => { db.close(); res(r?.result); }; tx.onerror = () => { db.close(); rej(tx.error); }; }); }
  const imgPut = (id, blob) => idbDo("readwrite", s => s.put(blob, id));
  const imgGet = id => idbDo("readonly", s => s.get(id));
  const imgDel = id => idbDo("readwrite", s => s.delete(id));
  async function loadImages() {
    for (const a of ads) if (a.hasImage && !imgUrls[a.id]) {
      try { const b = await imgGet(a.id); if (b) imgUrls[a.id] = URL.createObjectURL(b); else a.hasImage = false; } catch (e) { console.warn(e); }
    }
  }

  const form = $("#adForm");
  let editId = null;
  function rulesTxt(a) {
    const r = [];
    if (a.ages?.length) r.push("อายุ " + a.ages.map(b => BAND_TH[b]).join(", "));
    if (a.gender && a.gender !== "any") r.push(GENDER_TH[a.gender]);
    if (a.mood && a.mood !== "any") r.push(MOOD_TH[a.mood]);
    return r.length ? r.join(" · ") : "ผู้ชมทุกกลุ่ม (ใช้วนทั่วไป)";
  }
  function renderLibrary() {
    $("#adList").innerHTML = ads.map(a => `<li class="${a.enabled === false ? "off" : ""}">
      <span class="sw" style="background:${esc(a.color)}${a.hasImage && imgUrls[a.id] ? `;background-image:url('${imgUrls[a.id]}')` : ""}"></span>
      <div class="meta"><b>${esc(a.title)}</b><span>${esc(rulesTxt(a))} · ${a.duration} วิ</span></div>
      <label class="chk"><input type="checkbox" data-act="toggle" data-id="${a.id}" ${a.enabled === false ? "" : "checked"}> เปิด</label>
      <button class="btn ghost sm" type="button" data-act="edit" data-id="${a.id}">แก้ไข</button>
      <button class="btn ghost sm danger" type="button" data-act="del" data-id="${a.id}">ลบ</button></li>`).join("") || `<li class="empty">ยังไม่มีโฆษณา</li>`;
  }
  $("#adList").addEventListener("click", async e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = ads.find(x => x.id === b.dataset.id); if (!a) return;
    if (b.dataset.act === "toggle") { a.enabled = b.checked; persistAds(); renderLibrary(); return; }
    if (b.dataset.act === "edit") return fillForm(a);
    if (b.dataset.act === "del") {
      if (!confirm(`ลบโฆษณา "${a.title}"? (สถิติเดิมยังอยู่ในรายงาน)`)) return;
      ads = ads.filter(x => x !== a); persistAds();
      if (a.hasImage) { imgDel(a.id).catch(console.warn); URL.revokeObjectURL(imgUrls[a.id]); delete imgUrls[a.id]; }
      if (editId === a.id) fillForm(null);
      renderLibrary(); if (cur?.ad.id === a.id) nextAd();
    }
  });
  function fillForm(a) {
    editId = a?.id || null;
    form.elements.title.value = a?.title || ""; form.elements.text.value = a?.text || ""; form.elements.color.value = a?.color || "#2a78d6";
    form.elements.duration.value = a?.duration || 8; form.elements.gender.value = a?.gender || "any"; form.elements.mood.value = a?.mood || "any";
    $$("#adForm [name=ages]").forEach(c => { c.checked = !!a?.ages?.includes(c.value); });
    form.elements.image.value = ""; form.elements.removeImage.checked = false; $("#rmImgWrap").hidden = !a?.hasImage;
    $("#formTitle").textContent = a ? `แก้ไข: ${a.title}` : "เพิ่มโฆษณาใหม่";
    $("#adMsg").textContent = ""; $("#adMsg").className = "form-msg";
    if (a) form.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = (t, c) => { $("#adMsg").textContent = t; $("#adMsg").className = "form-msg " + c; };
    const title = form.elements.title.value.trim();
    if (!title) { form.elements.title.focus(); return msg("กรุณาใส่ชื่อโฆษณา", "err"); }
    const dur = Math.round(+form.elements.duration.value);
    if (!(dur >= 3 && dur <= 60)) { form.elements.duration.focus(); return msg("ระยะเวลาต้องอยู่ระหว่าง 3–60 วินาที", "err"); }
    const file = form.elements.image.files[0];
    if (file && !/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return msg("รองรับเฉพาะรูป PNG, JPG, WEBP หรือ GIF", "err");
    if (file && file.size > 5 * 1024 * 1024) return msg("รูปใหญ่เกิน 5 MB", "err");
    let a = ads.find(x => x.id === editId), imgErr = false;
    if (!a) { a = { id: "ad-" + Date.now().toString(36), enabled: true, hasImage: false }; ads.push(a); }
    Object.assign(a, { title, text: form.elements.text.value.trim(), color: form.elements.color.value, duration: dur, gender: form.elements.gender.value, mood: form.elements.mood.value, ages: $$("#adForm [name=ages]:checked").map(c => c.value) });
    try {
      if (file) { await imgPut(a.id, file); if (imgUrls[a.id]) URL.revokeObjectURL(imgUrls[a.id]); imgUrls[a.id] = URL.createObjectURL(file); a.hasImage = true; }
      else if (form.elements.removeImage.checked && a.hasImage) { await imgDel(a.id); URL.revokeObjectURL(imgUrls[a.id]); delete imgUrls[a.id]; a.hasImage = false; }
    } catch (err) { console.error(err); imgErr = true; }
    adStat(stats, a); persistAds(); renderLibrary(); fillForm(null);
    if (imgErr) msg(`บันทึก "${title}" แล้ว แต่บันทึกรูปไม่สำเร็จ (เบราว์เซอร์อาจปิด IndexedDB)`, "err"); else msg(`บันทึก "${title}" แล้ว`, "ok");
    if (cur?.ad.id === a.id) showAd({ ...cur, ad: a });
  });
  $("#newAd").onclick = () => fillForm(null);
  $("#resetAds").onclick = async () => {
    if (!confirm("คืนค่าโฆษณาตัวอย่าง? โฆษณาและรูปที่อัปโหลดจะถูกลบ (สถิติยังอยู่)")) return;
    for (const a of ads) if (a.hasImage) { await imgDel(a.id).catch(console.warn); URL.revokeObjectURL(imgUrls[a.id]); delete imgUrls[a.id]; }
    ads = structuredClone(DEFAULT_ADS); persistAds(); renderLibrary(); fillForm(null); nextAd();
  };

  // ---------- คีออสก์ไร้สัมผัส ----------
  let kIdx = 0, kDetail = null, landmarker = null, handLoading = null, handDelegate = "", handRunning = false;
  const recog = createGestureRecognizer(), holder = createHoldSelector(1200);
  const cursor = { x: 0.5, y: 0.5, on: false };
  const kiosk = $("#kiosk"), kc = $("#kCursor"), ring = $("#kRing");
  const RING_LEN = 2 * Math.PI * 22;
  ring.style.strokeDasharray = RING_LEN;

  function renderKiosk() {
    const n = PRODUCTS.length, at = i => PRODUCTS[(i + n) % n];
    $("#kTrack").innerHTML = [-1, 0, 1].map(o => { const p = at(kIdx + o); return `<div class="pcard ${o ? "side" : "main"}" style="--c:${p.color}">
      <div class="bottle" aria-hidden="true"><svg viewBox="0 0 40 90"><path d="M25 2l-3 14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><rect x="4" y="14" width="32" height="7" rx="3" fill="currentColor"/><path d="M7 23h26l-3 59a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z" fill="currentColor" opacity=".9"/><path d="M8.2 44h23.6l-.9 19H9.1z" fill="#fff" opacity=".85"/></svg></div>
      <b>${esc(p.name)}</b><span>${esc(p.size)}</span><em>${esc(p.price)}</em></div>`; }).join("");
    $("#kDots").innerHTML = PRODUCTS.map((p, i) => `<i class="${i === (kIdx % n + n) % n ? "on" : ""}"></i>`).join("");
    $("#kList").hidden = !!kDetail; $("#kDetail").hidden = !kDetail;
    if (kDetail) {
      $("#kDetailBody").innerHTML = `<div class="pdetail" style="--c:${kDetail.color}"><div><small>รายละเอียดสินค้า</small><h2>${esc(kDetail.name)}</h2><p>${esc(kDetail.desc)}</p><p class="price">${esc(kDetail.size)} · ${esc(kDetail.price)}</p></div>
        <div class="promo"><span>${esc(kDetail.promo)}</span><b>${esc(kDetail.code)}</b><small>แสดงโค้ดนี้ที่แคชเชียร์</small></div></div>`;
    }
  }
  const toast = t => { const el = $("#kToast"); el.textContent = t; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); };
  function kAction(name, via) {
    const n = PRODUCTS.length;
    if (name === "next" && !kDetail) kIdx = (kIdx + 1) % n;
    else if (name === "prev" && !kDetail) kIdx = (kIdx - 1 + n) % n;
    else if (name === "select" && !kDetail) { kDetail = PRODUCTS[kIdx]; stats.selects[kDetail.id] = (stats.selects[kDetail.id] || 0) + 1; persistStats(); }
    else if (name === "back" && kDetail) kDetail = null;
    else return;
    if (via) { stats.gestures[via] = (stats.gestures[via] || 0) + 1; persistStats(); toast(GESTURE_TH[via]); }
    renderKiosk();
  }
  kiosk.addEventListener("click", e => { const b = e.target.closest("[data-hold]"); if (b) kAction(b.dataset.hold); });
  $("#kFs").onclick = () => toggleFs(kiosk);
  // แตะ/ปัดบนจอสัมผัสได้ด้วย (สำรองเมื่อไม่ใช้กล้อง)
  { let sx = null, sy = 0;
    kiosk.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse") { sx = e.clientX; sy = e.clientY; } });
    kiosk.addEventListener("pointerup", e => {
      if (sx == null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy) && !e.target.closest("button")) kAction(dx < 0 ? "next" : "prev");
    });
    kiosk.addEventListener("pointercancel", () => { sx = null; }); }
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && document.querySelector(".pseudo-fs")) { toggleFs(); return; }
    if (tab !== "kiosk" || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const k = { ArrowRight: "next", ArrowLeft: "prev", Enter: "select", Escape: "back", Backspace: "back" }[e.key];
    if (k && !(e.key === "Enter" && document.activeElement.tagName === "BUTTON")) { e.preventDefault(); kAction(k); }
  });

  function holdTargetAt(px, py) {
    for (const el of kiosk.querySelectorAll("[data-hold]")) {
      if (el.closest("[hidden]")) continue;
      const r = el.getBoundingClientRect();
      if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) return el;
    }
    return null;
  }
  function drawHand(lm) {
    const c = $("#hoverlay"), ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    if (!lm) return;
    ctx.fillStyle = "#6cc4e3";
    lm.forEach((p, i) => { ctx.beginPath(); ctx.arc(p.x * c.width, p.y * c.height, i === 8 ? 6 : 3, 0, 7); ctx.fill(); });
  }
  // เคอร์เซอร์ + ชี้ค้างเลือก (ใช้ร่วมกันทั้งโหมด MediaPipe และโหมดสำรอง)
  function moveCursor(m, t, smooth = 0.5) {
    cursor.x = cursor.on ? cursor.x * smooth + m.x * (1 - smooth) : m.x; cursor.y = cursor.on ? cursor.y * smooth + m.y * (1 - smooth) : m.y; cursor.on = true;
    const r = kiosk.getBoundingClientRect(), px = r.left + cursor.x * r.width, py = r.top + cursor.y * r.height;
    kc.hidden = false; kc.style.transform = `translate(${cursor.x * r.width}px,${cursor.y * r.height}px)`;
    const target = holdTargetAt(px, py);
    $$("#kiosk [data-hold].hover").forEach(el => { if (el !== target) el.classList.remove("hover"); });
    target?.classList.add("hover");
    const h = holder.update(target?.dataset.hold || null, t);
    ring.style.strokeDashoffset = RING_LEN * (1 - h.progress);
    if (h.fired) kAction(h.id, "hold");
    return { target, fired: h.fired };
  }
  function hideCursor(t) {
    cursor.on = false; kc.hidden = true; holder.update(null, t);
    $$("#kiosk [data-hold].hover").forEach(el => el.classList.remove("hover"));
  }
  function onGesture(type, target) {
    $("#gesture").textContent = "ท่าล่าสุด: " + GESTURE_TH[type];
    if (type === "swipe_left") kAction("next", "swipe_left");
    else if (type === "swipe_right") kAction("prev", "swipe_right");
    else if (type === "palm") kAction("back", "palm");
    else if (type === "pinch") kAction(target ? target.dataset.hold : (kDetail ? "back" : "select"), "pinch");
  }
  function processHand(lm, t) {
    drawHand(lm);
    const g = recog.update(lm, t);
    if (!lm) { hideCursor(t); $("#gesture").textContent = "ไม่พบมือ — ยกมือให้กล้องเห็น"; return; }
    const { target, fired } = moveCursor(mapCursor(lm[8]), t);
    if (!fired && g) onGesture(g.type, target);
  }

  // โหมดสำรองเมื่อไม่มี WebGL (MediaPipe บนเว็บต้องใช้ WebGL รับภาพเสมอ): ตรวจจับการเคลื่อนไหวจากภาพย่อ 80×60
  const MW = 80, MH = 60;
  let mCtx = null, mPrev = null, mLast = 0;
  const mSwipe = createMotionSwipe();
  function processMotion(t) {
    if (!mCtx) { const c = document.createElement("canvas"); c.width = MW; c.height = MH; mCtx = c.getContext("2d", { willReadFrequently: true }); }
    mCtx.drawImage(video, 0, 0, MW, MH);
    const g = toGray(mCtx.getImageData(0, 0, MW, MH).data);
    const m = mPrev ? motionCentroid(mPrev, g, MW, MH) : null; mPrev = g;
    drawMotion(m);
    const ev = mSwipe.update(m, t);
    if (m && m.frac >= mSwipe.cfg.MIN_FRAC && m.frac <= mSwipe.cfg.MAX_FRAC) {
      mLast = t;
      const { fired } = moveCursor({ x: 1 - m.x, y: m.y }, t, 0.7);
      if (!fired && ev) onGesture(ev.type, null);
    } else if (t - mLast > 600) { hideCursor(t); $("#gesture").textContent = "โหมดสำรอง: โบกมือเบา ๆ ค้างบนปุ่ม หรือปัดมือซ้าย/ขวา"; }
  }
  function drawMotion(m) {
    const c = $("#hoverlay"), ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    if (!m || !m.n) return;
    ctx.fillStyle = "rgba(108,196,227,.85)"; ctx.beginPath(); ctx.arc(m.x * c.width, m.y * c.height, 10, 0, 7); ctx.fill();
  }

  const hasWebGL = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } };
  async function loadHand() {
    if (!hasWebGL()) { handDelegate = "MOTION"; return; }
    handLoading ??= (async () => {
      const { FilesetResolver, HandLandmarker } = await import("./vendor/mediapipe/vision_bundle.mjs");
      const files = await FilesetResolver.forVisionTasks(new URL("vendor/mediapipe/wasm", location.href).href);
      const modelAssetPath = new URL("vendor/models/hand_landmarker.task", location.href).href;
      let err;
      for (const delegate of ["GPU", "CPU"]) {
        try { landmarker = await HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath, delegate }, runningMode: "VIDEO", numHands: 1 }); handDelegate = delegate; return; }
        catch (e) { err = e; console.warn(delegate, e); }
      }
      throw err || new Error("HandLandmarker");
    })().catch(e => { handLoading = null; throw e; });
    return handLoading;
  }
  function useMotionMode(reason) {
    handDelegate = "MOTION"; mPrev = null; hideCursor(performance.now());
    engine(`${reason} — ใช้โหมดสำรองตรวจจับการเคลื่อนไหวแทน: ปัดมือซ้าย/ขวาเพื่อเลื่อน และโบกมือเบา ๆ ค้างบนปุ่ม 1.2 วินาทีเพื่อเลือก (จีบนิ้ว/แบมือใช้ไม่ได้ในโหมดนี้)`, "warn");
  }
  async function handLoop() {
    let lastTs = 0, fails = 0;
    while (handRunning) {
      const t0 = performance.now();
      try {
        if (video.readyState >= 2) {
          const ts = Math.max(lastTs + 1, performance.now()); lastTs = ts;
          if (handDelegate === "MOTION") processMotion(ts);
          else { const r = landmarker.detectForVideo(video, ts); fails = 0; processHand(r.landmarks?.[0] || null, ts); }
        }
      } catch (e) {
        console.error(e);
        if (handDelegate !== "MOTION" && ++fails >= 5) useMotionMode("ตรวจจับมือด้วย MediaPipe ไม่สำเร็จต่อเนื่อง");
      }
      await sleep(Math.max(0, 66 - (performance.now() - t0))); // ~15 fps
    }
  }
  function stopHand() {
    handRunning = false; hideCursor(performance.now()); drawHand(null);
    $("#startHand").textContent = "เริ่มสั่งงานด้วยมือ"; $("#gesture").textContent = "หยุดแล้ว — ใช้เมาส์หรือปุ่มลูกศรได้";
  }
  async function startHand() {
    $("#startHand").disabled = true;
    engine("กำลังเปิดกล้องและโหลดโมเดลตรวจจับมือ...");
    try {
      await Promise.all([ensureCamera(), loadHand()]);
      const c = $("#hoverlay"); c.width = video.videoWidth; c.height = video.videoHeight;
      if (handDelegate === "MOTION") useMotionMode("เครื่องนี้ไม่รองรับ WebGL ซึ่งจำเป็นสำหรับโมเดลตรวจจับมือ");
      else engine(`คีออสก์พร้อม (ตรวจจับมือด้วย ${handDelegate === "GPU" ? "GPU" : "CPU — อาจช้ากว่าปกติ"})`, "ok");
      handRunning = true; $("#startHand").textContent = "หยุดสั่งงานด้วยมือ";
      handLoop();
    } catch (e) { camError(e, "เปิดคีออสก์", startHand); }
    finally { $("#startHand").disabled = false; }
  }
  $("#startHand").onclick = () => handRunning ? stopHand() : startHand();

  // ---------- รายงาน ----------
  function bars(canvas, labels, series, { stacked = false } = {}) {
    const dpr = devicePixelRatio || 1, W = canvas.clientWidth || 520, H = 220;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.height = H + "px";
    const ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const L = 34, R = 8, T = series.length > 1 ? 26 : 10, B = 26;
    const totals = labels.map((_, i) => stacked ? series.reduce((s, x) => s + x.values[i], 0) : Math.max(...series.map(x => x.values[i])));
    let max = Math.max(1, ...totals); max = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
    const y = v => T + (1 - v / max) * (H - T - B);
    ctx.font = "11px Prompt, sans-serif"; ctx.textBaseline = "middle";
    for (let k = 0; k <= 4; k++) {
      const v = max * k / 4; ctx.strokeStyle = k ? "#e6edf1" : "#9fb1bc"; ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(W - R, y(v)); ctx.stroke();
      ctx.fillStyle = "#52514e"; ctx.textAlign = "right"; ctx.fillText(Math.round(v), L - 6, y(v));
    }
    const gw = (W - L - R) / labels.length, every = Math.ceil(labels.length / Math.max(1, Math.floor((W - L) / 46)));
    labels.forEach((lab, i) => {
      const x0 = L + i * gw + gw * 0.15, inner = gw * 0.7, bw = stacked ? inner : inner / series.length;
      let acc = 0;
      series.forEach((s, si) => {
        const v = s.values[i]; if (!v) return;
        const top = y(stacked ? acc + v : v), bot = stacked ? y(acc) : y(0);
        ctx.fillStyle = s.color; ctx.fillRect(stacked ? x0 : x0 + si * bw + 1, top, Math.max(2, bw - 2), bot - top);
        acc += v;
      });
      if (i % every === 0) { ctx.fillStyle = "#52514e"; ctx.textAlign = "center"; ctx.fillText(lab, L + i * gw + gw / 2, H - 12); }
    });
    if (series.length > 1) {
      let lx = L; ctx.textAlign = "left";
      series.forEach(s => { ctx.fillStyle = s.color; ctx.fillRect(lx, 6, 10, 10); ctx.fillStyle = "#16303f"; ctx.fillText(s.name, lx + 14, 11); lx += ctx.measureText(s.name).width + 32; });
    }
  }
  const C1 = "#2a78d6", C2 = "#eb6834";
  function renderReport() {
    if (tab !== "report") return;
    const T = stats.totals, rows = adRows(stats, ads);
    $("#repTiles").innerHTML = [
      ["ผ่านหน้าจอ (OTS)", T.ots, "คน"], ["ผู้ชม (มองจอ)", T.viewers, T.ots ? `${Math.round(T.viewers / T.ots * 100)}% ของ OTS` : "—"],
      ["เวลาอยู่หน้าจอเฉลี่ย", T.ots ? fmtS(T.dwell / T.ots) : "—", "ต่อคน"], ["เวลามองเฉลี่ย", T.viewers ? fmtS(T.attn / T.viewers) : "—", "ต่อผู้ชม"],
      ["รอบโฆษณาที่เล่น", rows.reduce((s, r) => s + r.plays, 0), "ครั้ง"], ["สั่งงานด้วยมือ", GESTURES.reduce((s, g) => s + (stats.gestures[g] || 0), 0), "ครั้ง"]
    ].map(([k, v, s]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");
    $("#adTable").innerHTML = `<thead><tr><th>โฆษณา</th><th class="n">เล่น</th><th class="n">OTS</th><th class="n">ผู้ชม</th><th class="n">อัตรามอง</th><th class="n">เวลามองเฉลี่ย</th><th class="n">ยิ้ม %</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.title)}</td><td class="n">${r.plays}</td><td class="n">${r.ots}</td><td class="n">${r.viewers}</td><td class="n">${r.ots ? r.viewRate.toFixed(0) + "%" : "–"}</td><td class="n">${r.viewers ? r.avgAttn.toFixed(1) + " วิ" : "–"}</td><td class="n">${r.viewers ? r.happyPct.toFixed(0) + "%" : "–"}</td></tr>`).join("")}</tbody>`;
    bars($("#chAge"), BANDS.map(b => BAND_TH[b]), [{ name: "ชาย", color: C1, values: BANDS.map(b => stats.demo[b].male) }, { name: "หญิง", color: C2, values: BANDS.map(b => stats.demo[b].female) }]);
    const unk = BANDS.reduce((s, b) => s + stats.demo[b].unk, 0);
    $("#ageNote").textContent = `ค่าประมาณจากโมเดล อาจคลาดเคลื่อนและมีอคติ · ไม่แน่ใจเพศ ${unk} คน${settings.useDemo ? "" : " · ขณะนี้ปิดการเก็บอายุ/เพศ"}`;
    const hs = Object.keys(stats.hourly).map(Number), h0 = Math.min(8, ...hs), h1 = Math.max(20, ...hs), H = [];
    for (let h = h0; h <= h1; h++) H.push(h);
    bars($("#chHour"), H.map(h => String(h).padStart(2, "0")), [{ name: "ผู้ชม (มองจอ)", color: C1, values: H.map(h => stats.hourly[h]?.viewers || 0) }, { name: "ผ่านแต่ไม่มอง", color: C2, values: H.map(h => Math.max(0, (stats.hourly[h]?.ots || 0) - (stats.hourly[h]?.viewers || 0))) }], { stacked: true });
    bars($("#chGest"), GESTURES.map(g => GESTURE_TH[g]), [{ name: "ครั้ง", color: C1, values: GESTURES.map(g => stats.gestures[g] || 0) }]);
    bars($("#chAttn"), rows.map(r => r.title.length > 12 ? r.title.slice(0, 11) + "…" : r.title), [{ name: "เวลามองรวม (วิ)", color: C1, values: rows.map(r => +r.attn.toFixed(1)) }]);
    $("#since").textContent = "เก็บข้อมูลตั้งแต่ " + new Date(stats.since).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
    const sel = Object.entries(stats.selects);
    $("#selList").innerHTML = sel.length ? sel.sort((a, b) => b[1] - a[1]).map(([id, n]) => `<li><span>${esc(PRODUCTS.find(p => p.id === id)?.name || id)}</span><b>${n} ครั้ง</b></li>`).join("") : `<li class="empty">ยังไม่มีการเลือกสินค้าที่คีออสก์</li>`;
  }
  setInterval(renderReport, 2000);
  addEventListener("resize", () => renderReport());

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $("#exportCsv").onclick = () => { persistStats(); download(`signage-report-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(stats, ads), "text/csv;charset=utf-8"); };
  $("#clearStats").onclick = () => {
    if (!confirm("ล้างสถิติทั้งหมด? (ควรส่งออก CSV ก่อน) โฆษณาในคลังจะยังอยู่")) return;
    tracker = newTracker(); stats = newStats(); if (cur) adStat(stats, cur.ad).plays++; play = cur ? newPlay(cur.ad.id) : null;
    persistStats(); renderReport(); renderLive([]); engine("ล้างสถิติแล้ว", "ok");
  };
  $("#wipeAll").onclick = async () => {
    if (!confirm("ลบข้อมูลทั้งหมดของหน้านี้ในเครื่องนี้? (สถิติ การตั้งค่า โฆษณา และรูปที่อัปโหลด)")) return;
    Object.keys(localStorage).filter(k => k.startsWith("sg-")).forEach(k => localStorage.removeItem(k));
    try { await new Promise(r => { const q = indexedDB.deleteDatabase(DB.name); q.onsuccess = q.onerror = q.onblocked = r; }); } catch {}
    Object.values(imgUrls).forEach(u => URL.revokeObjectURL(u)); Object.keys(imgUrls).forEach(k => delete imgUrls[k]);
    ads = structuredClone(DEFAULT_ADS); stats = newStats(); tracker = newTracker();
    renderLibrary(); fillForm(null); nextAd(); renderReport(); renderLive([]);
    engine("ลบข้อมูลทั้งหมดแล้ว (ระบบไม่เคยบันทึกภาพจากกล้อง)", "ok");
  };

  addEventListener("beforeunload", () => { tracker.tracks.forEach(t => finalizeTrack(stats, t, settings.useDemo)); persistStats(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) persistStats(); });

  // ---------- เริ่มต้น ----------
  applyPip(); renderKiosk(); renderLive([]); fillForm(null);
  loadImages().finally(() => { renderLibrary(); nextAd(); });
  engine("พร้อมใช้งาน — กด \"เริ่มวัดผู้ชม\" เพื่อเปิดกล้อง (ยังไม่มีการวัดผล โฆษณาวนตามลำดับ)");
})();
