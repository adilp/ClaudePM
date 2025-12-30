/**
 * Settings Panel Component
 * Modal overlay for app settings including notifications toggle
 */

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  getNotificationsEnabled,
  setNotificationsEnabled,
  getApiUrl,
  setApiUrl,
} from '../services/api';
import { ensureNotificationPermission } from '../hooks/useDesktopNotifications';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  return createPortal(
    <div className="settings-backdrop" onClick={handleBackdropClick}>
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose} title="Close">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-content">
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
        </div>
      </div>
    </div>,
    document.body
  );
}
