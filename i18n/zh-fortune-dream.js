/* i18n/zh-fortune-dream.js — Simplified Chinese for dream.html / dream.js UI (Thai lives in the markup and dream.js).
   Symbol names and meanings are in i18n/zh-kb-dream.js. window.DREAM_ZH_AL = extra Chinese search words per symbol
   (used by dream.js to find symbols in a dream told in Chinese; the zh-kb name is always included). */
(function (root) {
  "use strict";
  var dict = { zh: {
    "dream.discNote": "本页不提供任何号码，也不用于博彩；梦境文字只在本机处理，不会被保存",
    "dream.textLbl": "说说你的梦（可选 · 不保存、不上传）",
    "dream.textPh": "例如：梦见家里有一条大蛇，后来坐飞机去了海边",
    "dream.selLbl": "已选象征",
    "dream.popLbl": "热门梦境",
    "dream.catsAria": "分类",
    "dream.searchLbl": "搜索象征",
    "dream.searchPh": "例如：大象 黄金 下雨",
    "dream.max8": "最多可选 8 个象征",
    "dream.cardAlt": "可分享的解梦卡片",
    "dream.statsOn": " 在本机统计次数和所选象征（不保存梦境文字）",
    "dream.principle": "原则：旧说法里不太好的梦（例如掉牙）改从过渡与放下的角度解读，不做任何不吉利的预言，也不提供博彩号码",
    "dream.catAll": "全部",
    "dream.cat.animal": "动物", "dream.cat.nature": "自然", "dream.cat.people": "人物", "dream.cat.object": "物品",
    "dream.cat.action": "行为", "dream.cat.place": "地点", "dream.cat.body": "身体",
    "dream.mood.happy": "开心", "dream.mood.excited": "兴奋", "dream.mood.calm": "平静",
    "dream.mood.anxious": "担心", "dream.mood.sad": "难过", "dream.mood.confused": "迷糊",
    "dream.time.early": "前半夜", "dream.timeRange.early": "18:00–24:00",
    "dream.time.late": "深夜", "dream.timeRange.late": "00:00–03:00",
    "dream.time.dawn": "黎明前", "dream.timeRange.dawn": "03:00–06:00",
    "dream.time.nap": "白天", "dream.timeRange.nap": "午睡",
    "dream.theme.luck": "财运", "dream.theme.love": "感情", "dream.theme.growth": "成长进步", "dream.theme.change": "变化",
    "dream.theme.support": "贵人扶持", "dream.theme.freedom": "自由与希望", "dream.theme.inner": "内心声音", "dream.theme.home": "家庭与安稳",
    "dream.theme.success": "成功", "dream.theme.renewal": "除旧迎新", "dream.theme.journey": "人生旅程", "dream.theme.wisdom": "智慧与福德",
    "dream.remove": "移除{n}",
    "dream.selEmpty": "还没有象征 — 输入你的梦，或在下方点选",
    "dream.notFound": "没有找到相关象征，换个词试试",
    "dream.errNone": "请至少选择或输入一样梦里看到的东西",
    "dream.cardH": "梦见{n}",
    "dream.cardTheme": "{t}主题 · {c}",
    "dream.typeLbl": "梦的类型：{t}",
    "dream.domLbl": "主要主题：",
    "dream.rdTitle": "解梦解读",
    "dream.statSym": "热门梦境",
    "dream.statMood": "梦中心情",
    "dream.cardKind": "解梦",
    "dream.cardFoot": "仅供娱乐，依据民间信仰，并非科学 · 不提供任何号码",
    "dream.shareTitle": "解梦 — LENSIQ",
    "dream.src.0": "《艺术与文化》杂志（silpa-mag.com）— 可搜索泰式解梦观念的文章：前兆梦、神示之梦、心绪之梦、体感之梦",
    "dream.src.1": "Wikipedia: Dream interpretation（各文化解梦概览）",
    "dream.src.2": "Wikipedia: Dream dictionary"
  } };
  if (root.LQI18N && typeof root.LQI18N.add === "function") root.LQI18N.add(dict);
  else (root.LQI18N_Q = root.LQI18N_Q || []).push(dict);
  root.DREAM_ZH_AL = {
    snake: "蛇|大蛇|眼镜蛇|蟒蛇|蛇咬|被蛇缠", elephant: "大象|白象|小象", dog: "狗|小狗|狗狗", cat: "猫|小猫|猫咪",
    fish: "鱼|钓鱼|抓鱼|金鱼|大鱼", turtle: "乌龟|海龟|龟", bird: "鸟|小鸟|鸟群|飞鸟", butterfly: "蝴蝶|毛毛虫",
    horse: "马|骑马", cow: "牛|水牛|黄牛", pig: "猪|小猪", chicken: "鸡|公鸡|母鸡", tiger: "老虎|虎",
    monkey: "猴子|猴", mouse: "老鼠|鼠", crocodile: "鳄鱼", naga: "那伽|神龙|龙王|龙", bee: "蜜蜂|蜂",
    ant: "蚂蚁", frog: "青蛙|蛤蟆", spider: "蜘蛛", crab: "虾蟹贝类|螃蟹|虾|贝壳|蟹", egg: "蛋|鸡蛋",
    rain: "下雨|大雨|雨", thunder: "打雷|闪电|雷", rainbow: "彩虹", sun: "太阳|阳光", moon: "月亮|满月|月光",
    star: "星星|星空", sea: "大海|海边|海洋|海", river: "河流|河边|小河|小溪|江边", flood: "发大水|洪水|大水|淹水",
    mountain: "高山|爬山|山顶", tree: "大树|树", flower: "花|鲜花|莲花|荷花", fruit: "水果|果子", fire: "火|大火|火光|着火",
    snow: "雪|下雪", wind: "大风|刮风|狂风", cave: "山洞|洞穴|隧道", wedding: "婚礼|结婚|新娘|新郎", baby: "婴儿|宝宝",
    pregnant: "怀孕|有孕", ex: "前任|前男友|前女友", lover: "恋人|男朋友|女朋友|爱人|暗恋", parents: "父母|爸爸|妈妈|母亲|父亲",
    elder: "老人|爷爷|奶奶|外婆|外公", ancestor: "已故亲人|去世的亲人|过世的", teacher: "老师", monk: "僧人|和尚|师父",
    friend: "朋友|好朋友", stranger: "陌生人", celebrity: "明星|名人|偶像", child: "孩子|小孩|小朋友", money: "钱|钞票|现金",
    gold: "黄金|金子|金项链", ring: "戒指", gem: "宝石|钻石", key: "钥匙", door: "门|大门", stairs: "楼梯|台阶",
    car: "汽车|开车|车", plane: "飞机|坐飞机", boat: "船|坐船", train: "火车|高铁", mirror: "镜子", phone: "电话|手机",
    letter: "信件|礼物|收到信", book: "书|看书", shoes: "鞋子|鞋", clothes: "新衣服|衣服", bag: "背包|行李|包包", clock: "钟表|手表|时钟",
    umbrella: "雨伞|伞", candle: "蜡烛|烛光", buddha: "佛像|佛祖", food: "食物|吃饭|美食", house: "房子|家里|新家",
    temple: "寺庙|庙", school: "学校|教室", market: "市场|买东西|购物", office: "办公室|公司|上班", bridge: "桥",
    road: "道路|马路|路上", hotel: "酒店|旅馆", bathroom: "洗澡|浴室|洗手间", fly: "会飞|飞起来|在天上飞|飞翔",
    fall: "从高处掉落|掉下来|坠落|摔下", swim: "游泳", run: "奔跑|跑步", chased: "被人追|被追|追赶", lost: "迷路|找不到路",
    exam: "考试", cry: "哭泣|哭", laugh: "开怀大笑|大笑|笑", dance: "跳舞唱歌|跳舞|唱歌", travel: "旅行|旅游|出门",
    move: "搬家", merit: "做功德|行善|诵经|拜佛", argue: "吵架|争吵", win: "得奖|获奖|赢了", teeth: "掉牙|牙齿掉|牙掉了",
    hair: "剪头发|理发|头发", hands: "手|握手"
  };
  if (typeof module === "object" && module.exports) module.exports = dict;
})(typeof window !== "undefined" ? window : globalThis);
