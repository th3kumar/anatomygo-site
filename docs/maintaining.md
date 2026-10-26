# Maintaining AnatomyGo

Notes for people working on this repository. The [README](../README.md) is the public front page; everything technical lives here.

## Build, preview and deploy

Use Node.js 22.13 or newer:

```sh
npm ci
npm --prefix playground ci
npm run check
npm run build
python3 -m http.server 3018 --bind 127.0.0.1 --directory dist
```

Open **http://localhost:3018**. Configure `playground/.env.local` from the example to connect Supabase. Serve only `dist/`; never expose the source repository or local data folder. Setup and launch status: [Playground rollout](playground-rollout.md).

Preserve `CNAME`, `.nojekyll`, `.well-known/assetlinks.json`, `/v/`, model files and attribution when deploying. Existing shared links depend on them.

## How the model loads

The files in `models/` are the canonical model. Pin anchors, mesh digests, the Playground and the importers all rely on their exact bytes. The build leaves them untouched and writes a streaming copy for the viewer to `public/models/stream/` (`scripts/build-stream.mjs`, run by `prepare-assets.mjs`). The copy holds the same parts, packed outside-in in the order of `models/load-order.json` and compressed with meshoptimizer's lossless codecs. The build decodes every part again and fails unless it matches the canonical digest. Chunk files are named by a hash of their content (`s-<n>-<hash>.bin.gz`), so a name always means the same bytes. The viewer therefore keeps them in the browser's Cache Storage and reuses them on later visits without asking the server. GitHub Pages' `max-age=600` would otherwise make every visit more than ten minutes later re-check all of them, one round trip each. A stored chunk that fails to decode is deleted and downloaded again, and chunks from older builds are pruned. If the stream can't be used, the viewer loads the canonical files as before. That happens without WebAssembly, or if `'wasm-unsafe-eval'` is ever dropped from the page's Content-Security-Policy.

If the model changes on purpose:
- Regenerate the load order with `node scripts/visibility-pass.mjs <devtools-port>`. It needs a Chrome running with `--remote-debugging-port`.
- Update `scripts/canonical-models.json`, together with a new geometry fingerprint.

The build refuses to run until both match.

## Feedback

After three minutes of use, a small card asks visitors, once per device, for a few words of feedback and an optional
email (`app/feedback.tsx`). About offers the same form any time. Messages go to the private table
`site_private.feedback` through `site_feedback_submit` (migration `202610260001_site_feedback.sql`). The public API can
add to it but never read it, so read it in the Supabase dashboard (Table Editor, schema `site_private`). Analytics only
record that feedback was sent, never its text.

## Search engines

`public/robots.txt` and `public/sitemap.xml` list the pages that search engines may index; add new public pages to the sitemap. The home page ships its header and a one-line description as plain HTML (`web/index.html`), so crawlers that don't run JavaScript still see what the page is. Keep that text in step with `app/page.tsx`. `/v/` and the 404 page are `noindex`. Link previews use `og-home.png` and `og-playground.png`, which are 1200×630 screenshots of the app.

## Repository and source status

The site is built from this source (React and Three.js viewer, plus the web-only **Playground**) into `dist/`. The manual **Deploy AnatomyGo website** workflow publishes it to GitHub Pages. The static files at the repository root are left over from before that migration and are not what's deployed.

Playground uses Supabase for signed-in contributions, votes, comments and admin-selected pin revisions. For setup, validation and data migration, see the [rollout and operating guide](playground-rollout.md).

- **Upstream application:** [MIT license notice](../human-atlas-license.txt).
- **Anatomy data:** CC BY 4.0, with sources and adaptations in [ATTRIBUTION.md](../ATTRIBUTION.md).
- **Android source:** maintained separately. Playground is web-only.

## Contributing in detail

The project is maintained by [@th3kumar](https://github.com/th3kumar). Feedback and proposals are welcome through [GitHub Issues](https://github.com/th3kumar/anatomygo-site/issues); the maintainer reviews changes and coordinates releases.

You can help by:

- Trying the viewer and describing anything that feels confusing or difficult.
- Reporting bugs with your device/browser, steps to reproduce, and expected behaviour.
- Identifying anatomical naming or coverage problems, with a reference where possible.
- Suggesting improvements to accessibility, learning workflows, or documentation.
- Submitting documentation corrections through a pull request.

Please discuss larger changes in an issue first. Edit the application source and rebuild; do not edit generated bundles directly. Keep discussion respectful and focused on helping people learn.
