// tests/e2e/admin-merit-review.e2e.mjs — Merit reviewer account and review queue on the admin page (owner decision
// 2026-11-12), in a real browser against the real Worker code on an in-memory database (helper from admin-setup.e2e.mjs).
// FIXED TEST SET: written and hash-locked (~/LENSIQ-field/evals/merit/locked.sha256) BEFORE the feature was written.
//   1. the owner creates a reviewer in the Security tab (password asked again) and gets a one-time setup link
//   2. the reviewer opens the link on another device: sets a password, scans / types the 2-step key, confirms a code,
//      then signs in with password + code; only the merit tab is shown
//   3. the reviewer reviews a draft: edits the wording, marks it reviewed, approves it; the history shows each step;
//      the item is then served publicly. Rejecting needs a comment; the comment shows in the history
//   4. what the page hides is also refused by the Worker: other admin routes answer 403 for the reviewer
//   5. the owner disables the reviewer: the reviewer's next action lands on the sign-in screen
//   6. phone widths 320 / 360 / 390; English / 中文 on the setup screen and the review view (no Thai left in the chrome)
import { assert } from "./cdp.mjs";
import { mobileCheck, sleep } from "./zones-lib.mjs";
import { startWorker, TOKEN, PW } from "./admin-setup.e2e.mjs";

const THAI = /[ก-ฺเ-๛]/;
const REV_PW = "reviewer passphrase for e2e 2026";
const tri = (th, en, zh) => JSON.stringify({ th, en, zh });

async function ownerFirstRun(page, W) {
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
  return secret;
}
async function answerReauth(page, W, secret) {
  await page.waitFor("!!document.querySelector('dialog.ad-reauth[open]')", 8000);
  await W.env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run();
  const code = await W.totp(secret);
  await page.evaluate((pw, c) => {
    const d = document.querySelector("dialog.ad-reauth[open]"), ins = d.querySelectorAll("input");
    ins[0].value = pw; ins[1].value = c; d.querySelector("button[value=ok]").click();
  }, PW, code);
}
const insertDraft = (W, id, n) => W.env.DB.prepare("INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) " +
  "VALUES (?1, 'offering', 'thai_buddhist', ?2, ?3, NULL, NULL, '[\"any\"]', 0, 'draft', 0, 1, 1)")
  .bind(id, tri("ร่างที่ " + n, "Draft " + n, "草稿 " + n), tri("ตามธรรมเนียม หลายคนถวายดอกไม้ด้วยใจสงบ", "By tradition, people offer flowers calmly.", "按照传统，人们平静地供奉鲜花。")).run();
const statusOf = async (W, id) => (await W.env.DB.prepare("SELECT status FROM merit_items WHERE id = ?1").bind(id).first()).status;
function noErrors(page) {
  const errs = page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && /\/admin\/api\//.test(e.url || "") && /status of 4(00|01|03|04|09)\b/.test(e.text || "")));
  assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
}

export default async function ({ launch, check, repo }) {
  const browser = await launch();
  const W = await startWorker(repo);
  const owner = await browser.newPage(null, { isolated: true });
  const rev = await browser.newPage(null, { isolated: true });
  const S = {};
  try {
    await check("1. owner creates a reviewer (password asked again) and gets a one-time setup link", async () => {
      S.ownerSecret = await ownerFirstRun(owner, W);
      await owner.evaluate(() => document.querySelector("[data-tab=security]").click());
      await owner.waitFor("!!document.getElementById('arCard') && !document.getElementById('arCard').hidden", 8000);
      await owner.evaluate(() => { const f = document.getElementById("arForm"); f.username.value = "rev1"; document.getElementById("arCreate").click(); });
      await answerReauth(owner, W, S.ownerSecret);
      await owner.waitFor("/#rsetup=/.test((document.getElementById('arLink') || {}).value || (document.getElementById('arLink') || {}).textContent || '')", 10000);
      S.link = await owner.evaluate(() => { const e = document.getElementById("arLink"); return e.value || e.textContent; });
      assert(S.link.startsWith(W.origin + "/admin#rsetup="), S.link);
      await owner.waitFor("[...document.querySelectorAll('#arList .ar-row')].some(r => /rev1/.test(r.innerText))", 8000);
      const row = await W.env.DB.prepare("SELECT status FROM admin_reviewers WHERE username = 'rev1'").first();
      assert(row && row.status === "pending");
      noErrors(owner);
    });

    await check("2. reviewer: setup link -> own password -> 2-step -> sign in; only the merit tab", async () => {
      await rev.goto(S.link);
      await rev.waitFor("!document.getElementById('adRSetup').hidden", 8000);
      await rev.evaluate(pw => { const f = document.getElementById("adRSetupForm"); f.password.value = pw; f.password2.value = pw; f.requestSubmit(); }, REV_PW);
      await rev.waitFor("!!document.getElementById('adRSetupKey').getAttribute('data-raw')", 10000);
      S.revSecret = await rev.evaluate(() => document.getElementById("adRSetupKey").getAttribute("data-raw"));
      assert(await rev.evaluate(() => !!document.querySelector("#adRSetupQr img")), "QR drawn on the device");
      await rev.evaluate(c => { const f = document.getElementById("adRSetupTotpForm"); f.code.value = c; f.requestSubmit(); }, await W.totp(S.revSecret));
      await rev.waitFor("!document.getElementById('adLogin').hidden", 10000);
      assert(await rev.evaluate(() => document.getElementById("adLoginForm").username.value) === "rev1", "username filled in");
      assert(await rev.evaluate(() => !/rsetup/.test(location.hash)), "the setup code is removed from the address bar");
      await W.env.DB.prepare("UPDATE admin_reviewers SET totp_last_step = 0").run();
      const code = await W.totp(S.revSecret);
      await rev.evaluate((pw, c) => { const f = document.getElementById("adLoginForm"); f.password.value = pw; f.totp.value = c; f.requestSubmit(); }, REV_PW, code);
      await rev.waitFor("!document.getElementById('adApp').hidden", 10000);
      const tabs = await rev.evaluate(() => [...document.querySelectorAll(".ad-tabs [role=tab]")].filter(b => !b.hidden && b.getBoundingClientRect().width > 0).map(b => b.getAttribute("data-tab")));
      assert(tabs.join(",") === "merit", "only the merit tab: " + tabs.join(","));
      assert(await rev.evaluate(() => !document.querySelector('[data-panel="merit"]').hidden), "merit panel open");
      assert(await rev.evaluate(() => { const b = document.getElementById("amImport"); return !b || !!b.closest("[hidden]") || b.getBoundingClientRect().width === 0; }), "no import for a reviewer");
      noErrors(rev);
    });

    await check("3. review: edit, mark reviewed, approve -> served; reject needs a comment; history shows each step", async () => {
      await insertDraft(W, "mi-e2edraft0001", 1);
      await insertDraft(W, "mi-e2edraft0002", 2);
      await rev.evaluate(() => { const s = document.getElementById("amFilter"); s.value = "draft"; s.dispatchEvent(new Event("change", { bubbles: true })); });
      await rev.waitFor("document.querySelectorAll('#amList .am-row').length === 2", 8000);
      const view = id => rev.evaluate(id => document.querySelector(`#amList .am-row[data-id="${id}"] button[data-act="view"]`).click(), id);
      await view("mi-e2edraft0001");
      await rev.waitFor("!document.getElementById('amView').hidden && /draft|ร่าง/i.test(document.getElementById('amViewStatus').textContent)", 8000);
      // edit the wording through the edit form
      await rev.evaluate(() => document.querySelector("#amView button[data-act=edit]").click());
      await rev.waitFor("!document.getElementById('amEdit').hidden", 5000);
      await rev.evaluate(() => { const f = document.getElementById("amForm"); f.body_en.value = "By tradition, many people offer fresh flowers calmly."; document.getElementById("amSave").click(); });
      await rev.waitFor("document.getElementById('amEdit').hidden", 8000);
      const b = JSON.parse((await W.env.DB.prepare("SELECT body FROM merit_items WHERE id = 'mi-e2edraft0001'").first()).body);
      assert(b.en === "By tradition, many people offer fresh flowers calmly.", JSON.stringify(b));
      const noStatus = await rev.evaluate(() => { const s = document.querySelector("#amForm select[name=status]"); return !s || !!s.closest("[hidden]"); });
      assert(noStatus, "no status choice for a reviewer");
      await view("mi-e2edraft0001");
      await rev.waitFor("!document.getElementById('amView').hidden", 5000);
      await rev.evaluate(() => document.querySelector("#amView button[data-review=reviewed]").click());
      await sleep(800);
      assert(await statusOf(W, "mi-e2edraft0001") === "reviewed");
      await view("mi-e2edraft0001");
      await rev.waitFor("!!document.querySelector('#amView button[data-review=approve]')", 5000);
      await rev.evaluate(() => document.querySelector("#amView button[data-review=approve]").click());
      await sleep(800);
      assert(await statusOf(W, "mi-e2edraft0001") === "published");
      const pub = await (await fetch(W.origin + "/v1/merit/guidance")).json();
      assert(pub.items.some(x => x.id === "mi-e2edraft0001"), "served after approval");
      await view("mi-e2edraft0001");
      await rev.waitFor("document.querySelectorAll('#amHistory li').length >= 3", 8000);
      const hist = await rev.evaluate(() => [...document.querySelectorAll("#amHistory li")].map(l => l.innerText).join("\n"));
      assert(/rev1/.test(hist), "who: " + hist);
      // reject without and with a comment
      await view("mi-e2edraft0002");
      await rev.waitFor("!!document.querySelector('#amView button[data-review=reject]')", 5000);
      await rev.evaluate(() => { document.getElementById("amComment").value = ""; document.querySelector("#amView button[data-review=reject]").click(); });
      await rev.waitFor("!document.getElementById('amViewErr').hidden && document.getElementById('amViewErr').textContent.length > 3", 5000);
      assert(await statusOf(W, "mi-e2edraft0002") === "draft", "not rejected without a comment");
      await rev.evaluate(() => { document.getElementById("amComment").value = "ขอแหล่งอ้างอิงเพิ่ม"; document.querySelector("#amView button[data-review=reject]").click(); });
      await sleep(800);
      assert(await statusOf(W, "mi-e2edraft0002") === "rejected");
      await view("mi-e2edraft0002");
      await rev.waitFor("/ขอแหล่งอ้างอิงเพิ่ม/.test(document.getElementById('amHistory').innerText)", 8000);
      noErrors(rev);
    });

    await check("4. the Worker refuses what the page hides (403 for other admin routes)", async () => {
      const r = await rev.evaluate(async () => {
        const out = {};
        for (const p of ["/admin/api/ai", "/admin/api/billing", "/admin/api/audit", "/admin/api/reviewers", "/admin/api/merit/interest"]) out[p] = (await fetch(p, { credentials: "include" })).status;
        return out;
      });
      assert(Object.values(r).every(s => s === 403), JSON.stringify(r));
    });

    await check("5. owner disables the reviewer: the reviewer's next action lands on the sign-in screen", async () => {
      await owner.evaluate(() => { window.confirm = () => true; });
      await owner.evaluate(() => document.querySelector("#arList .ar-row button[data-act=disable]").click());
      // the owner's 5-min re-auth window may still be open; answer the dialog if it is asked
      await sleep(600);
      if (await owner.evaluate(() => !!document.querySelector("dialog.ad-reauth[open]"))) await answerReauth(owner, W, S.ownerSecret);
      await owner.waitFor("[...document.querySelectorAll('#arList .ar-row')].some(r => r.getAttribute('data-status') === 'disabled')", 8000);
      await rev.evaluate(() => { const s = document.getElementById("amFilter"); s.value = "all"; s.dispatchEvent(new Event("change", { bubbles: true })); });
      await rev.waitFor("!document.getElementById('adLogin').hidden", 8000);
    });

    await check("6. phones 320 / 360 / 390 and English / 中文: setup screen and review view", async () => {
      const p = await browser.newPage(null, { isolated: true });
      // a fresh reviewer link for the screen checks
      await W.env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run();
      await owner.evaluate(() => { const f = document.getElementById("arForm"); f.username.value = "rev2"; document.getElementById("arCreate").click(); });
      await sleep(600);
      if (await owner.evaluate(() => !!document.querySelector("dialog.ad-reauth[open]"))) await answerReauth(owner, W, S.ownerSecret);
      await owner.waitFor("/#rsetup=/.test((document.getElementById('arLink') || {}).value || '') && (document.getElementById('arLink').value !== " + JSON.stringify(S.link) + ")", 10000);
      const link2 = await owner.evaluate(() => document.getElementById("arLink").value);
      await p.goto(link2);
      await p.waitFor("!document.getElementById('adRSetup').hidden", 8000);
      await mobileCheck(p);
      for (const l of ["en", "zh"]) {
        await p.evaluate(l => { const s = document.getElementById("adLang"); s.value = l; s.dispatchEvent(new Event("change")); }, l);
        await p.waitFor(`window.LQI18N.lang === ${JSON.stringify(l)}`, 8000);
        await sleep(300);
        const t = await p.evaluate(() => document.getElementById("adRSetup").innerText);
        assert(!THAI.test(t), l + ": Thai left on the setup screen: " + (t.match(/[^\n]*[ก-ฺเ-๛][^\n]*/) || [])[0]);
      }
      await p.close();
      // the review view in the owner's page (owner can review too)
      await owner.evaluate(() => document.querySelector("[data-tab=merit]").click());
      await owner.waitFor("document.querySelectorAll('#amList .am-row').length > 0", 8000);
      await owner.evaluate(() => document.querySelector('#amList .am-row[data-id="mi-e2edraft0002"] button[data-act="view"]').click());
      await owner.waitFor("!document.getElementById('amView').hidden", 5000);
      await mobileCheck(owner);
      for (const l of ["en", "zh"]) {
        await owner.evaluate(l => { const s = document.getElementById("adLang"); s.value = l; s.dispatchEvent(new Event("change")); }, l);
        await owner.waitFor(`window.LQI18N.lang === ${JSON.stringify(l)}`, 8000);
        await sleep(400);
        const t = await owner.evaluate(() => {
          const v = document.getElementById("amView").cloneNode(true);
          for (const x of v.querySelectorAll("[lang], textarea, input, .am-comment-text")) x.remove();
          return v.innerText;
        });
        assert(!THAI.test(t), l + ": Thai left in the review view: " + (t.match(/[^\n]*[ก-ฺเ-๛][^\n]*/) || [])[0]);
      }
    });
  } finally { await owner.close(); await rev.close(); await W.close(); await browser.close(); }
}
