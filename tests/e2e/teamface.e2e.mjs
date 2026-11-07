// tests/e2e/teamface.e2e.mjs — โหงวเฮ้งทีม (teamface.html). Chrome's fake camera + ?fakedet scripted faces (box shape
// drives the face-reading element via FRCore.synthFace). Checks: fixed not-for-hiring banner, per-member consent gate,
// role cards from the read-only face-reading engine, team summary patterns, remove/reset, no images kept, privacy,
// 中文, 390 px layout / 44 px targets, and the real TinyFace + 68-landmark models loading on WASM.
import { assert, assertNoWebGL, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hardErrors = (page, base) => page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && e.url && !e.url.startsWith(base)));
const INIT = "window.confirm=()=>true;window.print=()=>{};window.__box={x:0.35,y:0.2,w:0.3,h:0.4};window.__LQ_FAKE_DET=()=>window.__box?[Object.assign({score:0.95},window.__box)]:[];";

/* r = face height / width in pixels (1.0 -> water, 1.3 -> fire, 1.6 -> wood with the synthetic landmarks) */
async function readOne(page, r, nick) {
  await page.evaluate((r, nick) => {
    const v = document.querySelector("#tfVideo"), w = 0.25, h = w * v.videoWidth / v.videoHeight * r;
    window.__box = { x: 0.375, y: Math.max(0.02, 0.5 - h / 2), w, h };
    document.querySelector("#tfNick").value = nick || "";
    const c = document.querySelector("#tfConsent"); if (!c.checked) c.click();
  }, r, nick);
  await page.waitFor(`!document.querySelector("#tfRead").disabled`, 8000);
  const n0 = await page.evaluate(() => window.__LQ_TF.members.length);
  await page.evaluate(() => document.querySelector("#tfRead").click());
  await page.waitFor(`window.__LQ_TF.members.length === ${n0 + 1}`, 15000);
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("teamface: banner, consent per member, role cards, team summary, remove/reset, nothing kept", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT] });
      await page.goto(`${base}/teamface.html?cpu&fakedet`);
      await assertNoWebGL(page);
      const b = await page.evaluate(() => { const el = document.querySelector("#tfBanner"), r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        return { pos: cs.position, bottom: Math.round(innerHeight - r.bottom), text: el.textContent, vis: r.height > 30 && r.width > 300 }; });
      assert(b.pos === "fixed" && b.bottom === 0 && b.vis && /ห้ามใช้ประกอบการจ้างงาน ประเมินผล หรือตัดสินบุคคล/.test(b.text), "fixed banner " + JSON.stringify(b));
      assert(await page.evaluate(() => document.querySelector("#tfRead").disabled), "read disabled before camera/consent");
      await page.evaluate(() => document.querySelector("#tfCamBtn").click());
      await page.waitFor(`document.querySelector("#tfVideo").videoWidth > 0`, 15000);
      await sleep(800);
      assert(await page.evaluate(() => document.querySelector("#tfRead").disabled && /ยินยอม/.test(document.querySelector("#tfHint").textContent)), "consent required");

      await readOne(page, 1.0, "บี");
      const c1 = await page.evaluate(() => ({ m: window.__LQ_TF.members[0], consent: document.querySelector("#tfConsent").checked, card: document.querySelector(".tcard").innerText, nick: document.querySelector("#tfNick").value }));
      assert(c1.m.role === "water" && c1.m.nick === "บี" && !c1.consent && !c1.nick, "first card (water -> นักเชื่อมโยง), consent + nick reset: " + JSON.stringify(c1));
      assert(/นักเชื่อมโยง/.test(c1.card) && /ธาตุน้ำ/.test(c1.card) && /พลังพิเศษ/.test(c1.card) && /คำถามละลายพฤติกรรม/.test(c1.card), "card copy: " + c1.card);
      const solo = await page.evaluate(() => window.__LQ_TF.summary.pattern);
      assert(solo === "solo", "solo " + solo);
      await readOne(page, 1.3);
      await readOne(page, 1.6);
      const s = await page.evaluate(() => ({ roles: window.__LQ_TF.members.map(m => m.role), sum: window.__LQ_TF.summary, title: document.querySelector("#tfSumTitle").textContent,
        bars: document.querySelectorAll("#tfBars li").length, miss: document.querySelectorAll("#tfMissList li").length, ice: document.querySelectorAll("#tfIceList li").length,
        labels: [...document.querySelectorAll(".tcard .who")].map(e => e.textContent) }));
      assert(s.roles.join() === "water,fire,wood", "roles " + s.roles);
      assert(s.sum.pattern === "mixed" && /ทีมหลากสี/.test(s.title) && s.bars === 5 && s.miss === 2 && s.ice === 3, "mixed team summary " + JSON.stringify(s));
      assert(s.labels.join() === "บี,สมาชิก 2,สมาชิก 3", "no names required: " + s.labels);
      await page.evaluate(() => { document.querySelector("#tfTeam").value = "ทีมขาย"; document.querySelector("#tfTeam").dispatchEvent(new Event("input")); document.querySelector('.tcard [data-del]').click(); });
      const d = await page.evaluate(() => ({ n: window.__LQ_TF.members.length, p: window.__LQ_TF.summary.pattern, t: document.querySelector("#tfSumTitle").textContent }));
      assert(d.n === 2 && d.p === "duo" && /^ทีมขาย · ทีมคู่หู/.test(d.t), "after remove: " + JSON.stringify(d));
      // positive copy only, no images retained, no "AI" label
      const txt = await page.evaluate(() => document.querySelector("main").innerText);
      for (const w of ["ไม่ดี", "แย่", "จุดอ่อน", "ขี้เกียจ"]) assert(!txt.includes(w), "negative wording " + w);
      assert(!/\bAI\b/.test(txt), "AI label");
      const media = await page.evaluate(() => ({ imgs: document.querySelectorAll("main img").length, canv: [...document.querySelectorAll("canvas")].map(c => c.id) }));
      assert(media.imgs === 0 && media.canv.join() === "tfOverlay", "no images / extra canvases kept: " + JSON.stringify(media));
      await page.evaluate(() => document.querySelector("#tfReset").click());
      assert(await page.evaluate(() => window.__LQ_TF.members.length === 0 && window.__LQ_TF.summary.pattern === "empty" && document.querySelector("#tfCardsWrap").hidden), "reset");
      await privacyScan(page);
      const st = await page.evaluate(() => Object.keys(localStorage).filter(k => k !== "lq-lang" && k !== "lq-i18n-debug").concat(Object.keys(sessionStorage)));
      assert(!st.length, "page wrote storage: " + st);
      const ext = page.requests.filter(q => !q.url.startsWith(base) && !/^(data|blob):/.test(q.url));
      assert(!ext.length, "third-party requests: " + ext.map(q => q.url));
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("teamface R10: 'not an assessment' label on every screen and card; record ids in nicknames, team names and links are dropped", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT] });
      await page.goto(`${base}/teamface.html?cpu&fakedet&lang=th&cand=C-014`);
      const g = await page.evaluate(() => ({ guard: !document.querySelector("#tfGuard").hidden, url: location.search, na: [...document.querySelectorAll(".tf-na")].map(e => e.closest("section,details,main")?.id || e.parentElement.className) }));
      assert(g.guard && !/cand=/.test(g.url) && g.na.length >= 5, "link guard + labels: " + JSON.stringify(g));
      await page.evaluate(() => document.querySelector("#tfCamBtn").click());
      await page.waitFor(`document.querySelector("#tfCamBtn").hidden`, 20000);
      await readOne(page, 1.0, "C-014");
      const c = await page.evaluate(() => ({ nick: window.__LQ_TF.members[0].nick, who: document.querySelector(".tcard .who").textContent, na: document.querySelectorAll(".tcard .tf-na").length, st: document.querySelector("#tfStatus").textContent }));
      assert(c.nick === "" && !/C-014/.test(c.who) && c.na === 1 && /แนบกับข้อมูลผู้สมัครไม่ได้/.test(c.st), "record-like nickname dropped: " + JSON.stringify(c));
      await readOne(page, 1.3, "นิด");
      assert(await page.evaluate(() => document.querySelectorAll(".tcard .tf-na").length === 2 && window.__LQ_TF.members[1].nick === "นิด"), "label on every card; normal nickname kept");
      await page.evaluate(() => { const t = document.querySelector("#tfTeam"); t.value = "ทีมสัมภาษณ์ผู้สมัคร"; t.dispatchEvent(new Event("input")); });
      const t = await page.evaluate(() => ({ title: document.querySelector("#tfSumTitle").textContent, warn: document.querySelector("#tfTeamWarn").textContent }));
      assert(!/สัมภาษณ์/.test(t.title) && /ใช้กับการสรรหา/.test(t.warn), "recruitment team name dropped: " + JSON.stringify(t));
      const st = await page.evaluate(() => Object.keys(localStorage).filter(k => k !== "lq-lang" && k !== "lq-i18n-debug").concat(Object.keys(sessionStorage)));
      assert(!st.length, "page wrote storage: " + st);
      await page.close();
    });

    await check("teamface: 中文 banner + cards + summary; 390 px no overflow, 44 px targets, banner does not hide content", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT] });
      await page.goto(`${base}/teamface.html?cpu&fakedet&lang=zh`);
      await page.waitFor(`window.LQI18N && LQI18N.lang === "zh"`, 8000);
      await page.evaluate(() => document.querySelector("#tfCamBtn").click());
      await page.waitFor(`document.querySelector("#tfVideo").videoWidth > 0`, 15000);
      await readOne(page, 1.0);
      await readOne(page, 1.3);
      const z = await page.evaluate(() => ({ banner: document.querySelector("#tfBanner").textContent, card: document.querySelector(".tcard").innerText, title: document.querySelector("#tfSumTitle").textContent,
        thai: (document.querySelector("main").innerText.match(/[฀-๿]+/g) || []).slice(0, 8) }));
      assert(/禁止用于招聘/.test(z.banner) && /连接者/.test(z.card) && /水形脸/.test(z.card) && /黄金搭档/.test(z.title), "zh: " + JSON.stringify(z));
      assert(!z.thai.length, "Thai left in 中文: " + z.thai.join(" | "));
      await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await sleep(500);
      const m = await page.evaluate(() => {
        const sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
        const small = [...document.querySelectorAll("main button, main summary, main input:not([type=checkbox]):not([type=file]), main input[type=checkbox], main label.upload")].filter(el => {
          const b = el.getBoundingClientRect(); if (!b.width || el.closest("[hidden]")) return false;
          const r = el.type === "checkbox" ? el.closest("label").getBoundingClientRect() : b; return r.height < 44 || (el.type !== "checkbox" && r.width < 44);
        }).map(el => el.id || el.className);
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
        const last = document.querySelector("main").lastElementChild.getBoundingClientRect(), ban = document.querySelector("#tfBanner").getBoundingClientRect();
        return { sw, cw, small, clear: last.bottom <= ban.top + 1, bh: ban.height };
      });
      assert(m.sw <= m.cw, `overflow at 390: ${m.sw} > ${m.cw}`);
      assert(!m.small.length, "targets < 44 px: " + JSON.stringify(m.small));
      assert(m.clear && m.bh < 120, "banner covers the end of the page: " + JSON.stringify(m));
      await page.send("Emulation.clearDeviceMetricsOverride");
      await page.evaluate(() => LQI18N.setLang("th"));
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("teamface: real face models load on WASM (no WebGL) and the fake camera frame shows no face", async () => {
      const page = await browser.newPage(null, { initScripts: ["window.confirm=()=>true"] });
      await page.goto(`${base}/teamface.html?cpu&lang=th`);
      await page.evaluate(() => { document.querySelector("#tfCamBtn").click(); document.querySelector("#tfConsent").click(); });
      await page.waitFor(`faceapi.nets.tinyFaceDetector.isLoaded && faceapi.nets.faceLandmark68Net.isLoaded && document.querySelector("#tfVideo").videoWidth > 0 && /ภาพไม่ถูกบันทึก|เปิดกล้องไม่ได้/.test(document.querySelector("#tfStatus").textContent)`, 90000);
      await sleep(1500);
      const r = await page.evaluate(() => ({ st: document.querySelector("#tfStatus").textContent, det: faceapi.nets.tinyFaceDetector.isLoaded, lm: faceapi.nets.faceLandmark68Net.isLoaded,
        backend: faceapi.tf.getBackend(), read: document.querySelector("#tfRead").disabled, hint: document.querySelector("#tfHint").textContent }));
      assert(/ภาพไม่ถูกบันทึก/.test(r.st) && r.det && r.lm && r.backend !== "webgl", "models ready: " + JSON.stringify(r));
      assert(r.read && /ใบหน้า/.test(r.hint), "no face in the test pattern -> read stays disabled: " + JSON.stringify(r));
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });
  } finally { await browser.close(); }
}
