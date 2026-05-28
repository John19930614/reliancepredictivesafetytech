import Image from "next/image";
import Link from "next/link";
import { KeyRound, LockKeyhole } from "lucide-react";
import { login, requestPasswordReset } from "@/app/employee-login/actions";
import { COMPANY_NAME, TAGLINE } from "@/lib/company-data";

type LoginPageProps = {
  searchParams: Promise<{ message?: string; next?: string }>;
};

export default async function EmployeeLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const message =
    params.message === "supabase-required"
      ? "Supabase is not configured yet. Add the public Supabase URL/key and run the migration before employee access."
      : params.message === "invalid"
        ? "Login failed. Check the employee email and password."
        : params.message === "employee-role-required"
          ? "This account is signed in but does not have an employee portal role."
          : params.message === "portal-module-required"
            ? "Sign-in worked, but this account does not have dashboard access yet. Ask a portal admin to add portal visibility."
            : params.message === "role-access-required"
              ? "Sign-in worked, but this account does not have access to that employee portal section."
          : params.message === "reset-email-required"
            ? "Enter your employee email before requesting a password reset."
            : params.message === "reset-sent"
              ? "If that employee account exists, a password reset link has been sent."
              : params.message === "password-updated"
                ? "Password updated. Sign in with the new password."
                : params.message === "password-session-required"
                  ? "Open a valid password reset link before choosing a new password."
        : null;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Image className="auth-logo" alt={`${COMPANY_NAME} logo`} height={120} src="/reliance-logo-transparent.png" width={406} />
        <div className="eyebrow">Employee Portal</div>
        <h1>Employee sign in</h1>
        <p>
          {COMPANY_NAME}
          <br />
          {TAGLINE}
        </p>
        {message ? <div className="success-box">{message}</div> : null}
        <form action={login} className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 18 }}>
          <input name="next" type="hidden" value={params.next ?? "/employee"} />
          <div className="field">
            <label htmlFor="email">Employee email</label>
            <input id="email" name="email" type="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required />
          </div>
          <button className="button button-primary" type="submit">
            <LockKeyhole size={18} />
            Sign in
          </button>
        </form>
        <form action={requestPasswordReset} className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 22 }}>
          <div className="field">
            <label htmlFor="reset-email">Reset password</label>
            <input id="reset-email" name="email" placeholder="employee@example.com" type="email" required />
          </div>
          <button className="button button-light" type="submit">
            <KeyRound size={18} />
            Send Reset Link
          </button>
        </form>
        <p>
          <Link href="/">Return to public website</Link>
        </p>
      </section>
    </main>
  );
}
