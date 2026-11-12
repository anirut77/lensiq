-- 0014_merit.sql — Merit MVP (owner order 2026-11-12; docs/MERIT-DESIGN.md, docs/MERIT-RESULTS.md, backend/src/merit.js).
--
-- merit_items: belief guidance managed by admins (places to pray, what to offer and how, ชง customs, lucky items), shown
-- FREE under fortune readings; matching runs on the device. Every text column is JSON {th, en, zh}, complete in all
-- three languages. There is deliberately NO price, vendor, link or personal-data column (rule: guidance is free and never
-- tied to a purchase). place / area are a place name and an area (province) only.
CREATE TABLE merit_items (
  id TEXT PRIMARY KEY,                     -- "sample-…" for the seeded samples, "mi-<hex>" for admin-made items
  type TEXT NOT NULL,                      -- place | offering | chong | lucky_item
  tradition TEXT NOT NULL,                 -- thai_buddhist | chinese_folk | hindu_brahman | general
  title TEXT NOT NULL,                     -- JSON {th, en, zh}
  body TEXT NOT NULL,                      -- JSON {th, en, zh}
  place TEXT,                              -- JSON {th, en, zh} or NULL
  area TEXT,                               -- JSON {th, en, zh} or NULL
  match_keys TEXT NOT NULL,                -- JSON array of keys from merit.js KEYS_ALLOWED (any, chong, weak, domain:*, animal:*, element:*)
  sample INTEGER NOT NULL DEFAULT 0,       -- 1 = a sample written for the admin to replace
  status TEXT NOT NULL DEFAULT 'published',-- published | hidden
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX merit_items_public ON merit_items(status, tradition, type, sort);

-- merit_interest: "request interest" in the paid on-your-behalf service. The form is OFF (MERIT_INTEREST_FORM = "off")
-- until counsel answers CTO-BRIEF L42 / L43. Minimum only: name or nickname, one contact channel, the guidance item, the
-- preferred date window. No birth date, address, photo, note or IP. Purged after MERIT_INTEREST_DAYS (90) by retention.js.
-- The item chosen may reveal a religious belief (PDPA s.26): the form asks for explicit consent (consent_version).
CREATE TABLE merit_interest (
  id TEXT PRIMARY KEY,                     -- 24 hex
  created_at INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,                   -- line | phone | email
  contact TEXT NOT NULL,
  date_from TEXT NOT NULL,                 -- YYYY-MM-DD
  date_to TEXT NOT NULL,                   -- YYYY-MM-DD (window <= 60 days)
  lang TEXT,
  consent_version TEXT NOT NULL,           -- the notice the person accepted (merit.js MERIT_CONSENT_VERSION)
  status TEXT NOT NULL DEFAULT 'new'       -- new | acked
);
CREATE INDEX merit_interest_created ON merit_interest(created_at);

-- Sample items (identical to lensiq-merit-seed.js; tests/unit/backend-merit.test.js B2). Written in our own words, no real
-- temple fees, clearly marked "ตัวอย่าง / Sample / 示例" for the admin to replace.
INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) VALUES (
  'sample-tb-place-1', 'place', 'thai_buddhist',
  '{"th":"ตัวอย่าง: วัดใกล้บ้านของคุณ","en":"Sample: A temple near your home","zh":"示例：你家附近的寺庙"}',
  '{"th":"ตามความเชื่อ หลายคนไปไหว้พระและทำบุญที่วัดใกล้บ้านในวันเกิดหรือวันพระ แต่งกายสุภาพ และทำด้วยใจสงบ รายการนี้เป็นตัวอย่างให้ผู้ดูแลแทนที่ด้วยข้อมูลจริง","en":"By custom, many people pay respects and make merit at a temple near home on their birthday or on a Buddhist holy day, dressed modestly and with a calm mind. This is a sample for the admin to replace.","zh":"按照习俗，很多人会在生日或佛日到家附近的寺庙礼佛行善，穿着得体，心境平和。这是示例，请管理员替换为真实内容。"}',
  '{"th":"วัดใกล้บ้าน","en":"A temple near home","zh":"家附近的寺庙"}', '{"th":"ทุกจังหวัด","en":"Any province","zh":"任何府"}',
  '["any"]', 1, 'published', 10, 1794441600, 1794441600);
INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) VALUES (
  'sample-tb-offering-1', 'offering', 'thai_buddhist',
  '{"th":"ตัวอย่าง: ดอกไม้ ธูป เทียน","en":"Sample: Flowers, incense and candles","zh":"示例：鲜花、香和蜡烛"}',
  '{"th":"ตามธรรมเนียม นิยมถวายดอกไม้ ธูป และเทียน จุดธูปแล้วกราบสามครั้ง และตั้งใจทำความดีในชีวิตประจำวัน","en":"By tradition, people offer flowers, incense and candles, light the incense and bow three times, and set an intention to do good in daily life.","zh":"按照传统，人们供奉鲜花、香和蜡烛，点香后三拜，并发愿在日常生活中行善。"}',
  NULL, NULL,
  '["any"]', 1, 'published', 20, 1794441600, 1794441600);
INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) VALUES (
  'sample-tb-offering-2', 'offering', 'thai_buddhist',
  '{"th":"ตัวอย่าง: ไหว้พระประจำวันเกิด","en":"Sample: The Buddha posture of your birth day","zh":"示例：参拜出生日的佛像"}',
  '{"th":"ตามความเชื่อแบบไทย แต่ละวันเกิดมีพระพุทธรูปปางประจำวัน บางคนไปไหว้พระปางของวันเกิดตนและสวดมนต์สั้น ๆ ตำราแต่ละสำนักอาจต่างกัน","en":"In Thai belief each weekday of birth has its own Buddha posture. Some people pay respects to the posture of their birth day and say a short chant. Sources differ between schools.","zh":"按照泰国信仰，每个出生星期日都有对应的佛像姿态。有人会参拜自己出生日对应的佛像并念诵短经。各派说法可能不同。"}',
  NULL, NULL,
  '["domain:taksa","domain:lek7","domain:horoscope","domain:numbers"]', 1, 'published', 21, 1794441600, 1794441600);
INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) VALUES (
  'sample-tb-offering-3', 'offering', 'thai_buddhist',
  '{"th":"ตัวอย่าง: สวดมนต์และทำสมาธิช่วงที่รู้สึกเหนื่อย","en":"Sample: Chanting and quiet time when you feel tired","zh":"示例：疲惫时诵经静坐"}',
  '{"th":"ตามความเชื่อ ช่วงที่ผลดวงบอกให้ใส่ใจเป็นพิเศษ บางคนเลือกสวดมนต์ ทำสมาธิสั้น ๆ และพักผ่อนให้พอ เพื่อให้ใจนิ่งและตัดสินใจอย่างรอบคอบ","en":"By custom, when a reading suggests a time for extra care, some people chant, meditate briefly and rest well, to keep a steady mind and decide carefully.","zh":"按照习俗，当解读提示需要多加留意的时期，有人会诵经、短暂静坐并充分休息，让心安定、谨慎做决定。"}',
  NULL, NULL,
  '["weak"]', 1, 'published', 22, 1794441600, 1794441600);
INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) VALUES (
  'sample-tb-chong-1', 'chong', 'thai_buddhist',
  '{"th":"ตัวอย่าง: ทำบุญเงียบ ๆ ในปีชง","en":"Sample: Quiet merit in a clash (chong) year","zh":"示例：犯太岁之年静心行善"}',
  '{"th":"ตามความเชื่อแบบไทย บางคนเลือกใส่บาตร ทำบุญ หรือบริจาคโลหิตในปีที่ตำราว่าเป็นปีชง เพื่อให้ใจสงบและใช้ชีวิตอย่างรอบคอบมากขึ้น","en":"In Thai belief, some people give alms, make merit or donate blood in a year the texts call a clash (chong) year, to keep a calm mind and live more carefully.","zh":"按照泰国信仰，在典籍所说的犯太岁年份，有人会布施、行善或献血，以保持内心平静、更谨慎地生活。"}',
  NULL, NULL,
  '["chong"]', 1, 'published', 30, 1794441600, 1794441600);
INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) VALUES (
  'sample-tb-lucky-1', 'lucky_item', 'thai_buddhist',
  '{"th":"ตัวอย่าง: สีประจำวันในเสื้อผ้าหรือของใช้","en":"Sample: The colour of the day in clothes or small items","zh":"示例：衣物或小物件用当日颜色"}',
  '{"th":"ตามความเชื่อแบบไทย แต่ละวันมีสีประจำวัน บางคนเลือกเสื้อผ้า ผ้าเช็ดหน้า หรือเคสโทรศัพท์สีที่ถูกโฉลก เป็นการเตือนใจให้ตั้งใจทำสิ่งดี","en":"In Thai belief each day has its own colour. Some people choose clothing, a handkerchief or a phone case in a favourable colour as a reminder to do their best.","zh":"按照泰国信仰，每天都有对应的颜色。有人会选择吉利颜色的衣服、手帕或手机壳，用来提醒自己用心做好事情。"}',
  NULL, NULL,
  '["any"]', 1, 'published', 40, 1794441600, 1794441600);
INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) VALUES (
  'sample-cf-place-1', 'place', 'chinese_folk',
  '{"th":"ตัวอย่าง: ศาลเจ้าจีนใกล้บ้าน","en":"Sample: A Chinese shrine near home","zh":"示例：家附近的华人神庙"}',
  '{"th":"ตามความเชื่อแบบจีน หลายคนไปไหว้เจ้าที่ศาลเจ้าใกล้บ้านในวันชิวอิดและวันจับโหงวของเดือนจีน หรือช่วงเทศกาล ไหว้ด้วยความเคารพและช่วยรักษาความสะอาดบริเวณศาลเจ้า","en":"In Chinese folk belief, many people pay respects at a shrine near home on the 1st and 15th of the lunar month or at festivals, showing respect and keeping the shrine area clean.","zh":"按照中国民间信仰，很多人会在农历初一、十五或节日到家附近的神庙参拜，心怀敬意并保持庙内整洁。"}',
  '{"th":"ศาลเจ้าจีนใกล้บ้าน","en":"A Chinese shrine near home","zh":"家附近的华人神庙"}', '{"th":"ทุกจังหวัด","en":"Any province","zh":"任何府"}',
  '["any"]', 1, 'published', 10, 1794441600, 1794441600);
INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) VALUES (
  'sample-cf-place-2', 'place', 'chinese_folk',
  '{"th":"ตัวอย่าง: ศาลเจ้าที่มีวิหารไท้ส่วยเอี๊ย","en":"Sample: A shrine with a Tai Sui hall","zh":"示例：设有太岁殿的庙宇"}',
  '{"th":"ตามความเชื่อแบบจีน ในปีชง บางคนไปไหว้ไท้ส่วยเอี๊ย (เทพประจำปี) ที่ศาลเจ้าหรือวัดจีนที่มีวิหารนี้ ควรสอบถามเวลาเปิดและธรรมเนียมของแต่ละแห่งก่อนไป","en":"In Chinese folk belief, in a clash year some people pay respects to Tai Sui (the deity of the year) at a shrine or Chinese temple that has a Tai Sui hall. Check opening times and local customs before you go.","zh":"按照中国民间信仰，犯太岁的年份有人会到设有太岁殿的神庙或华人寺庙拜太岁。出发前请先了解开放时间和当地习俗。"}',
  '{"th":"ศาลเจ้าหรือวัดจีนที่มีวิหารไท้ส่วยเอี๊ย","en":"A shrine or Chinese temple with a Tai Sui hall","zh":"设有太岁殿的神庙或华人寺庙"}', '{"th":"ทุกจังหวัด","en":"Any province","zh":"任何府"}',
  '["chong"]', 1, 'published', 11, 1794441600, 1794441600);
INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) VALUES (
  'sample-cf-offering-1', 'offering', 'chinese_folk',
  '{"th":"ตัวอย่าง: ชุดไหว้เจ้าแบบเรียบง่าย","en":"Sample: A simple offering set","zh":"示例：简单的供品"}',
  '{"th":"ตามธรรมเนียมจีน ชุดไหว้แบบเรียบง่ายมีส้ม ขนม ธูป และเทียนแดง ปักธูปด้วยความเคารพ แล้วอธิษฐานให้ตนเองตั้งใจทำงานและดูแลครอบครัว","en":"In Chinese custom a simple offering is oranges, cakes, incense and red candles. Place the incense respectfully and make a wish to work diligently and care for your family.","zh":"按照华人习俗，简单的供品有橙子、糕点、香和红蜡烛。恭敬上香，祈愿自己勤奋工作、照顾家人。"}',
  NULL, NULL,
  '["any"]', 1, 'published', 20, 1794441600, 1794441600);
INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) VALUES (
  'sample-cf-chong-1', 'chong', 'chinese_folk',
  '{"th":"ตัวอย่าง: ไหว้ไท้ส่วยเอี๊ยหลังตรุษจีน","en":"Sample: Paying respects to Tai Sui after Chinese New Year","zh":"示例：春节后拜太岁"}',
  '{"th":"ตามธรรมเนียมจีน คนที่ตำราว่าชงกับปีนั้น นิยมไปไหว้ไท้ส่วยเอี๊ยหลังวันตรุษจีน บางแห่งให้เขียนชื่อและวันเกิดลงกระดาษแดง ทำตามธรรมเนียมของแต่ละศาลเจ้า","en":"By Chinese custom, people whose year clashes with the current one often pay respects to Tai Sui after Chinese New Year. Some shrines ask you to write your name and birth date on red paper; follow each shrine''s own custom.","zh":"按照华人习俗，与当年相冲的人常在春节后拜太岁。有些庙宇会请你把姓名和生辰写在红纸上，请依照各庙的习俗进行。"}',
  NULL, NULL,
  '["chong"]', 1, 'published', 30, 1794441600, 1794441600);
INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) VALUES (
  'sample-cf-lucky-1', 'lucky_item', 'chinese_folk',
  '{"th":"ตัวอย่าง: ของใช้สีตามธาตุที่ช่วยเสริม","en":"Sample: Items in the colour of a helpful element","zh":"示例：有益元素颜色的用品"}',
  '{"th":"ตามความเชื่อแบบจีน ธาตุไม้คู่กับสีเขียว ไฟคู่กับสีแดง ดินคู่กับสีเหลืองหรือน้ำตาล ทอง (โลหะ) คู่กับสีขาวหรือเงิน น้ำคู่กับสีดำหรือน้ำเงิน บางคนเลือกของใช้สีของธาตุที่ผลดวงว่าช่วยเสริม","en":"In Chinese belief wood goes with green, fire with red, earth with yellow or brown, metal with white or silver, and water with black or blue. Some people choose everyday items in the colour of the element their reading calls helpful.","zh":"按照中国信仰，木对应绿色，火对应红色，土对应黄色或棕色，金对应白色或银色，水对应黑色或蓝色。有人会选用解读中有益元素颜色的日常用品。"}',
  NULL, NULL,
  '["element:wood","element:fire","element:earth","element:metal","element:water","domain:bazi"]', 1, 'published', 40, 1794441600, 1794441600);
INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) VALUES (
  'sample-hb-place-1', 'place', 'hindu_brahman',
  '{"th":"ตัวอย่าง: เทวาลัยพระพิฆเนศ","en":"Sample: A Ganesha shrine","zh":"示例：象神庙"}',
  '{"th":"ตามความเชื่อฮินดู พระพิฆเนศเกี่ยวข้องกับการเริ่มต้นสิ่งใหม่ หลายคนไปไหว้ก่อนเริ่มงานใหม่หรือการเรียน ถอดรองเท้าและแต่งกายสุภาพตามที่เทวาลัยกำหนด","en":"In Hindu belief Ganesha is associated with new beginnings. Many people pay respects before starting new work or study, taking off their shoes and dressing modestly as the shrine asks.","zh":"按照印度教信仰，象神与新的开始相关。很多人会在开始新工作或学习前参拜，按庙方要求脱鞋并穿着得体。"}',
  '{"th":"เทวาลัยพระพิฆเนศ","en":"A Ganesha shrine","zh":"象神庙"}', '{"th":"ทุกจังหวัด","en":"Any province","zh":"任何府"}',
  '["any"]', 1, 'published', 10, 1794441600, 1794441600);
INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) VALUES (
  'sample-hb-offering-1', 'offering', 'hindu_brahman',
  '{"th":"ตัวอย่าง: ขนม นม ผลไม้ และดอกดาวเรือง","en":"Sample: Sweets, milk, fruit and marigolds","zh":"示例：甜点、牛奶、水果和万寿菊"}',
  '{"th":"ตามธรรมเนียมฮินดู ของถวายที่พบบ่อยคือขนมหวาน นม ผลไม้ และพวงมาลัยดอกดาวเรือง ไม่นิยมถวายเนื้อสัตว์ ถวายด้วยสองมือและใจสงบ","en":"By Hindu custom common offerings are sweets, milk, fruit and marigold garlands; meat is not offered. Offer with both hands and a calm mind.","zh":"按照印度教习俗，常见供品有甜点、牛奶、水果和万寿菊花环，不供奉肉类。请双手奉上，保持心境平和。"}',
  NULL, NULL,
  '["any"]', 1, 'published', 20, 1794441600, 1794441600);
INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) VALUES (
  'sample-hb-lucky-1', 'lucky_item', 'hindu_brahman',
  '{"th":"ตัวอย่าง: รูปเคารพขนาดเล็กบนโต๊ะทำงาน","en":"Sample: A small sacred image on your desk","zh":"示例：办公桌上的小神像"}',
  '{"th":"ตามความเชื่อฮินดู บางคนตั้งรูปเคารพขนาดเล็กไว้บนโต๊ะทำงานหรือในบ้าน วางในที่สะอาดและสูงกว่าระดับสายตาเล็กน้อย เพื่อเตือนใจให้ตั้งใจทำงาน","en":"In Hindu belief some people keep a small sacred image on their desk or at home, in a clean place a little above eye level, as a reminder to work with care.","zh":"按照印度教信仰，有人会在办公桌或家中摆放小型神像，放在干净、略高于视线的位置，提醒自己用心工作。"}',
  NULL, NULL,
  '["any"]', 1, 'published', 40, 1794441600, 1794441600);
INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) VALUES (
  'sample-ge-offering-1', 'offering', 'general',
  '{"th":"ตัวอย่าง: ทำความดีในแบบของคุณ","en":"Sample: Doing good in your own way","zh":"示例：用自己的方式行善"}',
  '{"th":"ไม่ว่าจะนับถือความเชื่อใด หลายคนเลือกช่วยเหลือผู้อื่น บริจาคของใช้ที่ยังดี หรือใช้เวลากับครอบครัว ทำตามกำลังของตน","en":"Whatever your belief, many people choose to help others, donate useful things they no longer need, or spend time with family, as far as they comfortably can.","zh":"无论信仰什么，很多人会选择帮助他人、捐出仍可使用的物品，或多陪伴家人，量力而行。"}',
  NULL, NULL,
  '["weak","any"]', 1, 'published', 25, 1794441600, 1794441600);
INSERT INTO merit_items (id, type, tradition, title, body, place, area, match_keys, sample, status, sort, created_at, updated_at) VALUES (
  'sample-ge-lucky-1', 'lucky_item', 'general',
  '{"th":"ตัวอย่าง: ของใช้สีที่ชอบและทำให้ใจสงบ","en":"Sample: An item in a colour you find calming","zh":"示例：让你平静的颜色的小物件"}',
  '{"th":"ถ้าไม่ได้ยึดถือความเชื่อใด บางคนเลือกพกของใช้สีที่ตนชอบหรือทำให้ใจสงบ เช่น ผ้าเช็ดหน้า หรือที่คั่นหนังสือ เป็นเครื่องเตือนใจเล็ก ๆ ในแต่ละวัน","en":"If you do not follow a particular tradition, you might carry an item in a colour you like or find calming, such as a handkerchief or a bookmark, as a small daily reminder.","zh":"如果你不遵循特定的信仰，可以随身携带自己喜欢或让人平静的颜色的小物件，例如手帕或书签，作为每天的小提醒。"}',
  NULL, NULL,
  '["any"]', 1, 'published', 45, 1794441600, 1794441600);
