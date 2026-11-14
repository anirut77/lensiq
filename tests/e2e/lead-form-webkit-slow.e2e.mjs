// tests/e2e/lead-form-webkit-slow.e2e.mjs — quote form when a script loads slowly or not at all (independent review of
// lead-form-fix @ b62ac88, blockers B1 and B2). Same set-up as lead-form-webkit.e2e.mjs: Playwright WebKit, iPhone 13,
// the deploy's site-config + CSP transform, Cloudflare Turnstile test keys, a fake API origin, service workers blocked.
//   B1: the Turnstile script never finishes (request held open) or fails -> a clear error, the text kept, a LINE button,
//       nothing sent; after a failed load the next send loads it again and can succeed.
//   B2: lensiq-api.js never finishes or fails -> the same honest error (never the "announced before sales" path).
//   pricing.html's notify form: a server failure gets the same honest error + LINE path.
// Locked before the fix: ~/LENSIQ-field/evals/lead-form/locked.sha256 and evals-locks/lead-form.sha256.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { webkit, devices } from "playwright";
import { siteConfigJs } from "../../tools/build-site.mjs";
import { apply as applyCsp, policy as cspPolicy } from "../../tools/csp-meta.mjs";
import { assert } from "./cdp.mjs";

const API = "https://api.lqtest.invalid";
const PASS = "1x00000000000000000000AA";
const LINE = /^https:\/\/line\.me\/R\/ti\/p\/(%40|@)632yliiw$/;
const FALSE_TEXT = /ประกาศก่อนเปิดขาย|announced before sales|开售前公布|ยังไม่เปิด|not open|尚未开放/; // the form IS open: none of these may show

export default async function ({ base, repo, check }) {
  const browser = await webkit.launch();
  /** @param {{page?: string, ts?: "hold"|"abort-once"|"ok", api?: "hold"|"abort"|"ok", status?: number}} o */
  async function open(o = {}) {
    const file = o.page || "index.html";
    const ctx = await browser.newContext({ ...devices["iPhone 13"], serviceWorkers: "block" });
    const page = await ctx.newPage();
    const cfg = { apiBase: API, turnstileSiteKey: PASS, pages: [file], analytics: false, member: false, testerGate: false };
    const st = { posts: [], tsLoads: 0, errors: [], navs: 0 };
    page.on("framenavigated", f => { if (f === page.mainFrame()) st.navs++; });
    page.on("pageerror", e => st.errors.push(e.message));
    page.on("crash", () => st.errors.push("CRASH"));
    await page.route(new RegExp("/" + file.replace(".", "\\.") + "(\\?.*)?$"), async route => {
      const html = readFileSync(join(repo, file), "utf8");
      const m = /[ \t]*<script src="lensiq-config\.js(\?[^"]*)?"><\/script>/.exec(html);
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8",
        body: applyCsp(html.slice(0, m.index) + '<script src="lensiq-site-config.js?v=t"></script>\n' + html.slice(m.index), cspPolicy({ connect: [API], turnstile: true })) });
    });
    await page.route(/\/lensiq-site-config\.js/, route => route.fulfill({ status: 200, contentType: "text/javascript", body: siteConfigJs(cfg) }));
    await page.route(/\/lensiq-api\.js(\?.*)?$/, async route => {
      if (o.api === "hold") return; // never answered: the request stays open
      if (o.api === "abort") return route.abort("failed");
      return route.continue();
    });
    await page.route(/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/, async route => {
      st.tsLoads++;
      if (o.ts === "hold") return;
      if (o.ts === "abort-once" && st.tsLoads === 1) return route.abort("failed");
      return route.continue();
    });
    await page.route(API + "/**", async route => {
      const req = route.request(), cors = { "access-control-allow-origin": "*" };
      if (/\/v1\/leads$/.test(req.url()) && req.method() === "POST") {
        st.posts.push({ token: req.headers()["x-turnstile-token"] || "" });
        const s = o.status || 201;
        return route.fulfill({ status: s, headers: cors, contentType: "application/json", body: s === 201 ? '{"ok":true,"id":"t1"}' : '{"error":"x","code":"server"}' });
      }
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: "{}" });
    });
    await page.goto(base + "/" + file + (file === "index.html" ? "#contact" : ""), { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    return { ctx, page, st };
  }
  const fill = async page => {
    await page.fill("#lqName", "สมชาย ทดสอบ"); await page.fill("#lqPhone", "0812345678");
    await page.selectOption("#lqInterest", { index: 1 }); await page.fill("#lqMsg", "ต้องการใบเสนอราคา 3 สาขา"); await page.check("#lqConsent");
  };
  const state = page => page.evaluate(() => {
    const m = document.getElementById("leadMsg"), btn = document.querySelector("#leadForm button[type=submit]");
    const a = Array.from(document.querySelectorAll("#leadMsg a[href*='line.me']")).find(x => x.getBoundingClientRect().width > 0);
    return { cls: m.className, text: m.textContent || "", line: a ? a.getAttribute("href") : "", btnDisabled: !!(btn && btn.disabled),
      name: document.getElementById("lqName").value, msg: document.getElementById("lqMsg").value };
  });
  const waitErr = (page, ms) => page.waitForFunction(() => /\berr\b/.test(document.getElementById("leadMsg").className), null, { timeout: ms });
  const honestError = (s, what) => {
    assert(/\berr\b/.test(s.cls) && !FALSE_TEXT.test(s.text), what + ": honest error, not the 'announced before sales' text: " + JSON.stringify(s));
    assert(s.name === "สมชาย ทดสอบ" && s.msg === "ต้องการใบเสนอราคา 3 สาขา", what + ": text kept");
    assert(LINE.test(s.line), what + ": LINE button");
    assert(!s.btnDisabled, what + ": send button usable again");
  };

  try {
    await check("B1: Turnstile script never finishes loading -> within 40 s a clear error, text kept, LINE button, nothing sent", async () => {
      const { ctx, page, st } = await open({ ts: "hold" });
      try {
        await fill(page); await page.click("#leadForm button[type=submit]");
        await waitErr(page, 40000);
        honestError(await state(page), "Turnstile held");
        assert(st.posts.length === 0, "nothing sent: " + st.posts.length);
      } finally { await ctx.close(); }
    });

    await check("B1: Turnstile script fails once -> error; the next send loads it again and succeeds with a token", async () => {
      const { ctx, page, st } = await open({ ts: "abort-once" });
      try {
        await fill(page); await page.click("#leadForm button[type=submit]");
        await waitErr(page, 40000);
        honestError(await state(page), "Turnstile failed");
        assert(st.posts.length === 0, "nothing sent on the failed load");
        await page.click("#leadForm button[type=submit]");
        await page.waitForFunction(() => /\bok\b/.test(document.getElementById("leadMsg").className), null, { timeout: 40000 });
        assert(st.tsLoads >= 2, "the script was loaded again: " + st.tsLoads);
        assert(st.posts.length === 1 && st.posts[0].token.length > 0, "sent once with a token: " + JSON.stringify(st.posts));
      } finally { await ctx.close(); }
    });

    for (const api of ["hold", "abort"]) {
      await check(`B2: lensiq-api.js ${api === "hold" ? "never finishes loading" : "fails to load"} -> honest error with LINE, text kept, nothing sent`, async () => {
        const { ctx, page, st } = await open({ api });
        try {
          await fill(page); await page.click("#leadForm button[type=submit]");
          await waitErr(page, 30000);
          honestError(await state(page), "api " + api);
          assert(st.posts.length === 0, "nothing sent");
          assert(st.navs === 1 && !st.errors.length, "no reload / page errors: " + JSON.stringify(st.errors));
        } finally { await ctx.close(); }
      });
    }

    await check("pricing.html notify form: server failure -> honest error with LINE (never 'announced before sales')", async () => {
      const { ctx, page, st } = await open({ page: "pricing.html", status: 500 });
      try {
        const f = await page.evaluate(() => {
          const out = Array.from(document.querySelectorAll("form")).find(x => x.querySelector("input[type=email]") && x.querySelector("[name=interest]"));
          if (!out) return null;
          out.scrollIntoView(); return true;
        });
        assert(f, "pricing notify form present");
        await page.evaluate(() => {
          const out = Array.from(document.querySelectorAll("form")).find(x => x.querySelector("input[type=email]") && x.querySelector("[name=interest]"));
          out.querySelector("input[type=email]").value = "test@example.com";
          const c = out.querySelector("input[type=checkbox]"); if (c) c.checked = true;
          out.requestSubmit();
        });
        await page.waitForFunction(() => {
          const out = Array.from(document.querySelectorAll("form")).find(x => x.querySelector("input[type=email]") && x.querySelector("[name=interest]"));
          const t = (out.parentElement || out).textContent || "";
          return /ไม่สำเร็จ|ยังไม่ได้ส่ง/.test(t) && !/กำลังส่ง/.test(t);
        }, null, { timeout: 40000 });
        const r = await page.evaluate(() => {
          const out = Array.from(document.querySelectorAll("form")).find(x => x.querySelector("input[type=email]") && x.querySelector("[name=interest]"));
          const box = out.parentElement || out, a = box.querySelector("a[href*='line.me']");
          return { text: box.textContent || "", line: a ? a.getAttribute("href") : "", email: out.querySelector("input[type=email]").value };
        });
        assert(st.posts.length === 1, "one POST: " + st.posts.length);
        assert(!FALSE_TEXT.test(r.text), "no 'announced before sales' text: " + r.text.slice(0, 300));
        assert(LINE.test(r.line), "LINE button: " + r.line);
        assert(r.email === "test@example.com", "e-mail kept");
      } finally { await ctx.close(); }
    });
  } finally { await browser.close(); }
}
