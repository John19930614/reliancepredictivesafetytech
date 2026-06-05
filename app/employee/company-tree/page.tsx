import { AlertCircle, Network } from "lucide-react";
import { CompanyTreeManager, type CompanyTreePosition, type CurrentEmployeeOption } from "@/components/CompanyTreeManager";
import { companyPositionSeed, type CompanyPosition } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole, isPortalOwnerRole } from "@/lib/user-management";

const ownerPositionSelect = "*";
const standardPositionSelect =
  "id, title, department, parent_position_id, status, portal_user_id, job_description, employment_type, location, hiring_priority, sort_order, notes, created_at, updated_at";

type CompanyPositionEmployeeDirectoryRow = {
  position_id: string;
  user_id: string;
  display_name: string | null;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  profile_status: string | null;
};

function getDirectoryEmployeeName(employee: CompanyPositionEmployeeDirectoryRow | undefined) {
  return employee?.display_name || employee?.legal_name || employee?.email || null;
}

function normalizePosition(position: Partial<CompanyPosition>, employee?: CompanyPositionEmployeeDirectoryRow): CompanyTreePosition {
  return {
    id: String(position.id),
    title: String(position.title),
    department: String(position.department),
    parent_position_id: position.parent_position_id ?? null,
    status: String(position.status),
    portal_user_id: position.portal_user_id ?? null,
    assigned_employee_name: getDirectoryEmployeeName(employee),
    assigned_employee_email: employee?.email ?? null,
    assigned_employee_phone: employee?.phone ?? null,
    job_description: position.job_description ?? null,
    salary_min: position.salary_min ?? null,
    salary_max: position.salary_max ?? null,
    salary_period: position.salary_period ?? null,
    employment_type: position.employment_type ?? null,
    location: position.location ?? null,
    hiring_priority: position.hiring_priority ?? null,
    sort_order: Number(position.sort_order ?? 0),
    notes: position.notes ?? null,
    created_at: position.created_at ?? "",
    updated_at: position.updated_at ?? "",
  };
}

function normalizeEmployeeOption(profile: Partial<CurrentEmployeeOption>): CurrentEmployeeOption {
  return {
    user_id: String(profile.user_id),
    legal_name: profile.legal_name ?? null,
    display_name: profile.display_name ?? null,
    email: profile.email ?? null,
    phone: profile.phone ?? null,
    profile_status: profile.profile_status ?? null,
  };
}

export default async function CompanyTreePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  const { data: currentRole } =
    supabase && user
      ? await supabase
          .from("user_roles")
          .select("role, account_status")
          .eq("user_id", user.id)
          .maybeSingle()
      : { data: null };

  const canManagePositions =
    currentRole?.account_status === "active" && isPortalAdminRole(currentRole.role);
  const canViewCompensation =
    currentRole?.account_status === "active" && isPortalOwnerRole(currentRole.role);
  const { data: positions, error: positionsError } =
    supabase && user
      ? await supabase
          .from("company_positions")
          .select(canViewCompensation ? ownerPositionSelect : standardPositionSelect)
          .order("sort_order")
          .order("title")
      : { data: null, error: null };
  const { data: positionEmployeeDirectory, error: positionEmployeeDirectoryError } =
    supabase && user
      ? await supabase
          .from("company_position_employee_directory")
          .select("position_id,user_id,display_name,legal_name,email,phone,profile_status")
      : { data: [], error: null };
  const { data: employeeProfiles } =
    supabase && user && canManagePositions
      ? await supabase
          .from("employee_profiles")
          .select("user_id,legal_name,display_name,email,phone,profile_status")
          .eq("profile_status", "active")
          .order("display_name")
      : { data: [] };
  const positionEmployeeDirectoryByPositionId = new Map(
    (positionEmployeeDirectory ?? []).map((employee) => [
      String(employee.position_id),
      {
        position_id: String(employee.position_id),
        user_id: String(employee.user_id),
        display_name: employee.display_name ?? null,
        legal_name: employee.legal_name ?? null,
        email: employee.email ?? null,
        phone: employee.phone ?? null,
        profile_status: employee.profile_status ?? null,
      } satisfies CompanyPositionEmployeeDirectoryRow,
    ]),
  );
  const positionRows = positions as Partial<CompanyPosition>[] | null;
  const initialPositions =
    positionRows && positionRows.length > 0
      ? positionRows.map((position) =>
          normalizePosition(
            position,
            positionEmployeeDirectoryByPositionId.get(String(position.id)),
          ),
        )
      : companyPositionSeed.map((position) => ({
          ...position,
          assigned_employee_name: null,
          assigned_employee_email: null,
          assigned_employee_phone: null,
          salary_min: canViewCompensation ? position.salary_min : null,
          salary_max: canViewCompensation ? position.salary_max : null,
          salary_period: canViewCompensation ? position.salary_period : null,
        }));
  const incompleteCount = initialPositions.filter((position) => {
    if (position.status === "Filled") {
      return !position.portal_user_id || !position.assigned_employee_email || !position.assigned_employee_phone;
    }

    if (position.status === "Open") {
      return !position.job_description || (canViewCompensation && (position.salary_min === null || position.salary_max === null));
    }

    return false;
  }).length;
  const filledCount = initialPositions.filter((position) => position.status === "Filled").length;
  const openCount = initialPositions.filter((position) => position.status === "Open").length;
  const neededCount = initialPositions.filter((position) => position.status === "Needed").length;

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Company Tree</div>
          <h1>Roles, openings, and hiring details</h1>
          <p>Track filled positions with contact details and open roles with job posting information.</p>
        </div>
        <span className="badge">
          <Network size={14} />
          {initialPositions.length} role{initialPositions.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="company-tree-metrics">
        <section className="portal-card">
          <h3>Filled roles</h3>
          <div className="metric">{filledCount}</div>
        </section>
        <section className="portal-card">
          <h3>Open roles</h3>
          <div className="metric">{openCount}</div>
        </section>
        <section className="portal-card">
          <h3>Needed roles</h3>
          <div className="metric">{neededCount}</div>
        </section>
        <section className="portal-card">
          <h3>Incomplete records</h3>
          <div className="metric">{incompleteCount}</div>
        </section>
      </div>

      {!supabase ? (
        <div className="success-box portal-alert portal-alert-error">
          <AlertCircle size={16} /> Supabase is not configured. Showing the starter company tree in read-only mode.
        </div>
      ) : positionsError ? (
        <div className="success-box portal-alert portal-alert-error">
          <AlertCircle size={16} /> {positionsError.message}. Showing the starter company tree until the company positions migration is applied.
        </div>
      ) : positionEmployeeDirectoryError ? (
        <div className="success-box portal-alert portal-alert-error">
          <AlertCircle size={16} /> {positionEmployeeDirectoryError.message}. Employee assignment details are unavailable until the directory view is applied.
        </div>
      ) : null}

      <CompanyTreeManager
        canManagePositions={Boolean(supabase && !positionsError && canManagePositions)}
        canViewCompensation={canViewCompensation}
        employeeOptions={(employeeProfiles ?? []).map((profile) => normalizeEmployeeOption(profile as Partial<CurrentEmployeeOption>))}
        initialPositions={initialPositions}
      />
    </>
  );
}
