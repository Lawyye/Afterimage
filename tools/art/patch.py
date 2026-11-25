"""Накладка области (рот/глаза) из одного кадра на другой с локальным выравниванием.

python3 tools/art/patch.py <base.png> <src.png> <cx> <cy> <rx> <ry> <out.png> [search]
Сохраняет полный кадр с вклеенной областью (мягкая эллиптическая маска).
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

def best_shift(base, src, cx, cy, rx, ry, search):
    b = np.asarray(base.convert('L')).astype(np.float32)
    s = np.asarray(src.convert('L')).astype(np.float32)
    # сравниваем окрестность области, исключая сам рот (кольцо вокруг)
    x0, x1, y0, y1 = cx - rx * 2, cx + rx * 2, cy - ry * 2, cy + ry * 2
    ref = b[y0:y1, x0:x1]
    yy, xx = np.mgrid[y0:y1, x0:x1]
    ring = (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) > 1.2
    best, bs = 1e18, (0, 0)
    for dy in range(-search, search + 1):
        for dx in range(-search, search + 1):
            cand = s[y0 + dy:y1 + dy, x0 + dx:x1 + dx]
            if cand.shape != ref.shape: continue
            d = ((cand - ref) ** 2)[ring].mean()
            if d < best: best, bs = d, (dx, dy)
    return bs

def main():
    base, src = Image.open(sys.argv[1]).convert('RGB'), Image.open(sys.argv[2]).convert('RGB')
    cx, cy, rx, ry = map(int, sys.argv[3:7]); out = sys.argv[7]
    search = int(sys.argv[8]) if len(sys.argv) > 8 else 14
    dx, dy = best_shift(base, src, cx, cy, rx, ry, search)
    shifted = Image.new('RGB', src.size); shifted.paste(src, (-dx, -dy))
    mask = Image.new('L', base.size, 0)
    ImageDraw.Draw(mask).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(min(rx, ry) * 0.35))
    res = Image.composite(shifted, base, mask)
    res.save(out)
    print('shift', dx, dy)

main()
