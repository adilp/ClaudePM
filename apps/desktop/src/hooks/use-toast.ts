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

// Public API for triggering toasts from anywhere
export function toast(options: ToastOptions): string {
  const id = generateId();
  const newToast: Toast = {
    id,
    type: options.type ?? 'info',
    title: options.title,
    message: options.message,
    duration: options.duration ?? 5000,
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
