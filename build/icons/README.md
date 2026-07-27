アップロード手順

1) アップロード場所
- 単一の高解像度PNGをアップロードしてください: `build/icons/source.png`

2) 推奨元画像
- 1024x1024 PNG（透過推奨）を用意してください。

3) 必要な出力ファイル（electron-builderが自動検出します）
- Windows: `build/icons/icon.ico` (.ico)
- macOS: `build/icons/icon.icns` (.icns)
- Linux: `build/icons/icon.png`（256×256推奨）

4) 変換手順（ローカルで行う）
- ImageMagickでICOを作る例:

```bash
# source.png が 1024x1024 の場合 (Windows: ImageMagick v7 の場合は `magick` を使います)
# magick がインストールされているなら以下を実行:
magick build/icons/source.png -define icon:auto-resize=256,128,64,48,32,16 build/icons/icon.ico

# 代替: npmパッケージで変換する（ImageMagick を使いたくない場合）
npx png-to-ico build/icons/source.png > build/icons/icon.ico
```

- macOSでICNSを作る例:

```bash
# ディレクトリを作り画像をコピーしてiconutilで変換
mkdir -p tmp.iconset
sips -z 16 16     build/icons/source.png --out tmp.iconset/icon_16x16.png
sips -z 32 32     build/icons/source.png --out tmp.iconset/icon_16x16@2x.png
sips -z 32 32     build/icons/source.png --out tmp.iconset/icon_32x32.png
sips -z 64 64     build/icons/source.png --out tmp.iconset/icon_32x32@2x.png
sips -z 128 128   build/icons/source.png --out tmp.iconset/icon_128x128.png
sips -z 256 256   build/icons/source.png --out tmp.iconset/icon_128x128@2x.png
sips -z 256 256   build/icons/source.png --out tmp.iconset/icon_256x256.png
sips -z 512 512   build/icons/source.png --out tmp.iconset/icon_256x256@2x.png
sips -z 512 512   build/icons/source.png --out tmp.iconset/icon_512x512.png
sips -z 1024 1024 build/icons/source.png --out tmp.iconset/icon_512x512@2x.png
iconutil -c icns tmp.iconset -o build/icons/icon.icns
rm -r tmp.iconset
```

5) 確認
- 画像を`build/icons/`に置いたら、私に知らせてください。ビルド設定は既に`package.json`の`build.icon`に反映済みです。
