const propertyNames = [
  "鸟巢", "萌萌鸟的朋友们快闪", "远房", "呆鸟小窝",
  "聪明鸡大学", "鸟花园", "鸟蛋孵化基地", "鸟鸟商场",
  "鸟鸟大饭店", "鸟鸟车站", "鸟鸟银行", "鸟鸟之家",
  "鸟鸟码头", "肯德鸡", "元宝大别墅", "小笨鸡礼堂"
];

const propertyThemes = [
  "#ffcf70", "#ffcf70", "#91d9c2", "#91d9c2", "#91d9c2",
  "#9dc6f3", "#9dc6f3", "#9dc6f3", "#f0a7c2", "#f0a7c2",
  "#f0a7c2", "#f4a261", "#f4a261", "#f4a261", "#a8dadc",
  "#a8dadc"
];

const route = [
  { type: "start", name: "起点", theme: "#f7c948" },
  { type: "property" },
  { type: "property" },
  { type: "event", name: "随机事件", theme: "#ec8b5e" },
  { type: "property" },
  { type: "card", name: "卡牌格", theme: "#8e7dcb" },
  { type: "reward", name: "奖励格", theme: "#f0ad4e" },
  { type: "property" },
  { type: "rest", name: "休息格", theme: "#8ec5a4" },
  { type: "property" },
  { type: "event", name: "随机事件", theme: "#ec8b5e" },
  { type: "property" },
  { type: "teleport", name: "传送门", theme: "#6e9de0" },
  { type: "property" },
  { type: "card", name: "卡牌格", theme: "#8e7dcb" },
  { type: "property" },
  { type: "event", name: "随机事件", theme: "#ec8b5e" },
  { type: "property" },
  { type: "reward", name: "奖励格", theme: "#f0ad4e" },
  { type: "rest", name: "休息格", theme: "#8ec5a4" },
  { type: "property" },
  { type: "card", name: "卡牌格", theme: "#8e7dcb" },
  { type: "property" },
  { type: "event", name: "随机事件", theme: "#ec8b5e" },
  { type: "property" },
  { type: "teleport", name: "传送门", theme: "#6e9de0" },
  { type: "property" },
  { type: "reward", name: "奖励格", theme: "#f0ad4e" },
  { type: "property" },
  { type: "event", name: "随机事件", theme: "#ec8b5e" },
  { type: "property" },
  { type: "card", name: "卡牌格", theme: "#8e7dcb" },
  { type: "rest", name: "休息格", theme: "#8ec5a4" },
  { type: "property" }
];

let propertyIndex = 0;

export const boardConfig = route.map((space, id) => {
  if (space.type !== "property") return { id, ...space };
  const index = propertyIndex++;
  return {
    id,
    name: propertyNames[index],
    type: "property",
    price: 420 + (index % 6) * 75,
    baseRent: 75 + (index % 6) * 18,
    upgradeCost: 170 + (index % 4) * 45,
    theme: propertyThemes[index]
  };
});
