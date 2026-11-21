// tests/e2e/planner-occasions.e2e.mjs — FIXED TEST SET "planner-occasions" (owner order 2026-11-18), locked BEFORE the build
// (evals-locks/planner-occasions.sha256, ~/LENSIQ-field/evals/planner-occasions/). The static half: tests/unit/planner-occasions.test.js.
// planner.html, TH / EN / ZH × 360 / 375 / 390 / 412 / 430 px (phone, touch):
//   G1  groups first: at load every group control (label.pl-grp, a radio name=plGroup) is shown inside .pl-groups and no
//       occasion panel (.pl-occs) is open
//   G2  no orphan half row: in .pl-groups and in every open .pl-occs, a row with fewer items than the fullest row (or any row
//       when the fullest row has one item) spans at least 90 % of the container's content width
//   G3  a tap on a group opens its panel only (the other panels stay closed); every occasion in it is a label at least 44 px
//       tall; a second tap closes it; no horizontal scroll; in EN / ZH no Thai is shown in the groups or the open panel
//   G4  one result per language at 390 px: a new occasion (wedding) gives good days, with the plain-words reason (#plWhy) in the
//       page language; an occasion that needs the owner's birth weekday (bdaymerit) without one shows the empty message
//   G5  no console errors
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
// re-lock 2 (stricter, reviewer round 1): a fixed clock (2026-11-19 10:00 Bangkok) so the month list and the chosen start month never
// depend on the day the test runs
const CLOCK = `(() => { const T = Date.UTC(2026, 10, 19, 3, 0, 0), D = Date;
  function FD(...a) { if (!(this instanceof FD)) return new D(T).toString(); return a.length ? new D(...a) : new D(T); }
  FD.prototype = D.prototype; FD.now = () => T; FD.UTC = D.UTC; FD.parse = D.parse; window.Date = FD; })();`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const WIDTHS = [360, 375, 390, 412, 430];
const unexpected = page => page.consoleErrors.filter(e => !/favicon/.test((e.url || "") + " " + (e.text || "")));

const VIS = `const vis = e => { if (!e || !e.isConnected || !e.getClientRects().length) return false; if (e.closest("[hidden]")) return false;
  const cs = getComputedStyle(e); if (cs.visibility === "hidden" || cs.display === "none") return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };`;
const ORPHAN = `const orphans = c => { const cs = getComputedStyle(c), cw = c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const rows = []; for (const k of [...c.children].filter(vis)) { const r = k.getBoundingClientRect();
    let row = rows.find(x => Math.abs(x.top - r.top) < 3); if (!row) rows.push(row = { top: r.top, items: [] }); row.items.push(r); }
  const maxN = Math.max(0, ...rows.map(r => r.items.length)), bad = [];
  for (const r of rows) if (r.items.length < maxN || maxN === 1) { const span = Math.max(...r.items.map(i => i.right)) - Math.min(...r.items.map(i => i.left));
    if (span < cw * 0.9) bad.push({ top: Math.round(r.top), n: r.items.length, maxN, span: Math.round(span), cw: Math.round(cw) }); }
  return { rows: rows.length, maxN, bad }; };`;
const THAI = /[ก-ฺเ-๛]/;

const STATE = `(() => { ${VIS} ${ORPHAN}
  const box = document.querySelector(".pl-groups"); if (!box) return { missing: ".pl-groups" };
  const groups = [...box.querySelectorAll("label.pl-grp")].filter(vis).map(l => { const i = l.querySelector("input[name=plGroup]"); return { v: i && i.value, h: l.getBoundingClientRect().height, t: l.innerText.trim() }; });
  const open = [...document.querySelectorAll(".pl-occs")].filter(vis);
  const panels = open.map(p => ({ g: p.getAttribute("data-group"), o: orphans(p), occ: [...p.querySelectorAll("label.fk-opt")].filter(vis).map(l => ({ v: (l.querySelector("input[name=plEvent]") || {}).value, h: l.getBoundingClientRect().height, t: l.innerText.trim() })) }));
  return { groups, panels, o: orphans(box), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
})()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const lang of LANGS) {
      await check(`planner occasions: grouped chooser, ${lang}, ${WIDTHS.join(" / ")} px — groups first, no orphan half row, tap opens one group`, async () => {
        const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
        await page.goto(`${base}/planner.html`);
        await page.waitFor(`!!window.__pl && !!window.LQI18N && LQI18N.lang === ${S(lang)}`, 8000);
        await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
        for (const width of WIDTHS) {
          await page.send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 2, mobile: true });
          await sleep(250);
          const s0 = await page.evaluate(STATE);
          const where = `${lang} ${width}px`;
          assert(!s0.missing, where + ": " + S(s0));
          assert(s0.groups.length >= 5, `${where}: groups shown ${s0.groups.length}`);
          assert(!s0.panels.length, `${where}: a panel is open at load: ${S(s0.panels.map(p => p.g))}`);
          assert(!s0.o.bad.length, `${where}: orphan row in the groups: ${S(s0.o)}`);
          assert(s0.sw <= s0.cw, `${where}: horizontal scroll ${s0.sw} > ${s0.cw}`);
          for (const g of s0.groups) {
            assert(g.h >= 43.5, `${where}: group ${g.v} is ${g.h}px tall`);
            if (lang !== "th") assert(!THAI.test(g.t), `${where}: Thai in group ${g.v}: ${g.t}`);
          }
          for (const g of s0.groups) {
            await page.evaluate(`document.querySelector('input[name=plGroup][value=${S(g.v)}]').closest("label").click()`);
            await sleep(120);
            const s1 = await page.evaluate(STATE);
            assert(s1.panels.length === 1 && s1.panels[0].g === g.v, `${where}: tap ${g.v} opens ${S(s1.panels.map(p => p.g))}`);
            const p = s1.panels[0];
            assert(p.occ.length >= 2, `${where}: ${g.v} shows ${p.occ.length} occasions`);
            assert(!p.o.bad.length, `${where}: orphan half row in ${g.v}: ${S(p.o)}`);
            assert(!s1.o.bad.length, `${where}: orphan row in the groups with ${g.v} open: ${S(s1.o)}`);
            assert(s1.sw <= s1.cw, `${where}: horizontal scroll with ${g.v} open`);
            for (const o of p.occ) {
              assert(o.h >= 43.5, `${where}: ${o.v} is ${o.h}px tall`);
              if (lang !== "th") assert(!THAI.test(o.t), `${where}: Thai in ${o.v}: ${o.t}`);
            }
            await page.evaluate(`document.querySelector('input[name=plGroup][value=${S(g.v)}]').closest("label").click()`);
            await sleep(120);
            const s2 = await page.evaluate(STATE);
            assert(!s2.panels.length, `${where}: second tap on ${g.v} leaves ${S(s2.panels.map(q => q.g))} open`);
          }
        }
        const errs = unexpected(page);
        assert(!errs.length, "console errors: " + S(errs.slice(0, 3)));
        await page.close();
      });

      await check(`planner occasions: ${lang} 390 px — a new occasion gives good days with the plain reason; birth-weekday occasion without one shows the empty message`, async () => {
        const page = await browser.newPage(null, { initScripts: [CLOCK, `try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
        await page.goto(`${base}/planner.html`);
        await page.waitFor(`!!window.__pl && !!window.LQI18N && LQI18N.lang === ${S(lang)}`, 8000);
        await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
        await page.evaluate(`(() => {
          document.querySelector('input[name=plGroup][value="family"]').closest("label").click();
          document.querySelector('input[name=plEvent][value="wedding"]').closest("label").click();
          document.getElementById("plSpan").value = "3";
          const fr = document.getElementById("plFrom"); if (![...fr.options].some(o => o.value === "2027-5")) throw new Error("no 2027-5 in the month list"); fr.value = "2027-5";
          document.getElementById("plGo").click();
        })()`);
        await page.waitFor(`document.querySelectorAll(".pl-day").length > 0 && !document.getElementById("plResult").hidden && (document.getElementById("plWhy") || {}).textContent`, 8000);
        await sleep(400);
        const r = await page.evaluate(`(() => ({ why: document.getElementById("plWhy").innerText.trim(), h: document.getElementById("plResH").innerText,
          n: document.querySelectorAll(".pl-day").length, ev: window.__pl.st.ev,
          reasons: [...document.querySelectorAll(".pl-day .pl-why li")].map(l => l.innerText.trim()).slice(0, 12) }))()`);
        assert(r.ev === "wedding" && r.n > 0, S(r));
        assert(r.why.length > 20, "plain reason: " + S(r.why));
        assert(r.reasons.length > 0 && r.reasons.every(x => x.length > 3), "reasons " + S(r.reasons));
        if (lang !== "th") for (const t of [r.why, r.h].concat(r.reasons)) assert(!THAI.test(t), `${lang}: Thai in the result: ${t}`);
        await page.evaluate(`(() => {
          document.getElementById("plAgain").click();
          document.querySelector('input[name=plEvent][value="bdaymerit"]').closest("label").click();
          document.getElementById("plGo").click();
        })()`);
        await page.waitFor(`window.__pl.st.ev === "bdaymerit" && !document.getElementById("plResult").hidden`, 8000);
        await sleep(300);
        const e = await page.evaluate(`(() => ({ n: document.querySelectorAll(".pl-day").length, empty: !document.getElementById("plEmpty").hidden && document.getElementById("plEmpty").innerText.trim() }))()`);
        assert(e.n === 0 && e.empty && e.empty.length > 10, "bdaymerit without a birth weekday: " + S(e));
        if (lang !== "th") assert(!THAI.test(e.empty), "Thai in the empty message: " + e.empty);
        const errs = unexpected(page);
        assert(!errs.length, "console errors: " + S(errs.slice(0, 3)));
        await page.close();
      });
    }
  } finally { await browser.close(); }
}
