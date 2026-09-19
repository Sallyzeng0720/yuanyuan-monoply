# 素材替换说明

当前版本不包含任何官方图片或活动素材，但页面已经接入图片显示。

把用户提供的素材放到对应角色文件夹即可：

- `assets/characters/character_01/avatar.png`
- `assets/characters/character_01/idle.png`
- `assets/characters/character_01/move.png`

8 个角色目录都已经建好：

- `assets/characters/character_01/`
- `assets/characters/character_02/`
- `assets/characters/character_03/`
- `assets/characters/character_04/`
- `assets/characters/character_05/`
- `assets/characters/character_06/`
- `assets/characters/character_07/`
- `assets/characters/character_08/`

文件用途：

- `avatar.png`：角色选择页、左侧玩家状态、结算榜头像
- `idle.png`：棋盘上的玩家棋子
- `move.png`：预留给后续移动动画

如果某个图片不存在，页面会自动显示原来的字母占位，不会出现空白或破图。

角色数据集中在 `src/data/characters.js`，新增角色只需要补充配置和对应素材目录。
