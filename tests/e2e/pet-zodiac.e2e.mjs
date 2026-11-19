// tests/e2e/pet-zodiac.e2e.mjs — FIXED TEST SET for the Pet zodiac share cards (owner spec 2026-11-19, branch pet-zodiac-cards),
// headless Chrome. Locked (evals-locks/pet-zodiac.sha256) BEFORE any product code; node half: tests/unit/pet-zodiac.test.js.
// Pictures are synthetic (a flat background and a flat orange ellipse); no real photo.
// RE-LOCK 1 (2026-11-19, owner decisions 137 ข / 138 ข, before any product commit): default odds = option b; the birthday rule
// is removed (P7 now checks it is gone); P2 checks the page's odds line is the one generated from the active config.
// Page seams used (the build adds them): window.__LQPET.zodiacDraw(id) draws that template (localhost only, for tests and
// owner samples); the card canvas carries data-template / data-label / data-rule; #petZ is the zodiac block with #petZOdds,
// #petZRedraw, #petZCol (.pet-zslot[data-id][data-state="found"|"missing"], the secret slot data-secret="1") and #petZCount;
// the 4 classic theme buttons sit in #petThemes.
//   P1  flag off (live default): classic card with the 4 theme buttons; no zodiac block; the draw module and the art are never
//       requested
//   P2  flag on: nothing of the zodiac mode is requested before the card is made; after Read the card has one of the 13 templates,
//       the theme buttons are hidden, the odds line on the page is exactly the text LQPetDraw.oddsText generates from the active
//       config for today (default b), the collection has 13 slots with 1 found
//   P3  the reading on the page is identical for all 13 templates (forced one by one); the 13 cards look different; the secret
//       card's label is "การ์ด Secret" / "Secret Card" / "隐藏卡" in TH / EN / ZH
//   P4  crisis: a crisis phrase in the name field (TH / EN / ZH) or a calm session: no card, no zodiac block, no art requested,
//       nothing written to the collection
//   P5  share: navigator.share gets one PNG file when the phone can share files; otherwise (or when share fails) the card is
//       saved as an image (download link); no network request
//   P6  collection: survives a reload; missing slots are silhouettes, the secret slot is marked; localStorage holds no image or
//       name; 25 free draws in a row work (no limit, no payment)
//   P7  no birthday rule: with the pet's birth date set to today's month-day, draws are ordinary (never data-rule="birthday", not
//       all secret) and the odds line does not mention a birthday
//   P8  phone width 360 and 390: the card section and the collection fit without horizontal scrolling
import { assert } from "./cdp.mjs";
import { sleep } from "./zones-lib.mjs";

const PET = { cls: 15, score: 0.91, x: 0.2, y: 0.15, w: 0.5, h: 0.7 };
const DET = `window.__PET_DETS = ${JSON.stringify([PET])}; window.__LQ_FAKE_DET = function (key) { return key === "pet" ? window.__PET_DETS : []; };`;
const ZON = `window.LENSIQ_PET_ZODIAC = true;`;
const LANG = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const SYNTH = `(() => { const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d");
  x.fillStyle = "#5b8bd6"; x.fillRect(0, 0, 640, 480); x.fillStyle = "#e08a2e"; x.beginPath(); x.ellipse(288, 264, 150, 160, 0, 0, 7); x.fill();
  return c.toDataURL("image/png"); })()`;
const ZODIAC = ["rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "goat", "monkey", "rooster", "dog", "pig"];
const ALL = ZODIAC.concat(["secret"]);
const SECRET = { th: "การ์ด Secret", en: "Secret Card", zh: "隐藏卡" };
const PHRASE = { th: "อยากตายจริงๆ", en: "I want to die tonight", zh: "我不想活了" };
const ZFILES = /lensiq-pet-draw\.js|lensiq-pet-zodiac-art\.js/;
const zReq = page => page.requests.filter(r => ZFILES.test(r.url));

async function open(browser, base, { lang = "th", zodiac = true, init = [], width = 0, query = "?fakedet&nosw" } = {}) {
  const page = await browser.newPage(null, { isolated: true, initScripts: [LANG(lang), DET, ...(zodiac ? [ZON] : []), ...init] });
  if (width) await page.send("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/petread.html${query}${lang !== "th" ? "&lang=" + lang : ""}`);
  await page.waitFor("window.__LQPET && window.__LQPET.ready", 15000);
  if (lang !== "th") await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
  return page;
}
async function fill(page, { name = "Mochi", birth = "2021-03-14", photo = true } = {}) {
  if (photo) {
    await page.evaluate(`window.__LQPET.useImage(${SYNTH})`);
    await page.waitFor("window.__LQPET.st.detected === true || window.__LQPET.st.detFailed === true", 30000);
  }
  await page.evaluate(([n, b]) => {
    const s = document.querySelector('input[name="petSpecies"][value="cat"]'); if (s && !s.checked) s.click();
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    set("petName", n); set("petBirth", b);
  }, [name, birth]);
}
async function readNow(page) {
  await page.evaluate(() => document.getElementById("petRead").click());
  await page.waitFor("document.querySelectorAll('#petReading .fa-section').length >= 2", 10000);
}
const cardDone = "document.getElementById('petCard').dataset.drawn === '1' && !!document.getElementById('petCard').dataset.template";
const vis = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return !e.closest("[hidden]") && cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0; })()`;
const STORE = `(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^lq-pet-zodiac/.test(k)) o[k] = localStorage.getItem(k); } return o; })()`;
const FP = `(() => { const cv = document.getElementById("petCard"), t = document.createElement("canvas"); t.width = 24; t.height = 30;
  const x = t.getContext("2d"); x.drawImage(cv, 0, 0, 24, 30); return Array.from(x.getImageData(0, 0, 24, 30).data).join(","); })()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("P1 flag off (live default): classic card with 4 theme buttons, no zodiac block, zodiac files never requested", async () => {
      const page = await open(browser, base, { zodiac: false });
      await fill(page); await readNow(page);
      await page.waitFor("document.getElementById('petCard').dataset.drawn === '1'", 8000);
      await sleep(500);
      const r = await page.evaluate(`({ themes: ${vis("#petThemes")}, n: document.querySelectorAll("#petThemes .pet-theme[data-theme]").length,
        z: ${vis("#petZ")}, tpl: document.getElementById("petCard").dataset.template || "" })`);
      assert(r.themes && r.n === 4, "classic theme buttons " + JSON.stringify(r));
      assert(!r.z && !r.tpl, "no zodiac mode with the flag off " + JSON.stringify(r));
      assert(!zReq(page).length, "zodiac files requested with the flag off: " + zReq(page).map(q => q.url).join(", "));
      await page.close();
    });

    await check("P2 flag on: lazy until the card is made; then one of 13 templates, themes hidden, odds from config, 13-slot collection", async () => {
      const page = await open(browser, base);
      await fill(page);
      await sleep(400);
      assert(!zReq(page).length, "zodiac files requested before the card is made: " + zReq(page).map(q => q.url).join(", "));
      await readNow(page);
      await page.waitFor(cardDone, 10000);
      const r = await page.evaluate(`({ tpl: document.getElementById("petCard").dataset.template, themes: ${vis("#petThemes")}, z: ${vis("#petZ")},
        odds: (document.getElementById("petZOdds") || {}).textContent || "", slots: document.querySelectorAll("#petZCol .pet-zslot").length,
        found: document.querySelectorAll('#petZCol .pet-zslot[data-state="found"]').length, redraw: ${vis("#petZRedraw")} })`);
      assert(ALL.includes(r.tpl), "template id " + r.tpl);
      assert(!r.themes && r.z && r.redraw, "zodiac block shown, classic themes hidden " + JSON.stringify(r));
      const want = await page.evaluate(() => { const D = window.LQPetDraw, cfg = D.config(window.LENSIQ_PET_ZODIAC_ODDS), t = D.today();
        return { lines: D.oddsText(cfg, { today: t }, "th"), id: cfg.id, p: D.odds(cfg, { today: t }) }; });
      assert(want.id === "b", "active config is the default b: " + want.id);
      assert(want.lines.every(l => r.odds.includes(l)), "odds line generated from the config: " + r.odds + " vs " + JSON.stringify(want.lines));
      assert(/%/.test(r.odds) && r.odds.length < 400, "short odds line: " + r.odds);
      assert(r.slots === 13 && r.found === 1, "13 slots, 1 found " + JSON.stringify(r));
      assert(zReq(page).length >= 1, "the art was loaded when the card was made");
      await page.close();
    });

    await check("P3 reading identical for all 13 templates; 13 different cards; secret label exact in TH / EN / ZH", async () => {
      for (const lang of ["th", "en", "zh"]) {
        const page = await open(browser, base, { lang });
        await fill(page); await readNow(page); await page.waitFor(cardDone, 10000);
        const reading0 = await page.evaluate(() => document.getElementById("petReading").innerText);
        const prints = new Set();
        for (const id of (lang === "th" ? ALL : ["rat", "secret"])) {
          await page.evaluate(i => window.__LQPET.zodiacDraw(i), id);
          await page.waitFor(`document.getElementById("petCard").dataset.template === ${JSON.stringify(id)}`, 8000);
          await sleep(120);
          const r = await page.evaluate(`({ reading: document.getElementById("petReading").innerText, label: document.getElementById("petCard").dataset.label || "", fp: ${FP} })`);
          assert(r.reading === reading0, `${lang} ${id}: the reading changed with the card`);
          prints.add(r.fp);
          if (id === "secret") assert(r.label.includes(SECRET[lang]), `${lang}: secret label "${r.label}"`);
          else if (lang !== "th") assert(!/[฀-๿]/.test(r.label) && r.label.length >= 2, `${lang} ${id}: label "${r.label}"`);
        }
        if (lang === "th") assert(prints.size === 13, `13 different cards, got ${prints.size}`);
        await page.close();
      }
    });

    await check("P4 crisis: phrase in the name (TH / EN / ZH) or a calm session -> no card, no zodiac block, no art, nothing stored", async () => {
      const runs = [["th", PHRASE.th, []], ["en", PHRASE.en, []], ["zh", PHRASE.zh, []],
        ["th", "Mochi", [`try { sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) {}`]]];
      for (const [lang, name, init] of runs) {
        const page = await open(browser, base, { lang, init });
        await fill(page, { name }); await readNow(page); await sleep(900);
        const r = await page.evaluate(`({ card: ${vis("#petCardSec")}, z: ${vis("#petZ")}, tpl: document.getElementById("petCard").dataset.template || "", store: ${STORE} })`);
        assert(!r.card && !r.z && !r.tpl, `${lang} "${name}": a card in a crisis session ${JSON.stringify(r)}`);
        assert(!Object.keys(r.store).length, `${lang}: collection written in a crisis session ${JSON.stringify(r.store)}`);
        assert(!zReq(page).length, `${lang}: art requested in a crisis session`);
        await page.close();
      }
    });

    await check("P5 share: navigator.share gets one PNG; no file sharing or a failed share -> saved as an image; no network", async () => {
      const HOOK = `window.__shared = []; window.__saved = [];
        const ck = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__saved.push({ name: this.download, href: this.href }); return; } return ck.call(this); };`;
      const MODES = {
        share: `navigator.canShare = () => true; navigator.share = d => { window.__shared.push((d.files || []).map(f => ({ n: f.name, t: f.type, s: f.size }))); return Promise.resolve(); };`,
        none: `navigator.canShare = undefined; navigator.share = undefined;`,
        fail: `navigator.canShare = () => true; navigator.share = () => Promise.reject(new DOMException("nope", "NotAllowedError"));`,
      };
      for (const [mode, js] of Object.entries(MODES)) {
        const page = await open(browser, base, { init: [HOOK, js] });
        await fill(page); await readNow(page); await page.waitFor(cardDone, 10000);
        page.requests.length = 0;
        await page.evaluate(() => document.getElementById("petCardShare").click());
        await sleep(1200);
        const r = await page.evaluate(() => ({ shared: window.__shared, saved: window.__saved }));
        if (mode === "share") assert(r.shared.length === 1 && r.shared[0].length === 1 && r.shared[0][0].t === "image/png" && r.shared[0][0].s > 1000 && !r.saved.length, "shared " + JSON.stringify(r));
        else assert(r.saved.length === 1 && /\.png$/.test(r.saved[0].name) && /^blob:/.test(r.saved[0].href), mode + ": saved " + JSON.stringify(r));
        const net = page.requests.filter(q => /^https?:/.test(q.url));
        assert(!net.length, mode + ": network " + net.map(q => q.url).join(", "));
        await page.close();
      }
    });

    await check("P6 collection survives a reload, silhouettes + secret slot, no image or name stored, 25 free draws", async () => {
      const page = await open(browser, base);
      await fill(page, { name: "ส้มจี๊ด" }); await readNow(page); await page.waitFor(cardDone, 10000);
      for (let i = 0; i < 25; i++) {
        const before = await page.evaluate(() => document.getElementById("petCard").dataset.drawSeq || "");
        await page.evaluate(() => document.getElementById("petZRedraw").click());
        await page.waitFor(`(document.getElementById("petCard").dataset.drawSeq || "") !== ${JSON.stringify(before)}`, 6000);
      }
      const a = await page.evaluate(`({ found: [...document.querySelectorAll('#petZCol .pet-zslot[data-state="found"]')].map(e => e.dataset.id),
        missing: document.querySelectorAll('#petZCol .pet-zslot[data-state="missing"]').length, secret: document.querySelectorAll('#petZCol .pet-zslot[data-secret="1"]').length,
        secretId: (document.querySelector('#petZCol .pet-zslot[data-secret="1"]') || {}).dataset?.id, count: (document.getElementById("petZCount") || {}).textContent || "", store: ${STORE} })`);
      assert(a.found.length >= 2 && a.found.length + a.missing === 13, "found + missing = 13 " + JSON.stringify(a));
      assert(a.secret === 1 && a.secretId === "secret", "the secret slot is marked " + JSON.stringify(a));
      assert(a.count.includes(String(a.found.length)) && a.count.includes("13"), "count " + a.count);
      const raw = Object.values(a.store).join("\n");
      assert(raw.length && raw.length < 1500 && !/data:|base64|blob:|ส้มจี๊ด|Mochi/.test(raw), "storage holds ids + dates only: " + raw);
      // missing slots are silhouettes: no animal colours (near-greyscale pixels)
      const sil = await page.evaluate(() => {
        const s = document.querySelector('#petZCol .pet-zslot[data-state="missing"] canvas'); if (!s) return null;
        const d = s.getContext("2d").getImageData(0, 0, s.width, s.height).data; let col = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 20) continue; n++; const m = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); if (m > 40) col++; }
        return { n, share: n ? col / n : 1 };
      });
      assert(!sil || (sil.n > 50 && sil.share < 0.2), "missing slot is a silhouette " + JSON.stringify(sil));
      await page.reload();
      await page.waitFor("window.__LQPET && window.__LQPET.ready", 15000);
      await fill(page, { photo: false }); await readNow(page); await page.waitFor(cardDone, 10000);
      const b = await page.evaluate(() => [...document.querySelectorAll('#petZCol .pet-zslot[data-state="found"]')].map(e => e.dataset.id));
      assert(a.found.every(id => b.includes(id)), "collection kept after reload " + JSON.stringify({ a: a.found, b }));
      await page.close();
    });

    await check("P7 no birthday rule: a birth date on today's month-day gives ordinary draws", async () => {
      const page = await open(browser, base);
      const today = await page.evaluate(() => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; });
      const bd = (Number(today.slice(0, 4)) - 4) + today.slice(4); // 4 years back: a 29 Feb stays valid
      await fill(page, { birth: bd }); await readNow(page); await page.waitFor(cardDone, 10000);
      const seen = [];
      for (let i = 0; i < 8; i++) {
        const r = await page.evaluate(() => ({ t: document.getElementById("petCard").dataset.template, rule: document.getElementById("petCard").dataset.rule || "", s: document.getElementById("petCard").dataset.drawSeq || "" }));
        seen.push(r);
        await page.evaluate(() => document.getElementById("petZRedraw").click());
        await page.waitFor(`(document.getElementById("petCard").dataset.drawSeq || "") !== ${JSON.stringify(r.s)}`, 6000);
      }
      assert(seen.every(r => r.rule !== "birthday"), "a birthday rule fired " + JSON.stringify(seen));
      assert(!seen.every(r => r.t === "secret"), "every draw was the secret card " + JSON.stringify(seen));
      const odds = await page.evaluate(() => document.getElementById("petZOdds").textContent);
      assert(!/วันเกิด|birthday|生日/i.test(odds), "the odds line mentions a birthday: " + odds);
      await page.close();
    });

    await check("P8 phone width 360 and 390: card section and collection fit, no horizontal scroll", async () => {
      for (const width of [360, 390]) {
        const page = await open(browser, base, { width });
        await fill(page); await readNow(page); await page.waitFor(cardDone, 10000); await sleep(300);
        const r = await page.evaluate(() => {
          const sec = document.getElementById("petCardSec").getBoundingClientRect(), col = document.getElementById("petZCol").getBoundingClientRect();
          return { sx: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sr: sec.right, cr: col.right, cl: col.left };
        });
        assert(r.sx <= r.cw && r.sr <= r.cw + 0.5 && r.cr <= r.cw + 0.5 && r.cl >= -0.5, `${width}: overflow ${JSON.stringify(r)}`);
        await page.close();
      }
    });
  } finally { await browser.close(); }
}
