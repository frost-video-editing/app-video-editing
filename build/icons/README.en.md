Icon upload and conversion

1) Upload location
- Place a single high-resolution PNG at: `build/icons/source.png`

2) Recommended source image
- 1024×1024 PNG (transparent background recommended)

3) Output files required (electron-builder detects these automatically)
- Windows: `build/icons/icon.ico` (.ico)
- macOS: `build/icons/icon.icns` (.icns)
- Linux / other: `build/icons/icon-256.png` (256×256 recommended)

4) Conversion examples (do locally)
- Using ImageMagick (Windows / macOS / Linux). If using ImageMagick v7, use `magick`:

```powershell
# If you have magick installed (recommended):
magick build/icons/source.png -define icon:auto-resize=256,128,64,48,32,16 build/icons/icon.ico

# Create a 256px PNG for Linux:
magick build/icons/source.png -resize 256x256 build/icons/icon-256.png

# Create an ICNS (macOS) from source (iconutil example on macOS):
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

- npm fallback (if you prefer not to use ImageMagick):

```powershell
npx png-to-ico build/icons/source.png > build/icons/icon.ico
```

5) Verification
- After placing the images in `build/icons/`, the project is already configured to use them via the `build.icon` setting in `package.json`.

If you want, I can run the conversion here (I already have ImageMagick installed). Tell me when `build/icons/source.png` is present and I'll run the commands and confirm the generated files.
