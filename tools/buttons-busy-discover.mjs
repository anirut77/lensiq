#!/usr/bin/env node
// tools/buttons-busy-discover.mjs — finds the action buttons that start ASYNC work (owner report 2026-11-14: busy state +
// double-tap protection). For every ./*.html in headless Chrome at 375 px: every visible <button> / input submit whose
// text, id or aria-label matches ACTION_WORDS (start / camera / read / analyse / export / send / submit / save … in
// TH / EN / 中文) is tapped once (a trusted CDP mouse click) with getUserMedia and fetch delayed by 1.5 s and counted; a
// button that opened a camera, called fetch / XHR (outside vendor/ and i18n/) or saved a download within 1 s is listed.
// The output is the CANDIDATE list the fixed busy test set (tests/e2e/buttons-busy-list.json) is chosen from; this tool
// does not test anything itself.
//   node tools/buttons-busy-discover.mjs [--json out.json] [words...]
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PAGES, INIT } from "./buttons-probe.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ACTION_WORDS = "เริ่ม|เปิดกล้อง|กล้อง|วิเคราะห์|ส่งออก|ส่ง|อ่าน|ดาวน์โหลด|บันทึก|ตรวจ|สแกน|คำนวณ|ดูดวง|ทำนาย|สร้าง|ถ่าย|เข้าสู่ระบบ|ยืนยัน|" +
  "start|camera|analy|export|send|submit|read|download|save|scan|check|capture|sign in|login|confirm|generate";
// counts async work; getUserMedia and fetch / XHR wait LQ_DELAY ms (default 1500) so a second tap lands during the work
export const INSTRUMENT = `(() => {
  const W = window.__lqw = { gum: 0, fetch: 0, xhr: 0, dl: 0, urls: [] };
  const delay = () => new Promise(r => setTimeout(r, window.__lqDelay || 1500));
  const counted = u => {
    try { const p = new URL(u, location.href); return p.origin !== location.origin
      || !/^\\/(vendor|i18n|fonts)\\//.test(p.pathname.replace(/^\\/[^/]+(?=\\/(vendor|i18n|fonts)\\/)/, "")); } catch (e) { return true; } };
  try {
    const md = navigator.mediaDevices;
    if (md && md.getUserMedia) { const g = md.getUserMedia.bind(md); md.getUserMedia = async c => { W.gum++; await delay(); return g(c); }; }
  } catch (e) {}
  const f = window.fetch;
  window.fetch = async function (u, o) { const url = String(u && u.url || u); if (counted(url)) { W.fetch++; W.urls.push(url.slice(0, 120)); await delay(); } return f.apply(this, arguments); };
  const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__lqu = String(u); return open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () { if (counted(this.__lqu)) { W.xhr++; W.urls.push(this.__lqu.slice(0, 120)); } return send.apply(this, arguments); };
  const ac = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.hasAttribute("download")) { W.dl++; return; } return ac.apply(this, arguments); };
})();`;

function candidates(words) {
  const re = new RegExp(words, "i");
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 4 && r.height > 4 && s.visibility !== "hidden"; };
  const out = [];
  let i = 0;
  for (const el of document.querySelectorAll("button, input[type=submit], input[type=button]")) {
    if (el.closest("#siteNav, .lq-crumbs, .lq-legal-foot, .lang-switch") || el.disabled || !vis(el)) continue;
    const t = [(el.textContent || el.value || "").trim(), el.id, el.getAttribute("aria-label") || ""].join(" ");
    if (!re.test(t)) continue;
    el.setAttribute("data-lqbd", String(i));
    out.push({ i, id: el.id, text: (el.textContent || el.value || "").trim().replace(/\s+/g, " ").slice(0, 40), cls: typeof el.className === "string" ? el.className : "" });
    i++;
  }
  return out;
}

async function main() {
  const { launch } = await import("../tests/e2e/cdp.mjs");
  const { serve } = await import("./static-server.mjs");
  const argv = process.argv.slice(2);
  const jsonAt = argv.indexOf("--json"), jsonOut = jsonAt >= 0 ? argv[jsonAt + 1] : null;
  const words = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--json");
  const pages = PAGES.filter(f => !words.length || words.some(w => f.includes(w)));
  const srv = await serve(repo);
  const browser = await launch();
  const found = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try {
    for (const page of pages) {
      const url = `${srv.base}/${page}?cpu&nosw&lang=th`;
      const open = async () => {
        const p = await browser.newPage(null, { initScripts: [INIT, INSTRUMENT], isolated: true });
        await p.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 667, deviceScaleFactor: 1, mobile: true });
        await p.goto(url); await sleep(600);
        return p;
      };
      let p = await open();
      let list = [];
      try { list = await p.evaluate(candidates, ACTION_WORDS); } catch { /* page broke */ }
      for (const c of list) {
        try {
          const pt = await p.evaluate(i => { const el = document.querySelector(`[data-lqbd="${i}"]`); if (!el) return null;
            el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, c.i);
          if (!pt) continue;
          const before = await p.evaluate(() => JSON.stringify(window.__lqw));
          for (const type of ["mousePressed", "mouseReleased"]) await p.send("Input.dispatchMouseEvent", { type, x: pt.x, y: pt.y, button: "left", clickCount: 1 });
          await sleep(1000);
          const after = await p.evaluate(() => window.__lqw ? JSON.stringify(window.__lqw) : null);
          if (!after) { found.push({ page, ...c, work: "navigated" }); p.close().catch(() => {}); p = await open(); await p.evaluate(candidates, ACTION_WORDS); continue; }
          const b = JSON.parse(before), a = JSON.parse(after);
          const work = ["gum", "fetch", "xhr", "dl"].filter(k => a[k] > b[k]).map(k => `${k}+${a[k] - b[k]}`);
          if (work.length) {
            found.push({ page, ...c, work: work.join(" "), urls: a.urls.slice(b.urls.length, b.urls.length + 3) });
            console.log(`${page.padEnd(22)} #${c.id || "-"} "${c.text}" ${work.join(" ")} ${a.urls.slice(b.urls.length, b.urls.length + 2).join(" ")}`);
          }
        } catch (e) { /* skip this button */ }
      }
      await p.close().catch(() => {});
    }
  } finally { await browser.close(); await srv.close(); }
  console.log(`\n${found.length} button(s) started async work`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ when: new Date().toISOString(), found }, null, 1));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
