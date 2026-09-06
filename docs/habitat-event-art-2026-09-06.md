# 棲息地事件美術整理 — 2026-09-06

> 此為第一輪六張的紀錄；之後依使用者要求，剩餘四張也已重繪，見 `event-art-and-workspace-2026-09-06.md`。以下保留當時的取捨與提示詞。

## 範圍

使用內建 imagegen 逐張編修；參考各事件原圖與 `prototype/assets/backgrounds/slime-habitat-battle.png`。不更改選項、獎勵、抽取機率、解謎規則及小遊戲素材。原圖保留，新圖使用 `_daylight.png`，避免舊快取與方便比對。

更新六張：營地、藥草圃、補給箱、泡泡、水渠、岔路。保留四張：遺跡入口（未知危險）、雨棚（文字指定灰藍驟雨）、菌環（雙色自發光）、結晶樹洞（洞內結晶光）。不是所有事件都應改成晴亮同色。

## 最終提示詞與檔案

遊戲內顯示同步修正：原本直式插畫欄以 `cover` 加上慢速放大裁掉橫圖兩側。面板由 980px 加寬到 1180px，插畫使用 `contain` 且不再縮放；同圖暗化、模糊的背景填補上下空間，完整保留事件主體。右側操作維持原規則。

新增 `node tests/ui-regression.test.js --event-art-only`：在 1600×900 與 1280×720 下逐一檢查十種事件的載圖、完整顯示、面板邊界與略過，並執行既有事件選項／解謎互動回歸測試。人工檢查遊戲內截圖，不只單獨看原圖。本次事件回歸與 `npm run test:unit` 全部通過。

### abandoned_camp

檔案：`prototype/assets/events/abandoned_camp_daylight.png`

```text
Use case: lighting-weather. Image 1 is the existing event illustration edit target. Image 2 is the approved in-game forest style and daytime palette reference. Retain Image 1's event objects, spatial composition and narrative meaning; adjust its lighting and rendering cohesion to match Image 2's refined painterly fantasy game art, believable soft material volume and restrained natural greens. Preserve the abandoned backpack, bedroll, cup and circular stone firepit as the main foreground subject. The firepit contains a few faint warm embers, NOT a big active bonfire. Maintain the small resting spot under the tree. Shift surrounding forest from cyan night to sheltered natural moss-green daytime with gentle warm sun touching the pack and firepit. Blue slime residue, if present, is a small localized accent, not a blue tint across all trees. Output full-bleed landscape 16:9 illustration, no text, no UI, no borders, no people, no monsters. Important focal objects kept within the central 80% width and 70% height so the scene remains readable in the game event panel. Do not flatten into cel-shaded cartoon art, do not add watercolor paper grain, avoid heavy sepia filter. This is a local woodland discovery, not another wide empty battlefield.
```

### flattened_herbs

檔案：`prototype/assets/events/flattened_herbs_daylight.png`

```text
Use case: lighting-weather. Image 1 is the existing event illustration edit target. Image 2 is the approved in-game forest style and daytime palette reference. Retain Image 1's event objects, spatial composition and narrative meaning; adjust its lighting and rendering cohesion to match Image 2's refined painterly fantasy game art, believable soft material volume and restrained natural greens. Preserve the trampled herb patch, bent stems, distinct surviving herb flowers and visible slime trails through the mud. The herb patch is the clear focal subject. Relight to soft woodland daytime so plant shapes are readable. Keep the herb flower colors distinguishable and blue slime residue localized; don't tint the entire forest cyan. Simplify excessive micro-pebbles and scattered debris without removing the trampled state. Output full-bleed landscape 16:9 illustration, no text, no UI, no borders, no people, no monsters. Important focal objects kept within the central 80% width and 70% height so the scene remains readable in the game event panel. Do not flatten into cel-shaded cartoon art, do not add watercolor paper grain, avoid heavy sepia filter. This is a local woodland discovery, not another wide empty battlefield.
```

### slime_sealed_supply_crate

檔案：`prototype/assets/events/slime_sealed_supply_crate_daylight.png`

```text
Use case: lighting-weather. Image 1 is the existing event illustration edit target. Image 2 is the approved in-game forest style and daytime palette reference. Retain Image 1's event objects, spatial composition and narrative meaning; adjust its lighting and rendering cohesion to match Image 2's refined painterly fantasy game art, believable soft material volume and restrained natural greens. Preserve the closed wooden supply chest, metal straps and latch, translucent blue slime covering part of its lid and front, potion bottle and a few coins. Shift the surrounding tree and woodland to natural green daytime, warm light modeling wood and moss. Keep the slime visibly BLUE and gelatinous but not neon. The chest is still closed and sealed. Do not add lettering, puzzle solutions, symbols or new props. Output full-bleed landscape 16:9 illustration, no text, no UI, no borders, no people, no monsters. Important focal objects kept within the central 80% width and 70% height so the scene remains readable in the game event panel. Do not flatten into cel-shaded cartoon art, do not add watercolor paper grain, avoid heavy sepia filter. This is a local woodland discovery, not another wide empty battlefield.
```

### floating_slime_bubbles

檔案：`prototype/assets/events/floating_slime_bubbles_daylight.png`

```text
Use case: lighting-weather. Image 1 is the existing event illustration edit target. Image 2 is the approved in-game forest style and daytime palette reference. Retain Image 1's event objects, spatial composition and narrative meaning; adjust its lighting and rendering cohesion to match Image 2's refined painterly fantasy game art, believable soft material volume and restrained natural greens. Preserve floating GOLDEN and CYAN translucent magical bubbles at different sizes, two readable groups above forest ground. Preserve both colors as puzzle identity, but reduce harsh neon glare. Environment becomes naturally green sheltered daytime matching Image 2, with soft warm overhead light, not blue night. Fewer tiny sparkles and less busy leaf detail. Bubbles remain the obvious focal subject and do not acquire faces, letters or numbers. Output full-bleed landscape 16:9 illustration, no text, no UI, no borders, no people, no monsters. Important focal objects kept within the central 80% width and 70% height so the scene remains readable in the game event panel. Do not flatten into cel-shaded cartoon art, do not add watercolor paper grain, avoid heavy sepia filter. This is a local woodland discovery, not another wide empty battlefield.
```

### broken_ancient_aqueduct

檔案：`prototype/assets/events/broken_ancient_aqueduct_daylight.png`

```text
Use case: lighting-weather. Image 1 is the existing event illustration edit target. Image 2 is the approved in-game forest style and daytime palette reference. Retain Image 1's event objects, spatial composition and narrative meaning; adjust its lighting and rendering cohesion to match Image 2's refined painterly fantasy game art, believable soft material volume and restrained natural greens. Preserve ancient broken stone water channels, central circular fractured stone mechanism, water source on left and wilted herbs on right. It remains visibly BROKEN and downstream dry, not repaired. Bring forest into muted natural green daylight matching Image 2 with warm touches on stone, retain secluded old-ruin mood. Water can remain cool turquoise but not luminous neon. Reduce overly busy tiny stones. No new puzzle symbols or lettering. Output full-bleed landscape 16:9 illustration, no text, no UI, no borders, no people, no monsters. Important focal objects kept within the central 80% width and 70% height so the scene remains readable in the game event panel. Do not flatten into cel-shaded cartoon art, do not add watercolor paper grain, avoid heavy sepia filter. This is a local woodland discovery, not another wide empty battlefield.
```

### slime_trail_fork

檔案：`prototype/assets/events/slime_trail_fork_daylight.png`

```text
Use case: lighting-weather. Image 1 is the existing event illustration edit target. Image 2 is the approved in-game forest style and daytime palette reference. Retain Image 1's event objects, spatial composition and narrative meaning; adjust its lighting and rendering cohesion to match Image 2's refined painterly fantasy game art, believable soft material volume and restrained natural greens. Preserve the two branching woodland trails around the large central tree. Keep LEFT trail brighter with a thin softly shining slime track, RIGHT trail more shaded with a thick dark slime track. Right should feel like deeper daytime shade, not a separate blue neon nighttime world. Match Image 2's natural green leaves and warm subdued daylight, retain the meaningful safe-versus-risky visual contrast. Do not erase either slime trail or merge the two paths. Output full-bleed landscape 16:9 illustration, no text, no UI, no borders, no people, no monsters. Important focal objects kept within the central 80% width and 70% height so the scene remains readable in the game event panel. Do not flatten into cel-shaded cartoon art, do not add watercolor paper grain, avoid heavy sepia filter. This is a local woodland discovery, not another wide empty battlefield.
```
