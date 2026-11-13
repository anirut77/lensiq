// tests/e2e/nutrition-tilt.e2e.mjs — nutrition.html, straighten-before-reading (coordinator 2026-11-13; branch only).
// FIXED TEST, written and locked (~/LENSIQ-field/evals/nutrition/v5/locked.sha256) BEFORE the code: a synthetic Thai panel
// (repo fonts only) drawn at a 2-degree tilt with a long allergen statement is read by the REAL on-device OCR; the page
// straightens it before reading, so the sodium value and the allergen statement come out right, and nothing is uploaded.
import { assert } from "./cdp.mjs";

const INIT = "window.confirm=()=>true;window.print=()=>{};";
const DRAW = `window.__drawTilted = async () => {
  const add = async (fam, url, o) => { const f = new FontFace(fam, "url(" + url + ")", o); document.fonts.add(await f.load()); };
  await add("LQThai", "/vendor/fonts/prompt/prompt-500-thai.woff2", { weight: "500", unicodeRange: "U+0E00-0E7F" });
  await add("LQThai", "/tests/fixtures/fonts/liberation/LiberationSans-Regular.ttf", { weight: "500", unicodeRange: "U+0000-00FF" });
  const L = [["ข้อมูลโภชนาการ", ""], ["คุณค่าทางโภชนาการต่อหนึ่งหน่วยบริโภค", ""], ["พลังงานทั้งหมด 160 กิโลแคลอรี", ""], ["ไขมันทั้งหมด 6 ก.", "9%"], ["โปรตีน 4 ก.", ""],
    ["คาร์โบไฮเดรตทั้งหมด 23 ก.", "8%"], ["โซเดียม 230 มก.", "10%"], ["ข้อมูลสำหรับผู้แพ้อาหาร: มี นม ข้าวสาลี ถั่วเหลือง อาจมี ถั่วลิสง", ""]];
  const p = document.createElement("canvas"); p.width = 900; p.height = 60 + L.length * 54;
  const x = p.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, p.width, p.height);
  x.fillStyle = "#111"; x.textBaseline = "middle"; x.font = '500 28px "LQThai"';
  L.forEach(([a, b], i) => { x.textAlign = "left"; x.fillText(a, 30, 45 + i * 54); if (b) { x.textAlign = "right"; x.fillText(b, 870, 45 + i * 54); } });
  const c = document.createElement("canvas"); c.width = 1000; c.height = p.height + 120;
  const g = c.getContext("2d"); g.fillStyle = "#d9c9a3"; g.fillRect(0, 0, c.width, c.height);
  g.translate(c.width / 2, c.height / 2); g.rotate((2 * Math.PI) / 180); g.drawImage(p, -p.width / 2, -p.height / 2);
  window.__tilted = c;
  return document.fonts.check('500 28px "LQThai"', "ข้อมูล");
};`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("nutrition: a 2-degree tilted Thai panel is straightened before reading — sodium and the allergen statement read right", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, DRAW], isolated: true });
      await page.goto(`${base}/nutrition.html`);
      assert(await page.evaluate(() => window.__drawTilted()), "test fonts loaded");
      await page.evaluate(() => window.__LQ_NUT.setImage(window.__tilted));
      await page.waitFor(`document.querySelector("#nutOut [data-field=sodium]")`, 180000);
      const r = await page.evaluate(() => ({ sodium: document.querySelector("#nutOut [data-field=sodium] .nut-printed").textContent,
        al: (document.querySelector("#nutAllergen .nut-al-text") || {}).textContent || "", text: window.__LQ_NUT.st.text, tilt: window.__LQ_NUT.st.tilt }));
      assert(/230/.test(r.sodium), "sodium " + JSON.stringify(r));
      assert(/ข้อมูลสำหรับผู้แพ้อาหาร/.test(r.al) && /ถั่วลิสง/.test(r.al), "allergen statement read after straightening " + JSON.stringify(r));
      const posts = page.requests.filter(q => q.method && q.method !== "GET");
      assert(!posts.length, "nothing uploaded");
      await page.close();
    });
  } finally {
    await browser.close();
  }
}
