/* ════════════════════════════════════════════════════════════════
   src/types/index.ts — Arc Panel shared TypeScript interfaces
════════════════════════════════════════════════════════════════ */

/** Roles available to platform users */
export type UserRole = 'admin' | 'user' | 'moderator';

/** Account status */
export type AccountStatus = 'active' | 'suspended' | 'pending';

/** Auth provider */
export type AuthProvider = 'local' | 'github' | 'google';

/** ─── User ─────────────────────────────────────────────────────── */
export interface User {
  id:                 string;
  username:           string;
  email:              string;
  role:               UserRole;
  status:             AccountStatus;
  avatarUrl?:         string;
  /** Whether the user has enabled TOTP 2FA */
  twoFactorEnabled:   boolean;
  /** True when the user must set a new password on next login */
  firstLogin:         boolean;
  createdAt:          string; // ISO 8601
  updatedAt:          string;
}

/** ─── Node ─────────────────────────────────────────────────────── */
export type NodeStatus = 'online' | 'offline' | 'maintenance';

export interface Node {
  id:          string;
  name:        string;
  fqdn:        string;           // Fully-qualified domain name / IP
  domain?:     string | null;    // Custom domain set by admin
  publicIp?:   string | null;    // VPS public IPv4
  isIpv4?:     boolean;          // Whether node has native public IPv4
  tunnelType?: 'NONE' | 'PLAYIT' | 'CLOUDFLARE';
  tunnelAddress?: string | null;
  tunnelToken?: string | null;
  tunnelStatus?: 'ACTIVE' | 'PENDING_SETUP' | 'OFFLINE';
  port:        number;           // Daemon port
  status:      NodeStatus;
  /** Total RAM in MB */
  totalRamMB:  number;
  /** Total disk in MB */
  totalDiskMB: number;
  /** CPU core count */
  cpuCores:    number;
  location:    string;
  createdAt:   string;
  updatedAt:   string;
}

/** ─── Allocation (port binding) ─────────────────────────────────── */
export interface Allocation {
  id:         string;
  nodeId:     string;
  ip:         string;
  port:       number;
  alias?:     string;
  assigned?:  boolean;
  isAssigned?: boolean;
  isPrimary?: boolean;
  notes?:     string;
  serverId?:  string;
}

/** ─── Plugin & Mod ──────────────────────────────────────────────── */
export interface PluginItem {
  id:          string;
  name:        string;
  slug:        string;
  description: string;
  category:    string;
  author:      string;
  iconUrl?:    string;
  downloadUrl: string;
  targetDir:   'plugins' | 'mods';
  version?:    string;
  source:      'curated' | 'modrinth';
}

export interface InstalledPlugin {
  filename:   string;
  size:       number;
  modifiedAt: string;
  directory:  string;
}

/** ─── Server Database ───────────────────────────────────────────── */
export interface ServerDatabase {
  id:               string;
  serverId:         string;
  name:             string;
  username:         string;
  password:         string;
  host:             string;
  port:             number;
  maxConnections:   number;
  fullDbName?:      string;
  jdbcUrl?:         string;
  connectionString?: string;
  createdAt:        string;
}

/** ─── Server Collaborator (Subuser) ─────────────────────────────── */
export interface ServerSubuser {
  id:          string;
  userId:      string;
  user: {
    id:        string;
    username:  string;
    email:     string;
    role:      string;
  };
  permissions: string[];
  createdAt:   string;
}

/** ─── Discord Webhook ───────────────────────────────────────────── */
export interface ServerWebhook {
  id:        string;
  serverId:  string;
  name:      string;
  url:       string;
  events:    string[];
  isActive:  boolean;
  createdAt: string;
}

/** ─── Server Audit Log ──────────────────────────────────────────── */
export interface ServerAuditLog {
  id:        string;
  serverId:  string;
  action:    string;
  details?:  string;
  ipAddress?: string;
  createdAt: string;
  user?: {
    id:       string;
    username: string;
    email:    string;
    role:     string;
  };
}

/** ─── Server ────────────────────────────────────────────────────── */
export type ServerStatus =
  | 'running'
  | 'stopped'
  | 'starting'
  | 'stopping'
  | 'error'
  | 'installing'
  | 'reinstalling';

export interface ServerLimits {
  /** RAM limit in MB (0 = unlimited) */
  ramMB:    number;
  /** CPU limit as percentage (e.g. 100 = 1 core, 200 = 2 cores) */
  cpuPct:   number;
  /** Disk limit in MB (0 = unlimited) */
  diskMB:   number;
  /** Swap in MB */
  swapMB:   number;
  /** I/O weight (10–1000) */
  ioWeight: number;
}

export interface Server {
  id:          string;
  name:        string;
  description?: string;
  ownerId:     string;
  owner?:      Pick<User, 'id' | 'username' | 'email'>;
  nodeId:      string;
  node?:       Pick<Node, 'id' | 'name' | 'fqdn' | 'domain' | 'publicIp' | 'isIpv4' | 'tunnelType' | 'tunnelAddress' | 'tunnelStatus'>;
  status:      ServerStatus;
  limits:      ServerLimits;
  /** Primary allocation */
  allocation?: Allocation;
  /** All allocations attached */
  allocations: Allocation[];
  /** Game/egg type identifier */
  eggId?:      string;
  eggName?:    string;
  /** Docker image used */
  dockerImage: string;
  /** Environment variables set on the server */
  environment: Record<string, string>;
  customDomain?: string | null;
  tunnelAddress?: string | null;
  tunnelType?: string | null;
  tunnelStatus?: string | null;
  githubRepo?: string | null;
  githubBranch?: string | null;
  githubTargetDir?: string | null;
  githubAutoDeploy?: boolean;
  githubLastSync?: string | null;
  githubLastCommit?: string | null;
  githubLastMessage?: string | null;
  domains?: ServerDomain[];
  createdAt:   string;
  updatedAt:   string;
}

/** ─── Real-time Server Stats ────────────────────────────────────── */
export interface ServerStats {
  serverId:   string;
  status:     ServerStatus;
  /** CPU usage percentage */
  cpuPct:     number;
  /** RAM used in MB */
  ramMB:      number;
  /** Disk used in MB */
  diskMB:     number;
  /** Network RX bytes/s */
  netRxBps:   number;
  /** Network TX bytes/s */
  netTxBps:   number;
  /** Uptime in seconds */
  uptimeSecs: number;
  timestamp:  number; // Unix ms
}

/** ─── Backup ────────────────────────────────────────────────────── */
export type BackupStatus = 'complete' | 'in_progress' | 'failed';

export interface Backup {
  id:          string;
  serverId:    string;
  name:        string;
  sizeBytes:   number;
  status:      BackupStatus;
  checksum?:   string;
  /** Whether backup is locked from deletion */
  locked:      boolean;
  createdAt:   string;
  completedAt?: string;
}

/** ─── File Manager ──────────────────────────────────────────────── */
export type FileType = 'file' | 'directory' | 'symlink';

export interface FileEntry {
  name:        string;
  path:        string;   // relative to server root
  type:        FileType;
  sizeBytes:   number;
  mimeType?:   string;
  modifiedAt:  string;  // ISO 8601
  permissions: string;  // e.g. "rwxr-xr-x"
}

/** ─── Auth ─────────────────────────────────────────────────────── */
export interface AuthTokens {
  accessToken:  string;
  refreshToken: string;
  expiresIn:    number; // seconds
}

export interface LoginRequest {
  email:    string;
  password: string;
  totpCode?: string;
}

export interface LoginResponse {
  /** Present when login succeeds fully */
  tokens?:      AuthTokens;
  user?:        User;
  /** True when server wants a TOTP code before issuing tokens */
  requires2FA?: boolean;
  /** True when the user must change their password */
  firstLogin?:  boolean;
}

export interface RegisterRequest {
  username: string;
  email:    string;
  password: string;
}

/** ─── API response wrapper ─────────────────────────────────────── */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?:   T;
  error?:  string;
  message?: string;
}

/** ─── Pagination ────────────────────────────────────────────────── */
export interface PaginatedResult<T> {
  items:      T[];
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
}

/** ─── Admin dashboard stats ────────────────────────────────────── */
export interface AdminStats {
  totalUsers:   number;
  activeUsers:  number;
  totalServers: number;
  runningServers: number;
  totalNodes:   number;
  onlineNodes:  number;
  totalRamUsedMB: number;
  totalRamMB:     number;
  totalDiskUsedMB: number;
  totalDiskMB:     number;
}

/** ─── 2FA ──────────────────────────────────────────────────────── */
export interface TwoFactorSetupResponse {
  secret:       string;
  otpAuthUrl:   string;
  /** base64 PNG of the QR code */
  qrCodeDataUrl: string;
}

/** ─── Custom Domains ───────────────────────────────────────────── */
export interface ServerDomain {
  id:         string;
  serverId:   string;
  domain:     string;
  recordType: 'SRV' | 'CNAME' | 'A';
  targetHost: string;
  targetPort?: number;
  isVerified: boolean;
  createdAt:  string;
  updatedAt:  string;
}

export interface DnsInstruction {
  type: string;
  name: string;
  target: string;
  port?: number;
  priority?: number;
  weight?: number;
  ttl?: number;
}

export interface ServerConnectionInfo {
  status: 'DIRECT_IP' | 'NODE_DOMAIN' | 'TUNNEL_ACTIVE' | 'REQUIRES_TUNNEL';
  displayAddress: string | null;
  customDomainAddress: string | null;
  nodeDomain: string | null;
  vpsIp: string;
  isIpv4: boolean;
  primaryPort: number;
  tunnel: {
    type: string;
    address: string | null;
    status: string;
    isActive: boolean;
  };
  tunnelWarning: string | null;
}

/** ─── GitHub Integration ───────────────────────────────────────── */
export interface GitConfig {
  configured: boolean;
  repo: string | null;
  branch: string;
  targetDir: string;
  autoDeploy: boolean;
  lastSync: string | null;
  lastCommit: string | null;
  lastMessage: string | null;
  maskedToken: string | null;
  webhookUrl: string;
}

export interface GitRepoTestInfo {
  valid: boolean;
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  description: string;
}

