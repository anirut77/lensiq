// tests/e2e/exam-hall-placement.e2e.mjs — the camera placement check on exam-hall.html (stream H, 2026-11-13): from the live
// frame's person boxes (scripted with ?fakedet) and the drawn seats it shows how many seats show a person, the smallest
// seated person in px of the 1,280 x 720 frame, the active detector's measured minimum and its measured recall (public
// dataset), and tells the invigilator whether the placement is good, in Thai / English / Chinese. States: idle, nocam,
// noseats, nocount, partial, fix (small / hidden / edge), good, mon. Nothing stored, nothing sent; off during monitoring.
// Locked before the product code (hashes in ~/LENSIQ-field/evals/gate-hall-h/locked.sha256).
import { assert, privacyScan } from "./cdp.mjs";
import { assertCleanMessages, exceptions, phoneAudit, sleep } from "./exam-kit.mjs";

const init = `window.__LQ_FAKE_CAMS = window.__LQ_FAKE_CAMS || null; window.__dets = [];
  try { localStorage.setItem("lq-lang", "th"); } catch (e) {}
  window.__LQ_FAKE_DET = key => key === "exam-hall" ? window.__dets : key === "exam-hall-setup" ? [] : key === "exam-hall-faces" ? [] : null;`;
const THAI = /[฀-๿]/;
// the page's grid: gridSeats({x: 0.04, y: 0.3, w: 0.92, h: 0.66}, 2, 3) -> seats 1-3 back row (y 0.30-0.63), 4-6 front (0.63-0.96)
const cx = j => 0.04 + (0.92 / 3) * (j + 0.5);
const back = h => [0, 1, 2].map(j => ({ x: cx(j) - 0.06, y: 0.6 - h, w: 0.12, h, score: 0.9 }));
const front = h => [0, 1, 2].map(j => ({ x: cx(j) - 0.06, y: 0.95 - h, w: 0.12, h, score: 0.9 }));

async function openHall(browser, base, fakeCams) {
  const page = await browser.newPage(null, { initScripts: [fakeCams, `window.__LQ_FAKE_CAMS = ${JSON.stringify({ n: 1, mode: "ok", res: { w: 1280, h: 720 } })};`, init], isolated: true });
  await page.goto(`${base}/exam-hall.html?cpu&fakedet`);
  await page.waitFor("window.__LQ_EXAM_HALL && window.LQI18N", 8000);
  return page;
}
const panel = page => page.evaluate(() => {
  const s = document.querySelector("#pcState");
  return { state: s.dataset.state, cls: s.className, text: s.textContent, kv: [...document.querySelectorAll("#pcKv span")].map(x => x.textContent),
    list: document.querySelector("#pcList").hidden ? "" : document.querySelector("#pcList").textContent, res: __LQ_EXAM_HALL.placement.res,
    btn: document.querySelector("#pcBtn").textContent, pressed: document.querySelector("#pcBtn").getAttribute("aria-pressed") };
});
async function show(page, dets, state) {
  await page.evaluate(d => { window.__dets = d; }, dets);
  await page.waitFor(`document.querySelector("#pcState").dataset.state === "${state}" && __LQ_EXAM_HALL.placement.res && ` +
    `__LQ_EXAM_HALL.placement.people === ${dets.length}`, 6000);
  return panel(page);
}
async function inLangs(page, label, want) {
  for (const l of ["en", "zh"]) {
    await page.evaluate(lang => LQI18N.setLang(lang), l);
    await page.waitFor(`LQI18N.lang === "${l}"`, 5000);
    await sleep(500);
    const p = await panel(page);
    const shown = [p.text, p.list, p.btn].concat(p.kv).join(" | ");
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
    await check("exam-hall placement check: seats seen, person size vs the detector's measured minimum, verdict in TH / EN / ZH, nothing stored or sent", async () => {
      const page = await openHall(browser, base, fakeCams);
      let p = await panel(page);
      assert(p.state === "idle" && /ยังไม่ได้ตรวจตำแหน่งกล้อง/.test(p.text) && p.pressed === "false", "idle: " + JSON.stringify(p));
      await page.evaluate(() => document.querySelector("#pcBtn").click());
      p = await panel(page);
      assert(p.state === "nocam" && / warn/.test(p.cls) && /เปิดกล้องก่อน/.test(p.text), "no camera: " + JSON.stringify(p));

      await page.evaluate(() => { document.querySelector("#room").value = "HALL8"; document.querySelector("#setupForm").requestSubmit(); });
      await page.waitFor("document.querySelector('#engine').classList.contains('ok') && __LQ_EXAM_HALL.frame.w === 1280", 10000);
      await page.waitFor(`document.querySelector("#pcState").dataset.state === "noseats"`, 5000);
      p = await panel(page);
      assert(/ warn/.test(p.cls) && /วาดหรือสร้างที่นั่งก่อน/.test(p.text), "no seats: " + JSON.stringify(p));
      await inLangs(page, "no seats", { en: /^Draw or generate the seats first/, zh: /^请先绘制或生成座位/ });

      const lsBefore = await page.evaluate(() => {
        document.querySelector("#gRows").value = "2"; document.querySelector("#gCols").value = "3"; document.querySelector("#makeGrid").click();
        return JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]));
      });
      const sentBefore = await page.evaluate(() => __LQ_EXAM_HALL.sent.length);

      // only the front row seen: partial, the unseen seats named
      p = await show(page, front(0.5), "partial");
      assert(/ warn/.test(p.cls) && !/ ok/.test(p.cls) && /ยังไม่เห็นคนที่ที่นั่ง 1, 2, 3/.test(p.text), "partial: " + JSON.stringify(p));
      assert(p.kv.some(t => t === "ที่นั่ง 6") && p.kv.some(t => t === "เห็นคน 3 จาก 6 ที่นั่ง"), "partial readout: " + p.kv);
      await inLangs(page, "partial", { en: /^Nobody seen yet at seat\(s\) 1, 2, 3/, zh: /^座位 1, 2, 3 还没有看到人/ });

      // back row 0.3 x 720 = 216 px: under COCO-SSD's measured minimum (288 px) -> fix, with the measured recall and the tiles hint
      p = await show(page, back(0.3).concat(front(0.5)), "fix");
      assert(/ err/.test(p.cls) && /ที่นั่ง 1, 2, 3: คนในภาพสูง 216 px ต่ำกว่าขั้นต่ำ 288 px/.test(p.text), "small: " + p.text);
      assert(/46\.2%/.test(p.text) && /n = 247/.test(p.text) && /ชุดข้อมูลสาธารณะ/.test(p.text), "measured recall with n and source: " + p.text);
      assert(/แบ่งภาพ 2×2/.test(p.text), "tiles hint (lower measured minimum): " + p.text);
      assert(p.kv.some(t => t === "คนเล็กสุด 216 px (ที่นั่ง 1)") && p.kv.some(t => t === "ขั้นต่ำของตัวตรวจ 288 px"), "small readout: " + p.kv);
      assert(/1: 216 px ⚠/.test(p.list) && /4: 360 px/.test(p.list), "per-seat list: " + p.list);
      await inLangs(page, "small", { en: /^Seat\(s\) 1, 2, 3: people are 216 px tall, under the minimum of 288 px/, zh: /^座位 1, 2, 3：画面中的人高 216 px，低于最低要求 288 px/ });

      // the same people with 2 x 2 tiles on: the measured minimum is 144 px -> good, and it still says it is not a guarantee
      await page.evaluate(() => { const t = document.querySelector("#tiles"); t.checked = true; t.dispatchEvent(new Event("change", { bubbles: true })); });
      p = await show(page, back(0.3).concat(front(0.5)), "good");
      assert(/ ok/.test(p.cls) && /ตำแหน่งกล้องผ่าน: เห็นคนครบ 6 ที่นั่ง/.test(p.text) && /56\.3%/.test(p.text) && /ไม่ได้รับประกัน/.test(p.text), "good: " + p.text);
      await inLangs(page, "good", { en: /^Camera placement passes: a person is seen at all 6 seats.*not a guarantee/, zh: /^摄像头位置合格：6 个座位都看到了人.*并不保证/ });

      // front-row people covering most of the back-row seats: hidden -> fix (raise the camera)
      const tall = [0, 1, 2].map(j => ({ x: cx(j) - 0.14, y: 0.33, w: 0.28, h: 0.62, score: 0.9 }));
      p = await show(page, back(0.3).concat(tall), "fix");
      assert(/ที่นั่ง 1, 2, 3: ถูกคนแถวหน้าบังเกินครึ่ง/.test(p.text) && /ยกกล้องให้สูงขึ้น/.test(p.text), "hidden: " + p.text);
      await inLangs(page, "hidden", { en: /Seat\(s\) 1, 2, 3: more than half hidden by the row in front/, zh: /座位 1, 2, 3：一半以上被前排挡住/ });
      await phoneAudit(page, "exam-hall placement check");

      // nothing stored, nothing sent
      await sleep(800);
      const after = await page.evaluate(() => ({ ls: JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])), sent: __LQ_EXAM_HALL.sent, recent: __LQ_EXAM_HALL.recent.length }));
      const strip = s => s.replace(/\["lq-exam-hall","[^\]]*"\]/, ""); // the node settings (tiles is not one of them; seats are saved by the grid)
      assert(strip(after.ls) === strip(lsBefore), "the placement check stores nothing: " + after.ls.slice(0, 300));
      assert(after.sent.length === sentBefore && after.recent === 0, "the placement check sends no event");
      assertCleanMessages(after.sent, "hall placement");
      await privacyScan(page);

      // monitoring: the check stops and cannot be started
      await page.evaluate(() => document.querySelector("#runBtn").click());
      await page.waitFor("__LQ_EXAM_HALL.monitoring", 4000);
      p = await panel(page);
      assert(p.state === "mon" && !__placementOn(p) && /ตรวจตำแหน่งกล้องได้เมื่อหยุดเฝ้าดู/.test(p.text), "off while monitoring: " + JSON.stringify(p));
      assert(await page.evaluate(() => document.querySelector("#pcBtn").disabled), "button disabled while monitoring");
      await page.evaluate(() => document.querySelector("#runBtn").click());
      assert(await page.evaluate(() => !__LQ_EXAM_HALL.monitoring && !document.querySelector("#pcBtn").disabled), "available again after monitoring");
      assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
      await page.close();
    });
  } finally { await browser.close(); }
}
function __placementOn(p) { return p.pressed === "true"; }
