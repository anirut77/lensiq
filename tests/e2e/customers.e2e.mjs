// tests/e2e/customers.e2e.mjs — WP7: multi-face member chooser (assignUnique, per-label streak, chips).
// Faces come from window.__LQ_FAKE_DET and matches from window.__LQ_FAKE_MATCH (only honoured with ?fakedet on localhost).
import { assert, privacyScan } from "./cdp.mjs";

const D = v => Array.from({ length: 128 }, (_, k) => +(Math.sin(k * v) * 0.1).toFixed(5));
// legacy format (descriptor inline in cx-members): the page migrates it into the encrypted lqv-cx-faces key on load
const NOW = Date.now();
const MEMBERS = [
  { id: "mA", name: "แอน", phone: "0811111111", descriptor: D(1), created: NOW, consentAt: NOW },
  { id: "mB", name: "บอส", phone: "0822222222", descriptor: D(2), created: NOW, consentAt: NOW }
];
const HOOKS = `
  window.__faces = [];
  window.__LQ_FAKE_DET = () => window.__faces.map(f => Object.assign({ score: 0.95 }, f));
  window.__LQ_FAKE_MATCH = d => d && d.who ? { label: d.who, distance: d.dist == null ? 0.3 : d.dist, confident: d.unsure ? false : undefined } : { label: "unknown", distance: 0.9 };
`;
const FACE = (x, size, who, unsure) => ({ x, y: 0.2, w: size, h: size * 1.3, who, unsure });

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    const page = await browser.newPage(null, { initScripts: [fakeCams, HOOKS] });
    await page.goto(`${base}/customers.html?cpu&fakedet`);
    await page.evaluate(m => { localStorage.clear(); localStorage.setItem("cx-members", JSON.stringify(m)); }, MEMBERS);
    await page.reload();
    await page.waitFor(() => /พร้อมใช้งาน/.test(document.querySelector("#engine").textContent), 15000);

    const scan = faces => page.evaluate(f => {
      window.__faces = f;
      document.querySelector("#nextCustomer").click(); // resets the customer and starts scanning
    }, faces);
    const card = () => page.evaluate(() => document.querySelector("#customerCard").textContent);

    await check("1 member + 1 larger non-member: the member is selected", async () => {
      await scan([FACE(0.05, 0.4, null), FACE(0.6, 0.2, "mB")]);
      await page.waitFor(() => /สวัสดีคุณ/.test(document.querySelector("#customerCard").textContent), 6000);
      const c = await card();
      assert(c.includes("สวัสดีคุณบอส"), "selected บอส: " + c.slice(0, 80));
      assert(!c.includes("ลูกค้าใหม่ 👋"), "no new-customer card");
    });

    await check("2 members: 2 chips, clicking one selects that member", async () => {
      await scan([FACE(0.05, 0.3, "mA"), FACE(0.6, 0.25, "mB")]);
      await page.waitFor(() => document.querySelectorAll("#scanStatus button.chip").length === 2, 6000);
      const st = await page.evaluate(() => ({ text: document.querySelector("#scanStatus").textContent, scanning: document.querySelector("#scanToggle").textContent }));
      assert(st.text.includes("พบสมาชิก 2 คน: แอน, บอส"), "chips heading: " + st.text);
      const before = await card();
      assert(!before.includes("สวัสดีคุณ"), "no auto-select with 2 members");
      await page.evaluate(() => document.querySelector('#scanStatus button.chip[data-id="mB"]').click());
      const c = await card();
      assert(c.includes("สวัสดีคุณบอส"), "clicked member selected: " + c.slice(0, 80));
      assert(!(await page.evaluate(() => document.querySelectorAll("#scanStatus button.chip").length)), "chips cleared");
    });

    await check("round 5: one member matched but not confident -> no auto-select, the cashier taps the chip", async () => {
      await scan([FACE(0.3, 0.3, "mA", true)]);
      await page.waitFor(() => document.querySelectorAll("#scanStatus button.chip").length === 1, 6000);
      const st = await page.evaluate(() => document.querySelector("#scanStatus").textContent);
      assert(st.includes("ไม่แน่ใจ") && st.includes("แอน"), "unsure heading: " + st);
      assert(!(await card()).includes("สวัสดีคุณ"), "not selected automatically");
      await page.evaluate(() => document.querySelector('#scanStatus button.chip[data-id="mA"]').click());
      assert((await card()).includes("สวัสดีคุณแอน"), "selected after the tap");
    });

    await check("only non-members: new-customer card", async () => {
      await scan([FACE(0.3, 0.3, null)]);
      await page.waitFor(() => /ลูกค้าใหม่/.test(document.querySelector("#customerCard").textContent), 6000);
    });

    await check("enrollment with 2 faces still shows 'พบหลายใบหน้า...'", async () => {
      await page.evaluate(f => {
        window.__faces = f;
        document.querySelector('.tab[data-t="enroll"]').click();
        const fm = document.querySelector("#enrollForm");
        fm.name.value = "ใหม่"; fm.consent.checked = true; fm.requestSubmit();
      }, [FACE(0.05, 0.3, null), FACE(0.6, 0.3, null)]);
      await page.waitFor(() => document.querySelector("#enrollMsg").textContent.includes("พบหลายใบหน้า"), 5000);
      const n = await page.evaluate(() => JSON.parse(localStorage.getItem("cx-members")).length);
      assert(n === 2, "nobody enrolled: " + n);
    });

    await check("round 10: on-site accuracy check — trials decide auto / ask / none, nothing selected or ordered, pseudonymous export, health pill", async () => {
      await page.evaluate(() => { window.__faces = []; document.querySelector('.tab[data-t="pos"]').click(); });
      const orders0 = await page.evaluate(() => localStorage.getItem("cx-orders"));
      const seen0 = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("cx-members")).map(m => m.lastSeen || 0)));
      await page.evaluate(() => { document.querySelector("#nextCustomer").click(); document.querySelector("#scanToggle").click(); }); // make sure nothing scans
      await page.evaluate(() => document.querySelector("#scPanel .sc-start").click());
      assert(await page.evaluate(() => !!__CX_SC.active && !document.querySelector("#scPanel .sc-trial").hidden), "check active, trial controls shown");
      const trial = async (truth, face, outcome, sid) => {
        await page.evaluate(([t, f, s]) => { window.__faces = f ? [f] : []; const w = document.querySelector("#scPanel .sc-who"); w.value = t; w.dispatchEvent(new Event("change"));
          if (s) document.querySelector("#scPanel .sc-sid").value = String(s); document.querySelector("#scPanel .sc-go").click(); }, [truth, face, sid]);
        const n0 = await page.evaluate(() => __CX_SC.active.trials.length);
        await page.waitFor(`__CX_SC.active.trials.length > ${n0}`, 12000);
        const got = await page.evaluate(() => __CX_SC.active.trials.at(-1));
        assert(got.outcome === outcome, `${truth}: expected ${outcome}, got ${JSON.stringify(got)}`);
        await page.evaluate(() => { window.__faces = []; }); await new Promise(r => setTimeout(r, 400));
      };
      await trial("mA", FACE(0.3, 0.3, "mA"), "auto");
      await trial("mB", FACE(0.3, 0.3, "mB", true), "ask");
      await trial("stranger", FACE(0.3, 0.3, null), "none", 1);
      await trial("stranger", FACE(0.3, 0.3, "mA"), "auto", 2);
      assert(!(await card()).includes("สวัสดีคุณ"), "no customer selected during the check");
      assert(await page.evaluate(() => !document.querySelectorAll("#scanStatus button.chip").length), "no chips during the check");
      const pill = await page.evaluate(() => { const p = document.getElementById("camHealth"); return p && !p.hidden ? p.textContent : null; });
      assert(pill && /ภาพ/.test(pill), "health pill shown: " + pill);
      await page.evaluate(() => document.querySelector("#scPanel .sc-stop").click());
      const last = await page.evaluate(() => JSON.parse(JSON.stringify(__CX_SC.last)));
      assert(last.rep.kind === "customers" && last.rep.verdict === "fail" && last.rep.n.strangerAuto === 1 && last.rep.n.memberAuto === 1 && last.rep.n.memberAsk === 1, "report " + JSON.stringify(last.rep.n));
      assert(last.doc.distinctMembers === 2 && last.doc.distinctStrangers === 2, "distinct people in export: " + last.doc.distinctMembers + "/" + last.doc.distinctStrangers);
      const doc = JSON.stringify(last.doc);
      assert(!/แอน|บอส|0811111111|"mA"|"mB"|descriptor|data:image|base64/.test(doc) && last.doc.trials[0].truth === "m1" && last.doc.trials[2].stranger === "s1", "pseudonyms only: " + doc.slice(0, 300));
      assert(await page.evaluate(() => localStorage.getItem("cx-orders")) === orders0, "no order written");
      assert(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("cx-members")).map(m => m.lastSeen || 0))) === seen0, "lastSeen untouched");
      const hist = await page.evaluate(() => JSON.parse(localStorage.getItem("cx-sitecheck") || "[]"));
      assert(hist.length === 1 && hist[0].verdict === "fail" && typeof hist[0].cam === "string" && hist[0].cam && !("trials" in hist[0]), "history summary: " + JSON.stringify(hist));
      assert(await page.evaluate(() => document.querySelector("#scPanel .sc-state").dataset.s === "fail"), "panel pill state");
    });

    await check("privacy: no images, no /api, unknown faces never stored, no console errors", async () => {
      await privacyScan(page);
      const ms = await page.evaluate(() => JSON.parse(localStorage.getItem("cx-members")));
      assert(ms.length === 2 && ms.every(m => ["mA", "mB"].includes(m.id)), "only consenting members stored");
      // insights.js still reads cx-members {id, created}; descriptors moved to the encrypted vault key
      assert(ms.every(m => !("descriptor" in m) && m.created === NOW), "cx-members has no descriptors, created kept: " + JSON.stringify(ms));
      const env = await page.evaluate(() => JSON.parse(localStorage.getItem("lqv-cx-faces")));
      assert(env && env.enc === "lq1" && env.iv && env.ct && Object.keys(env).length === 3, "faces stored as AES-GCM envelope: " + JSON.stringify(env).slice(0, 80));
      const plain = await page.evaluate(() => Object.keys(localStorage).filter(k => /\[\s*-?0\.\d+(\s*,\s*-?\d*\.?\d+(e-?\d+)?){100,}/.test(localStorage.getItem(k))));
      assert(!plain.length, "no plaintext 128-number arrays in localStorage: " + plain);
      const errs = page.consoleErrors.filter(e => e.kind !== "log");
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
    });

    await check("reload decrypts (members still recognised); retention drops faces unused > N days; wipe removes all faces + key", async () => {
      await page.reload();
      await page.waitFor(() => /พร้อมใช้งาน/.test(document.querySelector("#engine").textContent), 15000);
      await scan([FACE(0.3, 0.3, "mA")]);
      await page.waitFor(() => /สวัสดีคุณแอน/.test(document.querySelector("#customerCard").textContent), 6000);
      // mB last seen 400 days ago -> expired on next load with default 365
      await page.evaluate(() => { const m = JSON.parse(localStorage.getItem("cx-members")); const b = m.find(x => x.id === "mB"); b.created = b.lastSeen = Date.now() - 400 * 864e5; localStorage.setItem("cx-members", JSON.stringify(m)); });
      await page.reload();
      await page.waitFor(() => /พร้อมใช้งาน|ลบข้อมูลใบหน้า/.test(document.querySelector("#engine").textContent), 15000);
      await page.waitFor(() => LQVault.read("lqv-cx-faces").then(r => r.data && Object.keys(r.data.faces).length === 1), 5000);
      const st = await page.evaluate(async () => { const r = await LQVault.read("lqv-cx-faces"); return { ids: Object.keys(r.data.faces).sort(), ms: JSON.parse(localStorage.getItem("cx-members")) }; });
      assert(JSON.stringify(st.ids) === '["mA"]', "only mA keeps a face: " + st.ids);
      assert(st.ms.length === 2 && st.ms.find(m => m.id === "mB").faceDeletedAt, "mB kept as member, face deleted");
      await page.evaluate(() => { window.confirm = () => true; document.querySelector("#wipeFaces").click(); });
      await page.waitFor(() => /ลบข้อมูลใบหน้าทั้งหมดแล้ว/.test(document.querySelector("#privMsg").textContent), 5000);
      const after = await page.evaluate(async () => ({ v: localStorage.getItem("lqv-cx-faces"), ms: JSON.parse(localStorage.getItem("cx-members")),
        keys: await new Promise(res => { const r = indexedDB.open("lensiq-vault"); r.onsuccess = () => { const db = r.result; const q = db.transaction("keys").objectStore("keys").getAllKeys(); q.onsuccess = () => { db.close(); res(q.result); }; }; }) }));
      assert(after.v === null, "vault key removed");
      assert(after.ms.length === 2 && after.ms.every(m => !m.descriptor), "members + history kept");
      assert(!after.keys.includes("face-v1:lqv-cx-faces"), "CryptoKey deleted: " + after.keys);
      const errs = page.consoleErrors.filter(e => e.kind !== "log");
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
    });
    await page.close();

    await check("round 10: the check panel is translated in 中文 and English (< 5% Thai)", async () => {
      const p = await browser.newPage(null, { initScripts: [fakeCams, HOOKS] });
      await p.goto(`${base}/customers.html?cpu&fakedet&lang=zh`);
      await p.waitFor("window.LQI18N && LQI18N.lang === 'zh' && document.querySelector('#scPanel .sc-start')", 10000);
      await new Promise(r => setTimeout(r, 900));
      const zh = await p.evaluate(() => LQI18N.coverage(document.getElementById("scPanel"), { top: 3 }));
      assert(zh.pct < 5, `zh: ${zh.pct}% Thai — ${zh.top.map(x => x.text).join(" | ")}`);
      const en = await p.evaluate(async () => { LQI18N.setLang("en"); await new Promise(r => setTimeout(r, 1200)); return LQI18N.coverage(document.getElementById("scPanel"), { top: 3 }); });
      assert(en.pct < 5, `en: ${en.pct}% Thai — ${en.top.map(x => x.text).join(" | ")}`);
      console.log(`       scPanel zh ${zh.pct}%, en ${en.pct}%`);
      await p.evaluate(() => LQI18N.setLang("th")); // the language choice is persisted: later pages expect Thai
      await p.close();
    });

    await check("customers.html?cpu (real models, WASM): no console errors, no horizontal overflow at 390px", async () => {
      const p = await browser.newPage(null, { initScripts: [fakeCams] });
      await p.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await p.goto(`${base}/customers.html?cpu`);
      await p.waitFor(() => /พร้อมใช้งาน|ไม่พร้อม/.test(document.querySelector("#engine").textContent), 30000);
      const eng = await p.evaluate(() => document.querySelector("#engine").textContent);
      assert(/พร้อมใช้งาน \(ตัวประมวลผล: WASM\)/.test(eng), "ready on WASM: " + eng);
      for (const t of ["pos", "enroll", "analytics", "menu"]) {
        await p.evaluate(t => document.querySelector(`.tab[data-t="${t}"]`).click(), t);
        const w = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        assert(w.sw <= w.cw, `no horizontal overflow on ${t}: ${JSON.stringify(w)}`);
      }
      const errs = p.consoleErrors.filter(e => e.kind !== "log");
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await p.close();
    });
  } finally { await browser.close(); }
}
