/* ════════════════════════════════════════════════════════════════
   src/app/(dashboard)/dashboard/page.tsx
   Client Dashboard Overview — Staggered glass server cards,
   quick power actions, and resource bars (Server creation restricted to Admins)
════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Server as ServerIcon,
  Play,
  Square,
  RotateCw,
  Cpu,
  HardDrive,
  MemoryStick,
  Terminal,
  RefreshCw,
  Network,
  Sparkles,
  PlusCircle,
  Shield,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import StatusBadge from '@/components/ui/StatusBadge';
import { serverApi } from '@/lib/api';
import type { Server, ServerStatus } from '@/types';

export default function ClientDashboardPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [powerBusyId, setPowerBusyId] = useState<string | null>(null);

  /* ── Fetch User's Assigned Servers ─────────────────────────────── */
  const fetchServers = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await serverApi.listMine();

      const rawList: Array<Record<string, unknown>> = Array.isArray(data)
        ? data
        : (data.servers ?? data.items ?? []);

      const mapped: Server[] = (rawList || []).filter(Boolean).map((srv: any) => {
        const allocations = Array.isArray(srv?.allocations)
          ? (srv.allocations as Server['allocations'])
          : [];
        return {
          id: String(srv?.id ?? ''),
          name: String(srv?.name ?? 'Server'),
          ownerId: String(srv?.ownerId ?? ''),
          owner: srv?.owner as Server['owner'],
          nodeId: String(srv?.nodeId ?? ''),
          node: srv?.node as Server['node'],
          status: String(srv?.status ?? 'stopped').toLowerCase() as ServerStatus,
          limits: (srv?.limits as Server['limits']) ?? {
            ramMB: Number(srv?.memoryLimit ?? 2048),
            cpuPct: Number(srv?.cpuLimit ?? 100),
            diskMB: Number(srv?.diskLimit ?? 10240),
            swapMB: 512,
            ioWeight: 500,
          },
          allocation: allocations[0],
          allocations,
          eggId: String(srv?.image ?? srv?.eggId ?? 'minecraft-java'),
          eggName: String(srv?.image ?? srv?.eggName ?? 'Container'),
          dockerImage: String(srv?.dockerImage ?? ''),
          environment: {},
          createdAt: String(srv?.createdAt ?? new Date().toISOString()),
          updatedAt: String(srv?.updatedAt ?? new Date().toISOString()),
        };
      });

      setServers(mapped);
    } catch {
      toast.error('Failed to load your servers.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchServers();
  }, [fetchServers]);

  /* ── Quick Power Action ────────────────────────────────────────── */
  const handlePower = async (
    serverId: string,
    action: 'start' | 'stop' | 'restart',
  ) => {
    setPowerBusyId(serverId);
    try {
      await serverApi.power(serverId, action);
      toast.success(`Sent ${action} signal to container.`);
      await fetchServers();
    } catch {
      toast.error(`Failed to ${action} server.`);
    } finally {
      setPowerBusyId(null);
    }
  };

  const runningCount = servers.filter((s) => s.status === 'running').length;

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Your Instances
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-arc-cyan-400/40 bg-arc-cyan-400/15 px-3 py-1 text-xs font-semibold text-arc-cyan-300 shadow-[0_0_16px_rgba(0,204,255,0.25)]">
              <Sparkles className="h-3.5 w-3.5 text-arc-cyan-400 animate-pulse" />
              Owned By Eclipse Market(Demo Panel)
            </span>
          </div>
          <p className="mt-1 text-sm text-white/50">
            Manage, monitor, and orchestrate your assigned game & application
            containers.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <GlassButton
            variant="ghost"
            size="sm"
            onClick={() => void fetchServers()}
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </GlassButton>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <GlassCard accentColor="cyan" padding="md">
          <p className="text-xs font-medium uppercase tracking-wider text-white/45">
            Total Instances
          </p>
          <p className="mt-1 text-3xl font-bold text-white">{servers.length}</p>
        </GlassCard>

        <GlassCard accentColor="blue" padding="md">
          <p className="text-xs font-medium uppercase tracking-wider text-white/45">
            Active Containers
          </p>
          <p className="mt-1 text-3xl font-bold text-arc-cyan-400">
            {runningCount}
          </p>
        </GlassCard>

        <GlassCard accentColor="violet" padding="md">
          <p className="text-xs font-medium uppercase tracking-wider text-white/45">
            Allocated RAM
          </p>
          <p className="mt-1 text-3xl font-bold text-arc-violet-400">
            {(
              servers.reduce((acc, s) => acc + (s.limits?.ramMB ?? 0), 0) / 1024
            ).toFixed(1)}{' '}
            <span className="text-base font-normal text-white/50">GB</span>
          </p>
        </GlassCard>
      </div>

      {/* Server Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <GlassCard key={n} className="h-56 animate-pulse">
              <div className="h-full w-full" />
            </GlassCard>
          ))}
        </div>
      ) : servers.length === 0 ? (
        <GlassCard
          accentColor="cyan"
          className="flex flex-col items-center justify-center gap-4 py-16 text-center"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-arc-cyan-400/30 bg-arc-cyan-400/10 text-arc-cyan-400 shadow-[0_0_20px_rgba(0,204,255,0.2)]">
            <ServerIcon className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">
              No Active Containers Assigned
            </h3>
            <p className="mt-1 max-w-md text-sm text-white/50">
              There are currently no servers assigned to your account.
              Administrators can provision and assign containers from the
              Administration panel.
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <Link href="/servers/create">
              <GlassButton
                variant="primary"
                size="sm"
                leftIcon={<PlusCircle className="h-4 w-4" />}
              >
                Create Server
              </GlassButton>
            </Link>
            <Link href="/admin">
              <GlassButton
                variant="secondary"
                size="sm"
                leftIcon={<Shield className="h-4 w-4" />}
              >
                Admin Overview
              </GlassButton>
            </Link>
          </div>
        </GlassCard>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: { staggerChildren: 0.07 },
            },
          }}
          className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
        >
          {servers.map((srv) => (
            <GlassCard
              key={srv.id}
              accentColor={srv.status === 'running' ? 'cyan' : 'blue'}
              className="flex flex-col justify-between gap-5"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/servers/${srv.id}`}
                    className="block truncate text-lg font-bold text-white transition hover:text-arc-cyan-400"
                  >
                    {srv.name}
                  </Link>
                  <p className="mt-0.5 truncate font-mono text-xs text-white/45">
                    {srv.eggName} • {srv.node?.name ?? 'local'}
                  </p>
                </div>
                <StatusBadge status={srv.status} size="sm" />
              </div>

              {/* Resource Allocation Strip */}
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-white/45">
                    <MemoryStick className="h-3.5 w-3.5 text-arc-cyan-400" />
                    RAM
                  </span>
                  <span className="font-mono font-semibold text-white">
                    {srv.limits?.ramMB ?? 2048} MB
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-white/45">
                    <Cpu className="h-3.5 w-3.5 text-arc-blue-400" />
                    CPU
                  </span>
                  <span className="font-mono font-semibold text-white">
                    {srv.limits?.cpuPct ?? 100}%
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-white/45">
                    <HardDrive className="h-3.5 w-3.5 text-arc-violet-400" />
                    Disk
                  </span>
                  <span className="font-mono font-semibold text-white">
                    {Math.round((srv.limits?.diskMB ?? 10240) / 1024)} GB
                  </span>
                </div>
              </div>

              {/* Network & Actions Footer */}
              <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                <div className="flex items-center gap-1.5 font-mono text-xs text-white/55">
                  <Network className="h-3.5 w-3.5 text-arc-cyan-400" />
                  <span>
                    {srv.allocation
                      ? `${srv.allocation.ip}:${srv.allocation.port}`
                      : '127.0.0.1:25500'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <GlassButton
                    variant="ghost"
                    size="xs"
                    disabled={powerBusyId === srv.id}
                    onClick={() => void handlePower(srv.id, 'start')}
                    title="Start Server"
                  >
                    <Play className="h-3.5 w-3.5 text-arc-cyan-400" />
                  </GlassButton>

                  <GlassButton
                    variant="ghost"
                    size="xs"
                    disabled={powerBusyId === srv.id}
                    onClick={() => void handlePower(srv.id, 'restart')}
                    title="Restart Server"
                  >
                    <RotateCw className="h-3.5 w-3.5 text-arc-blue-400" />
                  </GlassButton>

                  <GlassButton
                    variant="ghost"
                    size="xs"
                    disabled={powerBusyId === srv.id}
                    onClick={() => void handlePower(srv.id, 'stop')}
                    title="Stop Server"
                  >
                    <Square className="h-3.5 w-3.5 text-arc-orange-400" />
                  </GlassButton>

                  <Link href={`/servers/${srv.id}`}>
                    <GlassButton
                      variant="primary"
                      size="xs"
                      leftIcon={<Terminal className="h-3.5 w-3.5" />}
                    >
                      Manage
                    </GlassButton>
                  </Link>
                </div>
              </div>
            </GlassCard>
          ))}
        </motion.div>
      )}
    </div>
  );
}
