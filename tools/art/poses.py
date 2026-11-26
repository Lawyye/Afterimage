"""Ростовые персонажи с позами (манифест v2).

Вход (готовит владелец арта, см. docs/ART_POSES.md):
    art-src/poses/<id>/<pose>/<expr>.png          — кадр в полный рост (поза idle — основная)
    art-src/poses/<id>/<pose>/<expr>_talk.png     — тот же кадр, только рот открыт (необязательно)
    art-src/poses/<id>/<pose>/<expr>_blink.png    — тот же кадр, только глаза закрыты (необязательно)
Фон может быть любым: если у PNG нет прозрачности, персонаж вырезается ISNet-anime (.art-cache/models).

Выход:
    assets/portraits/<id>_<expr>.webp            — поза idle (заменяет бюсты этого персонажа)
    assets/portraits/<id>@<pose>_<expr>.webp     — остальные позы
    накладки *_talk / *_blink — вырезки по разнице с основным кадром
    assets/portraits/manifest.json               — запись персонажа: full: true, exprs, poses

python3 tools/art/poses.py <id> [<id> ...]
"""
import sys, os, json, glob
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.environ.get('POSES_SRC', os.path.join(ROOT, 'art-src/poses'))
OUT = os.environ.get('POSES_OUT', os.path.join(ROOT, 'assets/portraits'))
W, H = 720, 1440                 # итоговый кадр (в игре 490×980 точек сцены)
FADE_FROM, FADE_TO = 0.88, 0.995  # ступни растворяются у нижнего края
PAD = 10                         # запас вокруг накладки, точек итогового кадра


def cut(im: Image.Image) -> Image.Image:
    """RGBA персонажа: своя прозрачность или маска ISNet."""
    im = im.convert('RGBA')
    a = np.asarray(im.getchannel('A'))
    if a.min() < 250:
        return im
    from matte import matte
    m = np.asarray(matte(im.convert('RGB'))).astype(np.float32) / 255.0
    m = np.clip((m - 0.04) / 0.9, 0, 1)
    im.putalpha(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0)))
    return im


def fit(im: Image.Image, geo=None):
    """Вписать по высоте в 720×1440: ноги у нижнего края, фигура по центру.
    geo — геометрия основного кадра: варианты (рот/глаза) кладутся точно так же, пиксель в пиксель."""
    if geo is None:
        bbox = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox() or (0, 0, im.width, im.height)
        k = (H * 0.97) / (bbox[3] - bbox[1])
        w, h = round((bbox[2] - bbox[0]) * k), round((bbox[3] - bbox[1]) * k)
        if w > W:
            w, h = W, round(h * W / w)
        geo = (bbox, (w, h))
    bbox, (w, h) = geo
    fig = im.crop(bbox).resize((max(1, w), max(1, h)), Image.LANCZOS)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    canvas.paste(fig, ((W - w) // 2, H - h), fig)
    return canvas, geo


def bottom_fade(im: Image.Image) -> Image.Image:
    a = np.asarray(im.getchannel('A'), dtype=np.float32)
    y = np.linspace(0, 1, a.shape[0], dtype=np.float32)[:, None]
    t = np.clip((y - FADE_FROM) / (FADE_TO - FADE_FROM), 0, 1)
    out = im.copy()
    out.putalpha(Image.fromarray(np.clip(a * (1 - t * t * (3 - 2 * t)), 0, 255).astype(np.uint8)))
    return out


def overlay(base: Image.Image, variant: Image.Image):
    """Накладка = область, где вариант отличается от основы (рот или глаза)."""
    d = np.abs(np.asarray(base, dtype=np.int16) - np.asarray(variant, dtype=np.int16)).max(axis=2)
    ys, xs = np.where(d > 24)
    if len(xs) < 20:
        return None, None
    x0, x1 = max(0, xs.min() - PAD), min(W, xs.max() + PAD + 1)
    y0, y1 = max(0, ys.min() - PAD), min(H, ys.max() + PAD + 1)
    if (x1 - x0) * (y1 - y0) > W * H * 0.08:
        print('  ! накладка слишком большая — кадры не совпадают по положению, пропускаю')
        return None, None
    box = [round(x0 / W * 100, 3), round(y0 / H * 100, 3), round((x1 - x0) / W * 100, 3), round((y1 - y0) / H * 100, 3)]
    return variant.crop((x0, y0, x1, y1)), box


def save(im: Image.Image, name: str):
    im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=86, method=6, alpha_quality=90)


def build(ch: str, manifest: dict):
    poses = sorted(d for d in os.listdir(os.path.join(SRC, ch)) if os.path.isdir(os.path.join(SRC, ch, d)))
    if 'idle' not in poses:
        sys.exit(f'{ch}: нужна поза idle (art-src/poses/{ch}/idle/<expr>.png)')
    entry = {'full': True, 'exprs': {}, 'poses': {}}
    for pose in poses:
        exprs = {}
        files = sorted(glob.glob(os.path.join(SRC, ch, pose, '*.png')))
        for f in files:
            expr = os.path.basename(f)[:-4]
            if expr.endswith(('_talk', '_blink')):
                continue
            src = cut(Image.open(f))
            base, geo = fit(src)
            prefix = f'{ch}_{expr}' if pose == 'idle' else f'{ch}@{pose}_{expr}'
            save(bottom_fade(base), prefix)
            e = {}
            for kind in ('talk', 'blink'):
                vf = os.path.join(SRC, ch, pose, f'{expr}_{kind}.png')
                if not os.path.exists(vf):
                    continue
                # вариант — на ту же сетку и с той же маской, что и основа: отличаются только рот или глаза
                v = Image.open(vf).convert('RGBA').resize(src.size, Image.LANCZOS)
                v.putalpha(src.getchannel('A'))
                var, _ = fit(v, geo)
                patch, box = overlay(base, var)
                if patch is not None:
                    save(patch, f'{prefix}_{kind}')
                    e[kind] = box
            exprs[expr] = e
            print(f'  {ch} {pose} {expr}', '+'.join(e) or '')
        if pose == 'idle':
            entry['exprs'] = exprs
        else:
            entry['poses'][pose] = {'exprs': exprs}
    if not entry['poses']:
        del entry['poses']
    manifest[ch] = entry


def main():
    ids = sys.argv[1:] or (sorted(os.listdir(SRC)) if os.path.isdir(SRC) else [])
    if not ids:
        sys.exit('нет исходников в art-src/poses/<id>/<pose>/')
    man_path = os.path.join(OUT, 'manifest.json')
    manifest = json.load(open(man_path))
    for ch in ids:
        build(ch, manifest)
    json.dump(manifest, open(man_path, 'w'), indent=1, ensure_ascii=False)
    print('готово; пересоберите игру: npm run build')


if __name__ == '__main__':
    main()
