import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Layers, Trash2 } from "lucide-react";
import { Badge } from "../ui";
import { peso, toDateInput } from "../../lib/util";
import {
  deleteRequest,
  fetchPooledRequests,
  submitBatch,
  type DisbRequest,
} from "../../data/disbursement";
import {
  EmptyState,
  Panel,
  PrimaryButton,
  RailPill,
  StatCard,
  typeTone,
} from "./shared";

type Flag = { kind: "missing" | "dup"; reason: string };

export default function Encoder({
  onToast,
}: {
  onToast: (msg: string) => void;
}) {
  const [pool, setPool] = useState<DisbRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  function reload() {
    setLoading(true);
    fetchPooledRequests()
      .then((p) => {
        setPool(p);
        setSelected(new Set());
      })
      .catch((e) => onToast(`Load failed: ${e.message ?? e}`))
      .finally(() => setLoading(false));
  }
  useEffect(reload, []);

  // Per-request validation flags. Duplicate = same driver selected twice.
  const flags = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of pool) {
      if (selected.has(r.id))
        seen.set(r.driverId, (seen.get(r.driverId) ?? 0) + 1);
    }
    const out: Record<string, Flag> = {};
    for (const r of pool) {
      if (!r.rail || !r.number)
        out[r.id] = { kind: "missing", reason: "No rail/number on driver" };
      else if (selected.has(r.id) && (seen.get(r.driverId) ?? 0) > 1)
        out[r.id] = { kind: "dup", reason: "Driver selected more than once" };
    }
    return out;
  }, [pool, selected]);

  const selectedRows = pool.filter((r) => selected.has(r.id));
  const bpiTotal = selectedRows
    .filter((r) => r.rail === "BPI")
    .reduce((s, r) => s + r.amount, 0);
  const mayaTotal = selectedRows
    .filter((r) => r.rail === "MAYA")
    .reduce((s, r) => s + r.amount, 0);
  const bpiCount = selectedRows.filter((r) => r.rail === "BPI").length;
  const mayaCount = selectedRows.filter((r) => r.rail === "MAYA").length;
  const blocking = selectedRows.some((r) => flags[r.id]?.kind === "missing");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) =>
      prev.size === pool.length ? new Set() : new Set(pool.map((r) => r.id))
    );
  }

  async function submit() {
    if (selected.size === 0) return;
    if (blocking) {
      onToast("Resolve missing rail/number flags before submitting");
      return;
    }
    setSubmitting(true);
    try {
      const batch = await submitBatch([...selected]);
      onToast(`${batch.code} submitted for approval`);
      reload();
    } catch (e: any) {
      onToast(`Submit failed: ${e.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function removeRow(r: DisbRequest) {
    if (!confirm(`Delete ${r.driverName}'s request for ${peso(r.amount)}?`))
      return;
    try {
      await deleteRequest(r.id);
      setPool((prev) => prev.filter((x) => x.id !== r.id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(r.id);
        return next;
      });
      onToast("Request deleted");
    } catch (e: any) {
      onToast(`Delete failed: ${e.message ?? e}`);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="In pool" value={pool.length} />
          <StatCard label="Selected" value={selected.size} tone="amber" />
          <StatCard
            label="BPI total"
            value={peso(bpiTotal)}
            sub={`${bpiCount} payee${bpiCount === 1 ? "" : "s"}`}
            tone="amber"
          />
          <StatCard
            label="Maya total"
            value={peso(mayaTotal)}
            sub={`${mayaCount} payee${mayaCount === 1 ? "" : "s"}`}
            tone="emerald"
          />
        </div>

        <Panel
          title="Pooled requests"
          actions={
            <PrimaryButton
              onClick={submit}
              disabled={selected.size === 0 || submitting}
            >
              {submitting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Layers size={15} />
              )}
              Build batch ({selected.size})
            </PrimaryButton>
          }
        >
          {loading ? (
            <div className="flex justify-center py-10 text-slate-400">
              <Loader2 className="animate-spin" />
            </div>
          ) : pool.length === 0 ? (
            <EmptyState>The pool is empty — nothing to batch right now.</EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={
                          pool.length > 0 && selected.size === pool.length
                        }
                        onChange={toggleAll}
                        className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                      />
                    </th>
                    <th className="px-3 py-2">Driver</th>
                    <th className="px-3 py-2">Rail</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Justification</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pool.map((r) => {
                    const f = flags[r.id];
                    const on = selected.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        className={on ? "bg-amber-50/50" : "hover:bg-slate-50"}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(r.id)}
                            className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {r.driverName}
                        </td>
                        <td className="px-3 py-2">
                          {r.rail ? <RailPill rail={r.rail} /> : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={typeTone(r.type)}>{r.type}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {peso(r.amount)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-slate-500">
                          {toDateInput(r.txnDate)}
                        </td>
                        <td className="max-w-[16rem] truncate px-3 py-2 text-slate-600">
                          {r.justification || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-2">
                            {f && (
                              <span
                                title={f.reason}
                                className={`inline-flex items-center gap-1 text-xs font-medium ${
                                  f.kind === "missing"
                                    ? "text-red-600"
                                    : "text-amber-600"
                                }`}
                              >
                                <AlertTriangle size={13} />
                                {f.kind === "missing" ? "Missing" : "Dup"}
                              </span>
                            )}
                            <button
                              onClick={() => removeRow(r)}
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title="Delete request"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            Totals split automatically by each driver's rail — no manual sorting
            into BPI / Maya. Resolve <span className="text-red-600">Missing</span>{" "}
            flags (fix the driver's rail/number in the master) before building a
            batch.
          </p>
        </Panel>
      </div>
    </div>
  );
}
