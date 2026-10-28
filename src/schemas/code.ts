/** Mirrors poc-backend app/modules/agents/code/schema.py (CodeContent). Display only. */
import { z } from "zod";

export const CodeFile = z.object({
  path: z.string(),
  content: z.string(),
  executable: z.boolean().default(false),
  generated: z.boolean().default(false),
});

export const Finding = z.object({
  tool: z.enum(["bash-n", "shellcheck", "manifest"]),
  /** "<script>" or a manifest path */
  file: z.string(),
  line: z.number().nullable().default(null),
  code: z.string().nullable().default(null),
  level: z.enum(["error", "warning"]),
  message: z.string(),
});

export const CodeContent = z.object({
  summary: z.string(),
  project_slug: z.string(),
  files: z.array(CodeFile),
  next_steps: z.array(z.string()).default([]),
  report: z.object({
    bash_n: z.enum(["ok", "failed"]),
    shellcheck: z.enum(["ok", "failed", "unavailable"]),
    shellcheck_version: z.string().nullable().default(null),
    findings: z.array(Finding),
    checked_at: z.string(),
  }),
  script_sha256: z.string(),
});
export type CodeContent = z.infer<typeof CodeContent>;
export type CodeFile = z.infer<typeof CodeFile>;
export type Finding = z.infer<typeof Finding>;

export const SCRIPT_FILE = "<script>";

export function scriptName(slug: string, revision: number): string {
  return `scaffold-${slug}-r${revision}.sh`;
}

export function scriptUrl(projectId: string, revision: number): string {
  return `/api/v1/projects/${projectId}/artifacts/code/revisions/${revision}/script`;
}
