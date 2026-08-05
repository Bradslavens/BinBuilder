// How an item's description is decided.
//
// Items can carry two descriptions: `aiLabel`, written by the background AI
// pass, and `userLabel`, typed by the user while browsing. A user description
// always wins — it exists precisely because the AI got it wrong. The AI text is
// kept rather than overwritten so the edit can be undone without paying for the
// photo to be described a second time.
//
// `aiLabel === undefined` still means "not processed yet" (see item-ai.js);
// `''` means the AI ran and had nothing to say.

export const MAX_USER_DESCRIPTION_CHARS = 500;

// Descriptions render as one line in grid captions and search results, so a
// multi-line textarea entry is flattened the same way AI text is.
export function cleanUserDescription(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_USER_DESCRIPTION_CHARS);
}

export function hasUserDescription(item) {
  return typeof item?.userLabel === 'string' && item.userLabel.trim() !== '';
}

export function itemDescription(item) {
  if (hasUserDescription(item)) return item.userLabel;
  return item?.aiLabel || '';
}

// AI-suggested search terms, one per thing visible in the photo. The user can
// delete wrong ones (a hand, background fabric) or add their own, so the array
// is edited in place — there is no ai/user split like descriptions have.
export function itemKeywords(item) {
  return Array.isArray(item?.aiKeywords) ? item.aiKeywords : [];
}

// Search matches against both descriptions, not just the displayed one:
// correcting "a blue mug" to "Dad's mug" shouldn't make the item unfindable by
// what it looks like. Keywords widen the net further ("kitchen", "Nikon").
export function itemSearchText(item) {
  return [item?.userLabel, item?.aiLabel, ...itemKeywords(item)]
    .filter((text) => typeof text === 'string' && text)
    .join(' ')
    .toLowerCase();
}

export function needsAiDescription(item) {
  return !!item?.imageBlob && item.aiLabel === undefined && !hasUserDescription(item);
}
