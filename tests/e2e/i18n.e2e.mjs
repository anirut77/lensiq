// tests/e2e/i18n.e2e.mjs — TH | 中文 switch (nav.js + lensiq-i18n.js + i18n/zh-common.js) on index.html and a fortune
// page: Chinese applied to nav/hero/form, <html lang>, persisted across reload, switching back restores the Thai markup
// exactly, no horizontal overflow at 390 and 1280 px, no uncaught exceptions; Thai <wbr> breaks applied in Thai only.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function viewport(page, w, h, mobile) {
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
  await page.send("Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const mainText = page => page.evaluate(() => (document.querySelector("main") || document.body).innerText.replace(/\s+/g, " ").trim());

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const [w, h, mobile] of [[390, 844, true], [1280, 800, false]]) {
      await check(`index.html ${w}px: switch to 中文 and back, persisted, no overflow`, async () => {
        const page = await browser.newPage(null);
        await viewport(page, w, h, mobile);
        await page.goto(`${base}/index.html?nosw`);
        await page.waitFor(() => window.LQI18N && document.querySelector(".lang-switch button[data-lang=zh]") && window.LQI18N.has("nav.cta", "zh"), 8000);
        await sleep(300);
        const thai = await mainText(page);
        assert(/เปลี่ยนกล้องธรรมดา/.test(thai), "thai hero");
        assert(await page.evaluate(() => document.querySelectorAll("[data-lqwb] .lq-run wbr").length > 20), "Thai <wbr> breaks inserted");
        assert((await overflow(page)) <= 0, "thai overflow " + (await overflow(page)));
        await page.evaluate(() => document.querySelector(".lang-switch button[data-lang=zh]").click());
        await sleep(300);
        const st = await page.evaluate(() => ({
          lang: document.documentElement.lang, title: document.title,
          h1: document.querySelector("h1").textContent, cta: document.querySelector(".nav-cta").textContent,
          pressed: document.querySelector(".lang-switch [data-lang=zh]").getAttribute("aria-pressed"),
          sub: document.querySelector("#navsub-fortune a[href='palm.html'] b").textContent,
          ph: document.querySelector("#lqMsg").placeholder, opt: document.querySelector("#lqInterest option[value=store]").textContent,
          stored: localStorage.getItem("lq-lang"), wbrInZh: document.querySelectorAll("h1 .lq-run").length,
          toggle: document.querySelector(".nav-toggle").getAttribute("aria-label")
        }));
        assert(st.lang === "zh-Hans", "html lang " + st.lang);
        assert(/营销数据/.test(st.h1) && st.cta === "全部系统" && st.sub === "手相", JSON.stringify(st));
        assert(/LENSIQ \| 面向/.test(st.title), "title " + st.title);
        assert(st.pressed === "true" && st.stored === "zh" && st.wbrInZh === 0, JSON.stringify(st));
        assert(/例如/.test(st.ph) && st.opt === "门店分析" && st.toggle === "打开菜单", JSON.stringify(st));
        const zhText = await mainText(page);
        assert(!/[฀-๿]{3,}/.test(zhText.replace(/LENSIQ/g, "")), "Thai left on the Chinese page: " + (zhText.match(/[^ ]*[฀-๿]{3,}[^ ]*/g) || []).slice(0, 5).join(" | "));
        assert((await overflow(page)) <= 0, "zh overflow " + (await overflow(page)));
        // form validation messages follow the language
        await page.evaluate(() => document.querySelector("#leadForm button[type=submit]").click());
        await sleep(100);
        assert(/请/.test(await page.evaluate(() => document.querySelector("#lqNameErr").textContent)), "zh validation message");
        // persisted across reload
        await page.reload();
        await page.waitFor(() => document.documentElement.lang === "zh-Hans" && /营销数据/.test(document.querySelector("h1").textContent), 8000);
        // back to Thai: identical text to the original markup
        await page.evaluate(() => document.querySelector(".lang-switch button[data-lang=th]").click());
        await sleep(400);
        assert((await page.evaluate(() => document.documentElement.lang)) === "th", "lang th");
        const back = await mainText(page);
        assert(back === thai, "Thai restored exactly");
        const ex = page.consoleErrors.filter(e => e.kind === "exception");
        assert(!ex.length, ex.map(e => e.text).join(" | "));
        await page.evaluate(() => localStorage.removeItem("lq-lang"));
        await page.close();
      });

      await check(`fortune.html ${w}px: 中文 menu, layout kept`, async () => {
        const page = await browser.newPage(null, { initScripts: ["try{localStorage.setItem('lq-lang','zh')}catch(e){}"] });
        await viewport(page, w, h, mobile);
        await page.goto(`${base}/fortune.html?nosw`);
        await page.waitFor(() => document.documentElement.lang === "zh-Hans" && document.querySelector(".nav-cta") && document.querySelector(".nav-cta").textContent === "全部系统", 8000);
        await sleep(500);
        assert((await overflow(page)) <= 0, "zh overflow " + (await overflow(page)));
        const menu = await page.evaluate(() => [...document.querySelectorAll(".nav-sub b")].map(b => b.textContent));
        assert(menu.includes("面相解读") && menu.includes("解梦"), menu.join(","));
        assert(!menu.some(t => /[฀-๿]/.test(t)), "untranslated menu: " + menu.join(","));
        if (mobile) {
          await page.evaluate(() => document.querySelector(".nav-toggle").click());
          await sleep(350);
          assert((await overflow(page)) <= 0, "drawer overflow");
          const r = await page.evaluate(() => { const b = document.querySelector(".lang-switch").getBoundingClientRect(); return { right: b.right, h: b.height, vw: innerWidth }; });
          assert(r.right <= r.vw && r.h >= 40, JSON.stringify(r));
        }
        await page.evaluate(() => document.querySelector(".lang-switch button[data-lang=th]").click());
        await sleep(300);
        assert((await page.evaluate(() => document.querySelector(".nav-cta").textContent)) === "ระบบทั้งหมด", "Thai restored");
        assert((await overflow(page)) <= 0, "th overflow");
        const ex = page.consoleErrors.filter(e => e.kind === "exception");
        assert(!ex.length, ex.map(e => e.text).join(" | "));
        await page.close();
      });
    }
  } finally {
    await browser.close();
  }
}
