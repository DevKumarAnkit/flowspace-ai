export const SPACE_COLORS = ["#7057E8", "#3979CA", "#359568", "#C37719", "#CE6542", "#D44F82"] as const;
export type SpaceColor = (typeof SPACE_COLORS)[number];

export const PAGE_TEMPLATES = ["blank", "project-plan", "meeting-notes", "prd", "research-notes", "task-plan"] as const;
export type PageTemplate = (typeof PAGE_TEMPLATES)[number];
export type PageDocument = { type: "doc"; content?: Array<Record<string, unknown>> };

export const PAGE_TEMPLATE_LABELS: Record<PageTemplate, string> = {
  blank: "Blank Page",
  "project-plan": "Project Plan",
  "meeting-notes": "Meeting Notes",
  prd: "PRD",
  "research-notes": "Research Notes",
  "task-plan": "Task Plan",
};

export type PersonSummary = { id: number; name: string; email: string; imageUrl: string | null };
export type SpaceSummary = {
  id: number; name: string; description: string; color: SpaceColor; isFavorite: boolean;
  lastOpenedAt: string | null; archivedAt: string | null; createdAt: string; updatedAt: string;
  pageCount: number; pageTitles: string[]; owner: PersonSummary; accessRole: "owner" | "editor";
};
export type SpacePage = {
  id: number; spaceId: number; title: string; template: PageTemplate; content: PageDocument;
  isFavorite: boolean; archivedAt: string | null; createdAt: string; updatedAt: string;
  updatedBy: PersonSummary;
};
export type SpaceDetail = Omit<SpaceSummary, "pageCount" | "pageTitles"> & { pages: SpacePage[] };
export type SpaceCollaborator = { id: string; name: string | null; email: string; imageUrl: string | null; role: "owner" | "editor"; status: "active" | "pending" };
export type LinkedTask = { id: number; title: string; boardId: number; boardName: string; linked: boolean };

const paragraph = (text = "") => ({ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) });
const heading = (text: string, level: 1 | 2 | 3 = 2) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
const bullets = (...items: string[]) => ({ type: "bulletList", content: items.map((text) => ({ type: "listItem", content: [paragraph(text)] })) });
const tasks = (...items: string[]) => ({ type: "taskList", content: items.map((text) => ({ type: "taskItem", attrs: { checked: false }, content: [paragraph(text)] })) });

export function templateDocument(template: PageTemplate): PageDocument {
  if (template === "project-plan") return { type: "doc", content: [heading("Overview"), paragraph("Describe the project and the outcome you want to achieve."), heading("Goals"), bullets("Primary goal", "Success measure"), heading("Milestones"), tasks("First milestone", "Next milestone")] };
  if (template === "meeting-notes") return { type: "doc", content: [heading("Meeting details"), paragraph("Date · Attendees"), heading("Agenda"), bullets("Topic to discuss"), heading("Notes"), paragraph(), heading("Action items"), tasks("Assign the next step")] };
  if (template === "prd") return { type: "doc", content: [heading("Problem"), paragraph("What user problem are we solving?"), heading("Goals and success metrics"), bullets("Goal", "Metric"), heading("Requirements"), tasks("Core requirement"), heading("Open questions"), bullets("Question to resolve")] };
  if (template === "research-notes") return { type: "doc", content: [heading("Research question"), paragraph("What are you trying to learn?"), heading("Sources"), bullets("Add a source"), heading("Findings"), paragraph(), heading("Takeaways"), bullets("Key insight")] };
  if (template === "task-plan") return { type: "doc", content: [heading("Objective"), paragraph("Define the result this plan should produce."), heading("Tasks"), tasks("First task", "Second task", "Final review"), heading("Notes"), paragraph()] };
  return { type: "doc", content: [paragraph()] };
}

export function cleanSpaceName(value: string) {
  const clean = value.trim();
  if (!clean || clean.length > 160) throw new Error("Enter a space name up to 160 characters.");
  return clean;
}

export function cleanSpaceDescription(value: string) {
  const clean = value.trim();
  if (clean.length > 500) throw new Error("Keep the space description under 500 characters.");
  return clean;
}

export function cleanPageTitle(value: string) {
  const clean = value.trim();
  if (!clean || clean.length > 160) throw new Error("Enter a page name up to 160 characters.");
  return clean;
}

export function validSpaceColor(value: string): SpaceColor {
  if (!SPACE_COLORS.includes(value as SpaceColor)) throw new Error("Choose a supported space color.");
  return value as SpaceColor;
}

export function validPageTemplate(value: string): PageTemplate {
  if (!PAGE_TEMPLATES.includes(value as PageTemplate)) throw new Error("Choose a supported page template.");
  return value as PageTemplate;
}

export function validPageDocument(value: unknown): PageDocument {
  if (!value || typeof value !== "object" || (value as { type?: unknown }).type !== "doc") throw new Error("The page content is not valid.");
  return value as PageDocument;
}

export function duplicateName(value: string) {
  const suffix = " Copy";
  return `${value.slice(0, 160 - suffix.length).trimEnd()}${suffix}`;
}

function textFromNode(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const node = value as { text?: unknown; content?: unknown };
  const own = typeof node.text === "string" ? [node.text] : [];
  const children = Array.isArray(node.content) ? node.content.flatMap(textFromNode) : [];
  return [...own, ...children];
}

export function extractPageExcerpt(document: PageDocument, maxLength = 180) {
  const text = textFromNode(document).join(" ").replace(/\s+/g, " ").trim();
  if (!text) return "No description yet.";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export type SpaceFilter = "all" | "favorites" | "recent" | "archived";
export type SpaceSort = "updated" | "name" | "pages" | "favorites";

export function filterSpaces(entries: SpaceSummary[], filter: SpaceFilter, query = "") {
  const normalized = query.trim().toLowerCase();
  return entries.filter((space) => {
    const statusMatch = filter === "archived" ? Boolean(space.archivedAt) : !space.archivedAt && (filter === "favorites" ? space.isFavorite : filter === "recent" ? Boolean(space.lastOpenedAt) : true);
    const searchMatch = !normalized || space.name.toLowerCase().includes(normalized) || space.description.toLowerCase().includes(normalized) || space.pageTitles.some((title) => title.toLowerCase().includes(normalized));
    return statusMatch && searchMatch;
  });
}

export function sortSpaces(entries: SpaceSummary[], sort: SpaceSort) {
  return [...entries].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "pages") return b.pageCount - a.pageCount || a.name.localeCompare(b.name);
    if (sort === "favorites") return Number(b.isFavorite) - Number(a.isFavorite) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    if (sort === "updated") return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    return Date.parse(b.lastOpenedAt ?? "0") - Date.parse(a.lastOpenedAt ?? "0");
  });
}

export function formatRelativeTime(value: string | Date, now = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 172800) return "yesterday";
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  if (seconds < 1209600) return "last week";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: date.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}
