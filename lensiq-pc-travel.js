/* lensiq-pc-travel.js — Product Check TRAVEL MODE (round 17, P9; design docs/PRODUCT-CHECK-DESIGN.md §7, §4.7). Browser:
 * window.LQPCTravel + the travel card in #pcTravelSlot of medicine.html · Node: module.exports (pure parts, unit-tested in
 * tests/unit/pc-travel.test.js; fixed synthetic set docs/product-check/p9-inn-testset.json).
 *
 * FOR A PRODUCT FROM ANOTHER COUNTRY (the label has no Thai, or the pack names another country), ON THIS DEVICE:
 *   1. INN: the active ingredients printed on the pack -> their international non-proprietary name. Two sources, both
 *      ours or licence-clear: INN_TABLE (a hand table of names as printed in EN / other Latin languages / ZH / JA / KO / TH,
 *      written for LENSIQ: names are facts) and the TMT 2020 ingredient words (CC BY, vendor/pc-drugs/tmt/meta.json).
 *      WHO INN lists are NOT used (WHO terms, design §4.5). The user can confirm a name with RxNorm through the card's
 *      "check official sources" tap (the INN goes to RxNav as a derived fact, lensiq-pc-lookup.js planLookups).
 *      The AI's ingredient list (pc_fields, after consent) is accepted only when its INN resolves here (design §7); an
 *      unresolved one is listed as "not used".
 *   2. Country of origin (printed words, registration-number shapes, script) and the coverage message (§4.7): which
 *      official sources the card can check for that country, or "no official database we can check covers <country>"
 *      with the agency's own site. A missing source is never "looks fine".
 *   3. Thai equivalents ("products in Thailand with the same active ingredient(s)"): BEHIND THE OWNER'S SWITCH
 *      window.LENSIQ_PC_THAI_EQUIV (lensiq-config.js, OFF by default: Thai FDA data permission is pending, CTO-BRIEF L13).
 *      Off: the card says so and gives the INN to ask a pharmacist. On: a LIST from TMT 2020-02-17 (CC BY, the only
 *      licence-clear Thai product table; data date and credit shown), exact ingredient set only, loaded as small shards
 *      (vendor/pc-drugs/tmt-ing/, built by tools/pc-tmt-ing-build.mjs with ingFiles below). Never a recommendation,
 *      never "use instead", not a register.
 *   4. Translated label lines (lensiq-pc-ai.js, pc_translate after consent): classifyPair marks dosing and warning lines so
 *      the page labels them "translated from the label, not advice, ask a pharmacist" (CTO-BRIEF L47).
 * NOT DONE: no dose conversion, no "you can take this instead", no dosing advice of our own. Nothing here sends anything.
 *
 *   buildInnIndex(tmtIngredients?) -> idx · baseIndex() -> idx (hand table only, cached)
 *   extractInn(text, idx) -> [{inn, matched, via: "synonym"|"tmt", strength, start}]   longest match first, one per INN
 *   resolveInn(name, idx) -> inn | null · acceptAi(aiIngredients, idx) -> {accepted, rejected}
 *   classifyLine(line) -> "dose"|"warning"|"other" · classifyPair(source, translation) -> the same, either side counts
 *   countriesOf(text, findRegNumbers?) -> [{country, via}] · coverageFor(code) -> {country, level, sources, links}
 *   isForeign(text, countries?) -> boolean · thaiEquivAllowed(W) -> boolean (strict === true)
 *   saltStrip(name) · ingSetKey(names) · shardOf(key) · ingFiles(tmt) -> {"meta.json": text, "<shard>.json": text}
 *   equivalents(key, shard, meta, {strength, max}) -> {key, total, rows: [{name, strength, form, same}]}
 *   measure(items, idx) -> numbers on a labelled set (tools / tests)
 * Test hook (browser): window.__LQ_PCT = {st, paint()}.
 */
(function (root, factory) {
  const node = typeof module !== "undefined" && module.exports;
  const m = factory(node ? require("./lensiq-pc.js") : /** @type {any} */ (root).LQPC);
  if (node) module.exports = m;
  else { /** @type {any} */ (root).LQPCTravel = m; m.mount(root); }
})(typeof self !== "undefined" ? self : this, function (/** @type {any} */ LQPC) {
  "use strict";

  /* ---------------- INN hand table (LENSIQ's own; names are facts) ----------------
   * [INN as LENSIQ shows it, Latin-script names as printed (US / BP / local spellings), Chinese (simplified and
   *  traditional), Japanese, Korean, Thai]. Salt and hydrate words are not part of a name (saltStrip). */
  /** @type {Array<[string, string[], string[], string[], string[], string[]]>} */
  const INN_TABLE = [
    ["paracetamol", ["paracetamol", "acetaminophen", "acetaminofen", "parasetamol", "paracetamolo", "paracetamolum"], ["对乙酰氨基酚", "扑热息痛", "乙醯胺酚", "對乙醯胺基酚", "對乙醯氨基酚"],
      ["アセトアミノフェン"], ["아세트아미노펜", "파라세타몰"], ["พาราเซตามอล", "อะเซตามิโนเฟน"]],
    ["ibuprofen", ["ibuprofen", "ibuprofeno", "ibuprofene"], ["布洛芬"], ["イブプロフェン"], ["이부프로펜"], ["ไอบูโพรเฟน"]],
    ["loxoprofen", ["loxoprofen"], ["洛索洛芬"], ["ロキソプロフェン"], ["록소프로펜"], ["ล็อกโซโพรเฟน"]],
    ["acetylsalicylic acid", ["acetylsalicylic acid", "aspirin", "asetosal", "acide acetylsalicylique", "acetylsalicylsaure", "acido acetilsalicilico"],
      ["阿司匹林", "乙酰水杨酸", "阿斯匹靈", "阿斯匹林"], ["アスピリン", "アセチルサリチル酸"], ["아스피린"], ["แอสไพริน"]],
    ["naproxen", ["naproxen", "naproxeno"], ["萘普生"], ["ナプロキセン"], ["나프록센"], ["นาพรอกเซน"]],
    ["diclofenac", ["diclofenac", "diklofenak"], ["双氯芬酸", "雙氯芬酸"], ["ジクロフェナク"], ["디클로페낙"], ["ไดโคลฟีแนค"]],
    // the d-form is a separate INN with a different strength (independent review 2026-11-11): longest match keeps them apart
    ["dexchlorpheniramine", ["dexchlorpheniramine", "d-chlorpheniramine", "dexclorfeniramina"], ["右氯苯那敏"], ["d-クロルフェニラミン", "ｄ－クロルフェニラミン"], ["덱스클로르페니라민"],
      ["เด็กซ์คลอร์เฟนิรามีน"]],
    ["chlorphenamine", ["chlorphenamine", "chlorpheniramine", "clorfeniramina", "clorpheniramin", "klorfeniramin", "chlorfenamin"], ["氯苯那敏", "扑尔敏", "撲爾敏"],
      ["クロルフェニラミン"], ["클로르페니라민"], ["คลอร์เฟนิรามีน"]],
    ["diphenhydramine", ["diphenhydramine", "difenhidramina", "difenhidramin"], ["苯海拉明"], ["ジフェンヒドラミン"], ["디펜히드라민"], ["ไดเฟนไฮดรามีน"]],
    ["doxylamine", ["doxylamine"], ["多西拉敏"], ["ドキシラミン"], ["독실아민"], ["ด็อกซิลามีน"]],
    ["loratadine", ["loratadine", "loratadina", "loratadin"], ["氯雷他定", "氯雷他啶"], ["ロラタジン"], ["로라타딘"], ["ลอราทาดีน"]],
    ["desloratadine", ["desloratadine", "desloratadina", "desloratadin"], ["地氯雷他定"], ["デスロラタジン"], ["데스로라타딘"], ["เดสลอราทาดีน"]],
    ["cetirizine", ["cetirizine", "cetirizina", "cetirizin", "setirizin"], ["西替利嗪"], ["セチリジン"], ["세티리진"], ["เซทิริซีน"]],
    ["levocetirizine", ["levocetirizine", "levocetirizina", "levocetirizin", "levosetirizin"], ["左西替利嗪"], ["レボセチリジン"], ["레보세티리진"], ["ลีโวเซทิริซีน"]],
    ["fexofenadine", ["fexofenadine", "fexofenadina", "feksofenadin"], ["非索非那定"], ["フェキソフェナジン"], ["펙소페나딘"], ["เฟกโซเฟนาดีน"]],
    ["dextromethorphan", ["dextromethorphan", "dextrometorfano", "dekstrometorfan", "dextrometorfan", "dextromethorphane"], ["右美沙芬"], ["デキストロメトルファン"],
      ["덱스트로메토르판"], ["เดกซ์โทรเมทอร์แฟน"]],
    ["guaifenesin", ["guaifenesin", "guaiphenesin", "guaifenesina", "guaifenesine"], ["愈创甘油醚", "癒創甘油醚"], ["グアイフェネシン"], ["구아이페네신"], ["ไกวเฟนิซิน"]],
    ["pseudoephedrine", ["pseudoephedrine", "pseudoefedrina", "pseudoefedrin", "pseudoephedrin"], ["伪麻黄碱", "偽麻黃鹼"], ["プソイドエフェドリン"], ["슈도에페드린"], ["ซูโดอีเฟดรีน"]],
    ["phenylephrine", ["phenylephrine", "fenilefrina", "fenilefrin"], ["去氧肾上腺素", "苯肾上腺素", "去氧腎上腺素"], ["フェニレフリン"], ["페닐레프린"], ["ฟีนิลเอฟริน"]],
    ["ambroxol", ["ambroxol", "ambroksol"], ["氨溴索"], ["アンブロキソール"], ["암브록솔"], ["แอมบรอกซอล"]],
    ["bromhexine", ["bromhexine", "bromhexin", "bromheksin"], ["溴己新"], ["ブロムヘキシン"], ["브롬헥신"], ["บรอมเฮกซีน"]],
    ["carbocisteine", ["carbocisteine", "carbocysteine", "carbocisteina", "karbosistein"], ["羧甲司坦"], ["カルボシステイン"], ["카르보시스테인"], ["คาร์โบซิสเทอีน"]],
    ["acetylcysteine", ["acetylcysteine", "acetylcystein", "acetilcisteina", "asetilsistein", "n-acetylcysteine"], ["乙酰半胱氨酸"], ["アセチルシステイン"], ["아세틸시스테인"],
      ["อะเซทิลซิสเทอีน"]],
    ["loperamide", ["loperamide", "loperamida", "loperamid"], ["洛哌丁胺"], ["ロペラミド"], ["로페라미드"], ["โลเพอราไมด์"]],
    ["omeprazole", ["omeprazole", "omeprazol"], ["奥美拉唑", "奧美拉唑"], ["オメプラゾール"], ["오메프라졸"], ["โอเมพราโซล"]],
    ["esomeprazole", ["esomeprazole", "esomeprazol"], ["埃索美拉唑"], ["エソメプラゾール"], ["에소메프라졸"], ["เอโซเมพราโซล"]],
    ["lansoprazole", ["lansoprazole", "lansoprazol"], ["兰索拉唑"], ["ランソプラゾール"], ["란소프라졸"], ["แลนโซพราโซล"]],
    ["famotidine", ["famotidine", "famotidina", "famotidin"], ["法莫替丁"], ["ファモチジン"], ["파모티딘"], ["ฟาโมทิดีน"]],
    ["domperidone", ["domperidone", "domperidona", "domperidon"], ["多潘立酮"], ["ドンペリドン"], ["돔페리돈"], ["ดอมเพอริโดน"]],
    ["simeticone", ["simeticone", "simethicone", "simeticona", "simetikon"], ["西甲硅油", "二甲硅油"], ["ジメチコン"], ["시메티콘"], ["ไซเมทิโคน"]],
    ["bisacodyl", ["bisacodyl", "bisacodilo", "bisakodil"], ["比沙可啶"], ["ビサコジル"], ["비사코딜"], ["บิซาโคดิล"]],
    ["dimenhydrinate", ["dimenhydrinate", "dimenhidrinato", "dimenhidrinat"], ["茶苯海明"], ["ジメンヒドリナート"], ["디멘히드리네이트"], ["ไดเมนไฮดริเนต"]],
    ["meclozine", ["meclozine", "meclizine"], ["美克洛嗪"], ["メクリジン"], ["메클리진"], ["เมคลิซีน"]],
    ["amoxicillin", ["amoxicillin", "amoxycillin", "amoxicilina", "amoksisilin", "amoxicilline"], ["阿莫西林"], ["アモキシシリン"], ["아목시실린"], ["อะม็อกซีซิลลิน"]],
    ["azithromycin", ["azithromycin", "azitromicina", "azitromisin"], ["阿奇霉素"], ["アジスロマイシン"], ["아지트로마이신"], ["อะซิโทรมัยซิน"]],
    ["clarithromycin", ["clarithromycin", "claritromicina", "klaritromisin"], ["克拉霉素"], ["クラリスロマイシン"], ["클래리스로마이신"], ["คลาริโทรมัยซิน"]],
    ["ciprofloxacin", ["ciprofloxacin", "ciprofloxacino", "siprofloksasin"], ["环丙沙星"], ["シプロフロキサシン"], ["시프로플록사신"], ["ไซโปรฟล็อกซาซิน"]],
    ["metronidazole", ["metronidazole", "metronidazol"], ["甲硝唑"], ["メトロニダゾール"], ["메트로니다졸"], ["เมโทรนิดาโซล"]],
    ["clotrimazole", ["clotrimazole", "clotrimazol", "klotrimazol"], ["克霉唑", "克黴唑"], ["クロトリマゾール"], ["클로트리마졸"], ["โคลไตรมาโซล"]],
    ["miconazole", ["miconazole", "miconazol", "mikonazol"], ["咪康唑"], ["ミコナゾール"], ["미코나졸"], ["ไมโคนาโซล"]],
    ["terbinafine", ["terbinafine", "terbinafina", "terbinafin"], ["特比萘芬"], ["テルビナフィン"], ["테르비나핀"], ["เทอร์บินาฟีน"]],
    ["ketoconazole", ["ketoconazole", "ketoconazol", "ketokonazol"], ["酮康唑"], ["ケトコナゾール"], ["케토코나졸"], ["คีโตโคนาโซล"]],
    ["hydrocortisone", ["hydrocortisone", "hidrocortisona", "hidrokortison"], ["氢化可的松", "氫化可體松"], ["ヒドロコルチゾン"], ["히드로코르티손"], ["ไฮโดรคอร์ติโซน"]],
    ["betamethasone", ["betamethasone", "betametasona", "betametason"], ["倍他米松"], ["ベタメタゾン"], ["베타메타손"], ["เบตาเมทาโซน"]],
    ["dexamethasone", ["dexamethasone", "dexametasona", "deksametason"], ["地塞米松"], ["デキサメタゾン"], ["덱사메타손"], ["เดกซาเมทาโซน"]],
    ["prednisolone", ["prednisolone", "prednisolona", "prednisolon"], ["泼尼松龙", "潑尼松龍"], ["プレドニゾロン"], ["프레드니솔론"], ["เพรดนิโซโลน"]],
    ["aciclovir", ["aciclovir", "acyclovir", "asiklovir"], ["阿昔洛韦", "阿昔洛韋"], ["アシクロビル"], ["아시클로버"], ["อะไซโคลเวียร์"]],
    ["lidocaine", ["lidocaine", "lignocaine", "lidocaina", "lidokain"], ["利多卡因"], ["リドカイン"], ["리도카인"], ["ลิโดเคน"]],
    ["benzocaine", ["benzocaine", "benzocaina", "benzokain"], ["苯佐卡因"], ["ベンゾカイン"], ["벤조카인"], ["เบนโซเคน"]],
    ["naphazoline", ["naphazoline", "nafazolina", "nafazolin"], ["萘甲唑啉"], ["ナファゾリン"], ["나파졸린"], ["แนฟาโซลีน"]],
    ["tetryzoline", ["tetryzoline", "tetrahydrozoline", "tetrizolina"], ["四氢唑啉"], ["テトラヒドロゾリン"], ["테트라히드로졸린"], ["เตตระไฮโดรโซลีน"]],
    ["oxymetazoline", ["oxymetazoline", "oximetazolina", "oksimetazolin"], ["羟甲唑啉"], ["オキシメタゾリン"], ["옥시메타졸린"], ["ออกซีเมตาโซลีน"]],
    ["ketotifen", ["ketotifen", "ketotifeno"], ["酮替芬"], ["ケトチフェン"], ["케토티펜"], ["คีโตติเฟน"]],
    ["tranexamic acid", ["tranexamic acid", "acido tranexamico", "asam traneksamat", "acide tranexamique"], ["氨甲环酸", "傳明酸"], ["トラネキサム酸"], ["트라넥삼산"], ["กรดทราเนซามิก"]],
    ["caffeine", ["caffeine", "cafeina", "kafein", "coffein", "koffein", "cafeine"], ["咖啡因"], ["カフェイン"], ["카페인"], ["คาเฟอีน"]],
    ["minoxidil", ["minoxidil", "minoksidil"], ["米诺地尔", "米諾地爾"], ["ミノキシジル"], ["미녹시딜"], ["ไมนอกซิดิล"]],
    ["finasteride", ["finasteride", "finasterida", "finasterid"], ["非那雄胺"], ["フィナステリド"], ["피나스테리드"], ["ฟีนาสเตอไรด์"]],
    ["sildenafil", ["sildenafil"], ["西地那非"], ["シルデナフィル"], ["실데나필"], ["ซิลเดนาฟิล"]],
    ["tadalafil", ["tadalafil"], ["他达拉非"], ["タダラフィル"], ["타다라필"], ["ทาดาลาฟิล"]],
    ["sibutramine", ["sibutramine", "sibutramina", "sibutramin"], ["西布曲明"], ["シブトラミン"], ["시부트라민"], ["ไซบูทรามีน"]],
    ["salbutamol", ["salbutamol", "albuterol"], ["沙丁胺醇"], ["サルブタモール"], ["살부타몰"], ["ซัลบูทามอล"]],
    ["montelukast", ["montelukast"], ["孟鲁司特"], ["モンテルカスト"], ["몬테루카스트"], ["มอนเทลูคาสท์"]],
    ["metformin", ["metformin", "metformina"], ["二甲双胍"], ["メトホルミン"], ["메트포르민"], ["เมทฟอร์มิน"]],
    ["amlodipine", ["amlodipine", "amlodipino", "amlodipin"], ["氨氯地平"], ["アムロジピン"], ["암로디핀"], ["แอมโลดิปีน"]],
    ["losartan", ["losartan", "losartán"], ["氯沙坦"], ["ロサルタン"], ["로사르탄"], ["โลซาร์แทน"]],
    ["atorvastatin", ["atorvastatin", "atorvastatina"], ["阿托伐他汀"], ["アトルバスタチン"], ["아토르바스타틴"], ["อะทอร์วาสแตติน"]],
    ["simvastatin", ["simvastatin", "simvastatina"], ["辛伐他汀"], ["シンバスタチン"], ["심바스타틴"], ["ซิมวาสแตติน"]],
    ["oseltamivir", ["oseltamivir"], ["奥司他韦"], ["オセルタミビル"], ["오셀타미비르"], ["โอเซลทามิเวียร์"]],
    ["mebendazole", ["mebendazole", "mebendazol"], ["甲苯咪唑"], ["メベンダゾール"], ["메벤다졸"], ["มีเบนดาโซล"]],
    ["albendazole", ["albendazole", "albendazol"], ["阿苯达唑"], ["アルベンダゾール"], ["알벤다졸"], ["อัลเบนดาโซล"]],
    ["pyrantel", ["pyrantel", "pirantel"], ["噻嘧啶"], ["ピランテル"], ["피란텔"], ["ไพแรนเทล"]],
    ["permethrin", ["permethrin", "permetrina", "permetrin"], ["氯菊酯"], ["ペルメトリン"], ["퍼메트린"], ["เพอร์เมทริน"]],
    ["mupirocin", ["mupirocin", "mupirocina"], ["莫匹罗星"], ["ムピロシン"], ["무피로신"], ["มิวพิโรซิน"]],
    ["fusidic acid", ["fusidic acid", "acido fusidico", "asam fusidat"], ["夫西地酸"], ["フシジン酸"], ["푸시드산"], ["กรดฟิวซิดิก"]],
    // stream F (2026-11-13), P9 recall: names missed on the (now dev) P9 hold-out; LENSIQ's own table (names are facts)
    ["codeine", ["codeine", "codein", "codeina", "kodein", "kodeina", "codeinum"], ["可待因"], ["コデイン"], ["코데인"], ["โคเดอีน"]],
    ["dihydrocodeine", ["dihydrocodeine", "dihydrocodein", "diidrocodeina", "dihidrocodeina", "dihidrokodein"], ["双氢可待因", "雙氫可待因"], ["ジヒドロコデイン"], ["디히드로코데인"],
      ["ไดไฮโดรโคดีอีน"]],
    ["dexpanthenol", ["dexpanthenol", "dexpantenol", "dekspantenol", "dexpanthenolum"], ["右泛醇"], ["デクスパンテノール"], ["덱스판테놀"], ["เดกซ์แพนทีนอล"]],
    ["xylometazoline", ["xylometazoline", "xylometazolin", "xilometazolina", "ksilometazolin"], ["赛洛唑啉", "賽洛唑啉"], ["キシロメタゾリン"], ["자일로메타졸린"], ["ไซโลเมตาโซลีน"]],
    ["ketoprofen", ["ketoprofen", "ketoprofene", "ketoprofeno", "cetoprofeno", "kétoprofène"], ["酮洛芬"], ["ケトプロフェン"], ["케토프로펜"], ["คีโตโปรเฟน"]],
    ["amantadine", ["amantadine", "amantadin", "amantadina"], ["金刚烷胺", "金剛烷胺"], ["アマンタジン"], ["아만타딘"], ["อะแมนตาดีน"]],
    ["aluminium hydroxide", ["aluminium hydroxide", "aluminum hydroxide", "hidroxido de aluminio", "idrossido di alluminio", "hydroxyde d'aluminium", "aluminiumhydroxid",
      "aluminium hidroksida", "aluminum hidroksida", "nhom hydroxyd", "algeldrate"], ["氢氧化铝", "氫氧化鋁"], ["水酸化アルミニウム", "乾燥水酸化アルミニウムゲル"], ["수산화알루미늄"],
      ["อะลูมิเนียมไฮดรอกไซด์", "อลูมิเนียมไฮดรอกไซด์"]],
    ["magnesium hydroxide", ["magnesium hydroxide", "hidroxido de magnesio", "idrossido di magnesio", "hydroxyde de magnesium", "magnesiumhydroxid", "magnesium hidroksida",
      "magie hydroxyd"], ["氢氧化镁", "氫氧化鎂"], ["水酸化マグネシウム"], ["수산화마그네슘"], ["แมกนีเซียมไฮดรอกไซด์"]],
    ["metamizole", ["metamizole", "metamizol", "dipyrone", "dipirona", "novaminsulfon", "metamizolo", "metamizolum"], ["安乃近"], ["メタミゾール"], ["메타미졸"], ["เมทามิโซล"]],
    ["nimesulide", ["nimesulide", "nimesulida", "nimesulid"], ["尼美舒利"], ["ニメスリド"], ["니메술리드"], ["ไนมีซูไลด์"]],
    ["diosmectite", ["diosmectite", "diosmectita", "diosmektit", "dioctahedral smectite"], ["蒙脱石"], ["ジオスメクタイト"], ["디오스멕타이트"], ["ไดออสเมคไทต์"]],
    ["berberine", ["berberine", "berberin", "berberina"], ["小檗碱", "小蘗鹼", "黄连素", "黃連素"], ["ベルベリン"], ["베르베린"], ["เบอร์เบอรีน"]],
    ["trimebutine", ["trimebutine", "trimebutina", "trimebutin"], ["曲美布汀"], ["トリメブチン"], ["트리메부틴"], ["ไตรมีบูทีน"]],
    ["phloroglucinol", ["phloroglucinol", "floroglucinol", "phloroglucinolum"], ["间苯三酚", "間苯三酚"], ["フロログルシノール"], ["플로로글루시놀"], ["ฟลอโรกลูซินอล"]],
    ["dexibuprofen", ["dexibuprofen", "dexibuprofeno"], ["右布洛芬"], ["デキシブプロフェン"], ["덱시부프로펜"], ["เดกซ์ไอบูโพรเฟน"]],
    ["methylephedrine", ["methylephedrine", "dl-methylephedrine", "metilefedrina"], ["甲基麻黄碱", "甲基麻黃鹼"], ["メチルエフェドリン", "dl-メチルエフェドリン"], ["메틸에페드린"],
      ["เมทิลอีเฟดรีน"]],
    ["ethenzamide", ["ethenzamide", "etenzamida"], ["乙水杨胺"], ["エテンザミド"], ["에텐자미드"], ["เอเทนซาไมด์"]],
    ["allylisopropylacetylurea", ["allylisopropylacetylurea"], ["烯丙异丙乙酰脲"], ["アリルイソプロピルアセチル尿素"], ["알릴이소프로필아세틸요소"], []],
    ["hydrotalcite", ["hydrotalcite", "hidrotalcita", "idrotalcite", "hydrotalcit"], ["铝碳酸镁", "鋁碳酸鎂"], ["ヒドロタルサイト"], ["히드로탈시트"], ["ไฮโดรทัลไซต์"]],
    ["almagate", ["almagate", "almagato"], [], ["アルマゲート"], ["알마게이트"], []],
    ["orphenadrine", ["orphenadrine", "orphenadrin", "orfenadrina"], ["奥芬那君"], ["オルフェナドリン"], ["오르페나드린"], ["ออร์เฟนาดรีน"]],
    ["clavulanic acid", ["clavulanic acid", "clavulanate", "acido clavulanico", "acide clavulanique", "asam klavulanat", "clavulansaure"], ["克拉维酸"], ["クラブラン酸"], ["클라불란산"],
      ["กรดคลาวูลานิก"]]
  ];
  /** Names that are also everyday food / cosmetic words: found only when the text also reads like a medicine label. */
  const WEAK = new Set(["caffeine", "tranexamic acid", "dexpanthenol"]);
  /** Alias spellings added to existing rows (stream F, P9 recall: German / Portuguese / Malay / Thai / Chinese forms). */
  const MORE_ALIAS = /** @type {Record<string, string[]>} */ ({
    dimenhydrinate: ["dimenhydrinat", "dimenidrinato", "dimenhydrinatum", "ไดเมนไฮดริเนท"], chlorphenamine: ["chlorphenamin", "klorfeniramina", "clorfenamina", "chlorpheniraminum"],
    phenylephrine: ["phenylephrin"], dextromethorphan: ["เด็กซ์โตรเมทอร์แฟน", "เดกซ์โตรเมทอร์แฟน", "dextromethorphanum"], simeticone: ["二甲基矽油", "二甲基硅油", "simeticon"],
    cetirizine: ["cetirizinum"], ibuprofen: ["ibuprofenum"], loratadine: ["loratadinum"], xylometazoline: ["xylometazolinum"]
  });

  /* ---------------- normalisation ---------------- */
  const SALT = new Set(["hydrochloride", "dihydrochloride", "hcl", "hbr", "hydrobromide", "maleate", "hydrogen maleate", "sodium", "potassium", "calcium", "magnesium",
    "citrate", "sulfate", "sulphate", "phosphate", "besilate", "besylate", "mesilate", "mesylate", "tartrate", "bitartrate", "fumarate", "succinate", "acetate",
    "trihydrate", "dihydrate", "monohydrate", "hemihydrate", "sesquihydrate", "hydrate", "hyclate", "nitrate", "lactate", "anhydrous", "hfa", "usp", "bp", "ep"]);
  /** Lower case, accents dropped, "HCl" and the like split off, spaces collapsed. @param {any} s */
  const fold = s => String(s == null ? "" : s).normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim();
  /** Salt / hydrate / grade words at the end (or start) of a Latin name dropped: "naproxen sodium" -> "naproxen". @param {any} name */
  function saltStrip(name) {
    let w = fold(name).replace(/\(.*?\)/g, " ").replace(/[,;:]/g, " ").split(/\s+/).filter(Boolean);
    while (w.length > 1 && SALT.has(w[w.length - 1])) w = w.slice(0, -1);
    // a leading metal word stays ("calcium carbonate" is not "carbonate"; independent review 2026-11-11)
    return w.join(" ");
  }
  const LATIN = /[a-z]/;
  const isLatinAlias = s => /^[a-z0-9 \-.']+$/.test(s);

  /** Words that may stand in the TMT ingredient list but are food, cosmetic or excipient words on a label. */
  const TMT_STOP = new Set(["water", "sugar", "sucrose", "glucose", "dextrose", "fructose", "lactose", "maltose", "sorbitol", "mannitol", "xylitol", "glycerol", "glycerin",
    "glycerine", "starch", "gelatin", "gelatine", "cellulose", "ethanol", "alcohol", "ethyl alcohol", "isopropyl alcohol", "menthol", "levomenthol", "camphor", "eucalyptus",
    "eucalyptus oil", "peppermint oil", "honey", "sodium chloride", "potassium chloride", "calcium carbonate", "magnesium stearate", "zinc oxide", "titanium dioxide",
    "ascorbic acid", "nicotinamide", "niacinamide", "tocopherol", "retinol", "panthenol", "dexpanthenol", "allantoin", "hyaluronic acid", "sodium hyaluronate", "taurine",
    "collagen", "lecithin", "fish oil", "cod liver oil", "charcoal", "activated charcoal", "talc", "kaolin", "lanolin", "paraffin", "liquid paraffin", "white soft paraffin",
    "petrolatum", "aloe vera", "ginseng", "ginkgo", "oxygen", "nitrogen", "syrup", "carbomer", "dimeticone", "dimethicone", "salicylic acid", "urea", "biotin", "inositol",
    "glucosamine", "chondroitin", "cholecalciferol", "ergocalciferol", "folic acid", "thiamine", "riboflavin", "pyridoxine", "cyanocobalamin", "zinc", "iron", "calcium",
    "magnesium", "selenium", "potassium", "sodium", "oats", "omega", "cocoa butter", "butter", "sunflower oil", "olive oil", "coconut oil", "sesame oil", "soybean oil",
    "beeswax", "vaseline", "citric acid", "lactic acid", "acetic acid", "benzoic acid", "sorbic acid", "boric acid", "borax", "phenol", "simple syrup", "flavour", "flavor",
    // ion / element words on their own are never shown as an INN (independent review 2026-11-11: "carbonate", "aluminium")
    "carbonate", "hydroxide", "bicarbonate", "chloride", "oxide", "aluminium", "aluminum", "silicate", "trisilicate", "phosphate", "sulfate", "citrate"]);
  /** The text reads like a medicine label (a WEAK or a TMT-only name counts only then). */
  const MEDCUE = new RegExp(["\\bactive ingredients?\\b", "\\beach (?:tablet|caplet|capsule|softgel|ml|5 ml)\\b",
    "\\b(?:tablets?|caplets?|capsules?|softgels?|lozenges?|ointment|inhaler|suppositor\\w*|injection|eye drops|nasal spray)\\b",
    "\\brx only\\b", "prescription", "\\bwirkstoff", "substance active", "principio activo", "thanh phan", "komposisi", "mengandung", "成份", "【成分】", "医薬品", "医药", "藥", "药", "薬",
    "錠", "胶囊", "膠囊", "의약품", "유효성분", "정\\b", "\\bndc\\b", "\\bdin\\b", "国药准字", "ทะเบียนยา", "ยาเม็ด",
    // stream F: tablet / capsule / ointment words in more languages, Chinese "each tablet contains"
    "\\b(?:film)?tabletten\\b", "\\bdragees?\\b", "\\bkapseln\\b", "\\bsalbe\\b", "\\bcompresse\\b", "\\bcomprim(?:e|es|idos?)\\b", "\\btabletas?\\b", "\\bcapsulas?\\b",
    "\\bgranulato\\b", "\\bsirop\\b", "\\bjarabe\\b", "\\bxarope\\b", "\\bvien (?:nen|nang|sui)\\b", "\\bkapsul\\b", "每片", "每粒", "每包", "每袋", "每錠", "片剂", "片劑"].join("|"), "i");

  /**
   * Index of every name -> INN, longest first. tmtIngredients = the TMT 2020 ingredient strings (vendor/pc-drugs/tmt/meta.json
   * "ing"; "a + b" combinations are split): Latin names only, length >= 6, minus TMT_STOP, minus names the hand table has.
   * @param {string[]} [tmtIngredients]
   */
  function buildInnIndex(tmtIngredients) {
    /** @type {Array<{alias: string, inn: string, via: string, latin: boolean}>} */ const list = [];
    const exact = new Map();
    const add = (/** @type {string} */ alias, /** @type {string} */ inn, /** @type {string} */ via) => {
      const a = fold(alias);
      if (!a || exact.has(a)) return;
      exact.set(a, inn);
      list.push({ alias: a, inn, via, latin: isLatinAlias(a) });
    };
    for (const [inn, lat, zh, ja, ko, th] of INN_TABLE) for (const a of [inn, ...lat, ...zh, ...ja, ...ko, ...th, ...(MORE_ALIAS[inn] || [])]) add(a, inn, "synonym");
    for (const s of tmtIngredients || []) {
      for (const part of String(s).split(/\s*\+\s*/)) {
        const b = saltStrip(part);
        if (b.length < 6 || !/^[a-z][a-z \-]*[a-z]$/.test(b) || b.split(" ").length > 3 || TMT_STOP.has(b) || exact.has(b)) continue;
        add(b, b, "tmt");
      }
    }
    list.sort((a, b) => b.alias.length - a.alias.length || (a.alias < b.alias ? -1 : 1));
    return { list, exact };
  }
  /** @type {any} */ let BASE = null;
  const baseIndex = () => (BASE = BASE || buildInnIndex());

  /** OCR look-alikes folded, one character for one (offsets kept): 0 -> o next to a letter, i / l / 1 / | / ı -> l. @param {string} s folded text */
  const ocrSkeleton = s => s.replace(/0(?=[a-z])|(?<=[a-z])0/g, "o").replace(/[il1|ı]/g, "l");
  /** Salt words written into a German / Dutch name (the INN stays a word of its own). */
  const GLUED_SALT = /^(?:di)?(?:hydrochlorid|hydrobromid|maleat|hydrogenmaleat|natrium|kalium|citrat|sulfat|phosphat|mesilat|besilat|tartrat|fumarat|acetat|nitrat|monohydrat)(?![a-z])/;
  /** The folded text with a map back to the original character offsets. @param {string} text */
  function folded(text) {
    let out = "";
    /** @type {number[]} */ const at = [];
    const chars = [...String(text || "")];
    let pos = 0;
    for (const c of chars) {
      const f = c.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[‐-―−]/g, "-");
      for (const x of f) { out += x; at.push(pos); }
      pos += c.length;
    }
    at.push(pos);
    return { out, at };
  }
  const STRENGTH = /^(?:\s*(?:\(as [^)]{1,30}\)|[a-zA-ZÀ-ɏ.-]{1,20}|[^\d\n]{0,1}[぀-ヿ一-鿿가-힯]{1,10}))*?\s*[:：]?\s*(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|μg|g|ml|iu|%|毫克|克|밀리그램|มก\.?|มิลลิกรัม)(?![a-z])/i;
  /** Strength printed right after a name ("500 mg", "0.5克"), as printed (no conversion). @param {string} text @param {number} end */
  function strengthAfter(text, end) {
    const tail = text.slice(end, end + 48).split("\n")[0];
    const m = STRENGTH.exec(tail);
    return m ? `${m[1]} ${m[2]}`.replace(/\s+/g, " ").trim() : "";
  }

  /**
   * INNs printed in the text, in order of appearance, one entry per INN. Longest name first and every match consumes its
   * characters (levocetirizine is never also cetirizine). Latin names need word edges; CJK / Korean / Thai names are
   * matched inside words (salts are written into the word there). A WEAK or TMT-only name needs MEDCUE in the text.
   * @param {any} text @param {any} [idx]
   */
  function extractInn(text, idx) {
    const I = idx || baseIndex();
    const src = String(text || "");
    if (!src.trim()) return [];
    const { out, at } = folded(src);
    const med = MEDCUE.test(out) || MEDCUE.test(src);
    // 薬用 = a Japanese quasi-drug cosmetic: not a medicine cue for a WEAK name (independent review 2026-11-11: tranexamic acid cream)
    const medWeak = med && !(/薬用/.test(src) && !/医薬品/.test(src));
    const used = new Uint8Array(out.length);
    /** @type {Array<{inn: string, matched: string, via: string, strength: string, start: number}>} */ const hits = [];
    // pass 1: the folded text as read. pass 2 (stream F, 2026-11-13): OCR look-alikes folded on both sides (0 -> o inside or
    // before letters, i / l / 1 / | -> one letter), Latin names of 7+ letters only, on characters no pass-1 name took.
    const skel = ocrSkeleton(out);
    for (const pass of [1, 2]) {
      const hay = pass === 1 ? out : skel;
      for (const e of I.list) {
        if ((e.via === "tmt" && !med) || (WEAK.has(e.inn) && !medWeak)) continue;
        if (pass === 2 && (!e.latin || e.alias.length < 7)) continue;
        const needle = pass === 1 ? e.alias : ocrSkeleton(e.alias);
        let from = 0;
        for (;;) {
          const i = hay.indexOf(needle, from);
          if (i < 0) break;
          from = i + 1;
          const j = i + needle.length;
          // a German salt written into the word ("Xylometazolinhydrochlorid", "Chlorphenaminmaleat") is still a word edge
          const glued = j < out.length && GLUED_SALT.test(out.slice(j, j + 20));
          if (e.latin && ((i > 0 && LATIN.test(out[i - 1])) || (j < out.length && LATIN.test(out[j]) && !glued))) continue;
          let free = true;
          for (let k = i; k < j; k++) if (used[k]) { free = false; break; }
          if (!free) continue;
          used.fill(1, i, j);
          const s0 = at[i], s1 = at[j];
          hits.push({ inn: e.inn, matched: src.slice(s0, s1), via: e.via, strength: strengthAfter(src, s1), start: s0 });
        }
      }
    }
    hits.sort((a, b) => a.start - b.start);
    const seen = new Set();
    return hits.filter(h => (seen.has(h.inn) ? false : (seen.add(h.inn), true)));
  }

  /**
   * The label may hold more ingredients than were found (independent review 2026-11-11: paracetamol + codeine showed only
   * paracetamol): more printed MASS strengths ("500 mg", "0.5 g", "9.5 毫克") than INNs found, or none found at all.
   * Conservative: a second strength of the same ingredient also counts. @param {any} text @param {number} found
   */
  function maybeIncomplete(text, found) {
    const n = (String(text || "").normalize("NFKC").match(/\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|μg|g|毫克|克|밀리그램|มก\.?|มิลลิกรัม)(?![a-z])/gi) || []).length;
    return found === 0 || n > found;
  }
  /** One name (as printed, or an INN the AI gave) -> INN, or null. @param {any} name @param {any} [idx] */
  function resolveInn(name, idx) {
    const I = idx || baseIndex();
    const n = fold(name);
    if (!n) return null;
    for (const k of [n, saltStrip(n)]) if (I.exact.has(k)) return I.exact.get(k);
    // a name with salt words written into it ("マレイン酸クロルフェニラミン", "ロキソプロフェンナトリウム水和物"): exactly one INN inside
    // (a WEAK or TMT-only name standing alone has no medicine cue, so it resolves only as a whole name, above)
    const all = new Set(extractInn(String(name), I).map(x => x.inn));
    return all.size === 1 ? [...all][0] : null;
  }
  /** Whole-name resolution only (no search inside the name): esters stay apart ("betamethasone valerate"). @param {any} name */
  function resolveExact(name) {
    const I = baseIndex(), n = fold(name);
    for (const k of [n, saltStrip(n)]) if (I.exact.has(k)) return I.exact.get(k);
    return null;
  }

  /**
   * The AI's active_ingredients (pc_fields) -> accepted only when an INN resolves on this device (design §7). The INN shown is
   * ours, never the model's string. A model INN that resolves to another INN than the name on the pack is a conflict: rejected.
   * @param {any} list @param {any} [idx]
   */
  function acceptAi(list, idx) {
    /** @type {any[]} */ const accepted = [], rejected = [];
    for (const x of Array.isArray(list) ? list.slice(0, 12) : []) {
      if (!x || typeof x !== "object") continue;
      const byName = resolveInn(x.name_on_pack, idx), byInn = resolveInn(x.inn, idx);
      const row = { name_on_pack: String(x.name_on_pack || ""), model_inn: x.inn == null ? null : String(x.inn), strength: [x.strength, x.unit].filter(v => v != null && v !== "").join(" ") };
      if ((byName || byInn) && !(byName && byInn && byName !== byInn)) accepted.push({ ...row, inn: byName || byInn, check: byName ? "name" : "inn-only" });
      else rejected.push({ ...row, reason: byName && byInn ? "conflict" : "unresolved" });
    }
    return { accepted, rejected };
  }

  /* ---------------- translated lines: dosing / warning ---------------- */
  const alt = (/** @type {string[]} */ a, /** @type {string} */ pre = "") => new RegExp(pre + "(?:" + a.join("|") + ")", "i");
  const DOSE_HEAD = alt(["用法", "用量", "服用方法", "使用方法", "用法・用量", "用法及用量", "용법", "용량", "복용법", "directions\\b", "dosage\\b", "dose\\b", "how to (?:take|use)\\b",
    "posologie", "dosierung", "posología", "cara (?:pakai|penggunaan)", "aturan pakai", "liều dùng", "cách dùng", "วิธีใช้", "ขนาดและวิธีใช้", "ขนาดยา", "ขนาดที่ใช้", "ขนาดรับประทาน"],
  "^[\\s【\\[(（「]*");
  const WARN_HEAD = alt(["警告", "注意", "禁忌", "慎用", "禁用", "不良反应", "不良反應", "副作用", "使用上の注意", "してはいけないこと", "相談すること", "경고", "주의", "금기", "부작용",
    "warnings?\\b", "caution\\b", "precautions?\\b", "contraindications?\\b", "side effects?\\b", "do not use\\b", "stop use\\b", "ask a (?:doctor|pharmacist)\\b", "avertissement",
    "warnhinweis", "advertencia", "peringatan", "cảnh báo", "คำเตือน", "ข้อควรระวัง", "ข้อห้ามใช้", "ห้ามใช้", "อาการไม่พึงประสงค์"], "^[\\s【\\[(（「]*");
  const DOSE_BODY = alt(["\\btake\\s+(?:\\d|one|two|three|1|2)\\b",
    "\\b\\d+\\s*(?:-|to|or)?\\s*\\d*\\s*(?:tablets?|caplets?|capsules?|softgels?|ml|drops?|puffs?|sprays?)\\s+(?:every|a day|daily|per day|once|twice|three times|each)",
    "\\b(?:once|twice|three times|\\d+\\s*times)\\s+(?:a|per|each)\\s+day\\b", "\\bevery\\s+\\d+(?:\\s*(?:to|-)\\s*\\d+)?\\s*hours?\\b", "每次\\s*\\d", "每日\\s*\\d", "一日\\s*\\d", "一次\\s*\\d",
    "1日\\s*\\d", "１日\\s*[\\d１-９]", "[1-9１-９一二三]回\\s*[\\d１-９一二三]", "\\d\\s*회\\s*\\d", "1일\\s*\\d", "ครั้งละ\\s*\\d", "วันละ\\s*\\d", "ครั้งละ\\s*(?:หนึ่ง|สอง)",
    "\\b\\d+\\s*(?:tablets?|tablet)\\s+daily\\b", "\\bdaily\\b.*\\btablet"]);
  const WARN_BODY = alt(["keep out of reach", "do not (?:use|take|exceed|give)", "ask a (?:doctor|pharmacist)", "stop use", "if pregnant", "pregnan", "breast-?feeding", "allerg",
    "liver warning", "side effects?", "drowsiness", "孕妇", "孕婦", "慎用", "禁用", "过敏", "過敏", "妊娠", "授乳", "임부", "임산부", "ห้าม", "ตั้งครรภ์", "แพ้ยา", "เด็กเล็ก"]);
  /** @param {any} line */
  function classifyLine(line) {
    const t = String(line || "").normalize("NFKC").trim();
    if (!t) return "other";
    if (DOSE_HEAD.test(t)) return "dose";
    if (WARN_HEAD.test(t)) return "warning";
    if (DOSE_BODY.test(t)) return "dose";
    if (WARN_BODY.test(t)) return "warning";
    return "other";
  }
  /** A translated label line: the original or the translation may show it. @param {any} source @param {any} translation */
  function classifyPair(source, translation) {
    const k = [classifyLine(source), classifyLine(translation)];
    return k.includes("dose") ? "dose" : k.includes("warning") ? "warning" : "other";
  }

  /* ---------------- country of origin + coverage (§4.7) ---------------- */
  const EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
  const NAMES = {
    US: ["usa", "u.s.a.", "u.s.a", "united states", "united states of america", "america"], JP: ["japan", "nhat ban"],
    CN: ["china", "p.r. china", "p.r.china", "people's republic of china", "prc", "trung quoc"],
    KR: ["korea", "south korea", "republic of korea", "han quoc"], TW: ["taiwan"], HK: ["hong kong"], MY: ["malaysia"], SG: ["singapore"], VN: ["vietnam", "viet nam"],
    ID: ["indonesia"], PH: ["philippines", "the philippines"], IN: ["india"], PK: ["pakistan"], BD: ["bangladesh"], LK: ["sri lanka"], CA: ["canada"], AU: ["australia"],
    NZ: ["new zealand"], GB: ["united kingdom", "uk", "u.k.", "england", "great britain", "scotland", "wales"], DE: ["germany", "deutschland", "allemagne"],
    FR: ["france"], ES: ["spain", "espana"], IT: ["italy", "italia"], IE: ["ireland"], BE: ["belgium", "belgique"], NL: ["netherlands", "the netherlands", "holland"],
    CH: ["switzerland", "schweiz", "suisse"], SE: ["sweden"], NO: ["norway"], AT: ["austria", "osterreich"], DK: ["denmark"], FI: ["finland"], PT: ["portugal"],
    PL: ["poland"], EG: ["egypt"], TR: ["turkey", "turkiye"], MX: ["mexico"], BR: ["brazil", "brasil", "brasileira"], IL: ["israel"], ZA: ["south africa"], KH: ["cambodia"],
    LA: ["laos", "lao pdr"], MM: ["myanmar"], TH: ["thailand"],
    // stream F (P9 recall): more origin names as printed
    AR: ["argentina"], MA: ["morocco", "maroc"], CL: ["chile"], CO: ["colombia"], PE: ["peru"], RU: ["russia"], SA: ["saudi arabia"], AE: ["united arab emirates", "uae"]
  };
  /** OCR fixes on a folded line before reading a country: "madein", "made in lndia" (l for i before a country name). @param {string} l */
  const originFix = l => l.replace(/\bmadein\b/g, "made in").replace(/(?<![a-z])l(?=ndia|ndonesia|taly|reland|srael)/g, "i");
  /** @type {Array<[RegExp, string]>} CJK / Korean / Thai origin wording -> country */
  const LOCAL = [
    [/日本製|日本製造|日本国内製造|原産国[：:]\s*日本|生産国[：:]\s*日本|製造国[：:]\s*日本|ประเทศญี่ปุ่น/, "JP"], [/中国制造|中國製造|中国製造|原产国[：:]\s*中国|产地[：:]\s*中国|（中国）|\(中国\)|ประเทศจีน/, "CN"],
    [/대한민국|한국\s*제조|제조국[：:]\s*한국|원산지[：:]\s*한국|原产国[：:]\s*韩国|原產國[：:]\s*韓國|韓国製|韓國製造|ประเทศเกาหลี/, "KR"],
    [/台灣製造|臺灣製造|台湾制造|台湾製|原產地[：:]\s*台灣|衛署藥製字|衛部藥製字|衛署成製字/, "TW"], [/香港製造|香港制造/, "HK"], [/原产国[：:]\s*美国|美國製造/, "US"],
    [/原产国[：:]\s*德国/, "DE"], [/原产国[：:]\s*法国/, "FR"], [/原产国[：:]\s*澳大利亚/, "AU"]
  ];
  const ORIGIN_CUE = alt(["made", "manufactured", "produced", "packed", "product", "products", "produce", "produit", "hergestellt", "fabrique", "fabricado", "prodotto",
    "san xuat", "dibuat", "diproduksi", "origin", "imported from", "distributed by",
    // stream F (P9 recall): "Mfd. in", "Dikilangkan di", "Buatan", "Diperbuat di", "Hecho en", "Elaborado en", "Industria Argentina", "Fabbricato in"
    "mfd", "mfg", "dikilangkan", "buatan", "diperbuat", "hecho", "elaborado", "industria", "fabbricato", "geproduceerd"]);
  const ORIGIN_RE = new RegExp(ORIGIN_CUE.source + "\\b[^\\n]{0,40}$", "i"); // the cue word, then at most 40 characters up to the country
  const SIMPLIFIED = /[药国产盐维剂应乐选广东质钠钙铁锌复颗粒胶囊颗为释贮说书]/;
  const KANA = /[぀-ヿ]/, HANGUL = /[가-힯]/, THAI = /[฀-๿]/;
  const REG_COUNTRY = { MY: "MY", SG: "SG", CA: "CA", US: "US", CN: "CN", EU: "", AU: "AU" };
  /**
   * Countries printed (or shown by a registration-number shape) on the pack, Thailand left out (home market). Script is a
   * last resort: kana -> Japan, hangul -> Korea, simplified Chinese -> China.
   * @param {any} text @param {(t: string) => any[]} [findReg]
   */
  function countriesOf(text, findReg) {
    const src = String(text || "");
    /** @type {Map<string, string>} */ const found = new Map();
    const put = (/** @type {string} */ c, /** @type {string} */ via) => { if (c && c !== "TH" && !found.has(c)) found.set(c, via); };
    for (const [re, c] of LOCAL) if (re.test(src)) put(c, "printed");
    const lines = src.split(/\n/).map(l => originFix(fold(l)));
    for (const [code, names] of Object.entries(NAMES)) {
      for (const n of names) {
        const re = new RegExp(`(^|[^a-z.])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`, "g");
        for (const l of lines) {
          let m;
          re.lastIndex = 0;
          while ((m = re.exec(l))) {
            const at = m.index + m[1].length, before = l.slice(0, at), after = l.slice(at + n.length);
            const alone = !before.replace(/[\s,;:\-–—()（）]/g, "") || /,\s*$/.test(before);
            const last = !after.replace(/[\s.,;:)）]/g, "") || /^[\s,]*(?:[a-z]{2,6}\d|sin\d|mal\d|aust\b|din\b)/.test(after);
            if (ORIGIN_RE.test(before) || (alone && last) || (/,\s*$/.test(before) && last)) put(code, "printed");
          }
        }
      }
    }
    const reg = findReg || (LQPC && LQPC.findRegNumbers);
    if (reg) for (const r of reg(src) || []) put(REG_COUNTRY[r.country] || "", "reg");
    if (!found.size) {
      if (KANA.test(src)) put("JP", "script");
      else if (HANGUL.test(src)) put("KR", "script");
      else if (SIMPLIFIED.test(src) && !THAI.test(src)) put("CN", "script");
    }
    return [...found].map(([country, via]) => ({ country, via }));
  }
  /** Official sources the card can check per country (what is wired today: lensiq-pc-lookup.js planLookups + backend/src/pc.js). */
  // ids of lensiq-pc-lookup.js / backend/src/pc.js sources ("rapex" = EU Safety Gate, formerly RAPEX); display names: SOURCE_NAME
  const COVERAGE = {
    US: { level: "covered", sources: ["openfda", "dailymed", "rxnav"] },
    CA: { level: "covered", sources: ["dpd", "healthcanada"] },
    SG: { level: "covered", sources: ["hsa"] },
    EU: { level: "partial", sources: ["rapex", "rasff"] }
  };
  /** Proper names of the sources (not translated). */
  const SOURCE_NAME = { openfda: "openFDA", dailymed: "DailyMed", rxnav: "RxNorm", dpd: "Health Canada Drug Product Database", healthcanada: "Health Canada recalls",
    hsa: "Singapore HSA", rapex: "EU Safety Gate", rasff: "EU RASFF" };
  // the agency's own site where the USER can check (links only, nothing is fetched). LQPC.VERIFY first (checked 2026-11-09);
  // added 2026-11-11 (HTTP 200 from the test machine: drugoffice.gov.hk, products.mhra.gov.uk, cekbpom.pom.go.id,
  // verification.fda.gov.ph; fda.gov.tw, dav.gov.vn and cdsco.gov.in timed out from it: they are the agencies' own domains)
  const MORE = {
    TW: [{ id: "tfda", url: "https://www.fda.gov.tw/" }], HK: [{ id: "hkdo", url: "https://www.drugoffice.gov.hk/" }], GB: [{ id: "mhra", url: "https://products.mhra.gov.uk/" }],
    VN: [{ id: "dav", url: "https://dav.gov.vn/" }], ID: [{ id: "bpom", url: "https://cekbpom.pom.go.id/" }], PH: [{ id: "phfda", url: "https://verification.fda.gov.ph/" }],
    IN: [{ id: "cdsco", url: "https://cdsco.gov.in/" }]
  };
  const WHO = [{ id: "who", url: "https://www.who.int/teams/regulation-prequalification/incidents-and-SF/full-list-of-who-medical-product-alerts" }];
  /** @param {any} code */
  function coverageFor(code) {
    const c = String(code || "").toUpperCase();
    const V = (LQPC && LQPC.VERIFY) || {};
    const own = (V[c] || MORE[c] || (EU.includes(c) ? V.EU : null) || []).filter((/** @type {any} */ l) => /^https:\/\//.test(l.url));
    const cov = COVERAGE[c] || (EU.includes(c) ? COVERAGE.EU : null);
    if (cov) return { country: c, level: cov.level, sources: cov.sources.slice(), links: own.slice() };
    return { country: c, level: "none", sources: [], links: own.length ? own.slice() : WHO.slice() };
  }
  /** @param {any} text @param {Array<{country: string}>} [countries] */
  function isForeign(text, countries) {
    const t = String(text || "");
    if (!t.trim()) return false;
    const cs = countries || countriesOf(t);
    if (cs.some(c => c.country !== "TH" && c.country)) return true;
    return !THAI.test(t) && (t.match(/[A-Za-z぀-ヿ一-鿿가-힯]/g) || []).length >= 4;
  }

  /* ---------------- Thai equivalents (owner's switch; TMT 2020, CC BY) ---------------- */
  /** STRICT: only `true` switches it on (a string or 1 from a stray setting does not). @param {any} W */
  const thaiEquivAllowed = W => !!W && W.LENSIQ_PC_THAI_EQUIV === true;
  /** Ingredient set -> key: each name resolved on the hand table, else its salt-stripped name; sorted, joined by "+". @param {any[]} names */
  function ingSetKey(names) {
    const out = new Set();
    for (const n of names || []) {
      const s = String(n == null ? "" : n);
      if (!s.trim()) continue;
      out.add(resolveExact(s) || saltStrip(s));
    }
    return [...out].filter(Boolean).sort().join("+");
  }
  /** Shard file name of a key: the first two characters as hex code points (as lensiq-pc-lookup.js). @param {string} key */
  const shardOf = key => [...String(key)].slice(0, 2).map(c => /** @type {number} */ (c.codePointAt(0)).toString(16)).join("-") || "00";
  const SHARD_SCHEMA = "lensiq-pc-tmt-ing/1";
  /**
   * Build time (tools/pc-tmt-ing-build.mjs; the unit test compares the committed files with this): TMT products grouped by
   * their exact active-ingredient set. Rows keep trade name, strength and dose form only (no maker, no codes).
   * @param {any} tmt vendor/pc-drugs/tmt-2563.json
   */
  function ingFiles(tmt) {
    /** @type {Map<string, Map<string, any[]>>} */ const shards = new Map();
    const keyOf = new Map();
    let n = 0;
    for (const row of tmt.p) {
      const ing = tmt.ing[row[1]];
      if (!keyOf.has(row[1])) keyOf.set(row[1], ingSetKey(String(ing).split(/\s*\+\s*/)));
      const key = keyOf.get(row[1]);
      if (!key) continue;
      const sh = shardOf(key);
      if (!shards.has(sh)) shards.set(sh, new Map());
      const m = /** @type {Map<string, any[]>} */ (shards.get(sh));
      if (!m.has(key)) m.set(key, []);
      const list = /** @type {any[]} */ (m.get(key));
      const r = [String(row[0]), String(row[2] || ""), row[3]];
      if (!list.some(x => x[0] === r[0] && x[1] === r[1] && x[2] === r[2])) { list.push(r); n++; }
    }
    const names = [...shards.keys()].sort();
    const meta = {
      schema: SHARD_SCHEMA, source: tmt.source, credit: tmt.credit,
      note: "Derived from TMT 2020-02-17 (CC BY): Thai products grouped by their exact active-ingredient set (salts and spelling variants merged). " +
        "A list, not a register and not a recommendation: products registered after the release date are missing, and Thai FDA registration status is not in TMT.",
      form: tmt.form, shards: names, products: n
    };
    /** @type {Record<string, string>} */ const files = { "meta.json": JSON.stringify(meta) + "\n" };
    for (const name of names) {
      const m = /** @type {Map<string, any[]>} */ (shards.get(name));
      const obj = {};
      for (const k of [...m.keys()].sort()) obj[k] = /** @type {any[]} */ (m.get(k)).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
      files[name + ".json"] = JSON.stringify(obj) + "\n";
    }
    return files;
  }
  /** "500 mg" / "0.5 g" / "500MG" -> one comparison key (g -> mg only for comparing; the page shows what is printed). @param {any} s */
  function normStrength(s) {
    const t = String(s || "").normalize("NFKC").toLowerCase().replace(/毫克|밀리그램|มก\.?|มิลลิกรัม/g, "mg").replace(/克/g, "g").replace(/\s+/g, "").replace(/,/g, ".");
    const m = /^(\d+(?:\.\d+)?)(mg|g|mcg|µg|μg|ml|%|iu)(.*)$/.exec(t);
    if (!m) return t;
    const v = m[2] === "g" ? +m[1] * 1000 : +m[1], u = m[2] === "g" ? "mg" : m[2] === "µg" || m[2] === "μg" ? "mcg" : m[2];
    return `${+v.toFixed(4)}${u}${m[3]}`;
  }
  /**
   * The list for one ingredient set. rows: trade name, strength, dose form, same = the strength printed on the label.
   * @param {string} key @param {any} shard @param {any} meta @param {{strength?: string, max?: number}} [o]
   */
  function equivalents(key, shard, meta, o = {}) {
    const all = (shard && Object.hasOwn(shard, key) ? shard[key] : []) || [];
    const want = o.strength ? normStrength(o.strength) : "";
    const rows = all.map((/** @type {any[]} */ r) => ({ name: String(r[0]), strength: String(r[1]), form: String((meta && meta.form && meta.form[r[2]]) || ""),
      same: !!want && normStrength(r[1]) === want }));
    rows.sort((a, b) => Number(b.same) - Number(a.same) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return { key, total: rows.length, rows: rows.slice(0, o.max || 12) };
  }

  /* ---------------- measurement (tools / tests) ---------------- */
  /** @param {any[]} items labelled set @param {any} idx */
  function measure(items, idx) {
    let tp = 0, fp = 0, fn = 0, oTp = 0, oN = 0, neg = 0, negClean = 0, cOk = 0, fOk = 0;
    /** @type {any[]} */ const falsePos = [], misses = [];
    /** @type {Record<string, {tp: number, fp: number, fn: number, n: number}>} */ const byLang = {}, byKind = {};
    for (const it of items) {
      const got = new Set(extractInn(it.text, idx).map(x => x.inn)), want = new Set(it.inns);
      const k = it.cond.kind, L = it.cond.lang;
      for (const b of [[byLang, L], [byKind, k]]) { const m = /** @type {any} */ (b[0]); m[b[1]] = m[b[1]] || { tp: 0, fp: 0, fn: 0, n: 0 }; m[b[1]].n++; }
      const bump = (/** @type {string} */ f) => { byLang[L][f]++; byKind[k][f]++; };
      for (const g of got) {
        if (want.has(g)) { if (k === "out-of-table") oTp++; else tp++; bump("tp"); }
        else { fp++; falsePos.push({ id: it.id, inn: g }); bump("fp"); }
      }
      for (const w of want) if (!got.has(w)) { if (k === "out-of-table") oN++; else { fn++; misses.push({ id: it.id, inn: w }); } bump("fn"); }
      if (k === "out-of-table") oN += [...want].filter(w => got.has(w)).length;
      if (k === "negative" || k === "brand-only") { neg++; if (!got.size) negClean++; }
      const cs = countriesOf(it.text).map(x => x.country).sort().join(","), wc = [...it.countries].sort().join(",");
      if (cs === wc) cOk++;
      if (isForeign(it.text) === it.foreign) fOk++;
    }
    const r3 = (/** @type {number} */ x) => Math.round(x * 1000) / 1000;
    return { n: items.length, precision: r3((tp + oTp) / Math.max(1, tp + oTp + fp)), recall: r3(tp / Math.max(1, tp + fn)), recallOutOfTable: r3(oTp / Math.max(1, oN)),
      outOfTable: { found: oTp, of: oN }, negativesClean: r3(negClean / Math.max(1, neg)), negatives: { clean: negClean, of: neg }, country: r3(cOk / items.length),
      foreign: r3(fOk / items.length), tp, fp, fn, falsePos, misses, byLang, byKind };
  }

  /* ======================================================================================================== */
  /* browser UI                                                                                                */
  /* ======================================================================================================== */
  function mount(/** @type {any} */ W) {
    if (typeof document === "undefined") return;
    const start = () => { const slot = document.querySelector("#pcTravelSlot"); if (slot && document.querySelector("#tab-pc")) ui(W, slot); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  }

  function ui(/** @type {any} */ W, /** @type {Element} */ slot) {
    const fill = (/** @type {any} */ s, /** @type {any} */ v) => String(s).replace(/\{(\w+)\}/g, (m, x) => (v && x in v ? String(v[x]) : m));
    const T = (/** @type {string} */ k, /** @type {string} */ th, /** @type {any} */ v) => (W.LQI18N ? W.LQI18N.tf(k, th, v) : fill(th, v));
    const lang = () => (W.LQI18N && (W.LQI18N.lang === "en" || W.LQI18N.lang === "zh") ? W.LQI18N.lang : "th");
    const esc = (/** @type {any} */ s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => /** @type {any} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const raw = (/** @type {any} */ s) => `<span translate="no">${esc(s)}</span>`;
    /** translated text with {x} values kept as translate="no" spans (names, numbers as printed) */
    const TX = (/** @type {string} */ k, /** @type {string} */ th, /** @type {any} */ rv) => {
      const marks = Object.fromEntries(Object.keys(rv).map((x, i) => [x, `\u0001${i}\u0002`]));
      let s = esc(T(k, th, marks));
      Object.keys(rv).forEach((x, i) => { s = s.split(`\u0001${i}\u0002`).join(raw(rv[x])); });
      return s;
    };
    const link = (/** @type {string} */ u, /** @type {string} */ t) => `<a class="btn ghost small" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`;
    /** @type {any} */
    const st = { idx: null, idxLoading: null, eq: new Map(), meta: null, shards: new Map(), text: "" };
    W.__LQ_PCT = { st, paint: () => paint() };
    const regionName = (/** @type {string} */ c) => {
      try { const n = new Intl.DisplayNames([lang() === "zh" ? "zh-Hans" : lang()], { type: "region" }).of(c); if (n && n !== c) return n; } catch { /* old browser */ }
      return c;
    };
    const get = async (/** @type {string} */ u) => { const r = await fetch(u, { credentials: "same-origin" }); if (!r.ok) throw new Error(u); return r.json(); };
    /** The full index (hand table + TMT words), loaded once; until then the hand table alone. */
    function index() {
      if (st.idx) return st.idx;
      if (!st.idxLoading) {
        st.idxLoading = get("vendor/pc-drugs/tmt/meta.json").then(m => { st.idx = buildInnIndex(m.ing || []); paint(); })
          .catch(() => { st.idx = baseIndex(); });
      }
      return baseIndex();
    }
    async function shard(/** @type {string} */ key) {
      st.meta = st.meta || await get("vendor/pc-drugs/tmt-ing/meta.json");
      const name = shardOf(key);
      if (!st.meta.shards.includes(name)) return {};
      if (!st.shards.has(name)) st.shards.set(name, get(`vendor/pc-drugs/tmt-ing/${name}.json`).catch(e => { st.shards.delete(name); throw e; }));
      return st.shards.get(name);
    }
    function loadEq(/** @type {string} */ key, /** @type {string} */ strength) {
      const k = key + "|" + strength;
      if (st.eq.has(k)) return st.eq.get(k);
      st.eq.set(k, { state: "loading" });
      shard(key).then(sh => { st.eq.set(k, { state: "ready", r: equivalents(key, sh, st.meta, { strength }) }); paint(); })
        .catch(() => { st.eq.set(k, { state: "error" }); paint(); });
      return st.eq.get(k);
    }

    function paint() {
      const pcl = (W.__LQ_PCL && W.__LQ_PCL.st) || {};
      const text = String(pcl.text || "");
      st.text = text;
      const countries = text.trim() ? countriesOf(text) : [];
      if (!text.trim() || !isForeign(text, countries)) { slot.innerHTML = ""; return; }
      const idx = index();
      const dev = extractInn(text, idx);
      const ai = W.__LQ_PCAI && W.__LQ_PCAI.st && W.__LQ_PCAI.st.res && W.__LQ_PCAI.st.res.fields && W.__LQ_PCAI.st.res.fields.ok
        ? acceptAi(W.__LQ_PCAI.st.res.fields.json.active_ingredients, idx) : null;
      /** @type {Map<string, any>} */ const rows = new Map();
      for (const d of dev) rows.set(d.inn, { inn: d.inn, matched: d.matched, via: d.via, strength: d.strength, ai: false });
      for (const a of (ai && ai.accepted) || []) {
        const r = rows.get(a.inn);
        if (r) r.ai = true; else rows.set(a.inn, { inn: a.inn, matched: a.name_on_pack, via: "ai", strength: a.strength, ai: true, check: a.check });
      }
      const inns = [...rows.values()];
      let h = `<section class="card md-res" id="pcTravel" data-k="info"><h3>${esc(T("md.pc.tv.h", "โหมดเดินทาง: สินค้าจากต่างประเทศ"))}</h3>` +
        `<p class="hint">${esc(T("md.pc.tv.lead", "ฉลากนี้ดูเหมือนสินค้าจากต่างประเทศ ด้านล่างคือชื่อสามัญทางยาสากลของตัวยาที่พบบนฉลาก และแหล่งข้อมูลทางการที่ตรวจได้สำหรับประเทศนั้น ทั้งหมดทำบนเครื่องนี้"))}</p>`;
      // 1. countries + coverage (§4.7)
      if (countries.length) {
        h += `<h4>${esc(T("md.pc.tv.covH", "ประเทศบนฉลากและแหล่งข้อมูลทางการ"))}</h4><ul class="md-list" id="pcTravelCountries">`;
        h += countries.slice(0, 4).map(c => {
          const v = coverageFor(c.country), nm = regionName(c.country);
          const why = c.via === "script" ? ` <span class="hint">${esc(T("md.pc.tv.viaScript", "(เดาจากตัวอักษรบนฉลาก)"))}</span>` : "";
          const s = v.sources.map(x => SOURCE_NAME[x] || x).join(", ");
          const line = v.level === "covered" ? TX("md.pc.tv.covered", "{c}: ตรวจได้กับ {s} เมื่อกด \"ตรวจกับแหล่งข้อมูลทางการ\" ในการ์ดด้านบน", { c: nm, s })
            : v.level === "partial" ? TX("md.pc.tv.partial", "{c}: ตรวจได้บางส่วนกับ {s} (รายการเตือน ไม่ใช่ทะเบียนยา และอาจเปิดเฉพาะช่วงทดสอบ)", { c: nm, s })
              : TX("md.pc.tv.none", "{c}: ไม่มีฐานข้อมูลทางการที่เราตรวจได้ เลขทะเบียนอาจมีรูปแบบถูก แต่เรายืนยันไม่ได้ ตรวจเองที่เว็บไซต์ของหน่วยงาน", { c: nm });
          return `<li data-country="${esc(c.country)}" data-level="${v.level}">${line}${why}` +
            (v.links.length ? `<div class="md-row">${v.links.slice(0, 2).map((/** @type {any} */ l) => link(l.url, T("md.pc.tv.agency", "เว็บไซต์หน่วยงาน") + " " + l.id.toUpperCase()))
              .join("")}</div>` : "") + `</li>`;
        }).join("") + `</ul>`;
      }
      // 2. INN
      h += `<h4>${esc(T("md.pc.tv.innH", "ชื่อสามัญทางยาสากล (INN) ของตัวยาบนฉลาก"))}</h4>`;
      if (inns.length) {
        h += `<ul class="md-list" id="pcTravelInn">` + inns.map(r => `<li data-inn="${esc(r.inn)}" data-via="${esc(r.via)}">${raw(r.inn)} · ` +
          TX("md.pc.tv.onPack", "บนฉลาก: {m}", { m: r.matched + (r.strength ? " " + r.strength : "") }) +
          (r.via === "ai" ? ` · ${esc(T(r.check === "inn-only" ? "md.pc.tv.aiInnOnly" : "md.pc.tv.aiOnly", r.check === "inn-only"
            ? "AI ให้ชื่อสามัญมา แต่เครื่องนี้หาชื่อนี้บนฉลากไม่พบ เทียบกับกล่องเอง" : "AI อ่านพบ และชื่อสามัญตรวจได้บนเครื่องนี้"))}`
            : r.ai ? ` · ${esc(T("md.pc.tv.aiAgree", "AI อ่านได้ตรงกัน"))}` : "") + `</li>`).join("") + `</ul>`;
      } else h += `<p class="hint" id="pcTravelInnNone">${esc(T("md.pc.tv.innNone", "ยังไม่พบชื่อตัวยาที่รู้จักบนฉลาก ถามเภสัชกรโดยให้ดูกล่องหรือรายการส่วนประกอบ"))}</p>`;
      if (ai && ai.rejected.length) {
        h += `<div id="pcTravelInnRej"><p class="hint">${esc(T("md.pc.tv.aiRej", "ส่วนประกอบที่ AI อ่าน แต่ตรวจชื่อสามัญบนเครื่องนี้ไม่ได้ จึงไม่ใช้:"))}</p><ul class="md-list">` +
          ai.rejected.map((/** @type {any} */ x) => `<li data-reason="${esc(x.reason)}">${raw(x.name_on_pack || x.model_inn || "-")}</li>`).join("") + `</ul></div>`;
      }
      h += `<p class="hint">${esc(T("md.pc.tv.innNote",
        "ชื่อสามัญหาจากตารางชื่อยาของ LENSIQ และรายชื่อตัวยาใน TMT (CC BY) บนเครื่องนี้ ยืนยันชื่อกับ RxNorm ได้เมื่อกด \"ตรวจกับแหล่งข้อมูลทางการ\" ในการ์ดด้านบน"))}</p>`;
      // measured numbers + "may be incomplete" (owner decision 2026-11-12): the page's own element, generated from
      // docs/accuracy-figures.json by tools/accuracy-sync.mjs and translated by LQI18N; no number is typed here
      const acc = document.querySelector('[data-i18n="md.pc.tv.acc"]');
      const accT = acc ? String(acc.textContent || "").replace(/\s+/g, " ").trim() : "";
      if (accT.length > 1) h += `<p class="hint" id="pcTravelAcc">${esc(accT)}</p>`;
      // the list may be incomplete (a combination product, a name we do not know): always said; no "same ingredients" list then
      const partial = inns.length > 0 && maybeIncomplete(text, inns.length);
      h += `<p class="md-status" data-kind="warn" id="pcTravelPartial"${partial ? "" : " hidden"}>${esc(T("md.pc.tv.partial2",
        "ฉลากอาจมีตัวยามากกว่าที่พบ (เช่น ยาสูตรผสม) เทียบกับรายการส่วนประกอบบนกล่อง และถามเภสัชกร"))}</p>`;
      // 3. Thai equivalents (switch)
      const innList = inns.map(r => r.inn);
      if (thaiEquivAllowed(W) && partial) {
        h += `<div id="pcTravelEq" data-state="partial"><h4>${esc(T("md.pc.tv.eqH", "สินค้าในไทยที่มีตัวยาเดียวกัน"))}</h4>` +
          `<p class="hint">${esc(T("md.pc.tv.eqPartial", "ไม่แสดงรายการ เพราะอาจอ่านตัวยาบนฉลากได้ไม่ครบ ถามเภสัชกรโดยให้ดูกล่อง"))}</p></div>`;
      } else if (!thaiEquivAllowed(W)) {
        h += `<div id="pcTravelEq" data-state="off"><h4>${esc(T("md.pc.tv.eqH", "สินค้าในไทยที่มีตัวยาเดียวกัน"))}</h4><p class="hint">` +
          (innList.length ? TX("md.pc.tv.eqOff", "ส่วนนี้ยังปิดอยู่ ระหว่างรอหนังสืออนุญาตใช้ข้อมูลทะเบียนจาก อย. ถามเภสัชกรโดยบอกชื่อสามัญ: {inn}", { inn: innList.join(", ") })
            : esc(T("md.pc.tv.eqOffNone", "ส่วนนี้ยังปิดอยู่ ระหว่างรอหนังสืออนุญาตใช้ข้อมูลทะเบียนจาก อย. ถามเภสัชกรโดยให้ดูกล่อง"))) + `</p>` +
          `<div class="md-row">${((LQPC && LQPC.VERIFY && LQPC.VERIFY.TH) || []).map((/** @type {any} */ l) => link(l.url, T("md.pc.tv.thLink", "ค้นทะเบียนเองกับ อย.") + " " + l.id)).join("")}</div></div>`;
      } else if (!innList.length) {
        h += `<div id="pcTravelEq" data-state="none"><h4>${esc(T("md.pc.tv.eqH", "สินค้าในไทยที่มีตัวยาเดียวกัน"))}</h4>` +
          `<p class="hint">${esc(T("md.pc.tv.eqNoInn", "ยังไม่มีชื่อสามัญให้ค้น"))}</p></div>`;
      } else {
        const key = ingSetKey(innList), str = inns.length === 1 ? inns[0].strength || "" : "";
        const e = loadEq(key, str);
        h += `<div id="pcTravelEq" data-state="${e.state === "ready" ? (e.r.total ? "on" : "empty") : e.state}"><h4>${esc(T("md.pc.tv.eqH", "สินค้าในไทยที่มีตัวยาเดียวกัน"))}</h4>` +
          `<p class="md-status" data-kind="warn">${esc(T("md.pc.tv.eqNote",
            "เป็นรายชื่อ ไม่ใช่คำแนะนำ ถามเภสัชกรก่อนเปลี่ยนยาทุกครั้ง ชื่อจาก TMT ฉบับ 17 ก.พ. 2563 (CC BY) ไม่ใช่ทะเบียน อย. ยาที่ขึ้นทะเบียนหลังจากนั้นจะไม่มีในรายการ"))}</p>`;
        if (e.state === "loading") h += `<p class="hint">${esc(T("md.pc.tv.eqLoading", "กำลังโหลดรายการ…"))}</p>`;
        else if (e.state === "error") h += `<p class="hint" data-cant>${esc(T("md.pc.tv.eqError", "โหลดรายการในเครื่องไม่ได้"))}</p>`;
        else if (!e.r.total) h += `<p class="hint">${TX("md.pc.tv.eqEmpty", "ไม่พบสินค้าใน TMT ที่มีตัวยาชุดนี้ตรงกันทุกตัว: {k}", { k: key.split("+").join(" + ") })}</p>`;
        else {
          h += `<p class="hint">${TX("md.pc.tv.eqCount", "ตัวยาชุดนี้ ({k}) มี {n} รายการใน TMT แสดง {m} รายการแรก", { k: key.split("+").join(" + "), n: e.r.total, m: e.r.rows.length })}</p>` +
            `<ul class="md-list">${e.r.rows.map((/** @type {any} */ x) => `<li data-same="${x.same ? 1 : 0}">${raw(x.name)} · ${raw([x.strength, x.form].filter(Boolean).join(" · "))}` +
              (x.same ? ` · ${esc(T("md.pc.tv.same", "ความแรงเท่ากับที่พิมพ์บนฉลาก"))}` : "") + `</li>`).join("")}</ul>` +
            // the credit as the licence asks for it (the publisher's own Thai name stays as written)
            `<p class="hint" lang="${lang() === "zh" ? "zh" : lang() === "en" ? "en" : "th"}" translate="no">${esc((st.meta && st.meta.credit && st.meta.credit[lang()]) || "")}</p>`;
        }
        h += `</div>`;
      }
      h += `<p class="hint" id="pcTravelNot">${esc(T("md.pc.tv.not", "ไม่แปลงขนาดยา ไม่บอกว่ายาตัวไหนใช้แทนกันได้ และไม่แนะนำขนาดยา ถามเภสัชกรทุกครั้ง"))}</p></section>`;
      slot.innerHTML = h;
    }
    W.addEventListener("lq-pc-card", paint);
    W.addEventListener("lq-pc-ai", paint);
    W.addEventListener("lq-lang", () => setTimeout(paint, 0)); // after LQI18N has re-translated the page (the accuracy line is read from it)
    W.addEventListener("lq-pc-text", () => setTimeout(paint, 0));
    W.addEventListener("pagehide", () => { slot.innerHTML = ""; });
  }

  return {
    INN_TABLE, WEAK, buildInnIndex, baseIndex, extractInn, maybeIncomplete, resolveInn, acceptAi, classifyLine, classifyPair, countriesOf, coverageFor, COVERAGE, SOURCE_NAME, isForeign,
    thaiEquivAllowed, saltStrip, ingSetKey, shardOf, ingFiles, normStrength, equivalents, measure, mount, SHARD_SCHEMA
  };
});
