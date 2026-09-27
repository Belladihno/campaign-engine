import { describe, expect, it } from 'vitest';
import { countSegments, detectEncoding } from './sms';

describe('countSegments', () => {
  it('counts plain ASCII as one GSM-7 segment', () => {
    expect(countSegments('Hello from Campaign Engine')).toBe(1);
  });

  it('counts extension-table characters as two septets', () => {
    expect(countSegments(`€${'a'.repeat(79)}`)).toBe(1);
    expect(countSegments('a'.repeat(160))).toBe(1);
    expect(countSegments('a'.repeat(161))).toBe(2);
  });

  it('switches to unicode billing on emoji', () => {
    expect(countSegments('Hello 🎉')).toBe(1);
    expect(countSegments('🎉'.repeat(35))).toBe(1);
    expect(countSegments('🎉'.repeat(36))).toBe(2);
  });
});

describe('detectEncoding', () => {
  it('detects GSM-7 and unicode', () => {
    expect(detectEncoding('Hello 123')).toBe('gsm7');
    expect(detectEncoding('Hello 🎉')).toBe('unicode');
    expect(detectEncoding('€10')).toBe('gsm7');
  });
});
