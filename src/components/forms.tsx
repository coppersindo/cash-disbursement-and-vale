import { Loader2, Paperclip, X } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { buildRequirements } from "../data/requirements";
import {
  GARAGES,
  POSITIONS,
  SITES,
  TRAINING_STATUSES,
  TRUCK_TYPES,
} from "../data/types";
import type {
  Applicant,
  DriverProfile,
  Employee,
  Position,
  TrainingStatus,
  TruckType,
} from "../data/types";
import type {
  ApplicantPatch,
  EmployeePatch,
  NewApplicantInput,
  NewDocInput,
  NewEmployeeInput,
  NewViolationInput,
} from "../data/repo";
import { addMonths, fromDateInput, toDateInput } from "../lib/util";

// Common fleet/account tags (free text — datalist is just suggestions)
export const FLEET_SUGGESTIONS = [
  "Dump – Bounty",
  "Dump – Cemex",
  "Dump – Coke",
  "Flatbed – Coke",
  "Tanker – Coke",
  "Tanker – Petron",
  "Palletized – Coke",
  "Bulk – Cemex",
];

// ---- primitives -------------------------------------------------------------

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Text({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
      />
    </label>
  );
}

export function Textarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </span>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
      />
    </label>
  );
}

export function FleetField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        Fleet / Account
      </span>
      <input
        list="fleet-suggestions"
        value={value}
        placeholder="e.g. Dump – Bounty"
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
      />
      <datalist id="fleet-suggestions">
        {FLEET_SUGGESTIONS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
    </label>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DateField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        type="date"
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
      />
    </label>
  );
}

function SubmitRow({
  busy,
  onCancel,
  submitLabel,
}: {
  busy: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
      >
        {busy && <Loader2 size={15} className="animate-spin" />}
        {submitLabel}
      </button>
    </div>
  );
}

const truckOptions = [
  { value: "", label: "— none —" },
  ...TRUCK_TYPES.map((t) => ({ value: t, label: t })),
];

// ---- New Applicant ----------------------------------------------------------

export function NewApplicantForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (input: NewApplicantInput) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState<Position>("Trailer Driver");
  const [truckType, setTruckType] = useState<TruckType | "">("");
  const [site, setSite] = useState(SITES[0]);
  const [fleet, setFleet] = useState("");
  const [source, setSource] = useState("Walk-in");
  const [recruiter, setRecruiter] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const tt = (truckType || null) as TruckType | null;
      await onSubmit({
        name: name.trim(),
        phone: phone.trim(),
        position,
        truckType: tt,
        site,
        fleet: fleet.trim(),
        source,
        recruiter: recruiter.trim(),
        nextAction: fromDateInput(nextAction),
        remarks: remarks.trim(),
        requirements: buildRequirements(position, tt),
      });
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Could not save.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Text label="Full name" value={name} onChange={setName} required placeholder="Juan dela Cruz" />
        </div>
        <Text label="Phone" value={phone} onChange={setPhone} placeholder="0917 …" />
        <Select
          label="Source"
          value={source}
          onChange={setSource}
          options={["Walk-in", "Referral", "Facebook", "Job Fair"].map((s) => ({ value: s, label: s }))}
        />
        <Select
          label="Position"
          value={position}
          onChange={(v) => setPosition(v as Position)}
          options={POSITIONS.map((p) => ({ value: p, label: p }))}
          required
        />
        <Select
          label="Truck type"
          value={truckType}
          onChange={(v) => setTruckType(v as TruckType | "")}
          options={truckOptions}
        />
        <Select
          label="Recruitment site"
          value={site}
          onChange={setSite}
          options={SITES.map((s) => ({ value: s, label: s }))}
          required
        />
        <FleetField value={fleet} onChange={setFleet} />
        <Text label="Recruiter" value={recruiter} onChange={setRecruiter} placeholder="Assigned recruiter" />
        <DateField label="Next action / follow-up" value={nextAction} onChange={setNextAction} />
        <div className="col-span-2">
          <Textarea
            label="Remarks"
            value={remarks}
            onChange={setRemarks}
            placeholder="Notes about this applicant…"
          />
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Starts in <b>Initial Screening</b> with an auto-generated requirement
        checklist based on the role.
      </p>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <SubmitRow busy={busy} onCancel={onClose} submitLabel="Add applicant" />
    </form>
  );
}

// ---- New Employee -----------------------------------------------------------

export function NewEmployeeForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (input: NewEmployeeInput) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState<Position>("Trailer Driver");
  const [truckType, setTruckType] = useState<TruckType | "">("");
  const [fleet, setFleet] = useState("");
  const [garage, setGarage] = useState(GARAGES[0]);
  const [department, setDepartment] = useState("Fleet Operations");
  const [status, setStatus] = useState<"Probationary" | "Regular">("Probationary");
  const [hired, setHired] = useState(toDateInput(new Date()));
  const [regDue, setRegDue] = useState(toDateInput(addMonths(new Date(), 6)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const tt = (truckType || null) as TruckType | null;
      const hiredDate = fromDateInput(hired) ?? new Date();
      await onSubmit({
        name: name.trim(),
        position,
        truckType: tt,
        fleet: fleet.trim(),
        garage,
        department,
        status,
        hired: hiredDate,
        regDue: status === "Probationary" ? fromDateInput(regDue) : null,
        requirements: buildRequirements(position, tt),
      });
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Could not save.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Text label="Full name" value={name} onChange={setName} required />
        </div>
        <Select
          label="Position"
          value={position}
          onChange={(v) => setPosition(v as Position)}
          options={POSITIONS.map((p) => ({ value: p, label: p }))}
          required
        />
        <Select
          label="Truck type"
          value={truckType}
          onChange={(v) => setTruckType(v as TruckType | "")}
          options={truckOptions}
        />
        <FleetField value={fleet} onChange={setFleet} />
        <Select
          label="Garage"
          value={garage}
          onChange={setGarage}
          options={GARAGES.map((g) => ({ value: g, label: g }))}
          required
        />
        <Text label="Department" value={department} onChange={setDepartment} />
        <Select
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as "Probationary" | "Regular")}
          options={["Probationary", "Regular"].map((s) => ({ value: s, label: s }))}
        />
        <DateField label="Date hired" value={hired} onChange={setHired} required />
        {status === "Probationary" && (
          <DateField
            label="Regularization due"
            value={regDue}
            onChange={setRegDue}
          />
        )}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Employee number is assigned automatically. The regularization date
        defaults to 6 months out — adjust it above if needed.
      </p>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <SubmitRow busy={busy} onCancel={onClose} submitLabel="Add employee" />
    </form>
  );
}

// ---- Add Document -----------------------------------------------------------

const DOC_TYPES = [
  "Professional Driver's License",
  "NBI Clearance",
  "Police Clearance",
  "Barangay Clearance",
  "SSS Number",
  "PhilHealth",
  "Pag-IBIG",
  "Birth Certificate",
  "TIN ID",
  "Resume",
  "Application Form",
  "Certificate of Employment (COE)",
  "Medical Certificate",
  "Hazmat Fitness Clearance",
  "Other",
];

export function AddDocumentForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (input: NewDocInput) => Promise<void>;
  onClose: () => void;
}) {
  const [type, setType] = useState(DOC_TYPES[0]);
  const [customType, setCustomType] = useState("");
  const [issued, setIssued] = useState(toDateInput(new Date()));
  const [expiration, setExpiration] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const issuedD = fromDateInput(issued);
      const expD = fromDateInput(expiration);
      if (!issuedD || !expD) throw new Error("Issued and expiration dates are required.");
      await onSubmit({
        type: type === "Other" ? customType.trim() || "Document" : type,
        issued: issuedD,
        expiration: expD,
        file,
      });
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Could not save.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Select
            label="Document type"
            value={type}
            onChange={setType}
            options={DOC_TYPES.map((t) => ({ value: t, label: t }))}
            required
          />
        </div>
        {type === "Other" && (
          <div className="col-span-2">
            <Text label="Specify type" value={customType} onChange={setCustomType} required />
          </div>
        )}
        <DateField label="Issued" value={issued} onChange={setIssued} required />
        <DateField label="Expiration" value={expiration} onChange={setExpiration} required />
        <div className="col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Scan / photo (optional)
          </span>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-500 hover:border-amber-400">
            <Paperclip size={15} />
            {file ? file.name : "Attach a file (PDF or image)"}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <SubmitRow busy={busy} onCancel={onClose} submitLabel="Add document" />
    </form>
  );
}

// ---- Edit Applicant ---------------------------------------------------------

export function EditApplicantForm({
  applicant,
  onSubmit,
  onClose,
}: {
  applicant: Applicant;
  onSubmit: (patch: ApplicantPatch) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(applicant.name);
  const [phone, setPhone] = useState(applicant.phone);
  const [position, setPosition] = useState<Position>(applicant.position);
  const [truckType, setTruckType] = useState<TruckType | "">(
    applicant.truckType ?? ""
  );
  const [site, setSite] = useState(applicant.site || SITES[0]);
  const [fleet, setFleet] = useState(applicant.fleet);
  const [source, setSource] = useState(applicant.source);
  const [recruiter, setRecruiter] = useState(applicant.recruiter);
  const [nextAction, setNextAction] = useState(toDateInput(applicant.nextAction));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      position,
      truckType: (truckType || null) as TruckType | null,
      site,
      fleet: fleet.trim(),
      source,
      recruiter: recruiter.trim(),
      nextAction: fromDateInput(nextAction),
    });
    onClose();
  }

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Text label="Full name" value={name} onChange={setName} required />
        </div>
        <Text label="Phone" value={phone} onChange={setPhone} />
        <Select
          label="Source"
          value={source}
          onChange={setSource}
          options={["Walk-in", "Referral", "Facebook", "Job Fair"].map((s) => ({ value: s, label: s }))}
        />
        <Select
          label="Position"
          value={position}
          onChange={(v) => setPosition(v as Position)}
          options={POSITIONS.map((p) => ({ value: p, label: p }))}
        />
        <Select
          label="Truck type"
          value={truckType}
          onChange={(v) => setTruckType(v as TruckType | "")}
          options={truckOptions}
        />
        <Select
          label="Recruitment site"
          value={site}
          onChange={setSite}
          options={SITES.map((s) => ({ value: s, label: s }))}
        />
        <FleetField value={fleet} onChange={setFleet} />
        <Text label="Recruiter" value={recruiter} onChange={setRecruiter} />
        <DateField label="Next action" value={nextAction} onChange={setNextAction} />
      </div>
      <SubmitRow busy={false} onCancel={onClose} submitLabel="Save changes" />
    </form>
  );
}

// ---- Edit Employee ----------------------------------------------------------

export function EditEmployeeForm({
  employee,
  onSubmit,
  onClose,
}: {
  employee: Employee;
  onSubmit: (patch: EmployeePatch) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(employee.name);
  const [position, setPosition] = useState<Position>(employee.position);
  const [truckType, setTruckType] = useState<TruckType | "">(
    employee.truckType ?? ""
  );
  const [fleet, setFleet] = useState(employee.fleet);
  const [garage, setGarage] = useState(employee.garage || GARAGES[0]);
  const [department, setDepartment] = useState(employee.department);
  const [hired, setHired] = useState(toDateInput(employee.hired));
  const [regDue, setRegDue] = useState(toDateInput(employee.regDue));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      position,
      truckType: (truckType || null) as TruckType | null,
      fleet: fleet.trim(),
      garage,
      department,
      hired: fromDateInput(hired) ?? employee.hired,
      regDue: fromDateInput(regDue),
    });
    onClose();
  }

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Text label="Full name" value={name} onChange={setName} required />
        </div>
        <Select
          label="Position"
          value={position}
          onChange={(v) => setPosition(v as Position)}
          options={POSITIONS.map((p) => ({ value: p, label: p }))}
        />
        <Select
          label="Truck type"
          value={truckType}
          onChange={(v) => setTruckType(v as TruckType | "")}
          options={truckOptions}
        />
        <Select
          label="Garage"
          value={garage}
          onChange={setGarage}
          options={GARAGES.map((g) => ({ value: g, label: g }))}
        />
        <FleetField value={fleet} onChange={setFleet} />
        <Text label="Department" value={department} onChange={setDepartment} />
        <div />
        <DateField label="Date hired" value={hired} onChange={setHired} />
        <DateField label="Regularization due" value={regDue} onChange={setRegDue} />
      </div>
      <SubmitRow busy={false} onCancel={onClose} submitLabel="Save changes" />
    </form>
  );
}

// ---- Driver Profile (personal + license) ------------------------------------

export function DriverProfileForm({
  employee,
  onSubmit,
  onClose,
}: {
  employee: Employee;
  onSubmit: (profile: DriverProfile) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<Record<string, string>>({
    birthdate: toDateInput(employee.birthdate),
    gender: employee.gender,
    civilStatus: employee.civilStatus,
    bloodType: employee.bloodType,
    mobile: employee.mobile,
    email: employee.email,
    address: employee.address,
    emergencyName: employee.emergencyName,
    emergencyRelation: employee.emergencyRelation,
    emergencyContact: employee.emergencyContact,
    sssNo: employee.sssNo,
    philhealthNo: employee.philhealthNo,
    pagibigNo: employee.pagibigNo,
    tinNo: employee.tinNo,
    licenseNo: employee.licenseNo,
    licenseRestrictions: employee.licenseRestrictions,
    licenseExpiry: toDateInput(employee.licenseExpiry),
  });
  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      birthdate: fromDateInput(f.birthdate),
      gender: f.gender,
      civilStatus: f.civilStatus,
      bloodType: f.bloodType,
      mobile: f.mobile,
      email: f.email,
      address: f.address,
      emergencyName: f.emergencyName,
      emergencyRelation: f.emergencyRelation,
      emergencyContact: f.emergencyContact,
      sssNo: f.sssNo,
      philhealthNo: f.philhealthNo,
      pagibigNo: f.pagibigNo,
      tinNo: f.tinNo,
      licenseNo: f.licenseNo,
      licenseRestrictions: f.licenseRestrictions,
      licenseExpiry: fromDateInput(f.licenseExpiry),
    });
    onClose();
  }

  return (
    <form onSubmit={submit} className="max-h-[70vh] overflow-y-auto pr-1">
      <SectionLabel>Personal</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <DateField label="Birthdate" value={f.birthdate} onChange={set("birthdate")} />
        <Select
          label="Gender"
          value={f.gender}
          onChange={set("gender")}
          options={["", "Male", "Female"].map((v) => ({ value: v, label: v || "—" }))}
        />
        <Select
          label="Civil status"
          value={f.civilStatus}
          onChange={set("civilStatus")}
          options={["", "Single", "Married", "Widowed", "Separated"].map((v) => ({ value: v, label: v || "—" }))}
        />
        <Text label="Blood type" value={f.bloodType} onChange={set("bloodType")} />
        <Text label="Mobile" value={f.mobile} onChange={set("mobile")} placeholder="0917 …" />
        <Text label="Email" value={f.email} onChange={set("email")} />
        <div className="col-span-2">
          <Text label="Home address" value={f.address} onChange={set("address")} />
        </div>
      </div>

      <SectionLabel>Emergency contact</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <Text label="Name" value={f.emergencyName} onChange={set("emergencyName")} />
        <Text label="Relationship" value={f.emergencyRelation} onChange={set("emergencyRelation")} />
        <Text label="Contact number" value={f.emergencyContact} onChange={set("emergencyContact")} />
      </div>

      <SectionLabel>Government IDs</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <Text label="SSS No." value={f.sssNo} onChange={set("sssNo")} />
        <Text label="PhilHealth No." value={f.philhealthNo} onChange={set("philhealthNo")} />
        <Text label="Pag-IBIG No." value={f.pagibigNo} onChange={set("pagibigNo")} />
        <Text label="TIN" value={f.tinNo} onChange={set("tinNo")} />
      </div>

      <SectionLabel>Driver's license</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <Text label="License No." value={f.licenseNo} onChange={set("licenseNo")} />
        <Text label="Restriction codes" value={f.licenseRestrictions} onChange={set("licenseRestrictions")} />
        <DateField label="License expiry" value={f.licenseExpiry} onChange={set("licenseExpiry")} />
      </div>

      <SubmitRow busy={false} onCancel={onClose} submitLabel="Save profile" />
    </form>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400 first:mt-0">
      {children}
    </div>
  );
}

// ---- Add Violation ----------------------------------------------------------

export function AddViolationForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (input: NewViolationInput) => Promise<void>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(toDateInput(new Date()));
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [action, setAction] = useState("");
  const [points, setPoints] = useState("0");
  const [status, setStatus] = useState<"Open" | "Settled">("Open");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onSubmit({
        date: fromDateInput(date) ?? new Date(),
        type: type.trim() || "Violation",
        description: description.trim(),
        location: location.trim(),
        action: action.trim(),
        points: parseInt(points, 10) || 0,
        status,
      });
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Could not save.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-2 gap-3">
        <DateField label="Date" value={date} onChange={setDate} required />
        <Text label="Type" value={type} onChange={setType} required placeholder="e.g. Overspeeding" />
        <div className="col-span-2">
          <Text label="Description" value={description} onChange={setDescription} />
        </div>
        <Text label="Location" value={location} onChange={setLocation} />
        <Text label="Action / penalty" value={action} onChange={setAction} />
        <Text label="Demerit points" value={points} onChange={setPoints} />
        <Select
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as "Open" | "Settled")}
          options={["Open", "Settled"].map((s) => ({ value: s, label: s }))}
        />
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <SubmitRow busy={busy} onCancel={onClose} submitLabel="Add violation" />
    </form>
  );
}

// ---- Add Training -----------------------------------------------------------

export function AddTrainingForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (input: {
    name: string;
    status: TrainingStatus;
    refresher: Date | null;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<TrainingStatus>("For Training");
  const [refresher, setRefresher] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onSubmit({
        name: name.trim() || "Training",
        status,
        refresher: fromDateInput(refresher),
      });
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Could not save.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Text label="Training name" value={name} onChange={setName} required placeholder="e.g. Defensive Driving" />
        </div>
        <Select
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as TrainingStatus)}
          options={TRAINING_STATUSES.map((s) => ({ value: s, label: s }))}
        />
        <DateField label="Refresher due (optional)" value={refresher} onChange={setRefresher} />
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <SubmitRow busy={busy} onCancel={onClose} submitLabel="Add training" />
    </form>
  );
}

// ---- Back-out reason --------------------------------------------------------

export function BackOutForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Could not save.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Textarea
        label="Reason for back-out"
        value={reason}
        onChange={setReason}
        placeholder="e.g. Accepted another job, personal reasons…"
      />
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <SubmitRow busy={busy} onCancel={onClose} submitLabel="Mark as Back-out" />
    </form>
  );
}
