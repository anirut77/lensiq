// tests/e2e/product-check-travel-release.e2e.mjs — P9 release (owner decisions 2026-11-12): the travel card shows the measured
// INN numbers and "may be incomplete" in TH / EN / ZH (text generated from docs/accuracy-figures.json); a DPD result on the
// risk-signal card carries the Open Government Licence – Canada attribution in the page language; Thai equivalents off.
// Fake Worker only; synthetic text.
import { assert } from "./cdp.mjs";
import { coverage } from "./gate.e2e.mjs";

const INIT = "window.confirm=()=>true;window.print=()=>{};";
const CA = "LQ TEST EXTRA STRENGTH\nActive ingredient: Acetaminophen 500 mg\nDIN 01234567\nProduct of Canada";
const NET = `window.LENSIQ_API_BASE="https://api.example.test";window.__pcCalls=[];window.__LQ_PC_FETCH=async(u,init)=>{const L=JSON.parse((init&&init.body)||"{}").lookups||[];
  window.__pcCalls.push(L);const results=L.map(x=>x.source==="dpd"?{status:200,source:"dpd",ok:true,found:1,total:1,fetched:"2026-11-12T03:00:00Z",
    items:[{ref:"01234567",title:"LQ TEST EXTRA STRENGTH",holder:"LQ TEST PHARMA INC.",status:"Marketed",date:"2025-09-25",
      url:"https://health-products.canada.ca/dpd-bdpp/info?lang=eng&code=1"}],
    credit:"Contains information licensed under the Open Government Licence – Canada. Source: Health Canada Drug Product Database."}
    :{status:200,source:x.source,ok:true,found:0,total:0,items:[],fetched:"2026-11-12T03:00:00Z"});
  return new Response(JSON.stringify({ok:true,results}),{status:200,headers:{"Content-Type":"application/json"}});};`;
const openTab = page => page.evaluate(() => { document.querySelector("#t-pc").click(); return true; });
const WANT = { th: /recall 0\.811 \(n = 173 ฉลากสังเคราะห์ วัดโดยผู้ตรวจอิสระ\) precision 0\.971.*อาจไม่ครบ/,
  en: /INN recall 0\.811 \(n = 173, synthetic, independent\), precision 0\.971.*may be incomplete/,
  zh: /INN 召回率 0\.811（n = 173，合成数据，独立测试），精确率 0\.971.*可能不完整/ };
const ATTR = { th: /มีข้อมูลภายใต้สัญญาอนุญาต Open Government Licence – Canada/, en: /^Contains information licensed under the Open Government Licence – Canada/,
  zh: /Open Government Licence – Canada/ };

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("pc-travel release: measured INN numbers + 'may be incomplete' on the card; DPD attribution in TH / EN / ZH; equivalents off", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
      for (const lang of ["th", "en", "zh"]) {
        await page.goto(`${base}/medicine.html${lang === "th" ? "" : "?lang=" + lang}`);
        await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
        await openTab(page);
        await page.evaluate(t => window.__LQ_PCL.run(t, []), CA);
        await page.waitFor(`document.querySelector("#pcTravel #pcTravelAcc")`, 15000);
        const acc = await page.evaluate(() => document.querySelector("#pcTravelAcc").innerText);
        assert(WANT[lang].test(acc), `${lang} accuracy line: ${acc}`);
        assert(await page.evaluate(() => document.querySelector("#pcTravelEq").dataset.state === "off"), lang + " equivalents off");
        await page.evaluate(() => document.querySelector("#pcLookupGo").click());
        await page.waitFor(`document.querySelector("#pcLookupRows [data-attr=dpd]")`, 8000);
        const a = await page.evaluate(() => document.querySelector("#pcLookupRows [data-attr=dpd]").innerText);
        assert(ATTR[lang].test(a), `${lang} DPD attribution: ${a}`);
        const sent = await page.evaluate(() => window.__pcCalls.flat().filter(x => x.source === "dpd").map(x => x.q));
        assert(sent.length && sent.every(q => q === "01234567"), "only the DIN goes to DPD " + JSON.stringify(sent));
        if (lang !== "th") { const c = await coverage(page); assert(c.pct === 0, `${lang}: Thai left ${c.pct}% ${JSON.stringify(c.top)}`); }
      }
      await page.close();
    });
  } finally {
    await browser.close();
  }
}
