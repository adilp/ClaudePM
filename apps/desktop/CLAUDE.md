# Claude PM Desktop App

## Overview
Tauri-based desktop application for Claude Session Manager. Provides native macOS/Windows/Linux experience with real-time session monitoring, ticket management, and desktop notifications.

## Related Projects
| Project | Path | Description |
|---------|------|-------------|
| **Server** | `../../server/` | Node.js backend (Express + WebSocket) - provides all APIs |
| **Web App** | `../web/` | Browser-based client - reference for UI patterns |

- Desktop and web share similar UI patterns and component structure
- Both consume the same server REST API and WebSocket events
- Web app is the reference implementation - desktop ports features from web
- Server must be running for desktop app to function

## Tech Stack
- **Framework**: Tauri 2.x (Rust backend, web frontend)
- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS v4 utility classes
- **State Management**: React Query (TanStack Query)
- **Routing**: React Router v6
- **Build Tool**: Vite

## Development Commands
```bash
npm run dev          # Start Vite dev server (web only)
npm run build        # Build for production
npm run tauri dev    # Start Tauri dev mode (full desktop app)
npm run tauri build  # Build desktop app for distribution
```

## Project Structure
```
src/
├── components/
│   ├── kanban/          # KanbanBoard, KanbanColumn, KanbanCard, FilterChips
│   ├── ui/              # Reusable UI components (Button, Input, Dialog, etc.)
│   ├── Sidebar.tsx      # App navigation sidebar
│   ├── StatusBadge.tsx  # Session/ticket status badges
│   └── ...
├── hooks/
│   ├── useProjects.ts   # Project CRUD operations
│   ├── useTickets.ts    # Ticket operations
│   ├── useSessions.ts   # Session management
│   └── use-toast.ts     # Toast notifications
├── pages/
│   ├── Dashboard.tsx    # Home dashboard with stats
│   ├── ProjectDetail.tsx # Project view with kanban board
│   ├── Sessions.tsx     # Sessions list
│   ├── Settings.tsx     # App settings
│   └── ...
├── services/
│   └── api.ts           # API client configuration
├── types/
│   └── api.ts           # TypeScript types for API
├── lib/
│   └── utils.ts         # Utility functions (cn for classnames)
└── styles.css           # Tailwind config + minimal custom styles
```

## Styling Architecture

The app uses **Tailwind CSS v4** with theme colors defined in `@theme` block.

### Theme Colors (styles.css)

```css
@import "tailwindcss";

@theme {
  /* Surface colors - use as bg-surface-primary, bg-surface-secondary, etc. */
  --color-surface-primary: #0f0f0f;
  --color-surface-secondary: #1a1a1a;
  --color-surface-tertiary: #252525;

  /* Text colors - use as text-content-primary, text-content-secondary, etc. */
  --color-content-primary: #e5e5e5;
  --color-content-secondary: #a0a0a0;
  --color-content-muted: #666666;

  /* Border color - use as border-line */
  --color-line: #333333;
}
```

### Styling Rules

**DO use theme-defined classes:**
```tsx
// Correct - uses theme colors
className="bg-surface-secondary text-content-primary border-line"
className="bg-surface-tertiary text-content-muted"
```

**DO NOT use arbitrary CSS variable syntax:**
```tsx
// WRONG - arbitrary value syntax doesn't work properly in Tailwind v4
className="bg-[--bg-secondary] text-[--text-primary]"
```

**Common color mappings:**
| Usage | Tailwind Class |
|-------|----------------|
| Main background | `bg-surface-primary` |
| Card/panel background | `bg-surface-secondary` |
| Hover/active state | `bg-surface-tertiary` |
| Primary text | `text-content-primary` |
| Secondary/label text | `text-content-secondary` |
| Muted/hint text | `text-content-muted` |
| Borders | `border-line` |

### Styling Patterns

**Cards:**
```tsx
<div className="bg-surface-secondary border border-line rounded-xl p-5">
```

**Loading states:**
```tsx
<div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
  <div className="w-8 h-8 border-2 border-surface-tertiary border-t-indigo-500 rounded-full animate-spin" />
  <p className="text-content-secondary">Loading...</p>
</div>
```

**Form fields:**
```tsx
<div className="space-y-2">
  <label className="block text-sm font-medium text-content-primary">Label</label>
  <Input placeholder="..." />
  <p className="text-xs text-content-muted">Help text</p>
</div>
```

**Buttons (use Button component):**
```tsx
<Button variant="primary">Primary Action</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
```

### Class Names Helper
Always use `cn()` for conditional classes:
```tsx
import { cn } from '../lib/utils';
className={cn('base-classes', isActive && 'active-classes', className)}
```

### Custom CSS (styles.css)
Only these custom styles remain:
- `@theme` block with color definitions
- `.dark` class with shadcn dark mode colors
- `@layer base` with body defaults
- Keyframe animations (spin, pulse)
- `.markdown-content` for rendered markdown

## Key Patterns

### API Calls
Use React Query hooks from `src/hooks/`:
```tsx
const { data: projects, isLoading } = useProjects();
const { data: tickets } = useTickets(projectId);
const syncProject = useSyncProject();
```

### Navigation
```tsx
import { useNavigate, Link } from 'react-router-dom';
navigate(`/projects/${projectId}/tickets/${ticketId}`);
```

### Toast Notifications
```tsx
import { toast } from '../hooks/use-toast';
toast.success('Title', 'Message');
toast.error('Error', 'Something went wrong');
```

## API Integration
- Base URL configured in Settings page (default: `http://localhost:4847`)
- Stored in localStorage
- All API calls go through `src/services/api.ts`

### Key Server Endpoints Used
```
GET    /api/projects              # List projects
POST   /api/projects/:id/sync     # Sync tickets from filesystem
GET    /api/projects/:id/tickets  # Get project tickets
PATCH  /api/tickets/:id/state     # Update ticket state (drag-drop)
POST   /api/tickets/:id/start     # Start session for ticket
GET    /api/sessions              # List sessions
POST   /api/sessions              # Create adhoc session
WS     /ws                        # Real-time updates
```

See `server/docs/api-reference.md` for full API documentation.

## Running the Full Stack
```bash
# Terminal 1: Start server
cd ../../server && npm run dev

# Terminal 2: Start desktop app
npm run tauri dev
```

## Desktop Features (Tauri)
- **Notifications**: `@tauri-apps/plugin-notification`
- **Storage**: localStorage (persisted by Tauri)
- **Window Management**: Native window controls

## Routes
| Path | Page | Description |
|------|------|-------------|
| `/` | Dashboard | Stats and overview |
| `/projects` | Projects | Project list |
| `/projects/:projectId` | ProjectDetail | Kanban board |
| `/projects/:projectId/tickets/:ticketId` | TicketDetail | Ticket view |
| `/sessions` | Sessions | All sessions |
| `/sessions/:sessionId` | SessionDetail | Session terminal |
| `/settings` | Settings | App configuration |
