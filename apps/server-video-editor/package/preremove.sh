#!/bin/sh
set -e

systemctl stop server-video-editor || true
systemctl disable server-video-editor || true
systemctl daemon-reload || true
