import { IsIn } from 'class-validator';
import { PLAN_IDS, type PlanId } from '../plans.js';

export class InitiatePaymentDto {
  @IsIn(PLAN_IDS)
  plan: PlanId;
}
