/* ════════════════════════════════════════════════════════════════
   src/components/dashboard/NetworkManager.tsx
   Port & Allocation Manager for Game Servers
   Features: Primary port indicator, secondary ports, custom notes
   (Dynmap, Geyser, Voice), unassign, and quick assign presets
════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect } from 'react';
import {
  Network,
  Plus,
  Trash2,
  Star,
  Copy,
  Check,
  Edit2,
  RefreshCw,
  Server,
  Radio,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { networkApi } from '@/lib/api';
import { cn, copyToClipboard } from '@/lib/utils';
import type { Allocation } from '@/types';
import DomainManager from './DomainManager';

interface NetworkManagerProps {
  serverId: string;
}

const COMMON_PRESETS = [
  { label: 'Geyser Bedrock Bridge', defaultNote: 'Geyser Bedrock' },
  { label: 'Dynmap / BlueMap Web', defaultNote: 'Web Map' },
  { label: 'Simple Voice Chat', defaultNote: 'Voice Chat' },
  { label: 'Votifier Port', defaultNote: 'Votifier' },
  { label: 'Prometheus / Metrics', defaultNote: 'Metrics' },
];

export default function NetworkManager({ serverId }: NetworkManagerProps) {
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [availablePool, setAvailablePool] = useState<Allocation[]>([]);
  const [nodeInfo, setNodeInfo] = useState<{ id: string; name: string; fqdn: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedAllocId, setSelectedAllocId] = useState('');
  const [portNote, setPortNote] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState('');

  const fetchNetwork = async () => {
    setLoading(true);
    try {
      const { data } = await networkApi.list(serverId);
      setAllocations(data?.allocations || []);
      setAvailablePool(data?.availablePool || []);
      setNodeInfo(data?.node || null);
    } catch {
      toast.error('Failed to load server network allocations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchNetwork();
  }, [serverId]);

  const handleCopy = (text: string, key: string) => {
    void copyToClipboard(text);
    setCopiedKey(key);
    toast.success('Connection address copied!');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssigning(true);
    try {
      const { data } = await networkApi.assign(serverId, {
        allocationId: selectedAllocId || undefined,
        notes: portNote.trim() || undefined,
      });
      toast.success(data?.message || 'Port allocated!');
      setSelectedAllocId('');
      setPortNote('');
      setShowAssignModal(false);
      await fetchNetwork();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to allocate port.');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (allocId: string, port: number) => {
    if (!confirm(`Unassign port ${port} and return it to the node pool?`)) return;
    try {
      await networkApi.unassign(serverId, allocId);
      toast.success(`Port ${port} unassigned.`);
      await fetchNetwork();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to unassign port.');
    }
  };

  const handleSetPrimary = async (allocId: string, port: number) => {
    try {
      await networkApi.setPrimary(serverId, allocId);
      toast.success(`Port ${port} is now the primary port.`);
      await fetchNetwork();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to set primary port.');
    }
  };

  const handleSaveNote = async (allocId: string) => {
    try {
      await networkApi.updateNotes(serverId, allocId, editNoteText.trim());
      setEditingNoteId(null);
      toast.success('Port label updated.');
      await fetchNetwork();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update port label.');
    }
  };

  const primaryAlloc = allocations.find((a) => a.isPrimary) || allocations[0];
  const secondaryAllocs = allocations.filter((a) => a.id !== primaryAlloc?.id);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Domains, Connection Endpoint & Tunnel Warning Hub ── */}
      <DomainManager serverId={serverId} />

      {/* Header Card */}
      <GlassCard hoverable={false} accentColor="cyan">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-arc-cyan-400/30 bg-arc-cyan-400/10 shadow-[0_0_16px_rgba(0,204,255,0.2)]">
              <Network className="h-6 w-6 text-arc-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Network & Port Allocations</h2>
              <p className="text-xs text-white/60">
                Manage your primary game server port and allocate additional ports for plugins like
                GeyserMC, Dynmap, and Voice Chat.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <GlassButton
              variant="secondary"
              size="sm"
              onClick={fetchNetwork}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </GlassButton>
            <GlassButton
              variant="primary"
              size="sm"
              onClick={() => {
                setSelectedAllocId('');
                setPortNote('');
                setShowAssignModal(true);
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Assign Port
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Primary Port Highlight Card */}
      {primaryAlloc && (
        <GlassCard hoverable={false} accentColor="cyan" className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-arc-cyan-400/40 bg-arc-cyan-400/15 text-arc-cyan-400 shadow-[0_0_12px_rgba(0,204,255,0.25)]">
                <Radio className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold text-white">
                    {primaryAlloc.ip}:{primaryAlloc.port}
                  </span>
                  <span className="rounded-full border border-arc-cyan-400/40 bg-arc-cyan-400/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-arc-cyan-300 shadow-[0_0_10px_rgba(0,204,255,0.3)]">
                    ★ Primary Port
                  </span>
                </div>
                <span className="text-xs text-white/50">
                  Default connection address for players and clients
                </span>
              </div>
            </div>

            <GlassButton
              variant="primary"
              size="sm"
              onClick={() =>
                handleCopy(`${primaryAlloc.ip}:${primaryAlloc.port}`, `primary-${primaryAlloc.id}`)
              }
              className="gap-2 text-xs"
            >
              {copiedKey === `primary-${primaryAlloc.id}` ? (
                <Check className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              Copy Address
            </GlassButton>
          </div>
        </GlassCard>
      )}

      {/* Secondary Allocations */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-white">
          Secondary Port Allocations ({secondaryAllocs.length})
        </h3>

        {secondaryAllocs.length === 0 ? (
          <GlassCard className="py-8 text-center text-xs text-white/50">
            No secondary ports assigned yet. Assign additional ports for plugins like GeyserMC (19132),
            Dynmap (8123), or Voice Chat (24454).
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {secondaryAllocs.map((alloc) => (
              <GlassCard key={alloc.id} hoverable={false} className="flex flex-col justify-between p-4">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-white">
                      {alloc.ip}:{alloc.port}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(`${alloc.ip}:${alloc.port}`, `copy-${alloc.id}`)}
                      className="text-white/40 hover:text-white"
                      title="Copy Address"
                    >
                      {copiedKey === `copy-${alloc.id}` ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Label / Note */}
                  <div className="mt-3">
                    {editingNoteId === alloc.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editNoteText}
                          onChange={(e) => setEditNoteText(e.target.value)}
                          placeholder="e.g. GeyserMC"
                          maxLength={32}
                          className="h-7 w-full rounded-lg border border-white/20 bg-[#080d1a] px-2 text-xs text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveNote(alloc.id)}
                          className="rounded-lg bg-arc-cyan-400/20 px-2 py-1 text-[11px] font-semibold text-arc-cyan-300"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => {
                          setEditingNoteId(alloc.id);
                          setEditNoteText(alloc.notes || '');
                        }}
                        className="flex cursor-pointer items-center justify-between rounded-lg border border-white/5 bg-[#080d1a] px-2.5 py-1.5 text-xs text-white/70 hover:border-white/15"
                      >
                        <span className="truncate">{alloc.notes || 'Click to add note...'}</span>
                        <Edit2 className="h-3 w-3 text-white/30" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(alloc.id, alloc.port)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-white/50 transition hover:text-arc-cyan-400"
                  >
                    <Star className="h-3 w-3" /> Make Primary
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUnassign(alloc.id, alloc.port)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-white/40 transition hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" /> Unassign
                  </button>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Assign Port Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-md">
            <GlassCard hoverable={false} accentColor="cyan" className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Network className="h-5 w-5 text-arc-cyan-400" />
                  <h3 className="text-base font-bold text-white">Assign Additional Port</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="text-white/40 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleAssign} className="mt-5 flex flex-col gap-4">
                {/* Quick Presets */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    Quick Preset Note
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {COMMON_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setPortNote(preset.defaultNote)}
                        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 transition hover:bg-white/10 hover:text-white"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    Port Label / Purpose
                  </label>
                  <input
                    type="text"
                    value={portNote}
                    onChange={(e) => setPortNote(e.target.value)}
                    placeholder="e.g. Geyser Bedrock Bridge"
                    maxLength={32}
                    className="h-10 rounded-xl border border-white/10 bg-[#080d1a] px-3.5 text-sm text-white placeholder-white/30 focus:border-arc-cyan-400 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    Select Port from Node Pool
                  </label>
                  {availablePool.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-[#080d1a] p-3 text-xs text-white/50">
                      Auto-allocating next free port on {nodeInfo?.name || 'local node'}...
                    </div>
                  ) : (
                    <select
                      value={selectedAllocId}
                      onChange={(e) => setSelectedAllocId(e.target.value)}
                      className="h-10 rounded-xl border border-white/10 bg-[#080d1a] px-3 font-mono text-sm text-white focus:border-arc-cyan-400 focus:outline-none"
                    >
                      <option value="">Auto-pick first available port</option>
                      {availablePool.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.ip}:{a.port} (Available)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-end gap-2.5">
                  <GlassButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowAssignModal(false)}
                  >
                    Cancel
                  </GlassButton>
                  <GlassButton
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={assigning}
                  >
                    {assigning ? 'Allocating...' : 'Allocate Port'}
                  </GlassButton>
                </div>
              </form>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
}
