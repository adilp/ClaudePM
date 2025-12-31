/**
 * TicketReview Page
 * Ticket code review view (placeholder)
 */

import { useParams } from 'react-router-dom';

export function TicketReview() {
  const { projectId, ticketId } = useParams<{ projectId: string; ticketId: string }>();

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
          <polyline points="9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        <h1 className="text-2xl font-semibold text-content-primary mb-2">Ticket Review</h1>
        <p className="text-content-secondary">
          Review for ticket {ticketId} in project {projectId} coming soon
        </p>
      </div>
    </div>
  );
}
