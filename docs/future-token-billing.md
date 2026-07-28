# Future: hosted AI with token billing

Status: **not started — parked deliberately.** BinBuilder ships BYOK (the user
pastes their own OpenRouter key). This document captures the plan for replacing
that with a hosted, metered service so the decisions don't have to be
re-derived later.

Written 2026-07-27.

## What we have vs. what we want

Today: **BYOK** — bring your own key. `js/ai-settings.js` stores an OpenRouter
key in localStorage and `js/item-ai.js` calls `openrouter.ai` straight from the
browser. The user pays OpenRouter directly; we never see the money or the
photos.

Wanted: our key, our bill, customers buy prepaid credits. The industry terms
for the pieces:

| Piece | Term |
| --- | --- |
| Our server holds the key; the app calls us instead of OpenRouter | backend-for-frontend (BFF) / API proxy / server-side key custody |
| Charging per unit of AI work | usage-based (metered) billing |
| Prepaid tokens spent per scan | prepaid credits (accounting: *deferred revenue*; expired unspent credits are *breakage*) |
| The business shape | reselling inference at a markup — API spend is COGS |

**The blocker is architectural, not incremental.** BinBuilder is a static PWA on
GitHub Pages. Anything shipped to the browser is readable by the user, so there
is no way to use our key without standing up a backend. That backend — accounts,
balances, payments, abuse controls — is the real cost of this feature. The
model call itself is the easy part.

## Model choice and the high-res finding

The most valuable insight from the analysis: **image resolution is probably a
bigger lever on description quality than model tier, and it is much cheaper.**

**Acted on 2026-07-28:** `js/item-ai.js` used to downscale to 512px wide at
quality 0.8, which is very small for "read the brand name off this box" and a
likely explanation for cheaper models "sometimes describing the item
incorrectly." It now uploads at **1024px / quality 0.85** (`AI_IMAGE_MAX_WIDTH`).
Current models accept up to 2576px on the long edge, so there is further room if
1024 still proves too small.

Note descriptions already generated at 512px are not regenerated — `aiLabel` is
set, so the background pass skips those items. A "re-describe this item" action
would be the fix if the improvement turns out to be worth backfilling.

**Test Sonnet 5 at 1024px before paying for Opus.** A weaker model on a good
image usually beats a stronger model on a thumbnail.

### Cost per scan

Anthropic list prices (OpenRouter mirrors these and adds a cut on credit
purchases). Assumes ~400 input tokens at 512px, ~1,100 at 1024px, ~90 output
tokens. **Re-verify before launch — prices move.**

| Model | @512px | @1024px |
| --- | --- | --- |
| Haiku 4.5 ($1/$5 per M) | ~$0.0009 | ~$0.0016 |
| Sonnet 5 ($3/$15) | ~$0.0026 | ~$0.0047 |
| Opus 5 ($5/$25) | ~$0.0043 | ~$0.0078 |

Gotcha: **Opus 5 has thinking on by default**, and thinking tokens bill as
output. On a one-shot vision call that can quietly triple the cost. Set effort
to `low`/`medium` rather than disabling thinking outright — disabled thinking on
Opus 5 has its own failure modes (tool calls emitted as plain text, `<thinking>`
tags leaking into output).

Plan against a **ceiling of $0.01 per scan**.

Also worth improving alongside resolution: instruct the model to say the item is
unclear rather than guess. A confidently wrong description is worse for search
than a vague one.

## Billing model

**Prepaid credits, not a subscription.** The workload is bursty — someone
inventories their garage over one weekend and then does nothing for eight
months. A subscription for that user is either a rip-off or gets cancelled
immediately.

Two rules:

- **Charge per item description only, never per bin.** Scanning a bin QR or bin
  photo costs us nothing; charging for it is charging for something free.
- **Decrement on success only**, and refund the token on provider error.

Suggested packs — effective $0.011–0.02 per scan, so roughly 3–5x markup over a
~$0.005 COGS:

| Pack | Price | Per scan |
| --- | --- | --- |
| Free trial | 50 descriptions | — |
| Starter | $5 → 250 | $0.020 |
| Standard | $15 → 1,000 | $0.015 |
| Bulk | $40 → 3,500 | $0.011 |

Nothing under $5: Stripe's $0.30 + 2.9% eats ~9% of a $5 charge and far more
below that. Credits that never expire are simpler, avoid state gift-card rules,
and are a selling point.

A $6/mo "Pro" subscription may make sense later for professional organizers and
moving companies. Not for launch.

## Minimum viable backend

- **Cloudflare Workers + D1** (or Vercel + Postgres) — free tier covers early
  volume.
- Email magic-link auth. An identity is needed only to attach a balance to.
- One endpoint: `POST /describe` — verify session, check balance >= 1, call the
  model, decrement, return the description.
- Stripe Checkout + a `checkout.session.completed` webhook that credits the
  balance.
- Rate-limit per account, cap image size, reject non-images. An authenticated
  endpoint that calls a paid API is an abuse target.
- **Keep BYOK as an option.** It already works, costs us nothing to run, and
  power users prefer it.

Once there is a backend, calling Anthropic directly instead of via OpenRouter
removes OpenRouter's cut.

## Things not to forget

- Once photos flow through our server we become a data processor for other
  people's belongings. Don't retain images past the request, and say so in the
  UI.
- The PWA works offline today. A hosted proxy needs connectivity — the app must
  degrade gracefully, not break.
- Unspent credits are a liability on the books, not revenue.
