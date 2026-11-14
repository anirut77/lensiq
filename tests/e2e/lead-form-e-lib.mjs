// tests/e2e/lead-form-e-lib.mjs — shared body of lead-form-e-chrome.e2e.mjs and lead-form-e-webkit.e2e.mjs (Part E of the
// owner order 2026-11-14, defect W-001: a request that was not sent must never look like success).
// FIXED TEST SET, locked BEFORE the fix in ~/LENSIQ-field/evals/lead-form-e/ and evals-locks/lead-form-e.sha256.
// Same set-up as lead-form-webkit.e2e.mjs: the home page served from this checkout with the deploy's site-config + CSP
// transform, Cloudflare Turnstile TEST site keys (1x… always passes, 2x… always fails), a fake API origin answered by the
// test (nothing reaches the real Worker), service workers blocked. Checked at widths 360, 375 and 414.
//   E1 network failure / 403 Turnstile refusal / 5xx / offline: no success class, no green frame, "not sent yet" text in
//      TH / EN / ZH, every field kept, a retry button and the LINE @632yliiw button (both at least 44 px tall), the
//      request kept in the local queue
//   E2 retry button: sends again with a fresh token; success only after the 2xx; queue emptied
//   E3 offline queue: back online -> sent automatically after the bot check; removed from the queue only after the 2xx
//   E4 queued requests are retried automatically on page load after Turnstile passes; a 5xx keeps the request, a 2xx
//      removes it; a failed Turnstile check sends nothing and removes nothing
//   E5 success style only on a confirmed 2xx; form switched off -> never the success style
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { siteConfigJs } from "../../tools/build-site.mjs";
import { apply as applyCsp, policy as cspPolicy } from "../../tools/csp-meta.mjs";
import { assert } from "./cdp.mjs";

const API = "https://api.lqtest.invalid";
export const KEYS = { pass: "1x00000000000000000000AA", fail: "2x00000000000000000000AB" };
const LINE = /^https:\/\/line\.me\/R\/ti\/p\/(%40|@)632yliiw$/;
const NOT_SENT = { th: /ยังไม่ได้ส่ง/, en: /Not sent yet/i, zh: /尚未发送/ };
const THAI = /[฀-๿]/;
const NAME = "สมชาย ทดสอบ", PHONE = "0812345678", MSG = "ต้องการใบเสนอราคา 3 สาขา";
const WIDTHS = [360, 375, 414];

/**
 * @param {{browser: any, ctxOpts: (width?: number) => any, label: string, base: string, repo: string, check: Function}} o
 */
export async function runFormE({ browser, ctxOpts, label, base, repo, check }) {
  /** a fresh tab on index.html#contact */
  async function open({ key = KEYS.pass, api = [201], lang = "th", width, seed = null, formOff = false } = {}) {
    const ctx = await browser.newContext({ ...ctxOpts(width), serviceWorkers: "block" });
    const page = await ctx.newPage();
    const cfg = { apiBase: API, turnstileSiteKey: key, pages: ["index.html"], analytics: false, member: false, testerGate: false };
    const st = { posts: [], navs: 0, errors: [], apiQueue: api.slice() };
    page.on("framenavigated", f => { if (f === page.mainFrame()) st.navs++; });
    page.on("pageerror", e => st.errors.push(e.message));
    page.on("crash", () => st.errors.push("CRASH"));
    if (seed) await page.addInitScript(s => { try { if (!sessionStorage.getItem("lq-e-seeded")) { localStorage.setItem("lq-leads", JSON.stringify(s)); sessionStorage.setItem("lq-e-seeded", "1"); } } catch (e) { /* storage blocked */ } }, seed);
    if (formOff) await page.addInitScript(() => { window.LENSIQ_LEADS_FORM = false; });
    await page.route(/\/index\.html(\?.*)?$/, async route => {
      const html = readFileSync(join(repo, "index.html"), "utf8");
      const m = /[ \t]*<script src="lensiq-config\.js(\?[^"]*)?"><\/script>/.exec(html);
      const out = applyCsp(html.slice(0, m.index) + '<script src="lensiq-site-config.js?v=t"></script>\n' + html.slice(m.index),
        cspPolicy({ connect: [API], turnstile: true }));
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: out });
    });
    await page.route(/\/lensiq-site-config\.js/, route => route.fulfill({ status: 200, contentType: "text/javascript", body: siteConfigJs(cfg) }));
    await page.route(API + "/**", async route => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST" } });
      const cors = { "access-control-allow-origin": "*" };
      if (/\/v1\/leads$/.test(req.url()) && req.method() === "POST") {
        st.posts.push({ token: req.headers()["x-turnstile-token"] || "", body: req.postDataJSON() });
        const next = st.apiQueue.length > 1 ? st.apiQueue.shift() : st.apiQueue[0];
        if (next === "abort") return route.abort("failed");
        return route.fulfill({ status: next, headers: cors, contentType: "application/json",
          body: next >= 200 && next < 300 ? '{"ok":true,"id":"t1"}' : '{"error":"x","code":"' + (next === 403 ? "turnstile_failed" : "server") + '"}' });
      }
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: "{}" });
    });
    await page.goto(base + "/index.html#contact", { waitUntil: "load" });
    if (lang !== "th") await page.evaluate(l => window.LQI18N && window.LQI18N.setLang(l), lang);
    await page.waitForTimeout(300);
    return { ctx, page, st };
  }
  const fill = async page => {
    await page.fill("#lqName", NAME); await page.fill("#lqPhone", PHONE);
    await page.selectOption("#lqInterest", { index: 1 }); await page.fill("#lqMsg", MSG); await page.check("#lqConsent");
  };
  const submit = page => page.click("#leadForm button[type=submit]");
  const msg = page => page.evaluate(() => { const m = document.getElementById("leadMsg"); return { cls: m.className, text: m.textContent || "" }; });
  const queue = page => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("lq-leads") || "[]"); } catch (e) { return null; } });
  /** waits until the form message is final (not empty, not "sending…") */
  const settled = (page, ms = 40000) => page.waitForFunction(() => {
    const m = document.getElementById("leadMsg"), b = document.querySelector("#leadForm button[type=submit]");
    return !!m && (m.textContent || "").trim().length > 10 && !/…/.test(m.textContent || "") && b && !b.disabled;
  }, null, { timeout: ms });
  /** everything the person sees after a failure */
  const failView = page => page.evaluate(() => {
    const green = (/** @type {string} */ c) => {
      const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?/.exec(c || "");
      if (!m) return false;
      const r = +m[1], g = +m[2], b = +m[3], a = m[4] == null ? 1 : +m[4];
      return a > 0.05 && g > r + 15 && g > b + 5;
    };
    const vis = (/** @type {Element} */ e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
    const greens = [];
    for (const root of [document.getElementById("leadForm"), document.querySelector("[data-lq-pending]")]) {
      if (!root) continue;
      for (const e of [root, ...root.querySelectorAll("*")]) {
        if (e.closest("#lqTurnstile") || !vis(e)) continue;
        const cs = getComputedStyle(e);
        const border = parseFloat(cs.borderTopWidth) > 0 ? cs.borderTopColor : "";
        if (green(cs.backgroundColor) || green(border) || (e.id === "leadMsg" && green(cs.color))) greens.push((e.id || e.className || e.tagName) + " bg=" + cs.backgroundColor + " border=" + border);
      }
    }
    const m = document.getElementById("leadMsg");
    const box = (/** @type {Element|null} */ e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { h: Math.round(r.height), left: r.left, right: r.right, vis: vis(e), text: (e.textContent || "").trim() }; };
    const retry = m.querySelector("[data-lq-retry]");
    const line = Array.from(m.querySelectorAll("a[href*='line.me']")).find(vis) || null;
    const pend = document.querySelector("[data-lq-pending]");
    return {
      cls: m.className, text: m.textContent || "", greens,
      retry: box(retry), retryTag: retry ? retry.tagName : "",
      line: box(line), lineHref: line ? line.getAttribute("href") : "",
      pendingBtns: pend && !pend.hidden ? Array.from(pend.querySelectorAll("button, a")).filter(vis).map(e => Math.round(e.getBoundingClientRect().height)) : [],
      fields: { name: document.getElementById("lqName").value, phone: document.getElementById("lqPhone").value, msg: document.getElementById("lqMsg").value,
        interest: document.getElementById("lqInterest").value, consent: document.getElementById("lqConsent").checked },
      vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth
    };
  });
  /** the common assertions for every "not sent" case */
  function assertNotSent(v, lang, what) {
    assert(!/\bok\b/.test(v.cls), what + ": no success class: " + v.cls);
    assert(!v.greens.length, what + ": no green frame: " + JSON.stringify(v.greens));
    assert(NOT_SENT[lang].test(v.text), what + ": says 'not sent yet' (" + lang + "): " + v.text);
    if (lang !== "th") assert(!THAI.test(v.text.split(NAME).join("")), what + ": no Thai in the " + lang + " message: " + v.text);
    assert(v.fields.name === NAME && v.fields.phone === PHONE && v.fields.msg === MSG && v.fields.interest && v.fields.consent, what + ": fields kept: " + JSON.stringify(v.fields));
    assert(v.retry && v.retry.vis && v.retry.h >= 44, what + ": retry button visible, >= 44 px: " + JSON.stringify(v.retry));
    if (lang !== "th") assert(!THAI.test(v.retry.text), what + ": retry button in " + lang + ": " + v.retry.text);
    assert(v.line && v.line.vis && v.line.h >= 44 && LINE.test(v.lineHref), what + ": LINE @632yliiw button visible, >= 44 px: " + JSON.stringify(v.line) + " " + v.lineHref);
    for (const b of [v.retry, v.line]) assert(b.left >= 0 && b.right <= v.vw + 0.5, what + ": button inside the screen width " + v.vw + ": " + JSON.stringify(b));
    assert(v.sw <= v.vw, what + ": no sideways scroll: " + v.sw + " > " + v.vw);
    assert(v.pendingBtns.every(h => h >= 44), what + ": queue box buttons >= 44 px: " + JSON.stringify(v.pendingBtns));
  }

  // E1 — network failure at each width
  for (const width of WIDTHS) {
    await check(`${label} ${width}px: network failure -> 'ยังไม่ได้ส่ง', no green, text kept, retry + LINE (>= 44 px), queued`, async () => {
      const { ctx, page, st } = await open({ api: ["abort"], width });
      try {
        await fill(page); await submit(page); await settled(page);
        const v = await failView(page);
        assertNotSent(v, "th", "network " + width);
        assert(st.posts.length === 1 && st.posts[0].token.length > 0, "one POST with a token: " + st.posts.length);
        const q = await queue(page);
        assert(q && q.length === 1 && q[0].message === MSG && q[0].name === NAME, "kept in the local queue: " + JSON.stringify(q));
        assert(st.navs === 1 && !st.errors.length, "no reload / page errors: " + JSON.stringify(st.errors));
      } finally { await ctx.close(); }
    });
  }

  // E1 — 403 from the server (Turnstile refused)
  await check(`${label}: 403 (Turnstile refused by the server) -> not sent, no green, text kept, retry + LINE, queued`, async () => {
    const { ctx, page, st } = await open({ api: [403] });
    try {
      await fill(page); await submit(page); await settled(page);
      assertNotSent(await failView(page), "th", "403");
      assert(st.posts.length === 1, "one POST");
      assert((await queue(page)).length === 1, "queued");
    } finally { await ctx.close(); }
  });

  // E1 — Turnstile fails in the browser (no token): nothing sent at all
  await check(`${label}: Turnstile check fails -> nothing sent, 'ยังไม่ได้ส่ง', no green, text kept, retry + LINE`, async () => {
    const { ctx, page, st } = await open({ key: KEYS.fail, api: [201] });
    try {
      await fill(page); await submit(page); await settled(page, 60000);
      assertNotSent(await failView(page), "th", "turnstile");
      assert(st.posts.length === 0, "no POST without a token: " + st.posts.length);
    } finally { await ctx.close(); }
  });

  // E1 — 5xx in English and Chinese, at the narrowest width
  for (const lang of ["en", "zh"]) {
    await check(`${label} 360px (${lang}): 5xx -> '${lang === "en" ? "Not sent yet" : "尚未发送"}', no green, text kept, retry + LINE in ${lang}`, async () => {
      const { ctx, page } = await open({ api: [503], lang, width: 360 });
      try {
        await fill(page); await submit(page); await settled(page);
        assertNotSent(await failView(page), lang, "5xx " + lang);
      } finally { await ctx.close(); }
    });
  }

  // E2 — the retry button
  await check(`${label}: 500 then the retry button -> sent with a fresh token, success only after the 2xx, queue emptied`, async () => {
    const { ctx, page, st } = await open({ api: [500, 201] });
    try {
      await fill(page); await submit(page); await settled(page);
      assertNotSent(await failView(page), "th", "500");
      await page.click("#leadMsg [data-lq-retry]");
      await page.waitForFunction(() => /\bok\b/.test(document.getElementById("leadMsg").className), null, { timeout: 40000 });
      assert(st.posts.length === 2 && st.posts.every(p => p.token.length > 0), "two POSTs, each with a token: " + st.posts.length);
      assert(st.posts[0].token !== st.posts[1].token || st.posts[0].token === "XXXX.DUMMY.TOKEN.XXXX", "fresh token");
      assert(st.posts[1].body.message === MSG, "same text sent");
      await page.waitForTimeout(1500);
      assert(st.posts.length === 2, "no extra POST from the queue: " + st.posts.length);
      assert((await queue(page)).length === 0, "queue emptied after the 2xx");
      assert(NOT_SENT.th.test((await msg(page)).text) === false, "the success message does not say 'not sent'");
    } finally { await ctx.close(); }
  });

  // E3 — offline queue
  await check(`${label}: offline -> 'ยังไม่ได้ส่ง', queued, no POST; back online -> sent automatically, removed only after the 2xx`, async () => {
    const { ctx, page, st } = await open({ api: [201] });
    try {
      await fill(page);
      await ctx.setOffline(true);
      await submit(page); await settled(page);
      const v = await failView(page);
      assertNotSent(v, "th", "offline");
      assert(st.posts.length === 0, "no POST while offline");
      assert((await queue(page)).length === 1, "queued while offline");
      await ctx.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.waitForFunction(() => !localStorage.getItem("lq-leads"), null, { timeout: 45000 });
      assert(st.posts.length === 1 && st.posts[0].token.length > 0 && st.posts[0].body.message === MSG, "sent once with a token after coming back: " + st.posts.length);
      await page.waitForFunction(() => /\bok\b/.test(document.getElementById("leadMsg").className), null, { timeout: 10000 });
    } finally { await ctx.close(); }
  });

  // E4 — automatic retry of the local queue on page load
  const seed = [
    { id: "qa1", createdAt: "2026-11-14T09:00:00.000Z", name: "คิว หนึ่ง", phone: "0811111111", interest: "exam", message: "คิวแรก" },
    { id: "qb2", createdAt: "2026-11-14T09:05:00.000Z", name: "คิว สอง", phone: "0822222222", interest: "gate", message: "คิวที่สอง" }
  ];
  await check(`${label}: queued requests are retried on page load after Turnstile passes; 5xx keeps one, 2xx removes the other`, async () => {
    const { ctx, page, st } = await open({ api: [500, 201], seed });
    try {
      await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem("lq-leads") || "[]").length === 1; } catch (e) { return false; } }, null, { timeout: 60000 });
      assert(st.posts.length === 2 && st.posts.every(p => p.token.length > 0), "both tried, each with a token: " + JSON.stringify(st.posts.map(p => p.token.length)));
      assert(st.posts[0].body.message === "คิวแรก" && st.posts[1].body.message === "คิวที่สอง", "oldest first, queued text sent");
      const q = await queue(page);
      assert(q.length === 1 && q[0].id === "qa1", "the 5xx one stays, the 2xx one left: " + JSON.stringify(q));
      assert(!/\bok\b/.test((await msg(page)).className || ""), "the form shows no success");
      const v = await failView(page);
      assert(!v.greens.length, "no green: " + JSON.stringify(v.greens));
    } finally { await ctx.close(); }
  });
  await check(`${label}: Turnstile fails on page load -> queued requests are not sent and stay in the queue`, async () => {
    const { ctx, page, st } = await open({ key: KEYS.fail, api: [201], seed });
    try {
      await page.waitForTimeout(12000);
      assert(st.posts.length === 0, "no POST without a token: " + st.posts.length);
      assert((await queue(page)).length === 2, "both still queued");
    } finally { await ctx.close(); }
  });

  // E5 — success style only on a confirmed 2xx
  await check(`${label}: 2xx -> the success style, text cleared, queue empty`, async () => {
    const { ctx, page, st } = await open({ api: [201] });
    try {
      await fill(page); await submit(page);
      await page.waitForFunction(() => /\bok\b/.test(document.getElementById("leadMsg").className), null, { timeout: 40000 });
      assert(st.posts.length === 1, "one POST");
      const m = await msg(page);
      assert(!NOT_SENT.th.test(m.text) && /สมชาย/.test(m.text), "success text: " + m.text);
      assert((await page.inputValue("#lqName")) === "", "form cleared after the 2xx");
      assert((await queue(page)).length === 0, "nothing queued");
    } finally { await ctx.close(); }
  });
  await check(`${label}: form switched off -> 'ยังไม่ได้ส่ง', never the success style or a green frame, text kept`, async () => {
    const { ctx, page, st } = await open({ api: [201], formOff: true });
    try {
      await fill(page); await submit(page); await settled(page);
      const v = await failView(page);
      assert(!/\bok\b/.test(v.cls), "no success class: " + v.cls);
      assert(!v.greens.length, "no green: " + JSON.stringify(v.greens));
      assert(NOT_SENT.th.test(v.text), "says not sent: " + v.text);
      assert(v.fields.name === NAME && v.fields.msg === MSG, "text kept: " + JSON.stringify(v.fields));
      assert(st.posts.length === 0, "nothing sent while off");
    } finally { await ctx.close(); }
  });
}
