// tests/e2e/fortune-compat-webkit.e2e.mjs — FIXED TEST SET, Compatibility (ดวงสมพงษ์) on an iPhone 13 profile (Playwright
// WebKit, 390 px). Written and locked (~/LENSIQ-field/evals/fortune-compat/, evals-locks/fortune-compat.sha256) BEFORE any
// product code on branch fortune-compat. Chrome half: tests/e2e/fortune-compat.e2e.mjs (page contract described there).
//   W1  [th, en] two people: tap the consent statement, fill both people, tap compute; the overview and the wheel show; a
//       category opens with a tap on its "read more" button; no horizontal scroll; the 1323 button once, 1669 not visible;
//       no page error; no request leaves the origin
//   W2  [th] group of 3: the complement map (3 cells), 3 roles and the work-use line; no horizontal scroll
import { assert } from "./cdp.mjs";
import { openFlow, launchWebKit, sleep, waitFor } from "./phone-kit.mjs";

const A = { d: 14, m: 2, y: 1988, t: "07:30", nick: "Ann" }, B = { d: 3, m: 9, y: 2535, t: "", nick: "Ben" }, C3 = { d: 21, m: 6, y: 1979, t: "", nick: "Chai" };
const fill = (page, i, p) => page.evaluate(([i2, p2]) => {
  const fs = document.querySelector(`[data-cp-person="${i2}"]`);
  const set = (sel, v) => { const e = fs.querySelector(sel); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); };
  set("select[name=d]", String(p2.d)); set("select[name=m]", String(p2.m)); set("input[name=y]", String(p2.y)); set("input[name=t]", p2.t || ""); set("input[name=nick]", p2.nick || "");
}, [i, p]);
const facts = page => page.evaluate(() => {
  const vis = e => !!e && e.getClientRects().length > 0;
  const r = document.getElementById("cpResult");
  return { overview: vis(r.querySelector("[data-compat-overview]")), wheel: vis(r.querySelector("svg[data-compat-wheel]")),
    sw: document.documentElement.scrollWidth, vw: innerWidth,
    t1323: [...document.querySelectorAll('a[href="tel:1323"]')].filter(vis).length, t1669: [...document.querySelectorAll('a[href="tel:1669"]')].filter(vis).length,
    map: r.querySelectorAll("[data-compat-map] [data-pair]").length, roles: r.querySelectorAll("[data-compat-role]").length,
    work: (() => { const w = document.querySelector("[data-compat-workuse]"); return w && vis(w) ? w.innerText : ""; })() };
});

export default async function ({ base, check }) {
  const browser = await launchWebKit();
  try {
    for (const lang of ["th", "en"]) {
      await check(`W1 [${lang}] iPhone 390 px: consent tap, two people, overview, a category opens on tap, layout, help`, async () => {
        const { ctx, page, st } = await openFlow(browser, `${base}/compat.html?nosw`, { lang });
        const away = [];
        page.on("request", q => { const u = q.url(); if (!u.startsWith(new URL(base).origin) && !/^(data|blob|about):/.test(u)) away.push(u); });
        try {
          await waitFor(page, l => document.documentElement.lang === l && !!window.LQCompat, lang);
          assert(await page.evaluate(() => innerWidth) === 390, "iPhone 13 width");
          await page.locator("#cpConsent").tap();
          await waitFor(page, () => !document.querySelector('[data-cp-person="1"]').disabled);
          await fill(page, 0, A); await fill(page, 1, B);
          await page.locator("#cpGo").tap();
          await waitFor(page, () => !!document.querySelector("#cpResult [data-compat-overview]"), null, 25000);
          await sleep(800);
          const f = await facts(page);
          assert(f.overview && f.wheel, "overview and wheel: " + JSON.stringify(f));
          assert(f.sw <= f.vw + 1, `no horizontal scroll: ${f.sw} > ${f.vw}`);
          assert(f.t1323 === 1 && f.t1669 === 0, "help button once: " + JSON.stringify(f));
          const btn = page.locator("#cpResult .fa-section.cp-cat button.lq-more").first();
          await btn.scrollIntoViewIfNeeded();
          await btn.tap();
          await sleep(300);
          assert(await btn.getAttribute("aria-expanded") === "true", "the category opened on tap");
          assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, "no horizontal scroll after opening");
          assert(st.errors.length === 0, "page errors: " + st.errors.join(" | "));
          assert(away.length === 0, "requests leaving the origin: " + away.join(" "));
        } finally { await ctx.close(); }
      });
    }
    await check("W2 [th] iPhone 390 px: group of 3, map, roles, work-use line", async () => {
      const { ctx, page, st } = await openFlow(browser, `${base}/compat.html?nosw`, { lang: "th" });
      try {
        await waitFor(page, () => document.documentElement.lang === "th" && !!window.LQCompat);
        await page.locator('button[data-cp-mode="group"]').tap();
        await page.locator("#cpConsent").tap();
        await waitFor(page, () => document.querySelectorAll("[data-cp-person]").length === 3 && !document.querySelector('[data-cp-person="2"]').disabled);
        await fill(page, 0, A); await fill(page, 1, B); await fill(page, 2, C3);
        await page.locator("#cpGo").tap();
        await waitFor(page, () => !!document.querySelector("#cpResult [data-compat-map]"), null, 25000);
        await sleep(800);
        const f = await facts(page);
        assert(f.map === 3 && f.roles === 3, "map 3 cells, 3 roles: " + JSON.stringify(f));
        assert(/ไม่ใช้.*จ้าง.*เลื่อนตำแหน่ง.*(?:ค่าตอบแทน|เงินเดือน).*เลิกจ้าง/.test(f.work), "work-use line: " + f.work);
        assert(f.sw <= f.vw + 1, `no horizontal scroll: ${f.sw} > ${f.vw}`);
        assert(st.errors.length === 0, "page errors: " + st.errors.join(" | "));
      } finally { await ctx.close(); }
    });
  } finally { await browser.close(); }
}
