/**
 * Kanban Board
 * Sprint board with drag-and-drop functionality
 */

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { KanbanColumn } from './KanbanColumn';
import { useUpdateTicketState } from '@/hooks/useTickets';
import { useSessions } from '@/hooks/useSessions';
import type { Ticket, TicketState } from '@/types/api';
import { FileText } from 'lucide-react';

interface KanbanBoardProps {
  tickets: Ticket[];
  projectId: string;
}

const STATES: TicketState[] = ['backlog', 'in_progress', 'review', 'done'];

export function KanbanBoard({ tickets, projectId }: KanbanBoardProps) {
  const updateTicketState = useUpdateTicketState();
  const { data: sessions } = useSessions(projectId);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);

  // Get set of ticket IDs that have a running session
  const ticketsWithRunningSession = new Set(
    sessions
      ?.filter((s) => s.status === 'running' && s.ticket_id)
      .map((s) => s.ticket_id!) ?? []
  );

  // Group tickets by state
  const ticketsByState = STATES.reduce(
    (acc, state) => {
      acc[state] = tickets.filter((t) => t.state === state);
      return acc;
    },
    {} as Record<TicketState, Ticket[]>
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 2, // 2px movement required before drag starts
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const ticket = tickets.find((t) => t.id === active.id);
    if (ticket) {
      setActiveTicket(ticket);
    }
  };

  const handleDragOver = () => {
    // Could be used for real-time visual feedback
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTicket(null);

    if (!over) return;

    const ticketId = active.id as string;
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;

    // Determine the target state
    let targetState: TicketState | null = null;

    // Check if dropped on a column
    if (STATES.includes(over.id as TicketState)) {
      targetState = over.id as TicketState;
    }
    // Check if dropped on another ticket (get its column)
    else {
      const overTicket = tickets.find((t) => t.id === over.id);
      if (overTicket) {
        targetState = overTicket.state;
      }
    }

    // If state changed, update it
    if (targetState && targetState !== ticket.state) {
      updateTicketState.mutate({
        ticketId,
        state: targetState,
      });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATES.map((state) => (
          <KanbanColumn
            key={state}
            state={state}
            tickets={ticketsByState[state]}
            projectId={projectId}
            ticketsWithRunningSession={ticketsWithRunningSession}
          />
        ))}
      </div>

      {/* Drag Overlay - Shows the dragged card */}
      <DragOverlay>
        {activeTicket ? (
          <div className="rounded-lg border bg-card p-3 shadow-xl ring-2 ring-primary opacity-90 w-64">
            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm leading-tight line-clamp-2">
                  {activeTicket.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {activeTicket.is_adhoc && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                      ADHOC
                    </span>
                  )}
                  {activeTicket.external_id && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {activeTicket.external_id}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
