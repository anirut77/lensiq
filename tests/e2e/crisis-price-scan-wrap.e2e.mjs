// tests/e2e/crisis-price-scan-wrap.e2e.mjs — FIXED TEST SET "datefix-1122" (locked 2026-11-22 BEFORE any measurement; copy + sha256 in
// ~/LENSIQ-field/evals/datefix-1122/, evals-locks/datefix-1122.sha256). CI 44967706758 (2026-11-22): "palm [th]: crisis state after a
// reading -> no unmarked price / sales text visible" flagged [บาท] "แต่ละบาทไปไหน" (lq-t in #plNarr), the last words of the allow-listed
// reading sentence "คุณวางงบประมาณได้ละเอียด และรู้ว่าเงินแต่ละบาทไปไหน" (tests/unit/crisis-escape-guard-allow.json, browser: true), which
// nav.js's line-wrap (glue(), 2026-11-19) had moved into its own <lq-t> piece. The palm composer picks one of four money sentences at random
// (fortune-ai.js randomSeed), so the check failed on some readings only. This set pins the scan rule of crisis-price-scan-kit.mjs VISIBLE
// for every allow-listed browser text, whatever nav.js does to it, and adds two controls the old rule could not catch.
// On palm.html in the crisis state after a reading (the kit's own toCrisis flow), UI TH / EN / ZH, 375 px:
//   W1 every allow-listed browser text (priceText entries with browser: true), each as its own paragraph in a reading section inside
//      #plNarr, after nav.js has re-wrapped it: none is flagged;
//   W1n non-vacuous: in TH at least one injected paragraph has a scanner hit inside a nav.js wrap piece (lq-t / lq-run / lq-w), the
//      palm sentence above among them;
//   W2 the unit half's three unmarked price strings (SCAN.INJECT th / en / zh), each its own paragraph: each is flagged;
//   W3 an allow-listed sentence and an unmarked price string in ONE paragraph, both orders, TH / EN / ZH prices: the price is flagged (an allowed sentence covers only the
//      words inside it, not its neighbours);
//   W4 a hidden copy (display:none) of a price string: not flagged; after removing everything injected, nothing in the test section.
// RE-LOCK 1 2026-11-22 (datefix-1122 relock1, STRICTER, independent review): W5: a price that nav.js splits across a wrap piece
// ("99<lq-t>元 立即解锁</lq-t>": no hit in either node) is flagged: built split by hand (6 cases, TH / EN / ZH units USD / RMB / 元, each
// checked to hit only as a whole, W5n) and as one text left to nav.js (3 cases). IN_BOX also accepts the kit's "(across nodes)" entries.
// RE-LOCK 2 2026-11-22 (datefix-1122 relock2, STRICTER, after the independent review of crisis-v3-protect relock1): W6: hidden text never
// completes an allowed sentence. The kit builds a block's text from SHOWN text nodes only; nothing pinned that. Six allow-listed browser
// texts (TH palm sentence, EN "there is no need to buy anything new", ZH "...也不需要购买任何物品。") are each split into a VISIBLE part
// that holds the scanner hit and a HIDDEN part (after it, or before it), so only visible + hidden together form the allowed text. Each
// split x 4 ways of hiding (display:none, hidden attribute, visibility:hidden, opacity:0) = 24 cases per UI language: the visible hit is
// flagged. W6n: the parts join to the allowed text, the visible part alone has a hit and holds no allowed text, the hidden node is not
// shown by the kit's rule. W6c control: the same paragraph with the second part shown is not flagged (6 per UI language).
import { SCAN, VISIBLE, toCrisis } from "./crisis-price-scan-kit.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROWSER = JSON.parse(readFileSync(join(REPO, "tests/unit/crisis-escape-guard-allow.json"), "utf8")).priceText.filter(e => e.browser === true).map(e => e.text);
const PALM = "คุณวางงบประมาณได้ละเอียด และรู้ว่าเงินแต่ละบาทไปไหน";
const BOX = "lqWrapTest";
const INJ = `((list, hide) => {
  const host = document.getElementById("plNarr"); if (!host) return 0;
  const old = document.getElementById(${S(BOX)}); if (old) old.remove();
  const box = document.createElement("div"); box.id = ${S(BOX)}; box.className = "fa-section"; box.setAttribute("data-lq-test-inject", "");
  list.forEach((t, i) => { const p = document.createElement("p"); p.textContent = t; p.setAttribute("data-k", "a" + i); if (hide) p.style.display = "none"; box.appendChild(p); });
  host.appendChild(box); return box.children.length; })`;
/** paragraphs of the test section whose scanner hit sits inside a nav.js wrap piece: [data-k] */
const SPLIT = `(() => { const out = []; for (const p of document.querySelectorAll("#${BOX} > p")) {
  for (const w of p.querySelectorAll("lq-t, .lq-t, .lq-run, .lq-w")) { if (w === p) continue; const own = [...w.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join("");
    if (own && window.__lqPriceScan(own).length) { out.push(p.getAttribute("data-k")); break; } } } return out; })()`;
const IN_BOX = b => b.where.includes("#" + BOX);
/** W5 (relock1): one paragraph per item, built as nav.js builds a wrap piece: head text + <lq-t class="lq-w lq-t">tail</lq-t> */
const INJ_SPLIT = `((list) => {
  const host = document.getElementById("plNarr"); if (!host) return 0;
  const old = document.getElementById(${S(BOX)}); if (old) old.remove();
  const box = document.createElement("div"); box.id = ${S(BOX)}; box.className = "fa-section"; box.setAttribute("data-lq-test-inject", "");
  list.forEach(([a, b], i) => { const p = document.createElement("p"); p.setAttribute("data-k", "s" + i); p.append(a); const t = document.createElement("lq-t"); t.className = "lq-w lq-t"; t.textContent = b; p.append(t); box.appendChild(p); });
  host.appendChild(box); return box.children.length; })`;
/** W5: prices whose only scanner hit spans the head / tail boundary (no hit in either part alone) */
const SPLIT_PRICES = [["อ่านฉบับเต็มได้ทันทีเพียง 99", "USD ต่อเดือน"], ["Get the full reading for only 99", "USD a month"], ["完整解读 99", "元 立即解锁"],
  ["อ่านฉบับเต็มได้ทันทีเพียง 1,500", "RMB ต่อปี"], ["Unlock everything for 99", "RMB today"], ["完整解读 九十九", "元 立即解锁"]];
const WHOLE = ["อ่านฉบับเต็มได้ทันทีเพียง 99 USD ต่อเดือน", "Get the full reading for only 99 USD a month", "完整解读 99元 立即解锁"];
/** W6 (relock2): [allowed text, visible part, hidden part, hidden comes first]; visible + hidden (in that order) = the allowed text */
const ZH_ALLOW = "不能替代建筑、安全、健康或财务方面的专业建议，也不需要购买任何物品。";
const EN_ALLOW = "there is no need to buy anything new";
const HIDE_SPLITS = [
  [PALM, "คุณวางงบประมาณได้ละเอียด และรู้ว่าเงินแต่ละบาท", "ไปไหน", false], [PALM, "แต่ละบาทไปไหน", "คุณวางงบประมาณได้ละเอียด และรู้ว่าเงิน", true],
  [EN_ALLOW, "there is no need to buy", " anything new", false], [EN_ALLOW, "buy anything new", "there is no need to ", true],
  [ZH_ALLOW, "不能替代建筑、安全、健康或财务方面的专业建议，也不需要购买", "任何物品。", false], [ZH_ALLOW, "购买任何物品。", "不能替代建筑、安全、健康或财务方面的专业建议，也不需要", true]];
const HIDES = ["display:none", "hidden", "visibility:hidden", "opacity:0"];
/** one paragraph: the visible text node and a <span> with the other part, hidden the given way ("" = shown); returns the span's shown state */
const INJ_HIDE = `((vis, hid, first, how) => {
  const host = document.getElementById("plNarr"); if (!host) return null;
  const old = document.getElementById(${S(BOX)}); if (old) old.remove();
  const box = document.createElement("div"); box.id = ${S(BOX)}; box.className = "fa-section"; box.setAttribute("data-lq-test-inject", "");
  const p = document.createElement("p"); p.setAttribute("data-k", "h0"); const sp = document.createElement("span"); sp.textContent = hid;
  const H = { "display:none": e => { e.style.display = "none"; }, hidden: e => { e.hidden = true; }, "visibility:hidden": e => { e.style.visibility = "hidden"; }, "opacity:0": e => { e.style.opacity = "0"; } };
  if (how) H[how](sp);
  if (first) { p.append(sp); p.append(vis); } else { p.append(vis); p.append(sp); }
  box.appendChild(p); host.appendChild(box);
  const cs = getComputedStyle(sp); return { hiddenByRule: sp.hidden || cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0", len: p.textContent.length }; })`;

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    assert(BROWSER.length >= 10 && BROWSER.includes(PALM), "the allow-list still holds its browser texts, the palm sentence among them");
    for (const lang of ["th", "en", "zh"]) {
      await check(`palm [${lang}] crisis state: allow-listed reading texts pass the price scan whatever nav.js wraps; unmarked prices next to them or alone are flagged`, async () => {
        const p = await toCrisis(browser, base, fakeCams, "palm", lang);
        try {
          const scanBox = async (list, hide) => {
            const n = await p.evaluate(`${INJ}(${S(list)}, ${!!hide})`);
            assert(n === list.length, `injected ${n} of ${list.length} paragraphs`);
            await sleep(1500); // nav.js line-wrap runs on idle after the mutation
            return { split: await p.evaluate(SPLIT), hits: (await p.evaluate(VISIBLE)).filter(IN_BOX) };
          };
          const fmt = hs => hs.map(h => `[${h.hit}] "${h.text}" (${h.where})`).join(" | ");
          const prices = [SCAN.INJECT.th, SCAN.INJECT.en, SCAN.INJECT.zh];
          // W1 + W1n
          const w1 = await scanBox(BROWSER);
          console.log(`    palm [${lang}] W1: ${BROWSER.length} allow-listed texts, ${w1.split.length} with a hit inside a nav.js wrap piece, ${w1.hits.length} flagged`);
          if (lang === "th") {
            assert(w1.split.length >= 1, "W1n: at least one allow-listed text has a scanner hit inside a nav.js wrap piece (TH)");
            assert(w1.split.includes("a" + BROWSER.indexOf(PALM)), "W1n: the palm sentence's hit sits inside a wrap piece (TH)");
          }
          assert(!w1.hits.length, "W1: allow-listed text flagged: " + fmt(w1.hits));
          // W2: each price string alone
          for (const t of prices) {
            const w2 = await scanBox([t]);
            assert(w2.hits.length >= 1, `W2: unmarked price string flagged: "${t}"`);
          }
          // W3: an allowed sentence and a price string in one paragraph, both orders
          for (const t of [PALM + " " + SCAN.INJECT.th, SCAN.INJECT.th + " " + PALM, BROWSER[0] + " " + SCAN.INJECT.en, BROWSER[0] + " " + SCAN.INJECT.zh]) {
            const w3 = await scanBox([t]);
            assert(w3.hits.length >= 1, `W3: the price next to an allow-listed sentence is flagged: "${t}"`);
          }
          // W4: hidden copies are not flagged; removal leaves nothing
          const w4 = await scanBox(prices, true);
          assert(!w4.hits.length, "W4: hidden price strings flagged: " + fmt(w4.hits));
          await p.evaluate(`document.getElementById(${S(BOX)}).remove(); true`);
          await sleep(300);
          const after = (await p.evaluate(VISIBLE)).filter(IN_BOX);
          assert(!after.length, "W4: nothing left in the test section after removal");
          console.log(`    palm [${lang}]: W2 3/3, W3 4/4 flagged, W4 hidden 0`);
          // W5 (relock1, stricter): a price split across a wrap piece is flagged. W5n: neither part alone has a hit, the whole has one.
          for (const pair of SPLIT_PRICES) {
            const parts = await p.evaluate(`((a, b) => [window.__lqPriceScan(a).length, window.__lqPriceScan(b).length, window.__lqPriceScan(a + b).length])(${S(pair[0])}, ${S(pair[1])})`);
            assert(!parts[0] && !parts[1] && parts[2] >= 1, `W5n: "${pair.join("|")}" must hit only as a whole (got ${S(parts)})`);
            const n5 = await p.evaluate(`${INJ_SPLIT}(${S([pair])})`);
            assert(n5 === 1, "W5: split paragraph injected");
            await sleep(600);
            const h5 = (await p.evaluate(VISIBLE)).filter(IN_BOX);
            assert(h5.length >= 1, `W5: price split across a wrap piece flagged: "${pair.join("|")}"`);
          }
          // W5 natural: the same prices as one text, whatever nav.js does to them
          const w5 = [];
          for (const t of WHOLE) { const r = await scanBox([t]); assert(r.hits.length >= 1, `W5: price flagged after nav.js wrapping: "${t}" (wrap pieces with a part: ${S(r.split)})`); w5.push(r.hits.length); }
          await p.evaluate(`document.getElementById(${S(BOX)}).remove(); true`);
          console.log(`    palm [${lang}]: W5 split ${SPLIT_PRICES.length}/${SPLIT_PRICES.length} flagged, natural ${w5.length}/${WHOLE.length} flagged`);
          // W6 (relock2, stricter): hidden text never completes an allowed sentence, so the visible hit is flagged
          const allowN = BROWSER.map(a => a.replace(/\s+/g, " ")).filter(a => a.trim());
          let w6 = 0, w6c = 0;
          for (const [whole, vis, hid, first] of HIDE_SPLITS) {
            const joined = (first ? hid + vis : vis + hid).replace(/\s+/g, " ");
            assert(joined === whole && BROWSER.includes(whole), `W6n: the parts join to the allow-listed text: "${joined}"`);
            const framed = " " + vis.replace(/\s+/g, " ").trim() + " ";
            assert(!allowN.some(a => framed.includes(a)), `W6n: the visible part alone holds no allowed text: "${vis}"`);
            const hv = await p.evaluate(`window.__lqPriceScan(${S(vis)}).length`);
            assert(hv >= 1, `W6n: the visible part alone has a scanner hit: "${vis}"`);
            for (const how of HIDES) {
              const r = await p.evaluate(`${INJ_HIDE}(${S(vis)}, ${S(hid)}, ${first}, ${S(how)})`);
              assert(r && r.hiddenByRule && r.len === whole.length, `W6n: the hidden part (${how}) is injected and not shown by the kit's rule: ${S(r)}`);
              await sleep(600);
              const h6 = (await p.evaluate(VISIBLE)).filter(IN_BOX);
              assert(h6.length >= 1, `W6: visible "${vis}" + hidden (${how}) "${hid}" must be flagged: hidden text must not complete the allowed text`);
              w6++;
            }
            // W6c control: the same paragraph with the other part shown is the allowed text and is not flagged
            const rc = await p.evaluate(`${INJ_HIDE}(${S(vis)}, ${S(hid)}, ${first}, "")`);
            assert(rc && !rc.hiddenByRule, "W6c: control span shown");
            await sleep(600);
            const hc = (await p.evaluate(VISIBLE)).filter(IN_BOX);
            assert(!hc.length, `W6c: the whole allowed text shown in two nodes is not flagged: "${whole}": ` + fmt(hc));
            w6c++;
          }
          await p.evaluate(`document.getElementById(${S(BOX)}).remove(); true`);
          console.log(`    palm [${lang}]: W6 hidden-completion ${w6}/${HIDE_SPLITS.length * HIDES.length} flagged, control ${w6c}/${HIDE_SPLITS.length} not flagged`);
        } finally { await p.close(); }
      });
    }
  } finally { await browser.close(); }
}
