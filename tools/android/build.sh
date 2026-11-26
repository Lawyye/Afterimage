#!/usr/bin/env bash
# Сборка APK без Gradle — напрямую инструментами Android SDK.
# Нужны пакеты Ubuntu: aapt apksigner zipalign dalvik-exchange android-sdk-platform-23 и JDK.
# Результат: dist/Afterimage.apk
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
SDK_JAR=/usr/lib/android-sdk/platforms/android-23/android.jar
OUT=build-android/apk
# Ключ подписи в репозитории не хранится. Путь и пароль берутся из переменных окружения
# AFTERIMAGE_KEYSTORE / AFTERIMAGE_KS_PASS, иначе из tools/android/release.keystore и release.pass (оба в .gitignore).
# Новый ключ: AFTERIMAGE_NEW_KEY=1 npm run apk  (APK с другим ключом не обновит уже установленную игру).
KS="${AFTERIMAGE_KEYSTORE:-tools/android/release.keystore}"
PASS_FILE="${KS%.*}.pass"   # пароль лежит рядом с ключом: release.keystore → release.pass
if [ ! -f "$KS" ]; then
  if [ "${AFTERIMAGE_NEW_KEY:-}" != 1 ]; then
    echo "[apk] нет ключа подписи $KS. Положите его туда (и пароль в $PASS_FILE) или создайте новый: AFTERIMAGE_NEW_KEY=1" >&2
    exit 1
  fi
  ( umask 077; python3 -c "import secrets,string;a=string.ascii_letters+string.digits;print(''.join(secrets.choice(a) for _ in range(32)),end='')" > "$PASS_FILE" )
  ( umask 077; keytool -genkeypair -keystore "$KS" -storetype PKCS12 -alias afterimage -keyalg RSA -keysize 3072 -validity 10000 \
    -storepass:file "$PASS_FILE" -keypass:file "$PASS_FILE" -dname "CN=Afterimage, O=Afterimage" >/dev/null 2>&1 )
  echo "[apk] создан новый ключ $KS"
fi
if [ -n "${AFTERIMAGE_KS_PASS:-}" ]; then PASS_ARG="env:AFTERIMAGE_KS_PASS"; else PASS_ARG="file:$PASS_FILE"; fi

[ -f build-android/index.html ] || npm run build
rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/assets/assets"
cp build-android/index.html "$OUT/assets/index.html"
for sub in bg portraits bodies; do mkdir -p "$OUT/assets/assets/$sub"; cp assets/$sub/*.webp "$OUT/assets/assets/$sub/"; done

aapt package -f -m -J "$OUT/gen" -M android/AndroidManifest.xml -S android/res -I "$SDK_JAR"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$SDK_JAR" -classpath "$SDK_JAR" \
  -d "$OUT/classes" android/src/ru/afterimage/game/MainActivity.java "$OUT/gen/ru/afterimage/game/R.java"
dalvik-exchange --dex --min-sdk-version=24 --output="$OUT/classes.dex" "$OUT/classes"
aapt package -f -M android/AndroidManifest.xml -S android/res -A "$OUT/assets" -I "$SDK_JAR" -F "$OUT/unsigned.apk" -0 webp
(cd "$OUT" && aapt add -f unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
apksigner sign --ks "$KS" --ks-key-alias afterimage --ks-pass "$PASS_ARG" \
  --min-sdk-version 24 --v4-signing-enabled false --out dist/Afterimage.apk "$OUT/aligned.apk"
apksigner verify --min-sdk-version 24 dist/Afterimage.apk
echo "[apk] dist/Afterimage.apk — $(du -h dist/Afterimage.apk | cut -f1)"
