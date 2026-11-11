// tests/e2e/admin-keys.e2e.mjs — AI provider keys card of the admin page (owner spec 2026-11-11), in a real browser against
// the real Worker code on an in-memory database (helper from admin-setup.e2e.mjs):
//   1. the card lists every provider with where its key comes from; a Worker secret shows as "set on the server";
//   2. setting a key: the dialog asks for the key, the password and a 6-digit code; a wrong code or a key of the wrong
//      shape is refused with a plain message and nothing is stored; the right one stores it; the page then shows only
//      the last 4 characters and the key appears nowhere in the page, in storage or in a request URL;
//   3. test key: OK / not working shown, nothing of the provider's answer; removing falls back to the server key;
//   4. phone widths 320 / 360 / 390 and English / 中文 for the card and the dialog.
// Synthetic keys only; the provider is a fake fetch (no network).
import { assert } from "./cdp.mjs";
import { mobileCheck, sleep } from "./zones-lib.mjs";
import { startWorker, TOKEN, PW } from "./admin-setup.e2e.mjs";

const OR_KEY = "sk-or-v1-" + "c0ffee12".repeat(8);
const SERVER_KEY = "sk-or-v1-" + "5e5e5e5e".repeat(8);
const THAI = /[ก-ฺเ-๛]/;

function noErrors(page) {
  const errs = page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && /\/admin\/api\//.test(e.url || "") && /status of 4(00|01|03)\b/.test(e.text || "")));
  assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
}

export default async function ({ launch, check, repo }) {
  const browser = await launch();
  let providerStatus = 200;
  const sentToProvider = [];
  const W = await startWorker(repo, { vars: { OPENROUTER_API_KEY: SERVER_KEY },
    deps: { fetch: async (url, init) => { sentToProvider.push({ url: String(url), auth: (init.headers || {}).Authorization || "" });
      return new Response(JSON.stringify({ data: { label: "PROVIDER-SECRET-INFO" } }), { status: providerStatus }); } } });
  const page = await browser.newPage(null, { isolated: true });
  const keyRow = id => page.evaluate(id => { const r = document.querySelector(`.adk-row[data-provider="${id}"]`); return r ? r.innerText : null; }, id);
  const dialog = (values, submit = true) => page.evaluate((values, submit) => {
    const f = document.getElementById("adkForm");
    for (const k in values) f.elements[k].value = values[k];
    if (submit) document.getElementById("adkOk").click();
  }, values, submit);
  const openFor = (id, label) => page.evaluate((id, label) => {
    const b = [...document.querySelectorAll(`.adk-row[data-provider="${id}"] button`)].find(x => x.textContent.includes(label));
    b.click();
  }, id, label);
  try {
    await check("keys card: every provider listed; the Worker secret shows as set on the server; no developer wording", async () => {
      // owner with 2-step verification, through the real first-run screens
      await page.goto(W.origin + "/admin");
      await page.waitFor("!document.getElementById('adBoot').hidden", 8000);
      await page.evaluate((t, pw) => {
        const f = document.getElementById("adBootForm");
        f.token.value = t; f.username.value = "owner"; f.password.value = pw; f.password2.value = pw; f.requestSubmit();
      }, TOKEN, PW);
      await page.waitFor("!!document.getElementById('adTwoKey').getAttribute('data-raw')", 15000);
      const secret = await page.evaluate(() => document.getElementById("adTwoKey").getAttribute("data-raw"));
      await page.evaluate(c => { const f = document.getElementById("adTwoForm"); f.code.value = c; f.requestSubmit(); }, await W.totp(secret));
      await page.waitFor("!document.getElementById('adCodes').hidden", 10000);
      await page.evaluate(() => { document.getElementById("adCodesOk").click(); document.getElementById("adCodesDone").click(); });
      await page.waitFor("!document.getElementById('adApp').hidden", 8000);
      page.secret = secret;
      await page.evaluate(() => document.querySelector("[data-tab=aigw]").click());
      await page.waitFor("document.querySelectorAll('.adk-row').length >= 8", 10000);
      const rows = await page.evaluate(() => [...document.querySelectorAll(".adk-row")].map(r => r.getAttribute("data-provider")));
      assert(rows.includes("openrouter") && rows.includes("anthropic") && rows.length === 8, rows.join(","));
      assert(/ตั้งไว้บนเซิร์ฟเวอร์ตอนติดตั้ง/.test(await keyRow("openrouter")), await keyRow("openrouter"));
      assert(/ยังไม่มีคีย์/.test(await keyRow("anthropic")));
      const text = await page.evaluate(() => document.querySelector('[data-panel="aigw"]').innerText);
      const DEV = /wrangler|secret put|Worker secret|SECRETS_KEK|OPENROUTER_API_KEY/;
      assert(!DEV.test(text), "developer wording: " + (text.match(DEV) || [])[0]);
      assert(!text.includes(SERVER_KEY.slice(0, 16)) && !text.includes(SERVER_KEY.slice(-8)), "no part of the server key beyond what is allowed");
      noErrors(page);
    });

    await check("set key: wrong code and wrong key shape refused with plain messages; the right request stores it; only the last 4 are shown anywhere", async () => {
      await openFor("openrouter", "ตั้งคีย์");
      assert(await page.evaluate(() => document.getElementById("adkDlg").open));
      await dialog({ key: OR_KEY, password: PW, totp: "000000" });
      await page.waitFor(() => { const e = document.getElementById("adkErr"); return !e.hidden && /ไม่ถูกต้อง/.test(e.textContent); }, 8000);
      await page.waitFor("!document.getElementById('adkOk').disabled", 4000);
      assert((await W.env.DB.prepare("SELECT COUNT(*) AS n FROM ai_provider_keys").first()).n === 0);
      await W.env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run();
      await dialog({ key: "sk-ant-api03-" + "x".repeat(40), password: PW, totp: await W.totp(page.secret) });
      await page.waitFor(() => { const e = document.getElementById("adkErr"); return !e.hidden && /รูปแบบ/.test(e.textContent); }, 8000);
      await page.waitFor("!document.getElementById('adkOk').disabled", 4000);
      await W.env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run();
      await dialog({ key: OR_KEY, password: PW, totp: await W.totp(page.secret) });
      await page.waitFor("!document.getElementById('adkDlg').open", 8000);
      await page.waitFor(`/ลงท้าย ${OR_KEY.slice(-4)}/.test((document.querySelector('.adk-row[data-provider="openrouter"]') || {}).innerText || "")`, 8000);
      const r = await page.evaluate(k => ({ html: document.documentElement.outerHTML.includes(k.slice(0, 20)) || document.documentElement.outerHTML.includes(k.slice(-10)),
        storage: JSON.stringify(Object.assign({}, localStorage, sessionStorage)).includes(k.slice(0, 20)),
        inputs: [...document.querySelectorAll("#adkForm input")].map(i => i.value).join("") }), OR_KEY);
      assert(!r.html && !r.storage && r.inputs === "", JSON.stringify(r));
      assert(!page.requests.some(q => q.url.includes(OR_KEY.slice(0, 20))), "the key is in no request URL");
      assert(/ใช้แทนคีย์บนเซิร์ฟเวอร์/.test(await keyRow("openrouter")));
      noErrors(page);
    });

    await check("test key: shows working / not working only; remove falls back to the server key", async () => {
      await openFor("openrouter", "ทดสอบคีย์");
      await page.waitFor(`/คีย์ใช้ได้/.test(document.getElementById("adMsg").textContent)`, 8000);
      assert(sentToProvider.length === 1 && sentToProvider[0].auth === "Bearer " + OR_KEY, "the panel key was tested");
      providerStatus = 401;
      await page.waitFor(() => [...document.querySelectorAll('.adk-row[data-provider="openrouter"] button')].every(b => !b.disabled), 4000);
      await openFor("openrouter", "ทดสอบคีย์");
      await page.waitFor(`/ใช้ไม่ได้/.test(document.getElementById("adMsg").textContent)`, 8000);
      assert(!(await page.evaluate(() => document.body.innerText.includes("PROVIDER-SECRET-INFO"))), "nothing of the provider's answer is shown");
      await openFor("openrouter", "ลบคีย์");
      await W.env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run();
      await dialog({ password: PW, totp: await W.totp(page.secret) });
      await page.waitFor(`/ตั้งไว้บนเซิร์ฟเวอร์ตอนติดตั้ง/.test((document.querySelector('.adk-row[data-provider="openrouter"]') || {}).innerText || "")`, 8000);
      assert((await W.env.DB.prepare("SELECT COUNT(*) AS n FROM ai_provider_keys").first()).n === 0);
      const audit = (await W.env.DB.prepare("SELECT action FROM audit_log WHERE action LIKE 'ai.provider_key.%' ORDER BY id").all()).results.map(x => x.action);
      assert(JSON.stringify(audit) === JSON.stringify(["ai.provider_key.set", "ai.provider_key.tested", "ai.provider_key.tested", "ai.provider_key.removed"]), audit.join(","));
      noErrors(page);
    });

    await check("phones 320 / 360 / 390 and English / 中文: the keys card and the dialog fit and carry no Thai", async () => {
      await mobileCheck(page);
      await openFor("anthropic", "ตั้งคีย์");
      await mobileCheck(page);
      for (const l of ["en", "zh"]) {
        await page.evaluate(l => { const s = document.getElementById("adLang"); s.value = l; s.dispatchEvent(new Event("change")); }, l);
        await page.waitFor(`window.LQI18N.lang === ${JSON.stringify(l)}`, 8000);
        await sleep(200);
        const t = await page.evaluate(() => [document.getElementById("adkCard").innerText, document.getElementById("adkDlg").innerText].join("\n"));
        assert(!THAI.test(t), l + ": Thai left: " + (t.match(/[^\n]*[ก-ฺเ-๛][^\n]*/) || [])[0]);
      }
      await page.evaluate(() => document.querySelector('#adkForm button[value=cancel]').click());
      noErrors(page);
    });
  } finally { await page.close(); await W.close(); await browser.close(); }
}
