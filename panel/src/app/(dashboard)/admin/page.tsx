/* ════════════════════════════════════════════════════════════════
   src/app/(dashboard)/admin/page.tsx
   Admin Global Overview — Live Host RAM, CPU Cores, All-Core CPU Usage (%),
   Storage Utilization, Active Users, Running Containers & Multi-Node Status
════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Server,
  Cpu,
  HardDrive,
  MemoryStick,
  Activity,
  Plus,
  RefreshCw,
  Wifi,
  WifiOff,
  X,
  ArrowUpRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import GlassInput from '@/components/ui/GlassInput';
import { adminApi, nodeApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface NodeOverview {
  id: string;
  name: string;
  fqdn: string;
  port: number;
  isOnline: boolean;
  totalRamMB: number;
  usedMemoryMB: number;
  totalDiskGB?: number;
  usedDiskGB?: number;
  cpuCores: number;
  usedCpuPct: number;
  serverCount: number;
  allocationCount: number;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<{
    totalUsers: number;
    activeUsers: number;
    totalServers: number;
    runningServers: number;
    totalNodes: number;
    onlineNodes: number;
    totalRamUsedMB: number;
    totalRamMB: number;
    ramUsagePercent: number;
    cpuCores: number;
    cpuModel: string;
    cpuSpeedMHz: number;
    cpuUsagePercent: number;
    cpuCorePercentages: number[];
    totalDiskGB: number;
    usedDiskGB: number;
    freeDiskGB: number;
    diskUsagePercent: number;
    nodes: NodeOverview[];
  }>({
    totalUsers: 0,
    activeUsers: 0,
    totalServers: 0,
    runningServers: 0,
    totalNodes: 1,
    onlineNodes: 1,
    totalRamUsedMB: 0,
    totalRamMB: 16384,
    ramUsagePercent: 0,
    cpuCores: 8,
    cpuModel: 'Host Processor',
    cpuSpeedMHz: 3200,
    cpuUsagePercent: 0,
    cpuCorePercentages: [],
    totalDiskGB: 256,
    usedDiskGB: 0,
    freeDiskGB: 256,
    diskUsagePercent: 0,
    nodes: [],
  });

  const [isLoading, setIsLoading] = useState(true);

  // Add Node Modal state
  const [showNodeModal, setShowNodeModal] = useState(false);
  const [nodeName, setNodeName] = useState('');
  const [nodeFqdn, setNodeFqdn] = useState('');
  const [nodePort, setNodePort] = useState(8085);
  const [nodeToken, setNodeToken] = useState('');
  const [nodeRam, setNodeRam] = useState(16384);
  const [creatingNode, setCreatingNode] = useState(false);

  /* ── Load Global Stats + Nodes (Polled Live Every 2s) ─────────── */
  const fetchGlobalStats = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const { data } = await adminApi.getStats();
      const totalRamMB = Math.max(512, Number(data.totalRamMB ?? 16384));
      const totalRamUsedMB = Number(data.totalRamUsedMB ?? 0);
      const ramUsagePercent =
        data.ramUsagePercent !== undefined
          ? Number(data.ramUsagePercent)
          : Number(((totalRamUsedMB / totalRamMB) * 100).toFixed(1));

      setStats({
        totalUsers: Number(data.totalUsers ?? 0),
        activeUsers: Number(data.activeUsers ?? 0),
        totalServers: Number(data.totalServers ?? 0),
        runningServers: Number(data.runningServers ?? 0),
        totalNodes: Number(data.totalNodes ?? 1),
        onlineNodes: Number(data.onlineNodes ?? 1),
        totalRamUsedMB,
        totalRamMB,
        ramUsagePercent,
        cpuCores: Number(data.cpuCores ?? 8),
        cpuModel: String(data.cpuModel ?? 'Host Processor'),
        cpuSpeedMHz: Number(data.cpuSpeedMHz ?? 3200),
        cpuUsagePercent: Number(data.cpuUsagePercent ?? 0),
        cpuCorePercentages: Array.isArray(data.cpuCorePercentages)
          ? data.cpuCorePercentages.map(Number)
          : [],
        totalDiskGB: Number(data.totalDiskGB ?? 256),
        usedDiskGB: Number(data.usedDiskGB ?? 0),
        freeDiskGB: Number(data.freeDiskGB ?? 256),
        diskUsagePercent: Number(data.diskUsagePercent ?? 0),
        nodes: Array.isArray(data.nodes) ? data.nodes : [],
      });
    } catch {
      if (!silent) {
        toast.error('Failed to load global administration telemetry.');
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGlobalStats(false);
    const interval = setInterval(() => {
      void fetchGlobalStats(true);
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchGlobalStats]);

  /* ── Add Remote Daemon Node ───────────────────────────────────── */
  const handleCreateNode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingNode(true);
    try {
      await nodeApi.create({
        name: nodeName.trim(),
        fqdn: nodeFqdn.trim(),
        port: Number(nodePort),
        daemonToken: nodeToken.trim() || undefined,
        totalMemory: Number(nodeRam),
      });
      toast.success(`Connected node "${nodeName.trim()}"`);
      setNodeName('');
      setNodeFqdn('');
      setNodeToken('');
      setShowNodeModal(false);
      await fetchGlobalStats(false);
    } catch {
      toast.error('Failed to register node.');
    } finally {
      setCreatingNode(false);
    }
  };

  const usedRamGB = (stats.totalRamUsedMB / 1024).toFixed(1);
  const totalRamGB = (stats.totalRamMB / 1024).toFixed(1);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-white">
              Global Administration Overview
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-arc-cyan-400/35 bg-arc-cyan-400/12 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-arc-cyan-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-arc-cyan-400" />
              Live Telemetry (2s)
            </span>
          </div>
          <p className="mt-1 text-sm text-white/50">
            Real-time host RAM, CPU cores, live per-core CPU percentage, and
            storage telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <GlassButton
            variant="ghost"
            size="sm"
            onClick={() => void fetchGlobalStats(false)}
            leftIcon={
              <RefreshCw
                className={cn('h-4 w-4', isLoading && 'animate-spin')}
              />
            }
          >
            Sync Nodes
          </GlassButton>
          <GlassButton
            variant="primary"
            size="sm"
            onClick={() => setShowNodeModal(true)}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            Add Daemon Node
          </GlassButton>
        </div>
      </div>

      {/* Primary Hardware Telemetry Grid: RAM, Cores, Storage, Live CPU Usage (%) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* 1. Live RAM Usage */}
        <GlassCard accentColor="cyan" className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/45">
              System RAM (Live)
            </span>
            <MemoryStick className="h-5 w-5 text-arc-cyan-400" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <p className="text-2xl font-bold text-white">
                {stats.ramUsagePercent}%
              </p>
              <span className="font-mono text-xs text-arc-cyan-400">
                {usedRamGB} / {totalRamGB} GB
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-white/45">
              {stats.totalRamUsedMB.toLocaleString()} /{' '}
              {stats.totalRamMB.toLocaleString()} MB
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-arc-cyan-400 to-arc-blue-400 transition-all duration-500"
                style={{ width: `${Math.min(100, stats.ramUsagePercent)}%` }}
              />
            </div>
          </div>
        </GlassCard>

        {/* 2. CPU Cores & Architecture */}
        <GlassCard
          accentColor="violet"
          className="flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Processor Cores
            </span>
            <Cpu className="h-5 w-5 text-arc-violet-400" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-bold text-white">
                {stats.cpuCores}{' '}
                <span className="text-base font-normal text-arc-violet-300">
                  Cores
                </span>
              </p>
              <span className="font-mono text-xs text-white/50">
                {(stats.cpuSpeedMHz / 1000).toFixed(2)} GHz
              </span>
            </div>
            <p
              className="mt-1.5 truncate text-xs text-white/55"
              title={stats.cpuModel}
            >
              {stats.cpuModel}
            </p>
          </div>
        </GlassCard>

        {/* 3. Live Storage Usage */}
        <GlassCard accentColor="blue" className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Storage (Live)
            </span>
            <HardDrive className="h-5 w-5 text-arc-blue-400" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <p className="text-2xl font-bold text-white">
                {stats.diskUsagePercent}%
              </p>
              <span className="font-mono text-xs text-arc-blue-400">
                {stats.usedDiskGB} / {stats.totalDiskGB} GB
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-white/45">
              {stats.freeDiskGB} GB Free Available
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-arc-blue-400 to-arc-violet-400 transition-all duration-500"
                style={{ width: `${Math.min(100, stats.diskUsagePercent)}%` }}
              />
            </div>
          </div>
        </GlassCard>

        {/* 4. Live Total CPU Usage (%) */}
        <GlassCard accentColor="cyan" className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Live CPU Usage (%)
            </span>
            <Activity className="h-5 w-5 text-arc-cyan-400" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <p className="text-2xl font-bold text-arc-cyan-400">
                {stats.cpuUsagePercent.toFixed(1)}%
              </p>
              <span className="font-mono text-xs text-white/50">
                All {stats.cpuCores} Logical Cores
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-white/45">
              Real-time kernel tick delta
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-arc-cyan-400 to-arc-violet-400 transition-all duration-500"
                style={{ width: `${Math.min(100, stats.cpuUsagePercent)}%` }}
              />
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Live All-Core CPU Usage (%) Breakdown */}
      <GlassCard hoverable={false} accentColor="violet" padding="lg">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <h2 className="text-base font-bold text-white">
              All CPU Cores Live Utilization ({stats.cpuUsagePercent.toFixed(1)}
              % Overall)
            </h2>
            <p className="text-xs text-white/50">
              Real-time per-core percentage load across all {stats.cpuCores}{' '}
              processor threads ({stats.cpuModel}).
            </p>
          </div>
          <span className="font-mono text-xs text-arc-cyan-400">
            {stats.cpuCores} Threads Active
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {(stats.cpuCorePercentages.length > 0
            ? stats.cpuCorePercentages
            : Array.from({ length: stats.cpuCores }, () => stats.cpuUsagePercent)
          ).map((pct, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-white/55">Core #{idx}</span>
                <span className="font-mono font-semibold text-arc-cyan-400">
                  {pct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-arc-cyan-400 to-arc-violet-400 transition-all duration-500"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Platform Summary Strip: Users, Containers, Nodes */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <GlassCard accentColor="cyan" className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Registered Accounts
            </span>
            <Users className="h-5 w-5 text-arc-cyan-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-3xl font-bold text-white">{stats.totalUsers}</p>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-1 text-xs font-medium text-arc-cyan-400 hover:underline"
            >
              Manage <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </GlassCard>

        <GlassCard accentColor="blue" className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Running Containers
            </span>
            <Server className="h-5 w-5 text-arc-blue-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-3xl font-bold text-white">
              {stats.runningServers}{' '}
              <span className="text-base font-normal text-white/45">
                / {stats.totalServers}
              </span>
            </p>
            <Link
              href="/admin/servers"
              className="inline-flex items-center gap-1 text-xs font-medium text-arc-blue-400 hover:underline"
            >
              Oversee <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </GlassCard>

        <GlassCard
          accentColor="violet"
          className="flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Daemon Nodes Online
            </span>
            <Cpu className="h-5 w-5 text-arc-violet-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-3xl font-bold text-arc-cyan-400">
              {stats.onlineNodes}{' '}
              <span className="text-base font-normal text-white/45">
                / {stats.totalNodes}
              </span>
            </p>
            <span className="text-xs text-white/45">Port 8085 Handshake</span>
          </div>
        </GlassCard>
      </div>

      {/* Multi-Node Cluster Status Grid */}
      <GlassCard hoverable={false} accentColor="cyan" padding="lg">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white">
              Connected Daemon Nodes
            </h2>
            <p className="text-xs text-white/50">
              Physical & virtual hosts running the Arc Daemon (Docker Engine +
              SFTP 2022).
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          {stats.nodes.map((node) => (
            <div
              key={node.id}
              className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">
                    {node.name}
                  </h3>
                  <p className="font-mono text-xs text-white/50">
                    {node.fqdn}:{node.port}
                  </p>
                </div>

                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
                    node.isOnline
                      ? 'border-arc-cyan-400/35 bg-arc-cyan-400/12 text-arc-cyan-400'
                      : 'border-arc-orange-400/35 bg-arc-orange-400/12 text-arc-orange-400',
                  )}
                >
                  {node.isOnline ? (
                    <>
                      <Wifi className="h-3.5 w-3.5" /> Online
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3.5 w-3.5" /> Offline
                    </>
                  )}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-white/40">RAM</p>
                  <p className="mt-0.5 font-mono text-xs font-semibold text-arc-cyan-400">
                    {(node.usedMemoryMB / 1024).toFixed(1)} /{' '}
                    {(node.totalRamMB / 1024).toFixed(1)} GB
                  </p>
                </div>
                <div>
                  <p className="text-white/40">CPU ({node.cpuCores} Cores)</p>
                  <p className="mt-0.5 font-mono text-xs font-semibold text-arc-violet-400">
                    {Number(node.usedCpuPct).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-white/40">Storage</p>
                  <p className="mt-0.5 font-mono text-xs font-semibold text-arc-blue-400">
                    {node.usedDiskGB ?? stats.usedDiskGB} /{' '}
                    {node.totalDiskGB ?? stats.totalDiskGB} GB
                  </p>
                </div>
                <div>
                  <p className="text-white/40">Containers</p>
                  <p className="mt-0.5 font-mono text-xs font-semibold text-white">
                    {node.serverCount} ({node.allocationCount} ports)
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Add Daemon Node Modal */}
      <AnimatePresence>
        {showNodeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
          >
            <GlassCard
              hoverable={false}
              accentColor="cyan"
              className="w-full max-w-lg"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white">
                  Connect Remote Daemon Node
                </h3>
                <button
                  type="button"
                  onClick={() => setShowNodeModal(false)}
                  className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form
                onSubmit={handleCreateNode}
                className="mt-4 flex flex-col gap-4"
              >
                <GlassInput
                  label="Node Identifier"
                  placeholder="eu-central-node-01"
                  value={nodeName}
                  onChange={(e) => setNodeName(e.target.value)}
                  required
                />

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <GlassInput
                      label="FQDN or Public IPv4"
                      placeholder="198.51.100.42"
                      value={nodeFqdn}
                      onChange={(e) => setNodeFqdn(e.target.value)}
                      required
                    />
                  </div>
                  <GlassInput
                    label="Daemon Port"
                    type="number"
                    value={nodePort}
                    onChange={(e) => setNodePort(Number(e.target.value))}
                    required
                  />
                </div>

                <GlassInput
                  label="Total Allocatable RAM (MB)"
                  type="number"
                  value={nodeRam}
                  onChange={(e) => setNodeRam(Number(e.target.value))}
                  required
                />

                <GlassInput
                  label="Shared Daemon Handshake Token (optional — auto-generated if blank)"
                  placeholder="64-character hex token from daemon .env"
                  value={nodeToken}
                  onChange={(e) => setNodeToken(e.target.value)}
                />

                <div className="mt-2 flex justify-end gap-2">
                  <GlassButton
                    type="button"
                    variant="ghost"
                    onClick={() => setShowNodeModal(false)}
                  >
                    Cancel
                  </GlassButton>
                  <GlassButton
                    type="submit"
                    variant="primary"
                    isLoading={creatingNode}
                  >
                    Register & Handshake
                  </GlassButton>
                </div>
              </form>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
