# Home scene UI

The desktop home menu displays the existing wuming_home.png at its full aspect ratio without the previous dark card stack. No artwork was generated or edited. Growth is the primary text entry on the left at the foot of the bed, not the right-hand equipment rack. Hina has no resident portrait and appears only when guidance is needed. Following Xiaochu keeps her full portrait; contracted Xiaochu has a compact text-only conversation entry because she resides within Wuming. The journal and covenant target the book on the table and the blessing alcove.

home.css scopes the scene to homeSceneActive at desktop widths. Entering growth or another location restores the previous app layout. Underlying button IDs, hidden and disabled states, story guide reparenting, dialogue and covenant flows are unchanged. Keyboard focus and reduced motion are supported. Existing narrow-screen styling remains; no new mobile layout was designed.

Lumi's shop uses merchant_full.png again by user request; merchant.png is retained.

Validation: npm test passed. Additional --home-only browser checks passed at 1024, 1440 and 1920, covering label hit testing, no backdrop blur, growth round trip, following dialogue activation and oath-ready visibility. Screenshots: test-results/home-scene-following-1440.png and home-scene-oath-1440.png.

Follow-up checks: --home-only now also verifies no resident guide portrait, contracted portrait hiding, retained daily conversation access and restored portrait when following. --wuming-only verifies the current action asset loads in the growth view; the action definition still points to wuming_action.png. No speculative icon replacement was made without identifying the intended new image.
