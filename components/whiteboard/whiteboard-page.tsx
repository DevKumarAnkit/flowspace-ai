"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  AlertCircle, Check, Download, Image as ImageIcon, LoaderCircle, Menu, MoreHorizontal,
  Palette, Plus, RefreshCw, SlidersHorizontal, Sparkles, StickyNote, Trash2, X,
} from "lucide-react";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  createWhiteboardAction, deleteWhiteboardAction, renameWhiteboardAction, saveWhiteboardAction,
} from "@/app/whiteboard/actions";
import {
  formatWhiteboardTime, normalizeDiagramGrid, safePngFilename, validateAiDiagram,
  type AiDiagram, type Whiteboard, type WhiteboardScene,
} from "@/lib/whiteboard-domain";

const ExcalidrawCanvas = dynamic(() => import("./excalidraw-canvas"), { ssr: false });
type SaveStatus = "saved" | "dirty" | "saving" | "error";
const STICKY_COLORS = ["#FFF0B8", "#FFDDE5", "#DDF5E9", "#DDEBFF", "#ECE8FF"];

function persistedAppState(appState: AppState) {
  return {
    viewBackgroundColor: "#FFFFFF",
    currentItemStrokeColor: appState.currentItemStrokeColor,
    currentItemBackgroundColor: appState.currentItemBackgroundColor,
    currentItemFillStyle: appState.currentItemFillStyle,
    currentItemStrokeWidth: appState.currentItemStrokeWidth,
    currentItemStrokeStyle: appState.currentItemStrokeStyle,
    currentItemRoughness: appState.currentItemRoughness,
    currentItemOpacity: appState.currentItemOpacity,
    currentItemFontFamily: appState.currentItemFontFamily,
    currentItemFontSize: appState.currentItemFontSize,
    currentItemTextAlign: appState.currentItemTextAlign,
    currentItemStartArrowhead: appState.currentItemStartArrowhead,
    currentItemEndArrowhead: appState.currentItemEndArrowhead,
    gridSize: appState.gridSize,
    gridStep: appState.gridStep,
    gridModeEnabled: appState.gridModeEnabled,
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom,
  };
}

function sceneSnapshot(elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles): WhiteboardScene {
  return JSON.parse(JSON.stringify({ elements: normalizeLinearElements(elements), appState: persistedAppState(appState), files })) as WhiteboardScene;
}

function viewportCenter(api: ExcalidrawImperativeAPI) {
  const state = api.getAppState();
  const zoom = state.zoom.value || 1;
  return { x: (state.width / 2) / zoom - state.scrollX, y: (state.height / 2) / zoom - state.scrollY };
}

function normalizeLinearElements(elements: readonly ExcalidrawElement[]) {
  return elements.map((element) => {
    if ((element.type !== "arrow" && element.type !== "line") || !element.points.length) return element;
    const [offsetX, offsetY] = element.points[0];
    if (offsetX === 0 && offsetY === 0) return element;
    return {
      ...element,
      x: element.x + offsetX,
      y: element.y + offsetY,
      points: element.points.map(([x, y]) => [x - offsetX, y - offsetY]),
    } as ExcalidrawElement;
  });
}

function readImage(file: File) {
  return new Promise<{ dataURL: string; width: number; height: number }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read this image."));
    reader.onload = () => {
      const dataURL = String(reader.result || "");
      const image = new window.Image();
      image.onerror = () => reject(new Error("This image could not be loaded."));
      image.onload = () => resolve({ dataURL, width: image.naturalWidth, height: image.naturalHeight });
      image.src = dataURL;
    };
    reader.readAsDataURL(file);
  });
}

function SaveBadge({ status, retry }: { status: SaveStatus; retry: () => void }) {
  const content = status === "saving" ? <><LoaderCircle className="spin" size={13} /> Saving…</> : status === "dirty" ? <>Unsaved</> : status === "error" ? <><AlertCircle size={13} /> Couldn’t save</> : <><Check size={13} /> Saved</>;
  return status === "error" ? <button className={`whiteboard-save ${status}`} onClick={retry} title="Retry save">{content}<RefreshCw size={12} /></button> : <span className={`whiteboard-save ${status}`}>{content}</span>;
}

export function WhiteboardPage({ initialBoards, initialSelectedBoardId }: { initialBoards: Whiteboard[]; initialSelectedBoardId: number | null }) {
  const router = useRouter();
  const [boards, setBoards] = useState(initialBoards);
  const [selectedId, setSelectedId] = useState(initialSelectedBoardId);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stickyOpen, setStickyOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Whiteboard | null>(null);
  const [prompt, setPrompt] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [, startTransition] = useTransition();
  const selected = boards.find((board) => board.id === selectedId) ?? null;
  const pending = useRef<{ boardId: number; scene: WhiteboardScene } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const lastSaved = useRef(selected ? JSON.stringify(selected.scene) : "");

  const replaceBoard = useCallback((board: Whiteboard) => setBoards((all) => all.map((entry) => entry.id === board.id ? board : entry).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))), []);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    if (saving.current) await saving.current;
    const payload = pending.current;
    if (!payload) return;
    pending.current = null;
    setStatus("saving");
    const task = saveWhiteboardAction(payload.boardId, payload.scene).then((board) => {
      replaceBoard(board);
      lastSaved.current = JSON.stringify(payload.scene);
      setStatus(pending.current ? "dirty" : "saved");
    }).catch((error) => {
      if (!pending.current) pending.current = payload;
      setStatus("error");
      throw error;
    }).finally(() => { saving.current = null; });
    saving.current = task;
    await task;
    if (pending.current) await flush();
  }, [replaceBoard]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onChange = useCallback((elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
    if (!selectedId) return;
    const scene = sceneSnapshot(elements, appState, files);
    if (JSON.stringify(scene) === lastSaved.current) return;
    pending.current = { boardId: selectedId, scene };
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush().catch(() => undefined); }, 800);
  }, [flush, selectedId]);

  async function selectBoard(board: Whiteboard) {
    if (board.id === selectedId) { setDrawerOpen(false); return; }
    try { await flush(); } catch { return; }
    pending.current = null;
    lastSaved.current = JSON.stringify(board.scene);
    setStatus("saved");
    setApi(null);
    setSelectedId(board.id);
    setDrawerOpen(false);
    router.replace(`/whiteboard?board=${board.id}`, { scroll: false });
  }

  async function createBoard() {
    try { await flush(); } catch { return; }
    startTransition(async () => {
      const board = await createWhiteboardAction();
      setBoards((all) => [board, ...all]);
      await selectBoard(board);
    });
  }

  async function focusBoardName(board: Whiteboard) {
    await selectBoard(board);
    setTimeout(() => {
      const input = document.getElementById(`board-name-${board.id}`) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 0);
  }

  async function renameBoard(board: Whiteboard, rawName: string) {
    const name = rawName.trim() || board.name;
    if (name === board.name) return;
    try { replaceBoard(await renameWhiteboardAction(board.id, name)); } catch { /* Preserve prior title. */ }
  }

  async function removeBoard(board: Whiteboard) {
    if (board.id === selectedId) {
      try { await flush(); } catch { setDeleteTarget(null); return; }
    }
    await deleteWhiteboardAction(board.id);
    const remaining = boards.filter((entry) => entry.id !== board.id);
    setBoards(remaining);
    setDeleteTarget(null);
    if (board.id === selectedId) {
      const next = remaining[0] ?? null;
      pending.current = null;
      lastSaved.current = next ? JSON.stringify(next.scene) : "";
      setSelectedId(next?.id ?? null);
      setApi(null);
      setStatus("saved");
      router.replace(next ? `/whiteboard?board=${next.id}` : "/whiteboard", { scroll: false });
    }
  }

  async function addSticky(color: string) {
    if (!api) return;
    const { convertToExcalidrawElements, CaptureUpdateAction } = await import("@excalidraw/excalidraw");
    const center = viewportCenter(api);
    const id = `sticky-${crypto.randomUUID()}`;
    const created = convertToExcalidrawElements([{ type: "rectangle", id, x: center.x - 115, y: center.y - 80, width: 230, height: 160, backgroundColor: color, strokeColor: "#C8A84E", fillStyle: "solid", roughness: 1, roundness: { type: 3 }, label: { text: "Sticky note", fontSize: 20, textAlign: "center", verticalAlign: "middle" } }], { regenerateIds: false });
    const container = created.find((element) => element.type === "rectangle");
    const selectedElementIds = container ? { [container.id]: true as const } : {};
    api.updateScene({ elements: [...api.getSceneElements(), ...created], appState: { selectedElementIds }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    api.setActiveTool({ type: "selection" });
    api.scrollToContent(created, { fitToContent: false, animate: true });
    api.setToast({ message: "Double-click the sticky note text to edit it.", duration: 2500, closable: true });
    setStickyOpen(false);
  }

  async function insertImage(file: File) {
    if (!api) return;
    const supported = ["image/png", "image/jpeg", "image/gif", "image/webp"];
    if (!supported.includes(file.type)) { api.setToast({ message: "Choose a PNG, JPEG, GIF, or WebP image.", duration: 3000, closable: true }); return; }
    if (file.size > 5 * 1024 * 1024) { api.setToast({ message: "Images must be 5 MB or smaller.", duration: 3000, closable: true }); return; }
    try {
      const image = await readImage(file);
      const { convertToExcalidrawElements, CaptureUpdateAction } = await import("@excalidraw/excalidraw");
      const maxWidth = 720, maxHeight = 480;
      const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
      const width = Math.max(1, image.width * scale), height = Math.max(1, image.height * scale);
      const center = viewportCenter(api);
      const fileId = `image-${crypto.randomUUID()}` as import("@excalidraw/excalidraw/element/types").FileId;
      api.addFiles([{ id: fileId, mimeType: file.type as "image/png", dataURL: image.dataURL as import("@excalidraw/excalidraw/types").DataURL, created: Date.now() }]);
      const created = convertToExcalidrawElements([{ type: "image", x: center.x - width / 2, y: center.y - height / 2, width, height, fileId, status: "saved", scale: [1, 1] }]);
      const imageElement = created.find((element) => element.type === "image");
      api.updateScene({ elements: [...api.getSceneElements(), ...created], appState: { selectedElementIds: imageElement ? { [imageElement.id]: true } : {} }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      api.setActiveTool({ type: "selection" });
      api.scrollToContent(created, { fitToContent: false, animate: true });
    } catch (error) {
      api.setToast({ message: error instanceof Error ? error.message : "Unable to insert this image.", duration: 3000, closable: true });
    } finally {
      if (imageInput.current) imageInput.current.value = "";
    }
  }

  async function insertDiagram(diagram: AiDiagram) {
    if (!api) return;
    const { convertToExcalidrawElements, CaptureUpdateAction } = await import("@excalidraw/excalidraw");
    const normalized = normalizeDiagramGrid(diagram);
    const prefix = `ai-${crypto.randomUUID()}-`;
    const width = 220, height = 108, gapX = 300, gapY = 190;
    const maxColumn = Math.max(...normalized.nodes.map((node) => node.column));
    const maxRow = Math.max(...normalized.nodes.map((node) => node.row));
    const center = viewportCenter(api);
    const originX = center.x - ((maxColumn * gapX + width) / 2);
    const originY = center.y - ((maxRow * gapY + height) / 2);
    const skeletons: Parameters<typeof convertToExcalidrawElements>[0] = [];
    for (const node of normalized.nodes) skeletons.push({ type: node.shape, id: `${prefix}${node.id}`, x: originX + node.column * gapX, y: originY + node.row * gapY, width, height, backgroundColor: node.color, strokeColor: "#4B4660", fillStyle: "solid", roughness: 1, roundness: node.shape === "rectangle" ? { type: 3 } : null, label: { text: node.label, fontSize: 18, textAlign: "center", verticalAlign: "middle" } });
    for (const edge of normalized.edges) skeletons.push({ type: "arrow", x: 0, y: 0, start: { id: `${prefix}${edge.from}` }, end: { id: `${prefix}${edge.to}` }, strokeColor: "#625B78", strokeStyle: edge.style, endArrowhead: "arrow", label: edge.label ? { text: edge.label, fontSize: 14 } : undefined });
    const created = normalizeLinearElements(convertToExcalidrawElements(skeletons, { regenerateIds: false }));
    api.updateScene({ elements: [...api.getSceneElements(), ...created], appState: { selectedElementIds: Object.fromEntries(created.map((element) => [element.id, true as const])) as Record<string, true> }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    api.scrollToContent(created, { fitToContent: false, animate: true });
  }

  async function generateDiagram(event: React.FormEvent) {
    event.preventDefault();
    setAiBusy(true); setAiError("");
    try {
      const response = await fetch("/api/whiteboard/diagram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const body = await response.json().catch(() => null) as { error?: string } | AiDiagram | null;
      if (!response.ok) throw new Error(body && "error" in body && body.error ? body.error : `Diagram generation failed (${response.status}).`);
      if (!body) throw new Error("Gemini returned an empty response.");
      await insertDiagram(validateAiDiagram(body));
      setAiOpen(false); setPrompt("");
    } catch (error) { setAiError(error instanceof Error ? error.message : "Unable to generate the diagram."); }
    finally { setAiBusy(false); }
  }

  function openDrawingOptions() {
    if (!api) return;
    api.setActiveTool({ type: "freedraw" });
    requestAnimationFrame(() => api.updateScene({ appState: { openMenu: "shape" } }));
  }

  async function exportImage(format: "png" | "jpg" | "jpeg") {
    if (!api || !selected || !api.getSceneElements().length) return;
    try {
      const { exportToBlob } = await import("@excalidraw/excalidraw");
      const mimeType = format === "png" ? "image/png" : "image/jpeg";
      const blob = await exportToBlob({ elements: api.getSceneElements(), appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false }, files: api.getFiles(), mimeType, quality: format === "png" ? undefined : 0.92, getDimensions: (width: number, height: number) => ({ width: width * 2, height: height * 2, scale: 2 }) });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = safePngFilename(selected.name).replace(/\.png$/i, `.${format}`);
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      api.setToast({ message: `${format.toUpperCase()} download started.`, duration: 2200, closable: true });
    } catch (error) {
      console.error("Whiteboard image export failed", error);
      api.setToast({ message: "Image export failed. Please try again.", duration: 3000, closable: true });
    }
  }

  const initialData = useMemo(() => selected ? { elements: normalizeLinearElements(selected.scene.elements as unknown as ExcalidrawElement[]) as never[], appState: { ...selected.scene.appState, viewBackgroundColor: "#FFFFFF" }, files: selected.scene.files } : undefined, [selected?.id]);

  return (
    <div className={`whiteboard-workspace ${drawerOpen ? "drawer-open" : ""}`}>
      {drawerOpen && <button className="whiteboard-scrim" aria-label="Close whiteboard list" onClick={() => setDrawerOpen(false)} />}
      <aside className="whiteboard-rail">
        <div className="whiteboard-rail-head"><div><span className="whiteboard-rail-icon"><Palette size={15} /></span><strong>Your whiteboards</strong></div><button className="whiteboard-rail-close" onClick={() => setDrawerOpen(false)} aria-label="Close list"><X size={17} /></button></div>
        <button className="whiteboard-new" onClick={createBoard}><Plus size={15} /> New Whiteboard</button>
        <div className="whiteboard-list">
          {boards.map((board) => <div className={`whiteboard-list-item ${board.id === selectedId ? "active" : ""}`} key={board.id}>
            <button className="whiteboard-select" onClick={() => void selectBoard(board)}><i style={{ background: board.color }} /><span><strong>{board.name}</strong><small>Updated {formatWhiteboardTime(board.updatedAt)}</small></span></button>
            <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="whiteboard-item-more" aria-label={`Options for ${board.name}`}><MoreHorizontal size={16} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="whiteboard-menu" sideOffset={5}><DropdownMenu.Item onSelect={() => void focusBoardName(board)}>Rename</DropdownMenu.Item><DropdownMenu.Item className="danger" onSelect={() => setDeleteTarget(board)}><Trash2 size={13} /> Delete</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
          </div>)}
          {!boards.length && <div className="whiteboard-list-empty"><StickyNote size={24} /><strong>No whiteboards yet</strong><span>Start something visual.</span></div>}
        </div>
      </aside>

      <section className="whiteboard-stage">
        {selected ? <>
          <header className="whiteboard-header">
            <div className="whiteboard-title-group"><button className="whiteboard-mobile-list" onClick={() => setDrawerOpen(true)} aria-label="Open whiteboard list"><Menu size={18} /></button><i style={{ background: selected.color }} /><input id={`board-name-${selected.id}`} key={`${selected.id}-${selected.name}`} defaultValue={selected.name} aria-label="Whiteboard name" onBlur={(event) => void renameBoard(selected, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></div>
            <div className="whiteboard-actions">
              <div className="sticky-wrap"><button className="whiteboard-tool-button" onClick={() => setStickyOpen(!stickyOpen)}><StickyNote size={15} /><span>Sticky note</span></button>{stickyOpen && <div className="sticky-palette">{STICKY_COLORS.map((color) => <button key={color} style={{ background: color }} onClick={() => void addSticky(color)} aria-label={`Add ${color} sticky note`} />)}</div>}</div>
              <button className="whiteboard-tool-button" onClick={() => imageInput.current?.click()}><ImageIcon size={15} /><span>Image</span></button><input ref={imageInput} className="whiteboard-image-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void insertImage(file); }} />
              <button className="whiteboard-ai-button" onClick={() => setAiOpen(true)}><Sparkles size={15} /> <span>AI Diagram</span></button>
              <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="whiteboard-tool-button" disabled={!api || !api.getSceneElements().length}><Download size={15} /><span>Download</span></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="whiteboard-menu" sideOffset={5} align="end"><DropdownMenu.Item onSelect={() => void exportImage("png")}>Download PNG</DropdownMenu.Item><DropdownMenu.Item onSelect={() => void exportImage("jpg")}>Download JPG</DropdownMenu.Item><DropdownMenu.Item onSelect={() => void exportImage("jpeg")}>Download JPEG</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
              <SaveBadge status={status} retry={() => void flush().catch(() => undefined)} />
              <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="whiteboard-icon-button" aria-label="More options"><MoreHorizontal size={17} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="whiteboard-menu" sideOffset={5}><DropdownMenu.Item onSelect={() => document.getElementById(`board-name-${selected.id}`)?.focus()}>Rename whiteboard</DropdownMenu.Item><DropdownMenu.Item className="danger" onSelect={() => setDeleteTarget(selected)}><Trash2 size={13} /> Delete whiteboard</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
            </div>
          </header>
          <div className="whiteboard-canvas" key={selected.id}><ExcalidrawCanvas excalidrawAPI={setApi} initialData={initialData as never} onChange={onChange} theme="light" zenModeEnabled={false} viewModeEnabled={false} UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false }, tools: { image: false } }} /><button className="whiteboard-properties-toggle" onClick={openDrawingOptions} title="Pen and drawing options" aria-label="Open pen and drawing options"><SlidersHorizontal size={18} /></button></div>
        </> : <div className="whiteboard-first"><div><StickyNote size={28} /></div><h1>Create your first whiteboard</h1><p>Sketch ideas, map a process, or let AI build the first draft.</p><button onClick={createBoard}><Plus size={16} /> New Whiteboard</button></div>}
      </section>

      <Dialog.Root open={aiOpen} onOpenChange={(open) => { if (!aiBusy) setAiOpen(open); }}><Dialog.Portal><Dialog.Overlay className="whiteboard-dialog-overlay" /><Dialog.Content className="whiteboard-dialog"><div className="whiteboard-dialog-icon"><Sparkles size={18} /></div><Dialog.Title>Generate an AI diagram</Dialog.Title><Dialog.Description>Describe what you want to map. Flowcharts, mind maps, architecture, user journeys, and process diagrams all work well.</Dialog.Description><form onSubmit={generateDiagram}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={2000} autoFocus placeholder="Example: Create a user onboarding flow from signup through activation, including the email verification decision." /><div className="diagram-examples">{["Product launch flowchart", "SaaS architecture", "Customer journey map"].map((example) => <button type="button" key={example} onClick={() => setPrompt(example)}>{example}</button>)}</div>{aiError && <p className="whiteboard-ai-error"><AlertCircle size={14} />{aiError}</p>}<div className="whiteboard-dialog-actions"><Dialog.Close asChild><button type="button" className="secondary" disabled={aiBusy}>Cancel</button></Dialog.Close><button type="submit" disabled={aiBusy || !prompt.trim()}>{aiBusy ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{aiBusy ? "Generating…" : "Generate diagram"}</button></div></form><Dialog.Close className="whiteboard-dialog-close" disabled={aiBusy}><X size={17} /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>

      <AlertDialog.Root open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}><AlertDialog.Portal><AlertDialog.Overlay className="whiteboard-dialog-overlay" /><AlertDialog.Content className="whiteboard-alert"><div className="whiteboard-alert-icon"><Trash2 size={18} /></div><AlertDialog.Title>Delete “{deleteTarget?.name}”?</AlertDialog.Title><AlertDialog.Description>This permanently removes the whiteboard and everything on it. This can’t be undone.</AlertDialog.Description><div><AlertDialog.Cancel>Cancel</AlertDialog.Cancel><AlertDialog.Action onClick={() => deleteTarget && void removeBoard(deleteTarget)}>Delete whiteboard</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
    </div>
  );
}
