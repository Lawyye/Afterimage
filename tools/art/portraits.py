"""Сборка портретов в высоком качестве.

1) Нейросетевой апскейл x4 (Real-ESRGAN anime) каждого кадра эмоции (кэш .art-cache/up).
2) Восстановление исходного цвета: низкие частоты — из оригинала, детали — из апскейла.
3) Вклейки речи (рот) и моргания (глаза) — отдельными небольшими кадрами поверх основного.
4) Экспорт: основной кадр 900x1212 (1.5x экранного размера), накладки — вырезки того же масштаба.

python3 tools/art/portraits.py [персонаж ...]
"""
import sys, os, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PAN = os.path.join(ROOT, 'art-src/panels')
CACHE = os.path.join(ROOT, '.art-cache/up')
OUT = os.path.join(ROOT, 'assets/portraits')
TRIM = 3          # срез краёв кадра (в пикселях исходника)
OUT_W, OUT_H = 900, 1212
UP = 4

# координаты в пикселях исходного кадра: рот (cx, cy, rx, ry), глаза (cx, cy, rx, ry)
CFG = {
    'eva':     {'mouth': (205, 320, 40, 24), 'eyes': (195, 205, 92, 30), 'talk': ['neutral', 'sad', 'angry', 'smile', 'fear'], 'blink': ['neutral', 'sad', 'angry', 'smile']},
    'voron':   {'mouth': (180, 255, 44, 24), 'eyes': (150, 168, 80, 24), 'talk': ['warm', 'neutral', 'cold', 'sad'], 'blink': ['warm', 'neutral', 'cold', 'sad']},
    'kessler': {'mouth': (160, 285, 38, 22), 'eyes': (161, 188, 96, 50), 'talk': ['neutral', 'smirk', 'cold', 'calculating'], 'blink': ['neutral', 'smirk', 'cold', 'angry', 'calculating']},
    'leo':     {'mouth': (165, 300, 38, 22), 'eyes': (168, 190, 86, 30), 'talk': ['neutral', 'sad', 'suspicious', 'smile'], 'blink': ['neutral', 'sad', 'smile', 'suspicious']},
    'mira':    {'mouth': (160, 245, 36, 22), 'eyes': (168, 183, 80, 26), 'talk': ['neutral', 'smile', 'fear', 'plead'], 'blink': ['neutral', 'smile', 'plead']},
    'sonya':   {'mouth': (205, 275, 38, 24), 'eyes': (220, 197, 92, 40), 'talk': ['smile', 'worry', 'determined', 'sad'], 'blink': ['smile', 'worry', 'sad', 'determined']},
    'hass':    {'mouth': (225, 292, 42, 24), 'eyes': (225, 175, 88, 28), 'talk': ['neutral', 'smile', 'confused', 'sad'], 'blink': ['neutral', 'smile', 'sad', 'confused']},
}

def upscaled(ch, name):
    """x4-апскейл кадра с восстановлением цвета (кэшируется)."""
    os.makedirs(os.path.join(CACHE, ch), exist_ok=True)
    path = os.path.join(CACHE, ch, name + '.png')
    if os.path.exists(path):
        return Image.open(path).convert('RGB')
    from upscale import upscale
    src = Image.open(os.path.join(PAN, ch, name + '.png')).convert('RGB')
    up = upscale(src)
    # низкие частоты (цвет, градиенты, свет) — из оригинала
    up_a = np.asarray(up).astype(np.float32)
    big = np.asarray(src.resize(up.size, Image.BICUBIC)).astype(np.float32)
    r = 9
    lf_up = np.asarray(Image.fromarray(up_a.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32)
    lf_src = np.asarray(Image.fromarray(big.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32)
    res = Image.fromarray(np.clip(up_a + (lf_src - lf_up), 0, 255).astype(np.uint8))
    res.save(path)
    return res

# Кибер-глаз Кесслер пропал на части кадров: перекрашиваем радужку в золото (x, y, r в пикселях кадра)
GOLD_EYE = {('kessler', 'angry'): (220, 185, 12), ('kessler', 'surprised'): (215, 162, 13), ('kessler', 'calculating'): (220, 182, 11)}

def gold_iris(hi, x, y, r):
    a = np.asarray(hi).astype(np.float32) / 255.0
    H, W, _ = a.shape
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt((xx - x * UP) ** 2 + (yy - y * UP) ** 2) / (r * UP)
    m = np.clip((1.0 - d) / 0.25, 0, 1)
    L = a @ np.array([0.299, 0.587, 0.114], np.float32)
    sat = a.max(axis=2) - a.min(axis=2)
    keep = (L > 0.78) & (sat < 0.12)          # белок глаза и блики не трогаем
    m = m * (~keep)
    gold = np.stack([0.95 * L * 1.35, 0.72 * L * 1.35, 0.28 * L * 1.35], axis=2)
    gold = np.clip(gold + 0.05 * np.array([1.0, 0.6, 0.1]), 0, 1)
    out = a * (1 - m[..., None]) + gold * m[..., None]
    return Image.fromarray((out * 255).astype(np.uint8))

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

def gray(im):
    return np.asarray(im.convert('L')).astype(np.float32)

def patch_hi(base_lo, src_lo, base_hi, src_hi, region):
    """Вклейка области из src в base: сдвиг ищется на исходнике, вклейка — в x4."""
    cx, cy, rx, ry = region
    dx, dy = best_shift(gray(base_lo), gray(src_lo), cx, cy, rx, ry)
    shifted = Image.new('RGB', src_hi.size)
    shifted.paste(src_hi, (-dx * UP, -dy * UP))
    mask = Image.new('L', base_hi.size, 0)
    ImageDraw.Draw(mask).ellipse(((cx - rx) * UP, (cy - ry) * UP, (cx + rx) * UP, (cy + ry) * UP), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(min(rx, ry) * 0.28 * UP))
    return Image.composite(shifted, base_hi, mask)

def finish(hi):
    """Обрезка краёв и уменьшение до итогового размера."""
    t = TRIM * UP
    hi = hi.crop((t, t, hi.width - t, hi.height - t))
    return hi.resize((OUT_W, OUT_H), Image.LANCZOS)

def overlay_box(region, src_size):
    """Прямоугольник вклейки (с запасом на растушёвку) в координатах итогового кадра."""
    cx, cy, rx, ry = region
    w0, h0 = src_size[0] - 2 * TRIM, src_size[1] - 2 * TRIM
    sx, sy = OUT_W / w0, OUT_H / h0
    m = 1.25
    x0 = max(0, int((cx - rx * m - TRIM) * sx)); y0 = max(0, int((cy - ry * m - TRIM) * sy))
    x1 = min(OUT_W, int((cx + rx * m - TRIM) * sx) + 1); y1 = min(OUT_H, int((cy + ry * m - TRIM) * sy) + 1)
    return x0, y0, x1, y1

# кадры для фотографий в документах — с исходным фоном, без маски
PHOTO = {('sonya', 'smile'), ('sonya', 'laugh'), ('mira', 'smile')}

def save(im, name):
    im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=84, method=6, alpha_quality=90)

MATTE_CACHE = os.path.join(ROOT, '.art-cache/matte')
def alpha_for(ch, n, hi):
    """Маска персонажа (ISNet-anime) для кадра в x4, с кэшем; края слегка подтянуты."""
    os.makedirs(os.path.join(MATTE_CACHE, ch), exist_ok=True)
    path = os.path.join(MATTE_CACHE, ch, n + '.png')
    if os.path.exists(path):
        return Image.open(path).convert('L')
    from matte import matte
    m = np.asarray(matte(hi)).astype(np.float32) / 255.0
    m = np.clip((m - 0.04) / 0.9, 0, 1)
    a = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    a.save(path)
    return a

def with_alpha(rgb_hi, a_hi):
    im = rgb_hi.copy()
    im.putalpha(a_hi)
    return im

def main():
    only = sys.argv[1:]
    os.makedirs(OUT, exist_ok=True)
    man_path = os.path.join(OUT, 'manifest.json')
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {}
    for ch, cfg in CFG.items():
        if only and ch not in only: continue
        for f in os.listdir(OUT):
            if f.startswith(ch + '_'): os.remove(os.path.join(OUT, f))
        d = os.path.join(PAN, ch)
        names = sorted(os.path.splitext(f)[0] for f in os.listdir(d) if f.endswith('.png'))
        lo = {n: Image.open(os.path.join(d, n + '.png')).convert('RGB') for n in names}
        hi = {n: upscaled(ch, n) for n in names}
        for (c2, n), (gx, gy, gr) in GOLD_EYE.items():
            if c2 == ch and n in hi:
                hi[n] = gold_iris(hi[n], gx, gy, gr)
        entry = {'exprs': {}}
        for n in names:
            if n == 'talk': continue
            a_hi = alpha_for(ch, n, hi[n])
            base = finish(with_alpha(hi[n], a_hi))
            save(base, f'{ch}_{n}')
            if (ch, n) in PHOTO:
                save(finish(hi[n]).resize((600, 808), Image.LANCZOS), f'{ch}_{n}_photo')
            e = {}
            for kind, src, region, allowed in (('talk', 'talk', cfg['mouth'], cfg['talk']), ('blink', 'closed', cfg['eyes'], cfg['blink'])):
                if n not in allowed: continue
                p = finish(with_alpha(patch_hi(lo[n], lo[src], hi[n], hi[src], region), a_hi))
                box = overlay_box(region, lo[n].size)
                save(p.crop(box), f'{ch}_{n}_{kind}')
                x0, y0, x1, y1 = box
                e[kind] = [round(x0 / OUT_W * 100, 3), round(y0 / OUT_H * 100, 3), round((x1 - x0) / OUT_W * 100, 3), round((y1 - y0) / OUT_H * 100, 3)]
            entry['exprs'][n] = e
        manifest[ch] = entry
        print(ch, 'ok', len(entry['exprs']))
    json.dump(manifest, open(man_path, 'w'), indent=1, ensure_ascii=False)

main()
