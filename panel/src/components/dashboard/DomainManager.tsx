/* ════════════════════════════════════════════════════════════════
   src/components/dashboard/DomainManager.tsx
   Custom Domains & Connection Address Manager
   Features:
    • Client custom domains (play.myserver.com) with auto DNS guides (SRV, CNAME, A)
    • DNS propagation verification check
    • Node domain / VPS IP resolution
    • Non-IPv4 VPS Tunneling detection (Playit.gg / Cloudflare Tunnel)
    • Locked / alert state if non-IPv4 VPS has no tunnel configured by admin
 ════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  Radio,
  Server,
  ShieldAlert,
  ShieldCheck,
  Plus,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Info,
  CheckCircle2,
  Lock,
  Layers,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import GlassInput from '@/components/ui/GlassInput';
import { domainApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ServerDomain, ServerConnectionInfo, DnsInstruction } from '@/types';

interface DomainManagerProps {
  serverId: string;
}

export default function DomainManager({ serverId }: DomainManagerProps) {
  const [connection, setConnection] = useState<ServerConnectionInfo | null>(null);
  const [domains, setDomains] = useState<ServerDomain[]>([]);
  const [customDomain, setCustomDomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // New Domain form
  const [newDomain, setNewDomain] = useState('');
  const [recordType, setRecordType] = useState<'SRV' | 'CNAME' | 'A'>('SRV');
  const [latestDnsGuide, setLatestDnsGuide] = useState<{
    srv: DnsInstruction;
    cname: DnsInstruction;
    a: DnsInstruction;
  } | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await domainApi.get(serverId);
      setConnection(res.data.connection);
      setDomains(res.data.domains || []);
      setCustomDomain(res.data.customDomain || null);
    } catch {
      toast.error('Failed to load domain and connection configuration.');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) {
      toast.error('Please enter a domain name (e.g. play.myserver.com)');
      return;
    }

    try {
      setIsAdding(true);
      const res = await domainApi.add(serverId, {
        domain: newDomain.trim().toLowerCase(),
        recordType,
      });

      toast.success(res.data.message || 'Custom domain added successfully!');
      setLatestDnsGuide(res.data.dnsInstructions);
      setNewDomain('');
      await loadData();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Failed to add custom domain.';
      toast.error(msg || 'Failed to add domain.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleVerifyDns = async (domainId: string) => {
    try {
      setVerifyingId(domainId);
      const res = await domainApi.verify(serverId, domainId);
      if (res.data.verified) {
        toast.success(`Verified! ${res.data.details || 'DNS is resolving correctly.'}`);
      } else {
        toast((t) => (
          <span className="text-xs">
            {res.data.details || 'DNS propagation in progress. Please allow up to 24-48h.'}
          </span>
        ), { icon: '⏳' });
      }
      await loadData();
    } catch {
      toast.error('Verification check failed.');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDeleteDomain = async (domainId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name}?`)) return;
    try {
      await domainApi.delete(serverId, domainId);
      toast.success(`Domain ${name} removed.`);
      await loadData();
    } catch {
      toast.error('Failed to delete domain.');
    }
  };

  if (loading) {
    return (
      <GlassCard hoverable={false} className="flex h-56 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-arc-cyan-400" />
      </GlassCard>
    );
  }

  const isRequiresTunnel = connection?.status === 'REQUIRES_TUNNEL';
  const isTunnelActive = connection?.tunnel.isActive;
  const activeAddress = connection?.displayAddress || connection?.customDomainAddress;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Top Hero / Connection Banner ───────────────────────────── */}
      {isRequiresTunnel ? (
        <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent p-5 backdrop-blur-md shadow-[0_0_20px_rgba(245,158,11,0.15)]">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/20 text-amber-300">
              <Lock className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-amber-200">
                  Non-IPv4 Node: Requires Admin Tunnel Setup
                </h2>
                <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                  Tunnel Pending
                </span>
              </div>
              <p className="mt-1 text-xs text-amber-200/80 leading-relaxed">
                This game server is hosted on a private or non-IPv4 VPS host node (NAT / IPv6-only). An administrator must configure a{' '}
                <strong className="text-white">Playit.gg</strong> tunnel or{' '}
                <strong className="text-white">Cloudflare Tunnel</strong> for this server before public players can connect.
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-amber-300/70">
                <Info className="h-4 w-4" />
                <span>Contact your server administrator to activate the public port tunnel.</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <GlassCard hoverable={false} accentColor="cyan">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-arc-cyan-400/30 bg-arc-cyan-400/10 shadow-[0_0_15px_rgba(0,204,255,0.2)]">
                <Radio className="h-6 w-6 text-arc-cyan-400" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-lg font-bold text-white">Public Connection Endpoint</h2>
                  {isTunnelActive ? (
                    <span className="rounded-full border border-purple-500/40 bg-purple-500/20 px-2.5 py-0.5 text-xs font-semibold text-purple-300">
                      {connection?.tunnel.type} Tunnel Active
                    </span>
                  ) : connection?.nodeDomain ? (
                    <span className="rounded-full border border-arc-cyan-400/40 bg-arc-cyan-400/20 px-2.5 py-0.5 text-xs font-semibold text-arc-cyan-300">
                      Node Domain
                    </span>
                  ) : (
                    <span className="rounded-full border border-blue-500/40 bg-blue-500/20 px-2.5 py-0.5 text-xs font-semibold text-blue-300">
                      Direct VPS IPv4
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-white/50">
                  {isTunnelActive
                    ? 'Tunnel routing active. Players connect directly via this high-speed public tunnel address.'
                    : connection?.nodeDomain
                    ? `Resolving through administrator node domain: ${connection.nodeDomain}`
                    : `Direct VPS host connection on port ${connection?.primaryPort}`}
                </p>
              </div>
            </div>

            {activeAddress && (
              <div className="flex items-center gap-2 rounded-2xl border border-arc-cyan-400/30 bg-black/40 px-4 py-2.5 shadow-[0_0_15px_rgba(0,204,255,0.1)]">
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-arc-cyan-400">
                    Connect Address
                  </span>
                  <span className="font-mono text-sm font-bold text-white">{activeAddress}</span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(activeAddress, 'main-address')}
                  className="ml-3 rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                  title="Copy Connection Address"
                >
                  {copiedKey === 'main-address' ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* ── Custom Domains Section ─────────────────────────────────── */}
      <GlassCard hoverable={false} accentColor="cyan">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-arc-cyan-400" />
            <h3 className="text-sm font-semibold text-white">Client Custom Domains</h3>
          </div>
          <p className="text-xs text-white/50">
            Link your own domain or subdomain (e.g.{' '}
            <code className="text-arc-cyan-300">play.yournetwork.net</code>) to this server.
          </p>
        </div>

        {/* Add domain form */}
        <form onSubmit={handleAddDomain} className="mt-4 flex flex-wrap items-end gap-3">
          <GlassInput
            label="Domain Name"
            placeholder="play.myserver.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            containerCls="flex-1 min-w-[240px]"
            helper="Use a domain you own from Cloudflare, Namecheap, GoDaddy, etc."
          />

          <div className="min-w-[180px]">
            <label className="mb-1.5 block text-xs font-medium text-white/70">Record Type</label>
            <select
              value={recordType}
              onChange={(e) => setRecordType(e.target.value as 'SRV' | 'CNAME' | 'A')}
              className="w-full rounded-xl border border-white/10 bg-arc-navy-900/90 px-3 py-2 text-xs text-white outline-none focus:border-arc-cyan-400/50"
            >
              <option value="SRV" className="bg-slate-900 text-white">
                SRV Record (Minecraft — No Port Needed)
              </option>
              <option value="CNAME" className="bg-slate-900 text-white">
                CNAME Record (Web Map / Dynmap)
              </option>
              <option value="A" className="bg-slate-900 text-white">
                A Record (Direct IPv4)
              </option>
            </select>
          </div>

          <GlassButton
            type="submit"
            variant="primary"
            size="sm"
            disabled={isAdding}
            leftIcon={<Plus className="h-3.5 w-3.5" />}
          >
            {isAdding ? 'Adding...' : 'Add Domain'}
          </GlassButton>
        </form>

        {/* DNS Instructions banner for latest added domain */}
        {latestDnsGuide && (
          <div className="mt-5 rounded-2xl border border-arc-cyan-400/30 bg-arc-cyan-400/[0.04] p-4 text-xs">
            <div className="flex items-center gap-2 text-arc-cyan-300 font-semibold">
              <Sparkles className="h-4 w-4" />
              <span>Step 2: Add these DNS Records to your DNS Manager (Cloudflare / Registrar)</span>
            </div>
            <p className="mt-1 text-white/60">
              For Minecraft players to join without typing a port number, add an SRV record:
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-white/10 text-white/40">
                    <th className="py-1.5 pr-3">Type</th>
                    <th className="py-1.5 pr-3">Name / Host</th>
                    <th className="py-1.5 pr-3">Target / Points to</th>
                    <th className="py-1.5 pr-3">Port</th>
                    <th className="py-1.5 pr-3">Priority / Weight</th>
                    <th className="py-1.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/80">
                  <tr>
                    <td className="py-2 pr-3 font-bold text-arc-cyan-400">SRV</td>
                    <td className="py-2 pr-3">{latestDnsGuide.srv.name}</td>
                    <td className="py-2 pr-3">{latestDnsGuide.srv.target}</td>
                    <td className="py-2 pr-3 font-bold text-arc-violet-300">{latestDnsGuide.srv.port}</td>
                    <td className="py-2 pr-3">0 / 5</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            `${latestDnsGuide.srv.name} ${latestDnsGuide.srv.target} ${latestDnsGuide.srv.port}`,
                            'srv-val'
                          )
                        }
                        className="text-arc-cyan-400 hover:text-white"
                      >
                        {copiedKey === 'srv-val' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-bold text-arc-violet-400">CNAME</td>
                    <td className="py-2 pr-3">{latestDnsGuide.cname.name}</td>
                    <td className="py-2 pr-3">{latestDnsGuide.cname.target}</td>
                    <td className="py-2 pr-3 text-white/30">—</td>
                    <td className="py-2 pr-3 text-white/30">—</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(latestDnsGuide.cname.target, 'cname-val')}
                        className="text-arc-cyan-400 hover:text-white"
                      >
                        {copiedKey === 'cname-val' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Existing Domains Table */}
        <div className="mt-5 divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.02]">
          {domains.length === 0 ? (
            <div className="p-6 text-center text-xs text-white/40">
              No custom domains configured yet. Add your domain above to get started.
            </div>
          ) : (
            domains.map((dom) => (
              <div key={dom.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-arc-cyan-400" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-white">{dom.domain}</span>
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/70">
                        {dom.recordType}
                      </span>
                      {dom.isVerified ? (
                        <span className="flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Verified
                        </span>
                      ) : (
                        <span className="rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                          Pending Propagation
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-white/45">
                      Points to: <strong className="font-mono text-white/70">{dom.targetHost}</strong>
                      {dom.targetPort && ` : ${dom.targetPort}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <GlassButton
                    variant="secondary"
                    size="xs"
                    disabled={verifyingId === dom.id}
                    onClick={() => void handleVerifyDns(dom.id)}
                    leftIcon={<RefreshCw className={cn('h-3 w-3', verifyingId === dom.id && 'animate-spin')} />}
                  >
                    {verifyingId === dom.id ? 'Checking DNS...' : 'Verify DNS'}
                  </GlassButton>
                  <GlassButton
                    variant="danger"
                    size="xs"
                    onClick={() => void handleDeleteDomain(dom.id, dom.domain)}
                    leftIcon={<Trash2 className="h-3 w-3" />}
                  >
                    Remove
                  </GlassButton>
                </div>
              </div>
            ))
          )}
        </div>
      </GlassCard>
    </div>
  );
}
