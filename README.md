# Resonance Tower

桌面優先的純 HTML／CSS／JavaScript 掛機戰鬥遊戲原型。

## 本機執行

直接以瀏覽器開啟 `prototype/index.html` 即可。開發與回歸測試需要 Node.js，瀏覽器流程測試目前使用 Windows 系統安裝的 Microsoft Edge：

```powershell
npm install
npm test
```

`npm test` 會依序執行狀態轉移、進度、多語言、存檔相容性與真實瀏覽器 UI 回歸測試。

## 前端結構

- `prototype/js/`：遊戲狀態、戰鬥、轉場與依功能拆分的 UI 程式。
- `prototype/styles/`：依基礎、物品、故事與世界畫面拆分的樣式。
- `prototype/assets/`：角色、怪物、場景與 UI 圖片。
- `tests/`：Node.js 單元測試與 Edge UI 回歸測試。
- `design.md`：目前玩法、介面與技術決策的主要規格。
