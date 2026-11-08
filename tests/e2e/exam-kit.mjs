// tests/e2e/exam-kit.mjs — shared checks for the LENSIQ Exam e2e files (not a test file itself: run.mjs only runs *.e2e.mjs).
import { assert } from "./cdp.mjs";
import { audit } from "./camera-mobile.e2e.mjs";

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** phone widths 320 / 360 / 390: no horizontal scroll, touch targets ≥ 44 px, text ≥ 12 px (camera-mobile audit) */
export async function phoneAudit(page, label, widths = [320, 360, 390]) {
  for (const w of widths) {
    await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 1, mobile: true });
    await sleep(350);
    const r = await page.evaluate(audit);
    assert(r.sw <= r.cw, `${label} @${w}: horizontal overflow ${r.sw} > ${r.cw}`);
    assert(!r.bad.length, `${label} @${w}: small touch targets (${r.bad.length}): ${r.bad.slice(0, 8).join(" | ")}`);
    assert(!r.tiny.length, `${label} @${w}: text < 12 px: ${r.tiny.slice(0, 8).join(" | ")}`);
  }
  await page.send("Emulation.clearDeviceMetricsOverride");
}

/** switch to en / zh and require 0 Thai letters in visible text, text attributes and <title> */
export async function noThai(page, label, langs = ["zh", "en"]) {
  for (const l of langs) {
    await page.evaluate(lang => LQI18N.setLang(lang), l);
    await page.waitFor(`LQI18N.lang === "${l}"`, 5000);
    await sleep(900);
    const c = await page.evaluate(() => LQI18N.coverage(document.body, { top: 6 }));
    assert(c.thai === 0, `${label} [${l}]: ${c.thai} Thai letters — ${c.top.map(x => x.path + " «" + x.text + "»").join(" | ")}`);
  }
  await page.evaluate(() => LQI18N.setLang("th"));
  await sleep(400);
}

export function exceptions(page) { return page.consoleErrors.filter(e => e.kind === "exception"); }

/** every message a node sent is a clean JSON event: no frame, image, blob or name */
export function assertCleanMessages(list, label) {
  for (const m of list) {
    const s = JSON.stringify(m);
    assert(!/data:image|blob:|base64/i.test(s) && s.length < 2000, `${label}: unexpected payload ${s.slice(0, 120)}`);
    assert(!("name" in m) || m.type === "hb", `${label}: name on an event`);
  }
}
