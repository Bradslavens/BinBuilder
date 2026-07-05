import { describe, it, expect } from 'vitest';
import { cleanOcrText } from '../js/ocr.js';

describe('cleanOcrText', () => {
  it('collapses multi-line OCR output into a single trimmed line', () => {
    expect(cleanOcrText('  Hello \n\n  World  \n')).toBe('Hello World');
  });

  it('collapses runs of whitespace', () => {
    expect(cleanOcrText('a\t\t b   c')).toBe('a b c');
  });

  it('handles empty and nullish input', () => {
    expect(cleanOcrText('')).toBe('');
    expect(cleanOcrText(null)).toBe('');
    expect(cleanOcrText(undefined)).toBe('');
  });

  it('drops blank lines', () => {
    expect(cleanOcrText('line1\n   \nline2')).toBe('line1 line2');
  });
});
