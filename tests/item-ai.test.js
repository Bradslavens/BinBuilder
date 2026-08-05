import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cleanAiLabel, cleanKeywords, resultFromResponse, describeItemPhoto,
  AI_IMAGE_MAX_WIDTH, MAX_KEYWORDS,
} from '../js/item-ai.js';
import { resizeImageBlob } from '../js/thumbnails.js';

// jsdom has no canvas, so the real downscale can't run here.
vi.mock('../js/thumbnails.js', () => ({
  resizeImageBlob: vi.fn(async (blob) => blob),
}));

vi.mock('../js/utils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  blobToDataUrl: vi.fn(async () => 'data:image/jpeg;base64,AAAA'),
}));

function response(content) {
  return { choices: [{ message: { content } }] };
}

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

describe('cleanKeywords', () => {
  it('trims entries and drops empties', () => {
    expect(cleanKeywords([' blue  mug ', '', '  '])).toEqual(['blue mug']);
  });

  it('dedupes case-insensitively, keeping the first casing', () => {
    expect(cleanKeywords(['Nikon', 'nikon', 'camera'])).toEqual(['Nikon', 'camera']);
  });

  it(`caps the list at ${MAX_KEYWORDS} chips`, () => {
    const many = Array.from({ length: 20 }, (_, i) => `kw${i}`);
    expect(cleanKeywords(many)).toHaveLength(MAX_KEYWORDS);
  });

  it('returns empty array for non-array input', () => {
    expect(cleanKeywords(undefined)).toEqual([]);
    expect(cleanKeywords('mug')).toEqual([]);
  });

  it('ignores non-string junk inside the array', () => {
    expect(cleanKeywords([{ a: 1 }, ['x'], 'mug', 7])).toEqual(['mug', '7']);
  });
});

describe('resultFromResponse', () => {
  it('parses the requested JSON shape', () => {
    const data = response('{"description":"A blue mug","keywords":["mug","blue","kitchen"]}');
    expect(resultFromResponse(data)).toEqual({
      label: 'A blue mug',
      keywords: ['mug', 'blue', 'kitchen'],
    });
  });

  it('parses JSON wrapped in a markdown code fence', () => {
    const data = response('```json\n{"description":"A hammer","keywords":["hammer","tool"]}\n```');
    expect(resultFromResponse(data)).toEqual({ label: 'A hammer', keywords: ['hammer', 'tool'] });
  });

  it('treats a plain-text response as the description with no keywords', () => {
    // Models that ignore the JSON instruction, and older mocks, land here.
    expect(resultFromResponse(response('TV remote'))).toEqual({ label: 'TV remote', keywords: [] });
  });

  it('reads content returned as an array of parts', () => {
    const data = response([{ type: 'text', text: '{"description":"garden trowel","keywords":["trowel"]}' }]);
    expect(resultFromResponse(data)).toEqual({ label: 'garden trowel', keywords: ['trowel'] });
  });

  it('survives JSON with missing fields', () => {
    expect(resultFromResponse(response('{"keywords":["mug"]}'))).toEqual({ label: '', keywords: ['mug'] });
    expect(resultFromResponse(response('{"description":"a mug"}'))).toEqual({ label: 'a mug', keywords: [] });
  });

  it('returns empty result for malformed responses', () => {
    expect(resultFromResponse({})).toEqual({ label: '', keywords: [] });
    expect(resultFromResponse({ choices: [] })).toEqual({ label: '', keywords: [] });
    expect(resultFromResponse({ choices: [{ message: {} }] })).toEqual({ label: '', keywords: [] });
  });
});

describe('describeItemPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => response('{"description":"a blue mug","keywords":["mug","blue"]}'),
    }));
  });

  // 512px was too small to read brand names and small print, which is the most
  // common cause of an item being described wrongly. Guards against a
  // well-meaning "let's save tokens" change silently undoing that.
  it('uploads the photo at 1024px so small text and logos survive', async () => {
    await describeItemPhoto(new Blob(['photo']), 'sk-or-test', 'anthropic/claude-haiku-4.5');

    expect(AI_IMAGE_MAX_WIDTH).toBe(1024);
    expect(resizeImageBlob).toHaveBeenCalledWith(expect.anything(), 1024, expect.any(Number));
  });

  it('returns the description and keywords from one call', async () => {
    const result = await describeItemPhoto(new Blob(['photo']), 'sk-or-test', 'model');
    expect(result).toEqual({ label: 'a blue mug', keywords: ['mug', 'blue'] });
  });
});
