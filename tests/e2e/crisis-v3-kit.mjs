// tests/e2e/crisis-v3-kit.mjs — FIXED TEST SET "crisis-v3" (owner decision 2026-11-17, crisis v3), locked BEFORE any v3 product
// code on branch crisis-v3 (base origin/crisis-rules-1323 7442dad). Locked files: this kit, crisis-v3-{a,b,c,d}.e2e.mjs,
// tests/unit/crisis-v3.test.js (copies + sha256 in ~/LENSIQ-field/evals/crisis-v3/, evals-locks/crisis-v3.sha256).
// Owner's rules (every fortune page incl. compat and petread once merged, TH / EN / ZH):
//   a  with the crisis flag set the reading CONTINUES in full structure like for anyone else; no card replaces it; nothing tells
//      the person they were flagged;
//   b  that session uses the gentle, hope-oriented wording: no harsh negative predictions; hard limits always; straight mode off;
//   c  no prices, purchase buttons, paid teasers, plans, seller links, share or print prompts in that session;
//   d  at the END of the reading only: one short warm line and one button (tel:1323, >= 44 px) and the small
//      "ช่องทางให้คำปรึกษา" link under it; nothing in the middle of the reading;
//   e  no statistics for that session (decision 77);
//   and no echo of the user's crisis text anywhere.
import { assert } from "./cdp.mjs";

export const S = JSON.stringify;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const LANGS = ["th", "en", "zh"];
export const WIDTHS = [360, 393, 430];
export const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
export const PHRASE = { th: "อยากตายจริงๆ", en: "I want to die tonight", zh: "我不想活了" };
/** the closing line (rule d): warm, short; mentions talking to someone close and 1323 */
export const CLOSE = { th: /ทุกข์ใจ[\s\S]*1323|1323[\s\S]*รับฟัง/, en: /(?:talk|someone)[\s\S]*1323|1323[\s\S]*listen/i, zh: /(?:倾听|聊)[\s\S]*1323|1323[\s\S]*(?:倾听|聊)/ };
export const COUNSEL = { th: /ช่องทางให้คำปรึกษา/, en: /counsel/i, zh: /咨询/ };
/** wording that would tell the person they were flagged (the old card and soft step) */
export const FLAGGED = {
  th: /ขอหยุดคำทำนาย|ฟังดูหนักใจ|คุณโอเคไหม|ขอไม่อ่านดวง|ข้อความนี้ฟังดู/,
  en: /pause the reading|sounds heavy|are you okay|will not give a fortune|this sounds/i,
  zh: /暂停这次解读|听起来很沉重|你还好吗|先不做占卜/,
};
/** harsh negative predictions (rule b); checked in the visible reading text. Card / item NAMES are removed first (the Death card
 *  is a card name, not a prediction): elements marked as titles (h1-h6, b, strong, .fa-card-name, [data-card]) are skipped. */
export const HARSH = {
  th: /เสียชีวิต|ความตาย(?!ตัว)|(?<!ไม่)ตาย(?!ตัว|ใจ)|อุบัติเหตุ|โรคร้าย|มะเร็ง|ป่วยหนัก|ล้มละลาย|หายนะ|วิบัติ|พังพินาศ|เคราะห์ร้าย|ซวยหนัก|อัปมงคลร้ายแรง|สิ้นหวัง|หย่าร้าง/,
  en: /\b(?:death|die|dies|dying|dead|fatal|accident\w*|terminal|cancer|disaster\w*|doom\w*|bankrupt\w*|ruin(?:ed|ous)?|catastroph\w*|hopeless|divorce)\b/i,
  zh: /死亡|去世|意外事故|车祸|绝症|癌|灾难|破产|厄运|灾祸|绝望|离婚|丧命/,
};
/** sales elements (rule c) */
export const SALES_SEL = '[data-lq-upsell], [data-lq-remedy], [data-lq-paid], [data-lq-merit], .fa-plan, [data-lq-plan], [id$="Share"], [id$="Print"], [data-lq-share], [data-lq-print], .lq-merit, .lq-paid';
// RE-LOCK 2 2026-11-17 (test fault found on the BASE run, before the build was measured): "元" matched 元素 (element) on every
// Chinese page and "print" matched the operator link "print the camera notice (sign D)"; a price is now a number with 元 / ¥, and
// print means printing the reading (print this / the reading / your / report / result; 打印 + 结果 / 报告 / 解读 / 本页)
export const SALES_TEXT = {
  th: /฿|บาท|ราคา|ซื้อ|ชำระเงิน|ปลดล็อก|อ่านฉบับเต็ม.*บาท|แชร์|พิมพ์รายงาน|พิมพ์ผล|บันทึกรูป|สั่งซื้อ|ร้านแนะนำ/,
  en: /\bTHB\b|\bbaht\b|\bprice|\bbuy\b|\bpurchase|\bunlock|\bpay\b|\bshare\b|\bprint (?:this|the reading|your|report|result)|\bsave as pdf|\bshop\b|\bseller/i,
  zh: /价格|购买|付款|解锁|分享|打印(?:结果|报告|解读|本页)|商店|卖家|\d\s*元|¥/,
};
export const OTHER_NUMS = /(?<!\d)(?:1669|191|1300)(?!\d)|02[\s-]?113[\s-]?6789/;

/** init scripts: language, analytics consent + a test API base, and a recorder of every analytics request */
export const INIT = lang => [
  `try { localStorage.setItem("lq-lang", ${S(lang)}); localStorage.setItem("lq-analytics", JSON.stringify({ v: 1, cv: "a1", choice: "yes", at: "2026-11-17" })); } catch (e) {}`,
  `window.LENSIQ_API_BASE = "http://127.0.0.1:9"; window.__lqEvents = [];
   (() => { const nb = navigator.sendBeacon ? navigator.sendBeacon.bind(navigator) : null;
     try { Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: (u, b) => { if (/\\/v1\\/events/.test(String(u))) window.__lqEvents.push("beacon " + u); return true; } }); } catch (e) {}
     const f = window.fetch.bind(window);
     window.fetch = (u, o) => { const s = String(u && u.url || u); if (/\\/v1\\/events/.test(s)) { window.__lqEvents.push("fetch " + s); return Promise.resolve(new Response("{}")); }
       if (s.startsWith("http://127.0.0.1:9")) return Promise.resolve(new Response("{}", { status: 404 })); return f(u, o); }; })();`,
];
export const CALM = `try { sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) {}`;
const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };
export const DET = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const CAT = { cls: 15, score: 0.91, x: 0.2, y: 0.15, w: 0.5, h: 0.7 };
export const PET_DET = `window.__PET_DETS = ${S([CAT])}; window.__LQ_FAKE_DET = function (key) { return key === "pet" ? window.__PET_DETS : []; };`;
const SYNTH = `(() => { const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d");
  x.fillStyle = "#5b8bd6"; x.fillRect(0, 0, 640, 480); x.fillStyle = "#e08a2e"; x.beginPath(); x.ellipse(300, 280, 150, 120, 0, 0, 7); x.fill();
  x.fillStyle = "#f4d6b0"; x.fillRect(470, 40, 130, 200); return c.toDataURL("image/png"); })()`;

const sections = n => `document.querySelectorAll(".fa-section").length >= ${n} && !document.querySelector(".fa-loading")`;
const setv = (sel, v) => `(() => { const e = document.querySelector(${S(sel)}); if (!e) throw new Error("no field ${sel.replace(/"/g, "'")}"); e.focus(); e.value = ${S(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`;
const run = (p, js) => p.evaluate(js);
const lc = async (p, t) => {
  if (t != null) throw new Error("lc pages have no free-text field for a phrase");
  await run(p, `(() => { document.getElementById("lcDay").value = "12"; document.getElementById("lcMonth").value = "5"; document.getElementById("lcYear").value = "2533";
    document.getElementById("lcTime").value = "08:00"; document.querySelector("#lcForm button[type=submit]").click(); return true; })()`);
  await p.waitFor(sections(2), 20000);
};

/** page -> { field (the free-text field the phrase goes into, or null), cam, read(page, phrase|null) -> after the reading is drawn,
 *  root (the reading's container) }. Flows follow the existing locked sets (fortune-layout, crisis-net-hotfix, fortune-pet, fortune-compat). */
export const PAGES = {
  dream: { field: "#drText", root: "#drResult", read: async (p, t) => {
    await run(p, setv("#drText", t == null ? "ฝันเห็นงูใหญ่ในบ้าน แล้วนั่งเครื่องบินไปทะเล" : t)); await sleep(300);
    await run(p, `(() => { if (!document.querySelector("#drSel .dr-x")) { const c = document.querySelector(".dr-pop"); if (c) c.click(); }
      const m = document.querySelector('input[name="drMood"]'); if (m) m.click(); const x = document.querySelector('input[name="drTime"]'); if (x) x.click();
      document.getElementById("drForm").requestSubmit(); return true; })()`);
    await p.waitFor(sections(3), 20000);
  } },
  tarot: { field: "#trQuestion", root: "#trResult", read: async (p, t) => {
    if (t != null) await run(p, setv("#trQuestion", t));
    await run(p, `(() => { document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click(); document.getElementById("trStart").click(); return true; })()`);
    await p.waitFor(`!document.getElementById("trPick").hidden`, 15000); await sleep(400);
    await run(p, `(() => { document.getElementById("trAuto").click(); return true; })()`); await sleep(900);
    await run(p, `(() => { document.getElementById("trReveal").click(); return true; })()`);
    await p.waitFor(sections(3), 25000);
  } },
  iching: { field: "#icQuestion", root: "#icResult", read: async (p, t) => {
    if (t != null) await run(p, setv("#icQuestion", t));
    await run(p, `(() => { document.getElementById("icStart").click(); return true; })()`); await sleep(400);
    await run(p, `(() => { const a = document.getElementById("icAuto"); if (a) a.click(); return true; })()`);
    await p.waitFor(sections(3), 25000);
  } },
  horoscope: { field: "#hsName", root: "#hsResult", read: async (p, t) => {
    if (t != null) await run(p, setv("#hsName", t));
    await run(p, setv("#hsDay", "15")); await run(p, setv("#hsMonth", "8")); await run(p, setv("#hsYear", "1990"));
    await run(p, `(() => { document.getElementById("hsGo").click(); return true; })()`); await p.waitFor(sections(3), 20000);
  } },
  numbers: { field: "#nmName", root: "#nmResult", read: async (p, t) => {
    if (t != null) await run(p, setv("#nmName", t));
    await run(p, setv("#nmPhone", "0812345678")); await run(p, `(() => { document.getElementById("nmGo").click(); return true; })()`);
    await p.waitFor(sections(2), 15000);
  } },
  report: { field: "#rpName", root: "#rpOut", read: async (p, t) => {
    await p.waitFor(() => window.__rp && document.getElementById("rpMode").textContent.length > 10, 8000);
    if (t != null) await run(p, setv("#rpName", t));
    await run(p, `(() => { document.querySelector('[data-rp-type="report_basic"]').click();
      document.getElementById("rpAYear").value = document.documentElement.lang === "th" ? "2533" : "1990"; document.getElementById("rpGo").click(); return true; })()`);
    await p.waitFor(`document.querySelectorAll("#rpOut .rp-part").length >= 3`, 15000);
  } },
  faceread: { field: "#frNick", cam: true, root: "#frResult", read: async (p, t) => {
    await run(p, `(() => { document.getElementById("frStartCam").click(); return true; })()`);
    await p.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
    await p.evaluate(d => { window.__dets = d; }, [FACE]);
    await p.waitFor(`!document.getElementById("frRead").disabled`, 8000);
    if (t != null) await run(p, setv("#frNick", t));
    await run(p, `(() => { document.getElementById("frRead").click(); return true; })()`);
    await p.waitFor(`!document.getElementById("frResult").hidden && ` + sections(3), 25000);
  } },
  palm: { field: "#plNick", cam: true, root: "#plResult", read: async (p, t) => {
    await p.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
    await run(p, `(() => { document.getElementById("plStartCam").click(); return true; })()`);
    await p.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 10000);
    await p.evaluate(d => { window.__dets = d; }, [HAND]); await sleep(600);
    await run(p, `(() => { document.getElementById("plSnap").click(); return true; })()`);
    await p.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
    if (t != null) await run(p, setv("#plNick", t));
    await run(p, `(() => { document.getElementById("plRead").click(); return true; })()`);
    await p.waitFor(`!document.getElementById("plResult").hidden && document.querySelectorAll("#plNarr .fa-section").length >= 3`, 25000);
  } },
  zodiac: { field: null, root: "#zdResult", read: async (p, t) => {
    if (t != null) throw new Error("zodiac has no free-text field for a phrase");
    await run(p, `(() => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); return true; })()`);
    await p.waitFor(sections(3), 15000);
  } },
  astro: { field: null, root: "#asResult", read: async (p, t) => {
    if (t != null) throw new Error("astro has no free-text field for a phrase");
    await run(p, setv("#asDay", "15")); await run(p, setv("#asMonth", "5")); await run(p, setv("#asYear", "2533"));
    await run(p, `(() => { document.getElementById("asForm").requestSubmit(); return true; })()`); await p.waitFor(sections(3), 15000);
  } },
  fengshui: { field: null, root: "#fsResult", read: async (p, t) => {
    if (t != null) throw new Error("fengshui has no free-text field for a phrase");
    await run(p, setv("#fsDay", "15")); await run(p, setv("#fsMonth", "6")); await run(p, setv("#fsYear", "2533"));
    await run(p, `(() => { document.getElementById("fsKuaForm").requestSubmit(); return true; })()`); await sleep(500);
    await run(p, `(() => { document.getElementById("fsReadBtn").click(); return true; })()`); await p.waitFor(sections(2), 15000);
  } },
  bazi: { field: null, root: "#lcResult", read: lc }, taksa: { field: null, root: "#lcResult", read: lc },
  lek7: { field: null, root: "#lcResult", read: lc }, lifegraph: { field: null, root: "#lcResult", read: lc },
  compat: { field: "#cpNick0", root: "#cpResult", optional: true, read: async (p, t) => {
    await p.waitFor(`!!window.LQCompat && !!document.getElementById("cpGo")`, 15000);
    await run(p, `(() => { const c = document.getElementById("cpConsent"); if (!c.checked) c.click(); return true; })()`);
    for (const [i, d] of [[0, { d: 14, m: 2, y: 1988 }], [1, { d: 3, m: 9, y: 1992 }]]) {
      await run(p, `(() => { const fs = document.querySelector('[data-cp-person="${i}"]');
        const set = (q, v) => { const e = fs.querySelector(q); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); };
        set("select[name=d]", "${d.d}"); set("select[name=m]", "${d.m}"); set("input[name=y]", "${d.y}"); return true; })()`);
    }
    if (t != null) await run(p, setv("#cpNick0", t));
    await run(p, `(() => { document.getElementById("cpGo").click(); return true; })()`);
    await p.waitFor(`!!document.querySelector("#cpResult [data-compat-overview]") && ` + sections(2), 20000);
  } },
  petread: { field: "#petName", root: "#petReading", optional: true, pet: true, read: async (p, t) => {
    await p.waitFor("window.__LQPET && window.__LQPET.ready", 15000);
    await p.evaluate(`window.__LQPET.useImage(${SYNTH})`); await p.waitFor("window.__LQPET.st.detected === true", 15000);
    await run(p, `(() => { const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
      set("petName", ${S(t == null ? "Mochi" : t)}); set("petBirth", "2021-03-14"); set("petOwnerBirth", "1990-07-02"); document.getElementById("petRead").click(); return true; })()`);
    await p.waitFor(`document.querySelectorAll("#petReading .fa-section").length >= 2`, 15000);
  } },
};
/** pages without a reading (top bar and closing rules only) */
export const NO_READING = ["fortune", "planner", "luckycolor", "cat-fortune"];

/** open a page (own context) in a language at a width, with analytics recording; `calm` = a later page of the crisis session */
export async function open(browser, base, p, { lang, width, calm = false, fakeCams }) {
  const cfg = PAGES[p] || {};
  const init = INIT(lang).concat(calm ? [CALM] : [], cfg.cam ? [fakeCams, DET] : [], cfg.pet ? [PET_DET] : []);
  const page = await browser.newPage(null, { isolated: true, initScripts: init });
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: width <= 360 ? 740 : 852, deviceScaleFactor: 2, mobile: true });
  const q = cfg.cam ? "?cpu&fakedet&nosw" : cfg.pet ? "?fakedet&nosw" : "?nosw";
  await page.goto(`${base}/${p}.html${q}&lang=${lang}`);
  await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])}`, 12000);
  await sleep(450);
  return page;
}
/** does the page exist on this branch (compat / petread merge later) */
export const exists = async (base, p) => { try { return (await fetch(`${base}/${p}.html`)).ok; } catch (e) { return false; } };

const VIS = `const vis = e => { if (!e || !e.isConnected) return false;
    if (e.checkVisibility && !e.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    for (let x = e.parentElement; x; x = x.parentElement) if (x.tagName === "DETAILS" && !x.open && !(x.querySelector(":scope > summary") || { contains: () => false }).contains(e)) return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const name = e => e ? (e.id ? "#" + e.id : e.tagName.toLowerCase() + (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\\s+/).join(".") : "")) : "";`;

/** visible text nodes (input values excluded); `outside` drops the header (top-bar 1323 control) */
const TEXTS = `(() => { ${VIS} const out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const p = n.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA|OPTION)$/.test(p.tagName) || !n.textContent.trim() || !vis(p)) continue; out.push(n.textContent); }
  return out; })()`;
export const baseline = page => page.evaluate(TEXTS);

/** every v3 fact about the page after a reading in the crisis session */
export const FACTS = (lang, root) => `(() => { ${VIS}
  const main = document.querySelector("main") || document.body, rootEl = document.querySelector(${S(root || "main")}) || main;
  const secs = [...main.querySelectorAll(".fa-section")].filter(vis), last = secs[secs.length - 1];
  const cards = [...document.querySelectorAll(".fa-support, .fa-soft")].filter(vis).map(name);
  const text = [...document.querySelectorAll("main, dialog[open]")].map(e => e.innerText).join("\\n");
  const readText = secs.concat([...main.querySelectorAll(".fa-summary")].filter(vis)).map(s => { const c = s.cloneNode(true);
    c.querySelectorAll("h1,h2,h3,h4,h5,h6,b,strong,.fa-card-name,[data-card],summary").forEach(x => x.remove()); return c.innerText; }).join("\\n");
  const straight = [...document.querySelectorAll('.fa-straight, [data-fa-mode="straight"]')].filter(vis).map(name);
  const sales = [...document.querySelectorAll(${S(SALES_SEL)})].filter(vis).map(name);
  const salesText = [...main.querySelectorAll("button, a, [role=button]")].filter(vis).map(b => b.innerText.trim()).filter(t => ${SALES_TEXT[lang].toString()}.test(t));
  const helps = [...main.querySelectorAll(".lq-helpline, .lq-call, .lq-call-mini, a[href^='tel:'], a[href*='counselling.html']")].filter(vis);
  const lines = [...main.querySelectorAll(".lq-helpline")].filter(vis);
  const close = lines[0] || null;
  const outsideClose = helps.filter(h => !(close && (close === h || close.contains(h)))).map(name);
  const tels = close ? [...close.querySelectorAll('a[href^="tel:"]')].filter(vis).map(a => { const b = a.getBoundingClientRect(); return { h: a.getAttribute("href"), w: Math.round(b.width), ht: Math.round(b.height) }; }) : [];
  const after = !!close && !!last && !!(last.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING) && close.getBoundingClientRect().top >= last.getBoundingClientRect().bottom - 1;
  const laterSections = close ? [...main.querySelectorAll(".fa-section, .fa-summary")].filter(s => vis(s) && (close.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING)).length : 0;
  const pinned = e => { for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const q = getComputedStyle(x).position; if (q === "fixed" || q === "sticky") return true; } return false; };
  return { sections: secs.length, inRoot: secs.filter(s => rootEl.contains(s)).length, cards, flagged: ${FLAGGED[lang].toString()}.test(text),
    harsh: (readText.match(${HARSH[lang].toString().replace(/\/([a-z]*)$/, "/g$1".replace("gg", "g"))}) || []).slice(0, 5), straight, sales, salesText,
    lines: lines.length, closeText: close ? close.innerText.replace(/\\s+/g, " ").trim() : "", closeOk: !!close && ${CLOSE[lang].toString()}.test(close.innerText),
    link: !!close && !!close.querySelector('a[href$="counselling.html"]') && ${COUNSEL[lang].toString()}.test((close.querySelector('a[href$="counselling.html"]') || {}).innerText || ""),
    tels, after, laterSections, outsideClose, closePinned: !!close && pinned(close),
    otherNums: ${OTHER_NUMS.toString()}.test(document.body.innerText) || [...document.querySelectorAll('a[href^="tel:"]')].some(a => vis(a) && a.getAttribute("href") !== "tel:1323"),
    events: (window.__lqEvents || []).slice() };
})()`;

/** leave the page as a visitor does (analytics would flush now) and read the recorded analytics requests */
export async function events(page) {
  await page.evaluate(`(() => { try { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); } catch (e) {}
    document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("pagehide")); return true; })()`);
  await sleep(300);
  return page.evaluate("(window.__lqEvents || []).slice()");
}

/** the v3 assertions on one page after a reading in the crisis session; returns the problems */
export function judge(f, where, { reading = true } = {}) {
  const bad = [];
  if (reading && f.sections < 2) bad.push(`${where}: a: the reading did not continue (${f.sections} sections)`);
  if (f.cards.length) bad.push(`${where}: a: a card is shown ${S(f.cards)}`);
  if (f.flagged) bad.push(`${where}: a: wording tells the person they were flagged`);
  if (f.harsh.length) bad.push(`${where}: b: harsh wording ${S(f.harsh)}`);
  if (f.straight.length) bad.push(`${where}: b: straight mode visible ${S(f.straight)}`);
  if (f.sales.length || f.salesText.length) bad.push(`${where}: c: sales / share / print ${S(f.sales.concat(f.salesText).slice(0, 6))}`);
  if (reading) {
    if (f.lines !== 1) bad.push(`${where}: d: closing line shown ${f.lines} times`);
    if (!f.closeOk) bad.push(`${where}: d: closing line wording ${S(f.closeText.slice(0, 80))}`);
    if (!f.link) bad.push(`${where}: d: no counselling link under the button`);
    if (S(f.tels.map(t => t.h)) !== S(["tel:1323"])) bad.push(`${where}: d: closing tel links ${S(f.tels)}`);
    else if (f.tels[0].w < 44 || f.tels[0].ht < 44) bad.push(`${where}: d: 1323 button ${f.tels[0].w}x${f.tels[0].ht}`);
    if (!f.after || f.laterSections) bad.push(`${where}: d: closing line not at the end (after ${f.after}, later sections ${f.laterSections})`);
    if (f.outsideClose.length) bad.push(`${where}: d: help element in the middle ${S(f.outsideClose)}`);
    if (f.closePinned) bad.push(`${where}: d: closing line is sticky / fixed`);
  }
  if (f.otherNums) bad.push(`${where}: one number: another help number on the page`);
  return bad;
}

const norm = s => String(s).toLowerCase().replace(/[\s​-‍﻿]/g, "");
/** no echo: no piece of the typed text in visible text that was not visible before typing. RE-LOCK 1 2026-11-17 (test fault, before
 *  any product measurement): the reading is now SHOWN, so 2-character pieces match ordinary words of the reading; a piece is 5
 *  characters (Thai / English, spaces removed) or 3 (Chinese), and the whole typed text never appears */
export function echo(before, after, typed) {
  const t = norm(typed), was = norm(before.join("")), out = [], subs = new Set(), n = /[\u3400-\u9fff]/.test(t) ? 3 : 5;
  for (let i = 0; i + n <= t.length; i++) subs.add(t.slice(i, i + n));
  subs.add(t);
  for (const node of after) { const n = norm(node); for (const s of subs) if (n.includes(s) && !was.includes(s)) out.push(S(s) + " in " + S(node.trim().slice(0, 40))); }
  return [...new Set(out)].slice(0, 4);
}
export const after = page => page.evaluate(TEXTS);
export { assert };
