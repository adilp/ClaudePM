import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createProjectSchema,
  updateProjectSchema,
  listProjectsQuerySchema,
  projectIdSchema,
} from '../../src/api/projects-schemas.js';

describe('Project Schemas', () => {
  describe('createProjectSchema', () => {
    it('should validate a complete project creation request', () => {
      const input = {
        name: 'My Project',
        repo_path: '/path/to/repo',
        tmux_session: 'my-session',
        tmux_window: 'main',
        tickets_path: 'docs/tickets/',
        handoff_path: 'docs/handoff.md',
      };

      const result = createProjectSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('My Project');
        expect(result.data.repo_path).toBe('/path/to/repo');
        expect(result.data.tmux_session).toBe('my-session');
        expect(result.data.tmux_window).toBe('main');
      }
    });

    it('should validate with only required fields', () => {
      const input = {
        name: 'My Project',
        repo_path: '/path/to/repo',
        tmux_session: 'my-session',
      };

      const result = createProjectSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tmux_window).toBeUndefined();
        expect(result.data.tickets_path).toBeUndefined();
      }
    });

    it('should reject empty name', () => {
      const input = {
        name: '',
        repo_path: '/path/to/repo',
        tmux_session: 'my-session',
      };

      const result = createProjectSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing repo_path', () => {
      const input = {
        name: 'My Project',
        tmux_session: 'my-session',
      };

      const result = createProjectSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing tmux_session', () => {
      const input = {
        name: 'My Project',
        repo_path: '/path/to/repo',
      };

      const result = createProjectSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject name exceeding max length', () => {
      const input = {
        name: 'a'.repeat(256),
        repo_path: '/path/to/repo',
        tmux_session: 'my-session',
      };

      const result = createProjectSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('updateProjectSchema', () => {
    it('should validate partial updates', () => {
      const input = {
        name: 'Updated Name',
      };

      const result = updateProjectSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated Name');
        expect(result.data.tmux_session).toBeUndefined();
      }
    });

    it('should validate empty update (no changes)', () => {
      const input = {};

      const result = updateProjectSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should allow null tmux_window', () => {
      const input = {
        tmux_window: null,
      };

      const result = updateProjectSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tmux_window).toBeNull();
      }
    });

    it('should reject empty name if provided', () => {
      const input = {
        name: '',
      };

      const result = updateProjectSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('listProjectsQuerySchema', () => {
    it('should provide defaults for empty query', () => {
      const input = {};

      const result = listProjectsQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it('should coerce string numbers', () => {
      const input = {
        page: '2',
        limit: '50',
      };

      const result = listProjectsQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(50);
      }
    });

    it('should reject zero page', () => {
      const input = {
        page: 0,
      };

      const result = listProjectsQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject negative page', () => {
      const input = {
        page: -1,
      };

      const result = listProjectsQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject limit over 100', () => {
      const input = {
        limit: 101,
      };

      const result = listProjectsQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('projectIdSchema', () => {
    it('should validate valid UUID', () => {
      const input = {
        id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = projectIdSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const input = {
        id: 'not-a-uuid',
      };

      const result = projectIdSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const input = {
        id: '',
      };

      const result = projectIdSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

describe('Project Service', () => {
  // Mock dependencies
  vi.mock('fs', () => ({
    existsSync: vi.fn(),
  }));

  vi.mock('../../src/config/db.js', () => ({
    prisma: {
      project: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      ticket: {
        groupBy: vi.fn(),
      },
      session: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
    },
  }));

  vi.mock('../../src/services/tmux.js', () => ({
    sessionExists: vi.fn(),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateRepoPath', () => {
    it('should not throw for existing path', async () => {
      const { existsSync } = await import('fs');
      const { validateRepoPath } = await import('../../src/services/projects.js');

      vi.mocked(existsSync).mockReturnValue(true);

      expect(() => validateRepoPath('/existing/path')).not.toThrow();
    });

    it('should throw ProjectValidationError for non-existing path', async () => {
      const { existsSync } = await import('fs');
      const { validateRepoPath, ProjectValidationError } = await import(
        '../../src/services/projects.js'
      );

      vi.mocked(existsSync).mockReturnValue(false);

      expect(() => validateRepoPath('/non-existing/path')).toThrow(ProjectValidationError);
    });
  });

  describe('validateTmuxSession', () => {
    it('should not throw for existing session', async () => {
      const { sessionExists } = await import('../../src/services/tmux.js');
      const { validateTmuxSession } = await import('../../src/services/projects.js');

      vi.mocked(sessionExists).mockResolvedValue(true);

      await expect(validateTmuxSession('existing-session')).resolves.not.toThrow();
    });

    it('should throw ProjectValidationError for non-existing session', async () => {
      const { sessionExists } = await import('../../src/services/tmux.js');
      const { validateTmuxSession, ProjectValidationError } = await import(
        '../../src/services/projects.js'
      );

      vi.mocked(sessionExists).mockResolvedValue(false);

      await expect(validateTmuxSession('non-existing-session')).rejects.toThrow(
        ProjectValidationError
      );
    });
  });

  describe('Error Classes', () => {
    it('should create ProjectNotFoundError with correct properties', async () => {
      const { ProjectNotFoundError } = await import('../../src/services/projects.js');

      const error = new ProjectNotFoundError('123');

      expect(error.message).toBe('Project not found: 123');
      expect(error.code).toBe('PROJECT_NOT_FOUND');
      expect(error.name).toBe('ProjectNotFoundError');
    });

    it('should create ProjectValidationError with correct properties', async () => {
      const { ProjectValidationError } = await import('../../src/services/projects.js');

      const error = new ProjectValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('ProjectValidationError');
    });

    it('should create ProjectConflictError with correct properties', async () => {
      const { ProjectConflictError } = await import('../../src/services/projects.js');

      const error = new ProjectConflictError('Already exists');

      expect(error.message).toBe('Already exists');
      expect(error.code).toBe('CONFLICT');
      expect(error.name).toBe('ProjectConflictError');
    });
  });
});
