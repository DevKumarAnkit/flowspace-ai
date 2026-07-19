"use client";

import { Composer, Thread } from "@liveblocks/react-ui";
import type { ThreadData } from "@liveblocks/client";
import { RoomProvider, useBroadcastEvent, useEventListener, useOthers, useSelf, useStatus, useThreads, useUpdateMyPresence } from "@liveblocks/react";
import { Clock3, MessageCircle, Share2, UserPlus, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { getKanbanCollaboratorsAction, inviteKanbanCollaboratorAction, removeKanbanCollaboratorAction } from "@/app/kanban/actions";
import { avatarColor, indexTaskThreads, initials, kanbanRoomId } from "@/lib/liveblocks-shared";
import type { KanbanCollaborator } from "@/lib/kanban-types";

type ThreadIndex = Map<string, ThreadData<Liveblocks["ThreadMetadata"], Liveblocks["CommentMetadata"]>>;
const CommentsContext = createContext<{ threads: ThreadIndex; loading: boolean }>({ threads: new Map(), loading: true });

export const KANBAN_MUTATED_EVENT = "flowspace:kanban-mutated";

export function announceKanbanMutation(boardId: number) {
  window.dispatchEvent(new CustomEvent(KANBAN_MUTATED_EVENT, { detail: { boardId } }));
}

export function KanbanRoom({ boardId, children }: { boardId: number; children: ReactNode }) {
  return (
    <RoomProvider id={kanbanRoomId(boardId)} initialPresence={{ activeTaskId: null }}>
      <KanbanRealtime boardId={boardId}>
        <CommentsIndex>{children}</CommentsIndex>
      </KanbanRealtime>
    </RoomProvider>
  );
}

function KanbanRealtime({ boardId, children }: { boardId: number; children: ReactNode }) {
  const router = useRouter();
  const broadcast = useBroadcastEvent();
  useEventListener(({ event }) => {
    if (event.type === "KANBAN_BOARD_UPDATED" && event.boardId === boardId) router.refresh();
  });
  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<{ boardId: number }>).detail;
      if (detail?.boardId === boardId) broadcast({ type: "KANBAN_BOARD_UPDATED", boardId });
    };
    window.addEventListener(KANBAN_MUTATED_EVENT, handle);
    return () => window.removeEventListener(KANBAN_MUTATED_EVENT, handle);
  }, [boardId, broadcast]);
  return children;
}

function CommentsIndex({ children }: { children: ReactNode }) {
  const result = useThreads();
  useEffect(() => {
    if (result.isLoading) return;
    if (!result.hasFetchedAll && !result.isFetchingMore) void result.fetchMore?.();
  }, [result.isLoading, result.isLoading ? true : result.hasFetchedAll, result.isLoading ? false : result.isFetchingMore]);
  const threads = useMemo(() => {
    return indexTaskThreads(result.threads ?? []) as ThreadIndex;
  }, [result]);
  return <CommentsContext.Provider value={{ threads, loading: result.isLoading }}>{children}</CommentsContext.Provider>;
}

export function TaskCommentBadge({ taskId }: { taskId: number }) {
  const { threads } = useContext(CommentsContext);
  const count = threads.get(String(taskId))?.comments.length ?? 0;
  return count ? <span className="task-comment-badge" aria-label={`${count} comment${count === 1 ? "" : "s"}`}><MessageCircle size={11} />{count}</span> : null;
}

export function TaskComments({ taskId, autoFocus = false, close }: { taskId: number; autoFocus?: boolean; close?: () => void }) {
  const { threads, loading } = useContext(CommentsContext);
  const thread = threads.get(String(taskId));
  const ref = useRef<HTMLElement>(null);
  const updatePresence = useUpdateMyPresence();
  useEffect(() => {
    updatePresence({ activeTaskId: taskId });
    if (autoFocus) requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("[contenteditable=true]")?.focus());
    return () => updatePresence({ activeTaskId: null });
  }, [autoFocus, taskId, updatePresence]);
  return (
    <aside ref={ref} className="task-comments-panel">
      <div className="task-comments-head"><span><MessageCircle size={16} /></span><div><strong>Discussion</strong><small>{thread ? `${thread.comments.length} comment${thread.comments.length === 1 ? "" : "s"}` : "A calm place for context"}</small></div>{close && <button type="button" onClick={close} aria-label="Close discussion"><X size={17} /></button>}</div>
      <div className="task-comments-scroll">
        {loading ? <div className="comments-state"><Clock3 size={18} /><span>Loading discussion…</span></div> : thread ? <Thread thread={thread} showComposer="collapsed" /> : <div className="comments-state"><MessageCircle size={20} /><strong>No comments yet</strong><span>Start the conversation with a helpful note.</span></div>}
      </div>
      {!thread && !loading && <Composer className="flowspace-composer" metadata={{ taskId: String(taskId) }} overrides={{ COMPOSER_PLACEHOLDER: "Write a comment…", COMPOSER_SEND: "Send" }} />}
    </aside>
  );
}

function UserAvatar({ name, email, avatar, color, active = false }: { name: string; email: string; avatar: string | null; color: string; active?: boolean }) {
  return <span className="collab-avatar" style={{ background: color }} title={name || email}>{avatar ? <img src={avatar} alt="" /> : initials(name, email)}{active && <i />}</span>;
}

export function CollaborationToolbar({ boardId, isOwner }: { boardId: number; isOwner: boolean }) {
  const self = useSelf();
  const others = useOthers();
  const status = useStatus();
  const [open, setOpen] = useState(false);
  const users = [self, ...others].filter((user): user is NonNullable<typeof user> => user != null);
  return <div className="collaboration-cluster">
    <div className="active-collaborators" aria-label={`${users.length} active collaborator${users.length === 1 ? "" : "s"}`}>
      {users.slice(0, 4).map((user) => <UserAvatar key={user.connectionId} name={user.info.name} email={user.info.email} avatar={user.info.avatar} color={user.info.color} active />)}
      {users.length > 4 && <span className="collab-overflow">+{users.length - 4}</span>}
    </div>
    <button type="button" className="collaboration-button" onClick={() => setOpen(true)}><Users size={14} /><span>Collaborate</span><i className={status === "connected" ? "online" : ""} /></button>
    {open && <CollaborationPanel boardId={boardId} isOwner={isOwner} close={() => setOpen(false)} />}
  </div>;
}

function CollaborationPanel({ boardId, isOwner, close }: { boardId: number; isOwner: boolean; close: () => void }) {
  const [people, setPeople] = useState<KanbanCollaborator[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  useEffect(() => { void getKanbanCollaboratorsAction(boardId).then(setPeople).catch((value) => setError(value instanceof Error ? value.message : "Unable to load sharing." )).finally(() => setLoading(false)); }, [boardId]);
  const invite = () => startTransition(async () => {
    setError("");
    try { const person = await inviteKanbanCollaboratorAction(boardId, email); setPeople((current) => [...current, person]); setEmail(""); }
    catch (value) { setError(value instanceof Error ? value.message : "Unable to invite collaborator."); }
  });
  const remove = (person: KanbanCollaborator) => {
    if (!window.confirm(person.status === "pending" ? `Cancel the invite for ${person.email}?` : `Remove ${person.name || person.email} from this board?`)) return;
    startTransition(async () => {
      setError("");
      try { await removeKanbanCollaboratorAction(boardId, Number(person.id)); setPeople((current) => current.filter((entry) => entry.id !== person.id)); }
      catch (value) { setError(value instanceof Error ? value.message : "Unable to remove collaborator."); }
    });
  };
  return <div className="collaboration-scrim" onMouseDown={close}><aside className="collaboration-panel" role="dialog" aria-modal="true" aria-label="Board collaboration" onMouseDown={(event) => event.stopPropagation()}>
    <header><span><Share2 size={17} /></span><div><h2>Board collaboration</h2><p>Invite people into this board’s flow.</p></div><button onClick={close} aria-label="Close collaboration"><X size={17} /></button></header>
    {isOwner && <div className="collaboration-invite"><label><span>Invite by email</span><div><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@example.com" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (email.trim()) invite(); } }} /><button disabled={pending || !email.trim()} onClick={invite}><UserPlus size={14} /> Invite</button></div></label><small>No email is sent; access activates when they sign in.</small></div>}
    {error && <p className="collaboration-error" role="alert">{error}</p>}
    <div className="collaboration-list"><h3>People with access</h3>
      {loading ? <div className="collaboration-empty">Loading people…</div> : people.map((person) => <div className="collaborator-row" key={person.id}>
        <UserAvatar name={person.name || person.email} email={person.email} avatar={person.imageUrl} color={avatarColor(person.email)} />
        <div><strong>{person.name || person.email.split("@")[0]}</strong><span>{person.email}</span></div>
        <em className={person.status}>{person.role === "owner" ? "Owner" : person.status === "pending" ? "Pending" : "Editor"}</em>
        {isOwner && person.role !== "owner" && <button disabled={pending} onClick={() => remove(person)} aria-label={`Remove ${person.email}`}><X size={13} /></button>}
      </div>)}
      {!loading && people.length === 1 && <div className="collaboration-empty"><Users size={20} /><strong>Just you for now</strong><span>Invite someone when you’re ready to build together.</span></div>}
    </div>
  </aside></div>;
}
