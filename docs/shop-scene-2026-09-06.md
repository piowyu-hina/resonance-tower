# Quiet merchant scene

## Current status: experiment reverted

Follow-up on the restored layout: desktop dialogue is now a small warm-paper speech bubble to the right of Lumi's face/shoulder, within the merchant panel. The portrait shifts left (uncropped); the bottom dialogue block is removed. Clicking either the figure or bubble keeps the existing chat behavior. The complete shop backing, headings, transaction UI and narrow layouts remain. Browser checks cover bubble containment and clickability in both languages at 1440 and 1024 desktop widths.

At the user's request, the shop was restored to f990302, before the first background-removal experiment. The original complete backing, merchant arch, headings and transaction presentation are restored. Home cultivation changes and user artwork remain untouched. The notes below are historical experiments, not the current design.

## Village-grounded follow-up

Town shops no longer blur the left village. The merchant is sized/positioned from the actual village rectangle, with feet at 82% of scene height and dialogue near the bottom. Resize, village geometry changes and scrolling refresh the anchor. Disable the town modal transform so the fixed-position merchant uses viewport coordinates correctly. Only the right goods surface keeps its local blur; its layout and transactions are unchanged. Dungeon shops retain their existing presentation. Added regression assertions for the foot anchor and absence of full-overlay blur; unit and merchant tests pass. Earlier full-scene soft-focus notes below are superseded for town shops.

Desktop composition: uncropped merchant_full.png on the left, short conversation beneath, a subdued trading surface on the right. No new artwork. The village recedes through a dark vignette and soft blur rather than competing with the figure. Floating names, decorative arch, visible shop heading/tagline and repeated product section headings are removed from the desktop presentation. The dialog retains its accessible name. Existing narrow-layout rules remain.

The right header groups tabs and currency; goods use separators rather than stacked heavy cards. Only product content scrolls. Buy and sell-one controls show their action and price. Insufficient funds is explained next to owned quantity in both supported languages. Existing shop rules and dungeon auto-leave countdown/toggle are preserved.

Validation: unit suite and focused merchant regression, including buy/sell balances, chatting, keyboard tabs, locked purchases, dungeon countdown, viewport containment and image containment. Desktop sizes include 1440x1000, 1280x720 and 1024x768; existing narrow checks remain. Reviewed live screenshots for buy, sell and short desktops. Screenshots are in test-results/merchant-shop-*.png and shop-quiet-*.png. User artwork edits are not included in this UI change.
