"""Generate Curio's social-preview and store artwork."""
from PIL import Image, ImageDraw, ImageFont
import os

DUSK = (29, 26, 43)
DUSK_HI = (47, 42, 66)
IVORY = (242, 235, 219)
INK = (42, 33, 24)
INK_SOFT = (109, 99, 80)
BRASS = (201, 162, 75)
ROSE = (184, 129, 126)


def font(size, bold=False, mono=False):
    candidates = (
        ["/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"] if mono else
        ["/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"] if bold else
        ["/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"]
    )
    for c in candidates:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


def backdrop(w, h):
    img = Image.new("RGB", (w, h), DUSK)
    d = ImageDraw.Draw(img)
    # gallery wall gradient
    for y in range(h):
        t = y / h
        c = tuple(int(DUSK_HI[i] + (DUSK[i] - DUSK_HI[i]) * min(1, t * 1.5)) for i in range(3))
        d.line([(0, y), (w, y)], fill=c)
    # two soft pools of light
    glow = Image.new("RGB", (w, h), DUSK)
    gd = ImageDraw.Draw(glow)
    for r in range(int(w * 0.55), 0, -6):
        a = 1 - r / (w * 0.55)
        c = tuple(int(DUSK[i] + (BRASS[i] - DUSK[i]) * a * 0.16) for i in range(3))
        gd.ellipse([w * 0.26 - r, h * 0.12 - r, w * 0.26 + r, h * 0.12 + r], fill=c)
    img = Image.blend(img, glow, 0.55)
    return img


def rounded(draw, box, r, fill):
    draw.rounded_rectangle(box, radius=r, fill=fill)


def og_image(w=1200, h=630):
    img = backdrop(w, h)
    d = ImageDraw.Draw(img)

    # left column: the pitch
    d.text((72, 92), "A PRIVATE MUSEUM OF ORDINARY DAYS",
           font=font(17, mono=True), fill=BRASS)
    d.text((70, 146), "A diary that", font=font(62, bold=True), fill=IVORY)
    d.text((70, 218), "writes itself.", font=font(62, bold=True), fill=BRASS)
    d.text((72, 316), "Works offline. No account, no server.",
           font=font(27), fill=(200, 194, 178))
    d.text((72, 356), "14 languages. Survives a lost phone.",
           font=font(27), fill=(200, 194, 178))

    # trust chips
    x = 72
    for label in ["OFFLINE", "NO ACCOUNT", "ENCRYPTED", "FREE"]:
        tw = d.textlength(label, font=font(15, mono=True))
        d.rounded_rectangle([x, 430, x + tw + 32, 470], radius=20,
                            outline=(90, 84, 110), width=1)
        d.text((x + 16, 442), label, font=font(15, mono=True), fill=(180, 174, 158))
        x += tw + 44

    # right: a floating placard
    cx, cy, cw, ch = 700, 150, 430, 250
    d.rounded_rectangle([cx + 6, cy + 12, cx + cw + 6, cy + ch + 12], radius=20, fill=(16, 14, 22))
    rounded(d, [cx, cy, cx + cw, cy + ch], 20, IVORY)
    d.text((cx + 30, cy + 28), "2026.207   ·   19:30", font=font(15, mono=True), fill=INK_SOFT)
    d.text((cx + 30, cy + 64), "ramen", font=font(36, bold=True), fill=INK)
    d.text((cx + 30, cy + 118), "After dark, ramen, and it", font=font(23), fill=(74, 66, 52))
    d.text((cx + 30, cy + 150), "did the job. You have had", font=font(23), fill=(74, 66, 52))
    d.text((cx + 30, cy + 182), "this 3 times. You are loyal.", font=font(23), fill=(74, 66, 52))

    # wordmark
    d.text((70, 540), "Curio", font=font(38, bold=True), fill=IVORY)
    return img


def feature_graphic(w=1024, h=500):
    """Google Play feature graphic."""
    img = backdrop(w, h)
    d = ImageDraw.Draw(img)
    d.text((64, 150), "Curio", font=font(76, bold=True), fill=IVORY)
    d.text((66, 250), "A diary that writes itself.", font=font(34), fill=BRASS)
    d.text((66, 306), "Offline. Private. Yours.", font=font(28), fill=(190, 184, 168))
    cx, cy, cw, ch = 640, 120, 330, 260
    d.rounded_rectangle([cx + 5, cy + 10, cx + cw + 5, cy + ch + 10], radius=18, fill=(16, 14, 22))
    rounded(d, [cx, cy, cx + cw, cy + ch], 18, IVORY)
    d.text((cx + 24, cy + 24), "2026.204   ·   07:12", font=font(13, mono=True), fill=INK_SOFT)
    d.text((cx + 24, cy + 54), "First light", font=font(30, bold=True), fill=INK)
    d.text((cx + 24, cy + 104), "Before the day started,", font=font(19), fill=(74, 66, 52))
    d.text((cx + 24, cy + 132), "you stood at the window", font=font(19), fill=(74, 66, 52))
    d.text((cx + 24, cy + 160), "for eleven minutes.", font=font(19), fill=(74, 66, 52))
    return img


if __name__ == "__main__":
    os.makedirs("store", exist_ok=True)
    og_image().save("og-image.png")
    feature_graphic().save("store/play-feature-graphic.png")
    print("og-image.png + store/play-feature-graphic.png written")
