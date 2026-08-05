import { describe, it, expect } from 'vitest';
import {
  itemDescription, hasUserDescription, cleanUserDescription, needsAiDescription,
  itemSearchText, itemKeywords,
} from '../js/items.js';

describe('itemDescription', () => {
  it('prefers a user-written description over the AI one', () => {
    expect(itemDescription({ aiLabel: 'a blue mug', userLabel: "Dad's coffee mug" }))
      .toBe("Dad's coffee mug");
  });

  it('falls back to the AI description when there is no user one', () => {
    expect(itemDescription({ aiLabel: 'a blue mug' })).toBe('a blue mug');
  });

  it('ignores a blank user description', () => {
    expect(itemDescription({ aiLabel: 'a blue mug', userLabel: '   ' })).toBe('a blue mug');
  });

  it('returns empty string when the item has no description at all', () => {
    expect(itemDescription({})).toBe('');
    expect(itemDescription(undefined)).toBe('');
  });

  it('returns empty string when the AI ran but found nothing to say', () => {
    expect(itemDescription({ aiLabel: '' })).toBe('');
  });
});

describe('hasUserDescription', () => {
  it('is true only for a non-blank user description', () => {
    expect(hasUserDescription({ userLabel: 'garden trowel' })).toBe(true);
    expect(hasUserDescription({ userLabel: '  ' })).toBe(false);
    expect(hasUserDescription({ aiLabel: 'garden trowel' })).toBe(false);
    expect(hasUserDescription(undefined)).toBe(false);
  });
});

describe('cleanUserDescription', () => {
  it('trims and collapses whitespace, including newlines from the textarea', () => {
    expect(cleanUserDescription('  winter\n\n  coats ')).toBe('winter coats');
  });

  it('caps very long input at 500 characters', () => {
    expect(cleanUserDescription('x'.repeat(900)).length).toBe(500);
  });

  it('returns empty string for empty or missing input', () => {
    expect(cleanUserDescription('')).toBe('');
    expect(cleanUserDescription(null)).toBe('');
    expect(cleanUserDescription(undefined)).toBe('');
  });
});

describe('itemSearchText', () => {
  it('matches on the overridden AI text as well as the user text', () => {
    // Renaming "a blue mug" to "Dad's mug" shouldn't make the item
    // unfindable by what it actually looks like.
    const text = itemSearchText({ aiLabel: 'a blue mug', userLabel: "Dad's mug" });
    expect(text).toContain('blue mug');
    expect(text).toContain("dad's mug");
  });

  it('is lowercased so callers can compare against a lowercased query', () => {
    expect(itemSearchText({ aiLabel: 'Garden Trowel' })).toBe('garden trowel');
  });

  it('returns empty string for an item with no descriptions', () => {
    expect(itemSearchText({})).toBe('');
    expect(itemSearchText(undefined)).toBe('');
  });

  it('matches on AI keywords, not just descriptions', () => {
    const text = itemSearchText({ aiLabel: 'a camera', aiKeywords: ['Nikon', 'tripod'] });
    expect(text).toContain('nikon');
    expect(text).toContain('tripod');
  });
});

describe('itemKeywords', () => {
  it('returns the stored keywords', () => {
    expect(itemKeywords({ aiKeywords: ['mug', 'blue'] })).toEqual(['mug', 'blue']);
  });

  it('returns an empty array when keywords are missing or malformed', () => {
    expect(itemKeywords({})).toEqual([]);
    expect(itemKeywords(undefined)).toEqual([]);
    expect(itemKeywords({ aiKeywords: 'mug' })).toEqual([]);
  });
});

describe('needsAiDescription', () => {
  it('is true for an unprocessed photo item', () => {
    expect(needsAiDescription({ imageBlob: {}, aiLabel: undefined })).toBe(true);
  });

  it('is false once the AI has run, even if it found nothing to say', () => {
    expect(needsAiDescription({ imageBlob: {}, aiLabel: '' })).toBe(false);
    expect(needsAiDescription({ imageBlob: {}, aiLabel: 'a blue mug' })).toBe(false);
  });

  it('is false without a photo to send', () => {
    expect(needsAiDescription({ aiLabel: undefined })).toBe(false);
  });

  it('is false when the user already wrote the description themselves', () => {
    // Otherwise we would spend a paid API call to produce a label that the
    // user has already overruled and that nothing will ever display.
    expect(needsAiDescription({ imageBlob: {}, aiLabel: undefined, userLabel: 'ski boots' }))
      .toBe(false);
  });
});
