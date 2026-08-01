"use client";

import {
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Mail,
  MessageSquarePlus,
  Phone,
  Signpost,
  User,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logMobileLeadActivity, updateMobileLeadStage } from "@/app/m/actions";
import { lifecycleStages } from "@/lib/company-data";
import { formatRelativeTimestamp, mobileLeadActivityTypes } from "@/lib/mobile-app";
import { MobileAvatar } from "./MobileAvatar";
import { MobileHeader } from "./MobileHeader";
import { getStageTone } from "./stage-tone";

type Lead = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  companyType: string | null;
  lifecycleStage: string;
  status: string;
  owner: string | null;
  source: string | null;
  notes: string | null;
  updatedAt: string | null;
};

type Activity = {
  id: string;
  activityType: string;
  title: string;
  notes: string | null;
  outcome: string | null;
  owner: string | null;
  createdAt: string | null;
};

export function MobileLeadDetail({ lead, activities }: { lead: Lead; activities: Activity[] }) {
  const router = useRouter();
  const [isStagePickerOpen, setIsStagePickerOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [activityType, setActivityType] = useState<string>("Call");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function flash(message: string) {
    setConfirmation(message);
    window.setTimeout(() => setConfirmation(null), 4000);
  }

  function changeStage(nextStage: string) {
    if (nextStage === lead.lifecycleStage) {
      setIsStagePickerOpen(false);
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        await updateMobileLeadStage(lead.id, nextStage);
        setIsStagePickerOpen(false);
        flash(`Moved to ${nextStage}.`);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not update the stage.");
      }
    });
  }

  function saveActivity() {
    setError(null);

    startTransition(async () => {
      try {
        await logMobileLeadActivity({ clientId: lead.id, activityType, title, notes, outcome });
        setTitle("");
        setNotes("");
        setOutcome("");
        setIsLogOpen(false);
        flash("Update logged.");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save the update.");
      }
    });
  }

  const now = new Date();

  return (
    <>
      <MobileHeader
        backHref="/m/leads"
        backLabel="Pipeline"
        eyebrow={lead.companyType || "Lead"}
        title={lead.name}
        action={<MobileAvatar name={lead.name} seed={lead.id} size="lg" />}
      />

      {confirmation ? (
        <p className="m-toast">
          <CheckCircle2 aria-hidden="true" size={16} strokeWidth={2.2} />
          {confirmation}
        </p>
      ) : null}

      <section className="m-stage-panel">
        <div className="m-stage-current">
          <span className="m-eyebrow">Current stage</span>
          <span className={`m-pill is-large ${getStageTone(lead.lifecycleStage)}`}>{lead.lifecycleStage}</span>
        </div>
        <button className="m-secondary-button" onClick={() => setIsStagePickerOpen(true)} type="button">
          <Signpost aria-hidden="true" size={16} strokeWidth={2.2} />
          Change stage
          <ChevronDown aria-hidden="true" size={15} strokeWidth={2.2} />
        </button>
      </section>

      <section className="m-detail-grid">
        {lead.contactName ? (
          <div className="m-detail-item">
            <span className="m-detail-icon tone-slate">
              <User aria-hidden="true" size={15} strokeWidth={2.1} />
            </span>
            <div>
              <small>Contact</small>
              <strong>{lead.contactName}</strong>
            </div>
          </div>
        ) : null}

        {lead.phone ? (
          <a className="m-detail-item is-link" href={`tel:${lead.phone}`}>
            <span className="m-detail-icon tone-green">
              <Phone aria-hidden="true" size={15} strokeWidth={2.1} />
            </span>
            <div>
              <small>Phone</small>
              <strong>{lead.phone}</strong>
            </div>
          </a>
        ) : null}

        {lead.email ? (
          <a className="m-detail-item is-link" href={`mailto:${lead.email}`}>
            <span className="m-detail-icon tone-blue">
              <Mail aria-hidden="true" size={15} strokeWidth={2.1} />
            </span>
            <div>
              <small>Email</small>
              <strong className="m-truncate">{lead.email}</strong>
            </div>
          </a>
        ) : null}

        {lead.owner ? (
          <div className="m-detail-item">
            <span className="m-detail-icon tone-gold">
              <Briefcase aria-hidden="true" size={15} strokeWidth={2.1} />
            </span>
            <div>
              <small>Owner</small>
              <strong className="m-truncate">{lead.owner}</strong>
            </div>
          </div>
        ) : null}
      </section>

      {lead.notes ? (
        <section className="m-section">
          <h2 className="m-section-title">Notes</h2>
          <p className="m-note-block">{lead.notes}</p>
        </section>
      ) : null}

      <section className="m-section">
        <div className="m-section-head">
          <h2 className="m-section-title">
            <CalendarClock aria-hidden="true" size={15} strokeWidth={2.4} />
            Activity
          </h2>
          <button className="m-section-link" onClick={() => setIsLogOpen(true)} type="button">
            Log update
          </button>
        </div>

        {activities.length === 0 ? (
          <div className="m-empty is-compact">
            <MessageSquarePlus aria-hidden="true" size={22} strokeWidth={1.7} />
            <p>No activity logged yet.</p>
          </div>
        ) : (
          <ul className="m-timeline">
            {activities.map((activity) => (
              <li className="m-timeline-item" key={activity.id}>
                <span className="m-timeline-marker" />
                <div className="m-timeline-body">
                  <strong>{activity.title}</strong>
                  {activity.notes ? <p>{activity.notes}</p> : null}
                  <small>
                    {activity.activityType}
                    {activity.outcome ? ` · ${activity.outcome}` : ""} · {formatRelativeTimestamp(activity.createdAt, now)}
                    {activity.owner ? ` · ${activity.owner}` : ""}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && !isStagePickerOpen && !isLogOpen ? <p className="m-error">{error}</p> : null}

      {isStagePickerOpen ? (
        <div className="m-sheet-backdrop" onClick={() => setIsStagePickerOpen(false)} role="presentation">
          <div
            aria-label="Change pipeline stage"
            aria-modal="true"
            className="m-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="m-sheet-grip" />
            <div className="m-sheet-head">
              <h2>Move {lead.name}</h2>
              <button aria-label="Close" className="m-icon-button" onClick={() => setIsStagePickerOpen(false)} type="button">
                <X aria-hidden="true" size={18} strokeWidth={2.1} />
              </button>
            </div>

            {error ? <p className="m-error">{error}</p> : null}

            <ul className="m-list m-sheet-list">
              {lifecycleStages.map((candidate) => (
                <li key={candidate}>
                  <button
                    className={`m-list-row${candidate === lead.lifecycleStage ? " is-selected" : ""}`}
                    disabled={isPending}
                    onClick={() => changeStage(candidate)}
                    type="button"
                  >
                    <span className={`m-stage-swatch ${getStageTone(candidate)}`} />
                    <span className="m-list-body">
                      <strong>{candidate}</strong>
                    </span>
                    {candidate === lead.lifecycleStage ? (
                      <CheckCircle2 aria-hidden="true" className="m-list-arrow" size={17} strokeWidth={2.2} />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {isLogOpen ? (
        <div className="m-sheet-backdrop" onClick={() => setIsLogOpen(false)} role="presentation">
          <div
            aria-label="Log an update"
            aria-modal="true"
            className="m-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="m-sheet-grip" />
            <div className="m-sheet-head">
              <h2>Log an update</h2>
              <button aria-label="Close" className="m-icon-button" onClick={() => setIsLogOpen(false)} type="button">
                <X aria-hidden="true" size={18} strokeWidth={2.1} />
              </button>
            </div>

            <form
              className="m-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveActivity();
              }}
            >
              <fieldset className="m-field">
                <span>Type</span>
                <div className="m-segmented is-wrap">
                  {mobileLeadActivityTypes.map((option) => (
                    <button
                      aria-pressed={activityType === option}
                      className={`m-segment${activityType === option ? " is-active" : ""}`}
                      key={option}
                      onClick={() => setActivityType(option)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="m-field">
                <span>Summary</span>
                <input
                  autoFocus
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Left voicemail with the safety manager"
                  required
                  type="text"
                  value={title}
                />
              </label>

              <label className="m-field">
                <span>Details</span>
                <textarea
                  maxLength={4000}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional"
                  rows={4}
                  value={notes}
                />
              </label>

              <label className="m-field">
                <span>Outcome</span>
                <input
                  maxLength={200}
                  onChange={(event) => setOutcome(event.target.value)}
                  placeholder="Optional — e.g. callback Thursday"
                  type="text"
                  value={outcome}
                />
              </label>

              {error ? <p className="m-error">{error}</p> : null}

              <button className="m-primary-button" disabled={isPending || !title.trim()} type="submit">
                {isPending ? <Loader2 aria-hidden="true" className="spin" size={17} strokeWidth={2.3} /> : null}
                Save update
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
