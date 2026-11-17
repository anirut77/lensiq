// tests/e2e/crisis-escape-guard-kit.mjs — FIXED TEST SET "crisis-escape-guard" (locked 2026-11-17 BEFORE measuring; copies +
// sha256 in ~/LENSIQ-field/evals/crisis-escape-guard/, evals-locks/crisis-escape-guard.sha256). Browser half of the guard asked
// for by the owner on 2026-11-17 after incident 2026-11-16 (docs/INCIDENT-2026-11-16-CRISIS-LEAK.md): a NEW result element
// that the crisis takeover does not hide must fail a test, without anyone first adding it to a list.
// Per reading page (TH, 375 px, own browser context):
//   1. open the page and do the set-up a visitor does before reading (camera on for faceread / palm);
//   2. TRACK: remember every element and whether it is visible, then watch the DOM (MutationObserver);
//   3. run a normal reading, wait until it is on screen;
//   4. COLLECT the result elements: every visible content element (own text, image, canvas, svg, video, button, link) that is
//      new, was hidden before, or whose own text changed, since step 2. Not counted: the help card / help lines, site navigation
//      and footer, input fields, selects, labels that hold a field, and elements that existed before inside a <form> (the
//      visitor's own form; the takeover keeps forms); the count must be > 0 or the reading did not happen;
//   5. trigger the crisis the way a visitor can: (report) the "report a problem with this reading" note, or (field) a crisis
//      phrase in the page's own free-text box (the kit's PHRASE: existing locked list); wait for the help card;
//   6. ASSERT: every collected element is allowed in the crisis state (ALLOWED below), and nothing new and visible appeared
//      after step 5 outside the card and the help lines.
// Re-lock v2 (2026-11-17, append-only, after the first run on 4a06544 and BEFORE measuring the fix): the first run flagged
// camera capture hints, the dream symbol chips the visitor picked, a re-labelled submit button and a form legend: none is
// reading content. v2 (a) uses the SAME reviewed list as the static half (tests/unit/crisis-escape-guard-allow.json:
// "targets" + "browser"): an element inside an allow-listed id of that page is not a result element; (b) content inside a
// <form> that existed before the reading is the visitor's form, also when it is re-drawn after the trigger (the takeover
// keeps forms; result content written into a form by id is the static half's job). Nothing else changed.
// Crisis v3 (in progress: the reading continues gently instead of a card) re-targets ONE place: MODE / ALLOWED below
// ("in the crisis state every result element is either hidden or v3-compliant"). Steps 1–5 and the collection stay.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ALLOW = JSON.parse(readFileSync(join(REPO, "tests/unit/crisis-escape-guard-allow.json"), "utf8"));
/** the ids allow-listed as NOT reading content on a page (static "targets" + browser-only "browser" entries) */
const allowIds = page => Object.keys(Object.assign({}, ALLOW.targets, ALLOW.browser || {})).map(k => k.split(" ")).filter(([p]) => p === page || p === "*").map(([, id]) => id);
const S = JSON.stringify;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
/** existing locked phrases (crisis-net-hotfix kit): TH, and the short ZH one for 4-character year boxes */
export const PHRASE = { th: "อยากตายจริงๆ", short: "我想死" };

/* ---------------- what is allowed to stay visible in the crisis state (re-target here for crisis v3) ---------------- */
export const MODE = "v2"; // v2: the help card replaces every result element
const HELP = ".fa-support, .fa-soft, .lq-helpline, #lqHelpTop, .lq-crisis-slot";
// v3 hook: when v3 ships, add its rule here, e.g. `|| (MODE === "v3" && !!e.closest("[data-lq-gentle]"))`, in a re-locked commit
const ALLOWED = `const allowed = e => !vis(e) || !!e.closest(${S(HELP)});`;

const VIS = `const vis = e => { for (let x = e; x && x.nodeType === 1; x = x.parentElement) { if (x.hidden) return false; const cs = getComputedStyle(x);
  if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };`;
const HELPERS = `${VIS}
  const own = e => { let t = ""; for (const n of e.childNodes) if (n.nodeType === 3) t += n.textContent; return t.replace(/\\s+/g, " ").trim(); };
  const content = e => { if (e.closest("svg") && !e.matches("svg")) return false; if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION|OPTGROUP|BR)$/.test(e.tagName)) return false;
    return !!own(e) || e.matches("img, canvas, svg, video, button, a[href], [role=img], meter, progress"); };
  const field = e => e.matches("input, select, textarea, option, optgroup, datalist") || (e.matches("label") && !!e.querySelector("input, select, textarea"));
  const ALLOW_IDS = window.__lqAllow || [];
  const allowListed = e => ALLOW_IDS.some(id => { const a = document.getElementById(id); return !!a && a.contains(e); });
  const preForm = e => { const f = e.closest("form"); return !!f && !!window.__lqG && window.__lqG.pre.has(f); };
  const exempt = (e, pre) => !!e.closest(${S(HELP)}) || !!e.closest("#siteNav, .nav, footer, .lq-foot, dialog") || field(e) || preForm(e) || allowListed(e);
  const desc = e => (e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\\s+/).slice(0, 2).join(".") : "")
    + (own(e) ? " \\"" + own(e).slice(0, 30) + "\\"" : "") + (e.closest("[id]") && e.closest("[id]") !== e ? " in #" + e.closest("[id]").id : ""));`;

/** step 2: remember every element and its visibility; record DOM changes from now on */
export const TRACK = `(() => { ${HELPERS}
  const G = window.__lqG = { pre: new Map(), changed: new Set(), after: new Set(), phase: 1 };
  for (const e of document.body.querySelectorAll("*")) G.pre.set(e, { vis: vis(e), txt: own(e) });
  const add = (set, n) => { if (!n) return; if (n.nodeType === 1) { set.add(n); n.querySelectorAll("*").forEach(x => set.add(x)); } else if (n.parentElement) set.add(n.parentElement); };
  G.mo = new MutationObserver(list => { for (const m of list) { const set = G.phase === 1 ? G.changed : G.after;
    if (m.type === "childList") { m.addedNodes.forEach(n => add(set, n)); if (m.target.nodeType === 1) set.add(m.target); }
    else if (m.type === "characterData") add(set, m.target);
    else if (m.attributeName === "src") set.add(m.target); } });
  G.mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["src"] });
  return G.pre.size; })()`;

/** step 4: the result elements of the reading just made (marked, counted, described) */
export const COLLECT = `(() => { ${HELPERS}
  const G = window.__lqG, out = [];
  G.cands = [];
  for (const e of document.body.querySelectorAll("*")) {
    const p = G.pre.get(e);
    if (!vis(e) || !content(e) || exempt(e, p)) continue;
    if (!p || !p.vis || p.txt !== own(e) || (G.changed.has(e) && e.matches("img, canvas, video"))) { G.cands.push(e); out.push(desc(e)); }
  }
  G.phase = 2;
  return out; })()`;

/** step 6: result elements still shown in the crisis state, and anything new shown after the trigger */
export const ESCAPED = `(() => { ${HELPERS} ${ALLOWED}
  const G = window.__lqG, bad = [];
  for (const e of G.cands) if (e.isConnected && !allowed(e)) bad.push(desc(e));
  for (const e of G.after) if (e.isConnected && vis(e) && content(e) && !exempt(e, G.pre.get(e)) && !allowed(e)) bad.push("new after the trigger: " + desc(e));
  return [...new Set(bad)]; })()`;

export const CARD = `(() => { ${VIS} const c = [...document.querySelectorAll(".fa-support")].find(vis); return !!c && /1323/.test(c.textContent) && document.documentElement.getAttribute("data-lq-crisis") === "1"; })()`;

const setVal = (sel, v) => `(() => { const e = document.querySelector(${S(sel)}); if (!e) throw new Error("no field ${sel.replace(/"/g, "'")}");
  e.focus(); e.value = ${S(v)}; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`;
const click = sel => `(() => { const e = document.querySelector(${S(sel)}); if (!e) throw new Error("no ${sel.replace(/"/g, "'")}"); e.click(); return true; })()`;
const submit = id => `(() => { document.getElementById(${S(id)}).requestSubmit(); return true; })()`;
const sections = (n, scope = "") => `[...document.querySelectorAll(${S((scope ? scope + " " : "") + ".fa-section")})].filter(e => e.getBoundingClientRect().height > 0).length >= ${n}`;
const ev = (p, s) => p.evaluate(s);

const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };
const DET = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const lcRead = async p => { await ev(p, `(() => { document.getElementById("lcDay").value = "12"; document.getElementById("lcMonth").value = "5"; document.getElementById("lcYear").value = "2533";
  const t = document.getElementById("lcTime"); if (t) t.value = "08:00"; document.querySelector("#lcForm button[type=submit]").click(); return true; })()`); await p.waitFor(sections(2), 15000); };
const lcField = async (p, q) => { await ev(p, setVal("#lcYear", q)); await ev(p, submit("lcForm")); };
const fillPerson = (i, d, m, y) => `(() => { const fs = document.querySelector('[data-cp-person="${i}"]');
  const set = (q, v) => { const e = fs.querySelector(q); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); };
  set("select[name=d]", "${d}"); set("select[name=m]", "${m}"); set("input[name=y]", "${y}"); return true; })()`;

/** Every reading page with a crisis entry point (tests/unit/crisis-escape-guard.test.js check 4 fails when one is missing).
 *  url, init (scripts before load), prep (before tracking), read (the normal reading, until it is on screen),
 *  field (crisis phrase into the page's own box after the reading; null = the page has no free-text box of its own),
 *  report (false = the page gets no "report a problem" button: nav.js does not inject it there) */
export const FLOWS = {
  faceread: { url: "faceread.html?cpu&fakedet", cam: true,
    prep: async p => { await ev(p, click("#frStartCam")); await p.waitFor(`!document.getElementById("frRead").hidden && !!document.querySelector("#frCam.live")`, 10000); },
    read: async p => { await p.evaluate(d => { window.__dets = d; }, [FACE]); await p.waitFor(`!document.getElementById("frRead").disabled`, 8000); await ev(p, click("#frRead")); await p.waitFor(sections(3, "#frNarr"), 20000); },
    field: async (p, q) => { await ev(p, setVal("#frNick", q)); }, report: true },
  palm: { url: "palm.html?cpu&fakedet", cam: true,
    prep: async p => { await p.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000); await ev(p, click("#plStartCam"));
      await p.waitFor(`!!document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 10000); },
    read: async p => { await p.evaluate(d => { window.__dets = d; }, [HAND]); await sleep(600); await ev(p, click("#plSnap"));
      await p.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000); await ev(p, click("#plRead")); await p.waitFor(sections(3, "#plNarr"), 20000); },
    field: async (p, q) => { await ev(p, setVal("#plNick", q)); }, report: true },
  horoscope: { url: "horoscope.html",
    read: async p => { await ev(p, setVal("#hsName", "Somchai")); await ev(p, setVal("#hsDay", "15")); await ev(p, setVal("#hsMonth", "8")); await ev(p, setVal("#hsYear", "2533")); await ev(p, click("#hsGo")); await p.waitFor(sections(3), 20000); },
    field: async (p, q) => { await ev(p, setVal("#hsName", q)); await ev(p, submit("hsForm")); }, report: true },
  tarot: { url: "tarot.html",
    read: async p => { await ev(p, `(() => { document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click(); document.getElementById("trStart").click(); return true; })()`);
      await sleep(600); await ev(p, click("#trAuto")); await sleep(900); await ev(p, click("#trReveal")); await p.waitFor(sections(3, "#trResult"), 25000); },
    field: async (p, q) => { await ev(p, click("#trAgain")); await sleep(300); await ev(p, setVal("#trQuestion", q)); await ev(p, submit("trSetup")); }, report: true },
  iching: { url: "iching.html",
    read: async p => { await ev(p, `(() => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); return true; })()`); await p.waitFor(sections(3, "#icResult"), 20000); },
    field: async (p, q) => { await ev(p, click("#icAgain")); await sleep(300); await ev(p, setVal("#icQuestion", q)); await ev(p, click("#icStart")); }, report: true },
  numbers: { url: "numbers.html",
    read: async p => { await ev(p, setVal("#nmPhone", "0812345678")); await ev(p, click("#nmGo")); await p.waitFor(sections(2), 15000); },
    field: async (p, q) => { await ev(p, click('.nm-tab[data-tab="name"]')); await sleep(200); await ev(p, setVal("#nmName", q)); try { await ev(p, submit("nmForm")); } catch (e) { /* replaced */ } }, report: true },
  dream: { url: "dream.html",
    read: async p => { await ev(p, setVal("#drText", "ฝันเห็นงูใหญ่ในบ้าน แล้วนั่งเครื่องบินไปทะเล")); await p.waitFor(`!document.getElementById("drGo").disabled`, 5000); await ev(p, click("#drGo")); await p.waitFor(sections(3), 15000); },
    field: async (p, q) => { await ev(p, setVal("#drText", q)); await ev(p, submit("drForm")); }, report: true },
  bazi: { url: "bazi.html", read: lcRead, field: lcField, short: true, report: true },
  taksa: { url: "taksa.html", read: lcRead, field: lcField, short: true, report: true },
  lek7: { url: "lek7.html", read: lcRead, field: lcField, short: true, report: true },
  lifegraph: { url: "lifegraph.html", read: lcRead, field: lcField, short: true, report: true },
  zodiac: { url: "zodiac.html",
    read: async p => { await ev(p, `(() => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); return true; })()`); await p.waitFor(sections(3), 15000); },
    field: async (p, q) => { await ev(p, setVal("#zdBirthYear", q)); await ev(p, submit("zdForm")); }, short: true, report: true },
  astro: { url: "astro.html",
    read: async p => { await ev(p, setVal("#asDay", "15")); await ev(p, setVal("#asMonth", "5")); await ev(p, setVal("#asYear", "2533")); await ev(p, submit("asForm")); await p.waitFor(sections(3), 15000); },
    field: async (p, q) => { await ev(p, setVal("#asYear", q)); await ev(p, submit("asForm")); }, short: true, report: true },
  fengshui: { url: "fengshui.html",
    read: async p => { await ev(p, setVal("#fsDay", "15")); await ev(p, setVal("#fsMonth", "6")); await ev(p, setVal("#fsYear", "2533")); await ev(p, submit("fsKuaForm")); await sleep(500);
      await ev(p, click("#fsReadBtn")); await p.waitFor(sections(2), 15000); },
    field: null, report: true },
  report: { url: "report.html",
    prep: async p => { await p.waitFor(`!!window.__rp && document.getElementById("rpMode").textContent.length > 10`, 8000); },
    read: async p => { await ev(p, setVal("#rpName", "Somchai")); await ev(p, click('[data-rp-type="report_basic"]')); await ev(p, setVal("#rpAYear", "2533")); await ev(p, click("#rpGo"));
      await p.waitFor(`document.querySelectorAll("#rpOut .rp-part").length >= 3`, 15000); },
    field: async (p, q) => { await ev(p, setVal("#rpName", q)); await ev(p, click("#rpGo")); }, report: false },
  compat: { url: "compat.html",
    prep: async p => { await p.waitFor(`!!window.LQCompat && !!document.getElementById("cpGo")`, 15000); },
    read: async p => { await ev(p, `(() => { const c = document.getElementById("cpConsent"); if (!c.checked) c.click(); return true; })()`);
      await ev(p, fillPerson(0, 14, 2, 1988)); await ev(p, fillPerson(1, 3, 9, 1992)); await ev(p, click("#cpGo")); await p.waitFor(`!!document.querySelector("#cpResult [data-compat-overview]")`, 20000); },
    field: async (p, q) => { await ev(p, setVal("#cpNick0", q)); await ev(p, click("#cpGo")); }, report: false },
};

/** the report dialog trigger: open it from the reading's button, type the phrase into the note */
async function reportTrigger(p, q) {
  await p.waitFor(`[...document.querySelectorAll(".lq-rp-btn")].some(b => b.getBoundingClientRect().height > 0)`, 8000);
  await ev(p, `(() => { [...document.querySelectorAll(".lq-rp-btn")].find(b => b.getBoundingClientRect().height > 0).click(); return true; })()`);
  await p.waitFor(`!!document.querySelector("dialog.lq-rp textarea")`, 5000);
  await ev(p, setVal("dialog.lq-rp textarea", q));
}

/** reading pages found the same way as the unit half: every *.html that loads fortune-read.js, fortune-ai.js or fortune-crisis.js */
export function readingPages() {
  return readdirSync(REPO).filter(f => f.endsWith(".html")).filter(f => /<script[^>]*\ssrc="(?:fortune-read|fortune-ai|fortune-crisis)\.js/.test(readFileSync(join(REPO, f), "utf8"))).map(f => f.slice(0, -5)).sort();
}

/** one page × one trigger: steps 1–6; returns the measured row; throws (assert) on an escape */
export async function runCase(browser, base, fakeCams, page, how) {
  const F = FLOWS[page], width = 375, label = `${page} [${how}, th, ${width}px]`;
  const p = await browser.newPage(null, { isolated: true, initScripts: F.cam ? [fakeCams, DET] : [] });
  try {
    await p.send("Emulation.setDeviceMetricsOverride", { width, height: 812, deviceScaleFactor: 2, mobile: true });
    await p.goto(`${base}/${F.url}${F.url.includes("?") ? "&" : "?"}lang=th`);
    await p.waitFor(`document.documentElement.lang === "th"`, 8000);
    await sleep(400);
    if (F.prep) await F.prep(p);
    await sleep(300);
    await ev(p, `window.__lqAllow = ${S(allowIds(page))}; true`);
    await ev(p, TRACK);
    await F.read(p);
    await sleep(1200); // late writes of the reading (counters, share card, report button)
    const cands = await ev(p, COLLECT);
    assert(cands.length > 0, label + ": no result element collected: the reading did not happen");
    const q = F.short ? PHRASE.short : PHRASE.th;
    if (how === "report") await reportTrigger(p, q); else await F.field(p, q);
    try { await p.waitFor(CARD, 15000); } catch (e) { throw new Error(label + ": NO CARD after the crisis phrase"); }
    await sleep(1500); // the takeover's own timers (scroll at 450 / 1100 ms) and any late page code
    const esc = await ev(p, ESCAPED);
    console.log(`    ${label}: ${cands.length} result elements collected, ${esc.length} visible in the crisis state`);
    assert(!esc.length, `${label}: ${esc.length} of ${cands.length} result elements escaped the crisis takeover (MODE ${MODE}):\n      ` + esc.slice(0, 25).join("\n      "));
    return { page, how, collected: cands.length, escaped: esc.length };
  } finally { await p.close(); }
}
