export {};

declare global {
  interface Liveblocks {
    Presence: {
      activeTaskId: number | null;
    };
    Storage: Record<string, never>;
    UserMeta: {
      id: string;
      info: {
        name: string;
        email: string;
        avatar: string;
        color: string;
      };
    };
    RoomEvent: {
      type: "KANBAN_BOARD_UPDATED";
      boardId: number;
    };
    ThreadMetadata: {
      taskId: string;
    };
    CommentMetadata: Record<string, never>;
    RoomInfo: Record<string, never>;
    GroupInfo: Record<string, never>;
    ActivitiesData: Record<string, never>;
  }
}
