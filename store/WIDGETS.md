# Widgets and the watch

Home-screen widgets and watch apps **cannot be built with web technology** on
any platform. That's a hard limit, not a Curio one. So the work is split:

| Piece | Where it lives | Status |
|---|---|---|
| The data | `history.js` → `widgetSnapshot()` | ✅ built and tested |
| The bridge | `app.js` → `publishWidgetSnapshot()` | ✅ built |
| iOS widgets | `store/ios/CurioWidget.swift` | ✅ written, needs Xcode |
| watchOS app | `store/ios/CurioWatch.swift` | ✅ written, needs Xcode |
| Android widgets | `store/android/CurioWidget.kt` | ✅ written, needs Android Studio |

## How the data reaches a widget

The web app can't draw a widget, and a widget can't read a browser database.
So the web app publishes a small JSON snapshot, and the native shell carries it
across:

```
   web app                    native shell                widget
 ──────────                 ──────────────              ────────
 publishWidgetSnapshot() ─▶  WKScriptMessageHandler ─▶  App Group
                             (iOS)                       UserDefaults
                                                              │
                             JavascriptInterface ─▶     SharedPreferences
                             (Android)                        │
                                                              ▼
                                                        WidgetKit / Glance
```

The snapshot is deliberately tiny — a title, a placard, a streak count and one
historical event. Widgets are refreshed by the OS on its own schedule and
should never carry an archive.

```json
{ "v": 1, "locale": "en-GB",
  "history": { "year": 1969, "text": "…", "tag": "exploration", "yearsAgo": 57 },
  "diary": { "title": "A day around the harbour", "kept": 4, "streak": 12 } }
```

## The two widgets

**Today** — the day's title, its first placard, and the streak. Small, medium,
and a lock-screen rectangular variant.

**Today in History** — one event from the bundled almanac, chosen
deterministically so it stays put all day rather than shuffling each time you
glance. Small, medium, large, plus lock-screen inline.

## The watch

Shows the day's title, what's been kept, and the streak — then three buttons to
keep a moment without taking the phone out: voice, place, note. Tapping one
messages the phone to open that capture sheet.

## Building them

**iOS** — Xcode → New Target → Widget Extension named `CurioWidget`. Add the App
Group `group.app.curio.diary` to *both* the app and the widget target, then drop
in `CurioWidget.swift`. The watch is a second target using `CurioWatch.swift`.
The comments at the bottom of that file show the phone-side bridge.

**Android** — add `androidx.glance:glance-appwidget`, drop in `CurioWidget.kt`,
register both receivers in the manifest, and attach `CurioBridge` to the WebView
with `addJavascriptInterface(CurioBridge(this), "CurioNative")`.

Both read from disk only. Neither touches the network.
