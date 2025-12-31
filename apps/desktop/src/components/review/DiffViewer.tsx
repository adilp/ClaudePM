/**
 * DiffViewer Component
 * Displays git diff with syntax highlighting and collapsible files
 */

import { useState } from 'react';
import { cn } from '../../lib/utils';
import type { DiffFile, DiffResult } from '../../types/api';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  FileEdit,
  FilePlus,
  FileMinus,
  FileSymlink,
  ChevronsUpDown,
  ChevronsDownUp,
} from 'lucide-react';

interface DiffViewerProps {
  diff: DiffResult;
  excludePatterns?: string[];
}

const changeTypeConfig = {
  added: {
    label: 'Added',
    icon: FilePlus,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  modified: {
    label: 'Modified',
    icon: FileEdit,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  deleted: {
    label: 'Deleted',
    icon: FileMinus,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
  renamed: {
    label: 'Renamed',
    icon: FileSymlink,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
  },
};

function parseDiffLine(
  line: string
): { type: 'add' | 'remove' | 'context' | 'header'; content: string } {
  if (line.startsWith('@@')) {
    return { type: 'header', content: line };
  }
  if (line.startsWith('+')) {
    return { type: 'add', content: line.slice(1) };
  }
  if (line.startsWith('-')) {
    return { type: 'remove', content: line.slice(1) };
  }
  return { type: 'context', content: line.startsWith(' ') ? line.slice(1) : line };
}

interface DiffFileViewProps {
  file: DiffFile;
  expanded: boolean;
  onToggle: () => void;
}

function DiffFileView({ file, expanded, onToggle }: DiffFileViewProps) {
  const config = changeTypeConfig[file.change_type];
  const Icon = config.icon;

  // Count additions and deletions
  let additions = 0;
  let deletions = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.content.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions++;
      if (line.startsWith('-') && !line.startsWith('---')) deletions++;
    }
  }

  return (
    <div className="rounded-lg border border-line overflow-hidden">
      {/* File Header */}
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-surface-tertiary transition-colors',
          config.bgColor
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {expanded ? (
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-content-secondary" />
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-content-secondary" />
          )}
          <Icon className={cn('h-4 w-4 flex-shrink-0', config.color)} />
          <span className="font-mono text-xs sm:text-sm min-w-0 truncate text-content-primary">
            {file.old_file_path && file.old_file_path !== file.file_path ? (
              <>
                <span className="text-content-muted">{file.old_file_path}</span>
                <span className="mx-1 sm:mx-2 text-content-secondary">→</span>
                {file.file_path}
              </>
            ) : (
              file.file_path
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs ml-auto">
          {additions > 0 && (
            <span className="text-green-400 font-medium">+{additions}</span>
          )}
          {deletions > 0 && (
            <span className="text-red-400 font-medium">-{deletions}</span>
          )}
          <span
            className={cn(
              'hidden sm:inline px-2 py-0.5 rounded-full font-medium text-xs',
              config.bgColor,
              config.color
            )}
          >
            {config.label}
          </span>
        </div>
      </button>

      {/* Diff Content */}
      {expanded && (
        <div className="bg-surface-primary overflow-hidden">
          {file.hunks.map((hunk, hunkIndex) => {
            const lines = hunk.content.split('\n').filter(Boolean);
            let oldLineNum = hunk.old_start;
            let newLineNum = hunk.new_start;

            return (
              <div key={hunkIndex} className="border-t border-line first:border-t-0">
                {/* Hunk Header */}
                <div className="px-4 py-1 bg-blue-500/10 text-blue-400 font-mono text-xs">
                  @@ -{hunk.old_start},{hunk.old_count} +{hunk.new_start},{hunk.new_count}{' '}
                  @@
                </div>

                {/* Lines */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm font-mono">
                    <tbody>
                      {lines.map((line, lineIndex) => {
                        const parsed = parseDiffLine(line);
                        if (parsed.type === 'header') return null;

                        let oldNum: number | null = null;
                        let newNum: number | null = null;

                        if (parsed.type === 'remove') {
                          oldNum = oldLineNum++;
                        } else if (parsed.type === 'add') {
                          newNum = newLineNum++;
                        } else {
                          oldNum = oldLineNum++;
                          newNum = newLineNum++;
                        }

                        return (
                          <tr
                            key={lineIndex}
                            className={cn(
                              'text-content-primary',
                              parsed.type === 'add' &&
                                'bg-green-500/10 text-green-300',
                              parsed.type === 'remove' &&
                                'bg-red-500/10 text-red-300'
                            )}
                          >
                            {/* Old line number - hidden on mobile */}
                            <td className="hidden sm:table-cell w-12 px-2 py-0 text-right text-content-muted select-none border-r border-line">
                              {oldNum}
                            </td>
                            {/* New line number - hidden on mobile */}
                            <td className="hidden sm:table-cell w-12 px-2 py-0 text-right text-content-muted select-none border-r border-line">
                              {newNum}
                            </td>
                            {/* Change indicator */}
                            <td className="w-5 sm:w-6 px-1 py-0 text-center select-none">
                              {parsed.type === 'add' && (
                                <Plus className="h-3 w-3 text-green-400 inline" />
                              )}
                              {parsed.type === 'remove' && (
                                <Minus className="h-3 w-3 text-red-400 inline" />
                              )}
                            </td>
                            {/* Line content */}
                            <td className="px-1 sm:px-2 py-0 whitespace-pre overflow-x-auto">
                              {parsed.content || ' '}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DiffViewer({
  diff,
  excludePatterns = ['*.md', '*.MD'],
}: DiffViewerProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => {
    // Expand first 3 files by default
    const initial = new Set<string>();
    diff.files.slice(0, 3).forEach((file) => initial.add(file.file_path));
    return initial;
  });

  // Filter out excluded files
  const filteredFiles = diff.files.filter((file) => {
    return !excludePatterns.some((pattern) => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return regex.test(file.file_path);
    });
  });

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedFiles(new Set(filteredFiles.map((f) => f.file_path)));
  };

  const collapseAll = () => {
    setExpandedFiles(new Set());
  };

  if (filteredFiles.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface-secondary p-8 text-center">
        <FileEdit className="h-12 w-12 mx-auto text-content-muted mb-3" />
        <p className="text-content-secondary">No code changes to display</p>
        <p className="text-sm text-content-muted mt-1">
          {diff.files.length > 0
            ? `${diff.files.length} file(s) excluded by filter`
            : 'No files have been modified'}
        </p>
      </div>
    );
  }

  // Count total changes
  let totalAdditions = 0;
  let totalDeletions = 0;
  for (const file of filteredFiles) {
    for (const hunk of file.hunks) {
      for (const line of hunk.content.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) totalAdditions++;
        if (line.startsWith('-') && !line.startsWith('---')) totalDeletions++;
      }
    }
  }

  return (
    <div className="space-y-3 sm:space-y-4 overflow-hidden">
      {/* Summary and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-content-secondary">
          {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''} changed
        </span>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="text-green-400 font-medium">+{totalAdditions}</span>
          <span className="text-red-400 font-medium">-{totalDeletions}</span>
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={expandAll}
              className="p-1 rounded hover:bg-surface-tertiary text-content-secondary hover:text-content-primary"
              title="Expand All"
            >
              <ChevronsUpDown className="h-4 w-4" />
            </button>
            <button
              onClick={collapseAll}
              className="p-1 rounded hover:bg-surface-tertiary text-content-secondary hover:text-content-primary"
              title="Collapse All"
            >
              <ChevronsDownUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Truncation warning */}
      {diff.truncated && (
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-4 py-2 text-sm text-yellow-400">
          Diff truncated. Showing first {diff.total_lines} lines.
        </div>
      )}

      {/* Files */}
      <div className="space-y-2 sm:space-y-3">
        {filteredFiles.map((file) => (
          <DiffFileView
            key={file.file_path}
            file={file}
            expanded={expandedFiles.has(file.file_path)}
            onToggle={() => toggleFile(file.file_path)}
          />
        ))}
      </div>
    </div>
  );
}
