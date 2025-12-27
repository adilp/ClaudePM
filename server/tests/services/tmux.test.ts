/**
 * tmux Integration Service Tests
 *
 * Unit tests focus on utility functions and error classes.
 * Integration tests run against a real tmux server when TMUX_INTEGRATION_TESTS is set.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import {
  stripAnsiCodes,
  escapeShellArg,
  TmuxError,
  TmuxSessionNotFoundError,
  TmuxPaneNotFoundError,
  TmuxWindowNotFoundError,
  TmuxNotAvailableError,
  TmuxCommandError,
} from '../../src/services/tmux.js';

describe('tmux Service', () => {
  describe('Unit Tests', () => {
    describe('stripAnsiCodes', () => {
      it('should strip basic color codes', () => {
        const input = '\x1b[32mGreen\x1b[0m Text';
        const result = stripAnsiCodes(input);
        expect(result).toBe('Green Text');
      });

      it('should strip multiple color codes', () => {
        const input = '\x1b[31mRed\x1b[0m \x1b[32mGreen\x1b[0m \x1b[34mBlue\x1b[0m';
        const result = stripAnsiCodes(input);
        expect(result).toBe('Red Green Blue');
      });

      it('should strip bold and other formatting codes', () => {
        const input = '\x1b[1mBold\x1b[0m \x1b[4mUnderline\x1b[0m';
        const result = stripAnsiCodes(input);
        expect(result).toBe('Bold Underline');
      });

      it('should handle text without ANSI codes', () => {
        const input = 'Plain text without any codes';
        const result = stripAnsiCodes(input);
        expect(result).toBe('Plain text without any codes');
      });

      it('should handle empty string', () => {
        const result = stripAnsiCodes('');
        expect(result).toBe('');
      });

      it('should strip complex escape sequences', () => {
        const input = '\x1b[38;5;196mRed 256\x1b[0m \x1b[48;2;0;255;0mGreen BG\x1b[0m';
        const result = stripAnsiCodes(input);
        expect(result).toBe('Red 256 Green BG');
      });
    });

    describe('escapeShellArg', () => {
      it('should wrap simple string in single quotes', () => {
        const result = escapeShellArg('hello');
        expect(result).toBe("'hello'");
      });

      it('should escape single quotes', () => {
        const result = escapeShellArg("hello'world");
        expect(result).toBe("'hello'\\''world'");
      });

      it('should handle multiple single quotes', () => {
        const result = escapeShellArg("it's a 'test'");
        expect(result).toBe("'it'\\''s a '\\''test'\\'''");
      });

      it('should handle spaces', () => {
        const result = escapeShellArg('hello world');
        expect(result).toBe("'hello world'");
      });

      it('should handle special characters', () => {
        const result = escapeShellArg('$HOME; rm -rf /');
        expect(result).toBe("'$HOME; rm -rf /'");
      });

      it('should handle empty string', () => {
        const result = escapeShellArg('');
        expect(result).toBe("''");
      });
    });

    describe('Error Classes', () => {
      describe('TmuxError', () => {
        it('should have correct name and message', () => {
          const error = new TmuxError('test error');
          expect(error.name).toBe('TmuxError');
          expect(error.message).toBe('test error');
        });

        it('should include optional command and exit code', () => {
          const error = new TmuxError('test error', 'tmux list-sessions', 1);
          expect(error.command).toBe('tmux list-sessions');
          expect(error.exitCode).toBe(1);
        });

        it('should be instanceof Error', () => {
          const error = new TmuxError('test');
          expect(error).toBeInstanceOf(Error);
          expect(error).toBeInstanceOf(TmuxError);
        });
      });

      describe('TmuxNotAvailableError', () => {
        it('should have descriptive message', () => {
          const error = new TmuxNotAvailableError();
          expect(error.name).toBe('TmuxNotAvailableError');
          expect(error.message).toContain('not installed');
          expect(error.message).toContain('not available');
        });

        it('should be instanceof TmuxError', () => {
          const error = new TmuxNotAvailableError();
          expect(error).toBeInstanceOf(TmuxError);
        });
      });

      describe('TmuxSessionNotFoundError', () => {
        it('should include session name in message', () => {
          const error = new TmuxSessionNotFoundError('my-session');
          expect(error.name).toBe('TmuxSessionNotFoundError');
          expect(error.message).toContain('my-session');
          expect(error.session).toBe('my-session');
        });

        it('should be instanceof TmuxError', () => {
          const error = new TmuxSessionNotFoundError('test');
          expect(error).toBeInstanceOf(TmuxError);
        });
      });

      describe('TmuxWindowNotFoundError', () => {
        it('should include session and window in message', () => {
          const error = new TmuxWindowNotFoundError('session', 'window');
          expect(error.name).toBe('TmuxWindowNotFoundError');
          expect(error.message).toContain('session');
          expect(error.message).toContain('window');
          expect(error.session).toBe('session');
          expect(error.window).toBe('window');
        });

        it('should be instanceof TmuxError', () => {
          const error = new TmuxWindowNotFoundError('s', 'w');
          expect(error).toBeInstanceOf(TmuxError);
        });
      });

      describe('TmuxPaneNotFoundError', () => {
        it('should include pane ID in message', () => {
          const error = new TmuxPaneNotFoundError('%5');
          expect(error.name).toBe('TmuxPaneNotFoundError');
          expect(error.message).toContain('%5');
          expect(error.paneId).toBe('%5');
        });

        it('should be instanceof TmuxError', () => {
          const error = new TmuxPaneNotFoundError('%0');
          expect(error).toBeInstanceOf(TmuxError);
        });
      });

      describe('TmuxCommandError', () => {
        it('should include all error details', () => {
          const error = new TmuxCommandError(
            'Command failed',
            'tmux list-sessions',
            1,
            'no server running'
          );
          expect(error.name).toBe('TmuxCommandError');
          expect(error.message).toBe('Command failed');
          expect(error.command).toBe('tmux list-sessions');
          expect(error.exitCode).toBe(1);
          expect(error.stderr).toBe('no server running');
        });

        it('should be instanceof TmuxError', () => {
          const error = new TmuxCommandError('err', 'cmd', 1, 'stderr');
          expect(error).toBeInstanceOf(TmuxError);
        });
      });
    });
  });

  // Integration tests - only run when TMUX_INTEGRATION_TESTS is set
  describe.skipIf(!process.env.TMUX_INTEGRATION_TESTS)('Integration Tests', () => {
    const TEST_SESSION = `csm-test-${Date.now()}`;
    let tmux: typeof import('../../src/services/tmux.js');

    // Check if tmux is available before running tests
    beforeAll(async () => {
      try {
        execSync('tmux -V', { encoding: 'utf8' });
      } catch {
        throw new Error('tmux is not available - skipping integration tests');
      }
      tmux = await import('../../src/services/tmux.js');
    });

    afterAll(() => {
      // Cleanup any leftover test sessions
      try {
        execSync(`tmux kill-session -t ${TEST_SESSION} 2>/dev/null`, { encoding: 'utf8' });
      } catch {
        // Ignore errors
      }
    });

    describe('Session Discovery', () => {
      beforeEach(() => {
        // Create a test session
        try {
          execSync(`tmux new-session -d -s ${TEST_SESSION}`, { encoding: 'utf8' });
        } catch {
          // Session might already exist
        }
      });

      afterEach(() => {
        // Clean up test session
        try {
          execSync(`tmux kill-session -t ${TEST_SESSION} 2>/dev/null`, { encoding: 'utf8' });
        } catch {
          // Ignore errors
        }
      });

      it('should check if tmux is available', async () => {
        const available = await tmux.isTmuxAvailable();
        expect(available).toBe(true);
      });

      it('should get tmux version', async () => {
        const version = await tmux.getTmuxVersion();
        expect(version).toMatch(/tmux \d+\.\d+/);
      });

      it('should list sessions including test session', async () => {
        const sessions = await tmux.listSessions();
        const testSession = sessions.find((s) => s.name === TEST_SESSION);

        expect(testSession).toBeDefined();
        expect(testSession?.windows).toBeGreaterThanOrEqual(1);
        expect(testSession?.attached).toBe(false); // Detached session
      });

      it('should verify session exists', async () => {
        const exists = await tmux.sessionExists(TEST_SESSION);
        expect(exists).toBe(true);
      });

      it('should return false for non-existent session', async () => {
        const exists = await tmux.sessionExists('non-existent-session-xyz');
        expect(exists).toBe(false);
      });

      it('should list windows in session', async () => {
        const windows = await tmux.listWindows(TEST_SESSION);

        expect(windows.length).toBeGreaterThanOrEqual(1);
        expect(windows[0]).toHaveProperty('index');
        expect(windows[0]).toHaveProperty('name');
        expect(windows[0]).toHaveProperty('active');
        expect(windows[0]).toHaveProperty('panes');
      });

      it('should throw for listing windows of non-existent session', async () => {
        await expect(tmux.listWindows('non-existent-xyz')).rejects.toThrow(
          tmux.TmuxSessionNotFoundError
        );
      });
    });

    describe('Pane Management', () => {
      beforeEach(() => {
        try {
          execSync(`tmux new-session -d -s ${TEST_SESSION}`, { encoding: 'utf8' });
        } catch {
          // Session might already exist
        }
      });

      afterEach(() => {
        try {
          execSync(`tmux kill-session -t ${TEST_SESSION} 2>/dev/null`, { encoding: 'utf8' });
        } catch {
          // Ignore errors
        }
      });

      it('should create a pane and return pane ID', async () => {
        const paneId = await tmux.createPane(TEST_SESSION);

        expect(paneId).toMatch(/^%\d+$/);
      });

      it('should check if pane is alive', async () => {
        const paneId = await tmux.createPane(TEST_SESSION);

        const alive = await tmux.isPaneAlive(paneId);
        expect(alive).toBe(true);
      });

      it('should kill a pane', async () => {
        const paneId = await tmux.createPane(TEST_SESSION);

        // Verify it's alive first
        expect(await tmux.isPaneAlive(paneId)).toBe(true);

        // Kill it
        await tmux.killPane(paneId);

        // Verify it's dead
        expect(await tmux.isPaneAlive(paneId)).toBe(false);
      });

      it('should throw when killing non-existent pane', async () => {
        await expect(tmux.killPane('%99999')).rejects.toThrow(tmux.TmuxPaneNotFoundError);
      });

      it('should create horizontal split pane', async () => {
        const paneId = await tmux.createPane(TEST_SESSION, { horizontal: true });

        expect(paneId).toMatch(/^%\d+$/);
        expect(await tmux.isPaneAlive(paneId)).toBe(true);
      });

      it('should list panes in session', async () => {
        const paneId = await tmux.createPane(TEST_SESSION);
        const panes = await tmux.listPanes(TEST_SESSION);

        expect(panes.length).toBeGreaterThanOrEqual(2); // Original + new one
        expect(panes.some((p) => p.id === paneId)).toBe(true);
      });
    });

    describe('Output Capture', () => {
      let paneId: string;

      beforeEach(async () => {
        try {
          execSync(`tmux new-session -d -s ${TEST_SESSION}`, { encoding: 'utf8' });
        } catch {
          // Session might already exist
        }
        paneId = await tmux.createPane(TEST_SESSION);
      });

      afterEach(() => {
        try {
          execSync(`tmux kill-session -t ${TEST_SESSION} 2>/dev/null`, { encoding: 'utf8' });
        } catch {
          // Ignore errors
        }
      });

      it('should capture pane output', async () => {
        // Send a command that produces output
        await tmux.sendText(paneId, 'echo "TEST_OUTPUT_12345"');

        // Wait for output
        await new Promise((resolve) => setTimeout(resolve, 300));

        const output = await tmux.capturePane(paneId);
        expect(output).toContain('TEST_OUTPUT_12345');
      });

      it('should strip ANSI codes by default', async () => {
        const output = await tmux.capturePane(paneId, { stripAnsi: true });

        // Should not contain escape sequences
        expect(output).not.toMatch(/\x1b\[/);
      });

      it('should throw when capturing non-existent pane', async () => {
        await expect(tmux.capturePane('%99999')).rejects.toThrow(tmux.TmuxPaneNotFoundError);
      });
    });

    describe('Input Injection', () => {
      let paneId: string;

      beforeEach(async () => {
        try {
          execSync(`tmux new-session -d -s ${TEST_SESSION}`, { encoding: 'utf8' });
        } catch {
          // Session might already exist
        }
        paneId = await tmux.createPane(TEST_SESSION);
      });

      afterEach(() => {
        try {
          execSync(`tmux kill-session -t ${TEST_SESSION} 2>/dev/null`, { encoding: 'utf8' });
        } catch {
          // Ignore errors
        }
      });

      it('should send keys to pane', async () => {
        await tmux.sendKeys(paneId, 'echo hello');

        await new Promise((resolve) => setTimeout(resolve, 100));

        const output = await tmux.capturePane(paneId);
        expect(output).toContain('echo hello');
      });

      it('should send text with Enter', async () => {
        await tmux.sendText(paneId, 'echo "SENT_TEXT_789"');

        await new Promise((resolve) => setTimeout(resolve, 300));

        const output = await tmux.capturePane(paneId);
        expect(output).toContain('SENT_TEXT_789');
      });

      it('should send interrupt (Ctrl+C)', async () => {
        // Start a long-running command
        await tmux.sendText(paneId, 'sleep 60');
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Send interrupt
        await tmux.sendInterrupt(paneId);
        await new Promise((resolve) => setTimeout(resolve, 100));

        // The pane should still be alive
        expect(await tmux.isPaneAlive(paneId)).toBe(true);
      });

      it('should throw when sending to non-existent pane', async () => {
        await expect(tmux.sendKeys('%99999', 'test')).rejects.toThrow(
          tmux.TmuxPaneNotFoundError
        );
        await expect(tmux.sendText('%99999', 'test')).rejects.toThrow(
          tmux.TmuxPaneNotFoundError
        );
        await expect(tmux.sendInterrupt('%99999')).rejects.toThrow(
          tmux.TmuxPaneNotFoundError
        );
      });
    });

    describe('Session and Window Management', () => {
      afterEach(() => {
        try {
          execSync(`tmux kill-session -t ${TEST_SESSION} 2>/dev/null`, { encoding: 'utf8' });
        } catch {
          // Ignore errors
        }
      });

      it('should create and kill a session', async () => {
        const sessionName = `${TEST_SESSION}-create`;

        await tmux.createSession(sessionName);
        expect(await tmux.sessionExists(sessionName)).toBe(true);

        await tmux.killSession(sessionName);
        expect(await tmux.sessionExists(sessionName)).toBe(false);
      });

      it('should throw when killing non-existent session', async () => {
        await expect(tmux.killSession('non-existent-session-xyz')).rejects.toThrow(
          tmux.TmuxSessionNotFoundError
        );
      });

      it('should create a window in session', async () => {
        await tmux.createSession(TEST_SESSION);

        const windowIndex = await tmux.createWindow(TEST_SESSION, { name: 'test-window' });
        expect(typeof windowIndex).toBe('number');

        const windows = await tmux.listWindows(TEST_SESSION);
        expect(windows.some((w) => w.name === 'test-window')).toBe(true);
      });

      it('should kill a window', async () => {
        await tmux.createSession(TEST_SESSION);
        const windowIndex = await tmux.createWindow(TEST_SESSION, { name: 'to-kill' });

        await tmux.killWindow(TEST_SESSION, windowIndex);

        const windows = await tmux.listWindows(TEST_SESSION);
        expect(windows.some((w) => w.index === windowIndex)).toBe(false);
      });
    });

    describe('Utility Functions', () => {
      beforeEach(async () => {
        try {
          execSync(`tmux new-session -d -s ${TEST_SESSION}`, { encoding: 'utf8' });
        } catch {
          // Session might already exist
        }
      });

      afterEach(() => {
        try {
          execSync(`tmux kill-session -t ${TEST_SESSION} 2>/dev/null`, { encoding: 'utf8' });
        } catch {
          // Ignore errors
        }
      });

      it('should wait for output pattern', async () => {
        const paneId = await tmux.createPane(TEST_SESSION);

        // Send a delayed echo
        await tmux.sendText(paneId, 'sleep 0.2 && echo "PATTERN_FOUND_XYZ"');

        const output = await tmux.waitForOutput(paneId, /PATTERN_FOUND_XYZ/, {
          timeout: 5000,
          pollInterval: 100,
        });

        expect(output).toContain('PATTERN_FOUND_XYZ');
      });

      it('should timeout when pattern not found', async () => {
        const paneId = await tmux.createPane(TEST_SESSION);

        await expect(
          tmux.waitForOutput(paneId, /NEVER_GONNA_MATCH/, {
            timeout: 500,
            pollInterval: 100,
          })
        ).rejects.toThrow(/Timeout/);
      });

      it('should get pane current working directory', async () => {
        const paneId = await tmux.createPane(TEST_SESSION);

        const cwd = await tmux.getPaneCwd(paneId);
        expect(cwd).toBeTruthy();
        expect(cwd.startsWith('/')).toBe(true); // Should be an absolute path
      });

      it('should get pane current command', async () => {
        const paneId = await tmux.createPane(TEST_SESSION);

        const command = await tmux.getPaneCommand(paneId);
        expect(typeof command).toBe('string');
      });
    });
  });
});
