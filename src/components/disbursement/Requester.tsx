import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, Trash2, Check } from "lucide-react";
import { Modal, Select, Text, Textarea, DateField } from "../forms";
import { Badge } from "../ui";
import { fromDateInput, peso, toDateInput, weekLabel } from "../../lib/util";
import { mondayOf } from "../../lib/util";
import {
  createRequest,
  deleteRequest,
  fetchMyRequests,
  searchDrivers,
  type DisbRequest,
  type DriverPublic,
  type ReceiptStatus,
  type ReqType,
} from "../../data/disbursement";
import {
  EmptyState,
  Panel,
  PrimaryButton,
  RECEIPT_LABEL,
  StatusBadge,
  typeTone,
} from "./shared";

export default function Requester({
  userId,
  onToast,
}: {
  userId: string;
  onToast: (msg: string) => void;
}) {
  const [requests, setRequests] = useState<DisbRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  function reload() {
    setLoading(true);
    fetchMyRequests(userId)
      .then(setRequests)
      .catch((e) => onToast(`Load failed: ${e.message ?? e}`))
      .finally(() => setLoading(false));
  }
  useEffect(reload, [userId]);

  const pending = requests.filter((r) => r.status === "Requested").length;

  async function remove(r: DisbRequest) {
    if (!confirm("Delete this request?")) return;
    try {
      await deleteRequest(r.id);
      setRequests((prev) => prev.filter((x) => x.id !== r.id));
      onToast("Request deleted");
    } catch (e: any) {
      onToast(`Delete failed: ${e.message ?? e}`);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <Panel
          title={`My cash requests${pending ? ` · ${pending} not yet submitted` : ""}`}
          actions={
            <PrimaryButton onClick={() => setCreating(true)}>
              <Plus size={15} /> New request
            </PrimaryButton>
          }
        >
          {loading ? (
            <div className="flex justify-center py-10 text-slate-400">
              <Loader2 className="animate-spin" />
            </div>
          ) : requests.length === 0 ? (
            <EmptyState>
              No requests yet. Click <b>New request</b> to ask for cash.
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">
                        {r.driverName}
                      </span>
                      <Badge tone={typeTone(r.type)}>{r.type}</Badge>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {peso(r.amount)} · {toDateInput(r.txnDate)} · cutoff{" "}
                      {weekLabel(r.weekStart)}
                    </div>
                    {r.justification && (
                      <div className="mt-1 text-sm text-slate-600">
                        {r.justification}
                      </div>
                    )}
                  </div>
                  {r.status === "Requested" && (
                    <button
                      onClick={() => remove(r)}
                      className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            Submitted requests are locked while admin builds the bank batch. You
            only see the driver and the amount — never bank rails or account
            numbers.
          </p>
        </Panel>
      </div>

      {creating && (
        <NewRequestModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
            onToast("Request submitted to the pool");
          }}
        />
      )}
    </div>
  );
}

// ---- new request modal ------------------------------------------------------

function NewRequestModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [driver, setDriver] = useState<DriverPublic | null>(null);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<ReqType>("Budget");
  const [justification, setJustification] = useState("");
  const [txnDate, setTxnDate] = useState(toDateInput(new Date()));
  const [receipt, setReceipt] = useState<ReceiptStatus>("pending");
  const [caInstallment, setCaInstallment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const weekStart = useMemo(() => {
    const d = fromDateInput(txnDate);
    return d ? weekLabel(mondayOf(d)) : "—";
  }, [txnDate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const amt = Number(amount);
    if (!driver) return setErr("Pick a driver.");
    if (!(amt > 0)) return setErr("Amount must be greater than zero.");
    const date = fromDateInput(txnDate);
    if (!date) return setErr("Pick a transaction date.");

    setBusy(true);
    try {
      await createRequest({
        driverId: driver.id,
        amount: amt,
        type,
        justification: justification.trim(),
        txnDate: date,
        receiptStatus: type === "Reimb" ? receipt : null,
        caInstallment: type === "CA" ? caInstallment.trim() || null : null,
      });
      onCreated();
    } catch (e: any) {
      setErr(e.message ?? "Could not save.");
      setBusy(false);
    }
  }

  return (
    <Modal title="New cash request" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="space-y-3">
          <DriverPicker selected={driver} onSelect={setDriver} />

          <div className="grid grid-cols-2 gap-3">
            <Text
              label="Amount (₱)"
              value={amount}
              onChange={(v) => setAmount(v.replace(/[^\d.]/g, ""))}
              required
              placeholder="0.00"
            />
            <Select
              label="Type"
              value={type}
              onChange={(v) => setType(v as ReqType)}
              options={[
                { value: "Budget", label: "Budget" },
                { value: "CA", label: "Cash Advance (CA)" },
                { value: "Reimb", label: "Reimbursement" },
              ]}
              required
            />
            <DateField
              label="Transaction date"
              value={txnDate}
              onChange={setTxnDate}
              required
            />
            <div className="flex items-end pb-1 text-xs text-slate-500">
              Payroll cutoff: <span className="ml-1 font-medium">{weekStart}</span>
            </div>
          </div>

          {type === "Reimb" && (
            <Select
              label="Receipt status"
              value={receipt}
              onChange={(v) => setReceipt(v as ReceiptStatus)}
              options={[
                { value: "with_receipt", label: RECEIPT_LABEL.with_receipt },
                { value: "pending", label: RECEIPT_LABEL.pending },
                { value: "charge_driver", label: RECEIPT_LABEL.charge_driver },
              ]}
            />
          )}
          {type === "CA" && (
            <Text
              label="Installment plan (optional)"
              value={caInstallment}
              onChange={setCaInstallment}
              placeholder="e.g. 1000/week from 2026-05-30"
            />
          )}

          <Textarea
            label="Justification"
            value={justification}
            onChange={setJustification}
            placeholder="What is this cash for?"
          />
        </div>
        {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <PrimaryButton type="submit" disabled={busy}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            Submit request
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

// ---- driver search combobox (names only) ------------------------------------

function DriverPicker({
  selected,
  onSelect,
}: {
  selected: DriverPublic | null;
  onSelect: (d: DriverPublic | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DriverPublic[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selected) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      searchDrivers(q)
        .then((r) => !cancelled && setResults(r))
        .catch(() => {})
        .finally(() => !cancelled && setLoading(false));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, selected]);

  if (selected) {
    return (
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">
          Driver <span className="text-red-500">*</span>
        </span>
        <div className="flex items-center justify-between rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
          <span className="flex items-center gap-2 font-medium text-slate-800">
            <Check size={15} className="text-emerald-600" />
            {selected.name}
            {selected.defaultFleet && (
              <span className="text-xs font-normal text-slate-500">
                · {selected.defaultFleet}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setQ("");
            }}
            className="text-xs font-medium text-slate-500 hover:text-amber-600"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        Driver <span className="text-red-500">*</span>
      </span>
      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search driver by name…"
          className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
        />
      </div>
      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {loading ? (
            <div className="px-3 py-3 text-center text-xs text-slate-400">
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-slate-400">
              No drivers found.
            </div>
          ) : (
            results.map((d) => (
              <button
                key={d.id}
                type="button"
                onMouseDown={() => onSelect(d)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-amber-50"
              >
                <span className="font-medium text-slate-700">{d.name}</span>
                {d.garage && (
                  <span className="text-xs text-slate-400">{d.garage}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
