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
  slug: string
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

  // 3. Generate the display ID
  const displayId = await generateAdhocDisplayId(projectId);

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

// Export service object for consistency with other services
export const adhocTicketsService = {
  createAdhocTicket,
  getTicketContent,
  updateTicketContent,
  generateAdhocDisplayId,
};
