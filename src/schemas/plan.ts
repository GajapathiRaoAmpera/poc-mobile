/** Mirrors poc-backend app/modules/agents/plan/schema.py (PlanContent). Dates are ISO YYYY-MM-DD strings. */
import { z } from "zod";

export const Milestone = z.object({
  id: z.string(),
  title: z.string(),
  goal: z.string(),
  start: z.string(),
  end: z.string(),
});

export const PlanTask = z.object({
  id: z.string(),
  title: z.string(),
  milestone_id: z.string(),
  role: z.string(),
  effort_days: z.number(),
  depends_on: z.array(z.string()).default([]),
  requirement_ids: z.array(z.string()).default([]),
  component_ids: z.array(z.string()).default([]),
  /** "Start no earlier than", set by a person on the timeline. */
  not_before: z.string().nullable().optional(),
  start: z.string(),
  end: z.string(),
});

export const Risk = z.object({
  id: z.string(),
  description: z.string(),
  impact: z.enum(["low", "medium", "high"]),
  mitigation: z.string(),
});

export const PlanContent = z.object({
  summary: z.string(),
  milestones: z.array(Milestone),
  tasks: z.array(PlanTask),
  risks: z.array(Risk).default([]),
  schedule: z.object({
    start: z.string(),
    end: z.string(),
    working_days: z.number(),
    target_date: z.string().nullable().default(null),
  }),
  warnings: z.array(z.string()).default([]),
});
export type PlanContent = z.infer<typeof PlanContent>;
export type PlanTask = z.infer<typeof PlanTask>;
export type Milestone = z.infer<typeof Milestone>;
export type Risk = z.infer<typeof Risk>;
