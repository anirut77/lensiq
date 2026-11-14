// tests/e2e/fortune-helpline.e2e.mjs — FIXED TEST SET, "help line" (owner order 2026-11-12), locked BEFORE the build.
// 1) Every fortune page (and the fortune hubs) shows the calm help line near the top and at the end of the page, in Thai,
//    English and Chinese, with tel: links for 1323 and 1669 that are at least 44 × 44 px, and the line fits 320 / 360 /
//    390 px (no part of it wider than the screen).
// 2) With JavaScript switched off the line is still there (it is in the HTML), with both tel: links and the Thai text.
// 3) A reading carries the line under it (dream, in Thai and English); a printed report keeps it (print media).
// 4) Crisis state: after the support card (hard net on dream, the soft step's "talk" path on horoscope), asking again
//    with harmless text on the same page shows the card again and no remedy, lucky-item, plan or straight-mode text;
//    blocks marked data-lq-remedy (faceread lucky / recommendations / lead form) are not displayed.
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PAGES = ["fortune", "cat-fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui",
  "dream", "zodiac", "astro", "lifegraph", "planner", "luckycolor", "report"];
// AMENDED 2026-11-14 (owner order Part B, re-locked before the build on branch helpline-b): the expected wording is the owner's
// warm 1323 wording in the shared tap-to-call component; every other check (sizes, fit, tel links, no JS, crisis) is unchanged.
const WANT = { th: /อยากมีคนรับฟัง โทร 1323[\s\S]*พูดคุยได้ตลอด 24 ชั่วโมง กับผู้ที่พร้อมรับฟัง[\s\S]*บริการของกรมสุขภาพจิต[\s\S]*เจ็บป่วยฉุกเฉิน โทร 1669/,
  en: /someone to listen[\s\S]*1323[\s\S]*24 hours[\s\S]*Department of Mental Health[\s\S]*Medical emergency[\s\S]*1669[\s\S]*local emergency number/i,
  zh: /倾听[\s\S]*1323[\s\S]*24 小时[\s\S]*心理健康司[\s\S]*医疗急救[\s\S]*1669[\s\S]*没有经核实的泰国中文热线/ };
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
// remedy / lucky-item / plan / paid / straight-mode wording (TH / EN / ZH) that must not appear next to a support card
const MARKERS = /วิธีปรับ|ข้อแนะนำทั่วไปคือ|เคล็ด|สีมงคล|สีเสื้อมงคล|ธาตุเสริม|ทำบุญ|ดูตรง|A simple adjustment|lucky colou?r|remed|read it straight|调整的方法|幸运色|开运|直说/gi;
const vis = `(e => { if (!e) return false; const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0; })`;

/** facts about one help line on the current page */
const lineFacts = id => `(() => { const e = document.getElementById(${S(id)}); if (!e) return null; const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  return { shown: s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0, left: r.left, right: r.right, sw: e.scrollWidth, cw: e.clientWidth,
    text: e.innerText.replace(/\\s+/g, " "), html: document.documentElement.lang, w: innerWidth,
    tels: [...e.querySelectorAll('a[href^="tel:"]')].map(a => { const q = a.getBoundingClientRect();
      return { href: a.getAttribute("href"), w: q.width, h: q.height, right: q.right, left: q.left }; }) }; })()`;

/** count of marker words in the visible text of the page */
const markerCount = `((document.body.innerText || "").match(${MARKERS.toString()}) || []).length`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("every fortune page: the help line at the top and the end, TH / EN / ZH, tel 1323 + 1669 ≥ 44 px, fits 320 / 360 / 390 px", async () => {
      const bad = [];
      for (const lang of ["th", "en", "zh"]) {
        const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
        try {
          for (const p of PAGES) {
            await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
            await page.goto(`${base}/${p}.html?nosw`);
            try {
              await page.waitFor(`(() => { const e = document.getElementById("lqHelpTop"); return !!e && document.documentElement.lang === ${S(HTML_LANG[lang])} &&
                ${WANT[lang].toString()}.test(e.innerText.replace(/\\s+/g, " ")); })()`, 8000);
            } catch (e) { bad.push(`${p} ${lang}: line not in ${lang}: ` + S(await page.evaluate(lineFacts("lqHelpTop")))); continue; }
            for (const w of [390, 360, 320]) {
              if (w !== 390) { await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 780, deviceScaleFactor: 2, mobile: true }); await sleep(150); }
              for (const id of ["lqHelpTop", "lqHelpEnd"]) {
                const f = await page.evaluate(lineFacts(id));
                if (!f || !f.shown) { bad.push(`${p} ${lang} ${w}: #${id} not shown`); continue; }
                if (!WANT[lang].test(f.text)) bad.push(`${p} ${lang} ${w}: #${id} text ${f.text}`);
                if (lang !== "th" && /[฀-๿]/.test(f.text)) bad.push(`${p} ${lang} ${w}: #${id} has Thai: ${f.text}`);
                if (f.left < -0.5 || f.right > f.w + 0.5 || f.sw > f.cw + 1) {
                  bad.push(`${p} ${lang} ${w}: #${id} wider than the screen ${S({ left: f.left, right: f.right, sw: f.sw, cw: f.cw, w: f.w })}`);
                }
                const hrefs = f.tels.map(t => t.href);
                if (S(hrefs) !== S(["tel:1323", "tel:1669"])) bad.push(`${p} ${lang} ${w}: #${id} tel links ${S(hrefs)}`);
                for (const t of f.tels) {
                  if (t.w < 44 || t.h < 44) bad.push(`${p} ${lang} ${w}: #${id} ${t.href} is ${t.w.toFixed(1)}×${t.h.toFixed(1)} px`);
                  if (t.right > f.w + 0.5 || t.left < -0.5) bad.push(`${p} ${lang} ${w}: #${id} ${t.href} off screen`);
                }
              }
            }
          }
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.slice(0, 40).join("\n"));
    });

    await check("JavaScript off: every fortune page still shows the help line with tel:1323 + tel:1669 and the Thai text (static HTML)", async () => {
      const page = await browser.newPage(null);
      const bad = [];
      try {
        await page.send("Emulation.setScriptExecutionDisabled", { value: true });
        await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
        await page.send("DOM.enable");
        for (const p of PAGES) {
          await page.goto(`${base}/${p}.html?nosw`);
          const { root } = await page.send("DOM.getDocument", { depth: -1 });
          for (const id of ["lqHelpTop", "lqHelpEnd"]) {
            const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#" + id });
            if (!nodeId) { bad.push(`${p}: #${id} missing`); continue; }
            const { outerHTML } = await page.send("DOM.getOuterHTML", { nodeId });
            const txt = outerHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
            if (!WANT.th.test(txt)) bad.push(`${p}: #${id} text ${txt}`);
            let box = null;
            try { box = (await page.send("DOM.getBoxModel", { nodeId })).model; } catch (e) { /* not rendered */ }
            if (!box || box.width <= 0 || box.height <= 0) bad.push(`${p}: #${id} not rendered without JS`);
            const { nodeIds } = await page.send("DOM.querySelectorAll", { nodeId, selector: 'a[href^="tel:"]' });
            const hrefs = [];
            for (const n of nodeIds) {
              const { attributes } = await page.send("DOM.getAttributes", { nodeId: n });
              hrefs.push(attributes[attributes.indexOf("href") + 1]);
              let m = null; try { m = (await page.send("DOM.getBoxModel", { nodeId: n })).model; } catch (e) { /* not rendered */ }
              if (!m || m.width < 44 || m.height < 44) bad.push(`${p}: #${id} tel link smaller than 44 px without JS ${m ? m.width + "×" + m.height : "(not rendered)"}`);
            }
            if (S(hrefs) !== S(["tel:1323", "tel:1669"])) bad.push(`${p}: #${id} tel links ${S(hrefs)}`);
          }
        }
      } finally { await page.close(); }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.slice(0, 40).join("\n"));
    });

    await check("a reading carries the help line under it (dream, TH and EN); the printed report keeps it", async () => {
      for (const lang of ["th", "en"]) {
        const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
        try {
          await page.goto(`${base}/dream.html`);
          await page.evaluate(() => { const t = document.getElementById("drText"); t.value = "ฝันว่างูตัวใหญ่ไล่ตาม แล้วฟันหลุด"; t.dispatchEvent(new Event("input")); });
          await page.waitFor(() => document.querySelectorAll("#drSel .dr-x").length >= 1, 4000);
          await page.evaluate(() => {
          document.querySelector('input[name="drMood"][value="happy"]').click(); document.querySelector('input[name="drTime"][value="dawn"]').click(); document.getElementById("drGo").click();
        });
          await page.waitFor(() => { const b = document.getElementById("drRd-body"); return !!b && b.querySelectorAll(".fa-section").length >= 3; }, 10000);
          const r = await page.evaluate(`(() => { const b = document.getElementById("drRd-body"), l = b.querySelector(".lq-helpline"), secs = b.querySelectorAll(".fa-section");
            return { has: !!l, shown: ${vis}(l), after: !!l && !!(secs[secs.length - 1].compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING),
              text: l ? l.innerText.replace(/\\s+/g, " ") : "", tels: l ? [...l.querySelectorAll('a[href^="tel:"]')].map(a => a.getAttribute("href")) : [] }; })()`);
          assert(r.has && r.shown && r.after, lang + ": help line under the dream reading " + S(r));
          assert(WANT[lang].test(r.text), lang + ": wording " + r.text);
          assert(S(r.tels) === S(["tel:1323", "tel:1669"]), lang + ": tel links " + S(r.tels));
        } finally { await page.close(); }
      }
      const page = await browser.newPage(null, { isolated: true });
      try {
        await page.goto(`${base}/report.html`);
        await page.waitFor(() => window.__rp && document.getElementById("rpMode").textContent.length > 10, 8000);
        await page.evaluate(() => {
          document.getElementById("rpName").value = "สมชาย"; document.querySelector('[data-rp-type="report_basic"]').click();
          document.getElementById("rpAYear").value = "2533"; document.getElementById("rpGo").click();
        });
        await page.waitFor(() => document.querySelectorAll("#rpOut .rp-part").length >= 3, 10000);
        await page.send("Emulation.setEmulatedMedia", { media: "print" });
        const r = await page.evaluate(`(() => { const ls = [...document.querySelectorAll("#rpOut .lq-helpline")].filter(${vis});
          return { n: ls.length, text: ls.map(l => l.innerText.replace(/\\s+/g, " ")).join(" | "),
            tels: ls.flatMap(l => [...l.querySelectorAll('a[href^="tel:"]')].map(a => a.getAttribute("href"))) }; })()`);
        await page.send("Emulation.setEmulatedMedia", { media: "" });
        assert(r.n >= 1 && WANT.th.test(r.text), "printed report keeps the help line " + S(r));
        assert(r.tels.includes("tel:1323") && r.tels.includes("tel:1669"), "printed report tel links " + S(r.tels));
      } finally { await page.close(); }
    });

    await check("crisis state (dream hard net): asking again with harmless text shows the card again, no reading and no remedy / lucky / straight text", async () => {
      const page = await browser.newPage(null);
      try {
        await page.goto(`${base}/dream.html`);
        const base0 = await page.evaluate(markerCount);
        await page.evaluate(() => { const t = document.getElementById("drText"); t.value = "ฝันว่าฆ่าตัวตาย อยากตายจริงๆ"; t.dispatchEvent(new Event("input")); });
        await page.waitFor(() => !!document.querySelector("#drSupport .fa-support"), 4000);
        await page.evaluate(() => document.getElementById("drForm").requestSubmit());
        assert(await page.evaluate(() => document.documentElement.getAttribute("data-lq-crisis") === "1"), "page is in the crisis state");
        assert(await page.evaluate(() => window.FortuneAI.crisis.active() === true && window.FortuneAI.crisis.allow("remedy") === false &&
          window.FortuneAI.crisis.allow("paid") === false && window.FortuneAI.crisis.allow("straight") === false), "allow() says no");
        await page.evaluate(() => { const t = document.getElementById("drText"); t.value = "ฝันว่างูตัวใหญ่ไล่ตาม แล้วฟันหลุด"; t.dispatchEvent(new Event("input")); });
        await page.waitFor(() => document.querySelectorAll("#drSel .dr-x").length >= 1, 4000);
        await page.evaluate(() => {
          document.querySelector('input[name="drMood"][value="happy"]').click(); document.querySelector('input[name="drTime"][value="dawn"]').click(); document.getElementById("drGo").click();
        });
        await sleep(1500);
        const r = await page.evaluate(`(() => ({ sections: document.querySelectorAll(".fa-section").length, plan: [...document.querySelectorAll(".fa-plan")].filter(${vis}).length,
          card: [...document.querySelectorAll(".fa-support")].some(${vis}), markers: ${markerCount} }))()`);
        assert(r.sections === 0 && r.plan === 0, "no reading in the crisis state " + S(r));
        assert(r.card, "support card shown again " + S(r));
        assert(r.markers <= base0, `remedy / lucky words appeared (${r.markers} > ${base0})`);
      } finally { await page.close(); }
    });

    await check("crisis state (horoscope soft step 'talk'): a later plain name still gets the card, no reading and no lucky-colour / remedy text", async () => {
      const page = await browser.newPage(null);
      const birth = `(() => { const d = document.getElementById("hsDay"), m = document.getElementById("hsMonth"); d.value = d.options[14].value; m.value = m.options[5].value;
        document.getElementById("hsYear").value = "2533"; document.getElementById("hsForm").requestSubmit(); })()`;
      const setName = v => `(() => { const e = document.getElementById("hsName"); e.value = ${S(v)};
        e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
      try {
        await page.goto(`${base}/horoscope.html`);
        const base0 = await page.evaluate(markerCount);
        await page.evaluate(setName("เหนื่อยจนทนไม่ไหวแล้ว")); await page.evaluate(birth);
        await page.waitFor(() => !!document.querySelector("#hsResult .fa-soft [data-soft=talk]"), 15000);
        await page.evaluate(() => document.querySelector("#hsResult .fa-soft [data-soft=talk]").click());
        await page.waitFor(() => !!document.querySelector("#hsResult .fa-support"), 5000);
        assert(await page.evaluate(() => document.documentElement.getAttribute("data-lq-crisis") === "1"), "talk path sets the crisis state");
        await page.evaluate(setName("สมชาย")); await page.evaluate(birth);
        await sleep(2500);
        const r = await page.evaluate(`(() => ({ sections: document.querySelectorAll(".fa-section").length,
          card: [...document.querySelectorAll("#hsResult .fa-support")].some(${vis}), markers: ${markerCount},
          tabs: ["pn-th", "pn-bz", "pn-nu", "pn-td"].map(id => { const e = document.getElementById(id); return e ? e.innerText.trim().length : 0; }) }))()`);
        assert(r.sections === 0, "no reading after the talk path " + S(r));
        assert(r.card, "support card still shown " + S(r));
        assert(r.markers <= base0, `remedy / lucky words appeared (${r.markers} > ${base0}) ${S(r)}`);
      } finally { await page.close(); }
    });

    await check("crisis state hides data-lq-remedy blocks (faceread lucky tips, recommendations, lead form, share)", async () => {
      const page = await browser.newPage(null);
      try {
        await page.goto(`${base}/faceread.html`);
        await page.waitFor(() => !!window.FortuneAI, 8000);
        const before = await page.evaluate(() => { ["frReco", "frLead"].forEach(id => document.getElementById(id).removeAttribute("hidden"));
          return [".fr-lucky", "#frReco", "#frLead"].map(s => getComputedStyle(document.querySelector(s)).display); });
        assert(before.every(d => d !== "none"), "blocks display before the crisis " + S(before));
        await page.evaluate(() => { const d = document.createElement("div"); document.body.appendChild(d); window.FortuneAI.crisis.render(d, window.FortuneAI.crisis.result({ lang: "th" })); });
        const after = await page.evaluate(() => [".fr-lucky", "#frReco", "#frLead", "#frShare"].map(s => getComputedStyle(document.querySelector(s)).display));
        assert(after.every(d => d === "none"), "blocks hidden in the crisis state " + S(after));
      } finally { await page.close(); }
    });
  } finally {
    await browser.close();
  }
}
