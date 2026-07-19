export const AVATAR_COLORS = ["#7057E8", "#3979CA", "#359568", "#C37719", "#CE6542", "#D44F82", "#168C9B"] as const;

export function normalizeCollaboratorEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidCollaboratorEmail(email: string) {
  const normalized = normalizeCollaboratorEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && normalized.length <= 254;
}

export function kanbanRoomId(boardId: number) {
  return `flowspace:kanban-board:${boardId}`;
}

export function liveblocksUserId(userId: number) {
  return `user:${userId}`;
}

export function avatarColor(value: string) {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function initials(name: string | null, email: string) {
  const source = name?.trim() || email.split("@")[0];
  return source.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

export function indexTaskThreads<T extends { metadata: { taskId?: string }; comments: readonly unknown[] }>(threads: readonly T[]) {
  const index = new Map<string, T>();
  for (const thread of threads) if (thread.metadata.taskId) index.set(thread.metadata.taskId, thread);
  return index;
}
