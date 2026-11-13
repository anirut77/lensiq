// tests/e2e/crisis-flow-lib.mjs — helpers for the crisis flow v2 e2e tests (owner decision 2026-11-13, docs/CRISIS-FLOW-V2.md).
// FIXED TEST SET: locked together with fortune-crisis-flow-v2.e2e.mjs and fortune-crisis-flow-v2-pages.e2e.mjs BEFORE the
// product change (sha256 in ~/LENSIQ-field/evals/fortune-honest/locked.sha256). Not a test file itself (run.mjs only runs
// *.e2e.mjs). Readers per page come from fortune-en.e2e.mjs / fortune-crisis-session.e2e.mjs (same steps).

export const S = JSON.stringify;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const LANGS = ["th", "en", "zh"];
export const PAGES = ["fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream", "zodiac", "astro",
  "lifegraph", "planner", "luckycolor", "report"];
export const NO_READING = ["fortune", "planner", "luckycolor"]; // pages without a composed reading (hub, planner, lucky-colour mirror)

export const langInit = l => `try { localStorage.setItem("lq-lang", ${S(l)}); } catch (e) {}`;
// worst case: straight mode forced ON and an adult who chose it (the shipped flag stays false)
export const FLAG_ON = `Object.defineProperty(window, "LENSIQ_FORTUNE_STRAIGHT", { configurable: true, get: () => true, set: () => {} });`;
export const ADULT = `try { localStorage.setItem("lq-fortune-straight", JSON.stringify({ adult: true, straight: true })); } catch (e) {}`;
export const CALM = `try { sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) {}`;
export const NO_STORAGE = `Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("blocked", "SecurityError"); } });`;
export const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
export const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };
export const DET = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;

export const CONT = { th: "ดูคำทำนายต่อ", en: "Continue to the reading", zh: "继续查看解读" };
export const NUMBERS = ["1323", "1669", "191", "1300", "021136789"];
export const CRISIS = { th: "อยากตายจริงๆ ไม่ไหวแล้ว", en: "I want to die tonight", zh: "我真的不想活了" };
export const SOFT = { th: "เหนื่อยจนทนไม่ไหวแล้ว", en: "I can't do this anymore", zh: "我好累，撑不下去了" };
export const ECHO = { th: /อยากตาย|ไม่ไหวแล้ว|ทนไม่ไหว/, en: /want to die|die tonight|can't do this anymore/i, zh: /不想活|撑不下去/ };
export const LUCKY = new RegExp(["ของมงคล|เครื่องราง|ของขลัง|วัตถุมงคล|พระเครื่อง|ตะกรุด|หินมงคล|กำไลมงคล|คริสตัล|ของนำโชค|เครื่องประดับมงคล|ปี่เซียะ",
  "\\b(?:amulets?|lucky charms?|good-luck charms?|talismans?|crystals?|lucky (?:items?|objects?|stones?|bracelets?))\\b", "吉祥物|护身符|开运物|水晶|貔貅|佛牌|平安符|幸运物"].join("|"), "i");
export const PURCHASE = /ซื้อ(?!ใจ)|เช่าพระ|เช่าบูชา|ราคา|\d\s*บาท|฿|โอนเงิน|ทำบุญแทน|\b(?:buy|buying|purchase|price|on your behalf)\b|购买|买(?!单)|价格|付款|代为|代办/i;
export const STRAIGHT_WORDS = /ดูตรง ๆ|read it straight|直说/i;
export const LABEL = { th: "ตามความเชื่อ โปรดใช้วิจารณญาณ", en: "According to belief, please use your own judgement", zh: "依据民间信仰，请自行判断" };

const setVal = (id, v) => `(() => { const e = document.getElementById(${S(id)}); e.value = ${S(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
export const cardShown = `[...document.querySelectorAll(".fa-support")].some(e => !e.closest("[hidden]") && e.getBoundingClientRect().height > 0)`;
export const softShown = `[...document.querySelectorAll(".fa-soft")].some(e => !e.closest("[hidden]") && e.getBoundingClientRect().height > 0)`;
const readingShown = `([...document.querySelectorAll(".fa-section, .rp-part")].filter(e => !e.closest("[hidden]") && e.getBoundingClientRect().height > 0).length >= 2)`;
export const stopOrReading = `(${cardShown}) || (${softShown}) || ${readingShown}`;

async function lcFill(p) {
  await p.evaluate(() => {
    document.getElementById("lcDay").value = "12"; document.getElementById("lcMonth").value = "5"; document.getElementById("lcYear").value = "2533";
    document.getElementById("lcTime").value = "08:00"; document.querySelector("#lcForm button[type=submit]").click();
  });
}
async function tarotPick(p) {
  await p.waitFor(() => !document.getElementById("trPick").hidden, 15000);
  await p.evaluate(() => document.getElementById("trAuto").click()); await sleep(900);
  await p.evaluate(() => document.getElementById("trReveal").click());
}
async function faceRead(p) {
  await p.evaluate(() => document.getElementById("frStartCam").click());
  await p.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
  await p.evaluate(d => { window.__dets = d; }, [FACE]);
  await p.waitFor(`!document.getElementById("frRead").disabled`, 8000);
  await p.evaluate(() => document.getElementById("frRead").click());
}
async function palmRead(p) {
  await p.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
  await p.evaluate(() => document.getElementById("plStartCam").click());
  await p.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 10000);
  await p.evaluate(d => { window.__dets = d; }, [HAND]);
  await sleep(600);
  await p.evaluate(() => document.getElementById("plSnap").click());
  await p.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
  await p.evaluate(() => document.getElementById("plRead").click());
}

/**
 * How each fortune page is asked for a reading.
 *   ask(page, text)  fills the page's free-text field with `text` (pages that have one) and asks for a reading
 *   after(page)      the steps a reader takes after the card / soft step to reach the reading (tarot: pick cards, …)
 *   text             the page has a free-text field the crisis net reads
 */
export const RUN = {
  fortune: { url: "fortune.html", none: true },
  planner: { url: "planner.html", none: true, async ask(p) {
    await p.evaluate(() => document.getElementById("plGo").click());
    await p.waitFor(() => !document.getElementById("plResult").hidden && document.querySelectorAll("#plList li").length > 0, 10000);
  } },
  luckycolor: { url: "luckycolor.html", none: true },
  tarot: { url: "tarot.html", text: true, async ask(p, t) {
    await p.evaluate(q => {
      document.getElementById("trQuestion").value = q; document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click();
      document.getElementById("trStart").click();
    }, t || "");
    await sleep(500);
  }, async after(p) {
    if (await p.evaluate(stopOrReading)) return;
    await tarotPick(p);
  } },
  iching: { url: "iching.html", text: true, async ask(p, t) {
    await p.evaluate(q => { document.getElementById("icQuestion").value = q; document.getElementById("icStart").click(); }, t || ""); await sleep(400);
  }, async after(p) {
    if (await p.evaluate(stopOrReading)) return;
    await p.waitFor(() => !document.getElementById("icStage").hidden, 10000);
    await p.evaluate(() => document.getElementById("icAuto").click());
  } },
  dream: { url: "dream.html", text: true, async ask(p, t) {
    await p.evaluate(setVal("drText", t || "ฝันเห็นงูใหญ่ในบ้าน แล้วนั่งเครื่องบินไปทะเล")); await sleep(500);
    if (await p.evaluate(`(${cardShown})`)) return; // the net shows the card while typing
    await p.evaluate(() => {
      if (!document.querySelector("#drSel .dr-x")) { const b = document.querySelector(".dr-pop"); if (b) b.click(); }
      document.getElementById("drForm").requestSubmit();
    });
  }, async after(p) {
    await sleep(600);
    if (await p.evaluate(stopOrReading)) return;
    await p.evaluate(() => {
      if (!document.querySelector("#drSel .dr-x")) { const b = document.querySelector(".dr-pop"); if (b) b.click(); }
      if (!document.getElementById("drGo").disabled) document.getElementById("drGo").click(); else document.getElementById("drForm").requestSubmit();
    });
  } },
  horoscope: { url: "horoscope.html", text: true, async ask(p, t) {
    await p.evaluate(setVal("hsName", t || "Somchai")); await p.evaluate(setVal("hsDay", "15")); await p.evaluate(setVal("hsMonth", "8")); await p.evaluate(setVal("hsYear", "1990"));
    await p.evaluate(() => document.getElementById("hsGo").click());
  } },
  numbers: { url: "numbers.html", text: true, async ask(p, t) {
    await p.evaluate(setVal("nmName", t || "")); await p.evaluate(setVal("nmPhone", "0823456789"));
    await p.evaluate(() => document.getElementById("nmGo").click());
  } },
  report: { url: "report.html", text: true, isolated: true, async ask(p, t) {
    await p.waitFor(() => window.__rp && document.getElementById("rpMode").textContent.length > 10, 8000);
    await p.evaluate(n => {
      document.getElementById("rpName").value = n; document.querySelector('[data-rp-type="report_basic"]').click();
      // re-lock 2026-11-13: 2533 is a Buddhist-era year; English / 中文 default to the Common Era, so choose พ.ศ. explicitly
      document.querySelector('input[name="rpAEra"][value="be"]').click();
      document.getElementById("rpAYear").value = "2533"; document.getElementById("rpGo").click();
    }, t || "Somchai");
  } },
  faceread: { url: "faceread.html?cpu&fakedet", text: true, cam: true, async ask(p, t) {
    await p.evaluate(setVal("frNick", t || "")); await faceRead(p);
  } },
  palm: { url: "palm.html?cpu&fakedet", text: true, cam: true, async ask(p, t) {
    await p.evaluate(setVal("plNick", t || "")); await palmRead(p);
  } },
  zodiac: { url: "zodiac.html", async ask(p) {
    await p.evaluate(() => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); });
  } },
  astro: { url: "astro.html", async ask(p) {
    await p.evaluate(setVal("asDay", "15")); await p.evaluate(setVal("asMonth", "5")); await p.evaluate(setVal("asYear", "2533"));
    await p.evaluate(() => document.getElementById("asForm").requestSubmit());
  } },
  fengshui: { url: "fengshui.html", async ask(p) {
    await p.evaluate(setVal("fsDay", "15")); await p.evaluate(setVal("fsMonth", "6")); await p.evaluate(setVal("fsYear", "2533"));
    await p.evaluate(() => document.getElementById("fsKuaForm").requestSubmit()); await sleep(500);
    await p.evaluate(() => document.getElementById("fsReadBtn").click());
  } },
  bazi: { url: "bazi.html", ask: lcFill }, taksa: { url: "taksa.html", ask: lcFill }, lek7: { url: "lek7.html", ask: lcFill }, lifegraph: { url: "lifegraph.html", ask: lcFill },
};

/** open a page in a tab (new tab or same tab) with a language and extra init scripts */
export async function open(browser, base, name, lang, { init = [], page = null, width = 360, height = 780, fakeCams = "" } = {}) {
  const P = RUN[name];
  const scripts = [langInit(lang)].concat(init, P.cam ? [fakeCams, DET] : []);
  const pg = page || await browser.newPage(null, { initScripts: scripts, isolated: !!P.isolated });
  if (!page) await pg.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await pg.goto(`${base}/${P.url}`);
  await pg.waitFor(`document.documentElement.lang && document.documentElement.lang.slice(0, 2) === ${S(lang)}`, 8000).catch(() => {});
  await sleep(500);
  return pg;
}
/** ask for a reading (optionally with typed text) and wait until a card, a soft step or a reading is on screen */
export async function ask(pg, name, text) {
  const P = RUN[name];
  if (P.ask) await P.ask(pg, text);
  if (P.none) return;
  await pg.waitFor(stopOrReading, 25000).catch(() => {});
  if (!(await pg.evaluate(`(${cardShown}) || (${softShown})`)) && P.after) { await P.after(pg); await pg.waitFor(stopOrReading, 25000).catch(() => {}); }
  await sleep(800);
}
/** press the card's continue button and complete the page's own steps until the reading is on screen */
export async function continueToReading(pg, name) {
  const ok = await pg.evaluate(() => {
    const b = [...document.querySelectorAll(".fa-support [data-lq-continue]")].find(x => x.getBoundingClientRect().height > 0);
    if (!b) return false; b.click(); return true;
  });
  if (!ok) throw new Error(name + ": no visible continue button on the card");
  await sleep(700);
  const P = RUN[name];
  if (P.after) await P.after(pg);
  await pg.waitFor(readingShown, 25000).catch(() => {});
  await sleep(1200);
}
/** answer the soft step ("go" = just the reading, "talk" = I'd like to talk to someone) */
export async function answerSoft(pg, name, which) {
  await pg.evaluate(w => { const b = [...document.querySelectorAll(`.fa-soft [data-soft="${w}"]`)].find(x => x.getBoundingClientRect().height > 0); b.click(); }, which);
  await sleep(700);
  if (which === "go") { const P = RUN[name]; if (P.after) await P.after(pg); await pg.waitFor(readingShown, 25000).catch(() => {}); await sleep(1200); }
}

/** what the reader can see right now (texts are returned for the Node-side word checks) */
export const SNAP = `(() => {
  const vis = e => { if (!e || e.closest("[hidden]")) return false; const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const txt = list => list.map(e => e.innerText).join("\\n");
  const cards = [...document.querySelectorAll(".fa-support")].filter(vis);
  const secs = [...document.querySelectorAll(".fa-section, .rp-part")].filter(vis);
  const hope = [...document.querySelectorAll(".fa-hope")].filter(vis);
  const merit = [...document.querySelectorAll(".lq-merit-card")].filter(vis);
  const panel = [...document.querySelectorAll(".lq-merit")].filter(vis);
  const bars = [...document.querySelectorAll(".lq-helpbar")].filter(vis);
  const crisisUi = [...document.querySelectorAll(".fa-support, .lq-helpbar, .fa-hope")];
  return {
    card: cards.length, soft: [...document.querySelectorAll(".fa-soft")].filter(vis).length,
    cardText: txt(cards), cardReview: cards.every(c => c.getAttribute("data-review") === "pending-professional-review"),
    cont: cards.flatMap(c => [...c.querySelectorAll("[data-lq-continue]")]).filter(vis).map(b => b.innerText.trim()),
    tels: cards.flatMap(c => [...c.querySelectorAll('a[href^="tel:"]')]).filter(vis).map(a => { const r = a.getBoundingClientRect();
      return { href: a.getAttribute("href").replace(/\\s+/g, ""), h: r.height, w: r.width }; }),
    sections: secs.length, readText: txt(secs) + "\\n" + txt(hope) + "\\n" + txt([...document.querySelectorAll(".fa-summary")].filter(vis)),
    hope: hope.length, hopeReview: hope.every(h => h.getAttribute("data-review") === "pending-professional-review"),
    meritCards: merit.length, meritText: txt(merit), meritTypes: merit.map(c => c.getAttribute("data-type")), meritPanel: panel.length,
    meritLabelled: merit.every(c => /ตามความเชื่อ|According to belief|依据民间信仰/.test(c.innerText)),
    paid: [...document.querySelectorAll(".lq-merit-paid, [data-lq-upsell], [data-lq-paid]")].filter(vis).length,
    remedies: [...document.querySelectorAll("[data-lq-remedy]")].filter(vis).map(e => e.id || e.className || e.tagName),
    straightCtl: [...document.querySelectorAll(".fa-straight")].filter(vis).length,
    straightMode: [...document.querySelectorAll('[data-fa-mode="straight"]')].filter(e => e.querySelector(".fa-section")).length,
    bars: bars.length, barReview: bars.every(b => b.getAttribute("data-review") === "pending-professional-review"),
    barMore: bars.some(b => b.querySelector("details, [data-lq-more]")),
    barTels: bars.flatMap(b => [...b.querySelectorAll('a[href^="tel:"]')]).map(a => a.getAttribute("href").replace(/\\s+/g, "")),
    chat: crisisUi.reduce((n, e) => n + e.querySelectorAll("textarea, input, [contenteditable]").length, 0) + document.querySelectorAll("[data-lq-chat]").length,
    errors: 0,
  };
})()`;
/** the pinned bar's 1323 link fully inside the viewport, checked with the first and the last reading section scrolled into view */
export const BAR_IN_VIEW = `(async () => {
  const vis = e => { if (!e || e.closest("[hidden]")) return false; const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const full = e => { if (!vis(e)) return false; const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; };
  const tel = () => [...document.querySelectorAll(".lq-helpbar a[href='tel:1323']")].some(full);
  const secs = [...document.querySelectorAll(".fa-section, .rp-part")].filter(vis);
  const targets = secs.length ? [secs[0], secs[secs.length - 1]] : [document.querySelector("main") || document.body];
  const out = [];
  for (const t of targets) {
    t.scrollIntoView({ block: "center" }); await new Promise(r => setTimeout(r, 250));
    out.push(tel());
  }
  if (!secs.length) { window.scrollTo(0, Math.max(0, (document.documentElement.scrollHeight - innerHeight) / 2)); await new Promise(r => setTimeout(r, 250)); out.push(tel()); }
  window.scrollTo(0, 0);
  return out;
})()`;
/** the stub merit server (paid flags ON) — the calm state must still show no paid section */
export function meritStub(seed) {
  return `(() => {
    window.LENSIQ_API_BASE = location.origin; window.LENSIQ_ANALYTICS = false; window.LENSIQ_MERIT_INTEREST_FORM = true;
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input.url, path = new URL(url, location.href).pathname, H = { "Content-Type": "application/json" };
      if (path === "/v1/merit/guidance") return Promise.resolve(new Response(JSON.stringify({ items: ${S(seed)}, interest_form: true, interest_retention_days: 30 }), { headers: H }));
      if (path.startsWith("/v1/") || path.startsWith("/api/")) return Promise.resolve(new Response("{}", { status: 404, headers: H }));
      return orig(input, init);
    };
  })();`;
}

/** every rule of the calm reading (spec §2–§5); returns a list of problems */
export function calmProblems(s, lang, { reading = true, typed = null } = {}) {
  const bad = [];
  if (s.card) bad.push("acknowledgement card still shown");
  if (s.soft) bad.push("soft step still shown");
  if (reading) {
    if (s.sections < 2) bad.push("no reading (" + s.sections + " sections)");
    if (s.hope < 2) bad.push("hope frame missing (" + s.hope + ")");
    if (!s.hopeReview) bad.push("hope frame not marked pending-professional-review");
  }
  if (s.bars < 1) bad.push("no pinned help bar");
  if (s.bars && !s.barMore) bad.push("help bar has no 'more help lines' control");
  if (s.bars && !s.barReview) bad.push("help bar not marked pending-professional-review");
  if (s.straightCtl || s.straightMode) bad.push("straight control / straight reading");
  if (STRAIGHT_WORDS.test(s.readText)) bad.push("straight wording");
  if (s.paid) bad.push("paid / upsell block visible (" + s.paid + ")");
  if (s.remedies.length) bad.push("remedy blocks visible " + S(s.remedies));
  if (s.meritTypes.includes("lucky_item")) bad.push("lucky-item merit card");
  if (s.meritCards && !s.meritLabelled) bad.push("merit card without the belief label");
  if (LUCKY.test(s.readText + "\n" + s.meritText)) bad.push("lucky object: " + ((s.readText + "\n" + s.meritText).match(LUCKY) || [])[0]);
  if (PURCHASE.test(s.readText + "\n" + s.meritText)) bad.push("purchase wording: " + ((s.readText + "\n" + s.meritText).match(PURCHASE) || [])[0]);
  if (s.chat) bad.push("text field / chat UI in the crisis UI");
  if (typed && ECHO[lang].test(s.readText + "\n" + s.cardText)) bad.push("typed text echoed");
  return bad;
}
/** every rule of the acknowledgement card (spec §1) */
export function cardProblems(s, lang) {
  const bad = [];
  if (s.card < 1) return ["no acknowledgement card"];
  if (s.sections) bad.push("reading drawn before continue (" + s.sections + ")");
  if (!s.cardReview) bad.push("card not marked pending-professional-review");
  if (s.cont.length !== 1 || s.cont[0] !== CONT[lang]) bad.push("continue button " + S(s.cont));
  for (const n of NUMBERS) {
    const t = s.tels.find(x => x.href === "tel:" + n);
    if (!t) bad.push("tel:" + n + " missing"); else if (t.h < 43.5 || t.w < 43.5) bad.push("tel:" + n + " too small " + Math.round(t.w) + "x" + Math.round(t.h));
  }
  if (ECHO[lang].test(s.cardText)) bad.push("card echoes the typed text");
  if (s.chat) bad.push("text field / chat UI in the card");
  if (STRAIGHT_WORDS.test(s.cardText)) bad.push("straight wording on the card");
  return bad;
}
export const sessionDump = () => {
  try { const o = {}; for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); o[k] = sessionStorage.getItem(k); } return o; } catch (e) { return { __blocked: "1" }; }
};
