export const GENERATED_APP_ICONS = ["Flame", "WalletCards", "Utensils", "BookOpen", "CheckCircle2", "CalendarDays", "Target", "Heart", "Dumbbell", "BriefcaseBusiness", "Sparkles", "ListTodo"] as const;
export type GeneratedAppIcon = (typeof GENERATED_APP_ICONS)[number];
export type GeneratedValue = string | number | boolean;
export type GeneratedRow = Record<string, GeneratedValue>;

export type GeneratedAppField = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "textarea" | "checkbox" | "select";
  required?: boolean;
  options?: string[];
};

export type GeneratedMetric = {
  operation: "count" | "sum" | "average" | "percentage";
  field?: string;
  whereField?: string;
  whereEquals?: GeneratedValue;
};

type ComponentBase = { id: string; title: string; description?: string };
export type GeneratedAppComponent =
  | (ComponentBase & { type: "stat"; dataset: string; metric: GeneratedMetric; suffix?: string })
  | (ComponentBase & { type: "list"; dataset: string; primaryField: string; secondaryField?: string })
  | (ComponentBase & { type: "table"; dataset: string; fields: GeneratedAppField[] })
  | (ComponentBase & { type: "form"; fields: GeneratedAppField[]; actionId: string; submitLabel: string })
  | (ComponentBase & { type: "progress"; dataset: string; metric: GeneratedMetric; label?: string })
  | (ComponentBase & { type: "checklist"; dataset: string; labelField: string; checkedField: string })
  | (ComponentBase & { type: "button"; actionId: string; label: string; variant: "primary" | "secondary" | "danger" })
  | (ComponentBase & { type: "tags"; dataset: string; labelField: string })
  | (ComponentBase & { type: "chart"; dataset: string; categoryField: string; valueField: string; chartType: "bar" | "line" | "donut" });

export type GeneratedAppSection = { id: string; title?: string; columns: 1 | 2 | 3; components: GeneratedAppComponent[] };
export type GeneratedAppAction = {
  id: string;
  type: "append-record" | "clear-dataset" | "reset-data";
  dataset?: string;
};
export type GeneratedDataset = { id: string; rows: GeneratedRow[] };
export type GeneratedAppDefinition = {
  version: 1;
  appName: string;
  description: string;
  icon: GeneratedAppIcon;
  color: string;
  layout: "single-page";
  sections: GeneratedAppSection[];
  actions: GeneratedAppAction[];
  sampleData: GeneratedDataset[];
};
export type GeneratedAppState = { datasets: Record<string, GeneratedRow[]> };
export type GeneratedApp = {
  id: number;
  prompt: string;
  definition: GeneratedAppDefinition;
  state: GeneratedAppState;
  sidebarPosition: number | null;
  createdAt: string;
  updatedAt: string;
};

const IDS = /^[a-z][a-z0-9_-]{0,47}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const COMPONENT_TYPES = ["stat", "list", "table", "form", "progress", "checklist", "button", "tags", "chart"] as const;
const FIELD_TYPES = ["text", "number", "date", "textarea", "checkbox", "select"] as const;
const METRICS = ["count", "sum", "average", "percentage"] as const;
const ACTIONS = ["append-record", "clear-dataset", "reset-data"] as const;

function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown, name: string, max = 120) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`${name} is invalid.`);
  return value.trim();
}
function optionalText(value: unknown, name: string, max = 180) { return value === undefined ? undefined : text(value, name, max); }
function id(value: unknown, name: string) { const clean = text(value, name, 48); if (!IDS.test(clean)) throw new Error(`${name} is invalid.`); return clean; }
function enumValue<T extends readonly string[]>(value: unknown, values: T, name: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) throw new Error(`${name} is unsupported.`);
  return value as T[number];
}
function primitive(value: unknown, name: string): GeneratedValue {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") throw new Error(`${name} must be text, a number, or true/false.`);
  if (typeof value === "string" && value.length > 500) throw new Error(`${name} is too long.`);
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function validRows(value: unknown, name: string): GeneratedRow[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error(`${name} has too many rows.`);
  return value.map((row, rowIndex) => {
    if (!object(row) || Object.keys(row).length > 20) throw new Error(`${name} contains an invalid row.`);
    return Object.fromEntries(Object.entries(row).map(([key, item]) => [id(key, `${name} field`), primitive(item, `${name} row ${rowIndex + 1}`)]));
  });
}

function validField(value: unknown): GeneratedAppField {
  if (!object(value)) throw new Error("A field is invalid.");
  const type = enumValue(value.type, FIELD_TYPES, "Field type");
  const options = value.options === undefined ? undefined : Array.isArray(value.options) && value.options.length <= 12
    ? value.options.map((option) => text(option, "Field option", 80)) : (() => { throw new Error("Field options are invalid."); })();
  if (type === "select" && (!options || !options.length)) throw new Error("Select fields need options.");
  return { key: id(value.key, "Field key"), label: text(value.label, "Field label", 80), type, required: value.required === true || undefined, options };
}

function validMetric(value: unknown): GeneratedMetric {
  if (!object(value)) throw new Error("A metric is invalid.");
  return {
    operation: enumValue(value.operation, METRICS, "Metric operation"),
    field: value.field === undefined ? undefined : id(value.field, "Metric field"),
    whereField: value.whereField === undefined ? undefined : id(value.whereField, "Metric filter field"),
    whereEquals: value.whereEquals === undefined ? undefined : primitive(value.whereEquals, "Metric filter value"),
  };
}

export function validateGeneratedAppPrompt(value: unknown) {
  if (!object(value) || typeof value.prompt !== "string") throw new Error("Describe the mini app you want to build.");
  const prompt = value.prompt.trim();
  if (!prompt || prompt.length > 500) throw new Error("Enter a prompt between 1 and 500 characters.");
  return prompt;
}

export function validateGeneratedAppDefinition(value: unknown): GeneratedAppDefinition {
  if (!object(value)) throw new Error("The generated app has an invalid format.");
  if (value.version !== 1 || value.layout !== "single-page") throw new Error("The generated app version or layout is unsupported.");
  if (!HEX.test(String(value.color))) throw new Error("The generated theme color is invalid.");
  if (!Array.isArray(value.sampleData) || value.sampleData.length > 12) throw new Error("The generated datasets are invalid.");
  const datasetIds = new Set<string>();
  const sampleData = value.sampleData.map((item) => {
    if (!object(item)) throw new Error("A generated dataset is invalid.");
    const datasetId = id(item.id, "Dataset ID");
    if (datasetIds.has(datasetId)) throw new Error("Dataset IDs must be unique.");
    datasetIds.add(datasetId);
    return { id: datasetId, rows: validRows(item.rows, `Dataset ${datasetId}`) };
  });
  if (!sampleData.length) throw new Error("The generated app needs at least one dataset.");

  if (!Array.isArray(value.actions) || value.actions.length > 20) throw new Error("Generated actions are invalid.");
  const actionIds = new Set<string>();
  const actions = value.actions.map((item): GeneratedAppAction => {
    if (!object(item)) throw new Error("A generated action is invalid.");
    const actionId = id(item.id, "Action ID");
    if (actionIds.has(actionId)) throw new Error("Action IDs must be unique.");
    actionIds.add(actionId);
    const type = enumValue(item.type, ACTIONS, "Action type");
    const dataset = item.dataset === undefined ? undefined : id(item.dataset, "Action dataset");
    if (type !== "reset-data" && (!dataset || !datasetIds.has(dataset))) throw new Error("An action references a missing dataset.");
    return { id: actionId, type, dataset };
  });

  if (!Array.isArray(value.sections) || !value.sections.length || value.sections.length > 8) throw new Error("The generated sections are invalid.");
  const componentIds = new Set<string>();
  const sections = value.sections.map((section): GeneratedAppSection => {
    if (!object(section) || !Array.isArray(section.components) || !section.components.length || section.components.length > 12) throw new Error("A generated section is invalid.");
    const columns = Number(section.columns);
    if (![1, 2, 3].includes(columns)) throw new Error("Section columns are invalid.");
    const components = section.components.map((item): GeneratedAppComponent => {
      if (!object(item)) throw new Error("A generated component is invalid.");
      const componentId = id(item.id, "Component ID");
      if (componentIds.has(componentId)) throw new Error("Component IDs must be unique.");
      componentIds.add(componentId);
      const type = enumValue(item.type, COMPONENT_TYPES, "Component type");
      const base = { id: componentId, title: text(item.title, "Component title", 100), description: optionalText(item.description, "Component description") };
      if (type === "stat" || type === "progress") {
        const dataset = id(item.dataset, "Component dataset"); if (!datasetIds.has(dataset)) throw new Error("A component references a missing dataset.");
        return type === "stat" ? { ...base, type, dataset, metric: validMetric(item.metric), suffix: optionalText(item.suffix, "Metric suffix", 16) }
          : { ...base, type, dataset, metric: validMetric(item.metric), label: optionalText(item.label, "Progress label", 80) };
      }
      if (type === "list") { const dataset = id(item.dataset, "Component dataset"); if (!datasetIds.has(dataset)) throw new Error("A component references a missing dataset."); return { ...base, type, dataset, primaryField: id(item.primaryField, "Primary field"), secondaryField: item.secondaryField === undefined ? undefined : id(item.secondaryField, "Secondary field") }; }
      if (type === "table") { const dataset = id(item.dataset, "Component dataset"); if (!datasetIds.has(dataset) || !Array.isArray(item.fields) || !item.fields.length || item.fields.length > 8) throw new Error("A table is invalid."); return { ...base, type, dataset, fields: item.fields.map(validField) }; }
      if (type === "form") { if (!Array.isArray(item.fields) || !item.fields.length || item.fields.length > 10) throw new Error("A form is invalid."); const actionId = id(item.actionId, "Form action"); if (!actionIds.has(actionId)) throw new Error("A form references a missing action."); return { ...base, type, fields: item.fields.map(validField), actionId, submitLabel: text(item.submitLabel, "Submit label", 50) }; }
      if (type === "checklist") { const dataset = id(item.dataset, "Component dataset"); if (!datasetIds.has(dataset)) throw new Error("A component references a missing dataset."); return { ...base, type, dataset, labelField: id(item.labelField, "Checklist label field"), checkedField: id(item.checkedField, "Checklist checked field") }; }
      if (type === "button") { const actionId = id(item.actionId, "Button action"); if (!actionIds.has(actionId)) throw new Error("A button references a missing action."); return { ...base, type, actionId, label: text(item.label, "Button label", 50), variant: enumValue(item.variant, ["primary", "secondary", "danger"] as const, "Button variant") }; }
      if (type === "tags") { const dataset = id(item.dataset, "Component dataset"); if (!datasetIds.has(dataset)) throw new Error("A component references a missing dataset."); return { ...base, type, dataset, labelField: id(item.labelField, "Tag label field") }; }
      const dataset = id(item.dataset, "Component dataset"); if (!datasetIds.has(dataset)) throw new Error("A component references a missing dataset.");
      return { ...base, type: "chart", dataset, categoryField: id(item.categoryField, "Chart category field"), valueField: id(item.valueField, "Chart value field"), chartType: enumValue(item.chartType, ["bar", "line", "donut"] as const, "Chart type") };
    });
    return { id: id(section.id, "Section ID"), title: optionalText(section.title, "Section title", 100), columns: columns as 1 | 2 | 3, components };
  });
  const result: GeneratedAppDefinition = { version: 1, appName: text(value.appName, "App name", 100), description: text(value.description, "App description", 240), icon: enumValue(value.icon, GENERATED_APP_ICONS, "App icon"), color: String(value.color).toUpperCase(), layout: "single-page", sections, actions, sampleData };
  if (JSON.stringify(result).length > 150_000) throw new Error("The generated app is too large.");
  return result;
}

export function initialGeneratedAppState(definition: GeneratedAppDefinition): GeneratedAppState {
  return { datasets: Object.fromEntries(definition.sampleData.map((dataset) => [dataset.id, dataset.rows.map((row) => ({ ...row }))])) };
}

export function validateGeneratedAppState(value: unknown, definition: GeneratedAppDefinition): GeneratedAppState {
  if (!object(value) || !object(value.datasets)) throw new Error("The app data is invalid.");
  const allowed = new Set(definition.sampleData.map((dataset) => dataset.id));
  const datasets: Record<string, GeneratedRow[]> = {};
  for (const [key, rows] of Object.entries(value.datasets)) {
    if (!allowed.has(key)) throw new Error("The app data contains an unknown dataset.");
    datasets[key] = validRows(rows, `Dataset ${key}`);
  }
  for (const key of allowed) datasets[key] ??= [];
  const state = { datasets };
  if (JSON.stringify(state).length > 150_000) throw new Error("The app data is too large.");
  return state;
}

export function metricValue(rows: GeneratedRow[], metric: GeneratedMetric) {
  const filtered = metric.whereField ? rows.filter((row) => row[metric.whereField!] === metric.whereEquals) : rows;
  if (metric.operation === "count") return filtered.length;
  if (metric.operation === "percentage") return rows.length ? Math.round((filtered.length / rows.length) * 100) : 0;
  const values = filtered.map((row) => Number(metric.field ? row[metric.field] : 0)).filter(Number.isFinite);
  const total = values.reduce((sum, value) => sum + value, 0);
  return metric.operation === "average" ? (values.length ? Math.round((total / values.length) * 100) / 100 : 0) : Math.round(total * 100) / 100;
}

export function stripGeneratedJsonFences(value: string) { return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(); }
export function validGeneratedAppId(value: string | number) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1) throw new Error("App not found."); return parsed; }

export function createGeneratedAppFallback(prompt: string): GeneratedAppDefinition {
  const lower = prompt.toLowerCase();
  const kind = lower.includes("budget") ? "budget" : lower.includes("meal") ? "meal" : lower.includes("study") ? "study" : "habit";
  const presets = {
    habit: { name: "Habit Tracker", description: "Build consistent routines, check off daily habits, and watch your progress grow.", icon: "Flame", color: "#F97316", item: "Habit", examples: [["Drink 2L water", "Health", 7, true], ["Read 20 pages", "Growth", 5, false], ["Morning workout", "Fitness", 6, true]] },
    budget: { name: "Budget Tracker", description: "Record spending, organize transactions, and keep your monthly budget visible.", icon: "WalletCards", color: "#16A34A", item: "Transaction", examples: [["Groceries", "Food", 82, true], ["Internet", "Bills", 45, true], ["Weekend plans", "Leisure", 30, false]] },
    meal: { name: "Meal Planner", description: "Plan meals, organize the week, and keep preparation on track.", icon: "Utensils", color: "#2563EB", item: "Meal", examples: [["Overnight oats", "Breakfast", 15, true], ["Veggie grain bowl", "Lunch", 30, false], ["Pasta primavera", "Dinner", 40, false]] },
    study: { name: "Study Planner", description: "Plan study sessions, track subjects, and stay ahead of your learning goals.", icon: "BookOpen", color: "#7C3AED", item: "Study session", examples: [["Calculus practice", "Math", 45, true], ["Review flashcards", "Biology", 25, false], ["Essay outline", "Literature", 40, false]] },
  } as const;
  const preset = presets[kind];
  const sampleRows = preset.examples.map(([name, category, value, done]) => ({ name, category, value, done }));
  return validateGeneratedAppDefinition({
    version: 1, appName: preset.name, description: preset.description, icon: preset.icon, color: preset.color, layout: "single-page",
    sections: [
      { id: "overview", title: "Overview", columns: 3, components: [
        { id: "total-items", type: "stat", title: `Total ${preset.item}s`, description: "Currently tracked", dataset: "items", metric: { operation: "count" } },
        { id: "completed-items", type: "stat", title: "Completed", description: "Finished items", dataset: "items", metric: { operation: "count", whereField: "done", whereEquals: true } },
        { id: "overall-progress", type: "progress", title: "Overall progress", label: "Completion", dataset: "items", metric: { operation: "percentage", whereField: "done", whereEquals: true } },
      ] },
      { id: "daily-plan", title: kind === "habit" ? "Today's habits" : "Your plan", columns: 2, components: [
        { id: "item-checklist", type: "checklist", title: `${preset.item} checklist`, description: "Check items off as you complete them.", dataset: "items", labelField: "name", checkedField: "done" },
        { id: "progress-chart", type: "chart", title: `${preset.item} overview`, description: "A quick comparison of your current items.", dataset: "items", categoryField: "name", valueField: "value", chartType: "bar" },
      ] },
      { id: "manage", title: `Manage ${preset.item.toLowerCase()}s`, columns: 2, components: [
        { id: "add-item-form", type: "form", title: `Add ${preset.item.toLowerCase()}`, description: "Create another item for your tracker.", fields: [{ key: "name", label: `${preset.item} name`, type: "text", required: true }, { key: "category", label: "Category", type: "select", required: true, options: ["Personal", "Health", "Work", "Learning"] }, { key: "value", label: kind === "budget" ? "Amount" : "Target", type: "number", required: true }, { key: "done", label: "Already completed", type: "checkbox" }], actionId: "append-item", submitLabel: `Add ${preset.item.toLowerCase()}` },
        { id: "items-table", type: "table", title: `All ${preset.item.toLowerCase()}s`, dataset: "items", fields: [{ key: "name", label: "Name", type: "text" }, { key: "category", label: "Category", type: "text" }, { key: "value", label: kind === "budget" ? "Amount" : "Target", type: "number" }, { key: "done", label: "Complete", type: "checkbox" }] },
        { id: "reset-tracker", type: "button", title: "Start fresh", description: "Restore the original sample data.", actionId: "reset-data", label: "Reset sample data", variant: "secondary" },
      ] },
    ],
    actions: [{ id: "append-item", type: "append-record", dataset: "items" }, { id: "clear-items", type: "clear-dataset", dataset: "items" }, { id: "reset-data", type: "reset-data" }],
    sampleData: [{ id: "items", rows: sampleRows }],
  });
}
