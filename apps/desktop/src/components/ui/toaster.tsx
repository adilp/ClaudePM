/**
 * Toaster Component
 * Container that renders all active toast notifications
 */

import { useToast } from '../../hooks/use-toast';
import { Toast } from './toast';

export function Toaster() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toaster">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          type={toast.type}
          title={toast.title}
          message={toast.message}
          duration={toast.duration}
          onDismiss={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}
