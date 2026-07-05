import { describe, it, expect, vi } from 'vitest';
import { escapeHtml, debounce, formatBinDateLabel, uuid } from '../js/utils.js';

describe('escapeHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(escapeHtml('<script>alert("x & y")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x &amp; y&quot;)&lt;/script&gt;',
    );
  });

  it('coerces non-strings', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(null)).toBe('null');
  });

  it('leaves safe text untouched', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123');
  });
});

describe('debounce', () => {
  it('invokes the function only once after the delay', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    debounced('b');
    debounced('c');
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
    vi.useRealTimers();
  });
});

describe('formatBinDateLabel', () => {
  it('prefixes the formatted date with "Bin "', () => {
    const label = formatBinDateLabel(new Date('2026-07-05T14:30:00'));
    expect(label.startsWith('Bin ')).toBe(true);
  });
});

describe('uuid', () => {
  it('returns a string', () => {
    expect(typeof uuid()).toBe('string');
    expect(uuid().length).toBeGreaterThan(0);
  });
});
