import { readdir, readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative, basename } from 'path';
import { prisma } from '../config/db.js';
import type { Ticket, TicketState } from '../generated/prisma/index.js';

// Error classes

export class TicketError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'TicketError';
  }
}

export class TicketNotFoundError extends TicketError {
  constructor(id: string) {
    super(`Ticket not found: ${id}`, 'TICKET_NOT_FOUND');
    this.name = 'TicketNotFoundError';
  }
}

export class ProjectNotFoundError extends TicketError {
  constructor(id: string) {
    super(`Project not found: ${id}`, 'PROJECT_NOT_FOUND');
    this.name = 'ProjectNotFoundError';
  }
}

export class TicketDirectoryNotFoundError extends TicketError {
  constructor(path: string) {
    super(`Tickets directory not found: ${path}`, 'TICKETS_DIR_NOT_FOUND');
    this.name = 'TicketDirectoryNotFoundError';
  }
}

// Types

export interface DiscoveredTicket {
  externalId: string;
  title: string;
  filePath: string; // Relative path from repo root
  absolutePath: string;
}

export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

export interface TicketWithContent extends Ticket {
  content: string;
}

export interface ListTicketsOptions {
  page: number;
  limit: number;
  state?: TicketState | undefined;
}

export interface PaginatedTickets {
  tickets: Ticket[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UpdateTicketData {
  state?: TicketState | undefined;
}

// Utility functions

/**
 * Extract ticket ID from filename
 * Pattern: CSM-001-description.md -> CSM-001
 */
export function extractTicketId(filename: string): string | null {
  const match = filename.match(/^([A-Z]+-\d+)/);
  return match && match[1] ? match[1] : null;
}

/**
 * Extract title from markdown content (first H1 heading)
 * Falls back to filename without extension if no H1 found
 */
export function extractTitle(content: string, filename: string): string {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch && titleMatch[1]) {
    return titleMatch[1].trim();
  }
  // Fallback: use filename without extension
  return filename.replace(/\.md$/, '');
}

/**
 * Recursively discover all markdown files in a directory
 */
export async function discoverTicketFiles(
  baseDir: string,
  repoPath: string
): Promise<DiscoveredTicket[]> {
  const tickets: DiscoveredTicket[] = [];

  if (!existsSync(baseDir)) {
    return tickets;
  }

  async function scanDirectory(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        await scanDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const externalId = extractTicketId(entry.name);
        if (externalId) {
          try {
            const content = await readFile(fullPath, 'utf-8');
            const title = extractTitle(content, entry.name);
            const relativePath = relative(repoPath, fullPath);

            tickets.push({
              externalId,
              title,
              filePath: relativePath,
              absolutePath: fullPath,
            });
          } catch (err) {
            // Log error but continue processing other files
            console.error(`Error reading ticket file ${fullPath}:`, err);
          }
        }
      }
    }
  }

  await scanDirectory(baseDir);
  return tickets;
}

// Service functions

/**
 * Sync tickets from filesystem to database for a project
 */
export async function syncTicketsFromFilesystem(projectId: string): Promise<SyncResult> {
  const result: SyncResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    errors: [],
  };

  // Get project with tickets path
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }

  const ticketsDir = join(project.repoPath, project.ticketsPath);

  // Handle missing tickets directory gracefully
  if (!existsSync(ticketsDir)) {
    result.errors.push(`Tickets directory not found: ${ticketsDir}`);
    return result;
  }

  // Discover all ticket files
  let discoveredTickets: DiscoveredTicket[];
  try {
    discoveredTickets = await discoverTicketFiles(ticketsDir, project.repoPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(`Failed to scan tickets directory: ${message}`);
    return result;
  }

  // Get existing tickets from database
  const existingTickets = await prisma.ticket.findMany({
    where: { projectId },
  });

  const existingByExternalId = new Map(
    existingTickets.map((t) => [t.externalId, t])
  );

  const discoveredExternalIds = new Set(discoveredTickets.map((t) => t.externalId));

  // Create or update tickets
  for (const discovered of discoveredTickets) {
    try {
      const existing = existingByExternalId.get(discovered.externalId);

      if (existing) {
        // Update if title or file path changed
        if (existing.title !== discovered.title || existing.filePath !== discovered.filePath) {
          await prisma.ticket.update({
            where: { id: existing.id },
            data: {
              title: discovered.title,
              filePath: discovered.filePath,
            },
          });
          result.updated++;
        }
      } else {
        // Create new ticket
        await prisma.ticket.create({
          data: {
            projectId,
            externalId: discovered.externalId,
            title: discovered.title,
            filePath: discovered.filePath,
            state: 'backlog',
          },
        });
        result.created++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Error processing ${discovered.externalId}: ${message}`);
    }
  }

  // Soft delete tickets that no longer exist in filesystem
  // We mark them by prefixing the externalId with "DELETED:"
  // Skip adhoc tickets - they are managed separately
  for (const existing of existingTickets) {
    // Skip adhoc tickets, tickets without externalId, or already deleted
    if (existing.isAdhoc || !existing.externalId || existing.externalId.startsWith('DELETED:')) {
      continue;
    }

    if (!discoveredExternalIds.has(existing.externalId)) {
      try {
        await prisma.ticket.update({
          where: { id: existing.id },
          data: {
            externalId: `DELETED:${existing.externalId}`,
          },
        });
        result.deleted++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`Error deleting ${existing.externalId}: ${message}`);
      }
    }
  }

  return result;
}

/**
 * List tickets for a project with optional sync and filtering
 */
export async function listTickets(
  projectId: string,
  options: ListTicketsOptions,
  shouldSync: boolean = true
): Promise<PaginatedTickets> {
  // Verify project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }

  // Optionally sync from filesystem first
  if (shouldSync) {
    await syncTicketsFromFilesystem(projectId);
  }

  const { page, limit, state } = options;
  const skip = (page - 1) * limit;

  // Build where clause - exclude soft-deleted tickets but include adhoc (null externalId)
  const where: {
    projectId: string;
    state?: TicketState;
    OR?: Array<{ externalId: null } | { externalId: { not: { startsWith: string } } }>;
  } = {
    projectId,
    OR: [
      { externalId: null }, // Include adhoc tickets
      { externalId: { not: { startsWith: 'DELETED:' } } }, // Include non-deleted regular tickets
    ],
  };

  if (state) {
    where.state = state;
  }

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      skip,
      take: limit,
      orderBy: { externalId: 'asc' },
    }),
    prisma.ticket.count({ where }),
  ]);

  return {
    tickets,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get a single ticket by ID with its content
 */
export async function getTicketById(ticketId: string): Promise<TicketWithContent> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { project: true },
  });

  if (!ticket) {
    throw new TicketNotFoundError(ticketId);
  }

  // Read content from file
  const absolutePath = join(ticket.project.repoPath, ticket.filePath);
  let content = '';

  if (existsSync(absolutePath)) {
    try {
      content = await readFile(absolutePath, 'utf-8');
    } catch (err) {
      console.error(`Error reading ticket file ${absolutePath}:`, err);
      content = `[Error reading file: ${err instanceof Error ? err.message : String(err)}]`;
    }
  } else {
    content = '[File not found]';
  }

  return {
    ...ticket,
    content,
  };
}

/**
 * Force re-sync a single ticket from its file
 */
export async function syncSingleTicket(ticketId: string): Promise<Ticket> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { project: true },
  });

  if (!ticket) {
    throw new TicketNotFoundError(ticketId);
  }

  const absolutePath = join(ticket.project.repoPath, ticket.filePath);

  if (!existsSync(absolutePath)) {
    // File no longer exists, mark as deleted
    return prisma.ticket.update({
      where: { id: ticketId },
      data: {
        externalId: `DELETED:${ticket.externalId}`,
      },
    });
  }

  // Re-read the file and update title
  const content = await readFile(absolutePath, 'utf-8');
  const title = extractTitle(content, basename(ticket.filePath));

  return prisma.ticket.update({
    where: { id: ticketId },
    data: { title },
  });
}

/**
 * Update ticket state
 */
export async function updateTicket(ticketId: string, data: UpdateTicketData): Promise<Ticket> {
  const existing = await prisma.ticket.findUnique({
    where: { id: ticketId },
  });

  if (!existing) {
    throw new TicketNotFoundError(ticketId);
  }

  const updateData: {
    state?: TicketState;
    startedAt?: Date | null;
    completedAt?: Date | null;
  } = {};

  if (data.state !== undefined) {
    updateData.state = data.state;

    // Track state transitions
    if (data.state === 'in_progress' && existing.state === 'backlog') {
      updateData.startedAt = new Date();
    }

    if (data.state === 'done' && existing.state !== 'done') {
      updateData.completedAt = new Date();
    }

    // Clear completedAt if moving back from done
    if (existing.state === 'done' && data.state !== 'done') {
      updateData.completedAt = null;
    }
  }

  return prisma.ticket.update({
    where: { id: ticketId },
    data: updateData,
  });
}
