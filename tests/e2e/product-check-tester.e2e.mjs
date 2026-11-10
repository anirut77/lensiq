// tests/e2e/product-check-tester.e2e.mjs — medicine.html with the closed-test tester gate (deploy plan B3 / B7 / B8;
// lensiq-tester.js, window.LENSIQ_TESTER_GATE = true as the public site's deploy config sets it).
//   1. an ordinary visitor (no ?tester=1): no tester card, no "ask AI" step, NO request to any AI or tester route; the
//      official-lookup tap sends no tester header and the testing-only sources read "could not check" with the
//      closed-test reason while an open source still answers;
//   2. ?tester=1: the card; a short code is refused on the device (no request), a wrong code is refused by the Worker and
//      the AI step stays hidden; the right code opens the step; the code travels in a header only, is kept in
//      sessionStorage only and is never in the address;
//   3. rotation / revocation: when the Worker stops accepting the kept code, it is forgotten and the AI step hides again;
//      "Forget" does the same on request;
//   4. kill switch and daily cap answers: lookups read "could not check" with their own reason;
//   5. English / 中文: the card, the tester notes and the privacy note carry no Thai text; phone widths 320 / 360 / 390:
//      the card does not overflow.
// Without the gate flag the page is covered, unchanged, by product-check-ai.e2e.mjs and product-check-lookup.e2e.mjs.
// Fake Worker only (no key, no provider, no real request). Synthetic label text.
import { assert } from "./cdp.mjs";

const CODE = "tester-code-e2e-2026";
const LABEL = "TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nรักษาหายขาด 100% ไม่มีผลข้างเคียง";
const INIT = "window.confirm=()=>true;window.print=()=>{};window.__LQ_FAKE_FACE=s=>[];";
// fake Worker with the gate: every call is recorded with its headers
const NET = `window.LENSIQ_API_BASE="https://api.example.test";window.LENSIQ_TESTER_GATE=true;window.LENSIQ_ANALYTICS=false;window.LENSIQ_MEMBER=false;
  window.__calls=[];window.__mode="";
  const J=(o,s)=>new Response(JSON.stringify(o),{status:s||200,headers:{"Content-Type":"application/json"}});
  const P={provider:"openrouter",model:"anthropic/claude-haiku-5.5",name:{th:"OpenRouter (ตัวกลาง)",en:"OpenRouter (router)",zh:"OpenRouter（路由）"},
    region:{th:"ไม่กำหนด",en:"varies",zh:"不固定"},retention:{th:"ไม่เก็บ",en:"zero retention",zh:"零保留"},
    routed:{slug:"google-vertex",name:{th:"Google Cloud Vertex AI",en:"Google Cloud Vertex AI",zh:"Google Cloud Vertex AI"},
      region:{th:"นอกประเทศไทย",en:"outside Thailand",zh:"泰国境外"}}};
  const realFetch=window.fetch.bind(window);
  window.fetch=async(u,init)=>{const url=String(u);if(!url.startsWith("https://api.example.test"))return realFetch(u,init);
    const h=Object.fromEntries(Object.entries((init&&init.headers)||{}).map(([k,v])=>[k.toLowerCase(),v]));
    const m=(init&&init.method)||"GET";window.__calls.push({url,m,h,rp:(init&&init.referrerPolicy)||"",b:init&&init.body?String(init.body):""});
    const p=new URL(url),ok=h["x-tester-code"]===${JSON.stringify(CODE)}&&window.__mode!=="revoked";
    if(window.__mode==="off")return J({off:true,fallback:true,reason:"service_off"},503);
    if(window.__mode==="cap")return J({fallback:true,reason:"daily_cap",code:"daily_cap"},429);
    if(window.__mode==="origin")return J({error:"origin not allowed"},403);
    if(p.pathname==="/v1/tester/check")return ok?J({ok:true,required:true}):J({fallback:true,reason:"tester_required"},403);
    if(p.pathname==="/v1/ai/providers")return ok?J({feature:p.searchParams.get("feature"),enabled:p.searchParams.get("feature")==="pc_fields",imageModeAllowed:false,stores:false,chain:[P]})
      :J({feature:p.searchParams.get("feature"),enabled:false,tester:true,chain:[]});
    if(p.pathname==="/api/med/thfda")return ok?J({source:"Thai FDA",fetched:"2026-11-10T03:00:00Z",q:"x",rows:[]}):J({could_not_check:true,reason:"tester_required"},503);
    if(p.pathname==="/api/pc/batch"){const L=JSON.parse(init.body).lookups;
      return J({ok:true,results:L.map(x=>["thfda","safetygate","rasff"].includes(x.source)&&!ok
        ?{status:503,source:x.source,ok:false,could_not_check:true,reason:"tester_required",testing_only:true}
        :{status:200,source:x.source,ok:true,found:0,total:0,items:[],fetched:"2026-11-10T03:00:00Z",credit:"LQ TEST credit",testing_only:false})});}
    return J({fallback:true,reason:"tester_required"},403);};`;
const openTab = page => page.evaluate(() => { document.querySelector("#t-pc").click(); return !document.querySelector("#tab-pc").hidden; });
async function setLabel(page, text) {
  await page.evaluate(t => { const s = window.__LQ_PC.st; s.ocr = { text: t, lines: t.split("\n"), script: "th", ms: { total: 1 } }; s.text = t; s.read = true;
    window.__LQ_PC.reparse(); }, text);
  await page.waitFor(`window.__LQ_PCL && window.__LQ_PCL.st.text === ${JSON.stringify(text)} && !!window.__LQ_PCL.st.local`, 15000);
}
const calls = (page, re) => page.evaluate(re => window.__calls.filter(c => new RegExp(re).test(c.url)), re);
const enter = (page, code) => page.evaluate(c => { document.querySelector("#lqTesterCode").value = c; document.querySelector("#lqTesterUse").click(); }, code);
const THAI = /[฀-๿]/;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("tester gate: an ordinary visitor sees the page as before: no card, no AI step, no AI / tester request; testing-only sources say 'could not check'", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
      await page.goto(`${base}/medicine.html?fakeface`);
      await openTab(page);
      await setLabel(page, LABEL);
      await page.waitFor(`document.querySelector("#pcLookupGo")`, 15000);
      const st = await page.evaluate(() => ({ card: document.querySelector("#lqTesterSlot").children.length, go: !!document.querySelector("#pcAiGo"),
        slot: (document.querySelector("#pcAiSlot") || { innerHTML: "" }).innerHTML, gate: window.LQTester.gate(), unlocked: window.LQTester.unlocked() }));
      assert(st.gate && !st.unlocked, "the gate is on and locked");
      assert(st.card === 0, "no tester card for an ordinary visitor");
      assert(!st.go && st.slot === "", "no 'ask AI' step");
      assert((await calls(page, "/v1/")).length === 0, "no request to /v1/ai or /v1/tester");
      await page.evaluate(() => document.querySelector("#pcLookupGo").click());
      await page.waitFor(`document.querySelector("#pcLookupRows")`, 15000);
      const batch = await calls(page, "/api/pc/batch");
      assert(batch.length === 1 && !("x-tester-code" in batch[0].h), "one lookup call, without a tester header");
      const cant = await page.evaluate(() => [...document.querySelectorAll("#pcLookupCant li")].map(l => l.textContent));
      assert(cant.some(t => /อย\./.test(t) && /เปิดให้เฉพาะกลุ่มผู้ทดสอบ/.test(t)), "Thai FDA registry reads 'could not check: closed tester group': " + cant.join(" | "));
      assert(!cant.some(t => /openFDA/.test(t)), "an open source is not in the could-not-check list: " + cant.join(" | "));
      assert((await calls(page, "/v1/")).length === 0, "still no AI / tester request after the lookup");
    });

    await check("tester gate: ?tester=1 shows the card; short and wrong codes are refused; the right code opens the AI step; header only, session only", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
      await page.goto(`${base}/medicine.html?fakeface&tester=1`);
      await openTab(page);
      await setLabel(page, LABEL);
      await page.waitFor(`document.querySelector("#lqTesterCode")`, 8000);
      assert(await page.evaluate(() => document.querySelector("#lqTesterCode").type === "password"), "password-type field");
      assert(!(await page.evaluate(() => !!document.querySelector("#pcAiGo"))), "no AI step before a code");
      await enter(page, "short");
      await page.waitFor(`/16/.test(document.querySelector("#lqTesterMsg").textContent)`, 4000);
      assert((await calls(page, "/v1/tester/check")).length === 0, "a short code is not sent");
      await enter(page, "wrong-code-e2e-000000");
      await page.waitFor(`document.querySelector("#lqTesterMsg") && /ไม่ถูกต้อง/.test(document.querySelector("#lqTesterMsg").textContent)`, 8000);
      assert(!(await page.evaluate(() => !!document.querySelector("#pcAiGo") || window.LQTester.unlocked())), "a wrong code opens nothing");
      await enter(page, CODE);
      await page.waitFor(`document.querySelector("#lqTesterState") && document.querySelector("#pcAiGo")`, 8000);
      const st = await page.evaluate(code => ({ session: sessionStorage.getItem("lq-tester") === code, local: JSON.stringify({ ...localStorage }).includes(code),
        url: location.href.includes(code), html: document.documentElement.outerHTML.includes(code) }), CODE);
      assert(st.session && !st.local && !st.url && !st.html, "kept in sessionStorage only; not in localStorage, the address or the page: " + JSON.stringify(st));
      const chk = await calls(page, "/v1/tester/check");
      assert(chk.every(c => c.m === "POST" && c.b === "{}" && !c.url.includes("?")), "the check carries the code in a header only");
      // ask AI: the consent data request carries the header, and the screen names the router AND the serving provider
      await page.evaluate(() => document.querySelector("#pcAiGo").click());
      await page.waitFor(`document.querySelector("dialog.lq-ai-consent") && document.querySelector("dialog.lq-ai-consent").open`, 8000);
      const d = await page.evaluate(() => document.querySelector("dialog.lq-ai-consent").innerText);
      assert(/OpenRouter/.test(d) && /Google Cloud Vertex AI/.test(d) && /นอกประเทศไทย/.test(d) && /claude-haiku-5\.5/.test(d),
        "consent names OpenRouter, the serving provider, place and model: " + d);
      const prov = await calls(page, "/v1/ai/providers");
      assert(prov.length >= 1 && prov.every(c => c.h["x-tester-code"] === CODE), "consent data asked with the tester header");
      await page.evaluate(() => document.querySelector("dialog.lq-ai-consent button[value=cancel]").click());
      // the lookup tap now carries the header too
      await page.waitFor(`document.querySelector("#pcLookupGo")`, 8000);
      await page.evaluate(() => document.querySelector("#pcLookupGo").click());
      await page.waitFor(`document.querySelector("#pcLookupRows")`, 15000);
      assert((await calls(page, "/api/pc/batch"))[0].h["x-tester-code"] === CODE, "a tester's lookup carries the header");
      assert(!(await page.evaluate(() => [...document.querySelectorAll("#pcLookupCant li")].some(l => /ผู้ทดสอบ/.test(l.textContent)))), "testing-only sources answer a tester");
    });

    await check("tester gate: a rotated / revoked code is forgotten and the AI step hides again; 'Forget' does the same", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, NET, `sessionStorage.setItem("lq-tester", ${JSON.stringify(CODE)});`], isolated: true });
      await page.goto(`${base}/medicine.html?fakeface`);
      await openTab(page);
      await setLabel(page, LABEL);
      await page.waitFor(`document.querySelector("#pcAiGo") && document.querySelector("#lqTesterState")`, 8000);
      await page.evaluate(() => { window.__mode = "revoked"; document.querySelector("#pcAiGo").click(); });
      await page.waitFor(`!document.querySelector("#pcAiGo") && !window.LQTester.unlocked()`, 8000);
      const st = await page.evaluate(() => ({ kept: sessionStorage.getItem("lq-tester"), dialog: !!document.querySelector("dialog.lq-ai-consent"),
        posts: window.__calls.filter(c => c.m === "POST" && /\/v1\/ai\//.test(c.url)).length }));
      assert(st.kept === null && !st.dialog && st.posts === 0, "code forgotten, no consent screen, nothing sent: " + JSON.stringify(st));
      // the code works again (new session), then the tester forgets it
      await page.evaluate(code => { window.__mode = ""; sessionStorage.setItem("lq-tester", code); }, CODE);
      await page.goto(`${base}/medicine.html?fakeface`);
      await openTab(page);
      await setLabel(page, LABEL);
      await page.waitFor(`document.querySelector("#lqTesterForget") && document.querySelector("#pcAiGo")`, 8000);
      await page.evaluate(() => document.querySelector("#lqTesterForget").click());
      await page.waitFor(`!document.querySelector("#pcAiGo")`, 4000);
      assert(await page.evaluate(() => sessionStorage.getItem("lq-tester") === null && document.querySelector("#lqTesterSlot").children.length === 0),
        "forgotten; the card is gone without ?tester=1");
    });

    await check("a revoked code is forgotten by the lookups too (not sent again)", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, NET, `sessionStorage.setItem("lq-tester", ${JSON.stringify(CODE)});`], isolated: true });
      await page.goto(`${base}/medicine.html?fakeface`);
      await openTab(page);
      await setLabel(page, LABEL);
      await page.waitFor(`document.querySelector("#pcLookupGo") && document.querySelector("#pcAiGo")`, 15000);
      await page.evaluate(() => { window.__mode = "revoked"; document.querySelector("#pcLookupGo").click(); });
      await page.waitFor(`document.querySelector("#pcLookupRows") && !window.LQTester.unlocked()`, 15000);
      const st = await page.evaluate(() => ({ kept: sessionStorage.getItem("lq-tester"), go: !!document.querySelector("#pcAiGo") }));
      assert(st.kept === null && !st.go, "the lookup's refusal forgot the code and hid the AI step: " + JSON.stringify(st));
      const first = (await calls(page, "/api/pc/batch"))[0];
      assert(first.h["x-tester-code"] === CODE && first.rp !== "no-referrer-when-downgrade" && first.rp !== "unsafe-url", "the code was sent once; the referrer is not widened: " + first.rp);
      // the medicine checker's Thai registration lookup: same rule
      await page.evaluate(code => { window.__mode = ""; sessionStorage.setItem("lq-tester", code); }, CODE);
      await page.goto(`${base}/medicine.html?fakeface`);
      await page.evaluate(() => {
        window.__mode = "revoked"; document.querySelector("#mdOnline").click(); document.querySelector("#mdQ").value = "1A 15/50"; document.querySelector("#mdCheck").click();
      });
      await page.waitFor(`!window.LQTester.unlocked() && /เปิดให้เฉพาะกลุ่มผู้ทดสอบ/.test(document.querySelector("#mdOut").innerText)`, 15000);
      const med = await calls(page, "/api/med/thfda");
      assert(med.length === 1 && med[0].h["x-tester-code"] === CODE, "one call, with the code");
      assert(await page.evaluate(() => sessionStorage.getItem("lq-tester") === null), "forgotten after the refusal");
    });

    await check("medicine checker: a visitor's Thai registration lookup is NOT sent; the card says 'closed tester group' in TH / EN / ZH (not 'search failed')", async () => {
      for (const [lang, re] of [["th", /เปิดให้เฉพาะกลุ่มผู้ทดสอบ/], ["en", /closed tester group/], ["zh", /封闭测试小组/]]) {
        const page = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
        await page.goto(`${base}/medicine.html?fakeface&lang=${lang}`);
        await page.evaluate(() => { document.querySelector("#mdOnline").click(); document.querySelector("#mdQ").value = "1A 15/50"; document.querySelector("#mdCheck").click(); });
        await page.waitFor(`${re}.test(document.querySelector("#mdOut").innerText)`, 15000);
        const out = await page.evaluate(() => document.querySelector("#mdOut").innerText);
        assert(!/ค้นไม่สำเร็จ|Search failed|查询失败/.test(out), lang + ": not the 'search failed' message: " + out.slice(0, 200));
        if (lang !== "th") assert(!THAI.test(out.replace(/อย\./g, "")), lang + ": no Thai text in the result: " + out.slice(0, 200));
        assert((await calls(page, "/api/med/thfda")).length === 0, lang + ": the gated endpoint is not called without a code");
        assert((await calls(page, "/v1/")).length === 0, lang + ": no AI / tester request");
        await page.close();
      }
    });

    await check("tester card: a refusal that is NOT about the code never says 'code not correct' (TH / EN / ZH); the right code then still works", async () => {
      for (const [lang, wrong, refused, cap] of [["th", /รหัสไม่ถูกต้อง/, /ไม่ได้แปลว่ารหัสผิด/, /พรุ่งนี้/], ["en", /not correct/, /does not mean the code is wrong/, /tomorrow/], ["zh",
        /代码不正确/, /不表示代码错误/, /明天/]]) {
        const page = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
        await page.goto(`${base}/medicine.html?fakeface&tester=1&lang=${lang}`);
        await openTab(page);
        await page.waitFor(`document.querySelector("#lqTesterCode")`, 8000);
        const msg = () => page.evaluate(() => document.querySelector("#lqTesterMsg").textContent);
        for (const [mode, re] of [["origin", refused], ["cap", cap], ["off", null]]) {
          await page.evaluate(m => { window.__mode = m; document.querySelector("#lqTesterMsg").textContent = ""; }, mode);
          await enter(page, CODE);
          await page.waitFor(`document.querySelector("#lqTesterMsg") && document.querySelector("#lqTesterMsg").textContent.length > 3`, 8000);
          const t = await msg();
          assert(!wrong.test(t), `${lang} / ${mode}: the right code is not called wrong: ${t}`);
          if (re) assert(re.test(t), `${lang} / ${mode}: says what happened: ${t}`);
          assert(!(await page.evaluate(() => window.LQTester.unlocked())), "still locked while the server refuses");
        }
        await page.evaluate(() => { window.__mode = ""; });
        await enter(page, "wrong-code-e2e-000000");
        await page.waitFor(`${wrong}.test(document.querySelector("#lqTesterMsg").textContent)`, 8000);
        await enter(page, CODE);
        await page.waitFor(`document.querySelector("#lqTesterState")`, 8000);
        await page.close();
      }
    });

    await check("kill switch / daily cap: lookups read 'could not check' with their own reason and the page keeps its on-device results", async () => {
      for (const [mode, re] of [["off", /ปิดชั่วคราว/], ["cap", /พรุ่งนี้/]]) {
        const page = await browser.newPage(null, { initScripts: [INIT, NET, `window.__mode=${JSON.stringify(mode)};`], isolated: true });
        await page.goto(`${base}/medicine.html?fakeface`);
        await openTab(page);
        await setLabel(page, LABEL);
        await page.waitFor(`document.querySelector("#pcLookupGo")`, 15000);
        await page.evaluate(() => document.querySelector("#pcLookupGo").click());
        await page.waitFor(`document.querySelector("#pcLookupCant")`, 15000);
        const cant = await page.evaluate(() => [...document.querySelectorAll("#pcLookupCant li")].map(l => l.textContent));
        assert(cant.length > 0 && cant.every(t => re.test(t)), `${mode}: every remote row says why: ` + cant.join(" | "));
        assert(await page.evaluate(() => !!document.querySelector("#pcLookup") && !!window.__LQ_PCL.st.local), mode + ": the on-device part of the card is still there");
        await page.close();
      }
    });

    await check("tester card in English / 中文: no Thai text; names the processors; phone widths: no overflow", async () => {
      for (const lang of ["en", "zh"]) {
        const page = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
        await page.goto(`${base}/medicine.html?fakeface&tester=1&lang=${lang}`);
        await openTab(page);
        await page.waitFor(`document.querySelector("#lqTesterCode")`, 8000);
        await page.evaluate(() => document.querySelectorAll("#lqTesterSlot details").forEach(d => { d.open = true; }));
        let text = await page.evaluate(() => document.querySelector("#lqTesterSlot").innerText);
        assert(!THAI.test(text), `${lang}: no Thai in the card: ` + text.slice(0, 200));
        assert(text.includes("Cloudflare") && !/OpenRouter|Vertex|Azure/.test(text), `${lang}: before a code is entered the note names no AI processor by itself: ` + text.slice(-300));
        await enter(page, "wrong-code-e2e-000000");
        await page.waitFor(`document.querySelector("#lqTesterMsg") && document.querySelector("#lqTesterMsg").textContent.length > 3`, 8000);
        await enter(page, CODE);
        await page.waitFor(`document.querySelector("#lqTesterState")`, 8000);
        // once the tester is in, the processors are listed from the configured chains (the fake Worker's: OpenRouter -> Vertex)
        await page.waitFor(`document.querySelector("#lqTesterProcs")`, 8000);
        await page.evaluate(() => document.querySelectorAll("#lqTesterSlot details").forEach(d => { d.open = true; }));
        text = await page.evaluate(() => document.querySelector("#lqTesterSlot").innerText);
        assert(/OpenRouter/.test(text) && /Google Cloud Vertex AI/.test(text), `${lang}: the configured processors are listed: ` + text.slice(-300));
        assert(!THAI.test(text), `${lang}: no Thai after unlocking: ` + text.slice(0, 200));
        await page.close();
      }
      const page = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
      for (const w of [320, 360, 390]) {
        await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 1, mobile: true });
        await page.goto(`${base}/medicine.html?fakeface&tester=1`);
        await openTab(page);
        await page.waitFor(`document.querySelector("#lqTesterCode")`, 8000);
        const m = await page.evaluate(() => { document.querySelectorAll("#lqTesterSlot details").forEach(d => { d.open = true; });
          const c = document.querySelector("#lqTesterSlot .lq-tester").getBoundingClientRect(); const b = document.querySelector("#lqTesterUse").getBoundingClientRect();
          return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, right: Math.max(c.right, b.right), btnH: b.height }; });
        assert(m.sw <= m.iw + 1 && m.right <= m.iw + 1, `${w}px: no horizontal overflow: ` + JSON.stringify(m));
        assert(m.btnH >= 40, `${w}px: the button is a usable touch target: ${m.btnH}`);
      }
    });
  } finally { await browser.close(); }
}
