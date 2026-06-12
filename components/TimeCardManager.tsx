"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, DollarSign, Plus, Send, ShieldCheck, Trash2, UserCheck, XCircle } from "lucide-react";
import {
  addEmployeeTimeEntry,
  assignEmployeeTimeCard,
  createWeeklyTimeCard,
  deleteEmployeeTimeEntry,
  reviewEmployeeTimeCard,
  submitEmployeeTimeCard,
  updateTimeCardPayrollRate,
} from "@/app/employee/time-cards/actions";
import {
  type EmployeeProfile,
  type EmployeeTimeCard,
  type EmployeeTimeCardPayroll,
  type EmployeeTimeEntry,
  type TimeCardCategory,
  type TimeCardRole,
  type TimeCardRoleCategory,
  type TimeCardRoleTask,
  type TimeCardTask,
} from "@/lib/company-data";

type TimeCardManagerProps = {
  currentUserId: string;
  currentWeekStart: string;
  isAdmin: boolean;
  canApproveTimeCards: boolean;
  profile: EmployeeProfile | null;
  roles: TimeCardRole[];
  categories: TimeCardCategory[];
  tasks: TimeCardTask[];
  roleCategories: TimeCardRoleCategory[];
  roleTasks: TimeCardRoleTask[];
  initialCards: EmployeeTimeCard[];
  initialEntries: EmployeeTimeEntry[];
  payrollRows: EmployeeTimeCardPayroll[];
  profiles: EmployeeProfile[];
  canViewPayroll: boolean;
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDate(date: string | null | undefined) {
  if (!date) {
    return "Unassigned";
  }

  return new Date(`${date}T12:00:00`).toLocaleDateString();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(value);
}

function sumHours(entries: EmployeeTimeEntry[]) {
  return entries.reduce((total, entry) => total + Number(entry.hours), 0);
}

export function TimeCardManager({
  currentUserId,
  currentWeekStart,
  isAdmin,
  canApproveTimeCards,
  profile,
  roles,
  categories,
  tasks,
  roleCategories,
  roleTasks,
  initialCards,
  initialEntries,
  payrollRows,
  profiles,
  canViewPayroll,
}: TimeCardManagerProps) {
  const [cards, setCards] = useState(initialCards);
  const [entries, setEntries] = useState(initialEntries);
  const [payroll, setPayroll] = useState(payrollRows);
  const [message, setMessage] = useState("");
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [statusFilter, setStatusFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const roleById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const profileByUserId = useMemo(() => new Map(profiles.map((item) => [item.user_id, item])), [profiles]);
  const payrollByCardId = useMemo(() => new Map(payroll.map((row) => [row.time_card_id, row])), [payroll]);
  const entriesByCardId = useMemo(() => {
    return entries.reduce<Record<string, EmployeeTimeEntry[]>>((accumulator, entry) => {
      accumulator[entry.time_card_id] = accumulator[entry.time_card_id] ?? [];
      accumulator[entry.time_card_id].push(entry);
      return accumulator;
    }, {});
  }, [entries]);

  const currentRole = profile?.time_card_role_id ? roleById.get(profile.time_card_role_id) : null;
  const allowedCategoryIds = useMemo(() => {
    if (!profile?.time_card_role_id) {
      return new Set<string>();
    }

    return new Set(
      roleCategories
        .filter((item) => item.role_id === profile.time_card_role_id)
        .map((item) => item.category_id),
    );
  }, [profile?.time_card_role_id, roleCategories]);

  const allowedTaskIds = useMemo(() => {
    if (!profile?.time_card_role_id) {
      return new Set<string>();
    }

    return new Set(roleTasks.filter((item) => item.role_id === profile.time_card_role_id).map((item) => item.task_id));
  }, [profile?.time_card_role_id, roleTasks]);

  const allowedTasks = useMemo(
    () => tasks.filter((task) => allowedTaskIds.has(task.id) && allowedCategoryIds.has(task.category_id)),
    [allowedCategoryIds, allowedTaskIds, tasks],
  );
  const allowedCategories = useMemo(() => {
    const categoryIdsWithTasks = new Set(allowedTasks.map((task) => task.category_id));
    return categories.filter((category) => allowedCategoryIds.has(category.id) && categoryIdsWithTasks.has(category.id));
  }, [allowedCategoryIds, allowedTasks, categories]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(allowedCategories[0]?.id ?? "");
  const tasksForSelectedCategory = allowedTasks.filter((task) => task.category_id === selectedCategoryId);
  const [selectedTaskId, setSelectedTaskId] = useState(tasksForSelectedCategory[0]?.id ?? "");

  useEffect(() => {
    if (!selectedCategoryId && allowedCategories[0]) {
      setSelectedCategoryId(allowedCategories[0].id);
    }
  }, [allowedCategories, selectedCategoryId]);

  useEffect(() => {
    const nextTask = tasksForSelectedCategory[0]?.id ?? "";
    if (!selectedTaskId || !tasksForSelectedCategory.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(nextTask);
    }
  }, [selectedTaskId, tasksForSelectedCategory]);

  const weekEnd = addDays(weekStart, 6);
  const ownCards = cards.filter((card) => card.employee_user_id === currentUserId);
  const currentWeekCard = ownCards.find((card) => card.week_start === currentWeekStart) ?? null;
  const currentWeekEntries = currentWeekCard ? entriesByCardId[currentWeekCard.id] ?? [] : [];
  const currentCard = ownCards.find((card) => card.week_start === weekStart) ?? null;
  const weeklyEntries = currentCard ? entriesByCardId[currentCard.id] ?? [] : [];
  const canEditCurrentCard = currentCard ? ["draft", "rejected"].includes(currentCard.status) : false;
  const timeEntrySetupReady = allowedCategories.length > 0 && allowedTasks.length > 0;

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      const cardEntries = entriesByCardId[card.id] ?? [];
      const employeeProfile = card.employee_user_id ? profileByUserId.get(card.employee_user_id) : null;
      return (
        (!statusFilter || card.status === statusFilter) &&
        (!employeeFilter || card.employee_user_id === employeeFilter || (employeeFilter === "unassigned" && !card.employee_user_id)) &&
        (!roleFilter || employeeProfile?.time_card_role_id === roleFilter) &&
        (!categoryFilter || cardEntries.some((entry) => entry.category_id === categoryFilter))
      );
    });
  }, [cards, categoryFilter, employeeFilter, entriesByCardId, profileByUserId, roleFilter, statusFilter]);

  async function createWeeklyCard() {
    setMessage("");
    if (!profile?.time_card_role_id) {
      setMessage("An admin must assign your time-card role before you can submit time.");
      return;
    }

    if (!timeEntrySetupReady) {
      setMessage("Your assigned time-card role needs at least one category and task before hours can be entered.");
      return;
    }

    setPendingAction("create-week");
    const { data, error } = await createWeeklyTimeCard({
      weekStart,
      weekEnd,
    });
    setPendingAction(null);

    if (error) {
      setMessage(error);
      return;
    }

    if (data) {
      setCards((current) => (current.some((card) => card.id === data.id) ? current : [data as EmployeeTimeCard, ...current]));
      setMessage("Time card created.");
    }
  }

  async function addEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!currentCard || !canEditCurrentCard) {
      return;
    }
    if (!timeEntrySetupReady || !selectedCategoryId || !selectedTaskId) {
      setMessage("Choose an available time-card category and task before adding an entry.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const workDate = String(formData.get("work_date") ?? "");
    const hours = Number(formData.get("hours") ?? 0);
    const notes = String(formData.get("notes") ?? "").trim();

    setPendingAction("add-entry");
    const { data, error } = await addEmployeeTimeEntry({
      timeCardId: currentCard.id,
      workDate,
      categoryId: selectedCategoryId,
      taskId: selectedTaskId,
      hours,
      notes,
    });
    setPendingAction(null);

    if (error) {
      setMessage(error);
      return;
    }

    if (data) {
      setEntries((current) => [...current, data as EmployeeTimeEntry]);
      setMessage("Entry added.");
      event.currentTarget.reset();
    }
  }

  async function deleteEntry(entry: EmployeeTimeEntry) {
    setMessage("");
    setPendingAction(`delete-${entry.id}`);
    const { error } = await deleteEmployeeTimeEntry({ entryId: entry.id });
    setPendingAction(null);
    if (error) {
      setMessage(error);
      return;
    }

    setEntries((current) => current.filter((item) => item.id !== entry.id));
  }

  async function submitCard(card: EmployeeTimeCard) {
    setMessage("");
    if ((entriesByCardId[card.id] ?? []).length === 0) {
      setMessage("Add at least one time entry before submitting.");
      return;
    }

    setPendingAction(`submit-${card.id}`);
    const { data, error } = await submitEmployeeTimeCard({ timeCardId: card.id });
    setPendingAction(null);

    if (error) {
      setMessage(error);
      return;
    }

    if (data) {
      setCards((current) => current.map((item) => (item.id === card.id ? (data as EmployeeTimeCard) : item)));
      setMessage("Time card submitted for approval.");
    }
  }

  async function reviewCard(card: EmployeeTimeCard, status: "approved" | "rejected", form: HTMLFormElement) {
    setMessage("");
    const formData = new FormData(form);
    const reviewNotes = String(formData.get("review_notes") ?? "").trim();
    setPendingAction(`${status}-${card.id}`);
    const { data, error } = await reviewEmployeeTimeCard({
      timeCardId: card.id,
      status,
      reviewNotes,
    });
    setPendingAction(null);

    if (error) {
      setMessage(error);
      return;
    }

    if (data) {
      setCards((current) => current.map((item) => (item.id === card.id ? (data as EmployeeTimeCard) : item)));
      setMessage(status === "approved" ? "Time card approved." : "Time card rejected.");
    }
  }

  async function assignCard(card: EmployeeTimeCard, employeeUserId: string) {
    setMessage("");
    setPendingAction(`assign-${card.id}`);
    const { data, error } = await assignEmployeeTimeCard({
      timeCardId: card.id,
      employeeUserId,
    });
    setPendingAction(null);

    if (error) {
      setMessage(error);
      return;
    }

    if (data) {
      setCards((current) => current.map((item) => (item.id === card.id ? (data as EmployeeTimeCard) : item)));
      setMessage("Time card assignment updated.");
    }
  }

  async function updatePayrollRate(row: EmployeeTimeCardPayroll, rate: number) {
    setMessage("");
    if (!canViewPayroll) {
      setMessage("Only owners can update payroll rates.");
      return;
    }

    setPendingAction(`payroll-${row.time_card_id}`);
    const { data, error } = await updateTimeCardPayrollRate({
      timeCardId: row.time_card_id,
      hourlyRate: rate,
      totalHours: Number(row.total_hours),
    });
    setPendingAction(null);

    if (error) {
      setMessage(error);
      return;
    }

    if (data) {
      setPayroll((current) => current.map((item) => (item.time_card_id === row.time_card_id ? (data as EmployeeTimeCardPayroll) : item)));
      setMessage("Payroll rate updated.");
    }
  }

  function displayEmployee(userId: string | null) {
    if (!userId) {
      return "Unassigned import";
    }

    const item = profileByUserId.get(userId);
    return item?.display_name || item?.email || userId.slice(0, 8);
  }

  function shiftWeek(days: number) {
    setWeekStart((current) => addDays(current, days));
  }

  function renderOwnTimeCardPanel() {
    if (!profile?.time_card_role_id) {
      return (
        <section className="portal-card">
          <UserCheck color="#c9932b" size={28} />
          <h3>Time-card role required</h3>
          <p>An admin must assign your employee profile to a time-card role before you can enter or submit hours.</p>
        </section>
      );
    }

    return (
      <>
        <div className="portal-grid">
          <section className="portal-card">
            <h3>Your time-card role</h3>
            <div className="metric" style={{ fontSize: "1.4rem" }}>
              {currentRole?.name ?? "Assigned"}
            </div>
          </section>
          <section className="portal-card">
            <h3>Current week hours</h3>
            <div className="metric">{sumHours(currentWeekEntries).toFixed(2)}</div>
          </section>
          <section className="portal-card">
            <h3>Current week status</h3>
            <div className={`metric time-card-status time-card-status-${currentWeekCard?.status ?? "missing"}`} style={{ fontSize: "1.4rem" }}>
              {currentWeekCard?.status ?? "Not created"}
            </div>
          </section>
        </div>

        {!timeEntrySetupReady ? (
          <section className="portal-card position-warning">
            <UserCheck color="#c9932b" size={28} />
            <h3>Time-card setup incomplete</h3>
            <p>Your assigned role does not have both categories and tasks available yet. Ask an admin to finish the role setup.</p>
          </section>
        ) : null}

        <section className="table-card time-card-panel">
          <div className="time-card-toolbar">
            <div>
              <h2>Weekly time card</h2>
              <p>
                {formatDate(weekStart)} to {formatDate(weekEnd)}
              </p>
            </div>
            <div className="time-card-create">
              <button className="button button-secondary button-neutral" onClick={() => shiftWeek(-7)} type="button">
                Previous
              </button>
              <input value={weekStart} onChange={(event) => setWeekStart(event.target.value)} type="date" />
              <button className="button button-secondary button-neutral" onClick={() => setWeekStart(currentWeekStart)} type="button">
                Current
              </button>
              <button className="button button-secondary button-neutral" onClick={() => shiftWeek(7)} type="button">
                Next
              </button>
              <button className="button button-primary" disabled={pendingAction === "create-week" || !timeEntrySetupReady} onClick={createWeeklyCard} type="button">
                <Plus size={17} />
                {pendingAction === "create-week" ? "Creating..." : "Create Week"}
              </button>
            </div>
          </div>

          {!currentCard ? (
            <div className="empty-state time-card-create-empty">
              <span>Create this week&apos;s time card to start logging hours.</span>
              <button className="button button-primary" disabled={pendingAction === "create-week" || !timeEntrySetupReady} onClick={createWeeklyCard} type="button">
                <Plus size={17} />
                {pendingAction === "create-week" ? "Creating..." : "Create Week"}
              </button>
            </div>
          ) : (
            <>
              <div className="time-entry-table">
                {weeklyEntries.length === 0 ? (
                  <div className="empty-state">No entries yet.</div>
                ) : (
                  weeklyEntries.map((entry) => (
                    <div className="time-entry-row" key={entry.id}>
                      <span>{formatDate(entry.work_date)}</span>
                      <span>{categoryById.get(entry.category_id)?.name ?? "Category"}</span>
                      <span>{taskById.get(entry.task_id)?.title ?? "Task"}</span>
                      <strong>{Number(entry.hours).toFixed(2)}</strong>
                      {canEditCurrentCard ? (
                        <button
                          className="icon-button"
                          disabled={pendingAction === `delete-${entry.id}`}
                          onClick={() => deleteEntry(entry)}
                          type="button"
                          aria-label="Delete time entry"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>

              {canEditCurrentCard ? (
                <form className="form-panel time-entry-form" onSubmit={addEntry}>
                  <h2>Add entry</h2>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="work_date">Date</label>
                      <input id="work_date" min={currentCard.week_start} max={currentCard.week_end} name="work_date" required type="date" defaultValue={currentCard.week_start} />
                    </div>
                    <div className="field">
                      <label htmlFor="category_id">Category</label>
                      <select
                        id="category_id"
                        value={selectedCategoryId}
                        onChange={(event) => setSelectedCategoryId(event.target.value)}
                      >
                        {allowedCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field-full">
                      <label htmlFor="task_id">Task</label>
                      <select id="task_id" value={selectedTaskId} onChange={(event) => setSelectedTaskId(event.target.value)}>
                        {tasksForSelectedCategory.map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="hours">Hours</label>
                      <input id="hours" max="24" min="0.25" name="hours" required step="0.25" type="number" />
                    </div>
                    <div className="field">
                      <label htmlFor="notes">Notes</label>
                      <input id="notes" name="notes" />
                    </div>
                    <button className="button button-primary" disabled={pendingAction === "add-entry" || !selectedTaskId || !timeEntrySetupReady} type="submit">
                      <Plus size={17} />
                      {pendingAction === "add-entry" ? "Adding..." : "Add Entry"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="empty-state">This time card is locked because it has been submitted or approved.</div>
              )}

              <div className="time-card-submit">
                <strong>Total: {sumHours(weeklyEntries).toFixed(2)} hours</strong>
                <button
                  className="button button-primary"
                  disabled={!canEditCurrentCard || weeklyEntries.length === 0 || pendingAction === `submit-${currentCard.id}`}
                  onClick={() => submitCard(currentCard)}
                  type="button"
                >
                  <Send size={17} />
                  {pendingAction === `submit-${currentCard.id}` ? "Submitting..." : "Submit Time Card"}
                </button>
              </div>
            </>
          )}
        </section>
      </>
    );
  }

  if (isAdmin) {
    const submittedCount = cards.filter((card) => card.status === "submitted").length;
    const totalApprovedHours = payroll
      .filter((row) => cards.find((card) => card.id === row.time_card_id)?.status === "approved")
      .reduce((total, row) => total + Number(row.total_hours), 0);
    const totalApprovedPay = payroll
      .filter((row) => cards.find((card) => card.id === row.time_card_id)?.status === "approved")
      .reduce((total, row) => total + Number(row.paid_value), 0);

    return (
      <div className="time-card-stack">
        {message ? <div className="success-box portal-alert">{message}</div> : null}
        <div className="portal-grid">
          <section className="portal-card">
            <Clock3 color="#c9932b" size={24} />
            <h3>Submitted cards</h3>
            <div className="metric">{submittedCount}</div>
          </section>
          <section className="portal-card">
            <ShieldCheck color="#c9932b" size={24} />
            <h3>Approved hours</h3>
            <div className="metric">{totalApprovedHours.toFixed(2)}</div>
          </section>
          {canViewPayroll ? (
            <section className="portal-card">
              <DollarSign color="#c9932b" size={24} />
              <h3>Approved payroll</h3>
              <div className="metric">{formatCurrency(totalApprovedPay)}</div>
            </section>
          ) : null}
        </div>

        <section className="table-card time-card-panel">
          <div className="filters">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}>
              <option value="">All employees</option>
              <option value="unassigned">Unassigned import</option>
              {profiles.map((item) => (
                <option key={item.user_id} value={item.user_id}>
                  {item.display_name || item.email || item.user_id.slice(0, 8)}
                </option>
              ))}
            </select>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="">All time-card roles</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="time-card-list">
            {filteredCards.length === 0 ? (
              <div className="empty-state">No time cards match the current filters.</div>
            ) : (
              filteredCards.map((card) => {
                const cardEntries = entriesByCardId[card.id] ?? [];
                const cardPayroll = payrollByCardId.get(card.id);
                const employeeProfile = card.employee_user_id ? profileByUserId.get(card.employee_user_id) : null;
                const roleName = employeeProfile?.time_card_role_id ? roleById.get(employeeProfile.time_card_role_id)?.name : "Unassigned";

                return (
                  <article className="time-card-review" key={card.id}>
                    <div className="portal-topline" style={{ marginBottom: 12 }}>
                      <div>
                        <h2>
                          {displayEmployee(card.employee_user_id)} - {formatDate(card.week_start)} to {formatDate(card.week_end)}
                        </h2>
                        <p>
                          {roleName} - {card.source === "excel_import" ? "Excel import" : "Portal entry"}
                        </p>
                      </div>
                      <span className="badge">{card.status}</span>
                    </div>

                    <div className="time-card-admin-grid">
                      <div className="form-grid">
                        <div className="field">
                          <label>Assign employee</label>
                          <select
                            value={card.employee_user_id ?? ""}
                            disabled={pendingAction === `assign-${card.id}`}
                            onChange={(event) => assignCard(card, event.target.value)}
                          >
                            <option value="">Unassigned import</option>
                            {profiles.map((item) => (
                              <option key={item.user_id} value={item.user_id}>
                                {item.display_name || item.email || item.user_id.slice(0, 8)}
                              </option>
                            ))}
                          </select>
                        </div>
                        {canViewPayroll && cardPayroll ? (
                          <div className="field">
                            <label>Hourly rate</label>
                            <input
                              min="0"
                              step="0.01"
                              type="number"
                              disabled={pendingAction === `payroll-${card.id}`}
                              defaultValue={cardPayroll.hourly_rate}
                              onBlur={(event) => updatePayrollRate(cardPayroll, Number(event.target.value || 0))}
                            />
                          </div>
                        ) : null}
                      </div>
                      <div className="payroll-kpis">
                        <span>{(cardPayroll?.total_hours ?? sumHours(cardEntries)).toFixed(2)} hours</span>
                        {canViewPayroll && cardPayroll ? <span>{formatCurrency(Number(cardPayroll.paid_value))}</span> : null}
                      </div>
                    </div>

                    <div className="time-entry-table">
                      {cardEntries.map((entry) => (
                        <div className="time-entry-row" key={entry.id}>
                          <span>{formatDate(entry.work_date)}</span>
                          <span>{categoryById.get(entry.category_id)?.name ?? "Category"}</span>
                          <span>{taskById.get(entry.task_id)?.title ?? "Task"}</span>
                          <strong>{Number(entry.hours).toFixed(2)}</strong>
                        </div>
                      ))}
                    </div>

                    {canApproveTimeCards ? (
                      <form
                        className="time-card-review-actions"
                        onSubmit={(event) => {
                          event.preventDefault();
                        }}
                      >
                        <div className="field">
                          <label htmlFor={`review-${card.id}`}>Review notes</label>
                          <textarea id={`review-${card.id}`} name="review_notes" defaultValue={card.review_notes ?? ""} />
                        </div>
                          <button
                            className="button button-primary"
                            disabled={pendingAction === `approved-${card.id}`}
                            type="button"
                            onClick={(event) => reviewCard(card, "approved", event.currentTarget.form!)}
                          >
                            <CheckCircle2 size={17} />
                            {pendingAction === `approved-${card.id}` ? "Approving..." : "Approve"}
                        </button>
                          <button
                            className="button button-danger"
                            disabled={pendingAction === `rejected-${card.id}`}
                            type="button"
                            onClick={(event) => reviewCard(card, "rejected", event.currentTarget.form!)}
                          >
                            <XCircle size={17} />
                            {pendingAction === `rejected-${card.id}` ? "Rejecting..." : "Reject"}
                        </button>
                      </form>
                    ) : (
                      <div className="empty-state">Only a super admin can approve or reject time cards.</div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>

        <div className="portal-topline" style={{ marginTop: 8 }}>
          <div>
            <div className="eyebrow">My Time Card</div>
            <h2>Enter your weekly hours</h2>
          </div>
        </div>
        {renderOwnTimeCardPanel()}
      </div>
    );
  }

  return (
    <div className="time-card-stack">
      {message ? <div className="success-box portal-alert">{message}</div> : null}
      {canViewPayroll && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <Link className="btn-primary" href="/employee/payroll" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <DollarSign size={15} /> Go to Payroll
          </Link>
        </div>
      )}
      {renderOwnTimeCardPanel()}
    </div>
  );
}
