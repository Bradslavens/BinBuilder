import { describe, it, expect } from 'vitest';
import { cleanAiLabel, labelFromResponse } from '../js/item-ai.js';

describe('cleanAiLabel', () => {
  it('strips wrapping quotes and trailing period', () => {
    expect(cleanAiLabel('"TV remote."')).toBe('TV remote');
  });

  it('collapses whitespace', () => {
    expect(cleanAiLabel('  paperback\n  book ')).toBe('paperback book');
  });

  it('caps runaway responses at 60 characters', () => {
    expect(cleanAiLabel('x'.repeat(200)).length).toBeLessThanOrEqual(60);
  });

  it('returns empty string for empty or missing input', () => {
    expect(cleanAiLabel('')).toBe('');
    expect(cleanAiLabel(null)).toBe('');
  });
});

describe('labelFromResponse', () => {
  it('reads a plain string content', () => {
    const data = { choices: [{ message: { content: 'TV remote' } }] };
    expect(labelFromResponse(data)).toBe('TV remote');
  });

  it('reads content returned as an array of parts', () => {
    const data = {
      choices: [{ message: { content: [{ type: 'text', text: 'garden trowel' }] } }],
    };
    expect(labelFromResponse(data)).toBe('garden trowel');
  });

  it('returns empty string for malformed responses', () => {
    expect(labelFromResponse({})).toBe('');
    expect(labelFromResponse({ choices: [] })).toBe('');
    expect(labelFromResponse({ choices: [{ message: {} }] })).toBe('');
  });
});
