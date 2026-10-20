# Third-party notices

MarbleTime includes the following third-party material.

## Lucide icons

Most job icons (`scripts/make-icons.py`, `LUCIDE`), the interface icons in `LUCIDE_UI` (home, games, tv) and the hourglass, thumbs-up and message icons come from [Lucide](https://lucide.dev) 1.52.0, recoloured and rendered to PNG.

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Starter template

The TV app started from [AmazonAppDev/react-native-multi-tv-helloworld](https://github.com/AmazonAppDev/react-native-multi-tv-helloworld) (MIT-0, no attribution required).

## Voices

The read-aloud clips (`tv/packages/shared/src/assets/voice/`) are synthesised by `scripts/make-voices.py` with
Google Gemini-TTS (Cloud Text-to-Speech, voice "Leda", model gemini-2.5-flash-tts) in English, Estonian, German and
Spanish, under the project's Google Cloud terms. The characters' lines are made the same way by the backend, on
demand.

## Video in the Demo Cartoons test app

*Big Buck Bunny* © 2008 Blender Foundation, www.bigbuckbunny.org, licensed under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Streamed from Wikimedia Commons, not bundled;
the app shows this credit on screen.

## Libraries bundled in the TV app

Beyond React Native, Expo and the Vega SDK: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
(MIT, Kazuhiko Arase) draws the pairing QR code. [react-native-svg](https://github.com/software-mansion/react-native-svg)
(MIT, with css-tree (MIT), css-select (BSD-2-Clause) and warn-once (MIT)) draws the kids' characters on Fire OS;
on Vega the same API comes from the Vega SDK's `@amazon-devices/react-native-svg` (Amazon Program Materials
License, like the SDK's other packages). The TV's typeface is [Fredoka](https://github.com/google/fonts/tree/main/ofl/fredoka) (© 2016 The Fredoka
Project Authors, SIL Open Font License 1.1; static weights instanced from the variable font with fontTools, licence
in `tv/packages/expotv/assets/fonts/Fredoka-OFL.txt`; the Vega build carries the same files and licence in
`tv/packages/vega/assets/fonts/`).

## Libraries added to the backend for characters and speech

All permissive; installed from npm, not copied into the repo.

| Library | Licence | Where | What for |
|---|---|---|---|
| [saxes](https://github.com/lddubeau/saxes) 6.0.0 | ISC | API, drawing worker | parsing and checking the drawings' SVG |
| [xmlchars](https://github.com/lddubeau/xmlchars) 2.2.0 (used by saxes) | MIT | API, drawing worker | |
| [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas) 1.0.10 | MIT | drawing worker, tests | rendering drawings to PNG for the picture check |
| [Skia](https://skia.org), inside @napi-rs/canvas's prebuilt binaries (`@napi-rs/canvas-linux-arm64-gnu` in Lambda, `-darwin-arm64` on Macs) | BSD-3-Clause | drawing worker | the renderer; the binary is built with [ICU](https://icu.unicode.org) (Unicode License), [libjpeg-turbo](https://libjpeg-turbo.org) (IJG and BSD-3-Clause), [HarfBuzz](https://harfbuzz.github.io) (MIT), [Expat](https://libexpat.github.io) (MIT) and [Brotli](https://github.com/google/brotli) (MIT) |
| [AWS SDK for JavaScript v3](https://github.com/aws/aws-sdk-js-v3): `@aws-sdk/client-s3`, `@aws-sdk/cloudfront-signer` | Apache-2.0 | API | the cache of the characters' lines, signed links |
| [libebur128](https://github.com/jiixyj/libebur128) (method only: the K-weighting filter's analogue prototype constants, reimplemented in `backend/src/speech/audio.ts`; no code copied) | MIT | API | measuring loudness (ITU-R BS.1770-4) to normalise the voices |
| Python's [`difflib.SequenceMatcher`](https://docs.python.org/3/library/difflib.html) (method only: its matching-blocks ratio, reimplemented in `backend/src/domain/line-check.ts` to score lines exactly as `scripts/make-voices.py` does; no code copied) | PSF-2.0 | API | checking a new line heard back against its words |
