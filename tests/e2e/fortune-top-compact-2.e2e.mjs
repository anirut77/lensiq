// tests/e2e/fortune-top-compact-2.e2e.mjs — FIXED TEST SET, fortune top compact, part 2: check C7 of
// tests/e2e/fortune-top-compact.e2e.mjs (owner decision 69 option ค 2026-11-16: confirmation step before calling), moved here
// verbatim so each file stays inside the runner's 15-minute limit (re-lock 2026-11-16, runtime only). The header comment of
// tests/e2e/fortune-top-compact.e2e.mjs describes every check.
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const ARIA = { th: "อยากมีคนรับฟัง โทร 1323", en: "Want someone to listen? Call 1323", zh: "想找人倾听？拨打 1323" };
const phone = async (page, w, h) => {
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
};
const open = (browser, lang) => browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
const tap = async (page, pt) => {
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(350);
};
const key = async (page, k) => {
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: k, windowsVirtualKeyCode: k === "Escape" ? 27 : 0 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k, windowsVirtualKeyCode: k === "Escape" ? 27 : 0 });
  await sleep(250);
};

const VIS = `const vis = e => { if (!e || !e.isConnected || !e.getClientRects().length) return false; const cs = getComputedStyle(e);
    if (cs.visibility === "hidden" || (e.checkVisibility && !e.checkVisibility({ visibilityProperty: true, opacityProperty: true }))) return false;
    for (let x = e; x && x.nodeType === 1; x = x.parentElement) { if (x.tagName === "DETAILS" && !x.open && x !== e && !(x.firstElementChild && x.firstElementChild.contains(e))) return false;
      if (x.tagName === "DIALOG" && !x.open) return false; }
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };`;
const HELP_A = `[...document.querySelectorAll('#lqHelpTop a[href^="tel:"]')].find(x => x.getClientRects().length)`;

/** in the page: places where 1323 shows (C8 counting rule) and help elements visible outside the top bar */
const PLACES = `(() => { ${VIS}
  const nav = document.getElementById("siteNav"), where = e => nav && nav.contains(e) ? "bar" : e.closest("dialog, [role=dialog]") ? "dialog" : "content";
  const re = /(?<!\\d)1323(?!\\d)/;
  const links = [...document.querySelectorAll('a[href^="tel:"]')].filter(a => a.getAttribute("href").replace(/\\D/g, "") === "1323" && vis(a));
  const out = links.map(a => "link:" + where(a));
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) { const p = t.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName) || !re.test(t.nodeValue) || links.some(a => a.contains(p)) || !vis(p)) continue;
    out.push("text:" + where(p)); }
  const content = [...document.querySelectorAll('.lq-helpline, .lq-call, .lq-call-mini, a[href^="tel:"]')].filter(e => vis(e) && where(e) === "content")
    .map(e => (e.id || e.className || e.tagName) + ":" + (e.getAttribute("href") || ""));
  return { places: out, content }; })()`;

/** in the page: the open confirmation dialog */
const DIALOG = `(() => { ${VIS}
  const d = [...document.querySelectorAll("dialog, [role=dialog]")].find(vis); if (!d) return null;
  const box = e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; };
  const call = [...d.querySelectorAll('a[href^="tel:"]')].filter(vis), close = [...d.querySelectorAll("button")].filter(vis);
  return { text: d.innerText.replace(/\\s+/g, " ").trim(), calls: call.map(a => ({ href: a.getAttribute("href"), ...box(a) })), closes: close.map(b => ({ text: b.innerText.trim(), aria: b.getAttribute("aria-label") || "", ...box(b) })),
    focusIn: d.contains(document.activeElement), vw: innerWidth, vh: innerHeight }; })()`;

async function load(page, base, p, lang) {
  await page.goto(`${base}/${p}.html?nosw`);
  await page.waitFor(`document.documentElement.lang === ${S(HTML_LANG[lang])} && !!document.querySelector('a[href="tel:1323"]')`, 10000);
  await sleep(700); // dictionaries, the read-more buttons and late scripts settle
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  const report = bad => assert(!bad.length, bad.length + " problem(s):\n" + bad.slice(0, 80).join("\n"));
  try {
    await check("C7: first tap opens a confirmation (wording, tel:1323 call link ≥ 44 px, close button), focus moves in; Escape / close return focus; the call link is one more tap", async () => {
      const bad = [];
      const runs = [["th", 393, 659], ["en", 393, 659], ["zh", 393, 659], ["th", 360, 640]];
      for (const [lang, w, h] of runs) {
        const page = await open(browser, lang);
        try {
          await phone(page, w, h);
          for (const p of ["faceread", "dream", "horoscope", "cat-fortune", "fortune", "report"]) {
            const tag = `${p} ${lang} ${w}`;
            try { await load(page, base, p, lang); } catch (e) { bad.push(`${tag}: did not load`); continue; }
            const url = await page.evaluate("location.href");
            await page.evaluate(`window.__tap = null; window.addEventListener("click", e => { const a = e.target && e.target.closest && e.target.closest("a[href]");
              window.__tap = { href: a ? a.getAttribute("href") : null, prevented: e.defaultPrevented }; }, { once: true });`);
            const c = await page.evaluate(`(() => { const a = ${HELP_A}; if (!a) return null; const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
            if (!c) { bad.push(`${tag}: no help control`); continue; }
            await tap(page, c);
            const first = await page.evaluate("window.__tap");
            const d = await page.evaluate(DIALOG);
            if (!d) { bad.push(`${tag}: the first tap opened no confirmation (${S(first)})`); continue; }
            if (!first || !first.prevented) bad.push(`${tag}: the first tap was not held back from calling ${S(first)}`);
            if (await page.evaluate("location.href") !== url) bad.push(`${tag}: the first tap navigated`);
            if (!d.text.includes(ARIA[lang])) bad.push(`${tag}: dialog text ${S(d.text)} (want ${S(ARIA[lang])})`);
            if (lang !== "th" && /[฀-๿]/.test(d.text)) bad.push(`${tag}: Thai letters in the ${lang} dialog`);
            const call = d.calls.filter(x => x.href === "tel:1323");
            if (d.calls.length !== 1 || call.length !== 1) bad.push(`${tag}: the dialog must hold one tel:1323 call link ${S(d.calls.map(x => x.href))}`);
            else if (call[0].w < 44 || call[0].h < 44 || call[0].top < 0 || call[0].bottom > d.vh || call[0].left < -0.5 || call[0].right > d.vw + 0.5) bad.push(`${tag}: call link ${S(call[0])}`);
            if (!d.closes.length) bad.push(`${tag}: no close button in the dialog`);
            else if (d.closes.some(x => x.h < 44 || x.w < 44)) bad.push(`${tag}: close button smaller than 44 px ${S(d.closes)}`);
            if (!d.focusIn) bad.push(`${tag}: focus did not move into the dialog`);
            // 1323 while open: the bar and the dialog only
            const open1 = await page.evaluate(PLACES);
            if (open1.places.some(x => x.endsWith(":content")) || open1.content.length) bad.push(`${tag}: help in the page content while the dialog is open ${S(open1)}`);
            // Escape closes, focus returns
            await key(page, "Escape");
            let st = await page.evaluate(`(() => { const a = ${HELP_A}; return { open: !!${DIALOG}, back: document.activeElement === a }; })()`);
            if (st.open) bad.push(`${tag}: Escape did not close the dialog`);
            if (!st.back) bad.push(`${tag}: focus did not return to the help control after Escape`);
            // the close button closes, focus returns
            await tap(page, c);
            const d2 = await page.evaluate(DIALOG);
            if (!d2 || !d2.closes.length) { bad.push(`${tag}: the dialog did not open again`); continue; }
            const cl = d2.closes[0];
            await tap(page, { x: (cl.left + cl.right) / 2, y: (cl.top + cl.bottom) / 2 });
            st = await page.evaluate(`(() => { const a = ${HELP_A}; return { open: !!${DIALOG}, back: document.activeElement === a }; })()`);
            if (st.open) bad.push(`${tag}: the close button did not close the dialog`);
            if (!st.back) bad.push(`${tag}: focus did not return to the help control after closing`);
            // the call itself: one more tap on the dialog's call link reaches tel:1323, nothing cancels it
            await tap(page, c);
            const d3 = await page.evaluate(DIALOG);
            const k = d3 && d3.calls.find(x => x.href === "tel:1323");
            if (!k) { bad.push(`${tag}: no call link on the third opening`); continue; }
            await page.evaluate(`window.__call = null; window.addEventListener("click", e => { const a = e.target && e.target.closest && e.target.closest("a[href]");
              window.__call = { href: a ? a.getAttribute("href") : null, prevented: e.defaultPrevented }; e.preventDefault(); }, { once: true });`);
            await tap(page, { x: (k.left + k.right) / 2, y: (k.top + k.bottom) / 2 });
            const call2 = await page.evaluate("window.__call");
            if (!call2 || call2.href !== "tel:1323" || call2.prevented) bad.push(`${tag}: the call link tap gave ${S(call2)}`);
          }
        } finally { await page.close(); }
      }
      report(bad);
    });

  } finally {
    await browser.close();
  }
}
