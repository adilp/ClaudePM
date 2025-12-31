// shortcuts/ShortcutCheatsheet.tsx
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '../lib/utils';
import {
  getShortcutsByScope,
  getScopeDisplayName,
  type Shortcut,
} from './shortcut-config';

interface ShortcutCheatsheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentScope: string | null;
}

export function ShortcutCheatsheet({
  isOpen,
  onClose,
  currentScope,
}: ShortcutCheatsheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { global: globalShortcuts, scoped: scopeShortcuts } =
    getShortcutsByScope(currentScope);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay to prevent immediate close from the same click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Close on Escape (handled by global handler, but keep for direct close)
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape, { capture: true });
    return () => document.removeEventListener('keydown', handleEscape, { capture: true });
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed bottom-4 right-4 w-80',
        'bg-surface-secondary border border-line rounded-lg shadow-xl z-50',
        'animate-in fade-in slide-in-from-bottom-2 duration-200'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-line">
        <h3 className="font-semibold text-content-primary text-sm">
          Keyboard Shortcuts
        </h3>
        <button
          onClick={onClose}
          className="text-content-muted hover:text-content-primary transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-3 max-h-96 overflow-y-auto">
        {/* Global shortcuts */}
        <div className="mb-4">
          <h4 className="text-xs font-medium text-content-muted uppercase tracking-wide mb-2">
            Global
          </h4>
          <div className="space-y-1">
            {globalShortcuts.map(s => (
              <ShortcutRow key={s.keys} shortcut={s} />
            ))}
          </div>
        </div>

        {/* Page-specific shortcuts */}
        {scopeShortcuts.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-content-muted uppercase tracking-wide mb-2">
              {getScopeDisplayName(currentScope)}
            </h4>
            <div className="space-y-1">
              {scopeShortcuts.map(s => (
                <ShortcutRow key={s.keys} shortcut={s} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-line">
        <p className="text-xs text-content-muted">
          Press <kbd className="px-1 py-0.5 bg-surface-tertiary rounded text-xs font-mono">?</kbd> to toggle
        </p>
      </div>
    </div>
  );
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-content-secondary">
        {shortcut.description}
      </span>
      <kbd className="px-2 py-0.5 bg-surface-tertiary rounded text-xs font-mono text-content-secondary min-w-[2rem] text-center">
        {formatKeys(shortcut.keys)}
      </kbd>
    </div>
  );
}

// Format keys for display
function formatKeys(keys: string): string {
  return keys
    .replace('Escape', 'Esc')
    .replace('Backspace', '⌫')
    .replace('Enter', '↵')
    .replace(' ', ' ');
}
