import { ExternalLink, Loader2, Paperclip, X } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { requiredItems } from "../data/requirements";
import { createSignedUrl } from "../data/repo";
import type { DocRecord, Position, ReqState, TruckType } from "../data/types";
import {
  badgeClass,
  docStatus,
  docTone,
  dotClass,
  formatDate,
  relDays,
  reqTone,
  type Tone,
} from "../lib/util";

export function Badge({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  return <span className={badgeClass(tone)}>{children}</span>;
}

export function Dot({ tone }: { tone: Tone }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${dotClass(tone)}`}
      aria-hidden
    />
  );
}

export function ProgressBar({ pct }: { pct: number }) {
  const tone =
    pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className={`h-full rounded-full ${tone} transition-all`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

/** Completion % across a requirements record. */
export function reqPct(requirements: Record<string, ReqState>): number {
  const items = Object.values(requirements);
  if (items.length === 0) return 0;
  const done = items.filter((s) => s === "Complete").length;
  return Math.round((done / items.length) * 100);
}

/**
 * Role-based requirement checklist. Tap a row to cycle
 * Missing → Pending → Complete. Grouped using requiredItems() so the
 * sections match the role.
 */
export function RequirementChecklist({
  requirements,
  position,
  truckType,
  onCycle,
  reqFiles,
  onUploadFile,
}: {
  requirements: Record<string, ReqState>;
  position: Position;
  truckType: TruckType | null;
  onCycle: (item: string) => void;
  reqFiles?: Record<string, string>;
  onUploadFile?: (item: string, file: File) => Promise<void>;
}) {
  const groups = requiredItems(position, truckType);
  const pct = reqPct(requirements);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Requirements
        </span>
        <span className="text-xs font-semibold tabular-nums text-slate-600">
          {pct}% complete
        </span>
      </div>
      <div className="mb-4">
        <ProgressBar pct={pct} />
      </div>
      <div className="space-y-4">
        {(Object.keys(groups) as (keyof typeof groups)[]).map((groupName) => (
          <div key={groupName}>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">
              {groupName}
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              {groups[groupName].map((item, i) => (
                <ReqRow
                  key={item}
                  item={item}
                  state={requirements[item] ?? "Missing"}
                  filePath={reqFiles?.[item]}
                  divider={i > 0}
                  onCycle={() => onCycle(item)}
                  onUpload={onUploadFile}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Tap the label to cycle status; use the clip to attach a file.
      </p>
    </div>
  );
}

function ReqRow({
  item,
  state,
  filePath,
  divider,
  onCycle,
  onUpload,
}: {
  item: string;
  state: ReqState;
  filePath?: string;
  divider: boolean;
  onCycle: () => void;
  onUpload?: (item: string, file: File) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function view() {
    if (!filePath) return;
    const url = await createSignedUrl(filePath);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  async function pick(file: File | null) {
    if (!file || !onUpload) return;
    setBusy(true);
    try {
      await onUpload(item, file);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${
        divider ? "border-t border-slate-100" : ""
      }`}
    >
      <button
        onClick={onCycle}
        className="flex min-w-0 flex-1 items-center gap-2 text-left text-slate-700 hover:text-slate-900"
      >
        <Dot tone={reqTone(state)} />
        <span className="truncate">{item}</span>
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        {filePath && (
          <button
            onClick={view}
            title="View attached file"
            className="text-slate-400 hover:text-amber-600"
          >
            <ExternalLink size={14} />
          </button>
        )}
        {onUpload && (
          <label
            title={filePath ? "Replace file" : "Attach file"}
            className="cursor-pointer text-slate-400 hover:text-amber-600"
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Paperclip size={14} />
            )}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              disabled={busy}
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
        <Badge tone={reqTone(state)}>{state}</Badge>
      </div>
    </div>
  );
}

/** Right-side slide-over drawer shell. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle && (
              <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function cycleReq(state: ReqState): ReqState {
  if (state === "Missing") return "Pending";
  if (state === "Pending") return "Complete";
  return "Missing";
}

/** One document row: type, expiry, validity chip, and a view link if a file is attached. */
export function DocItem({ doc }: { doc: DocRecord }) {
  const [loading, setLoading] = useState(false);
  const st = docStatus(doc.expiration);

  async function view() {
    if (!doc.filePath) return;
    setLoading(true);
    const url = await createSignedUrl(doc.filePath);
    setLoading(false);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-700">
          {doc.type}
        </div>
        <div className="text-xs text-slate-400 tabular-nums">
          Expires {formatDate(doc.expiration)} · {relDays(doc.expiration)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {doc.filePath && (
          <button
            onClick={view}
            disabled={loading}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-amber-600 disabled:opacity-50"
            title="View file"
          >
            <ExternalLink size={13} />
            {loading ? "…" : "View"}
          </button>
        )}
        <Badge tone={docTone(st)}>{st}</Badge>
      </div>
    </div>
  );
}
