"""Draws the Mochi app icon (1024 px) and writes mac/AppIcon.iconset PNGs. Run with PIL:
python3 mac/scripts/make-icon.py && iconutil -c icns mac/AppIcon.iconset -o mac/AppIcon.icns"""
import os
import sys
from PIL import Image, ImageDraw

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'AppIcon.iconset')
os.makedirs(out, exist_ok=True)
S = 1024
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
pad = 100  # macOS icons keep a margin around the rounded square
d.rounded_rectangle([pad, pad, S - pad, S - pad], radius=185, fill=(124, 92, 255, 255))
cream, ink, pink = (255, 247, 236, 255), (61, 43, 120, 255), (255, 158, 190, 255)


def sx(v):  # map the 1024 design of the toolbar icon into the padded square
    return pad + v * (S - 2 * pad) / S


d.polygon([(sx(250), sx(430)), (sx(300), sx(170)), (sx(470), sx(330))], fill=cream)
d.polygon([(sx(774), sx(430)), (sx(724), sx(170)), (sx(554), sx(330))], fill=cream)
d.polygon([(sx(290), sx(380)), (sx(315), sx(250)), (sx(410), sx(335))], fill=pink)
d.polygon([(sx(734), sx(380)), (sx(709), sx(250)), (sx(614), sx(335))], fill=pink)
d.ellipse([sx(170), sx(260), sx(854), sx(900)], fill=cream)
d.ellipse([sx(340), sx(520), sx(420), sx(610)], fill=ink)
d.ellipse([sx(604), sx(520), sx(684), sx(610)], fill=ink)
d.ellipse([sx(365), sx(535), sx(392), sx(562)], fill=(255, 255, 255, 255))
d.ellipse([sx(629), sx(535), sx(656), sx(562)], fill=(255, 255, 255, 255))
d.ellipse([sx(255), sx(640), sx(355), sx(700)], fill=(255, 158, 190, 200))
d.ellipse([sx(669), sx(640), sx(769), sx(700)], fill=(255, 158, 190, 200))
d.arc([sx(452), sx(620), sx(516), sx(690)], start=20, end=160, fill=ink, width=14)
d.arc([sx(508), sx(620), sx(572), sx(690)], start=20, end=160, fill=ink, width=14)

for size in (16, 32, 128, 256, 512):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(out, f'icon_{size}x{size}.png'))
    img.resize((size * 2, size * 2), Image.LANCZOS).save(os.path.join(out, f'icon_{size}x{size}@2x.png'))
