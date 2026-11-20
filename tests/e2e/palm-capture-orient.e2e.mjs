// tests/e2e/palm-capture-orient.e2e.mjs — FIXED TEST SET "palm-capture-orient" (owner request 2026-11-20: when another person
// takes the photo the dashed hand guide pointed the wrong way: fingers down, or the hand mirrored). Locked in
// evals-locks/palm-capture-orient.sha256 (~/LENSIQ-field/evals/palm-capture-orient/) BEFORE the product change.
// palm.html with window.LENSIQ_PALM_V2 = true (set before load; the shipped switch stays off). 360 px wide, one browser.
// DRAWN SYNTHETIC hands only (tests/fixtures/palm-v2/synth-capture.js + synth-orient.js), never a photo of a person; every
// number is SYNTHETIC. The test camera streams a canvas with the drawn hand (plus sensor grain) at the scripted turn.
//  D  default own hand (TH / EN / ZH): "ถ่ายมือตัวเอง" is selected at load, each mode button has an icon and the exact label
//     (TH / EN / ZH exact, owner decision 191), the consent line is hidden, the "rotate frame" button has its exact label, the
//     guide points up (angle 0, from the mode).
//  C  "ถ่ายให้คนอื่น" (TH / EN / ZH): the existing consent line appears with its exact text, the camera waits for the tick, the
//     guide turns 180 degrees; back to own hand: the line hides and the guide points up again.
//  R  the rotate button flips the guide 180 degrees in both modes (state and the drawn outline on the guide canvas).
//  N  the guide never blocks capture because of orientation: with the drawn hand at 0 / 90 / 180 / 270 degrees (own hand) and
//     at 180 degrees for someone else (guide flipped or not), the automatic capture fires; the "straighten" (tilt) and "open"
//     hints never appear.
//  L  with hand points (demo profile, LENSIQ_PALM_LANDMARKS; the hand-point call is a stub returning drawn landmark sets) the
//     guide follows the hand in real time: angle and left / right appearance (mirror) of the detected hand.
//  H  left / right from the thumb in the captured photo: a left-hand photo (no side chosen) shows the chip "มือซ้าย ✓
//     แตะเพื่อเปลี่ยน" (TH / EN / ZH), the reading says which hand it reads; tapping the chip changes it and the reading follows;
//     a left hand photographed fingers-down also reads as left.
//  O  orientation-free capture end to end: the same drawn hand uploaded at 0 / 90 / 180 / 270 degrees gives the same lines
//     (status; curves within 0.03 palm widths) and the same hand; the photo is shown fingers-up after the 7 taps.
//  W  line wrap at 360 px (TH / EN / ZH): own-hand screen, someone-else screen with the consent line, the chip and the reading:
//     no finding of the line-wrap rules (tests/e2e/line-wrap-kit.mjs PROBE, its exceptions), no sideways overflow.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";
import { PROBE, excepted } from "./line-wrap-kit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SYNTHC = readFileSync(join(here, "..", "fixtures", "palm-v2", "synth-capture.js"), "utf8");
const SYNTHO = readFileSync(join(here, "..", "fixtures", "palm-v2", "synth-orient.js"), "utf8");
const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const LI = { th: 0, en: 1, zh: 2 };
const TAP_ORDER = ["wrist", "indexBase", "pinkyBase", "indexTip", "middleTip", "ringTip", "pinkyTip"];
const TEXTS = {
  "mode.self": ["ถ่ายมือตัวเอง", "Photo of my hand", "拍自己的手"],
  "mode.other": ["ถ่ายให้คนอื่น", "Photo for someone else", "帮别人拍"],
  "guide.rotate": ["หมุนกรอบ", "Rotate frame", "旋转框"],
  "side.chip.right": ["มือขวา ✓ แตะเพื่อเปลี่ยน", "Right hand ✓ Tap to change", "右手 ✓ 点击更改"],
  "side.chip.left": ["มือซ้าย ✓ แตะเพื่อเปลี่ยน", "Left hand ✓ Tap to change", "左手 ✓ 点击更改"],
  "reading.side.right": ["อ่านจากมือขวา", "Reading of the right hand", "解读的是右手"],
  "reading.side.left": ["อ่านจากมือซ้าย", "Reading of the left hand", "解读的是左手"]
};
const CONSENT = [
  "ถ่ายภาพมือของคนอื่นได้เฉพาะเมื่อเจ้าของมือรู้และยินยอมแล้วเท่านั้น ภาพไม่ถูกบันทึกและไม่ถูกส่งออกจากเครื่องนี้",
  "Photograph another person's hand only when they know and agree. The photo is not saved and does not leave this device.",
  "仅在对方知情并同意的情况下拍摄其手掌。照片不会被保存，也不会离开本设备。"
];
const tx = (k, lang) => TEXTS[k][LI[lang]];
const angDiff = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);

const LANG = lang => `try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`;
/* the test camera: one rear camera streaming a 240 x 320 canvas; window.__camScene = { hand, deg, mir } draws the drawn
   synthetic right palm (pw 100, centred on a square so every turn keeps the frame) turned deg clockwise, with sensor grain */
const CAM = `(() => {
  const md = navigator.mediaDevices; if (!md) return;
  const W = 240, H = 320, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const cx = cv.getContext("2d", { willReadFrequently: true }), cache = {};
  window.__camScene = { hand: true, deg: 0, mir: false };
  let base = null;
  function img(sc) {
    const key = sc.deg + "|" + !!sc.mir; if (cache[key]) return cache[key];
    if (!base) { const im = PalmCapSynth.palmImage({ pw: 100 }); base = PalmOrientSynth.pad({ w: im.w, h: im.h, rgba: im.rgba }, Math.ceil(Math.hypot(im.w, im.h))); }
    let t = sc.mir ? PalmOrientSynth.mirror(base) : base;
    t = sc.deg % 90 === 0 ? PalmOrientSynth.quarter(t, sc.deg / 90) : PalmOrientSynth.rotate(t, sc.deg);
    const c = document.createElement("canvas"); c.width = t.w; c.height = t.h; c.getContext("2d").putImageData(new ImageData(t.rgba, t.w, t.h), 0, 0);
    return (cache[key] = c);
  }
  let seed = 9;
  function draw() {
    const sc = window.__camScene || {};
    cx.fillStyle = "rgb(60,80,110)"; cx.fillRect(0, 0, W, H);
    if (sc.hand) cx.drawImage(img(sc), 0, (H - W) / 2, W, W);
    const d = cx.getImageData(0, 0, W, H), p = d.data;
    for (let i = 0; i < p.length; i += 4) { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; const g = (seed / 4294967296 * 2 - 1) * 10;
      p[i] += g; p[i + 1] += g; p[i + 2] += g; }
    cx.putImageData(d, 0, 0);
  }
  setInterval(draw, 66);
  md.enumerateDevices = async () => [{ deviceId: "orient-cam", groupId: "g", kind: "videoinput", label: "Back Camera", toJSON() { return {}; } }];
  md.getUserMedia = async () => { draw(); const s = cv.captureStream(15), tr = s.getVideoTracks()[0];
    const gs = tr.getSettings.bind(tr); tr.getSettings = () => Object.assign({}, gs(), { deviceId: "orient-cam", width: W, height: H, facingMode: "environment" });
    tr.applyConstraints = async () => undefined; return s; };
})();`;

async function open(browser, base, { lang = "th", cam = false, demo = false } = {}) {
  const init = [LANG(lang), SYNTHC, SYNTHO, "window.LENSIQ_PALM_V2 = true;"].concat(demo ? ["window.LENSIQ_PROFILE = 'demo';"] : [], cam ? [CAM] : []);
  const page = await browser.newPage(null, { initScripts: init });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/palm.html?cpu`);
  await page.waitFor(`!!(window.__palmV2 && window.__palmV2.ready)`, 20000);
  await page.evaluate("document.fonts ? document.fonts.ready.then(() => 1) : 1");
  return page;
}
const click = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) throw new Error("no " + s); e.scrollIntoView({ block: "center", behavior: "instant" });
  e.click(); return true; }, sel);
const shown = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!(e && e.offsetParent && getComputedStyle(e).visibility !== "hidden"); }, sel);
const guide = page => page.evaluate(() => window.__palmV2.guide);
async function mouse(page, type, p) { await page.send("Input.dispatchMouseEvent", { type, x: p[0], y: p[1], button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1,
  pointerType: "mouse" }); }
async function tapAt(page, p) { await mouse(page, "mousePressed", p); await mouse(page, "mouseReleased", p); await sleep(60); }
/** a drawn synthetic palm through the real upload control: palmImage(o), mirrored (mir) then turned q quarter turns clockwise */
const upload = (page, o, q = 0, mir = false) => page.evaluate(async (o, q, mir) => {
  const im0 = PalmCapSynth.palmImage(o); let im = { w: im0.w, h: im0.h, rgba: im0.rgba, taps: im0.taps };
  if (mir) im = PalmOrientSynth.mirror(im);
  im = PalmOrientSynth.quarter(im, q);
  const c = document.createElement("canvas"); c.width = im.w; c.height = im.h;
  c.getContext("2d").putImageData(new ImageData(im.rgba, im.w, im.h), 0, 0);
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  const dt = new DataTransfer(); dt.items.add(new File([blob], "synthetic-palm.png", { type: "image/png" }));
  const inp = document.getElementById("pv2File"); inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true }));
  return im.taps;
}, o, q, mir);
async function tapAll(page, taps) {
  await page.waitFor(`!document.getElementById("pv2Work").hidden && /^1\\/7/.test(document.getElementById("pv2TapMsg").textContent)`, 20000);
  await sleep(150);
  for (const k of TAP_ORDER) await tapAt(page, await page.evaluate(q => window.__palmV2.imgToClient(q), taps[k]));
  await page.waitFor(`document.querySelectorAll("#pv2List [data-line]").length === 10 && !window.__palmV2.busy`, 40000);
  await sleep(200);
}
/** found / added lines as curves (catmull, 40 points per span) in palm-frame u, v */
const lines = page => page.evaluate(() => { const st = window.__palmV2.state(), out = {};
  window.PalmV2.LINES.forEach(id => { const L = st.lines[id]; out[id] = { status: L.status, pts: L.cp ? window.PalmV2.catmull(L.cp, 40) : null }; }); return out; });
function curveDist(A, B) {
  const near = (P, Q) => P.reduce((s, p) => s + Math.min(...Q.map(q => Math.hypot(p[0] - q[0], p[1] - q[1]))), 0) / P.length;
  return (near(A, B) + near(B, A)) / 2;
}
/** ink of the guide canvas: offset of the drawn outline's centre from the canvas centre (canvas px) */
const ink = page => page.evaluate(() => { const c = document.getElementById("pv2Guide"), g = c.getContext("2d"), d = g.getImageData(0, 0, c.width, c.height).data;
  let sx = 0, sy = 0, n = 0; for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) if (d[(y * c.width + x) * 4 + 3] > 40) { sx += x; sy += y; n++; }
  return n ? { dx: sx / n - c.width / 2, dy: sy / n - c.height / 2, n, w: c.width } : { n: 0 }; });
async function wrapFindings(page, lang) {
  const f = await page.evaluate(PROBE);
  const over = await page.evaluate(() => { const out = []; if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push("page " + document.documentElement.scrollWidth);
    document.querySelectorAll('#plV2 button, #plV2 label, #plV2 p').forEach(e => {
      if (e.offsetParent && e.scrollWidth > e.clientWidth + 1) out.push((e.id || e.className || e.tagName) + " " + e.scrollWidth + ">" + e.clientWidth); });
    return out; });
  return f.filter(x => !excepted({ ...x, page: "palm.html", lang, w: 360 })).map(x => x.kind + " " + x.text).concat(over);
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const lang of LANGS) {
      await check(`D+C ${lang}: default own hand; icons and labels; "for someone else" shows the consent line and turns the guide 180`, async () => {
        const page = await open(browser, base, { lang });
        try {
          const d = await page.evaluate(() => {
            const b = m => document.querySelector(`[data-pv2-mode="${m}"]`);
            return { self: b("self").getAttribute("aria-checked"), other: b("other").getAttribute("aria-checked"), selfT: b("self").innerText.trim(), otherT: b("other").innerText.trim(),
              icons: [b("self"), b("other")].map(e => !!e.querySelector("svg")), rot: (document.getElementById("pv2Rotate") || {}).innerText,
              consent: !!document.getElementById("pv2ConsentWrap").offsetParent };
          });
          assert(d.self === "true" && d.other === "false", `${lang}: default is not own hand ${S(d)}`);
          assert(d.selfT === tx("mode.self", lang) && d.otherT === tx("mode.other", lang), `${lang}: mode labels ${S(d)}`);
          assert(d.icons[0] && d.icons[1], `${lang}: a mode button has no icon ${S(d)}`);
          assert(typeof d.rot === "string" && d.rot.trim() === tx("guide.rotate", lang), `${lang}: rotate label ${S(d.rot)}`);
          assert(!d.consent, `${lang}: consent line shown for own hand`);
          let g = await guide(page);
          assert(g && g.angle === 0 && g.by === "mode", `${lang}: own-hand guide ${S(g)}`);
          await click(page, `[data-pv2-mode="other"]`);
          await sleep(150);
          const c = await page.evaluate(() => ({ shown: !!document.getElementById("pv2ConsentWrap").offsetParent, text: document.getElementById("pv2ConsentText").textContent,
            start: document.getElementById("pv2Start").disabled, other: document.querySelector('[data-pv2-mode="other"]').getAttribute("aria-checked") }));
          assert(c.shown && c.text === CONSENT[LI[lang]], `${lang}: consent line ${S(c)}`);
          assert(c.start === true && c.other === "true", `${lang}: camera not waiting for the consent tick ${S(c)}`);
          g = await guide(page);
          assert(g && g.angle === 180 && g.by === "mode", `${lang}: someone-else guide ${S(g)}`);
          await click(page, `[data-pv2-mode="self"]`);
          await sleep(150);
          g = await guide(page);
          assert(!(await shown(page, "#pv2ConsentWrap")) && g.angle === 0, `${lang}: back to own hand ${S(g)}`);
        } finally { await page.close(); }
      });
    }

    await check("R the rotate button flips the guide 180 degrees in both modes (state and drawn outline)", async () => {
      const page = await open(browser, base, { lang: "th" });
      try {
        for (const mode of ["self", "other"]) {
          await click(page, `[data-pv2-mode="${mode}"]`);
          await sleep(200);
          const g0 = await guide(page), i0 = await ink(page);
          await click(page, "#pv2Rotate");
          await sleep(200);
          const g1 = await guide(page), i1 = await ink(page);
          assert(angDiff(g1.angle, g0.angle + 180) === 0, `${mode}: rotate did not flip ${S([g0, g1])}`);
          assert(i0.n > 50 && i1.n > 50, `${mode}: no guide outline drawn ${S([i0, i1])}`);
          const m0 = Math.hypot(i0.dx, i0.dy), sum = Math.hypot(i0.dx + i1.dx, i0.dy + i1.dy);
          assert(m0 > 0.005 * i0.w && i0.dx * i1.dx + i0.dy * i1.dy < 0 && sum <= 0.25 * m0, `${mode}: the drawn outline did not turn 180 ${S([i0, i1])}`);
          await click(page, "#pv2Rotate");
          await sleep(150);
          assert((await guide(page)).angle === g0.angle, `${mode}: second press did not flip back`);
        }
      } finally { await page.close(); }
    });

    await check("N the guide never blocks capture because of orientation: automatic capture fires at 0 / 90 / 180 / 270 (own hand) and 180 (someone else)", async () => {
      const page = await open(browser, base, { lang: "th", cam: true });
      try {
        const bad = await page.evaluate(() => ["tilt", "open"].flatMap(k => [window.PalmV2.hintText(k, "th", false), window.PalmV2.hintText(k, "th", true)]));
        const cases = [["self", 0, false], ["self", 90, false], ["self", 180, false], ["self", 270, false], ["other", 180, false], ["other", 180, true], ["other", 0, true]];
        for (const [mode, deg, flip] of cases) {
          if (await shown(page, "#pv2Again")) await click(page, "#pv2Again");
          await click(page, `[data-pv2-mode="${mode}"]`);
          if ((await guide(page)).flip !== flip) await click(page, "#pv2Rotate");
          if (mode === "other") await click(page, "#pv2Consent");
          await page.evaluate(d => { window.__camScene = { hand: true, deg: d, mir: false }; window.__seen = window.__palmV2.lastStill; window.__hints = []; }, deg);
          await click(page, "#pv2Start");
          const t0 = Date.now();
          let fired = false;
          while (Date.now() - t0 < 20000) {
            const r = await page.evaluate(() => { const h = document.getElementById("pv2Hint").textContent; if (h) window.__hints.push(h);
              const s = window.__palmV2.lastStill; return { fired: !!(s && s !== window.__seen && s.auto === true), h }; });
            if (r.fired) { fired = true; break; }
            await sleep(200);
          }
          const hints = await page.evaluate(() => [...new Set(window.__hints)]);
          assert(fired, `${mode} ${deg} deg flip ${flip}: no automatic capture in 20 s; hints ${S(hints)}`);
          const blocked = hints.filter(h => bad.includes(h));
          assert(!blocked.length, `${mode} ${deg} deg: orientation hint shown ${S(blocked)}`);
          if (await shown(page, "#pv2Stop")) await click(page, "#pv2Stop");
        }
      } finally { await page.close(); }
    });

    await check("L with hand points the guide follows the detected hand in real time (angle and mirror)", async () => {
      const page = await open(browser, base, { lang: "th", cam: true, demo: true });
      try {
        const on = await page.evaluate(() => window.LENSIQ_PALM_LANDMARKS === true && !!window.__palm);
        assert(on, "landmarks switch not on in the demo profile");
        await page.evaluate(() => {
          window.__camScene = { hand: false };
          window.__lmScene = null;
          window.__palm.loadModels = () => Promise.resolve();
          window.__palm.detectHand = () => Promise.resolve(window.__lmScene ? { pts: PalmCapSynth.landmarks(window.__lmScene).pts } : null);
        });
        await click(page, "#pv2Start");
        await page.waitFor(`!document.getElementById("pv2Stop").hidden`, 8000);
        for (const [side, rot, mir, want] of [["right", 0, false, "right"], ["right", 90, false, "right"], ["right", 180, false, "right"], ["right", -90, false, "right"],
          ["right", 45, false, "right"], ["left", 180, false, "left"], ["right", 0, true, "left"], ["left", 135, true, "right"]]) {
          await page.evaluate(sc => { window.__lmScene = sc; }, { side, rot, mirror: mir, at: [120, 200], scale: 40 });
          let g = null;
          const t0 = Date.now();
          while (Date.now() - t0 < 5000) { g = await guide(page); if (g && g.by === "landmarks" && angDiff(g.angle, rot) <= 4 && g.side === want) break; await sleep(150); }
          assert(g && g.by === "landmarks" && angDiff(g.angle, rot) <= 4 && g.side === want, `${side} ${rot} mirror ${mir}: guide ${S(g)} want angle ${rot} side ${want}`);
        }
        await page.evaluate(() => { window.__lmScene = null; });
        let g = null; const t0 = Date.now();
        while (Date.now() - t0 < 5000) { g = await guide(page); if (g && g.by === "mode") break; await sleep(150); }
        assert(g && g.by === "mode" && g.angle === 0, `no hand: back to the own-hand guide ${S(g)}`);
      } finally { await page.close(); }
    });

    for (const lang of LANGS) {
      await check(`H ${lang}: left / right from the thumb in the photo, shown as a chip; tap to change; the reading follows`, async () => {
        const page = await open(browser, base, { lang });
        try {
          await tapAll(page, await upload(page, { pw: 480, side: "left" }));
          const a = await page.evaluate(() => ({ chip: (document.getElementById("pv2SideChip") || {}).innerText, chipShown: !!(document.getElementById("pv2SideChip") || {}).offsetParent,
            ask: !!document.getElementById("pv2SideAsk").offsetParent, side: window.__palmV2.state().side, read: document.getElementById("pv2Read").disabled }));
          assert(a.chipShown && a.chip.trim() === tx("side.chip.left", lang), `${lang}: chip ${S(a)}`);
          assert(!a.ask && a.side === "left" && a.read === false, `${lang}: state ${S(a)}`);
          await click(page, "#pv2Read");
          await sleep(300);
          let r = await page.evaluate(() => document.getElementById("pv2Result").innerText);
          assert(r.includes(tx("reading.side.left", lang)) && !r.includes(tx("reading.side.right", lang)), `${lang}: reading does not say left ${S(r.slice(0, 200))}`);
          await click(page, "#pv2SideChip");
          await sleep(300);
          const b = await page.evaluate(() => ({ chip: document.getElementById("pv2SideChip").innerText, side: window.__palmV2.state().side }));
          assert(b.chip.trim() === tx("side.chip.right", lang) && b.side === "right", `${lang}: after tapping the chip ${S(b)}`);
          r = await page.evaluate(() => document.getElementById("pv2Result").innerText);
          assert(r.includes(tx("reading.side.right", lang)) && !r.includes(tx("reading.side.left", lang)), `${lang}: reading did not follow ${S(r.slice(0, 200))}`);
        } finally { await page.close(); }
        const p2 = await open(browser, base, { lang });
        try {
          await tapAll(p2, await upload(p2, { pw: 480, side: "left" }, 2));
          const c = await p2.evaluate(() => ({ chip: document.getElementById("pv2SideChip").innerText, side: window.__palmV2.state().side }));
          assert(c.chip.trim() === tx("side.chip.left", lang) && c.side === "left", `${lang}: left hand fingers-down ${S(c)}`);
        } finally { await p2.close(); }
      });
    }

    await check("O the same drawn hand uploaded at 0 / 90 / 180 / 270 degrees: same lines, same hand, shown fingers-up", async () => {
      const page = await open(browser, base, { lang: "th" });
      try {
        await tapAll(page, await upload(page, { pw: 480 }, 0));
        const ref = await lines(page), found = Object.keys(ref).filter(id => ref[id].pts);
        assert(found.length >= 3, `upright: major lines not found ${S(Object.keys(ref).map(id => id + ":" + ref[id].status))}`);
        for (const q of [1, 2, 3]) {
          await tapAll(page, await upload(page, { pw: 480 }, q));
          const L = await lines(page);
          for (const id of Object.keys(ref)) {
            assert(L[id].status === ref[id].status, `${q * 90} deg ${id}: ${L[id].status} vs ${ref[id].status}`);
            if (ref[id].pts && L[id].pts) { const d = curveDist(ref[id].pts, L[id].pts); assert(d <= 0.03, `${q * 90} deg ${id}: curve differs by ${d.toFixed(4)}`); }
          }
          const s = await page.evaluate(() => ({ side: window.__palmV2.state().side, k: window.__palmV2.uvToClient([0.5, 0]), w: window.__palmV2.uvToClient([0.5, 1]) }));
          assert(s.side === "right", `${q * 90} deg: side ${s.side}`);
          assert(s.k[1] < s.w[1] - 20, `${q * 90} deg: photo not shown fingers-up (knuckles ${S(s.k)}, wrist ${S(s.w)})`);
        }
      } finally { await page.close(); }
    });

    for (const lang of LANGS) {
      await check(`W ${lang}: line wrap at 360 px: own hand, someone else with consent, chip and reading`, async () => {
        const page = await open(browser, base, { lang });
        try {
          const bad = [];
          bad.push(...(await wrapFindings(page, lang)).map(x => "self: " + x));
          await click(page, `[data-pv2-mode="other"]`); await sleep(200);
          bad.push(...(await wrapFindings(page, lang)).map(x => "other: " + x));
          await click(page, `[data-pv2-mode="self"]`); await sleep(100);
          await tapAll(page, await upload(page, { pw: 480, side: "left" }));
          await click(page, "#pv2Read"); await sleep(300);
          bad.push(...(await wrapFindings(page, lang)).map(x => "chip+reading: " + x));
          assert(!bad.length, `${bad.length} wrap / overflow finding(s):\n         ` + bad.slice(0, 30).join("\n         "));
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
}
