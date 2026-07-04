import { createClient } from "@supabase/supabase-js";
import {
  normalizeDriverNumber,
  type HRDriverRow,
  type Rail,
} from "../data/disbursement";
import { GARAGES } from "../data/types";

// ============================================================================
// Direct pull from the HR Recruitment Directory project.
//
// The two apps live on separate Supabase projects, and HR's RLS only shows
// the employees table to a signed-in, APPROVED HR user — so the sync asks for
// the admin's HR login, connects as them, reads the drivers, and signs out.
// Nothing is stored; the anon key below is public/client-safe by design.
// ============================================================================

const HR_URL = "https://wwfhusblshvarcgvgodz.supabase.co";
const HR_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3Zmh1c2Jsc2h2YXJjZ3Znb2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzI3NjksImV4cCI6MjA5ODMwODc2OX0.w3NowR6ShGmy5iCMGuohnOE72JTMGd9IxRi4XgJUbSw";

export type HRSyncResult = {
  rows: HRDriverRow[];
  /** active drivers skipped because pay method/account is missing in HR */
  missingPay: string[];
  /** drivers skipped because the pay account failed validation */
  invalid: { name: string; reason: string }[];
};

/**
 * Sign in to the HR project with the given HR credentials, pull all active
 * drivers (employees) with their mode of payment, and sign out again.
 */
export async function pullDriversFromHR(
  email: string,
  password: string
): Promise<HRSyncResult> {
  const hr = createClient(HR_URL, HR_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: authErr } = await hr.auth.signInWithPassword({
    email,
    password,
  });
  if (authErr) throw new Error(`HR sign-in failed: ${authErr.message}`);

  try {
    const { data, error } = await hr
      .from("employees")
      .select("emp_no, name, pay_method, pay_account, garage, active")
      .eq("active", true)
      .order("name");
    if (error) throw new Error(`HR read failed: ${error.message}`);
    if (!data || data.length === 0)
      throw new Error(
        "HR returned no drivers — is this HR account approved with access?"
      );

    const rows: HRDriverRow[] = [];
    const missingPay: string[] = [];
    const invalid: { name: string; reason: string }[] = [];

    for (const e of data) {
      const railRaw = (e.pay_method ?? "").trim().toUpperCase();
      const account = (e.pay_account ?? "").trim();
      if (!railRaw || !account) {
        missingPay.push(e.name);
        continue;
      }
      if (railRaw !== "BPI" && railRaw !== "MAYA") {
        invalid.push({ name: e.name, reason: `unknown rail "${e.pay_method}"` });
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
  } finally {
    await hr.auth.signOut().catch(() => {});
  }
}
