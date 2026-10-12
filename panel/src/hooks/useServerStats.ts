/* ════════════════════════════════════════════════════════════════
   src/hooks/useServerStats.ts
   WebSocket hook for real-time server stats via socket.io
════════════════════════════════════════════════════════════════ */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ServerStats, ServerStatus } from '@/types';

const DAEMON_WS_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** How long to wait before attempting a reconnect (ms) */
const RECONNECT_DELAY_MS = 3_000;
/** Max reconnect attempts before giving up */
const MAX_RECONNECTS     = 10;

/* ── Return type ─────────────────────────────────────────────────── */
export interface UseServerStatsReturn {
  /** Current server status string */
  status:      ServerStatus;
  /** CPU usage percentage (0–100+) */
  cpuPct:      number;
  /** RAM used in MB */
  ramMB:       number;
  /** Disk used in MB */
  diskMB:      number;
  /** Network receive bytes/s */
  netRxBps:    number;
  /** Network transmit bytes/s */
  netTxBps:    number;
  /** Uptime in seconds */
  uptimeSecs:  number;
  /** Rolling array of CPU data points for the live chart */
  cpuHistory:  number[];
  /** Rolling array of RAM data points */
  ramHistory:  number[];
  /** Rolling array of disk data points */
  diskHistory: number[];
  /** Whether the WebSocket is currently connected */
  connected:   boolean;
  /** True while initial connection is pending */
  connecting:  boolean;
  /** Last error message if any */
  error:       string | null;
  /** Manually trigger reconnect */
  reconnect:   () => void;
}

/** Max data points to keep in history arrays */
const MAX_HISTORY = 60;

/* ── Hook ────────────────────────────────────────────────────────── */
export function useServerStats(
  serverId: string,
  token: string | null,
): UseServerStatsReturn {
  const socketRef       = useRef<Socket | null>(null);
  const reconnectCount  = useRef(0);
  const reconnectTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [connected,   setConnected]   = useState(false);
  const [connecting,  setConnecting]  = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [stats, setStats] = useState<Omit<ServerStats, 'serverId' | 'timestamp'>>({
    status:     'running',
    cpuPct:     18.4,
    ramMB:      1420,
    diskMB:     3420,
    netRxBps:   98304,
    netTxBps:   65536,
    uptimeSecs: 120,
  });

  /* Rolling history arrays */
  const [cpuHistory,  setCpuHistory]  = useState<number[]>([16.2, 18.4, 21.0, 19.5]);
  const [ramHistory,  setRamHistory]  = useState<number[]>([1400, 1412, 1425, 1420]);
  const [diskHistory, setDiskHistory] = useState<number[]>([3420, 3420, 3420, 3420]);

  /** Append a value to a capped history array */
  const pushHistory = (
    setter: React.Dispatch<React.SetStateAction<number[]>>,
    value: number,
  ) =>
    setter((prev) => {
      const next = [...prev, value];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });

  /* ── Connect function ──────────────────────────────────────────── */
  const connect = useCallback(() => {
    let resolvedToken =
      token ||
      (typeof window !== 'undefined'
        ? window.localStorage.getItem('arc_access_token')
        : null);

    if (!resolvedToken && typeof window !== 'undefined') {
      try {
        const rawAuth = window.localStorage.getItem('arc-auth');
        if (rawAuth) {
          resolvedToken = JSON.parse(rawAuth)?.state?.accessToken ?? null;
        }
      } catch {
        // Ignore parse error
      }
    }

    /* Clean up any existing socket */
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }

    setConnecting(true);
    setError(null);

    const socket = io(DAEMON_WS_URL, {
      transports: ['websocket', 'polling'],
      auth: { token: resolvedToken || 'local-session', serverId },
      reconnection: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      reconnectCount.current = 0;
      setConnected(true);
      setConnecting(false);
      setError(null);
      /* Subscribe to this server's stats stream */
      socket.emit('subscribe', { serverId });
    });

    socket.on('stats', (payload: ServerStats) => {
      if (payload.serverId !== serverId) return;
      setStats({
        status:     payload.status,
        cpuPct:     payload.cpuPct,
        ramMB:      payload.ramMB,
        diskMB:     payload.diskMB,
        netRxBps:   payload.netRxBps,
        netTxBps:   payload.netTxBps,
        uptimeSecs: payload.uptimeSecs,
      });
      pushHistory(setCpuHistory,  payload.cpuPct);
      pushHistory(setRamHistory,  payload.ramMB);
      pushHistory(setDiskHistory, payload.diskMB);
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      if (reason !== 'io client disconnect') {
        scheduleReconnect();
      }
    });

    socket.on('connect_error', (err) => {
      setConnected(false);
      setConnecting(false);
      setError(`Connection error: ${err.message}`);
      scheduleReconnect();
    });
  }, [serverId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Reconnect scheduler ───────────────────────────────────────── */
  const scheduleReconnect = useCallback(() => {
    if (reconnectCount.current >= MAX_RECONNECTS) {
      setError(`Max reconnect attempts (${MAX_RECONNECTS}) reached.`);
      return;
    }
    reconnectCount.current += 1;
    const delay = RECONNECT_DELAY_MS * Math.min(reconnectCount.current, 5);
    reconnectTimer.current = setTimeout(() => connect(), delay);
  }, [connect]);

  /* ── Mount / serverId or token change ──────────────────────────── */
  useEffect(() => {
    if (!serverId) return;
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
    };
  }, [serverId, token, connect]);

  return {
    ...stats,
    cpuHistory,
    ramHistory,
    diskHistory,
    connected,
    connecting,
    error,
    reconnect: connect,
  };
}
