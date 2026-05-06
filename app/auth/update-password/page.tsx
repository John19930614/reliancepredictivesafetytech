import Image from "next/image";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { updatePassword } from "@/app/auth/update-password/actions";
import { COMPANY_NAME } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";

type UpdatePasswordPageProps = {
  searchParams: Promise<{ message?: string }>;
};

export default async function UpdatePasswordPage({ searchParams }: UpdatePasswordPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const message =
    params.message === "short"
      ? "Use a password with at least 8 characters."
      : params.message === "mismatch"
        ? "The passwords do not match."
        : params.message || null;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Image className="auth-logo" alt={`${COMPANY_NAME} logo`} height={120} src="/reliance-logo-transparent.png" width={406} />
        <div className="eyebrow">Employee Portal</div>
        <h1>Choose a new password</h1>
        <p>{user?.email ?? "Open the latest reset link from your email before choosing a new password."}</p>
        {message ? <div className="success-box">{message}</div> : null}
        {user ? (
          <form action={updatePassword} className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 18 }}>
            <div className="field">
              <label htmlFor="password">New password</label>
              <input id="password" name="password" minLength={8} required type="password" />
            </div>
            <div className="field">
              <label htmlFor="confirm_password">Confirm password</label>
              <input id="confirm_password" name="confirm_password" minLength={8} required type="password" />
            </div>
            <button className="button button-primary" type="submit">
              <KeyRound size={18} />
              Update Password
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
