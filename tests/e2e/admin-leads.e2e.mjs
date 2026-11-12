// tests/e2e/admin-leads.e2e.mjs — quote-request inbox ("Leads") of the admin page (owner decision 2026-11-12, Sellable pack
// item 9), in a real browser against the REAL Worker code on an in-memory database (startWorker from admin-setup.e2e.mjs).
// FIXED TEST SET written before the build; sha256 in ~/LENSIQ-field/evals/leads/locked.sha256.
//   1. not signed in: the inbox is not on screen and its API answers 401 with no personal data
//   2. signed in: list newest first with status (new / contacted / closed) and counts; the list shows no e-mail / phone
//   3. view one: contact details, message and the automatic deletion date
//   4. mark status: contacted / closed, filter by status
//   5. CSV export asks for the password (re-auth) and downloads every request
//   6. delete one: a confirmation, then the password when the 5-minute window has closed; cancel keeps the request
//   7. audit log: every inbox action, with ids only
//   8. phones 320 / 360 / 390 and English / 中文: the tab, list, detail and dialogs fit and carry no Thai
//   9. (amendment A6, owner decision 2026-11-12) unread badge on the tab: shown after sign-in, opening a request clears it
// Synthetic requests only (Latin names so that "no Thai left" can be checked on the data too).
import { assert } from "./cdp.mjs";
import { mobileCheck, sleep } from "./zones-lib.mjs";
import { startWorker, TOKEN, PW } from "./admin-setup.e2e.mjs";

const THAI = /[ก-ฺเ-๛]/;
const nowS = () => Math.floor(Date.now() / 1000);
const PII = ["buyer.one@shop.example", "0812345601", "Secret message one", "buyer.two@shop.example", "0812345602", "buyer.three@shop.example"];

function noErrors(page) {
  const errs = page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && /\/admin\/api\//.test(e.url || "") && /status of 4(00|01|03)\b/.test(e.text || "")));
  assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
}

export default async function ({ launch, check, repo }) {
  const browser = await launch();
  const W = await startWorker(repo);
  const seed = async (n, name, email, phone, message, product) => {
    const id = n.toString(16).padStart(24, "0");
    await W.env.DB.prepare("INSERT INTO leads (id, created_at, product, plan, source, name, company, email, phone, message, lang, consent_version, status) " +
      "VALUES (?1, ?2, ?3, NULL, 'index', ?4, 'Example Co', ?5, ?6, ?7, 'en', 'l1', 'new')").bind(id, nowS() - 3600 * (10 - n), product, name, email, phone, message).run();
    return id;
  };
  const ids = [await seed(1, "Buyer One", PII[0], PII[1], PII[2], "exam"), await seed(2, "Buyer Two", PII[3], PII[4], null, "gate"),
    await seed(3, "Buyer Three", PII[5], null, null, "crowd")];
  const page = await browser.newPage(null, { isolated: true });
  const items = () => page.evaluate(() => [...document.querySelectorAll("#adlList [data-lead]")].map(e => ({ id: e.getAttribute("data-lead"), text: e.innerText })));
  const reauth = (pw, ok = true) => page.evaluate((pw, ok) => {
    const d = document.querySelector("dialog.ad-reauth[open]");
    d.querySelector("input[type=password]").value = pw;
    d.querySelector(`button[value=${ok ? "ok" : "cancel"}]`).click();
  }, pw, ok);
  try {
    await check("not signed in: no inbox on screen; the inbox API answers 401 without personal data", async () => {
      await W.api("/bootstrap", { method: "POST", body: { token: TOKEN, username: "owner", password: PW } });
      await page.goto(W.origin + "/admin");
      await page.waitFor("!document.getElementById('adLogin').hidden", 8000);
      const r = await page.evaluate(async () => {
        const x = await fetch("/admin/api/leads?status=all", { credentials: "include" });
        return { status: x.status, text: await x.text(), app: !document.getElementById("adApp").hidden, html: document.documentElement.outerHTML };
      });
      assert(r.status === 401, "status " + r.status);
      assert(!r.app, "back office hidden");
      assert(!PII.some(p => r.text.includes(p) || r.html.includes(p)), "no personal data");
      noErrors(page);
    });

    await check("signed in: Leads tab lists newest first with status and counts; no e-mail or phone in the list", async () => {
      await page.evaluate(pw => { const f = document.getElementById("adLoginForm"); f.username.value = "owner"; f.password.value = pw; f.requestSubmit(); }, PW);
      await page.waitFor("!document.getElementById('adTwo').hidden || !document.getElementById('adApp').hidden", 10000);
      if (await page.evaluate("!document.getElementById('adTwo').hidden")) {
        await page.waitFor("!document.getElementById('adTwoSkip').hidden", 8000);
        await page.evaluate(() => document.getElementById("adTwoSkip").click());
      }
      await page.waitFor("!document.getElementById('adApp').hidden", 8000);
      await page.waitFor("!document.getElementById('adlBadge').hidden && document.getElementById('adlBadge').textContent === '3'", 8000);
      await page.evaluate(() => document.querySelector("[data-tab=leads]").click());
      await page.waitFor("document.querySelectorAll('#adlList [data-lead]').length === 3", 8000);
      const l = await items();
      assert(JSON.stringify(l.map(x => x.id)) === JSON.stringify([ids[2], ids[1], ids[0]]), "newest first: " + l.map(x => x.id));
      assert(l.every(x => /ใหม่/.test(x.text)), "status shown: " + l[0].text);
      assert(/Buyer Three/.test(l[0].text) && /crowd|Crowd|ฝูงชน/.test(l[0].text), l[0].text);
      const panel = await page.evaluate(() => document.querySelector('[data-panel="leads"]').innerText);
      assert(!PII.some(p => panel.includes(p)), "list shows no contact details");
      assert(/3/.test(await page.evaluate(() => document.getElementById("adlCounts").innerText)), "counts");
      noErrors(page);
    });

    await check("view one: contact details, message and the automatic deletion date", async () => {
      await page.evaluate(id => document.querySelector(`#adlList [data-lead="${id}"] [data-act=view]`).click(), ids[0]);
      await page.waitFor(() => !document.getElementById("adlDetail").hidden && /buyer\.one@shop\.example/.test(document.getElementById("adlDetail").innerText), 8000);
      const t = await page.evaluate(() => document.getElementById("adlDetail").innerText);
      assert(t.includes(PII[1]) && t.includes(PII[2]) && /Example Co/.test(t), t);
      assert(/ลบอัตโนมัติ/.test(t) && /180/.test(t), "deletion date: " + t);
      await page.waitFor("document.getElementById('adlBadge').textContent === '2'", 8000);
      assert((await W.env.DB.prepare("SELECT viewed_at FROM leads WHERE id = ?1").bind(ids[0]).first()).viewed_at > 0, "marked read on the Worker");
      noErrors(page);
    });

    await check("mark status: contacted and closed; filter by status", async () => {
      await page.evaluate(() => { const s = document.getElementById("adlStatus"); s.value = "contacted"; s.dispatchEvent(new Event("change")); });
      await page.waitFor(`/ติดต่อแล้ว/.test((document.querySelector('#adlList [data-lead="${ids[0]}"]') || {}).innerText || "")`, 8000);
      await page.evaluate(id => document.querySelector(`#adlList [data-lead="${id}"] [data-act=view]`).click(), ids[1]);
      await page.waitFor(`/buyer\\.two@shop\\.example/.test(document.getElementById("adlDetail").innerText)`, 8000);
      await page.evaluate(() => { const s = document.getElementById("adlStatus"); s.value = "closed"; s.dispatchEvent(new Event("change")); });
      await page.waitFor(`/ปิดแล้ว/.test((document.querySelector('#adlList [data-lead="${ids[1]}"]') || {}).innerText || "")`, 8000);
      const st = (await W.env.DB.prepare("SELECT id, status FROM leads ORDER BY id").all()).results.map(x => x.status);
      assert(JSON.stringify(st) === JSON.stringify(["contacted", "closed", "new"]), st.join(","));
      await page.evaluate(() => { const f = document.getElementById("adlFilter"); f.value = "closed"; f.dispatchEvent(new Event("change")); });
      await page.waitFor(`document.querySelectorAll('#adlList [data-lead]').length === 1 && !!document.querySelector('#adlList [data-lead="${ids[1]}"]')`, 8000);
      await page.evaluate(() => { const f = document.getElementById("adlFilter"); f.value = "all"; f.dispatchEvent(new Event("change")); });
      await page.waitFor("document.querySelectorAll('#adlList [data-lead]').length === 3", 8000);
      noErrors(page);
    });

    await check("CSV export asks for the password and downloads every request", async () => {
      await page.evaluate(() => {
        window.__csv = null;
        const o = URL.createObjectURL;
        URL.createObjectURL = b => { if (b && b.type && /csv/.test(b.type)) b.text().then(t => { window.__csv = t; }); return o.call(URL, b); };
        HTMLAnchorElement.prototype.click = function () {};
        document.getElementById("adlExport").click();
      });
      await page.waitFor("!!document.querySelector('dialog.ad-reauth[open]')", 8000);
      await reauth(PW);
      await page.waitFor("typeof window.__csv === 'string'", 8000);
      const csv = await page.evaluate(() => window.__csv);
      assert(/^id,received,status,interest/.test(csv) && csv.trim().split(/\r?\n/).length === 4, csv.slice(0, 200));
      assert(PII.every(p => csv.includes(p)), "all requests in the file");
      noErrors(page);
    });

    await check("delete one: confirmation first; the password again once the 5-minute window has closed; cancel keeps it", async () => {
      await W.env.DB.prepare("UPDATE admin_sessions SET reauth_at = 0").run();
      await page.evaluate(id => document.querySelector(`#adlList [data-lead="${id}"] [data-act=view]`).click(), ids[2]);
      await page.waitFor(`/buyer\\.three@shop\\.example/.test(document.getElementById("adlDetail").innerText)`, 8000);
      await page.evaluate(() => document.getElementById("adlDelete").click());
      await page.waitFor("document.getElementById('adlConfirm').open", 5000);
      await page.evaluate(() => document.querySelector("#adlConfirm button[value=cancel]").click());
      await sleep(300);
      assert(await W.env.DB.prepare("SELECT id FROM leads WHERE id = ?1").bind(ids[2]).first(), "cancel keeps it");
      await page.evaluate(() => document.getElementById("adlDelete").click());
      await page.waitFor("document.getElementById('adlConfirm').open", 5000);
      await page.evaluate(() => document.querySelector("#adlConfirm button[value=ok]").click());
      await page.waitFor("!!document.querySelector('dialog.ad-reauth[open]')", 8000);
      await reauth(PW, false);
      await sleep(400);
      assert(await W.env.DB.prepare("SELECT id FROM leads WHERE id = ?1").bind(ids[2]).first(), "no password, not deleted");
      await page.evaluate(() => document.getElementById("adlDelete").click());
      await page.waitFor("document.getElementById('adlConfirm').open", 5000);
      await page.evaluate(() => document.querySelector("#adlConfirm button[value=ok]").click());
      await page.waitFor("!!document.querySelector('dialog.ad-reauth[open]')", 8000);
      await reauth(PW);
      await page.waitFor(`document.querySelectorAll('#adlList [data-lead]').length === 2 && !document.querySelector('#adlList [data-lead="${ids[2]}"]')`, 8000);
      assert(!(await W.env.DB.prepare("SELECT id FROM leads WHERE id = ?1").bind(ids[2]).first()), "deleted");
      assert(await page.evaluate(() => document.getElementById("adlDetail").hidden), "detail closed");
      noErrors(page);
    });

    await check("audit: every inbox action recorded with ids only", async () => {
      const rows = (await W.env.DB.prepare("SELECT action, detail FROM audit_log WHERE action LIKE 'lead.%' ORDER BY id").all()).results;
      const acts = new Set(rows.map(r => r.action));
      for (const a of ["lead.list", "lead.viewed", "lead.status", "lead.export", "lead.deleted"]) assert(acts.has(a), "missing " + a + ": " + [...acts]);
      const all = (await W.env.DB.prepare("SELECT detail FROM audit_log").all()).results.map(r => String(r.detail)).join("\n");
      assert(!PII.some(p => all.includes(p)) && !/Buyer (One|Two|Three)/.test(all), "no personal data in the audit log");
    });

    await check("phones 320 / 360 / 390 and English / 中文: list, detail and dialogs fit and carry no Thai", async () => {
      await page.evaluate(id => document.querySelector(`#adlList [data-lead="${id}"] [data-act=view]`).click(), ids[0]);
      await page.waitFor("!document.getElementById('adlDetail').hidden", 8000);
      await mobileCheck(page);
      for (const l of ["en", "zh"]) {
        await page.evaluate(l => { const s = document.getElementById("adLang"); s.value = l; s.dispatchEvent(new Event("change")); }, l);
        await page.waitFor(`window.LQI18N.lang === ${JSON.stringify(l)}`, 8000);
        await sleep(300);
        await page.evaluate(() => document.getElementById("adlDelete").click());
        await page.waitFor("document.getElementById('adlConfirm').open", 5000);
        const t = await page.evaluate(() => [document.querySelector("[data-tab=leads]").innerText, document.querySelector('[data-panel="leads"]').innerText,
          document.getElementById("adlConfirm").innerText].join("\n"));
        assert(!THAI.test(t), l + ": Thai left: " + (t.match(/[^\n]*[ก-ฺเ-๛][^\n]*/) || [])[0]);
        await mobileCheck(page);
        await page.evaluate(() => document.querySelector("#adlConfirm button[value=cancel]").click());
      }
      await page.evaluate(() => { const s = document.getElementById("adLang"); s.value = "th"; s.dispatchEvent(new Event("change")); });
      noErrors(page);
    });
  } finally { await page.close(); await W.close(); await browser.close(); }
}
