import { Global, Module } from '@nestjs/common';
import { SseService } from './sse.service.js';

// Global so the worker, webhooks, and SSE endpoint inject without importing.
@Global()
@Module({
  providers: [SseService],
  exports: [SseService],
})
export class SseModule {}
