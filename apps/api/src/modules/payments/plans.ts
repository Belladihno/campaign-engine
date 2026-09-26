// Fixed plans (TRD §7.4). Amounts are in kobo — Paystack's minor unit
// (₦1,000 → 100,000 kobo). Credits are SMS units, credited ONLY by the
// verified webhook (TRD §9.5), never here.
export const PAYMENT_PLANS = {
  plan_starter: { amountKobo: 100_000, credits: 50, label: 'Starter' },
  plan_growth: { amountKobo: 250_000, credits: 150, label: 'Growth' },
  plan_pro: { amountKobo: 500_000, credits: 350, label: 'Pro' },
} as const;

export type PlanId = keyof typeof PAYMENT_PLANS;
export const PLAN_IDS = Object.keys(PAYMENT_PLANS) as PlanId[];
