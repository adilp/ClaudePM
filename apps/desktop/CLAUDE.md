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
- **Styling**: Tailwind CSS v4 + custom CSS (migration pending - see DWP-019)
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
└── styles.css           # Global styles + Tailwind
```

## Styling Architecture

### Current State (Mixed)
- **Tailwind v4**: Used by kanban components (`KanbanBoard`, `KanbanCard`, etc.)
- **Custom CSS**: Used by other pages/components (Dashboard, Sessions, Settings, etc.)
- **CSS Overrides**: Kanban styling tweaks at end of `styles.css`

### Theme Configuration
Theme is defined in `styles.css`:
```css
@import "tailwindcss";

@theme {
  --color-background: ...;
  --color-card: ...;
  --color-primary: ...;
  /* etc */
}

.dark {
  /* Dark mode color overrides */
}
```

The app is dark mode by default (`<html class="dark">`).

### Important CSS Notes
- Kanban components use Tailwind utility classes
- CSS overrides for kanban are at the end of `styles.css` (search for "Kanban Board Overrides")
- Other components use BEM-style custom classes (e.g., `session-card`, `stats-card`)
- Migration to full Tailwind is tracked in DWP-019

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

### Class Names (Tailwind)
```tsx
import { cn } from '../lib/utils';
className={cn('base-class', isActive && 'active-class')}
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

## Known Issues / Tech Debt
- Mixed CSS approach (Tailwind + custom) - see DWP-019
- Some CSS overrides use `!important` for Tailwind v4 compatibility
