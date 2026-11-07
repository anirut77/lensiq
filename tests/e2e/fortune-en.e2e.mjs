// tests/e2e/fortune-en.e2e.mjs — English mode on every fortune page: a full reading is composed natively in English.
// Each page is opened with lq-lang = en, a reading is produced (forms filled, cards drawn, fake camera + scripted detector
// for face/palm), then the reading blocks are checked:
//   * every .fa-section has no Thai and no Chinese characters, and the reading is a real one (> 600 Latin letters, ≥ 2 sections)
//   * the three-step plan (.fa-plan, 3 items per reading; astro/horoscope show two readings) and the Kalama-sutta reminder (.fa-reminder) are shown in English
//   * the old "readings are written in Thai or Chinese" note is not shown
// Prints a table per page; the Thai share of all visible text (page fact cards and extras included) must stay ≤ 3 %.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const MEASURE = `(() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let th = 0, la = 0, n;
  while ((n = w.nextNode())) {
    const el = n.parentElement; if (!el) continue;
    const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || el.closest("[hidden]")) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const t = n.textContent.trim(); if (!t) continue;
    th += (t.match(/[\\u0E00-\\u0E7F]/g) || []).length; la += (t.match(/[A-Za-z]/g) || []).length;
  }
  const secs = [...document.querySelectorAll(".fa-section")], rd = secs.map(s => s.textContent).join(" ");
  const note = document.querySelector(".lq-lang-note");
  const plan = [...document.querySelectorAll(".fa-plan li")].map(li => li.textContent), rem = (document.querySelector(".fa-reminder") || {}).textContent || "";
  return { share: th / (th + la || 1), sections: secs.length, readingThai: (rd.match(/[\\u0E00-\\u0E7F]/g) || []).length, readingCjk: (rd.match(/[\\u2E80-\\u9FFF]/g) || []).length,
    readingLatin: (rd.match(/[A-Za-z]/g) || []).length, sample: rd.slice(0, 160), plan, reminder: rem, noteShown: !!(note && !note.hidden),
    langAttr: (secs[0] && secs[0].closest("[lang]") || {}).lang || "" };
})()`;
const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const enInit = `try { localStorage.setItem("lq-lang", "en"); } catch (e) {}`;
const ev = (page, fn, ...a) => page.evaluate(fn, ...a);
const sections = n => `document.querySelectorAll(".fa-section").length >= ${n} && !document.querySelector(".fa-loading, [aria-busy=true] .fa-section")`;
const setSel = (id, v) => `(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;

const lcFill = async p => { await p.evaluate(() => { document.getElementById("lcDay").value = "12"; document.getElementById("lcMonth").value = "5"; document.getElementById("lcYear").value = "2533"; document.getElementById("lcTime").value = "08:00"; document.querySelector("#lcForm button[type=submit]").click(); }); await p.waitFor(sections(2), 15000); };
// page → { url, cam, read(page) } ; read() produces a reading (or null for the hub)
const PAGES = [
  { page: "iching.html", read: async p => { await ev(p, () => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); }); await p.waitFor(sections(3), 20000); } },
  { page: "zodiac.html", read: async p => { await ev(p, () => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); }); await p.waitFor(sections(3), 15000); } },
  { page: "astro.html", read: async p => { await ev(p, setSel("asDay", "15")); await ev(p, setSel("asMonth", "5")); await ev(p, setSel("asYear", "2533")); await ev(p, () => document.getElementById("asForm").requestSubmit()); await p.waitFor(sections(3), 15000); } },
  { page: "dream.html", read: async p => { await ev(p, setSel("drText", "ฝันเห็นงูใหญ่ในบ้าน แล้วนั่งเครื่องบินไปทะเล")); await p.waitFor(`!document.getElementById("drGo").disabled`, 5000); await ev(p, () => document.getElementById("drGo").click()); await p.waitFor(sections(3), 15000); } },
  { page: "tarot.html", read: async p => { await ev(p, () => { document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click(); document.getElementById("trStart").click(); }); await sleep(600); await ev(p, () => document.getElementById("trAuto").click()); await sleep(900); await ev(p, () => document.getElementById("trReveal").click()); await p.waitFor(sections(3), 25000); } },
  { page: "horoscope.html", read: async p => { await ev(p, setSel("hsDay", "15")); await ev(p, setSel("hsMonth", "8")); await ev(p, setSel("hsYear", "1990")); await ev(p, () => document.getElementById("hsGo").click()); await p.waitFor(sections(3), 20000); } },
  { page: "numbers.html", read: async p => { await ev(p, setSel("nmPhone", "0812345678")); await ev(p, () => document.getElementById("nmGo").click()); await p.waitFor(sections(2), 15000); } },
  { page: "fengshui.html", read: async p => { await ev(p, setSel("fsDay", "15")); await ev(p, setSel("fsMonth", "6")); await ev(p, setSel("fsYear", "2533")); await ev(p, () => document.getElementById("fsKuaForm").requestSubmit()); await sleep(500); await ev(p, () => document.getElementById("fsReadBtn").click()); await p.waitFor(sections(2), 15000); } },
  { page: "bazi.html", read: lcFill },
  { page: "taksa.html", read: lcFill },
  { page: "lek7.html", read: lcFill },
  { page: "lifegraph.html", read: lcFill },
  { page: "faceread.html", q: "?cpu&fakedet", cam: true, read: async p => {
    await ev(p, () => document.getElementById("frStartCam").click());
    await p.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
    await ev(p, d => { window.__dets = d; }, [FACE]);
    await p.waitFor(`!document.getElementById("frRead").disabled`, 8000);
    await ev(p, () => document.getElementById("frRead").click());
    await p.waitFor(`!document.getElementById("frResult").hidden && ` + sections(3), 20000);
  } },
  { page: "palm.html", q: "?cpu&fakedet", cam: true, read: async p => {
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
];

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const rows = [];
  try {
    for (const P of PAGES) {
      await check(`en: ${P.page} shows a full English reading (no Thai/Chinese), plan and reminder`, async () => {
        const page = await browser.newPage(null, { initScripts: [enInit].concat(P.cam ? [fakeCams, detScript] : []) });
        try {
          await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
          await page.goto(`${base}/${P.page}${P.q || ""}`);
          await page.waitFor(`document.documentElement.lang === "en"`, 8000);
          await sleep(900);
          await P.read(page); await sleep(700);
          const m = await page.evaluate(MEASURE);
          rows.push({ page: P.page, m });
          assert(m.sections >= 2, `${P.page}: only ${m.sections} reading sections`);
          assert(m.readingThai === 0 && m.readingCjk === 0, `${P.page}: reading has ${m.readingThai} Thai / ${m.readingCjk} CJK chars — ${m.sample}`);
          assert(m.readingLatin > 600, `${P.page}: reading too short (${m.readingLatin} letters)`);
          assert(m.langAttr === "en", `${P.page}: reading container lang=${m.langAttr}`);
          assert(m.plan.length >= 3 && m.plan.length % 3 === 0 && m.plan.every(t => !/[\u0E00-\u0E7F]/.test(t)), `${P.page}: plan ${JSON.stringify(m.plan)}`);
          assert(/judgement/.test(m.reminder) && !/[\u0E00-\u0E7F]/.test(m.reminder), `${P.page}: reminder "${m.reminder.slice(0, 80)}"`);
          assert(!m.noteShown, `${P.page}: the Thai/Chinese-only note is still shown`);
          // page extras (fact cards, side notes, lucky box, siam si verse) come from the en-kb / FR_KB_EN data, so the page itself stays English
          assert(m.share <= 0.03, `${P.page}: ${(m.share * 100).toFixed(1)} % of the visible text is Thai`);
        } finally { await page.close(); }
      });
    }
  } finally {
    await browser.close();
    console.log("\n  en audit — reading per page (390 px)\n  page               sections  letters  Thai/CJK  plan  page Thai share");
    for (const r of rows) console.log("  " + r.page.padEnd(18) + " " + String(r.m.sections).padStart(8) + " " + String(r.m.readingLatin).padStart(8) + " " + (r.m.readingThai + "/" + r.m.readingCjk).padStart(9) + " " + String(r.m.plan.length).padStart(5) + "  " + (r.m.share * 100).toFixed(1) + " %");
  }
}
