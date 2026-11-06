// tests/e2e/customers.e2e.mjs — WP7: multi-face member chooser (assignUnique, per-label streak, chips).
// Faces come from window.__LQ_FAKE_DET and matches from window.__LQ_FAKE_MATCH (only honoured with ?fakedet on localhost).
import { assert, privacyScan } from "./cdp.mjs";

const D = v => Array.from({ length: 128 }, (_, k) => +(Math.sin(k * v) * 0.1).toFixed(5));
const MEMBERS = [
  { id: "mA", name: "แอน", phone: "0811111111", descriptor: D(1), created: 1, consentAt: 1 },
  { id: "mB", name: "บอส", phone: "0822222222", descriptor: D(2), created: 1, consentAt: 1 }
];
const HOOKS = `
  window.__faces = [];
  window.__LQ_FAKE_DET = () => window.__faces.map(f => Object.assign({ score: 0.95 }, f));
  window.__LQ_FAKE_MATCH = d => d && d.who ? { label: d.who, distance: d.dist == null ? 0.3 : d.dist } : { label: "unknown", distance: 0.9 };
`;
const FACE = (x, size, who) => ({ x, y: 0.2, w: size, h: size * 1.3, who });

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

    await check("privacy: no images, no /api, unknown faces never stored, no console errors", async () => {
      await privacyScan(page);
      const ms = await page.evaluate(() => JSON.parse(localStorage.getItem("cx-members")));
      assert(ms.length === 2 && ms.every(m => ["mA", "mB"].includes(m.id)), "only consenting members stored");
      const errs = page.consoleErrors.filter(e => e.kind !== "log");
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
    });
    await page.close();

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
