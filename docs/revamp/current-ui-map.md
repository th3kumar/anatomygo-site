# Current UI map (before the revamp)

Snapshot of `main` at 64841fa (2026-10-30). This is the checklist the revamp handoff is compared against: every screen, flow,
analytics event and constraint below either survives, changes on purpose, or is dropped on purpose.

The site has three front ends with three separately written visual systems:

| Surface | Path | Stack | Styles |
|---|---|---|---|
| Explorer (home) | `/` → `web/index.html`, `app/page.tsx`, `app/scene.tsx` | React 19 + Three.js, shadcn on Base UI, Tailwind v4 | `app/globals.css`, `app/dark.css` |
| Playground | `/playground/` → `playground/src/App.tsx`, `scene.ts` | React 19 + Three.js, hand-rolled components | `playground/src/styles.css`, `public.css` |
| Share page | `/v/` → `web/v/index.html`, `share.ts` | vanilla TS | `web/v/share.css` |
| What's new | `/whats-new/` → `public/whats-new/` | static HTML | its own `style.css` |

## Explorer

### Screens

All are absolutely positioned in `<main class="studio">` (`app/page.tsx:135`). Phone means ≤767px.

- **Static first frame** for crawlers (`web/index.html:11`), replaced by React. Must stay in step with `page.tsx:139`.
- **3D canvas + vignette** (`page.tsx:136-137`). Hover name tooltip on desktop when exploded (`scene.tsx:62`).
- **Identity** top-left: "INTERACTIVE ANATOMY", "AnatomyGo 3D", "2,234 modeled pieces · BodyParts3D" (`page.tsx:139`).
- **Top actions** top-right: Find a structure `/`, Playground (New), Appearance menu, About (i) with the app dot. Icon-only
  on phone; About hidden under 380px (`page.tsx:140`).
- **Systems panel** (`page.tsx:141-146`): presets All / Skeleton / Organs, one row per system (name = show only, switch =
  toggle), "N pieces visible", Hide all. Left column on desktop; a floating sheet opened from the dock on phone.
- **Search** (`page.tsx:147`): always-open Combobox; 8 organ suggestions, substring match up to 80 results.
- **View controls** (`page.tsx:148`): ¾ F S B, Light, Auto-rotate, Reset. Right edge on desktop, a row on phone; hidden on
  phone while the detail sheet is open.
- **Scene caption** (`page.tsx:149`), **bottom dock** with the Explode slider and Reset (`page.tsx:150`), **footer** hint +
  "Source & credits" (`page.tsx:151`).
- **Loading card** and **error card** (`page.tsx:152-153`).
- **Detail sheet** (`page.tsx:154`): non-modal; right column on desktop, bottom sheet (max 48dvh) on phone. Holds system
  accent, title, description, meta, Included structures, Parts & features pin list with byline and vote link, and the
  actions: Show pins on model, Isolate / Show surrounding anatomy, Parts & features (Playground), Clear selection.
- **About sheet** (`page.tsx:155`): app card (Play button / QR / iOS note), disclaimer, credits, feedback form,
  Share usage statistics switch.
- **Light pad** (`app/light-pad.tsx`), **feedback card** (`app/feedback.tsx`), **coach tips** (`app/tips.tsx`, off).
- **Pins in 3D** (`app/published-pin-layer.ts`): spheres with lines/areas, no text labels; only when one piece is isolated.

### Flows

- **Load:** `public/theme.js` sets the theme before paint → atlas.json → model stream outside-in, kept in Cache Storage
  `anatomygo-model-stream` → loading card hides at the `view` milestone; early taps are held up to 3 s.
- **Select:** tap → `choosePart` → teal tint, detail sheet opens. When exploded, taps snap to the nearest box.
- **Systems:** default is everything but Body surface. Order: Muscles, Skeleton, Arteries, Veins, then the rest
  (`app/anatomy.ts:21`). Any toggle clears the selection.
- **Isolate:** only from the sheet; frames the camera around the sheet (`scene.tsx:180-184`).
- **Pins:** loaded only when isolated with one piece selected, from Supabase (`app/published-pins.ts`).
- **Share a view:** there is no share button on the web. `/v/#1.<payload>` links come from the Android app.
- **Feedback card:** once per device, after 180 s of visible time and 4 s idle with nothing open.

### URL params and storage

- `/?structure=<id>&isolate=1`, `analytics_debug`, `feedback_preview`. Outgoing Playground links add
  `from=top_bar|details|home_pin`.
- localStorage: `anatomygo.appearance`, `.analytics`, `.about.app`, `.feedback`, `.home.tips`; reads
  `anatomygo.playground.visited`, `.practice`. sessionStorage: `anatomygo.loading`.

## Playground

### Screens

- **Stage** with pin labels (HTML, `scene.ts:416-446`) and an axes gizmo.
- **Header** (`Header.tsx`): "← AnatomyGo / Playground", structure name, system dot · N parts & features · N published;
  Find a structure, How it works, Sign in or the account menu (public name, Review queue, Sign out).
- **View rail** (`Controls.tsx`): 7 views, Fit, plus 4 display toggles (in a Display menu on phone).
- **Parts & features list** (`Checklist.tsx`): open or collapsed tab; filter over 8 items; empty state; + Add a feature.
- **Landmark card** (`LandmarkCard.tsx`): state eyebrow, Share, ⋯ (Report, Delete my pin), alternatives list, byline,
  "Is this pin in the right spot?" 👍/👎, comments fold, Suggest a better spot / Pin this feature.
- **Draft card** (`DraftCard.tsx`): step 1 place (Place / Move / Done), step 2 name, Latin, note; Save pin.
- **Structure finder** (`StructureFinder.tsx`), start card, loading, no-3D, placing caption, error and info toasts.
- **Dialogs:** Sign in (always titled "Sign in to save"), public name, admin Review queue, confirm/prompt (`ui/ask.tsx`).
- **Practice guide and hints** (`ui/Spotlight.tsx`), reachable only from How it works.
- Phone (≤799px): list and card become bottom sheets, one at a time; rail moves top-right. No landscape handling.

### Flows

- **Arrive:** `?structure=` (part, or concept → pick a piece), `?pin=`, `?from=` (logged then stripped). A saved draft wins.
- **Vote:** signed out opens Sign in and **records nothing**; same thumb again clears; can't vote on your own pin.
- **Sign in:** Google button (GIS) or Supabase OAuth popup / redirect. The interrupted action is not resumed.
- **Contribute:** Add a feature / Pin this feature / Suggest a better spot → click to place (drag to move) → name and note →
  Save pin → published straight to the community list. Share nudge after the 1st and 5th save.
- **Share a pin:** `/playground/?structure=…&pin=…&from=share`, system share sheet on touch, else copy.
- **Admin:** Review queue to publish, unpublish, hide, move, map imports.
- **Shapes:** shown here, but there's no editor in the Playground; shapes are written by admin tooling.

### Storage

localStorage `anatomygo.playground.practice`, `.visited`, `.saved`, `.seen`, plus the Supabase auth token.
sessionStorage `anatomygo.playground.draft`, `.signin`.

## Share page and What's new

- `/v/`: a card at most 480px wide with the shared structure, quiz or study pins; Open in AnatomyGo (Android), View in 3D,
  Get it on Google Play; statistics toggle. Payload format v1 (`share.ts:29-70`) must keep decoding.
- `/whats-new/`: static log; **nothing in the explorer links to it.**

## Visual systems today

| | Explorer | Playground |
|---|---|---|
| Tokens | shadcn names (`--background`, `--muted-foreground`, `--radius`) | own names (`--fg`, `--glass`, `--ok`, `--seg-*`) |
| Light | bg `#f3f4f4`, fg `#20242b`, primary navy `#263b48`, teal `#458a85` | same values |
| Dark ("Graphite Soft") | bg `#1d1f23`, card `#26292e`, fg `#e6e8eb`, accent `#6fb08f` | same values |
| Glass | `#ffffffeb` / `rgba(38,41,46,.94)`, 16px radius, 24px blur | same, written again |
| Font | "Inter" requested but never loaded (CSP blocks external fonts), so system fonts | same |
| Phone breakpoint | 767px (+ landscape queries) | 799px (no landscape) |

Most explorer CSS uses raw hex, so `dark.css` mirrors every light rule by hand, with `.dark .glass` declared three times.
Of 60 shadcn components in `components/ui`, 10 are used. Both apps measure panel positions in JS to frame the camera
(`app/scene.tsx:123,183`, `playground/src/App.tsx:450-474`), so moving panels means updating that code too.

## Analytics events that must survive

Explorer: `atlas_download_failed`, `atlas_load_restarted`, `atlas_load_interrupted`, `atlas_outer_ready`, `atlas_ready`,
`loading_tap`, `render_perf`, `renderer_failed`, `visit_summary`, `structure_selected`, `structure_isolated`,
`system_toggled`, `preset_applied`, `camera_view`, `explode_used`, `view_reset`, `search_performed`, `search_no_result`,
`search_abandoned`, `lighting_opened`, `lighting_closed`, `lighting_reset`, `appearance_changed`, `about_opened`,
`app_badge_shown`, `play_clicked`, `playground_opened`, `home_pins_offered`, `home_pins_shown`, `home_pin_selected`,
`home_tip_shown`, `home_tip_dismissed`, `feedback_prompt_shown`, `feedback_opened`, `feedback_dismissed`, `feedback_sent`,
`feedback_failed`.

Share page: `share_link_opened`, `share_link_invalid`, `shared_pin_revealed`, `view_in_3d_clicked`,
`open_in_app_clicked`, `play_clicked`.

Playground: `playground_view`, `webgl_unavailable`, `playground_error`, `playground_exit`, `structure_opened`,
`finder_opened`, `finder_choice`, `feature_opened`, `shared_pin_opened`, `pin_alternative_viewed`, `list_toggled`,
`display_toggled`, `camera_view`, `draft_started`, `draft_cancelled`, `pin_placed`, `pin_refused`, `pin_saved`,
`pin_deleted`, `pin_shared`, `share_nudge_shown`, `share_nudge_dismissed`, `vote_cast`, `comments_opened`,
`comment_posted`, `comment_deleted`, `report_sent`, `sign_in_prompted`, `sign_in_started`, `sign_in_completed`,
`sign_in_failed`, `sign_in_fallback_opened`, `google_button_unavailable`, `signed_out`, `public_name_prompted`,
`public_name_set`, `practice_started`, `practice_step`, `practice_completed`, `practice_skipped`,
`practice_offer_shown`, `practice_offer_accepted`, `practice_offer_dismissed`, `hint_shown`, `hint_dismissed`,
`admin_action`.

A parameter named `source` is sent as `ui_source` (`app/analytics.ts:47-49`).

## Constraints

- Keep the static first frame and `seo:` markers in `web/index.html` (filled by `scripts/build-seo.mjs`).
- CSP: `'wasm-unsafe-eval'` for the model stream; no external fonts or stylesheets. A webfont must be self-hosted.
- Keep `/?structure=&isolate=1`, `/playground/?structure=&pin=&from=`, `/v/` payload v1, `CNAME`, `.nojekyll`,
  `.well-known/assetlinks.json`, the Cache Storage name and chunk naming.
- `public/theme.js` runs before paint; theme-color is set in `web/index.html`, `public/theme.js` and `app/theme.ts`.
- `PLAY_PUBLIC` and platform gating in `app/play.ts`; `COACH_MARKS=false` (no unprompted tours).

## Known problems worth fixing in the revamp

- Two token systems and two copies of the same glass, buttons and system colours; 3D pin colours don't match CSS tokens.
- Layered overrides: `globals.css` overrides itself (~20 `!important`s on the detail sheet), `public.css` overrides
  `styles.css`, and both carry dead CSS from older designs.
- Panel geometry duplicated in JS for camera framing.
- No web share for a view; no link to What's new; pins in the explorer have no labels.
- Sign-in dialog says "Sign in to save" for every reason; the interrupted action isn't resumed; `vote_cast` fires before
  the sign-in check (`playground/src/App.tsx:396`).
- Licence wording differs: About says BodyParts3D is CC BY 4.0, What's new says CC BY-SA 2.1 Japan (`ATTRIBUTION.md` has
  both, for different things).
- "2,234" is hard-coded in five places; share page "about 35 MB" is a fixed string.

## The Motion film vs today's Playground

The contribute film (claude.ai artifact KQB1s1hCaRoee8SsfPfNu1) shows behaviour the code doesn't have yet:

| Film | Today |
|---|---|
| Thumbs-up counts at once (12 → 13), then a sign-in dialog with **Later: "It stays on this device only."** | Signed-out vote opens Sign in; nothing is recorded; no Later |
| A Contribute pill turns the same card into a contribute list ("Pin a part", "Add a missing part", "Suggest a spot") | Separate list tab, + button and card buttons |
| Pin follows the cursor before the click; drop ring; step dots tick | Click to place, drag to move |
| Pin is **nudged** into place after dropping | No nudge step |
| Save → "✓ Saved" → dialog to sign in **to publish with your name** | Save requires sign-in first; saved pins go straight to the community list |
| Card becomes the feature card, link copied | Toast or share nudge |
| Dark mode, mint `#7fd8b0` as the only accent, Inter | Light and dark, navy primary + teal, system font |
