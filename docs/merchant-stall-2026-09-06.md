# Merchant stall redesign — 2026-09-06

## Applied

- Background: `prototype/assets/backgrounds/merchant-stall-quiet.png`.
- Desktop 16:9 stall with full-body merchant, speech panel, hardbound catalogue and two-column product display.
- Existing transaction/state logic unchanged. `shop-presentation.js` observes actual balance changes, shows receipts and animates presentation only. Closing clears receipts; reduced-motion disables animations.
- Original merchant asset and user edits preserved. Smaller/shorter viewports retain existing shop layout.
- Validated browser purchase/sale, receipt cleanup, keyboard tabs, chat and dungeon countdown; unit suite.

## Art provenance

Built-in imagegen, using the adopted original `village-square-courtyard.png` as style reference. No intermediate image used as input.

## Generation prompt

Use case: stylized-concept. Asset: 16:9 illustrated fantasy game merchant shop background, no UI or characters.
Reference is the adopted village painting; match its exact clean restrained medieval anime environment style, simple coherent details, muted cream plaster, chestnut wood, burgundy fabric, soft daylight. New camera near the village's little shop beneath its burgundy-and-cream striped awning, looking toward the storefront at eye level.
Composition for game UI: left half is an OPEN standing area in front of a quiet dark timber shop wall, unobstructed, intended for a separately composited full-body merchant. Empty left-center x15-43% from y20-87%. Small hanging brass lantern at extreme left, a few neatly folded fabric rolls on a low shelf at far left, no busy details behind face. Right half a wooden display counter and shadowed shop opening, later mostly covered with a readable paper inventory interface. Awning spans top edge, cropped naturally, warm afternoon light falls from upper left. Cobblestone ground across lower fifth, inviting outdoor shop rather than interior. Only a few simple well-drawn props: one basket, two folded fabric stacks, one small ceramic pot. Clear spacious organization. No tiny repeating bottles or chaotic merchandise.
Painterly but clean edges, warm welcoming lived-in atmosphere, crisp wood architecture, smooth color blocks, no grain or dirty noise, no oversaturation, no lettering or signs, no people, no floating items. Full bleed 16:9.
