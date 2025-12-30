/**
 * Query Keys
 * Centralized query key definitions for React Query
 * Following the factory pattern for type-safe and composable keys
 */

export const queryKeys = {
  // Projects
  projects: {
    all: ['projects'] as const,
    lists: () => [...queryKeys.projects.all, 'list'] as const,
    list: (page: number, limit: number) =>
      [...queryKeys.projects.lists(), { page, limit }] as const,
    details: () => [...queryKeys.projects.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.projects.details(), id] as const,
  },

  // Tickets
  tickets: {
    all: ['tickets'] as const,
    lists: () => [...queryKeys.tickets.all, 'list'] as const,
    list: (projectId: string) => [...queryKeys.tickets.lists(), projectId] as const,
    details: () => [...queryKeys.tickets.all, 'detail'] as const,
    detail: (projectId: string, ticketId: string) =>
      [...queryKeys.tickets.details(), projectId, ticketId] as const,
    content: (ticketId: string) =>
      [...queryKeys.tickets.detail('', ticketId), 'content'] as const,
    history: (ticketId: string) =>
      [...queryKeys.tickets.detail('', ticketId), 'history'] as const,
  },

  // Sessions
  sessions: {
    all: ['sessions'] as const,
    lists: () => [...queryKeys.sessions.all, 'list'] as const,
    list: (projectId?: string) =>
      [...queryKeys.sessions.lists(), { projectId }] as const,
    details: () => [...queryKeys.sessions.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.sessions.details(), id] as const,
    // Analysis
    analysis: () => [...queryKeys.sessions.all, 'analysis'] as const,
    summary: (id: string) => [...queryKeys.sessions.analysis(), 'summary', id] as const,
    reviewReport: (id: string) =>
      [...queryKeys.sessions.analysis(), 'review', id] as const,
    activity: (id: string) =>
      [...queryKeys.sessions.analysis(), 'activity', id] as const,
  },

  // tmux
  tmux: {
    all: ['tmux'] as const,
    sessions: () => [...queryKeys.tmux.all, 'sessions'] as const,
    session: (name: string) => [...queryKeys.tmux.all, 'session', name] as const,
  },
};
