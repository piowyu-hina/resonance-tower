# Home scene UI

## 2026-09-06 cultivation update (current)

The desktop room omits the floating top-left "家" title; the door return and all facility hotspots remain visible and interactive.

The user replaced wuming_home.png with a seated Wuming and a complete right-hand door. The growth hotspot now covers Wuming, the village return covers the door, and the journal hotspot aligns with the new table book. The original button IDs, story locks and guide targets remain intact. The new background is user-provided; no art was generated or edited in this implementation.

Desktop cultivation uses home-growth.css: warm brown/gold full-art roster, larger typography and icons, and a two-column detail surface with uncropped full art on the left and existing upgrade controls on the right. The art stays visible while long details scroll. No bottom fade. Home-only classes keep expedition details independent. Full-art paths follow equipped skins; skill mechanics, costs, repeat-upgrade handling, locks and plot are unchanged. Asset and entry stylesheet URLs are versioned for the new image/layout.

Validation: the unit suite and full browser regression suite passed. Desktop home checks (1024/1440/1920) cover full-art loading, detail containment, skill selection, return round trip, door hit testing and existing story states. Screenshots: test-results/home-growth-roster-1440.png, home-growth-detail-1440.png. The earlier notes below describe the superseded layout.

## Previous iteration

The desktop home menu displays the existing wuming_home.png at its full aspect ratio without the previous dark card stack. No artwork was generated or edited. Growth is the primary text entry on the left at the foot of the bed, not the right-hand equipment rack. Hina has no resident portrait and appears only when guidance is needed. Following Xiaochu keeps her full portrait; contracted Xiaochu has a compact text-only conversation entry because she resides within Wuming. The journal and covenant target the book on the table and the blessing alcove.

home.css scopes the scene to homeSceneActive at desktop widths. Entering growth or another location restores the previous app layout. Underlying button IDs, hidden and disabled states, story guide reparenting, dialogue and covenant flows are unchanged. Keyboard focus and reduced motion are supported. Existing narrow-screen styling remains; no new mobile layout was designed.

Lumi's shop uses merchant_full.png again by user request; merchant.png is retained.

Validation: npm test passed. Additional --home-only browser checks passed at 1024, 1440 and 1920, covering label hit testing, no backdrop blur, growth round trip, following dialogue activation and oath-ready visibility. Screenshots: test-results/home-scene-following-1440.png and home-scene-oath-1440.png.

Follow-up checks: --home-only now also verifies no resident guide portrait, contracted portrait hiding, retained daily conversation access and restored portrait when following. --wuming-only verifies the current action asset loads in the growth view; the action definition still points to wuming_action.png. No speculative icon replacement was made without identifying the intended new image.
