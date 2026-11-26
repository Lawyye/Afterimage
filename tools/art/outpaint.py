"""Тела, дорисованные моделью прямо от бюста (Weave / Nano Banana), → тела и головы для игры.

Вход:  art-src/outpaint/<id>_in.png   — бюст на высоком холсте (то, что получила модель), inputs.json
       art-src/outpaint/<id>_out.png  — ответ модели: тот же персонаж до колен
Выход: assets/bodies/<id>.webp, assets/bodies/bodies.json, assets/portraits/<id>_<expr>_head.webp

Голова модели и наш бюст совпадают по месту, потому что модель продолжала именно этот рисунок;
небольшой сдвиг/масштаб, если модель его допустила, находится автоматически (поиск по лицу).
Головы эмоций кладутся поверх ровно туда, где у модели голова, шея и плечи — общий рисунок, шва нет.

python3 tools/art/outpaint.py [<id> ...] [--preview]
"""
import sys, os, json
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bodies import unfade

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'art-src/outpaint')
PORT = os.path.join(ROOT, 'assets/portraits')
OUT = os.path.join(ROOT, 'assets/bodies')
CACHE = os.path.join(ROOT, '.art-cache/outpaint')
HF = {'voron': 1.0, 'eva': 0.94, 'mira': 0.92, 'sonya': 0.91, 'leo': 0.99, 'kessler': 0.97, 'hass': 0.98}
# доля высоты бюста, ниже которой наша голова плавно уступает рисунку модели (там уже только одежда)
KEEP = 0.66


def matte(im):
    from matte import matte as isnet
    m = np.asarray(isnet(im.convert('RGB'))).astype(np.float32) / 255.0
    m = np.clip((m - 0.04) / 0.9, 0, 1)
    out = im.convert('RGBA')
    out.putalpha(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)))
    return out


def gray(im):
    return np.asarray(im.convert('L'), dtype=np.float32)


def locate(out_rgb, bust, s0, x0, y0):
    """Где модель оставила голову: перебор масштаба и сдвига вокруг исходного места по лицу (верх бюста)."""
    face = bust.crop((150, 150, 750, 760))
    best = None
    for ds in np.linspace(-0.06, 0.06, 13):
        s = s0 * (1 + ds)
        f = face.resize((round(600 * s), round(610 * s)), Image.LANCZOS)
        fg = gray(f.convert('RGB'))
        fa = np.asarray(f.getchannel('A'), dtype=np.float32) / 255
        fx, fy = x0 + 150 * s, y0 + 150 * s
        H, W = fg.shape
        for dy in range(-24, 25, 3):
            for dx in range(-24, 25, 3):
                X, Y = round(fx + dx), round(fy + dy)
                if X < 0 or Y < 0 or X + W > out_rgb.width or Y + H > out_rgb.height:
                    continue
                og = gray(out_rgb.crop((X, Y, X + W, Y + H)))
                a, b = fg[fa > 0.9], og[fa > 0.9]
                a, b = a - a.mean(), b - b.mean()
                c = float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-6))
                if best is None or c > best[0]:
                    best = (c, s, X - 150 * s, Y - 150 * s)
    return best


def head_mask(bust):
    """Маска головы бюста: вся непрозрачная часть до KEEP высоты, ниже — плавный спад."""
    a = np.asarray(bust.getchannel('A'), dtype=np.float32) / 255
    y = np.linspace(0, 1, a.shape[0], dtype=np.float32)[:, None]
    t = np.clip((y - KEEP) / 0.1, 0, 1)
    return a * (1 - t * t * (3 - 2 * t))


def build(ch, inputs, preview=False):
    cfg = inputs[ch]
    out_rgb = Image.open(os.path.join(SRC, f'{ch}_out.png')).convert('RGB')
    # модель могла вернуть другой размер — приводим к размеру входа (1024×1536)
    if out_rgb.size != (1024, 1536):
        out_rgb = out_rgb.resize((1024, 1536), Image.LANCZOS)
    ref = unfade(Image.open(os.path.join(PORT, f"{ch}_{cfg['ref']}.webp")).convert('RGBA'))
    score, s, x, y = locate(out_rgb, ref, cfg['s'], cfg['x'], cfg['y'])
    print(f'  {ch}: совпадение лица {score:.3f}, масштаб {s / cfg["s"]:.3f}, сдвиг {x - cfg["x"]:+.0f},{y - cfg["y"]:+.0f}')
    body = matte(out_rgb)
    # обрезка по фигуре
    a8 = np.asarray(body.getchannel('A')) > 8
    ys, xs = np.where(a8)
    x0, y0 = max(0, xs.min() - 6), max(0, min(ys.min(), int(y)) - 6)
    x1, y1 = min(body.width, xs.max() + 6), min(body.height, ys.max() + 4)
    crop = body.crop((x0, y0, x1, y1))
    os.makedirs(OUT, exist_ok=True)
    crop.save(os.path.join(OUT, f'{ch}.webp'), 'WEBP', quality=88, method=6, alpha_quality=90)
    cw, chh = crop.size
    info = dict(w=cw, h=chh, hf=HF.get(ch, 1.0), score=round(score, 3),
                bust=[round((x - x0) / cw * 100, 3), round((y - y0) / chh * 100, 3), round(900 * s / cw * 100, 3), round(1212 * s / chh * 100, 3)])
    man = json.load(open(os.path.join(PORT, 'manifest.json')))
    for e in man[ch]['exprs']:
        b = unfade(Image.open(os.path.join(PORT, f'{ch}_{e}.webp')).convert('RGBA'))
        m = head_mask(b)
        b.putalpha(Image.fromarray((m * 255).astype(np.uint8)))
        b.resize((450, 606), Image.LANCZOS).save(os.path.join(PORT, f'{ch}_{e}_head.webp'), 'WEBP', quality=88, method=6, alpha_quality=90)
    if preview:
        os.makedirs(CACHE, exist_ok=True)
        for e in [cfg['ref'], next((x for x in ('angry', 'sad', 'fear') if x in man[ch]['exprs']), cfg['ref'])]:
            head = Image.open(os.path.join(PORT, f'{ch}_{e}_head.webp')).resize((round(900 * s), round(1212 * s)), Image.LANCZOS)
            comp = Image.new('RGBA', crop.size, (60, 66, 74, 255))
            comp.alpha_composite(crop)
            comp.alpha_composite(head, (round(x - x0), round(y - y0)))
            comp.convert('RGB').save(os.path.join(CACHE, f'{ch}_{e}_preview.png'))
    return info


if __name__ == '__main__':
    inputs = json.load(open(os.path.join(SRC, 'inputs.json')))
    ids = [a for a in sys.argv[1:] if not a.startswith('--')] or [c for c in inputs if os.path.exists(os.path.join(SRC, f'{c}_out.png'))]
    path = os.path.join(OUT, 'bodies.json')
    data = json.load(open(path)) if os.path.exists(path) else {}
    for ch in ids:
        data[ch] = build(ch, inputs, '--preview' in sys.argv)
        # позы старой «бумажной куклы» к новым телам не подходят — убираем
        for f in os.listdir(OUT):
            if f.startswith(ch + '@'):
                os.remove(os.path.join(OUT, f))
    json.dump(data, open(path, 'w'), indent=1)
    print(json.dumps({k: data[k] for k in ids}))
