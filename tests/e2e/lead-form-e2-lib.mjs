// tests/e2e/lead-form-e2-lib.mjs — shared body of lead-form-e2-chrome.e2e.mjs and lead-form-e2-webkit.e2e.mjs: Part E
// round 2 (independent review of form-e @ ba9634c, 2026-11-15). FIXED TEST SET, locked BEFORE the fix in
// ~/LENSIQ-field/evals/lead-form-e2/ and evals-locks/lead-form-e2.sha256. Same set-up as lead-form-e-lib.mjs (deploy
// site-config + CSP, Cloudflare Turnstile TEST keys, fake API origin, service workers blocked).
//   D1 offline submit -> back online -> the automatic retry's POST is held ~4 s -> "ส่งอีกครั้ง" pressed 0.5 s into it ->
//      exactly ONE POST for that request; success shown only after the 2xx; queue empty
//   D2 the same with the queue box's "ส่งตอนนี้" button
//   D3 the queued request keeps source "index" and the page language; the automatic retry sends them
//   D4 a page-load retry that needs the interactive Turnstile check shows the "tap the box" hint
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { siteConfigJs } from "../../tools/build-site.mjs";
import { apply as applyCsp, policy as cspPolicy } from "../../tools/csp-meta.mjs";
import { assert } from "./cdp.mjs";

const API = "https://api.lqtest.invalid";
const KEYS = { pass: "1x00000000000000000000AA", interactive: "3x00000000000000000000FF" };
const NAME = "สมชาย ทดสอบ", PHONE = "0812345678", MSG = "ต้องการใบเสนอราคา 3 สาขา";

/** @param {{browser: any, ctxOpts: () => any, label: string, base: string, repo: string, check: Function}} o */
export async function runFormE2({ browser, ctxOpts, label, base, repo, check }) {
  async function open({ key = KEYS.pass, holdMs = 0, lang = "th", seed = null } = {}) {
    const ctx = await browser.newContext({ ...ctxOpts(), serviceWorkers: "block" });
    const page = await ctx.newPage();
    const cfg = { apiBase: API, turnstileSiteKey: key, pages: ["index.html"], analytics: false, member: false, testerGate: false };
    const st = { posts: [], errors: [] };
    page.on("pageerror", e => st.errors.push(e.message));
    if (seed) await page.addInitScript(s => { try { if (!sessionStorage.getItem("lq-e2-seeded")) { localStorage.setItem("lq-leads", JSON.stringify(s)); sessionStorage.setItem("lq-e2-seeded", "1"); } } catch (e) { /* blocked */ } }, seed);
    await page.route(/\/index\.html(\?.*)?$/, async route => {
      const html = readFileSync(join(repo, "index.html"), "utf8");
      const m = /[ \t]*<script src="lensiq-config\.js(\?[^"]*)?"><\/script>/.exec(html);
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8",
        body: applyCsp(html.slice(0, m.index) + '<script src="lensiq-site-config.js?v=t"></script>\n' + html.slice(m.index), cspPolicy({ connect: [API], turnstile: true })) });
    });
    await page.route(/\/lensiq-site-config\.js/, route => route.fulfill({ status: 200, contentType: "text/javascript", body: siteConfigJs(cfg) }));
    await page.route(API + "/**", async route => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST" } });
      const cors = { "access-control-allow-origin": "*" };
      if (/\/v1\/leads$/.test(req.url()) && req.method() === "POST") {
        st.posts.push({ token: req.headers()["x-turnstile-token"] || "", body: req.postDataJSON() });
        if (holdMs) await new Promise(r => setTimeout(r, holdMs));
        return route.fulfill({ status: 201, headers: cors, contentType: "application/json", body: '{"ok":true,"id":"t1"}' });
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
  const queue = page => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("lq-leads") || "[]"); } catch (e) { return null; } });
  /** offline submit, then back online with the automatic retry's POST held 4 s; returns once that POST has arrived */
  async function offlineThenFlushing(lang = "th") {
    const o = await open({ holdMs: 4000, lang });
    await fill(o.page);
    await o.ctx.setOffline(true);
    await o.page.click("#leadForm button[type=submit]");
    await o.page.waitForSelector("#leadMsg [data-lq-retry]", { timeout: 30000 });
    assert(o.st.posts.length === 0, "no POST while offline");
    const q = await queue(o.page);
    assert(q.length === 1, "queued: " + JSON.stringify(q));
    await o.ctx.setOffline(false);
    await o.page.evaluate(() => window.dispatchEvent(new Event("online")));
    const t0 = Date.now();
    while (o.st.posts.length < 1 && Date.now() - t0 < 45000) await o.page.waitForTimeout(100);
    assert(o.st.posts.length === 1, "the automatic retry is posting");
    await o.page.waitForTimeout(500);
    return { ...o, id: q[0].id, queued: q[0] };
  }
  const perId = st => st.posts.reduce((m, p) => { const k = JSON.stringify([p.body.name, p.body.message]); m[k] = (m[k] || 0) + 1; return m; }, {});

  await check(`${label}: retry pressed while the automatic retry is posting the same request -> exactly one POST`, async () => {
    const { ctx, page, st } = await offlineThenFlushing();
    try {
      await page.click("#leadMsg [data-lq-retry]");
      await page.waitForFunction(() => /\bok\b/.test(document.getElementById("leadMsg").className), null, { timeout: 40000 });
      await page.waitForTimeout(6000);
      const n = perId(st);
      assert(st.posts.length === 1 && Object.values(n).every(c => c === 1), "one POST per request: " + JSON.stringify(n));
      assert((await queue(page)).length === 0, "queue empty");
      assert(!st.errors.length, "page errors: " + JSON.stringify(st.errors));
    } finally { await ctx.close(); }
  });

  await check(`${label}: the queue box's 'ส่งตอนนี้' pressed during the automatic retry -> exactly one POST`, async () => {
    const { ctx, page, st } = await offlineThenFlushing();
    try {
      const clicked = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll("[data-lq-pending] button")).find(x => /ส่งตอนนี้/.test(x.textContent || ""));
        if (b) b.click(); return !!b;
      });
      await page.waitForFunction(() => !localStorage.getItem("lq-leads"), null, { timeout: 40000 });
      await page.waitForTimeout(6000);
      const n = perId(st);
      assert(st.posts.length === 1 && Object.values(n).every(c => c === 1), "one POST per request (box button " + (clicked ? "pressed" : "not shown") + "): " + JSON.stringify(n));
    } finally { await ctx.close(); }
  });

  await check(`${label} (en): the queued request keeps source 'index' and lang 'en'; the automatic retry sends them`, async () => {
    const { ctx, page, st, queued } = await offlineThenFlushing("en");
    try {
      assert(queued.source === "index" && queued.lang === "en", "queued item: " + JSON.stringify(queued));
      assert(st.posts[0].body.source === "index" && st.posts[0].body.lang === "en", "POST body: " + JSON.stringify(st.posts[0].body));
      await page.waitForFunction(() => !localStorage.getItem("lq-leads"), null, { timeout: 40000 });
    } finally { await ctx.close(); }
  });

  await check(`${label}: a page-load retry that needs the interactive check shows the 'tap the box' hint`, async () => {
    const seed = [{ id: "qi1", createdAt: "2026-11-15T09:00:00.000Z", name: "คิว หนึ่ง", phone: "0811111111", interest: "exam", message: "คิวแรก", source: "index", lang: "th" }];
    const { ctx, page, st } = await open({ key: KEYS.interactive, seed });
    try {
      await page.waitForFunction(() => { const h = document.getElementById("lqTurnstileHint"); return !!h && !h.hidden && h.getBoundingClientRect().height > 0; }, null, { timeout: 30000 });
      assert(st.posts.length === 0, "nothing sent before the check");
    } finally { await ctx.close(); }
  });
}
