export const EVENT_TYPES = ["Golf", "Poker", "Dinner", "Tennis", "Other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type ApplicationStatus = "pending" | "approved" | "waitlisted" | "declined";

export function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export function statusColor(status: ApplicationStatus): string {
  switch (status) {
    case "approved":
      return "bg-emerald-100 text-emerald-900 border-emerald-200";
    case "waitlisted":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "declined":
      return "bg-rose-100 text-rose-900 border-rose-200";
    default:
      return "bg-secondary text-secondary-foreground border-border";
  }
}

export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "bg-muted";
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-rose-500";
}

export function formatEventDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
