// tests/e2e/gate.e2e.mjs — LENSIQ Gate landing (gate.html) and the PDPA signage kit (gate-notice.html): variant chooser
// links, honest accuracy note, pricing draft, poster + notice filled live from the form, TH / EN / 中文 (no Thai left in
// zh / en outside lang="th" content), phone layouts at 320 / 360 / 390 px (no overflow, 44 px targets, text >= 12 px),
// and the REAL Thai OCR model (PP-OCRv5 Thai, ONNX Runtime Web WASM) reading the synthetic demo plate on parking.html.
import { assert, assertNoWebGL, privacyScan } from "./cdp.mjs";
import { audit } from "./camera-mobile.e2e.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hardErrors = (page, base) => page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && e.url && !e.url.startsWith(base)));
const INIT = "window.confirm=()=>true;window.print=()=>{};window.prompt=()=>'test';";

export async function coverage(page) {
  return page.evaluate(() => { const c = window.LQI18N.coverage(document.body, { top: 8 }); return { pct: c.pct, thai: c.thai, top: (c.top || []).map(t => t.text.slice(0, 50) + " @ " + t.path.slice(-60)) }; });
}
export async function phone(page, url, widths = [320, 360, 390]) {
  const out = [];
  for (const w of widths) {
    await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 1, mobile: true });
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    if (url) await page.goto(url);
    await sleep(500);
    const r = await page.evaluate(audit);
    out.push({ w, ...r });
  }
  return out;
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("gate.html: variant chooser, honest accuracy note, PDPA kit link, pricing draft, no errors, no storage", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT] });
      await page.goto(`${base}/gate.html`);
      const r = await page.evaluate(() => ({
        links: [...document.querySelectorAll("main a.btn")].map(a => a.getAttribute("href")),
        acc: document.querySelector("#accuracy").innerText, price: document.querySelector("#gPr").parentElement.innerText, h1: document.querySelector("h1").textContent
      }));
      for (const h of ["parking.html", "village.html", "gate-notice.html", "camera-notice.html"]) assert(r.links.includes(h), "link " + h + " " + r.links);
      assert(/ยังไม่มีผลวัดความแม่นยำ/.test(r.acc) && /Apache-2\.0/.test(r.acc) && /สิทธิ์ข้อมูลฝึก/.test(r.acc), "honest accuracy note");
      assert(/ร่าง/.test(r.price) && /990/.test(r.price) && /1,490/.test(r.price) && /3,000–5,000/.test(r.price), "pricing draft " + r.price.slice(0, 120));
      const txt = await page.evaluate(() => document.querySelector("main").innerText);
      assert(!/ตรวจจับการโกง|จับผิด|ผู้กระทำผิด/.test(txt), "no accusatory wording");
      await privacyScan(page);
      const st = await page.evaluate(() => Object.keys(localStorage).filter(k => !/^lq-(lang|i18n-debug)$/.test(k)));
      assert(!st.length, "storage " + st);
      const errs = hardErrors(page, base); assert(!errs.length, "console errors " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("gate-notice.html: form fills the TH/EN poster and the privacy notice live; print only the chosen block", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT] });
      await page.goto(`${base}/gate-notice.html`);
      const r = await page.evaluate(() => {
        const set = (k, v) => { const i = document.querySelector(`[data-f="${k}"]`); i.value = v; i.dispatchEvent(new Event("input")); };
        set("site", "ลานจอดทดสอบ"); set("ctrl", "บริษัท ตัวอย่าง จำกัด"); set("contact", "02-000-0000"); set("logDays", "60"); set("imgDays", "7");
        const s = document.querySelector('[data-f="purpose"]'); s.value = "village"; s.dispatchEvent(new Event("change"));
        let printed = null; window.print = () => { printed = [...document.querySelectorAll(".gk-print-on")].map(e => e.id); };
        document.querySelector("#gnPrintPoster").click();
        return { poster: document.querySelector("#gnPoster").innerText, notice: document.querySelector("#gnNotice").innerText, printed };
      });
      assert(/ลานจอดทดสอบ/.test(r.poster) && /บริษัท ตัวอย่าง จำกัด/.test(r.poster) && /02-000-0000/.test(r.poster), "poster filled");
      assert(/60 วัน/.test(r.poster) && /kept for 60 days/.test(r.poster) && /ควบคุมการเข้าออก/.test(r.poster) && /access control/.test(r.poster), "poster TH+EN purpose/retention");
      assert(/ภาพครอปป้าย 7 วัน/.test(r.poster) && /plate crops for 7 days/.test(r.poster), "image retention");
      assert(/มาตรา 24\(5\)/.test(r.notice) && /s\. 24\(5\)/.test(r.notice) && /ให้นักกฎหมายยืนยัน/.test(r.notice), "notice: legal basis flagged for counsel");
      assert(/ไม่ใช้จดจำใบหน้า/.test(r.notice) && /No face recognition/.test(r.notice), "no face recognition statement");
      assert(r.printed && r.printed.join() === "gnPoster", "prints only the poster " + r.printed);
      const errs = hardErrors(page, base); assert(!errs.length, "console errors " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("gate.html + gate-notice.html: 中文 and English leave no Thai outside lang=th content; Thai restored", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT] });
      for (const pg of ["gate.html", "gate-notice.html"]) {
        for (const lang of ["zh", "en"]) {
          await page.goto(`${base}/${pg}?lang=${lang}`);
          await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
          await sleep(400);
          const c = await coverage(page);
          assert(c.pct === 0, `${pg} ${lang}: Thai left ${c.pct}% ${JSON.stringify(c.top)}`);
        }
        await page.goto(`${base}/${pg}?lang=th`);
        await page.waitFor(`window.LQI18N && LQI18N.lang === "th"`, 8000);
        assert(await page.evaluate(() => /[ก-๙]/.test(document.querySelector("h1").textContent)), pg + " Thai restored");
      }
      await page.close();
    });

    await check("gate.html + gate-notice.html: phone 320 / 360 / 390 px — no overflow, 44 px targets, text >= 12 px", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT] });
      for (const pg of ["gate.html", "gate-notice.html"]) {
        for (const r of await phone(page, `${base}/${pg}`)) {
          assert(r.sw <= r.cw, `${pg} @${r.w} overflow ${r.sw}>${r.cw}`);
          assert(!r.bad.length, `${pg} @${r.w} small targets: ${r.bad.slice(0, 8).join(" | ")}`);
          assert(!r.tiny.length, `${pg} @${r.w} tiny text: ${r.tiny.slice(0, 8).join(" | ")}`);
        }
      }
      await page.close();
    });

    // Same pass rule on CI and dev machines: the demo plate is drawn with the self-hosted Prompt font (vendor/fonts, OFL),
    // fully loaded (Thai + Latin subsets) before drawing, so no system font is involved.
    const readDemo = async (plates, want, tapBox) => {
      const page = await browser.newPage(null, { initScripts: [INIT + `window.__LQ_DEMO_PLATES=${JSON.stringify(plates)};`] });
      await page.goto(`${base}/parking.html?cpu`);
      await assertNoWebGL(page);
      await page.evaluate(() => { document.querySelector("#gkAck1").click(); document.querySelector("#gkAck2").click(); document.querySelector("#gkAckBtn").click(); });
      await page.evaluate(() => document.querySelector("#gkDemoBtn").click());
      await page.waitFor(`!document.querySelector("#gkReadBtn").disabled`, 8000);
      const fontOk = await page.evaluate(() => document.fonts.check("600 46px Prompt", "1กข 2345"));
      assert(fontOk, "Prompt 600 (Thai + Latin) loaded before the demo plate is drawn");
      if (tapBox) await page.evaluate(b => { window.__LQ_PK.kit.readNow(b); }, tapBox); // the guard taps the plate (dark plates are not auto-found)
      else await page.evaluate(() => document.querySelector("#gkReadBtn").click());
      try {
        await page.waitFor(`!!(window.__LQ_PK && window.__LQ_PK.kit.lane && window.__LQ_PK.kit.lane.read) || /อ่านป้ายไม่ได้|โหลดโมเดล.*ไม่ได้/.test(document.querySelector("#gkStatus").textContent)`, 120000, 250);
      } catch (e) {
        throw new Error(e.message + " state " + JSON.stringify(await page.evaluate(() => ({ plate: document.querySelector("#gkPlate").value, st: document.querySelector("#gkStatus").textContent }))));
      }
      const r = await page.evaluate(() => ({ plate: document.querySelector("#gkPlate").value, prov: document.querySelector("#gkProv").value, st: document.querySelector("#gkStatus").textContent, read: window.__LQ_PK.kit.lane.read }));
      assert(r.plate === want, "OCR read " + JSON.stringify({ want, plate: r.plate, st: r.st, lines: r.read && r.read.lines }));
      return { page, r };
    };

    await check("real Thai OCR (PP-OCRv5 Thai ONNX, WASM) reads the synthetic demo plate on parking.html", async () => {
      const { page, r } = await readDemo([["1กข 2345", "bangkok"], ["ขค 789", "chonburi"]], "1กข 2345");
      assert(r.prov === "bangkok", "province guessed from line 2: " + r.prov);
      assert(r.read.conf > 0.5 && r.read.n >= 2 && r.read.agree === 1, "vote " + JSON.stringify({ conf: r.read.conf, n: r.read.n, agree: r.read.agree }));
      const ort = page.requests.filter(q => /th_ppocrv5_mobile_rec\.onnx|ort-wasm/.test(q.url));
      assert(ort.length >= 2, "model + wasm loaded locally " + ort.map(q => q.url));
      const ext = page.requests.filter(q => !q.url.startsWith(base) && !/^(data|blob):/.test(q.url));
      assert(!ext.length, "third-party requests " + ext.map(q => q.url));
      await privacyScan(page);
      await page.close();
    });

    await check("real Thai OCR reads plates with and without a leading digit on white, yellow, green and red plates", async () => {
      const cases = [
        ["กข 2345", "bangkok", null],
        ["1กข 2345", "bangkok", { bg: "#f5c400", fg: "#111" }],   // yellow (taxi / public)
        ["3ฒพ 12", "chiangmai", { bg: "#1f7a3a", fg: "#fff" }],    // green (commercial)
        ["กท 4567", "nonthaburi", { bg: "#fbfbf7", fg: "#c8102e" }], // red text (trade / dealer)
      ];
      const PLATE_BOX = { x: 200 / 640, y: 175 / 360, w: 240 / 640, h: 112 / 360 }; // where drawDemo puts the plate
      for (const [t, p, sty] of cases) {
        // colour plates test the READER, so the guard taps the plate; auto-finding is covered by the white-plate cases
        // (the classical finder misses dark plates and can pick the province line of red-text plates — docs/GATE.md)
        const { page } = await readDemo([[t, p, sty], [t, p, sty]], t, sty ? PLATE_BOX : null);
        await page.close();
      }
    });

    await check("leading digit unclear -> guard must pick one of both readings before saving (never dropped silently)", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT + "window.__LQ_FAKE_N=0;window.__LQ_FAKE_PLATE=()=>({text:(window.__LQ_FAKE_N++%2===1?'1':'')+'กข 2345',conf:0.9,province:'bangkok'});"] });
      await page.goto(`${base}/parking.html?cpu&fakedet`);
      await page.evaluate(() => { document.querySelector("#gkAck1").click(); document.querySelector("#gkAck2").click(); document.querySelector("#gkAckBtn").click(); });
      await page.evaluate(() => document.querySelector("#gkDemoBtn").click());
      await page.waitFor(`!document.querySelector("#gkReadBtn").disabled`, 8000);
      await page.evaluate(() => document.querySelector("#gkReadBtn").click());
      await page.waitFor(`!!document.querySelector("#gkLead")`, 20000, 100);
      const s = await page.evaluate(() => ({
        alts: [...document.querySelectorAll("[data-alt]")].map(b => b.textContent.trim()),
        blocked: [...document.querySelectorAll("#gkActions [data-act]:not([data-noplate])")].every(b => b.disabled),
      }));
      assert(s.alts.includes("1กข 2345") && s.alts.includes("กข 2345"), "both readings offered " + JSON.stringify(s.alts));
      assert(s.blocked, "save buttons stay disabled until the guard picks");
      await page.evaluate(() => /** @type {HTMLElement} */ ([...document.querySelectorAll("[data-alt]")].find(b => b.textContent.trim() === "1กข 2345")).click());
      const after = await page.evaluate(() => ({ plate: document.querySelector("#gkPlate").value, enabled: [...document.querySelectorAll("#gkActions [data-act]:not([data-noplate])")].some(b => !b.disabled) }));
      assert(after.plate === "1กข 2345" && after.enabled, "picked reading fills the plate and enables saving " + JSON.stringify(after));
      await page.close();
    });
  } finally { await browser.close(); }
}
