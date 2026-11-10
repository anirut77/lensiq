// tests/e2e/exam-hall-setup.e2e.mjs — the hall setup check on exam-hall.html (face width in px before monitoring) with a
// fake camera of a chosen size and scripted detections (?fakedet): the camera request ladder and what the page shows as
// obtained, every state of the panel (no camera, no face, small face, more people than faces, OK, engine failure) in
// Thai / English / Chinese, px measured on the NATIVE frame, nothing stored or sent, off during monitoring, phone layout.
// Review fixes: a chosen camera is walked down every size before another camera; 47.9 px reads 47 px; never OK before a
// people count; the face limit has its own message; no clip when no 1280 px copy can be made; the seat shape warning.
import { assert, privacyScan } from "./cdp.mjs";
import { assertCleanMessages, exceptions, noThai, phoneAudit, sleep } from "./exam-kit.mjs";

const init = cams => `window.__LQ_FAKE_CAMS = ${JSON.stringify(cams)}; window.__dets = []; window.__setup = [];
  try { localStorage.setItem("lq-lang", "th"); } catch (e) {}
  window.__mrW = []; // the frame width every MediaRecorder (evidence clip ring) was given
  if (window.MediaRecorder) {
    const MR0 = window.MediaRecorder;
    window.MediaRecorder = class extends MR0 {
      constructor(st, o) { super(st, o); const t = st.getVideoTracks()[0]; window.__mrW.push(t ? (t.getSettings().width || 0) : 0); }
    };
    window.MediaRecorder.isTypeSupported = t => MR0.isTypeSupported(t);
  }
  window.__LQ_FAKE_DET = key => key === "exam-hall" ? window.__dets : key === "exam-hall-setup" ? window.__setup : key === "exam-hall-faces" ? [] : null;`;
const PERSON = i => ({ x: 0.1 + 0.2 * i, y: 0.4, w: 0.1, h: 0.4, score: 0.9 });
const face = (i, px, W) => ({ x: 0.1 + 0.2 * i, y: 0.2, w: px / W, h: px * 1.3 / W });
const THAI = /[฀-๿]/;

async function openHall(browser, base, fakeCams, cams, extraInit) {
  const page = await browser.newPage(null, { initScripts: [fakeCams, init(cams)].concat(extraInit ? [extraInit] : []), isolated: true });
  await page.goto(`${base}/exam-hall.html?cpu&fakedet`);
  await page.waitFor("window.__LQ_EXAM_HALL && window.LQI18N", 8000);
  return page;
}
const startCam = async page => {
  await page.evaluate(() => { document.querySelector("#room").value = "HALL7"; document.querySelector("#setupForm").requestSubmit(); });
  await page.waitFor("document.querySelector('#engine').classList.contains('ok') && __LQ_EXAM_HALL.frame.w > 0", 10000);
};
const panel = page => page.evaluate(() => {
  const s = document.querySelector("#scState");
  return { state: s.dataset.state, cls: s.className, text: s.textContent, kv: [...document.querySelectorAll("#scKv span")].map(x => x.textContent),
    list: document.querySelector("#scList").hidden ? "" : document.querySelector("#scList").textContent, res: __LQ_EXAM_HALL.setup.res };
});
/** set the scripted people / faces and wait for the panel state */
async function show(page, people, faces, state) {
  await page.evaluate((p, f) => { window.__dets = p; window.__setup = f; }, people, faces);
  await page.waitFor(`document.querySelector("#scState").dataset.state === "${state}" && (!__LQ_EXAM_HALL.setup.res || ` +
    `(__LQ_EXAM_HALL.setup.res.people === ${people.length} && __LQ_EXAM_HALL.setup.res.n === ${faces === "fail" ? 0 : faces.length}))`, 6000);
  return panel(page);
}
/** the state text in en and zh: no Thai, and the wording of that state */
async function inLangs(page, label, want) {
  for (const l of ["en", "zh"]) {
    await page.evaluate(lang => LQI18N.setLang(lang), l);
    await page.waitFor(`LQI18N.lang === "${l}"`, 5000);
    await sleep(500);
    const p = await panel(page);
    const shown = [p.text, p.list].concat(p.kv).join(" | ");
    assert(!THAI.test(shown), `${label} [${l}]: Thai left in the panel: ${shown}`);
    assert(want[l].test(p.text), `${label} [${l}]: ${p.text}`);
    const c = await page.evaluate(() => LQI18N.coverage(document.body, { top: 6 }));
    assert(c.thai === 0, `${label} [${l}]: ${c.thai} Thai letters on the page — ${c.top.map(x => x.path + " «" + x.text + "»").join(" | ")}`);
  }
  await page.evaluate(() => LQI18N.setLang("th"));
  await page.waitFor(`LQI18N.lang === "th"`, 5000);
  await sleep(300);
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("exam-hall setup check: 4K camera obtained and shown, all states in TH / EN / ZH, px on the native frame, nothing stored or sent", async () => {
      const page = await openHall(browser, base, fakeCams, { n: 1, mode: "ok", res: { w: 3840, h: 2160 } });
      // before the camera: the button says so, nothing runs
      let p = await panel(page);
      assert(p.state === "idle" && /ยังไม่ได้ตรวจการติดตั้ง/.test(p.text) && !p.kv.length, "idle: " + JSON.stringify(p));
      await page.evaluate(() => document.querySelector("#scBtn").click());
      p = await panel(page);
      assert(p.state === "nocam" && / warn/.test(p.cls) && /เปิดกล้องก่อน/.test(p.text), "no camera: " + JSON.stringify(p));
      await page.evaluate(() => document.querySelector("#scBtn").click());

      await startCam(page);
      const fr = await page.evaluate(() => Object.assign({ req: __LQ_FAKE.requests, vw: document.querySelector("#video").videoWidth }, __LQ_EXAM_HALL.frame));
      assert(fr.w === 3840 && fr.h === 2160 && fr.vw === 3840, "camera frame obtained " + JSON.stringify(fr));
      assert(fr.req.length === 1 && fr.req[0].width.ideal === 3840 && fr.req[0].height.ideal === 2160, "first request is 3840x2160: " + JSON.stringify(fr.req));
      assert(fr.overlayW === 1280, "overlay canvas stays 1280 wide: " + fr.overlayW);
      p = await panel(page);
      assert(p.kv.some(t => /3840 × 2160 px/.test(t) && /ขอสูงสุด 3840 × 2160/.test(t)), "resolution obtained is shown before the check starts: " + p.kv);
      const lsBefore = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
      const sentBefore = await page.evaluate(() => __LQ_EXAM_HALL.sent.length);

      await page.evaluate(() => document.querySelector("#scBtn").click());
      assert(await page.evaluate(() => __LQ_EXAM_HALL.setup.on && document.querySelector("#scBtn").getAttribute("aria-pressed") === "true"), "check on");
      assert(await page.evaluate(() => __LQ_EXAM_HALL.setup.everyMs >= 500 && __LQ_EXAM_HALL.setup.everyMs <= 1000), "1 - 2 measurements per second");

      // no face, nobody seen / people seen but no face measured: never OK
      p = await show(page, [], [], "noface");
      assert(/ warn/.test(p.cls) && !/ ok/.test(p.cls) && /ยังวัดใบหน้าไม่ได้เลย/.test(p.text) && p.kv.some(t => /ใบหน้าเล็กสุด: ยังวัดไม่ได้/.test(t)), "no face: " + JSON.stringify(p));
      p = await show(page, [PERSON(0), PERSON(1), PERSON(2)], [], "noface");
      assert(/ warn/.test(p.cls) && !/ ok/.test(p.cls) && /เห็นคน 3 คน แต่วัดใบหน้าไม่ได้เลย/.test(p.text), "people but no face: " + JSON.stringify(p));
      await inLangs(page, "people, no face", { en: /^3 people seen, 0 faces measured — the faces may be too small or too far/, zh: /^看到 3 人，测到 0 张脸/ });

      // a face under 48 px: the clear warning, the smallest width, one number per face; px = normalised width x 3840
      p = await show(page, [PERSON(0), PERSON(1)], [face(0, 40, 3840), face(1, 96, 3840)], "small");
      assert(/ err/.test(p.cls) && !/ ok/.test(p.cls), "small face: warning style " + p.cls);
      assert(/คำเตือน: มีใบหน้ากว้างน้อยกว่า 48 px จำนวน 1 จาก 2 ใบหน้าที่วัดได้ \(เล็กสุด 40 px\)/.test(p.text), "small face text: " + p.text);
      assert(p.kv.some(t => t === "ใบหน้าเล็กสุด 40 px") && p.kv.some(t => t === "ใบหน้าที่วัดได้ 2") && p.kv.some(t => t === "เห็นคน 2"), "small face readout: " + p.kv);
      assert(/40 ⚠ · 96$/.test(p.list), "per-face widths: " + p.list);
      assert(p.res.faces.map(f => f.px).join() === "40,96" && p.res.frameW === 3840 && p.res.small === 1, "px on the native frame: " + JSON.stringify(p.res));
      await inLangs(page, "small face", { en: /^Warning: 1 of 2 measured faces are under 48 px wide \(smallest 40 px\)/, zh: /^警告：测到的 2 张脸中有 1 张宽度不足 48 px（最小 40 px）/ });
      // small AND more people than faces: both warnings
      p = await show(page, [PERSON(0), PERSON(1), PERSON(2)], [face(0, 40, 3840), face(1, 96, 3840)], "small");
      assert(/เล็กสุด 40 px/.test(p.text) && /เห็นคน 3 คน วัดใบหน้าได้ 2 ใบหน้า/.test(p.text), "small + people: " + p.text);

      // every measured face is wide enough, but more people than faces: a warning, never OK
      p = await show(page, [PERSON(0), PERSON(1), PERSON(2)], [face(0, 60, 3840), face(1, 96, 3840)], "people");
      assert(/ warn/.test(p.cls) && !/ ok/.test(p.cls) && /^เห็นคน 3 คน วัดใบหน้าได้ 2 ใบหน้า — คนที่เหลืออาจเล็กหรืออยู่ไกลเกินไป$/.test(p.text), "people > faces: " + JSON.stringify(p));
      assert(p.res.ok === false && p.res.unmeasured === 1 && p.res.minFacePx === 60, "people > faces result " + JSON.stringify(p.res));
      await inLangs(page, "people > faces", { en: /^3 people seen, 2 faces measured — the others may be too small or too far$/, zh: /^看到 3 人，测到 2 张脸——其余的人可能太小或太远$/ });

      // OK: every face >= 48 px (48 exactly counts) and people <= faces; it still says 48 px is a minimum, not a guarantee
      p = await show(page, [PERSON(0), PERSON(1)], [face(0, 48, 3840), face(1, 96, 3840)], "ok");
      assert(/ ok/.test(p.cls) && /ใบหน้าที่วัดได้ทั้ง 2 ใบหน้ากว้างอย่างน้อย 48 px \(เล็กสุด 48 px\)/.test(p.text) && /48 px เป็นขั้นต่ำ ไม่ใช่การรับประกัน/.test(p.text), "ok: " + JSON.stringify(p));
      assert(p.kv.some(t => t === "ใบหน้าเล็กสุด 48 px"), "ok readout " + p.kv);
      await inLangs(page, "ok", {
        en: /^All 2 measured faces are at least 48 px wide \(smallest 48 px\).*48 px is a minimum, not a guarantee$/,
        zh: /^测到的 2 张脸宽度均不小于 48 px（最小 48 px）.*48 px 只是最低要求，并非保证$/
      });
      await phoneAudit(page, "exam-hall setup check");
      // the boxes are drawn on the overlay (something is painted where the first face is)
      assert(await page.evaluate(() => {
        const c = document.querySelector("#overlay"), d = c.getContext("2d").getImageData(Math.round(0.1 * c.width) - 2, Math.round(0.2 * c.width * 9 / 16) - 2, 6, 40).data;
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
        return n > 0;
      }), "face box drawn on the overlay");
      // back to a state that is not OK at once when a person without a face appears
      p = await show(page, [PERSON(0), PERSON(1), PERSON(2)], [face(0, 48, 3840), face(1, 96, 3840)], "people");
      assert(!/ ok/.test(p.cls), "OK is withdrawn");

      // nothing stored, nothing sent, no request
      await sleep(1600);
      const after = await page.evaluate(() => ({
        ls: JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])), sent: __LQ_EXAM_HALL.sent, recent: __LQ_EXAM_HALL.recent.length
      }));
      assert(after.ls === lsBefore, "the setup check stores nothing: " + after.ls.slice(0, 300));
      assert(after.sent.length === sentBefore && after.recent === 0, "the setup check sends no event");
      assertCleanMessages(after.sent, "hall setup");
      await privacyScan(page);

      // engine failure: said, not OK, seat watching goes on
      p = await show(page, [PERSON(0)], "fail", "error");
      assert(/ err/.test(p.cls) && /ตัววัดใบหน้าทำงานในเครื่องนี้ไม่ได้/.test(p.text) && !p.list, "engine failure: " + JSON.stringify(p));
      await noThai(page, "exam-hall setup check failed");
      await page.evaluate(() => {
        window.__setup = [{ x: 0.1, y: 0.2, w: 0.02, h: 0.03 }];
        document.querySelector("#scBtn").click(); document.querySelector("#scBtn").click(); // off and on again: the error state is cleared
      });
      await page.waitFor(`document.querySelector("#scState").dataset.state === "ok"`, 5000);

      // monitoring: the setup check stops and cannot be started; the evidence clip source is no wider than 1280 px
      await page.evaluate(() => {
        const c = document.querySelector("#clipOn"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true }));
        document.querySelector("#clipBox").open = true; // invigilator PIN for clips on this device (needed before any recording)
        const f = document.querySelector("#clipList form"); f.querySelector("[data-cpin]").value = "482913";
        const c2 = f.querySelector("[data-cpin2]"); if (c2) c2.value = "482913";
        f.requestSubmit();
      });
      await page.waitFor("__LQ_EXAM_HALL.clips.unlocked && __LQ_EXAM_HALL.clips.pin.has()", 8000);
      assert(await page.evaluate(() => window.__mrW.length === 0), "no recorder before monitoring");
      await page.evaluate(() => {
        document.querySelector("#gRows").value = "1"; document.querySelector("#gCols").value = "4"; document.querySelector("#makeGrid").click();
        document.querySelector("#runBtn").click();
      });
      await page.waitFor("__LQ_EXAM_HALL.monitoring && __LQ_EXAM_HALL.clips.armed && window.__mrW.length > 0", 6000);
      const mon = await page.evaluate(() => ({ on: __LQ_EXAM_HALL.setup.on, dis: document.querySelector("#scBtn").disabled, text: document.querySelector("#scState").textContent,
        frame: __LQ_EXAM_HALL.frame, armed: __LQ_EXAM_HALL.clips.armed, mrW: window.__mrW }));
      assert(!mon.on && mon.dis && /ตรวจการติดตั้งได้เมื่อหยุดเฝ้าดู/.test(mon.text), "setup check off while monitoring: " + JSON.stringify(mon));
      assert(mon.frame.w === 3840 && mon.armed && mon.frame.clipW === 1280 && mon.mrW.every(w => w === 1280), "clip ring records a 1280 px wide copy, not the 4K frame: " + JSON.stringify(mon));
      await page.evaluate(() => document.querySelector("#scBtn").click());
      assert(await page.evaluate(() => !__LQ_EXAM_HALL.setup.on), "cannot start during monitoring");
      await noThai(page, "exam-hall monitoring after setup check");
      await page.evaluate(() => document.querySelector("#runBtn").click());
      assert(await page.evaluate(() => !__LQ_EXAM_HALL.monitoring && !document.querySelector("#scBtn").disabled && __LQ_EXAM_HALL.frame.clipW === 3840), "available again after monitoring");
      // the other way to make the copy (a canvas, when the browser cannot scale a clone of the camera track): 1280 px as well
      const n0 = await page.evaluate(() => { window.__LQ_NO_TRACK_SCALE = true; const n = window.__mrW.length; document.querySelector("#runBtn").click(); return n; });
      await page.waitFor(`__LQ_EXAM_HALL.monitoring && __LQ_EXAM_HALL.clips.armed && window.__mrW.length > ${n0}`, 6000);
      const cv = await page.evaluate(n => ({ frame: __LQ_EXAM_HALL.frame, mrW: window.__mrW.slice(n) }), n0);
      assert(cv.frame.w === 3840 && cv.frame.clipW === 1280 && cv.mrW.every(w => w === 1280), "canvas copy is 1280 px wide: " + JSON.stringify(cv));
      await page.evaluate(() => document.querySelector("#runBtn").click());
      assert(await page.evaluate(() => !__LQ_EXAM_HALL.monitoring && !__LQ_EXAM_HALL.clips.armed && __LQ_EXAM_HALL.frame.clipW === 3840), "copy dropped when monitoring stops");
      assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
      await page.close();
    });

    await check("exam-hall camera request: 3840x2160 first, then 1920x1080, then 1280x720; the panel shows what arrived", async () => {
      const cases = [
        // [fake camera, expected obtained size, expected ideal widths asked in order]
        [{ n: 1, mode: "ok", res: { w: 3840, h: 2160 } }, [3840, 2160], [3840]],
        [{ n: 1, mode: "ok", res: { w: 1920, h: 1080 } }, [1920, 1080], [3840]], // "ideal": the browser gives the closest mode it has
        [{ n: 1, mode: "ok", res: { w: 1280, h: 720 } }, [1280, 720], [3840]],
        [{ n: 1, mode: "ok", res: { w: 3840, h: 2160 }, failAbove: 1920 }, [1920, 1080], [3840, 3840, 1920]], // cannot start at 4K -> 1080p
        [{ n: 1, mode: "ok", res: { w: 3840, h: 2160 }, failAbove: 1280 }, [1280, 720], [3840, 3840, 1920, 1920, 1280]],
        [{ n: 1, mode: "ok" }, [640, 480], [3840]] // an old 640x480 camera still opens
      ];
      for (const [cams, size, asked] of cases) {
        const page = await openHall(browser, base, fakeCams, cams);
        await startCam(page);
        const r = await page.evaluate(() => ({ frame: __LQ_EXAM_HALL.frame, req: __LQ_FAKE.requests.map(v => (v && v.width ? v.width.ideal + "x" + v.height.ideal : String(v))),
          kv: [...document.querySelectorAll("#scKv span")].map(x => x.textContent) }));
        const label = JSON.stringify(cams) + " -> " + JSON.stringify(r);
        assert(r.frame.w === size[0] && r.frame.h === size[1], "obtained size: " + label);
        const ladder = { 3840: "3840x2160", 1920: "1920x1080", 1280: "1280x720" };
        assert(r.req.join() === asked.map(w => ladder[w]).join(), "request order: " + label);
        assert(r.kv.some(t => t.includes(`${size[0]} × ${size[1]} px`)), "obtained size shown: " + label);
        assert(r.frame.overlayW === Math.min(1280, size[0]), "overlay width: " + label);
        // the same normalised face is fewer px on a smaller frame
        await page.evaluate(() => {
          window.__dets = [{ x: 0.1, y: 0.4, w: 0.1, h: 0.4, score: 0.9 }]; window.__setup = [{ x: 0.1, y: 0.2, w: 0.025, h: 0.04 }];
          document.querySelector("#scBtn").click();
        });
        await page.waitFor("__LQ_EXAM_HALL.setup.res && __LQ_EXAM_HALL.setup.res.n === 1 && __LQ_EXAM_HALL.setup.res.people === 1", 5000);
        const res = await page.evaluate(() => __LQ_EXAM_HALL.setup.res);
        assert(res.minFacePx === Math.round(0.025 * size[0]) && res.ok === (res.minFacePx >= 48), "px for this frame: " + JSON.stringify(res));
        assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
        await page.close();
      }
    });

    await check("exam-hall chosen camera (review S3): a chosen camera that cannot start at 4K is tried at 1080p / 720p before ANY other camera; " +
      "the panel says 'received less than asked' in TH / EN / ZH", async () => {
      const chosen = `try { localStorage.setItem("lq-exam-hall-cam", JSON.stringify({ deviceId: "fake-cam-2", label: "Fake Camera 2" })); } catch (e) {}`;
      const reqs = () => `__LQ_FAKE.requests.map(v => (v && v.deviceId ? v.deviceId.exact : v && v.facingMode ? "facing" : v === true ? "true" : "plain") + "@" + (v && v.width ? v.width.ideal : 0))`;
      // camera 2 is chosen and cannot start above 1920; camera 1 could give 4K. Before the fix the second request was "facing@3840" = camera 1.
      let page = await openHall(browser, base, fakeCams, { n: 2, mode: "ok", res: { w: 3840, h: 2160 }, failAbove: 1920, failAboveIds: ["fake-cam-2"] }, chosen);
      await startCam(page);
      let r = await page.evaluate(`({ req: ${reqs()}, opens: __LQ_FAKE.opens, frame: __LQ_EXAM_HALL.frame, live: __LQ_FAKE.live(),
        dev: document.querySelector("#video").srcObject.getVideoTracks()[0].getSettings().deviceId,
        less: { hidden: document.querySelector("#scLess").hidden, text: document.querySelector("#scLess").textContent, cls: document.querySelector("#scLess").className } })`);
      assert(r.req.join() === "fake-cam-2@3840,fake-cam-2@1920", "the chosen camera is asked at 4K, then at 1080p, and nothing else: " + JSON.stringify(r.req));
      assert(r.opens.length === 1 && r.opens[0].id === "fake-cam-2" && r.opens[0].w === 1920 && r.dev === "fake-cam-2"
        && r.live.join() === "fake-cam-2", "only the chosen camera was opened, at 1080p: " + JSON.stringify(r));
      assert(r.frame.w === 1920 && r.frame.h === 1080, "frame " + JSON.stringify(r.frame));
      assert(!r.less.hidden && / warn/.test(r.less.cls) && /^ได้ภาพน้อยกว่าที่ขอ: 1920 × 1080 px แทน 3840 × 2160 px/.test(r.less.text), "received less than asked (th): " + JSON.stringify(r.less));
      for (const [l, re] of [["en", /^Received less than asked: 1920 × 1080 px instead of 3840 × 2160 px/], ["zh", /^收到的画面低于所请求的：1920 × 1080 px，而不是 3840 × 2160 px/]]) {
        await page.evaluate(lang => LQI18N.setLang(lang), l);
        await page.waitFor(`LQI18N.lang === "${l}"`, 5000);
        await sleep(400);
        const t = await page.evaluate(() => document.querySelector("#scLess").textContent);
        assert(re.test(t) && !THAI.test(t), `received less than asked [${l}]: ${t}`);
        // two cameras: the camera picker (flip button + list) is shown, in this language too
        const pick = await page.evaluate(() => {
          const el = document.querySelector("#camPick");
          return { hidden: el.hidden, btn: el.children[0].textContent, aria: el.children[1].getAttribute("aria-label"),
            opts: [...el.children[1].options].map(o => o.textContent), val: el.children[1].value };
        });
        assert(!pick.hidden && pick.opts.length === 2 && pick.val === "fake-cam-2", `camera picker [${l}]: ` + JSON.stringify(pick));
        assert(l === "en" ? /^Use (front|rear) camera$/.test(pick.btn) && pick.aria === "Select camera"
          : /^使用(前置|后置)摄像头$/.test(pick.btn) && pick.aria === "选择摄像头", `camera picker text [${l}]: ` + JSON.stringify(pick));
        const c = await page.evaluate(() => LQI18N.coverage(document.body, { top: 6 }));
        assert(c.thai === 0, `chosen camera [${l}]: ${c.thai} Thai letters — ${c.top.map(x => x.path + " «" + x.text + "»").join(" | ")}`);
      }
      assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
      await page.close();
      // down to 720p on the chosen camera
      page = await openHall(browser, base, fakeCams, { n: 2, mode: "ok", res: { w: 3840, h: 2160 }, failAbove: 1280, failAboveIds: ["fake-cam-2"] }, chosen);
      await startCam(page);
      r = await page.evaluate(`({ req: ${reqs()}, opens: __LQ_FAKE.opens, frame: __LQ_EXAM_HALL.frame })`);
      assert(r.req.join() === "fake-cam-2@3840,fake-cam-2@1920,fake-cam-2@1280" && r.opens.length === 1
        && r.opens[0].id === "fake-cam-2" && r.frame.w === 1280, "chosen camera down to 720p: " + JSON.stringify(r));
      await page.close();
      // the chosen camera starts at no size: only THEN the earlier fallback (facing at 4K = another camera), as before
      page = await openHall(browser, base, fakeCams, { n: 2, mode: "ok", res: { w: 3840, h: 2160 }, failAbove: 100, failAboveIds: ["fake-cam-2"] }, chosen);
      await startCam(page);
      r = await page.evaluate(`({ req: ${reqs()}, opens: __LQ_FAKE.opens, frame: __LQ_EXAM_HALL.frame, lessHidden: document.querySelector("#scLess").hidden })`);
      assert(r.req.join() === "fake-cam-2@3840,fake-cam-2@1920,fake-cam-2@1280,facing@3840" && r.opens.length === 1
        && r.opens[0].id === "fake-cam-1" && r.frame.w === 3840, "fallback only after every size of the chosen camera: " + JSON.stringify(r));
      assert(r.lessHidden, "4K received: no 'less than asked' line");
      await page.close();
      // no camera at all: the camera error is said in the page language (Thai, English, Chinese)
      page = await openHall(browser, base, fakeCams, { n: 0, mode: "ok" });
      await page.evaluate(() => { document.querySelector("#room").value = "HALL7"; document.querySelector("#setupForm").requestSubmit(); });
      await page.waitFor("document.querySelector('#engine').classList.contains('err')", 8000);
      assert(/ไม่พบกล้องในเครื่องนี้/.test(await page.evaluate(() => document.querySelector("#engine").textContent)), "camera error (th)");
      for (const [l, re] of [["en", /No camera found on this device/], ["zh", /本设备上未找到摄像头/]]) {
        await page.evaluate(lang => LQI18N.setLang(lang), l); await page.waitFor(`LQI18N.lang === "${l}"`, 5000); await sleep(400);
        const t = await page.evaluate(() => document.querySelector("#engine").textContent);
        assert(re.test(t) && !THAI.test(t), `camera error [${l}]: ${t}`);
      }
      await page.close();
      // no chosen camera (first visit): the request order is the one of the ladder test above, and a 4K frame shows no "less" line
      page = await openHall(browser, base, fakeCams, { n: 2, mode: "ok", res: { w: 3840, h: 2160 } });
      await startCam(page);
      r = await page.evaluate(`({ req: ${reqs()}, lessHidden: document.querySelector("#scLess").hidden })`);
      assert(r.req.join() === "facing@3840" && r.lessHidden, "no chosen camera: " + JSON.stringify(r));
      await page.close();
    });

    await check("exam-hall setup check (review S1 / S2 / S4): 47.9 px reads 47 px and warns; never OK before a people count; the face limit has its own message (TH / EN / ZH)", async () => {
      // S4: the object detector fails from the start -> no people count: two wide faces are NOT a pass
      const page = await openHall(browser, base, fakeCams, { n: 1, mode: "ok", res: { w: 3840, h: 2160 } }, `window.__dets = "fail";`);
      await page.evaluate(() => { window.__dets = "fail"; });
      await startCam(page);
      await page.evaluate(() => { window.__setup = [{ x: 0.1, y: 0.2, w: 60 / 3840, h: 0.03 }, { x: 0.3, y: 0.2, w: 96 / 3840, h: 0.04 }]; document.querySelector("#scBtn").click(); });
      await page.waitFor(`__LQ_EXAM_HALL.setup.res && __LQ_EXAM_HALL.setup.res.n === 2`, 6000);
      let p = await panel(page);
      assert(p.res.people === null && p.res.ok === false && p.state === "nopeople" && / warn/.test(p.cls) && !/ ok/.test(p.cls), "no people count: not OK " + JSON.stringify(p));
      assert(/^ยังนับจำนวนคนในภาพไม่ได้ จึงยังสรุปว่าผ่านไม่ได้ — วัดใบหน้าได้ 2 ใบหน้า \(เล็กสุด 60 px\)/.test(p.text)
        && p.kv.some(t => t === "เห็นคน: ยังนับไม่ได้"), "no people count text: " + JSON.stringify(p));
      assert(await page.evaluate(() => __LQ_EXAM_HALL.setup.people === null), "page: people count unknown");
      await sleep(1600); // it stays that way: several measurements later still not OK
      p = await panel(page);
      assert(p.state === "nopeople" && !/ ok/.test(p.cls), "still not OK without a people count: " + JSON.stringify(p));
      await inLangs(page, "no people count", { en: /^The people in view are not counted yet, so this is not a pass yet — 2 faces measured \(smallest 60 px\)/,
        zh: /^尚未统计画面中的人数，因此还不能判定为通过——已测到 2 张脸（最小 60 px）/ });
      // with no face at all and no people count: the plain "no face" warning (never "0 people")
      await page.evaluate(() => { window.__setup = []; });
      await page.waitFor(`document.querySelector("#scState").dataset.state === "noface"`, 5000);
      p = await panel(page);
      assert(/ยังวัดใบหน้าไม่ได้เลย/.test(p.text) && p.kv.some(t => t === "เห็นคน: ยังนับไม่ได้") && !p.kv.some(t => /^เห็นคน \d/.test(t)), "no face, no count: " + JSON.stringify(p));
      // the detector works again: the count exists after its next finished turn, and only then the panel is OK
      p = await show(page, [PERSON(0), PERSON(1)], [face(0, 60, 3840), face(1, 96, 3840)], "ok");
      assert(/ ok/.test(p.cls) && p.res.people === 2 && p.kv.some(t => t === "เห็นคน 2"), "OK once the count exists: " + JSON.stringify(p));
      // and it fails again: OK is withdrawn (a stale count is dropped at once on a failing turn)
      await page.evaluate(() => { window.__dets = "fail"; });
      await page.waitFor(`document.querySelector("#scState").dataset.state === "nopeople"`, 6000);
      assert(await page.evaluate(() => !/ ok/.test(document.querySelector("#scState").className) && __LQ_EXAM_HALL.setup.res.people === null), "OK withdrawn when the count is lost");

      // S1: 47.4 / 47.5 / 47.9 px read 47 px and warn; 48.0 / 48.1 read 48 px and pass
      for (const [px, shown, state] of [[47.4, 47, "small"], [47.5, 47, "small"], [47.9, 47, "small"], [48.0, 48, "ok"], [48.1, 48, "ok"]]) {
        p = await show(page, [PERSON(0), PERSON(1)], [face(0, px, 3840), face(1, 96, 3840)], state);
        await page.waitFor(`__LQ_EXAM_HALL.setup.res.minFacePx === ${shown}`, 4000);
        p = await panel(page);
        assert(p.state === state && p.res.minFacePx === shown && p.kv.some(t => t === `ใบหน้าเล็กสุด ${shown} px`), `${px} px -> ${shown} px, ${state}: ` + JSON.stringify(p));
        assert(state === "ok" ? / ok/.test(p.cls) : / err/.test(p.cls) && /เล็กสุด 47 px/.test(p.text)
          && /^47 ⚠ · 96$/.test(p.list.replace(/^.*: /, "")), `${px} px style / text: ` + JSON.stringify(p));
        assert(!(state === "small" && /48 px\)/.test(p.text.replace(/น้อยกว่า 48 px/, ""))), `${px} px never shown as 48 px: ` + p.text);
      }

      // S2: more faces in view than the engine returns: the limit is named, distance is not blamed
      const cap = await page.evaluate(() => __LQ_EXAM_HALL.setup.cap);
      assert(cap === 16, "face limit of the setup check: " + cap);
      const many = n => Array.from({ length: n }, (_, i) => ({ x: 0.02 + 0.045 * i, y: 0.2, w: 60 / 3840, h: 0.03 }));
      const crowd = n => Array.from({ length: n }, (_, i) => ({ x: 0.02 + 0.045 * i, y: 0.4, w: 0.04, h: 0.3, score: 0.9 }));
      await page.evaluate((pp, ff) => { window.__dets = pp; window.__setup = ff; }, crowd(20), many(20));
      await page.waitFor(`document.querySelector("#scState").dataset.state === "cap" && __LQ_EXAM_HALL.setup.res.people === 20`, 6000);
      p = await panel(page);
      assert(p.res.n === cap && p.res.atCap && p.res.ok === false && / warn/.test(p.cls) && !/ ok/.test(p.cls), "at the limit: " + JSON.stringify(p.res));
      assert(p.text === "ตัววัดวัดได้สูงสุดครั้งละ 16 ใบหน้า: เห็นคน 20 คน วัดได้ 16 ใบหน้า — ให้ตรวจแถวไกลสุดโดยให้มีคนในภาพไม่เกิน 16 คน"
        && !/เล็กหรืออยู่ไกล/.test(p.text), "limit text: " + p.text);
      await inLangs(page, "face limit", {
        en: /^The check measures at most 16 faces at a time: 20 people seen, 16 faces measured — check the farthest rows with up to 16 people in view$/,
        zh: /^一次最多测量 16 张脸：看到 20 人，测到 16 张脸——请在画面中不超过 16 人的情况下检查最远的几排$/
      });
      // a small face AND the limit: the small-face warning plus the limit sentence (not "too small or too far")
      await page.evaluate((pp, ff) => { window.__dets = pp; window.__setup = ff; }, crowd(20), [{ x: 0.9, y: 0.6, w: 40 / 3840, h: 0.02 }].concat(many(19)));
      await page.waitFor(`document.querySelector("#scState").dataset.state === "small"`, 6000);
      p = await panel(page);
      assert(/เล็กสุด 40 px/.test(p.text) && /ตัววัดวัดได้สูงสุดครั้งละ 16 ใบหน้า/.test(p.text) && !/คนที่เหลืออาจเล็กหรืออยู่ไกลเกินไป/.test(p.text), "small + limit: " + p.text);
      // under the limit with more people: the old message; exactly at the limit with as many people: OK
      await page.evaluate((pp, ff) => { window.__dets = pp; window.__setup = ff; }, crowd(20), many(15));
      await page.waitFor(`document.querySelector("#scState").dataset.state === "people" && __LQ_EXAM_HALL.setup.res.n === 15`, 6000);
      p = await panel(page);
      assert(/^เห็นคน 20 คน วัดใบหน้าได้ 15 ใบหน้า — คนที่เหลืออาจเล็กหรืออยู่ไกลเกินไป$/.test(p.text), "under the limit: " + p.text);
      await page.evaluate((pp, ff) => { window.__dets = pp; window.__setup = ff; }, crowd(16), many(16));
      await page.waitFor(`document.querySelector("#scState").dataset.state === "ok" && __LQ_EXAM_HALL.setup.res.n === 16`, 6000);
      // the lead text names the limit in the three languages
      const lead = async () => page.evaluate(() => document.querySelector('[data-i18n="exam.hall.scLead"]').textContent.replace(/\s+/g, " "));
      assert(/วัดได้สูงสุดครั้งละ 16 ใบหน้า/.test(await lead()), "lead th: " + await lead());
      for (const [l, re] of [["en", /measures at most 16 faces at a time/], ["zh", /一次最多测量 16 张脸/]]) {
        await page.evaluate(lang => LQI18N.setLang(lang), l); await page.waitFor(`LQI18N.lang === "${l}"`, 5000); await sleep(300);
        assert(re.test(await lead()), `lead ${l}: ` + await lead());
      }
      await page.evaluate(() => LQI18N.setLang("th")); await page.waitFor(`LQI18N.lang === "th"`, 5000);
      await phoneAudit(page, "exam-hall setup check at the face limit");
      assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
      await page.close();
    });

    await check("exam-hall evidence clip on a 4K camera with no way to make a 1280 px copy: NO clip (never the 4K stream), " +
      "said in TH / EN / ZH; seat shape warning when the frame shape changes", async () => {
      const page = await openHall(browser, base, fakeCams, { n: 1, mode: "ok", res: { w: 3840, h: 2160 } });
      await startCam(page);
      await page.evaluate(() => {
        const c = document.querySelector("#clipOn"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true }));
        document.querySelector("#clipBox").open = true;
        const f = document.querySelector("#clipList form"); f.querySelector("[data-cpin]").value = "482913";
        const c2 = f.querySelector("[data-cpin2]"); if (c2) c2.value = "482913";
        f.requestSubmit();
      });
      await page.waitFor("__LQ_EXAM_HALL.clips.unlocked && __LQ_EXAM_HALL.clips.pin.has()", 8000);
      assert(await page.evaluate(() => document.querySelector("#clipOff").hidden && document.querySelector("#seatAr").hidden), "no warning before monitoring");
      await page.evaluate(() => {
        window.__LQ_NO_TRACK_SCALE = true; window.__LQ_NO_CANVAS_STREAM = true;
        document.querySelector("#gRows").value = "1"; document.querySelector("#gCols").value = "4"; document.querySelector("#makeGrid").click();
        document.querySelector("#runBtn").click();
      });
      await page.waitFor("__LQ_EXAM_HALL.monitoring && __LQ_EXAM_HALL.frame.clipOff", 6000);
      await sleep(2600); // longer than a ring segment: still no recorder
      let r = await page.evaluate(() => ({ mrW: window.__mrW, armed: __LQ_EXAM_HALL.clips.armed, frame: __LQ_EXAM_HALL.frame, mon: __LQ_EXAM_HALL.monitoring,
        off: { hidden: document.querySelector("#clipOff").hidden, text: document.querySelector("#clipOff").textContent, cls: document.querySelector("#clipOff").className } }));
      assert(r.mon && r.mrW.length === 0 && !r.armed && r.frame.w === 3840 && r.frame.clipW === 0, "no recorder was created on the 4K stream: " + JSON.stringify(r));
      assert(!r.off.hidden && / warn/.test(r.off.cls)
        && /^เครื่องนี้ทำสำเนาภาพจากกล้องที่กว้างไม่เกิน 1280 px ไม่ได้ จึงไม่บันทึกคลิปหลักฐานในการเฝ้าดูรอบนี้/.test(r.off.text), "no-clip message (th): " + JSON.stringify(r.off));
      // a Watch / Check flag while clips are off: an event, no clip state, no recorder
      await page.evaluate(() => { window.__dets = []; });
      for (const [l, re] of [["en", /^This device cannot make a copy of the camera picture at most 1280 px wide, so no evidence clip is recorded/],
        ["zh", /^本设备无法生成宽度不超过 1280 px 的摄像头画面副本，因此本次监看不录制证据片段/]]) {
        await page.evaluate(lang => LQI18N.setLang(lang), l); await page.waitFor(`LQI18N.lang === "${l}"`, 5000); await sleep(400);
        const t = await page.evaluate(() => document.querySelector("#clipOff").textContent);
        assert(re.test(t) && !THAI.test(t), `no-clip message [${l}]: ${t}`);
      }
      await noThai(page, "exam-hall monitoring with clips off (no 1280 px copy)");
      await phoneAudit(page, "exam-hall no-clip message");
      await page.evaluate(() => document.querySelector("#runBtn").click());
      r = await page.evaluate(() => ({ mon: __LQ_EXAM_HALL.monitoring, hidden: document.querySelector("#clipOff").hidden, mrW: window.__mrW, clipOff: __LQ_EXAM_HALL.frame.clipOff }));
      assert(!r.mon && r.hidden && !r.clipOff && r.mrW.length === 0, "message cleared when monitoring stops; still no recorder: " + JSON.stringify(r));
      // the canvas way is back: the clip is recorded again, 1280 px wide
      await page.evaluate(() => { window.__LQ_NO_CANVAS_STREAM = false; document.querySelector("#runBtn").click(); });
      await page.waitFor("__LQ_EXAM_HALL.monitoring && __LQ_EXAM_HALL.clips.armed && window.__mrW.length > 0", 6000);
      r = await page.evaluate(() => ({ mrW: window.__mrW, frame: __LQ_EXAM_HALL.frame, hidden: document.querySelector("#clipOff").hidden }));
      assert(r.mrW.every(w => w === 1280) && r.frame.clipW === 1280 && r.hidden, "canvas copy (painted per camera frame) is 1280 px wide: " + JSON.stringify(r));
      await sleep(2500); // the copy keeps getting frames: a second ring segment starts on it
      assert(await page.evaluate(() => window.__mrW.length >= 2 && window.__mrW.every(w => w === 1280)), "second segment on the 1280 px copy");
      await page.evaluate(() => document.querySelector("#runBtn").click());

      // seat shape: the seats above were saved on a 16:9 frame; the same camera now delivers 4:3
      const ar0 = await page.evaluate(() => JSON.parse(localStorage.getItem("lq-exam-seats-ar")));
      assert(Object.keys(ar0).length === 1 && Math.abs(ar0["HALL7|fake-cam-1"] - 1.778) < 0.001, "frame shape stored with the seats: " + JSON.stringify(ar0));
      await page.evaluate(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok", res: { w: 1280, h: 960 } }; document.querySelector("#setupForm").requestSubmit(); });
      await page.waitFor("__LQ_EXAM_HALL.frame.w === 1280 && __LQ_EXAM_HALL.frame.h === 960 && !document.querySelector('#seatAr').hidden", 10000);
      let w = await page.evaluate(() => ({ text: document.querySelector("#seatAr").textContent, cls: document.querySelector("#seatAr").className, seats: __LQ_EXAM_HALL.seats.length }));
      assert(w.seats === 4 && / warn/.test(w.cls) && /^สัดส่วนภาพจากกล้องต่างจากตอนบันทึกที่นั่ง \(ตอนนั้น 1\.78:1 ตอนนี้ 1\.33:1\)/.test(w.text), "seat shape warning (th): " + JSON.stringify(w));
      for (const [l, re] of [["en", /^The camera picture has a different shape than when these seats were saved \(then 1\.78:1, now 1\.33:1\)/],
        ["zh", /^摄像头画面的宽高比与保存这些座位时不同（当时 1\.78:1，现在 1\.33:1）/]]) {
        await page.evaluate(lang => LQI18N.setLang(lang), l); await page.waitFor(`LQI18N.lang === "${l}"`, 5000); await sleep(400);
        const t = await page.evaluate(() => document.querySelector("#seatAr").textContent);
        assert(re.test(t) && !THAI.test(t), `seat shape warning [${l}]: ${t}`);
        const c = await page.evaluate(() => LQI18N.coverage(document.body, { top: 6 }));
        assert(c.thai === 0, `seat shape [${l}]: ${c.thai} Thai letters — ${c.top.map(x => x.path + " «" + x.text + "»").join(" | ")}`);
      }
      await page.evaluate(() => LQI18N.setLang("th")); await page.waitFor(`LQI18N.lang === "th"`, 5000);
      await phoneAudit(page, "exam-hall seat shape warning");
      // saving the seats on this frame stores the new shape and clears the warning; deleting them removes the number
      await page.evaluate(() => document.querySelector("#makeGrid").click());
      w = await page.evaluate(() => ({ hidden: document.querySelector("#seatAr").hidden, ar: JSON.parse(localStorage.getItem("lq-exam-seats-ar")) }));
      assert(w.hidden && Math.abs(w.ar["HALL7|fake-cam-1"] - 1.333) < 0.001, "saved again on the 4:3 frame: " + JSON.stringify(w));
      const stored = await page.evaluate(() => localStorage.getItem("lq-exam-seats-ar"));
      assert(/^\{"HALL7\|fake-cam-1":1\.333\}$/.test(stored), "one number per room + camera, nothing else: " + stored);
      await privacyScan(page);
      assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
      await page.close();
    });

    await check("exam-hall with the browser's own camera (no camera shim): the size received is shown, and the clip ring never records wider than 1280 px", async () => {
      // Chrome's built-in fake capture device through the real getUserMedia / MediaRecorder; detections stay scripted (?fakedet)
      const page = await browser.newPage(null, { initScripts: [init({})], isolated: true });
      await page.goto(`${base}/exam-hall.html?cpu&fakedet`);
      await page.waitFor("window.__LQ_EXAM_HALL && window.LQI18N", 8000);
      await startCam(page);
      const got = await page.evaluate(() => {
        const v = document.querySelector("#video"), st = v.srcObject.getVideoTracks()[0].getSettings();
        return { frame: __LQ_EXAM_HALL.frame, vw: v.videoWidth, vh: v.videoHeight, sw: st.width, sh: st.height, kv: [...document.querySelectorAll("#scKv span")].map(x => x.textContent) };
      });
      console.log(`       real getUserMedia in this headless Chrome delivered ${got.vw} x ${got.vh} (asked for up to 3840 x 2160)`);
      assert(got.vw >= 640 && got.frame.w === got.vw && got.sw === got.vw, "frame size read from the video: " + JSON.stringify(got));
      assert(got.kv.some(t => t.includes(`${got.vw} × ${got.vh} px`)), "size received is shown: " + JSON.stringify(got));
      assert(got.frame.overlayW === Math.min(1280, got.vw), "overlay width " + JSON.stringify(got.frame));
      await page.evaluate(() => {
        const c = document.querySelector("#clipOn"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true }));
        document.querySelector("#clipBox").open = true;
        const f = document.querySelector("#clipList form"); f.querySelector("[data-cpin]").value = "482913";
        const c2 = f.querySelector("[data-cpin2]"); if (c2) c2.value = "482913";
        f.requestSubmit();
      });
      await page.waitFor("__LQ_EXAM_HALL.clips.unlocked && __LQ_EXAM_HALL.clips.pin.has()", 8000);
      await page.evaluate(() => { document.querySelector("#makeGrid").click(); document.querySelector("#runBtn").click(); });
      await page.waitFor("__LQ_EXAM_HALL.monitoring && __LQ_EXAM_HALL.clips.armed && window.__mrW.length > 0", 8000);
      await sleep(2500); // a second ring segment starts on the same copy
      const rec = await page.evaluate(() => ({ frame: __LQ_EXAM_HALL.frame, mrW: window.__mrW, vw: document.querySelector("#video").videoWidth }));
      assert(rec.mrW.length >= 2 && rec.mrW.every(w => w > 0 && w <= 1280), "every recorder got a frame at most 1280 px wide: " + JSON.stringify(rec));
      assert(rec.vw === got.vw && rec.frame.w === got.vw, "the camera itself keeps its size while the clip copy is smaller: " + JSON.stringify(rec));
      await page.evaluate(() => document.querySelector("#runBtn").click());
      assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
      await page.close();
    });
  } finally { await browser.close(); }
}
