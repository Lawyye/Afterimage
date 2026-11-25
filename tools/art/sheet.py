"""Нарезка листа эмоций на кадры, выравнивание и подготовка накладок рта/глаз.

python3 tools/art/sheet.py <sheet.png> <cols> <rows> <names,comma,separated> <outdir>
"""
import sys, json
import numpy as np
from PIL import Image, ImageFilter

def find_cuts(profile, n, total):
    # ищем n-1 тёмных разделителей между панелями
    cuts = [0]
    approx = [total * i / n for i in range(1, n)]
    for a in approx:
        lo, hi = int(a - total * 0.04), int(a + total * 0.04)
        seg = profile[lo:hi]
        dark = np.where(seg < seg.min() + 6)[0]
        if len(dark):
            s, e = lo + dark[0], lo + dark[-1]
        else:
            s = e = int(a)
        cuts.append((s, e))
    cuts.append(total)
    boxes = []
    prev_end = 0
    for c in cuts[1:-1]:
        boxes.append((prev_end, c[0]))
        prev_end = c[1] + 1
    boxes.append((prev_end, total))
    return boxes

def phase_shift(a, b):
    """Сдвиг b относительно a (фазовая корреляция)."""
    A = np.fft.fft2(a); B = np.fft.fft2(b)
    R = A * np.conj(B); R /= np.abs(R) + 1e-9
    r = np.fft.ifft2(R).real
    y, x = np.unravel_index(np.argmax(r), r.shape)
    if y > a.shape[0] // 2: y -= a.shape[0]
    if x > a.shape[1] // 2: x -= a.shape[1]
    return int(x), int(y)

def main():
    src, cols, rows, names, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4].split(','), sys.argv[5]
    im = Image.open(src).convert('RGB')
    arr = np.asarray(im).astype(np.float32).mean(axis=2)
    W, H = im.size
    xs = find_cuts(arr.mean(axis=0), cols, W)
    ys = find_cuts(arr.mean(axis=1), rows, H)
    # общий размер кадра — минимальный
    pw = min(b - a for a, b in xs); ph = min(b - a for a, b in ys)
    panels = []
    for r, (y0, y1) in enumerate(ys):
        for c, (x0, x1) in enumerate(xs):
            panels.append(im.crop((x0, y0, x0 + pw, y0 + ph)))
    base = np.asarray(panels[0].convert('L')).astype(np.float32)
    meta = {'size': [int(pw), int(ph)], 'panels': {}}
    for name, p in zip(names, panels):
        g = np.asarray(p.convert('L')).astype(np.float32)
        dx, dy = phase_shift(base, g)
        meta['panels'][name] = {'shift': [dx, dy]}
        # выравниваем по базовому кадру
        aligned = Image.new('RGB', p.size)
        aligned.paste(p, (dx, dy))
        # края, оставшиеся пустыми, заполняем растяжением исходного края
        if dx or dy:
            fill = p.resize(p.size)
            bg = Image.new('RGB', p.size); bg.paste(fill, (0, 0))
            mask = Image.new('L', p.size, 0); mask.paste(255, (max(0, dx), max(0, dy), p.size[0] + min(0, dx), p.size[1] + min(0, dy)))
            aligned = Image.composite(aligned, bg, mask)
        aligned.save(f'{out}/{name}.png')
    json.dump(meta, open(f'{out}/meta.json', 'w'), indent=1)
    print(json.dumps(meta))

main()
