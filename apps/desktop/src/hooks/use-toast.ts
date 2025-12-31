/**
 * Toast Hook
 * State management and API for toast notifications
 */

import { useState, useCallback, useEffect } from 'react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export interface ToastOptions {
  type?: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

// Global state for toasts (simple singleton pattern)
let toasts: Toast[] = [];
let listeners: Set<() => void> = new Set();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Default toast durations based on type
const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000,  // Success: 3 seconds
  error: 5000,    // Error: 5 seconds (longer to read)
  warning: 5000,  // Warning: 5 seconds
  info: 4000,     // Info: 4 seconds
};

// Public API for triggering toasts from anywhere
export function toast(options: ToastOptions): string {
  const id = generateId();
  const type = options.type ?? 'info';
  const newToast: Toast = {
    id,
    type,
    title: options.title,
    message: options.message,
    duration: options.duration ?? DEFAULT_DURATIONS[type],
  };

  toasts = [...toasts, newToast];
  emitChange();
  return id;
}

// Convenience methods
toast.success = (title: string, message?: string) =>
  toast({ type: 'success', title, message });

toast.error = (title: string, message?: string) =>
  toast({ type: 'error', title, message });

toast.warning = (title: string, message?: string) =>
  toast({ type: 'warning', title, message });

toast.info = (title: string, message?: string) =>
  toast({ type: 'info', title, message });

// Hook for consuming toasts
export function useToast() {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const listener = () => forceUpdate({});
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const removeToast = useCallback((id: string) => {
    toasts = toasts.filter((t) => t.id !== id);
    emitChange();
  }, []);

  const clearToasts = useCallback(() => {
    toasts = [];
    emitChange();
  }, []);

  return {
    toasts,
    removeToast,
    clearToasts,
    toast,
  };
}
