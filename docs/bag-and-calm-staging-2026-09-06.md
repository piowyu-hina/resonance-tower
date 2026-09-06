# 清爽遠征背景、滿版首領演出、背包重製

## 背景

使用 imagegen 技能與內建圖片生成工具，沒有 CLI／外部 API。新圖儲存於 `prototype/assets/backgrounds/expedition-staging-calm.png`，原始生成檔留在 Codex generated_images。舊 `expedition-staging-wide.png` 與 `expedition-staging.png` 保留；正常固定畫布入口改套新版。

以大塊樹冠、乾淨土路和柔和遠景取代高密度碎葉、碎石與斑點。保持左側角色、右側情報的空間。

### 完整提示詞

```text
Use case: stylized-concept. Asset: finished 16:9 wide fantasy RPG expedition preparation background, 1792x1008. A peaceful broad smooth earth path outside a cozy medieval village at the edge of a forest. Soft hand-painted anime environment with elegant simplified shapes, spacious breathable composition. A single distant cottage and low smooth stone wall at upper left; only a few widely spaced tree trunks framing the sides; foliage painted as LARGE soft connected masses, not individual leaves. Broad gentle shadows on an open, almost smooth foreground path. Warm cream sunlight, soft sage green trees, pale blue atmospheric distance. Left center reserved for an overlaid character, right half quieter and slightly shaded for a UI panel. Prioritize low visual density, large restful areas, clear forms. NO granular textures, NO stippling, NO tiny repeated leaf or pebble patterns, NO clusters of dots or holes, NO busy cobblestones, NO dense flowers or mushrooms, NO dense dappled light. Beautiful softly painted scene, not a blurred photo. No characters, text, UI, borders, black bars, watermark. Fill the full wide frame.
```

## 演出

玩家所見的上下留黑是 `.bossCinemaBars`，並非背景尺寸不足。只關閉史萊姆王這段的黑帶；維持原有角色尺寸、動作時間與不可跳過規則。滿版指鋪滿 1600×900 遊戲畫布，不突破非 16:9 視窗的外層留邊；遺跡之主不變。

## 背包

- 頂排色差修正：主面板與 sticky 標題列共用不透明 `--bag-surface` 暖棕底色，避免標題列形成另一塊色帶；保留分隔細線與捲動置頂。
- 最上緣殘留亮帶：移除主面板 5px inset 高光，避免被標題列遮住部分後產生不連續內邊；保留 1px 外框及外側陰影。
- 金邊移除方案遭玩家否決，已恢復原本 1px 金色外框。保留統一底色與移除 inset 高光的修正；頂緣疑似色差仍待釐清，不能以刪除金邊代替修復。
- `styles/inventory.css` 集中新版暖棕、金邊樣式；使用現有 bag.png，不另生成介面圖片。
- 左側四欄大圖示物品格，保留原本空格與數量；右側為常駐詳情，不必追著浮動 tooltip 閱讀。
- 點選／Enter／空白鍵查看物品；拖曳換位後保留所選品項。
- 關閉列 sticky，背包長內容自行捲動，不帶動整頁。
- 空背包顯示行囊插圖與提示；金幣同步、物品數量、出戰攜帶與販售規則不改。
- 頂部入口、背包標題與收入結果的中文命名統一為「背包」。

驗證：完整 npm test、縮放／初遇逐段／首領演出回歸；補上背包點選、鍵盤查看、拖曳保留選取與長內容捲動。實際檢查 1600×900 的新背景與有物品背包截圖。
