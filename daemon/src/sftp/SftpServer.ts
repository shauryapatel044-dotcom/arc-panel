/**
 * Arc Panel Daemon — SFTP Server
 *
 * Provides an SFTP interface (port 2022) so users can manage server files
 * with any SCP/SFTP client (FileZilla, WinSCP, scp, rsync, etc.).
 *
 * Authentication:
 *   Username: <serverId>
 *   Password: <DAEMON_TOKEN>
 *
 * The SFTP filesystem is virtualised to:
 *   DATA_DIR/servers/<serverId>/data/
 *
 * SSH Host Key:
 *   Generated with node-forge on first start and persisted at:
 *   DATA_DIR/ssh_host_key  (private key, PEM)
 *   DATA_DIR/ssh_host_key.pub  (public key, PEM)
 *
 * Supported SFTP operations:
 *   OPEN, READ, WRITE, CLOSE, STAT, LSTAT, OPENDIR, READDIR,
 *   REMOVE, RMDIR, MKDIR, RENAME
 */

import net from 'net';
import fs from 'fs';
import path from 'path';
import { Server as SshServer, Connection, Session, SFTPWrapper } from 'ssh2';
import forge from 'node-forge';
import { config } from '../config';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpenFileHandle {
  fd: number;
  flags: number;
  path: string;
}

interface OpenDirHandle {
  entries: fs.Dirent[];
  index: number;
}

type HandleEntry =
  | { kind: 'file'; handle: OpenFileHandle }
  | { kind: 'dir'; handle: OpenDirHandle };

// ─── SSH Host Key Management ─────────────────────────────────────────────────

const HOST_KEY_PATH = path.join(config.dataDir, 'ssh_host_key');
const HOST_KEY_PUB_PATH = `${HOST_KEY_PATH}.pub`;

/**
 * Load the SSH host key from disk.
 * If it doesn't exist, generate a new RSA 2048-bit key pair using node-forge
 * and persist it so future restarts use the same fingerprint.
 */
function loadOrGenerateHostKey(): string {
  if (fs.existsSync(HOST_KEY_PATH)) {
    return fs.readFileSync(HOST_KEY_PATH, 'utf-8');
  }

  logger.info('SftpServer: generating new RSA host key…');

  // Generate RSA key pair synchronously (blocking — only happens once).
  const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const privatePem = forge.pki.privateKeyToPem(keypair.privateKey);
  const publicPem = forge.pki.publicKeyToPem(keypair.publicKey);

  // Ensure the parent directory exists.
  fs.mkdirSync(path.dirname(HOST_KEY_PATH), { recursive: true });

  fs.writeFileSync(HOST_KEY_PATH, privatePem, { mode: 0o600 });
  fs.writeFileSync(HOST_KEY_PUB_PATH, publicPem, { mode: 0o644 });

  logger.info(`SftpServer: host key saved to ${HOST_KEY_PATH}`);
  return privatePem;
}

// ─── SFTP path helpers ───────────────────────────────────────────────────────

function serverDataRoot(serverId: string): string {
  return path.join(config.dataDir, 'servers', serverId, 'data');
}

/**
 * Resolve an SFTP absolute path (from the client) to a real OS path,
 * ensuring it stays within the server's data root (path-traversal guard).
 */
function realPath(serverId: string, sftpPath: string): string {
  const root = serverDataRoot(serverId);
  const normalised = path.posix.normalize('/' + sftpPath).replace(/\\/g, '/');
  const resolved = path.join(root, normalised);

  if (!resolved.startsWith(root)) {
    throw new Error(`Path traversal: ${sftpPath}`);
  }
  return resolved;
}

// ─── stat → SFTP attrs conversion ────────────────────────────────────────────

function statToAttrs(stat: fs.Stats): Record<string, unknown> {
  return {
    mode: stat.mode,
    uid: stat.uid,
    gid: stat.gid,
    size: stat.size,
    atime: Math.floor(stat.atimeMs / 1000),
    mtime: Math.floor(stat.mtimeMs / 1000),
  };
}

// ─── SFTP session handler ─────────────────────────────────────────────────────

function handleSftpSession(serverId: string, sftp: SFTPWrapper): void {
  // Map of open handles (handle buffer → entry)
  const handles = new Map<string, HandleEntry>();
  let nextHandle = 1;

  function newHandle(): Buffer {
    const h = Buffer.alloc(4);
    h.writeUInt32BE(nextHandle++);
    return h;
  }

  function hKey(handle: Buffer): string {
    return handle.toString('hex');
  }

  // ── OPEN ─────────────────────────────────────────────────────────────────
  sftp.on('OPEN', (reqid, filename, flags, _attrs) => {
    let osPath: string;
    try {
      osPath = realPath(serverId, filename);
    } catch {
      return sftp.status(reqid, SFTPWrapper.STATUS_CODE.PERMISSION_DENIED);
    }

    // Convert SFTP flags to Node fs flags
    let nodeFlags = 'r';
    const SFTP_O_RDONLY = 0x0000_0001;
    const SFTP_O_WRONLY = 0x0000_0002;
    const SFTP_O_RDWR   = 0x0000_0004;  // may overlap
    const SFTP_O_CREAT  = 0x0000_0008;
    const SFTP_O_TRUNC  = 0x0000_0010;
    const SFTP_O_APPEND = 0x0000_0020;

    if (flags & SFTP_O_WRONLY) {
      nodeFlags = flags & SFTP_O_CREAT
        ? (flags & SFTP_O_TRUNC ? 'w' : 'a')
        : 'r+';
    } else if (flags & SFTP_O_RDWR) {
      nodeFlags = flags & SFTP_O_CREAT ? 'a+' : 'r+';
    } else if (flags & SFTP_O_APPEND) {
      nodeFlags = 'a';
    } else {
      nodeFlags = 'r';
    }

    // Ensure parent directory exists for write operations.
    if (['w', 'a', 'w+', 'a+'].includes(nodeFlags)) {
      try {
        fs.mkdirSync(path.dirname(osPath), { recursive: true });
      } catch { /* ignore */ }
    }

    try {
      const fd = fs.openSync(osPath, nodeFlags);
      const handle = newHandle();
      handles.set(hKey(handle), {
        kind: 'file',
        handle: { fd, flags, path: osPath },
      });
      sftp.handle(reqid, handle);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return sftp.status(reqid, SFTPWrapper.STATUS_CODE.NO_SUCH_FILE);
      if (code === 'EACCES') return sftp.status(reqid, SFTPWrapper.STATUS_CODE.PERMISSION_DENIED);
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.FAILURE);
    }
  });

  // ── READ ──────────────────────────────────────────────────────────────────
  sftp.on('READ', (reqid, handle, offset, length) => {
    const entry = handles.get(hKey(handle));
    if (!entry || entry.kind !== 'file') {
      return sftp.status(reqid, SFTPWrapper.STATUS_CODE.FAILURE);
    }

    const buf = Buffer.alloc(length);
    try {
      const bytesRead = fs.readSync(entry.handle.fd, buf, 0, length, offset);
      if (bytesRead === 0) return sftp.status(reqid, SFTPWrapper.STATUS_CODE.EOF);
      sftp.data(reqid, buf.slice(0, bytesRead));
    } catch {
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.FAILURE);
    }
  });

  // ── WRITE ─────────────────────────────────────────────────────────────────
  sftp.on('WRITE', (reqid, handle, offset, data) => {
    const entry = handles.get(hKey(handle));
    if (!entry || entry.kind !== 'file') {
      return sftp.status(reqid, SFTPWrapper.STATUS_CODE.FAILURE);
    }

    try {
      fs.writeSync(entry.handle.fd, data, 0, data.length, offset);
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.OK);
    } catch {
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.FAILURE);
    }
  });

  // ── CLOSE ─────────────────────────────────────────────────────────────────
  sftp.on('CLOSE', (reqid, handle) => {
    const key = hKey(handle);
    const entry = handles.get(key);
    if (!entry) return sftp.status(reqid, SFTPWrapper.STATUS_CODE.FAILURE);

    try {
      if (entry.kind === 'file') {
        fs.closeSync(entry.handle.fd);
      }
      handles.delete(key);
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.OK);
    } catch {
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.FAILURE);
    }
  });

  // ── STAT ──────────────────────────────────────────────────────────────────
  sftp.on('STAT', (reqid, filename) => {
    let osPath: string;
    try { osPath = realPath(serverId, filename); }
    catch { return sftp.status(reqid, SFTPWrapper.STATUS_CODE.PERMISSION_DENIED); }

    try {
      const stat = fs.statSync(osPath);
      sftp.attrs(reqid, statToAttrs(stat));
    } catch {
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.NO_SUCH_FILE);
    }
  });

  // ── LSTAT (like STAT but don't follow symlinks) ────────────────────────────
  sftp.on('LSTAT', (reqid, filename) => {
    let osPath: string;
    try { osPath = realPath(serverId, filename); }
    catch { return sftp.status(reqid, SFTPWrapper.STATUS_CODE.PERMISSION_DENIED); }

    try {
      const stat = fs.lstatSync(osPath);
      sftp.attrs(reqid, statToAttrs(stat));
    } catch {
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.NO_SUCH_FILE);
    }
  });

  // ── FSTAT (stat by handle) ─────────────────────────────────────────────────
  sftp.on('FSTAT', (reqid, handle) => {
    const entry = handles.get(hKey(handle));
    if (!entry || entry.kind !== 'file') {
      return sftp.status(reqid, SFTPWrapper.STATUS_CODE.FAILURE);
    }
    try {
      const stat = fs.fstatSync(entry.handle.fd);
      sftp.attrs(reqid, statToAttrs(stat));
    } catch {
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.FAILURE);
    }
  });

  // ── OPENDIR ───────────────────────────────────────────────────────────────
  sftp.on('OPENDIR', (reqid, dirPath) => {
    let osPath: string;
    try { osPath = realPath(serverId, dirPath); }
    catch { return sftp.status(reqid, SFTPWrapper.STATUS_CODE.PERMISSION_DENIED); }

    try {
      const entries = fs.readdirSync(osPath, { withFileTypes: true });
      const handle = newHandle();
      handles.set(hKey(handle), {
        kind: 'dir',
        handle: { entries, index: 0 },
      });
      sftp.handle(reqid, handle);
    } catch {
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.NO_SUCH_FILE);
    }
  });

  // ── READDIR ───────────────────────────────────────────────────────────────
  sftp.on('READDIR', (reqid, handle) => {
    const entry = handles.get(hKey(handle));
    if (!entry || entry.kind !== 'dir') {
      return sftp.status(reqid, SFTPWrapper.STATUS_CODE.FAILURE);
    }

    const dir = entry.handle;
    if (dir.index >= dir.entries.length) {
      return sftp.status(reqid, SFTPWrapper.STATUS_CODE.EOF);
    }

    // Return up to 32 entries per READDIR call.
    const batch = dir.entries.slice(dir.index, dir.index + 32);
    dir.index += batch.length;

    const names = batch.map((dirent) => {
      const fullPath = path.join(
        serverDataRoot(serverId),
        dirent.name,
      );
      let attrs: ReturnType<typeof statToAttrs> = {
        mode: dirent.isDirectory() ? 0o040755 : 0o100644,
        uid: 0, gid: 0, size: 0,
        atime: 0, mtime: 0,
      };

      try {
        attrs = statToAttrs(fs.statSync(fullPath));
      } catch { /* best-effort */ }

      const mode = dirent.isDirectory() ? 'd' : '-';
      return {
        filename: dirent.name,
        longname: `${mode}rwxr-xr-x 1 arc arc ${attrs['size']} . ${dirent.name}`,
        attrs,
      };
    });

    sftp.name(reqid, names);
  });

  // ── REMOVE ────────────────────────────────────────────────────────────────
  sftp.on('REMOVE', (reqid, filename) => {
    let osPath: string;
    try { osPath = realPath(serverId, filename); }
    catch { return sftp.status(reqid, SFTPWrapper.STATUS_CODE.PERMISSION_DENIED); }

    try {
      fs.unlinkSync(osPath);
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.OK);
    } catch {
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.FAILURE);
    }
  });

  // ── RMDIR ─────────────────────────────────────────────────────────────────
  sftp.on('RMDIR', (reqid, dirPath) => {
    let osPath: string;
    try { osPath = realPath(serverId, dirPath); }
    catch { return sftp.status(reqid, SFTPWrapper.STATUS_CODE.PERMISSION_DENIED); }

    try {
      fs.rmdirSync(osPath, { recursive: true });
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.OK);
    } catch {
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.FAILURE);
    }
  });

  // ── MKDIR ─────────────────────────────────────────────────────────────────
  sftp.on('MKDIR', (reqid, dirPath, _attrs) => {
    let osPath: string;
    try { osPath = realPath(serverId, dirPath); }
    catch { return sftp.status(reqid, SFTPWrapper.STATUS_CODE.PERMISSION_DENIED); }

    try {
      fs.mkdirSync(osPath, { recursive: true });
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.OK);
    } catch {
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.FAILURE);
    }
  });

  // ── RENAME ────────────────────────────────────────────────────────────────
  sftp.on('RENAME', (reqid, oldPath, newPath) => {
    let oldOs: string, newOs: string;
    try {
      oldOs = realPath(serverId, oldPath);
      newOs = realPath(serverId, newPath);
    } catch {
      return sftp.status(reqid, SFTPWrapper.STATUS_CODE.PERMISSION_DENIED);
    }

    try {
      fs.renameSync(oldOs, newOs);
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.OK);
    } catch {
      sftp.status(reqid, SFTPWrapper.STATUS_CODE.FAILURE);
    }
  });

  // ── SETSTAT / FSETSTAT (no-op — accept silently) ─────────────────────────
  sftp.on('SETSTAT', (reqid) => sftp.status(reqid, SFTPWrapper.STATUS_CODE.OK));
  sftp.on('FSETSTAT', (reqid) => sftp.status(reqid, SFTPWrapper.STATUS_CODE.OK));

  // ── SYMLINK / READLINK ────────────────────────────────────────────────────
  sftp.on('SYMLINK', (reqid) =>
    sftp.status(reqid, SFTPWrapper.STATUS_CODE.OP_UNSUPPORTED),
  );
  sftp.on('READLINK', (reqid) =>
    sftp.status(reqid, SFTPWrapper.STATUS_CODE.OP_UNSUPPORTED),
  );

  // ── REALPATH ──────────────────────────────────────────────────────────────
  sftp.on('REALPATH', (reqid, reqPath) => {
    const normalised = path.posix.normalize('/' + reqPath);
    sftp.name(reqid, [
      { filename: normalised, longname: normalised, attrs: {} },
    ]);
  });
}

// ─── Public API: startSftpServer ─────────────────────────────────────────────

export function startSftpServer(): void {
  const hostKey = loadOrGenerateHostKey();

  const sshServer = new SshServer(
    { hostKeys: [hostKey] },
    (client: Connection) => {
      let authenticatedServerId: string | null = null;

      client.on('authentication', (ctx) => {
        // Only password auth is supported.
        if (ctx.method !== 'password') {
          return ctx.reject(['password']);
        }

        // Username = serverId, password = daemon token.
        const serverId = ctx.username;
        const password = (ctx as unknown as { password: string }).password;

        if (password !== config.daemonToken) {
          logger.warn(`SFTP: auth failed for user ${serverId}`);
          return ctx.reject();
        }

        // Ensure the server data directory exists.
        const dataRoot = serverDataRoot(serverId);
        if (!fs.existsSync(dataRoot)) {
          fs.mkdirSync(dataRoot, { recursive: true });
        }

        authenticatedServerId = serverId;
        logger.info(`SFTP: authenticated client for server ${serverId}`);
        ctx.accept();
      });

      client.on('ready', () => {
        client.on('session', (accept: () => Session) => {
          const session = accept();
          session.on('sftp', (accept: () => SFTPWrapper) => {
            const sftp = accept();

            if (!authenticatedServerId) {
              sftp.end();
              return;
            }

            handleSftpSession(authenticatedServerId, sftp);
          });
        });
      });

      client.on('error', (err: Error) => {
        logger.warn('SFTP client error', { err: err.message });
      });

      client.on('close', () => {
        logger.debug(`SFTP: client for ${authenticatedServerId ?? 'unknown'} disconnected`);
      });
    },
  );

  sshServer.on('error', (err: Error) => {
    logger.error('SFTP server error', { err: err.message });
  });

  sshServer.listen(config.sftpPort, '0.0.0.0', () => {
    logger.info(`SFTP server listening on port ${config.sftpPort}`);
  });
}

// ─── Helper for use inside handleSftpSession ──────────────────────────────────
function serverDataRoot(serverId: string): string {
  return path.join(config.dataDir, 'servers', serverId, 'data');
}
