import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  XCircle,
  Beaker,
} from "lucide-react";
import { Modal, Textarea } from "../forms";
import { Badge } from "../ui";
import { formatDate, peso } from "../../lib/util";
import {
  approveBatch,
  fetchBatches,
  markDisbursed,
  rejectBatch,
  uploadDisbursementFile,
  type Batch,
} from "../../data/disbursement";
import {
  bizLinkTestFile,
  downloadFile,
  generateBizLink,
  linesForRail,
  loadBizLinkTemplate,
  mayaCsvBlob,
} from "../../lib/fileGen";
import {
  EmptyState,
  GhostButton,
  Panel,
  PrimaryButton,
  RailPill,
  batchStatusTone,
  typeTone,
} from "./shared";

export default function Approver({
  canApprove,
  onToast,
}: {
  canApprove: boolean;
  onToast: (msg: string) => void;
}) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Batch | null>(null);

  function reload() {
    setLoading(true);
    fetchBatches()
      .then(setBatches)
      .catch((e) => onToast(`Load failed: ${e.message ?? e}`))
      .finally(() => setLoading(false));
  }
  useEffect(reload, []);

  const pending = batches.filter((b) => b.status === "Submitted");
  const approved = batches.filter((b) => b.status === "Approved");
  const history = batches
    .filter((b) => b.status === "Disbursed" || b.status === "Rejected")
    .slice(0, 10);

  async function approve(b: Batch) {
    setBusyId(b.id);
    try {
      await approveBatch(b.id);
      onToast(`${b.code} approved`);
      reload();
    } catch (e: any) {
      onToast(`Approve failed: ${e.message ?? e}`);
    } finally {
      setBusyId(null);
    }
  }

  async function disburse(b: Batch) {
    setBusyId(b.id);
    try {
      await markDisbursed(b.id);
      onToast(`${b.code} marked disbursed`);
      reload();
    } catch (e: any) {
      onToast(`Failed: ${e.message ?? e}`);
    } finally {
      setBusyId(null);
    }
  }

  async function testFile() {
    const template = await loadBizLinkTemplate();
    downloadFile("bpi-bizlink-TEST-1peso.xls", await bizLinkTestFile(template));
    onToast(
      template
        ? "Test file built from your template (2 × ₱1 rows)"
        : "Test file built from scratch (2 × ₱1 rows)"
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        {!canApprove && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ShieldCheck size={16} />
            You can review batches but only the two designated approvers may
            approve, reject, or disburse.
          </div>
        )}

        <Panel
          title={`Pending approval (${pending.length})`}
          actions={
            <GhostButton onClick={testFile}>
              <Beaker size={15} /> BizLink test file
            </GhostButton>
          }
        >
          {loading ? (
            <Spinner />
          ) : pending.length === 0 ? (
            <EmptyState>No batches awaiting approval.</EmptyState>
          ) : (
            <div className="space-y-4">
              {pending.map((b) => (
                <BatchCard
                  key={b.id}
                  batch={b}
                  busy={busyId === b.id}
                  actions={
                    canApprove && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setRejecting(b)}
                          disabled={busyId === b.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <XCircle size={15} /> Reject
                        </button>
                        <PrimaryButton
                          onClick={() => approve(b)}
                          disabled={busyId === b.id}
                        >
                          {busyId === b.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={15} />
                          )}
                          Approve
                        </PrimaryButton>
                      </div>
                    )
                  }
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel title={`Approved — generate & disburse (${approved.length})`}>
          {approved.length === 0 ? (
            <EmptyState>Nothing approved and waiting to disburse.</EmptyState>
          ) : (
            <div className="space-y-4">
              {approved.map((b) => (
                <BatchCard
                  key={b.id}
                  batch={b}
                  busy={busyId === b.id}
                  onToast={onToast}
                  showFiles
                  actions={
                    canApprove && (
                      <PrimaryButton
                        onClick={() => disburse(b)}
                        disabled={busyId === b.id}
                      >
                        {busyId === b.id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={15} />
                        )}
                        Mark disbursed
                      </PrimaryButton>
                    )
                  }
                />
              ))}
            </div>
          )}
        </Panel>

        {history.length > 0 && (
          <Panel title="Recent history">
            <ul className="divide-y divide-slate-100 text-sm">
              {history.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between py-2"
                >
                  <span className="font-medium text-slate-700">{b.code}</span>
                  <span className="flex items-center gap-3 text-xs text-slate-500">
                    {b.approvalRef && <span>{b.approvalRef}</span>}
                    <Badge tone={batchStatusTone(b.status)}>{b.status}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      {rejecting && (
        <RejectModal
          batch={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => {
            const code = rejecting.code;
            setRejecting(null);
            onToast(`${code} rejected — requests returned to the pool`);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-10 text-slate-400">
      <Loader2 className="animate-spin" />
    </div>
  );
}

// ---- batch card -------------------------------------------------------------

function BatchCard({
  batch,
  actions,
  busy,
  showFiles,
  onToast,
}: {
  batch: Batch;
  actions?: React.ReactNode;
  busy?: boolean;
  showFiles?: boolean;
  onToast?: (msg: string) => void;
}) {
  const bpi = useMemo(() => linesForRail(batch.requests, "BPI"), [batch]);
  const maya = useMemo(() => linesForRail(batch.requests, "MAYA"), [batch]);
  const bpiTotal = bpi.reduce((s, l) => s + l.amount, 0);
  const mayaTotal = maya.reduce((s, l) => s + l.amount, 0);
  const [gen, setGen] = useState<null | "bpi" | "maya">(null);

  async function downloadBpi() {
    if (bpi.length === 0) return;
    setGen("bpi");
    try {
      const template = await loadBizLinkTemplate();
      const date = batch.approvedAt ?? new Date();
      const buf = await generateBizLink(bpi, date, template);
      const name = `${batch.code}-BPI-BizLink.xls`;
      downloadFile(name, buf);
      uploadDisbursementFile(batch.code, name, buf).catch(() => {});
      onToast?.(`Generated ${name}`);
    } catch (e: any) {
      onToast?.(`BizLink failed: ${e.message ?? e}`);
    } finally {
      setGen(null);
    }
  }

  async function downloadMaya() {
    if (maya.length === 0) return;
    setGen("maya");
    try {
      const blob = mayaCsvBlob(maya);
      const name = `${batch.code}-Maya.csv`;
      downloadFile(name, blob);
      uploadDisbursementFile(batch.code, name, blob).catch(() => {});
      onToast?.(`Generated ${name}`);
    } catch (e: any) {
      onToast?.(`Maya CSV failed: ${e.message ?? e}`);
    } finally {
      setGen(null);
    }
  }

  return (
    <div className={`rounded-lg border border-slate-200 ${busy ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">{batch.code}</span>
            <Badge tone={batchStatusTone(batch.status)}>{batch.status}</Badge>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Submitted by {batch.submittedByName ?? "—"} ·{" "}
            {formatDate(batch.submittedAt)}
          </div>
          {batch.status === "Approved" && (
            <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <ShieldCheck size={13} />
              {batch.approvalRef} · approved by {batch.approvedByName ?? "—"} ·{" "}
              {formatDate(batch.approvedAt)}
            </div>
          )}
        </div>
        {actions}
      </div>

      <div className="grid grid-cols-2 gap-4 px-4 py-3">
        <RailSummary
          label="BPI (BizLink)"
          count={bpi.length}
          total={bpiTotal}
        />
        <RailSummary label="Maya" count={maya.length} total={mayaTotal} />
      </div>

      {showFiles && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
          <GhostButton onClick={downloadBpi} disabled={bpi.length === 0 || gen === "bpi"}>
            {gen === "bpi" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <FileSpreadsheet size={15} />
            )}
            BPI BizLink .xls
          </GhostButton>
          <GhostButton onClick={downloadMaya} disabled={maya.length === 0 || gen === "maya"}>
            {gen === "maya" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Download size={15} />
            )}
            Maya .csv
          </GhostButton>
        </div>
      )}

      <div className="border-t border-slate-100 px-4 py-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Line items ({batch.requests.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {batch.requests.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5 pr-3 font-medium text-slate-700">
                    {r.driverName}
                    {r.truckPlate && (
                      <span className="ml-1 text-xs font-normal text-slate-400">
                        · {r.truckPlate}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3">
                    {r.rail ? <RailPill rail={r.rail} /> : "—"}
                  </td>
                  <td className="py-1.5 pr-3">
                    <Badge tone={typeTone(r.type)}>{r.type}</Badge>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">
                    {peso(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RailSummary({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
        {peso(total)}
      </div>
      <div className="text-xs text-slate-400">
        {count} payee{count === 1 ? "" : "s"}
      </div>
    </div>
  );
}

// ---- reject modal -----------------------------------------------------------

function RejectModal({
  batch,
  onClose,
  onDone,
}: {
  batch: Batch;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await rejectBatch(batch.id, reason.trim());
      onDone();
    } catch (e: any) {
      setErr(e.message ?? "Could not reject.");
      setBusy(false);
    }
  }

  return (
    <Modal title={`Reject ${batch.code}`} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="mb-3 text-sm text-slate-600">
          The {batch.requests.length} request(s) in this batch return to the pool
          for re-batching. History is preserved.
        </p>
        <Textarea
          label="Reason"
          value={reason}
          onChange={setReason}
          placeholder="Why is this batch being rejected?"
        />
        {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            Reject batch
          </button>
        </div>
      </form>
    </Modal>
  );
}
