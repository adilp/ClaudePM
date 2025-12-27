/**
 * Sessions List Page
 */

import { Link } from 'react-router-dom';
import { useSessions } from '@/hooks/useSessions';
import { useTmuxSessions } from '@/hooks/useTmux';
import { useWebSocket } from '@/hooks/useWebSocket';
import { cn } from '@/lib/utils';
import type { SessionStatus } from '@/types/api';
import {
  Play,
  Square,
  Clock,
  AlertCircle,
  Terminal,
  Activity,
  RefreshCw,
  Monitor,
  Layers,
} from 'lucide-react';

const statusConfig: Record<SessionStatus, { label: string; color: string; bgColor: string; icon: typeof Play }> = {
  starting: { label: 'Starting', color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: Clock },
  running: { label: 'Running', color: 'text-green-700', bgColor: 'bg-green-100', icon: Play },
  waiting: { label: 'Waiting', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: AlertCircle },
  stopped: { label: 'Stopped', color: 'text-gray-700', bgColor: 'bg-gray-100', icon: Square },
};

export function Sessions() {
  const { data: sessions, isLoading: sessionsLoading, error: sessionsError } = useSessions();
  const { data: tmuxSessions, isLoading: tmuxLoading, error: tmuxError, refetch: refetchTmux } = useTmuxSessions();
  const { connectionState } = useWebSocket();

  const activeSessions = sessions?.filter(s => s.status !== 'stopped') ?? [];
  const stoppedSessions = sessions?.filter(s => s.status === 'stopped') ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sessions</h1>
          <p className="text-muted-foreground">Monitor and control Claude sessions</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
            connectionState === 'connected' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
          )}>
            <Activity className="h-3 w-3" />
            {connectionState === 'connected' ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </div>

      {/* tmux Sessions Discovery */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Monitor className="h-5 w-5 text-purple-500" />
            tmux Sessions
            <span className="text-muted-foreground font-normal">
              ({tmuxSessions?.length ?? 0})
            </span>
          </h2>
          <button
            onClick={() => refetchTmux()}
            disabled={tmuxLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', tmuxLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {tmuxError ? (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-center">
            <p className="text-destructive text-sm">Failed to load tmux sessions</p>
          </div>
        ) : tmuxLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : tmuxSessions && tmuxSessions.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tmuxSessions.map((session) => (
              <div
                key={session.name}
                className="flex items-center gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className={cn(
                  'rounded-lg p-2',
                  session.attached ? 'bg-green-100' : 'bg-gray-100'
                )}>
                  <Terminal className={cn(
                    'h-5 w-5',
                    session.attached ? 'text-green-600' : 'text-gray-500'
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{session.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Layers className="h-3 w-3" />
                      {session.windows} window{session.windows !== 1 ? 's' : ''}
                    </span>
                    {session.attached && (
                      <span className="text-green-600 font-medium">attached</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-6 text-center">
            <Terminal className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No tmux sessions found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create a tmux session in your terminal
            </p>
          </div>
        )}
      </div>

      {/* Managed Sessions */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          Managed Sessions
          <span className="text-muted-foreground font-normal">({activeSessions.length})</span>
        </h2>

        {sessionsError ? (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-center">
            <p className="text-destructive text-sm">Failed to load managed sessions</p>
          </div>
        ) : sessionsLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : activeSessions.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center">
            <Terminal className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No active managed sessions</p>
            <p className="text-sm text-muted-foreground mt-1">
              Start a session from a project or ticket
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {activeSessions.map((session) => {
              const config = statusConfig[session.status];
              const StatusIcon = config.icon;

              return (
                <Link
                  key={session.id}
                  to={`/sessions/${session.id}`}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn('rounded-lg p-2', config.bgColor)}>
                      <StatusIcon className={cn('h-5 w-5', config.color)} />
                    </div>
                    <div>
                      <p className="font-medium font-mono text-sm">{session.id.slice(0, 8)}...</p>
                      <p className="text-sm text-muted-foreground">
                        {session.ticket_id ? `Ticket: ${session.ticket_id.slice(0, 8)}...` : 'Ad-hoc session'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Context Meter */}
                    {session.context_percent !== null && (
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              session.context_percent > 80 ? 'bg-red-500' :
                              session.context_percent > 60 ? 'bg-yellow-500' : 'bg-green-500'
                            )}
                            style={{ width: `${session.context_percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8">
                          {session.context_percent}%
                        </span>
                      </div>
                    )}

                    {/* Status Badge */}
                    <span className={cn(
                      'px-2 py-1 rounded-full text-xs font-medium',
                      config.bgColor,
                      config.color
                    )}>
                      {config.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Stopped Sessions */}
      {stoppedSessions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-gray-400" />
            Recent Sessions
            <span className="text-muted-foreground font-normal">({stoppedSessions.length})</span>
          </h2>

          <div className="grid gap-2">
            {stoppedSessions.slice(0, 10).map((session) => (
              <Link
                key={session.id}
                to={`/sessions/${session.id}`}
                className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Square className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="font-mono text-sm text-muted-foreground">{session.id.slice(0, 8)}...</p>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  {session.ended_at ? new Date(session.ended_at).toLocaleString() : 'Unknown'}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
