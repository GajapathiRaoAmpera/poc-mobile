export type ProjectStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  owner_id: string;
  created_at: string;
  updated_at: string;
  /** 0–1: share of wizard sections with any content. */
  completeness: number;
  /** "intake": placeholder name from the first message, until the orchestrator names it. */
  name_source?: "user" | "intake" | "orchestrator";
  preferences?: NonNullable<import("./spec").SpecData["constraints"]> | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export const statusLabel: Record<ProjectStatus, string> = { DRAFT: "Draft", ACTIVE: "Active", ARCHIVED: "Archived" };
