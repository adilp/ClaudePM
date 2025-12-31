/**
 * Router Configuration
 * Client-side routing for the desktop app
 * Uses hash router for Tauri compatibility
 * Route-level code splitting with React.lazy() for bundle optimization
 */

import { lazy, Suspense } from 'react';
import { createHashRouter, Outlet } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { PageLoader } from './components/PageLoader';

// Lazy load all page components for code splitting
const Dashboard = lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.Dashboard }))
);
const Projects = lazy(() =>
  import('./pages/Projects').then((m) => ({ default: m.Projects }))
);
const ProjectCreate = lazy(() =>
  import('./pages/ProjectCreate').then((m) => ({ default: m.ProjectCreate }))
);
const ProjectDetail = lazy(() =>
  import('./pages/ProjectDetail').then((m) => ({ default: m.ProjectDetail }))
);
const TicketDetail = lazy(() =>
  import('./pages/TicketDetail').then((m) => ({ default: m.TicketDetail }))
);
const TicketReview = lazy(() =>
  import('./pages/TicketReview').then((m) => ({ default: m.TicketReview }))
);
const Sessions = lazy(() =>
  import('./pages/Sessions').then((m) => ({ default: m.Sessions }))
);
const Settings = lazy(() =>
  import('./pages/Settings').then((m) => ({ default: m.Settings }))
);
const NotFound = lazy(() =>
  import('./pages/NotFound').then((m) => ({ default: m.NotFound }))
);

// Wrapper component that provides Suspense boundary for lazy routes
function SuspenseOutlet() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
  );
}

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        element: <SuspenseOutlet />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'projects', element: <Projects /> },
          { path: 'projects/new', element: <ProjectCreate /> },
          { path: 'projects/:projectId', element: <ProjectDetail /> },
          {
            path: 'projects/:projectId/tickets/:ticketId',
            element: <TicketDetail />,
          },
          {
            path: 'projects/:projectId/tickets/:ticketId/review',
            element: <TicketReview />,
          },
          { path: 'sessions', element: <Sessions /> },
          { path: 'settings', element: <Settings /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
