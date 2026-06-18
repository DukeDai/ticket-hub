import { describe, it, expect } from 'vitest';
import { escapeRegex } from '../regex';

describe('escapeRegex', () => {
  it('escapes all regex metacharacters', () => {
    expect(escapeRegex('.*')).toBe('\\.\\*');
    expect(escapeRegex('(a+)+')).toBe('\\(a\\+\\)\\+');
    expect(escapeRegex('[abc]')).toBe('\\[abc\\]');
    expect(escapeRegex('a|b')).toBe('a\\|b');
    expect(escapeRegex('^abc$')).toBe('\\^abc\\$');
    expect(escapeRegex('a\\b')).toBe('a\\\\b');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeRegex('park ticket')).toBe('park ticket');
    expect(escapeRegex('hello123')).toBe('hello123');
  });

  it('handles empty string', () => {
    expect(escapeRegex('')).toBe('');
  });

  it('escapes every metacharacter in one pass (no double-escape)', () => {
    // 输入 .*  → \\.\\* (each char escaped once, no re-escape of the new backslash)
    expect(escapeRegex('.*')).toBe('\\.\\*');
    // 如果做了 double-escape，结果会是 \\\\\\.\\\\\\*，这里没
    expect(escapeRegex('.*').length).toBe(4);
  });

  it('produces regex source that matches the literal string', () => {
    const re = new RegExp(escapeRegex('.*foo'), 'i');
    expect(re.test('.*foo')).toBe(true);
    expect(re.test('xxx')).toBe(false); // 不会匹配"任意字符"扩大化
  });
});
