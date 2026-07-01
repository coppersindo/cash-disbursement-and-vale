import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { peso, toDateInput, weekLabel } from "../../lib/util";
import {
  fetchAllRequests,
  type DisbRequest,
} from "../../data/disbursement";
import {
  EmptyState,
  Panel,
  RECEIPT_LABEL,
  StatCard,
} from "./shared";

export default function OwnerDashboard({
  onToast,
}: {
  onToast: (msg: string) => void;
}) {
  const [requests, setRequests] = useState<DisbRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchAllRequests()
      .then(setRequests)
      .catch((e) => onToast(`Load failed: ${e.message ?? e}`))
      .finally(() => setLoading(false));
  }, []);

  const disbursed = useMemo(
    () => requests.filter((r) => r.status === "Disbursed"),
    [requests]
  );

  const totalSpend = disbursed.reduce((s, r) => s + r.amount, 0);
  const bpiSpend = disbursed
    .filter((r) => r.rail === "BPI")
    .reduce((s, r) => s + r.amount, 0);
  const mayaSpend = disbursed
    .filter((r) => r.rail === "MAYA")
    .reduce((s, r) => s + r.amount, 0);

  const caOutstanding = disbursed.filter((r) => r.type === "CA");
  const caTotal = caOutstanding.reduce((s, r) => s + r.amount, 0);
  const missingReceipts = disbursed.filter(
    (r) => r.type === "Reimb" && r.receiptStatus !== "with_receipt"
  );

  const byFleet = rollup(disbursed, (r) => r.fleet ?? "Unassigned");
  const byWeek = rollup(disbursed, (r) => toDateInput(r.weekStart))
    .sort((a, b) => b.key.localeCompare(a.key))
    .slice(0, 8);
  const byDriver = rollup(disbursed, (r) => r.driverName)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const railPct =
    totalSpend > 0 ? Math.round((bpiSpend / totalSpend) * 100) : 0;

  if (loading)
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Total disbursed" value={peso(totalSpend)} />
          <StatCard
            label="CA outstanding"
            value={peso(caTotal)}
            sub={`${caOutstanding.length} advances`}
            tone="amber"
          />
          <StatCard
            label="Missing receipts"
            value={missingReceipts.length}
            sub={peso(missingReceipts.reduce((s, r) => s + r.amount, 0))}
            tone={missingReceipts.length ? "red" : "emerald"}
          />
          <StatCard
            label="BPI / Maya split"
            value={`${railPct}% / ${100 - railPct}%`}
            sub={`${peso(bpiSpend)} · ${peso(mayaSpend)}`}
            tone="slate"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Panel title="Spend per fleet">
            <RollupList rows={byFleet.sort((a, b) => b.total - a.total)} />
          </Panel>
          <Panel title="Spend per cutoff week">
            {byWeek.length === 0 ? (
              <EmptyState>No disbursements yet.</EmptyState>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {byWeek.map((w) => (
                  <li key={w.key} className="flex justify-between">
                    <span className="text-slate-600">
                      {weekLabel(new Date(w.key))}
                    </span>
                    <span className="tabular-nums font-medium text-slate-800">
                      {peso(w.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Panel title="Top drivers by spend">
            <RollupList rows={byDriver} />
          </Panel>
          <Panel title="Reimbursements missing receipts">
            {missingReceipts.length === 0 ? (
              <EmptyState>Everything reconciled.</EmptyState>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {missingReceipts.map((r) => (
                  <li key={r.id} className="flex justify-between">
                    <span className="text-slate-600">
                      {r.driverName}
                      {r.receiptStatus && (
                        <span className="ml-1 text-xs text-slate-400">
                          ({RECEIPT_LABEL[r.receiptStatus]})
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums font-medium text-slate-800">
                      {peso(r.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

type Row = { key: string; total: number; count: number };

function rollup(
  requests: DisbRequest[],
  keyOf: (r: DisbRequest) => string
): Row[] {
  const map = new Map<string, Row>();
  for (const r of requests) {
    const key = keyOf(r);
    const row = map.get(key) ?? { key, total: 0, count: 0 };
    row.total += r.amount;
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()];
}

function RollupList({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <EmptyState>No disbursements yet.</EmptyState>;
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex justify-between">
            <span className="truncate text-slate-600">{r.key}</span>
            <span className="ml-2 shrink-0 tabular-nums font-medium text-slate-800">
              {peso(r.total)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-amber-500"
              style={{ width: `${(r.total / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
