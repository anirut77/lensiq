// tests/e2e/admin-look-salon.e2e.mjs — salon catalogue approval step in the back office (owner decision 2026-11-18;
// docs/BEAUTY-IMAGE-DESIGN.md §4), in a real browser against the real Worker code on an in-memory database (helper from
// admin-setup.e2e.mjs). FIXED TEST SET: written and hash-locked (~/LENSIQ-field/evals/salon-approval/,
// evals-locks/salon-approval.sha256) BEFORE admin-look-salon.js, the salon tab and backend/src/look-salon.js were written.
//   1. owner: the salon tab says the word check is a first step and a person approves; a new entry is saved as pending and
//      is not in the public catalogue
//   2. a procedure word (TH / EN / ZH) is refused with a message on the form; nothing is saved
//   3. owner approves -> public; an edit sends it back to pending (off the public catalogue) and it needs approval again
//   4. reject asks for a reason from a fixed list (no free-text box); the history lists each step without the salon's text
//   5. a LENSIQ admin account (default config) sees only the salon tab, can add an entry, sees no approve button, and the
//      Worker refuses a forced approve (403)
//   6. phone widths 320 / 360 / 390 (no sideways scroll) and English / 中文 chrome of the salon tab (no Thai left except the salon's text)
import { assert } from "./cdp.mjs";
import { mobileCheck, sleep } from "./zones-lib.mjs";
import { startWorker, TOKEN, PW } from "./admin-setup.e2e.mjs";

const THAI = /[ก-ฺเ-๛]/;
const ACC_PW = "salon admin passphrase for e2e 2026";

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
function noErrors(page) {
  const errs = page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && /\/admin\/api\//.test(e.url || "") && /status of 4(00|01|03|04|09|22)\b/.test(e.text || "")));
  assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
}
const publicList = async W => {
  const r = await fetch(W.origin + "/v1/look/salon/catalog");
  assert(r.status === 200, "public catalogue status " + r.status);
  return (await r.json()).entries.map(e => e.id);
};
const rowStatus = (page, id) => page.evaluate(id => { const r = document.querySelector(`#lsList .ls-row[data-id="${id}"] .ls-status`); return r ? r.getAttribute("data-status") : null; }, id);
async function openTab(page) {
  await page.evaluate(() => document.querySelector("[data-tab=lsalon]").click());
  await page.waitFor("!document.querySelector('[data-panel=lsalon]').hidden && !!document.getElementById('lsList')", 8000);
  await sleep(400);
}
/** fills the entry form (opened with #lsNew or an edit button) and saves */
async function fill(page, v) {
  await page.waitFor("!document.getElementById('lsEdit').hidden", 5000);
  await page.evaluate(v => {
    const f = document.getElementById("lsForm");
    if (v.kind) { f.kind.value = v.kind; f.kind.dispatchEvent(new Event("change", { bubbles: true })); }
    for (const [k, x] of Object.entries(v)) {
      if (k === "kind") continue;
      const el = f.elements[k];
      if (!el) throw new Error("no field " + k);
      if (el.type === "checkbox") el.checked = !!x; else el.value = x;
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    document.getElementById("lsSave").click();
  }, v);
}

export default async function ({ launch, check, repo }) {
  const browser = await launch();
  const W = await startWorker(repo, { vars: { LOOK_SALON: "on" } });
  const owner = await browser.newPage(null, { isolated: true });
  const S = {};
  try {
    await check("1. salon tab: lint note shown; a new entry is pending and not public", async () => {
      S.secret = await ownerFirstRun(owner, W);
      await openTab(owner);
      const note = await owner.evaluate(() => { const e = document.querySelector("[data-i18n='ls.lintNote']"); return e && !e.closest("[hidden]") ? e.innerText : ""; });
      assert(note.length > 20, "lint note shown: " + note);
      await owner.evaluate(() => document.getElementById("lsNew").click());
      await fill(owner, { kind: "brow", name_th: "ทรงโค้งนุ่ม", name_en: "Soft arch", name_zh: "柔和弯眉", desc_th: "ทรงคิ้วโค้งปลายยกเล็กน้อย", card: "brow-arch", rights_ok: true });
      await owner.waitFor("document.querySelectorAll('#lsList .ls-row').length === 1", 8000);
      S.id = await owner.evaluate(() => document.querySelector("#lsList .ls-row").getAttribute("data-id"));
      assert(await rowStatus(owner, S.id) === "pending", "pending");
      assert((await publicList(W)).length === 0, "pending is not public");
      noErrors(owner);
    });

    await check("2. procedure words (TH / EN / ZH) are refused on the form; nothing saved", async () => {
      for (const [field, t] of [["name_th", "สักคิ้ว 6 มิติ"], ["name_en", "Microblading soft arch"], ["name_zh", "半永久眉"]]) {
        await owner.evaluate(() => document.getElementById("lsNew").click());
        await fill(owner, { kind: "brow", name_th: "ทรงตรง", [field]: t, card: "brow-define", rights_ok: true });
        await owner.waitFor("!document.getElementById('lsErr').hidden && document.getElementById('lsErr').textContent.length > 5", 8000);
        const n = (await W.env.DB.prepare("SELECT COUNT(*) AS n FROM look_salon_entries").first()).n;
        assert(n === 1, t + ": nothing saved (" + n + ")");
        await owner.evaluate(() => document.getElementById("lsCancel").click());
      }
      // the rights tick is required
      await owner.evaluate(() => document.getElementById("lsNew").click());
      await fill(owner, { kind: "brow", name_th: "ทรงตรง", card: "brow-define", rights_ok: false });
      await owner.waitFor("!document.getElementById('lsErr').hidden", 8000);
      await owner.evaluate(() => document.getElementById("lsCancel").click());
      noErrors(owner);
    });

    await check("3. approve -> public; an edit returns it to pending and needs approval again", async () => {
      await owner.evaluate(id => document.querySelector(`#lsList .ls-row[data-id="${id}"] button[data-act=approve]`).click(), S.id);
      await owner.waitFor(`(document.querySelector('#lsList .ls-row[data-id="${S.id}"] .ls-status') || {}).getAttribute && document.querySelector('#lsList .ls-row[data-id="${S.id}"] .ls-status').getAttribute('data-status') === 'approved'`, 8000);
      assert((await publicList(W)).includes(S.id), "public after approval");
      await owner.evaluate(id => document.querySelector(`#lsList .ls-row[data-id="${id}"] button[data-act=edit]`).click(), S.id);
      await fill(owner, { name_en: "Soft arch, natural" });
      await owner.waitFor(`document.querySelector('#lsList .ls-row[data-id="${S.id}"] .ls-status').getAttribute('data-status') === 'pending'`, 8000);
      assert(!(await publicList(W)).includes(S.id), "off the public catalogue after the edit");
      assert(await owner.evaluate(id => !!document.querySelector(`#lsList .ls-row[data-id="${id}"] button[data-act=approve]`), S.id), "approve button again");
      await owner.evaluate(id => document.querySelector(`#lsList .ls-row[data-id="${id}"] button[data-act=approve]`).click(), S.id);
      await owner.waitFor(`document.querySelector('#lsList .ls-row[data-id="${S.id}"] .ls-status').getAttribute('data-status') === 'approved'`, 8000);
      const row = await W.env.DB.prepare("SELECT status, version, approved_version FROM look_salon_entries WHERE id = ?1").bind(S.id).first();
      assert(row.status === "approved" && row.version === 2 && row.approved_version === 2, JSON.stringify(row));
      noErrors(owner);
    });

    await check("4. reject with a reason from a fixed list; history without the salon's text", async () => {
      await owner.evaluate(() => document.getElementById("lsNew").click());
      await fill(owner, { kind: "lip", name_th: "ส้มอิฐ", name_en: "Brick orange", code: "BR-07", hex: "#b5523b", rights_ok: true });
      await owner.waitFor("document.querySelectorAll('#lsList .ls-row').length === 2", 8000);
      S.lip = await owner.evaluate(id => [...document.querySelectorAll("#lsList .ls-row")].map(r => r.getAttribute("data-id")).find(x => x !== id), S.id);
      await owner.evaluate(id => document.querySelector(`#lsList .ls-row[data-id="${id}"] button[data-act=reject]`).click(), S.lip);
      await owner.waitFor("!!document.querySelector('#lsRejectDlg[open]')", 5000);
      const dlg = await owner.evaluate(() => {
        const d = document.getElementById("lsRejectDlg");
        return { selects: d.querySelectorAll("select").length, free: d.querySelectorAll("textarea, input:not([type=hidden]), [contenteditable]").length,
          options: [...d.querySelectorAll("select option")].map(o => o.value) };
      });
      assert(dlg.selects === 1 && dlg.free === 0 && dlg.options.includes("wording"), JSON.stringify(dlg));
      await owner.evaluate(() => { const d = document.getElementById("lsRejectDlg"); d.querySelector("select").value = "rights"; d.querySelector("button[value=ok]").click(); });
      await owner.waitFor(`document.querySelector('#lsList .ls-row[data-id="${S.lip}"] .ls-status').getAttribute('data-status') === 'rejected'`, 8000);
      await owner.evaluate(id => document.querySelector(`#lsList .ls-row[data-id="${id}"] button[data-act=history]`).click(), S.id);
      await owner.waitFor("document.querySelectorAll('#lsHist li').length >= 4", 8000);
      const hist = await owner.evaluate(() => document.getElementById("lsHist").innerText);
      assert(!/Soft arch|ทรงโค้งนุ่ม|柔和弯眉/.test(hist), "history holds no salon text: " + hist);
      const audit = (await W.env.DB.prepare("SELECT detail FROM audit_log WHERE action LIKE 'look_salon.%'").all()).results.map(r => r.detail || "").join("\n");
      assert(!/Soft arch|ทรงโค้งนุ่ม|ส้มอิฐ|Brick orange|BR-07|Microblading|สักคิ้ว|半永久/.test(audit), "audit holds no salon text");
      noErrors(owner);
    });

    await check("5. LENSIQ admin (default config): only the salon tab, adds an entry, no approve button, forced approve -> 403", async () => {
      await owner.evaluate(() => document.querySelector("[data-tab=security]").click());
      await owner.waitFor("!!document.getElementById('arCard') && !document.getElementById('arCard').hidden", 8000);
      await owner.evaluate(() => { const f = document.getElementById("arForm"); f.username.value = "lqadmin"; f.role.value = "lensiq_admin"; document.getElementById("arCreate").click(); });
      await answerReauth(owner, W, S.secret);
      await owner.waitFor("/#rsetup=/.test((document.getElementById('arLink') || {}).value || '')", 10000);
      const link = await owner.evaluate(() => document.getElementById("arLink").value);
      const adm = await browser.newPage(null, { isolated: true });
      try {
        await adm.goto(link);
        await adm.waitFor("!document.getElementById('adRSetup').hidden", 8000);
        await adm.evaluate(pw => { const f = document.getElementById("adRSetupForm"); f.password.value = pw; f.password2.value = pw; f.requestSubmit(); }, ACC_PW);
        await adm.waitFor("!!document.getElementById('adRSetupKey').getAttribute('data-raw')", 10000);
        const sec = await adm.evaluate(() => document.getElementById("adRSetupKey").getAttribute("data-raw"));
        await adm.evaluate(c => { const f = document.getElementById("adRSetupTotpForm"); f.code.value = c; f.requestSubmit(); }, await W.totp(sec));
        await adm.waitFor("!document.getElementById('adLogin').hidden", 10000);
        await W.env.DB.prepare("UPDATE admin_reviewers SET totp_last_step = 0").run();
        const code = await W.totp(sec);
        await adm.evaluate((pw, c) => { const f = document.getElementById("adLoginForm"); f.password.value = pw; f.totp.value = c; f.requestSubmit(); }, ACC_PW, code);
        await adm.waitFor("!document.getElementById('adApp').hidden", 10000);
        const tabs = await adm.evaluate(() => [...document.querySelectorAll(".ad-tabs [role=tab]")].filter(b => !b.hidden && b.getBoundingClientRect().width > 0).map(b => b.getAttribute("data-tab")));
        assert(tabs.join(",") === "lsalon", "only the salon tab: " + tabs.join(","));
        await adm.waitFor("!document.querySelector('[data-panel=lsalon]').hidden && document.querySelectorAll('#lsList .ls-row').length === 2", 8000);
        await adm.evaluate(() => document.getElementById("lsNew").click());
        await fill(adm, { kind: "liner", name_th: "อายไลเนอร์หางสั้น", style: "wing-short", rights_ok: true });
        await adm.waitFor("document.querySelectorAll('#lsList .ls-row').length === 3", 8000);
        const btns = await adm.evaluate(() => document.querySelectorAll("#lsList button[data-act=approve]").length);
        assert(btns === 0, "no approve button for a LENSIQ admin by default: " + btns);
        const id = await adm.evaluate(() => [...document.querySelectorAll("#lsList .ls-row")].find(r => r.querySelector(".ls-status").getAttribute("data-status") === "pending").getAttribute("data-id"));
        // the same account through the API (bearer sign-in): the Worker refuses the approval itself
        await W.env.DB.prepare("UPDATE admin_reviewers SET totp_last_step = 0").run();
        const lr = await W.api("/login", { method: "POST", body: { username: "lqadmin", password: ACC_PW, totp: await W.totp(sec), mode: "bearer" } });
        assert(lr.status === 200, "bearer sign-in " + lr.status);
        const tok = (await lr.json()).token;
        const fr = await W.api("/look-salon/entries/" + id + "/approve", { method: "POST", body: { version: 1 }, headers: { Authorization: "Bearer " + tok } });
        const forced = fr.status, fj = await fr.json();
        assert(fj.code === "approver_not_allowed", JSON.stringify(fj));
        assert(forced === 403, "forced approve refused: " + forced);
        assert((await W.env.DB.prepare("SELECT status FROM look_salon_entries WHERE id = ?1").bind(id).first()).status === "pending");
        noErrors(adm);
      } finally { await adm.close(); }
    });

    await check("6. phone widths 320 / 360 / 390 and English / 中文 chrome of the salon tab", async () => {
      await owner.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await openTab(owner);
      await owner.evaluate(() => document.getElementById("lsNew").click());
      await owner.waitFor("!document.getElementById('lsEdit').hidden", 5000);
      await mobileCheck(owner);
      for (const l of ["en", "zh"]) {
        await owner.evaluate(l => { const s = document.getElementById("adLang"); s.value = l; s.dispatchEvent(new Event("change")); }, l);
        await owner.waitFor(`window.LQI18N.lang === ${JSON.stringify(l)}`, 8000);
        await sleep(500);
        const t = await owner.evaluate(() => {
          const v = document.querySelector("[data-panel=lsalon]").cloneNode(true);
          for (const x of v.querySelectorAll(".ls-name, [lang], textarea, input, #lsHist")) x.remove();
          return v.innerText;
        });
        assert(!THAI.test(t), l + ": Thai left in the salon tab: " + (t.match(/[^\n]*[ก-ฺเ-๛][^\n]*/) || [])[0]);
      }
      noErrors(owner);
    });
  } finally {
    await owner.close();
    await W.close();
    await browser.close();
  }
}
