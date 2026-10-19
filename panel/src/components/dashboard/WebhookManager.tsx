/* ════════════════════════════════════════════════════════════════
   src/components/dashboard/WebhookManager.tsx
   Discord Webhooks & Server Audit Activity Trail
   Features: Discord alert webhooks, test dispatch button,
   live audit history with event badges
════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect } from 'react';
import {
  Bell,
  Plus,
  Trash2,
  Send,
  History,
  ShieldAlert,
  Power,
  RefreshCw,
  Archive,
  Database,
  Users,
  Puzzle,
  Settings,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { webhookApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ServerWebhook, ServerAuditLog } from '@/types';

interface WebhookManagerProps {
  serverId: string;
}

const EVENT_TYPES = [
  { id: 'all', label: 'All Events (Recommended)' },
  { id: 'start', label: 'Server Start & Boot' },
  { id: 'stop', label: 'Server Stop & Shutdown' },
  { id: 'crash', label: 'Crash & Watchdog Auto-Restart' },
  { id: 'backup', label: 'Backup Created & Restored' },
  { id: 'database', label: 'Database Provisioning' },
  { id: 'subuser', label: 'Team & Collaborator Changes' },
];

export default function WebhookManager({ serverId }: WebhookManagerProps) {
  const [webhooks, setWebhooks] = useState<ServerWebhook[]>([]);
  const [auditLogs, setAuditLogs] = useState<ServerAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [webhookName, setWebhookName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['all']);
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [whRes, auditRes] = await Promise.all([
        webhookApi.listWebhooks(serverId),
        webhookApi.getAuditLogs(serverId, 50),
      ]);
      setWebhooks(whRes.data?.webhooks || []);
      setAuditLogs(auditRes.data?.logs || []);
    } catch {
      toast.error('Failed to load webhook & audit data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [serverId]);

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookName.trim() || !webhookUrl.trim()) return;

    if (!webhookUrl.includes('discord.com/api/webhooks') && !webhookUrl.startsWith('http')) {
      toast.error('Please enter a valid Discord webhook URL.');
      return;
    }

    setCreating(true);
    try {
      const { data } = await webhookApi.createWebhook(serverId, {
        name: webhookName.trim(),
        url: webhookUrl.trim(),
        events: selectedEvents,
      });
      toast.success(data?.message || 'Discord webhook configured!');
      setWebhookName('');
      setWebhookUrl('');
      setSelectedEvents(['all']);
      setShowAddModal(false);
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create webhook.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteWebhook = async (whId: string) => {
    if (!confirm('Remove this Discord webhook?')) return;
    try {
      await webhookApi.deleteWebhook(serverId, whId);
      toast.success('Webhook removed.');
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete webhook.');
    }
  };

  const handleTestWebhook = async (whId: string) => {
    setTestingId(whId);
    try {
      const { data } = await webhookApi.testWebhook(serverId, whId);
      toast.success(data?.message || 'Test alert dispatched to Discord!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Test failed. Verify webhook URL.');
    } finally {
      setTestingId(null);
    }
  };

  const getActionBadge = (action: string) => {
    const a = action.toLowerCase();
    if (a.includes('start')) {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">
          <Power className="h-3 w-3" /> START
        </span>
      );
    }
    if (a.includes('stop') || a.includes('kill')) {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-400">
          <Power className="h-3 w-3" /> STOP
        </span>
      );
    }
    if (a.includes('reinstall')) {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-arc-violet-500/30 bg-arc-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-arc-violet-300">
          <RefreshCw className="h-3 w-3" /> REINSTALL
        </span>
      );
    }
    if (a.includes('database')) {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold text-teal-300">
          <Database className="h-3 w-3" /> DATABASE
        </span>
      );
    }
    if (a.includes('plugin') || a.includes('mod')) {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
          <Puzzle className="h-3 w-3" /> PLUGIN
        </span>
      );
    }
    if (a.includes('subuser')) {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
          <Users className="h-3 w-3" /> TEAM
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
        <Settings className="h-3 w-3" /> {action}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header Card */}
      <GlassCard hoverable={false} accentColor="cyan">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-arc-cyan-400/30 bg-arc-cyan-400/10 shadow-[0_0_16px_rgba(0,204,255,0.2)]">
              <Bell className="h-6 w-6 text-arc-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Discord Alerts & Activity Logs</h2>
              <p className="text-xs text-white/60">
                Receive instant Discord webhook alerts for server crashes, power state changes, and
                inspect audit logs.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <GlassButton
              variant="secondary"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </GlassButton>
            <GlassButton
              variant="primary"
              size="sm"
              onClick={() => setShowAddModal(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Discord Webhook
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Webhooks List */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-white">Active Discord Webhooks ({webhooks.length})</h3>

        {webhooks.length === 0 ? (
          <GlassCard className="py-8 text-center text-xs text-white/50">
            No Discord webhooks configured yet. Click &quot;Add Discord Webhook&quot; to receive crash alerts in your Discord server.
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {webhooks.map((wh) => (
              <GlassCard key={wh.id} hoverable={false} className="flex flex-col justify-between p-4">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-arc-cyan-400" />
                      <h4 className="font-semibold text-white">{wh.name}</h4>
                    </div>
                    <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                      Active
                    </span>
                  </div>

                  <p className="mt-2 truncate font-mono text-[11px] text-white/40">{wh.url}</p>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {wh.events.map((e) => (
                      <span
                        key={e}
                        className="rounded border border-white/10 bg-[#080d1a] px-2 py-0.5 text-[10px] text-arc-cyan-300"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                  <GlassButton
                    variant="secondary"
                    size="sm"
                    onClick={() => handleTestWebhook(wh.id)}
                    disabled={testingId === wh.id}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <Send className="h-3 w-3" />
                    {testingId === wh.id ? 'Sending...' : 'Test Webhook'}
                  </GlassButton>
                  <button
                    type="button"
                    onClick={() => handleDeleteWebhook(wh.id)}
                    className="rounded-lg p-1.5 text-white/40 transition hover:bg-red-500/10 hover:text-red-400"
                    title="Delete Webhook"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Audit Activity Log */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-arc-cyan-400" />
          <h3 className="text-sm font-semibold text-white">Recent Audit Activity Trail</h3>
        </div>

        <GlassCard hoverable={false} className="overflow-x-auto p-0">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-[11px] font-semibold text-white/50">
                <th className="py-3 pl-4 pr-3">Action</th>
                <th className="px-3 py-3">Details</th>
                <th className="px-3 py-3">Actor</th>
                <th className="px-3 py-3">IP Address</th>
                <th className="py-3 pl-3 pr-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-white/40">
                    No audit records recorded yet.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="transition hover:bg-white/[0.02]">
                    <td className="py-3 pl-4 pr-3 whitespace-nowrap">
                      {getActionBadge(log.action)}
                    </td>
                    <td className="px-3 py-3 text-white/80 max-w-xs truncate font-sans text-xs">
                      {log.details || '—'}
                    </td>
                    <td className="px-3 py-3 text-arc-cyan-300 whitespace-nowrap">
                      @{log.user?.username || 'system'}
                    </td>
                    <td className="px-3 py-3 text-white/40 whitespace-nowrap">
                      {log.ipAddress || 'local'}
                    </td>
                    <td className="py-3 pl-3 pr-4 text-right text-white/40 whitespace-nowrap font-sans text-[11px]">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </GlassCard>
      </div>

      {/* Add Webhook Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-md">
            <GlassCard hoverable={false} accentColor="cyan" className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Bell className="h-5 w-5 text-arc-cyan-400" />
                  <h3 className="text-base font-bold text-white">Add Discord Webhook</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="text-white/40 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateWebhook} className="mt-5 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    Webhook Name / Label
                  </label>
                  <input
                    type="text"
                    value={webhookName}
                    onChange={(e) => setWebhookName(e.target.value)}
                    placeholder="e.g. #server-alerts"
                    required
                    className="h-10 rounded-xl border border-white/10 bg-[#080d1a] px-3.5 text-sm text-white placeholder-white/30 focus:border-arc-cyan-400 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    Discord Webhook URL
                  </label>
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://discord.com/api/webhooks/..."
                    required
                    className="h-10 rounded-xl border border-white/10 bg-[#080d1a] px-3.5 font-mono text-xs text-white placeholder-white/30 focus:border-arc-cyan-400 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    Subscribed Events
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {EVENT_TYPES.map((ev) => {
                      const isSelected = selectedEvents.includes(ev.id);
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => {
                            if (ev.id === 'all') {
                              setSelectedEvents(['all']);
                            } else {
                              const withoutAll = selectedEvents.filter((x) => x !== 'all');
                              if (withoutAll.includes(ev.id)) {
                                const next = withoutAll.filter((x) => x !== ev.id);
                                setSelectedEvents(next.length === 0 ? ['all'] : next);
                              } else {
                                setSelectedEvents([...withoutAll, ev.id]);
                              }
                            }
                          }}
                          className={cn(
                            'rounded-lg border px-2.5 py-1 text-xs font-medium transition',
                            isSelected
                              ? 'border-arc-cyan-400 bg-arc-cyan-400/20 text-arc-cyan-300'
                              : 'border-white/10 bg-white/5 text-white/60 hover:text-white'
                          )}
                        >
                          {ev.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end gap-2.5">
                  <GlassButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowAddModal(false)}
                  >
                    Cancel
                  </GlassButton>
                  <GlassButton
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={creating || !webhookUrl.trim()}
                  >
                    {creating ? 'Connecting...' : 'Connect Webhook'}
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
