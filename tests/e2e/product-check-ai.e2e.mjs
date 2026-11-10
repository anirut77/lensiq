// tests/e2e/product-check-ai.e2e.mjs — medicine.html "Product check" opt-in AI step (round 17, P7; lensiq-pc-ai.js in
// #pcAiSlot of the risk-signal card). FIXED consent / privacy cases, written before the step was wired (owner brief P7):
//   1. first use asks: ONE consent screen naming the provider, model and processing country used for each feature; a
//      network spy (window.fetch + CDP) proves NO request carrying label data before "agree" (only the consent-screen
//      metadata GET); text mode is the default; the POST bodies carry the guard's redacted text and never an image;
//   2. image mode + remember: the blurred preview is ALWAYS shown and nothing is POSTed until "Use this picture"; the
//      POST then carries the confirmed JPEG for pc_fields only; after a reload the remembered choice skips the screen but
//      the preview still comes first; "Back" in the preview -> text only, said so;
//   3. withdraw clears the choice at once and the next ask shows the screen again; "don't send" sends nothing;
//   4. patient-name guard: with a name / phone on the label, image mode is BLOCKED (no preview, no POST) and the page
//      offers text only with the parts removed; the POST then has no name;
//   4b. MANDATORY TEXT PREVIEW (coordinator decision): the exact redacted text is shown, highlighted and editable; NO request
//      before "Send this text"; what is sent EQUALS what was shown (also after an edit; personal data typed in is removed
//      and shown again); a remembered choice never skips it (open when redacted / dispensing, collapsed when clean);
//   4c. dispensing / prescription label: setting "off" (default) = no consent screen and no request at all; "text-preview"
//      = photo blocked, text only after the open preview;
//   4d. PRODUCT-LABEL EVIDENCE (owner decision 2026-11-10, option 1; written before the filter was wired): a shipping label
//      that lists the product, or a text with no label evidence -> no consent screen, no request (text mode and image mode
//      alike), a clear message, on-device results stay; a decoded barcode is evidence; a product label -> flow unchanged;
//   4e. GUIDANCE WHEN REFUSED (owner decision 2026-11-10, option ก; written before the guidance was wired): front-panel
//      text -> the next step is shown (the side with the registration number or the ingredients, or the barcode) with
//      one-tap buttons to the page's own barcode scan and camera; no consent screen, no request; a personal document or
//      a dispensing label gets NO such hint; after a barcode is decoded the refusal goes and AI is allowed;
//   5. AI results sit under the on-device results, labelled "AI estimate" + provider + country; pc_claims signals apart
//      from the on-device rules with the agreement line; the on-device list is unchanged; no verdict words;
//   6. English / 中文: no Thai left outside translate="no" content with the AI results open.
// Fake Worker only (no key, no provider, no real request). Synthetic label text; the picture is generated noise.
import { assert } from "./cdp.mjs";
import { coverage } from "./gate.e2e.mjs";

const INIT = "window.confirm=()=>true;window.print=()=>{};window.__LQ_FAKE_FACE=s=>(window.__faces||{})[s]||[];";
const LABEL = "TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nรักษาหายขาด 100% ไม่มีผลข้างเคียง";
// a product label with a person's name and phone on it (not a dispensing label)
const PII = "คุณสมมติ ใจทดสอบ โทร 081-234-5678\n" + LABEL;
// a pharmacy dispensing label with a bare name line (no cue, no title)
const DISP = "ร้านยาสาธิต\nสมพร ใจสมมติ\nHN 6512345\nรับประทานครั้งละ 1 เม็ด\n" + LABEL;
// a parcel label that lists the product with its registration number (not a product label; not a dispensing label)
const SHIP = "ผู้รับ: คุณสมมติ ใจทดสอบ\nโทร 081-234-5678\n55/12 ซอยสาธิต 3 แขวงตัวอย่าง เขตบางรัก กรุงเทพฯ 10500\nสินค้า: " + LABEL.replace(/\n/g, " ") + "\nผู้ส่ง: ร้านยาสาธิต";
// a capture with no product-label evidence in its text
const PLAIN = "น้ำดื่ม ตราสาธิต\n600 มล.";
const REMEMBER_IMAGE = `localStorage.setItem("lq-ai-consent", JSON.stringify({pc:{providers:["anthropic","openai","anthropic"],mode:"image",ts:1}}));`;
const BAN = /illegal|fake|counterfeit|genuine|authentic|ผิดกฎหมาย|ปลอม|ของแท้|违法|假冒|假货|正品/i;
// fake Worker: GET /v1/ai/providers (consent-screen data) and POST /v1/ai/<feature>; every call is recorded
const NET = `window.LENSIQ_API_BASE="https://api.example.test";window.__ai=[];
  const P=(provider,model,name,region)=>({provider,model,name:{th:name,en:name,zh:name},region:{th:region,en:region,zh:region},
    retention:{th:"ลบภายใน 30 วัน",en:"Deleted within 30 days",zh:"30 天内删除"}});
  const INFO={pc_fields:{feature:"pc_fields",enabled:true,imageModeAllowed:true,stores:false,chain:[P("anthropic","claude-haiku-5-5","Anthropic","USA"),P("openai","gpt-6-luna","OpenAI","USA")]},
    pc_claims:{feature:"pc_claims",enabled:true,imageModeAllowed:false,stores:false,chain:[P("anthropic","claude-sonnet-5-5","Anthropic","USA")]},
    pc_translate:{feature:"pc_translate",enabled:true,imageModeAllowed:false,stores:false,chain:[P("anthropic","claude-haiku-5-5","Anthropic","USA")]}};
  const J=(o,s)=>new Response(JSON.stringify(o),{status:s||200,headers:{"Content-Type":"application/json"}});
  const realFetch=window.fetch.bind(window);
  window.fetch=async(u,init)=>{const url=String(u);if(!url.startsWith("https://api.example.test"))return realFetch(u,init);
    const m=(init&&init.method)||"GET",b=init&&init.body?JSON.parse(init.body):null;window.__ai.push({url,m,b});
    const p=new URL(url);if(p.pathname==="/v1/ai/providers")return J(INFO[p.searchParams.get("feature")]||{enabled:false});
    const f=p.pathname.replace("/v1/ai/","");const t=(b&&b.input&&b.input.text)||"";
    const who={ok:true,provider:"anthropic",model:"claude-haiku-5-5",region:"global",providerName:{th:"Anthropic",en:"Anthropic",zh:"Anthropic"},regionText:{th:"สหรัฐฯ",en:"USA",zh:"美国"}};
    if(f==="pc_fields")return J({...who,json:{product_type:"drug",brand:"TESTOL",product_name:"TESTOL 500",active_ingredients:[{name_on_pack:"paracetamol",inn:"paracetamol",strength:"500",unit:"mg"}],
      dosage_form:"tablet",registration:[{number:"1A 844/39",country:"TH",kind:"drug",source:"ocr"}],manufacturer:null,lot:null,expiry:null,claims_on_pack:[],
      languages_on_pack:["th"],unreadable:["expiry"]}});
    if(f==="pc_claims"){const s=[];if(t.includes("รักษาหายขาด"))s.push({rule_id:"D01",evidence:"รักษาหายขาด",start:t.indexOf("รักษาหายขาด")});
      if(t.includes("ไม่มีผลข้างเคียง"))s.push({rule_id:"D02",evidence:"ไม่มีผลข้างเคียง",start:t.indexOf("ไม่มีผลข้างเคียง")});return J({...who,json:{signals:s}});}
    if(f==="pc_translate")return J({...who,json:{source_language:"th",lines:[]}});
    return J({fallback:true,reason:"unavailable"},404);};`;
// a 400 x 300 noise picture with a crop, no faces (the ?fakeface seam answers [] for every scope)
const PICTURE = () => {
  const s = window.__LQ_PC.st, c = document.querySelector("#pcStill"), x = c.getContext("2d"); c.width = 400; c.height = 300;
  const im = x.createImageData(400, 300); let v = 777;
  for (let i = 0; i < im.data.length; i += 4) { for (let k = 0; k < 3; k++) { v = (v * 1103515245 + 12345) >>> 0; im.data[i + k] = v >>> 24; } im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0); s.still = true; s.crop = { x: 50, y: 50, w: 300, h: 200 }; document.querySelector("#pcCamWrap").hidden = false; window.__faces = {};
};
const openTab = page => page.evaluate(() => { document.querySelector("#t-pc").click(); return !document.querySelector("#tab-pc").hidden; });
const posts = page => page.evaluate(() => window.__ai.filter(c => c.m === "POST").map(c => ({ f: c.url.split("/v1/ai/")[1], mode: c.b.mode, providers: c.b.providers,
  consent: c.b.consent, text: c.b.input.text || "", gtins: c.b.input.gtins || [], regs: c.b.input.regs || [],
  images: (c.b.input.images || []).map(i => ({ mime: i.mime, len: i.base64.length, w: i.width, h: i.height })) })));
const dialog = page => page.evaluate(() => { const d = document.querySelector("dialog.lq-ai-consent"); return d && d.open ? d.innerText : null; });
async function setLabel(page, text) {
  await page.evaluate(PICTURE);
  // the label as the on-device OCR read it (st.ocr.text is the ONLY source AI text may come from: option b)
  await page.evaluate(t => { const s = window.__LQ_PC.st; s.ocr = { text: t, lines: t.split("\n"), script: "th", ms: { total: 1 } }; s.text = t; s.read = true;
    window.__LQ_PC.reparse(); }, text);
  await page.waitFor(`document.querySelector("#pcAiGo")`, 15000);
}
/** A new capture on the same page: the OCR text, the text box and the decoded barcodes are replaced together. */
async function setCapture(page, text, codes = []) {
  await page.evaluate(PICTURE);
  await page.evaluate((t, codes) => { const s = window.__LQ_PC.st; s.ocr = { text: t, lines: t.split("\n"), script: "th", ms: { total: 1 } }; s.text = t; s.read = true;
    s.codes = { engine: "test", codes }; const box = document.querySelector("#pcText"); if (box) box.value = t; window.__LQ_PC.reparse(); }, text, codes);
  await page.waitFor(`document.querySelector("#pcAiGo") && window.__LQ_PCL.st.text === ${JSON.stringify(text)} && !!window.__LQ_PCL.st.local`, 15000);
}
const agree = (page, o = {}) => page.evaluate(o => {
  const d = document.querySelector("dialog.lq-ai-consent");
  if (o.mode) d.querySelector(`input[name=lqAiMode][value=${o.mode}]`).click();
  if (o.remember) d.querySelector("input[type=checkbox]").click();
  d.querySelector(`button[value=${o.cancel ? "cancel" : "ok"}]`).click();
}, o);
const outside = (page, base) => page.requests.filter(q => !q.url.startsWith(base) && !/^(data|blob):/.test(q.url));
const PREVIEW = `document.querySelector("#pcAiPreview")`;
/** Waits for the mandatory text preview; optional edit (sets the textarea + fires input); returns what the box shows. */
async function preview(page, edit) {
  await page.waitFor(PREVIEW, 8000);
  return page.evaluate(e => {
    const ta = document.querySelector("#pcAiPrevEdit");
    if (e != null) { ta.value = e; ta.dispatchEvent(new Event("input", { bubbles: true })); }
    return { shown: ta.value, view: document.querySelector("#pcAiPrevView").innerText, marks: document.querySelectorAll("#pcAiPrevView mark[data-removed]").length,
      open: document.querySelector("#pcAiPrevDetails").open, removed: [...document.querySelectorAll("#pcAiPrevRemoved li")].map(l => l.dataset.kind) };
  }, edit == null ? null : edit);
}
const sendText = page => page.evaluate(() => document.querySelector("#pcAiPrevSend").click());

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("pc-ai: first use asks on ONE screen; nothing before agree; the EXACT redacted text is shown and nothing is sent before 'Send this text'; " +
      "what is sent equals what was shown (also after an edit)", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
      await page.goto(`${base}/medicine.html?fakeface`);
      await openTab(page);
      await setLabel(page, PII);
      assert(await page.evaluate(() => !window.__ai.some(c => /\/v1\/ai\//.test(c.url)) && !window.__ai.some(c => /TESTOL|สมมติ/.test(JSON.stringify(c)))),
        "no AI request (and no label data anywhere) before 'ask AI'");
      assert(!(await page.evaluate(() => document.querySelector("#pcAiWithdraw"))), "no withdraw control before any consent");
      await page.evaluate(() => document.querySelector("#pcAiGo").click());
      await page.waitFor(`document.querySelector("dialog.lq-ai-consent") && document.querySelector("dialog.lq-ai-consent").open`, 8000);
      const d = await dialog(page);
      assert(/claude-haiku-5-5/.test(d) && /claude-sonnet-5-5/.test(d) && /USA/.test(d) && /Anthropic/.test(d), "screen names provider, model, country per feature: " + d);
      assert(/OpenAI/.test(d), "a provider it may fall back to is named with its retention: " + d);
      assert(/เบลอใบหน้า/.test(d) && /จำการเลือกนี้/.test(d) && /ถอนความยินยอม/.test(d), "image choice, remember box and how to withdraw on the screen");
      assert(await page.evaluate(() => document.querySelector("input[name=lqAiMode][value=text]").checked), "text only is the default");
      const before = await page.evaluate(() => window.__ai.filter(c => /\/v1\/ai\//.test(c.url)));
      assert(before.every(c => c.m === "GET" && /\/v1\/ai\/providers\?feature=pc_/.test(c.url)) && !before.some(c => /TESTOL|สมมติ/.test(c.url)),
        "before agree: only the consent-screen metadata GETs, no label data " + JSON.stringify(before.map(c => c.url)));
      await agree(page);
      const pv = await preview(page);
      assert((await posts(page)).length === 0, "NO request before 'Send this text'");
      assert(pv.open && pv.marks >= 2 && !/สมมติ|ใจทดสอบ|081-234-5678/.test(pv.shown) && /\[removed\]/.test(pv.shown) && pv.view === pv.shown,
        "the exact redacted text, removed parts highlighted, open " + JSON.stringify(pv));
      assert(pv.removed.includes("name") && pv.removed.includes("phone"), "what was removed is listed " + pv.removed);
      // the user deletes more (the TESTOL line) before sending; what is sent = what the box shows
      const edited = pv.shown.replace("TESTOL 500 mg\n", "");
      // a name typed into the box is NOT on the label: struck through, "not sent", never in a request (option b)
      await preview(page, edited + "\nGrace Exampleton");
      const typed = await page.evaluate(() => ({ del: [...document.querySelectorAll("#pcAiPrevView del[data-dropped]")].map(e => e.textContent),
        hint: !document.querySelector("#pcAiPrevDropped").hidden, t: document.querySelector("#pcAiPrevDropped").innerText }));
      assert(typed.del.join(" ") === "Grace Exampleton" && typed.hint && /ไม่มีบนฉลาก/.test(typed.t), "typed name struck through with the hint " + JSON.stringify(typed));
      const pv2 = await preview(page, edited);
      assert(pv2.view === edited, "the highlighted view follows the edit");
      assert(await page.evaluate(() => document.querySelector("#pcAiPrevDropped").hidden), "hint gone when the typed name is deleted");
      await sendText(page);
      await page.waitFor(`document.querySelector("#pcAiOut")`, 8000);
      const p = await posts(page);
      assert(p.length === 2 && p.some(x => x.f === "pc_fields") && p.some(x => x.f === "pc_claims"), "fields + claims sent (Thai label: no translation) " + JSON.stringify(p.map(x => x.f)));
      assert(p.every(x => x.text === edited), "what is sent EQUALS what was shown: " + JSON.stringify(p.map(x => x.text)));
      assert(p.every(x => x.mode === "text" && !x.images.length && x.consent === true), "text mode, no image");
      assert(p.every(x => x.providers.join() === "anthropic,openai"), "providers shown on the screen go with the request");
      const out = await page.evaluate(() => ({ removed: [...document.querySelectorAll("#pcAiRemoved li")].map(l => l.dataset.kind), sent: document.querySelector("#pcAiSent").innerText,
        agree: { ...document.querySelector("#pcAiAgree").dataset }, by: [...document.querySelectorAll("#pcAi [data-by]")].map(e => e.innerText),
        devRules: [...document.querySelectorAll("#pcClaims li")].map(l => l.dataset.rule), aiRules: [...document.querySelectorAll("#pcAiClaims li")].map(l => l.dataset.rule),
        order: !!(document.querySelector("#pcClaims") && document.querySelector("#pcClaims").compareDocumentPosition(document.querySelector("#pcAi")) & 4),
        card: document.querySelector("#pcLookup").innerText }));
      assert(out.removed.includes("name") && out.removed.includes("phone"), "the user sees what was removed " + out.removed);
      assert(/ไม่ส่งภาพ/.test(out.sent), "says no image was sent");
      assert(out.by.length === 2 && out.by.every(t => /ค่าประมาณจาก AI/.test(t) && /Anthropic/.test(t) && /สหรัฐฯ/.test(t)), "AI estimate + provider + country " + out.by);
      assert(out.devRules.includes("D01") && out.aiRules.join() === "D01,D02" && out.order, "AI signals apart from (and after) the on-device rules " + JSON.stringify(out));
      assert(Number(out.agree.both) >= 1, "agreement line " + JSON.stringify(out.agree));
      assert(!BAN.test(out.card), "no verdict words: " + (out.card.match(BAN) || []));
      assert(!outside(page, base).length, "no real request leaves the page " + outside(page, base).map(q => q.url).join(" "));
      // second ask on this page (session consent): no screen, but the text preview again.
      // (1) a name and a phone TYPED into the box are not on the label: dropped, never in any request (option b);
      // (2) the redacted name re-typed from the label IS on the label: the guard removes it again and shows the text again
      await page.evaluate(() => { window.__ai.length = 0; document.querySelector("#pcAiGo").click(); });
      await preview(page, "TESTOL 500 mg เลขทะเบียน 1A 844/39 โทร 089-111-2222 Jane Doe สมหญิง\nคุณสมมติ ใจทดสอบ");
      assert((await dialog(page)) === null, "same page session: no second screen");
      const st1 = await page.evaluate(() => [...document.querySelectorAll("#pcAiPrevView del[data-dropped]")].map(e => e.textContent));
      assert(st1.join(" ") === "089-111-2222 Jane Doe สมหญิง", "typed name and phone struck through: " + JSON.stringify(st1));
      await sendText(page);
      await page.waitFor(`document.querySelector("#pcAiPrevWarn")`, 8000);
      const pv3 = await preview(page);
      assert((await posts(page)).length === 0 && !/สมมติ|ใจทดสอบ/.test(pv3.shown), "label name removed again and shown again, nothing sent " + JSON.stringify(pv3));
      await sendText(page);
      // (a mostly Latin text is also sent for translation: 3 requests, all with the same text)
      await page.waitFor(`window.__ai.filter(c => c.m === "POST").length >= 2 && !document.querySelector("#pcAiGo").disabled`, 8000);
      const p2 = await posts(page);
      assert(p2.every(x => x.text === "TESTOL 500 mg เลขทะเบียน 1A 844/39 โทร\n[removed]"), "sent = the label text that was shown, minus what was struck: " + JSON.stringify(p2.map(x => x.text)));
      assert(!p2.some(x => /089-111-2222|Jane|Doe|สมหญิง|สมมติ/.test(JSON.stringify(x))), "a typed name or phone is NEVER in a request");
      assert(await page.evaluate(() => !!document.querySelector("#pcAiWithdraw")), "withdraw visible while a choice is in force");
      await page.close();
    });

    await check("pc-ai: a likely name that IS on the label is underlined in the preview (not removed; the user decides); once deleted it is not sent", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
      await page.goto(`${base}/medicine.html?fakeface`);
      await openTab(page);
      const MAKER = "\nผลิตโดย บริษัท สาธิต จำกัด โทร 02-315-4421";
      await setLabel(page, "Grace Exampleton\n" + LABEL + MAKER);
      await page.evaluate(() => document.querySelector("#pcAiGo").click());
      await page.waitFor(`document.querySelector("dialog.lq-ai-consent") && document.querySelector("dialog.lq-ai-consent").open`, 8000);
      await agree(page);
      const pv = await preview(page);
      const maybe = await page.evaluate(() => ({ m: [...document.querySelectorAll("#pcAiPrevView mark[data-maybe]")].map(e => e.textContent), hint: !document.querySelector("#pcAiPrevMaybe").hidden,
        t: document.querySelector("#pcAiPrevMaybe").innerText }));
      assert(/Grace Exampleton/.test(pv.shown) && maybe.m.join() === "Grace Exampleton" && maybe.hint && /อาจเป็นชื่อคน/.test(maybe.t), "possible name underlined " + JSON.stringify(maybe));
      assert(/02-315-4421/.test(pv.shown), "the maker phone on the label is kept in the box");
      // the user deletes the name and changes ONE digit of the maker phone: a number not on the label is never sent
      await preview(page, LABEL + "\nโทร 02-315-4422");
      assert(await page.evaluate(() => document.querySelector("#pcAiPrevMaybe").hidden), "hint gone once deleted");
      const del = await page.evaluate(() => [...document.querySelectorAll("#pcAiPrevView del[data-dropped]")].map(e => e.textContent));
      assert(del.join() === "02-315-4422", "the one-digit-off phone is struck through " + JSON.stringify(del));
      await sendText(page);
      await page.waitFor(`document.querySelector("#pcAiOut")`, 8000);
      const p = await posts(page);
      assert(p.length === 2 && p.every(x => x.text === LABEL + "\nโทร"), "sent = the box minus what was struck " + JSON.stringify(p.map(x => x.text)));
      assert(!p.some(x => /4422|02-315/.test(JSON.stringify(x))), "a typed phone one digit off a label phone is NEVER in a request");
      await page.close();
    });

    await check("pc-ai: image mode + remember — text preview, then the blurred photo preview, ALWAYS; remembered after reload (text preview collapsed, " +
      "one tap away, still required); Back -> text only; withdraw asks again", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
      await page.goto(`${base}/medicine.html?fakeface`);
      await openTab(page);
      await setLabel(page, LABEL);
      await page.evaluate(() => document.querySelector("#pcAiGo").click());
      await page.waitFor(`document.querySelector("dialog.lq-ai-consent") && document.querySelector("dialog.lq-ai-consent").open`, 8000);
      await agree(page, { mode: "image", remember: true });
      const pv = await preview(page);
      assert(pv.open && pv.shown === LABEL && pv.marks === 0, "first time: preview open, the clean text unchanged " + JSON.stringify(pv));
      assert((await posts(page)).length === 0 && await page.evaluate(() => document.querySelector("#pcPrev").hidden), "nothing sent, no photo yet");
      await sendText(page);
      await page.waitFor(`document.querySelector("#pcPrevImg") && !document.querySelector("#pcPrev").hidden`, 15000);
      assert((await posts(page)).length === 0, "nothing POSTed while the photo preview waits");
      await page.evaluate(() => document.querySelector("#pcPrevUse").click());
      await page.waitFor(`document.querySelector("#pcAiOut")`, 15000);
      let p = await posts(page);
      const pf = p.find(x => x.f === "pc_fields"), pcl = p.find(x => x.f === "pc_claims");
      assert(pf && pf.mode === "image" && pf.images.length === 1 && pf.images[0].mime === "image/jpeg" && pf.images[0].len > 100 && pf.images[0].w === 300 && pf.images[0].h === 200,
        "pc_fields carries the confirmed crop " + JSON.stringify(pf && pf.images));
      assert(pcl && pcl.mode === "text" && !pcl.images.length && pcl.text === LABEL && pf.text === LABEL, "pc_claims text only; text sent = shown");
      assert(await page.evaluate(() => /ภาพสินค้าที่เบลอใบหน้า/.test(document.querySelector("#pcAiSent").innerText)), "says the blurred photo was sent");
      const state = await page.evaluate(() => ({ ...document.querySelector("#pcAiState").dataset }));
      assert(state.state === "remembered" && state.mode === "image", "remembered on this device " + JSON.stringify(state));
      // reload: remembered -> no screen; the text preview is collapsed but still required; then the photo preview; Back -> text
      await page.goto(`${base}/medicine.html?fakeface`);
      await openTab(page);
      await setLabel(page, LABEL);
      await page.evaluate(() => { window.__ai.length = 0; document.querySelector("#pcAiGo").click(); });
      const pr = await preview(page);
      assert((await dialog(page)) === null, "remembered: no consent screen");
      assert(!pr.open && (await posts(page)).length === 0, "clean text + remembered: preview collapsed, one tap away, nothing sent " + JSON.stringify(pr));
      await sendText(page);
      await page.waitFor(`document.querySelector("#pcPrevImg") && !document.querySelector("#pcPrev").hidden`, 15000);
      assert(await page.evaluate(() => window.__ai.filter(c => c.m === "POST").length === 0), "no POST before the photo is confirmed");
      await page.evaluate(() => document.querySelector("#pcPrevBack").click());
      await page.waitFor(`document.querySelector("#pcAiVia")`, 8000);
      p = await posts(page);
      assert(p.length === 2 && p.every(x => x.mode === "text" && !x.images.length), "Back -> text only " + JSON.stringify(p.map(x => [x.f, x.mode])));
      assert(await page.evaluate(() => document.querySelector("#pcAiVia").dataset.via === "cancelled"), "the page says the photo was not sent");
      // "send text only this time": text preview, no photo
      await page.evaluate(() => { window.__ai.length = 0; document.querySelector("#pcAiText").click(); });
      await preview(page);
      await sendText(page);
      await page.waitFor(`window.__ai.filter(c => c.m === "POST").length === 2`, 8000);
      assert((await posts(page)).every(x => x.mode === "text" && !x.images.length) && await page.evaluate(() => document.querySelector("#pcPrev").hidden), "text once: no photo");
      // "Don't send" in the text preview sends nothing
      await page.evaluate(() => { window.__ai.length = 0; document.querySelector("#pcAiGo").click(); });
      await preview(page);
      await page.evaluate(() => document.querySelector("#pcAiPrevCancel").click());
      await page.waitFor(`document.querySelector("#pcAiNotice")`, 8000);
      assert((await posts(page)).length === 0, "cancelled preview: nothing sent");
      // withdraw -> asked again; "don't send" sends nothing
      await page.evaluate(() => document.querySelector("#pcAiWithdraw").click());
      assert(await page.evaluate(() => !document.querySelector("#pcAiState") && !localStorage.getItem("lq-ai-consent").includes('"pc"')), "withdraw clears the choice at once");
      await page.evaluate(() => { window.__ai.length = 0; document.querySelector("#pcAiGo").click(); });
      await page.waitFor(`document.querySelector("dialog.lq-ai-consent") && document.querySelector("dialog.lq-ai-consent").open`, 8000);
      await agree(page, { cancel: true });
      await page.waitFor(`document.querySelector("#pcAiNotice")`, 8000);
      assert((await posts(page)).length === 0, "declined: nothing sent");
      await page.close();
    });

    await check("pc-ai: a name on the label BLOCKS image mode (no photo preview, no POST); text only goes through the open text preview", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, NET, REMEMBER_IMAGE], isolated: true });
      await page.goto(`${base}/medicine.html?fakeface`);
      await openTab(page);
      await setLabel(page, PII);
      await page.evaluate(() => document.querySelector("#pcAiGo").click());
      await page.waitFor(`document.querySelector("#pcAiOffer")`, 8000);
      assert((await dialog(page)) === null, "remembered image choice: no screen");
      const o = await page.evaluate(() => ({ t: document.querySelector("#pcAiOffer").innerText, prev: document.querySelector("#pcPrev").hidden }));
      assert(o.prev, "no photo preview: the photo path never starts");
      assert(/สมมติ ใจทดสอบ/.test(o.t) && /081-234-5678/.test(o.t), "shows what would be removed " + o.t);
      assert((await posts(page)).length === 0, "nothing sent before the choice");
      await page.evaluate(() => document.querySelector("#pcAiOfferGo").click());
      const pv = await preview(page);
      assert(pv.open && (await posts(page)).length === 0, "remembered choice never skips the open preview of a redacted text");
      await sendText(page);
      await page.waitFor(`document.querySelector("#pcAiOut")`, 8000);
      const p = await posts(page);
      assert(p.length === 2 && p.every(x => x.mode === "text" && !x.images.length && x.text === pv.shown && !/สมมติ|081-234-5678/.test(x.text)), "text only, redacted, = shown " + JSON.stringify(p));
      assert(await page.evaluate(() => document.querySelector("#pcAiVia").dataset.via === "guard"), "the page says why the photo was not sent");
      await page.close();
    });

    await check("pc-ai: dispensing / prescription label — default setting 'off': no consent screen, no request at all, on-device results stay; " +
      "'text-preview' setting: photo blocked, text only after the open preview", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, NET, REMEMBER_IMAGE], isolated: true });
      await page.goto(`${base}/medicine.html?fakeface`);
      await openTab(page);
      await setLabel(page, DISP);
      await page.evaluate(() => document.querySelector("#pcAiGo").click());
      await page.waitFor(`document.querySelector("#pcAiNotice")`, 8000);
      const n = await page.evaluate(() => ({ t: document.querySelector("#pcAiNotice").innerText, ai: window.__ai.filter(c => /\/v1\/ai\//.test(c.url)).length,
        claims: [...document.querySelectorAll("#pcClaims li")].length }));
      assert(/ฉลากยาที่จ่ายให้ผู้ป่วย/.test(n.t) && n.ai === 0 && (await dialog(page)) === null, "AI off for dispensing labels, nothing asked or sent " + JSON.stringify(n));
      assert(n.claims >= 1, "on-device results stay");
      const page2 = await browser.newPage(null, { initScripts: [INIT, NET, REMEMBER_IMAGE, `window.LENSIQ_PC_DISPENSING_AI="text-preview";`], isolated: true });
      await page2.goto(`${base}/medicine.html?fakeface`);
      await openTab(page2);
      await setLabel(page2, DISP);
      await page2.evaluate(() => document.querySelector("#pcAiGo").click());
      await page2.waitFor(`document.querySelector("#pcAiOffer")`, 8000);
      await page2.evaluate(() => document.querySelector("#pcAiOfferGo").click());
      const pv = await preview(page2);
      assert(pv.open && (await posts(page2)).length === 0, "open preview, nothing sent yet");
      await sendText(page2);
      await page2.waitFor(`document.querySelector("#pcAiOut")`, 8000);
      const p = await posts(page2);
      assert(p.length === 2 && p.every(x => x.mode === "text" && x.text === pv.shown && !/สมพร|ใจสมมติ|6512345/.test(x.text)), "text only, = shown, no name " + JSON.stringify(p));
      await page.close(); await page2.close();
    });

    await check("pc-ai: product-label evidence — a shipping label that lists the product, or a text with no label evidence: no consent screen, no request " +
      "(text mode and image mode), a clear message in TH / EN / 中文, on-device results stay; a decoded barcode is evidence; a product label: flow unchanged", async () => {
      const ai = page => page.evaluate(() => window.__ai.filter(c => /\/v1\/ai\//.test(c.url)).length);
      const notice = page => page.evaluate(() => { const n = document.querySelector("#pcAiNotice"); return n ? { t: n.innerText, why: n.dataset.reason || "" } : null; });
      // text mode (nothing remembered) and image mode (remembered image choice): the same decision
      for (const [mode, scripts] of [["text", [INIT, NET]], ["image", [INIT, NET, REMEMBER_IMAGE]]]) {
        const page = await browser.newPage(null, { initScripts: scripts, isolated: true });
        await page.goto(`${base}/medicine.html?fakeface`);
        await openTab(page);
        await setCapture(page, SHIP);
        await page.evaluate(() => document.querySelector("#pcAiGo").click());
        await page.waitFor(`document.querySelector("#pcAiNotice")`, 8000);
        let n = await notice(page);
        assert(n.why === "personal-doc" && /เอกสารส่วนบุคคล/.test(n.t) && /ผลตรวจในเครื่อง/.test(n.t), mode + ": the message says why and that on-device results still work " + JSON.stringify(n));
        assert((await dialog(page)) === null && (await ai(page)) === 0, mode + ": no consent screen, no request of any kind to the AI gateway");
        assert(await page.evaluate(() => !document.querySelector("#pcAiPreview") && !document.querySelector("#pcAiOffer") && document.querySelector("#pcPrev").hidden),
          mode + ": no text preview, no offer, no photo preview");
        assert(await page.evaluate(() => [...document.querySelectorAll("#pcClaims li")].length >= 1 && !!document.querySelector("#pcRegs [data-country=TH]")), mode + ": on-device results stay");
        assert(await page.evaluate(() => !window.__ai.some(c => /สมมติ|081-234-5678|TESTOL/.test(JSON.stringify(c)))), mode + ": no label data left the page");
        // no label evidence at all
        await setCapture(page, PLAIN);
        await page.evaluate(() => document.querySelector("#pcAiGo").click());
        await page.waitFor(`document.querySelector("#pcAiNotice") && document.querySelector("#pcAiNotice").dataset.reason === "no-product"`, 8000);
        n = await notice(page);
        assert(/ไม่เหมือนฉลากสินค้า/.test(n.t) && (await dialog(page)) === null && (await ai(page)) === 0, mode + ": no evidence -> AI off " + JSON.stringify(n));
        await page.close();
      }
      // the same capture with a barcode decoded on this device: product evidence -> the usual flow; the barcode goes to the Worker as evidence
      const page = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
      await page.goto(`${base}/medicine.html?fakeface`);
      await openTab(page);
      await setCapture(page, PLAIN, [{ rawValue: "8850006939727", format: "ean_13" }]);
      await page.evaluate(() => document.querySelector("#pcAiGo").click());
      await page.waitFor(`document.querySelector("dialog.lq-ai-consent") && document.querySelector("dialog.lq-ai-consent").open`, 8000);
      await agree(page);
      let pv = await preview(page);
      assert(pv.shown === PLAIN && /LENSIQ/.test(await page.evaluate(() => (document.querySelector("#pcAiPrevCodes") || {}).innerText || "")),
        "the preview says the barcode number goes to the server " + JSON.stringify(pv));
      await sendText(page);
      await page.waitFor(`document.querySelector("#pcAiOut")`, 8000);
      let p = await posts(page);
      assert(p.length >= 2 && p.every(x => x.mode === "text" && x.text === PLAIN && x.gtins.join() === "8850006939727" && !x.images.length),
        "barcode evidence sent with the text " + JSON.stringify(p));
      await page.close();
      // a product label: flow unchanged (consent -> preview -> send); the parsed registration number rides along as evidence
      const page2 = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
      await page2.goto(`${base}/medicine.html?fakeface`);
      await openTab(page2);
      await setCapture(page2, LABEL);
      await page2.evaluate(() => document.querySelector("#pcAiGo").click());
      await page2.waitFor(`document.querySelector("dialog.lq-ai-consent") && document.querySelector("dialog.lq-ai-consent").open`, 8000);
      await agree(page2);
      pv = await preview(page2);
      await sendText(page2);
      await page2.waitFor(`document.querySelector("#pcAiOut")`, 8000);
      p = await posts(page2);
      assert(p.length === 2 && p.every(x => x.text === LABEL && x.regs.join() === "1A 844/39" && !x.gtins.length),
        "product label: sent as before, with the registration number as evidence " + JSON.stringify(p));
      // an edit that removes every label cue: decided again, nothing sent
      await page2.evaluate(() => { window.__ai.length = 0; document.querySelector("#pcAiGo").click(); });
      await preview(page2, "TESTOL 500 mg");
      await sendText(page2);
      await page2.waitFor(`document.querySelector("#pcAiNotice") && document.querySelector("#pcAiNotice").dataset.reason === "no-product"`, 8000);
      assert((await posts(page2)).length === 0, "edited text without label evidence: nothing sent");
      await page2.close();
      // English and 中文: the two messages, no Thai left
      const page3 = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
      for (const [lang, re1, re2] of [["en", /personal document/, /does not look like a product label/], ["zh", /个人文件/, /不像产品标签/]]) {
        await page3.goto(`${base}/medicine.html?lang=${lang}&fakeface`);
        await page3.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
        await openTab(page3);
        for (const [text, re] of [[SHIP, re1], [PLAIN, re2]]) {
          await setCapture(page3, text);
          await page3.evaluate(() => document.querySelector("#pcAiGo").click());
          await page3.waitFor(`document.querySelector("#pcAiNotice")`, 8000);
          const n = await notice(page3), c = await coverage(page3);
          assert(re.test(n.t) && c.pct === 0 && !BAN.test(n.t), `${lang} notice ${JSON.stringify(n)} Thai left ${JSON.stringify(c.top)}`);
          assert((await ai(page3)) === 0 && (await dialog(page3)) === null, lang + ": nothing asked, nothing sent");
        }
      }
      await page3.close();
    });

    await check("pc-ai: guidance when refused — front-panel text: the next step (registration-number side / ingredients / barcode) with one-tap buttons, " +
      "no consent screen, no request; no retry hint for a personal document or a dispensing label; after a barcode fact is added AI is allowed; TH / EN / 中文", async () => {
      const ai = page => page.evaluate(() => window.__ai.filter(c => /\/v1\/ai\//.test(c.url)).length);
      const guide = page => page.evaluate(() => { const g = document.querySelector("#pcAiGuide");
        return g ? { t: g.innerText, bar: !!g.querySelector("button#pcAiGuideBar"), shot: !!g.querySelector("button#pcAiGuideShot") } : null; });
      const FRONT = "ซาแมพลาม็อล ตราสาธิต\nบรรเทาปวด ลดไข้\nสูตรใหม่"; // the front of a pack: a name and a slogan, no label details
      const page = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
      await page.goto(`${base}/medicine.html?fakeface`);
      await openTab(page);
      await setCapture(page, FRONT);
      assert(/เลขทะเบียน/.test(await page.evaluate(() => document.querySelector("#pcAiNeeds").innerText)) &&
        /บาร์โค้ด/.test(await page.evaluate(() => document.querySelector("#pcAiNeeds").innerText)), "the panel says up front which side AI needs");
      await page.evaluate(() => document.querySelector("#pcAiGo").click());
      await page.waitFor(`document.querySelector("#pcAiNotice") && document.querySelector("#pcAiNotice").dataset.reason === "no-product"`, 8000);
      let g = await guide(page);
      assert(g && /เลขทะเบียน/.test(g.t) && /ส่วนประกอบ/.test(g.t) && /บาร์โค้ด/.test(g.t) && g.bar && g.shot, "front panel: the next step and both one-tap buttons " + JSON.stringify(g));
      assert((await dialog(page)) === null && (await ai(page)) === 0, "front panel: no consent screen, no request of any kind");
      assert(await page.evaluate(() => !document.querySelector("#pcAiPreview") && !document.querySelector("#pcAiOffer") && !!document.querySelector("#pcOut").innerHTML &&
        !!document.querySelector("#pcText")), "front panel: no preview, no offer; on-device results stay");
      // one tap: the page's own barcode scan runs on the current picture (noise: none found), nothing is sent
      await page.evaluate(() => document.querySelector("#pcAiGuideBar").click());
      await page.waitFor(`/พบบาร์โค้ด/.test(document.querySelector("#pcStatus").innerText) && document.querySelector("#pcAiGuideShot") && !document.querySelector("#pcAiGuideShot").disabled`, 30000);
      assert((await ai(page)) === 0 && (await dialog(page)) === null, "the barcode scan button sends nothing and still no consent screen");
      // one tap: "photograph another side" goes to the page's camera button
      assert(await page.evaluate(() => { let n = 0; const b = document.querySelector("#pcCamBtn");
        b.addEventListener("click", e => { n++; e.stopImmediatePropagation(); }, { capture: true, once: true });
        document.querySelector("#pcAiGuideShot").click(); return n === 1 && document.activeElement === b; }), "the retake button opens the page's own camera control");
      // a barcode decoded on this device for the same capture: the refusal goes, AI is allowed (consent screen as usual)
      await setCapture(page, FRONT, [{ rawValue: "8850006939727", format: "ean_13" }]);
      await page.waitFor(`document.querySelector("#pcAiReady") && !document.querySelector("#pcAiNotice") && !document.querySelector("#pcAiGuide")`, 8000);
      assert((await ai(page)) === 0, "still nothing sent until the user asks again");
      await page.evaluate(() => document.querySelector("#pcAiGo").click());
      await page.waitFor(`document.querySelector("dialog.lq-ai-consent") && document.querySelector("dialog.lq-ai-consent").open`, 8000);
      await agree(page);
      const pv = await preview(page);
      await sendText(page);
      await page.waitFor(`document.querySelector("#pcAiOut")`, 8000);
      const p = await posts(page);
      assert(pv.shown === FRONT && p.length >= 2 && p.every(x => x.mode === "text" && x.text === FRONT && x.gtins.join() === "8850006939727"),
        "with the barcode fact: AI allowed " + JSON.stringify(p));
      // a personal document and a dispensing label: an honest message, NO retry hint, no buttons
      for (const [text, why] of [[SHIP, "personal-doc"], [DISP, "dispensing"]]) {
        await page.evaluate(() => { window.__ai.length = 0; });
        await setCapture(page, text);
        await page.evaluate(() => document.querySelector("#pcAiGo").click());
        await page.waitFor(`document.querySelector("#pcAiNotice") && document.querySelector("#pcAiNotice").dataset.reason === "${why}"`, 8000);
        const t = await page.evaluate(() => document.querySelector("#pcAiNotice").innerText);
        assert((await guide(page)) === null && !/ถ่าย|สแกน|อีกครั้ง/.test(t) && /ผลตรวจในเครื่อง/.test(t), why + ": no retry hint, on-device results mentioned " + t);
        assert((await ai(page)) === 0 && (await dialog(page)) === null, why + ": nothing asked, nothing sent");
      }
      await page.close();
      // English and 中文: the guidance, no Thai left
      const page2 = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
      for (const [lang, re, reReady] of [["en", /registration number.*ingredients.*barcode/is, /Ask AI/], ["zh", /注册号.*成分.*条码/s, /请 AI 查看/]]) {
        await page2.goto(`${base}/medicine.html?lang=${lang}&fakeface`);
        await page2.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
        await openTab(page2);
        await setCapture(page2, FRONT);
        await page2.evaluate(() => document.querySelector("#pcAiGo").click());
        await page2.waitFor(`document.querySelector("#pcAiGuide")`, 8000);
        g = await guide(page2);
        let c = await coverage(page2);
        assert(re.test(g.t) && g.bar && g.shot && c.pct === 0 && !BAN.test(g.t), `${lang} guidance ${JSON.stringify(g)} Thai left ${JSON.stringify(c.top)}`);
        await setCapture(page2, FRONT, [{ rawValue: "8850006939727", format: "ean_13" }]);
        await page2.waitFor(`document.querySelector("#pcAiReady")`, 8000);
        c = await coverage(page2);
        assert(reReady.test(await page2.evaluate(() => document.querySelector("#pcAiReady").innerText)) && c.pct === 0, `${lang} ready line; Thai left ${JSON.stringify(c.top)}`);
        assert((await ai(page2)) === 0 && (await dialog(page2)) === null, lang + ": nothing asked, nothing sent");
      }
      await page2.close();
    });

    await check("pc-ai: English and 中文 — no Thai outside translate=no content with the text preview and the AI results open; no verdict words", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
      for (const lang of ["en", "zh"]) {
        await page.goto(`${base}/medicine.html?lang=${lang}&fakeface`);
        await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
        await openTab(page);
        await setLabel(page, PII);
        await page.evaluate(() => document.querySelector("#pcAiGo").click());
        await page.waitFor(`document.querySelector("dialog.lq-ai-consent") && document.querySelector("dialog.lq-ai-consent").open`, 8000);
        const d = await dialog(page);
        assert(!/[ก-๙]/.test(d.replace(/ลบภายใน 30 วัน/g, "")), lang + " consent screen has no Thai: " + d);
        await agree(page);
        await preview(page);
        let c = await coverage(page);
        assert(c.pct === 0, `${lang} preview: Thai left ${c.pct}% ${JSON.stringify(c.top)}`);
        await sendText(page);
        await page.waitFor(`document.querySelector("#pcAiOut")`, 8000);
        c = await coverage(page);
        assert(c.pct === 0, `${lang}: Thai left ${c.pct}% ${JSON.stringify(c.top)}`);
        const t = await page.evaluate(() => document.querySelector("#pcAi").innerText);
        assert(lang === "en" ? /AI estimate/.test(t) && /Removed before sending/.test(t) : /AI 估计/.test(t), lang + " text " + t.slice(0, 200));
        assert(!BAN.test(t), lang + " no verdict words");
      }
      await page.goto(`${base}/medicine.html?lang=en&fakeface`);
      await page.waitFor(`window.LQI18N && LQI18N.lang === "en"`, 8000);
      await openTab(page);
      await setLabel(page, DISP);
      await page.evaluate(() => document.querySelector("#pcAiGo").click());
      await page.waitFor(`document.querySelector("#pcAiNotice")`, 8000);
      const c = await coverage(page);
      assert(c.pct === 0 && /dispensing label/.test(await page.evaluate(() => document.querySelector("#pcAiNotice").innerText)), "en dispensing notice " + JSON.stringify(c.top));
      await page.close();
    });
  } finally { await browser.close(); }
}
