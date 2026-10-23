# Faster first load: plan

Status: **implemented on the branch, measured; awaiting review** (22 Oct 2026). D1 = hide at `view`, D2 = Playground unchanged (defaults taken). Branch `feature/faster-first-load`, from `main` 9ba6796.
Background: [load-time breakdown](../../../Anatomy%20Go/docs/research/load-time-breakdown-2026-10-22.html) in the app repo. Raw measurements are in `~/anatomygo-research/load-profile/`.

## Goal

Make a first visit show the body sooner and become usable sooner, **without changing a single byte of geometry**.

Today, on a 10 Mbps phone:
- **First part drawn:** 7.2 s
- **Taps work:** 28.2 s. Taps are ignored until all 15 chunks have arrived (`scene.tsx`, `if(!validTap||!ready)return`).
- **Everything loaded:** 28.2 s
- **Download:** 31.4 MB

## In scope

1. **Visibility-first loading.** Parts you can see from outside download first, in small pieces.
2. **Hidden parts last.** Parts that are off by default (skin) or sit inside others (brain, eye internals, inner ear, deep structures) come after the outer body.
3. **Exact meshopt compression.** It decodes back to byte-identical data, for about 31.4 → 28.8 MB.
4. **Allow taps as soon as the outer body is in**, with a safety rule so a tap can never pick the wrong structure.

## Out of scope for now

- **A low-detail first-view copy.** Decide later, with numbers from this work.
- **The Playground's own loader.** It keeps reading today's files and keeps checking every mesh's SHA-256. It can move to the new files later.
- **Caching headers** (`max-age=600`). GitHub Pages can't change them; see hosting plan B.
- **The systems peel order.** It lives on its own branch (`feature/systems-layer-order`) and waits for your order.

## Guarantees (each one has a check)

| # | Guarantee | How it is checked |
|---|---|---|
| G1 | Today's model files stay byte-identical: `models/atlas.json`, `models/body-*.bin`, `playground-geometry.json`, `downloads.json`. Everything that hashes or rebuilds anchors keeps reading these files: the Playground, Supabase rows, published packs, the Z-Anatomy importer and the Android landmark packs. | A CI step compares their SHA-256 with a committed list. `validate-atlas.mjs` still passes. |
| G2 | Each of the 2,234 parts decodes from the new files to exactly the same positions (Float32), normals (Int16) and indices (Uint32) as today. | The build decodes every part with the same decoder module the browser uses and compares each SHA-256 with `playground-geometry.json`. Any mismatch fails the build. |
| G3 | Pins don't move. Anchors (triangle, u, v) and the geometry fingerprint string are untouched. | A/B test: screen positions of published and community pins on the hip bone, femur and scapula are identical in both builds. |
| G4 | A tap during loading never selects the wrong structure. | Scripted taps during loading select the same part as the fully loaded baseline. Taps over a gap that is still loading select nothing until the gap has loaded. |
| G5 | If anything isn't supported or fails, the viewer falls back to today's loader. | Tests with WebAssembly disabled and with a corrupted chunk both still load the full model. |
| G6 | Analytics history stays comparable. `atlas_ready` still means "everything loaded". | Event check in the existing analytics harness. |

## Design

### A. Visibility pass → `models/load-order.json` (committed, small)

A script renders the canonical model in headless Chrome with one colour per part and the default systems on.
- It uses **16 views**: 8 directions around the body × 2 heights, with both desktop and phone framing.
- It counts the visible pixels of each part.

Each part gets a tier:
- **Tier 1 (outer):** visible in any view.
- **Tier 2 (inner):** on by default but covered in every view (deep muscles, brain, organs behind the ribs, inner vessels).
- **Tier 3 (hidden):** off by default (skin).

Within a tier, parts are sorted by visible area, largest first.

The file is regenerated only when the model changes. A validator checks that it lists all 2,234 parts exactly once.

### B. Stream build → `public/models/stream/` (generated in CI, not committed)

`scripts/build-stream.mjs` runs inside `prepare-assets`.
- **Packing:** parts go into chunks in tier order. The first chunk is about 300 KB, so pixels appear quickly; the rest are about 1 MB gzip each. A chunk never mixes tiers.
- **Encoding:** meshopt vertex codec v0, for positions (stride 12) and for normals padded to stride 8. Indices use the meshopt **index-sequence** codec. The triangle codec is ruled out: it rotates triangle corners in all 2,234 parts, which breaks pin anchors.
- **Compression:** gzip -9 on top, served like today's `.gz` files.
- **Manifest:** `stream.json` maps each part to its chunk, byte ranges and tier. It also records the canonical `geometry` string, so a loader can refuse a mismatched set.
- **Verification:** the G2 check runs here, at the end of the build.

### C. Loader (`app/model-stream.ts` + `app/scene.tsx`)

- **Order:** chunks download in priority order. A deep-linked structure (`?structure=…`), or one picked from search while loading, jumps to the front.
- **Concurrency:** 2 at a time; the A/B test decides between 2 and 3.
- **Decoding:** each chunk is decoded with meshopt into the **same arrays as today** (Int16×3 normals, Uint32 indices). From there it follows the existing BufferGeometry path unchanged.
- **Milestones:**
  - `outer`: tier 1 done
  - `view`: tiers 1 and 2 done, so the default view is complete
  - `all`: everything done
- **Fallback (G5):** if WebAssembly is missing, the decoder fails to start, or a decoded size is wrong, the remaining parts load through today's code from today's files.

### D. Interaction while loading

- **Taps** work from `outer`. Safety rule: if the tap's ray passes through the bounding box of a part that hasn't loaded, nearer than the hit, the tap is held and re-run when that part arrives.
- **Loading pill:** shown until `view`. Proposal; see decision D1.
- **"Settled" cues** (Play badge, tips) keep waiting for `all`, as today.

### E. Analytics (no new GA registrations needed)

- **New event `atlas_outer_ready`** with `load_ms` and `transfer_kb`. Both metrics are already registered.
- **`atlas_ready`** is unchanged and still fires at `all`.
- **`atlas_load_interrupted.progress`** becomes a share of bytes rather than a count of chunks, because the new chunks differ in size.

## Risks and how they're handled

| Risk | Handling |
|---|---|
| More, smaller chunks mean more draw calls, which could lower fps on weak phones | Keep it to about 30 chunks. The A/B test compares fps after load (`render_perf`). If it drops, merge meshes per system once `all` is reached. |
| The visibility pass misses a part that is only visible from a rare angle | That part still arrives in tier 2, and G4's tap rule covers the gap. |
| Someone hides muscles before tier 2 arrives | They see the inside still filling in, and the loading pill is still showing. This is acceptable, and the case is listed in the A/B test. |
| CI build gets slower and the deployed site bigger (about +29 MB of stream files) | Encoding takes seconds. The size is well within GitHub Pages' 1 GB limit. Visitors download less than today. |
| Decoder version drift | The build verifies with the exact decoder module the app imports, from the same package version. |

## How we compare (A/B)

1. **Baseline first.** Build `main` now and measure 3 cold-cache runs per scenario, using the median:
   - phone 10 Mbps, CPU ×4
   - desktop 10 Mbps
   - phone CPU ×4 with no network limit
   - fast Mac with no limits
   - 4 Mbps phone
2. **Candidate:** the same runs on this branch's build.
3. **Metrics:**
   - first pixels
   - `outer` (taps work)
   - `view`
   - `all`
   - bytes downloaded
   - total CPU and GPU time
   - long tasks
   - fps after load
4. **Identity checks:**
   - Pixel diff of the fully loaded body from 4 views in both builds. Expect identical; only translucent skin may differ.
   - Pin positions (G3).
   - Taps during loading (G4).
   - Fallback (G5).
5. **Report:** a comparison page in the style of the breakdown page, baseline vs new.

## Steps, each with a checkpoint

| Step | Work | Checkpoint |
|---|---|---|
| S0 | Baseline measurements of `main` | Numbers saved before any code changes |
| S1 | Visibility pass, `load-order.json`, validator | Tier sizes in MB known. This gives the first real estimate of the `outer` time. |
| S2 | Stream builder + G1/G2 checks | 2,234 of 2,234 parts byte-identical; canonical files unchanged |
| S3 | Loader, milestones, fallback | Full model loads; the fallback paths work |
| S4 | Taps while loading, loading pill, analytics | G4 and G6 pass |
| S5 | A/B runs and identity checks; comparison page | You review the comparison |
| S6 | Ship: the no-mistakes pipeline (review, tests, CI), then a PR and your approval, then deploy | Live check, then GA read-out a week later (`atlas_outer_ready`, funnel step "model ready → picked a structure") |

## Decisions for you

- **D1:** hide the loading pill at `view` (recommended) or keep it until `all`?
- **D2:** keep the Playground on today's files for now (recommended), or move it to the stream files in the same change?

## Progress log

- **S0 done.** Baseline `main` frozen and measured: 3 cold runs × 5 scenarios (`~/anatomygo-research/load-profile/ab-baseline.json`).
- **S1 done.** `scripts/visibility-pass.{html,mjs}` → `models/load-order.json`. Instead of a single outer/inner split, it peels repeatedly, layer by layer. Result: 946 parts in layer 0, 1,008 in layer 1, 258 in layer 2, 17 deeper, and 5 off by default.
- **S2 done.** `scripts/build-stream.mjs` (run from `prepare-assets.mjs`) builds 32 chunks, 28.9 MB gzip: outer 16.1, inner 12.0, hidden 0.8. **2,234 of 2,234 parts decode byte-identical.** `scripts/canonical-models.json` guards the 18 canonical files (G1).
- **S3/S4 done.** `app/model-stream.ts` plus changes to the scene loader and the tap handler.
  - Linked structures (`?structure=`) download first; the page passes them in as `priority`.
  - If one stream chunk fails, both workers stop and the canonical files fill in the rest.
- **Found during S3:** the site's Content-Security-Policy blocked WebAssembly, and the viewer silently fell back to the canonical files. Fix: `'wasm-unsafe-eval'` added to `script-src` in `web/index.html`. It allows compiling WebAssembly only, not JS `eval`. Browsers that don't support the directive keep the fallback.
- **S5:** results are in the comparison page. One finding:
  - The fully loaded body differs from `main` in **8–31 isolated pixels per 1280×800 view**; the baseline compared with itself differs in 0.
  - The cause is draw order. Meshes are now merged per stream chunk, so where two parts' surfaces coincide exactly, the other one wins a pixel.
  - The geometry is byte-identical, and the isolated hip bone with pins is pixel-identical.
  - The old order can be restored by re-merging per canonical chunk once everything has loaded, if wanted.
