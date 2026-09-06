# 遠征背景畫風修正

使用 imagegen 技能、內建生成工具，直接提供原本 `prototype/assets/backgrounds/expedition-staging.png` 作為參考，沒有使用 CLI 或程式修圖。

成品：`prototype/assets/backgrounds/expedition-staging-refined.png`。取代被否決的 calm 版，舊檔保留；只更新背景引用與快取版本，不改介面、劇本或演出。

## 完整提示詞

```text
Use case: precise-object-edit. Image 1 is the original approved game background and the STRICT art-style reference. Redraw this same location as a 16:9 landscape game background, preserving exactly the original sophisticated painterly fantasy illustration style: dimensional textured tree bark and masonry, finely rendered timber cottages, rich golden afternoon light, warm muted olive and amber palette, deep atmospheric layers and crisp selective brushwork. DO NOT change to flat anime, pastel concept sketch, cel shading, simplified color blocks, watercolor washes or blurry painting. Change ONLY the visual clutter and wider composition: remove most tiny flowers, scattered pebbles, speckled highlights and dense low bushes; space the remaining shrubs apart with visible quiet soil between them. Use fewer, larger natural paving slabs with gently worn detailed surfaces and broad shaded earth between slabs, rather than hundreds of small cobbles. Keep fine material rendering on those fewer objects. Open the canopy slightly so leaves do not cover every area; preserve real leaf rendering in limited clusters, with calm shadow elsewhere. Keep the large tree framing the left, low mossy village wall at left midground, the original cottage in upper-left distance, and wooded path extending toward center distance. Left center and lower center clear for overlaid character, right side quiet forest under an information panel. Same lush believable world and premium rendering as reference, simply fewer objects and less repeated micro-patterning. No new props, no characters, no UI, no text or borders. Fill wide 16:9 canvas.
```
