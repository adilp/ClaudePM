/**
 * Sidebar Projects List
 * Displays a nested list of projects in the sidebar
 */

import { NavLink, useLocation } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';

export function SidebarProjectsList() {
  const location = useLocation();
  const { data, isLoading, isError } = useProjects();
  const projects = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="sidebar-projects__loading">
        <div className="spinner spinner--small" />
        <span>Loading...</span>
      </div>
    );
  }

  if (isError || !projects.length) {
    return (
      <div className="sidebar-projects__empty">
        {isError ? 'Failed to load' : 'No projects'}
      </div>
    );
  }

  return (
    <div className="sidebar-projects">
      {projects.map((project) => {
        const projectPath = `/projects/${project.id}`;
        const isActive =
          location.pathname === projectPath ||
          location.pathname.startsWith(`${projectPath}/`);

        return (
          <NavLink
            key={project.id}
            to={projectPath}
            className={`sidebar-projects__item ${isActive ? 'sidebar-projects__item--active' : ''}`}
          >
            <span className="sidebar-projects__name">{project.name}</span>
          </NavLink>
        );
      })}
    </div>
  );
}
