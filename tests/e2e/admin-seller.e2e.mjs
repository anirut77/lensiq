// tests/e2e/admin-seller.e2e.mjs — "ข้อมูลกิจการ" tab of the admin page and the quotation / invoice / receipt documents
// (owner order 2026-11-18), in a real browser against the REAL Worker code on an in-memory database (startWorker from
// admin-setup.e2e.mjs). FIXED TEST SET, hash-locked in evals-locks/seller-settings.sha256 before the tab was written.
//   1. owner with 2-step verification: the tab shows "not filled in" and the list of missing fields
//   2. a draft quotation: the preview shows the "ยังไม่ได้กรอกข้อมูลกิจการ" block; "issue" is refused with a plain message;
//      the PDF printed from the document (Chrome print-to-PDF) carries the block in TH / EN / ZH
//   3. saving the details asks for the password AND a 6-digit code (step-up dialog); a wrong code stores nothing
//   4. after saving: tax ID, bank account and phone are shown masked (last 4); the full values appear nowhere in the tab,
//      in storage or in any request URL
//   5. filled: the PDF of each document (quotation, invoice, receipt) contains every seller field; issuing gives a number
//   6. phones 320 / 360 / 390 and English / 中文: the tab carries no Thai
// Synthetic values only.
import { assert } from "./cdp.mjs";
import { mobileCheck, sleep } from "./zones-lib.mjs";
import { startWorker, TOKEN, PW } from "./admin-setup.e2e.mjs";

const THAI = /[ก-ฺเ-๛]/;
const V = {
  legal_name: "Thotsop Test Co., Ltd.", tax_id: "0000000000000", address: "1 Test Road, Bangkok 10000", branch: "Head office",
  bank_name: "Test Bank", bank_account_name: "Thotsop Test", bank_account_no: "0001112223", contact_phone: "0200000000",
  contact_email: "billing@seller.example", contact_line: "@sellertest", doc_prefix: "TS"
};

function noErrors(page) {
  const errs = page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && /\/admin\/api\//.test(e.url || "") && /status of 4(00|01|03|09)\b/.test(e.text || "")));
  assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
}

export default async function ({ launch, check, repo, base }) {
  const browser = await launch();
  const outbound = [];
  const W = await startWorker(repo, { deps: { fetch: async url => { outbound.push(String(url)); throw new Error("no network"); } } });
  const page = await browser.newPage(null, { isolated: true });
  const panel = () => page.evaluate(() => document.querySelector('[data-panel="seller"]').innerText);
  /** HTML of a document via the owner's own session (same request the tab makes) */
  const docHtml = id => page.evaluate(async id => {
    const r = await window.LQAdminKit.call("/seller/docs/" + id, { raw: true });
    return r.text();
  }, id);
  /** prints the HTML with Chrome's print-to-PDF and returns the text pdf.js reads from the PDF */
  async function pdfText(html) {
    const p = await browser.newPage(null, { isolated: true });
    try {
      await p.goto("about:blank");
      const { frameTree } = await p.send("Page.getFrameTree");
      await p.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
      await sleep(300);
      const { data } = await p.send("Page.printToPDF", { paperWidth: 8.27, paperHeight: 11.69, printBackground: true });
      const r = await browser.newPage(null, { isolated: true });
      try {
        await r.goto(base + "/converter.html");
        await r.waitFor("typeof pdfjsLib !== 'undefined'", 10000);
        return await r.evaluate(async b64 => {
          const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const doc = await pdfjsLib.getDocument({ data: bin }).promise;
          let out = "";
          for (let i = 1; i <= doc.numPages; i++) out += (await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).join(" ") + "\n";
          return out;
        }, data);
      } finally { await r.close(); }
    } finally { await p.close(); }
  }
  // amendment A2 (re-lock 2026-11-18, test setup only): pdf.js reads Chrome's PDF without Thai above / below marks
  // (ั ิ ี ึ ื ุ ู ฺ ็ ่ ้ ๊ ๋ ์ ํ come back as U+0000: "ยังไม่ได้" reads "ย\0งไม\0ได\0"), so both sides drop those marks, U+0000
  // and spaces before comparing
  const squash = s => String(s).replace(/[\u0000\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, "").replace(/\s+/g, "");
  const reauth = async (totp, pw = PW) => {
    await page.waitFor("!!document.querySelector('dialog.ad-reauth[open]')", 6000);
    await page.evaluate((pw, c) => {
      const d = document.querySelector("dialog.ad-reauth[open]");
      const ins = d.querySelectorAll("input");
      ins[0].value = pw; ins[1].value = c;
      d.querySelector("button[value=ok]").click();
    }, pw, totp);
  };
  let draftId = "";
  try {
    await check("seller tab: owner with 2-step verification sees 'not filled in' and the missing fields", async () => {
      await page.goto(W.origin + "/admin");
      await page.waitFor("!document.getElementById('adBoot').hidden", 8000);
      await page.evaluate((t, pw) => {
        const f = document.getElementById("adBootForm");
        f.token.value = t; f.username.value = "owner"; f.password.value = pw; f.password2.value = pw; f.requestSubmit();
      }, TOKEN, PW);
      await page.waitFor("!!document.getElementById('adTwoKey').getAttribute('data-raw')", 15000);
      page.secret = await page.evaluate(() => document.getElementById("adTwoKey").getAttribute("data-raw"));
      await page.evaluate(c => { const f = document.getElementById("adTwoForm"); f.code.value = c; f.requestSubmit(); }, await W.totp(page.secret));
      await page.waitFor("!document.getElementById('adCodes').hidden", 10000);
      await page.evaluate(() => { document.getElementById("adCodesOk").click(); document.getElementById("adCodesDone").click(); });
      await page.waitFor("!document.getElementById('adApp').hidden", 8000);
      await page.evaluate(() => document.querySelector("[data-tab=seller]").click());
      await page.waitFor("!!document.getElementById('adsForm') && !!document.getElementById('adsState').textContent", 8000);
      const t = await panel();
      assert(/ยังไม่ได้กรอกข้อมูลกิจการ/.test(t), t.slice(0, 300));
      noErrors(page);
    });

    await check("draft quotation: preview shows the missing-data block, issuing is refused before any step-up, the PDF carries the block in TH / EN / ZH", async () => {
      await page.evaluate(() => {
        const f = document.getElementById("adsDocForm");
        f.elements.doc_type.value = "quotation"; f.elements.buyer_name.value = "Buyer Test Co."; f.elements.buyer_address.value = "9 Buyer Road";
        f.elements.line_id.value = "attendance_person"; f.elements.line_qty.value = "12";
        f.requestSubmit();
      });
      await page.waitFor("document.querySelectorAll('#adsDocs [data-doc]').length === 1", 8000);
      draftId = await page.evaluate(() => document.querySelector("#adsDocs [data-doc]").getAttribute("data-doc"));
      await page.evaluate(() => document.querySelector("#adsDocs [data-doc] [data-act=preview]").click());
      await page.waitFor("!!document.getElementById('adsPreview') && /ยังไม่ได้กรอกข้อมูลกิจการ/.test((document.getElementById('adsPreview').srcdoc || ''))", 8000);
      await W.env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run();
      await page.evaluate(() => document.querySelector("#adsDocs [data-doc] [data-act=issue]").click());
      // refused before any password or code is asked (nothing to confirm): details missing
      await page.waitFor("/ยังไม่ได้กรอกข้อมูลกิจการ|กรอกข้อมูลกิจการให้ครบ/.test(document.getElementById('adMsg').textContent)", 8000);
      const row = await W.env.DB.prepare("SELECT status, number FROM seller_docs WHERE id = ?1").bind(draftId).first();
      assert(row.status === "draft" && row.number == null, JSON.stringify(row));
      const txt = squash(await pdfText(await docHtml(draftId)));
      for (const s of ["ยังไม่ได้กรอกข้อมูลกิจการ", "Businessdetailsnotfilledinyet", "尚未填写商家信息"]) assert(txt.includes(squash(s)), "PDF: " + s + " | " + txt.slice(0, 200));
      noErrors(page);
    });

    await check("save details: the dialog asks for password AND code; a wrong code stores nothing", async () => {
      await page.evaluate(v => {
        const f = document.getElementById("adsForm");
        for (const k in v) f.elements[k].value = v[k];
        f.elements.vat_registered.value = "yes"; f.elements.vat_rate.value = "7";
        f.requestSubmit();
      }, V);
      await page.waitFor("!!document.querySelector('dialog.ad-reauth[open]')", 6000);
      const codeShown = await page.evaluate(() => { const i = document.querySelectorAll("dialog.ad-reauth[open] input"); return i.length === 2 && !i[1].hidden; });
      assert(codeShown, "the step-up dialog asks for the 6-digit code");
      await reauth("000000");
      await page.waitFor("document.getElementById('adMsg').classList.contains('ad-bad')", 6000);
      const n = await W.env.DB.prepare("SELECT COUNT(*) AS n FROM seller_profile WHERE legal_name IS NOT NULL AND legal_name <> ''").first();
      assert(n.n === 0, "nothing stored after a wrong code");
      await W.env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run();
      await page.evaluate(() => document.getElementById("adsForm").requestSubmit());
      await reauth(await W.totp(page.secret));
      await page.waitFor("/ครบแล้ว|complete/i.test(document.getElementById('adsState').textContent)", 8000);
      noErrors(page);
    });

    await check("masked: tax ID, bank account and phone show the last 4 only; full values nowhere in the tab, storage or URLs", async () => {
      const t = await panel();
      const form = await page.evaluate(() => [...document.querySelectorAll("#adsForm input")].map(i => i.value + " " + (i.placeholder || "")).join("\n"));
      for (const [k, last] of [["tax_id", "0000"], ["bank_account_no", "2223"], ["contact_phone", "0000"]]) {
        assert(!t.includes(V[k]) && !form.includes(V[k]), k + " shown in full");
        assert((t + form).includes(last), k + ": last 4 shown");
      }
      const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
      for (const k of ["tax_id", "bank_account_no", "contact_phone", "legal_name", "address"]) assert(!stored.includes(V[k]), k + " in browser storage");
      for (const r of page.requests) for (const k of Object.keys(V)) if (V[k].length > 4) assert(!decodeURIComponent(r.url).includes(V[k]), k + " in a request URL");
      assert(!outbound.length, "no outbound call: " + outbound.join(","));
    });

    await check("filled: the PDF of quotation, invoice and receipt contains every seller field; issuing gives a number", async () => {
      for (const type of ["invoice", "receipt"]) {
        await page.evaluate(type => {
          const f = document.getElementById("adsDocForm");
          f.elements.doc_type.value = type; f.elements.buyer_name.value = "Buyer Test Co."; f.elements.buyer_address.value = "9 Buyer Road";
          f.elements.line_id.value = "gate_village_lane"; f.elements.line_qty.value = "2";
          f.requestSubmit();
        }, type);
      }
      await page.waitFor("document.querySelectorAll('#adsDocs [data-doc]').length === 3", 8000);
      const ids = await page.evaluate(() => [...document.querySelectorAll("#adsDocs [data-doc]")].map(r => r.getAttribute("data-doc")));
      for (const id of ids) {
        const html = await docHtml(id);
        const txt = squash(await pdfText(html));
        const want = /data-doc-type="receipt"/.test(html) ? ["legal_name", "tax_id", "address", "contact_phone", "contact_email", "contact_line"]
          : ["legal_name", "tax_id", "address", "bank_name", "bank_account_name", "bank_account_no", "contact_phone", "contact_email", "contact_line"];
        for (const k of want) assert(txt.includes(squash(V[k])), `PDF ${id}: ${k} missing | ${txt.slice(0, 160)}`);
        assert(!txt.includes(squash("ยังไม่ได้กรอกข้อมูลกิจการ")), "no missing block once filled");
      }
      await W.env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run();
      await page.evaluate(id => document.querySelector(`#adsDocs [data-doc="${id}"] [data-act=issue]`).click(), draftId);
      await reauth(await W.totp(page.secret));
      await page.waitFor(`/TS-QT-000001/.test(document.querySelector('#adsDocs [data-doc="${draftId}"]').innerText)`, 8000);
      noErrors(page);
    });

    await check("phones 320 / 360 / 390 and English / 中文: the seller tab fits and carries no Thai", async () => {
      await mobileCheck(page);
      for (const l of ["en", "zh"]) {
        await page.evaluate(l => { const s = document.getElementById("adLang"); s.value = l; s.dispatchEvent(new Event("change")); }, l);
        await page.waitFor(`window.LQI18N.lang === ${JSON.stringify(l)}`, 8000);
        await sleep(400);
        const t = await page.evaluate(() => {
          const p = document.querySelector('[data-panel="seller"]').cloneNode(true);
          p.querySelectorAll("[data-user-value], iframe, option[data-user-value]").forEach(x => x.remove()); // the owner's own entries are not UI text
          return p.innerText + "\n" + [...p.querySelectorAll("input, select, button")].map(x => (x.placeholder || "") + " " + (x.getAttribute("aria-label") || "")).join("\n");
        });
        assert(!THAI.test(t), l + ": Thai left: " + (t.match(/[^\n]*[ก-ฺเ-๛][^\n]*/) || [])[0]);
      }
      noErrors(page);
    });
  } finally { await page.close(); await W.close(); await browser.close(); }
}
