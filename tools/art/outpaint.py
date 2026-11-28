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
# уменьшение головы относительно тела: масштаб, точка крепления (середина шеи под подбородком, в координатах
# бюста 900×1212) и где голова уступает шее и воротнику тела
SHRINK = {'voron': dict(hs=0.85, anchor=(420, 800), keep=0.68, fade=0.06,
                        poly=[(0, 0), (900, 0), (900, 330), (720, 520), (640, 640), (590, 730), (560, 800), (560, 900),
                              (300, 900), (250, 800), (200, 760), (110, 600), (0, 520)])}


def poly_mask(poly, blur=10):
    from PIL import ImageDraw
    m = Image.new('L', (900, 1212), 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    return np.asarray(m.filter(ImageFilter.GaussianBlur(blur)), dtype=np.float32) / 255


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
    """Где модель оставила голову: грубый поиск по всему кадру, затем точный вокруг лучшего места."""
    face = bust.crop((150, 150, 750, 760))
    og_full = gray(out_rgb)
    H0, W0 = og_full.shape
    best = None

    def score_at(s, X, Y, fg, fa):
        h, w = fg.shape
        if X < 0 or Y < 0 or X + w > W0 or Y + h > H0:
            return None
        og = og_full[Y:Y + h, X:X + w]
        m = fa > 0.9
        if int(m.sum()) < 80:
            return None
        a, b = fg[m], og[m]
        a, b = a - a.mean(), b - b.mean()
        return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-6))

    # грубо: мало масштабов, шаг ~24 px, лицо уменьшено
    for ds in np.linspace(-0.45, 0.25, 15):
        s = s0 * (1 + ds)
        f = face.resize((max(8, round(600 * s / 4)), max(8, round(610 * s / 4))), Image.BOX)
        fg = gray(f.convert('RGB'))
        fa = np.asarray(f.getchannel('A'), dtype=np.float32) / 255
        step = 24
        y_limit = int(H0 * 0.42)
        for Y in range(0, min(y_limit, H0 - fg.shape[0] * 4), step):
            for X in range(0, W0 - fg.shape[1], step):
                # сравниваем с уменьшенным кадром той же сетки
                og = og_full[Y:Y + fg.shape[0] * 4:4, X:X + fg.shape[1] * 4:4]
                if og.shape != fg.shape:
                    continue
                m = fa > 0.85
                if int(m.sum()) < 40:
                    continue
                a, b = fg[m], og[m]
                a, b = a - a.mean(), b - b.mean()
                c = float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-6))
                if best is None or c > best[0]:
                    best = (c, s, X - 150 * s, Y - 150 * s, X, Y)

    # точно вокруг грубого попадания и вокруг исходной точки
    seeds = [(s0, x0 + 150 * s0, y0 + 150 * s0)]
    if best is not None:
        seeds.append((best[1], best[4], best[5]))
    fine = None
    for s_seed, fx0, fy0 in seeds:
        for ds in np.linspace(-0.08, 0.08, 9):
            s = s_seed * (1 + ds)
            f = face.resize((max(8, round(600 * s)), max(8, round(610 * s))), Image.LANCZOS)
            fg = gray(f.convert('RGB'))
            fa = np.asarray(f.getchannel('A'), dtype=np.float32) / 255
            for dy in range(-36, 37, 4):
                for dx in range(-36, 37, 4):
                    X, Y = round(fx0 + dx), round(fy0 + dy)
                    c = score_at(s, X, Y, fg, fa)
                    if c is None or (Y > H0 * 0.46):
                        continue
                    if fine is None or c > fine[0]:
                        fine = (c, s, X - 150 * s, Y - 150 * s)
    if fine is None:
        return best[0], best[1], best[2], best[3]
    return fine


def head_mask(bust, keep=KEEP, fade=0.1):
    """Маска головы бюста: вся непрозрачная часть до keep высоты, ниже — плавный спад."""
    a = np.asarray(bust.getchannel('A'), dtype=np.float32) / 255
    y = np.linspace(0, 1, a.shape[0], dtype=np.float32)[:, None]
    t = np.clip((y - keep) / fade, 0, 1)
    return a * (1 - t * t * (3 - 2 * t))


def build(ch, inputs, preview=False):
    cfg = inputs[ch]
    out_rgb = Image.open(os.path.join(SRC, f'{ch}_out.png')).convert('RGB')
    # модель могла вернуть другой размер — приводим к ширине входа (1024), пропорции сохраняем
    if out_rgb.width != 1024:
        out_rgb = out_rgb.resize((1024, round(out_rgb.height * 1024 / out_rgb.width)), Image.LANCZOS)
    ref = unfade(Image.open(os.path.join(PORT, f"{ch}_{cfg['ref']}.webp")).convert('RGBA'))
    score, s, x, y = locate(out_rgb, ref, cfg['s'], cfg['x'], cfg['y'])
    print(f'  {ch}: совпадение лица {score:.3f}, масштаб {s / cfg["s"]:.3f}, сдвиг {x - cfg["x"]:+.0f},{y - cfg["y"]:+.0f}')
    body = matte(out_rgb)
    sh = SHRINK.get(ch)
    if sh:
        # большая голова модели стирается выше точки крепления, на её место встанет наша, уменьшенная
        ax, ay = sh['anchor']
        ra = np.asarray(ref.getchannel('A'), dtype=np.float32) * poly_mask(sh['poly'], 4)
        big = Image.fromarray(ra.astype(np.uint8)).resize((round(900 * s), round(1212 * s)), Image.LANCZOS)
        bm = Image.new('L', body.size, 0)
        bm.paste(big, (round(x), round(y)))
        bm = np.asarray(bm.filter(ImageFilter.MaxFilter(9)), dtype=np.float32) / 255
        yy0 = np.arange(body.height, dtype=np.float32)[:, None]
        above = np.clip((y + ay * s - yy0) / 18, 0, 1)
        body.putalpha(Image.fromarray((np.asarray(body.getchannel('A'), dtype=np.float32) * (1 - bm * above)).astype(np.uint8)))
        s2 = s * sh['hs']
        x, y = x + ax * s - ax * s2, y + ay * s - ay * s2
        s = s2
    # остатки головы модели вокруг нашей головы (другой контур волос) стираются: в полосе вокруг
    # силуэта головы, выше плеч, тело видно только там, где его закрывает наша голова
    hb = ref.resize((round(900 * s), round(1212 * s)), Image.LANCZOS).getchannel('A')
    ha = Image.new('L', body.size, 0)
    ha.paste(hb, (round(x), round(y)))
    han = np.asarray(ha, dtype=np.float32) / 255
    band = np.asarray(ha.point(lambda v: 255 if v > 12 else 0).filter(ImageFilter.MaxFilter(31)), dtype=np.float32) / 255
    yy = np.arange(body.height, dtype=np.float32)[:, None]
    upper = np.clip((y + 1212 * s * 0.5 - yy) / 30, 0, 1) * np.clip((yy - y - 2) / 10, 0, 1)  # выше рамки бюста — макушка модели
    k = 1 - band * upper * (1 - np.clip(han * 1.3, 0, 1))
    body.putalpha(Image.fromarray((np.asarray(body.getchannel('A'), dtype=np.float32) * k).astype(np.uint8)))
    # обрезка по фигуре
    a8 = np.asarray(body.getchannel('A')) > 8
    ys, xs = np.where(a8)
    x0, y0 = max(0, xs.min() - 6), max(0, min(ys.min(), int(y)) - 6)
    x1, y1 = min(body.width, xs.max() + 6), min(body.height, ys.max() + 4)
    crop = body.crop((x0, y0, x1, y1))
    # низ кадра (колени) растворяется — если фигура кончается выше края экрана, обрыва не видно
    ca = np.asarray(crop.getchannel('A'), dtype=np.float32)
    yy2 = np.linspace(0, 1, ca.shape[0], dtype=np.float32)[:, None]
    tt = np.clip((yy2 - 0.86) / 0.14, 0, 1)
    crop.putalpha(Image.fromarray((ca * (1 - tt * tt * (3 - 2 * tt))).astype(np.uint8)))
    os.makedirs(OUT, exist_ok=True)
    crop.save(os.path.join(OUT, f'{ch}.webp'), 'WEBP', quality=88, method=6, alpha_quality=90)
    cw, chh = crop.size
    info = dict(w=cw, h=chh, hf=HF.get(ch, 1.0), hs=(sh or {}).get('hs', 1.0), score=round(score, 3),
                bust=[round((x - x0) / cw * 100, 3), round((y - y0) / chh * 100, 3), round(900 * s / cw * 100, 3), round(1212 * s / chh * 100, 3)])
    man = json.load(open(os.path.join(PORT, 'manifest.json')))
    for e in man[ch]['exprs']:
        b = unfade(Image.open(os.path.join(PORT, f'{ch}_{e}.webp')).convert('RGBA'))
        m = head_mask(b, (sh or {}).get('keep', KEEP), (sh or {}).get('fade', 0.1))
        if sh:
            m = m * poly_mask(sh['poly'])  # только голова и шея — одежду даёт тело
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
