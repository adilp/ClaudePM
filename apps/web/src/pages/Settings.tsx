/**
 * Settings Page
 */

import { useUIStore } from '@/store/ui';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Settings() {
  const { theme, setTheme } = useUIStore();

  const themes = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ] as const;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your application preferences
        </p>
      </div>

      {/* Theme */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="font-semibold mb-4">Appearance</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Theme</label>
            <div className="flex gap-2">
              {themes.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-md border text-sm transition-colors',
                    theme === value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-accent'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Server Connection */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="font-semibold mb-4">Server Connection</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">API Server</label>
            <p className="text-sm text-muted-foreground">
              {window.location.origin}/api
            </p>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">WebSocket</label>
            <p className="text-sm text-muted-foreground">
              ws://{window.location.host}
            </p>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="font-semibold mb-4">About</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Claude Session Manager</p>
          <p>Version 0.1.0</p>
        </div>
      </div>
    </div>
  );
}
