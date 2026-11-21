// tests/e2e/exam-consent-reread.e2e.mjs — owner decision 219 ก (2026-11-21 23:39, OWNER-INBOX-2026-11-21 Entry 9): "Clear the
// consent tick and show 'โปรดอ่านอีกครั้ง' when the notice changes; also hide both notice variants until the script has run."
// FIXED TEST written and locked (evals-locks/exam-consent-219.sha256) BEFORE the product change.
// Why: exam-lab.html painted the clip-OFF notice and consent sentence from static HTML until exam-lab.js ran; a candidate could
// tick consent under that wording, and when the page script switched the notice to the clip-ON wording (?clip=1) the tick stayed.
// How: an init script traps the assignment of window.LQExamClipUI (exam-clip-ui.js, the script right before exam-lab.js and
// exam-hall.js), so the page is snapshotted with the whole HTML parsed but before the page script ran (the static first
// paint), and the consent box is ticked at that moment (a candidate ticking early). A second trap on window.__LQ_EXAM_LAB (the
// last statement of exam-lab.js) snapshots the state when the page script has finished, before any language event.
//   R1 JavaScript off (Emulation.setScriptExecutionDisabled), ?clip=1: neither notice variant is rendered (lead / leadC, n2 /
//      n2c, n5c, consentTxt / consentClip), the consent box cannot be ticked (not rendered), the rendered text names no
//      recording state (no record / บันทึก / 录), and a neutral no-JavaScript line is shown in Thai, English and Chinese.
//   R2 [th/en/zh] ?clip=1, IndexedDB held: static first paint shows neither variant; a tick given then is cleared once
//      exam-lab.js has run, the clip-ON wording is shown and #noticeMsg shows exam.lab.reread; once the language file is in
//      the message is in that language (no Thai in en / zh).
//   R3 clips off, tick before the script: the clip-OFF wording appears for the first time, so the tick is cleared too.
//   R4 [th/en/zh] normal flows still work: clip OFF (tick, room, seat, submit -> camera step, no reread message) and clip ON
//      (no reread at load, invigilator PIN, fresh tick, submit -> camera step).
//   R5 a language switch does not change what the notice says: a tick given after load survives LQI18N.setLang.
//   R6 exam-hall.html (same pattern, no consent box there): static first paint shows neither lead variant; with ?clip=1 and
//      IndexedDB held the clip-ON lead and the clip warning are shown as soon as exam-hall.js has run.
// RELOCK 1 (2026-11-22, STRICTER, owner decision 225 ก follow-up): the consent tick box (#consent) itself stays hidden until
// exam-lab.js has run, so it cannot be ticked before the notice text exists. Added, nothing removed or loosened:
//   R1 also: with JavaScript off #consent sits inside a static [hidden] control (hidden by the HTML itself, not only by the
//      noscript style).
//   R2 also: when the page script has finished the box is rendered (and the early tick is cleared, as before).
//   R7 [th/en/zh] exam-lab.js blocked (Network.setBlockedURLs): #consent is not rendered, sits inside a static [hidden]
//      control and cannot take focus, so a person cannot tick it; the pre-script snapshot of a normal load agrees. With the
//      script: when it finishes the box is rendered and unticked, a real mouse click (Input.dispatchMouseEvent) ticks it, and
//      the consent sentence next to it is in the page language (no Thai in en / zh).
// No camera beyond the fake one; no photo of a person; nothing is sent.
import { assert } from "./cdp.mjs";
import { exceptions, sleep } from "./exam-kit.mjs";

const THAI = /[ก-ฺเ-๛]/;
const REREAD = { th: /โปรดอ่านอีกครั้ง/, en: /read it again/i, zh: /重新阅读/ };
const lang = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const VARIANTS = ["#lead", "#leadC", "#n2", "#n2c", "#n5c", "#consentTxt", "#consentClip"];

// shared in-page helpers: shown = not hidden and rendered (any client rect)
const HELP = `window.__shown = q => { const e = document.querySelector(q); return !!e && !e.hidden && e.getClientRects().length > 0; };
window.__state = () => { const $ = q => document.querySelector(q), v = {};
  for (const q of ${JSON.stringify(VARIANTS)}) v[q.slice(1)] = !!$(q) && !$(q).hidden;
  return Object.assign(v, { consent: !!$("#consent") && $("#consent").checked, consentShown: window.__shown("#consent"),
    consentStatic: !!$("#consent") && !!$("#consent").closest("[hidden]"), msg: $("#noticeMsg") ? $("#noticeMsg").textContent : null }); };`;

// trap: the moment before the page script (window.LQExamClipUI is assigned by exam-clip-ui.js); optionally ticks consent
const PRE = tick => `(() => {
  ${HELP}
  Object.defineProperty(window, "LQExamClipUI", { configurable: true, get() { return undefined; }, set(v) {
    Object.defineProperty(window, "LQExamClipUI", { value: v, writable: true, configurable: true, enumerable: true });
    try {
      const $ = q => document.querySelector(q), s = window.__state();
      s.parsed = !!$("#stepExam") && !!$("#noticeForm"); s.lab = window.__LQ_EXAM_LAB !== undefined; s.hall = window.__LQ_EXAM_HALL !== undefined;
      if (${tick ? "true" : "false"} && $("#consent")) { $("#consent").checked = true; s.ticked = $("#consent").checked; }
      window.__pre = s;
    } catch (e) { window.__pre = { error: String(e) }; }
  } });
  Object.defineProperty(window, "__LQ_EXAM_LAB", { configurable: true, get() { return undefined; }, set(lab) {
    Object.defineProperty(window, "__LQ_EXAM_LAB", { value: lab, writable: true, configurable: true, enumerable: true });
    try { window.__end = Object.assign(window.__state(), { cfgOn: lab.clipCfg.on, phase: lab.phase }); } catch (e) { window.__end = { error: String(e) }; }
  } });
})();`;

// holds indexedDB.open("lq-exam-clips") until window.__idbRelease() (same technique as exam-clip-notice.e2e.mjs)
const HOLD = `(() => {
  if (!window.indexedDB) return;
  const idb = window.indexedDB, open0 = idb.open.bind(idb);
  let release; const gate = new Promise(r => { release = r; });
  window.__idbHeld = 0; window.__idbRelease = () => release();
  idb.open = function (name, v) {
    if (name !== "lq-exam-clips") return open0(name, v);
    window.__idbHeld++;
    let r = null;
    const fake = { onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null,
      get result() { return r ? r.result : undefined; }, get error() { return r ? r.error : null; }, get readyState() { return r ? r.readyState : "pending"; } };
    gate.then(() => {
      window.__idbHeld--;
      r = open0(name, v);
      for (const k of ["onsuccess", "onerror", "onupgradeneeded", "onblocked"]) r[k] = e => { if (typeof fake[k] === "function") fake[k].call(fake, e); };
    });
    return fake;
  };
})();`;

const PIN = "482913";
async function pinIn(page) {
  await page.evaluate(p => {
    document.querySelector("#clipBox").open = true;
    const f = document.querySelector("#clipList form"); f.querySelector("[data-cpin]").value = p;
    const c = f.querySelector("[data-cpin2]"); if (c) c.value = p;
    f.requestSubmit();
  }, PIN);
  await page.waitFor("window.__LQ_EXAM_LAB.clips.unlocked && window.__LQ_EXAM_LAB.clips.pin.has()", 8000);
}
const submit = page => page.evaluate(() => {
  document.querySelector("#room").value = "CNS1"; document.querySelector("#seat").value = "4";
  document.querySelector("#consent").checked = true; document.querySelector("#noticeForm").requestSubmit();
  return { phase: window.__LQ_EXAM_LAB.phase, msg: document.querySelector("#noticeMsg").textContent };
});

function assertNoVariant(s, label) {
  assert(s && !s.error, `${label}: no snapshot: ${JSON.stringify(s)}`);
  for (const q of VARIANTS) assert(s[q.slice(1)] === false, `${label}: ${q} is shown in the static first paint: ${JSON.stringify(s)}`);
}
function assertClipOn(s, label) {
  assert(!s.lead && s.leadC && !s.n2 && s.n2c && s.n5c && !s.consentTxt && s.consentClip, `${label}: clip-ON wording expected: ${JSON.stringify(s)}`);
}
function assertClipOff(s, label) {
  assert(s.lead && !s.leadC && s.n2 && !s.n2c && !s.n5c && s.consentTxt && !s.consentClip, `${label}: clip-OFF wording expected: ${JSON.stringify(s)}`);
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const LAB = `${base}/exam-lab.html?cpu&fakedet`;
  try {
    await check("exam-consent-reread R1: JavaScript off — no notice variant, consent cannot be ticked, neutral line in TH/EN/ZH", async () => {
      const page = await browser.newPage(null, { isolated: true });
      try {
        await page.send("Emulation.setScriptExecutionDisabled", { value: true });
        await page.goto(`${LAB}&clip=1&clipdays=7`);
        const r = await page.evaluate(`(() => {
          const shown = q => { const e = document.querySelector(q); return !!e && !e.hidden && e.getClientRects().length > 0; };
          const v = {}; for (const q of ${JSON.stringify(VARIANTS)}) v[q] = shown(q);
          return { ran: window.__LQ_EXAM_LAB !== undefined || window.LQExamClipUI !== undefined, v, consent: shown("#consent"),
            submit: shown("#toCam"), text: document.body.innerText,
            hid: !!document.querySelector("#consent") && !!document.querySelector("#consent").closest("[hidden]") };
        })()`);
        assert(r && !r.ran, `R1: page scripts ran although JavaScript is off: ${JSON.stringify(r && r.ran)}`);
        for (const q of VARIANTS) assert(r.v[q] === false, `R1: ${q} is rendered with JavaScript off: ${JSON.stringify(r.v)}`);
        assert(!r.consent && !r.submit, `R1: the consent box / next button can be used with JavaScript off: ${JSON.stringify({ c: r.consent, s: r.submit })}`);
        assert(r.hid === true, `R1 (relock1): with JavaScript off #consent is not inside a static [hidden] control (only the noscript style hides it)`);
        assert(!/บันทึก|record|录/i.test(r.text), `R1: the rendered text names a recording state: ${r.text.slice(0, 600)}`);
        assert(/JavaScript/.test(r.text) && THAI.test(r.text) && /需要/.test(r.text) && /needs JavaScript/i.test(r.text),
          `R1: no neutral no-JavaScript line in Thai, English and Chinese: ${r.text.slice(0, 600)}`);
      } finally { await page.close(); }
    });

    for (const l of ["th", "en", "zh"]) {
      await check(`exam-consent-reread R2 [${l}]: ?clip=1 — static paint shows no variant; an early tick is cleared and reread is shown`, async () => {
        const page = await browser.newPage(null, { isolated: true, initScripts: [fakeCams, lang(l), HOLD, PRE(true)] });
        try {
          await page.goto(`${LAB}&clip=1&clipdays=7`);
          await page.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
          const pre = await page.evaluate(() => window.__pre);
          assert(pre && pre.parsed && !pre.lab, `R2 [${l}]: the pre-script snapshot was not taken after parsing and before exam-lab.js: ${JSON.stringify(pre)}`);
          assertNoVariant(pre, `R2 [${l}] static first paint`);
          assert(pre.ticked === true, `R2 [${l}]: could not tick consent before the page script: ${JSON.stringify(pre)}`);
          const end = await page.evaluate(() => window.__end);
          assert(end && !end.error && end.cfgOn === true, `R2 [${l}]: no end-of-script snapshot: ${JSON.stringify(end)}`);
          assertClipOn(end, `R2 [${l}] end of page script`);
          assert(end.consent === false, `R2 [${l}]: the tick given before the notice switched survived: ${JSON.stringify(end)}`);
          assert(end.consentShown === true && end.consentStatic === false, `R2 [${l}] (relock1): the consent box is not shown when the page script finished: ${JSON.stringify(end)}`);
          assert(REREAD.th.test(end.msg) || REREAD[l].test(end.msg), `R2 [${l}]: reread message not shown when the script finished: ${JSON.stringify(end.msg)}`);
          if (l !== "th") await page.waitFor(`${REREAD[l]}.test(document.querySelector("#noticeMsg").textContent)`, 8000).catch(() => {});
          const s = await page.evaluate(() => window.__state());
          assert(s.consent === false, `R2 [${l}]: consent ticked again on its own: ${JSON.stringify(s)}`);
          assert(REREAD[l].test(s.msg), `R2 [${l}]: reread message not in the page language: ${JSON.stringify(s.msg)}`);
          if (l !== "th") assert(!THAI.test(s.msg), `R2 [${l}]: Thai letters in the reread message: ${s.msg}`);
          assertClipOn(s, `R2 [${l}] after the language file`);
          await page.evaluate(() => window.__idbRelease());
          await page.waitFor("window.__idbHeld === 0", 5000);
          await sleep(400);
          const after = await page.evaluate(() => window.__state());
          assertClipOn(after, `R2 [${l}] after IndexedDB answered`);
          assert(after.consent === false && REREAD[l].test(after.msg), `R2 [${l}] after IndexedDB: ${JSON.stringify(after)}`);
          const ex = exceptions(page);
          assert(!ex.length, `R2 [${l}]: page exceptions: ${JSON.stringify(ex).slice(0, 400)}`);
        } finally { await page.close(); }
      });
    }

    await check("exam-consent-reread R3: clips off — a tick given before the notice appeared is cleared and reread is shown", async () => {
      const page = await browser.newPage(null, { isolated: true, initScripts: [fakeCams, lang("th"), PRE(true)] });
      try {
        await page.goto(LAB);
        await page.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
        const pre = await page.evaluate(() => window.__pre);
        assertNoVariant(pre, "R3 static first paint");
        assert(pre.ticked === true, `R3: could not tick consent early: ${JSON.stringify(pre)}`);
        const end = await page.evaluate(() => window.__end);
        assert(end && end.cfgOn === false, `R3: clips should be off: ${JSON.stringify(end)}`);
        assertClipOff(end, "R3 end of page script");
        assert(end.consent === false && REREAD.th.test(end.msg), `R3: early tick not cleared / no reread: ${JSON.stringify(end)}`);
      } finally { await page.close(); }
    });

    for (const l of ["th", "en", "zh"]) {
      await check(`exam-consent-reread R4 [${l}]: normal clip-OFF and clip-ON consent flows still reach the camera step`, async () => {
        const off = await browser.newPage(null, { isolated: true, initScripts: [fakeCams, lang(l), PRE(false)] });
        try {
          await off.goto(`${LAB}&calsec=1`);
          await off.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
          assertNoVariant(await off.evaluate(() => window.__pre), `R4 [${l}] off static first paint`);
          await sleep(300);
          const s0 = await off.evaluate(() => window.__state());
          assertClipOff(s0, `R4 [${l}] off`);
          assert(!s0.consent && s0.msg === "", `R4 [${l}] off: consent ticked or a message at load: ${JSON.stringify(s0)}`);
          const r = await submit(off);
          assert(r.phase === "cam" && r.msg === "", `R4 [${l}] off: submit did not reach the camera step: ${JSON.stringify(r)}`);
          const ex = exceptions(off);
          assert(!ex.length, `R4 [${l}] off: page exceptions: ${JSON.stringify(ex).slice(0, 400)}`);
        } finally { await off.close(); }

        const on = await browser.newPage(null, { isolated: true, initScripts: [fakeCams, lang(l), PRE(false)] });
        try {
          await on.goto(`${LAB}&calsec=1&clip=1&clipdays=7`);
          await on.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
          assertNoVariant(await on.evaluate(() => window.__pre), `R4 [${l}] on static first paint`);
          await sleep(300);
          const s0 = await on.evaluate(() => window.__state());
          assertClipOn(s0, `R4 [${l}] on`);
          assert(!s0.consent && s0.msg === "", `R4 [${l}] on: consent ticked or a message at load: ${JSON.stringify(s0)}`);
          await pinIn(on);
          const r = await submit(on);
          assert(r.phase === "cam" && r.msg === "", `R4 [${l}] on: submit did not reach the camera step: ${JSON.stringify(r)}`);
          const ex = exceptions(on);
          assert(!ex.length, `R4 [${l}] on: page exceptions: ${JSON.stringify(ex).slice(0, 400)}`);
        } finally { await on.close(); }
      });
    }

    await check("exam-consent-reread R5: a language switch keeps a tick given after load (the notice says the same)", async () => {
      const page = await browser.newPage(null, { isolated: true, initScripts: [fakeCams, lang("th"), PRE(false)] });
      try {
        await page.goto(`${LAB}&clip=1&clipdays=7`);
        await page.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
        await sleep(300);
        await page.evaluate(() => { document.querySelector("#consent").checked = true; });
        for (const l of ["en", "zh", "th"]) {
          await page.evaluate(x => window.LQI18N.setLang(x), l);
          await sleep(700);
          const s = await page.evaluate(() => window.__state());
          assertClipOn(s, `R5 after setLang(${l})`);
          assert(s.consent === true && s.msg === "", `R5: setLang(${l}) cleared the tick or showed a message: ${JSON.stringify(s)}`);
        }
      } finally { await page.close(); }
    });

    await check("exam-consent-reread R6: exam-hall — static paint shows no lead variant; ?clip=1 shows the clip-ON lead before IndexedDB answers", async () => {
      const page = await browser.newPage(null, { isolated: true, initScripts: [fakeCams, lang("th"), HOLD, PRE(false)] });
      try {
        await page.goto(`${base}/exam-hall.html?cpu&fakedet&clip=1`);
        await page.waitFor("window.__LQ_EXAM_HALL && window.LQI18N", 8000);
        const pre = await page.evaluate(() => window.__pre);
        assert(pre && !pre.error && !pre.hall, `R6: no pre-script snapshot: ${JSON.stringify(pre)}`);
        assert(pre.lead === false && pre.leadC === false, `R6: a hall lead variant is shown in the static first paint: ${JSON.stringify(pre)}`);
        const s = await page.evaluate(() => ({ held: window.__idbHeld, lead: window.__shown("#lead"), leadC: window.__shown("#leadC"), warn: window.__shown("#clipWarn"),
          on: document.querySelector("#clipOn").checked }));
        assert(s.held > 0, `R6: IndexedDB was not held: ${JSON.stringify(s)}`);
        assert(!s.lead && s.leadC && s.warn && s.on, `R6: clip-ON lead / clip warning not shown while IndexedDB is held: ${JSON.stringify(s)}`);
        await page.evaluate(() => window.__idbRelease());
        await page.waitFor("window.__idbHeld === 0", 5000);
        await sleep(300);
        const after = await page.evaluate(() => ({ lead: window.__shown("#lead"), leadC: window.__shown("#leadC") }));
        assert(!after.lead && after.leadC, `R6 after IndexedDB answered: ${JSON.stringify(after)}`);
        const off = await browser.newPage(null, { isolated: true, initScripts: [fakeCams, lang("th"), PRE(false)] });
        try {
          await off.goto(`${base}/exam-hall.html?cpu&fakedet`);
          await off.waitFor("window.__LQ_EXAM_HALL && window.LQI18N", 8000);
          await sleep(300);
          const o = await off.evaluate(() => ({ lead: window.__shown("#lead"), leadC: window.__shown("#leadC"), warn: window.__shown("#clipWarn") }));
          assert(o.lead && !o.leadC && !o.warn, `R6 clips off: the clip-OFF hall lead expected: ${JSON.stringify(o)}`);
        } finally { await off.close(); }
        const ex = exceptions(page);
        assert(!ex.length, `R6: page exceptions: ${JSON.stringify(ex).slice(0, 400)}`);
      } finally { await page.close(); }
    });

    for (const l of ["th", "en", "zh"]) {
      await check(`exam-consent-reread R7 [${l}]: the consent box is hidden until exam-lab.js has run, then shown unticked and tickable`, async () => {
        const blocked = await browser.newPage(null, { isolated: true, initScripts: [fakeCams, lang(l), HELP] });
        try {
          await blocked.send("Network.setBlockedURLs", { urls: ["*exam-lab.js*"] });
          await blocked.goto(LAB);
          await blocked.waitFor(`document.readyState === "complete" && !!window.LQI18N`, 10000);
          await sleep(600);
          const b = await blocked.evaluate(() => {
            const c = document.querySelector("#consent"), st = document.querySelector("#stepNotice");
            if (c) c.focus();
            return { ran: window.__LQ_EXAM_LAB !== undefined, exists: !!c, shown: window.__shown("#consent"),
              hid: !!c && !!c.closest("[hidden]"), focused: !!c && document.activeElement === c,
              rects: c ? c.getClientRects().length : -1, notice: !!st && !st.hidden };
          });
          assert(b.exists && !b.ran, `R7 [${l}] blocked: exam-lab.js ran or #consent is missing: ${JSON.stringify(b)}`);
          assert(b.notice, `R7 [${l}] blocked: the notice step itself is not in the static page: ${JSON.stringify(b)}`);
          assert(!b.shown && b.rects === 0, `R7 [${l}] blocked: the consent box is visible before exam-lab.js has run: ${JSON.stringify(b)}`);
          assert(b.hid, `R7 [${l}] blocked: #consent is not inside a static [hidden] control: ${JSON.stringify(b)}`);
          assert(!b.focused, `R7 [${l}] blocked: the consent box can take focus (and so be ticked from the keyboard): ${JSON.stringify(b)}`);
        } finally { await blocked.close(); }

        const page = await browser.newPage(null, { isolated: true, initScripts: [fakeCams, lang(l), PRE(false)] });
        try {
          await page.goto(LAB);
          await page.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
          const pre = await page.evaluate(() => window.__pre);
          assert(pre && pre.parsed && !pre.lab, `R7 [${l}]: no pre-script snapshot: ${JSON.stringify(pre)}`);
          assert(pre.consentShown === false && pre.consentStatic === true, `R7 [${l}]: the consent box is visible in the static first paint: ${JSON.stringify(pre)}`);
          const end = await page.evaluate(() => window.__end);
          assert(end && !end.error, `R7 [${l}]: no end-of-script snapshot: ${JSON.stringify(end)}`);
          assert(end.consentShown === true && end.consentStatic === false && end.consent === false,
            `R7 [${l}]: the consent box is not shown, or not unticked, when the page script finished: ${JSON.stringify(end)}`);
          await sleep(500);
          const box = await page.evaluate(() => {
            const c = document.querySelector("#consent"); c.scrollIntoView({ block: "center" });
            const r = c.getBoundingClientRect();
            const txt = [...c.closest("label").querySelectorAll("span")].filter(e => !e.hidden).map(e => e.textContent).join(" ").trim();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, checked: c.checked, txt };
          });
          assert(box.w > 0 && box.h > 0 && box.checked === false, `R7 [${l}]: the consent box is not rendered unticked after load: ${JSON.stringify(box)}`);
          assert(box.txt.length > 10, `R7 [${l}]: no consent sentence next to the box: ${JSON.stringify(box)}`);
          if (l !== "th") assert(!THAI.test(box.txt), `R7 [${l}]: the consent sentence is not in the page language: ${box.txt}`);
          for (const type of ["mousePressed", "mouseReleased"]) await page.send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
          await sleep(200);
          const ticked = await page.evaluate(() => document.querySelector("#consent").checked);
          assert(ticked === true, `R7 [${l}]: a real click on the shown consent box did not tick it`);
          const ex = exceptions(page);
          assert(!ex.length, `R7 [${l}]: page exceptions: ${JSON.stringify(ex).slice(0, 400)}`);
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
}
