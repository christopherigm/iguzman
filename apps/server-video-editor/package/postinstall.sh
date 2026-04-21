#!/bin/sh
set -e

# Create dedicated system user if it doesn't exist
if ! id server-video-editor >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /bin/false server-video-editor
fi

# Fix ownership of app files
chown -R server-video-editor:server-video-editor /opt/server-video-editor/app
chown -R server-video-editor:server-video-editor /var/log/server-video-editor

# Reload systemd, enable and start the service
systemctl daemon-reload
systemctl enable server-video-editor
systemctl restart server-video-editor
