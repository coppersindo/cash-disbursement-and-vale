import { createClient } from "@supabase/supabase-js";
import {
  normalizeDriverNumber,
  type HRDriverRow,
  type Rail,
} from "../data/disbursement";
import { GARAGES } from "../data/types";

// ============================================================================
// Pull the driver master from the HR Recruitment Directory project.
//
// Primary path (same pattern as parts_drivers / parts_units in the other GITC
// apps): the HR project exposes an owner-owned view `public.disb_drivers`
// (emp_no, name, rail, number, garage) granted to anon — readable with the HR
// anon key, no HR login needed. Run supabase/hr-view-disb-drivers.sql on the
// HR project once to create it.
//
// Fallback path: sign in with an approved HR account and read employees
// directly (works even without the view).
// ============================================================================

const HR_URL = "https://wwfhusblshvarcgvgodz.supabase.co";
const HR_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3Zmh1c2Jsc2h2YXJjZ3Znb2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzI3NjksImV4cCI6MjA5ODMwODc2OX0.w3NowR6ShGmy5iCMGuohnOE72JTMGd9IxRi4XgJUbSw";

function hrClient() {
  return createClient(HR_URL, HR_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type HRSyncResult = {
  rows: HRDriverRow[];
  /** active drivers skipped because pay method/account is missing in HR */
  missingPay: string[];
  /** drivers skipped because rail/number failed validation */
  invalid: { name: string; reason: string }[];
};

type RawRecord = {
  emp_no: string;
  name: string;
  rail: string | null;
  number: string | null;
  garage: string | null;
};

function toSyncResult(records: RawRecord[]): HRSyncResult {
  const rows: HRDriverRow[] = [];
  const missingPay: string[] = [];
  const invalid: { name: string; reason: string }[] = [];

  for (const e of records) {
    const railRaw = (e.rail ?? "").trim().toUpperCase();
    const account = (e.number ?? "").trim();
    if (!railRaw || !account) {
      missingPay.push(e.name);
      continue;
    }
    if (railRaw !== "BPI" && railRaw !== "MAYA") {
      invalid.push({ name: e.name, reason: `unknown rail "${e.rail}"` });
      continue;
    }
    const rail = railRaw as Rail;
    try {
      const garage = (e.garage ?? "").trim();
      rows.push({
        hrEmpNo: e.emp_no,
        name: e.name,
        rail,
        number: normalizeDriverNumber(rail, account),
        // unknown garage → null so the local FK doesn't reject the row
        garage: (GARAGES as readonly string[]).includes(garage) ? garage : null,
      });
    } catch (ve: any) {
      invalid.push({ name: e.name, reason: ve.message });
    }
  }
  return { rows, missingPay, invalid };
}

/** Is this error "the disb_drivers view doesn't exist on HR yet"? */
export function isViewMissing(err: unknown): boolean {
  const m = String((err as any)?.message ?? err ?? "");
  return /disb_drivers|schema cache|does not exist|PGRST205|PGRST202|404/i.test(m);
}

/**
 * Primary: read the HR view with the anon key — no login.
 * Throws (isViewMissing → true) if the view hasn't been created on HR yet.
 */
export async function pullDriversFromHRView(): Promise<HRSyncResult> {
  const hr = hrClient();
  const { data, error } = await hr
    .from("disb_drivers")
    .select("emp_no, name, rail, number, garage")
    .order("name");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0)
    throw new Error(
      "The HR view returned no drivers — check pay info is filled in on HR."
    );
  return toSyncResult(data as RawRecord[]);
}

/**
 * Fallback: sign in with an approved HR account and read employees directly.
 * Credentials are used once and never stored.
 */
export async function pullDriversFromHR(
  email: string,
  password: string
): Promise<HRSyncResult> {
  const hr = hrClient();
  const { error: authErr } = await hr.auth.signInWithPassword({
    email,
    password,
  });
  if (authErr) throw new Error(`HR sign-in failed: ${authErr.message}`);

  try {
    const { data, error } = await hr
      .from("employees")
      .select("emp_no, name, rail:pay_method, number:pay_account, garage")
      .eq("active", true)
      .order("name");
    if (error) throw new Error(`HR read failed: ${error.message}`);
    if (!data || data.length === 0)
      throw new Error(
        "HR returned no drivers — is this HR account approved with access?"
      );
    return toSyncResult(data as unknown as RawRecord[]);
  } finally {
    await hr.auth.signOut().catch(() => {});
  }
}
