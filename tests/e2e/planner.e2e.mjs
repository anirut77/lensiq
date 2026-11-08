// tests/e2e/planner.e2e.mjs — planner.html (ฤกษ์มงคล, round 14 / S2-E2): good days for a shop opening with an owner
// (birth weekday worked out from a birth date), every card shows its basis (day colour, lunar day, reasons), no
// warning / bad-day wording, sort by matches, ticked days -> .ics (captured, not downloaded), nothing stored, no network
// beyond the page's own files, 320/360/390 px layout + 44 px targets, EN / ZH with no Thai left, no console errors.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const unexpected = page => page.consoleErrors.filter(e => !/favicon/.test((e.url || "") + " " + (e.text || "")));

const RUN = `(() => {
  document.querySelector('input[name=plEvent][value=shop]').click();
  const from = document.getElementById("plFrom"); from.value = from.options[1].value;
  document.getElementById("plSpan").value = "2";
  const fs = document.querySelector('.pl-owner[data-owner="0"]');
  fs.querySelector("details").open = true;
  const bd = fs.querySelector(".pl-bd"); bd.value = "1990-05-17"; bd.dispatchEvent(new Event("change", { bubbles: true }));
  fs.querySelector(".pl-zd").value = "6";
  document.getElementById("plGo").click();
})()`;

const THAI_LEFT = lang => `(() => {
  if (!window.LQI18N || LQI18N.lang !== "${lang}") return false;
  const main = document.querySelector("main"), thai = [];
  const walk = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) {
    const el = n.parentElement;
    if (el.closest("[hidden],[lang=th],[translate=no]") || el.closest("script")) continue;
    if (/[ก-๛]/.test(n.textContent)) thai.push(n.textContent.trim().slice(0, 60));
  }
  for (const el of main.querySelectorAll("[aria-label],[placeholder]")) {
    const v = (el.getAttribute("aria-label") || "") + (el.getAttribute("placeholder") || "");
    if (/[ก-๛]/.test(v) && !el.closest("[hidden]")) thai.push("@" + v.slice(0, 40));
  }
  for (const o of main.querySelectorAll("option")) if (/[ก-๛]/.test(o.textContent)) thai.push("option " + o.textContent);
  if (/[ก-๛]/.test(document.title)) thai.push("title " + document.title);
  return thai.length === 0 ? { ok: true } : (window.__lastThai = thai, false);
})()`;

async function mobile(page) {
  for (const width of [320, 360, 390]) {
    await page.send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 2, mobile: true });
    await sleep(300);
    const r = await page.evaluate(() => {
      const de = document.documentElement, small = [], unlabelled = [];
      for (const el of document.querySelectorAll("main button, main a.btn, main input, main select, main summary, main .fk-opt, main .pl-pick")) {
        const cs = getComputedStyle(el), b = el.getBoundingClientRect();
        if (el.type === "checkbox" || el.type === "radio") { if (!(el.labels && el.labels.length)) unlabelled.push(el.id || el.name); continue; } // the label is the target
        if (!b.width || !b.height || cs.visibility === "hidden" || el.closest("[hidden]")) continue;
        if (b.height < 43.5 || b.width < 43.5) small.push(`${el.tagName}#${el.id}.${el.className} ${Math.round(b.width)}x${Math.round(b.height)}`);
        if ((el.tagName === "INPUT" || el.tagName === "SELECT") && !(el.labels && el.labels.length) && !el.getAttribute("aria-label")) unlabelled.push(el.className || el.id);
      }
      const hasText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      const tiny = [...document.querySelectorAll("main *")].filter(el => hasText(el) && el.getBoundingClientRect().width && parseFloat(getComputedStyle(el).fontSize) < 12)
        .map(el => el.tagName + "." + el.className).slice(0, 3);
      return { sw: de.scrollWidth, cw: de.clientWidth, small: small.slice(0, 5), unlabelled, tiny };
    });
    assert(r.sw <= r.cw, `horizontal overflow at ${width}px ` + JSON.stringify(r));
    assert(!r.small.length, `targets < 44 px at ${width}px: ` + r.small.join(", "));
    assert(!r.unlabelled.length, "unlabelled controls: " + r.unlabelled.join(", "));
    assert(!r.tiny.length, "text < 12px: " + r.tiny.join(", "));
  }
  await page.send("Emulation.clearDeviceMetricsOverride");
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("planner: shop opening with an owner -> good days with basis, sort, .ics, nothing stored or sent", async () => {
      const page = await browser.newPage(null);
      await page.goto(`${base}/planner.html`);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitFor(() => window.__pl && document.getElementById("plFrom").options.length === 13, 5000);
      await page.evaluate(RUN);
      await page.waitFor(() => !document.getElementById("plResult").hidden && document.querySelectorAll(".pl-day").length > 0, 5000);
      const r = await page.evaluate(() => ({
        wd: document.querySelector('.pl-owner[data-owner="0"] .pl-wd').value,
        note: document.querySelector(".pl-bdnote").textContent,
        n: document.querySelectorAll(".pl-day").length,
        cards: [...document.querySelectorAll(".pl-day")].map(li => ({
          chips: li.querySelectorAll(".pl-chip").length, why: li.querySelectorAll(".pl-why li").length, sw: li.querySelectorAll(".pl-sw").length, t: li.textContent })),
        h: document.getElementById("plResH").textContent, all: document.getElementById("plResult").textContent,
        page: document.querySelector("main").textContent
      }));
      assert(r.wd === "4" && /พฤหัสบดี/.test(r.note), "birth date -> Thursday: " + JSON.stringify([r.wd, r.note]));
      assert(/เปิดร้าน/.test(r.h) && new RegExp(String(r.n)).test(r.h), "heading " + r.h);
      assert(r.cards.every(c => c.chips === 4 && c.why >= 2 && c.sw === 2 && /สีประจำวัน/.test(c.t) && /(ขึ้น|แรม) \d+ ค่ำ เดือน/.test(c.t)), "cards show basis " + JSON.stringify(r.cards[0]));
      assert(r.cards.some(c => /ภูมิ(ศรี|เดช|มนตรี|มูละ)/.test(c.t)), "owner taksa reason shown");
      assert(!/กาลกิณี|ไม่ดี|ห้าม|ระวัง|อัปมงคล|ซวย|หวย|เลขเด็ด|อุบัติเหตุ|เจ็บป่วย|ตาย/.test(r.all), "no warning / bad-day wording in results");
      assert(/ไม่ใช่การรับประกันผล/.test(r.page) && /ตำราแต่ละสายต่างกัน/.test(r.page), "cultural-planning note");

      // sort by matches
      await page.evaluate(() => document.querySelector('.pl-seg[data-sort="score"]').click());
      const s = await page.evaluate(() => ({ p: document.querySelector('.pl-seg[data-sort="score"]').getAttribute("aria-pressed"),
        sc: [...document.querySelectorAll(".pl-score")].map(e => +e.textContent.match(/\d+/)[0]) }));
      assert(s.p === "true" && s.sc.every((v, i, a) => !i || a[i - 1] >= v), "sorted by score " + JSON.stringify(s));

      // tick two days -> .ics (Blob captured; nothing downloaded)
      const dis0 = await page.evaluate(() => document.getElementById("plIcs").disabled);
      assert(dis0, ".ics disabled before ticking");
      const ics = await page.evaluate(async () => {
        const boxes = document.querySelectorAll(".pl-day input[type=checkbox]"); boxes[0].click(); boxes[1].click();
        document.getElementById("plTime").value = "09:09";
        let blob = null, name = null;
        const o = URL.createObjectURL, c = HTMLAnchorElement.prototype.click;
        URL.createObjectURL = b => { blob = b; return "blob:x"; };
        HTMLAnchorElement.prototype.click = function () { name = this.download; };
        try { document.getElementById("plIcs").click(); } finally { URL.createObjectURL = o; HTMLAnchorElement.prototype.click = c; }
        return { name, type: blob && blob.type, txt: blob ? await blob.text() : null, picked: document.getElementById("plPicked").textContent };
      });
      assert(ics.name === "lensiq-auspicious-shop.ics" && /text\/calendar/.test(ics.type), JSON.stringify([ics.name, ics.type]));
      const unf = ics.txt.replace(/\r\n /g, "");
      assert((unf.match(/BEGIN:VEVENT/g) || []).length === 2 && /SUMMARY:ฤกษ์เปิดร้าน/.test(unf) && /T020900Z/.test(unf) && /ไม่ใช่การรับประกันผล/.test(unf), "ics " + unf.slice(0, 400));
      assert(/2/.test(ics.picked), "picked " + ics.picked);

      // print
      await page.evaluate(() => { window.print = () => { window.__printed = true; }; document.getElementById("plPrint").click(); });
      assert(await page.evaluate(() => window.__printed === true), "print");

      // nothing stored; only same-origin requests
      const ls = await page.evaluate(() => Object.keys(localStorage).map(k => k + "=" + localStorage.getItem(k)).join("\n"));
      assert(!/1990|pl-|planner/.test(ls), "localStorage holds planner data: " + ls);
      const foreign = page.requests.filter(q => { try { const u = new URL(q.url); return /^https?:$/.test(u.protocol) && u.origin !== new URL(base).origin; } catch { return false; } });
      const api = page.requests.filter(q => { try { return new URL(q.url).pathname.startsWith("/api/"); } catch { return false; } });
      assert(!foreign.length && !api.length, "network: " + foreign.concat(api).map(q => q.url).join(", "));

      await mobile(page);
      const errs = unexpected(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("planner: no owners -> waxing popular weekdays only; second owner toggles", async () => {
      const page = await browser.newPage(null);
      await page.goto(`${base}/planner.html`);
      await page.waitFor(() => !!window.__pl, 5000);
      const r = await page.evaluate(() => {
        document.getElementById("plAddOwner").click();
        const open = !document.getElementById("plOwner2").hidden && document.getElementById("plAddOwner").getAttribute("aria-expanded") === "true";
        document.getElementById("plAddOwner").click();
        document.querySelector('input[name=plEvent][value=work]').click();
        document.getElementById("plGo").click();
        const res = window.__pl.st.res;
        return { open, closed: document.getElementById("plOwner2").hidden, all: res.every(x => x.lunar.waxing && [1, 3, 4].includes(x.wd)), n: res.length,
          sub: document.getElementById("plResSub").textContent };
      });
      assert(r.open && r.closed && r.all && r.n > 0 && /ยังไม่ได้ใส่วันเกิด/.test(r.sub), JSON.stringify(r));
      await page.close();
    });

    for (const lang of ["en", "zh"]) {
      await check(`planner: ?lang=${lang} — form and results with no Thai left`, async () => {
        const page = await browser.newPage(null);
        await page.goto(`${base}/planner.html?lang=${lang}`);
        await page.waitFor(THAI_LEFT(lang), 8000).catch(async () => { throw new Error(`fresh: Thai left ${JSON.stringify(await page.evaluate(() => window.__lastThai))}`); });
        await page.evaluate(RUN);
        await page.waitFor(() => document.querySelectorAll(".pl-day").length > 0, 5000);
        await page.evaluate(() => document.querySelector(".pl-day input[type=checkbox]").click());
        await page.waitFor(THAI_LEFT(lang), 4000).catch(async () => { throw new Error(`results: Thai left ${JSON.stringify(await page.evaluate(() => window.__lastThai))}`); });
        const t = await page.evaluate(() => ({ h: document.getElementById("plResH").textContent, ics: window.__pl.icsText() }));
        assert(lang === "en" ? /Good days:/.test(t.h) : /吉日/.test(t.h), t.h);
        assert(!/[ก-๛]/.test(t.ics.replace(/\r\n /g, "")), "ics in " + lang + " has Thai: " + t.ics.slice(0, 300));
        await mobile(page);
        const errs = unexpected(page);
        assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
        await page.close();
      });
    }
  } finally { await browser.close(); }
}
