// shortcuts/useShortcuts.ts
import { useContext } from 'react';
import { ShortcutContext, type ShortcutContextValue } from './ShortcutProvider';

export function useShortcuts(): ShortcutContextValue {
  const context = useContext(ShortcutContext);
  if (!context) {
    throw new Error('useShortcuts must be used within a ShortcutProvider');
  }
  return context;
}
