import { LegalRegister } from "@/components/LegalRegister";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole } from "@/lib/user-management";
import type { LegalRegisterItem } from "@/lib/legal/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFrom = any;

export default async function LegalRegisterPage() {
  const supabase = await createClient();
  const db = supabase as AnyFrom;

  const [itemsResult, userResult] = supabase
    ? await Promise.all([
        db.from("legal_register_items").select("*").order("updated_at", { ascending: false }),
        supabase.auth.getUser(),
      ])
    : [{ data: null }, { data: { user: null } }];

  let isAdmin = false;
  if (supabase && userResult.data.user) {
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userResult.data.user.id)
      .eq("account_status", "active")
      .maybeSingle();

    isAdmin = isPortalAdminRole(roleRow?.role);
  }

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Governance</div>
          <h1>Legal Register</h1>
          <p>
            AI-powered regulatory research. Run a deep web search to discover all applicable laws, OSHA standards, EPA
            rules, privacy regulations, and industry guidelines — then save them to your compliance register.
          </p>
        </div>
      </div>
      <LegalRegister initialItems={(itemsResult.data ?? []) as LegalRegisterItem[]} isAdmin={isAdmin} />
    </>
  );
}
