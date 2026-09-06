# Resonance Tower

桌面優先的純 HTML／CSS／JavaScript 掛機戰鬥遊戲原型。

## 本機執行

`prototype/js/` 已全面改為 ES modules，`index.html` 以單一 `<script type="module">` 載入整棵依賴樹。瀏覽器對 `type="module"` 的 script 會擋 `file://` 來源的 CORS，所以**不能再直接雙擊 `prototype/index.html` 開啟**，必須透過本機 HTTP server，例如：

```powershell
cd prototype
python -m http.server 8000
# 瀏覽器開 http://127.0.0.1:8000/index.html
```

開發與回歸測試需要 Node.js，瀏覽器流程測試目前使用 Windows 系統安裝的 Microsoft Edge：

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

## 本機工作資料

- `story/`：核准劇本；回歸測試會讀取，並非廢棄資料。
- `docs/`：設計決策、驗證與產圖提示詞紀錄。
- `.local/art-drafts/`：尚未採用的產圖草稿（原 `output/`）。
- `.local/debug_screenshot/`：手動回報問題的截圖（原根目錄同名資料夾）。
- `.local/test-results/`：測試與 UI 檢查工具的截圖輸出。

`.local/` 不提交 Git。既有草稿與截圖只搬移、未刪除；正式遊戲圖片仍放在 `prototype/assets/`。`node_modules/` 是測試依賴，不是遊戲美術或廢棄資料。
