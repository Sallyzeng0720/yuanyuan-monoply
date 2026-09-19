export const STARTING_MONEY = 2800;
export const START_PASS_BONUS = 200;
export const MAX_ROUNDS = 30;

function createAbilityState(character) {
  if (character.ability.id === "income") return { activeSkillUses: 3, immunityUses: 0 };
  if (character.ability.id === "card") return { activeSkillUses: 0, immunityUses: 2 };
  if (character.ability.id === "upgrade") return { activeSkillUses: 1, immunityUses: 0 };
  return { activeSkillUses: null, immunityUses: 0 };
}

export function calculateRent(tile, owner, visitor, cardRentBonus = 0) {
  if (!owner || owner.id === visitor.id) return 0;
  const levelMultiplier = 1 + (tile.level - 1) * 0.55;
  // 涨价卡：被指定的地块两回合内过路费翻倍。
  const boostMultiplier = tile.boostRounds > 0 ? 2 : 1;
  const raw = tile.baseRent * levelMultiplier * (1 + cardRentBonus) * boostMultiplier;
  return Math.max(0, Math.round(raw * (1 - (visitor.character.stats.defenseBonus || 0))));
}

export function calculateAsset(player, board) {
  const propertyValue = player.properties.reduce((sum, id) => {
    const tile = board.find((item) => item.id === id);
    if (!tile) return sum;
    return sum + tile.price + (tile.level - 1) * tile.upgradeCost;
  }, 0);
  return player.money + propertyValue;
}

export function getNextPosition(position, steps, boardLength) {
  return (position + steps) % boardLength;
}

export function chooseAiAction(ai, tile, random = Math.random) {
  if (tile.type !== "property" || tile.owner) return "pass";
  const reserve = ai.personality === "conservative" ? 1000 : ai.personality === "aggressive" ? 450 : 700;
  const appetite = ai.personality === "business" ? 1.1 : ai.personality === "aggressive" ? 1.2 : 0.82;
  return ai.money - tile.price >= reserve && random() < appetite ? "buy" : "pass";
}

export function createTiles(config) {
  return config.map((tile) => ({ ...tile, level: tile.type === "property" ? 1 : 0, owner: null, boostRounds: 0 }));
}

export function createPlayers(characters) {
  const personalities = ["conservative", "business", "aggressive"];
  return characters.map((character, index) => ({
    ...createAbilityState(character),
    id: index === 0 ? "player" : `ai_${index}`,
    name: index === 0 ? "你" : character.name,
    character,
    position: 0,
    money: STARTING_MONEY,
    properties: [],
    cards: [],
    lastRoll: null,
    hasRolledThisTurn: false,
    cardLockedThisTurn: false,
    extraRolls: 0,
    skipTurns: 0,
    shield: false,
    rentBoost: 0,
    luckyNext: false,
    // 遥控骰子卡选定的点数：下次掷骰强制使用，掷完清空。
    forcedRoll: null,
    // 涨价卡：本玩家名下被指定涨价的地块 id（有效期两回合）。
    boostedTiles: [],
    personality: index === 0 ? "player" : personalities[index - 1],
    bankrupt: false
  }));
}
