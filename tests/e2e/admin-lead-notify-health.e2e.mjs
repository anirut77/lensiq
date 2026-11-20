// tests/e2e/admin-lead-notify-health.e2e.mjs — lead-notify-health (owner night order A3, 2026-11-20) in the admin page,
// in a real browser against the REAL Worker code on an in-memory database (startWorker from admin-setup.e2e.mjs). FIXED
// TEST SET, hash-locked in evals-locks/seller-docs.sha256 (~/LENSIQ-field/evals/seller-docs/) BEFORE any product code.
// Switch: Worker var LEAD_NOTIFY_HEALTH ("off" in backend/wrangler.toml for the customer build and the test deployment).
//   1. switch off: the inbox shows the existing status line only; the health box stays hidden
//   2. switched on: under the inbox, a health box with one line per notify setting (configured, format OK or the plain
//      reason), the last success time and the last failure (time + plain reason); flagged (data-flagged="1", warning
//      style) with the number of requests not notified since the last success
//   3. a newer success clears the flag; the last failure stays listed
//   4. TH / EN / 中文 complete: no Thai left in EN / ZH; phones 320 / 360 / 390 fit
//   5. no secret value (nor a 12-character piece) in the page HTML or any admin API answer; no LINE call is made
// Synthetic requests only.
import { assert } from "./cdp.mjs";
import { mobileCheck, sleep } from "./zones-lib.mjs";
import { startWorker, TOKEN, PW } from "./admin-setup.e2e.mjs";

const THAI = /[ก-ฺเ-๛]/;
const nowS = () => Math.floor(Date.now() / 1000);
const LINE_TOKEN = "CANARYeHealthToken" + "Kpx".repeat(25);
const LINE_TO_OK = "U" + "1a2b3c4d5e6f7081".repeat(2);

function noErrors(page) {
  const errs = page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && /\/admin\/api\//.test(e.url || "") && /status of 4(00|01|03)\b/.test(e.text || "")));
  assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
}
function noValue(text, where) {
  for (const v of [LINE_TOKEN, LINE_TO_OK]) for (let i = 0; i + 12 <= v.length; i += 4) assert(!text.includes(v.slice(i, i + 12)), where + ": a piece of a secret value is shown");
}

export default async function ({ launch, check, repo }) {
  const outbound = [];
  const W = await startWorker(repo, {
    vars: { LINE_CHANNEL_ACCESS_TOKEN: LINE_TOKEN, LEAD_NOTIFY_LINE_TO: "@632yliiw", LEAD_NOTIFY_LINE_DAY: "abc", LEAD_NOTIFY_HEALTH: "off" },
    deps: { fetch: async url => { outbound.push(String(url)); throw new Error("no network"); } }
  });
  let n = 0;
  const seed = async (name, state, detail, at) => {
    const id = (++n).toString(16).padStart(24, "0");
    await W.env.DB.prepare("INSERT INTO leads (id, created_at, product, plan, source, name, company, email, phone, message, lang, consent_version, status, " +
      "notify_state, notify_detail, notify_at) VALUES (?1, ?2, 'exam', NULL, 'index', ?3, 'Example Co', 'h" + n + "@shop.example', NULL, NULL, 'en', 'l1', 'new', ?4, ?5, ?6)")
      .bind(id, at - 5, name, state, detail, at).run();
    return id;
  };
  const sentAt = nowS() - 3600 * 6;
  await seed("Buyer Sent", "sent", "http_200", sentAt);
  await seed("Buyer Skipped", "skipped", "LEAD_NOTIFY_LINE_TO:starts_with_at", nowS() - 3600 * 3);
  await seed("Buyer Failed", "failed", "http_401", nowS() - 3600 * 2);
  const browser = await launch();
  const page = await browser.newPage(null, { isolated: true });
  const box = () => page.evaluate(() => {
    const e = document.getElementById("adlNotifyHealth");
    if (!e) return null;
    const rows = Object.fromEntries([...e.querySelectorAll("[data-health-row]")].map(r => [r.getAttribute("data-health-row"), r.innerText]));
    return { hidden: e.hidden || e.offsetParent === null, flagged: e.getAttribute("data-flagged"), text: e.innerText, rows, cls: e.className };
  });
  const refresh = async () => {
    await page.evaluate(() => document.getElementById("adlRefresh").click());
    await sleep(600);
  };
  const setLang = async l => {
    await page.evaluate(l => { const s = document.getElementById("adLang"); s.value = l; s.dispatchEvent(new Event("change")); }, l);
    await page.waitFor(`window.LQI18N.lang === ${JSON.stringify(l)}`, 8000);
    await sleep(300);
  };
  try {
    await check("switch off: the existing status line only, the health box stays hidden", async () => {
      await W.api("/bootstrap", { method: "POST", body: { token: TOKEN, username: "owner", password: PW } });
      await page.goto(W.origin + "/admin");
      await page.waitFor("!document.getElementById('adLogin').hidden", 8000);
      await page.evaluate(pw => { const f = document.getElementById("adLoginForm"); f.username.value = "owner"; f.password.value = pw; f.requestSubmit(); }, PW);
      await page.waitFor("!document.getElementById('adTwo').hidden || !document.getElementById('adApp').hidden", 10000);
      if (await page.evaluate("!document.getElementById('adTwo').hidden")) {
        await page.waitFor("!document.getElementById('adTwoSkip').hidden", 8000);
        await page.evaluate(() => document.getElementById("adTwoSkip").click());
      }
      await page.waitFor("!document.getElementById('adApp').hidden", 8000);
      await page.evaluate(() => document.querySelector("[data-tab=leads]").click());
      await page.waitFor("document.querySelectorAll('#adlList [data-lead]').length === 3", 8000);
      await page.waitFor("document.getElementById('adlNotify').getAttribute('data-state') === 'off'", 8000);
      const b = await box();
      assert(b, "#adlNotifyHealth exists");
      assert(b.hidden, "hidden while the switch is off");
      noErrors(page);
    });

    await check("switched on: settings with configured / format, last success, last failure, flagged with the count", async () => {
      W.env.LEAD_NOTIFY_HEALTH = "on";
      await refresh();
      await page.waitFor("!document.getElementById('adlNotifyHealth').hidden", 8000);
      const b = await box();
      assert(!b.hidden, "shown");
      assert(b.flagged === "1", "flagged: " + b.flagged);
      const r = b.rows;
      assert(/LINE_CHANNEL_ACCESS_TOKEN/.test(r.LINE_CHANNEL_ACCESS_TOKEN || "") && /ตั้งค่าแล้ว/.test(r.LINE_CHANNEL_ACCESS_TOKEN) && /รูปแบบถูกต้อง/.test(r.LINE_CHANNEL_ACCESS_TOKEN), "token row: " + r.LINE_CHANNEL_ACCESS_TOKEN);
      assert(/LEAD_NOTIFY_LINE_TO/.test(r.LEAD_NOTIFY_LINE_TO || "") && /รูปแบบไม่ถูกต้อง/.test(r.LEAD_NOTIFY_LINE_TO) && /@/.test(r.LEAD_NOTIFY_LINE_TO), "recipient row: " + r.LEAD_NOTIFY_LINE_TO);
      assert(/LEAD_NOTIFY_LINE_DAY/.test(r.LEAD_NOTIFY_LINE_DAY || "") && /รูปแบบไม่ถูกต้อง/.test(r.LEAD_NOTIFY_LINE_DAY) && /50/.test(r.LEAD_NOTIFY_LINE_DAY), "day cap row: " + r.LEAD_NOTIFY_LINE_DAY);
      assert(/ส่งสำเร็จล่าสุด/.test(r.last_success || "") && /\d/.test(r.last_success), "last success: " + r.last_success);
      assert(/ไม่สำเร็จล่าสุด/.test(r.last_failure || "") && /401/.test(r.last_failure), "last failure: " + r.last_failure);
      assert(/2/.test(r.flag || "") && /ไม่ได้แจ้งทาง LINE/.test(r.flag), "flag with the count: " + r.flag);
      noValue(await page.evaluate("document.documentElement.outerHTML"), "page");
      noErrors(page);
    });

    await check("English / 中文: translated, no Thai left in the inbox panel; phones 320 / 360 / 390 fit", async () => {
      for (const [lang, set, bad] of [["en", /set/i, /wrong format|format is wrong/i], ["zh", /已设置/, /格式不正确/]]) {
        await setLang(lang);
        const b = await box();
        assert(set.test(b.rows.LINE_CHANNEL_ACCESS_TOKEN) && bad.test(b.rows.LEAD_NOTIFY_LINE_TO), lang + ": " + JSON.stringify(b.rows));
        assert(/401/.test(b.rows.last_failure), lang + " last failure: " + b.rows.last_failure);
        const t = await page.evaluate(() => document.querySelector('[data-panel="leads"]').innerText);
        assert(!THAI.test(t), lang + ": Thai left: " + (t.match(/[^\n]*[ก-ฺเ-๛][^\n]*/) || [])[0]);
        await mobileCheck(page);
      }
      await setLang("th");
      await mobileCheck(page);
      noErrors(page);
    });

    await check("a newer success clears the flag; the last failure stays listed; no secret value anywhere; no LINE call", async () => {
      W.env.LEAD_NOTIFY_LINE_TO = LINE_TO_OK;
      W.env.LEAD_NOTIFY_LINE_DAY = "20";
      await seed("Buyer Sent Again", "sent", "http_200", nowS() - 60);
      await refresh();
      await page.waitFor("document.getElementById('adlNotifyHealth').getAttribute('data-flagged') === '0'", 8000);
      const b = await box();
      assert(!b.rows.flag || !/ไม่ได้แจ้งทาง LINE/.test(b.rows.flag), "no flag line: " + b.rows.flag);
      assert(/401/.test(b.rows.last_failure), "last failure still listed: " + b.rows.last_failure);
      assert(/รูปแบบถูกต้อง/.test(b.rows.LEAD_NOTIFY_LINE_TO) && /20/.test(b.rows.LEAD_NOTIFY_LINE_DAY), JSON.stringify(b.rows));
      const api = await page.evaluate(async () => JSON.stringify(await window.LQAdminKit.call("/leads/notify")));
      noValue(api, "API");
      noValue(await page.evaluate("document.documentElement.outerHTML"), "page");
      assert(!outbound.some(u => /api\.line\.me/.test(u)), "no LINE call: " + outbound.join(","));
      noErrors(page);
    });
  } finally { await page.close(); await W.close(); await browser.close(); }
}
