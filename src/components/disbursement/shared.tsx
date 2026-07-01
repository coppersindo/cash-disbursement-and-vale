import type { ReactNode } from "react";
import { Badge } from "../ui";
import type { Tone } from "../../lib/util";
import type {
  BatchStatus,
  Rail,
  ReceiptStatus,
  ReqStatus,
  ReqType,
} from "../../data/disbursement";

export function reqStatusTone(s: ReqStatus): Tone {
  if (s === "Disbursed" || s === "Approved") return "emerald";
  if (s === "Requested" || s === "Submitted") return "amber";
  return "red"; // Rejected
}

export function batchStatusTone(s: BatchStatus): Tone {
  if (s === "Disbursed" || s === "Approved") return "emerald";
  if (s === "Submitted") return "amber";
  return "red"; // Rejected
}

export function typeTone(t: ReqType): Tone {
  if (t === "Budget") return "slate";
  if (t === "CA") return "amber";
  return "emerald"; // Reimb
}

export function receiptTone(s: ReceiptStatus): Tone {
  if (s === "with_receipt") return "emerald";
  if (s === "pending") return "amber";
  return "red"; // charge_driver
}

export const RECEIPT_LABEL: Record<ReceiptStatus, string> = {
  with_receipt: "With receipt",
  pending: "Receipt pending",
  charge_driver: "Charge to driver",
};

export function StatusBadge({ status }: { status: ReqStatus }) {
  return <Badge tone={reqStatusTone(status)}>{status}</Badge>;
}

export function RailPill({ rail }: { rail: Rail }) {
  const tone: Tone = rail === "BPI" ? "amber" : "emerald";
  return <Badge tone={tone}>{rail}</Badge>;
}

/** Dashboard / summary stat tile (matches the HR module's card styling). */
export function StatCard({
  label,
  value,
  sub,
  tone = "slate",
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
}) {
  const ring: Record<Tone, string> = {
    emerald: "border-emerald-200",
    amber: "border-amber-200",
    red: "border-red-200",
    slate: "border-slate-200",
  };
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border bg-white p-4 ${ring[tone]} ${
        onClick ? "cursor-pointer hover:shadow-sm" : ""
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** Section wrapper with a title bar. */
export function Panel({
  title,
  actions,
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
      {children}
    </div>
  );
}

/** Primary amber button used across the module. */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
