#!/usr/bin/env bash
# Сборка APK без Gradle — напрямую инструментами Android SDK.
# Нужны пакеты Ubuntu: aapt apksigner zipalign dalvik-exchange android-sdk-platform-23 и JDK.
# Результат: dist/Afterimage.apk
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
SDK_JAR=/usr/lib/android-sdk/platforms/android-23/android.jar
OUT=build-android/apk
KS=tools/android/afterimage.keystore

[ -f build-android/index.html ] || npm run build
rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/assets/assets"
cp build-android/index.html "$OUT/assets/index.html"
for sub in bg portraits; do mkdir -p "$OUT/assets/assets/$sub"; cp assets/$sub/*.webp "$OUT/assets/assets/$sub/"; done

aapt package -f -m -J "$OUT/gen" -M android/AndroidManifest.xml -S android/res -I "$SDK_JAR"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$SDK_JAR" -classpath "$SDK_JAR" \
  -d "$OUT/classes" android/src/ru/afterimage/game/MainActivity.java "$OUT/gen/ru/afterimage/game/R.java"
dalvik-exchange --dex --min-sdk-version=24 --output="$OUT/classes.dex" "$OUT/classes"
aapt package -f -M android/AndroidManifest.xml -S android/res -A "$OUT/assets" -I "$SDK_JAR" -F "$OUT/unsigned.apk" -0 webp
(cd "$OUT" && aapt add -f unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -alias afterimage -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass afterimage -keypass afterimage -dname "CN=Afterimage, O=Afterimage" >/dev/null 2>&1
fi
apksigner sign --ks "$KS" --ks-key-alias afterimage --ks-pass pass:afterimage --key-pass pass:afterimage \
  --min-sdk-version 24 --v4-signing-enabled false --out dist/Afterimage.apk "$OUT/aligned.apk"
apksigner verify --min-sdk-version 24 dist/Afterimage.apk
echo "[apk] dist/Afterimage.apk — $(du -h dist/Afterimage.apk | cut -f1)"
