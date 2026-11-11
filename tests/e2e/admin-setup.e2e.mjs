// tests/e2e/admin-setup.e2e.mjs — the owner's first run and sign-in on the admin page, in a real browser against the
// REAL Worker code (backend/src/index.js handle()) on an in-memory database, served from one local origin exactly as the
// deployed Worker serves it (admin shell built by backend/scripts/build-admin.mjs, same-origin API, cookie session).
//   1. no owner yet: /admin shows the first-run screen (not the sign-in form); nothing technical on screen (no session
//      mode choice, no developer words); a wrong setup code and mismatched passwords give a plain Thai message and
//      create nothing; the right code creates the account and goes on to 2-step verification with a QR code drawn on
//      the device; a wrong 6-digit code is refused; the right one shows ten recovery codes once; "Finish" stays disabled
//      until the owner ticks "saved"; then the back office opens. The session cookie mode was chosen automatically.
//   2. once an owner exists the first-run screen is never shown again; sign-in errors are plain; a recovery code signs
//      in once and the page says how many are left.
//   3. an owner who has not turned 2-step verification on is taken to it after sign-in and may postpone it.
//   4. phone widths 320 / 360 / 390 and English / 中文 on every screen of the flow.
//   5. the developer override (?session=) is ignored without the developer flag.
// No secrets: the setup code, password and authenticator secret are generated for this run only.
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assert } from "./cdp.mjs";
import { mobileCheck, sleep } from "./zones-lib.mjs";

const require = createRequire(import.meta.url);
export const TOKEN = "e2e-setup-code-" + "k".repeat(30);
export const PW = "a long test passphrase 2026";
const THAI = /[ก-ฺเ-๛]/;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

/** The Worker on http://127.0.0.1:<port>: static admin shell through the ASSETS binding, everything else handle(). */
export async function startWorker(repo, { vars = {}, deps = {} } = {}) {
  execFileSync(process.execPath, [join(repo, "backend", "scripts", "build-admin.mjs")], { stdio: "ignore" });
  const dist = join(repo, "backend", "admin-dist");
  const { createEnv } = require(join(repo, "tests", "unit", "backend-d1-shim.js"));
  const index = await import(pathToFileURL(join(repo, "backend", "src", "index.js")).href);
  const crypto = await import(pathToFileURL(join(repo, "backend", "src", "crypto.js")).href);
  const env = createEnv({
    ADMIN_BOOTSTRAP_TOKEN: TOKEN, SECRETS_KEK: Buffer.alloc(32, 5).toString("base64"), ADMIN_ORIGINS: "", ALLOWED_ORIGINS: "", ...vars,
    ASSETS: { fetch: async r => {
      const p = new URL(r.url).pathname, f = join(dist, p);
      if (p.includes("..") || !existsSync(f)) return new Response("not found", { status: 404 });
      return new Response(readFileSync(f), { status: 200, headers: { "Content-Type": TYPES[p.slice(p.lastIndexOf("."))] || "application/octet-stream" } });
    } }
  });
  const server = createServer(async (q, res) => {
    const chunks = []; for await (const c of q) chunks.push(c);
    const origin = "http://" + q.headers.host, headers = new Headers();
    for (const [k, v] of Object.entries(q.headers)) if (typeof v === "string") headers.set(k, v);
    const init = { method: q.method, headers };
    if (!["GET", "HEAD"].includes(q.method)) init.body = Buffer.concat(chunks);
    const r = await index.handle(new Request(origin + q.url, init), env, deps);
    const out = {}; r.headers.forEach((v, k) => { if (k !== "set-cookie") out[k] = v; });
    const cookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    if (cookies.length) out["set-cookie"] = cookies;
    res.writeHead(r.status, out); res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  const totp = async secretB32 => crypto.totpAt(crypto.base32Decode(secretB32), Math.floor(Date.now() / 1000 / 30));
  const api = (path, o = {}) => index.handle(new Request(origin + "/admin/api" + path, { method: o.method || "GET",
    headers: { Origin: origin, "Content-Type": "application/json", ...(o.headers || {}) },
    body: o.body ? JSON.stringify(o.body) : undefined }), env);
  return { origin, env, totp, api, close: () => new Promise(r => server.close(r)) };
}

/** No script error, CSP violation or failed asset. The refusals this test provokes on purpose (wrong code, wrong password,
 *  "not signed in" probe) are logged by Chrome as failed /admin/api/ requests with a 4xx status: only those are expected. */
function noErrors(page) {
  const errs = page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && /\/admin\/api\//.test(e.url || "") && /status of 4(00|01|03)\b/.test(e.text || "")));
  assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
}
const visible = page => page.evaluate(() => ["adOffline", "adBoot", "adLogin", "adTwo", "adCodes", "adApp"].filter(id => !document.getElementById(id).hidden).join(","));
const alertOf = page => page.evaluate(() => {
  const m = [...document.querySelectorAll("[data-auth-msg]")].find(x => !x.hidden);
  return m ? { text: m.textContent, bad: m.classList.contains("ad-bad") } : null;
});
const fill = (page, form, values, submit = true) => page.evaluate((form, values, submit) => {
  const f = document.getElementById(form);
  for (const k in values) f.elements[k].value = values[k];
  if (submit) f.requestSubmit();
}, form, values, submit);
const screenText = page => page.evaluate(() => [...document.querySelectorAll("header, main > section:not([hidden]), #adMsg")].map(e => e.innerText).join("\n"));
const waitScreen = (page, id, ms = 8000) => page.waitFor(`!document.getElementById(${JSON.stringify(id)}).hidden`, ms);
const TECH = /session mode|โหมดเซสชัน|bearer|cookie|คุกกี้|TOTP|wrangler|secret|token|origin|CSP|bootstrap|HTTP \d|API/i;

export default async function ({ launch, check, repo }) {
  const browser = await launch();
  const W = await startWorker(repo);
  try {
    let codes = [];
    const page = await browser.newPage(null, { isolated: true });
    await check("first run: /admin shows the setup screen while no owner exists; no technical options or developer words on screen", async () => {
      await page.goto(W.origin + "/admin");
      await waitScreen(page, "adBoot");
      assert((await visible(page)) === "adBoot", "screens: " + (await visible(page)));
      const r = await page.evaluate(() => ({
        selects: [...document.querySelectorAll("main select")].filter(s => !s.closest("[hidden]")).length,
        mode: !!document.querySelector("[name=mode]"), conn: document.getElementById("adConn").hidden,
        steps: [...document.querySelectorAll("#adBoot .ad-steps li")].length, brand: document.querySelector(".ad-brand").innerText,
        tokenType: document.getElementById("adBootToken").type, lang: document.getElementById("adLang").value, title: document.title
      }));
      assert(r.selects === 0 && !r.mode && r.conn, "no session-mode choice, no API host pill: " + JSON.stringify(r));
      assert(r.steps === 3 && /LENSIQ/.test(r.brand.replace(/\s/g, "")) && r.tokenType === "password" && r.lang === "th", JSON.stringify(r));
      const text = await screenText(page);
      assert(!TECH.test(text), "technical wording on the first-run screen: " + (text.match(TECH) || [])[0]);
      noErrors(page);
    });

    await check("first run: plain messages for a short code, mismatched passwords and a wrong code; nothing is created", async () => {
      await fill(page, "adBootForm", { token: "short", username: "owner", password: PW, password2: PW });
      let a = await alertOf(page);
      assert(a && a.bad && /32/.test(a.text) && THAI.test(a.text), JSON.stringify(a));
      await fill(page, "adBootForm", { token: TOKEN, username: "owner", password: PW, password2: PW + "x" });
      a = await alertOf(page);
      assert(a && a.bad && /ไม่ตรงกัน/.test(a.text), JSON.stringify(a));
      await fill(page, "adBootForm", { token: "w".repeat(40), username: "owner", password: PW, password2: PW });
      await page.waitFor(() => { const m = document.querySelector("#adBoot [data-auth-msg]"); return !m.hidden && /ไม่ถูกต้อง/.test(m.textContent); }, 8000);
      a = await alertOf(page);
      assert(a.bad && !TECH.test(a.text) && !/invalid/i.test(a.text), "plain Thai reason: " + a.text);
      assert((await visible(page)) === "adBoot");
      assert((await (await W.api("/state")).json()).bootstrapped === false, "no account after refused attempts");
    });

    await check("first run: the right code creates the owner and continues to 2-step verification with a QR code and a typed key", async () => {
      await fill(page, "adBootForm", { token: TOKEN, username: "owner", password: PW, password2: PW });
      await waitScreen(page, "adTwo", 15000);
      await page.waitFor(() => {
        const i = document.querySelector("#adTwoQr img");
        return !!i && i.complete && i.naturalWidth > 0 && !!document.getElementById("adTwoKey").getAttribute("data-raw");
      }, 8000);
      const r = await page.evaluate(() => ({
        src: document.querySelector("#adTwoQr img").src.slice(0, 26), key: document.getElementById("adTwoKey").getAttribute("data-raw"),
        skip: document.getElementById("adTwoSkip").hidden, steps: document.querySelector("#adTwo .ad-steps").hidden,
        typed: [...document.querySelectorAll("#adBootForm input")].map(i => i.value).join("")
      }));
      assert(r.src.startsWith("data:image/svg+xml") && /^[A-Z2-7]{32}$/.test(r.key), JSON.stringify(r));
      assert(r.skip && !r.steps, "first run: no 'later', the 3 steps are shown");
      assert(r.typed === "", "the setup form was cleared");
      assert(!page.requests.some(q => /otpauth|secret=/.test(q.url)), "the authenticator secret is in no request URL");
      const o = await W.env.DB.prepare("SELECT username, totp_enabled FROM admin_users").first();
      assert(o.username === "owner" && o.totp_enabled === 0, JSON.stringify(o));
      const audit = (await W.env.DB.prepare("SELECT action, detail FROM audit_log").all()).results;
      assert(audit.some(a => a.action === "login.ok" && /"mode":"cookie"/.test(a.detail)), "session mode chosen automatically (same origin: cookie)");
      const text = await screenText(page);
      assert(!TECH.test(text), "technical wording on the 2-step screen: " + (text.match(TECH) || [])[0]);
    });

    await check("first run: a wrong 6-digit code is refused; the right one shows ten recovery codes once; Finish needs the 'saved' tick", async () => {
      await fill(page, "adTwoForm", { code: "12" });
      assert(/6/.test((await alertOf(page)).text));
      const key = await page.evaluate(() => document.getElementById("adTwoKey").getAttribute("data-raw"));
      const good = await W.totp(key);
      await fill(page, "adTwoForm", { code: good === "000000" ? "000001" : "000000" });
      await page.waitFor(() => { const m = document.querySelector("#adTwo [data-auth-msg]"); return !m.hidden && m.classList.contains("ad-bad") && /หมดอายุ|ไม่ถูกต้อง/.test(m.textContent); }, 8000);
      await page.waitFor(() => !document.querySelector("#adTwoForm button[type=submit]").disabled, 4000);
      await fill(page, "adTwoForm", { code: await W.totp(key) });
      await waitScreen(page, "adCodes", 10000);
      const r = await page.evaluate(() => ({ codes: [...document.querySelectorAll("#adCodesList li")].map(l => l.textContent), done: document.getElementById("adCodesDone").disabled,
        qr: document.getElementById("adTwoQr").childElementCount, key: document.getElementById("adTwoKey").textContent }));
      codes = r.codes;
      assert(r.codes.length === 10 && r.codes.every(c => /^[A-Z2-7]{5}-[A-Z2-7]{5}$/.test(c)) && new Set(r.codes).size === 10, JSON.stringify(r.codes));
      assert(r.done && r.qr === 0 && r.key === "", "Finish disabled; QR and key removed from the page");
      await page.evaluate(() => document.getElementById("adCodesOk").click());
      assert(!(await page.evaluate(() => document.getElementById("adCodesDone").disabled)));
      await page.evaluate(() => document.getElementById("adCodesDone").click());
      await waitScreen(page, "adApp", 8000);
      assert((await page.evaluate(() => document.getElementById("adCodesList").childElementCount)) === 0, "codes removed from the page");
      const o = await W.env.DB.prepare("SELECT totp_enabled FROM admin_users").first();
      assert(o.totp_enabled === 1);
      await page.reload();
      await waitScreen(page, "adApp", 8000);
      noErrors(page);
    });

    await check("after setup: the first-run screen is gone for good; sign-in errors are plain; a recovery code signs in once", async () => {
      await page.evaluate(() => document.getElementById("adLogout").click());
      await waitScreen(page, "adLogin");
      const fresh = await browser.newPage(null, { isolated: true });
      await fresh.goto(W.origin + "/admin");
      await waitScreen(fresh, "adLogin");
      assert((await visible(fresh)) === "adLogin", "a new visitor sees sign-in only: " + (await visible(fresh)));
      const again = await W.api("/bootstrap", { method: "POST", body: { token: TOKEN, username: "second", password: PW } });
      assert(again.status === 409, "the setup code cannot create a second account: " + again.status);
      const text = await screenText(fresh);
      assert(!TECH.test(text), "technical wording on the sign-in screen: " + (text.match(TECH) || [])[0]);
      await fill(fresh, "adLoginForm", { username: "owner", password: "not the password 1" });
      await fresh.waitFor(() => { const m = document.querySelector("#adLogin [data-auth-msg]"); return !m.hidden && /ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง/.test(m.textContent); }, 8000);
      await fresh.waitFor(() => !document.querySelector("#adLoginForm button[type=submit]").disabled, 4000);
      await fill(fresh, "adLoginForm", { username: "owner", password: PW });
      await fresh.waitFor(() => { const m = document.querySelector("#adLogin [data-auth-msg]"); return !m.hidden && /6 หลัก/.test(m.textContent); }, 8000);
      await fresh.waitFor(() => !document.querySelector("#adLoginForm button[type=submit]").disabled, 4000);
      await fresh.evaluate(() => document.getElementById("adLoginSwap").click());
      assert(await fresh.evaluate(() => document.getElementById("adLoginCodeL").hidden && !document.getElementById("adLoginRecL").hidden));
      await fill(fresh, "adLoginForm", { username: "owner", password: PW, recovery: codes[0].toLowerCase() });
      await waitScreen(fresh, "adApp", 10000);
      const msg = await fresh.evaluate(() => document.getElementById("adMsg").textContent);
      assert(/9/.test(msg), "says how many recovery codes are left: " + msg);
      noErrors(fresh);
      await fresh.close();
    });

    await check("phones 320 / 360 / 390 px and English / 中文: setup, sign-in, 2-step and recovery-code screens fit and carry no Thai", async () => {
      // a second Worker without an owner, so every screen of the flow can be visited again
      const W2 = await startWorker(repo);
      const p = await browser.newPage(null, { isolated: true });
      try {
        await p.goto(W2.origin + "/admin");
        await waitScreen(p, "adBoot");
        const langs = async name => {
          for (const l of ["en", "zh"]) {
            await p.evaluate(l => { const s = document.getElementById("adLang"); s.value = l; s.dispatchEvent(new Event("change")); }, l);
            await p.waitFor(`window.LQI18N.lang === ${JSON.stringify(l)}`, 8000);
            await sleep(150);
            const t = await screenText(p);
            assert(!THAI.test(t.replace(/ไทย/g, "")), `${name} ${l}: Thai left: ` + (t.replace(/ไทย/g, "").match(/[^\n]*[ก-ฺเ-๛][^\n]*/) || [])[0]);
            assert(!TECH.test(t.replace(/Microsoft Authenticator|Google Authenticator/g, "")), `${name} ${l}: technical wording: ` + (t.match(TECH) || [])[0]);
          }
          assert((await p.evaluate(() => document.documentElement.lang)) === "zh-Hans");
          await p.evaluate(() => { const s = document.getElementById("adLang"); s.value = "th"; s.dispatchEvent(new Event("change")); });
          await p.waitFor("window.LQI18N.lang === 'th'", 8000);
        };
        await mobileCheck(p); await langs("setup");
        // a refusal in English
        await p.evaluate(() => { const s = document.getElementById("adLang"); s.value = "en"; s.dispatchEvent(new Event("change")); });
        await p.waitFor("window.LQI18N.lang === 'en'", 8000);
        await fill(p, "adBootForm", { token: "w".repeat(40), username: "owner", password: PW, password2: PW });
        await p.waitFor(() => { const m = document.querySelector("#adBoot [data-auth-msg]"); return !m.hidden && /setup code is not correct/.test(m.textContent); }, 8000);
        await p.waitFor(() => !document.querySelector("#adBootForm button[type=submit]").disabled, 4000);
        await fill(p, "adBootForm", { token: TOKEN, username: "owner", password: PW, password2: PW });
        await waitScreen(p, "adTwo", 15000);
        await p.waitFor(() => !!document.getElementById("adTwoKey").getAttribute("data-raw"), 8000);
        await mobileCheck(p); await langs("2-step");
        const key = await p.evaluate(() => document.getElementById("adTwoKey").getAttribute("data-raw"));
        await fill(p, "adTwoForm", { code: await W2.totp(key) });
        await waitScreen(p, "adCodes", 10000);
        await mobileCheck(p); await langs("recovery codes");
        await p.evaluate(() => { document.getElementById("adCodesOk").click(); document.getElementById("adCodesDone").click(); });
        await waitScreen(p, "adApp", 8000);
        await p.evaluate(() => document.getElementById("adLogout").click());
        await waitScreen(p, "adLogin");
        await mobileCheck(p); await langs("sign-in");
        noErrors(p);
      } finally { await p.close(); await W2.close(); }
    });

    await check("an owner without 2-step verification is taken to it after sign-in and may postpone it; ?session= is ignored without the developer flag", async () => {
      const W3 = await startWorker(repo);
      const p = await browser.newPage(null, { isolated: true });
      try {
        const made = await W3.api("/bootstrap", { method: "POST", body: { token: TOKEN, username: "owner", password: PW } });
        assert(made.status === 201);
        await p.goto(W3.origin + "/admin?session=bearer");
        await waitScreen(p, "adLogin");
        await fill(p, "adLoginForm", { username: "owner", password: PW });
        await waitScreen(p, "adTwo", 10000);
        await p.waitFor(() => !!document.getElementById("adTwoKey").getAttribute("data-raw"), 8000);
        const r = await p.evaluate(() => ({ skip: document.getElementById("adTwoSkip").hidden, steps: document.querySelector("#adTwo .ad-steps").hidden }));
        assert(!r.skip && r.steps, "ordinary sign-in: 'later' offered, no first-run steps: " + JSON.stringify(r));
        await p.evaluate(() => document.getElementById("adTwoSkip").click());
        await waitScreen(p, "adApp", 8000);
        const audit = (await W3.env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'login.ok'").all()).results;
        assert(audit.length === 1 && /"mode":"cookie"/.test(audit[0].detail), "no developer flag: ?session=bearer ignored: " + JSON.stringify(audit));
        // with the developer flag the override applies and the API host is shown
        await p.evaluate(() => { localStorage.setItem("lq-admin-dev", "1"); document.getElementById("adLogout").click(); });
        await waitScreen(p, "adLogin");
        await p.goto(W3.origin + "/admin?session=bearer");
        await waitScreen(p, "adLogin");
        assert(!(await p.evaluate(() => document.getElementById("adConn").hidden)), "developer flag: API host shown");
        await fill(p, "adLoginForm", { username: "owner", password: PW });
        await waitScreen(p, "adTwo", 10000);
        const audit2 = (await W3.env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'login.ok' ORDER BY id DESC LIMIT 1").first());
        assert(/"mode":"bearer"/.test(audit2.detail), JSON.stringify(audit2));
        noErrors(p);
      } finally { await p.close(); await W3.close(); }
    });
    await page.close();
  } finally { await W.close(); await browser.close(); }
}
