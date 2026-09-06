# Wuming action image refresh

The user reported stale artwork at http://127.0.0.1:8000/index.html?debug even after a hard refresh. The local server was checked and confirmed to serve this working tree. A fresh browser on that exact server loads the current asset. The cause in the user's already-open browser cannot be conclusively identified from those checks.

The approved gold-shield/green-healing artwork is copied byte-for-byte to assets/skills/wuming_action_resolve_v2.png, and CHAR_DEFS.wuming.action.img now references that unique filename. Battle controls and growth cards/inspector share this definition. The old asset remains intact. Main entry query revision advanced to 20260906-esm13.

Verified on the user's actual local URL: growth image source is the versioned filename; returned image SHA-256 matches the local approved file; the visible combat action also uses the versioned filename. Screenshot: .local/test-results/wuming-action-live-server.png. No balance or skill behavior changes.
