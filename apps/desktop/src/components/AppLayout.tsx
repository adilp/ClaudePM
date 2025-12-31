/**
 * AppLayout Component
 * Main application layout with sidebar navigation
 * Ported from web app with desktop-specific adaptations
 */

import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useDesktopNotifications } from '../hooks/useDesktopNotifications';
import { useServerNotifications } from '../hooks/useServerNotifications';
import { useTicketStateListener } from '../hooks/useTicketStateListener';
import { useWebSocket } from '../hooks/useWebSocket';
import { useNotificationCount } from '../hooks/useNotifications';
import { useUIStore } from '../stores/uiStore';
import { cn } from '../lib/utils';
import { SidebarProjectsList } from './SidebarProjectsList';
import { NotificationsPanel } from './NotificationsPanel';
import appIcon from '../assets/app-icon.png';

export function AppLayout() {
  const location = useLocation();
  const { connectionState, lastMessage, connect } = useWebSocket();
  const { isSectionExpanded, toggleSection } = useUIStore();
  const isProjectsExpanded = isSectionExpanded('projects');
  const { data: notificationCount } = useNotificationCount();
  const [showNotifications, setShowNotifications] = useState(false);

  // Initialize desktop notifications for session events (via WebSocket)
  useDesktopNotifications();

  // Listen to WebSocket for real-time notifications
  useServerNotifications({ lastMessage });

  // Listen to WebSocket for real-time ticket state changes (kanban board updates)
  useTicketStateListener({ lastMessage });

  // Check if Projects nav item is active
  const isProjectsActive =
    location.pathname === '/projects' ||
    location.pathname.startsWith('/projects/');

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[220px] flex flex-col shrink-0 bg-surface-secondary border-r border-line">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
          <img src={appIcon} alt="Claude PM" className="w-8 h-8" />
          <h1 className="text-lg font-semibold tracking-tight">Claude PM</h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col p-3 gap-1 overflow-y-auto">
          {/* Dashboard */}
          <NavLink
            to="/"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-500/15 text-indigo-500'
                  : 'text-content-secondary hover:bg-surface-tertiary hover:text-content-primary'
              )
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
              className="shrink-0"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Dashboard</span>
          </NavLink>

          {/* Projects - Expandable section */}
          <div className="mb-1">
            <div className="flex items-center">
              <button
                onClick={() => toggleSection('projects')}
                className="flex items-center justify-center w-6 h-6 ml-1 bg-transparent border-none rounded text-content-muted cursor-pointer transition-colors hover:bg-surface-tertiary hover:text-content-primary"
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
                  className={cn(
                    'transition-transform duration-200',
                    isProjectsExpanded && 'rotate-90'
                  )}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <NavLink
                to="/projects"
                className={cn(
                  'flex-1 flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isProjectsActive
                    ? 'bg-indigo-500/15 text-indigo-500'
                    : 'text-content-secondary hover:bg-surface-tertiary hover:text-content-primary'
                )}
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
                  className="shrink-0"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span>Projects</span>
              </NavLink>
            </div>
            {isProjectsExpanded && (
              <div className="mt-1 mb-2">
                <SidebarProjectsList />
              </div>
            )}
          </div>

          {/* Sessions */}
          <NavLink
            to="/sessions"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-500/15 text-indigo-500'
                  : 'text-content-secondary hover:bg-surface-tertiary hover:text-content-primary'
              )
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
              className="shrink-0"
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
              cn(
                'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-500/15 text-indigo-500'
                  : 'text-content-secondary hover:bg-surface-tertiary hover:text-content-primary'
              )
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
              className="shrink-0"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </NavLink>
        </nav>

        {/* Connection status */}
        <div className="px-4 py-3 border-t border-line">
          <div className="flex items-center gap-2">
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
                  className="shrink-0 text-green-500"
                >
                  <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                  <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                  <line x1="12" y1="20" x2="12.01" y2="20" />
                </svg>
                <span className="text-xs text-content-muted">Connected</span>
              </>
            ) : connectionState === 'connecting' ? (
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
                  className="shrink-0 text-yellow-500 animate-pulse"
                >
                  <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                  <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                  <line x1="12" y1="20" x2="12.01" y2="20" />
                </svg>
                <span className="text-xs text-content-muted">Connecting...</span>
              </>
            ) : (
              <button
                onClick={connect}
                className="flex items-center gap-2 w-full bg-transparent border-none p-0 cursor-pointer text-left group"
                title="Click to reconnect"
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
                  className="shrink-0 text-red-500"
                >
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                  <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                  <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
                  <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                  <line x1="12" y1="20" x2="12.01" y2="20" />
                </svg>
                <span className="text-xs text-content-muted group-hover:text-content-secondary">
                  Disconnected · Click to reconnect
                </span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content area with header */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center justify-between h-12 px-4 bg-surface-secondary border-b border-line shrink-0">
          <div className="text-sm font-medium text-content-primary">
            {/* Page title can be added here dynamically if needed */}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNotifications(true)}
              className="flex items-center justify-center w-9 h-9 bg-transparent border-none rounded-md text-content-secondary cursor-pointer transition-colors relative hover:bg-surface-tertiary hover:text-content-primary"
              aria-label="Notifications"
              title="Notifications"
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
              {notificationCount && notificationCount.count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold text-white bg-red-500 rounded-full">
                  {notificationCount.count > 99 ? '99+' : notificationCount.count}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-surface-primary">
          <Outlet />
        </main>
      </div>

      {/* Notifications Panel */}
      <NotificationsPanel
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </div>
  );
}
