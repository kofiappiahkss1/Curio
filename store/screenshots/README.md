# Screenshots

Eighteen images: six screens at three sizes, generated from the app's own
palette and type system so the store page and the product look like one thing.

Regenerate any time with:

```bash
python3 make_screenshots.py
```

## Sizes

| Folder | Pixels | Where it goes |
|---|---|---|
| `appstore-6.7/` | 1290 × 2796 | App Store Connect — iPhone 6.7" (required) |
| `appstore-6.1/` | 1179 × 2556 | App Store Connect — iPhone 6.1" |
| `play-phone/` | 1080 × 1920 | Google Play — phone screenshots |

Apple accepts the 6.7" set for every newer iPhone size, so the 6.7" folder alone
satisfies a submission. Play requires at least two; upload all six.

## The order matters

Store pages are judged in about three seconds, and most people see only the
first two images. These are sequenced so the argument survives that.

1. **It writes the entry for you.** The whole product in one image. This is the
   only screenshot most people will ever look at.
2. **A year later, the day comes back.** The reason anyone keeps a diary at all.
3. **Lose the phone. Keep the diary.** Answers the objection every "no cloud"
   app runs into.
4. **Four things it will never record.** Turns privacy from a claim into a
   visible mechanism.
5. **Patterns you would never notice.** The payoff for staying.
6. **Written in your language.** The wedge no competitor is contesting.

## If you change the copy

Headlines live in the `SCREENS` list at the bottom of `make_screenshots.py`.
Keep them short — six words or fewer survives a thumbnail. Keep the promise
concrete: "It writes the entry for you" outperforms "AI-powered journaling"
because it says what happens rather than what it is.
