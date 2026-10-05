# Public Playground rollout

## Decisions

Playground is web-only. Enter from an isolated structure in the existing AnatomyGo viewer. The homepage design and shared `/v/` links stay intact. Supabase Free hosts community data; the existing model files stay on GitHub Pages. Google sign-in is required to save, vote or comment. Anyone may browse and try placement. Proposals appear publicly in Playground; an admin chooses the exact revision to publish. Votes are feedback, not an anatomical accuracy score.

## Implemented on `feature/public-playground`

- Editable viewer source consolidated from the local Human Atlas checkout into this repository; existing compiled deployment files have not been overwritten.
- `/playground/` uses the existing React/Three.js placement renderer, themes, anatomical views, surface needles and neighbouring structures. Every mesh can open, including empty checklists. Multi-mesh concepts ask the visitor to choose a component.
- Public UI removes ADB/device preview, self-review, files, exports, backups and engineering history. Context tooltips render in a page-level portal above the inspector. Inspector and checklist collapse; mobile uses a bottom panel.
- Skippable/replayable first-use tutorial; Google sign-in; public display names; per-tab recovery of unsaved proposals across refresh/sign-in.
- Immutable placement proposals, per-proposal votes, comments, ownership-checked withdrawal, reports, admin approval/unpublish/hide, mapping queue and host reassignment.
- SQL validates structure/geometry version, triangle range, nondegenerate triangle, finite barycentric weights, text lengths, identity and per-account rate limits. Imported placements stay unapproved.
- `pg_published_pack(mesh)` returns schema-1 approved-only biological content and anchors. A correction preserves the previous approved revision until explicitly approved. A host move unpublishes the old pin and requires a new placement.

## Data ownership and migration

`models/` remains the source geometry. `scripts/import-playground.py` verifies all 2,234 mesh digests against the local SQLite catalogue. It retains stable landmark IDs and exact anchors. Source SQLite is read-only; a SQLite backup is written under ignored `.local/` before preparing SQL.

Rehearsal and hosted import: **2,234 structures, 298 checklist entries across 27 mapped buckets, 61 proposals, zero published pins**. Existing mappings and unique exact-word name matches only (punctuation/order normalized). **74 ambiguous/unmatched buckets** remain in the admin mapping queue. All **1,026 original landmark records** remain in a private import table; the complete original revision/event history remains in the preserved SQLite backup. No missing anatomy or counterpart coordinates are invented.

Run the importer only to prepare an explicit migration:

```sh
python3 scripts/import-playground.py --database /path/to/playground.db --downloads /path/to/downloads.json
```

Output: `.local/playground-seed.sql`, `.local/migration-report.json`, `.local/pre-supabase.sqlite`, public geometry metadata and a local-preview seed. SQL inserts are idempotent and never overwrite hosted work. Reimporting a changed model requires an explicit geometry migration; do not use this baseline importer to overwrite geometry. Public preview seed is ignored by Git and is used only when no Supabase connection is configured; a failed hosted request never silently falls back to it.

## Local development and build

Node 22.13+ required. The main viewer and Playground use separate lockfiles to preserve their tested Three.js versions.

```sh
npm ci
npm --prefix playground ci
cp playground/.env.example playground/.env.local
# Set project URL + publishable key only.
npm run check
npm run build
python3 -m http.server 3018 --bind 127.0.0.1 --directory dist
```

Open `http://localhost:3018/playground/?structure=FJ3366`. For hot reload, use `npm run dev` (viewer/models :3016) and `npm --prefix playground run dev` (Playground :3017). Add that development origin to Supabase redirects when testing sign-in there. `public/models/` is generated from tracked `models/` during prepare/build.

Only `dist/` is a deployable artifact. Never serve the repository root publicly after adding source/environment files. The old root deployment remains checked in solely for transition. Do not upload `.local`, source SQLite, environment files, source scripts or node_modules. GitHub Pages rollout is a manual `Deploy AnatomyGo website` workflow on `main`; switch Pages to GitHub Actions and set the two `VITE_SUPABASE_*` repository variables first. The workflow refuses a missing configuration or secret-key prefix. Pull requests run build, geometry/interaction validation and isolated PostgreSQL permission tests.

## Supabase operations

Project: `https://ntxarpmsqnokcxmxorjd.supabase.co`. Ordered migrations live in `supabase/migrations/`. No service-role/secret key belongs in a frontend build. The provided publishable key is configured only in ignored `.env.local`; the MCP connection applied the schema and baseline data.

Public tables have RLS and no client write grants. Bounded SQL RPCs authorize their own writes, serialize per-user idempotency/rate checks and validate anchors. Private imports, audit, admins and rate-limit records are outside the exposed schema. Comments are rendered as React text, not HTML. Vote identities are readable only by their owners; totals are aggregated for the public.

The security advisor flags intentionally executable SECURITY DEFINER functions: they are the protected mutation API and the admin-membership/vote-total readers. Every mutation verifies user identity or admin membership, and all elevated functions have an empty search path. Permission tests cover the denied paths. Do not grant table writes to silence the advisor. See [signed-in function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [anonymous reader advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

The published-pack function is SECURITY INVOKER. Query indexes and statement-scoped auth checks address the initial performance advisories. Rate-limit records are pruned for the acting user; schedule retention cleanup for inactive users before growth. Server-side/private backups remain an operational requirement on Free.

## Current verification record

2026-10-06: TypeScript checks and both production builds pass. Atlas validation checks all 2,234 meshes / 2,288,268 triangles; interaction validation passes. Clean PostgreSQL migration tests cover anonymous read-only access, authenticated ownership, role escalation denial, invalid geometry/NaN/degenerate anchors, idempotent saves/comments, one vote per account, revision vote isolation, moderation, withdrawal, host moves and UTF-8 pack-size limits. Desktop/mobile browser checks pass against live anonymous Supabase reads, including surface picking and draft recovery; normal-viewer approved-pin rendering is checked with an intercepted browser-only fixture. No scientific placement was approved for these checks. Domain, app-link, theme and attribution artifacts match the current deployment. Secret-key scan of source and build passes.

## Launch checklist

- [x] Source migration, public UI and production builds.
- [x] Supabase schema, RLS/RPC permissions and baseline import.
- [x] Model bytes/digests and local permission tests.
- [x] Anonymous live browser checks, desktop/mobile layout, sign-in gate, draft recovery, empty checklists and tooltip stacking.
- [ ] Google OAuth provider and redirects configured by project owner.
- [ ] Owner signs in; grant admin to the verified Google account through the private admins table (never through user-editable metadata).
- [ ] Two real accounts: save, comment, vote, edit as a new revision, own-delete and admin approval/unpublish.
- [ ] Public beta deployment and smoke check on anatomygo.in.
- [x] Normal web viewer loads approved-only pins for an isolated mesh, checks the geometry fingerprint and shows surface needles with biological descriptions. A browser-only mock pack verified rendering without approving any imported data.
- [ ] Wire Android published-pin delivery to the shared approved feed; current Android/GitHub packs remain unchanged. Playground itself stays web-only.
- [ ] Automate off-site backups and test restoration before relying on community data long-term.

No public deployment has occurred. These remaining gates are not represented as completed.

## Follow-up edge cases

- One landmark can have several alternative immutable placements. A revised position starts with no votes; comments stay attached to the version discussed.
- Withdrawn/hidden proposals disappear publicly; published proposals need an admin action. Host moves hide the old alternatives and withdraw publication atomically.
- Duplicate-name suggestions warn locally; richer admin merge/undo and persistent moderation decisions remain follow-up work. Mapping supports clear whole buckets; mixed buckets need item-level handling before mapping them wholesale.
- Checklist/pin coverage is incomplete. Do not label unplaced imports as anatomically verified or interpret an empty checklist as a complete structure.
- The renderer limits the visible overview to 100 pins plus the selected alternative; all checklist items remain reachable. Publication enforces the current 100-pin app-pack limit.
- Report queues prioritize count/support, with a separate newest queue. Account-based limits reduce spam but are not a full anti-abuse system; CAPTCHA and abuse monitoring should accompany a broad public launch.

## Verification commands

```sh
npm run check
npm run build
node scripts/validate-atlas.mjs
node scripts/validate-interactions.mjs
# Disposable database on a local PostgreSQL instance; never a hosted project.
PGHOST=127.0.0.1 PGPORT=55439 PGUSER=playground_test bash supabase/tests/run.sh
# With the built preview running on :3018 and the seeded Supabase project:
(cd playground && node browser-check.mjs && node viewer-check.mjs)
```

The browser check uses real hosted anonymous reads and makes no database writes. It covers catalogue/checklist loading, imported surface pins, tooltip stacking, a new surface placement, sign-in gating, draft recovery and mobile overflow. Screenshots are in ignored `.local/screenshots/`. The PostgreSQL tests exercise the actual migrations with simulated Auth claims; they do not substitute for the remaining real Google OAuth and two-account checks.
