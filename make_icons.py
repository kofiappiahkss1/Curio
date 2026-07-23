"""Generate Curio's app icons: a brass vitrine (display case) on museum dusk."""
from PIL import Image, ImageDraw

DUSK = (29, 26, 43)
DUSK_HI = (47, 42, 66)
BRASS = (201, 162, 75)
IVORY = (242, 235, 219)


def icon(size, maskable=False):
    S = size * 4  # supersample for smooth edges
    img = Image.new("RGB", (S, S), DUSK)
    d = ImageDraw.Draw(img)

    # soft light from top-left, like a lit gallery
    for i in range(S // 2, 0, -1):
        t = i / (S // 2)
        c = tuple(int(DUSK[j] + (DUSK_HI[j] - DUSK[j]) * t * 0.5) for j in range(3))
        d.ellipse([-i, -i, i, i], fill=c)

    pad = S * 0.30 if maskable else S * 0.22   # maskable needs a safe zone
    w = S - 2 * pad
    stroke = max(2, int(w * 0.075))

    # the vitrine: an arched display case
    left, right = pad, S - pad
    top, bottom = pad + w * 0.06, S - pad
    arch_h = w * 0.42

    d.arc([left, top, right, top + arch_h * 2], start=180, end=360,
          fill=BRASS, width=stroke)
    d.line([left, top + arch_h, left, bottom], fill=BRASS, width=stroke)
    d.line([right, top + arch_h, right, bottom], fill=BRASS, width=stroke)
    d.line([left, bottom, right, bottom], fill=BRASS, width=stroke)

    # the kept object inside, glowing
    cx, cy = S / 2, top + arch_h + w * 0.14
    r = w * 0.115
    for k in range(6, 0, -1):
        rr = r * (1 + k * 0.30)
        a = int(26 - k * 3)
        glow = tuple(int(DUSK[j] + (BRASS[j] - DUSK[j]) * (a / 100)) for j in range(3))
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=glow)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=IVORY)

    # plinth
    py = bottom - w * 0.10
    d.line([left + w * 0.18, py, right - w * 0.18, py], fill=BRASS, width=max(1, stroke // 2))

    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    for s in (180, 192, 512):
        icon(s).save(f"icons/icon-{s}.png")
    icon(512, maskable=True).save("icons/icon-maskable-512.png")
    icon(32).save("icons/favicon-32.png")
    print("icons written")
