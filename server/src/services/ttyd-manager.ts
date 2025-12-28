/**
 * ttyd Manager Service
 * Manages ttyd instances for web-based terminal access to tmux sessions
 *
 * ttyd handles all the terminal emulation complexity, including:
 * - Proper terminal dimensions
 * - tmux integration
 * - WebSocket communication
 * - xterm.js rendering
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { prisma } from '../config/db.js';
import * as tmux from './tmux.js';

// ============================================================================
// Types
// ============================================================================

export interface TtydInstance {
  /** Session ID this ttyd is serving */
  sessionId: string;
  /** The tmux pane ID */
  paneId: string;
  /** Port ttyd is listening on */
  port: number;
  /** The ttyd child process */
  process: ChildProcess;
  /** Creation timestamp */
  createdAt: Date;
  /** Number of connected clients (tracked externally) */
  clientCount: number;
}

export interface TtydStartOptions {
  /** Force a specific port (otherwise auto-assigned) */
  port?: number;
}

// ============================================================================
// Errors
// ============================================================================

export class TtydError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TtydError';
  }
}

export class TtydSessionNotFoundError extends TtydError {
  constructor(public readonly sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'TtydSessionNotFoundError';
  }
}

export class TtydAlreadyRunningError extends TtydError {
  constructor(public readonly sessionId: string, public readonly port: number) {
    super(`ttyd already running for session ${sessionId} on port ${port}`);
    this.name = 'TtydAlreadyRunningError';
  }
}

// ============================================================================
// ttyd Manager Class
// ============================================================================

export class TtydManager extends EventEmitter {
  /** Map of session ID to ttyd instance */
  private instances: Map<string, TtydInstance> = new Map();

  /** Base port for ttyd instances */
  private basePort = 7681;

  /** Set of ports currently in use */
  private usedPorts: Set<number> = new Set();

  /** Path to ttyd binary */
  private ttydPath: string;

  /** Path to tmux binary */
  private tmuxPath: string;

  constructor() {
    super();
    this.ttydPath = process.env.TTYD_PATH ?? 'ttyd';
    this.tmuxPath = process.env.TMUX_PATH ?? '/usr/local/bin/tmux';
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Start a ttyd instance for a session
   * Returns the port ttyd is listening on
   */
  async start(sessionId: string, options: TtydStartOptions = {}): Promise<TtydInstance> {
    // Check if already running
    const existing = this.instances.get(sessionId);
    if (existing) {
      throw new TtydAlreadyRunningError(sessionId, existing.port);
    }

    // Get session from database
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new TtydSessionNotFoundError(sessionId);
    }

    const paneId = session.tmuxPaneId;

    // Validate pane ID
    if (!paneId || paneId === 'claude-code' || !paneId.startsWith('%')) {
      throw new TtydError(`Session ${sessionId} has invalid pane ID: ${paneId}`);
    }

    // Verify pane is alive
    const isAlive = await tmux.isPaneAlive(paneId);
    if (!isAlive) {
      throw new TtydError(`Pane ${paneId} is not alive`);
    }

    // Allocate port
    const port = options.port ?? this.allocatePort();
    this.usedPorts.add(port);

    // Spawn ttyd process
    // -W: writable (allow input)
    // -p: port
    // Command: tmux attach to the specific pane
    const args = [
      '-W',                           // Writable mode
      '-p', String(port),             // Port
      '-t', 'disableLeaveAlert=true', // Disable leave confirmation
      '-t', 'enableSixel=false',      // Disable sixel (not needed)
      this.tmuxPath,
      'attach-session',
      '-t', paneId,
    ];

    console.log(`[TtydManager] Starting ttyd for session ${sessionId}: ${this.ttydPath} ${args.join(' ')}`);

    const ttydProcess = spawn(this.ttydPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      },
    });

    const instance: TtydInstance = {
      sessionId,
      paneId,
      port,
      process: ttydProcess,
      createdAt: new Date(),
      clientCount: 0,
    };

    // Handle stdout (ttyd logs)
    ttydProcess.stdout?.on('data', (data: Buffer) => {
      console.log(`[ttyd:${sessionId}] ${data.toString().trim()}`);
    });

    // Handle stderr
    ttydProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[ttyd:${sessionId}] ${data.toString().trim()}`);
    });

    // Handle exit
    ttydProcess.on('exit', (code, signal) => {
      console.log(`[TtydManager] ttyd for session ${sessionId} exited (code: ${code}, signal: ${signal})`);
      this.usedPorts.delete(port);
      this.instances.delete(sessionId);
      this.emit('ttyd:exit', { sessionId, port, code, signal });
    });

    // Handle error
    ttydProcess.on('error', (error) => {
      console.error(`[TtydManager] ttyd for session ${sessionId} error:`, error);
      this.usedPorts.delete(port);
      this.instances.delete(sessionId);
      this.emit('ttyd:error', { sessionId, port, error });
    });

    // Store instance
    this.instances.set(sessionId, instance);

    // Wait a moment for ttyd to start
    await this.waitForTtyd(port);

    console.log(`[TtydManager] ttyd started for session ${sessionId} on port ${port}`);

    return instance;
  }

  /**
   * Stop a ttyd instance for a session
   */
  stop(sessionId: string): void {
    const instance = this.instances.get(sessionId);
    if (!instance) {
      return; // Already stopped
    }

    console.log(`[TtydManager] Stopping ttyd for session ${sessionId}`);

    try {
      instance.process.kill('SIGTERM');
    } catch (error) {
      console.warn(`[TtydManager] Error killing ttyd for session ${sessionId}:`, error);
    }

    this.usedPorts.delete(instance.port);
    this.instances.delete(sessionId);
  }

  /**
   * Get ttyd instance for a session
   */
  getInstance(sessionId: string): TtydInstance | undefined {
    return this.instances.get(sessionId);
  }

  /**
   * Check if ttyd is running for a session
   */
  isRunning(sessionId: string): boolean {
    return this.instances.has(sessionId);
  }

  /**
   * Get or start ttyd for a session
   */
  async getOrStart(sessionId: string): Promise<TtydInstance> {
    const existing = this.instances.get(sessionId);
    if (existing) {
      return existing;
    }
    return this.start(sessionId);
  }

  /**
   * Stop all ttyd instances
   */
  stopAll(): void {
    console.log(`[TtydManager] Stopping all ttyd instances (${this.instances.size} total)`);
    for (const sessionId of this.instances.keys()) {
      this.stop(sessionId);
    }
  }

  /**
   * Get the URL for a ttyd instance
   */
  getUrl(sessionId: string): string | null {
    const instance = this.instances.get(sessionId);
    if (!instance) {
      return null;
    }
    return `http://localhost:${instance.port}`;
  }

  /**
   * Get WebSocket URL for a ttyd instance
   */
  getWsUrl(sessionId: string): string | null {
    const instance = this.instances.get(sessionId);
    if (!instance) {
      return null;
    }
    return `ws://localhost:${instance.port}/ws`;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Allocate an available port
   */
  private allocatePort(): number {
    let port = this.basePort;
    while (this.usedPorts.has(port)) {
      port++;
    }
    return port;
  }

  /**
   * Wait for ttyd to be ready
   */
  private async waitForTtyd(port: number, timeoutMs = 5000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`http://localhost:${port}/`);
        if (response.ok) {
          return;
        }
      } catch {
        // ttyd not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.warn(`[TtydManager] ttyd on port ${port} did not become ready within ${timeoutMs}ms`);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const ttydManager = new TtydManager();
