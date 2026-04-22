#!/bin/sh
set -e

# Create dedicated system user if it doesn't exist
if ! id server-video-editor >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /bin/false server-video-editor
fi

# Generate config.json on first install (preserve existing uuid on upgrade)
CONFIG=/opt/server-video-editor/config.json
if [ ! -f "$CONFIG" ]; then
    UUID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || od -x /dev/urandom | head -1 | awk '{print $2$3"-"$4"-"$5"-"$6"-"$7$8$9}')
    LABEL=$(hostname 2>/dev/null || echo "server-video-editor")
    cat > "$CONFIG" <<EOF
{
  "uuid": "$UUID",
  "wsBrokerUrl": "wss://ws.vd2.iguzman.com.mx/ws",
  "label": "$LABEL"
}
EOF
    echo "──────────────────────────────────────────────────────────"
    echo " server-video-editor installed."
    echo " Your agent UUID: $UUID"
    echo " Register this UUID in the video-downloader UI at:"
    echo "   https://vd2.iguzman.com.mx"
    echo " Config file: $CONFIG"
    echo "──────────────────────────────────────────────────────────"
fi

# Fix ownership
chown -R server-video-editor:server-video-editor /opt/server-video-editor
chown -R server-video-editor:server-video-editor /var/log/server-video-editor

# Reload systemd, enable and start the service
systemctl daemon-reload
systemctl enable server-video-editor
systemctl restart server-video-editor
