#!/usr/bin/env node
// tools/pc-evidence-testset.mjs — DEV set of the Product Check "product-label evidence" filter (round 17 P7, owner decision
// 2026-11-10 option 1) -> docs/product-check/p7-evidence-testset.json. Written BEFORE the filter (LQPCGuard.productEvidence /
// aiGate). DEV DATA: the filter was tuned on it, so its numbers are not a measurement; the measurement is an independent
// agent's fresh locked set (kept in ~/LENSIQ-field/evals/p7/, sha256 in docs/product-check/P7-RESULTS.md).
// Source: SYNTHETIC. Every person, phone number, address, ID, tracking number and brand is invented.
//
//   kind "product"    a product label (TH / EN / ZH / JA / KO and a few others; drug, supplement, cosmetic, food, herbal,
//                     device). variant "clean", or a low-quality OCR version built from it by a fixed seed:
//                       drop   ~8 % of the characters lost, Thai tone marks often lost
//                       merge  every line joined into one
//                       half   every other line missing
//                       swap   look-alike characters (0/O, 1/l, rn/m, 5/S) and stray spaces
//                     expect "allow"
//   kind "document"   not a product label: shipping label, order / packing slip, gift note, receipt, medical certificate,
//                     appointment slip, lab report, letter, ID-like card ... (many list a product). expect "refuse"
//   kind "dispensing" a dispensing / prescription label, incl. foreign ones (Taiwan clinic, Shanghai outpatient). expect "refuse"
//
//   node tools/pc-evidence-testset.mjs           write the JSON
//   node tools/pc-evidence-testset.mjs --check   exit 1 when the JSON differs from what this generator builds
//   node tools/pc-evidence-testset.mjs --eval    score the current guard; append one line to ~/LENSIQ-field/evals/p7/
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "product-check", "p7-evidence-testset.json");

/* ------------------------------------------------ product labels ------------------------------------------------ */
// [lang, category, text, facts?]   facts = what the page already holds for the capture (decoded barcodes)
const PRODUCTS = [
  // Thai: drugs
  ["th", "drug",
    "ยาสามัญประจำบ้าน\nซาแมพลาม็อล 500\nพาราเซตามอล 500 มก.\nบรรเทาอาการปวด ลดไข้\nวิธีใช้: ผู้ใหญ่ รับประทานครั้งละ 1-2 เม็ด ทุก 4-6 ชั่วโมง\nคำเตือน: ห้ามใช้เกินขนาดที่กำหนด\nเก็บที่อุณหภูมิไม่เกิน 30°C\nเลขทะเบียนที่ 1A 844/39\nผลิตโดย บริษัท สาธิตฟาร์มา จำกัด กรุงเทพฯ\nLot 2405A Mfg 05/2567 Exp 05/2570"
  ],
  ["th", "drug",
    "ยาอันตราย\nLORASAMP 10\nLoratadine 10 mg\nบรรจุ 10 เม็ด\nReg. No. 1A 12/55\nเก็บให้พ้นมือเด็ก\nผู้ผลิต: บริษัท ตัวอย่างเภสัช จำกัด\nเลขที่ผลิต 23117 วันหมดอายุ 11/2027"
  ],
  ["th", "drug",
    "ยาน้ำแก้ไอ ตราสาธิต\nยาใช้ภายใน\nขนาดบรรจุ 60 มล.\nเขย่าขวดก่อนใช้\nผู้ใหญ่ รับประทานครั้งละ 1 ช้อนโต๊ะ วันละ 3 ครั้ง\nทะเบียนยาเลขที่ 2A 45/61\nจำหน่ายโดย หจก. สาธิตโอสถ"
  ],
  ["th", "drug",
    "ยาหม่องน้ำ ตราทดสอบ\nยาใช้ภายนอก ห้ามรับประทาน\nตัวยาสำคัญ: เมนทอล 15% การบูร 10%\nปริมาณสุทธิ 8 ซีซี\nทะเบียนยาเลขที่ G 123/45\nราคา 35 บาท"
  ],
  ["th", "drug",
    "ผงเกลือแร่ โออาร์เอส\nทดแทนการเสียน้ำในรายที่มีอาการท้องร่วง\nละลายผง 1 ซอง ในน้ำสะอาด 150 มล.\nยาสิ้นอายุ: 08/2570\nรุ่นที่ผลิต: A2231\nน้ำหนักสุทธิ 3.3 กรัม"
  ],
  // Thai: supplements
  ["th", "supplement",
    "ผลิตภัณฑ์เสริมอาหาร วิตซี-สาธิต\nวิตามินซี 1000 มก.\nส่วนประกอบสำคัญใน 1 เม็ด: กรดแอสคอร์บิก 1000 มก.\nวิธีรับประทาน: วันละ 1 เม็ด พร้อมอาหาร\nคำเตือน: เด็กและสตรีมีครรภ์ไม่ควรรับประทาน\nควรกินอาหารหลากหลาย ครบ 5 หมู่ ในสัดส่วนที่เหมาะสมเป็นประจำ\nไม่มีผลในการป้องกันหรือรักษาโรค\nอย. 13-2-06463-5-0326\nบรรจุ 30 เม็ด"
  ],
  ["th", "supplement",
    "คอลลาเจน ไตรเปปไทด์ ตราตัวอย่าง\nผลิตภัณฑ์เสริมอาหาร\nข้อมูลโภชนาการ\nหนึ่งหน่วยบริโภค: 1 ซอง (5 กรัม)\nพลังงานทั้งหมด 20 กิโลแคลอรี\nโปรตีน 5 ก.\nน้ำหนักสุทธิ 75 กรัม (15 ซอง)\nผลิตโดย บริษัท สาธิต นิวทริชั่น จำกัด\nควรบริโภคก่อน 12/2569"
  ],
  ["th", "supplement", "น้ำมันปลา 1000 มก.\nFish Oil 1000 mg\nผลิตภัณฑ์เสริมอาหาร\n60 แคปซูล\nเลขสารบบอาหาร 10-1-12345-5-0099\nเก็บในที่แห้งและเย็น"],
  ["th", "supplement",
    "แคลเซียม พลัส ดี\nประกอบด้วย: แคลเซียมคาร์บอเนต 1500 มก. วิตามินดี3 200 ไอยู\nขนาดรับประทาน: ครั้งละ 1 เม็ด วันละ 1 ครั้ง\nนำเข้าและจัดจำหน่ายโดย บริษัท ทดสอบ เฮลท์ จำกัด\nMFG 01/2025 EXP 01/2027"
  ],
  // Thai: cosmetics
  ["th", "cosmetic",
    "ครีมกันแดด ซันสาธิต SPF50+ PA++++\nวิธีใช้: ทาให้ทั่วใบหน้าก่อนออกแดด 15 นาที\nส่วนประกอบ: Water, Ethylhexyl Methoxycinnamate, Glycerin, Niacinamide\nคำเตือน: ใช้ภายนอกเท่านั้น หากมีอาการระคายเคืองให้หยุดใช้\nปริมาณสุทธิ 30 กรัม\nเลขที่ใบรับจดแจ้ง 10-1-6600012345\nผลิตโดย บริษัท ตัวอย่าง คอสเมติก จำกัด"
  ],
  ["th", "cosmetic",
    "แชมพูสมุนไพร อัญชัน\nSample Herbal Shampoo\nขนาด 300 มล.\nใบรับจดแจ้งเลขที่ 13-1-6500098765\nผลิตเมื่อ 03/2568 หมดอายุ 03/2571\nผู้จัดจำหน่าย: ร้านสาธิตสมุนไพร"
  ],
  ["th", "cosmetic",
    "เซรั่มบำรุงผิวหน้า\nBrightening Serum\nIngredients: Aqua, Niacinamide, Butylene Glycol, Sodium Hyaluronate\n30 ml\nวันผลิต/ครั้งที่ผลิต ดูที่ก้นขวด\nเก็บให้พ้นแสงแดด"
  ],
  ["th", "cosmetic", "สบู่ก้อน น้ำผึ้งทองคำ\nน้ำหนักสุทธิ 100 กรัม\nส่วนผสม: Sodium Palmate, Honey Extract, Perfume\nเลขจดแจ้ง 10-1-5912345678\nราคา 59 บาท"],
  // Thai: food
  ["th", "food",
    "นมถั่วเหลือง สูตรหวานน้อย ตราสาธิต\nข้อมูลโภชนาการ\nหนึ่งหน่วยบริโภค 1 กล่อง (230 มล.)\nพลังงาน 130 กิโลแคลอรี น้ำตาล 8 ก. โซเดียม 95 มก.\nส่วนประกอบโดยประมาณ: น้ำนมถั่วเหลือง 92% น้ำตาล 4%\nข้อมูลสำหรับผู้แพ้อาหาร: มีถั่วเหลือง\nปริมาตรสุทธิ 230 มล.\nควรบริโภคก่อน: ดูที่ฝากล่อง\nอย. 10-1-06155-1-0042"
  ],
  ["th", "food",
    "ขนมอบกรอบ รสสาหร่าย\nส่วนประกอบที่สำคัญ: แป้งข้าวโพด 60% น้ำมันปาล์ม 20% ผงปรุงรสสาหร่าย 5%\nใช้วัตถุปรุงแต่งรสอาหาร\nน้ำหนักสุทธิ 48 กรัม\nผลิตโดย บริษัท ขนมสาธิต จำกัด 99 หมู่ 4 ต.บางพลี จ.สมุทรปราการ\nบริโภคแต่น้อยและออกกำลังกายเพื่อสุขภาพ"
  ],
  ["th", "food",
    "น้ำปลาแท้ ตราทดลอง\nส่วนประกอบ: ปลากะตัก 70% เกลือ 27% น้ำตาล 3%\nปริมาตรสุทธิ 700 มล.\nเลขสารบบอาหาร 20-1-00455-2-0001\nควรบริโภคก่อน 15 03 27"
  ],
  ["th", "food",
    "กาแฟปรุงสำเร็จชนิดผง 3 in 1\nวิธีชง: เทกาแฟ 1 ซอง ลงในน้ำร้อน 150 มล.\nบรรจุ 27 ซอง น้ำหนักสุทธิ 486 กรัม\nผลิตและจำหน่ายโดย บริษัท สาธิต เบฟเวอเรจ จำกัด\nศูนย์บริการลูกค้า โทร 02-123-4567"
  ],
  // Thai: herbal, device
  ["th", "herbal",
    "ยาแผนโบราณ ยาหอมสาธิต\nสรรพคุณ: แก้ลมวิงเวียน\nขนาดและวิธีใช้: รับประทานครั้งละ 1 ช้อนชา ละลายน้ำอุ่น\nทะเบียนยาเลขที่ G 56/2563\nผู้ผลิต: ห้างหุ้นส่วนสาธิตโอสถ\nน้ำหนักสุทธิ 15 กรัม"
  ],
  ["th", "herbal",
    "ผลิตภัณฑ์สมุนไพร ฟ้าทะลายโจร แคปซูล\nตัวยาสำคัญ: ผงฟ้าทะลายโจร 400 มก.\nคำเตือน: ห้ามใช้ในหญิงตั้งครรภ์และให้นมบุตร\nเก็บในที่แห้ง อุณหภูมิไม่เกิน 30 องศาเซลเซียส\nบรรจุ 60 แคปซูล"
  ],
  ["th", "device",
    "หน้ากากอนามัยทางการแพทย์\nใช้ครั้งเดียว ห้ามนำกลับมาใช้ซ้ำ\nบรรจุ 50 ชิ้น\nเลขที่ใบจดแจ้ง จน. 65-1-2-2-0001234\nผลิตโดย บริษัท สาธิตเมดิคอล จำกัด\nLOT 2408B"
  ],
  // English
  ["en", "drug",
    "Drug Facts\nActive ingredient (in each tablet): Ibuprofen 200 mg\nPurpose: Pain reliever/fever reducer\nUses: temporarily relieves minor aches and pains\nWarnings: Stomach bleeding warning. Ask a doctor before use if you have liver disease.\nDirections: adults and children 12 years and over: take 1 tablet every 4 to 6 hours\nOther information: store at 20-25°C\nInactive ingredients: corn starch, hypromellose\nNDC 0573-0150-20\nLOT A12345 EXP 01/2028"
  ],
  ["en", "drug",
    "PARACETAMOL Tablets BP 500 mg\n16 tablets\nFor oral use. Read the package leaflet before use.\nKeep out of the sight and reach of children.\nPL 12345/0678\nMA Holder: Example Pharma Ltd., Sampletown, UK\nBatch No. A12345\nExp. Date 01/2028"
  ],
  ["en", "drug",
    "SAMPLE COLD & FLU\nEach capsule contains: Paracetamol 500 mg, Phenylephrine HCl 5 mg\nAUST R 123456\nStore below 25°C\n24 capsules\nSample Health Pty Ltd, Sydney"
  ],
  ["en", "drug",
    "Loratadine Tablets 10 mg\nAntihistamine\nDIN 02345678\n30 Tablets\nManufactured by Example Pharma Inc., Toronto\nKeep out of reach of children\nLot 4471 Exp 2027-06"
  ],
  ["en", "supplement",
    "Supplement Facts\nServing Size 1 Softgel\nServings Per Container 90\nFish Oil 1000 mg\nOther ingredients: gelatin, glycerin, purified water\nSuggested use: take one softgel daily with a meal\nThese statements have not been evaluated by the Food and Drug Administration.\nDistributed by Sample Naturals LLC"
  ],
  ["en", "supplement", "SAMPLAVIT C\nVitamin C 1000 mg\nDietary Supplement\n60 Tablets"],
  ["en", "supplement",
    "Zinc + Vitamin D3\nNPN 80012345\nRecommended dose: Adults: 1 tablet daily\nNon-medicinal ingredients: microcrystalline cellulose, magnesium stearate\n120 tablets\nBest before 2027-03"
  ],
  ["en", "cosmetic",
    "Hydrating Face Cream\nDirections: apply to clean skin morning and night.\nIngredients: Aqua, Glycerin, Cetearyl Alcohol, Dimethicone, Parfum\nCaution: for external use only. Avoid contact with eyes.\nNet Wt. 50 g / 1.7 oz\nMade in Korea\n12M"
  ],
  ["en", "cosmetic",
    "Gentle Baby Shampoo\nTear-free formula\n200 ml e 6.7 fl. oz.\nINGREDIENTS: WATER, COCAMIDOPROPYL BETAINE, SODIUM CHLORIDE, CITRIC ACID\nDistributed by Sample Baby Co., Ltd.\nBatch 22B07"
  ],
  ["en", "cosmetic",
    "Sample Sunscreen Lotion SPF 30\nBroad Spectrum\nWarnings: For external use only. Keep out of reach of children.\nNet 100 ml\nMFD 2025.02.11 EXP 2028.02.10"
  ],
  ["en", "food",
    "Nutrition Facts\nServing size 2/3 cup (55g)\nCalories 230\nTotal Fat 8g Sodium 160mg Total Carbohydrate 37g Protein 3g\nIngredients: whole grain oats, sugar, almonds, salt\nContains: tree nuts\nNet Wt 12 oz (340g)\nBest by 03 2027"
  ],
  ["en", "food",
    "Sample Instant Noodles Chicken Flavour\nIngredients: Wheat flour, palm oil, salt, flavour enhancer (E621)\nAllergen advice: contains wheat, soy\nNet weight: 85 g\nStore in a cool, dry place\nProduct of Thailand"
  ],
  ["en", "drug",
    "Rx only\nATORVASTATIN CALCIUM Tablets 20 mg\n90 Tablets\nStore at controlled room temperature\nMfd. for Example Generics, Inc.\nNDC 12345-678-90\nLOT 8H221 EXP 09/27"
  ],
  ["en", "herbal",
    "Traditional Herbal Balm\nComposition: Menthol 10%, Camphor 11%, Eucalyptus oil 5%\nMAL20012345T\nFor external use only\nNett weight 20 g\nManufactured by Sample Herbs Sdn. Bhd."
  ],
  // Chinese (simplified)
  ["zh", "drug",
    "布洛芬缓释胶囊\n【成份】本品每粒含布洛芬0.3克\n【适应症】用于缓解轻至中度疼痛\n【用法用量】口服。成人一次1粒，一日2次\n【注意事项】孕妇及哺乳期妇女禁用\n【贮藏】密封保存\n【批准文号】国药准字H20013062\n【生产企业】示例制药有限公司\n产品批号 20240501 有效期至 2027.04"
  ],
  ["zh", "drug", "感冒灵颗粒\nOTC 甲类\n规格：每袋重10克\n国药准字Z44021940\n请仔细阅读说明书并按说明使用\n生产日期 2025/01/12"],
  ["zh", "drug", "阿莫西林胶囊 0.25g×24粒\n本品为处方药，凭医师处方销售、购买和使用\n贮藏：遮光，密封保存\n批准文号：国药准字H44021351\n生产企业：示例药业股份有限公司"],
  ["zh", "supplement", "钙维生素D软胶囊\n保健食品\n卫食健字(2013)第0123号\n【主要原料】碳酸钙、维生素D3\n【食用方法及食用量】每日1次，每次1粒\n【不适宜人群】婴幼儿\n本品不能代替药物\n净含量：60粒"],
  ["zh", "supplement", "蛋白粉\n保健食品 国食健注G20200123\n保健功能：增强免疫力\n配料：大豆分离蛋白、乳清蛋白\n保质期：24个月\n贮存方法：置阴凉干燥处\n净含量 400克"],
  ["zh", "cosmetic", "美白精华液\n国妆特字G20190123\n成分：水、甘油、烟酰胺、透明质酸钠\n使用方法：洁面后取适量涂抹于面部\n净含量：30ml\n生产企业：示例化妆品有限公司\n限期使用日期见包装"],
  ["zh", "cosmetic", "保湿面膜\n产品执行标准 QB/T 2872\n化妆品生产许可证号 粤妆20160001\n注意事项：仅供外用，如有不适请停止使用\n净含量 25ml×5片\n保质期 三年"],
  ["zh", "food",
    "原味酸奶\n营养成分表\n项目 每100克 NRV%\n能量 380千焦 5%\n蛋白质 3.1克 脂肪 3.3克 碳水化合物 12.0克 钠 60毫克\n配料：生牛乳、白砂糖、乳酸菌\n贮存条件：2-6℃冷藏\n生产许可证编号 SC10531011500012\n净含量 200克"
  ],
  ["zh", "food", "香辣牛肉面\n配料表：小麦粉、棕榈油、食用盐、牛肉粉\n致敏物质提示：含有小麦、大豆\n产品标准代号 GB/T 40772\n保质期 6个月\n生产日期见封口处\n制造商：示例食品有限公司"],
  // Chinese (traditional: Taiwan / Hong Kong)
  ["zh", "drug",
    "普拿樣本錠 500毫克\n成分：每錠含 Acetaminophen 500mg\n適應症：退燒、止痛\n用法用量：成人每次1~2錠，每日不得超過8錠\n警語：除非藥師、藥劑生或醫師指示，孕婦及授乳婦不建議自行使用\n衛署藥製字第012345號\n藥商：範例藥品股份有限公司\n批號 A1123 保存期限 2027.08"
  ],
  ["zh", "food", "鳳梨酥禮盒\n品名：鳳梨酥\n成分：麵粉、奶油、鳳梨餡、雞蛋、糖\n過敏原資訊：本產品含有麩質、奶類、蛋\n營養標示\n每一份量 30公克 本包裝含 12份\n熱量 130大卡\n淨重：360公克\n有效日期：標示於盒底\n製造商：範例食品有限公司"],
  ["zh", "herbal", "活絡油\n成份：冬青油、薄荷腦、松節油\n功能：舒筋活絡\n用法：外用，搽於患處\n香港中成藥註冊編號 HKC-01234\n淨容量 50毫升\n範例藥廠有限公司 香港製造"],
  // Japanese
  ["ja", "drug",
    "第2類医薬品\nサンプルEX錠\n解熱鎮痛薬\n成分・分量（2錠中）イブプロフェン 150mg\n効能・効果：頭痛・歯痛・生理痛\n用法・用量：成人（15歳以上）1回2錠、1日3回まで\n使用上の注意：してはいけないこと\n保管及び取扱い上の注意：直射日光の当たらない涼しい所に保管\n製造販売元 サンプル製薬株式会社\n使用期限 2027.09 製造番号 K123"
  ],
  ["ja", "drug", "指定医薬部外品\nビタミン含有保健剤\n内容量 100mL\n1日1回1本を服用してください\n販売元 見本ヘルスケア株式会社"],
  ["ja", "cosmetic",
    "保湿化粧水\n医薬部外品\n全成分：水、グリセリン、BG、ヒアルロン酸Na\nご使用方法：洗顔後、適量を手に取りお肌になじませます\nお肌に異常が生じていないかよく注意して使用してください\n内容量 200mL\n製造販売元 株式会社サンプル化粧品\nMADE IN JAPAN"
  ],
  ["ja", "food", "抹茶クッキー\n名称：焼菓子\n原材料名：小麦粉、砂糖、バター、抹茶\n内容量：12枚\n賞味期限：枠外下部に記載\n保存方法：直射日光、高温多湿を避けて保存\n栄養成分表示（1枚当たり）エネルギー 52kcal\n製造者：見本製菓株式会社"],
  // Korean
  ["ko", "drug",
    "샘플펜정 500mg\n일반의약품\n원료약품 및 그 분량: 1정 중 아세트아미노펜 500mg\n효능·효과: 해열, 진통\n용법·용량: 성인 1회 1~2정, 1일 3~4회\n사용상의 주의사항: 첨부문서 참조\n저장방법: 실온보관\n제조원: (주)샘플제약\n사용기한 2027.05.01 제조번호 2311"
  ],
  ["ko", "cosmetic",
    "수분 크림\n전성분: 정제수, 글리세린, 나이아신아마이드\n용량: 50ml\n사용법: 적당량을 덜어 피부결을 따라 부드럽게 펴 발라줍니다\n사용할 때의 주의사항: 상처가 있는 부위에는 사용을 자제할 것\n화장품책임판매업자: (주)샘플코스메틱\n제조국: 대한민국"
  ],
  ["ko", "supplement", "건강기능식품\n홍삼정 스틱\n영양·기능정보\n1일 섭취량: 1포(10ml)\n섭취방법: 1일 1회, 1회 1포\n원재료명: 홍삼농축액, 정제수\n내용량: 10ml x 30포\n유통기한: 측면 표기일까지\n제조원: 샘플인삼(주)"],
  ["ko", "food", "매운 라면\n식품유형: 유탕면\n원재료명: 소맥분, 팜유, 정제소금\n영양정보 총 내용량 120g 500kcal\n나트륨 1,790mg\n보관방법: 직사광선을 피하고 서늘한 곳에 보관\n제조원: 샘플식품(주)"],
  // other Latin-script labels (Malay / Indonesian / Vietnamese)
  ["other", "drug",
    "Paracetamol 500 mg Tablet\nSetiap tablet mengandungi Paracetamol 500 mg\nMAL19900012AZ\nSimpan di bawah 30°C\nJauhi daripada kanak-kanak\nDikilangkan oleh Contoh Pharma Sdn. Bhd."
  ],
  ["other", "supplement",
    "Vitamin C 500 mg\nKomposisi: tiap tablet mengandung Asam Askorbat 500 mg\nAturan pakai: 1 tablet sehari\nPOM SD 181234567\nNetto 30 tablet\nDiproduksi oleh PT Contoh Farma\nBaik digunakan sebelum 06 2027"
  ],
  ["other", "food",
    "Bánh quy bơ\nThành phần: bột mì, bơ, đường, trứng\nKhối lượng tịnh: 150 g\nHạn sử dụng: xem trên bao bì\nBảo quản nơi khô ráo, thoáng mát\nSản xuất tại Công ty TNHH Mẫu"
  ],
  // maker addresses over several lines (they must not read as the address of a person)
  ["th", "cosmetic",
    "โลชั่นบำรุงผิว สูตรน้ำนมข้าว\nปริมาณสุทธิ 200 มล.\nผลิตโดย บริษัท สาธิตคอสเมติก จำกัด\nเลขที่ 99/9 หมู่ 4 ต.บางพลีใหญ่ อ.บางพลี จ.สมุทรปราการ 10540\nโทร 02-123-4567\nเลขที่ใบรับจดแจ้ง 10-1-6600054321"
  ],
  ["en", "food",
    "Sample Crackers Original\nIngredients: wheat flour, vegetable oil, salt\nNet weight 150 g\nDistributed by Mock Foods\n12 Sample Road, Bangkok 10110\nTel: 02 345 6789\nwww.example.test"
  ],
  ["zh", "food", "苏打饼干\n配料：小麦粉、植物油、食用盐\n净含量：200克\n生产企业：示例食品有限公司\n地址：广东省广州市白云区示例路8号\n服务热线 400-800-1234\n保质期 12个月"],
  ["th", "food",
    "น้ำพริกเผา แม่สาธิต\nส่วนประกอบ: พริกแห้ง 40% กระเทียม 20% น้ำตาล 15%\nน้ำหนักสุทธิ 120 กรัม\nกลุ่มแม่บ้านเกษตรกรตัวอย่าง\n45 หมู่ 2 ต.ทดสอบ อ.เมือง จ.ลำปาง 52000\nผลิต 01/11/69 หมดอายุ 01/05/70"
  ],
  // short front-of-pack captures and barcode-only evidence
  ["th", "supplement", "วิตามินรวม ตราสาธิต\nผลิตภัณฑ์เสริมอาหาร\n30 เม็ด"],
  ["th", "drug", "ยาธาตุน้ำขาว ตราทดสอบ\nยาสามัญประจำบ้าน\n200 มล."],
  ["en", "food", "Sample Oat Drink\nBarista Edition\n1 L", { gtins: ["8850006939727"] }],
  ["th", "food", "น้ำดื่ม ตราสาธิต\n600 มล.", { gtins: ["8851234567898"] }],
  ["zh", "food", "乌龙茶\n无糖\n500ml\n条码 6901234567892"],
  ["en", "cosmetic", "SAMPLE LIP BALM\nHoney & Shea\n4.5 g\nBarcode 8850006939727"]
];

/* ------------------------------------------------ personal documents ------------------------------------------------ */
// [lang, type, text]   none of these is a product label; several list a product, a few carry a registration number
const DOCS = [
  // shipping labels
  ["th", "shipping",
    "Flash Express\nผู้รับ: คุณสมมติ ใจทดสอบ\nโทร 081-234-5678\n55/12 ซอยสาธิต 3 ถนนทดลอง แขวงตัวอย่าง เขตบางรัก กรุงเทพฯ 10500\nผู้ส่ง: ร้านวิตามินสาธิต 02-123-4567\nCOD 590 บาท\nTH0123456789A"
  ],
  ["th", "shipping",
    "ไปรษณีย์ไทย EMS\nชื่อผู้รับ นางสาวตัวอย่าง นามสมมุติ\nที่อยู่ 9/9 หมู่ 2 ต.ทดสอบ อ.เมือง จ.เชียงใหม่ 50000\nเบอร์โทร 089-765-4321\nสินค้า: ครีมกันแดด 30 กรัม 2 หลอด\nEB123456789TH"
  ],
  ["th", "shipping",
    "KERRY EXPRESS\nจัดส่งถึง: ทดลอง สุขสมมติ (089 111 2222)\n12 ถ.สาธิต ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000\nจาก: บริษัท สาธิตเฮลท์ จำกัด\nรายการ: ผลิตภัณฑ์เสริมอาหาร วิตามินซี 1000 มก. 30 เม็ด x 2\nเลขพัสดุ KEX12345678901"
  ],
  ["th", "shipping",
    "J&T Express\nผู้ส่ง ร้านยาออนไลน์สาธิต\nผู้รับ จำลอง ทดสอบดี\n77 หมู่บ้านตัวอย่าง ซ.5 ต.บางพลี อ.บางพลี สมุทรปราการ 10540\nเก็บเงินปลายทาง 320.00\nน้ำหนัก 0.5 kg\n820012345678"
  ],
  ["th", "shipping",
    "Shopee Xpress\nOrder ID 2411108ABCDEFG\nผู้รับ: สาธิต ไม่มีจริง\n(+66)812345678\n88/1 ถนนตัวอย่าง แขวงทดสอบ เขตจตุจักร กรุงเทพมหานคร 10900\nสินค้า: เซรั่มบำรุงผิวหน้า 30 ml เลขจดแจ้ง 10-1-6600012345 จำนวน 1"
  ],
  ["en", "shipping",
    "SHIP TO:\nJane Placeholder\n12 Sample Road, Apt 4B\nSpringfield, IL 62704\nTracking # 1Z 999 AA1 01 2345 6784\nFROM: Sample Naturals LLC\nContents: Fish Oil 1000 mg softgels, 90 count"
  ],
  ["en", "shipping",
    "Royal Mail Tracked 48\nDelivery address\nMr John Exampleton\n4 Mock Lane\nLondon N1 9GU\nReturn address: Example Pharma Ltd, PO Box 12\nParcel weight 0.42 kg"
  ],
  ["en", "shipping",
    "Recipient: Mary Fictive\nPhone: +66 81 234 5678\nAddress: 99 Soi Sample 4, Sukhumvit Rd, Bangkok 10110\nSender: Mock Beauty Store\nItem: Hydrating Face Cream 50 g, Ingredients: Aqua, Glycerin\nWaybill 7700123456"
  ],
  ["en", "shipping",
    "DHL EXPRESS WORLDWIDE\nFrom: Example Pharma Ltd, Sampletown\nTo: Alan Mockridge\n25 Placeholder Street, Singapore 049213\nContact: +65 6123 4567\nAWB 12 3456 7890\nDescription: vitamins 2 bottles, Net Wt 0.3 kg"
  ],
  ["zh", "shipping", "顺丰速运\n收件人：测试明 138 0013 8000\n收件地址：上海市浦东新区示例路88号3栋502室\n寄件人：示例药房旗舰店\n托寄物：维生素C片 100片×2\n运单号 SF1234567890123\n已验视"],
  ["zh", "shipping", "中通快递\n寄件人 样本华 13900001111\n收货人 李示例 13800002222\n收货地址 广东省深圳市南山区示例大道66号\n订单号 20241110123456\n品名：面膜 25ml×5片 国妆特字G20190123"],
  ["zh", "shipping", "黑貓宅急便\n收件人：陳範例 先生\n電話：0912-345-678\n地址：台北市大安區範例路一段100號5樓\n寄件人：範例生技股份有限公司\n品名：保健食品 魚油軟膠囊 60粒\n託運單號 9012-3456-7890\n代收貨款 NT$1,280"],
  ["ja", "shipping", "ヤマト運輸 宅急便\nお届け先\n〒100-0001 東京都千代田区見本町1-2-3\n見本 太郎 様\nご依頼主 サンプル製薬株式会社 通販部\n品名：健康食品（ビタミンC 60粒）\n送り状番号 1234-5678-9012"],
  ["ko", "shipping",
    "CJ대한통운\n받는 분: 김샘플 010-1234-5678\n주소: 서울특별시 강남구 샘플로 12길 34, 101동 202호\n보내는 분: 샘플코스메틱(주)\n품목: 수분 크림 50ml 2개\n운송장번호 5678-1234-9012\n배송메모: 문 앞에 놓아주세요"
  ],
  ["other", "shipping",
    "J&T Express\nPenerima: Budi Contoh\n0812-3456-7890\nJl. Contoh No. 12, Jakarta Selatan 12345\nPengirim: Toko Vitamin Contoh\nNo. Resi JP1234567890\nIsi paket: Vitamin C 500 mg 30 tablet"
  ],
  // order / packing slips and gift notes
  ["th", "order",
    "ใบส่งของ / Packing list\nเลขที่คำสั่งซื้อ #A10234\nลูกค้า: คุณทดลอง สุขสมมติ\nโทร 086-555-1234\n1 x วิตามินซี 1000 มก. 30 เม็ด\n2 x คอลลาเจน 15 ซอง\nขอบคุณที่อุดหนุนค่ะ"
  ],
  ["th", "note", "ถึงคุณแม่\nหนูส่งวิตามินกับแคลเซียมมาให้นะคะ กินวันละ 1 เม็ด หลังอาหารเช้า\nรักแม่นะคะ\nจาก น้องสาธิต 081-234-5678"],
  ["th", "note", "สุขสันต์วันเกิดนะพี่ตัวอย่าง\nขอให้สุขภาพแข็งแรง ครีมกระปุกนี้ทาก่อนนอนนะ\nจากน้องทดลอง"],
  ["th", "note", "ฝากให้ลุงจำลอง ทดสอบดี ห้อง 502\nยาแก้ปวด 500 มก. 10 เม็ด กินครั้งละ 1 เม็ด\nโทรหาป้าได้ที่ 089-765-4321"],
  ["en", "order",
    "PACKING SLIP\nOrder No. 100234\nOrder date: 10 Nov 2026\nBill to: Jane Placeholder, 12 Sample Road\nQty 2 Vitamin C 1000 mg, 60 Tablets, Dietary Supplement\nQty 1 Zinc 50 mg 120 tablets\nThank you for your order!"
  ],
  ["en", "note", "Dear Mary,\nHappy birthday! I got you the face cream you liked (50 g, apply morning and night).\nLove,\nJohn\nCall me on 081-234-5678"],
  ["en", "note", "Gift message:\nTo: Alan Mockridge\nFrom: Jane\nGet well soon! Take 1 tablet of the vitamin C 1000 mg daily with a meal.\nOrder #55012"],
  ["en", "order",
    "Order confirmation\nCustomer: Testy McSample\nEmail: testy.mcsample@example.test\nItems: Hydrating Face Cream 50 g x1; Baby Shampoo 200 ml x2\nShipping method: Standard\nDeliver to: 4 Mock Lane, London"
  ],
  ["zh", "order", "发货清单\n订单编号：202411100987\n买家：测试明\n买家留言：请尽快发货\n商品：钙维生素D软胶囊 60粒 ×1 保健食品\n实付金额：￥128.00\n谢谢惠顾"],
  ["zh", "note", "亲爱的妈妈：\n给您买了钙片，每天一粒，饭后吃。\n祝您身体健康，生日快乐！\n女儿 样本华 敬上"],
  ["ja", "note", "見本 花子 様\nお誕生日おめでとうございます。\n化粧水をお送りします。洗顔後にお使いください。\n見本 太郎より"],
  ["ko", "order", "주문번호 20241110-000123\n받는사람: 이샘플\n연락처: 010-9876-5432\n배송지: 부산광역시 해운대구 샘플로 45\n상품명: 홍삼정 스틱 10ml x 30포\n결제금액 58,000원"],
  // receipts / invoices
  ["th", "receipt",
    "ร้านยาสาธิตเภสัช สาขา 2\nใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ\nลูกค้า: คุณตัวอย่าง นามสมมุติ สมาชิกเลขที่ 001234\nพาราเซตามอล 500 มก. 10 เม็ด 15.00\nวิตามินซี 1000 มก. 30 เม็ด 250.00\nรวมทั้งสิ้น 265.00\nเงินสด 300.00 เงินทอน 35.00"
  ],
  ["th", "receipt",
    "โรงพยาบาลตัวอย่าง\nใบแจ้งค่ารักษาพยาบาล\nนาย สมมติ ใจทดสอบ อายุ 45 ปี\nค่ายา 450.00 ค่าบริการทางการแพทย์ 300.00\nยอดชำระ 750.00 บาท\nสิทธิการรักษา: ประกันสังคม"
  ],
  ["en", "receipt",
    "SAMPLE PHARMACY\nTAX INVOICE / RECEIPT\nSold to: Mr John Exampleton\nMember ID 440012\nIbuprofen 200 mg tablets x24 4.99\nSunscreen Lotion SPF 30 100 ml 12.50\nSubtotal 17.49\nTotal due 17.49\nPaid by card ****1234"
  ],
  ["en", "receipt",
    "INVOICE #INV-2026-0042\nBill To: Mary Fictive, 99 Sample Street\nDescription: Fish Oil 1000 mg softgels (Lot A12345, Exp 01/2028) x 3\nAmount due: USD 45.00\nCompany Reg. No. 201912345Z"
  ],
  ["zh", "receipt", "示例大药房\n销售小票\n会员：李示例 139****2222\n布洛芬缓释胶囊 1盒 18.50\n维生素C片 1瓶 29.90\n合计：48.40\n实付：48.40 微信支付\n收银员：003"],
  ["ja", "receipt", "領収書\n見本 太郎 様\n合計金額 ¥3,480（税込）\n但し ビタミン剤 100mL×3本 代として\nサンプル薬局 駅前店"],
  // medical certificates, reports, appointment slips, cards
  ["th", "certificate",
    "ใบรับรองแพทย์\nข้าพเจ้า นพ.สาธิต ไม่มีจริง ใบอนุญาตประกอบวิชาชีพเวชกรรมเลขที่ ว.12345\nได้ตรวจร่างกาย นางสาวตัวอย่าง นามสมมุติ เมื่อวันที่ 10 พฤศจิกายน 2569\nผลการวินิจฉัย: ไข้หวัดใหญ่\nเห็นควรให้หยุดพักรักษาตัว 3 วัน\nลงชื่อ ........................ แพทย์ผู้ตรวจ"
  ],
  ["th", "appointment",
    "ใบนัด\nโรงพยาบาลตัวอย่าง แผนกอายุรกรรม\nนาย ทดลอง สุขสมมติ\nนัดครั้งต่อไป 15 ธ.ค. 2569 เวลา 09.00 น.\nงดน้ำงดอาหารหลังเที่ยงคืน\nกรุณานำยาเดิมมาด้วย"
  ],
  ["th", "labreport", "ผลตรวจเลือด\nชื่อ จำลอง ทดสอบดี อายุ 52 ปี\nน้ำตาลในเลือด 105 mg/dL\nคอเลสเตอรอล 210 mg/dL\nแพทย์ผู้สั่งตรวจ พญ.ตัวอย่าง"],
  ["th", "card", "บัตรประจำตัวผู้ป่วย\nโรงพยาบาลสาธิต\nนาง สมมติ ใจทดสอบ\nแพ้ยา: เพนิซิลลิน\nกรุ๊ปเลือด O\nกรุณานำบัตรมาทุกครั้ง"],
  ["en", "certificate",
    "MEDICAL CERTIFICATE\nThis is to certify that Mr Alan Mockridge, aged 34, was examined on 10 November 2026.\nDiagnosis: acute gastroenteritis\nHe is unfit for work for 2 days.\nMedication: oral rehydration salts 3.3 g, paracetamol 500 mg tablets\nDr. Jane Placeholder, MD"
  ],
  ["en", "letter",
    "To whom it may concern,\nMary Fictive has been under my care since March 2026 and is prescribed atorvastatin 20 mg tablets.\nPlease allow her to carry this medication when travelling.\nYours sincerely,\nDr John Exampleton"
  ],
  ["en", "appointment",
    "APPOINTMENT CARD\nCity Dental Centre\nName: Testy McSample\nYour next visit: Mon 14 Dec 2026, 10:30\nPlease bring your current medication, 30 tablets pack\nTo reschedule call 02-555-1234"
  ],
  ["en", "labreport",
    "LABORATORY REPORT\nJane Placeholder  Sex: F  Age: 41\nSpecimen: serum\nGlucose 5.4 mmol/L\nVitamin D 22 ng/mL (low)\nReported by: Sample Diagnostics"
  ],
  ["en", "card", "INSURANCE CARD\nMember: John Exampleton\nPolicy No. 88-1234567\nPlan: Gold\nRx BIN 012345\nCustomer care 1-800-555-0100"],
  ["zh", "certificate", "疾病诊断证明书\n兹证明 测试明，男，36岁，于2026年11月10日来我院就诊。\n临床诊断：急性上呼吸道感染\n建议休息三天。\n医师签名：样本华\n示例市人民医院（盖章）"],
  ["zh", "certificate", "診斷證明書\n姓名 陳範例 性別 男 出生 民國 70 年 5 月 6 日\n病名：急性腸胃炎\n醫師囑言：宜休養三日\n範例醫院 院長 王樣本"],
  ["zh", "appointment", "预约挂号凭条\n就诊人：李示例\n科室：心内科门诊\n预约时间：2026-11-12 上午 09:30\n请提前15分钟取号候诊"],
  ["zh", "labreport", "检验报告单\n测试明 男 45岁\n项目 结果 参考值\n葡萄糖 5.6 mmol/L 3.9-6.1\n总胆固醇 5.9 mmol/L\n检验者：样本华"],
  ["ja", "certificate", "診断書\n氏名 見本 太郎 殿\n病名 急性胃腸炎\n上記の通り診断します。3日間の安静加療を要する。\nサンプル内科クリニック 医師 見本 一郎"],
  ["ja", "appointment", "予約票\n見本 花子 様\n次回予約 11月20日（金）10:30\n診察券をお持ちください\nサンプル歯科クリニック"],
  ["ko", "certificate", "진단서\n성명: 박샘플 주민등록번호: 800101-1******\n병명: 급성 장염\n위와 같이 진단함\n샘플내과의원 의사 김견본"],
  // other personal papers (no product words at all)
  ["th", "letter", "เรียน คุณสาธิต ไม่มีจริง\nตามที่ท่านได้สมัครสมาชิกไว้ บริษัทขอแจ้งว่าได้รับเอกสารของท่านเรียบร้อยแล้ว\nขอแสดงความนับถือ\nฝ่ายบริการลูกค้า"],
  ["th", "card", "นามบัตร\nตัวอย่าง นามสมมุติ\nผู้จัดการฝ่ายขาย\nมือถือ 081-234-5678\nsample.person@example.test"],
  ["th", "slip", "โอนเงินสำเร็จ\nจาก นาย ทดลอง ส. xxx-x-x1234-x\nไปยัง น.ส. ตัวอย่าง น. xxx-x-x5678-x\nจำนวนเงิน 1,250.00 บาท\nเลขที่รายการ 202611101234"],
  ["en", "letter", "Dear Mr Mockridge,\nThank you for your application. We are pleased to confirm your interview on 3 December.\nKind regards,\nHR Department"],
  ["en", "card", "Boarding pass\nPLACEHOLDER/JANE MS\nBKK to SIN  Flight LQ 123\nSeat 14A  Gate D5\nBooking ref X7K2PQ"],
  ["zh", "card", "姓名 李示例\n性别 男 民族 汉\n出生 1990年1月1日\n住址 北京市朝阳区示例街道1号\n公民身份号码 11010519900101XXXX"],
  // documents that quote a full product line (a parcel label / note listing the product with its numbers)
  ["th", "shipping",
    "ผู้รับ คุณจำลอง ทดสอบดี 0891234567\n1/2 ถ.ตัวอย่าง อ.เมือง จ.ระยอง 21000\nสินค้า: ซาแมพลาม็อล 500 พาราเซตามอล 500 มก. เลขทะเบียนที่ 1A 844/39 บรรจุ 10 เม็ด Lot 2405A Exp 05/2570\nผู้ส่ง ร้านยาสาธิต"
  ],
  ["en", "order",
    "Delivery note\nDeliver to: Mary Fictive, Ward 5\nIbuprofen 200 mg tablets, NDC 0573-0150-20, LOT A12345 EXP 01/2028, qty 2\nReceived by: ____________"
  ],
  ["zh", "shipping", "收件人：样本华 13800138000\n地址：浙江省杭州市西湖区示例路9号\n内件：布洛芬缓释胶囊 国药准字H20013062 批号20240501 2盒\n寄件人：示例大药房"]
];

/* ------------------------------------------------ dispensing labels ------------------------------------------------ */
// [lang, text]   foreign dispensing labels first (the two classes the v5 independent check missed), then others
const DISPENSING = [
  ["zh", "範例診所\n王樣本 先生\n身分證字號 A123456789\n看診日期 113/11/08\n普拿疼錠 500mg\n每日三次 每次一粒 飯後服用\n共 9 粒"],
  ["zh", "仁範耳鼻喉科診所 藥袋\n姓名：陳範例\n病歷號：0012345\n藥名：Amoxicillin 500mg\n用法：一天三次，每次一顆，飯後\n調劑日期：113.11.08\n藥師：林樣本"],
  ["zh", "範例聯合門診\n林樣本 女 45歲\n門診日期 2026/11/08 科別 家醫科\nLoratadine 10mg 錠\n每日一次 每次一粒 睡前\n調劑藥師 張範例"],
  ["zh", "健保特約藥局\n領藥人 黃範例\nF223456786\n處方箋來源：範例醫院\nMetformin 500mg\n早晚飯後各一粒\n給藥日數 28 天"],
  ["zh", "上海市示例区中心医院 门诊\n张示例 男 52岁\n就诊卡号 6001234567\n科别：内分泌科\n二甲双胍片 0.5g×20片\n用法：口服 每次1片 一日2次\n发药窗口 3 号"],
  ["zh", "门诊处方\n费别：医保\n李示例 女 34岁\n科室：呼吸内科\n阿莫西林胶囊 0.25g\n每次2粒 一日3次 口服\n医师：样本华\n调配：测试明"],
  ["zh", "上海示例社区卫生服务中心\n门诊药房\n样本华\n就诊日期 2026-11-10\n氨氯地平片 5mg\n一日一次 每次一片\n处方医师 王示例"],
  ["zh", "门诊用药指导单\n测试明 病历 20241110088\n硝苯地平控释片 30mg\n每日1次 每次1片 整片吞服\n请遵医嘱"],
  ["ja", "サンプル調剤薬局\n見本 太郎 様\n内服薬\n1日3回 毎食後 1回1錠 7日分\nロキソプロフェン錠60mg\n調剤日 令和8年11月10日"],
  ["ko", "샘플약국\n환자명: 김샘플\n조제일자 2026.11.10\n타이레놀정 500mg\n1일 3회 식후 30분 1회 1정 3일분\n조제약사 박견본"],
  ["en",
    "SAMPLE FAMILY CLINIC\nJane Placeholder\nNRIC S1234567D\nAmoxicillin 500 mg capsules\nTake 1 capsule 3 times a day after food\nQty 21  Date 10/11/2026"
  ],
  ["en", "Klinik Contoh\nPatient: Alan Mockridge\nParacetamol 500 mg\nTake 2 tablets 4 times a day when necessary\nDispensed on 10 Nov 2026"],
  ["th", "คลินิกสาธิตการแพทย์\nสมพร ใจสมมติ\nยาแก้อักเสบ AMOXICILLIN 500 mg\nรับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร\nเลขทะเบียน 1A 844/39"],
  ["th", "ใบสั่งยา\nนาย ทดลอง สุขสมมติ HN 65-01234\nMetformin 500 mg 1x2 pc\nแพทย์ผู้สั่ง นพ.ตัวอย่าง"]
];

/* ------------------------------------------------ low-quality OCR versions ------------------------------------------------ */
/** mulberry32: a fixed pseudo-random stream per seed. @param {number} a */
const rng = a => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const THAI_MARK = /[ัิ-ฺ็-๎]/u;
/** @param {string} t @param {number} seed */
const drop = (t, seed) => { const r = rng(seed); return [...t].filter(c => c === "\n" || !(THAI_MARK.test(c) ? r() < 0.3 : r() < 0.08)).join(""); };
/** @param {string} t */
const merge = t => t.replace(/\n+/g, " ");
/** @param {string} t */
const half = t => { const l = t.split("\n"); return l.length < 4 ? t : l.filter((_, i) => i % 2 === 0).join("\n"); };
const LOOK = { "0": "O", O: "0", "1": "l", l: "1", "5": "S", S: "5", m: "rn", "8": "B", I: "l" };
/** @param {string} t @param {number} seed */
const swap = (t, seed) => { const r = rng(seed); return [...t].map(c => (LOOK[c] && r() < 0.25 ? LOOK[c] : /[A-Za-zก-ฮ一-鿿]/u.test(c) && r() < 0.04 ? c + " " : c)).join(""); };

export function build() {
  const items = [];
  let n = 0;
  const add = (o) => items.push({ id: "e" + String(++n).padStart(3, "0"), ...o });
  PRODUCTS.forEach(([lang, category, text, facts], i) => {
    const base = { lang, kind: "product", category, expect: "allow", ...(facts ? { facts } : {}) };
    add({ ...base, variant: "clean", text });
    add({ ...base, variant: "drop", text: drop(text, 1000 + i) });
    add({ ...base, variant: "merge", text: merge(text) });
    add({ ...base, variant: "half", text: half(text) });
    add({ ...base, variant: "swap", text: swap(text, 2000 + i) });
  });
  DOCS.forEach(([lang, type, text], i) => {
    const base = { lang, kind: "document", category: type, expect: "refuse" };
    add({ ...base, variant: "clean", text });
    add({ ...base, variant: "drop", text: drop(text, 3000 + i) });
    add({ ...base, variant: "merge", text: merge(text) });
  });
  DISPENSING.forEach(([lang, text], i) => {
    const base = { lang, kind: "dispensing", category: "dispensing", expect: "refuse" };
    add({ ...base, variant: "clean", text });
    add({ ...base, variant: "merge", text: merge(text) });
    add({ ...base, variant: "drop", text: drop(text, 4000 + i) });
  });
  return {
    name: "P7 product-label evidence filter — DEV set",
    source: "synthetic (written 2026-11-10 before the filter was built; every person, number, address and brand is invented). DEV: tuned on, not a measurement",
    frozen: "2026-11-10",
    metrics: "documents / dispensing labels refused (aiGate.allow === false) / all; product labels refused / all, per OCR variant and language",
    items
  };
}

/** @param {{aiGate: (t: string, facts?: any) => {allow: boolean, reason: string}}} guard @param {any} set */
export function score(guard, set) {
  /** @type {Record<string, {n: number, refused: number}>} */ const by = {};
  const bump = (/** @type {string} */ k, /** @type {boolean} */ refused) => { by[k] = by[k] || { n: 0, refused: 0 }; by[k].n++; if (refused) by[k].refused++; };
  const wrong = [];
  for (const it of set.items) {
    const g = guard.aiGate(it.text, it.facts);
    const refused = !g.allow;
    bump(it.kind, refused); bump(`${it.kind}/${it.variant}`, refused); bump(`${it.kind}/lang:${it.lang}`, refused);
    if (it.kind === "product" && it.variant !== "clean") bump("product/low-quality", refused);
    if (it.kind === "product" && !["th", "en"].includes(it.lang)) bump("product/foreign", refused);
    if (refused) bump(`${it.kind}/reason:${g.reason}`, true);
    if ((it.expect === "allow") === refused) wrong.push({ id: it.id, kind: it.kind, variant: it.variant, lang: it.lang, reason: g.reason });
  }
  return { by, wrong };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && process.argv.includes("--eval")) {
  const { createRequire } = await import("node:module");
  const guard = createRequire(import.meta.url)("../lensiq-pc-guard.js");
  const buf = readFileSync(OUT);
  const r = score(guard, JSON.parse(buf.toString("utf8")));
  const f = (/** @type {string} */ k) => (r.by[k] ? `${r.by[k].refused}/${r.by[k].n}` : "0/0");
  const sha = (/** @type {Buffer} */ b) => createHash("sha256").update(b).digest("hex");
  const line = `${new Date().toISOString()} DEV (tuned on; not a measurement) set ${sha(buf).slice(0, 12)} guard ${sha(readFileSync(join(ROOT, "lensiq-pc-guard.js"))).slice(0, 12)} ` +
    `documents refused ${f("document")} dispensing refused ${f("dispensing")} | product labels refused ${f("product")} (clean ${f("product/clean")}, low-quality OCR ${f("product/low-quality")}, ` +
    `foreign ${f("product/foreign")}) | wrong ${r.wrong.map(w => `${w.id}:${w.kind}/${w.variant}/${w.lang}`).join(",") || "-"}`;
  if (!process.argv.includes("--no-log")) {
    const dir = join(homedir(), "LENSIQ-field", "evals", "p7");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "p7-evidence-dev-eval.log"), line + "\n");
  }
  console.log(line);
  if (process.argv.includes("--json")) console.log(JSON.stringify(r, null, 1));
} else if (isMain) {
  const json = JSON.stringify(build(), null, 1) + "\n";
  if (process.argv.includes("--check")) {
    if (readFileSync(OUT, "utf8") !== json) { console.error("p7-evidence-testset.json differs from tools/pc-evidence-testset.mjs"); process.exit(1); }
    console.log("p7-evidence-testset.json OK");
  } else {
    writeFileSync(OUT, json);
    const s = build();
    const c = (/** @type {string} */ k) => s.items.filter((/** @type {any} */ i) => i.kind === k).length;
    console.log(`items ${s.items.length}: product ${c("product")}, document ${c("document")}, dispensing ${c("dispensing")}`);
  }
}
