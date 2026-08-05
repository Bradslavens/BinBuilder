# Prompt for Claude Code — BinBuilder for Android (native Kotlin)

Copy everything below the line into a fresh Claude Code session on the machine
that will hold the Android repo.

---

Build a native Android app called **BinBuilder** in Kotlin with Jetpack Compose
for inventorying items stored in bins. It is a ground-up native rewrite of an
existing PWA, and it must stay data-compatible with that PWA through a shared
backup format (spec below). Prioritize a fast, hands-busy capture workflow over
everything else — speed is the product's differentiator against competitors
like SmartPacks, whose add-an-item flow takes five taps per item.

## Core workflow (the whole point)

1. User taps **Log a bin**.
2. Camera opens and scans a QR label (payload matches `^BIN-[\w-]+$`,
   case-insensitive) using ML Kit barcode scanning. On scan: distinct beep,
   vibration, green flash. Unknown IDs create a new bin automatically.
   Alternative path: photograph the bin's handwritten label instead (create the
   bin from the photo; OCR the label with ML Kit text recognition and let the
   user correct it).
3. **Item capture must be tap-to-capture**: full-screen CameraX viewfinder,
   user holds an item up and taps anywhere on the screen — photo captured
   instantly with a shutter sound/vibration, counter increments, viewfinder
   stays live for the next item. No add buttons, no per-item save dialogs, no
   gallery pickers. Ever.
4. A review grid follows: tap frames to delete bad ones, then Save. Saved
   photos become items in the bin.

## AI descriptions and keyword bubbles

- A background pass describes each item photo. One API call per item returns
  JSON: `{"description": "...", "keywords": ["...", ...]}` — a ≤250-char
  searchable description plus 3–8 short keywords, one per distinct thing
  visible (deliberately including incidentals like a hand or background fabric).
- Keywords render as **chips with an × each** on the item detail view: one tap
  removes a wrong tag. Users can also add a keyword. Cap at 8 keywords,
  40 chars each, deduped case-insensitively.
- API: OpenRouter chat-completions (`https://openrouter.ai/api/v1/chat/completions`),
  default model `anthropic/claude-haiku-4.5`, user-supplied key stored via
  **EncryptedSharedPreferences/Keystore**, image downscaled to **1024px long
  edge, JPEG quality 85**, `max_tokens` 250. If the model replies with plain
  text instead of JSON, use the whole text as the description and no keywords.
- Put the API call behind an interface (e.g. `ItemDescriber`) — a hosted
  backend with prepaid credits and QR-label allowances will replace the direct
  call later; nothing outside that type should know who is billed.
- Description semantics (must match the PWA exactly):
  - `aiLabel` absent/null = never processed (background pass picks it up);
    empty string = processed, nothing to say; non-empty = the description.
  - `userLabel` is a user-typed correction and always wins for display; keep
    `aiLabel` underneath so the edit is revertible without a paid re-scan.
  - Skip the AI call for items that already have a `userLabel`.
  - On API failure, stop the pass and retry on a later run; never mark the
    item processed.
- Search matches `userLabel` + `aiLabel` + keywords, case-insensitive.

## Photo storage (hard requirement)

- Photos must **never** enter the device gallery / MediaStore. Write JPEGs to
  internal app storage (`filesDir`) — item image + small thumbnail per item,
  plus bin photos. Android Auto Backup's 25 MB quota cannot hold photos, so the
  ZIP export below is the real backup path; exclude the photo directory from
  Auto Backup via `dataExtractionRules` to avoid partial backups, and say so in
  the README.
- Item/bin metadata in **Room**; store file names, not blobs, in the database.

## Screens

- **Home**: Log a bin, plus a setup nudge if no AI key is saved.
- **Bin list**: newest first, thumbnail + item count.
- **Bin detail**: photo grid; tap an item for full view with description,
  keyword chips, edit/delete.
- **Search**: one field across bin names/descriptions and item text; results
  show thumbnail, bin name, description. With no AI key and no hand-written
  descriptions, show a browse-by-date grid instead.
- **Settings**: AI key entry with a "test key" round trip, model override,
  last AI error surfaced, export/import, delete-all.

## Backup format (interop contract — do not deviate)

Export/import a ZIP identical to the PWA's, via the Storage Access Framework
(`ACTION_CREATE_DOCUMENT` / `ACTION_OPEN_DOCUMENT`):

- `manifest.json`:
  ```json
  {
    "version": 3,
    "exportedAt": "ISO-8601",
    "bins": [{ "id", "displayName", "description", "entryMethod": "qr|photo",
               "createdAt", "binPhotoFile": "bin-photos/<id>.jpg|null" }],
    "items": [{ "id", "binId", "label", "createdAt", "isTextOnly",
                "aiLabel?", "userLabel?", "aiKeywords?": ["..."],
                "imageFile": "item-images/<id>.jpg|null",
                "thumbnailFile": "item-images/<id>-thumb.jpg|null" }]
  }
  ```
- `aiLabel`/`userLabel`/`aiKeywords` are **omitted when absent** — writing
  null or `""` for an unprocessed item would stop it ever being described.
- Import accepts version 1–3 manifests (older ones simply carry less) and
  offers merge or replace-all.
- Item IDs are UUID strings; timestamps are ISO-8601 strings.

## Quality bar

- minSdk 26, targetSdk current, Kotlin + Compose + Material 3, coroutines.
  Dependencies limited to Jetpack, CameraX, ML Kit, and standard libraries
  (`java.util.zip` covers the backup ZIP).
- Big touch targets; the user's hands are full. Distinct sounds for scan
  success vs. save success.
- Handle camera-permission denial with a clear path to app settings.
- Unit tests for: description semantics (tri-state `aiLabel`), keyword
  cleaning, backup round-trip, AI response parsing (JSON, fenced JSON, plain
  text).
- Unique visual identity: dark, warm-green accent is the brand direction —
  do NOT imitate SmartPacks' look, colors, or sticker design.
- No subscriptions anywhere in the app or code.
