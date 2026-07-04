# Prompt for Claude Code

Build a mobile-first Progressive Web App called **BinBuilder** for inventorying items stored in crates in a storage unit. I will open it in Chrome on my Android phone and install it to my home screen. Prioritize a fast, hands-busy-friendly workflow over visual polish.

## Core workflow (the whole point of the app)

1. User taps "Log a crate."
2. Camera opens and scans a QR code on the crate (QR contains a crate ID string like `CRATE-007`). On successful scan: play a distinct beep, vibrate, and flash a green overlay. If the crate ID is new, create it automatically.
3. The app immediately starts recording continuous video. A large red "recording" indicator and a big STOP button are shown. The user holds each item in front of the camera for a second or two, then drops it in the crate, then shows the next item.
4. On STOP, the app processes the video locally: extract candidate frames (one per second is fine for v1) and show them in a review grid.
5. In the review grid the user can: tap frames to delete blurry/duplicate/empty ones, optionally type a short label on any frame, then tap SAVE. Saved frames become "items" belonging to that crate.

## Other screens

- **Bin list**: all crates with item counts and a thumbnail strip.
- **Bin detail**: photo grid of items; tap for full-size view; edit label or delete item.
- **Search**: search item labels across all crates; results show the item photo and its crate ID.
- **QR generator**: enter a number of crates (e.g., 20) and it renders a printable page of QR codes with the crate ID printed under each code, sized for standard label sheets. Include a print button.
- **Export/backup**: download a ZIP (or at minimum a JSON file plus images) of all data; and an import function to restore it.

## Technical requirements

- Plain HTML/CSS/JS or a lightweight framework — your choice, but keep the build simple enough to run with a static file server.
- Camera: `getUserMedia` with the rear camera (`facingMode: environment`).
- QR scanning: use the native `BarcodeDetector` API when available, with the `jsQR` library as a fallback.
- Video: record with `MediaRecorder`; extract frames by seeking through the recorded blob in a hidden `<video>` element and drawing to a `<canvas>`, saving frames as JPEG blobs. Do NOT upload anything; all processing is on-device.
- Storage: IndexedDB (feel free to use the `idb` wrapper). Schema: crates (id, name, createdAt) and items (id, crateId, imageBlob, thumbnailBlob, label, createdAt). Generate small thumbnails for grid views so they load fast.
- PWA: manifest + service worker so it works fully offline after first load and can be installed to the home screen.
- Feedback: use the Web Audio API for two distinct sounds (scan success vs. save success) and `navigator.vibrate`.
- Handle permission denials and unsupported APIs gracefully with clear messages.
- Note in the README that camera APIs require HTTPS (or localhost), and include instructions for testing on my phone — e.g., serving locally and using `npx serve` plus a tunneling option, or deploying the static build to a free host.

## Nice-to-haves if time permits (in priority order)

1. Basic blur detection to auto-discard blurry extracted frames (variance of Laplacian on the canvas is fine).
2. Scene-change detection instead of fixed 1-frame-per-second, so each shown item yields roughly one frame.
3. A "quick add" text-only mode for items not worth photographing.

## Quality bar

- Big touch targets; the user's hands are full.
- Everything must work offline.
- Test the frame-extraction pipeline carefully — seeking a recorded `MediaRecorder` blob can be finicky (duration metadata issues with WebM); use the known workaround of seeking to a huge time first to force duration calculation if needed.
- Write a short README covering setup, testing on a phone, and how to print the QR labels.
