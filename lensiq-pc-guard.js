/* lensiq-pc-guard.js — Product Check patient-name / personal-identifier guard (round 17 P7; design §8.2 "Patient-name
 * guard"). Browser: window.LQPCGuard · Node: module.exports (the Worker imports the same file: ai/pc-features.js).
 * Pure text logic, no DOM, no network.
 *
 * Runs on the device BEFORE ANY AI send:
 *   - text mode: redact() replaces every span found by PLACEHOLDER; the page shows the user what was removed;
 *   - image mode: imageCheck() BLOCKS the photo when it finds personal data, or when the text looks like a dispensing /
 *     prescription label (a name with no cue at all cannot be found in text, and it would be in the photo). The page
 *     then offers text only, redacted.
 * Digits are folded first (Thai ๐-๙ and full-width ０-９ -> 0-9, one character for one, so spans map back exactly).
 * What it removes:
 *   name   1. after a field cue, greedily to the end of the line (names spaced by syllable, nicknames in brackets), cut at
 *             the next field word (อายุ, HN, โทร, DOB, Age, Tel, 电话 ...) or a digit: ชื่อผู้ป่วย, ชื่อ-สกุล, ชื่อเล่น, ชื่อ,
 *             ผู้ป่วย, คนไข้, ผู้รับยา, Patient: / Patient name - , NAME:, Pt:, Rx for, Dispensed to, Prepared for,
 *             Dr. order for, For: (dispensing labels only), 患者姓名, 姓名, 病人, 就诊人;
 *          2. on a DISPENSING LABEL only: an honorific / rank / monk title + a person-like name (นาย, นาง, นางสาว, คุณ,
 *             ด.ช. ..., ร.ต.อ., พ.ต.ท. ..., พระ, พระครู, พระมหา ..., Mr / Mrs / Ms / Miss / Dr / Khun, 王先生 / 女士 / 小姐).
 *             On an ordinary product pack an honorific is kept (brands such as "Mrs. X's Herbal Tea", "นายห้าง ...").
 *   hn     after HN, AN, VN, MRN, OPD No, เลขที่ผู้ป่วย, 门诊号, 病历号, 住院号
 *   phone  Thai mobile (0[689] + 8), landline (02 + 7, 0[3-7]x + 6), +66 (with "(0)"), Chinese mobile; any grouping
 *          (2-4-4, 3-3-4, spaces, dots, brackets). A phone next to a company / maker cue (ผลิตโดย, จำหน่ายโดย, บริษัท,
 *          Manufactured by, Co., Ltd., 制造商, 有限公司 ...) is a COMPANY phone: kept in text and not blocking the photo
 *          under the default setting DEFAULTS.companyPhones = "keep" (owner decision pending; "remove" treats it like any
 *          other phone). Registration numbers, barcodes and dates are not phone-shaped (tested).
 *   id     Thai ID: the 1-4-5-2-1 printed shape, or 13 digits with a valid check digit next to an ID cue
 *   email  e-mail addresses
 *   dob    after เกิด / วันเกิด / ว/ด/ป เกิด / DOB / Date of birth / Born / 出生 / 出生日期: numeric dates, Thai month names or
 *          abbreviations with Buddhist-era years, English month names, 年月日
 * LIMIT (stated in docs/product-check/P7-RESULTS.md §3): a bare name with no cue and no honorific is not found in text.
 * Measured on docs/product-check/p7-guard-testset.json (dev) and p7-guard-holdout.json (frozen, scored once).
 *
 *   scan(text, opts?) -> [{kind, start, end}]          what redact() removes (sorted, merged)
 *   scanAll(text) -> [{kind, start, end, company?}]     every span, company phones flagged
 *   redact(text, opts?) -> {text, removed: [{kind, text}], count}
 *   imageCheck(text, opts?) -> {block, personal, dispensing}
 *   isDispensingLabel(text) -> boolean   (a maker-printed responsible-pharmacist line next to a maker block is no sign;
 *     a bare name-like line is no sign on a text with the structure of a pack: three pack-only cue types)
 *   nameLineCount(text) -> lines that read like a bare personal name (tests)
 *   fold(text) · DEFAULTS · PLACEHOLDER · KINDS
 * PRODUCT-LABEL EVIDENCE (owner decision 2026-11-10, option 1): AI is allowed for a capture only when it IS a product label.
 *   productEvidence(text, facts?) -> {product, strong, evidence: [type], personalDoc, docCues: [group]}
 *   aiGate(text, facts?, opts?) -> {allow, reason: "ok"|"dispensing"|"personal-doc"|"no-product", ...}   ONE decision for
 *     text mode and image mode, on the page and in the Worker. facts = {gtins: [digits], regs: [numbers]} the page holds.
 *   Rule: allow = not a dispensing label AND no personal-document sign AND (one strong cue: a registration-number shape or
 *     a barcode with a valid check digit, OR two different label cue types; directions / strength / quantity are weak and
 *     count as one type together). Dev numbers: docs/product-check/P7-RESULTS.md §3.4 (dev only; not a measurement).
 */
(function (root, factory) {
  const m = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = m;
  else /** @type {any} */ (root).LQPCGuard = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const PLACEHOLDER = "[removed]";
  /** Owner decision pending (2026-11-10): company / maker phones are kept by default. */
  const DEFAULTS = Object.freeze({
    // option ข (session evidence): OFF. The independent run on the locked p7b set missed the privacy target (6 of 614
    // personal items reached the AI); stays off until the owner decides (docs/product-check/P7-RESULTS.md).
    sessionEvidence: "off",
    companyPhones: /** @type {"keep"|"remove"} */ ("keep"),
    // owner decision pending (coordinator, 2026-11-10): "off" = no AI send at all (text or photo) for a text that looks like a
    // dispensing / prescription label; "text-preview" = text only, after the mandatory preview. On-device results stay.
    dispensingAI: /** @type {"off"|"text-preview"} */ ("off")
  });

  /* ---------------- folding (one UTF-16 unit for one, so offsets stay the same) ---------------- */
  /** @param {string} s */
  function fold(s) {
    return s.replace(/[๐-๙０-９＋（）]/gu, c => {
      const k = c.charCodeAt(0);
      if (k >= 0x0e50 && k <= 0x0e59) return String(k - 0x0e50);
      if (k >= 0xff10 && k <= 0xff19) return String(k - 0xff10);
      return c === "＋" ? "+" : c === "（" ? "(" : ")";
    });
  }

  /* ---------------- vocabulary ---------------- */
  const TL = "ก-ฺเ-๎"; // Thai letters and marks, no digits
  const THN = `[${TL}]{2,}`;
  const HON_TH = "(?:ว่าที่\\s?ร\\.ต\\.(?:หญิง)?|พล\\.[ตอทร]\\.[อทต]\\.|พล\\.[อทต]\\.|[พรนจ]\\.[อทต]\\.(?:หญิง)?|ร\\.ต\\.[อทต]\\.|พ\\.ต\\.[อทต]\\.|ด\\.ต\\.|จ\\.ส\\.[อทต]\\.|ส\\.[อทต]\\.|" +
    "พระครู|พระมหา|พระอธิการ|พระ|สามเณร|แม่ชี|นางสาว|เด็กชาย|เด็กหญิง|น\\.ส\\.|ด\\.ช\\.|ด\\.ญ\\.|นพ\\.|พญ\\.|ทพ\\.|ทพญ\\.|ภก\\.|ภญ\\.|ดร\\.|นาย|นาง|คุณ)";
  // words that start like an honorific but are label words (คุณภาพ = quality, คุณแม่ = mothers, นางฟ้า, นายหน้า, พระจันทร์ ...)
  const NOT_NAME = "(?!ภาพ|ประโยชน์|ค่า|สมบัติ|ลักษณะ|แม่|พ่อ|ธรรม|วุฒิ|หมอ|ฟ้า|พญา|หน้า|ทุน|งาน|ละ|จันทร์|อาทิตย์|ราช|เจ้า|ไตรปิฎก|พุทธ|เครื่อง|บรม)";
  const HON_EN = "(?:Mr|Mrs|Ms|Miss|Mstr|Master|Dr|Khun)\\.?";
  const ENN = "[A-Z][a-z]+(?:[-'][A-Za-z]+)?";
  const PRODUCT_WORDS_EN = new RegExp([
    "\\b(?:tea|herbal|herbs?|skin|skincare|care|lotion|cream|body|serum|soap|shampoo|oil|balm|brand|formula|collection|",
    "kitchen|bakery|coffee|beauty|labs?|laborator(?:y|ies)|pharma(?:ceuticals?)?|research|institute|",
      "foods?|group|products?|original|natural|organic|cosmetics?|clinic|essence|toner|mask|vitamins?|",
    "supplement|tablets?|capsules?|syrup|drops|toothpaste|whitening|cough|joint|cleaner|wash|spray|gel|powder|pills|softgels?|",
    "gummies|cookies?|sauce|noodles|honey|tonic|juice|candy|snacks?|recipe|mix)\\b|[®™]|'s\\b"
  ].join(""), "i");
  const PRODUCT_WORDS_TH = new RegExp([
    "ครีม|โลชั่น|สบู่|ชาสมุนไพร|ชาเขียว|กาแฟ|เครื่องดื่ม|อาหาร|ผลิตภัณฑ์|แบรนด์|เซรั่ม|น้ำมัน|ยาหม่อง|สมุนไพร|บำรุง|",
    "เครื่องสำอาง|ยาดม|ยาหอม|ห้าง|เภสัช|โอสถ|ฟาร์มา|แล็บ|ห้องปฏิบัติการ|โอสถศาลา|ตำรับ"
  ].join(""), "");
  // field words that end a name on the same line
  const STOP = new RegExp("(?:อายุ|เบอร์|โทร|เพศ|วันที่|ที่อยู่|น้ำหนัก|แพ้ยา|เลขที่|เลขประจำตัว|บัตร|เกิด|ว/ด/ป|ห้อง|แผนก|สิทธิ|" +
    "\\b(?:HN|AN|VN|MRN|OPD|DOB|D\\.O\\.B|Date|Age|Sex|Gender|Tel|Phone|Mobile|Ward|ID|Room|Dept|on)\\b|年龄|性别|电话|手机|门诊号|病历号|住院号|科室|日期|出生|身份证|" +
    // Korean / Japanese field words (2026-11-12, after the live-scan review): registration no., birth date, age, sex, phone, address
    "등\\s?록|생\\s?년|나이|성별|연락처|전화|주소|生年月日|年齢|電話|住所|\\d|[|;]|\\[removed\\])", "iu");
  const WARN_START = new RegExp([
    "^(?:โรค|ที่|ซึ่ง|ควร|ห้าม|ต้อง|เด็ก|ผู้|ภาวะ|ตับ|ไต|หัวใจ|เบาหวาน|ความดัน|ทุก|ทั่วไป|และ|หรือ|ใน|กลุ่ม|สูงอายุ|with|who|",
    "should|must|taking|information|package|leaflet|insert|counsel)"
  ].join(""), "iu");
  const B = "(?:^|(?<=[\\s:：(,;/]))"; // token start (Thai has no spaces inside words, so "ในผู้ป่วย" is not a field)
  const PRODUCT_NAME_EN = "(?:product|brand|generic|trade|drug|company|chemical|common|proprietary|manufacturer|scientific|botanical|inci|latin|" +
    "english|thai|medicine|device|model|plant|herb|ingredient|substance|file|user|full\\s+product)";

  // a Korean personal name: a common surname + 1-3 syllables, or the surname spaced from the given name (stream F, 2026-11-13)
  const KO_SUR = "(?:남궁|황보|제갈|선우|독고|사공|김|이|박|최|정|강|조|윤|장|임|한|오|서|신|권|황|안|송|류|유|전|홍|고|문|양|손|배|백|허|남|심|노|하|곽|성|차|주|우|구|" +
    "민|진|나|엄|원|천|방|공|현|함|변|염|여|추|도|석|선|설|마|길|연|위|표|명|기|반|왕|금|옥|육|인|맹|제|모|탁|국|어|은|편|용|예|경|봉|사|부|가|복|태|목|형|계|" +
    "피|두|감|음|빈|동|온|좌|호|범|팽|승|간|상|시|갈|단|견|당|화|창|옹|순|빙|지|독|채|소|라|뇌)";
  const KO_NAME = `(?:${KO_SUR}[가-힣]{1,3}|${KO_SUR}[ \\t][가-힣]{1,3})`;
  const KO_NAME_NS = `${KO_SUR}[가-힣]{1,3}`; // unspaced only ("이 제품" is not a name)
  /** Field cues (on folded text). always: a cue anywhere; dispensing: only on a dispensing label. */
  const CUES = [
    { re: new RegExp(`${B}(?:ชื่อผู้ป่วย|ชื่อ\\s*[-–]\\s*(?:นาม)?สกุล|ชื่อสกุล|ชื่อและนามสกุล|ชื่อเล่น|ผู้รับยา|ผู้รับบริการ|ผู้ใช้ยา)\\s*[:：.\\-–]?`, "gu"), always: true },
    { re: new RegExp(`${B}ชื่อ(?!การค้า|สามัญ|ผลิตภัณฑ์|ยา|สินค้า|ผู้ผลิต|บริษัท|ทาง|ผู้ป่วย|สกุล|นามสกุล|เล่น|และ|ตัวยา|วิทยาศาสตร์|อื่น|\\s*[-–])\\s*[:：.]?`, "gu"), always: true },
    { re: new RegExp(`${B}(?:ผู้ป่วย|คนไข้)\\s*[:：.\\-–]?`, "gu"), always: true, warnCheck: true },
    { re: new RegExp(`\\bPatient(?:'s)?\\s*(?:name)?\\s*[:：\\-–]|\\bPatient\\s+(?=${HON_EN}\\s)`, "giu"), always: true },
    { re: new RegExp(`(?<!${PRODUCT_NAME_EN}\\s*)\\bname\\s*[:：\\-–]`, "giu"), always: true },
    { re: /\bPt\.?\s*[:：]|\bRx\s+for\b|\bDispensed\s+to\b|\bPrepared\s+for\b|\bDr\.?\s+order\s+for\b|\bCustomer\s*[:：]/giu, always: true },
    { re: /(?:^|(?<=\s))For\s*[:：]/gu, always: false }, // on a dispensing label or any label with usage text
    { re: /(?:患者姓名|姓名|就诊人|病人|患者(?=\s*[:：]))\s*[:：]?/gu, always: true },
    // Korean name fields (성명, 환자명, 수진자, 이름:) and an OCR-damaged "Patient:" ("Patiet:", "Patint:"), added 2026-11-12 after
    // the live-scan review (a Korean lab report and a Hong Kong clinic label next to a product label); a product name field
    // (제품 / 상품 / 약품 이름) is not a person
    { re: /(?:^|(?<=[\s:：(]))(?:성\s?명|환\s?자\s?(?:명|성\s?명|이\s?름)|수진자|(?<!(?:제품|상품|약품|의약품)\s?)이\s?름)\s*[:：]/gu, always: true },
    { re: /(?:^|(?<=[\s(]))성\s?명(?=\s+[가-힯A-Za-z])/gu, always: true }, // 성명 (full name) needs no colon
    { re: /\bPati(?:e?n?t|nt)\s*[:：]/giu, always: true },
    // Japanese name fields (stream F, 2026-11-13): 氏名, 患者氏名 / 患者名, お名前 / 名前, フリガナ, 受診者, 被保険者, 受取人, 宛名, 差出人,
    // ご依頼主; a product name field (製品名, 商品名, 販売名, 名称) is not a person
    { re: /(?<!(?:製品|商品|販売|会社|品|物|成分|薬|社)\s?)(?:患\s?者\s?(?:氏\s?名|名)|受診者(?:氏名|名)?|被保険者(?:氏名)?|氏\s?名|お\s?名\s?前|名\s?前|フリガナ|ふりがな|受取人|宛\s?名|差出人|ご依頼主)(?:\s*[(（][^)）\n]{0,8}[)）])?\s*[:：]?/gu,
      always: true },
    // Korean name fields (stream F): 환자 / 보호자 / 성함 / 수령인 / 받는분 / 보내는분 / 수신인 / 예금주 with a colon ...
    { re: /(?:^|(?<=[\s(]))(?:환\s?자|보\s?호\s?자|성\s?함|수\s?령\s?인|수\s?취\s?인|받는\s?(?:분|사람)|보내는\s?(?:분|사람)|수\s?신\s?인|예\s?금\s?주|가\s?입\s?자|피\s?보\s?험\s?자)\s*[:：]/gu,
      always: true },
    // ... or with no colon: words that never stand on a pack (받는분, 수령인, 성함 ...) before a name-shaped word, and 환자 / 보호자 only
    // before a name-shaped word that ends the line or meets a number ("환자 김민수", not "환자 사용 시", "환자는", "보호자의")
    { re: new RegExp(`(?:^|(?<=[\\s(]))(?:성함|수령인|수취인|받는\\s?분|받는\\s?사람|보내는\\s?분|보내는\\s?사람|수신인|예금주)(?=[ \\t]+${KO_NAME}(?:[ \\t]|$))`, "gmu"),
      always: true },
    { re: new RegExp(`(?:^|(?<=[\\s(]))(?:환자|보호자)(?=[ \\t]+${KO_NAME}[ \\t]*(?:$|\\d|\\(|[|/,]))`, "gmu"), always: true },
    // form words for a person (applicant, insured, household head, student, parent, examinee, name tag ...) before an unspaced name
    { re: new RegExp("(?:^|(?<=[\\s(]))(?:환\\s?자\\s?(?:명|성\\s?명|이\\s?름)|이\\s?름표?|이용자|발신인|환자분|신청인|세대주|세대원(?:[ \\t]+배우자)?|가입자|수검자|원아|학부모|학생|계약자|피보험자|수진자|대상자|입소자|" +
      `수급자|어르신|아동|자녀|본인)(?=[ \\t]+${KO_NAME_NS}(?:[ \\t]|$|[(,]))`, "gmu"), always: true },
    // Japanese person words before a name ("患者 小野寺 光", "患者さま 中 島 明", "保護者 北村 幸江", 世帯主, 被扶養者, 受給者, 利用者); "保護者の指導" is not
    { re: new RegExp("(?:^|(?<=[\\s(（:：]))(?:患者(?:さま|様|さん)?|保護者|世帯主|被扶養者|受給者(?:氏名|名)?|利用者(?:氏名|名)?|入所者|園児(?:氏名|名)?|児童(?:氏名|名)?|" +
      "生徒(?:氏名|名)?|本人(?:氏名)?|申請者|契約者)(?=[ \\t\\u3000]*[:：]|[ \\t\\u3000]+[一-鿿々ァ-ヺぁ-ゖ])", "gu"), always: true },
    // a maker-printed responsible person (pharmacist in charge, production supervisor): the NAME is still removed
    { re: new RegExp("(?:เภสัชกรผู้มีหน้าที่ปฏิบัติการ|ผู้มีหน้าที่ปฏิบัติการ|เภสัชกรผู้ควบคุม(?:การผลิต)?|ผู้ควบคุมการผลิต)\\s*[:：.\\-–]?|" +
      "[監监][製制][藥药][師师]\\s*[:：]?|管理[藥药][師师]\\s*[:：]?|[駐驻][廠厂][藥药][師师]\\s*[:：]?|\\b(?:Pharmacist[- ]in[- ]charge|Responsible\\s+pharmacist|Qualified\\s+person)\\s*[:：\\-–]", "giu"),
      always: true, orgCheck: true }
  ];
  // after a role cue: an organisation, not a person ("ผู้ควบคุมการผลิต บริษัท ...")
  const ORG_START = /^(?:บริษัท|บจก|หจก|ห้าง|ร้าน|โรงงาน|องค์การ|สถาน|และ|ตาม|ของ|ที่|ใน|ได้|ต้อง|the\b|of\b|is\b|must\b|shall\b|[^\n]{0,12}(?:Co\.|Ltd|Inc\b|有限公司|公司))/iu;

  /* ---------------- dispensing / prescription label ---------------- */
  const STRONG = new RegExp("(?:ชื่อผู้ป่วย|ผู้ป่วย\\s*[:：]|คนไข้\\s*[:：]|ผู้รับยา|ใบสั่งยา|วันที่จ่ายยา|จ่ายยาโดย|ผู้จ่ายยา|เลขที่ผู้ป่วย|เลขประจำตัวผู้ป่วย|" +
    "\\bHN(?![A-Za-z])|\\bMRN(?![A-Za-z])|\\b(?:AN|VN)\\s*[:：.#]?\\s*\\d|\\bOPD\\s*No|Patient(?:'s)?\\s*(?:name)?\\s*[:：\\-–]|\\bPt\\.?\\s*[:：]|\\bRx\\s*(?:for|#|No\\.?|:)|℞|" +
    "\\bDispensed\\s+(?:to|by|on)\\b|\\bPrescription\\s*(?:No|#|:|for)|\\bDr\\.?\\s+order\\s+for|" +
    "患者姓名|患者\\s*[:：]|病人|就诊人|门诊号|病历号|住院号|处方笺|处方单|病歷號|藥袋|領藥號|調劑|\\bH\\.N\\.|\\bHosp(?:ital)?\\.?\\s*No|" +
    // foreign dispensing labels (v5 independent check: a Taiwan clinic label and a Shanghai outpatient slip were missed).
    // Pack wording is avoided: 处方药 / 凭医师处方销售, 请及时就诊, 请咨询医师或药师 are NOT cues.
    "門診|门诊(?!就医)|就[诊診](?:卡|[号號]|日期|科|人|时间|時間)|病[歷历]|[处處]方(?:[笺箋单單号號医醫师師]|日期|来源|來源|\\s*[:：])|看診|科[别別]|[费費][别別]|健保(?:特約|卡)|医保\\s*[:：]|" +
    "[領领取發发]藥|[领取发]药|給藥日數|[调調]配(?:\\s*[:：]|[人药藥])|調剤|[医醫][师師生]\\s*[:：]|[药藥][师師]\\s*[:：]|身分證|[一-鿿]{2,4}[ \\t]+[男女][ \\t]*\\d{1,3}\\s*[岁歲]|" +
    "患者(?:氏名|名|番号)|処方(?:箋|せん|医|日)|お薬手帳|환자\\s?(?:명|성명|번호)|조제\\s?(?:일|약사|자\\b)|처방(?:전|의)|복약지도|\\bNRIC\\b|\\bPesakit\\b|\\bPasien\\b)", "iu");
  // a Taiwan medicine bag (藥袋): a name field with a Republic-of-China date (民國 113 年 / 113/11/10)
  const ROC = /(?:姓名)[\s\S]*(?:民國\s*\d{2,3}\s*年|(?<!\d)1[01]\d[./]\d{1,2}[./]\d{1,2}(?!\d))|(?:民國\s*\d{2,3}\s*年|(?<!\d)1[01]\d[./]\d{1,2}[./]\d{1,2}(?!\d))[\s\S]*姓名/u;
  const HEADER = new RegExp([
    "^\\s*(?:โรงพยาบาล|รพ\\.|คลินิก|ร้านยา|ร้านขายยา|สถานพยาบาล|สถานีอนามัย|ศูนย์บริการสาธารณสุข|",
    "[A-Za-z .&'-]{0,40}\\b(?:Hospital|Clinic|Klinik|Polyclinic|Dispensary|Pharmacy|Drugstore|(?:Medical|Dental|Health)\\s+Cent(?:er|re))\\b|" +
    "[^\\n]{0,20}(?:医院|诊所|药房|药店|卫生院|醫院|診所|藥局|藥房|衛生所|卫生服务中心|衛生服務中心|調剤薬局|クリニック)|[^\\n]{0,20}(?:약국|의원|병원)[ \\t]*$)"
  ].join(""), "imu");
  const USAGE = /วิธีใช้|รับประทาน|ครั้งละ|วันละ|ก่อนอาหาร|หลังอาหาร|ก่อนนอน|\bTake\s+\d|\btimes?\s+(?:a|per)\s+day|用法用量|每次|每日|一[天日][一二三四\d]次|[飯饭][後后]|1日\d回|毎食後|1회|식후/iu;

  // titles that are always a person (a single name after them is enough, on any label): children, Miss, ranks, monks,
  // professionals. Plain นาย / นาง / คุณ / พระ need a surname too unless the text is a dispensing label.
  const HON_TH_STRONG = new RegExp("^(?:ว่าที่|พล\\.|[พรนจ]\\.[อทต]\\.|ร\\.ต\\.|พ\\.ต\\.|ด\\.ต\\.|จ\\.ส\\.|ส\\.[อทต]\\.|พระครู|พระมหา|พระอธิการ|สามเณร|แม่ชี|" +
    "นางสาว|เด็กชาย|เด็กหญิง|น\\.ส\\.|ด\\.ช\\.|ด\\.ญ\\.|นพ\\.|พญ\\.|ทพ\\.|ทพญ\\.|ภก\\.|ภญ\\.|ดร\\.)", "u");
  /**
   * Honorific + person-like name, on ANY label. A brand is kept only through the exclusion: product words or a possessive
   * on the rest of the line ("Mrs. X's Herbal Tea", "Dr. X Skincare", "นายห้าง ยาดมสมุนไพร").
   * @param {string} t folded text @param {boolean} disp the text is a dispensing label (single names allowed after any title)
   */
  function honorificNames(t, disp) {
    /** @type {{start: number, end: number}[]} */ const out = [];
    const res = [
      new RegExp(`${B}(${HON_TH}${NOT_NAME}[ \\t]*${THN}(?:[ \\t]+(?!${STOP.source})${THN}){0,3}(?:[ \\t]*\\([^)\\n]{1,24}\\))?)`, "gu"),
      new RegExp(`\\b(${HON_EN}[ \\t]+${ENN}(?:[ \\t]+${ENN}){0,2}(?:[ \\t]*\\([^)\\n]{1,24}\\))?)`, "gu"),
      /([一-鿿]{1,3}(?:先生|女士|小姐))/gu
    ];
    for (const re of res) {
      for (const m of t.matchAll(re)) {
        const start = /** @type {number} */ (m.index) + m[0].lastIndexOf(m[1]);
        let val = m[1];
        const lineEnd = t.indexOf("\n", start) < 0 ? t.length : t.indexOf("\n", start);
        const rest = t.slice(start, lineEnd);
        // the name part after the title ("ดร.สมุนไพร" is one token: the title is cut off, not the first token)
        const afterTitle = val.replace(new RegExp(`^(?:${HON_TH}|${HON_EN})\\s*`, "u"), "");
        if (PRODUCT_WORDS_EN.test(rest) || PRODUCT_WORDS_TH.test(rest.replace(val, "")) || PRODUCT_WORDS_TH.test(afterTitle) || PRODUCT_WORDS_TH.test(val.replace(/^\S+/, ""))) continue;
        if (/^(?:女士|小姐|先生)/.test(val) || /期|孕|产妇|哺乳|成年|中年|老年|年轻|职业|爱美|广大|各位|男士|专用|适合|适用|白领|熟龄|人群/.test(val)) continue;
        const words = val.replace(/\([^)]*\)/g, "").trim().split(/[ \t]+/);
        if (re === res[0] && !disp && words.length < 3 && !HON_TH_STRONG.test(val) && !/^[^ \t]+[ \t]+[^ \t]+[ \t]+[^ \t]+/.test(val)) {
          // plain นาย / นาง / คุณ / พระ + one word: a surname is needed (the title may be glued: "คุณสมชาย ใจดี")
          const glued = !/^(?:นาย|นาง|คุณ|พระ)[ \t]/.test(val);
          if (glued ? words.length < 2 : words.length < 3) continue;
        }
        if (re === res[1] && !disp && words.length < 3 && !/^Khun\b/.test(val)) continue; // Mr X alone: only on dispensing labels
        // a Thai name split by syllables: at the start of a line, take the rest of the line (cut at a field word)
        const lineStart = t.lastIndexOf("\n", start - 1) + 1;
        if (re === res[0] && !t.slice(lineStart, start).trim()) {
          const cut = rest.search(STOP);
          // the title is the first token; the name after it is capped like any other name
          const title = /^\S+/.exec(val)[0];
          const after = (cut < 0 ? rest : rest.slice(0, cut)).slice(title.length);
          val = (title + capName(after, 3)).replace(/[\s,;:.\-–(]+$/u, "");
        }
        out.push({ start, end: start + val.length });
      }
    }
    return out;
  }
  // a line that is only a person's name: 2-4 Thai or Latin name-like tokens, no digits, no label vocabulary
  const LABEL_TH = new RegExp("^(?:ชื่อ|คนไข้|นามสกุล|สกุล|ที่อยู่|ยา|ครีม|เม็ด|แคปซูล|ผลิตภัณฑ์|อาหาร|เสริม|วิตามิน|สูตร|ขนาด|บรรจุ|ส่วนประกอบ|วิธี|คำ|เก็บ|ลด|แก้|บำรุง|สมุนไพร|ชนิด|น้ำ|ผง|" +
    "ตรา|รส|กลิ่น|สำหรับ|ใช้|ห้าม|ควร|ปริมาณ|เลข|ทะเบียน|ผลิต|จำหน่าย|นำเข้า|บริษัท|ข้อ|ทา|หยอด|ดม|อม|ชง|ละลาย|เครื่อง|นม|ชา|กาแฟ|ขนม|โลชั่น|สบู่|เจล|" +
    "สเปรย์|ฉลาก|เภสัช|แพทย์|โรค|อาการ|ก่อน|หลัง|วัน|ครั้ง|ทุก|หมด|ผู้|เด็ก|ภาวะ|ออก|ฤทธิ์|แผน|ไทย|โบราณ|ธาตุ|หอม|แดง|ขาว|เขียว|เหลือง|ดำ|ชมพู|" +
    "ร้าน|โรงพยาบาล|คลินิก|สถาน|ศูนย์|รพ|ปวด|ไข้|ไอ|เจ็บ|ท้อง|ผิว|ผม|หน้า|ตา|หู|จมูก|ปาก|ฟัน|คอ|แผล|ผื่น|คัน|แพ้|ระบาย|ถ่าย|นอน|ช่วย|เพื่อ|และ|หรือ|ที่|ใน|" +
    "แคลเซียม|วิตามิน|พลัส|คอลลาเจน|โปรตีน|ซิงค์|ไฟเบอร์|โกลด์|ฟอร์ท|ฟอร์ต|เอ็กซ์ตร้า|แม็กซ์|มิกซ์|ไลท์|คิดส์|เบบี้|เดย์|ไนท์|ออยล์|เฮิร์บ|บาล์ม|แชมพู|เซรั่ม|ซุป|ซอส)", "u");
  const LABEL_EN = new RegExp("^(?:drug|facts|active|inactive|ingredients?|uses?|warnings?|directions|purpose|other|information|keep|store|read|take|apply|for|use|" +
    "only|adults?|children|each|daily|dose|dosage|net|lot|batch|exp|made|in|of|and|the|with|without|free|sugar|extra|strength|fast|relief|pain|cold|flu|" +
    "allergy|night|day|plus|forte|max|ultra|gold|new|best|before|after|meals?|food|water|shake|well|do|not|ask|doctor|pharmacist|see|insert|box|pack|" +
    "pharmacy|hospital|clinic|medical|centre|center|customer|service|imported|distributed|manufactured|by|contains|per|serving|size|dietary|herbal|" +
    "skin|hair|face|body|hand|foot|eye|ear|nose|mouth|throat|chest|back|joint|muscle|bone|sleep|energy|immune|digestive|kids?|baby|women|men)$", "iu");
  // label / instruction wording ANYWHERE on a line (OCR splits one sentence into name-like pieces: "อ่านฉลากและเอก สาร กำกับ
  // ก่อนใช้ ทุกครั้ง"). None of these stands inside a Thai personal name.
  const LABEL_ANY_TH = new RegExp("ฉลาก|เอกสาร|กำกับ|ก่อนใช้|หลังใช้|ทุกครั้ง|รับประทาน|บริโภค|อุณหภูมิ|ส่วนประกอบ|ส่วนผสม|คำเตือน|วิธีใช้|สรรพคุณ|ผลิต|จำหน่าย|มาตรฐาน|" +
    "สินค้า|ข้อมูล|หมดอายุ|ปริมาณ|สุทธิ|บรรจุ|แสงแดด|ที่แห้ง|เวลาทำการ|ปรึกษา|อาการ|บรรเทา", "u");
  /** @param {string} line */
  function nameLine(line) {
    const l = line.trim();
    if (!l || /\d/.test(l) || PRODUCT_WORDS_EN.test(l) || PRODUCT_WORDS_TH.test(l) || LABEL_ANY_TH.test(l.replace(/\s+/g, ""))) return false;
    const w = l.split(/[ \t]+/);
    if (w.length < 2 || w.length > 4) return false;
    if (w.every(x => new RegExp(`^${THN}$`, "u").test(x) && x.length <= 20 && !LABEL_TH.test(x))) return true;
    return w.every(x => new RegExp(`^${ENN}$`, "u").test(x) && !LABEL_EN.test(x));
  }
  // a line that is only a Japanese / Korean person name (used on DISPENSING labels only: "국진솔 (여)", "藤井 悠"); stream F
  const CJK_NAME_LINE = new RegExp(`^[ \\t]*(?:${KO_SUR}[가-힣]{1,2}|[一-鿿]{1,3}[ \\t\\u3000][一-鿿]{1,3}|[ァ-ヺー]{2,6}[ \\t\\u3000][ァ-ヺー]{2,6})` +
    "(?:[ \\t]*[(（](?:남|여|男|女|M|F)[)）])?[ \\t]*$", "gmu");
  const CJK_NAME_NOT = /錠|散|液|包|薬|剤|用|分|回|日|後|前|朝|夜|内服|外用|頓服|정|캡슐|시럽|연고|약|회|일|분|식후|식전|아침|저녁|복용/u;
  /** @param {string} t */
  function cjkNameLines(t) {
    /** @type {{start: number, end: number}[]} */ const out = [];
    for (const m of t.matchAll(CJK_NAME_LINE)) {
      const v = m[0].trim().replace(/[ \t]*[(（].*$/u, "");
      if (CJK_NAME_NOT.test(v)) continue;
      const start = /** @type {number} */ (m.index) + m[0].indexOf(v);
      out.push({ start, end: start + v.length });
    }
    return out;
  }
  /** Start / end of every standalone name-like line. @param {string} t */
  function nameLines(t) {
    /** @type {{start: number, end: number}[]} */ const out = [];
    let at = 0;
    for (const line of t.split("\n")) {
      if (nameLine(line)) { const lead = line.length - line.trimStart().length; out.push({ start: at + lead, end: at + line.trimEnd().length }); }
      at += line.length + 1;
    }
    return out;
  }
  // where a name ends: a question word, a product / drug word, a Latin drug-like token after a Thai name, 4 tokens at most
  const QUESTION = new RegExp([
    "^(?:ถาม|สอบถาม|ขอ|ต้องการ|อยาก|ไหม|มั้ย|อะไร|อย่างไร|ยังไง|เท่าไร|เท่าไหร่|ไหน|ทำไม|ควร|ใช้|กิน|ทาน|เรื่อง|what|how|why|",
    "when|which|where|can|could|does|do|is|are|should|asks?|about|re:?)"
  ].join(""), "iu");
  const DRUG_LIKE = new RegExp([
    "(?:artan|pril|olol|statin|azole|cillin|mycin|oxacin|dipine|pine|prazole|formin|profen|fen|mol|done|pam|lam|tine|sone|",
    "olone|mab|nib|vir|zine|tidine|cycline|gliptin|flozin|parin|azepam|triptan|caine|dronate|lukast|setron|sartan)$"
  ].join(""), "i");
  /** @param {string} v text after a cue @param {number} [max] tokens */
  function capName(v, max = 4) {
    const parts = v.split(/([ \t]+)/);
    let out = "", n = 0, thai = null;
    for (let i = 0; i < parts.length; i += 2) {
      const w = parts[i];
      if (!w) { out += parts[i + 1] || ""; continue; }
      if (thai === null) thai = /[ก-๙]/.test(w);
      const latin = /^[A-Za-z][A-Za-z'\-.]*$/.test(w);
      if (n >= 1 && (QUESTION.test(w) || PRODUCT_WORDS_EN.test(w) || PRODUCT_WORDS_TH.test(w) || (w.length > 3 && LABEL_TH.test(w)) || (latin && DRUG_LIKE.test(w)) ||
        (thai && latin) || (thai && /^[A-Z]{4,}$/.test(w)))) break;
      // a short Thai syllable (a name spaced syllable by syllable) counts as half a token
      // (and a name spaced character by character in Japanese / Korean OCR: "ハ ヤ シ ダ ケシ", "中 島 明"; stream F)
      const cost = /^[ก-๙]{1,3}$/.test(w) ? 0.5 : /^[ぁ-ヿ一-鿿가-힯]{1,2}$/u.test(w) ? 0.4 : 1;
      if (n + cost > max) break;
      out += w + (parts[i + 1] || "");
      n += cost;
    }
    return out;
  }
  /**
   * POSSIBLE names left in a text (for the preview: highlighted, never removed). Two or three Capitalised Latin words that
   * are not label or product words; a Thai word pair starting like a common first name; two or three CJK characters with
   * 先生 / 女士 or alone on a line. Spans that are already the placeholder are skipped.
   * @param {any} input
   */
  function possibleNames(input) {
    const t = fold(String(input == null ? "" : input));
    /** @type {{start: number, end: number}[]} */ const out = [];
    const push = (/** @type {number} */ a, /** @type {number} */ b) => { if (!out.some(o => a < o.end && o.start < b)) out.push({ start: a, end: b }); };
    for (const m of t.matchAll(new RegExp(`\\b${ENN}(?:[ \\t]+${ENN}){1,2}\\b`, "gu"))) {
      const w = m[0].split(/[ \t]+/);
      if (w.some(x => LABEL_EN.test(x) || PRODUCT_WORDS_EN.test(x) || DRUG_LIKE.test(x) || /^(?:Mr|Mrs|Ms|Miss|Dr|Khun)$/.test(x))) continue;
      push(/** @type {number} */ (m.index), /** @type {number} */ (m.index) + m[0].length);
    }
    const FIRST = "(?:สม|ศรี|สุ|ประ|วิ|ธน|กิต|อรุณ|มาลี|บุญ|ชัย|พร|ทอง|แก้ว|จันท|นิ|วรร|ปรา|อน|รัต|เพ็ญ|ณัฐ|ธีร|พิม|กมล|อัญ|ปิย|จิร|ศุภ|วี|ชนา|นพ|กาญ|ลล|ภู|ปัณ|ธิดา|อม|เกศ|สาย)";
    for (const m of t.matchAll(new RegExp(`(?:^|(?<=[\\s:：(]))(${FIRST}[ก-ฺเ-๎]{1,12})[ \\t]+([ก-ฺเ-๎]{3,20})(?=$|[\\s,.)])`, "gmu"))) {
      if (LABEL_TH.test(m[1]) || LABEL_TH.test(m[2]) || PRODUCT_WORDS_TH.test(m[0])) continue;
      push(/** @type {number} */ (m.index) + m[0].indexOf(m[1]), /** @type {number} */ (m.index) + m[0].length);
    }
    for (const m of t.matchAll(/[一-鿿]{2,3}(?:先生|女士|小姐)|^[ \t]*[一-鿿]{2,3}[ \t]*$/gmu)) {
      const v = m[0].trim();
      if (/期|孕|人群|适|片|粒|胶囊|颗粒|口服|外用|保存|用法|用量|成分|功效|规格|批号|日期|有效|注意|禁忌|说明|生产|制造|地址|电话/.test(v)) continue;
      const a = /** @type {number} */ (m.index) + m[0].indexOf(v);
      push(a, a + v.length);
    }
    return out.filter(o => !t.slice(o.start, o.end).includes(PLACEHOLDER)).sort((a, b) => a.start - b.start);
  }
  // A maker-printed RESPONSIBLE PERSON line on a pack (Thai drug law: เภสัชกรผู้มีหน้าที่ปฏิบัติการ / ผู้รับอนุญาต; Taiwan: 監製藥師 /
  // 管理藥師; "Pharmacist in charge"). It names staff of the maker, not a patient, so it is no dispensing sign, but ONLY when a
  // company / manufacturer block stands within three lines and the line carries no patient word. The name is still removed
  // from the text (CUES / honorificNames) and still blocks the photo.
  const ROLE = new RegExp("เภสัชกรผู้มีหน้าที่ปฏิบัติการ|ผู้มีหน้าที่ปฏิบัติการ|ผู้รับอนุญาต|ผู้ดำเนินกิจการ|เภสัชกรผู้ควบคุม|ผู้ควบคุมการผลิต|[監监][製制][藥药][師师]|管理[藥药][師师]|[駐驻][廠厂][藥药][師师]|" +
    "\\bPharmacist[- ]in[- ]charge\\b|\\bResponsible\\s+pharmacist\\b|\\bQualified\\s+person\\b", "iu");
  const PATIENT_WORD = /ผู้ป่วย|คนไข้|ผู้รับยา|ผู้รับบริการ|\bPatient\b|\bPt\b|患者|病人|姓名|就[诊診]/iu;
  /** The text with every maker-printed responsible-person line blanked (same length). @param {string} t folded text */
  function withoutMakerRoles(t) {
    if (!ROLE.test(t)) return t;
    const lines = t.split("\n");
    return lines.map((line, i) => (ROLE.test(line) && !PATIENT_WORD.test(line) &&
      COMPANY.test(lines.slice(Math.max(0, i - 3), i + 4).join("\n")) ? " ".repeat(line.length) : line)).join("\n");
  }
  // what only a PACK prints (a pharmacy's dispensing label does not): barcode, registration, ingredients, nutrition panel,
  // net quantity, maker block, product category. Storage, warnings, expiry and directions also stand on dispensing labels.
  const PACK_ONLY = ["barcode", "reg", "ingredients", "nutrition", "net", "maker", "category"];
  /** Three or more pack-only cue types (the registration word and its number count once). @param {string} t */
  function packStructure(t) {
    const ev = labelCues(t, undefined).ev;
    return PACK_ONLY.filter(k => ev.has(k) || (k === "reg" && ev.has("regword"))).length >= 3;
  }
  /** @param {any} input */
  function isDispensingLabel(input) {
    const t0 = fold(String(input == null ? "" : input));
    if (HEADER.test(t0) || ROC.test(t0) || twIds(t0).length > 0) return true;
    const t = withoutMakerRoles(t0);
    if (STRONG.test(t)) return true;
    // dosing text + a person: an honorific name, or a line that is only a name (a bare-name dispensing label)
    if (!USAGE.test(t)) return false;
    // a title + one name counts only when it is the whole line ("Mrs Jane" on its own, not "recommended by Dr. Sample ...")
    const line = (/** @type {{start: number, end: number}} */ h) => {
      const ls = t.lastIndexOf("\n", h.start - 1) + 1, le = t.indexOf("\n", h.end) < 0 ? t.length : t.indexOf("\n", h.end);
      return !t.slice(ls, h.start).trim() && !t.slice(h.end, le).trim();
    };
    if (honorificNames(t, false).length > 0 || honorificNames(t, true).some(line)) return true;
    // a bare name-like line is the weakest sign (a slogan line reads like one: "ข้าวใหม่ต้นฤดู คัดพิเศษ"): it does not count on
    // a text with the structure of a pack
    return nameLines(t).length > 0 && !packStructure(t0);
  }

  /* ---------------- other identifiers ---------------- */
  const TH_MONTH = "(?:ม\\.?ค\\.?|ก\\.?พ\\.?|มี\\.?ค\\.?|เม\\.?ย\\.?|พ\\.?ค\\.?|มิ\\.?ย\\.?|ก\\.?ค\\.?|ส\\.?ค\\.?|ก\\.?ย\\.?|ต\\.?ค\\.?|พ\\.?ย\\.?|ธ\\.?ค\\.?|" +
    "มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)";
  const EN_MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
  const DATE = `(?:\\d{1,4}\\s?[/.\\-]\\s?\\d{1,2}\\s?[/.\\-]\\s?\\d{1,4}|\\d{1,2}\\s*${TH_MONTH}\\s*(?:พ\\.ศ\\.\\s*)?\\d{2,4}|\\d{1,2}\\s+${EN_MONTH},?\\s+\\d{2,4}|` +
    `${EN_MONTH}\\s+\\d{1,2},?\\s+\\d{2,4}|\\d{2,4}\\s*年\\s*\\d{1,2}\\s*月(?:\\s*\\d{1,2}\\s*日)?|` +
    // Japanese era years (昭和45年3月2日, 平成2年, S45.3.2, H2/5/6) and Korean 1970년 1월 2일 (stream F, 2026-11-13)
    `(?:明治|大正|昭和|平成|令和)\\s*(?:\\d{1,2}|元)\\s*年\\s*\\d{1,2}\\s*月(?:\\s*\\d{1,2}\\s*日)?|[MTSHR]\\s?\\d{1,2}\\s?[/.\\-]\\s?\\d{1,2}\\s?[/.\\-]\\s?\\d{1,2}|` +
    `\\d{2,4}\\s*년\\s*\\d{1,2}\\s*월(?:\\s*\\d{1,2}\\s*일)?)`;
  const DOB_RE = new RegExp(`(?:ว\\s?/\\s?ด\\s?/\\s?ป\\.?\\s*เกิด|ว\\.ด\\.ป\\.\\s*เกิด|วัน\\s?/\\s?เดือน\\s?/\\s?ปี\\s?เกิด|วันเดือนปีเกิด|วันเกิด|เกิด(?:วันที่)?|` +
    `\\bD\\.?O\\.?B\\.?|\\bDate\\s+of\\s+birth|\\bBirth\\s*date|\\bBorn(?:\\s+on)?|出生日期|出生|生日|생\\s?년\\s?월\\s?일|생일|生年月日)\\s*[:：.\\-–]?\\s*(${DATE})`, "giu");
  // a date followed by "born" (昭和44年7月7日生, 1975年10月8日生まれ, 1970년생), stream F
  const DOB_AFTER = new RegExp(`(${DATE})\\s*(?:生まれ|生(?![産活薬])|년생|생(?![산활]))`, "gu");

  /** @type {Array<{kind: string, re: RegExp, group?: number}>} */
  const RULES = [
    // HN also in lower case, and with OCR letter O for zero inside the digit run (at least two real digits)
    // HN / H.N. / Hosp. No / MRN (any case), digits possibly spaced one by one, OCR letter O for zero (two real digits at least)
    { kind: "hn", group: 1, re: new RegExp("(?:\\bH\\.?\\s?N\\.?|\\b[Hh][Nn]|\\bAN|\\bVN|\\bMRN|\\bHosp(?:ital)?\\.?\\s*No\\.?|\\bOPD\\s*No\\.?)(?![A-Za-z])[\\s:：.#]*" +
      "(\\d(?: \\d){3,12}(?! ?\\d)|(?=[\\dOo\\-/]*\\d[\\dOo\\-/]*\\d)[A-Z]?[\\dOo][\\dOo\\-/]{2,14}[\\dOo]|\\d{3,})", "gu") },
    { kind: "hn", group: 1, re: /(?:เลขที่ผู้ป่วย|เลขประจำตัวผู้ป่วย)[\s:：]*([A-Z0-9][A-Z0-9\-/]{2,15})/gu },
    { kind: "hn", group: 1, re: /(?:门诊号|病历号码?|病歷號碼?|病歷號|住院号|住院號|領藥號|病人编号|MRN\/病歷號碼)[\s:：]*([A-Z0-9][A-Z0-9-]{2,15})/gu },
    // Korean resident registration number (YYMMDD-Gxxxxxx), 2026-11-12
    { kind: "id", re: /(?<![\d-])\d{6}\s?-\s?[1-8]\s?\d{6}(?![\d-])/gu },
    // Korean registration / chart / patient numbers (OCR may split the syllables), 2026-11-12
    { kind: "hn", group: 1, re: /(?:등\s?록\s?번\s?호|환\s?자\s?번\s?호|차\s?트\s?번\s?호|병\s?록\s?번\s?호)[\s:：]*([A-Z0-9][A-Z0-9-]{2,15})/gu },
    { kind: "id", re: /(?<![\d-])\d[- ]\d{4}[- ]\d{5}[- ]\d{2}[- ]\d(?![\d-])/gu },
    // Japanese patient / chart / card / insurance numbers and the My Number (個人番号, 12 digits), Korean visit / card numbers (stream F)
    { kind: "hn", group: 1, re: new RegExp("(?:患者\\s?(?:ID|番号|No\\.?)|診察券\\s?(?:番号|No\\.?)|カルテ\\s?(?:番号|No\\.?|ID)|受付番号|被保険者\\s?番号|保険者\\s?番号|保険証\\s?番号|" +
      "記号\\s?・?\\s?番号|ID\\s?番号|受給者\\s?番号|受給者証\\s?番号|母子健康手帳\\s?番号|社員\\s?番号|会員\\s?番号|学籍\\s?番号|" +
      "진\\s?료\\s?번\\s?호|접\\s?수\\s?번\\s?호|수\\s?진\\s?자\\s?번\\s?호|보\\s?험\\s?증\\s?번\\s?호|증\\s?번\\s?호|카\\s?드\\s?번\\s?호|회\\s?원\\s?번\\s?호|" +
      "가\\s?입\\s?자\\s?번\\s?호|고\\s?객\\s?번\\s?호|증\\s?권\\s?번\\s?호|사\\s?번|학\\s?번|주\\s?민\\s?번\\s?호|여\\s?권\\s?번\\s?호|외\\s?국\\s?인\\s?등\\s?록\\s?번\\s?호)" +
      "[\\s:：#]*([A-Z0-9ぁ-ゖ][A-Z0-9・\\-]{1,15}(?:[ ][0-9]{6})?)", "giu") },
    // Japanese insurance card: 記号 12-345 番号 678 (both parts), a bare patient ID ("ID A0027316")
    { kind: "id", group: 1, re: /記号[\s:：]*([0-9A-Zぁ-ゖ][0-9A-Z・\-]{0,12})/gu },
    { kind: "id", group: 1, re: /記号[^\n]{1,20}?(?<!製造|承認|許可|届出|登録|認証|管理|品|型式)番号[\s:：]*([0-9A-Z][0-9A-Z\-]{0,12})/gu },
    { kind: "hn", group: 1, re: /(?<!(?:Product|Item|Batch|Lot|Device|Model|UDI|Ref)[\s.]?)\bID\s?(?:No\.?|#)?[\s:：#]+([A-Z]{0,2}\d[\dA-Z\-]{3,15})\b/gu },
    { kind: "id", group: 1, re: /(?:個人番号|マイナンバー)[\s:：]*(\d{4}[\s-]?\d{4}[\s-]?\d{4})(?!\d)/gu },
    { kind: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu },
    { kind: "id", group: 1, re: /(?:\bPassport(?:\s*(?:No\.?|number|#))?|หนังสือเดินทาง(?:เลขที่)?|护照(?:号码?)?|パスポート)\s*[:：.#]?\s*([A-Z]{1,2}\d{6,9}|\d{7,9})\b/giu },
    { kind: "dob", group: 1, re: DOB_RE },
    { kind: "dob", group: 1, re: DOB_AFTER }
  ];
  const ID_KEY = /(เลขประจำตัวประชาชน|บัตรประชาชน|ปชช\.?|เลขบัตร|เลขประจำตัว|\bID\s*(?:card|no\.?|number)?|身份证(?:号码?)?)[^\n\d]{0,30}$/iu;
  /** Chinese resident ID: 17 digits + check (ISO 7064 MOD 11-2; X = 10). @param {string} d */
  function cnIdOk(d) {
    const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    let sum = 0;
    for (let i = 0; i < 17; i++) sum += Number(d[i]) * w[i];
    return "10X98765432"[sum % 11] === d[17].toUpperCase();
  }
  /** Hong Kong ID: 1-2 letters, 6 digits, check digit (0-9 or A). @param {string} letters @param {string} digits @param {string} ck */
  function hkIdOk(letters, digits, ck) {
    const L = letters.toUpperCase(), vals = (L.length === 1 ? [36, L.charCodeAt(0) - 55] : [L.charCodeAt(0) - 55, L.charCodeAt(1) - 55]).concat([...digits].map(Number));
    let sum = 0;
    vals.forEach((v, i) => { sum += v * (9 - i); });
    const c = (11 - (sum % 11)) % 11;
    return (c === 10 ? "A" : String(c)) === ck.toUpperCase();
  }
  /** Taiwan national ID: a letter (area), 1 or 2, 7 digits and a check digit. @param {string} id */
  function twIdOk(id) {
    const m = /^([A-Z])([12]\d{8})$/.exec(String(id || "").toUpperCase());
    if (!m) return false;
    const a = "ABCDEFGHJKLMNPQRSTUVXYWZIO".indexOf(m[1]) + 10;
    let sum = Math.floor(a / 10) + (a % 10) * 9 + Number(m[2][8]);
    for (let i = 0; i < 8; i++) sum += Number(m[2][i]) * (8 - i);
    return sum % 10 === 0;
  }
  /** Valid Taiwan IDs in a (folded) text. @param {string} t @returns {{start: number, end: number}[]} */
  function twIds(t) {
    /** @type {{start: number, end: number}[]} */ const out = [];
    for (const m of t.matchAll(/(?<![A-Za-z0-9])[A-Z][12]\d{8}(?![A-Za-z0-9])/gu)) {
      const at = /** @type {number} */ (m.index);
      if (twIdOk(m[0])) out.push({ start: at, end: at + 10 });
    }
    return out;
  }
  /** GTIN-8 / 12 / 13 / 14 check digit (the same sum for every length). @param {string} d */
  function gtinOk(d) {
    if (!/^(?:\d{8}|\d{12,14})$/.test(d)) return false;
    let x = 0;
    for (let i = d.length - 2, w = 3; i >= 0; i--, w = 4 - w) x += Number(d[i]) * w;
    return (10 - (x % 10)) % 10 === Number(d[d.length - 1]);
  }
  /** EAN-13 / GTIN-13 check digit. @param {string} d 13 digits */
  function eanOk(d) {
    let x = 0;
    for (let i = 0; i < 12; i++) x += Number(d[i]) * (i % 2 ? 3 : 1);
    return (10 - (x % 10)) % 10 === Number(d[12]);
  }
  /** @param {string} d 13 digits */
  function thaiIdOk(d) {
    let s = 0;
    for (let i = 0; i < 12; i++) s += Number(d[i]) * (13 - i);
    return (11 - (s % 11)) % 10 === Number(d[12]);
  }
  // a run of digit groups on ONE line, joined by one space, dash or dot (brackets allowed), with an optional +66 / +86
  const PHONE_RUN = /(?<![\w\-/+])(?:\+\s?(?:66|86)\s?(?:\(0\))?[ \-.]?)?\(?\d{1,11}\)?(?:[ \t\-.]\(?\d{1,11}\)?)*(?![\w\-/])/gu;
  const GROUP = /(?:\+\s?(?:66|86)\s?(?:\(0\))?[ \-.]?)?\(?\d+\)?/gu;
  /** @param {string} s */
  function phoneOk(s) {
    const intl = /^\+\s?(66|86)/.exec(s);
    let d = s.replace(/^\+\s?(?:66|86)\s?(?:\(0\))?/, "").replace(/\D/g, "");
    if (intl && intl[1] === "86") return /^1[3-9]\d{9}$/.test(d);
    if (intl) d = "0" + d.replace(/^0/, "");
    if (/^0[689]\d{8}$/.test(d) || /^0[2-7]\d{7}$/.test(d)) return true;
    if (/^1[ \-.]?8\d\d[ \-.]/.test(s)) return false; // 1-800 / 1-8xx toll-free call-centre numbers are not personal
    // Japanese / Korean phones written in groups (stream F, 2026-11-13): mobiles 0[789]0-xxxx-xxxx, 01x-xxx(x)-xxxx; landlines
    // 0x(x)-xxx(x)-xxxx of 9-10 digits. Toll-free / shared-cost numbers (0120, 0800, 0570, Korean 080-xxx-xxxx) are not personal.
    // Only the printed phone shape counts: 0xx(x) - xxx(x) - xxxx in three groups (a damaged Thai food number "0-11235-5-0099" is not one).
    if (!intl && /^\(?0\d{1,4}\)?[ \-]\d{2,4}[ \-]\d{3,4}$/.test(s) && !/^(?:0120|0800|0570|0990)/.test(d) && !/^080\d{7}$/.test(d)) {
      if (/^0[789]0\d{8}$/.test(d) || /^01[016789]\d{7,8}$/.test(d) || /^0[1-9]\d{7,9}$/.test(d)) return true;
    }
    return !intl && /^1[3-9]\d{9}$/.test(d) && /[ \-]/.test(s); // Chinese mobile: grouped
  }
  /** Phones inside one run: the longest valid stretch of whole groups; a stretch may start or end inside the run only at a
   *  SPACE (so "13-2-06463-5-0326" or "NDC 0573-0150-20" are never cut into a phone-shaped piece). @param {string} run */
  function phonesIn(run) {
    const g = [...run.matchAll(GROUP)].map(m => ({ s: /** @type {number} */ (m.index), e: /** @type {number} */ (m.index) + m[0].length }));
    /** @type {{s: number, e: number}[]} */ const out = [];
    let i = 0;
    while (i < g.length) {
      let best = -1;
      if (i === 0 || /\s/.test(run.slice(g[i - 1].e, g[i].s))) {
        for (let j = g.length - 1; j >= i; j--) {
          if (j < g.length - 1 && !/\s/.test(run.slice(g[j].e, g[j + 1].s))) continue;
          if (phoneOk(run.slice(g[i].s, g[j].e))) { best = j; break; }
        }
      }
      if (best >= 0) { out.push({ s: g[i].s, e: g[best].e }); i = best + 1; } else i++;
    }
    return out;
  }
  const ADDRESS = new RegExp([
    "บ้านเลขที่|เลขที่\\s?\\d+(?:/\\d+)?|หมู่(?:ที่)?\\s?\\d|ม\\.\\s?\\d|ซอย|ซ\\.\\s?[ก-๙\\d]|ถนน|ถ\\.\\s?[ก-๙]|ตำบล|ต\\.\\s?[ก-๙]|แขวง|อำเภอ|อ\\.\\s?[ก-๙]|เขต[ก-๙]|จังหวัด|จ\\.\\s?[ก-๙]|",
    "(?<!\\d)\\d{5}(?!\\d)(?=\\s*$)|\\b(?:Room|Rm\\.?|Floor|Fl\\.|Road|Rd\\.?|Street|St\\.|Soi|Moo|District|Province|Apt\\.?|Unit)\\b[^\\n]*\\d|",
      "\\d[^\\n]*\\b(?:Road|Rd\\.?|Street|St\\.|Soi|Moo)\\b|",
    "[省市区县][^\\n]{0,15}[路街道巷][^\\n]{0,10}号|",
    // Japanese (〒, 都道府県 + 市区町村 + 1-2-3, 丁目 / 番地) and Korean (시 / 도 + 구 / 군 + 로 / 길 number) addresses (stream F, 2026-11-13)
    "〒\\s?\\d{3}-\\d{4}|[都道府県][^\\n]{0,12}[市区町村郡][^\\n]{0,20}(?:\\d+(?:[-－]\\d+){1,2}|丁目|番地)|",
    "[가-힣]{1,6}(?:시|도)\\s[가-힣]{1,5}(?:구|군|시)\\s[^\\n]{0,20}(?:로|길)\\s?\\d"
  ].join(""), "iu");
  const COMPANY = new RegExp([
    "ผลิตโดย|ผลิตและจำหน่าย|จำหน่ายโดย|นำเข้าโดย|นำเข้าและจัดจำหน่าย|ผู้ผลิต|ผู้จัดจำหน่าย|ผู้นำเข้า|บริษัท|บจก\\.|",
    "ห้างหุ้นส่วน|หจก\\.|\\bManufactured\\s+(?:by|for)\\b|\\bDistributed\\s+by\\b|\\bImported\\s+by\\b|\\bMarketed\\s+by\\b|\\bMade\\s+by\\b|",
    "\\bCo\\.?,?\\s*Ltd\\b|\\bLtd\\.?\\b|\\bLimited\\b|\\bInc\\.?\\b|\\bCorp(?:oration)?\\b|\\bSdn\\.?\\s*Bhd\\b|\\bPte\\b|\\bGmbH\\b|\\bLLC\\b|制造商|",
    "生产企业|生产商|经销商|委托方|受托方|有限公司|株式会社|\\bCustomer\\s+(?:service|care)\\b|제조원|제조사|판매원|판매사|수입원|수입사|고객상담실|고객센터|\\(주\\)|주식회사|製造販売元|販売元|",
    "お客様相談室|\\bConsumer\\s+(?:care|hotline)\\b|ศูนย์บริการลูกค้า|ฝ่ายบริการลูกค้า"
  ].join(""), "iu");
  const COMPANY_NM = new RegExp(COMPANY.source.normalize("NFKC").replace(/[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/g, "") +
    "|โรงงาน|สานกงาน|สถานทผลต|ผลตท|แบงบรรจ|กลม|วสาหกจ|สหกรณ|ฟารม|\\bfactory\\b|\\bhead\\s*office\\b|\\bproduct\\s+of\\b|\\bmade\\s+in\\b|\\bma\\s+holder|www\\.|厂址|产地|製造|販売|藥商|제조|판매", "iu");
  const GENERIC_MAIL = /^(?:info|contact|service|services|cs|support|hello|sales|customer|customercare|care|enquir(?:y|ies)|admin|marketing|cc|callcenter|help|office|th|thailand)[._-]?[a-z0-9]*@/i;
  const PERSON_LINE = /ผู้ป่วย|คนไข้|ผู้รับยา|ชื่อ|Patient|Name|Pt\b|患者|病人|姓名|มือถือ|ญาติ|ผู้ติดต่อ|Emergency\s+contact|เบอร์ส่วนตัว|โทรศัพท์ผู้ป่วย/iu;
  // a maker / distributor / shop / contact block: company cues, an address, a website, a call centre (not a person)
  const CONTACT = new RegExp([
    "จัดจำหน่ายโดย|ผลิตที่|จำหน่ายที่|ร้าน|สาขา|สำนักงาน|โรงงาน|สอบถามข้อมูล|ติดต่อสอบถาม|ศูนย์บริการ|สายด่วน|คอลเซ็นเตอร์|บ้านเลขที่|เลขที่\\s?\\d|หมู่(?:ที่)?\\s?\\d|",
    "ซอย|ซ\\.\\s?\\S|ถนน|ถ\\.\\s?\\S|ตำบล|ต\\.\\s?\\S|แขวง|อำเภอ|อ\\.\\s?\\S|เขต|จังหวัด|จ\\.\\s?\\S|กรุงเทพ|รหัสไปรษณีย์|(?<![\\d\\-/])\\d{5}(?![\\d\\-/])|",
    "\\b(?:Road|Rd\\.|Street|St\\.|Soi|Moo|District|Sub-?district|Province|Floor|Fl\\.|Building|Bldg|Tower|Industrial|Estate|Park|Bangkok|Thailand|Malaysia|Singapore|",
    "Call\\s*cent(?:er|re)|Hotline|Contact\\s+us|Enquir(?:y|ies)|Shop|Store|Branch|Head\\s*office|Factory|Website)\\b|www\\.|https?://|\\.co\\.th\\b|\\.com\\b|",
    "[省市县区][^\\n]{0,12}[路街道巷]|客服|热线|地址|网址|服务电话|販売者|住所|주소|홈페이지"
  ].join(""), "iu");

  /* ---------------- Japanese / Korean names marked by a form of address (stream F, 2026-11-13) ---------------- */
  // Japanese: a kanji / katakana run (or a hiragana name of 2-8) before 様 / さま / さん / 殿 / くん / ちゃん, with an optional
  // given name; NOT a word for a group or a role (お客様, 皆様, 患者様, お子さま, 薬剤師さん, お母さん, たくさん, おかげさま) and not 様々 /
  // 様子 / 様式 / お客様相談室. Korean: a name-shaped word before 님 / 씨, not 고객님, 선생님, 환자분, 어머님, 호박씨, 날씨 ...
  const JA_TOK = "(?:[一-鿿々]{1,4}[ぁ-ゖ]{2,4}|[一-鿿々ァ-ヺー]{1,6}|[ぁ-ゖ]{2,8})"; // (kanji + hiragana: 近藤さくら)
  const JA_HON = new RegExp(`(${JA_TOK}(?:[ \\t\\u3000]${JA_TOK})?)[ \\t\\u3000]?(?:様|さま|さん|殿|くん|ちゃん)(?![々子式相方])`, "gu");
  const JA_NOT = new RegExp("^(?:客|皆|みな|みんな|患者|利用者|使用者|購入者|家族|子|子供|子ども|赤|あか|奥|神|王|仏|医者|医師|薬剤師|看護師|母|父|姉|兄|妹|弟|娘|息子|孫|先生|方|" +
    "妊婦|高齢者|小児|大人|女性|男性|会員|消費者|生産者|農家|職人|坊|嬢|姫|殿|お客|ご利用|ご購入|ご使用|たく|おかげ|お疲れ|おつかれ|ご苦労|ごくろう|お世話|おせわ|お互い|" +
    "ごちそう|おばあ|おじい|おかあ|おとう|おにい|おねえ|ばあ|じい|かあ|とう|にい|ねえ|みなさ|どなた|あなた|皆々|各位|ユーザー|ゲスト|メンバー|スタッフ|ドクター|ママ|パパ|" +
    "お嬢|お坊|お医者|歯医者|新人|主人|ご主人|奥さ|お得意|様|さま|ご本人|本人|担当者|責任者|代表者|保護者|ご家族|皆さ|お天道|お日|お月|仏さ|閻魔|恵比寿|大黒|" +
    "ペット|ワン|ネコ|猫|犬|苦労|疲れ|世話|馳走|陰|愁傷|屋|八百屋|近所|隣|大家|店員|日|月|旦那|主人|社長|部長|課長|上司|先輩|後輩|皆様|患者様|殿様|王子|王女|天使|鬼|" +
    "医療関係者|関係者|ご家族様|親御|お父|お母|お兄|お姉|お爺|お婆|叔父|叔母|伯父|伯母|彼|彼女|みなさま|みなさん|お客さま)$", "u");
  const KO_HON = new RegExp(`(?:^|(?<=[\\s:：(,]))(${KO_NAME}|[가-힣]{2,3})[ \\t]?(?:님|씨)(?=$|[\\s,.!~)?]|께|에게|한테|의|은|는|이|가|도|을|를)`, "gmu");
  const KO_NOT = new RegExp("^(?:고객|환자|회원|선생|사장|부모|어머|아버|할머|할아버|손|여러|주|하느|하나|부처|원장|약사|의사|간호사|대표|교수|형|누|언니|오빠|동생|" +
    "따|아드|사모|장모|장인|시어머|시아버|이모|고모|삼촌|외삼촌|당신|그분|이분|저분|우리|사용자|소비자|구매자|임|선배|후배|팀장|부장|과장|기사|아가|솜|글|날|말|" +
    "마음|맵|불|맘|사|발|목|눈|호박|수박|해바라기|포도|들깨|참깨|깨|아마|치아|대마|목화|겨자|살구|복숭아|매실|석류|씨앗|햄프|피마자|면실|홍화|올리브|아보카도|카카오|" +
    "커피|코코아|자몽|사과|딸기|레몬|오렌지|자두|대추|연|율무|은행|잣|볍|꽃|맏|아저|아주머|아줌|총각|아가|도련|서방|며느|사위|손자|손녀|할매|할배|조상|스승|목사|" +
    "신부|스님|원님|사또|임금|공주|왕자|님|씨|이웃|친구|가족|모든|각|여러분|팬|구독자|시청자|학부모|보호자|어르신|형제|자매|공급자|판매자|제조자)$", "u");
  // a kinship word, then a given name (母 ヒデコ, 祖母 ミツ, おじいちゃん(正雄), 長男 剛 / 할머니 복례, 손자 지훈, 엄마 정애한테); the name must be
  // spaced from the kinship word ("おばあちゃんの梅干し", "엄마손 왕만두" are brands) and end at a space, a particle or the line
  const JA_KIN = "(?:祖母|祖父|母|父|妻|夫|娘|息子|長男|長女|次男|次女|三男|三女|孫|まご|姉|兄|妹|弟|おばあちゃん|おじいちゃん|ばあば|じいじ|おばあさん|おじいさん|お母さん|お父さん|" +
    "ママ|パパ|叔母|叔父|伯母|伯父|家内|主人|嫁|婿)";
  const JA_KIN_RE = new RegExp(`(?:^|(?<=[\\s(（、。:：]))${JA_KIN}(?:[ \\t\\u3000]+|[ \\t\\u3000]*[(（][ \\t\\u3000]*)(?!${JA_KIN}(?:[ \\t\\u3000(（]|$))` +
    "([一-鿿々]{1,3}|[ァ-ヺー]{2,5}|(?![のはがにをともへで])[ぁ-ゖ]{2,4})(?=[ \\t\\u3000)）、。]|$|の|は|が|へ|に|より|用|から|と)", "gmu");
  const KO_KIN = "(?:할머니|할아버지|할매|할배|외할머니|외할아버지|엄마|아빠|어머니|아버지|어머님|아버님|큰아들|작은아들|막내아들|아들|큰딸|작은딸|막내딸|딸|막내|손자|손녀|" +
    "남편|아내|와이프|동생|언니|오빠|누나|형|삼촌|이모|고모|외삼촌|숙모|조카|며느리|사위|시어머니|시아버지|장모|장인)";
  const KO_KIN_RE = new RegExp(`(?:^|(?<=[\\s(:：,]))${KO_KIN}[ \\t]+(?!${KO_KIN}(?:[ \\t]|$))([가-힣]{2,3})` +
    "(?=[ \\t]*(?:$|[,.)!]|\\(|한테|에게|께|이[ \\t]|가[ \\t]|의|은|는|도|님|씨|생신|생일|올림|드림|퇴원|입원|약|병원|전화|용|것)|한테|에게|께)", "gmu");
  // a sender line: "현우 드림", "지훈 올림" / "そら より", "花子より"
  const KO_FROM = /(?:^|(?<=[\s(:：,]))([가-힣]{2,3})[ \t]+(?:드림|올림|씀)(?=[ \t]*(?:$|[.!]))/gmu;
  const JA_FROM = new RegExp("(?:^|(?<=[\\s(（、。]))([一-鿿々]{1,3}|[ァ-ヺー]{2,5}|[ぁ-ゖ]{2,4})[ \\t\\u3000]*より(?=[ \\t\\u3000]*(?:$|[。!！]))", "gmu");
  const FROM_NOT = /^(?:医師|薬剤師|店長|スタッフ|当店|弊社|会社|メーカー|病院|薬局|事務局|担当|本社|工場|これ|それ|以前|以上|成分|天然|食後|食前|우리|저희|회사|본사|약국|병원|직원|담당자)$/u;
  // Korean forms of address after a full name: 어르신, 어린이, 환자분 ("방치수 어르신", "이도윤어린이")
  const KO_HON2 = new RegExp(`(?:^|(?<=[\\s:：(,]))(${KO_SUR}[가-힣]{2})[ \\t]?(?:어르신|어린이|환자분|학생|군|양)(?=$|[\\s,.)]|께|에게|의|은|는|이|가)`, "gmu");
  /** @param {string} t folded text @returns {{start: number, end: number}[]} */
  function cjkHonorificNames(t) {
    /** @type {{start: number, end: number}[]} */ const out = [];
    const SP = /[ \t　]/;
    for (const m of t.matchAll(JA_HON)) {
      const val = m[1], toks = val.split(SP);
      if (JA_NOT.test(toks[toks.length - 1]) || JA_NOT.test(val.replace(/[ \t　]/g, ""))) continue;
      const start = /** @type {number} */ (m.index);
      out.push({ start, end: start + val.length });
    }
    for (const m of t.matchAll(KO_HON)) {
      const val = m[1];
      if (KO_NOT.test(val.replace(/[ \t]/g, "")) || KO_NOT.test(val.split(/[ \t]/)[0]) && val.length <= 2) continue;
      const start = /** @type {number} */ (m.index) + m[0].indexOf(val);
      out.push({ start, end: start + val.length });
    }
    for (const re of [JA_KIN_RE, KO_KIN_RE, KO_FROM, JA_FROM, KO_HON2]) {
      for (const m of t.matchAll(re)) {
        const val = m[1];
        if (FROM_NOT.test(val) || KO_NOT.test(val) || ((re === JA_FROM || re === JA_KIN_RE) && JA_NOT.test(val))) continue;
        const start = /** @type {number} */ (m.index) + m[0].lastIndexOf(val);
        out.push({ start, end: start + val.length });
      }
    }
    return out;
  }

  /** @param {any} input @returns {{kind: string, start: number, end: number, company?: boolean}[]} */
  function scanAll(input) {
    const raw = String(input == null ? "" : input);
    const t = fold(raw);
    const disp = isDispensingLabel(t);
    /** @type {{kind: string, start: number, end: number, company?: boolean}[]} */
    const hits = [];
    // 1. names after a field cue: greedily to the end of the line, cut at the next field word
    for (const c of CUES) {
      if (!c.always && !disp && !USAGE.test(t)) continue;
      c.re.lastIndex = 0;
      for (const m of t.matchAll(c.re)) {
        let at = /** @type {number} */ (m.index) + m[0].length;
        while (at < t.length && /[ \t:：.\-–]/.test(t[at])) at++;
        const eol = t.indexOf("\n", at) < 0 ? t.length : t.indexOf("\n", at);
        let val = t.slice(at, Math.min(eol, at + 80));
        const cut = val.search(STOP);
        if (cut >= 0) val = val.slice(0, cut);
        val = capName(val).replace(/[\s,;:.\-–(]+$/u, "");
        if (!val || !/[A-Za-zก-๙一-鿿가-힯ぁ-ヿ]/u.test(val) || val.startsWith(PLACEHOLDER)) continue;
        if (c.warnCheck && WARN_START.test(val)) continue;
        if (c.orgCheck && ORG_START.test(val)) continue;
        hits.push({ kind: "name", start: at, end: at + val.length });
      }
    }
    // 2. honorific names, on dispensing labels only
    for (const h of honorificNames(t, disp)) hits.push({ kind: "name", ...h });
    // 2a. Japanese / Korean names before a form of address (様 / さん / 님 / 씨 ...), on any text
    for (const h of cjkHonorificNames(t)) hits.push({ kind: "name", ...h });
    // 2b. on a dispensing label, a line that is only a name (no cue, no title) is removed too
    if (disp) for (const h of nameLines(t).concat(cjkNameLines(t))) hits.push({ kind: "name", ...h });
    // 3. numbers, e-mail, birth dates
    for (const r of RULES) {
      r.re.lastIndex = 0;
      for (const m of t.matchAll(r.re)) {
        const val = r.group ? m[r.group] : m[0];
        if (!val) continue;
        const start = /** @type {number} */ (m.index) + (r.group ? m[0].lastIndexOf(val) : 0);
        hits.push({ kind: r.kind, start, end: start + val.length });
      }
    }
    for (const m of t.matchAll(/(?<!\d)\d{13}(?!\d)/gu)) {
      const at = /** @type {number} */ (m.index);
      const ls = t.lastIndexOf("\n", at - 1) + 1, le = t.indexOf("\n", at) < 0 ? t.length : t.indexOf("\n", at);
      const alone = !t.slice(ls, at).trim() && !t.slice(at + 13, le).trim(); // a 13-digit Thai ID on a line of its own
      // after an ID cue the check digit does not matter (OCR or typing slips); alone on a line it must be valid
      // a barcode is never an ID: an EAN-13 with a valid check digit that starts with a Thai GS1 prefix (885) or stands next
      // to a barcode cue
      const before = t.slice(Math.max(0, at - 40), at);
      const barcode = eanOk(m[0]) && (/^885/.test(m[0]) || /(?:บาร์โค้ด|บาร์โค๊ด|barcode|bar\s*code|EAN|GTIN|GS1|UPC|\(01\)|条码|條碼)[^\n\d]{0,20}$/iu.test(before));
      if (barcode) continue;
      // a valid Korean (880) / Japanese (45, 49) EAN-13 on a Korean / Japanese label is a barcode (stream F), but ONLY when the
      // text has no Thai at all: a Thai ID with those first digits passes the EAN check about 1 time in 10 (independent review
      // 2026-11-13: "ยาแก้ไอ … 4500001662994 … パブロン" lost the ID), and a Thai text keeps the Thai-ID rule unchanged
      if (eanOk(m[0]) && !/[ก-๙]/u.test(t) && ((/^880/.test(m[0]) && /[가-힯]/u.test(t)) || (/^4[59]/.test(m[0]) && /[ぁ-ヿ]/u.test(t))) &&
        !ID_KEY.test(t.slice(Math.max(0, at - 60), at))) continue;
      if (ID_KEY.test(t.slice(Math.max(0, at - 60), at)) || (alone && thaiIdOk(m[0]) && /^[1-8]/.test(m[0]))) hits.push({ kind: "id", start: at, end: at + 13 });
    }
    for (const m of t.matchAll(/(?<![\dA-Za-z])\d{17}[\dXx](?![\dA-Za-z])/gu)) {
      const at = /** @type {number} */ (m.index);
      if (cnIdOk(m[0])) hits.push({ kind: "id", start: at, end: at + 18 });
    }
    for (const m of t.matchAll(/(?<![A-Za-z\d])([A-Z]{1,2})(\d{6})\s?\(([0-9A])\)/gu)) {
      const at = /** @type {number} */ (m.index);
      if (hkIdOk(m[1], m[2], m[3])) hits.push({ kind: "id", start: at, end: at + m[0].length });
    }
    for (const h of twIds(t)) hits.push({ kind: "id", ...h });
    // 18-digit Chinese mobile written without grouping: only next to a phone cue or in Chinese text
    for (const m of t.matchAll(/(?<![\d\-/+.])1[3-9]\d{9}(?![\d\-/])/gu)) {
      const at = /** @type {number} */ (m.index);
      if (/[一-鿿]/.test(t) || /(?:手机|电话|联系|Tel|Phone|Mobile|โทร|มือถือ)[^\n\d]{0,15}$/iu.test(t.slice(Math.max(0, at - 30), at))) hits.push({ kind: "phone", start: at, end: at + 11 });
    }
    const names = hits.filter(h => h.kind === "name");
    // 3b. an address line after a person cue / name (within 3 lines) or anywhere on a dispensing label; a maker address on
    //     an ordinary pack is kept
    {
      let at = 0;
      const lines = t.split("\n");
      lines.forEach((line, i) => {
        const ls = at;
        at += line.length + 1;
        if (!ADDRESS.test(line) || COMPANY.test(line)) return;
        const back = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
        const nearPerson = names.some(n => n.start >= ls - back.length + line.length && n.start < ls + line.length) ||
          /บ้านเลขที่|ที่อยู่ผู้ป่วย|ที่อยู่\s*[:：]|Address\s*[:：]|住址|家庭住址|住所(?:\s*[:：]|[ \t]+(?=\S))|주소(?:\s*[:：]|[ \t]+(?=\S))/iu.test(line) ||
          // Japanese / Korean slips put the address before the name: a person name in the two lines below, or a recipient cue above
          names.some(n => n.start >= ls && n.start < ls + lines.slice(i, i + 3).join("\n").length) ||
          /お届け先|ご依頼主|受取人|宛先|받는\s?(?:분|사람)|보내는\s?(?:분|사람)|수령인|수취인|배송지/u.test(lines.slice(Math.max(0, i - 3), i + 1).join("\n"));
        const maker = COMPANY.test(lines.slice(Math.max(0, i - 3), i).join("\n"));
        if (!(disp || nearPerson) || (maker && !disp)) return;
        const lead = line.length - line.trimStart().length;
        // keep a leading field word ("ที่อยู่:"), remove the rest of the line
        const m = /^(?:ที่อยู่(?:ผู้ป่วย)?|Address|住址|家庭住址|地址)\s*[:：]?\s*/iu.exec(line.slice(lead));
        const s0 = ls + lead + (m ? m[0].length : 0), e0 = ls + line.trimEnd().length;
        if (e0 > s0) hits.push({ kind: "address", start: s0, end: e0 });
      });
    }
    /** A maker / distributor / contact block around [at, at+len): this line and up to 4 lines above, no person in it. */
    const companyAt = (/** @type {number} */ at, /** @type {string} */ extra) => {
      const ls = t.lastIndexOf("\n", at - 1) + 1, le = t.indexOf("\n", at) < 0 ? t.length : t.indexOf("\n", at);
      let bs = ls;
      for (let k = 0; k < 4 && bs > 0; k++) bs = t.lastIndexOf("\n", bs - 2) + 1;
      const block = t.slice(bs, le), line = t.slice(ls, le);
      const person = PERSON_LINE.test(line) || names.some(n => n.start >= ls && n.start < le) || names.some(n => n.start >= bs && n.start < le && !COMPANY.test(t.slice(bs, n.start)));
      return !disp && !person && (COMPANY.test(block) || CONTACT.test(block) || (!!extra && GENERIC_MAIL.test(extra)));
    };
    for (const m of t.matchAll(PHONE_RUN)) for (const p of phonesIn(m[0])) {
      const at = /** @type {number} */ (m.index) + p.s, len = p.e - p.s;
      // a Japanese / Korean MOBILE (0[789]0-xxxx-xxxx, 01x-...) is a person's, even next to a maker block (stream F)
      const digits = t.slice(at, at + len).replace(/\D/g, "");
      const mobile = (/^0[789]0\d{8}$/.test(digits) && /[ぁ-ヿ]/u.test(t)) || (/^01[016789]\d{7,8}$/.test(digits) && /[가-힯]/u.test(t));
      hits.push({ kind: "phone", start: at, end: at + len, ...(!mobile && companyAt(at, "") ? { company: true } : {}) });
    }
    // maker / customer-service e-mails are kept like maker phones (owner decision 2026-11-10)
    for (const h of hits) if (h.kind === "email" && companyAt(h.start, t.slice(h.start, h.end))) h.company = true;
    hits.sort((a, b) => a.start - b.start || b.end - a.end);
    /** @type {{kind: string, start: number, end: number, company?: boolean}[]} */
    const out = [];
    for (const h of hits) {
      const last = out[out.length - 1];
      if (last && h.start <= last.end) { if (h.end > last.end) last.end = h.end; if (!h.company) delete last.company; continue; }
      out.push({ ...h });
    }
    return out;
  }
  /* ---------------- OCR provenance (owner decision 2026-11-10, option b) ---------------- */
  const ZW = /[\u200b-\u200d\u2060\ufeff\u00ad]/g;
  /** NFKC, Thai / full-width digits folded, zero-width removed, lower case. @param {any} x */
  const pnorm = x => fold(String(x == null ? "" : x).normalize("NFKC")).replace(ZW, "").toLowerCase();
  /** Levenshtein distance, stopping early above `max`. @param {string} a @param {string} b @param {number} max */
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  /**
   * Only text that came from the OCR of the label may be sent. Every whitespace token of `text` must be found in `ocr`
   * (after pnorm): as a substring of the OCR text (with or without its spaces: the user may delete or join), or within a
   * small edit distance of an OCR token (an OCR correction: 1 character for tokens of 4-7, 2 for 8 or more). A token that
   * holds a DIGIT must equal an OCR token exactly (leading / trailing punctuation aside): no substring, no tolerance. Tokens with
   * no letter or digit and the placeholder are always allowed. Everything else the user added is DROPPED, never sent.
   * @param {any} text what the preview box holds @param {any} ocr the original on-device OCR output of the label
   * @returns {{text: string, dropped: {start: number, end: number, text: string}[]}}
   */
  function provenance(text, ocr) {
    const t = String(text == null ? "" : text);
    const src = pnorm(ocr), flat = src.replace(/\s+/g, " "), nospace = src.replace(/\s+/g, "");
    const toks = [...new Set(flat.split(" ").filter(x => x.length >= 3))];
    const core = (/** @type {string} */ x) => x.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    const exact = new Set(flat.split(" ").map(core).filter(Boolean));
    const ph = pnorm(PLACEHOLDER);
    const ok = (/** @type {string} */ w) => {
      const n = pnorm(w).split(ph).join("");
      if (!n || !/[\p{L}\p{N}]/u.test(n)) return true;
      // a token with a digit (phone, ID, number) must be an OCR token EXACTLY: no substring, no edit tolerance
      // (typing 02-315-4422 next to a label's 02-315-4421 is dropped)
      if (/\p{N}/u.test(n)) return exact.has(core(n));
      if (flat.includes(n) || nospace.includes(n)) return true;
      if (n.length < 4) return false;
      const max = n.length >= 8 ? 2 : 1;
      return toks.some(o => lev(o, n, max) <= max);
    };
    /** @type {{start: number, end: number, text: string}[]} */ const dropped = [];
    let out = "", at = 0;
    for (const m of t.matchAll(/\S+/gu)) {
      const s0 = /** @type {number} */ (m.index);
      if (ok(m[0])) continue;
      dropped.push({ start: s0, end: s0 + m[0].length, text: m[0] });
      out += t.slice(at, s0);
      at = s0 + m[0].length;
    }
    out += t.slice(at);
    if (!dropped.length) return { text: t, dropped }; // nothing dropped: exactly what the user sees is sent
    // tidy the gaps a dropped token leaves (never joins two kept tokens)
    out = out.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return { text: out, dropped };
  }

  /* ---------------- product-label evidence (owner decision 2026-11-10, option 1) ---------------- */
  // AI is allowed for a capture only when the text (plus the barcode / registration facts the page already holds) shows
  // it IS a product label and shows NO sign of a personal document. Three views of the text: n = NFKC, digits folded,
  // lower case; nm = n without Thai vowel / tone marks (OCR drops them); sk = nm without any white space (OCR splits
  // Thai and CJK words). Latin cues run on n, Thai document cues on nm, Thai / CJK / kana / hangul label cues on sk.
  const TH_MARKS = /[ัิ-ฺ็-๎]/g;
  /** @param {string} s */
  const unmark = s => s.normalize("NFKC").replace(TH_MARKS, "");
  /** @param {string[]} parts regex source, Thai written with its marks */
  const dense = parts => new RegExp(unmark(parts.join("")), "u");
  /** @param {string[]} parts */
  const latin = parts => new RegExp(parts.join(""), "u");

  // STRONG: a registration-number SHAPE (the formats lensiq-pc.js parses) or a barcode with a valid check digit
  const REG_SHAPE = latin([
    "(?<![a-z0-9/])[12][a-f]\\s?\\d{1,4}\\s?/\\s?\\d{2}(?!\\d)|(?<![\\d-])\\d{2}-\\d-\\d{5}-\\d-\\d{4}(?![\\d-])|(?<![\\d-])\\d{2}-\\d-(?:\\d{10}|\\d{7})(?![\\d-])|",
    "(?<![\\d-])\\d{2}-\\d-\\d-\\d-\\d{7}(?![\\d-])|\\bmal\\s?\\d{8}\\s?[a-z]{0,3}\\b|\\bnot\\s?\\d{6,9}\\s?k\\b|\\bsin\\s?\\d{5}\\s?p\\b|\\b(?:din|npn)(?:-hm)?\\s*[:#]?\\s*\\d{8}(?!\\d)|",
    "\\bndc\\s*[:#]?\\s*(?:\\d{10,11}(?!\\d)|\\d{4,5}-\\d{3,4}-\\d{1,2}(?!\\d))|\\beu/\\d/\\d{2}/\\d{3,4}/\\d{3}\\b|\\baust\\s?[lr]\\s?\\d{4,6}\\b|\\bpl\\s?\\d{5}/\\d{4}\\b|",
    "\\bpom\\s+[a-z]{2}\\s?\\d{9}|\\bhk[cp]?-\\d{5}\\b|\\bsc\\d{14}\\b"
  ]);
  const REG_SHAPE_DENSE = dense([
    "国药准字[hzsjbtf]\\d{8}|国食健[注字]?[gj]\\d{8}|[卫衛]食健字[(（]?\\d{4}[)）]?第?\\d{3,4}[号號]|国妆特[进進]?字g?\\d{8}|[卫衛]妆[特备備]?[进進]?字|妆\\d{8}|",
    "衛[署部][^\\n]{1,6}字第\\d{4,7}號|ทะเบียน(?:ยา)?(?:เลข)?(?:ที่)?[gknh]\\d{1,4}/\\d{2,4}|\\(01\\)\\d{14}"
  ]);
  const BARCODE_CUE = /(?:barcode|bar\s*code|ean|gtin|upc|gs1|บาร์โค้ด|บาร์โค๊ด|条码|條碼|バーコード|바코드)[^\n\d]{0,12}(\d{8}|\d{12,14})(?!\d)/giu;
  // label cue TYPES. Two different types (or one strong cue) make a product label; "usage" and "descr" are WEAK: they
  // also stand on notes and dispensing labels, so together they count as one type.
  /** @type {Array<{type: string, weak?: boolean, l?: RegExp, d?: RegExp}>} */
  const EVIDENCE = [
    { type: "regword",
      l: latin(["(?<!company\\s|tax\\s|vat\\s|business\\s|gst\\s|co\\.\\s)\\breg(?:istration)?\\.?\\s*(?:no|number)|",
        "\\bnotification\\s+no|\\bproduct\\s+licen[cs]e|\\bma\\s+holder|\\bsố đăng ký|\\bsđk\\b"]),
      d: dense(["เลขทะเบียน|ทะเบียนยา|เลขสารบบ|ใบรับจดแจ้ง|เลขจดแจ้ง|ใบจดแจ้ง|เลขที่จดแจ้ง|(?<![ก-๙])อย\\.?\\d|เครื่องหมายอย|批准文号|许可证|許可證|备案|備案|註冊編號|注册编号|承認番号|届出番号|허가번호|신고번호|품목보고번호"]) },
    { type: "ingredients",
      l: latin(["\\bingredients?\\b|\\bcomposition\\b|\\binci\\b|",
        "\\beach\\s+(?:tablet|capsule|caplet|softgel|sachet|ml|5\\s*ml|g|dose)\\b[^\\n]{0,24}\\bcontains?\\b|\\bcontains\\s*:|\\bkomposisi\\b|",
        "\\bmengandungi?\\b|\\bthành phần\\b|\\bbahan(?:-bahan)?\\s*:|\\bramuan\\b"]),
      d: dense(["ส่วนประกอบ|ส่วนผสม|ตัวยาสำคัญ|ประกอบด้วย|สารสำคัญ|วัตถุปรุงแต่ง|วัตถุกันเสีย|สีผสมอาหาร|แต่งกลิ่น|เจือสี|成分|成份|配料|主要原料|原材料|原料[:：]|全成分|성분|원재료|원료약품"]) },
    { type: "nutrition",
      l: latin(["\\bnutrition(?:al)?\\s+(?:facts|information|info|value)|\\bsupplement\\s+facts|",
        "\\bdrug\\s+facts|\\bserving\\s+size|\\bservings?\\s+per|\\bcalories\\b|\\bamount\\s+per\\s+serving|",
        "\\bdaily\\s+value|\\btotal\\s+(?:fat|carbohydrate|sugars?)\\b|\\benergy\\b[^\\n]{0,12}\\b(?:kcal|kj)\\b|\\d\\s*kcal\\b|\\binformasi\\s+nilai\\s+gizi|\\bmaklumat\\s+pemakanan"]),
      d: dense(["ข้อมูลโภชนาการ|คุณค่าทางโภชนาการ|หน่วยบริโภค|กิโลแคลอรี|营养成分|營養標示|营养标签|栄養成分|영양정보|영양성분|영양·기능정보|[热熱]量\\d|能量\\d|エネルギー|nrv%"]) },
    { type: "net",
      l: latin(["\\bnet\\.?\\s*(?:wt|weight|vol|volume|contents?|qty|quantity)\\b|\\bnet\\.?\\s*:?\\s*\\d|",
        "\\bnett\\b|\\bnetto\\b|\\bkhối lượng tịnh|\\bthể tích thực|\\bberat\\s+bersih|\\bisi\\s+bersih|",
        "\\d\\s*(?:ml|g|l|oz)\\s*[e℮]\\b|\\d\\s*fl\\.?\\s*oz\\b"]),
      d: dense(["ปริมาณสุทธิ|น้ำหนักสุทธิ|ปริมาตรสุทธิ|ขนาดบรรจุ|บรรจุ\\d|ขนาด\\d+(?:มล|กรัม|ก\\.|ซีซี|ml|g)|[净淨]含量|[净淨]重|[净淨]容量|[内內]容量|내용량|용량[:：]|[规規]格[:：]"]) },
    { type: "batch",
      l: latin(["\\b(?:lot|batch)\\b[\\s.:#]*(?:no|number)?[\\s.:#]*[a-z]{0,3}\\d|\\bexp\\.?\\s*(?:date)?[\\s.:]*\\d|",
        "\\b(?:exp|mfg|mfd)\\.?\\s*date\\b|\\bexpir(?:y|es|ation)\\b|\\bmf[gd]\\b|\\bbest\\s+(?:before|by)\\b|\\buse\\s+by\\b|",
        "\\bbbe?\\s*:?\\s*\\d|\\bmanufactur(?:ing|ed)\\s+date|\\bbaik\\s+digunakan\\s+sebelum|\\bhạn sử dụng|\\bnsx\\b|\\bhsd\\b|\\btarikh\\s+luput"]),
      d: dense(["เลขที่ผลิต|รุ่นที่ผลิต|ครั้งที่ผลิต|รุ่นการผลิต|วันผลิต|วันที่ผลิต|ผลิตเมื่อ|หมดอายุ|สิ้นอายุ|ควรบริโภคก่อน|批号|批號|生[产產]日期|製造日期|有效期|有效日期|保[质質]期|保存期限|限期使用|",
        "賞味期限|消費期限|使用期限|製造番号|製造記号|유통기한|소비기한|사용기한|제조번호|제조일"]) },
    { type: "maker",
      l: latin(["\\bmanufactured\\s+(?:by|for|in)|\\bmfd\\.?\\s+(?:by|for)|\\bdistributed\\s+by|\\bimported\\s+by|",
        "\\bmarketed\\s+by|\\bpacked\\s+(?:by|for)|\\bproduced\\s+by|\\bmade\\s+in\\b|\\bproduct\\s+of\\b|",
        "\\bmanufacturer\\b|\\bimporter\\b|\\bdistributor\\b|\\bconsumer\\s+(?:care|hotline|service)|",
          "\\bdikilangkan\\s+oleh|\\bdiproduksi\\s+oleh|\\bdiedarkan\\s+oleh|\\bsản xuất (?:tại|bởi)|\\bnhà sản xuất"]),
      d: dense(["ผลิตโดย|ผู้ผลิต|ศูนย์บริการลูกค้า|ผู้บริโภคสัมพันธ์|จำหน่ายโดย|ผู้จัดจำหน่าย|นำเข้าโดย|",
        "ผู้นำเข้า|ผลิตและจำหน่าย|ผู้แทนจำหน่าย|ผลิตในประเทศ|生[产產]企业|生[产產]商|制造商|製造商|[经經][销銷]商|委托方|受托方|生产厂家|原[产產][国國地]|",
        "藥商|厂址|製造販売元|販売元|製造者|販売者|製造所|輸入者|제조원|판매원|제조사|수입원|책임판매업자|제조국|제조업자"]) },
    { type: "storage",
      l: latin(["\\bstore\\s+(?:in|at|below|under|between|away|refrigerated|frozen)\\b|\\bstorage\\b|",
        "\\bkeep\\s+(?:refrigerated|frozen|in\\s+a\\s+(?:cool|dry)|away\\s+from|tightly|container)|",
        "\\bprotect\\s+from\\s+(?:light|heat|moisture)|\\brefrigerate\\s+after|\\bsimpan\\s+(?:di|pada)\\b|\\bbảo quản"]),
      d: dense(["เก็บในที่|เก็บที่อุณหภูมิ|เก็บให้พ้น|เก็บรักษา|เก็บไว้ใน|วิธีเก็บ|เก็บในตู้เย็น|[贮貯][藏存]|[储儲]存|保存方法|保存[条條]件|密封保存|[避遮]光|阴凉干燥|陰涼乾燥|冷藏|保管及び|直射日光|보관방법|저장방법|직사광선"]) },
    { type: "warning",
      l: latin(["\\bwarnings?\\b|\\bcaution\\b|\\bprecautions?\\b|\\bkeep\\s+out\\s+of\\s+(?:the\\s+)?(?:sight\\s+and\\s+)?reach|",
        "\\bfor\\s+external\\s+use|\\bexternal\\s+use\\s+only|\\bdo\\s+not\\s+(?:use|exceed|swallow)|",
        "\\bavoid\\s+contact\\s+with\\s+eyes|\\bask\\s+a\\s+doctor\\s+(?:before|if)|\\bside\\s+effects\\b|",
          "\\ballergen|\\bcontains\\s*:?\\s*(?:milk|soy|wheat|nuts?|tree\\s+nuts|eggs?|fish|gluten|peanuts?)\\b|",
        "\\bnot\\s+(?:intended|recommended)\\s+for|\\bdiscontinue\\s+use|\\bperingatan\\b|\\bamaran\\b|\\bcảnh báo|\\bjauhi\\s+daripada|\\bthese\\s+statements\\s+have\\s+not"]),
      d: dense(["คำเตือน|ข้อควรระวัง|ห้ามใช้|ห้ามรับประทาน|ใช้ภายนอกเท่านั้น|หยุดใช้|ไม่ควรรับประทาน|ผู้แพ้อาหาร|ไม่มีผลในการป้องกัน|ครบ5หมู่|บริโภคแต่น้อย|ห้ามนำกลับมาใช้|",
        "注意事[项項]|禁忌|不良反[应應]|警[语語告]|慎用|禁用|不适宜人群|致敏物|[过過]敏原|[仅僅]供外用|不能代替[药藥]物|使用上の注意|してはいけないこと|相談すること|アレルギー|小児の手の届かない|[儿兒]童(?:不能|不易)?接[触觸]|사용상의주의|주의사항|알레르기|어린이손이닿지않는"]) },
    { type: "category",
      l: latin(["\\b(?:dietary|food|health|herbal)\\s+supplement|\\bherbal\\s+(?:medicine|product)|",
        "\\btraditional\\s+(?:medicine|herbal)|\\bover[- ]the[- ]counter|\\botc\\b|\\brx\\s+only\\b|\\bprescription\\s+only|",
        "\\bpharmacy\\s+(?:only|medicine)|\\bcosmetic\\s+product|\\bmedical\\s+device|",
          "\\bsuplemen\\s+(?:makanan|kesehatan)|\\bthực phẩm (?:chức năng|bảo vệ sức khỏe)|\\bobat\\s+(?:bebas|keras)\\b|",
        "\\bantihistamine\\b|\\bpain\\s+reliever|\\bbroad\\s+spectrum\\b|\\bspf\\s*\\d"]),
      d: dense(["ผลิตภัณฑ์เสริมอาหาร|ยาสามัญประจำบ้าน|ยาอันตราย|ยาควบคุมพิเศษ|ยาแผนโบราณ|ยาแผนปัจจุบัน|ยาใช้ภายนอก|ยาใช้ภายใน|ยาใช้เฉพาะที่|ผลิตภัณฑ์สมุนไพร|เครื่องสำอาง|เครื่องมือแพทย์|",
        "ยาสมุนไพร|วัตถุอันตราย|保健食品|非[处處]方[药藥]|[处處]方[药藥]|指示藥|成藥|中成[药藥]|化[妆妝]品|医疗器械|醫療器材|第[123]類医薬品|第[123]类|医薬部外品|医薬品|化粧品|健康食品|",
        "機能性表示食品|일반의약품|전문의약품|건강기능식품|의약외품|화장품|식품유형|[甲乙][类類]"]) },
    { type: "usage", weak: true,
      l: latin(["\\bdirections?\\b|\\bhow\\s+to\\s+use|\\bsuggested\\s+use|\\brecommended\\s+(?:dose|use|dosage|intake)|",
        "\\bdosage\\b|\\bfor\\s+oral\\s+use|\\bshake\\s+well|\\buses\\s*:|\\bindications?\\b|",
        "\\bapply\\s+(?:to|a|evenly|liberally|generously)\\b|",
          "\\btake\\s+(?:\\d|one|two)\\s*(?:tablets?|capsules?|softgels?|caplets?|sachets?)|\\baturan\\s+pakai|\\bcara\\s+(?:pakai|penggunaan)|",
        "\\bcách dùng|\\bhướng dẫn sử dụng|\\bread\\s+the\\s+(?:package\\s+)?(?:leaflet|label)"]),
      d: dense(["วิธีใช้|วิธีรับประทาน|ขนาดรับประทาน|ขนาดและวิธีใช้|วิธีชง|วิธีปรุง|รับประทานครั้งละ|ครั้งละ\\d|วันละ\\d|สรรพคุณ|ข้อบ่งใช้|เขย่าขวด|用法|食用方法|使用方法|[适適][应應]症|功能主治|保健功能|",
        "每次\\d|每日\\d|一[日次]\\d|効能|ご使用方法|お召し上がり方|1日\\d回|용법|효능|섭취방법|섭취량|사용법|1일\\d회"]) },
    { type: "descr", weak: true,
      l: latin(["\\d\\s*(?:mg|mcg|µg|μg|g|ml|iu|%)\\b[^\\n]{0,40}\\b(?:tablets?|capsules?|caplets?|softgels?|sachets?|syrup|cream|lotion|ointment|gel|shampoo|serum|drops|spray|powder|suspension|",
        "balm|lozenges?)\\b|\\b(?:tablets?|capsules?|caplets?|softgels?|syrup|cream|lotion|ointment|",
          "shampoo|serum|suspension|balm)\\b[^\\n]{0,40}\\d\\s*(?:mg|mcg|µg|μg|g|ml|iu|%)(?![a-z])"]),
      d: dense(["\\d(?:มก|มล|กรัม|ซีซี|mg|ml|g)[^\\n]{0,30}(?:เม็ด|แคปซูล|ซอง|หลอด|ขวด)|(?:ยาเม็ด|แคปซูล|ครีม|โลชั่น|ยาน้ำ|ขี้ผึ้ง|เจล)[^\\n]{0,30}\\d(?:มก|มล|กรัม|ซีซี|mg|ml|g)|",
        "(?:片|[胶膠]囊|[颗顆]粒|錠|口服液|[软軟]膏|乳膏|カプセル|캡슐|크림)[^\\n]{0,20}\\d(?:mg|g|ml|毫克|克|毫升)|\\d(?:mg|g|ml|毫克|克|毫升)[^\\n]{0,20}(?:片|粒|[胶膠]囊|錠|丸|袋|カプセル|정|캡슐|포)"]) }
,
    { type: "qty", weak: true,
      l: latin(["\\d\\s*(?:mg|mcg|µg|μg|g|kg|ml|l|iu|oz)\\b|\\d\\s*(?:tablets?|capsules?|caplets?|softgels?|sachets?|pcs|pieces)\\b"]),
      d: dense(["\\d(?:มก|มล|กรัม|ซีซี|ลิตร|เม็ด|แคปซูล|ซอง|ชิ้น|毫克|克|毫升|公克|粒|片|錠|枚|本|정|캡슐|포)|ราคา\\d+(?:\\.\\d+)?บาท"]) }
  ];
  // Thai label words that survive lost or wrong characters: approximate match on sk (edit distance 1 for a cue of 6-8
  // characters without marks, 2 for 9 or more)
  const FUZZY_TH = Object.entries({
    ingredients: ["ส่วนประกอบ", "ส่วนผสม", "ตัวยาสำคัญ", "ประกอบด้วย"], nutrition: ["ข้อมูลโภชนาการ", "หนึ่งหน่วยบริโภค", "กิโลแคลอรี"],
    net: ["ปริมาณสุทธิ", "น้ำหนักสุทธิ", "ปริมาตรสุทธิ", "ขนาดบรรจุ"], batch: ["เลขที่ผลิต", "รุ่นที่ผลิต", "วันหมดอายุ", "ควรบริโภคก่อน", "วันที่ผลิต", "ยาสิ้นอายุ"],
    maker: ["ผลิตโดย", "จัดจำหน่ายโดย", "นำเข้าโดย"], storage: ["เก็บที่อุณหภูมิ", "เก็บในที่แห้ง", "เก็บให้พ้น"],
    warning: ["คำเตือน", "ข้อควรระวัง", "ห้ามรับประทาน", "ใช้ภายนอกเท่านั้น"],
    category: ["ผลิตภัณฑ์เสริมอาหาร", "ยาสามัญประจำบ้าน", "ยาแผนโบราณ", "ยาอันตราย", "เครื่องสำอาง", "ยาใช้ภายนอก", "ผลิตภัณฑ์สมุนไพร"],
    regword: ["เลขทะเบียน", "ทะเบียนยา", "ใบรับจดแจ้ง", "เลขสารบบอาหาร"], usage: ["รับประทานครั้งละ", "ขนาดรับประทาน", "สรรพคุณ"]
  }).flatMap(([type, words]) => words.map(w => ({ type, w: unmark(w) }))).filter(x => x.w.length >= 6);
  /** Approximate substring search (Sellers): is `p` in `t` within `k` edits? @param {string} t @param {string} p @param {number} k */
  function near(t, p, k) {
    const m = p.length;
    let prev = new Uint16Array(m + 1), cur = new Uint16Array(m + 1);
    for (let i = 0; i <= m; i++) prev[i] = i;
    for (let j = 0; j < t.length; j++) {
      const c = t[j];
      cur[0] = 0;
      for (let i = 1; i <= m; i++) cur[i] = Math.min(prev[i] + 1, cur[i - 1] + 1, prev[i - 1] + (p[i - 1] === c ? 0 : 1));
      if (cur[m] <= k) return true;
      const x = prev; prev = cur; cur = x;
    }
    return false;
  }
  // Latin label words that survive one lost or wrong character (low-quality OCR): a token within edit distance 1
  const FUZZY = { ingredients: "ingredients", ingredient: "ingredients", composition: "ingredients", nutrition: "nutrition", calories: "nutrition", manufactured: "maker", distributed: "maker",
    manufacturer: "maker", warnings: "warning", warning: "warning", caution: "warning", precautions: "warning", directions: "usage", supplement: "category", storage: "storage" };

  // PERSONAL-DOCUMENT signs: they veto even when product words (or a registration number) stand in the text, e.g. a
  // parcel label that lists the product. Pack wording is avoided on purpose: ผู้รับอนุญาต, ผู้ส่งออก, "prescription only",
  // 处方药, 请及时就诊, "delivery system", "cod liver oil", "made with love", "Dear customer", お客様 are NOT cues.
  /** @type {Array<{group: string, l?: RegExp, t?: RegExp, d?: RegExp, x?: RegExp}>} */
  const DOC = [
    { group: "shipping",
      l: latin(["\\b(?:recipient|consignee|shipper|sender|addressee)\\b|\\bship(?:ped|ping)?\\s*to\\b|\\bdeliver(?:y|ed)?\\s*to\\b|\\bdelivery\\s+(?:address|note|date|instructions?|order)|",
        "\\bshipping\\s+(?:address|label|method|fee|date)|\\bbill(?:ed|ing)?\\s*(?:to|address)\\b|",
          "\\bsold\\s+to\\b|\\btracking\\s*(?:no|number|#|id|code|:)|\\btracked\\b|\\bwaybill|\\bawb\\b|\\bairway\\s+bill|",
        "\\bparcel\\b|\\bpostage\\b|\\bcourier\\b|\\breturn\\s+address|(?:^|\\n)\\s*(?:from|to)\\s*:|",
          "\\bcash\\s+on\\s+delivery|\\bcod\\s*(?:amount|:|฿|\\d)|\\breceived\\s+by\\b|\\bexpress\\s+worldwide|",
        "\\b(?:flash|kerry|j&t|ninja|best|scg|shopee|lazada)\\s+(?:express|xpress|van)\\b|",
          "\\bpenerima\\b|\\bpengirim\\b|\\bno\\.?\\s*resi\\b|\\bngười (?:nhận|gửi)|\\bmã (?:vận đơn|đơn hàng)"]),
      t: dense(["ผู้รับ(?!อนุญาต|ประทาน|จ้าง|ผิดชอบ|บริการ|เหมา|สัมปทาน|ใบอนุญาต|รอง)|ผู้ส่ง(?!ออก|เสริม)|",
        "ผู้ฝากส่ง|จัดส่งถึง|ที่อยู่จัดส่ง|ที่อยู่ในการจัดส่ง|ส่งถึง\\s*(?:[:：]|คุณ)|กรุณาส่ง|เลขพัสดุ|",
        "หมายเลขพัสดุ|เลขติดตาม|พัสดุ|เก็บเงินปลายทาง|ไปรษณีย์ไทย|ไปรษณีย์ลงทะเบียน"]),
      d: dense(["收件人|寄件人|收[货貨]人|[发發]件人|[发發][货貨]人|寄件地址|收件地址|收[货貨]地址|配送地址|送[货貨]地址|[运運][单單][号號]|快[递遞]|物流[单單編编]|[顺順][丰豐]|中通|[圆圓]通|申通|[韵韻][达達]|",
        "中[国國][邮郵]政|黑貓|宅急便|[签簽]收|包裹|代收[货貨]款|[货貨]到付款|[买買]家|[卖賣]家|託運|托寄|お届け先|ご依頼主|送り状|伝票番号|お問い合わせ番号|ゆうパック|受取人|差出人|",
        "받는분|받는사람|보내는분|보내는사람|수령인|수취인|발송인|운송장|송장번호|배송지|배송메모|택배"]) },
    { group: "order",
      l: latin(["\\border\\s*(?:no|number|id|#|date|ref|summary|details|confirmation)|\\bpacking\\s+(?:slip|list)|",
        "\\bpurchase\\s+order|\\bthank\\s+you\\s+for\\s+(?:your\\s+)?(?:order|purchase|shopping)|",
        "\\bcustomer\\s*(?:name|id|no\\b|:)|\\bgift\\s+(?:message|note|from|for|receipt)"]),
      t: dense(["คำสั่งซื้อ|ใบสั่งซื้อ|ใบส่งของ|ใบส่งสินค้า|ใบจัดส่ง|รายการสั่งซื้อ|ขอบคุณที่สั่งซื้อ|ขอบคุณที่อุดหนุน|ลูกค้า\\s*[:：]"]),
      d: dense(["[订訂][单單](?:[编編]?[号號]|明[细細]|日期)|[发發][货貨]清[单單]|[买買]家留言|[谢謝][谢謝]惠[顾顧]|ご注文番号|注文番号|納品書|お買い上げ|주문번호|주문일|결제금액"]) },
    { group: "receipt",
      l: latin(["\\breceipt\\b|\\binvoice\\b|\\bsub-?total\\b|\\bgrand\\s+total|\\bamount\\s+(?:due|paid)|",
        "\\btotal\\s+(?:due|amount|paid)|\\bcashier\\b|\\bpaid\\s+by\\b|\\bchange\\s+due|\\bbalance\\s+due|",
        "\\bpayment\\s+(?:method|received|slip)|\\bquotation\\b|\\bbooking\\s+ref|\\bboarding\\s+pass"]),
      t: dense(["ใบเสร็จ|ใบกำกับภาษี|ใบแจ้งหนี้|ใบแจ้งค่า|บิลเงินสด|รวมทั้งสิ้น|ยอดรวม|ยอดชำระ|ยอดสุทธิ|เงินทอน|ผู้รับเงิน|โอนเงิน|เลขที่บัญชี|ใบเสนอราคา|จำนวนเงิน"]),
      d: dense(["收[据據]|[发發]票|小票|合[计計][:：\\d¥￥]|[总總][计計]|[实實]付|[应應]付|找零|收[银銀]|支付方式|付款方式|領収書|領収証|請求書|合計金額|영수증|거래명세|합계금액"]) },
    { group: "certificate",
      l: latin(["\\bmedical\\s+(?:certificate|record|report|history)|\\bdoctor'?s?\\s+(?:certificate|note|letter)|",
        "\\bcertificate\\s+of\\s+(?:fitness|vaccination|health|birth|death|sickness|attendance)|",
        "\\bthis\\s+is\\s+to\\s+certify|\\b(?:i|we)\\s+(?:hereby\\s+)?certify\\s+that|\\bto\\s+whom\\s+it\\s+may\\s+concern|",
          "\\bsick\\s+(?:leave|note)|\\bfit\\s+(?:note|to\\s+(?:work|fly|travel))|\\bunfit\\s+for\\b|",
        "\\bdiagnosis\\s*[:：]|\\bdiagnosed\\s+with|\\blab(?:oratory)?\\s+(?:report|results?)|",
          "\\bdischarge\\s+summary|\\breferral\\s+(?:letter|form)|\\bvaccination\\s+(?:record|certificate|card)|",
        "\\bunder\\s+my\\s+care|\\bis\\s+prescribed\\b|\\bprescribed\\s+(?:by|for)\\b|\\bprescriber\\b|\\bspecimen\\b|\\bsurat\\s+keterangan|\\bsijil\\s+cuti"]),
      t: dense(["ใบรับรองแพทย์|ใบรับรองการ|หนังสือรับรอง|ขอรับรองว่า|ใบความเห็นแพทย์|ความเห็นแพทย์|",
        "ผลการวินิจฉัย|วินิจฉัยว่า|การวินิจฉัย\\s*[:：]|ผลตรวจ(?:เลือด|ปัสสาวะ|สุขภาพ|แล็บ|ทางห้อง)|",
        "ใบส่งตัว|ใบรายงานผล|ใบลา|เวชระเบียน|ประวัติผู้ป่วย|ประวัติการรักษา|ได้ตรวจร่างกาย|แพทย์ผู้ตรวจ|แพทย์ผู้สั่ง|หยุดพักรักษาตัว|สิทธิการรักษา|ค่ารักษาพยาบาล"]),
      d: dense(["[诊診][断斷](?:[证證]明|[书書]|[:：])|診断書|[证證]明[书書]|[兹茲][证證]明|特此[证證]明|[临臨]床[诊診][断斷]|[检檢][验驗][报報]告|[检檢]查[报報]告|化[验驗][单單]|[体體][检檢][报報]告|出院|[转轉][诊診]|",
        "病假|[请請]假|病名|醫師囑言|上記の通り診断|진단서|소견서|병명"]) },
    { group: "appointment",
      l: latin(["\\bappointment\\b|\\bappt\\b|\\bnext\\s+visit\\b|\\bfollow[- ]up\\s+(?:date|visit|on)\\b|\\bqueue\\s+no|\\breschedule\\b"]),
      t: dense(["ใบนัด|บัตรนัด|นัดครั้งต่อไป|วันนัด|นัดพบแพทย์|นัดหมาย|นัดตรวจ|นัดฟังผล|เวลานัด"]),
      d: dense(["[预預][约約]|[复複][诊診]|回[诊診]|[挂掛][号號]|候[诊診]|取[号號]|予約票|次回予約|診察券|예약증|진료예약|다음예약"]) },
    { group: "letter",
      l: latin(["\\bdear\\s+(?!customers?\\b|valued\\b|consumers?\\b|users?\\b|parents?\\b|friends?\\b)[a-z]|",
        "\\b(?:yours\\s+)?(?:sincerely|faithfully)\\b|\\b(?:best|kind|warm)\\s+(?:regards|wishes)\\b|\\bregards,|",
        "\\bhappy\\s+(?:birthday|anniversary|mother'?s\\s+day|father'?s\\s+day|new\\s+year|valentine)|\\bmerry\\s+christmas|\\bget\\s+well\\s+soon|\\blove,|\\bxoxo\\b|\\bsigned\\s*[:：]|",
        "\\bsignature\\s*[:：_]|\\bauthori[sz]ed\\s+signature|\\bcall\\s+me\\b"]),
      t: dense(["เรียน\\s+(?:คุณ|ท่าน|นาย|นาง|ผู้|อาจารย์|ดร)|",
        "ถึง\\s*(?:คุณ|น้อง|พี่|แม่|พ่อ|ลูก(?!ค้า)|ป้า|ลุง|ยาย|ย่า|ปู่|เพื่อน|ที่รัก)|(?:^|\\n|\\s)จาก\\s*(?:คุณ|น้อง|พี่|แม่|พ่อ|ลูก(?!ค้า))|",
        // short words that, with their marks lost, also stand INSIDE product wording ("ปลายเซนเซอร์" = sensor tip, "ลงช่อง" = into
        // the slot, "สกปรกแม้"): without marks they count only at the start of a word; with their marks (x, below) anywhere
        "ด้วยความเคารพ|ขอแสดงความนับถือ|สุขสันต์วันเกิด|หายไว|หายเร็ว|ลายมือชื่อ|ฝากให้|ฝากถึง|(?<![ก-๙])(?:ลงชื่อ(?!ง)|ลายเซ็น(?!\\s?เซ)|รักแม่|รักพ่อ)"]),
      x: /ลงชื่อ|ลายเซ็น|รักแม่|รักพ่อ/u,
      d: dense(["[亲親][爱愛]的|尊敬的(?![顾顧]客|用[户戶]|消[费費]者|客[户戶])|敬[启啟]|此致|敬[礼禮]|敬上|生日快[乐樂]|早日康[复復]|新年快[乐樂]|[签簽]名|[签簽]字|拝啓|敬具|誕生日おめでとう|",
        "(?<![客皆者])様(?:\\n|$)|(?<![客皆者])殿(?:\\n|$)|생일축하|님께"]) },
    { group: "identity",
      l: latin(["\\bpassport\\b|\\bidentity\\s+card|\\bid\\s+card|\\bdriver'?s?\\s+licen[cs]e|",
        "\\bdate\\s+of\\s+birth|\\bnationality\\b|\\binsurance\\s+(?:claim|policy|card|no)|\\bpolicy\\s+(?:no|number)|",
        "\\bmember(?:ship)?\\s+(?:id|no|number|card)\\b|\\bsex\\s*:\\s*[mf]\\b|\\bage\\s*:\\s*\\d"]),
      t: dense(["บัตรประจำตัว|บัตรผู้ป่วย|บัตรประชาชน|เลขประจำตัวประชาชน|นามบัตร|สมาชิกเลขที่|กรุ๊ปเลือด|หมู่เลือด|ประกันสังคม|บัตรทอง|กรมธรรม์"]),
      d: dense(["身份[证證]|身分證|公民身份|[护護]照|健保卡|医保卡|保[险險][单單]|[会會][员員][:：]|保険証|주민등록"]) }
  ];

  // document words that survive ONE lost or wrong character (Latin tokens; Thai on the text without marks and spaces).
  // Kept short on purpose: a near match must not turn pack wording into a document sign ("รหัสไปรษณีย์", "เพื่อการวินิจฉัย").
  const FUZZY_DOC = { recipient: "shipping", consignee: "shipping", waybill: "shipping", invoice: "receipt", receipt: "receipt", appointment: "appointment", sincerely: "letter",
    passport: "identity" };
  const FUZZY_DOC_TH = Object.entries({
    shipping: ["เก็บเงินปลายทาง", "ที่อยู่จัดส่ง", "หมายเลขพัสดุ"], order: ["ขอบคุณที่อุดหนุน", "ขอบคุณที่สั่งซื้อ"], receipt: ["ใบเสร็จรับเงิน", "ใบกำกับภาษี"],
    certificate: ["ใบรับรองแพทย์", "ค่ารักษาพยาบาล"], appointment: ["นัดครั้งต่อไป"], letter: ["สุขสันต์วันเกิด", "ขอแสดงความนับถือ"], identity: ["บัตรประจำตัว", "ประกันสังคม"]
  }).flatMap(([group, words]) => words.map(w => ({ group, w: unmark(w).replace(/\s+/g, "") }))).filter(x => x.w.length >= 8);
  // a postal ADDRESS that is not a maker's: at least two address parts on one line (three for CJK) and no company / maker
  // cue on the line, the three lines above or the two below. Read on the text without Thai marks.
  const ADDR_PARTS = [
    dense(["หมู่(?:ที่)?\\s?\\d|(?<![ก-๙])ม\\.\\s?\\d"]), dense(["ซอย|(?<![ก-๙])ซ\\.\\s?[ก-๙\\d]"]), dense(["ถนน|(?<![ก-๙])ถ\\.\\s?[ก-๙]"]), dense(["ตำบล|(?<![ก-๙])ต\\.\\s?[ก-๙]|แขวง"]),
    dense(["อำเภอ|(?<![ก-๙])อ\\.\\s?[ก-๙]|เขต[ก-๙]"]), dense(["จังหวัด|(?<![ก-๙])จ\\.\\s?[ก-๙]|กรุงเทพ"]), /(?<![\d\-/.])\d{5}(?![\d\-/.])\s*$|\b[a-z]{1,2}\d[a-z\d]?\s\d[a-z]{2}\b|〒\s?\d{3}-\d{4}/u,
    /\b(?:road|rd|street|lane|avenue|ave|soi|moo|jl|jalan)\b\.?/u, /\b(?:apt|unit|room|rm|floor)\b\.?\s?\d|\d+\/\d+\s+(?:[ก-๙]|soi\b|moo\b)|\b\d{6}\s*$/u,
    /^\s*\d+[a-z]?\s+[a-z .]{2,30}\b(?:road|rd|street|lane|avenue|ave)\b/u,
    /[省]/u, /[市]/u, /[区區县縣]/u, /[路街道巷]/u, /\d+\s*[号號]/u, /\d+\s*(?:[栋棟楼樓室]|单元)/u, /[都道府県][^\n]{0,12}[市区町村]/u, /\d+-\d+-\d+|丁目|番地/u,
    /[시도]\s/u, /[구군]\s/u, /(?:로|길)\s?\d/u, /\d+\s?(?:동|호|층)/u
  ];
  // maker words that survive low-quality OCR (stray spaces, lost or wrong characters). On the Thai letters of the block
  // only, marks and spaces removed: ONE exact word, or TWO different words each within a small edit distance (1 for a
  // word of 4-5 letters, 2 for 6 or more). "จำกัด" counts only exactly and never alone (without marks it starts like "จาก").
  const MAKER_FUZZY = ["บริษัท", "ผลิตโดย", "จัดจำหน่ายโดย", "จำหน่ายโดย", "นำเข้าโดย", "ห้างหุ้นส่วน"].map(unmark);
  const MAKER_LTD = unmark("จำกัด");
  const MAKER_FUZZY_EN = ["manufactured", "manufacturer", "distributed"];
  /** @param {string} block lines around an address (no Thai marks, lower case) */
  function makerBlock(block) {
    if (COMPANY_NM.test(block)) return true;
    const th = block.replace(/[^ก-๙]/g, "");
    if (th.length >= 4) {
      if (MAKER_FUZZY.some(w => th.includes(w))) return true;
      let hits = th.includes(MAKER_LTD) ? 1 : 0;
      for (const w of MAKER_FUZZY) if (near(th, w, w.length >= 6 ? 2 : 1)) hits++;
      if (hits >= 2) return true;
    }
    return (block.match(/[a-z]{10,13}/g) || []).some(w => MAKER_FUZZY_EN.some(k => Math.abs(w.length - k.length) <= 1 && lev(w, k, 1) <= 1));
  }
  /** @param {string} nm text without Thai marks (lower case) */
  function personalAddress(nm) {
    const lines = nm.split("\n");
    return lines.some((line, i) => {
      const parts = ADDR_PARTS.filter(r => r.test(line)).length;
      if (parts < (/[一-鿿가-힯]/u.test(line) && !/[ก-๙]/u.test(line) ? 3 : 2)) return false;
      return !makerBlock(lines.slice(Math.max(0, i - 3), i + 3).join("\n"));
    });
  }
  /**
   * Label cue types found in a text (no personal-document check: isDispensingLabel() uses this too).
   * @param {any} input @param {{gtins?: any[], regs?: any[]}} [facts]
   */
  function labelCues(input, facts) {
    const raw = String(input == null ? "" : input);
    const n = pnorm(raw), nm = n.replace(TH_MARKS, ""), sk = nm.replace(/\s+/g, "");
    // look-alike digits inside a Latin word read back as letters (Tab1ets, 5tore, Supp1ement)
    const LOOK = /** @type {Record<string, string>} */ ({ 1: "l", 0: "o", 5: "s", 8: "b" });
    const nl = n.replace(/(?<=[a-z])[1058](?=[a-z])|(?<![a-z0-9])[1058](?=[a-z]{3})/g, c => LOOK[c]);
    // Thai letters only, for the approximate matches (the first 3000: a label is far shorter; keeps the Worker cheap)
    const thai = /[ก-๙]/.test(sk) ? sk.replace(/[^ก-๙]/g, "").slice(0, 3000) : "";
    /** @type {Set<string>} */ const ev = new Set();
    // strong cues
    const gt = facts && Array.isArray(facts.gtins) ? facts.gtins.map(x => String(x == null ? "" : x).replace(/\D/g, "")) : [];
    let barcode = gt.some(gtinOk);
    for (const m of n.matchAll(BARCODE_CUE)) if (gtinOk(m[1])) barcode = true;
    for (const m of n.matchAll(/(?:^|\n)[ \t]*(\d{13})[ \t]*(?=\n|$)/gu)) if (eanOk(m[1]) && (/^885/.test(m[1]) || !thaiIdOk(m[1]))) barcode = true;
    if (barcode) ev.add("barcode");
    const key = (/** @type {any} */ x) => pnorm(x && typeof x === "object" ? x.norm : x).replace(/[^\p{L}\p{N}]/gu, "");
    const flat = n.replace(/[^\p{L}\p{N}]/gu, "");
    // a registration number handed in by the page counts only when it stands in this text
    const regFact = facts && Array.isArray(facts.regs) && facts.regs.some(r => { const k = key(r); return k.length >= 5 && flat.includes(k); });
    if (regFact || REG_SHAPE.test(n) || REG_SHAPE_DENSE.test(sk)) ev.add("reg");
    const strong = ev.size > 0;
    // label cue types
    let weak = false, types = 0;
    for (const e of EVIDENCE) {
      if (!((e.l && (e.l.test(n) || e.l.test(nl))) || (e.d && e.d.test(sk)))) continue;
      ev.add(e.type);
      if (e.weak) weak = true; else types++;
    }
    const WEAK = ["usage", "descr", "qty"];
    if (thai.length >= 6) for (const f of FUZZY_TH) {
      if (ev.has(f.type) || !near(thai, f.w, f.w.length >= 9 ? 2 : 1)) continue;
      ev.add(f.type);
      if (WEAK.includes(f.type)) weak = true; else types++;
    }
    for (const w of nl.match(/[a-z]{7,13}/g) || []) {
      for (const k in FUZZY) {
        const type = FUZZY[/** @type {keyof typeof FUZZY} */ (k)];
        if (ev.has(type) || Math.abs(w.length - k.length) > 1 || lev(w, k, 1) > 1) continue;
        ev.add(type);
        if (type === "usage") weak = true; else types++;
      }
    }
    if (ev.has("reg") && ev.has("regword")) types--; // the word next to its own number is one cue
    return { ev, strong, types, weak, n, nm, sk, thai };
  }
  /**
   * Evidence that a text is a PRODUCT LABEL, and signs that it is a PERSONAL DOCUMENT instead.
   *   product      true with one STRONG cue (a registration-number shape, a barcode with a valid check digit; from the text
   *                or from `facts`), or with cues of TWO different label types (ingredients, nutrition panel, net quantity,
   *                lot / dates, maker, storage, warning, product category, registration word; directions-for-use and
   *                "strength + dose form" are weak and count as ONE type together)
   *   personalDoc  true with any personal-document cue (recipient / sender, delivery, tracking, order, receipt / invoice,
   *                medical certificate, lab report, appointment, letter or note wording, identity / insurance card), or an
   *                address the guard reads as a person's (not a maker's)
   * @param {any} input label text (OCR) @param {{gtins?: any[], regs?: any[]}} [facts] what the page already holds for the
   *   capture: decoded barcodes (digits) and registration numbers parsed by lensiq-pc.js
   * @returns {{product: boolean, strong: boolean, evidence: string[], personalDoc: boolean, docCues: string[]}}
   */
  function productEvidence(input, facts) {
    const raw = String(input == null ? "" : input);
    const { ev, strong, types, weak, n, nm, sk, thai } = labelCues(raw, facts);
    const product = strong || types + (weak ? 1 : 0) >= 2;
    // personal-document signs
    /** @type {string[]} */ const docCues = [];
    for (const g of DOC) if ((g.l && g.l.test(n)) || (g.t && g.t.test(nm)) || (g.d && g.d.test(sk)) || (g.x && g.x.test(n))) docCues.push(g.group);
    for (const w of n.match(/[a-z]{6,12}/g) || []) {
      for (const k in FUZZY_DOC) {
        const g = FUZZY_DOC[/** @type {keyof typeof FUZZY_DOC} */ (k)];
        if (!docCues.includes(g) && Math.abs(w.length - k.length) <= 1 && lev(w, k, 1) <= 1) docCues.push(g);
      }
    }
    if (thai.length >= 8) for (const f of FUZZY_DOC_TH) if (!docCues.includes(f.group) && near(thai, f.w, 1)) docCues.push(f.group);
    if (scanAll(raw).some(s => s.kind === "address") || personalAddress(nm)) docCues.push("address");
    return { product, strong, evidence: [...ev], personalDoc: docCues.length > 0, docCues };
  }
  /**
   * THE decision for a capture, used by text mode and image mode alike (page: lensiq-pc-ai.js; Worker: ai/pc-features.js):
   * AI is allowed only when the text is not a dispensing label (setting dispensingAI "off"), shows no personal-document
   * sign and shows product-label evidence. reason: "ok" | "dispensing" | "personal-doc" | "no-product".
   * @param {any} input @param {{gtins?: any[], regs?: any[]}} [facts]
   * @param {{dispensingAI?: string, companyPhones?: "keep"|"remove", sessionEvidence?: string, sessionFacts?: {gtins?: any[], regs?: any[]}}} [opts]
   */
  function aiGate(input, facts, opts) {
    const pe = productEvidence(input, facts);
    const dispensing = isDispensingLabel(input);
    const off = ((opts && opts.dispensingAI) || DEFAULTS.dispensingAI) === "off";
    let reason = dispensing && off ? "dispensing" : pe.personalDoc ? "personal-doc" : pe.product ? "ok" : "no-product";
    // Option ข (owner decision 2026-11-10): a capture without product evidence of its own may use a barcode or a
    // registration number scanned EARLIER in the same session (opts.sessionFacts), but only when it is neither a
    // dispensing label nor a personal document (checked above, as for every capture) AND the guard finds no personal
    // data in it at all: no name, phone, ID, e-mail, date of birth or address span, and no possible name. Anything the
    // guard can see as personal keeps the capture refused, because the session evidence says nothing about THIS text.
    let session = false;
    const sessionOn = ((opts && opts.sessionEvidence) || DEFAULTS.sessionEvidence) === "on";
    if (reason === "no-product" && sessionOn && opts && sessionOk(opts.sessionFacts) && !scan(input, opts).length && !possibleNames(input).length &&
        !SESSION_BLOCK.some(re => re.test(String(input == null ? "" : input)))) {
      reason = "ok"; session = true;
    }
    return { allow: reason === "ok", reason, session, dispensing, ...pe };
  }
  /** Option ข is a convenience, never a reason to send a personal text: a capture that only reaches the gate through
   *  session evidence must also show none of these, whatever the detectors above say (they miss some formats): a
   *  phone-like group of 9+ digits, a form of address, or letter / note wording. Refusing a product here only means
   *  the user scans or captures the back panel, as before option ข. */
  const SESSION_BLOCK = [
    /(?:^|[^\d])\+?\d(?:[\s().-]?\d){8,}(?!\d)/u,
    /様|さま|さん|殿|御中|님|씨|先生|女士|小姐|\b(?:dear|mr|mrs|ms|miss|dr|khun|hi|hello)\b|คุณ\s?[ก-๙]|นาย\s?[ก-๙]|นาง\s?[ก-๙]|น\.ส\.|ด\.ช\.|ด\.ญ\./iu,
    /おめでとう|ありがとう|ご連絡|拝啓|敬具|お大事に|谢谢|感谢|祝你|祝您|감사|축하|안녕|ขอบคุณ|ยินดีด้วย|ด้วยความเคารพ|regards|sincerely|thank you|thanks|congratulations|get well|reminder|เตือน|อย่าลืม|นัด|appointment|予約|预约|예약/iu
  ];
  /** The same block list for the TESTER one-tap send of the live scan (no preview): true = do not send automatically
   *  (a phone-like group of 9-11 digits, a non-Thai form of address, letter / note wording, a note to a person). Added 2026-11-12 after the independent
   *  review found Japanese / Korean names and grouped phones the detectors miss reaching one-tap send when a product label
   *  was in the same frame. @param {any} input */
  const AUTO_BLOCK = [
    // a phone-like group of 9 to 11 digits (a 13-digit Thai food / cosmetic number or a GTIN is not one)
    /(?<!\d[\s().-]{0,2})\+?\d(?:[\s().-]{0,2}\d){8,10}(?![\s().-]{0,2}\d)/u,
    // a form of address outside Thai (Thai names and titles are the guard's own, measured, rules; คุณภาพ is not a title)
    /様|さま|さん|殿|御中|님|씨|先生|女士|小姐|\b(?:dear|mr|mrs|ms|miss|dr|hi|hello)\b/iu,
    // letter / note wording (not the label word คำเตือน)
    /おめでとう|ありがとう|ご連絡|拝啓|敬具|お大事に|谢谢|感谢|祝你|祝您|감사|축하|안녕|ขอบคุณ|ยินดีด้วย|ด้วยความเคารพ|อย่าลืม|นัดหมาย|regards|sincerely|thank you|thanks|congratulations|get well|reminder|appointment|予約|预约|예약/iu,
    // a note to a person (2026-11-12, after the wider one-tap stress run: "…ไว้ให้ยาย <name>" next to a product label):
    // Thai "for / of / to" + a kinship word or title, the note markers ไว้ให้ / สำหรับ + a kinship word or title, and the
    // English / Chinese equivalents. One-tap only: nothing is removed from any text because of these.
    new RegExp("(?:ไว้ให้|(?:ให้|ของ|ถึง|แด่|สำหรับ)\\s*(?:คุณ\\s*)?(?:ยาย|ปู่|ย่า|พ่อ|แม่|หลาน|ป้า|ลุง|น้า|คุณ(?!ค่า|ภาพ|สมบัติ|ประโยชน์|ลักษณะ)|นาย|นางสาว|นาง|น\\.ส\\.|ด\\.ช\\.|ด\\.ญ\\.|" +
      "ตา(?!ม|ย|ราง|มิน)|อา(?!การ|หาร|ย|จ|รมณ์|บ)|ลูก(?!ค้า|อม|กลอน)|น้อง|พี่))", "u"),
    /\b(?:for|to)\s+(?:my\s+|your\s+|dear\s+)?(?:grand(?:ma|pa|mother|father|son|daughter)|granny|nana|mum|mom|mother|dad|father|son|daughter|sister|brother|aunt(?:ie)?|uncle|mr|mrs|ms|miss)\b/iu,
    /给(?:奶奶|爷爷|外婆|外公|姥姥|姥爷|妈妈|爸爸|母亲|父亲|儿子|女儿|孙子|孙女|宝宝|孩子|哥哥|姐姐|弟弟|妹妹|叔叔|阿姨|舅舅|姑姑|伯伯|老公|老婆|老人|[一-鿿]{1,2}(?:先生|女士|小姐|老师))|給(?:奶奶|爺爺|外婆|外公|媽媽|爸爸|兒子|女兒|寶寶|孩子)/u
  ];
  const autoBlock = input => AUTO_BLOCK.some(re => re.test(String(input == null ? "" : input)));
  /** Session evidence usable for option ข: a barcode with a valid check digit, or a registration number of 5+ letters
   *  and digits, scanned earlier in the session by the page. @param {any} sf {gtins?, regs?} */
  function sessionOk(sf) {
    if (!sf || typeof sf !== "object") return false;
    const g = Array.isArray(sf.gtins) && sf.gtins.some((/** @type {any} */ x) => gtinOk(String(x == null ? "" : x).replace(/\D/g, "")));
    const r = Array.isArray(sf.regs) && sf.regs.some((/** @type {any} */ x) => String(x == null ? "" : x).replace(/[^\p{L}\p{N}]/gu, "").length >= 5);
    return !!(g || r);
  }

  /** @param {any} [opts] */
  const keepCompany = opts => ((opts && opts.companyPhones) || DEFAULTS.companyPhones) !== "remove";
  /** What redact() removes. @param {any} input @param {{companyPhones?: "keep"|"remove"}} [opts] */
  function scan(input, opts) {
    const kc = keepCompany(opts);
    return scanAll(input).filter(s => !(kc && s.company)).map(s => ({ kind: s.kind, start: s.start, end: s.end }));
  }
  /** @param {any} input @param {{companyPhones?: "keep"|"remove"}} [opts] */
  function redact(input, opts) {
    const text = String(input == null ? "" : input);
    const spans = scan(text, opts);
    let out = "", at = 0;
    for (const s of spans) { out += text.slice(at, s.start) + PLACEHOLDER; at = s.end; }
    out += text.slice(at);
    return { text: out, removed: spans.map(s => ({ kind: s.kind, text: text.slice(s.start, s.end) })), count: spans.length };
  }
  /** Photo allowed? Blocked by any personal span (company phones per the setting) or by a dispensing-label look.
   * @param {any} input @param {{companyPhones?: "keep"|"remove"}} [opts] */
  function imageCheck(input, opts) {
    const personal = scan(input, opts).length;
    const dispensing = isDispensingLabel(input);
    return { block: personal > 0 || dispensing, personal, dispensing };
  }

  return { scan, scanAll, redact, imageCheck, isDispensingLabel, fold, thaiIdOk, DEFAULTS, PLACEHOLDER, KINDS: ["name", "hn", "phone", "id", "email", "dob", "address"], possibleNames, provenance,
    productEvidence, aiGate, autoBlock, twIdOk, gtinOk, nameLineCount: (/** @type {any} */ t) => nameLines(fold(String(t == null ? "" : t))).length };
});
