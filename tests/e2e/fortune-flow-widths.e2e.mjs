// tests/e2e/fortune-flow-widths.e2e.mjs — acceptance P4 of docs/acceptance/README.md for the fortune pages: the product's main
// flow (not only the landing) in Chrome at 360 px and at 430 px. Each page opens AT that width (mobile emulation, touch, Thai
// default, fresh storage) and runs its main flow to a reading. One check per page × width. Asserted:
//   * before the flow: no horizontal page overflow; the main action control lies within 0..innerWidth
//   * after the flow: the reading is visible (.fa-section / .rp-sec / the page's own result), no horizontal page overflow,
//     the first reading section lies within 0..innerWidth, and no element is left with aria-busy="true"
// Flows are copied from tests/e2e/fortune-zh.e2e.mjs (fake camera + scripted detector for palm; no photo of a person).
// tarot also draws a Siam Si; luckycolor (camera optional) picks a goal and a day; the hub opens a card and must navigate.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const WIDTHS = [[360, 640], [430, 932]];
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };
const thInit = `try { localStorage.setItem("lq-lang", "th"); } catch (e) {}`;
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = [];
  window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const ev = (page, fn, ...a) => page.evaluate(fn, ...a);
const sections = n => `document.querySelectorAll(".fa-section, .fs-sec").length >= ${n} && ` +
  `![...document.querySelectorAll(".fa-section, .fs-sec")].some(s => /กำลังเรียบเรียง/.test(s.textContent))`;
const setSel = (id, v) => `(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;

/** layout facts: page overflow, the first visible match of `sel` and its box, busy elements */
const LAYOUT = sel => `(() => {
  const vis = e => { if (!e || e.closest("[hidden]")) return false; const cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden") return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const el = ${sel ? `[...document.querySelectorAll(${JSON.stringify(sel)})].find(vis)` : "null"};
  const r = el ? el.getBoundingClientRect() : null;
  const busy = [...document.querySelectorAll('[aria-busy="true"]')].map(e => e.id || e.className || e.tagName);
  return { sw: document.documentElement.scrollWidth, iw: innerWidth, found: !!el, left: r ? Math.round(r.left) : null, right: r ? Math.round(r.right) : null, busy };
})()`;

/** at(page, label, sel, opts): assert no overflow and (when sel) that the first visible match lies within 0..innerWidth */
async function at(page, label, sel, { busy = false } = {}) {
  await sleep(300);
  const r = await page.evaluate(LAYOUT(sel));
  assert(r.sw <= r.iw + 1, `${label}: horizontal overflow, scrollWidth ${r.sw} > innerWidth ${r.iw}`);
  if (sel) {
    assert(r.found, `${label}: ${sel} not visible`);
    assert(r.left >= -1 && r.right <= r.iw + 1, `${label}: ${sel} box ${r.left}..${r.right} outside 0..${r.iw}`);
  }
  if (busy) {
    if (r.busy.length) {
      try { await page.waitFor(`!document.querySelector('[aria-busy="true"]')`, 3000); } catch { /* asserted next */ }
      const again = await page.evaluate(LAYOUT(null));
      assert(!again.busy.length, `${label}: aria-busy left on ${again.busy.join(", ")}`);
    }
  }
}

const lcFill = async p => {
  await p.evaluate(() => {
    document.getElementById("lcDay").value = "12"; document.getElementById("lcMonth").value = "5"; document.getElementById("lcYear").value = "2533";
    document.getElementById("lcTime").value = "08:00"; document.querySelector("#lcForm button[type=submit]").click();
  });
  await p.waitFor(sections(2), 15000);
};
const LC = { main: "#lcForm button[type=submit]", read: lcFill };

// page → { main: the main action control, read(page, w): run the flow, result: the first reading section, q, cam }
const PAGES = [
  { page: "fortune.html", main: "a.ft-card, a.pd-card", read: async (p, w) => {
    const href = await ev(p, () => { const vis = e => e.getBoundingClientRect().width > 0 && !e.closest("[hidden]");
      const a = [...document.querySelectorAll("a.ft-card, a.pd-card")].find(vis); a.click(); return a.getAttribute("href"); });
    await p.waitFor(`location.pathname.endsWith(${JSON.stringify("/" + href.split(/[?#]/)[0])}) && document.readyState === "complete"`, 10000);
    await at(p, `fortune.html → ${href} @${w}`, null, { busy: true });
  }, result: null },
  { page: "palm.html", q: "?cpu&fakedet", cam: true, main: "#plStartCam", result: "#plNarr .fa-section", read: async p => {
    await p.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
    await ev(p, () => document.getElementById("plStartCam").click());
    await p.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 10000);
    await ev(p, d => { window.__dets = d; }, [HAND]);
    await sleep(600);
    await ev(p, () => document.getElementById("plSnap").click());
    await p.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
    await ev(p, () => document.getElementById("plRead").click());
    await p.waitFor(`!document.getElementById("plResult").hidden && document.querySelectorAll("#plNarr .fa-section").length >= 3`, 20000);
  } },
  { page: "horoscope.html", main: "#hsGo", read: async p => {
    await ev(p, setSel("hsDay", "15")); await ev(p, setSel("hsMonth", "8")); await ev(p, setSel("hsYear", "1990"));
    await ev(p, () => document.getElementById("hsGo").click()); await p.waitFor(sections(3), 20000);
  } },
  { page: "tarot.html", main: "#trStart", result: "#ssResult", read: async (p, w) => {
    await ev(p, () => { document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click(); document.getElementById("trStart").click(); });
    await sleep(600); await ev(p, () => document.getElementById("trAuto").click());
    await sleep(900); await ev(p, () => document.getElementById("trReveal").click());
    await p.waitFor(sections(3), 25000);
    await at(p, `tarot.html reading @${w}`, ".fa-section", { busy: true });
    // Siam Si draw (same page, its own tab)
    await ev(p, () => document.getElementById("tabSiamsee").click());
    await p.waitFor(`!document.getElementById("panelSiamsee").hidden && !document.getElementById("ssDraw").disabled`, 5000);
    await at(p, `tarot.html Siam Si tab @${w}`, "#ssDraw");
    await ev(p, () => document.getElementById("ssDraw").click());
    await p.waitFor(`!document.getElementById("ssResult").hidden && document.getElementById("ssTitle").textContent.trim().length > 0`, 15000);
  } },
  { page: "iching.html", main: "#icStart", read: async p => {
    await ev(p, () => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); }); await p.waitFor(sections(3), 20000);
  } },
  { page: "bazi.html", ...LC }, { page: "taksa.html", ...LC }, { page: "lek7.html", ...LC },
  { page: "numbers.html", main: "#nmGo", read: async p => {
    await ev(p, setSel("nmPhone", "0812345678")); await ev(p, () => document.getElementById("nmGo").click()); await p.waitFor(sections(2), 15000);
  } },
  { page: "fengshui.html", main: "#fsKuaForm [type=submit]", read: async p => {
    await ev(p, setSel("fsDay", "15")); await ev(p, setSel("fsMonth", "6")); await ev(p, setSel("fsYear", "2533"));
    await ev(p, () => document.getElementById("fsKuaForm").requestSubmit()); await sleep(500);
    await ev(p, () => document.getElementById("fsReadBtn").click()); await p.waitFor(sections(2), 15000);
  }, result: ".fa-section, .fs-sec" },
  { page: "dream.html", main: "#drGo", mainAfterInput: true, read: async p => {
    await ev(p, setSel("drText", "ฝันเห็นงูใหญ่ในบ้าน แล้วนั่งเครื่องบินไปทะเล"));
    await p.waitFor(`!document.getElementById("drGo").disabled`, 5000);
    await ev(p, () => document.getElementById("drGo").click()); await p.waitFor(sections(3), 15000);
  } },
  { page: "zodiac.html", main: "#zdForm [type=submit]", read: async p => {
    await ev(p, () => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); });
    await p.waitFor(sections(3), 15000);
  } },
  { page: "astro.html", main: "#asForm [type=submit]", read: async p => {
    await ev(p, setSel("asDay", "15")); await ev(p, setSel("asMonth", "5")); await ev(p, setSel("asYear", "2533"));
    await ev(p, () => document.getElementById("asForm").requestSubmit()); await p.waitFor(sections(3), 15000);
  } },
  { page: "lifegraph.html", ...LC },
  // camera optional: the main flow without one is choosing a goal and a day → the recommended colours and the week table
  { page: "luckycolor.html", main: ".lc-goal", result: "#recBox .lc-rec-row", read: async (p, w) => {
    await ev(p, () => document.querySelector('.lc-goal[data-goal="money"]').click());
    await ev(p, setSel("daySel", "5"));
    await p.waitFor(`document.querySelector('.lc-goal[data-goal="money"]').getAttribute("aria-pressed") === "true" && ` +
      `document.querySelectorAll("#recBox .lc-rec-row").length >= 2 && document.querySelectorAll("#week tbody tr").length === 7`, 5000);
    await at(p, `luckycolor.html week table @${w}`, "#week");
  } },
  { page: "report.html", main: "#rpGo", result: "#rpOut .rp-sec", read: async p => {
    await p.waitFor(`!!window.__rp && document.getElementById("rpMode").textContent.length > 4`, 8000);
    await ev(p, () => { // Thai default era: พ.ศ.
      document.querySelector('[data-rp-type="report_basic"]').click(); document.getElementById("rpAYear").value = "2533"; document.getElementById("rpGo").click();
    });
    await p.waitFor(`document.querySelectorAll("#rpOut .rp-sec").length >= 3`, 20000);
  } }
];

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const P of PAGES) {
      for (const [w, h] of WIDTHS) {
        await check(`P4 ${P.page} main flow at ${w}×${h}: reading shown, no overflow, controls and reading within the width, nothing busy`, async () => {
          const page = await browser.newPage(null, { initScripts: [thInit].concat(P.cam ? [fakeCams, detScript] : []), isolated: true });
          try {
            await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
            await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
            await page.goto(`${base}/${P.page}${P.q || ""}`);
            await page.waitFor(`document.documentElement.lang === "th"`, 8000);
            assert(await page.evaluate("innerWidth") === w, `viewport width ${await page.evaluate("innerWidth")} ≠ ${w}`);
            await sleep(600);
            // dream: the predict button appears enabled once a symbol is found, so it is measured inside the flow
            await at(page, `${P.page} landing @${w}`, P.mainAfterInput ? null : P.main);
            if (P.mainAfterInput) {
              await ev(page, setSel("drText", "ฝันเห็นงูใหญ่ในบ้าน แล้วนั่งเครื่องบินไปทะเล"));
              await page.waitFor(`!document.getElementById("drGo").disabled`, 5000);
              await at(page, `${P.page} input @${w}`, P.main);
            }
            await P.read(page, w);
            if (P.result !== null) await at(page, `${P.page} reading @${w}`, P.result || ".fa-section", { busy: true });
          } finally { await page.close(); }
        });
      }
    }
  } finally { await browser.close(); }
}
