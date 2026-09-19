export const characters = [
  {
    id: "character_01",
    name: "玫瑰鸟",
    description: "这是什么？我看不见！",
    avatar: "/assets/characters/character_01/avatar.png",
    sprite: "/assets/characters/character_01/idle.png",
    ability: { id: "income", name: "这是什么？我看不见！", description: "使用技能将当前格建筑夷为平地，全局游戏可使用3次" },
    stats: { incomeBonus: 0, movementBonus: 0, eventBonus: 0, cardBonus: 0, defenseBonus: 0 },
    theme: "#f6b73c",
    badge: "A"
  },
  {
    id: "character_02",
    name: "朱雀",
    description: "朱雀鸟为你带来了好运！",
    avatar: "/assets/characters/character_02/avatar.png",
    sprite: "/assets/characters/character_02/idle.png",
    ability: { id: "move", name: "Bird can fly！", description: "每回合第一次掷骰子额外前进 1 格。" },
    stats: { incomeBonus: 0, movementBonus: 1, eventBonus: 0, cardBonus: 0, defenseBonus: 0 },
    theme: "#5aa9e6",
    badge: "B"
  },
  {
    id: "character_03",
    name: "骑士鸟",
    description: "骑士鸟帮你抵挡了前方的危险",
    avatar: "/assets/characters/character_03/avatar.png",
    sprite: "/assets/characters/character_03/idle.png",
    ability: { id: "event", name: "守护ybj！", description: "随机事件奖励提高 25%，负面事件损失降低 25%。" },
    stats: { incomeBonus: 0, movementBonus: 0, eventBonus: 0.25, cardBonus: 0, defenseBonus: 0.25 },
    theme: "#ef709d",
    badge: "C"
  },
  {
    id: "character_04",
    name: "牧师鸟",
    description: "牧师鸟拥有着一颗纯净的心灵",
    avatar: "/assets/characters/character_04/avatar.png",
    sprite: "/assets/characters/character_04/idle.png",
    ability: { id: "card", name: "不雅不雅！通通净化！", description: "免疫罚款，原地停留的负面效果，全局可用2次" },
    stats: { incomeBonus: 0, movementBonus: 0, eventBonus: 0, cardBonus: 0, defenseBonus: 0 },
    theme: "#9b7ede",
    badge: "D"
  },
  {
    id: "character_05",
    name: "海神鸟",
    description: "拥有海神力量的海神鸟",
    avatar: "/assets/characters/character_05/avatar.png",
    sprite: "/assets/characters/character_05/idle.png",
    ability: { id: "defense", name: "发大水了！", description: "将当前格建筑降一级，若当前格为平地，则无法生效" },
    stats: { incomeBonus: 0, movementBonus: 0, eventBonus: 0, cardBonus: 0, defenseBonus: 0.25 },
    theme: "#6cc5a1",
    badge: "E"
  },
  {
    id: "character_06",
    name: "牛仔鸟",
    description: "哇啪～牛仔鸟早早携马儿回到了起点",
    avatar: "/assets/characters/character_06/avatar.png",
    sprite: "/assets/characters/character_06/idle.png",
    ability: { id: "property", name: "坐骑也能有补贴吗？", description: "经过起点时额外获得20元" },
    stats: { incomeBonus: 20, movementBonus: 0, eventBonus: 0, cardBonus: 0, defenseBonus: 0 },
    theme: "#f28f6b",
    badge: "F"
  },
  {
    id: "character_07",
    name: "总裁鸟",
    description: "遇到意气风发的总裁鸟",
    avatar: "/assets/characters/character_07/avatar.png",
    sprite: "/assets/characters/character_07/idle.png",
    ability: { id: "luck", name: "鸟鸟有黑卡！", description: "获得卡牌时有 30% 概率额外获得 1 张。" },
    stats: { incomeBonus: 0, movementBonus: 0, eventBonus: 0, cardBonus: 0.3, defenseBonus: 0 },
    theme: "#e8c547",
    badge: "G"
  },
  {
    id: "character_08",
    name: "魔法鸟",
    description: "鸟鸟是魔法师哦！",
    avatar: "/assets/characters/character_08/avatar.png",
    sprite: "/assets/characters/character_08/idle.png",
    ability: { id: "upgrade", name: "舞台掌控", description: "和在场指定一名玩家交换位置，全局限用一次。" },
    stats: { incomeBonus: 0, movementBonus: 0, eventBonus: 0, cardBonus: 0, defenseBonus: 0 },
    theme: "#4f7cac",
    badge: "H"
  }
];
