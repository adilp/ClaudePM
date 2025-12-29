/**
 * Sidebar Projects List
 * Displays a nested list of projects in the sidebar
 */

import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useProjects } from '@/hooks/useProjects';
import { useUIStore } from '@/store/ui';
import { Loader2 } from 'lucide-react';

export function SidebarProjectsList() {
  const location = useLocation();
  const { data, isLoading, isError } = useProjects(1, 50);
  const { setSidebarOpen } = useUIStore();

  // Close sidebar on mobile when navigating
  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  if (isError || !data?.data?.length) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {isError ? 'Failed to load' : 'No projects'}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {data.data.map((project) => {
        const projectPath = `/projects/${project.id}`;
        const isActive = location.pathname === projectPath ||
          location.pathname.startsWith(`${projectPath}/`);

        return (
          <Link
            key={project.id}
            to={projectPath}
            onClick={closeSidebarOnMobile}
            className={cn(
              'flex items-center gap-2 pl-9 pr-3 py-1.5 text-sm transition-colors rounded-md',
              isActive
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <span className="truncate">{project.name}</span>
          </Link>
        );
      })}
    </div>
  );
}
