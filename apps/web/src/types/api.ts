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
  external_id: string | null;
  title: string;
  state: TicketState;
  file_path: string;
  content_hash: string;
  is_adhoc: boolean;
  is_explore: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdhocTicketCreate {
  title: string;
  slug: string;
  isExplore?: boolean;
}

export interface AdhocTicketResponse {
  id: string;
  project_id: string;
  external_id: string | null;
  title: string;
  state: TicketState;
  file_path: string;
  content_hash: string;
  is_adhoc: boolean;
  is_explore: boolean;
  created_at: string;
  updated_at: string;
}

export interface TicketDetail extends Ticket {
  content: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface TransitionResult {
  ticket_id: string;
  from_state: TicketState;
  to_state: TicketState;
  trigger: string;
  reason: string | null;
  timestamp: string;
  history_entry_id: string;
}

export interface StateHistoryEntry {
  id: string;
  ticket_id: string;
  from_state: TicketState;
  to_state: TicketState;
  trigger: string;
  reason: string | null;
  feedback?: string;
  triggered_by?: string;
  created_at: string;
}

export interface StartTicketResponse {
  ticket: Ticket;
  session: Session;
}

// ============================================================================
// Session Types
// ============================================================================

export type SessionStatus = 'running' | 'paused' | 'completed' | 'error';
export type SessionType = 'ticket' | 'adhoc';

export interface Session {
  id: string;
  project_id: string;
  ticket_id: string | null;
  type: SessionType;
  status: SessionStatus;
  context_percent: number | null;
  pane_id: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  // Related data
  project?: {
    id: string;
    name: string;
  } | null;
  ticket?: {
    id: string;
    external_id: string | null;
    title: string;
  } | null;
}

export interface SyncSessionsResult {
  message: string;
  orphaned_sessions: Array<{
    session_id: string;
    pane_id: string;
  }>;
  alive_sessions: Array<{
    session_id: string;
    pane_id: string;
    pane_title: string | null;
  }>;
  total_checked: number;
  orphaned_count: number;
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
// tmux Types
// ============================================================================

export interface TmuxSession {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
}

export interface TmuxSessionDetail extends TmuxSession {
  windows_detail: Array<{
    index: number;
    name: string;
    active: boolean;
    panes: Array<{
      id: string;
      index: number;
      active: boolean;
      pid: number;
    }>;
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
// Session Analysis Types
// ============================================================================

export interface SessionAction {
  type: 'read' | 'write' | 'edit' | 'bash' | 'test' | 'other';
  description: string;
  target?: string;
}

export interface FileChange {
  path: string;
  changeType: 'created' | 'modified' | 'deleted';
  summary?: string;
}

export interface SessionSummary {
  session_id: string;
  ticket_id?: string;
  headline: string;
  description: string;
  actions: SessionAction[];
  files_changed: FileChange[];
  status: 'completed' | 'in_progress' | 'blocked' | 'failed';
  analyzed_at: string;
}

export interface ReviewReport {
  session_id: string;
  ticket_id: string;
  ticket_title: string;
  completion_status: 'complete' | 'partial' | 'blocked' | 'unclear';
  confidence: number;
  accomplished: string[];
  remaining: string[];
  concerns: string[];
  next_steps: string[];
  suggested_commit_message?: string;
  suggested_pr_description?: string;
  generated_at: string;
}

export interface CommitMessage {
  message: string;
  type: 'feat' | 'fix' | 'refactor' | 'docs' | 'test' | 'chore';
  scope?: string;
  breaking: boolean;
}

export interface PrDescription {
  title: string;
  body: string;
  labels: string[];
}

export interface ActivityEvent {
  type: 'tool_use' | 'thinking' | 'text' | 'error' | 'milestone';
  tool?: string;
  description: string;
  timestamp: string;
}

export interface SessionActivity {
  session_id: string;
  events: ActivityEvent[];
  line_count: number;
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType = 'review_ready' | 'context_low' | 'handoff_complete' | 'error' | 'waiting_input';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  created_at: string;
  session: {
    id: string;
    type: SessionType;
    status: SessionStatus;
  } | null;
  ticket: {
    id: string;
    external_id: string | null;
    title: string;
  } | null;
}

export interface NotificationsResponse {
  data: Notification[];
  count: number;
}

export interface NotificationCountResponse {
  count: number;
}

// ============================================================================
// Error Types
// ============================================================================

export interface ApiError {
  error: string;
  code?: string;
  details?: Record<string, string[]>;
}
