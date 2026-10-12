/**
 * Arc Panel Daemon — Docker Service (Singleton)
 *
 * Wraps dockerode and provides a clean, typed interface for all Docker
 * operations the daemon needs.  Import `dockerService` (the singleton
 * instance) everywhere — never instantiate DockerService directly.
 */

import Dockerode from 'dockerode';
import path from 'path';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContainerCreateConfig {
  /** Arc Panel server ID (used as Docker label for tracking) */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Docker image name (or egg key that gets mapped below) */
  image: string;
  /** Memory limit in MiB */
  memoryMB: number;
  /** CPU shares (relative weight, default 1024) */
  cpuShares: number;
  /** Port bindings: [{ host: 25565, container: 25565 }] */
  ports: Array<{ host: number; container: number }>;
  /** Environment variables */
  env: Record<string, string>;
  /** Override the image default CMD */
  startCmd?: string;
}

export interface ParsedStats {
  cpuPercent: number;
  memoryMB: number;
  memoryLimitMB: number;
  networkRxMB: number;
  networkTxMB: number;
  status: string;
}

export interface ServerMeta {
  id: string;
  name: string;
  containerId: string;
  image: string;
  createdAt: string;
}

// ─── Egg → Docker image mapping ───────────────────────────────────────────────

const EGG_IMAGE_MAP: Record<string, string> = {
  python:               'python:3.12-slim',
  nodejs:               'node:20-alpine',
  'minecraft-java':     'itzg/minecraft-server:latest',
  'minecraft-paper':    'itzg/minecraft-server:latest',
  'minecraft-fabric':   'itzg/minecraft-server:latest',
  'minecraft-forge':    'itzg/minecraft-server:latest',
  'minecraft-neoforge': 'itzg/minecraft-server:latest',
  'minecraft-purpur':   'itzg/minecraft-server:latest',
  'minecraft-spigot':   'itzg/minecraft-server:latest',
  'minecraft-vanilla':  'itzg/minecraft-server:latest',
  'minecraft-velocity': 'itzg/bungeecord:latest',
  'minecraft-bedrock':  'itzg/minecraft-bedrock-server:latest',
  hytale:               'ubuntu:22.04',
  palworld:             'thijsvanloef/palworld-server-docker:latest',
  rust:                 'didstopia/rust-server:latest',
  cs2:                  'joedwards32/cs2:latest',
};

/**
 * Resolve an egg key or pass-through a real Docker image name.
 */
export function resolveImage(imageOrEgg: string): string {
  return EGG_IMAGE_MAP[imageOrEgg] ?? imageOrEgg;
}

// ─── DockerService ────────────────────────────────────────────────────────────

class DockerService {
  private readonly docker: Dockerode;

  constructor() {
    // Connect via the Unix socket on Linux/macOS (standard Docker Engine API)
    this.docker = new Dockerode({ socketPath: '/var/run/docker.sock' });
    logger.info('DockerService: connected to Docker Engine via /var/run/docker.sock');
  }

  // ── Image management ────────────────────────────────────────────────────────

  /**
   * Pull an image from a registry, streaming progress to logger.
   * Resolves when the pull is complete.
   */
  async pullImage(imageOrEgg: string): Promise<void> {
    const image = resolveImage(imageOrEgg);
    logger.info(`DockerService: pulling image ${image}`);

    await new Promise<void>((resolve, reject) => {
      this.docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);

        this.docker.modem.followProgress(
          stream,
          (pullErr: Error | null, _output: unknown[]) => {
            if (pullErr) {
              logger.error(`DockerService: pull failed for ${image}`, { error: pullErr.message });
              return reject(pullErr);
            }
            logger.info(`DockerService: successfully pulled ${image}`);
            resolve();
          },
          (event: { status: string; progress?: string }) => {
            if (event.progress) {
              logger.debug(`[pull] ${image}: ${event.status} ${event.progress}`);
            }
          },
        );
      });
    });
  }

  /**
   * Check whether an image already exists locally.
   */
  async imageExists(imageOrEgg: string): Promise<boolean> {
    const image = resolveImage(imageOrEgg);
    try {
      await this.docker.getImage(image).inspect();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Pull only if the image is not already present locally.
   */
  async ensureImage(imageOrEgg: string): Promise<void> {
    if (!(await this.imageExists(imageOrEgg))) {
      await this.pullImage(imageOrEgg);
    } else {
      logger.info(`DockerService: image ${resolveImage(imageOrEgg)} already present`);
    }
  }

  // ── Container lifecycle ─────────────────────────────────────────────────────

  /**
   * Create a new Docker container with Arc Panel resource constraints.
   * The container is NOT started — call start() separately.
   */
  async createContainer(cfg: ContainerCreateConfig, dataDir: string): Promise<string> {
    const image = resolveImage(cfg.image);

    // Build the PortBindings / ExposedPorts maps.
    const exposedPorts: Record<string, Record<string, never>> = {};
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};

    for (const p of cfg.ports) {
      const key = `${p.container}/tcp`;
      exposedPorts[key] = {};
      portBindings[key] = [{ HostPort: String(p.host) }];
    }

    // Env array format: ["KEY=VALUE"]
    const envArray = Object.entries(cfg.env).map(([k, v]) => `${k}=${v}`);

    // Server data volume path on the host.
    const serverDataPath = path.join(dataDir, 'servers', cfg.id, 'data');

    const createOptions: Dockerode.ContainerCreateOptions = {
      name: `arc-${cfg.id}`,
      Image: image,
      Env: envArray,
      ExposedPorts: exposedPorts,
      Labels: {
        'arc-panel': 'true',
        'arc-panel.server-id': cfg.id,
        'arc-panel.server-name': cfg.name,
      },
      HostConfig: {
        // Memory limit in bytes (MB × 1024²)
        Memory: cfg.memoryMB * 1024 * 1024,
        MemorySwap: cfg.memoryMB * 1024 * 1024, // disable swap
        CpuShares: cfg.cpuShares,
        PortBindings: portBindings,
        Binds: [`${serverDataPath}:/data`],
        RestartPolicy: { Name: 'unless-stopped' },
      },
    };

    // Allow a custom start command override.
    if (cfg.startCmd) {
      createOptions.Cmd = cfg.startCmd.split(' ');
    }

    const container = await this.docker.createContainer(createOptions);
    logger.info(`DockerService: created container ${container.id} for server ${cfg.id}`);
    return container.id;
  }

  /**
   * Retrieve a dockerode Container object by container ID.
   */
  getContainer(containerId: string): Dockerode.Container {
    return this.docker.getContainer(containerId);
  }

  /**
   * Remove a container (force-stop first if running).
   */
  async removeContainer(containerId: string): Promise<void> {
    const container = this.getContainer(containerId);
    try {
      await container.stop({ t: 5 });
    } catch {
      // May already be stopped — ignore.
    }
    await container.remove({ force: true });
    logger.info(`DockerService: removed container ${containerId}`);
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  /**
   * Fetch a single-shot stats snapshot and return parsed metrics.
   */
  async getStats(containerId: string): Promise<ParsedStats> {
    const container = this.getContainer(containerId);
    const inspect = await container.inspect();

    // Use stream:false to get a one-shot stats object.
    // dockerode returns the raw stats when stream is false.
    const stats = await new Promise<Dockerode.ContainerStats>((resolve, reject) => {
      container.stats({ stream: false }, (err, data) => {
        if (err) return reject(err);
        if (!data) return reject(new Error('No stats returned'));
        resolve(data as Dockerode.ContainerStats);
      });
    });

    // ── CPU % calculation ──────────────────────────────────────────────────
    // Docker stats provides:
    //   cpu_stats.cpu_usage.total_usage  — nanoseconds of CPU time used
    //   precpu_stats.cpu_usage.total_usage
    //   cpu_stats.system_cpu_usage       — total system CPU time (ns)
    //   precpu_stats.system_cpu_usage
    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage -
      stats.precpu_stats.cpu_usage.total_usage;

    const systemDelta =
      (stats.cpu_stats.system_cpu_usage ?? 0) -
      (stats.precpu_stats.system_cpu_usage ?? 0);

    const numCpus =
      stats.cpu_stats.online_cpus ??
      stats.cpu_stats.cpu_usage.percpu_usage?.length ??
      1;

    const cpuPercent =
      systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

    // ── Memory ────────────────────────────────────────────────────────────
    const memUsage = stats.memory_stats.usage ?? 0;
    const memLimit = stats.memory_stats.limit ?? 0;

    // ── Network ───────────────────────────────────────────────────────────
    let rxBytes = 0;
    let txBytes = 0;
    if (stats.networks) {
      for (const iface of Object.values(stats.networks)) {
        rxBytes += iface.rx_bytes ?? 0;
        txBytes += iface.tx_bytes ?? 0;
      }
    }

    return {
      cpuPercent: parseFloat(cpuPercent.toFixed(2)),
      memoryMB: parseFloat((memUsage / 1024 / 1024).toFixed(2)),
      memoryLimitMB: parseFloat((memLimit / 1024 / 1024).toFixed(2)),
      networkRxMB: parseFloat((rxBytes / 1024 / 1024).toFixed(2)),
      networkTxMB: parseFloat((txBytes / 1024 / 1024).toFixed(2)),
      status: inspect.State.Status,
    };
  }

  // ── Container inspection ────────────────────────────────────────────────────

  /**
   * Return the State block of a container inspection.
   */
  async getContainerState(containerId: string): Promise<Dockerode.ContainerInspectInfo['State']> {
    const info = await this.getContainer(containerId).inspect();
    return info.State;
  }

  /**
   * List all containers that were created by Arc Panel (via label filter).
   */
  async listManagedContainers(): Promise<Dockerode.ContainerInfo[]> {
    return this.docker.listContainers({
      all: true,
      filters: JSON.stringify({ label: ['arc-panel=true'] }),
    });
  }

  /**
   * Execute a command inside a running container and attach stdin.
   * Returns the exec stream for piping.
   */
  async execAttach(
    containerId: string,
    cmd: string[],
  ): Promise<NodeJS.ReadWriteStream> {
    const container = this.getContainer(containerId);
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
    });
    const stream = await exec.start({ hijack: true, stdin: true });
    return stream as unknown as NodeJS.ReadWriteStream;
  }
}

// Export the singleton.
export const dockerService = new DockerService();
