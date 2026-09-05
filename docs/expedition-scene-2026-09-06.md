# 遠征入口場景

- 使用內建 image_gen 生成，以 `prototype/assets/backgrounds/village-square.png` 為畫風及世界觀參考。
- 成品：`prototype/assets/backgrounds/expedition-trail.png`（1672 × 941）。
- 遠征入口使用完整場景背景；森林與村門採用村莊同款名稱／底線提示，資訊卡已移除。點森林後進入既有區域情報與戰前準備。
- 返回村莊的點擊區覆蓋左上方實際村門，文字位於門前小徑。
- 樣式：`prototype/styles/region-scene.css`。只套用桌面區域選擇場景。

## 最終生成提示詞

```text
Use case: stylized-concept
Asset type: production 16:9 landscape background for a desktop fantasy RPG expedition entrance, no baked UI.
Input image 1: STYLE and WORLD reference only (village square); create a NEW exterior scene just outside that village, not a copy of the reference.
Primary request: A beautiful quiet village-edge trail leading into a sunlit forest, visually continuing the reference's warm hand-painted anime fantasy environment. Foreground weathered stone steps transition into an earthen path; rustic low wooden fences, a modest wooden direction post with blank boards, mossy stones and tiny wildflowers frame the trail. The path leads from the open middle foreground toward the center-right distant forest opening, framed by tall leafy trees and soft shafts of afternoon sunlight. A glimpse of the familiar timber village gate at far left establishes where the traveler came from. No people or creatures.
Composition: wide 16:9 panoramic establishing view at human eye level, beautiful coherent natural perspective. Keep the middle and lower foreground relatively calm and readable for an overlaid destination selection panel; concentrate attractive forest depth in the upper middle and right. Scene fills the entire rectangle edge to edge, no frame or blank border. Fully rendered environment, not a UI mockup.
Style: match the reference's detailed painted timber and stone, softly outlined forms, atmospheric depth, cozy elegant JRPG storybook background. Warm ochre and honey sunlight balanced with muted olive and forest green, subtly cool distant foliage. Inviting sense of a journey about to begin.
Constraints: no text, letters, symbols, logos, watermark, UI, panels, cards, magical portals, towers, giant monuments, characters or foreground weapons. Opaque landscape PNG.
```
