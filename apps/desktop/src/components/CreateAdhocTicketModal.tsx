/**
 * Create Adhoc Ticket Modal
 * Modal for creating adhoc tickets without markdown files
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useCreateAdhocTicket } from '../hooks/useTickets';

interface CreateAdhocTicketModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Convert title to URL-friendly slug
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function CreateAdhocTicketModal({
  projectId,
  isOpen,
  onClose,
}: CreateAdhocTicketModalProps) {
  const navigate = useNavigate();
  const createAdhocTicket = useCreateAdhocTicket();

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [isExplore, setIsExplore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setSlug('');
      setSlugManuallyEdited(false);
      setIsExplore(false);
      setError(null);
    }
  }, [isOpen]);

  // Auto-generate slug from title when not manually edited
  useEffect(() => {
    if (!slugManuallyEdited) {
      setSlug(slugify(title));
    }
  }, [title, slugManuallyEdited]);

  const handleSlugChange = useCallback((value: string) => {
    setSlugManuallyEdited(true);
    setSlug(value);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!slug.trim()) {
      setError('Slug is required');
      return;
    }

    createAdhocTicket.mutate(
      { projectId, data: { title: title.trim(), slug: slug.trim(), isExplore } },
      {
        onSuccess: (ticket) => {
          onClose();
          navigate(`/projects/${projectId}/tickets/${ticket.id}`);
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Failed to create ticket');
        },
      }
    );
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogClose onClick={onClose} />
      <DialogHeader>
        <DialogTitle>Create Adhoc Ticket</DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        <DialogContent>
          <div className="space-y-4">
            {/* Title field */}
            <div className="space-y-2">
              <label htmlFor="title" className="block text-sm font-medium text-content-primary">
                Title
              </label>
              <Input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter ticket title"
                autoFocus
              />
            </div>

            {/* Slug field */}
            <div className="space-y-2">
              <label htmlFor="slug" className="block text-sm font-medium text-content-primary">
                Slug
              </label>
              <Input
                id="slug"
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="ticket-slug"
                className="font-mono"
              />
              <p className="text-xs text-content-muted">Used for the ticket filename and URL</p>
            </div>

            {/* Explore mode checkbox */}
            <label className="flex items-start gap-3 p-3 bg-surface-tertiary rounded-lg cursor-pointer hover:bg-line transition-colors">
              <input
                type="checkbox"
                checked={isExplore}
                onChange={(e) => setIsExplore(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-line bg-surface-primary text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium text-content-primary">Explore Mode</span>
                <span className="text-xs text-content-muted">Claude researches first, you implement</span>
              </span>
            </label>

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>
        </DialogContent>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={createAdhocTicket.isPending}
          >
            {createAdhocTicket.isPending ? 'Creating...' : 'Create Ticket'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
