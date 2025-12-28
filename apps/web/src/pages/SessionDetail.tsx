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
import { SessionSummaryCard, SessionActivityFeed, ReviewReportPanel } from '@/components/session';
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
  Sparkles,
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
} from 'lucide-react';

const statusConfig: Record<SessionStatus, { label: string; color: string; bgColor: string; icon: typeof Play }> = {
  running: { label: 'Running', color: 'text-green-700', bgColor: 'bg-green-100', icon: Play },
  paused: { label: 'Paused', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Clock },
  completed: { label: 'Completed', color: 'text-gray-700', bgColor: 'bg-gray-100', icon: Square },
  error: { label: 'Error', color: 'text-red-700', bgColor: 'bg-red-100', icon: AlertCircle },
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
  const { connectionState, unsubscribe, lastMessage, sendMessage, ptyAttach, ptyDetach, ptyWrite, ptyResize, ptySelectPane } = useWebSocket();
  const [isPtyAttached, setIsPtyAttached] = useState(false);
  const [useLegacyMode, setUseLegacyMode] = useState(false);
  const [isTerminalReady, setIsTerminalReady] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const [inputValue, setInputValue] = useState('');
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isWaiting, setIsWaiting] = useState(false);
  const [contextPercent, setContextPercent] = useState<number | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisTab, setAnalysisTab] = useState<'summary' | 'activity' | 'review'>('summary');

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
      convertEol: false, // Critical for tmux output!
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Initial message
    terminal.writeln('\x1b[90mConnecting to terminal...\x1b[0m');

    // Focus terminal for keyboard input
    terminal.focus();

    // Mark terminal as ready
    setIsTerminalReady(true);

    return () => {
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      setIsTerminalReady(false);
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

  // Attach to session via PTY for true terminal emulation
  useEffect(() => {
    if (sessionId && connectionState === 'connected' && isTerminalReady && fitAddonRef.current) {
      // Get terminal dimensions
      const dims = fitAddonRef.current.proposeDimensions();
      const cols = dims?.cols ?? 80;
      const rows = dims?.rows ?? 24;

      console.log('[Terminal] Attaching PTY:', { sessionId, cols, rows, connectionState, isTerminalReady });

      // Attach via PTY - this also subscribes to session updates internally
      // Note: Don't call subscribe() separately as that sends initial buffer output
      // which conflicts with PTY real-time output
      ptyAttach(sessionId, cols, rows);

      return () => {
        console.log('[Terminal] Detaching PTY:', { sessionId });
        ptyDetach(sessionId);
        // Unsubscribe to clean up session subscription (ptyAttach added it, ptyDetach doesn't remove it)
        unsubscribe(sessionId);
        setIsPtyAttached(false);
      };
    }
  }, [sessionId, connectionState, isTerminalReady, ptyAttach, ptyDetach, unsubscribe]);

  // Handle terminal keyboard input - send to PTY or legacy mode
  useEffect(() => {
    if (!xtermRef.current || !sessionId) return;

    const terminal = xtermRef.current;

    // onData fires for all terminal input (keyboard, paste, etc.)
    const disposable = terminal.onData((data) => {
      console.log('[Terminal] onData:', { data, isPtyAttached, useLegacyMode, sessionId });
      if (isPtyAttached) {
        // Send data directly to PTY
        ptyWrite(sessionId, data);
      } else if (useLegacyMode) {
        // Legacy mode: use session:keys with hex encoding
        sendMessage({
          type: 'session:keys',
          payload: { sessionId, keys: data },
        });
      } else {
        console.warn('[Terminal] Not connected, input dropped');
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [sessionId, isPtyAttached, useLegacyMode, ptyWrite, sendMessage]);

  // Handle terminal resize
  useEffect(() => {
    if (!fitAddonRef.current || !sessionId || !isPtyAttached) return;

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims) {
          ptyResize(sessionId, dims.cols, dims.rows);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sessionId, isPtyAttached, ptyResize]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage || !xtermRef.current) return;

    // Log all messages for debugging
    if (lastMessage.type.startsWith('pty:') || lastMessage.type === 'error') {
      console.log('[Terminal] WebSocket message:', lastMessage.type, lastMessage.payload);
    }

    // Handle PTY attachment failure - fall back to legacy mode
    if (lastMessage.type === 'error') {
      const payload = lastMessage.payload as { code: string; message: string };
      if (payload.code === 'PTY_ATTACH_FAILED' && !useLegacyMode) {
        console.warn('[Terminal] PTY not available, switching to legacy mode');
        setUseLegacyMode(true);
        xtermRef.current.writeln('\x1b[33mPTY not available (Rosetta detected). Using legacy mode.\x1b[0m');
        xtermRef.current.writeln('\x1b[90mFor best experience, use ARM-native Node.js.\x1b[0m');
      }
    }

    // PTY output - real-time streaming from the terminal
    if (lastMessage.type === 'pty:output') {
      const payload = lastMessage.payload as { sessionId: string; data: string };
      if (payload.sessionId === sessionId) {
        // Write data directly to terminal - no clearing needed with PTY
        xtermRef.current.write(payload.data);
      }
    }

    // PTY attached confirmation
    if (lastMessage.type === 'pty:attached') {
      const payload = lastMessage.payload as { sessionId: string; cols: number; rows: number };
      console.log('[Terminal] PTY attached message received:', payload);
      if (payload.sessionId === sessionId) {
        console.log('[Terminal] Setting isPtyAttached = true');
        setIsPtyAttached(true);
        xtermRef.current.clear();
        xtermRef.current.writeln('\x1b[32mTerminal connected.\x1b[0m');
      }
    }

    // PTY exit notification
    if (lastMessage.type === 'pty:exit') {
      const payload = lastMessage.payload as { sessionId: string; exitCode: number };
      if (payload.sessionId === sessionId) {
        setIsPtyAttached(false);
        xtermRef.current.writeln(`\x1b[33m\r\nTerminal disconnected (exit code: ${payload.exitCode})\x1b[0m`);
      }
    }

    // Legacy session:output (fallback for polling-based output when PTY is unavailable)
    if (lastMessage.type === 'session:output' && (useLegacyMode || !isPtyAttached)) {
      const payload = lastMessage.payload as { sessionId: string; lines: string[]; raw: boolean };
      if (payload.sessionId === sessionId) {
        // Reset terminal and show current snapshot
        xtermRef.current.write('\x1b[H\x1b[2J');
        const output = payload.lines.join('\r\n');
        xtermRef.current.write(output);
      }
    }

    if (lastMessage.type === 'session:status') {
      const payload = lastMessage.payload as { sessionId: string; newStatus: string; contextPercent?: number };
      if (payload.sessionId === sessionId) {
        if (payload.contextPercent !== undefined) {
          setContextPercent(payload.contextPercent);
        }
        refetch();
      }
    }

    if (lastMessage.type === 'session:waiting') {
      const payload = lastMessage.payload as { sessionId: string; waiting: boolean };
      if (payload.sessionId === sessionId) {
        setIsWaiting(payload.waiting);
      }
    }
  }, [lastMessage, sessionId, refetch, isPtyAttached, useLegacyMode]);

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

  const handleFocusPane = useCallback(() => {
    if (!sessionId) return;
    ptySelectPane(sessionId);
  }, [sessionId, ptySelectPane]);

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
  const isActive = session.status === 'running' || session.status === 'paused';
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

            {/* Analysis Panel Toggle */}
            <button
              onClick={() => setShowAnalysis(!showAnalysis)}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                showAnalysis
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
              )}
            >
              {showAnalysis ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
              <Sparkles className="h-4 w-4" />
              AI Analysis
            </button>

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

      {/* Main Content Area */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Terminal */}
        <div
          className={cn(
            'flex-1 rounded-lg border bg-[#1a1b26] overflow-hidden cursor-text transition-all relative',
            showAnalysis ? 'w-2/3' : 'w-full'
          )}
          onClick={() => xtermRef.current?.focus()}
        >
          <div ref={terminalRef} className="h-full w-full p-2" />
          {/* Focus Pane Button */}
          {isPtyAttached && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleFocusPane();
              }}
              className="absolute top-2 right-2 p-2 rounded-md bg-gray-700/80 hover:bg-gray-600 text-gray-200 transition-colors"
              title="Focus & zoom this pane in tmux"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Analysis Panel */}
        {showAnalysis && (
          <div className="w-1/3 min-w-[320px] max-w-[480px] flex flex-col gap-4 overflow-y-auto">
            {/* Tab Navigation */}
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
              {(['summary', 'activity', 'review'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setAnalysisTab(tab)}
                  className={cn(
                    'flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize',
                    analysisTab === tab
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
              {analysisTab === 'summary' && (
                <SessionSummaryCard sessionId={sessionId!} />
              )}
              {analysisTab === 'activity' && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-700">
                    <h3 className="text-sm font-medium text-gray-200">Activity Feed</h3>
                  </div>
                  <SessionActivityFeed sessionId={sessionId!} maxEvents={30} />
                </div>
              )}
              {analysisTab === 'review' && session.ticket_id && (
                <ReviewReportPanel sessionId={sessionId!} />
              )}
              {analysisTab === 'review' && !session.ticket_id && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 text-center">
                  <p className="text-gray-400 text-sm">
                    Review reports are only available for sessions with associated tickets.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
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
