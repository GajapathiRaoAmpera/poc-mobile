import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Approval, Artifact, ArtifactKind, Revision } from "@/schemas/workflow";
import { apiFetch } from "./client";
import { dlKeys } from "./delivery";
import { wfKeys } from "./workflow";

export const artKeys = {
  artifact: (pid: string, kind: ArtifactKind) => ["artifact", pid, kind] as const,
};

/** `poll`: the stage's agent is working, so pick up its new revision when it lands. */
export function useArtifact<T>(pid: string, kind: ArtifactKind, poll = false) {
  return useQuery({
    queryKey: artKeys.artifact(pid, kind),
    queryFn: () => apiFetch<Artifact<T>>(`/projects/${pid}/artifacts/${kind}`),
    enabled: Boolean(pid),
    retry: false,
    refetchInterval: poll ? 4000 : false,
  });
}

function useInvalidateArtifact(pid: string, kind: ArtifactKind) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: artKeys.artifact(pid, kind) });
    void qc.invalidateQueries({ queryKey: wfKeys.workflow(pid) });
    void qc.invalidateQueries({ queryKey: dlKeys.delivery(pid) });
  };
}

export function useDecision(pid: string, kind: ArtifactKind) {
  const invalidate = useInvalidateArtifact(pid, kind);
  return useMutation({
    mutationFn: ({ n, decision, comment }: { n: number; decision: "approve" | "request-changes"; comment?: string }) =>
      apiFetch<Approval>(`/projects/${pid}/artifacts/${kind}/revisions/${n}/${decision}`, {
        method: "POST",
        json: { comment: comment || null },
      }),
    onSuccess: invalidate,
  });
}

export function useSaveAnswers(pid: string) {
  const invalidate = useInvalidateArtifact(pid, "requirements");
  return useMutation({
    mutationFn: (body: { answers: Record<string, string | null>; base_revision: number }) =>
      apiFetch<Revision>(`/projects/${pid}/artifacts/requirements/answers`, { method: "PUT", json: body }),
    onSuccess: invalidate,
  });
}
