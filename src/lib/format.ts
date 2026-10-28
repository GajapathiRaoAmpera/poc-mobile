import type { ProjectStatus } from "@/schemas/project";
import type { StageStatus } from "@/schemas/workflow";
import type { Tone } from "@/ui/theme";

const STEPS: [string, number][] = [
  ["y", 31_536_000],
  ["mo", 2_592_000],
  ["w", 604_800],
  ["d", 86_400],
  ["h", 3_600],
  ["m", 60],
];

/** "5m ago", "3d ago". Hand-rolled: Hermes has no Intl.RelativeTimeFormat. */
export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  for (const [unit, size] of STEPS) if (seconds >= size) return `${Math.floor(seconds / size)}${unit} ago`;
  return "just now";
}

// Events stored before model names were removed server-side still carry "provider/model" text.
const MODEL_REF = /,?\s*\(?\b(?:groq|gemini|openai|mock)\/[^\s),]+\)?/gi;

/** Activity text as users should see it: no provider or model identifiers. */
export function cleanMessage(msg: string): string {
  return msg
    .replace(/^Calling \S+/, "Reasoning over the inputs")
    .replace(/\(repair (\d+\/\d+)\)/, "(self-correction $1)")
    .replace(/requesting repair \((\d+\/\d+)\)/, "self-correcting ($1)")
    .replace(/Model provider returned HTTP 429/g, "The AI service is busy (rate limit reached)")
    .replace(/Model provider returned HTTP (\d+)/g, "The AI service returned an error (HTTP $1)")
    .replace(MODEL_REF, "")
    .trim();
}

/** Amounts are 2-decimal strings from the backend; Number() is display-only (never sum on the client). */
export function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount));
}

/** ISO calendar date (YYYY-MM-DD) as "Nov 2"; UTC so the day never shifts. */
export function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
}

const ROLE_WORDS: Record<string, string> = { qa: "QA", ui: "UI", ux: "UX", devops: "DevOps", ml: "ML", ai: "AI", sre: "SRE", pm: "PM" };

/** "frontend_engineer" -> "Frontend engineer". */
export function roleLabel(role: string): string {
  const label = role.split("_").filter(Boolean).map((w) => ROLE_WORDS[w] ?? w).join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const STAGE_STATUS: Record<StageStatus, { label: string; tone: Tone }> = {
  UNAVAILABLE: { label: "Coming soon", tone: "neutral" },
  NOT_PLANNED: { label: "Not in plan", tone: "neutral" },
  BLOCKED: { label: "Blocked", tone: "neutral" },
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  QUEUED: { label: "Queued", tone: "info" },
  RUNNING: { label: "Running", tone: "info" },
  FAILED: { label: "Failed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  WAITING_FOR_INPUT: { label: "Needs your input", tone: "warning" },
  WAITING_FOR_APPROVAL: { label: "Ready for review", tone: "primary" },
  NEEDS_REVISION: { label: "Needs revision", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  STALE: { label: "Stale", tone: "warning" },
};

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "warning" },
  ACTIVE: { label: "Active", tone: "success" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};
