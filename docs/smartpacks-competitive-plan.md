# SmartPacks research & BinBuilder go-to-market plan

Written 2026-08-05. Companion to [future-token-billing.md](future-token-billing.md),
which covers the hosted-AI backend in more depth.

## 1. What SmartPacks actually is

- **Developer:** SmartPacks Technology Yazilim Limited Sirketi (small Turkish
  company). iOS + Android + Mac + Vision Pro.
- **Physical product:** 48 laminated 2"×2.5" QR stickers, **$9.99 on Amazon**,
  color-coded, sold as the acquisition channel for the free app.
- **App revenue:** free download, then **SmartPacks Pro at $9.99/mo or
  $79.99/yr** for "unlimited AI usage," Smart Search (semantic search), and
  extra profiles. Free tier has AI usage limits.
- **AI features:** per-photo keyword suggestions shown as deletable bubbles;
  "Smart Search" that matches "winter clothes" → sweaters/jackets/scarves.
- **Weaknesses (from reviews — rating is only 2.4/5 on 15 ratings):**
  freezing during barcode scans, broken landscape mode, keywords can't be
  edited without delete-and-recreate, and the slow add-item flow the user
  experienced first-hand (+ → add media → camera/roll → snap → save, per item).

### Which AI model do they use?

**Not disclosed anywhere** — not on the site, App Store listing, or privacy
policy. Inference from behavior:

- Fast per-object keyword bubbles is classic **object detection**, which can be
  done free and instantly **on-device** (Apple Vision framework / Google ML
  Kit). That would explain the speed.
- Gating "unlimited AI" behind Pro implies at least part of it is a **hosted
  paid API** (most likely a GPT-4o-mini/Haiku-class vision model, and an
  embeddings model for Smart Search).

Either way, nothing they do requires a frontier model. Our Haiku 4.5 at 1024px
(~$0.0016/photo) already matches or beats their quality tier, and keyword
extraction rides along in the same call for free.

## 2. What we take from them vs. what we keep

**Keep (our advantages):** tap-to-capture speed (their #1 weakness), offline-
first PWA core, on-device storage, export/backup, no subscription.

**Adopt from them:**

1. **Keyword bubbles per item** — deletable chips so hands/fabric/background
   junk is removed with one tap.
2. **Semantic-ish search** — keywords make plain-text search much better
   immediately; true embedding search can come later.
3. **Label-led acquisition** — Amazon label sales are the customer funnel.
   This is their genuinely smart move and it sidesteps the app-store discovery
   problem entirely.
4. **Polished look** — do a design pass with our own palette/identity. Do not
   copy their colors, sticker trade dress, or name style (trademark risk).

## 3. Feature: keyword bubbles (Phase 1 — pure frontend, no backend needed)

Change `js/item-ai.js` to ask for structured output in the same single call:

```
Reply with JSON: {"description": "<250 chars>", "keywords": ["...", ...]}
```

- Store `aiKeywords: string[]` next to `aiLabel` on the item record
  (`js/db.js`, and include in export/import — remember the e50fd30 bug class).
- Render chips in the review grid and item modal (`js/views/item-modal.js`);
  tap a chip's × to delete it. Deleted keywords leave the search index.
- Search (`js/views/search.js`) matches `aiKeywords` in addition to labels.
- Cost: ~zero extra — same image tokens, ~30 more output tokens per scan.
- Speed stays identical: capture is still tap-tap-tap; AI remains the existing
  background pass.

Bonus over SmartPacks: make chips **editable/addable**, since "can't edit
keywords" is a top complaint in their reviews.

## 4. Photo storage: separate from the Photos album, still in iCloud

**Yes, this works — but only cleanly as a wrapped native app, not as a pure
PWA.**

- Photos taken via `getUserMedia`/canvas never touch the user's photo album in
  the first place (already true today). The question is durability + iCloud.
- **iOS PWA problem:** IndexedDB in Safari/home-screen PWAs can be evicted
  under storage pressure and is not reliably in iCloud backups. Users can lose
  their whole inventory. This alone justifies wrapping.
- **iOS native (Capacitor):** write photo blobs to the app's **Documents
  directory** via the Filesystem plugin. That directory is (a) invisible to the
  Photos app, (b) **automatically included in iCloud device backup** with zero
  extra code, and (c) not evictable. Optional later: CloudKit private database
  for true cross-device sync (bigger lift; backup ≠ sync).
- **Android native:** app-private storage; Android Auto Backup caps at 25 MB
  (useless for photos), so keep our ZIP export and optionally add a "backup to
  Google Drive" action later.

Migration note: on first native launch, copy existing IndexedDB blobs to the
filesystem, keep item metadata in IndexedDB (it's small; the blobs are the risk).

## 5. Revenue model recommendation: labels first, credits second

Offer **both**, with labels as the flagship:

### Option A (primary): label packs with AI included

- Pack: **48 stickers = 12 unique QR codes × 4 copies** (one per box side).
- Each code includes an AI allowance, e.g. **100 item descriptions per code**
  → 1,200 scans max per pack.
- **List on the box:** "No subscription. Ever. AI included." — direct hit on
  SmartPacks' $79.99/yr Pro and their 2.4-star reviews.

**Unit economics (verify current prices before committing):**

| | Amount |
| --- | --- |
| Retail (recommend) | **$12.99–14.99** (SmartPacks is $9.99, but they charge for Pro separately; we bundle AI) |
| Amazon referral ~15% | −$2.00 |
| FBA fulfillment (small envelope) | −$4.00 |
| Sticker printing/packaging | −$1.50 |
| **Worst-case AI COGS** (1,200 scans × $0.0016 Haiku @1024px) | −$1.92 |
| **Worst-case margin @ $13.99** | **≈ $4.50** |

Realistic AI usage will be far below the cap (most people don't fill 12 bins ×
100 items), so expected margin is higher. At $9.99 retail the worst case is
roughly breakeven — **don't match their price; sell the no-subscription story
instead.** Do NOT use a 48-unique-code pack with a 100-item cap (4,800 scans =
$7.68 worst-case COGS blows the margin).

### Option B (secondary): prepaid credits in-app

Exactly the plan in [future-token-billing.md](future-token-billing.md) — for
users who found the app first, ran out of label allowance, or use handwritten
labels. Packs from $5 (250 scans) to $40 (3,500).

### Why both

- Labels solve **customer acquisition** (Amazon search: "moving box labels QR")
  — the app store alone won't find you customers.
- Credits monetize app-first users and cap-exceeders with no extra hardware.
- **App-store fee arbitrage:** labels are *physical goods*, so Apple/Google
  take **0%** (guideline 3.1.5 permits physical goods outside IAP). Credits are
  digital consumables → must use IAP/Play Billing at 15% (small-business
  tier). Every dollar shifted to labels keeps ~15% more margin.

### QR label controls (anti-abuse)

- **Code format:** short serial + HMAC signature, e.g. `BB1-7F3K9Q-x2m4`
  (server holds the secret; codes can't be guessed or minted by third parties).
- **Server-side enforcement:** the AI proxy (the backend from
  future-token-billing.md) validates the code and decrements its counter —
  never trust the client. Decrement on success only; refund on provider error.
- **Activation binding:** first scan binds the code to an anonymous
  account/device id; allow ~3 devices per code (households share). Photocopying
  a label doesn't help an attacker — the cap is per-code, so cloning can't
  increase our cost beyond the cap.
- **Non-AI features never gated:** scanning, browsing, search, export all work
  with any label or none. Only AI descriptions consume allowance. (Same rule as
  the credits plan: never charge for what costs us nothing.)
- Photo-of-bin mode remains the free/no-label path — it feeds the funnel.

## 6. Publishing to iOS and Android

**Recommendation: wrap the existing PWA with Capacitor.** The codebase stays
one vanilla-JS app; Capacitor adds a native shell per platform.

Why Capacitor over alternatives:
- Pure PWA: not accepted in the Apple App Store; iOS storage eviction risk.
- Android TWA (Play Store PWA wrapper): fine for Android but doesn't solve iOS,
  and we'd maintain two publishing paths.
- Rewrite (React Native/Flutter): throws away a working, tested app. No.

What changes:
- `getUserMedia` camera code works as-is in iOS WKWebView (14.3+) and Android
  WebView — the capture flow ports untouched.
- Add `@capacitor/filesystem` for photo storage (§4), `@capacitor/app` basics.
- Keep the web/PWA build alive as the free demo + dev environment.

Checklist per store:

| | iOS | Android |
| --- | --- | --- |
| Account | Apple Developer, $99/yr | Play Console, $25 once |
| Build | Xcode (needs a Mac or cloud Mac CI) | Android Studio / Gradle |
| Billing for credits | IAP consumable (15% small-biz rate) | Play Billing (15%) |
| Labels | No IAP needed (physical, sold on Amazon/web) | Same |
| Review notes | Explain camera use; privacy "nutrition label": photos stay on device | Data-safety form: same |
| Timeline | 1–3 days review typical | Hours–1 day |

Privacy story is a genuine listing advantage: photos never leave the device
except the AI call, nothing is linked to identity. SmartPacks can't say that as
cleanly.

## 7. Phased roadmap

1. **Phase 1 — Keyword chips (now, ~days):** structured AI output, chip UI,
   chip-aware search, export/import round-trip. No backend. Ship in the PWA.
2. **Phase 2 — Backend + both revenue rails (~weeks):** AI proxy with our key,
   prepaid credits, QR-code registry with per-code caps + HMAC serials.
   (Details in future-token-billing.md.)
3. **Phase 3 — Native wrap + stores (~weeks, overlaps 2):** Capacitor, filesystem
   photo storage + iCloud backup, IndexedDB→filesystem migration, IAP for
   credits, submit to both stores.
4. **Phase 4 — Labels on Amazon:** design stickers (own palette/branding),
   print run, FBA listing, insert card with app QR + activation instructions.

Design pass (unique colors, look) rides along Phases 1–3.

## 8. Open decisions

- Final pack price ($12.99 vs $14.99) and cap (100/code is comfortable; even
  150 keeps worst case under $3 COGS).
- Sync (CloudKit/Drive) vs backup-only for v1 — recommend backup-only.
- Whether the free tier of AI (no label, no credits) exists at all — recommend
  a small trial (e.g. 25 scans) to demo the magic before asking for money.
