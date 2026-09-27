/* Client mirror of apps/api sms.ts (server decides at submit).
   GSM-7: 160 chars, 153 concatenated. Unicode: 70 / 67 UTF-16 units. */
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '\f^{}\\[~\\]|€';

export function countSegments(message) {
  let septets = 0;
  for (const ch of message) {
    if (GSM_BASIC.includes(ch)) septets += 1;
    else if (GSM_EXTENDED.includes(ch)) septets += 2;
    else {
      const units = message.length;
      return units <= 70 ? 1 : Math.ceil(units / 67);
    }
  }
  return septets <= 160 ? 1 : Math.ceil(septets / 153);
}

export function detectEncoding(message) {
  for (const ch of message) {
    if (!GSM_BASIC.includes(ch) && !GSM_EXTENDED.includes(ch)) {
      return 'unicode';
    }
  }
  return 'gsm7';
}
