// tests/e2e/fortune-pet.e2e.mjs — FIXED TEST SET, Pet face reading (owner order 2026-11-16, part B), headless Chrome.
// Locked (evals-locks/fortune-pet.sha256, ~/LENSIQ-field/evals/fortune-pet/) BEFORE any product code on branch fortune-pet.
// Source of every picture: synthetic (a drawn shape on a canvas; no photo of an animal or a person). Detections are scripted
// with ?fakedet (LQDetect.fake("pet"): YOLOX classes person 0, cat 15, dog 16, boxes normalised).
//   P1  load: honest line + disclaimer shown, one help button (1323) and no other tel: link, no detector request at load
//   P2  photo -> scripted cat + person: species pre-filled, a plain note that the person is ignored, reading unchanged by the
//       person; reading has the owner-ordered parts and passes the lint (TH / EN / ZH)
//   P3  share card: photo off by default; drawn; with the photo ticked and a person present the person is blurred;
//       ZERO network requests from "read" to "save" (nothing uploaded); the card text has the honest line, disclaimer, link
//   P4  crisis (TH / EN / ZH) typed in the pet's name: crisis v3 (re-lock 2026-11-17): the reading continues gently, no card,
//       no echo, no price, no share card, no lucky part, one closing 1323 line at the end
//   P5  camera: the off button stops every track; a refused permission shows a plain message with the iPhone Safari page-menu
//       path and the Settings fallback, and the photo way forward (TH / EN / ZH)
//   P6  layout: no horizontal scroll at 360 px (TH / EN / ZH) at load and after a reading; EN / ZH readings have no Thai
//   P7  a pet photo with no pet found -> a plain message and the trait picker works on its own (fallback)
import { assert, privacyScan } from "./cdp.mjs";
import { sleep } from "./zones-lib.mjs";

const HONEST = { th: "คำอ่านนี้ดัดแปลงจากความเชื่อเรื่องการดูลักษณะ ไม่ใช่ตำราดั้งเดิม", en: "Adapted from face-reading tradition, not a classical text.", zh: "改编自相术传统，并非古籍原文。" };
const DISC = { th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ", en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.", zh: "基于命理学原则，属个人信仰，请自行判断。" };
const LINK = "anirut77.github.io/lensiq/petread.html";
// RE-LOCK 2026-11-20 (owner decision 184 ก; ledger evals-locks/fortune-pet.sha256 "relock-pet-3"): the site address is on the
// card only when window.LENSIQ_CARD_SHOW_ADDRESS is true (default false). P3 now checks the default card text has the brand line
// and no address, and (new page per language, switch on) that the address comes back: equal or stricter. Nothing else changed.
// RE-LOCK 2026-11-20 relock-pet-4: test fix only, the switch-on page now sets the photo first (as the first page does) so the
// reading starts; without it the page had no species and never read. Same assertions; equal.
const BRAND_LINE = { th: "จาก LENSIQ", en: "From LENSIQ", zh: "来自 LENSIQ" };
const BAN = {
  th: /สุขภาพ|ป่วย|โรค|อาการ|เจ็บ|ปวด|ตาย|เสียชีวิต|อายุ|สัตวแพทย์|หมอ|รักษา|ให้ยา|กินยา|วัคซีน|แข็งแรง|ร่างกาย|น้ำหนัก|อ้วน|เลขเด็ด|เลขนำโชค|หวย|ซวย|โชคร้าย|กาลกิณี/,
  en: /\b(?:health\w*|ill|illness|sick\w*|disease\w*|vet|vets|veterinar\w*|lifespan|longevity|long life|die|dies|died|dying|death|dead|cure\w*|treatment|medic\w*|symptom\w*|weight|vaccin\w*|lucky numbers?|lottery|bad luck|misfortune|unlucky)\b/i,
  zh: /健康|疾病|生病|病|兽医|寿|死|去世|治疗|药|症状|疫苗|体重|彩票|幸运数字|倒霉|不吉|厄运/,
};
const CRISIS = { th: "อยากตาย", en: "I want to die", zh: "我想死" };
const PRICE = /฿|บาท|ราคา|ชำระ|ซื้อ|price|\bpay\b|buy|THB|价格|付款|购买|元/i;
const THAI = /[฀-๿]/;

/* a synthetic "photo": an orange rounded blob with two triangle ears on a blue background (no animal, no person) */
const SYNTH = `(() => { const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d");
  x.fillStyle = "#5b8bd6"; x.fillRect(0, 0, 640, 480); x.fillStyle = "#e08a2e"; x.beginPath(); x.ellipse(300, 280, 150, 120, 0, 0, 7); x.fill();
  x.beginPath(); x.moveTo(190, 200); x.lineTo(220, 90); x.lineTo(270, 180); x.fill(); x.beginPath(); x.moveTo(330, 180); x.lineTo(380, 90); x.lineTo(410, 200); x.fill();
  x.fillStyle = "#f4d6b0"; x.fillRect(470, 40, 130, 200); return c.toDataURL("image/png"); })()`;
const CAT = { cls: 15, score: 0.91, x: 0.2, y: 0.15, w: 0.5, h: 0.7 };
const DOG = { cls: 16, score: 0.88, x: 0.2, y: 0.15, w: 0.5, h: 0.7 };
const PERSON = { cls: 0, score: 0.9, x: 0.72, y: 0.05, w: 0.24, h: 0.5 };
const detInit = dets => `window.__PET_DETS = ${JSON.stringify(dets)}; window.__LQ_FAKE_DET = function (key) { return key === "pet" ? window.__PET_DETS : []; };`;

async function open(browser, base, { lang = "th", dets = [CAT], init = [], query = "?fakedet&nosw", fakeCams = null } = {}) {
  const scripts = [`try { localStorage.setItem("lq-lang", ${JSON.stringify(lang)}); } catch (e) {}`];
  if (fakeCams) scripts.push(fakeCams, "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}");
  scripts.push(detInit(dets), ...init);
  const page = await browser.newPage(null, { initScripts: scripts });
  await page.goto(`${base}/petread.html${query}${lang !== "th" ? "&lang=" + lang : ""}`);
  await page.waitFor("window.__LQPET && window.__LQPET.ready", 15000);
  if (lang !== "th") await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
  return page;
}
const usePhoto = async page => { await page.evaluate(`window.__LQPET.useImage(${SYNTH})`); await page.waitFor("window.__LQPET.st.detected === true", 15000); };
async function fillAndRead(page, { name = "Mochi", birth = "2021-03-14", owner = "1990-07-02" } = {}) {
  await page.evaluate((n, b, o) => {
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    set("petName", n); set("petBirth", b); set("petOwnerBirth", o);
    document.getElementById("petRead").click();
  }, name, birth, owner);
  await page.waitFor("document.querySelector('#petReading .fa-section, #petReading .fa-support')", 10000);
  await sleep(300);
}
const readingText = page => page.evaluate(() => [...document.querySelectorAll("#petReading .fa-section")].map(s => s.textContent).join("\n"));
const vis = el => `(() => { const e = document.querySelector(${JSON.stringify(el)}); if (!e) return false; const b = e.getBoundingClientRect(); return !e.closest("[hidden]") && b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== "hidden" && getComputedStyle(e).display !== "none"; })()`;
const httpReq = page => page.requests.filter(r => /^https?:/.test(r.url));

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("P1 load: honest line + disclaimer, one 1323 button, no detector download at load", async () => {
      for (const lang of ["th", "en", "zh"]) {
        const page = await open(browser, base, { lang });
        await sleep(500);
        const r = await page.evaluate(() => ({ main: document.querySelector("main").innerText, tels: [...document.querySelectorAll('a[href^="tel:"]')].map(a => a.getAttribute("href")),
          top: !!document.querySelector('#lqHelpTop a[href="tel:1323"]'), mainTel: document.querySelectorAll('main a[href^="tel:"]').length }));
        assert(r.main.includes(HONEST[lang]), lang + ": honest line shown");
        assert(r.main.includes(DISC[lang]), lang + ": disclaimer shown");
        assert(r.top && r.tels.length === 1 && r.tels[0] === "tel:1323" && r.mainTel === 0, lang + ": one help button " + JSON.stringify(r.tels));
        const det = page.requests.filter(q => /onnx|ort[.-]|\.wasm|yolox|cocossd|tfjs/i.test(q.url));
        assert(!det.length, lang + ": detector requested at load: " + det.map(q => q.url).join(", "));
        await page.close();
      }
    });

    await check("P2 scripted cat + person: species pre-filled, person ignored (note), reading unchanged and clean (TH / EN / ZH)", async () => {
      for (const lang of ["th", "en", "zh"]) {
        const a = await open(browser, base, { lang, dets: [CAT, PERSON] });
        await usePhoto(a);
        const pre = await a.evaluate(() => ({ cat: !!document.querySelector('input[name="petSpecies"][value="cat"]:checked'), human: document.getElementById("petHuman").textContent }));
        assert(pre.cat, lang + ": species cat pre-filled from the detection");
        assert(await a.evaluate(vis("#petHuman")), lang + ": a person note is shown");
        assert({ th: /คน/, en: /person|people/i, zh: /人/ }[lang].test(pre.human), lang + ": note names the person: " + pre.human);
        await fillAndRead(a);
        const ta = await readingText(a);
        const b = await open(browser, base, { lang, dets: [CAT] });
        await usePhoto(b);
        assert(!(await b.evaluate(vis("#petHuman"))), lang + ": no person note without a person");
        await fillAndRead(b);
        const tb = await readingText(b);
        assert(ta && ta === tb, lang + ": the reading changed because a person was in the photo");
        const ids = await a.evaluate(() => [...document.querySelectorAll("#petReading .fa-section")].map(s => s.dataset.section));
        for (const id of ["personality", "likes", "bond", "lucky", "compat"]) assert(ids.includes(id), lang + ": section " + id + " in " + ids.join(","));
        const m = ta.match(BAN[lang]); assert(!m, lang + ": banned wording in the reading: " + (m && m[0]));
        if (lang !== "th") assert(!THAI.test(ta), lang + ": Thai left in the reading");
        assert(await a.evaluate(() => !!document.querySelector("#petReading .lq-gist, #petReading [data-lq-grouped]")), lang + ": the grouped fortune layout ran");
        await a.close(); await b.close();
      }
    });

    await check("P3 share card: photo off by default, person blurred when the photo is on, zero network requests, honest line + disclaimer + link", async () => {
      for (const lang of ["th", "en"]) {
        const page = await open(browser, base, { lang, dets: [CAT, PERSON] });
        await usePhoto(page);
        page.requests.length = 0;
        await fillAndRead(page);
        await page.waitFor("document.getElementById('petCard').dataset.drawn === '1'", 8000);
        const d0 = await page.evaluate(() => ({ on: document.getElementById("petPhotoOn").checked, photo: document.getElementById("petCard").dataset.photo }));
        assert(!d0.on && d0.photo === "0", lang + ": photo must be off by default " + JSON.stringify(d0));
        await page.evaluate(() => { const c = document.getElementById("petPhotoOn"); c.click(); });
        await page.waitFor("document.getElementById('petCard').dataset.photo === '1'", 8000);
        const d1 = await page.evaluate(() => ({ blur: +document.getElementById("petCard").dataset.blur || 0, warn: document.getElementById("petHuman").textContent }));
        assert(d1.blur >= 1, lang + ": the person must be blurred on the card " + JSON.stringify(d1));
        for (const t of await page.evaluate(() => [...document.querySelectorAll(".pet-theme")].map(b => b.dataset.theme))) {
          await page.evaluate(th => document.querySelector(`.pet-theme[data-theme="${th}"]`).click(), t);
          await page.waitFor(`document.getElementById('petCard').dataset.theme === ${JSON.stringify(t)}`, 4000);
        }
        // save: a local blob only
        const saved = await page.evaluate(async () => {
          const urls = []; const o = URL.createObjectURL; const c = HTMLAnchorElement.prototype.click;
          URL.createObjectURL = b => { urls.push(b && b.type); return o.call(URL, b); }; HTMLAnchorElement.prototype.click = function () { urls.push("click:" + (this.download || "")); };
          try { document.getElementById("petCardSave").click(); await new Promise(r => setTimeout(r, 1500)); } finally { URL.createObjectURL = o; HTMLAnchorElement.prototype.click = c; }
          return urls;
        });
        assert(saved.includes("image/png") && saved.some(u => /^click:.+\.png$/.test(u)), lang + ": save gives a local PNG " + JSON.stringify(saved));
        const net = httpReq(page);
        assert(net.length === 0, lang + ": network requests during read + card + save: " + net.map(r => r.method + " " + r.url).join(", "));
        const txt = await page.evaluate(() => window.__LQPET.cardText());
        assert(txt.includes(HONEST[lang]) && txt.includes(DISC[lang]) && txt.includes(BRAND_LINE[lang]), lang + ": card text " + JSON.stringify(txt).slice(0, 300));
        assert(!txt.some(t => t.includes(LINK) || /github|https?:/i.test(t)), lang + ": address on the card while the switch is off " + JSON.stringify(txt).slice(-200));
        const bad = txt.filter(t => !t.includes(LINK) && BAN[lang].test(t));
        assert(!bad.length, lang + ": card lint " + bad.join(" | "));
        assert(!page.requests.some(r => r.method !== "GET"), "a non-GET request was sent");
        await privacyScan(page);
        await page.close();
        const on = await open(browser, base, { lang, init: ["window.LENSIQ_CARD_SHOW_ADDRESS = true;"] });
        await usePhoto(on); // re-lock relock-pet-4: the switch-on page needs the species like the first page (a photo sets it)
        await fillAndRead(on);
        await on.waitFor("document.getElementById('petCard').dataset.drawn === '1'", 8000);
        const txtOn = await on.evaluate(() => window.__LQPET.cardText());
        assert(txtOn.includes(HONEST[lang]) && txtOn.includes(DISC[lang]) && txtOn.some(t => t.includes(LINK)), lang + ": card text, switch on " + JSON.stringify(txtOn).slice(-200));
        await on.close();
      }
    });

    // RE-LOCK 2026-11-17 (crisis v3, owner decision 2026-11-17; ledger docs/CRISIS-V3-RELOCKS.md "fortune-pet"): the old P4 waited
    // for the support card (tel:1669); v3 has no card. Kept: no price, share card hidden. Added (v3 rules a-e): crisis state set,
    // no card or soft step shown, the reading continues (>= 2 sections), no lucky part, the typed phrase is not shown back, one
    // closing line with tel:1323 after the last section and no other tel: number in <main>.
    await check("P4 crisis typed in the pet's name (v3): reading continues gently, nothing flagged, no echo, no price, no card, no lucky part, " +
      "one closing 1323 line at the end (TH / EN / ZH)", async () => {
      for (const lang of ["th", "en", "zh"]) {
        const page = await open(browser, base, { lang });
        await usePhoto(page);
        await fillAndRead(page, { name: CRISIS[lang] });
        await page.waitFor("document.documentElement.getAttribute('data-lq-crisis') === '1' && document.querySelectorAll('#petReading .fa-section').length >= 2", 8000);
        await sleep(600);
        const r = await page.evaluate(typed => {
          const vis = e => !!e && !e.closest("[hidden]") && e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== "none";
          const secs = [...document.querySelectorAll("#petReading .fa-section")].filter(vis), last = secs[secs.length - 1];
          const lines = [...document.querySelectorAll(".lq-helpline-result")].filter(vis);
          const main = document.querySelector("main").innerText;
          return { sections: secs.length, ids: secs.map(x => x.getAttribute("data-section")), card: [...document.querySelectorAll(".fa-support, .fa-soft")].some(vis),
            lines: lines.length, tel: lines.length === 1 && !!lines[0].querySelector('a[href="tel:1323"]'),
            after: lines.length === 1 && !!last && !!(last.compareDocumentPosition(lines[0]) & Node.DOCUMENT_POSITION_FOLLOWING),
            otherTel: [...document.querySelectorAll('main a[href^="tel:"]')].map(a => a.getAttribute("href")).filter(h => h !== "tel:1323"),
            echo: main.replace(/\s+/g, "").toLowerCase().includes(typed.replace(/\s+/g, "").toLowerCase()), main };
        }, CRISIS[lang]);
        assert(r.sections >= 2 && !r.card, lang + ": the reading continues, no card " + JSON.stringify({ s: r.sections, c: r.card }));
        assert(!r.ids.includes("lucky"), lang + ": no lucky part in the crisis state " + JSON.stringify(r.ids));
        assert(!r.echo, lang + ": the typed phrase is shown back");
        assert(r.lines === 1 && r.tel && r.after, lang + ": one closing 1323 line after the last section " + JSON.stringify({ n: r.lines, t: r.tel, a: r.after }));
        assert(!r.otherTel.length, lang + ": other numbers " + JSON.stringify(r.otherTel));
        assert(!(await page.evaluate(vis("#petCardSec"))), lang + ": the share card is hidden in the crisis state");
        const m = r.main.match(PRICE); assert(!m, lang + ": price wording in the crisis state: " + (m && m[0]));
        await page.close();
      }
    });

    await check("P5 camera: off stops every track; refused permission -> plain message with the Safari page-menu path, Settings fallback and the photo way (TH / EN / ZH)", async () => {
      const page = await open(browser, base, { fakeCams });
      await page.evaluate(() => document.getElementById("petCamOn").click());
      await page.waitFor("(() => { const v = document.getElementById('petVideo'); return v.srcObject && v.srcObject.active && v.readyState >= 2; })()", 10000);
      await page.evaluate(() => document.getElementById("petCamOff").click());
      await sleep(300);
      const off = await page.evaluate(() => { const s = window.__LQPET.lastStream; return { tracks: s ? s.getTracks().map(t => t.readyState) : null, src: !!document.getElementById("petVideo").srcObject }; });
      assert(off.tracks && off.tracks.length && off.tracks.every(t => t === "ended") && !off.src, "camera off: " + JSON.stringify(off));
      await page.close();
      const RE = {
        th: [/Safari/, /เมนู/, /การตั้งค่า/, /เลือกรูป/],
        en: [/Safari/, /page menu/i, /Settings/, /photo/i],
        zh: [/Safari/, /页面菜单/, /设置/, /照片/],
      };
      const DENY = `navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));`;
      for (const lang of ["th", "en", "zh"]) {
        const p = await open(browser, base, { lang, init: [DENY] });
        await p.evaluate(() => document.getElementById("petCamOn").click());
        await p.waitFor("document.getElementById('petCamMsg').textContent.length > 10", 6000);
        const msg = await p.evaluate(() => document.getElementById("petCamMsg").textContent);
        for (const re of RE[lang]) assert(re.test(msg), `${lang}: refused-camera message lacks ${re}: ${msg}`);
        if (lang !== "th") assert(!THAI.test(msg), lang + ": Thai in the message");
        await p.close();
      }
    });

    await check("P6 layout: no horizontal scroll at 360 px (TH / EN / ZH) at load and after a reading", async () => {
      for (const lang of ["th", "en", "zh"]) {
        const page = await open(browser, base, { lang });
        await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
        await sleep(400);
        const ov = () => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        let o = await ov(); assert(o.sw <= o.cw, `${lang} 360 px at load ${JSON.stringify(o)}`);
        await usePhoto(page); await fillAndRead(page);
        await page.waitFor("document.getElementById('petCard').dataset.drawn === '1'", 8000);
        await sleep(300);
        o = await ov(); assert(o.sw <= o.cw, `${lang} 360 px after a reading ${JSON.stringify(o)}`);
        await page.close();
      }
    });

    await check("P7 fallback: no pet found in the photo -> plain message; the trait picker alone gives a reading (dog)", async () => {
      const page = await open(browser, base, { dets: [] });
      await usePhoto(page);
      const msg = await page.evaluate(() => document.getElementById("petDetMsg").textContent);
      assert(/ไม่พบ/.test(msg) && /เลือก/.test(msg), "no-pet message: " + msg);
      await page.evaluate(() => document.querySelector('input[name="petSpecies"][value="dog"]').click());
      await fillAndRead(page, { name: "", owner: "" });
      const r = await page.evaluate(() => ({ n: document.querySelectorAll("#petReading .fa-section").length, ids: [...document.querySelectorAll("#petReading .fa-section")].map(s => s.dataset.section) }));
      assert(r.n >= 4 && !r.ids.includes("compat"), "reading without photo detection / owner birth: " + JSON.stringify(r));
      await page.close();
      // no photo at all: the trait picker works on its own
      const p2 = await open(browser, base, { dets: [DOG] });
      await p2.evaluate(() => document.querySelector('input[name="petSpecies"][value="cat"]').click());
      await fillAndRead(p2, { birth: "" });
      assert((await p2.evaluate(() => document.querySelectorAll("#petReading .fa-section").length)) >= 4, "reading with traits only");
      await p2.close();
    });
  } finally { await browser.close(); }
}
