/**
 * Kanban Card
 * Draggable ticket card for the sprint board
 */

import { useDraggable } from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import { GripVertical, FileText, Play, Search } from 'lucide-react';
import { useStartTicket } from '@/hooks/useTickets';
import type { Ticket } from '@/types/api';

interface KanbanCardProps {
  ticket: Ticket;
  projectId: string;
  hasRunningSession: boolean;
}

export function KanbanCard({ ticket, projectId, hasRunningSession }: KanbanCardProps) {
  const navigate = useNavigate();
  const startTicket = useStartTicket();
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: ticket.id,
    data: {
      type: 'ticket',
      ticket,
    },
  });

  // When dragging, hide the original card (DragOverlay shows the preview)
  const style = isDragging
    ? { opacity: 0.4 }
    : undefined;

  const handleClick = () => {
    // Only navigate if we're not dragging
    if (!isDragging) {
      navigate(`/projects/${projectId}/tickets/${ticket.id}`);
    }
  };

  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    startTicket.mutate(ticket.id, {
      onSuccess: (result) => {
        navigate(`/sessions/${result.session.id}`);
      },
    });
  };

  // Show Start button if ticket doesn't have a running session and is not done
  const showStartButton = !hasRunningSession && ticket.state !== 'done';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={`
        group relative rounded-lg border p-3 shadow-sm cursor-grab active:cursor-grabbing
        hover:border-primary/50 hover:shadow-md transition-colors transition-shadow
        ${ticket.is_explore ? 'bg-indigo-50 border-indigo-200' : 'bg-card'}
        ${isDragging ? 'shadow-lg ring-2 ring-primary z-50' : ''}
      `}
    >
      {/* Drag Handle Icon (visual indicator) */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100 text-muted-foreground transition-opacity">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Start Button */}
      {showStartButton && (
        <button
          onClick={handleStart}
          disabled={startTicket.isPending}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
          title="Start session"
        >
          <Play className="h-4 w-4" />
        </button>
      )}

      {/* Card Content */}
      <div className="block pl-5 pr-6">
        <div className="flex items-start gap-2">
          {ticket.is_explore ? (
            <Search className="h-4 w-4 text-indigo-600 mt-0.5 flex-shrink-0" />
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm leading-tight line-clamp-2">
              {ticket.title}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {ticket.is_adhoc && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                  ADHOC
                </span>
              )}
              {ticket.external_id && (
                <span className="text-xs text-muted-foreground font-mono">
                  {ticket.external_id}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
