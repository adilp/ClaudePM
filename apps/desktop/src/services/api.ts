/**
 * API Client for Desktop App
 * Handles all API calls to the Claude PM backend
 */

import { load, type Store } from '@tauri-apps/plugin-store';
import type { Session } from '../types/api';

const DEFAULT_API_URL = 'http://localhost:4847';
const STORE_FILE = '.settings.dat';

let storePromise: Promise<Store> | null = null;

async function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE);
  }
  return storePromise;
}

export async function getApiKey(): Promise<string | null> {
  const store = await getStore();
  const key = await store.get<string>('apiKey');
  return key ?? null;
}

export async function setApiKey(key: string): Promise<void> {
  const store = await getStore();
  await store.set('apiKey', key);
}

export async function getApiUrl(): Promise<string> {
  const store = await getStore();
  const url = await store.get<string>('apiUrl');
  return url ?? import.meta.env.VITE_API_URL ?? DEFAULT_API_URL;
}

export async function setApiUrl(url: string): Promise<void> {
  const store = await getStore();
  await store.set('apiUrl', url);
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = await getApiUrl();
  const apiKey = await getApiKey();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new ApiError(error.error || error.message || 'Unknown error', response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export async function getSessions(): Promise<Session[]> {
  return request<Session[]>('/api/sessions');
}

export async function getSession(sessionId: string): Promise<Session> {
  return request<Session>(`/api/sessions/${sessionId}`);
}

export async function checkHealth(): Promise<{ status: string }> {
  return request<{ status: string }>('/health');
}
