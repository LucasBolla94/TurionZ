#!/usr/bin/env bash
# ============================================================
# TurionZ — Linux Auto-Start (systemd)
# Created by BollaNetwork
#
# Usage:
#   ./autostart-linux.sh install   — Install systemd service
#   ./autostart-linux.sh uninstall — Remove systemd service
#   ./autostart-linux.sh status    — Check service status
# ============================================================

set -euo pipefail

SERVICE_NAME="turionz"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
INSTALL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(which node 2>/dev/null || echo '/usr/bin/node')"
CURRENT_USER="$(whoami)"

generate_service() {
  cat <<UNIT
[Unit]
Description=TurionZ (Thor) — AI Personal Agent by BollaNetwork
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${NODE_BIN} ${INSTALL_DIR}/dist/index.js
Restart=on-failure
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=3

# Environment
Environment=NODE_ENV=production
EnvironmentFile=-${INSTALL_DIR}/.env

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=turionz

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=${INSTALL_DIR}/data ${INSTALL_DIR}/tmp ${INSTALL_DIR}/.agents

[Install]
WantedBy=multi-user.target
UNIT
}

install_service() {
  echo "[TurionZ] Installing systemd service..."

  if [ "$EUID" -ne 0 ]; then
    echo "Error: Installation requires root. Run with sudo."
    exit 1
  fi

  generate_service > "${SERVICE_FILE}"
  chmod 644 "${SERVICE_FILE}"

  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}"
  systemctl start "${SERVICE_NAME}"

  echo "[TurionZ] Service installed and started."
  echo "  Check status: systemctl status ${SERVICE_NAME}"
  echo "  View logs:    journalctl -u ${SERVICE_NAME} -f"
}

uninstall_service() {
  echo "[TurionZ] Removing systemd service..."

  if [ "$EUID" -ne 0 ]; then
    echo "Error: Uninstall requires root. Run with sudo."
    exit 1
  fi

  systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
  systemctl disable "${SERVICE_NAME}" 2>/dev/null || true
  rm -f "${SERVICE_FILE}"
  systemctl daemon-reload

  echo "[TurionZ] Service removed."
}

show_status() {
  if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
    echo "[TurionZ] Service is running."
    systemctl status "${SERVICE_NAME}" --no-pager
  else
    echo "[TurionZ] Service is not running."
  fi
}

case "${1:-help}" in
  install)   install_service ;;
  uninstall) uninstall_service ;;
  status)    show_status ;;
  *)
    echo "Usage: $0 {install|uninstall|status}"
    exit 1
    ;;
esac
