"""Нейросетевой апскейл аниме-иллюстраций (Real-ESRGAN x4plus-anime, ncnn, CPU).

python3 tools/art/upscale.py <in.png> <out.png>
Модель: .art-cache/models/realesrgan-x4plus-anime.{param,bin}
(скачивается из релизов github.com/xinntao/Real-ESRGAN, архив realesrgan-ncnn-vulkan-20220424-ubuntu.zip)
"""
import os, sys
import numpy as np
import ncnn
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODEL = os.path.join(ROOT, '.art-cache/models/realesrgan-x4plus-anime')
TILE, PAD, SCALE = 160, 12, 4

_net = None
def net():
    global _net
    if _net is None:
        n = ncnn.Net()
        n.opt.use_vulkan_compute = False
        n.opt.num_threads = os.cpu_count() or 4
        n.load_param(MODEL + '.param')
        n.load_model(MODEL + '.bin')
        _net = n
    return _net

def run_tile(arr):
    """arr: HxWx3 float32 0..1 -> 4H x 4W x 3"""
    chw = np.ascontiguousarray(arr.transpose(2, 0, 1))
    ex = net().create_extractor()
    ex.input('data', ncnn.Mat(chw))
    ret, out = ex.extract('output')
    return np.array(out).transpose(1, 2, 0)

def upscale(img: Image.Image) -> Image.Image:
    a = np.asarray(img.convert('RGB')).astype(np.float32) / 255.0
    H, W, _ = a.shape
    out = np.zeros((H * SCALE, W * SCALE, 3), np.float32)
    padded = np.pad(a, ((PAD, PAD), (PAD, PAD), (0, 0)), mode='reflect')
    for y in range(0, H, TILE):
        for x in range(0, W, TILE):
            h, w = min(TILE, H - y), min(TILE, W - x)
            t = padded[y:y + h + 2 * PAD, x:x + w + 2 * PAD]
            r = run_tile(t)
            out[y * SCALE:(y + h) * SCALE, x * SCALE:(x + w) * SCALE] = r[PAD * SCALE:(PAD + h) * SCALE, PAD * SCALE:(PAD + w) * SCALE]
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8))

if __name__ == '__main__':
    upscale(Image.open(sys.argv[1])).save(sys.argv[2])
