import { LegalRegisterTable } from "@/components/legal-register/LegalRegisterTable";
import { getLegalAccess } from "@/lib/legal/access";
import type { LegalRegisterItem } from "@/lib/legal/types";

export default async function RegisterPage() {
  const { supabase, isAdmin } = await getLegalAccess();

  let items: LegalRegisterItem[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("legal_register_items")
      .select("*")
      .eq("archived", false)
      .order("updated_at", { ascending: false });
    items = (data ?? []) as LegalRegisterItem[];
  }

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Legal Register</div>
          <h1>Legal Register</h1>
          <p>All accepted legal register entries. Filter by program, risk, or review status, and expand any row for the full requirement detail.</p>
        </div>
      </div>
      <LegalRegisterTable initialItems={items} isAdmin={isAdmin} />
    </>
  );
}
