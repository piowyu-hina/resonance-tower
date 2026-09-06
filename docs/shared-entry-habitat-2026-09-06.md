# 共用遠征入口與棲息地小圖 — 2026-09-06

- 一般遠征準備直接使用 `backgrounds/expedition-trail-quiet.png`，同遠征入口；保留介面遮色層，沒有額外放大設定。首領準備仍使用對應戰場。
- 新棲息地區域圖：`prototype/assets/ui/slime-habitat-quiet.png`。同步 constants 的 previewImage、HTML 預設區域圖與入場圖；原 `slime-forest-colony.png` 保留。
- 內建 imagegen，從原始村莊及原始綠史萊姆參考生成，沒有拿上一輪生成圖重繪。

## 技能圖示檢視（本輪不更動技能圖）

在深色 UI 底上以大圖與 64px 並列，對照目前村莊及實際戰鬥畫面。檢查璃雪、小初、現用第一區怪物與兩個首領；豐子尚未開放，不列為本輪換圖優先項目。

- 璃雪：棕白配色、清楚角色輪廓與乾淨陰影符合目前角色／環境搭配，可保留。第三招紫白斬光較繁，但不需要因此整組重畫。
- 小初：角色畫法一致，可保留；金色光效比環境熱鬧屬合理技能層級差異。第一招、第三招都是相似斜斬與盾牌構圖，縮小辨識較弱，若修改應優先拉開動作或斬線方向，而非只降低飽和。
- 一般黏液、怒氣、魅惑：主體形狀清楚，亮色可作快速辨識，無須與背景一樣低彩度。
- 睡意傳染 `slime_sleepy_skill.png`：紫色骷髏更像毒／詛咒，語意比畫風更值得修正；建議之後改月亮、閉眼或昏睡泡泡。
- 史萊姆王召喚 `slime_boss_skill2.png`：多隻臉與魔法圈擠在同格，縮小後較花；建議未來簡化為主體加少量召喚輪廓。
- 遺跡之主三招、古碑墜擊、碎岩衝擊：土石色與新遺跡搭配，但金色弧線及碎片太密。優先簡化重擊、岩刺與古碑的外圈，保留拳／盾／岩刺的主輪廓；反傷盾的圓形仍有辨識度。
- 以上是檢視建議，不是已替換的圖片。使用者現有技能與人物未修改、未納入提交。

## 完整生成提示詞

```text
Use case: stylized-concept. Asset type: square regional destination illustration for a medieval fantasy game, shown at 100px and larger during entry.
Input images: Image 1 original approved village is STYLE reference only. Image 2 original green slime is CHARACTER DESIGN reference, preserve its curled teardrop crest, big dark green eyes, small happy mouth, pink cheeks and soft jelly shape. Generate a NEW illustration from these originals, do not repaint another generated illustration.
Scene: a small group of THREE green slimes inhabiting a quiet woodland clearing. One large slime slightly right of center in three-quarter view, two smaller companions offset to left and behind. All three clearly visible; main slime fills almost half of image, entire crest and body within frame. Forest is a simple supporting backdrop: broad muted green foliage, one tree trunk at edge, level warm-grey earth and sparse grass. No village buildings.
Style: match the village's clean refined Japanese medieval fantasy painted environment, crisp deliberate shapes, softly shaded matte foliage, restrained neutral daylight, moderate saturation, no golden filter. Slimes retain cute clear anime faces and simple glossy highlights, no textured mottling on their bodies. Strong subject/background separation, readable at thumbnail size. Immersive but not densely detailed.
Avoid: photoreal, 3D render, grain, speckled soil, noisy leaves, muddy brushwork, glowing neon greens, intricate particles, tiny slimes in vast landscape, cropped bodies, text, UI, borders, watermark. Single square full-bleed image with actual forest background, not transparent.
```

## 驗證

- `npm run test:unit` 通過。
- `node tests/ui-regression.test.js --expedition-only` 通過，含兩種首領准备背景不變。
- 正常 iframe 入口點擊檢查：共用背景、新小圖與入場圖載入通過，無 JavaScript 錯誤。

