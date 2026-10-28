import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "./client";

export function useRequestReset() {
  return useMutation({
    mutationFn: (email: string) => apiFetch("/auth/password-reset/request", { method: "POST", json: { email } }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      apiFetch<void>("/auth/change-password", { method: "POST", json: body }),
  });
}
