// tests/e2e/fortune-period-2.e2e.mjs — FIXED TEST SET "fortune-period" part 2, locked (~/LENSIQ-field/evals/fortune-period/p2/,
// evals-locks/fortune-period.sha256) BEFORE these pages were built. Never edit to pass. Phone width 360 px, page clock moved, one
// SYNTHETIC person. The page-level half of tests/unit/fortune-period-2.test.js:
//   zodiac, astro: switch off = no block; on = one separate [data-lq-period] block stating the period ("ช่วงนี้: …"); base reading
//     identical on 2026-11-25, 2026-12-05 and 2027-01-20; period text identical on the first two (same solar month / same Sun sign)
//     and different on the third; calm tab = no remedy line visible in the block
//   luckycolor: on = a block stating today's Thai date; identical at 08:00 and 20:00 of one day, different the next day
//   tarot, iching, dream, lek7: on = the one plain "no period method" line is shown; off = not shown
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ON = "window.LENSIQ_FORTUNE_PERIOD = true;";
const CLOCK = iso => `(() => { const R = Date, off = ${Date.parse(iso)} - R.now();
  class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } }
  window.Date = D; })();`;
const PAGES = {
  zodiac: { base: "zdRd-body", ready: "!!document.querySelector('input[name=zdAnimal]')",
    fill: `(() => { document.querySelector('input[name="zdAnimal"][value="6"]').checked = true; const y = document.getElementById("zdYear"); y.value = "2026";
      if (y.value !== "2026") return 0; document.getElementById("zdForm").requestSubmit(); return 1; })()` },
  astro: { base: "asRd-body", ready: "!!document.getElementById('asDay').options.length",
    fill: `(() => { document.getElementById("asDay").value = "12"; document.getElementById("asMonth").value = "5"; document.getElementById("asYear").value = "2533";
      document.getElementById("asNoTime").checked = true; document.getElementById("asForm").requestSubmit(); return 1; })()` },
};
const DATES = ["2026-11-25T03:00:00Z", "2026-12-05T03:00:00Z", "2027-01-20T03:00:00Z"];
const BLOCK = `(() => { const b = [...document.querySelectorAll("[data-lq-period]")]; if (b.length !== 1) return { n: b.length };
  const e = b[0], body = e.querySelector(".lq-period-body");
  return { n: 1, label: (e.querySelector(".lq-period-label") || {}).textContent || "", all: e.textContent.trim(), text: body ? body.textContent.trim() : "",
    shown: e.getClientRects().length > 0 && !e.closest("[hidden]"), links: e.querySelectorAll("a[href]").length,
    remedy: [...e.querySelectorAll("[data-lq-remedy]")].filter(x => x.getClientRects().length > 0).length }; })()`;

async function page(browser, base, p, iso, on, mobile = true) {
  const pg = await browser.newPage(null, { initScripts: [CLOCK(iso)].concat(on ? [ON] : []), isolated: true });
  await pg.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 2, mobile });
  await pg.goto(`${base}/${p}.html`); await sleep(400);
  assert(await pg.evaluate(`new Date().toISOString().slice(0, 13)`) === iso.slice(0, 13), `${p} ${iso}: the page clock was not moved`);
  return pg;
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const [p, cfg] of Object.entries(PAGES)) {
      await check(`${p}: off = no block; on = one separate block stating the period; base constant across dates; period constant inside one period and new in the next`, async () => {
        const open = async (iso, on) => {
          const pg = await page(browser, base, p, iso, on);
          await pg.waitFor(cfg.ready, 8000);
          assert(await pg.evaluate(cfg.fill) === 1, `${p} ${iso}: form filled`);
          await pg.waitFor(`(() => { const b = document.getElementById(${S(cfg.base)}); return !!b && b.textContent.trim().length > 40 && !b.closest("[aria-busy=true]"); })()`, 15000);
          await sleep(500);
          return pg;
        };
        const off = await open(DATES[0], false);
        try { assert((await off.evaluate(BLOCK)).n === 0, `${p}: switch off shows a period block`); } finally { await off.close(); }
        const rows = [];
        for (const iso of DATES) {
          const pg = await open(iso, true);
          try {
            await pg.waitFor(`(() => { const e = document.querySelector("[data-lq-period] .lq-period-body"); return !!e && e.textContent.trim().length > 40; })()`, 15000);
            const b = await pg.evaluate(BLOCK);
            assert(b.n === 1 && b.shown, `${p} ${iso}: one visible period block`);
            assert(/^ช่วงนี้: \d{1,2} /.test(b.label.trim()), `${p} ${iso}: the period is stated (${b.label})`);
            assert(b.links === 0, `${p} ${iso}: no link in the block`);
            assert(!(await pg.evaluate(`!!document.getElementById(${S(cfg.base)}).querySelector("[data-lq-period]")`)), `${p} ${iso}: separate from the base reading`);
            rows.push({ base: await pg.evaluate(`document.getElementById(${S(cfg.base)}).textContent.trim()`), text: b.text, label: b.label });
            await pg.evaluate("window.LQFortuneCrisis && window.LQFortuneCrisis.setCalm(document)"); await sleep(400);
            assert((await pg.evaluate(BLOCK)).remedy === 0, `${p} ${iso}: calm tab shows a remedy line in the block`);
          } finally { await pg.close(); }
        }
        assert(rows[0].base === rows[1].base && rows[1].base === rows[2].base, `${p}: (i) base changed across dates`);
        assert(rows[0].text === rows[1].text && rows[0].label === rows[1].label, `${p}: (ii) changed inside one period`);
        assert(rows[2].text !== rows[0].text && rows[2].label !== rows[0].label, `${p}: (ii) the next period reads the same`);
        console.log(`    ${p}: ${rows.map(r => r.label.trim() + " (" + r.text.length + ")").join(" | ")}`);
      });
    }

    await check("luckycolor: off = no block; on = a block stating today's Thai date; same at 08:00 and 20:00 Bangkok, new the next day", async () => {
      const get = async (iso, on) => {
        const pg = await page(browser, base, "luckycolor", iso, on);
        try { await sleep(600); return await pg.evaluate(BLOCK); } finally { await pg.close(); }
      };
      assert((await get("2026-11-24T01:00:00Z", false)).n === 0, "luckycolor: switch off shows a block");
      const a = await get("2026-11-24T01:00:00Z", true), b = await get("2026-11-24T13:00:00Z", true), c = await get("2026-11-25T01:00:00Z", true);
      for (const x of [a, b, c]) assert(x.n === 1 && x.shown && x.links === 0, "luckycolor: one visible block, no link");
      assert(a.label.trim() === "ช่วงนี้: วันอังคาร 24 พ.ย. 2569", `luckycolor: label ${a.label}`);
      assert(a.all === b.all, "luckycolor: changed within one day");
      assert(c.all !== a.all && c.label.trim() === "ช่วงนี้: วันพุธ 25 พ.ย. 2569", `luckycolor: next day ${c.label}`);
    });

    await check("tarot, iching, dream, lek7: the one plain no-period-method line shows only with the switch on (Thai)", async () => {
      for (const p of ["tarot", "iching", "dream", "lek7"]) for (const on of [false, true]) {
        const pg = await page(browser, base, p, "2026-11-24T03:00:00Z", on);
        try {
          await sleep(500);
          const r = await pg.evaluate(`(() => { const e = document.querySelector("[data-lq-period-none]"); return e ? { shown: e.getClientRects().length > 0 && !e.closest("[hidden]") && !e.hidden, t: e.textContent.trim() } : null; })()`);
          assert(r, `${p}: the line is in the page`);
          if (on) assert(r.shown && /ไม่มีวิธี|สุ่ม/.test(r.t) && r.t.length > 20, `${p}: switch on shows the line (${r.t})`);
          else assert(!r.shown, `${p}: switch off hides the line`);
        } finally { await pg.close(); }
      }
    });
  } finally { await browser.close(); }
}
