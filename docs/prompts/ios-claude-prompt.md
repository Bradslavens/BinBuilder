# Prompt for Claude Code — BinBuilder for iOS (native Swift)

Copy everything below the line into a fresh Claude Code session on the machine
that will hold the iOS repo.

---

Build a native iOS app called **BinBuilder** in Swift/SwiftUI for inventorying
items stored in bins. It is a ground-up native rewrite of an existing PWA, and
it must stay data-compatible with that PWA through a shared backup format
(spec below). Prioritize a fast, hands-busy capture workflow over everything
else — speed is the product's differentiator against competitors like
SmartPacks, whose add-an-item flow takes five taps per item.

## Core workflow (the whole point)

1. User taps **Log a bin**.
2. Camera opens and scans a QR label (payload matches `^BIN-[\w-]+$`,
   case-insensitive). On scan: distinct beep, haptic, green flash. Unknown IDs
   create a new bin automatically. Alternative path: photograph the bin's
   handwritten label instead (create the bin from the photo; OCR the label text
   with the Vision framework and let the user correct it).
3. **Item capture must be tap-to-capture**: full-screen viewfinder, user holds
   an item up and taps anywhere on the screen — photo captured instantly with a
   shutter sound/haptic, counter increments, viewfinder stays live for the next
   item. No add buttons, no per-item save dialogs, no camera-roll pickers. Ever.
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
  default model `anthropic/claude-haiku-4.5`, user-supplied key stored in the
  **Keychain**, image downscaled to **1024px long edge, JPEG quality 0.85**,
  `max_tokens` 250. If the model replies with plain text instead of JSON, use
  the whole text as the description and no keywords.
- Put the API call behind a protocol (e.g. `ItemDescriber`) — a hosted
  backend with prepaid credits and QR-label allowances will replace the direct
  call later; nothing outside that type should know who is billed.
- Description semantics (must match the PWA exactly):
  - `aiLabel` absent/nil = never processed (background pass picks it up);
    empty string = processed, nothing to say; non-empty = the description.
  - `userLabel` is a user-typed correction and always wins for display; keep
    `aiLabel` underneath so the edit is revertible without a paid re-scan.
  - Skip the AI call for items that already have a `userLabel`.
  - On API failure, stop the pass and retry on a later run; never mark the
    item processed.
- Search matches `userLabel` + `aiLabel` + keywords, case-insensitive.

## Photo storage (hard requirement)

- Photos must **never** enter the user's Photos library. Write JPEGs to the
  app's **Application Support** directory (item image + small thumbnail per
  item, plus bin photos). That keeps them out of the Photos app while being
  **included automatically in iCloud device backup** — do not set
  `isExcludedFromBackup`.
- Item/bin metadata in **SwiftData** (or Core Data if you target below
  iOS 17); store file names, not blobs, in the database.

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

Export/import a ZIP identical to the PWA's, via the share sheet /
`fileImporter`:

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

- iOS 17+, SwiftUI, no third-party dependencies except a ZIP library
  (ZIPFoundation) if needed.
- Big touch targets; the user's hands are full. Distinct sounds for scan
  success vs. save success.
- Handle camera-permission denial with a clear path to Settings.
- Unit tests for: description semantics (tri-state `aiLabel`), keyword
  cleaning, backup round-trip, AI response parsing (JSON, fenced JSON, plain
  text).
- Unique visual identity: dark, warm-green accent is the brand direction —
  do NOT imitate SmartPacks' look, colors, or sticker design.
- No subscriptions anywhere in the app or code.
