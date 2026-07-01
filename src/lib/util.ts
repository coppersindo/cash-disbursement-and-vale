import type { DocStatus, ReqState, Status } from "../data/types";

/** Whole days from now until `date` (negative = in the past). */
export function daysUntil(date: Date): number {
  const ms = date.getTime() - Date.now();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/** Days since `date` (positive = in the past). */
export function daysSince(date: Date): number {
  return -daysUntil(date);
}

/** Document validity computed from expiry — never stored. */
export function docStatus(expiration: Date): DocStatus {
  const left = daysUntil(expiration);
  if (left < 0) return "Expired";
  if (left <= 30) return "Expiring Soon";
  return "Valid";
}

export function isPast(date: Date): boolean {
  return daysUntil(date) <= 0;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDate(date: Date | null): string {
  if (!date) return "—";
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** Relative-time label for the cards/banners. */
export function relDays(date: Date | null): string {
  if (!date) return "—";
  const d = daysUntil(date);
  if (d === 0) return "today";
  if (d > 0) return `in ${d}d`;
  return `${-d}d ago`;
}

// ----- date construction helpers (all relative to now, so the demo stays live)

export function addDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Date → 'YYYY-MM-DD' for <input type="date"> values. */
export function toDateInput(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** '<input type="date">' value → Date (local midnight) or null. */
export function fromDateInput(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ----- color systems (Tailwind built-in palette only)

/** emerald = good, amber = warning, red = bad, slate = neutral */
export type Tone = "emerald" | "amber" | "red" | "slate";

export function statusTone(status: Status): Tone {
  switch (status) {
    case "Active":
    case "Hired":
      return "emerald";
    case "Follow-up":
    case "Pending":
      return "amber";
    case "Back-out":
    case "No Show":
      return "red";
    default:
      return "slate";
  }
}

export function docTone(status: DocStatus): Tone {
  if (status === "Valid") return "emerald";
  if (status === "Expiring Soon") return "amber";
  return "red";
}

export function reqTone(state: ReqState): Tone {
  if (state === "Complete") return "emerald";
  if (state === "Pending") return "amber";
  return "red";
}

const TONE_BADGE: Record<Tone, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export function badgeClass(tone: Tone): string {
  return `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_BADGE[tone]}`;
}

const TONE_DOT: Record<Tone, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  slate: "bg-slate-400",
};

export function dotClass(tone: Tone): string {
  return TONE_DOT[tone];
}

let counter = 100;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

// ----- weekly cutoff helpers (7-day window, Monday start) --------------------

/** Monday (local midnight) of the 7-day cutoff week that contains `date`. */
export function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (d.getDay() + 6) % 7; // 0 = Monday … 6 = Sunday
  d.setDate(d.getDate() - dow);
  return d;
}

/** Sunday (local midnight) closing a cutoff week given its Monday start. */
export function sundayOf(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d;
}

/** "Jun 23 – Jun 29, 2026" label for a cutoff week given its Monday start. */
export function weekLabel(weekStart: Date): string {
  const end = sundayOf(weekStart);
  const a = `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()}`;
  const b = `${MONTHS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  return `${a} – ${b}`;
}

/** Peso amount with thousands separators, e.g. ₱1,500.00 — for on-screen use. */
export function peso(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
