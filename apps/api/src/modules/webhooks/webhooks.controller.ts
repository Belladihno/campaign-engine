import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { WebhooksService } from './webhooks.service.js';

// No JWT here — Paystack authenticates with the HMAC signature instead.
// NOTE: Africa's Talking delivery receipts land in Step 11 alongside the
// Contact entity they update.
@Public()
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('paystack')
  @HttpCode(200)
  handlePaystack(
    @Req() req: { body: unknown },
    @Headers('x-paystack-signature') signature: string | undefined,
  ) {
    // express.raw() (main.ts) leaves a Buffer; without it (tests, misconfig)
    // fall back to re-serializing — verification then fails closed, never open.
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body));
    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }
    return this.webhooks.handlePaystack(rawBody, signature);
  }
}
