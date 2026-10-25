/* ════════════════════════════════════════════════════════════════
   src/lib/utils.ts — Shared utility functions
════════════════════════════════════════════════════════════════ */

export type ClassValue =
  | string
  | number
  | bigint
  | boolean
  | undefined
  | null
  | ClassValue[];

/**
 * Merge Tailwind CSS class names safely.
 */
export function cn(...inputs: ClassValue[]): string {
  return inputs
    .flat(Infinity as 1)
    .filter((x): x is string | number => typeof x === 'string' || typeof x === 'number')
    .join(' ')
    .trim();
}

/** Format bytes to a human-readable string (KB / MB / GB) */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k    = 1024;
  const dm   = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i    = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/** Format seconds into a human-readable uptime string */
export function formatUptime(seconds: number): string {
  if (seconds < 60)   return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Generate initials from a name (up to 2 chars) */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** Truncate a string with ellipsis */
export function truncate(str: string, maxLen: number): string {
  return str.length <= maxLen ? str : `${str.slice(0, maxLen - 1)}…`;
}

/** Debounce a function */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Sleep for ms milliseconds */
export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Check if a JWT token is expired (client-side, no signature check) */
export function isTokenExpired(token: string): boolean {
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(atob(payload));
    return decoded.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

/**
 * Safely copy text to clipboard across all browser environments,
 * including non-secure HTTP contexts where navigator.clipboard is undefined.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // Modern navigator.clipboard (available on HTTPS and localhost)
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback for HTTP VPS IP access
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}
