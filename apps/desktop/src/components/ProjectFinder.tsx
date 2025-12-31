/**
 * ProjectFinder - Fuzzy search modal for quick project navigation
 * Triggered by 'f p' keyboard shortcut
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';
import { cn } from '../lib/utils';
import { Search, Folder, ArrowRight } from 'lucide-react';

interface ProjectFinderProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectFinder({ isOpen, onClose }: ProjectFinderProps) {
  const navigate = useNavigate();
  const { data } = useProjects();
  const projects = data?.data ?? [];

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fuzzy filter projects
  const filteredProjects = useMemo(() => {
    if (!query.trim()) return projects;

    const lowerQuery = query.toLowerCase();
    return projects
      .map((project) => {
        // Calculate match score
        const name = project.name.toLowerCase();
        const path = project.repo_path.toLowerCase();

        let score = 0;

        // Exact match gets highest score
        if (name === lowerQuery) score += 100;
        else if (name.startsWith(lowerQuery)) score += 50;
        else if (name.includes(lowerQuery)) score += 25;

        // Path matching
        if (path.includes(lowerQuery)) score += 10;

        // Fuzzy character matching
        let queryIndex = 0;
        for (const char of name) {
          if (queryIndex < lowerQuery.length && char === lowerQuery[queryIndex]) {
            score += 5;
            queryIndex++;
          }
        }

        return { project, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.project);
  }, [projects, query]);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Focus input after a short delay to ensure modal is rendered
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= filteredProjects.length) {
      setSelectedIndex(Math.max(0, filteredProjects.length - 1));
    }
  }, [filteredProjects.length, selectedIndex]);

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
          setSelectedIndex((i) => Math.min(i + 1, filteredProjects.length - 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredProjects[selectedIndex]) {
          navigate(`/projects/${filteredProjects[selectedIndex].id}`);
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
  const handleItemClick = (projectId: string) => {
    navigate(`/projects/${projectId}`);
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
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50">
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
              placeholder="Find project..."
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
            className="max-h-80 overflow-y-auto"
          >
            {filteredProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-content-muted">
                <Folder className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">
                  {query ? 'No projects found' : 'No projects yet'}
                </p>
              </div>
            ) : (
              filteredProjects.map((project, index) => (
                <div
                  key={project.id}
                  onClick={() => handleItemClick(project.id)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                    index === selectedIndex
                      ? 'bg-indigo-500/20 text-content-primary'
                      : 'hover:bg-surface-tertiary text-content-secondary'
                  )}
                >
                  <div className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-lg',
                    index === selectedIndex ? 'bg-indigo-500/30' : 'bg-surface-tertiary'
                  )}>
                    <Folder className={cn(
                      'w-4 h-4',
                      index === selectedIndex ? 'text-indigo-400' : 'text-content-muted'
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'font-medium truncate',
                      index === selectedIndex && 'text-indigo-400'
                    )}>
                      {highlightMatch(project.name, query)}
                    </p>
                    <p className="text-xs text-content-muted truncate">
                      {project.repo_path}
                    </p>
                  </div>
                  {index === selectedIndex && (
                    <ArrowRight className="w-4 h-4 text-indigo-400" />
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
            <span>{filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}</span>
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
