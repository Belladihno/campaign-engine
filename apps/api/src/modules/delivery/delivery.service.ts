import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRequire } from 'node:module';

export interface SmsSendResult {
  messageId: string;
}

interface AfricasTalkingRecipient {
  messageId: string;
  status: string;
  statusCode: number;
  number: string;
  cost: string;
}

interface AfricasTalkingResponse {
  SMSMessageData: {
    Message: string;
    Recipients: AfricasTalkingRecipient[];
  };
}

// Thin wrapper over the Africa's Talking Node SDK (TRD §7.5).
// The SDK is CommonJS-only, so it loads via createRequire — once, here,
// never at module top level (ESM project). Sandbox mode is selected by
// AT_USERNAME=sandbox; no code path differs between sandbox and live.
@Injectable()
export class AfricasTalkingService {
  private readonly sms: {
    send: (options: {
      to: string[];
      message: string;
      from?: string;
    }) => Promise<AfricasTalkingResponse>;
  };
  private readonly senderId: string;

  constructor(config: ConfigService) {
    const require = createRequire(import.meta.url);
    // No bundled types — shape pinned locally to the send() contract only.
    const AfricasTalking = require('africastalking') as (options: {
      apiKey: string;
      username: string;
    }) => { SMS: AfricasTalkingService['sms'] };
    const client = AfricasTalking({
      apiKey: config.getOrThrow<string>('AT_API_KEY'),
      username: config.getOrThrow<string>('AT_USERNAME'),
    });
    this.sms = client.SMS;
    // Optional: sandbox rejects unregistered sender IDs outright
    // (InvalidSenderId), so an empty value omits `from` entirely.
    this.senderId = config.get<string>('AT_SENDER_ID') ?? '';
  }

  // Sends to one recipient. Resolves with the provider message id (stored
  // as at_message_id for receipt matching) or throws — the caller decides
  // FAILED vs retry-from-QUEUED. statusCode 101 is provider success.
  async sendSms(to: string, message: string): Promise<SmsSendResult> {
    const response = await this.sms.send({
      to: [to],
      message,
      ...(this.senderId ? { from: this.senderId } : {}),
    });
    const data = response.SMSMessageData;
    const recipient = data.Recipients[0];
    if (!recipient) {
      // Provider-level refusal (e.g. InvalidSenderId) — no per-recipient
      // rows to inspect, surface the message instead of a cryptic empty.
      throw new Error(`Africa's Talking refused send: ${data.Message}`);
    }
    if (recipient.statusCode !== 101) {
      throw new Error(
        `Africa's Talking rejected ${to}: ${recipient.status}`,
      );
    }
    return { messageId: recipient.messageId };
  }
}
