// 全量扫描测试：穷举所有卡牌 / 事件 / 技能 / 决策路径，检测卡死与异常。
//
// 设计说明（避免把正常异步等待误判成卡死）：
//   AI 回合由 setTimeout 驱动，必须真实等待事件循环（await sleep），
//   不能用空转 while 循环去 spin —— 否则第二圈 AI 还没跑起来就会被判成卡死。
import test from "node:test";
import assert from "node:assert/strict";
import { GameManager } from "../src/game/GameManager.js";
import { boardConfig } from "../src/data/board.js";
import { characters } from "../src/data/characters.js";
import { cards } from "../src/data/cards.js";
import { eventPool } from "../src/data/events.js";

const sleep = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

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

function randomForEvent(title) {
  const index = eventPool.findIndex((event) => event.title === title);
  assert.notEqual(index, -1, `事件池中找不到「${title}」`);
  return () => (index + 0.01) / eventPool.length;
}

// 判断「当前回合玩家是否卡住」的统一口径：
//   有 busy 或 any pending 都算「正在等待」，不算卡死；
//   skipTurns > 0 是正常的「休息回合」，按钮本就该禁用，不算卡死；
//   其余「既不能摇骰、又没有待决策、还没掷过骰」才是真卡死。
function stuckReason(game) {
  if (game.phase !== "playing") return null;
  const player = game.currentPlayer;
  if (!player) return "没有当前玩家";
  const pending = game.pendingPurchase !== null || game.pendingUpgrade !== null || game.pendingCardUpgrade !== null || game.pendingDicePick !== null;
  if (game.busy) return pending ? null : `busy 卡住且无待决策（cur=${player.id}）`;
  // 休息回合：本回合被跳过，掷骰本就无效，属正常状态。
  if (player.skipTurns > 0) return null;
  if (!pending && player.id === "player" && !player.hasRolledThisTurn && !game.canCurrentPlayerRoll()) {
    return "玩家既不能摇骰也没有待决策";
  }
  return null;
}

test("全量扫描：每张卡牌出牌后都不会卡死或抛异常", async () => {
  for (const card of cards) {
    const game = makeGame();
    game.setCharacters(characters);
    game.start("character_01");
    const player = game.players[0];
    player.cards.push({ ...card });

    await assert.doesNotReject(game.useCard("player", 0), `卡牌「${card.name}」(type=${card.type}) 抛出了异常`);

    // 移动卡（机票卡）走完后会落在新格子上，可能弹出购买/升级决策，
    // 也可能落到事件格；这两种都算「有后续」，不算卡死。
    // 休息卡会让玩家 skipTurns=1（本回合跳过），此时本就该禁用摇骰。
    const pending = game.pendingPurchase !== null || game.pendingUpgrade !== null || game.pendingCardUpgrade !== null || game.pendingDicePick !== null;
    if (game.phase === "playing" && !pending) {
      assert.equal(game.busy, false, `卡牌「${card.name}」出牌后 busy 未释放`);
      assert.equal(player.cards.length, 0, `卡牌「${card.name}」出牌后未从手牌移除`);
      assert.equal(
        game.canCurrentPlayerRoll() || player.skipTurns > 0,
        true,
        `卡牌「${card.name}」出牌后玩家既不能摇骰也没有休息标记`
      );
    }
    assert.equal(stuckReason(game), null, `卡牌「${card.name}」出牌后卡死`);
  }
});

test("全量扫描：移动卡从任意格子出发触发落地效果都不卡死", async () => {
  const moveCards = cards.filter((card) => card.type === "move");
  assert.ok(moveCards.length > 0, "卡牌池里应该有移动卡");

  for (const card of moveCards) {
    for (let step = 0; step < boardConfig.length; step += 1) {
      const game = makeGame({ random: () => (step + 0.5) / boardConfig.length });
      game.setCharacters(characters);
      game.start("character_01");
      const player = game.players[0];
      player.position = step;
      player.cards.push({ ...card });

      await assert.doesNotReject(
        game.useCard("player", 0),
        `移动卡「${card.name}」从格 ${step}（${boardConfig[step].name}）出发抛出了异常`
      );
      assert.ok(player.position >= 0 && player.position < boardConfig.length, `移动卡「${card.name}」从格 ${step} 出发后位置越界`);
      assert.equal(stuckReason(game), null, `移动卡「${card.name}」从格 ${step} 出发后卡死`);
    }
  }
});

test("全量扫描：每个事件在有钱/没钱两种状态下都不卡死或抛异常", async () => {
  for (const event of eventPool) {
    for (const rich of [true, false]) {
      const game = makeGame({ random: randomForEvent(event.title) });
      game.setCharacters(characters);
      game.start("character_01");
      const player = game.players[0];
      if (rich) {
        player.money = 5000;
        game.tiles
          .filter((tile) => tile.type === "property")
          .slice(0, 3)
          .forEach((tile) => { tile.owner = player.id; player.properties.push(tile.id); });
      } else {
        player.money = 0;
      }

      await assert.doesNotReject(
        game.triggerEvent(player),
        `事件「${event.title}」(type=${event.type}, rich=${rich}) 抛出了异常`
      );
      assert.ok(player.money >= 0, `事件「${event.title}」(rich=${rich}) 导致现金为负：${player.money}`);
      assert.ok(Number.isFinite(player.money), `事件「${event.title}」(rich=${rich}) 导致现金非法：${player.money}`);
      assert.equal(stuckReason(game), null, `事件「${event.title}」(rich=${rich}) 后卡死`);
    }
  }
});

test("全量扫描：每个角色的技能在各类落点下都不卡死或抛异常", async () => {
  const probeTiles = [0, 1, 3, 5, 8, 12];
  for (const character of characters) {
    for (const tileIndex of probeTiles) {
      const game = makeGame();
      game.setCharacters(characters);
      game.start(character.id);
      const player = game.players[0];
      player.position = tileIndex;
      const tile = game.tiles[tileIndex];
      if (tile.type === "property") {
        tile.owner = player.id;
        player.properties.push(tile.id);
        if (tileIndex % 2 === 0) tile.level = 3;
      }

      assert.doesNotThrow(
        () => game.useCurrentSkill(game.players[1]?.id),
        `角色「${character.name}」的技能在格 ${tileIndex}（${tile.name}）抛出了异常`
      );
      assert.equal(stuckReason(game), null, `角色「${character.name}」在格 ${tileIndex} 用技能后卡死`);
    }
  }
});

test("全量扫描：破产与结束边界不会被绕过", () => {
  const game = makeGame();
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  player.money = 0;

  const paid = game.chargePlayer(player, 1000);
  assert.equal(paid, 0, "无资产玩家被扣款不该返回金额");
  assert.ok(player.money >= 0, "破产后现金不该为负");
  assert.equal(player.bankrupt, true, "无资产且付不起时应标记破产");
  assert.equal(player.properties.length, 0, "破产后不该还持有房产");

  const solo = makeGame();
  solo.setCharacters(characters);
  solo.start("character_01");
  solo.players.slice(1).forEach((item) => solo.markBankrupt(item));
  solo.endTurn();
  assert.equal(solo.phase, "finished", "只剩一名玩家时对局应结束");
});

test("全量扫描：连续推进多个回合不会卡死，且数值始终合法", async () => {
  let seed = 12345;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const game = makeGame({ random: rng });
  game.setCharacters(characters);
  game.start("character_01");

  const waitForPlayerTurn = async (budgetMs = 3000) => {
    const start = Date.now();
    const ready = () =>
      game.phase !== "playing" ||
      (!game.busy &&
        game.currentPlayer?.id === "player" &&
        (game.canCurrentPlayerRoll() ||
          game.pendingPurchase !== null ||
          game.pendingUpgrade !== null ||
          game.pendingCardUpgrade !== null));
    while (!ready() && Date.now() - start < budgetMs) await sleep();
    return ready();
  };

  let advanced = 0;
  while (game.phase === "playing" && advanced < 8) {
    const ready = await waitForPlayerTurn();
    if (!ready) break;

    const pending = game.pendingPurchase !== null || game.pendingUpgrade !== null || game.pendingCardUpgrade !== null || game.pendingDicePick !== null;
    if (pending) {
      game.resolvePendingDecision();
    } else {
      await game.rollForHuman();
    }
    advanced += 1;
    await sleep();
  }

  assert.equal(stuckReason(game), null, "连续推进过程中出现卡死");
  assert.ok(game.phase === "playing" || game.phase === "finished", `非法 phase：${game.phase}`);
  assert.ok(advanced >= 6, `只推进了 ${advanced} 个玩家回合，疑似中途卡住`);
  for (const item of game.players) {
    assert.ok(item.money >= 0 && Number.isFinite(item.money), `${item.name} 现金非法：${item.money}`);
    assert.ok(item.position >= 0 && item.position < game.tiles.length, `${item.name} 位置越界：${item.position}`);
  }
});

test("全量扫描：卡牌与事件没有声明了却未实现的类型", () => {
  const implementedEventTypes = new Set([
    "money", "move", "card", "cost_card", "extra_roll", "cost_extra_roll",
    "highest_pays", "all_money", "cost_or_start", "all_gift", "pay_all",
    "lose_property", "rest"
  ]);
  for (const event of eventPool) {
    assert.ok(
      implementedEventTypes.has(event.type),
      `事件「${event.title}」声明了未实现的 type=${event.type}（会静默无效果）`
    );
  }

  const implementedCardTypes = new Set(["move", "shield", "income", "upgrade_tile", "luck", "rest", "money", "destroy", "dice_pick"]);
  for (const card of cards) {
    assert.ok(
      implementedCardTypes.has(card.type),
      `卡牌「${card.name}」声明了未实现的 type=${card.type}（会静默无效果）`
    );
  }
});
