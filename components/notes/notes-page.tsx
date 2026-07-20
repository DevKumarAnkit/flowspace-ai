"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import { EditorContent, useEditor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CharacterCount from "@tiptap/extension-character-count";
import {
  ArrowLeft, Bold, BookOpen, Briefcase, Check, CheckSquare, ChevronDown, Code2, Copy, Download, FileText, Heading1, Heading2,
  Heading3, Highlighter, Italic, Lightbulb, Link2, List, ListOrdered, LoaderCircle, MoreHorizontal, Palette,
  Mic, Pin, Plus, Quote, Redo2, RefreshCcw, RotateCcw, Search, Sparkles, Strikethrough, Trash2, Underline as UnderlineIcon,
  Save, Star, Tag, Undo2, WandSparkles, X,
} from "lucide-react";
import {
  createNoteAction, duplicateNoteAction, permanentlyDeleteNoteAction, renameNoteAction, restoreNoteAction,
  saveNoteAction, setNoteCategoryAction, setNoteColorAction, setNoteIconAction, setNotePinnedAction, trashNoteAction,
} from "@/app/notes/actions";
import { formatNoteTime, NOTE_COLORS, NOTE_ICONS, sortNotes, type Note, type NoteIcon, type RefineAction, type RefineTone, type TiptapDocument } from "@/lib/notes-domain";
import { SlashCommand } from "@/components/notes/slash-command";
import { useAssemblyAIStreaming } from "@/components/notes/use-assemblyai-streaming";
import { transcriptWithBoundarySpacing } from "@/lib/assemblyai-streaming";
import type { UserCategory } from "@/lib/settings-domain";

type Mode = "active" | "pinned" | "trash";
type SaveStatus = "saved" | "dirty" | "saving" | "error";

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function NoteGlyph({ icon, size = 13 }: { icon: NoteIcon; size?: number }) {
  const Glyph = icon === "idea" ? Lightbulb : icon === "book" ? BookOpen : icon === "tasks" ? CheckSquare : icon === "star" ? Star : icon === "work" ? Briefcase : FileText;
  return <Glyph size={size} />;
}

function LocalNoteTime({ value, prefix = "" }: { value: string; prefix?: string }) {
  const [label, setLabel] = useState("Recently");
  useEffect(() => setLabel(formatNoteTime(value)), [value]);
  return <>{prefix}{label}</>;
}

export function NotesPage({ initialNotes, initialSelectedNoteId, initialCategories, autoSave, aiRefine }: { initialNotes: Note[]; initialSelectedNoteId: number | null; initialCategories: UserCategory[]; autoSave: boolean; aiRefine: boolean }) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [selectedId, setSelectedId] = useState(initialSelectedNoteId);
  const [mode, setMode] = useState<Mode>(() => initialNotes.find((note) => note.id === initialSelectedNoteId)?.trashedAt ? "trash" : "active");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | "all">("all");
  const [menuId, setMenuId] = useState<number | null>(null);
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [message, setMessage] = useState("");
  const [mobileEditor, setMobileEditor] = useState(Boolean(initialSelectedNoteId));
  const [, startTransition] = useTransition();
  const flushRef = useRef<(() => Promise<void>) | null>(null);

  const activeNotes = useMemo(() => sortNotes(notes.filter((note) => !note.trashedAt)), [notes]);
  const pinnedNotes = useMemo(() => activeNotes.filter((note) => note.isPinned), [activeNotes]);
  const trashNotes = useMemo(() => [...notes.filter((note) => note.trashedAt)].sort((a, b) => Date.parse(b.trashedAt!) - Date.parse(a.trashedAt!)), [notes]);
  const visibleNotes = useMemo(() => {
    const source = mode === "active" ? activeNotes : mode === "pinned" ? pinnedNotes : trashNotes;
    const normalized = query.trim().toLowerCase();
    const categorized = categoryFilter === "all" ? source : source.filter((note) => note.categoryId === categoryFilter);
    return normalized ? categorized.filter((note) => note.title.toLowerCase().includes(normalized)) : categorized;
  }, [activeNotes, categoryFilter, mode, pinnedNotes, query, trashNotes]);
  const selected = notes.find((note) => note.id === selectedId) ?? null;

  const replaceNote = useCallback((note: Note) => setNotes((current) => current.map((entry) => entry.id === note.id ? note : entry)), []);
  const choose = useCallback(async (id: number) => {
    await flushRef.current?.();
    setSelectedId(id);
    setMenuId(null);
    setMobileEditor(true);
    router.replace(`/notes?note=${id}`, { scroll: false });
  }, [router]);

  const perform = useCallback((task: () => Promise<void>) => {
    setMessage("");
    startTransition(() => { void task().catch((error) => setMessage(messageOf(error))); });
  }, []);

  const createNote = () => perform(async () => {
    await flushRef.current?.();
    const note = await createNoteAction();
    setNotes((current) => [note, ...current]);
    setMode("active");
    setQuery("");
    await choose(note.id);
  });

  const openMode = async (next: Mode) => {
    await flushRef.current?.();
    setMode(next);
    setQuery("");
    setMenuId(null);
    const first = next === "active" ? activeNotes[0] : next === "pinned" ? pinnedNotes[0] : trashNotes[0];
    setSelectedId(first?.id ?? null);
    setMobileEditor(false);
    router.replace(first ? `/notes?note=${first.id}` : "/notes", { scroll: false });
  };

  const submitRename = (note: Note) => perform(async () => {
    const updated = await renameNoteAction(note.id, renameTitle);
    replaceNote(updated);
    setRenameId(null);
  });

  const trash = (note: Note) => perform(async () => {
    await flushRef.current?.();
    const updated = await trashNoteAction(note.id);
    replaceNote(updated);
    setMenuId(null);
    if (selectedId === note.id) {
      const next = activeNotes.find((entry) => entry.id !== note.id) ?? null;
      setSelectedId(next?.id ?? null);
      setMobileEditor(false);
      router.replace(next ? `/notes?note=${next.id}` : "/notes", { scroll: false });
    }
  });

  const restore = (note: Note) => perform(async () => {
    const updated = await restoreNoteAction(note.id);
    replaceNote(updated);
    setMode("active");
    await choose(updated.id);
  });

  const deleteForever = (note: Note) => {
    if (!window.confirm(`Delete “${note.title}” forever? This cannot be undone.`)) return;
    perform(async () => {
      await permanentlyDeleteNoteAction(note.id);
      setNotes((current) => current.filter((entry) => entry.id !== note.id));
      const next = trashNotes.find((entry) => entry.id !== note.id) ?? null;
      setSelectedId(next?.id ?? null);
      setMobileEditor(false);
      router.replace(next ? `/notes?note=${next.id}` : "/notes", { scroll: false });
    });
  };

  return (
    <div className={`notes-workspace ${mobileEditor ? "show-mobile-editor" : ""}`}>
      <aside className="notes-rail">
        <div className="notes-rail-head">
          <div><span><FileText size={16} /></span><div><strong>{mode === "active" ? "Active Notes" : mode === "pinned" ? "Pinned Notes" : "Trash"}</strong><small>{mode === "active" ? `${activeNotes.length} active` : mode === "pinned" ? `${pinnedNotes.length} pinned` : `${trashNotes.length} trashed`}</small></div></div>
          <button className="notes-new" onClick={createNote}><Plus size={15} /> New Note</button>
        </div>
        <label className="notes-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${mode === "trash" ? "Trash" : "notes"}…`} />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={12} /></button>}</label>
        <select className="notes-category-filter" aria-label="Filter notes by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value === "all" ? "all" : Number(event.target.value))}><option value="all">All categories</option>{initialCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        <div className="notes-filter-tabs" aria-label="Note status filters">
          <button className={mode === "active" ? "active" : ""} onClick={() => void openMode("active")}><FileText size={12} /><span>Active</span><small>{activeNotes.length}</small></button>
          <button className={mode === "pinned" ? "active" : ""} onClick={() => void openMode("pinned")}><Pin size={12} /><span>Pinned</span><small>{pinnedNotes.length}</small></button>
        </div>
        <div className="notes-list">
          {visibleNotes.map((note) => (
            <div className={`note-list-row ${selectedId === note.id ? "selected" : ""}`} key={note.id} style={{ "--note-color": note.color } as React.CSSProperties}>
              {renameId === note.id ? (
                <form className="note-rename" onSubmit={(event) => { event.preventDefault(); submitRename(note); }}>
                  <input autoFocus maxLength={160} value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} onBlur={() => { if (renameTitle.trim() && renameTitle.trim() !== note.title) submitRename(note); else setRenameId(null); }} onKeyDown={(event) => { if (event.key === "Escape") setRenameId(null); }} />
                </form>
              ) : (
                <button className="note-select" onClick={() => void choose(note.id)}>
                  <i><NoteGlyph icon={note.icon} /></i><span><strong>{note.title}</strong><small><LocalNoteTime value={note.updatedAt} prefix="Updated " /></small></span>
                </button>
              )}
              {mode !== "trash" && <button className={`note-pin ${note.isPinned ? "active" : ""}`} aria-label={note.isPinned ? "Unpin note" : "Pin note"} onClick={() => perform(async () => replaceNote(await setNotePinnedAction(note.id, !note.isPinned)))}><Pin size={12} fill={note.isPinned ? "currentColor" : "none"} /></button>}
              {mode === "trash" && <button className="note-restore" aria-label={`Move ${note.title} to Notes`} title="Move to Notes" onClick={() => restore(note)}><RefreshCcw size={12} /><span>Move</span></button>}
              <button className="note-more" aria-label={`Actions for ${note.title}`} onClick={() => setMenuId(menuId === note.id ? null : note.id)}><MoreHorizontal size={14} /></button>
              {menuId === note.id && <NoteMenu note={note} categories={initialCategories} mode={mode} close={() => setMenuId(null)} onRename={() => { setRenameId(note.id); setRenameTitle(note.title); setMenuId(null); }} onUpdated={replaceNote} perform={perform} onTrash={() => trash(note)} onRestore={() => restore(note)} onDelete={() => deleteForever(note)} onDuplicate={async () => { const copy = await duplicateNoteAction(note.id); setNotes((current) => [copy, ...current]); await choose(copy.id); }} />}
            </div>
          ))}
          {!visibleNotes.length && <div className="notes-empty-list"><FileText size={23} /><strong>{query ? "No matching notes" : mode === "trash" ? "Trash is empty" : mode === "pinned" ? "No pinned notes" : "A quiet place for ideas"}</strong><span>{query ? "Try a different title." : mode === "trash" ? "Deleted notes will wait here." : mode === "pinned" ? "Pin an important note to keep it close." : "Create your first note to begin."}</span>{mode === "active" && !query && <button onClick={createNote}><Plus size={13} /> New Note</button>}</div>}
        </div>
        <button className={`trash-nav ${mode === "trash" ? "active" : ""}`} onClick={() => void openMode("trash")}><Trash2 size={14} /><span>Trashed</span>{trashNotes.length > 0 && <small>{trashNotes.length}</small>}</button>
      </aside>

      <main className="notes-editor-panel">
        {message && <div className="notes-toast" role="status">{message}<button aria-label="Dismiss" onClick={() => setMessage("")}><X size={13} /></button></div>}
        {selected ? (
          selected.trashedAt ? <TrashPreview key={selected.id} note={selected} back={() => setMobileEditor(false)} restore={() => restore(selected)} deleteForever={() => deleteForever(selected)} /> :
            <NoteEditor key={selected.id} note={selected} autoSave={autoSave} aiRefine={aiRefine} onSaved={replaceNote} registerFlush={(flush) => { flushRef.current = flush; }} back={() => setMobileEditor(false)} />
        ) : <EmptyEditor mode={mode} createNote={createNote} back={() => setMobileEditor(false)} />}
      </main>
    </div>
  );
}

function NoteMenu({ note, categories, mode, close, onRename, onUpdated, perform, onTrash, onRestore, onDelete, onDuplicate }: {
  note: Note; categories: UserCategory[]; mode: Mode; close: () => void; onRename: () => void; onUpdated: (note: Note) => void; perform: (task: () => Promise<void>) => void;
  onTrash: () => void; onRestore: () => void; onDelete: () => void; onDuplicate: () => Promise<void>;
}) {
  return <div className="note-menu" role="menu" onMouseLeave={close}>
    {mode !== "trash" ? <>
      <button onClick={onRename}><FileText size={13} /> Rename</button>
      <button onClick={() => perform(onDuplicate)}><Copy size={13} /> Duplicate</button>
      <label className="note-category-menu"><span><Tag size={12} /> Category</span><select value={note.categoryId ?? ""} onChange={(event) => perform(async () => onUpdated(await setNoteCategoryAction(note.id, event.target.value ? Number(event.target.value) : null)))}><option value="">Uncategorized</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
      <div className="note-color-menu"><span><Palette size={12} /> Color</span><div>{NOTE_COLORS.map((color) => <button key={color} aria-label={`Choose ${color}`} className={note.color === color ? "active" : ""} style={{ background: color }} onClick={() => perform(async () => { onUpdated(await setNoteColorAction(note.id, color)); close(); })}>{note.color === color && <Check size={9} />}</button>)}</div></div>
      <div className="note-icon-menu"><span><Sparkles size={12} /> Icon</span><div>{NOTE_ICONS.map((icon) => <button key={icon} aria-label={`Choose ${icon} icon`} className={note.icon === icon ? "active" : ""} onClick={() => perform(async () => { onUpdated(await setNoteIconAction(note.id, icon)); close(); })}><NoteGlyph icon={icon} size={13} /></button>)}</div></div>
      <button className="danger" onClick={onTrash}><Trash2 size={13} /> Delete</button>
    </> : <>
      <button onClick={onRestore}><RefreshCcw size={13} /> Move to Notes</button>
      <button className="danger" onClick={onDelete}><Trash2 size={13} /> Delete forever</button>
    </>}
  </div>;
}

function NoteEditor({ note, autoSave, aiRefine, onSaved, registerFlush, back }: { note: Note; autoSave: boolean; aiRefine: boolean; onSaved: (note: Note) => void; registerFlush: (flush: () => Promise<void>) => void; back: () => void }) {
  const [title, setTitle] = useState(note.title);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [words, setWords] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const pending = useRef<{ title: string; content: TiptapDocument } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const titleRef = useRef(title);
  const voiceInsertionRef = useRef<number | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Press / for commands" }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Underline,
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
      SlashCommand,
    ],
    content: note.content,
    editorProps: { attributes: { class: "notes-prosemirror", "aria-label": "Note content" } },
    onCreate: ({ editor: instance }) => setWords(instance.storage.characterCount.words()),
    onUpdate: ({ editor: instance }) => {
      setWords(instance.storage.characterCount.words());
      queueSave(titleRef.current, instance.getJSON() as TiptapDocument);
    },
    onSelectionUpdate: ({ editor: instance }) => {
      if (instance.isFocused) voiceInsertionRef.current = instance.state.selection.from;
    },
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
  const exportNote = () => {
    if (!editor) return;
    const safeTitle = title.replace(/[<>&"]/g, "");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title></head><body><h1>${safeTitle}</h1>${editor.getHTML()}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "note"}.html`;
    anchor.style.display = "none";
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (running.current) await running.current;
    const payload = pending.current;
    if (!payload) return;
    pending.current = null;
    setStatus("saving");
    const task = saveNoteAction(note.id, payload).then((saved) => { onSaved(saved); setStatus("saved"); }).catch((error) => {
      if (!pending.current) pending.current = payload;
      setStatus("error");
      throw error;
    }).finally(() => { running.current = null; });
    running.current = task;
    await task;
    if (pending.current) await flush();
  }, [note.id, onSaved]);

  function queueSave(nextTitle: string, content?: TiptapDocument) {
    if (!editor && !content) return;
    pending.current = { title: nextTitle.trim() || "Untitled Note", content: content ?? editor!.getJSON() as TiptapDocument };
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    if (autoSave) timer.current = setTimeout(() => { void flush().catch(() => undefined); }, 750);
  }

  useEffect(() => {
    registerFlush(async () => { await flush().catch(() => undefined); });
    return () => { if (timer.current) clearTimeout(timer.current); void flush().catch(() => undefined); };
  }, [flush, registerFlush]);

  const changeTitle = (value: string) => {
    setTitle(value);
    titleRef.current = value;
    if (value.trim()) queueSave(value);
  };

  const normalizeTitle = () => {
    if (title.trim()) return;
    setTitle("Untitled Note");
    titleRef.current = "Untitled Note";
    queueSave("Untitled Note");
  };

  const startVoiceRecording = () => {
    if (!editor) return;
    voiceInsertionRef.current = editor.isFocused ? editor.state.selection.from : TextSelection.atEnd(editor.state.doc).from;
    void voice.startRecording();
  };

  if (!editor) return <div className="editor-loading"><LoaderCircle className="spin" size={22} /> Opening note…</div>;

  return <section className="note-editor">
    {(voice.error || voice.notice) && <div className={`notes-toast ${voice.notice ? "voice-notice" : ""}`} role="status">
      {voice.error || voice.notice}
      <button aria-label="Dismiss" onClick={voice.notice ? voice.clearNotice : voice.clearError}><X size={13} /></button>
    </div>}
    <header className="note-editor-head">
      <button className="notes-mobile-back" onClick={back}><ArrowLeft size={16} /> Notes</button>
      <div className="note-title-wrap" style={{ "--note-color": note.color } as React.CSSProperties}><span className="note-title-icon"><NoteGlyph icon={note.icon} size={14} /></span><input value={title} maxLength={160} aria-label="Note title" onChange={(event) => changeTitle(event.target.value)} onBlur={normalizeTitle} /></div>
      <button
        type="button"
        className={`speak-to-note ${voice.isRecording ? "recording" : ""}`}
        disabled={voice.isBusy}
        aria-pressed={voice.isRecording}
        aria-label={voice.isRecording ? "Stop recording" : "Speak to Note"}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => voice.isRecording ? voice.stopRecording() : startVoiceRecording()}
      >
        <span className="voice-mic"><Mic size={13} /></span>
        <span>{voice.status === "stopping" ? "Stopping…" : voice.isRecording ? "Stop Recording" : "Speak to Note"}</span>
      </button>
      <button type="button" className="export-note" onClick={exportNote}><Download size={14} /><span>Export</span></button>
      <div className={`save-state ${status}`} title={status === "error" ? "Save failed" : undefined}>
        {status === "saving" ? <LoaderCircle className="spin" size={12} /> : status === "error" ? <button onClick={() => void flush().catch(() => undefined)}><RotateCcw size={12} /> Retry</button> : <Check size={12} />}
        {status === "saving" ? "Saving…" : status === "error" ? "Couldn't save" : status === "dirty" ? "Unsaved" : "Saved"}
      </div>
    </header>
    <EditorToolbar editor={editor} />
    {!["idle", "error"].includes(voice.status) && <div className="voice-preview" role="status" aria-live="polite">
      <span className="voice-preview-icon"><Mic size={12} /></span>
      <div><strong>{voice.status === "recording" ? "Listening" : voice.status === "stopping" ? "Finishing transcript" : "Starting live transcription"}</strong><span>{voice.preview || (voice.status === "recording" ? "Start speaking—your words will appear here." : "Securely connecting to AssemblyAI…")}</span></div>
      {voice.isRecording && voice.status !== "stopping" && <button type="button" onClick={() => voice.stopRecording()}>Stop</button>}
    </div>}
    <div className="editor-scroll">
      <div className="editor-page">
        <BubbleMenu editor={editor} shouldShow={({ from, to }) => from !== to && !editor.isActive("codeBlock")} options={{ placement: "top", strategy: "fixed" }}>
          <div className="selection-menu" onMouseDown={(event) => event.preventDefault()}>
            <MarkButton label="Bold" active={editor.isActive("bold")} action={() => editor.chain().focus().toggleBold().run()}><Bold size={13} /></MarkButton>
            <MarkButton label="Italic" active={editor.isActive("italic")} action={() => editor.chain().focus().toggleItalic().run()}><Italic size={13} /></MarkButton>
            <MarkButton label="Underline" active={editor.isActive("underline")} action={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={13} /></MarkButton>
            <span className="menu-divider" />
            {aiRefine && <button className={`ai-refine-trigger ${aiOpen ? "active" : ""}`} onClick={() => { setAiOpen(!aiOpen); setAiError(""); }}><Sparkles size={13} /> AI Refine <ChevronDown size={11} /></button>}
            {aiOpen && <AIRefineMenu loading={aiLoading} error={aiError} run={async (action, tone) => {
              const { from, to } = editor.state.selection;
              const text = editor.state.doc.textBetween(from, to, "\n");
              setAiLoading(true); setAiError("");
              try {
                const response = await fetch("/api/notes/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, action, tone }) });
                const data = await response.json() as { text?: string; error?: string };
                if (!response.ok || !data.text) throw new Error(data.error || "Gemini could not refine this selection.");
                const safe = data.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
                editor.chain().focus().insertContentAt({ from, to }, safe).run();
                setAiOpen(false);
              } catch (error) { setAiError(messageOf(error)); }
              finally { setAiLoading(false); }
            }} />}
          </div>
        </BubbleMenu>
        <EditorContent editor={editor} />
      </div>
    </div>
    <footer className="note-editor-footer"><div><span>{words.toLocaleString()} {words === 1 ? "word" : "words"}</span><span><LocalNoteTime value={note.updatedAt} prefix="Last updated " /></span></div>{autoSave ? <span><i /> Auto-save on</span> : <button className="note-manual-save" disabled={status !== "dirty"} onClick={() => void flush().catch(() => undefined)}><Save size={12} /> Save changes</button>}</footer>
  </section>;
}

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> & {} }) {
  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (!url.trim()) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };
  return <div className="editor-toolbar" aria-label="Formatting toolbar">
    <div><MarkButton label="Undo" disabled={!editor.can().undo()} action={() => editor.chain().focus().undo().run()}><Undo2 size={14} /></MarkButton><MarkButton label="Redo" disabled={!editor.can().redo()} action={() => editor.chain().focus().redo().run()}><Redo2 size={14} /></MarkButton></div>
    <span className="toolbar-divider" />
    <select aria-label="Block type" value={editor.isActive("heading", { level: 1 }) ? "h1" : editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : "p"} onChange={(event) => {
      const value = event.target.value;
      if (value === "p") editor.chain().focus().setParagraph().run(); else editor.chain().focus().setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
    }}><option value="p">Text</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option></select>
    <span className="toolbar-divider" />
    <div><MarkButton label="Bold" active={editor.isActive("bold")} action={() => editor.chain().focus().toggleBold().run()}><Bold size={14} /></MarkButton><MarkButton label="Italic" active={editor.isActive("italic")} action={() => editor.chain().focus().toggleItalic().run()}><Italic size={14} /></MarkButton><MarkButton label="Underline" active={editor.isActive("underline")} action={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={14} /></MarkButton><MarkButton label="Strike" active={editor.isActive("strike")} action={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={14} /></MarkButton><MarkButton label="Highlight" active={editor.isActive("highlight")} action={() => editor.chain().focus().toggleHighlight().run()}><Highlighter size={14} /></MarkButton><MarkButton label="Inline code" active={editor.isActive("code")} action={() => editor.chain().focus().toggleCode().run()}><Code2 size={14} /></MarkButton><MarkButton label="Link" active={editor.isActive("link")} action={setLink}><Link2 size={14} /></MarkButton></div>
    <span className="toolbar-divider" />
    <div><MarkButton label="Bullet list" active={editor.isActive("bulletList")} action={() => editor.chain().focus().toggleBulletList().run()}><List size={14} /></MarkButton><MarkButton label="Numbered list" active={editor.isActive("orderedList")} action={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} /></MarkButton><MarkButton label="Task list" active={editor.isActive("taskList")} action={() => editor.chain().focus().toggleTaskList().run()}><CheckSquare size={14} /></MarkButton><MarkButton label="Quote" active={editor.isActive("blockquote")} action={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={14} /></MarkButton></div>
  </div>;
}

function MarkButton({ label, active, disabled, action, children }: { label: string; active?: boolean; disabled?: boolean; action: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} className={active ? "active" : ""} onClick={action}>{children}</button>;
}

function AIRefineMenu({ loading, error, run }: { loading: boolean; error: string; run: (action: RefineAction, tone?: RefineTone) => Promise<void> }) {
  const [tones, setTones] = useState(false);
  const lastChoice = useRef<{ action: RefineAction; tone?: RefineTone }>({ action: "rephrase" });
  const choices: Array<[RefineAction, string]> = [["grammar", "Improve grammar"], ["rephrase", "Rephrase"], ["shorter", "Make shorter"], ["longer", "Make longer"], ["simplify", "Simplify language"]];
  const choose = (action: RefineAction, tone?: RefineTone) => { lastChoice.current = { action, tone }; void run(action, tone); };
  return <div className="ai-menu" role="menu">
    <div className="ai-menu-title"><WandSparkles size={13} /><span>Refine with Gemini</span>{loading && <LoaderCircle className="spin" size={13} />}</div>
    {choices.map(([action, label]) => <button disabled={loading} key={action} onClick={() => choose(action)}>{label}</button>)}
    <button disabled={loading} onClick={() => setTones(!tones)}>Change tone <ChevronDown size={11} /></button>
    {tones && <div className="tone-grid">{(["Professional", "Friendly", "Confident", "Casual"] as RefineTone[]).map((tone) => <button key={tone} disabled={loading} onClick={() => choose("tone", tone)}>{tone}</button>)}</div>}
    {error && <div className="ai-error">{error}<button onClick={() => choose(lastChoice.current.action, lastChoice.current.tone)}><RotateCcw size={11} /> Retry</button></div>}
  </div>;
}

function TrashPreview({ note, back, restore, deleteForever }: { note: Note; back: () => void; restore: () => void; deleteForever: () => void }) {
  const editor = useEditor({ immediatelyRender: false, editable: false, extensions: [StarterKit, Link, Underline, Highlight, TaskList, TaskItem], content: note.content, editorProps: { attributes: { class: "notes-prosemirror read-only" } } });
  return <section className="note-editor trash-preview">
    <header className="note-editor-head"><button className="notes-mobile-back" onClick={back}><ArrowLeft size={16} /> Trash</button><div className="note-title-wrap" style={{ "--note-color": note.color } as React.CSSProperties}><span className="note-title-icon"><NoteGlyph icon={note.icon} size={14} /></span><h1>{note.title}</h1></div><div className="trash-actions"><button onClick={restore}><RefreshCcw size={13} /> Move to Notes</button><button className="danger" onClick={deleteForever}><Trash2 size={13} /> Delete forever</button></div></header>
    <div className="trash-banner"><Trash2 size={14} /> This note is in Trash. Restore it to continue editing.</div>
    <div className="editor-scroll"><div className="editor-page">{editor && <EditorContent editor={editor} />}</div></div>
  </section>;
}

function EmptyEditor({ mode, createNote, back }: { mode: Mode; createNote: () => void; back: () => void }) {
  return <div className="notes-empty-editor"><button className="notes-mobile-back" onClick={back}><ArrowLeft size={16} /> Notes</button><span><FileText size={29} /></span><h2>{mode === "trash" ? "Nothing in Trash" : mode === "pinned" ? "No pinned notes" : "Select a note to begin"}</h2><p>{mode === "trash" ? "Deleted notes can be moved back to Notes from here." : mode === "pinned" ? "Pin an active note to keep it easy to find." : "Choose a page from the left, or start something fresh."}</p>{mode === "active" && <button onClick={createNote}><Plus size={14} /> Create a note</button>}</div>;
}
