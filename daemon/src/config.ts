/**
 * Arc Panel Daemon — Centralised Configuration
 *
 * All environment variables are read and validated here.
 * The rest of the codebase imports `config` — never `process.env` directly.
 */

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  /** Shared secret for Bearer-token authentication */
  daemonToken: requireEnv('DAEMON_TOKEN'),

  /** Port the HTTP + WebSocket server listens on */
  port: parseInt(optionalEnv('DAEMON_PORT', '8085'), 10),

  /** Port the SFTP server listens on */
  sftpPort: parseInt(optionalEnv('SFTP_PORT', '2022'), 10),

  /** Root directory for server data volumes, e.g. /var/lib/arc-panel/servers */
  dataDir: optionalEnv('DATA_DIR', '/var/lib/arc-panel/servers'),

  /** Root directory for backup archives, e.g. /var/lib/arc-panel/backups */
  backupDir: optionalEnv('BACKUP_DIR', '/var/lib/arc-panel/backups'),

  /** Node environment (production | development) */
  nodeEnv: optionalEnv('NODE_ENV', 'production'),

  /** Winston log level */
  logLevel: optionalEnv('LOG_LEVEL', 'info'),
} as const;
