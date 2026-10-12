/**
 * src/prisma.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton PrismaClient instance with automatic in-memory fallback when
 * MariaDB (port 3306) is not running locally (e.g. Windows preview environment).
 * On Ubuntu VPS / Docker Compose with MariaDB active, all queries execute
 * against the real MariaDB database.
 */

import fs from 'fs';
import path from 'path';
import net from 'net';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role, ServerStatus } from '@prisma/client';

// Ensure BigInt fields (such as Backup.size) serialize cleanly in Express res.json()
if (typeof (BigInt.prototype as any).toJSON !== 'function') {
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };
}

const DATA_STORE_FILE = path.resolve(__dirname, '../.data/arc-db.json');

// ─── Seeded In-Memory Store (used only when MariaDB 3306 is unreachable) ──────

import os from 'os';

const DEFAULT_ADMIN_HASH = bcrypt.hashSync('admin', 10);
const DEFAULT_TOKEN =
  process.env.DAEMON_TOKEN ||
  '4f9c8a2e6b1d7f3a5c9e0b2d4f6a8c1e3b5d7f9a1c3e5b7d9f0a2c4e6b8d0f2a';

const now = new Date();
const hostTotalRamMB = Math.round(os.totalmem() / 1048576);
const hostUsedRamMB = Math.round((os.totalmem() - os.freemem()) / 1048576);
const hostCpuCores = Math.max(1, os.cpus().length);

const memUsers: Array<Record<string, any>> = [
  {
    id: 'clx_admin_001',
    username: 'admin',
    email: 'admin@arc.local',
    passwordHash: DEFAULT_ADMIN_HASH,
    role: Role.ADMIN,
    twoFactorSecret: null,
    twoFactorEnabled: false,
    forcePasswordChange: false,
    suspended: false,
    createdAt: now,
    updatedAt: now,
  },
];

const memNodes: Array<Record<string, any>> = [
  {
    id: 'clx_node_local',
    name: 'local',
    fqdn: '127.0.0.1',
    port: 8085,
    daemonToken: DEFAULT_TOKEN,
    isOnline: true,
    totalMemory: hostTotalRamMB,
    totalCpu: hostCpuCores * 100,
    usedMemory: hostUsedRamMB,
    usedCpu: 0,
    createdAt: now,
    updatedAt: now,
  },
];

const memAllocations: Array<Record<string, any>> = Array.from(
  { length: 50 },
  (_, idx) => ({
    id: `clx_alloc_${25500 + idx}`,
    nodeId: 'clx_node_local',
    serverId: null,
    ip: '127.0.0.1',
    port: 25500 + idx,
    isAssigned: false,
    createdAt: now,
  }),
);

const memServers: Array<Record<string, any>> = [];

function saveStoreToDisk(): void {
  try {
    const dir = path.dirname(DATA_STORE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      DATA_STORE_FILE,
      JSON.stringify({ servers: memServers, users: memUsers, allocations: memAllocations }, null, 2),
      'utf-8'
    );
  } catch {
    // Ignore disk persistence errors
  }
}

function loadStoreFromDisk(): void {
  try {
    if (!fs.existsSync(DATA_STORE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(DATA_STORE_FILE, 'utf-8'));
    if (Array.isArray(raw.servers)) {
      memServers.length = 0;
      for (const s of raw.servers) {
        memServers.push({
          ...s,
          createdAt: new Date(s.createdAt),
          updatedAt: new Date(s.updatedAt),
        });
      }
    }
    if (Array.isArray(raw.users) && raw.users.length > 0) {
      memUsers.length = 0;
      for (const u of raw.users) {
        memUsers.push({
          ...u,
          createdAt: new Date(u.createdAt),
          updatedAt: new Date(u.updatedAt),
        });
      }
    }
    if (Array.isArray(raw.allocations) && raw.allocations.length > 0) {
      memAllocations.length = 0;
      for (const a of raw.allocations) {
        memAllocations.push({
          ...a,
          createdAt: new Date(a.createdAt),
        });
      }
    }
  } catch {
    // Ignore disk load errors
  }
}

loadStoreFromDisk();

const memBackups: Array<Record<string, any>> = [];

const memSessions: Array<Record<string, any>> = [];

const memEggs: Array<Record<string, any>> = [
  {
    id: 'egg_mc_java',
    name: 'Minecraft Java Edition',
    slug: 'minecraft-java',
    description: 'High-performance Paper/Vanilla Minecraft Java server',
    dockerImage: 'itzg/minecraft-server:latest',
    startupCmd: 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar server.jar',
    envSchema: '[]',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'egg_palworld',
    name: 'Palworld Dedicated Server',
    slug: 'palworld',
    description: 'Official Palworld dedicated multiplayer container',
    dockerImage: 'thijsvanloef/palworld-server-docker:latest',
    startupCmd: './PalServer.sh',
    envSchema: '[]',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'egg_rust',
    name: 'Rust Dedicated Server',
    slug: 'rust',
    description: 'Facepunch Rust dedicated survival server with Oxide support',
    dockerImage: 'didstopia/rust-server:latest',
    startupCmd: './RustDedicated -batchmode',
    envSchema: '[]',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'egg_cs2',
    name: 'Counter-Strike 2',
    slug: 'cs2',
    description: 'Valve CS2 Source 2 competitive dedicated server',
    dockerImage: 'joedwards32/cs2:latest',
    startupCmd: './game/bin/linuxsteamrt64/cs2 -dedicated',
    envSchema: '[]',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'egg_nodejs',
    name: 'Node.js 20 LTS Runtime',
    slug: 'nodejs',
    description: 'Alpine-based Node.js 20 container for bots and web apps',
    dockerImage: 'node:20-alpine',
    startupCmd: 'node index.js',
    envSchema: '[]',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'egg_python',
    name: 'Python 3.12 Runtime',
    slug: 'python',
    description: 'Python 3.12 slim container for AI/Discord services',
    dockerImage: 'python:3.12-slim',
    startupCmd: 'python main.py',
    envSchema: '[]',
    createdAt: now,
    updatedAt: now,
  },
];

function hydrateServerRelations(srv: Record<string, any>) {
  return {
    ...srv,
    owner: memUsers.find((u) => u.id === srv.ownerId) ?? memUsers[0],
    node: memNodes.find((n) => n.id === srv.nodeId) ?? memNodes[0],
    allocations: memAllocations.filter((a) => a.serverId === srv.id),
    backups: memBackups.filter((b) => b.serverId === srv.id),
    _count: {
      backups: memBackups.filter((b) => b.serverId === srv.id).length,
    },
  };
}

function hydrateNodeRelations(node: Record<string, any>) {
  return {
    ...node,
    servers: memServers.filter((s) => s.nodeId === node.id),
    allocations: memAllocations.filter((a) => a.nodeId === node.id),
    _count: {
      servers: memServers.filter((s) => s.nodeId === node.id).length,
      allocations: memAllocations.filter((a) => a.nodeId === node.id).length,
    },
  };
}

function matchUserWhere(u: Record<string, any>, where?: Record<string, any>): boolean {
  if (!where) return true;
  if (where.id && u.id !== where.id) return false;
  if (where.email && typeof where.email === 'string' && u.email !== where.email) return false;
  if (where.username && typeof where.username === 'string' && u.username !== where.username) return false;
  if (where.role && u.role !== where.role) return false;
  if (where.suspended !== undefined && u.suspended !== where.suspended) return false;
  if (Array.isArray(where.OR)) {
    return where.OR.some((cond: Record<string, any>) => {
      if (cond.email && typeof cond.email === 'string') return u.email.toLowerCase() === cond.email.toLowerCase();
      if (cond.username && typeof cond.username === 'string') return u.username.toLowerCase() === cond.username.toLowerCase();
      if (cond.email?.contains) return u.email.toLowerCase().includes(String(cond.email.contains).toLowerCase());
      if (cond.username?.contains) return u.username.toLowerCase().includes(String(cond.username.contains).toLowerCase());
      return false;
    });
  }
  return true;
}

const memoryClient = {
  $connect: async () => {},
  $disconnect: async () => {},
  $queryRaw: async () => [{ 1: 1 }],

  user: {
    count: async (args?: { where?: Record<string, any> }) =>
      memUsers.filter((u) => matchUserWhere(u, args?.where)).length,
    findUnique: async ({ where }: { where: Record<string, any> }) => {
      const found = memUsers.find((u) => matchUserWhere(u, where));
      if (!found) return null;
      return {
        ...found,
        servers: memServers.filter((s) => s.ownerId === found.id).map(hydrateServerRelations),
        _count: { servers: memServers.filter((s) => s.ownerId === found.id).length },
      };
    },
    findFirst: async ({ where }: { where?: Record<string, any> } = {}) => {
      const found = memUsers.find((u) => matchUserWhere(u, where));
      return found ? { ...found } : null;
    },
    findMany: async (args?: { where?: Record<string, any> }) =>
      memUsers
        .filter((u) => matchUserWhere(u, args?.where))
        .map((u) => ({
          ...u,
          _count: { servers: memServers.filter((s) => s.ownerId === u.id).length },
        })),
    create: async ({ data }: { data: Record<string, any> }) => {
      const created = {
        id: `clx_usr_${crypto.randomBytes(4).toString('hex')}`,
        username: data.username,
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role ?? Role.USER,
        twoFactorSecret: null,
        twoFactorEnabled: false,
        forcePasswordChange: Boolean(data.forcePasswordChange),
        suspended: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      memUsers.push(created);
      saveStoreToDisk();
      return created;
    },
    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const idx = memUsers.findIndex((u) => matchUserWhere(u, where));
      if (idx === -1) throw new Error('User not found');
      memUsers[idx] = { ...memUsers[idx], ...data, updatedAt: new Date() };
      saveStoreToDisk();
      return memUsers[idx];
    },
    delete: async ({ where }: { where: Record<string, any> }) => {
      const idx = memUsers.findIndex((u) => matchUserWhere(u, where));
      if (idx === -1) throw new Error('User not found');
      const [removed] = memUsers.splice(idx, 1);
      saveStoreToDisk();
      return removed;
    },
  },

  node: {
    findMany: async (args?: { where?: Record<string, any> }) =>
      memNodes
        .filter((n) => (args?.where?.isOnline !== undefined ? n.isOnline === args.where.isOnline : true))
        .map(hydrateNodeRelations),
    findUnique: async ({ where }: { where: Record<string, any> }) => {
      const n = memNodes.find((item) => item.id === where.id || item.name === where.name);
      return n ? hydrateNodeRelations(n) : null;
    },
    create: async ({ data }: { data: Record<string, any> }) => {
      const created = {
        id: `clx_node_${crypto.randomBytes(4).toString('hex')}`,
        name: data.name,
        fqdn: data.fqdn,
        port: data.port ?? 8085,
        daemonToken: data.daemonToken ?? DEFAULT_TOKEN,
        isOnline: true,
        totalMemory: data.totalMemory ?? 8192,
        totalCpu: data.totalCpu ?? 400,
        usedMemory: 0,
        usedCpu: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      memNodes.push(created);
      return hydrateNodeRelations(created);
    },
    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const idx = memNodes.findIndex((n) => n.id === where.id || n.name === where.name);
      if (idx === -1) throw new Error('Node not found');
      const current = memNodes[idx];
      const nextData = { ...data };
      if (data.usedMemory && typeof data.usedMemory === 'object' && 'increment' in data.usedMemory) {
        nextData.usedMemory = (current.usedMemory ?? 0) + Number(data.usedMemory.increment);
      } else if (data.usedMemory && typeof data.usedMemory === 'object' && 'decrement' in data.usedMemory) {
        nextData.usedMemory = Math.max(0, (current.usedMemory ?? 0) - Number(data.usedMemory.decrement));
      }
      if (data.usedCpu && typeof data.usedCpu === 'object' && 'increment' in data.usedCpu) {
        nextData.usedCpu = (current.usedCpu ?? 0) + Number(data.usedCpu.increment);
      } else if (data.usedCpu && typeof data.usedCpu === 'object' && 'decrement' in data.usedCpu) {
        nextData.usedCpu = Math.max(0, (current.usedCpu ?? 0) - Number(data.usedCpu.decrement));
      }
      memNodes[idx] = { ...current, ...nextData, updatedAt: new Date() };
      return hydrateNodeRelations(memNodes[idx]);
    },
    updateMany: async ({ where, data }: { where?: Record<string, any>; data: Record<string, any> }) => {
      let count = 0;
      memNodes.forEach((n, i) => {
        if (!where?.name || n.name === where.name) {
          memNodes[i] = { ...n, ...data, updatedAt: new Date() };
          count++;
        }
      });
      return { count };
    },
    delete: async ({ where }: { where: Record<string, any> }) => {
      const idx = memNodes.findIndex((n) => n.id === where.id);
      if (idx === -1) throw new Error('Node not found');
      const [removed] = memNodes.splice(idx, 1);
      return removed;
    },
  },

  server: {
    count: async (args?: { where?: Record<string, any> }) =>
      memServers.filter((s) => {
        if (args?.where?.status && s.status !== args.where.status) return false;
        if (args?.where?.nodeId && s.nodeId !== args.where.nodeId) return false;
        return true;
      }).length,
    aggregate: async () => ({
      _sum: {
        memoryLimit: memServers.reduce((a, s) => a + s.memoryLimit, 0),
        diskLimit: memServers.reduce((a, s) => a + s.diskLimit, 0),
        cpuLimit: memServers.reduce((a, s) => a + s.cpuLimit, 0),
      },
    }),
    findMany: async (args?: { where?: Record<string, any> }) =>
      memServers
        .filter((s) => {
          if (args?.where?.ownerId && s.ownerId !== args.where.ownerId) return false;
          return true;
        })
        .map(hydrateServerRelations),
    findUnique: async ({ where }: { where: Record<string, any> }) => {
      const s = memServers.find((item) => item.id === where.id);
      return s ? hydrateServerRelations(s) : null;
    },
    create: async ({ data }: { data: Record<string, any> }) => {
      const id = `clx_srv_${crypto.randomBytes(4).toString('hex')}`;
      const created = {
        id,
        name: data.name,
        ownerId: data.ownerId,
        nodeId: data.nodeId ?? 'clx_node_local',
        containerId: `arc_container_${id.slice(-6)}`,
        status: ServerStatus.RUNNING,
        image: data.image,
        dockerImage: data.dockerImage,
        memoryLimit: data.memoryLimit ?? 2048,
        cpuLimit: data.cpuLimit ?? 100,
        diskLimit: data.diskLimit ?? 10240,
        environment: data.environment ?? '{}',
        startupCmd: data.startupCmd ?? null,
        suspended: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (data.allocations?.connect?.id) {
        const alloc = memAllocations.find((a) => a.id === data.allocations.connect.id);
        if (alloc) {
          alloc.serverId = id;
          alloc.isAssigned = true;
        }
      }
      memServers.unshift(created);
      saveStoreToDisk();
      return hydrateServerRelations(created);
    },
    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const idx = memServers.findIndex((s) => s.id === where.id);
      if (idx === -1) throw new Error('Server not found');
      memServers[idx] = { ...memServers[idx], ...data, updatedAt: new Date() };
      saveStoreToDisk();
      return hydrateServerRelations(memServers[idx]);
    },
    delete: async ({ where }: { where: Record<string, any> }) => {
      const idx = memServers.findIndex((s) => s.id === where.id);
      if (idx === -1) throw new Error('Server not found');
      const [removed] = memServers.splice(idx, 1);
      saveStoreToDisk();
      return removed;
    },
  },

  allocation: {
    findFirst: async ({ where }: { where?: Record<string, any> } = {}) =>
      memAllocations.find(
        (a) =>
          (!where?.nodeId || a.nodeId === where.nodeId) &&
          (where?.isAssigned === undefined || a.isAssigned === where.isAssigned),
      ) ?? null,
    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const idx = memAllocations.findIndex((a) => a.id === where.id);
      if (idx === -1) throw new Error('Allocation not found');
      memAllocations[idx] = { ...memAllocations[idx], ...data };
      saveStoreToDisk();
      return memAllocations[idx];
    },
    updateMany: async ({ where, data }: { where?: Record<string, any>; data: Record<string, any> }) => {
      let count = 0;
      memAllocations.forEach((a, i) => {
        if (!where?.serverId || a.serverId === where.serverId) {
          memAllocations[i] = { ...a, ...data };
          count++;
        }
      });
      saveStoreToDisk();
      return { count };
    },
    createMany: async ({ data }: { data: Array<Record<string, any>> }) => {
      data.forEach((item) => {
        memAllocations.push({
          id: `clx_alloc_${item.port}`,
          ...item,
          createdAt: new Date(),
        });
      });
      return { count: data.length };
    },
  },

  backup: {
    findMany: async ({ where }: { where?: Record<string, any> } = {}) =>
      memBackups.filter((b) => (!where?.serverId || b.serverId === where.serverId)),
    findFirst: async ({ where }: { where?: Record<string, any> } = {}) => {
      const b = memBackups.find(
        (item) =>
          (!where?.id || item.id === where.id) &&
          (!where?.serverId || item.serverId === where.serverId),
      );
      if (!b) return null;
      return {
        ...b,
        server: memServers.find((s) => s.id === b.serverId) ?? memServers[0],
      };
    },
    create: async ({ data }: { data: Record<string, any> }) => {
      const created = {
        id: `clx_bkp_${crypto.randomBytes(4).toString('hex')}`,
        serverId: data.serverId,
        name: data.name,
        size: data.size ?? BigInt(52_428_800),
        checksum: data.checksum ?? 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        completed: true,
        createdAt: new Date(),
      };
      memBackups.unshift(created);
      return created;
    },
    delete: async ({ where }: { where: Record<string, any> }) => {
      const idx = memBackups.findIndex((b) => b.id === where.id);
      if (idx === -1) throw new Error('Backup not found');
      const [removed] = memBackups.splice(idx, 1);
      return removed;
    },
  },

  session: {
    create: async ({ data }: { data: Record<string, any> }) => {
      const created = {
        id: `clx_ses_${crypto.randomBytes(4).toString('hex')}`,
        ...data,
        createdAt: new Date(),
      };
      memSessions.push(created);
      return created;
    },
    findUnique: async ({ where }: { where: Record<string, any> }) =>
      memSessions.find(
        (s) => s.refreshToken === where.refreshToken || s.id === where.id,
      ) ?? null,
    delete: async ({ where }: { where: Record<string, any> }) => {
      const idx = memSessions.findIndex(
        (s) => s.id === where.id || s.refreshToken === where.refreshToken,
      );
      if (idx !== -1) memSessions.splice(idx, 1);
      return {};
    },
    deleteMany: async ({ where }: { where?: Record<string, any> } = {}) => {
      for (let i = memSessions.length - 1; i >= 0; i--) {
        if (
          (!where?.userId || memSessions[i].userId === where.userId) &&
          (!where?.refreshToken || memSessions[i].refreshToken === where.refreshToken)
        ) {
          memSessions.splice(i, 1);
        }
      }
      return { count: 1 };
    },
  },

  egg: {
    findMany: async () => memEggs,
    findUnique: async ({ where }: { where: Record<string, any> }) =>
      memEggs.find((e) => e.slug === where.slug || e.id === where.id || e.name === where.name) ?? {
        id: `egg_${where.slug || 'custom'}`,
        name: String(where.slug || 'Custom Server'),
        slug: String(where.slug || 'custom'),
        description: 'Containerized Server Instance',
        dockerImage: 'itzg/minecraft-server:latest',
        startupCmd: '',
        envSchema: '[]',
        createdAt: now,
        updatedAt: now,
      },
    findFirst: async ({ where }: { where?: Record<string, any> } = {}) =>
      memEggs.find((e) => !where?.slug || e.slug === where.slug) ?? memEggs[0],
  },
};

// ─── MariaDB Reachability Check & Dynamic Proxy ───────────────────────────────

let useRealMariaDb = false;
const realPrisma = new PrismaClient({
  log: ['error'],
});

// Probe 127.0.0.1:3306 in the background
const probeSocket = new net.Socket();
probeSocket.setTimeout(800);
probeSocket
  .connect(3306, '127.0.0.1', () => {
    useRealMariaDb = true;
    probeSocket.destroy();
  })
  .on('error', () => {
    useRealMariaDb = false;
    probeSocket.destroy();
  })
  .on('timeout', () => {
    useRealMariaDb = false;
    probeSocket.destroy();
  });

export const prisma = new Proxy(realPrisma as unknown as PrismaClient, {
  get(_target, prop: keyof PrismaClient) {
    const active = useRealMariaDb ? (realPrisma as any) : (memoryClient as any);
    return active[prop];
  },
});

export default prisma;
