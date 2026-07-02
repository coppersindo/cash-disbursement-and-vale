import { Check, Loader2, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import {
  fetchProfiles,
  setProfileApproved,
  setProfileApprover,
  setProfileFleets,
  setProfileRole,
} from "../data/repo";
import { FLEETS } from "../data/types";
import type { Profile, UserRole } from "../data/types";
import { Badge } from "./ui";

const ROLES: UserRole[] = ["requester", "encoder", "approver", "payroll", "admin"];

export default function TeamView({
  currentUserId,
  onToast,
}: {
  currentUserId: string;
  onToast: (msg: string) => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const fleets = FLEETS as readonly string[] as string[];
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setProfiles(await fetchProfiles());
    } catch (e: any) {
      onToast(`Load failed: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(id: string, next: Partial<Profile>) {
    setProfiles((prev) => prev.map((x) => (x.id === id ? { ...x, ...next } : x)));
  }

  async function approve(p: Profile, approved: boolean) {
    setBusyId(p.id);
    try {
      await setProfileApproved(p.id, approved);
      patch(p.id, { approved });
      onToast(approved ? `${label(p)} granted access` : `${label(p)} access revoked`);
    } catch (e: any) {
      onToast(`Update failed: ${e?.message ?? e}`);
    } finally {
      setBusyId(null);
    }
  }

  async function changeRole(p: Profile, role: UserRole) {
    setBusyId(p.id);
    try {
      await setProfileRole(p.id, role);
      patch(p.id, { role });
      onToast(`${label(p)} is now ${role}`);
    } catch (e: any) {
      onToast(`Update failed: ${e?.message ?? e}`);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleFleet(p: Profile, fleet: string) {
    const has = (p.fleets ?? []).includes(fleet);
    const next = has
      ? (p.fleets ?? []).filter((f) => f !== fleet)
      : [...(p.fleets ?? []), fleet];
    patch(p.id, { fleets: next }); // optimistic
    try {
      await setProfileFleets(p.id, next);
    } catch (e: any) {
      patch(p.id, { fleets: p.fleets ?? [] }); // revert
      onToast(`Update failed: ${e?.message ?? e}`);
    }
  }

  async function toggleApprover(p: Profile) {
    const next = !p.disbursementApprover;
    patch(p.id, { disbursementApprover: next });
    try {
      await setProfileApprover(p.id, next);
      onToast(next ? `${label(p)} can now approve` : `${label(p)} approval removed`);
    } catch (e: any) {
      patch(p.id, { disbursementApprover: !next });
      onToast(`Update failed: ${e?.message ?? e}`);
    }
  }

  const pending = profiles.filter((p) => !p.approved);
  const active = profiles.filter((p) => p.approved);

  if (loading)
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" size={18} />
      </div>
    );

  const rowProps = {
    fleets,
    busyId,
    currentUserId,
    onApprove: approve,
    onRole: changeRole,
    onToggleFleet: toggleFleet,
    onToggleApprover: toggleApprover,
  };

  return (
    <div className="h-full overflow-auto p-6">
      {pending.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <UserCheck size={16} className="text-amber-500" />
            Awaiting approval
            <span className="rounded-full bg-amber-100 px-2 text-xs font-medium text-amber-700">
              {pending.length}
            </span>
          </h2>
          <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40">
            {pending.map((p) => (
              <Row key={p.id} p={p} {...rowProps} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <ShieldCheck size={16} className="text-emerald-500" />
          Active staff
          <span className="rounded-full bg-slate-100 px-2 text-xs font-medium text-slate-600">
            {active.length}
          </span>
        </h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {active.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              No active staff yet.
            </p>
          ) : (
            active.map((p) => <Row key={p.id} p={p} {...rowProps} />)
          )}
        </div>
      </section>

      <p className="mt-4 text-xs text-slate-400">
        Ops (requester) users only see their own requests and can only file for
        drivers in the fleets you assign below. Approver actions also require the
        "Can approve" flag.
      </p>
    </div>
  );
}

function Row({
  p,
  fleets,
  busyId,
  currentUserId,
  onApprove,
  onRole,
  onToggleFleet,
  onToggleApprover,
}: {
  p: Profile;
  fleets: string[];
  busyId: string | null;
  currentUserId: string;
  onApprove: (p: Profile, approved: boolean) => void;
  onRole: (p: Profile, role: UserRole) => void;
  onToggleFleet: (p: Profile, fleet: string) => void;
  onToggleApprover: (p: Profile) => void;
}) {
  const busy = busyId === p.id;
  const isSelf = p.id === currentUserId;

  return (
    <div className="border-b border-slate-100 px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
            {p.fullName || p.email || "Unnamed"}
            {isSelf && (
              <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-500">
                you
              </span>
            )}
          </div>
          <div className="truncate text-xs text-slate-400">{p.email}</div>
        </div>

        {p.approved ? (
          <Badge tone="emerald">
            <Check size={11} /> Active
          </Badge>
        ) : (
          <Badge tone="amber">Pending</Badge>
        )}

        <select
          value={p.role}
          disabled={busy || isSelf}
          onChange={(e) => onRole(p, e.target.value as UserRole)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm capitalize text-slate-700 outline-none focus:border-amber-500 disabled:opacity-50"
          title={isSelf ? "You can't change your own role" : "Set role"}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        {(p.role === "approver" || p.role === "admin") && (
          <label
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600"
            title="Allowed to approve / reject / disburse batches"
          >
            <input
              type="checkbox"
              checked={!!p.disbursementApprover}
              onChange={() => onToggleApprover(p)}
              className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
            />
            Can approve
          </label>
        )}

        {busy ? (
          <Loader2 size={16} className="animate-spin text-slate-400" />
        ) : p.approved ? (
          <button
            onClick={() => onApprove(p, false)}
            disabled={isSelf}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
            title={isSelf ? "You can't revoke yourself" : "Revoke access"}
          >
            <UserX size={14} /> Revoke
          </button>
        ) : (
          <button
            onClick={() => onApprove(p, true)}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <UserCheck size={14} /> Approve
          </button>
        )}
      </div>

      {/* Fleet assignment — only relevant for ops (requester) users */}
      {p.approved && p.role === "requester" && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-1">
          <span className="mr-1 text-xs font-medium text-slate-500">
            Request groups:
          </span>
          {fleets.length === 0 ? (
            <span className="text-xs text-slate-400">No groups defined.</span>
          ) : (
            fleets.map((f) => {
              const on = (p.fleets ?? []).includes(f);
              return (
                <button
                  key={f}
                  onClick={() => onToggleFleet(p, f)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    on
                      ? "border-amber-500 bg-amber-500 text-white"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {f}
                </button>
              );
            })
          )}
          {(p.fleets ?? []).length === 0 && fleets.length > 0 && (
            <span className="text-xs text-red-500">
              none assigned — this user can't pick any driver
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function label(p: Profile) {
  return p.fullName || p.email || "User";
}
