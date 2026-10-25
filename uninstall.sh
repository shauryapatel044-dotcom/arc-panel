#!/usr/bin/env bash
# =============================================================================
#  Arc Panel — Complete Uninstaller Script
#  Removes everything installed and configured by install.sh
#
#  Usage:
#    sudo bash uninstall.sh
#    bash <(curl -fsSL https://raw.githubusercontent.com/shauryapatel044-dotcom/arc-panel/main/uninstall.sh)
# =============================================================================

set -uo pipefail

GREEN="\033[0;32m"
BLUE="\033[0;34m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
BOLD="\033[1m"
NC="\033[0m"

log_info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
log_step()    { echo -e "${BLUE}${BOLD}[STEP]${NC}  $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_fatal()   { echo -e "${RED}[FATAL]${NC} $*" >&2; exit 1; }
log_section() {
  echo ""
  echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}${BOLD}  $*${NC}"
  echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

if [[ "$EUID" -ne 0 ]]; then
  log_fatal "This script must be run as root. Use: sudo bash uninstall.sh"
fi

clear 2>/dev/null || true
echo -e "${CYAN}${BOLD}"
cat << 'EOF'
  ___           ____                  _
 / _ \  _ __  / ___| ___  ___  ___  | |  __ _ ___
| | | || '__|| |    / _ \/ __|/ __| | | / _` / __|
| |_| || |   | |___| (_) \__ \\__ \ | || (_| \__ \
 \___/ |_|    \____|\___/|___/|___/ |_| \__,_|___/

           A r c   P a n e l   U n i n s t a l l e r
        Complete Removal of All Arc Panel Services & Data
EOF
echo -e "${NC}"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Stop & Remove Systemd Services
# ─────────────────────────────────────────────────────────────────────────────
log_section "1. Stopping & Removing Arc Panel Systemd Services"

for svc in arc-panel-frontend arc-panel-backend arc-panel-daemon; do
  log_step "Stopping and disabling ${svc}..."
  systemctl stop "${svc}" 2>/dev/null || true
  systemctl disable "${svc}" 2>/dev/null || true
  rm -f "/etc/systemd/system/${svc}.service"
done

systemctl daemon-reload 2>/dev/null || true
systemctl reset-failed 2>/dev/null || true
log_ok "All Arc Panel systemd services stopped and removed."

# Kill any lingering node/ts-node/next processes running from /opt/arc-panel
pkill -9 -f "/opt/arc-panel" 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────────────────
# 2. Remove Docker Containers & Images Created by Arc Panel
# ─────────────────────────────────────────────────────────────────────────────
log_section "2. Cleaning Up Docker Containers & Game Server Images"

if command -v docker &>/dev/null; then
  log_step "Stopping and removing Arc Panel Docker containers..."
  # Remove containers with arc- prefix or managed labels
  ARC_CONTAINERS=$(docker ps -aq --filter "name=arc" 2>/dev/null || true)
  if [[ -n "$ARC_CONTAINERS" ]]; then
    docker rm -f $ARC_CONTAINERS 2>/dev/null || true
  fi

  # Remove pre-pulled game images from install.sh
  for img in "itzg/minecraft-server:latest" "itzg/minecraft-bedrock-server:latest" "python:3.12-slim" "node:20-slim" "node:20-alpine"; do
    docker rmi -f "$img" 2>/dev/null || true
  done

  log_ok "Docker containers and images cleaned."
else
  log_info "Docker not installed — skipping container cleanup."
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. Remove MariaDB Database & Users (and Reset Root Auth)
# ─────────────────────────────────────────────────────────────────────────────
log_section "3. Removing Arc Panel Database & Resetting MariaDB"

DB_ROOT_PASSWORD=""
if [[ -f /etc/arc-panel/credentials ]]; then
  source /etc/arc-panel/credentials 2>/dev/null || true
fi

if command -v mysql &>/dev/null; then
  log_step "Dropping 'arcpanel' database and database users..."

  SQL_CLEANUP="
  DROP DATABASE IF EXISTS \`arcpanel\`;
  DROP USER IF EXISTS 'arcpanel'@'localhost';
  DROP USER IF EXISTS 'arcpanel'@'127.0.0.1';
  ALTER USER 'root'@'localhost' IDENTIFIED VIA unix_socket;
  FLUSH PRIVILEGES;
  "

  if mysql -u root -e "SELECT 1;" &>/dev/null; then
    mysql -u root <<< "$SQL_CLEANUP" 2>/dev/null || true
  elif [[ -f /etc/mysql/debian.cnf ]] && mysql --defaults-file=/etc/mysql/debian.cnf -e "SELECT 1;" &>/dev/null; then
    mysql --defaults-file=/etc/mysql/debian.cnf <<< "$SQL_CLEANUP" 2>/dev/null || true
  elif [[ -n "$DB_ROOT_PASSWORD" ]] && mysql -u root -p"${DB_ROOT_PASSWORD}" -e "SELECT 1;" &>/dev/null; then
    mysql -u root -p"${DB_ROOT_PASSWORD}" <<< "$SQL_CLEANUP" 2>/dev/null || true
  else
    log_warn "Resetting MariaDB root to default unix_socket..."
    systemctl stop mariadb 2>/dev/null || true
    killall -9 mariadbd mysqld mysqld_safe 2>/dev/null || true
    sleep 1
    mkdir -p /run/mysqld
    chown mysql:mysql /run/mysqld 2>/dev/null || true
    mysqld_safe --skip-grant-tables --skip-networking &>/dev/null &
    sleep 3
    mysql -u root <<RECOVEREOF 2>/dev/null || true
FLUSH PRIVILEGES;
DROP DATABASE IF EXISTS \`arcpanel\`;
DROP USER IF EXISTS 'arcpanel'@'localhost';
DROP USER IF EXISTS 'arcpanel'@'127.0.0.1';
ALTER USER 'root'@'localhost' IDENTIFIED VIA unix_socket;
FLUSH PRIVILEGES;
RECOVEREOF
    killall mariadbd mysqld mysqld_safe 2>/dev/null || true
    sleep 2
    systemctl start mariadb 2>/dev/null || true
  fi

  log_ok "Database 'arcpanel' and user 'arcpanel' removed; MariaDB root restored to default."
fi

# ─────────────────────────────────────────────────────────────────────────────
# 4. Remove UFW Firewall Rules Added by install.sh
# ─────────────────────────────────────────────────────────────────────────────
log_section "4. Removing UFW Firewall Rules"

if command -v ufw &>/dev/null; then
  log_step "Deleting Arc Panel UFW port rules..."
  ufw delete allow 8080/tcp 2>/dev/null || true
  ufw delete allow 8050/tcp 2>/dev/null || true
  ufw delete allow 8090/tcp 2>/dev/null || true
  ufw delete allow 3001/tcp 2>/dev/null || true
  ufw delete allow 8085/tcp 2>/dev/null || true
  ufw delete allow 2022/tcp 2>/dev/null || true
  ufw delete allow 25500:26000/tcp 2>/dev/null || true
  ufw delete allow 25500:26000/udp 2>/dev/null || true
  log_ok "Arc Panel firewall rules removed."
fi

# ─────────────────────────────────────────────────────────────────────────────
# 5. Remove Global npm Packages Installed by install.sh
# ─────────────────────────────────────────────────────────────────────────────
log_section "5. Removing Global npm Packages"

if command -v npm &>/dev/null; then
  log_step "Uninstalling global npm packages (pm2, ts-node, typescript, prisma)..."
  npm uninstall -g pm2 ts-node typescript prisma 2>/dev/null || true
  log_ok "Global npm packages removed."
fi

# ─────────────────────────────────────────────────────────────────────────────
# 6. Remove Directories, Logs, Credentials & System User
# ─────────────────────────────────────────────────────────────────────────────
log_section "6. Removing Arc Panel Files, Directories & System User"

log_step "Removing /opt/arc-panel, /var/lib/arc-panel, /var/log/arc-panel, /etc/arc-panel..."
rm -rf /opt/arc-panel
rm -rf /var/lib/arc-panel
rm -rf /var/log/arc-panel
rm -f  /var/log/arc-panel-install.log
rm -rf /etc/arc-panel
rm -f  /etc/logrotate.d/arc-panel
rm -rf /tmp/arc-panel-src /tmp/arc-fix

log_ok "All Arc Panel directories and log files deleted."

if id "arc-panel" &>/dev/null; then
  log_step "Removing 'arc-panel' system user..."
  userdel -f arc-panel 2>/dev/null || true
  groupdel arc-panel 2>/dev/null || true
  log_ok "System user 'arc-panel' removed."
fi

# ─────────────────────────────────────────────────────────────────────────────
# 7. Optional Full Package Purge (--purge-packages)
# ─────────────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--purge-packages" ]]; then
  log_section "7. Purging MariaDB, Docker & Node.js System Packages"
  systemctl stop mariadb docker 2>/dev/null || true
  DEBIAN_FRONTEND=noninteractive apt-get purge -y \
    mariadb-server mariadb-client mariadb-common \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin \
    nodejs 2>/dev/null || true
  DEBIAN_FRONTEND=noninteractive apt-get autoremove -y 2>/dev/null || true
  rm -rf /var/lib/mysql /etc/mysql /var/lib/docker
  log_ok "System packages (MariaDB, Docker, Node.js) completely purged."
fi

echo ""
echo -e "${GREEN}${BOLD}  ╔═══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}  ║        ✅  Arc Panel Uninstalled Completely!                              ║${NC}"
echo -e "${GREEN}${BOLD}  ╚═══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}  • Removed services : arc-panel-daemon, arc-panel-backend, arc-panel-frontend${NC}"
echo -e "${CYAN}  • Removed paths    : /opt/arc-panel, /var/lib/arc-panel, /var/log/arc-panel, /etc/arc-panel${NC}"
echo -e "${CYAN}  • Removed database : arcpanel (and restored MariaDB root auth)${NC}"
echo -e "${CYAN}  • Removed user     : arc-panel${NC}"
echo ""
exit 0
