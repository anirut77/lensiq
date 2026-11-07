// tests/e2e/fortune-new.e2e.mjs — smoke test for the new fortune pages (iching, zodiac, astro, dream) and the fortune hub.
// Each page: a full reading renders (fortune-ai.js local composer), share card canvas builds, stats key is written,
// no console errors (the optional /api/fortune/status probe 404 is ignored), no horizontal overflow at 390 and 1280 px.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function noOverflow(page, w) {
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: w < 600 ? 844 : 900, deviceScaleFactor: w < 600 ? 2 : 1, mobile: w < 600 });
  await sleep(350);
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, w: innerWidth }));
  await page.send("Emulation.clearDeviceMetricsOverride");
  assert(r.sw <= r.w && r.bw <= r.w, `no horizontal overflow at ${w}px (scrollWidth ${r.sw}/${r.bw} > ${r.w})`);
}
function noErrors(page, base) {
  const errs = page.consoleErrors.filter(e => !/favicon|\/api\//.test((e.url || "") + " " + (e.text || "")));
  assert(!errs.length, "console errors: " + errs.map(e => `${e.kind}: ${(e.text || "").slice(0, 160)} ${(e.url || "").replace(base, "")}`).join(" || "));
}
const readingOK = id => `(() => { const b = document.getElementById(${JSON.stringify(id + "-body")}); return !!b && b.querySelectorAll(".fa-section").length >= 3 && b.textContent.length > 300; })()`;
const cardOK = `FortuneKit.makeCard({ kind: "test", title: "ทดสอบ", sub: "sub", msgs: ["หนึ่ง", "สอง", "สาม"], art: (c, x, y, w, h) => { c.fillStyle = "#fff"; c.fillRect(x, y, w, 10); } }).then(cv => cv.width === 1080 && cv.height === 1350)`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    let page = await browser.newPage(null);

    await check("hub: fortune.html lists 14 fortune cards and the goal guide", async () => {
      await page.goto(`${base}/fortune.html`);
      const r = await page.evaluate(() => ({ cards: [...document.querySelectorAll(".ft-card")].map(a => a.getAttribute("href")), goals: document.querySelectorAll(".ft-goal").length }));
      for (const h of ["iching.html", "zodiac.html", "astro.html", "dream.html", "bazi.html", "taksa.html", "lek7.html", "lifegraph.html"]) assert(r.cards.includes(h), "card " + h);
      assert(r.cards.length === 14 && r.goals === 4, JSON.stringify(r));
      await noOverflow(page, 390); await noOverflow(page, 1280); noErrors(page, base);
    });
    await page.close();

    page = await browser.newPage(null);
    await check("iching: coin toss → hexagram → reading, daily + 64 grid, stats", async () => {
      await page.goto(`${base}/iching.html`);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.evaluate(() => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); });
      await page.waitFor(() => !document.getElementById("icResult").hidden, 15000);
      await page.waitFor(readingOK("icRd"), 8000);
      const r = await page.evaluate(() => ({ cards: document.querySelectorAll(".ic-hexcard").length, cast: window.__ic.state.cast, st: JSON.parse(localStorage.getItem("ic-stats")) }));
      assert(r.cast && r.cast.values.length === 6 && r.cards >= 1, "cast rendered");
      assert((r.cast.relating ? 2 : 1) === r.cards, "relating card shown iff changing lines");
      assert(r.st && r.st.total === 1 && r.st.hex[r.cast.primary] === 1, "ic-stats written");
      await page.evaluate(() => document.querySelector('#icRd .rd-topics [data-topic="money"]').click());
      await page.waitFor(`document.querySelector('#icRd-body [data-section="money"]') !== null`, 5000);
      assert(await page.evaluate(cardOK), "share card canvas 1080x1350");
      await page.evaluate(() => document.getElementById("tabDaily").click());
      await page.waitFor(readingOK("icDayRd"), 8000);
      await page.evaluate(() => document.getElementById("tabAll").click());
      assert(await page.evaluate(() => document.querySelectorAll(".ic-cell").length) === 64, "64 cells");
      await page.evaluate(() => document.querySelector('.ic-cell[data-n="11"]').click());
      assert(await page.evaluate(() => !document.getElementById("icDetail").hidden), "detail opens");
      await noOverflow(page, 390); await noOverflow(page, 1280); noErrors(page, base);
    });
    await page.close();

    page = await browser.newPage(null);
    await check("zodiac: animal year reading, birth-date path, ปีชง table, pair", async () => {
      await page.goto(`${base}/zodiac.html`);
      await page.evaluate(() => localStorage.clear());
      await page.evaluate(() => { document.querySelector('input[name="zdAnimal"][value="0"]').click(); document.querySelector("#zdForm button[type=submit]").click(); });
      await page.waitFor(readingOK("zdRd"), 8000);
      const badge = await page.evaluate(() => document.querySelector(".zd-badge").textContent);
      assert(badge.length > 3, "badge " + badge);
      // birth date path: 16 ก.พ. 2569 → ปีมะเส็ง (ก่อนตรุษจีน 17 ก.พ.)
      await page.evaluate(() => {
        document.getElementById("zdAgain").click();
        document.querySelector(".zd-birth").open = true;
        document.getElementById("zdDay").value = "16"; document.getElementById("zdMonth").value = "2"; document.getElementById("zdBirthYear").value = "2569";
        document.querySelector("#zdForm button[type=submit]").click();
      });
      await page.waitFor(() => window.__zd.state.res && window.__zd.state.res.animal === 5, 5000);
      const tbl = await page.evaluate(() => { document.getElementById("tabChong").click(); return document.querySelectorAll("#zdChongGrid li").length; });
      assert(tbl === 12, "12 animals in chong table, got " + tbl);
      await page.evaluate(() => { document.getElementById("tabPair").click(); document.querySelector('input[name="zdA"][value="0"]').click(); document.querySelector('input[name="zdB"][value="1"]').click(); document.querySelector("#zdPairForm button[type=submit]").click(); });
      await page.waitFor(readingOK("zdPairRd"), 8000);
      const st = await page.evaluate(() => JSON.parse(localStorage.getItem("zd-stats")));
      assert(st && st.total >= 3 && st.animal, "zd-stats written");
      await noOverflow(page, 390); await noOverflow(page, 1280); noErrors(page, base);
    });
    await page.close();

    page = await browser.newPage(null);
    await check("astro: big three chart with ascendant, daily moon reading, 12 signs quick mode", async () => {
      await page.goto(`${base}/astro.html`);
      await page.evaluate(() => localStorage.clear());
      await page.evaluate(() => {
        document.getElementById("asDay").value = "15"; document.getElementById("asMonth").value = "5"; document.getElementById("asYear").value = "2533";
        document.getElementById("asTime").value = "08:30";
        document.querySelector("#asForm button[type=submit]").click();
      });
      await page.waitFor(readingOK("asRd"), 8000);
      await page.waitFor(readingOK("asDayRd"), 8000);
      const r = await page.evaluate(() => ({ c: window.__as.state.chart, wheel: !!document.querySelector(".as-wheel"), bigs: document.querySelectorAll(".as-big").length }));
      assert(r.c.sun.sign === 1 && r.c.asc && r.c.asc.sign === 3 && r.wheel && r.bigs === 3, JSON.stringify({ sun: r.c.sun, asc: r.c.asc }));
      await page.evaluate(() => { document.getElementById("tabSigns").click(); document.querySelector('.as-sign[data-i="4"]').click(); });
      await page.waitFor(readingOK("asSignDayRd"), 8000);
      const st = await page.evaluate(() => JSON.parse(localStorage.getItem("as-stats")));
      assert(st && st.total === 2 && st.sun["1"] === 1, "as-stats written");
      await noOverflow(page, 390); await noOverflow(page, 1280); noErrors(page, base);
    });
    await page.close();

    page = await browser.newPage(null);
    await check("dream: text → symbols → reading, no text stored", async () => {
      await page.goto(`${base}/dream.html`);
      await page.evaluate(() => localStorage.clear());
      await page.evaluate(() => { const t = document.getElementById("drText"); t.value = "ฝันว่างูตัวใหญ่ไล่ตาม แล้วฟันหลุด"; t.dispatchEvent(new Event("input")); });
      await page.waitFor(() => document.querySelectorAll("#drSel .dr-x").length === 3, 3000);
      await page.evaluate(() => document.querySelector('.dr-pop[data-id="gold"]').click());
      await page.evaluate(() => { document.querySelector('input[name="drMood"][value="happy"]').click(); document.querySelector('input[name="drTime"][value="dawn"]').click(); document.getElementById("drGo").click(); });
      await page.waitFor(readingOK("drRd"), 8000);
      const r = await page.evaluate(() => ({ cards: document.querySelectorAll(".dr-card").length, ls: JSON.stringify(Object.assign({}, localStorage)), st: JSON.parse(localStorage.getItem("dm-stats")) }));
      assert(r.cards === 4, "4 symbol cards, got " + r.cards);
      assert(!/ฝันว่า|ไล่ตาม/.test(r.ls), "dream text is not stored");
      assert(r.st && r.st.total === 1 && r.st.sym.snake === 1 && r.st.sym.gold === 1, "dm-stats written");
      await noOverflow(page, 390); await noOverflow(page, 1280); noErrors(page, base);
    });
    await page.close();
  } finally { await browser.close(); }
}
