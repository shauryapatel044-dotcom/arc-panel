/* ════════════════════════════════════════════════════════════════
   src/components/dashboard/DatabaseManager.tsx
   On-Demand MariaDB / MySQL Database Provisioning
   Features: 1-click create, connection strings (JDBC / CLI),
   reveal password, rotate password, and drop database
════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect } from 'react';
import {
  Database,
  Plus,
  Trash2,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Server,
  Lock,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import GlassInput from '@/components/ui/GlassInput';
import { databaseApi } from '@/lib/api';
import { cn, copyToClipboard } from '@/lib/utils';
import type { ServerDatabase } from '@/types';

interface DatabaseManagerProps {
  serverId: string;
}

export default function DatabaseManager({ serverId }: DatabaseManagerProps) {
  const [databases, setDatabases] = useState<ServerDatabase[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDbName, setNewDbName] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  const fetchDatabases = async () => {
    setLoading(true);
    try {
      const { data } = await databaseApi.list(serverId);
      setDatabases(data?.databases || []);
    } catch {
      toast.error('Failed to load server databases.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDatabases();
  }, [serverId]);

  const handleCopy = (text: string, key: string) => {
    void copyToClipboard(text);
    setCopiedKey(key);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDbName.trim()) return;

    setCreating(true);
    try {
      const { data } = await databaseApi.create(serverId, newDbName.trim());
      toast.success(data?.message || 'Database provisioned!');
      setNewDbName('');
      setShowCreateModal(false);
      await fetchDatabases();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create database.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (dbId: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete database '${name}'? All data will be erased.`)) {
      return;
    }
    try {
      await databaseApi.delete(serverId, dbId);
      toast.success('Database deleted.');
      await fetchDatabases();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete database.');
    }
  };

  const handleRotatePassword = async (dbId: string) => {
    if (!confirm('Rotate password for this database? Plugins using the old password will need updating.')) {
      return;
    }
    try {
      const { data } = await databaseApi.rotatePassword(serverId, dbId);
      toast.success('Password rotated successfully.');
      await fetchDatabases();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to rotate password.');
    }
  };

  const togglePasswordReveal = (id: string) => {
    setRevealedPasswords((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header Card */}
      <GlassCard hoverable={false} accentColor="cyan">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-arc-cyan-400/30 bg-arc-cyan-400/10 shadow-[0_0_16px_rgba(0,204,255,0.2)]">
              <Database className="h-6 w-6 text-arc-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Server Databases</h2>
              <p className="text-xs text-white/60">
                Provision isolated MariaDB / MySQL databases for plugins like LuckPerms, CoreProtect,
                or custom applications.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <GlassButton
              variant="secondary"
              size="sm"
              onClick={fetchDatabases}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </GlassButton>
            <GlassButton
              variant="primary"
              size="sm"
              onClick={() => setShowCreateModal(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New Database
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Databases List */}
      {loading ? (
        <GlassCard className="py-12 text-center text-sm text-white/50">
          Loading databases...
        </GlassCard>
      ) : databases.length === 0 ? (
        <GlassCard className="py-12 text-center">
          <Database className="mx-auto h-10 w-10 text-white/30" />
          <h3 className="mt-3 text-base font-semibold text-white">No Databases Provisioned</h3>
          <p className="mt-1 text-xs text-white/50">
            Create your first database to store persistent plugin or application data.
          </p>
          <div className="mt-4">
            <GlassButton
              variant="primary"
              size="sm"
              onClick={() => setShowCreateModal(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Database
            </GlassButton>
          </div>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {databases.map((db) => {
            const isRevealed = revealedPasswords[db.id];
            return (
              <GlassCard key={db.id} hoverable={false} className="flex flex-col justify-between p-5">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Database className="h-5 w-5 text-arc-cyan-400" />
                      <h3 className="text-base font-bold text-white">
                        {db.fullDbName || db.name}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(db.id, db.name)}
                      className="rounded-lg p-1.5 text-white/40 transition hover:bg-red-500/10 hover:text-red-400"
                      title="Delete Database"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Details Grid */}
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-white/10 bg-[#080d1a] p-3">
                      <span className="text-[10px] text-white/40 uppercase tracking-wider">Host</span>
                      <div className="mt-1 flex items-center justify-between font-mono font-semibold text-white">
                        <span>{db.host}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(db.host, `host-${db.id}`)}
                          className="text-white/40 hover:text-white"
                        >
                          {copiedKey === `host-${db.id}` ? (
                            <Check className="h-3 w-3 text-green-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-[#080d1a] p-3">
                      <span className="text-[10px] text-white/40 uppercase tracking-wider">Port</span>
                      <div className="mt-1 font-mono font-semibold text-white">
                        {db.port || 3306}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-[#080d1a] p-3">
                      <span className="text-[10px] text-white/40 uppercase tracking-wider">Username</span>
                      <div className="mt-1 flex items-center justify-between font-mono font-semibold text-white">
                        <span className="truncate">{db.username}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(db.username, `user-${db.id}`)}
                          className="text-white/40 hover:text-white"
                        >
                          {copiedKey === `user-${db.id}` ? (
                            <Check className="h-3 w-3 text-green-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-[#080d1a] p-3">
                      <span className="text-[10px] text-white/40 uppercase tracking-wider">Password</span>
                      <div className="mt-1 flex items-center justify-between font-mono font-semibold text-white">
                        <span className="truncate">
                          {isRevealed ? db.password : '••••••••••••••••'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => togglePasswordReveal(db.id)}
                            className="text-white/40 hover:text-white"
                          >
                            {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopy(db.password, `pwd-${db.id}`)}
                            className="text-white/40 hover:text-white"
                          >
                            {copiedKey === `pwd-${db.id}` ? (
                              <Check className="h-3 w-3 text-green-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Connection Strings & Actions */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(db.jdbcUrl || '', `jdbc-${db.id}`)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-arc-cyan-300 hover:bg-white/10"
                    >
                      {copiedKey === `jdbc-${db.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      Copy JDBC URL
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          `mysql -u ${db.username} -p${db.password} -h ${db.host} -P ${db.port} ${db.fullDbName || db.name}`,
                          `cli-${db.id}`
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70 hover:bg-white/10"
                    >
                      {copiedKey === `cli-${db.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      Copy CLI
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRotatePassword(db.id)}
                    className="inline-flex items-center gap-1 text-[11px] text-white/40 hover:text-arc-cyan-400"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Rotate Password
                  </button>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* New Database Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-md">
            <GlassCard hoverable={false} accentColor="cyan" className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Database className="h-5 w-5 text-arc-cyan-400" />
                  <h3 className="text-base font-bold text-white">Create New Database</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-white/40 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    Database Name Suffix
                  </label>
                  <input
                    type="text"
                    value={newDbName}
                    onChange={(e) =>
                      setNewDbName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                    }
                    placeholder="e.g. luckperms or coreprotect"
                    maxLength={16}
                    required
                    className="h-10 rounded-xl border border-white/10 bg-[#080d1a] px-3.5 text-sm font-mono text-white placeholder-white/30 focus:border-arc-cyan-400 focus:outline-none"
                  />
                  <span className="text-[11px] text-white/45">
                    Lowercase letters, numbers, and underscores only. Max 16 chars.
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-end gap-2.5">
                  <GlassButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowCreateModal(false)}
                  >
                    Cancel
                  </GlassButton>
                  <GlassButton
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={creating || !newDbName.trim()}
                  >
                    {creating ? 'Provisioning...' : 'Provision Database'}
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
