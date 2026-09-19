import { cards } from "../data/cards.js";
import { boardConfig } from "../data/board.js";
import { eventPool } from "../data/events.js";
import { calculateAsset, calculateRent, chooseAiAction, createPlayers, createTiles, getNextPosition, MAX_ROUNDS, START_PASS_BONUS } from "./engine.js";

export class GameManager {
  constructor({ onStateChange, onLog, onEffect, random = Math.random, moveDelay = 420, rollAnimationSteps = 9, rollAnimationDelay = 140, actionDelay = 850 } = {}) {
    this.onStateChange = onStateChange;
    this.onLog = onLog;
    this.onEffect = onEffect;
    this.random = random;
    this.moveDelay = moveDelay;
    this.rollAnimationSteps = rollAnimationSteps;
    this.rollAnimationDelay = rollAnimationDelay;
    this.actionDelay = actionDelay;
    this.reset();
  }

  reset() {
    this.tiles = createTiles(boardConfig);
    this.players = [];
    this.currentPlayerIndex = 0;
    this.round = 1;
    this.phase = "select";
    this.selectedCharacterId = null;
    this.lastRoll = null;
    this.diceRolling = false;
    this.lastEffect = null;
    this.pendingPurchase = null;
    this.pendingUpgrade = null;
    this.pendingCardUpgrade = null;
    this.winner = null;
    this.busy = false;
    this.emit();
  }

  start(characterId) {
    const selected = this.availableCharacters.find((item) => item.id === characterId) || this.availableCharacters[0];
    this.selectedCharacterId = selected.id;
    const aiCharacters = this.availableCharacters.filter((item) => item.id !== selected.id).slice(0, 3);
    this.players = createPlayers([selected, ...aiCharacters]);
    this.phase = "playing";
    this.log(`你选择了「${selected.name}」，另外三位角色已入场。`);
    this.emit();
  }

  get availableCharacters() {
    return this._characters || [];
  }

  setCharacters(characters) {
    this._characters = characters;
    this.emit();
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  get state() {
    return {
      phase: this.phase,
      round: this.round,
      currentPlayerIndex: this.currentPlayerIndex,
      currentPlayerId: this.currentPlayer?.id || null,
      players: this.players,
      tiles: this.tiles,
      lastRoll: this.lastRoll,
      lastEffect: this.lastEffect,
      winner: this.winner,
      // 界面需要知道当前玩家是否在休息，才能把按钮文案改成「休息中」。
      currentPlayerResting: this.isCurrentPlayerResting()
    };
  }

  async rollForHuman() {
    if (!this.canCurrentPlayerRoll()) return false;
    await this.takeTurn(this.currentPlayer);
    return true;
  }

  async takeTurn(player) {
    if (this.busy || this.phase !== "playing" || player.bankrupt || player.hasRolledThisTurn) return false;
    this.busy = true;
    this.lastEffect = null;
    if (player.skipTurns > 0) {
      player.hasRolledThisTurn = false;
      player.cardLockedThisTurn = false;
      player.skipTurns -= 1;
      this.log(`${player.name} 正在休息，本回合跳过。`);
      this.busy = false;
      this.endTurn();
      return true;
    }
    if (player.id !== "player" && player.cards.length && player.personality === "aggressive" && this.random() > 0.45) {
      await this.useCard(player.id, 0);
    }
    player.hasRolledThisTurn = true;
    player.cardLockedThisTurn = true;
    this.emit();
    this.diceRolling = true;
    for (let index = 0; index < this.rollAnimationSteps; index += 1) {
      this.lastRoll = 1 + Math.floor(this.random() * 6);
      this.emit();
      await new Promise((resolve) => setTimeout(resolve, this.rollAnimationDelay));
    }
    const roll = 1 + Math.floor(this.random() * 6);
    this.lastRoll = roll;
    player.lastRoll = roll;
    this.diceRolling = false;
    this.log(`${player.name} 掷出了 ${roll} 点。`);
    this.emit();
    for (let index = 0; index < roll; index += 1) {
      await this.moveOneStep(player);
    }
    if (player.character.stats.movementBonus) {
      for (let index = 0; index < player.character.stats.movementBonus; index += 1) {
        await this.moveOneStep(player);
      }
      this.log(`${player.name} 的「${player.character.ability.name}」额外前进 ${player.character.stats.movementBonus} 格。`);
    }
    await this.resolveTile(player);
    const landingEffectKind = this.lastEffect?.kind;
    if (player.id !== "player") {
      await new Promise((resolve) => setTimeout(resolve, this.actionDelay));
      if (landingEffectKind !== "purchase") {
        await this.aiManageProperty(player);
      }
      await new Promise((resolve) => setTimeout(resolve, this.actionDelay));
    }
    this.busy = false;
    if (player.extraRolls > 0) {
      player.extraRolls -= 1;
      player.hasRolledThisTurn = false;
      this.log(`${player.name} 获得额外掷骰机会，还可以再掷一次。`);
      this.emit();
      if (player.id !== "player") {
        setTimeout(() => this.takeTurn(this.currentPlayer), this.actionDelay);
      }
      return true;
    }
    if (player.id === "player" && this.pendingPurchase !== null) {
      this.emit();
      return true;
    }
    if (player.id === "player" && this.pendingUpgrade !== null) {
      this.emit();
      return true;
    }
    if (player.id === "player" && this.pendingCardUpgrade !== null) {
      this.emit();
      return true;
    }
    this.endTurn();
    return true;
  }

  canCurrentPlayerRoll() {
    const player = this.currentPlayer;
    // 休息回合要显示为不可点（灰色）。
    // 但【绝不能】只靠这个禁用推进：玩家回合的唯一推进器就是掷骰，
    // 所以必须同时有 autoSkipIfResting() 自动跳过，否则会死锁在「一直休息」。
    return this.phase === "playing" && !this.busy && player?.id === "player" && !player.hasRolledThisTurn && !(player.skipTurns > 0) && this.pendingPurchase === null && this.pendingUpgrade === null && this.pendingCardUpgrade === null;
  }

  // 给界面用：当前玩家是否正在休息（本回合被跳过）。
  isCurrentPlayerResting() {
    const player = this.currentPlayer;
    return this.phase === "playing" && player?.id === "player" && player.skipTurns > 0;
  }

  // 轮到玩家但其处于休息态时，自动跳过本回合；
  // 玩家无需也无法操作，界面只负责显示「休息中」。
  async autoSkipIfResting() {
    if (this.phase !== "playing" || this.busy) return false;
    const player = this.currentPlayer;
    if (!player || player.id !== "player" || player.skipTurns <= 0) return false;
    return this.takeTurn(player);
  }

  async moveOneStep(player, steps = 1) {
    const boardLength = this.tiles.length;
    const from = player.position;
    player.position = getNextPosition(from, steps, boardLength);
    const crossedStart = steps > 0 && from + steps >= boardLength;
    if (crossedStart) {
      const amount = START_PASS_BONUS + (player.character.stats.incomeBonus || 0);
      player.money += amount;
      this.log(`${player.name} 经过起点，获得 ${amount} 远气。`);
    }
    this.emit();
    await new Promise((resolve) => setTimeout(resolve, this.moveDelay));
  }

  async resolveTile(player) {
    const tile = this.tiles[player.position];
    this.lastEffect = { playerId: player.id, tileId: tile.id, kind: "tile", title: tile.name, description: `${this.subject(player)}到达「${tile.name}」。` };
    if (tile.type === "property") {
      if (!tile.owner) {
        if (player.id === "player") {
          this.pendingPurchase = tile.id;
          this.lastEffect = { ...this.lastEffect, kind: "decision", requiresDecision: true, description: `可用 ${this.discountedPrice(player, tile.price)} 远气购买。` };
        } else {
          const action = chooseAiAction(player, tile, this.random);
          if (action === "buy") this.buyProperty(player, tile);
        }
      } else if (tile.owner !== player.id) {
        this.payRent(player, tile);
      } else if (player.id === "player" && tile.level < 4) {
        this.pendingUpgrade = tile.id;
        const cost = this.discountedPrice(player, tile.upgradeCost * tile.level);
        this.lastEffect = { ...this.lastEffect, kind: "decision", requiresDecision: true, description: `这是你的地块，可以用 ${cost} 远气升级到 Lv.${tile.level + 1}。` };
      }
    } else if (tile.type === "event") {
      await this.triggerEvent(player);
      return;
    } else if (tile.type === "card") {
      this.giveCard(player);
    } else if (tile.type === "teleport") {
      const destination = 10;
      player.position = destination;
      this.lastEffect = { ...this.lastEffect, kind: "teleport", description: `移动到「${this.tiles[destination].name}」。` };
      this.log(`${player.name} 通过传送门抵达「${this.tiles[destination].name}」。`);
      this.emit();
      await this.onEffect?.(this.lastEffect);
      return this.resolveTile(player);
    } else if (tile.type === "rest") {
      if (await this.consumeImmunity(player)) {
        this.lastEffect = { ...this.lastEffect, kind: "rest", description: "免疫原地停留，下一回合可正常行动。" };
      } else {
        player.skipTurns = 1;
        this.lastEffect = { ...this.lastEffect, kind: "rest", description: "下一回合停留一次。" };
      }
    } else if (tile.type === "reward") {
      const amount = 220 + (player.character.stats.incomeBonus || 0);
      player.money += amount;
      this.lastEffect = { ...this.lastEffect, kind: "reward", description: `获得 ${amount} 远气。` };
    }
    this.emit();
    await this.onEffect?.(this.lastEffect);
  }

  buyProperty(player, tile) {
    const price = this.discountedPrice(player, tile.price);
    if (player.money < price || tile.owner) return false;
    player.money -= price;
    player.properties.push(tile.id);
    tile.owner = player.id;
    this.log(`${player.name} 买下了「${tile.name}」。`);
    this.lastEffect = { playerId: player.id, tileId: tile.id, kind: "purchase", title: "买地成功", description: `${this.subject(player)}买下了「${tile.name}」。` };
    this.emit();
    return true;
  }

  upgradeProperty(player, tileId) {
    const tile = this.tiles.find((item) => item.id === tileId);
    if (!tile || tile.owner !== player.id || tile.level >= 4) return false;
    const cost = this.discountedPrice(player, tile.upgradeCost * tile.level);
    if (player.money < cost) return false;
    player.money -= cost;
    tile.level += 1;
    this.log(`${player.name} 将「${tile.name}」升级到 Lv.${tile.level}。`);
    this.lastEffect = { playerId: player.id, tileId: tile.id, kind: "upgrade", title: "升级完成", description: `${this.subject(player)}将「${tile.name}」升级到 Lv.${tile.level}。` };
    this.emit();
    return true;
  }

  async buyCurrentProperty() {
    if (!this.lastEffect || this.pendingPurchase === null) return false;
    const player = this.players.find((item) => item.id === "player");
    const tile = this.tiles.find((item) => item.id === this.pendingPurchase);
    if (!player || !tile || !this.buyProperty(player, tile)) return false;
    this.pendingPurchase = null;
    this.busy = true;
    // 结算弹窗只是「看一眼」，绝不能阻塞回合推进。
    // 之前是 await onEffect，弹窗一旦没关/关不掉，endTurn 永远走不到，
    // 就会出现「买地成功 + 按钮显示已掷骰 + 横幅仍是轮到你行动」的卡死。
    try {
      Promise.resolve(this.onEffect?.(this.lastEffect)).finally(() => { this.busy = false; });
    } catch {
      this.busy = false;
    }
    this.endTurn();
    return true;
  }

  async upgradeCurrentProperty() {
    if (this.pendingUpgrade === null) return false;
    const player = this.players.find((item) => item.id === "player");
    const tile = this.tiles.find((item) => item.id === this.pendingUpgrade);
    if (!player || !tile || !this.upgradeProperty(player, tile.id)) return false;
    this.pendingUpgrade = null;
    this.busy = true;
    // 同上：升级结算弹窗不得阻塞 endTurn。
    try {
      Promise.resolve(this.onEffect?.(this.lastEffect)).finally(() => { this.busy = false; });
    } catch {
      this.busy = false;
    }
    this.endTurn();
    return true;
  }

  passCurrentPurchase() {
    if (this.pendingPurchase === null) return false;
    this.pendingPurchase = null;
    this.lastEffect = null;
    this.emit();
    this.endTurn();
    return true;
  }

  passCurrentUpgrade() {
    if (this.pendingUpgrade === null) return false;
    this.pendingUpgrade = null;
    this.lastEffect = null;
    this.emit();
    this.endTurn();
    return true;
  }

  async useCard(playerId, cardIndex) {
    const player = this.players.find((item) => item.id === playerId);
    if (!player || this.currentPlayer?.id !== playerId || !player.cards[cardIndex] || player.cardLockedThisTurn || player.hasRolledThisTurn) return false;
    if (this.busy && player.id === "player") return false;
    this.busy = true;
    const card = player.cards.splice(cardIndex, 1)[0];
    try {
      if (card.type === "money") player.money += card.value;
      if (card.type === "shield") player.shield = true;
      // 应援补给："增加一次掷骰机会"。之前只加钱没给额外掷骰，罐罐反馈用卡没多一次。
      // 只对明确写"增加掷骰机会"的卡生效，不碰其他 money 卡（如鸟蛋卡是 upgrade_tile）。
      if (card.id === "cheer") player.extraRolls += 1;
      if (card.type === "income") player.rentBoost = 0.5;
      if (card.type === "luck") player.luckyNext = true;
      if (card.type === "rest") {
        if (!(await this.consumeImmunity(player))) player.skipTurns = 1;
      }
      if (card.type === "upgrade_tile") {
        await this.openCardUpgrade(player, card);
        // 玩家出鸟蛋卡后弹窗等选地块，此处保留 busy；
        // 决策由 confirmCardUpgrade / cancelCardUpgrade / resolvePendingDecision 释放。
        if (this.pendingCardUpgrade !== null) {
          this.emit();
          return true;
        }
        this.busy = false;
        this.emit();
        return true;
      }
      if (card.type === "move") {
        await this.moveOneStep(player, card.value);
      }
      this.log(`${player.name} 使用了「${card.name}」。`);
      this.emit();
      if (card.type === "move") {
        await this.resolveTile(player);
      }
      // 卡牌本身不消耗回合，但出牌后要放开 busy，让玩家能继续摇骰。
      this.busy = false;
      this.emit();
      return true;
    } catch (error) {
      this.busy = false;
      this.emit();
      throw error;
    }
  }

  useCurrentSkill(targetPlayerId = null) {
    const player = this.currentPlayer;
    if (!player || player.id !== "player" || this.busy || this.phase !== "playing") return false;    const skillId = player.character.ability.id;
    if (player.activeSkillUses === 0) return false;
    if (skillId === "income") return this.flattenCurrentBuilding(player);
    if (skillId === "defense") return this.downgradeCurrentBuilding(player);
    if (skillId === "upgrade") return this.swapWithPlayer(player, targetPlayerId);
    return false;
  }

  async openCardUpgrade(player, card) {
    if (player.id !== "player") {
      const target = this.tiles
        .filter((tile) => tile.type === "property" && tile.level < 4)
        .sort((a, b) => b.level - a.level)[0];
      if (target) this.upgradeTileByCard(player, target.id);
      // AI 无需等待决策，这里就不保留 busy，交给出牌方统一释放。
      return true;
    }
    this.pendingCardUpgrade = card.id;
    this.lastEffect = {
      playerId: player.id,
      tileId: player.position,
      kind: "card_target",
      requiresDecision: true,
      title: `功能卡 · ${card.name}`,
      description: card.description,
      outcome: "选择一个地块，把它升一级。"
    };
    this.emit();
    await this.onEffect?.(this.lastEffect);
    return true;
  }

  upgradeTileByCard(player, tileId) {
    const tile = this.tiles.find((item) => item.id === tileId);
    if (!tile || tile.type !== "property" || tile.level >= 4) return false;
    tile.level += 1;
    this.pendingCardUpgrade = null;
    this.lastEffect = { playerId: player.id, tileId: tile.id, kind: "upgrade", title: "升级完成", description: `${this.subject(player)}将「${tile.name}」升级到 Lv.${tile.level}。` };
    this.log(`${player.name} 使用鸟蛋卡，将「${tile.name}」升级到 Lv.${tile.level}。`);
    this.emit();
    return true;
  }

  async confirmCardUpgrade(tileId) {
    if (this.pendingCardUpgrade === null) return false;
    const player = this.players.find((item) => item.id === "player");
    this.busy = true;
    try {
      if (!player || !this.upgradeTileByCard(player, tileId)) {
        // 选中的地块不可升级：不要卡死，清掉待决策并结束回合并给出提示。
        // 注意：进入本函数时已 this.busy = true，失败分支若不释放，
        // canCurrentPlayerRoll() 会因 !this.busy 恒为 false 而永久禁用摇骰。
        this.pendingCardUpgrade = null;
        this.lastEffect = { playerId: player?.id, tileId: null, kind: "upgrade", title: "升级未生效", description: "选择的不是可升级的地块。" };
        this.log("选择的不是可升级的地块，本次使用未生效。");
        this.busy = false;
        this.emit();
        this.endTurn();
        return false;
      }
      // 同上：结算弹窗不得阻塞 endTurn。
      Promise.resolve(this.onEffect?.(this.lastEffect)).finally(() => { this.busy = false; });
    } catch {
      this.busy = false;
    }
    this.endTurn();
    return true;
  }

  cancelCardUpgrade() {
    if (this.pendingCardUpgrade === null) return false;
    this.pendingCardUpgrade = null;
    this.lastEffect = null;
    this.busy = false;
    this.emit();
    this.endTurn();
    return true;
  }

  // 兜底：弹窗被外部关闭（或决策 Promise 被意外 resolve）时，
  // 清掉悬空的待决策状态并推进回合，避免摇骰按钮永久禁用。
  resolvePendingDecision() {
    if (this.phase !== "playing") return false;
    if (this.pendingCardUpgrade === null && this.pendingPurchase === null && this.pendingUpgrade === null) return false;
    this.pendingCardUpgrade = null;
    this.pendingPurchase = null;
    this.pendingUpgrade = null;
    this.lastEffect = null;
    this.busy = false;
    this.emit();
    this.endTurn();
    return true;
  }

  flattenCurrentBuilding(player) {
    const tile = this.tiles[player.position];
    if (!tile || tile.type !== "property" || tile.level <= 1) return false;
    tile.level = 1;
    player.activeSkillUses -= 1;
    this.lastEffect = { playerId: player.id, tileId: tile.id, kind: "skill", title: player.character.ability.name, description: `${this.subject(player)}将「${tile.name}」夷为平地。` };
    this.log(`${player.name} 使用技能，将「${tile.name}」夷为平地。`);
    this.emit();
    this.onEffect?.(this.lastEffect);
    return true;
  }

  downgradeCurrentBuilding(player) {
    const tile = this.tiles[player.position];
    if (!tile || tile.type !== "property" || tile.level <= 1) return false;
    tile.level -= 1;
    this.lastEffect = { playerId: player.id, tileId: tile.id, kind: "skill", title: player.character.ability.name, description: `${this.subject(player)}将「${tile.name}」降到 Lv.${tile.level}。` };
    this.log(`${player.name} 使用技能，将「${tile.name}」降到 Lv.${tile.level}。`);
    this.emit();
    this.onEffect?.(this.lastEffect);
    return true;
  }

  swapWithPlayer(player, targetPlayerId) {
    const target = this.players.find((item) => item.id === targetPlayerId && item.id !== player.id && !item.bankrupt);
    if (!target) return false;
    const currentPosition = player.position;
    player.position = target.position;
    target.position = currentPosition;
    player.activeSkillUses -= 1;
    this.lastEffect = { playerId: player.id, tileId: player.position, kind: "skill", title: player.character.ability.name, description: `${this.subject(player)}和 ${target.name} 交换了位置。` };
    this.log(`${player.name} 使用技能，和 ${target.name} 交换了位置。`);
    this.emit();
    this.onEffect?.(this.lastEffect);
    return true;
  }

  async aiManageProperty(player) {
    const candidate = this.tiles[player.position];
    if (!candidate || candidate.owner !== player.id || candidate.level >= 4) return;
    if (candidate && (player.personality !== "conservative" || this.random() > 0.4)) {
      if (this.upgradeProperty(player, candidate.id)) {
        await this.onEffect?.(this.lastEffect);
      }
      await new Promise((resolve) => setTimeout(resolve, this.actionDelay));
    }
  }

  payRent(visitor, tile) {
    const owner = this.players.find((item) => item.id === tile.owner);
    if (!owner) return;
    const rent = visitor.shield ? 0 : calculateRent(tile, owner, visitor, visitor.rentBoost);
    const actual = this.chargePlayer(visitor, rent);
    owner.money += actual;
    if (visitor.shield) visitor.shield = false;
    const note = visitor.bankrupt ? "变卖资产后仍不足，宣告破产" : "";
    this.lastEffect = { ...this.lastEffect, kind: "rent", description: `${visitor.name} 向 ${owner.name} 支付 ${actual} 远气过路费。${note}` };
    this.log(this.lastEffect.description);
  }

  subject(player) {
    return player.id === "player" ? "你" : player.name;
  }

  async triggerEvent(player) {
    const event = eventPool[Math.floor(this.random() * eventPool.length)];
    const modifier = player.character.stats.eventBonus || 0;
    let description = event.description;
    let awardedCard = null;
    let cardExtra = false;
    if (event.type === "money") {
      const amount = event.value > 0 ? Math.round(event.value * (1 + modifier)) : Math.round(event.value * (1 - (player.character.stats.defenseBonus || 0)));
      if (amount < 0) {
        await this.showEventIntro(player, event, `你即将因「${event.title}」失去 ${Math.abs(amount)} 远气。`);
        if (await this.consumeImmunity(player)) {
          description = `免疫罚款，未损失 ${Math.abs(amount)} 远气。`;
        } else {
          const paid = this.chargePlayer(player, Math.abs(amount));
          description = player.bankrupt
            ? `变卖资产后仍损失 ${paid} 远气，宣告破产。`
            : `失去 ${Math.abs(amount)} 远气。`;
        }
      } else {
        player.money = Math.max(0, player.money + amount);
        description = `获得 ${Math.abs(amount)} 远气。`;
      }
    }
    if (event.type === "move") {
      const steps = event.value;
      player.position = getNextPosition(player.position, steps + this.tiles.length, this.tiles.length);
      description = steps > 0 ? `前进 ${steps} 格。` : `后退 ${Math.abs(steps)} 格。`;
    }
    if (event.type === "card") {
      const got = this.giveCard(player);
      awardedCard = got.card;
      cardExtra = got.extra;
    }
    if (event.type === "cost_card") {
      if (player.money >= event.value) {
        player.money -= event.value;
        const got = this.giveCard(player);
        awardedCard = got.card;
        cardExtra = got.extra;
        description = `花费 ${event.value} 远气购买彩票，刮开了它。`;
      } else {
        description = `资金不足（现有 ${player.money} 远气），无法花费 ${event.value} 远气买彩票，本事件无效果。`;
      }
    }
    if (event.type === "extra_roll") {
      player.extraRolls += 1;
      description = "获得额外掷骰一次机会。";
    }
    if (event.type === "cost_extra_roll") {
      if (player.money >= event.value) {
        player.money -= event.value;
        player.extraRolls += 1;
        description = `花费 ${event.value} 远气，获得额外掷骰一次机会。`;
      } else {
        description = `资金不足，无法支付 ${event.value} 远气，未获得额外掷骰机会。`;
      }
    }
    if (event.type === "highest_pays") {
      const payer = this.players
        .filter((item) => item.id !== player.id && !item.bankrupt)
        .sort((a, b) => this.assetOf(b) - this.assetOf(a))[0];
      if (payer) {
        const amount = this.chargePlayer(payer, event.value);
        player.money += amount;
        const note = payer.bankrupt ? `（${payer.name} 因此破产）` : "";
        description = `${payer.name} 送给${this.subject(player)} ${amount} 远气。${note}`;
      } else {
        description = "没有其他在场玩家可以送出礼金。";
      }
    }
    if (event.type === "all_money") {
      this.players.filter((item) => !item.bankrupt).forEach((item) => { item.money += event.value; });
      description = `所有在场玩家各获得 ${event.value} 远气。`;
    }
    if (event.type === "cost_or_start") {
      if (player.money >= event.value || this.assetOf(player) > event.value) {
        const paid = this.chargePlayer(player, event.value);
        description = player.bankrupt
          ? `变卖了 ${paid} 远气的资产买下鸟棒，仍宣告破产。`
          : `花费 ${event.value} 远气购买鸟棒。`;
      } else {
        player.position = 0;
        description = `资金不足，返回起点。`;
      }
    }
    if (event.type === "all_gift") {
      let received = 0;
      this.players.filter((item) => item.id !== player.id && !item.bankrupt).forEach((item) => {
        received += this.chargePlayer(item, event.value);
      });
      player.money += received;
      description = `其他在场玩家送出 ${received} 远气贺礼。`;
    }
    if (event.type === "pay_all") {
      const others = this.players.filter((item) => item.id !== player.id && !item.bankrupt);
      const total = event.value * others.length;
      const paid = this.chargePlayer(player, total);
      const share = others.length ? Math.floor(paid / others.length) : 0;
      others.forEach((item) => { item.money += share; });
      description = player.bankrupt
        ? `变卖资产后付出 ${paid} 远气，宣告破产。`
        : `你为其他玩家支付了 ${paid} 远气。`;
    }
    if (event.type === "lose_property") {
      const ownedTiles = player.properties
        .map((id) => this.tiles.find((tile) => tile.id === id))
        .filter(Boolean);
      const lostTile = ownedTiles.length ? ownedTiles[Math.floor(this.random() * ownedTiles.length)] : null;
      if (lostTile) {
        lostTile.owner = null;
        lostTile.level = 1;
        player.properties = player.properties.filter((id) => id !== lostTile.id);
        description = `失去房产「${lostTile.name}」。`;
      } else {
        description = "没有房产可被收走。";
      }
    }
    if (event.type === "rest") {
      await this.showEventIntro(player, event, `你即将因「${event.title}」原地停留一回合。`);
      if (await this.consumeImmunity(player)) {
        description = "免疫原地停留，下一回合可正常行动。";
      } else {
        player.skipTurns = 1;
        description = "下一回合暂停行动一次。";
      }
    }
    if (!description) description = event.description;
    const cardNote = awardedCard
      ? `\n获得功能卡「${awardedCard.name}」：${awardedCard.description}${cardExtra ? "\n（能力触发，额外获得一张同名卡）" : ""}`
      : "";
    this.lastEffect = { playerId: player.id, tileId: player.position, kind: "event", deck: event.deck, title: event.title, description: event.description, outcome: `${description}${cardNote}` };
    this.log(`${player.name} 触发事件「${event.title}」：${description}`);
    this.emit();
    await this.onEffect?.(this.lastEffect);
  }

  async showEventIntro(player, event, warning) {
    this.lastEffect = { playerId: player.id, tileId: player.position, kind: "event", deck: event.deck, title: event.title, description: event.description, outcome: warning };
    this.emit();
    await this.onEffect?.(this.lastEffect);
  }

  async consumeImmunity(player) {
    if (player.immunityUses <= 0) return false;
    if (player.id === "player") {
      const approved = await this.onEffect?.({
        playerId: player.id,
        tileId: player.position,
        kind: "immunity",
        requiresDecision: true,
        title: player.character.ability.name,
        description: `你即将受到负面效果。是否消耗 1 次「${player.character.ability.name}」免疫它？（剩余 ${player.immunityUses} 次）`,
        confirmLabel: "使用免疫",
        cancelLabel: "硬吃伤害"
      });
      if (!approved) return false;
    }
    player.immunityUses -= 1;
    this.log(`${player.name} 的「${player.character.ability.name}」抵消了一次负面效果。`);
    return true;
  }

  giveCard(player) {
    const card = cards[Math.floor(this.random() * cards.length)];
    player.cards.push(card);
    this.lastEffect = { playerId: player.id, tileId: player.position, kind: "card", title: `功能卡 · ${card.name}`, description: card.description, outcome: `获得「${card.name}」${card.icon}` };
    this.log(`${player.name} 获得卡牌「${card.name}」。`);
    let extra = false;
    if (player.character.stats.cardBonus && this.random() < player.character.stats.cardBonus) {
      player.cards.push(card);
      extra = true;
      this.log(`${player.name} 的能力额外获得一张「${card.name}」。`);
    }
    return { card, extra };
  }

  discountedPrice(player, value) {
    return Math.round(value * (1 - (player.character.stats.propertyDiscount || 0)));
  }

  assetOf(player) {
    return calculateAsset(player, this.tiles);
  }

  markBankrupt(player) {
    player.bankrupt = true;
    this.tiles.forEach((tile) => {
      if (tile.owner === player.id) {
        tile.owner = null;
        tile.level = 1;
      }
    });
    player.properties = [];
    this.log(`${player.name} 资金耗尽，暂时退出竞争。`);
  }

  // 付款/扣款的统一出口：能付就付，付不起就破产。
  // 返回实际付出的金额；破产时先倾尽现金再清算资产，实际付出为清算总额。
  chargePlayer(player, amount) {
    if (amount <= 0 || player.bankrupt) return 0;
    if (player.money >= amount) {
      player.money -= amount;
      return amount;
    }
    const liquidated = this.liquidateAssets(player);
    const paid = player.money;
    player.money = 0;
    this.markBankrupt(player);
    this.log(`${player.name} 变卖了 ${liquidated} 远气的资产，仍差 ${amount - paid} 远气。`);
    return paid;
  }

  // 破产清算：房产按「购价 + 已投入升级费」的一半折价变现。
  liquidateAssets(player) {
    let raised = 0;
    player.properties.slice().forEach((id) => {
      const tile = this.tiles.find((item) => item.id === id);
      if (!tile) return;
      raised += Math.floor((tile.price + (tile.level - 1) * tile.upgradeCost) / 2);
    });
    player.money += raised;
    return raised;
  }

  endTurn() {
    if (this.players.filter((player) => !player.bankrupt).length <= 1 || this.round >= MAX_ROUNDS && this.currentPlayerIndex === this.players.length - 1) {
      this.finish();
      return;
    }
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    if (this.currentPlayerIndex === 0) this.round += 1;
    this.currentPlayer.hasRolledThisTurn = false;
    this.currentPlayer.cardLockedThisTurn = false;
    this.emit();
    if (this.currentPlayer.id !== "player") {
      setTimeout(() => this.takeTurn(this.currentPlayer), 350);
    }
  }

  finish() {
    this.phase = "finished";
    const ranking = [...this.players].sort((a, b) => calculateAsset(b, this.tiles) - calculateAsset(a, this.tiles));
    this.winner = ranking.map((player) => ({ ...player, asset: calculateAsset(player, this.tiles) }));
    this.log(`第 ${this.round} 回合结束，最终排名已生成。`);
    this.emit();
  }

  log(message) {
    this.onLog?.(message);
  }

  emit() {
    this.onStateChange?.(this.state);
  }
}
