/** Mirrors poc-backend app/modules/orchestration/schemas.py and changesets/router.py. */

export type StageName = "requirements" | "architecture" | "plan" | "budget" | "code";
export type ArtifactKind = "requirements" | "architecture" | "plan" | "budget" | "code";
export type StageStatus =
  | "UNAVAILABLE"
  | "NOT_PLANNED"
  | "BLOCKED"
  | "NOT_STARTED"
  | "QUEUED"
  | "RUNNING"
  | "FAILED"
  | "CANCELLED"
  | "WAITING_FOR_INPUT"
  | "WAITING_FOR_APPROVAL"
  | "NEEDS_REVISION"
  | "APPROVED"
  | "STALE";
export type RunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export interface SourceRef {
  kind: string;
  artifact_id: string | null;
  revision: number;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  path: string | null;
  /** Ids of the diagram items the issue is about (messages use names). Absent on older issues. */
  refs?: string[];
}

export interface RunAttempt {
  n: number;
  started_at: string;
  finished_at: string | null;
  outcome: string | null;
  error_code: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

export interface Run {
  id: string;
  stage: StageName | "orchestrator";
  agent: string;
  agent_version: string;
  mode: "generate" | "revise" | "change_request" | "chat";
  status: RunStatus;
  inputs: SourceRef[];
  instruction: string | null;
  base_revision: number | null;
  output: { artifact_id?: string; revision?: number; change_set_id?: string } | null;
  provider: string | null;
  model: string | null;
  is_mock: boolean;
  attempts: RunAttempt[];
  usage: { input_tokens: number; output_tokens: number };
  summary: string | null;
  error: { code: string; message: string; retryable: boolean } | null;
  cancel_requested: boolean;
  retry_of: string | null;
  created_by: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface RunEvent {
  seq: number;
  /** null for workflow (graph) and conversation (message) events. */
  run_id: string | null;
  ts: string;
  type: "status" | "step" | "validation" | "error" | "message" | "graph";
  message: string;
  data: Record<string, unknown> | null;
}

export interface RunDetail extends Run {
  events: RunEvent[];
}

export interface RevisionSummary {
  id: string;
  kind: ArtifactKind;
  revision: number;
  origin: "agent" | "user" | "change_set" | "restore" | "system";
  summary: string;
  run_id: string | null;
  change_set_id: string | null;
  restored_from: number | null;
  sources: SourceRef[];
  issues: ValidationIssue[];
  ok: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Revision<T = unknown> extends RevisionSummary {
  schema_version: string;
  content: T;
}

export interface Artifact<T = unknown> {
  id: string;
  kind: ArtifactKind;
  latest_revision: number;
  approved_revision: number | null;
  stale: boolean;
  stale_reason: string | null;
  updated_at: string;
  revision: Revision<T> | null;
}

export interface StageState {
  stage: StageName;
  status: StageStatus;
  reasons: string[];
  available: boolean;
  artifact: Artifact | null;
  latest_run: Run | null;
}

export interface Approval {
  id: string;
  kind: ArtifactKind;
  revision: number;
  decision: "APPROVED" | "CHANGES_REQUESTED";
  comment: string | null;
  decided_by: string;
  decided_at: string;
}

export const STAGE_LABEL: Record<StageName, string> = {
  requirements: "Requirements",
  architecture: "Architecture",
  plan: "Project plan",
  budget: "Budget",
  code: "Scaffold",
};

export const AGENT_LABEL: Record<string, string> = {
  project_orchestrator: "Project Orchestrator",
  requirements_analyst: "Requirements Agent",
  solution_architect: "Architecture Agent",
  project_planner: "Planning Agent",
  budget_estimator: "Budget Agent",
  developer: "Development Agent",
};
