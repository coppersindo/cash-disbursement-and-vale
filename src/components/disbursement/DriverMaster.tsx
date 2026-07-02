import { useEffect, useMemo, useState } from "react";
import {
  Download,
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Loader2,
} from "lucide-react";
import { Modal, Select, Text } from "../forms";
import { FleetField } from "../forms";
import { Badge } from "../ui";
import { GARAGES } from "../../data/types";
import {
  createDriver,
  createDriversBulk,
  deleteDriver,
  fetchDrivers,
  normalizeDriverNumber,
  updateDriver,
  type Driver,
  type DriverInput,
  type Rail,
} from "../../data/disbursement";
import { downloadFile } from "../../lib/fileGen";
import {
  EmptyState,
  GhostButton,
  Panel,
  PrimaryButton,
  RailPill,
} from "./shared";

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
  const [editing, setEditing] = useState<Driver | "new" | null>(null);
  const [importing, setImporting] = useState(false);

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
            d.number.includes(search))
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

  function downloadTemplate() {
    const header = "name,rail,number,garage,default_fleet,active";
    // Two example rows (BPI keeps leading zeros; Maya accepts 09… or 639…).
    // Replace these with your real drivers before importing.
    const examples = [
      `Juan dela Cruz,BPI,"0123456789",Meycauayan Main,Dump – Bounty,true`,
      `Pedro Santos,MAYA,"09171234567",Phividec,Tanker – Petron,true`,
    ];
    downloadFile(
      "drivers-template.csv",
      new Blob([[header, ...examples].join("\r\n") + "\r\n"], {
        type: "text/csv",
      })
    );
  }

  function exportCsv() {
    const header = "name,rail,number,garage,default_fleet,active";
    const rows = drivers.map((d) =>
      [
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
      const { rows, errors } = parseDriverCsv(text);
      if (errors.length) {
        onToast(`Import aborted: ${errors[0]}`);
        return;
      }
      const n = await createDriversBulk(rows);
      onToast(`Imported ${n} driver${n === 1 ? "" : "s"}`);
      reload();
    } catch (e: any) {
      onToast(`Import failed: ${e.message ?? e}`);
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
          title="Driver master"
          actions={
            <div className="flex items-center gap-2">
              <GhostButton onClick={downloadTemplate}>
                <FileText size={15} /> Template
              </GhostButton>
              <GhostButton onClick={exportCsv}>
                <Download size={15} /> Export
              </GhostButton>
              {isAdmin && (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  {importing ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Upload size={15} />
                  )}
                  Import
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    disabled={importing}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) importCsv(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              <PrimaryButton onClick={() => setEditing("new")}>
                <Plus size={15} /> Add driver
              </PrimaryButton>
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
                placeholder="Search name or number…"
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
            <EmptyState>No drivers match.</EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Rail</th>
                    <th className="px-3 py-2">Number</th>
                    <th className="px-3 py-2">Garage</th>
                    <th className="px-3 py-2">Default fleet</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
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
                      <td className="px-3 py-2 text-slate-600">
                        {d.defaultFleet ?? "—"}
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
                            title="Edit"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => remove(d)}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            CSV columns: <code>name, rail, number, garage, default_fleet, active</code>.
            Maya numbers are normalized to 639XXXXXXXXX; BPI accounts keep leading
            zeros.
          </p>
        </Panel>
      </div>

      {editing && (
        <DriverForm
          driver={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(d, isNew) => {
            setDrivers((prev) =>
              isNew
                ? [...prev, d].sort((a, b) => a.name.localeCompare(b.name))
                : prev.map((x) => (x.id === d.id ? d : x))
            );
            onToast(isNew ? "Driver added" : "Driver updated");
            setEditing(null);
          }}
        />
      )}
    </div>
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

// ---- driver create / edit form ---------------------------------------------

function DriverForm({
  driver,
  onClose,
  onSaved,
}: {
  driver: Driver | null;
  onClose: () => void;
  onSaved: (d: Driver, isNew: boolean) => void;
}) {
  const [name, setName] = useState(driver?.name ?? "");
  const [rail, setRail] = useState<Rail>(driver?.rail ?? "BPI");
  const [number, setNumber] = useState(driver?.number ?? "");
  const [garage, setGarage] = useState(driver?.garage ?? "");
  const [fleet, setFleet] = useState(driver?.defaultFleet ?? "");
  const [active, setActive] = useState(driver?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    let normalized: string;
    try {
      normalized = normalizeDriverNumber(rail, number);
    } catch (ve: any) {
      setErr(ve.message);
      return;
    }
    const input: DriverInput = {
      name: name.trim(),
      rail,
      number: normalized,
      garage: garage || null,
      defaultFleet: fleet.trim() || null,
      active,
    };
    setBusy(true);
    try {
      if (driver) {
        await updateDriver(driver.id, input);
        onSaved({ ...driver, ...input }, false);
      } else {
        const created = await createDriver(input);
        onSaved(created, true);
      }
    } catch (e: any) {
      setErr(e.message ?? "Could not save.");
      setBusy(false);
    }
  }

  return (
    <Modal title={driver ? "Edit driver" : "Add driver"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Text label="Driver name" value={name} onChange={setName} required />
          </div>
          <Select
            label="Rail"
            value={rail}
            onChange={(v) => setRail(v as Rail)}
            options={[
              { value: "BPI", label: "BPI" },
              { value: "MAYA", label: "Maya" },
            ]}
            required
          />
          <Text
            label={rail === "MAYA" ? "Maya mobile" : "BPI account"}
            value={number}
            onChange={setNumber}
            required
            placeholder={rail === "MAYA" ? "0917… / 639…" : "Account number"}
          />
          <Select
            label="Garage"
            value={garage}
            onChange={setGarage}
            options={[
              { value: "", label: "— none —" },
              ...GARAGES.map((g) => ({ value: g, label: g })),
            ]}
          />
          <FleetField value={fleet} onChange={setFleet} />
          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
              />
              Active (selectable by operations)
            </label>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          The number is validated on save —{" "}
          {rail === "MAYA"
            ? "normalized to 639XXXXXXXXX."
            : "digits only, kept as text so leading zeros survive."}
        </p>
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
            {driver ? "Save changes" : "Add driver"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

// ---- CSV helpers ------------------------------------------------------------

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

function parseDriverCsv(text: string): {
  rows: DriverInput[];
  errors: string[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { rows: [], errors: ["Empty file"] };

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (k: string) => header.indexOf(k);
  const ci = {
    name: idx("name"),
    rail: idx("rail"),
    number: idx("number"),
    garage: idx("garage"),
    fleet: idx("default_fleet"),
    active: idx("active"),
  };
  if (ci.name < 0 || ci.rail < 0 || ci.number < 0)
    return { rows: [], errors: ["Missing required columns name/rail/number"] };

  const rows: DriverInput[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    const name = (c[ci.name] ?? "").trim();
    const railRaw = (c[ci.rail] ?? "").trim().toUpperCase();
    if (!name) continue;
    if (railRaw !== "BPI" && railRaw !== "MAYA") {
      errors.push(`Row ${i + 1}: rail must be BPI or MAYA`);
      break;
    }
    const rail = railRaw as Rail;
    try {
      const number = normalizeDriverNumber(rail, c[ci.number] ?? "");
      rows.push({
        name,
        rail,
        number,
        garage: ci.garage >= 0 ? (c[ci.garage] ?? "").trim() || null : null,
        defaultFleet: ci.fleet >= 0 ? (c[ci.fleet] ?? "").trim() || null : null,
        active:
          ci.active >= 0
            ? !/^(false|0|no|inactive)$/i.test((c[ci.active] ?? "").trim())
            : true,
      });
    } catch (e: any) {
      errors.push(`Row ${i + 1}: ${e.message}`);
      break;
    }
  }
  return { rows, errors };
}
