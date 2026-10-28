import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Page, Project, ProjectStatus } from "@/schemas/project";
import { apiFetch } from "./client";

export interface ProjectQuery {
  q?: string;
  status?: ProjectStatus;
  page_size?: number;
}

function qs(params: Record<string, string | number | undefined>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : "";
}

export const projectKeys = {
  all: ["projects"] as const,
  list: (q: ProjectQuery) => ["projects", "list", q] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
};

export function useProjects(query: ProjectQuery = {}) {
  return useQuery({
    queryKey: projectKeys.list(query),
    queryFn: () => apiFetch<Page<Project>>(`/projects${qs({ ...query })}`),
    placeholderData: keepPreviousData,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => apiFetch<Project>(`/projects/${id}`),
    enabled: Boolean(id),
  });
}
