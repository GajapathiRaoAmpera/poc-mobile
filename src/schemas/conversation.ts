/** Mirrors poc-backend app/modules/conversations/schemas.py. */
import type { Run } from "./workflow";

export type Channel = "intake" | "requirements" | "architecture" | "plan" | "budget" | "code";

export interface Message {
  id: string;
  channel: Channel;
  seq: number;
  role: "user" | "agent" | "system";
  agent: string | null;
  text: string;
  refs: {
    run_id?: string;
    artifact_revision?: number;
    change_set_id?: string;
    plan_version?: number;
    gate?: string;
  };
  created_at: string;
}

export interface SendOut {
  message: Message;
  run: Run | null;
}
