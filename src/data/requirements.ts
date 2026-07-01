import type { Position, ReqState, TruckType } from "./types";

export type RequirementGroups = {
  "Employment Documents": string[];
  Medical: string[];
  Training: string[];
};

/**
 * Role-based requirement matrix. The checklist changes by position + truck type:
 *  - Trailer Drivers add "NC III – Articulated Driving"
 *  - Tanker (any driver) adds "Tanker Lorry Safety"
 *  - Truck Helpers get a deliberately lighter set
 */
export function requiredItems(
  position: Position,
  truckType: TruckType | null
): RequirementGroups {
  const isDriver = position === "Trailer Driver";

  const employmentDocs = [
    "Application Form",
    "Resume",
    "NBI Clearance",
    "Police Clearance",
    "Barangay Clearance",
    "SSS Number",
    "PhilHealth",
    "Pag-IBIG",
    "Birth Certificate",
    "Certificate of Employment (COE)",
  ];
  if (isDriver) {
    employmentDocs.push("Professional Driver's License", "TIN ID");
  }

  const medical = ["Pre-Employment Medical Exam", "Drug Test"];
  if (isDriver) {
    medical.push("Physical & Eye Exam");
  }
  if (truckType === "Tanker") {
    medical.push("Hazmat Fitness Clearance");
  }

  const training: string[] = ["Safety Orientation"];
  if (isDriver) {
    training.push("Defensive Driving");
    training.push("NC III – Articulated Driving");
  } else {
    training.push("Cargo Handling");
  }
  if (truckType === "Tanker") {
    training.push("Tanker Lorry Safety");
  }

  return {
    "Employment Documents": employmentDocs,
    Medical: medical,
    Training: training,
  };
}

/** Flatten the grouped requirements into the order they appear. */
export function requiredItemList(
  position: Position,
  truckType: TruckType | null
): string[] {
  const g = requiredItems(position, truckType);
  return [...g["Employment Documents"], ...g.Medical, ...g.Training];
}

/**
 * Build a fresh requirements record for a role, seeding each item with a state.
 * `seed` lets callers bias the demo data (e.g. mostly Complete, a few gaps).
 */
export function buildRequirements(
  position: Position,
  truckType: TruckType | null,
  seed?: (item: string, index: number) => ReqState
): Record<string, ReqState> {
  const items = requiredItemList(position, truckType);
  const out: Record<string, ReqState> = {};
  items.forEach((item, i) => {
    out[item] = seed ? seed(item, i) : "Missing";
  });
  return out;
}

/**
 * Recompute the requirement set after a role change, preserving the state of
 * any item that still applies and defaulting newly-required items to Missing.
 */
export function rebuildRequirements(
  position: Position,
  truckType: TruckType | null,
  existing: Record<string, ReqState>
): Record<string, ReqState> {
  const items = requiredItemList(position, truckType);
  const out: Record<string, ReqState> = {};
  for (const item of items) {
    out[item] = existing[item] ?? "Missing";
  }
  return out;
}
