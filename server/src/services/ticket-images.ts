/**
 * Ticket Images Service
 * Handles image storage for tickets with parallel directory structure
 */

import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '../config/db.js';

// ============================================================================
// Error Classes
// ============================================================================

export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageUploadError';
  }
}

export class TicketNotFoundError extends ImageUploadError {
  constructor(ticketId: string) {
    super(`Ticket not found: ${ticketId}`);
    this.name = 'TicketNotFoundError';
  }
}

export class InvalidImageError extends ImageUploadError {
  constructor(reason: string) {
    super(`Invalid image: ${reason}`);
    this.name = 'InvalidImageError';
  }
}

// ============================================================================
// Types
// ============================================================================

export interface UploadedImage {
  filename: string;
  relativePath: string;
  absolutePath: string;
  markdownRef: string;
}

// ============================================================================
// Constants
// ============================================================================

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const IMAGES_BASE_DIR = 'docs/images';

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get the subdirectory path for a ticket's images
 * Mirrors the ticket path structure: docs/jira-tickets/multi-tenancy/MT-001.md -> multi-tenancy/
 */
export function getTicketSubdir(ticketFilePath: string, ticketsPath: string): string {
  // Normalize paths (remove trailing slashes)
  const normalizedTicketsPath = ticketsPath.replace(/\/+$/, '');
  const ticketDir = path.dirname(ticketFilePath);

  // Get the relative path from tickets base to ticket directory
  if (ticketDir.startsWith(normalizedTicketsPath)) {
    return ticketDir.slice(normalizedTicketsPath.length).replace(/^\/+/, '');
  }

  // Fallback: just use the immediate parent directory name
  return path.basename(ticketDir);
}

/**
 * Get the base name of a ticket (filename without extension)
 */
export function getTicketBasename(ticketFilePath: string): string {
  const filename = path.basename(ticketFilePath);
  return filename.replace(/\.md$/i, '');
}

/**
 * Find the next available sequence number for a ticket's images
 */
export async function getNextSequenceNumber(absoluteImagesDir: string, ticketBasename: string): Promise<number> {
  try {
    const files = await fs.readdir(absoluteImagesDir);

    // Find all files matching pattern: ticketBasename_XX.ext
    const pattern = new RegExp(`^${escapeRegex(ticketBasename)}_(\\d+)\\.[^.]+$`, 'i');
    let maxSeq = 0;

    for (const file of files) {
      const match = file.match(pattern);
      if (match && match[1]) {
        const seq = parseInt(match[1], 10);
        if (seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }

    return maxSeq + 1;
  } catch (err) {
    // Directory doesn't exist yet, start at 1
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      return 1;
    }
    throw err;
  }
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate filename for an uploaded image
 */
export function generateImageFilename(ticketBasename: string, sequenceNumber: number, mimeType: string): string {
  const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
  const seq = sequenceNumber.toString().padStart(2, '0');
  return `${ticketBasename}_${seq}.${ext}`;
}

/**
 * Calculate relative path from ticket markdown file to image
 */
export function getRelativeImagePath(ticketFilePath: string, ticketsPath: string, imageFilename: string): string {
  const ticketDir = path.dirname(ticketFilePath);
  const subdir = getTicketSubdir(ticketFilePath, ticketsPath);
  const imageDir = path.join(IMAGES_BASE_DIR, subdir);

  // Calculate relative path from ticket directory to image directory
  const relativePath = path.relative(ticketDir, imageDir);
  return path.join(relativePath, imageFilename);
}

/**
 * Upload an image for a ticket
 */
export async function uploadTicketImage(
  ticketId: string,
  imageBuffer: Buffer,
  mimeType: string,
  _originalName?: string
): Promise<UploadedImage> {
  // 1. Validate mime type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new InvalidImageError(`Unsupported image type: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`);
  }

  // 2. Find the ticket with its project
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { project: true },
  });

  if (!ticket) {
    throw new TicketNotFoundError(ticketId);
  }

  // 3. Determine paths
  const ticketBasename = getTicketBasename(ticket.filePath);
  const subdir = getTicketSubdir(ticket.filePath, ticket.project.ticketsPath);
  const relativeImagesDir = path.join(IMAGES_BASE_DIR, subdir);
  const absoluteImagesDir = path.join(ticket.project.repoPath, relativeImagesDir);

  // 4. Get next sequence number
  const seqNum = await getNextSequenceNumber(absoluteImagesDir, ticketBasename);
  const filename = generateImageFilename(ticketBasename, seqNum, mimeType);

  const absoluteFilePath = path.join(absoluteImagesDir, filename);
  const relativeFilePath = path.join(relativeImagesDir, filename);

  // 5. Create directory if it doesn't exist
  await fs.mkdir(absoluteImagesDir, { recursive: true });

  // 6. Write the image file
  await fs.writeFile(absoluteFilePath, imageBuffer);

  // 7. Calculate relative path for markdown
  const markdownRelativePath = getRelativeImagePath(ticket.filePath, ticket.project.ticketsPath, filename);

  return {
    filename,
    relativePath: relativeFilePath,
    absolutePath: absoluteFilePath,
    markdownRef: `![${ticketBasename} image ${seqNum}](${markdownRelativePath})`,
  };
}

/**
 * Delete all images for a ticket
 */
export async function deleteTicketImages(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { project: true },
  });

  if (!ticket) {
    return; // Ticket already gone, nothing to clean up
  }

  const ticketBasename = getTicketBasename(ticket.filePath);
  const subdir = getTicketSubdir(ticket.filePath, ticket.project.ticketsPath);
  const absoluteImagesDir = path.join(ticket.project.repoPath, IMAGES_BASE_DIR, subdir);

  try {
    const files = await fs.readdir(absoluteImagesDir);
    const pattern = new RegExp(`^${escapeRegex(ticketBasename)}_\\d+\\.[^.]+$`, 'i');

    for (const file of files) {
      if (pattern.test(file)) {
        await fs.unlink(path.join(absoluteImagesDir, file));
      }
    }

    // Try to remove directory if empty
    const remaining = await fs.readdir(absoluteImagesDir);
    if (remaining.length === 0) {
      await fs.rmdir(absoluteImagesDir);
    }
  } catch (err) {
    // Ignore errors - directory might not exist
    const error = err as NodeJS.ErrnoException;
    if (error.code !== 'ENOENT') {
      console.warn('Failed to clean up ticket images:', err);
    }
  }
}

/**
 * Get absolute path to serve an image
 */
export async function getImagePath(
  projectId: string,
  subdir: string,
  filename: string
): Promise<string | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return null;
  }

  const absoluteFilePath = path.join(project.repoPath, IMAGES_BASE_DIR, subdir, filename);

  try {
    await fs.access(absoluteFilePath);
    return absoluteFilePath;
  } catch {
    return null;
  }
}

export const ticketImagesService = {
  uploadTicketImage,
  deleteTicketImages,
  getImagePath,
  getTicketSubdir,
  getTicketBasename,
  getNextSequenceNumber,
  generateImageFilename,
  getRelativeImagePath,
};
