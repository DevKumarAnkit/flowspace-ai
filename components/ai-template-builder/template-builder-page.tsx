"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays, Eye, LayoutTemplate, LoaderCircle, Plus, SidebarClose, Sparkles, Trash2, WandSparkles } from "lucide-react";
import {
  addGeneratedAppToSidebarAction, deleteGeneratedAppAction, removeGeneratedAppFromSidebarAction,
} from "@/app/ai-template-builder/actions";
import { generatedAppIcons } from "@/components/ai-template-builder/generated-app-icons";
import { GeneratedAppRenderer } from "@/components/ai-template-builder/generated-app-renderer";
import type { GeneratedApp } from "@/lib/generated-app-domain";

const suggestions = [
  ["Habit Tracker", "Build a habit tracker for daily habits, streaks, and weekly progress."],
  ["Budget Tracker", "Build a monthly budget tracker with income, expenses, categories, and savings progress."],
  ["Meal Planner", "Build a weekly meal planner with meals, grocery checklist, and nutrition overview."],
  ["Study Planner", "Build a study planner with subjects, sessions, deadlines, and completion progress."],
] as const;

export function TemplateBuilderPage({ initialApps }: { initialApps: GeneratedApp[] }) {
  const router = useRouter();
  const [apps, setApps] = useState(initialApps);
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState<GeneratedApp | null>(null);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function generate() {
    if (!prompt.trim() || generating) return;
    setGenerating(true); setError("");
    try {
      const response = await fetch("/api/ai-template-builder/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to generate the app.");
      const created = result.app as GeneratedApp;
      setApps((current) => [created, ...current]); setPreview(created); setPrompt(""); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to generate the app."); }
    finally { setGenerating(false); }
  }

  async function toggleSidebar(app: GeneratedApp) {
    if (busyId !== null) return;
    setBusyId(app.id); setError("");
    try {
      const updated = app.sidebarPosition === null ? await addGeneratedAppToSidebarAction(app.id) : await removeGeneratedAppFromSidebarAction(app.id);
      setApps((current) => current.map((item) => item.id === app.id ? updated : item));
      if (preview?.id === app.id) setPreview(updated);
      window.dispatchEvent(new Event("generated-sidebar-change"));
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update the sidebar."); }
    finally { setBusyId(null); }
  }

  async function remove(app: GeneratedApp) {
    if (!window.confirm(`Delete “${app.definition.appName}”? Its saved data cannot be recovered.`)) return;
    setBusyId(app.id); setError("");
    try { await deleteGeneratedAppAction(app.id); setApps((current) => current.filter((item) => item.id !== app.id)); if (preview?.id === app.id) setPreview(null); window.dispatchEvent(new Event("generated-sidebar-change")); router.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete the app."); }
    finally { setBusyId(null); }
  }

  return <div className="template-builder-content">
    <section className="template-builder-hero">
      <div className="template-builder-heading"><span><WandSparkles size={22} /></span><div><p>FLOW AI · TEMPLATE STUDIO</p><h1>Build your own mini app</h1><small>Describe what you need and AI will create a private, interactive tool you can use right away.</small></div></div>
      <div className="template-prompt-card">
        <label htmlFor="template-prompt">What would you like to build?</label>
        <div className="template-prompt-row"><div><textarea id="template-prompt" maxLength={500} onChange={(event) => setPrompt(event.target.value)} placeholder="E.g. Build a habit tracker for daily habits, streaks, and weekly progress…" value={prompt} /><span>{prompt.length}/500</span></div><button disabled={!prompt.trim() || generating} onClick={generate}>{generating ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{generating ? "Building…" : "Generate app"}</button></div>
        <div className="template-suggestions"><span>Try an idea:</span>{suggestions.map(([label, value]) => <button key={label} onClick={() => setPrompt(value)}>{label}</button>)}</div>
      </div>
      {error && <div className="template-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
    </section>

    {generating && <section className="template-generating"><span><LoaderCircle className="spin" size={24} /></span><h2>Designing your mini app…</h2><p>Flow AI is choosing sections, fields, actions, and sample data.</p><div><i /><i /><i /></div></section>}
    {!generating && preview && <section className="template-preview-section"><div className="template-section-heading"><div><span><Eye size={17} /></span><div><h2>Freshly generated</h2><p>Your app is saved and ready to preview.</p></div></div><Link href={`/ai-template-builder/${preview.id}`}>Open full app <Eye size={14} /></Link></div><GeneratedAppRenderer definition={preview.definition} state={preview.state} /></section>}

    <section className="created-apps-section"><div className="template-section-heading"><div><span><LayoutTemplate size={17} /></span><div><h2>Created apps</h2><p>{apps.length ? `${apps.length} private ${apps.length === 1 ? "app" : "apps"} in your workspace` : "Your generated apps will appear here"}</p></div></div></div>
      {!apps.length ? <div className="template-empty"><span><LayoutTemplate size={25} /></span><h3>No apps yet</h3><p>Start with a prompt above or choose one of the suggested ideas.</p><button onClick={() => document.getElementById("template-prompt")?.focus()}><Plus size={14} /> Create your first app</button></div>
        : <div className="created-app-grid">{apps.map((app) => <AppCard app={app} busy={busyId === app.id} key={app.id} onDelete={() => remove(app)} onSidebar={() => toggleSidebar(app)} />)}</div>}
    </section>
  </div>;
}

function AppCard({ app, busy, onSidebar, onDelete }: { app: GeneratedApp; busy: boolean; onSidebar: () => void; onDelete: () => void }) {
  const Icon = generatedAppIcons[app.definition.icon];
  return <article className="created-app-card" style={{ "--card-accent": app.definition.color } as React.CSSProperties}>
    <div className="created-app-card-top"><span style={{ color: app.definition.color, background: `${app.definition.color}18` }}><Icon size={21} /></span><i style={{ background: app.definition.color }}>{app.definition.color}</i></div>
    <Link href={`/ai-template-builder/${app.id}`}><h3>{app.definition.appName}</h3></Link><p>{app.definition.description}</p>
    <div className="created-app-date"><CalendarDays size={12} /> Created {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(app.createdAt))}</div>
    <div className="created-app-actions"><Link href={`/ai-template-builder/${app.id}`}><Eye size={13} /> Preview</Link><button disabled={busy} onClick={onSidebar}>{busy ? <LoaderCircle className="spin" size={13} /> : app.sidebarPosition === null ? <Plus size={13} /> : <SidebarClose size={13} />}{app.sidebarPosition === null ? "Add to sidebar" : "Remove"}</button><button className="delete" disabled={busy} aria-label={`Delete ${app.definition.appName}`} onClick={onDelete}><Trash2 size={14} /></button></div>
  </article>;
}
