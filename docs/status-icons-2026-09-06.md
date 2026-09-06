# 狀態圖示素材交接

目前缺少專用圖示的五個狀態由 `prototype/js/state.js` 的 `STATUS_DEFS` 定義，透過 `shortLabel` 顯示文字；不是已存在的圖片載入失敗。正式圖片完成前保留目前狀態提示，避免辨識資訊消失。

## 待製作

建議交付至 `prototype/assets/effect_icon/`，實際收到圖片後再接入狀態定義：

| 狀態 | 建議檔名 | 視覺概念 |
| --- | --- | --- |
| 靈巧閃避 | evasion.png | 銀白羽毛、青色疾風 |
| 破綻就緒 | opening.png | 被劍尖指向的金色裂隙 |
| 撐住 | resolve.png | 翡翠愛心外圍包覆保護光芒 |
| 反擊就緒 | counter_ready.png | 劍與回轉箭頭，藍金色 |
| 斬擊強化 | slash_ready.png | 包覆橙金火光的劍刃 |

正方形 PNG、真正透明背景、大輪廓、少細節、不寫文字；縮小至 25px 仍能辨識。保持約 10% 安全邊界。舉盾沿用防禦盾牌；睡眠、魅惑、降攻速、加速、隱身、防禦提升已有圖片，不必重畫。

## 試產結果

使用 imagegen 技能的內建工具，沒有呼叫付費 API／CLI。試產預覽儲存在 `output/imagegen/status-evasion-preview.png`，不接入正式遊戲。

檢查 PNG IHDR：1254×1254、color type 2（RGB），無 tRNS；沒有透明通道。棋盤格已烘焙進圖像，故不使用，也不程式去背。

完整試產提示詞：

```text
Use case: stylized-concept. Asset type: tiny fantasy RPG status icon, single square PNG with genuinely transparent background alpha. Subject: agile evasion buff, one silver-white feather swept diagonally upward with two short thick turquoise wind trails. Polished hand-painted anime fantasy game item rendering, jewel-like crisp highlights, dark teal contour, simple bold silhouette readable at 25 pixels. Centered, subject occupies 80 percent of square, 10 percent transparent safety margin on all sides. No character, no letters, no text, no frame, no background scene, no drop shadow outside silhouette, no checkerboard backdrop. Actual transparent PNG requested. This is one production game icon, not a mockup or icon sheet.
```
