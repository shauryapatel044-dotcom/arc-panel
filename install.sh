#!/usr/bin/env bash
# =============================================================================
#  Arc Panel — Production Install Script
#  Supports: Ubuntu 22.04 LTS (Jammy) and Ubuntu 24.04 LTS (Noble)
#
#  Usage:
#    sudo bash install.sh
#    sudo REPO_URL=https://github.com/you/arc-panel bash install.sh
#
#  Log file: /var/log/arc-panel-install.log
# =============================================================================

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 0 — Colour Codes & Logging helpers
# ─────────────────────────────────────────────────────────────────────────────
GREEN="\033[0;32m"
BLUE="\033[0;34m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"       # reserved for FATAL errors only
BOLD="\033[1m"
NC="\033[0m"           # no colour / reset

LOG_FILE="/var/log/arc-panel-install.log"

# Redirect all output to log file AND terminal simultaneously
exec > >(tee -a "$LOG_FILE") 2>&1

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

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — Pre-flight checks
# ─────────────────────────────────────────────────────────────────────────────

# ── 1.1  Root check ──────────────────────────────────────────────────────────
if [[ "$EUID" -ne 0 ]]; then
  log_fatal "This script must be run as root. Use: sudo bash install.sh"
fi

# ── 1.2  Ubuntu version detection ────────────────────────────────────────────
if [[ ! -f /etc/os-release ]]; then
  log_fatal "/etc/os-release not found. Cannot detect OS."
fi

. /etc/os-release

if [[ "$ID" != "ubuntu" ]]; then
  log_fatal "This script only supports Ubuntu. Detected: $ID"
fi

UBUNTU_VERSION="$VERSION_ID"
case "$UBUNTU_VERSION" in
  22.04|24.04)
    log_info "Detected Ubuntu $UBUNTU_VERSION — supported."
    ;;
  *)
    log_fatal "Unsupported Ubuntu version: $UBUNTU_VERSION. Only 22.04 and 24.04 are supported."
    ;;
esac

# ── 1.3  ASCII Art Banner ─────────────────────────────────────────────────────
clear 2>/dev/null || true
echo -e "${CYAN}${BOLD}"
cat << 'EOF'
  ___           ____                  _
 / _ \  _ __  / ___| ___  ___  ___  | |  __ _ ___
| | | || '__|| |    / _ \/ __|/ __| | | / _` / __|
| |_| || |   | |___| (_) \__ \\__ \ | || (_| \__ \
 \___/ |_|    \____|\___/|___/|___/ |_| \__,_|___/

             A r c   P a n e l   I n s t a l l e r
          Production-ready Game Server Control Panel
EOF
echo -e "${NC}"
echo -e "${BLUE}${BOLD}  Version  :${NC} 1.0.0"
echo -e "${BLUE}${BOLD}  Platform :${NC} Ubuntu $UBUNTU_VERSION"
echo -e "${BLUE}${BOLD}  Log File :${NC} $LOG_FILE"
echo -e "${BLUE}${BOLD}  Date     :${NC} $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""
echo -e "${YELLOW}  This installer will set up MariaDB, Docker, Node.js, and all Arc Panel"
echo -e "  services. Estimated time: 10–20 minutes on a fresh VPS.${NC}"
echo ""
sleep 2

# ── 1.4  Detect server IP ─────────────────────────────────────────────────────
log_step "Detecting server IP address..."
SERVER_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || true)
if [[ -z "$SERVER_IP" ]]; then
  log_warn "hostname -I returned empty. Trying curl ifconfig.me..."
  SERVER_IP=$(curl -s --connect-timeout 5 ifconfig.me 2>/dev/null || echo "127.0.0.1")
fi
log_ok "Server IP detected: $SERVER_IP"

# ── 1.5  Initialise log file ──────────────────────────────────────────────────
touch "$LOG_FILE"
chmod 640 "$LOG_FILE"
echo "═══════════════════════════════════════════════════════════════" >> "$LOG_FILE"
echo "  Arc Panel Install Log — $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
echo "  Ubuntu $UBUNTU_VERSION | IP: $SERVER_IP" >> "$LOG_FILE"
echo "═══════════════════════════════════════════════════════════════" >> "$LOG_FILE"

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2 — System Update & Core Dependencies
# ─────────────────────────────────────────────────────────────────────────────
log_section "SECTION 2 — System Update & Core Dependencies"

log_step "Updating package lists..."
DEBIAN_FRONTEND=noninteractive apt-get update -y

log_step "Upgrading installed packages (this may take a while)..."
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold"

log_step "Installing core system dependencies..."
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  curl \
  wget \
  git \
  ufw \
  jq \
  openssl \
  tar \
  gzip \
  unzip \
  build-essential \
  software-properties-common \
  ca-certificates \
  gnupg \
  lsb-release \
  net-tools \
  htop \
  vim \
  nano \
  rsync \
  cron \
  logrotate \
  sudo \
  psmisc

log_ok "Core dependencies installed."

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3 — UFW Firewall Configuration
# ─────────────────────────────────────────────────────────────────────────────
log_section "SECTION 3 — UFW Firewall Configuration"

log_step "Enabling UFW firewall..."
ufw --force reset
ufw --force enable

log_step "Configuring firewall rules..."

# SSH — critical, always allow first
ufw allow 22/tcp comment "SSH"

# Arc Panel — web UI
ufw allow 8080/tcp comment "Arc Panel Frontend"

# Arc Panel — backend API
ufw allow 3001/tcp comment "Arc Panel Backend API"

# Arc Panel Daemon API
ufw allow 8085/tcp comment "Arc Panel Daemon API"

# SFTP for game server file access
ufw allow 2022/tcp comment "Arc Panel SFTP"

# Game server port range (TCP and UDP)
ufw allow 25500:26000/tcp comment "Game Server Ports TCP"
ufw allow 25500:26000/udp comment "Game Server Ports UDP"

# Loopback is always allowed
ufw allow in on lo

log_step "UFW status:"
ufw status verbose

log_ok "Firewall configured."

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 4 — MariaDB Installation & Secure Setup
# ─────────────────────────────────────────────────────────────────────────────
log_section "SECTION 4 — MariaDB Installation"

log_step "Installing MariaDB server and client..."
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  mariadb-server \
  mariadb-client

log_step "Starting and enabling MariaDB service..."
systemctl enable mariadb
systemctl start mariadb

# Allow MariaDB to fully initialise
sleep 2

# ── 4.1  Generate or load secure passwords ────────────────────────────────────
log_step "Generating secure database credentials..."
mkdir -p /etc/arc-panel
if [[ -f /etc/arc-panel/credentials ]]; then
  log_info "Loading existing database credentials from /etc/arc-panel/credentials..."
  source /etc/arc-panel/credentials || true
fi
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-$(openssl rand -hex 32)}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -hex 24)}"
DB_NAME="arcpanel"
DB_USER="arcpanel"

log_info "Root password and application password ready."

# Helper to execute SQL as MariaDB root regardless of current auth state
run_mariadb_root() {
  local sql="$1"
  if mysql -u root -e "SELECT 1;" &>/dev/null; then
    mysql -u root <<< "$sql"
  elif [[ -f /etc/mysql/debian.cnf ]] && mysql --defaults-file=/etc/mysql/debian.cnf -e "SELECT 1;" &>/dev/null; then
    mysql --defaults-file=/etc/mysql/debian.cnf <<< "$sql"
  elif mysql -u root -p"${DB_ROOT_PASSWORD}" -e "SELECT 1;" &>/dev/null; then
    mysql -u root -p"${DB_ROOT_PASSWORD}" <<< "$sql"
  else
    log_warn "MariaDB root password was set by a previous run. Recovering MariaDB root access..."
    systemctl stop mariadb || true
    killall -9 mariadbd mysqld mysqld_safe 2>/dev/null || true
    sleep 1
    mkdir -p /run/mysqld
    chown mysql:mysql /run/mysqld
    mysqld_safe --skip-grant-tables --skip-networking &>/dev/null &
    sleep 4
    mysql -u root <<RECOVEREOF
FLUSH PRIVILEGES;
ALTER USER 'root'@'localhost' IDENTIFIED VIA unix_socket OR mysql_native_password USING PASSWORD('${DB_ROOT_PASSWORD}');
FLUSH PRIVILEGES;
RECOVEREOF
    killall mariadbd mysqld mysqld_safe 2>/dev/null || true
    sleep 2
    systemctl start mariadb
    sleep 2
    mysql -u root <<< "$sql" || mysql -u root -p"${DB_ROOT_PASSWORD}" <<< "$sql"
  fi
}

# ── 4.2  mysql_secure_installation equivalent (non-interactive) ───────────────
log_step "Securing MariaDB installation..."

run_mariadb_root "
ALTER USER 'root'@'localhost' IDENTIFIED VIA unix_socket OR mysql_native_password USING PASSWORD('${DB_ROOT_PASSWORD}');
DROP USER IF EXISTS ''@'localhost';
DROP USER IF EXISTS ''@'$(hostname)';
DROP DATABASE IF EXISTS test;
FLUSH PRIVILEGES;
"

log_ok "MariaDB root secured (unix_socket + password enabled)."

# ── 4.3  Create application database and user ─────────────────────────────────
log_step "Creating Arc Panel database and user..."

run_mariadb_root "
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';

CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';

FLUSH PRIVILEGES;
"

log_ok "Database '${DB_NAME}' created. User '${DB_USER}'@'localhost' and '127.0.0.1' configured."

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 5 — Docker Installation
# ─────────────────────────────────────────────────────────────────────────────
log_section "SECTION 5 — Docker Installation"

# ── 5.1  Remove old Docker packages if present ───────────────────────────────
log_step "Removing legacy Docker packages (if any)..."
for pkg in docker docker-engine docker.io containerd runc docker-compose; do
  apt-get remove -y "$pkg" 2>/dev/null || true
done

# ── 5.2  Add Docker's official GPG key ───────────────────────────────────────
log_step "Adding Docker's official GPG key..."
install -m 0755 -d /etc/apt/keyrings

curl -fsSL "https://download.docker.com/linux/ubuntu/gpg" \
  | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg

chmod a+r /etc/apt/keyrings/docker.gpg

# ── 5.3  Add Docker apt repository ───────────────────────────────────────────
log_step "Adding Docker apt repository..."

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y

# ── 5.4  Install Docker packages ─────────────────────────────────────────────
log_step "Installing Docker CE and associated tools..."
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

# ── 5.5  Enable and start Docker ─────────────────────────────────────────────
log_step "Enabling and starting Docker..."
systemctl enable docker
systemctl start docker

# Verify Docker is running
docker --version
docker compose version

log_ok "Docker installed and running."

# ── 5.6  Pull game server images in background ────────────────────────────────
log_step "Pre-pulling game server Docker images in background..."

pull_image_bg() {
  local image="$1"
  log_info "Pulling $image in background..."
  docker pull "$image" >> "$LOG_FILE" 2>&1 &
  disown
}

pull_image_bg "itzg/minecraft-server:latest"
pull_image_bg "itzg/minecraft-bedrock-server:latest"
pull_image_bg "python:3.12-slim"
pull_image_bg "node:20-slim"

log_info "Docker image pulls started in background. They will complete while installation continues."

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 6 — Node.js 20 LTS Installation
# ─────────────────────────────────────────────────────────────────────────────
log_section "SECTION 6 — Node.js 20 LTS & Global Tools"

log_step "Installing Node.js 20 LTS via NodeSource..."

# Download and execute NodeSource setup script for Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -

DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs

# Verify installation
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
log_ok "Node.js installed: $NODE_VERSION | npm: $NPM_VERSION"

# ── 6.1  Global npm packages ──────────────────────────────────────────────────
log_step "Installing global npm packages: pm2, ts-node, typescript..."

npm install -g \
  pm2 \
  ts-node \
  typescript \
  prisma

log_ok "Global npm packages installed."

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 7 — Arc Panel Directory & File Setup
# ─────────────────────────────────────────────────────────────────────────────
log_section "SECTION 7 — Arc Panel Installation"

# ── 7.1  Create directory structure ───────────────────────────────────────────
log_step "Creating Arc Panel directory structure..."

mkdir -p /opt/arc-panel/panel
mkdir -p /opt/arc-panel/backend
mkdir -p /opt/arc-panel/daemon
mkdir -p /var/lib/arc-panel/servers
mkdir -p /var/lib/arc-panel/backups
mkdir -p /var/log/arc-panel
mkdir -p /etc/arc-panel

log_ok "Directories created."

# ── 7.2  Create system user ───────────────────────────────────────────────────
log_step "Creating 'arc-panel' system user..."

if id "arc-panel" &>/dev/null; then
  log_info "User 'arc-panel' already exists."
else
  useradd \
    --system \
    --shell /usr/sbin/nologin \
    --home-dir /opt/arc-panel \
    --comment "Arc Panel Service Account" \
    arc-panel

  log_ok "System user 'arc-panel' created."
fi

# Add arc-panel user to the docker group so the daemon can manage containers
usermod -aG docker arc-panel
log_ok "User 'arc-panel' added to docker group."

# ── 7.3  Clone GitHub Repository or Copy Project Files ────────────────────────
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || pwd)"
REPO_URL="${1:-${REPO_URL:-https://github.com/shauryapatel044-dotcom/arc-panel.git}}"
GIT_BRANCH="${GIT_BRANCH:-main}"

mkdir -p /opt/arc-panel/eggs

log_step "Installing Arc Panel application files (Panel, Backend, Daemon, Eggs)..."

if [[ -n "$REPO_URL" ]]; then
  log_info "Cloning Arc Panel from GitHub repository: $REPO_URL"
  rm -rf /tmp/arc-panel-src
  git clone --depth 1 --branch "$GIT_BRANCH" "$REPO_URL" /tmp/arc-panel-src 2>/dev/null || \
    git clone --depth 1 "$REPO_URL" /tmp/arc-panel-src

  # Copy services from cloned repo
  [[ -d /tmp/arc-panel-src/panel   ]] && rsync -a --exclude='.next' --exclude='node_modules' /tmp/arc-panel-src/panel/   /opt/arc-panel/panel/
  [[ -d /tmp/arc-panel-src/backend ]] && rsync -a --exclude='node_modules' --exclude='dist'  /tmp/arc-panel-src/backend/ /opt/arc-panel/backend/
  [[ -d /tmp/arc-panel-src/daemon  ]] && rsync -a --exclude='node_modules' --exclude='dist'  /tmp/arc-panel-src/daemon/  /opt/arc-panel/daemon/
  [[ -d /tmp/arc-panel-src/eggs    ]] && rsync -a /tmp/arc-panel-src/eggs/                   /opt/arc-panel/eggs/
  [[ -f /tmp/arc-panel-src/docker-compose.yml ]] && cp /tmp/arc-panel-src/docker-compose.yml /opt/arc-panel/docker-compose.yml

  rm -rf /tmp/arc-panel-src
  log_ok "All Arc Panel files cloned from GitHub repository ($REPO_URL)."

else
  log_info "Copying from local repository directory: $INSTALL_DIR"

  if [[ -d "$INSTALL_DIR/panel" ]]; then
    rsync -a --exclude='.next' --exclude='node_modules' \
      "$INSTALL_DIR/panel/" /opt/arc-panel/panel/
    log_ok "panel/ copied."
  else
    log_warn "panel/ directory not found in $INSTALL_DIR — skipping copy."
  fi

  if [[ -d "$INSTALL_DIR/backend" ]]; then
    rsync -a --exclude='node_modules' --exclude='dist' \
      "$INSTALL_DIR/backend/" /opt/arc-panel/backend/
    log_ok "backend/ copied."
  else
    log_warn "backend/ directory not found in $INSTALL_DIR — skipping copy."
  fi

  if [[ -d "$INSTALL_DIR/daemon" ]]; then
    rsync -a --exclude='node_modules' --exclude='dist' \
      "$INSTALL_DIR/daemon/" /opt/arc-panel/daemon/
    log_ok "daemon/ copied."
  else
    log_warn "daemon/ directory not found in $INSTALL_DIR — skipping copy."
  fi

  if [[ -d "$INSTALL_DIR/eggs" ]]; then
    rsync -a "$INSTALL_DIR/eggs/" /opt/arc-panel/eggs/
    log_ok "eggs/ copied."
  fi
fi

# ── 7.4  Set ownership ────────────────────────────────────────────────────────
log_step "Setting file ownership..."
chown -R arc-panel:arc-panel /opt/arc-panel
chown -R arc-panel:arc-panel /var/lib/arc-panel
chown -R arc-panel:arc-panel /var/log/arc-panel
chmod -R 750 /opt/arc-panel
chmod -R 770 /var/lib/arc-panel
log_ok "Ownership set."

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 8 — Secret Generation & Auto-Connection Handshake
# ─────────────────────────────────────────────────────────────────────────────
log_section "SECTION 8 — Secret Generation & Environment Configuration"

log_step "Generating cryptographic secrets..."

# ── 8.1  Generate tokens ──────────────────────────────────────────────────────
TOKEN=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)

log_ok "DAEMON_TOKEN generated (${#TOKEN} hex chars)."
log_ok "JWT_SECRET generated (${#JWT_SECRET} hex chars)."
log_ok "JWT_REFRESH_SECRET generated (${#JWT_REFRESH_SECRET} hex chars)."

# Build the DATABASE_URL for Prisma
DATABASE_URL="mysql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:3306/${DB_NAME}"

# ── 8.2  Write /opt/arc-panel/daemon/.env ────────────────────────────────────
log_step "Writing daemon environment file..."
cat > /opt/arc-panel/daemon/.env <<ENVEOF
# Arc Panel Daemon — Environment Configuration
# Generated by install.sh on $(date '+%Y-%m-%d %H:%M:%S')
# DO NOT commit this file to version control.

NODE_ENV=production

# Daemon authentication token (shared with backend)
DAEMON_TOKEN=${TOKEN}

# Ports
DAEMON_PORT=8085
SFTP_PORT=2022

# Data directories
DATA_DIR=/var/lib/arc-panel/servers
BACKUP_DIR=/var/lib/arc-panel/backups

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/arc-panel/daemon.log
ENVEOF

chmod 640 /opt/arc-panel/daemon/.env
chown arc-panel:arc-panel /opt/arc-panel/daemon/.env
log_ok "daemon/.env written."

# ── 8.3  Write /opt/arc-panel/backend/.env ───────────────────────────────────
log_step "Writing backend environment file..."
cat > /opt/arc-panel/backend/.env <<ENVEOF
# Arc Panel Backend — Environment Configuration
# Generated by install.sh on $(date '+%Y-%m-%d %H:%M:%S')
# DO NOT commit this file to version control.

NODE_ENV=production

# Server
PORT=3001
HOST=0.0.0.0

# Database
DATABASE_URL=${DATABASE_URL}
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}

# JWT Authentication
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Daemon connection (auto-configured)
DAEMON_DEFAULT_URL=http://127.0.0.1:8085
DAEMON_TOKEN=${TOKEN}

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/arc-panel/backend.log

# CORS origins (comma-separated)
CORS_ORIGINS=http://${SERVER_IP}:8080,http://localhost:8080
ENVEOF

chmod 640 /opt/arc-panel/backend/.env
chown arc-panel:arc-panel /opt/arc-panel/backend/.env
log_ok "backend/.env written."

# ── 8.4  Write /opt/arc-panel/panel/.env.local ───────────────────────────────
log_step "Writing frontend environment file..."
cat > /opt/arc-panel/panel/.env.local <<ENVEOF
# Arc Panel Frontend — Environment Configuration
# Generated by install.sh on $(date '+%Y-%m-%d %H:%M:%S')
# DO NOT commit this file to version control.

# Public API URL (accessible from the browser)
NEXT_PUBLIC_API_URL=http://${SERVER_IP}:3001
NEXT_PUBLIC_WS_URL=ws://${SERVER_IP}:3001

# Daemon WebSocket URL (for real-time console/stats)
NEXT_PUBLIC_DAEMON_URL=http://${SERVER_IP}:8085
NEXT_PUBLIC_DAEMON_WS_URL=ws://${SERVER_IP}:8085

# Build info
NEXT_PUBLIC_APP_VERSION=1.0.0
ENVEOF

chmod 640 /opt/arc-panel/panel/.env.local
chown arc-panel:arc-panel /opt/arc-panel/panel/.env.local
log_ok "panel/.env.local written."

# ── 8.5  Save master credentials file ────────────────────────────────────────
log_step "Saving master credentials file to /etc/arc-panel/credentials..."
cat > /etc/arc-panel/credentials <<CREDEOF
# Arc Panel — Master Credentials File
# Generated: $(date '+%Y-%m-%d %H:%M:%S')
# Location: /etc/arc-panel/credentials
# KEEP THIS FILE SECURE — chmod 600

DB_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}
DATABASE_URL=${DATABASE_URL}

DAEMON_TOKEN=${TOKEN}
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}

SERVER_IP=${SERVER_IP}
CREDEOF

chmod 600 /etc/arc-panel/credentials
log_ok "Credentials saved to /etc/arc-panel/credentials"

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 9 — Database Setup (Prisma Migrations & Seeding)
# ─────────────────────────────────────────────────────────────────────────────
log_section "SECTION 9 — Database Migrations & Seeding"

# ── 9.1  Install backend dependencies ────────────────────────────────────────
log_step "Installing backend npm dependencies..."
cd /opt/arc-panel/backend

if [[ -f package.json ]]; then
  # Run npm install as arc-panel user to set correct ownership
  sudo -u arc-panel npm install --production=false
  log_ok "Backend npm install complete."
else
  log_warn "backend/package.json not found — skipping npm install."
fi

# ── 9.2  Prisma generate ─────────────────────────────────────────────────────
if [[ -f /opt/arc-panel/backend/node_modules/.bin/prisma ]]; then
  log_step "Running prisma generate..."
  cd /opt/arc-panel/backend
  sudo -u arc-panel DATABASE_URL="${DATABASE_URL}" \
    npx prisma generate
  log_ok "Prisma client generated."
else
  log_warn "Prisma not found in node_modules — skipping prisma generate."
fi

# ── 9.3  Prisma migrations ───────────────────────────────────────────────────
if [[ -d /opt/arc-panel/backend/prisma/migrations ]]; then
  log_step "Running prisma migrate deploy..."
  cd /opt/arc-panel/backend
  sudo -u arc-panel DATABASE_URL="${DATABASE_URL}" \
    npx prisma migrate deploy
  log_ok "Prisma migrations applied."
elif [[ -f /opt/arc-panel/backend/prisma/schema.prisma ]]; then
  log_step "No migrations folder found — running prisma db push..."
  cd /opt/arc-panel/backend
  sudo -u arc-panel DATABASE_URL="${DATABASE_URL}" \
    npx prisma db push --accept-data-loss
  log_ok "Database schema pushed."
else
  log_warn "No Prisma schema found — skipping database migration."
fi

# ── 9.4  Database seeding ─────────────────────────────────────────────────────
log_step "Seeding database (admin user, local node, allocations)..."
cd /opt/arc-panel/backend

if [[ -f prisma/seed.ts ]]; then
  sudo -u arc-panel \
    DATABASE_URL="${DATABASE_URL}" \
    DAEMON_TOKEN="${TOKEN}" \
    DAEMON_URL="http://127.0.0.1:8085" \
    SERVER_IP="${SERVER_IP}" \
    npx ts-node prisma/seed.ts && \
    log_ok "Database seed complete." || \
    log_warn "Seed script returned non-zero — may already be seeded."

elif [[ -f prisma/seed.js ]]; then
  sudo -u arc-panel \
    DATABASE_URL="${DATABASE_URL}" \
    DAEMON_TOKEN="${TOKEN}" \
    DAEMON_URL="http://127.0.0.1:8085" \
    SERVER_IP="${SERVER_IP}" \
    node prisma/seed.js && \
    log_ok "Database seed complete." || \
    log_warn "Seed script returned non-zero — may already be seeded."
else
  log_warn "No seed file found at prisma/seed.ts or prisma/seed.js."
  log_info "Attempting manual SQL seed as fallback..."

  # Insert admin user with bcrypt hash of 'admin'
  # This is the bcrypt hash of 'admin' with cost 12 — safe default placeholder
  ADMIN_HASH='$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeAHXxHXVa6qiZMey'

  mysql -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" <<SQLEOF || true
-- Create admin user if not exists
INSERT IGNORE INTO users (id, email, username, password, role, createdAt, updatedAt)
VALUES (
  UNHEX(REPLACE(UUID(), '-', '')),
  'admin@arcpanel.local',
  'admin',
  '${ADMIN_HASH}',
  'ADMIN',
  NOW(),
  NOW()
);
SQLEOF
  log_info "Fallback SQL seed attempted."
fi

# ── 9.5  Inject daemon token via SQL (fallback/guarantee) ────────────────────
log_step "Injecting daemon token into nodes table via SQL (guarantee)..."

mysql -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" <<SQLEOF || log_warn "SQL token injection: table 'nodes' may not exist yet."
-- Update the daemon token on the local node (created by seed)
UPDATE nodes SET daemonToken='${TOKEN}' WHERE name='local';
SQLEOF

log_ok "Daemon token injection attempted."

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 10 — Frontend Build
# ─────────────────────────────────────────────────────────────────────────────
log_section "SECTION 10 — Frontend (Next.js) Build"

if [[ -f /opt/arc-panel/panel/package.json ]]; then
  log_step "Installing frontend dependencies..."
  cd /opt/arc-panel/panel
  sudo -u arc-panel npm install
  log_ok "Frontend npm install complete."

  log_step "Building Next.js frontend (production)..."
  sudo -u arc-panel \
    NEXT_PUBLIC_API_URL="http://${SERVER_IP}:3001" \
    NEXT_PUBLIC_DAEMON_WS_URL="ws://${SERVER_IP}:8085" \
    npm run build

  log_ok "Next.js build complete."

  # Verify production build output exists
  if [[ -f /opt/arc-panel/panel/.next/BUILD_ID ]]; then
    log_ok "Next.js production build (.next/BUILD_ID) verified — ready for serving."
  else
    log_warn ".next/BUILD_ID not found. Check build output above."
  fi

else
  log_warn "panel/package.json not found — skipping frontend build."
fi

# Fix ownership after npm operations
chown -R arc-panel:arc-panel /opt/arc-panel/panel

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 11 — Daemon Build
# ─────────────────────────────────────────────────────────────────────────────
log_section "SECTION 11 — Daemon Build"

if [[ -f /opt/arc-panel/daemon/package.json ]]; then
  log_step "Installing daemon dependencies..."
  cd /opt/arc-panel/daemon
  sudo -u arc-panel npm install
  log_ok "Daemon npm install complete."

  log_step "Building daemon (TypeScript compilation)..."
  if sudo -u arc-panel npm run build; then
    log_ok "Daemon build complete."
  else
    log_warn "Daemon build returned non-zero. Check the log for TypeScript errors."
  fi

  # Verify dist output
  if [[ -f /opt/arc-panel/daemon/dist/index.js ]]; then
    log_ok "Daemon dist/index.js found — ready."
  else
    log_warn "dist/index.js not found. Build may have failed."
  fi

else
  log_warn "daemon/package.json not found — skipping daemon build."
fi

# Fix ownership after npm operations
chown -R arc-panel:arc-panel /opt/arc-panel/daemon

# Also build backend
log_step "Building backend (TypeScript compilation)..."
if [[ -f /opt/arc-panel/backend/package.json ]]; then
  cd /opt/arc-panel/backend
  if sudo -u arc-panel npm run build 2>/dev/null; then
    log_ok "Backend build complete."
  else
    log_warn "Backend build returned non-zero. Check if 'build' script exists."
  fi
  chown -R arc-panel:arc-panel /opt/arc-panel/backend
fi

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 12 — Systemd Service Configuration
# ─────────────────────────────────────────────────────────────────────────────
log_section "SECTION 12 — Systemd Service Configuration"

# ── 12.1  Backend service ──────────────────────────────────────────────────────
log_step "Creating systemd service: arc-panel-backend..."
cat > /etc/systemd/system/arc-panel-backend.service <<'SVCEOF'
[Unit]
Description=Arc Panel — Backend API Server
Documentation=https://github.com/arc-panel/arc-panel
After=network.target mariadb.service
Requires=mariadb.service

[Service]
Type=simple
User=arc-panel
Group=arc-panel
WorkingDirectory=/opt/arc-panel/backend

# Load environment variables from .env file
EnvironmentFile=/opt/arc-panel/backend/.env

# Start the compiled backend
ExecStart=/usr/bin/node dist/index.js

# Restart policy
Restart=always
RestartSec=10
StartLimitIntervalSec=60
StartLimitBurst=5

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/arc-panel /var/lib/arc-panel /var/log/arc-panel /tmp

# Logging
StandardOutput=append:/var/log/arc-panel/backend.log
StandardError=append:/var/log/arc-panel/backend-error.log
SyslogIdentifier=arc-panel-backend

[Install]
WantedBy=multi-user.target
SVCEOF

log_ok "arc-panel-backend.service created."

# ── 12.2  Daemon service ──────────────────────────────────────────────────────
log_step "Creating systemd service: arc-panel-daemon..."
cat > /etc/systemd/system/arc-panel-daemon.service <<'SVCEOF'
[Unit]
Description=Arc Panel — Game Server Daemon
Documentation=https://github.com/arc-panel/arc-panel
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=arc-panel
Group=arc-panel
WorkingDirectory=/opt/arc-panel/daemon

# Load environment variables from .env file
EnvironmentFile=/opt/arc-panel/daemon/.env

# Start the compiled daemon
ExecStart=/usr/bin/node dist/index.js

# Restart policy
Restart=always
RestartSec=10
StartLimitIntervalSec=60
StartLimitBurst=5

# Resource limits — daemon may manage many containers
LimitNOFILE=65536
LimitNPROC=8192

# Security (daemon NEEDS docker.sock — no PrivateDevices/ProtectSystem strict)
NoNewPrivileges=true
ProtectHome=true
ReadWritePaths=/opt/arc-panel/daemon /var/lib/arc-panel /var/log/arc-panel /var/run/docker.sock /tmp

# Docker socket access (supplementary group set above)
SupplementaryGroups=docker

# Logging
StandardOutput=append:/var/log/arc-panel/daemon.log
StandardError=append:/var/log/arc-panel/daemon-error.log
SyslogIdentifier=arc-panel-daemon

[Install]
WantedBy=multi-user.target
SVCEOF

log_ok "arc-panel-daemon.service created."

# ── 12.3  Frontend service ─────────────────────────────────────────────────────
log_step "Creating systemd service: arc-panel-frontend..."
cat > /etc/systemd/system/arc-panel-frontend.service <<'SVCEOF'
[Unit]
Description=Arc Panel — Frontend (Next.js)
Documentation=https://github.com/arc-panel/arc-panel
After=network.target arc-panel-backend.service

[Service]
Type=simple
User=arc-panel
Group=arc-panel
WorkingDirectory=/opt/arc-panel/panel

# Runtime environment for Next.js standalone server
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=HOSTNAME=0.0.0.0

# Load public env vars
EnvironmentFile=/opt/arc-panel/panel/.env.local

# Start the Next.js production server on port 8080
ExecStart=/usr/bin/npm run start -- -p 8080 -H 0.0.0.0

# Restart policy
Restart=always
RestartSec=10
StartLimitIntervalSec=60
StartLimitBurst=5

# Resource limits
LimitNOFILE=65536

# Security hardening
NoNewPrivileges=true
ProtectHome=true
ReadWritePaths=/opt/arc-panel /var/log/arc-panel /tmp

# Logging
StandardOutput=append:/var/log/arc-panel/frontend.log
StandardError=append:/var/log/arc-panel/frontend-error.log
SyslogIdentifier=arc-panel-frontend

[Install]
WantedBy=multi-user.target
SVCEOF

log_ok "arc-panel-frontend.service created."

# ── 12.4  Reload and enable services ──────────────────────────────────────────
log_step "Reloading systemd daemon..."
systemctl daemon-reload

log_step "Enabling Arc Panel services..."
systemctl enable arc-panel-daemon arc-panel-backend arc-panel-frontend
log_ok "Services enabled for auto-start on boot."

# ── 12.5  Configure logrotate for Arc Panel logs ──────────────────────────────
log_step "Configuring log rotation..."
cat > /etc/logrotate.d/arc-panel <<'LREOF'
/var/log/arc-panel/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    copytruncate
    su arc-panel arc-panel
}
LREOF
log_ok "Log rotation configured."

# ── 12.6  Start services in correct order ────────────────────────────────────
log_step "Starting Arc Panel Daemon (first — backend depends on it)..."
systemctl start arc-panel-daemon || log_warn "Daemon start returned non-zero — check status."

log_info "Waiting 5 seconds for daemon to initialise..."
sleep 5

log_step "Starting Arc Panel Backend..."
systemctl start arc-panel-backend || log_warn "Backend start returned non-zero — check status."

log_info "Waiting 5 seconds for backend to initialise..."
sleep 5

log_step "Starting Arc Panel Frontend..."
systemctl start arc-panel-frontend || log_warn "Frontend start returned non-zero — check status."

log_info "Waiting 5 seconds for frontend to initialise..."
sleep 5

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 13 — Health Check & Final Output
# ─────────────────────────────────────────────────────────────────────────────
log_section "SECTION 13 — Health Checks & Completion"

# ── 13.1  Health check function ───────────────────────────────────────────────
health_check() {
  local name="$1"
  local url="$2"
  local max_attempts=10
  local attempt=1
  local wait_sec=3

  log_step "Health check: $name ($url)"
  while [[ $attempt -le $max_attempts ]]; do
    if curl -sf --connect-timeout 3 --max-time 5 "$url" > /dev/null 2>&1; then
      log_ok "$name is UP ✓  (attempt $attempt/$max_attempts)"
      return 0
    else
      log_info "Attempt $attempt/$max_attempts — $name not ready yet, waiting ${wait_sec}s..."
      sleep $wait_sec
      (( attempt++ ))
    fi
  done

  log_warn "$name did not respond within $((max_attempts * wait_sec))s — may still be starting."
  return 1
}

# Check daemon
DAEMON_HEALTHY=false
if health_check "Arc Panel Daemon" "http://127.0.0.1:8085/api/health"; then
  DAEMON_HEALTHY=true
  echo ""
  log_info "Daemon health response:"
  curl -s http://127.0.0.1:8085/api/health | jq . 2>/dev/null || \
    curl -s http://127.0.0.1:8085/api/health
  echo ""
fi

# Check backend
BACKEND_HEALTHY=false
if health_check "Arc Panel Backend" "http://127.0.0.1:3001/api/health"; then
  BACKEND_HEALTHY=true
  echo ""
  log_info "Backend health response:"
  curl -s http://127.0.0.1:3001/api/health | jq . 2>/dev/null || \
    curl -s http://127.0.0.1:3001/api/health
  echo ""
fi

# Check frontend (returns HTML, just check HTTP status)
FRONTEND_HEALTHY=false
if health_check "Arc Panel Frontend" "http://127.0.0.1:8080"; then
  FRONTEND_HEALTHY=true
fi

# ── 13.2  Service status summary ─────────────────────────────────────────────
echo ""
log_step "Service status overview:"
echo ""
systemctl is-active --quiet arc-panel-daemon   && \
  echo -e "  ${GREEN}●${NC} arc-panel-daemon   ${GREEN}active${NC}" || \
  echo -e "  ${YELLOW}●${NC} arc-panel-daemon   ${YELLOW}inactive${NC}"

systemctl is-active --quiet arc-panel-backend  && \
  echo -e "  ${GREEN}●${NC} arc-panel-backend  ${GREEN}active${NC}" || \
  echo -e "  ${YELLOW}●${NC} arc-panel-backend  ${YELLOW}inactive${NC}"

systemctl is-active --quiet arc-panel-frontend && \
  echo -e "  ${GREEN}●${NC} arc-panel-frontend ${GREEN}active${NC}" || \
  echo -e "  ${YELLOW}●${NC} arc-panel-frontend ${YELLOW}inactive${NC}"
echo ""

# ── 13.3  Completion banner ───────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
cat << 'EOF'
  ╔═══════════════════════════════════════════════════════════════════════════╗
  ║                                                                           ║
  ║        ✅  Arc Panel Installation Complete!                               ║
  ║                                                                           ║
  ╚═══════════════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${CYAN}${BOLD}  ┌─────────────────────────────────────────────────────────────────────┐${NC}"
echo -e "${CYAN}${BOLD}  │  Access Information                                                 │${NC}"
echo -e "${CYAN}${BOLD}  ├─────────────────────────────────────────────────────────────────────┤${NC}"
echo -e "${CYAN}  │${NC}  Panel URL       : ${GREEN}${BOLD}http://${SERVER_IP}:8080${NC}"
echo -e "${CYAN}  │${NC}  Backend API     : ${BLUE}http://${SERVER_IP}:3001${NC}"
echo -e "${CYAN}  │${NC}  Daemon API      : ${BLUE}http://${SERVER_IP}:8085${NC}"
echo -e "${CYAN}${BOLD}  ├─────────────────────────────────────────────────────────────────────┤${NC}"
echo -e "${CYAN}${BOLD}  │  Default Credentials                                                │${NC}"
echo -e "${CYAN}${BOLD}  ├─────────────────────────────────────────────────────────────────────┤${NC}"
echo -e "${CYAN}  │${NC}  Username        : ${YELLOW}${BOLD}admin${NC}"
echo -e "${CYAN}  │${NC}  Password        : ${YELLOW}${BOLD}admin${NC}  ${YELLOW}← CHANGE THIS IMMEDIATELY${NC}"
echo -e "${CYAN}${BOLD}  ├─────────────────────────────────────────────────────────────────────┤${NC}"
echo -e "${CYAN}${BOLD}  │  Daemon Token (save this!)                                          │${NC}"
echo -e "${CYAN}${BOLD}  ├─────────────────────────────────────────────────────────────────────┤${NC}"
echo -e "${CYAN}  │${NC}  Token           : ${BLUE}${TOKEN}${NC}"
echo -e "${CYAN}${BOLD}  ├─────────────────────────────────────────────────────────────────────┤${NC}"
echo -e "${CYAN}${BOLD}  │  Files & Logs                                                       │${NC}"
echo -e "${CYAN}${BOLD}  ├─────────────────────────────────────────────────────────────────────┤${NC}"
echo -e "${CYAN}  │${NC}  Install Log     : ${BLUE}/var/log/arc-panel-install.log${NC}"
echo -e "${CYAN}  │${NC}  Service Logs    : ${BLUE}/var/log/arc-panel/*.log${NC}"
echo -e "${CYAN}  │${NC}  Credentials     : ${BLUE}/etc/arc-panel/credentials${NC}"
echo -e "${CYAN}  │${NC}  App Directory   : ${BLUE}/opt/arc-panel${NC}"
echo -e "${CYAN}  │${NC}  Server Data     : ${BLUE}/var/lib/arc-panel/servers${NC}"
echo -e "${CYAN}${BOLD}  ├─────────────────────────────────────────────────────────────────────┤${NC}"
echo -e "${CYAN}${BOLD}  │  Service Management                                                 │${NC}"
echo -e "${CYAN}${BOLD}  ├─────────────────────────────────────────────────────────────────────┤${NC}"
echo -e "${CYAN}  │${NC}  Start all    : ${GREEN}systemctl start arc-panel-daemon arc-panel-backend arc-panel-frontend${NC}"
echo -e "${CYAN}  │${NC}  Stop all     : ${GREEN}systemctl stop arc-panel-frontend arc-panel-backend arc-panel-daemon${NC}"
echo -e "${CYAN}  │${NC}  Status       : ${GREEN}systemctl status arc-panel-backend${NC}"
echo -e "${CYAN}  │${NC}  Logs         : ${GREEN}journalctl -u arc-panel-backend -f${NC}"
echo -e "${CYAN}${BOLD}  └─────────────────────────────────────────────────────────────────────┘${NC}"
echo ""

echo -e "${YELLOW}${BOLD}  ⚠️  SECURITY REMINDERS:${NC}"
echo -e "${YELLOW}  1. Change the default admin password immediately after first login.${NC}"
echo -e "${YELLOW}  2. Keep /etc/arc-panel/credentials file secure (chmod 600).${NC}"
echo -e "${YELLOW}  3. Consider setting up SSL/TLS (Nginx reverse proxy + Certbot).${NC}"
echo -e "${YELLOW}  4. Regularly rotate the DAEMON_TOKEN and JWT secrets.${NC}"
echo ""

if [[ "$DAEMON_HEALTHY" == "false" ]] || [[ "$BACKEND_HEALTHY" == "false" ]]; then
  echo -e "${YELLOW}  Some services may not have started correctly."
  echo -e "  Check logs with: journalctl -u arc-panel-daemon -n 50${NC}"
  echo ""
fi

echo -e "${GREEN}  Installation completed at: $(date '+%Y-%m-%d %H:%M:%S %Z')${NC}"
echo -e "${GREEN}  Full log saved to: $LOG_FILE${NC}"
echo ""

exit 0
