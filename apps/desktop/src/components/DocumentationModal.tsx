/**
 * Documentation Modal
 * Full-page modal for browsing project documentation with keyboard navigation
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { cn } from '../lib/utils.js';
import { MarkdownContent } from './MarkdownContent.js';
import { useDocsTree, useDocContent, type DocTreeItem } from '../hooks/useDocsApi.js';
import { getApiUrl } from '../services/api.js';

interface DocumentationModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

// Flatten tree for keyboard navigation
interface FlatTreeItem {
  item: DocTreeItem;
  depth: number;
  isExpanded: boolean;
  isVisible: boolean;
  parentPath: string | null;
}

function flattenTree(
  items: DocTreeItem[],
  expandedPaths: Set<string>,
  depth = 0,
  parentPath: string | null = null,
  isParentVisible = true
): FlatTreeItem[] {
  const result: FlatTreeItem[] = [];

  for (const item of items) {
    const isExpanded = item.type === 'directory' && expandedPaths.has(item.path);
    const isVisible = isParentVisible;

    result.push({
      item,
      depth,
      isExpanded,
      isVisible,
      parentPath,
    });

    if (item.type === 'directory' && item.children) {
      const childItems = flattenTree(
        item.children,
        expandedPaths,
        depth + 1,
        item.path,
        isExpanded && isVisible
      );
      result.push(...childItems);
    }
  }

  return result;
}

function TreeItem({
  item,
  depth,
  isExpanded,
  isSelected,
  onClick,
  onToggle,
}: {
  item: DocTreeItem;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  onClick: () => void;
  onToggle: () => void;
}) {
  const isDirectory = item.type === 'directory';

  return (
    <button
      type="button"
      className={cn(
        'w-full text-left px-3 py-1.5 rounded-md flex items-center gap-2 text-sm transition-colors',
        isSelected
          ? 'bg-indigo-500/20 text-indigo-300'
          : 'text-content-secondary hover:bg-surface-tertiary hover:text-content-primary'
      )}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
      onClick={(e) => {
        e.preventDefault();
        if (isDirectory) {
          onToggle();
        } else {
          onClick();
        }
      }}
    >
      {isDirectory ? (
        <>
          <svg
            className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-90')}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <svg className="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </>
      ) : (
        <>
          <span className="w-4" /> {/* Spacer for alignment */}
          <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </>
      )}
      <span className="truncate">{item.name}</span>
    </button>
  );
}

export function DocumentationModal({ projectId, isOpen, onClose }: DocumentationModalProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState<string>('');
  const treeContainerRef = useRef<HTMLDivElement>(null);

  const { data: treeData, isLoading: isTreeLoading, error: treeError } = useDocsTree(projectId);
  const { data: contentData, isLoading: isContentLoading } = useDocContent(projectId, selectedFilePath);

  // Get API URL for image rendering
  useEffect(() => {
    getApiUrl().then(setApiUrl);
  }, []);

  // Flatten tree with visibility
  const flatTree = useMemo(() => {
    if (!treeData?.tree) return [];
    return flattenTree(treeData.tree, expandedPaths);
  }, [treeData?.tree, expandedPaths]);

  // Get only visible items for navigation
  const visibleItems = useMemo(() => {
    return flatTree.filter((item) => item.isVisible);
  }, [flatTree]);

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
      setSelectedFilePath(null);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (treeContainerRef.current && visibleItems.length > 0) {
      const selectedElement = treeContainerRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, visibleItems.length]);

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFilePath(path);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      const currentItem = visibleItems[selectedIndex];

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;

        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          if (selectedIndex < visibleItems.length - 1) {
            setSelectedIndex(selectedIndex + 1);
          }
          break;

        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          if (selectedIndex > 0) {
            setSelectedIndex(selectedIndex - 1);
          }
          break;

        case 'Enter':
        case 'l':
          e.preventDefault();
          if (currentItem) {
            if (currentItem.item.type === 'directory') {
              toggleExpanded(currentItem.item.path);
            } else {
              handleSelectFile(currentItem.item.path);
            }
          }
          break;

        case 'h':
          e.preventDefault();
          if (currentItem) {
            if (currentItem.item.type === 'directory' && currentItem.isExpanded) {
              // Collapse current directory
              toggleExpanded(currentItem.item.path);
            } else if (currentItem.parentPath) {
              // Go to parent directory
              const parentIndex = visibleItems.findIndex(
                (item) => item.item.path === currentItem.parentPath
              );
              if (parentIndex !== -1) {
                setSelectedIndex(parentIndex);
              }
            }
          }
          break;

        default:
          break;
      }
    },
    [isOpen, onClose, selectedIndex, visibleItems, toggleExpanded, handleSelectFile]
  );

  // Add keyboard listener
  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-primary">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface-secondary">
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-indigo-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <h1 className="text-lg font-semibold text-content-primary">Project Docs</h1>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-md text-content-secondary hover:text-content-primary hover:bg-surface-tertiary transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Tree navigation */}
        <div className="w-64 flex-shrink-0 border-r border-line bg-surface-secondary overflow-hidden flex flex-col">
          <div className="p-3 border-b border-line">
            <h2 className="text-sm font-medium text-content-secondary">Files</h2>
          </div>
          <div ref={treeContainerRef} className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {isTreeLoading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <div className="w-6 h-6 border-2 border-surface-tertiary border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-sm text-content-muted">Loading docs...</p>
              </div>
            ) : treeError ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-center px-4">
                <svg
                  className="w-8 h-8 text-red-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <p className="text-sm text-content-secondary">
                  {treeError instanceof Error ? treeError.message : 'Failed to load documentation'}
                </p>
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-center px-4">
                <svg
                  className="w-8 h-8 text-content-muted"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
                <p className="text-sm text-content-secondary">No documentation found</p>
                <p className="text-xs text-content-muted">
                  Add a docs/ folder to your project
                </p>
              </div>
            ) : (
              visibleItems.map((flatItem, index) => (
                <div key={flatItem.item.path} data-index={index}>
                  <TreeItem
                    item={flatItem.item}
                    depth={flatItem.depth}
                    isExpanded={flatItem.isExpanded}
                    isSelected={index === selectedIndex}
                    onClick={() => {
                      setSelectedIndex(index);
                      handleSelectFile(flatItem.item.path);
                    }}
                    onToggle={() => {
                      setSelectedIndex(index);
                      toggleExpanded(flatItem.item.path);
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right panel - Content viewer */}
        <div className="flex-1 overflow-y-auto bg-surface-primary">
          {selectedFilePath ? (
            isContentLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="w-8 h-8 border-2 border-surface-tertiary border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-content-secondary">Loading document...</p>
              </div>
            ) : contentData ? (
              <div className="max-w-4xl mx-auto p-8">
                <div className="mb-4 pb-4 border-b border-line">
                  <h2 className="text-xl font-semibold text-content-primary">{contentData.name}</h2>
                  <p className="text-sm text-content-muted">{contentData.path}</p>
                </div>
                <MarkdownContent projectId={projectId} baseUrl={apiUrl}>
                  {contentData.content}
                </MarkdownContent>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
                <svg
                  className="w-12 h-12 text-red-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <p className="text-content-secondary">Failed to load document</p>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
              <svg
                className="w-16 h-16 text-content-muted"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <div>
                <p className="text-lg font-medium text-content-primary">Select a document</p>
                <p className="text-sm text-content-muted mt-1">
                  Use the tree on the left to browse documentation
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar - Keyboard hints */}
      <div className="flex items-center gap-6 px-6 py-3 border-t border-line bg-surface-secondary">
        <div className="flex items-center gap-4 text-xs text-content-muted">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-surface-tertiary rounded text-content-secondary">j</kbd>
            <kbd className="px-1.5 py-0.5 bg-surface-tertiary rounded text-content-secondary">k</kbd>
            <span>Navigate</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-surface-tertiary rounded text-content-secondary">Enter</kbd>
            <span>Open</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-surface-tertiary rounded text-content-secondary">h</kbd>
            <kbd className="px-1.5 py-0.5 bg-surface-tertiary rounded text-content-secondary">l</kbd>
            <span>Collapse/Expand</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-surface-tertiary rounded text-content-secondary">/</kbd>
            <span className="opacity-50">Search (coming soon)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-surface-tertiary rounded text-content-secondary">Esc</kbd>
            <span>Close</span>
          </span>
        </div>
      </div>
    </div>
  );
}
