export const cards = [
  { id: "ticket", name: "机票卡", description: "前进 4 格。", category: "neutral", type: "move", icon: "✈", value: 4 },
  { id: "vip", name: "VIP卡", description: "免收过路费一次", category: "positive", type: "shield", icon: "✦" },
  { id: "encore", name: "加场卡", description: "本回合获得的地块收益提高 50%。", category: "positive", type: "income", icon: "♬" },
  { id: "red_packet", name: "鸟蛋卡", description: "IBM的新鸟蛋，对指定格的房产升一级", category: "positive", type: "upgrade_tile", icon: "♡" },
  { id: "lucky", name: "幸运鸟", description: "使用后随机事件奖励翻倍。", category: "positive", type: "luck", icon: "☼" },
  { id: "repair", name: "休息卡", description: "鸟鸟大王要休息一段时间，原地停留一回合。", category: "negative", type: "rest", icon: "↻" },
  { id: "spotlight", name: "涨价卡", description: "对指定地段的所有房屋涨价两回合", category: "neutral", type: "money", icon: "☀", value: 180 },
  { id: "cheer", name: "应援补给", description: "使用后增加一次掷骰子机会。", category: "positive", type: "money", icon: "♥", value: 260 },
  { id: "good_luck", name: "好事成双", description: "可选择一张当前已有的卡牌复制", category: "positive", type: "luck", icon: "✧" },
  { id: "move_anywhere", name: "遥控骰子", description: "使用后可自定义骰子点数", category: "positive", type: "luck", icon: "✧" },
  { id: "monsters", name: "怪兽卡", description: "你和主办吵架，前面这栋房子太碍事了，挡住了舞台视野，恰巧市长路过，决定铲除这栋房子变成空地。", category: "negative", type: "destroy", icon: "✧" },
  { id: "audit", name: "查税卡", description: "和小鸟一起唱鸭梨大，这一次你买单！随机指定一个人获得其10%现金", category: "neutral", type: "luck", icon: "☼" },
];

export const positiveCards = cards.filter((card) => card.category === "positive");
export const negativeCards = cards.filter((card) => card.category === "negative");
export const neutralCards = cards.filter((card) => card.category === "neutral");
