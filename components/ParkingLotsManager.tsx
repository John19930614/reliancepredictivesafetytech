"use client";

import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { Archive, CarFront, GripVertical, Pencil, Plus, Save, Search, Wifi, WifiOff, X } from "lucide-react";
import {
  getParkingLotLaneLabel,
  isParkingLotLane,
  parkingLotLanes,
  parkingLotPriorities,
  type BrainstormingParkingLotCard,
  type BrainstormingParkingLotCardInsert,
  type BrainstormingParkingLotCardUpdate,
  type BrainstormingParkingLotCategory,
  type ParkingLotLane,
  type ParkingLotPriority,
} from "@/lib/parking-lots";
import { createClient } from "@/lib/supabase/client";

type ParkingLotsManagerProps = {
  categories: BrainstormingParkingLotCategory[];
  initialCards: BrainstormingParkingLotCard[];
  currentUserId: string | null;
};

type CardDraft = Partial<
  Pick<BrainstormingParkingLotCard, "title" | "description" | "lane" | "owner" | "priority" | "notes">
>;

type CreateDraft = {
  title: string;
  description: string;
  lane: ParkingLotLane;
  owner: string;
  priority: ParkingLotPriority;
  notes: string;
};

type CardChangePayload = {
  eventType: string;
  new: Partial<BrainstormingParkingLotCard>;
  old: Partial<BrainstormingParkingLotCard>;
};

const emptyCreateDraft: CreateDraft = {
  title: "",
  description: "",
  lane: "do_now",
  owner: "",
  priority: "Medium",
  notes: "",
};

const emptyLaneMap = () =>
  parkingLotLanes.reduce<Record<ParkingLotLane, BrainstormingParkingLotCard[]>>(
    (accumulator, lane) => {
      accumulator[lane.id] = [];
      return accumulator;
    },
    {} as Record<ParkingLotLane, BrainstormingParkingLotCard[]>,
  );

function cleanText(value: string) {
  return value.trim();
}

function cleanOptional(value: string) {
  const text = cleanText(value);
  return text || null;
}

function normalizeLane(value: string): ParkingLotLane {
  return isParkingLotLane(value) ? value : "parking_lot";
}

function sortCards(first: BrainstormingParkingLotCard, second: BrainstormingParkingLotCard) {
  return first.sort_order - second.sort_order || (first.created_at ?? "").localeCompare(second.created_at ?? "") || first.id.localeCompare(second.id);
}

function mergeRealtimeCard(cards: BrainstormingParkingLotCard[], card: BrainstormingParkingLotCard) {
  if (card.archived_at) {
    return cards.filter((item) => item.id !== card.id);
  }

  if (cards.some((item) => item.id === card.id)) {
    return cards.map((item) => (item.id === card.id ? card : item)).sort(sortCards);
  }

  return [...cards, card].sort(sortCards);
}

function formatLiveStatus(status: string) {
  if (status === "connected") return "Live";
  if (status === "error") return "Offline";
  if (status === "disabled") return "Local";
  return "Connecting";
}

export function ParkingLotsManager({ categories, currentUserId, initialCards }: ParkingLotsManagerProps) {
  const supabase = useMemo(() => createClient(), []);
  const [cards, setCards] = useState(() => initialCards.sort(sortCards));
  const [activeCategoryId, setActiveCategoryId] = useState(categories[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, CardDraft>>({});
  const [editingCardIds, setEditingCardIds] = useState<Record<string, boolean>>({});
  const [createDraft, setCreateDraft] = useState<CreateDraft>(emptyCreateDraft);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverLane, setDragOverLane] = useState<ParkingLotLane | null>(null);
  const [liveStatus, setLiveStatus] = useState(supabase ? "connecting" : "disabled");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<"success" | "error">("success");

  const activeCategory = useMemo(
    () => categories.find((category) => category.id === activeCategoryId) ?? categories[0] ?? null,
    [activeCategoryId, categories],
  );

  useEffect(() => {
    if (!activeCategoryId && categories[0]) {
      setActiveCategoryId(categories[0].id);
      return;
    }

    if (activeCategoryId && !categories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(categories[0]?.id ?? "");
    }
  }, [activeCategoryId, categories]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel("brainstorming-parking-lot-card-stream")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "brainstorming_parking_lot_cards",
        },
        (payload) => {
          const cardPayload = payload as CardChangePayload;

          if (cardPayload.eventType === "DELETE") {
            const deletedId = cardPayload.old.id;
            if (deletedId) {
              setCards((current) => current.filter((card) => card.id !== deletedId));
            }
            return;
          }

          if (cardPayload.new.id) {
            setCards((current) => mergeRealtimeCard(current, cardPayload.new as BrainstormingParkingLotCard));
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLiveStatus("connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setLiveStatus("error");
        } else {
          setLiveStatus("connecting");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  const activeCategoryCards = useMemo(() => {
    if (!activeCategory) return [];
    return cards.filter((card) => card.category_id === activeCategory.id && !card.archived_at).sort(sortCards);
  }, [activeCategory, cards]);

  const visibleCardsByLane = useMemo(() => {
    const grouped = emptyLaneMap();
    const query = search.trim().toLowerCase();

    activeCategoryCards.forEach((card) => {
      const searchableText = `${card.title} ${card.description} ${card.owner ?? ""} ${card.priority} ${card.notes}`.toLowerCase();
      if (query && !searchableText.includes(query)) {
        return;
      }

      grouped[normalizeLane(card.lane)].push(card);
    });

    parkingLotLanes.forEach((lane) => grouped[lane.id].sort(sortCards));
    return grouped;
  }, [activeCategoryCards, search]);

  const fullCardsByLane = useMemo(() => {
    const grouped = emptyLaneMap();
    activeCategoryCards.forEach((card) => grouped[normalizeLane(card.lane)].push(card));
    parkingLotLanes.forEach((lane) => grouped[lane.id].sort(sortCards));
    return grouped;
  }, [activeCategoryCards]);

  const cardCountsByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    cards.forEach((card) => {
      if (!card.archived_at) {
        counts.set(card.category_id, (counts.get(card.category_id) ?? 0) + 1);
      }
    });
    return counts;
  }, [cards]);

  function setStatus(text: string, tone: "success" | "error" = "success") {
    setStatusMessage(text);
    setStatusTone(tone);
  }

  function updateDraft(cardId: string, patch: CardDraft) {
    setDrafts((current) => ({
      ...current,
      [cardId]: {
        ...(current[cardId] ?? {}),
        ...patch,
      },
    }));
  }

  function getDraftCard(card: BrainstormingParkingLotCard) {
    return { ...card, ...(drafts[card.id] ?? {}) };
  }

  function clearDraft(cardId: string) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[cardId];
      return next;
    });
  }

  function openCardEditor(cardId: string) {
    setEditingCardIds((current) => ({
      ...current,
      [cardId]: true,
    }));
  }

  function closeCardEditor(cardId: string) {
    setEditingCardIds((current) => {
      const next = { ...current };
      delete next[cardId];
      return next;
    });
  }

  function cancelCardEdit(cardId: string) {
    clearDraft(cardId);
    closeCardEditor(cardId);
  }

  async function createCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeCategory || !supabase) {
      setStatus("Supabase is required before ideas can be saved.", "error");
      return;
    }

    const title = cleanText(createDraft.title);
    if (!title) {
      setStatus("Add an idea title before saving.", "error");
      return;
    }

    setCreating(true);
    setStatusMessage("");

    const laneCards = fullCardsByLane[createDraft.lane] ?? [];
    const payload: BrainstormingParkingLotCardInsert = {
      category_id: activeCategory.id,
      title,
      description: cleanText(createDraft.description),
      lane: createDraft.lane,
      owner: cleanOptional(createDraft.owner),
      priority: createDraft.priority,
      notes: cleanText(createDraft.notes),
      sort_order: (laneCards.length + 1) * 100,
      is_placeholder: false,
      created_by_user_id: currentUserId,
      updated_by_user_id: currentUserId,
    };

    const { data, error } = await supabase.from("brainstorming_parking_lot_cards").insert(payload).select("*").single();
    setCreating(false);

    if (error) {
      setStatus(error.message, "error");
      return;
    }

    if (data) {
      setCards((current) => mergeRealtimeCard(current, data as BrainstormingParkingLotCard));
      setCreateDraft(emptyCreateDraft);
      setStatus("Idea added.");
    }
  }

  async function saveCard(card: BrainstormingParkingLotCard) {
    const draft = drafts[card.id];
    if (!draft || !supabase) {
      return;
    }

    const title = cleanText(String(draft.title ?? card.title));
    if (!title) {
      setStatus("A card needs a title before saving.", "error");
      return;
    }

    const patch: BrainstormingParkingLotCardUpdate = {
      title,
      description: cleanText(String(draft.description ?? card.description)),
      lane: normalizeLane(String(draft.lane ?? card.lane)),
      owner: cleanOptional(String(draft.owner ?? card.owner ?? "")),
      priority: String(draft.priority ?? card.priority),
      notes: cleanText(String(draft.notes ?? card.notes)),
      is_placeholder: false,
      updated_by_user_id: currentUserId,
    };

    setSavingId(card.id);
    setStatusMessage("");

    const { data, error } = await supabase.from("brainstorming_parking_lot_cards").update(patch).eq("id", card.id).select("*").single();
    setSavingId(null);

    if (error) {
      setStatus(error.message, "error");
      return;
    }

    if (data) {
      setCards((current) => mergeRealtimeCard(current, data as BrainstormingParkingLotCard));
      clearDraft(card.id);
      closeCardEditor(card.id);
      setStatus("Card saved.");
    }
  }

  async function archiveCard(card: BrainstormingParkingLotCard) {
    if (!supabase) {
      setStatus("Supabase is required before cards can be archived.", "error");
      return;
    }

    setArchivingId(card.id);
    setStatusMessage("");

    const { error } = await supabase
      .from("brainstorming_parking_lot_cards")
      .update({
        archived_at: new Date().toISOString(),
        archived_by_user_id: currentUserId,
        updated_by_user_id: currentUserId,
      })
      .eq("id", card.id);

    setArchivingId(null);

    if (error) {
      setStatus(error.message, "error");
      return;
    }

    setCards((current) => current.filter((item) => item.id !== card.id));
    clearDraft(card.id);
    closeCardEditor(card.id);
    setStatus("Card archived.");
  }

  async function moveCard(cardId: string, targetLane: ParkingLotLane, beforeCardId: string | null) {
    if (!supabase) {
      setStatus("Supabase is required before cards can be moved.", "error");
      return;
    }

    const movingCard = cards.find((card) => card.id === cardId);
    if (!movingCard || movingCard.archived_at) {
      return;
    }

    if (beforeCardId === movingCard.id) {
      return;
    }

    const sourceLane = normalizeLane(movingCard.lane);
    const affectedLanes = [...new Set<ParkingLotLane>([sourceLane, targetLane])];
    const updates: { id: string; lane: ParkingLotLane; sort_order: number }[] = [];

    affectedLanes.forEach((lane) => {
      const laneCards = cards
        .filter((card) => card.category_id === movingCard.category_id && !card.archived_at && card.id !== movingCard.id && normalizeLane(card.lane) === lane)
        .sort(sortCards);

      if (lane === targetLane) {
        const moved = { ...movingCard, lane };
        const targetIndex = beforeCardId ? laneCards.findIndex((card) => card.id === beforeCardId) : -1;
        if (targetIndex === -1) {
          laneCards.push(moved);
        } else {
          laneCards.splice(targetIndex, 0, moved);
        }
      }

      laneCards.forEach((card, index) => {
        updates.push({
          id: card.id,
          lane,
          sort_order: (index + 1) * 100,
        });
      });
    });

    const updateById = new Map(updates.map((update) => [update.id, update]));
    setCards((current) =>
      current
        .map((card) => {
          const update = updateById.get(card.id);
          return update ? { ...card, lane: update.lane, sort_order: update.sort_order, updated_by_user_id: currentUserId } : card;
        })
        .sort(sortCards),
    );
    setDraggedCardId(null);
    setDragOverLane(null);
    setStatusMessage("");

    const changedUpdates = updates.filter((update) => {
      const original = cards.find((card) => card.id === update.id);
      return original && (normalizeLane(original.lane) !== update.lane || original.sort_order !== update.sort_order);
    });

    const results = await Promise.all(
      changedUpdates.map((update) =>
        supabase
          .from("brainstorming_parking_lot_cards")
          .update({
            lane: update.lane,
            sort_order: update.sort_order,
            updated_by_user_id: currentUserId,
          })
          .eq("id", update.id),
      ),
    );

    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      setStatus(firstError.message, "error");
      return;
    }

    setStatus(`Moved card to ${getParkingLotLaneLabel(targetLane)}.`);
  }

  function handleDragStart(cardId: string) {
    setDraggedCardId(cardId);
  }

  function handleDrop(event: DragEvent<HTMLElement>, lane: ParkingLotLane, beforeCardId: string | null = null) {
    event.preventDefault();
    event.stopPropagation();

    if (draggedCardId) {
      void moveCard(draggedCardId, lane, beforeCardId);
    }
  }

  if (categories.length === 0) {
    return <div className="empty-state">Parking lot categories will appear here after the Supabase migration is applied.</div>;
  }

  return (
    <div className="parking-lots-page">
      <section className="parking-toolbar" aria-label="Parking lot controls">
        <div className="parking-live-group">
          <span className={`parking-live-status parking-live-${liveStatus}`}>
            {liveStatus === "connected" ? <Wifi size={15} /> : <WifiOff size={15} />}
            {formatLiveStatus(liveStatus)}
          </span>
          <span>{activeCategoryCards.length} active cards</span>
        </div>
        <label className="parking-search">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this board" />
        </label>
      </section>

      <div className="parking-category-tabs" role="tablist" aria-label="Parking lot categories">
        {categories.map((category) => (
          <button
            aria-selected={category.id === activeCategory?.id}
            className={category.id === activeCategory?.id ? "active" : undefined}
            key={category.id}
            onClick={() => setActiveCategoryId(category.id)}
            role="tab"
            type="button"
          >
            <span>{category.title}</span>
            <small>{cardCountsByCategory.get(category.id) ?? 0}</small>
          </button>
        ))}
      </div>

      {activeCategory ? (
        <>
          <section className="parking-board-heading">
            <div>
              <div className="eyebrow">Category Board</div>
              <h2>{activeCategory.title}</h2>
              <p>{activeCategory.description}</p>
            </div>
            <span className="badge">
              <CarFront size={15} />
              {activeCategoryCards.length} cars
            </span>
          </section>

          <form className="parking-create-form" onSubmit={createCard}>
            {statusMessage ? <div className={`success-box portal-alert ${statusTone === "error" ? "portal-alert-error" : ""}`}>{statusMessage}</div> : null}
            <div className="form-grid parking-create-grid">
              <div className="field">
                <label htmlFor="parking-new-title">New idea</label>
                <input
                  id="parking-new-title"
                  value={createDraft.title}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Name the idea"
                />
              </div>
              <div className="field">
                <label htmlFor="parking-new-lane">Lane</label>
                <select
                  id="parking-new-lane"
                  value={createDraft.lane}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, lane: normalizeLane(event.target.value) }))}
                >
                  {parkingLotLanes.map((lane) => (
                    <option key={lane.id} value={lane.id}>
                      {lane.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="parking-new-priority">Priority</label>
                <select
                  id="parking-new-priority"
                  value={createDraft.priority}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, priority: event.target.value as ParkingLotPriority }))}
                >
                  {parkingLotPriorities.map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="parking-new-owner">Owner</label>
                <input
                  id="parking-new-owner"
                  value={createDraft.owner}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, owner: event.target.value }))}
                  placeholder="Unassigned"
                />
              </div>
              <div className="field-full">
                <label htmlFor="parking-new-description">Description</label>
                <textarea
                  id="parking-new-description"
                  value={createDraft.description}
                  onChange={(event) => setCreateDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="What should this idea do?"
                />
              </div>
              <button className="button button-primary" disabled={creating} type="submit">
                <Plus size={18} />
                {creating ? "Adding..." : "Add Car"}
              </button>
            </div>
          </form>

          <section className="parking-lane-grid" aria-label={`${activeCategory.title} lanes`}>
            {parkingLotLanes.map((lane) => (
              <div
                className={`parking-lane ${dragOverLane === lane.id ? "parking-lane-over" : ""}`}
                key={lane.id}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverLane(lane.id);
                }}
                onDrop={(event) => handleDrop(event, lane.id)}
              >
                <div className="parking-lane-header">
                  <div>
                    <h3>{lane.label}</h3>
                    <p>{lane.description}</p>
                  </div>
                  <span>{fullCardsByLane[lane.id]?.length ?? 0}</span>
                </div>
                <div className="parking-card-stack">
                  {visibleCardsByLane[lane.id].length === 0 ? (
                    <div className="empty-state parking-lane-empty">No visible cards.</div>
                  ) : (
                    visibleCardsByLane[lane.id].map((card) => {
                      const draftCard = getDraftCard(card);
                      const dirty = Boolean(drafts[card.id]);
                      const editing = Boolean(editingCardIds[card.id]) || dirty;

                      return (
                        <article
                          className={`parking-card ${card.is_placeholder ? "parking-card-placeholder" : ""} ${editing ? "parking-card-editing" : ""}`}
                          key={card.id}
                          onDoubleClick={() => openCardEditor(card.id)}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setDragOverLane(lane.id);
                          }}
                          onDrop={(event) => handleDrop(event, lane.id, card.id)}
                        >
                          <div className="parking-card-summary">
                            <button
                              aria-label={`Drag ${card.title}`}
                              className="parking-card-drag"
                              draggable
                              onDragEnd={() => {
                                setDraggedCardId(null);
                                setDragOverLane(null);
                              }}
                              onDragStart={() => handleDragStart(card.id)}
                              type="button"
                            >
                              <GripVertical size={17} />
                            </button>

                            <div className="parking-card-main">
                              <div className="parking-card-title-line">
                                <h4>{String(draftCard.title ?? "")}</h4>
                                <div className="parking-card-badges">
                                  <span className="record-badge">{String(draftCard.priority ?? card.priority)}</span>
                                  {card.is_placeholder ? <span className="record-badge record-badge-neutral">Placeholder</span> : null}
                                  {dirty ? <span className="record-badge record-badge-gold">Unsaved</span> : null}
                                </div>
                              </div>
                              {String(draftCard.description ?? "").trim() ? <p>{String(draftCard.description ?? "")}</p> : null}
                              <div className="parking-card-meta">
                                <span>{getParkingLotLaneLabel(String(draftCard.lane ?? card.lane))}</span>
                                <span>{draftCard.owner ? `Owner: ${draftCard.owner}` : "Unassigned"}</span>
                                {String(draftCard.notes ?? "").trim() ? <span>Has notes</span> : null}
                              </div>
                            </div>

                            <div className="parking-card-quick-actions">
                              <button
                                aria-expanded={editing}
                                className="button button-secondary button-neutral"
                                disabled={savingId === card.id || archivingId === card.id}
                                onClick={() => openCardEditor(card.id)}
                                type="button"
                              >
                                <Pencil size={15} />
                                Edit
                              </button>
                              <button className="button button-danger" disabled={savingId === card.id || archivingId === card.id} onClick={() => void archiveCard(card)} type="button">
                                <Archive size={15} />
                                {archivingId === card.id ? "Archiving..." : "Archive"}
                              </button>
                            </div>
                          </div>

                          {editing ? (
                            <div className="parking-card-edit-panel">
                              <div className="parking-card-fields">
                                <div className="field">
                                  <label htmlFor={`parking-title-${card.id}`}>Title</label>
                                  <input
                                    id={`parking-title-${card.id}`}
                                    value={String(draftCard.title ?? "")}
                                    onChange={(event) => updateDraft(card.id, { title: event.target.value })}
                                  />
                                </div>
                                <div className="field">
                                  <label htmlFor={`parking-lane-${card.id}`}>Lane</label>
                                  <select
                                    id={`parking-lane-${card.id}`}
                                    value={normalizeLane(String(draftCard.lane ?? card.lane))}
                                    onChange={(event) => updateDraft(card.id, { lane: normalizeLane(event.target.value) })}
                                  >
                                    {parkingLotLanes.map((laneOption) => (
                                      <option key={laneOption.id} value={laneOption.id}>
                                        {laneOption.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="field">
                                  <label htmlFor={`parking-priority-${card.id}`}>Priority</label>
                                  <select
                                    id={`parking-priority-${card.id}`}
                                    value={String(draftCard.priority ?? card.priority)}
                                    onChange={(event) => updateDraft(card.id, { priority: event.target.value })}
                                  >
                                    {parkingLotPriorities.map((priority) => (
                                      <option key={priority}>{priority}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="field">
                                  <label htmlFor={`parking-owner-${card.id}`}>Owner</label>
                                  <input
                                    id={`parking-owner-${card.id}`}
                                    value={draftCard.owner ?? ""}
                                    onChange={(event) => updateDraft(card.id, { owner: event.target.value })}
                                    placeholder="Unassigned"
                                  />
                                </div>
                                <div className="field-full">
                                  <label htmlFor={`parking-description-${card.id}`}>Description</label>
                                  <textarea
                                    id={`parking-description-${card.id}`}
                                    value={String(draftCard.description ?? "")}
                                    onChange={(event) => updateDraft(card.id, { description: event.target.value })}
                                  />
                                </div>
                                <div className="field-full">
                                  <label htmlFor={`parking-notes-${card.id}`}>Notes</label>
                                  <textarea
                                    id={`parking-notes-${card.id}`}
                                    value={String(draftCard.notes ?? "")}
                                    onChange={(event) => updateDraft(card.id, { notes: event.target.value })}
                                  />
                                </div>
                              </div>

                              <div className="parking-card-actions">
                                <button className="button button-primary" disabled={!dirty || savingId === card.id || archivingId === card.id} onClick={() => void saveCard(card)} type="button">
                                  <Save size={16} />
                                  {savingId === card.id ? "Saving..." : "Save"}
                                </button>
                                <button className="button button-secondary button-neutral" disabled={savingId === card.id || archivingId === card.id} onClick={() => cancelCardEdit(card.id)} type="button">
                                  <X size={16} />
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
