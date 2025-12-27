/**
 * Session Detail Page
 * Real-time session view with terminal output and input
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useSession, useStopSession, useSendInput } from '@/hooks/useSessions';
import { useWebSocket } from '@/hooks/useWebSocket';
import { cn } from '@/lib/utils';
import type { SessionStatus } from '@/types/api';
import {
  ArrowLeft,
  Play,
  Square,
  Clock,
  AlertCircle,
  Send,
  Wifi,
  WifiOff,
  TestTube,
  GitCommit,
  GitBranch,
  GitPullRequest,
} from 'lucide-react';

const statusConfig: Record<SessionStatus, { label: string; color: string; bgColor: string; icon: typeof Play }> = {
  starting: { label: 'Starting', color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: Clock },
  running: { label: 'Running', color: 'text-green-700', bgColor: 'bg-green-100', icon: Play },
  waiting: { label: 'Waiting for Input', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: AlertCircle },
  stopped: { label: 'Stopped', color: 'text-gray-700', bgColor: 'bg-gray-100', icon: Square },
};

interface QuickAction {
  label: string;
  command: string;
  icon: typeof Play;
  variant?: 'default' | 'destructive';
}

const quickActions: QuickAction[] = [
  { label: 'Continue', command: 'continue', icon: Play },
  { label: 'Run Tests', command: 'npm run test', icon: TestTube },
  { label: 'Commit', command: '/commit', icon: GitCommit },
  { label: 'Create Branch', command: '/branch', icon: GitBranch },
  { label: 'Create PR', command: '/pr', icon: GitPullRequest },
];

export function SessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { data: session, isLoading, error, refetch } = useSession(sessionId!);
  const stopSession = useStopSession();
  const sendInput = useSendInput();
  const { connectionState, subscribe, unsubscribe, lastMessage } = useWebSocket();

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const [inputValue, setInputValue] = useState('');
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isWaiting, setIsWaiting] = useState(false);
  const [contextPercent, setContextPercent] = useState<number | null>(null);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const terminal = new Terminal({
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#c0caf5',
        cursorAccent: '#1a1b26',
        black: '#32344a',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#ad8ee6',
        cyan: '#449dab',
        white: '#787c99',
        brightBlack: '#444b6a',
        brightRed: '#ff7a93',
        brightGreen: '#b9f27c',
        brightYellow: '#ff9e64',
        brightBlue: '#7da6ff',
        brightMagenta: '#bb9af7',
        brightCyan: '#0db9d7',
        brightWhite: '#acb0d0',
      },
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    // Welcome message
    terminal.writeln('\x1b[1;34m=== Claude Session Manager ===\x1b[0m');
    terminal.writeln('\x1b[90mConnecting to session...\x1b[0m');
    terminal.writeln('');

    return () => {
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Fit terminal on container size change
  useEffect(() => {
    if (fitAddonRef.current) {
      const timeout = setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [session]);

  // Subscribe to session WebSocket updates
  useEffect(() => {
    if (sessionId) {
      subscribe(sessionId);
      return () => unsubscribe(sessionId);
    }
  }, [sessionId, subscribe, unsubscribe]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage || !xtermRef.current) return;

    if (lastMessage.type === 'session:output') {
      const payload = lastMessage.payload as { session_id: string; output: string };
      if (payload.session_id === sessionId) {
        xtermRef.current.write(payload.output);
      }
    }

    if (lastMessage.type === 'session:stateChange') {
      const payload = lastMessage.payload as { session_id: string; status: string; context_percent: number | null };
      if (payload.session_id === sessionId) {
        setContextPercent(payload.context_percent);
        refetch();
      }
    }

    if (lastMessage.type === 'session:waiting') {
      const payload = lastMessage.payload as { session_id: string; waiting: boolean };
      if (payload.session_id === sessionId) {
        setIsWaiting(payload.waiting);
      }
    }
  }, [lastMessage, sessionId, refetch]);

  // Update context from session data
  useEffect(() => {
    if (session?.context_percent !== undefined) {
      setContextPercent(session.context_percent);
    }
  }, [session?.context_percent]);

  const handleSendInput = useCallback(() => {
    if (!inputValue.trim() || !sessionId) return;

    const command = inputValue.trim();
    sendInput.mutate({ sessionId, text: command });

    // Add to history
    setInputHistory(prev => [...prev.filter(h => h !== command), command]);
    setHistoryIndex(-1);
    setInputValue('');

    // Echo to terminal
    if (xtermRef.current) {
      xtermRef.current.writeln(`\x1b[1;32m> ${command}\x1b[0m`);
    }
  }, [inputValue, sessionId, sendInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendInput();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (inputHistory.length > 0) {
        const newIndex = historyIndex < inputHistory.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setInputValue(inputHistory[inputHistory.length - 1 - newIndex] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInputValue(inputHistory[inputHistory.length - 1 - newIndex] || '');
      } else {
        setHistoryIndex(-1);
        setInputValue('');
      }
    }
  }, [handleSendInput, inputHistory, historyIndex]);

  const handleQuickAction = useCallback((action: QuickAction) => {
    if (!sessionId) return;
    sendInput.mutate({ sessionId, text: action.command });
    if (xtermRef.current) {
      xtermRef.current.writeln(`\x1b[1;32m> ${action.command}\x1b[0m`);
    }
  }, [sessionId, sendInput]);

  const handleStopSession = useCallback(() => {
    if (!sessionId) return;
    stopSession.mutate(sessionId, {
      onSuccess: () => {
        if (xtermRef.current) {
          xtermRef.current.writeln('\x1b[1;31m=== Session Stopped ===\x1b[0m');
        }
        refetch();
      },
    });
  }, [sessionId, stopSession, refetch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="space-y-4">
        <Link
          to="/sessions"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sessions
        </Link>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-center">
          <p className="text-destructive">Session not found</p>
        </div>
      </div>
    );
  }

  const statusInfo = statusConfig[session.status];
  const StatusIcon = statusInfo.icon;
  const isActive = session.status !== 'stopped';
  const displayContext = contextPercent ?? session.context_percent;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex-shrink-0 space-y-4 mb-4">
        <Link
          to="/sessions"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sessions
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={cn('rounded-lg p-3', statusInfo.bgColor)}>
              <StatusIcon className={cn('h-6 w-6', statusInfo.color)} />
            </div>
            <div>
              <h1 className="text-xl font-bold font-mono">{session.id.slice(0, 12)}...</h1>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  statusInfo.bgColor,
                  statusInfo.color
                )}>
                  {statusInfo.label}
                </span>
                {session.ticket_id && (
                  <Link
                    to={`/projects/${session.project_id}/tickets/${session.ticket_id}`}
                    className="hover:text-foreground"
                  >
                    Ticket: {session.ticket_id.slice(0, 8)}...
                  </Link>
                )}
                <span className="flex items-center gap-1">
                  {connectionState === 'connected' ? (
                    <Wifi className="h-3 w-3 text-green-500" />
                  ) : (
                    <WifiOff className="h-3 w-3 text-red-500" />
                  )}
                  {connectionState}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Context Meter */}
            {displayContext !== null && (
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-muted-foreground">Context</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-3 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        displayContext > 80 ? 'bg-red-500' :
                        displayContext > 60 ? 'bg-yellow-500' : 'bg-green-500'
                      )}
                      style={{ width: `${displayContext}%` }}
                    />
                  </div>
                  <span className={cn(
                    'text-sm font-medium w-10 text-right',
                    displayContext > 80 ? 'text-red-500' :
                    displayContext > 60 ? 'text-yellow-500' : 'text-green-500'
                  )}>
                    {displayContext}%
                  </span>
                </div>
              </div>
            )}

            {/* Stop Button */}
            {isActive && (
              <button
                onClick={handleStopSession}
                disabled={stopSession.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Square className="h-4 w-4" />
                {stopSession.isPending ? 'Stopping...' : 'Stop'}
              </button>
            )}
          </div>
        </div>

        {/* Waiting Indicator */}
        {isWaiting && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-100 text-blue-700">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Waiting for input...</span>
          </div>
        )}

        {/* Quick Actions */}
        {isActive && (
          <div className="flex items-center gap-2 flex-wrap">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => handleQuickAction(action)}
                disabled={sendInput.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-card text-sm hover:bg-accent disabled:opacity-50"
              >
                <action.icon className="h-3.5 w-3.5" />
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Terminal */}
      <div className="flex-1 rounded-lg border bg-[#1a1b26] overflow-hidden min-h-0">
        <div ref={terminalRef} className="h-full w-full p-2" />
      </div>

      {/* Input Area */}
      {isActive && (
        <div className="flex-shrink-0 mt-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message or command..."
              disabled={sendInput.isPending}
              className="flex-1 rounded-md border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
            <button
              onClick={handleSendInput}
              disabled={!inputValue.trim() || sendInput.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Press Enter to send. Use arrow keys for command history.
          </p>
        </div>
      )}
    </div>
  );
}
