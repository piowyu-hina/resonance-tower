# 遠征準備寬版背景

- 使用 imagegen 技能、內建圖片生成工具；未使用 CLI／額外 API。
- 參考：`prototype/assets/backgrounds/expedition-staging.png`（原圖保留）。
- 成品：`prototype/assets/backgrounds/expedition-staging-wide.png`。
- 寬構圖保留金色林道與村莊近景；左側供角色站立，右側供情報面板。只替換正常固定畫布入口的一般遠征準備，首領準備沿用各自戰場。
- 輸出為 1672×941，接近 16:9，CSS 等比例 cover 至 1536×864；未用程式裁切或拉伸圖檔。

## 完整生成提示詞

```text
Use case: stylized-concept. Asset type: finished fantasy game environment background. Input image 1 is a style and location reference, not a canvas to crop. Create a NEW landscape 16:9 composition, ideally 1792x1008 or 1600x900. Depict the same cozy golden woodland path just outside a medieval fantasy village, mossy low stone wall on the left, distant half-timber cottage visible toward the upper-left, leafy canopy overhead and forest on the right. Maintain the reference's exquisite painterly anime game background style, warm amber sunlight, muted olive foliage, detailed natural stone and inviting quiet mood. This is a closer expedition staging scene, not an overhead map. Layout: the left 55 percent must have a clear broad walkable foreground for an overlaid full-body character centered at x28%, feet at y84%; keep her face area around x28%, y25% uncluttered. The right 44 percent will be covered by an information panel, so use quiet darker woodland there, no important focal objects. A path leads from lower center toward village at upper left. Fill the full 16:9 canvas naturally; no black bars, no frames, no UI, no lettering, no characters or creatures, no watermark. Do not merely crop the 3:2 reference: compose genuinely wider with sufficient foreground.
```
