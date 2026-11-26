#!/usr/bin/env bash
# Deploys a systemd timer that runs trigger-action.sh every day at 03:00.
#
# It installs two units into /etc/systemd/system:
#   sonos-configure.service  oneshot service running trigger-action.sh
#   sonos-configure.timer    fires the service daily at 03:00 (local time)
#
# Usage:
#   ./deploy.sh [pat-file]   install and start the daily 03:00 timer (needs root or sudo)
#   ./deploy.sh uninstall    stop and remove the timer and service
#
#   pat-file  PAT file used by the service.
#             Defaults to <repo>/github.pat (see trigger-action.sh).
#
# Requires: systemd, bash and curl on the target machine.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRIGGER_SCRIPT="${SCRIPT_DIR}/trigger-action.sh"
UNIT_DIR="/etc/systemd/system"
NAME="sonos-configure"
SERVICE_FILE="${UNIT_DIR}/${NAME}.service"
TIMER_FILE="${UNIT_DIR}/${NAME}.timer"

if [[ $EUID -eq 0 ]]; then
  SUDO=""
else
  if ! command -v sudo > /dev/null 2>&1; then
    echo "error: not running as root and 'sudo' is not available." >&2
    exit 1
  fi
  SUDO="sudo"
fi

if [[ "${1:-}" == "uninstall" ]]; then
  $SUDO systemctl disable --now "${NAME}.timer" 2>/dev/null || true
  $SUDO systemctl reset-failed "${NAME}.service" 2>/dev/null || true
  $SUDO rm -f "$SERVICE_FILE" "$TIMER_FILE"
  $SUDO systemctl daemon-reload
  echo "removed ${NAME}.timer and ${NAME}.service"
  exit 0
fi

PAT_FILE="${1:-${SCRIPT_DIR}/github.pat}"

if [[ ! -f "$TRIGGER_SCRIPT" ]]; then
  echo "error: $TRIGGER_SCRIPT not found." >&2
  exit 1
fi
if [[ ! -f "$PAT_FILE" ]]; then
  echo "error: PAT file '$PAT_FILE' not found." >&2
  echo "create it first, e.g.: echo ghp_xxxxxxxxxxxxxxxxxxxx > '$PAT_FILE'" >&2
  exit 1
fi

chmod 755 "$TRIGGER_SCRIPT"
chmod 600 "$PAT_FILE"

# Absolute path so systemd can read the PAT regardless of the service's working directory.
PAT_FILE="$(cd "$(dirname "$PAT_FILE")" && pwd)/$(basename "$PAT_FILE")"

$SUDO tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Trigger the sonos-configure GitHub Actions workflow
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${SCRIPT_DIR}
ExecStart=${TRIGGER_SCRIPT} ${PAT_FILE} main
EOF

$SUDO tee "$TIMER_FILE" > /dev/null <<EOF
[Unit]
Description=Run the sonos-configure workflow trigger every day at 03:00

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
Unit=${NAME}.service

[Install]
WantedBy=timers.target
EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable --now "${NAME}.timer"

echo "installed:"
echo "  ${SERVICE_FILE}"
echo "  ${TIMER_FILE}"
echo
echo "timer '${NAME}.timer' is active - next runs:"
$SUDO systemctl list-timers "${NAME}.timer" --no-pager || true
echo
echo "manual test run:  ${SUDO:+sudo }systemctl start ${NAME}.service"
echo "view logs:        journalctl -u ${NAME}.service"
echo "remove:           $0 uninstall"
