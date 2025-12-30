/**
 * ProjectDetail Page
 * Single project view with tickets (placeholder)
 */

import { useParams } from 'react-router-dom';

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();

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
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <h1 className="placeholder-title">Project Detail</h1>
        <p className="placeholder-text">Project {projectId} coming soon</p>
      </div>
    </div>
  );
}
