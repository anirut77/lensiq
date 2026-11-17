/* help-principles.js — text of help.html "หลักการทำนายของเรา" / "Our reading principles" / "我们的解读原则"
 * (owner order 2026-11-17 night, item 2: the principles paragraph left the fortune pages and lives here, in plain words).
 * Loaded on demand by legal.js when a <details data-src="help-principles.js"> section is opened (or reached by its #hash),
 * so help.html's first load does not grow. It fills every such section in its language (id prefix "", "en-" or "zh-").
 * Deliberately says nothing about how the reading mode is chosen; the hard limits below hold in every mode. No link to
 * the counselling page here (crisis rule R5: linked only from the crisis card / help line, the top-bar dialog, help.html's own
 * markup and privacy.html); the help section just above this one already carries it.
 * Checked by tests/unit/fortune-credits.test.js (C4) and tests/e2e/fortune-credits.e2e.mjs (R2). */
(function (w) {
  "use strict";
  var P = {
    th: [
      "คำทำนายเรียบเรียงจากตำราและความเชื่อดั้งเดิม เป็นความเชื่อส่วนบุคคล ไม่ใช่การพยากรณ์ทางวิทยาศาสตร์ โปรดใช้วิจารณญาณ",
      "คำเตือนและวิธีรับมือดูได้ฟรีและครบถ้วนเสมอ",
      "ไม่ทำนายความตาย โรคร้ายระยะสุดท้าย หรืออุบัติเหตุ แบบฟันธงหรือระบุวัน",
      "ไม่บอกให้หยุดยาหรือหยุดการรักษา ไม่แนะนำให้ลงทุนในสิ่งใดเป็นการเฉพาะ และไม่บอกให้เลิกกับใคร เรื่องสุขภาพเป็นเพียงคำชวนดูแลตัวเอง ไม่ใช่คำแนะนำทางการแพทย์",
      "ไม่บอกว่าเรื่องร้ายจะเกิดขึ้นถ้าไม่จ่ายเงินหรือไม่ทำพิธี และไม่ให้เลขเสี่ยงโชค",
      "ไพ่หรือสัญลักษณ์อย่างความตาย หอคอย หรือปีศาจ ไม่ได้หมายถึงความตายหรือเหตุร้ายจริง",
      "การดูความเข้ากันของสองคนบอกวิธีปรับเข้าหากัน ไม่ตัดสินว่าคู่ใดเข้ากันไม่ได้",
      "ไม่อ่านอารมณ์ ไม่จับโกหก ไม่ให้คะแนนความสวยงาม และไม่อ้างอิงเพศหรือเชื้อชาติ"
    ],
    en: [
      "Readings are composed from traditional texts and beliefs. They are a matter of personal belief, not a scientific forecast. Please use your own judgement.",
      "Warnings and what you can do about them are always free and complete.",
      "We never predict death, terminal illness or an accident as certain or on a set date.",
      "We never tell you to stop medication or treatment, to make a specific investment, or to end a relationship. Anything about health is only a reminder to look after yourself, not medical advice.",
      "We never say something bad will happen unless you pay or perform a ritual, and we never give lottery numbers.",
      "Cards and symbols such as Death, the Tower or the Devil do not mean real death or disaster.",
      "Compatibility readings show how two people can adjust to each other; they never judge a couple as incompatible.",
      "No emotion reading, no lie detection, no beauty scores, and nothing based on gender or ethnicity."
    ],
    zh: [
      "解读依据传统典籍和信仰整理，属于个人信仰，并非科学预测，请自行判断。",
      "警示以及应对方法始终免费且完整提供。",
      "不会把死亡、绝症或意外说成必然发生，也不会指明日期。",
      "不会叫你停药或停止治疗，不会建议具体投资，也不会叫你结束一段关系。涉及健康的内容只是提醒照顾自己，不是医疗建议。",
      "不会说除非付费或做法事否则就会出事，也不提供彩票号码。",
      "死神、高塔、恶魔等牌或象征并不代表真正的死亡或灾祸。",
      "合婚结果说明两人如何互相调和，不评判任何一对不合适。",
      "不读取情绪，不测谎，不给颜值打分，也不以性别或种族为依据。"
    ]
  };
  w.LQ_HELP_PRINCIPLES = P;
  var doc = w.document;
  if (!doc || !doc.querySelectorAll) return;
  function fill() {
    doc.querySelectorAll("details[data-src]").forEach(function (d) {
      var lang = /^en-/.test(d.id) ? "en" : /^zh-/.test(d.id) ? "zh" : "th";
      if (d.querySelector("div")) return;
      var box = d.appendChild(doc.createElement("div"));
      var ul = doc.createElement("ul");
      P[lang].forEach(function (t) { var li = doc.createElement("li"); li.textContent = t; ul.appendChild(li); });
      box.appendChild(ul);
    });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", fill); else fill();
})(typeof window !== "undefined" ? window : this);
