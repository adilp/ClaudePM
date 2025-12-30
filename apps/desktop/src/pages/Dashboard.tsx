/**
 * Dashboard Page
 * Main dashboard view (placeholder)
 */

export function Dashboard() {
  return (
    <div className="page page--placeholder">
      <div className="placeholder-content">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="placeholder-icon"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <h1 className="placeholder-title">Dashboard</h1>
        <p className="placeholder-text">Dashboard coming soon</p>
      </div>
    </div>
  );
}
