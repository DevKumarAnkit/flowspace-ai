"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Archive, ArrowLeft, Bold, Check, ChevronRight, Copy, Download, FileText, Folder, Highlighter, Italic, Link2, List, ListChecks, ListOrdered, LoaderCircle, Mic, MoreHorizontal, MoveRight, Pencil, Redo2, RotateCcw, Share2, Star, Strikethrough, Trash2, Underline as UnderlineIcon, Undo2, Unlink, X } from "lucide-react";
import { archivePageAction, duplicatePageAction, movePageAction, permanentlyDeletePageAction, restorePageAction, savePageAction, setPageFavoriteAction } from "@/app/spaces/actions";
import { extractPageExcerpt, formatRelativeTime, PAGE_TEMPLATE_LABELS, type PageDocument, type SpaceDetail, type SpacePage, type SpaceSummary } from "@/lib/spaces-domain";
import { PageComments, PageTaskLinks, SpaceCollaborationButton, SpacePageRoom } from "@/components/spaces/page-collaboration";
import { useAssemblyAIStreaming } from "@/components/notes/use-assemblyai-streaming";
import { transcriptWithBoundarySpacing } from "@/lib/assemblyai-streaming";

type SaveState = "saved" | "dirty" | "saving" | "error";
const messageOf = (error: unknown) => error instanceof Error ? error.message : "Something went wrong.";
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";

export function SpaceDocumentEditor(props: { initialPage: SpacePage; space: SpaceDetail; activeSpaces: SpaceSummary[] }) {
  return <SpacePageRoom pageId={props.initialPage.id}><SpaceDocumentEditorInner {...props} /></SpacePageRoom>;
}

function SpaceDocumentEditorInner({ initialPage, space, activeSpaces }: { initialPage: SpacePage; space: SpaceDetail; activeSpaces: SpaceSummary[] }) {
  const router = useRouter();
  const [page, setPage] = useState(initialPage);
  const [title, setTitle] = useState(initialPage.title);
  const [document, setDocument] = useState<PageDocument>(initialPage.content);
  const [status, setStatus] = useState<SaveState>("saved");
  const [message, setMessage] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [collabOpen, setCollabOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const voiceInsertionRef = useRef<number | null>(null);
  const latest = useRef({ title, document });
  const readonly = Boolean(page.archivedAt || space.archivedAt);

  const save = useCallback(async () => {
    if (readonly) return;
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    try {
      const updated = await savePageAction(page.id, { title: latest.current.title, content: latest.current.document });
      setPage(updated); setStatus("saved");
    } catch (error) { setStatus("error"); setMessage(messageOf(error)); }
  }, [page.id, readonly]);

  const queueSave = useCallback((nextTitle: string, nextDocument: PageDocument) => {
    latest.current = { title: nextTitle, document: nextDocument };
    if (readonly) return;
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 700);
  }, [readonly, save]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readonly,
    extensions: [StarterKit, Underline, Highlight, LinkExtension.configure({ openOnClick: false }), TaskList, TaskItem.configure({ nested: true }), Placeholder.configure({ placeholder: "Start writing, or choose a template when creating a page…" })],
    content: initialPage.content,
    editorProps: { attributes: { class: "space-page-prosemirror" } },
    onUpdate: ({ editor: instance }) => { const next = instance.getJSON() as PageDocument; setDocument(next); queueSave(latest.current.title, next); },
    onSelectionUpdate: ({ editor: instance }) => { if (instance.isFocused) voiceInsertionRef.current = instance.state.selection.from; },
  });

  const insertVoiceTranscript = useCallback((transcript: string) => {
    if (!editor) return;
    const documentEnd = TextSelection.atEnd(editor.state.doc).from;
    const position = Math.max(1, Math.min(voiceInsertionRef.current ?? documentEnd, documentEnd));
    const before = position > 0 ? editor.state.doc.textBetween(position - 1, position, "\0") : "";
    const after = position < editor.state.doc.content.size ? editor.state.doc.textBetween(position, position + 1, "\0") : "";
    const insertion = transcriptWithBoundarySpacing(transcript, before, after);
    if (!insertion) return;
    editor.view.dispatch(editor.state.tr.insertText(insertion, position));
    voiceInsertionRef.current = position + insertion.length;
  }, [editor]);
  const voice = useAssemblyAIStreaming({ onFinalTranscript: insertVoiceTranscript });

  useEffect(() => { editor?.setEditable(!readonly); }, [editor, readonly]);

  const mutate = (action: () => Promise<void>) => { setMessage(""); startTransition(() => void action().catch((error) => setMessage(messageOf(error)))); };
  const changeTitle = (value: string) => { setTitle(value); queueSave(value, latest.current.document); };
  const setLink = () => { if (!editor) return; const previous = editor.getAttributes("link").href as string | undefined; setLinkValue(previous || "https://"); setLinkOpen(true); };
  const applyLink = () => { if (!editor) return; const value = linkValue.trim(); if (!value) editor.chain().focus().unsetLink().run(); else editor.chain().focus().extendMarkRange("link").setLink({ href: value }).run(); setLinkOpen(false); };
  const startVoiceRecording = () => { if (!editor) return; voiceInsertionRef.current = editor.isFocused ? editor.state.selection.from : TextSelection.atEnd(editor.state.doc).from; void voice.startRecording(); };
  const exportHtml = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/[<>&"]/g, "")}</title></head><body><h1>${title.replace(/[<>&"]/g, "")}</h1>${editor?.getHTML() ?? ""}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" })); const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = `${slug(title)}.html`; anchor.style.display = "none"; window.document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="space-document-view" style={{ "--space-color": space.color } as React.CSSProperties}>
    {(message || voice.error || voice.notice) && <div className="spaces-toast" role="status">{message || voice.error || voice.notice}<button onClick={() => message ? setMessage("") : voice.notice ? voice.clearNotice() : voice.clearError()} aria-label="Dismiss"><X size={14} /></button></div>}
    {readonly && <div className="space-archived-banner"><Archive size={14} /> {space.archivedAt ? "This space is archived." : "This page is archived."} Restore it before editing.</div>}
    <header className="document-head">
      <div className="document-nav-row"><Link className="document-back" href={`/spaces/${space.id}`}><ArrowLeft size={14} /> Back to {space.name}</Link><div className="space-breadcrumb"><Link href="/spaces">All Spaces</Link><ChevronRight size={13} /><Link href={`/spaces/${space.id}`}>{space.name}</Link><ChevronRight size={13} /><span>{page.title}</span></div></div>
      <div className="document-title-row"><span className="document-icon"><FileText size={20} /></span><input ref={titleInput} value={title} maxLength={160} readOnly={readonly} onChange={(event) => changeTitle(event.target.value)} onBlur={() => status === "dirty" && void save()} aria-label="Page title" /><button type="button" className={`speak-to-note document-voice ${voice.isRecording ? "recording" : ""}`} disabled={readonly || voice.isBusy} onMouseDown={(event) => event.preventDefault()} onClick={() => voice.isRecording ? voice.stopRecording() : startVoiceRecording()}><span className="voice-mic"><Mic size={13} /></span><span>{voice.status === "stopping" ? "Stopping…" : voice.isRecording ? "Stop" : "Voice to text"}</span></button><button className="document-export" onClick={exportHtml}><Download size={14} /><span>Export</span></button><span className={`document-save ${status}`} onClick={() => status === "error" && void save()}>{status === "saving" ? <LoaderCircle className="spin" size={13} /> : status === "saved" ? <Check size={13} /> : null}{status === "saved" ? "Saved" : status === "dirty" ? "Unsaved" : status === "saving" ? "Saving…" : "Retry save"}</span><SpaceCollaborationButton spaceId={space.id} isOwner={space.accessRole === "owner"} open={collabOpen} onOpenChange={setCollabOpen} /><DocumentMenu page={page} readonly={readonly} mutate={mutate} patch={setPage} rename={() => { titleInput.current?.focus(); titleInput.current?.select(); }} move={() => setMoveOpen(true)} duplicate={async () => { await save(); const copy = await duplicatePageAction(page.id); router.push(`/spaces/${copy.spaceId}/pages/${copy.pageId}`); }} share={() => setCollabOpen(true)} exportHtml={exportHtml} archive={async () => { await save(); await archivePageAction(page.id); router.push(`/spaces/${space.id}`); }} restore={async () => { await restorePageAction(page.id); setPage((current) => ({ ...current, archivedAt: null })); }} remove={() => setDeleteOpen(true)} /></div>
    </header>
    {!['idle', 'error'].includes(voice.status) && <div className="voice-preview document-voice-preview" role="status" aria-live="polite"><span className="voice-preview-icon"><Mic size={12} /></span><div><strong>{voice.status === "recording" ? "Listening" : voice.status === "stopping" ? "Finishing transcript" : "Starting live transcription"}</strong><span>{voice.preview || (voice.status === "recording" ? "Start speaking—your words will be inserted at the cursor." : "Securely connecting…")}</span></div>{voice.isRecording && voice.status !== "stopping" && <button type="button" onClick={() => voice.stopRecording()}>Stop</button>}</div>}
    <section className="document-info-card"><div><span className="page-type-badge">{PAGE_TEMPLATE_LABELS[page.template]}</span><span><Folder size={12} /> {space.name}</span></div><p>{extractPageExcerpt(document)}</p><div className="document-meta"><PageComments pageId={page.id} /><PageTaskLinks pageId={page.id} /><span><span className="page-updater">{page.updatedBy.name.slice(0, 2).toUpperCase()}</span><b>Last edited by</b><em>{page.updatedBy.name} · {formatRelativeTime(page.updatedAt)}</em></span></div></section>
    <section className="document-editor-shell">
      <div className="document-toolbar"><button onClick={() => editor?.chain().focus().toggleBold().run()} className={editor?.isActive("bold") ? "active" : ""} disabled={readonly}><Bold size={15} /></button><button onClick={() => editor?.chain().focus().toggleItalic().run()} className={editor?.isActive("italic") ? "active" : ""} disabled={readonly}><Italic size={15} /></button><button onClick={() => editor?.chain().focus().toggleUnderline().run()} className={editor?.isActive("underline") ? "active" : ""} disabled={readonly}><UnderlineIcon size={15} /></button><button onClick={() => editor?.chain().focus().toggleStrike().run()} className={editor?.isActive("strike") ? "active" : ""} disabled={readonly}><Strikethrough size={15} /></button><button onClick={() => editor?.chain().focus().toggleHighlight().run()} className={editor?.isActive("highlight") ? "active" : ""} disabled={readonly}><Highlighter size={15} /></button><i /><button onClick={() => editor?.chain().focus().toggleBulletList().run()} className={editor?.isActive("bulletList") ? "active" : ""} disabled={readonly}><List size={15} /></button><button onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={editor?.isActive("orderedList") ? "active" : ""} disabled={readonly}><ListOrdered size={15} /></button><button onClick={() => editor?.chain().focus().toggleTaskList().run()} className={editor?.isActive("taskList") ? "active" : ""} disabled={readonly}><ListChecks size={15} /></button><i /><button onClick={setLink} className={editor?.isActive("link") ? "active" : ""} disabled={readonly}><Link2 size={15} /></button><button onClick={() => editor?.chain().focus().unsetLink().run()} disabled={readonly || !editor?.isActive("link")}><Unlink size={15} /></button><span /><button onClick={() => editor?.chain().focus().undo().run()} disabled={readonly || !editor?.can().undo()}><Undo2 size={15} /></button><button onClick={() => editor?.chain().focus().redo().run()} disabled={readonly || !editor?.can().redo()}><Redo2 size={15} /></button></div>
      <div className="document-paper"><EditorContent editor={editor} /></div>
    </section>
    <MovePageDialog open={moveOpen} pending={pending} page={page} spaces={activeSpaces} close={() => !pending && setMoveOpen(false)} move={(spaceId) => mutate(async () => { await save(); const moved = await movePageAction(page.id, spaceId); setMoveOpen(false); router.push(`/spaces/${moved.spaceId}/pages/${moved.pageId}`); })} />
    <Dialog.Root open={linkOpen} onOpenChange={setLinkOpen}><Dialog.Portal><Dialog.Overlay className="spaces-dialog-overlay" /><Dialog.Content className="spaces-dialog link-dialog"><div className="spaces-dialog-heading"><span><Link2 size={19} /></span><div><Dialog.Title>Add or Edit Link</Dialog.Title><Dialog.Description>Paste a web address for the selected text.</Dialog.Description></div><Dialog.Close><X size={17} /></Dialog.Close></div><form onSubmit={(event) => { event.preventDefault(); applyLink(); }}><label><span>Link URL</span><input autoFocus type="url" value={linkValue} onChange={(event) => setLinkValue(event.target.value)} placeholder="https://example.com" /></label><div className="spaces-dialog-footer"><button type="button" className="secondary" onClick={() => { editor?.chain().focus().unsetLink().run(); setLinkOpen(false); }}>Remove Link</button><button type="submit" disabled={!linkValue.trim()}>Apply Link</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>
    <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialog.Portal><AlertDialog.Overlay className="spaces-dialog-overlay" /><AlertDialog.Content className="spaces-alert"><span className="danger-icon"><Trash2 size={19} /></span><AlertDialog.Title>Delete “{page.title}” permanently?</AlertDialog.Title><AlertDialog.Description>This document and its content cannot be recovered.</AlertDialog.Description><div><AlertDialog.Cancel>Cancel</AlertDialog.Cancel><AlertDialog.Action onClick={() => mutate(async () => { await permanentlyDeletePageAction(page.id); router.push(`/spaces/${space.id}`); })}>Delete page</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  </div>;
}

function DocumentMenu({ page, readonly, mutate, patch, rename, move, duplicate, share, exportHtml, archive, restore, remove }: { page: SpacePage; readonly: boolean; mutate: (task: () => Promise<void>) => void; patch: (page: SpacePage) => void; rename: () => void; move: () => void; duplicate: () => Promise<void>; share: () => void; exportHtml: () => void; archive: () => Promise<void>; restore: () => Promise<void>; remove: () => void }) {
  return <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="space-more-button" aria-label="Page actions"><MoreHorizontal size={18} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="spaces-menu" align="end" sideOffset={5}>{!page.archivedAt ? <><DropdownMenu.Item onSelect={rename}><Pencil size={13} /> Rename</DropdownMenu.Item><DropdownMenu.Item onSelect={move}><MoveRight size={13} /> Move</DropdownMenu.Item><DropdownMenu.Item onSelect={() => void duplicate()}><Copy size={13} /> Duplicate</DropdownMenu.Item><DropdownMenu.Item onSelect={() => mutate(async () => { await setPageFavoriteAction(page.id, !page.isFavorite); patch({ ...page, isFavorite: !page.isFavorite }); })}><Star size={13} /> {page.isFavorite ? "Remove favorite" : "Favorite"}</DropdownMenu.Item><DropdownMenu.Item onSelect={share}><Share2 size={13} /> Share</DropdownMenu.Item><DropdownMenu.Item onSelect={exportHtml}><Download size={13} /> Export HTML</DropdownMenu.Item><DropdownMenu.Item onSelect={() => void archive()}><Archive size={13} /> Archive</DropdownMenu.Item></> : <><DropdownMenu.Item disabled={readonly && Boolean(page.archivedAt) === false} onSelect={() => void restore()}><RotateCcw size={13} /> Restore Page</DropdownMenu.Item><DropdownMenu.Item onSelect={exportHtml}><Download size={13} /> Export HTML</DropdownMenu.Item><DropdownMenu.Item className="danger" onSelect={remove}><Trash2 size={13} /> Delete permanently</DropdownMenu.Item></>}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}

function MovePageDialog({ open, pending, page, spaces, close, move }: { open: boolean; pending: boolean; page: SpacePage; spaces: SpaceSummary[]; close: () => void; move: (spaceId: number) => void }) {
  const choices = spaces.filter((space) => space.id !== page.spaceId); const [spaceId, setSpaceId] = useState(choices[0]?.id ?? page.spaceId);
  return <Dialog.Root open={open} onOpenChange={(value) => !value && close()}><Dialog.Portal><Dialog.Overlay className="spaces-dialog-overlay" /><Dialog.Content className="spaces-dialog move-page-dialog"><div className="spaces-dialog-heading"><span><MoveRight size={19} /></span><div><Dialog.Title>Move Page</Dialog.Title><Dialog.Description>Choose another active space for this document.</Dialog.Description></div><Dialog.Close disabled={pending}><X size={17} /></Dialog.Close></div>{choices.length ? <form onSubmit={(event) => { event.preventDefault(); move(spaceId); }}><label><span>Destination Space</span><select value={spaceId} onChange={(event) => setSpaceId(Number(event.target.value))}>{choices.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</select></label><div className="spaces-dialog-footer"><button type="button" className="secondary" onClick={close}>Cancel</button><button type="submit" disabled={pending}>{pending ? "Moving…" : "Move Page"}</button></div></form> : <div className="move-empty"><Folder size={21} /><strong>No other active spaces</strong><p>Create another space before moving this page.</p><button onClick={close}>Close</button></div>}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
