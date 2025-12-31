// shortcuts/ShortcutProvider.tsx
import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  findMatchingShortcut,
  hasPotentialMatch,
  type Shortcut,
} from './shortcut-config';

const SEQUENCE_TIMEOUT = 800; // ms between keys

export interface ShortcutContextValue {
  // Current active scope (set by pages)
  currentScope: string | null;
  setScope: (scope: string | null) => void;

  // Cheatsheet visibility
  isCheatsheetOpen: boolean;
  toggleCheatsheet: () => void;
  closeCheatsheet: () => void;

  // Register action handlers (pages register their handlers)
  registerHandler: (name: string, handler: () => void) => void;
  unregisterHandler: (name: string) => void;

  // For disabling shortcuts (when modal open, input focused)
  isDisabled: boolean;
  setDisabled: (disabled: boolean) => void;
}

export const ShortcutContext = createContext<ShortcutContextValue | null>(null);

interface ShortcutProviderProps {
  children: ReactNode;
}

export function ShortcutProvider({ children }: ShortcutProviderProps) {
  const navigate = useNavigate();
  const [currentScope, setCurrentScope] = useState<string | null>(null);
  const [isCheatsheetOpen, setIsCheatsheetOpen] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);

  // Store registered handlers
  const handlers = useRef<Map<string, () => void>>(new Map());

  // Sequence tracking
  const keySequence = useRef<string[]>([]);
  const sequenceTimer = useRef<number | null>(null);

  const setScope = useCallback((scope: string | null) => {
    setCurrentScope(scope);
  }, []);

  const toggleCheatsheet = useCallback(() => {
    setIsCheatsheetOpen(prev => !prev);
  }, []);

  const closeCheatsheet = useCallback(() => {
    setIsCheatsheetOpen(false);
  }, []);

  const registerHandler = useCallback((name: string, handler: () => void) => {
    handlers.current.set(name, handler);
  }, []);

  const unregisterHandler = useCallback((name: string) => {
    handlers.current.delete(name);
  }, []);

  const executeShortcut = useCallback(
    (shortcut: Shortcut) => {
      switch (shortcut.action.type) {
        case 'navigate':
          navigate(shortcut.action.to);
          break;
        case 'toggleCheatsheet':
          toggleCheatsheet();
          break;
        case 'action': {
          const handler = handlers.current.get(shortcut.action.handler);
          if (handler) {
            handler();
          }
          break;
        }
      }
    },
    [navigate, toggleCheatsheet]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip if disabled
      if (isDisabled) return;

      // Skip if typing in input
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }
      if (target.isContentEditable) {
        return;
      }

      // Build key string with modifiers
      let key = e.key;

      // Handle Ctrl+key combinations (C-a style)
      if (e.ctrlKey && key.length === 1) {
        key = `C-${key.toLowerCase()}`;
      }
      // Handle Meta/Cmd+key combinations (M-a style)
      else if (e.metaKey && key.length === 1) {
        key = `M-${key.toLowerCase()}`;
      }

      // Clear previous timer
      if (sequenceTimer.current) {
        clearTimeout(sequenceTimer.current);
      }

      // Add to sequence
      keySequence.current.push(key);
      const sequence = keySequence.current.join(' ');

      // Check for matching shortcut
      const shortcut = findMatchingShortcut(sequence, currentScope);

      if (shortcut) {
        e.preventDefault();
        executeShortcut(shortcut);
        keySequence.current = [];
      } else if (hasPotentialMatch(sequence)) {
        // Wait for more keys
        sequenceTimer.current = window.setTimeout(() => {
          keySequence.current = [];
        }, SEQUENCE_TIMEOUT);
      } else {
        // No match, reset
        keySequence.current = [];
      }
    },
    [currentScope, executeShortcut, isDisabled]
  );

  // Set up global keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (sequenceTimer.current) {
        clearTimeout(sequenceTimer.current);
      }
    };
  }, [handleKeyDown]);

  const value: ShortcutContextValue = {
    currentScope,
    setScope,
    isCheatsheetOpen,
    toggleCheatsheet,
    closeCheatsheet,
    registerHandler,
    unregisterHandler,
    isDisabled,
    setDisabled: setIsDisabled,
  };

  return (
    <ShortcutContext.Provider value={value}>
      {children}
    </ShortcutContext.Provider>
  );
}
