"""Бюст + тело («бумажная кукла»): существующие бюсты со всеми эмоциями и накладками рта/глаз
ставятся на тело, нарисованное отдельно. Лица остаются прежними.

python3 tools/art/bodies.py <id> [--preview]
Параметры совмещения — в BODY ниже (подбираются один раз на персонажа): тело, масштаб бюста,
положение глаз на теле, линия, выше которой голова тела стирается.
"""
import sys, os, json
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, '.art-cache/bodies')
OUT = os.path.join(ROOT, 'assets/bodies')
PORT = os.path.join(ROOT, 'assets/portraits')

# eyes_bust — середина глаз и межзрачковое расстояние на бюсте 900×1212;
# eyes_body — то же на теле; erase — многоугольник головы тела, которую закрывает бюст;
# head — многоугольник головы на бюсте (волосы, лицо, подбородок): одежду бюста не берём, её даёт тело
BODY = {
    'voron': dict(poses={'crossed': dict(src='voron_body_crossed.png', s=1.0, t=(-54, 19), cut=262, erase=[(330, 0), (640, 0), (640, 230), (580, 255), (530, 268), (470, 273), (410, 270), (360, 252), (330, 215)])}, src='voron_body_1.png', hf=1.0, eyes_bust=((345, 390), 194), eyes_body=((505, 146), 61),
                  erase=[(330, 0), (700, 0), (700, 196), (578, 220), (548, 244), (470, 252), (405, 250), (330, 230)], cut=250,
                  head=[(0, 0), (900, 0), (900, 330), (720, 520), (640, 640), (590, 730), (540, 800), (420, 840), (300, 830), (200, 760), (110, 600), (0, 520)]),
    'eva': dict(poses={'crossed': dict(src='eva_body_crossed.png', s=1.0, t=(8, -20), cut=196, erase=[(370, 0), (645, 0), (645, 200), (600, 206), (540, 208), (470, 206), (410, 202), (370, 175)])}, src='eva_body_1.png', hf=0.94, eyes_bust=((495, 506), 242), eyes_body=((529, 129), 57),
                erase=[(380, 0), (650, 0), (650, 190), (600, 196), (540, 198), (470, 194), (420, 190), (380, 160)], cut=188,
                head=[(0, 0), (900, 0), (900, 700), (840, 860), (700, 900), (600, 890), (520, 905), (400, 890), (250, 865), (120, 845), (0, 820)]),
    'mira': dict(src='mira_body_1.png', hf=0.92, eyes_bust=((390, 450), 186), eyes_body=((518, 145), 59),
                 erase=[(380, 0), (650, 0), (650, 215), (600, 235), (540, 245), (480, 240), (440, 225), (410, 190), (380, 150)], cut=205,
                 head=[(0, 0), (900, 0), (900, 560), (860, 760), (760, 830), (640, 840), (560, 800), (480, 785), (330, 780), (200, 830), (120, 780), (95, 560), (95, 300), (0, 250)]),
    'sonya': dict(src='sonya_body_1.png', hf=0.91, eyes_bust=((525, 452), 237), eyes_body=((507, 162), 71),
                  erase=[(360, 0), (650, 0), (650, 230), (600, 255), (540, 268), (470, 262), (410, 240), (360, 200)], cut=250,
                  head=[(0, 0), (900, 0), (900, 700), (820, 800), (700, 830), (600, 830), (500, 845), (380, 805), (250, 765), (100, 780), (0, 740)]),
    'leo': dict(src='leo_body_1.png', hf=0.99, eyes_bust=((395, 445), 232), eyes_body=((452, 169), 70),
                erase=[(320, 0), (600, 0), (600, 200), (540, 232), (480, 258), (420, 250), (360, 222), (320, 180)], cut=245,
                head=[(0, 0), (900, 0), (900, 500), (760, 620), (640, 700), (520, 745), (420, 725), (300, 665), (160, 605), (60, 565), (0, 520)]),
    'kessler': dict(src='kessler_body_1.png', hf=0.97, eyes_bust=((380, 435), 269), eyes_body=((519, 116), 55),
                    erase=[(380, 0), (645, 0), (645, 240), (380, 240)], cut=238,
                    head=[(0, 0), (900, 0), (900, 640), (840, 740), (790, 820), (770, 1075), (290, 1075), (250, 985), (200, 978), (60, 978), (0, 900)]),
    'hass': dict(src='hass_body_1.png', hf=0.98, eyes_bust=((570, 370), 201), eyes_body=((549, 109), 46),
                 erase=[(440, 0), (640, 0), (640, 150), (610, 180), (570, 205), (520, 205), (480, 185), (455, 150), (440, 100)], cut=170,
                 head=[(0, 0), (900, 0), (900, 600), (760, 700), (680, 760), (580, 790), (450, 760), (330, 700), (250, 620), (160, 600), (80, 560), (0, 500)]),
}


def unfade(bust):
    """Снять запечённое растворение низа бюста (portraits.bottom_fade, 72–98 % высоты): для головы на теле
    нужны волосы до самых кончиков, а низ всё равно отрезает маска головы."""
    a = np.asarray(bust.getchannel('A'), dtype=np.float32)
    y = np.linspace(0, 1, a.shape[0], dtype=np.float32)[:, None]
    t = np.clip((y - 0.72) / 0.26, 0, 1)
    k = np.maximum(1 - t * t * (3 - 2 * t), 0.35)
    out = bust.copy()
    out.putalpha(Image.fromarray(np.clip(a / k, 0, 255).astype(np.uint8)))
    return out


def head_frame(ch, name, hm):
    """Кадр бюста (эмоция) → только голова: без растворения низа, с маской головы."""
    b = unfade(Image.open(os.path.join(PORT, name + '.webp')).convert('RGBA'))
    a = np.asarray(b.getchannel('A'), dtype=np.float32) * (np.asarray(hm, dtype=np.float32) / 255)
    b.putalpha(Image.fromarray(a.astype(np.uint8)))
    return b


def matte_rgba(path):
    im = Image.open(path).convert('RGB')
    cache = path[:-4] + '_alpha.png'
    if os.path.exists(cache):
        a = Image.open(cache).convert('L')
    else:
        from matte import matte
        m = np.asarray(matte(im)).astype(np.float32) / 255.0
        m = np.clip((m - 0.04) / 0.9, 0, 1)
        a = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
        a.save(cache)
    out = im.convert('RGBA')
    out.putalpha(a)
    return out


def placement(cfg):
    (bx, by), bd = cfg['eyes_bust']
    (tx, ty), td = cfg['eyes_body']
    k = td / bd
    return k, (round(tx - bx * k), round(ty - by * k))


def color_match(body, bust, hm, erase_mask):
    """Свет и цвет тела подгоняются под бюст: средние и разброс по каналам в области головы
    (голова бюста ↔ голова тела, которую он закроет) переносятся на всё тело."""
    b = np.asarray(bust.convert('RGBA'), dtype=np.float32)
    sel_b = (b[:, :, 3] > 200) & (np.asarray(hm) > 200)
    t = np.asarray(body, dtype=np.float32)
    sel_t = (t[:, :, 3] > 200) & (np.asarray(erase_mask) > 200)
    out = t.copy()
    for c in range(3):
        mb, sb = b[:, :, c][sel_b].mean(), b[:, :, c][sel_b].std() + 1e-3
        mt, st = t[:, :, c][sel_t].mean(), t[:, :, c][sel_t].std() + 1e-3
        k = np.clip(sb / st, 0.75, 1.25)
        out[:, :, c] = np.clip((t[:, :, c] - mt) * k + mb * 0.7 + mt * 0.3, 0, 255)
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def load_pose(ch, pose):
    """Тело позы в кадре основной позы: вырезка, масштаб s и сдвиг t (голова и шея совпадают с основной)."""
    pc = BODY[ch]['poses'][pose]
    im = matte_rgba(os.path.join(CACHE, pc['src']))
    im = im.resize((round(im.width * pc['s']), round(im.height * pc['s'])), Image.LANCZOS)
    out = Image.new('RGBA', (1024, 1536), (0, 0, 0, 0))
    out.paste(im, pc['t'], im)
    return out


def prepare(ch, body, cfg, hm0, em0, ref, k, ox, oy, hm):
    """Цвет под бюст, стирание собственной головы тела, тень головы на шею."""
    body = color_match(body, Image.open(os.path.join(PORT, f'{ch}_{ref}.webp')), hm0, em0)
    cov = np.asarray(head_frame(ch, f'{ch}_{ref}', hm).getchannel('A'), dtype=np.float32)
    cov_img = Image.new('L', body.size, 0)
    cov_img.paste(Image.fromarray(cov.astype(np.uint8)).resize((round(900 * k), round(1212 * k)), Image.LANCZOS), (ox, oy))
    zone = np.asarray(em0, dtype=np.float32) / 255
    yy = np.arange(body.height, dtype=np.float32)[:, None]
    rows = np.clip((cfg.get('cut', 0) + 4 - yy) / 14, 0, 1)
    covered = np.clip(np.asarray(cov_img, dtype=np.float32) / 255 * 1.6, 0, 1)
    m = zone * np.maximum(rows, covered)
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)), dtype=np.float32) / 255
    a = np.asarray(body.getchannel('A'), dtype=np.float32) * (1 - m)
    body.putalpha(Image.fromarray(a.astype(np.uint8)))
    sh = np.asarray(cov_img.filter(ImageFilter.GaussianBlur(7)), dtype=np.float32) / 255
    sh = np.roll(sh, 7, axis=0) * (1 - covered)
    rgb = np.asarray(body, dtype=np.float32)
    rgb[:, :, :3] *= (1 - 0.42 * sh)[:, :, None]
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGBA')


def build(ch, preview=False):
    cfg = BODY[ch]
    body = matte_rgba(os.path.join(CACHE, cfg['src']))
    hm0 = Image.new('L', (900, 1212), 0)
    ImageDraw.Draw(hm0).polygon(cfg['head'], fill=255)
    em0 = Image.new('L', body.size, 0)
    ImageDraw.Draw(em0).polygon(cfg['erase'], fill=255)
    man0 = json.load(open(os.path.join(PORT, 'manifest.json')))
    ex = man0[ch]['exprs']
    ref = next(e for e in ('warm', 'neutral', 'smile') if e in ex)
    k, (ox, oy) = placement(cfg)
    os.makedirs(OUT, exist_ok=True)
    hm = hm0.filter(ImageFilter.GaussianBlur(4.5 / k))  # край ~4–5 точек итогового тела при любом масштабе
    hm.save(os.path.join(CACHE, f'{ch}_headmask.png'))
    raw = body
    body = prepare(ch, raw, cfg, hm0, em0, ref, k, ox, oy, hm)
    poses = {p: prepare(ch, load_pose(ch, p), {**cfg, **{kk: v for kk, v in cfg['poses'][p].items() if kk in ('cut', 'erase')}},
                        hm0, (lambda e: (ImageDraw.Draw(e).polygon(cfg['poses'][p].get('erase', cfg['erase']), fill=255), e)[1])(Image.new('L', (1024, 1536), 0)),
                        ref, k, ox, oy, hm) for p in cfg.get('poses', {})}
    # обрезка по фигуре вместе с головой; рамка бюста — в процентах обрезанного кадра
    a8 = np.asarray(body.getchannel('A')) > 8
    for pb in poses.values():
        a8 = a8 | (np.asarray(pb.getchannel('A')) > 8)
    ys, xs = np.where(a8)
    hx0, hy0, hx1 = ox, oy, ox + round(900 * k)
    x0, y0 = max(0, min(xs.min(), hx0) - 6), max(0, min(ys.min(), hy0) - 6)
    x1, y1 = min(body.width, max(xs.max(), hx1) + 6), min(body.height, ys.max() + 4)
    crop = body.crop((x0, y0, x1, y1))
    crop.save(os.path.join(OUT, f'{ch}.webp'), 'WEBP', quality=88, method=6, alpha_quality=90)
    for pn, pb in poses.items():
        pb.crop((x0, y0, x1, y1)).save(os.path.join(OUT, f'{ch}@{pn}.webp'), 'WEBP', quality=88, method=6, alpha_quality=90)
    cw, chh = crop.size
    info = dict(w=cw, h=chh, hf=cfg.get('hf', 1.0), poses=list(poses),
                bust=[round((ox - x0) / cw * 100, 3), round((oy - y0) / chh * 100, 3), round(900 * k / cw * 100, 3), round(1212 * k / chh * 100, 3)])
    # головы всех эмоций: тот же кадр 900×1212 (накладки рта и глаз остаются верными), уменьшенный вдвое
    for e in man0[ch]['exprs']:
        head_frame(ch, f'{ch}_{e}', hm).resize((450, 606), Image.LANCZOS).save(
            os.path.join(PORT, f'{ch}_{e}_head.webp'), 'WEBP', quality=88, method=6, alpha_quality=90)
    if preview:
        man = json.load(open(os.path.join(PORT, 'manifest.json')))
        expr = ref
        bust = head_frame(ch, f'{ch}_{expr}', hm)
        bust = bust.resize((round(900 * k), round(1212 * k)), Image.LANCZOS)
        comp = Image.new('RGBA', body.size, (60, 66, 74, 255))
        comp.alpha_composite(body)
        comp.alpha_composite(bust, (ox, oy))
        comp.convert('RGB').save(os.path.join(CACHE, f'{ch}_preview.png'))
        for pn, pb in poses.items():
            comp = Image.new('RGBA', body.size, (60, 66, 74, 255))
            comp.alpha_composite(pb)
            comp.alpha_composite(bust, (ox, oy))
            comp.convert('RGB').save(os.path.join(CACHE, f'{ch}@{pn}_preview.png'))
    return info


if __name__ == '__main__':
    ids = [a for a in sys.argv[1:] if not a.startswith('--')] or list(BODY)
    res = {ch: build(ch, '--preview' in sys.argv) for ch in ids}
    path = os.path.join(OUT, 'bodies.json')
    old = json.load(open(path)) if os.path.exists(path) else {}
    old.update(res)
    json.dump(old, open(path, 'w'), indent=1)
    print(json.dumps(res))
