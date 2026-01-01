/**
 * Window Manager Service
 * Uses Tauri command to activate external applications via AppleScript
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * Activate an application by name using AppleScript (macOS only)
 * @param appName - The name of the application to activate (e.g., "Alacritty")
 */
export async function activateApp(appName: string): Promise<void> {
  await invoke('activate_app', { appName });
}

/**
 * Activate Alacritty terminal
 */
export async function activateAlacritty(): Promise<void> {
  return activateApp('Alacritty');
}
