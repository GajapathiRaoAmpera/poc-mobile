/** Mirrors poc-backend app/modules/delivery/schemas.py and agents/orchestrator/schema.py. */
import type { Project } from "./project";
import type { SpecData } from "./spec";
import type { StageName, ValidationIssue } from "./workflow";

export type Preferences = NonNullable<SpecData["constraints"]>;
export type ThreadStatus = "IDLE" | "RUNNING" | "PAUSED" | "DONE" | "FAILED";
export type GateKind =
  | "intake_questions"
  | "awaiting_answers"
  | "approval"
  | "needs_input"
  | "stage_busy"
  | "quota"
  | "failed"
  | "cancelled";

export interface Pending {
  kind: GateKind;
  stage: StageName | "orchestrator" | null;
  payload?: {
    stage?: string;
    revision?: number;
    reason?: string;
    count?: number;
    questions?: MissingInfo[];
  };
}

export interface StagePlan {
  stage: StageName;
  include: boolean;
  rationale: string;
  inputs: StageName[];
  approval_required: boolean;
}

export interface MissingInfo {
  id: string;
  question: string;
  why_it_matters: string;
  blocking: boolean;
}

export interface PlanContent {
  project_name: string;
  objective_summary: string;
  project_type: string;
  brief: SpecData;
  stages: StagePlan[];
  missing_info: MissingInfo[];
  next_action: "run_stage" | "ask_user" | "wait_approval" | "done";
  next_stage: StageName | null;
  decision_summary: string;
}

export interface Plan {
  version: number;
  content: PlanContent;
  issues: ValidationIssue[];
  fallback: boolean;
  run_id: string | null;
  created_at: string;
}

export interface Delivery {
  status: ThreadStatus;
  pending: Pending | null;
  /** Human-readable thread state, same text as the activity feed. */
  message: string;
  plan: Plan | null;
  last_error: string | null;
  updated_at: string | null;
}

export interface IntakeOut {
  project: Project;
  delivery: Delivery;
}
