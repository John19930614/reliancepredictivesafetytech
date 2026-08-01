import { Lightbulb } from "lucide-react";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { MobileIdeasBoard } from "@/components/mobile/MobileIdeasBoard";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { requireMobileTabSession } from "../session";

export const dynamic = "force-dynamic";

export default async function MobileIdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ compose?: string }>;
}) {
  const { compose } = await searchParams;
  const session = await requireMobileTabSession("ideas");
  const { supabase } = session;

  const [{ data: categories, error: categoriesError }, { data: cards, error: cardsError }] = await Promise.all([
    supabase.from("brainstorming_parking_lot_categories").select("id, title, slug").order("sort_order"),
    supabase
      .from("brainstorming_parking_lot_cards")
      .select("id, title, description, lane, priority, category_id, created_at, created_by_user_id")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  const missingSchema =
    (categoriesError && isMissingSchemaRelationError(categoriesError)) ||
    (cardsError && isMissingSchemaRelationError(cardsError));

  if (missingSchema) {
    return (
      <>
        <MobileHeader eyebrow="Ideas" title="Parking lot" />
        <div className="m-empty">
          <Lightbulb aria-hidden="true" size={26} strokeWidth={1.7} />
          <p>Ideas are not set up yet.</p>
          <small>Apply the parking lots migration in Supabase to turn this on.</small>
        </div>
      </>
    );
  }

  if (categoriesError || cardsError) {
    console.error("Could not load mobile ideas.", categoriesError ?? cardsError);
  }

  return (
    <MobileIdeasBoard
      categories={(categories ?? []).map((category) => ({ id: category.id, title: category.title }))}
      cards={(cards ?? []).map((card) => ({
        id: card.id,
        title: card.title,
        description: card.description,
        lane: card.lane,
        priority: card.priority,
        categoryId: card.category_id,
        createdAt: card.created_at,
        isMine: card.created_by_user_id === session.userId,
      }))}
      openComposerInitially={compose === "1"}
    />
  );
}
