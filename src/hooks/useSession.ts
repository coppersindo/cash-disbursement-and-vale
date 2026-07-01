import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { UserRole } from "../data/types";

export type AuthState = {
  loading: boolean;
  session: Session | null;
  role: UserRole | null;
  fullName: string | null;
  approved: boolean;
  /** May approve/reject disbursement batches (the two named approvers). */
  disbursementApprover: boolean;
  refresh: () => void;
};

export function useSession(): AuthState {
  const [state, setState] = useState<
    Omit<AuthState, "refresh">
  >({
    loading: true,
    session: null,
    role: null,
    fullName: null,
    approved: false,
    disbursementApprover: false,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setState({
        loading: false,
        session: null,
        role: null,
        fullName: null,
        approved: false,
        disbursementApprover: false,
      });
      return;
    }

    async function loadProfile(session: Session | null) {
      if (!session) {
        setState({
          loading: false,
          session: null,
          role: null,
          fullName: null,
          approved: false,
          disbursementApprover: false,
        });
        return;
      }
      const { data } = await supabase!
        .from("profiles")
        .select("role, full_name, approved, disbursement_approver")
        .eq("id", session.user.id)
        .maybeSingle();
      setState({
        loading: false,
        session,
        role: (data?.role ?? "encoder") as UserRole,
        fullName: data?.full_name ?? session.user.email ?? null,
        approved: data?.approved ?? false,
        disbursementApprover: data?.disbursement_approver ?? false,
      });
    }

    supabase.auth.getSession().then(({ data }) => loadProfile(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      loadProfile(session);
    });
    return () => sub.subscription.unsubscribe();
  }, [tick]);

  return { ...state, refresh: () => setTick((t) => t + 1) };
}
