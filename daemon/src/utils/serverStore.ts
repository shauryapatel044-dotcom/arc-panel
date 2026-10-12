/**
 * Arc Panel Daemon — Server Metadata Store
 *
 * Persists a simple JSON file at DATA_DIR/servers.json that maps
 * Arc Panel server IDs → { containerId, name, image, ... }.
 *
 * All read/write operations are synchronous to keep the logic simple
 * and avoid concurrency issues without adding a database dependency.
 */

import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { ServerMeta } from '../docker/DockerService';

const STORE_PATH = path.join(config.dataDir, 'servers.json');

function loadStore(): Record<string, ServerMeta> {
  if (!fs.existsSync(STORE_PATH)) return {};
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    return JSON.parse(raw) as Record<string, ServerMeta>;
  } catch (err) {
    logger.error('ServerStore: failed to parse servers.json', { err });
    return {};
  }
}

function saveStore(store: Record<string, ServerMeta>): void {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

export const serverStore = {
  getAll(): ServerMeta[] {
    return Object.values(loadStore());
  },

  get(id: string): ServerMeta | undefined {
    return loadStore()[id];
  },

  set(meta: ServerMeta): void {
    const store = loadStore();
    store[meta.id] = meta;
    saveStore(store);
  },

  delete(id: string): void {
    const store = loadStore();
    delete store[id];
    saveStore(store);
  },
};
