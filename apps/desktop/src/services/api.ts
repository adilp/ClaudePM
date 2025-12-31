/**
 * API Client for Desktop App
 * Handles all API calls to the Claude PM backend
 */

import { load, type Store } from '@tauri-apps/plugin-store';
import type {
  Session,
  Project,
  ProjectDetail,
  CreateProjectData,
  UpdateProjectData,
  Ticket,
  TicketDetail,
  TicketState,
  AdhocTicketCreate,
  TransitionResult,
  StateHistoryEntry,
  StartTicketResponse,
  SyncTicketsResult,
  SyncSessionsResult,
  TmuxSession,
  TmuxSessionDetail,
  PaginatedResponse,
  Notification,
  NotificationCountResponse,
} from '../types/api';

const DEFAULT_API_URL = 'http://localhost:4847';
const STORE_FILE = '.settings.dat';

let storePromise: Promise<Store> | null = null;

async function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE);
  }
  return storePromise;
}

export async function getApiKey(): Promise<string | null> {
  const store = await getStore();
  const key = await store.get<string>('apiKey');
  return key ?? null;
}

export async function setApiKey(key: string): Promise<void> {
  const store = await getStore();
  await store.set('apiKey', key);
}

export async function getApiUrl(): Promise<string> {
  const store = await getStore();
  const url = await store.get<string>('apiUrl');
  return url ?? import.meta.env.VITE_API_URL ?? DEFAULT_API_URL;
}

export async function setApiUrl(url: string): Promise<void> {
  const store = await getStore();
  await store.set('apiUrl', url);
}

export async function getNotificationsEnabled(): Promise<boolean> {
  const store = await getStore();
  const enabled = await store.get<boolean>('notificationsEnabled');
  // Default to true if not set
  return enabled ?? true;
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  const store = await getStore();
  await store.set('notificationsEnabled', enabled);
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = await getApiUrl();
  const apiKey = await getApiKey();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new ApiError(error.error || error.message || 'Unknown error', response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ============================================================================
// Health
// ============================================================================

export async function checkHealth(): Promise<{ status: string }> {
  return request<{ status: string }>('/health');
}

// ============================================================================
// Projects
// ============================================================================

export async function getProjects(
  page = 1,
  limit = 50
): Promise<PaginatedResponse<Project>> {
  return request<PaginatedResponse<Project>>(
    `/api/projects?page=${page}&limit=${limit}`
  );
}

export async function getProject(id: string): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/api/projects/${id}`);
}

export async function createProject(data: CreateProjectData): Promise<Project> {
  return request<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProject(
  id: string,
  data: UpdateProjectData
): Promise<Project> {
  return request<Project>(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string): Promise<void> {
  return request<void>(`/api/projects/${id}`, { method: 'DELETE' });
}

// ============================================================================
// Tickets
// ============================================================================

export async function getTickets(projectId: string): Promise<Ticket[]> {
  const response = await request<{ data: Ticket[]; pagination: unknown }>(
    `/api/projects/${projectId}/tickets?limit=100`
  );
  return response.data;
}

export async function getTicket(
  _projectId: string,
  ticketId: string
): Promise<TicketDetail> {
  return request<TicketDetail>(`/api/tickets/${ticketId}`);
}

export async function syncTickets(projectId: string): Promise<SyncTicketsResult> {
  return request<SyncTicketsResult>(`/api/projects/${projectId}/sync-tickets`, {
    method: 'POST',
  });
}

export async function updateTicket(
  ticketId: string,
  data: { state: TicketState }
): Promise<Ticket> {
  return request<Ticket>(`/api/tickets/${ticketId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function createAdhocTicket(
  projectId: string,
  data: AdhocTicketCreate
): Promise<Ticket> {
  return request<Ticket>(`/api/projects/${projectId}/adhoc-tickets`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getTicketContent(
  ticketId: string
): Promise<{ content: string }> {
  return request<{ content: string }>(`/api/tickets/${ticketId}/content`);
}

export async function updateTicketContent(
  ticketId: string,
  content: string
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/tickets/${ticketId}/content`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export async function updateTicketTitle(
  ticketId: string,
  title: string
): Promise<Ticket> {
  return request<Ticket>(`/api/tickets/${ticketId}/title`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

export async function deleteTicket(ticketId: string): Promise<void> {
  return request<void>(`/api/tickets/${ticketId}`, { method: 'DELETE' });
}

export async function startTicket(ticketId: string): Promise<StartTicketResponse> {
  return request<StartTicketResponse>(`/api/tickets/${ticketId}/start`, {
    method: 'POST',
  });
}

export async function approveTicket(ticketId: string): Promise<TransitionResult> {
  return request<TransitionResult>(`/api/tickets/${ticketId}/approve`, {
    method: 'POST',
  });
}

export async function rejectTicket(
  ticketId: string,
  feedback: string
): Promise<TransitionResult> {
  return request<TransitionResult>(`/api/tickets/${ticketId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ feedback }),
  });
}

export async function getTicketHistory(
  ticketId: string
): Promise<StateHistoryEntry[]> {
  const response = await request<{ data: StateHistoryEntry[] }>(
    `/api/tickets/${ticketId}/history`
  );
  return response.data;
}

// ============================================================================
// Sessions
// ============================================================================

export async function getSessions(projectId?: string): Promise<Session[]> {
  const query = projectId ? `?project_id=${projectId}` : '';
  return request<Session[]>(`/api/sessions${query}`);
}

export async function getSession(sessionId: string): Promise<Session> {
  return request<Session>(`/api/sessions/${sessionId}`);
}

export async function startSession(data: {
  project_id: string;
  ticket_id?: string;
}): Promise<Session> {
  const { project_id, ticket_id } = data;
  const body = ticket_id ? { ticket_id } : {};
  return request<Session>(`/api/projects/${project_id}/sessions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function stopSession(sessionId: string): Promise<void> {
  return request<void>(`/api/sessions/${sessionId}/stop`, { method: 'POST' });
}

export async function syncSessions(projectId?: string): Promise<SyncSessionsResult> {
  const query = projectId ? `?project_id=${projectId}` : '';
  return request<SyncSessionsResult>(`/api/sessions/sync${query}`, {
    method: 'POST',
  });
}

export async function sendInput(sessionId: string, text: string): Promise<void> {
  return request<void>(`/api/sessions/${sessionId}/input`, {
    method: 'POST',
    body: JSON.stringify({ input: text }),
  });
}

// ============================================================================
// tmux Discovery
// ============================================================================

export async function getTmuxSessions(): Promise<TmuxSession[]> {
  return request<TmuxSession[]>('/api/tmux/sessions');
}

export async function getTmuxSessionDetail(name: string): Promise<TmuxSessionDetail> {
  return request<TmuxSessionDetail>(
    `/api/tmux/sessions/${encodeURIComponent(name)}`
  );
}

// ============================================================================
// Notifications
// ============================================================================

export async function getNotifications(): Promise<PaginatedResponse<Notification>> {
  return request<PaginatedResponse<Notification>>('/api/notifications');
}

export async function getNotificationCount(): Promise<NotificationCountResponse> {
  return request<NotificationCountResponse>('/api/notifications/count');
}

export async function dismissNotification(id: string): Promise<void> {
  return request<void>(`/api/notifications/${id}`, { method: 'DELETE' });
}

export async function dismissAllNotifications(): Promise<void> {
  return request<void>('/api/notifications', { method: 'DELETE' });
}

// ============================================================================
// Session Analysis (Claude SDK-powered)
// ============================================================================

import type {
  SessionSummary,
  ReviewReport,
  SessionActivity,
} from '../types/api';

export async function getSessionSummary(
  sessionId: string,
  regenerate = false
): Promise<SessionSummary> {
  const query = regenerate ? '?regenerate=true' : '';
  return request<SessionSummary>(`/api/sessions/${sessionId}/summary${query}`);
}

export async function getSessionReviewReport(
  sessionId: string,
  regenerate = false
): Promise<ReviewReport> {
  const query = regenerate ? '?regenerate=true' : '';
  return request<ReviewReport>(`/api/sessions/${sessionId}/review-report${query}`);
}

export async function getSessionActivity(
  sessionId: string,
  lines = 100
): Promise<SessionActivity> {
  return request<SessionActivity>(`/api/sessions/${sessionId}/activity?lines=${lines}`);
}

export async function generateCommitMessage(
  sessionId: string
): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/sessions/${sessionId}/commit-message`, {
    method: 'POST',
  });
}

export async function generatePrDescription(
  sessionId: string,
  baseBranch?: string
): Promise<{ title: string; body: string }> {
  const query = baseBranch ? `?base_branch=${baseBranch}` : '';
  return request<{ title: string; body: string }>(
    `/api/sessions/${sessionId}/pr-description${query}`,
    { method: 'POST' }
  );
}

// ============================================================================
// Git Operations
// ============================================================================

import type { DiffResult, GitStatus, BranchInfo } from '../types/api';

export async function getGitDiff(
  projectId: string,
  baseBranch?: string
): Promise<DiffResult> {
  const query = baseBranch ? `?base_branch=${baseBranch}` : '';
  return request<DiffResult>(`/api/projects/${projectId}/git/diff${query}`);
}

export async function getGitStatus(projectId: string): Promise<GitStatus> {
  return request<GitStatus>(`/api/projects/${projectId}/git/status`);
}

export async function getBranchInfo(projectId: string): Promise<BranchInfo> {
  return request<BranchInfo>(`/api/projects/${projectId}/git/branch`);
}
