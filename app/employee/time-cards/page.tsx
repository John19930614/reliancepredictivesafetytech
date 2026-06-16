import { redirect } from "next/navigation";
import { Clock3 } from "lucide-react";
import { TimeCardManager } from "@/components/TimeCardManager";
import type {
  EmployeeProfile,
  EmployeeTimeCard,
  EmployeeTimeCardPayroll,
  EmployeeTimeEntry,
  TimeCardCategory,
  TimeCardRole,
  TimeCardRoleCategory,
  TimeCardRoleTask,
  TimeCardTask,
} from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole, isPortalOwnerRole, isPortalSuperAdminRole } from "@/lib/user-management";

function getCentralDateParts() {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Chicago",
    weekday: "short",
    year: "numeric",
  }).formatToParts(new Date());
}

function getCurrentCentralWeek() {
  const parts = getCentralDateParts();
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const weekday = get("weekday");
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const start = new Date(`${date}T12:00:00`);
  start.setDate(start.getDate() - Math.max(weekdayIndex, 0));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  return {
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: end.toISOString().slice(0, 10),
  };
}

export default async function TimeCardsPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <div className="eyebrow">Employee Time Cards</div>
            <h1>Weekly time card tracker</h1>
            <p>Supabase is required before employees can submit weekly time cards.</p>
          </div>
        </div>
        <section className="portal-card">
          <Clock3 color="#c9932b" size={28} />
          <h3>Supabase setup required</h3>
          <p>Add Supabase environment variables and run the time-card migration.</p>
        </section>
      </>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/employee-login");
  }

  const { data: currentRole } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin = currentRole?.account_status === "active" && isPortalAdminRole(currentRole.role);
  const canViewPayroll = currentRole?.account_status === "active" && isPortalOwnerRole(currentRole.role);
  const canApproveTimeCards = currentRole?.account_status === "active" && isPortalSuperAdminRole(currentRole.role);
  const { weekStart, weekEnd } = getCurrentCentralWeek();

  const [
    { data: profile },
    { data: roles },
    { data: categories },
    { data: tasks },
    { data: roleCategories },
    { data: roleTasks },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("employee_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("time_card_roles").select("*").order("sort_order"),
    supabase.from("time_card_categories").select("*").order("sort_order"),
    supabase.from("time_card_tasks").select("*").order("sort_order"),
    supabase.from("time_card_role_categories").select("*"),
    supabase.from("time_card_role_tasks").select("*"),
    isAdmin ? supabase.from("employee_profiles").select("*").order("display_name") : Promise.resolve({ data: [] }),
  ]);

  const { data: cards } = isAdmin
    ? await supabase.from("employee_time_cards").select("*").order("week_start", { ascending: false }).limit(120)
    : await supabase
        .from("employee_time_cards")
        .select("*")
        .eq("employee_user_id", user.id)
        .order("week_start", { ascending: false })
        .limit(30);
  const cardIds = (cards ?? []).map((card) => card.id);
  const [{ data: entries }, { data: payrollRows }] =
    cardIds.length > 0
      ? await Promise.all([
          supabase.from("employee_time_entries").select("*").in("time_card_id", cardIds).order("work_date"),
          canViewPayroll
            ? supabase.from("employee_time_card_payroll").select("*").in("time_card_id", cardIds)
            : Promise.resolve({ data: [] }),
        ])
      : [{ data: [] }, { data: [] }];

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Employee Time Cards</div>
          <h1>Weekly time card tracker</h1>
          <p>Role-based dropdowns, weekly submission, owner-only pay, and admin review.</p>
        </div>
        <span className="badge">
          <Clock3 size={14} />
          {canApproveTimeCards ? "Super admin review" : isAdmin ? "Admin view" : "Employee entry"}
        </span>
      </div>
      <TimeCardManager
        categories={(categories ?? []) as TimeCardCategory[]}
        currentUserId={user.id}
        currentWeekStart={weekStart}
        initialCards={(cards ?? []) as EmployeeTimeCard[]}
        initialEntries={(entries ?? []) as EmployeeTimeEntry[]}
        isAdmin={Boolean(isAdmin)}
        canApproveTimeCards={Boolean(canApproveTimeCards)}
        canViewPayroll={Boolean(canViewPayroll)}
        payrollRows={(payrollRows ?? []) as EmployeeTimeCardPayroll[]}
        profile={(profile ?? null) as EmployeeProfile | null}
        profiles={(profiles ?? []) as EmployeeProfile[]}
        roleCategories={(roleCategories ?? []) as TimeCardRoleCategory[]}
        roleTasks={(roleTasks ?? []) as TimeCardRoleTask[]}
        roles={(roles ?? []) as TimeCardRole[]}
        tasks={(tasks ?? []) as TimeCardTask[]}
      />
    </>
  );
}
