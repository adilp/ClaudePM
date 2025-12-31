/**
 * Session Controller Service
 * Handles focusing sessions and showing notifications
 */

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { getApiKey, getApiUrl, ApiError } from './api';

export interface FocusResult {
  success: boolean;
  paneId?: string;
}

/**
 * Focus a session by calling the backend API and showing a notification
 */
export async function focusSession(sessionId: string): Promise<FocusResult> {
  const apiUrl = await getApiUrl();
  const apiKey = await getApiKey();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(`${apiUrl}/api/sessions/${sessionId}/focus`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new ApiError(
      error.error || error.message || 'Failed to focus session',
      response.status
    );
  }

  const result = await response.json();

  // Show native notification on success
  await showNotification('Session Ready', 'Cmd+Tab to your terminal');

  return result;
}

/**
 * Show a native notification via Tauri plugin
 */
export async function showNotification(
  title: string,
  body: string
): Promise<void> {
  try {
    // Check and request permission if needed
    let permissionGranted = await isPermissionGranted();

    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }

    if (permissionGranted) {
      sendNotification({ title, body });
    } else {
      console.warn('Notification permission not granted');
    }
  } catch (error) {
    // Fall back to console if Tauri notification fails
    console.warn('Tauri notification failed:', error);
    console.log(`[Notification] ${title}: ${body}`);
  }
}

/**
 * Show an error notification
 */
export async function showErrorNotification(message: string): Promise<void> {
  await showNotification('Error', message);
}

/**
 * Focus a session AND show notification to switch to terminal
 * Note: Auto-activating Alacritty requires additional Tauri shell scoping
 * For now, we show a notification prompting the user to Cmd+Tab
 */
export async function focusSessionAndActivate(sessionId: string): Promise<FocusResult> {
  // Focus the tmux pane
  const result = await focusSession(sessionId);

  // The focusSession already shows "Cmd+Tab to your terminal" notification
  return result;
}
