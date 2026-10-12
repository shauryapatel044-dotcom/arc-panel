/* ════════════════════════════════════════════════════════════════
   src/app/(dashboard)/admin/servers/page.tsx
   Admin Server Management — Oversee all user containers,
   enforce hardware limits (RAM/CPU/Disk capping), suspend or destroy
════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Sliders,
  Ban,
  Trash2,
  Terminal,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import GlassInput from '@/components/ui/GlassInput';
import StatusBadge from '@/components/ui/StatusBadge';
import { api, serverApi } from '@/lib/api';
import type { Server } from '@/types';

export default function AdminServersPage() {
  const [servers, setServers] = useState<
    Array<Server & { suspended?: boolean }>
  >([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Hardware Limits & Owner Modal state
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [users, setUsers] = useState<
    Array<{ id: string; username: string; email: string; role: string }>
  >([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [ramLimit, setRamLimit] = useState(2048);
  const [cpuLimit, setCpuLimit] = useState(100);
  const [diskLimit, setDiskLimit] = useState(10240);
  const [savingLimits, setSavingLimits] = useState(false);

  /* ── Load All Platform Servers & Users ────────────────────────── */
  const fetchAllServers = useCallback(async () => {
    setIsLoading(true);
    try {
      const [{ data }, usersRes] = await Promise.all([
        serverApi.listAll({
          search: search.trim() || undefined,
        }),
        api.get('/servers/users').catch(() => ({ data: { users: [] } })),
      ]);
      const list = Array.isArray(data)
        ? data
        : (data.items ?? data.servers ?? []);
      setServers(list);
      if (Array.isArray(usersRes?.data?.users)) {
        setUsers(usersRes.data.users);
      }
    } catch {
      toast.error('Failed to fetch global server list.');
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void fetchAllServers();
  }, [fetchAllServers]);

  /* ── Save Hardware Limits & Owner ─────────────────────────────── */
  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingServer) return;
    setSavingLimits(true);
    try {
      await api.patch(`/admin/servers/${editingServer.id}`, {
        ownerId: selectedOwnerId || undefined,
        memoryLimit: Number(ramLimit),
        cpuLimit: Number(cpuLimit),
        diskLimit: Number(diskLimit),
      });
      toast.success(`Updated owner & hardware limits for ${editingServer.name}`);
      setEditingServer(null);
      await fetchAllServers();
    } catch {
      toast.error('Failed to update server settings.');
    } finally {
      setSavingLimits(false);
    }
  };

  /* ── Toggle Server Suspension ─────────────────────────────────── */
  const handleSuspendServer = async (srvId: string) => {
    try {
      const { data } = await serverApi.suspendServer(srvId);
      toast.success(data.message ?? 'Server suspension toggled.');
      await fetchAllServers();
    } catch {
      toast.error('Failed to toggle server suspension.');
    }
  };

  /* ── Destroy Server ───────────────────────────────────────────── */
  const handleDeleteServer = async (srvId: string) => {
    try {
      await serverApi.deleteServer(srvId);
      toast.success('Container destroyed.');
      await fetchAllServers();
    } catch {
      toast.error('Failed to destroy server.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Global Server Oversight
          </h1>
          <p className="text-sm text-white/50">
            Inspect all user containers across all nodes, adjust CPU/RAM/Disk
            caps, and suspend abusive instances.
          </p>
        </div>

        <Link href="/servers/create">
          <GlassButton variant="primary" size="md">
            + Create New Server
          </GlassButton>
        </Link>
      </div>

      {/* Search Bar */}
      <GlassCard hoverable={false} padding="sm">
        <GlassInput
          placeholder="Filter by server name, owner username, or egg image..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
        />
      </GlassCard>

      {/* Servers Table */}
      <GlassCard hoverable={false} padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-xs uppercase text-white/45">
                <th className="px-5 py-3.5">Server</th>
                <th className="px-4 py-3.5">Owner</th>
                <th className="px-4 py-3.5">Node</th>
                <th className="px-4 py-3.5">Hardware Caps</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center text-white/45"
                  >
                    Loading cluster containers...
                  </td>
                </tr>
              ) : servers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center text-white/45"
                  >
                    No servers deployed yet.
                  </td>
                </tr>
              ) : (
                servers.map((srv) => (
                  <tr key={srv.id} className="hover:bg-white/[0.03]">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/servers/${srv.id}`}
                        className="font-semibold text-white hover:text-arc-cyan-400"
                      >
                        {srv.name}
                      </Link>
                      <p className="font-mono text-xs text-white/45">
                        {srv.eggName ?? srv.dockerImage}
                      </p>
                    </td>

                    <td className="px-4 py-3.5 text-xs text-white/75">
                      {srv.owner?.username ?? 'admin'}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-xs text-arc-cyan-400">
                      {srv.node?.name ?? 'local'}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-xs text-white/70">
                      {srv.limits?.ramMB ?? 2048} MB •{' '}
                      {srv.limits?.cpuPct ?? 100}% CPU •{' '}
                      {Math.round((srv.limits?.diskMB ?? 10240) / 1024)} GB
                    </td>

                    <td className="px-4 py-3.5">
                      <StatusBadge status={srv.status} size="sm" />
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Link href={`/servers/${srv.id}`}>
                          <GlassButton
                            variant="ghost"
                            size="xs"
                            leftIcon={<Terminal className="h-3.5 w-3.5" />}
                          >
                            Console
                          </GlassButton>
                        </Link>
                        <GlassButton
                          variant="primary"
                          size="xs"
                          onClick={() => {
                            setEditingServer(srv);
                            setSelectedOwnerId(srv.ownerId ?? '');
                            setRamLimit(srv.limits?.ramMB ?? 2048);
                            setCpuLimit(srv.limits?.cpuPct ?? 100);
                            setDiskLimit(srv.limits?.diskMB ?? 10240);
                          }}
                          leftIcon={<Sliders className="h-3.5 w-3.5" />}
                        >
                          Owner & Limits
                        </GlassButton>
                        <GlassButton
                          variant="secondary"
                          size="xs"
                          onClick={() => void handleSuspendServer(srv.id)}
                          leftIcon={<Ban className="h-3.5 w-3.5" />}
                        >
                          {srv.suspended ? 'Unsuspend' : 'Suspend'}
                        </GlassButton>
                        <GlassButton
                          variant="danger"
                          size="xs"
                          onClick={() => void handleDeleteServer(srv.id)}
                          leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                        >
                          Destroy
                        </GlassButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Hardware Capping Modal */}
      <AnimatePresence>
        {editingServer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
          >
            <GlassCard
              hoverable={false}
              accentColor="cyan"
              className="w-full max-w-md"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white">
                  Hardware Caps — {editingServer.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingServer(null)}
                  className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                onSubmit={handleSaveLimits}
                className="mt-4 flex flex-col gap-4"
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-white/70">
                    Assigned Server Owner (User)
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

                <GlassInput
                  label="Memory Cap (MB)"
                  type="number"
                  min={128}
                  max={65536}
                  value={ramLimit}
                  onChange={(e) => setRamLimit(Number(e.target.value))}
                  required
                />
                <GlassInput
                  label="CPU Cap (% across cores)"
                  type="number"
                  min={10}
                  max={6400}
                  value={cpuLimit}
                  onChange={(e) => setCpuLimit(Number(e.target.value))}
                  required
                />
                <GlassInput
                  label="Disk Quota (MB)"
                  type="number"
                  min={512}
                  max={1048576}
                  value={diskLimit}
                  onChange={(e) => setDiskLimit(Number(e.target.value))}
                  required
                />

                <div className="flex justify-end gap-2 pt-2">
                  <GlassButton
                    type="button"
                    variant="ghost"
                    onClick={() => setEditingServer(null)}
                  >
                    Cancel
                  </GlassButton>
                  <GlassButton
                    type="submit"
                    variant="primary"
                    isLoading={savingLimits}
                  >
                    Apply Hardware Limits
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
