import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Layers,
  LayoutDashboard,
  Loader2,
  LogOut,
  PieChart,
  ShieldCheck,
  Stamp,
  Truck,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import Login from "./components/Login";
import TeamView from "./components/Team";
import Requester from "./components/disbursement/Requester";
import Encoder from "./components/disbursement/Encoder";
import Approver from "./components/disbursement/Approver";
import Payroll from "./components/disbursement/Payroll";
import DriverMaster from "./components/disbursement/DriverMaster";
import OwnerDashboard from "./components/disbursement/OwnerDashboard";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { useSession } from "./hooks/useSession";
import type { UserRole } from "./data/types";

type View =
  | "request"
  | "cash-encoder"
  | "approvals"
  | "payroll-vale"
  | "drivers"
  | "cash-overview"
  | "team";

type NavEntry = {
  key: View;
  label: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
};

const NAV: NavEntry[] = [
  { key: "request", label: "Request Cash", icon: Wallet, roles: ["requester", "encoder", "admin"] },
  { key: "cash-encoder", label: "Cash Encoder", icon: Layers, roles: ["encoder", "admin"] },
  { key: "approvals", label: "Approvals", icon: Stamp, roles: ["approver", "admin"] },
  { key: "payroll-vale", label: "Payroll Vale", icon: CalendarCheck, roles: ["payroll", "admin"] },
  { key: "drivers", label: "Driver Master", icon: Truck, roles: ["encoder", "admin"] },
  { key: "cash-overview", label: "Cash Overview", icon: PieChart, roles: ["approver", "admin"] },
  { key: "team", label: "Team", icon: ShieldCheck, roles: ["admin"] },
];

function navForRole(role: UserRole): NavEntry[] {
  return NAV.filter((n) => n.roles.includes(role));
}

const VIEW_TITLE: Record<View, string> = {
  request: "Request Cash",
  "cash-encoder": "Cash Encoder",
  approvals: "Disbursement Approvals",
  "payroll-vale": "Payroll Vale",
  drivers: "Driver Master",
  "cash-overview": "Cash Overview",
  team: "Team & Access",
};

export default function App() {
  const auth = useSession();
  const [view, setView] = useState<View>("request");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Land each role on its first allowed screen.
  useEffect(() => {
    if (!auth.role) return;
    const allowed = navForRole(auth.role).map((n) => n.key);
    if (allowed.length && !allowed.includes(view)) setView(allowed[0]);
  }, [auth.role]); // eslint-disable-line react-hooks/exhaustive-deps

  async function signOut() {
    await supabase?.auth.signOut();
  }

  if (!isSupabaseConfigured)
    return <FullScreen label="Database not configured." />;
  if (auth.loading) return <FullScreen spinner label="Loading…" />;
  if (!auth.session) return <Login />;
  if (!auth.approved)
    return (
      <PendingAccess
        name={auth.fullName}
        onRefresh={auth.refresh}
        onSignOut={signOut}
      />
    );

  const role = (auth.role ?? "encoder") as UserRole;
  const isAdmin = role === "admin";
  const userId = auth.session.user.id;
  const navItems = navForRole(role);

  return (
    <div className="flex h-full bg-slate-50 text-slate-800">
      <aside className="flex w-60 shrink-0 flex-col bg-slate-900 text-slate-300">
        <div className="px-4 py-5">
          <img src="/gitc-logo.jpg" alt="GITC" className="w-full rounded-lg" />
          <div className="mt-2 text-center text-[11px] font-medium tracking-wide text-slate-400">
            Disbursement &amp; Vale
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {navItems.map(({ key, label, icon: Icon }) => {
            const active = view === key;
            return (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-amber-500 text-slate-900"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon size={17} />
                <span className="flex-1 text-left">{label}</span>
              </button>
            );
          })}
        </nav>
        <div className="border-t border-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-slate-200">
                {auth.fullName}
              </div>
              <div className="text-[11px] capitalize text-amber-400">
                {auth.role}
                {auth.disbursementApprover ? " · approver" : ""}
              </div>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5">
          <h1 className="text-lg font-semibold text-slate-900">
            {VIEW_TITLE[view]}
          </h1>
          <div className="text-sm text-slate-400">Fleet Technik · GITC</div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          {view === "request" && (
            <Requester userId={userId} onToast={setToast} />
          )}
          {view === "cash-encoder" && <Encoder onToast={setToast} />}
          {view === "approvals" && (
            <Approver canApprove={auth.disbursementApprover} onToast={setToast} />
          )}
          {view === "payroll-vale" && (
            <Payroll canManage={role === "payroll" || isAdmin} onToast={setToast} />
          )}
          {view === "drivers" && (
            <DriverMaster isAdmin={isAdmin} onToast={setToast} />
          )}
          {view === "cash-overview" && <OwnerDashboard onToast={setToast} />}
          {view === "team" && isAdmin && (
            <TeamView currentUserId={userId} onToast={setToast} />
          )}
        </main>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-xl">
            <CheckCircle2 size={16} className="text-emerald-400" />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

function PendingAccess({
  name,
  onRefresh,
  onSignOut,
}: {
  name: string | null;
  onRefresh: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <Clock size={24} className="text-amber-600" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-slate-800">
          Awaiting access
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {name ? `Hi ${name}, your` : "Your"} account needs an administrator to
          grant access before you can use the system.
        </p>
        <button
          onClick={onRefresh}
          className="mt-5 w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"
        >
          I've been approved — refresh
        </button>
        <button
          onClick={onSignOut}
          className="mt-2 w-full rounded-lg py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function FullScreen({ spinner, label }: { spinner?: boolean; label: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-slate-50 p-6 text-center text-slate-400">
      <div className="flex items-center gap-2 text-sm">
        {spinner && <Loader2 size={16} className="animate-spin" />}
        {label}
      </div>
    </div>
  );
}
