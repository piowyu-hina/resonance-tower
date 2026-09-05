# Home scene UI

The desktop home menu now displays the existing wuming_home.png at its full aspect ratio without the previous dark card stack. No artwork was generated or edited. Growth and Xiaochu dialogue use their existing full portraits as interface entries; the journal and covenant target the book on the table and the blessing alcove. This is a menu treatment, not new story canon about where characters physically live.

home.css scopes the scene to homeSceneActive at desktop widths. Entering growth or another location restores the previous app layout. Underlying button IDs, hidden and disabled states, story guide reparenting, dialogue and covenant flows are unchanged. Keyboard focus and reduced motion are supported. Existing narrow-screen styling remains; no new mobile layout was designed.

Lumi's shop uses merchant_full.png again by user request; merchant.png is retained.

Validation: npm test passed. Additional --home-only browser checks passed at 1024, 1440 and 1920, covering label hit testing, no backdrop blur, growth round trip, following dialogue activation and oath-ready visibility. Screenshots: test-results/home-scene-following-1440.png and home-scene-oath-1440.png.
