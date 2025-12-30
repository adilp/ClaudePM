/**
 * AppLayout Component
 * Main application layout with sidebar navigation
 * Ported from web app with desktop-specific adaptations
 */

import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useDesktopNotifications } from '../hooks/useDesktopNotifications';
import { useServerNotifications } from '../hooks/useServerNotifications';
import { useWebSocket } from '../hooks/useWebSocket';
import { useUIStore } from '../stores/uiStore';
import { SidebarProjectsList } from './SidebarProjectsList';

export function AppLayout() {
  const location = useLocation();
  const { connectionState } = useWebSocket();
  const { isSectionExpanded, toggleSection } = useUIStore();
  const isProjectsExpanded = isSectionExpanded('projects');

  // Initialize desktop notifications for session events (via WebSocket)
  useDesktopNotifications();

  // Poll server for notifications (review_ready, context_low, etc.)
  useServerNotifications();

  // Check if Projects nav item is active
  const isProjectsActive =
    location.pathname === '/projects' ||
    location.pathname.startsWith('/projects/');

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar__header">
          <div className="logo">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="sidebar__title">Claude PM</h1>
        </div>

        <nav className="sidebar__nav">
          {/* Dashboard */}
          <NavLink
            to="/"
            className={({ isActive }) =>
              `nav-link ${isActive ? 'nav-link--active' : ''}`
            }
            end
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Dashboard</span>
          </NavLink>

          {/* Projects - Expandable section */}
          <div className="nav-section">
            <div className="nav-section__header">
              <button
                onClick={() => toggleSection('projects')}
                className="nav-section__toggle"
                aria-label={
                  isProjectsExpanded ? 'Collapse projects' : 'Expand projects'
                }
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`nav-section__chevron ${isProjectsExpanded ? 'nav-section__chevron--expanded' : ''}`}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <NavLink
                to="/projects"
                className={`nav-link nav-link--expandable ${isProjectsActive ? 'nav-link--active' : ''}`}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span>Projects</span>
              </NavLink>
            </div>
            {isProjectsExpanded && (
              <div className="nav-section__content">
                <SidebarProjectsList />
              </div>
            )}
          </div>

          {/* Sessions */}
          <NavLink
            to="/sessions"
            className={({ isActive }) =>
              `nav-link ${isActive ? 'nav-link--active' : ''}`
            }
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span>Sessions</span>
          </NavLink>

          {/* Settings */}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `nav-link ${isActive ? 'nav-link--active' : ''}`
            }
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </NavLink>
        </nav>

        {/* Connection status */}
        <div className="sidebar__footer">
          <div className="connection-status">
            {connectionState === 'connected' ? (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="connection-status__icon connection-status__icon--connected"
                >
                  <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                  <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                  <line x1="12" y1="20" x2="12.01" y2="20" />
                </svg>
                <span className="connection-status__text">Connected</span>
              </>
            ) : (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="connection-status__icon connection-status__icon--disconnected"
                >
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                  <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                  <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
                  <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                  <line x1="12" y1="20" x2="12.01" y2="20" />
                </svg>
                <span className="connection-status__text">
                  {connectionState === 'connecting'
                    ? 'Connecting...'
                    : 'Disconnected'}
                </span>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main content area with header */}
      <div className="main-wrapper">
        <header className="app-header">
          <div className="app-header__title">
            {/* Page title can be added here dynamically if needed */}
          </div>
          <div className="app-header__actions">
            {/* Notification badge placeholder for DWP-016 */}
            <button
              className="notification-badge"
              aria-label="Notifications"
              title="Notifications (coming soon)"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
