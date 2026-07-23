"""
Curio — store screenshots.

Renders the six listing images at App Store and Play Store dimensions, drawn
from the same palette and type system the app itself uses, so the store page
and the product look like one thing.

    python3 make_screenshots.py
"""
from PIL import Image, ImageDraw, ImageFont
import os

# ---- the app's palette, verbatim ----
DUSK      = (29, 26, 43)
DUSK_2    = (37, 33, 53)
DUSK_3    = (47, 42, 66)
IVORY     = (242, 235, 219)
INK       = (42, 33, 24)
INK_SOFT  = (109, 99, 80)
INK_BODY  = (74, 66, 52)
BRASS     = (201, 162, 75)
BRASS_DP  = (168, 132, 47)
ROSE      = (184, 129, 126)
SAGE      = (143, 160, 138)
SLATE     = (125, 137, 168)
SEAL      = (58, 90, 69)
LINE      = (58, 53, 76)
MUTED     = (150, 145, 132)

SIZES = {
    "appstore-6.7": (1290, 2796),
    "appstore-6.1": (1179, 2556),
    "play-phone":   (1080, 1920),
}

FONT_DIR = "/usr/share/fonts/truetype/dejavu"


def F(size, bold=False, mono=False, italic=False):
    if mono:
        name = "DejaVuSansMono-Bold.ttf" if bold else "DejaVuSansMono.ttf"
    elif italic:
        name = "DejaVuSerif-Italic.ttf"
    else:
        name = "DejaVuSerif-Bold.ttf" if bold else "DejaVuSerif.ttf"
    path = os.path.join(FONT_DIR, name)
    if not os.path.exists(path):
        path = os.path.join(FONT_DIR, "DejaVuSerif.ttf")
    return ImageFont.truetype(path, size)


def wrap(draw, text, font, max_w):
    words, lines, line = str(text).split(), [], ""
    for w in words:
        t = (line + " " + w).strip()
        if draw.textlength(t, font=font) > max_w and line:
            lines.append(line)
            line = w
        else:
            line = t
    if line:
        lines.append(line)
    return lines


def gradient(img, top, bottom):
    d = ImageDraw.Draw(img)
    w, h = img.size
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (w, y)], fill=c)


def glow(img, cx, cy, radius, colour, strength=0.18):
    """A soft pool of light, drawn the way the app's radial gradients look."""
    w, h = img.size
    layer = img.copy()
    d = ImageDraw.Draw(layer)
    steps = 60
    for i in range(steps, 0, -1):
        r = radius * i / steps
        a = (1 - i / steps) * strength
        base = img.getpixel((min(w - 1, int(cx)), min(h - 1, int(cy))))
        c = tuple(int(base[j] + (colour[j] - base[j]) * a) for j in range(3))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)
    return Image.blend(img, layer, 0.65)


# ------------------------------------------------------------------ #
# building blocks that mirror the app's components
# ------------------------------------------------------------------ #
def placard(d, x, y, w, title, body, stamp, time_s, S, mood=None, tag=None, tag_col=None):
    """An ivory museum card, exactly as the app draws it."""
    pad = int(30 * S)
    tf, bf = F(int(38 * S), bold=True), F(int(28 * S))
    tl = wrap(d, title, tf, w - pad * 2)
    bl = wrap(d, body, bf, w - pad * 2)
    h = pad + int(24 * S) + len(tl) * int(48 * S) + int(10 * S) + len(bl) * int(40 * S) + pad
    if tag:
        h += int(38 * S)

    d.rounded_rectangle([x + int(4 * S), y + int(8 * S), x + w + int(4 * S), y + h + int(8 * S)],
                        radius=int(20 * S), fill=(18, 16, 26))
    d.rounded_rectangle([x, y, x + w, y + h], radius=int(20 * S), fill=IVORY)

    cy = y + pad
    d.text((x + pad, cy), stamp, font=F(int(17 * S), mono=True), fill=INK_SOFT)
    tw = d.textlength(time_s, font=F(int(17 * S), mono=True, bold=True))
    d.text((x + w - pad - tw, cy), time_s, font=F(int(17 * S), mono=True, bold=True), fill=BRASS_DP)
    cy += int(30 * S)

    for ln in tl:
        d.text((x + pad, cy), ln, font=tf, fill=INK)
        cy += int(48 * S)
    cy += int(10 * S)
    for ln in bl:
        d.text((x + pad, cy), ln, font=bf, fill=INK_BODY)
        cy += int(40 * S)

    if tag:
        tf2 = F(int(15 * S), mono=True, bold=True)
        tw2 = d.textlength(tag, font=tf2)
        d.rounded_rectangle([x + pad, cy + int(4 * S), x + pad + tw2 + int(22 * S), cy + int(32 * S)],
                            radius=int(6 * S), fill=tag_col or SLATE)
        d.text((x + pad + int(11 * S), cy + int(9 * S)), tag, font=tf2, fill=(255, 255, 255))
    return h


def rail(d, x, y, w, text, S):
    """The tracked, uppercase section label with its trailing hairline."""
    f = F(int(17 * S), mono=True, bold=True)
    d.text((x, y), text.upper(), font=f, fill=(150, 145, 132))
    tw = d.textlength(text.upper(), font=f)
    ly = y + int(11 * S)
    d.line([x + tw + int(16 * S), ly, x + w, ly], fill=LINE, width=max(1, int(1 * S)))
    return int(34 * S)


def toggle(d, x, y, S, on=True, sealed=False):
    w, h = int(52 * S), int(30 * S)
    bg = SEAL if sealed else (BRASS_DP if on else DUSK_3)
    d.rounded_rectangle([x, y, x + w, y + h], radius=h // 2, fill=bg, outline=LINE, width=1)
    kx = x + w - h + int(3 * S) if (on or sealed) else x + int(3 * S)
    knob = (207, 227, 214) if sealed else IVORY
    d.ellipse([kx, y + int(3 * S), kx + h - int(6 * S), y + h - int(3 * S)], fill=knob)
    return h


def setting_row(d, x, y, w, S, title, sub, on=True, sealed=False):
    d.text((x, y), title, font=F(int(27 * S), bold=True), fill=IVORY)
    d.text((x, y + int(34 * S)), sub.upper(), font=F(int(15 * S), mono=True), fill=(120, 115, 105))
    toggle(d, x + w - int(52 * S), y + int(6 * S), S, on=on, sealed=sealed)
    d.line([x, y + int(70 * S), x + w, y + int(70 * S)], fill=LINE, width=1)
    return int(88 * S)


# ------------------------------------------------------------------ #
# the six screens
# ------------------------------------------------------------------ #
def screen_today(d, x, y, w, h, S):
    cy = y
    # streak bar
    d.rounded_rectangle([x, cy, x + w, cy + int(84 * S)], radius=int(16 * S),
                        fill=DUSK_2, outline=LINE, width=1)
    d.text((x + int(24 * S), cy + int(20 * S)), "\u25cf", font=F(int(30 * S)), fill=BRASS)
    d.text((x + int(64 * S), cy + int(18 * S)), "12 days", font=F(int(28 * S), bold=True), fill=IVORY)
    d.text((x + int(64 * S), cy + int(52 * S)), "STREAK", font=F(int(15 * S), mono=True), fill=(130, 125, 115))
    bt = "BEST: 21"
    tw = d.textlength(bt, font=F(int(15 * S), mono=True, bold=True))
    d.rounded_rectangle([x + w - tw - int(46 * S), cy + int(24 * S), x + w - int(20 * S), cy + int(60 * S)],
                        radius=int(18 * S), outline=(120, 98, 48), width=1)
    d.text((x + w - tw - int(33 * S), cy + int(33 * S)), bt, font=F(int(15 * S), mono=True, bold=True), fill=BRASS)
    cy += int(112 * S)

    d.text((x, cy), "THURSDAY 23 JULY \u00b7 KIEL HARBOUR", font=F(int(17 * S), mono=True, bold=True), fill=(150, 145, 132))
    cy += int(34 * S)
    d.text((x, cy), "A day around", font=F(int(50 * S), bold=True), fill=IVORY)
    cy += int(58 * S)
    d.text((x, cy), "Kiel harbour", font=F(int(50 * S), bold=True), fill=IVORY)
    cy += int(62 * S)
    d.text((x, cy), "4 moments kept \u00b7 2 withheld", font=F(int(27 * S), italic=True), fill=(160, 154, 140))
    cy += int(52 * S)

    cy += rail(d, x, cy, w, "The day, in order", S)
    cy += placard(d, x, cy, w, "First light, black coffee",
                  "Before the day started, you stood at the window for eleven minutes.",
                  "2026.204", "07:12", S, tag="NOTE", tag_col=(154, 143, 111)) + int(20 * S)
    cy += placard(d, x, cy, w, "Kiel harbour, again",
                  "At the turn of the day, the harbour held you longer than you planned.",
                  "2026.206", "13:15", S, tag="PLACE", tag_col=SAGE) + int(20 * S)
    cy += placard(d, x, cy, w, "ramen",
                  "After dark, ramen, and it did the job. You have had this 3 times. You are loyal to it.",
                  "2026.207", "19:30", S, tag="MEAL", tag_col=(168, 114, 78)) + int(20 * S)
    placard(d, x, cy, w, "Time with Anna",
            "In the evening, time passed easily with Anna. 14 moments together now.",
            "2026.208", "19:35", S, tag="PERSON", tag_col=(160, 119, 111))


def screen_onthisday(d, x, y, w, h, S):
    cy = y
    box_h = int(430 * S)
    d.rounded_rectangle([x, cy, x + w, cy + box_h], radius=int(20 * S),
                        fill=(52, 45, 62), outline=(120, 98, 48), width=1)
    px = x + int(26 * S)
    d.text((px, cy + int(24 * S)), "ON THIS DAY", font=F(int(18 * S), mono=True, bold=True), fill=BRASS)
    iy = cy + int(66 * S)
    for ago, title, body in [
        ("A YEAR AGO", "The long walk home", "In the evening, you took the slow way back and let it take an hour."),
        ("2 YEARS AGO", "ramen with Anna", "After dark, time passed easily with Anna."),
    ]:
        d.text((px, iy), ago, font=F(int(15 * S), mono=True), fill=(150, 145, 132))
        iy += int(28 * S)
        d.text((px, iy), title, font=F(int(32 * S), bold=True), fill=IVORY)
        iy += int(42 * S)
        for ln in wrap(d, body, F(int(25 * S)), w - int(52 * S)):
            d.text((px, iy), ln, font=F(int(25 * S)), fill=(178, 172, 158))
            iy += int(34 * S)
        iy += int(18 * S)
        d.line([px, iy, x + w - int(26 * S), iy], fill=(96, 80, 52), width=1)
        iy += int(22 * S)
    cy += box_h + int(40 * S)

    cy += rail(d, x, cy, w, "Not long ago", S)
    d.rounded_rectangle([x, cy, x + w, cy + int(190 * S)], radius=int(20 * S),
                        fill=(52, 45, 62), outline=(120, 98, 48), width=1)
    d.text((x + int(26 * S), cy + int(26 * S)), "A WEEK AGO", font=F(int(15 * S), mono=True), fill=(150, 145, 132))
    d.text((x + int(26 * S), cy + int(54 * S)), "Time at the coast", font=F(int(32 * S), bold=True), fill=IVORY)
    ly = cy + int(102 * S)
    for ln in wrap(d, "In the afternoon, the coast held you longer than you planned.",
                   F(int(25 * S)), w - int(52 * S)):
        d.text((x + int(26 * S), ly), ln, font=F(int(25 * S)), fill=(178, 172, 158))
        ly += int(34 * S)


def screen_recovery(d, x, y, w, h, S):
    cy = y
    # the seal
    box_h = int(300 * S)
    d.rounded_rectangle([x, cy, x + w, cy + box_h], radius=int(20 * S), fill=(34, 44, 40), outline=LINE, width=1)
    ecx, ecy, r = x + w // 2, cy + int(70 * S), int(38 * S)
    d.ellipse([ecx - r - int(8 * S), ecy - r - int(8 * S), ecx + r + int(8 * S), ecy + r + int(8 * S)], fill=(42, 62, 50))
    d.ellipse([ecx - r, ecy - r, ecx + r, ecy + r], fill=(50, 76, 60))
    lw = int(6 * S)
    d.rounded_rectangle([ecx - int(19 * S), ecy - int(2 * S), ecx + int(19 * S), ecy + int(24 * S)],
                        radius=int(5 * S), outline=(166, 203, 179), width=lw)
    d.arc([ecx - int(13 * S), ecy - int(24 * S), ecx + int(13 * S), ecy + int(6 * S)],
          start=180, end=360, fill=(166, 203, 179), width=lw)
    ty = cy + int(140 * S)
    d.text((x + w // 2 - d.textlength("So you never lose this", font=F(int(34 * S), bold=True)) // 2, ty),
           "So you never lose this", font=F(int(34 * S), bold=True), fill=IVORY)
    ty += int(48 * S)
    for ln in wrap(d, "Your whole archive, sealed with a passphrase only you know.",
                   F(int(24 * S)), w - int(90 * S)):
        d.text((x + w // 2 - d.textlength(ln, font=F(int(24 * S))) // 2, ty), ln,
               font=F(int(24 * S)), fill=(170, 180, 172))
        ty += int(34 * S)
    cy += box_h + int(40 * S)

    # fingerprint
    cy += rail(d, x, cy, w, "Passphrase check", S)
    d.rounded_rectangle([x, cy, x + w, cy + int(86 * S)], radius=int(16 * S), fill=DUSK_3, outline=LINE, width=1)
    fp = "10A0-A19F"
    d.text((x + w // 2 - d.textlength(fp, font=F(int(34 * S), mono=True, bold=True)) // 2, cy + int(26 * S)),
           fp, font=F(int(34 * S), mono=True, bold=True), fill=BRASS)
    cy += int(112 * S)

    # buttons
    for label, primary in [("Save a Recovery Kit", True), ("Back up automatically", False),
                           ("Restore on this device", False)]:
        bh = int(80 * S)
        if primary:
            d.rounded_rectangle([x, cy, x + w, cy + bh], radius=int(15 * S), fill=BRASS)
            col, fill_txt = INK, BRASS
        else:
            d.rounded_rectangle([x, cy, x + w, cy + bh], radius=int(15 * S), fill=DUSK_2, outline=LINE, width=1)
            col = IVORY
        f = F(int(22 * S), mono=True, bold=True)
        d.text((x + w // 2 - d.textlength(label.upper(), font=f) // 2, cy + int(28 * S)),
               label.upper(), font=f, fill=col)
        cy += bh + int(18 * S)

    cy += int(14 * S)
    note_h = int(150 * S)
    d.rounded_rectangle([x, cy, x + w, cy + note_h], radius=int(16 * S), fill=(46, 42, 34), outline=(120, 98, 48), width=1)
    ny = cy + int(24 * S)
    d.text((x + int(24 * S), ny), "New phone?", font=F(int(26 * S), bold=True), fill=BRASS)
    ny += int(38 * S)
    for ln in wrap(d, "Choose your kit, type the passphrase, and everything is back \u2014 merged, not overwritten.",
                   F(int(23 * S)), w - int(48 * S)):
        d.text((x + int(24 * S), ny), ln, font=F(int(23 * S)), fill=(190, 184, 168))
        ny += int(32 * S)


def screen_vault(d, x, y, w, h, S):
    cy = y
    cy += rail(d, x, cy, w, "What Curio may keep", S) + int(6 * S)
    for t, s_ in [("Photos", "Pictures you keep"), ("Places", "Where the day happened"),
                  ("Meals", "What you ate"), ("People", "Who you were with")]:
        cy += setting_row(d, x, cy, w, S, t, s_, on=True)
    cy += int(28 * S)
    cy += rail(d, x, cy, w, "Off-limits \u00b7 never kept", S) + int(6 * S)
    for t in ["Banking", "Health", "Messages", "Passwords"]:
        cy += setting_row(d, x, cy, w, S, t, "Sealed \u2014 cannot be turned on", sealed=True)

    cy += int(24 * S)
    nh = int(210 * S)
    d.rounded_rectangle([x, cy, x + w, cy + nh], radius=int(16 * S), fill=(46, 42, 34), outline=(120, 98, 48), width=1)
    ny = cy + int(26 * S)
    d.text((x + int(26 * S), ny), "The rule that makes this safe", font=F(int(27 * S), bold=True), fill=BRASS)
    ny += int(44 * S)
    for ln in wrap(d, "If something you write looks like one of these, it is refused before it is ever written down \u2014 and shown to you as withheld.",
                   F(int(24 * S)), w - int(52 * S)):
        d.text((x + int(26 * S), ny), ln, font=F(int(24 * S)), fill=(190, 184, 168))
        ny += int(34 * S)


def screen_threads(d, x, y, w, h, S):
    cy = y
    # stat grid
    gap = int(18 * S)
    cw = (w - gap) // 2
    for i, (v, k) in enumerate([("284", "MOMENTS"), ("96", "DAYS"), ("71", "PHOTOS"), ("4.1", "AVERAGE MOOD")]):
        gx = x + (i % 2) * (cw + gap)
        gy = cy + (i // 2) * (int(130 * S) + gap)
        d.rounded_rectangle([gx, gy, gx + cw, gy + int(130 * S)], radius=int(16 * S),
                            fill=DUSK_2, outline=LINE, width=1)
        d.text((gx + int(24 * S), gy + int(26 * S)), v, font=F(int(48 * S), bold=True), fill=BRASS)
        d.text((gx + int(24 * S), gy + int(88 * S)), k, font=F(int(15 * S), mono=True), fill=(130, 125, 115))
    cy += int(130 * S) * 2 + gap + int(40 * S)

    cy += rail(d, x, cy, w, "What lifts your days", S)
    for label, val, up in [("the harbour", "+0.9", True), ("Anna", "+0.7", True),
                           ("the long meeting", "\u22120.6", False)]:
        d.text((x, cy + int(4 * S)), label, font=F(int(28 * S)), fill=IVORY)
        f = F(int(22 * S), mono=True, bold=True)
        tw = d.textlength(val, font=f)
        d.text((x + w - tw, cy + int(8 * S)), val, font=f, fill=SAGE if up else ROSE)
        cy += int(46 * S)
        d.line([x, cy, x + w, cy], fill=LINE, width=1)
        cy += int(18 * S)
    cy += int(24 * S)

    for n, kind, title, body in [
        ("6", "PLACES \u00b7 SO FAR", "The map you actually walk",
         "6 different places kept. You return to the harbour most."),
        ("19h", "A HABIT \u00b7 BY THE CLOCK", "Your day has a hinge",
         "More of your kept moments happen around 19:00 than any other hour. You never decided that."),
    ]:
        tf, bf = F(int(32 * S), bold=True), F(int(24 * S))
        bl = wrap(d, body, bf, w - int(150 * S))
        bh = int(52 * S) + int(44 * S) + len(bl) * int(34 * S) + int(32 * S)
        d.rounded_rectangle([x, cy, x + w, cy + bh], radius=int(18 * S), fill=DUSK_3, outline=LINE, width=1)
        nf = F(int(52 * S), bold=True)
        d.text((x + w - int(26 * S) - d.textlength(n, font=nf), cy + int(22 * S)), n, font=nf, fill=BRASS)
        d.text((x + int(26 * S), cy + int(24 * S)), kind, font=F(int(15 * S), mono=True), fill=(130, 125, 115))
        d.text((x + int(26 * S), cy + int(52 * S)), title, font=tf, fill=IVORY)
        ly = cy + int(102 * S)
        for ln in bl:
            d.text((x + int(26 * S), ly), ln, font=bf, fill=(178, 172, 158))
            ly += int(34 * S)
        cy += bh + int(20 * S)


def screen_languages(d, x, y, w, h, S):
    cy = y
    cy += rail(d, x, cy, w, "The same moment, in five voices", S) + int(8 * S)
    rows = [
        ("EN", "After dark, ramen, and it did the job. You have had this 3 times."),
        ("PIDGIN", "Before afternoon, ramen, e do the work. You don chop dis one 3 times."),
        ("KISWAHILI", "Katikati ya asubuhi, ramen, na ilitosha. Umekula hiki mara 3."),
        ("ESPANOL", "Al anochecer, ramen, y cumplio. Lo has comido 3 veces."),
        ("DEUTSCH", "Am Abend, ramen, und es hat gereicht. Du hattest das 3-mal."),
    ]
    for code, line in rows:
        bf = F(int(25 * S))
        bl = wrap(d, line, bf, w - int(200 * S))
        bh = int(34 * S) + len(bl) * int(34 * S)
        d.rounded_rectangle([x, cy, x + w, cy + bh], radius=int(14 * S), fill=DUSK_2, outline=LINE, width=1)
        d.text((x + int(22 * S), cy + int(20 * S)), code, font=F(int(16 * S), mono=True, bold=True), fill=BRASS)
        ly = cy + int(16 * S)
        for ln in bl:
            d.text((x + int(180 * S), ly), ln, font=bf, fill=(200, 194, 178))
            ly += int(34 * S)
        cy += bh + int(16 * S)

    cy += int(28 * S)
    cy += rail(d, x, cy, w, "Fourteen, including dialects", S) + int(6 * S)
    chips = ["English UK", "English US", "Naija Pidgin", "Espanol ES", "Espanol LATAM",
             "Portugues BR", "Francais", "Deutsch", "Kiswahili", "isiZulu", "Hindi", "Chinese", "Japanese"]
    cxp, f = x, F(int(23 * S))
    for c in chips:
        tw = d.textlength(c, font=f) + int(34 * S)
        if cxp + tw > x + w:
            cxp = x
            cy += int(62 * S)
        d.rounded_rectangle([cxp, cy, cxp + tw, cy + int(50 * S)], radius=int(25 * S),
                            fill=DUSK_2, outline=LINE, width=1)
        d.text((cxp + int(17 * S), cy + int(12 * S)), c, font=f, fill=(190, 184, 168))
        cxp += tw + int(12 * S)


SCREENS = [
    ("01-writes-itself", "It writes the entry for you.", "No blank page. Ever.", screen_today),
    ("02-on-this-day", "A year later, the day comes back.", "Unasked, and exactly when it lands hardest.", screen_onthisday),
    ("03-recovery", "Lose the phone. Keep the diary.", "One encrypted kit. Any device. Seconds.", screen_recovery),
    ("04-sealed", "Four things it will never record.", "Refused before they are written down.", screen_vault),
    ("05-threads", "Patterns you would never notice.", "Counted on your phone, by nobody else.", screen_threads),
    ("06-languages", "Written in your language.", "Composed natively \u2014 not translated.", screen_languages),
]


def render(name, headline, subline, painter, size):
    W, H = size
    S = W / 1080.0                      # scale factor, tuned against the 1080 design

    img = Image.new("RGB", (W, H), DUSK)
    gradient(img, (43, 37, 64), (17, 15, 24))
    img = glow(img, W * 0.22, H * 0.06, W * 0.9, BRASS, 0.13)
    img = glow(img, W * 0.85, H * 0.42, W * 0.7, ROSE, 0.10)
    d = ImageDraw.Draw(img)

    M = int(66 * S)
    # ---- caption ----
    y = int(96 * S)
    d.text((M, y), "CURIO", font=F(int(22 * S), mono=True, bold=True), fill=BRASS)
    y += int(46 * S)
    hf = F(int(58 * S), bold=True)
    for ln in wrap(d, headline, hf, W - M * 2):
        d.text((M, y), ln, font=hf, fill=IVORY)
        y += int(70 * S)
    y += int(8 * S)
    sf = F(int(28 * S), italic=True)
    for ln in wrap(d, subline, sf, W - M * 2):
        d.text((M, y), ln, font=sf, fill=(165, 159, 146))
        y += int(38 * S)

    # ---- the device ----
    top = y + int(52 * S)
    dev_x, dev_w = M, W - M * 2
    dev_h = H - top - int(70 * S)
    d.rounded_rectangle([dev_x, top, dev_x + dev_w, top + dev_h],
                        radius=int(44 * S), fill=DUSK, outline=(70, 64, 92), width=max(2, int(3 * S)))

    inner = Image.new("RGB", (dev_w - int(4 * S), dev_h - int(4 * S)), DUSK)
    gradient(inner, (34, 30, 50), (25, 22, 37))
    idr = ImageDraw.Draw(inner)

    pad = int(40 * S)
    painter(idr, pad, int(58 * S), inner.width - pad * 2, inner.height, S)

    # fade the bottom so content appears to continue
    fade_h = int(190 * S)
    for i in range(fade_h):
        t = i / fade_h
        yy = inner.height - fade_h + i
        row = inner.crop((0, yy, inner.width, yy + 1)).load()
        base = (25, 22, 37)
        line = Image.new("RGB", (inner.width, 1))
        lp = line.load()
        for xx in range(inner.width):
            c = row[xx, 0]
            lp[xx, 0] = tuple(int(c[j] + (base[j] - c[j]) * t) for j in range(3))
        inner.paste(line, (0, yy))

    mask = Image.new("L", inner.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, inner.width, inner.height],
                                           radius=int(42 * S), fill=255)
    img.paste(inner, (dev_x + int(2 * S), top + int(2 * S)), mask)
    return img


if __name__ == "__main__":
    out = "store/screenshots"
    os.makedirs(out, exist_ok=True)
    made = 0
    for label, size in SIZES.items():
        folder = os.path.join(out, label)
        os.makedirs(folder, exist_ok=True)
        for name, head, sub, painter in SCREENS:
            im = render(name, head, sub, painter, size)
            im.save(os.path.join(folder, f"{name}.png"))
            made += 1
    print(f"{made} screenshots written to {out}/")
