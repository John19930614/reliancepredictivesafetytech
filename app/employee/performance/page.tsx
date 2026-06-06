import { PerformanceReviewManager } from "@/components/PerformanceReviewManager";
import type { EmployeeProfile, PerformanceReview, PerformanceReviewCycle } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";
import { canAccessEmployeePath, isPortalOwnerRole } from "@/lib/user-management";

export default async function PerformanceReviewsPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <div className="portal-topline">
        <div>
          <h1>Performance Reviews</h1>
          <p>Supabase connection required.</p>
        </div>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  const isAdmin =
    roleRow?.role === "platform_admin" ||
    roleRow?.role === "super_admin" ||
    roleRow?.role === "company_admin" ||
    isPortalOwnerRole(roleRow?.role);

  const [{ data: cycles }, { data: reviews }, { data: profiles }] = await Promise.all([
    supabase.from("performance_review_cycles").select("*").order("created_at", { ascending: false }),
    supabase.from("performance_reviews").select("*").order("created_at", { ascending: false }),
    supabase.from("employee_profiles").select("user_id, display_name, email, profile_status"),
  ]);

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">People</div>
          <h1>Performance Reviews</h1>
          <p>Create review cycles, track self-assessments, and record manager feedback for all employees.</p>
        </div>
      </div>

      <PerformanceReviewManager
        currentUserId={user?.id ?? ""}
        cycles={(cycles ?? []) as PerformanceReviewCycle[]}
        isAdmin={isAdmin}
        profiles={(profiles ?? []) as EmployeeProfile[]}
        reviews={(reviews ?? []) as PerformanceReview[]}
      />
    </>
  );
}
