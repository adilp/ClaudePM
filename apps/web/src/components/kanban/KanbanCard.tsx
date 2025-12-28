/**
 * Kanban Card
 * Draggable ticket card for the sprint board
 */

import { useDraggable } from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import { GripVertical, FileText } from 'lucide-react';
import type { Ticket } from '@/types/api';

interface KanbanCardProps {
  ticket: Ticket;
  projectId: string;
}

export function KanbanCard({ ticket, projectId }: KanbanCardProps) {
  const navigate = useNavigate();
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={`
        group relative rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing
        hover:border-primary/50 hover:shadow-md transition-colors transition-shadow
        ${isDragging ? 'shadow-lg ring-2 ring-primary z-50' : ''}
      `}
    >
      {/* Drag Handle Icon (visual indicator) */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100 text-muted-foreground transition-opacity">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Card Content */}
      <div className="block pl-5">
        <div className="flex items-start gap-2">
          <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
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
