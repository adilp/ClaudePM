import { existsSync } from 'fs';
import { prisma } from '../config/db.js';
import { sessionExists } from './tmux.js';
import type { Project, TicketState, SessionStatus } from '../generated/prisma/index.js';

// Error classes
export class ProjectError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'ProjectError';
  }
}

export class ProjectNotFoundError extends ProjectError {
  constructor(id: string) {
    super(`Project not found: ${id}`, 'PROJECT_NOT_FOUND');
    this.name = 'ProjectNotFoundError';
  }
}

export class ProjectValidationError extends ProjectError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ProjectValidationError';
  }
}

export class ProjectConflictError extends ProjectError {
  constructor(message: string) {
    super(message, 'CONFLICT');
    this.name = 'ProjectConflictError';
  }
}

// Types
export interface CreateProjectData {
  name: string;
  repoPath: string;
  tmuxSession: string;
  tmuxWindow?: string;
  ticketsPath?: string;
  handoffPath?: string;
}

export interface UpdateProjectData {
  name?: string;
  tmuxSession?: string;
  tmuxWindow?: string | null;
  ticketsPath?: string;
  handoffPath?: string;
}

export interface ProjectWithCounts extends Project {
  ticketCounts: {
    backlog: number;
    in_progress: number;
    review: number;
    done: number;
  };
  activeSession: {
    id: string;
    status: SessionStatus;
    contextPercent: number;
    startedAt: Date | null;
  } | null;
}

export interface ListProjectsOptions {
  page: number;
  limit: number;
}

export interface PaginatedProjects {
  projects: Project[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Service functions

/**
 * Validates that a repository path exists on the filesystem
 */
export function validateRepoPath(repoPath: string): void {
  if (!existsSync(repoPath)) {
    throw new ProjectValidationError(`Repository path does not exist: ${repoPath}`);
  }
}

/**
 * Validates that a tmux session exists
 */
export async function validateTmuxSession(sessionName: string): Promise<void> {
  const exists = await sessionExists(sessionName);
  if (!exists) {
    throw new ProjectValidationError(`tmux session does not exist: ${sessionName}`);
  }
}

/**
 * Create a new project
 */
export async function createProject(data: CreateProjectData): Promise<Project> {
  // Validate repo path exists
  validateRepoPath(data.repoPath);

  // Validate tmux session exists
  await validateTmuxSession(data.tmuxSession);

  // Check for duplicate repo path
  const existing = await prisma.project.findUnique({
    where: { repoPath: data.repoPath },
  });

  if (existing) {
    throw new ProjectConflictError(`A project already exists for repository: ${data.repoPath}`);
  }

  // Build create data, only including defined fields
  const createData: {
    name: string;
    repoPath: string;
    tmuxSession: string;
    tmuxWindow?: string;
    ticketsPath?: string;
    handoffPath?: string;
  } = {
    name: data.name,
    repoPath: data.repoPath,
    tmuxSession: data.tmuxSession,
  };

  if (data.tmuxWindow !== undefined) {
    createData.tmuxWindow = data.tmuxWindow;
  }
  if (data.ticketsPath !== undefined) {
    createData.ticketsPath = data.ticketsPath;
  }
  if (data.handoffPath !== undefined) {
    createData.handoffPath = data.handoffPath;
  }

  // Create the project
  const project = await prisma.project.create({
    data: createData,
  });

  return project;
}

/**
 * List all projects with pagination
 */
export async function listProjects(options: ListProjectsOptions): Promise<PaginatedProjects> {
  const { page, limit } = options;
  const skip = (page - 1) * limit;

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.project.count(),
  ]);

  return {
    projects,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get a project by ID with ticket counts and active session
 */
export async function getProjectById(id: string): Promise<ProjectWithCounts> {
  const project = await prisma.project.findUnique({
    where: { id },
  });

  if (!project) {
    throw new ProjectNotFoundError(id);
  }

  // Get ticket counts by state
  const ticketCounts = await prisma.ticket.groupBy({
    by: ['state'],
    where: { projectId: id },
    _count: { state: true },
  });

  // Convert to object format
  const counts: Record<TicketState, number> = {
    backlog: 0,
    in_progress: 0,
    review: 0,
    done: 0,
  };

  for (const row of ticketCounts) {
    counts[row.state] = row._count.state;
  }

  // Get active session (running or paused)
  const activeSession = await prisma.session.findFirst({
    where: {
      projectId: id,
      status: { in: ['running', 'paused'] },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      contextPercent: true,
      startedAt: true,
    },
  });

  return {
    ...project,
    ticketCounts: counts,
    activeSession,
  };
}

/**
 * Update a project
 */
export async function updateProject(id: string, data: UpdateProjectData): Promise<Project> {
  // Check project exists
  const existing = await prisma.project.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new ProjectNotFoundError(id);
  }

  // Validate tmux session if being updated
  if (data.tmuxSession) {
    await validateTmuxSession(data.tmuxSession);
  }

  // Build update data, only including defined fields
  const updateData: {
    name?: string;
    tmuxSession?: string;
    tmuxWindow?: string | null;
    ticketsPath?: string;
    handoffPath?: string;
  } = {};

  if (data.name !== undefined) {
    updateData.name = data.name;
  }
  if (data.tmuxSession !== undefined) {
    updateData.tmuxSession = data.tmuxSession;
  }
  if (data.tmuxWindow !== undefined) {
    updateData.tmuxWindow = data.tmuxWindow;
  }
  if (data.ticketsPath !== undefined) {
    updateData.ticketsPath = data.ticketsPath;
  }
  if (data.handoffPath !== undefined) {
    updateData.handoffPath = data.handoffPath;
  }

  // Update the project
  const project = await prisma.project.update({
    where: { id },
    data: updateData,
  });

  return project;
}

/**
 * Delete a project and stop any active sessions
 */
export async function deleteProject(id: string): Promise<void> {
  // Check project exists
  const existing = await prisma.project.findUnique({
    where: { id },
    include: {
      sessions: {
        where: { status: { in: ['running', 'paused'] } },
      },
    },
  });

  if (!existing) {
    throw new ProjectNotFoundError(id);
  }

  // Mark any active sessions as completed
  // (In future, this would also kill the tmux panes)
  if (existing.sessions.length > 0) {
    await prisma.session.updateMany({
      where: {
        projectId: id,
        status: { in: ['running', 'paused'] },
      },
      data: {
        status: 'completed',
        endedAt: new Date(),
      },
    });
  }

  // Delete the project (cascades to related data)
  await prisma.project.delete({
    where: { id },
  });
}
