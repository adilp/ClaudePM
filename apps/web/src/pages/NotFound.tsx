/**
 * 404 Not Found Page
 */

import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h1 className="text-6xl font-bold text-muted-foreground mb-4">404</h1>
      <h2 className="text-2xl font-semibold mb-2">Page Not Found</h2>
      <p className="text-muted-foreground mb-8 max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div className="flex gap-4">
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </button>
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Home className="h-4 w-4" />
          Home
        </Link>
      </div>
    </div>
  );
}
