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

// Thin wrapper over the Africa's Talking Node SDK. CJS-only, so it loads
// via createRequire — once, here, never at module top level (ESM project).
// Sandbox mode comes from AT_USERNAME=sandbox; no code path differs live.
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
    // No bundled types — shape pinned locally to the send() contract.
    const AfricasTalking = require('africastalking') as (options: {
      apiKey: string;
      username: string;
    }) => { SMS: AfricasTalkingService['sms'] };
    const client = AfricasTalking({
      apiKey: config.getOrThrow<string>('AT_API_KEY'),
      username: config.getOrThrow<string>('AT_USERNAME'),
    });
    this.sms = client.SMS;
    // Optional: sandbox rejects unregistered sender IDs, so empty omits
    // `from` entirely.
    this.senderId = config.get<string>('AT_SENDER_ID') ?? '';
  }

  // Resolves with the provider message id (stored as at_message_id) or
  // throws — the caller decides FAILED vs retry. 101 is provider success.
  async sendSms(to: string, message: string): Promise<SmsSendResult> {
    const response = await this.sms.send({
      to: [to],
      message,
      ...(this.senderId ? { from: this.senderId } : {}),
    });
    const data = response.SMSMessageData;
    const recipient = data.Recipients[0];
    if (!recipient) {
      // Provider-level refusal with no per-recipient rows — surface the
      // message instead of a cryptic empty.
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
