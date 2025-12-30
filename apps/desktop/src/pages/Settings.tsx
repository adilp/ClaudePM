/**
 * Settings Page
 * Application settings view
 */

import { useEffect, useState, useCallback } from 'react';
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
    <div className="page page--settings">
      <div className="settings-page">
        <h1 className="settings-page__title">Settings</h1>

        <div className="settings-page__content">
          <div className="settings-section">
            <h3>Notifications</h3>
            <label className="settings-toggle">
              <span>Desktop Notifications</span>
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={handleNotificationsToggle}
              />
              <span className="toggle-slider" />
            </label>
            <p className="settings-description">
              Receive notifications when sessions complete, require input, or encounter errors.
            </p>
            <button
              className="settings-test-button"
              onClick={async () => {
                try {
                  console.log('Testing notification...');
                  const notifModule = await import('@tauri-apps/plugin-notification');
                  console.log('Notification module:', notifModule);

                  const permissionGranted = await notifModule.isPermissionGranted();
                  console.log('Permission granted:', permissionGranted);

                  if (!permissionGranted) {
                    console.log('Requesting permission...');
                    const permission = await notifModule.requestPermission();
                    console.log('Permission result:', permission);
                    if (permission !== 'granted') {
                      alert('Notification permission denied: ' + permission);
                      return;
                    }
                  }

                  console.log('Sending notification...');
                  await notifModule.sendNotification({
                    title: 'Test Notification',
                    body: 'Desktop notifications are working!',
                  });
                  console.log('Notification sent!');
                } catch (error) {
                  console.error('Notification error:', error);
                  alert('Error: ' + (error instanceof Error ? error.message : String(error)));
                }
              }}
            >
              Send Test Notification
            </button>
          </div>

          <div className="settings-section">
            <h3>Server</h3>
            <label className="settings-input-label">
              <span>API URL</span>
              <div className="settings-input-row">
                <input
                  type="text"
                  value={apiUrl}
                  onChange={handleApiUrlChange}
                  placeholder="http://localhost:4847"
                />
                <button
                  onClick={handleApiUrlSave}
                  disabled={saving}
                  className="settings-save-button"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </label>
          </div>

          <div className="settings-section">
            <h3>UI Components</h3>
            <p className="settings-description" style={{ marginBottom: '0.75rem' }}>
              Test toast notifications with different variants.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                className="settings-test-button"
                onClick={() => toast.success('Success', 'Operation completed successfully!')}
              >
                Test Success Toast
              </button>
              <button
                className="settings-test-button"
                onClick={() => toast.error('Error', 'Something went wrong!')}
              >
                Test Error Toast
              </button>
              <button
                className="settings-test-button"
                onClick={() => toast.warning('Warning', 'Please check your input.')}
              >
                Test Warning Toast
              </button>
              <button
                className="settings-test-button"
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
