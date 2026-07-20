"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { BarChart3, Check, CheckCircle2, Circle, List, RotateCcw, Table2, Trash2, X } from "lucide-react";
import { generatedAppIcons } from "@/components/ai-template-builder/generated-app-icons";
import {
  initialGeneratedAppState, metricValue, type GeneratedAppAction, type GeneratedAppComponent,
  type GeneratedAppDefinition, type GeneratedAppField, type GeneratedAppState, type GeneratedRow,
} from "@/lib/generated-app-domain";

type Props = { definition: GeneratedAppDefinition; state: GeneratedAppState; interactive?: boolean; onStateChange?: (state: GeneratedAppState) => void };
type AccentStyle = CSSProperties & { "--app-accent": string; "--app-soft": string };

function softColor(hex: string) { return `${hex}18`; }
function display(value: unknown) { if (typeof value === "boolean") return value ? "Yes" : "No"; return value === undefined ? "—" : String(value); }

function TableValue({ field, value }: { field: GeneratedAppField; value: unknown }) {
  if (field.type === "checkbox" || typeof value === "boolean") return value === true
    ? <span className="generated-status-badge complete"><CheckCircle2 size={12} /> Complete</span>
    : <span className="generated-status-badge pending"><Circle size={12} /> Pending</span>;
  if (/category|type|group/i.test(field.key)) return <span className="generated-category-badge">{display(value)}</span>;
  if (field.type === "number" && typeof value === "number") return <strong className="generated-number-value">{new Intl.NumberFormat().format(value)}</strong>;
  if (field.type === "date" && typeof value === "string") { const date = new Date(`${value}T00:00:00`); return <time>{Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)}</time>; }
  return <span className={/name|title/i.test(field.key) ? "generated-primary-value" : undefined}>{display(value)}</span>;
}

function FormBlock({ component, submit }: { component: Extract<GeneratedAppComponent, { type: "form" }>; submit: (actionId: string, row: GeneratedRow) => void }) {
  const [values, setValues] = useState<GeneratedRow>({});
  function onSubmit(event: FormEvent) { event.preventDefault(); submit(component.actionId, values); setValues({}); }
  return <form className="generated-form" onSubmit={onSubmit}>
    <div className="generated-form-grid">{component.fields.map((field) => <Field key={field.key} field={field} value={values[field.key]} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />)}</div>
    <button className="generated-primary" type="submit">{component.submitLabel}</button>
  </form>;
}

function Field({ field, value, onChange }: { field: GeneratedAppField; value: unknown; onChange: (value: string | number | boolean) => void }) {
  if (field.type === "checkbox") return <label className="generated-checkbox-field"><input checked={value === true} onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span>{field.label}</span></label>;
  const common = { id: `generated-${field.key}`, required: field.required, value: typeof value === "string" || typeof value === "number" ? value : "", onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value) };
  return <label className="generated-field" htmlFor={common.id}><span>{field.label}{field.required ? " *" : ""}</span>
    {field.type === "textarea" ? <textarea {...common} rows={3} /> : field.type === "select" ? <select {...common}><option value="">Choose…</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : <input {...common} type={field.type} />}
  </label>;
}

export function GeneratedAppRenderer({ definition, state, interactive = false, onStateChange }: Props) {
  const Icon = generatedAppIcons[definition.icon];
  const datasets = state.datasets;
  function commit(next: GeneratedAppState) { if (interactive) onStateChange?.(next); }
  function action(actionId: string, row?: GeneratedRow) {
    const item = definition.actions.find((entry) => entry.id === actionId); if (!item) return;
    if (item.type === "reset-data") return commit(initialGeneratedAppState(definition));
    if (!item.dataset) return;
    const current = datasets[item.dataset] ?? [];
    commit({ datasets: { ...datasets, [item.dataset]: item.type === "clear-dataset" ? [] : [...current, row ?? {}] } });
  }
  function toggle(dataset: string, index: number, field: string) {
    const rows = datasets[dataset] ?? [];
    commit({ datasets: { ...datasets, [dataset]: rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: row[field] !== true } : row) } });
  }
  function removeRow(dataset: string, index: number) {
    const rows = datasets[dataset] ?? [];
    commit({ datasets: { ...datasets, [dataset]: rows.filter((_, rowIndex) => rowIndex !== index) } });
  }
  const style: AccentStyle = { "--app-accent": definition.color, "--app-soft": softColor(definition.color) };
  return <article className="generated-app" style={style}>
    <header className="generated-app-header"><span className="generated-app-mark"><Icon size={23} /></span><div><h2>{definition.appName}</h2><p>{definition.description}</p></div></header>
    <div className="generated-sections">{definition.sections.map((section) => <section key={section.id} className="generated-section">
      {section.title && <h3>{section.title}</h3>}
      <div className={`generated-component-grid columns-${section.columns}`}>{section.components.map((component) => <Component key={component.id} component={component} datasets={datasets} interactive={interactive} onAction={action} onDelete={removeRow} onToggle={toggle} />)}</div>
    </section>)}</div>
  </article>;
}

function Component({ component, datasets, interactive, onAction, onDelete, onToggle }: { component: GeneratedAppComponent; datasets: GeneratedAppState["datasets"]; interactive: boolean; onAction: (id: string, row?: GeneratedRow) => void; onDelete: (dataset: string, index: number) => void; onToggle: (dataset: string, index: number, field: string) => void }) {
  const rows = "dataset" in component ? datasets[component.dataset] ?? [] : [];
  const heading = component.type === "stat" ? null : <div className="generated-block-heading"><div><h4>{component.title}</h4>{component.description && <p>{component.description}</p>}</div></div>;
  if (component.type === "stat") return <div className="generated-block generated-stat"><span>{component.title}</span><strong>{metricValue(rows, component.metric)}{component.suffix}</strong>{component.description && <small>{component.description}</small>}</div>;
  if (component.type === "progress") { const value = Math.max(0, Math.min(100, metricValue(rows, component.metric))); return <div className="generated-block">{heading}<div className="generated-progress-label"><span>{component.label ?? "Progress"}</span><b>{value}%</b></div><div className="generated-progress"><i style={{ width: `${value}%` }} /></div></div>; }
  if (component.type === "list") return <div className="generated-block">{heading}<div className="generated-list">{rows.length ? rows.map((row, index) => <div key={index}><span><List size={13} /></span><p><strong>{display(row[component.primaryField])}</strong>{component.secondaryField && <small>{display(row[component.secondaryField])}</small>}</p>{interactive && <button className="generated-row-delete" aria-label={`Delete ${display(row[component.primaryField])}`} onClick={() => onDelete(component.dataset, index)} type="button"><Trash2 size={13} /></button>}</div>) : <em>No items yet.</em>}</div></div>;
  if (component.type === "checklist") return <div className="generated-block">{heading}<div className="generated-checklist">{rows.length ? rows.map((row, index) => <div key={index}><button aria-label={`Toggle ${display(row[component.labelField])}`} disabled={!interactive} className={row[component.checkedField] === true ? "checked" : ""} onClick={() => onToggle(component.dataset, index, component.checkedField)} type="button">{row[component.checkedField] === true && <Check size={12} />}</button><span>{display(row[component.labelField])}</span>{interactive && <button className="generated-row-delete" aria-label={`Delete ${display(row[component.labelField])}`} onClick={() => onDelete(component.dataset, index)} type="button"><Trash2 size={13} /></button>}</div>) : <em>No checklist items yet.</em>}</div></div>;
  if (component.type === "table") return <div className="generated-block generated-table-block">{heading}<div className="generated-table-wrap"><table><thead><tr>{component.fields.map((field) => <th className={field.type === "number" ? "numeric" : undefined} key={field.key}>{field.label}</th>)}{interactive && <th className="generated-actions-heading" aria-label="Actions" />}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{component.fields.map((field) => <td className={field.type === "number" ? "numeric" : undefined} key={field.key}><TableValue field={field} value={row[field.key]} /></td>)}{interactive && <td className="generated-table-action"><button className="generated-row-delete" aria-label={`Delete row ${index + 1}`} onClick={() => onDelete(component.dataset, index)} type="button"><Trash2 size={13} /></button></td>}</tr>)}</tbody></table>{!rows.length && <div className="generated-empty-row"><span><Table2 size={18} /></span><div><strong>No records yet</strong><small>Use the form to add your first item.</small></div></div>}</div></div>;
  if (component.type === "form") return <div className="generated-block">{heading}{interactive ? <FormBlock component={component} submit={onAction} /> : <p className="generated-preview-note">Open this app to use the form.</p>}</div>;
  if (component.type === "tags") return <div className="generated-block">{heading}<div className="generated-tags">{rows.map((row, index) => <span key={index}>{display(row[component.labelField])}{interactive && <button aria-label={`Delete ${display(row[component.labelField])}`} onClick={() => onDelete(component.dataset, index)} type="button"><X size={10} /></button>}</span>)}</div></div>;
  if (component.type === "button") return <div className="generated-block generated-action-block">{heading}<button className={`generated-action ${component.variant}`} disabled={!interactive} onClick={() => onAction(component.actionId)} type="button">{component.actionId.includes("reset") && <RotateCcw size={14} />}{component.label}</button></div>;
  const values = rows.map((row) => Number(row[component.valueField]) || 0); const max = Math.max(...values, 1);
  return <div className="generated-block">{heading}<div className="generated-chart" role="img" aria-label={`${component.title} ${component.chartType} chart`}><div className="generated-chart-bars">{rows.slice(0, 10).map((row, index) => <div key={index}><i style={{ height: `${Math.max(5, (values[index] / max) * 100)}%` }} /><span>{display(row[component.categoryField])}</span></div>)}</div>{!rows.length && <span><BarChart3 size={20} /> No chart data yet.</span>}</div></div>;
}
