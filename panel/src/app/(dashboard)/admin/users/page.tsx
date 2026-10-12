/* ════════════════════════════════════════════════════════════════
   src/app/(dashboard)/admin/users/page.tsx
   Admin User Management — Search, filter by role, edit, suspend, delete
════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Edit3,
  Ban,
  CheckCircle,
  Trash2,
  Shield,
  X,
  UserPlus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import GlassInput from '@/components/ui/GlassInput';
import { api, userApi } from '@/lib/api';
import type { User, UserRole } from '@/types';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  // Create User Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');
  const [isCreating, setIsCreating] = useState(false);

  // Edit User Modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('user');
  const [isSaving, setIsSaving] = useState(false);

  /* ── Load Users ───────────────────────────────────────────────── */
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await userApi.listUsers({
        search: search.trim() || undefined,
        role: roleFilter === 'ALL' ? undefined : roleFilter,
      });
      const list: User[] = Array.isArray(data)
        ? data
        : (data.items ?? data.users ?? []);
      setUsers(list);
    } catch {
      toast.error('Failed to load platform users.');
    } finally {
      setIsLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  /* ── Create User Submit ───────────────────────────────────────── */
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newEmail.trim() || !newPassword.trim()) return;
    setIsCreating(true);
    try {
      await api.post('/admin/users', {
        username: newUsername.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole.toUpperCase(),
      });
      toast.success(`Created user @${newUsername.trim()}`);
      setShowCreateModal(false);
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('user');
      await fetchUsers();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Failed to create user.';
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  /* ── Edit User Submit ─────────────────────────────────────────── */
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsSaving(true);
    try {
      await userApi.updateUser(editingUser.id, {
        username: editUsername.trim(),
        email: editEmail.trim(),
        role: editRole.toUpperCase(),
      });
      toast.success(`Updated ${editUsername}`);
      setEditingUser(null);
      await fetchUsers();
    } catch {
      toast.error('Failed to update user.');
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Suspend / Unsuspend User ─────────────────────────────────── */
  const handleToggleSuspend = async (u: User) => {
    try {
      if (u.status === 'suspended') {
        await userApi.unsuspendUser(u.id);
        toast.success(`Unsuspended ${u.username}`);
      } else {
        await userApi.suspendUser(u.id);
        toast.success(`Suspended ${u.username}`);
      }
      await fetchUsers();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Action failed.';
      toast.error(msg);
    }
  };

  /* ── Delete User ──────────────────────────────────────────────── */
  const handleDeleteUser = async (u: User) => {
    try {
      await userApi.deleteUser(u.id);
      toast.success(`Deleted ${u.username}`);
      await fetchUsers();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Failed to delete user.';
      toast.error(msg);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-sm text-white/50">
            Create user accounts, manage RBAC privileges, and assign servers.
          </p>
        </div>

        <GlassButton
          variant="primary"
          size="md"
          onClick={() => setShowCreateModal(true)}
          leftIcon={<UserPlus className="h-4 w-4" />}
        >
          + Create User
        </GlassButton>
      </div>

      {/* Search & Filter Bar */}
      <GlassCard
        hoverable={false}
        padding="sm"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="min-w-[260px] flex-1">
          <GlassInput
            placeholder="Search by username or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>

        <div className="flex items-center gap-2">
          {(['ALL', 'ADMIN', 'USER'] as const).map((r) => (
            <GlassButton
              key={r}
              variant={roleFilter === r ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setRoleFilter(r)}
            >
              {r}
            </GlassButton>
          ))}
        </div>
      </GlassCard>

      {/* Users Table */}
      <GlassCard hoverable={false} padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-xs uppercase text-white/45">
                <th className="px-5 py-3.5">User</th>
                <th className="px-4 py-3.5">Role</th>
                <th className="px-4 py-3.5">2FA</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Joined</th>
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
                    Loading platform users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center text-white/45"
                  >
                    No matching users found.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.03]">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-white">{u.username}</p>
                      <p className="text-xs text-white/45">{u.email}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={
                          u.role === 'admin'
                            ? 'inline-flex items-center gap-1 rounded-full border border-arc-violet-400/35 bg-arc-violet-400/15 px-2.5 py-0.5 text-xs font-semibold uppercase text-arc-violet-300'
                            : 'inline-flex items-center gap-1 rounded-full border border-arc-cyan-400/30 bg-arc-cyan-400/10 px-2.5 py-0.5 text-xs font-semibold uppercase text-arc-cyan-400'
                        }
                      >
                        <Shield className="h-3 w-3" /> {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-white/60">
                      {u.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={
                          u.status === 'suspended'
                            ? 'rounded-full border border-arc-orange-400/35 bg-arc-orange-400/12 px-2.5 py-0.5 text-xs font-semibold text-arc-orange-400'
                            : 'rounded-full border border-arc-cyan-400/30 bg-arc-cyan-400/10 px-2.5 py-0.5 text-xs font-semibold text-arc-cyan-400'
                        }
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-white/50">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <GlassButton
                          variant="ghost"
                          size="xs"
                          onClick={() => {
                            setEditingUser(u);
                            setEditUsername(u.username);
                            setEditEmail(u.email);
                            setEditRole(u.role);
                          }}
                          leftIcon={<Edit3 className="h-3.5 w-3.5" />}
                        >
                          Edit
                        </GlassButton>
                        <GlassButton
                          variant="secondary"
                          size="xs"
                          onClick={() => void handleToggleSuspend(u)}
                          leftIcon={
                            u.status === 'suspended' ? (
                              <CheckCircle className="h-3.5 w-3.5" />
                            ) : (
                              <Ban className="h-3.5 w-3.5" />
                            )
                          }
                        >
                          {u.status === 'suspended' ? 'Unsuspend' : 'Suspend'}
                        </GlassButton>
                        <GlassButton
                          variant="danger"
                          size="xs"
                          onClick={() => void handleDeleteUser(u)}
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
        </div>
      </GlassCard>

      {/* Create User Modal */}
      <AnimatePresence>
        {showCreateModal && (
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
                  Create New User Account
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                onSubmit={handleCreateUser}
                className="mt-4 flex flex-col gap-4"
              >
                <GlassInput
                  label="Username"
                  placeholder="e.g. developer"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                />
                <GlassInput
                  label="Email Address"
                  type="email"
                  placeholder="developer@arc.local"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
                <GlassInput
                  label="Initial Password"
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-white/70">
                    Role
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="h-10 w-full rounded-xl border border-white/10 bg-[#080d1a] px-3.5 text-sm text-white/90 focus:border-arc-cyan-400 focus:outline-none"
                  >
                    <option value="user">Standard User</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <GlassButton
                    type="button"
                    variant="ghost"
                    onClick={() => setShowCreateModal(false)}
                  >
                    Cancel
                  </GlassButton>
                  <GlassButton
                    type="submit"
                    variant="primary"
                    isLoading={isCreating}
                  >
                    Create Account
                  </GlassButton>
                </div>
              </form>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit User Modal */}
      <AnimatePresence>
        {editingUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
          >
            <GlassCard
              hoverable={false}
              accentColor="violet"
              className="w-full max-w-md"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white">
                  Edit User — {editingUser.username}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                onSubmit={handleSaveUser}
                className="mt-4 flex flex-col gap-4"
              >
                <GlassInput
                  label="Username"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  required
                />
                <GlassInput
                  label="Email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-white/70">
                    Role
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="h-10 w-full rounded-xl border border-white/10 bg-[#080d1a] px-3.5 text-sm text-white/90 focus:border-arc-cyan-400 focus:outline-none"
                  >
                    <option value="user">Standard User</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <GlassButton
                    type="button"
                    variant="ghost"
                    onClick={() => setEditingUser(null)}
                  >
                    Cancel
                  </GlassButton>
                  <GlassButton
                    type="submit"
                    variant="primary"
                    isLoading={isSaving}
                  >
                    Save Changes
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
