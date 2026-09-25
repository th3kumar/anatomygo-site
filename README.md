# anatomygo.in

The website for [AnatomyGo](https://github.com/th3kumar/AnatomyGo), the 3D anatomy atlas for Android. v0 is a proof of concept: plain static files, hosted free on GitHub Pages at `https://anatomygo.in`.

| Path | Purpose |
|---|---|
| `index.html` | Home page: what AnatomyGo is, and a link to Google Play |
| `v/index.html` | Opens **shared views** (`https://anatomygo.in/v/#…`) for people without the app: the pin names and notes, and a link to Play |
| `.well-known/assetlinks.json` | Tells Android that `anatomygo.in` links belong to the app, so they open in AnatomyGo instead of the browser |
| `404.html` | Shown for any other path |
| `CNAME` | The custom domain for GitHub Pages |
| `.nojekyll` | Stops GitHub Pages from dropping `.well-known`, which Jekyll treats as hidden |

