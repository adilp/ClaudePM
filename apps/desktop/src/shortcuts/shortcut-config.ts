// shortcuts/shortcut-config.ts
// All keyboard shortcuts defined in one place for easy modification

export type ShortcutAction =
  | { type: 'navigate'; to: string }
  | { type: 'action'; handler: string }
  | { type: 'toggleCheatsheet' };

export interface Shortcut {
  keys: string;           // e.g., 'g p', 'j', 'Escape'
  action: ShortcutAction;
  description: string;
  scope?: string;         // undefined = global, or 'projectDetail', 'ticketDetail', etc.
}

export const shortcuts: Shortcut[] = [
  // ═══════════════════════════════════════════════════════════════
  // GLOBAL SHORTCUTS (work on any page)
  // ═══════════════════════════════════════════════════════════════

  // Navigation
  { keys: 'g d', action: { type: 'navigate', to: '/' }, description: 'Go to Dashboard' },
  { keys: 'g p', action: { type: 'navigate', to: '/projects' }, description: 'Go to Projects' },
  { keys: 'g s', action: { type: 'navigate', to: '/sessions' }, description: 'Go to Sessions' },

  // Utility
  { keys: '?', action: { type: 'toggleCheatsheet' }, description: 'Toggle shortcut cheatsheet' },
  { keys: 'Escape', action: { type: 'action', handler: 'escape' }, description: 'Close modal / Go back' },

  // Quick Find (C-a prefix like tmux)
  { keys: 'C-a s', action: { type: 'action', handler: 'findProject' }, description: 'Find project' },
  { keys: 'C-a t', action: { type: 'action', handler: 'findTicket' }, description: 'Find ticket' },

  // Global Actions
  { keys: 's s', action: { type: 'action', handler: 'syncSessions' }, description: 'Sync all sessions' },

  // ═══════════════════════════════════════════════════════════════
  // PROJECT DETAIL (Kanban Board)
  // ═══════════════════════════════════════════════════════════════
  { keys: 'j', action: { type: 'action', handler: 'selectNextTicket' }, description: 'Next ticket', scope: 'projectDetail' },
  { keys: 'k', action: { type: 'action', handler: 'selectPrevTicket' }, description: 'Previous ticket', scope: 'projectDetail' },
  { keys: 'h', action: { type: 'action', handler: 'prevColumn' }, description: 'Previous column', scope: 'projectDetail' },
  { keys: 'l', action: { type: 'action', handler: 'nextColumn' }, description: 'Next column', scope: 'projectDetail' },
  { keys: 'Enter', action: { type: 'action', handler: 'openTicket' }, description: 'Open ticket', scope: 'projectDetail' },
  { keys: 'n', action: { type: 'action', handler: 'newAdhoc' }, description: 'New adhoc ticket', scope: 'projectDetail' },
  { keys: 'r', action: { type: 'action', handler: 'sync' }, description: 'Sync project', scope: 'projectDetail' },

  // ═══════════════════════════════════════════════════════════════
  // TICKET DETAIL
  // ═══════════════════════════════════════════════════════════════
  { keys: 's', action: { type: 'action', handler: 'startSession' }, description: 'Start session', scope: 'ticketDetail' },
  { keys: 'a', action: { type: 'action', handler: 'approve' }, description: 'Approve', scope: 'ticketDetail' },
  { keys: 'x', action: { type: 'action', handler: 'reject' }, description: 'Reject', scope: 'ticketDetail' },
  { keys: 'e', action: { type: 'action', handler: 'editTicket' }, description: 'Edit ticket', scope: 'ticketDetail' },
  { keys: 'g g', action: { type: 'action', handler: 'openFileStager' }, description: 'Open file stager', scope: 'ticketDetail' },
  { keys: 'Backspace', action: { type: 'action', handler: 'goBack' }, description: 'Back to project', scope: 'ticketDetail' },

  // ═══════════════════════════════════════════════════════════════
  // SESSION DETAIL
  // ═══════════════════════════════════════════════════════════════
  { keys: 'c', action: { type: 'action', handler: 'continue' }, description: 'Continue session', scope: 'sessionDetail' },
  { keys: 'q', action: { type: 'action', handler: 'stop' }, description: 'Stop session', scope: 'sessionDetail' },
  { keys: '[', action: { type: 'action', handler: 'scrollUp' }, description: 'Scroll up', scope: 'sessionDetail' },
  { keys: ']', action: { type: 'action', handler: 'scrollDown' }, description: 'Scroll down', scope: 'sessionDetail' },
  { keys: 'i', action: { type: 'action', handler: 'toggleInfo' }, description: 'Toggle info panel', scope: 'sessionDetail' },

  // ═══════════════════════════════════════════════════════════════
  // SESSIONS LIST
  // ═══════════════════════════════════════════════════════════════
  { keys: 'j', action: { type: 'action', handler: 'selectNext' }, description: 'Next session', scope: 'sessions' },
  { keys: 'k', action: { type: 'action', handler: 'selectPrev' }, description: 'Previous session', scope: 'sessions' },
  { keys: 'Enter', action: { type: 'action', handler: 'openSession' }, description: 'Open session', scope: 'sessions' },

  // ═══════════════════════════════════════════════════════════════
  // PROJECTS LIST
  // ═══════════════════════════════════════════════════════════════
  { keys: 'j', action: { type: 'action', handler: 'selectNext' }, description: 'Next project', scope: 'projects' },
  { keys: 'k', action: { type: 'action', handler: 'selectPrev' }, description: 'Previous project', scope: 'projects' },
  { keys: 'Enter', action: { type: 'action', handler: 'openProject' }, description: 'Open project', scope: 'projects' },
  { keys: 'n', action: { type: 'action', handler: 'newProject' }, description: 'New project', scope: 'projects' },
];

// Helper to get shortcuts by scope
export function getShortcutsByScope(scope: string | null): {
  global: Shortcut[];
  scoped: Shortcut[];
} {
  const global = shortcuts.filter(s => !s.scope);
  const scoped = scope ? shortcuts.filter(s => s.scope === scope) : [];
  return { global, scoped };
}

// Helper to find matching shortcut
export function findMatchingShortcut(
  sequence: string,
  currentScope: string | null
): Shortcut | null {
  // First check scoped shortcuts (higher priority)
  if (currentScope) {
    const scopedMatch = shortcuts.find(
      s => s.keys === sequence && s.scope === currentScope
    );
    if (scopedMatch) return scopedMatch;
  }

  // Then check global shortcuts
  const globalMatch = shortcuts.find(
    s => s.keys === sequence && !s.scope
  );
  return globalMatch || null;
}

// Helper to check if there's a potential multi-key match
export function hasPotentialMatch(sequence: string): boolean {
  return shortcuts.some(s => s.keys.startsWith(sequence + ' '));
}

// Get scope display name for cheatsheet
export function getScopeDisplayName(scope: string | null): string {
  const names: Record<string, string> = {
    projectDetail: 'Project Board',
    ticketDetail: 'Ticket Detail',
    sessionDetail: 'Session Detail',
    sessions: 'Sessions List',
    projects: 'Projects List',
  };
  return scope ? names[scope] || scope : 'Global';
}
