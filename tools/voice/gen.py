"""Озвучка: синтез речи Piper (голоса denis и dmitri, лицензия CC0) + обработка ffmpeg.

Вход:  .art-cache/tts/all.json  (tools/voice/collect.mjs)
Выход: assets/voice/<key>.mp3 и assets/voice/index.json {key: длительность_мс}

  python3 -I tools/voice/gen.py            — озвучить новое и изменённое
  python3 -I tools/voice/gen.py --force    — переозвучить всё
  python3 -I tools/voice/gen.py --asr      — проверить разборчивость распознаванием речи (Whisper)

Голоса: .art-cache/tts/voices/ru_RU-{denis,dmitri}-medium.onnx (huggingface.co/rhasspy/piper-voices).
"""
import difflib, hashlib, json, os, re, subprocess, sys, tempfile, wave

from num2words import num2words
from piper import PiperVoice, SynthesisConfig

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, '.art-cache/tts')
OUT = os.path.join(ROOT, 'assets/voice')

# роль → голос, темп (length_scale > 1 — медленнее), вариативность и цепочка обработки
ROLES = {
    # ОРФЕЙ — аналитическая система: ровный, чуть ниже, с металлическим отзвуком
    'orpheus': dict(voice='dmitri', length=1.08, noise=0.45, noise_w=0.6, fx=(
        'asetrate=22050*0.96,aresample=44100,atempo=1.0417,'
        'highpass=f=110,lowpass=f=8000,afreqshift=shift=2,'
        'chorus=0.8:0.9:30:0.18:0.25:1.2,aecho=0.85:0.4:26:0.14,'
        'acompressor=threshold=-18dB:ratio=3:attack=5:release=80')),
    # диктор вступления и заставок глав — ниже и неторопливее ОРФЕЯ, без металла; обработка лёгкая: тяжёлый отзвук съедал разборчивость
    # (у голоса denis смазываются начальные согласные — он остался только для узкополосных объявлений терминалов)
    'narrator': dict(voice='dmitri', length=1.1, noise=0.55, noise_w=0.7, fx=(
        'asetrate=22050*0.92,aresample=44100,atempo=1.087,'
        'highpass=f=60,equalizer=f=160:t=q:w=1.2:g=2.5,lowpass=f=9500,'
        'aecho=0.8:0.35:60:0.12,'
        'acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120')),
    # объявления терминалов — узкая полоса, как динамик устройства
    'sys': dict(voice='denis', length=1.0, noise=0.4, noise_w=0.5, fx=(
        'aresample=44100,highpass=f=300,lowpass=f=3600,'
        'acrusher=bits=12:mix=0.15:mode=log,aecho=0.8:0.45:45:0.2,'
        'acompressor=threshold=-18dB:ratio=4:attack=3:release=60')),
}
TAIL = 'adelay=60,apad=pad_dur=0.35,loudnorm=I=-17:TP=-1.5:LRA=7,aresample=32000'

# Диктор записан в ElevenLabs (голос Maxim, art-src/voice/narrator/prompts.json): дубли лежат в
# art-src/voice/narrator/takes/<key>.<a|b|…>.mp3, генератор берёт самый разборчивый и слегка обрабатывает
# (лёгкий зал и выравнивание громкости). Если записи для фразы нет — она синтезируется Piper, как раньше.
EXTERNAL = {'narrator': dict(dir=os.path.join(ROOT, 'art-src/voice/narrator/takes'), fx=(
    'highpass=f=50,equalizer=f=140:t=q:w=1.2:g=1.5,aecho=0.8:0.3:55|110:0.1|0.05,'
    'acompressor=threshold=-20dB:ratio=2:attack=10:release=150'))}


def external_takes(role, key):
    ext = EXTERNAL.get(role)
    if not ext or not os.path.isdir(ext['dir']):
        return []
    return sorted(os.path.join(ext['dir'], f) for f in os.listdir(ext['dir']) if f.startswith(key + '.') and f.endswith('.mp3'))


def process_external(role, src, out_mp3):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', EXTERNAL[role]['fx'] + ',' + TAIL,
                    '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', out_mp3], check=True)

# произношение: [[фонемы espeak]] там, где словарь ошибается
LEXICON = [
    (r'\bПорт-Ирис\b', '[[pˈort ˈirʲɪs]]'), (r'\bПорт-Ириса\b', '[[pˈort ˈirʲɪsə]]'),
    (r'\bПорт-Ирисе\b', '[[pˈort ˈirʲɪsʲɪ]]'), (r'\bПорт-Ирису\b', '[[pˈort ˈirʲɪsu]]'),
    (r'\bПорт-Ирисом\b', '[[pˈort ˈirʲɪsəm]]'),
    (r'\bВорона\b', '[[vˈorʌnə]]'), (r'\bВорону\b', '[[vˈorʌnu]]'), (r'\bВороном\b', '[[vˈorʌnəm]]'), (r'\bВороне\b', '[[vˈorʌnʲɪ]]'),
    (r'\bОПП\b', '[[ʌ pɛ pˈɛ]]'),
]
LETTERS = dict(zip('АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ', 'а бэ вэ гэ дэ е жэ зэ и ка эл эм эн о пэ эр эс тэ у эф ха цэ чэ ша э ю я'.split()))


def num(n, female=False):
    try:
        return num2words(n, lang='ru', gender='f' if female else 'm')
    except TypeError:
        return num2words(n, lang='ru')


def clock(m):
    h, mi = int(m.group(1)), int(m.group(2))
    hs = 'ноль-ноль' if h == 0 else num(h)
    ms = 'ноль-ноль' if mi == 0 else ('ноль ' + num(mi, True) if mi < 10 else num(mi, True))
    return f'{hs} {ms}'


def normalize(text):
    t = re.sub(r'\*\*|%%|\|\||!!|\*', '', text)
    t = re.sub(r'\b(\d{1,2}):(\d{2})\b', clock, t)
    t = re.sub(r'\d+', lambda m: num(int(m.group(0))), t)
    # инициалы после фамилии: «РЕЙН Е.» → «Рейн е»
    t = re.sub(r'(?<=[А-ЯЁа-яё] )([А-ЯЁ])\.(?=\s|$|[,;:—])', lambda m: LETTERS.get(m.group(1), m.group(1)), t)
    for pat, ph in LEXICON[-1:]:  # аббревиатуры — до смены регистра
        t = re.sub(pat, ph, t)
    t = re.sub(r'\b[А-ЯЁ]{2,}\b', lambda m: m.group(0).capitalize(), t)
    for pat, ph in LEXICON[:-1]:
        t = re.sub(pat, ph, t)
    t = re.sub(r'\s*[—–]\s*', ', ', t)
    t = re.sub(r'\.{3}|…', ', ', t)
    t = re.sub(r'[«»"„“]', '', t)
    t = re.sub(r':\s*', ', ', t)
    t = re.sub(r',\s*,', ',', t)
    t = re.sub(r'\s+', ' ', t).strip(' ,')
    if not re.search(r'[.!?]$', t):
        t += '.'
    return t


def plain(spoken):
    """текст без фонем — для сравнения с распознанным"""
    rev = {ph: re.sub(r'\\b', '', pat) for pat, ph in LEXICON}
    for ph, w in rev.items():
        spoken = spoken.replace(ph, w)
    return spoken


_voices = {}


def voice(name):
    if name not in _voices:
        _voices[name] = PiperVoice.load(os.path.join(CACHE, f'voices/ru_RU-{name}-medium.onnx'))
    return _voices[name]


def synth(role, spoken, out_mp3):
    cfg = ROLES[role]
    syn = SynthesisConfig(length_scale=cfg['length'], noise_scale=cfg['noise'], noise_w_scale=cfg['noise_w'])
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    try:
        with wave.open(tmp, 'wb') as w:
            voice(cfg['voice']).synthesize_wav(spoken, w, syn_config=syn)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', cfg['fx'] + ',' + TAIL,
                        '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '56k', out_mp3], check=True)
    finally:
        os.unlink(tmp)


def duration_ms(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True, check=True)
    return round(float(r.stdout.strip()) * 1000)


def asr_norm(s):
    s = re.sub(r'(\d+)[,.](\d+)', r'\1 \2', s)  # Whisper пишет числа цифрами: «22.50», «99,7»
    s = re.sub(r'\d+', lambda m: ' ' + num(int(m.group(0))) + ' ', s)
    return re.sub(r'\s+', ' ', re.sub(r'[^а-яё ]', ' ', s.lower().replace('ё', 'е').replace('-', ' '))).strip()


def score(spoken, mp3):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from asr import transcribe
    got = asr_norm(transcribe(mp3))
    return difflib.SequenceMatcher(None, asr_norm(plain(spoken)), got).ratio(), got


# дублей на фразу: синтез каждый раз немного разный, оставляем самый разборчивый (по распознаванию речи)
TAKES = {'narrator': 6, 'sys': 4, 'orpheus': 3}
GOOD = 0.96


def main():
    force = '--force' in sys.argv
    asr = '--asr' in sys.argv
    items = json.load(open(os.path.join(CACHE, 'all.json'), encoding='utf-8'))
    items = [it for it in items if re.search(r'[А-Яа-яЁё]', it['text'])]  # «...» — молчание, не озвучивается
    os.makedirs(OUT, exist_ok=True)
    stamp_file = os.path.join(CACHE, 'stamps.json')
    stamps = json.load(open(stamp_file)) if os.path.exists(stamp_file) else {}
    index, made = {}, 0
    for it in items:
        spoken = normalize(it['text'])
        cfg = ROLES[it['role']]
        takes = external_takes(it['role'], it['key'])
        ext_sig = [(os.path.basename(t), os.path.getsize(t)) for t in takes]
        stamp = hashlib.sha1(json.dumps([spoken, cfg, TAIL, TAKES[it['role']], ext_sig, EXTERNAL.get(it['role'], {}).get('fx') if takes else None], ensure_ascii=False).encode()).hexdigest()[:16]
        path = os.path.join(OUT, it['key'] + '.mp3')
        st = stamps.get(it['key'])
        if takes and (force or not isinstance(st, dict) or st.get('stamp') != stamp or not os.path.exists(path)):
            # готовые записи: выбираем самый разборчивый дубль
            best = None
            for t in takes:
                tmp = path + '.ext.mp3'
                process_external(it['role'], t, tmp)
                sc, got = score(spoken, tmp)
                if best is None or sc > best[0]:
                    if best:
                        os.unlink(best[1])
                    best = (sc, tmp + '.best', got, os.path.basename(t))
                    os.replace(tmp, best[1])
                else:
                    os.unlink(tmp)
            os.replace(best[1], path)
            stamps[it['key']] = dict(stamp=stamp, score=round(best[0], 3), got=best[2], source=best[3])
            made += 1
        elif not takes and (force or not isinstance(st, dict) or st.get('stamp') != stamp or not os.path.exists(path)):
            best = None
            for take in range(TAKES[it['role']]):
                tmp = path + f'.take{take}.mp3'
                synth(it['role'], spoken, tmp)
                sc, got = score(spoken, tmp)
                if best is None or sc > best[0]:
                    if best:
                        os.unlink(best[1])
                    best = (sc, tmp, got)
                else:
                    os.unlink(tmp)
                if sc >= GOOD:
                    break
            os.replace(best[1], path)
            stamps[it['key']] = dict(stamp=stamp, score=round(best[0], 3), got=best[2])
            made += 1
        index[it['key']] = duration_ms(path)
    keep = set(index)
    for f in os.listdir(OUT):
        if f.endswith('.mp3') and f[:-4] not in keep:
            os.unlink(os.path.join(OUT, f))
    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), separators=(',', ':'), sort_keys=True)
    json.dump(stamps, open(stamp_file, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    total = sum(index.values()) / 1000
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)) / 1048576
    print(f'[voice] реплик: {len(index)}, новых: {made}, звучания {total:.0f} с, {size:.1f} МБ')
    by = {}
    for it in items:
        by.setdefault(it['role'], []).append(stamps[it['key']]['score'])
    print('[voice] разборчивость (распознавание речи, 1.0 — дословно):',
          {k: round(sum(v) / len(v), 3) for k, v in by.items()},
          '· ниже 0.8:', sum(1 for v in by.values() for x in v if x < 0.8))


if __name__ == '__main__':
    main()
