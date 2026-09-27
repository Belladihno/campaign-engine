import { describeSms } from '../sms.js';

describe('describeSms', () => {
  it('counts plain ASCII as one GSM-7 segment', () => {
    expect(describeSms('Hello from Campaign Engine')).toEqual({
      encoding: 'gsm7',
      segments: 1,
    });
  });

  it('counts extension-table characters as two septets', () => {
    // '€' is GSM-7 but escaped: 79 € + 2 septets = 81 total, still 1 segment.
    expect(describeSms(`€${'a'.repeat(79)}`).segments).toBe(1);
    expect(describeSms('a'.repeat(160)).segments).toBe(1);
    expect(describeSms('a'.repeat(161)).segments).toBe(2);
  });

  it('switches to unicode on emoji and bills 70/67 units', () => {
    expect(describeSms('Hello 🎉').encoding).toBe('unicode');
    expect(describeSms('🎉'.repeat(35)).segments).toBe(1); // 70 units
    expect(describeSms('🎉'.repeat(36)).segments).toBe(2); // 72 units
  });
});
