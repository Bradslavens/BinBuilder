# Prompt for Claude Code — BinBuilder for iOS (Swift / Xcode)

Build a native iOS app called **BinBuilder** for inventorying items stored in bins (storage totes/crates). This is a native port of an existing PWA; the spec below is self-contained. Prioritize a fast, hands-busy-friendly packing workflow over visual polish: the user is standing in a garage holding items, so touch targets are big and every step is one tap.

Use **Swift and SwiftUI** in an **Xcode project** targeting **iOS 17+**, iPhone only, portrait-first. No third-party dependencies unless truly necessary — Apple's frameworks cover everything below (AVFoundation, Vision, SwiftData, Compression/ZIPFoundation-style archiving via `NSFileCoordinator` is not needed; if you need ZIP, prefer Apple's `Archive`/libcompression or a single small SPM package such as ZIPFoundation).

## Core workflow (the whole point of the app)

1. User taps **Log a bin**.
2. Two ways to identify the bin:
   - **Scan QR label** — camera opens and scans a pre-printed QR code containing a bin ID like `BIN-007`. On successful scan: play a distinct sound, haptic buzz, green flash overlay. A new ID auto-creates the bin. Use `AVCaptureMetadataOutput` for QR detection (no library needed). The app does **not** generate QR labels.
   - **Photo of bin** — user photographs the bin's handwritten label. Run on-device OCR with Vision (`VNRecognizeTextRequest`, accurate mode) to extract the label text, show it in an editable text field so the user can fix mistakes, then **Continue**. Keep the bin photo as the bin's identifying image.
3. The app immediately starts **recording continuous video** (`AVCaptureMovieFileOutput`, rear camera). Big red recording indicator, elapsed time, and a huge STOP button. The user holds each item in front of the camera for a second or two, drops it in the bin, shows the next item.
4. On STOP, process the video **entirely on-device**:
   - Extract candidate frames with `AVAssetImageGenerator` using **scene-change detection** (compare downscaled grayscale frames; a large difference = new item being shown) rather than a fixed interval, so each shown item yields roughly one frame.
   - **Blur-filter** candidates (variance of Laplacian via Accelerate/vImage or a CoreImage convolution) and drop obviously blurry frames.
5. Show extracted frames in a **review grid**: tap a frame to remove it, optionally type a short label on any frame, tap **SAVE**. Saved frames become items belonging to that bin. Play a distinct save-success sound + haptic.

## Other screens

- **Home**: giant "Log a bin" button, plus navigation to the bin list, search, and settings.
- **Bin list**: all bins with display name, item count, and a thumbnail strip. Bins created via photo show their bin photo.
- **Bin detail**: photo grid of the bin's items; tap for full-size viewer; edit an item's label/description by hand; delete an item; edit the bin's name/description; delete the bin.
- **Search**: one search field matching across item labels, **AI descriptions** (below), user-edited descriptions, and bin names/descriptions. Results show the item photo, its matched text, and which bin it's in. Include a "Show all items" browse grid. Long AI descriptions must truncate cleanly — never let a cell overflow the screen.
- **Quick add**: a text-only mode to add an item without a photo (`isTextOnly` flag).
- **Settings**: AI settings (below), backup export/import, app version.

## AI item descriptions (key feature)

A background pass describes each item photo into a searchable description, using the **user's own OpenRouter API key** (`https://openrouter.ai/api/v1/chat/completions`, OpenAI-compatible chat format with an image content part).

- Default model: `anthropic/claude-haiku-4.5`; model ID is editable in settings.
- Store the API key in the **Keychain** — never in backups or exports.
- Downscale photos to **1024 px on the long edge** before upload (smaller makes brand names/small print unreadable and the model guesses wrong; larger wastes tokens).
- Prompt: "Describe the main item in this photo for a search index, in at most 250 characters. Mention the object, its colors, size, any visible text or brand names, pictures or logos, and any other detail that would help someone find it later. Reply with only the description, no preamble."
- Clean the reply (collapse whitespace, strip surrounding quotes, cap at 250 chars) and save as the item's `aiDescription`.
- **Tri-state semantics**: `aiDescription == nil` means "never described" — the background pass processes only those, so interrupted runs resume where they left off. An empty string means "described, nothing useful". Never write `""`/null to mark "pending".
- Run the pass whenever the app is foregrounded with a key configured and undescribed items exist; process sequentially, stop on network loss. Surface the **last error** (bad key, no credits) on the settings screen — never fail silently.
- The user can hand-edit any description (`userDescription` overrides `aiDescription` for display; search matches both).
- If no key is configured, the app works fully — search just matches labels only. Show a one-line pitch in settings for adding a key.

## Data model & storage

All data on-device. Use **SwiftData** (or Core Data) for metadata; store full-resolution JPEGs and thumbnails as files in Application Support (not in the database), referenced by item ID.

- **Bin**: `id` (the `BIN-###` string or a generated ID for photo bins), `displayName`, `description`, `entryMethod` ("qr" | "photo"), `binPhoto` (optional), `createdAt`.
- **Item**: `id` (UUID), `binId`, `label` (short user label, may be empty), `userDescription` (optional), `aiDescription` (optional, tri-state as above), `isTextOnly`, `image` + `thumbnail` files, `createdAt`.
- Generate ~200 px thumbnails at save time so grids scroll smoothly.

## Backup / restore — must interoperate with the existing web app

Export a ZIP via the share sheet (and import via a document picker / Files) using this exact layout, so backups move between the PWA and the iOS app:

- `manifest.json` at the root:
  ```json
  {
    "version": 2,
    "exportedAt": "ISO-8601",
    "bins": [{ "id", "displayName", "description", "entryMethod", "createdAt", "binPhotoFile" }],
    "items": [{ "id", "binId", "label", "createdAt", "isTextOnly", "aiLabel"?, "userLabel"?, "imageFile", "thumbnailFile" }]
  }
  ```
- Bin photos at `bin-photos/<binId>.jpg`; item images at `item-images/<itemId>.jpg` and thumbnails at `item-images/<itemId>-thumb.jpg`; the manifest references these relative paths (`null` when absent).
- Note the manifest uses the web app's field names `aiLabel`/`userLabel` for what the iOS model calls `aiDescription`/`userDescription` — map them on import/export. Only include `aiLabel` when it exists (tri-state rule above).
- Import supports `.zip` and bare `.json` (metadata only), with a **merge or replace-all** choice. Never let a restore drop AI descriptions — they cost real API credits to regenerate.
- The API key is never part of a backup.

## Platform details

- Request camera permission with a clear usage string; handle denial with a message and a button to open Settings.
- Sounds: two short distinct tones (scan success vs. save success) via `AVAudioPlayer` or `AudioServicesPlaySystemSound`; haptics via `UINotificationFeedbackGenerator`. Respect the silent switch for sounds but always fire haptics.
- Recording sessions can be long — write video to a temp file, delete it after frame extraction.
- All processing (OCR, QR, frame extraction, blur detection) is on-device; the **only** network call in the app is the optional OpenRouter request.
- Dark mode support via system colors.

## Quality bar

- Big touch targets everywhere; the user's hands are full.
- Works fully offline except AI descriptions.
- Test the frame-extraction pipeline carefully with real recorded videos (orientation, HEVC vs H.264, long recordings).
- Unit-test: scene-change detector, blur scorer, AI response cleaning, backup export/import round-trip (including the `aiLabel` tri-state and field-name mapping).
- Include a README covering: opening the project in Xcode, running on a device (camera doesn't work in the simulator — note what can still be tested there), and how to get an OpenRouter key.
