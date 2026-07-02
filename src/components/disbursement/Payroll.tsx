import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Lock,
  Printer,
} from "lucide-react";
import { Badge } from "../ui";
import { formatDate, mondayOf, peso, toDateInput, weekLabel } from "../../lib/util";
import { downloadFile, generateValeList } from "../../lib/fileGen";
import {
  closeWeek,
  fetchRequestsForWeek,
  fetchWeeks,
  type DisbRequest,
  type PayrollWeek,
} from "../../data/disbursement";
import {
  EmptyState,
  Panel,
  PrimaryButton,
  RECEIPT_LABEL,
  receiptTone,
  typeTone,
} from "./shared";

type DriverGroup = {
  driverId: string;
  driverName: string;
  rows: DisbRequest[];
  total: number;
};

export default function Payroll({
  canManage,
  onToast,
}: {
  canManage: boolean;
  onToast: (msg: string) => void;
}) {
  const [weekStart, setWeekStart] = useState<Date>(mondayOf(new Date()));
  const [requests, setRequests] = useState<DisbRequest[]>([]);
  const [weeks, setWeeks] = useState<PayrollWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([fetchRequestsForWeek(weekStart), fetchWeeks()])
      .then(([r, w]) => {
        setRequests(r);
        setWeeks(w);
      })
      .catch((e) => onToast(`Load failed: ${e.message ?? e}`))
      .finally(() => setLoading(false));
  }
  useEffect(load, [weekStart]);

  const weekMeta = weeks.find(
    (w) => toDateInput(w.weekStart) === toDateInput(weekStart)
  );

  // Only disbursed cash rolls into payroll.
  const disbursed = requests.filter((r) => r.status === "Disbursed");

  const groups: DriverGroup[] = useMemo(() => {
    const map = new Map<string, DriverGroup>();
    for (const r of disbursed) {
      const g = map.get(r.driverId) ?? {
        driverId: r.driverId,
        driverName: r.driverName,
        rows: [],
        total: 0,
      };
      g.rows.push(r);
      g.total += r.amount;
      map.set(r.driverId, g);
    }
    return [...map.values()].sort((a, b) =>
      a.driverName.localeCompare(b.driverName)
    );
  }, [disbursed]);

  const grand = disbursed.reduce((s, r) => s + r.amount, 0);
  const caRows = disbursed.filter((r) => r.type === "CA");
  const receiptRows = disbursed.filter(
    (r) => r.type === "Reimb" && r.receiptStatus !== "with_receipt"
  );

  function shiftWeek(delta: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(mondayOf(d));
  }

  async function close() {
    if (!confirm(`Close week ${weekLabel(weekStart)} and submit to payroll?`))
      return;
    setClosing(true);
    try {
      await closeWeek(weekStart);
      onToast("Week closed & submitted to payroll");
      load();
    } catch (e: any) {
      onToast(`Close failed: ${e.message ?? e}`);
    } finally {
      setClosing(false);
    }
  }

  function downloadVale() {
    if (disbursed.length === 0) return;
    const rows = groups.flatMap((g) =>
      g.rows
        .slice()
        .sort((a, b) => a.txnDate.getTime() - b.txnDate.getTime())
        .map((r) => ({
          driver: g.driverName,
          date: toDateInput(r.txnDate),
          type:
            r.type === "CA" && r.caInstallment
              ? `CA (${r.caInstallment})`
              : r.type,
          justification: r.justification || "",
          amount: r.amount,
        }))
    );
    generateValeList(weekLabel(weekStart), rows)
      .then((buf) => {
        downloadFile(`vale-${toDateInput(weekStart)}.xlsx`, buf);
        onToast("Vale list downloaded");
      })
      .catch((e) => onToast(`Vale list failed: ${e.message ?? e}`));
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        {/* week navigator */}
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 print:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => shiftWeek(-1)}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <div className="text-sm font-semibold text-slate-800">
                {weekLabel(weekStart)}
              </div>
              <div className="text-xs text-slate-400">7-day cutoff (Mon–Sun)</div>
            </div>
            <button
              onClick={() => shiftWeek(1)}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <ChevronRight size={18} />
            </button>
            {weekMeta?.closed && (
              <Badge tone="emerald">
                <Lock size={11} /> Closed
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {disbursed.length > 0 && (
              <button
                onClick={downloadVale}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <FileSpreadsheet size={15} /> Vale list .xlsx
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Printer size={15} /> Print
            </button>
            {canManage && !weekMeta?.closed && disbursed.length > 0 && (
              <PrimaryButton onClick={close} disabled={closing}>
                {closing ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Lock size={15} />
                )}
                Close week
              </PrimaryButton>
            )}
          </div>
        </div>

        {/* printable statement */}
        <div className="space-y-4">
          <div className="hidden print:block">
            <h1 className="text-lg font-bold">GITC Supply Solutions Inc.</h1>
            <div className="text-sm">
              Weekly vale statement — {weekLabel(weekStart)}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-10 text-slate-400">
              <Loader2 className="animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <EmptyState>
              No disbursed cash in this cutoff week yet.
              {weekMeta?.submittedToPayrollAt &&
                ` Submitted ${formatDate(weekMeta.submittedToPayrollAt)}.`}
            </EmptyState>
          ) : (
            <>
              <Panel
                title={`Per-driver statement · ${groups.length} drivers · ${peso(
                  grand
                )} total`}
              >
                <div className="space-y-5">
                  {groups.map((g) => (
                    <div key={g.driverId}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-semibold text-slate-800">
                          {g.driverName}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-slate-900">
                          {peso(g.total)}
                        </span>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-slate-200">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-3 py-1.5">Date</th>
                              <th className="px-3 py-1.5">Type</th>
                              <th className="px-3 py-1.5">Justification</th>
                              <th className="px-3 py-1.5 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {g.rows.map((r) => (
                              <tr key={r.id}>
                                <td className="px-3 py-1.5 tabular-nums text-slate-500">
                                  {toDateInput(r.txnDate)}
                                </td>
                                <td className="px-3 py-1.5">
                                  <Badge tone={typeTone(r.type)}>{r.type}</Badge>
                                </td>
                                <td className="px-3 py-1.5 text-slate-600">
                                  {r.justification || "—"}
                                  {r.type === "CA" && r.caInstallment && (
                                    <span className="ml-1 text-xs text-amber-700">
                                      ({r.caInstallment})
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">
                                  {peso(r.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <div className="grid grid-cols-2 gap-4">
                <Panel title={`Cash advances (${caRows.length})`}>
                  {caRows.length === 0 ? (
                    <EmptyState>No CA this week.</EmptyState>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {caRows.map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center justify-between"
                        >
                          <span className="min-w-0">
                            <span className="font-medium text-slate-700">
                              {r.driverName}
                            </span>
                            {r.caInstallment && (
                              <span className="ml-1 text-xs text-slate-500">
                                {r.caInstallment}
                              </span>
                            )}
                          </span>
                          <span className="tabular-nums text-slate-700">
                            {peso(r.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel title={`Receipts outstanding (${receiptRows.length})`}>
                  {receiptRows.length === 0 ? (
                    <EmptyState>All reimbursements have receipts.</EmptyState>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {receiptRows.map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center justify-between"
                        >
                          <span className="font-medium text-slate-700">
                            {r.driverName}
                          </span>
                          <span className="flex items-center gap-2">
                            {r.receiptStatus && (
                              <Badge tone={receiptTone(r.receiptStatus)}>
                                {RECEIPT_LABEL[r.receiptStatus]}
                              </Badge>
                            )}
                            <span className="tabular-nums text-slate-700">
                              {peso(r.amount)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
