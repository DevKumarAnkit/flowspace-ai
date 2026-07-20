"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarDays,
  Check,
  ChevronRight,
  CirclePlus,
  Columns3,
  GripVertical,
  LayoutPanelLeft,
  MessageCircle,
  MoreHorizontal,
  NotebookPen,
  Palette,
  Pencil,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import {
  createKanbanBoardAction,
  createKanbanColumnAction,
  createKanbanLabelAction,
  deleteKanbanBoardAction,
  deleteKanbanColumnAction,
  deleteKanbanLabelAction,
  deleteKanbanTaskAction,
  moveKanbanTaskAction,
  saveKanbanTaskAction,
  updateKanbanBoardAction,
  updateKanbanColumnAction,
  updateKanbanLabelAction,
} from "@/app/kanban/actions";
import { KANBAN_COLORS, todayLocal, type KanbanBoard, type KanbanData, type KanbanPriority, type KanbanTask, type KanbanTaskInput } from "@/lib/kanban-types";
import type { UserCategory } from "@/lib/settings-domain";
import { announceKanbanMutation, CollaborationToolbar, KanbanRoom, TaskCommentBadge, TaskComments } from "@/components/kanban/collaboration";

type TaskDraft = KanbanTaskInput;

function emptyTask(boardId: number, columnId: number, priority: KanbanPriority): TaskDraft {
  return {
    boardId,
    columnId,
    title: "",
    description: "",
    dueDate: todayLocal(),
    priority,
    categoryId: null,
    notesLinked: false,
    calendarSync: false,
    labelIds: [],
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
}

function taskDraft(task: KanbanTask): TaskDraft {
  return {
    id: task.id,
    boardId: task.boardId,
    columnId: task.columnId,
    title: task.title,
    description: task.description,
    dueDate: task.dueDate,
    priority: task.priority,
    categoryId: task.categoryId,
    notesLinked: task.notesLinked,
    calendarSync: task.calendarItemId != null,
    labelIds: task.labels.map((label) => label.id),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
}

export function KanbanPage({ initialData, initialSelectedBoardId, initialToday, defaultPriority, categories }: { initialData: KanbanData; initialSelectedBoardId: number | null; initialToday: string; defaultPriority: KanbanPriority; categories: UserCategory[] }) {
  const router = useRouter();
  const [boards, setBoards] = useState(initialData.boards);
  const [selectedId, setSelectedId] = useState(initialSelectedBoardId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [boardEditor, setBoardEditor] = useState<KanbanBoard | "new" | null>(null);
  const [taskEditor, setTaskEditor] = useState<TaskDraft | null>(null);
  const [focusComments, setFocusComments] = useState(false);
  const [deleteColumn, setDeleteColumn] = useState<number | null>(null);
  const [renameColumn, setRenameColumn] = useState<{ id: number; name: string } | null>(null);
  const [newColumnName, setNewColumnName] = useState("");
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = boards.find((board) => board.id === selectedId) ?? boards[0] ?? null;

  useEffect(() => {
    setBoards(initialData.boards);
    setSelectedId(initialSelectedBoardId);
  }, [initialData, initialSelectedBoardId]);

  useEffect(() => setNewColumnName(""), [selectedId]);

  function mutate(action: () => Promise<unknown>, success = "Saved.", after?: (value: unknown) => void) {
    setMessage("");
    startTransition(async () => {
      try {
        const value = await action();
        after?.(value);
        if (selected) announceKanbanMutation(selected.id);
        setMessage(success);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  }

  function chooseBoard(id: number) {
    setSelectedId(id);
    setDrawerOpen(false);
    router.push(`/kanban?board=${id}`, { scroll: false });
  }

  function handleDragStart(event: DragStartEvent) {
    const id = Number(String(event.active.id).replace("task-", ""));
    setActiveTask(selected?.columns.flatMap((column) => column.tasks).find((task) => task.id === id) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    if (!selected || !event.over) return;
    const taskId = Number(String(event.active.id).replace("task-", ""));
    const source = selected.columns.find((column) => column.tasks.some((task) => task.id === taskId));
    const overValue = String(event.over.id);
    const overTaskId = overValue.startsWith("task-") ? Number(overValue.replace("task-", "")) : null;
    const target = overTaskId != null
      ? selected.columns.find((column) => column.tasks.some((task) => task.id === overTaskId))
      : selected.columns.find((column) => `column-${column.id}` === overValue);
    if (!source || !target) return;
    const snapshot = boards;
    const updated = boards.map((board) => {
      if (board.id !== selected.id) return board;
      const moving = source.tasks.find((task) => task.id === taskId)!;
      const lists = new Map(board.columns.map((column) => [column.id, column.tasks.filter((task) => task.id !== taskId)]));
      const targetList = lists.get(target.id)!;
      const index = overTaskId == null ? targetList.length : Math.max(0, targetList.findIndex((task) => task.id === overTaskId));
      targetList.splice(index, 0, { ...moving, columnId: target.id });
      return { ...board, columns: board.columns.map((column) => ({ ...column, tasks: lists.get(column.id)!.map((task, position) => ({ ...task, position })) })) };
    });
    setBoards(updated);
    const nextBoard = updated.find((board) => board.id === selected.id)!;
    const orders = nextBoard.columns.map((column) => ({ columnId: column.id, taskIds: column.tasks.map((task) => task.id) }));
    startTransition(async () => {
      try {
        await moveKanbanTaskAction(selected.id, taskId, target.id, orders);
        announceKanbanMutation(selected.id);
        router.refresh();
      } catch (error) {
        setBoards(snapshot);
        setMessage(error instanceof Error ? error.message : "The task could not be moved.");
      }
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const content = (
    <div className="kanban-content">
      <div className="kanban-heading">
        <div><p>MAKE SPACE FOR PROGRESS</p><h1>Task boards</h1></div>
        <button className="kanban-board-toggle" onClick={() => setDrawerOpen(true)}><LayoutPanelLeft size={16} /> Boards</button>
      </div>
      {message && <div className={`kanban-toast ${message === "Saved." || message.includes("created") ? "success" : ""}`} role="status">{message}<button onClick={() => setMessage("")}><X size={13} /></button></div>}
      <div className="kanban-layout">
        {drawerOpen && <button className="kanban-drawer-scrim" aria-label="Close board list" onClick={() => setDrawerOpen(false)} />}
        <aside className={`board-panel ${drawerOpen ? "open" : ""}`}>
          <div className="board-panel-title"><div><Palette size={15} /><strong>Your boards</strong></div><button className="panel-close" onClick={() => setDrawerOpen(false)}><X size={16} /></button></div>
          <button className="new-board-button" onClick={() => setBoardEditor("new")}><Plus size={15} /> New board</button>
          <div className="board-list">
            {boards.map((board) => <div className={`board-list-row ${selected?.id === board.id ? "selected" : ""}`} key={board.id}>
              <button className="board-select" onClick={() => chooseBoard(board.id)}><i style={{ background: board.color }} /><span>{board.name}</span><ChevronRight size={13} /></button>
              <button className="board-edit" aria-label={`Edit ${board.name}`} onClick={() => setBoardEditor(board)}><MoreHorizontal size={14} /></button>
            </div>)}
          </div>
          {!boards.length && <div className="board-list-empty"><Sparkles size={20} /><strong>Your first board awaits</strong><span>Create a calm home for your next project.</span></div>}
        </aside>

        <main className="kanban-board-area">
          {!selected ? <EmptyBoard onCreate={() => setBoardEditor("new")} /> : <>
            <div className="board-toolbar">
              <div><i style={{ background: selected.color }} /><div><h2>{selected.name}</h2><span>{selected.columns.reduce((sum, column) => sum + column.tasks.length, 0)} tasks · {selected.columns.length} columns</span></div></div>
              <div className="board-toolbar-actions"><CollaborationToolbar boardId={selected.id} isOwner={selected.accessRole === "owner"} /><form className="new-column-form" onSubmit={(event) => {
                event.preventDefault();
                const name = newColumnName.trim();
                if (!name || selected.columns.length >= 5) return;
                mutate(() => createKanbanColumnAction(selected.id, name), "Column created.", (value) => {
                  const column = value as KanbanBoard["columns"][number];
                  setBoards((current) => current.map((board) => board.id === selected.id ? { ...board, columns: [...board.columns, column] } : board));
                  setNewColumnName("");
                });
              }}><input aria-label="New column name" maxLength={40} value={newColumnName} onChange={(event) => setNewColumnName(event.target.value)} placeholder={selected.columns.length >= 5 ? "Column limit reached" : "New column name"} disabled={selected.columns.length >= 5 || pending} /><button type="submit" disabled={!newColumnName.trim() || selected.columns.length >= 5 || pending}><Columns3 size={14} /> Add <small>{selected.columns.length}/5</small></button></form></div>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveTask(null)}>
              <div className="kanban-columns">
                {selected.columns.map((column) => <KanbanColumnView key={column.id} column={column} today={initialToday} canDelete={selected.columns.length > 1} pending={pending} onAdd={() => { setFocusComments(false); setTaskEditor(emptyTask(selected.id, column.id, defaultPriority)); }} onEditTask={(task) => { setFocusComments(false); setTaskEditor(taskDraft(task)); }} onComment={(task) => { setFocusComments(true); setTaskEditor(taskDraft(task)); }} onRename={() => setRenameColumn({ id: column.id, name: column.name })} onDelete={() => setDeleteColumn(column.id)} />)}
              </div>
              <DragOverlay>{activeTask ? <TaskCardBody task={activeTask} today={initialToday} dragging /> : null}</DragOverlay>
            </DndContext>
          </>}
        </main>
      </div>

      {boardEditor && <BoardDialog board={boardEditor === "new" ? null : boardEditor} pending={pending} close={() => setBoardEditor(null)} save={(name, color) => {
        if (boardEditor === "new") mutate(() => createKanbanBoardAction(name, color), "Board created.", (value) => { const board = value as KanbanBoard; setBoards((current) => [...current, board]); setBoardEditor(null); chooseBoard(board.id); });
        else mutate(() => updateKanbanBoardAction(boardEditor.id, name, color), "Board updated.", () => { setBoards((current) => current.map((board) => board.id === boardEditor.id ? { ...board, name: name.trim(), color } : board)); setBoardEditor(null); });
      }} remove={boardEditor === "new" || boardEditor.accessRole !== "owner" ? undefined : () => {
        if (!window.confirm(`Delete “${boardEditor.name}” and all of its tasks? This cannot be undone.`)) return;
        const index = boards.findIndex((board) => board.id === boardEditor.id);
        const fallback = boards[index + 1] ?? boards[index - 1];
        mutate(() => deleteKanbanBoardAction(boardEditor.id), "Board deleted.", () => { setBoards((current) => current.filter((board) => board.id !== boardEditor.id)); setBoardEditor(null); if (fallback) chooseBoard(fallback.id); else { setSelectedId(null); router.push("/kanban"); } });
      }} />}
      {taskEditor && selected && focusComments && taskEditor.id ? <CommentsDialog taskId={taskEditor.id} close={() => setTaskEditor(null)} /> : taskEditor && selected && <TaskDialog draft={taskEditor} board={selected} categories={categories} pending={pending} close={() => setTaskEditor(null)} save={(draft) => mutate(() => saveKanbanTaskAction(draft), draft.id ? "Task updated." : "Task created.", () => setTaskEditor(null))} remove={taskEditor.id ? () => {
        if (window.confirm(`Delete “${taskEditor.title}”?`)) mutate(() => deleteKanbanTaskAction(taskEditor.id!), "Task deleted.", () => setTaskEditor(null));
      } : undefined} mutate={mutate} />}
      {deleteColumn && selected && <DeleteColumnDialog board={selected} columnId={deleteColumn} pending={pending} close={() => setDeleteColumn(null)} confirm={() => mutate(() => deleteKanbanColumnAction(selected.id, deleteColumn), "Column deleted.", (value) => {
        const result = value as { deletedColumnId: number; completionColumnId: number | null };
        setBoards((current) => current.map((board) => board.id === selected.id ? { ...board, columns: board.columns.filter((column) => column.id !== result.deletedColumnId).map((column) => ({ ...column, isCompletion: column.id === result.completionColumnId })) } : board));
        setDeleteColumn(null);
      })} />}
      {renameColumn && selected && <RenameColumnDialog initialName={renameColumn.name} pending={pending} close={() => setRenameColumn(null)} save={(name) => mutate(() => updateKanbanColumnAction(selected.id, renameColumn.id, name), "Column updated.", () => {
        setBoards((current) => current.map((board) => board.id === selected.id ? { ...board, columns: board.columns.map((column) => column.id === renameColumn.id ? { ...column, name: name.trim() } : column) } : board));
        setRenameColumn(null);
      })} />}
    </div>
  );
  return selected ? <KanbanRoom key={selected.id} boardId={selected.id}>{content}</KanbanRoom> : content;
}

function EmptyBoard({ onCreate }: { onCreate: () => void }) {
  return <div className="kanban-empty"><span><CirclePlus size={25} /></span><h2>Start something fresh</h2><p>Create a board and Flowspace will set up Todo, In Progress, and Done for you.</p><button onClick={onCreate}><Plus size={16} /> Create your first board</button></div>;
}

function KanbanColumnView({ column, today, canDelete, pending, onAdd, onEditTask, onComment, onRename, onDelete }: { column: KanbanBoard["columns"][number]; today: string; canDelete: boolean; pending: boolean; onAdd: () => void; onEditTask: (task: KanbanTask) => void; onComment: (task: KanbanTask) => void; onRename: () => void; onDelete: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${column.id}` });
  return <section ref={setNodeRef} className={`kanban-column ${isOver ? "is-over" : ""}`}>
    <header><div><span className={column.isCompletion ? "done" : ""}>{column.isCompletion && <Check size={11} />}</span><strong>{column.name}</strong><em>{column.tasks.length}</em></div><div><button aria-label={`Rename ${column.name}`} onClick={onRename}><Pencil size={13} /></button><button aria-label={`Delete ${column.name}`} title={canDelete ? `Delete ${column.name}` : "A board needs at least one column"} disabled={pending || !canDelete} onClick={onDelete}><Trash2 size={13} /></button></div></header>
    <SortableContext items={column.tasks.map((task) => `task-${task.id}`)} strategy={verticalListSortingStrategy}>
      <div className="kanban-task-list">
        {column.tasks.map((task) => <SortableTaskCard key={task.id} task={task} today={today} onEdit={() => onEditTask(task)} onComment={() => onComment(task)} />)}
        {!column.tasks.length && <button className="column-empty" onClick={onAdd}><Sparkles size={16} /><span><strong>A quiet column</strong>Start with one small task</span></button>}
      </div>
    </SortableContext>
    <button className="add-task-button" onClick={onAdd}><Plus size={14} /> Add task</button>
  </section>;
}

function SortableTaskCard({ task, today, onEdit, onComment }: { task: KanbanTask; today: string; onEdit: () => void; onComment: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `task-${task.id}` });
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`kanban-task ${isDragging ? "dragging" : ""}`}>
    <button className="task-open" aria-label={`Edit ${task.title}`} onClick={onEdit}><TaskCardBody task={task} today={today} /></button>
    <button className="task-comment-button" aria-label={`Open comments for ${task.title}`} onClick={onComment}><MessageCircle size={13} /></button>
    <button className="task-grip" aria-label={`Move ${task.title}`} {...attributes} {...listeners}><GripVertical size={15} /></button>
  </article>;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function formatTaskDueDate(value: string) {
  const [, month, day] = value.split("-").map(Number);
  return month >= 1 && month <= 12 && Number.isInteger(day) ? `${SHORT_MONTHS[month - 1]} ${day}` : value;
}

function TaskCardBody({ task, today, dragging = false }: { task: KanbanTask; today: string; dragging?: boolean }) {
  const overdue = task.dueDate < today;
  return <div className={`task-card-body ${dragging ? "overlay" : ""}`}>
    <div className="task-card-top"><span className={`priority-dot ${task.priority}`} /><strong>{task.title}</strong></div>
    {!!task.labels.length && <div className="task-labels">{task.labels.map((label) => <span key={label.id} style={{ color: label.color, background: `${label.color}16`, borderColor: `${label.color}35` }}><i style={{ background: label.color }} />{label.name}</span>)}</div>}
    <div className="task-meta"><span className={overdue ? "overdue" : ""}><CalendarDays size={12} />{formatTaskDueDate(task.dueDate)}</span><span className={`priority-badge ${task.priority}`}>{task.priority}</span><TaskCommentBadge taskId={task.id} /><div>{task.calendarItemId && <CalendarDays size={13} aria-label="Synced with Calendar" />}{task.notesLinked && <NotebookPen size={13} aria-label="Linked with Notes" />}</div></div>
  </div>;
}

function Modal({ children, close, className = "" }: { children: ReactNode; close: () => void; className?: string }) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])') ?? [])];
    requestAnimationFrame(() => (focusable().find((item) => item.hasAttribute("autofocus")) ?? focusable()[0])?.focus());
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "Tab") {
        const items = focusable();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, [close]);
  return <div className="kanban-modal-backdrop" onMouseDown={close}><section ref={dialogRef} role="dialog" aria-modal="true" className={`kanban-dialog ${className}`} onMouseDown={(event) => event.stopPropagation()}>{children}</section></div>;
}

function BoardDialog({ board, pending, close, save, remove }: { board: KanbanBoard | null; pending: boolean; close: () => void; save: (name: string, color: string) => void; remove?: () => void }) {
  const [name, setName] = useState(board?.name ?? "");
  const [color, setColor] = useState(board?.color ?? KANBAN_COLORS[0]);
  return <Modal close={close} className="board-dialog"><form onSubmit={(event) => { event.preventDefault(); if (name.trim()) save(name, color); }}>
    <DialogHead icon={<Palette size={17} />} title={board ? "Edit board" : "Create a new board"} subtitle="Give this workspace a name and a little color." close={close} />
    <div className="kanban-dialog-body"><label className="field"><span>Board name</span><input autoFocus maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Product launch" /></label><div className="field"><span>Board color</span><div className="kanban-color-options">{KANBAN_COLORS.map((entry) => <button key={entry} type="button" aria-label={`Choose ${entry}`} className={color === entry ? "active" : ""} style={{ background: entry }} onClick={() => setColor(entry)}>{color === entry && <Check size={13} />}</button>)}</div></div></div>
    <div className="kanban-dialog-footer">{remove && <button type="button" className="danger" onClick={remove}><Trash2 size={14} /> Delete</button>}<span /><button type="button" className="secondary" onClick={close}>Cancel</button><button type="submit" className="primary" disabled={pending || !name.trim()}>{pending ? "Saving…" : board ? "Save changes" : "Create board"}</button></div>
  </form></Modal>;
}

function DialogHead({ icon, title, subtitle, close }: { icon: ReactNode; title: string; subtitle: string; close: () => void }) {
  return <div className="kanban-dialog-head"><div><span>{icon}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div><button type="button" onClick={close} aria-label="Close"><X size={17} /></button></div>;
}

function TaskDialog({ draft: initial, board, categories, pending, close, save, remove, mutate }: { draft: TaskDraft; board: KanbanBoard; categories: UserCategory[]; pending: boolean; close: () => void; save: (draft: TaskDraft) => void; remove?: () => void; mutate: (action: () => Promise<unknown>, success?: string, after?: (value: unknown) => void) => void }) {
  const [draft, setDraft] = useState(initial);
  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState<string>(KANBAN_COLORS[0]);
  const [editLabel, setEditLabel] = useState<{ id: number; name: string; color: string } | null>(null);
  const update = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); if (draft.title.trim()) save(draft); };
  return <Modal close={close} className="task-dialog"><form onSubmit={submit}>
    <DialogHead icon={<CirclePlus size={17} />} title={draft.id ? "Edit task" : "Create a task"} subtitle="Capture the next clear step, then keep it moving." close={close} />
    <div className="kanban-dialog-body task-form">
      <label className="field field-full"><span>Title</span><input autoFocus maxLength={160} value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder="What needs doing?" /></label>
      <label className="field field-full"><span>Description</span><textarea rows={3} maxLength={4000} value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="Add helpful context…" /></label>
      <div className="task-field-row"><label className="field"><span>Due date</span><input type="date" value={draft.dueDate} onChange={(event) => update("dueDate", event.target.value)} /></label><label className="field"><span>Priority</span><select value={draft.priority} onChange={(event) => update("priority", event.target.value as KanbanPriority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div>
      <label className="field field-full"><span>Category</span><select value={draft.categoryId ?? ""} onChange={(event) => update("categoryId", event.target.value ? Number(event.target.value) : null)}><option value="">Uncategorized</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
      <div className="field field-full"><span>Labels</span><div className="label-picker">{board.labels.map((label) => { const selected = draft.labelIds.includes(label.id); return <div className={`label-option ${selected ? "selected" : ""}`} key={label.id}><button type="button" onClick={() => update("labelIds", selected ? draft.labelIds.filter((id) => id !== label.id) : [...draft.labelIds, label.id])}><i style={{ background: label.color }} />{label.name}{selected && <Check size={12} />}</button><button type="button" aria-label={`Edit ${label.name}`} onClick={() => setEditLabel({ id: label.id, name: label.name, color: label.color })}><Pencil size={11} /></button><button type="button" aria-label={`Delete ${label.name}`} onClick={() => { if (window.confirm(`Delete label “${label.name}”?`)) { update("labelIds", draft.labelIds.filter((id) => id !== label.id)); mutate(() => deleteKanbanLabelAction(board.id, label.id), "Label deleted."); } }}><X size={11} /></button></div>; })}</div>
        {editLabel && <div className="edit-label-row"><input autoFocus maxLength={40} value={editLabel.name} onChange={(event) => setEditLabel({ ...editLabel, name: event.target.value })} /><div>{KANBAN_COLORS.map((color) => <button key={color} type="button" aria-label={`Use ${color}`} className={editLabel.color === color ? "active" : ""} style={{ background: color }} onClick={() => setEditLabel({ ...editLabel, color })} />)}</div><button type="button" disabled={!editLabel.name.trim() || pending} onClick={() => mutate(() => updateKanbanLabelAction(board.id, editLabel.id, editLabel.name, editLabel.color), "Label updated.", () => setEditLabel(null))}><Check size={13} /> Save</button><button type="button" aria-label="Cancel label edit" onClick={() => setEditLabel(null)}><X size={13} /></button></div>}
        <div className="new-label-row"><input maxLength={40} value={labelName} onChange={(event) => setLabelName(event.target.value)} placeholder="New label" /><div>{KANBAN_COLORS.map((color) => <button key={color} type="button" aria-label={`Use ${color}`} className={labelColor === color ? "active" : ""} style={{ background: color }} onClick={() => setLabelColor(color)} />)}</div><button type="button" disabled={!labelName.trim() || pending} onClick={() => mutate(() => createKanbanLabelAction(board.id, labelName, labelColor), "Label created.", (value) => { const label = value as { id: number }; setLabelName(""); update("labelIds", [...draft.labelIds, label.id]); })}><Tag size={13} /> Add</button></div>
      </div>
      <div className="task-toggles"><Toggle checked={draft.calendarSync} onChange={(value) => update("calendarSync", value)} icon={<CalendarDays size={15} />} title="Sync with Calendar" copy="Keep the due date and completion connected." /><Toggle checked={draft.notesLinked} onChange={(value) => update("notesLinked", value)} icon={<NotebookPen size={15} />} title="Link with Notes" copy="Show this task's Notes connection." /></div>
    </div>
    <div className="kanban-dialog-footer">{remove && <button type="button" className="danger" onClick={remove}><Trash2 size={14} /> Delete</button>}<span /><button type="button" className="secondary" onClick={close}>Cancel</button><button type="submit" className="primary" disabled={pending || !draft.title.trim()}>{pending ? "Saving…" : draft.id ? "Save task" : "Add task"}</button></div>
  </form></Modal>;
}

function CommentsDialog({ taskId, close }: { taskId: number; close: () => void }) {
  return <Modal close={close} className="comments-only-dialog"><TaskComments taskId={taskId} autoFocus close={close} /></Modal>;
}

function Toggle({ checked, onChange, icon, title, copy }: { checked: boolean; onChange: (value: boolean) => void; icon: ReactNode; title: string; copy: string }) {
  return <label><span>{icon}</span><div><strong>{title}</strong><small>{copy}</small></div><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}

function DeleteColumnDialog({ board, columnId, pending, close, confirm }: { board: KanbanBoard; columnId: number; pending: boolean; close: () => void; confirm: () => void }) {
  const column = board.columns.find((entry) => entry.id === columnId)!;
  return <Modal close={close} className="delete-column-dialog"><DialogHead icon={<Trash2 size={17} />} title={`Delete ${column.name}?`} subtitle="This action cannot be undone." close={close} /><div className="kanban-dialog-body"><div className="delete-column-warning"><Trash2 size={17} /><div><strong>{column.tasks.length ? `${column.tasks.length} task${column.tasks.length === 1 ? "" : "s"} will also be deleted` : "This column is empty"}</strong><span>{column.tasks.length ? "Linked Calendar items for these tasks will be removed too." : "The column will be removed from this board."}</span></div></div>{column.isCompletion && <p className="completion-reassign-note">The rightmost remaining column will become the board’s completion column.</p>}</div><div className="kanban-dialog-footer"><span /><button className="secondary" onClick={close}>Cancel</button><button className="danger solid" disabled={pending} onClick={confirm}>{pending ? "Deleting…" : "Delete column"}</button></div></Modal>;
}

function RenameColumnDialog({ initialName, pending, close, save }: { initialName: string; pending: boolean; close: () => void; save: (name: string) => void }) {
  const [name, setName] = useState(initialName);
  return <Modal close={close} className="rename-column-dialog"><form onSubmit={(event) => { event.preventDefault(); if (name.trim() && name.trim() !== initialName) save(name); }}>
    <DialogHead icon={<Pencil size={17} />} title="Rename column" subtitle="Give this stage a clear, useful name." close={close} />
    <div className="kanban-dialog-body"><label className="field field-full"><span>Column name</span><input autoFocus maxLength={40} value={name} onChange={(event) => setName(event.target.value)} /></label></div>
    <div className="kanban-dialog-footer"><span /><button type="button" className="secondary" onClick={close}>Cancel</button><button type="submit" className="primary" disabled={pending || !name.trim() || name.trim() === initialName}>{pending ? "Saving…" : "Save name"}</button></div>
  </form></Modal>;
}
