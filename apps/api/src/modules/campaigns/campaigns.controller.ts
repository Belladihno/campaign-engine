import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { SseService, WorkspaceEvent } from '../../shared/sse/sse.service.js';
import { CampaignsService } from './campaigns.service.js';
import { CreateCampaignDto } from './dto/create-campaign.dto.js';

// `events` precedes `:id` — Nest matches in definition order, and
// `GET /campaigns/events` would otherwise route as id='events'.
@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly sse: SseService,
    private readonly jwt: JwtService,
  ) {}

  // Live stream (TRD §5.3). EventSource cannot send headers, so the JWT
  // travels as ?token= — validated here, on this route only.
  @Public()
  @Sse('events')
  async events(
    @Query('token') token: string | undefined,
  ): Promise<Observable<WorkspaceEvent>> {
    if (!token) {
      throw new UnauthorizedException('Missing SSE token');
    }
    let workspaceId: string;
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        workspaceId: string;
      }>(token);
      workspaceId = payload.workspaceId;
    } catch {
      throw new UnauthorizedException('Invalid SSE token');
    }
    return this.sse.getStream(workspaceId);
  }

  // Optional Idempotency-Key: replays answer 200 with the original,
  // fresh creates 201. Passthrough preserves the { data } envelope.
  @Post()
  async create(
    @CurrentUser('workspaceId') workspaceId: string,
    @Body() dto: CreateCampaignDto,
    @Headers('idempotency-key') key: string | string[] | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const idempotencyKey = Array.isArray(key) ? key[0] : key;
    const { campaign, replayed } = await this.campaigns.create(
      workspaceId,
      dto,
      idempotencyKey,
    );
    res.status(replayed ? 200 : 201);
    return campaign;
  }

  @Get()
  list(@CurrentUser('workspaceId') workspaceId: string) {
    return this.campaigns.list(workspaceId);
  }

  @Get(':id')
  getOne(
    @CurrentUser('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.campaigns.getOne(workspaceId, id);
  }
}
