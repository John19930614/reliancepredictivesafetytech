"use client";

import { useState, useMemo, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Calendar,
  Clock,
  MapPin,
  Users,
  CheckCircle,
  XCircle,
  AlertCircle,
  Edit2,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { CalendarEvent, CalendarEventAttendee, EmployeeProfile } from "@/lib/company-data";

type View = "month" | "week" | "day";

type EventFormData = {
  title: string;
  description: string;
  event_type: "meeting" | "time_off" | "holiday" | "other";
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  all_day: boolean;
  visibility: "private" | "company";
  location: string;
  attendee_ids: string[];
};

const EVENT_COLORS: Record<string, string> = {
  meeting: "#3b82f6",
  time_off: "#f97316",
  holiday: "#22c55e",
  other: "#8b5cf6",
};

const EVENT_LABELS: Record<string, string> = {
  meeting: "Meeting",
  time_off: "Time Off",
  holiday: "Holiday",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  confirmed: "#3b82f6",
  approved: "#22c55e",
  rejected: "#ef4444",
  cancelled: "#6b7280",
};

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatTimeInput(date: Date) {
  return date.toTimeString().slice(0, 5);
}

function toLocalISOString(dateStr: string, timeStr: string) {
  return new Date(`${dateStr}T${timeStr}:00`).toISOString();
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay();
  const days: (Date | null)[] = [];

  for (let i = 0; i < startOffset; i++) {
    days.push(null);
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  while (days.length % 7 !== 0) {
    days.push(null);
  }
  return days;
}

function getWeekDays(anchor: Date) {
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function eventOnDay(event: CalendarEvent, day: Date) {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);
  return start <= dayEnd && end >= dayStart;
}

function formatDisplayTime(isoString: string) {
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDisplayDate(isoString: string) {
  return new Date(isoString).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type CalendarManagerProps = {
  currentUserId: string;
  isAdmin: boolean;
  events: CalendarEvent[];
  attendees: CalendarEventAttendee[];
  profiles: EmployeeProfile[];
};

function defaultForm(date?: Date): EventFormData {
  const base = date ?? new Date();
  const end = new Date(base);
  end.setHours(end.getHours() + 1);
  return {
    title: "",
    description: "",
    event_type: "meeting",
    start_date: formatDateInput(base),
    start_time: formatTimeInput(base),
    end_date: formatDateInput(end),
    end_time: formatTimeInput(end),
    all_day: false,
    visibility: "company",
    location: "",
    attendee_ids: [],
  };
}

export function CalendarManager({ currentUserId, isAdmin, events: initialEvents, attendees: initialAttendees, profiles }: CalendarManagerProps) {
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [attendees, setAttendees] = useState<CalendarEventAttendee[]>(initialAttendees);
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<EventFormData>(defaultForm());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const supabase = createClient();

  const profileMap = useMemo(() => {
    const map: Record<string, EmployeeProfile> = {};
    for (const p of profiles) map[p.user_id] = p;
    return map;
  }, [profiles]);

  function getAttendeesForEvent(eventId: string) {
    return attendees.filter((a) => a.event_id === eventId);
  }

  function openCreate(date?: Date) {
    setEditingEvent(null);
    setForm(defaultForm(date));
    setError(null);
    setShowForm(true);
  }

  function openEdit(event: CalendarEvent) {
    const start = new Date(event.start_at);
    const end = new Date(event.end_at);
    const eventAttendees = getAttendeesForEvent(event.id);
    setEditingEvent(event);
    setForm({
      title: event.title,
      description: event.description ?? "",
      event_type: event.event_type as EventFormData["event_type"],
      start_date: formatDateInput(start),
      start_time: formatTimeInput(start),
      end_date: formatDateInput(end),
      end_time: formatTimeInput(end),
      all_day: event.all_day,
      visibility: event.visibility as EventFormData["visibility"],
      location: event.location ?? "",
      attendee_ids: eventAttendees.map((a) => a.user_id),
    });
    setError(null);
    setSelectedEvent(null);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!supabase) {
      setError("Database connection unavailable.");
      return;
    }

    const start_at = form.all_day
      ? new Date(`${form.start_date}T00:00:00`).toISOString()
      : toLocalISOString(form.start_date, form.start_time);
    const end_at = form.all_day
      ? new Date(`${form.end_date}T23:59:59`).toISOString()
      : toLocalISOString(form.end_date, form.end_time);

    if (new Date(end_at) < new Date(start_at)) {
      setError("End must be after start.");
      return;
    }

    startTransition(async () => {
      setError(null);
      if (editingEvent) {
        const { data, error: err } = await supabase
          .from("employee_calendar_events")
          .update({
            title: form.title.trim(),
            description: form.description.trim() || null,
            event_type: form.event_type,
            start_at,
            end_at,
            all_day: form.all_day,
            visibility: form.visibility,
            location: form.location.trim() || null,
          })
          .eq("id", editingEvent.id)
          .select()
          .single();

        if (err || !data) {
          setError(err?.message ?? "Failed to update event.");
          return;
        }

        // Sync attendees
        const existing = getAttendeesForEvent(editingEvent.id).map((a) => a.user_id);
        const toAdd = form.attendee_ids.filter((id) => !existing.includes(id));
        const toRemove = existing.filter((id) => !form.attendee_ids.includes(id));

        if (toRemove.length) {
          await supabase
            .from("employee_calendar_event_attendees")
            .delete()
            .eq("event_id", editingEvent.id)
            .in("user_id", toRemove);
        }
        if (toAdd.length) {
          await supabase
            .from("employee_calendar_event_attendees")
            .insert(toAdd.map((user_id) => ({ event_id: editingEvent.id, user_id })));
        }

        setEvents((prev) => prev.map((e) => (e.id === editingEvent.id ? (data as CalendarEvent) : e)));
        setAttendees((prev) => {
          const kept = prev.filter((a) => a.event_id !== editingEvent.id || form.attendee_ids.includes(a.user_id));
          const added = toAdd.map((user_id) => ({
            id: crypto.randomUUID(),
            event_id: editingEvent.id,
            user_id,
            status: "invited" as const,
            created_at: new Date().toISOString(),
          }));
          return [...kept, ...added];
        });
      } else {
        // Time off starts as pending; admins confirm directly
        const status = form.event_type === "time_off" && !isAdmin ? "pending" : "confirmed";

        const { data, error: err } = await supabase
          .from("employee_calendar_events")
          .insert({
            created_by: currentUserId,
            title: form.title.trim(),
            description: form.description.trim() || null,
            event_type: form.event_type,
            start_at,
            end_at,
            all_day: form.all_day,
            visibility: form.visibility,
            location: form.location.trim() || null,
            status,
          })
          .select()
          .single();

        if (err || !data) {
          setError(err?.message ?? "Failed to create event.");
          return;
        }

        const newEvent = data as CalendarEvent;
        setEvents((prev) => [...prev, newEvent]);

        if (form.attendee_ids.length) {
          const { data: newAttendees } = await supabase
            .from("employee_calendar_event_attendees")
            .insert(form.attendee_ids.map((user_id) => ({ event_id: newEvent.id, user_id })))
            .select();
          if (newAttendees) {
            setAttendees((prev) => [...prev, ...(newAttendees as CalendarEventAttendee[])]);
          }
        }
      }

      setShowForm(false);
      setEditingEvent(null);
    });
  }

  async function handleDelete(event: CalendarEvent) {
    if (!supabase) return;
    if (!confirm(`Delete "${event.title}"?`)) return;
    const { error: err } = await supabase.from("employee_calendar_events").delete().eq("id", event.id);
    if (err) { setError(err.message); return; }
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    setAttendees((prev) => prev.filter((a) => a.event_id !== event.id));
    setSelectedEvent(null);
  }

  async function handleApprove(event: CalendarEvent, approve: boolean) {
    if (!supabase) return;
    const { data, error: err } = await supabase
      .from("employee_calendar_events")
      .update({ status: approve ? "approved" : "rejected", approved_by: currentUserId, approved_at: new Date().toISOString() })
      .eq("id", event.id)
      .select()
      .single();
    if (err || !data) { setError(err?.message ?? "Failed."); return; }
    setEvents((prev) => prev.map((e) => (e.id === event.id ? (data as CalendarEvent) : e)));
    setSelectedEvent(data as CalendarEvent);
  }

  // Navigation
  function prev() {
    const d = new Date(anchor);
    if (view === "month") d.setMonth(d.getMonth() - 1);
    else if (view === "week") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setAnchor(d);
  }

  function next() {
    const d = new Date(anchor);
    if (view === "month") d.setMonth(d.getMonth() + 1);
    else if (view === "week") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setAnchor(d);
  }

  function goToday() {
    setAnchor(new Date());
  }

  function headerLabel() {
    if (view === "month") return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
    if (view === "week") {
      const days = getWeekDays(anchor);
      const first = days[0];
      const last = days[6];
      if (first.getMonth() === last.getMonth()) {
        return `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`;
      }
      return `${MONTH_NAMES[first.getMonth()]} – ${MONTH_NAMES[last.getMonth()]} ${last.getFullYear()}`;
    }
    return anchor.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  const today = new Date();

  // ─── Month View ────────────────────────────────────────────
  function renderMonthView() {
    const days = getMonthDays(anchor.getFullYear(), anchor.getMonth());

    return (
      <div className="cal-month-grid">
        {DAY_HEADERS.map((h) => (
          <div className="cal-day-header" key={h}>{h}</div>
        ))}
        {days.map((day, i) => {
          if (!day) return <div className="cal-day cal-day--filler" key={`filler-${i}`} />;
          const dayEvents = events.filter((e) => eventOnDay(e, day));
          const isToday = sameDay(day, today);
          return (
            <div
              className={`cal-day${isToday ? " cal-day--today" : ""}`}
              key={day.toISOString()}
              onClick={() => openCreate(day)}
            >
              <span className="cal-day-num">{day.getDate()}</span>
              <div className="cal-day-events">
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    className="cal-event-chip"
                    style={{ backgroundColor: EVENT_COLORS[ev.event_type] ?? "#6b7280" }}
                    onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                    title={ev.title}
                  >
                    {ev.all_day ? "" : <span className="cal-event-time">{formatDisplayTime(ev.start_at)}</span>}
                    <span className="cal-event-label">{ev.title}</span>
                    {ev.status === "pending" && <span className="cal-event-pending">•</span>}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span className="cal-event-more">+{dayEvents.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ─── Week View ─────────────────────────────────────────────
  function renderWeekView() {
    const weekDays = getWeekDays(anchor);
    return (
      <div className="cal-week-grid">
        {weekDays.map((day) => {
          const dayEvents = events.filter((e) => eventOnDay(e, day));
          const isToday = sameDay(day, today);
          return (
            <div
              className={`cal-week-col${isToday ? " cal-week-col--today" : ""}`}
              key={day.toISOString()}
              onClick={() => openCreate(day)}
            >
              <div className="cal-week-col-header">
                <span className="cal-week-day-name">{DAY_HEADERS[day.getDay()]}</span>
                <span className={`cal-week-day-num${isToday ? " cal-today-circle" : ""}`}>{day.getDate()}</span>
              </div>
              <div className="cal-week-events">
                {dayEvents.map((ev) => (
                  <button
                    key={ev.id}
                    className="cal-event-block"
                    style={{ backgroundColor: EVENT_COLORS[ev.event_type] ?? "#6b7280" }}
                    onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                  >
                    <span className="cal-event-block-title">{ev.title}</span>
                    {!ev.all_day && (
                      <span className="cal-event-block-time">{formatDisplayTime(ev.start_at)}</span>
                    )}
                    {ev.status === "pending" && <span className="cal-event-pending"> (Pending)</span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ─── Day View ──────────────────────────────────────────────
  function renderDayView() {
    const dayEvents = events.filter((e) => eventOnDay(e, anchor)).sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
    return (
      <div className="cal-day-view">
        {dayEvents.length === 0 ? (
          <div className="cal-day-empty">
            <Calendar size={40} style={{ opacity: 0.3 }} />
            <p>No events — click to add one</p>
          </div>
        ) : (
          dayEvents.map((ev) => (
            <button
              key={ev.id}
              className="cal-day-event-row"
              style={{ borderLeftColor: EVENT_COLORS[ev.event_type] ?? "#6b7280" }}
              onClick={() => setSelectedEvent(ev)}
            >
              <div className="cal-day-event-time">
                {ev.all_day ? "All day" : (
                  <>{formatDisplayTime(ev.start_at)}<br />{formatDisplayTime(ev.end_at)}</>
                )}
              </div>
              <div className="cal-day-event-info">
                <strong>{ev.title}</strong>
                {ev.location && <span><MapPin size={12} /> {ev.location}</span>}
                <span
                  className="cal-status-badge"
                  style={{ backgroundColor: STATUS_COLORS[ev.status] ?? "#6b7280" }}
                >
                  {ev.status}
                </span>
              </div>
            </button>
          ))
        )}
        <button className="cal-add-day-btn" onClick={() => openCreate(anchor)}>
          <Plus size={16} /> Add event
        </button>
      </div>
    );
  }

  // ─── Event Detail Modal ────────────────────────────────────
  function renderDetailModal() {
    if (!selectedEvent) return null;
    const ev = selectedEvent;
    const isOwner = ev.created_by === currentUserId;
    const eventAttendees = getAttendeesForEvent(ev.id);
    const creator = profileMap[ev.created_by];

    return (
      <div className="modal-backdrop" onClick={() => setSelectedEvent(null)}>
        <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
          <div className="modal-header" style={{ borderTop: `4px solid ${EVENT_COLORS[ev.event_type]}` }}>
            <div>
              <span className="eyebrow" style={{ color: EVENT_COLORS[ev.event_type] }}>
                {EVENT_LABELS[ev.event_type]}
              </span>
              <h2 style={{ marginTop: 2, marginBottom: 0 }}>{ev.title}</h2>
            </div>
            <button className="btn-icon" onClick={() => setSelectedEvent(null)}><X size={18} /></button>
          </div>

          <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="cal-detail-row">
              <Clock size={15} />
              <span>
                {ev.all_day ? (
                  <>All day · {new Date(ev.start_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                  {!sameDay(new Date(ev.start_at), new Date(ev.end_at)) && ` – ${new Date(ev.end_at).toLocaleDateString([], { month: "short", day: "numeric" })}`}</>
                ) : (
                  <>{formatDisplayDate(ev.start_at)}<br />{formatDisplayTime(ev.start_at)} – {formatDisplayTime(ev.end_at)}</>
                )}
              </span>
            </div>

            {ev.location && (
              <div className="cal-detail-row">
                <MapPin size={15} />
                <span>{ev.location}</span>
              </div>
            )}

            {ev.description && (
              <div className="cal-detail-row" style={{ alignItems: "flex-start" }}>
                <Calendar size={15} style={{ marginTop: 2 }} />
                <span style={{ whiteSpace: "pre-wrap" }}>{ev.description}</span>
              </div>
            )}

            {eventAttendees.length > 0 && (
              <div className="cal-detail-row" style={{ alignItems: "flex-start" }}>
                <Users size={15} style={{ marginTop: 2 }} />
                <div>
                  {eventAttendees.map((a) => {
                    const p = profileMap[a.user_id];
                    return (
                      <div key={a.user_id} style={{ fontSize: "0.85rem" }}>
                        {p?.display_name ?? p?.email ?? a.user_id.slice(0, 8)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                className="cal-status-badge"
                style={{ backgroundColor: STATUS_COLORS[ev.status] ?? "#6b7280", fontSize: "0.8rem", padding: "2px 8px", borderRadius: 12 }}
              >
                {ev.status}
              </span>
              <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>
                by {creator?.display_name ?? creator?.email ?? "Unknown"}
              </span>
            </div>

            {/* Admin approval for pending time-off */}
            {isAdmin && ev.event_type === "time_off" && ev.status === "pending" && (
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button className="btn btn-success" onClick={() => handleApprove(ev, true)}>
                  <CheckCircle size={15} /> Approve
                </button>
                <button className="btn btn-danger" onClick={() => handleApprove(ev, false)}>
                  <XCircle size={15} /> Reject
                </button>
              </div>
            )}
          </div>

          {(isOwner || isAdmin) && (
            <div className="modal-footer" style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => openEdit(ev)}>
                <Edit2 size={15} /> Edit
              </button>
              {isOwner && (
                <button className="btn btn-danger" onClick={() => handleDelete(ev)}>
                  <Trash2 size={15} /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Create/Edit Form Modal ────────────────────────────────
  function renderFormModal() {
    if (!showForm) return null;
    const otherProfiles = profiles.filter((p) => p.user_id !== currentUserId);

    return (
      <div className="modal-backdrop" onClick={() => setShowForm(false)}>
        <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
          <div className="modal-header">
            <h2>{editingEvent ? "Edit Event" : "New Event"}</h2>
            <button className="btn-icon" onClick={() => setShowForm(false)}><X size={18} /></button>
          </div>

          <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {error && (
              <div className="alert alert-error">
                <AlertCircle size={15} /> {error}
              </div>
            )}

            <div className="form-field">
              <label className="form-label">Title *</label>
              <input
                className="form-input"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Event title"
                autoFocus
              />
            </div>

            <div className="form-field-row">
              <div className="form-field">
                <label className="form-label">Type</label>
                <select
                  className="form-select"
                  value={form.event_type}
                  onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value as EventFormData["event_type"] }))}
                >
                  <option value="meeting">Meeting</option>
                  <option value="time_off">Time Off</option>
                  <option value="holiday">Holiday</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">Visibility</label>
                <select
                  className="form-select"
                  value={form.visibility}
                  onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value as EventFormData["visibility"] }))}
                >
                  <option value="company">Company</option>
                  <option value="private">Private</option>
                </select>
              </div>
            </div>

            <div className="form-field">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.9rem" }}>
                <input
                  type="checkbox"
                  checked={form.all_day}
                  onChange={(e) => setForm((f) => ({ ...f, all_day: e.target.checked }))}
                />
                All day
              </label>
            </div>

            <div className="form-field-row">
              <div className="form-field">
                <label className="form-label">Start Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value, end_date: e.target.value }))}
                />
              </div>
              {!form.all_day && (
                <div className="form-field">
                  <label className="form-label">Start Time</label>
                  <input
                    type="time"
                    className="form-input"
                    value={form.start_time}
                    onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <div className="form-field-row">
              <div className="form-field">
                <label className="form-label">End Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
              {!form.all_day && (
                <div className="form-field">
                  <label className="form-label">End Time</label>
                  <input
                    type="time"
                    className="form-input"
                    value={form.end_time}
                    onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <div className="form-field">
              <label className="form-label">Location (optional)</label>
              <input
                className="form-input"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Room, address, or video link"
              />
            </div>

            <div className="form-field">
              <label className="form-label">Description (optional)</label>
              <textarea
                className="form-input"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Add details…"
              />
            </div>

            {form.event_type === "meeting" && otherProfiles.length > 0 && (
              <div className="form-field">
                <label className="form-label">Invite Attendees</label>
                <div className="cal-attendee-list">
                  {otherProfiles.map((p) => (
                    <label key={p.user_id} className="cal-attendee-item">
                      <input
                        type="checkbox"
                        checked={form.attendee_ids.includes(p.user_id)}
                        onChange={(e) => {
                          setForm((f) => ({
                            ...f,
                            attendee_ids: e.target.checked
                              ? [...f.attendee_ids, p.user_id]
                              : f.attendee_ids.filter((id) => id !== p.user_id),
                          }));
                        }}
                      />
                      <span>{p.display_name ?? p.email}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {form.event_type === "time_off" && !isAdmin && (
              <p className="cal-info-note">
                <AlertCircle size={14} /> Time off requests require admin approval before appearing as confirmed.
              </p>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving…" : editingEvent ? "Save Changes" : "Create Event"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pendingCount = events.filter((e) => e.event_type === "time_off" && e.status === "pending").length;

  return (
    <div className="cal-container">
      {/* Toolbar */}
      <div className="cal-toolbar">
        <div className="cal-toolbar-left">
          <button className="btn btn-secondary cal-today-btn" onClick={goToday}>Today</button>
          <button className="btn-icon" type="button" aria-label={`Previous ${view}`} title={`Previous ${view}`} onClick={prev}><ChevronLeft size={18} /></button>
          <button className="btn-icon" type="button" aria-label={`Next ${view}`} title={`Next ${view}`} onClick={next}><ChevronRight size={18} /></button>
          <h2 className="cal-header-label">{headerLabel()}</h2>
        </div>

        <div className="cal-toolbar-right">
          {isAdmin && pendingCount > 0 && (
            <span className="cal-pending-badge">{pendingCount} pending approval</span>
          )}

          <div className="cal-view-switcher">
            {(["month", "week", "day"] as View[]).map((v) => (
              <button
                key={v}
                className={`cal-view-btn${view === v ? " cal-view-btn--active" : ""}`}
                onClick={() => setView(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          <button className="btn btn-primary" onClick={() => openCreate()}>
            <Plus size={16} /> New Event
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="cal-legend">
        {Object.entries(EVENT_LABELS).map(([type, label]) => (
          <span key={type} className="cal-legend-item">
            <span className="cal-legend-dot" style={{ backgroundColor: EVENT_COLORS[type] }} />
            {label}
          </span>
        ))}
      </div>

      {/* Calendar Views */}
      <div className="cal-view-area">
        {view === "month" && renderMonthView()}
        {view === "week" && renderWeekView()}
        {view === "day" && renderDayView()}
      </div>

      {renderDetailModal()}
      {renderFormModal()}

      <style>{`
        .cal-container {
          display: flex;
          flex-direction: column;
          gap: 0;
          height: calc(100vh - 140px);
          min-height: 600px;
        }

        .cal-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          border-bottom: 1px solid var(--border);
          background: var(--surface);
          flex-shrink: 0;
          flex-wrap: wrap;
          gap: 10px;
        }

        .cal-toolbar-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .cal-toolbar-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .cal-today-btn {
          font-size: 0.82rem;
          padding: 5px 12px;
        }

        .cal-header-label {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 600;
          min-width: 180px;
        }

        .cal-pending-badge {
          background: #f59e0b22;
          color: #d97706;
          border: 1px solid #f59e0b44;
          border-radius: 12px;
          padding: 3px 10px;
          font-size: 0.78rem;
          font-weight: 500;
        }

        .cal-view-switcher {
          display: flex;
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
        }

        .cal-view-btn {
          background: var(--surface);
          border: none;
          padding: 5px 14px;
          font-size: 0.82rem;
          cursor: pointer;
          color: var(--text-secondary);
          transition: background 0.15s;
        }

        .cal-view-btn:not(:last-child) {
          border-right: 1px solid var(--border);
        }

        .cal-view-btn:hover {
          background: var(--surface-hover, #f3f4f6);
        }

        .cal-view-btn--active {
          background: var(--primary, #2563eb);
          color: #fff;
          font-weight: 500;
        }

        .cal-legend {
          display: flex;
          gap: 16px;
          padding: 8px 20px;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          flex-wrap: wrap;
        }

        .cal-legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .cal-legend-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .cal-view-area {
          flex: 1;
          overflow: auto;
          background: var(--bg);
        }

        /* ── Month View ── */
        .cal-month-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          border-left: 1px solid var(--border);
          border-top: 1px solid var(--border);
          min-height: 100%;
        }

        .cal-day-header {
          background: var(--surface);
          text-align: center;
          padding: 8px 4px;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
          border-right: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .cal-day {
          border-right: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          padding: 6px;
          min-height: 100px;
          cursor: pointer;
          transition: background 0.1s;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .cal-day:hover {
          background: var(--surface-hover, #f8f9fa);
        }

        .cal-day--filler {
          background: var(--surface);
          opacity: 0.4;
        }

        .cal-day--today .cal-day-num {
          background: var(--primary, #2563eb);
          color: #fff;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .cal-day-num {
          font-size: 0.82rem;
          font-weight: 500;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .cal-day-events {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
          overflow: hidden;
        }

        .cal-event-chip {
          display: flex;
          align-items: center;
          gap: 3px;
          border: none;
          border-radius: 4px;
          padding: 2px 5px;
          color: #fff;
          font-size: 0.72rem;
          cursor: pointer;
          text-align: left;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          width: 100%;
        }

        .cal-event-time {
          opacity: 0.85;
          flex-shrink: 0;
        }

        .cal-event-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cal-event-pending {
          flex-shrink: 0;
          opacity: 0.9;
        }

        .cal-event-more {
          font-size: 0.7rem;
          color: var(--text-secondary);
          padding-left: 4px;
        }

        /* ── Week View ── */
        .cal-week-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          border-left: 1px solid var(--border);
          min-height: 100%;
        }

        .cal-week-col {
          border-right: 1px solid var(--border);
          cursor: pointer;
          transition: background 0.1s;
          display: flex;
          flex-direction: column;
        }

        .cal-week-col:hover {
          background: var(--surface-hover, #f8f9fa);
        }

        .cal-week-col--today {
          background: #eff6ff;
        }

        .cal-week-col-header {
          padding: 10px 8px 8px;
          text-align: center;
          border-bottom: 1px solid var(--border);
          background: var(--surface);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .cal-week-day-name {
          font-size: 0.72rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-secondary);
        }

        .cal-week-day-num {
          font-size: 1rem;
          font-weight: 600;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .cal-today-circle {
          background: var(--primary, #2563eb);
          color: #fff;
          border-radius: 50%;
        }

        .cal-week-events {
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          flex: 1;
        }

        .cal-event-block {
          border: none;
          border-radius: 5px;
          padding: 4px 7px;
          color: #fff;
          font-size: 0.78rem;
          cursor: pointer;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .cal-event-block-title {
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cal-event-block-time {
          opacity: 0.85;
          font-size: 0.7rem;
        }

        /* ── Day View ── */
        .cal-day-view {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 700px;
        }

        .cal-day-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 60px 0;
          color: var(--text-secondary);
        }

        .cal-day-event-row {
          background: var(--surface);
          border: 1px solid var(--border);
          border-left: 4px solid var(--primary, #2563eb);
          border-radius: 6px;
          padding: 10px 14px;
          display: flex;
          gap: 16px;
          cursor: pointer;
          text-align: left;
          transition: box-shadow 0.15s;
        }

        .cal-day-event-row:hover {
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }

        .cal-day-event-time {
          font-size: 0.78rem;
          color: var(--text-secondary);
          min-width: 60px;
          flex-shrink: 0;
          line-height: 1.4;
        }

        .cal-day-event-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .cal-day-event-info strong {
          font-size: 0.95rem;
        }

        .cal-day-event-info span {
          font-size: 0.8rem;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .cal-add-day-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: 1px dashed var(--border);
          border-radius: 6px;
          padding: 10px 14px;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 0.85rem;
          transition: border-color 0.15s, color 0.15s;
        }

        .cal-add-day-btn:hover {
          border-color: var(--primary, #2563eb);
          color: var(--primary, #2563eb);
        }

        /* ── Status Badge ── */
        .cal-status-badge {
          color: #fff;
          border-radius: 10px;
          padding: 2px 8px;
          font-size: 0.74rem;
          font-weight: 500;
          text-transform: capitalize;
          display: inline-block;
        }

        /* ── Detail Modal ── */
        .cal-detail-row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.88rem;
          color: var(--text);
        }

        .cal-detail-row svg {
          flex-shrink: 0;
          color: var(--text-secondary);
        }

        /* ── Form Helpers ── */
        .form-field-row {
          display: flex;
          gap: 12px;
        }

        .form-field-row .form-field {
          flex: 1;
        }

        .cal-attendee-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 160px;
          overflow-y: auto;
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 8px;
        }

        .cal-attendee-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          cursor: pointer;
        }

        .cal-info-note {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.82rem;
          color: #d97706;
          background: #fffbeb;
          border: 1px solid #fcd34d;
          border-radius: 6px;
          padding: 8px 12px;
          margin: 0;
        }
      `}</style>
    </div>
  );
}
