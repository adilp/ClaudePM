# App Icons

To generate all required icon sizes from a source PNG, run:

```bash
npm run tauri icon /path/to/icon.png
```

The source icon should be at least 512x512 pixels.

Required icon files:
- 32x32.png
- 128x128.png
- 128x128@2x.png (256x256)
- icon.icns (macOS)
- icon.ico (Windows)

For development, placeholder icons are provided.
