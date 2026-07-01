import type {
  Applicant,
  DocRecord,
  DocStatus,
  Employee,
} from "../data/types";
import { reqPct } from "../components/ui";
import { daysUntil, docStatus, isPast } from "./util";

/** A follow-up is overdue when its next action is due and the lead is still live. */
export function isOverdue(a: Applicant): boolean {
  if (!a.nextAction) return false;
  if (a.status === "Back-out" || a.status === "No Show" || a.status === "Hired")
    return false;
  return isPast(a.nextAction);
}

/** Flattened document row used by the global Documents table. */
export type DocRow = DocRecord & {
  owner: string;
  ownerKind: "Applicant" | "Employee";
  ownerId: string;
  status: DocStatus;
};

export function allDocRows(
  applicants: Applicant[],
  employees: Employee[]
): DocRow[] {
  const rows: DocRow[] = [];
  for (const a of applicants) {
    for (const d of a.documents) {
      rows.push({
        ...d,
        owner: a.name,
        ownerKind: "Applicant",
        ownerId: a.id,
        status: docStatus(d.expiration),
      });
    }
  }
  for (const e of employees) {
    for (const d of e.documents) {
      rows.push({
        ...d,
        owner: e.name,
        ownerKind: "Employee",
        ownerId: e.id,
        status: docStatus(d.expiration),
      });
    }
  }
  return rows.sort(
    (x, y) => x.expiration.getTime() - y.expiration.getTime()
  );
}

export function nonValidDocCount(docs: DocRecord[]): number {
  return docs.filter((d) => docStatus(d.expiration) !== "Valid").length;
}

/** Probationary and due for regularization within 30 days. */
export function dueForRegularization(employees: Employee[]): Employee[] {
  return employees.filter(
    (e) =>
      e.status === "Probationary" &&
      e.active &&
      e.regDue !== null &&
      daysUntil(e.regDue) <= 30
  );
}

export type DashboardCounts = {
  newApplicants: number;
  forFollowUp: number;
  pendingMedical: number;
  forDeployment: number;
  backOuts: number;
  activeEmployees: number;
  regularEmployees: number;
  dueForReg: number;
  expiringDocs: number;
  expiredDocs: number;
};

export function dashboardCounts(
  applicants: Applicant[],
  employees: Employee[]
): DashboardCounts {
  const docs = allDocRows(applicants, employees);
  return {
    newApplicants: applicants.filter((a) => daysUntil(a.applied) >= -7).length,
    forFollowUp: applicants.filter(isOverdue).length,
    pendingMedical: applicants.filter(
      (a) => a.stage === "Medical Examination"
    ).length,
    forDeployment: applicants.filter((a) => a.stage === "Deployment").length,
    backOuts: applicants.filter((a) => a.status === "Back-out").length,
    activeEmployees: employees.filter((e) => e.active).length,
    regularEmployees: employees.filter((e) => e.status === "Regular").length,
    dueForReg: dueForRegularization(employees).length,
    expiringDocs: docs.filter((d) => d.status === "Expiring Soon").length,
    expiredDocs: docs.filter((d) => d.status === "Expired").length,
  };
}

// ---- Reports derivations

export function trainingCompliance(employees: Employee[]): number {
  let total = 0;
  let done = 0;
  for (const e of employees) {
    for (const t of e.trainings) {
      total += 1;
      if (t.status === "Completed") done += 1;
    }
  }
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

export function avgRequirementsPct(
  applicants: Applicant[],
  employees: Employee[]
): number {
  const all = [
    ...applicants.map((a) => reqPct(a.requirements)),
    ...employees.map((e) => reqPct(e.requirements)),
  ];
  if (all.length === 0) return 0;
  return Math.round(all.reduce((s, n) => s + n, 0) / all.length);
}
