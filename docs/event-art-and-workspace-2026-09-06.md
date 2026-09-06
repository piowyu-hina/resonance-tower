# 剩餘事件重繪與工作區整理 — 2026-09-06

## 事件圖片

使用 imagegen 內建工具（非 API／CLI）重繪以下四张；各原圖為事件參考，`prototype/assets/backgrounds/slime-habitat-battle.png` 為畫風參考。原圖保留可比對，不更改事件規則。

遺跡保留幽暗入口；雨棚改為文字描述中的天然岩棚、維持雨天；菌環保留左金右青的雙色；樹洞保留洞內藍色結晶。遺跡新圖同步套到事件、首領準備圖及其背景，避免同地點新舊混用。

### ruins_entrance

檔案：`prototype/assets/events/ruins_entrance_v2.png`

```text
Use case: style-transfer. Asset type: fantasy RPG event illustration. Image 1 is the original event reference/edit target; Image 2 is the approved game's painterly style reference. Redraw the event with Image 2's soft dimensional brushwork, simplified coherent foliage masses and refined fantasy illustration quality, not photorealism or flat cartoon. Ancient overgrown stone doorway with shallow steps beneath massive woodland roots. Preserve the large rectangular dark entrance and worn carved stone pillars from Image 1. Natural moss greens on exterior with restrained warm stray daylight, ominous deep cool shadow INSIDE. No glowing portal, no monsters. Readable strong entrance silhouette, not busy micro-rubble. Full-bleed 16:9 landscape, all main objects fully framed within central 80%, no text, UI, borders, people or creatures. Match reference medium and material rendering, while preserving this event's own mood; do not copy the empty battle arena composition.
```

### rain_stone_shelter

檔案：`prototype/assets/events/rain_stone_shelter_v2.png`

```text
Use case: style-transfer. Asset type: fantasy RPG event illustration. Image 1 is the original event reference/edit target; Image 2 is the approved game's painterly style reference. Redraw the event with Image 2's soft dimensional brushwork, simplified coherent foliage masses and refined fantasy illustration quality, not photorealism or flat cartoon. A natural rock overhang shelter in a rain-soaked woodland, matching the actual event text. Replace the built hut of Image 1 with a broad layered natural stone canopy and dry sheltered ledge; keep rain, wet moss and sheltered resting place. Rainwater drips from a rock fissure; a few faint luminous mineral flecks in stone. Cool grey-blue rainy daylight, subdued natural greens, NO sunny weather. No constructed roof, lantern or human belongings. Full-bleed 16:9 landscape, all main objects fully framed within central 80%, no text, UI, borders, people or creatures. Match reference medium and material rendering, while preserving this event's own mood; do not copy the empty battle arena composition.
```

### two_color_spores

檔案：`prototype/assets/events/two_color_spores_v2.png`

```text
Use case: style-transfer. Asset type: fantasy RPG event illustration. Image 1 is the original event reference/edit target; Image 2 is the approved game's painterly style reference. Redraw the event with Image 2's soft dimensional brushwork, simplified coherent foliage masses and refined fantasy illustration quality, not photorealism or flat cartoon. Two clear groups of luminous woodland mushrooms at the roots of an old tree: golden yellow LEFT, cyan blue RIGHT, a few drifting spores above each. Preserve both distinct colors and grouping from Image 1. Sheltered green forest shade, subtle background natural daylight, localized magical glow rather than a full cyan filter. Large clean mushroom silhouettes, readable uncluttered groups. Full-bleed 16:9 landscape, all main objects fully framed within central 80%, no text, UI, borders, people or creatures. Match reference medium and material rendering, while preserving this event's own mood; do not copy the empty battle arena composition.
```

### crystal_tree_hollow

檔案：`prototype/assets/events/crystal_tree_hollow_v2.png`

```text
Use case: style-transfer. Asset type: fantasy RPG event illustration. Image 1 is the original event reference/edit target; Image 2 is the approved game's painterly style reference. Redraw the event with Image 2's soft dimensional brushwork, simplified coherent foliage masses and refined fantasy illustration quality, not photorealism or flat cartoon. A hollow at the base of an ancient forest tree containing faceted blue magical crystals, with a small loose crystal near the entrance. Preserve hollow and blue crystal subject from Image 1. Natural moss-green woodland outside with softly warm daylight touches, deep shaded cavity lit by restrained blue crystal glow. Clear tree-root silhouette, lovely painterly facets, not neon everywhere. Full-bleed 16:9 landscape, all main objects fully framed within central 80%, no text, UI, borders, people or creatures. Match reference medium and material rendering, while preserving this event's own mood; do not copy the empty battle arena composition.
```

## 工作區整理

驗證：單元測試、`--event-art-only` 十種事件載圖／互動回歸、`--expedition-only` 遠征與首領準備回歸均通過；四張新圖另已檢查實際遊戲截圖。

三個本機資料夾移入 `.local/`，不刪除內容；`.local/` 忽略版控：

- `output/` → `.local/art-drafts/`，9 個既有產圖草稿／提示詞／去背腳本。
- `debug_screenshot/` → `.local/debug_screenshot/`，使用者標示問題的截圖。
- `test-results/` → `.local/test-results/`，694 個既有測試產物，約 387 MiB。

UI 測試與檢查工具已改成輸出到新位置，相關文件路徑同步更新。沒有永久刪除任何檔案，移回原位置即可還原整理。

`prototype/` 是遊戲、`tests/` 是測試、`story/` 是核准劇本且測試會讀取、`docs/` 是決策與產圖紀錄、`node_modules/` 是測試依賴、`.github/` 是 CI、`.git/` 是版本歷史，均保留。使用者尚未提交的正式圖片與刪除保持原狀。
