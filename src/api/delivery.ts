import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Delivery, IntakeOut, Preferences } from "@/schemas/delivery";
import { apiFetch } from "./client";
import { projectKeys } from "./projects";
import { wfKeys } from "./workflow";

export const dlKeys = {
  delivery: (pid: string) => ["delivery", pid] as const,
};

export function useDelivery(pid: string) {
  return useQuery({
    queryKey: dlKeys.delivery(pid),
    queryFn: () => apiFetch<Delivery>(`/projects/${pid}/delivery`),
    enabled: Boolean(pid),
    refetchInterval: (q) => (q.state.data?.status === "RUNNING" ? 4000 : false),
  });
}

export function useIntake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { message: string; preferences?: Preferences }) =>
      apiFetch<IntakeOut>("/projects/intake", { method: "POST", json: body }),
    onSuccess: (out) => {
      qc.setQueryData(projectKeys.detail(out.project.id), out.project);
      qc.setQueryData(dlKeys.delivery(out.project.id), out.delivery);
      void qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

function useDeliveryAction(pid: string, action: "resume" | "cancel") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<Delivery>(`/projects/${pid}/delivery/${action}`, { method: "POST" }),
    onSuccess: (d) => {
      qc.setQueryData(dlKeys.delivery(pid), d);
      void qc.invalidateQueries({ queryKey: wfKeys.workflow(pid) });
    },
  });
}

export const useResumeDelivery = (pid: string) => useDeliveryAction(pid, "resume");
export const useCancelDelivery = (pid: string) => useDeliveryAction(pid, "cancel");
