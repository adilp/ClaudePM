/**
 * FileStager Component
 * Git file staging modal with vim keybindings for desktop
 * Styled like lazygit with unified tree view - color indicates staged state
 *
 * Keybindings:
 * - j/k or arrows: Navigate up/down
 * - space: Toggle stage/unstage
 * - Enter: Expand/collapse directory
 * - h/l: Collapse/expand directories
 * - a: Stage all
 * - u: Unstage all
 * - c: Focus commit message
 * - Escape: Close modal (when not in commit input)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { cn } from '../../lib/utils';
import {
  useGitStatus,
  useStageFiles,
  useUnstageFiles,
  useStageAll,
  useUnstageAll,
  useCommit,
  usePush,
  useBranchInfo,
} from '../../hooks/useGit';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { toast } from '../../hooks/use-toast';

interface FileStagerProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  initialCommitMessage?: string;
}

// Unified file node - tracks both staged and unstaged status
interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  stagedStatus?: string;   // Status in staging area (green)
  unstagedStatus?: string; // Status in working tree (red/yellow)
  children: FileNode[];
}

// Flat item for keyboard navigation
interface FlatItem {
  node: FileNode;
  depth: number;
  isExpanded: boolean;
}

// Convert git status code to display string
function getStatusDisplay(status: string, isStaged: boolean): { text: string; color: string } {
  const baseStatus = status?.toLowerCase();

  // Staged files are green, unstaged are yellow/red
  if (isStaged) {
    switch (baseStatus) {
      case 'modified':
      case 'm':
        return { text: 'M', color: 'text-green-400' };
      case 'added':
      case 'a':
        return { text: 'A', color: 'text-green-400' };
      case 'deleted':
      case 'd':
        return { text: 'D', color: 'text-green-400' };
      case 'renamed':
      case 'r':
        return { text: 'R', color: 'text-green-400' };
      case 'copied':
      case 'c':
        return { text: 'C', color: 'text-green-400' };
      default:
        return { text: status?.[0]?.toUpperCase() || '?', color: 'text-green-400' };
    }
  } else {
    switch (baseStatus) {
      case 'modified':
      case 'm':
        return { text: 'M', color: 'text-yellow-400' };
      case 'added':
      case 'a':
        return { text: 'A', color: 'text-green-400' };
      case 'deleted':
      case 'd':
        return { text: 'D', color: 'text-red-400' };
      case 'renamed':
      case 'r':
        return { text: 'R', color: 'text-purple-400' };
      case 'copied':
      case 'c':
        return { text: 'C', color: 'text-blue-400' };
      case 'untracked':
      case '?':
        return { text: '??', color: 'text-red-400' };
      default:
        return { text: status?.[0]?.toUpperCase() || '?', color: 'text-gray-400' };
    }
  }
}

export function FileStager({
  projectId,
  open,
  onClose,
  initialCommitMessage = '',
}: FileStagerProps) {
  const { data: status, isLoading, refetch } = useGitStatus(projectId);
  const { data: branchInfo } = useBranchInfo(projectId);
  const stageFiles = useStageFiles(projectId);
  const unstageFiles = useUnstageFiles(projectId);
  const stageAll = useStageAll(projectId);
  const unstageAll = useUnstageAll(projectId);
  const commit = useCommit(projectId);
  const push = usePush(projectId);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState(initialCommitMessage);
  const [isCommitFocused, setIsCommitFocused] = useState(false);
  const [showPushConfirm, setShowPushConfirm] = useState(false);
  const [lastCommitHash, setLastCommitHash] = useState<string | null>(null);

  const commitInputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Update commit message when initial message changes
  useEffect(() => {
    if (initialCommitMessage) {
      setCommitMessage(initialCommitMessage);
    }
  }, [initialCommitMessage]);

  // Build unified file tree from staged and unstaged files
  const buildUnifiedTree = useCallback(
    (
      stagedFiles: Array<{ path: string; status: string }>,
      unstagedFiles: Array<{ path: string; status: string }>,
      untrackedFiles: string[]
    ): FileNode[] => {
      // Internal tree node for building
      interface TreeNode {
        name: string;
        path: string;
        type: 'file' | 'directory';
        stagedStatus?: string;
        unstagedStatus?: string;
        children: Map<string, TreeNode>;
      }

      const root = new Map<string, TreeNode>();

      const addPath = (filePath: string, fileStatus: string, isStaged: boolean) => {
        const parts = filePath.split('/');
        let currentLevel = root;
        let currentPath = '';

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          currentPath = currentPath ? `${currentPath}/${part}` : part;
          const isFile = i === parts.length - 1;

          if (!currentLevel.has(part)) {
            currentLevel.set(part, {
              name: part,
              path: currentPath,
              type: isFile ? 'file' : 'directory',
              children: new Map(),
            });
          }

          const node = currentLevel.get(part)!;

          // Set status for files
          if (isFile) {
            if (isStaged) {
              node.stagedStatus = fileStatus;
            } else {
              node.unstagedStatus = fileStatus;
            }
          }

          currentLevel = node.children;
        }
      };

      // Add staged files
      for (const file of stagedFiles) {
        addPath(file.path, file.status, true);
      }
      // Add unstaged files
      for (const file of unstagedFiles) {
        addPath(file.path, file.status, false);
      }
      // Add untracked files
      for (const path of untrackedFiles) {
        addPath(path, 'untracked', false);
      }

      // Convert Map structure to array structure
      const convertToArray = (map: Map<string, TreeNode>): FileNode[] => {
        const result: FileNode[] = [];
        for (const node of map.values()) {
          result.push({
            name: node.name,
            path: node.path,
            type: node.type,
            stagedStatus: node.stagedStatus,
            unstagedStatus: node.unstagedStatus,
            children: convertToArray(node.children),
          });
        }
        // Sort: directories first, then alphabetically
        return result.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
      };

      // Collapse empty intermediate directories
      const collapseEmptyDirs = (nodes: FileNode[]): FileNode[] => {
        return nodes.map((node) => {
          if (node.type !== 'directory') {
            return node;
          }

          let children = collapseEmptyDirs(node.children);
          let currentName = node.name;
          let currentPath = node.path;

          while (children.length === 1 && children[0].type === 'directory') {
            const onlyChild = children[0];
            currentName = `${currentName}/${onlyChild.name}`;
            currentPath = onlyChild.path;
            children = onlyChild.children;
          }

          return {
            ...node,
            name: currentName,
            path: currentPath,
            children,
          };
        });
      };

      return collapseEmptyDirs(convertToArray(root));
    },
    []
  );

  // Build unified tree
  const unifiedTree = useMemo(() => {
    if (!status) {
      return [];
    }
    return buildUnifiedTree(status.staged, status.unstaged, status.untracked);
  }, [status, buildUnifiedTree]);

  // Collect all directory paths from tree
  const getAllDirPaths = useCallback((nodes: FileNode[]): string[] => {
    const paths: string[] = [];
    for (const node of nodes) {
      if (node.type === 'directory') {
        paths.push(node.path);
        paths.push(...getAllDirPaths(node.children));
      }
    }
    return paths;
  }, []);

  // Auto-expand ALL directories
  useEffect(() => {
    if (status && expandedDirs.size === 0) {
      const allDirs = new Set(getAllDirPaths(unifiedTree));
      setExpandedDirs(allDirs);
    }
  }, [status, unifiedTree, expandedDirs.size, getAllDirPaths]);

  // Flatten tree for keyboard navigation
  const flattenTree = useCallback(
    (nodes: FileNode[], depth: number): FlatItem[] => {
      const result: FlatItem[] = [];

      for (const node of nodes) {
        const isExpanded = expandedDirs.has(node.path);
        result.push({ node, depth, isExpanded });

        if (node.type === 'directory' && isExpanded && node.children.length > 0) {
          result.push(...flattenTree(node.children, depth + 1));
        }
      }

      return result;
    },
    [expandedDirs]
  );

  const flatItems = useMemo(() => {
    return flattenTree(unifiedTree, 0);
  }, [unifiedTree, flattenTree]);

  // Get all file paths from a node recursively, filtered by staged state
  const getFilePaths = useCallback((node: FileNode, onlyStaged: boolean): string[] => {
    if (node.type === 'file') {
      if (onlyStaged && node.stagedStatus) {
        return [node.path];
      }
      if (!onlyStaged && node.unstagedStatus) {
        return [node.path];
      }
      return [];
    }
    return node.children.flatMap((child) => getFilePaths(child, onlyStaged));
  }, []);

  // Get directory staging state: 'all' | 'mixed' | 'none'
  const getDirStagingState = useCallback((node: FileNode): 'all' | 'mixed' | 'none' => {
    if (node.type === 'file') {
      if (node.stagedStatus && !node.unstagedStatus) return 'all';
      if (node.unstagedStatus) return 'none';
      return 'none';
    }

    const childStates = node.children.map((child) => getDirStagingState(child));
    const hasAll = childStates.some((s) => s === 'all');
    const hasNone = childStates.some((s) => s === 'none');
    const hasMixed = childStates.some((s) => s === 'mixed');

    if (hasMixed || (hasAll && hasNone)) return 'mixed';
    if (hasAll && !hasNone) return 'all';
    return 'none';
  }, []);

  // Toggle stage/unstage for current item
  const toggleItem = useCallback(
    (item: FlatItem) => {
      const node = item.node;

      // If file has unstaged changes, stage them
      if (node.unstagedStatus || node.type === 'directory') {
        const files = node.type === 'file'
          ? (node.unstagedStatus ? [node.path] : [])
          : getFilePaths(node, false);
        if (files.length > 0) {
          stageFiles.mutate(files);
          return;
        }
      }

      // If file is staged, unstage it
      if (node.stagedStatus || node.type === 'directory') {
        const files = node.type === 'file'
          ? (node.stagedStatus ? [node.path] : [])
          : getFilePaths(node, true);
        if (files.length > 0) {
          unstageFiles.mutate(files);
        }
      }
    },
    [stageFiles, unstageFiles, getFilePaths]
  );

  // Toggle directory expansion
  const toggleExpand = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Handle commit
  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) {
      toast.error('Error', 'Commit message is required');
      return;
    }

    try {
      const result = await commit.mutateAsync(commitMessage.trim());
      setLastCommitHash(result.hash);
      toast.success('Committed', `Created commit ${result.hash}`);
      setCommitMessage('');
      refetch();
    } catch (error) {
      toast.error('Commit Failed', (error as Error).message);
    }
  }, [commitMessage, commit, refetch]);

  // Handle push
  const handlePush = useCallback(async () => {
    try {
      const needsUpstream = !branchInfo?.remote;
      const result = await push.mutateAsync(needsUpstream);
      toast.success('Pushed', `Pushed to ${result.branch}`);
      setShowPushConfirm(false);
      setLastCommitHash(null);
    } catch (error) {
      toast.error('Push Failed', (error as Error).message);
    }
  }, [push, branchInfo]);

  // Keyboard navigation
  useEffect(() => {
    if (!open || isCommitFocused) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
          break;

        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;

        case ' ':
          e.preventDefault();
          if (flatItems[selectedIndex]) {
            toggleItem(flatItems[selectedIndex]);
          }
          break;

        case 'h':
        case 'ArrowLeft':
          e.preventDefault();
          if (flatItems[selectedIndex]?.node.type === 'directory') {
            const path = flatItems[selectedIndex].node.path;
            if (expandedDirs.has(path)) {
              toggleExpand(path);
            }
          }
          break;

        case 'l':
        case 'ArrowRight':
          e.preventDefault();
          if (flatItems[selectedIndex]?.node.type === 'directory') {
            const path = flatItems[selectedIndex].node.path;
            if (!expandedDirs.has(path)) {
              toggleExpand(path);
            }
          }
          break;

        case 'Enter':
          e.preventDefault();
          if (flatItems[selectedIndex]?.node.type === 'directory') {
            toggleExpand(flatItems[selectedIndex].node.path);
          }
          break;

        case 'a':
          e.preventDefault();
          stageAll.mutate();
          break;

        case 'u':
          e.preventDefault();
          unstageAll.mutate();
          break;

        case 'c':
          e.preventDefault();
          commitInputRef.current?.focus();
          setIsCommitFocused(true);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    open,
    isCommitFocused,
    flatItems,
    selectedIndex,
    expandedDirs,
    toggleItem,
    toggleExpand,
    stageAll,
    unstageAll,
  ]);

  // Scroll selected item into view
  useEffect(() => {
    if (containerRef.current && flatItems.length > 0) {
      const selectedEl = containerRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex, flatItems.length]);

  // Reset selection when items change
  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(Math.max(0, flatItems.length - 1));
    }
  }, [flatItems.length, selectedIndex]);

  const unstagedCount = status ? status.unstaged.length + status.untracked.length : 0;
  const stagedCount = status?.staged.length ?? 0;
  const hasUnstagedChanges = unstagedCount > 0;
  const hasStagedChanges = stagedCount > 0;
  const canCommit = hasStagedChanges && commitMessage.trim().length > 0;
  const canPush = lastCommitHash || (branchInfo && branchInfo.remote && status && !status.clean);

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl w-full max-h-[80vh] flex flex-col">
      <DialogClose onClick={onClose} />
      <DialogHeader className="flex-shrink-0">
        <DialogTitle className="flex items-center gap-2">
          <GitBranchIcon className="w-5 h-5" />
          Stage & Commit
        </DialogTitle>
        <p className="text-xs text-content-muted mt-1 font-mono">
          <span className="text-content-secondary">j/k</span> navigate
          <span className="mx-2 text-content-muted">·</span>
          <span className="text-content-secondary">space</span> stage/unstage
          <span className="mx-2 text-content-muted">·</span>
          <span className="text-content-secondary">Enter</span> expand/collapse
          <span className="mx-2 text-content-muted">·</span>
          <span className="text-content-secondary">c</span> commit
        </p>
      </DialogHeader>

      <div ref={containerRef} className="flex-1 overflow-y-auto px-6 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <LoaderIcon className="w-5 h-5 animate-spin text-content-muted" />
          </div>
        ) : (
          <>
            {/* Header with counts and actions */}
            <div className="flex items-center justify-between mb-2 sticky top-0 bg-surface-secondary py-2 -mx-6 px-6">
              <div className="flex items-center gap-4 text-xs">
                <span className="text-yellow-400">
                  ● Unstaged ({unstagedCount})
                </span>
                <span className="text-green-400">
                  ✓ Staged ({stagedCount})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => stageAll.mutate()}
                  disabled={!hasUnstagedChanges || stageAll.isPending}
                  className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                >
                  + Stage All (a)
                </button>
                <span className="text-content-muted">·</span>
                <button
                  onClick={() => unstageAll.mutate()}
                  disabled={!hasStagedChanges || unstageAll.isPending}
                  className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                >
                  − Unstage All (u)
                </button>
              </div>
            </div>

            {/* Unified file tree */}
            {flatItems.length === 0 ? (
              <p className="text-xs text-content-muted py-8 text-center">No changes</p>
            ) : (
              <div className="border border-line rounded-lg overflow-hidden bg-surface-primary">
                {flatItems.map((item, index) => (
                  <FileRow
                    key={`${item.node.path}-${item.node.stagedStatus}-${item.node.unstagedStatus}`}
                    item={item}
                    globalIndex={index}
                    isSelected={selectedIndex === index}
                    onSelect={setSelectedIndex}
                    onToggle={toggleItem}
                    onExpand={toggleExpand}
                    getDirStagingState={getDirStagingState}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Commit Message */}
      <div className="flex-shrink-0 px-6 py-4 border-t border-line">
        <label className="block text-xs font-medium text-content-secondary mb-2">
          Commit Message
        </label>
        <textarea
          ref={commitInputRef}
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          onFocus={() => setIsCommitFocused(true)}
          onBlur={() => setIsCommitFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              commitInputRef.current?.blur();
              setIsCommitFocused(false);
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (canCommit) {
                handleCommit();
              }
            }
          }}
          placeholder="Enter commit message..."
          className={cn(
            'w-full h-20 px-3 py-2 text-sm bg-surface-primary border rounded-lg resize-none font-mono',
            'text-content-primary placeholder:text-content-muted',
            'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
            isCommitFocused ? 'border-blue-500' : 'border-line'
          )}
        />
        <p className="text-xs text-content-muted mt-1">
          Press <span className="text-content-secondary">Cmd+Enter</span> to commit
        </p>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 px-6 pb-6 flex items-center justify-between gap-3">
        <div className="text-xs text-content-muted font-mono">
          {branchInfo && (
            <span className="flex items-center gap-1">
              <GitBranchIcon className="w-3 h-3" />
              {branchInfo.name}
              {branchInfo.remote && (
                <span className="text-content-muted">→ {branchInfo.remote}</span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCommit}
            disabled={!canCommit || commit.isPending}
          >
            {commit.isPending ? (
              <>
                <LoaderIcon className="w-4 h-4 animate-spin mr-1" />
                Committing...
              </>
            ) : (
              <>
                <GitCommitIcon className="w-4 h-4 mr-1" />
                Commit
              </>
            )}
          </Button>
          {canPush && (
            <Button
              variant="primary"
              onClick={() => setShowPushConfirm(true)}
              disabled={push.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {push.isPending ? (
                <>
                  <LoaderIcon className="w-4 h-4 animate-spin mr-1" />
                  Pushing...
                </>
              ) : (
                <>
                  <ArrowUpIcon className="w-4 h-4 mr-1" />
                  Push
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Push Confirmation Dialog */}
      {showPushConfirm && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-xl">
          <div className="bg-surface-secondary border border-line rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-medium text-content-primary mb-2">Confirm Push</h3>
            <p className="text-sm text-content-secondary mb-4">
              Are you sure you want to push to{' '}
              <span className="font-mono text-blue-400">{branchInfo?.remote || 'origin'}</span>?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowPushConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handlePush}
                disabled={push.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {push.isPending ? 'Pushing...' : 'Push'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// File Row Component
interface FileRowProps {
  item: FlatItem;
  globalIndex: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
  onToggle: (item: FlatItem) => void;
  onExpand: (path: string) => void;
  getDirStagingState: (node: FileNode) => 'all' | 'mixed' | 'none';
}

function FileRow({ item, globalIndex, isSelected, onSelect, onToggle, onExpand, getDirStagingState }: FileRowProps) {
  const { node, depth, isExpanded } = item;

  // Determine display status - prefer unstaged (to show what needs staging)
  const isStaged = !node.unstagedStatus && !!node.stagedStatus;
  const displayStatus = node.unstagedStatus || node.stagedStatus;
  const statusDisplay = displayStatus ? getStatusDisplay(displayStatus, isStaged) : null;

  // Get directory staging state for coloring
  const dirStagingState = node.type === 'directory' ? getDirStagingState(node) : null;

  // Determine name color based on type and staging state
  const getNameColor = () => {
    if (node.type === 'file') {
      return isStaged ? 'text-green-400' : 'text-content-primary';
    }
    // Directory colors based on children staging state
    switch (dirStagingState) {
      case 'all': return 'text-green-400';
      case 'mixed': return 'text-yellow-400';
      case 'none': return 'text-content-muted';
      default: return 'text-content-primary';
    }
  };

  const fileNameColor = getNameColor();

  return (
    <div
      data-index={globalIndex}
      className={cn(
        'flex items-center gap-2 px-3 py-1 text-sm cursor-pointer font-mono',
        'hover:bg-surface-tertiary transition-colors',
        isSelected && 'bg-blue-600/30'
      )}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
      onClick={() => {
        onSelect(globalIndex);
        if (node.type === 'directory') {
          onExpand(node.path);
        }
      }}
      onDoubleClick={() => onToggle(item)}
    >
      {/* Expand/collapse chevron for directories */}
      {node.type === 'directory' ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onExpand(node.path);
          }}
          className="p-0.5 hover:bg-surface-tertiary rounded flex-shrink-0"
        >
          {isExpanded ? (
            <ChevronDownIcon className="w-3 h-3 text-content-muted" />
          ) : (
            <ChevronRightIcon className="w-3 h-3 text-content-muted" />
          )}
        </button>
      ) : (
        <span className="w-4 flex-shrink-0" />
      )}

      {/* Folder/file icon */}
      {node.type === 'directory' ? (
        <FolderIcon className="w-4 h-4 text-yellow-500 flex-shrink-0" />
      ) : (
        <FileIcon className="w-4 h-4 text-content-muted flex-shrink-0" />
      )}

      {/* Status badge (colored based on staged/unstaged) */}
      {statusDisplay && (
        <span className={cn('font-bold flex-shrink-0 w-5', statusDisplay.color)}>
          {statusDisplay.text}
        </span>
      )}

      {/* Filename - green if staged, normal if unstaged */}
      <span className={cn('flex-1 truncate', fileNameColor)}>{node.name}</span>

      {/* Stage/unstage button */}
      {node.type === 'file' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(item);
          }}
          className={cn(
            'p-1 rounded hover:bg-surface-tertiary flex-shrink-0',
            node.unstagedStatus ? 'text-green-400' : 'text-red-400'
          )}
          title={node.unstagedStatus ? 'Stage' : 'Unstage'}
        >
          {node.unstagedStatus ? (
            <PlusIcon className="w-3.5 h-3.5" />
          ) : (
            <MinusIcon className="w-3.5 h-3.5" />
          )}
        </button>
      )}

      {/* For directories, show +/- based on what children have */}
      {node.type === 'directory' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(item);
          }}
          className="p-1 rounded hover:bg-surface-tertiary flex-shrink-0 text-green-400"
          title="Stage/Unstage all"
        >
          <PlusIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// Icon Components
function GitBranchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function GitCommitIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <line x1="1.05" y1="12" x2="7" y2="12" />
      <line x1="17.01" y1="12" x2="22.96" y2="12" />
    </svg>
  );
}

function LoaderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MinusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export default FileStager;
