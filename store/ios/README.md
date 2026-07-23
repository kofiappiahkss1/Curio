# Curio — iOS shell

A minimal SwiftUI + WKWebView wrapper. It exists for three reasons the browser
cannot provide: **App Store discovery**, **storage iOS will not evict**, and a
proper icon and splash screen.

## Build it

You need a Mac with Xcode and an Apple Developer account ($99/yr).

1. Xcode → **New Project → App**, Interface **SwiftUI**, name **Curio**,
   bundle id `app.curio.diary`.
2. Replace the generated `CurioApp.swift` with the one in this folder.
3. Drag the whole Curio web folder into the project as a **folder reference**
   (blue, not yellow) named `web`. It must contain `app.html`, `app.js`,
   `core.js`, `crypto.js`, `backup.js`, `i18n.js`, `share.js`, `store.js`,
   `sw.js`, `manifest.webmanifest` and `icons/`.
4. In **Info.plist** add usage strings — the App Store rejects builds without them:
   - `NSCameraUsageDescription` — "Curio uses the camera only when you choose to
     take a picture for your diary. Photos stay on this device."
   - `NSPhotoLibraryUsageDescription` — "So you can add a picture you already have."
   - `NSLocationWhenInUseUsageDescription` — "To note where a moment happened.
     Optional, and never shared."
5. Set the app icon from `icons/icon-1024.png`.
6. Run on a device, then **Product → Archive → Distribute App**.

## Review notes to include

Apple rejects thin web wrappers that add nothing. Say plainly what this adds:
offline-first bundled assets, durable local storage, camera capture, share-sheet
export, and no network calls at all. It is not a website in a box; it is a local
application whose UI happens to be built with web technology.

Because there is no account, no server and no analytics, the privacy answers are
short and all the same: **no data collected**.
