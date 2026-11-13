#!/usr/bin/env node
// tools/pc-jako-testset.mjs — the builder's DEV set for the Japanese / Korean personal-data guard (stream F, 2026-11-13).
// Synthetic: invented names, numbers and labels; no real person or pack. Written and locked BEFORE the guard change
// (evals-locks/pc-f.sha256). The independent hold-out (~/LENSIQ-field/evals/pc-f/holdout-jako/) is written by another agent.
// Output: docs/product-check/pcf-jako-testset.json (deterministic).
import { writeFileSync } from "node:fs";

let seed = 20261113;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (/** @type {any[]} */ a) => a[Math.floor(rnd() * a.length)];
const digits = (/** @type {number} */ n) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join("");
const gtin = (/** @type {string} */ p) => {
  const d = (p + digits(12 - p.length)).slice(0, 12);
  let x = 0;
  for (let i = 0; i < 12; i++) x += Number(d[i]) * (i % 2 ? 3 : 1);
  return d + ((10 - (x % 10)) % 10);
};

const JA_SUR = ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤", "吉田", "山田", "佐々木", "山口", "松本", "井上", "木村", "清水", "斎藤", "森"];
const JA_GIV = ["太郎", "花子", "翔太", "美咲", "健一", "由美", "大輔", "陽子", "直樹", "恵子", "拓也", "真由美", "誠", "久美子", "和夫", "幸子", "蓮", "結衣"];
const JA_KANA = [["サトウ", "ハナコ"], ["ヤマダ", "タロウ"], ["スズキ", "ケンイチ"], ["タナカ", "ユミ"], ["いとう", "まさお"], ["わたなべ", "さくら"], ["ナカムラ", "ダイスケ"], ["きむら", "あおい"]];
const KO_SUR = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황", "안", "송"];
const KO_GIV = ["민수", "서연", "지훈", "수빈", "영희", "철수", "순자", "정숙", "동현", "하은", "예준", "지아", "경자", "말순", "성호", "미경", "도윤", "은지"];

/** @type {any[]} */ const items = [];
let nJ = 0, nK = 0, nX = 0;
const add = (/** @type {string} */ lang, /** @type {string} */ type, /** @type {string} */ doc, /** @type {string} */ text, /** @type {any[]} */ personal, /** @type {any} */ facts) => {
  const id = lang === "ja" ? "dJ" + String(++nJ).padStart(3, "0") : lang === "ko" ? "dK" + String(++nK).padStart(3, "0") : "dX" + String(++nX).padStart(3, "0");
  for (const p of personal) if (!text.includes(p.value)) throw new Error(id + " value not in text: " + p.value);
  items.push({ id, lang, type, doc, text, ...(facts ? { facts } : {}), personal });
};
const N = (/** @type {string} */ value, /** @type {string} */ cue) => ({ kind: "name", value, cue });
const P = (/** @type {string} */ kind, /** @type {string} */ value) => ({ kind, value, cue: "field" });
const jaName = (/** @type {boolean} */ sp) => { const s = pick(JA_SUR), g = pick(JA_GIV); return sp ? s + " " + g : s + g; };
const koName = (/** @type {boolean} */ sp) => { const s = pick(KO_SUR), g = pick(KO_GIV); return sp ? s + " " + g : s + g; };
const jaPhone = () => pick(["090", "080", "070"]) + "-" + digits(4) + "-" + digits(4);
const jaLand = () => pick(["03", "06", "052", "011"]) + "-" + digits(3) + "-" + digits(4);
const koPhone = () => "010-" + digits(4) + "-" + digits(4);
const era = () => pick(["昭和", "平成"]) + (10 + Math.floor(rnd() * 50)) + "年" + (1 + Math.floor(rnd() * 12)) + "月" + (1 + Math.floor(rnd() * 28)) + "日";
const koDob = () => (1940 + Math.floor(rnd() * 60)) + "." + String(1 + Math.floor(rnd() * 12)).padStart(2, "0") + "." + String(1 + Math.floor(rnd() * 28)).padStart(2, "0");
const rrn = () => digits(2) + String(1 + Math.floor(rnd() * 12)).padStart(2, "0") + String(1 + Math.floor(rnd() * 28)).padStart(2, "0") + "-" + pick(["1", "2"]) + digits(6);

/* ---------------- Japanese personal ---------------- */
for (let i = 0; i < 4; i++) {
  const n = jaName(i % 2 === 0), dob = era(), ins = digits(8);
  add("ja", "personal", "Japanese prescription", `処 方 箋\n保険者番号 ${ins}\n患者氏名 ${n}\n生年月日 ${dob}\nロキソプロフェン錠60mg 1日3回 毎食後`, [N(n, "field"), P("dob", dob)]);
}
for (let i = 0; i < 5; i++) {
  const n = jaName(i % 2 === 1);
  add("ja", "personal", "Japanese pharmacy medicine bag", `${pick(["さくら", "ひまわり", "みどり"])}調剤薬局\n${n} 様\n内服薬 1日3回 毎食後 7日分\n調剤日 2026年11月${10 + i}日`, [N(n, "honorific")]);
}
for (let i = 0; i < 4; i++) {
  const n = jaName(false);
  add("ja", "personal", "Japanese medicine-notebook sticker", `お薬手帳\n${n}様\n調剤日 R8.11.0${i + 1}\nカロナール錠200 1回1錠 頓服`, [N(n, "honorific")]);
}
for (let i = 0; i < 4; i++) {
  const n = jaName(i % 2 === 0), id = digits(8);
  add("ja", "personal", "Japanese lab result", `検査結果報告書\n氏名: ${n}\n患者ID: ${id}\nHbA1c 6.${i} %  LDL 1${i}2 mg/dL`, [N(n, "field"), P("hn", id)]);
}
for (let i = 0; i < 4; i++) {
  const [s, g] = pick(JA_KANA), n = s + " " + g, no = digits(6), tel = jaLand();
  add("ja", "personal", "Japanese patient card (kana)", `診察券\n${pick(["青葉", "中央", "桜台"])}内科クリニック\nフリガナ ${n}\n診察券番号 ${no}\nTEL ${tel}`, [N(n, "field"), P("hn", no)]);
}
for (let i = 0; i < 4; i++) {
  const n = jaName(true), dob = era(), no = digits(8);
  add("ja", "personal", "Japanese insurance card", `健康保険 被保険者証\n記号 ${digits(3)} 番号 ${digits(2)}\n氏名 ${n}\n生年月日 ${dob}\n保険者番号 ${no}`, [N(n, "field"), P("dob", dob)]);
}
for (let i = 0; i < 3; i++) {
  const n = jaName(false), mn = digits(4) + " " + digits(4) + " " + digits(4);
  add("ja", "personal", "Japanese My Number card", `個人番号カード\n氏名 ${n}\n個人番号 ${mn}`, [N(n, "field"), P("id", mn)]);
}
for (let i = 0; i < 5; i++) {
  const n = jaName(i % 2 === 0), tel = jaPhone(), addr = "東京都" + pick(["渋谷区神宮前", "世田谷区桜", "大田区蒲田"]) + (1 + i) + "-2-3";
  add("ja", "personal", "Japanese delivery slip", `お届け先\n〒150-000${i} ${addr}\n${n} 様\nTEL ${tel}\nご依頼主 ${pick(["通販ショップ", "LQストア"])}`, [N(n, "honorific"), P("phone", tel), P("address", addr)]);
}
for (let i = 0; i < 5; i++) {
  const s = pick(JA_SUR), g = pick(JA_GIV);
  add("ja", "personal", "Japanese note to a person", `${s}さんへ\nお薬は朝と夜に飲んでください\nお大事に ${g}より`, [N(s, "honorific"), N(g, "none")]);
}
for (let i = 0; i < 4; i++) {
  const n = jaName(false);
  add("ja", "personal", "Japanese card", `${n}様\n退院おめでとうございます\n早く元気になってね`, [N(n, "honorific")]);
}
for (let i = 0; i < 4; i++) {
  const [s, g] = pick(JA_KANA), n = s + g;
  add("ja", "personal", "Japanese kana name, honorific", `${n}さま\nこのお薬は1日2回\n食後にのんでね`, [N(n, "honorific")]);
}
for (let i = 0; i < 4; i++) {
  const n = jaName(true), no = digits(7), tel = jaPhone();
  add("ja", "personal", "Japanese hospital discharge note", `${pick(["市立", "県立"])}総合病院\n患者名 ${n}\nカルテ番号 ${no}\n連絡先 ${tel}\n退院時処方 アムロジピン錠5mg`, [N(n, "field"), P("hn", no), P("phone", tel)]);
}
for (let i = 0; i < 4; i++) {
  const n = jaName(false), dob = era();
  add("ja", "personal", "Japanese form, お名前", `問診票\nお名前 ${n}\n生年月日 ${dob}\nアレルギー なし`, [N(n, "field"), P("dob", dob)]);
}
for (let i = 0; i < 3; i++) {
  const g = pick(JA_GIV);
  add("ja", "personal", "Japanese family memo, bare name", `おばあちゃんの薬\n${g} 朝1錠 夜1錠`, [N(g, "none")]);
}

/* ---------------- Korean personal ---------------- */
for (let i = 0; i < 5; i++) {
  const n = koName(i % 2 === 1), r = rrn();
  add("ko", "personal", "Korean prescription", `처 방 전\n환자 성명 ${n}\n주민등록번호 ${r}\n처방의약품 아목시실린캡슐 500mg 1일 3회`, [N(n, "field"), P("id", r)]);
}
for (let i = 0; i < 5; i++) {
  const n = koName(false);
  add("ko", "personal", "Korean pharmacy bag", `${pick(["온누리", "새봄", "하나"])}약국\n${n} 님\n1일 3회 식후 30분 5일분\n조제일자 2026.11.${10 + i}`, [N(n, "honorific")]);
}
for (let i = 0; i < 4; i++) {
  const n = koName(i % 2 === 0), no = digits(8), dob = koDob();
  add("ko", "personal", "Korean lab result", `검사결과지\n이름: ${n}\n등록번호 ${no}\n생년월일 ${dob}\n공복혈당 10${i} mg/dL`, [N(n, "field"), P("hn", no), P("dob", dob)]);
}
for (let i = 0; i < 4; i++) {
  const n = koName(false), r = rrn();
  add("ko", "personal", "Korean insurance card", `건강보험증\n성명 ${n}\n주민등록번호 ${r}\n가입자 본인`, [N(n, "field"), P("id", r)]);
}
for (let i = 0; i < 5; i++) {
  const n = koName(false), tel = koPhone(), addr = "서울시 " + pick(["강남구 테헤란로", "마포구 월드컵로", "송파구 올림픽로"]) + " " + (10 + i) + "길 " + (3 + i);
  add("ko", "personal", "Korean parcel slip", `받는분 ${n}\n${tel}\n${addr}\n보내는분 엘큐몰\n배송메모 문앞`, [N(n, "field"), P("phone", tel), P("address", addr)]);
}
for (let i = 0; i < 5; i++) {
  const n = koName(false);
  add("ko", "personal", "Korean note with 님", `${n}님 약 꼭 챙겨 드세요\n아침 저녁 한 알씩`, [N(n, "honorific")]);
}
for (let i = 0; i < 4; i++) {
  const g = pick(KO_GIV);
  add("ko", "personal", "Korean note with 씨", `${g} 씨\n생일 축하해요\n건강하세요`, [N(g, "honorific")]);
}
for (let i = 0; i < 4; i++) {
  const n = koName(true), no = digits(7), tel = koPhone();
  add("ko", "personal", "Korean clinic card", `${pick(["서울", "우리", "튼튼"])}내과의원\n환자: ${n}\n환자번호 ${no}\n연락처 ${tel}`, [N(n, "field"), P("hn", no), P("phone", tel)]);
}
for (let i = 0; i < 4; i++) {
  const n = koName(false), p = koName(false), tel = koPhone();
  add("ko", "personal", "Korean consent / guardian form", `진료 동의서\n수진자: ${n}\n보호자: ${p}\n보호자 연락처 ${tel}`, [N(n, "field"), N(p, "field"), P("phone", tel)]);
}
for (let i = 0; i < 4; i++) {
  const n = koName(false);
  add("ko", "personal", "Korean 성함 form", `접수증\n성함: ${n}\n진료과 정형외과`, [N(n, "field")]);
}
for (let i = 0; i < 3; i++) {
  const g = pick(KO_SUR) + pick(KO_GIV);
  add("ko", "personal", "Korean family memo, bare name", `할머니 약\n${g} 아침 1알 저녁 1알`, [N(g, "none")]);
}
for (let i = 0; i < 3; i++) {
  const n = koName(false), tel = "02-" + digits(3) + "-" + digits(4);
  add("ko", "personal", "Korean delivery, landline", `수령인 ${n}\n전화 ${tel}\n부재시 경비실`, [N(n, "field"), P("phone", tel)]);
}

/* ---------------- product + personal in one frame ---------------- */
for (let i = 0; i < 5; i++) {
  const s = pick(JA_SUR), g = gtin("4987");
  add("ja", "product+personal", "Japanese OTC pack with a handwritten note",
    `第2類医薬品\nLQかぜ薬 顆粒\n成分 アセトアミノフェン 900mg\n内容量 12包\n製造販売元 エルキュー製薬株式会社\n${g}\n${s}さん 朝晩1包`, [N(s, "honorific")], { gtins: [g] });
}
for (let i = 0; i < 5; i++) {
  const n = koName(false), g = gtin("8801");
  add("ko", "product+personal", "Korean OTC pack with a note", `일반의약품\n엘큐 두통정\n성분 아세트아미노펜 500mg\n용법·용량 1회 1정 1일 3회\n제조원 (주)엘큐제약\n${g}\n${n}님 하루 두 번`, [N(n, "honorific")], { gtins: [g] });
}

/* ---------------- products (no personal data) ---------------- */
const JA_PRODUCTS = [
  () => `第3類医薬品\nLQビタミンB錠\n成分 チアミン硝化物 25mg\n内容量 90錠\n用法・用量 1日1回2錠\n製造販売元 山田製薬株式会社\nお客様相談室 0120-123-456`,
  () => `第2類医薬品\nエルキュー胃腸薬\n次の人は服用前に医師、薬剤師に相談してください\n医師の治療を受けている人\n内容量 30包\n製造販売元 小林薬品工業株式会社\n大阪府大阪市中央区道修町1-2-3`,
  () => `化粧水\nLQモイストローション\n全成分 水、グリセリン、BG\n内容量 200mL\n販売元 株式会社エルキュー\nお客様相談室 0120-987-654`,
  () => `栄養機能食品\nLQマルチビタミン\n名称 ビタミン含有食品\n原材料名 デキストリン、ビタミンC\n内容量 60粒\n賞味期限 2027.10\n製造者 株式会社佐藤食品`,
  () => `指定医薬部外品\nLQ目薬クール\n有効成分 タウリン 1%\n内容量 12mL\n使用上の注意 コンタクトレンズ装着時は使用しないこと\n製造販売元 エルキュー製薬株式会社\nロット 26A3 使用期限 2028.03`,
  () => `販売名 LQ鼻炎カプセル\n第2類医薬品\n成分 クロルフェニラミンマレイン酸塩 12mg\n効能 鼻水、鼻づまり\n患者様へ: 眠気があらわれることがあります\n製造販売元 鈴木製薬株式会社`,
  () => `LQのど飴\n名称 キャンディ\n原材料名 砂糖、水あめ、ハーブエキス\n内容量 80g\n保存方法 直射日光を避けてください\n製造者 株式会社田中製菓 静岡県静岡市葵区1-1`,
  () => `医薬部外品\nLQ薬用ハミガキ\n有効成分 フッ化ナトリウム\n内容量 120g\nご使用上の注意 6歳未満の子供には使用しないでください\n発売元 株式会社エルキュー`
];
for (let i = 0; i < 16; i++) {
  const g = gtin(pick(["4987", "4901", "4580"]));
  add("ja", "product", "Japanese product label", JA_PRODUCTS[i % JA_PRODUCTS.length]() + (i % 2 ? `\nJAN ${g}` : ""), [], { gtins: [g] });
}
const KO_PRODUCTS = [
  () => `일반의약품\n엘큐 비타민C 1000\n성분 아스코르브산 1000mg\n효능·효과 비타민C 결핍증\n용법·용량 1일 1회 1정\n제조원 (주)김정문제약\n고객상담실 080-123-4567`,
  () => `건강기능식품\n엘큐 홍삼정\n원재료명 홍삼농축액 100%\n내용량 240g\n섭취방법 1일 1회 1스푼\n판매원 (주)이가네식품\n서울특별시 중구 세종대로 110`,
  () => `일반의약품\n엘큐 감기시럽\n성분 덱스트로메토르판브롬화수소산염\n사용상의 주의사항 어린이는 보호자의 지도 감독하에 복용\n환자는 의사와 상의할 것\n제조번호 2611A 사용기한 2028.06`,
  () => `화장품\n엘큐 수분크림\n전성분 정제수, 글리세린, 나이아신아마이드\n용량 50mL\n제조판매업자 주식회사 엘큐코스\n고객센터 1588-1234`,
  () => `제품명 엘큐 유산균\n품목명 프로바이오틱스\n내용량 30포\n소비기한 2027.12.31\n제조원 박씨네바이오(주)\n보관방법 직사광선을 피할 것`,
  () => `의약외품\n엘큐 구강청결제\n유효성분 세틸피리디늄염화물\n용량 500mL\n사용상의 주의 7세 이하 어린이 사용 금지\n제조원 (주)엘큐 경기도 성남시 분당구 판교로 1`,
  () => `일반의약품\n엘큐 소화정\n성분 판크레아틴 175mg\n이름 있는 의약품 바로 알기\n용법 1회 1정\n판매원 최고제약(주)`,
  () => `엘큐 녹차티백\n식품유형 침출차\n원재료명 녹차잎 100%\n내용량 40g\n품질유지기한 2027.09\n제조원 한국차농원 전남 보성군 보성읍 녹차로 1`
];
for (let i = 0; i < 16; i++) {
  const g = gtin("880" + pick(["1", "6", "9"]));
  add("ko", "product", "Korean product label", KO_PRODUCTS[i % KO_PRODUCTS.length]() + (i % 2 ? `\n${g}` : ""), [], { gtins: [g] });
}

const set = {
  schema: "lensiq-pcf-jako-testset/1",
  source: "synthetic: invented Japanese / Korean documents, notes and labels written by the builder on 2026-11-13 BEFORE the guard change; no real person or pack",
  targets: {
    leak: "0 personal values reaching the AI in text mode, image mode and the tester one-tap path (privacy target, never worse)",
    recallCued: ">= 0.95 of personal values with a field word or an honorific removed (dev); >= 0.90 on the independent hold-out",
    recallAll: "reported (bare names without any cue are the stated limit)",
    productFalseRedaction: "<= 0.02 of product labels get anything removed",
    productGateAddedRefusal: "0 product labels refused by the gate that were allowed before the change"
  },
  note: "Builder's dev set: the builder wrote both the set and the rules, so its numbers are not evidence. The independent hold-out decides.",
  items
};
writeFileSync(new URL("../docs/product-check/pcf-jako-testset.json", import.meta.url), JSON.stringify(set, null, 1) + "\n");
console.log("items", items.length, "values", items.reduce((a, i) => a + i.personal.length, 0));
