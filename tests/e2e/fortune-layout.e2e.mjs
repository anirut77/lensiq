// tests/e2e/fortune-layout.e2e.mjs — FIXED TEST SET, owner order 2026-11-14 Part A, locked BEFORE the build
// (sha256 in evals-locks/fortune-layout.sha256 and ~/LENSIQ-field/evals/fortune-layout/locked.sha256). The pure half is
// tests/unit/fortune-layout.test.js.
// Every fortune page (CLAUDE.md category 6) is opened in Thai, English and Chinese; where the page has a reading, a reading
// is produced first (same recipes as fortune-sources.e2e.mjs). Then:
//   A1  no old "for entertainment" wording in what the page shows (visible text, folded read-more text, title, meta
//       description), and the new one-line notice is shown in the page language
//   A3  every reading group: a heading, a visible main point (.lq-gist), and when more text exists a real <button> "read more"
//       with aria-expanded / aria-controls, at least 44 × 44 px, that opens and closes by click and by the Enter key;
//       a long reading (4 groups or more) has an in-page menu (nav.lq-toc) whose links reach every group
//   A4  advice icons are inline SVG next to the text, colour swatches carry the real colour value and a text label, the
//       belief label is there, and all of it is hidden in the crisis state (data-lq-remedy)
//   A5  every notice shows one short line; the rest is behind a read-more button; the help line and the crisis card are
//       never collapsible (no read-more parts, nothing in them hidden, never inside a folded part)
//   no horizontal overflow at 360, 375 and 414 px (page, reading groups, menu, notices), with every group opened
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const OLD = {
  th: "เพื่อความบันเทิง",
  en: "\\bfor (?:the )?entertainment\\b|\\bentertainment(?: and [a-z ]+)? (?:only|purposes?|content|use)\\b|\\bfor fun only\\b|\\bjust for fun\\b",
  zh: "仅供娱乐|供娱乐|娱乐参考|娱乐内容|娱乐用途|依信仰娱乐|娱乐性质",
};
const LINE = {
  th: "เนื้อหานี้พัฒนาขึ้นจากองค์ความรู้ด้านโหราศาสตร์ เป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณและอ่านอย่างมีสติ เราไม่รับรองความถูกต้องของคำทำนาย",
  en: "judg(?:e)?ment[\\s\\S]*(?:do not|don't) guarantee", zh: "判断[\\s\\S]*不保证",
};
const MORE = { th: "อ่านเพิ่มเติม", en: "Read more", zh: "阅读更多" };
const NOTE_MAX = { th: 140, en: 210, zh: 80 };
const BELIEF_TH = "ตามความเชื่อ โปรดใช้วิจารณญาณ";

const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const ev = (page, fn, ...a) => page.evaluate(fn, ...a);
const sections = n => `document.querySelectorAll(".fa-section").length >= ${n} && !document.querySelector(".fa-loading, [aria-busy=true] .fa-section")`;
const setSel = (id, v) => `(() => { const e = document.getElementById(${S(id)}); e.value = ${S(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
const lcFill = async p => {
  await p.evaluate(() => {
    document.getElementById("lcDay").value = "12"; document.getElementById("lcMonth").value = "5"; document.getElementById("lcYear").value = "2533";
    document.getElementById("lcTime").value = "08:00"; document.querySelector("#lcForm button[type=submit]").click();
  });
  await p.waitFor(sections(2), 15000);
};
// page → read(page) produces a reading (null: no reading on that page)
const PAGES = {
  fortune: null, planner: null, luckycolor: null,
  iching: async p => { await ev(p, () => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); }); await p.waitFor(sections(3), 20000); },
  zodiac: async p => {
    await ev(p, () => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); });
    await p.waitFor(sections(3), 15000);
  },
  astro: async p => {
    await ev(p, setSel("asDay", "15")); await ev(p, setSel("asMonth", "5")); await ev(p, setSel("asYear", "2533"));
    await ev(p, () => document.getElementById("asForm").requestSubmit()); await p.waitFor(sections(3), 15000);
  },
  dream: async p => {
    await ev(p, setSel("drText", "ฝันเห็นงูใหญ่ในบ้าน แล้วนั่งเครื่องบินไปทะเล")); await p.waitFor(`!document.getElementById("drGo").disabled`, 5000);
    await ev(p, () => document.getElementById("drGo").click()); await p.waitFor(sections(3), 15000);
  },
  tarot: async p => {
    await ev(p, () => { document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click(); document.getElementById("trStart").click(); });
    await sleep(600); await ev(p, () => document.getElementById("trAuto").click()); await sleep(900); await ev(p, () => document.getElementById("trReveal").click());
    await p.waitFor(sections(3), 25000);
  },
  horoscope: async p => {
    await ev(p, setSel("hsDay", "15")); await ev(p, setSel("hsMonth", "8")); await ev(p, setSel("hsYear", "1990"));
    await ev(p, () => document.getElementById("hsGo").click()); await p.waitFor(sections(3), 20000);
  },
  numbers: async p => { await ev(p, setSel("nmPhone", "0812345678")); await ev(p, () => document.getElementById("nmGo").click()); await p.waitFor(sections(2), 15000); },
  fengshui: async p => {
    await ev(p, setSel("fsDay", "15")); await ev(p, setSel("fsMonth", "6")); await ev(p, setSel("fsYear", "2533"));
    await ev(p, () => document.getElementById("fsKuaForm").requestSubmit()); await sleep(500); await ev(p, () => document.getElementById("fsReadBtn").click());
    await p.waitFor(sections(2), 15000);
  },
  bazi: lcFill, taksa: lcFill, lek7: lcFill, lifegraph: lcFill,
  report: async p => {
    await p.waitFor(() => window.__rp && document.getElementById("rpMode").textContent.length > 10, 8000);
    await ev(p, () => {
      document.querySelector('[data-rp-type="report_basic"]').click();
      document.getElementById("rpAYear").value = document.documentElement.lang === "th" ? "2533" : "1990"; document.getElementById("rpGo").click();
    });
    await p.waitFor(() => document.querySelectorAll("#rpOut .rp-part").length >= 3, 10000);
  },
  faceread: async p => {
    await ev(p, () => document.getElementById("frStartCam").click());
    await p.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
    await ev(p, d => { window.__dets = d; }, [FACE]);
    await p.waitFor(`!document.getElementById("frRead").disabled`, 8000);
    await ev(p, () => document.getElementById("frRead").click());
    await p.waitFor(`!document.getElementById("frResult").hidden && ` + sections(3), 20000);
  },
  palm: async p => {
    await p.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
    await ev(p, () => document.getElementById("plStartCam").click());
    await p.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 10000);
    await ev(p, d => { window.__dets = d; }, [HAND]);
    await sleep(600);
    await ev(p, () => document.getElementById("plSnap").click());
    await p.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
    await ev(p, () => document.getElementById("plRead").click());
    await p.waitFor(`!document.getElementById("plResult").hidden && document.querySelectorAll("#plNarr .fa-section").length >= 3`, 20000);
  },
};
const CAM = new Set(["faceread", "palm"]);

/* what the page shows, for the wording check: visible text + folded read-more text + title + meta description */
const WORDING = `((oldRe, lineRe) => {
  const old = new RegExp(oldRe, "i"), line = new RegExp(lineRe);
  const folded = [...document.querySelectorAll(".lq-more-body, .lq-notice-more")].map(e => e.textContent).join("\\n");
  const meta = [...document.querySelectorAll('meta[name="description"], meta[property^="og:"]')].map(m => m.content || "").join("\\n");
  const all = [document.body.innerText, folded, document.title, meta].join("\\n");
  const m = all.match(old);
  const lines = [...document.querySelectorAll('[data-i18n="fortune.disc.line"], .lq-disc-line')].filter(e => {
    const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0; });
  return { old: m ? all.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\\s+/g, " ") : "", lineShown: lines.some(e => line.test(e.textContent)),
    lineTexts: lines.map(e => e.textContent.slice(0, 80)) };
})`;

/* structure of every reading group on the page */
const STRUCT = `(() => {
  const vis = e => { if (!e) return false; const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0; };
  const groups = [...document.querySelectorAll(".fa-section")].filter(g => !g.closest(".fa-support"));
  const out = { n: groups.length, bad: [], buttons: 0, tocs: [], panels: [] };
  for (const g of groups) {
    const id = g.getAttribute("data-section") || "?";
    const h = g.querySelector("h3, h4");
    if (!h || !h.textContent.trim()) out.bad.push(id + ": no heading");
    if (g.closest(".lq-more-body")) continue; // a group inside a folded part is checked when opened
    // a group in a page tab that is not selected (e.g. horoscope "today") is checked after its tab is opened (harness below)
    const panel = g.closest('[role="tabpanel"]');
    if (panel && (panel.hidden || getComputedStyle(panel).display === "none")) { out.panels.push(panel.id); continue; }
    const gist = g.querySelector(".lq-gist");
    if (!gist || !vis(gist) || gist.textContent.trim().length < 8) out.bad.push(id + ": no visible main point");
    const bodies = [...g.querySelectorAll(".lq-more-body")].filter(b => b.closest(".fa-section") === g);
    if (!bodies.length) continue;
    const btn = [...g.querySelectorAll("button.lq-more")].find(b => b.closest(".fa-section") === g);
    if (!btn) { out.bad.push(id + ": folded text but no read-more button"); continue; }
    out.buttons++;
    const r = btn.getBoundingClientRect();
    if (r.height < 44 || r.width < 44) out.bad.push(id + ": button " + r.width.toFixed(0) + "x" + r.height.toFixed(0));
    if (btn.getAttribute("aria-expanded") !== "false") out.bad.push(id + ": aria-expanded " + btn.getAttribute("aria-expanded"));
    const ctl = (btn.getAttribute("aria-controls") || "").split(/\\s+/).filter(Boolean);
    if (!ctl.length || ctl.some(x => !document.getElementById(x))) out.bad.push(id + ": aria-controls " + ctl.join(","));
    if (bodies.some(vis)) out.bad.push(id + ": folded text visible before opening");
  }
  for (const t of document.querySelectorAll("nav.lq-toc")) {
    const links = [...t.querySelectorAll('a[href^="#"]')];
    out.tocs.push({ links: links.length, missing: links.filter(a => !document.getElementById(a.getAttribute("href").slice(1))).length,
      small: links.filter(a => a.getBoundingClientRect().height < 44).length, label: t.getAttribute("aria-label") || "" });
  }
  out.containers = [...new Set(groups.map(g => g.parentElement && (g.parentElement.closest("[id]") || {}).id))].filter(Boolean);
  out.maxPerContainer = Math.max(0, ...out.containers.map(c => groups.filter(g => g.parentElement.closest("[id]") && g.parentElement.closest("[id]").id === c).length));
  return out;
})()`;

/* notices: one short line visible, rest folded; help line and crisis card never collapsible */
const NOTICES = `((max) => {
  const vis = e => { if (!e) return false; const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0; };
  const never = ".lq-helpline, .fa-support";
  const bad = [];
  const shownText = el => { let t = ""; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const p = n.parentElement; if (!p || p.closest("button, svg, .lq-notice-more, .lq-more-body") || !vis(p)) continue; t += n.textContent; }
    return t.replace(/\\s+/g, " ").trim(); };
  const notes = [...document.querySelectorAll('[role="note"], .fa-reminder, [class*="disclaimer"], [class*="disc-mini"], .ft-note, .pd-note')]
    .filter(e => !e.closest(never) && !e.matches(never) && vis(e) && !e.parentElement.closest('[role="note"], .fa-reminder, [class*="disclaimer"]'));
  for (const n of notes) {
    const t = shownText(n);
    if (t.length > max) bad.push("long notice (" + t.length + "): " + t.slice(0, 70));
    const more = n.querySelector(".lq-notice-more");
    if (more) {
      const b = n.querySelector("button.lq-more");
      if (!b) bad.push("folded notice without button: " + t.slice(0, 50));
      else { const r = b.getBoundingClientRect(); if (r.height < 44) bad.push("notice button " + r.height.toFixed(0) + " px");
        if (!/^(?:true|false)$/.test(b.getAttribute("aria-expanded") || "")) bad.push("notice button aria-expanded"); }
    }
  }
  const help = [...document.querySelectorAll(never)];
  for (const h of help) {
    if (h.querySelector("button.lq-more, .lq-more-body, .lq-notice-more, details")) bad.push("collapsible parts inside " + h.className);
    if (h.closest(".lq-more-body, .lq-notice-more, details:not([open])")) bad.push(h.className + " sits inside a folded part");
    if (h.classList.contains("lq-notice")) bad.push(h.className + " made a notice");
  }
  return { n: notes.length, help: help.length, bad };
})`;

const OVERFLOW = `(() => {
  const w = document.documentElement.clientWidth, bad = [];
  if (document.documentElement.scrollWidth > w + 1) bad.push("page " + document.documentElement.scrollWidth + " > " + w);
  const scrollsX = e => { for (let p = e.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return true; } return false; };
  for (const e of document.querySelectorAll(".fa-section, .fa-section *, .lq-toc, .lq-toc *, .lq-notice, .lq-notice *, .lq-advice, .lq-advice *, .fa-summary, .fa-plan")) {
    const r = e.getBoundingClientRect(); if (!r.width) continue;
    if ((r.right > w + 1 || r.left < -1) && !scrollsX(e)) { bad.push((e.className || e.tagName) + " " + r.left.toFixed(0) + ".." + r.right.toFixed(0) + " / " + w); if (bad.length > 5) break; }
  }
  return bad;
})()`;

const openAll = `(() => { let n = 0;
  for (const b of document.querySelectorAll("button.lq-more")) if (b.getAttribute("aria-expanded") === "false" && !b.closest(".lq-helpline, .fa-support")) { b.click(); n++; }
  document.querySelectorAll("details").forEach(d => { d.open = true; }); return n; })()`;

async function openPage(browser, base, fakeCams, p, lang, width) {
  const init = [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`].concat(CAM.has(p) ? [fakeCams, detScript] : []);
  const page = await browser.newPage(null, { initScripts: init, isolated: p === "report" });
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/${p}.html${CAM.has(p) ? "?cpu&fakedet&nosw" : "?nosw"}`);
  await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])}`, 10000);
  await sleep(500);
  return page;
}
async function key(page, k) {
  const code = { Enter: 13 }[k];
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const lang of LANGS) {
      await check(`A1 + A3 + A5 (${lang}): every fortune page: no old wording, the new line, reading groups with read more, short notices, help line never folded`, async () => {
        const bad = [], rows = [];
        for (const [p, readIt] of Object.entries(PAGES)) {
          const page = await openPage(browser, base, fakeCams, p, lang, 375);
          try {
            if (readIt) await readIt(page);
            await sleep(500);
            const w = await page.evaluate(`${WORDING}(${S(OLD[lang] + "|" + OLD.th)}, ${S(LINE[lang])})`);
            if (w.old) bad.push(`${p}: old wording "${w.old}"`);
            if (!w.lineShown) bad.push(`${p}: new line not shown (${S(w.lineTexts)})`);
            const n = await page.evaluate(`${NOTICES}(${NOTE_MAX[lang]})`);
            for (const b of n.bad) bad.push(`${p}: ${b}`);
            if (n.help < 1) bad.push(`${p}: no help line found`);
            if (readIt) {
              const st = await page.evaluate(STRUCT);
              if (st.n < 2) bad.push(`${p}: only ${st.n} reading groups`);
              for (const b of st.bad) bad.push(`${p}: ${b}`);
              // open each page tab that holds a reading and check its groups the same way
              for (const id of [...new Set(st.panels)]) {
                const opened = await page.evaluate(`(() => { const t = document.querySelector('[role="tab"][aria-controls=${S(id)}]'); if (!t) return false; t.click(); return true; })()`);
                if (!opened) { bad.push(`${p}: reading in hidden panel #${id} without a tab`); continue; }
                await sleep(300);
                const s2 = await page.evaluate(STRUCT);
                if (s2.panels.includes(id)) bad.push(`${p}: panel #${id} still hidden after opening its tab`);
                for (const b of s2.bad) bad.push(`${p} #${id}: ${b}`);
              }
              if (st.maxPerContainer >= 4 && !st.tocs.some(t => t.links >= 4 && !t.missing)) bad.push(`${p}: long reading (${st.maxPerContainer} groups) without an in-page menu ${S(st.tocs)}`);
              for (const t of st.tocs) {
                if (t.missing) bad.push(`${p}: menu link without target`);
                if (t.small) bad.push(`${p}: ${t.small} menu links under 44 px`);
                if (!t.label) bad.push(`${p}: menu without aria-label`);
              }
              // read-more label in the page language
              const lbl = await page.evaluate(`[...document.querySelectorAll(".fa-section button.lq-more")].map(b => b.textContent.trim())`);
              if (lbl.some(t => !t.includes(MORE[lang]))) bad.push(`${p}: read-more label ${S(lbl.slice(0, 2))}`);
              rows.push(p + ":" + st.n + "/" + st.buttons + (st.tocs.length ? "+menu" : ""));
            }
          } catch (e) { bad.push(`${p}: ${e.message}`); } finally { await page.close(); }
        }
        console.log("    " + lang + " " + rows.join(" "));
        assert(!bad.length, bad.length + " problem(s):\n" + bad.slice(0, 60).join("\n"));
      });
    }

    await check("A3: read more opens and closes by click and by the Enter key (aria-expanded follows), folded text appears; menu links jump to groups", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await openPage(browser, base, fakeCams, "horoscope", lang, 375);
        try {
          await PAGES.horoscope(page); await sleep(400);
          const r = await page.evaluate(`(() => {
            const vis = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0; };
            const b = [...document.querySelectorAll(".fa-section button.lq-more")][0]; if (!b) return { none: true };
            const ids = b.getAttribute("aria-controls").split(/\\s+/), bodies = ids.map(i => document.getElementById(i));
            const before = bodies.some(vis); b.click();
            const open = b.getAttribute("aria-expanded"), shown = bodies.every(vis), label = b.textContent.trim(); b.click();
            const closed = b.getAttribute("aria-expanded"), hidden = !bodies.some(vis); b.focus();
            return { before, open, shown, closed, hidden, label, focused: document.activeElement === b, tag: b.tagName, type: b.type };
          })()`);
          if (r.none) { bad.push(lang + ": no read-more button in the horoscope reading"); continue; }
          if (r.before || r.open !== "true" || !r.shown || r.closed !== "false" || !r.hidden) bad.push(lang + ": click toggle " + S(r));
          if (r.tag !== "BUTTON" || r.type !== "button" || !r.focused) bad.push(lang + ": not a focusable button " + S(r));
          await key(page, "Enter"); await sleep(100);
          const k1 = await page.evaluate(`(() => { const b = document.activeElement; return { exp: b.getAttribute("aria-expanded"),
            shown: b.getAttribute("aria-controls").split(/\\s+/).every(i => getComputedStyle(document.getElementById(i)).display !== "none") }; })()`);
          await key(page, "Enter"); await sleep(100);
          const k2 = await page.evaluate(`document.activeElement.getAttribute("aria-expanded")`);
          if (k1.exp !== "true" || !k1.shown || k2 !== "false") bad.push(lang + ": Enter key toggle " + S({ k1, k2 }));
          const toc = await page.evaluate(`(() => { const a = document.querySelector("nav.lq-toc a[href^='#']"); if (!a) return null; const id = a.getAttribute("href").slice(1); a.click();
            return { id, exists: !!document.getElementById(id), hash: location.hash }; })()`);
          if (toc && !toc.exists) bad.push(lang + ": menu link target missing " + S(toc));
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.join("\n"));
    });

    await check("no horizontal overflow at 360 / 375 / 414 px on every reading page (Thai), with every group opened", async () => {
      const bad = [];
      for (const [p, readIt] of Object.entries(PAGES)) {
        const page = await openPage(browser, base, fakeCams, p, "th", 375);
        try {
          if (readIt) await readIt(page);
          await sleep(300);
          await page.evaluate(openAll); await sleep(200);
          for (const w of [360, 375, 414]) {
            await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 2, mobile: true }); await sleep(250);
            for (const b of await page.evaluate(OVERFLOW)) bad.push(`${p} @${w}: ${b}`);
          }
        } catch (e) { bad.push(`${p}: ${e.message}`); } finally { await page.close(); }
      }
      assert(!bad.length, bad.length + " overflow(s):\n" + bad.slice(0, 40).join("\n"));
    });

    await check("A4: advice icons (inline SVG) and colour swatches with the real colour and a text label, belief label; hidden in the crisis state", async () => {
      const bad = [], seen = [];
      for (const p of ["horoscope", "zodiac", "bazi", "taksa", "astro"]) {
        const page = await openPage(browser, base, fakeCams, p, "th", 375);
        try {
          await PAGES[p](page); await sleep(300); await page.evaluate(openAll); await sleep(150);
          const r = await page.evaluate(`(() => {
            const items = [...document.querySelectorAll(".lq-advice")];
            const toRgb = h => { const n = parseInt(h.slice(1), 16); return "rgb(" + (n >> 16) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ")"; };
            return items.map(it => ({
              remedy: !!it.closest("[data-lq-remedy]"), svg: it.querySelectorAll("svg").length, img: it.querySelectorAll("img, image, use").length,
              belief: (it.querySelector(".lq-belief") || {}).textContent || "",
              sw: [...it.querySelectorAll(".lq-sw")].map(s => { const chip = s.querySelector(".lq-sw-chip"), hex = s.getAttribute("data-hex") || "";
                return { hex, bg: chip ? getComputedStyle(chip).backgroundColor : "", want: /^#[0-9a-f]{6}$/i.test(hex) ? toRgb(hex) : "?", label: s.textContent.trim() }; }),
            }));
          })()`);
          seen.push(p + ":" + r.length + "/" + r.reduce((a, x) => a + x.sw.length, 0));
          for (const it of r) {
            if (!it.remedy) bad.push(p + ": advice item not marked data-lq-remedy");
            if (it.svg < 1) bad.push(p + ": advice item without an inline SVG icon");
            if (it.img) bad.push(p + ": advice item uses an image");
            if (!it.belief.includes(BELIEF_TH)) bad.push(p + ": belief label missing: " + it.belief);
            for (const s of it.sw) { if (s.bg !== s.want) bad.push(`${p}: swatch ${s.label} colour ${s.bg} != ${s.want}`); if (!s.label) bad.push(p + ": swatch without a text label"); }
          }
          if (r.length) {
            const hidden = await page.evaluate(`(() => { document.documentElement.setAttribute("data-lq-crisis", "1");
              const v = [...document.querySelectorAll(".lq-advice")].filter(e => getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0).length;
              document.documentElement.removeAttribute("data-lq-crisis"); return v; })()`);
            if (hidden) bad.push(p + ": " + hidden + " advice items still shown in the crisis state");
          }
        } catch (e) { bad.push(`${p}: ${e.message}`); } finally { await page.close(); }
      }
      console.log("    advice items/swatches " + seen.join(" "));
      const total = seen.reduce((a, s) => a + Number(s.split(":")[1].split("/")[0]), 0), sw = seen.reduce((a, s) => a + Number(s.split("/")[1]), 0);
      assert(total >= 3 && sw >= 2, "advice items found: " + seen.join(" "));
      assert(!bad.length, bad.join("\n"));
    });

    await check("A5 exception: the crisis card (dream, typed crisis text) is shown in full, never collapsible, never inside a folded part", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await openPage(browser, base, fakeCams, "dream", lang, 375);
        try {
          await page.evaluate(() => { const t = document.getElementById("drText"); t.value = "ฝันว่าฆ่าตัวตาย อยากตายจริงๆ"; t.dispatchEvent(new Event("input")); });
          await page.waitFor(() => !!document.querySelector(".fa-support"), 5000);
          const r = await page.evaluate(`(() => {
            const vis = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0; };
            return [...document.querySelectorAll(".fa-support")].map(c => ({ shown: vis(c), parts: c.querySelectorAll("button.lq-more, .lq-more-body, .lq-notice-more, details").length,
              folded: !!c.closest(".lq-more-body, .lq-notice-more, details:not([open])"), hiddenLines: [...c.querySelectorAll("li, p, a")].filter(e => !vis(e)).length,
              tel: c.querySelectorAll('a[href^="tel:"]').length }));
          })()`);
          if (!r.length) bad.push(lang + ": no crisis card");
          for (const c of r) { if (!c.shown || c.parts || c.folded || c.hiddenLines || c.tel < 2) bad.push(lang + ": " + S(c)); }
          const n = await page.evaluate(`${NOTICES}(${NOTE_MAX[lang]})`);
          for (const b of n.bad.filter(b => /helpline|support|sits inside|made a notice|collapsible/.test(b))) bad.push(lang + ": " + b);
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.join("\n"));
    });
  } finally {
    await browser.close();
  }
}
