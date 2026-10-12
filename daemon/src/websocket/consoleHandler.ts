/**
 * Arc Panel Daemon — WebSocket Console Handler
 *
 * Handles upgrades for: /ws/servers/:id/console?token=<DAEMON_TOKEN>
 *
 * Protocol:
 *  • Server → Client  : { type: "stdout"|"stderr", data: "<base64>" }
 *                       { type: "status", status: "connected"|"disconnected" }
 *                       { type: "error", message: "..." }
 *  • Client → Server  : { type: "input", data: "<string>" }  — stdin to container
 *                       { type: "resize", cols: N, rows: N }  — terminal resize
 *
 * Implementation notes:
 *  - Logs are streamed via container.logs({ follow: true, ... }) which muxes
 *    stdout+stderr into a single multiplexed stream.  We demux using the
 *    Docker stream header (8-byte prefix: [stream_type, 0, 0, 0, size...]).
 *  - For interactive input we open a separate exec session with a TTY.
 *  - When the client disconnects we cleanly detach from both streams.
 */

import http from 'http';
import WebSocket from 'ws';
import { Duplex } from 'stream';
import { verifyToken } from '../middleware/tokenAuth';
import { serverStore } from '../utils/serverStore';
import { dockerService } from '../docker/DockerService';
import { logger } from '../utils/logger';

// ── Docker multiplexed-stream demuxer ─────────────────────────────────────────
// Docker log streams (non-TTY) prefix each chunk with an 8-byte header:
//   Byte 0: stream type  1=stdout  2=stderr
//   Bytes 1-3: padding (0x00)
//   Bytes 4-7: uint32 BE — payload length
function demuxDockerStream(
  rawChunk: Buffer,
  onStdout: (data: Buffer) => void,
  onStderr: (data: Buffer) => void,
): void {
  let offset = 0;
  while (offset < rawChunk.length) {
    if (rawChunk.length - offset < 8) break; // incomplete header
    const streamType = rawChunk[offset];
    const payloadLength = rawChunk.readUInt32BE(offset + 4);
    offset += 8;
    if (rawChunk.length - offset < payloadLength) break; // incomplete payload

    const payload = rawChunk.slice(offset, offset + payloadLength);
    offset += payloadLength;

    if (streamType === 1) onStdout(payload);
    else if (streamType === 2) onStderr(payload);
  }
}

// ── Parse :id from URL ─────────────────────────────────────────────────────
// URL format: /ws/servers/<id>/console
function parseServerId(url: string): string | null {
  const match = url.match(/^\/ws\/servers\/([^/]+)\/console/);
  return match ? match[1] : null;
}

// ── Parse token from query string ─────────────────────────────────────────
function parseToken(url: string): string | undefined {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return undefined;
  const params = new URLSearchParams(url.slice(qIndex + 1));
  return params.get('token') ?? undefined;
}

// ── Main export — called from the HTTP upgrade handler in index.ts ─────────
export function handleConsoleUpgrade(
  ws: WebSocket,
  request: http.IncomingMessage,
): void {
  const url = request.url ?? '';

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = parseToken(url);
  if (!verifyToken(token)) {
    ws.close(1008, 'Unauthorized');
    logger.warn(`WS console: unauthorized connection attempt from ${request.socket.remoteAddress}`);
    return;
  }

  // ── Server lookup ─────────────────────────────────────────────────────────
  const serverId = parseServerId(url);
  if (!serverId) {
    ws.close(1008, 'Invalid URL');
    return;
  }

  const meta = serverStore.get(serverId);
  if (!meta) {
    ws.close(1011, `Server ${serverId} not found`);
    return;
  }

  logger.info(`WS console: client connected for server ${serverId} (${request.socket.remoteAddress})`);

  // ── Helper: send typed JSON frames to the client ──────────────────────────
  function send(frame: Record<string, unknown>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame));
    }
  }

  // Track whether we're cleaning up to prevent duplicate teardown calls.
  let cleaningUp = false;
  let logStream: NodeJS.ReadableStream | null = null;
  let execStream: Duplex | null = null;

  // ── Attach to container log stream ────────────────────────────────────────
  async function attachLogs(): Promise<void> {
    try {
      const container = dockerService.getContainer(meta.containerId);

      // Inspect to determine if container uses TTY (affects stream framing).
      const info = await container.inspect();
      const hasTty = info.Config.Tty;

      const stream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        // Start from 100 lines of history so the client gets recent context.
        tail: 100,
      });

      logStream = stream as NodeJS.ReadableStream;

      logStream.on('data', (chunk: Buffer) => {
        if (hasTty) {
          // TTY mode — no mux header, raw bytes.
          send({ type: 'stdout', data: chunk.toString('utf-8') });
        } else {
          // Multiplexed stream — demux using Docker 8-byte header protocol.
          demuxDockerStream(
            chunk,
            (data) => send({ type: 'stdout', data: data.toString('utf-8') }),
            (data) => send({ type: 'stderr', data: data.toString('utf-8') }),
          );
        }
      });

      logStream.on('error', (err: Error) => {
        logger.error(`WS log stream error for ${serverId}`, { err });
        send({ type: 'error', message: err.message });
      });

      logStream.on('end', () => {
        send({ type: 'status', status: 'disconnected' });
      });

      send({ type: 'status', status: 'connected' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`WS: failed to attach logs for ${serverId}`, { err });
      send({ type: 'error', message: `Failed to attach: ${msg}` });
    }
  }

  // ── Attach to container PID 1 stdin ONLY (NO /bin/sh or VPS shell access) ──
  async function openStdinSession(): Promise<void> {
    try {
      const container = dockerService.getContainer(meta.containerId);
      const stream = await container.attach({
        stream: true,
        stdin: true,
        stdout: false,
        stderr: false,
      });
      execStream = stream as unknown as Duplex;

      execStream.on('error', (err: Error) => {
        logger.warn(`WS stdin stream error for ${serverId}`, { err });
      });
    } catch (err) {
      logger.warn(`WS: could not attach stdin for ${serverId}`, {
        err: (err as Error).message,
      });
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  function cleanup(): void {
    if (cleaningUp) return;
    cleaningUp = true;

    logger.info(`WS console: client disconnected for server ${serverId}`);

    try {
      if (logStream) {
        (logStream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
        logStream = null;
      }
    } catch { /* ignore */ }

    try {
      if (execStream) {
        execStream.destroy();
        execStream = null;
      }
    } catch { /* ignore */ }
  }

  const BLOCKED_OS_CMD = /^(?:\/bin\/|sh\b|bash\b|zsh\b|sudo\b|su\b|apt\b|apt-get\b|yum\b|dnf\b|rm\b|mv\b|cp\b|chmod\b|chown\b|ls\b|dir\b|cat\b|pwd\b|cd\b|curl\b|wget\b|ssh\b|scp\b|systemctl\b|service\b|kill\b|pkill\b|top\b|htop\b|ps\b|ifconfig\b|ip\b|ufw\b|iptables\b|crontab\b|export\b|env\b|uname\b|whoami\b|id\b)/i;

  // ── WebSocket event handlers ───────────────────────────────────────────────
  ws.on('message', (raw: WebSocket.RawData) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        type: string;
        data?: string;
        cols?: number;
        rows?: number;
      };

      if (msg.type === 'input' && msg.data) {
        const trimmed = msg.data.trim();
        if (
          BLOCKED_OS_CMD.test(trimmed) ||
          /[;&|`$]/.test(trimmed)
        ) {
          send({
            type: 'error',
            message:
              'Security Policy: Direct VPS / OS shell commands are strictly disabled in the server console.',
          });
          return;
        }
        if (execStream && !execStream.destroyed) {
          execStream.write(msg.data);
        }
      }
    } catch (err) {
      logger.warn(`WS: invalid message from client for ${serverId}`, { err });
    }
  });

  ws.on('close', cleanup);
  ws.on('error', (err: Error) => {
    logger.warn(`WS error for ${serverId}`, { err });
    cleanup();
  });

  // ── Start both streams ────────────────────────────────────────────────────
  void attachLogs();
  void openStdinSession();
}
