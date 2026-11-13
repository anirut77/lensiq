// tests/e2e/lead-form-webkit.e2e.mjs — quote-request form on WebKit at iPhone width (owner bug report 2026-11-13: on an
// iPhone the tab reloaded after "send"; earlier tries failed at "verify you are human").
// Real WebKit (Playwright, iPhone 13 profile), the home page served from this checkout with the SAME site-config transform
// the deploy uses (tools/build-site.mjs siteConfigJs + csp-meta policy), Cloudflare Turnstile TEST site keys
// (1x… always passes, 2x… always fails, 3x… forces the interactive check) and a fake API origin answered by the test
// (nothing reaches the real Worker, nothing is stored). Locked before the fix: ~/LENSIQ-field/evals/lead-form/locked.sha256.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { webkit, devices } from "playwright";
import { siteConfigJs } from "../../tools/build-site.mjs";
import { apply as applyCsp, policy as cspPolicy } from "../../tools/csp-meta.mjs";
import { assert } from "./cdp.mjs";

const API = "https://api.lqtest.invalid";
const KEYS = { pass: "1x00000000000000000000AA", fail: "2x00000000000000000000AB", interactive: "3x00000000000000000000FF" };
const LINE = /^https:\/\/line\.me\/R\/ti\/p\/(%40|@)632yliiw$/;

export default async function ({ base, repo, check }) {
  const browser = await webkit.launch();
  /** a fresh iPhone tab on index.html#contact with the given Turnstile key and API behaviour */
  async function open({ key = KEYS.pass, api = [201], lang = "th" } = {}) {
    const ctx = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await ctx.newPage();
    const cfg = { apiBase: API, turnstileSiteKey: key, pages: ["index.html"], analytics: false, member: false, testerGate: false };
    const st = { posts: [], navs: 0, errors: [], apiQueue: api.slice() };
    page.on("framenavigated", f => { if (f === page.mainFrame()) st.navs++; });
    page.on("pageerror", e => st.errors.push(e.message));
    page.on("crash", () => st.errors.push("CRASH"));
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
          body: next === 201 ? '{"ok":true,"id":"t1"}' : '{"error":"x","code":"' + (next === 403 ? "turnstile_failed" : "server") + '"}' });
      }
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: "{}" });
    });
    await page.goto(base + "/index.html#contact", { waitUntil: "load" });
    if (lang !== "th") await page.evaluate(l => window.LQI18N && window.LQI18N.setLang(l), lang);
    await page.waitForTimeout(300);
    return { ctx, page, st };
  }
  const fill = async page => {
    await page.fill("#lqName", "สมชาย ทดสอบ"); await page.fill("#lqPhone", "0812345678");
    await page.selectOption("#lqInterest", { index: 1 }); await page.fill("#lqMsg", "ต้องการใบเสนอราคา 3 สาขา"); await page.check("#lqConsent");
  };
  const submit = page => page.click("#leadForm button[type=submit]");
  const msg = page => page.evaluate(() => { const m = document.querySelector("#leadForm .form-msg") || document.querySelector(".form-msg"); return m ? { cls: m.className, text: m.textContent || "" } : null; });
  const kept = page => page.evaluate(() => ({ name: document.getElementById("lqName").value, msg: document.getElementById("lqMsg").value, phone: document.getElementById("lqPhone").value }));
  const lineBtn = page => page.evaluate(() => {
    const a = Array.from(document.querySelectorAll("#contact a[href*='line.me']")).find(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    return a ? a.getAttribute("href") : null;
  });
  const waitMsg = (page, re, ms = 30000) => page.waitForFunction(r => { const m = document.querySelector("#leadForm .form-msg") || document.querySelector(".form-msg"); return !!m && new RegExp(r).test(m.className); }, re, { timeout: ms });

  try {
    await check("WebKit iPhone: Turnstile passes, POST carries the token, success message with LINE, form cleared, no reload", async () => {
      const { ctx, page, st } = await open({ key: KEYS.pass, api: [201] });
      try {
        await fill(page); await submit(page);
        await waitMsg(page, "\\bok\\b");
        assert(st.posts.length === 1 && st.posts[0].token.length > 0, "one POST with a Turnstile token: " + JSON.stringify(st.posts.map(p => p.token.length)));
        assert(st.posts[0].body && st.posts[0].body.message === "ต้องการใบเสนอราคา 3 สาขา", "message sent");
        const m = await msg(page);
        assert(/สมชาย/.test(m.text) && /632yliiw/.test(m.text), "success names the customer and the LINE ID: " + m.text);
        assert((await kept(page)).name === "", "form cleared after success");
        assert(st.navs === 1 && !st.errors.length, "no reload / page errors: " + st.navs + " " + JSON.stringify(st.errors));
      } finally { await ctx.close(); }
    });

    await check("WebKit iPhone: an interactive Turnstile check shows inside the form (not a corner overlay) and the send waits for it", async () => {
      const { ctx, page, st } = await open({ key: KEYS.interactive, api: [201] });
      try {
        await fill(page); await submit(page);
        // the widget appears in the form area, visible in the viewport, with a prompt near it
        await page.waitForFunction(() => { const b = document.querySelector("#leadForm #lqTurnstile"); if (!b) return false; const r = b.getBoundingClientRect(); return r.height > 40; }, null, { timeout: 20000 });
        const pos = await page.evaluate(() => {
          const b = document.getElementById("lqTurnstile"), r = b.getBoundingClientRect(), cs = getComputedStyle(b);
          return { fixed: cs.position === "fixed", inForm: !!b.closest("#leadForm"), prompt: (document.getElementById("lqTurnstileHint") || {}).textContent || "" };
        });
        assert(pos.inForm && !pos.fixed && pos.prompt.trim().length > 5, "widget inside the form with a prompt: " + JSON.stringify(pos));
        await page.locator("#lqTurnstile").scrollIntoViewIfNeeded();
        await page.waitForTimeout(16000); // longer than the old 15 s give-up: nothing may be sent without a token meanwhile
        assert(st.posts.every(p => p.token.length > 0), "never a POST without a token");
        const bb = await page.locator("#lqTurnstile").boundingBox();
        await page.mouse.click(bb.x + 30, bb.y + bb.height / 2);
        await waitMsg(page, "\\bok\\b", 30000);
        assert(st.posts.length === 1 && st.posts[0].token.length > 0, "sent once, with the token");
        assert(st.navs === 1 && !st.errors.length, "no reload: " + JSON.stringify(st.errors));
      } finally { await ctx.close(); }
    });

    await check("WebKit iPhone: Turnstile fails -> nothing sent, clear error, text kept, LINE @632yliiw button (TH)", async () => {
      const { ctx, page, st } = await open({ key: KEYS.fail, api: [201] });
      try {
        await fill(page); await submit(page);
        await waitMsg(page, "\\berr\\b", 40000);
        assert(st.posts.every(p => p.token.length > 0), "no POST without a token: " + JSON.stringify(st.posts.map(p => p.token.length)));
        const m = await msg(page), k = await kept(page);
        assert(k.name === "สมชาย ทดสอบ" && k.msg === "ต้องการใบเสนอราคา 3 สาขา" && k.phone === "0812345678", "fields kept: " + JSON.stringify(k));
        assert(!/ประกาศก่อนเปิดขาย/.test(m.text) && /ไม่สำเร็จ|ยังไม่ได้ส่ง/.test(m.text), "honest error: " + m.text);
        assert(LINE.test(await lineBtn(page) || ""), "LINE button visible");
        assert(st.navs === 1 && !st.errors.length, "no reload");
      } finally { await ctx.close(); }
    });

    for (const [name, api] of [["403", [403, 201]], ["500", [500, 201]], ["network", ["abort", 201]]]) {
      await check(`WebKit iPhone: server ${name} -> error, text kept, LINE button; sending again works`, async () => {
        const { ctx, page, st } = await open({ key: KEYS.pass, api });
        try {
          await fill(page); await submit(page);
          await waitMsg(page, "\\berr\\b");
          const k = await kept(page);
          assert(k.name === "สมชาย ทดสอบ" && k.msg === "ต้องการใบเสนอราคา 3 สาขา", "fields kept: " + JSON.stringify(k));
          assert(LINE.test(await lineBtn(page) || ""), "LINE button visible");
          assert(!/ประกาศก่อนเปิดขาย/.test((await msg(page)).text), "no 'announced before sales' text");
          await submit(page);
          await waitMsg(page, "\\bok\\b");
          assert(st.posts.length === 2 && st.posts.every(p => p.token.length > 0), "second try sent with a fresh token: " + st.posts.length);
          assert(st.navs === 1 && !st.errors.length, "no reload");
        } finally { await ctx.close(); }
      });
    }

    for (const lang of ["en", "zh"]) {
      await check(`WebKit iPhone (${lang}): failure message and LINE button in the page language`, async () => {
        const { ctx, page } = await open({ key: KEYS.pass, api: [500], lang });
        try {
          await fill(page); await submit(page);
          await waitMsg(page, "\\berr\\b");
          const t = (await msg(page)).text;
          assert(!/[฀-๿]/.test(t.replace(/สมชาย ทดสอบ/g, "")), "no Thai in the " + lang + " message: " + t);
          assert(lang === "zh" ? /[一-鿿]/.test(t) : /[A-Za-z]{4}/.test(t), "message in " + lang + ": " + t);
          assert(LINE.test(await lineBtn(page) || ""), "LINE button visible");
        } finally { await ctx.close(); }
      });
    }

    await check("WebKit iPhone: a quick double tap sends at most one request", async () => {
      const { ctx, page, st } = await open({ key: KEYS.pass, api: [201] });
      try {
        await fill(page);
        await page.evaluate(() => { const b = document.querySelector("#leadForm button[type=submit]"); b.click(); b.click(); });
        await waitMsg(page, "\\bok\\b");
        await page.waitForTimeout(1500);
        assert(st.posts.length === 1, "one POST: " + st.posts.length);
      } finally { await ctx.close(); }
    });

    for (const lang of ["th", "en", "zh"]) {
      await check(`notice next to the form with the LINE contact as the alternative (${lang})`, async () => {
        const { ctx, page } = await open({ key: KEYS.pass, lang });
        try {
          const n = await page.evaluate(() => {
            const e = document.getElementById("leadNotice"); if (!e) return null;
            const r = e.getBoundingClientRect(), a = e.querySelector("a[href*='line.me']");
            return { vis: r.width > 0 && r.height > 0 && !e.closest("[hidden]"), near: !!e.closest("#contact"), text: e.textContent || "", href: a ? a.getAttribute("href") : "" };
          });
          assert(n && n.vis && n.near && LINE.test(n.href) && /632yliiw/.test(n.text), "notice: " + JSON.stringify(n));
          if (lang === "en") assert(!/[฀-๿]/.test(n.text), "English notice");
          if (lang === "zh") assert(/[一-鿿]/.test(n.text) && !/[฀-๿]/.test(n.text), "Chinese notice");
        } finally { await ctx.close(); }
      });
    }
  } finally { await browser.close(); }
}
