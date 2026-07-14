import type { AuditEntry } from "./audit";
import { parseAuditTimestamp } from "./constants";

export type AuditPeriod = "today" | "week" | "month" | "date" | "tillDate";

export const AUDIT_PERIOD_OPTIONS: { id: AuditPeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week (Sun–Sat)" },
  { id: "month", label: "This month" },
  { id: "date", label: "Select date" },
  { id: "tillDate", label: "Till date" },
];

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStartSunday(date: Date): Date {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);
  return start;
}

export function auditEntryLocalDate(entry: AuditEntry): string | null {
  const parsed = parseAuditTimestamp(entry.timestamp);
  if (!parsed) return null;
  return toLocalIsoDate(parsed);
}

export function getAuditPeriodBounds(
  period: AuditPeriod,
  selectedDate: string,
): { from: string; to: string } | null {
  if (period === "tillDate") return null;

  const now = new Date();

  if (period === "today") {
    const today = toLocalIsoDate(now);
    return { from: today, to: today };
  }

  if (period === "week") {
    const weekStart = getWeekStartSunday(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return { from: toLocalIsoDate(weekStart), to: toLocalIsoDate(weekEnd) };
  }

  if (period === "month") {
    const year = now.getFullYear();
    const month = now.getMonth();
    return {
      from: toLocalIsoDate(new Date(year, month, 1)),
      to: toLocalIsoDate(new Date(year, month + 1, 0)),
    };
  }

  if (period === "date" && selectedDate) {
    return { from: selectedDate, to: selectedDate };
  }

  return null;
}

export function filterAuditEntries(
  entries: AuditEntry[],
  period: AuditPeriod,
  selectedDate: string,
  username: string,
): AuditEntry[] {
  const bounds = getAuditPeriodBounds(period, selectedDate);

  return entries.filter((entry) => {
    if (username !== "__all__" && entry.username !== username) return false;
    if (!bounds) return true;

    const localDate = auditEntryLocalDate(entry);
    if (!localDate) return false;
    return localDate >= bounds.from && localDate <= bounds.to;
  });
}

export function collectAuditUsernames(entries: AuditEntry[], staffUsernames: string[]): string[] {
  const names = new Set<string>();
  for (const name of staffUsernames) {
    const trimmed = name.trim();
    if (trimmed) names.add(trimmed);
  }
  for (const entry of entries) {
    const trimmed = entry.username.trim();
    if (trimmed) names.add(trimmed);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
