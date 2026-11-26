export const queryKeys = {
  habits: {
    all: ["habits"] as const,
    list: (includeArchived?: boolean) => ["habits", { includeArchived }] as const,
  },
  entries: {
    all: ["entries"] as const,
    today: ["entries", "today"] as const,
    range: (start: string, end: string) => ["entries", { start, end }] as const,
  },
  goals: {
    all: ["goals"] as const,
  },
  goalProgress: {
    all: ["goal-progress"] as const,
    forDate: (date: string) => ["goal-progress", date] as const,
  },
  auth: {
    me: ["auth", "me"] as const,
    status: ["auth", "status"] as const,
  },
};
