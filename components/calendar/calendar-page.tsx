"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  GripVertical,
  ListTodo,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat2,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  createCalendarCategoryAction,
  deleteCalendarCategoryAction,
  deleteCalendarItemAction,
  saveCalendarItemAction,
  toggleCalendarTaskAction,
  updateCalendarCategoryAction,
} from "@/app/calendar/actions";
import { addDays, dateKey, expandOccurrences, monthGrid, parseDateKey, startOfMondayWeek, toLocalDateTimeValue } from "@/lib/calendar-dates";
import { CATEGORY_COLORS, type CalendarCategory, type CalendarItem, type CalendarItemInput, type CalendarOccurrence, type CalendarView } from "@/lib/calendar-types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const formatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

type DragPayload = { kind: "item"; occurrence: CalendarOccurrence } | { kind: "draft"; item: CalendarItem };

function itemInput(item: CalendarItem): CalendarItemInput {
  return {
    id: item.id,
    categoryId: item.categoryId,
    type: item.type,
    title: item.title,
    description: item.description ?? "",
    isDraft: item.isDraft,
    isCompleted: item.isCompleted,
    allDay: item.allDay,
    startDate: item.startDate,
    endDate: item.endDate,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    timeZone: item.timeZone,
    notificationOffset: item.notificationOffset,
    recurrenceFrequency: item.recurrenceFrequency,
    recurrenceEndMode: item.recurrenceEndMode,
    recurrenceEndDate: item.recurrenceEndDate,
    recurrenceCount: item.recurrenceCount,
  };
}

function newItem(date = new Date(), minutes?: number): CalendarItemInput {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const scheduledMinutes = minutes ?? (dateKey(date) === dateKey(new Date()) ? Math.min(1380, Math.ceil((date.getHours() * 60 + date.getMinutes()) / 30) * 30) : 9 * 60);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(scheduledMinutes / 60), scheduledMinutes % 60);
  const end = new Date(start.getTime() + 3_600_000);
  return {
    categoryId: null, type: "task", title: "", description: "", isDraft: false, allDay: false,
    startDate: null, endDate: null, startsAt: toLocalDateTimeValue(start), endsAt: toLocalDateTimeValue(end), timeZone: zone,
    notificationOffset: 10, recurrenceFrequency: "none", recurrenceEndMode: "never", recurrenceEndDate: null, recurrenceCount: null,
  };
}

function getSeriesScope(item: CalendarItem, verb: string): "occurrence" | "series" {
  if (item.recurrenceFrequency === "none") return "series";
  return window.confirm(`${verb} only this occurrence?\n\nChoose OK for this occurrence, or Cancel for the entire series.`) ? "occurrence" : "series";
}

export function CalendarPage({ initialCategories, initialItems, defaultView, browserReminders }: { initialCategories: CalendarCategory[]; initialItems: CalendarItem[]; defaultView: CalendarView; browserReminders: boolean }) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [items, setItems] = useState(initialItems);
  const [view, setView] = useState<CalendarView>(defaultView);
  const [anchor, setAnchor] = useState(() => new Date());
  const [editor, setEditor] = useState<{ form: CalendarItemInput; occurrence?: CalendarOccurrence } | null>(null);
  const [categoryManager, setCategoryManager] = useState(false);
  const [draftDrawer, setDraftDrawer] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const touchDrag = useRef<DragPayload | null>(null);

  useEffect(() => setCategories(initialCategories), [initialCategories]);
  useEffect(() => setItems(initialItems), [initialItems]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 4200);
    return () => window.clearTimeout(timer);
  }, [message]);

  const visibleRange = useMemo(() => {
    if (view === "month") {
      const days = monthGrid(anchor);
      return { start: days[0], end: addDays(days[41], 1) };
    }
    if (view === "day") {
      const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
      return { start, end: addDays(start, 1) };
    }
    const start = startOfMondayWeek(anchor);
    return { start, end: addDays(start, 7) };
  }, [anchor, view]);
  const occurrences = useMemo(() => expandOccurrences(items, visibleRange.start, visibleRange.end), [items, visibleRange]);
  const drafts = items.filter((item) => item.isDraft);

  useEffect(() => {
    if (!browserReminders || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const now = new Date();
    const horizon = new Date(now.getTime() + 48 * 3_600_000);
    const reminderOccurrences = expandOccurrences(items, now, horizon).filter((entry) => entry.type === "reminder");
    const timers: number[] = [];
    reminderOccurrences.forEach((entry) => {
      const alertAt = entry.occurrenceStart.getTime() - (entry.notificationOffset ?? 0) * 60_000;
      const delay = alertAt - Date.now();
      const storageKey = `flowspace-alert:${entry.occurrenceKey}:${entry.notificationOffset ?? 0}`;
      if (delay > 0 && delay <= 2_147_000_000 && !localStorage.getItem(storageKey)) {
        timers.push(window.setTimeout(() => {
          new Notification(entry.title, { body: entry.description || "A Flowspace reminder is due." });
          localStorage.setItem(storageKey, new Date().toISOString());
        }, delay));
      }
    });
    return () => timers.forEach(window.clearTimeout);
  }, [items, browserReminders]);

  function categoryFor(item: CalendarItem) {
    return categories.find((category) => category.id === item.categoryId);
  }

  function runMutation(action: () => Promise<void>, success?: string) {
    startTransition(async () => {
      try {
        await action();
        if (success) setMessage(success);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
        router.refresh();
      }
    });
  }

  function openCreate(date: Date, minutes?: number) {
    const form = newItem(date, minutes);
    form.categoryId = categories[0]?.id ?? null;
    setEditor({ form });
  }

  function openOccurrence(occurrence: CalendarOccurrence) {
    const form = itemInput(occurrence);
    if (occurrence.allDay) {
      form.startDate = dateKey(occurrence.occurrenceStart);
      form.endDate = dateKey(occurrence.occurrenceEnd);
    } else {
      form.startsAt = toLocalDateTimeValue(occurrence.occurrenceStart);
      form.endsAt = toLocalDateTimeValue(occurrence.occurrenceEnd);
    }
    setEditor({ form, occurrence });
  }

  function openDraft(item: CalendarItem) {
    setEditor({ form: itemInput(item) });
  }

  function quickAddDraft(title: string) {
    const form = newItem();
    form.title = title;
    form.categoryId = categories[0]?.id ?? null;
    form.isDraft = true;
    form.startDate = null;
    form.endDate = null;
    form.startsAt = null;
    form.endsAt = null;
    runMutation(() => saveCalendarItemAction(form), "Draft task added.");
  }

  async function requestReminderPermission() {
    if (typeof Notification === "undefined") {
      setMessage("Browser notifications are not supported here. The reminder was still saved.");
      return;
    }
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission !== "granted") setMessage("Reminder saved, but browser notifications are disabled.");
  }

  function saveEditor(event: FormEvent, asDraft = false) {
    event.preventDefault();
    if (!editor) return;
    const form: CalendarItemInput = { ...editor.form, isDraft: asDraft };
    if (form.recurrenceFrequency !== "none") {
      form.recurrenceEndMode = "never";
      form.recurrenceEndDate = null;
      form.recurrenceCount = null;
    }
    if (!form.allDay && !asDraft) {
      form.startsAt = form.startsAt ? new Date(form.startsAt).toISOString() : null;
      form.endsAt = form.endsAt ? new Date(form.endsAt).toISOString() : null;
    }
    const scope = editor.occurrence ? getSeriesScope(editor.occurrence, "Apply this change to") : "series";
    if (form.type === "reminder" && !asDraft) void requestReminderPermission();
    setEditor(null);
    runMutation(() => saveCalendarItemAction(form, editor.occurrence?.originalStart, scope), asDraft ? "Task saved to drafts." : "Calendar updated.");
  }

  function removeEditor() {
    if (!editor?.form.id) return;
    if (!window.confirm("Delete this calendar item?")) return;
    const scope = editor.occurrence ? getSeriesScope(editor.occurrence, "Delete") : "series";
    const id = editor.form.id;
    const original = editor.occurrence?.originalStart;
    setEditor(null);
    runMutation(() => deleteCalendarItemAction(id, original, scope), "Item deleted.");
  }

  function startNativeDrag(event: DragEvent, payload: DragPayload) {
    setDragging(payload);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", payload.kind === "draft" ? `draft:${payload.item.id}` : payload.occurrence.occurrenceKey);
  }

  function startTouchDrag(event: ReactPointerEvent, payload: DragPayload) {
    if (event.pointerType === "mouse") return;
    touchDrag.current = payload;
    setDragging(payload);
    const finish = (pointerEvent: PointerEvent) => {
      const target = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)?.closest<HTMLElement>("[data-drop-date]");
      if (target?.dataset.dropDate) {
        let minutes = target.dataset.dropMinutes ? Number(target.dataset.dropMinutes) : undefined;
        if (target.classList.contains("week-day-column")) {
          const rect = target.getBoundingClientRect();
          minutes = Math.max(0, Math.min(1410, Math.round(((pointerEvent.clientY - rect.top) / 0.8) / 30) * 30));
        }
        void dropPayload(payload, parseDateKey(target.dataset.dropDate), minutes);
      }
      touchDrag.current = null;
      setDragging(null);
      window.removeEventListener("pointerup", finish);
    };
    window.addEventListener("pointerup", finish, { once: true });
  }

  async function dropPayload(payload: DragPayload, date: Date, minutes?: number) {
    const source = payload.kind === "draft" ? payload.item : payload.occurrence;
    const form = itemInput(source);
    form.isDraft = false;
    if (minutes === undefined) {
      form.allDay = true;
      form.startDate = dateKey(date);
      const durationDays = payload.kind === "item" && source.allDay
        ? Math.max(1, Math.round((payload.occurrence.occurrenceEnd.getTime() - payload.occurrence.occurrenceStart.getTime()) / 86_400_000))
        : 1;
      form.endDate = dateKey(addDays(date, durationDays));
      form.startsAt = null;
      form.endsAt = null;
    } else {
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60);
      const sourceDuration = payload.kind === "item" && !source.allDay
        ? payload.occurrence.occurrenceEnd.getTime() - payload.occurrence.occurrenceStart.getTime()
        : 3_600_000;
      form.allDay = false;
      form.startDate = null;
      form.endDate = null;
      form.startsAt = start.toISOString();
      form.endsAt = new Date(start.getTime() + sourceDuration).toISOString();
    }
    const scope = payload.kind === "item" ? getSeriesScope(source, "Move") : "series";
    setDragging(null);
    runMutation(() => saveCalendarItemAction(form, payload.kind === "item" ? payload.occurrence.originalStart : undefined, scope), "Item rescheduled.");
  }

  function handleDrop(event: DragEvent, date: Date, minutes?: number) {
    event.preventDefault();
    if (dragging) void dropPayload(dragging, date, minutes);
  }

  function navigate(amount: number) {
    const next = new Date(anchor);
    if (view === "month") next.setMonth(next.getMonth() + amount);
    else next.setDate(next.getDate() + amount * (view === "day" ? 1 : 7));
    setAnchor(next);
  }

  const title = view === "month"
    ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : `${visibleRange.start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(visibleRange.end, -1).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="calendar-content">
      <section className="calendar-heading">
        <div><p>PLAN WITH CLARITY</p><h1>Calendar</h1><span>Shape your week, one thoughtful block at a time.</span></div>
        <button className="calendar-primary" onClick={() => openCreate(new Date())}><Plus size={16} /> New item</button>
      </section>

      <section className="calendar-toolbar" aria-label="Calendar controls">
        <div className="calendar-nav-controls">
          <button className="calendar-today" onClick={() => setAnchor(new Date())}>Today</button>
          <button aria-label="Previous period" onClick={() => navigate(-1)}><ChevronLeft size={17} /></button>
          <button aria-label="Next period" onClick={() => navigate(1)}><ChevronRight size={17} /></button>
          <h2>{view === "day" ? anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : title}</h2>
        </div>
        <div className="calendar-toolbar-right">
          <button className="draft-mobile-trigger" onClick={() => setDraftDrawer(true)}><ListTodo size={15} /> Drafts <span>{drafts.length}</span></button>
          <div className="view-switcher" aria-label="Calendar view">
            <button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>Month</button>
            <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Week</button>
            <button className={view === "day" ? "active" : ""} onClick={() => setView("day")}>Day</button>
          </div>
        </div>
      </section>

      <div className="calendar-layout">
        <section className={`calendar-surface ${dragging ? "is-dragging" : ""}`}>
          {view === "month" ? (
            <MonthView anchor={anchor} occurrences={occurrences} categories={categories} expandedDay={expandedDay} setExpandedDay={setExpandedDay} openCreate={openCreate} openOccurrence={openOccurrence} startNativeDrag={startNativeDrag} startTouchDrag={startTouchDrag} handleDrop={handleDrop} toggleTask={(occurrence) => {
              setItems((current) => current.map((item) => item.id === occurrence.id ? { ...item, isCompleted: !item.isCompleted } : item));
              runMutation(() => toggleCalendarTaskAction(occurrence.id, !occurrence.isCompleted));
            }} />
          ) : (
            <WeekView start={visibleRange.start} dayCount={view === "day" ? 1 : 7} occurrences={occurrences} categories={categories} openCreate={openCreate} openOccurrence={openOccurrence} startNativeDrag={startNativeDrag} startTouchDrag={startTouchDrag} handleDrop={handleDrop} toggleTask={(occurrence) => {
              setItems((current) => current.map((item) => item.id === occurrence.id ? { ...item, isCompleted: !item.isCompleted } : item));
              runMutation(() => toggleCalendarTaskAction(occurrence.id, !occurrence.isCompleted));
            }} />
          )}
        </section>
        <DraftPanel drafts={drafts} categories={categories} className="draft-desktop" onQuickAdd={quickAddDraft} onEdit={openDraft} startNativeDrag={startNativeDrag} startTouchDrag={startTouchDrag} />
      </div>

      {draftDrawer && <div className="draft-drawer-backdrop" onMouseDown={() => setDraftDrawer(false)}><aside className="draft-drawer" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" aria-label="Close drafts" onClick={() => setDraftDrawer(false)}><X size={17} /></button><DraftPanel drafts={drafts} categories={categories} onQuickAdd={quickAddDraft} onEdit={(item) => { setDraftDrawer(false); openDraft(item); }} startNativeDrag={startNativeDrag} startTouchDrag={startTouchDrag} /></aside></div>}
      {editor && <ItemEditor editor={editor} setEditor={setEditor} categories={categories} onSubmit={saveEditor} onDelete={removeEditor} onManageCategories={() => setCategoryManager(true)} pending={isPending} />}
      {categoryManager && <CategoryManager categories={categories} close={() => setCategoryManager(false)} runMutation={runMutation} />}
      {message && <div className="calendar-toast" role="status"><CircleAlert size={16} />{message}</div>}
    </div>
  );
}

type ViewProps = {
  occurrences: CalendarOccurrence[];
  categories: CalendarCategory[];
  openCreate: (date: Date, minutes?: number) => void;
  openOccurrence: (occurrence: CalendarOccurrence) => void;
  startNativeDrag: (event: DragEvent, payload: DragPayload) => void;
  startTouchDrag: (event: ReactPointerEvent, payload: DragPayload) => void;
  handleDrop: (event: DragEvent, date: Date, minutes?: number) => void;
  toggleTask: (occurrence: CalendarOccurrence) => void;
};

function MonthView({ anchor, occurrences, categories, expandedDay, setExpandedDay, ...actions }: ViewProps & { anchor: Date; expandedDay: string | null; setExpandedDay: (key: string | null) => void }) {
  const days = monthGrid(anchor);
  return <div className="month-view"><div className="month-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid">{days.map((day) => {
    const key = dateKey(day);
    const dayItems = occurrences.filter((entry) => dateKey(entry.occurrenceStart) === key);
    const visible = expandedDay === key ? dayItems : dayItems.slice(0, 3);
    const today = key === dateKey(new Date());
    return <div className={`month-day ${day.getMonth() !== anchor.getMonth() ? "outside" : ""}`} key={key} data-drop-date={key} onDragOver={(event) => event.preventDefault()} onDrop={(event) => actions.handleDrop(event, day)}>
      <button className={`month-day-number ${today ? "today" : ""}`} onClick={() => actions.openCreate(day)} aria-label={`Add item on ${day.toDateString()}`}>{day.getDate()}</button>
      <div className="month-items">{visible.map((occurrence) => <EventCard key={occurrence.occurrenceKey} occurrence={occurrence} category={categories.find((category) => category.id === occurrence.categoryId)} compact open={() => actions.openOccurrence(occurrence)} toggle={() => actions.toggleTask(occurrence)} startNativeDrag={actions.startNativeDrag} startTouchDrag={actions.startTouchDrag} />)}</div>
      {dayItems.length > 3 && <button className="calendar-more" onClick={() => setExpandedDay(expandedDay === key ? null : key)}>{expandedDay === key ? "Show less" : `+${dayItems.length - 3} more`}</button>}
    </div>;
  })}</div></div>;
}

function WeekView({ start, dayCount, occurrences, categories, ...actions }: ViewProps & { start: Date; dayCount: number }) {
  const days = Array.from({ length: dayCount }, (_, index) => addDays(start, index));
  const columns = { "--calendar-day-count": dayCount, "--calendar-day-min": dayCount === 1 ? "320px" : "100px" } as React.CSSProperties;
  const now = new Date();
  const timeTop = (now.getHours() * 60 + now.getMinutes()) * 0.8;
  return <div className="week-scroll"><div className="week-canvas" style={columns}>
    <div className="week-header"><span className="week-timezone">LOCAL</span>{days.map((day) => <div key={dateKey(day)}><span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span><strong className={dateKey(day) === dateKey(now) ? "today" : ""}>{day.getDate()}</strong></div>)}</div>
    <div className="all-day-row"><span>all-day</span>{days.map((day) => <div key={dateKey(day)} data-drop-date={dateKey(day)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => actions.handleDrop(event, day)}>{occurrences.filter((entry) => entry.allDay && dateKey(entry.occurrenceStart) === dateKey(day)).map((occurrence) => <EventCard key={occurrence.occurrenceKey} occurrence={occurrence} category={categories.find((category) => category.id === occurrence.categoryId)} compact open={() => actions.openOccurrence(occurrence)} toggle={() => actions.toggleTask(occurrence)} startNativeDrag={actions.startNativeDrag} startTouchDrag={actions.startTouchDrag} />)}</div>)}</div>
    <div className="week-time-grid"><div className="hour-labels">{HOURS.map((hour) => <span key={hour} style={{ top: hour * 48 }}>{new Date(2020, 0, 1, hour).toLocaleTimeString(undefined, { hour: "numeric" })}</span>)}</div>{days.map((day) => {
      const timed = occurrences.filter((entry) => !entry.allDay && dateKey(entry.occurrenceStart) === dateKey(day));
      return <div className="week-day-column" key={dateKey(day)} data-drop-date={dateKey(day)} onClick={(event) => {
        if ((event.target as HTMLElement).closest(".calendar-event")) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const minutes = Math.max(0, Math.min(1410, Math.round(((event.clientY - rect.top) / 0.8) / 30) * 30));
        actions.openCreate(day, minutes);
      }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const minutes = Math.max(0, Math.min(1410, Math.round(((event.clientY - rect.top) / 0.8) / 30) * 30));
        actions.handleDrop(event, day, minutes);
      }}>{dateKey(day) === dateKey(now) && <i className="current-time-line" style={{ top: timeTop }} />}{timed.map((occurrence) => {
        const startMinutes = occurrence.occurrenceStart.getHours() * 60 + occurrence.occurrenceStart.getMinutes();
        const duration = Math.max(30, (occurrence.occurrenceEnd.getTime() - occurrence.occurrenceStart.getTime()) / 60_000);
        return <div className="week-event-position" key={occurrence.occurrenceKey} style={{ top: startMinutes * 0.8, height: duration * 0.8 }}><EventCard occurrence={occurrence} category={categories.find((category) => category.id === occurrence.categoryId)} open={() => actions.openOccurrence(occurrence)} toggle={() => actions.toggleTask(occurrence)} startNativeDrag={actions.startNativeDrag} startTouchDrag={actions.startTouchDrag} /></div>;
      })}</div>;
    })}</div>
  </div></div>;
}

function EventCard({ occurrence, category, compact, open, toggle, startNativeDrag, startTouchDrag }: { occurrence: CalendarOccurrence; category?: CalendarCategory; compact?: boolean; open: () => void; toggle: () => void; startNativeDrag: ViewProps["startNativeDrag"]; startTouchDrag: ViewProps["startTouchDrag"] }) {
  const color = category?.color ?? "#706E80";
  return <article className={`calendar-event ${compact ? "compact" : ""} ${occurrence.isCompleted ? "completed" : ""} ${occurrence.type}`} style={{ "--event-color": color } as React.CSSProperties} draggable onDragStart={(event) => startNativeDrag(event, { kind: "item", occurrence })} onDragEnd={() => undefined} onPointerDown={(event) => startTouchDrag(event, { kind: "item", occurrence })} onClick={(event) => { event.stopPropagation(); open(); }}>
    {occurrence.type === "task" ? <button className="event-check" aria-label={occurrence.isCompleted ? "Mark incomplete" : "Mark complete"} onClick={(event) => { event.stopPropagation(); toggle(); }}>{occurrence.isCompleted && <Check size={10} />}</button> : <BellRing size={compact ? 10 : 12} />}
    <div><strong>{occurrence.title}</strong>{!compact && <span>{formatter.format(occurrence.occurrenceStart)} · {category?.name ?? "Uncategorized"}</span>}</div>
    {occurrence.recurrenceFrequency !== "none" && <Repeat2 size={10} />}
  </article>;
}

function DraftPanel({ drafts, categories, onQuickAdd, onEdit, startNativeDrag, startTouchDrag, className = "" }: { drafts: CalendarItem[]; categories: CalendarCategory[]; onQuickAdd: (title: string) => void; onEdit: (item: CalendarItem) => void; startNativeDrag: ViewProps["startNativeDrag"]; startTouchDrag: ViewProps["startTouchDrag"]; className?: string }) {
  const [draftTitle, setDraftTitle] = useState("");
  return <aside className={`draft-panel ${className}`}><div className="draft-panel-heading"><div><span><ListTodo size={15} /></span><div><h2>Draft tasks</h2><p>Write it here, schedule it later</p></div></div></div><form className="draft-compose" onSubmit={(event) => { event.preventDefault(); const title = draftTitle.trim(); if (!title) return; onQuickAdd(title); setDraftTitle(""); }}><input value={draftTitle} maxLength={160} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Write a draft task…" aria-label="Draft task title" /><button type="submit" aria-label="Add draft task"><Plus size={15} /></button></form><div className="draft-list">{drafts.length ? drafts.map((item) => {
    const category = categories.find((entry) => entry.id === item.categoryId);
    return <article className="draft-card" key={item.id} draggable onDragStart={(event) => startNativeDrag(event, { kind: "draft", item })} onPointerDown={(event) => startTouchDrag(event, { kind: "draft", item })}><GripVertical size={14} /><button onClick={() => onEdit(item)}><strong>{item.title}</strong><span><i style={{ background: category?.color ?? "#706E80" }} />{category?.name ?? "Uncategorized"}</span></button><button aria-label="Edit draft" onClick={() => onEdit(item)}><Pencil size={12} /></button></article>;
  }) : <div className="draft-empty"><span><ListTodo size={19} /></span><strong>A quiet place for later</strong><p>Write a task above, then drag it onto any calendar date.</p></div>}</div><div className="draft-tip"><SlidersHorizontal size={13} /><span>Drop on a month date for all-day, or on a week time slot for one hour.</span></div></aside>;
}

function ItemEditor({ editor, setEditor, categories, onSubmit, onDelete, onManageCategories, pending }: { editor: { form: CalendarItemInput; occurrence?: CalendarOccurrence }; setEditor: React.Dispatch<React.SetStateAction<{ form: CalendarItemInput; occurrence?: CalendarOccurrence } | null>>; categories: CalendarCategory[]; onSubmit: (event: FormEvent, draft?: boolean) => void; onDelete: () => void; onManageCategories: () => void; pending: boolean }) {
  const form = editor.form;
  const update = <K extends keyof CalendarItemInput>(key: K, value: CalendarItemInput[K]) => setEditor((current) => current ? { ...current, form: { ...current.form, [key]: value } } : current);
  const scheduledDate = form.allDay ? (form.startDate ?? dateKey(new Date())) : (form.startsAt?.slice(0, 10) ?? dateKey(new Date()));
  const startTime = form.startsAt?.slice(11, 16) ?? "09:00";
  const timedRange = (date: string, time: string) => {
    const start = new Date(`${date}T${time}`);
    return { startsAt: `${date}T${time}`, endsAt: toLocalDateTimeValue(new Date(start.getTime() + 3_600_000)) };
  };
  const updateScheduleDate = (value: string) => {
    if (form.allDay) {
      update("startDate", value);
      update("endDate", value ? dateKey(addDays(parseDateKey(value), 1)) : null);
    } else {
      setEditor((current) => current ? { ...current, form: { ...current.form, ...(value ? timedRange(value, startTime) : { startsAt: null, endsAt: null }) } } : current);
    }
  };
  const toggleAllDay = (allDay: boolean) => {
    setEditor((current) => {
      if (!current) return current;
      const date = current.form.startDate ?? current.form.startsAt?.slice(0, 10) ?? dateKey(new Date());
      return {
        ...current,
        form: allDay
          ? { ...current.form, allDay: true, startDate: date, endDate: dateKey(addDays(parseDateKey(date), 1)), startsAt: null, endsAt: null }
          : { ...current.form, allDay: false, startDate: null, endDate: null, startsAt: `${date}T09:00`, endsAt: `${date}T10:00` },
      };
    });
  };
  return <div className="calendar-modal-backdrop" onMouseDown={() => setEditor(null)}><form className="item-dialog" onSubmit={(event) => onSubmit(event, form.isDraft)} onMouseDown={(event) => event.stopPropagation()}>
    <div className="dialog-heading"><div><span className={form.type}><CalendarDays size={17} /></span><div><h2>{form.id ? "Edit calendar item" : "Create something new"}</h2><p>{form.isDraft ? "A task for later" : "Add a task or reminder to your flow"}</p></div></div><button type="button" className="modal-close" aria-label="Close" onClick={() => setEditor(null)}><X size={17} /></button></div>
    <div className="dialog-body">
      <div className="type-switch"><button type="button" className={form.type === "task" ? "active" : ""} onClick={() => update("type", "task")}><ListTodo size={14} /> Task</button><button type="button" className={form.type === "reminder" ? "active" : ""} onClick={() => update("type", "reminder")} disabled={form.isDraft}><BellRing size={14} /> Reminder</button></div>
      <label className="field field-full"><span>Title</span><input autoFocus required maxLength={160} value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="What would you like to accomplish?" /></label>
      <div className="field-row"><label className="field"><span>Category</span><select value={form.categoryId ?? ""} onChange={(event) => update("categoryId", event.target.value ? Number(event.target.value) : null)}><option value="">Uncategorized</option>{categories.filter((category) => category.scope === (form.type === "reminder" ? "reminder" : "task") || category.scope === "calendar").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><button className="manage-category-button" type="button" onClick={onManageCategories}>Manage colors</button></div>
      {!form.isDraft && <><label className="all-day-toggle"><input type="checkbox" checked={form.allDay} onChange={(event) => toggleAllDay(event.target.checked)} /><span /> All-day</label><div className={`schedule-fields ${form.allDay ? "all-day" : ""}`}><label className="field"><span>Date</span><input type="date" required value={scheduledDate} onChange={(event) => updateScheduleDate(event.target.value)} /></label>{!form.allDay && <label className="field"><span>Time</span><input type="time" required value={startTime} onChange={(event) => setEditor((current) => current ? { ...current, form: { ...current.form, ...timedRange(scheduledDate, event.target.value) } } : current)} /></label>}</div>
      <div className="repeat-setting"><label className="all-day-toggle"><input type="checkbox" checked={form.recurrenceFrequency !== "none"} onChange={(event) => setEditor((current) => current ? { ...current, form: { ...current.form, recurrenceFrequency: event.target.checked ? "weekly" : "none", recurrenceEndMode: "never", recurrenceEndDate: null, recurrenceCount: null } } : current)} /><span /> Repeat</label>{form.recurrenceFrequency !== "none" && <label className="field"><span>Frequency</span><select value={form.recurrenceFrequency} onChange={(event) => update("recurrenceFrequency", event.target.value as CalendarItemInput["recurrenceFrequency"])}><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="yearly">Every year</option></select></label>}</div>
      {form.type === "reminder" && <label className="field field-half"><span>Notify me</span><select value={form.notificationOffset ?? 10} onChange={(event) => update("notificationOffset", Number(event.target.value))}><option value={0}>At start</option><option value={5}>5 minutes before</option><option value={10}>10 minutes before</option><option value={30}>30 minutes before</option><option value={1440}>1 day before</option></select></label>}</>}
      <label className="field field-full"><span>Notes</span><textarea rows={3} value={form.description ?? ""} onChange={(event) => update("description", event.target.value)} placeholder="Add a little context…" /></label>
    </div>
    <div className="dialog-footer">{form.id && <button type="button" className="dialog-delete" onClick={onDelete}><Trash2 size={14} /> Delete</button>}<span />{form.isDraft && <button type="button" className="dialog-secondary" onClick={() => {
      const today = new Date();
      setEditor((current) => current ? { ...current, form: { ...current.form, isDraft: false, allDay: true, startDate: dateKey(today), endDate: dateKey(addDays(today, 1)) } } : current);
    }}>Schedule now</button>}{form.type === "task" && !form.isDraft && <button type="button" className="dialog-secondary" onClick={(event) => onSubmit(event as unknown as FormEvent, true)}>Save as draft</button>}<button type="button" className="dialog-secondary" onClick={() => setEditor(null)}>Cancel</button><button type="submit" className="dialog-save" disabled={pending}>{form.isDraft ? "Save draft" : "Save item"}</button></div>
  </form></div>;
}

function CategoryManager({ categories, close, runMutation }: { categories: CalendarCategory[]; close: () => void; runMutation: (action: () => Promise<void>, success?: string) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);
  return <div className="calendar-modal-backdrop category-layer" onMouseDown={close}><section className="category-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="dialog-heading"><div><span><SlidersHorizontal size={17} /></span><div><h2>Task categories</h2><p>Keep every kind of work easy to spot</p></div></div><button className="modal-close" onClick={close}><X size={17} /></button></div><div className="category-list">{categories.map((category) => <CategoryRow key={category.id} category={category} runMutation={runMutation} />)}</div><form className="new-category" onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; runMutation(() => createCalendarCategoryAction(name, color), "Category created."); setName(""); }}><label className="field"><span>New category</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Deep work" /></label><div className="color-options">{CATEGORY_COLORS.map((entry) => <button type="button" aria-label={`Choose ${entry}`} className={color === entry ? "active" : ""} style={{ background: entry }} key={entry} onClick={() => setColor(entry)} />)}</div><button className="dialog-save" type="submit">Add category</button></form></section></div>;
}

function CategoryRow({ category, runMutation }: { category: CalendarCategory; runMutation: (action: () => Promise<void>, success?: string) => void }) {
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  return <div className="category-row"><i style={{ background: color }} /><input value={name} onChange={(event) => setName(event.target.value)} /><div className="category-color-mini">{CATEGORY_COLORS.map((entry) => <button key={entry} aria-label={`Use ${entry}`} style={{ background: entry }} className={color === entry ? "active" : ""} onClick={() => setColor(entry)} />)}</div><button aria-label="Save category" onClick={() => runMutation(() => updateCalendarCategoryAction(category.id, name, color), "Category updated.")}><Check size={14} /></button><button aria-label="Delete category" onClick={() => { if (window.confirm(`Delete “${category.name}”? Existing items will become Uncategorized.`)) runMutation(() => deleteCalendarCategoryAction(category.id), "Category deleted."); }}><Trash2 size={13} /></button></div>;
}
