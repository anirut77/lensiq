// tests/e2e/iphone-pages-webkit.e2e.mjs — iPHONE COVERAGE (owner order, night 2026-11-15, item 5): every fortune page and
// every camera page on WebKit (the iOS Safari engine) with the iPhone 13 profile (390 px wide, touch, mobile user agent), in
// Thai, English and Chinese. FIXED TEST, locked (evals-locks/iphone-webkit.sha256, ~/LENSIQ-field/evals/iphone-webkit/)
// before any product fix of the round. Runs on the macOS WebKit shard (the file name contains "webkit").
//
// Pages: fortune = category 6 of CLAUDE.md + cat-fortune; camera = every page whose own scripts call getUserMedia
// (lensiq-camera.js, booth.js, checkout.js, ...; lensiq-busy.js / lensiq-demo.js only wrap it and do not count).
// Per page and language, one fresh iPhone context:
//   LOAD     <html lang> is the chosen language; no page error and no console error (after the run); no horizontal scroll;
//            the main controls are visible, at least 44 x 44 px and not covered (the element at their centre is the control
//            itself); the tap itself goes through Playwright's tap(), which waits for the control to be stable and hit-able.
//   FORTUNE  one reading from sample input (typed dates, a dream text, drawn cards; fake camera + scripted detector for
//            face / palm); the hubs list their tools instead. The "อยากมีคนรับฟัง 1323" control at the top (#lqHelpTop) is a
//            tel:1323 link of at least 44 x 44 px, visible and not covered.
//   CAMERA   getUserMedia refused with NotAllowedError (what iOS returns when the user taps "Don't Allow"): after the start
//            step a plain message about the camera permission appears in the page's language (en / zh: no Thai in it;
//            th: Thai), no control is left busy (aria-busy) and the start control, when still shown, is not disabled.
//   TRACKS   Thai only (an engine fact, not a wording one): a canvas fake camera (tests/e2e/fake-cams.js; Playwright WebKit
//            has no fake-media switch) is started from the page's start control; after the page's stop control (or, on a
//            page with no stop control, the pagehide event iOS sends when the user leaves Safari) no camera track is live.
//   MEMORY   performance.memory.usedJSHeapSize when the engine has it (WebKit does not, and Playwright WebKit has no CDP),
//            reported in the table only, never asserted.
// Synthetic input only; no photo of a person. Prints a pass / fail table per page at the end.
import { assert } from "./cdp.mjs";
import { IPHONE, MD_SHIM, launchWebKit, sleep } from "./phone-kit.mjs";

const LANGS = ["th", "en", "zh"];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const THAI = /[฀-๿]/;
// AMENDED 2026-11-16 (amendment 2, stricter, independent review of d2b474b): the message must name the camera AND the permission
// (one permission word alone matched page text such as "Allow online lookups", "拒绝通行" or "ใบอนุญาต" before any tap), and it must be
// new text that was not on the page before the start control was tapped
const DENIED = { th: [/กล้อง/, /อนุญาต|สิทธิ์|ถูกปฏิเสธ/], en: [/camera/i, /permission|allow|denied|blocked/i], zh: [/摄像头|相机|镜头/, /权限|允许|拒绝/] };
// amendment 2b (coordinator follow-up 3): user-facing refusal text has no DOMException name, and an address-bar hint has the iOS path
const RAW_CODE = /\b(NotAllowed|NotFound|NotReadable|Overconstrained|Security|Abort|PermissionDenied)Error\b|DOMException/;
const ADDR_HINT = /address bar|lock icon|camera icon|แถบที่อยู่|ข้าง URL|แม่กุญแจ|ไอคอนกล้อง|地址栏|锁形|摄像头图标/i;
// AMENDED 2026-11-16 (amendment 4, STRICTER, independent review of cb672a1: iOS 18+ replaced Safari's "aA" with a page-menu icon):
// the iPhone step may name aA OR the page menu, and the hint must also give the Settings > Apps > Safari > Camera > Allow fallback,
// with the retry word (if any) after those steps
const IOS_MENU = { th: /aA|ไอคอนเมนู|เมนูหน้าเว็บ/, en: /aA|page menu/i, zh: /aA|页面菜单/ };
const IOS_FALLBACK = { th: /การตั้งค่า\s*>\s*แอป\s*>\s*Safari\s*>\s*กล้อง\s*>\s*อนุญาต/, en: /Settings\s*>\s*Apps\s*>\s*Safari\s*>\s*Camera\s*>\s*Allow/i,
  zh: /设置\s*>\s*(?:App|应用)\s*>\s*Safari\s*>\s*相机\s*>\s*允许/ };
const IOS_RETRY = { th: /ลองใหม่/, en: /retry|try again/i, zh: /重试/ };
// AMENDED 2026-11-16 (amendment 5, owner input from a real iPhone 16 Pro, iOS 27.0.1, Safari: on iOS 27 the address bar collapses to
// the page title while scrolling): every refusal notice carries the "how to allow the camera" link; its steps start with the tap
// on the page title at the very top (owner wording) and include the Settings fallback; opening them makes no network request
const HELP_LABEL = { th: "วิธีเปิดสิทธิ์กล้อง", en: "How to allow the camera", zh: "如何允许使用相机" };
const HELP_FIRST = { th: /^แตะชื่อหน้าด้านบนสุด/, en: /^Tap the page title at the very top/i, zh: /^点按最上方的页面标题/ };
/** in-page: visible texts (<= 400 chars, outside the nav / footer / help line) that match every [source, flags] pattern */
function permTexts(rx) {
  const res = rx.map(r => new RegExp(r[0], r[1])), out = [];
  for (const e of document.querySelectorAll("body *")) {
    if (/^(SCRIPT|STYLE|NOSCRIPT|svg)$/i.test(e.tagName) || e.closest("#siteNav, header.nav, footer, .lq-helpline, .lq-camhelp")) continue;
    const hp = e.querySelector(".lq-camhelp"); // amendment 5: the help block's text is not part of the message
    const t = (hp ? (e.innerText || "").replace(hp.innerText || "", "") : e.innerText || "").trim();
    if (!t || t.length > 400 || !res.every(r => r.test(t))) continue;
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    if (s.display === "none" || s.visibility === "hidden" || !r.width || !r.height || e.closest("[hidden]")) continue;
    out.push(t);
  }
  return out;
}
// console noise that is not the page's: Playwright blocks service workers (serviceWorkers: "block") and WebKit logs the refusal
// and the MediaPipe / TensorFlow Lite WASM runtime (vendor/) writes its start-up INFO line to stderr, which the browser shows
// at error level ("INFO: Created TensorFlow Lite XNNPACK delegate for CPU."); only lines that begin with "INFO: " are let through
const CONSOLE_OK = /service ?worker|serviceWorker|^INFO: /i;
const NO_DIALOGS = "window.confirm = () => true; window.print = () => {}; window.prompt = () => 'test'; window.alert = () => {};";
const DENY = `(() => { const md = navigator.mediaDevices; if (!md) return; window.__lqDenied = 0;
  md.enumerateDevices = async () => [{ kind: "videoinput", deviceId: "", groupId: "", label: "", toJSON() { return this; } }];
  md.getUserMedia = async () => { window.__lqDenied++; throw new DOMException("The request is not allowed by the user agent or the platform in the current context.", "NotAllowedError"); };
})();`;
const ONE_CAM = `window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d));`;
const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };

/** sets a form control's value the way a user leaves it (input + change) */
const setVal = (page, sel, v) => page.evaluate(([sel, v]) => {
  const el = document.querySelector(sel); if (!el) throw new Error("no " + sel);
  if (el.type === "checkbox" || el.type === "radio") el.checked = !!v; else el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
}, [sel, v]);
const waitFor = (page, fn, arg = null, ms = 15000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 });
const tap = (page, sel) => page.locator(sel).first().tap({ timeout: 10000 });
/** reading predicate: at least n reading sections, none still being composed */
// AMENDED 2026-11-16 (before any product fix was measured): the "still composing" test matched any 正在 ("currently"), which real
// Chinese readings use (I Ching hexagram 3, 5, 9 ...); it now matches only the loading line itself (fk.loading / horoscope.x.composing)
const SECTIONS = n => {
  const s = [...document.querySelectorAll(".fa-section, .fs-sec")];
  return s.length >= n && !s.some(x => /กำลังเรียบเรียงคำทำนาย|Composing your reading|正在撰写解读/.test(x.textContent));
};

// shared birth-date form of bazi / taksa / lek7 / lifegraph (lifecal-ui.js)
const lcRead = async page => {
  await setVal(page, "#lcDay", "12"); await setVal(page, "#lcMonth", "5"); await setVal(page, "#lcYear", "2533"); await setVal(page, "#lcTime", "08:00");
  await tap(page, "#lcForm button[type=submit]");
  await waitFor(page, SECTIONS, 2, 20000);
};

// ---------- fortune pages: main controls + one reading ----------
/** @type {{page: string, main: string[], q?: string, cam?: boolean, read: (p: any, lang?: string) => Promise<void>}[]} */
const FORTUNE = [
  { page: "fortune", main: [".pd-card"], read: async p => {
    const n = await p.evaluate(() => document.querySelectorAll("a.pd-card[href$='.html'], a.ft-card[href$='.html']").length);
    assert(n >= 10, "fortune hub lists only " + n + " tools");
  } },
  { page: "cat-fortune", main: ["main a[href$='.html']"], read: async p => {
    const n = await p.evaluate(() => new Set([...document.querySelectorAll("main a[href$='.html']")].map(a => a.getAttribute("href"))).size);
    assert(n >= 10, "cat-fortune lists only " + n + " tools");
  } },
  { page: "faceread", q: "?cpu&fakedet", cam: true, main: ["#frStartCam"], read: async p => {
    await tap(p, "#frStartCam");
    await waitFor(p, () => !document.getElementById("frRead").hidden && !!document.querySelector("#frCam.live"), null, 15000);
    await p.evaluate(d => { window.__dets = d; }, [FACE]);
    await waitFor(p, () => !document.getElementById("frRead").disabled, null, 10000);
    await tap(p, "#frRead");
    await waitFor(p, () => !document.getElementById("frResult").hidden, null, 25000);
    await waitFor(p, SECTIONS, 3, 25000);
  } },
  { page: "palm", q: "?cpu&fakedet", cam: true, main: ["#plStartCam"], read: async p => {
    await waitFor(p, () => !!(window.__palm && document.getElementById("plEngine").classList.contains("ok")), null, 15000);
    await tap(p, "#plStartCam");
    await waitFor(p, () => !!document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden, null, 15000);
    await p.evaluate(d => { window.__dets = d; }, [HAND]);
    await sleep(600);
    await tap(p, "#plSnap");
    await waitFor(p, () => !document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy, null, 20000);
    await tap(p, "#plRead");
    await waitFor(p, () => !document.getElementById("plResult").hidden && document.querySelectorAll("#plNarr .fa-section").length >= 3, null, 20000);
  } },
  { page: "horoscope", main: ["#hsGo"], read: async p => {
    await setVal(p, "#hsDay", "15"); await setVal(p, "#hsMonth", "8"); await setVal(p, "#hsYear", "1990");
    await tap(p, "#hsGo"); await waitFor(p, SECTIONS, 3, 20000);
  } },
  { page: "tarot", main: ["#trStart"], read: async p => {
    await p.evaluate(() => { document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click(); });
    await tap(p, "#trStart"); await sleep(600);
    await tap(p, "#trAuto"); await sleep(900);
    await tap(p, "#trReveal"); await waitFor(p, SECTIONS, 3, 25000);
  } },
  { page: "iching", main: ["#icStart"], read: async p => {
    await tap(p, "#icStart"); await tap(p, "#icAuto"); await waitFor(p, SECTIONS, 3, 20000);
  } },
  { page: "bazi", main: ["#lcForm button[type=submit]"], read: lcRead },
  { page: "taksa", main: ["#lcForm button[type=submit]"], read: lcRead },
  { page: "lek7", main: ["#lcForm button[type=submit]"], read: lcRead },
  { page: "numbers", main: ["#nmGo"], read: async p => {
    await setVal(p, "#nmPhone", "0812345678"); await tap(p, "#nmGo"); await waitFor(p, SECTIONS, 2, 15000);
  } },
  { page: "fengshui", main: ["#fsKuaForm [type=submit]"], read: async p => {
    await setVal(p, "#fsDay", "15"); await setVal(p, "#fsMonth", "6"); await setVal(p, "#fsYear", "2533");
    await tap(p, "#fsKuaForm [type=submit]"); await sleep(500);
    await tap(p, "#fsReadBtn"); await waitFor(p, SECTIONS, 2, 15000);
  } },
  { page: "dream", main: ["#drText"], read: async p => {
    await setVal(p, "#drText", "ฝันเห็นงูใหญ่ในบ้าน แล้วนั่งเครื่องบินไปทะเล");
    await waitFor(p, () => !document.getElementById("drGo").disabled, null, 5000);
    await tap(p, "#drGo"); await waitFor(p, SECTIONS, 3, 15000);
  } },
  { page: "zodiac", main: ["#zdForm [type=submit]"], read: async p => {
    await p.evaluate(() => document.querySelector('input[name="zdAnimal"][value="6"]').click());
    await tap(p, "#zdForm [type=submit]"); await waitFor(p, SECTIONS, 3, 15000);
  } },
  { page: "astro", main: ["#asForm [type=submit]"], read: async p => {
    await setVal(p, "#asDay", "15"); await setVal(p, "#asMonth", "5"); await setVal(p, "#asYear", "2533");
    await tap(p, "#asForm [type=submit]"); await waitFor(p, SECTIONS, 3, 15000);
  } },
  { page: "lifegraph", main: ["#lcForm button[type=submit]"], read: lcRead },
  { page: "planner", main: ["#plGo"], read: async p => {
    await waitFor(p, () => !!window.__pl && document.getElementById("plFrom").options.length > 1, null, 8000);
    await p.evaluate(() => {
      document.querySelector("input[name=plEvent][value=shop]").click();
      const from = document.getElementById("plFrom"); from.value = from.options[1].value; from.dispatchEvent(new Event("change", { bubbles: true }));
      const fs = document.querySelector('.pl-owner[data-owner="0"]'); fs.querySelector("details").open = true;
      const bd = fs.querySelector(".pl-bd"); bd.value = "1990-05-17"; bd.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await tap(p, "#plGo");
    await waitFor(p, () => !document.getElementById("plResult").hidden && document.querySelectorAll(".pl-day").length > 0, null, 10000);
  } },
  { page: "luckycolor", q: "?cpu&fakeseg", main: [".lc-goal[data-goal=money]"], read: async p => {
    await tap(p, ".lc-goal[data-goal=money]");
    await setVal(p, "#daySel", "4");
    await waitFor(p, () => (document.getElementById("recBox").textContent || "").trim().length > 20 && document.querySelectorAll("#week tbody tr").length === 7, null, 8000);
  } },
  { page: "report", main: ["#rpGo"], read: async (p, lang) => {
    await waitFor(p, () => !!window.__rp, null, 8000);
    await tap(p, '[data-rp-type="report_basic"]');
    // AMENDED 2026-11-16: the birth year is typed in the era the page selects by default (Buddhist era in Thai, Common Era in en / zh)
    await setVal(p, "#rpAYear", lang === "th" ? "2533" : "1990");
    await tap(p, "#rpGo");
    await waitFor(p, () => !document.getElementById("rpOut").hidden && document.querySelectorAll("#rpOut .rp-part").length >= 3, null, 15000);
  } },
];

// ---------- camera pages: steps before the start control, the start control, the stop control ----------
// pre: actions that lead to the start control; start: tapped to open the camera (null = the page opens it on load);
// stop: tapped to close it (same as start for a toggle; {select} for a source picker; null = none -> pagehide is used)
// amendment 3: the page's visible camera-off button (walk-fix-2 D2-007), found by its Thai label the way a user finds it
// ("เปิดกล้อง" = camera ON contains "ปิดกล้อง", so a preceding เ is excluded), then tapped
const CAM_OFF = async p => {
  await waitFor(p, () => [...document.querySelectorAll("button, [role=button]")].some(e => e.getClientRects().length > 0 && !e.closest("[hidden]")
    && !e.disabled && /(^|[^เ])ปิดกล้อง/.test((e.textContent || "").trim())), null, 10000);
  await p.evaluate(() => {
    const b = [...document.querySelectorAll("button, [role=button]")].find(e => e.getClientRects().length > 0 && !e.closest("[hidden]")
      && !(/** @type {any} */ (e)).disabled && /(^|[^เ])ปิดกล้อง/.test((e.textContent || "").trim()));
    if (b) b.setAttribute("data-lq-camoff", "1");
  });
  await tap(p, "[data-lq-camoff]");
};
// zone pages (lensiq-zonecam.js): the operator ticks "the camera notice is posted" and taps the acknowledgement first
const ZONE_ACK = async p => {
  await waitFor(p, () => !!document.getElementById("gate") && !!document.getElementById("startCam"), null, 10000);
  if (await p.evaluate(() => document.getElementById("gate").hidden)) return;
  await setVal(p, "#gate input[type=checkbox]", true);
  await tap(p, "#gate button[data-ack]");
};
const zone = page => ({ page, pre: ZONE_ACK, start: "#startCam", stop: "#stopCam" });
const GATE_ACK = async p => {
  await waitFor(p, () => !!document.querySelector("#gkAck1"), null, 10000);
  await setVal(p, "#gkOp", "สมชาย");
  await p.evaluate(() => { document.querySelector("#gkAck1").click(); document.querySelector("#gkAck2").click(); });
  await tap(p, "#gkAckBtn");
};
/** @type {{page: string, q?: string, init?: string[], pre?: (p: any) => Promise<void>, start: string|null, stop: string|null|{select: [string, string]}|((p: any) => Promise<void>)}[]} */
const CAMERA = [
  zone("afterhours"), zone("bays"), zone("crowd"), zone("queue"), zone("tables"),
  { page: "luckycolor", start: "#startCam", stop: "#stopCam" },
  // attendance (face mode, the page default when no HR employee mode is set) opens the camera on load; #startScan only scans
  { page: "attendance", start: null, stop: CAM_OFF, alsoPagehide: true },
  // booth / signage: the stop control ends counting and keeps the preview for the next round (kiosk design), so the camera is
  // released by pagehide (the user leaves Safari or the page). AMENDED 2026-11-16 (amendment 3, after walk-fix-2 merged): attendance,
  // customers, driver, faceread, palm, photobooth and teamface now have a visible "ปิดกล้อง" control, which must release every track
  { page: "booth", start: "#camStart", stop: null },
  { page: "checkout", start: null, stop: "#camBtn" },
  { page: "customers", start: "#scanToggle", stop: CAM_OFF, alsoPagehide: true },
  { page: "driver", pre: async p => { await setVal(p, "#tripForm [name=driver]", "สมชาย"); await setVal(p, "#tripForm [name=plate]", "1กข 1234"); },
    // driver: during a trip the setup card (with "ปิดกล้อง") is scrolled out of reach; the user ends the trip ("จบเที่ยว") first
    start: "#tripForm [type=submit]", stop: async p => { await tap(p, "#stop"); await CAM_OFF(p); }, alsoPagehide: true },
  { page: "exam-hall", pre: async p => { await setVal(p, "#room", "HALL1"); }, start: "#startCam", stop: null },
  { page: "exam-lab", pre: async p => { await setVal(p, "#room", "LAB1"); await setVal(p, "#seat", "12"); await setVal(p, "#consent", true); },
    // AMENDED 2026-11-16 (amendment 2): the candidate's own "ส่งข้อสอบและปิดกล้อง" (#endExam) must release the camera; it is reached
    // the real way (one scripted face -> head-pose calibration, 2 s with ?calsec=2 -> exam phase), not by pagehide
    q: "?cpu&fakedet&calsec=2", start: "#toCam", stop: async p => {
      await waitFor(p, () => !!window.__LQ_EXAM_LAB && window.__LQ_EXAM_LAB.phase === "cam" && document.querySelector("#engine").classList.contains("ok"), null, 15000);
      await p.evaluate(f => { window.__dets = [f]; }, { x: 0.32, y: 0.18, w: 0.34, h: 0.5, score: 0.95, yaw: 0, pitch: 0 });
      await waitFor(p, () => window.__LQ_EXAM_LAB.faces.length === 1, null, 8000);
      await tap(p, "#toCal");
      await waitFor(p, () => window.__LQ_EXAM_LAB.phase === "calDone", null, 12000);
      await tap(p, "#toExam");
      await waitFor(p, () => window.__LQ_EXAM_LAB.phase === "exam", null, 8000);
      await tap(p, "#endExam");
    } },
  { page: "faceread", start: "#frStartCam", stop: CAM_OFF, alsoPagehide: true },
  { page: "fengshui", start: "#fsCompassStart", stop: null },
  { page: "interview", pre: async p => { await tap(p, "#tab-delivery"); await setVal(p, "#ivCOk1", true); await setVal(p, "#ivCOk2", true); },
    start: "#ivDStart", stop: "#ivDStop" },
  { page: "medicine", start: "#mdCamBtn", stop: "#mdCamStop" },
  // neuro: customer builds (the default) do not load the expression model and never open the camera (round 16 item 2)
  { page: "neuro", noCamera: true, start: null, stop: null },
  { page: "nutrition", start: "#nutCamBtn", stop: "#nutClear" },
  { page: "omr", pre: async p => {
    await p.evaluate(() => { document.getElementById("newWrap").open = true; });
    await setVal(p, "#newExam [name=title]", "Quiz"); await tap(p, "#newExam [type=submit]");
    await waitFor(p, () => !document.getElementById("ws").hidden, null, 8000);
  }, start: "#camStart", stop: "#camStop" },
  { page: "palm", start: "#plStartCam", stop: CAM_OFF, alsoPagehide: true },
  { page: "parking", pre: GATE_ACK, start: "#gkCamBtn", stop: "#gkCamBtn" },
  { page: "village", pre: GATE_ACK, start: "#gkCamBtn", stop: "#gkCamBtn" },
  { page: "photobooth", start: 'button[data-n="1"]', stop: CAM_OFF, alsoPagehide: true },
  { page: "qc", start: null, startSelect: ["#srcSel", "camera"], stop: { select: ["#srcSel", "sim"] } },
  { page: "signage", start: "#startFace", stop: null },
  { page: "store", start: "#startCam", stop: "#stop" },
  { page: "studio", start: "#stCamBtn", stop: "#stCamClose" },
  { page: "teamface", start: "#tfCamBtn", stop: CAM_OFF, alsoPagehide: true },
  { page: "tryon", pre: async p => { await setVal(p, "#toConsent", true); }, start: "#toStart", stop: "#toStop" },
];

/** in-page facts about one control: shown, size, inside the screen after scrolling to it, and whether it is covered */
function controlFacts(sel) {
  const e = document.querySelector(sel);
  if (!e) return { sel, missing: true };
  e.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  const shown = s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0 && !e.closest("[hidden]");
  const box = (e.closest("label") && (e.type === "checkbox" || e.type === "radio")) ? e.closest("label").getBoundingClientRect() : r;
  const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
  const top = document.elementFromPoint(x, y);
  const lab = e.closest("label");
  const mine = !!top && (top === e || e.contains(top) || (!!lab && lab.contains(top)));
  const who = top ? top.tagName.toLowerCase() + (top.id ? "#" + top.id : "") + (typeof top.className === "string" && top.className ? "." + top.className.trim().split(/\s+/)[0] : "") : "nothing";
  return { sel, shown, w: Math.round(box.width), h: Math.round(box.height), left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth, covered: !mine, by: who };
}
const ctlProblem = f => f.missing ? `${f.sel} missing` : !f.shown ? `${f.sel} not shown` : f.w < 44 || f.h < 44 ? `${f.sel} is ${f.w}x${f.h} px (< 44)`
  : f.left < -1 || f.right > f.vw + 1 ? `${f.sel} off screen (${f.left}..${f.right})` : f.covered ? `${f.sel} covered by ${f.by}` : "";

/** opens one page in a fresh iPhone context; st collects page errors and console errors */
async function open(browser, url, lang, init) {
  const ctx = await browser.newContext({ ...IPHONE, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const st = { errors: [], console: [], crashed: false };
  page.on("pageerror", e => st.errors.push(String(e && e.message || e).slice(0, 240)));
  // WebKit's "Failed to load resource" console line has no address: the failed responses are listed by URL instead
  page.on("console", m => { if (m.type() === "error" && !CONSOLE_OK.test(m.text()) && !/^Failed to load resource/.test(m.text())) st.console.push(m.text().slice(0, 240)); });
  page.on("response", r => { if (r.status() >= 400) st.console.push(`HTTP ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`); });
  page.on("requestfailed", r => { if (!/^(data|blob):/.test(r.url())) st.console.push(`request failed ${r.url().replace(/^https?:\/\/[^/]+/, "")} (${(r.failure() || {}).errorText || "?"})`); });
  page.on("crash", () => { st.crashed = true; });
  // fortune-ai.js asks the same-origin backend "/api/fortune/status" on any host but *.github.io; the test server is a plain
  // static server, so it answers what the live GitHub Pages site behaves as: AI writer off (no other request is answered)
  await page.route("**/api/fortune/status", r => r.fulfill({ status: 200, contentType: "application/json", body: '{"enabled":false}' }));
  for (const s of [NO_DIALOGS, `try { localStorage.setItem("lq-lang", ${JSON.stringify(lang)}); } catch (e) {}`, ...init]) await page.addInitScript(s);
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  return { ctx, page, st };
}
/** the common LOAD checks; returns a list of problems */
async function loadChecks(page, lang, main) {
  const bad = [];
  try { await waitFor(page, l => document.documentElement.lang === l && !!window.LQI18N, HTML_LANG[lang], 10000); }
  catch { bad.push(`<html lang> is "${await page.evaluate(() => document.documentElement.lang)}", not ${HTML_LANG[lang]}`); }
  await sleep(600);
  const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (ov.sw > ov.cw + 1) bad.push(`horizontal scroll ${ov.sw} > ${ov.cw}`);
  for (const sel of main) { const p = ctlProblem(await page.evaluate(controlFacts, sel)); if (p) bad.push(p); }
  return bad;
}
const memory = page => page.evaluate(() => { const m = /** @type {any} */ (performance).memory; return m && m.usedJSHeapSize ? Math.round(m.usedJSHeapSize / 1048576) : null; });
const endChecks = (st, bad) => {
  if (st.crashed) bad.push("the WebKit page crashed");
  if (st.errors.length) bad.push("page error(s): " + st.errors.slice(0, 3).join(" | "));
  if (st.console.length) bad.push("console error(s): " + st.console.slice(0, 3).join(" | "));
};

export default async function ({ base, check, fakeCams }) {
  const browser = await launchWebKit();
  /** @type {Record<string, Record<string, string>>} page -> column -> "ok" | "FAIL" */
  const table = {}, mem = {};
  const mark = (pg, col, ok) => { (table[pg] = table[pg] || {})[col] = ok ? "ok" : "FAIL"; };
  try {
    for (const F of FORTUNE) {
      for (const lang of LANGS) {
        await check(`iPhone WebKit ${lang}: fortune ${F.page} loads, controls tappable, help 1323 tel link, one reading`, async () => {
          const init = F.cam ? [MD_SHIM, fakeCams, ONE_CAM] : [];
          const { ctx, page, st } = await open(browser, `${base}/${F.page}.html${F.q || ""}`, lang, init);
          let ok = false;
          try {
            const bad = await loadChecks(page, lang, F.main);
            const help = await page.evaluate(controlFacts, '#lqHelpTop a[href="tel:1323"]');
            const hp = ctlProblem(help); if (hp) bad.push("help 1323: " + hp);
            try { await F.read(page, lang); } catch (e) { bad.push("reading: " + String(e && e.message || e).split("\n")[0].slice(0, 200)); }
            const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            if (ov > 1) bad.push(`horizontal scroll after the reading (+${ov} px)`);
            mem[F.page] = await memory(page);
            endChecks(st, bad);
            assert(!bad.length, `${F.page} ${lang}: ` + bad.join("; "));
            ok = true;
          } finally { mark(F.page, "fortune-" + lang, ok); await ctx.close(); }
        });
      }
    }

    for (const C of CAMERA) {
      const q = C.q || "?cpu&fakedet";
      for (const lang of LANGS) {
        await check(`iPhone WebKit ${lang}: camera ${C.page} loads, controls tappable, camera refused -> plain ${lang} message, nothing hangs`, async () => {
          const { ctx, page, st } = await open(browser, `${base}/${C.page}.html${q}`, lang, [MD_SHIM, DENY, ...(C.init || [])]);
          let ok = false;
          try {
            const bad = await loadChecks(page, lang, []);
            const rx = DENIED[lang].map(r => [r.source, r.flags]);
            // texts already on the page before the start tap do not count. A page that already asked for the camera on load (and was
            // refused there) has no "before": its message is already after the refusal (amendment 2b; customers, driver, photobooth)
            const refusedOnLoad = await page.evaluate(() => window.__lqDenied || 0);
            const before = (C.start || C.startSelect) && !refusedOnLoad ? await page.evaluate(permTexts, rx) : [];
            if (C.pre) await C.pre(page);
            if (C.start) { const p = ctlProblem(await page.evaluate(controlFacts, C.start)); if (p) bad.push(p); else await tap(page, C.start); }
            if (C.startSelect) await setVal(page, C.startSelect[0], C.startSelect[1]);
            let msg = null;
            if (C.noCamera) {
              await sleep(2000);
              const n = await page.evaluate(() => window.__lqDenied || 0);
              if (n) bad.push(`a page that must not open the camera called getUserMedia ${n} time(s)`);
              const eng = await page.evaluate(() => { const e = document.getElementById("engine"); return e && e.getBoundingClientRect().height > 0 ? e.innerText.trim() : ""; });
              if (!eng) bad.push("no status line telling why the camera stays off");
              if (eng && lang !== "th" && THAI.test(eng)) bad.push(`the status line is not in ${lang}: "${eng.slice(0, 120)}"`);
            } else try {
              // same scan as permTexts() (a predicate cannot call another function: the pages' CSP forbids eval), new texts only
              const h = await waitFor(page, a => {
                if (!window.__lqDenied) return null;
                const res = a.rx.map(r => new RegExp(r[0], r[1]));
                let best = null;
                for (const e of document.querySelectorAll("body *")) {
                  if (/^(SCRIPT|STYLE|NOSCRIPT|svg)$/i.test(e.tagName) || e.closest("#siteNav, header.nav, footer, .lq-helpline, .lq-camhelp")) continue;
                  const hp = e.querySelector(".lq-camhelp");
                  const t = (hp ? (e.innerText || "").replace(hp.innerText || "", "") : e.innerText || "").trim();
                  if (!t || t.length > 400 || !res.every(r => r.test(t)) || a.before.includes(t)) continue;
                  const r = e.getBoundingClientRect(), s = getComputedStyle(e);
                  if (s.display === "none" || s.visibility === "hidden" || !r.width || !r.height || e.closest("[hidden]")) continue;
                  if (!best || t.length < best.length) best = t;
                }
                return best;
              }, { rx, before }, 12000);
              msg = await h.jsonValue();
            } catch { bad.push(`no camera-permission message in ${lang} (getUserMedia called ${await page.evaluate(() => window.__lqDenied || 0)} time(s))`); }
            if (msg && lang !== "th" && THAI.test(msg)) bad.push(`the message is not in ${lang}: "${msg.slice(0, 120)}"`);
            if (msg && lang === "th" && !THAI.test(msg)) bad.push(`the message is not in Thai: "${msg.slice(0, 120)}"`);
            // amendment 2b: no raw error code for the user, and a message that points to the browser's address bar / lock / camera icon
            // also gives the iPhone path (Safari aA -> Website Settings -> Camera)
            if (msg && RAW_CODE.test(msg)) bad.push(`the message shows a raw error code: "${msg.slice(0, 160)}"`);
            if (msg && ADDR_HINT.test(msg)) {
              // amendment 4: "aA" OR the page-menu wording (iOS 18+ shows a page-menu icon instead of aA), AND the Settings fallback,
              // AND the steps come before the retry word
              const fb = IOS_FALLBACK[lang].exec(msg), rt = msg.search(IOS_RETRY[lang]) >= 0 ? Math.max(...[...msg.matchAll(new RegExp(IOS_RETRY[lang].source, "gi"))].map(m => m.index)) : -1;
              if (!IOS_MENU[lang].test(msg)) bad.push(`the address-bar hint has no iPhone page-menu step (aA or the page menu): "${msg.slice(0, 200)}"`);
              if (!fb) bad.push(`the address-bar hint has no Settings > Apps > Safari > Camera fallback in ${lang}: "${msg.slice(0, 200)}"`);
              if (fb && rt >= 0 && rt < fb.index) bad.push(`the retry word comes before the iPhone steps: "${msg.slice(0, 200)}"`);
            }
            if (msg) {
              // amendment 5 (owner, real iPhone 16 Pro / iOS 27.0.1): inside the notice, a "how to allow the camera" link opens the
              // steps in place with one tap (no request); step 1 is the page-title tap, the Settings fallback is there, no raw code
              const where = await page.waitForFunction(m => {
                const d = [...document.querySelectorAll(".lq-camhelp")].find(x => {
                  const p = x.parentElement; if (!p || !x.getClientRects().length) return false;
                  return ((p.innerText || "").replace(x.innerText || "", "").replace(/\s+/g, " ")).includes(m.replace(/\s+/g, " ").slice(0, 40));
                });
                if (!d) return null;
                d.setAttribute("data-lq-help-hit", "1");
                return { label: (d.querySelector("summary") || {}).textContent || "", open: d.open };
              }, msg, { timeout: 5000, polling: 100 }).then(x => x.jsonValue()).catch(() => null);
              if (!where) bad.push(`no "${HELP_LABEL[lang]}" link inside the refusal notice`);
              else {
                if (where.label.trim() !== HELP_LABEL[lang]) bad.push(`help link label is "${where.label.trim()}", not "${HELP_LABEL[lang]}"`);
                const reqs = [];
                const onReq = r => reqs.push(r.url());
                page.on("request", onReq);
                await tap(page, "[data-lq-help-hit] > summary");
                const steps = await page.waitForFunction(() => {
                  const d = document.querySelector("[data-lq-help-hit]"); if (!d || !d.open) return null;
                  const li = [...d.querySelectorAll("li")].filter(x => x.getClientRects().length);
                  return li.length ? { first: li[0].innerText.trim(), all: d.innerText } : null;
                }, null, { timeout: 3000, polling: 100 }).then(x => x.jsonValue()).catch(() => null);
                await sleep(500);
                page.off("request", onReq);
                if (!steps) bad.push("one tap on the help link did not open the steps");
                else {
                  if (!HELP_FIRST[lang].test(steps.first)) bad.push(`step 1 is not the page-title tap: "${steps.first.slice(0, 120)}"`);
                  if (!IOS_FALLBACK[lang].test(steps.all)) bad.push(`the steps have no Settings > Apps > Safari > Camera fallback: "${steps.all.slice(0, 200)}"`);
                  if (RAW_CODE.test(steps.all)) bad.push("the steps show a raw error code");
                  if (lang !== "th" && THAI.test(steps.all)) bad.push(`the steps are not in ${lang}: "${steps.all.slice(0, 160)}"`);
                }
                if (reqs.length) bad.push(`opening the help made ${reqs.length} request(s): ${reqs.slice(0, 3).join(" ")}`);
              }
            }
            await sleep(1500);
            const hang = await page.evaluate(sel => {
              const busy = [...document.querySelectorAll('[aria-busy="true"]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest("[hidden]"); })
                .map(e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : ""));
              const s = sel && document.querySelector(sel);
              const shown = !!s && s.getBoundingClientRect().width > 0 && !s.closest("[hidden]");
              return { busy, disabled: shown && !!s.disabled };
            }, C.start);
            if (hang.busy.length) bad.push("still busy after the refusal: " + hang.busy.join(", "));
            if (hang.disabled) bad.push(`${C.start} is disabled after the refusal (no way to try again)`);
            const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            if (ov > 1) bad.push(`horizontal scroll after the message (+${ov} px)`);
            if (!(C.page in mem)) mem[C.page] = await memory(page);
            endChecks(st, bad);
            assert(!bad.length, `${C.page} ${lang}: ` + bad.join("; "));
            ok = true;
          } finally { mark(C.page, "denied-" + lang, ok); await ctx.close(); }
        });
      }
      // amendment 4 (optional item, reviewer): pages with a camera-off button are ALSO checked with pagehide (an extra check, not a replacement)
      for (const stop of C.alsoPagehide ? [C.stop, null] : [C.stop]) {
      await check(`iPhone WebKit th: camera ${C.page} fake camera start -> ${stop ? "stop" : "pagehide"} releases every track`, async () => {
        const { ctx, page, st } = await open(browser, `${base}/${C.page}.html${q}`, "th", [MD_SHIM, fakeCams, ONE_CAM, ...(C.init || [])]);
        let ok = false;
        try {
          const bad = [];
          await waitFor(page, () => !!window.__LQ_FAKE && !!window.LQI18N, null, 10000);
          if (C.noCamera) {
            await sleep(2000);
            const n = await page.evaluate(() => window.__LQ_FAKE.opens.length);
            if (n) bad.push(`a page that must not open the camera opened it ${n} time(s)`);
          } else try {
            if (C.pre) await C.pre(page);
            if (C.start) await tap(page, C.start);
            if (C.startSelect) await setVal(page, C.startSelect[0], C.startSelect[1]);
          } catch (e) { bad.push("start: " + String(e && e.message || e).split("\n")[0].slice(0, 200)); }
          if (!C.noCamera && !bad.length) try { await waitFor(page, () => window.__LQ_FAKE.live().length >= 1, null, 20000); } catch { bad.push("the camera never started (no live fake track)"); }
          if (!C.noCamera && !bad.length) {
            await sleep(800);
            if (typeof stop === "function") await stop(page);
            else if (stop && typeof stop === "object") await setVal(page, stop.select[0], stop.select[1]);
            else if (stop) await tap(page, stop);
            else await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })); });
            try { await waitFor(page, () => window.__LQ_FAKE.live().length === 0, null, 6000); }
            catch { bad.push(`${await page.evaluate(() => window.__LQ_FAKE.live().length)} camera track(s) still live after ${stop ? "the stop control" : "pagehide"}`); }
          }
          endChecks(st, bad);
          assert(!bad.length, `${C.page}: ` + bad.join("; "));
          ok = true;
        } finally { mark(C.page, stop === C.stop ? "tracks" : "pagehide", ok); await ctx.close(); }
      });
      }
    }
  } finally {
    await browser.close();
    const cols = ["fortune-th", "fortune-en", "fortune-zh", "denied-th", "denied-en", "denied-zh", "tracks", "pagehide"];
    console.log("\n  iPhone WebKit coverage (390 px) — " + cols.join(" | ") + " | JS heap MB");
    for (const pg of Object.keys(table)) {
      console.log("  " + pg.padEnd(12) + cols.map(c => (table[pg][c] || "-").padStart(c.length)).join("   ") + "   " + (mem[pg] == null ? "n/a" : mem[pg]));
    }
  }
}
