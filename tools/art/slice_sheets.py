"""Нарезка листов эмоций (4x2) из art-src/sheets в art-src/panels/<персонаж>/<эмоция>.png"""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXPR = {
    'eva': 'neutral,talk,closed,sad,fear,angry,shock,smile',
    'voron': 'warm,talk,closed,neutral,cold,angry,sad,cornered',
    'kessler': 'neutral,talk,closed,smirk,cold,angry,surprised,calculating',
    'leo': 'neutral,talk,closed,fear,angry,sad,smile,suspicious',
    'mira': 'neutral,talk,closed,fear,plead,smile,shock,cry',
    'sonya': 'smile,talk,closed,worry,fear,laugh,determined,sad',
    'hass': 'neutral,talk,closed,smile,confused,sad,surprised,cry',
}
SHEET = {'eva': 'eva8'}

def find_cuts(profile, n, total):
    boxes, prev = [], 0
    for i in range(1, n):
        a = total * i / n
        lo, hi = int(a - total * 0.04), int(a + total * 0.04)
        seg = profile[lo:hi]
        dark = np.where(seg < seg.min() + 6)[0]
        s, e = (lo + dark[0], lo + dark[-1]) if len(dark) else (int(a), int(a))
        boxes.append((prev, int(s))); prev = int(e) + 1
    boxes.append((prev, total))
    return boxes

def phase_shift(a, b):
    A, B = np.fft.fft2(a), np.fft.fft2(b)
    R = A * np.conj(B); R /= np.abs(R) + 1e-9
    r = np.fft.ifft2(R).real
    y, x = np.unravel_index(np.argmax(r), r.shape)
    if y > a.shape[0] // 2: y -= a.shape[0]
    if x > a.shape[1] // 2: x -= a.shape[1]
    return int(x), int(y)

for ch, names in EXPR.items():
    out = os.path.join(ROOT, 'art-src/panels', ch); os.makedirs(out, exist_ok=True)
    im = Image.open(os.path.join(ROOT, 'art-src/sheets', SHEET.get(ch, ch) + '.webp')).convert('RGB')
    arr = np.asarray(im).astype(np.float32).mean(axis=2)
    W, H = im.size
    xs, ys = find_cuts(arr.mean(axis=0), 4, W), find_cuts(arr.mean(axis=1), 2, H)
    pw, ph = min(b - a for a, b in xs), min(b - a for a, b in ys)
    panels = [im.crop((x0, y0, x0 + pw, y0 + ph)) for (y0, _) in ys for (x0, _) in xs]
    base = np.asarray(panels[0].convert('L')).astype(np.float32)
    for n, p in zip(names.split(','), panels):
        dx, dy = phase_shift(base, np.asarray(p.convert('L')).astype(np.float32))
        if abs(dx) > 12 or abs(dy) > 12: dx = dy = 0
        res = p.copy()
        if dx or dy:
            s = Image.new('RGB', p.size); s.paste(p, (dx, dy))
            m = Image.new('L', p.size, 0); m.paste(255, (max(0, dx), max(0, dy), p.size[0] + min(0, dx), p.size[1] + min(0, dy)))
            res = Image.composite(s, p, m)
        res.save(os.path.join(out, n + '.png'))
print('sliced')
