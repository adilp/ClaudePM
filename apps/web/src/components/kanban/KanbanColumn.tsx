/**
 * Kanban Column
 * A swim lane for tickets in a specific state
 */

import { useDroppable } from '@dnd-kit/core';
import { KanbanCard } from './KanbanCard';
import type { Ticket, TicketState } from '@/types/api';
import { cn } from '@/lib/utils';
import { Clock, Play, AlertCircle, CheckCircle } from 'lucide-react';

interface KanbanColumnProps {
  state: TicketState;
  tickets: Ticket[];
  projectId: string;
}

const columnConfig: Record<TicketState, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: typeof Clock;
}> = {
  backlog: {
    label: 'Backlog',
    color: 'text-gray-700 dark:text-gray-300',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    borderColor: 'border-gray-300 dark:border-gray-600',
    icon: Clock
  },
  in_progress: {
    label: 'In Progress',
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    borderColor: 'border-blue-300 dark:border-blue-600',
    icon: Play
  },
  review: {
    label: 'Review',
    color: 'text-yellow-700 dark:text-yellow-300',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    borderColor: 'border-yellow-300 dark:border-yellow-600',
    icon: AlertCircle
  },
  done: {
    label: 'Done',
    color: 'text-green-700 dark:text-green-300',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    borderColor: 'border-green-300 dark:border-green-600',
    icon: CheckCircle
  },
};

export function KanbanColumn({ state, tickets, projectId }: KanbanColumnProps) {
  const config = columnConfig[state];
  const Icon = config.icon;

  const { setNodeRef, isOver } = useDroppable({
    id: state,
    data: {
      type: 'column',
      state,
    },
  });

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border-2 min-h-[500px] w-72 flex-shrink-0',
        config.borderColor,
        isOver && 'ring-2 ring-primary'
      )}
    >
      {/* Column Header */}
      <div className={cn('px-3 py-2 rounded-t-md', config.bgColor)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn('h-4 w-4', config.color)} />
            <span className={cn('font-semibold text-sm', config.color)}>
              {config.label}
            </span>
          </div>
          <span className={cn(
            'px-2 py-0.5 rounded-full text-xs font-medium',
            config.bgColor,
            config.color
          )}>
            {tickets.length}
          </span>
        </div>
      </div>

      {/* Cards Container */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 p-2 space-y-2 overflow-y-auto',
          isOver && 'bg-primary/5'
        )}
      >
        {tickets.map((ticket) => (
          <KanbanCard
            key={ticket.id}
            ticket={ticket}
            projectId={projectId}
          />
        ))}

        {tickets.length === 0 && (
          <div className="flex items-center justify-center h-24 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
            Drop tickets here
          </div>
        )}
      </div>
    </div>
  );
}
