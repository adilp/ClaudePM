/**
 * Session Activity Feed
 * Displays parsed tool usage events from session output
 */

import { cn } from '../../lib/utils';
import { useSessionActivity } from '../../hooks/useSessions';
import type { ActivityEvent } from '../../types/api';

interface SessionActivityFeedProps {
  sessionId: string;
  maxEvents?: number;
}

const eventColors: Record<ActivityEvent['type'], string> = {
  tool_use: 'text-blue-400 bg-blue-500/10',
  thinking: 'text-purple-400 bg-purple-500/10',
  text: 'text-gray-400 bg-gray-500/10',
  error: 'text-red-400 bg-red-500/10',
  milestone: 'text-green-400 bg-green-500/10',
};

export function SessionActivityFeed({ sessionId, maxEvents = 20 }: SessionActivityFeedProps) {
  const { data: activity, isLoading, error } = useSessionActivity(sessionId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-content-muted p-4">
        <LoaderIcon className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading activity...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-400 p-4">
        <AlertCircleIcon className="w-4 h-4" />
        <span className="text-sm">Failed to load activity</span>
      </div>
    );
  }

  if (!activity || activity.events.length === 0) {
    return (
      <div className="text-content-muted text-sm p-4">
        No activity detected yet
      </div>
    );
  }

  const events = activity.events.slice(0, maxEvents);

  return (
    <div className="space-y-1">
      {events.map((event, index) => (
        <ActivityEventItem key={index} event={event} />
      ))}
      {activity.events.length > maxEvents && (
        <div className="text-xs text-content-muted px-2 py-1">
          +{activity.events.length - maxEvents} more events
        </div>
      )}
    </div>
  );
}

function ActivityEventItem({ event }: { event: ActivityEvent }) {
  const icon = event.tool ? getToolIcon(event.tool) : getEventIcon(event.type);
  const colorClass = eventColors[event.type];

  return (
    <div className="flex items-start gap-2 px-2 py-1.5 hover:bg-surface-tertiary rounded">
      <div className={cn('p-1 rounded', colorClass)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {event.tool && (
            <span className="text-xs font-medium text-content-secondary">{event.tool}</span>
          )}
          {event.type === 'milestone' && (
            <span className="text-xs font-medium text-green-400">Milestone</span>
          )}
        </div>
        <p className="text-sm text-content-primary truncate">{event.description}</p>
      </div>
      <time className="text-xs text-content-muted whitespace-nowrap">
        {new Date(event.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })}
      </time>
    </div>
  );
}

function getToolIcon(tool: string) {
  switch (tool) {
    case 'Read':
      return <FileTextIcon className="w-3 h-3" />;
    case 'Write':
    case 'Edit':
      return <CodeIcon className="w-3 h-3" />;
    case 'Bash':
      return <TerminalIcon className="w-3 h-3" />;
    case 'Grep':
    case 'Glob':
      return <SearchIcon className="w-3 h-3" />;
    default:
      return <CodeIcon className="w-3 h-3" />;
  }
}

function getEventIcon(type: ActivityEvent['type']) {
  switch (type) {
    case 'tool_use':
      return <CodeIcon className="w-3 h-3" />;
    case 'thinking':
      return <FileTextIcon className="w-3 h-3" />;
    case 'text':
      return <FileTextIcon className="w-3 h-3" />;
    case 'error':
      return <AlertCircleIcon className="w-3 h-3" />;
    case 'milestone':
      return <FlagIcon className="w-3 h-3" />;
    default:
      return <FileTextIcon className="w-3 h-3" />;
  }
}

// Icon components
function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function AlertCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

function LoaderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

export default SessionActivityFeed;
