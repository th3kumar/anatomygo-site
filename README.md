<div align="center">

<img src="public/app-icon.png" width="88" alt="AnatomyGo app icon">

# AnatomyGo

**Explore the human body in 3D, for free, in your browser or on Android.**

[![Website](https://img.shields.io/badge/web-anatomygo.in-458a85)](https://anatomygo.in) [![Google Play](https://img.shields.io/badge/Google_Play-AnatomyGo-263b48?logo=googleplay&logoColor=white)](https://play.google.com/store/apps/details?id=com.anatomygo) [![Open Collective](https://img.shields.io/badge/Open_Collective-support_us-7fadf2?logo=opencollective&logoColor=white)](https://opencollective.com/anatomygo)

<img src="public/og-home.png" width="820" alt="AnatomyGo: a 3D human body with the Systems panel open">

</div>

## What you can do

- **Explore 2,234 pieces in 15 systems.** Rotate, zoom and tap any structure to see what it is.
- **Search, isolate and explode** the body to see where each part sits and what surrounds it.
- **Open shared views** with study pins, and reveal answers quiz-style.
- **Pin parts and features** right on the model, and vote on or comment on other people's pins.

No account is needed. It works on phones, tablets and computers.

## Get AnatomyGo

- 🌐 **Web:** [anatomygo.in](https://anatomygo.in), in any modern browser, including iPhone and iPad.
- 🤖 **Android:** [Google Play](https://play.google.com/store/apps/details?id=com.anatomygo). The same atlas as an app, fully offline, with no account.

<a href="https://play.google.com/store/apps/details?id=com.anatomygo"><img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" height="64" alt="Get it on Google Play"></a>

<details>
<summary>See the Android app in action</summary>

<img src="docs/media/anatomygo-android-preview.gif" width="320" alt="AnatomyGo on Android: rotating the model and isolating a muscle">

</details>

## Support AnatomyGo

AnatomyGo is free and made by a small team. If it helps you learn or teach, you can support it on Open Collective, where every contribution and expense is public.

<a href="https://opencollective.com/anatomygo/donate"><img src="https://opencollective.com/anatomygo/donate/button.png?color=blue" width="260" alt="Donate to AnatomyGo on Open Collective"></a>

## Feedback and contributing

- Use **Feedback** in the site's About panel, or [open an issue](https://github.com/th3kumar/anatomygo-site/issues).
- If you spot an anatomy name or coverage error, please include a reference.
- For larger changes, open an issue first. The project is maintained by [@th3kumar](https://github.com/th3kumar).

## Run it locally

```sh
npm ci && npm --prefix playground ci
npm run check && npm run build
python3 -m http.server 3018 --bind 127.0.0.1 --directory dist   # open http://localhost:3018
```

You need Node.js 22.13 or newer. Maintainer notes (how the model loads, Playground, feedback, deployment) are in [docs/maintaining.md](docs/maintaining.md).

## Credits and license

- **Viewer:** based on [Human Atlas](https://github.com/ashemag/human-atlas), under the MIT license ([LICENSE](LICENSE), [notice](human-atlas-license.txt)).
- **Anatomy:** [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/) © DBCLS, under CC BY 4.0. Sources and changes are listed in [ATTRIBUTION.md](ATTRIBUTION.md).
- AnatomyGo is made for learning. It is not a tool for diagnosis or surgery.
