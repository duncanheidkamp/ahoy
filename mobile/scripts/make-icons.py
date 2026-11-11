#!/usr/bin/env python3
"""Generate Ahoy's app icon, adaptive icon, splash and notification assets.

    python3 scripts/make-icons.py        # from mobile/, needs Pillow

Everything is drawn from code so it can be regenerated or tweaked: the PWA's
white condensed AHOY wordmark (public/icons/icon-512.png) on the ocean
palette with teal waves, plus a simple anchor for the tiny monochrome
notification icon. Colors mirror theme.ts (palette). Writes 1024x1024
sources to assets/images/ (96x96 for the notification icon); Expo generates
every platform size from these at prebuild.

Font: Bebas Neue (SIL OFL, scripts/fonts/), the closest free match to the
PWA wordmark. It is only used here, never bundled into the app.
"""

import math
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'images')
FONT = os.path.join(HERE, 'fonts', 'BebasNeue_400Regular.ttf')

S = 1024
SS = 2  # supersampling for smooth edges

OCEAN900 = (0x0C, 0x4A, 0x6E)
OCEAN700 = (0x03, 0x69, 0xA1)
TEAL600 = (0x0D, 0x94, 0x88)
TEAL500 = (0x14, 0xB8, 0xA6)
PARCHMENT100 = (0xFE, 0xF3, 0xC7)
WHITE = (255, 255, 255)


def canvas(size=S, color=(0, 0, 0, 0)):
    return Image.new('RGBA', (size * SS, size * SS), color)


def finish(img, size=S):
    return img.resize((size, size), Image.LANCZOS)


def gradient(size=S):
    """Vertical ocean gradient, lighter at the top."""
    img = canvas(size)
    px = img.load()
    h = size * SS
    for y in range(h):
        t = y / (h - 1)
        c = tuple(round(OCEAN700[i] + (OCEAN900[i] - OCEAN700[i]) * t) for i in range(3)) + (255,)
        for x in range(h):
            px[x, y] = c
    return img


def wave_band(size, top, amplitude, wavelength, phase, color):
    """A filled sine wave from `top` (fraction of height) to the bottom edge."""
    w = size * SS
    pts = []
    for x in range(0, w + 1, 4):
        y = top * w + amplitude * SS * math.sin(2 * math.pi * (x / (wavelength * SS)) + phase)
        pts.append((x, y))
    pts += [(w, w), (0, w)]
    layer = canvas(size)
    ImageDraw.Draw(layer).polygon(pts, fill=color)
    return layer


def waves(size, colors, top=0.76):
    """Two overlapping wave bands across the bottom."""
    layer = canvas(size)
    back, front = colors
    layer.alpha_composite(wave_band(size, top, 22, 300, 0.6, back))
    layer.alpha_composite(wave_band(size, top + 0.07, 18, 240, 2.4, front))
    return layer


def wordmark(size, color, width_frac, center_y=0.45, text='AHOY'):
    """The AHOY wordmark, scaled to `width_frac` of the canvas width."""
    layer = canvas(size)
    d = ImageDraw.Draw(layer)
    target_w = width_frac * size * SS
    font_size = 100
    font = ImageFont.truetype(FONT, font_size)
    # Scale the font so the inked width matches the target.
    l, t, r, b = d.textbbox((0, 0), text, font=font)
    font_size = int(font_size * target_w / (r - l))
    font = ImageFont.truetype(FONT, font_size)
    l, t, r, b = d.textbbox((0, 0), text, font=font)
    x = (size * SS - (r - l)) / 2 - l
    y = center_y * size * SS - (b - t) / 2 - t
    d.text((x, y), text, font=font, fill=color)
    return layer


def rounded_mask(size, radius_frac=0.2237):
    m = Image.new('L', (size * SS, size * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size * SS - 1, size * SS - 1), radius=radius_frac * size * SS, fill=255)
    return m


def anchor(size, color):
    """Clean anchor silhouette: ring, stock, shank, curved arms with flukes.
    Drawn inside the middle ~84% so Android's status bar icon keeps padding."""
    layer = canvas(size)
    d = ImageDraw.Draw(layer)
    u = size * SS / 100  # 1 unit = 1% of the canvas
    cx = 50 * u
    # ring
    d.ellipse((cx - 8 * u, 8 * u, cx + 8 * u, 24 * u), outline=color, width=round(4.5 * u))
    # stock (crossbar)
    d.rounded_rectangle((cx - 18 * u, 28 * u, cx + 18 * u, 34 * u), radius=3 * u, fill=color)
    # shank
    d.rounded_rectangle((cx - 4 * u, 22 * u, cx + 4 * u, 90 * u), radius=3 * u, fill=color)
    # arms: thick arc along the bottom, ends at ~(cx +/- 31, 70)
    d.arc((cx - 34 * u, 36 * u, cx + 34 * u, 92 * u), start=25, end=155, fill=color, width=round(7 * u))
    # flukes: arrowheads on the arm tips, pointing up and out
    for sign in (-1, 1):
        d.polygon(
            [
                (cx + sign * 38 * u, 58 * u),  # point
                (cx + sign * 25 * u, 66 * u),  # inner barb
                (cx + sign * 34 * u, 76 * u),  # outer barb
            ],
            fill=color,
        )
    return layer


def save(img, name):
    path = os.path.join(OUT, name)
    img.save(path, optimize=True)
    print('wrote', os.path.relpath(path, os.path.join(HERE, '..')), img.size, img.mode)


def main():
    os.makedirs(OUT, exist_ok=True)
    white = WHITE + (255,)

    # iOS light / default icon: opaque, square (iOS applies the mask).
    light = gradient()
    light.alpha_composite(waves(S, (TEAL600 + (150,), TEAL500 + (200,))))
    light.alpha_composite(wordmark(S, white, 0.72))
    save(finish(light).convert('RGB'), 'icon.png')

    # iOS dark: transparent background (the system supplies the dark backdrop),
    # parchment wordmark, teal waves.
    dark = canvas()
    dark.alpha_composite(waves(S, (TEAL600 + (170,), TEAL500 + (230,))))
    dark.alpha_composite(wordmark(S, PARCHMENT100 + (255,), 0.72))
    save(finish(dark), 'icon-dark.png')

    # iOS tinted: grayscale on transparent; the system tints it.
    tinted = canvas()
    tinted.alpha_composite(waves(S, ((110, 110, 110, 170), (160, 160, 160, 230))))
    tinted.alpha_composite(wordmark(S, white, 0.72))
    save(finish(tinted).convert('LA').convert('RGBA'), 'icon-tinted.png')

    # Android adaptive icon (108dp canvas, 66dp safe circle -> keep the mark
    # inside the middle ~60%). Waves live in the background layer.
    bg = gradient()
    bg.alpha_composite(waves(S, (TEAL600 + (150,), TEAL500 + (200,)), top=0.72))
    save(finish(bg).convert('RGB'), 'android-icon-background.png')

    fg = canvas()
    fg.alpha_composite(wordmark(S, white, 0.50, center_y=0.48))
    save(finish(fg), 'android-icon-foreground.png')

    mono = canvas()
    mono.alpha_composite(wordmark(S, white, 0.50, center_y=0.48))
    save(finish(mono), 'android-icon-monochrome.png')

    # Splash: wordmark only, per appearance (backgrounds come from app.config).
    # Kept narrow so Android 12+'s circular splash-icon mask never clips it.
    for name, color, wave in (
        ('splash-icon-light.png', OCEAN900 + (255,), TEAL600 + (255,)),
        ('splash-icon-dark.png', PARCHMENT100 + (255,), TEAL500 + (255,)),
    ):
        sp = canvas()
        sp.alpha_composite(wordmark(S, color, 0.56, center_y=0.46))
        d = ImageDraw.Draw(sp)
        w = S * SS
        pts = [(x, 0.66 * w + 14 * SS * math.sin(2 * math.pi * x / (170 * SS))) for x in range(int(0.26 * w), int(0.74 * w), 4)]
        d.line(pts, fill=wave, width=14 * SS, joint='curve')
        save(finish(sp), name)

    # Android notification icon: white silhouette on transparent, 96x96.
    note = anchor(96 * 4, white)
    save(note.resize((96, 96), Image.LANCZOS), 'notification-icon.png')

    # Big anchor preview for checking the shape (not referenced by the app).
    if os.environ.get('AHOY_ICON_PREVIEW'):
        save(finish(anchor(S, white)), 'anchor-preview.png')


if __name__ == '__main__':
    main()
