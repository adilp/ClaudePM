/**
 * ProjectCreate Page
 * Create new project form (placeholder)
 */

export function ProjectCreate() {
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
          <line x1="12" y1="11" x2="12" y2="17" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
        <h1 className="text-2xl font-semibold text-content-primary mb-2">Create Project</h1>
        <p className="text-content-secondary">Project creation coming soon</p>
      </div>
    </div>
  );
}
