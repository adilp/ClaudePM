#!/bin/bash
set -e

# Claude PM launchd Service Installer
# Installs the backend server as a macOS user agent

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_DIR/server"
PLIST_TEMPLATE="$SCRIPT_DIR/com.claudepm.server.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.claudepm.server.plist"
ENV_FILE="$SERVER_DIR/.env"

echo "=== Claude PM launchd Service Installer ==="
echo ""

# Check if running on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo "Error: This script only works on macOS"
    exit 1
fi

# Check if plist template exists
if [[ ! -f "$PLIST_TEMPLATE" ]]; then
    echo "Error: Plist template not found at $PLIST_TEMPLATE"
    exit 1
fi

# Check if server directory exists
if [[ ! -d "$SERVER_DIR" ]]; then
    echo "Error: Server directory not found at $SERVER_DIR"
    exit 1
fi

# Detect node path
NODE_PATH=$(which node 2>/dev/null || echo "")
if [[ -z "$NODE_PATH" ]]; then
    # Try common locations
    for path in /usr/local/bin/node /opt/homebrew/bin/node ~/.nvm/current/bin/node; do
        if [[ -x "$path" ]]; then
            NODE_PATH="$path"
            break
        fi
    done
fi

if [[ -z "$NODE_PATH" ]]; then
    echo "Error: Node.js not found. Please install Node.js first."
    exit 1
fi

echo "Using Node.js: $NODE_PATH"
echo "Server directory: $SERVER_DIR"
echo ""

# Load environment variables from .env file
load_env() {
    if [[ -f "$ENV_FILE" ]]; then
        echo "Loading environment from $ENV_FILE"
        # Export variables from .env, ignoring comments and empty lines
        while IFS='=' read -r key value; do
            # Skip comments and empty lines
            [[ -z "$key" || "$key" =~ ^# ]] && continue
            # Remove quotes from value
            value="${value%\"}"
            value="${value#\"}"
            value="${value%\'}"
            value="${value#\'}"
            # Export the variable
            export "$key=$value"
        done < "$ENV_FILE"
    else
        echo "Warning: No .env file found at $ENV_FILE"
        echo "Using default values..."
    fi
}

load_env

# Set defaults for missing variables
PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"
NODE_ENV="${NODE_ENV:-production}"
DATABASE_URL="${DATABASE_URL:-postgresql://localhost:5432/claude_session_manager}"
HANDOFF_THRESHOLD_PERCENT="${HANDOFF_THRESHOLD_PERCENT:-20}"
LOG_LEVEL="${LOG_LEVEL:-info}"

echo "Configuration:"
echo "  PORT: $PORT"
echo "  HOST: $HOST"
echo "  NODE_ENV: $NODE_ENV"
echo "  DATABASE_URL: ${DATABASE_URL:0:30}..."
echo "  LOG_LEVEL: $LOG_LEVEL"
echo ""

# Build the server
echo "Building server..."
cd "$SERVER_DIR"
npm run build
echo "Build complete."
echo ""

# Create LaunchAgents directory if it doesn't exist
mkdir -p "$HOME/Library/LaunchAgents"

# Unload existing service if running
if launchctl list 2>/dev/null | grep -q "com.claudepm.server"; then
    echo "Unloading existing service..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# Generate plist from template
echo "Generating plist..."
sed -e "s|__NODE_PATH__|$NODE_PATH|g" \
    -e "s|__SERVER_DIR__|$SERVER_DIR|g" \
    -e "s|__PORT__|$PORT|g" \
    -e "s|__HOST__|$HOST|g" \
    -e "s|__NODE_ENV__|$NODE_ENV|g" \
    -e "s|__DATABASE_URL__|$DATABASE_URL|g" \
    -e "s|__HANDOFF_THRESHOLD_PERCENT__|$HANDOFF_THRESHOLD_PERCENT|g" \
    -e "s|__LOG_LEVEL__|$LOG_LEVEL|g" \
    "$PLIST_TEMPLATE" > "$PLIST_DEST"

echo "Plist installed at: $PLIST_DEST"
echo ""

# Load the service
echo "Loading service..."
launchctl load "$PLIST_DEST"

# Wait a moment for service to start
sleep 2

# Verify service is running
if launchctl list 2>/dev/null | grep -q "com.claudepm.server"; then
    echo ""
    echo "=== Installation Complete ==="
    echo ""
    echo "Service status:"
    launchctl list | grep "com.claudepm.server" || true
    echo ""
    echo "Logs:"
    echo "  stdout: /tmp/claudepm.log"
    echo "  stderr: /tmp/claudepm.error.log"
    echo ""
    echo "To uninstall: ./scripts/launchd-uninstall.sh"
else
    echo ""
    echo "Warning: Service may not have started correctly."
    echo "Check logs at /tmp/claudepm.error.log"
    exit 1
fi
