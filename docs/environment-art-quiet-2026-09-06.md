# 場景與事件美術統一 — 2026-09-06

## 範圍與方法

使用內建 imagegen（generate with references），沒有使用額外 API。共 15 張，全部以原始空房間與目前村莊作為參考，不使用任何本輪生成圖作為下一張輸入。角色、怪物、技能、家與村莊原圖不變。舊版保留，新版使用 `-quiet.png`。

風格錨點：

- `prototype/assets/backgrounds/home-empty-medieval-simple.png`
- `prototype/assets/backgrounds/village-square-courtyard.png`

## 套用與驗收

- 所有新 PNG 為 1672×941，約 16:9；保留原始生成尺寸，不做放大、銳化或程式降噪。
- 戰鬥圖同步用於普通戰鬥、首領戰前準備、首領演出背景、機制區與森林對話；天堂圖同步對話及轉場背景。
- 村外木門熱點改為 left 12%、top 36%、width 14%、height 28%。瀏覽器實際點擊返回村莊、進入森林準備、開始出擊皆通過。
- 以正常 `index.html?debug` 外層 iframe 入口截圖檢查：村外、準備、普通戰鬥、首領戰、遺跡準備及入場、森林對話、天堂與全部 10 種事件。全部新事件圖載入尺寸正確，無 HTTP 失敗、無 JavaScript 執行錯誤。截圖位於 `.local/test-results/quiet-*.png`。
- 原有事件 UI 仍完整等比顯示圖片，上下以模糊底圖延伸；本輪沒有重排介面或修改小遊戲圖示、選項、獎勵及倒數。
- 已同步更新 UI 回歸的圖片路徑；順帶修正上一輪空房間改位後仍要求門位於最右 20% 的過期測試，改驗證目前 55%–74% 門區與中心點可點擊，不修改家中 UI。
- 新背景採獨立檔名，相關 CSS 版本號已更新，降低沿用舊快取的可能。
- 最終驗證：`npm run test:unit` 全部通過；`npm run test:ui` 全部瀏覽器斷言通過（包含事件互動、遺跡／天堂劇情及固定畫布縮放）；`git diff --check` 通過。

## 提示詞組合

每張提示詞為下列共用段落，加上該圖的場景段落（事件加上 `Event illustration:`）。

```text
Use case: stylized-concept. Asset type: finished 16:9 full-bleed game environment illustration.
Input images: Image 1 is the ORIGINAL approved home, style reference only. Image 2 is the ORIGINAL approved village, style and world reference only. Generate an entirely fresh illustration of the requested scene, not a repaint, collage, or alteration of those images.
Style: match these references' restrained refined Japanese medieval fantasy game background painting: clear intentional silhouettes, clean broad softly shaded materials, precise readable objects, moderate natural saturation, chestnut wood, warm grey stone, muted living green. Sufficient detail for immersion but no random micro-detail, grain, canvas texture, stippling, grungy speckling, noisy foliage or sharpened halos. NOT photoreal, NOT 3D render, NOT flat vector, NOT blurry watercolor. Soft neutral daylight unless scene specifies otherwise. No yellow/orange filter. Depth through composition and coherent light, not blur.
No characters, creatures, lettering, labels, UI, logos, border, vignette or watermark. Fill the entire landscape frame. A single finished image, not a sheet.
```

### `prototype/assets/backgrounds/expedition-trail-quiet.png`

```text
Scene: just outside this village, looking along its stone-and-earth path toward a quiet woodland. The village's simple open timber gate and low grey stone wall occupy the far LEFT (door opening centered x7%, y43% for an existing return hotspot). A plain wooden trail sign sits around x32%, not lettered. The path curves toward a welcoming opening in the trees centered x73%, y45%, for the forest entry hotspot. Rolling soft hills beyond; a few ferns and one patch of modest wildflowers along the verge. Spacious path foreground, clean layered tree canopies, not hundreds of leaf speckles. Eye level, accessible lived-in countryside, same village architecture. Gate is not a grand castle.
```

### `prototype/assets/backgrounds/expedition-staging-quiet.png`

```text
Scene: a quiet stopping place a few steps along the path outside the village before entering woodland. Left background: a low grey stone wall and a glimpse of the original village's simple timber gate and slate cottage roofs. Broad level pale earth foreground, one mature tree framing far left, a gentle path bending into trees at middle-right. Right half mostly calm shaded woodland masses to support an overlaid preparation panel. Restrained foliage shapes; no dense ivy carpeting, no piles of rocks or speckled flowers. Daylight, not sunset. Empty foreground for a character added by game code.
```

### `prototype/assets/backgrounds/slime-habitat-battle-quiet.png`

```text
Scene: a woodland clearing in the slime habitat, but NO slimes baked into the background. Camera at standing eye level looking over a broad level pale-earth clearing. Entire central 65% and lower middle open for combatants added in game; surrounding forest encloses the arena with a few substantial trunks at lateral edges, readable large soft leaf masses, sparse grass tufts and smooth stones at margins. A small glimpse of a stream at far right, depth and daylight beyond the rear trees. Lush, peaceful adventurous woodland, not empty desert and not an intricate garden. No central tree, no building, no dramatic beams. High visual clarity without excessive texture.
```

### `prototype/assets/backgrounds/ruins-battle-quiet.png`

```text
Scene: an ancient ruined stone hall, ominous but legible. Broad empty level flagstone floor occupies central and lower 65% for combat; pairs of substantial weathered columns at lateral edges; a few shallow stairs leading to a dark arched doorway centered at the back. Large simple architectural shapes, straight believable masonry, muted blue-grey stone with a few softly glowing old golden rune marks on side pillars (abstract symbols, not text). Faint cool daylight from a broken high vault, tiny amount of moss only at edges, restrained warm rune contrast. No throne, no boss, no rubble in combat center, no particle storm, no ornate clutter. Same clean painted materials as the home, adapted to ancient stone.
```

### `prototype/assets/backgrounds/heaven-sanctuary-quiet.png`

```text
Scene: a bright quiet heavenly sanctuary where a goddess greets the hero. Empty airy ivory stone terrace among soft luminous clouds; simple tall pale columns framing the outer edges; delicate distant arches receding into soft sky blue and pearl white. Open center and broad pale floor for a goddess added by game code. Serene welcoming, warm-neutral light, modest subdued gold architectural accents. Clearly readable architectural forms; no densely ornamented palace, no religious figures, no wings, no gates or objects in center, no star confetti, no giant overexposed disk. Smooth clean values, detailed enough to belong to the home/village style, not photo/3D.
```

### `prototype/assets/events/ruins-entrance-quiet.png`

```text
An unfamiliar ancient ruin entrance found in the deep woodland: a substantial grey stone arch half embedded in a hillside, a short flight of broad worn steps descending into its dark opening. Pair of simple weathered columns with faint golden abstract rune marks; restrained roots wrapping outside masonry and muted ferns at edges. The entry arch is the clear subject, centered and filling the central two thirds. Show enough forest to locate it, not a distant tiny ruin. Quiet mysterious daylight, cool shadows. No humanoid statues.
```

### `prototype/assets/events/abandoned-camp-quiet.png`

```text
Close environmental illustration of a recently abandoned small forest campsite. A low ring of five broad stones with gently glowing red embers (no roaring flame) at center-left, a clear brown leather travel backpack at center-right, three scattered copper buckles on a folded off-white cloth foreground. A modest rolled burgundy blanket beside the bag. These three interactable story subjects are large and readable, occupying central 70% of frame, with woodland roots and a little grass at edges. Morning daylight, subtle ember contrast. No tent city or clutter, no person.
```

### `prototype/assets/events/flattened-herbs-quiet.png`

```text
A close view angled gently down at a small woodland herb patch trampled in damp earth. Several distinct complete herb plants: purple small flowers with ROUND smooth leaves; purple flowers with thorny serrated leaves; yellow flowers with round leaves; small blue flowers with serrated leaves. A few bent stems, one clear boot impression in the soil. Plants grouped visibly, leaves large and individually readable, not a carpet of hundreds of flowers. Soil and a large smooth tree root provide restrained background. Main subject occupies central 75%, botanical readability but naturally painted in the game world, not a scientific diagram.
```

### `prototype/assets/events/crystal-tree-hollow-quiet.png`

```text
Close view of a hollow at the base of an old woodland tree. EXACTLY FOUR separate thumb-to-hand-sized faceted crystals rest inside the hollow, all large and visible in central frame: subdued pale cyan, amber, soft violet, and mint. Gentle internal luminosity, distinct clean solid facets; gaps between crystals. A simple dark wood hollow gives contrast, two smooth roots and a little moss at edge. Four crystals are main subject and must be immediately countable; no extra crystal fragments, no tiny gem scatter, no particle confetti. Daylight outside hollow, localized gentle magical glow.
```

### `prototype/assets/events/two-color-spores-quiet.png`

```text
A close view of a magical woodland mushroom ring with exactly NINE prominent small mushrooms arranged in a natural three-by-three grouping, alternating softly luminous GOLD and CYAN caps, gold at the center. Simple rounded caps, clean stalks; glow gentle enough to see solid cap shapes, no white spots needed. A little dark moss and one broad tree root behind. The mushrooms occupy the central 75% and are easy to distinguish at small display size. No extra mushrooms or dense spores; no neon haze. Earthy daylight woodland with modest magical accent.
```

### `prototype/assets/events/slime-trail-fork-quiet.png`

```text
Close environmental view of TWO clearly different slime trails diverging at a large tree root on a forest path: left branch a thin translucent pale cyan gently luminous gelatinous streak, right branch a thicker nearly black deep teal streak. Both begin near the lower center then diverge visibly around the root toward opposite sides. Broad simple earth path, a little grass at margins. Focus on readable fork and contrasting goo material, moderate highlights, not puddle confetti. No slimes or other creatures. No sign text, no treasure, no extra paths.
```

### `prototype/assets/events/floating-bubbles-quiet.png`

```text
A close woodland clearing view with FIVE distinct floating translucent gelatinous bubbles, varying moderately in size, loosely grouped in central 70% at different heights. Pale cyan magical energy softly held inside each orb; clear delicate outline, modest highlight, transparent view of trees through them. Bubbles large enough to read in an event card, with space between them. Muted simple tree trunks and grass behind, daylight, not outer space. No numbers, no sparkles cloud, no rainbow chrome, no slime faces. Main focus is the floating bubbles, not distant scenery.
```

### `prototype/assets/events/sealed-supply-crate-quiet.png`

```text
Close three-quarter view of a single sturdy medieval wooden supply chest on the woodland floor, filling central 70% of composition. Modest iron bands, clearly built wood panels. Thick translucent pale turquoise slime seals parts of the lid edges and drips down one side. On the lid is a simple brass mechanism with EXACTLY THREE separate round rotating symbol dials in a row, clear large forms; symbolic leaf, droplet, crystal engravings, no writing. A modest root and broad grass shapes in background, soft daylight. No additional locks, no ornate treasure gold, no extra boxes, no loot scatter.
```

### `prototype/assets/events/rain-stone-shelter-quiet.png`

```text
View from beneath a natural woodland rock overhang during rain, a safe dry stone ledge in the near center and left, a curtain of rain against blue-grey forest outside at right. A single small pale cyan crystal is lodged in a crack on the inner rock wall, with a few droplets catching its gentle light. Large readable smooth stratified rock planes; dry shelter contrasted with wet ground and subdued rain beyond. Subject shelter fills frame; intimate and calming, clean composed illustration. No campsite items, no people, no storm lightning, no glitter or excessive line noise.
```

### `prototype/assets/events/broken-aqueduct-quiet.png`

```text
Close three-quarter environmental illustration of an old stone water channel interrupted at a broad broken circular stone routing plate on a woodland slope. A small clear spring runs in from upper left, pools at the disconnected groove. Another dry stone groove exits right toward a small patch of visibly drooping medicinal herbs. Central routing plate and its few simple carved channels occupy most of frame, readable broad geometry, not an intricate maze. Moss only along edges, warm grey stone, clean blue water. No pipes of metal, no text, no floating puzzle UI, no extra aqueduct arches or giant landscape.
```
