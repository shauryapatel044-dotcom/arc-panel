/* ════════════════════════════════════════════════════════════════
   src/app/(dashboard)/servers/create/page.tsx
   Dedicated Server Deployment Studio — Choose from 8 Game & App Eggs,
   configure CPU/RAM/Disk hardware presets, environment variables,
   and deploy directly to the local or remote Docker node
════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Gamepad2,
  Code2,
  Cpu,
  MemoryStick,
  HardDrive,
  Server as ServerIcon,
  Rocket,
  ArrowLeft,
  Terminal,
  Plus,
  Trash2,
  CheckCircle2,
  Network,
  Users,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import GlassInput from '@/components/ui/GlassInput';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface AssignableUser {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface EggTemplate {
  slug: string;
  name: string;
  category: 'gaming' | 'programming';
  isMinecraft?: boolean;
  description: string;
  dockerImage: string;
  defaultPort: number;
  recommendedRamMB: number;
  recommendedCpuPct: number;
  recommendedDiskMB: number;
  defaultStartupCmd: string;
  defaultEnv: Record<string, string>;
  versions: string[];
}

export const EGG_CATALOG: EggTemplate[] = [
  {
    slug: 'minecraft-paper',
    name: 'Minecraft: PaperMC',
    category: 'gaming',
    isMinecraft: true,
    description: 'High-performance PaperMC server with async chunk loading & Bukkit/Spigot plugin support (auto-installs server.jar)',
    dockerImage: 'itzg/minecraft-server:latest',
    defaultPort: 25565,
    recommendedRamMB: 4096,
    recommendedCpuPct: 200,
    recommendedDiskMB: 20480,
    defaultStartupCmd: 'java -Xms128M -Xmx4096M -jar server.jar nogui',
    defaultEnv: { EULA: 'TRUE', TYPE: 'PAPER', VERSION: '1.21.4', AUTO_START: 'true' },
    versions: ['1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2', '1.8.8'],
  },
  {
    slug: 'minecraft-fabric',
    name: 'Minecraft: Fabric Loader',
    category: 'gaming',
    isMinecraft: true,
    description: 'Lightweight modular Fabric mod loader for Lithium, Sodium & Cobblemon modpacks (auto-installs server.jar)',
    dockerImage: 'itzg/minecraft-server:latest',
    defaultPort: 25565,
    recommendedRamMB: 4096,
    recommendedCpuPct: 200,
    recommendedDiskMB: 20480,
    defaultStartupCmd: 'java -Xms128M -Xmx4096M -jar server.jar nogui',
    defaultEnv: { EULA: 'TRUE', TYPE: 'FABRIC', VERSION: '1.21.4', AUTO_START: 'true' },
    versions: ['1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.16.5'],
  },
  {
    slug: 'minecraft-forge',
    name: 'Minecraft: Forge Modded',
    category: 'gaming',
    isMinecraft: true,
    description: 'Classic Minecraft Forge loader for large kitchen-sink & tech modpacks (auto-installs server.jar)',
    dockerImage: 'itzg/minecraft-server:latest',
    defaultPort: 25565,
    recommendedRamMB: 6144,
    recommendedCpuPct: 300,
    recommendedDiskMB: 30720,
    defaultStartupCmd: 'java -Xms128M -Xmx6144M -jar server.jar nogui',
    defaultEnv: { EULA: 'TRUE', TYPE: 'FORGE', VERSION: '1.20.1', AUTO_START: 'true' },
    versions: ['1.21.4', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.16.5', '1.12.2', '1.7.10'],
  },
  {
    slug: 'minecraft-neoforge',
    name: 'Minecraft: NeoForge',
    category: 'gaming',
    isMinecraft: true,
    description: 'Next-generation NeoForge modding platform for modern 1.20.4+ and 1.21+ modpacks (auto-installs server.jar)',
    dockerImage: 'itzg/minecraft-server:latest',
    defaultPort: 25565,
    recommendedRamMB: 6144,
    recommendedCpuPct: 300,
    recommendedDiskMB: 30720,
    defaultStartupCmd: 'java -Xms128M -Xmx6144M -jar server.jar nogui',
    defaultEnv: { EULA: 'TRUE', TYPE: 'NEOFORGE', VERSION: '1.21.4', AUTO_START: 'true' },
    versions: ['1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20.4', '1.20.2'],
  },
  {
    slug: 'minecraft-purpur',
    name: 'Minecraft: Purpur',
    category: 'gaming',
    isMinecraft: true,
    description: 'Drop-in Paper fork with extensive gameplay customization & Pufferfish optimizations (auto-installs server.jar)',
    dockerImage: 'itzg/minecraft-server:latest',
    defaultPort: 25565,
    recommendedRamMB: 4096,
    recommendedCpuPct: 200,
    recommendedDiskMB: 20480,
    defaultStartupCmd: 'java -Xms128M -Xmx4096M -jar server.jar nogui',
    defaultEnv: { EULA: 'TRUE', TYPE: 'PURPUR', VERSION: '1.21.4', AUTO_START: 'true' },
    versions: ['1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5'],
  },
  {
    slug: 'minecraft-spigot',
    name: 'Minecraft: Spigot / Bukkit',
    category: 'gaming',
    isMinecraft: true,
    description: 'Standard Spigot & CraftBukkit server for classic plugin compatibility (auto-installs server.jar)',
    dockerImage: 'itzg/minecraft-server:latest',
    defaultPort: 25565,
    recommendedRamMB: 4096,
    recommendedCpuPct: 200,
    recommendedDiskMB: 20480,
    defaultStartupCmd: 'java -Xms128M -Xmx4096M -jar server.jar nogui',
    defaultEnv: { EULA: 'TRUE', TYPE: 'SPIGOT', VERSION: '1.21.4', AUTO_START: 'true' },
    versions: ['1.21.4', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2', '1.8.8'],
  },
  {
    slug: 'minecraft-vanilla',
    name: 'Minecraft: Vanilla Java',
    category: 'gaming',
    isMinecraft: true,
    description: 'Official unmodified Mojang Minecraft Java Edition server (auto-installs server.jar)',
    dockerImage: 'itzg/minecraft-server:latest',
    defaultPort: 25565,
    recommendedRamMB: 4096,
    recommendedCpuPct: 200,
    recommendedDiskMB: 20480,
    defaultStartupCmd: 'java -Xms128M -Xmx4096M -jar server.jar nogui',
    defaultEnv: { EULA: 'TRUE', TYPE: 'VANILLA', VERSION: '1.21.4', AUTO_START: 'true' },
    versions: ['1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2'],
  },
  {
    slug: 'minecraft-velocity',
    name: 'Minecraft: Velocity Proxy',
    category: 'gaming',
    isMinecraft: true,
    description: 'Next-generation PaperMC Velocity proxy network for linking multiple Minecraft servers (auto-installs server.jar)',
    dockerImage: 'itzg/mc-proxy:latest',
    defaultPort: 25565,
    recommendedRamMB: 1024,
    recommendedCpuPct: 100,
    recommendedDiskMB: 5120,
    defaultStartupCmd: 'java -Xms512M -Xmx1024M -jar server.jar',
    defaultEnv: { TYPE: 'VELOCITY', VERSION: '3.4.0-SNAPSHOT', AUTO_START: 'true' },
    versions: ['3.4.0-SNAPSHOT', '3.3.0-SNAPSHOT', '3.2.0-SNAPSHOT'],
  },
  {
    slug: 'minecraft-bedrock',
    name: 'Minecraft: Bedrock Edition',
    category: 'gaming',
    isMinecraft: true,
    description: 'Cross-platform Bedrock dedicated server for console, mobile & Windows (auto-installs server.jar)',
    dockerImage: 'itzg/minecraft-bedrock-server:latest',
    defaultPort: 19132,
    recommendedRamMB: 2048,
    recommendedCpuPct: 150,
    recommendedDiskMB: 10240,
    defaultStartupCmd: 'java -Xms128M -Xmx2048M -jar server.jar nogui',
    defaultEnv: { EULA: 'TRUE', GAMEMODE: 'survival', DIFFICULTY: 'normal', VERSION: '1.21.50', AUTO_START: 'true' },
    versions: ['1.21.50', '1.21.40', '1.21.30', '1.21.20', '1.20.80'],
  },
  {
    slug: 'palworld',
    name: 'Palworld Dedicated',
    category: 'gaming',
    description: 'Official Palworld multiplayer survival cluster container',
    dockerImage: 'thijsvanloef/palworld-server-docker:latest',
    defaultPort: 8211,
    recommendedRamMB: 8192,
    recommendedCpuPct: 400,
    recommendedDiskMB: 40960,
    defaultStartupCmd: './PalServer.sh -useperfthreads -NoAsyncLoadingThread',
    defaultEnv: { PLAYERS: '32', MULTITHREADING: 'true', VERSION: 'v0.4.14', AUTO_START: 'true' },
    versions: ['v0.4.14', 'v0.4.11', 'v0.3.10', 'v0.2.4'],
  },
  {
    slug: 'rust',
    name: 'Rust Dedicated Server',
    category: 'gaming',
    description: 'Facepunch Rust dedicated server with Oxide / Carbon uMod support',
    dockerImage: 'didstopia/rust-server:latest',
    defaultPort: 28015,
    recommendedRamMB: 8192,
    recommendedCpuPct: 400,
    recommendedDiskMB: 51200,
    defaultStartupCmd: './RustDedicated -batchmode -nographics',
    defaultEnv: { RUST_SERVER_WORLD_SIZE: '3500', RUST_SERVER_MAXPLAYERS: '100', VERSION: 'latest-oxide', AUTO_START: 'true' },
    versions: ['latest-oxide', 'latest-vanilla', 'carbon-modded', 'staging-branch'],
  },
  {
    slug: 'cs2',
    name: 'Counter-Strike 2',
    category: 'gaming',
    description: 'Valve CS2 Source 2 competitive 128-tick ready dedicated server',
    dockerImage: 'joedwards32/cs2:latest',
    defaultPort: 27015,
    recommendedRamMB: 4096,
    recommendedCpuPct: 300,
    recommendedDiskMB: 45056,
    defaultStartupCmd: './game/bin/linuxsteamrt64/cs2 -dedicated +map de_mirage',
    defaultEnv: { CS2_SERVERNAME: 'Arc Panel Competitive', CS2_MAXPLAYERS: '16', VERSION: 'build-1685', AUTO_START: 'true' },
    versions: ['build-1685', 'build-1672', 'counterstrikesharp-v288'],
  },
  {
    slug: 'hytale',
    name: 'Hytale Server',
    category: 'gaming',
    description: 'Orbis adventure & minigame dedicated container runtime',
    dockerImage: 'ubuntu:22.04',
    defaultPort: 25570,
    recommendedRamMB: 4096,
    recommendedCpuPct: 200,
    recommendedDiskMB: 20480,
    defaultStartupCmd: './hytale-server --bind 0.0.0.0',
    defaultEnv: { WORLD_PRESET: 'Orbis', MAX_PLAYERS: '64', VERSION: 'orbis-2025.2', AUTO_START: 'true' },
    versions: ['orbis-2025.2', 'orbis-2025.1', 'minigame-cluster'],
  },
  {
    slug: 'nodejs',
    name: 'Node.js Runtime',
    category: 'programming',
    description: 'Lightweight Alpine container for Discord bots, APIs & microservices',
    dockerImage: 'node:20-alpine',
    defaultPort: 3000,
    recommendedRamMB: 1024,
    recommendedCpuPct: 100,
    recommendedDiskMB: 5120,
    defaultStartupCmd: 'node index.js',
    defaultEnv: { NODE_ENV: 'production', VERSION: '20-lts', AUTO_START: 'true' },
    versions: ['22-current', '20-lts', '18-lts'],
  },
  {
    slug: 'python',
    name: 'Python Runtime',
    category: 'programming',
    description: 'Python slim environment for AI workers, bots & scripts (auto-stops when script action completes)',
    dockerImage: 'python:3.12-slim',
    defaultPort: 8000,
    recommendedRamMB: 1024,
    recommendedCpuPct: 100,
    recommendedDiskMB: 5120,
    defaultStartupCmd: 'python main.py',
    defaultEnv: { PYTHONUNBUFFERED: '1', VERSION: '3.12', AUTO_START: 'true' },
    versions: ['3.13', '3.12', '3.11', '3.10'],
  },
];

const HARDWARE_PRESETS = [
  { label: 'Starter (1 GB / 1 vCPU)', ram: 1024, cpu: 100, disk: 5120 },
  { label: 'Standard (4 GB / 2 vCPU)', ram: 4096, cpu: 200, disk: 20480 },
  { label: 'Performance (8 GB / 4 vCPU)', ram: 8192, cpu: 400, disk: 40960 },
  { label: 'Extreme (16 GB / 8 vCPU)', ram: 16384, cpu: 800, disk: 81920 },
];

export default function CreateServerPage() {
  const router = useRouter();
  const currentUser = useAuth((s) => s.user);

  const [users, setUsers] = useState<AssignableUser[]>([
    { id: 'clx_admin_001', username: 'admin', email: 'admin@arc.local', role: 'ADMIN' },
  ]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>(
    currentUser?.id || 'clx_admin_001',
  );

  // Restrict server creation page to Administrators only
  useEffect(() => {
    if (currentUser && currentUser.role.toLowerCase() !== 'admin') {
      toast.error('Only administrators can create servers.');
      router.replace('/dashboard');
    }
  }, [currentUser, router]);

  const [categoryFilter, setCategoryFilter] = useState<
    'all' | 'minecraft' | 'gaming' | 'programming'
  >('all');
  const [selectedEgg, setSelectedEgg] = useState<EggTemplate>(EGG_CATALOG[0]);
  const [selectedVersion, setSelectedVersion] = useState<string>(
    EGG_CATALOG[0].versions[0],
  );
  const [autoStartOnCrash, setAutoStartOnCrash] = useState<boolean>(true);

  const [serverName, setServerName] = useState('New Container Instance');
  const [memoryLimit, setMemoryLimit] = useState<number>(
    EGG_CATALOG[0].recommendedRamMB,
  );
  const [cpuLimit, setCpuLimit] = useState<number>(
    EGG_CATALOG[0].recommendedCpuPct,
  );
  const [diskLimit, setDiskLimit] = useState<number>(
    EGG_CATALOG[0].recommendedDiskMB,
  );
  const [startupCmd, setStartupCmd] = useState<string>(
    EGG_CATALOG[0].defaultStartupCmd,
  );
  const [envPairs, setEnvPairs] = useState<Array<{ key: string; value: string }>>(
    Object.entries(EGG_CATALOG[0].defaultEnv).map(([key, value]) => ({
      key,
      value,
    })),
  );
  const [isDeploying, setIsDeploying] = useState(false);

  /* ── Load Assignable Users ────────────────────────────────────── */
  useEffect(() => {
    async function loadUsers() {
      try {
        const { data } = await api.get('/servers/users');
        const list: AssignableUser[] = Array.isArray(data)
          ? data
          : (data.users ?? []);
        if (list.length > 0) {
          setUsers(list);
          if (!selectedOwnerId) {
            setSelectedOwnerId(currentUser?.id ?? list[0].id);
          }
        }
      } catch {
        // Keep admin fallback
      }
    }
    void loadUsers();
  }, [currentUser?.id, selectedOwnerId]);

  /* ── Select an Egg Template ───────────────────────────────────── */
  const handleSelectEgg = (egg: EggTemplate) => {
    setSelectedEgg(egg);
    const defaultVer = egg.versions[0] || 'LATEST';
    setSelectedVersion(defaultVer);
    setMemoryLimit(egg.recommendedRamMB);
    setCpuLimit(egg.recommendedCpuPct);
    setDiskLimit(egg.recommendedDiskMB);
    setStartupCmd(egg.defaultStartupCmd);
    const nextEnv = {
      ...egg.defaultEnv,
      VERSION: defaultVer,
      AUTO_START: autoStartOnCrash ? 'true' : 'false',
    };
    setEnvPairs(
      Object.entries(nextEnv).map(([key, value]) => ({ key, value })),
    );
  };

  /* ── Update Version Selection ─────────────────────────────────── */
  const handleVersionChange = (ver: string) => {
    setSelectedVersion(ver);
    setEnvPairs((prev) => {
      const exists = prev.some((p) => p.key === 'VERSION');
      if (exists) {
        return prev.map((p) => (p.key === 'VERSION' ? { ...p, value: ver } : p));
      }
      return [...prev, { key: 'VERSION', value: ver }];
    });
  };

  /* ── Toggle Auto-Start on Crash ───────────────────────────────── */
  const handleToggleAutoStart = (enabled: boolean) => {
    setAutoStartOnCrash(enabled);
    const strVal = enabled ? 'true' : 'false';
    setEnvPairs((prev) => {
      const exists = prev.some((p) => p.key === 'AUTO_START');
      if (exists) {
        return prev.map((p) =>
          p.key === 'AUTO_START' ? { ...p, value: strVal } : p,
        );
      }
      return [...prev, { key: 'AUTO_START', value: strVal }];
    });
  };

  /* ── Add / Remove Environment Variable Row ────────────────────── */
  const addEnvRow = () => {
    setEnvPairs((prev) => [...prev, { key: '', value: '' }]);
  };

  const removeEnvRow = (index: number) => {
    setEnvPairs((prev) => prev.filter((_, i) => i !== index));
  };

  const updateEnvRow = (
    index: number,
    field: 'key' | 'value',
    val: string,
  ) => {
    setEnvPairs((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: val } : row)),
    );
  };

  /* ── Submit & Deploy Server ───────────────────────────────────── */
  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverName.trim()) {
      toast.error('Please enter a server name.');
      return;
    }

    const environment: Record<string, string> = {};
    for (const pair of envPairs) {
      if (pair.key.trim()) {
        environment[pair.key.trim()] = pair.value;
      }
    }
    environment.VERSION = selectedVersion;
    environment.AUTO_START = autoStartOnCrash ? 'true' : 'false';

    setIsDeploying(true);
    try {
      const { data } = await api.post('/servers', {
        name: serverName.trim(),
        ownerId: selectedOwnerId || undefined,
        image: selectedEgg.slug,
        dockerImage: selectedEgg.dockerImage,
        memoryLimit: Number(memoryLimit),
        cpuLimit: Number(cpuLimit),
        diskLimit: Number(diskLimit),
        startupCmd: startupCmd.trim() || undefined,
        environment,
      });

      const createdId = data?.server?.id ?? data?.id;
      const assignedUser = users.find((u) => u.id === selectedOwnerId);
      toast.success(
        selectedEgg.isMinecraft
          ? `Deployed "${serverName.trim()}" (${selectedEgg.name} ${selectedVersion}) — server.jar installed & server auto-started!`
          : `Deployed "${serverName.trim()}"${assignedUser ? ` for @${assignedUser.username}` : ''}!`,
      );

      if (createdId) {
        router.push(`/servers/${createdId}`);
      } else {
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Failed to deploy container.';
      toast.error(msg);
    } finally {
      setIsDeploying(false);
    }
  };

  const filteredEggs = EGG_CATALOG.filter((egg) => {
    if (categoryFilter === 'all') return true;
    if (categoryFilter === 'minecraft') return Boolean(egg.isMinecraft);
    return egg.category === categoryFilter;
  });

  return (
    <form onSubmit={handleDeploy} className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Link
            href="/dashboard"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Create New Server Instance
            </h1>
            <p className="text-sm text-white/50">
              Select an Egg & version, assign a user owner, and deploy to Docker.
            </p>
          </div>
        </div>

        <GlassButton
          type="submit"
          variant="primary"
          size="md"
          isLoading={isDeploying}
          leftIcon={<Rocket className="h-4 w-4" />}
        >
          Deploy Container Now
        </GlassButton>
      </div>

      {/* Step 1: Server Identity, User Owner & Node Target */}
      <GlassCard hoverable={false} accentColor="cyan" padding="lg">
        <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
          <ServerIcon className="h-5 w-5 text-arc-cyan-400" />
          <h2 className="text-base font-bold text-white">
            1. Instance Identity, User Owner & Target Node
          </h2>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <GlassInput
            label="Server Display Name"
            placeholder="e.g. Survival Realm S2"
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            required
          />

          {/* Assign Server Owner Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-sm font-medium text-white/70">
              <Users className="h-3.5 w-3.5 text-arc-cyan-400" />
              Assign Server Owner (User)
            </label>
            <select
              value={selectedOwnerId}
              onChange={(e) => setSelectedOwnerId(e.target.value)}
              className="h-10 w-full rounded-xl border border-white/10 bg-[#080d1a] px-3.5 text-sm text-white/90 focus:border-arc-cyan-400 focus:outline-none"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  @{u.username} ({u.email}) — {u.role}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/70">
              Target Daemon Node & Port
            </label>
            <div className="flex h-10 items-center justify-between rounded-xl border border-arc-cyan-400/30 bg-arc-cyan-400/10 px-4 text-sm text-arc-cyan-400">
              <span className="flex items-center gap-2 font-medium">
                <Network className="h-4 w-4" />
                local (127.0.0.1:8085)
              </span>
              <span className="font-mono text-xs text-white/70">
                25500–26000
              </span>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Step 2: Egg Template & Version Selection */}
      <GlassCard hoverable={false} accentColor="blue" padding="lg">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <Gamepad2 className="h-5 w-5 text-arc-blue-400" />
            <h2 className="text-base font-bold text-white">
              2. Select Server Type (Egg) & Version
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', 'minecraft', 'gaming', 'programming'] as const).map((cat) => (
              <GlassButton
                key={cat}
                type="button"
                variant={categoryFilter === cat ? 'primary' : 'ghost'}
                size="xs"
                onClick={() => setCategoryFilter(cat)}
              >
                {cat === 'all'
                  ? `All Eggs (${EGG_CATALOG.length})`
                  : cat === 'minecraft'
                    ? 'Minecraft Loaders (9)'
                    : cat === 'gaming'
                      ? 'Gaming (13)'
                      : 'Programming (2)'}
              </GlassButton>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEggs.map((egg) => {
            const isSelected = selectedEgg.slug === egg.slug;
            return (
              <motion.button
                key={egg.slug}
                type="button"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelectEgg(egg)}
                className={cn(
                  'flex flex-col justify-between gap-3 rounded-2xl border p-4 text-left transition-all',
                  isSelected
                    ? 'border-arc-cyan-400/60 bg-arc-cyan-400/15 shadow-[0_0_25px_rgba(0,204,255,0.22)]'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]',
                )}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'inline-flex h-8 w-8 items-center justify-center rounded-xl border',
                        egg.category === 'gaming'
                          ? 'border-arc-cyan-400/30 bg-arc-cyan-400/10 text-arc-cyan-400'
                          : 'border-arc-violet-400/30 bg-arc-violet-400/10 text-arc-violet-400',
                      )}
                    >
                      {egg.category === 'gaming' ? (
                        <Gamepad2 className="h-4 w-4" />
                      ) : (
                        <Code2 className="h-4 w-4" />
                      )}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {egg.isMinecraft && (
                        <span className="rounded-md border border-arc-cyan-400/30 bg-arc-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-arc-cyan-300">
                          Auto server.jar + Start
                        </span>
                      )}
                      {isSelected && (
                        <CheckCircle2 className="h-5 w-5 text-arc-cyan-400" />
                      )}
                    </div>
                  </div>

                  <h3 className="mt-3 text-sm font-bold text-white">
                    {egg.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs text-white/50">
                    {egg.description}
                  </p>
                </div>

                <div className="flex items-center justify-between border-t border-white/10 pt-2 font-mono text-[11px] text-arc-cyan-400/90">
                  <span className="truncate">{egg.dockerImage}</span>
                  <span className="text-white/50">{egg.versions.length} versions</span>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Version Selector Bar */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-arc-cyan-400/30 bg-arc-cyan-400/[0.07] p-4">
          <div className="flex items-center gap-3">
            <Layers className="h-5 w-5 text-arc-cyan-400" />
            <div>
              <p className="text-sm font-semibold text-white">
                {selectedEgg.name} — Target Build / Version
              </p>
              <p className="text-xs text-white/60">
                {selectedEgg.isMinecraft
                  ? 'Installs protected server.jar for this version and starts the server automatically upon creation.'
                  : 'Select the runtime or game version to install. Can be reinstalled with another version anytime in Settings.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedEgg.versions.map((ver) => (
              <button
                key={ver}
                type="button"
                onClick={() => handleVersionChange(ver)}
                className={cn(
                  'rounded-xl border px-3 py-1.5 font-mono text-xs font-semibold transition',
                  selectedVersion === ver
                    ? 'border-arc-cyan-400 bg-arc-cyan-400/20 text-arc-cyan-300 shadow-[0_0_12px_rgba(0,204,255,0.25)]'
                    : 'border-white/10 bg-[#080d1a] text-white/65 hover:border-white/25 hover:text-white',
                )}
              >
                {ver}
              </button>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* Step 3: Hardware Resource Limits */}
      <GlassCard hoverable={false} accentColor="violet" padding="lg">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-5 w-5 text-arc-violet-400" />
            <h2 className="text-base font-bold text-white">
              3. Hardware Resource Capping (Docker Cgroups)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {HARDWARE_PRESETS.map((preset) => (
              <GlassButton
                key={preset.label}
                type="button"
                variant={
                  memoryLimit === preset.ram && cpuLimit === preset.cpu
                    ? 'secondary'
                    : 'ghost'
                }
                size="xs"
                onClick={() => {
                  setMemoryLimit(preset.ram);
                  setCpuLimit(preset.cpu);
                  setDiskLimit(preset.disk);
                }}
              >
                {preset.label}
              </GlassButton>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <GlassInput
            label="Memory Limit (MB)"
            type="number"
            min={256}
            max={65536}
            value={memoryLimit}
            onChange={(e) => setMemoryLimit(Number(e.target.value))}
            leftIcon={<MemoryStick className="h-4 w-4" />}
            hint={`${(memoryLimit / 1024).toFixed(1)} GB Dedicated RAM`}
            required
          />

          <GlassInput
            label="CPU Limit (%)"
            type="number"
            min={25}
            max={3200}
            value={cpuLimit}
            onChange={(e) => setCpuLimit(Number(e.target.value))}
            leftIcon={<Cpu className="h-4 w-4" />}
            hint={`${(cpuLimit / 100).toFixed(1)} Logical CPU Cores`}
            required
          />

          <GlassInput
            label="NVMe Disk Quota (MB)"
            type="number"
            min={1024}
            max={512000}
            value={diskLimit}
            onChange={(e) => setDiskLimit(Number(e.target.value))}
            leftIcon={<HardDrive className="h-4 w-4" />}
            hint={`${(diskLimit / 1024).toFixed(1)} GB Container Volume`}
            required
          />
        </div>
      </GlassCard>

      {/* Step 4: Startup Command, Auto-Start on Crash & Environment Variables */}
      <GlassCard hoverable={false} accentColor="cyan" padding="lg">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <Terminal className="h-5 w-5 text-arc-cyan-400" />
            <h2 className="text-base font-bold text-white">
              4. Startup Command, Auto-Start Watchdog & Environment Variables
            </h2>
          </div>

          <GlassButton
            type="button"
            variant="ghost"
            size="xs"
            onClick={addEnvRow}
            leftIcon={<Plus className="h-3.5 w-3.5" />}
          >
            Add Variable
          </GlassButton>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <GlassInput
            label={
              selectedEgg.slug === 'python'
                ? 'Python Startup Command / Entrypoint (.py)'
                : 'Container Startup Command'
            }
            value={startupCmd}
            onChange={(e) => setStartupCmd(e.target.value)}
            className="font-mono"
          />

          {/* Auto-Start on Crash Toggle (Available for all servers) */}
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-arc-cyan-400/25 bg-arc-cyan-400/[0.06] p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-arc-cyan-400" />
              <div>
                <p className="text-sm font-semibold text-white">
                  Auto-Start on Crash (Watchdog Recovery)
                </p>
                <p className="mt-0.5 text-xs text-white/60">
                  When enabled, if the server process crashes or exits with an unexpected
                  error code, the Arc Daemon Watchdog automatically restarts the server.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoStartOnCrash}
              onClick={() => handleToggleAutoStart(!autoStartOnCrash)}
              className={cn(
                'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-all duration-200',
                autoStartOnCrash
                  ? 'border-arc-cyan-400/60 bg-arc-cyan-400/30 shadow-[0_0_15px_rgba(0,204,255,0.35)]'
                  : 'border-white/15 bg-white/10',
              )}
            >
              <span
                className={cn(
                  'inline-block h-5 w-5 transform rounded-full transition-transform duration-200',
                  autoStartOnCrash
                    ? 'translate-x-6 bg-arc-cyan-400'
                    : 'translate-x-1 bg-white/50',
                )}
              />
            </button>
          </div>

          {selectedEgg.slug === 'python' && (
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-arc-violet-400/25 bg-arc-violet-400/[0.06] p-4">
              <div>
                <p className="text-sm font-semibold text-white">
                  Run requirements.txt Before .py File (Optional)
                </p>
                <p className="mt-0.5 text-xs text-white/60">
                  When enabled, starting the server will run{' '}
                  <code className="text-arc-cyan-300">
                    pip install -r requirements.txt
                  </code>{' '}
                  first and then run your <code className="text-arc-cyan-300">.py</code>{' '}
                  script. When the Python file action completes, the server stops automatically.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={
                  envPairs.some(
                    (p) =>
                      p.key === 'INSTALL_REQUIREMENTS' && p.value === 'true',
                  )
                }
                onClick={() => {
                  const isCurrentlyEnabled = envPairs.some(
                    (p) =>
                      p.key === 'INSTALL_REQUIREMENTS' && p.value === 'true',
                  );
                  const nextVal = isCurrentlyEnabled ? 'false' : 'true';
                  setEnvPairs((prev) => {
                    const exists = prev.some(
                      (p) => p.key === 'INSTALL_REQUIREMENTS',
                    );
                    if (exists) {
                      return prev.map((p) =>
                        p.key === 'INSTALL_REQUIREMENTS'
                          ? { ...p, value: nextVal }
                          : p,
                      );
                    }
                    return [
                      ...prev,
                      { key: 'INSTALL_REQUIREMENTS', value: nextVal },
                    ];
                  });
                }}
                className={cn(
                  'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-all duration-200',
                  envPairs.some(
                    (p) =>
                      p.key === 'INSTALL_REQUIREMENTS' && p.value === 'true',
                  )
                    ? 'border-arc-cyan-400/60 bg-arc-cyan-400/30 shadow-[0_0_15px_rgba(0,204,255,0.35)]'
                    : 'border-white/15 bg-white/10',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-5 w-5 transform rounded-full transition-transform duration-200',
                    envPairs.some(
                      (p) =>
                        p.key === 'INSTALL_REQUIREMENTS' && p.value === 'true',
                    )
                      ? 'translate-x-6 bg-arc-cyan-400'
                      : 'translate-x-1 bg-white/50',
                  )}
                />
              </button>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <label className="text-sm font-medium text-white/70">
              Environment Variables
            </label>
            {envPairs.map((pair, idx) => (
              <div key={idx} className="flex items-center gap-2.5">
                <GlassInput
                  placeholder="KEY (e.g. EULA)"
                  value={pair.key}
                  onChange={(e) => updateEnvRow(idx, 'key', e.target.value)}
                  containerCls="flex-1"
                  className="font-mono"
                />
                <GlassInput
                  placeholder="VALUE (e.g. TRUE)"
                  value={pair.value}
                  onChange={(e) => updateEnvRow(idx, 'value', e.target.value)}
                  containerCls="flex-1"
                  className="font-mono"
                />
                <GlassButton
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => removeEnvRow(idx)}
                >
                  <Trash2 className="h-4 w-4" />
                </GlassButton>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/10 pt-4">
          <Link href="/dashboard">
            <GlassButton type="button" variant="ghost">
              Cancel
            </GlassButton>
          </Link>
          <GlassButton
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isDeploying}
            leftIcon={<Rocket className="h-5 w-5" />}
          >
            Deploy {selectedEgg.name} ({selectedVersion})
          </GlassButton>
        </div>
      </GlassCard>
    </form>
  );
}
