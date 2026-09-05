# Home scene UI

## 2026-09-06 cultivation update (current)

Settled layout: character switching, identity/name, level and full art are grouped on the left. The right side starts with the fixed cultivation/character tabs. Book resources belong inside cultivation only; the character page groups introduction and skin thumbnails without the collection-count metadata. Portrait geometry stays unchanged across tabs, and the pinned upgrade workspace is retained. Unit and desktop home checks pass, including identity placement, resource visibility, keyboard tabs, equipping and short-window action visibility. No gameplay or user artwork changes.

Latest layout: right-side tabs "培養 / 角色" replace the split introduction and appearance mode. Opening defaults to cultivation with the pinned upgrade workspace. The character tab contains introduction and skin selection, while the left full art stays visible and stationary. Equipping preserves the character tab; switching back retains the selected growth line. Tabs expose tablist/tab/tabpanel semantics, selected state and ArrowLeft/ArrowRight/Home/End navigation. Removed the previous appearance disclosure and its state/styles. Unit and home UI tests pass, including tab/equip round trips and pinned controls at 720/900px heights. This supersedes the previous profile iterations below.

Profile follow-up: removed the combined "介紹與外觀" popover. The introduction is always readable above the left portrait. A separate "更換外觀" entry switches the left art area to the skin list; "返回立繪" restores the full art. No floating panel obscures the art, and the right upgrade controls retain identical positions. Home browser tests verify visible introduction, appearance equip/return, fixed upgrade geometry and 720/900px heights; unit tests pass. This supersedes the disclosure behavior described below.

Pinned growth workspace: desktop details now keep the character header and ability/skill choices above a fixed inspector. Current/next values, book cost and upgrade button stay visible without scrolling the modal. Long skill descriptions scroll within their own area; the choice list can scroll locally when space is tight. Character description and skin choices live in the left-side "介紹與外觀" disclosure, which preserves its open state when equipping a skin. Existing upgrade and repeat handlers are reused. Desktop checks now include 720px and 900px heights, pinned action hit testing, description readability and skin disclosure round trips.

Latest interaction: clicking Wuming opens the cultivation detail overlay immediately over the unchanged room. The intermediate roster page and its "← 家" button are removed. A compact character picker above the full art switches between unlocked characters; locked partners cannot be selected, and unseen unlocked partners retain a NEW badge until viewed. Closing with ×, Escape or the backdrop returns to the room and restores focus to the entry. The existing ?debug&view=growth now previews this same panel. No new artwork or gameplay changes.

The two-column warm detail treatment below remains; the earlier full-art roster description is superseded by this direct-entry interaction.

The floating top-left "家" title and subtitle are removed from the room markup, not just hidden by desktop CSS (which previously left the title visible below 960px). The door return and all facility hotspots remain visible and interactive.

The user replaced wuming_home.png with a seated Wuming and a complete right-hand door. The growth hotspot now covers Wuming, the village return covers the door, and the journal hotspot aligns with the new table book. The original button IDs, story locks and guide targets remain intact. The new background is user-provided; no art was generated or edited in this implementation.

Desktop cultivation uses home-growth.css: warm brown/gold full-art roster, larger typography and icons, and a two-column detail surface with uncropped full art on the left and existing upgrade controls on the right. The art stays visible while long details scroll. No bottom fade. Home-only classes keep expedition details independent. Full-art paths follow equipped skins; skill mechanics, costs, repeat-upgrade handling, locks and plot are unchanged. Asset and entry stylesheet URLs are versioned for the new image/layout.

Validation: the unit suite and full browser regression suite passed. Desktop home checks (1024/1440/1920) cover full-art loading, detail containment, skill selection, return round trip, door hit testing and existing story states. Screenshots: test-results/home-growth-roster-1440.png, home-growth-detail-1440.png. The earlier notes below describe the superseded layout.

## Previous iteration

The desktop home menu displays the existing wuming_home.png at its full aspect ratio without the previous dark card stack. No artwork was generated or edited. Growth is the primary text entry on the left at the foot of the bed, not the right-hand equipment rack. Hina has no resident portrait and appears only when guidance is needed. Following Xiaochu keeps her full portrait; contracted Xiaochu has a compact text-only conversation entry because she resides within Wuming. The journal and covenant target the book on the table and the blessing alcove.

home.css scopes the scene to homeSceneActive at desktop widths. Entering growth or another location restores the previous app layout. Underlying button IDs, hidden and disabled states, story guide reparenting, dialogue and covenant flows are unchanged. Keyboard focus and reduced motion are supported. Existing narrow-screen styling remains; no new mobile layout was designed.

Lumi's shop uses merchant_full.png again by user request; merchant.png is retained.

Validation: npm test passed. Additional --home-only browser checks passed at 1024, 1440 and 1920, covering label hit testing, no backdrop blur, growth round trip, following dialogue activation and oath-ready visibility. Screenshots: test-results/home-scene-following-1440.png and home-scene-oath-1440.png.

Follow-up checks: --home-only now also verifies no resident guide portrait, contracted portrait hiding, retained daily conversation access and restored portrait when following. --wuming-only verifies the current action asset loads in the growth view; the action definition still points to wuming_action.png. No speculative icon replacement was made without identifying the intended new image.
