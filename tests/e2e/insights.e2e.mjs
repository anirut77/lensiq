// tests/e2e/insights.e2e.mjs — insights.html analytics layer: demo data (9 weeks) -> every section renders, every range/compare
// option re-renders without errors, small-data honesty ("ข้อมูลยังน้อย"), goals + alert rules (iq-goals / iq-alerts),
// printable report (print media), analysis export has no personal data, no overflow at 390 / 1280 px,
// privacy: no network except same-origin static files + Google Fonts, and /api/agg only when a hub is configured.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const FONT = /fonts\.(googleapis|gstatic)\.com/;
const unexpected = page => page.consoleErrors.filter(e => !(e.kind === "log" && (FONT.test(e.url || e.text || "") || /favicon/.test(e.url || ""))));

// elements whose box sticks out of the viewport (ignores scroll containers, hidden and closed <details>)
function overflowing() {
  const W = document.documentElement.clientWidth, bad = [];
  for (const n of document.querySelectorAll("main *")) {
    if (n.closest(".tw, .sr, [hidden], details:not([open]) > :not(summary), .iq-tip")) continue;
    const r = n.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && (r.right > W + 1 || r.left < -1)) bad.push(`${n.tagName.toLowerCase()}#${n.id}.${String(n.className && n.className.baseVal != null ? n.className.baseVal : n.className).slice(0, 30)} ${Math.round(r.left)}..${Math.round(r.right)}`);
  }
  return { W, scroll: document.documentElement.scrollWidth, bad: bad.slice(0, 8) };
}
function sections() {
  const vis = s => { const e = document.querySelector(s); return !!e && !e.hidden && e.offsetParent !== null; };
  const q = s => document.querySelectorAll(s).length;
  return {
    summary: vis("#summary"), ins: q("#insightCards .ins"), kpis: q("#kpis .kpi"), sparks: q("#kpis .spark"), ci: q("#kpis .ci"),
    trend: vis("#trendChart svg"), heat: vis("#heatCard") ? q("#heatChart rect.hc") : 0, fcBand: q("#fcChart path.fc-band"), anom: q("#fcChart circle.anom"),
    funnel: q("#storeFunnel .fn-row"), corr: q("#corrBody .corr"), ab: q("#abBody .ab-row"), cams: q("#camBody tbody tr"), cohort: q("#cohortBody tbody tr"),
    goalForm: q("#goalForm input"), alertForm: q("#alertForm input"), drill: q("#modules details.drill"), report: vis("#reportCard"),
    text: document.getElementById("insightCards").textContent
  };
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  const url = `${base}/insights.html`;
  let page;
  try {
    await check("demo data: every analytics section renders, no console errors, no NaN/undefined text", async () => {
      // The demo seeds "today" only up to the current hour; before opening time (e.g. 03:00) today has no
      // traffic and the queue alert cannot fire. Pin the page clock to 15:00 local so the run is time-of-day independent.
      const pinClock = `(() => { const R = Date, real = R.now(), t = new R(real); t.setHours(15, 0, 0, 0); const off = t.getTime() - real;
        class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } }
        window.Date = D; })();`;
      page = await browser.newPage(url, { initScripts: [pinClock] });
      await page.evaluate(() => { localStorage.clear(); });
      await page.reload();
      await page.evaluate(() => document.getElementById("seedDemoEmpty").click());
      await page.waitFor(`document.querySelectorAll("#insightCards .ins").length >= 4`, 8000);
      await sleep(300);
      const s = await page.evaluate(sections);
      assert(s.summary && s.ins >= 6, "summary cards " + s.ins);
      assert(s.kpis >= 6 && s.sparks >= 4 && s.ci >= 3, `kpis ${s.kpis} sparks ${s.sparks} ci ${s.ci}`);
      assert(s.trend, "trend chart");
      assert(s.heat >= 7 * 10, "heatmap cells " + s.heat);
      assert(s.fcBand === 1 && s.anom >= 1, `forecast band ${s.fcBand} anomalies ${s.anom}`);
      assert(s.funnel >= 4, "store funnel rows " + s.funnel);
      assert(s.corr >= 2, "correlations " + s.corr);
      assert(s.ab >= 6, "A/B rows " + s.ab);
      assert(s.cams === 2, "camera rows " + s.cams);
      assert(s.cohort >= 4, "cohort rows " + s.cohort);
      assert(s.goalForm >= 5 && s.alertForm >= 5, "forms");
      assert(s.drill >= 4, "drill-downs " + s.drill);
      assert(s.report, "report card");
      const body = await page.evaluate(() => document.querySelector("main").innerText);
      assert(!/NaN|undefined|Infinity|\[object/.test(body), "bad text: " + (body.match(/.{0,40}(NaN|undefined|Infinity|\[object).{0,40}/) || [""])[0]);
      assert(/มั่นใจ/.test(s.text) && /ควรทำ/.test(s.text), "insight cards carry confidence + action");
      // statistics layer: p-values worded correctly, BH-adjusted labels, method help, shrunk A/B values, autocorrelation-aware r
      const st = await page.evaluate(() => ({
        stat: [...document.querySelectorAll("#insightCards .ins-stat p:first-of-type")].map(p => p.textContent),
        help: !!document.querySelector("#methodHelp summary") && /Benjamini–Hochberg/.test(document.getElementById("methodHelp").textContent),
        abShrunk: [...document.querySelectorAll("#abBody .ab-v")].filter(e => /ปรับ/.test(e.textContent)).length,
        abMarks: document.querySelectorAll("#abBody .ab-s").length,
        corr: document.getElementById("corrBody").textContent,
        all: document.querySelector("main").textContent,
        multi: __IQ.last.A.multi
      }));
      assert(st.stat.length >= 2 && st.stat.every(t => /^ถ้า.+โอกาสเห็น.+หรือมากกว่า/.test(t)), "p-value wording: " + st.stat.slice(0, 2));
      assert(!/บังเอิญไม่ถึง|โอกาสเป็นความบังเอิญ/.test(st.all), "p-value misread as probability of chance");
      assert(st.help, "วิธีคำนวณ help");
      assert(st.abShrunk >= 6 && st.abMarks >= 6, `A/B raw + shrunk ${st.abShrunk}/${st.abMarks}`);
      assert(/หลังตัดผลวันในสัปดาห์/.test(st.corr) && /ข้อมูลอิสระได้ราว/.test(st.corr), "correlation labelled as weekday-adjusted with n_eff");
      assert(st.multi && st.multi.m >= 3 && st.multi.method === "BH", "BH family " + JSON.stringify(st.multi));
      const A = await page.evaluate(() => ({ an: __IQ.last.A.forecast.anomalies.map(a => a.day), method: __IQ.last.A.forecast.fc.method, days: __IQ.last.A.H.keys.length }));
      assert(A.method === "holt-winters", "forecast method " + A.method);
      assert(A.an.length >= 1 && A.an.length <= 4, "anomalies " + A.an);
      const errs = unexpected(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
    });

    await check("every range preset, custom range and compare option re-render without errors", async () => {
      for (const p of ["today", "d7", "d30", "d90", "all", "custom", "d7"]) {
        await page.evaluate(p => document.querySelector(`.range button[data-p="${p}"]`).click(), p);
        await sleep(120);
        const n = await page.evaluate(() => document.querySelectorAll("#insightCards .ins").length);
        assert(n >= 1, `${p}: insight cards ${n}`);
      }
      await page.evaluate(() => document.querySelector('.range button[data-p="custom"]').click());
      const custom = await page.evaluate(() => {
        const f = document.getElementById("cFrom");
        f.value = __IQ.last.A.H.keys.at(-21); f.dispatchEvent(new Event("change"));
        return { hidden: document.getElementById("customRange").hidden, days: __IQ.last.r.days };
      });
      assert(!custom.hidden && custom.days === 21, "custom range " + JSON.stringify(custom));
      for (const c of ["week", "none", "prev"]) {
        await page.evaluate(c => { const s = document.getElementById("compare"); s.value = c; s.dispatchEvent(new Event("change")); }, c);
        await sleep(100);
        const r = await page.evaluate(() => ({ cmp: __IQ.last.r.compare, prev: __IQ.last.r.prev }));
        assert(r.cmp === c && (c === "none" ? !r.prev : !!r.prev), `compare ${c}: ` + JSON.stringify(r));
      }
      await page.evaluate(() => document.querySelector('.range button[data-p="d30"]').click());
      await page.evaluate(() => document.getElementById("insightMore").click());
      const all = await page.evaluate(() => ({ shown: document.querySelectorAll("#insightCards .ins").length, total: __IQ.last.cards.length }));
      assert(all.shown === all.total, "show all insights " + JSON.stringify(all));
      assert(!unexpected(page).length, "console errors: " + JSON.stringify(unexpected(page).slice(0, 3)));
    });

    await check("goals (iq-goals) and alert rules (iq-alerts) evaluate on load with in-page notifications", async () => {
      await page.evaluate(() => {
        const g = document.getElementById("goalForm"); g.closest("details").open = true;
        g.elements.storeInDay.value = "250"; g.elements.convPct.value = "5"; g.requestSubmit();
        const a = document.getElementById("alertForm"); a.elements.queueWaitMin.value = "0.5"; a.elements.convDropPct.value = ""; a.requestSubmit();
      });
      await page.reload();
      const r = await page.waitFor(`(() => { const g = document.querySelectorAll("#goalBody .goal").length, a = document.querySelectorAll("#alerts .alert").length; return g === 2 && a >= 1 && { g, a, ls: [localStorage.getItem("iq-goals"), localStorage.getItem("iq-alerts")], text: document.getElementById("alerts").textContent }; })()`, 5000);
      assert(/คิว/.test(r.text), "queue alert text " + r.text);
      assert(JSON.parse(r.ls[0]).storeInDay === 250 && JSON.parse(r.ls[1]).queueWaitMin === 0.5 && JSON.parse(r.ls[1]).convDropPct === null, "stored rules " + r.ls);
      const card = await page.evaluate(() => [...document.querySelectorAll("#insightCards .ins h3")].map(h => h.textContent));
      assert(card[0] && /คิว/.test(card[0]), "alert ranks first among insights: " + card[0]);
    });

    await check("printable weekly/daily report: print media shows only the report", async () => {
      const r = await page.evaluate(() => { const w = __IQ.report("week"); return { title: w.title, ins: document.querySelectorAll("#report .rp-ins").length, kpi: document.querySelectorAll("#report tbody tr").length }; });
      assert(r.title === "รายงานประจำสัปดาห์" && r.ins >= 3 && r.kpi >= 5, "weekly report " + JSON.stringify(r));
      await page.send("Emulation.setEmulatedMedia", { media: "print" });
      const pm = await page.evaluate(() => ({ rep: getComputedStyle(document.getElementById("report")).display, main: getComputedStyle(document.querySelector("main")).display, nav: getComputedStyle(document.getElementById("siteNav")).display }));
      await page.send("Emulation.setEmulatedMedia", { media: "" });
      assert(pm.rep === "block" && pm.main === "none" && pm.nav === "none", "print media " + JSON.stringify(pm));
      const d = await page.evaluate(() => { const w = __IQ.report("day"); return { title: w.title, from: w.from, to: w.to }; });
      assert(d.title === "รายงานประจำวัน" && d.from === d.to, "daily report " + JSON.stringify(d));
    });

    await check("analysis export (JSON/CSV) has numbers only, no member names or contacts", async () => {
      const x = await page.evaluate(() => { const { D, A, cards } = __IQ.last; const j = JSON.stringify(iqAnalysisJson(D, A, cards)), c = iqAnalysisCsv(A); return { j, c: c.slice(0, 400), len: j.length }; });
      assert(!/คุณ|phone|consent|iqdemo-m|data:image/.test(x.j), "analysis JSON leaks member data");
      assert(/"format":"lensiq-analysis"/.test(x.j) && /"forecast":\{/.test(x.j), "analysis JSON shape");
      assert(/^﻿วันที่,วัน,คนเข้าร้าน/.test(x.c), "csv header " + x.c.slice(0, 60));
    });

    for (const [w, h, mobile] of [[390, 844, true], [1280, 900, false]]) {
      await check(`no horizontal overflow at ${w} px (sections open)`, async () => {
        await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
        await page.reload();
        await page.waitFor(`document.querySelectorAll("#insightCards .ins").length >= 4`, 5000);
        await page.evaluate(() => { document.querySelectorAll("main details").forEach(d => { d.open = true; }); });
        await sleep(400);
        const o = await page.evaluate(overflowing);
        assert(o.scroll <= o.W + 1 && !o.bad.length, `overflow at ${w}: ` + JSON.stringify(o));
      });
    }
    await page.send("Emulation.clearDeviceMetricsOverride");
    await check("390 px touch: every control in main ≥ 44 px tall, no text under 12 px; data-reliability panel shows the injected outage", async () => {
      await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await page.send("Emulation.setTouchEmulationEnabled", { enabled: true });
      await page.reload();
      await page.waitFor(`document.querySelectorAll("#insightCards .ins").length >= 4`, 5000);
      await page.evaluate(() => { document.querySelector('.range button[data-p="d30"]').click(); document.querySelectorAll("main details").forEach(d => { d.open = true; }); });
      await sleep(400);
      const m = await page.evaluate(() => {
        const vis = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0; };
        const ctl = [...document.querySelectorAll("main a, main button, main select, main input, main summary")].filter(e => vis(e) && e.type !== "hidden" && e.type !== "file" && !(e.type === "checkbox" && e.closest("label")));
        const small = ctl.filter(e => e.getBoundingClientRect().height < 44).map(e => e.tagName + "." + e.className + " " + Math.round(e.getBoundingClientRect().height));
        const text = [...document.querySelectorAll("main *")].filter(e => vis(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim()));
        const tiny = text.filter(e => parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.tagName + "." + (e.className.baseVal ?? e.className) + " " + getComputedStyle(e).fontSize);
        return { n: ctl.length, small: small.slice(0, 5), tiny: tiny.slice(0, 5), qual: !document.getElementById("qualCard").hidden && document.getElementById("qualBody").textContent };
      });
      await page.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      assert(m.n > 30 && !m.small.length, "controls under 44 px: " + JSON.stringify(m.small));
      assert(!m.tiny.length, "text under 12 px: " + JSON.stringify(m.tiny));
      assert(m.qual && /12:00–21:59|กล้องดับ/.test(m.qual), "reliability panel " + String(m.qual).slice(0, 200));
    });

    await check("TH | 中文: switching to Chinese re-renders static and generated text; back to Thai restores it", async () => {
      await page.waitFor(`!!window.LQI18N`, 5000);
      const zh = await page.evaluate(async () => { LQI18N.setLang("zh"); await new Promise(r => setTimeout(r, 300)); return { h1: document.querySelector("main h1").textContent, card: document.querySelector("#insightCards h3").textContent, sure: document.querySelector("#insightCards .ins-sure").textContent, lang: document.documentElement.lang }; });
      assert(zh.h1 === "综合仪表板" && /[\u4e00-\u9fff]/.test(zh.card) && /置信度/.test(zh.sure) && zh.lang === "zh-Hans", "zh " + JSON.stringify(zh));
      // ≥ 98% of visible letters are Chinese in 中文 mode (all sections and "details" opened, every range preset; ฿ counts as Thai)
      const share = await page.evaluate(async () => {
        const out = [];
        for (const p of ["today", "d7", "d30", "d90", "all"]) {
          document.querySelector(`.range button[data-p="${p}"]`).click(); await new Promise(r => setTimeout(r, 250));
          document.querySelectorAll("main details").forEach(d => { d.open = true; });
          let th = 0, zh = 0; const bad = [];
          const w = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT);
          for (let n; (n = w.nextNode());) { const el = n.parentElement; if (!el || el.closest("[hidden],script,style") || getComputedStyle(el).display === "none") continue; const t = n.textContent; const a = (t.match(/[\u0E00-\u0E7F]/g) || []).length; th += a; zh += (t.match(/[\u4e00-\u9fff]/g) || []).length; if (a) bad.push(t.trim().slice(0, 40)); }
          document.querySelectorAll("main [aria-label], main [title]").forEach(e => { for (const v of [e.getAttribute("aria-label"), e.getAttribute("title")]) if (v && /[\u0E00-\u0E7F]/.test(v)) { th += 1; bad.push("attr:" + v.slice(0, 40)); } });
          out.push({ p, share: zh / Math.max(1, zh + th), bad: bad.slice(0, 5) });
        }
        return out;
      });
      share.forEach(x => assert(x.share >= 0.98, `中文 share ${x.p} ${(x.share * 100).toFixed(1)}%: ${x.bad.join(" | ")}`));
      const th = await page.evaluate(async () => { LQI18N.setLang("th"); await new Promise(r => setTimeout(r, 300)); return { h1: document.querySelector("main h1").textContent, sure: document.querySelector("#insightCards .ins-sure").textContent }; });
      assert(th.h1 === "แดชบอร์ดรวม" && /ความมั่นใจ/.test(th.sure), "th " + JSON.stringify(th));
      assert(!unexpected(page).length, "console errors: " + JSON.stringify(unexpected(page).slice(0, 3)));
    });

    await check("small data (< 7 days): says ข้อมูลยังน้อย, no fake confidence, no NaN", async () => {
      await page.evaluate(() => {
        localStorage.clear();
        const d = new Date(), key = k => { const x = new Date(d); x.setDate(x.getDate() - k); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
        for (let k = 1; k <= 3; k++) { const h = Array(24).fill(0); h[10] = 5 + k; h[15] = 8; localStorage.setItem("st-day-" + key(k), JSON.stringify({ date: key(k), in: 13 + k, out: 12, occ: 0, peak: 4, peakAt: 0, maxQueue: 1, hourly: { in: h, out: Array(24).fill(0) }, zones: {}, byCam: {}, zv: 2 })); }
      });
      await page.reload();
      const r = await page.waitFor(`(() => { const t = document.getElementById("insightCards").textContent; return t && { t, main: document.querySelector("main").innerText, strong: [...document.querySelectorAll("#insightCards .meter i.on")].length, cards: __IQ.last.cards.map(c => c.level) }; })()`, 5000);
      assert(/ข้อมูลยังน้อย/.test(r.t), "small-data notice");
      assert(!r.cards.includes("strong"), "no strong confidence on 3 days: " + r.cards);
      assert(!/NaN|undefined|Infinity/.test(r.main), "bad text in small-data view");
      assert(!unexpected(page).length, "console errors: " + JSON.stringify(unexpected(page).slice(0, 3)));
    });

    await check("privacy: only same-origin static files + Google Fonts; /api/agg only when a hub is configured", async () => {
      const p2 = await browser.newPage(null, { isolated: true });
      await p2.goto(url);
      await p2.evaluate(() => { localStorage.clear(); document.getElementById("seedDemoEmpty").click(); });
      await sleep(600);
      const origin = new URL(base).origin;
      const bad = p2.requests.filter(r => { if (/^(data|blob|about):/.test(r.url)) return false; const u = new URL(r.url); return !(u.origin === origin && !u.pathname.startsWith("/api/")) && !FONT.test(u.host); });
      assert(!bad.length, "unexpected requests: " + bad.map(r => r.url).join(", "));
      const ls = await p2.evaluate(() => Object.keys(localStorage).filter(k => /data:image/.test(localStorage.getItem(k))));
      assert(!ls.length, "images in localStorage " + ls);
      // hub configured -> one GET /api/agg (numbers only), nothing else to /api
      await p2.evaluate(() => localStorage.setItem("lq-agg", JSON.stringify({ role: "hub", code: "ABCD-EFGH" })));
      const n0 = p2.requests.length;
      await p2.reload(); await sleep(600);
      const api = p2.requests.slice(n0).filter(r => { try { return new URL(r.url).pathname.startsWith("/api/"); } catch { return false; } });
      assert(api.length >= 1 && api.every(r => r.method === "GET" && /\/api\/agg\?from=/.test(r.url)), "api requests " + api.map(r => r.method + " " + r.url).join(", "));
      const ex = p2.consoleErrors.filter(e => e.kind === "exception");
      assert(!ex.length, "exceptions " + JSON.stringify(ex));
      await p2.close();
    });
  } finally { await browser.close(); }
}
