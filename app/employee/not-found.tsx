import Link from "next/link";

export default function EmployeeNotFound() {
  return (
    <div style={{ padding: "40px 24px", textAlign: "center" }}>
      <h2 style={{ marginBottom: 12 }}>Page not found</h2>
      <p style={{ color: "var(--portal-muted)", marginBottom: 20 }}>
        This page doesn&apos;t exist, or it may have moved.
      </p>
      <Link href="/employee" style={{ color: "var(--portal-gold)", fontWeight: 600 }}>
        Back to dashboard
      </Link>
    </div>
  );
}
