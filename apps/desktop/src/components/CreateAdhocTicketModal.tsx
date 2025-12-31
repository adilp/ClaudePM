/**
 * Create Adhoc Ticket Modal
 * Modal for creating adhoc tickets without markdown files
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
          <div className="form-group">
            <label htmlFor="title" className="form-label">
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

          <div className="form-group">
            <label htmlFor="slug" className="form-label">
              Slug
            </label>
            <Input
              id="slug"
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="ticket-slug"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <p className="form-hint">Used for the ticket filename and URL</p>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isExplore}
                onChange={(e) => setIsExplore(e.target.checked)}
              />
              <span>
                <strong>Explore Mode</strong>
                <small>Claude researches first, you implement</small>
              </span>
            </label>
          </div>

          {error && (
            <div className="alert alert--error">
              <p>{error}</p>
            </div>
          )}
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
