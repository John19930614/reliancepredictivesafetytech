"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { KeyRound } from "lucide-react";
import { COMPANY_NAME } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";

type UpdatePasswordFormProps = {
  message?: string;
  mode?: "invite" | "reset";
};

function getInitialMessage(message?: string) {
  if (message === "short") {
    return "Use a password with at least 8 characters.";
  }

  if (message === "mismatch") {
    return "The passwords do not match.";
  }

  return message || null;
}

export function UpdatePasswordForm({ message, mode = "reset" }: UpdatePasswordFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const isInviteMode = mode === "invite";
  const [email, setEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(() => getInitialMessage(message));
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadResetSession() {
      if (!supabase) {
        if (isMounted) {
          setStatus("Supabase is not configured yet.");
          setIsReady(true);
        }
        return;
      }

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error && isMounted) {
          setStatus(error.message);
        } else {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (isMounted) {
        setEmail(user?.email ?? null);
        setIsReady(true);
      }
    }

    void loadResetSession();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setStatus("Supabase is not configured yet.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirm_password") ?? "");

    if (password.length < 8) {
      setStatus("Use a password with at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("The passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);

    if (error) {
      setStatus(error.message);
      return;
    }

    await supabase.auth.signOut();
    window.location.assign("/employee-login?message=password-updated");
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Image className="auth-logo" alt={`${COMPANY_NAME} logo`} height={120} src="/reliance-logo-transparent.png" width={406} />
        <div className="eyebrow">Employee Portal</div>
        <h1>{isInviteMode ? "Create your password" : "Choose a new password"}</h1>
        <p>{email ?? (isInviteMode ? "Open the latest employee invite link before creating your password." : "Open the latest reset link from your email before choosing a new password.")}</p>
        {status ? <div className="success-box">{status}</div> : null}
        {email ? (
          <form className="form-grid" onSubmit={handleSubmit} style={{ gridTemplateColumns: "1fr", marginTop: 18 }}>
            <div className="field">
              <label htmlFor="password">New password</label>
              <input id="password" name="password" minLength={8} required type="password" />
            </div>
            <div className="field">
              <label htmlFor="confirm_password">Confirm password</label>
              <input id="confirm_password" name="confirm_password" minLength={8} required type="password" />
            </div>
            <button className="button button-primary" disabled={!isReady || isSubmitting} type="submit">
              <KeyRound size={18} />
              {isSubmitting ? "Updating..." : isInviteMode ? "Create Password" : "Update Password"}
            </button>
          </form>
        ) : (
          <p>
            <Link href="/employee-login">Return to employee sign in</Link>
          </p>
        )}
      </section>
    </main>
  );
}
