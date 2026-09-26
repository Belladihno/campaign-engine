import { Global, Module } from '@nestjs/common';
import { SseService } from './sse.service.js';

// Global so DeliveryProcessor, WebhooksService, and the campaigns SSE
// endpoint (Step 11) can all inject SseService without imports (TRD Step 13).
@Global()
@Module({
  providers: [SseService],
  exports: [SseService],
})
export class SseModule {}
