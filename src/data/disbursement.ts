import { supabase } from "../lib/supabase";
import { mondayOf } from "../lib/util";

// ============================================================================
// Disbursement & Vale — types
// ============================================================================

export type Rail = "BPI" | "MAYA";
export type ReqType = "Budget" | "CA" | "Reimb";
export type ReceiptStatus = "with_receipt" | "pending" | "charge_driver";
export type ReqStatus =
  | "Requested"
  | "Submitted"
  | "Approved"
  | "Rejected"
  | "Disbursed";
export type BatchStatus = "Submitted" | "Approved" | "Rejected" | "Disbursed";

export type Driver = {
  id: string;
  name: string;
  rail: Rail;
  number: string;
  garage: string | null;
  defaultFleet: string | null;
  active: boolean;
};

/** Safe driver shape the requester sees — no rail, no number. */
export type DriverPublic = {
  id: string;
  name: string;
  garage: string | null;
  defaultFleet: string | null;
  active: boolean;
};

export type DisbRequest = {
  id: string;
  driverId: string;
  driverName: string;
  /** Only populated for back-office roles (encoder/approver/payroll/admin). */
  rail: Rail | null;
  number: string | null;
  fleet: string | null;
  garage: string | null;
  amount: number;
  type: ReqType;
  justification: string;
  txnDate: Date;
  weekStart: Date;
  receiptStatus: ReceiptStatus | null;
  caInstallment: string | null;
  status: ReqStatus;
  batchId: string | null;
  requestedBy: string | null;
  createdAt: Date;
};

export type Batch = {
  id: string;
  code: string;
  status: BatchStatus;
  submittedBy: string | null;
  submittedByName: string | null;
  submittedAt: Date;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  approvalRef: string | null;
  rejectReason: string | null;
  requests: DisbRequest[];
};

export type PayrollWeek = {
  id: string;
  weekStart: Date;
  closed: boolean;
  submittedToPayrollAt: Date | null;
  releasedAt: Date | null;
};

// ============================================================================
// helpers
// ============================================================================

function db() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

function iso(date: Date | null): string | null {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function toDate(value: string): Date {
  // 'YYYY-MM-DD' → local midnight (avoids the UTC day-shift bug)
  const [y, m, d] = value.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ============================================================================
// driver number validation (run before insert, per the spec)
// ============================================================================

/** Normalize any PH mobile to 639XXXXXXXXX (12 digits) or throw. */
export function normalizeMaya(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("639")) return digits;
  if (digits.length === 11 && digits.startsWith("09"))
    return "63" + digits.slice(1);
  if (digits.length === 10 && digits.startsWith("9")) return "63" + digits;
  throw new Error(
    `Invalid Maya mobile "${raw}". Use 09XXXXXXXXX or 639XXXXXXXXX.`
  );
}

/** Validate a BPI account: digits only, length ≥ 6. Returns the digit string. */
export function validateBPI(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6)
    throw new Error(`Invalid BPI account "${raw}". Needs at least 6 digits.`);
  return digits;
}

/** Validate + normalize a driver's rail number for the chosen rail. */
export function normalizeDriverNumber(rail: Rail, raw: string): string {
  return rail === "MAYA" ? normalizeMaya(raw) : validateBPI(raw);
}

// ============================================================================
// mappers
// ============================================================================

function mapDriver(row: any): Driver {
  return {
    id: row.id,
    name: row.name,
    rail: row.rail,
    number: row.number,
    garage: row.garage ?? null,
    defaultFleet: row.default_fleet ?? null,
    active: row.active,
  };
}

function mapRequest(row: any): DisbRequest {
  const drv = row.drivers ?? null;
  return {
    id: row.id,
    driverId: row.driver_id,
    driverName: drv?.name ?? row.__driverName ?? "—",
    rail: (drv?.rail ?? null) as Rail | null,
    number: drv?.number ?? null,
    fleet: drv?.default_fleet ?? null,
    garage: drv?.garage ?? null,
    amount: Number(row.amount),
    type: row.type,
    justification: row.justification ?? "",
    txnDate: toDate(row.txn_date),
    weekStart: toDate(row.week_start),
    receiptStatus: row.receipt_status ?? null,
    caInstallment: row.ca_installment ?? null,
    status: row.status,
    batchId: row.batch_id ?? null,
    requestedBy: row.requested_by ?? null,
    createdAt: new Date(row.created_at),
  };
}

const REQUEST_WITH_DRIVER =
  "*, drivers(name, rail, number, garage, default_fleet)";

// ============================================================================
// drivers
// ============================================================================

export async function fetchDrivers(): Promise<Driver[]> {
  const { data, error } = await db()
    .from("drivers")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapDriver);
}

/** Requester-safe search — returns names only, never rails/numbers. */
export async function searchDrivers(q: string): Promise<DriverPublic[]> {
  const { data, error } = await db().rpc("search_drivers", { q });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    garage: r.garage ?? null,
    defaultFleet: r.default_fleet ?? null,
    active: r.active,
  }));
}

/** Distinct non-empty fleet names across the driver master (for assigning ops users). */
export async function fetchFleets(): Promise<string[]> {
  const { data, error } = await db()
    .from("drivers")
    .select("default_fleet")
    .not("default_fleet", "is", null);
  if (error) throw error;
  const set = new Set<string>();
  for (const r of data ?? []) {
    const f = (r as any).default_fleet?.trim();
    if (f) set.add(f);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export type DriverInput = {
  name: string;
  rail: Rail;
  number: string; // already validated/normalized
  garage: string | null;
  defaultFleet: string | null;
  active: boolean;
};

export async function createDriver(input: DriverInput): Promise<Driver> {
  const { data, error } = await db()
    .from("drivers")
    .insert({
      name: input.name,
      rail: input.rail,
      number: input.number,
      garage: input.garage,
      default_fleet: input.defaultFleet,
      active: input.active,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapDriver(data);
}

export async function updateDriver(
  id: string,
  patch: Partial<DriverInput>
): Promise<void> {
  const upd: Record<string, any> = {};
  if (patch.name !== undefined) upd.name = patch.name;
  if (patch.rail !== undefined) upd.rail = patch.rail;
  if (patch.number !== undefined) upd.number = patch.number;
  if (patch.garage !== undefined) upd.garage = patch.garage;
  if (patch.defaultFleet !== undefined) upd.default_fleet = patch.defaultFleet;
  if (patch.active !== undefined) upd.active = patch.active;
  const { error } = await db().from("drivers").update(upd).eq("id", id);
  if (error) throw error;
}

export async function deleteDriver(id: string): Promise<void> {
  const { error } = await db().from("drivers").delete().eq("id", id);
  if (error) throw error;
}

/** Bulk insert (CSV import). Numbers must already be validated/normalized. */
export async function createDriversBulk(rows: DriverInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await db().from("drivers").insert(
    rows.map((r) => ({
      name: r.name,
      rail: r.rail,
      number: r.number,
      garage: r.garage,
      default_fleet: r.defaultFleet,
      active: r.active,
    }))
  );
  if (error) throw error;
  return rows.length;
}

// ============================================================================
// requests
// ============================================================================

export type NewRequestInput = {
  driverId: string;
  amount: number;
  type: ReqType;
  justification: string;
  txnDate: Date;
  receiptStatus: ReceiptStatus | null;
  caInstallment: string | null;
};

export async function createRequest(input: NewRequestInput): Promise<void> {
  const weekStart = mondayOf(input.txnDate);
  const { error } = await db()
    .from("disbursement_requests")
    .insert({
      driver_id: input.driverId,
      amount: input.amount,
      type: input.type,
      justification: input.justification || null,
      txn_date: iso(input.txnDate),
      week_start: iso(weekStart),
      receipt_status: input.type === "Reimb" ? input.receiptStatus : null,
      ca_installment: input.type === "CA" ? input.caInstallment : null,
      status: "Requested",
    });
  if (error) throw error;
}

/**
 * The current user's own requests. Driver names are resolved through the
 * security-definer RPC so requesters never touch the drivers table.
 */
export async function fetchMyRequests(userId: string): Promise<DisbRequest[]> {
  const { data, error } = await db()
    .from("disbursement_requests")
    .select("*")
    .eq("requested_by", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];

  const ids = [...new Set(rows.map((r: any) => r.driver_id))];
  const names: Record<string, string> = {};
  if (ids.length) {
    const { data: nd } = await db().rpc("driver_names", { ids });
    for (const n of nd ?? []) names[n.id] = n.name;
  }
  return rows.map((r: any) => mapRequest({ ...r, __driverName: names[r.driver_id] }));
}

export async function updateRequest(
  id: string,
  patch: Partial<NewRequestInput>
): Promise<void> {
  const upd: Record<string, any> = {};
  if (patch.amount !== undefined) upd.amount = patch.amount;
  if (patch.type !== undefined) upd.type = patch.type;
  if (patch.justification !== undefined)
    upd.justification = patch.justification || null;
  if (patch.txnDate !== undefined) {
    upd.txn_date = iso(patch.txnDate);
    upd.week_start = iso(mondayOf(patch.txnDate));
  }
  if (patch.receiptStatus !== undefined) upd.receipt_status = patch.receiptStatus;
  if (patch.caInstallment !== undefined) upd.ca_installment = patch.caInstallment;
  const { error } = await db()
    .from("disbursement_requests")
    .update(upd)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteRequest(id: string): Promise<void> {
  const { error } = await db()
    .from("disbursement_requests")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** Pooled, still-loose requests for the encoder workspace. */
export async function fetchPooledRequests(): Promise<DisbRequest[]> {
  const { data, error } = await db()
    .from("disbursement_requests")
    .select(REQUEST_WITH_DRIVER)
    .eq("status", "Requested")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRequest);
}

/** All requests in a payroll week (with rail/number) — payroll + owner views. */
export async function fetchRequestsForWeek(
  weekStart: Date
): Promise<DisbRequest[]> {
  const { data, error } = await db()
    .from("disbursement_requests")
    .select(REQUEST_WITH_DRIVER)
    .eq("week_start", iso(weekStart))
    .order("txn_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRequest);
}

/** Everything (with rail/number) for the owner dashboard rollups. */
export async function fetchAllRequests(): Promise<DisbRequest[]> {
  const { data, error } = await db()
    .from("disbursement_requests")
    .select(REQUEST_WITH_DRIVER)
    .order("txn_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRequest);
}

// ============================================================================
// batches
// ============================================================================

async function resolveNames(ids: (string | null)[]): Promise<Record<string, string>> {
  const real = [...new Set(ids.filter(Boolean))] as string[];
  if (!real.length) return {};
  const { data } = await db().rpc("profile_names", { ids: real });
  const out: Record<string, string> = {};
  for (const p of data ?? []) out[p.id] = p.full_name;
  return out;
}

function mapBatch(row: any, names: Record<string, string>): Batch {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    submittedBy: row.submitted_by ?? null,
    submittedByName: row.submitted_by ? names[row.submitted_by] ?? null : null,
    submittedAt: new Date(row.submitted_at),
    approvedBy: row.approved_by ?? null,
    approvedByName: row.approved_by ? names[row.approved_by] ?? null : null,
    approvedAt: row.approved_at ? new Date(row.approved_at) : null,
    approvalRef: row.approval_ref ?? null,
    rejectReason: row.reject_reason ?? null,
    requests: (row.disbursement_requests ?? []).map(mapRequest),
  };
}

export async function fetchBatches(status?: BatchStatus): Promise<Batch[]> {
  let q = db()
    .from("disbursement_batches")
    .select(`*, disbursement_requests(${REQUEST_WITH_DRIVER})`)
    .order("submitted_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];
  const names = await resolveNames(
    rows.flatMap((r: any) => [r.submitted_by, r.approved_by])
  );
  return rows.map((r: any) => mapBatch(r, names));
}

export async function submitBatch(requestIds: string[]): Promise<Batch> {
  const { data, error } = await db().rpc("submit_batch", {
    request_ids: requestIds,
  });
  if (error) throw error;
  return mapBatch(data, {});
}

export async function approveBatch(batchId: string): Promise<void> {
  const { error } = await db().rpc("approve_batch", { p_batch_id: batchId });
  if (error) throw error;
}

export async function rejectBatch(
  batchId: string,
  reason: string
): Promise<void> {
  const { error } = await db().rpc("reject_batch", {
    p_batch_id: batchId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function markDisbursed(batchId: string): Promise<void> {
  const { error } = await db().rpc("mark_disbursed", { p_batch_id: batchId });
  if (error) throw error;
}

// ============================================================================
// payroll weeks
// ============================================================================

function mapWeek(row: any): PayrollWeek {
  return {
    id: row.id,
    weekStart: toDate(row.week_start),
    closed: row.closed,
    submittedToPayrollAt: row.submitted_to_payroll_at
      ? new Date(row.submitted_to_payroll_at)
      : null,
    releasedAt: row.released_at ? toDate(row.released_at) : null,
  };
}

export async function fetchWeeks(): Promise<PayrollWeek[]> {
  const { data, error } = await db()
    .from("payroll_weeks")
    .select("*")
    .order("week_start", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapWeek);
}

export async function closeWeek(weekStart: Date): Promise<PayrollWeek> {
  const { data, error } = await db().rpc("close_week", {
    p_week_start: iso(weekStart),
  });
  if (error) throw error;
  return mapWeek(data);
}

// ============================================================================
// generated-file storage (private 'disbursements' bucket, retained for audit)
// ============================================================================

export async function uploadDisbursementFile(
  batchCode: string,
  filename: string,
  data: Blob | ArrayBuffer
): Promise<string> {
  const path = `${batchCode}/${filename}`;
  const { error } = await db()
    .storage.from("disbursements")
    .upload(path, data, { upsert: true });
  if (error) throw error;
  return path;
}

export async function disbursementSignedUrl(
  path: string
): Promise<string | null> {
  const { data, error } = await db()
    .storage.from("disbursements")
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}
