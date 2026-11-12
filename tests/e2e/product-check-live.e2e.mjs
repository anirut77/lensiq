// tests/e2e/product-check-live.e2e.mjs — Product Check LIVE SCAN (owner order 2026-11-12 after phone testing: "not real-time,
// the box has to be aimed carefully, too many taps"). FIXED TEST SET written before the live scan was built; sha256 in
// ~/LENSIQ-field/evals/live-scan/locked.sha256. A fake camera (canvas.captureStream; scenes switched by the test) and, for
// the rule checks, the localhost-only ?fakeocr seam (window.__LQ_FAKE_PCOCR / __LQ_FAKE_PCBAR) stand in for the camera and
// the models; one check runs the REAL models on a synthetic label shown by the fake camera.
//   1. live scan is the default of the camera button: framing guide, short live hints (no label / too dark / hold still),
//      auto-capture of a steady label with NO shutter tap, live checklist (barcode / registration number / ingredients),
//      manual "take this picture" kept as a fallback, frame analysis <= 5 per second, no request without an API;
//   2. the reading is merged across frames (vote per line), reading pauses on a steady view, a new object starts over;
//   3. a hidden page stops the camera and the analysis; it resumes when visible;
//   4. PUBLIC flow unchanged: with a remembered consent and no tester gate NOTHING is sent automatically, no auto control is
//      shown, "ask AI" still shows the preview and sends only after "Send this text"; the official lookup runs by itself
//      only when the page's online-lookup opt-in is on;
//   (Checks 5-8 were rewritten 2026-11-12 for the owner's decision "no automatic sending; testers send with ONE TAP and no
//   preview"; the earlier auto-send checks are in the history; see locked.sha256.)
//   5. TESTER one-tap: NOTHING is sent without a tap (several products scanned with one-tap on); ONE consent with
//      "remember my choice" (without it one-tap stays off); then one tap on "ask AI" sends at once with NO preview (auto
//      flag + tester header; the text sent = the merged reading = what the page shows as sent); a first tap that opens the
//      consent screen sends at once after "remember" is ticked;
//   6. filters: a dispensing label, a personal document, a front panel -> refused as today (no consent, no send); a phone
//      on the label, a possible name, a face, an edited text -> the tap does NOT send at once: the reason is shown and the
//      usual preview opens; nothing is sent before "Send this text";
//   7. "stop and withdraw" and the ordinary withdraw both clear the consent AND the one-tap choice at once; the next tap
//      asks again;
//   8. "photo" remembered: one-tap is TEXT ONLY (a photo only after "Use this picture"); server refusals with a documented
//      code show their own notice instead of the generic "AI unavailable";
//   9. REAL models: a synthetic label shown by the fake camera is read without a tap (TH registration shape + EAN-13);
//  10. English / 中文: no Thai left in the live and auto panels; 360 px: no horizontal scroll, touch targets >= 44 px.
// Synthetic scenes only (canvas text and bars); no photo of a person; fake Worker only (no key, no provider).
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const CODE = "tester-code-e2e-2026";
const INIT = "window.confirm=()=>true;window.print=()=>{};window.__LQ_FAKE_FACE=s=>(window.__faceOn&&(s==='frame'||s==='upload'))?[{score:0.97,box:{x:40,y:40,w:120,h:120}}]:[];";
// scenes: the camera paints text-like rows (or nothing / darkness / a moving label); the fake OCR returns the scene's lines
const SCENES = `window.__scene="blank";window.__ocrCalls=0;window.__barCalls=0;window.__hid=false;
  const LBL=["ยาแก้ปวด TESTOL 500 mg","เลขทะเบียน 1A 844/39","ส่วนประกอบ: พาราเซตามอล 500 มก.","EXP 01/2028"];
  window.__SC={
    label:LBL, moving:LBL,
    label2:["ยาธาตุ SAMPLEX","เลขทะเบียน G 123/45","ส่วนประกอบ: ขิง 100 มก.","LOT 2611A"],
    label3:["ครีมสาธิต DEMOCARE","เลขที่ใบรับจดแจ้ง 10-1-6600012345","Ingredients: water, glycerin","EXP 12/2027"],
    label4:["ชาสมุนไพร HERBALT","เลขสารบบอาหาร 10-1-12345-1-0001","ส่วนประกอบ: ใบเตย 100%","ปริมาณสุทธิ 50 กรัม"],
    noisy:n=>[["ยาแก้ปวด TESTO1 500 mg","เลขทะเบียน 1A 844/39","ส่วนประกอบ: พาราเซตามอล 500 มก.","EXP 01/2028"],
      ["ยาแก้ปวด TESTOL 500 mg","เลขทะเบียน 1A 844/39","@@ ~~ ##","ส่วนประกอบ: พาราเซตามอล 500 มก.","EXP 01/2028"],
      ["ยาแก้ปวด TESTOL 500 mg","เลขทะเบียน 1A 844/3","ส่วนประกอบ: พาราเซตามอล 500 มก.","EXP 01/2028"]][(n-1)%3],
    disp:["ร้านยาสาธิต","รับประทานครั้งละ 1 เม็ด หลังอาหาร วันละ 3 ครั้ง","วันที่จ่ายยา 10/11/2569","PARACETAMOL 500 mg"],
    receipt:["ใบเสร็จรับเงิน","รวมทั้งสิ้น 250 บาท",...LBL],
    phone:[...LBL,"โทร 081-234-5678"],
    maybe:[...LBL,"Somchai Jaidee"],
    front:["ซาแมพลาม็อล ตราสาธิต","บรรเทาปวด ลดไข้"]};
  window.__BAR={label:[{rawValue:"8850006939727",format:"ean_13"}],moving:[{rawValue:"8850006939727",format:"ean_13"}],label2:[{rawValue:"8851234567892",format:"ean_13"}],
    label3:[{rawValue:"8850999000017",format:"ean_13"}],label4:[{rawValue:"8857123456789",format:"ean_13"}],noisy:[{rawValue:"8850006939727",format:"ean_13"}]};
  window.__LQ_FAKE_PCOCR=()=>{window.__ocrCalls++;const s=window.__SC[window.__scene];return typeof s==="function"?s(window.__ocrCalls):(s||[]);};
  window.__LQ_FAKE_PCBAR=()=>{window.__barCalls++;return window.__BAR[window.__scene]||[];};
  Object.defineProperty(document,"hidden",{configurable:true,get:()=>!!window.__hid});
  Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>window.__hid?"hidden":"visible"});
  window.__setHidden=h=>{window.__hid=h;document.dispatchEvent(new Event("visibilitychange"));};`;
// fake camera: one device streaming a 1280 x 720 canvas painted from window.__scene (or window.__paint, for the real-model check)
const CAM = `(function(){const md=navigator.mediaDevices;if(!md)return;const c=document.createElement("canvas");c.width=1280;c.height=720;const x=c.getContext("2d");
  window.__camTracks=[];let t=0;
  function rows(dx,bg,ink){x.fillStyle=bg;x.fillRect(0,0,1280,720);x.fillStyle=ink;x.font="bold 34px sans-serif";x.textBaseline="top";
    for(let i=0;i<13;i++)x.fillText("TESTOL 500 mg REG 1A 844/39 LOT 2611A EXP 01/2028 ส่วนประกอบ "+i,40+dx,30+i*52);}
  function paint(){t++;const s=window.__scene;
    if(typeof window.__paint==="function"){window.__paint(x,c);return;}
    if(s==="blank"){x.fillStyle="#d8d8d8";x.fillRect(0,0,1280,720);return;}
    if(s==="dark"){rows(0,"#060606","#141414");return;}
    if(s==="moving"){rows(Math.round(Math.sin(t*1.7)*90),"#f2efe6","#151515");return;}
    rows(s==="label2"?6:s==="label3"?12:0,"#f2efe6","#151515");}
  setInterval(paint,50);paint();
  md.enumerateDevices=async()=>[{kind:"videoinput",deviceId:"fake-live",groupId:"g",label:"Back camera (fake)",toJSON(){return this;}}];
  md.getUserMedia=async()=>{const s=c.captureStream(15);const tr=s.getVideoTracks()[0];window.__camTracks.push(tr);
    const gs=tr.getSettings.bind(tr);tr.getSettings=()=>Object.assign({},gs(),{deviceId:"fake-live",width:1280,height:720,facingMode:"environment"});
    tr.getCapabilities=()=>({deviceId:"fake-live",width:{min:1,max:1280},height:{min:1,max:720}});return s;};})();`;
// fake Worker (records every call); GATE=true -> the closed-test gate is on and the tester code is checked
const NET = gate => `window.LENSIQ_API_BASE="https://api.example.test";window.LENSIQ_ANALYTICS=false;window.LENSIQ_MEMBER=false;window.__ai=[];
  ${gate ? `window.LENSIQ_TESTER_GATE=true;sessionStorage.setItem("lq-tester",${JSON.stringify(CODE)});` : ""}
  const P=(provider,model,name,region)=>({provider,model,name:{th:name,en:name,zh:name},region:{th:region,en:region,zh:region},retention:{th:"ไม่เก็บ",en:"zero retention",zh:"零保留"}});
  window.__INFO={pc_fields:{feature:"pc_fields",enabled:true,imageModeAllowed:true,stores:false,chain:[P("anthropic","claude-haiku-5-5","Anthropic","USA")]},
    pc_claims:{feature:"pc_claims",enabled:true,imageModeAllowed:false,stores:false,chain:[P("anthropic","claude-haiku-5-5","Anthropic","USA")]},
    pc_translate:{feature:"pc_translate",enabled:false,imageModeAllowed:false,stores:false,chain:[]}};
  const J=(o,s)=>new Response(JSON.stringify(o),{status:s||200,headers:{"Content-Type":"application/json"}});
  const realFetch=window.fetch.bind(window);
  window.fetch=async(u,init)=>{const url=String(u);if(!url.startsWith("https://api.example.test"))return realFetch(u,init);
    const h=Object.fromEntries(Object.entries((init&&init.headers)||{}).map(([k,v])=>[k.toLowerCase(),v]));
    const m=(init&&init.method)||"GET",b=init&&init.body?JSON.parse(init.body):null;window.__ai.push({url,m,b,h,hidden:!!window.__hid});
    const p=new URL(url),ok=${gate ? `h["x-tester-code"]===${JSON.stringify(CODE)}` : "true"};
    if(p.pathname==="/v1/tester/check")return ok?J({ok:true,required:${gate ? "true" : "false"}}):J({fallback:true,reason:"tester_required"},403);
    if(p.pathname==="/v1/ai/providers")return ok?J(window.__INFO[p.searchParams.get("feature")]||{enabled:false}):J({enabled:false,tester:true,chain:[]});
    if(p.pathname==="/api/pc/batch"){const L=JSON.parse(init.body).lookups;return J({ok:true,results:L.map(x=>({status:200,source:x.source,ok:true,found:0,total:0,items:[],
      fetched:"2026-11-12T03:00:00Z"}))});}
    if(!ok)return J({fallback:true,reason:"tester_required"},403);
    if(window.__refuse)return J({fallback:true,reason:"bad_input",code:window.__refuse},400);
    const f=p.pathname.replace("/v1/ai/","");
    const who={ok:true,provider:"anthropic",model:"claude-haiku-5-5",region:"global",providerName:{th:"Anthropic",en:"Anthropic",zh:"Anthropic"},regionText:{th:"สหรัฐฯ",en:"USA",zh:"美国"}};
    if(f==="pc_fields")return J({...who,json:{product_type:"drug",brand:"TESTOL",product_name:"TESTOL 500",active_ingredients:[],dosage_form:"tablet",
      registration:[{number:"1A 844/39",country:"TH",kind:"drug",source:"ocr"}],manufacturer:null,lot:null,expiry:null,claims_on_pack:[],languages_on_pack:["th"],unreadable:[]}});
    if(f==="pc_claims")return J({...who,json:{signals:[]}});
    return J({fallback:true,reason:"unavailable"},404);};`;
const REMEMBER = mode => `localStorage.setItem("lq-ai-consent", JSON.stringify({pc:{providers:["anthropic"],mode:${JSON.stringify(mode || "text")},ts:1}}));`;
const URL_ = (base, q = "") => `${base}/medicine.html?fakeocr&fakeface${q}`;
const openTab = page => page.evaluate(() => { document.querySelector("#t-pc").click(); return !document.querySelector("#tab-pc").hidden; });
const scene = (page, s) => page.evaluate(s => { window.__scene = s; }, s);
const live = page => page.evaluate(() => { const s = window.__LQ_PCLIVE && window.__LQ_PCLIVE.st; const h = document.querySelector("#pcLiveHint");
  return { on: !!(s && s.on), frames: s ? s.frames : -1, captures: s ? s.captures : -1, reads: s ? s.reads : -1, hint: h ? h.dataset.hint : "",
    list: Object.fromEntries([...document.querySelectorAll("#pcLiveList [data-item]")].map(li => [li.dataset.item, li.dataset.ok === "1"])),
    text: (document.querySelector("#pcText") || {}).value || "" }; });
const startLive = async page => {
  await page.evaluate(() => document.querySelector("#pcCamBtn").click());
  await page.waitFor(`window.__LQ_PCLIVE && window.__LQ_PCLIVE.st.on && document.querySelector("#pcLive") && !document.querySelector("#pcLive").hidden`, 10000);
};
const hint = (page, h, ms = 8000) => page.waitFor(`document.querySelector("#pcLiveHint") && document.querySelector("#pcLiveHint").dataset.hint === ${JSON.stringify(h)}`, ms);
const aiPosts = page => page.evaluate(() => window.__ai.filter(c => c.m === "POST" && /\/v1\/ai\//.test(c.url)).map(c => ({ f: c.url.split("/v1/ai/")[1], auto: c.b.auto,
  mode: c.b.mode, text: (c.b.input && c.b.input.text) || "", images: ((c.b.input && c.b.input.images) || []).length, mime: ((c.b.input && c.b.input.images) || [])[0]
    ? c.b.input.images[0].mime : "", code: c.h["x-tester-code"] || "", hidden: c.hidden })));
const agree = (page, o = {}) => page.evaluate(o => {
  const d = document.querySelector("dialog.lq-ai-consent");
  if (o.mode) d.querySelector(`input[name=lqAiMode][value=${o.mode}]`).click();
  if (o.remember) d.querySelector("input[type=checkbox]").click();
  d.querySelector(`button[value=${o.cancel ? "cancel" : "ok"}]`).click();
}, o);
const DIALOG = `document.querySelector("dialog.lq-ai-consent") && document.querySelector("dialog.lq-ai-consent").open`;
/** tester: switch auto-send on (ONE consent with "remember my choice") */
async function autoOn(page, mode) {
  await page.waitFor(`document.querySelector("#pcAiAutoOn")`, 15000);
  await page.evaluate(() => document.querySelector("#pcAiAutoOn").click());
  await page.waitFor(DIALOG, 8000);
  await agree(page, { remember: true, mode });
  await page.waitFor(`document.querySelector("#pcAiAuto") && document.querySelector("#pcAiAuto").dataset.on === "1"`, 8000);
}
const THAI = /[฀-๿]/;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("live: the default of the camera button — framing guide, live hints, auto-capture of a steady label with no shutter tap, checklist, manual fallback, <= 5 fps", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, SCENES, CAM], isolated: true });
      await page.goto(URL_(base));
      await openTab(page);
      assert(await page.evaluate(() => document.querySelector("#pcLiveOn") && document.querySelector("#pcLiveOn").checked), "live scan is on by default");
      await startLive(page);
      assert(await page.evaluate(() => !document.querySelector("#pcLiveGuide").hidden && !document.querySelector("#pcSnap").hidden), "framing guide shown; manual 'take this picture' kept");
      await hint(page, "nolabel");
      await scene(page, "dark"); await hint(page, "dark");
      await scene(page, "moving"); await hint(page, "hold");
      await sleep(2500);
      assert((await live(page)).captures === 0, "a moving label is not captured");
      const f0 = (await live(page)).frames; const t0 = Date.now();
      await scene(page, "label");
      await page.waitFor(`document.querySelector("#pcRegs") && [...document.querySelectorAll("#pcRegs [data-country]")].some(e => e.dataset.country === "TH")`, 15000);
      const r = await live(page);
      assert(r.captures >= 1 && r.on, "captured by itself, the camera stays on " + JSON.stringify(r));
      await page.waitFor(`[...document.querySelectorAll("#pcLiveList [data-item]")].every(li => li.dataset.ok === "1")`, 8000);
      assert(/1A 844\/39/.test(r.text) && /ส่วนประกอบ/.test(r.text), "the label text is in the editable box " + JSON.stringify(r.text));
      await sleep(Math.max(0, 3000 - (Date.now() - t0)));
      const fps = ((await live(page)).frames - f0) / ((Date.now() - t0) / 1000);
      assert(fps <= 5.2, "frame analysis <= 5 per second: " + fps.toFixed(2));
      assert(await page.evaluate(() => !document.querySelector("#pcVideo").hidden && window.__camTracks.some(t => t.readyState === "live")), "the camera keeps running");
      // manual fallback: the shutter still takes a still picture and stops the live scan
      await page.evaluate(() => document.querySelector("#pcSnap").click());
      await page.waitFor(`!window.__LQ_PCLIVE.st.on && window.__LQ_PC.st.still`, 8000);
      assert(!page.requests.some(q => /api\.example\.test|\/v1\//.test(q.url)), "no request: no API on this page");
      await page.close();
    });

    await check("live: the reading is merged across frames (vote per line), reading pauses on a steady view, a new object starts a new reading", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, SCENES, CAM], isolated: true });
      await page.goto(URL_(base));
      await openTab(page);
      await scene(page, "noisy");
      await startLive(page);
      await page.waitFor(`window.__LQ_PCLIVE.st.reads >= 3`, 20000);
      const want = "ยาแก้ปวด TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nส่วนประกอบ: พาราเซตามอล 500 มก.\nEXP 01/2028";
      await page.waitFor(`(document.querySelector("#pcText") || {}).value === ${JSON.stringify(want)}`, 8000);
      const st = await page.evaluate(() => ({ ocr: window.__LQ_PC.st.ocr && window.__LQ_PC.st.ocr.text, reads: window.__LQ_PCLIVE.st.reads }));
      assert(st.ocr === want, "the merged reading is the OCR text the AI step may use (provenance) " + JSON.stringify(st));
      await sleep(4000);
      const n1 = (await live(page)).reads;
      await sleep(3000);
      const n2 = (await live(page)).reads;
      assert(n2 === n1 && n1 <= 6, `reading pauses on a steady view (${n1} -> ${n2})`);
      await scene(page, "blank");
      await hint(page, "nolabel");
      await scene(page, "label2");
      await page.waitFor(`/SAMPLEX/.test((document.querySelector("#pcText") || {}).value || "")`, 15000);
      const t = (await live(page)).text;
      assert(!/TESTOL|844\/39/.test(t), "a new object starts a new reading: nothing of the first label is merged in " + JSON.stringify(t));
      await page.close();
    });

    await check("live: a hidden page stops the camera and the frame analysis; it resumes when the page is visible again", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, SCENES, CAM], isolated: true });
      await page.goto(URL_(base));
      await openTab(page);
      await scene(page, "blank");
      await startLive(page);
      await sleep(1200);
      await page.evaluate(() => window.__setHidden(true));
      await sleep(400);
      const a = await live(page), oc = await page.evaluate(() => window.__ocrCalls);
      await scene(page, "label");
      await sleep(2500);
      const b = await live(page);
      assert(b.frames === a.frames, `no frame analysed while hidden (${a.frames} -> ${b.frames})`);
      assert(await page.evaluate(() => window.__camTracks.every(t => t.readyState === "ended")), "the camera is released while hidden");
      assert(await page.evaluate(n => window.__ocrCalls === n, oc), "no OCR while hidden");
      await page.evaluate(() => window.__setHidden(false));
      await page.waitFor(`window.__LQ_PCLIVE.st.frames > ${b.frames} && window.__camTracks.some(t => t.readyState === "live")`, 8000);
      await page.waitFor(`document.querySelector("#pcRegs")`, 15000);
      await page.close();
    });

    await check("live, PUBLIC: nothing is sent automatically (remembered consent, no tester gate); no auto control; 'ask AI' still previews and sends only on 'Send this text'; " +
      "the official lookup runs by itself only with the online opt-in", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, SCENES, CAM, NET(false), REMEMBER("text")], isolated: true });
      await page.goto(URL_(base));
      await openTab(page);
      await scene(page, "label");
      await startLive(page);
      await page.waitFor(`document.querySelector("#pcAiGo") && document.querySelector("#pcLookupGo")`, 20000);
      await sleep(3000);
      assert((await aiPosts(page)).length === 0, "no AI request without a tap");
      assert(!(await page.evaluate(() => !!document.querySelector("#pcAiAuto"))), "no auto-send control for the public");
      assert(!(await page.evaluate(() => window.__ai.some(c => /\/api\/pc\/batch/.test(c.url)))), "online opt-in off: the official lookup waits for its tap");
      await page.evaluate(() => document.querySelector("#pcAiGo").click());
      await page.waitFor(`document.querySelector("#pcAiPreview")`, 8000);
      assert((await aiPosts(page)).length === 0, "the preview first, nothing sent");
      await page.evaluate(() => document.querySelector("#pcAiPrevSend").click());
      await page.waitFor(`document.querySelector("#pcAiOut")`, 8000);
      const p = await aiPosts(page);
      assert(p.length >= 1 && p.every(x => x.auto === undefined && x.mode === "text"), "sent only after 'Send this text', with no auto flag " + JSON.stringify(p));
      await page.close();
      // with the page's online-lookup opt-in (session) the official lookup runs once per product, no tap
      const page2 = await browser.newPage(null, { initScripts: [INIT, SCENES, CAM, NET(false), `sessionStorage.setItem("lq-med-online","1");`], isolated: true });
      await page2.goto(URL_(base));
      await openTab(page2);
      await scene(page2, "label");
      await startLive(page2);
      await page2.waitFor(`document.querySelector("#pcLookupRows")`, 20000);
      await sleep(3000);
      const batches = await page2.evaluate(() => window.__ai.filter(c => /\/api\/pc\/batch/.test(c.url)).map(c => c.b));
      assert(batches.length === 1, "one lookup for the product, not per frame: " + batches.length);
      assert(!JSON.stringify(batches).includes("ส่วนประกอบ"), "derived facts only, never the label text");
      assert((await aiPosts(page2)).length === 0, "still no AI request");
      await page2.close();
    });

    const tap = page => page.evaluate(() => document.querySelector("#pcAiGo").click());
    const AIGO = `document.querySelector("#pcAiGo") && !document.querySelector("#pcAiGo").disabled`;
    /** the card shows the reading of scene s (its first and last lines), so a tap acts on that capture, not the one before */
    const readOf = (page, s) => page.waitFor(`window.__LQ_PCL && window.__LQ_PCL.st.text.includes(window.__SC[${JSON.stringify(s)}][0]) &&
      window.__LQ_PCL.st.text.includes(window.__SC[${JSON.stringify(s)}].slice(-1)[0]) &&
      window.__LQ_PCL.st.text.split("\\n").length === window.__SC[${JSON.stringify(s)}].length && document.querySelector("#pcAiGo") && !document.querySelector("#pcAiGo").disabled`, 20000);
    await check("live, TESTER one-tap: nothing is sent without a tap; ONE consent with 'remember my choice'; then one tap sends at once with no preview, " +
      "auto flag + tester header; the text sent is shown", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, SCENES, CAM, NET(true)], isolated: true });
      await page.goto(URL_(base));
      await openTab(page);
      await scene(page, "label");
      await startLive(page);
      await page.waitFor(`document.querySelector("#pcAiAutoOn")`, 20000);
      // without "remember my choice" one-tap stays off
      await page.evaluate(() => document.querySelector("#pcAiAutoOn").click());
      await page.waitFor(DIALOG, 8000);
      const d = await page.evaluate(() => { const x = document.querySelector("dialog.lq-ai-consent"); const a = x.querySelector("[data-auto]"); return a ? a.innerText : ""; });
      assert(/แตะครั้งเดียว/.test(d) && /ผู้ทดสอบ/.test(d) && /ไม่มีการส่งเองโดยที่คุณไม่ได้กด/.test(d), "the consent screen explains one-tap: " + d);
      await agree(page);
      await page.waitFor(`document.querySelector("#pcAiAutoMsg") && /จำการเลือก/.test(document.querySelector("#pcAiAutoMsg").innerText)`, 8000);
      assert(await page.evaluate(() => document.querySelector("#pcAiAuto").dataset.on === "0" && !localStorage.getItem("lq-pc-auto")), "off without 'remember'");
      await autoOn(page);
      // one-tap on: scanning products sends NOTHING by itself
      for (const s of ["label2", "label3", "label"]) { await scene(page, "blank"); await hint(page, "nolabel"); await scene(page, s); await sleep(2500); }
      await page.waitFor(AIGO, 15000);
      await sleep(1500);
      assert((await aiPosts(page)).length === 0, "nothing is sent without a tap");
      await tap(page);
      await page.waitFor(`window.__ai.filter(c => c.m === "POST" && /pc_fields/.test(c.url)).length === 1 && document.querySelector("#pcAiAutoText") && document.querySelector("#pcAiOut")`, 20000);
      assert(!(await page.evaluate(() => !!document.querySelector("#pcAiPreview") || !!document.querySelector("dialog.lq-ai-consent"))), "no preview, no consent screen");
      await sleep(3000);
      const p = await aiPosts(page);
      const per = f => p.filter(x => x.f === f).length;
      assert(per("pc_fields") === 1 && per("pc_claims") === 1 && p.length === 2, "one tap = one round: " + JSON.stringify(p.map(x => x.f)));
      const text = await page.evaluate(() => window.__LQ_PC.st.ocr.text);
      assert(p.every(x => x.auto === true && x.code === CODE && x.mode === "text" && x.text === text && x.images === 0), "no-preview flag, tester header, the reading " + JSON.stringify(p));
      assert(await page.evaluate(t => document.querySelector("#pcAiAutoText").textContent === t && !!document.querySelector("#pcAiAutoStop") &&
        !!document.querySelector("#pcAiSent[data-auto]"), text), "the text sent is shown, with stop / withdraw");
      await page.close();
      // a first tap: the consent screen (with the one-tap note); "remember" ticked -> sent at once, no preview
      const page2 = await browser.newPage(null, { initScripts: [INIT, SCENES, CAM, NET(true)], isolated: true });
      await page2.goto(URL_(base));
      await openTab(page2);
      await scene(page2, "label");
      await startLive(page2);
      await page2.waitFor(AIGO, 20000);
      await tap(page2);
      await page2.waitFor(DIALOG, 8000);
      assert(await page2.evaluate(() => !!document.querySelector("dialog.lq-ai-consent [data-auto]")), "the tester's consent screen explains one-tap");
      await agree(page2, { remember: true });
      await page2.waitFor(`window.__ai.filter(c => c.m === "POST" && /pc_fields/.test(c.url)).length === 1`, 20000);
      assert(!(await page2.evaluate(() => !!document.querySelector("#pcAiPreview"))) && (await aiPosts(page2)).every(x => x.auto === true), "sent at once after the one consent");
      await page2.close();
    });

    await check("live, TESTER one-tap filters: dispensing / personal document / front panel refused as today; a phone, a possible name, a face or an edited text " +
      "-> no immediate send, the reason shown, the usual preview, nothing before 'Send this text'", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, SCENES, CAM, NET(true)], isolated: true });
      await page.goto(URL_(base));
      await openTab(page);
      await scene(page, "blank");
      await startLive(page);
      await autoOn(page);
      for (const [s, why] of [["disp", "dispensing"], ["receipt", "personal-doc"], ["front", "no-product"]]) {
        await scene(page, "blank"); await hint(page, "nolabel");
        await scene(page, s);
        await readOf(page, s);
        await tap(page);
        await page.waitFor(`document.querySelector("#pcAiNotice") && document.querySelector("#pcAiNotice").dataset.reason === ${JSON.stringify(why)}`, 8000);
        assert((await aiPosts(page)).length === 0 && !(await page.evaluate(() => !!document.querySelector("dialog.lq-ai-consent"))), s + ": refused as today, nothing sent");
      }
      for (const [s, why, face, edit] of [["phone", "name-guard"], ["maybe", "name-guard"], ["label", "face", true], ["label2", "edited", false, true]]) {
        await scene(page, "blank"); await hint(page, "nolabel");
        await page.evaluate(f => { window.__faceOn = !!f; }, face);
        await scene(page, s);
        await readOf(page, s); await sleep(700);
        if (edit) await page.evaluate(() => { const t = document.querySelector("#pcText"); t.value = t.value + "\nแก้เอง"; document.querySelector("#pcReparse").click(); });
        await page.waitFor(AIGO, 8000);
        await tap(page);
        await page.waitFor(`document.querySelector("#pcAiAutoSkip") && document.querySelector("#pcAiAutoSkip").dataset.reason === ${JSON.stringify(why)} &&
          document.querySelector("#pcAiPreview")`, 20000);
        assert((await aiPosts(page)).length === 0, s + ": not sent at once; the preview is open");
        await page.evaluate(() => document.querySelector("#pcAiPrevCancel").click());
      }
      await page.evaluate(() => { window.__faceOn = false; });
      // the preview still sends only on "Send this text", without the no-preview flag
      await scene(page, "blank"); await hint(page, "nolabel");
      await scene(page, "phone");
      await readOf(page, "phone");
      await tap(page);
      await page.waitFor(`document.querySelector("#pcAiPreview") && document.querySelector("#pcAiPrevDetails").open`, 8000);
      assert(await page.evaluate(() => !document.querySelector("#pcAiPrevEdit").value.includes("081-234-5678")), "the phone is removed in the preview");
      await page.evaluate(() => document.querySelector("#pcAiPrevSend").click());
      await page.waitFor(`document.querySelector("#pcAiOut")`, 8000);
      const p = await aiPosts(page);
      assert(p.length >= 1 && p.every(x => x.auto === undefined && !x.text.includes("081-234-5678")), "sent after 'Send this text' only, without the flag " + JSON.stringify(p));
      await page.close();
    });

    await check("live, TESTER: 'stop and withdraw' and the ordinary withdraw both clear the consent AND the one-tap choice at once; the next tap asks again", async () => {
      for (const btn of ["#pcAiAutoStop", "#pcAiWithdraw"]) {
        const page = await browser.newPage(null, { initScripts: [INIT, SCENES, CAM, NET(true)], isolated: true });
        await page.goto(URL_(base));
        await openTab(page);
        await scene(page, "label");
        await startLive(page);
        await autoOn(page);
        await page.waitFor(`document.querySelector(${JSON.stringify(btn)})`, 15000);
        await page.evaluate(b => document.querySelector(b).click(), btn);
        const st = await page.evaluate(() => ({ consent: JSON.parse(localStorage.getItem("lq-ai-consent") || "{}").pc, auto: localStorage.getItem("lq-pc-auto"),
          on: document.querySelector("#pcAiAuto") ? document.querySelector("#pcAiAuto").dataset.on : "" }));
        assert(st.consent === undefined && st.auto === null && st.on === "0", btn + ": both cleared at once " + JSON.stringify(st));
        await page.waitFor(AIGO, 8000);
        await tap(page);
        await page.waitFor(DIALOG, 8000);
        await agree(page, { cancel: true });
        await sleep(800);
        assert((await aiPosts(page)).length === 0, btn + ": the next tap asks again; nothing sent");
        await page.close();
      }
    });

    await check("live, TESTER with 'photo' remembered: one-tap is TEXT ONLY; server refusals with a documented code show their own notice", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, SCENES, CAM, NET(true)], isolated: true });
      await page.goto(URL_(base));
      await openTab(page);
      await scene(page, "label");
      await startLive(page);
      await autoOn(page, "image");
      await page.waitFor(AIGO, 20000); await sleep(1000);
      await tap(page);
      await page.waitFor(`window.__ai.filter(c => c.m === "POST" && /pc_fields/.test(c.url)).length === 1 && document.querySelector("#pcAiAutoText")`, 20000);
      const p = await aiPosts(page);
      assert(p.length >= 1 && p.every(x => x.auto === true && x.mode === "text" && x.images === 0), "no photo with one tap " + JSON.stringify(p));
      assert(await page.evaluate(() => !!document.querySelector("#pcAiAutoPhoto") && !document.querySelector("#pcPrevCard")), "the page says a photo needs 'Use this picture'");
      // documented refusal codes: their own notice, not the generic one
      const want = { ai_off_dispensing: /ฉลากยาที่จ่ายให้ผู้ป่วย/, ai_off_personal_doc: /เอกสารส่วนบุคคล/, ai_off_no_product: /ไม่เหมือนฉลากสินค้า/, ai_off_personal_data: /ชื่อหรือข้อมูลส่วนตัว/ };
      for (const [code, re] of Object.entries(want)) {
        await page.evaluate(c => { window.__refuse = c; }, code);
        await page.waitFor(AIGO, 8000);
        await tap(page);
        await page.waitFor(`document.querySelector("#pcAiOut [data-code=${code}]")`, 15000);
        const t = await page.evaluate(c => document.querySelector(`#pcAiOut [data-code=${c}]`).innerText, code);
        assert(re.test(t), code + ": own notice " + t);
      }
      await page.close();
    });

    await check("live, REAL models: a synthetic label shown by the fake camera is read with no tap (Thai registration shape + EAN-13)", async () => {
      const EAN = "01010010001000110111001010110001011000101000010101000101101111010001011011101100100110111011010";
      const PAINT = `window.__paint = null; window.__drawReal = async () => {
        const add = async (fam, url, o) => { const f = new FontFace(fam, "url(" + url + ")", o); document.fonts.add(await f.load()); };
        await add("LQThai", "/vendor/fonts/prompt/prompt-500-thai.woff2", { weight: "500", unicodeRange: "U+0E00-0E7F" });
        await add("LQThai", "/vendor/fonts/prompt/prompt-500-latin.woff2", { weight: "500", unicodeRange: "U+0000-00FF" });
        await add("LQTestSans", "/tests/fixtures/fonts/liberation/LiberationSans-Bold.ttf", { weight: "700" });
        window.__paint = (x, c) => { x.fillStyle = "#f6f2e8"; x.fillRect(0, 0, c.width, c.height); x.fillStyle = "#111"; x.textBaseline = "middle";
          x.font = "500 52px LQThai"; x.fillText("ยาแก้ปวดลดไข้", 80, 90);
          x.font = "500 46px LQThai"; x.fillText("อย. 10-1-12345-1-0001", 80, 190);
          x.font = "700 46px LQTestSans"; x.fillText("Reg. No. 1A 15/50", 80, 290);
          x.fillStyle = "#fff"; x.fillRect(760, 380, 95 * 4 + 80, 260); x.fillStyle = "#000";
          [...${JSON.stringify(EAN)}].forEach((ch, i) => { if (ch === "0") x.fillRect(800 + i * 4, 410, 4, 200); }); };
        return document.fonts.check("500 52px LQThai", "ยา"); };`;
      const page = await browser.newPage(null, { initScripts: [INIT, CAM, PAINT], isolated: true });
      await page.goto(`${base}/medicine.html?fakeface`);
      await openTab(page);
      assert(await page.evaluate(() => window.__drawReal()), "test fonts loaded");
      await startLive(page);
      await page.waitFor(`document.querySelector("#pcRegs") && [...document.querySelectorAll("#pcRegs [data-country]")].some(e => e.dataset.kind === "drug" || e.dataset.kind === "food")`, 180000);
      await page.waitFor(`/8850006939727/.test((document.querySelector("#pcCodes") || {}).innerText || "")`, 60000);
      const r = await live(page);
      assert(r.list.reg && r.list.barcode && r.captures >= 1, "checklist from the real models " + JSON.stringify(r));
      await page.close();
    });

    await check("live: English / 中文 leave no Thai in the live and auto panels; 360 px: no horizontal scroll, live controls >= 44 px", async () => {
      for (const lang of ["en", "zh"]) {
        const page = await browser.newPage(null, { initScripts: [INIT, SCENES, CAM, NET(true)], isolated: true });
        await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 1, mobile: true });
        await page.goto(URL_(base, `&lang=${lang}`));
        await openTab(page);
        await scene(page, "label");
        await startLive(page);
        await page.waitFor(`document.querySelector("#pcAiAutoOn") && document.querySelector("#pcLiveList")`, 20000);
        const t = await page.evaluate(() => {
          const txt = el => { if (!el) return ""; const c = el.cloneNode(true); c.querySelectorAll("[translate=no],textarea,pre").forEach(x => x.remove()); return c.innerText; };
          return { live: txt(document.querySelector("#pcLive")) + " " + txt(document.querySelector("#pcLiveList")) + " " + document.querySelector("label[for=pcLiveOn], #pcLiveOnL").innerText,
            auto: txt(document.querySelector("#pcAiAuto")), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
            small: [...document.querySelectorAll("#pcCamWrap button, #pcAiAuto button")]
              .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.width < 43.5 || r.height < 43.5); })
              .map(b => b.id) };
        });
        assert(!THAI.test(t.live) && !THAI.test(t.auto), lang + ": no Thai " + JSON.stringify(t).slice(0, 400));
        assert(t.sw <= t.cw, lang + ": no horizontal scroll at 360 px");
        assert(!t.small.length, lang + ": touch targets " + t.small.join(","));
        await page.close();
      }
    });
  } finally { await browser.close(); }
}
