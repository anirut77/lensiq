// tests/e2e/omr.e2e.mjs — omr.html (multiple-choice answer-sheet grader; no AI, no faces): create an exam, the printed
// A4 SVG (print stubbed), answer key as text, a synthetic "photo" of the real printed sheet (the page's own SVG rendered
// to a canvas, bubbles filled, rotated on a dark table) read through the test hook, the real file input and a fake
// camera stream (auto-capture when the corners are steady, then waits for the sheet to change), scores, flags for a
// double mark, manual correction by tapping the straightened picture and with the question buttons, student number
// edit, key from a scanned sheet, wrong-format sheet refused, item analysis, CSV exports (BOM, formula-safe), reload
// (results kept, no picture kept), delete / wipe, 320/360/390 px layout, en/zh with no Thai left, privacy scan.
import { assert, privacyScan } from "./cdp.mjs";
import { noErrors, mobileCheck, sleep } from "./zones-lib.mjs";

const HELPERS = `
window.confirm = () => true;
window.__printed = null;
window.print = () => { window.__printed = { cls: document.body.className, svg: !!document.querySelector("#printArea svg") }; };
/** draw the page's own printed sheet with filled bubbles, then "photograph" it rotated on a dark table */
window.__sheetPhoto = async (opts) => {
  const O = window.LQOMR, L = O.layout(opts.layout), k = 4;
  const svg = O.sheetSvg(L, { title: "Test", name: "n", cls: "c", date: "d", id: "id", idHint: "h", fill: "f", footer: "LENSIQ" });
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })); });
  const sc = document.createElement("canvas"); sc.width = 210 * k; sc.height = 297 * k;
  const g = sc.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, sc.width, sc.height); g.drawImage(img, 0, 0, sc.width, sc.height);
  g.fillStyle = "#1c1c1c";
  const dot = b => { g.beginPath(); g.arc(b.x * k, b.y * k, b.r * 0.92 * k, 0, Math.PI * 2); g.fill(); };
  (opts.answers || []).forEach((a, q) => { for (const c of [].concat(a == null ? [] : a)) dot(L.q[q][c]); });
  String(opts.id || "").split("").forEach((d, i) => { if (L.id[i]) dot(L.id[i][+d]); });
  const pc = opts.canvas || document.createElement("canvas"); pc.width = opts.w || 1000; pc.height = opts.h || 1300;
  const p = pc.getContext("2d"); p.fillStyle = "#3a3a3a"; p.fillRect(0, 0, pc.width, pc.height);
  p.save(); p.translate(pc.width / 2, pc.height / 2); p.rotate((opts.deg || 0) * Math.PI / 180);
  const s = Math.min(pc.width / sc.width, pc.height / sc.height) * 0.88; p.scale(s, s);
  p.drawImage(sc, -sc.width / 2, -sc.height / 2); p.restore();
  return pc;
};
window.__setFiles = (input, files) => { const dt = new DataTransfer(); for (const f of files) dt.items.add(f); input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true })); };
window.__capture = async id => {
  let blob = null; const o = URL.createObjectURL, c = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = b => { blob = b; return "blob:x"; }; HTMLAnchorElement.prototype.click = function () {};
  try { document.getElementById(id).click(); } finally { URL.createObjectURL = o; HTMLAnchorElement.prototype.click = c; }
  return blob ? new TextDecoder("utf-8", { ignoreBOM: true }).decode(await blob.arrayBuffer()) : null;
};
// fake rear camera: streams window.__camCanvas (the test paints a sheet photo or a blank table into it)
window.__camCanvas = document.createElement("canvas"); window.__camCanvas.width = 1000; window.__camCanvas.height = 1300;
(function () {
  const md = navigator.mediaDevices; if (!md) return;
  const paint = () => { const g = window.__camCanvas.getContext("2d"); g.globalAlpha = 0.01; g.fillStyle = "#808080"; g.fillRect(0, 0, 1, 1); g.globalAlpha = 1; };
  setInterval(paint, 50);
  md.getUserMedia = async () => window.__camCanvas.captureStream(15);
  md.enumerateDevices = async () => [{ kind: "videoinput", deviceId: "fake-rear", groupId: "g", label: "Back camera" }];
})();
`;
const ANS40 = Array.from({ length: 40 }, (_, i) => (i * 3 + 1) % 5);
const KEY40 = ANS40.map(a => "ABCDE"[a]).join("");

const THAI_LEFT = `(() => {
  const main = document.querySelector("main"), thai = [];
  const walk = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) {
    const el = n.parentElement;
    if (el.closest("[hidden],[lang=th],[translate=no],script,.om-print")) continue;
    if (/[ก-๛]/.test(n.textContent)) thai.push(n.textContent.trim().slice(0, 50));
  }
  for (const el of main.querySelectorAll("[aria-label],[placeholder],option")) {
    const v = (el.getAttribute("aria-label") || "") + (el.getAttribute("placeholder") || "") + (el.tagName === "OPTION" ? el.textContent : "");
    if (/[ก-๛]/.test(v) && !el.closest("[hidden],[lang=th]")) thai.push("@" + v.slice(0, 40));
  }
  if (/[ก-๛]/.test(document.title)) thai.push("title " + document.title);
  window.__lastThai = thai;
  return thai.length === 0;
})()`;

async function open(browser, base, { clear = true, query = "" } = {}) {
  const page = await browser.newPage(null, { initScripts: [HELPERS] });
  await page.goto(`${base}/omr.html${query}`);
  if (clear) { await page.evaluate(() => localStorage.clear()); await page.reload(); }
  await page.waitFor(`!!window.__LQOMRP && !!window.LQOMR`, 5000);
  return page;
}
async function newExam(page, { title = "Science midterm", n = 40, choices = 5, idDigits = 5, labels = "en" } = {}) {
  await page.evaluate((title, n, choices, idDigits, labels) => {
    const f = document.getElementById("newExam"); document.getElementById("newWrap").open = true;
    f.elements.title.value = title; f.elements.n.value = String(n); f.elements.choices.value = String(choices);
    f.elements.idDigits.value = String(idDigits); f.elements.labels.value = labels; f.requestSubmit();
  }, title, n, choices, idDigits, labels);
}
async function scan(page, opts) {
  return page.evaluate(async o => {
    const c = await window.__sheetPhoto(o), s = window.__LQOMRP.processCanvas(c);
    return { s: s && s.id ? { id: s.id, sid: s.sid, marks: s.marks, flags: s.flags } : s, status: document.getElementById("scanStatus").textContent };
  }, opts);
}

export default async function (ctx) {
  const browser = await ctx.launch();
  try {
    let page = await open(browser, ctx.base);

    await ctx.check("omr: notice (no AI / faces / images), exam created, printed A4 sheet with every bubble", async () => {
      const t = await page.evaluate(() => document.querySelector(".om-note").textContent);
      assert(/AI/.test(t) && /ใบหน้า/.test(t), "notice says no AI / faces");
      assert(await page.evaluate(() => document.getElementById("ws").hidden), "workspace hidden without an exam");
      await newExam(page);
      const r = await page.evaluate(() => ({ ws: document.getElementById("ws").hidden, circles: document.querySelectorAll("#sheetPreview svg circle").length,
        w: document.querySelector("#sheetPreview svg").getAttribute("width"), opt: document.getElementById("examPick").selectedOptions[0].textContent }));
      assert(!r.ws, "workspace shown"); assert(r.circles === 40 * 5 + 5 * 10 + 2, "bubbles " + r.circles); assert(r.w === "210mm", "A4 width");
      assert(/Science midterm/.test(r.opt), r.opt);
      await page.evaluate(() => document.getElementById("printBtn").click());
      const p = await page.evaluate(() => window.__printed);
      assert(p && p.svg && /om-printing/.test(p.cls), "print area filled while printing " + JSON.stringify(p));
    });

    await ctx.check("omr: key as text, sheet photo read (rotated, dark table) -> marks, student number, score", async () => {
      await page.evaluate(k => { const i = document.getElementById("keyText"); i.value = k; document.getElementById("keyApply").click(); }, KEY40);
      const km = await page.evaluate(() => document.getElementById("keyMsg").textContent);
      assert(/40/.test(km), km);
      const ans = ANS40.slice(); ans[4] = null; ans[7] = [ANS40[7], (ANS40[7] + 1) % 5]; ans[10] = (ANS40[10] + 2) % 5;
      const r = await scan(page, { layout: { n: 40, choices: 5, idDigits: 5 }, answers: ans, id: "30412", deg: 5 });
      assert(r.s && r.s.sid === "30412", "student number " + JSON.stringify(r));
      for (let q = 0; q < 40; q++) {
        if (q === 4) { assert(!r.s.marks[q].length && r.s.flags[q] === "blank", "blank q5"); continue; }
        if (q === 7) { assert(r.s.flags[q] === "multi", "multi q8"); continue; }
        assert(r.s.marks[q].length === 1 && r.s.marks[q][0] === [].concat(ans[q])[0], `q${q + 1} ${r.s.marks[q]}`);
      }
      const ui = await page.evaluate(() => ({ rev: document.getElementById("review").hidden, score: document.getElementById("revScore").textContent,
        rows: document.querySelectorAll("#resBody tr").length, flags: document.getElementById("revFlags").textContent }));
      assert(!ui.rev && /37\/40/.test(ui.score), "review open, 37/40: " + ui.score);
      assert(ui.rows === 1 && /1/.test(ui.flags), JSON.stringify(ui));
    });

    await ctx.check("omr: manual correction by tapping the straightened picture and with the question buttons", async () => {
      const r = await page.evaluate(() => {
        const P = window.__LQOMRP, L = P.layout(), cv = document.getElementById("warp"), b = cv.getBoundingClientRect();
        const s = P.state.exams[0].sheets[0], key = P.state.exams[0].key;
        // q8 has two marks: tap the wrong one away on the picture
        const wrong = s.marks[7].find(c => !key[7].includes(c)), bub = L.q[7][wrong];
        cv.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: b.left + bub.x / 210 * b.width, clientY: b.top + bub.y / 297 * b.height }));
        const afterTap = s.marks[7].slice();
        // q5 blank: show every question, then press the key answer button for q5
        const all = document.getElementById("revAll"); all.checked = true; all.dispatchEvent(new Event("change"));
        const row = document.querySelectorAll("#revGrid .om-q")[4];
        row.querySelectorAll(".om-ch")[key[4][0]].click();
        return { afterTap, key7: key[7], m4: s.marks[4], manual: s.manual.slice().sort((a, b) => a - b), score: document.getElementById("revScore").textContent,
          note: document.getElementById("revMeta").textContent };
      });
      assert(r.afterTap.length === 1 && r.afterTap[0] === r.key7[0], "tap removed the wrong mark " + JSON.stringify(r));
      assert(r.manual.join() === "4,7" && /39\/40/.test(r.score), JSON.stringify(r));
      const ok = await page.evaluate(() => { document.getElementById("revDone").click(); return document.getElementById("review").hidden; });
      assert(ok, "confirm closes the review");
    });

    await ctx.check("omr: real file input (photo) + duplicate / edited student number", async () => {
      const r = await page.evaluate(async (ans) => {
        const c = await window.__sheetPhoto({ layout: { n: 40, choices: 5, idDigits: 5 }, answers: ans, id: "30412", deg: -3 });
        const blob = await new Promise(res => c.toBlob(res, "image/png"));
        window.__setFiles(document.getElementById("photoFile"), [new File([blob], "sheet.png", { type: "image/png" })]);
        for (let i = 0; i < 100 && window.__LQOMRP.state.exams[0].sheets.length < 2; i++) await new Promise(r => setTimeout(r, 50));
        const s = window.__LQOMRP.state.exams[0].sheets[1];
        const flags = document.getElementById("revFlags").textContent;
        const sid = document.getElementById("revSid"); sid.value = "30413"; sid.dispatchEvent(new Event("input")); sid.dispatchEvent(new Event("change"));
        return { n: window.__LQOMRP.state.exams[0].sheets.length, sid: s && s.sid, flags, after: s && s.sid };
      }, ANS40);
      assert(r.n === 2, "second sheet " + JSON.stringify(r));
      assert(/ซ้ำ/.test(r.flags), "duplicate number flagged: " + r.flags);
      assert(r.after === "30413", "number edited");
    });

    await ctx.check("omr: fake camera -> auto-capture when steady, waits for the next sheet", async () => {
      await page.evaluate(async (ans) => {
        await window.__sheetPhoto({ layout: { n: 40, choices: 5, idDigits: 5 }, answers: ans.map(a => (a + 1) % 5), id: "55555", deg: 2, canvas: window.__camCanvas });
        document.getElementById("camStart").click();
      }, ANS40);
      await page.waitFor(`window.__LQOMRP.state.exams[0].sheets.length === 3`, 15000);
      const r = await page.evaluate(() => { const s = window.__LQOMRP.state.exams[0].sheets[2]; return { sid: s.sid, src: s.source }; });
      assert(r.sid === "55555" && r.src === "camera", JSON.stringify(r));
      await sleep(1500);
      assert(await page.evaluate(() => window.__LQOMRP.state.exams[0].sheets.length === 3), "same sheet not captured twice");
      await page.evaluate(() => { const g = window.__camCanvas.getContext("2d"); g.fillStyle = "#3a3a3a"; g.fillRect(0, 0, 1000, 1300); });
      await page.waitFor(`/แผ่นถัดไป/.test(document.getElementById("scanStatus").textContent)`, 8000);
      await page.evaluate(() => { document.getElementById("camStop").click(); });
      const live = await page.evaluate(() => !!(window.__LQOMRP.cam && window.__LQOMRP.cam.active));
      assert(!live, "camera stopped");
    });

    await ctx.check("omr: scores table, tiles, item analysis, CSV exports (BOM, formula-safe)", async () => {
      await page.evaluate(() => { const s = window.__LQOMRP.state.exams[0].sheets[1]; s.name = "=HYPERLINK(\"x\")"; });
      const r = await page.evaluate(async () => ({
        rows: document.querySelectorAll("#resBody tr").length, items: document.querySelectorAll("#itemBody tr").length,
        heads: document.querySelectorAll("#itemHead th").length, tiles: document.getElementById("tiles").textContent,
        csv: await window.__capture("csvScores"), icsv: await window.__capture("csvItems")
      }));
      assert(r.rows === 3 && r.items === 40 && r.heads === 4 + 5 + 3, JSON.stringify({ rows: r.rows, items: r.items, heads: r.heads }));
      assert(/3/.test(r.tiles), r.tiles);
      assert(r.csv.startsWith("﻿") && /30412/.test(r.csv) && /55555/.test(r.csv) && r.csv.includes("'=HYPERLINK"), r.csv.slice(0, 300));
      assert(r.csv.split("\r\n")[0].split(",").length === 8 + 40, "header columns");
      assert(r.icsv.startsWith("﻿") && /KR-20/.test(r.icsv) && r.icsv.split("\r\n").length >= 43, r.icsv.slice(0, 200));
    });

    await ctx.check("omr: key from a scanned sheet; a sheet printed for another format is refused", async () => {
      await newExam(page, { title: "Quiz 20", n: 20, choices: 4, idDigits: 0, labels: "th" });
      const ans = Array.from({ length: 20 }, (_, i) => i % 4);
      await page.evaluate(() => document.getElementById("keyScan").click());
      const k = await scan(page, { layout: { n: 20, choices: 4, idDigits: 0, labels: "th" }, answers: ans });
      const key = await page.evaluate(() => ({ key: window.__LQOMRP.state.exams[1].key, txt: document.getElementById("keyText").value, n: window.__LQOMRP.state.exams[1].sheets.length }));
      assert(k.s === "key" && key.n === 0, "key scan is not a student sheet " + JSON.stringify(k));
      assert(key.key.map(x => x[0]).join() === ans.join() && key.txt.startsWith("กขคง"), JSON.stringify(key));
      const bad = await scan(page, { layout: { n: 40, choices: 5, idDigits: 5 }, answers: ANS40, id: "11111" });
      assert(bad.s === null && /40/.test(bad.status) && /20/.test(bad.status), "wrong format refused: " + bad.status);
      const nomark = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 400; c.height = 500;
        const g = c.getContext("2d"); g.fillStyle = "#eee"; g.fillRect(0, 0, 400, 500); window.__LQOMRP.processCanvas(c); return document.getElementById("scanStatus").textContent; });
      assert(/สี่เหลี่ยมดำ/.test(nomark), nomark);
    });

    await ctx.check("omr: reload keeps results but no picture; storage holds no image", async () => {
      await page.reload();
      await page.waitFor(`!!window.__LQOMRP`, 5000);
      const r = await page.evaluate(() => {
        const sel = document.getElementById("examPick"); sel.value = window.__LQOMRP.state.exams[0].id; sel.dispatchEvent(new Event("change"));
        document.querySelector("#resBody .om-edit").click();
        return { n: window.__LQOMRP.state.exams[0].sheets.length, warpHidden: document.getElementById("warp").hidden,
          note: document.getElementById("warpNote").textContent, raw: localStorage.getItem("lqomr-v1").length };
      });
      assert(r.n === 3 && r.warpHidden && /ไม่มีภาพ/.test(r.note), JSON.stringify(r));
      assert(r.raw < 30000, "small storage " + r.raw);
      await privacyScan(page);
      noErrors(page);
    });

    await ctx.check("omr: 320 / 360 / 390 px — no overflow, 44 px targets, labelled controls", async () => {
      await page.evaluate(() => { document.getElementById("revAll").checked = true; document.getElementById("revAll").dispatchEvent(new Event("change")); });
      try { await mobileCheck(page); } catch (e) {
        const wide = await page.evaluate(() => [...document.querySelectorAll("body *")].filter(el => !el.closest(".om-tablewrap") && el.getBoundingClientRect().right > innerWidth + 1)
          .slice(0, 6).map(el => el.tagName + "#" + el.id + "." + el.className + " " + Math.round(el.getBoundingClientRect().right)));
        const culprit = await page.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll("main > *, main > div > *")) {
            const d = el.style.display; el.style.display = "none";
            const sw = document.documentElement.scrollWidth; el.style.display = d;
            if (sw <= innerWidth) out.push(el.tagName + "#" + el.id + "." + el.className);
          }
          return out;
        });
        throw new Error(e.message + " wide: " + wide.join(", ") + " culprit: " + culprit.join(", "));
      }
    });

    for (const lang of ["en", "zh"]) {
      await ctx.check(`omr: ?lang=${lang} — no Thai left (exam, review, results, item analysis)`, async () => {
        const p = await open(browser, ctx.base, { clear: false, query: `?lang=${lang}` });
        try {
          await p.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 5000);
          await sleep(300);
          await p.evaluate(() => { const e = document.getElementById("examPick"); e.value = window.__LQOMRP.state.exams[0].id; e.dispatchEvent(new Event("change")); });
          await p.evaluate(() => { document.querySelector("#resBody .om-edit").click(); const a = document.getElementById("revAll"); a.checked = true; a.dispatchEvent(new Event("change")); });
          const ok = await p.evaluate(THAI_LEFT);
          assert(ok, "Thai left: " + JSON.stringify(await p.evaluate(() => window.__lastThai.slice(0, 8))));
          await p.evaluate(() => { const e = document.getElementById("examPick"); e.value = window.__LQOMRP.state.exams[1].id; e.dispatchEvent(new Event("change")); });
          const ok2 = await p.evaluate(THAI_LEFT);
          assert(ok2, "Thai left (2): " + JSON.stringify(await p.evaluate(() => window.__lastThai.slice(0, 8))));
          noErrors(p);
        } finally { await p.close(); }
      });
    }

    await ctx.check("omr: delete exam and wipe all", async () => {
      const r = await page.evaluate(() => {
        document.getElementById("delExam").click();
        const n1 = window.__LQOMRP.state.exams.length;
        document.getElementById("wipeAll").click();
        return { n1, n2: window.__LQOMRP.state.exams.length, ls: localStorage.getItem("lqomr-v1"), ws: document.getElementById("ws").hidden };
      });
      assert(r.n1 === 1 && r.n2 === 0 && r.ls === null && r.ws, JSON.stringify(r));
    });
    await page.close();
  } finally { await browser.close(); }
}
