// tests/e2e/camera-mobile.e2e.mjs — camera pages at 390×844 (mobile, touch): every visible control is a touch target of
// at least 44×44 px (WCAG 2.5.5; inline links inside running text and controls inside a ≥44 px label are exempt) and no
// visible text is smaller than 12 px. Checked with the camera stopped (setup state) — the state a phone user lands in.
import { assert } from "./cdp.mjs";

const PAGES = ["cameras.html", "store.html", "booth.html", "signage.html", "attendance.html", "customers.html", "checkout.html", "qc.html", "driver.html", "neuro.html",
  // round 13: exam / gate / zone quick-win camera pages
  "exam-lab.html", "exam-hall.html", "exam-dashboard.html", "parking.html", "village.html", "queue.html", "tables.html", "afterhours.html", "bays.html",
  // round 14
  "crowd.html", "case-review.html", "medicine.html", "omr.html", "luckycolor.html"];
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function audit() {
  const vis = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0 && !e.closest("[hidden],.site-menu:not(.open) .nav-sub"); };
  const inText = e => e.tagName === "A" && e.closest("p,li,td,small,.hint,.note,figcaption,dd") && !e.classList.contains("btn");
  const ctl = [...document.querySelectorAll("button,a[href],input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab]")].filter(vis);
  const bad = [];
  for (const e of ctl) {
    if (inText(e) || e.closest("header.nav,#siteNav,footer")) continue;
    let r = e.getBoundingClientRect();
    if ((e.type === "checkbox" || e.type === "radio" || e.type === "color") && e.closest("label")) r = e.closest("label").getBoundingClientRect();
    if (e.type === "file" && e.closest("label")) r = e.closest("label").getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) bad.push(`${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : ""}${e.name ? "[" + e.name + "]" : ""} ${Math.round(r.width)}×${Math.round(r.height)} "${(e.textContent || e.value || "").trim().slice(0, 20)}"`);
  }
  const tiny = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement; if (!el || !vis(el) || el.closest("header.nav,#siteNav,svg,canvas,script,style,noscript")) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 11.95) tiny.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} ${fs}px "${n.nodeValue.trim().slice(0, 24)}"`);
  }
  return { bad, tiny: [...new Set(tiny)], sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const pg of PAGES) {
      await check(`mobile 390: ${pg} touch targets ≥ 44 px, text ≥ 12 px, no horizontal scroll`, async () => {
        const page = await browser.newPage(null, {});
        try {
          await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
          await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
          await page.goto(`${base}/${pg}?cpu&fakedet`);
          await sleep(700);
          const r = await page.evaluate(audit);
          assert(r.sw <= r.cw, `${pg} horizontal overflow ${r.sw}>${r.cw}`);
          assert(!r.bad.length, `${pg} small touch targets (${r.bad.length}): ${r.bad.slice(0, 12).join(" | ")}`);
          assert(!r.tiny.length, `${pg} text < 12 px (${r.tiny.length}): ${r.tiny.slice(0, 12).join(" | ")}`);
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
}
