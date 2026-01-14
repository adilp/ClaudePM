/**
 * API Types for Desktop App
 * Types matching the server API responses and web app conventions
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

export interface CreateProjectData {
  name: string;
  repo_path: string;
  tmux_session: string;
  tmux_window?: string;
  tickets_path?: string;
  handoff_path?: string;
}

export interface UpdateProjectData {
  name?: string;
  tmux_session?: string;
  tmux_window?: string;
  tickets_path?: string;
  handoff_path?: string;
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
  prefix: string; // Computed by server: "CSM", "DWP", "ADHOC", etc.
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

export interface AdhocTicketCreate {
  title: string;
  slug: string;
  isExplore?: boolean;
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

export interface SyncTicketsResult {
  message: string;
  result: {
    created: number;
    updated: number;
    deleted: number;
    errors: string[];
  };
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
// Session Analysis Types
// ============================================================================

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
// Session Types
// ============================================================================

export type SessionStatus = 'running' | 'paused' | 'completed' | 'error';
export type SessionType = 'ticket' | 'adhoc';
export type SessionSource = 'api' | 'discovered';

export interface Session {
  id: string;
  project_id: string;
  ticket_id: string | null;
  type: SessionType;
  status: SessionStatus;
  source: SessionSource;
  context_percent: number | null;
  pane_id: string;
  pane_name: string | null;
  pane_command: string | null;
  pane_cwd: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
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

// ============================================================================
// WebSocket Message Types (aligned with web app)
// ============================================================================

export interface WebSocketMessage {
  type: string;
  payload: unknown;
}

/** Session status changed (running → completed, etc) */
export interface SessionStatusMessage {
  type: 'session:status';
  payload: {
    sessionId: string;
    previousStatus: string;
    newStatus: SessionStatus;
    timestamp: string;
    error?: string;
  };
}

/** Session waiting for user input */
export interface SessionWaitingMessage {
  type: 'session:waiting';
  payload: {
    sessionId: string;
    waiting: boolean;
    reason?: string;
    detectedBy?: string;
    timestamp: string;
  };
}

/** Legacy status payload format (for backwards compatibility) */
export interface SessionStatusPayload {
  session_id: string;
  status: SessionStatus;
  context_percent?: number;
}

/** AI analysis status message */
export type AiAnalysisType = 'review_report';
export type AiAnalysisStatus = 'generating' | 'complete' | 'error';

export interface AiAnalysisStatusMessage {
  type: 'ai:analysis_status';
  payload: {
    sessionId: string;
    analysisType: AiAnalysisType;
    status: AiAnalysisStatus;
    timestamp: string;
    error?: string;
  };
}

/** WebSocket notification message (broadcasted when notifications are created/updated) */
export interface NotificationWsMessage {
  type: 'notification';
  payload: {
    id: string;
    title: string;
    body: string;
    timestamp: string;
  };
}

/** Ticket state transition trigger */
export type TicketTransitionTrigger = 'auto' | 'manual';

/** Ticket state transition reason */
export type TicketTransitionReason =
  | 'session_started'
  | 'completion_detected'
  | 'user_approved'
  | 'user_rejected'
  | 'user_updated';

/** WebSocket ticket state change message (broadcasted when ticket state changes) */
export interface TicketStateMessage {
  type: 'ticket:state';
  payload: {
    ticketId: string;
    previousState: TicketState;
    newState: TicketState;
    trigger: TicketTransitionTrigger;
    reason: TicketTransitionReason;
    timestamp: string;
    feedback?: string;
    triggeredBy?: string;
  };
}

/** Review result types */
export type ReviewDecision = 'complete' | 'not_complete' | 'needs_clarification';
export type ReviewTrigger = 'stop_hook' | 'idle_timeout' | 'completion_signal' | 'manual';

export interface ReviewResultMessage {
  type: 'review:result';
  payload: {
    sessionId: string;
    ticketId: string;
    trigger: ReviewTrigger;
    decision: ReviewDecision;
    reasoning: string;
    timestamp: string;
  };
}

export interface ReviewResultEntry {
  id: string;
  session_id: string;
  trigger: ReviewTrigger;
  decision: ReviewDecision;
  reasoning: string;
  created_at: string;
  session_status?: SessionStatus;
}

export interface ReviewHistoryResponse {
  ticketId: string;
  results: ReviewResultEntry[];
}

export interface TriggerReviewResponse {
  session_id: string;
  ticket_id: string;
  trigger: ReviewTrigger;
  decision: ReviewDecision;
  reasoning: string;
  timestamp: string;
}

/** Union of all incoming WebSocket message types */
export type IncomingMessage =
  | SessionStatusMessage
  | SessionWaitingMessage
  | AiAnalysisStatusMessage
  | NotificationWsMessage
  | TicketStateMessage
  | ReviewResultMessage
  | WebSocketMessage;

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType =
  | 'waiting_input'
  | 'review_ready'
  | 'handoff_complete'
  | 'error'
  | 'context_low';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  session_id: string | null;
  ticket_id: string | null;
  created_at: string;
  session?: {
    id: string;
    status: SessionStatus;
  } | null;
  ticket?: {
    id: string;
    external_id: string | null;
    title: string;
  } | null;
}

export interface NotificationCountResponse {
  count: number;
}
