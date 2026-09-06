# 史萊姆小圖重畫草稿

使用內建 imagegen。檔案：`prototype/assets/ui/slime-forest-chibi-draft.png`。

史萊姆放大、只留草葉。不過兩次生成都輸出 RGB 棋盤底，未取得真正透明通道，因此此圖僅為草稿，尚未套用到遊戲。沒有以程式去背。

## 生成提示詞

```text
Use case: stylized-concept
Asset type: transparent PNG cutout illustration for a fantasy game's Slime Forest region thumbnail, displayed at 100x96 pixels.
Input image 1: character identity reference for the green slime, its curled head tip, happy eyes and round jelly body.
Primary request: Draw a fresh soft chibi anime illustration of this adorable green slime, very large and centered, with just two small tufts of woodland leaves at its lower sides. The slime is the unmistakable main subject, occupying 75-80 percent of the canvas width and most of the height. Keep its entire curled tip and body visible with a small safe margin.
Style: delicate warm anime illustration, soft rounded jelly volume, gentle luminous pale green, subtle blush and clean expressive eyes. Softer colored outlines and refined shading, not harsh neon or thick black cartoon outlines. Simple readable large forms, face clearly recognizable when shrunk to 100 pixels.
Background: genuinely transparent alpha channel PNG, all empty space transparent, including between leaves and character. Only slime and a few supporting grass leaves. No forest landscape, no scenery, no trees, no ground slab, no rectangular backdrop, no colored background, no checkerboard painted into the image, no border, no white sticker outline, no text or watermark. Square composition.
```

## 去背重試提示詞

```text
Use case: background-extraction. Image 1 is the edit target. Remove the entire fake white and gray checkerboard background and export the slime and its two leaf tufts as a real RGBA transparent PNG with alpha=0 outside the subject. Preserve the illustration, scale, face, colors, curled tip and foliage exactly. No repainting of the character. The checkerboard is unwanted image content, not transparency. Remove it completely including the hole under the curled tip. Deliver actual transparent pixels, not a simulated transparency pattern, no white matte, no border.
```

