# Depth texts held out of the product, now back (2026-11-23)

**Status 2026-11-23: all 26 are back in the product, "live, awaiting expert" (expert pack).** The independent reviewer
(Fable) passed each one against the hard limits, the 177 / 178 / 196 voice rules and the crisis rules; owner entry 22
item 3 ("ไม่ต้องรอ ผู้ตรวจโอเคแล้วลุยเลย") put them back verbatim at the places below. Checks: the exact texts are allowed in
tests/unit/crisis-escape-guard-allow.json (priceText, re-lock relock-held26) and accuracy-removal-223.spec.json
(labelAllow, re-lock 12); nothing broader. The record below is kept for the expert pack.

Removed from the depth port on branch fortune-90b-depth by coordinator decision (a), 2026-11-23, because each one contains
a word that a locked check flags: crisis-price-scan (sales words: ซื้อ / ราคา / ชำระ / buy / price / 价格) or
accuracy-removal-223 R5 (status label "เร็ว ๆ นี้"). The allow-lists were not re-locked and no text was reworded.
Owner entry 22 item 3 (2026-11-23): the independent reviewer (Fable) reads each of the 26 against the hard limits, the
177 / 178 / 196 voice rules and the crisis rules; those that pass go back, any that fail stay out and are listed here.

Source: branch origin/fortune-depth (independent review round 3 PASS 2026-11-18). This file is not product text: no page
loads it.

How to read an entry:
- **Goes back at** `file:line`: insert the entry as a new line at that line number of the file at commit a28c49f6 or
  later (just after the key named in "after"). The Thai depth tables moved from tarot-kb.js / dream-kb.js into
  tarot-depth.js / dream-depth.js (lazy loading, a28c49f6), so Thai entries go back there. Line numbers are those of
  commit 11fdce54 with none of the 26 back; when several go back into one file, insert from the highest line down.
- **Caution** `c: true` means a restraining text: the layout always shows it, never behind "อ่านเพิ่มเติม".
- **TH / EN / ZH**: the held text itself (marked **held**), the version of the same key still in the KB (quoted), or
  "no EN/ZH version in the KB" (same for TH) when that language has no entry for the key.

## 1. dream.html · key `sym.bathroom` (TH text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `dream-depth.js:106` (after `sym.hotel`; held from `dream-kb.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**): ห้องน้ำที่สะอาด รก หรือไม่มีความเป็นส่วนตัว และคุณรู้สึกสบายหรืออึดอัด ตำราดูทุกอย่าง ไทยอ่านเป็นการชำระล้างความรู้สึกและปล่อยวางสิ่งสะสม จีนมองน้ำที่ชำระกายเป็นการเริ่มใหม่ ฝันชวนให้ถามว่ามีอะไรที่คุณอยากล้างออกจากใจบ้าง
- EN (in the KB): A clean bathroom, a messy one, or one lacking privacy, leaving you at ease or uncomfortable: the books note it all. Thai belief reads washing away feelings and releasing what has built up; Chinese lore sees cleansing water as a fresh start. What would you like to rinse out of your mind?
- ZH (in the KB): 浴室干净、杂乱或缺少隐私，你自在或不适，书中皆看。泰国读作洗涤情绪、放下积存，中国视净身之水为重新开始。你想从心里洗去什么？

## 2. tarot.html (Siam Si) · key `home.10` (EN text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `i18n/en-kb-siamsee.js:146` (after `love.10`; held from `i18n/en-kb-siamsee.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**, entry 14): บ้านเป็นประเด็นเด่นของใบนี้ เหมาะกับการปลูกต้นไม้ ซ่อมแซมส่วนที่เก่า หรือจัดมุมพักผ่อนให้ผู้สูงอายุ หากคิดเรื่องซื้อหรือสร้างบ้าน ให้วางแผนละเอียดและมีผู้ใหญ่ที่ไว้ใจช่วยดู
- EN (**held**): The home is the star of this slip. It suits planting trees, repairing what is old or arranging a resting corner for older relatives. If you are thinking about buying or building a house, plan it in detail and have a trusted elder look it over.
- ZH (in the KB): 家是此签的重点。适合种树、修补旧处，或为年长者布置休息角。若考虑买房或盖房，要规划周详并请信得过的长辈过目。

## 3. tarot.html (Siam Si) · key `home.3` (EN text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `i18n/en-kb-siamsee.js:73` (after `love.3`; held from `i18n/en-kb-siamsee.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**, entry 15): เรื่องในบ้านลื่นไหล ถ้าคิดจะปรับปรุงห้อง ซื้อของใช้ใหม่ หรือย้ายที่อยู่ ผู้ใหญ่ในบ้านมีแนวโน้มเห็นด้วยและช่วยจัดการ บรรยากาศครอบครัวคล่องตัวเหมือนเรือที่แล่นไม่สะดุด
- EN (**held**): Things at home run smoothly. If you have been thinking of refreshing a room, buying household items or moving, the elders at home are likely to agree and help. Family life flows like a boat that sails without a snag.
- ZH (in the KB): 家中事务顺畅。若想翻新房间、添置用品或搬家，长辈多半会同意并帮忙。家庭气氛像无碍前行的船。

## 4. tarot.html (Siam Si) · key `money.1` (EN text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `i18n/en-kb-siamsee.js:53` (after `work.1`; held from `i18n/en-kb-siamsee.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**, entry 17): เรื่องเงินให้มองไปที่ยอดที่คนอื่นค้างคุณ และรายได้เสริมที่มาทางคนรู้จัก การทวงถามอย่างสุภาพมีโอกาสได้ผลดี งานเล็กหรือการขายของก็ได้ราคาที่พอใจ แบ่งส่วนหนึ่งเป็นเงินเก็บก่อนใช้ตามอารมณ์ดีใจ
- EN (**held**): On money, look at what others still owe you and at side income that comes through people you know. A polite reminder is likely to land well, and small jobs or sales can fetch a fair price. Set aside a share as savings before spending on the glow of good news.
- ZH (in the KB): 钱的方面可看别人欠你的款和熟人带来的副业。礼貌提醒容易有结果，小买卖或零工也能卖到合理价钱。先留一部分存起来，再花高兴时想花的钱。
- Expert-pack note (Fable): the TH wording "ก็ได้ราคาที่พอใจ" is firmer than the EN version; the expert decides whether to soften it.

## 5. tarot.html (Siam Si) · key `money.10` (EN text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `i18n/en-kb-siamsee.js:145` (after `work.10`; held from `i18n/en-kb-siamsee.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**, entry 18): การออมระยะยาวและการซื้อของที่ใช้ได้นานให้ผลดี เช่นเครื่องมือประกอบอาชีพหรือของใช้คุณภาพดีที่ซ่อมได้ เงินที่ให้ยืมในครอบครัวมีแนวโน้มได้คืนอย่างเรียบร้อยตามที่ตกลงกันไว้
- EN (**held**): Long-term saving and buying things that last do well, such as work tools or good quality goods that can be repaired. Money lent within the family tends to come back neatly as agreed.
- ZH (in the KB): 长期储蓄和买耐用的东西较好，如谋生工具或可修理的好用品。家人间借出的钱，多半会按约定整齐归还。

## 6. tarot.html (Siam Si) · key `money.12` (EN text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `i18n/en-kb-siamsee.js:168` (after `work.12`; held from `i18n/en-kb-siamsee.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**, entry 19): เงินเศษที่เก็บจากการใช้จ่ายประจำวันกลายเป็นก้อนได้ การซื้อของใช้จำเป็นทีละชิ้นแทนซื้อรวดเดียวทำให้ไม่กระทบกระเป๋า ส่วนเงินที่รอรับจากหลายทางเล็ก ๆ ให้จดไว้ จะเห็นว่ารวมแล้วมากกว่าที่คิด
- EN (**held**): Spare change gathered from daily spending can become a lump sum. Buying needed household items one at a time rather than all at once spares your wallet. For money coming from several small sources, write it down and you will see it adds up to more than you thought.
- ZH (in the KB): 日常开销攒下的零钱能成整笔。把需要的家用品一件一件买，而不是一次买齐，不伤钱包。几处小来源的进账记下来，会发现合起来比想的多。

## 7. tarot.html (Siam Si) · key `money.14` (EN text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `i18n/en-kb-siamsee.js:185` (after `work.14`; held from `i18n/en-kb-siamsee.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**, entry 20): เรื่องเงินที่ตกลงกันได้ เช่นแบ่งผ่อนชำระ หรือหารค่าใช้จ่ายร่วม จะลงตัวถ้าคุยตรง ๆ และจดไว้ ข้อตกลงด้านราคาหรือค่าเช่าเจรจาได้ดีเมื่อเสนอทางออกที่ทุกฝ่ายพอใจ
- EN (**held**): Money matters that can be settled, such as paying in installments or splitting shared costs, will fit if you talk plainly and write it down. Price or rent agreements go well when you offer a way out that each party is content with.
- ZH (**held**, entry 12): 能谈妥的钱事，如分期付款或分摊共同开支，坦白谈并写下来就会妥当。价格或租金协议，拿出各方都满意的出路时进展顺利。

## 8. tarot.html (Siam Si) · key `money.15` (EN text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `i18n/en-kb-siamsee.js:195` (after `work.15`; held from `i18n/en-kb-siamsee.js`)
- Caution: `c: true` (restraining; always shown)
- Reason held: crisis-price-scan sales word
- TH (**held**, entry 21): ชะลอการใช้เงินก้อนใหญ่ เช่นซื้อของราคาสูงหรือก่อหนี้ใหม่ ไว้จนกว่าสถานการณ์จะนิ่งกว่านี้ เก็บเงินสำรองให้พอและตรวจรายจ่ายประจำ ไม่ต้องรีบหาทางเพิ่มรายได้ในทันที
- EN (**held**): Hold off on large spending, such as an expensive purchase or new debt, until things settle further. Build enough reserve and review your regular costs. There is no need to scramble for extra income right away.
- ZH (in the KB): 大额支出如昂贵购物或新增负债先缓一缓，等局面更稳。备足备用金，检查固定开销。不必急着马上找额外收入。

## 9. tarot.html (Siam Si) · key `money.27` (EN text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `i18n/en-kb-siamsee.js:326` (after `work.27`; held from `i18n/en-kb-siamsee.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**, entry 23): รายได้จากความสามารถเฉพาะตัว เช่นงานรับทำ งานสอน หรือขายของที่ทำเอง ตั้งราคาให้สมกับเวลาและฝีมือ ไม่ลดจนไม่คุ้ม และเก็บบันทึกต้นทุนเพื่อรู้ว่าทำได้กำไรจริงหรือไม่
- EN (**held**): Income comes from your particular ability, such as commissioned work, teaching or selling things you make. Set a price that fits your time and skill without discounting until it is not worth it, and keep a record of costs so you know whether you really make a profit.
- ZH (in the KB): 收入来自你的特长，如接活、教学或卖自制的东西。定价要配得上时间与手艺，别降到不划算，并记录成本，才知道是否真有利润。

## 10. tarot.html (Siam Si) · key `money.3` (EN text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `i18n/en-kb-siamsee.js:72` (after `work.3`; held from `i18n/en-kb-siamsee.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**, entry 24): ช่วงลมดีเหมาะกับการเคลียร์เรื่องค้างคาทางการเงิน ทั้งยอดที่รอรับและยอดที่ต้องจ่าย การซื้อมาขายไปรอบสั้นหมุนได้คล่อง ลองจดรายรับรายจ่ายให้เห็นภาพชัด จะรู้ว่ากำลังไปทางไหน
- EN (**held**): Good wind suits clearing financial loose ends, both what is due to you and what you must pay. Short-cycle buying and selling can turn over smoothly. Try writing down income and spending so you can see the picture and know where you are heading.
- ZH (in the KB): 风顺时适合理清钱上的零碎事，包括别人欠你的和你该付的。短周期的买卖周转顺畅。试着记下收支，看清自己往哪里走。
- Expert-pack note (Fable): EN "short-cycle buying and selling" could read "short-cycle trade in goods"; the expert decides.

## 11. tarot.html (Siam Si) · key `money.4` (EN text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `i18n/en-kb-siamsee.js:81` (after `work.4`; held from `i18n/en-kb-siamsee.js`)
- Caution: `c: true` (restraining; always shown)
- Reason held: crisis-price-scan sales word
- TH (**held**, entry 25): ช่วงนี้ควรระวังรายจ่าย อย่ารีบซื้อของชิ้นใหญ่หรือตัดสินใจกู้เพราะแรงกดดัน ลองเก็บเงินสำรองและรอดูราคากับเงื่อนไขอีกระยะ ความมั่นคงจะมาจากการไม่ใจร้อนมากกว่าการคว้าให้ทัน
- EN (**held**): Watch your spending in this period. Do not rush into a large purchase or borrow under pressure. Build a reserve and wait to see prices and terms for a while. Steadiness comes from not being impatient more than from grabbing something before it is gone.
- ZH (**held**, entry 13): 这段时间要留意开销，别因压力匆忙买大件或借贷。先存好备用金，多观察一阵价格和条件。稳靠的是不心急，而不是抢先拿下。

## 12. tarot.html (Siam Si) · key `money.14` (ZH text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `i18n/zh-kb-siamsee.js:188` (after `work.14`; held from `i18n/zh-kb-siamsee.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**, entry 20): เรื่องเงินที่ตกลงกันได้ เช่นแบ่งผ่อนชำระ หรือหารค่าใช้จ่ายร่วม จะลงตัวถ้าคุยตรง ๆ และจดไว้ ข้อตกลงด้านราคาหรือค่าเช่าเจรจาได้ดีเมื่อเสนอทางออกที่ทุกฝ่ายพอใจ
- EN (**held**, entry 7): Money matters that can be settled, such as paying in installments or splitting shared costs, will fit if you talk plainly and write it down. Price or rent agreements go well when you offer a way out that each party is content with.
- ZH (**held**): 能谈妥的钱事，如分期付款或分摊共同开支，坦白谈并写下来就会妥当。价格或租金协议，拿出各方都满意的出路时进展顺利。

## 13. tarot.html (Siam Si) · key `money.4` (ZH text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `i18n/zh-kb-siamsee.js:81` (after `work.4`; held from `i18n/zh-kb-siamsee.js`)
- Caution: `c: true` (restraining; always shown)
- Reason held: crisis-price-scan sales word
- TH (**held**, entry 25): ช่วงนี้ควรระวังรายจ่าย อย่ารีบซื้อของชิ้นใหญ่หรือตัดสินใจกู้เพราะแรงกดดัน ลองเก็บเงินสำรองและรอดูราคากับเงื่อนไขอีกระยะ ความมั่นคงจะมาจากการไม่ใจร้อนมากกว่าการคว้าให้ทัน
- EN (**held**, entry 11): Watch your spending in this period. Do not rush into a large purchase or borrow under pressure. Build a reserve and wait to see prices and terms for a while. Steadiness comes from not being impatient more than from grabbing something before it is gone.
- ZH (**held**): 这段时间要留意开销，别因压力匆忙买大件或借贷。先存好备用金，多观察一阵价格和条件。稳靠的是不心急，而不是抢先拿下。

## 14. tarot.html (Siam Si) · key `home.10` (TH text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `tarot-depth.js:106` (after `love.10`; held from `tarot-kb.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**): บ้านเป็นประเด็นเด่นของใบนี้ เหมาะกับการปลูกต้นไม้ ซ่อมแซมส่วนที่เก่า หรือจัดมุมพักผ่อนให้ผู้สูงอายุ หากคิดเรื่องซื้อหรือสร้างบ้าน ให้วางแผนละเอียดและมีผู้ใหญ่ที่ไว้ใจช่วยดู
- EN (**held**, entry 2): The home is the star of this slip. It suits planting trees, repairing what is old or arranging a resting corner for older relatives. If you are thinking about buying or building a house, plan it in detail and have a trusted elder look it over.
- ZH (in the KB): 家是此签的重点。适合种树、修补旧处，或为年长者布置休息角。若考虑买房或盖房，要规划周详并请信得过的长辈过目。

## 15. tarot.html (Siam Si) · key `home.3` (TH text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `tarot-depth.js:33` (after `love.3`; held from `tarot-kb.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**): เรื่องในบ้านลื่นไหล ถ้าคิดจะปรับปรุงห้อง ซื้อของใช้ใหม่ หรือย้ายที่อยู่ ผู้ใหญ่ในบ้านมีแนวโน้มเห็นด้วยและช่วยจัดการ บรรยากาศครอบครัวคล่องตัวเหมือนเรือที่แล่นไม่สะดุด
- EN (**held**, entry 3): Things at home run smoothly. If you have been thinking of refreshing a room, buying household items or moving, the elders at home are likely to agree and help. Family life flows like a boat that sails without a snag.
- ZH (in the KB): 家中事务顺畅。若想翻新房间、添置用品或搬家，长辈多半会同意并帮忙。家庭气氛像无碍前行的船。

## 16. tarot.html (tarot card) · key `major.20` (TH text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `tarot-depth.js:377` (after `major.19`; held from `tarot-kb.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**): ไพ่การตื่นรู้คือด่านของการได้ยินเสียงเรียกและทบทวนทั้งเส้นทางอย่างเมตตา ผู้เดินทางตัดสินใจลุกขึ้นสู่ชีวิตแบบใหม่ ผูกกับธาตุไฟ ไฟที่ชำระและปลุกให้ตื่น {C} จึงชวนให้อภัยตัวเองและตอบรับสิ่งที่ใจเรียก
- EN (in the KB): Judgement is the stage of hearing a call and reviewing the whole road with compassion, when the traveller decides to rise into a fuller life. Tied to fire, which cleanses and awakens, {C} invites self-forgiveness and an answer to what is calling you.
- ZH (in the KB): 审判是听见召唤、带着慈悲回顾整段路的一站，旅人决定起身迎向更完整的生活。对应能净化与唤醒的火元素，所以{C}邀请你原谅自己，并回应心中的呼唤。

## 17. tarot.html (Siam Si) · key `money.1` (TH text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `tarot-depth.js:13` (after `work.1`; held from `tarot-kb.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**): เรื่องเงินให้มองไปที่ยอดที่คนอื่นค้างคุณ และรายได้เสริมที่มาทางคนรู้จัก การทวงถามอย่างสุภาพมีโอกาสได้ผลดี งานเล็กหรือการขายของก็ได้ราคาที่พอใจ แบ่งส่วนหนึ่งเป็นเงินเก็บก่อนใช้ตามอารมณ์ดีใจ
- EN (**held**, entry 4): On money, look at what others still owe you and at side income that comes through people you know. A polite reminder is likely to land well, and small jobs or sales can fetch a fair price. Set aside a share as savings before spending on the glow of good news.
- ZH (in the KB): 钱的方面可看别人欠你的款和熟人带来的副业。礼貌提醒容易有结果，小买卖或零工也能卖到合理价钱。先留一部分存起来，再花高兴时想花的钱。
- Expert-pack note (Fable): the TH wording "ก็ได้ราคาที่พอใจ" is firmer than the EN version; the expert decides whether to soften it.

## 18. tarot.html (Siam Si) · key `money.10` (TH text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `tarot-depth.js:105` (after `work.10`; held from `tarot-kb.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**): การออมระยะยาวและการซื้อของที่ใช้ได้นานให้ผลดี เช่นเครื่องมือประกอบอาชีพหรือของใช้คุณภาพดีที่ซ่อมได้ เงินที่ให้ยืมในครอบครัวมีแนวโน้มได้คืนอย่างเรียบร้อยตามที่ตกลงกันไว้
- EN (**held**, entry 5): Long-term saving and buying things that last do well, such as work tools or good quality goods that can be repaired. Money lent within the family tends to come back neatly as agreed.
- ZH (in the KB): 长期储蓄和买耐用的东西较好，如谋生工具或可修理的好用品。家人间借出的钱，多半会按约定整齐归还。

## 19. tarot.html (Siam Si) · key `money.12` (TH text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `tarot-depth.js:130` (after `work.12`; held from `tarot-kb.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**): เงินเศษที่เก็บจากการใช้จ่ายประจำวันกลายเป็นก้อนได้ การซื้อของใช้จำเป็นทีละชิ้นแทนซื้อรวดเดียวทำให้ไม่กระทบกระเป๋า ส่วนเงินที่รอรับจากหลายทางเล็ก ๆ ให้จดไว้ จะเห็นว่ารวมแล้วมากกว่าที่คิด
- EN (**held**, entry 6): Spare change gathered from daily spending can become a lump sum. Buying needed household items one at a time rather than all at once spares your wallet. For money coming from several small sources, write it down and you will see it adds up to more than you thought.
- ZH (in the KB): 日常开销攒下的零钱能成整笔。把需要的家用品一件一件买，而不是一次买齐，不伤钱包。几处小来源的进账记下来，会发现合起来比想的多。

## 20. tarot.html (Siam Si) · key `money.14` (TH text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `tarot-depth.js:147` (after `work.14`; held from `tarot-kb.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**): เรื่องเงินที่ตกลงกันได้ เช่นแบ่งผ่อนชำระ หรือหารค่าใช้จ่ายร่วม จะลงตัวถ้าคุยตรง ๆ และจดไว้ ข้อตกลงด้านราคาหรือค่าเช่าเจรจาได้ดีเมื่อเสนอทางออกที่ทุกฝ่ายพอใจ
- EN (**held**, entry 7): Money matters that can be settled, such as paying in installments or splitting shared costs, will fit if you talk plainly and write it down. Price or rent agreements go well when you offer a way out that each party is content with.
- ZH (**held**, entry 12): 能谈妥的钱事，如分期付款或分摊共同开支，坦白谈并写下来就会妥当。价格或租金协议，拿出各方都满意的出路时进展顺利。

## 21. tarot.html (Siam Si) · key `money.15` (TH text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `tarot-depth.js:157` (after `work.15`; held from `tarot-kb.js`)
- Caution: `c: true` (restraining; always shown)
- Reason held: crisis-price-scan sales word
- TH (**held**): ชะลอการใช้เงินก้อนใหญ่ เช่นซื้อของราคาสูงหรือก่อหนี้ใหม่ ไว้จนกว่าสถานการณ์จะนิ่งกว่านี้ เก็บเงินสำรองให้พอและตรวจรายจ่ายประจำ ไม่ต้องรีบหาทางเพิ่มรายได้ในทันที
- EN (**held**, entry 8): Hold off on large spending, such as an expensive purchase or new debt, until things settle further. Build enough reserve and review your regular costs. There is no need to scramble for extra income right away.
- ZH (in the KB): 大额支出如昂贵购物或新增负债先缓一缓，等局面更稳。备足备用金，检查固定开销。不必急着马上找额外收入。

## 22. tarot.html (Siam Si) · key `money.19` (TH text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `tarot-depth.js:204` (after `work.19`; held from `tarot-kb.js`)
- Caution: `c: true` (restraining; always shown)
- Reason held: crisis-price-scan sales word
- TH (**held**): ลองทบทวนรายจ่ายย้อนหลังหนึ่งเดือน จะพบรายการที่ไม่จำเป็นที่ลดได้ เช่นสมัครสมาชิกที่ไม่ได้ใช้หรือของที่ซื้อซ้ำ ปรับตรงนี้แล้วเงินเหลือมากขึ้นโดยไม่ต้องตัดสิ่งที่สำคัญ
- EN (in the KB): Try reviewing the last month of spending and you will find unneeded items you can trim, such as subscriptions you do not use or things bought twice. Adjust there and more money is left without cutting what matters.
- ZH (in the KB): 回看过去一个月的开销，会发现可削减的不必要项目，如不用的订阅或重复买的东西。在那里调整，不砍重要的开销，钱也会多出来。

## 23. tarot.html (Siam Si) · key `money.27` (TH text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `tarot-depth.js:286` (after `work.27`; held from `tarot-kb.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**): รายได้จากความสามารถเฉพาะตัว เช่นงานรับทำ งานสอน หรือขายของที่ทำเอง ตั้งราคาให้สมกับเวลาและฝีมือ ไม่ลดจนไม่คุ้ม และเก็บบันทึกต้นทุนเพื่อรู้ว่าทำได้กำไรจริงหรือไม่
- EN (**held**, entry 9): Income comes from your particular ability, such as commissioned work, teaching or selling things you make. Set a price that fits your time and skill without discounting until it is not worth it, and keep a record of costs so you know whether you really make a profit.
- ZH (in the KB): 收入来自你的特长，如接活、教学或卖自制的东西。定价要配得上时间与手艺，别降到不划算，并记录成本，才知道是否真有利润。

## 24. tarot.html (Siam Si) · key `money.3` (TH text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `tarot-depth.js:32` (after `work.3`; held from `tarot-kb.js`)
- Caution: no
- Reason held: crisis-price-scan sales word
- TH (**held**): ช่วงลมดีเหมาะกับการเคลียร์เรื่องค้างคาทางการเงิน ทั้งยอดที่รอรับและยอดที่ต้องจ่าย การซื้อมาขายไปรอบสั้นหมุนได้คล่อง ลองจดรายรับรายจ่ายให้เห็นภาพชัด จะรู้ว่ากำลังไปทางไหน
- EN (**held**, entry 10): Good wind suits clearing financial loose ends, both what is due to you and what you must pay. Short-cycle buying and selling can turn over smoothly. Try writing down income and spending so you can see the picture and know where you are heading.
- ZH (in the KB): 风顺时适合理清钱上的零碎事，包括别人欠你的和你该付的。短周期的买卖周转顺畅。试着记下收支，看清自己往哪里走。
- Expert-pack note (Fable): EN "short-cycle buying and selling" could read "short-cycle trade in goods"; the expert decides.

## 25. tarot.html (Siam Si) · key `money.4` (TH text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `tarot-depth.js:41` (after `work.4`; held from `tarot-kb.js`)
- Caution: `c: true` (restraining; always shown)
- Reason held: crisis-price-scan sales word
- TH (**held**): ช่วงนี้ควรระวังรายจ่าย อย่ารีบซื้อของชิ้นใหญ่หรือตัดสินใจกู้เพราะแรงกดดัน ลองเก็บเงินสำรองและรอดูราคากับเงื่อนไขอีกระยะ ความมั่นคงจะมาจากการไม่ใจร้อนมากกว่าการคว้าให้ทัน
- EN (**held**, entry 11): Watch your spending in this period. Do not rush into a large purchase or borrow under pressure. Build a reserve and wait to see prices and terms for a while. Steadiness comes from not being impatient more than from grabbing something before it is gone.
- ZH (**held**, entry 13): 这段时间要留意开销，别因压力匆忙买大件或借贷。先存好备用金，多观察一阵价格和条件。稳靠的是不心急，而不是抢先拿下。

## 26. tarot.html (Siam Si) · key `wish.25` (TH text held)

- Status: **live, awaiting expert** (back in the product 2026-11-23; expert pack)
- Goes back at: `tarot-depth.js:260` (after `v.25`; held from `tarot-kb.js`)
- Caution: `c: true` (restraining; always shown)
- Reason held: R5 status label "เร็ว ๆ นี้" (accuracy-removal-223)
- TH (**held**): เรื่องที่ขอจะไปถึงด้วยการเดินต่อเนื่องไม่หยุด แต่ไม่ใช่เร็ว ๆ นี้ ตั้งใจเดินวันละหน่อยและอย่าเปรียบเทียบกับคนที่ดูเหมือนไปไกลกว่า เส้นชัยของคุณจะมาถึงในแบบที่คุณเตรียมไว้
- EN (in the KB): What you asked for will be reached by walking on without stopping, though not very soon. Walk a little each day and do not compare yourself with people who seem to be farther along. Your finish line will arrive in the way you have prepared for.
- ZH (in the KB): 所求之事靠不停步地走而到达，但不会很快。每天走一点，不要和看似走得更远的人比。你的终点会以你所备的方式到来。
- Expert-pack note (Fable): this is the firmest wording of the 26 ("แต่ไม่ใช่เร็ว ๆ นี้"); the expert decides whether it stays.

