/**
 * TicketFinder - Fuzzy search modal for quick ticket navigation
 * Triggered by 'f t' keyboard shortcut
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';
import { cn } from '../lib/utils';
import { Search, FileText, ArrowRight, Folder } from 'lucide-react';
import type { Ticket } from '../types/api';

interface TicketFinderProps {
  isOpen: boolean;
  onClose: () => void;
}

// Fetch all tickets from all projects
function useAllTickets() {
  const { data: projectsData } = useProjects();
  const projects = projectsData?.data ?? [];

  // We need to fetch tickets for each project
  // For simplicity, we'll use the API directly
  const [tickets, setTickets] = useState<(Ticket & { projectName: string; projectId: string })[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (projects.length === 0) return;

    const fetchAllTickets = async () => {
      setIsLoading(true);
      try {
        const allTickets: (Ticket & { projectName: string; projectId: string })[] = [];

        // Fetch tickets from each project
        for (const project of projects) {
          try {
            const baseUrl = localStorage.getItem('claude-pm-server-url') || 'http://localhost:4847';
            const response = await fetch(`${baseUrl}/api/projects/${project.id}/tickets`);
            if (response.ok) {
              const data = await response.json();
              const projectTickets = (data.data || []).map((t: Ticket) => ({
                ...t,
                projectName: project.name,
                projectId: project.id,
              }));
              allTickets.push(...projectTickets);
            }
          } catch {
            // Skip failed project
          }
        }

        setTickets(allTickets);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllTickets();
  }, [projects]);

  return { tickets, isLoading };
}

export function TicketFinder({ isOpen, onClose }: TicketFinderProps) {
  const navigate = useNavigate();
  const { tickets, isLoading } = useAllTickets();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter tickets - prioritize exact matches, then substring matches
  const filteredTickets = useMemo(() => {
    if (!query.trim()) return tickets.slice(0, 50); // Limit initial results

    const lowerQuery = query.toLowerCase().trim();
    const queryWords = lowerQuery.split(/\s+/);

    return tickets
      .map((ticket) => {
        const title = ticket.title.toLowerCase();
        const externalId = (ticket.external_id || '').toLowerCase();
        const projectName = ticket.projectName.toLowerCase();

        let score = 0;

        // External ID matching (highest priority)
        if (externalId === lowerQuery) score += 1000;
        else if (externalId.startsWith(lowerQuery)) score += 500;
        else if (externalId.includes(lowerQuery)) score += 200;

        // Title exact match
        if (title === lowerQuery) score += 400;
        // Title starts with query
        else if (title.startsWith(lowerQuery)) score += 300;
        // Title contains query as substring
        else if (title.includes(lowerQuery)) score += 150;
        // All query words appear in title (in any order)
        else if (queryWords.every(word => title.includes(word))) score += 100;
        // Some query words appear in title
        else {
          const matchedWords = queryWords.filter(word => title.includes(word));
          score += matchedWords.length * 30;
        }

        // Project name contains query (lower priority)
        if (projectName.includes(lowerQuery)) score += 20;

        return { ticket, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50) // Limit results
      .map((item) => item.ticket);
  }, [tickets, query]);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= filteredTickets.length) {
      setSelectedIndex(Math.max(0, filteredTickets.length - 1));
    }
  }, [filteredTickets.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
      selectedEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'Tab':
        if (!e.shiftKey) {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredTickets.length - 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredTickets[selectedIndex]) {
          const ticket = filteredTickets[selectedIndex];
          navigate(`/projects/${ticket.projectId}/tickets/${ticket.id}`);
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  // Handle item click
  const handleItemClick = (ticket: typeof filteredTickets[0]) => {
    navigate(`/projects/${ticket.projectId}/tickets/${ticket.id}`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl z-50">
        <div className="bg-surface-secondary border border-line rounded-xl shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
            <Search className="w-5 h-5 text-content-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Find ticket by ID or title..."
              className="flex-1 bg-transparent text-content-primary placeholder:text-content-muted outline-none text-lg"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
            />
            <kbd className="px-2 py-0.5 bg-surface-tertiary rounded text-xs font-mono text-content-muted">
              esc
            </kbd>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            className="max-h-96 overflow-y-auto"
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-surface-tertiary border-t-indigo-500 rounded-full animate-spin" />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-content-muted">
                <FileText className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">
                  {query ? 'No tickets found' : 'No tickets yet'}
                </p>
              </div>
            ) : (
              filteredTickets.map((ticket, index) => (
                <div
                  key={ticket.id}
                  onClick={() => handleItemClick(ticket)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                    index === selectedIndex
                      ? 'bg-indigo-500/20 text-content-primary'
                      : 'hover:bg-surface-tertiary text-content-secondary'
                  )}
                >
                  <div className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-lg shrink-0',
                    index === selectedIndex ? 'bg-indigo-500/30' : 'bg-surface-tertiary'
                  )}>
                    <FileText className={cn(
                      'w-4 h-4',
                      index === selectedIndex ? 'text-indigo-400' : 'text-content-muted'
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {ticket.external_id && (
                        <span className={cn(
                          'font-mono text-xs shrink-0',
                          index === selectedIndex ? 'text-indigo-400' : 'text-content-muted'
                        )}>
                          {ticket.external_id}
                        </span>
                      )}
                      <p className={cn(
                        'font-medium truncate',
                        index === selectedIndex && 'text-indigo-400'
                      )}>
                        {highlightMatch(ticket.title, query)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-content-muted mt-0.5">
                      <Folder className="w-3 h-3" />
                      <span className="truncate">{ticket.projectName}</span>
                      <span className="mx-1">·</span>
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-medium',
                        ticket.state === 'done' && 'bg-green-500/20 text-green-400',
                        ticket.state === 'in_progress' && 'bg-blue-500/20 text-blue-400',
                        ticket.state === 'review' && 'bg-yellow-500/20 text-yellow-400',
                        ticket.state === 'backlog' && 'bg-gray-500/20 text-gray-400'
                      )}>
                        {ticket.state.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  {index === selectedIndex && (
                    <ArrowRight className="w-4 h-4 text-indigo-400 shrink-0" />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-line text-xs text-content-muted">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-surface-tertiary rounded font-mono">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-surface-tertiary rounded font-mono">↵</kbd>
                open
              </span>
            </div>
            <span>{filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    </>
  );
}

// Highlight matching characters in text
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  return (
    <>
      {text.slice(0, index)}
      <span className="text-indigo-400 font-semibold">
        {text.slice(index, index + query.length)}
      </span>
      {text.slice(index + query.length)}
    </>
  );
}
