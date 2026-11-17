// tests/e2e/crisis-net-hotfix-b.e2e.mjs — FIXED TEST SET "crisis-net-hotfix" part B: faceread and palm (fake camera + scripted
// detector, as in look.e2e.mjs / palm-hands.e2e.mjs). Paths: nickname typed before the reading; nickname typed after a reading
// (change event re-narrates); faceread lead form fields (lead form switched on, typed after a reading). See crisis-net-hotfix-kit.mjs.
import { GENERIC, PHRASE, WIDTHS, assertCard, baseline, click, open, rowsOf, runRow, setVal, submit } from "./crisis-net-hotfix-kit.mjs";
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95 };
const det = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const LEADS_ON = `try { localStorage.setItem("fr-prefs", JSON.stringify({ leads: true })); } catch (e) {}`;
const FR = GENERIC.concat(["#frResTitle", "#frResCanvas", "#frOvlCap", "#frElement", "#frPalBlock", "#frPalaces", "#frMountains", "#frRivers", "#frZones",
  "#frReadTitle", "#frSrc", "#frTypeHow", "#frLook", "#frReco", "#frLead", "#frCardImg", "#frOverlay"]);
const PL = GENERIC.concat(["#plResTitle", "#plSideBadge", "#plResCanvas", "#plElement", "#plReadTitle", "#plSrc", "#plCompare", "#plLines", "#plMountEst",
  "#plFingers", "#plExtras", "#plCardImg", "#plOverlay"]);

async function frOpen(browser, base, fakeCams, o, extra = []) {
  return open(browser, base, "faceread.html?cpu&fakedet", Object.assign({ initScripts: [fakeCams, det].concat(extra) }, o));
}
/** camera on, a face in view, nickname (optional), read */
async function frRead(page, nick) {
  await page.evaluate(click("#frStartCam"));
  await page.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
  await page.evaluate(d => { window.__dets = d; }, [FACE]);
  await page.waitFor(`!document.getElementById("frRead").disabled`, 8000);
  if (nick != null) await page.evaluate(setVal("#frNick", nick));
  await page.evaluate(click("#frRead"));
}
async function plOpen(browser, base, fakeCams, o) {
  const page = await open(browser, base, "palm.html?cpu&fakedet", Object.assign({ initScripts: [fakeCams, det] }, o));
  await page.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
  return page;
}
async function plRead(page, nick) {
  await page.evaluate(click("#plStartCam"));
  await page.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 8000);
  await page.evaluate(d => { window.__dets = d; }, [Object.assign({ side: "right" }, HAND)]);
  await sleep(300);
  await page.evaluate(click("#plSnap"));
  await page.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
  if (nick != null) await page.evaluate(setVal("#plNick", nick));
  await page.evaluate(click("#plRead"));
}
const readDone = (page, sel) => page.waitFor(`document.querySelectorAll(${JSON.stringify(sel + " .fa-section")}).length >= 3`, 20000);

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    const FLOWS = {
      "faceread #frNick": async ({ lang, phrase, width, label }) => {
        const page = await frOpen(browser, base, fakeCams, { width, lang });
        try { const before = await baseline(page); await frRead(page, phrase); await assertCard(page, { label, typed: phrase, before, widgets: FR }); } finally { await page.close(); }
      },
      "faceread #frLeadNick": null, "faceread #frLeadContact": null, // set below (same flow, other field)
      "palm #plNick": async ({ lang, phrase, width, label }) => {
        const page = await plOpen(browser, base, fakeCams, { width, lang });
        try { const before = await baseline(page); await plRead(page, phrase); await assertCard(page, { label, typed: phrase, before, widgets: PL }); } finally { await page.close(); }
      },
    };
    for (const sel of ["#frLeadNick", "#frLeadContact"]) {
      FLOWS["faceread " + sel] = async ({ lang, phrase, width, label }) => {
        const page = await frOpen(browser, base, fakeCams, { width, lang }, [LEADS_ON]);
        try {
          await frRead(page, null); await readDone(page, "#frNarr");
          await page.waitFor(`!document.getElementById("frLead").hidden`, 5000);
          const before = await baseline(page);
          await page.evaluate(setVal(sel, phrase));
          await page.evaluate(submit("frLeadForm"));
          await assertCard(page, { label, typed: phrase, before, widgets: FR });
          const saved = await page.evaluate(`(() => { try { return (localStorage.getItem("fr-leads") || "").length; } catch (e) { return 0; } })()`);
          assert(!saved, label + ": the lead with the crisis phrase was saved");
        } finally { await page.close(); }
      };
    }
    for (const row of rowsOf(["faceread", "palm"])) await runRow(check, row, FLOWS[row.page + " " + row.sel], { both: row.sel === "#frNick" || row.sel === "#plNick" });

    await check("faceread / palm: nickname typed AFTER a reading (change event) -> crisis state, no card, no echo (v3)", async () => {
      const fails = [];
      for (const [lang, k] of [["th", "th"], ["en", "en"], ["zh", "zh"]]) for (const width of WIDTHS) {
        const phrase = PHRASE[k];
        for (const p of ["faceread", "palm"]) {
          const label = `${p} nickname after reading [ui ${lang}, ${width}px]`;
          const page = p === "faceread" ? await frOpen(browser, base, fakeCams, { width, lang }) : await plOpen(browser, base, fakeCams, { width, lang });
          try {
            if (p === "faceread") { await frRead(page, null); await readDone(page, "#frNarr"); } else { await plRead(page, null); await readDone(page, "#plNarr"); }
            const before = await baseline(page);
            await page.evaluate(setVal(p === "faceread" ? "#frNick" : "#plNick", phrase));
            await assertCard(page, { label, typed: phrase, before, widgets: p === "faceread" ? FR : PL });
          } catch (e) { fails.push(String(e.message || e).replace(/^assertion failed: /, "")); } finally { await page.close(); }
        }
      }
      assert(!fails.length, fails.length + "/12 cases fail:\n      " + fails.join("\n      "));
    });
  } finally {
    await browser.close();
  }
}
