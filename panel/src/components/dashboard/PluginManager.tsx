/* ════════════════════════════════════════════════════════════════
   src/components/dashboard/PluginManager.tsx
   1-Click Mod & Plugin Installer for Minecraft & Game Servers
   Features: Curated essential plugins, Modrinth live search,
   1-click install/uninstall, category filtering, installed detector
════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Puzzle,
  Download,
  Trash2,
  Search,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Coins,
  Layers,
  Globe2,
  Zap,
  Lock,
  Wrench,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import GlassInput from '@/components/ui/GlassInput';
import { pluginApi } from '@/lib/api';
import { formatBytes, cn } from '@/lib/utils';
import type { PluginItem, InstalledPlugin } from '@/types';

interface PluginManagerProps {
  serverId: string;
  serverEgg?: string;
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  all: Puzzle,
  permissions: ShieldCheck,
  economy: Coins,
  management: Layers,
  crossplay: Globe2,
  optimization: Zap,
  security: Lock,
  utility: Wrench,
};

export default function PluginManager({ serverId, serverEgg = '' }: PluginManagerProps) {
  const [catalog, setCatalog] = useState<PluginItem[]>([]);
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [modrinthResults, setModrinthResults] = useState<PluginItem[]>([]);
  const [searchingModrinth, setSearchingModrinth] = useState(false);

  const isFabricOrForge =
    serverEgg.toLowerCase().includes('fabric') ||
    serverEgg.toLowerCase().includes('forge') ||
    serverEgg.toLowerCase().includes('neoforge');

  const defaultTargetDir = isFabricOrForge ? 'mods' : 'plugins';

  /* ── Load Catalog & Installed Plugins ─────────────────────────── */
  const fetchData = async () => {
    setLoading(true);
    try {
      const [catRes, instRes] = await Promise.all([
        pluginApi.getCatalog(serverId),
        pluginApi.getInstalled(serverId),
      ]);
      setCatalog(catRes.data?.catalog || []);
      setInstalled(instRes.data?.installed || []);
    } catch {
      toast.error('Failed to load plugin catalog.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [serverId]);

  /* ── Modrinth Live Search Debounce ────────────────────────────── */
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setModrinthResults([]);
      setSearchingModrinth(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingModrinth(true);
      try {
        const type = isFabricOrForge ? 'mod' : 'plugin';
        const { data } = await pluginApi.search(serverId, searchQuery.trim(), type);
        setModrinthResults(data?.results || []);
      } catch {
        // Ignore search error
      } finally {
        setSearchingModrinth(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, serverId, isFabricOrForge]);

  /* ── Check if a plugin is installed ────────────────────────────── */
  const installedFilenames = useMemo(() => {
    return new Set(installed.map((item) => item.filename.toLowerCase()));
  }, [installed]);

  const isPluginInstalled = (plugin: PluginItem) => {
    const slugLower = plugin.slug.toLowerCase();
    const idLower = plugin.id.toLowerCase();
    return Array.from(installedFilenames).some(
      (fn) => fn.includes(slugLower) || fn.includes(idLower)
    );
  };

  /* ── Install Plugin ────────────────────────────────────────────── */
  const handleInstall = async (plugin: PluginItem) => {
    setActionLoading(plugin.id);
    try {
      const { data } = await pluginApi.install(serverId, {
        downloadUrl: plugin.downloadUrl,
        filename: `${plugin.slug}.jar`,
        targetDir: plugin.targetDir || defaultTargetDir,
      });
      toast.success(data?.message || `Installed ${plugin.name}`);
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || `Failed to install ${plugin.name}`);
    } finally {
      setActionLoading(null);
    }
  };

  /* ── Uninstall Plugin ──────────────────────────────────────────── */
  const handleUninstall = async (filename: string, targetDir: 'plugins' | 'mods') => {
    if (!confirm(`Are you sure you want to remove ${filename}?`)) return;
    setActionLoading(filename);
    try {
      const { data } = await pluginApi.uninstall(serverId, filename, targetDir);
      toast.success(data?.message || `Removed ${filename}`);
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || `Failed to remove ${filename}`);
    } finally {
      setActionLoading(null);
    }
  };

  /* ── Filtered Catalog ──────────────────────────────────────────── */
  const filteredCatalog = useMemo(() => {
    let items = catalog;
    if (selectedCategory !== 'all') {
      items = items.filter((p) => p.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      );
    }
    return items;
  }, [catalog, selectedCategory, searchQuery]);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header Card */}
      <GlassCard hoverable={false} accentColor="cyan">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-arc-cyan-400/30 bg-arc-cyan-400/10 shadow-[0_0_16px_rgba(0,204,255,0.2)]">
              <Puzzle className="h-6 w-6 text-arc-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {isFabricOrForge ? 'Mod Manager (1-Click)' : 'Plugin Manager (1-Click)'}
              </h2>
              <p className="text-xs text-white/60">
                Install curated & community plugins directly to your{' '}
                <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-arc-cyan-300">
                  /{defaultTargetDir}
                </code>{' '}
                directory. Restart server to apply.
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
          </div>
        </div>

        {/* Search & Category Tabs */}
        <div className="mt-5 flex flex-col gap-3.5 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isFabricOrForge
                    ? 'Search mods or query Modrinth...'
                    : 'Search plugins (e.g. LuckPerms, EssentialsX, Geyser)...'
                }
                className="h-10 w-full rounded-xl border border-white/10 bg-[#080d1a] pl-10 pr-4 text-sm text-white placeholder-white/35 focus:border-arc-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'All' },
              { id: 'permissions', label: 'Permissions' },
              { id: 'economy', label: 'Economy' },
              { id: 'management', label: 'Management' },
              { id: 'crossplay', label: 'Crossplay' },
              { id: 'optimization', label: 'Optimization' },
              { id: 'security', label: 'Security' },
              { id: 'utility', label: 'Utility' },
            ].map((cat) => {
              const Icon = CATEGORY_ICONS[cat.id] || Puzzle;
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                    isActive
                      ? 'border-arc-cyan-400/50 bg-arc-cyan-400/20 text-arc-cyan-300 shadow-[0_0_12px_rgba(0,204,255,0.2)]'
                      : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white'
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      </GlassCard>

      {/* Installed Files Quick Bar */}
      {installed.length > 0 && (
        <GlassCard hoverable={false} accentColor="violet">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-arc-cyan-400" />
              <h3 className="text-sm font-semibold text-white">
                Installed in /{defaultTargetDir} ({installed.length})
              </h3>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {installed.map((item) => (
              <div
                key={`${item.directory}/${item.filename}`}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#080d1a] px-3 py-1.5 text-xs text-white/85"
              >
                <span className="font-mono text-arc-cyan-300">{item.filename}</span>
                <span className="text-[10px] text-white/40">{formatBytes(item.size)}</span>
                <button
                  type="button"
                  title="Remove this jar"
                  onClick={() =>
                    handleUninstall(item.filename, item.directory as 'plugins' | 'mods')
                  }
                  disabled={actionLoading === item.filename}
                  className="text-white/40 transition hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Modrinth Live Search Results (if user typed a query) */}
      {searchQuery.trim().length >= 2 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-arc-violet-400" />
            <h3 className="text-sm font-semibold text-white">
              Modrinth Community Results {searchingModrinth && '(Searching...)'}
            </h3>
          </div>

          {modrinthResults.length === 0 && !searchingModrinth ? (
            <GlassCard className="py-6 text-center text-xs text-white/50">
              No additional community results found on Modrinth for &quot;{searchQuery}&quot;.
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
              {modrinthResults.map((item) => {
                const isInstalled = isPluginInstalled(item);
                const isBusy = actionLoading === item.id;
                return (
                  <GlassCard key={item.id} hoverable={true} className="flex flex-col justify-between p-4">
                    <div>
                      <div className="flex items-start gap-3">
                        {item.iconUrl ? (
                          <img
                            src={item.iconUrl}
                            alt={item.name}
                            className="h-10 w-10 rounded-xl border border-white/10 object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                            <Puzzle className="h-5 w-5 text-arc-cyan-400" />
                          </div>
                        )}
                        <div className="flex-1 overflow-hidden">
                          <h4 className="truncate text-sm font-semibold text-white">{item.name}</h4>
                          <span className="text-[10px] text-white/45">by {item.author}</span>
                        </div>
                      </div>
                      <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-white/60">
                        {item.description}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                      <span className="font-mono text-[10px] text-arc-cyan-400">Modrinth</span>
                      {isInstalled ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Installed
                        </span>
                      ) : (
                        <GlassButton
                          variant="primary"
                          size="sm"
                          onClick={() => handleInstall(item)}
                          disabled={isBusy}
                          className="h-8 gap-1.5 text-xs"
                        >
                          <Download className="h-3 w-3" />
                          {isBusy ? 'Installing...' : '1-Click Install'}
                        </GlassButton>
                      )}
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Curated Catalog Grid */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-white">
          Curated Essential {isFabricOrForge ? 'Mods' : 'Plugins'} ({filteredCatalog.length})
        </h3>

        {filteredCatalog.length === 0 ? (
          <GlassCard className="py-10 text-center text-sm text-white/50">
            No plugins match your current category and search filter.
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCatalog.map((plugin) => {
              const isInstalled = isPluginInstalled(plugin);
              const isBusy = actionLoading === plugin.id;
              return (
                <GlassCard
                  key={plugin.id}
                  hoverable={true}
                  accentColor={isInstalled ? 'cyan' : undefined}
                  className="flex flex-col justify-between p-4"
                >
                  <div>
                    <div className="flex items-start gap-3">
                      {plugin.iconUrl ? (
                        <img
                          src={plugin.iconUrl}
                          alt={plugin.name}
                          className="h-10 w-10 rounded-xl border border-white/10 object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                          <Puzzle className="h-5 w-5 text-arc-cyan-400" />
                        </div>
                      )}
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center justify-between">
                          <h4 className="truncate text-sm font-semibold text-white">
                            {plugin.name}
                          </h4>
                          {isInstalled && (
                            <span className="flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                              <CheckCircle2 className="h-3 w-3" /> Installed
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider text-arc-cyan-400">
                            {plugin.category}
                          </span>
                          <span className="text-[10px] text-white/40">v{plugin.version}</span>
                        </div>
                      </div>
                    </div>

                    <p className="mt-2.5 line-clamp-3 text-xs leading-relaxed text-white/60">
                      {plugin.description}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                    <span className="font-mono text-[10px] text-white/40">
                      /{plugin.targetDir}
                    </span>
                    {isInstalled ? (
                      <GlassButton
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          handleUninstall(`${plugin.slug}.jar`, plugin.targetDir)
                        }
                        disabled={isBusy}
                        className="h-8 gap-1.5 text-xs text-red-400 hover:border-red-500/40"
                      >
                        <Trash2 className="h-3 w-3" />
                        {isBusy ? 'Removing...' : 'Uninstall'}
                      </GlassButton>
                    ) : (
                      <GlassButton
                        variant="primary"
                        size="sm"
                        onClick={() => handleInstall(plugin)}
                        disabled={isBusy}
                        className="h-8 gap-1.5 text-xs"
                      >
                        <Download className="h-3 w-3" />
                        {isBusy ? 'Installing...' : '1-Click Install'}
                      </GlassButton>
                    )}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
