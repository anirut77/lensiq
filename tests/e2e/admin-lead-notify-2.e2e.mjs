// tests/e2e/admin-lead-notify-2.e2e.mjs — review round 1 of lead-notify-health (2026-11-15), cases D2, D3 and the ZH
// separator, locked (appended to evals-locks/lead-notify.sha256) before the fix. Real browser, REAL Worker code,
// in-memory database (startWorker from admin-setup.e2e.mjs).
//   D2  a lead whose LINE message was not sent because the daily cap was reached carries the "not sent to LINE" badge
//   D3  a lead whose result was never recorded (still pending after a minute) carries an "unknown" badge; a row from
//       before the feature carries none
//   ZH  the status line uses the full-width separator "：" after "LINE 通知"
//   TH / EN / ZH wording for both badges; no Thai left in EN / ZH
// Synthetic requests only.
import { assert } from "./cdp.mjs";
import { mobileCheck, sleep } from "./zones-lib.mjs";
import { startWorker, TOKEN, PW } from "./admin-setup.e2e.mjs";

const THAI = /[ก-ฺเ-๛]/;
const nowS = () => Math.floor(Date.now() / 1000);

function noErrors(page) {
  const errs = page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && /\/admin\/api\//.test(e.url || "") && /status of 4(00|01|03)\b/.test(e.text || "")));
  assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
}

export default async function ({ launch, check, repo }) {
  const W = await startWorker(repo, { vars: { LINE_CHANNEL_ACCESS_TOKEN: "CANARYe2eReview" + "Mn8".repeat(40), LEAD_NOTIFY_LINE_TO: "U" + "1a2b3c4d5e6f7a8b".repeat(2) } });
  const seed = async (n, name, state, detail, at, age) => {
    const id = n.toString(16).padStart(24, "0");
    await W.env.DB.prepare("INSERT INTO leads (id, created_at, product, plan, source, name, company, email, phone, message, lang, consent_version, status, " +
      "notify_state, notify_detail, notify_at) VALUES (?1, ?2, 'gate', NULL, 'index', ?3, 'Example Co', 'r" + n + "@shop.example', NULL, NULL, 'en', 'l1', 'new', ?4, ?5, ?6)")
      .bind(id, nowS() - age, name, state, detail, at).run();
    return id;
  };
  const ids = {
    old: await seed(1, "Buyer Old", null, null, null, 7200),
    sent: await seed(2, "Buyer Sent", "sent", "http_200", nowS() - 3000, 3000),
    capped: await seed(3, "Buyer Capped", "capped", "cap_50", nowS() - 2000, 2000),
    pending: await seed(4, "Buyer Pending", "pending", null, null, 600)
  };
  const browser = await launch();
  const page = await browser.newPage(null, { isolated: true });
  const badges = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#adlList [data-lead]")].map(e => {
    const b = e.querySelector("[data-notify-miss]");
    return [e.getAttribute("data-lead"), b && b.offsetParent !== null ? { kind: b.getAttribute("data-notify-miss"), text: b.innerText } : null];
  })));
  const setLang = async l => {
    await page.evaluate(l => { const s = document.getElementById("adLang"); s.value = l; s.dispatchEvent(new Event("change")); }, l);
    await page.waitFor(`window.LQI18N.lang === ${JSON.stringify(l)}`, 8000);
    await sleep(300);
  };
  try {
    await check("TH: capped lead has the 'not sent to LINE' badge; never-recorded lead has an 'unknown' badge; sent / older rows none", async () => {
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
      await page.waitFor("document.querySelectorAll('#adlList [data-lead]').length === 4", 8000);
      await page.waitFor("!!document.getElementById('adlNotify') && !!document.getElementById('adlNotify').getAttribute('data-state')", 8000);
      const b = await badges();
      assert(b[ids.capped] && /ยังไม่ได้แจ้งทาง LINE/.test(b[ids.capped].text), "capped badge: " + JSON.stringify(b[ids.capped]));
      assert(b[ids.pending] && b[ids.pending].kind === "unknown" && /ไม่ทราบ/.test(b[ids.pending].text), "unknown badge: " + JSON.stringify(b[ids.pending]));
      assert(b[ids.sent] === null && b[ids.old] === null, "no badge on sent / older rows: " + JSON.stringify(b));
      noErrors(page);
    });

    await check("EN / 中文: both badges translated; the ZH status line uses the full-width '：'; no Thai left", async () => {
      for (const [lang, capped, unknown] of [["en", /Not sent to LINE/, /unknown/i], ["zh", /未通过 LINE 通知/, /未知/]]) {
        await setLang(lang);
        const b = await badges();
        assert(capped.test((b[ids.capped] || {}).text || ""), lang + " capped: " + JSON.stringify(b[ids.capped]));
        assert(unknown.test((b[ids.pending] || {}).text || ""), lang + " unknown: " + JSON.stringify(b[ids.pending]));
        const t = await page.evaluate(() => document.querySelector('[data-panel="leads"]').innerText);
        assert(!THAI.test(t), lang + ": Thai left: " + (t.match(/[^\n]*[ก-ฺเ-๛][^\n]*/) || [])[0]);
        const line = await page.evaluate(() => document.getElementById("adlNotify").innerText);
        if (lang === "zh") assert(/^LINE 通知：/.test(line) && !/LINE 通知: /.test(line), "zh separator: " + line);
        else assert(/^LINE notification: /.test(line), "en separator: " + line);
        await mobileCheck(page);
      }
      await setLang("th");
      noErrors(page);
    });
  } finally { await page.close(); await W.close(); await browser.close(); }
}
