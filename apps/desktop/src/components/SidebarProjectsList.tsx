/**
 * Sidebar Projects List
 * Displays a nested list of projects in the sidebar
 */

import { NavLink, useLocation } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';
import { cn } from '../lib/utils';

export function SidebarProjectsList() {
  const location = useLocation();
  const { data, isLoading, isError } = useProjects();
  const projects = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-1.5 px-3.5 pl-10 text-xs text-content-muted">
        <div className="w-4 h-4 border-2 border-surface-tertiary border-t-indigo-500 rounded-full animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  if (isError || !projects.length) {
    return (
      <div className="py-1.5 px-3.5 pl-10 text-xs text-content-muted">
        {isError ? 'Failed to load' : 'No projects'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {projects.map((project) => {
        const projectPath = `/projects/${project.id}`;
        const isActive =
          location.pathname === projectPath ||
          location.pathname.startsWith(`${projectPath}/`);

        return (
          <NavLink
            key={project.id}
            to={projectPath}
            className={cn(
              'block py-1.5 px-3.5 pl-10 text-[13px] text-content-secondary no-underline rounded-md transition-colors truncate',
              isActive
                ? 'bg-indigo-500/10 text-indigo-500'
                : 'hover:bg-surface-tertiary hover:text-content-primary'
            )}
          >
            <span className="block truncate">{project.name}</span>
          </NavLink>
        );
      })}
    </div>
  );
}
