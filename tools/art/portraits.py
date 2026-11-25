"""Сборка портретов: апскейл кадров, накладки речи (рот) и моргания (глаза).
python3 tools/art/portraits.py [check]
"""
import sys, os, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PAN = os.path.join(ROOT, 'art-src/panels')
OUT = os.path.join(ROOT, 'assets/portraits')
SCALE = 1.6
TRIM = 3  # срезаем края кадра (остатки разделителей)

# координаты (в пикселях кадра): рот (cx, cy, rx, ry), глаза (cx, cy, rx, ry)
CFG = {
    'eva':     {'mouth': (205, 320, 40, 24), 'eyes': (195, 205, 92, 30), 'talk': ['neutral', 'sad', 'angry', 'smile', 'fear'], 'blink': ['neutral', 'sad', 'angry', 'smile']},
    'voron':   {'mouth': (180, 255, 44, 24), 'eyes': (150, 168, 80, 24), 'talk': ['warm', 'neutral', 'cold', 'sad'], 'blink': ['warm', 'neutral', 'cold', 'sad']},
    'kessler': {'mouth': (160, 285, 38, 22), 'eyes': (161, 188, 96, 50), 'talk': ['neutral', 'smirk', 'cold', 'calculating'], 'blink': ['neutral', 'smirk', 'cold', 'angry', 'calculating']},
    'leo':     {'mouth': (165, 300, 38, 22), 'eyes': (168, 190, 86, 30), 'talk': ['neutral', 'sad', 'suspicious', 'smile'], 'blink': ['neutral', 'sad', 'smile', 'suspicious']},
    'mira':    {'mouth': (160, 245, 36, 22), 'eyes': (168, 183, 80, 26), 'talk': ['neutral', 'smile', 'fear', 'plead'], 'blink': ['neutral', 'smile', 'plead']},
    'sonya':   {'mouth': (205, 275, 38, 24), 'eyes': (220, 197, 92, 40), 'talk': ['smile', 'worry', 'determined', 'sad'], 'blink': ['smile', 'worry', 'sad', 'determined']},
    'hass':    {'mouth': (225, 292, 42, 24), 'eyes': (225, 175, 88, 28), 'talk': ['neutral', 'smile', 'confused', 'sad'], 'blink': ['neutral', 'smile', 'sad', 'confused']},
}

def best_shift(b, s, cx, cy, rx, ry, search=12):
    x0, x1, y0, y1 = cx - rx * 2, cx + rx * 2, cy - ry * 2, cy + ry * 2
    x0, y0 = max(x0, search), max(y0, search)
    x1, y1 = min(x1, b.shape[1] - search), min(y1, b.shape[0] - search)
    ref = b[y0:y1, x0:x1]
    yy, xx = np.mgrid[y0:y1, x0:x1]
    ring = (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) > 1.15
    best, bs = 1e18, (0, 0)
    for dy in range(-search, search + 1):
        for dx in range(-search, search + 1):
            cand = s[y0 + dy:y1 + dy, x0 + dx:x1 + dx]
            d = ((cand - ref) ** 2)[ring].mean()
            if d < best: best, bs = d, (dx, dy)
    return bs

def patch(base, src, region):
    cx, cy, rx, ry = region
    b = np.asarray(base.convert('L')).astype(np.float32)
    s = np.asarray(src.convert('L')).astype(np.float32)
    dx, dy = best_shift(b, s, cx, cy, rx, ry)
    shifted = Image.new('RGB', src.size); shifted.paste(src, (-dx, -dy))
    mask = Image.new('L', base.size, 0)
    ImageDraw.Draw(mask).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(min(rx, ry) * 0.28))
    return Image.composite(shifted, base, mask)

def finish(im):
    w, h = im.size
    im = im.crop((TRIM, TRIM, w - TRIM, h - TRIM))
    im = im.resize((round(im.size[0] * SCALE), round(im.size[1] * SCALE)), Image.LANCZOS)
    return im.filter(ImageFilter.UnsharpMask(radius=1.5, percent=55, threshold=2))

def main():
    check = len(sys.argv) > 1 and sys.argv[1] == 'check'
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    sheets = []
    for ch, cfg in CFG.items():
        d = os.path.join(PAN, ch)
        names = sorted(os.path.splitext(f)[0] for f in os.listdir(d) if f.endswith('.png'))
        talk = Image.open(os.path.join(d, 'talk.png')).convert('RGB')
        closed = Image.open(os.path.join(d, 'closed.png')).convert('RGB')
        entry = {'exprs': {}, }
        row = []
        for n in names:
            if n == 'talk': continue
            im = Image.open(os.path.join(d, n + '.png')).convert('RGB')
            e = {}
            out = finish(im)
            if not check: out.save(os.path.join(OUT, f'{ch}_{n}.webp'), 'WEBP', quality=82, method=6)
            if n in cfg['talk']:
                t = patch(im, talk, cfg['mouth'])
                if not check: finish(t).save(os.path.join(OUT, f'{ch}_{n}_talk.webp'), 'WEBP', quality=82, method=6)
                e['talk'] = True
                if check and n == cfg['talk'][0]: row.append(t)
            if n in cfg['blink']:
                bl = patch(im, closed, cfg['eyes'])
                if not check: finish(bl).save(os.path.join(OUT, f'{ch}_{n}_blink.webp'), 'WEBP', quality=82, method=6)
                e['blink'] = True
                if check and n == cfg['talk'][0]: row.append(bl)
            if check and n == cfg['talk'][0]: row.insert(0, im)
            entry['exprs'][n] = e
        manifest[ch] = entry
        if check: sheets.append(row)
    if check:
        W, H = 380, 510
        c = Image.new('RGB', (W * 3, H * len(sheets)))
        for i, r in enumerate(sheets):
            for j, im in enumerate(r[:3]): c.paste(im.crop((0, 0, W, H)), (j * W, i * H))
        c.save(sys.argv[2] if len(sys.argv) > 2 else '/tmp/check.png')
    else:
        json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
        print('portraits ok', sum(len(v['exprs']) for v in manifest.values()))

main()
