# Going live: the backend

Written 31 Oct 2026. Steps for the owner, in order. Every step was rehearsed on a full copy of the live data (see
"How it was tested").

## What changes
- **One migration:** `supabase/migrations/202610310001_revamp_card.sql`. It only adds things:
  - `pg_card`: one read per structure card instead of four.
  - `pg_feature_counts`: the numbers on the home page, without reading every row.
  - `attaches_to`: an empty column, for linking muscle attachments to bone features later.
  - Account deletion on request.
- **No settings change.** Sign-in uses the Google one-tap button, as the live Playground already does, so Supabase's
  redirect URLs and the Google client stay as they are.
- **No Android app change.** The app makes no Supabase calls.

## Order
The site works with or without the migration. Without it, the site reads pins the old way; published pins then show a
"Vote" link instead of the vote button. Either can go first. The calm order:

1. **Deploy the site.** Check the Right hip bone, a vote, and sign-in on anatomygo.in.
2. **Apply the migration at a quiet hour,** the same day or later:
   1. **Preflight.** In the Supabase SQL editor, run `supabase/checks/202610310001_preflight.sql`. It only reads.
      - Every row should say `ok`. Rows marked `info` are for the record.
   2. **Apply.** Paste `supabase/migrations/202610310001_revamp_card.sql` and run it.
      - It is one transaction.
      - If a table is busy, it gives up within 3 seconds and changes nothing. Then run it again a minute later.
   3. **Verify.** Run `supabase/checks/202610310001_verify.sql`. Every row should say `ok`.
   4. **Look.** On anatomygo.in, reload the Right hip bone. Published pins now show the thumb with a count.
      - Visitors who already have the page open keep the old reads until they reload. Nothing breaks for them.
3. **If anything looks wrong:** run `supabase/rollback/202610310001_revamp_card.sql`. The site goes back to the old reads
   on its own.

## Deleting an account (only when someone asks)
- In the SQL editor: `select playground_private.delete_account('their@gmail.com');`.
- It removes their votes, reports, comments, name and sign-in. Their pins stay, without a name.
- Not tested on Supabase itself: whether the SQL editor's role may delete from `auth.users`. If it may not, the call
  fails and nothing is deleted. In that case, remove the last line of the function, run it again, then delete the user
  under Authentication → Users.

## How it was tested
- **Data:** everything a visitor can read from the live tables, copied into a local PostgreSQL 18:
  - 2,234 structures, 1,770 features, 1,755 pins, 6 names, 1 comment.
  - Votes rebuilt from the public totals.
- **Supabase's behaviour:** the database had Supabase's roles, default grants and `auth.uid()`.
- **Old against new, on all 260 structures with features:** the four old reads and `pg_card` gave the same 1,732 pins
  and the same "Needs a pin" lists, compared with the site's own code.
- **The live site can't tell.** Before and after the migration:
  - Every old read was byte-identical (3.4 MB).
  - The full schema differs only by additions.
  - No live client reads with `select=*`.
- **Speed:**
  - `pg_card` takes 2–4 ms on the busiest structure. With 36 times today's pins and about 9,500 votes on it, about
    10 ms.
  - `pg_feature_counts` takes about 1 ms for 300 structures.
  - The migration itself takes 17 ms.
- **Busy tables:** the migration was run while another session held a read on the features table. It gave up after
  3 seconds, left nothing behind, and applied on the next try.
- **Undo:** the rollback leaves the previous release passing its whole test suite (`supabase/tests/run.sh`).
- **The site end to end:**
  - **Setup:** the real site in Chrome, desktop and phone, against the migrated copy. A local stand-in for Supabase's
    API ran each call as the visitor or the signed-in person, so grants and row rules applied. The database was
    checked after every step.
  - **Covered:**
    - Reading cards, counts and search.
    - Voting and unvoting.
    - A first pin, saving the Google first name with no extra step.
    - Comments, reports, deleting a pin, and the review queue publishing a pin.
    - A vote made while signed out, sent after sign-in.
    - Feedback.
  - **Before the migration:** the same run against the un-migrated copy also passed, through the old reads.

## Fixed while testing
- **The live site showed no pins on the Right ulna.** The API sends coordinates rounded to 15 digits, and one starter
  pin's rounded u and v add up to 1.0000000000000002 (in the database they don't: the preflight found 0 such pins). The
  site's check then failed the whole set. The revamp allows that rounding step.
- **Phone sheets never came to rest.** Whole-pixel measurements of a sheet that springs in fractions made it resize by
  a fraction of a pixel on every frame.
- **Before the migration, each card asked for `pg_card` again.** Now a missing function is asked about once per visit.

## Applied, 31 Oct 2026
- The preflight passed: production's schema matches the repository. Then the migration was applied in the SQL editor.
- Checked through the public API afterwards:
  - All 280 structures with features give the same 1,898 pins and "Needs a pin" lists from `pg_card` as from the old
    reads.
  - Visitors can't delete accounts (HTTP 401).
  - The live site reads cards with `pg_card` and shows the vote button on published pins.
