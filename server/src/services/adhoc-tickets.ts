/**
 * Adhoc Tickets Service
 * Business logic for creating and managing adhoc tickets with file-based content
 */

import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '../config/db.js';
import type { Ticket } from '../generated/prisma/index.js';

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base error class for adhoc ticket operations
 */
export class AdhocTicketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdhocTicketError';
  }
}

/**
 * Error when a slug already exists for the project
 */
export class SlugExistsError extends AdhocTicketError {
  constructor(slug: string, projectId: string) {
    super(`Adhoc ticket with slug '${slug}' already exists in project ${projectId}`);
    this.name = 'SlugExistsError';
  }
}

/**
 * Error when project is not found
 */
export class ProjectNotFoundError extends AdhocTicketError {
  constructor(projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = 'ProjectNotFoundError';
  }
}

/**
 * Error when ticket is not found
 */
export class TicketNotFoundError extends AdhocTicketError {
  constructor(ticketId: string) {
    super(`Ticket not found: ${ticketId}`);
    this.name = 'TicketNotFoundError';
  }
}

/**
 * Error during file operations
 */
export class FileOperationError extends AdhocTicketError {
  constructor(operation: string, filePath: string, cause?: Error) {
    super(`Failed to ${operation} file: ${filePath}${cause ? ` - ${cause.message}` : ''}`);
    this.name = 'FileOperationError';
  }
}

/**
 * Error when ticket cannot be deleted (e.g., has running session)
 */
export class TicketCannotBeDeletedError extends AdhocTicketError {
  constructor(ticketId: string, reason: string) {
    super(`Cannot delete ticket ${ticketId}: ${reason}`);
    this.name = 'TicketCannotBeDeletedError';
  }
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Generate the stub template for a new adhoc ticket
 */
function generateStubContent(title: string): string {
  const date = new Date().toISOString().split('T')[0];
  return `# ${title}

## Description

<your idea here>

## Notes

- Created: ${date}
`;
}

/**
 * Generate a display ID for an adhoc ticket (ADHOC-XXX)
 * Based on count of existing adhoc tickets in the project
 */
export async function generateAdhocDisplayId(projectId: string): Promise<string> {
  const count = await prisma.ticket.count({
    where: {
      projectId,
      isAdhoc: true,
    },
  });

  // Format: ADHOC-001, ADHOC-002, etc.
  const number = (count + 1).toString().padStart(3, '0');
  return `ADHOC-${number}`;
}

/**
 * Create a new adhoc ticket
 * - Creates the markdown file in docs/adhoc/<slug>.md
 * - Creates the Ticket record with isAdhoc=true
 */
export async function createAdhocTicket(
  projectId: string,
  title: string,
  slug: string,
  isExplore: boolean = false
): Promise<Ticket> {
  // 1. Find the project
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }

  // 2. Check if slug already exists for this project
  const existingTicket = await prisma.ticket.findFirst({
    where: {
      projectId,
      filePath: `docs/jira-tickets/adhoc/${slug}.md`,
      isAdhoc: true,
    },
  });

  if (existingTicket) {
    throw new SlugExistsError(slug, projectId);
  }

  // 3. Generate the display ID (for future use)
  await generateAdhocDisplayId(projectId);

  // 4. Determine file path (relative to repo)
  const adhocDir = 'docs/jira-tickets/adhoc';
  const relativeFilePath = `${adhocDir}/${slug}.md`;
  const absoluteDir = path.join(project.repoPath, adhocDir);
  const absoluteFilePath = path.join(project.repoPath, relativeFilePath);

  // 5. Create the directory if it doesn't exist
  try {
    await fs.mkdir(absoluteDir, { recursive: true });
  } catch (err) {
    throw new FileOperationError('create directory', absoluteDir, err as Error);
  }

  // 6. Create the file with stub content
  const content = generateStubContent(title);
  try {
    // Use 'wx' flag to fail if file already exists
    await fs.writeFile(absoluteFilePath, content, { flag: 'wx' });
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === 'EEXIST') {
      throw new SlugExistsError(slug, projectId);
    }
    throw new FileOperationError('write', absoluteFilePath, error);
  }

  // 7. Create the ticket record (externalId is null for adhoc tickets)
  try {
    const ticket = await prisma.ticket.create({
      data: {
        projectId,
        // externalId is null for adhoc tickets - display ID is derived in UI
        title,
        filePath: relativeFilePath,
        isAdhoc: true,
        isExplore,
        state: 'backlog',
      },
    });

    return ticket;
  } catch (err) {
    // Clean up the file if database insert fails
    try {
      await fs.unlink(absoluteFilePath);
    } catch {
      // Ignore cleanup errors
    }
    throw new AdhocTicketError(`Failed to create ticket record: ${(err as Error).message}`);
  }
}

/**
 * Get the content of a ticket's markdown file
 */
export async function getTicketContent(ticketId: string): Promise<{ ticket: Ticket; content: string }> {
  // 1. Find the ticket with its project
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { project: true },
  });

  if (!ticket) {
    throw new TicketNotFoundError(ticketId);
  }

  // 2. Build absolute file path
  const absoluteFilePath = path.join(ticket.project.repoPath, ticket.filePath);

  // 3. Read the file
  try {
    const content = await fs.readFile(absoluteFilePath, 'utf-8');
    return { ticket, content };
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === 'ENOENT') {
      throw new FileOperationError('read (file not found)', absoluteFilePath);
    }
    throw new FileOperationError('read', absoluteFilePath, error);
  }
}

/**
 * Update the content of a ticket's markdown file
 */
export async function updateTicketContent(ticketId: string, content: string): Promise<Ticket> {
  // 1. Find the ticket with its project
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { project: true },
  });

  if (!ticket) {
    throw new TicketNotFoundError(ticketId);
  }

  // 2. Build absolute file path
  const absoluteFilePath = path.join(ticket.project.repoPath, ticket.filePath);

  // 3. Write the content
  try {
    await fs.writeFile(absoluteFilePath, content, 'utf-8');
  } catch (err) {
    throw new FileOperationError('write', absoluteFilePath, err as Error);
  }

  // 4. Update the ticket's updatedAt timestamp
  const updatedTicket = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      updatedAt: new Date(),
    },
  });

  return updatedTicket;
}

/**
 * Delete a ticket (removes both database record and file)
 * Will fail if ticket has a running session
 */
export async function deleteTicket(ticketId: string): Promise<void> {
  // 1. Find the ticket with its project and check for running sessions
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      project: true,
      sessions: {
        where: { status: 'running' },
        take: 1,
      },
    },
  });

  if (!ticket) {
    throw new TicketNotFoundError(ticketId);
  }

  // 2. Check if ticket has a running session
  if (ticket.sessions.length > 0) {
    throw new TicketCannotBeDeletedError(ticketId, 'ticket has a running session');
  }

  // 3. Build absolute file path
  const absoluteFilePath = path.join(ticket.project.repoPath, ticket.filePath);

  // 4. Delete the file (if it exists)
  try {
    await fs.unlink(absoluteFilePath);
  } catch (err) {
    const error = err as Error & { code?: string };
    // Only throw if error is not "file not found"
    if (error.code !== 'ENOENT') {
      throw new FileOperationError('delete', absoluteFilePath, error);
    }
  }

  // 5. Delete related records first (state history, sessions)
  await prisma.ticketStateHistory.deleteMany({
    where: { ticketId },
  });

  await prisma.session.deleteMany({
    where: { ticketId },
  });

  // 6. Delete the ticket record
  await prisma.ticket.delete({
    where: { id: ticketId },
  });
}

/**
 * Generate a slug from a title
 * Converts to lowercase, replaces spaces/special chars with hyphens
 */
function generateSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .slice(0, 50); // Limit to 50 chars
}

/**
 * Update the title of an adhoc ticket
 * - Updates the database record
 * - Renames the file to match the new slug
 * - Updates the H1 heading in the markdown content
 */
export async function updateTicketTitle(
  ticketId: string,
  newTitle: string
): Promise<Ticket> {
  // 1. Find the ticket with its project
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { project: true },
  });

  if (!ticket) {
    throw new TicketNotFoundError(ticketId);
  }

  // Only allow title updates for adhoc tickets (regular tickets get title from file)
  if (!ticket.isAdhoc) {
    throw new AdhocTicketError('Cannot update title of non-adhoc tickets. Edit the markdown file directly.');
  }

  // 2. Generate new slug from title
  const newSlug = generateSlugFromTitle(newTitle);
  if (newSlug.length < 3) {
    throw new AdhocTicketError('Title must generate a slug with at least 3 characters');
  }

  // 3. Build file paths
  const oldAbsolutePath = path.join(ticket.project.repoPath, ticket.filePath);
  const adhocDir = path.dirname(ticket.filePath);
  const newRelativePath = `${adhocDir}/${newSlug}.md`;
  const newAbsolutePath = path.join(ticket.project.repoPath, newRelativePath);

  // 4. Check if new path already exists (and it's not the same file)
  if (oldAbsolutePath !== newAbsolutePath) {
    try {
      await fs.access(newAbsolutePath);
      // File exists - check if it's a different ticket
      const existingTicket = await prisma.ticket.findFirst({
        where: {
          projectId: ticket.projectId,
          filePath: newRelativePath,
          id: { not: ticketId },
        },
      });
      if (existingTicket) {
        throw new SlugExistsError(newSlug, ticket.projectId);
      }
    } catch (err) {
      const error = err as Error & { code?: string };
      // ENOENT means file doesn't exist - that's fine
      if (error.code !== 'ENOENT' && !(err instanceof SlugExistsError)) {
        throw new FileOperationError('access', newAbsolutePath, error);
      }
      if (err instanceof SlugExistsError) {
        throw err;
      }
    }
  }

  // 5. Read current content and update the title heading
  let content: string;
  try {
    content = await fs.readFile(oldAbsolutePath, 'utf-8');
  } catch (err) {
    throw new FileOperationError('read', oldAbsolutePath, err as Error);
  }

  // Update the H1 heading if it exists
  const updatedContent = content.replace(/^#\s+.+$/m, `# ${newTitle}`);

  // 6. Write the updated content to the new file path
  try {
    await fs.writeFile(newAbsolutePath, updatedContent, 'utf-8');
  } catch (err) {
    throw new FileOperationError('write', newAbsolutePath, err as Error);
  }

  // 7. Delete the old file if the path changed
  if (oldAbsolutePath !== newAbsolutePath) {
    try {
      await fs.unlink(oldAbsolutePath);
    } catch (err) {
      // Log but don't fail - the new file is already written
      console.warn(`Failed to delete old file ${oldAbsolutePath}:`, err);
    }
  }

  // 8. Update the database record
  const updatedTicket = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      title: newTitle,
      filePath: newRelativePath,
      updatedAt: new Date(),
    },
  });

  return updatedTicket;
}

// Export service object for consistency with other services
export const adhocTicketsService = {
  createAdhocTicket,
  getTicketContent,
  updateTicketContent,
  generateAdhocDisplayId,
  deleteTicket,
  updateTicketTitle,
};
