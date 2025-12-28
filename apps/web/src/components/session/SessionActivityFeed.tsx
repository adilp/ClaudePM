/**
 * Session Activity Feed
 * Displays parsed tool usage events from session output
 */

import { FileText, Code, Terminal, Search, Flag, AlertCircle, Loader2 } from 'lucide-react';
import { useSessionActivity } from '@/hooks/useSessions';
import type { ActivityEvent } from '@/types/api';

interface SessionActivityFeedProps {
  sessionId: string;
  maxEvents?: number;
}

const eventIcons: Record<ActivityEvent['type'], React.ReactNode> = {
  tool_use: <Code className="w-3 h-3" />,
  thinking: <FileText className="w-3 h-3" />,
  text: <FileText className="w-3 h-3" />,
  error: <AlertCircle className="w-3 h-3" />,
  milestone: <Flag className="w-3 h-3" />,
};

const toolIcons: Record<string, React.ReactNode> = {
  Read: <FileText className="w-3 h-3" />,
  Write: <Code className="w-3 h-3" />,
  Edit: <Code className="w-3 h-3" />,
  Bash: <Terminal className="w-3 h-3" />,
  Grep: <Search className="w-3 h-3" />,
};

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
      <div className="flex items-center gap-2 text-gray-400 p-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading activity...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-400 p-4">
        <AlertCircle className="w-4 h-4" />
        <span className="text-sm">Failed to load activity</span>
      </div>
    );
  }

  if (!activity || activity.events.length === 0) {
    return (
      <div className="text-gray-500 text-sm p-4">
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
        <div className="text-xs text-gray-500 px-2 py-1">
          +{activity.events.length - maxEvents} more events
        </div>
      )}
    </div>
  );
}

function ActivityEventItem({ event }: { event: ActivityEvent }) {
  const icon = event.tool ? toolIcons[event.tool] || eventIcons[event.type] : eventIcons[event.type];
  const colorClass = eventColors[event.type];

  return (
    <div className="flex items-start gap-2 px-2 py-1.5 hover:bg-gray-800/50 rounded">
      <div className={`p-1 rounded ${colorClass}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {event.tool && (
            <span className="text-xs font-medium text-gray-400">{event.tool}</span>
          )}
          {event.type === 'milestone' && (
            <span className="text-xs font-medium text-green-400">Milestone</span>
          )}
        </div>
        <p className="text-sm text-gray-300 truncate">{event.description}</p>
      </div>
      <time className="text-xs text-gray-500 whitespace-nowrap">
        {new Date(event.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })}
      </time>
    </div>
  );
}

export default SessionActivityFeed;
