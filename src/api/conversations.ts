import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Channel, Message, SendOut } from "@/schemas/conversation";
import { apiFetch } from "./client";
import { dlKeys } from "./delivery";
import { wfKeys } from "./workflow";

export const convKeys = {
  messages: (pid: string, channel: Channel) => ["messages", pid, channel] as const,
};

/** `waiting`: an agent is working, so poll for its reply. */
export function useMessages(pid: string, channel: Channel, waiting = false) {
  return useQuery({
    queryKey: convKeys.messages(pid, channel),
    queryFn: () => apiFetch<Message[]>(`/projects/${pid}/conversations/${channel}/messages`),
    enabled: Boolean(pid),
    refetchInterval: waiting ? 4000 : false,
  });
}

export function useSendMessage(pid: string, channel: Channel) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      apiFetch<SendOut>(`/projects/${pid}/conversations/${channel}/messages`, { method: "POST", json: { text } }),
    onSuccess: ({ message }) => {
      qc.setQueryData<Message[]>(convKeys.messages(pid, channel), (old) => [...(old ?? []), message]);
      void qc.invalidateQueries({ queryKey: convKeys.messages(pid, channel) });
      void qc.invalidateQueries({ queryKey: wfKeys.workflow(pid) });
      void qc.invalidateQueries({ queryKey: dlKeys.delivery(pid) });
    },
  });
}
