/**
 * Projects Page
 * List of all projects (placeholder)
 */

export function Projects() {
  return (
    <div className="p-6">
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-content-muted mb-6"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <h1 className="text-2xl font-semibold text-content-primary mb-2">Projects</h1>
        <p className="text-content-secondary">Projects coming soon</p>
      </div>
    </div>
  );
}
