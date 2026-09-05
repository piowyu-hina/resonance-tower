# Desktop village scene

The village is now one continuous illustrated square, not three icon cards. Desktop only by user request; no mobile rearrangement or image crop. Its 1672:941 aspect ratio and percentage-positioned semantic buttons keep home, shop and gate hit areas aligned at different desktop widths. Existing button IDs, keyboard activation, disabled states and home story guidance remain connected to the original flows. Scene styling is isolated in village.css; leaving the village restores the normal app width.

Artwork: prototype/assets/backgrounds/village-square.png. Created with built-in image_gen using shop-storybook.png as a style/design reference. This complete opaque scene needs no background removal. Previous individual assets are retained. No dialogue or game progression changes.

With user confirmation, home guidance now uses characters/guider.png and the home growth entrance uses characters/guider_full.png. Existing IDs and character names remain unchanged.

Label refinement: removed the solid brown plates in favor of warm ivory serif names, soft dark text shadows and a fine gold underline. Hover and keyboard focus brighten the name, extend the underline and reveal the description without moving the clickable label. The gate is named 村口 / Village Gate. Mandatory home guidance keeps a gold text emphasis without restoring the old box.

Header refinement: village-only overlay header with a soft dark gradient, smaller brand, frameless inventory entry and a subdued separated developer button. The debug panel overlays the scene without moving hotspots. Save/load controls are hidden globally at user request; DOM bindings and serialization remain intact, no new persistence behavior. Inventory contents and other screens' header styling are unchanged. design.md records the current scope and deferred home redesign.

Validation: npm test passed; focused desktop checks at widths 1024, 1440 and 1920 passed, covering art aspect ratio, building/label hit areas, shop entry, keyboard gate entry, home round-trip, app width reset and mandatory home guidance. Mobile overlay geometry tests remain, but the desktop-only village beneath them is no longer required to fit a phone viewport.

Generation prompt:

Use case: stylized-concept. Asset type: desktop fantasy RPG village hub background, wide landscape 16:9, high resolution.
Input image 1 is the design and art-style reference for Lumi's merchant stall. Incorporate that recognizable berry-red and cream canopy, potion sign, lantern and travel supplies into the village; do not copy its isolated black preview background.
Draw one continuous, beautifully composed Japanese anime storybook village environment, soft hand-painted shading and delicate warm brown linework. Warm late afternoon, peaceful lived-in village, welcoming rather than epic. Subdued sage foliage, honey light, cream plaster, warm timber, slate-blue cottage roof, burgundy shop canopy.
GAMEPLAY COMPOSITION: three separated clickable destinations, all clearly visible without overlap. Left at x=22%, y=52% a cozy full cottage with blue-gray pitched roof, warm illuminated wooden front door, flowerpots and small garden, occupying x=6-39%, y=24-77%. Center at x=57%, y=62% the reference merchant stall, large enough to see its lantern, potions, canopy and basket, occupying x=42-70%, y=38-82%. Right background at x=85%, y=40% a rustic timber village gate opening to a winding sunlit forest path, occupying x=76-96%, y=22-60%. The gate must read clearly as a route into adventure. No floating arrows.
Connect these three places naturally with one continuous cobbled and earthen village square, foreground grasses and small wildflowers, some background village roofs and wooded hills, not a collage of separate icons. Slightly elevated three-quarter camera, not overhead map; cohesive perspective and contact shadows. Full village artwork fills the entire canvas edge to edge. Quiet sky upper-left 18% for later title overlay; restrained foreground ground at bottom 12% for later labels. Buildings and stall must not be cropped.
No characters, no words, no UI, no frames, no borders, no text labels, no watermarks, no huge objects in foreground obscuring destinations. Not glossy 3D, not photorealistic, no checkerboard, no transparency needed.
