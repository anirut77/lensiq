// tests/e2e/crisis-net-hotfix-c.e2e.mjs — FIXED TEST SET "crisis-net-hotfix" part C: horoscope (name, year, partner name / year
// after a reading, numerology name box), tarot question, iching question, dream text and search, report name / years.
// See crisis-net-hotfix-kit.mjs.
import { GENERIC, assertCard, baseline, click, open, rowsOf, runRow, setVal, submit } from "./crisis-net-hotfix-kit.mjs";

const HS = GENERIC.concat(["#hsResTitle", "#hsResSub", "#hsTabs", "#pn-ov", "#pn-th", "#pn-bz", "#pn-nu .hs-block", "#pn-td", "#pn-cp", "#hsCompat .compat",
  "#hsNameOut .namesum", "#hsNameOut .letters", "#hsCardImg"]);
const TR = GENERIC.concat(["#trPick", "#trBoard", "#trResult", "#trSynth", "#trReadings", "#trCardImg", "#ssResult"]);
const IC = GENERIC.concat(["#icStage", "#icResult", "#icHexes", "#icGist", "#icCardImg"]);
const DR = GENERIC.concat(["#drResult", "#drCards", "#drType", "#drCardImg"]);
const RP = GENERIC.concat([".rp-part", ".rp-head", "#rpOut header", "#rpOut .rp-toc"]);

const birth = (y = "2533") => `(() => { const d = document.getElementById("hsDay"), m = document.getElementById("hsMonth"); d.value = d.options[14].value; m.value = m.options[5].value;
  if (${JSON.stringify(y)}) document.getElementById("hsYear").value = ${JSON.stringify(y)}; return true; })()`;
const partnerDate = `(() => { const d = document.getElementById("hsPDay"), m = document.getElementById("hsPMonth"); d.value = d.options[3].value; m.value = m.options[2].value; return true; })()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  /** open, optional set-up, baseline, type, act, assert */
  const flow = (path, widgets, prep, act) => async ({ lang, phrase, width, label }) => {
    const page = await open(browser, base, path, { width, lang });
    try {
      if (prep) await prep(page);
      const before = await baseline(page);
      await act(page, phrase);
      await assertCard(page, { label, typed: phrase, before, widgets });
    } finally { await page.close(); }
  };
  const hsReading = async page => {
    await page.evaluate(setVal("#hsName", "Somchai")); await page.evaluate(birth()); await page.evaluate(submit("hsForm"));
    await page.waitFor(() => document.querySelectorAll("#hsRd .fa-section").length >= 3, 20000);
  };
  const rpReady = page => page.waitFor(() => window.__rp && document.getElementById("rpMode").textContent.length > 10, 8000);
  try {
    const FLOWS = {
      "horoscope #hsName": flow("horoscope.html", HS, null, async (p, q) => { await p.evaluate(setVal("#hsName", q)); await p.evaluate(birth()); await p.evaluate(submit("hsForm")); }),
      "horoscope #hsYear": flow("horoscope.html", HS, null, async (p, q) => { await p.evaluate(birth("")); await p.evaluate(setVal("#hsYear", q)); await p.evaluate(submit("hsForm")); }),
      "horoscope #hsPName": flow("horoscope.html", HS, hsReading, async (p, q) => { await p.evaluate(partnerDate); await p.evaluate(setVal("#hsPYear", "2535")); await p.evaluate(setVal("#hsPName", q)); await p.evaluate(submit("hsPartner")); }),
      "horoscope #hsPYear": flow("horoscope.html", HS, hsReading, async (p, q) => { await p.evaluate(partnerDate); await p.evaluate(setVal("#hsPYear", q)); await p.evaluate(submit("hsPartner")); }),
      "horoscope #hsNameNum": flow("horoscope.html", HS, async p => { await hsReading(p); await p.evaluate(click("#tab-nu")); }, async (p, q) => { await p.evaluate(setVal("#hsNameNum", q)); }),
      "tarot #trQuestion": flow("tarot.html", TR, null, async (p, q) => { await p.evaluate(setVal("#trQuestion", q)); await p.evaluate(submit("trSetup")); }),
      "iching #icQuestion": flow("iching.html", IC, null, async (p, q) => { await p.evaluate(setVal("#icQuestion", q)); await p.evaluate(click("#icStart")); }),
      "dream #drText": flow("dream.html", DR, null, async (p, q) => { await p.evaluate(setVal("#drText", q)); await p.evaluate(submit("drForm")); }),
      "dream #drSearch": flow("dream.html", DR, null, async (p, q) => { await p.evaluate(setVal("#drSearch", q)); await p.evaluate(submit("drForm")); }),
      "report #rpName": flow("report.html", RP, rpReady, async (p, q) => {
        await p.evaluate(setVal("#rpName", q)); await p.evaluate(click('[data-rp-type="report_basic"]')); await p.evaluate(setVal("#rpAYear", "2533")); await p.evaluate(click("#rpGo"));
      }),
      "report #rpAYear": flow("report.html", RP, rpReady, async (p, q) => { await p.evaluate(click('[data-rp-type="report_basic"]')); await p.evaluate(setVal("#rpAYear", q)); await p.evaluate(click("#rpGo")); }),
      "report #rpBYear": flow("report.html", RP, rpReady, async (p, q) => {
        await p.evaluate(click('[data-rp-type="report_compat"]')); await p.evaluate(setVal("#rpAYear", "2533")); await p.evaluate(setVal("#rpBYear", q)); await p.evaluate(click("#rpGo"));
      }),
    };
    const MAIN = ["#hsName", "#trQuestion", "#icQuestion", "#drText", "#rpName"];
    for (const row of rowsOf(["horoscope", "tarot", "iching", "dream", "report"])) await runRow(check, row, FLOWS[row.page + " " + row.sel], { both: MAIN.includes(row.sel) });
  } finally {
    await browser.close();
  }
}
