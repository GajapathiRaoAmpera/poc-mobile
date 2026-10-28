import { useQuery } from "@tanstack/react-query";
import type { StageState } from "@/schemas/workflow";
import { apiFetch } from "./client";

export const wfKeys = {
  workflow: (pid: string) => ["workflow", pid] as const,
};

const BUSY = new Set(["QUEUED", "RUNNING"]);

export function useWorkflow(pid: string) {
  return useQuery({
    queryKey: wfKeys.workflow(pid),
    queryFn: () => apiFetch<StageState[]>(`/projects/${pid}/workflow`),
    enabled: Boolean(pid),
    // No live stream on mobile: poll while any stage is working.
    refetchInterval: (q) => (q.state.data?.some((s) => BUSY.has(s.status)) ? 4000 : false),
  });
}
