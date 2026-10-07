# Z-Anatomy candidate pins

Imports suggested surface pins for skeletal structures into the Playground as **unreviewed community proposals**. Each pin has an English name, a Latin name and a short biology description. Nothing is approved or published by the import: editors still decide through the normal moderation flow.

| File | What it is |
| --- | --- |
| [`metadata.json`](metadata.json) | Latin names (TA2 row per feature) and original descriptions, with the references they were checked against |
| [`batches.json`](batches.json) | Import order: the six-pin pilot first, then bounded batches (≤ 40 proposals) |
| [`ledger.json`](ledger.json) | Per-structure progress: discovered, matched, extracted, blocked (with reasons), metadata-ready, imported |
| [`../../scripts/import-z-anatomy.py`](../../scripts/import-z-anatomy.py) | The importer |
| [`../../supabase/migrations/202610070001_import_provenance.sql`](../../supabase/migrations/202610070001_import_provenance.sql) | Private `playground_private.imports` table: one row per imported candidate |

## How a candidate is made

The geometry runs offline in the AnatomyGo app repository (`tools/research/`), never in the browser:

1. `z_anatomy_extract.py` opens the original Z-Anatomy `Startup.blend` with Blender Python, **embedded scripts disabled**. It evaluates each host bone and its annotation lines (parents and Hook modifiers). The host comes from the parent chain and Hook target, never from proximity. Self-labels, unresolved hosts and parent/Hook conflicts are excluded.
2. `z_anatomy_candidates.py` handles each source host independently:
   - **Target:** matches the host to exactly one AnatomyGo mesh by name. Ambiguous or missing matches are blocked.
   - **Registration:** converts Z-up to Y-up, then rigidly registers the bone at unit scale from seven starts. Annotation positions are never used for the fit.
   - **Host gates:** blocks hosts whose surface fit fails (RMS > 3 mm or > 2.5 % of the bone's size, or p95 > 6 mm).
   - **Feature checks:** for each annotation, checks the side, keeps only point-like features (spines, tubercles, processes…), resolves the attached endpoint (Hook and surface distance must agree), projects it onto the exact app mesh with a surface-direction guard (normal dot ≥ 0.5, ≤ 5 mm), and writes a `{triangle, u, v}` anchor.
   - **Caching:** results are cached by source hash, extraction hash, target digest, geometry fingerprint and method version/settings.
3. `z_anatomy_plot.py` draws four-view review sheets per structure.

**These numbers are engineering diagnostics. They are not anatomical accuracy**, and every candidate leaves as `not_reviewed`.

## Running the importer

Requires Python 3.11 with `psycopg[binary]` 3.2 (and `pytest` for tests). The database URL is read from an environment variable and is never printed, logged or stored. Use a server-side connection string (Supabase → Connect → Session pooler), not a browser key.

```sh
# Offline preview (no database; uses public/playground-seed.json, cannot see live data):
python3 scripts/import-z-anatomy.py --candidates ~/anatomygo-research/z-anatomy-import/candidates --snapshot --batch pilot-right-hip

# Live dry run: reads the hosted database, writes nothing. Note the printed plan sha256.
export ANATOMYGO_IMPORT_DATABASE_URL='postgresql://…'   # set in your shell, never commit
python3 scripts/import-z-anatomy.py --candidates … --batch pilot-right-hip

# Apply exactly what the dry run showed (one transaction per batch):
python3 scripts/import-z-anatomy.py --candidates … --batch pilot-right-hip --apply \
  --confirm-project ntxarpmsqnokcxmxorjd --expect-plan <sha256 from the dry run>

# After any interruption, rebuild the ledger from what the database actually holds:
python3 scripts/import-z-anatomy.py --candidates … --reconcile
```

Before the first live `--apply`, apply the migration `202610070001_import_provenance.sql`; the importer refuses to write without it. Without `--batch`, the importer picks the next batch that has no import records yet. `--structure FJxxxx` and `--feature "Name"` narrow a batch. `--plan-out plan.json` saves every planned insert and blocker.

**Safety rules the importer enforces:**

- **Idempotent IDs.** Each candidate's key is sha256 of the source file hash, annotation object, target mesh and geometry fingerprint. The proposal ID, request ID and any new landmark ID (`z-<mesh>-<feature>`) are derived from it. A rerun finds the private import record and writes nothing. If the stored content differs from the new plan, it reports `imported_content_differs` and does not overwrite.
- **One transaction per batch.** Each batch holds an advisory lock and re-reads the live state inside the transaction. The plan hash must match `--expect-plan` when given, and batches are bounded (`--max`, default 40). The importer verifies that publication pointers are unchanged and that every planned row was written; otherwise everything rolls back.
- **Existing rows are untouched.** It never updates or deletes existing landmarks, proposals, votes, comments or `published_proposal`. Validation triggers and RLS stay on: the `validate_anchor` trigger rechecks every insert.
- **Landmark reuse.** An existing landmark is reused only when exactly one landmark on the same structure has the same meaning: the same words once side and the structure's own name are ignored, or else the same Latin name. Several matches or an archived match block the candidate.
- **Existing text first.** Suitable existing landmark text is preferred; `metadata.json` fills the gaps.
- **Anchor checks.** Every anchor is checked for finite weights inside its triangle, a valid triangle index and a non-degenerate triangle. It must also match the database's geometry fingerprint and mesh digest, and must rebuild the candidate's point from the site's own `models/*.bin` within 1 µm.
- **Hosted writes need confirmation.** Writing anywhere but localhost requires `--confirm-project ntxarpmsqnokcxmxorjd`, and the URL must point at that project.
- **Privacy.** Imported proposals have no author ("Starter pin" in the UI). Their public `request_body` is just `{"import":"z-anatomy"}`. Provenance (source, licence, method, references) and the geometric checks live only in `playground_private.imports`, which browser roles cannot read. `anatomical_review` there is a separate field, starting at `not_reviewed`.

## Tests

```sh
# Database permission tests, now including the private import table:
PGHOST=127.0.0.1 PGPORT=… PGUSER=… bash supabase/tests/run.sh
# Importer: dedupe, rerun, rollback/resume, ambiguous match, stale geometry, malformed anchors, guards:
PGHOST=127.0.0.1 PGPORT=… PGUSER=… python3 -m pytest scripts/tests/test_import_z_anatomy.py
```

Both create and drop their own databases. Never point them at the hosted project.

## Status

See [`ledger.json`](ledger.json). As of 2026-10-06 the candidates are:

- 755 annotations discovered on name-matched skeletal hosts. 748 belong to the 44 unambiguous meshes; 7 sit on two hosts that match two meshes each (cricoid cartilage, hyoid bone) and stay blocked.
- **154 extracted candidates on 33 structures, all metadata-ready.**
- Blocked:
  - 250 regions (surfaces, heads, fossae, bodies);
  - 133 curves (lines, crests, borders);
  - 20 openings;
  - 170 on hosts that fail the fit gate: both femurs, tibias and fibulas, and the sacrum. The app's long bones are 11–22 mm longer than Z-Anatomy's, so one rigid fit cannot align both ends; they need local or nonrigid registration;
  - plus a few inconstant, non-standard, unresolved-endpoint and too-far projections.
- Imported into the hosted database: **none yet** (`imported: null` until the ledger is reconciled against it).

The full set was rehearsed on a local copy of the Playground database (seed import plus a published pin, votes and a comment): 154 proposals and 116 new landmarks; a rerun of every batch wrote nothing; all pre-existing rows were unchanged.

Licensing: the placements derive from Z-Anatomy (CC BY-SA 4.0); see [`ATTRIBUTION.md`](../../ATTRIBUTION.md). Z-Anatomy's own definitions were not used.
