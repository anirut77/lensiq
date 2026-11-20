// tests/e2e/device-data-d4.e2e.mjs — owner decision D-4 (2026-11-19): save the data this browser keeps for LENSIQ to a file
// and load it on another address (docs/PRODUCTION-MOVE-PLAN.md §2.7). privacy.html + lensiq-device-data.js.
// Locked BEFORE the product code (evals-locks/device-data-d4.sha256).
//   1. switch off (the shipped default) and customer lock: the slot stays hidden and empty, nothing is drawn;
//   2. switch on: the file holds the settings and the 18+ choice by default, records only when ticked, never the sign-in
//      token, the tester code, consents, owner keys or business stores; saving makes NO network request;
//   3. load the file in a clean browser: preview first, nothing written before "apply"; the 18+ choice is written only
//      after the person ticks 18+ again; unknown keys are never written; a bad file writes nothing and says why;
//   4. English / 中文: no Thai text in the section; phone widths 320 / 360 / 390: no horizontal overflow.
// Synthetic values only (canary strings); no images.
import { assert } from "./cdp.mjs";

const THAI = /[฀-๿]/;
const INIT = "window.confirm=()=>true;window.__blobs=[];window.__names=[];" +
  "(()=>{const c=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{window.__blobs.push(b);return c(b);};" +
  "const k=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__names.push(this.download);return;}return k.call(this);};})();";
const ON = "window.LENSIQ_DEVICE_EXPORT=true;";
const SEED = `if(!sessionStorage.getItem("__seeded")){sessionStorage.setItem("__seeded","1");const s={
  "lq-lang":"th","lq-sol-filter":"pilot","lq-nut-hide-kcal":"1","lq-merit-tradition":"chinese_folk",
  "lq-fortune-straight":JSON.stringify({adult:true,straight:false}),
  "lq-med-history":JSON.stringify([{at:1763600000000,kind:"reg",q:"1A 844/39",r:"TH"}]),
  "lq-pet-zodiac-v1":JSON.stringify({v:1,found:{rat:"2026-11-20"}}),
  "lq-member-session":"tok-canary-abc","lq-owner":"owner-canary","lq-ai-consent":"{\\"pc_fields\\":true}",
  "lensiq-timeclock":"{\\"emp\\":[\\"canary-employee\\"]}","lq-research-demo":"on"};
  for(const k in s)localStorage.setItem(k,s[k]);sessionStorage.setItem("lq-tester","tester-canary-xyz-123456");}`;
const fileOf = text => `(() => { const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(text)}], "lensiq-device-data.json", { type: "application/json" }));
  const i = document.querySelector("#lqDdFile"); i.files = dt.files; i.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("device data: switch off (default) and customer lock draw nothing", async () => {
      for (const extra of ["", ON + "window.LENSIQ_RESEARCH_DEMO=false;"]) {
        const page = await browser.newPage(null, { initScripts: [INIT, SEED, extra], isolated: true });
        await page.goto(`${base}/privacy.html`);
        await page.waitFor(`!!window.LQDeviceData`, 8000);
        const st = await page.evaluate(() => { const s = document.querySelector("#lqDeviceData"); return { hidden: s.hidden, n: s.children.length, text: s.textContent.trim() }; });
        assert(st.hidden && st.n === 0 && st.text === "", (extra ? "customer lock" : "default") + ": slot hidden and empty: " + JSON.stringify(st));
        await page.close();
      }
    });

    let saved = "";
    await check("device data: save the file (settings + 18+ by default; records when ticked); nothing private; no request", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, SEED, ON], isolated: true });
      await page.goto(`${base}/privacy.html`);
      await page.waitFor(`document.querySelector("#lqDdSave")`, 8000);
      assert(await page.evaluate(() => !document.querySelector("#lqDeviceData").hidden), "slot shown");
      const before = await page.evaluate(() => performance.getEntriesByType("resource").length);
      await page.evaluate(() => document.querySelector("#lqDdSave").click());
      await page.waitFor(`window.__blobs.length === 1`, 4000);
      let j = JSON.parse(await page.evaluate(() => window.__blobs[0].text()));
      assert(j.format === "lensiq-device-data" && j.version === 1, "format");
      assert(JSON.stringify(Object.keys(j.items).sort()) === JSON.stringify(["lq-fortune-straight", "lq-lang", "lq-merit-tradition", "lq-nut-hide-kcal", "lq-sol-filter"]),
        "default groups: " + Object.keys(j.items).join(","));
      assert(/^lensiq-device-data-\d{4}-\d\d-\d\d\.json$/.test(await page.evaluate(() => window.__names[0])), "file name");
      await page.evaluate(() => { const r = document.querySelector("#lqDdG-records"); r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); document.querySelector("#lqDdSave").click(); });
      await page.waitFor(`window.__blobs.length === 2`, 4000);
      saved = await page.evaluate(() => window.__blobs[1].text());
      j = JSON.parse(saved);
      assert("lq-med-history" in j.items && "lq-pet-zodiac-v1" in j.items, "records when ticked");
      for (const c of ["tok-canary", "owner-canary", "pc_fields", "canary-employee", "tester-canary", "lq-research-demo"]) assert(!saved.includes(c), "not in the file: " + c);
      const after = await page.evaluate(() => performance.getEntriesByType("resource").filter(e => !/^blob:/.test(e.name)).length);
      assert(after === before, `no network request while saving (${before} -> ${after})`);
      await page.close();
    });

    await check("device data: load the file in a clean browser: preview, 18+ re-confirmation, apply", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, ON], isolated: true });
      await page.goto(`${base}/privacy.html`);
      await page.waitFor(`document.querySelector("#lqDdFile")`, 8000);
      await page.evaluate(fileOf(saved));
      await page.waitFor(`document.querySelector("#lqDdApply") && !document.querySelector("#lqDdApply").disabled`, 4000);
      const pre = await page.evaluate(() => ({ list: document.querySelector("#lqDdPreview").textContent, adult: !!document.querySelector("#lqDdAdult"), lang: localStorage.getItem("lq-lang") }));
      assert(pre.adult, "18+ box shown because the file carries an 18+ confirmation");
      assert(pre.lang === null, "nothing written before apply");
      await page.evaluate(() => document.querySelector("#lqDdApply").click());
      await page.waitFor(`localStorage.getItem("lq-lang") === "th"`, 4000);
      let st = await page.evaluate(() => ({ s: localStorage.getItem("lq-fortune-straight"), m: localStorage.getItem("lq-med-history"), msg: document.querySelector("#lqDdImpMsg").textContent }));
      assert(st.s === null, "18+ choice not written without the box");
      assert(st.m && st.msg.trim(), "records written; a message says what happened");
      await page.evaluate(fileOf(saved));
      await page.waitFor(`document.querySelector("#lqDdAdult")`, 4000);
      await page.evaluate(() => { document.querySelector("#lqDdAdult").checked = true; document.querySelector("#lqDdApply").click(); });
      await page.waitFor(`localStorage.getItem("lq-fortune-straight") !== null`, 4000);
      st = await page.evaluate(() => JSON.parse(localStorage.getItem("lq-fortune-straight")));
      assert(st.adult === true && st.straight === false, "18+ choice written after the box: " + JSON.stringify(st));
      await page.close();
    });

    await check("device data: hostile and bad files", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, ON], isolated: true });
      await page.goto(`${base}/privacy.html`);
      await page.waitFor(`document.querySelector("#lqDdFile")`, 8000);
      const hostile = JSON.stringify({ format: "lensiq-device-data", version: 1, exportedAt: "2026-11-21T00:00:00.000Z", groups: ["settings"],
        items: { "lq-lang": "en", "lq-member-session": "stolen", "lq-research-demo": "on" } });
      await page.evaluate(fileOf(hostile));
      await page.waitFor(`document.querySelector("#lqDdApply") && !document.querySelector("#lqDdApply").disabled`, 4000);
      await page.evaluate(() => document.querySelector("#lqDdApply").click());
      await page.waitFor(`localStorage.getItem("lq-lang") === "en"`, 4000);
      assert(await page.evaluate(() => localStorage.getItem("lq-member-session") === null && localStorage.getItem("lq-research-demo") === null), "unknown keys never written");
      await page.evaluate(() => localStorage.clear());
      const bad = JSON.stringify({ format: "lensiq-device-data", version: 1, exportedAt: "2026-11-21T00:00:00.000Z", groups: ["settings"], items: { "lq-lang": "en", "lq-sol-filter": "<script>" } });
      await page.evaluate(fileOf(bad));
      await page.waitFor(`document.querySelector("#lqDdImpMsg") && document.querySelector("#lqDdImpMsg").textContent.trim().length > 3`, 4000);
      const st = await page.evaluate(() => ({ apply: document.querySelector("#lqDdApply"), n: localStorage.length }));
      assert(st.n === 0, "a bad file writes nothing");
      await page.evaluate(fileOf("not json"));
      await page.waitFor(`document.querySelector("#lqDdImpMsg").textContent.trim().length > 3`, 4000);
      assert(await page.evaluate(() => localStorage.length === 0), "still nothing written");
      await page.close();
    });

    await check("device data in English / 中文: no Thai; phone widths: no overflow", async () => {
      for (const lang of ["en", "zh"]) {
        const page = await browser.newPage(null, { initScripts: [INIT, SEED, ON], isolated: true });
        await page.goto(`${base}/privacy.html?lang=${lang}`);
        await page.waitFor(`document.querySelector("#lqDdSave")`, 8000);
        await page.evaluate(fileOf(saved));
        await page.waitFor(`document.querySelector("#lqDdAdult")`, 4000);
        const text = await page.evaluate(() => document.querySelector("#lqDeviceData").innerText);
        assert(!THAI.test(text), `${lang}: no Thai in the section: ` + text.slice(0, 300));
        await page.close();
      }
      const page = await browser.newPage(null, { initScripts: [INIT, SEED, ON], isolated: true });
      for (const w of [320, 360, 390]) {
        await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 1, mobile: true });
        await page.goto(`${base}/privacy.html`);
        await page.waitFor(`document.querySelector("#lqDdSave")`, 8000);
        await page.evaluate(fileOf(saved));
        await page.waitFor(`document.querySelector("#lqDdAdult")`, 4000);
        // the section and everything in it stay inside the screen (the rest of privacy.html is covered by its own suites)
        const m = await page.evaluate(() => { const s = document.querySelector("#lqDeviceData"), b = document.querySelector("#lqDdSave").getBoundingClientRect();
          const right = Math.max(s.getBoundingClientRect().right, ...[...s.querySelectorAll("*")].map(e => e.getBoundingClientRect().right));
          return { sw: s.scrollWidth, cw: s.clientWidth, iw: window.innerWidth, right, btnH: b.height }; });
        assert(m.sw <= m.cw + 1 && m.right <= m.iw + 1, `${w}px: no horizontal overflow: ` + JSON.stringify(m));
        assert(m.btnH >= 40, `${w}px: the button is a usable touch target: ${m.btnH}`);
      }
    });
  } finally { await browser.close(); }
}
