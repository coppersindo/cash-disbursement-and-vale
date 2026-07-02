export const STAGES = [
  "Initial Screening",
  "Trade Test",
  "Final Interview",
  "Job Offer",
  "Requirements Completion",
  "Medical Examination",
  "Training",
  "Waiting for Unit",
  "Deployment",
] as const;
export type Stage = (typeof STAGES)[number];

export const STATUSES = [
  "Active",
  "Follow-up",
  "Pending",
  "Back-out",
  "No Show",
  "Hired",
] as const;
export type Status = (typeof STATUSES)[number];

export const SITES = ["Meycauayan", "Bacolor", "Ibaan", "Misamis Oriental"];

export const GARAGES = [
  "Meycauayan Main",
  "Meycauayan 2",
  "Teresa Rizal",
  "Phividec",
  "Bacolor",
];

// Request groups — a driver belongs to one; ops users are assigned one or more,
// and can only file requests for drivers in their group(s).
export const FLEETS = [
  "TERESA",
  "BACOLOR",
  "MISAMIS",
  "COKE LUZON",
  "BATANGAS",
  "ADMIN OFFICE",
] as const;
export type Fleet = (typeof FLEETS)[number];

export const POSITIONS = ["Trailer Driver", "Truck Helper"] as const;
export type Position = (typeof POSITIONS)[number];

export const TRUCK_TYPES = [
  "Palletized",
  "Bulk",
  "Dump",
  "Flatbed",
  "Tanker",
] as const;
export type TruckType = (typeof TRUCK_TYPES)[number];

export type ReqState = "Missing" | "Pending" | "Complete";

export type UserRole =
  | "requester"
  | "encoder"
  | "approver"
  | "payroll"
  | "admin";

export type Profile = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: UserRole;
  approved: boolean;
  disbursementApprover?: boolean;
  fleets?: string[];
};

export type DocStatus = "Valid" | "Expiring Soon" | "Expired";

export type DocRecord = {
  type: string;
  issued: Date;
  expiration: Date;
  filePath?: string | null;
};

export type Applicant = {
  id: string;
  name: string;
  phone: string;
  position: Position;
  truckType: TruckType | null;
  site: string;
  fleet: string;
  stage: Stage;
  status: Status;
  source: string;
  applied: Date;
  nextAction: Date | null;
  recruiter: string;
  remarks: string;
  requirements: Record<string, ReqState>;
  reqFiles: Record<string, string>;
  documents: DocRecord[];
  history: { stage: Stage; date: Date; outcome: string }[];
};

export const TRAINING_STATUSES = [
  "For Training",
  "Ongoing",
  "Completed",
] as const;
export type TrainingStatus = "Pending" | (typeof TRAINING_STATUSES)[number];

export type Training = {
  id: string;
  name: string;
  expiration: Date | null;
  refresher: Date | null;
  status: TrainingStatus;
};

export type Violation = {
  id: string;
  date: Date;
  type: string;
  description: string;
  location: string;
  action: string;
  points: number;
  status: "Open" | "Settled";
};

/** The personal / license fields of a driver record (editable as a unit). */
export type DriverProfile = {
  birthdate: Date | null;
  gender: string;
  civilStatus: string;
  bloodType: string;
  mobile: string;
  email: string;
  address: string;
  emergencyName: string;
  emergencyRelation: string;
  emergencyContact: string;
  sssNo: string;
  philhealthNo: string;
  pagibigNo: string;
  tinNo: string;
  licenseNo: string;
  licenseRestrictions: string;
  licenseExpiry: Date | null;
};

export type Employee = {
  id: string;
  empNo: string;
  name: string;
  position: Position;
  truckType: TruckType | null;
  fleet: string;
  garage: string;
  department: string;
  status: "Probationary" | "Regular";
  hired: Date;
  regularized: Date | null;
  regDue: Date | null;
  resigned: Date | null;
  active: boolean;
  requirements: Record<string, ReqState>;
  reqFiles: Record<string, string>;
  documents: DocRecord[];
  trainings: Training[];
  violations: Violation[];
} & DriverProfile;
