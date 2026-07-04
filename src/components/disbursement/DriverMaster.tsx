import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Loader2,
  Upload,
} from "lucide-react";
import { Modal, Select, Text } from "../forms";
import { Badge } from "../ui";
import { FLEETS, GARAGES } from "../../data/types";
import {
  deleteDriver,
  fetchDrivers,
  normalizeDriverNumber,
  syncDriversFromHR,
  updateDriver,
  type Driver,
  type HRDriverRow,
  type Rail,
} from "../../data/disbursement";
import { pullDriversFromHR } from "../../lib/hrSource";
import { downloadFile } from "../../lib/fileGen";
import {
  EmptyState,
  GhostButton,
  Panel,
  PrimaryButton,
  RailPill,
} from "./shared";

// The driver master is EXTRACTED from the HR Recruitment Directory project —
// drivers are never created here. Run supabase/hr-export-drivers.sql in the
// HR project, Download CSV, then "Sync from HR" below. Locally we only assign
// the request group and the active flag.

export default function DriverMaster({
  isAdmin,
  onToast,
}: {
  isAdmin: boolean;
  onToast: (msg: string) => void;
}) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [railFilter, setRailFilter] = useState<"All" | Rail>("All");
  const [editing, setEditing] = useState<Driver | null>(null);
  const [importing, setImporting] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  function reload() {
    setLoading(true);
    fetchDrivers()
      .then(setDrivers)
      .catch((e) => onToast(`Load failed: ${e.message ?? e}`))
      .finally(() => setLoading(false));
  }
  useEffect(reload, []);

  const filtered = useMemo(
    () =>
      drivers.filter(
        (d) =>
          (railFilter === "All" || d.rail === railFilter) &&
          (search === "" ||
            d.name.toLowerCase().includes(search.toLowerCase()) ||
            d.number.includes(search) ||
            (d.hrEmpNo ?? "").toLowerCase().includes(search.toLowerCase()))
      ),
    [drivers, search, railFilter]
  );

  const bpiCount = drivers.filter((d) => d.rail === "BPI").length;
  const mayaCount = drivers.filter((d) => d.rail === "MAYA").length;

  async function remove(d: Driver) {
    if (!confirm(`Delete driver "${d.name}"? This cannot be undone.`)) return;
    try {
      await deleteDriver(d.id);
      setDrivers((prev) => prev.filter((x) => x.id !== d.id));
      onToast("Driver deleted");
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      // FK violation → driver still referenced by requests
      if (/foreign key|violates|referenced/i.test(msg))
        onToast("Driver has requests — set it Inactive instead of deleting.");
      else onToast(`Delete failed: ${msg}`);
    }
  }

  function exportCsv() {
    const header = "emp_no,name,rail,number,garage,request_group,active";
    const rows = drivers.map((d) =>
      [
        csvCell(d.hrEmpNo ?? ""),
        csvCell(d.name),
        d.rail,
        // keep leading zeros readable in Excel by quoting
        `"${d.number}"`,
        csvCell(d.garage ?? ""),
        csvCell(d.defaultFleet ?? ""),
        d.active ? "true" : "false",
      ].join(",")
    );
    downloadFile(
      "drivers.csv",
      new Blob([[header, ...rows].join("\r\n")], { type: "text/csv" })
    );
  }

  async function importCsv(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const { rows, errors, skipped } = parseHRCsv(text);
      if (errors.length) {
        onToast(`Sync aborted: ${errors[0]}`);
        return;
      }
      const n = await syncDriversFromHR(rows);
      onToast(
        `Synced ${n} driver${n === 1 ? "" : "s"} from HR` +
          (skipped ? ` (${skipped} unknown garage${skipped === 1 ? "" : "s"} left blank)` : "")
      );
      reload();
    } catch (e: any) {
      onToast(`Sync failed: ${e.message ?? e}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total drivers" value={drivers.length} />
          <Stat label="BPI rail" value={bpiCount} />
          <Stat label="Maya rail" value={mayaCount} />
        </div>

        <Panel
          title="Driver master (from HR)"
          actions={
            <div className="flex items-center gap-2">
              <GhostButton onClick={exportCsv}>
                <Download size={15} /> Export
              </GhostButton>
              {isAdmin && (
                <PrimaryButton onClick={() => setSyncOpen(true)}>
                  <RefreshCw size={15} /> Sync from HR
                </PrimaryButton>
              )}
            </div>
          }
        >
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, number, or emp no…"
                className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <select
              value={railFilter}
              onChange={(e) => setRailFilter(e.target.value as any)}
              className="rounded-md border border-slate-300 px-2.5 py-2 text-sm"
            >
              <option value="All">All rails</option>
              <option value="BPI">BPI</option>
              <option value="MAYA">Maya</option>
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-10 text-slate-400">
              <Loader2 className="animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState>
              No drivers yet — click <b>Sync from HR</b> to pull the driver
              master from the HR Recruitment Directory.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Emp #</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Rail</th>
                    <th className="px-3 py-2">Number</th>
                    <th className="px-3 py-2">Garage</th>
                    <th className="px-3 py-2">Request group</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">
                        {d.hrEmpNo ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {d.name}
                      </td>
                      <td className="px-3 py-2">
                        <RailPill rail={d.rail} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">
                        {d.number}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {d.garage ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {d.defaultFleet ? (
                          <span className="text-slate-700">{d.defaultFleet}</span>
                        ) : (
                          <span className="text-xs text-red-500">unassigned</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={d.active ? "emerald" : "slate"}>
                          {d.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setEditing(d)}
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-600"
                            title="Assign request group"
                          >
                            <Pencil size={15} />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => remove(d)}
                              className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title="Delete"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            Names, rails, and account numbers come from the HR Recruitment
            Directory (drivers are never created here). Re-syncing updates
            existing rows by employee number and keeps your request-group
            assignments. Locally you only set the <b>request group</b> and{" "}
            <b>active</b> flag.
          </p>
        </Panel>
      </div>

      {editing && (
        <GroupForm
          driver={editing}
          onClose={() => setEditing(null)}
          onSaved={(d) => {
            setDrivers((prev) => prev.map((x) => (x.id === d.id ? d : x)));
            onToast("Driver updated");
            setEditing(null);
          }}
        />
      )}

      {syncOpen && (
        <SyncModal
          importing={importing}
          onCsv={importCsv}
          onClose={() => setSyncOpen(false)}
          onDone={(msg) => {
            setSyncOpen(false);
            onToast(msg);
            reload();
          }}
        />
      )}
    </div>
  );
}

// ---- HR sync modal: direct pull (HR login) or CSV fallback -------------------

function SyncModal({
  importing,
  onCsv,
  onClose,
  onDone,
}: {
  importing: boolean;
  onCsv: (file: File) => Promise<void>;
  onClose: () => void;
  onDone: (toast: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pull(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!email.trim() || !password) {
      setErr("Enter your HR app email and password.");
      return;
    }
    setBusy(true);
    try {
      const result = await pullDriversFromHR(email.trim(), password);
      const n = await syncDriversFromHR(result.rows);
      let msg = `Synced ${n} driver${n === 1 ? "" : "s"} from HR`;
      const notes: string[] = [];
      if (result.missingPay.length)
        notes.push(`${result.missingPay.length} missing pay info in HR`);
      if (result.invalid.length)
        notes.push(`${result.invalid.length} invalid number`);
      if (notes.length) msg += ` (${notes.join(", ")})`;
      onDone(msg);
    } catch (e: any) {
      setErr(e.message ?? "Sync failed.");
      setBusy(false);
    }
  }

  return (
    <Modal title="Sync drivers from HR" onClose={onClose}>
      <form onSubmit={pull}>
        <p className="mb-3 text-sm text-slate-600">
          Connects to the HR Recruitment Directory as you, pulls every active
          driver with a mode of payment, and updates the list here. Your HR
          login is used once and never stored.
        </p>
        <div className="space-y-3">
          <Text
            label="HR app email"
            value={email}
            onChange={setEmail}
            required
            placeholder="you@gitc.com.ph"
          />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              HR app password <span className="text-red-500">*</span>
            </span>
            <input
              type="password"
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </label>
        </div>
        {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            Pull from HR
          </PrimaryButton>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-500 hover:text-amber-600">
            {importing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Upload size={13} />
            )}
            Or import the CSV from hr-export-drivers.sql
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={importing || busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                // importCsv toasts + reloads on its own; just close after
                if (f) onCsv(f).finally(onClose);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </form>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
        {value}
      </div>
    </div>
  );
}

// ---- request-group / active editor (identity fields are HR-owned) -----------

function GroupForm({
  driver,
  onClose,
  onSaved,
}: {
  driver: Driver;
  onClose: () => void;
  onSaved: (d: Driver) => void;
}) {
  const [fleet, setFleet] = useState(driver.defaultFleet ?? "");
  const [active, setActive] = useState(driver.active);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await updateDriver(driver.id, {
        defaultFleet: fleet || null,
        active,
      });
      onSaved({ ...driver, defaultFleet: fleet || null, active });
    } catch (e: any) {
      setErr(e.message ?? "Could not save.");
      setBusy(false);
    }
  }

  return (
    <Modal title={driver.name} onClose={onClose}>
      <form onSubmit={submit}>
        {/* HR-owned identity — read-only */}
        <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600">
            <span className="font-mono text-xs">{driver.hrEmpNo ?? "no emp #"}</span>
            <RailPill rail={driver.rail} />
            <span className="font-mono text-xs">{driver.number}</span>
            {driver.garage && <span>{driver.garage}</span>}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Name, rail, and account come from HR — update them there, then
            re-sync.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Request group"
            value={fleet}
            onChange={setFleet}
            options={[
              { value: "", label: "— unassigned —" },
              ...FLEETS.map((f) => ({ value: f, label: f })),
            ]}
          />
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
              />
              Active
            </label>
          </div>
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
            Save
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

// ---- HR CSV parsing ----------------------------------------------------------

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Parse the CSV produced by supabase/hr-export-drivers.sql
 * (emp_no, name, rail, number, garage). Rows with a bad rail/number are
 * reported; a garage the disbursement DB doesn't know is dropped to null
 * rather than failing the FK.
 */
function parseHRCsv(text: string): {
  rows: HRDriverRow[];
  errors: string[];
  skipped: number;
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { rows: [], errors: ["Empty file"], skipped: 0 };

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (k: string) => header.indexOf(k);
  const ci = {
    empNo: idx("emp_no"),
    name: idx("name"),
    rail: idx("rail"),
    number: idx("number"),
    garage: idx("garage"),
  };
  if (ci.empNo < 0 || ci.name < 0 || ci.rail < 0 || ci.number < 0)
    return {
      rows: [],
      errors: [
        "Missing columns — expected the CSV from hr-export-drivers.sql (emp_no, name, rail, number, garage)",
      ],
      skipped: 0,
    };

  const known = new Set<string>(GARAGES);
  const rows: HRDriverRow[] = [];
  const errors: string[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    const empNo = (c[ci.empNo] ?? "").trim();
    const name = (c[ci.name] ?? "").trim();
    if (!empNo || !name) continue;
    const railRaw = (c[ci.rail] ?? "").trim().toUpperCase();
    if (railRaw !== "BPI" && railRaw !== "MAYA") {
      errors.push(`Row ${i + 1} (${name}): rail must be BPI or MAYA`);
      break;
    }
    const rail = railRaw as Rail;
    try {
      const number = normalizeDriverNumber(rail, c[ci.number] ?? "");
      const garageRaw =
        ci.garage >= 0 ? (c[ci.garage] ?? "").trim() : "";
      rows.push({
        hrEmpNo: empNo,
        name,
        rail,
        number,
        garage: known.has(garageRaw) ? garageRaw : null,
      });
      // unknown garage → dropped to null so the FK doesn't reject the row
      if (garageRaw && !known.has(garageRaw)) skipped += 1;
    } catch (e: any) {
      errors.push(`Row ${i + 1} (${name}): ${e.message}`);
      break;
    }
  }
  return { rows, errors, skipped };
}
