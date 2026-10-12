/* ════════════════════════════════════════════════════════════════
   src/components/dashboard/FileManager.tsx
   Web-based glassmorphic file manager for container volumes
   Supports browse, upload, download, edit, rename, extract, delete
════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  FileText,
  FileArchive,
  Upload,
  Download,
  Trash2,
  Edit3,
  FolderUp,
  RefreshCw,
  FilePlus,
  Save,
  X,
  PackageOpen,
  ChevronRight,
  Home,
  Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import GlassInput from '@/components/ui/GlassInput';
import { api, fileApi } from '@/lib/api';
import { formatBytes, cn } from '@/lib/utils';
import type { FileEntry } from '@/types';

interface FileManagerProps {
  serverId: string;
}

export default function FileManager({ serverId }: FileManagerProps) {
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Code Editor Modal state
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState<string>('');
  const [isSavingFile, setIsSavingFile] = useState<boolean>(false);

  // Rename Modal state
  const [renamingEntry, setRenamingEntry] = useState<FileEntry | null>(null);
  const [newName, setNewName] = useState<string>('');

  // New File Modal state
  const [showNewFileModal, setShowNewFileModal] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* ── Normalize raw file list from backend ─────────────────────── */
  const normalizeEntries = useCallback(
    (rawList: Array<Record<string, unknown>>, targetPath: string): FileEntry[] => {
      const normalized: FileEntry[] = rawList.map((item) => {
        const name = String(item.name ?? 'unknown');
        const isDir = Boolean(item.isDirectory) || item.type === 'directory';
        return {
          name,
          path:
            targetPath === '/'
              ? `/${name}`
              : `${targetPath.replace(/\/$/, '')}/${name}`,
          type: isDir ? 'directory' : 'file',
          sizeBytes: Number(item.sizeBytes ?? item.size ?? 0),
          modifiedAt: String(item.modifiedAt ?? new Date().toISOString()),
          permissions: String(
            item.permissions ?? (isDir ? 'drwxr-xr-x' : '-rw-r--r--'),
          ),
        };
      });

      normalized.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return normalized;
    },
    [],
  );

  /* ── Load Directory Contents ──────────────────────────────────── */
  const fetchFiles = useCallback(
    async (targetPath = currentPath) => {
      setIsLoading(true);
      try {
        const { data } = await api.get(`/servers/${serverId}/files`, {
          params: { path: targetPath, _t: Date.now() },
        });
        const rawList: Array<Record<string, unknown>> = Array.isArray(data)
          ? data
          : (data.files ?? data.items ?? []);

        setFiles(normalizeEntries(rawList, targetPath));
      } catch {
        toast.error('Unable to load directory contents.');
      } finally {
        setIsLoading(false);
      }
    },
    [serverId, currentPath, normalizeEntries],
  );

  useEffect(() => {
    void fetchFiles(currentPath);
  }, [currentPath, fetchFiles]);

  /* ── Navigation helpers ───────────────────────────────────────── */
  const navigateTo = (dirPath: string) => {
    setCurrentPath(dirPath.startsWith('/') ? dirPath : `/${dirPath}`);
  };

  const navigateUp = () => {
    if (currentPath === '/') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.length === 0 ? '/' : `/${parts.join('/')}`);
  };

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  /* ── File Upload ──────────────────────────────────────────────── */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    const formData = new FormData();
    Array.from(selected).forEach((file) => formData.append('files', file));

    setIsUploading(true);
    try {
      const { data } = await fileApi.upload(serverId, currentPath, formData);
      toast.success(`Uploaded ${selected.length} file(s)`);
      if (Array.isArray(data?.files)) {
        setFiles(normalizeEntries(data.files, currentPath));
      } else {
        await fetchFiles(currentPath);
      }
    } catch {
      toast.error('File upload failed.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /* ── Open File in Glass Editor ────────────────────────────────── */
  const handleOpenEditor = async (entry: FileEntry) => {
    if (entry.name.trim().toLowerCase() === 'server.jar') {
      toast('server.jar is a protected core binary. Change versions via Settings → Reinstall Server.', {
        icon: '🔒',
      });
      return;
    }
    try {
      const { data } = await api.get(`/servers/${serverId}/files/content`, {
        params: { path: entry.path, _t: Date.now() },
      });
      setEditingFile(entry.path);
      setEditorContent(
        typeof data === 'string' ? data : String(data.content ?? ''),
      );
    } catch {
      toast.error('Could not read file content.');
    }
  };

  const handleSaveEditor = async () => {
    if (!editingFile) return;
    setIsSavingFile(true);
    try {
      const { data } = await api.put(`/servers/${serverId}/files/content`, {
        path: editingFile,
        content: editorContent,
      });
      toast.success('File saved successfully.');
      setEditingFile(null);
      if (Array.isArray(data?.files)) {
        setFiles(normalizeEntries(data.files, currentPath));
      } else {
        await fetchFiles(currentPath);
      }
    } catch {
      toast.error('Failed to save file changes.');
    } finally {
      setIsSavingFile(false);
    }
  };

  /* ── Create New File ──────────────────────────────────────────── */
  const handleCreateNewFile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedName = newFileName.trim().replace(/^[/\\]+/, '');
    if (!cleanedName) return;
    const fullPath =
      currentPath === '/'
        ? `/${cleanedName}`
        : `${currentPath.replace(/\/$/, '')}/${cleanedName}`;
    try {
      const { data } = await api.put(`/servers/${serverId}/files/content`, {
        path: fullPath,
        content: '',
      });
      toast.success(`Created ${cleanedName}`);
      setNewFileName('');
      setShowNewFileModal(false);
      if (Array.isArray(data?.files)) {
        setFiles(normalizeEntries(data.files, currentPath));
      } else {
        await fetchFiles(currentPath);
      }
    } catch {
      toast.error('Failed to create file.');
    }
  };

  /* ── Rename File / Directory ──────────────────────────────────── */
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingEntry || !newName.trim()) return;
    if (renamingEntry.name.trim().toLowerCase() === 'server.jar') {
      toast.error('server.jar is protected and cannot be renamed.');
      setRenamingEntry(null);
      return;
    }
    const parentDir =
      currentPath === '/' ? '' : currentPath.replace(/\/$/, '');
    const targetPath = `${parentDir}/${newName.trim()}`;

    try {
      await api.patch(`/servers/${serverId}/files/rename`, {
        from: renamingEntry.path,
        to: targetPath,
      });
      toast.success('Renamed successfully.');
      setRenamingEntry(null);
      await fetchFiles(currentPath);
    } catch {
      toast.error('Failed to rename item.');
    }
  };

  /* ── Extract Archive (.zip / .tar.gz) ─────────────────────────── */
  const handleExtract = async (entry: FileEntry) => {
    try {
      await api.post(`/servers/${serverId}/files/decompress`, {
        file: entry.path,
        destination: currentPath,
      });
      toast.success(`Extracted ${entry.name}`);
      await fetchFiles(currentPath);
    } catch {
      toast.error('Failed to extract archive.');
    }
  };

  /* ── Delete File / Folder ─────────────────────────────────────── */
  const handleDelete = async (entry: FileEntry) => {
    if (entry.name.trim().toLowerCase() === 'server.jar') {
      toast.error('server.jar is protected and cannot be deleted. Reinstall the server to switch versions.');
      return;
    }
    try {
      await api.delete(`/servers/${serverId}/files`, {
        data: { files: [entry.path] },
      });
      toast.success(`Deleted ${entry.name}`);
      await fetchFiles(currentPath);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to delete item.';
      toast.error(msg);
    }
  };

  const isArchive = (name: string) =>
    /\.(zip|tar|gz|tgz)$/i.test(name);

  const isProtectedCoreFile = (name: string) =>
    name.trim().toLowerCase() === 'server.jar';

  return (
    <div className="flex flex-col gap-4">
      {/* Top Toolbar + Breadcrumbs */}
      <GlassCard
        hoverable={false}
        padding="sm"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        {/* Breadcrumb Path */}
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-white/70 transition hover:bg-white/10 hover:text-arc-cyan-400"
          >
            <Home className="h-4 w-4 text-arc-cyan-400" />
            <span className="font-mono text-xs">/home/container</span>
          </button>

          {breadcrumbs.map((segment, index) => {
            const pathUpTo = `/${breadcrumbs.slice(0, index + 1).join('/')}`;
            return (
              <div key={pathUpTo} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-white/30" />
                <button
                  type="button"
                  onClick={() => navigateTo(pathUpTo)}
                  className="rounded-lg px-2 py-1 font-mono text-xs text-white/85 transition hover:bg-white/10 hover:text-arc-cyan-400"
                >
                  {segment}
                </button>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {currentPath !== '/' && (
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={navigateUp}
              leftIcon={<FolderUp className="h-4 w-4" />}
            >
              Up
            </GlassButton>
          )}

          <GlassButton
            variant="ghost"
            size="sm"
            onClick={() => void fetchFiles(currentPath)}
            leftIcon={
              <RefreshCw
                className={cn('h-4 w-4', isLoading && 'animate-spin')}
              />
            }
          >
            Refresh
          </GlassButton>

          <GlassButton
            variant="secondary"
            size="sm"
            onClick={() => setShowNewFileModal(true)}
            leftIcon={<FilePlus className="h-4 w-4" />}
          >
            New File
          </GlassButton>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
          <GlassButton
            variant="primary"
            size="sm"
            isLoading={isUploading}
            onClick={() => fileInputRef.current?.click()}
            leftIcon={<Upload className="h-4 w-4" />}
          >
            Upload
          </GlassButton>
        </div>
      </GlassCard>

      {/* File Table */}
      <GlassCard hoverable={false} padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.02] text-xs uppercase tracking-wider text-white/45">
                <th className="px-5 py-3.5">Name</th>
                <th className="px-4 py-3.5">Size</th>
                <th className="px-4 py-3.5">Permissions</th>
                <th className="px-4 py-3.5">Last Modified</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-12 text-center text-sm text-white/45"
                  >
                    Loading container files...
                  </td>
                </tr>
              ) : files.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-12 text-center text-sm text-white/45"
                  >
                    This directory is empty. Upload or create a file to begin.
                  </td>
                </tr>
              ) : (
                files.map((entry) => {
                  const protectedCore = isProtectedCoreFile(entry.name);
                  return (
                    <tr
                      key={entry.path}
                      className="transition-colors hover:bg-white/[0.04]"
                    >
                      {/* Name */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              entry.type === 'directory'
                                ? navigateTo(entry.path)
                                : void handleOpenEditor(entry)
                            }
                            className="flex items-center gap-3 font-medium text-white/90 hover:text-arc-cyan-400"
                          >
                            {entry.type === 'directory' ? (
                              <Folder className="h-4 w-4 shrink-0 text-arc-cyan-400" />
                            ) : protectedCore ? (
                              <Lock className="h-4 w-4 shrink-0 text-arc-cyan-400" />
                            ) : isArchive(entry.name) ? (
                              <FileArchive className="h-4 w-4 shrink-0 text-arc-violet-400" />
                            ) : (
                              <FileText className="h-4 w-4 shrink-0 text-arc-blue-400" />
                            )}
                            <span className="truncate">{entry.name}</span>
                          </button>
                          {protectedCore && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-arc-cyan-400/30 bg-arc-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-arc-cyan-300">
                              <Lock className="h-2.5 w-2.5" />
                              Protected Core
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Size */}
                      <td className="px-4 py-3 font-mono text-xs text-white/55">
                        {entry.type === 'directory'
                          ? '—'
                          : formatBytes(entry.sizeBytes)}
                      </td>

                      {/* Permissions */}
                      <td className="px-4 py-3 font-mono text-xs text-white/45">
                        {protectedCore ? '-r--r--r--' : entry.permissions}
                      </td>

                      {/* Modified */}
                      <td className="px-4 py-3 text-xs text-white/50">
                        {new Date(entry.modifiedAt).toLocaleString()}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {entry.type === 'file' && !protectedCore && (
                            <GlassButton
                              variant="ghost"
                              size="xs"
                              onClick={() => void handleOpenEditor(entry)}
                              title="Edit file"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </GlassButton>
                          )}

                          {entry.type === 'file' && isArchive(entry.name) && (
                            <GlassButton
                              variant="secondary"
                              size="xs"
                              onClick={() => void handleExtract(entry)}
                              title="Extract archive"
                            >
                              <PackageOpen className="h-3.5 w-3.5" />
                            </GlassButton>
                          )}

                          {entry.type === 'file' && (
                            <a
                              href={fileApi.download(serverId, entry.path)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-7 items-center justify-center rounded-lg border border-white/10 px-2 text-white/60 transition hover:bg-white/10 hover:text-white"
                              title="Download file"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          )}

                          {protectedCore ? (
                            <span
                              className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[11px] font-medium text-white/45"
                              title="server.jar cannot be deleted or renamed. Reinstall the server in Settings to change versions."
                            >
                              <Lock className="h-3 w-3 text-arc-cyan-400" />
                              Locked
                            </span>
                          ) : (
                            <>
                              <GlassButton
                                variant="ghost"
                                size="xs"
                                onClick={() => {
                                  setRenamingEntry(entry);
                                  setNewName(entry.name);
                                }}
                                title="Rename"
                              >
                                Rename
                              </GlassButton>

                              <GlassButton
                                variant="danger"
                                size="xs"
                                onClick={() => void handleDelete(entry)}
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </GlassButton>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* ── File Editor Modal ──────────────────────────────────────── */}
      <AnimatePresence>
        {editingFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          >
            <GlassCard
              hoverable={false}
              accentColor="cyan"
              className="flex w-full max-w-4xl flex-col gap-4"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Editing File
                  </h3>
                  <p className="font-mono text-xs text-arc-cyan-400">
                    {editingFile}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingFile(null)}
                  className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                rows={18}
                spellCheck={false}
                className="w-full rounded-xl border border-white/10 bg-[#050811]/90 p-4 font-mono text-xs leading-relaxed text-white/90 focus:border-arc-cyan-400/60 focus:outline-none"
              />

              <div className="flex justify-end gap-2">
                <GlassButton
                  variant="ghost"
                  onClick={() => setEditingFile(null)}
                >
                  Cancel
                </GlassButton>
                <GlassButton
                  variant="primary"
                  isLoading={isSavingFile}
                  onClick={() => void handleSaveEditor()}
                  leftIcon={<Save className="h-4 w-4" />}
                >
                  Save File
                </GlassButton>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Rename Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {renamingEntry && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          >
            <GlassCard
              hoverable={false}
              accentColor="violet"
              className="w-full max-w-md"
            >
              <form onSubmit={handleRenameSubmit} className="flex flex-col gap-4">
                <h3 className="text-base font-semibold text-white">
                  Rename {renamingEntry.name}
                </h3>
                <GlassInput
                  label="New Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
                <div className="flex justify-end gap-2">
                  <GlassButton
                    type="button"
                    variant="ghost"
                    onClick={() => setRenamingEntry(null)}
                  >
                    Cancel
                  </GlassButton>
                  <GlassButton type="submit" variant="primary">
                    Rename
                  </GlassButton>
                </div>
              </form>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Create File Modal ──────────────────────────────────────── */}
      <AnimatePresence>
        {showNewFileModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          >
            <GlassCard
              hoverable={false}
              accentColor="cyan"
              className="w-full max-w-md"
            >
              <form
                onSubmit={handleCreateNewFile}
                className="flex flex-col gap-4"
              >
                <h3 className="text-base font-semibold text-white">
                  Create New File
                </h3>
                <GlassInput
                  label="File Name"
                  placeholder="server.properties"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  required
                />
                <div className="flex justify-end gap-2">
                  <GlassButton
                    type="button"
                    variant="ghost"
                    onClick={() => setShowNewFileModal(false)}
                  >
                    Cancel
                  </GlassButton>
                  <GlassButton type="submit" variant="primary">
                    Create
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
