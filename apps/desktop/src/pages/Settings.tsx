/**
 * Settings Page
 * Application settings view
 */

import { useEffect, useState, useCallback } from 'react';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import {
  getNotificationsEnabled,
  setNotificationsEnabled,
  getApiUrl,
  setApiUrl,
} from '../services/api';
import { ensureNotificationPermission } from '../hooks/useDesktopNotifications';
import { toast } from '../hooks/use-toast';

export function Settings() {
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [apiUrl, setApiUrlState] = useState('');
  const [saving, setSaving] = useState(false);

  // Load current settings
  useEffect(() => {
    async function loadSettings() {
      const [notifEnabled, url] = await Promise.all([
        getNotificationsEnabled(),
        getApiUrl(),
      ]);
      setNotificationsEnabledState(notifEnabled);
      setApiUrlState(url);
    }
    loadSettings();
  }, []);

  const handleNotificationsToggle = useCallback(async () => {
    const newValue = !notificationsEnabled;
    setNotificationsEnabledState(newValue);
    await setNotificationsEnabled(newValue);

    // If enabling, request permission
    if (newValue) {
      await ensureNotificationPermission();
    }
  }, [notificationsEnabled]);

  const handleApiUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setApiUrlState(e.target.value);
  }, []);

  const handleApiUrlSave = useCallback(async () => {
    setSaving(true);
    try {
      await setApiUrl(apiUrl);
    } finally {
      setSaving(false);
    }
  }, [apiUrl]);

  return (
    <div className="p-6">
      <div className="max-w-[500px] mx-auto">
        <h1 className="text-2xl font-semibold text-content-primary mb-6">Settings</h1>

        <div className="bg-surface-secondary border border-line rounded-xl p-6">
          {/* Notifications Section */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-content-secondary uppercase tracking-wide mb-3">
              Notifications
            </h3>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-content-primary">Desktop Notifications</span>
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={handleNotificationsToggle}
                className="hidden"
              />
              <span
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  notificationsEnabled ? 'bg-indigo-500' : 'bg-surface-tertiary'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${
                    notificationsEnabled
                      ? 'translate-x-5 bg-white'
                      : 'translate-x-0 bg-content-secondary'
                  }`}
                />
              </span>
            </label>
            <p className="text-xs text-content-muted mt-2 leading-relaxed">
              Receive notifications when sessions complete, require input, or encounter errors.
            </p>
            <button
              className="mt-3 px-4 py-2 bg-surface-tertiary text-content-primary border border-line rounded-md text-[13px] cursor-pointer transition-colors hover:bg-line"
              onClick={async () => {
                try {
                  console.log('Testing notification...');

                  const permissionGranted = await isPermissionGranted();
                  console.log('Permission granted:', permissionGranted);

                  if (!permissionGranted) {
                    console.log('Requesting permission...');
                    const permission = await requestPermission();
                    console.log('Permission result:', permission);
                    if (permission !== 'granted') {
                      toast.error('Permission Denied', `Notification permission: ${permission}`);
                      return;
                    }
                  }

                  console.log('Sending notification...');
                  await sendNotification({
                    title: 'Test Notification',
                    body: 'Desktop notifications are working!',
                  });
                  console.log('Notification sent!');
                  toast.success('Notification Sent', 'Check your notification center');
                } catch (error) {
                  console.error('Notification error:', error);
                  toast.error('Notification Error', error instanceof Error ? error.message : String(error));
                }
              }}
            >
              Send Test Notification
            </button>
          </div>

          {/* Server Section */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-content-secondary uppercase tracking-wide mb-3">
              Server
            </h3>
            <label className="flex flex-col gap-2">
              <span className="text-sm text-content-primary">API URL</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={apiUrl}
                  onChange={handleApiUrlChange}
                  placeholder="http://localhost:4847"
                  className="flex-1 px-3 py-2 bg-surface-tertiary border border-line rounded-md text-content-primary text-sm outline-none transition-colors focus:border-indigo-500 placeholder:text-content-muted"
                />
                <button
                  onClick={handleApiUrlSave}
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-500 text-white rounded-md text-sm font-medium cursor-pointer transition-colors whitespace-nowrap hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </label>
          </div>

          {/* UI Components Section */}
          <div>
            <h3 className="text-sm font-semibold text-content-secondary uppercase tracking-wide mb-3">
              UI Components
            </h3>
            <p className="text-xs text-content-muted mb-3 leading-relaxed">
              Test toast notifications with different variants.
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                className="px-4 py-2 bg-surface-tertiary text-content-primary border border-line rounded-md text-[13px] cursor-pointer transition-colors hover:bg-line"
                onClick={() => toast.success('Success', 'Operation completed successfully!')}
              >
                Test Success Toast
              </button>
              <button
                className="px-4 py-2 bg-surface-tertiary text-content-primary border border-line rounded-md text-[13px] cursor-pointer transition-colors hover:bg-line"
                onClick={() => toast.error('Error', 'Something went wrong!')}
              >
                Test Error Toast
              </button>
              <button
                className="px-4 py-2 bg-surface-tertiary text-content-primary border border-line rounded-md text-[13px] cursor-pointer transition-colors hover:bg-line"
                onClick={() => toast.warning('Warning', 'Please check your input.')}
              >
                Test Warning Toast
              </button>
              <button
                className="px-4 py-2 bg-surface-tertiary text-content-primary border border-line rounded-md text-[13px] cursor-pointer transition-colors hover:bg-line"
                onClick={() => toast.info('Info', 'Here is some information.')}
              >
                Test Info Toast
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
