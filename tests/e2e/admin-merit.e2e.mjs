// tests/e2e/admin-merit.e2e.mjs — "Belief guidance" section of the admin page (Merit MVP, owner order 2026-11-12), in a
// real browser against the real Worker code on an in-memory database (helper from admin-setup.e2e.mjs). FIXED TEST SET:
// written and hash-locked (~/LENSIQ-field/evals/merit/locked.sha256) BEFORE the admin section was written.
//   1. the merit tab lists the seeded items, each sample clearly marked
//   2. creating an item through the form (TH/EN/ZH texts, type, tradition, keys from a fixed picker) stores it and the
//      public guidance shows it; promise / price wording is refused with a plain message naming the field; nothing stored
//   3. hide / show; delete asks for the password again (re-auth) and the audit log has one row per write
//   4. the interest form card says the form is OFF and why (legal review first)
//   5. phone widths 320 / 360 / 390; English / 中文 for the section chrome (content cells marked lang are excluded)
import { assert } from "./cdp.mjs";
import { mobileCheck, sleep } from "./zones-lib.mjs";
import { startWorker, TOKEN, PW } from "./admin-setup.e2e.mjs";

const THAI = /[ก-ฺเ-๛]/;
const rowStatus = (id, st) =>
  `(() => { const r = document.querySelector('#amList .am-row[data-id=${JSON.stringify(id)}]'); return !!r && r.getAttribute("data-status") === ${JSON.stringify(st)}; })()`;

function noErrors(page) {
  const errs = page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && /\/admin\/api\//.test(e.url || "") && /status of 4(00|01|03|04)\b/.test(e.text || "")));
  assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
}

export default async function ({ launch, check, repo }) {
  const browser = await launch();
  const W = await startWorker(repo);
  const page = await browser.newPage(null, { isolated: true });
  const rows = () => page.evaluate(() => [...document.querySelectorAll("#amList .am-row")].map(r => ({ id: r.getAttribute("data-id"), text: r.innerText,
    sample: !!r.querySelector(".am-sample"), status: r.getAttribute("data-status") })));
  const audit = async action => Number((await W.env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = ?1").bind(action).first()).n);
  try {
    await check("1. merit tab lists the seeded items; every sample is marked", async () => {
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
      await page.evaluate(() => document.querySelector("[data-tab=merit]").click());
      await page.waitFor("document.querySelectorAll('#amList .am-row').length >= 10", 10000);
      const rs = await rows();
      const n = Number((await W.env.DB.prepare("SELECT COUNT(*) AS n FROM merit_items").first()).n);
      assert(rs.length === n, rs.length + " vs " + n);
      assert(rs.every(r => r.sample), "every seeded item is marked as a sample");
      assert(rs.some(r => r.id === "sample-tb-place-1"));
      noErrors(page);
    });

    await check("2. create through the form; promise / price wording refused with a plain message; picker has no free-text key", async () => {
      await page.evaluate(() => document.getElementById("amNew").click());
      const picker = await page.evaluate(() => ({ boxes: document.querySelectorAll("#amKeys input[type=checkbox][name=keys]").length,
        text: document.querySelectorAll("#amKeys input[type=text], #amKeys textarea").length }));
      assert(picker.boxes >= 20 && picker.text === 0, JSON.stringify(picker));
      const fill = extra => page.evaluate(x => {
        const f = document.getElementById("amForm");
        const v = Object.assign({ type: "offering", tradition: "hindu_brahman",
          title_th: "ดอกดาวเรืองและขนม", title_en: "Marigolds and sweets", title_zh: "万寿菊和甜点",
          body_th: "ตามความเชื่อ หลายคนถวายดอกดาวเรือง ขนม และผลไม้ ด้วยใจสงบ แต่งกายสุภาพ",
          body_en: "By custom, many people offer marigolds, sweets and fruit with a calm mind and modest dress.",
          body_zh: "按照习俗，很多人会以平静的心供奉万寿菊、甜点和水果，并穿着得体。" }, x);
        for (const k in v) f.elements[k].value = v[k];
        for (const c of f.querySelectorAll("input[name=keys]")) c.checked = c.value === "any" || c.value === "domain:astro";
        document.getElementById("amSave").click();
      }, extra || {});
      const before = Number((await W.env.DB.prepare("SELECT COUNT(*) AS n FROM merit_items").first()).n);
      await fill({ body_th: "ถวายแล้วการันตีว่าดวงดีขึ้น" });
      await page.waitFor(() => { const e = document.getElementById("amErr"); return !e.hidden && /body\.th|เนื้อหา/.test(e.textContent); }, 8000);
      const msg1 = await page.evaluate(() => document.getElementById("amErr").textContent);
      assert(!/merit_wording|HTTP \d|\{/.test(msg1), "plain message: " + msg1);
      await fill({ body_en: "Offering set price 199 baht" });
      await page.waitFor(() => { const e = document.getElementById("amErr"); return !e.hidden && /body\.en/.test(e.textContent); }, 8000);
      assert(Number((await W.env.DB.prepare("SELECT COUNT(*) AS n FROM merit_items").first()).n) === before, "nothing stored");
      await fill();
      await page.waitFor(`[...document.querySelectorAll("#amList .am-row")].some(r => r.innerText.includes(${JSON.stringify("ดอกดาวเรืองและขนม")}))`, 8000);
      const row = await W.env.DB.prepare("SELECT * FROM merit_items WHERE tradition = 'hindu_brahman' AND type = 'offering' AND sample = 0").first();
      assert(row && JSON.parse(row.title).zh === "万寿菊和甜点" && JSON.parse(row.match_keys).join(",") === "any,domain:astro", JSON.stringify(row));
      const pub = await (await fetch(W.origin + "/v1/merit/guidance")).json();
      assert(pub.items.some(x => x.id === row.id), "shown in the public guidance");
      assert(await audit("merit.item.created") === 1);
      page.newId = row.id;
      noErrors(page);
    });

    await check("3. hide / show; delete asks for the password again; one audit row per write", async () => {
      const act = (id, a) => page.evaluate((id, a) => document.querySelector(`#amList .am-row[data-id="${id}"] button[data-act="${a}"]`).click(), id, a);
      await act(page.newId, "hide");
      await page.waitFor(rowStatus(page.newId, "hidden"), 8000);
      assert((await W.env.DB.prepare("SELECT status FROM merit_items WHERE id = ?1").bind(page.newId).first()).status === "hidden");
      await act(page.newId, "show");
      await page.waitFor(rowStatus(page.newId, "published"), 8000);
      assert(await audit("merit.item.updated") === 2);
      await page.evaluate(() => { window.confirm = () => true; });
      await act(page.newId, "delete");
      await page.waitFor("!!document.querySelector('dialog.ad-reauth[open]')", 8000);
      await W.env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run();
      const code = await W.totp(page.secret);
      await page.evaluate((pw, c) => {
        const d = document.querySelector("dialog.ad-reauth[open]"), ins = d.querySelectorAll("input");
        ins[0].value = pw; ins[1].value = c; d.querySelector("button[value=ok]").click();
      }, PW, code);
      await page.waitFor(`!document.querySelector('#amList .am-row[data-id=${JSON.stringify(page.newId)}]')`, 10000);
      assert(!(await W.env.DB.prepare("SELECT id FROM merit_items WHERE id = ?1").bind(page.newId).first()), "deleted");
      assert(await audit("merit.item.deleted") === 1);
      noErrors(page);
    });

    await check("4. interest form card: OFF, with the reason (legal review first)", async () => {
      const t = await page.evaluate(() => document.getElementById("amInterest").innerText);
      assert(/ปิด/.test(t) && /กฎหมาย|ทนาย/.test(t), t);
      assert(await page.evaluate(() => !document.querySelector("#amInterest input[type=checkbox]")), "no switch on the page: the owner turns it on in the Worker settings after counsel");
    });

    await check("5. phones 320 / 360 / 390; English / 中文 for the section chrome", async () => {
      await mobileCheck(page);
      await page.evaluate(() => document.getElementById("amNew").click());
      await mobileCheck(page);
      for (const l of ["en", "zh"]) {
        await page.evaluate(l => { const s = document.getElementById("adLang"); s.value = l; s.dispatchEvent(new Event("change")); }, l);
        await page.waitFor(`window.LQI18N.lang === ${JSON.stringify(l)}`, 8000);
        await sleep(400);
        const t = await page.evaluate(() => {
          const p = document.querySelector('[data-panel="merit"]').cloneNode(true);
          for (const x of p.querySelectorAll("[lang], textarea, input, option[data-content]")) x.remove();
          return p.innerText + " " + document.querySelector("[data-tab=merit]").innerText;
        });
        assert(!THAI.test(t), l + ": Thai left: " + (t.match(/[^\n]*[ก-ฺเ-๛][^\n]*/) || [])[0]);
      }
      noErrors(page);
    });
  } finally { await page.close(); await W.close(); await browser.close(); }
}
