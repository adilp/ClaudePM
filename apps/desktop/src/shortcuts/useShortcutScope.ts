// shortcuts/useShortcutScope.ts
import { useEffect } from 'react';
import { useShortcuts } from './useShortcuts';

/**
 * Hook for pages to set their shortcut scope and register handlers.
 * Automatically cleans up on unmount.
 *
 * @param scope - The scope identifier (e.g., 'projectDetail', 'ticketDetail')
 * @param handlers - Map of handler names to functions
 *
 * @example
 * useShortcutScope('projectDetail', {
 *   selectNextTicket: () => setSelectedIndex(i => i + 1),
 *   selectPrevTicket: () => setSelectedIndex(i => i - 1),
 *   openTicket: () => navigate(`/tickets/${selectedId}`),
 * });
 */
export function useShortcutScope(
  scope: string,
  handlers: Record<string, () => void>
) {
  const { setScope, registerHandler, unregisterHandler } = useShortcuts();

  // Set scope on mount, clear on unmount
  useEffect(() => {
    setScope(scope);
    return () => setScope(null);
  }, [scope, setScope]);

  // Register handlers
  useEffect(() => {
    const handlerNames = Object.keys(handlers);

    // Register all handlers
    handlerNames.forEach(name => {
      registerHandler(name, handlers[name]);
    });

    // Unregister on cleanup
    return () => {
      handlerNames.forEach(name => {
        unregisterHandler(name);
      });
    };
  }, [handlers, registerHandler, unregisterHandler]);
}
