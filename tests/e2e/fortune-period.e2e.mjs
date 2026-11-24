// tests/e2e/fortune-period.e2e.mjs — FIXED TEST SET "fortune-period" (owner inbox 2026-11-21 entries 19, 21, 26), locked
// (~/LENSIQ-field/evals/fortune-period/, evals-locks/fortune-period.sha256) BEFORE the period layer was built. Never edit to pass.
// The page-level half of tests/unit/fortune-period.test.js, on horoscope.html and fengshui.html at phone width (360 px), with
// the page clock moved (Date replaced before any page script runs) and one SYNTHETIC person:
//   1. switch off (shipped config): no period block on the page
//   2. switch on: one block [data-lq-period], visibly separate from the base reading (outside it, its own heading), stating the
//      period ("ช่วงนี้: …"), with the line that the base reading stays the same
//   3. (i) the base reading text is identical on 2026-11-10, 2026-11-28 and 2027-01-20
//   4. (ii) the period text is identical on 2026-11-10 and 2026-11-28 (one solar month) and differs on 2027-01-20
//   5. calm tab (crisis session flag): the block keeps no lucky-colour or remedy line on screen
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ON = "window.LENSIQ_FORTUNE_PERIOD = true;";
const CLOCK = iso => `(() => { const R = Date, off = ${Date.parse(iso)} - R.now();
  class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } }
  window.Date = D; })();`;
const DATES = ["2026-11-10T03:00:00Z", "2026-11-28T03:00:00Z", "2027-01-20T03:00:00Z"];
const PAGES = {
  horoscope: { base: "hsRd-body",
    fill: `(() => { const d = document.getElementById("hsDay"), m = document.getElementById("hsMonth"); d.value = d.options[12].value; m.value = m.options[5].value;
      document.getElementById("hsYear").value = "2533"; document.getElementById("hsForm").requestSubmit(); return 1; })()` },
  fengshui: { base: "fsSections",
    fill: `(() => { document.getElementById("fsDay").value = "12"; document.getElementById("fsMonth").value = "5"; document.getElementById("fsYear").value = "2533";
      document.querySelector('input[name="fsGender"][value="m"]').checked = true; document.getElementById("fsKuaForm").requestSubmit();
      setTimeout(() => document.getElementById("fsReadBtn").click(), 300); return 1; })()` },
};
const BLOCK = `(() => { const b = [...document.querySelectorAll("[data-lq-period]")]; if (b.length !== 1) return { n: b.length };
  const e = b[0], body = e.querySelector(".lq-period-body"), h = e.querySelector("h2, h3");
  return { n: 1, label: (e.querySelector(".lq-period-label") || {}).textContent || "", heading: h ? h.textContent.trim() : "",
    constant: (e.querySelector(".lq-period-constant") || {}).textContent || "", text: body ? body.textContent.trim() : "",
    shown: e.getClientRects().length > 0 && !e.closest("[hidden]"), remedy: [...e.querySelectorAll("[data-lq-remedy]")].filter(x => x.getClientRects().length > 0).length,
    links: e.querySelectorAll("a[href]").length }; })()`;

async function open(browser, p, iso, on) {
  const pg = await browser.newPage(null, { initScripts: [CLOCK(iso)].concat(on ? [ON] : []), isolated: true });
  await pg.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
  await pg.goto(`${globalThis.__lqBase}/${p}.html`); await sleep(400);
  assert(await pg.evaluate(`new Date().toISOString().slice(0, 10)`) === iso.slice(0, 10), `${p} ${iso}: the page clock was not moved`);
  await pg.evaluate(PAGES[p].fill);
  await pg.waitFor(`(() => { const b = document.getElementById(${S(PAGES[p].base)}); return !!b && b.textContent.trim().length > 40 && !b.closest("[aria-busy=true]"); })()`, 15000);
  await sleep(500);
  return pg;
}

export default async function ({ base, launch, check }) {
  globalThis.__lqBase = base;
  const browser = await launch();
  try {
    for (const p of Object.keys(PAGES)) {
      await check(`${p}: period layer off by default; on = one separate block stating the period; base text constant across dates; period text constant inside a solar month and new in the next`, async () => {
        const off = await open(browser, p, DATES[0], false);
        try { assert((await off.evaluate(BLOCK)).n === 0, `${p}: switch off shows a period block`); } finally { await off.close(); }
        const rows = [];
        for (const iso of DATES) {
          const pg = await open(browser, p, iso, true);
          try {
            await pg.waitFor(`(() => { const e = document.querySelector("[data-lq-period] .lq-period-body"); return !!e && e.textContent.trim().length > 40; })()`, 15000);
            const b = await pg.evaluate(BLOCK);
            assert(b.n === 1, `${p} ${iso}: exactly one period block (got ${b.n})`);
            assert(b.shown, `${p} ${iso}: the period block is visible`);
            assert(/^ช่วงนี้: \d{1,2} /.test(b.label.trim()), `${p} ${iso}: the period is stated (${b.label})`);
            assert(b.heading.length > 3 && b.constant.trim().length > 10, `${p} ${iso}: heading and the "base stays the same" line`);
            assert(b.links === 0, `${p} ${iso}: no link in the period block`);
            const inBase = await pg.evaluate(`!!document.getElementById(${S(PAGES[p].base)}).querySelector("[data-lq-period]") || !!document.querySelector("[data-lq-period] #" + ${S(PAGES[p].base)})`);
            assert(!inBase, `${p} ${iso}: the period block is separate from the base reading`);
            const baseText = await pg.evaluate(`document.getElementById(${S(PAGES[p].base)}).textContent.trim()`);
            rows.push({ iso, base: baseText, period: b.text, label: b.label });
            await pg.evaluate("window.LQFortuneCrisis && window.LQFortuneCrisis.setCalm(document)"); await sleep(400);
            assert((await pg.evaluate(BLOCK)).remedy === 0, `${p} ${iso}: calm tab still shows a remedy / lucky line in the period block`);
          } finally { await pg.close(); }
        }
        assert(rows[0].base === rows[1].base && rows[1].base === rows[2].base, `${p}: (i) the base reading changed across dates`);
        assert(rows[0].period === rows[1].period && rows[0].label === rows[1].label, `${p}: (ii) the period text changed inside one solar month`);
        assert(rows[2].period !== rows[0].period && rows[2].label !== rows[0].label, `${p}: (ii) the next period reads the same`);
        console.log(`    ${p}: ${rows.map(r => r.iso.slice(0, 10) + " " + r.label.trim() + " (" + r.period.length + " chars)").join(" | ")}`);
      });
    }
  } finally { await browser.close(); }
}
