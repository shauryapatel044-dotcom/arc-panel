/* ════════════════════════════════════════════════════════════════
   src/components/dashboard/ServerConsole.tsx
   Real-time WebSocket terminal in an antigravity glass housing
   Powered by xterm.js + Socket.IO relay to the Arc Daemon
════════════════════════════════════════════════════════════════ */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Terminal as TerminalIcon,
  Send,
  Trash2,
  Download,
  Wifi,
  WifiOff,
  ChevronRight,
} from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { cn } from '@/lib/utils';

function getSocketBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${window.location.hostname}:3001`;
  }
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
}

const API_BASE_URL = getSocketBaseUrl();

interface ServerConsoleProps {
  serverId: string;
  serverName?: string;
  token: string | null;
  className?: string;
}

export default function ServerConsole({
  serverId,
  serverName = 'Server',
  token,
  className,
}: ServerConsoleProps) {
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<import('xterm').Terminal | null>(null);
  const fitAddonRef = useRef<import('xterm-addon-fit').FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const logBufferRef = useRef<string[]>([]);
  const serverNameRef = useRef(serverName);
  const tokenRef = useRef(token);

  serverNameRef.current = serverName;
  tokenRef.current = token;

  const [connected, setConnected] = useState(false);
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  /* ── Write line helper ─────────────────────────────────────────── */
  const writeToTerminal = useCallback((text: string) => {
    logBufferRef.current.push(text);
    if (logBufferRef.current.length > 2000) {
      logBufferRef.current.shift();
    }
    xtermRef.current?.write(text);
  }, []);

  /* ── Initialize xterm.js + Socket.IO stream ────────────────────── */
  useEffect(() => {
    let isMounted = true;
    let resizeObserver: ResizeObserver | null = null;

    async function initTerminal() {
      if (!terminalContainerRef.current) return;

      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('xterm'),
        import('xterm-addon-fit'),
      ]);

      if (!isMounted || !terminalContainerRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'bar',
        fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.35,
        scrollback: 5000,
        convertEol: true,
        theme: {
          background: 'rgba(6, 10, 20, 0.0)',
          foreground: '#e2e8f0',
          cursor: '#00ccff',
          cursorAccent: '#060a14',
          selectionBackground: 'rgba(0, 204, 255, 0.25)',
          black: '#0f172a',
          blue: '#4d79ff',
          cyan: '#00ccff',
          green: '#2dd4bf',
          magenta: '#935cff',
          red: '#fb8c3a', // Strict NO-RED rule: map ANSI red to deep amber/orange
          white: '#f8fafc',
          yellow: '#fbbf24',
          brightBlack: '#475569',
          brightBlue: '#60a5fa',
          brightCyan: '#22d3ee',
          brightGreen: '#34d399',
          brightMagenta: '#a78bfa',
          brightRed: '#fdba74', // Amber highlight instead of red
          brightWhite: '#ffffff',
          brightYellow: '#fde047',
        },
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalContainerRef.current);
      fitAddon.fit();

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      term.writeln(
        '\x1b[38;2;0;204;255m╭──────────────────────────────────────────────────────────────╮\x1b[0m',
      );
      term.writeln(
        `\x1b[38;2;0;204;255m│\x1b[0m  \x1b[1m⚡ ARC PANEL LIVE CONSOLE\x1b[0m — \x1b[38;2;147;92;255m${serverNameRef.current}\x1b[0m`,
      );
      term.writeln(
        '\x1b[38;2;0;204;255m╰──────────────────────────────────────────────────────────────╯\x1b[0m',
      );

      // Interactive line buffer for direct keyboard typing inside xterm
      let termInputBuffer = '';
      term.onData((data) => {
        if (data === '\r' || data === '\n') {
          term.write('\r\n');
          const cmdToSend = termInputBuffer.trim();
          termInputBuffer = '';
          if (cmdToSend) {
            if (cmdToSend === 'clear' || cmdToSend === 'cls') {
              term.clear();
              return;
            }
            socketRef.current?.emit('console:input', { command: cmdToSend });
          }
        } else if (data === '\x7f' || data === '\b') {
          // Backspace
          if (termInputBuffer.length > 0) {
            termInputBuffer = termInputBuffer.slice(0, -1);
            term.write('\b \b');
          }
        } else if (data >= ' ' && data <= '~') {
          termInputBuffer += data;
          term.write(data);
        }
      });

      resizeObserver = new ResizeObserver(() => {
        try {
          if (
            terminalContainerRef.current &&
            terminalContainerRef.current.clientWidth > 0
          ) {
            fitAddon.fit();
            if (socketRef.current?.connected) {
              socketRef.current.emit('console:resize', {
                cols: term.cols,
                rows: term.rows,
              });
            }
          }
        } catch {
          // Ignore fit errors when hidden
        }
      });

      resizeObserver.observe(terminalContainerRef.current);

      // Connect Socket.IO to backend console proxy
      let resolvedToken =
        tokenRef.current ||
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

      const socket = io(API_BASE_URL, {
        transports: ['websocket', 'polling'],
        auth: { token: resolvedToken || 'local-session', serverId },
        reconnection: true,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        if (!isMounted) return;
        setConnected(true);
        socket.emit('subscribe', { serverId });
      });

      socket.on(
        'console:output',
        (payload: { type?: string; data: string }) => {
          if (!isMounted) return;
          writeToTerminal(payload.data);
        },
      );

      socket.on('console:error', (payload: { message: string }) => {
        if (!isMounted) return;
        writeToTerminal(
          `\r\n\x1b[38;2;251;140;58m[Daemon Notice] ${payload.message}\x1b[0m\r\n`,
        );
      });

      socket.on('disconnect', () => {
        if (!isMounted) return;
        setConnected(false);
      });
    }

    const handlePowerEvent = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          serverId: string;
          action: string;
          serverName: string;
          dockerImage: string;
        }>
      ).detail;
      if (!detail || detail.serverId !== serverId) return;
      if (!socketRef.current?.connected) {
        writeToTerminal(
          `\r\n\x1b[38;2;0;204;255m[Arc Daemon]\x1b[0m Dispatching power signal: \x1b[1;36m${detail.action.toUpperCase()}\x1b[0m -> \x1b[1m${detail.serverName}\x1b[0m\r\n`,
        );
      }
    };

    window.addEventListener('arc:power-event', handlePowerEvent);
    void initTerminal();

    return () => {
      isMounted = false;
      window.removeEventListener('arc:power-event', handlePowerEvent);
      resizeObserver?.disconnect();
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      xtermRef.current?.dispose();
    };
  }, [serverId, writeToTerminal]);

  /* ── Send command from input bar ───────────────────────────────── */
  const handleSendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = command.trim();
    if (!trimmed) return;

    if (socketRef.current?.connected) {
      socketRef.current.emit('console:input', { data: `${trimmed}\n` });
    }
    writeToTerminal(`\x1b[38;2;0;204;255m❯\x1b[0m ${trimmed}\r\n`);

    setCommandHistory((prev) => [trimmed, ...prev.slice(0, 49)]);
    setHistoryIndex(-1);
    setCommand('');
  };

  /* ── Up/Down arrow history navigation ──────────────────────────── */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextIdx = Math.min(historyIndex + 1, commandHistory.length - 1);
      if (nextIdx >= 0 && commandHistory[nextIdx]) {
        setHistoryIndex(nextIdx);
        setCommand(commandHistory[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = historyIndex - 1;
      if (nextIdx >= 0 && commandHistory[nextIdx]) {
        setHistoryIndex(nextIdx);
        setCommand(commandHistory[nextIdx]);
      } else {
        setHistoryIndex(-1);
        setCommand('');
      }
    }
  };

  /* ── Clear & Download logs ─────────────────────────────────────── */
  const handleClear = () => {
    logBufferRef.current = [];
    xtermRef.current?.clear();
  };

  const handleDownloadLogs = () => {
    const content = logBufferRef.current.join('');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${serverName.toLowerCase().replace(/\s+/g, '-')}-console.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <GlassCard
      hoverable={false}
      accentColor="cyan"
      padding="none"
      className={cn('flex flex-col overflow-hidden', className)}
    >
      {/* Top Console Housing Bar */}
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-white/[0.03] px-5 py-3">
        <div className="flex items-center gap-3">
          {/* Decorative window orbs (Cyan, Blue, Violet — NO Red) */}
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-arc-cyan-400/80 shadow-[0_0_8px_rgba(0,204,255,0.6)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-arc-blue-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-arc-violet-400/80" />
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2 text-xs font-medium text-white/80">
            <TerminalIcon className="h-4 w-4 text-arc-cyan-400" />
            <span className="font-mono text-white/90">
              process@{serverName.toLowerCase().replace(/\s+/g, '-')}
            </span>
            <span className="rounded-md border border-arc-cyan-400/25 bg-arc-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-arc-cyan-300">
              Isolated Stdin • No VPS Shell
            </span>
          </div>
        </div>

        {/* Status & Quick Actions */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
              connected
                ? 'border-arc-cyan-400/30 bg-arc-cyan-400/10 text-arc-cyan-400'
                : 'border-white/10 bg-white/5 text-white/45',
            )}
          >
            {connected ? (
              <>
                <Wifi className="h-3 w-3" /> Live Stream
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" /> Offline
              </>
            )}
          </span>

          <GlassButton
            variant="ghost"
            size="xs"
            onClick={handleDownloadLogs}
            leftIcon={<Download className="h-3.5 w-3.5" />}
            title="Download console logs"
          >
            Logs
          </GlassButton>

          <GlassButton
            variant="ghost"
            size="xs"
            onClick={handleClear}
            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
            title="Clear terminal output"
          >
            Clear
          </GlassButton>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="relative h-[420px] w-full bg-[#050811]/85 px-4 py-3 backdrop-blur-2xl">
        <div ref={terminalContainerRef} className="h-full w-full" />
      </div>

      {/* Command Input Bar */}
      <form
        onSubmit={handleSendCommand}
        className="flex items-center gap-3 border-t border-white/[0.08] bg-white/[0.03] px-4 py-2.5"
      >
        <ChevronRight className="h-4 w-4 shrink-0 text-arc-cyan-400" />
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a server command and press Enter (e.g. help, say Hello, list)..."
          className="w-full bg-transparent font-mono text-sm text-white/90 placeholder:text-white/30 focus:outline-none"
        />
        <GlassButton
          type="submit"
          variant="primary"
          size="sm"
          leftIcon={<Send className="h-3.5 w-3.5" />}
        >
          Send
        </GlassButton>
      </form>
    </GlassCard>
  );
}
