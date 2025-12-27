/**
 * API Client
 * Centralized API client with React Query integration
 */

import type {
  Project,
  ProjectDetail,
  Ticket,
  TicketDetail,
  TransitionResult,
  StateHistoryEntry,
  Session,
  DiffResult,
  GitStatus,
  BranchInfo,
  TmuxSession,
  TmuxSessionDetail,
  PaginatedResponse,
  ApiError,
} from '@/types/api';

// ============================================================================
// Base Fetch Wrapper
// ============================================================================

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`,
      }));
      throw new ApiClientError(error.error, response.status, error);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Projects
  async getProjects(page = 1, limit = 20): Promise<PaginatedResponse<Project>> {
    return this.request(`/projects?page=${page}&limit=${limit}`);
  }

  async getProject(id: string): Promise<ProjectDetail> {
    return this.request(`/projects/${id}`);
  }

  async createProject(data: {
    name: string;
    repo_path: string;
    tmux_session: string;
    tmux_window?: string;
    tickets_path?: string;
    handoff_path?: string;
  }): Promise<Project> {
    return this.request('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProject(
    id: string,
    data: Partial<{
      name: string;
      tmux_session: string;
      tmux_window: string;
      tickets_path: string;
      handoff_path: string;
    }>
  ): Promise<Project> {
    return this.request(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string): Promise<void> {
    return this.request(`/projects/${id}`, { method: 'DELETE' });
  }

  // Tickets
  async getTickets(projectId: string): Promise<Ticket[]> {
    const response = await this.request<{ data: Ticket[]; pagination: unknown }>(`/projects/${projectId}/tickets`);
    return response.data;
  }

  async getTicket(projectId: string, ticketId: string): Promise<TicketDetail> {
    return this.request(`/projects/${projectId}/tickets/${ticketId}`);
  }

  async syncTickets(projectId: string): Promise<{ synced: number; created: number; updated: number }> {
    return this.request(`/projects/${projectId}/tickets/sync`, { method: 'POST' });
  }

  // Sessions
  async getSessions(projectId?: string): Promise<Session[]> {
    const query = projectId ? `?project_id=${projectId}` : '';
    return this.request(`/sessions${query}`);
  }

  async getSession(sessionId: string): Promise<Session> {
    return this.request(`/sessions/${sessionId}`);
  }

  async startSession(data: {
    project_id: string;
    ticket_id?: string;
  }): Promise<Session> {
    const { project_id, ticket_id } = data;
    const body = ticket_id ? { ticket_id } : {};
    return this.request(`/projects/${project_id}/sessions`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async stopSession(sessionId: string): Promise<void> {
    return this.request(`/sessions/${sessionId}/stop`, { method: 'POST' });
  }

  async sendInput(sessionId: string, text: string): Promise<void> {
    return this.request(`/sessions/${sessionId}/input`, {
      method: 'POST',
      body: JSON.stringify({ input: text }),
    });
  }

  // Git
  async getDiff(projectId: string, baseBranch?: string): Promise<DiffResult> {
    const query = baseBranch ? `?base_branch=${baseBranch}` : '';
    return this.request(`/projects/${projectId}/git/diff${query}`);
  }

  async getGitStatus(projectId: string): Promise<GitStatus> {
    return this.request(`/projects/${projectId}/git/status`);
  }

  async getBranchInfo(projectId: string): Promise<BranchInfo> {
    return this.request(`/projects/${projectId}/git/branch`);
  }

  // Ticket State Transitions
  async approveTicket(ticketId: string): Promise<TransitionResult> {
    return this.request(`/tickets/${ticketId}/approve`, { method: 'POST' });
  }

  async rejectTicket(ticketId: string, feedback: string): Promise<TransitionResult> {
    return this.request(`/tickets/${ticketId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ feedback }),
    });
  }

  async getTicketHistory(ticketId: string): Promise<StateHistoryEntry[]> {
    const response = await this.request<{ data: StateHistoryEntry[] }>(`/tickets/${ticketId}/history`);
    return response.data;
  }

  // tmux Discovery
  async getTmuxSessions(): Promise<TmuxSession[]> {
    return this.request('/tmux/sessions');
  }

  async getTmuxSessionDetail(name: string): Promise<TmuxSessionDetail> {
    return this.request(`/tmux/sessions/${encodeURIComponent(name)}`);
  }
}

// ============================================================================
// Error Class
// ============================================================================

export class ApiClientError extends Error {
  status: number;
  data: ApiError;

  constructor(message: string, status: number, data: ApiError) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.data = data;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const api = new ApiClient();
