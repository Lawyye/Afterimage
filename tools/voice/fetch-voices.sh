#!/usr/bin/env bash
# Голоса Piper для озвучки (лицензия CC0): https://huggingface.co/rhasspy/piper-voices
set -euo pipefail
D=.art-cache/tts/voices
mkdir -p "$D"
for v in denis dmitri; do
  for ext in onnx onnx.json; do
    f="$D/ru_RU-$v-medium.$ext"
    [ -f "$f" ] || curl -sfL -o "$f" "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/$v/medium/ru_RU-$v-medium.$ext"
  done
done
ls -la "$D"
