# Brand assets

All images come from `source-original.png`.

| Folder | What | Use for |
| --- | --- | --- |
| `mascot/` | Full body, transparent (PNG + WebP), plus a sticker version with a white border | Hero, landing page, empty states |
| `head/` | Head-only mark, transparent, plus a sticker version | Logo spot in the navbar, small UI |
| `avatar/` | Round head on space, gold or cream | Profile pictures, chat avatar, social accounts |
| `mono/` | Single-colour silhouettes (navy, white, gold, black) | Watermarks, skeleton/loading, CSS `mask-image` |
| `favicon/` | `favicon.ico`, PNG favicons, `apple-touch-icon`, PWA `icon-*` and `icon-maskable-*`, `site.webmanifest` | Copy into `frontend/public/` |
| `social/` | OG image 1200×630, square 1080 post | `og:image`, social posts |
| `talk/` | Layered talking rig (see below) | The speaking mascot |

`*-master.png` files are lossless at full resolution. Use them for editing, not on the web.

## Talking rig

Each folder in `talk/` (`full-1024`, `full-512`, `head-512`, `head-256`, `avatar-space-256`) is one stack of PNGs. They are all the same size and already aligned, so you just stack them with `position: absolute`:

1. `base.png`: the mascot with a blank face
2. one `eyes-*.png`: `open`, `half`, `closed`, `happy`
3. one `mouth-*.png`

`base` + `eyes-open` + `mouth-rest` looks exactly like the static mascot.

| Mouth | Shape | When |
| --- | --- | --- |
| `rest` | Original smile | Idle, between sentences |
| `closed` | Flat line | M, B, P, short pauses |
| `small` | Slightly open | Quiet sounds, transitions |
| `medium` | Open, tongue showing | Most vowels |
| `large` | Wide open | A, loud syllables |
| `o` | Round | O, U, W |
| `wide` | Wide, flat | E, I |
| `frown` | Sad | Errors, sad replies |

The simplest lip sync uses the audio volume (`AnalyserNode`): map it to `closed` → `small` → `medium` → `large` and change roughly every 60–100 ms. For blinking, show `half` → `closed` → `half` (about 60 ms each) every 3–6 s. `talk/preview.webp` shows it in action.

## Colours

| Name | Hex |
| --- | --- |
| Navy (outline) | `#03133F` |
| Space (background) | `#0B1640` |
| Gold (paparajote) | `#FDAD1E` |
| Cream | `#FFF6E4` |
