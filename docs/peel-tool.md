# Scalpel (Peel tool)

Visitors asked to dissect the body: to peel layers away and see what lies beneath. The scalpel does that in the
explorer itself. Pick it up, then double-click a part (double-tap on a phone) to lift it away. Peeled parts stay
peeled until they are put back. Design source: the Motion film "AnatomyGo · Peel tool" (23 Nov 2026).

Code: `app/peel.ts` (timings, per-device memory), `app/peel-ui.tsx` + `app/peel.css` (controls), `app/scene.tsx`
(the lift, hover and taps), wired in `app/page.tsx`.

## How it behaves

| | Desktop | Phone |
|---|---|---|
| Pick up | Scalpel button at the end of the view pill (widens, mint) | Scalpel button between search and Systems. The row's three slots morph in place (340 ms): search narrows into the mint scalpel, the scalpel widens into the hint / count, Systems becomes Done |
| Find a part | Rest the pointer: the part lights (90 ms), its name shows (400 ms) | One tap lights and names it |
| Peel | Double-click: the part lifts and pales (420 ms), then dissolves | Double-tap, same lift |
| Count | "N peeled" and undo grow out of the scalpel | "N peeled" and undo in the bar; a badge on the scalpel once it's down |
| List | Count opens the Peeled list (guide lines, page dims) | Count opens the Peeled sheet |
| Put back | Row undo, the undo button, Ctrl/Cmd+Z, Put all back, Reset | Row undo, the bar's undo, Put all back |
| Put down | Esc (the list closes first), the button | Done, the button |

- Picking up the scalpel closes a peeked structure and brings an exploded body back together. Choosing a
  structure (tap with the scalpel down, search, link), exploding or Reset puts it down. Reset also puts every part back.
- A single click with the scalpel up does nothing (it never opens a card), so a double-click can't open one by accident.
- A peeled part that is chosen in search shows while it is chosen, and is peeled again once it's let go.
- Peels are kept with the tab's place (`app/place.ts`), so a reload keeps them. A new visit starts whole.
- Reduced motion: the lift and the list's motion are instant, with no guide lines.

### The New card

Shown **once per device, to new and returning visitors alike** (decided 24 Nov 2026, an exception to the first-visit
rule in `app/coach.ts` for this launch card). It waits for a calm moment: the body has settled, nothing is open, no
input for 3 s, and the page visible for 8 s. Once shown it never comes back, whatever the visitor does (Try, Later, Esc,
a click outside, or a reload while it is up), and it never shows to someone who has already used the scalpel. The
memory is `localStorage` `anatomygo.peel`, re-read just before showing so two tabs can't both show it. Storage that
can't be written never shows it.

Try condenses the card into the scalpel button. Desktop: a 620 ms flight onto the widening button. Phone: a 900 ms
flight; the scalpel bar forms while the card is in the air and the card lands on the scalpel's new place, so nothing
moves after it lands. Later, Esc or a click outside close it. Local preview: `?peel_intro` (dev builds only).

## Events

All events carry the usual `step`, `prev_action` and `layers`. Every event now also carries **`peeled`**: how many
parts were peeled when it happened (bucketed, `0`, `1`, `2_5`, …). GA's 50 custom dimensions are all used, so the new
params show only in **BigQuery** (`anatomy-go-app.analytics_555232644`).

| Event | When | Params |
|---|---|---|
| `scalpel_opened` | scalpel picked up | `method`: `button`, `intro`; `count`: parts already peeled |
| `scalpel_closed` | scalpel put down | `method`: `button`, `escape`, `done`, `explode`, `reset`, or what was chosen while it was up (`search`, `link`, `list`, `agent`); `peels`: peeled this time; `misses`: single clicks/taps on a part (people expecting one click to peel); `seconds`; `count` |
| `part_peeled` | a part lifted away | `method`: `double_click`, `double_tap`; `structure_id`, `system_id`; `count`: peeled now; `index`: this peel's number in the visit (events stop after 200) |
| `part_restored` | one part put back | `method`: `list` (row), `undo` (button), `undo_key` (Ctrl/Cmd+Z); `structure_id`, `system_id`; `count` |
| `peel_all_restored` | everything put back | `method`: `list`, `reset`; `count`: how many came back |
| `peel_list_opened` | Peeled list or sheet opened | `ui_source`: `dock`, `bar`; `count` |
| `peel_intro_shown` | the New card appeared | `visitor`: `first` (device first seen < 30 min ago) or `returning`; `seconds`: visible time before it came |
| `peel_intro_accepted` | Try the scalpel | `visitor`; `seconds`: how long it was up |
| `peel_intro_dismissed` | closed | `method`: `later`, `escape`, `outside`; `visitor`; `seconds` |
| `visit_summary` | (existing) | adds `peels` (bucket) and `scalpel` (1 if picked up this visit) |

### Questions to answer, and where

- **Do people find it?** `scalpel_opened` by `method` (`intro` = from the card, `button` = on their own), against
  visits. Card take-up: `peel_intro_shown` → `peel_intro_accepted` / `peel_intro_dismissed`, split by `visitor`.
- **Does the card help or annoy new visitors?** For `visitor` = `first`: `peel_intro_dismissed` rate, and
  `visit_summary.seconds` against first visits before the launch.
- **Do they get the double-click?** For each `scalpel_closed`, `peels` = 0 with `misses` > 0 means people clicked once
  and gave up. If that is common, the hover name ("Double-click to peel") needs to be louder.
- **What do they peel?** `part_peeled.structure_id` and `system_id`, ordered by `index`: the usual dissection path
  (skin → muscles → organs).
- **Does it keep people?** `visit_summary.seconds` for visits with `scalpel` = 1 against the rest.

```sql
-- What people peel first, second, third (BigQuery)
SELECT
  (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'index') AS nth,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'structure_id') AS structure,
  COUNT(*) AS peels
FROM `anatomy-go-app.analytics_555232644.events_*`
WHERE event_name = 'part_peeled'
GROUP BY nth, structure
QUALIFY ROW_NUMBER() OVER (PARTITION BY nth ORDER BY peels DESC) <= 5
ORDER BY nth, peels DESC;
```

## Tests

Browser suites, run against the dev server (`npx vite --port 3046` after `node scripts/prepare-assets.mjs`), live
outside the repo in `~/anatomygo-research/peel-tool/`:

- `desktop.mjs`: 36 checks covering hover, the peel, the list, keys, explode, Reset, reload and events, plus frame
  times and a real-speed screencast of the peel. `THROTTLE=4` runs it at 4× slower CPU.
- `phone.mjs`: 17 checks covering touch, the bar, double-tap, the sheet, Done and the badge.
- `intro.mjs`: 35 checks: once per device (new, returning, Later, ignored + reload, two tabs, scalpel used first), Try's
  landing on desktop and phone, and the phone bar's morph sampled every frame (each slot's width moves one way, nothing
  moves vertically, nothing moves after the card lands). `PHONE_ONLY=1` runs the phone part.
- `edge.mjs`: 10 checks: many peels, long list, theme, systems, search on a peeled part, focus, Put all back.
  `REDUCED=1` runs it with reduced motion.
