"""Проверка разборчивости озвучки: распознаёт аудиофайлы Whisper'ом и печатает текст.
python3 -I tools/voice/asr.py файл.wav [файл2.mp3 ...]"""
import subprocess, sys
import numpy as np
from faster_whisper import WhisperModel

_model = None

def model():
    global _model
    if _model is None:
        _model = WhisperModel('small', device='cpu', compute_type='int8', download_root='.art-cache/tts/whisper')
    return _model

def load16k(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)

def transcribe(path):
    seg, _ = model().transcribe(load16k(path), language='ru', beam_size=5)
    return ' '.join(s.text.strip() for s in seg)

if __name__ == '__main__':
    for p in sys.argv[1:]:
        print(p, '→', transcribe(p))
