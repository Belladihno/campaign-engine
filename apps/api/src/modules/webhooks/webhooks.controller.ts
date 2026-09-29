import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { WebhooksService } from './webhooks.service.js';

// No JWT here — both providers authenticate with shared secrets instead.
@Public()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooks: WebhooksService) {}

  @Post('paystack')
  @HttpCode(200)
  async handlePaystack(
    @Req() req: { body: unknown },
    @Headers('x-paystack-signature') signature: string | undefined,
  ) {
    // express.raw() leaves a Buffer; without it, re-serializing fails
    // verification closed, never open.
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body));
    this.logger.log(
      `Paystack webhook hit — signature present: ${!!signature}, body: Buffer(${rawBody.length}b)`,
    );
    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }
    this.logger.log('About to call handlePaystack()');
    try {
      const result = await this.webhooks.handlePaystack(rawBody, signature);
      this.logger.log('handlePaystack() completed successfully');
      return result;
    } catch (error) {
      this.logger.error('handlePaystack() FAILED', (error as Error)?.stack);
      throw error;
    }
  }

  // Secret arrives as ?secret=; the route never answers non-200 (AT
  // retries those as deliverable failures).
  @Post('africas-talking')
  @HttpCode(200)
  handleAfricasTalking(
    @Body() body: Record<string, unknown>,
    @Query('secret') secret: string | undefined,
  ) {
    const messageId = typeof body?.id === 'string' ? body.id : undefined;
    const status = typeof body?.status === 'string' ? body.status : undefined;
    return this.webhooks.handleAfricasTalking({ messageId, status }, secret);
  }
}
