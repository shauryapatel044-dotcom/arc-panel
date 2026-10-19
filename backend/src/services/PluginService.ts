/**
 * src/services/PluginService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * 1-Click Mod & Plugin Manager for Arc Panel.
 * Supports Paper, Purpur, Spigot, Fabric, Forge, NeoForge, Bedrock servers.
 * Provides curated essential plugins/mods and Modrinth API search integration.
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import prisma from '../prisma';
import logger from '../logger';
import { ensureServerWorkspace } from '../routes/files';

export interface PluginItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: 'permissions' | 'economy' | 'management' | 'crossplay' | 'optimization' | 'security' | 'utility';
  author: string;
  iconUrl?: string;
  downloadUrl: string;
  targetDir: 'plugins' | 'mods';
  version?: string;
  source: 'curated' | 'modrinth';
}

const CURATED_PLUGINS: PluginItem[] = [
  {
    id: 'luckperms',
    name: 'LuckPerms',
    slug: 'luckperms',
    description: 'An advanced permissions plugin for Bukkit/Spigot/Paper servers with web editor.',
    category: 'permissions',
    author: 'Luck',
    iconUrl: 'https://cdn.modrinth.com/data/Vebnzrzj/icon.png',
    downloadUrl: 'https://download.luckperms.net/1560/bukkit/loader/LuckPerms-Bukkit-5.4.148.jar',
    targetDir: 'plugins',
    version: '5.4.148',
    source: 'curated',
  },
  {
    id: 'essentialsx',
    name: 'EssentialsX',
    slug: 'essentialsx',
    description: 'Essential server suite providing teleportation, kits, economy, spawns, and 100+ commands.',
    category: 'management',
    author: 'EssentialsX Team',
    iconUrl: 'https://cdn.modrinth.com/data/mOgUt4GM/icon.png',
    downloadUrl: 'https://github.com/EssentialsX/Essentials/releases/download/2.20.1/EssentialsX-2.20.1.jar',
    targetDir: 'plugins',
    version: '2.20.1',
    source: 'curated',
  },
  {
    id: 'vault',
    name: 'Vault',
    slug: 'vault',
    description: 'Universal permissions, chat, and economy bridge required by almost all economy plugins.',
    category: 'economy',
    author: 'MilkBowl',
    iconUrl: 'https://cdn.modrinth.com/data/n6d7uOXD/icon.png',
    downloadUrl: 'https://github.com/MilkBowl/Vault/releases/download/1.7.3/Vault.jar',
    targetDir: 'plugins',
    version: '1.7.3',
    source: 'curated',
  },
  {
    id: 'worldedit',
    name: 'WorldEdit',
    slug: 'worldedit',
    description: 'In-game Minecraft map editor with brushes, selections, copy-paste, and schematics.',
    category: 'utility',
    author: 'EngineHub',
    iconUrl: 'https://cdn.modrinth.com/data/1e2PtRevision/icon.png',
    downloadUrl: 'https://cdn.modrinth.com/data/1e2PtRevision/versions/k25Y3L0S/worldedit-bukkit-7.3.9.jar',
    targetDir: 'plugins',
    version: '7.3.9',
    source: 'curated',
  },
  {
    id: 'geyser-spigot',
    name: 'GeyserMC (Bedrock Bridge)',
    slug: 'geyser',
    description: 'Enables Minecraft Bedrock Edition (iOS, Android, Xbox, PS, Switch) players to join your Java server.',
    category: 'crossplay',
    author: 'GeyserMC',
    iconUrl: 'https://cdn.modrinth.com/data/w0EzAwFY/icon.png',
    downloadUrl: 'https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot',
    targetDir: 'plugins',
    version: 'latest',
    source: 'curated',
  },
  {
    id: 'floodgate',
    name: 'Floodgate',
    slug: 'floodgate',
    description: 'Allows Bedrock players to join via Geyser without needing a Java Edition account.',
    category: 'crossplay',
    author: 'GeyserMC',
    iconUrl: 'https://cdn.modrinth.com/data/bWrNNfkb/icon.png',
    downloadUrl: 'https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot',
    targetDir: 'plugins',
    version: 'latest',
    source: 'curated',
  },
  {
    id: 'viaversion',
    name: 'ViaVersion',
    slug: 'viaversion',
    description: 'Allows newer Minecraft client versions (e.g. 1.20, 1.21) to connect to older servers.',
    category: 'crossplay',
    author: 'ViaVersion Team',
    iconUrl: 'https://cdn.modrinth.com/data/P1OZGk5p/icon.png',
    downloadUrl: 'https://github.com/ViaVersion/ViaVersion/releases/download/5.2.1/ViaVersion-5.2.1.jar',
    targetDir: 'plugins',
    version: '5.2.1',
    source: 'curated',
  },
  {
    id: 'viabackwards',
    name: 'ViaBackwards',
    slug: 'viabackwards',
    description: 'Companion to ViaVersion: allows older client versions to connect to newer servers.',
    category: 'crossplay',
    author: 'ViaVersion Team',
    iconUrl: 'https://cdn.modrinth.com/data/kScb5z4e/icon.png',
    downloadUrl: 'https://github.com/ViaVersion/ViaBackwards/releases/download/5.2.1/ViaBackwards-5.2.1.jar',
    targetDir: 'plugins',
    version: '5.2.1',
    source: 'curated',
  },
  {
    id: 'coreprotect',
    name: 'CoreProtect',
    slug: 'coreprotect',
    description: 'Fast, efficient data logging and anti-griefing rollback tool for servers.',
    category: 'security',
    author: 'Intelli',
    iconUrl: 'https://cdn.modrinth.com/data/Lu3KuztN/icon.png',
    downloadUrl: 'https://cdn.modrinth.com/data/Lu3KuztN/versions/zZc1yX1q/CoreProtect-22.4.jar',
    targetDir: 'plugins',
    version: '22.4',
    source: 'curated',
  },
  {
    id: 'chunky',
    name: 'Chunky',
    slug: 'chunky',
    description: 'Pre-generates chunks rapidly to completely eliminate chunk generation lag while players explore.',
    category: 'optimization',
    author: 'pop4959',
    iconUrl: 'https://cdn.modrinth.com/data/fALzjamp/icon.png',
    downloadUrl: 'https://cdn.modrinth.com/data/fALzjamp/versions/r30Qo8j5/Chunky-1.4.28.jar',
    targetDir: 'plugins',
    version: '1.4.28',
    source: 'curated',
  },
  {
    id: 'skinsrestorer',
    name: 'SkinsRestorer',
    slug: 'skinsrestorer',
    description: 'Restores skins for offline-mode/cracked and proxy servers with /skin command.',
    category: 'utility',
    author: 'xkniraj',
    iconUrl: 'https://cdn.modrinth.com/data/B9h5kG4a/icon.png',
    downloadUrl: 'https://github.com/SkinsRestorer/SkinsRestorer/releases/download/15.4.3/SkinsRestorer.jar',
    targetDir: 'plugins',
    version: '15.4.3',
    source: 'curated',
  },
  {
    id: 'multiverse-core',
    name: 'Multiverse-Core',
    slug: 'multiverse-core',
    description: 'Creation and management of multiple custom worlds (creative, survival, nether, flat).',
    category: 'management',
    author: 'Multiverse',
    iconUrl: 'https://cdn.modrinth.com/data/k0e998U0/icon.png',
    downloadUrl: 'https://github.com/Multiverse/Multiverse-Core/releases/download/4.3.14/multiverse-core-4.3.14.jar',
    targetDir: 'plugins',
    version: '4.3.14',
    source: 'curated',
  },
  {
    id: 'spark',
    name: 'Spark Profiler',
    slug: 'spark',
    description: 'Lightweight CPU, memory, TPS, and tick rate profiler with browser-based flame graph analysis.',
    category: 'optimization',
    author: 'lucko',
    iconUrl: 'https://cdn.modrinth.com/data/l6YH9Als/icon.png',
    downloadUrl: 'https://sparkcdn.lucko.me/spark-1.10.119-bukkit.jar',
    targetDir: 'plugins',
    version: '1.10.119',
    source: 'curated',
  },
  // Fabric / Forge Optimization Mods
  {
    id: 'lithium',
    name: 'Lithium (Fabric)',
    slug: 'lithium',
    description: 'General-purpose optimization mod for Fabric servers improving chunk loading, entity AI, and physics.',
    category: 'optimization',
    author: 'CaffeineMC',
    iconUrl: 'https://cdn.modrinth.com/data/gvQqBUqZ/icon.png',
    downloadUrl: 'https://cdn.modrinth.com/data/gvQqBUqZ/versions/lW2VqVvL/lithium-fabric-0.14.7%2Bmc1.21.1.jar',
    targetDir: 'mods',
    version: '0.14.7',
    source: 'curated',
  },
  {
    id: 'ferritecore',
    name: 'FerriteCore (Fabric & Forge)',
    slug: 'ferritecore',
    description: 'Drastically reduces memory (RAM) usage of modern Minecraft servers and modpacks.',
    category: 'optimization',
    author: 'malte0811',
    iconUrl: 'https://cdn.modrinth.com/data/uXXizFIs/icon.png',
    downloadUrl: 'https://cdn.modrinth.com/data/uXXizFIs/versions/O3j9mK0B/ferritecore-7.0.0-fabric.jar',
    targetDir: 'mods',
    version: '7.0.0',
    source: 'curated',
  },
  {
    id: 'fabric-api',
    name: 'Fabric API',
    slug: 'fabric-api',
    description: 'Essential core library required by almost all Fabric server mods and modpacks.',
    category: 'utility',
    author: 'FabricMC',
    iconUrl: 'https://cdn.modrinth.com/data/P7dR8mSH/icon.png',
    downloadUrl: 'https://cdn.modrinth.com/data/P7dR8mSH/versions/939y27v7/fabric-api-0.108.0%2B1.21.1.jar',
    targetDir: 'mods',
    version: '0.108.0',
    source: 'curated',
  },
];

class PluginService {
  /**
   * Return curated catalog relevant to the server egg.
   */
  async getCatalog(serverId: string): Promise<PluginItem[]> {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { image: true, dockerImage: true },
    });

    const isFabric =
      server?.image?.toLowerCase().includes('fabric') ||
      server?.dockerImage?.toLowerCase().includes('fabric');

    const isForge =
      server?.image?.toLowerCase().includes('forge') ||
      server?.dockerImage?.toLowerCase().includes('forge');

    if (isFabric || isForge) {
      return CURATED_PLUGINS.filter((p) => p.targetDir === 'mods' || p.category === 'optimization');
    }

    return CURATED_PLUGINS;
  }

  /**
   * Search Modrinth for plugins / mods.
   */
  async searchModrinth(query: string, targetType: 'plugin' | 'mod' = 'plugin'): Promise<PluginItem[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    try {
      const facet = targetType === 'mod' ? 'project_type:mod' : 'project_type:plugin';
      const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(
        query.trim()
      )}&limit=15&facets=[["${facet}"]]`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'ArcPanel/1.0.0 (contact@arcpanel.local)',
        },
        timeout: 6000,
      });

      const hits = response.data?.hits || [];
      return hits.map((hit: any) => ({
        id: hit.project_id,
        name: hit.title,
        slug: hit.slug,
        description: hit.description || 'No description provided.',
        category: 'utility' as const,
        author: hit.author || 'Modrinth Creator',
        iconUrl: hit.icon_url || undefined,
        downloadUrl: `https://modrinth.com/${targetType}/${hit.slug}`,
        targetDir: targetType === 'mod' ? 'mods' : 'plugins',
        source: 'modrinth' as const,
      }));
    } catch (err: any) {
      logger.warn('Modrinth search failed', { err: err.message, query });
      return [];
    }
  }

  /**
   * List installed .jar files in server plugins/ or mods/ directory.
   */
  async getInstalled(serverId: string): Promise<Array<{ filename: string; size: number; modifiedAt: string; directory: string }>> {
    const rootDir = await ensureServerWorkspace(serverId);
    const results: Array<{ filename: string; size: number; modifiedAt: string; directory: string }> = [];

    for (const dirName of ['plugins', 'mods']) {
      const targetDir = path.join(rootDir, dirName);
      if (fs.existsSync(targetDir) && fs.statSync(targetDir).isDirectory()) {
        const files = fs.readdirSync(targetDir, { withFileTypes: true });
        for (const f of files) {
          if (f.isFile() && f.name.endsWith('.jar')) {
            const stat = fs.statSync(path.join(targetDir, f.name));
            results.push({
              filename: f.name,
              size: stat.size,
              modifiedAt: stat.mtime.toISOString(),
              directory: dirName,
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Install a plugin or mod by downloading the .jar file to the server workspace.
   */
  async installPlugin(serverId: string, params: { downloadUrl: string; filename?: string; targetDir?: 'plugins' | 'mods' }) {
    const rootDir = await ensureServerWorkspace(serverId);
    const targetDirName = params.targetDir === 'mods' ? 'mods' : 'plugins';
    const destDir = path.join(rootDir, targetDirName);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    let resolvedFilename = params.filename || '';

    // If no filename supplied or is a Modrinth page URL, resolve direct download URL
    let downloadUrl = params.downloadUrl;

    if (downloadUrl.includes('modrinth.com/plugin/') || downloadUrl.includes('modrinth.com/mod/')) {
      const slugMatch = downloadUrl.match(/modrinth\.com\/(?:plugin|mod)\/([^/?#]+)/);
      if (slugMatch) {
        const slug = slugMatch[1];
        try {
          const vRes = await axios.get(`https://api.modrinth.com/v2/project/${slug}/version`, {
            headers: { 'User-Agent': 'ArcPanel/1.0.0' },
            timeout: 6000,
          });
          const latest = vRes.data?.[0];
          const primaryFile = latest?.files?.find((f: any) => f.primary) || latest?.files?.[0];
          if (primaryFile?.url) {
            downloadUrl = primaryFile.url;
            if (!resolvedFilename) resolvedFilename = primaryFile.filename;
          }
        } catch (e: any) {
          logger.warn('Failed to resolve Modrinth project version', { error: e.message });
        }
      }
    }

    if (!resolvedFilename) {
      const urlParts = downloadUrl.split('?')[0].split('/');
      resolvedFilename = urlParts[urlParts.length - 1] || 'plugin.jar';
    }

    if (!resolvedFilename.endsWith('.jar')) {
      resolvedFilename = `${resolvedFilename.replace(/[^a-zA-Z0-9._-]/g, '')}.jar`;
    }

    const destPath = path.join(destDir, resolvedFilename);

    // Stream download directly to file
    logger.info(`Downloading plugin for server ${serverId}: ${downloadUrl} -> ${destPath}`);
    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'ArcPanel/1.0.0 (Minecraft Server Manager)',
      },
    });

    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);

    return new Promise<{ filename: string; directory: string; size: number }>((resolve, reject) => {
      writer.on('finish', () => {
        try {
          const stat = fs.statSync(destPath);
          resolve({
            filename: resolvedFilename,
            directory: targetDirName,
            size: stat.size,
          });
        } catch (err) {
          resolve({
            filename: resolvedFilename,
            directory: targetDirName,
            size: 0,
          });
        }
      });
      writer.on('error', reject);
    });
  }

  /**
   * Uninstall (delete) a plugin or mod .jar file.
   */
  async uninstallPlugin(serverId: string, filename: string, targetDir: 'plugins' | 'mods' = 'plugins') {
    const rootDir = await ensureServerWorkspace(serverId);
    const cleanedFilename = path.basename(filename);

    if (cleanedFilename === 'server.jar') {
      throw new Error('server.jar is protected and cannot be deleted via the plugin manager.');
    }

    const destPath = path.join(rootDir, targetDir, cleanedFilename);

    if (!fs.existsSync(destPath)) {
      throw new Error(`File '${cleanedFilename}' not found in /${targetDir}.`);
    }

    fs.unlinkSync(destPath);
    return { success: true, removed: cleanedFilename };
  }
}

export const pluginService = new PluginService();
