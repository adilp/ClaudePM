/**
 * Router Configuration
 * Client-side routing for the desktop app
 * Uses hash router for Tauri compatibility
 */

import { createHashRouter } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import {
  Dashboard,
  Projects,
  ProjectCreate,
  ProjectDetail,
  TicketDetail,
  TicketReview,
  Sessions,
  Settings,
  NotFound,
} from './pages';

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'projects', element: <Projects /> },
      { path: 'projects/new', element: <ProjectCreate /> },
      { path: 'projects/:projectId', element: <ProjectDetail /> },
      { path: 'projects/:projectId/tickets/:ticketId', element: <TicketDetail /> },
      { path: 'projects/:projectId/tickets/:ticketId/review', element: <TicketReview /> },
      { path: 'sessions', element: <Sessions /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
