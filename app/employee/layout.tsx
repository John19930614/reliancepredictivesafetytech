import Image from "next/image";
import Link from "next/link";
import { BookOpenCheck, FileText, Gauge, LayoutDashboard, ListChecks, Settings, UploadCloud } from "lucide-react";
import { logout } from "@/app/employee-login/actions";
import { COMPANY_NAME, TAGLINE } from "@/lib/company-data";

const employeeNav = [
  { href: "/employee", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employee/checklist", label: "Startup Checklist", icon: ListChecks },
  { href: "/employee/documents", label: "Document Library", icon: UploadCloud },
  { href: "/employee/required-documents", label: "Required Documents", icon: FileText },
  { href: "/employee/launch-gate", label: "Launch Gate", icon: BookOpenCheck },
  { href: "/employee/settings", label: "Settings", icon: Settings },
];

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <Link href="/employee">
          <Image className="portal-logo" alt={`${COMPANY_NAME} logo`} height={120} src="/reliance-logo-transparent.png" width={406} />
        </Link>
        <div>
          <strong>{COMPANY_NAME}</strong>
          <p style={{ color: "rgba(255,255,255,.62)", margin: "6px 0 0" }}>{TAGLINE}</p>
        </div>
        <nav className="portal-nav" aria-label="Employee navigation">
          {employeeNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link href={item.href} key={item.href}>
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
          <form action={logout}>
            <button type="submit">
              <Gauge size={18} />
              Sign Out
            </button>
          </form>
        </nav>
      </aside>
      <main className="portal-main">{children}</main>
    </div>
  );
}
