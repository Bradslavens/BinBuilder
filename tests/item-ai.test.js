import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanAiLabel, labelFromResponse, requestItemLabel, AI_IMAGE_MAX_WIDTH } from '../js/item-ai.js';
import { resizeImageBlob } from '../js/thumbnails.js';

// jsdom has no canvas, so the real downscale can't run here.
vi.mock('../js/thumbnails.js', () => ({
  resizeImageBlob: vi.fn(async (blob) => blob),
}));

vi.mock('../js/utils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  blobToDataUrl: vi.fn(async () => 'data:image/jpeg;base64,AAAA'),
}));

describe('cleanAiLabel', () => {
  it('strips wrapping quotes but keeps sentence punctuation', () => {
    expect(cleanAiLabel('"A black TV remote with grey buttons."')).toBe('A black TV remote with grey buttons.');
  });

  it('collapses whitespace', () => {
    expect(cleanAiLabel('  paperback\n  book ')).toBe('paperback book');
  });

  it('caps runaway responses at 250 characters', () => {
    expect(cleanAiLabel('x'.repeat(600)).length).toBeLessThanOrEqual(250);
  });

  it('returns empty string for empty or missing input', () => {
    expect(cleanAiLabel('')).toBe('');
    expect(cleanAiLabel(null)).toBe('');
  });
});

describe('requestItemLabel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'a blue mug' } }] }),
    }));
  });

  // 512px was too small to read brand names and small print, which is the most
  // common cause of an item being described wrongly. Guards against a
  // well-meaning "let's save tokens" change silently undoing that.
  it('uploads the photo at 1024px so small text and logos survive', async () => {
    await requestItemLabel(new Blob(['photo']), 'sk-or-test', 'anthropic/claude-haiku-4.5');

    expect(AI_IMAGE_MAX_WIDTH).toBe(1024);
    expect(resizeImageBlob).toHaveBeenCalledWith(expect.anything(), 1024, expect.any(Number));
  });

  it('returns the cleaned description from the response', async () => {
    const label = await requestItemLabel(new Blob(['photo']), 'sk-or-test', 'model');
    expect(label).toBe('a blue mug');
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
