/* ════════════════════════════════════════════════════════════════
   src/app/(dashboard)/servers/[id]/page.tsx
   Server Management Control Center
   Tabs: Console | Resources | Files | Backups | Network | Settings
════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Terminal,
  Activity,
  FolderOpen,
  Archive,
  Network,
  Settings,
  Play,
  Square,
  RotateCw,
  ZapOff,
  Cpu,
  MemoryStick,
  HardDrive,
  Download,
  Trash2,
  RotateCcw,
  Plus,
  ArrowLeft,
  Code2,
  FileCode2,
  CheckCircle2,
  ShieldCheck,
  Layers,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import GlassInput from '@/components/ui/GlassInput';
import StatusBadge from '@/components/ui/StatusBadge';
import ServerConsole from '@/components/dashboard/ServerConsole';
import ResourceChart from '@/components/dashboard/ResourceChart';
import FileManager from '@/components/dashboard/FileManager';
import { useAuth } from '@/hooks/useAuth';
import { useServerStats } from '@/hooks/useServerStats';
import { serverApi, backupApi } from '@/lib/api';
import { formatBytes, cn } from '@/lib/utils';
import { EGG_CATALOG } from '../create/page';
import type { Server, Backup, ServerStatus } from '@/types';

type TabKey =
  | 'console'
  | 'resources'
  | 'files'
  | 'backups'
  | 'network'
  | 'settings';

function parseEnvObject(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      out[k] = String(v ?? '');
    }
    return out;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          out[k] = String(v ?? '');
        }
        return out;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export default function ServerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const serverId = params.id;

  const accessToken = useAuth((s) => s.accessToken);
  const [server, setServer] = useState<
    (Server & { startupCmd?: string }) | null
  >(null);
  const [activeTab, setActiveTab] = useState<TabKey>('console');
  const [isLoading, setIsLoading] = useState(true);
  const [powerBusy, setPowerBusy] = useState(false);

  // Backups tab state
  const [backups, setBackups] = useState<Backup[]>([]);
  const [backupName, setBackupName] = useState('');
  const [creatingBackup, setCreatingBackup] = useState(false);

  // Settings tab state
  const [editName, setEditName] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [editStartupCmd, setEditStartupCmd] = useState('');
  const [autoStart, setAutoStart] = useState(true);
  const [installRequirements, setInstallRequirements] = useState(false);
  const [requirementsFile, setRequirementsFile] = useState('requirements.txt');
  const [pythonFile, setPythonFile] = useState('main.py');

  // Reinstall / Version Switch state
  const [reinstallEggSlug, setReinstallEggSlug] = useState('minecraft-paper');
  const [reinstallVersion, setReinstallVersion] = useState('1.21.4');
  const [wipeFilesOnReinstall, setWipeFilesOnReinstall] = useState(false);
  const [isReinstalling, setIsReinstalling] = useState(false);

  const [assignableUsers, setAssignableUsers] = useState<
    Array<{ id: string; username: string; email: string; role: string }>
  >([
    {
      id: 'clx_admin_001',
      username: 'admin',
      email: 'admin@arc.local',
      role: 'ADMIN',
    },
  ]);
  const [savingSettings, setSavingSettings] = useState(false);

  // Live WebSocket telemetry
  const stats = useServerStats(serverId, accessToken);

  /* ── Load Server Details ──────────────────────────────────────── */
  const fetchServer = useCallback(async () => {
    try {
      const [{ data }, usersRes] = await Promise.all([
        serverApi.getServer(serverId),
        import('@/lib/api')
          .then((m) => m.api.get('/servers/users'))
          .catch(() => ({ data: { users: [] } })),
      ]);
      const raw = (data.server ?? data) as Record<string, unknown>;
      const allocations = Array.isArray(raw.allocations)
        ? (raw.allocations as Server['allocations'])
        : [];
      const envObj = parseEnvObject(raw.environment);
      const rawStartupCmd = String(raw.startupCmd ?? '');

      const normalized: Server & { startupCmd?: string } = {
        id: String(raw.id),
        name: String(raw.name),
        ownerId: String(raw.ownerId ?? ''),
        owner: raw.owner as Server['owner'],
        nodeId: String(raw.nodeId ?? ''),
        node: raw.node as Server['node'],
        status: String(raw.status ?? 'stopped').toLowerCase() as ServerStatus,
        limits: (raw.limits as Server['limits']) ?? {
          ramMB: Number(raw.memoryLimit ?? 2048),
          cpuPct: Number(raw.cpuLimit ?? 100),
          diskMB: Number(raw.diskLimit ?? 10240),
          swapMB: 512,
          ioWeight: 500,
        },
        allocation: allocations[0],
        allocations,
        eggId: String(raw.image ?? 'minecraft-paper'),
        eggName: String(raw.image ?? 'Container'),
        dockerImage: String(raw.dockerImage ?? ''),
        environment: envObj,
        startupCmd: rawStartupCmd,
        createdAt: String(raw.createdAt ?? new Date().toISOString()),
        updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
      };

      const isPython =
        normalized.eggId.toLowerCase().includes('python') ||
        normalized.dockerImage.toLowerCase().includes('python');
      const resolvedPyScript =
        rawStartupCmd.replace(/^python3?\s+/i, '').trim() ||
        envObj.PYTHON_FILE ||
        'main.py';
      const reqEnabled =
        envObj.INSTALL_REQUIREMENTS === 'true' ||
        envObj.INSTALL_REQUIREMENTS === '1' ||
        envObj.RUN_REQUIREMENTS === 'true';
      const autoStartEnabled =
        envObj.AUTO_START !== undefined
          ? envObj.AUTO_START === 'true' || envObj.AUTO_START === '1'
          : true;

      // Match egg catalog for reinstall selector
      const normalizedSlug =
        normalized.eggId === 'minecraft-java'
          ? 'minecraft-paper'
          : normalized.eggId;
      const matchedEgg =
        EGG_CATALOG.find((e) => e.slug === normalizedSlug) ?? EGG_CATALOG[0];
      const currentVer =
        envObj.VERSION && envObj.VERSION !== 'LATEST'
          ? envObj.VERSION
          : matchedEgg.versions[0];

      setServer(normalized);
      setEditName(normalized.name);
      setSelectedOwnerId(normalized.ownerId || 'clx_admin_001');
      setEditStartupCmd(
        rawStartupCmd || (isPython ? `python ${resolvedPyScript}` : ''),
      );
      setPythonFile(resolvedPyScript);
      setInstallRequirements(reqEnabled);
      setRequirementsFile(envObj.REQUIREMENTS_FILE || 'requirements.txt');
      setAutoStart(autoStartEnabled);
      setReinstallEggSlug(matchedEgg.slug);
      setReinstallVersion(currentVer);

      if (
        Array.isArray(usersRes?.data?.users) &&
        usersRes.data.users.length > 0
      ) {
        setAssignableUsers(usersRes.data.users);
      }
    } catch {
      toast.error('Server not found or inaccessible.');
    } finally {
      setIsLoading(false);
    }
  }, [serverId]);

  /* ── Load Backups ─────────────────────────────────────────────── */
  const fetchBackups = useCallback(async () => {
    try {
      const { data } = await backupApi.list(serverId);
      const list = Array.isArray(data) ? data : (data.backups ?? []);
      setBackups(list);
    } catch {
      // Ignore initial backup error
    }
  }, [serverId]);

  useEffect(() => {
    void fetchServer();
    void fetchBackups();
  }, [fetchServer, fetchBackups]);

  /* ── Power Action Handler ─────────────────────────────────────── */
  const handlePower = async (action: 'start' | 'stop' | 'restart' | 'kill') => {
    setPowerBusy(true);
    setServer((prev) =>
      prev
        ? {
            ...prev,
            status:
              action === 'start' || action === 'restart'
                ? 'starting'
                : action === 'stop'
                  ? 'stopping'
                  : 'stopped',
          }
        : prev,
    );

    if (typeof window !== 'undefined' && server) {
      window.dispatchEvent(
        new CustomEvent('arc:power-event', {
          detail: {
            serverId,
            action,
            serverName: server.name,
            dockerImage: server.dockerImage,
          },
        }),
      );
    }

    try {
      await serverApi.power(serverId, action);
      const finalState: ServerStatus =
        action === 'start' || action === 'restart' ? 'running' : 'stopped';
      toast.success(
        action === 'start'
          ? 'Container started and running.'
          : action === 'restart'
            ? 'Container restarted successfully.'
            : action === 'stop'
              ? 'Container stopped gracefully.'
              : 'Container process killed.',
      );
      setTimeout(() => {
        setServer((prev) => (prev ? { ...prev, status: finalState } : prev));
        void fetchServer();
      }, 900);
    } catch {
      toast.error(`Failed to send ${action} signal.`);
      await fetchServer();
    } finally {
      setPowerBusy(false);
    }
  };

  /* ── Backup Handlers ──────────────────────────────────────────── */
  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingBackup(true);
    try {
      await backupApi.create(
        serverId,
        backupName.trim() || `snapshot-${Date.now()}`,
      );
      toast.success('Backup snapshot created.');
      setBackupName('');
      await fetchBackups();
    } catch {
      toast.error('Failed to create backup.');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (backupId: string) => {
    try {
      await backupApi.restore(serverId, backupId);
      toast.success('Backup restored to server volume.');
    } catch {
      toast.error('Failed to restore backup.');
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    try {
      await backupApi.delete(serverId, backupId);
      toast.success('Backup deleted.');
      await fetchBackups();
    } catch {
      toast.error('Failed to delete backup.');
    }
  };

  /* ── Instant Toggle for Auto-Start on Crash (Watchdog) ────────── */
  const handleToggleAutoStart = async (nextVal: boolean) => {
    setAutoStart(nextVal);
    if (!server) return;

    const nextEnv: Record<string, string> = {
      ...(server.environment ?? {}),
      AUTO_START: nextVal ? 'true' : 'false',
    };

    try {
      await serverApi.updateServer(serverId, {
        environment: nextEnv,
      });
      setServer((prev) =>
        prev ? { ...prev, environment: nextEnv } : prev,
      );
      toast.success(
        nextVal
          ? 'Auto-Start on Crash enabled: Watchdog will automatically restart the server if it crashes.'
          : 'Auto-Start on Crash disabled.',
      );
    } catch {
      toast.error('Failed to update Auto-Start preference.');
    }
  };

  /* ── Instant Toggle for Optional Python requirements.txt ──────── */
  const handleToggleRequirements = async (nextVal: boolean) => {
    setInstallRequirements(nextVal);
    if (!server) return;

    const cleanPy = pythonFile.trim() || 'main.py';
    const nextEnv: Record<string, string> = {
      ...(server.environment ?? {}),
      INSTALL_REQUIREMENTS: nextVal ? 'true' : 'false',
      REQUIREMENTS_FILE: requirementsFile.trim() || 'requirements.txt',
      PYTHON_FILE: cleanPy,
    };

    try {
      await serverApi.updateServer(serverId, {
        environment: nextEnv,
        startupCmd: `python ${cleanPy}`,
      });
      setServer((prev) =>
        prev
          ? {
              ...prev,
              environment: nextEnv,
              startupCmd: `python ${cleanPy}`,
            }
          : prev,
      );
      toast.success(
        nextVal
          ? 'requirements.txt enabled: will install packages first, then run .py file on start.'
          : 'requirements.txt disabled (optional): will run .py file directly on start.',
      );
    } catch {
      toast.error('Failed to save requirements.txt preference.');
    }
  };

  /* ── Reinstall Server / Switch Version Handler ────────────────── */
  const handleReinstallServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!server) return;
    setIsReinstalling(true);
    try {
      const { data } = await serverApi.reinstallServer(serverId, {
        eggSlug: reinstallEggSlug,
        version: reinstallVersion,
        wipeFiles: wipeFilesOnReinstall,
      });
      toast.success(
        data?.message ||
          `Reinstalling ${reinstallEggSlug} (${reinstallVersion})...`,
      );
      await fetchServer();
      setActiveTab('console');
    } catch {
      toast.error('Failed to reinstall server version.');
    } finally {
      setIsReinstalling(false);
    }
  };

  /* ── Settings Form Submit ─────────────────────────────────────── */
  const handleUpdateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !server) return;
    setSavingSettings(true);

    const isPython =
      server.eggId.toLowerCase().includes('python') ||
      server.dockerImage.toLowerCase().includes('python');
    const cleanPy = pythonFile.trim() || 'main.py';
    const resolvedCmd = isPython
      ? `python ${cleanPy}`
      : editStartupCmd.trim() || server.startupCmd;

    const nextEnv: Record<string, string> = {
      ...(server.environment ?? {}),
      AUTO_START: autoStart ? 'true' : 'false',
      ...(isPython
        ? {
            INSTALL_REQUIREMENTS: installRequirements ? 'true' : 'false',
            REQUIREMENTS_FILE: requirementsFile.trim() || 'requirements.txt',
            PYTHON_FILE: cleanPy,
          }
        : {}),
    };

    try {
      await serverApi.updateServer(serverId, {
        name: editName.trim(),
        ownerId: selectedOwnerId || undefined,
        startupCmd: resolvedCmd || undefined,
        environment: nextEnv,
      });
      toast.success('Server settings saved.');
      await fetchServer();
    } catch {
      toast.error('Failed to update server settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDeleteServer = async () => {
    try {
      await serverApi.deleteServer(serverId);
      toast.success('Server destroyed.');
      router.push('/dashboard');
    } catch {
      toast.error('Failed to delete server.');
    }
  };

  if (isLoading || !server) {
    return (
      <GlassCard className="py-16 text-center text-white/60">
        Loading server control center...
      </GlassCard>
    );
  }

  const effectiveStatus: ServerStatus = stats.connected
    ? stats.status
    : server.status;

  const isPythonServer =
    server.eggId.toLowerCase().includes('python') ||
    server.dockerImage.toLowerCase().includes('python');

  const isMinecraftServer =
    server.eggId.toLowerCase().includes('minecraft') ||
    server.dockerImage.toLowerCase().includes('minecraft') ||
    server.dockerImage.toLowerCase().includes('mc-proxy');

  const selectedReinstallEgg =
    EGG_CATALOG.find((e) => e.slug === reinstallEggSlug) ?? EGG_CATALOG[0];

  const TABS: Array<{
    key: TabKey;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { key: 'console', label: 'Live Console', icon: Terminal },
    { key: 'resources', label: 'Resources', icon: Activity },
    { key: 'files', label: 'File Manager', icon: FolderOpen },
    { key: 'backups', label: 'Backups', icon: Archive },
    { key: 'network', label: 'Network', icon: Network },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Top Server Header + Power Controls */}
      <GlassCard
        hoverable={false}
        accentColor="cyan"
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3.5">
          <Link
            href="/dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold text-white">{server.name}</h1>
              <StatusBadge status={effectiveStatus} />

              {/* Auto-Start Watchdog Pill (All Servers) */}
              <button
                type="button"
                onClick={() => void handleToggleAutoStart(!autoStart)}
                title="Click to toggle Auto-Start on Crash (Watchdog)"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition',
                  autoStart
                    ? 'border-arc-cyan-400/40 bg-arc-cyan-400/15 text-arc-cyan-300 shadow-[0_0_12px_rgba(0,204,255,0.2)]'
                    : 'border-white/15 bg-white/[0.04] text-white/55 hover:border-white/30 hover:text-white/80',
                )}
              >
                <ShieldCheck className="h-3.5 w-3.5 text-arc-cyan-400" />
                <span>
                  Auto-Start:{' '}
                  <strong className="font-semibold">
                    {autoStart ? 'On Crash' : 'Off'}
                  </strong>
                </span>
              </button>

              {isPythonServer && (
                <button
                  type="button"
                  onClick={() => void handleToggleRequirements(!installRequirements)}
                  title="Click to toggle optional requirements.txt execution before running .py file"
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition',
                    installRequirements
                      ? 'border-arc-cyan-400/40 bg-arc-cyan-400/15 text-arc-cyan-300 shadow-[0_0_12px_rgba(0,204,255,0.2)]'
                      : 'border-white/15 bg-white/[0.04] text-white/55 hover:border-white/30 hover:text-white/80',
                  )}
                >
                  <FileCode2 className="h-3.5 w-3.5 text-arc-cyan-400" />
                  <span>
                    requirements.txt:{' '}
                    <strong className="font-semibold">
                      {installRequirements ? 'Enabled (Runs 1st)' : 'Optional (Off)'}
                    </strong>
                  </span>
                </button>
              )}
            </div>
            <p className="mt-0.5 font-mono text-xs text-white/45">
              ID: {server.id.slice(0, 12)} • Egg: {server.eggId} (
              {server.environment?.VERSION || 'latest'}) •{' '}
              {server.allocation
                ? `${server.allocation.ip}:${server.allocation.port}`
                : 'Port 25500'}
              {isPythonServer && ` • Entrypoint: python ${pythonFile} (Auto-Stops on Done)`}
            </p>
          </div>
        </div>

        {/* Power Control Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <GlassButton
            variant="primary"
            size="sm"
            disabled={powerBusy}
            onClick={() => void handlePower('start')}
            leftIcon={<Play className="h-3.5 w-3.5" />}
          >
            Start
          </GlassButton>
          <GlassButton
            variant="outline"
            size="sm"
            disabled={powerBusy}
            onClick={() => void handlePower('restart')}
            leftIcon={<RotateCw className="h-3.5 w-3.5" />}
          >
            Restart
          </GlassButton>
          <GlassButton
            variant="secondary"
            size="sm"
            disabled={powerBusy}
            onClick={() => void handlePower('stop')}
            leftIcon={<Square className="h-3.5 w-3.5" />}
          >
            Stop
          </GlassButton>
          <GlassButton
            variant="danger"
            size="sm"
            disabled={powerBusy}
            onClick={() => void handlePower('kill')}
            leftIcon={<ZapOff className="h-3.5 w-3.5" />}
          >
            Kill
          </GlassButton>
        </div>
      </GlassCard>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-1.5 backdrop-blur-xl">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200',
                active
                  ? 'border border-arc-cyan-400/35 bg-arc-cyan-400/15 text-arc-cyan-400 shadow-[0_0_20px_rgba(0,204,255,0.2)]'
                  : 'text-white/60 hover:bg-white/[0.05] hover:text-white',
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── TAB 1: CONSOLE (Kept mounted across tabs so live stream never drops) ── */}
      <div
        className={cn(
          'grid grid-cols-1 gap-5 xl:grid-cols-3',
          activeTab !== 'console' && 'hidden',
        )}
      >
        <div className="xl:col-span-2">
          <ServerConsole
            serverId={server.id}
            serverName={server.name}
            token={accessToken}
          />
        </div>
        <div className="flex flex-col gap-4">
          {isPythonServer && (
            <GlassCard hoverable={false} accentColor="cyan" padding="md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-arc-cyan-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Python Startup Pipeline
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className="text-xs font-medium text-arc-cyan-400 hover:underline"
                >
                  Configure →
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <span className="text-white/60">1. {requirementsFile} (Optional)</span>
                  <button
                    type="button"
                    onClick={() => void handleToggleRequirements(!installRequirements)}
                    className={cn(
                      'rounded-lg px-2 py-0.5 font-semibold transition',
                      installRequirements
                        ? 'bg-arc-cyan-400/20 text-arc-cyan-300'
                        : 'bg-white/10 text-white/50 hover:text-white/80',
                    )}
                  >
                    {installRequirements ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <span className="text-white/60">2. Python Entrypoint</span>
                  <span className="font-mono font-semibold text-arc-cyan-400">
                    python {pythonFile}
                  </span>
                </div>
              </div>
            </GlassCard>
          )}
          <ResourceChart
            label="CPU Utilization"
            subtitle={`Limit: ${server.limits.cpuPct}%`}
            data={stats.cpuHistory}
            unit="%"
            maxValue={server.limits.cpuPct}
            color="cyan"
            icon={<Cpu className="h-4 w-4" />}
          />
          <ResourceChart
            label="Memory Usage"
            subtitle={`Limit: ${server.limits.ramMB} MB`}
            data={stats.ramHistory}
            unit="MB"
            maxValue={server.limits.ramMB}
            color="violet"
            icon={<MemoryStick className="h-4 w-4" />}
          />
        </div>
      </div>

      {/* ── TAB 2: RESOURCES ─────────────────────────────────────── */}
      {activeTab === 'resources' && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <ResourceChart
            label="CPU Load"
            subtitle={`Cap: ${server.limits.cpuPct}%`}
            data={stats.cpuHistory}
            unit="%"
            maxValue={server.limits.cpuPct}
            color="cyan"
            icon={<Cpu className="h-4 w-4" />}
          />
          <ResourceChart
            label="RAM Allocation"
            subtitle={`Cap: ${server.limits.ramMB} MB`}
            data={stats.ramHistory}
            unit="MB"
            maxValue={server.limits.ramMB}
            color="blue"
            icon={<MemoryStick className="h-4 w-4" />}
          />
          <ResourceChart
            label="Disk Storage"
            subtitle={`Cap: ${server.limits.diskMB} MB`}
            data={stats.diskHistory}
            unit="MB"
            maxValue={server.limits.diskMB}
            color="violet"
            icon={<HardDrive className="h-4 w-4" />}
          />
        </div>
      )}

      {/* ── TAB 3: FILE MANAGER ──────────────────────────────────── */}
      {activeTab === 'files' && <FileManager serverId={server.id} />}

      {/* ── TAB 4: BACKUPS ───────────────────────────────────────── */}
      {activeTab === 'backups' && (
        <div className="flex flex-col gap-5">
          <GlassCard hoverable={false} accentColor="cyan">
            <form
              onSubmit={handleCreateBackup}
              className="flex flex-wrap items-end gap-3"
            >
              <GlassInput
                label="New Snapshot Name"
                placeholder="pre-update-snapshot"
                value={backupName}
                onChange={(e) => setBackupName(e.target.value)}
                containerCls="flex-1 min-w-[240px]"
              />
              <GlassButton
                type="submit"
                variant="primary"
                isLoading={creatingBackup}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Create Backup
              </GlassButton>
            </form>
          </GlassCard>

          <GlassCard hoverable={false} padding="none">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase text-white/45">
                  <th className="px-5 py-3.5">Archive Name</th>
                  <th className="px-4 py-3.5">Size</th>
                  <th className="px-4 py-3.5">Created At</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {backups.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-10 text-center text-white/45"
                    >
                      No backups created for this server yet.
                    </td>
                  </tr>
                ) : (
                  backups.map((b) => (
                    <tr key={b.id} className="hover:bg-white/[0.03]">
                      <td className="px-5 py-3 font-mono text-white/90">
                        {b.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-white/60">
                        {formatBytes(b.sizeBytes ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-xs text-white/50">
                        {new Date(b.createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <a
                            href={backupApi.download(server.id, b.id)}
                            className="inline-flex h-8 items-center gap-1 rounded-xl border border-arc-cyan-400/30 bg-arc-cyan-400/10 px-3 text-xs font-semibold text-arc-cyan-400 hover:bg-arc-cyan-400/20"
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </a>
                          <GlassButton
                            variant="secondary"
                            size="xs"
                            onClick={() => void handleRestoreBackup(b.id)}
                            leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                          >
                            Restore
                          </GlassButton>
                          <GlassButton
                            variant="danger"
                            size="xs"
                            onClick={() => void handleDeleteBackup(b.id)}
                            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                          >
                            Delete
                          </GlassButton>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </GlassCard>
        </div>
      )}

      {/* ── TAB 5: NETWORK ───────────────────────────────────────── */}
      {activeTab === 'network' && (
        <GlassCard hoverable={false} accentColor="blue">
          <h3 className="text-base font-semibold text-white">
            Port Allocations (Range 25500–26000)
          </h3>
          <p className="mt-1 text-xs text-white/50">
            Network bindings assigned to this container on the host node.
          </p>
          <div className="mt-4 divide-y divide-white/10">
            {(server.allocations.length > 0
              ? server.allocations
              : [
                  {
                    id: 'default',
                    nodeId: server.nodeId,
                    ip: '127.0.0.1',
                    port: 25500,
                    assigned: true,
                  },
                ]
            ).map((alloc, idx) => (
              <div
                key={alloc.id ?? idx}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="font-mono text-sm font-semibold text-arc-cyan-400">
                    {alloc.ip}:{alloc.port}
                  </p>
                  <p className="text-xs text-white/45">
                    TCP / UDP Game & Query Traffic
                  </p>
                </div>
                <span className="rounded-full border border-arc-cyan-400/30 bg-arc-cyan-400/10 px-3 py-1 text-xs font-semibold text-arc-cyan-400">
                  Primary Allocation
                </span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* ── TAB 6: SETTINGS ──────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <GlassCard hoverable={false} accentColor="cyan">
            <h3 className="text-base font-semibold text-white">
              General, Startup, Auto-Start Watchdog & Ownership
            </h3>
            <form
              onSubmit={handleUpdateServer}
              className="mt-4 flex flex-col gap-4"
            >
              <GlassInput
                label="Server Display Name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-white/70">
                  Server Owner (Transfer / Give Server to User)
                </label>
                <select
                  value={selectedOwnerId}
                  onChange={(e) => setSelectedOwnerId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-white/10 bg-[#080d1a] px-3.5 text-sm text-white/90 focus:border-arc-cyan-400 focus:outline-none"
                >
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      @{u.username} ({u.email}) — {u.role}
                    </option>
                  ))}
                </select>
              </div>

              {/* Auto-Start on Crash Toggle Card (For All Servers) */}
              <div className="rounded-2xl border border-arc-cyan-400/25 bg-arc-cyan-400/[0.06] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-arc-cyan-400" />
                      <span className="text-sm font-semibold text-white">
                        Auto-Start on Crash (Watchdog Recovery)
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-white/60">
                      Automatically restarts the server container if the process
                      crashes or exits unexpectedly with a non-zero exit code.
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoStart}
                    onClick={() => void handleToggleAutoStart(!autoStart)}
                    className={cn(
                      'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-all duration-200',
                      autoStart
                        ? 'border-arc-cyan-400/60 bg-arc-cyan-400/30 shadow-[0_0_15px_rgba(0,204,255,0.35)]'
                        : 'border-white/15 bg-white/10',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-5 w-5 transform rounded-full transition-transform duration-200',
                        autoStart
                          ? 'translate-x-6 bg-arc-cyan-400'
                          : 'translate-x-1 bg-white/50',
                      )}
                    />
                  </button>
                </div>
              </div>

              {isPythonServer ? (
                <>
                  <GlassInput
                    label="Python Entrypoint File (.py)"
                    placeholder="main.py"
                    value={pythonFile}
                    onChange={(e) => {
                      setPythonFile(e.target.value);
                      setEditStartupCmd(`python ${e.target.value}`);
                    }}
                    hint="The .py file executed after optional requirements.txt installation. Server automatically stops when the file action completes."
                    className="font-mono"
                    required
                  />

                  {/* Optional requirements.txt Toggle Card */}
                  <div className="rounded-2xl border border-arc-violet-400/25 bg-arc-violet-400/[0.06] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <FileCode2 className="h-4 w-4 text-arc-cyan-400" />
                          <span className="text-sm font-semibold text-white">
                            Run requirements.txt Before .py File (Optional)
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-white/60">
                          <code className="text-arc-cyan-300">requirements.txt</code>{' '}
                          is optional for Python servers. When enabled, starting or
                          restarting this server will run{' '}
                          <code className="text-arc-cyan-300">
                            pip install -r {requirementsFile || 'requirements.txt'}
                          </code>{' '}
                          first and then execute{' '}
                          <code className="text-arc-cyan-300">
                            python {pythonFile || 'main.py'}
                          </code>
                          . When the Python file finishes its action, the server stops automatically.
                        </p>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={installRequirements}
                        onClick={() =>
                          void handleToggleRequirements(!installRequirements)
                        }
                        className={cn(
                          'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-all duration-200',
                          installRequirements
                            ? 'border-arc-cyan-400/60 bg-arc-cyan-400/30 shadow-[0_0_15px_rgba(0,204,255,0.35)]'
                            : 'border-white/15 bg-white/10',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-5 w-5 transform rounded-full transition-transform duration-200',
                            installRequirements
                              ? 'translate-x-6 bg-arc-cyan-400'
                              : 'translate-x-1 bg-white/50',
                          )}
                        />
                      </button>
                    </div>

                    {installRequirements && (
                      <div className="mt-3 border-t border-white/10 pt-3">
                        <GlassInput
                          label="Requirements Filename (Optional)"
                          placeholder="requirements.txt"
                          value={requirementsFile}
                          onChange={(e) => setRequirementsFile(e.target.value)}
                          className="font-mono"
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <GlassInput
                  label="Container Startup Command"
                  value={editStartupCmd}
                  onChange={(e) => setEditStartupCmd(e.target.value)}
                  className="font-mono"
                />
              )}

              <div>
                <GlassButton
                  type="submit"
                  variant="primary"
                  isLoading={savingSettings}
                  leftIcon={<CheckCircle2 className="h-4 w-4" />}
                >
                  Save Server Settings
                </GlassButton>
              </div>
            </form>
          </GlassCard>

          <div className="flex flex-col gap-5">
            {/* Reinstall Server & Switch Egg Version Card */}
            <GlassCard hoverable={false} accentColor="violet">
              <div className="flex items-center gap-2.5">
                <Layers className="h-5 w-5 text-arc-violet-400" />
                <h3 className="text-base font-semibold text-white">
                  Reinstall Server & Change Version (Egg Manager)
                </h3>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-white/60">
                Reinstall this server with a different version according to its Egg
                {isMinecraftServer
                  ? ' (or switch Minecraft loader between Paper, Fabric, Forge, NeoForge, Purpur, Spigot, Vanilla, Velocity & Bedrock). Replaces the protected server.jar and restarts automatically.'
                  : '. Updates core runtime binaries and restarts the container.'}
              </p>

              <form
                onSubmit={handleReinstallServer}
                className="mt-4 flex flex-col gap-4"
              >
                {isMinecraftServer ? (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-white/70">
                      Minecraft Loader / Egg Variant
                    </label>
                    <select
                      value={reinstallEggSlug}
                      onChange={(e) => {
                        const nextSlug = e.target.value;
                        setReinstallEggSlug(nextSlug);
                        const nextEgg = EGG_CATALOG.find(
                          (item) => item.slug === nextSlug,
                        );
                        if (nextEgg && nextEgg.versions.length > 0) {
                          setReinstallVersion(nextEgg.versions[0]);
                        }
                      }}
                      className="h-10 w-full rounded-xl border border-white/10 bg-[#080d1a] px-3.5 text-sm text-white/90 focus:border-arc-cyan-400 focus:outline-none"
                    >
                      {EGG_CATALOG.filter((e) => e.isMinecraft).map((egg) => (
                        <option key={egg.slug} value={egg.slug}>
                          {egg.name} ({egg.slug})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-white/70">
                      Current Server Egg
                    </label>
                    <div className="flex h-10 items-center justify-between rounded-xl border border-white/10 bg-[#080d1a] px-3.5 text-sm text-white/85">
                      <span>{selectedReinstallEgg.name}</span>
                      <span className="font-mono text-xs text-arc-cyan-400">
                        {selectedReinstallEgg.slug}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-white/70">
                    Select Target Version ({selectedReinstallEgg.name})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedReinstallEgg.versions.map((ver) => (
                      <button
                        key={ver}
                        type="button"
                        onClick={() => setReinstallVersion(ver)}
                        className={cn(
                          'rounded-xl border px-3 py-1.5 font-mono text-xs font-semibold transition',
                          reinstallVersion === ver
                            ? 'border-arc-cyan-400 bg-arc-cyan-400/20 text-arc-cyan-300 shadow-[0_0_12px_rgba(0,204,255,0.25)]'
                            : 'border-white/10 bg-[#080d1a] text-white/65 hover:border-white/25 hover:text-white',
                        )}
                      >
                        {ver}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-xs text-white/75">
                  <input
                    type="checkbox"
                    checked={wipeFilesOnReinstall}
                    onChange={(e) => setWipeFilesOnReinstall(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-black/40 accent-cyan-400"
                  />
                  <span>
                    Clean reinstall (reset user config files in addition to replacing core{' '}
                    <code className="text-arc-cyan-300">server.jar</code> / runtime binaries)
                  </span>
                </label>

                <div>
                  <GlassButton
                    type="submit"
                    variant="secondary"
                    isLoading={isReinstalling}
                    leftIcon={<RefreshCw className="h-4 w-4" />}
                  >
                    Reinstall {selectedReinstallEgg.name} ({reinstallVersion})
                  </GlassButton>
                </div>
              </form>
            </GlassCard>

            {/* Danger Zone Card */}
            <GlassCard hoverable={false} accentColor="orange">
              <h3 className="text-base font-semibold text-arc-orange-400">
                Danger Zone
              </h3>
              <p className="mt-1 text-xs text-white/55">
                Permanently destroy this Docker container and release its port
                allocations.
              </p>
              <div className="mt-5">
                <GlassButton
                  variant="danger"
                  onClick={() => void handleDeleteServer()}
                  leftIcon={<Trash2 className="h-4 w-4" />}
                >
                  Destroy Server Permanently
                </GlassButton>
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
}
