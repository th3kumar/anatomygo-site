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

## Rules the app depends on

Share links sit in people's chats indefinitely, so these must not change:

- **`/v/` stays where it is**, and keeps decoding the version-1 format `#1.<base64url(zlib(json))>`. The app's `ShareCodec` (`app/src/main/java/com/anatomygo/data/SharedView.kt` in the app repo) is the reference; this page mirrors its limits. A future format gets a new version number and must keep reading version 1.
- **The pin data stays out of the server's reach.** It is in the URL fragment, which browsers never send. The page must not load scripts, fonts or analytics from other sites, or send `location.hash` anywhere. Pin text is inserted with `textContent` only.
- **`/.well-known/assetlinks.json` answers 200 at `https://anatomygo.in` directly**, as JSON. Android does not follow redirects when checking it.

## Hosting and DNS

GitHub Pages publishes the `main` branch, root folder. HTTPS is free: GitHub issues the certificate once DNS points here.

DNS records at the domain registrar:

| Type | Name | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` (optional) | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` |
| CNAME | `www` | `th3kumar.github.io` |

Remove the registrar's default parking or forwarding records for `@` and `www` first, or they will conflict. Then:

1. Check DNS with `dig +short anatomygo.in` (should list the four addresses; allow up to a few hours).
2. In the repo's **Settings → Pages**, wait for the DNS check to pass, then tick **Enforce HTTPS** (the certificate can take up to an hour).
3. Optional but recommended: **verify the domain** under GitHub **Settings → Pages → Add a domain** (account settings, not the repo). It adds a TXT record, so no one else can point a Pages site at `anatomygo.in`.

## App Links

`assetlinks.json` currently lists only the **debug** signing certificate of the development machine, so debug builds can be tested end to end. Before a Play release, add the **Play app signing** certificate's SHA-256 from Play Console → Test and release → App integrity. That is Google's signing key, not the upload key. Remove the debug entry once testing is over.

Check it with:

```sh
curl -s https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://anatomygo.in\&relation=delegate_permission/common.handle_all_urls
adb shell pm verify-app-links --re-verify com.anatomygo
adb shell pm get-app-links com.anatomygo      # anatomygo.in: verified
```

## Local testing

```sh
python3 -m http.server 8765 --bind 127.0.0.1
# On the Android emulator the Mac is 10.0.2.2:
adb shell "am start -n com.android.chrome/com.google.android.apps.chrome.Main -a android.intent.action.VIEW -d 'http://10.0.2.2:8765/v/#1.eNp…'"
```

`tools/share_link.py` in the app repo decodes and builds links.

## Next

The full site will take its look from [Human Atlas](https://human-atlas-seven.vercel.app/) ([source](https://github.com/ashemag/human-atlas), MIT), the reference AnatomyGo's app is based on. Pages can host a built Vite/React site through GitHub Actions, so the host and domain carry over.
