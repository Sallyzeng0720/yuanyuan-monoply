import test from "node:test";
import assert from "node:assert/strict";
import { calculateRent, createPlayers, createTiles, getNextPosition } from "../src/game/engine.js";
import { boardConfig } from "../src/data/board.js";
import { characters } from "../src/data/characters.js";
import { cards, negativeCards, neutralCards, positiveCards } from "../src/data/cards.js";
import { eventPool } from "../src/data/events.js";
import { GameManager } from "../src/game/GameManager.js";

function randomForEvent(title) {
  const index = eventPool.findIndex((event) => event.title === title);
  assert.notEqual(index, -1);
  return () => (index + 0.01) / eventPool.length;
}

test("棋盘配置有34个格子，且拥有特殊格", () => {
  assert.equal(boardConfig.length, 34);
  assert.equal(boardConfig.filter((tile) => tile.type === "property").length, 16);
  assert.equal(boardConfig.filter((tile) => tile.type === "reward").length, 3);
  assert.ok(boardConfig.some((tile) => tile.type === "event"));
  assert.ok(boardConfig.some((tile) => tile.type === "card"));
  assert.ok(boardConfig.some((tile) => tile.type === "teleport"));
});

test("特殊格沿路线分散，地产不会全部连续堆在一起", () => {
  const specialPositions = boardConfig
    .filter((tile) => tile.type !== "property")
    .map((tile) => tile.id);
  assert.ok(specialPositions.length >= 10);
  assert.ok(specialPositions.every((position, index) => index === 0 || position - specialPositions[index - 1] <= 4));
  assert.ok(boardConfig.some((tile, index) => tile.type === "property" && boardConfig[(index + 1) % boardConfig.length].type !== "property"));
  assert.equal(boardConfig.filter((tile) => tile.type === "event").length, 5);
  assert.equal(boardConfig.filter((tile) => tile.type === "card").length, 4);
});

test("地产使用新的主题名称且名称不重复", () => {
  const names = boardConfig.filter((tile) => tile.type === "property").map((tile) => tile.name);
  assert.equal(names.length, 16);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes("鸟巢"));
  assert.ok(names.includes("小笨鸡礼堂"));
});

test("卡牌池达到第一期建议数量，并且可配置", () => {
  assert.ok(cards.length >= 10);
  assert.ok(cards.every((card) => card.id && card.name && card.description && card.type && card.category));
});

test("卡牌按正面、负面和中性三类整理", () => {
  assert.equal(positiveCards.length + negativeCards.length + neutralCards.length, cards.length);
  assert.equal(new Set(cards.map((card) => card.category)).size, 3);
  assert.ok(positiveCards.some((card) => card.id === "cheer"));
  assert.ok(negativeCards.some((card) => card.id === "repair"));
  assert.ok(neutralCards.some((card) => card.id === "ticket"));
});

test("随机事件配置都能被当前游戏逻辑识别", () => {
  const supportedTypes = new Set(["money", "move", "card", "cost_card", "extra_roll", "cost_extra_roll", "highest_pays", "all_money", "cost_or_start", "all_gift", "pay_all", "lose_property", "rest"]);
  const typesRequiringValue = new Set(["money", "move", "cost_card", "cost_extra_roll", "highest_pays", "all_money", "cost_or_start", "all_gift", "pay_all"]);
  assert.ok(eventPool.length >= 20);
  assert.ok(eventPool.every((event) => ["chance", "fate", "event"].includes(event.deck)));
  assert.ok(eventPool.every((event) => event.title && event.description && supportedTypes.has(event.type)));
  assert.ok(eventPool.every((event) => !typesRequiringValue.has(event.type) || typeof event.value === "number"));
});

test("机会、命运和随机事件都会生成弹窗结果", async () => {
  for (const event of eventPool) {
    let effect;
    const game = new GameManager({
      random: randomForEvent(event.title),
      moveDelay: 0,
      onEffect: (nextEffect) => { effect = nextEffect; }
    });
    game.setCharacters(characters);
    game.start("character_01");
    const player = game.players[0];
    player.position = boardConfig.find((tile) => tile.type === "event").id;
    await game.resolveTile(player);
    assert.equal(effect.kind, "event", event.title);
    assert.equal(effect.deck, event.deck, event.title);
    assert.ok(effect.title, event.title);
    assert.ok(effect.description, event.title);
  }
});

test("获得卡牌时不会自动触发效果，只有使用后才结算", async () => {
  const game = new GameManager({
    moveDelay: 0,
    rollAnimationSteps: 0,
    rollAnimationDelay: 0
  });
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  const moneyCard = cards.find((card) => card.id === "cheer");
  const before = player.money;

  player.cards.push(moneyCard);
  assert.equal(player.money, before);
  assert.equal(await game.useCard("player", player.cards.length - 1), true);
  assert.equal(player.money, before + moneyCard.value);
});

test("鸟蛋卡会把指定地块升一级", async () => {
  const game = new GameManager({
    moveDelay: 0,
    rollAnimationSteps: 0,
    rollAnimationDelay: 0,
    onEffect: async () => undefined
  });
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  const eggCard = cards.find((card) => card.id === "red_packet");
  const tile = game.tiles.find((item) => item.type === "property");
  const before = tile.level;

  player.cards.push(eggCard);
  assert.equal(await game.useCard("player", player.cards.length - 1), true);
  assert.equal(game.pendingCardUpgrade, "red_packet");
  assert.equal(tile.level, before);

  assert.equal(await game.confirmCardUpgrade(tile.id), true);
  assert.equal(tile.level, before + 1);
  assert.equal(game.pendingCardUpgrade, null);
});

test("鸟蛋卡不能把地块升到4级以上", () => {
  const game = new GameManager({ moveDelay: 0, rollAnimationSteps: 0, rollAnimationDelay: 0 });
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  const tile = game.tiles.find((item) => item.type === "property");
  tile.level = 4;
  assert.equal(game.upgradeTileByCard(player, tile.id), false);
  assert.equal(tile.level, 4);
});

test("角色选择生成1位玩家和3位AI，且角色不重复", () => {
  const players = createPlayers(characters.slice(0, 4));
  assert.equal(players.length, 4);
  assert.equal(new Set(players.map((player) => player.character.id)).size, 4);
  assert.equal(players[1].name, characters[1].name);
  assert.equal(players[2].name, characters[2].name);
  assert.equal(players[3].name, characters[3].name);
});

test("移动会在棋盘边界循环", () => {
  assert.equal(getNextPosition(32, 4, 34), 2);
  assert.equal(getNextPosition(0, 6, 34), 6);
});

test("等级和防御能力会影响过路费", () => {
  const [owner, visitor] = createPlayers(characters.slice(0, 2));
  const tile = { baseRent: 100, level: 3 };
  const normal = calculateRent(tile, owner, visitor);
  visitor.character.stats.defenseBonus = 0.25;
  const defended = calculateRent(tile, owner, visitor);
  assert.equal(normal, 210);
  assert.equal(defended, 158);
});

function makeGame(overrides = {}) {
  return new GameManager({
    moveDelay: 0,
    rollAnimationSteps: 0,
    rollAnimationDelay: 0,
    actionDelay: 0,
    onEffect: async () => undefined,
    ...overrides
  });
}

test("付不起过路费时会变卖资产，仍不足才破产", () => {
  const game = makeGame();
  game.setCharacters(characters);
  game.start("character_01");
  const [player, victim] = game.players;
  const tile = game.tiles.find((item) => item.type === "property");
  tile.owner = player.id;
  tile.level = 1;
  player.properties.push(tile.id);
  const ownerMoney = player.money;
  victim.money = 500;
  victim.properties = [];

  const paid = game.chargePlayer(victim, 300);

  assert.equal(paid, 300);
  assert.equal(victim.money, 200);
  assert.equal(victim.bankrupt, false);
  assert.equal(player.money, ownerMoney);
});

test("破产时现金归零、房产被清算回收，并退出竞争", () => {
  const game = makeGame();
  game.setCharacters(characters);
  game.start("character_01");
  const victim = game.players[1];
  const tile = game.tiles.find((item) => item.type === "property");
  tile.owner = victim.id;
  victim.properties.push(tile.id);
  victim.money = 100;

  game.chargePlayer(victim, 9999);

  assert.equal(victim.bankrupt, true);
  assert.equal(victim.money, 0);
  assert.equal(victim.properties.length, 0);
  assert.equal(tile.owner, null);
});

test("事件扣款也会走统一的破产判定", async () => {
  const eventIndex = eventPool.findIndex((event) => event.type === "money" && event.value < 0);
  assert.notEqual(eventIndex, -1);
  const game = makeGame({ random: () => (eventIndex + 0.01) / eventPool.length });
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  player.money = 0;
  player.properties = [];

  await game.triggerEvent(player);

  assert.equal(player.bankrupt, true);
  assert.equal(player.money, 0);
});

test("只剩一名未破产玩家时对局结束", () => {
  const game = makeGame();
  game.setCharacters(characters);
  game.start("character_01");
  game.players.slice(1).forEach((player) => game.markBankrupt(player));

  game.endTurn();

  assert.equal(game.phase, "finished");
  assert.equal(game.winner[0].id, "player");
});

test("地块状态初始没有拥有者，地产从1级开始", () => {
  const tiles = createTiles(boardConfig);
  const property = tiles.find((tile) => tile.type === "property");
  assert.equal(property.owner, null);
  assert.equal(property.level, 1);
});

test("真实游戏对象可以完成开局和一轮玩家行动", async () => {
  const events = [];
  const game = new GameManager({
    random: () => 0.01,
    moveDelay: 0,
    rollAnimationSteps: 0,
    rollAnimationDelay: 0,
    onLog: (message) => events.push(message)
  });
  game.setCharacters(characters);
  game.start("character_01");
  await game.rollForHuman();
  assert.equal(game.players.length, 4);
  assert.equal(game.phase, "playing");
  assert.equal(game.round, 1);
  assert.equal(game.players[0].position, 1);
  assert.equal(game.players[0].lastRoll, 1);
  assert.ok(events.some((message) => message.includes("掷出了 1 点")));
  assert.equal(game.currentPlayer.id, "player");
  assert.equal(game.pendingPurchase, 1);
});

test("游戏管理器构造时会先产生选择界面状态", () => {
  let received;
  const game = new GameManager({ onStateChange: (state) => { received = state; } });
  assert.equal(received.phase, "select");
  assert.equal(game.selectedCharacterId, null);
});

test("默认回合节奏会给骰子和AI操作留出可见时间", () => {
  const game = new GameManager();
  assert.equal(game.moveDelay, 420);
  assert.equal(game.rollAnimationDelay, 140);
  assert.equal(game.actionDelay, 850);
});

test("落地效果会携带弹窗所需的标题和结果描述", async () => {
  let effect;
  const game = new GameManager({
    random: () => 0.01,
    moveDelay: 0,
    rollAnimationSteps: 0,
    rollAnimationDelay: 0,
    onEffect: (nextEffect) => { effect = nextEffect; }
  });
  game.setCharacters(characters);
  game.start("character_01");
  await game.rollForHuman();
  assert.equal(effect.title, boardConfig.find((tile) => tile.type === "property").name);
  assert.match(effect.description, /420/);
  assert.equal(effect.requiresDecision, true);
});

test("玩家落到无人地块后可以购买，并在购买后切换到AI", async () => {
  const game = new GameManager({ random: () => 0.01, moveDelay: 0, rollAnimationSteps: 0, rollAnimationDelay: 0 });
  game.setCharacters(characters);
  game.start("character_01");
  await game.rollForHuman();
  assert.equal(game.pendingPurchase, 1);
  assert.equal(game.currentPlayer.id, "player");
  assert.equal(await game.buyCurrentProperty(), true);
  assert.equal(game.tiles[1].owner, "player");
  assert.equal(game.pendingPurchase, null);
  assert.equal(game.currentPlayer.id, "ai_1");
});

test("玩家只有再次落到自己的地块时才能升级", async () => {
  const game = new GameManager({
    random: () => 0.01,
    moveDelay: 0,
    rollAnimationSteps: 0,
    rollAnimationDelay: 0
  });
  game.setCharacters(characters);
  game.start("character_01");
  await game.rollForHuman();
  assert.equal(game.pendingPurchase, 1);
  assert.equal(game.pendingUpgrade, null);
  await game.buyCurrentProperty();
  game.currentPlayerIndex = 0;
  game.players[0].position = 0;
  game.players[0].hasRolledThisTurn = false;
  await game.takeTurn(game.players[0]);
  assert.equal(game.pendingUpgrade, 1);
  assert.equal(game.pendingPurchase, null);
  assert.equal(game.currentPlayer.id, "player");
});

test("普通效果完成前不会切换到下一位玩家", async () => {
  let releaseEffect;
  const effectPromise = new Promise((resolve) => { releaseEffect = resolve; });
  const game = new GameManager({
    random: () => 0.01,
    moveDelay: 0,
    rollAnimationSteps: 0,
    rollAnimationDelay: 0,
    onEffect: (effect) => effect.requiresDecision ? undefined : effectPromise
  });
  game.setCharacters(characters);
  game.start("character_01");
  game.players[0].position = 2;
  const turn = game.takeTurn(game.players[0]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(game.currentPlayer.id, "player");
  assert.equal(game.busy, true);
  releaseEffect();
  await turn;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(game.currentPlayer.id, "ai_1");
});

test("对手买地弹窗使用角色名称而不是玩家口吻", async () => {
  let effect;
  const game = new GameManager({
    random: () => 0.01,
    moveDelay: 0,
    rollAnimationSteps: 0,
    rollAnimationDelay: 0,
    onEffect: (nextEffect) => { effect = nextEffect; }
  });
  game.setCharacters(characters);
  game.start("character_01");
  game.currentPlayerIndex = 1;
  game.players[1].position = 0;
  await game.takeTurn(game.players[1]);
  assert.equal(effect.kind, "purchase");
  assert.match(effect.description, /^朱雀买下了/);
  assert.doesNotMatch(effect.description, /你/);
});

test("对手当回合买地后不能立刻升级", async () => {
  const game = new GameManager({
    random: () => 0.01,
    moveDelay: 0,
    rollAnimationSteps: 0,
    rollAnimationDelay: 0,
    actionDelay: 0,
    onEffect: () => {}
  });
  game.setCharacters(characters);
  game.start("character_01");
  game.currentPlayerIndex = 1;
  game.players[1].position = 0;
  await game.takeTurn(game.players[1]);
  assert.equal(game.players[1].position, 2);
  assert.equal(game.tiles[2].owner, "ai_1");
  assert.equal(game.tiles[2].level, 1);
});

test("建筑等级上限为4级，不能继续升级", () => {
  const game = new GameManager();
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  const tile = game.tiles[1];
  tile.owner = player.id;
  tile.level = 4;
  player.properties.push(tile.id);
  assert.equal(game.upgradeProperty(player, tile.id), false);
  assert.equal(tile.level, 4);
});

test("机会事件可以买票抽卡并扣除50远气", () => {
  const game = new GameManager({ random: randomForEvent("买彩票") });
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  game.triggerEvent(player);
  assert.equal(player.money, 2750);
  assert.equal(player.cards.length, 1);
  assert.equal(game.lastEffect.deck, "chance");
});

test("机会事件可以给所有在场玩家增加200远气", () => {
  const game = new GameManager({ random: randomForEvent("鸟鸟大王的小花") });
  game.setCharacters(characters);
  game.start("character_01");
  const before = game.players.map((player) => player.money);
  game.triggerEvent(game.players[0]);
  game.players.forEach((player, index) => assert.equal(player.money - before[index], 200));
});

test("机会事件会记录额外掷骰机会", () => {
  const game = new GameManager({ random: randomForEvent("作品被伯德本人翻牌") });
  game.setCharacters(characters);
  game.start("character_01");
  game.triggerEvent(game.players[0]);
  assert.equal(game.players[0].extraRolls, 1);
  assert.equal(game.lastEffect.deck, "chance");
});

test("命运事件支付保护费后会获得额外掷骰机会", () => {
  const game = new GameManager({ random: randomForEvent("保护费") });
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  const before = player.money;
  game.triggerEvent(player);
  assert.equal(player.money, before - 500);
  assert.equal(player.extraRolls, 1);
  assert.match(game.lastEffect.description, /额外掷骰/);
  assert.equal(game.lastEffect.deck, "fate");
});

test("命运事件资金不足时不会发放额外掷骰机会", async () => {
  const game = new GameManager({ random: randomForEvent("保护费") });
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  player.money = 499;
  await game.triggerEvent(player);
  assert.equal(player.money, 499);
  assert.equal(player.extraRolls, 0);
  assert.match(game.lastEffect.outcome, /资金不足/);
});

test("额外掷骰可以再次行动，但仍不能使用卡牌", async () => {
  const game = new GameManager({
    random: () => 0.01,
    moveDelay: 0,
    rollAnimationSteps: 0,
    rollAnimationDelay: 0
  });
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  player.extraRolls = 1;
  player.cards.push({ id: "test-money", name: "测试补给", type: "money", value: 100, icon: "♡", description: "获得 100 远气。" });
  await game.takeTurn(player);
  assert.equal(player.extraRolls, 0);
  assert.equal(player.hasRolledThisTurn, false);
  assert.equal(player.cardLockedThisTurn, true);
  assert.equal(game.currentPlayer.id, "player");
  assert.equal(await game.useCard("player", 0), false);
});

test("移动卡到达事件格后会触发落地事件", async () => {
  let effect;
  const game = new GameManager({
    random: () => 0.01,
    moveDelay: 0,
    rollAnimationSteps: 0,
    rollAnimationDelay: 0,
    onEffect: (nextEffect) => { effect = nextEffect; }
  });
  game.setCharacters(characters);
  game.start("character_01");
  game.players[0].cards.push({ id: "test-move", name: "测试移动卡", type: "move", value: 3, icon: "»", description: "前进 3 格。" });
  assert.equal(await game.useCard("player", 0), true);
  assert.equal(game.players[0].position, 3);
  assert.equal(effect.kind, "event");
  assert.equal(game.players[0].hasRolledThisTurn, false);
});

test("使用卡牌后不会卡死：busy 释放且可以继续掷骰", async () => {
  const game = makeGame();
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  player.cards.push({ id: "test-money", name: "测试补给", type: "money", value: 100, icon: "♡", description: "获得 100 远气。" });

  assert.equal(await game.useCard("player", 0), true);

  assert.equal(game.busy, false);
  assert.equal(player.cards.length, 0);
  assert.equal(game.canCurrentPlayerRoll(), true);
});

test("鸟蛋卡等待选地块时不能掷骰，确认后恢复正常", async () => {
  const game = makeGame();
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  const tile = game.tiles.find((item) => item.type === "property");
  const before = tile.level;
  player.cards.push({ id: "red_packet", name: "鸟蛋卡", type: "upgrade_tile", icon: "♡", description: "升一级" });

  assert.equal(await game.useCard("player", 0), true);
  assert.equal(game.pendingCardUpgrade, "red_packet");
  assert.equal(game.busy, true, "等待选地块时保持 busy，防止重复操作");
  assert.equal(game.canCurrentPlayerRoll(), false, "等待选地块时不该允许掷骰");

  assert.equal(await game.confirmCardUpgrade(tile.id), true);
  assert.equal(tile.level, before + 1);
  assert.equal(game.pendingCardUpgrade, null);
});

test("悬空的地块决策可以用 resolvePendingDecision 兜底解除", async () => {
  const game = makeGame();
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  player.cards.push({ id: "red_packet", name: "鸟蛋卡", type: "upgrade_tile", icon: "♡", description: "升一级" });
  game.pendingCardUpgrade = "red_packet";
  game.pendingPurchase = 5;

  assert.equal(game.resolvePendingDecision(), true);
  assert.equal(game.pendingCardUpgrade, null);
  assert.equal(game.pendingPurchase, null);
  assert.equal(game.busy, false);
});

test("玩家掷骰后本回合不能再使用卡牌", async () => {
  const game = new GameManager({
    random: () => 0.01,
    moveDelay: 0,
    rollAnimationSteps: 0,
    rollAnimationDelay: 0
  });
  game.setCharacters(characters);
  game.start("character_01");
  game.players[0].cards.push({ id: "test-money", name: "测试补给", type: "money", value: 100, icon: "♡", description: "获得 100 远气。" });
  await game.rollForHuman();
  assert.equal(game.players[0].hasRolledThisTurn, true);
  assert.equal(await game.useCard("player", 0), false);
  assert.equal(game.players[0].cards.length, 1);
});

test("玩家同一回合只能掷一次骰子", async () => {
  const game = new GameManager({
    random: () => 0.01,
    moveDelay: 0,
    rollAnimationSteps: 0,
    rollAnimationDelay: 0
  });
  game.setCharacters(characters);
  game.start("character_01");
  await game.rollForHuman();
  const firstRoll = game.players[0].lastRoll;
  assert.equal(game.players[0].hasRolledThisTurn, true);
  assert.equal(game.pendingPurchase, 1);
  assert.equal(game.canCurrentPlayerRoll(), false);
  assert.equal(await game.rollForHuman(), false);
  assert.equal(game.players[0].lastRoll, firstRoll);
});

test("经过起点基础领取200，牛仔鸟额外领取20", async () => {
  const game = new GameManager({ moveDelay: 0 });
  game.setCharacters(characters);
  game.start("character_06");
  const player = game.players[0];
  player.position = game.tiles.length - 1;
  const before = player.money;
  await game.moveOneStep(player);
  assert.equal(player.position, 0);
  assert.equal(player.money - before, 220);

  const ai = game.players[1];
  ai.position = game.tiles.length - 1;
  const aiBefore = ai.money;
  await game.moveOneStep(ai);
  assert.equal(ai.position, 0);
  assert.equal(ai.money - aiBefore, 200);
});

test("玫瑰鸟技能可以把当前建筑夷为平地并消耗次数", () => {
  const game = new GameManager();
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  player.position = 1;
  game.tiles[1].level = 4;
  assert.equal(game.useCurrentSkill(), true);
  assert.equal(game.tiles[1].level, 1);
  assert.equal(player.activeSkillUses, 2);
});

test("海神鸟技能可以将当前建筑降一级", () => {
  const game = new GameManager();
  game.setCharacters(characters);
  game.start("character_05");
  const player = game.players[0];
  player.position = 1;
  game.tiles[1].level = 3;
  assert.equal(game.useCurrentSkill(), true);
  assert.equal(game.tiles[1].level, 2);
});

test("牧师鸟的免疫改为询问：确认后才消耗次数", async () => {
  const randomValues = [randomForEvent("抽到签名照后大吃一顿")(), randomForEvent("IBM屁股蹲")()];
  const prompts = [];
  const game = new GameManager({
    random: () => randomValues.shift() ?? 0,
    onEffect: async (effect) => {
      if (effect.kind === "immunity") {
        prompts.push(effect);
        return true;
      }
      return undefined;
    }
  });
  game.setCharacters(characters);
  game.start("character_04");
  const player = game.players[0];
  const before = player.money;
  await game.triggerEvent(player);
  assert.equal(prompts.length, 1, "应弹窗询问一次");
  assert.equal(player.money, before);
  assert.equal(player.immunityUses, 1);

  await game.triggerEvent(player);
  assert.equal(player.skipTurns, 0);
  assert.equal(player.immunityUses, 0);
});

test("牧师鸟拒绝使用免疫时照常受到负面效果", async () => {
  const randomValues = [randomForEvent("抽到签名照后大吃一顿")()];
  const game = new GameManager({
    random: () => randomValues.shift() ?? 0,
    onEffect: async (effect) => (effect.kind === "immunity" ? false : undefined)
  });
  game.setCharacters(characters);
  game.start("character_04");
  const player = game.players[0];
  const before = player.money;
  await game.triggerEvent(player);
  assert.equal(player.money, before - 500, "拒绝免疫后应实际扣钱");
  assert.equal(player.immunityUses, 2, "拒绝不应消耗次数");
});

test("魔法鸟可以和指定玩家交换位置且只能使用一次", () => {
  const game = new GameManager();
  game.setCharacters(characters);
  game.start("character_08");
  const player = game.players[0];
  const target = game.players[1];
  player.position = 5;
  target.position = 12;
  assert.equal(game.useCurrentSkill(target.id), true);
  assert.equal(player.position, 12);
  assert.equal(target.position, 5);
  assert.equal(player.activeSkillUses, 0);
  assert.equal(game.useCurrentSkill(game.players[2].id), false);
});
