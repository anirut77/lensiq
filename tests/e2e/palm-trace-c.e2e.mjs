// tests/e2e/palm-trace-c.e2e.mjs — owner inbox entry 24 item C (2026-11-23, branch palm-24c): "ลากตามเส้นนี้" on the live palm
// page (palm v2 / v3 switches off). LOCKED (evals-locks/palm-90.sha256, field copy ~/LENSIQ-field/evals/palm-90/c/) BEFORE any
// product change. Synthetic only: fake camera + scripted detector (?fakedet); no photo of a person or a hand is used or stored.
//   C1  TH / EN / ZH: in the line editor the button #plTraceLine is shown exactly when the chosen line is a main line (life,
//       head, heart) whose automatic result is "not clear" or has confidence below PalmCore.TRACE_LOW; never for the fate line;
//       its label is TH "ลากตามเส้นนี้" / EN "Trace this line" / ZH "沿这条线描"
//   C2  TH: pressing it (aria-pressed="true") and drawing one stroke with the pointer along the line's guide on the editor
//       canvas places that line: present, not "not clear", marked traced, at least 5 points; the chip loses its "not clear"
//       note; the button returns to aria-pressed="false"; the other lines are unchanged
//   C3  TH: a stroke while the button is NOT pressed does not trace (the old point-drag behaviour stays: S.lines.<id>.traced
//       stays unset)
//   C4  TH: after tracing, "read" gives a reading (>= 3 sections) and the traced line is read (PalmCore.lineRead); no request
//       that carries data (no POST, no body) while editing or reading (the stroke never leaves the device)
//   RE-LOCK c3 (2026-11-24, independent review of palm-24c, findings 4 and 5; locked before the fix; c1 / c2 stay in the ledger),
//   all stricter:
//   C2  now in TH / EN / ZH, and a traced line is VISIBLY user-added: its chip carries the mark ADDED (TH "เพิ่มเอง" / EN
//       "Added by you" / ZH "自行添加"), the editor draws it in its own style (a solid white #ffffff halo stroke under the line
//       colour; no such stroke before tracing), and its result card (#plLines [data-line]) carries the same mark; every traced
//       control point stays inside the editor frame like a dragged one (u in [-0.42, 1.32], v in [-0.4, 1.12])
//   C4  also fails on any request whose URL has a query string other than a bare static version (?v=<digits>), so no user
//       data can leave in a GET either
//   C5  TH: a stroke ended by pointercancel (not pointerup) places nothing: the line stays as it was and is not traced
//   RE-LOCK c2 (2026-11-23, after the first run, before any product commit; the first lock stays in the ledger): the page
//   scrolls smoothly, so the stroke landed beside the canvas and C3 passed without testing anything. Now the canvas is
//   scrolled into view instantly and every stroke point must hit the canvas. Stricter; nothing else changed.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const LABEL = { th: "ลากตามเส้นนี้", en: "Trace this line", zh: "沿这条线描" };
const ADDED = { th: "เพิ่มเอง", en: "Added by you", zh: "自行添加" };
// relock c3: records the strokes drawn on the editor canvas (style, dash) to see the user-added style
const STROKES = `(() => { const P = CanvasRenderingContext2D.prototype, st = P.stroke; window.__edStrokes = [];
  P.stroke = function () { if (this.canvas && this.canvas.id === "plEditCanvas") window.__edStrokes.push({ s: String(this.strokeStyle), d: this.getLineDash().length }); return st.apply(this, arguments); }; })();`;
const halo = page => page.evaluate(() => (window.__edStrokes || []).filter(x => /^#ffffff$/i.test(x.s) && !x.d).length);
const MAIN = ["life", "head", "heart"];
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;

async function toEditor(browser, base, fakeCams, l) {
  const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`, fakeCams, detScript, STROKES] });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.goto(`${base}/palm.html?cpu&fakedet`);
  await page.waitFor(`document.documentElement.lang === ${JSON.stringify(HTML_LANG[l])}`, 8000);
  await page.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 15000);
  await page.evaluate(() => document.getElementById("plStartCam").click());
  await page.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 10000);
  await page.evaluate(d => { window.__dets = d; }, [HAND]);
  await sleep(600);
  await page.evaluate(() => document.getElementById("plSnap").click());
  await page.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
  return page;
}
const chip = (page, id) => page.evaluate(i => { document.querySelector(`#plLineChips [data-line="${i}"]`).click(); return true; }, id);
const state = page => page.evaluate(() => {
  const S = window.__palm.S, b = document.getElementById("plTraceLine");
  return { active: S.active, shown: !!b && !b.hidden && b.offsetWidth > 0, label: b ? b.textContent.trim() : "", pressed: b && b.getAttribute("aria-pressed"),
    low: window.PalmCore.TRACE_LOW, auto: Object.fromEntries(Object.entries(S.auto || {}).map(([k, v]) => [k, { unclear: !!v.unclear, conf: v.auto ? v.auto.conf : null }])),
    lines: JSON.parse(JSON.stringify(S.lines)) };
});
/** client points along a line's guide (template points of PalmCore.TEMPLATES, through the editor canvas) */
const guideClient = (page, id) => page.evaluate(i => {
  const S = window.__palm.S, cv = document.getElementById("plEditCanvas"), r = cv.getBoundingClientRect(), F = S.F;
  cv.scrollIntoView({ block: "center", behavior: "instant" }); // relock c2: the page scrolls smoothly; an instant scroll keeps the rect true
  const r2 = cv.getBoundingClientRect();
  return window.PalmCore.TEMPLATES[i].pts.map(q => { const p = F.uvToPx(q), x = F.mirrored ? F.w - p[0] : p[0];
    return [r2.left + x * r2.width / cv.width, r2.top + p[1] * r2.height / cv.height]; }).filter(() => r);
}, id);
async function strokeAlong(page, pts) {
  // relock c2: every point must be on the editor canvas (a stroke beside it would test nothing)
  const onCanvas = await page.evaluate(ps => ps.every(p => { const e = document.elementFromPoint(p[0], p[1]); return !!e && e.id === "plEditCanvas"; }), pts);
  assert(onCanvas, "stroke points are not on the editor canvas: " + JSON.stringify(pts));
  const send = (type, p) => page.send("Input.dispatchMouseEvent", { type, x: p[0], y: p[1], button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "mouse" });
  await send("mousePressed", pts[0]);
  for (let i = 1; i < pts.length; i++) for (let k = 1; k <= 6; k++) {
    const a = pts[i - 1], b = pts[i]; await send("mouseMoved", [a[0] + (b[0] - a[0]) * k / 6, a[1] + (b[1] - a[1]) * k / 6]); await sleep(10);
  }
  await send("mouseReleased", pts[pts.length - 1]);
  await sleep(300);
}
const lowLine = s => MAIN.find(id => s.auto[id] && (s.auto[id].unclear || s.auto[id].conf < s.low));

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const l of ["th", "en", "zh"]) {
      await check(`palm 24-C1 (${l}): "trace this line" only on low-confidence main lines, label in the page language`, async () => {
        const page = await toEditor(browser, base, fakeCams, l);
        try {
          for (const id of ["life", "head", "heart", "fate"]) {
            await chip(page, id); await sleep(100);
            const s = await state(page);
            const want = MAIN.includes(id) && !!s.auto[id] && (s.auto[id].unclear || s.auto[id].conf < s.low);
            assert(s.shown === want, `${l} ${id}: button shown ${s.shown}, expected ${want} (${JSON.stringify(s.auto[id])}, TRACE_LOW ${s.low})`);
            if (s.shown) assert(s.label === LABEL[l], `${l}: label "${s.label}"`);
          }
        } finally { await page.close(); }
      });
    }

    for (const l of ["th", "en", "zh"]) await check(`palm 24-C2/C4 (${l}): one stroke places the low-confidence line, visibly user-added, read, nothing sent`, async () => {
      const page = await toEditor(browser, base, fakeCams, l);
      try {
        const s0 = await state(page), id = lowLine(s0);
        assert(id, "no low-confidence main line in the synthetic photo (the check needs one): " + JSON.stringify(s0.auto));
        await page.evaluate(() => { window.__edStrokes = []; });
        await chip(page, id); // draws the editor once with the line as found
        const halo0 = await halo(page);
        await page.evaluate(() => document.getElementById("plTraceLine").click());
        assert((await state(page)).pressed === "true", "button not pressed");
        const reqs0 = page.requests.length;
        await strokeAlong(page, await guideClient(page, id));
        const s1 = await state(page), L = s1.lines[id];
        assert(L.present && !L.unclear && L.traced === true && L.cp.length >= 5, `${id} not placed by the stroke: ${JSON.stringify(L)}`);
        assert(s1.pressed === "false", "button still pressed after the stroke");
        const chipText = await page.evaluate(i => document.querySelector(`#plLineChips [data-line="${i}"]`).textContent, id);
        assert(!/ไม่ชัดในภาพนี้/.test(chipText), "chip still says not clear: " + chipText);
        assert(chipText.includes(ADDED[l]), `${l}: chip has no user-added mark "${ADDED[l]}": ${chipText}`);
        assert(halo0 === 0 && (await halo(page)) > 0, `${l}: the traced line is not drawn in the user-added style (halo before ${halo0})`);
        assert(L.cp.every(q => q[0] >= -0.42 && q[0] <= 1.32 && q[1] >= -0.4 && q[1] <= 1.12), `${id}: traced point outside the frame ${JSON.stringify(L.cp)}`);
        for (const o of ["life", "head", "heart", "fate"].filter(x => x !== id)) assert(JSON.stringify(s1.lines[o]) === JSON.stringify(s0.lines[o]), `${o} changed`);
        await page.evaluate(() => document.getElementById("plRead").click());
        await page.waitFor(`!document.getElementById("plResult").hidden && document.querySelectorAll("#plNarr .fa-section").length >= 3`, 20000);
        const read = await page.evaluate(i => window.PalmCore.lineRead(window.__palm.S.lines[i]), id);
        assert(read, "the traced line is not read");
        const card = await page.evaluate(i => { const c = document.querySelector(`#plLines [data-line="${i}"]`); return c ? c.textContent : ""; }, id);
        assert(card.includes(ADDED[l]), `${l}: result card of ${id} has no user-added mark: ${card.slice(0, 160)}`);
        const qs = u => { try { const s = new URL(u).search; return s && !/^\?v=\d+$/.test(s); } catch (e) { return false; } };
        const sent = page.requests.slice(reqs0).filter(r => !/^data:|^blob:/.test(r.url) && (r.method !== "GET" || r.postData || qs(r.url)));
        assert(!sent.length, "requests sent while tracing / reading: " + sent.map(r => r.method + " " + r.url).join(", "));
      } finally { await page.close(); }
    });

    await check("palm 24-C3 (th): without the button a stroke does not trace", async () => {
      const page = await toEditor(browser, base, fakeCams, "th");
      try {
        const id = lowLine(await state(page));
        assert(id, "no low-confidence main line");
        await chip(page, id);
        await strokeAlong(page, await guideClient(page, id));
        const L = (await state(page)).lines[id];
        assert(L.traced === undefined, `${id} traced without the button: ${JSON.stringify(L)}`);
      } finally { await page.close(); }
    });

    await check("palm 24-C5 (th): a stroke ended by pointercancel places nothing", async () => {
      const page = await toEditor(browser, base, fakeCams, "th");
      try {
        const s0 = await state(page), id = lowLine(s0);
        assert(id, "no low-confidence main line");
        await chip(page, id);
        await page.evaluate(() => document.getElementById("plTraceLine").click());
        const pts = await guideClient(page, id);
        await page.evaluate(ps => {
          const cv = document.getElementById("plEditCanvas"), ev = (t, p) => cv.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 7, isPrimary: true, clientX: p[0], clientY: p[1], button: 0, buttons: t === "pointercancel" ? 0 : 1 }));
          ev("pointerdown", ps[0]); for (const p of ps.slice(1)) ev("pointermove", p); ev("pointercancel", ps[ps.length - 1]);
        }, pts);
        await sleep(300);
        const L = (await state(page)).lines[id];
        assert(L.traced === undefined && JSON.stringify(L.cp) === JSON.stringify(s0.lines[id].cp) && L.unclear === s0.lines[id].unclear, `${id} changed by a cancelled stroke: ${JSON.stringify(L)}`);
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
}
