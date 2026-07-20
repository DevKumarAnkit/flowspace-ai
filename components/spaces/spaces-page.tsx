"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Archive, Check, Clock3, Copy, Folder, Grid2X2, List, LoaderCircle, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Star, Trash2, UserPlus, X } from "lucide-react";
import { archiveSpaceAction, createSpaceAction, duplicateSpaceAction, permanentlyDeleteSpaceAction, restoreSpaceAction, setSpaceFavoriteAction, updateSpaceAction } from "@/app/spaces/actions";
import { filterSpaces, formatRelativeTime, sortSpaces, SPACE_COLORS, type SpaceFilter, type SpaceSort, type SpaceSummary } from "@/lib/spaces-domain";
import { SpaceCollaborationPanel } from "@/components/spaces/page-collaboration";

type SpaceDraft = { id?: number; name: string; description: string; color: string };
const emptyDraft = (): SpaceDraft => ({ name: "", description: "", color: SPACE_COLORS[0] });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const messageOf = (error: unknown) => error instanceof Error ? error.message : "Something went wrong.";

export function SpacesPage({ initialSpaces }: { initialSpaces: SpaceSummary[] }) {
  const [spaces, setSpaces] = useState(initialSpaces);
  const [filter, setFilter] = useState<SpaceFilter>("all");
  const [sort, setSort] = useState<SpaceSort>("updated");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [draft, setDraft] = useState<SpaceDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SpaceSummary | null>(null);
  const [sharingTarget, setSharingTarget] = useState<SpaceSummary | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const visible = useMemo(() => sortSpaces(filterSpaces(spaces, filter, query), sort), [filter, query, sort, spaces]);
  const activeCount = spaces.filter((space) => !space.archivedAt).length;

  useEffect(() => {
    const saved = window.sessionStorage.getItem("flowspace:spaces-view");
    if (saved === "grid" || saved === "list") setView(saved);
  }, []);
  useEffect(() => { window.sessionStorage.setItem("flowspace:spaces-view", view); }, [view]);

  const mutate = (action: () => Promise<void>) => {
    setMessage("");
    startTransition(() => void action().catch((error) => setMessage(messageOf(error))));
  };
  const refresh = () => window.location.reload();
  const saveDraft = () => draft && mutate(async () => {
    if (draft.id) await updateSpaceAction(draft.id, draft);
    else await createSpaceAction(draft);
    setDraft(null); refresh();
  });
  const patchSpace = (id: number, values: Partial<SpaceSummary>) => setSpaces((current) => current.map((space) => space.id === id ? { ...space, ...values } : space));

  return <div className="spaces-view">
    {message && <div className="spaces-toast" role="status">{message}<button onClick={() => setMessage("")} aria-label="Dismiss"><X size={14} /></button></div>}
    <section className="spaces-hero"><div><span className="spaces-eyebrow"><Folder size={13} /> Pages & Spaces</span><h1>{filter === "archived" ? "Archived Spaces" : filter === "favorites" ? "Favorite Spaces" : filter === "recent" ? "Recently Opened" : "All Spaces"}</h1><p>{activeCount} {activeCount === 1 ? "space" : "spaces"} · Keep related pages together and easy to find.</p></div><button className="spaces-primary" onClick={() => setDraft(emptyDraft())}><Plus size={16} /> New Space</button></section>
    <section className="spaces-toolbar">
      <label className="spaces-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search spaces or pages…" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={13} /></button>}</label>
      <div className="spaces-view-toggle" aria-label="View"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Grid view"><Grid2X2 size={15} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="List view"><List size={15} /></button></div>
      <label className="spaces-sort"><span>Sort:</span><select value={sort} onChange={(event) => setSort(event.target.value as SpaceSort)}><option value="updated">Recently Updated</option><option value="name">Name</option><option value="pages">Most Pages</option><option value="favorites">Favorites</option></select></label>
    </section>
    <nav className="spaces-tabs" aria-label="Space filters">{([['all', Grid2X2, 'All Spaces'], ['favorites', Star, 'Favorites'], ['recent', Clock3, 'Recently Opened'], ['archived', Archive, 'Archived']] as const).map(([value, Icon, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}><Icon size={13} />{label}</button>)}</nav>

    {visible.length ? <div className={`spaces-collection ${view}`}>{visible.map((space) => <article className="workspace-card" key={space.id} style={{ "--space-color": space.color } as React.CSSProperties}>
      <Link className="workspace-card-link" href={`/spaces/${space.id}`}><div className="workspace-card-top"><span className="space-folder"><Folder size={22} fill="currentColor" /></span><span className={`space-star ${space.isFavorite ? "active" : ""}`}><Star size={15} fill={space.isFavorite ? "currentColor" : "none"} /></span></div><div className="workspace-card-copy"><h2>{space.name}</h2><p>{space.description || "A focused home for related pages."}</p></div><div className="workspace-card-meta"><span className="space-owner" title={space.owner.email}>{space.owner.imageUrl ? <img src={space.owner.imageUrl} alt="" /> : initials(space.owner.name)}</span><span>{space.pageCount} {space.pageCount === 1 ? "Page" : "Pages"}</span><i /><span>Updated {formatRelativeTime(space.updatedAt)}</span></div></Link>
      <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="workspace-card-more" aria-label={`Actions for ${space.name}`}><MoreHorizontal size={17} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="spaces-menu" align="end" sideOffset={5}>
        {!space.archivedAt ? <>{space.accessRole === "owner" && <><DropdownMenu.Item onSelect={() => setDraft({ id: space.id, name: space.name, description: space.description, color: space.color })}><Pencil size={13} /> Rename & edit</DropdownMenu.Item><DropdownMenu.Item onSelect={() => mutate(async () => { await setSpaceFavoriteAction(space.id, !space.isFavorite); patchSpace(space.id, { isFavorite: !space.isFavorite }); })}><Star size={13} /> {space.isFavorite ? "Remove favorite" : "Add to favorites"}</DropdownMenu.Item></>}<DropdownMenu.Item onSelect={() => mutate(async () => { await duplicateSpaceAction(space.id); refresh(); })}><Copy size={13} /> Duplicate</DropdownMenu.Item><DropdownMenu.Item onSelect={() => setSharingTarget(space)}><UserPlus size={13} /> {space.accessRole === "owner" ? "Invite collaborators" : "View collaborators"}</DropdownMenu.Item>{space.accessRole === "owner" && <DropdownMenu.Item onSelect={() => mutate(async () => { await archiveSpaceAction(space.id); patchSpace(space.id, { archivedAt: new Date().toISOString(), isFavorite: false }); })}><Archive size={13} /> Archive</DropdownMenu.Item>}</> : <>{space.accessRole === "owner" && <><DropdownMenu.Item onSelect={() => mutate(async () => { await restoreSpaceAction(space.id); patchSpace(space.id, { archivedAt: null }); setFilter("all"); })}><RotateCcw size={13} /> Restore</DropdownMenu.Item><DropdownMenu.Item className="danger" onSelect={() => setDeleteTarget(space)}><Trash2 size={13} /> Delete permanently</DropdownMenu.Item></>}</>}
      </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
    </article>)}</div> : <div className="spaces-empty"><span><Folder size={28} /></span><h2>{query ? "No matching spaces" : filter === "all" ? "Create your first space" : `No ${filter} spaces`}</h2><p>{query ? "Try a different space name, description, or page title." : filter === "all" ? "Spaces keep projects, research, and ideas organized without the clutter." : "Spaces will appear here when they match this view."}</p>{filter === "all" && !query && <button onClick={() => setDraft(emptyDraft())}><Plus size={15} /> Create Space</button>}</div>}

    <SpaceDialog draft={draft} pending={pending} close={() => !pending && setDraft(null)} change={setDraft} save={saveDraft} />
    {sharingTarget && <SpaceCollaborationPanel spaceId={sharingTarget.id} isOwner={sharingTarget.accessRole === "owner"} close={() => setSharingTarget(null)} />}
    <AlertDialog.Root open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><AlertDialog.Portal><AlertDialog.Overlay className="spaces-dialog-overlay" /><AlertDialog.Content className="spaces-alert"><span className="danger-icon"><Trash2 size={19} /></span><AlertDialog.Title>Delete “{deleteTarget?.name}” permanently?</AlertDialog.Title><AlertDialog.Description>Every page in this space will be deleted. This cannot be undone.</AlertDialog.Description><div><AlertDialog.Cancel>Cancel</AlertDialog.Cancel><AlertDialog.Action onClick={() => deleteTarget && mutate(async () => { await permanentlyDeleteSpaceAction(deleteTarget.id); setSpaces((current) => current.filter((space) => space.id !== deleteTarget.id)); setDeleteTarget(null); })}>Delete space</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  </div>;
}

function SpaceDialog({ draft, pending, close, change, save }: { draft: SpaceDraft | null; pending: boolean; close: () => void; change: (draft: SpaceDraft | null) => void; save: () => void }) {
  return <Dialog.Root open={Boolean(draft)} onOpenChange={(open) => !open && close()}><Dialog.Portal><Dialog.Overlay className="spaces-dialog-overlay" /><Dialog.Content className="spaces-dialog"><div className="spaces-dialog-heading"><span><Folder size={19} /></span><div><Dialog.Title>{draft?.id ? "Edit Space" : "Create New Space"}</Dialog.Title><Dialog.Description>{draft?.id ? "Update this space’s name, description, and color." : "Give related pages a focused home."}</Dialog.Description></div><Dialog.Close disabled={pending}><X size={17} /></Dialog.Close></div>{draft && <form onSubmit={(event) => { event.preventDefault(); save(); }}><label><span>Space Name</span><input autoFocus required maxLength={160} value={draft.name} onChange={(event) => change({ ...draft, name: event.target.value })} placeholder="e.g. Marketing Team" /></label><label><span>Description <small>Optional</small></span><textarea maxLength={500} value={draft.description} onChange={(event) => change({ ...draft, description: event.target.value })} placeholder="What is this space about?" /><small>{draft.description.length}/500</small></label><fieldset><legend>Color</legend><div className="spaces-color-row">{SPACE_COLORS.map((color) => <button key={color} type="button" className={draft.color === color ? "active" : ""} style={{ background: color }} aria-label={`Choose ${color}`} onClick={() => change({ ...draft, color })}>{draft.color === color && <Check size={12} />}</button>)}</div></fieldset><div className="spaces-dialog-footer"><button type="button" className="secondary" onClick={close} disabled={pending}>Cancel</button><button type="submit" disabled={pending || !draft.name.trim()}>{pending && <LoaderCircle className="spin" size={14} />}{pending ? "Saving…" : draft.id ? "Save Changes" : "Create Space"}</button></div></form>}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
