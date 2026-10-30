# AnatomyGo revamp: plan

Status: draft for review, 2026-10-30. Branch `revamp`, worktree `~/anatomygo-site-revamp`.
Companion: [current-ui-map.md](current-ui-map.md) (what exists today; every item there is kept, changed or dropped on purpose).

## 1. Sources

Four Motion films, all owned by this account and read in full (store documents, CSS, scene code). They are the design
source of truth. Anything they don't show is designed in the same language and marked **(extrapolated)** below.

| Film | Link | Flow | Frame |
|---|---|---|---|
| A | claude.ai/artifact/DvhkFWBrBhDdm3mRzZZD4u | Structure view: ready, peek, focus, parts, feature, next, back, theme | Desktop, design 1600×900 |
| B | claude.ai/artifact/GdjkLFQ83oR997cwd5mLjs | Same, plus search and swipe gestures | Phone, 390 wide |
| C | claude.ai/artifact/KQB1s1hCaRoee8SsfPfNu1 | Contribute: vote, back to parts, contribute list, pin, drop, save, publish, share | Desktop |
| D | claude.ai/artifact/MotXoV5Qa8vGuSTgfL3F2y | Contribute | Phone, 390×844 |

Each film builds its UI from DOM and CSS, so values below are exact, not eyeballed.

The scene code cites numbered transitions from a written handoff (T1–T12, M2–M9, K6–K15, P1–P6). Transitions T3, T4, T9–T11,
K1–K5, K11–K14, M1, M4 and P2 are referenced by number only. **Ask Claude Motion for that handoff document**; it likely
covers the 10–20% not filmed.

## 2. What the new app is

One application at `/`. Learning and contributing happen in the same card, on the same 3D scene, with the same chrome.
The Playground stops being a separate app.

| Today | New |
|---|---|
| Explorer at `/`, Playground at `/playground/`, two scenes, two style systems | One app, one scene engine, one token file |
| Detail sheet with Isolate button | Peek card → **Learn more** → focus card (About / Parts / Muscles) |
| Pins only after isolating one piece, no labels | Pins and labels appear when a structure is in focus; features have their own card with prev/next |
| Contribute in another app | **Contribute** pill inside the card; the card turns into each step |
| Sign in before voting or saving | Act first, ask after: vote and save happen at once, sign-in is offered after, **Later** keeps it on this device |
| Navy + teal, light-first, Helvetica/system font | Dark-first frosted glass, mint as the only accent, Inter, matching light theme |

Principles from the films (keep them as review criteria): act first, ask after; the pin is the hero; never cover the
model; the pin is never under the finger or under the sheet; one hint at a time; one hero motion at a time; springs for
touch and sheets, eased tweens with no overshoot for the camera; calm, physical, never flashy.

## 3. Design tokens

All of these become CSS custom properties in one file (`app/tokens.css`), used by every surface including `/v/` and
`/whats-new/`. No raw hex anywhere else.

### Colour

| Token | Dark | Light |
|---|---|---|
| ground (stage gradient) | radial `#25272c` → `#1a1b1f` 55% → `#131416`, plus mint glow `rgba(127,216,176,.07)` | `#fbfaf7` → `#f1f0ec` → `#e6e5e0`, glow `rgba(63,160,120,.07)` |
| text | `#eceef0` | `#1f2124` |
| text-2 (body2, soft) | `#b9bdc2` | `#4a4e54` |
| text-3 (label, meta, chevrons, placeholders) | `#8f949a` | `#6f747a` → **use `#62676d`** (see note) |
| accent (mint) | `#7fd8b0` | `#3fa078` for fills; **`#2b7d5b` for accent text** (see note) |
| accent ink (text on mint) | `#0c241a` | same |
| accent tint (button fills) | bg `rgba(127,216,176,.14–.16)`, border `.38–.42`, text `#bff0d9` / `#e3f8ee` | derive from `#3fa078` |
| hairline | `rgba(255,255,255,.06–.12)` | `rgba(20,22,26,.06–.14)` |
| scrim | `rgba(10,11,13,.48)` | (extrapolated) `rgba(20,22,26,.24)` |
| edge light | conic mint `#7fd8b0` → sky `#8ecbff` | same |
| pin | white `#f4f5f6`, 2px border `#1b1c1f`, halo `rgba(127,216,176,.25)`; active fills mint | same |
| system dots | the existing system colours from `app/anatomy.ts` (films use them) | same |

Note: the films' light `#6f747a` measures about 4.1:1 on the light ground, below WCAG AA (4.5:1) for 13px text, and mint
text (`Pin it ›`) is unreadable on light glass. Both corrections above are the only deliberate departures from the films.

### Glass

- **Panel / card / dialog (dark):** `linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.02) 45%), rgba(30,32,37,.58)`,
  border `1px rgba(255,255,255,.10)`, radius 24, shadow `0 24px 60px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.08)`.
  Dialogs use `.92` alpha.
- **Panel (light):** `linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,.5) 45%), rgba(255,255,255,.4)`,
  border `rgba(20,22,26,.08)`, shadow `0 24px 60px rgba(40,40,50,.12), inset 0 1px 0 rgba(255,255,255,.9)`.
- **Phone sheet:** radius 26 26 0 0, dark bg alpha `.84`, top border `.12`, shadow `0 -16px 40px rgba(0,0,0,.35)`,
  grab handle 36×4 at top 8.
- **Small glass (buttons, search, hint pill):** same gradient at `.55–.62`, radius 14 (hint 999).
- The films use **no backdrop blur**. Keep it that way, or at most `blur(8px)` on desktop only. Today's `blur(24px)` over
  WebGL costs frame time on phones.

### Type (Inter, self-hosted)

| Style | Size / line / weight |
|---|---|
| wordmark | 22 / 700 / −0.02em (phone 19) |
| title | 24 / 1.2 / 600 / −0.01em |
| body, body2 | 15 / 1.55 / 400 (phone search 16, to stop iOS zoom) |
| label | 13 / 1.3 / 600 |
| meta | 13 / 1.4 / 400; Latin names italic |
| tab, pill, button | 13–16 / 500–600 |
| 3D label | 12 / 500 (phone 11), padding 5×9, radius 8 |

Inter must be served from our own origin (CSP blocks external fonts): variable woff2, Latin subset, `font-display: swap`,
preloaded.

### Shape and size

Radii: panel 24, sheet 26, tile 16, search and button 14, tabs 12 (indicator 9), row hover 10, label 8, kbd 6, pill 999.
Touch targets at least 44 px. Desktop insets 32 px from the edges; phone 12–20 px.

### Motion

Springs, written as stiffness/damping with mass 1 (the films' own formula):

| Name | k / c | Use |
|---|---|---|
| snappy | 520 / 38 | tab indicator, pin pop, label pop, toggles |
| card | 260 / 28 | card resize and morph, dialogs (scale .96 → 1) |
| sheet | 300 / 30 | phone sheet detents, search open/close |
| settle | 200 / 26 | swipe commit, nudge settle |
| drop | 520 / 30 | pin drop (one small bounce) |

Eases (cubic-bezier): **cam** `.65,0,.35,1` (all camera moves, no overshoot), **out** `.22,1,.36,1` (fades and slides in),
**in** `.4,0,1,1` (things leaving), **io** `.45,0,.2,1` (cross-fades, drags).

Standard durations: leave 0.12–0.18 s; enter 0.18–0.24 s, starting 0.04–0.06 s after the leave begins; stagger 30 ms (pins,
labels) or 40 ms (chrome); camera 0.5 s (pin to pin), 0.7–0.95 s (focus, feature, back). Content push distance 8 px (tabs)
or 24 px (card pages), in the direction of travel.

`prefers-reduced-motion`: camera cuts with a 150 ms fade, springs become 120 ms fades, no edge light, no bob.

Film-only devices not to build: the idle float of the 3D image, the drawn cursor, the finger dot and ripple, and the UI
sounds (decision D7).

## 4. Screens and transitions

### 4.1 Body view (T1)

**Desktop:**
- **Top left:** wordmark "AnatomyGo" over meta "Free 3D human anatomy".
- **Top centre:** search, 500 wide × 48 tall. Placeholder "Search a structure: femur, deltoid, heart…" with a `/` kbd.
- **Top right:** theme button (sun, 44 square) and an "About" button.
- **Left: Systems panel**, 272 wide, top 112:
  - Header: "Systems" plus "N parts shown".
  - Tabs: All / Bones / Muscles / Organs.
  - Rows: dot, name, count and a switch, in the current panel order.
  - "5 more systems" row.
  - Footer: "Explode" with a % and a slider.
- **Bottom centre:** view pill ¾ F S B | rotate.
- **Bottom left:** hint "Drag to turn · Scroll to zoom · **Click any part to learn about it**".

**Phone:**
- **Top bar:** wordmark (19), theme, info.
- **Right edge:** a vertical view pill ¾ F S B, top 206.
- **Bottom bar:** search pill (54 tall, radius 16) and a "Systems" button.
- **Hint:** "Tap any part to learn about it", centred above the bar.

**Choreography (T1):**
1. The body streams in: opacity 0 → 1, `translateY` 12 → 0, scale .982 → 1 and brightness .6 → 1 over 1.3 s. This is tied to the real stream milestones, not a timer.
2. The wordmark fades in first.
3. At the `view` milestone each panel rises 8 px from its own edge, 40 ms apart, over 0.24 s.

### 4.2 Peek (T2 desktop, M2 phone)

Tap or click a part:
- The part tints mint (55% mix). A small pin plus a name label pop where you tapped. The pin scales .6 → 1 with snappy.
- **Desktop:** a peek card, 400 wide at the right, slides in 16 px using the card spring. It shows:
  - "Bone · Right thigh"
  - X close
  - Title
  - A two-line description
  - A 52-tall **Learn more ›** button whose conic edge light runs three laps (about 2.9 s) and then rests.
- The hint changes to "Click another part to switch".
- **Phone:**
  - The sheet rises to the peek detent with the sheet spring.
  - The brand and right-side buttons fade.
  - A search icon takes their place.

Decision D5 covers whether the edge light runs on every peek or only the first in a session.

### 4.3 Focus (T3/T4 desktop, M3 phone)

On **Learn more**:
1. The body fades out (0.18 s, in-ease). Neighbouring structures stay as grey ghosts and the selected structure keeps its real colours.
2. The camera frames the structure, centred at about 36% of the width (clear of the card), over 0.95 s on the cam ease.
3. The peek card **grows into** the focus card, 372 × 600 at the right, using the card spring. The title stays put.
4. Tabs, About and the footer fade up 6 px, staggered 40 ms.
5. The chrome changes:
   - Top left becomes "‹ Whole body" with an Esc kbd.
   - The view pill becomes ¾ F S B | neighbours | labels | pins behind.
   - Logo, search, Systems and hint fade out.
6. Labels pop 30 ms apart after the camera lands. Labels for features on the far side read "Name · behind" with a dashed border and sit at 60%. All labels rest at 70% on the About tab.

**Focus card:**
- Meta and title, then tabs **About / Parts / Muscles**.
- **About:** description, three tiles (Type / Region / Side, see D9), then "Where it is".
- **Footer:** "Something to add? Write it in your name." with a Contribute pill, then "Left femur › · Details" (switch to the other side).

**Phone:**
- The sheet goes from the peek detent to the focus detent (about 45% of the screen) while its content morphs.
- The top bar becomes "‹ Body" plus a small pill with neighbours and labels.
- The camera frames the structure in the space above the sheet.

### 4.4 Tabs (T5, T6, M5)

- The tab indicator slides with snappy. The outgoing content moves 8 px away and fades in 0.12 s; the incoming content arrives 0.06 s later.
- **Parts tab:**
  - Rows with ›, ending in "See all".
  - Footer: "Missed a part? Add it in your name." with Contribute.
  - Labels come up to full strength.
  - Hovering a row lifts its 3D label (scale 1.06, full opacity).
- **Phone:** the sheet rises to fit the list, and the camera tightens its framing at the same moment, so labels stay above the sheet.

### 4.5 Feature (T7, M6)

Choosing a part row, a pin or a label opens the feature:
1. The camera turns to face the pin and comes 1.5× closer (0.9 s, cam ease). The ghosts fade out and the bone keeps its colour.
2. Once the camera lands, pins pop nearest-first, 30 ms apart:
   - The active pin turns mint at 1.4× with a halo ring (`rgba(127,216,176,.22)`, 28 px), and its label sits on the left.
   - Other pins sit at 45%, with labels at 55% on the right.
3. Card pages push: the old page moves 24 px left and fades; the new page arrives from the right.

**Feature card** (merged from films A and C):
- "‹ Right femur · Parts" and a ⋯ menu.
- Title, then the Latin name in italic.
- Description.
- A tile: "Looks right?" with 👍 count and "Suggest a spot".
- "Muscles attached here" rows (D9).
- Byline: "Added by the community · Sam R." with an avatar initial.
- "‹ previous · next ›".

**Phone:**
- The sheet returns to the focus detent.
- Meta shows "Feature · 4 of 24". Attachments are an inline sentence with underlined links.
- The top-left button cross-fades "Body" → "Right femur" and its width springs.

### 4.6 Next feature (T8, M7)

- Next › (desktop), or arrow keys (extrapolated), makes the camera glide pin to pin in 0.5 s. The active state swaps between pins with snappy, and the card pushes the same way.
- **Phone:** a sideways swipe drags the content with the finger. Past 30% of the width it commits with settle. Below that it springs back (extrapolated).

### 4.7 Back to whole body (T12, M8)

**Trigger:** "Whole body", Esc, or (phone) swiping the sheet down past 20% of its height.

1. The card fades and scales to .98, then pins and labels leave.
2. The body fades back in while the camera returns to **the exact view the user left** over 0.85 s.
3. The structure keeps its mint tint for 1.2 s, then clears.
4. The body chrome settles back in, 40 ms apart.

### 4.8 Search (M9; desktop extrapolated)

**Phone:**
- The search pill flies up into a field at the top of a full-height sheet, with "Cancel" beside it.
- The keyboard rises, and the body dims to 25%.
- Results fade in after the third letter, in two groups:
  - **Structures**, with "Muscle · Shoulder" meta.
  - **Parts & features**, e.g. "Deltoid tuberosity · On the humerus".
- Matches are bold. Cancel plays the open animation backwards.

**Desktop (extrapolated):** the top search field opens a results panel underneath, with the same groups and the same
spring.

**Search improvements:**
- Everyday words become real matches: `search-terms.ts`, which today feeds analytics only.
- Pinned features become searchable.
- The no-result analytics stay.

### 4.9 Theme (film A/B end)

The sun turns a quarter (snappy), then the whole screen eases from dark to light in 0.75 s (cam ease) as one cross-fade.
Implementation: a View Transition when the browser supports it, otherwise a timed fade. The 3D clear colour and
materials tween in the same 0.75 s. Decision D3 covers whether "match system" stays.

### 4.10 Vote (P1 and film C scene 1)

1. The thumb pops (×1.18 sine). The button tints mint (0.12 s). The count rolls 12 → 13, with the old number moving up 8 px and the new one moving up from below.
2. **Only when signed out**, 0.25 s after the vote lands:
   - A scrim and a centred dialog (desktop 360 wide; phone full width minus 24) scale .96 → 1.
   - The dialog has a mint badge, "Thanks for your vote", "Sign in so it counts.", "Continue with Google" and "Later? It stays on this device only."
3. **Later** keeps the vote locally. It is sent when the user signs in (D2).

### 4.11 Contribute (K6–K10, K15, P3–P6)

**1. Contribute list (K6)**
- The Contribute pill turns the same card into the list. Rows stagger in, 30 ms apart.
- **"Needs a pin":** features with no pin yet, each with a mint "Pin it ›" link, then "See all".
- **"Something missing?":** "Add a missing part".
- **Footer:** "A pin looks off? Open it and choose Suggest a spot."
- **Phone:** the sheet springs to its 390 detent, every pin labels itself, and a rail (reset / labels / pins behind) slides in.

**2. Pin in hand (K7, P4)**
- Other pins dim to 45% and their labels step back.
- The card shrinks to a step card:
  - "Pin a part", title and Latin name.
  - ① Place the pin
  - ② Add a note · optional
  - A disabled "Save pin", then Cancel.
- A mint pin floats under the cursor, bobbing slowly (up to three loops), with a "Click to drop" tag.
- The hint reads "Drag to turn the model" with Esc.
- **Phone:**
  - The sheet drops to a slim 136 bar: "Tap where it sits · drag to turn" with Cancel.
  - The bone fills the screen.
  - The floating pin rides **48 px above the finger**, so it is never hidden (D6).

**3. Drop (K8, P5)**
1. The pin falls 18 px with the drop spring, landing with one small bounce, while a mint ring grows to 58 px and fades over 0.3 s.
2. The label pops.
3. Step ① fills and draws a check (0.2 s).
4. The note field opens: 93 px, with the card spring and a mint focus ring.
5. Save comes up to full strength.
6. The hint becomes "Drag the pin to adjust · Turn the model to check". Dragging the placed pin is the nudge, which already exists as reposition.
7. **Phone:** the sheet rises to 320, and the camera keeps the pin above it.

**4. Save (K9)**
1. The button presses to 98% and reads "✓ Saved". The card settles into a saved summary.
2. **Signed out:** 0.25 s later a dialog appears with a pin badge, "Thanks, pin saved", "Sign in to publish it with your name.", Google and Later.
3. **Later** keeps the pin as a private draft on this device (D2).

**5. Publish (K10, P6)**
1. After sign-in, the dialog leaves and a "Pin saved" toast drops in for 2.4 s.
2. The draft halo settles into a live mint pin.
3. The card becomes the feature card for the new pin. It shows the byline "Added by you · just now" (mint avatar) and the tile "Help someone learn it — Share", with "Next to pin" suggestions below.

**6. Share (K15)**
- **Desktop:** a small popover springs out of Share with "Copy link" and "WhatsApp". After copying, the button reads "Copied" for 1.4 s.
- **Phone:** a small "Share this pin" sheet with the same items (D8).

**7. Phone end**
- The sheet slips away and every pin is labelled.

**Not in the films, but kept (restyled in the same language, extrapolated):**
- Alternative pins for a feature.
- 👎, Report and Delete in the ⋯ menu.
- Comments, as a fold in the feature card.
- Public name dialog.
- Admin review queue, as a wide dialog.
- Practice guide (still gated by `COACH_MARKS=false`).

### 4.12 Other surfaces (all extrapolated in the same language)

| Surface | Plan |
|---|---|
| About | Glass sheet from the right (phone: full sheet): app card (Play / QR / iOS note), credits, feedback form, statistics switch, account (sign in / name / review queue / sign out) |
| Feedback card | Same rules as today (`app/feedback.tsx`); restyled as a small glass card, bottom right / sheet on phone |
| Loading / error | Loading becomes the T1 stream-in with a thin progress line under the wordmark; error is a glass card with "Reload" |
| Light pad | Not in the films. Keep as a view-pill overflow item or drop (D10) |
| `/v/` share page | Same structure and payload; new tokens, Inter, glass cards |
| `/whats-new/` | New tokens; add a visible link from About |
| `/playground/` | Becomes a redirect page (section 6) |

## 5. Architecture

### 5.1 Single app

- One React entry (`web/main.tsx`). The Playground's features move under `app/`:
  - `app/contribute/` — drafts, steps, dialogs
  - `app/community/` — cloud, votes, comments, admin
- Drop the separate `playground/` Vite build once the redirect is live.
- State moves from about 80 `useState`s split across two `App`s into a small store (`useSyncExternalStore`, no new
  dependency). It has explicit modes:
  `body → peek → focus(tab) → feature(id) → contribute(step)`, plus overlays `search`, `about`, `dialog`.
  Every transition in section 4 is one mode change, so Back, Esc, swipe-down and browser history all go through the same
  path.
- URL reflects mode: `/?structure=<id>[&tab=parts][&pin=<id>]`. This keeps today's `structure`, `isolate=1` (now means
  focus) and `pin`. History entries let the phone back gesture close sheets.

### 5.2 One scene engine

Merge `app/scene.tsx` (streaming body, systems, explode, views) with `playground/src/scene.ts` (pins, HTML labels,
behind-detection, placing, dragging, fit). The new engine needs:

| Capability | Today | Work |
|---|---|---|
| Stream body, cache chunks | explorer | keep as is (Cache Storage name and chunk hashing unchanged) |
| Tint selected mint | teal tint in shader | change colour; animate 0.12 s |
| Focus: hide body, ghost neighbours | Playground "neighbouring structures" toggle | neighbours from `atlas.json` bounds (overlap within a margin); ghost material = flat grey, low alpha, depth-write off |
| Camera choreography | ad-hoc refit | one `camera.to(target, {duration, ease})` that tweens position, target and zoom on the cam ease; remembers the body view for Back |
| Frame clear of UI | DOM queries and hard-coded px | a layout registry: each panel reports its rect via `ResizeObserver`; the camera uses those insets |
| Pins with pop, active, dimmed | Playground | port; pops staggered nearest-first |
| HTML labels with behind state | Playground | port; anchor left/right per pin |
| Place, drag, finger offset | Playground (no offset) | add hover preview pin, 48 px finger offset, drop spring and ring |
| Shapes (lines/areas) | both | keep `lib/feature-shape.ts` |

The 3D colours come from the same tokens (read from CSS variables), so pins, tints and labels can't drift from the UI.

### 5.3 Motion implementation

- Add `motion` (the Framer Motion package; MIT). It has springs defined by stiffness/damping/mass, so the films'
  `k/c` values carry over exactly. It also handles layout animation for the peek → focus card morph, presence for card
  page pushes, and drag with velocity for phone sheets and swipes.
- Load only `LazyMotion` + `domAnimation` features (about 15–20 kB gzipped). No `eval`, so the CSP holds.
- Motion tokens live in `app/motion.ts` (springs, eases, durations) and are imported everywhere. No literal timing values
  in components.
- The camera and 3D pops run in the render loop with the same spring and bezier functions, ported from the films.

### 5.4 Components

Keep Base UI (already a dependency) for behaviour and accessibility: Dialog, Menu, Popover, Tabs, Switch, Slider,
Combobox. Style them only with the new tokens. Delete the ~50 unused shadcn files and the shadcn token layer.
`globals.css`, `dark.css`, `playground/src/styles.css` and `public.css` are replaced by:
- `tokens.css`
- one stylesheet per component, light and dark through variables, so no mirrored dark rules

### 5.5 Data needed by the new cards

| Card element | Source | Gap |
|---|---|---|
| Description | 9 curated (`EXPLANATIONS`), else the system text | most structures fall back to generic text (D9) |
| Type / Region / Side tiles | Side from the name; Region from bounds; Type not stored | D9 |
| Parts list, "Needs a pin" | `pg_landmarks` (with and without pins) | none |
| "Muscles attached here" | origin/insertion pins on muscles | needs a muscle → bone-feature link; check pin labels, else add a field (D9) |
| Feature n of N, prev/next | parts list order | none |
| Byline, votes | `pg_proposals`, `pg_vote_totals` | none |
| Local votes and drafts | new, client-side | no schema change: replay through `pg_vote` / `pg_submit` after sign-in |

## 6. Things that must not break

1. **Links:**
   - `/?structure=&isolate=1` and `/v/#1.<payload>` must keep working.
   - `/playground/?structure=&pin=&from=` gets a static redirect page to `/?structure=&pin=&from=`. It keeps its OG tags, and maps the old `anatomygo.playground.draft` session key.
2. **Sign-in:**
   - Supabase OAuth redirect URLs and the Google client's allowed origins currently point at `/playground/`. Add `/` before switching.
   - Keep `/playground/?auth=popup` until no popup can still be open.
3. **Analytics:**
   - Every event name in current-ui-map.md stays, with the same meaning. New interactions reuse them where they fit: Learn more = `structure_isolated` with `source: learn_more`, tabs = `display_toggled`.
   - Only add new names where nothing fits.
   - **GA custom dimensions are at 47/50.** New parameters must reuse registered ones.
   - A build check fails if a listed event disappears.
4. **SEO:**
   - The static first frame in `web/index.html` changes to the new header text and stays in step with React.
   - Keep the `seo:` markers.
   - Re-shoot `og-home.png` / `og-playground.png`.
5. **CSP:**
   - Keep `'wasm-unsafe-eval'`.
   - Add only `font-src 'self'`.
   - No external scripts or styles.
6. **Hosting:** keep `CNAME`, `.nojekyll`, `.well-known/assetlinks.json` and model files untouched.
7. **No unprompted tours** (`COACH_MARKS=false`). Passive one-line hints are fine.
8. **Performance budgets** (measured on a mid-range Android and an iPhone):
   - First interaction no later than today (taps at about 15 s on 10 Mbps).
   - 60 fps during card transitions.
   - JS increase under 40 kB gzipped.
   - No backdrop blur over the canvas on phones.

## 7. Phases

Each phase ends at a gate:
- `npm run check` and `npm run build` pass.
- Playwright screenshots at 1600×900, 1280×800, 390×844 and 844×390, in dark and light, compared side by side with film frames.
- The analytics contract check passes.
- You review it before the next phase starts.

Run checks one at a time (this Mac runs out of memory with parallel browsers).

| # | Phase | Delivers | Gate also checks |
|---|---|---|---|
| 0 | Foundations | `tokens.css`, Inter, `motion.ts`, the store and modes, layout registry, analytics contract test, a dev-only `/kit` page showing every component in every state | Contrast of every text token pair ≥ 4.5:1 |
| 1 | Body view | T1 shell on desktop and phone: wordmark, search pill, theme + About, Systems panel with tabs and explode, view pill, hints | Old controls all reachable; stream milestones drive T1 |
| 2 | Scene engine | Merged engine: tint, ghosts, camera tween with insets, pins, labels, behind state | 60 fps on phone; Back returns the exact view |
| 3 | Structure card | Peek → focus → tabs → feature → next → back on desktop; phone sheet with detents, swipe, swipe-down | Keyboard: Tab order, Esc, arrows; screen-reader names |
| 4 | Search | Desktop panel and phone sheet, grouped results, everyday words, features | `search_*` events unchanged |
| 5 | Contribute and community | Vote with Later, contribute list, pin in hand, drop, note, save, sign-in dialog, publish, share; ⋯ menu, comments, alternatives, admin | Local vote and draft replay after sign-in; existing pins and votes intact |
| 6 | Other surfaces | About, feedback, Play card, loading/error, `/v/`, `/whats-new/`, 404, `/playground/` redirect | Old links from Android and shared pins open correctly |
| 7 | Hardening and launch | Reduced motion, landscape, tablet 768–1023, iOS Safari load check, OG images, README screenshots; launch | GA parity for a week after release |

Rough size: phases 0–3 are the bulk; 5 is the riskiest (auth and data). Phases 2 and 3 can't be split across parallel
sessions because they share the scene and store.

## 8. Decisions needed

| # | Question | Recommendation |
|---|---|---|
| D1 | Merge the Playground into `/`, retiring `/playground/` with a redirect? | Yes; the films put contribute inside the structure card |
| D2 | Signed-out votes and pins: keep on the device and publish them on sign-in? | Yes; no schema change needed |
| D3 | Theme control: a single sun toggle (films) or keep System / Light / Dark? | Toggle in the top bar; "Match system" stays as the default and as an option in About |
| D4 | Default theme for first-time visitors | Follow the system, as today |
| D5 | Learn more edge light: every peek, or first per session? | First per session (one hint at a time) |
| D6 | Phone placing: press-drag-release with the pin 48 px above the finger, or tap where it sits? | Press-drag-release with the offset; a quick tap also drops |
| D7 | UI sounds (the films have them) | No sounds on the site |
| D8 | Phone share: custom sheet (films) or the system share sheet? | Custom sheet with Copy link, WhatsApp and More… (opens the system sheet) |
| D9 | Card data gaps: tiles, descriptions, "Muscles attached here" | Show only fields we have; derive Side and Region; add attachments from origin/insertion pins once the link is confirmed |
| D10 | Light pad, auto-rotate, explode: films keep explode (Systems panel) and rotate (view pill), and show no light control | Keep explode and rotate; move Light into a view-pill overflow |
| D11 | Where account and sign-in live (films show none) | Account section in About; a small avatar in the top bar when signed in |
| D12 | Preview while building: local server on the LAN for phone testing, or a Cloudflare Pages preview URL? | LAN first; Cloudflare preview from phase 3 for real devices |

## 9. Risks

| Risk | Mitigation |
|---|---|
| Long-lived branch drifts from `main` | Rebase weekly; keep `main` changes small until launch |
| Ghosting and labels cost frame time on phones | Cap ghosts to the nearest 30 parts; labels only for visible features; measure in phase 2 |
| Sign-in breaks when leaving `/playground/` | Add the redirect URLs first, keep the popup route, test both Google paths |
| Analytics break silently | Contract test in the build; compare a week of GA before and after |
| Unfilmed 10–20% looks off-brand | Get the written handoff (section 1); build `/kit` so every state is reviewed in one place |
