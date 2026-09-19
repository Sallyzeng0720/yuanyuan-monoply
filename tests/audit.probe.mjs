// 临时审计脚本：穷举所有卡牌 / 事件 / 技能 / 决策路径，检测卡死与异常。
import { GameManager } from "../src/game/GameManager.js";
import { characters } from "../src/data/characters.js";
import { cards } from "../src/data/cards.js";
import { eventPool } from "../src/data/events.js";

const problems = [];
const note = (msg) => problems.push(msg);

function makeGame(overrides = {}) {
  return new GameManager({
    moveDelay: 0, rollAnimationSteps: 0, rollAnimationDelay: 0, actionDelay: 0,
    onEffect: async () => undefined,
    ...overrides
  });
}

// ---- 1. 逐张卡牌：出牌后必须解锁 ----
for (const card of cards) {
  const game = makeGame();
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  player.cards.push({ ...card });
  try {
    await game.useCard("player", 0);
  } catch (e) {
    note(`卡牌「${card.name}」(type=${card.type}) 抛出异常: ${e.message}`);
    continue;
  }
  if (game.phase === "playing") {
    const stuck = game.busy === true;
    const pending = game.pendingCardUpgrade !== null || game.pendingPurchase !== null || game.pendingUpgrade !== null;
    // 等待玩家决策的卡牌（鸟蛋卡）出现 pending 是正常设计，不算卡死。
    if (stuck && !pending) note(`卡牌「${card.name}」出牌后 busy 卡在 true 且无待决策`);
    if (!pending && game.currentPlayer?.id === "player" && game.canCurrentPlayerRoll() === false && !player.hasRolledThisTurn) {
      note(`卡牌「${card.name}」出牌后既不能摇骰也没有待决策 -> 疑似卡死`);
    }
  }
}

// ---- 2. 卡牌 + 落点事件组合：移动卡会 resolveTile ----
for (const card of cards.filter((c) => c.type === "move")) {
  for (let step = 0; step < 28; step += 1) {
    const game = makeGame({ random: () => (step + 0.5) / 28 });
    game.setCharacters(characters);
    game.start("character_01");
    const player = game.players[0];
    player.position = step;
    player.cards.push({ ...card });
    try {
      await game.useCard("player", 0);
    } catch (e) {
      note(`移动卡「${card.name}」从格 ${step} 出发抛异常: ${e.message}`);
    }
    if (game.busy) note(`移动卡「${card.name}」从格 ${step} 出发后 busy 卡住`);
  }
}

// ---- 3. UI 层会 closeEffectModal() 后再调 confirm，模拟 pending 悬空 ----
{
  const game = makeGame();
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  player.cards.push({ id: "red_packet", name: "鸟蛋卡", type: "upgrade_tile", icon: "♡", description: "升一级" });
  await game.useCard("player", 0);
  // 鸟蛋卡是玩家决策卡：弹出选地块弹窗时保持 busy 是对的（防止重复操作）。
  if (game.busy !== true) note("鸟蛋卡出牌后应保持 busy 以等待选地块");
  if (game.pendingCardUpgrade === null) note("鸟蛋卡出牌后未进入待选地块状态");
  if (game.canCurrentPlayerRoll() !== false) note("鸟蛋卡待选期间竟然允许摇骰");
  if (game.resolvePendingDecision() !== true) note("resolvePendingDecision 未能兜底解除悬空状态");
  // 兜底会清掉悬空决策并把回合推进给 AI，因此此后玩家不能摇骰是正确行为。
  if (game.busy) note("兜底后 busy 仍卡住");
  if (game.pendingCardUpgrade !== null) note("兜底后待决策状态未清除");
  if (game.phase === "playing" && game.currentPlayer?.id === "player") note("兜底后回合未推进，玩家仍然卡住");
}

// ---- 4. 遍历整个事件池：每个事件在「有资产 / 无资产」下都要安全 ----
for (const event of eventPool) {
  for (const rich of [true, false]) {
    const index = eventPool.indexOf(event);
    const game = makeGame({ random: () => (index + 0.01) / eventPool.length });
    game.setCharacters(characters);
    game.start("character_01");
    const player = game.players[0];
    if (rich) {
      player.money = 5000;
      const owned = game.tiles.filter((t) => t.type === "property").slice(0, 3);
      owned.forEach((t) => { t.owner = player.id; player.properties.push(t.id); });
    } else {
      player.money = 0;
    }
    try {
      await game.triggerEvent(player);
    } catch (e) {
      note(`事件「${event.title}」(type=${event.type}, rich=${rich}) 抛出异常: ${e.message}`);
    }
    if (player.money < 0) note(`事件「${event.title}」导致现金为负: ${player.money}`);
    if (game.busy) note(`事件「${event.title}」后 busy 卡住`);
  }
}

// ---- 5. 每个角色技能：在各档资金 / 各落点下都要安全 ----
for (const character of characters) {
  for (const tileIndex of [0, 1, 3, 5, 8, 12]) {
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
    try {
      game.useCurrentSkill(game.players[1]?.id);
    } catch (e) {
      note(`角色「${character.name}」技能在格 ${tileIndex} 抛异常: ${e.message}`);
    }
    if (game.busy) note(`角色「${character.name}」技能后 busy 卡住`);
  }
}

// ---- 6. 破产边界：所有扣款出口 ----
{
  const game = makeGame();
  game.setCharacters(characters);
  game.start("character_01");
  const player = game.players[0];
  player.money = 0;
  const paid = game.chargePlayer(player, 1000);
  if (paid !== 0) note(`无资产玩家被扣款返回了 ${paid}`);
  if (player.money < 0) note("破产后现金为负");
  if (!player.bankrupt) note("无资产且付不起时未标记破产");
}

// ---- 7. 全员破产 / 回合耗尽：endTurn 必须能结束对局 ----
{
  const game = makeGame();
  game.setCharacters(characters);
  game.start("character_01");
  game.players.slice(1).forEach((p) => game.markBankrupt(p));
  game.endTurn();
  if (game.phase !== "finished") note("只剩一人时对局没有结束");
}

// ---- 8. 长跑：随机推进回合，检查是否卡死或报错 ----
// 注意：AI 回合由 setTimeout 驱动，所以必须真实等待事件循环，
// 不能空转 spin（否则会把正常的异步等待误判成卡死）。
{
  let seed = 12345;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const game = makeGame({ random: rng });
  game.setCharacters(characters);
  game.start("character_01");
  const waitFor = async (predicate, budget = 3000) => {
    const start = Date.now();
    while (!predicate() && Date.now() - start < budget) {
      await new Promise((r) => setTimeout(r, 5));
    }
    return predicate();
  };
  let stuck = null;
  let rounds = 0;
  while (game.phase === "playing" && rounds < 6) {
    const moved = await waitFor(() => !game.busy && game.currentPlayer?.id === "player" && (game.canCurrentPlayerRoll() || game.pendingCardUpgrade !== null || game.pendingPurchase !== null || game.pendingUpgrade !== null), 3000);
    if (!moved) {
      if (game.phase !== "playing") break;
      stuck = `等不到玩家回合：cur=${game.currentPlayer?.id} busy=${game.busy} pending=${game.pendingPurchase},${game.pendingUpgrade},${game.pendingCardUpgrade}`;
      break;
    }
    if (game.pendingCardUpgrade !== null || game.pendingPurchase !== null || game.pendingUpgrade !== null) {
      game.resolvePendingDecision();
      await new Promise((r) => setTimeout(r, 5));
      rounds += 1;
      continue;
    }
    await game.rollForHuman();
    rounds += 1;
  }
  if (stuck) note(`长跑卡死：${stuck}`);
  if (game.phase !== "playing" && game.phase !== "finished") note(`长跑后非法 phase: ${game.phase}`);
  game.players.forEach((p) => {
    if (p.money < 0) note(`长跑后 ${p.name} 现金为负: ${p.money}`);
    if (!Number.isFinite(p.money)) note(`长跑后 ${p.name} 现金非法: ${p.money}`);
    if (p.position < 0 || p.position >= game.tiles.length) note(`长跑后 ${p.name} 位置越界: ${p.position}`);
  });
  if (rounds < 6 && game.phase === "playing") note(`长跑只推进了 ${rounds} 个玩家回合`);
}

// ---- 9. 静态引用检查：卡牌/事件里声明但未实现的行为 ----
{
  const implementedEventTypes = new Set([
    "money", "move", "card", "cost_card", "extra_roll", "cost_extra_roll",
    "highest_pays", "all_money", "cost_or_start", "all_gift", "pay_all",
    "lose_property", "rest"
  ]);
  for (const event of eventPool) {
    if (!implementedEventTypes.has(event.type)) {
      note(`事件「${event.title}」声明了未实现的 type=${event.type}（静默无效果）`);
    }
  }
  const implementedCardTypes = new Set(["move", "shield", "income", "upgrade_tile", "luck", "rest", "money", "destroy"]);
  for (const card of cards) {
    if (!implementedCardTypes.has(card.type)) {
      note(`卡牌「${card.name}」声明了未实现的 type=${card.type}（静默无效果）`);
    }
  }
}

console.log(problems.length ? problems.map((p) => `  ✗ ${p}`).join("\n") : "  ✓ 审计未发现问题");
console.log(`\n合计问题: ${problems.length}`);
