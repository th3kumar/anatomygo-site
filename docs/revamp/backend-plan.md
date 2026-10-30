# Backend plan for the revamp

Written 31 Oct 2026, from the migrations in `supabase/migrations/`, the Playground client (`playground/src/cloud.ts`)
and a read of the live tables (1,630 features, 1,562 community pins, 97 features without a published pin, 6 named
contributors).

**Short version:** the films need almost no new backend. Voting, pinning, comments, reports and the admin queue all
exist as RPCs, and they are safe to replay. One small, additive migration and one sign-in setting are needed. Nothing
existing changes, so the live Playground and the Android app keep working throughout.

## 1. Needed

### 1.1 Sign-in returns to `/`, not `/playground/`
- Today Google sign-in comes back to `/playground/?structure=…` (phones) or `/playground/?auth=popup` (desktop window).
- Add `https://anatomygo.in/**` to Supabase Auth → URL Configuration → Redirect URLs. Keep the `/playground/` entries
  until the redirect page has been live for a few weeks.
- The Google client's allowed origin is the domain, so it does not change.
- This is a dashboard setting: the owner changes it, or approves Claude changing it.

### 1.2 Signed-out votes and pins kept on the device (D2): no schema change
- `pg_submit` takes a request ID and returns the same pin when it is sent again, so a replay never makes a double.
- `pg_vote` overwrites the earlier vote, so replaying is harmless.
- Limits are 300 votes and 60 pins per hour per person, far above any replay.
- A pin needs a public name. See 1.4: it is set without asking.
- A vote on a pin that was removed meanwhile fails with `Proposal is unavailable`; drop it without a message.

### 1.3 The sign-in library loads only when needed
- The main app reads Supabase with plain `fetch`. Sign-in needs `@supabase/supabase-js`, which is too big for the
  first-load budget (JS increase under 40 kB gzipped).
- Load it on first vote, Contribute, or Account, and right away only when a session is already stored.

### 1.4 No name step: the Google first name is used
- A pin needs a public name (`pg_profiles`, 2–60 characters). The films' flow has no room for a separate step, and
  learners shouldn't be stopped mid-study.
- On a person's first pin, the app quietly saves their **Google first name** (`given_name`, else the first word of
  `full_name`) through `pg_set_profile`, then sends the pin. No dialog, no extra tap.
- It is shown right away: the published pin reads "Added by Mantu · just now". About → Account has
  "Name on your pins · Mantu · Change", a single field to change it.
- **Never the email address.** Names in `pg_profiles` are public, and the part before the @ often holds a surname,
  birth year or work handle.
- Only if Google gives no name: one field, "Name on your pins", with Save. This is rare.
- **No change to the database, and no backfill.** People who signed in before get their name the same way at their next
  pin. Filling names for everyone who ever signed in would publish names of people who never pinned anything,
  because the table is public.
- **The live Playground stays compatible.** It still asks for a name when none exists. Once the new app has saved one,
  the Playground finds it and skips its dialog.

## 2. Recommended: one additive migration

### 2.1 `pg_card(p_mesh)`: one request per card
- Opening a structure today makes four requests, and the vote totals wait for the others: the model fingerprint,
  `pg_published_pack`, the community pins, then `pg_vote_totals`.
- `pg_card` returns everything at once: the published pins, the best community pin per feature with its votes,
  the byline and date (for "Added by you · just now"), the signed-in user's own votes, and the features without a pin
  ("Needs a pin").
- This saves two round trips on every card. The benchmark showed slow networks are where the time goes.
- `pg_published_pack` and `pg_vote_totals` stay for the Android app and old clients.

### 2.2 `attaches_to`: "Muscles attached here"
- Attachments are recorded on the **muscle** (260 features such as "Origin: subscapular fossa" on subscapularis).
  Nothing links them to the bone's own feature (subscapular fossa on the scapula). Only 8 are written bone-side,
  as "Insertion of …".
- Add `pg_landmarks.attaches_to text references pg_landmarks(id)` (nullable).
- Fill it with a matching script. Matches that are not exact go to a review list for the owner. Future pilot rounds set
  it when they add an attachment.
- `pg_card` on a bone then also returns the muscles attached to each feature.
- Until it is filled, the card leaves the section out instead of guessing.

### 2.3 Tests
- Extend `supabase/tests/permissions.sql`: anon can call `pg_card`, it never returns hidden or archived rows,
  and it returns only the caller's own votes.
- `attaches_to` can't point at an archived feature, or at another feature on the same mesh.
- Run with `PGHOST=127.0.0.1 supabase/tests/run.sh` on the local PostgreSQL. Never against production.

## 3. Not needed
- **Feature search:** reads `pg_landmarks` as it is. At 1,630 rows no index is needed. Revisit past 20,000.
- **Share links, feedback, comments, reports, admin queue, withdraw:** the existing RPCs cover the films.
- **Analytics:** GA only, no backend.
- **Description, Type and Region tiles (D9):** stay as static data built with the site, not database fields.

## 4. Later (optional)
- **Pins in the static build:** a snapshot of published pins written at deploy, as `llms-full.txt` already is. Pins
  would show instantly with no Supabase request. The live read would then only add newer community pins. Worth it
  if the move to Cloudflare Pages happens (see the hosting plan).

## 5. Order
1. Write the migration and tests locally, and run them on local PostgreSQL.
2. Switch `app/published-pins.ts` and `app/feature-counts.ts` to `pg_card` behind a fallback to the current requests,
   so the app works before and after the migration is applied.
3. Phase 5 front end: votes and drafts on the device, sign-in library on demand, the name step, replay after sign-in.
4. **Owner's step:** apply the migration and add the redirect URL. This is the only production change, and it comes
   right before launch.
5. Matching script for `attaches_to`. The owner reviews the unsure matches, then it is applied.

## 6. Keeping the live site safe
People use anatomygo.in and the Playground while this is built, so every database change follows these rules:
1. **Add only.** The migration adds one function (`pg_card`) and one nullable column (`attaches_to`).
   - It doesn't change or drop any existing table, function, policy or permission.
   - `pg_published_pack`, `pg_vote_totals`, `pg_submit` and `pg_vote` keep their exact signatures and behaviour.
2. **No locks users would feel.** A nullable column with no default is a metadata-only change, and creating a function
   locks nothing. Filling `attaches_to` updates about 260 rows in small batches.
3. **Nothing live reads the new parts.** Live code names its columns (`cloud.ts`, `published-pins.ts`,
   `feature-counts.ts`), so an extra column changes no response. The Android app makes no Supabase calls.
4. **Old and new front ends both work.** The revamp falls back to today's requests when `pg_card` is missing, so the
   migration can go live before, with or after the new site.
5. **Tested first, locally.** `supabase/tests/run.sh` runs every migration on a throwaway local database, plus checks
   that the old functions still answer as before.
6. **Easy to undo.** A rollback file (`drop function pg_card; alter table pg_landmarks drop column attaches_to`) is
   written alongside. Nothing old depends on either.
7. **Checked live after applying.** Home page pins on a structure, a Playground vote, and feedback sending. These are
   REST reads, not log queries, so they don't touch the log budget.
8. **The owner applies it**, at a quiet hour, after reviewing the SQL.
