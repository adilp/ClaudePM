// shortcuts/index.ts
// Re-exports for clean imports

export { ShortcutProvider, ShortcutContext } from './ShortcutProvider';
export { useShortcuts } from './useShortcuts';
export { useShortcutScope } from './useShortcutScope';
export {
  shortcuts,
  getShortcutsByScope,
  getScopeDisplayName,
  type Shortcut,
  type ShortcutAction,
} from './shortcut-config';
