// tests/e2e/merit.e2e.mjs — Merit MVP on the fortune pages (owner order 2026-11-12), in a real browser. FIXED TEST SET:
// written and hash-locked (~/LENSIQ-field/evals/merit/locked.sha256) BEFORE lensiq-merit.js was written.
//   1. after a zodiac reading a "what believers do" panel appears below the reading (static site, no backend: the
//      bundled sample items); every card carries the fixed belief label; the footer says nothing is guaranteed; no
//      links, prices or buy buttons; no paid section (flag off by default)
//   2. the tradition choice filters the cards, is remembered on this device (reload) and "off" hides the cards;
//      ชง customs appear for a ชง year only
//   3. with the page flag AND the server flag on (server stubbed in the page), the optional paid section sits below the
//      free guidance, states the separate fee / donation passed on in full / proof and receipt, has no countdown or
//      scarcity wording, asks only for the minimum fields and sends only those
//   4. crisis net: crisis text typed into the interest form shows the support card and sends nothing; a support card on
//      the tarot page hides the whole panel (free and paid) on the next reading and on another fortune page
//   5. English and 中文: the panel has no Thai left; phone widths 320 / 360 / 390: no horizontal overflow, 44 px targets
import { createRequire } from "node:module";
import { join } from "node:path";
import { assert } from "./cdp.mjs";
import { sleep } from "./zones-lib.mjs";

const require = createRequire(import.meta.url);
const THAI = /[ก-ฺเ-๛]/;
const LABEL = { th: "ตามความเชื่อ โปรดใช้วิจารณญาณ", en: "According to belief, please use your own judgement", zh: "依据民间信仰，请自行判断" };
const PANEL = "document.querySelector('.lq-merit')";

/** zodiac reading. kind "chong": the birth animal of the selected year itself (relation "same", a ชง); "calm": the
 *  animal four places on (a trine, never a ชง). Computed from the year in the form, so the test does not age. */
async function readZodiac(page, kind) {
  await page.evaluate(k => {
    const y = +document.getElementById("zdYear").value, ya = ((y - 4) % 12 + 12) % 12, a = k === "chong" ? ya : (ya + 4) % 12;
    document.querySelector(`input[name="zdAnimal"][value="${a}"]`).click(); document.getElementById("zdForm").requestSubmit();
  }, kind);
  await page.waitFor("document.querySelectorAll('.fa-section').length >= 3", 15000);
}
const panelOpen = `(() => { const p = ${PANEL}; return !!p && !p.hidden && p.getBoundingClientRect().height > 0 && p.querySelectorAll('.lq-merit-card').length > 0; })()`;
const cards = page => page.evaluate(() => [...document.querySelectorAll(".lq-merit .lq-merit-card")].map(c => ({
  type: c.getAttribute("data-type"), tradition: c.getAttribute("data-tradition"), text: c.innerText
})));
const choose = (page, v) => page.evaluate(v => { const s = document.querySelector(".lq-merit select[name=tradition]"); s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); }, v);

/** Server stub inside the page: same-origin API base, guidance with interest_form on, interest POSTs recorded. */
function stubScript(seed, { interestForm = true } = {}) {
  return `(() => {
    window.LENSIQ_API_BASE = location.origin;
    window.LENSIQ_ANALYTICS = false;
    window.LENSIQ_MERIT_INTEREST_FORM = true;
    window.__meritSent = [];
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      const path = new URL(url, location.href).pathname;
      const H = { "Content-Type": "application/json" };
      if (path === "/v1/merit/guidance") {
        return Promise.resolve(new Response(JSON.stringify({ items: ${JSON.stringify(seed)}, interest_form: ${interestForm} }), { headers: H }));
      }
      if (path === "/v1/merit/interest") {
        window.__meritSent.push(JSON.parse(init.body));
        return Promise.resolve(new Response(JSON.stringify({ ok: true, id: "0".repeat(24) }), { status: 201, headers: H }));
      }
      if (path.startsWith("/v1/") || path.startsWith("/api/")) return Promise.resolve(new Response("{}", { status: 404, headers: H }));
      return orig(input, init);
    };
  })();`;
}

export default async function ({ base, launch, check, repo }) {
  const seed = require(join(repo, "lensiq-merit-seed.js")).map(x => ({ ...x, updated_at: 1 }));
  const browser = await launch();
  try {
    let page = await browser.newPage(null, { isolated: true });
    await check("1. after a reading: panel below the reading, every card labelled, footer, no links / prices, no paid section", async () => {
      await page.goto(`${base}/zodiac.html`);
      await readZodiac(page, "chong");
      await page.waitFor(panelOpen, 8000);
      const r = await page.evaluate(() => {
        const p = document.querySelector(".lq-merit"), reading = document.querySelector(".fa-section");
        return {
          after: !!(reading.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING),
          head: p.querySelector("h2, h3").textContent, text: p.innerText,
          cards: [...p.querySelectorAll(".lq-merit-card")].map(c => c.innerText),
          links: [...p.querySelectorAll("a[href]")].map(a => a.getAttribute("href")),
          paid: !!document.querySelector(".lq-merit-paid"), buttons: [...p.querySelectorAll("button")].map(b => b.textContent)
        };
      });
      assert(r.after, "panel after the reading");
      assert(/สิ่งที่ทำได้ตามความเชื่อ/.test(r.head), r.head);
      assert(r.cards.length >= 1 && r.cards.every(c => c.includes(LABEL.th)), "label on every card");
      assert(/ไม่มีสิ่งใดรับประกันผล/.test(r.text), "footer");
      assert(/ตัวอย่าง/.test(r.text), "sample items are marked");
      assert(!r.links.some(h => /^https?:/i.test(h)), "no outside links: " + r.links.join(","));
      assert(!/\d\s*(บาท|฿)/.test(r.text) && !/ซื้อ|สั่งซื้อ|ชำระ/.test(r.buttons.join(" ")), "no prices or buy buttons");
      assert(!r.paid, "no paid section while the flag is off");
    });

    await check("2. tradition filter: Chinese folk shows ชง customs for a ชง year, remembered after reload; off hides cards; no ชง for a harmony year", async () => {
      await choose(page, "chinese_folk");
      await page.waitFor("[...document.querySelectorAll('.lq-merit-card')].some(c => c.getAttribute('data-type') === 'chong')", 4000);
      let cs = await cards(page);
      assert(cs.every(c => c.tradition === "chinese_folk" || c.tradition === "general"), JSON.stringify(cs.map(c => c.tradition)));
      assert(await page.evaluate(() => localStorage.getItem("lq-merit-tradition")) === "chinese_folk");
      await page.reload();
      await readZodiac(page, "chong");
      await page.waitFor(panelOpen, 8000);
      assert(await page.evaluate(() => document.querySelector(".lq-merit select[name=tradition]").value) === "chinese_folk", "remembered");
      cs = await cards(page);
      assert(cs.some(c => c.type === "chong"), "chong card after reload");
      await readZodiac(page, "calm");
      await sleep(600);
      cs = await cards(page);
      assert(cs.length && !cs.some(c => c.type === "chong"), "no ชง customs for a harmony year: " + JSON.stringify(cs.map(c => c.type)));
      await choose(page, "hindu_brahman");
      await sleep(300);
      cs = await cards(page);
      assert(cs.length && cs.every(c => c.tradition === "hindu_brahman" || c.tradition === "general"), JSON.stringify(cs.map(c => c.tradition)));
      await choose(page, "off");
      await sleep(300);
      assert((await cards(page)).length === 0, "off: no cards");
      assert(await page.evaluate(() => !!document.querySelector(".lq-merit select[name=tradition]")), "the choice stays reachable to turn it back on");
      assert(await page.evaluate(() => localStorage.getItem("lq-merit-tradition")) === "off");
    });
    await page.close();

    page = await browser.newPage(null, { isolated: true, initScripts: [stubScript(seed)] });
    await check("3. flags on: paid section below the free guidance; separate fee, donation in full, proof + receipt; no urgency; minimum fields sent", async () => {
      await page.goto(`${base}/zodiac.html`);
      await readZodiac(page, "chong");
      await page.waitFor("!!document.querySelector('.lq-merit-paid')", 8000);
      const r = await page.evaluate(() => {
        const paid = document.querySelector(".lq-merit-paid"), last = [...document.querySelectorAll(".lq-merit-card")].pop();
        const f = paid.querySelector("form");
        return { below: !!(last.compareDocumentPosition(paid) & Node.DOCUMENT_POSITION_FOLLOWING), text: paid.innerText,
          fields: [...f.elements].filter(e => e.name).map(e => e.name).filter((v, i, a) => a.indexOf(v) === i).sort(),
          privacy: !!paid.querySelector('a[href^="privacy.html"]') };
      });
      assert(r.below, "below the free guidance");
      for (const w of [/ค่าบริการ/, /แยก/, /ส่งต่อเต็มจำนวน/, /รูป/, /วิดีโอ/, /ใบเสร็จ/, /ยังไม่เปิด/]) assert(w.test(r.text), "paid text " + w);
      for (const w of [/นับถอยหลัง/, /เหลือเพียง/, /จำนวนจำกัด/, /ด่วน/, /รับประกัน/, /แก้ดวง/, /ดวงดีขึ้น/]) assert(!w.test(r.text), "no " + w);
      assert(r.fields.join(",") === ["channel", "consent", "contact", "date_from", "date_to", "item_id", "name"].join(","), r.fields.join(","));
      assert(r.privacy, "PDPA notice links to the privacy page");
      await page.evaluate(() => {
        const f = document.querySelector(".lq-merit-paid form");
        f.elements.name.value = "ต้ม"; f.elements.channel.value = "line"; f.elements.contact.value = "tum_test";
        f.elements.date_from.value = "2027-01-10"; f.elements.date_to.value = "2027-01-20"; f.elements.consent.checked = true;
        f.requestSubmit();
      });
      await page.waitFor("window.__meritSent.length === 1", 5000);
      const sent = await page.evaluate(() => window.__meritSent[0]);
      const allowed = ["name", "channel", "contact", "item_id", "date_from", "date_to", "consent", "consent_version", "lang"];
      assert(Object.keys(sent).every(k => allowed.includes(k)), "only the minimum: " + Object.keys(sent).join(","));
      assert(sent.name === "ต้ม" && sent.channel === "line" && sent.contact === "tum_test" && sent.consent === true && typeof sent.item_id === "string" && sent.item_id);
      await page.waitFor("/ได้รับแล้ว/.test(document.querySelector('.lq-merit-paid').innerText)", 4000);
    });

    await check("4a. crisis text in the interest form: support card, nothing sent, the paid offer withdrawn", async () => {
      await page.reload();
      await readZodiac(page, "chong");
      await page.waitFor("!!document.querySelector('.lq-merit-paid form')", 8000);
      await page.evaluate(() => {
        const f = document.querySelector(".lq-merit-paid form");
        f.elements.name.value = "อยากตาย"; f.elements.channel.value = "line"; f.elements.contact.value = "x_test";
        f.elements.date_from.value = "2027-01-10"; f.elements.date_to.value = "2027-01-20"; f.elements.consent.checked = true;
        f.requestSubmit();
      });
      await page.waitFor("[...document.querySelectorAll('.fa-support')].some(s => /1323/.test(s.textContent))", 5000);
      await sleep(500);
      assert(await page.evaluate(() => window.__meritSent.length) === 0, "nothing sent");
      assert(await page.evaluate(() => !document.querySelector(".lq-merit-paid form")), "no form next to the support card");
      assert(await page.evaluate(() => Number(localStorage.getItem("lq-crisis-at")) > 0), "crisis state set");
      await readZodiac(page, "calm");
      await sleep(1500);
      assert(await page.evaluate(() => !document.querySelector(".lq-merit-paid") && !document.querySelector(".lq-merit-card")), "no merit content on the next reading");
    });
    await page.close();

    page = await browser.newPage(null, { isolated: true, initScripts: [stubScript(seed)] });
    await check("4b. support card on tarot: no merit panel (free or paid) on the next reading there or on the zodiac page", async () => {
      await page.goto(`${base}/tarot.html`);
      await page.evaluate(() => { document.getElementById("trQuestion").value = "I want to die"; document.getElementById("trStart").click(); });
      await page.waitFor("(() => { const b = document.getElementById('trSupport'); return !!b && !b.hidden && /1323/.test(b.textContent); })()", 5000);
      await page.waitFor("Number(localStorage.getItem('lq-crisis-at')) > 0", 5000); // crisis state set by the support card
      await page.goto(`${base}/zodiac.html`);
      await readZodiac(page, "chong");
      await sleep(2000);
      const r = await page.evaluate(() => ({ panel: [...document.querySelectorAll(".lq-merit")].filter(p => !p.hidden && p.getBoundingClientRect().height > 0).length,
        cards: document.querySelectorAll(".lq-merit-card").length, paid: document.querySelectorAll(".lq-merit-paid").length }));
      assert(r.panel === 0 && r.cards === 0 && r.paid === 0, JSON.stringify(r));
    });
    await page.close();

    for (const lang of ["en", "zh"]) {
      page = await browser.newPage(null, { isolated: true, initScripts: [stubScript(seed)] });
      await check(`5. ${lang}: panel and paid section fully translated (no Thai), label in ${lang}`, async () => {
        await page.goto(`${base}/zodiac.html?lang=${lang}`);
        await readZodiac(page, "chong");
        await page.waitFor(panelOpen, 8000);
        await page.waitFor("!!document.querySelector('.lq-merit-paid')", 8000);
        const r = await page.evaluate(() => {
          const p = document.querySelector(".lq-merit");
          const attrs = [...p.querySelectorAll("[placeholder],[aria-label],[title]")].map(e => [e.getAttribute("placeholder"), e.getAttribute("aria-label"), e.getAttribute("title")].join(" "));
          const opts = [...p.querySelectorAll("option")].map(o => o.textContent);
          return { text: p.innerText + " " + document.querySelector(".lq-merit-paid").innerText, attrs: attrs.join(" "), opts: opts.join(" "),
            cards: [...p.querySelectorAll(".lq-merit-card")].map(c => c.innerText) };
        });
        assert(!THAI.test(r.text), "Thai left: " + (r.text.match(/.{0,20}[ก-ฺเ-๛].{0,20}/) || [])[0]);
        assert(!THAI.test(r.attrs) && !THAI.test(r.opts), "Thai in attributes or options");
        assert(r.cards.every(c => c.includes(LABEL[lang])), "label in " + lang);
      });
      await page.close();
    }

    page = await browser.newPage(null, { isolated: true, initScripts: [stubScript(seed)] });
    await check("5. phone 320 / 360 / 390: no horizontal overflow; panel controls >= 44 px and labelled", async () => {
      await page.goto(`${base}/zodiac.html`);
      await readZodiac(page, "chong");
      await page.waitFor("!!document.querySelector('.lq-merit-paid')", 8000);
      for (const width of [320, 360, 390]) {
        await page.send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 2, mobile: true });
        await sleep(300);
        const r = await page.evaluate(() => {
          const de = document.documentElement, small = [], unlabelled = [], wide = [];
          for (const el of document.querySelectorAll(".lq-merit button, .lq-merit input, .lq-merit select, .lq-merit textarea")) {
            const b = el.getBoundingClientRect();
            if (!b.width || !b.height || el.closest("[hidden]")) continue;
            if (el.type !== "checkbox" && (b.height < 43.5 || b.width < 43.5)) small.push(`${el.tagName}.${el.name || el.className} ${Math.round(b.width)}x${Math.round(b.height)}`);
            if (el.tagName !== "BUTTON" && !(el.labels && el.labels.length) && !el.getAttribute("aria-label")) unlabelled.push(el.name || el.tagName);
          }
          for (const el of document.querySelectorAll(".lq-merit, .lq-merit *")) { const b = el.getBoundingClientRect(); if (b.right > de.clientWidth + 1) wide.push(el.className || el.tagName); }
          return { sw: de.scrollWidth, cw: de.clientWidth, small, unlabelled, wide: wide.slice(0, 5) };
        });
        assert(r.sw <= r.cw && !r.wide.length, `overflow at ${width}px: ` + JSON.stringify(r));
        assert(!r.small.length, `targets < 44 px at ${width}px: ` + r.small.join(", "));
        assert(!r.unlabelled.length, "unlabelled: " + r.unlabelled.join(", "));
      }
      await page.send("Emulation.clearDeviceMetricsOverride");
    });
    await page.close();
  } finally {
    await browser.close();
  }
}
