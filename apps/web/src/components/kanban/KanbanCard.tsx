/**
 * Kanban Card
 * Draggable ticket card for the sprint board
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from 'react-router-dom';
import { GripVertical, FileText } from 'lucide-react';
import type { Ticket } from '@/types/api';

interface KanbanCardProps {
  ticket: Ticket;
  projectId: string;
}

export function KanbanCard({ ticket, projectId }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: ticket.id,
    data: {
      type: 'ticket',
      ticket,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative rounded-lg border bg-card p-3 shadow-sm
        hover:border-primary/50 hover:shadow-md transition-all
        ${isDragging ? 'opacity-50 shadow-lg ring-2 ring-primary' : ''}
      `}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-opacity"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Card Content */}
      <Link
        to={`/projects/${projectId}/tickets/${ticket.id}`}
        className="block pl-5"
      >
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
      </Link>
    </div>
  );
}
