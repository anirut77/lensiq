// tests/e2e/admin-lead-notify.e2e.mjs — "LINE lead notification is never silent" (owner order 2026-11-15) in the admin
// page, in a real browser against the REAL Worker code on an in-memory database (startWorker from admin-setup.e2e.mjs).
// FIXED TEST SET written before the build; sha256 in evals-locks/lead-notify.sha256 (~/LENSIQ-field/evals/lead-notify/).
//   1. under the quote-request inbox, one status line: LINE notification working or not, the last success time, and the
//      reason when it is not working (secret NAME + plain reason, from the live config check and the latest lead)
//   2. a lead whose notification was skipped or failed carries a visible badge on its row; sent / older rows do not
//   3. TH / EN / 中文 complete: the status line and the badge in each language, no Thai left in EN / ZH
//   4. no secret value appears in the page HTML or in any admin API answer
//   5. phones 320 / 360 / 390: the status line and badges fit
// Synthetic requests only.
import { assert } from "./cdp.mjs";
import { mobileCheck, sleep } from "./zones-lib.mjs";
import { startWorker, TOKEN, PW } from "./admin-setup.e2e.mjs";

const THAI = /[ก-ฺเ-๛]/;
const nowS = () => Math.floor(Date.now() / 1000);
const LINE_TOKEN = "CANARYe2eLineToken" + "Wq4".repeat(25);
const LINE_TO_OK = "U" + "9e8d7c6b5a493827".repeat(2);

function noErrors(page) {
  const errs = page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && /\/admin\/api\//.test(e.url || "") && /status of 4(00|01|03)\b/.test(e.text || "")));
  assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
}
function noValue(text, where) {
  for (const v of [LINE_TOKEN, LINE_TO_OK]) for (let i = 0; i + 12 <= v.length; i += 4) assert(!text.includes(v.slice(i, i + 12)), where + ": a piece of a secret value is shown");
}

export default async function ({ launch, check, repo }) {
  const W = await startWorker(repo, { vars: { LINE_CHANNEL_ACCESS_TOKEN: LINE_TOKEN, LEAD_NOTIFY_LINE_TO: "@632yliiw" } });
  const sentAt = nowS() - 3600 * 5;
  const seed = async (n, name, state, detail, at) => {
    const id = n.toString(16).padStart(24, "0");
    await W.env.DB.prepare("INSERT INTO leads (id, created_at, product, plan, source, name, company, email, phone, message, lang, consent_version, status, " +
      "notify_state, notify_detail, notify_at) VALUES (?1, ?2, 'exam', NULL, 'index', ?3, 'Example Co', 'n" + n + "@shop.example', NULL, NULL, 'en', 'l1', 'new', ?4, ?5, ?6)")
      .bind(id, nowS() - 3600 * (10 - n), name, state, detail, at).run();
    return id;
  };
  const ids = {
    old: await seed(1, "Buyer Old", null, null, null),
    sent: await seed(2, "Buyer Sent", "sent", "http_200", sentAt),
    skipped: await seed(3, "Buyer Skipped", "skipped", "LEAD_NOTIFY_LINE_TO:starts_with_at", nowS() - 3600 * 3),
    failed: await seed(4, "Buyer Failed", "failed", "http_401", nowS() - 3600 * 2)
  };
  const browser = await launch();
  const page = await browser.newPage(null, { isolated: true });
  const line = () => page.evaluate(() => { const e = document.getElementById("adlNotify"); return e ? { text: e.innerText, state: e.getAttribute("data-state"), hidden: e.hidden } : null; });
  const badges = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#adlList [data-lead]")].map(e => {
    const b = e.querySelector("[data-notify-miss]");
    return [e.getAttribute("data-lead"), b && b.offsetParent !== null ? b.innerText : null];
  })));
  const setLang = async l => {
    await page.evaluate(l => { const s = document.getElementById("adLang"); s.value = l; s.dispatchEvent(new Event("change")); }, l);
    await page.waitFor(`window.LQI18N.lang === ${JSON.stringify(l)}`, 8000);
    await sleep(300);
  };
  try {
    await check("signed in: the status line under the inbox says LINE is not working, names the secret and the reason, and the last success time", async () => {
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
      await page.waitFor("!!document.getElementById('adlNotify') && document.getElementById('adlNotify').getAttribute('data-state') === 'off'", 8000);
      const l = await line();
      assert(!l.hidden, "status line shown");
      assert(/ไม่ทำงาน/.test(l.text), "TH: not working: " + l.text);
      assert(/LEAD_NOTIFY_LINE_TO/.test(l.text) && /@/.test(l.text), "names the secret and the '@' reason: " + l.text);
      assert(!/LINE_CHANNEL_ACCESS_TOKEN/.test(l.text), "the token is fine: not named: " + l.text);
      assert(/ส่งสำเร็จล่าสุด/.test(l.text) && !/ส่งสำเร็จล่าสุด\s*[:：]?\s*—/.test(l.text), "last success time shown: " + l.text);
      const pos = await page.evaluate(() => {
        const list = document.getElementById("adlList"), n = document.getElementById("adlNotify");
        return !!(list.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) && list.closest(".ad-card") === n.closest(".ad-card");
      });
      assert(pos, "the line is under the inbox list, in the inbox card");
      noErrors(page);
    });

    await check("badge on the rows whose notification was skipped or failed; none on sent or older rows", async () => {
      const b = await badges();
      assert(b[ids.failed] && /ยังไม่ได้แจ้งทาง LINE/.test(b[ids.failed]), "failed row badge: " + b[ids.failed]);
      assert(b[ids.skipped] && /ยังไม่ได้แจ้งทาง LINE/.test(b[ids.skipped]), "skipped row badge: " + b[ids.skipped]);
      assert(b[ids.sent] === null && b[ids.old] === null, "no badge on sent / older rows: " + JSON.stringify(b));
    });

    await check("config fixed: the line follows the latest lead (LINE answered 401) in plain words", async () => {
      W.env.LEAD_NOTIFY_LINE_TO = LINE_TO_OK;
      await page.evaluate(() => document.getElementById("adlRefresh").click());
      await page.waitFor("document.getElementById('adlNotify').getAttribute('data-state') === 'failing'", 8000);
      const l = await line();
      assert(/ไม่ทำงาน/.test(l.text) && /401/.test(l.text), "TH failing with the LINE status: " + l.text);
      noErrors(page);
    });

    await check("English / 中文: status line and badge translated, no Thai left", async () => {
      for (const [lang, notWorking, badge] of [["en", /not working/i, /Not sent to LINE/], ["zh", /未运行/, /未通过 LINE 通知/]]) {
        await setLang(lang);
        const l = await line();
        assert(notWorking.test(l.text) && /401/.test(l.text), lang + ": " + l.text);
        const b = await badges();
        assert(badge.test(b[ids.failed] || "") && badge.test(b[ids.skipped] || ""), lang + " badge: " + JSON.stringify(b));
        const t = await page.evaluate(() => document.querySelector('[data-panel="leads"]').innerText);
        assert(!THAI.test(t), lang + ": Thai left: " + (t.match(/[^\n]*[ก-ฺเ-๛][^\n]*/) || [])[0]);
        await mobileCheck(page);
      }
      W.env.LINE_CHANNEL_ACCESS_TOKEN = "";
      await page.evaluate(() => document.getElementById("adlRefresh").click());
      await page.waitFor("document.getElementById('adlNotify').getAttribute('data-state') === 'off'", 8000);
      const l = await line();
      assert(/LINE_CHANNEL_ACCESS_TOKEN/.test(l.text) && /未设置|没有设置/.test(l.text), "zh: missing token named: " + l.text);
      await setLang("th");
      W.env.LINE_CHANNEL_ACCESS_TOKEN = LINE_TOKEN;
      noErrors(page);
    });

    await check("no secret value in the page HTML or in any admin API answer", async () => {
      const r = await page.evaluate(async () => {
        const out = [];
        for (const p of ["/admin/api/leads/notify", "/admin/api/leads?status=all", "/admin/api/leads/unread"]) {
          const x = await fetch(p, { credentials: "include" });
          out.push(x.status + " " + await x.text());
        }
        return { api: out.join("\n"), html: document.documentElement.outerHTML };
      });
      assert(/^200 /.test(r.api), "status route answers: " + r.api.slice(0, 120));
      noValue(r.api, "admin API");
      noValue(r.html, "admin HTML");
    });

    await check("phones 320 / 360 / 390: status line and badges fit", async () => {
      await mobileCheck(page);
      noErrors(page);
    });
  } finally { await page.close(); await W.close(); await browser.close(); }
}
