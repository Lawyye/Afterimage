"""Маска персонажа (ISNet-anime, onnxruntime, CPU).

python3 tools/art/matte.py <in.png> <out_mask.png>
Модель: .art-cache/models/isnet-anime.onnx (релизы github.com/danielgatis/rembg)
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter
import onnxruntime as ort

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODEL = os.path.join(ROOT, '.art-cache/models/isnet-anime.onnx')
_sess = None

def session():
    global _sess
    if _sess is None:
        so = ort.SessionOptions()
        so.intra_op_num_threads = os.cpu_count() or 4
        _sess = ort.InferenceSession(MODEL, so, providers=['CPUExecutionProvider'])
    return _sess

def matte(img: Image.Image) -> Image.Image:
    s = session()
    im = img.convert('RGB').resize((1024, 1024), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255.0
    a = (a - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([1.0, 1.0, 1.0], np.float32)
    x = a.transpose(2, 0, 1)[None]
    out = s.run(None, {s.get_inputs()[0].name: x})[0][0][0]
    out = (out - out.min()) / max(1e-6, out.max() - out.min())
    m = Image.fromarray((out * 255).astype(np.uint8)).resize(img.size, Image.LANCZOS)
    return m

if __name__ == '__main__':
    matte(Image.open(sys.argv[1])).save(sys.argv[2])
