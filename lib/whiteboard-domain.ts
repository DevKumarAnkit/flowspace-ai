export const WHITEBOARD_COLORS = ["#7057E8", "#3979CA", "#359568", "#C37719", "#CE6542", "#D44F82"] as const;
export type WhiteboardColor = (typeof WHITEBOARD_COLORS)[number];

export const DIAGRAM_COLORS = ["#ECE8FF", "#DDEBFF", "#DDF5E9", "#FFF0CC", "#FFE2DC", "#FBE0ED"] as const;
export type DiagramColor = (typeof DIAGRAM_COLORS)[number];
export type DiagramShape = "rectangle" | "ellipse" | "diamond";

export type WhiteboardScene = {
  elements: Array<Record<string, unknown>>;
  appState: Record<string, unknown>;
  files: Record<string, Record<string, unknown>>;
};

export type Whiteboard = {
  id: number;
  name: string;
  color: WhiteboardColor;
  scene: WhiteboardScene;
  createdAt: string;
  updatedAt: string;
};

export type DiagramNode = {
  id: string;
  label: string;
  shape: DiagramShape;
  row: number;
  column: number;
  color: DiagramColor;
};

export type DiagramEdge = {
  from: string;
  to: string;
  label?: string;
  style: "solid" | "dashed";
};

export type AiDiagram = { title: string; nodes: DiagramNode[]; edges: DiagramEdge[] };

export const EMPTY_WHITEBOARD_SCENE: WhiteboardScene = { elements: [], appState: { viewBackgroundColor: "#FFFFFF" }, files: {} };
const MAX_SCENE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function cleanWhiteboardName(name: string) {
  const clean = name.trim();
  if (!clean || clean.length > 160) throw new Error("Enter a whiteboard name up to 160 characters.");
  return clean;
}

export function validWhiteboardColor(color: string): WhiteboardColor {
  if (!WHITEBOARD_COLORS.includes(color as WhiteboardColor)) throw new Error("Choose a supported whiteboard color.");
  return color as WhiteboardColor;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validWhiteboardScene(value: unknown): WhiteboardScene {
  if (!record(value) || !Array.isArray(value.elements) || !record(value.appState) || !record(value.files)) {
    throw new Error("The whiteboard scene is not valid.");
  }
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > MAX_SCENE_BYTES) throw new Error("This whiteboard is larger than the 10 MB limit.");
  for (const file of Object.values(value.files)) {
    if (!record(file)) throw new Error("The whiteboard contains an invalid image.");
    const dataURL = file.dataURL;
    if (typeof dataURL !== "string") throw new Error("The whiteboard contains an invalid image.");
    const base64 = dataURL.slice(dataURL.indexOf(",") + 1);
    if (Math.ceil(base64.length * 0.75) > MAX_IMAGE_BYTES) throw new Error("Each whiteboard image must be 5 MB or smaller.");
  }
  return value as WhiteboardScene;
}

export function formatWhiteboardTime(value: string | Date, now = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 45) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 172800) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: date.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

export function safePngFilename(name: string) {
  const safe = name.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").replace(/\s+/g, " ").replace(/[. ]+$/g, "").slice(0, 120);
  return `${safe || "whiteboard"}.png`;
}

export function validateDiagramPrompt(value: unknown) {
  if (!record(value) || typeof value.prompt !== "string") throw new Error("Enter a diagram prompt.");
  const prompt = value.prompt.trim();
  if (!prompt || prompt.length > 2000) throw new Error("Enter a prompt between 1 and 2,000 characters.");
  return prompt;
}

export function validateAiDiagram(value: unknown): AiDiagram {
  if (!record(value) || typeof value.title !== "string" || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error("The generated diagram has an invalid format.");
  }
  if (!value.nodes.length || value.nodes.length > 30 || value.edges.length > 60) throw new Error("The generated diagram is too large or empty.");
  const ids = new Set<string>();
  const nodes = value.nodes.map((item) => {
    if (!record(item) || typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,48}$/.test(item.id) || ids.has(item.id)) throw new Error("The diagram contains duplicate or invalid node IDs.");
    if (typeof item.label !== "string" || !item.label.trim() || item.label.length > 180) throw new Error("The diagram contains an invalid node label.");
    if (!(["rectangle", "ellipse", "diamond"] as const).includes(item.shape as DiagramShape)) throw new Error("The diagram contains an unsupported shape.");
    if (!Number.isInteger(item.row) || !Number.isInteger(item.column) || Math.abs(item.row as number) > 20 || Math.abs(item.column as number) > 20) throw new Error("The diagram contains unsafe coordinates.");
    if (!DIAGRAM_COLORS.includes(item.color as DiagramColor)) throw new Error("The diagram contains an unsupported color.");
    ids.add(item.id);
    return { id: item.id, label: item.label.trim(), shape: item.shape, row: item.row, column: item.column, color: item.color } as DiagramNode;
  });
  const edges = value.edges.map((item) => {
    if (!record(item) || typeof item.from !== "string" || typeof item.to !== "string" || !ids.has(item.from) || !ids.has(item.to)) throw new Error("The diagram contains an edge with a missing node.");
    if (item.label !== undefined && (typeof item.label !== "string" || item.label.length > 100)) throw new Error("The diagram contains an invalid edge label.");
    if (item.style !== "solid" && item.style !== "dashed") throw new Error("The diagram contains an invalid edge style.");
    return { from: item.from, to: item.to, label: typeof item.label === "string" ? item.label.trim() || undefined : undefined, style: item.style } as DiagramEdge;
  });
  return { title: value.title.trim().slice(0, 160) || "AI Diagram", nodes, edges };
}

export function normalizeDiagramGrid(diagram: AiDiagram) {
  const minRow = Math.min(...diagram.nodes.map((node) => node.row));
  const minColumn = Math.min(...diagram.nodes.map((node) => node.column));
  const occupied = new Set<string>();
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => {
      let row = node.row - minRow;
      let column = node.column - minColumn;
      while (occupied.has(`${row}:${column}`)) column += 1;
      occupied.add(`${row}:${column}`);
      return { ...node, row, column };
    }),
  };
}
