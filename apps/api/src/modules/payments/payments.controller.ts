import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { InitiatePaymentDto } from './dto/initiate-payment.dto.js';
import { PaymentsService } from './payments.service.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('initiate')
  initiate(
    @CurrentUser('userId') userId: string,
    @CurrentUser('workspaceId') workspaceId: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.payments.initiate(userId, workspaceId, dto);
  }

  @Get()
  history(@CurrentUser('workspaceId') workspaceId: string) {
    return this.payments.listHistory(workspaceId);
  }
}
