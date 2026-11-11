#!/usr/bin/env node
// tools/pc-travel-testset.mjs — Product Check P9 travel mode: the FIXED synthetic label-text set for INN extraction and
// country-of-origin detection (docs/product-check/P9-RESULTS.md §1). Written on 2026-11-11 BEFORE lensiq-pc-travel.js
// existed; its sha256 is recorded in ~/LENSIQ-field/evals/p9/locked.sha256. Every text is invented: brand names are
// fictional ("LQ" / "Testa" / "Demo" style), no real pack text was copied, no person appears.
//
//   node tools/pc-travel-testset.mjs            write docs/product-check/p9-inn-testset.json
//   node tools/pc-travel-testset.mjs --check    exit 1 if the committed file differs from what this script writes
//
// Item: {id, cond: {lang, kind}, text, inns: [expected INN, lower case, as LENSIQ names them], countries: [ISO-like code
// printed or implied on the pack], foreign: true|false}. kinds: single · combo · salt (salt / hydrate words after the
// name) · lookalike (a longer INN that contains a shorter one) · brand-only (no ingredient printed: expect none) ·
// negative (food / cosmetic / supplement text: expect none) · out-of-table (a real INN that a small hand table may miss;
// recall is still counted). LENSIQ names: the INN without the salt or hydrate (paracetamol, acetylsalicylic acid,
// chlorphenamine, salbutamol, meclozine, tetryzoline, carbocisteine, aciclovir, simeticone, docusate); US / BP names and
// local-language names appear on the labels.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(repo, "docs/product-check/p9-inn-testset.json");

/** [lang, kind, text, inns, countries, foreign] */
const ITEMS = [
  // ---------------- English (US / UK / SG / CA / AU style) ----------------
  ["en", "single", "LQ PAIN RELIEF\nActive ingredient (in each caplet): Acetaminophen 500 mg\nPurpose: Pain reliever/fever reducer\nNDC 12345-678-90\nMade in USA", ["paracetamol"], ["US"], true],
  ["en", "single", "Testa Ibuprofen Tablets 200 mg\nEach tablet contains Ibuprofen 200mg\nDirections: adults take 1 tablet every 4 to 6 hours\nProduct of Canada DIN 01234567",
    ["ibuprofen"], ["CA"], true],
  ["en", "single", "DEMOFEN Naproxen Sodium 220 mg tablets\nWarnings: Allergy alert\nMade in India", ["naproxen"], ["IN"], true],
  ["en", "salt", "LQ Allergy\nActive ingredient: Cetirizine HCl 10 mg\nAntihistamine\nDistributed by LQ Pharma Inc., New Jersey, USA", ["cetirizine"], ["US"], true],
  ["en", "salt", "Antihistamine tablets\nChlorpheniramine maleate 4 mg\nKeep out of reach of children\nMade in Malaysia MAL20012345A", ["chlorphenamine"], ["MY"], true],
  ["en", "combo", "COLD & FLU NIGHT\nActive ingredients (in each 30 mL): Acetaminophen 650 mg, Dextromethorphan HBr 30 mg, Doxylamine succinate 12.5 mg\nMade in USA",
    ["paracetamol", "dextromethorphan", "doxylamine"], ["US"], true],
  ["en", "combo", "Testa Sinus Day\nParacetamol 500 mg / Pseudoephedrine hydrochloride 30 mg\nMade in the United Kingdom", ["paracetamol", "pseudoephedrine"], ["GB"], true],
  ["en", "combo", "Chesty Cough Syrup\nGuaifenesin 100 mg and Dextromethorphan hydrobromide 10 mg per 5 mL\nProduct of Australia AUST R 123456", ["guaifenesin", "dextromethorphan"], ["AU"], true],
  ["en", "single", "LQ Heartburn Relief\nOmeprazole 20 mg delayed-release tablets\nMade in USA", ["omeprazole"], ["US"], true],
  ["en", "lookalike", "LQ 24h Heartburn\nEsomeprazole magnesium 20 mg\nDo not use if you have trouble swallowing\nMade in USA", ["esomeprazole"], ["US"], true],
  ["en", "lookalike", "Allergy Relief 24 hour\nLevocetirizine dihydrochloride 5 mg\nMade in USA", ["levocetirizine"], ["US"], true],
  ["en", "lookalike", "Non-drowsy allergy\nDesloratadine 5 mg film-coated tablets\nMade in Singapore SIN12345P", ["desloratadine"], ["SG"], true],
  ["en", "single", "LQ Loratadine 10 mg\nNon-drowsy\nMade in USA", ["loratadine"], ["US"], true],
  ["en", "single", "Diarrhea control\nLoperamide HCl 2 mg\nMade in USA", ["loperamide"], ["US"], true],
  ["en", "single", "Antacid & gas\nSimethicone 125 mg softgels\nMade in USA", ["simeticone"], ["US"], true],
  ["en", "single", "Aspirin 81 mg low dose\nEnteric coated\nMade in USA", ["acetylsalicylic acid"], ["US"], true],
  ["en", "single", "Travel sickness tablets\nMeclizine HCl 25 mg\nMade in USA", ["meclozine"], ["US"], true],
  ["en", "single", "Motion sickness\nDimenhydrinate 50 mg\nProduct of Canada", ["dimenhydrinate"], ["CA"], true],
  ["en", "single", "Eye drops\nTetrahydrozoline HCl 0.05%\nRedness reliever\nMade in USA", ["tetryzoline"], ["US"], true],
  ["en", "single", "Nasal spray\nOxymetazoline hydrochloride 0.05%\nMade in USA", ["oxymetazoline"], ["US"], true],
  ["en", "single", "Cold sore cream\nAcyclovir 5% w/w\nMade in Germany", ["aciclovir"], ["DE"], true],
  ["en", "single", "Antifungal cream\nClotrimazole 1%\nMade in the UK", ["clotrimazole"], ["GB"], true],
  ["en", "single", "Athlete's foot cream\nTerbinafine hydrochloride 1% w/w\nMade in Switzerland", ["terbinafine"], ["CH"], true],
  ["en", "single", "Anti-itch cream\nHydrocortisone 1%\nMade in USA", ["hydrocortisone"], ["US"], true],
  ["en", "single", "Inhaler\nAlbuterol sulfate HFA 90 mcg per actuation\nMade in USA", ["salbutamol"], ["US"], true],
  ["en", "single", "Mucus relief\nCarbocysteine 375 mg capsules\nMade in the United Kingdom", ["carbocisteine"], ["GB"], true],
  ["en", "single", "Expectorant\nAmbroxol hydrochloride 30 mg\nMade in Germany", ["ambroxol"], ["DE"], true],
  ["en", "single", "Numbing gel\nLidocaine 4%\nMade in USA", ["lidocaine"], ["US"], true],
  ["en", "single", "Sore throat lozenges\nBenzocaine 15 mg\nMade in USA", ["benzocaine"], ["US"], true],
  ["en", "single", "Hair regrowth foam\nMinoxidil 5%\nMade in USA", ["minoxidil"], ["US"], true],
  ["en", "out-of-table", "Allergy\nBilastine 20 mg tablets\nMade in Spain", ["bilastine"], ["ES"], true],
  ["en", "out-of-table", "Vertigo relief\nCinnarizine 25 mg\nMade in the United Kingdom", ["cinnarizine"], ["GB"], true],
  ["en", "out-of-table", "Stool softener\nDocusate sodium 100 mg softgel\nMade in USA", ["docusate"], ["US"], true],
  ["en", "brand-only", "LQ NIGHT RELIEF\nExtra strength\nMade in USA", [], ["US"], true],
  ["en", "brand-only", "TESTAMOL\n24 caplets\nProduct of Canada", [], ["CA"], true],
  ["en", "negative", "Organic oat drink\nIngredients: water, oats (10%), sunflower oil, sea salt\nNet 1 L\nProduct of Sweden", [], ["SE"], true],
  ["en", "negative", "Moisturising lotion\nIngredients: Aqua, Glycerin, Cetearyl Alcohol, Niacinamide, Dimethicone, Phenoxyethanol, Parfum\nMade in France", [], ["FR"], true],
  ["en", "negative", "Vitamin C 1000 mg with rose hips\nDietary supplement\nOther ingredients: cellulose, magnesium stearate\nMade in USA", [], ["US"], true],
  ["en", "negative", "Chocolate chip cookies\nIngredients: wheat flour, sugar, butter, chocolate chips (sugar, cocoa butter), salt\nMade in Belgium", [], ["BE"], true],
  ["en", "negative", "Hand sanitizer gel\nEthyl alcohol 70%\nInactive ingredients: water, glycerin, carbomer\nMade in China", [], ["CN"], true],
  ["en", "negative", "Fish oil 1000 mg\nOmega-3 EPA DHA\nGelatin capsule\nProduct of Norway", [], ["NO"], true],
  ["en", "negative", "Sunscreen SPF 50\nActive: Zinc oxide 20%\nMade in Australia", [], ["AU"], true],

  // ---------------- other Latin-script languages ----------------
  ["vi", "single", "Thuốc giảm đau LQ\nThành phần: Paracetamol 500 mg\nSản xuất tại Việt Nam", ["paracetamol"], ["VN"], true],
  ["vi", "combo", "Thuốc cảm Testa\nParacetamol 500 mg, Clorpheniramin maleat 2 mg\nSản xuất tại Việt Nam", ["paracetamol", "chlorphenamine"], ["VN"], true],
  ["id", "single", "Obat demam LQ\nTiap tablet mengandung Parasetamol 500 mg\nDiproduksi oleh PT LQ Farma, Indonesia", ["paracetamol"], ["ID"], true],
  ["id", "single", "Testa Ibuprofen 400 mg\nKomposisi: Ibuprofen 400 mg\nIndonesia", ["ibuprofen"], ["ID"], true],
  ["ms", "single", "Ubat batuk LQ\nMengandungi Dekstrometorfan hidrobromida 15 mg\nMAL19998765X\nDibuat di Malaysia", ["dextromethorphan"], ["MY"], true],
  ["de", "single", "Schmerztabletten\nWirkstoff: Ibuprofen 400 mg\nHergestellt in Deutschland", ["ibuprofen"], ["DE"], true],
  ["de", "single", "Erkältungssaft\nWirkstoff: Acetylcystein 600 mg\nHergestellt in Deutschland", ["acetylcysteine"], ["DE"], true],
  ["fr", "single", "Comprimés\nSubstance active : paracétamol 1000 mg\nFabriqué en France", ["paracetamol"], ["FR"], true],
  ["es", "single", "Comprimidos\nPrincipio activo: Ibuprofeno 600 mg\nFabricado en España", ["ibuprofen"], ["ES"], true],
  ["fr", "negative", "Crème hydratante\nIngrédients : Aqua, Glycerin, Butyrospermum Parkii Butter, Parfum\nFabriqué en France", [], ["FR"], true],

  // ---------------- Simplified Chinese ----------------
  ["zh-Hans", "single", "LQ牌 对乙酰氨基酚片\n【成份】本品每片含对乙酰氨基酚0.5克\n【用法用量】口服，成人一次1片\n国药准字H12345678\n中国制造", ["paracetamol"], ["CN"], true],
  ["zh-Hans", "single", "布洛芬缓释胶囊\n【成份】布洛芬 0.3g\n【不良反应】偶见恶心\n国药准字H23456789", ["ibuprofen"], ["CN"], true],
  ["zh-Hans", "salt", "马来酸氯苯那敏片\n【成份】马来酸氯苯那敏 4mg\n国药准字H34567890", ["chlorphenamine"], ["CN"], true],
  ["zh-Hans", "combo", "复方感冒片\n【成份】本品为复方制剂，每片含对乙酰氨基酚325毫克，盐酸伪麻黄碱30毫克，氢溴酸右美沙芬15毫克，马来酸氯苯那敏2毫克\n国药准字H45678901",
    ["paracetamol", "pseudoephedrine", "dextromethorphan", "chlorphenamine"], ["CN"], true],
  ["zh-Hans", "single", "氯雷他定片\n【成份】氯雷他定 10mg\n生产企业：LQ制药有限公司（中国）", ["loratadine"], ["CN"], true],
  ["zh-Hans", "lookalike", "地氯雷他定片\n【成份】地氯雷他定 5mg\n国药准字H56789012", ["desloratadine"], ["CN"], true],
  ["zh-Hans", "single", "盐酸西替利嗪片\n【成份】盐酸西替利嗪 10mg\n国药准字H67890123", ["cetirizine"], ["CN"], true],
  ["zh-Hans", "lookalike", "盐酸左西替利嗪片\n【成份】盐酸左西替利嗪 5mg\n国药准字H78901234", ["levocetirizine"], ["CN"], true],
  ["zh-Hans", "single", "奥美拉唑肠溶胶囊\n【成份】奥美拉唑 20mg\n国药准字H89012345", ["omeprazole"], ["CN"], true],
  ["zh-Hans", "single", "阿莫西林胶囊\n【成份】阿莫西林 0.25g\n国药准字H90123456", ["amoxicillin"], ["CN"], true],
  ["zh-Hans", "single", "盐酸氨溴索口服溶液\n【成份】盐酸氨溴索\n国药准字H01234567", ["ambroxol"], ["CN"], true],
  ["zh-Hans", "single", "盐酸洛哌丁胺胶囊\n【成份】盐酸洛哌丁胺 2mg\n国药准字H11223344", ["loperamide"], ["CN"], true],
  ["zh-Hans", "single", "阿司匹林肠溶片\n【成份】阿司匹林 100mg\n国药准字H22334455", ["acetylsalicylic acid"], ["CN"], true],
  ["zh-Hans", "single", "克霉唑乳膏\n【成份】克霉唑 1%\n国药准字H33445566", ["clotrimazole"], ["CN"], true],
  ["zh-Hans", "single", "双氯芬酸钠缓释片\n【成份】双氯芬酸钠 75mg\n国药准字H44556677", ["diclofenac"], ["CN"], true],
  ["zh-Hans", "out-of-table", "盐酸小檗碱片\n【成份】盐酸小檗碱 0.1g\n国药准字H55667788", ["berberine"], ["CN"], true],
  ["zh-Hans", "out-of-table", "蒙脱石散\n【成份】蒙脱石 3g\n国药准字H66778899", ["diosmectite"], ["CN"], true],
  ["zh-Hans", "brand-only", "LQ感冒灵\n每盒12袋\n中国制造", [], ["CN"], true],
  ["zh-Hans", "negative", "蜂蜜柚子茶\n配料：蜂蜜、柚子、白砂糖、水\n原产国：韩国", [], ["KR"], true],
  ["zh-Hans", "negative", "保湿面霜\n成分：水、甘油、丁二醇、透明质酸钠\n中国制造", [], ["CN"], true],
  ["zh-Hans", "negative", "维生素C咀嚼片\n国食健字G20201234\n配料：维生素C、山梨糖醇", [], ["CN"], true],
  ["zh-Hans", "negative", "牛肉干\n配料：牛肉、白砂糖、食用盐、香辛料\n产地：内蒙古", [], ["CN"], true],

  // ---------------- Traditional Chinese (Taiwan / Hong Kong) ----------------
  ["zh-Hant", "single", "LQ止痛錠\n成分：乙醯胺酚 500毫克\n衛署藥製字第012345號\n台灣製造", ["paracetamol"], ["TW"], true],
  ["zh-Hant", "single", "布洛芬膜衣錠\n成分：布洛芬 200mg\n台灣製造", ["ibuprofen"], ["TW"], true],
  ["zh-Hant", "single", "阿斯匹靈錠 100mg\n成分：阿斯匹靈\n台灣製造", ["acetylsalicylic acid"], ["TW"], true],
  ["zh-Hant", "salt", "鹽酸西替利嗪錠\n成分：鹽酸西替利嗪 10mg\n香港製造", ["cetirizine"], ["HK"], true],
  ["zh-Hant", "negative", "烏龍茶\n成分：烏龍茶葉、水\n台灣製造", [], ["TW"], true],

  // ---------------- Japanese ----------------
  ["ja", "single", "LQ解熱鎮痛薬\n成分 1錠中 アセトアミノフェン 300mg\n用法・用量 成人1回2錠 1日3回まで\n日本製", ["paracetamol"], ["JP"], true],
  ["ja", "salt", "ロキソプロフェンナトリウム水和物 68.1mg（無水物として60mg）\n第1類医薬品\n使用上の注意\n製造販売元 LQ製薬株式会社 東京都", ["loxoprofen"], ["JP"], true],
  ["ja", "single", "イブプロフェン 150mg\n指定第2類医薬品\n日本製", ["ibuprofen"], ["JP"], true],
  ["ja", "combo", "総合かぜ薬\n成分 3錠中 アセトアミノフェン 300mg クロルフェニラミンマレイン酸塩 2.5mg デキストロメトルファン臭化水素酸塩水和物 16mg 無水カフェイン 25mg\n日本製",
    ["paracetamol", "chlorphenamine", "dextromethorphan", "caffeine"], ["JP"], true],
  ["ja", "single", "鼻炎薬\nフェキソフェナジン塩酸塩 60mg\n第2類医薬品\n日本製", ["fexofenadine"], ["JP"], true],
  ["ja", "single", "胃腸薬\nファモチジン 10mg\n第1類医薬品\n日本製", ["famotidine"], ["JP"], true],
  ["ja", "single", "せき止め\nデキストロメトルファン臭化水素酸塩水和物 48mg\n日本製", ["dextromethorphan"], ["JP"], true],
  ["ja", "single", "トラネキサム酸 750mg\nしみ（肝斑）改善薬\n第1類医薬品\n日本製", ["tranexamic acid"], ["JP"], true],
  ["ja", "lookalike", "エソメプラゾール 20mg\n医療用医薬品\n日本製", ["esomeprazole"], ["JP"], true],
  ["ja", "combo", "目薬\nナファゾリン塩酸塩 0.003%\nクロルフェニラミンマレイン酸塩 0.03%\n日本製", ["naphazoline", "chlorphenamine"], ["JP"], true],
  ["ja", "single", "水虫薬\nテルビナフィン塩酸塩 1%\n日本製", ["terbinafine"], ["JP"], true],
  ["ja", "out-of-table", "鎮静薬\nブロモバレリル尿素 200mg\n日本製", ["bromisoval"], ["JP"], true],
  ["ja", "negative", "整腸薬\nビフィズス菌 30mg\n日本製", [], ["JP"], true],
  ["ja", "brand-only", "LQかぜ錠\n30錠\n日本製", [], ["JP"], true],
  ["ja", "negative", "緑茶\n原材料名：緑茶（国産）\n内容量 500ml\n日本製", [], ["JP"], true],
  ["ja", "negative", "化粧水\n成分：水、グリセリン、BG、ヒアルロン酸Na\n日本製", [], ["JP"], true],

  // ---------------- Korean ----------------
  ["ko", "single", "LQ 해열진통제\n유효성분: 아세트아미노펜 500밀리그램\n용법·용량: 성인 1회 1~2정\n대한민국 제조", ["paracetamol"], ["KR"], true],
  ["ko", "single", "이부프로펜 200mg\n일반의약품\n제조국: 대한민국", ["ibuprofen"], ["KR"], true],
  ["ko", "salt", "세티리진염산염 10mg\n일반의약품\n대한민국", ["cetirizine"], ["KR"], true],
  ["ko", "combo", "종합감기약\n아세트아미노펜 300mg, 클로르페니라민말레산염 2mg, 슈도에페드린염산염 30mg\n대한민국 제조", ["paracetamol", "chlorphenamine", "pseudoephedrine"], ["KR"], true],
  ["ko", "single", "로라타딘 10mg\n일반의약품\n대한민국", ["loratadine"], ["KR"], true],
  ["ko", "out-of-table", "위장약\n알마게이트 1g\n대한민국", ["almagate"], ["KR"], true],
  ["ko", "negative", "유자차\n원재료: 유자, 설탕, 꿀\n원산지: 대한민국", [], ["KR"], true],
  ["ko", "negative", "수분 크림\n전성분: 정제수, 글리세린, 나이아신아마이드\n대한민국", [], ["KR"], true],

  // ---------------- Thai (home market: not foreign unless the pack says so) ----------------
  ["th", "single", "ยาเม็ดพาราเซตามอล 500 มก.\nเลขทะเบียน 1A 123/45\nผลิตโดย บริษัท แอลคิว ฟาร์มา จำกัด", ["paracetamol"], [], false],
  ["th", "single", "ไอบูโพรเฟน 400 มิลลิกรัม\nทะเบียนยา 1A 234/56", ["ibuprofen"], [], false],
  ["th", "salt", "ลอราทาดีน 10 มก. ยาเม็ด\nทะเบียนยา 1A 345/60", ["loratadine"], [], false],
  ["th", "negative", "น้ำผึ้งแท้ 100%\nเลขสารบบอาหาร 10-1-12345-1-0001", [], [], false],
  ["th", "negative", "โลชั่นบำรุงผิว\nส่วนประกอบ: น้ำ กลีเซอรีน\nเลขที่ใบรับแจ้ง 10-1-6100012345", [], [], false],
  ["th", "single", "Imported product\nIbuprofen 200 mg\nนำเข้าโดย บริษัท แอลคิว จำกัด\nMade in Japan", ["ibuprofen"], ["JP"], true],

  // ---------------- mixed / OCR-style capitals / more countries ----------------
  ["en", "single", "LQ PAIN\nACETAMINOPHEN 500MG\nMADE IN U.S.A.", ["paracetamol"], ["US"], true],
  ["en", "single", "Testa Allergy Tabs - Fexofenadine HCl 180 mg - Made in India", ["fexofenadine"], ["IN"], true],
  ["en", "salt", "Each capsule: Amoxicillin (as trihydrate) 500 mg\nRx only\nMade in Pakistan", ["amoxicillin"], ["PK"], true],
  ["en", "single", "Azithromycin 250 mg\nPrescription only medicine\nMade in India", ["azithromycin"], ["IN"], true],
  ["en", "single", "Metronidazole 400 mg tablets\nMade in the Philippines", ["metronidazole"], ["PH"], true],
  ["en", "salt", "Montelukast sodium 10 mg\nMade in India", ["montelukast"], ["IN"], true],
  ["en", "salt", "Sildenafil citrate 100 mg\nMade in India", ["sildenafil"], ["IN"], true],
  ["en", "single", "Head lice lotion\nPermethrin 1%\nMade in USA\nAlso contains: isopropyl alcohol", ["permethrin"], ["US"], true],
  ["en", "single", "Worm tablets\nMebendazole 100 mg\nMade in Belgium", ["mebendazole"], ["BE"], true],
  ["en", "single", "Dexamethasone 0.5 mg\nMade in Egypt", ["dexamethasone"], ["EG"], true],
  ["en", "salt", "Betamethasone valerate cream 0.1%\nMade in Ireland", ["betamethasone"], ["IE"], true],
  ["en", "negative", "Energy drink\nCaffeine content: 32 mg/100 ml\nIngredients: water, sugar, taurine, caffeine, niacinamide\nMade in Austria", [], ["AT"], true],
  ["en", "negative", "Throat candy\nIngredients: sugar, glucose syrup, menthol, eucalyptus oil\nMade in Switzerland", [], ["CH"], true]
];

export function build() {
  const seen = new Set();
  const items = ITEMS.map(([lang, kind, text, inns, countries, foreign], i) => {
    const id = `p9-${String(i + 1).padStart(3, "0")}`;
    if (seen.has(text)) throw new Error("duplicate text " + id);
    seen.add(text);
    return { id, cond: { lang, kind }, text, inns, countries, foreign };
  });
  return {
    schema: "lensiq-pc-p9-inn-testset/1",
    source: "synthetic: invented label text written for P9 on 2026-11-11 before the extractor was built; no real pack text, no person",
    targets: {
      inn_precision: ">= 0.95 (micro: every INN shown that is not expected counts as a false INN)",
      inn_recall: ">= 0.85 on items that are not out-of-table (out-of-table recall reported apart, no target)",
      negatives_clean: ">= 0.95 of negative and brand-only items show no INN",
      country: "reported, no target (an aid for the coverage message, never a verdict)",
      foreign: "reported, no target (decides whether the travel card is shown)"
    },
    note: "The extractor is built after this file was locked; any tuning on it makes it a dev set. The independent reviewer writes a fresh hold-out set.",
    items
  };
}

const text = JSON.stringify(build(), null, 1) + "\n";
if (process.argv.includes("--check")) {
  let cur = "";
  try { cur = readFileSync(OUT, "utf8"); } catch { /* missing */ }
  if (cur !== text) { console.error("p9-inn-testset.json differs from tools/pc-travel-testset.mjs"); process.exit(1); }
  console.log("p9-inn-testset.json: ok (" + build().items.length + " items)");
} else {
  writeFileSync(OUT, text);
  console.log("wrote " + OUT + " (" + build().items.length + " items)");
}
