# BinBuilder

Mobile-first Progressive Web App for inventorying items stored in bins. Scan a pre-printed QR label or photograph your bin, record video while packing items, review extracted frames, and save — all on your device.

## Features

- **Log a bin** via QR scan or bin photo (with on-device OCR)
- **Record items** with continuous video; frames extracted locally
- **Review grid** — tap to remove bad frames, optional labels, then save
- **Bin list & detail** — browse inventory with thumbnails
- **Search** across item labels and bin descriptions
- **Export/import** backup as ZIP or JSON
- **Offline** after first load (PWA + service worker)

## Requirements

- Modern mobile browser (Chrome on Android recommended)
- **HTTPS or localhost** for camera access
- Pre-printed QR labels are optional (available for purchase); photo mode works with handwritten labels

## Quick start (desktop / local network)

```bash
cd BinBuilder
npm install
npm run serve
```

Opens at `http://localhost:3000`.

## Testing on your Android phone

Camera APIs require a **secure context** (HTTPS or localhost). Options:

### Option A: Tunnel (recommended)

```bash
npm run serve
# In another terminal:
npx localtunnel --port 3000
# or: npx ngrok http 3000
```

Open the HTTPS URL on your phone in Chrome, then **Add to Home screen**.

### Option B: Same Wi-Fi (may not work for camera)

Find your computer's LAN IP and open `http://192.168.x.x:3000`. Note: some browsers block camera on non-HTTPS LAN URLs.

### Option C: Deploy to a free static host

Upload the project folder to Netlify, Vercel, GitHub Pages, or Cloudflare Pages. All provide HTTPS.

### Install as PWA

1. Open the app in Chrome on Android
2. Menu → **Add to Home screen** / **Install app**
3. Launch from home screen for full-screen experience

## Usage

1. Tap **Log a bin**
2. Choose **Scan QR label** (pre-printed `BIN-###` labels) or **Photo of bin** (handwritten labels, no QR needed)
3. For photo mode: take a picture, edit detected text if needed, tap **Continue**
4. Record video while showing each item to the camera; tap **STOP**
5. Review frames, remove blurry/duplicate shots, add optional labels, tap **Save**

## QR labels

BinBuilder does not generate printable QR codes. Pre-printed QR labels are offered for purchase separately. If you don't have labels, use **Photo of bin**.

## Backup

**More → Download ZIP** exports all bins, photos, and items. Import restores from `.zip` or `.json`. Choose merge or replace-all when importing.

## Tech notes

- Storage: IndexedDB (on-device only)
- QR: `BarcodeDetector` with `jsQR` fallback
- OCR: Tesseract.js (first use may download language data; cached for offline)
- Video: `MediaRecorder` → local frame extraction via canvas
- Frame extraction uses scene-change detection and blur filtering

## Project structure

```
index.html          App shell
manifest.webmanifest PWA manifest
sw.js               Service worker
css/app.css         Mobile-first styles
js/                 Application modules
icons/              PWA icons
```

## License

ISC