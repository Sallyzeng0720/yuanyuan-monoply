import { characters } from "./data/characters.js";
import { GameManager } from "./game/GameManager.js";

const app = document.querySelector("#app");
const logs = [];
let state;
let effectTimer;
let effectModal = null;
let effectModalId = 0;
let effectResolver = null;
// 必须声明在 closeEffectModal 之前：模块初始化时 GameManager.reset()
// 会同步回调 onStateChange -> closeEffectModal，早于后面的声明就会踩 TDZ。
let effectCountdownRAF = null;
let game;
game = new GameManager({
  onStateChange: (next) => {
    state = next;
    if (next.phase === "select") {
      closeEffectModal();
    }
    if (game) render();
  },
  onLog: (message) => {
    logs.unshift({ message, time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) });
    logs.splice(7);
    if (game) render();
  },
  onEffect: (effect) => {
    // card_target（鸟蛋卡选地块）必须包含在内，否则会被下方的
    // requiresDecision 拦截分支直接 resolve 掉，弹窗永不显示、
    // pendingCardUpgrade 无人可清，busy 永远为 true 导致整局卡死。
    const isPopupEffect = effect && ["event", "card", "reward", "rest", "teleport", "rent", "skill", "purchase", "upgrade", "decision", "immunity", "card_target", "dice_pick"].includes(effect.kind);
    if (effect?.requiresDecision && !isPopupEffect) {
      closeEffectModal();
      render();
      return Promise.resolve();
    }
    closeEffectModal();
    effectModal = effect;
    const activeModalId = ++effectModalId;
    render();
    const isDecision = Boolean(effect?.requiresDecision);
    return new Promise((resolve) => {
      effectResolver = resolve;
      // 带选项的弹窗必须等玩家点选；普通结算弹窗 3 秒后自动关闭，
      // 3 秒内随时可以点空白区域提前关掉。
      if (isDecision) return;
      startEffectCountdown(activeModalId, effect);
    });
  }
});
game.setCharacters(characters);

function money(value) {
  return `${Math.max(0, Math.round(value)).toLocaleString("zh-CN")} 远气`;
}

function categoryLabel(category) {
  return { positive: "正面", negative: "负面", neutral: "中性" }[category] || "中性";
}

function icon(type) {
  return { start: "⌂", property: "◆", event: "?", card: "▣", teleport: "↗", rest: "◌", reward: "✦" }[type] || "·";
}

function imageToken(character, className, source = "avatar") {
  const imageSource = character[source] || character.avatar;
  return `<div class="${className} image-token" style="--accent:${character.theme}"><img src="${imageSource}" alt="${character.name}" onerror="this.parentElement.classList.add('image-missing'); this.remove();"><span>${character.badge}</span></div>`;
}

// “qq 人”头像：优先用立绘，缺图时自动降级成角色首字母圆形牌。
function avatarMarkup(character, className, source = "avatar") {
  const imageSource = character[source] || character.avatar;
  return `<span class="${className}" style="--accent:${character.theme}" title="${character.name}"><img src="${imageSource}" alt="${character.name}" onerror="this.parentElement.classList.add('image-missing'); this.remove();"><b>${character.badge}</b></span>`;
}

function render() {
  if (state.phase === "select") renderSelection();
  else if (state.phase === "finished") renderFinished();
  else renderGame();
  syncEffectModal();
}

function renderSelection() {
  app.innerHTML = `
    <section class="select-screen">
      <div class="select-orbit orbit-one"></div><div class="select-orbit orbit-two"></div>
      <header class="brand-block">
        <div class="brand-mark">Y</div>
        <div><span class="eyebrow">ZHANGYUAN FAN GAME</span><h1>远远大富翁</h1></div>
        <button class="guide-entry" id="open-guide" type="button">❓ 玩法说明</button>
      </header>
      <div class="select-copy">
        <p class="section-kicker">SELECT YOUR ZHANGYUAN</p>
        <h2>选择你的小鸟</h2>
        <p>挑选一套妆造，带着属于你的能力踏上这场 30 回合的远气之旅。</p>
      </div>
      <div class="character-grid">
        ${characters.map((character, index) => `
          <button class="character-card ${game.selectedCharacterId === character.id ? "selected" : ""}" style="--accent:${character.theme}" data-character="${character.id}">
            <div class="card-top"><span class="serial">0${index + 1}</span><span class="character-badge">${character.badge}</span></div>
            ${imageToken(character, "avatar-placeholder")}
            <div class="character-info"><h3>${character.name}</h3><p>${character.description}</p><strong>${character.ability.name}</strong><small>${character.ability.description}</small></div>
          </button>
        `).join("")}
      </div>
      <div class="select-footer"><span>第一期 · 1 位玩家 + 3 位对手</span><button class="primary-button" id="start-game" ${game.selectedCharacterId ? "" : "disabled"}>开始游戏 <span>→</span></button></div>
    </section>`;
  app.querySelectorAll("[data-character]").forEach((button) => button.addEventListener("click", () => {
    game.selectedCharacterId = button.dataset.character;
    render();
  }));
  app.querySelector("#open-guide")?.addEventListener("click", openGuide);
  app.querySelector("#start-game")?.addEventListener("click", () => {
    window.scrollTo({ top: 0, left: 0 });
    game.start(game.selectedCharacterId);
  });
}

// ---- 玩法说明弹层 --------------------------------------------------------
// 只在选角色界面挂载，不进入游戏状态机（不碰 game.emit / render）。

const GUIDE_SECTIONS = [
  {
    title: "游戏目标",
    items: [
      "你和 3 位小鸟对手轮流行动，总共进行 30 回合。",
      "回合结束时，资产总值（现金 + 地块价值）最高的人获胜。",
      "任意时刻只剩 1 人没有破产，对局立刻结束。"
    ]
  },
  {
    title: "每回合怎么做",
    items: [
      "轮到你时点「掷骰子」，小鸟会按点数逐格前进。",
      "落地后按格子类型结算：买地、抽卡、触发事件等。",
      "每回合只能掷 1 次骰；掷骰后本回合不能再使用卡牌。",
      "读秒弹窗是普通结算，4 秒后自动关闭；带选项的弹窗需要你点选。"
    ]
  },
  {
    title: "地块与过路费",
    items: [
      "空地可以买下；落到自己的地块且建筑未满级时可以升级。",
      "建筑最高 4 级，等级越高，别人踩上来的过路费越贵。",
      "落到他人地块需要支付过路费；现金不够会先变卖地块抵债，仍不足则破产出局。",
      "经过起点可领取 200 远气。"
    ]
  },
  {
    title: "特殊格子",
    items: [
      "随机事件：抽机会 / 命运，可能加钱、扣钱、送卡或让你停留一回合。",
      "卡牌格：获得 1 张功能卡，进入右侧「我的卡牌」。",
      "奖励格：直接获得 220 远气。",
      "休息格：下一回合原地停留（部分角色的能力可以免疫）。",
      "传送门：直接传送到第 11 格的随机事件格。"
    ]
  },
  {
    title: "卡牌怎么用",
    items: [
      "卡牌格或事件给到的功能卡，会显示在右侧「我的卡牌」里。",
      "出牌不消耗回合，掷骰前随时可用，但回合结束后本回合就不能再出牌。",
      "卡牌分正面 / 负面 / 中性三类，部分卡牌（如鸟蛋卡）会让你选一个地块再生效。",
      "每张卡牌的效果都写在卡面上，鼠标停在卡片上就能看到说明。"
    ]
  },
  {
    title: "角色技能",
    items: [
      "每只小鸟都有专属能力，显示在选人卡片和游戏右栏。",
      "主动类技能（如玫瑰鸟、海神鸟、魔法鸟）需要手动点「使用技能」。",
      "被动类技能（如朱雀、骑士鸟、牛仔鸟、总裁鸟）自动生效，不用操作。",
      "带次数的技能用完为止，游戏全程不会补充。"
    ]
  },
  {
    title: "小提示",
    items: [
      "掷骰前留意手里的卡牌，一张涨价卡或免疫卡往往能决定一整局。",
      "前期优先抢下高价位地块，后期靠升级拉开过路费差距。",
      "现金别全部砸进地块，留着应对突发事件和别人的过路费。"
    ]
  }
];

function guideSectionMarkup(section) {
  return `<section class="guide-section"><h3>${section.title}</h3><ul>${section.items.map((item) => `<li>${item}</li>`).join("")}</ul></section>`;
}

function guideMarkup() {
  const half = Math.ceil(GUIDE_SECTIONS.length / 2);
  const columns = [GUIDE_SECTIONS.slice(0, half), GUIDE_SECTIONS.slice(half)];
  return `<div class="guide-backdrop" id="guide-backdrop" role="dialog" aria-modal="true" aria-label="玩法说明">
    <section class="guide-modal">
      <header class="guide-head">
        <div><span class="section-kicker">HOW TO PLAY</span><h2>玩法说明</h2><p>3 分钟看懂这场远气巡演怎么玩。</p></div>
        <button class="guide-close" id="close-guide" type="button" aria-label="关闭玩法说明">✕</button>
      </header>
      <div class="guide-body">${columns.map((column) => `<div class="guide-column">${column.map(guideSectionMarkup).join("")}</div>`).join("")}</div>
      <footer class="guide-foot"><span>了解啦，去挑一只属于你的小鸟 🐦</span><button class="primary-button" id="guide-confirm" type="button">知道了 <span>→</span></button></footer>
    </section>
  </div>`;
}

function openGuide() {
  document.querySelector(".guide-host")?.remove();
  const host = document.createElement("div");
  host.className = "guide-host";
  host.innerHTML = guideMarkup();
  document.body.appendChild(host);
  host.querySelector("#close-guide")?.addEventListener("click", closeGuide);
  host.querySelector("#guide-confirm")?.addEventListener("click", closeGuide);
  host.querySelector("#guide-backdrop")?.addEventListener("click", (event) => {
    if (event.target.id === "guide-backdrop") closeGuide();
  });
  document.addEventListener("keydown", guideKeyHandler);
}

function guideKeyHandler(event) {
  if (event.key === "Escape") closeGuide();
}

function closeGuide() {
  document.querySelector(".guide-host")?.remove();
  document.removeEventListener("keydown", guideKeyHandler);
}

function renderGame() {
  const current = state.players[state.currentPlayerIndex];
  const player = state.players.find((item) => item.id === "player");
  app.innerHTML = `
    <div class="game-shell">
      <header class="topbar">
        <div class="brand-inline"><div class="brand-mark small">Y</div><div><b>远远大富翁</b><span>THE YUAN TOUR</span></div></div>
        <div class="round-indicator"><span>ROUND</span><strong>${state.round}<em>/30</em></strong></div>
        <button class="quiet-button" id="restart">↻ <span>重新开始</span></button>
      </header>
      <div class="game-layout">
        <aside class="left-panel">
          <section class="panel-section turn-panel"><p class="section-kicker">CURRENT TURN</p><div class="turn-person">${imageToken(current.character, "mini-avatar")}<div><strong>${current.name}</strong><span>${current.character.name}</span></div></div><div class="turn-status">${current.id === "player" ? "轮到你行动" : "对手正在行动..."}</div><div class="turn-roll"><span>最近一次骰子</span><strong>${current.lastRoll || "—"}</strong></div></section>
          <section class="panel-section"><div class="section-title"><span>玩家状态</span><span class="muted">4 PLAYERS</span></div>${state.players.map(playerRow).join("")}</section>
          <section class="panel-section log-panel"><div class="section-title"><span>现场记录</span><span class="live-dot">LIVE</span></div><div class="log-list">${logs.map((item) => `<div class="log-item"><time>${item.time}</time><span>${item.message}</span></div>`).join("") || "<div class=\"empty-log\">等待第一回合开始...</div>"}</div></section>
        </aside>
        <main class="board-stage">
          <div class="board-heading"><div><p class="section-kicker">THE YUAN TOUR</p><h1>把好运走成自己的主场</h1></div><div class="legend"><span><i class="legend-dot own"></i>我的地块</span><span><i class="legend-dot other"></i>他人地块</span></div></div>
          <div class="board-wrap"><div class="board show-all-positions">${state.tiles.map(tileMarkup).join("")}<div class="board-center"><span class="center-star">Y</span><b>远气<br>巡演场</b><small>ROLL · MOVE · OWN</small><div class="action-bar"><div class="dice-display ${state.diceRolling ? "rolling" : state.lastRoll ? "rolled" : ""}">${state.lastRoll || "?"}</div><div class="action-copy"><span class="section-kicker">${state.diceRolling ? "ROLLING..." : "YOUR MOVE"}</span><strong>${state.diceRolling ? `${current.name} 正在掷骰子...` : state.currentPlayerResting ? "本回合休息，跳过行动" : current.id === "player" ? (state.lastRoll ? `掷出 ${state.lastRoll} 点，看看会落在哪里` : "准备好就掷骰子") : `${current.name} 的回合`}</strong><small class="action-hint">${state.diceRolling ? "骰子停止后，角色将逐格移动" : state.currentPlayerResting ? "休息回合不能掷骰，下回合恢复正常" : current.id === "player" ? "每一步都会清楚显示" : "请观察骰子、移动和落地效果"}</small></div><button class="roll-button" id="roll" ${!game.canCurrentPlayerRoll() ? "disabled" : ""}>🎲 ${state.diceRolling ? "掷骰中..." : state.currentPlayerResting ? "休息中" : current.hasRolledThisTurn ? "本回合已掷骰" : "掷骰子"}</button></div></div></div></div>
        </main>
        <aside class="right-panel">
          <section class="wallet-panel"><span>我的远气</span><strong>${money(player.money)}</strong><small>资产总值 ${money(totalAsset(player))}</small></section>
          <section class="panel-section detail-panel"><div class="section-title"><span>我的卡牌</span><span class="muted">${player.cards.length}/6</span></div><div class="card-list">${player.cards.length ? player.cards.map((card, index) => `<button class="item-card card-${card.category || "neutral"}" data-card="${index}" ${player.cardLockedThisTurn || current.id !== "player" || game.busy ? "disabled" : ""}><b>${card.icon}</b><span>${card.name}<em>${categoryLabel(card.category)}</em></span><small>${card.description}</small></button>`).join("") : "<div class=\"empty-card\">在卡牌格或事件中获得卡牌</div>"}</div>${player.cards.length && player.cardLockedThisTurn ? `<div class="card-lock-hint">本回合已掷骰，卡牌下回合可用</div>` : ""}</section>
          ${skillPanel(player, current)}
          <section class="panel-section detail-panel"><div class="section-title"><span>我的地块</span><span class="muted">${player.properties.length} OWNED</span></div><div class="property-list">${player.properties.length ? player.properties.map((id) => { const tile = state.tiles.find((item) => item.id === id); return `<div class="owned-property"><span style="--accent:${tile.theme}"></span><div><b>${tile.name}</b><small>Lv.${tile.level} · 过路费 ${tile.baseRent + (tile.level - 1) * 40}</small></div></div>`; }).join("") : "<div class=\"empty-card\">买下第一块属于你的主场</div>"}</div></section>
          ${state.lastEffect && state.lastEffect.kind !== "decision" ? `<section class="effect-panel"><span class="section-kicker">LATEST EFFECT</span><strong>${state.lastEffect.title}</strong><p>${state.lastEffect.description}</p></section>` : ""}
        </aside>
      </div>
    </div>`;
  app.querySelector("#roll")?.addEventListener("click", () => game.rollForHuman());
  // 玩家休息回合自动跳过：玩家无需点按，界面只显示「休息中」。
  if (game.isCurrentPlayerResting() && !game.busy) {
    setTimeout(() => game.autoSkipIfResting(), 900);
  }
  app.querySelector("#restart")?.addEventListener("click", () => { game.reset(); game.setCharacters(characters); });
  app.querySelectorAll("[data-card]").forEach((button) => button.addEventListener("click", async () => {
    await game.useCard("player", Number(button.dataset.card));
  }));
  app.querySelector("#use-skill")?.addEventListener("click", () => game.useCurrentSkill());
  app.querySelectorAll("[data-skill-target]").forEach((button) => button.addEventListener("click", () => game.useCurrentSkill(button.dataset.skillTarget)));
}

function playerRow(player) {
  const isActive = player.id === state.players[state.currentPlayerIndex].id;
  const rollText = player.lastRoll || "—";
  return `<div class="player-row ${isActive ? "active" : ""} ${player.bankrupt ? "bankrupt" : ""}">${imageToken(player.character, "mini-avatar")}<div class="player-meta"><b>${player.name}</b><span>${player.character.name}</span></div><div class="player-roll ${player.lastRoll ? "has-roll" : ""}" aria-label="${player.lastRoll ? `最近骰子 ${player.lastRoll}` : "尚未掷骰"}"><small>最近骰子</small><strong>${rollText}</strong></div><strong class="player-money">${money(player.money).replace(" 远气", "")}</strong></div>`;
}

function tileMarkup(tile) {
  const occupants = state.players.filter((player) => player.position === tile.id && !player.bankrupt);
  const owner = tile.owner && state.players.find((player) => player.id === tile.owner);
  const currentPlayer = state.players[state.currentPlayerIndex];
  const visibleOccupants = occupants;
  const occupantsMarkup = visibleOccupants.length
    ? `<div class="occupants">${visibleOccupants.map((player) => `<span class="pawn image-token ${player.id === currentPlayer?.id ? "active-pawn" : ""} ${player.id === "player" ? "human" : ""}" style="--pawn:${player.character.theme}; --accent:${player.character.theme}" title="${player.name}"><img src="${player.character.sprite || player.character.avatar}" alt="${player.name}" onerror="this.parentElement.classList.add('image-missing'); this.remove();"><span>${player.character.badge}</span></span>`).join("")}</div>`
    : "";
  return `<div class="tile tile-${tile.type} ${owner?.id === "player" ? "my-tile" : owner ? "owned-tile" : ""}" style="--tile-accent:${tile.theme}" data-tile="${tile.id}"><div class="tile-icon">${icon(tile.type)}</div><b>${tile.name}</b>${tile.type === "property" ? `<small>${tile.price}<br>${tile.owner ? `Lv.${tile.level}` : "可购买"}</small>` : ""}${owner ? avatarMarkup(owner.character, "owner-chip") : ""}${occupantsMarkup}</div>`;
}

function totalAsset(player) {
  return player.money + player.properties.reduce((sum, id) => { const tile = state.tiles.find((item) => item.id === id); return sum + (tile?.price || 0) + ((tile?.level || 1) - 1) * (tile?.upgradeCost || 0); }, 0);
}

function skillPanel(player, current) {
  const ability = player.character.ability;
  const activeIds = ["income", "defense", "upgrade"];
  const isActiveSkill = activeIds.includes(ability.id);
  const usageText = player.activeSkillUses === null ? "不限次" : `${player.activeSkillUses || 0} 次`;
  const locked = current.id !== "player" || game.busy || !isActiveSkill || player.activeSkillUses === 0;
  if (ability.id === "upgrade") {
    const targets = state.players.filter((item) => item.id !== "player" && !item.bankrupt);
    return `<section class="panel-section skill-panel"><div class="section-title"><span>角色技能</span><span class="muted">${usageText}</span></div><strong>${ability.name}</strong><p>${ability.description}</p><div class="skill-targets">${targets.map((target) => `<button class="text-button skill-target" data-skill-target="${target.id}" ${locked ? "disabled" : ""}>和 ${target.name} 交换</button>`).join("")}</div></section>`;
  }
  if (isActiveSkill) {
    return `<section class="panel-section skill-panel"><div class="section-title"><span>角色技能</span><span class="muted">${usageText}</span></div><strong>${ability.name}</strong><p>${ability.description}</p><button class="small-button" id="use-skill" ${locked || !canUseTileSkill(player) ? "disabled" : ""}>使用技能</button>${!canUseTileSkill(player) ? `<small>当前地块没有可处理的建筑</small>` : ""}</section>`;
  }
  return `<section class="panel-section skill-panel"><div class="section-title"><span>角色技能</span><span class="muted">自动</span></div><strong>${ability.name}</strong><p>${ability.description}</p>${ability.id === "card" ? `<small>剩余免疫 ${player.immunityUses} 次</small>` : ""}</section>`;
}

function canUseTileSkill(player) {
  const tile = state.tiles[player.position];
  return tile?.type === "property" && tile.level > 1;
}

function canBuyCurrent() {
  const player = state.players.find((item) => item.id === "player");
  if (!state.lastEffect || state.lastEffect.playerId !== "player") return false;
  const tile = state.tiles.find((item) => item.id === state.lastEffect.tileId);
  return game.pendingPurchase !== null && tile?.type === "property" && !tile.owner && player.money >= game.discountedPrice(player, tile.price);
}

function canUpgradeCurrent() {
  const player = state.players.find((item) => item.id === "player");
  if (!state.lastEffect || state.lastEffect.playerId !== "player" || game.pendingUpgrade === null) return false;
  const tile = state.tiles.find((item) => item.id === game.pendingUpgrade);
  return tile?.owner === player.id && tile.level < 4 && player.money >= game.discountedPrice(player, tile.upgradeCost * tile.level);
}

function renderFinished() {
  app.innerHTML = `<section class="finish-screen"><div class="finish-confetti"></div><p class="section-kicker">THE TOUR IS COMPLETE</p><h1>这一场，走到了终点</h1><p class="finish-subtitle">30 回合的远气巡演结束，看看谁把主场经营得最好。</p><div class="ranking">${state.winner.map((player, index) => `<div class="rank-row"><span class="rank-number">${["🥇", "🥈", "🥉", "4"][index]}</span>${imageToken(player.character, "mini-avatar")}<div><b>${player.name}</b><small>${player.character.name} · ${player.properties.length} 块地</small></div><strong>${money(player.asset)}</strong></div>`).join("")}</div><button class="primary-button" id="restart-finish">再来一局 <span>→</span></button></section>`;
  app.querySelector("#restart-finish").addEventListener("click", () => { game.reset(); game.setCharacters(characters); });
}

function syncEffectModal() {
  let host = document.querySelector(".effect-modal-host");
  if (!effectModal) {
    host?.remove();
    return;
  }
  if (!host) {
    host = document.createElement("div");
    host.className = "effect-modal-host";
    document.body.appendChild(host);
  }
  if (host.dataset.effectId !== String(effectModalId)) {
    host.dataset.effectId = String(effectModalId);
    host.innerHTML = effectModalMarkup(effectModal);
    bindEffectModalActions(host);
  }
}

function bindEffectModalActions(root) {
  // 点击空白区域（遮罩本身）可立即关闭；点弹窗内部不关。带选项的弹窗必须点选。
  root.querySelector(".effect-modal-backdrop")?.addEventListener("click", (event) => {
    if (event.target !== event.currentTarget) return;
    if (!effectModal || !effectModal.autoClosing) return;
    dismissEffectModalOnce();
  });
  root.querySelector("#immunity-confirm")?.addEventListener("click", () => {
    const resolve = effectResolver;
    closeEffectModal();
    resolve?.(true);
  });
  root.querySelector("#immunity-cancel")?.addEventListener("click", () => {
    const resolve = effectResolver;
    closeEffectModal();
    resolve?.(false);
  });
  root.querySelector("#buy-current")?.addEventListener("click", async () => {
    closeEffectModal();
    await game.buyCurrentProperty();
  });
  root.querySelector("#pass-purchase")?.addEventListener("click", async () => {
    closeEffectModal();
    await game.passCurrentPurchase();
  });
  root.querySelector("#upgrade-current")?.addEventListener("click", async () => {
    closeEffectModal();
    await game.upgradeCurrentProperty();
  });
  root.querySelector("#pass-upgrade")?.addEventListener("click", async () => {
    closeEffectModal();
    await game.passCurrentUpgrade();
  });
  root.querySelectorAll("[data-card-upgrade]").forEach((button) => button.addEventListener("click", async () => {
    closeEffectModal();
    await game.confirmCardUpgrade(Number(button.dataset.cardUpgrade));
  }));
  root.querySelectorAll("[data-dice-pick]").forEach((button) => button.addEventListener("click", () => {
    closeEffectModal();
    game.confirmDicePick(Number(button.dataset.dicePick));
  }));
  root.querySelector("#cancel-dice-pick")?.addEventListener("click", () => {
    closeEffectModal();
    game.cancelDicePick();
  });
  root.querySelector("#cancel-card-upgrade")?.addEventListener("click", async () => {
    closeEffectModal();
    await game.cancelCardUpgrade();
  });
}

function closeEffectModal() {
  clearTimeout(effectTimer);
  effectTimer = null;
  stopEffectCountdownLoop();
  if (effectModal) { effectModal.autoClosing = false; effectModal.secondsLeft = null; }
  effectModal = null;
  effectModalId += 1;
  const resolve = effectResolver;
  effectResolver = null;
  resolve?.();
  document.querySelector(".effect-modal-host")?.remove();
}

// ---- 弹窗自动关闭 + 点击空白关闭 ------------------------------------------

// 罐罐反馈"字还没看完就自动关了"，从 3 秒放宽到 8 秒。
// 仍然保留自动关闭：玩家不操作时回合要能自己往下走，不能死等。
const MODAL_AUTO_CLOSE_MS = 8000;

// 启动倒计时：先把状态写进 effectModal 再渲染，保证首次绘制就是 3 秒。
function startEffectCountdown(activeModalId, effect) {
  effect.autoClosing = true;
  effect.secondsLeft = Math.ceil(MODAL_AUTO_CLOSE_MS / 1000);
  effect.countdownEndsAt = Date.now() + MODAL_AUTO_CLOSE_MS;
  render();
  startEffectCountdownLoop();
}

function startEffectCountdownLoop() {
  stopEffectCountdownLoop();
  const tick = () => {
    if (!effectModal || !effectModal.autoClosing) {
      effectCountdownRAF = null;
      return;
    }
    const left = effectModal.countdownEndsAt - Date.now();
    const seconds = Math.max(0, Math.ceil(left / 1000));
    if (seconds !== effectModal.secondsLeft) {
      effectModal.secondsLeft = seconds;
      const label = document.querySelector(".modal-countdown");
      if (label) label.textContent = `${seconds} 秒后自动关闭`;
    }
    if (left <= 0) {
      effectCountdownRAF = null;
      closeEffectModal();
      return;
    }
    effectCountdownRAF = requestAnimationFrame(tick);
  };
  effectCountdownRAF = requestAnimationFrame(tick);
}

function stopEffectCountdownLoop() {
  if (effectCountdownRAF !== null) {
    cancelAnimationFrame(effectCountdownRAF);
    effectCountdownRAF = null;
  }
}

// 弹窗关闭后会 resolve onEffect，游戏才能继续推进，所以不允许反复点击。
function dismissEffectModalOnce() {
  if (!effectModal || effectModal.dismissed) return;
  effectModal.dismissed = true;
  closeEffectModal();
}

function effectModalMarkup(effect) {
  const player = state.players.find((item) => item.id === effect.playerId);
  const isEvent = effect.kind === "event" || effect.kind === "card";
  const isDecision = Boolean(effect.requiresDecision);
  const eventLabel = effect.deck === "chance"
    ? "机会事件"
    : effect.deck === "fate"
      ? "命运事件"
      : effect.deck === "event"
        ? "随机事件"
        : effect.kind === "card"
          ? "获得功能卡"
          : effect.kind === "immunity"
            ? "天赋选择"
            : effect.kind === "card_target"
              ? "选择地块"
              : effect.kind === "dice_pick"
              ? "指定点数"
              : effect.kind === "decision"
              ? (effect.title === "升级地块" ? "升级选择" : "购买选择")
              : "TURN RESULT";
  const modalClass = isEvent ? `event-modal deck-${effect.deck || "card"}` : isDecision || effect.kind === "card_target" || effect.kind === "dice_pick" ? "event-modal decision-modal" : "";
  let decisionActions = "";
  if (effect.kind === "immunity") {
    decisionActions = `<div class="effect-actions"><button class="primary-button" id="immunity-confirm">${effect.confirmLabel || "使用免疫"}</button><button class="text-button" id="immunity-cancel">${effect.cancelLabel || "硬吃伤害"}</button></div>`;
  } else if (effect.kind === "decision") {
    const affordable = effect.title === "升级地块" ? canUpgradeCurrent() : canBuyCurrent();
    if (effect.title === "升级地块") {
      // 钱不够时不显示「升级」按钮，只留「暂不升级」，否则点了静默失败会卡住。
      decisionActions = affordable
        ? `<div class="effect-actions"><button class="primary-button" id="upgrade-current">升级地块</button><button class="text-button" id="pass-upgrade">暂不升级</button></div>`
        : `<div class="effect-actions"><button class="text-button" id="pass-upgrade">远气不足，暂不升级</button></div>`;
    } else {
      decisionActions = affordable
        ? `<div class="effect-actions"><button class="primary-button" id="buy-current">购买地块</button><button class="text-button" id="pass-purchase">放弃</button></div>`
        : `<div class="effect-actions"><button class="text-button" id="pass-purchase">远气不足，放弃购买</button></div>`;
    }
  } else if (effect.kind === "dice_pick") {
    decisionActions = `<div class="tile-picker dice-picker">${[1, 2, 3, 4, 5, 6].map((value) => `<button class="tile-target dice-target" data-dice-pick="${value}"><b>${value}</b><small>${value} 点</small></button>`).join("")}</div><div class="effect-actions"><button class="text-button" id="cancel-dice-pick">取消使用</button></div>`;
  } else if (effect.kind === "card_target") {
    const candidates = state.tiles.filter((tile) => tile.type === "property" && tile.level < 4);
    decisionActions = candidates.length
      ? `<div class="tile-picker">${candidates.map((tile) => `<button class="tile-target" data-card-upgrade="${tile.id}"><b>${tile.name}</b><small>Lv.${tile.level} → Lv.${tile.level + 1}</small></button>`).join("")}</div><div class="effect-actions"><button class="text-button" id="cancel-card-upgrade">取消使用</button></div>`
      : `<div class="effect-actions"><button class="text-button" id="cancel-card-upgrade">没有可升级的地块</button></div>`;
  }
  const countdown = isDecision || effect.kind === "card_target" || effect.kind === "dice_pick"
    ? ""
    : `<div class="modal-countdown">${effect.secondsLeft ?? Math.ceil(MODAL_AUTO_CLOSE_MS / 1000)} 秒后自动关闭（点空白处可立即关闭）</div>`;
  const detail = effect.description || "效果已触发。";
  const outcome = effect.outcome || "";
  const body = isEvent
    ? `<div class="modal-block"><span class="modal-block-label">${effect.kind === "card" ? "卡牌详情" : "事件详情"}</span><p>${detail}</p></div>${outcome ? `<div class="modal-block"><span class="modal-block-label">${effect.kind === "card" ? "卡牌效果" : "获得效果"}</span><p>${outcome}</p></div>` : ""}`
    : `<p>${detail}</p>`;
  // 普通结算弹窗：把顶部的装饰符号换成「是谁触发了这个事件」的 qq 人头像。
  // 头像下方只写角色名一次；player.name 往往就等于角色名，拼两个会重复。
  const actorName = player && player.name !== player.character.name
    ? `${player.name} · ${player.character.name}`
    : player?.character.name || "";
  const spark = isEvent || !(isDecision || effect.kind === "card_target" || effect.kind === "dice_pick")
    ? (actorName
      ? `<div class="modal-actor">${avatarMarkup(player.character, "modal-actor-avatar", "sprite")}<span>${actorName}</span></div>`
      : `<div class="modal-spark">${isEvent ? "✦" : "✓"}</div>`)
    : `<div class="modal-spark">?</div>`;
  // 兜底：走 modal-spark 分支时也要告诉玩家是谁触发的。
  const actorLine = actorName && spark.includes("modal-spark")
    ? `<small>${actorName}</small>`
    : "";
  return `<div class="effect-modal-backdrop" role="status" aria-live="polite"><section class="effect-modal ${modalClass}">${spark}<span class="section-kicker">${eventLabel}</span><strong>${effect.title}</strong>${body}${actorLine}${decisionActions}${countdown}</section></div>`;
}
