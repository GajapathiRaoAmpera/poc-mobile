/** Typed fetch wrapper for the FastAPI backend, authenticated with the session token as a bearer. */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:3000").replace(/\/$/, "");
const BASE = `${API_URL}/api/v1`;
const GENERIC = "Something went wrong. Please try again.";
// Endpoints where 401 means "wrong credentials", not "session expired".
const CREDENTIAL_ENDPOINTS = ["/auth/token", "/auth/password-reset"];

let token: string | null = null;
let onUnauthorized: () => void = () => {};

/** Called by the session provider; the client never touches storage itself. */
export function configureClient(opts: { token: string | null; onUnauthorized?: () => void }) {
  token = opts.token;
  if (opts.onUnauthorized) onUnauthorized = opts.onUnauthorized;
}

export interface ApiInit extends Omit<RequestInit, "body"> {
  json?: unknown;
}

export async function apiFetch<T = unknown>(path: string, init: ApiInit = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const h = new Headers(headers);
  if (json !== undefined) h.set("content-type", "application/json");
  h.set("accept", "application/json");
  // Lets the backend's CSRF origin check recognise the native app (see poc-backend app/core/origin.py).
  h.set("x-client", "mobile");
  if (token) h.set("authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...rest,
      headers: h,
      // Never send or store cookies: auth is the bearer token only.
      credentials: "omit",
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach the server. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (res.ok) return body as T;

  const err = body?.error;
  const apiErr =
    err && typeof err.code === "string"
      ? new ApiError(res.status, err.code, err.message || GENERIC, err.details ?? null)
      : new ApiError(res.status, "INTERNAL", GENERIC);

  if (res.status === 401 && !CREDENTIAL_ENDPOINTS.some((p) => path.startsWith(p))) onUnauthorized();
  throw apiErr;
}

export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : GENERIC;
}

/** Field errors from a 422 VALIDATION_ERROR, keyed by the last loc segment. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || err.code !== "VALIDATION_ERROR" || !Array.isArray(err.details)) return {};
  const out: Record<string, string> = {};
  for (const d of err.details as { loc?: unknown[]; msg?: string }[]) {
    const key = d.loc?.[d.loc.length - 1];
    if (typeof key === "string" && d.msg) out[key] = d.msg.replace(/^Value error, /, "");
  }
  return out;
}
