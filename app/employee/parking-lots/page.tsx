import { ParkingLotsManager } from "@/components/ParkingLotsManager";
import type { BrainstormingParkingLotCard, BrainstormingParkingLotCategory } from "@/lib/parking-lots";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";

export default async function ParkingLotsPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <div className="eyebrow">Parking Lots</div>
            <h1>Brainstorming parking lots</h1>
            <p>Supabase is required before the live idea tracker can be loaded.</p>
          </div>
        </div>
      </>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: categories, error: categoriesError }, { data: cards, error: cardsError }] = await Promise.all([
    supabase.from("brainstorming_parking_lot_categories").select("*").order("sort_order"),
    supabase
      .from("brainstorming_parking_lot_cards")
      .select("*")
      .is("archived_at", null)
      .order("category_id")
      .order("lane")
      .order("sort_order"),
  ]);

  const missingSchema =
    (categoriesError && isMissingSchemaRelationError(categoriesError)) ||
    (cardsError && isMissingSchemaRelationError(cardsError));

  if (missingSchema) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <div className="eyebrow">Parking Lots</div>
            <h1>Brainstorming parking lots</h1>
            <p>Apply the parking lots Supabase migration to load the live tracker.</p>
          </div>
        </div>
        <div className="empty-state">The parking lot tables are not available yet.</div>
      </>
    );
  }

  if (categoriesError || cardsError) {
    console.error("Could not load brainstorming parking lots.", categoriesError ?? cardsError);
  }

  return (
    <>
      <div className="portal-topline command-hero">
        <div>
          <div className="eyebrow">Parking Lots</div>
          <h1>Brainstorming parking lots</h1>
          <p>Move safety platform ideas between Do Now, Build Next, and Parking Lot while everyone sees the board update live.</p>
        </div>
        <span className="badge">{(cards ?? []).length} active card{(cards ?? []).length === 1 ? "" : "s"}</span>
      </div>
      <ParkingLotsManager
        categories={(categories ?? []) as BrainstormingParkingLotCategory[]}
        currentUserId={user?.id ?? null}
        initialCards={(cards ?? []) as BrainstormingParkingLotCard[]}
      />
    </>
  );
}
