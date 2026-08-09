"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ClipboardList, Plus, Star, Users } from "lucide-react";
import { canReadPerformanceReview, visiblePerformanceReviews } from "@/lib/performance/policy";
import {
  performanceReviewCycleStatuses,
  performanceReviewTypes,
  type EmployeeProfile,
  type PerformanceReview,
  type PerformanceReviewCycle,
} from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";

type PerformanceReviewManagerProps = {
  currentUserId: string;
  cycles: PerformanceReviewCycle[];
  isAdmin: boolean;
  profiles: EmployeeProfile[];
  reviews: PerformanceReview[];
};

type View = "cycles" | "cycle-detail" | "review-form";

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function cleanOptionalText(value: FormDataEntryValue | null) {
  const t = cleanText(value);
  return t || null;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusBadgeClass(status: string) {
  if (status === "Open") return "badge badge-green";
  if (status === "Closed") return "badge";
  return "badge badge-yellow";
}

function reviewStatusBadgeClass(status: string) {
  if (status === "submitted") return "badge badge-green";
  if (status === "in_progress") return "badge badge-yellow";
  return "badge";
}

function RatingInput({ name, value, onChange }: { name: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="review-rating-row">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          className={`review-star${(value ?? 0) >= n ? " review-star-active" : ""}`}
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
        >
          <Star size={20} />
        </button>
      ))}
      <input name={name} type="hidden" value={value ?? ""} />
      {value ? <span className="review-rating-label">{value} / 5</span> : null}
    </div>
  );
}

export function PerformanceReviewManager({
  currentUserId,
  cycles: initialCycles,
  isAdmin,
  profiles,
  reviews: initialReviews,
}: PerformanceReviewManagerProps) {
  const [cycles, setCycles] = useState(initialCycles);
  const [reviews, setReviews] = useState(initialReviews);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<View>("cycles");
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [selfRating, setSelfRating] = useState<number | null>(null);
  const [managerRating, setManagerRating] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  const profilesById = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles]);
  const reviewsByCycleId = useMemo(() => {
    const map = new Map<string, PerformanceReview[]>();
    for (const r of reviews) {
      map.set(r.cycle_id, [...(map.get(r.cycle_id) ?? []), r]);
    }
    return map;
  }, [reviews]);

  const selectedCycle = cycles.find((c) => c.id === selectedCycleId) ?? null;
  const selectedReview = reviews.find((r) => r.id === selectedReviewId) ?? null;
  const cycleReviews = selectedCycleId ? (reviewsByCycleId.get(selectedCycleId) ?? []) : [];

  // Reviews this user may see. RLS returns only these rows now, so this is a
  // presentation filter over an already-scoped set rather than the access
  // control itself — see lib/performance/policy.ts.
  const myReviews = visiblePerformanceReviews(reviews, currentUserId, false);

  function getSupabase() {
    const sb = createClient();
    if (!sb) setMessage("Supabase connection required.");
    return sb;
  }

  async function createCycle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = cleanText(fd.get("title"));
    if (!title) { setMessage("Cycle title is required."); return; }

    const supabase = getSupabase();
    if (!supabase) return;
    setPending(true);

    const { data, error } = await supabase
      .from("performance_review_cycles")
      .insert({
        title,
        review_type: cleanText(fd.get("review_type")) || "Annual",
        period_label: cleanOptionalText(fd.get("period_label")),
        period_start: cleanOptionalText(fd.get("period_start")),
        period_end: cleanOptionalText(fd.get("period_end")),
        self_assessment_due: cleanOptionalText(fd.get("self_assessment_due")),
        manager_review_due: cleanOptionalText(fd.get("manager_review_due")),
        status: "Draft",
        created_by: currentUserId,
      })
      .select("*")
      .single();

    setPending(false);
    if (error || !data) { setMessage(error?.message ?? "Could not create cycle."); return; }
    setCycles((c) => [data as PerformanceReviewCycle, ...c]);
    (e.target as HTMLFormElement).reset();
    setMessage("Review cycle created.");
  }

  async function openCycle(cycle: PerformanceReviewCycle) {
    const supabase = getSupabase();
    if (!supabase) return;

    // Change status to Open
    const { data: updated, error: statusError } = await supabase
      .from("performance_review_cycles")
      .update({ status: "Open", updated_at: new Date().toISOString() })
      .eq("id", cycle.id)
      .select("*")
      .single();

    if (statusError || !updated) { setMessage(statusError?.message ?? "Could not open cycle."); return; }

    // Create a review record for every active employee that doesn't have one yet
    const activeProfiles = profiles.filter((p) => p.profile_status === "active" || !p.profile_status);
    const existingReviewUserIds = new Set((reviewsByCycleId.get(cycle.id) ?? []).map((r) => r.employee_user_id));
    const toCreate = activeProfiles.filter((p) => !existingReviewUserIds.has(p.user_id));

    if (toCreate.length > 0) {
      const { data: newReviews, error: insertError } = await supabase
        .from("performance_reviews")
        .insert(toCreate.map((p) => ({ cycle_id: cycle.id, employee_user_id: p.user_id })))
        .select("*");

      if (insertError) { setMessage(insertError.message); return; }
      setReviews((r) => [...r, ...((newReviews ?? []) as PerformanceReview[])]);
    }

    setCycles((c) => c.map((item) => (item.id === cycle.id ? (updated as PerformanceReviewCycle) : item)));
    setMessage(`Cycle opened — ${toCreate.length} review${toCreate.length === 1 ? "" : "s"} assigned.`);
  }

  async function closeCycle(cycle: PerformanceReviewCycle) {
    const supabase = getSupabase();
    if (!supabase) return;

    const { data: updated, error } = await supabase
      .from("performance_review_cycles")
      .update({ status: "Closed", updated_at: new Date().toISOString() })
      .eq("id", cycle.id)
      .select("*")
      .single();

    if (error || !updated) { setMessage(error?.message ?? "Could not close cycle."); return; }
    setCycles((c) => c.map((item) => (item.id === cycle.id ? (updated as PerformanceReviewCycle) : item)));
    setMessage("Cycle closed.");
  }

  async function submitSelfAssessment(e: React.FormEvent<HTMLFormElement>, review: PerformanceReview) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const supabase = getSupabase();
    if (!supabase) return;
    setPending(true);

    const { data, error } = await supabase
      .from("performance_reviews")
      .update({
        self_highlights: cleanOptionalText(fd.get("self_highlights")),
        self_improvements: cleanOptionalText(fd.get("self_improvements")),
        self_goals: cleanOptionalText(fd.get("self_goals")),
        overall_self_rating: selfRating,
        self_assessment_status: "submitted",
        self_submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", review.id)
      .select("*")
      .single();

    setPending(false);
    if (error || !data) { setMessage(error?.message ?? "Could not save self-assessment."); return; }
    setReviews((r) => r.map((item) => (item.id === review.id ? (data as PerformanceReview) : item)));
    setMessage("Self-assessment submitted.");
    setView("cycle-detail");
  }

  async function submitManagerReview(e: React.FormEvent<HTMLFormElement>, review: PerformanceReview) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const supabase = getSupabase();
    if (!supabase) return;
    setPending(true);

    const { data, error } = await supabase
      .from("performance_reviews")
      .update({
        manager_highlights: cleanOptionalText(fd.get("manager_highlights")),
        manager_improvements: cleanOptionalText(fd.get("manager_improvements")),
        manager_goals: cleanOptionalText(fd.get("manager_goals")),
        manager_notes: cleanOptionalText(fd.get("manager_notes")),
        overall_manager_rating: managerRating,
        manager_review_status: "submitted",
        manager_submitted_at: new Date().toISOString(),
        reviewer_user_id: currentUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", review.id)
      .select("*")
      .single();

    setPending(false);
    if (error || !data) { setMessage(error?.message ?? "Could not save manager review."); return; }
    setReviews((r) => r.map((item) => (item.id === review.id ? (data as PerformanceReview) : item)));
    setMessage("Manager review submitted.");
    setView("cycle-detail");
  }

  function openReviewForm(review: PerformanceReview) {
    setSelectedReviewId(review.id);
    setSelfRating(review.overall_self_rating ?? null);
    setManagerRating(review.overall_manager_rating ?? null);
    setView("review-form");
  }

  // ── Review form view ───────────────────────────────────────────────
  if (view === "review-form" && selectedReview) {
    const employeeProfile = profilesById.get(selectedReview.employee_user_id);
    const employeeName = employeeProfile?.display_name ?? employeeProfile?.email ?? "Employee";
    const isSelf = selectedReview.employee_user_id === currentUserId;
    const selfDone = selectedReview.self_assessment_status === "submitted";
    const managerDone = selectedReview.manager_review_status === "submitted";

    return (
      <div className="review-form-layout">
        <button className="button button-light" type="button" onClick={() => setView("cycle-detail")}>
          <ChevronLeft size={16} />
          Back to cycle
        </button>

        {message ? <div className="success-box">{message}</div> : null}

        <div className="review-form-grid">
          {/* Self-assessment */}
          <section className="form-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">Self-Assessment</div>
                <h2>{employeeName}</h2>
              </div>
              <span className={reviewStatusBadgeClass(selectedReview.self_assessment_status)}>
                {selectedReview.self_assessment_status.replace("_", " ")}
              </span>
            </div>

            {selfDone && !isSelf ? (
              <div className="review-submitted-view">
                <div className="review-field-view"><strong>Highlights</strong><p>{selectedReview.self_highlights ?? "—"}</p></div>
                <div className="review-field-view"><strong>Improvements</strong><p>{selectedReview.self_improvements ?? "—"}</p></div>
                <div className="review-field-view"><strong>Goals</strong><p>{selectedReview.self_goals ?? "—"}</p></div>
                {selectedReview.overall_self_rating ? (
                  <div className="review-field-view"><strong>Self Rating</strong><p>{selectedReview.overall_self_rating} / 5</p></div>
                ) : null}
              </div>
            ) : isSelf && !selfDone ? (
              <form className="form-grid" onSubmit={(e) => submitSelfAssessment(e, selectedReview)}>
                <div className="field-full">
                  <label>What went well this period? (Highlights)</label>
                  <textarea name="self_highlights" rows={4} defaultValue={selectedReview.self_highlights ?? ""} placeholder="Key wins, strong contributions, skills demonstrated..." />
                </div>
                <div className="field-full">
                  <label>What would you improve?</label>
                  <textarea name="self_improvements" rows={4} defaultValue={selectedReview.self_improvements ?? ""} placeholder="Areas for development, challenges faced..." />
                </div>
                <div className="field-full">
                  <label>Goals for the next period</label>
                  <textarea name="self_goals" rows={4} defaultValue={selectedReview.self_goals ?? ""} placeholder="Priorities, skills to build, targets to hit..." />
                </div>
                <div className="field-full">
                  <label>Overall self-rating</label>
                  <RatingInput name="overall_self_rating" value={selfRating} onChange={setSelfRating} />
                </div>
                <div className="field-full">
                  <button className="button button-primary" disabled={pending} type="submit">
                    Submit Self-Assessment
                  </button>
                </div>
              </form>
            ) : selfDone ? (
              <div className="review-submitted-view">
                <div className="review-field-view"><strong>Highlights</strong><p>{selectedReview.self_highlights ?? "—"}</p></div>
                <div className="review-field-view"><strong>Improvements</strong><p>{selectedReview.self_improvements ?? "—"}</p></div>
                <div className="review-field-view"><strong>Goals</strong><p>{selectedReview.self_goals ?? "—"}</p></div>
                {selectedReview.overall_self_rating ? (
                  <div className="review-field-view"><strong>Self Rating</strong><p>{selectedReview.overall_self_rating} / 5</p></div>
                ) : null}
                <p className="table-subtext">Submitted {formatDate(selectedReview.self_submitted_at)}</p>
              </div>
            ) : (
              <div className="empty-state">This employee has not started their self-assessment yet.</div>
            )}
          </section>

          {/* Manager review */}
          {isAdmin ? (
            <section className="form-panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">Manager Review</div>
                  <h2>{employeeName}</h2>
                </div>
                <span className={reviewStatusBadgeClass(selectedReview.manager_review_status)}>
                  {selectedReview.manager_review_status.replace("_", " ")}
                </span>
              </div>

              {managerDone ? (
                <div className="review-submitted-view">
                  <div className="review-field-view"><strong>Highlights</strong><p>{selectedReview.manager_highlights ?? "—"}</p></div>
                  <div className="review-field-view"><strong>Improvements</strong><p>{selectedReview.manager_improvements ?? "—"}</p></div>
                  <div className="review-field-view"><strong>Goals</strong><p>{selectedReview.manager_goals ?? "—"}</p></div>
                  {selectedReview.manager_notes ? (
                    <div className="review-field-view"><strong>Manager Notes</strong><p>{selectedReview.manager_notes}</p></div>
                  ) : null}
                  {selectedReview.overall_manager_rating ? (
                    <div className="review-field-view"><strong>Manager Rating</strong><p>{selectedReview.overall_manager_rating} / 5</p></div>
                  ) : null}
                  <p className="table-subtext">Submitted {formatDate(selectedReview.manager_submitted_at)}</p>
                </div>
              ) : (
                <form className="form-grid" onSubmit={(e) => submitManagerReview(e, selectedReview)}>
                  <div className="field-full">
                    <label>Highlights observed</label>
                    <textarea name="manager_highlights" rows={4} defaultValue={selectedReview.manager_highlights ?? ""} placeholder="Strengths, contributions, standout moments..." />
                  </div>
                  <div className="field-full">
                    <label>Areas for improvement</label>
                    <textarea name="manager_improvements" rows={4} defaultValue={selectedReview.manager_improvements ?? ""} placeholder="Development areas, coaching opportunities..." />
                  </div>
                  <div className="field-full">
                    <label>Goals for next period</label>
                    <textarea name="manager_goals" rows={4} defaultValue={selectedReview.manager_goals ?? ""} placeholder="Objectives set for this employee..." />
                  </div>
                  <div className="field-full">
                    <label>Additional notes (private)</label>
                    <textarea name="manager_notes" rows={3} defaultValue={selectedReview.manager_notes ?? ""} placeholder="Compensation considerations, promotions, concerns..." />
                  </div>
                  <div className="field-full">
                    <label>Overall manager rating</label>
                    <RatingInput name="overall_manager_rating" value={managerRating} onChange={setManagerRating} />
                  </div>
                  <div className="field-full">
                    <button className="button button-primary" disabled={pending} type="submit">
                      Submit Manager Review
                    </button>
                  </div>
                </form>
              )}
            </section>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Cycle detail view ──────────────────────────────────────────────
  if (view === "cycle-detail" && selectedCycle) {
    const submitted = cycleReviews.filter((r) => r.self_assessment_status === "submitted").length;
    const managerDone = cycleReviews.filter((r) => r.manager_review_status === "submitted").length;

    return (
      <div className="review-detail-layout">
        <div className="review-detail-header">
          <button className="button button-light" type="button" onClick={() => setView("cycles")}>
            <ChevronLeft size={16} />
            All cycles
          </button>
          <div>
            <span className={statusBadgeClass(selectedCycle.status)}>{selectedCycle.status}</span>
          </div>
        </div>

        {message ? <div className="success-box">{message}</div> : null}

        <div className="portal-topline">
          <div>
            <div className="eyebrow">{selectedCycle.review_type}</div>
            <h2>{selectedCycle.title}</h2>
            {selectedCycle.period_label ? <p>{selectedCycle.period_label}</p> : null}
          </div>
          <div className="review-cycle-actions">
            {isAdmin && selectedCycle.status === "Draft" && (
              <button className="button button-primary" type="button" onClick={() => openCycle(selectedCycle)}>
                Open Cycle
              </button>
            )}
            {isAdmin && selectedCycle.status === "Open" && (
              <button className="button button-secondary button-neutral" type="button" onClick={() => closeCycle(selectedCycle)}>
                Close Cycle
              </button>
            )}
          </div>
        </div>

        <div className="reports-kpi-row" style={{ marginBottom: 20 }}>
          <div className="kpi-card reports-stat-card">
            <div className="eyebrow">Self-Assessments</div>
            <div className="metric">{submitted} / {cycleReviews.length}</div>
          </div>
          <div className="kpi-card reports-stat-card">
            <div className="eyebrow">Manager Reviews</div>
            <div className="metric">{managerDone} / {cycleReviews.length}</div>
          </div>
          <div className="kpi-card reports-stat-card">
            <div className="eyebrow">Avg Self Rating</div>
            <div className="metric">
              {cycleReviews.filter((r) => r.overall_self_rating).length > 0
                ? (
                    cycleReviews.reduce((sum, r) => sum + (r.overall_self_rating ?? 0), 0) /
                    cycleReviews.filter((r) => r.overall_self_rating).length
                  ).toFixed(1)
                : "—"}
            </div>
          </div>
          <div className="kpi-card reports-stat-card">
            <div className="eyebrow">Avg Manager Rating</div>
            <div className="metric">
              {cycleReviews.filter((r) => r.overall_manager_rating).length > 0
                ? (
                    cycleReviews.reduce((sum, r) => sum + (r.overall_manager_rating ?? 0), 0) /
                    cycleReviews.filter((r) => r.overall_manager_rating).length
                  ).toFixed(1)
                : "—"}
            </div>
          </div>
        </div>

        <section className="table-card">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Reviews</div>
              <h2>Employee review list</h2>
            </div>
          </div>
          {cycleReviews.length === 0 ? (
            <div className="empty-state">
              {selectedCycle.status === "Draft"
                ? "Open this cycle to assign reviews to all active employees."
                : "No reviews assigned yet."}
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Self-Assessment</th>
                    <th>Manager Review</th>
                    <th>Self Rating</th>
                    <th>Manager Rating</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cycleReviews.map((review) => {
                    const profile = profilesById.get(review.employee_user_id);
                    const name = profile?.display_name ?? profile?.email ?? review.employee_user_id.slice(0, 8);
                    const canOpen = canReadPerformanceReview(review, currentUserId, isAdmin);
                    return (
                      <tr key={review.id}>
                        <td>{name}</td>
                        <td>
                          <span className={reviewStatusBadgeClass(review.self_assessment_status)}>
                            {review.self_assessment_status.replace("_", " ")}
                          </span>
                        </td>
                        <td>
                          <span className={reviewStatusBadgeClass(review.manager_review_status)}>
                            {review.manager_review_status.replace("_", " ")}
                          </span>
                        </td>
                        <td>{review.overall_self_rating ? `${review.overall_self_rating}/5` : "—"}</td>
                        <td>{review.overall_manager_rating ? `${review.overall_manager_rating}/5` : "—"}</td>
                        <td>
                          {canOpen && (
                            <button className="button button-light button-sm" type="button" onClick={() => openReviewForm(review)}>
                              Open
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  // ── Cycles list view ───────────────────────────────────────────────
  return (
    <div className="review-cycles-layout">
      {message ? <div className="success-box">{message}</div> : null}

      <div className="review-cycles-grid">
        {isAdmin && (
          <form className="form-panel" onSubmit={createCycle}>
            <div className="panel-heading">
              <div>
                <div className="eyebrow">New Cycle</div>
                <h2>Create review cycle</h2>
              </div>
              <ClipboardList size={22} />
            </div>
            <div className="form-grid">
              <div className="field-full">
                <label>Cycle title</label>
                <input name="title" required placeholder="Annual Review 2026" />
              </div>
              <div className="field">
                <label>Type</label>
                <select name="review_type" defaultValue="Annual">
                  {performanceReviewTypes.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Period label</label>
                <input name="period_label" placeholder="H1 2026" />
              </div>
              <div className="field">
                <label>Period start</label>
                <input name="period_start" type="date" />
              </div>
              <div className="field">
                <label>Period end</label>
                <input name="period_end" type="date" />
              </div>
              <div className="field">
                <label>Self-assessment due</label>
                <input name="self_assessment_due" type="date" />
              </div>
              <div className="field">
                <label>Manager review due</label>
                <input name="manager_review_due" type="date" />
              </div>
            </div>
            <button className="button button-primary" disabled={pending} type="submit">
              <Plus size={18} />
              Create Cycle
            </button>
          </form>
        )}

        <div className="review-cycle-list">
          <div className="panel-heading" style={{ marginBottom: 14 }}>
            <div>
              <div className="eyebrow">Cycles</div>
              <h2>All review cycles</h2>
            </div>
            <Users size={22} />
          </div>

          {/* Non-admin: show only their own reviews */}
          {!isAdmin && myReviews.length > 0 && (
            <>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Your reviews</div>
              {myReviews.map((review) => {
                const cycle = cycles.find((c) => c.id === review.cycle_id);
                if (!cycle) return null;
                return (
                  <article className="doc-card" key={review.id} style={{ cursor: "pointer" }} onClick={() => { setSelectedCycleId(cycle.id); openReviewForm(review); }}>
                    <div className="review-cycle-row">
                      <div>
                        <h3>{cycle.title}</h3>
                        <p>{cycle.review_type}{cycle.period_label ? ` · ${cycle.period_label}` : ""}</p>
                      </div>
                      <span className={reviewStatusBadgeClass(review.self_assessment_status)}>
                        {review.self_assessment_status.replace("_", " ")}
                      </span>
                    </div>
                  </article>
                );
              })}
            </>
          )}

          {cycles.length === 0 ? (
            <div className="empty-state">No review cycles yet. Create one to get started.</div>
          ) : (
            cycles.map((cycle) => {
              const cycleRevs = reviewsByCycleId.get(cycle.id) ?? [];
              const submitted = cycleRevs.filter((r) => r.self_assessment_status === "submitted").length;
              return (
                <article
                  className="doc-card review-cycle-card"
                  key={cycle.id}
                  onClick={isAdmin ? () => { setSelectedCycleId(cycle.id); setView("cycle-detail"); } : undefined}
                  style={isAdmin ? { cursor: "pointer" } : undefined}
                >
                  <div className="review-cycle-row">
                    <div>
                      <h3>{cycle.title}</h3>
                      <p>{cycle.review_type}{cycle.period_label ? ` · ${cycle.period_label}` : ""}</p>
                      {cycle.period_start && cycle.period_end ? (
                        <p>{formatDate(cycle.period_start)} – {formatDate(cycle.period_end)}</p>
                      ) : null}
                    </div>
                    <div className="review-cycle-meta">
                      <span className={statusBadgeClass(cycle.status)}>{cycle.status}</span>
                      {cycleRevs.length > 0 && (
                        <span className="table-subtext">{submitted} / {cycleRevs.length} submitted</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
