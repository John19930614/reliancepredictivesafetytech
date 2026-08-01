"use client";

import { CheckCircle2, Flame, Lightbulb, Loader2, Plus, Rocket, Sparkles, User, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { submitMobileIdea } from "@/app/m/actions";
import { formatRelativeTimestamp } from "@/lib/mobile-app";
import { parkingLotLanes, parkingLotPriorities } from "@/lib/parking-lots";
import { MobileHeader } from "./MobileHeader";

type IdeaCard = {
  id: string;
  title: string;
  description: string;
  lane: string;
  priority: string;
  categoryId: string;
  createdAt: string | null;
  isMine: boolean;
};

type MobileIdeasBoardProps = {
  categories: { id: string; title: string }[];
  cards: IdeaCard[];
  openComposerInitially: boolean;
};

const LANE_ICONS: Record<string, typeof Rocket> = {
  do_now: Rocket,
  build_next: Sparkles,
  parking_lot: Lightbulb,
};

const PRIORITY_TONE: Record<string, string> = {
  Low: "tone-slate",
  Medium: "tone-blue",
  High: "tone-gold",
  Critical: "tone-red",
};

type LaneFilter = "all" | "mine" | (typeof parkingLotLanes)[number]["id"];

export function MobileIdeasBoard({ categories, cards, openComposerInitially }: MobileIdeasBoardProps) {
  const router = useRouter();
  const [isComposerOpen, setIsComposerOpen] = useState(openComposerInitially && categories.length > 0);
  const [filter, setFilter] = useState<LaneFilter>("all");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [priority, setPriority] = useState<string>("Medium");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visibleCards = useMemo(() => {
    if (filter === "all") {
      return cards;
    }

    if (filter === "mine") {
      return cards.filter((card) => card.isMine);
    }

    return cards.filter((card) => card.lane === filter);
  }, [cards, filter]);

  const categoryTitleById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.title])),
    [categories],
  );

  function resetComposer() {
    setTitle("");
    setDescription("");
    setPriority("Medium");
    setCategoryId(categories[0]?.id ?? "");
    setError(null);
  }

  function submit() {
    if (isPending) {
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        await submitMobileIdea({ categoryId, title, description, priority });
        resetComposer();
        setIsComposerOpen(false);
        setConfirmation("Idea sent to the parking lot board.");
        router.refresh();
        window.setTimeout(() => setConfirmation(null), 4000);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not submit the idea.");
      }
    });
  }

  const now = new Date();

  return (
    <>
      <MobileHeader
        eyebrow="Ideas"
        subtitle="Anything you think would make the platform better."
        title="Parking lot"
        action={
          categories.length > 0 ? (
            <button
              aria-label="Submit an idea"
              className="m-icon-button is-primary"
              onClick={() => setIsComposerOpen(true)}
              type="button"
            >
              <Plus aria-hidden="true" size={19} strokeWidth={2.4} />
            </button>
          ) : null
        }
      />

      {confirmation ? (
        <p className="m-toast">
          <CheckCircle2 aria-hidden="true" size={16} strokeWidth={2.2} />
          {confirmation}
        </p>
      ) : null}

      <div className="m-chips" role="tablist">
        <button
          aria-selected={filter === "all"}
          className={`m-chip${filter === "all" ? " is-active" : ""}`}
          onClick={() => setFilter("all")}
          role="tab"
          type="button"
        >
          All
        </button>
        {parkingLotLanes.map((lane) => (
          <button
            aria-selected={filter === lane.id}
            className={`m-chip${filter === lane.id ? " is-active" : ""}`}
            key={lane.id}
            onClick={() => setFilter(lane.id)}
            role="tab"
            type="button"
          >
            {lane.label}
          </button>
        ))}
        <button
          aria-selected={filter === "mine"}
          className={`m-chip${filter === "mine" ? " is-active" : ""}`}
          onClick={() => setFilter("mine")}
          role="tab"
          type="button"
        >
          <User aria-hidden="true" size={13} strokeWidth={2.3} />
          Mine
        </button>
      </div>

      {visibleCards.length === 0 ? (
        <div className="m-empty">
          <Lightbulb aria-hidden="true" size={26} strokeWidth={1.7} />
          <p>Nothing here yet.</p>
          <small>{filter === "mine" ? "Ideas you submit will show up here." : "Tap + to add the first one."}</small>
        </div>
      ) : (
        <ul className="m-cards">
          {visibleCards.map((card) => {
            const LaneIcon = LANE_ICONS[card.lane] ?? Lightbulb;
            const lane = parkingLotLanes.find((candidate) => candidate.id === card.lane);

            return (
              <li className="m-card" key={card.id}>
                <div className="m-card-head">
                  <span className={`m-card-icon ${PRIORITY_TONE[card.priority] ?? "tone-slate"}`}>
                    <LaneIcon aria-hidden="true" size={16} strokeWidth={2.1} />
                  </span>
                  <div className="m-card-headtext">
                    <strong>{card.title}</strong>
                    <small>{categoryTitleById.get(card.categoryId) ?? "Uncategorised"}</small>
                  </div>
                  {card.isMine ? <span className="m-pill is-subtle">You</span> : null}
                </div>

                {card.description ? <p className="m-card-body">{card.description}</p> : null}

                <div className="m-card-foot">
                  <span className={`m-pill ${PRIORITY_TONE[card.priority] ?? "tone-slate"}`}>
                    {card.priority === "Critical" ? <Flame aria-hidden="true" size={12} strokeWidth={2.4} /> : null}
                    {card.priority}
                  </span>
                  <span className="m-pill is-outline">{lane?.label ?? card.lane}</span>
                  <time>{formatRelativeTimestamp(card.createdAt, now)}</time>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isComposerOpen ? (
        <div className="m-sheet-backdrop" onClick={() => setIsComposerOpen(false)} role="presentation">
          <div
            aria-label="Submit an idea"
            aria-modal="true"
            className="m-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="m-sheet-grip" />
            <div className="m-sheet-head">
              <h2>New idea</h2>
              <button aria-label="Close" className="m-icon-button" onClick={() => setIsComposerOpen(false)} type="button">
                <X aria-hidden="true" size={18} strokeWidth={2.1} />
              </button>
            </div>

            <form
              className="m-form"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <label className="m-field">
                <span>What is the idea?</span>
                <input
                  autoFocus
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Shorter certificate expiry alerts"
                  required
                  type="text"
                  value={title}
                />
              </label>

              <label className="m-field">
                <span>Why does it matter?</span>
                <textarea
                  maxLength={4000}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional — the problem it solves, who it helps"
                  rows={4}
                  value={description}
                />
              </label>

              <label className="m-field">
                <span>Category</span>
                <select onChange={(event) => setCategoryId(event.target.value)} required value={categoryId}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.title}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="m-field">
                <span>Priority</span>
                <div className="m-segmented">
                  {parkingLotPriorities.map((option) => (
                    <button
                      aria-pressed={priority === option}
                      className={`m-segment${priority === option ? " is-active" : ""}`}
                      key={option}
                      onClick={() => setPriority(option)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>

              {error ? <p className="m-error">{error}</p> : null}

              <button className="m-primary-button" disabled={isPending || !title.trim() || !categoryId} type="submit">
                {isPending ? <Loader2 aria-hidden="true" className="spin" size={17} strokeWidth={2.3} /> : null}
                Submit idea
              </button>
              <p className="m-form-note">New ideas land in the Parking Lot lane for triage on the desktop board.</p>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
