#!/bin/sh
# Entrypoint for the server-video-editor systemd service.
# Starts the Next.js health server in the background, then runs
# the WS agent in the foreground so systemd tracks its PID.
set -e

NODE=/opt/server-video-editor/node/bin/node
APP=/opt/server-video-editor/app

"$NODE" "$APP/apps/server-video-editor/server.js" &

exec "$NODE" "$APP/ws-agent.js"
