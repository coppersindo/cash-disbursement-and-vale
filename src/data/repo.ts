import { supabase } from "../lib/supabase";
import type {
  Applicant,
  DocRecord,
  DriverProfile,
  Employee,
  Position,
  Profile,
  ReqState,
  Stage,
  Training,
  TrainingStatus,
  TruckType,
  UserRole,
  Violation,
} from "./types";

// ---- helpers ----------------------------------------------------------------

function d(value: string | null): Date | null {
  return value ? new Date(value) : null;
}
function reqD(value: string): Date {
  return new Date(value);
}
/**
 * Date → 'YYYY-MM-DD' for Postgres date columns, using LOCAL components.
 * (toISOString() converts to UTC, which shifts the day back for UTC+8/PH —
 * that was the "date hired minus one" bug.)
 */
function iso(date: Date | null): string | null {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function db() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

// ---- row → app-type mappers -------------------------------------------------

function mapApplicant(row: any): Applicant {
  const docs: DocRecord[] = (row.applicant_documents ?? []).map((x: any) => ({
    type: x.type,
    issued: reqD(x.issued),
    expiration: reqD(x.expiration),
    filePath: x.file_path ?? null,
  }));
  const history = (row.applicant_history ?? [])
    .map((x: any) => ({
      stage: x.stage as Stage,
      date: reqD(x.date),
      outcome: x.outcome ?? "",
    }))
    .sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

  const reqFiles: Record<string, string> = {};
  for (const rf of row.requirement_files ?? []) reqFiles[rf.item] = rf.file_path;

  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    position: row.position as Position,
    truckType: (row.truck_type ?? null) as TruckType | null,
    site: row.site ?? "",
    fleet: row.fleet ?? "",
    stage: row.stage as Stage,
    status: row.status,
    source: row.source ?? "",
    applied: reqD(row.applied),
    nextAction: d(row.next_action),
    recruiter: row.recruiter ?? "",
    remarks: row.remarks ?? "",
    requirements: (row.requirements ?? {}) as Record<string, ReqState>,
    reqFiles,
    documents: docs,
    history,
  };
}

function mapEmployee(row: any): Employee {
  const docs: DocRecord[] = (row.employee_documents ?? []).map((x: any) => ({
    type: x.type,
    issued: reqD(x.issued),
    expiration: reqD(x.expiration),
    filePath: x.file_path ?? null,
  }));
  const trainings: Training[] = (row.employee_trainings ?? []).map((x: any) => ({
    id: x.id,
    name: x.name,
    expiration: d(x.expiration),
    refresher: d(x.refresher),
    status: x.status,
  }));

  const reqFiles: Record<string, string> = {};
  for (const rf of row.requirement_files ?? []) reqFiles[rf.item] = rf.file_path;

  const violations: Violation[] = (row.violations ?? [])
    .map((v: any) => ({
      id: v.id,
      date: reqD(v.date),
      type: v.type,
      description: v.description ?? "",
      location: v.location ?? "",
      action: v.action ?? "",
      points: v.points ?? 0,
      status: v.status,
    }))
    .sort((a: Violation, b: Violation) => b.date.getTime() - a.date.getTime());

  return {
    id: row.id,
    empNo: row.emp_no,
    name: row.name,
    position: row.position as Position,
    truckType: (row.truck_type ?? null) as TruckType | null,
    fleet: row.fleet ?? "",
    garage: row.garage ?? "",
    department: row.department ?? "Fleet Operations",
    status: row.status,
    hired: reqD(row.hired),
    regularized: d(row.regularized),
    regDue: d(row.reg_due),
    resigned: d(row.resigned),
    active: row.active,
    requirements: (row.requirements ?? {}) as Record<string, ReqState>,
    reqFiles,
    documents: docs,
    trainings,
    violations,
    // --- personal / license profile
    birthdate: d(row.birthdate),
    gender: row.gender ?? "",
    civilStatus: row.civil_status ?? "",
    bloodType: row.blood_type ?? "",
    mobile: row.mobile ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    emergencyName: row.emergency_name ?? "",
    emergencyRelation: row.emergency_relation ?? "",
    emergencyContact: row.emergency_contact ?? "",
    sssNo: row.sss_no ?? "",
    philhealthNo: row.philhealth_no ?? "",
    pagibigNo: row.pagibig_no ?? "",
    tinNo: row.tin_no ?? "",
    licenseNo: row.license_no ?? "",
    licenseRestrictions: row.license_restrictions ?? "",
    licenseExpiry: d(row.license_expiry),
  };
}

// ---- reads ------------------------------------------------------------------

export async function fetchApplicants(): Promise<Applicant[]> {
  const { data, error } = await db()
    .from("applicants")
    .select("*, applicant_documents(*), applicant_history(*), requirement_files(*)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapApplicant);
}

export async function fetchEmployees(): Promise<Employee[]> {
  const { data, error } = await db()
    .from("employees")
    .select("*, employee_documents(*), employee_trainings(*), requirement_files(*), violations(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapEmployee);
}

// ---- writes -----------------------------------------------------------------

export async function persistStageMove(
  applicantId: string,
  stage: Stage
): Promise<void> {
  const client = db();
  const { error: e1 } = await client
    .from("applicants")
    .update({ stage })
    .eq("id", applicantId);
  if (e1) throw e1;
  const { error: e2 } = await client.from("applicant_history").insert({
    applicant_id: applicantId,
    stage,
    outcome: `Moved to ${stage}`,
  });
  if (e2) throw e2;
}

export async function persistApplicantReqs(
  applicantId: string,
  requirements: Record<string, ReqState>
): Promise<void> {
  const { error } = await db()
    .from("applicants")
    .update({ requirements })
    .eq("id", applicantId);
  if (error) throw error;
}

export async function persistEmployeeReqs(
  employeeId: string,
  requirements: Record<string, ReqState>
): Promise<void> {
  const { error } = await db()
    .from("employees")
    .update({ requirements })
    .eq("id", employeeId);
  if (error) throw error;
}

/**
 * Create a probationary employee from a deployment-ready applicant and mark
 * the applicant Hired. Returns the freshly-created employee (with its real
 * emp_no + id) so the UI can show it immediately.
 */
export async function deployApplicant(
  applicant: Applicant
): Promise<Employee> {
  const client = db();

  const { data: empNo, error: rpcErr } = await client.rpc("next_emp_no");
  if (rpcErr) throw rpcErr;

  const hired = new Date();
  const regDue = new Date(hired);
  regDue.setMonth(regDue.getMonth() + 6);

  const { data: inserted, error: insErr } = await client
    .from("employees")
    .insert({
      emp_no: empNo,
      name: applicant.name,
      position: applicant.position,
      truck_type: applicant.truckType,
      fleet: applicant.fleet || null,
      garage: "Meycauayan Main",
      department: "Fleet Operations",
      status: "Probationary",
      hired: iso(hired),
      reg_due: iso(regDue),
      active: true,
      requirements: applicant.requirements,
      source_applicant_id: applicant.id,
    })
    .select("*, employee_documents(*), employee_trainings(*), requirement_files(*), violations(*)")
    .single();
  if (insErr) throw insErr;

  // copy any applicant documents onto the new employee record
  if (applicant.documents.length > 0) {
    await client.from("employee_documents").insert(
      applicant.documents.map((doc) => ({
        employee_id: inserted.id,
        type: doc.type,
        issued: iso(doc.issued),
        expiration: iso(doc.expiration),
      }))
    );
  }

  const { error: updErr } = await client
    .from("applicants")
    .update({ status: "Hired" })
    .eq("id", applicant.id);
  if (updErr) throw updErr;

  // re-fetch to include the copied documents
  const { data: full } = await client
    .from("employees")
    .select("*, employee_documents(*), employee_trainings(*), requirement_files(*), violations(*)")
    .eq("id", inserted.id)
    .single();

  return mapEmployee(full ?? inserted);
}

// ---- create / update --------------------------------------------------------

export type NewApplicantInput = {
  name: string;
  phone: string;
  position: Position;
  truckType: TruckType | null;
  site: string;
  fleet: string;
  source: string;
  recruiter: string;
  nextAction: Date | null;
  remarks: string;
  requirements: Record<string, ReqState>;
};

export async function createApplicant(
  input: NewApplicantInput
): Promise<Applicant> {
  const client = db();
  const { data: row, error } = await client
    .from("applicants")
    .insert({
      name: input.name,
      phone: input.phone,
      position: input.position,
      truck_type: input.truckType,
      site: input.site || null,
      fleet: input.fleet || null,
      stage: "Initial Screening",
      status: "Active",
      source: input.source,
      applied: iso(new Date()),
      next_action: iso(input.nextAction),
      recruiter: input.recruiter,
      remarks: input.remarks || null,
      requirements: input.requirements,
    })
    .select("id")
    .single();
  if (error) throw error;

  await client.from("applicant_history").insert({
    applicant_id: row.id,
    stage: "Initial Screening",
    outcome: "Applied",
  });

  const { data: full, error: e2 } = await client
    .from("applicants")
    .select("*, applicant_documents(*), applicant_history(*), requirement_files(*)")
    .eq("id", row.id)
    .single();
  if (e2) throw e2;
  return mapApplicant(full);
}

export type ApplicantPatch = {
  name?: string;
  phone?: string;
  status?: Applicant["status"];
  nextAction?: Date | null;
  recruiter?: string;
  site?: string;
  fleet?: string;
  source?: string;
  position?: Position;
  truckType?: TruckType | null;
  remarks?: string;
  requirements?: Record<string, ReqState>;
};

export async function updateApplicant(
  id: string,
  patch: ApplicantPatch
): Promise<void> {
  const upd: Record<string, any> = {};
  if (patch.name !== undefined) upd.name = patch.name;
  if (patch.phone !== undefined) upd.phone = patch.phone;
  if (patch.status !== undefined) upd.status = patch.status;
  if (patch.nextAction !== undefined) upd.next_action = iso(patch.nextAction);
  if (patch.recruiter !== undefined) upd.recruiter = patch.recruiter;
  if (patch.site !== undefined) upd.site = patch.site || null;
  if (patch.fleet !== undefined) upd.fleet = patch.fleet || null;
  if (patch.source !== undefined) upd.source = patch.source;
  if (patch.position !== undefined) upd.position = patch.position;
  if (patch.truckType !== undefined) upd.truck_type = patch.truckType;
  if (patch.remarks !== undefined) upd.remarks = patch.remarks || null;
  if (patch.requirements !== undefined) upd.requirements = patch.requirements;
  const { error } = await db().from("applicants").update(upd).eq("id", id);
  if (error) throw error;
}

/** Append a remark/note to an applicant's stage history (audit trail). */
export async function addApplicantNote(
  applicantId: string,
  stage: Stage,
  outcome: string
): Promise<void> {
  const { error } = await db()
    .from("applicant_history")
    .insert({ applicant_id: applicantId, stage, outcome });
  if (error) throw error;
}

export async function deleteApplicant(id: string): Promise<void> {
  const { error } = await db().from("applicants").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteEmployee(id: string): Promise<void> {
  const { error } = await db().from("employees").delete().eq("id", id);
  if (error) throw error;
}

/** Update the personal / license profile of a driver record. */
export async function updateDriverProfile(
  id: string,
  p: DriverProfile
): Promise<void> {
  const { error } = await db()
    .from("employees")
    .update({
      birthdate: iso(p.birthdate),
      gender: p.gender || null,
      civil_status: p.civilStatus || null,
      blood_type: p.bloodType || null,
      mobile: p.mobile || null,
      email: p.email || null,
      address: p.address || null,
      emergency_name: p.emergencyName || null,
      emergency_relation: p.emergencyRelation || null,
      emergency_contact: p.emergencyContact || null,
      sss_no: p.sssNo || null,
      philhealth_no: p.philhealthNo || null,
      pagibig_no: p.pagibigNo || null,
      tin_no: p.tinNo || null,
      license_no: p.licenseNo || null,
      license_restrictions: p.licenseRestrictions || null,
      license_expiry: iso(p.licenseExpiry),
    })
    .eq("id", id);
  if (error) throw error;
}

// ---- violations -------------------------------------------------------------

export type NewViolationInput = {
  date: Date;
  type: string;
  description: string;
  location: string;
  action: string;
  points: number;
  status: "Open" | "Settled";
};

export async function addViolation(
  employeeId: string,
  input: NewViolationInput
): Promise<Violation> {
  const { data, error } = await db()
    .from("violations")
    .insert({
      employee_id: employeeId,
      date: iso(input.date),
      type: input.type,
      description: input.description || null,
      location: input.location || null,
      action: input.action || null,
      points: input.points,
      status: input.status,
    })
    .select("*")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    date: new Date(data.date),
    type: data.type,
    description: data.description ?? "",
    location: data.location ?? "",
    action: data.action ?? "",
    points: data.points ?? 0,
    status: data.status,
  };
}

export async function setViolationStatus(
  id: string,
  status: "Open" | "Settled"
): Promise<void> {
  const { error } = await db()
    .from("violations")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteViolation(id: string): Promise<void> {
  const { error } = await db().from("violations").delete().eq("id", id);
  if (error) throw error;
}

export type NewEmployeeInput = {
  name: string;
  position: Position;
  truckType: TruckType | null;
  fleet: string;
  garage: string;
  department: string;
  status: Employee["status"];
  hired: Date;
  regDue: Date | null;
  requirements: Record<string, ReqState>;
};

export async function createEmployee(
  input: NewEmployeeInput
): Promise<Employee> {
  const client = db();
  const { data: empNo, error: rpcErr } = await client.rpc("next_emp_no");
  if (rpcErr) throw rpcErr;

  const { data: row, error } = await client
    .from("employees")
    .insert({
      emp_no: empNo,
      name: input.name,
      position: input.position,
      truck_type: input.truckType,
      fleet: input.fleet || null,
      garage: input.garage || null,
      department: input.department,
      status: input.status,
      hired: iso(input.hired),
      reg_due: input.status === "Probationary" ? iso(input.regDue) : null,
      regularized: input.status === "Regular" ? iso(new Date()) : null,
      active: true,
      requirements: input.requirements,
    })
    .select("*, employee_documents(*), employee_trainings(*), requirement_files(*), violations(*)")
    .single();
  if (error) throw error;
  return mapEmployee(row);
}

export type EmployeePatch = {
  name?: string;
  position?: Position;
  garage?: string;
  department?: string;
  status?: Employee["status"];
  hired?: Date;
  regularized?: Date | null;
  regDue?: Date | null;
  resigned?: Date | null;
  active?: boolean;
  truckType?: TruckType | null;
  fleet?: string;
  requirements?: Record<string, ReqState>;
};

export async function updateEmployee(
  id: string,
  patch: EmployeePatch
): Promise<void> {
  const upd: Record<string, any> = {};
  if (patch.name !== undefined) upd.name = patch.name;
  if (patch.position !== undefined) upd.position = patch.position;
  if (patch.garage !== undefined) upd.garage = patch.garage || null;
  if (patch.department !== undefined) upd.department = patch.department;
  if (patch.status !== undefined) upd.status = patch.status;
  if (patch.hired !== undefined) upd.hired = iso(patch.hired);
  if (patch.regularized !== undefined) upd.regularized = iso(patch.regularized);
  if (patch.regDue !== undefined) upd.reg_due = iso(patch.regDue);
  if (patch.resigned !== undefined) upd.resigned = iso(patch.resigned);
  if (patch.active !== undefined) upd.active = patch.active;
  if (patch.truckType !== undefined) upd.truck_type = patch.truckType;
  if (patch.fleet !== undefined) upd.fleet = patch.fleet || null;
  if (patch.requirements !== undefined) upd.requirements = patch.requirements;
  const { error } = await db().from("employees").update(upd).eq("id", id);
  if (error) throw error;
}

// ---- training ---------------------------------------------------------------

export async function addEmployeeTraining(
  employeeId: string,
  input: { name: string; status: TrainingStatus; refresher: Date | null }
): Promise<Training> {
  const { data, error } = await db()
    .from("employee_trainings")
    .insert({
      employee_id: employeeId,
      name: input.name,
      status: input.status,
      refresher: iso(input.refresher),
      expiration: iso(input.refresher),
    })
    .select("*")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    status: data.status,
    refresher: data.refresher ? new Date(data.refresher) : null,
    expiration: data.expiration ? new Date(data.expiration) : null,
  };
}

export async function updateTrainingStatus(
  trainingId: string,
  status: TrainingStatus
): Promise<void> {
  const { error } = await db()
    .from("employee_trainings")
    .update({ status })
    .eq("id", trainingId);
  if (error) throw error;
}

export async function deleteTraining(trainingId: string): Promise<void> {
  const { error } = await db()
    .from("employee_trainings")
    .delete()
    .eq("id", trainingId);
  if (error) throw error;
}

// ---- documents + file upload ------------------------------------------------

async function uploadFile(
  ownerKind: "applicants" | "employees",
  ownerId: string,
  file: File
): Promise<string> {
  const client = db();
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${ownerKind}/${ownerId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await client.storage
    .from("documents")
    .upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

/** Upload (or replace) the proof file attached to a single requirement item. */
export async function uploadRequirementFile(
  ownerKind: "applicant" | "employee",
  ownerId: string,
  item: string,
  file: File
): Promise<string> {
  const client = db();
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `requirements/${ownerKind}/${ownerId}/${crypto.randomUUID()}-${safe}`;
  const { error: upErr } = await client.storage
    .from("documents")
    .upload(path, file, { upsert: false });
  if (upErr) throw upErr;

  const col = ownerKind === "applicant" ? "applicant_id" : "employee_id";
  // one file per (owner, item): clear any existing, then insert
  await client.from("requirement_files").delete().eq(col, ownerId).eq("item", item);
  const { error } = await client
    .from("requirement_files")
    .insert({ [col]: ownerId, item, file_path: path });
  if (error) throw error;
  return path;
}

export async function createSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await db()
    .storage.from("documents")
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export type NewDocInput = {
  type: string;
  issued: Date;
  expiration: Date;
  file: File | null;
};

export async function addApplicantDocument(
  applicantId: string,
  input: NewDocInput
): Promise<DocRecord & { file_path: string | null }> {
  const client = db();
  let filePath: string | null = null;
  if (input.file) filePath = await uploadFile("applicants", applicantId, input.file);
  const { error } = await client.from("applicant_documents").insert({
    applicant_id: applicantId,
    type: input.type,
    issued: iso(input.issued),
    expiration: iso(input.expiration),
    file_path: filePath,
  });
  if (error) throw error;
  return { type: input.type, issued: input.issued, expiration: input.expiration, file_path: filePath };
}

export async function addEmployeeDocument(
  employeeId: string,
  input: NewDocInput
): Promise<DocRecord & { file_path: string | null }> {
  const client = db();
  let filePath: string | null = null;
  if (input.file) filePath = await uploadFile("employees", employeeId, input.file);
  const { error } = await client.from("employee_documents").insert({
    employee_id: employeeId,
    type: input.type,
    issued: iso(input.issued),
    expiration: iso(input.expiration),
    file_path: filePath,
  });
  if (error) throw error;
  return { type: input.type, issued: input.issued, expiration: input.expiration, file_path: filePath };
}

// ---- team / access management (admin only) ----------------------------------

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await db()
    .from("profiles")
    .select("id, email, full_name, role, approved, disbursement_approver, fleets")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    id: p.id,
    email: p.email,
    fullName: p.full_name,
    role: p.role as UserRole,
    approved: p.approved,
    disbursementApprover: p.disbursement_approver ?? false,
    fleets: p.fleets ?? [],
  }));
}

export async function setProfileApproved(
  id: string,
  approved: boolean
): Promise<void> {
  const { error } = await db()
    .from("profiles")
    .update({ approved })
    .eq("id", id);
  if (error) throw error;
}

export async function setProfileRole(
  id: string,
  role: UserRole
): Promise<void> {
  const { error } = await db().from("profiles").update({ role }).eq("id", id);
  if (error) throw error;
}

export async function setProfileFleets(
  id: string,
  fleets: string[]
): Promise<void> {
  const { error } = await db()
    .from("profiles")
    .update({ fleets })
    .eq("id", id);
  if (error) throw error;
}

export async function setProfileApprover(
  id: string,
  disbursementApprover: boolean
): Promise<void> {
  const { error } = await db()
    .from("profiles")
    .update({ disbursement_approver: disbursementApprover })
    .eq("id", id);
  if (error) throw error;
}

