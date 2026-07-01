import { Loader2, LogIn } from "lucide-react";
import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName || email } },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice(
            "Account created. Confirm your email if prompted, then sign in. An administrator will grant you access."
          );
          setMode("signin");
        }
      }
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/gitc-logo.jpg"
            alt="GITC"
            className="w-44 rounded-lg shadow-lg"
          />
          <p className="mt-3 text-sm text-slate-400">
            HR Recruitment Directory
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-3 rounded-xl bg-white p-6 shadow-2xl"
        >
          <h2 className="text-base font-semibold text-slate-800">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h2>

          {mode === "signup" && (
            <Input
              label="Full name"
              value={fullName}
              onChange={setFullName}
              type="text"
              placeholder="Juan dela Cruz"
            />
          )}
          <Input
            label="Email"
            value={email}
            onChange={setEmail}
            type="email"
            placeholder="you@gitc.com"
            required
          />
          <Input
            label="Password"
            value={password}
            onChange={setPassword}
            type="password"
            placeholder="••••••••"
            required
          />

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {notice}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <LogIn size={16} />
            )}
            {mode === "signin" ? "Sign in" : "Sign up"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setNotice(null);
            }}
            className="w-full text-center text-xs text-slate-500 hover:text-slate-700"
          >
            {mode === "signin"
              ? "Need an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-[11px] text-slate-500">
          Connected to Supabase · data protected by row-level security
        </p>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
      />
    </label>
  );
}
