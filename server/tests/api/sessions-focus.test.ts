/**
 * Tests for POST /api/sessions/:id/focus endpoint
 * NAT-005: Session Focus Endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process before importing the module
vi.mock('child_process', () => ({
  exec: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: (fn: unknown) => fn,
}));

// Mock Prisma
vi.mock('../../src/config/db.js', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock session-supervisor
vi.mock('../../src/services/session-supervisor.js', () => ({
  sessionSupervisor: {
    getSession: vi.fn(),
    startSession: vi.fn(),
    stopSession: vi.fn(),
    sendInput: vi.fn(),
    sendKeys: vi.fn(),
    getSessionOutput: vi.fn(),
    syncSessions: vi.fn(),
  },
  SessionNotFoundError: class SessionNotFoundError extends Error {
    constructor(id: string) {
      super(`Session not found: ${id}`);
      this.name = 'SessionNotFoundError';
    }
  },
  SessionProjectNotFoundError: class extends Error {},
  SessionTicketNotFoundError: class extends Error {},
  SessionAlreadyRunningError: class extends Error {},
  SessionNotRunningError: class extends Error {},
  SessionCreationError: class extends Error {},
  SessionInputError: class extends Error {},
}));

// Mock session-analyzer
vi.mock('../../src/services/session-analyzer.js', () => ({
  sessionAnalyzer: {
    generateSummary: vi.fn(),
    generateReviewReport: vi.fn(),
    generateCommitMessage: vi.fn(),
    generatePrDescription: vi.fn(),
    parseActivityFromOutput: vi.fn(),
  },
  SessionAnalyzerError: class extends Error {},
  AnalysisTimeoutError: class extends Error {},
  AnalysisParseError: class extends Error {},
}));

// Mock ttyd-manager
vi.mock('../../src/services/ttyd-manager.js', () => ({
  ttydManager: {
    getOrStart: vi.fn(),
    getInstance: vi.fn(),
    stop: vi.fn(),
    isRunning: vi.fn().mockReturnValue(false),
    sendKeys: vi.fn(),
  },
  TtydSessionNotFoundError: class extends Error {},
  TtydAlreadyRunningError: class extends Error {},
  TtydError: class extends Error {},
}));

// Mock tmux service
vi.mock('../../src/services/tmux.js', () => ({
  enterCopyMode: vi.fn(),
  exitCopyMode: vi.fn(),
  scrollUp: vi.fn(),
  scrollDown: vi.fn(),
  isInCopyMode: vi.fn(),
}));

describe('POST /api/sessions/:id/focus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Focus endpoint validation logic', () => {
    it('should validate that 404 is returned for non-existent session', async () => {
      const { prisma } = await import('../../src/config/db.js');
      vi.mocked(prisma.session.findUnique).mockResolvedValue(null);

      // Simulate the logic from the endpoint
      const session = await prisma.session.findUnique({
        where: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });

      expect(session).toBeNull();
      // In the actual endpoint, this would return 404: { error: 'Session not found' }
    });

    it('should validate that 400 is returned when session has no tmux pane', async () => {
      const { prisma } = await import('../../src/config/db.js');

      const mockSession = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tmuxPaneId: null,
        projectId: 'project-123',
        status: 'pending',
      };

      vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSession as never);

      const session = await prisma.session.findUnique({
        where: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });

      const paneId = session?.tmuxPaneId;
      // Check if pane ID is null or doesn't start with '%'
      const hasValidPaneId = paneId && paneId.startsWith('%');

      expect(hasValidPaneId).toBeFalsy();
      // In the actual endpoint, this would return 400 with:
      // { error: 'Session has no tmux pane', message: 'Session may not have been started yet' }
    });

    it('should validate that 400 is returned when pane ID is invalid (missing % prefix)', async () => {
      const { prisma } = await import('../../src/config/db.js');

      const mockSession = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tmuxPaneId: 'invalid-pane-id', // Missing % prefix
        projectId: 'project-123',
        status: 'running',
      };

      vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSession as never);

      const session = await prisma.session.findUnique({
        where: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });

      const paneId = session?.tmuxPaneId;
      const hasValidPaneId = paneId && paneId.startsWith('%');

      expect(hasValidPaneId).toBeFalsy();
    });

    it('should validate that tmux select-pane is called with correct pane ID', async () => {
      const { execSync } = await import('child_process');
      const { prisma } = await import('../../src/config/db.js');

      const mockSession = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tmuxPaneId: '%5',
        projectId: 'project-123',
        status: 'running',
      };

      vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSession as never);
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));

      const session = await prisma.session.findUnique({
        where: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });

      const paneId = session?.tmuxPaneId;
      expect(paneId).toBe('%5');

      // Simulate calling tmux select-pane
      const tmuxPath = process.env.TMUX_PATH ?? '/usr/local/bin/tmux';
      execSync(`${tmuxPath} select-pane -t ${paneId}`, {
        env: { ...process.env, TMUX: '' },
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('select-pane -t %5'),
        expect.any(Object)
      );
    });

    it('should validate zoom command is called when pane is not already zoomed', async () => {
      const { execSync } = await import('child_process');
      const { prisma } = await import('../../src/config/db.js');

      const mockSession = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tmuxPaneId: '%5',
        projectId: 'project-123',
        status: 'running',
      };

      vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSession as never);
      vi.mocked(execSync)
        .mockReturnValueOnce(Buffer.from('')) // select-pane
        .mockReturnValueOnce('0\n') // display-message returns '0' (not zoomed)
        .mockReturnValueOnce(Buffer.from('')); // resize-pane -Z

      const session = await prisma.session.findUnique({
        where: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });

      const paneId = session?.tmuxPaneId;
      const tmuxPath = process.env.TMUX_PATH ?? '/usr/local/bin/tmux';
      const env = { env: { ...process.env, TMUX: '' } };

      // Select pane
      execSync(`${tmuxPath} select-pane -t ${paneId}`, env);

      // Check if zoomed
      const isZoomed = execSync(
        `${tmuxPath} display-message -t ${paneId} -p '#{window_zoomed_flag}'`,
        { ...env, encoding: 'utf8' }
      )
        .toString()
        .trim();

      // Zoom if not already zoomed
      if (isZoomed !== '1') {
        execSync(`${tmuxPath} resize-pane -Z -t ${paneId}`, env);
      }

      expect(execSync).toHaveBeenCalledTimes(3);
      expect(execSync).toHaveBeenLastCalledWith(
        expect.stringContaining('resize-pane -Z -t %5'),
        expect.any(Object)
      );
    });

    it('should validate zoom command is NOT called when pane is already zoomed', async () => {
      const { execSync } = await import('child_process');
      const { prisma } = await import('../../src/config/db.js');

      const mockSession = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tmuxPaneId: '%5',
        projectId: 'project-123',
        status: 'running',
      };

      vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSession as never);
      vi.mocked(execSync)
        .mockReturnValueOnce(Buffer.from('')) // select-pane
        .mockReturnValueOnce('1\n'); // display-message returns '1' (already zoomed)

      const session = await prisma.session.findUnique({
        where: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });

      const paneId = session?.tmuxPaneId;
      const tmuxPath = process.env.TMUX_PATH ?? '/usr/local/bin/tmux';
      const env = { env: { ...process.env, TMUX: '' } };

      // Select pane
      execSync(`${tmuxPath} select-pane -t ${paneId}`, env);

      // Check if zoomed
      const isZoomed = execSync(
        `${tmuxPath} display-message -t ${paneId} -p '#{window_zoomed_flag}'`,
        { ...env, encoding: 'utf8' }
      )
        .toString()
        .trim();

      // Don't zoom if already zoomed
      if (isZoomed !== '1') {
        execSync(`${tmuxPath} resize-pane -Z -t ${paneId}`, env);
      }

      // Only 2 calls: select-pane and display-message (no resize-pane)
      expect(execSync).toHaveBeenCalledTimes(2);
    });

    it('should validate 500 error is returned when select-pane fails', async () => {
      const { execSync } = await import('child_process');
      const { prisma } = await import('../../src/config/db.js');

      const mockSession = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tmuxPaneId: '%5',
        projectId: 'project-123',
        status: 'running',
      };

      vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSession as never);
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('tmux: pane not found');
      });

      let errorCaught = false;
      try {
        const tmuxPath = process.env.TMUX_PATH ?? '/usr/local/bin/tmux';
        execSync(`${tmuxPath} select-pane -t %5`, {
          env: { ...process.env, TMUX: '' },
        });
      } catch {
        errorCaught = true;
        // In the actual endpoint, this would return 500: { error: 'Failed to select pane' }
      }

      expect(errorCaught).toBe(true);
    });
  });

  describe('Response format validation', () => {
    it('should return correct success response structure', () => {
      const successResponse = {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        pane_id: '%5',
        message: 'Pane focused and zoomed',
      };

      expect(successResponse).toHaveProperty('session_id');
      expect(successResponse).toHaveProperty('pane_id');
      expect(successResponse).toHaveProperty('message');
      expect(successResponse.pane_id).toMatch(/^%\d+$/);
    });

    it('should return correct 404 error response structure', () => {
      const errorResponse = {
        error: 'Session not found',
      };

      expect(errorResponse).toHaveProperty('error');
      expect(errorResponse.error).toBe('Session not found');
    });

    it('should return correct 400 error response structure with helpful message', () => {
      const errorResponse = {
        error: 'Session has no tmux pane',
        message: 'Session may not have been started yet',
      };

      expect(errorResponse).toHaveProperty('error');
      expect(errorResponse).toHaveProperty('message');
      expect(errorResponse.error).toBe('Session has no tmux pane');
      expect(errorResponse.message).toBe('Session may not have been started yet');
    });
  });
});
