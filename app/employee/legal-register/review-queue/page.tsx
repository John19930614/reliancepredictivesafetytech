import { HumanReviewQueue } from "@/components/legal-register/HumanReviewQueue";
import { getLegalAccess } from "@/lib/legal/access";
import type { LegalRegisterItem } from "@/lib/legal/types";

export default async function ReviewQueuePage() {
  const { supabase, isReviewer } = await getLegalAccess();

  let items: LegalRegisterItem[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("legal_register_items")
      .select("*")
      .eq("review_status", "needs_review")
      .eq("archived", false)
      .order("risk_level", { ascending: true })
      .order("created_at", { ascending: false });
    items = (data ?? []) as LegalRegisterItem[];
  }

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Legal Register</div>
          <h1>Human Review Queue</h1>
          <p>AI-generated findings flagged for qualified human review. Nothing here is treated as compliant until a reviewer approves it.</p>
        </div>
      </div>
      <HumanReviewQueue initialItems={items} canReview={isReviewer} />
    </>
  );
}
