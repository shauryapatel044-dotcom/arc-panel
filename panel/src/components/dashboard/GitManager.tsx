/* ════════════════════════════════════════════════════════════════
   src/components/dashboard/GitManager.tsx
   GitHub Repository Synchronization & Deployment Center
   Features:
    • Personal Access Token (PAT) authentication (ghp_xxxxxxxxxxxxxx)
    • Branch inspection & selection
    • 1-Click Pull / Code Sync
    • Auto-Deploy on Git Push via Webhook
    • Commit history & status indicators
 ════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect } from 'react';
import {
  GitBranch,
  Github,
  Key,
  FolderGit2,
  RefreshCw,
  CheckCircle2,
  Download,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Radio,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  GitCommit,
  Clock,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import GlassInput from '@/components/ui/GlassInput';
import { gitApi } from '@/lib/api';
import { cn, copyToClipboard } from '@/lib/utils';
import type { GitConfig, GitRepoTestInfo } from '@/types';

interface GitManagerProps {
  serverId: string;
}

export default function GitManager({ serverId }: GitManagerProps) {
  const [config, setConfig] = useState<GitConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPulling, setIsPulling] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [branch, setBranch] = useState('main');
  const [targetDir, setTargetDir] = useState('/');
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [branches, setBranches] = useState<string[]>(['main', 'master']);
  const [testedInfo, setTestedInfo] = useState<GitRepoTestInfo | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Load current git status
  const loadGitConfig = async () => {
    try {
      setLoading(true);
      const res = await gitApi.get(serverId);
      setConfig(res.data);
      if (res.data.configured) {
        setRepo(res.data.repo || '');
        setBranch(res.data.branch || 'main');
        setTargetDir(res.data.targetDir || '/');
        setAutoDeploy(Boolean(res.data.autoDeploy));
      }
    } catch {
      toast.error('Failed to load GitHub configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadGitConfig();
  }, [serverId]);

  // Test connection to GitHub
  const handleTestConnection = async () => {
    if (!repo.trim() || !token.trim()) {
      toast.error('Please enter both repository name and personal access token.');
      return;
    }

    try {
      setIsTesting(true);
      const res = await gitApi.test(serverId, { repo, token });
      setTestedInfo(res.data.info);
      toast.success(`Connected! Found repository: ${res.data.info.fullName}`);

      // Fetch branches
      try {
        const branchRes = await gitApi.branches(serverId, { repo, token });
        if (Array.isArray(branchRes.data.branches) && branchRes.data.branches.length > 0) {
          setBranches(branchRes.data.branches);
          if (!branchRes.data.branches.includes(branch)) {
            setBranch(res.data.info.defaultBranch || branchRes.data.branches[0]);
          }
        }
      } catch {
        // Fallback to default branch
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Failed to verify GitHub connection.';
      toast.error(msg || 'Connection failed.');
      setTestedInfo(null);
    } finally {
      setIsTesting(false);
    }
  };

  // Connect & Save repository
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repo.trim() || !token.trim()) {
      toast.error('Please provide repository name and personal token.');
      return;
    }

    try {
      setIsSaving(true);
      const res = await gitApi.connect(serverId, {
        repo,
        token,
        branch,
        targetDir,
        autoDeploy,
      });

      toast.success(res.data.message || 'GitHub repository connected successfully!');
      setToken('');
      setTestedInfo(null);
      await loadGitConfig();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Failed to save repository configuration.';
      toast.error(msg || 'Save failed.');
    } finally {
      setIsSaving(false);
    }
  };

  // Pull / Sync Latest Code
  const handlePull = async () => {
    try {
      setIsPulling(true);
      const res = await gitApi.pull(serverId);
      toast.success(res.data.message || 'Latest code pulled successfully!');
      await loadGitConfig();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Failed to pull latest repository code.';
      toast.error(msg || 'Pull failed.');
    } finally {
      setIsPulling(false);
    }
  };

  // Disconnect repository
  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect this GitHub repository? Server files will remain intact.')) {
      return;
    }

    try {
      await gitApi.disconnect(serverId);
      toast.success('GitHub repository disconnected.');
      setTestedInfo(null);
      setRepo('');
      setToken('');
      await loadGitConfig();
    } catch {
      toast.error('Failed to disconnect repository.');
    }
  };

  const handleCopyWebhook = () => {
    if (!config?.webhookUrl) return;
    void copyToClipboard(config.webhookUrl);
    setCopiedWebhook(true);
    toast.success('Webhook URL copied to clipboard!');
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  if (loading) {
    return (
      <GlassCard hoverable={false} className="flex h-56 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-arc-cyan-400" />
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Top Header Card ────────────────────────────────────────── */}
      <GlassCard hoverable={false} accentColor="cyan" className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-arc-cyan-400/30 bg-arc-cyan-400/10 shadow-[0_0_15px_rgba(0,204,255,0.2)]">
            <Github className="h-6 w-6 text-arc-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-white">GitHub Repository Sync</h2>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  config?.configured
                    ? 'border border-arc-cyan-400/30 bg-arc-cyan-400/15 text-arc-cyan-300'
                    : 'border border-white/10 bg-white/5 text-white/50'
                )}
              >
                {config?.configured ? 'Connected' : 'Not Connected'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/50">
              Link a private or public GitHub repository using a Personal Access Token (PAT) for automated pulls & deployments.
            </p>
          </div>
        </div>

        {config?.configured && (
          <div className="flex items-center gap-2.5">
            <GlassButton
              variant="secondary"
              size="sm"
              disabled={isPulling}
              onClick={() => void handlePull()}
              leftIcon={<Download className={cn('h-3.5 w-3.5', isPulling && 'animate-bounce')} />}
            >
              {isPulling ? 'Pulling Code...' : 'Pull Latest Code'}
            </GlassButton>
            <GlassButton
              variant="danger"
              size="sm"
              onClick={() => void handleDisconnect()}
              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
            >
              Disconnect
            </GlassButton>
          </div>
        )}
      </GlassCard>

      {/* ── Active Repository Status Card (When Connected) ─────────── */}
      {config?.configured && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <GlassCard hoverable={false} accentColor="cyan" padding="md" className="flex flex-col justify-between">
            <div>
              <span className="text-xs font-medium text-white/50">Linked Repository</span>
              <p className="mt-1 font-mono text-base font-bold text-arc-cyan-400">{config.repo}</p>
              <div className="mt-2.5 flex items-center gap-2 text-xs text-white/60">
                <GitBranch className="h-3.5 w-3.5 text-arc-cyan-400" />
                <span>Branch:</span>
                <strong className="font-mono text-white">{config.branch}</strong>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-xs text-white/60">
                <FolderGit2 className="h-3.5 w-3.5 text-arc-violet-400" />
                <span>Target Folder:</span>
                <strong className="font-mono text-white">{config.targetDir}</strong>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-xs text-white/50">
              Token: <span className="font-mono text-white/80">{config.maskedToken || 'ghp_••••••••••••'}</span>
            </div>
          </GlassCard>

          <GlassCard hoverable={false} accentColor="violet" padding="md">
            <span className="text-xs font-medium text-white/50">Latest Deployment / Sync</span>
            {config.lastCommit ? (
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <GitCommit className="h-4 w-4 text-arc-violet-400" />
                  <span className="rounded bg-arc-violet-400/20 px-2 py-0.5 font-mono text-xs font-bold text-arc-violet-300">
                    {config.lastCommit}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs italic text-white/80">"{config.lastMessage || 'Synced with GitHub'}"</p>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/45">
                  <Clock className="h-3 w-3" />
                  <span>{config.lastSync ? new Date(config.lastSync).toLocaleString() : 'Just now'}</span>
                </div>
              </div>
            ) : (
              <div className="mt-3 text-xs text-white/45">No synchronization performed yet. Click "Pull Latest Code" to start.</div>
            )}
          </GlassCard>

          <GlassCard hoverable={false} accentColor="blue" padding="md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/50">Auto-Deploy Webhook</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-bold',
                  config.autoDeploy
                    ? 'bg-arc-cyan-400/20 text-arc-cyan-300'
                    : 'bg-white/10 text-white/50'
                )}
              >
                {config.autoDeploy ? 'Active' : 'Disabled'}
              </span>
            </div>
            <p className="mt-1 text-xs text-white/45">
              Add this Webhook URL in GitHub repo settings (Payload URL) to auto-pull on every push:
            </p>
            <div className="mt-2.5 flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-[11px] text-white/70">
              <span className="truncate">{config.webhookUrl}</span>
              <button
                type="button"
                onClick={handleCopyWebhook}
                className="ml-auto text-arc-cyan-400 hover:text-white"
                title="Copy Webhook URL"
              >
                {copiedWebhook ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── Connect / Update Repository Card ───────────────────────── */}
      <GlassCard hoverable={false} accentColor="cyan">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-arc-cyan-400" />
          <h3 className="text-sm font-semibold text-white">
            {config?.configured ? 'Update GitHub Connection & Personal Token' : 'Connect GitHub Repository'}
          </h3>
        </div>
        <p className="mt-1 text-xs text-white/50">
          Authenticate using a GitHub Personal Access Token (classic or fine-grained) starting with{' '}
          <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-arc-cyan-300">ghp_...</code>. The token needs{' '}
          <strong className="text-white/80">repo</strong> permissions for private repositories.
        </p>

        <form onSubmit={handleConnect} className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <GlassInput
              label="Repository Name or URL"
              placeholder="shauryapatel044-dotcom/my-project or https://github.com/..."
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              helper="Format: owner/repo or full GitHub HTTPS URL"
            />

            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/70">
                GitHub Personal Access Token (PAT)
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 font-mono text-xs text-white placeholder-white/25 outline-none transition focus:border-arc-cyan-400/50 focus:bg-white/10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-white/40">
                Create tokens on GitHub under <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="text-arc-cyan-400 hover:underline">Settings &gt; Developer settings &gt; Personal access tokens</a>.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/70">Target Branch</label>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-arc-navy-900/90 px-3 py-2 text-xs text-white outline-none focus:border-arc-cyan-400/50"
              >
                {branches.map((b) => (
                  <option key={b} value={b} className="bg-slate-900 text-white">
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <GlassInput
              label="Destination Directory"
              placeholder="/"
              value={targetDir}
              onChange={(e) => setTargetDir(e.target.value)}
              helper="Path inside server container (e.g. '/' or '/plugins')"
            />

            <div className="flex flex-col justify-center pt-2">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={autoDeploy}
                  onChange={(e) => setAutoDeploy(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-white/10 text-arc-cyan-500 focus:ring-0"
                />
                <span className="text-xs font-medium text-white/80">Auto-Deploy on Push (Webhook)</span>
              </label>
              <p className="mt-1 text-[11px] text-white/40">Automatically trigger code pull when GitHub pushes occur.</p>
            </div>
          </div>

          {/* Test connection alert banner */}
          {testedInfo && (
            <div className="flex items-center gap-2.5 rounded-xl border border-arc-cyan-400/30 bg-arc-cyan-400/10 p-3 text-xs text-arc-cyan-300">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-arc-cyan-400" />
              <span>
                Verified! Connected to <strong>{testedInfo.fullName}</strong> ({testedInfo.isPrivate ? 'Private' : 'Public'}, default branch: {testedInfo.defaultBranch}).
              </span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <GlassButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={isTesting}
              onClick={() => void handleTestConnection()}
              leftIcon={<ShieldCheck className="h-3.5 w-3.5" />}
            >
              {isTesting ? 'Verifying Token...' : 'Test Connection'}
            </GlassButton>

            <GlassButton
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSaving}
              leftIcon={<FolderGit2 className="h-3.5 w-3.5" />}
            >
              {isSaving ? 'Saving...' : config?.configured ? 'Update Connection' : 'Save & Link Repository'}
            </GlassButton>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
