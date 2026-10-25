#!/usr/bin/env bash
# =============================================================================
#  Arc Panel — Production Update Script
#  Updates Arc Panel to the latest version from GitHub without losing data
#
#  Usage:
#    sudo bash update.sh
#    sudo bash update.sh --branch main
#    sudo bash update.sh --port 8050
#    curl -sSL https://raw.githubusercontent.com/shauryapatel044-dotcom/arc-panel/main/update.sh | sudo bash
# =============================================================================

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Colour Codes & Logging Helpers
# ─────────────────────────────────────────────────────────────────────────────
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

# ─────────────────────────────────────────────────────────────────────────────
# Pre-flight Checks
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$EUID" -ne 0 ]]; then
  log_fatal "This script must be run as root. Use: sudo bash update.sh"
fi

if [[ ! -d /opt/arc-panel ]]; then
  log_fatal "/opt/arc-panel directory not found! Arc Panel does not appear to be installed on this server. Run install.sh first."
fi

# ─────────────────────────────────────────────────────────────────────────────
# CLI Options & Defaults
# ─────────────────────────────────────────────────────────────────────────────
REPO_URL="${REPO_URL:-https://github.com/shauryapatel044-dotcom/arc-panel.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
CUSTOM_PORT="${PANEL_PORT:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      GIT_BRANCH="$2"
      shift 2
      ;;
    --port|--panel-port)
      CUSTOM_PORT="$2"
      shift 2
      ;;
    --port=*)
      CUSTOM_PORT="${1#*=}"
      shift
      ;;
    --panel-port=*)
      CUSTOM_PORT="${1#*=}"
      shift
      ;;
    --repo|--repo-url)
      REPO_URL="$2"
      shift 2
      ;;
    http*://*.git|git@*.git)
      REPO_URL="$1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

clear 2>/dev/null || true
echo -e "${CYAN}${BOLD}"
cat << 'EOF'
  ___           ____                  _
 / _ \  _ __  / ___| ___  ___  ___  | |  __ _ ___
| | | || '__|| |    / _ \/ __|/ __| | | / _` / __|
| |_| || |   | |___| (_) \__ \\__ \ | || (_| \__ \
 \___/ |_|    \____|\___/|___/|___/ |_| \__,_|___/

               A r c   P a n e l   U p d a t e r
            Updating to Latest Release from GitHub
EOF
echo -e "${NC}"
echo -e "${BLUE}${BOLD}  Repository :${NC} $REPO_URL"
echo -e "${BLUE}${BOLD}  Branch     :${NC} $GIT_BRANCH"
echo -e "${BLUE}${BOLD}  Date       :${NC} $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Load Existing Configuration
# ─────────────────────────────────────────────────────────────────────────────
log_section "1. Reading Existing Configuration"

SERVER_IP=""
PANEL_PORT=""
DATABASE_URL=""
TOKEN=""

# 1. Check credentials file
if [[ -f /etc/arc-panel/credentials ]]; then
  log_info "Loading credentials from /etc/arc-panel/credentials..."
  source /etc/arc-panel/credentials || true
  TOKEN="${DAEMON_TOKEN:-${TOKEN:-}}"
fi

# 2. Extract port from frontend systemd service or .env.local if not already set
if [[ -n "$CUSTOM_PORT" ]]; then
  PANEL_PORT="$CUSTOM_PORT"
  log_info "Using user-specified panel port: $PANEL_PORT"
elif [[ -z "$PANEL_PORT" ]] && [[ -f /etc/systemd/system/arc-panel-frontend.service ]]; then
  PANEL_PORT=$(grep -E "^Environment=PORT=" /etc/systemd/system/arc-panel-frontend.service 2>/dev/null | cut -d'=' -f3 || true)
fi

# 3. Port conflict fallback: if port 8080 is in use, fallback to 8050
check_port_in_use() {
  local p="$1"
  if command -v ss &>/dev/null; then
    ss -tuln 2>/dev/null | grep -qE "(:|\])${p}\b" && return 0
  fi
  if command -v netstat &>/dev/null; then
    netstat -tuln 2>/dev/null | grep -qE "(:|\])${p}\b" && return 0
  fi
  if command -v lsof &>/dev/null; then
    lsof -i ":${p}" &>/dev/null && return 0
  fi
  return 1
}

if [[ -z "$PANEL_PORT" ]] || [[ "$PANEL_PORT" == "8080" ]]; then
  # If 8080 was in use by another non-arc process, switch to 8050
  if check_port_in_use 8080 && ! pgrep -f "arc-panel.*8080" &>/dev/null; then
    log_warn "Port 8080 is currently occupied by another process! Using port 8050."
    PANEL_PORT=8050
  else
    PANEL_PORT="${PANEL_PORT:-8080}"
  fi
fi

# 4. Resolve Server IP
if [[ -z "$SERVER_IP" ]]; then
  SERVER_IP=$(curl -4 -fsSL --connect-timeout 5 https://api.ipify.org 2>/dev/null || \
              curl -4 -fsSL --connect-timeout 5 https://ifconfig.me 2>/dev/null || \
              hostname -I | awk '{print $1}' 2>/dev/null || \
              echo "127.0.0.1")
fi

# 5. Extract DATABASE_URL from backend/.env if missing
if [[ -z "$DATABASE_URL" ]] && [[ -f /opt/arc-panel/backend/.env ]]; then
  DATABASE_URL=$(grep -E "^DATABASE_URL=" /opt/arc-panel/backend/.env | cut -d'=' -f2- || true)
fi

log_ok "Configuration verified: IP=${SERVER_IP}, Port=${PANEL_PORT}"

# ─────────────────────────────────────────────────────────────────────────────
# 2. Pull Latest Code from GitHub
# ─────────────────────────────────────────────────────────────────────────────
log_section "2. Downloading Latest Code from GitHub"

log_step "Cloning branch '${GIT_BRANCH}' from ${REPO_URL}..."
rm -rf /tmp/arc-panel-update
git clone --depth 1 --branch "$GIT_BRANCH" "$REPO_URL" /tmp/arc-panel-update 2>/dev/null || \
  git clone --depth 1 "$REPO_URL" /tmp/arc-panel-update

COMMIT_HASH=$(cd /tmp/arc-panel-update && git rev-parse --short HEAD 2>/dev/null || echo "latest")
log_ok "Downloaded commit: ${GREEN}${COMMIT_HASH}${NC}"

# ─────────────────────────────────────────────────────────────────────────────
# 3. Stop Running Services
# ─────────────────────────────────────────────────────────────────────────────
log_section "3. Stopping Active Arc Panel Services"

for svc in arc-panel-frontend arc-panel-backend arc-panel-daemon; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    log_step "Stopping ${svc}..."
    systemctl stop "$svc" 2>/dev/null || true
  fi
done
log_ok "Services stopped for clean upgrade."

# ─────────────────────────────────────────────────────────────────────────────
# 4. Sync Code Files (Preserving Configs & Data)
# ─────────────────────────────────────────────────────────────────────────────
log_section "4. Updating Application Files"

if command -v rsync &>/dev/null; then
  # Panel
  if [[ -d /tmp/arc-panel-update/panel ]]; then
    rsync -a --exclude='.next' --exclude='node_modules' --exclude='.env*' \
      /tmp/arc-panel-update/panel/ /opt/arc-panel/panel/
    log_ok "panel/ updated."
  fi

  # Backend
  if [[ -d /tmp/arc-panel-update/backend ]]; then
    rsync -a --exclude='dist' --exclude='node_modules' --exclude='.env' \
      /tmp/arc-panel-update/backend/ /opt/arc-panel/backend/
    log_ok "backend/ updated."
  fi

  # Daemon
  if [[ -d /tmp/arc-panel-update/daemon ]]; then
    rsync -a --exclude='dist' --exclude='node_modules' --exclude='.env' \
      /tmp/arc-panel-update/daemon/ /opt/arc-panel/daemon/
    log_ok "daemon/ updated."
  fi

  # Eggs & docker-compose
  if [[ -d /tmp/arc-panel-update/eggs ]]; then
    mkdir -p /opt/arc-panel/eggs
    rsync -a /tmp/arc-panel-update/eggs/ /opt/arc-panel/eggs/
    log_ok "eggs/ updated."
  fi
else
  # Fallback cp if rsync is not available
  cp -r /tmp/arc-panel-update/panel/* /opt/arc-panel/panel/ 2>/dev/null || true
  cp -r /tmp/arc-panel-update/backend/* /opt/arc-panel/backend/ 2>/dev/null || true
  cp -r /tmp/arc-panel-update/daemon/* /opt/arc-panel/daemon/ 2>/dev/null || true
  cp -r /tmp/arc-panel-update/eggs/* /opt/arc-panel/eggs/ 2>/dev/null || true
fi

rm -rf /tmp/arc-panel-update
log_ok "All files synced."

# ─────────────────────────────────────────────────────────────────────────────
# 5. Update Environment Configuration
# ─────────────────────────────────────────────────────────────────────────────
log_section "5. Updating Environment & Port Settings"

# Ensure backend .env has PANEL_URL and CORS_ORIGINS updated
if [[ -f /opt/arc-panel/backend/.env ]]; then
  sed -i '/^PANEL_URL=/d' /opt/arc-panel/backend/.env 2>/dev/null || true
  sed -i '/^CORS_ORIGINS=/d' /opt/arc-panel/backend/.env 2>/dev/null || true
  echo "PANEL_URL=http://${SERVER_IP}:${PANEL_PORT}" >> /opt/arc-panel/backend/.env
  echo "CORS_ORIGINS=http://${SERVER_IP}:${PANEL_PORT},http://localhost:${PANEL_PORT}" >> /opt/arc-panel/backend/.env
fi

# Ensure frontend .env.local has port updated
if [[ -f /opt/arc-panel/panel/.env.local ]]; then
  sed -i '/^NEXT_PUBLIC_PANEL_PORT=/d' /opt/arc-panel/panel/.env.local 2>/dev/null || true
  echo "NEXT_PUBLIC_PANEL_PORT=${PANEL_PORT}" >> /opt/arc-panel/panel/.env.local
fi

# Ensure master credentials has port updated
if [[ -f /etc/arc-panel/credentials ]]; then
  sed -i '/^PANEL_PORT=/d' /etc/arc-panel/credentials 2>/dev/null || true
  sed -i '/^PANEL_URL=/d' /etc/arc-panel/credentials 2>/dev/null || true
  echo "PANEL_PORT=${PANEL_PORT}" >> /etc/arc-panel/credentials
  echo "PANEL_URL=http://${SERVER_IP}:${PANEL_PORT}" >> /etc/arc-panel/credentials
fi

# Update UFW firewall
if command -v ufw &>/dev/null; then
  ufw allow "${PANEL_PORT}/tcp" comment "Arc Panel Frontend" 2>/dev/null || true
fi

# ─────────────────────────────────────────────────────────────────────────────
# 6. Rebuild Backend, Daemon & Panel
# ─────────────────────────────────────────────────────────────────────────────
log_section "6. Building Services"

# 6.1 Backend
log_step "Installing backend dependencies & rebuilding..."
cd /opt/arc-panel/backend
sudo -u arc-panel npm install --production=false
if [[ -f node_modules/.bin/prisma ]]; then
  log_step "Running Prisma generate & schema sync..."
  sudo -u arc-panel DATABASE_URL="${DATABASE_URL}" npx prisma generate
  sudo -u arc-panel DATABASE_URL="${DATABASE_URL}" npx prisma db push --skip-generate 2>/dev/null || true

  # Ensure local node publicIp and allocations are updated to VPS IP
  if [[ -n "$SERVER_IP" ]] && [[ "$SERVER_IP" != "127.0.0.1" ]]; then
    log_step "Updating database with detected VPS IP (${SERVER_IP})..."
    mysql -u "${DB_USER:-arcpanel}" -p"${DB_PASSWORD:-}" "${DB_NAME:-arcpanel}" <<SQLEOF 2>/dev/null || true
UPDATE nodes SET publicIp='${SERVER_IP}' WHERE publicIp IS NULL OR publicIp='127.0.0.1' OR publicIp='';
UPDATE allocations SET ip='${SERVER_IP}' WHERE ip='127.0.0.1' OR ip='0.0.0.0' OR ip='';
SQLEOF
  fi
fi
sudo -u arc-panel npm run build
log_ok "Backend rebuilt successfully."

# 6.2 Daemon
log_step "Installing daemon dependencies & rebuilding..."
cd /opt/arc-panel/daemon
sudo -u arc-panel npm install
sudo -u arc-panel npm run build
log_ok "Daemon rebuilt successfully."

# 6.3 Panel Frontend
log_step "Installing frontend dependencies & building Next.js (port ${PANEL_PORT})..."
cd /opt/arc-panel/panel
sudo -u arc-panel npm install
sudo -u arc-panel \
  NEXT_PUBLIC_API_URL="http://${SERVER_IP}:3001" \
  NEXT_PUBLIC_DAEMON_WS_URL="ws://${SERVER_IP}:8085" \
  NEXT_PUBLIC_PANEL_PORT="${PANEL_PORT}" \
  npm run build
log_ok "Frontend rebuilt successfully."

# Set permissions
chown -R arc-panel:arc-panel /opt/arc-panel
chmod -R 755 /opt/arc-panel

# ─────────────────────────────────────────────────────────────────────────────
# 7. Update Systemd Unit & Restart Services
# ─────────────────────────────────────────────────────────────────────────────
log_section "7. Updating Systemd Services & Starting Up"

NPM_BIN="$(command -v npm || echo /usr/bin/npm)"

# Update frontend systemd unit with exact port
cat > /etc/systemd/system/arc-panel-frontend.service <<SVCEOF
[Unit]
Description=Arc Panel — Frontend (Next.js)
Documentation=https://github.com/shauryapatel044-dotcom/arc-panel
After=network.target arc-panel-backend.service

[Service]
Type=simple
User=arc-panel
Group=arc-panel
WorkingDirectory=/opt/arc-panel/panel

Environment=NODE_ENV=production
Environment=PORT=${PANEL_PORT}
Environment=HOSTNAME=0.0.0.0

EnvironmentFile=/opt/arc-panel/panel/.env.local

ExecStart=${NPM_BIN} run start -- -p ${PANEL_PORT} -H 0.0.0.0

Restart=always
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=5
LimitNOFILE=65536
NoNewPrivileges=true
ProtectHome=true
ReadWritePaths=/opt/arc-panel /var/log/arc-panel /tmp
StandardOutput=append:/var/log/arc-panel/frontend.log
StandardError=append:/var/log/arc-panel/frontend-error.log
SyslogIdentifier=arc-panel-frontend

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload

log_step "Starting Arc Panel Daemon..."
systemctl restart arc-panel-daemon
sleep 3

log_step "Starting Arc Panel Backend..."
systemctl restart arc-panel-backend
sleep 3

log_step "Starting Arc Panel Frontend..."
systemctl restart arc-panel-frontend
sleep 5

# ─────────────────────────────────────────────────────────────────────────────
# 8. Health Checks & Verification
# ─────────────────────────────────────────────────────────────────────────────
log_section "8. Verifying Service Health"

health_check() {
  local name="$1"
  local url="$2"
  local max_attempts=8
  local attempt=1
  local wait_sec=2

  log_step "Health check: $name ($url)"
  while [[ $attempt -le $max_attempts ]]; do
    if curl -sf --connect-timeout 3 --max-time 5 "$url" > /dev/null 2>&1; then
      log_ok "$name is UP ✓  (attempt $attempt/$max_attempts)"
      return 0
    fi
    sleep $wait_sec
    (( attempt++ ))
  done

  log_warn "$name did not respond within $((max_attempts * wait_sec))s — may still be starting."
  return 1
}

health_check "Arc Panel Daemon" "http://127.0.0.1:8085/api/health" || true
health_check "Arc Panel Backend" "http://127.0.0.1:3001/api/health" || true
health_check "Arc Panel Frontend" "http://127.0.0.1:${PANEL_PORT}" || true

echo ""
echo -e "${GREEN}${BOLD}"
cat << 'EOF'
  ╔═══════════════════════════════════════════════════════════════════════════╗
  ║                                                                           ║
  ║        ✅  Arc Panel Update Complete!                                     ║
  ║                                                                           ║
  ╚═══════════════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${CYAN}${BOLD}  ┌─────────────────────────────────────────────────────────────────────┐${NC}"
echo -e "${CYAN}${BOLD}  │  Updated Service Information                                        │${NC}"
echo -e "${CYAN}${BOLD}  ├─────────────────────────────────────────────────────────────────────┤${NC}"
echo -e "${CYAN}  │${NC}  Panel URL       : ${GREEN}${BOLD}http://${SERVER_IP}:${PANEL_PORT}${NC}"
echo -e "${CYAN}  │${NC}  Backend API     : ${BLUE}http://${SERVER_IP}:3001${NC}"
echo -e "${CYAN}  │${NC}  Daemon API      : ${BLUE}http://${SERVER_IP}:8085${NC}"
echo -e "${CYAN}  │${NC}  Git Commit      : ${BLUE}${COMMIT_HASH}${NC}"
echo -e "${CYAN}${BOLD}  ├─────────────────────────────────────────────────────────────────────┤${NC}"
echo -e "${CYAN}${BOLD}  │  Status Check                                                       │${NC}"
echo -e "${CYAN}${BOLD}  ├─────────────────────────────────────────────────────────────────────┤${NC}"
echo -e "${CYAN}  │${NC}  systemctl status arc-panel-frontend"
echo -e "${CYAN}  │${NC}  journalctl -u arc-panel-frontend -f"
echo -e "${CYAN}${BOLD}  └─────────────────────────────────────────────────────────────────────┘${NC}"
echo ""

exit 0
