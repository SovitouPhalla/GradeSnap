"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/env";
import { SetupBanner } from "@/components/setup-banner";

export function AuthPanel() {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session ?? null);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    const action =
      mode === "signin"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });

    const { error: authError, data } = await action;
    setSubmitting(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (mode === "signup" && !data.session) {
      setMessage("Account created. Check your email if confirmation is enabled, then sign in.");
      return;
    }

    setMessage(mode === "signin" ? "Signed in." : "Account created and signed in.");
  };

  const onLogout = async () => {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
  };

  if (!hasSupabasePublicEnv()) {
    return <SetupBanner />;
  }

  if (loading) {
    return <div className="card px-5 py-6 text-sm text-slate-600">Checking your session…</div>;
  }

  if (session) {
    return (
      <div className="card flex flex-col gap-4 px-5 py-6">
        <div>
          <p className="text-sm font-semibold text-slate-500">Signed in as</p>
          <p className="mt-1 text-lg font-semibold text-slate-950">{session.user.email}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link className="primary-button text-center" href="/dashboard">
            Go to dashboard
          </Link>
          <button className="secondary-button" onClick={onLogout} type="button">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="card flex flex-col gap-4 px-5 py-6" onSubmit={onSubmit}>
      <div>
        <p className="text-sm font-semibold text-slate-500">Teacher auth</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-950">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h2>
      </div>
      <label className="space-y-2 text-sm font-medium text-slate-700">
        <span>Email</span>
        <input
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label className="space-y-2 text-sm font-medium text-slate-700">
        <span>Password</span>
        <input
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      <button className="primary-button" disabled={submitting} type="submit">
        {submitting ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>
      <button
        className="ghost-button text-sm"
        onClick={() => {
          setMode((current) => (current === "signin" ? "signup" : "signin"));
          setError(null);
          setMessage(null);
        }}
        type="button"
      >
        {mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}
      </button>
    </form>
  );
}
