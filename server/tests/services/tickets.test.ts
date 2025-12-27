/**
 * Ticket Sync Service Tests
 *
 * Unit tests for ticket discovery, parsing, and sync functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractTicketId,
  extractTitle,
} from '../../src/services/tickets.js';

describe('Ticket Service', () => {
  describe('Unit Tests', () => {
    describe('extractTicketId', () => {
      it('should extract ID from standard ticket filename', () => {
        expect(extractTicketId('CSM-001-description.md')).toBe('CSM-001');
      });

      it('should extract ID from ticket with long number', () => {
        expect(extractTicketId('PROJ-12345-some-feature.md')).toBe('PROJ-12345');
      });

      it('should extract ID with various project prefixes', () => {
        expect(extractTicketId('ABC-001-test.md')).toBe('ABC-001');
        expect(extractTicketId('XY-99-feature.md')).toBe('XY-99');
        expect(extractTicketId('LONGPREFIX-1-task.md')).toBe('LONGPREFIX-1');
      });

      it('should return null for files without ticket ID pattern', () => {
        expect(extractTicketId('README.md')).toBeNull();
        expect(extractTicketId('some-document.md')).toBeNull();
        expect(extractTicketId('notes.md')).toBeNull();
      });

      it('should return null for lowercase prefixes', () => {
        expect(extractTicketId('csm-001-description.md')).toBeNull();
      });

      it('should return null for files with numbers but no dash', () => {
        expect(extractTicketId('CSM001-description.md')).toBeNull();
      });

      it('should handle filenames with only ID', () => {
        expect(extractTicketId('CSM-001.md')).toBe('CSM-001');
      });

      it('should extract ID when followed by multiple dashes', () => {
        expect(extractTicketId('CSM-001-some-long-description.md')).toBe('CSM-001');
      });
    });

    describe('extractTitle', () => {
      it('should extract title from H1 heading', () => {
        const content = '# My Ticket Title\n\nSome content here.';
        expect(extractTitle(content, 'CSM-001.md')).toBe('My Ticket Title');
      });

      it('should extract title from H1 with extra spaces', () => {
        const content = '#   Spaced Title   \n\nContent.';
        expect(extractTitle(content, 'CSM-001.md')).toBe('Spaced Title');
      });

      it('should use first H1 if multiple exist', () => {
        const content = '# First Title\n\n# Second Title\n\nContent.';
        expect(extractTitle(content, 'CSM-001.md')).toBe('First Title');
      });

      it('should fallback to filename when no H1 found', () => {
        const content = 'No heading here, just text.';
        expect(extractTitle(content, 'CSM-001-description.md')).toBe('CSM-001-description');
      });

      it('should fallback to filename for empty content', () => {
        expect(extractTitle('', 'CSM-002-feature.md')).toBe('CSM-002-feature');
      });

      it('should not match H2 or deeper headings', () => {
        const content = '## This is H2\n\n### This is H3';
        expect(extractTitle(content, 'CSM-003.md')).toBe('CSM-003');
      });

      it('should handle H1 not at the start of content', () => {
        const content = 'Some preamble text\n\n# Actual Title\n\nMore content.';
        expect(extractTitle(content, 'CSM-004.md')).toBe('Actual Title');
      });

      it('should handle Windows line endings', () => {
        const content = '# Windows Title\r\n\r\nContent.';
        expect(extractTitle(content, 'CSM-005.md')).toBe('Windows Title');
      });

      it('should handle special characters in title', () => {
        const content = '# CSM-001: Implement Feature (v2.0)\n\nContent.';
        expect(extractTitle(content, 'CSM-001.md')).toBe('CSM-001: Implement Feature (v2.0)');
      });
    });

    describe('Error Classes', () => {
      it('should create TicketNotFoundError with correct properties', async () => {
        const { TicketNotFoundError } = await import('../../src/services/tickets.js');

        const error = new TicketNotFoundError('123');

        expect(error.message).toBe('Ticket not found: 123');
        expect(error.code).toBe('TICKET_NOT_FOUND');
        expect(error.name).toBe('TicketNotFoundError');
      });

      it('should create ProjectNotFoundError with correct properties', async () => {
        const { ProjectNotFoundError } = await import('../../src/services/tickets.js');

        const error = new ProjectNotFoundError('456');

        expect(error.message).toBe('Project not found: 456');
        expect(error.code).toBe('PROJECT_NOT_FOUND');
        expect(error.name).toBe('ProjectNotFoundError');
      });

      it('should create TicketDirectoryNotFoundError with correct properties', async () => {
        const { TicketDirectoryNotFoundError } = await import('../../src/services/tickets.js');

        const error = new TicketDirectoryNotFoundError('/path/to/tickets');

        expect(error.message).toBe('Tickets directory not found: /path/to/tickets');
        expect(error.code).toBe('TICKETS_DIR_NOT_FOUND');
        expect(error.name).toBe('TicketDirectoryNotFoundError');
      });
    });
  });

  describe('Ticket Schemas', () => {
    describe('ticketStateEnum', () => {
      it('should accept valid states', async () => {
        const { ticketStateEnum } = await import('../../src/api/tickets-schemas.js');

        expect(ticketStateEnum.safeParse('backlog').success).toBe(true);
        expect(ticketStateEnum.safeParse('in_progress').success).toBe(true);
        expect(ticketStateEnum.safeParse('review').success).toBe(true);
        expect(ticketStateEnum.safeParse('done').success).toBe(true);
      });

      it('should reject invalid states', async () => {
        const { ticketStateEnum } = await import('../../src/api/tickets-schemas.js');

        expect(ticketStateEnum.safeParse('invalid').success).toBe(false);
        expect(ticketStateEnum.safeParse('pending').success).toBe(false);
        expect(ticketStateEnum.safeParse('').success).toBe(false);
      });
    });

    describe('listTicketsQuerySchema', () => {
      it('should provide defaults for empty query', async () => {
        const { listTicketsQuerySchema } = await import('../../src/api/tickets-schemas.js');

        const result = listTicketsQuerySchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.page).toBe(1);
          expect(result.data.limit).toBe(20);
          expect(result.data.sync).toBe(true);
          expect(result.data.state).toBeUndefined();
        }
      });

      it('should coerce string numbers', async () => {
        const { listTicketsQuerySchema } = await import('../../src/api/tickets-schemas.js');

        const result = listTicketsQuerySchema.safeParse({
          page: '2',
          limit: '50',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.page).toBe(2);
          expect(result.data.limit).toBe(50);
        }
      });

      it('should accept state filter', async () => {
        const { listTicketsQuerySchema } = await import('../../src/api/tickets-schemas.js');

        const result = listTicketsQuerySchema.safeParse({
          state: 'in_progress',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.state).toBe('in_progress');
        }
      });

      it('should coerce sync boolean from string', async () => {
        const { listTicketsQuerySchema } = await import('../../src/api/tickets-schemas.js');

        const resultTrue = listTicketsQuerySchema.safeParse({ sync: 'true' });
        const resultFalse = listTicketsQuerySchema.safeParse({ sync: 'false' });

        expect(resultTrue.success).toBe(true);
        expect(resultFalse.success).toBe(true);
        if (resultTrue.success) expect(resultTrue.data.sync).toBe(true);
        if (resultFalse.success) expect(resultFalse.data.sync).toBe(false);
      });

      it('should reject limit over 100', async () => {
        const { listTicketsQuerySchema } = await import('../../src/api/tickets-schemas.js');

        const result = listTicketsQuerySchema.safeParse({ limit: 101 });
        expect(result.success).toBe(false);
      });
    });

    describe('updateTicketSchema', () => {
      it('should validate state update', async () => {
        const { updateTicketSchema } = await import('../../src/api/tickets-schemas.js');

        const result = updateTicketSchema.safeParse({
          state: 'in_progress',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.state).toBe('in_progress');
        }
      });

      it('should allow empty update', async () => {
        const { updateTicketSchema } = await import('../../src/api/tickets-schemas.js');

        const result = updateTicketSchema.safeParse({});
        expect(result.success).toBe(true);
      });

      it('should reject invalid state', async () => {
        const { updateTicketSchema } = await import('../../src/api/tickets-schemas.js');

        const result = updateTicketSchema.safeParse({
          state: 'invalid_state',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('ticketIdParamSchema', () => {
      it('should validate valid UUID', async () => {
        const { ticketIdParamSchema } = await import('../../src/api/tickets-schemas.js');

        const result = ticketIdParamSchema.safeParse({
          id: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(true);
      });

      it('should reject invalid UUID', async () => {
        const { ticketIdParamSchema } = await import('../../src/api/tickets-schemas.js');

        const result = ticketIdParamSchema.safeParse({
          id: 'not-a-uuid',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('projectIdParamSchema', () => {
      it('should validate valid UUID', async () => {
        const { projectIdParamSchema } = await import('../../src/api/tickets-schemas.js');

        const result = projectIdParamSchema.safeParse({
          id: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(true);
      });

      it('should reject invalid UUID', async () => {
        const { projectIdParamSchema } = await import('../../src/api/tickets-schemas.js');

        const result = projectIdParamSchema.safeParse({
          id: 'invalid',
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Service Functions (with mocks)', () => {
    // Mock dependencies
    vi.mock('fs/promises', () => ({
      readdir: vi.fn(),
      readFile: vi.fn(),
      stat: vi.fn(),
    }));

    vi.mock('fs', () => ({
      existsSync: vi.fn(),
    }));

    vi.mock('../../src/config/db.js', () => ({
      prisma: {
        project: {
          findUnique: vi.fn(),
        },
        ticket: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
          count: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    }));

    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('discoverTicketFiles', () => {
      it('should return empty array for non-existent directory', async () => {
        const { existsSync } = await import('fs');
        const { discoverTicketFiles } = await import('../../src/services/tickets.js');

        vi.mocked(existsSync).mockReturnValue(false);

        const result = await discoverTicketFiles('/nonexistent', '/repo');
        expect(result).toEqual([]);
      });

      it('should discover markdown files with ticket IDs', async () => {
        const { existsSync } = await import('fs');
        const { readdir, readFile } = await import('fs/promises');
        const { discoverTicketFiles } = await import('../../src/services/tickets.js');

        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readdir).mockResolvedValue([
          { name: 'CSM-001-feature.md', isFile: () => true, isDirectory: () => false },
          { name: 'CSM-002-bugfix.md', isFile: () => true, isDirectory: () => false },
          { name: 'README.md', isFile: () => true, isDirectory: () => false },
        ] as any);
        vi.mocked(readFile).mockImplementation(async (path) => {
          if (String(path).includes('CSM-001')) return '# Feature Implementation\n\nContent.';
          if (String(path).includes('CSM-002')) return '# Bug Fix\n\nContent.';
          return '';
        });

        const result = await discoverTicketFiles('/repo/tickets', '/repo');

        expect(result).toHaveLength(2);
        expect(result[0].externalId).toBe('CSM-001');
        expect(result[0].title).toBe('Feature Implementation');
        expect(result[1].externalId).toBe('CSM-002');
        expect(result[1].title).toBe('Bug Fix');
      });
    });

    describe('listTickets', () => {
      it('should throw ProjectNotFoundError for invalid project', async () => {
        const { prisma } = await import('../../src/config/db.js');
        const { listTickets, ProjectNotFoundError } = await import('../../src/services/tickets.js');

        vi.mocked(prisma.project.findUnique).mockResolvedValue(null);

        await expect(listTickets('invalid-id', { page: 1, limit: 20 })).rejects.toThrow(
          ProjectNotFoundError
        );
      });
    });

    describe('getTicketById', () => {
      it('should throw TicketNotFoundError for invalid ticket', async () => {
        const { prisma } = await import('../../src/config/db.js');
        const { getTicketById, TicketNotFoundError } = await import('../../src/services/tickets.js');

        vi.mocked(prisma.ticket.findUnique).mockResolvedValue(null);

        await expect(getTicketById('invalid-id')).rejects.toThrow(TicketNotFoundError);
      });
    });

    describe('updateTicket', () => {
      it('should throw TicketNotFoundError for invalid ticket', async () => {
        const { prisma } = await import('../../src/config/db.js');
        const { updateTicket, TicketNotFoundError } = await import('../../src/services/tickets.js');

        vi.mocked(prisma.ticket.findUnique).mockResolvedValue(null);

        await expect(updateTicket('invalid-id', { state: 'in_progress' })).rejects.toThrow(
          TicketNotFoundError
        );
      });

      it('should set startedAt when moving to in_progress', async () => {
        const { prisma } = await import('../../src/config/db.js');
        const { updateTicket } = await import('../../src/services/tickets.js');

        const mockTicket = {
          id: 'ticket-1',
          projectId: 'project-1',
          externalId: 'CSM-001',
          title: 'Test',
          state: 'backlog' as const,
          filePath: 'tickets/CSM-001.md',
          startedAt: null,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket);
        vi.mocked(prisma.ticket.update).mockResolvedValue({
          ...mockTicket,
          state: 'in_progress' as const,
          startedAt: new Date(),
        });

        await updateTicket('ticket-1', { state: 'in_progress' });

        expect(prisma.ticket.update).toHaveBeenCalledWith({
          where: { id: 'ticket-1' },
          data: expect.objectContaining({
            state: 'in_progress',
            startedAt: expect.any(Date),
          }),
        });
      });

      it('should set completedAt when moving to done', async () => {
        const { prisma } = await import('../../src/config/db.js');
        const { updateTicket } = await import('../../src/services/tickets.js');

        const mockTicket = {
          id: 'ticket-1',
          projectId: 'project-1',
          externalId: 'CSM-001',
          title: 'Test',
          state: 'in_progress' as const,
          filePath: 'tickets/CSM-001.md',
          startedAt: new Date(),
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket);
        vi.mocked(prisma.ticket.update).mockResolvedValue({
          ...mockTicket,
          state: 'done' as const,
          completedAt: new Date(),
        });

        await updateTicket('ticket-1', { state: 'done' });

        expect(prisma.ticket.update).toHaveBeenCalledWith({
          where: { id: 'ticket-1' },
          data: expect.objectContaining({
            state: 'done',
            completedAt: expect.any(Date),
          }),
        });
      });
    });
  });
});
