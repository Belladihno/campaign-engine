// SMS billing units (production-safety fix #6).
//
// Carriers bill per SEGMENT, not per message, and the segment size depends
// on encoding: GSM-7 packs 160 chars (153 when concatenated), while any
// character outside GSM-7 (emoji, Arabic, CJK…) flips the whole message to
// UCS-2 at 70 chars (67 concatenated). A 160-char cap alone therefore
// undercharges unicode traffic — billing must run on segments.
export type SmsEncoding = 'gsm7' | 'unicode';

export interface SmsInfo {
  encoding: SmsEncoding;
  segments: number;
}

// GSM 03.38 default alphabet. Extension-table characters occupy two
// septets (escape + code), hence the septet counting below.
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '\f^{}\\[~\\]|€';

const GSM_SINGLE_SEPTETS = 160;
const GSM_CONCAT_SEPTETS = 153;
const UCS2_SINGLE_UNITS = 70;
const UCS2_CONCAT_UNITS = 67;

export function describeSms(message: string): SmsInfo {
  let septets = 0;
  for (const char of message) {
    if (GSM_BASIC.includes(char)) {
      septets += 1;
    } else if (GSM_EXTENDED.includes(char)) {
      septets += 2;
    } else {
      // UCS-2 counts UTF-16 code units (a surrogate-pair emoji is 2),
      // so message.length — not code points — is the honest measure.
      const units = message.length;
      return {
        encoding: 'unicode',
        segments:
          units <= UCS2_SINGLE_UNITS
            ? 1
            : Math.ceil(units / UCS2_CONCAT_UNITS),
      };
    }
  }
  return {
    encoding: 'gsm7',
    segments:
      septets <= GSM_SINGLE_SEPTETS
        ? 1
        : Math.ceil(septets / GSM_CONCAT_SEPTETS),
  };
}
