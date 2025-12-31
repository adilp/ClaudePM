/**
 * PageLoader Component
 * Fallback loading state for lazy-loaded page components
 */

export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-2 border-surface-tertiary border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );
}
