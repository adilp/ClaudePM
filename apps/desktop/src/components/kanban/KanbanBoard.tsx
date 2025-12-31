/**
 * Kanban Board
 * Sprint board with drag-and-drop functionality
 */

import { useState, useMemo, useCallback } from 'react';
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
import { FilterChips } from './FilterChips';
import { useUpdateTicketState } from '../../hooks/useTickets';
import { useSessions } from '../../hooks/useSessions';
import { useUIStore } from '../../stores/uiStore';
import type { Ticket, TicketState } from '../../types/api';
import { FileText, Search } from 'lucide-react';

interface KanbanBoardProps {
  tickets: Ticket[];
  projectId: string;
  selectedColumnIndex?: number;
  selectedTicketIndex?: number;
}

const STATES: TicketState[] = ['backlog', 'in_progress', 'review', 'done'];

export function KanbanBoard({
  tickets,
  projectId,
  selectedColumnIndex,
  selectedTicketIndex,
}: KanbanBoardProps) {
  const updateTicketState = useUpdateTicketState();
  const { data: sessions } = useSessions(projectId);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);

  // Get persisted filters from store
  const { getKanbanFilters, setKanbanFilters } = useUIStore();
  const selectedPrefixes = getKanbanFilters(projectId);
  const handlePrefixChange = useCallback(
    (prefixes: string[]) => setKanbanFilters(projectId, prefixes),
    [projectId, setKanbanFilters]
  );

  // Get set of ticket IDs that have a running session
  const ticketsWithRunningSession = new Set(
    sessions
      ?.filter((s) => s.status === 'running' && s.ticket_id)
      .map((s) => s.ticket_id!) ?? []
  );

  // Extract unique prefixes from ticket external_ids
  const prefixes = useMemo(() => {
    const prefixSet = new Set<string>();
    tickets.forEach((ticket) => {
      if (ticket.external_id) {
        // Extract prefix (e.g., "CSM-" from "CSM-001")
        const match = ticket.external_id.match(/^([A-Z]+-)/);
        if (match) {
          prefixSet.add(match[1]);
        }
      }
    });
    return Array.from(prefixSet).sort();
  }, [tickets]);

  // Filter tickets by selected prefixes
  const filteredTickets = useMemo(() => {
    if (selectedPrefixes.length === 0) {
      return tickets;
    }
    return tickets.filter((ticket) => {
      if (!ticket.external_id) return false;
      return selectedPrefixes.some((prefix) =>
        ticket.external_id!.startsWith(prefix)
      );
    });
  }, [tickets, selectedPrefixes]);

  // Group tickets by state
  const ticketsByState = STATES.reduce(
    (acc, state) => {
      acc[state] = filteredTickets.filter((t) => t.state === state);
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
    <div className="space-y-4">
      {/* Filter chips - only show if there are multiple prefixes */}
      {prefixes.length > 1 && (
        <div className="flex justify-center">
          <FilterChips
            prefixes={prefixes}
            selectedPrefixes={selectedPrefixes}
            onSelectionChange={handlePrefixChange}
          />
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 justify-center overflow-x-auto pb-4">
          {STATES.map((state, columnIndex) => (
            <KanbanColumn
              key={state}
              state={state}
              tickets={ticketsByState[state]}
              projectId={projectId}
              ticketsWithRunningSession={ticketsWithRunningSession}
              isColumnSelected={columnIndex === selectedColumnIndex}
              selectedTicketIndex={
                columnIndex === selectedColumnIndex ? selectedTicketIndex : undefined
              }
            />
          ))}
        </div>

        {/* Drag Overlay - Shows the dragged card */}
        <DragOverlay>
          {activeTicket ? (
            <div className="rounded-lg border bg-card p-3 shadow-xl ring-2 ring-primary opacity-90 w-64">
              <div className="flex items-start gap-2">
                {activeTicket.is_explore ? (
                  <Search className="h-4 w-4 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm leading-tight line-clamp-2">
                    {activeTicket.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {activeTicket.is_adhoc && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
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
    </div>
  );
}
