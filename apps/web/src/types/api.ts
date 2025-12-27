/**
 * API Types
 * TypeScript types matching the server API responses
 */

// ============================================================================
// Project Types
// ============================================================================

export interface Project {
  id: string;
  name: string;
  repo_path: string;
  tickets_path: string | null;
  handoff_path: string | null;
  tmux_session: string;
  tmux_window: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends Project {
  ticket_counts: {
    backlog: number;
    in_progress: number;
    review: number;
    done: number;
  };
  active_session: {
    id: string;
    status: string;
    context_percent: number | null;
    started_at: string | null;
  } | null;
}

// ============================================================================
// Ticket Types
// ============================================================================

export type TicketState = 'backlog' | 'in_progress' | 'review' | 'done';

export interface Ticket {
  id: string;
  project_id: string;
  external_id: string;
  title: string;
  state: TicketState;
  file_path: string;
  content_hash: string;
  created_at: string;
  updated_at: string;
}

export interface TicketDetail extends Ticket {
  content: string;
}

// ============================================================================
// Session Types
// ============================================================================

export type SessionStatus = 'starting' | 'running' | 'waiting' | 'stopped';

export interface Session {
  id: string;
  project_id: string;
  ticket_id: string | null;
  tmux_pane: string;
  status: SessionStatus;
  context_percent: number | null;
  started_at: string | null;
  stopped_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Git Types
// ============================================================================

export interface DiffFile {
  file_path: string;
  old_file_path?: string;
  change_type: 'added' | 'modified' | 'deleted' | 'renamed';
  hunks: Array<{
    old_start: number;
    old_count: number;
    new_start: number;
    new_count: number;
    content: string;
  }>;
}

export interface DiffResult {
  files: DiffFile[];
  truncated: boolean;
  total_lines: number;
}

export interface GitStatus {
  branch: string | null;
  upstream: string | null;
  detached: boolean;
  staged: Array<{ path: string; status: string }>;
  unstaged: Array<{ path: string; status: string }>;
  untracked: string[];
  clean: boolean;
  ahead: number;
  behind: number;
}

export interface BranchInfo {
  name: string;
  remote: string | null;
  is_main_branch: boolean;
  recent_commits: Array<{
    hash: string;
    message: string;
    date: string;
  }>;
}

// ============================================================================
// Pagination Types
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// ============================================================================
// Error Types
// ============================================================================

export interface ApiError {
  error: string;
  code?: string;
  details?: Record<string, string[]>;
}
