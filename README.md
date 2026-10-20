# Arc Panel

> **Production-ready, self-hosted game server control panel** — manage Minecraft, Palworld, Rust, CS2, and more from a beautiful web interface.

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Quick Install (Ubuntu VPS)](#quick-install)
5. [Docker Compose Deployment](#docker-compose-deployment)
6. [Manual Development Setup](#manual-development-setup)
7. [Port Reference](#port-reference)
8. [Default Credentials](#default-credentials)
9. [Supported Server Types (Eggs)](#supported-server-types)
10. [Contributing](#contributing)

---

## Overview

Arc Panel is an open-source alternative to Pterodactyl Panel, designed for simplicity, performance, and extensibility. It uses a **daemon-based architecture** where a lightweight daemon process runs on each node and manages game server containers via Docker, while the web panel provides a unified control interface.

---

## Features

| Feature | Description |
|---|---|
| 🎮 **Multi-game Support** | Minecraft Java/Bedrock, Palworld, Rust, CS2, Python, Node.js and more |
| 🐳 **Docker Isolation** | Every game server runs in its own Docker container with cgroup limits |
| 🧩 **1-Click Plugins & Mods** | Search Modrinth live + curated 1-click catalog (EssentialsX, LuckPerms, Geyser, etc.) |
| 🗄️ **Server Databases** | On-demand isolated MariaDB databases provisioned per server with JDBC/CLI strings |
| 👥 **Team & Sub-Users** | Invite collaborators with granular permissions (power, console, files, backups, DBs) |
| 🔔 **Discord Webhooks & Audit** | Real-time crash & power state Discord alerts, plus complete server audit trail |
| 🌐 **Custom Domains** | Client custom domain setup with auto-generated SRV, CNAME, and A DNS records & verification |
| 🐙 **GitHub Repo Sync** | Connect GitHub repositories via Personal Access Token (`ghp_...`) with branch selection & auto-pull webhooks |
| 🚇 **Tunnel & Non-IPv4 VPS** | Admin node domains, fallback VPS IP, and Playit.gg / Cloudflare Tunnel gating for private hosts |
| 🔌 **Port & Network Manager** | Multi-port allocations with 1-click presets for Geyser Bedrock, Dynmap, and Voice Chat |
| 📁 **File Manager** | Browser-based code/config editor, drag-and-drop uploads, and secure SFTP access |
| 🖥️ **Live Console** | Ultra-low-latency xterm.js terminal stream with container command stdin |
| 📊 **Resource Monitoring** | Real-time CPU, RAM, and disk utilization charts with live watchdog tracking |
| 💾 **Automated Backups** | Tar/Gzip snapshots with 1-click instant rollback and download |
| 🔐 **Role-Based Access** | Granular user roles, 2FA TOTP authentication, and session management |
| 🌐 **Multi-node Ready** | Manage distributed game server nodes across multiple physical hosts |
| 🔑 **API-first** | Comprehensive REST & WebSocket API for external automation |
| ⚡ **Instant 1-Line Deploy** | Single bash command installs and configures the entire stack on Ubuntu VPS |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                              │
│                    http://<IP>:8080  (Next.js)                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP / REST
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     PANEL (Next.js Frontend)                        │
│              Port 8080  |  /opt/arc-panel/panel                     │
│   Server-Side Rendering  +  React Client Components                 │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP REST + WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND (Express + Prisma)                       │
│              Port 3001  |  /opt/arc-panel/backend                   │
│   Auth  •  Server CRUD  •  User Management  •  Node Registry        │
└──────────┬──────────────────────────────────────┬───────────────────┘
           │ MySQL Protocol                       │ HTTP + Bearer Token
           ▼                                      ▼
┌──────────────────────┐              ┌────────────────────────────────┐
│   MariaDB Database   │              │  DAEMON (Node.js + Docker SDK) │
│      Port 3306       │              │  Port 8085  •  SFTP 2022       │
│  /var/lib/mysql      │              │  /opt/arc-panel/daemon         │
└──────────────────────┘              │                                │
                                      │  Manages Docker containers:    │
                                      │  ┌──────────┐ ┌─────────────┐ │
                                      │  │ Minecraft│ │  Palworld   │ │
                                      │  └──────────┘ └─────────────┘ │
                                      │  ┌──────────┐ ┌─────────────┐ │
                                      │  │  Rust    │ │    CS2      │ │
                                      │  └──────────┘ └─────────────┘ │
                                      └────────────────────────────────┘
```

---

## Quick Install

> [!IMPORTANT]
> Requires **Ubuntu 22.04 or 24.04 LTS** with at least **2 CPU cores, 4GB RAM, 20GB disk**.
> Run as **root**.

### One-Line Install Command (Recommended)

```bash
# Fast install (skips slow OS package upgrade, auto-detects free port if 8080 is taken):
curl -sSL https://raw.githubusercontent.com/shauryapatel044-dotcom/arc-panel/main/install.sh | sudo bash -s -- --no-update

# Or specify a custom port explicitly (e.g. 8090):
curl -sSL https://raw.githubusercontent.com/shauryapatel044-dotcom/arc-panel/main/install.sh | sudo bash -s -- --no-update --port 8090
```

### Git Clone Install

```bash
git clone https://github.com/shauryapatel044-dotcom/arc-panel.git /tmp/arc-panel
cd /tmp/arc-panel
sudo bash install.sh --no-update --port 8090
```

The installer will automatically:
- Check for port conflicts (if port 8080 is busy, auto-selects 8090)
- Install all system dependencies (MariaDB, Docker, Node.js 20)
- Configure UFW firewall rules
- Generate all cryptographic secrets
- Build and deploy all three services
- Create systemd services for auto-start on boot
- Run database migrations and seed initial data

### Updating Arc Panel (No Data Loss)

To update an existing Arc Panel installation to the latest version while preserving all database records, game servers, and configs:

```bash
# Standard update:
curl -sSL https://raw.githubusercontent.com/shauryapatel044-dotcom/arc-panel/main/update.sh | sudo bash

# Or update and switch panel port to 8050:
curl -sSL https://raw.githubusercontent.com/shauryapatel044-dotcom/arc-panel/main/update.sh | sudo bash -s -- --port 8050
```

### Complete Uninstaller

If you ever need to completely remove Arc Panel and wipe its database:
```bash
curl -sSL https://raw.githubusercontent.com/shauryapatel044-dotcom/arc-panel/main/uninstall.sh | sudo bash
```

### Post-install

After installation, a summary will be printed with your panel URL, credentials, and daemon token. **Save the daemon token** — you will need it if you add additional nodes.

---

## Docker Compose Deployment

Ideal for local development or if you prefer containerized deployment.

### Prerequisites

- Docker 24+ with the Compose plugin
- At minimum 4GB RAM on the host

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/arc-panel/arc-panel.git
cd arc-panel

# 2. Configure environment
cp .env.example .env
nano .env     # fill in SERVER_IP, generate all passwords/secrets

# 3. Create data directories
mkdir -p data/mariadb data/servers data/backups
mkdir -p logs/backend logs/daemon logs/panel

# 4. Start all services
docker compose up -d

# 5. Check service health
docker compose ps
docker compose logs -f
```

### Service Management

```bash
# View logs
docker compose logs -f backend
docker compose logs -f daemon

# Restart a service
docker compose restart backend

# Pull latest images and redeploy
docker compose pull && docker compose up -d

# Stop all services
docker compose down

# Stop and remove volumes (⚠️ destroys data)
docker compose down -v
```

---

## Manual Development Setup

### Prerequisites

- Node.js 20 LTS
- MariaDB 10.11+
- Docker (for running game servers locally)
- pnpm or npm

### Backend

```bash
cd backend
cp .env.example .env      # configure DATABASE_URL, JWT_SECRET, etc.
npm install
npx prisma generate
npx prisma migrate dev
npx ts-node prisma/seed.ts
npm run dev               # starts on port 3001
```

### Daemon

```bash
cd daemon
cp .env.example .env      # configure DAEMON_TOKEN, ports
npm install
npm run dev               # starts on port 8085
```

### Frontend (Panel)

```bash
cd panel
cp .env.example .env.local   # configure NEXT_PUBLIC_API_URL
npm install
npm run dev               # starts on port 3000 (dev) / 8080 (prod)
```

---

## Port Reference

| Port | Protocol | Service | Description |
|------|----------|---------|-------------|
| `8080` | TCP | Panel | Web UI (Next.js) |
| `3001` | TCP | Backend | REST API + WebSocket |
| `8085` | TCP | Daemon | Daemon API + WebSocket |
| `2022` | TCP | Daemon | SFTP file access |
| `3306` | TCP | MariaDB | Database (internal only) |
| `25500–26000` | TCP/UDP | Game Servers | Default game server port range |
| `22` | TCP | System | SSH (host access) |

---

## Default Credentials

> [!CAUTION]
> The default credentials are publicly known. **Change the admin password immediately** after your first login.

| Field | Value |
|-------|-------|
| Username | `admin` |
| Email | `admin@arcpanel.local` |
| Password | `admin` |

**Change password:** Profile → Security → Change Password

---

## Supported Server Types

Egg templates are located in the [`eggs/`](./eggs/) directory. Each egg defines the Docker image, environment variables, startup command, and port configuration for a specific game server type.

| Egg ID | Name | Docker Image | Min RAM | Category |
|--------|------|-------------|---------|----------|
| `minecraft-java` | Minecraft Java Edition | `itzg/minecraft-server:latest` | 1024 MB | Gaming |
| `minecraft-bedrock` | Minecraft Bedrock Edition | `itzg/minecraft-bedrock-server:latest` | 1024 MB | Gaming |
| `palworld` | Palworld Dedicated Server | `jammsen/palworld-dedicated-server:latest` | 8192 MB | Gaming |
| `rust` | Rust Dedicated Server | `didstopia/rust-server:latest` | 4096 MB | Gaming |
| `cs2` | Counter-Strike 2 | `cm2network/cs2:latest` | 2048 MB | Gaming |
| `hytale` | Hytale Server | `arc-panel/hytale:latest` | 2048 MB | Gaming |
| `python` | Python Application | `python:3.12-slim` | 128 MB | Application |
| `nodejs` | Node.js Application | `node:20-slim` | 128 MB | Application |

### Adding Custom Eggs

Create a new JSON file in the `eggs/` directory following the schema:

```json
{
  "id": "my-game",
  "name": "My Game Server",
  "description": "...",
  "dockerImage": "my/image:latest",
  "defaultPorts": [{"container": 27015, "protocol": "udp"}],
  "defaultEnv": {"KEY": "value"},
  "stopCommand": "quit",
  "startupCommand": "",
  "minMemoryMB": 1024,
  "recommendedMemoryMB": 2048,
  "category": "gaming"
}
```

Then restart the backend — it will automatically discover and register the new egg.

---

## Contributing

We welcome contributions! Please read the guidelines below before submitting a PR.

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes with tests
4. Run linting: `npm run lint` in each package
5. Commit with conventional commits: `git commit -m "feat: add X"`
6. Open a Pull Request against `main`

### Code Style

- **TypeScript** everywhere — no raw JS files in `backend/` or `daemon/`
- **Prettier** for formatting (run `npm run format`)
- **ESLint** for linting (run `npm run lint`)
- Write **JSDoc comments** for all public functions and types
- Keep each file under **400 lines** — split into modules when needed

### Areas to Contribute

- 🥚 **New eggs** — game server templates in `eggs/`
- 🌍 **Translations** — i18n strings in `panel/locales/`
- 📊 **Metrics** — improved resource monitoring graphs
- 🔌 **Plugins** — webhook integrations (Discord, Slack)
- 📖 **Documentation** — improve guides and examples

### Reporting Bugs

Open an issue with:
- Ubuntu version and hardware specs
- Steps to reproduce
- Expected vs actual behaviour
- Relevant logs from `/var/log/arc-panel/`

---

## License

Arc Panel is open source software licensed under the **MIT License**.

---

*Built with ❤️ for the gaming community.*
