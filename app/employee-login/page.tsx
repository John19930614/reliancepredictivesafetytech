import Image from "next/image";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { login } from "@/app/employee-login/actions";
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
        : null;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Image className="auth-logo" alt={`${COMPANY_NAME} logo`} height={120} src="/reliance-logo-transparent.png" width={406} />
        <div className="eyebrow">Employee Portal</div>
        <h1>{COMPANY_NAME}</h1>
        <p>{TAGLINE}</p>
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
        <p>
          <Link href="/">Return to public website</Link>
        </p>
      </section>
    </main>
  );
}
