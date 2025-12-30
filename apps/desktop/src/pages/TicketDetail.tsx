/**
 * TicketDetail Page
 * Single ticket view (placeholder)
 */

import { useParams } from 'react-router-dom';

export function TicketDetail() {
  const { projectId, ticketId } = useParams<{ projectId: string; ticketId: string }>();

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
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <h1 className="placeholder-title">Ticket Detail</h1>
        <p className="placeholder-text">
          Ticket {ticketId} in project {projectId} coming soon
        </p>
      </div>
    </div>
  );
}
