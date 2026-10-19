/* ════════════════════════════════════════════════════════════════
   src/components/dashboard/SubuserManager.tsx
   Team & Sub-user Collaborator Management
   Features: Invite members with granular permissions, edit access,
   and revoke collaborator access
════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Trash2,
  Edit2,
  ShieldCheck,
  CheckCircle2,
  Terminal,
  FolderOpen,
  Archive,
  Database,
  Settings,
  Power,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { subuserApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ServerSubuser } from '@/types';

interface SubuserManagerProps {
  serverId: string;
}

const AVAILABLE_PERMISSIONS: Array<{
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'power.*',
    name: 'Power Control',
    description: 'Start, stop, restart, and kill the server container',
    icon: Power,
  },
  {
    id: 'console.*',
    name: 'Console Access',
    description: 'View real-time console stream and send commands',
    icon: Terminal,
  },
  {
    id: 'files.*',
    name: 'File Manager',
    description: 'Read, write, edit, upload, and extract server files',
    icon: FolderOpen,
  },
  {
    id: 'backups.*',
    name: 'Backup Manager',
    description: 'Create, restore, download, and delete server backups',
    icon: Archive,
  },
  {
    id: 'databases.*',
    name: 'Database Manager',
    description: 'Create, drop, and view database passwords',
    icon: Database,
  },
  {
    id: 'settings.manage',
    name: 'Server Settings',
    description: 'Rename server and edit startup parameters',
    icon: Settings,
  },
];

export default function SubuserManager({ serverId }: SubuserManagerProps) {
  const [subusers, setSubusers] = useState<ServerSubuser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([
    'power.*',
    'console.*',
    'files.*',
  ]);
  const [inviting, setInviting] = useState(false);

  const [editingSubuser, setEditingSubuser] = useState<ServerSubuser | null>(null);

  const fetchSubusers = async () => {
    setLoading(true);
    try {
      const { data } = await subuserApi.list(serverId);
      setSubusers(data?.subusers || []);
    } catch {
      toast.error('Failed to load server collaborators.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSubusers();
  }, [serverId]);

  const togglePermission = (permId: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]
    );
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOrUsername.trim()) return;

    setInviting(true);
    try {
      const { data } = await subuserApi.add(serverId, {
        emailOrUsername: emailOrUsername.trim(),
        permissions: selectedPermissions,
      });
      toast.success(data?.message || 'Collaborator invited!');
      setEmailOrUsername('');
      setSelectedPermissions(['power.*', 'console.*', 'files.*']);
      setShowInviteModal(false);
      await fetchSubusers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add collaborator.');
    } finally {
      setInviting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubuser) return;

    try {
      await subuserApi.update(serverId, editingSubuser.id, selectedPermissions);
      toast.success('Permissions updated successfully.');
      setEditingSubuser(null);
      await fetchSubusers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update permissions.');
    }
  };

  const handleRemove = async (subId: string, username: string) => {
    if (!confirm(`Revoke access for @${username}?`)) return;

    try {
      await subuserApi.remove(serverId, subId);
      toast.success('Collaborator removed.');
      await fetchSubusers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to remove collaborator.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header Card */}
      <GlassCard hoverable={false} accentColor="cyan">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-arc-cyan-400/30 bg-arc-cyan-400/10 shadow-[0_0_16px_rgba(0,204,255,0.2)]">
              <Users className="h-6 w-6 text-arc-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Server Collaborators</h2>
              <p className="text-xs text-white/60">
                Grant team members granular access to your console, file manager, backups, or power controls.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <GlassButton
              variant="secondary"
              size="sm"
              onClick={fetchSubusers}
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
                setSelectedPermissions(['power.*', 'console.*', 'files.*']);
                setShowInviteModal(true);
              }}
              className="gap-2"
            >
              <UserPlus className="h-4 w-4" />
              Invite Member
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Collaborator List */}
      {loading ? (
        <GlassCard className="py-12 text-center text-sm text-white/50">
          Loading collaborators...
        </GlassCard>
      ) : subusers.length === 0 ? (
        <GlassCard className="py-12 text-center">
          <Users className="mx-auto h-10 w-10 text-white/30" />
          <h3 className="mt-3 text-base font-semibold text-white">No Collaborators Added</h3>
          <p className="mt-1 text-xs text-white/50">
            Invite co-owners or staff members by email or username to help manage this server.
          </p>
          <div className="mt-4">
            <GlassButton
              variant="primary"
              size="sm"
              onClick={() => {
                setSelectedPermissions(['power.*', 'console.*', 'files.*']);
                setShowInviteModal(true);
              }}
              className="gap-2"
            >
              <UserPlus className="h-4 w-4" />
              Invite Member
            </GlassButton>
          </div>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3.5">
          {subusers.map((sub) => (
            <GlassCard key={sub.id} hoverable={false} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 font-bold text-white">
                  {sub.user.username.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">@{sub.user.username}</span>
                    <span className="rounded-full border border-arc-cyan-400/30 bg-arc-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold text-arc-cyan-300">
                      Collaborator
                    </span>
                  </div>
                  <span className="text-xs text-white/45">{sub.user.email}</span>
                </div>
              </div>

              {/* Badges of Permissions */}
              <div className="flex flex-wrap items-center gap-1.5">
                {sub.permissions.map((p) => {
                  const match = AVAILABLE_PERMISSIONS.find((perm) => perm.id === p);
                  return (
                    <span
                      key={p}
                      className="rounded-md border border-white/10 bg-[#080d1a] px-2 py-1 text-[11px] text-white/80"
                    >
                      {match?.name || p}
                    </span>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingSubuser(sub);
                    setSelectedPermissions(sub.permissions);
                  }}
                  className="rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
                  title="Edit Permissions"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(sub.id, sub.user.username)}
                  className="rounded-lg p-2 text-white/40 transition hover:bg-red-500/10 hover:text-red-400"
                  title="Revoke Access"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Invite Modal / Edit Modal */}
      {(showInviteModal || editingSubuser) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg">
            <GlassCard hoverable={false} accentColor="cyan" className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <UserPlus className="h-5 w-5 text-arc-cyan-400" />
                  <h3 className="text-base font-bold text-white">
                    {editingSubuser
                      ? `Edit Permissions for @${editingSubuser.user.username}`
                      : 'Invite Collaborator'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteModal(false);
                    setEditingSubuser(null);
                  }}
                  className="text-white/40 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={editingSubuser ? handleUpdate : handleInvite} className="mt-5 flex flex-col gap-4">
                {!editingSubuser && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                      User Email or Username
                    </label>
                    <input
                      type="text"
                      value={emailOrUsername}
                      onChange={(e) => setEmailOrUsername(e.target.value)}
                      placeholder="e.g. alex or alex@example.com"
                      required
                      className="h-10 rounded-xl border border-white/10 bg-[#080d1a] px-3.5 text-sm text-white placeholder-white/30 focus:border-arc-cyan-400 focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                      Access Permissions
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedPermissions(AVAILABLE_PERMISSIONS.map((p) => p.id))}
                        className="text-[11px] text-arc-cyan-400 hover:underline"
                      >
                        Grant All
                      </button>
                      <span className="text-white/30">•</span>
                      <button
                        type="button"
                        onClick={() => setSelectedPermissions(['console.*', 'files.*'])}
                        className="text-[11px] text-white/50 hover:underline"
                      >
                        View Only
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {AVAILABLE_PERMISSIONS.map((perm) => {
                      const Icon = perm.icon;
                      const isChecked = selectedPermissions.includes(perm.id);
                      return (
                        <div
                          key={perm.id}
                          onClick={() => togglePermission(perm.id)}
                          className={cn(
                            'flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition',
                            isChecked
                              ? 'border-arc-cyan-400/40 bg-arc-cyan-400/10 text-white'
                              : 'border-white/10 bg-[#080d1a] text-white/60 hover:border-white/20'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by parent div
                            className="mt-0.5 accent-arc-cyan-400"
                          />
                          <div>
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                              <Icon className="h-3.5 w-3.5 text-arc-cyan-400" />
                              {perm.name}
                            </div>
                            <p className="mt-0.5 text-[11px] leading-tight text-white/45">
                              {perm.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end gap-2.5">
                  <GlassButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowInviteModal(false);
                      setEditingSubuser(null);
                    }}
                  >
                    Cancel
                  </GlassButton>
                  <GlassButton
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={inviting || selectedPermissions.length === 0}
                  >
                    {inviting
                      ? 'Saving...'
                      : editingSubuser
                      ? 'Update Permissions'
                      : 'Grant Access'}
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
