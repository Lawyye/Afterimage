"""Фоны: масштаб до 1920x1080 (cover) с выбранным вертикальным сдвигом, WebP."""
import os, json
from PIL import Image, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'art-src/bg'); OUT = os.path.join(ROOT, 'assets/bg')
# вертикальный сдвиг кадра (0..200) в пикселях после масштабирования до 1920x1280; по умолчанию центр
OFFSET = {'courtyard': 60, 'dawn': 120, 'key_art': 100, 'cg_door': 90, 'cg_stairs': 60, 'cg_reading': 120, 'taxi': 100}
os.makedirs(OUT, exist_ok=True)
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.webp'): continue
    n = f[:-5]
    im = Image.open(os.path.join(SRC, f)).convert('RGB').resize((1920, 1280), Image.LANCZOS)
    oy = OFFSET.get(n, 100)
    im = im.crop((0, oy, 1920, oy + 1080)).filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=3))
    im.save(os.path.join(OUT, n + '.webp'), 'WEBP', quality=80, method=6)
json.dump(OFFSET, open(os.path.join(OUT, 'offsets.json'), 'w'))
print('bg ok')
