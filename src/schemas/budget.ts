/** Mirrors poc-backend app/modules/agents/budget/schema.py (BudgetContent). Money and hours are 2-decimal strings. */
import { z } from "zod";

const numOrStr = z.union([z.string(), z.number()]);
const RateSnapshot = z.object({
  currency: z.string(),
  hours_per_day: numOrStr,
  roles: z.array(z.object({ role: z.string(), hourly_rate: numOrStr })),
});

const dec = z.string();

export const CostItem = z.object({
  component_id: z.string().nullable().default(null),
  category: z.enum(["infra", "licence", "third_party", "other"]),
  description: z.string(),
  recurrence: z.enum(["one_off", "monthly"]),
  amount: dec,
});

export const BudgetContent = z.object({
  summary: z.string(),
  /** Snapshot of the card the budget was priced with (dict[str, Any] server-side, so no card rules are re-applied). */
  rate_card: RateSnapshot,
  labour: z.object({
    by_role: z.array(z.object({ role: z.string(), days: dec, hours: dec, rate: dec, cost: dec })),
    by_milestone: z.array(z.object({ milestone_id: z.string(), title: z.string(), days: dec, hours: dec, cost: dec })),
    total: dec,
  }),
  items: z.array(CostItem),
  months: z.number(),
  non_labour: dec,
  contingency_pct: dec,
  contingency_reason: z.string(),
  contingency: dec,
  subtotal: dec,
  total: dec,
  currency: z.string(),
  warnings: z.array(z.string()).default([]),
});
export type BudgetContent = z.infer<typeof BudgetContent>;
export type CostItem = z.infer<typeof CostItem>;
