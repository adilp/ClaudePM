import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { env } from './config/env.js';
import healthRouter from './api/health.js';
import projectsRouter from './api/projects.js';
import sessionsRouter from './api/sessions.js';
import ticketsRouter from './api/tickets.js';
import adhocTicketsRouter from './api/adhoc-tickets.js';
import hooksRouter from './api/hooks.js';
import gitRouter from './api/git.js';
import tmuxRouter from './api/tmux.js';
import docsRouter from './api/docs.js';
import notificationsRouter from './api/notifications.js';
import devicesRouter from './api/devices.js';
import { apiKeyAuth } from './middleware/api-key-auth.js';
import { sessionSupervisor } from './services/session-supervisor.js';
import { waitingDetector } from './services/waiting-detector.js';
import { ticketStateMachine } from './services/ticket-state-machine.js';
import { reviewerSubagent } from './services/reviewer-subagent.js';
import { autoHandoff } from './services/auto-handoff.js';
import { wsManager, attachWebSocket } from './websocket/server.js';
import { notificationService } from './services/notification-service.js';

const app: Express = express();

// Create HTTP server (needed for WebSocket)
const httpServer = createServer(app);

// Middleware
app.use(cors({
  origin: [
    'http://localhost:1420',  // Tauri dev server
    'http://127.0.0.1:1420',
    'tauri://localhost',      // Tauri production
    /^http:\/\/localhost:\d+$/,  // Any localhost port
  ],
  credentials: true,
}));
app.use(express.json());

// API Routes - Health endpoint (no auth required)
app.use('/api/health', healthRouter);

// Apply API key auth to all other /api routes when API_KEY is configured
app.use('/api', apiKeyAuth);

// Protected API Routes
app.use('/api/projects', projectsRouter);
app.use('/api/projects', gitRouter);
app.use('/api/projects', docsRouter);
app.use('/api', sessionsRouter);
app.use('/api', ticketsRouter);
app.use('/api', adhocTicketsRouter);
app.use('/api/hooks', hooksRouter);
app.use('/api/tmux', tmuxRouter);
app.use('/api', notificationsRouter);
app.use('/api/devices', devicesRouter);

// 404 handler
app.use((_req: Request, res: Response): void => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Attach WebSocket server
const wss = attachWebSocket(httpServer);

// Wire up notification service with WebSocket manager
notificationService.setWebSocketManager(wsManager);

// Start server
httpServer.listen(env.PORT, env.HOST, () => {
  console.log(`Server running at http://${env.HOST}:${env.PORT}`);
  console.log(`Health check: http://${env.HOST}:${env.PORT}/api/health`);
  console.log(`WebSocket available at ws://${env.HOST}:${env.PORT}`);

  // Start session supervisor
  sessionSupervisor.start().then(() => {
    console.log('Session supervisor started');

    // Start waiting detector after session supervisor
    waitingDetector.start();
    console.log('Waiting detector started');

    // Start ticket state machine
    ticketStateMachine.start();
    console.log('Ticket state machine started');

    // Start reviewer subagent
    reviewerSubagent.start();
    console.log('Reviewer subagent started');

    // Start auto-handoff service
    autoHandoff.start();
    console.log('Auto-handoff service started');
  }).catch((err) => {
    console.error('Failed to start session supervisor:', err);
  });
});

// Graceful shutdown
const shutdown = (): void => {
  console.log('Shutting down gracefully...');

  // Close WebSocket server
  wsManager.close();

  // Stop auto-handoff service
  autoHandoff.stop();

  // Stop reviewer subagent
  reviewerSubagent.stop();

  // Stop ticket state machine
  ticketStateMachine.stop();

  // Stop waiting detector
  waitingDetector.stop();

  // Stop session supervisor
  sessionSupervisor.stop();

  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, httpServer, wss };
