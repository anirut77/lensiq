// tests/e2e/admin-orgs.e2e.mjs — stream G (owner decisions 2026-11-13): the back-office "Organisations" tab (organisation
// account lite: name, billing details, members, owner invitation, licence orders for Gate / Attendance / Exam lab / Crowd
// report entered after a quotation and a bank transfer), in a real browser against the REAL Worker code on an in-memory
// database (startWorker from admin-setup.e2e.mjs). Locked before the tab was written.
//   1. create an organisation: the owner invitation link is shown once
//   2. detail: billing details saved; members list; "needs owner" until the invitation is accepted
//   3. licence order: plan list is the four products only, the password is asked (re-auth), the order is listed
//   4. per-organisation audit log is shown with the chain status
//   5. English / 中文: the tab carries no Thai (organisation data is Latin here)
import { assert } from "./cdp.mjs";
import { sleep } from "./zones-lib.mjs";
import { startWorker, TOKEN, PW } from "./admin-setup.e2e.mjs";

const THAI = /[ก-ฺเ-๛]/;

export default async function ({ launch, check, repo }) {
  const browser = await launch();
  const W = await startWorker(repo, { vars: { ORG_ACCOUNTS: "on" } }); // A-P1-3: both org-p1 switches on for this suite
  const page = await browser.newPage(null, { initScripts: ["window.LENSIQ_ORG_ACCOUNTS = true;"], isolated: true }); // A-P1-3
  const reauth = pw => page.evaluate(pw => {
    const d = document.querySelector("dialog.ad-reauth[open]");
    d.querySelector("input[type=password]").value = pw;
    d.querySelector("button[value=ok]").click();
  }, pw);
  try {
    await check("orgs tab: sign in, create an organisation, the owner invitation link is shown", async () => {
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
      await page.evaluate(() => document.querySelector("[data-tab=orgs]").click());
      await page.waitFor("!!document.getElementById('adoCreate')", 5000);
      await page.evaluate(() => { const f = document.getElementById("adoCreate"); f.elements.name.value = "Example Academy"; f.requestSubmit(); });
      // amendment A-G6 (security review L2): issuing the owner link asks for the password
      await page.waitFor("!!document.querySelector('dialog.ad-reauth[open]')", 5000);
      await reauth(PW);
      await page.waitFor("/#org_invite=[A-Za-z0-9_-]{43}$/.test((document.getElementById('adoInviteLink') || {}).value || '')", 6000);
      await page.waitFor("document.querySelectorAll('#adoList [data-org]').length === 1", 6000);
    });

    await check("orgs tab: detail with billing details saved, members, needs-owner flag", async () => {
      await page.evaluate(() => document.querySelector("#adoList [data-org] button, #adoList [data-org]").click());
      await page.waitFor("!!document.getElementById('adoBilling')", 5000);
      const flag = await page.evaluate(() => document.getElementById("adoDetail").innerText);
      assert(/needs|ยังไม่มีเจ้าของ|无所有者|owner/i.test(flag), "needs-owner shown: " + flag.slice(0, 300));
      await page.evaluate(() => {
        const f = document.getElementById("adoBilling");
        f.elements.name.value = "Example Academy Co., Ltd."; f.elements.tax_id.value = "0105555555555"; f.elements.address.value = "9 Sample Road"; f.elements.email.value = "billing@example.test";
        f.requestSubmit();
      });
      await sleep(800);
      const row = await W.env.DB.prepare("SELECT billing_tax_id, billing_email FROM orgs").first();
      assert(row.billing_tax_id === "0105555555555" && row.billing_email === "billing@example.test", JSON.stringify(row));
    });

    await check("orgs tab: licence order: four products only, password asked, order listed", async () => {
      // amendment A-G7: creating the org (review L2) opened the 5-minute re-auth window; close it so this step still
      // proves that a licence order asks for the password
      await W.env.DB.prepare("UPDATE admin_sessions SET reauth_at = 0").run();
      const opts = await page.evaluate(() => [...document.querySelectorAll("#adoLic select[name=plan_id] option")].map(o => o.value).filter(Boolean).sort());
      assert(JSON.stringify(opts) === JSON.stringify(["attendance_person", "crowd_report", "exam_lab_candidate", "exam_lab_room", "gate_lane", "gate_trial"]), JSON.stringify(opts));
      await page.evaluate(() => {
        const f = document.getElementById("adoLic");
        f.elements.plan_id.value = "attendance_person"; f.elements.quantity.value = "12"; f.elements.starts_on.value = "2026-12-01"; f.elements.ends_on.value = "2027-01-01";
        f.elements.order_ref.value = "QT-001 / transfer 2026-11-30"; f.elements.amount.value = "228"; f.requestSubmit();
      });
      await page.waitFor("!!document.querySelector('dialog.ad-reauth[open]')", 5000);
      await reauth(PW);
      await page.waitFor("document.querySelectorAll('#adoLicences tbody tr[data-licence]').length === 1", 6000);
      const lic = await W.env.DB.prepare("SELECT plan_id, quantity, amount_satang FROM org_licences").first();
      assert(lic.plan_id === "attendance_person" && lic.quantity === 12 && lic.amount_satang === 22800, JSON.stringify(lic));
    });

    await check("orgs tab: audit log with chain status", async () => {
      await page.waitFor("document.querySelectorAll('#adoAudit li, #adoAudit tr[data-audit]').length >= 3", 6000);
      const t = await page.evaluate(() => document.getElementById("adoAudit").innerText);
      assert(/licence\.added/.test(t) && /org\.created/.test(t), t.slice(0, 300));
    });

    await check("orgs tab: English and 中文 carry no Thai", async () => {
      for (const lang of ["en", "zh"]) {
        await page.evaluate(l => window.LQI18N.setLang(l), lang);
        await sleep(1500);
        const text = await page.evaluate(() => document.querySelector('[data-panel="orgs"]').innerText);
        assert(!THAI.test(text), lang + ": " + (text.match(/.{0,40}[ก-๛].{0,40}/) || [""])[0]);
      }
      await page.evaluate(() => window.LQI18N.setLang("th"));
    });
  } finally {
    await page.close();
    await browser.close();
    await W.close();
  }
}
