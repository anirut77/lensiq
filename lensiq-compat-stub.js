/* lensiq-compat-stub.js — LOCAL STUB of the compatibility interface (owner order 2026-11-16, part A is built on branch
 * fortune-compat in parallel). The pet page calls only this interface; when the real module is loaded first it defines
 * window.LQCompat and this file does nothing (it never overwrites it).
 *
 *   LQCompat.pair(personA, personB, {mode, lang}) -> {mode, source, title, lines: string[]}
 *     personA / personB = {birth: "YYYY-MM-DD" | null, kind: "person" | "pet", species?: "cat" | "dog"}
 *     mode "owner-pet": personA is the owner, personB the pet. Only birth dates are used, never a photo or a face.
 *
 * Stub rule (Taksa, the same wheel as lensiq-luckycolor.js): the owner's weekday planet starts the wheel at บริวาร; the pet's
 * weekday planet lands on one of the eight houses, and each house gets one warm, positive line. Every house is framed
 * positively (no "bad match"); the real part A module replaces this wording. Browser: window.LQCompat · Node: module.exports. */
(function (root) {
  "use strict";
  const ORDER = [0, 1, 2, 3, 6, 4, 7, 5]; // อาทิตย์ จันทร์ อังคาร พุธ เสาร์ พฤหัสบดี ราหู ศุกร์
  const HOUSES = ["boriwan", "ayu", "dech", "sri", "mula", "utsaha", "montri", "kalakini"];
  const T = {
    th: {
      title: "เจ้าของกับน้อง",
      boriwan: "น้องอยู่ในภูมิบริวารของคุณ เป็นเพื่อนคู่ใจที่อยู่เคียงข้างกันได้ทุกวัน",
      ayu: "น้องอยู่ในภูมิที่เกื้อหนุนกันอย่างสม่ำเสมอ อยู่ด้วยกันแล้วสบายใจทั้งสองฝ่าย",
      dech: "น้องอยู่ในภูมิเดชของคุณ ช่วยเติมความมั่นใจและความกระตือรือร้นให้บ้าน",
      sri: "น้องอยู่ในภูมิศรีของคุณ ถือเป็นคู่ที่เสริมสิริมงคลและรอยยิ้มให้กัน",
      mula: "น้องอยู่ในภูมิมูละของคุณ เป็นคู่ที่ช่วยกันทำให้บ้านอบอุ่นและมั่นคง",
      utsaha: "น้องอยู่ในภูมิอุตสาหะของคุณ ชวนกันขยับตัว เล่น และทำกิจวัตรดี ๆ ด้วยกัน",
      montri: "น้องอยู่ในภูมิมนตรีของคุณ เป็นคู่ที่คอยดูแลใจกันและกัน",
      kalakini: "น้องเป็นคู่ที่นิสัยต่างจากคุณ ความต่างนี้ช่วยให้ได้เรียนรู้กันและสนุกขึ้นทุกวัน",
      solo: "คนเกิด{day}มักเป็นเจ้าของที่ใส่ใจ น้องจะรับรู้ความใส่ใจนี้ได้ดีที่สุดผ่านกิจวัตรที่ทำด้วยกัน",
    },
    en: {
      title: "You and your pet",
      boriwan: "Your pet sits in your Boriwan (companions) house: a true everyday companion at your side.",
      ayu: "Your pet sits in a house of steady support: time together feels easy for you both.",
      dech: "Your pet sits in your Dech (power) house and brings confidence and zest to the home.",
      sri: "Your pet sits in your Sri (blessing) house: a pair that brings blessings and smiles to each other.",
      mula: "Your pet sits in your Mula (roots) house: together you make the home warm and settled.",
      utsaha: "Your pet sits in your Utsaha (effort) house: you get each other moving, playing and keeping good routines.",
      montri: "Your pet sits in your Montri (helper) house: a pair that looks after each other's heart.",
      kalakini: "Your pet's nature differs from yours, and that difference keeps you learning from each other and having fun.",
      solo: "People born on {day} tend to be attentive keepers; your pet feels it best through routines you share.",
    },
    zh: {
      title: "你和它",
      boriwan: "它落在你的\"伴随宫\"（Boriwan），是每天陪在你身边的贴心伙伴。",
      ayu: "它落在稳定相扶的宫位，在一起时你们都觉得自在。",
      dech: "它落在你的\"权势宫\"（Dech），为家里带来自信与活力。",
      sri: "它落在你的\"吉祥宫\"（Sri），你们彼此带来福气和笑容。",
      mula: "它落在你的\"根基宫\"（Mula），一起把家变得温暖安稳。",
      utsaha: "它落在你的\"勤勉宫\"（Utsaha），你们互相带动，一起活动、玩耍、养成好习惯。",
      montri: "它落在你的\"贵人宫\"（Montri），是彼此照顾心情的一对。",
      kalakini: "它的个性和你不太一样，这种不同让你们互相学习，每天都更有趣。",
      solo: "{day}出生的人往往是很用心的主人，它最能从你们一起的日常中感受到这份用心。",
    },
  };
  const DAYS = { th: ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"],
    en: ["a Sunday", "a Monday", "a Tuesday", "a Wednesday", "a Thursday", "a Friday", "a Saturday"],
    zh: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] };
  const wd = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); if (!m) return -1;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return isNaN(d.getTime()) ? -1 : d.getUTCDay(); };
  function pair(a, b, opts) {
    const o = opts || {}, lang = o.lang === "en" || o.lang === "zh" ? o.lang : "th", L = T[lang];
    const pa = wd(a && a.birth), pb = wd(b && b.birth);
    const out = { mode: o.mode || "owner-pet", source: "stub", title: L.title, lines: [] };
    if (pa < 0) return out;
    if (pb < 0) { out.lines.push(L.solo.replace("{day}", DAYS[lang][pa])); return out; }
    const i = ORDER.indexOf(pa), k = (ORDER.indexOf(pb) - i + 8) % 8;
    out.house = HOUSES[k];
    out.lines.push(L[HOUSES[k]]);
    return out;
  }
  const api = { pair, stub: true };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else if (!root.LQCompat) root.LQCompat = api;
})(typeof window !== "undefined" ? window : globalThis);
