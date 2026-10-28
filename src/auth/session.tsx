import { useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, apiFetch, configureClient } from "@/api/client";
import type { LoginValues, RegisterValues, User } from "@/schemas/auth";

const TOKEN_KEY = "ampera.session";

type Status = "loading" | "signedOut" | "signedIn";

interface Session {
  status: Status;
  user: User | null;
  /** Shown once on the login screen after the server rejected a stored token. */
  expired: boolean;
  signIn: (values: LoginValues) => Promise<void>;
  register: (values: RegisterValues) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function useSession() {
  const s = use(SessionContext);
  if (!s) throw new Error("useSession must be used inside <SessionProvider>");
  return s;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [expired, setExpired] = useState(false);

  const clear = useCallback(
    async (wasExpired: boolean) => {
      configureClient({ token: null });
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      // Drop every cached query of the old session.
      qc.clear();
      setUser(null);
      setExpired(wasExpired);
      setStatus("signedOut");
    },
    [qc],
  );

  useEffect(() => {
    configureClient({ token: null, onUnauthorized: () => void clear(true) });
    (async () => {
      const stored = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!stored) return setStatus("signedOut");
      configureClient({ token: stored });
      try {
        setUser(await apiFetch<User>("/auth/me"));
        setStatus("signedIn");
      } catch (e) {
        // A 401 already signed out via onUnauthorized. Offline: stay signed in, screens show retry.
        if (!(e instanceof ApiError && e.status === 401)) setStatus("signedIn");
      }
    })();
  }, [clear]);

  const start = useCallback(async (path: string, json: unknown) => {
    const out = await apiFetch<{ token: string; user: User }>(path, { method: "POST", json });
    await SecureStore.setItemAsync(TOKEN_KEY, out.token);
    configureClient({ token: out.token });
    setUser(out.user);
    setExpired(false);
    setStatus("signedIn");
  }, []);

  const value = useMemo<Session>(
    () => ({
      status,
      user,
      expired,
      signIn: (v) => start("/auth/token", v),
      register: (v) => start("/auth/token/register", v),
      signOut: async () => {
        await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
        await clear(false);
      },
    }),
    [status, user, expired, start, clear],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}
