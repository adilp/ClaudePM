#!/bin/bash
set -e

# Claude PM launchd Service Uninstaller
# Removes the backend server from macOS user agents

PLIST_DEST="$HOME/Library/LaunchAgents/com.claudepm.server.plist"

echo "=== Claude PM launchd Service Uninstaller ==="
echo ""

# Check if running on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo "Error: This script only works on macOS"
    exit 1
fi

# Check if service is installed
if [[ ! -f "$PLIST_DEST" ]]; then
    echo "Service is not installed (plist not found at $PLIST_DEST)"
    exit 0
fi

# Unload the service if running
if launchctl list 2>/dev/null | grep -q "com.claudepm.server"; then
    echo "Stopping service..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
    sleep 1
fi

# Remove the plist file
echo "Removing plist..."
rm -f "$PLIST_DEST"

# Verify uninstallation
if launchctl list 2>/dev/null | grep -q "com.claudepm.server"; then
    echo "Warning: Service may still be running"
    exit 1
else
    echo ""
    echo "=== Uninstallation Complete ==="
    echo ""
    echo "Service has been stopped and removed."
    echo ""
    echo "Note: Log files remain at:"
    echo "  /tmp/claudepm.log"
    echo "  /tmp/claudepm.error.log"
    echo ""
    echo "To reinstall: ./scripts/launchd-install.sh"
fi
