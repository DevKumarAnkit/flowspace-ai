"use client";

import { Composer, Thread } from "@liveblocks/react-ui";
import { RoomProvider, useOthers, useSelf, useStatus, useThreads } from "@liveblocks/react";
import { Check, Clock3, FolderKanban, Link2, LoaderCircle, MessageCircle, Share2, UserPlus, Users, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { getPageTaskLinksAction, getSpaceCollaboratorsAction, inviteSpaceCollaboratorAction, removeSpaceCollaboratorAction, setPageTaskLinkAction } from "@/app/spaces/actions";
import { avatarColor, initials, spacePageRoomId } from "@/lib/liveblocks-shared";
import { getLiveblocksAuthentication } from "@/lib/liveblocks-client-auth";
import type { LinkedTask, SpaceCollaborator } from "@/lib/spaces-domain";

const messageOf = (error: unknown) => error instanceof Error ? error.message : "Something went wrong.";

export function SpacePageRoom({ pageId, children }: { pageId: number; children: ReactNode }) {
  const roomId = spacePageRoomId(pageId);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setReady(false);
    setError("");
    void getLiveblocksAuthentication(roomId).then(() => {
      if (active) setReady(true);
    }).catch((value) => { if (active) setError(messageOf(value)); });
    return () => { active = false; };
  }, [attempt, roomId]);
  if (error) return <div className="collaboration-warmup error"><MessageCircle size={23} /><strong>Collaboration couldn’t connect</strong><span>{error}</span><button onClick={() => setAttempt((value) => value + 1)}>Try again</button></div>;
  if (!ready) return <div className="collaboration-warmup"><LoaderCircle className="spin" size={22} /><span>Connecting page collaboration…</span></div>;
  return <RoomProvider id={roomId} initialPresence={{ activeTaskId: null }}>{children}</RoomProvider>;
}

export function PageComments({ pageId }: { pageId: number }) {
  const result = useThreads();
  const [open, setOpen] = useState(false);
  const threads = useMemo(() => (result.threads ?? []).filter((thread) => !thread.metadata.pageId || thread.metadata.pageId === String(pageId)), [pageId, result.threads]);
  const count = threads.reduce((total, thread) => total + thread.comments.length, 0);
  return <>
    <button className="document-meta-action" onClick={() => setOpen(true)}><MessageCircle size={13} /><b>Comments</b><em>{result.isLoading ? "Loading…" : `${count} comment${count === 1 ? "" : "s"}`}</em></button>
    {open && <div className="page-panel-scrim" onMouseDown={() => setOpen(false)}><aside className="page-side-panel" onMouseDown={(event) => event.stopPropagation()}><header><span><MessageCircle size={17} /></span><div><h2>Page discussion</h2><p>{count ? `${count} comment${count === 1 ? "" : "s"}` : "Add context without changing the document."}</p></div><button onClick={() => setOpen(false)}><X size={17} /></button></header><div className="page-comments-scroll">{result.isLoading ? <div className="page-panel-empty"><Clock3 size={20} /><span>Loading discussion…</span></div> : threads.length ? threads.map((thread) => <Thread key={thread.id} thread={thread} showComposer="collapsed" />) : <div className="page-panel-empty"><MessageCircle size={23} /><strong>No comments yet</strong><span>Start the conversation below.</span></div>}</div>{!result.isLoading && <Composer className="flowspace-composer page-composer" metadata={{ pageId: String(pageId) }} overrides={{ COMPOSER_PLACEHOLDER: "Write a new comment…", COMPOSER_SEND: "Send" }} />}</aside></div>}
  </>;
}

export function PageTaskLinks({ pageId }: { pageId: number }) {
  const [open, setOpen] = useState(false); const [tasks, setTasks] = useState<LinkedTask[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  const linkedCount = tasks.filter((task) => task.linked).length;
  useEffect(() => { setLoading(true); void getPageTaskLinksAction(pageId).then(setTasks).catch((value) => setError(messageOf(value))).finally(() => setLoading(false)); }, [pageId]);
  const show = () => setOpen(true);
  const toggle = (task: LinkedTask) => startTransition(async () => { setError(""); try { await setPageTaskLinkAction(pageId, task.id, !task.linked); setTasks((current) => current.map((entry) => entry.id === task.id ? { ...entry, linked: !entry.linked } : entry)); } catch (value) { setError(messageOf(value)); } });
  return <><button className="document-meta-action" onClick={show}><Link2 size={13} /><b>Linked Tasks</b><em>{linkedCount} linked</em></button>{open && <div className="page-panel-scrim" onMouseDown={() => setOpen(false)}><aside className="page-side-panel" onMouseDown={(event) => event.stopPropagation()}><header><span><FolderKanban size={17} /></span><div><h2>Linked tasks</h2><p>Connect this page to work in your Kanban boards.</p></div><button onClick={() => setOpen(false)}><X size={17} /></button></header>{error && <p className="page-panel-error">{error}</p>}<div className="linked-task-list">{loading ? <div className="page-panel-empty"><LoaderCircle className="spin" size={21} /><span>Loading tasks…</span></div> : tasks.map((task) => <button key={task.id} disabled={pending} onClick={() => toggle(task)}><span className={task.linked ? "checked" : ""}>{task.linked && <Check size={12} />}</span><div><strong>{task.title}</strong><small>{task.boardName}</small></div></button>)}{!loading && !tasks.length && <div className="page-panel-empty"><FolderKanban size={23} /><strong>No tasks available</strong><span>Create a Kanban task first, then return here to link it.</span></div>}</div></aside></div>}</>;
}

export function SpaceCollaborationButton({ spaceId, isOwner, open: controlledOpen, onOpenChange }: { spaceId: number; isOwner: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const self = useSelf(); const others = useOthers(); const status = useStatus(); const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen; const setOpen = onOpenChange ?? setInternalOpen;
  const active = [self, ...others].filter(Boolean).length;
  return <><button className="document-collab-button" onClick={() => setOpen(true)}><Users size={14} /><span>Collaborate</span>{active > 1 && <em>{active}</em>}<i className={status === "connected" ? "online" : ""} /></button>{open && <SpaceCollaborationPanel spaceId={spaceId} isOwner={isOwner} close={() => setOpen(false)} />}</>;
}

export function SpaceCollaborationPanel({ spaceId, isOwner, close }: { spaceId: number; isOwner: boolean; close: () => void }) {
  const [people, setPeople] = useState<SpaceCollaborator[]>([]); const [email, setEmail] = useState(""); const [error, setError] = useState(""); const [copied, setCopied] = useState(false); const [loading, setLoading] = useState(true); const [pending, startTransition] = useTransition();
  useEffect(() => { void getSpaceCollaboratorsAction(spaceId).then(setPeople).catch((value) => setError(messageOf(value))).finally(() => setLoading(false)); }, [spaceId]);
  const invite = () => startTransition(async () => { setError(""); try { const collaborator = await inviteSpaceCollaboratorAction(spaceId, email); setPeople((current) => [...current, collaborator]); setEmail(""); } catch (value) { setError(messageOf(value)); } });
  const remove = (person: SpaceCollaborator) => startTransition(async () => { setError(""); try { await removeSpaceCollaboratorAction(spaceId, Number(person.id)); setPeople((current) => current.filter((entry) => entry.id !== person.id)); } catch (value) { setError(messageOf(value)); } });
  return <div className="page-panel-scrim" onMouseDown={close}><aside className="page-side-panel collaboration-space-panel" onMouseDown={(event) => event.stopPropagation()}><header><span><Share2 size={17} /></span><div><h2>Space collaboration</h2><p>Invite people to every page in this space.</p></div><button onClick={close}><X size={17} /></button></header><div className="copy-page-link"><button onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => setError("Unable to copy the page link."))}><Link2 size={14} /> {copied ? "Link copied" : "Copy page link"}</button></div>{isOwner && <div className="space-invite"><label><span>Invite by email</span><div><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@example.com" /><button disabled={pending || !email.trim()} onClick={invite}><UserPlus size={14} /> Invite</button></div></label><small>Access activates automatically when that email signs in.</small></div>}{error && <p className="page-panel-error">{error}</p>}<div className="space-people"><h3>People with access</h3>{loading ? <div className="page-panel-empty"><LoaderCircle className="spin" size={20} /></div> : people.map((person) => <div className="space-person" key={person.id}><span style={{ background: avatarColor(person.email) }}>{person.imageUrl ? <img src={person.imageUrl} alt="" /> : initials(person.name, person.email)}</span><div><strong>{person.name || person.email.split("@")[0]}</strong><small>{person.email}</small></div><em>{person.role === "owner" ? "Owner" : person.status === "pending" ? "Pending" : "Editor"}</em>{isOwner && person.role !== "owner" && <button disabled={pending} onClick={() => remove(person)}><X size={13} /></button>}</div>)}</div></aside></div>;
}
