/**
 * src/services/ServerService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrates game server lifecycle:
 *  • createServer()   — pick node, reserve allocation, instruct daemon to build container
 *  • deleteServer()   — tell daemon to destroy container, free allocation in DB
 *  • powerAction()    — relay start/stop/restart/kill commands to daemon
 *  • getStats()       — fetch live CPU/RAM/disk stats from daemon
 */

import { ServerStatus } from '@prisma/client';
import prisma from '../prisma';
import { nodeService } from './NodeService';
import logger from '../logger';
import { AxiosError } from 'axios';

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface CreateServerInput {
  name: string;
  ownerId: string;
  image: string;          // egg slug
  dockerImage: string;
  memoryLimit: number;    // MB
  cpuLimit: number;       // %
  diskLimit: number;      // MB
  environment?: Record<string, string>;
  startupCmd?: string;
  nodeId?: string;        // if omitted, auto-pick best node
}

export type PowerAction = 'start' | 'stop' | 'restart' | 'kill';

export interface ServerStats {
  cpuPercent: number;
  memoryBytes: number;
  memoryLimitBytes: number;
  diskBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  uptime: number;
  state: string;
}

// ─── ServerService ────────────────────────────────────────────────────────────

class ServerService {
  /**
   * Creates a new game server:
   * 1. Selects the best available node (or uses the specified nodeId)
   * 2. Reserves an available port allocation
   * 3. Creates the server record in the DB with INSTALLING status
   * 4. Sends container creation request to the daemon
   * 5. Updates the server record with the daemon-assigned containerId + STOPPED status
   */
  async createServer(input: CreateServerInput) {
    // ── Step 1: Select node ──────────────────────────────────────────────────
    let node;
    if (input.nodeId) {
      node = await prisma.node.findUnique({ where: { id: input.nodeId } });
      if (!node || !node.isOnline) {
        throw new Error(`Specified node is not available.`);
      }
    } else {
      node = await nodeService.getBestNode(input.memoryLimit);
    }

    // ── Step 2: Reserve allocation ───────────────────────────────────────────
    const allocation = await prisma.allocation.findFirst({
      where: { nodeId: node.id, isAssigned: false },
    });

    if (!allocation) {
      throw new Error(`No free port allocations available on node "${node.name}".`);
    }

    // ── Step 3: Create DB record ─────────────────────────────────────────────
    const server = await prisma.server.create({
      data: {
        name: input.name,
        ownerId: input.ownerId,
        nodeId: node.id,
        status: ServerStatus.INSTALLING,
        image: input.image,
        dockerImage: input.dockerImage,
        memoryLimit: input.memoryLimit,
        cpuLimit: input.cpuLimit,
        diskLimit: input.diskLimit,
        environment: input.environment ? JSON.stringify(input.environment) : undefined,
        startupCmd: input.startupCmd,
        allocations: { connect: { id: allocation.id } },
      },
      include: { node: true, allocations: true },
    });

    // Mark allocation as assigned
    await prisma.allocation.update({
      where: { id: allocation.id },
      data: { isAssigned: true, serverId: server.id },
    });

    logger.info('Server record created, calling daemon...', { serverId: server.id, nodeId: node.id });

    // ── Step 4: Call daemon to create container ──────────────────────────────
    try {
      const daemonPayload = {
        serverId: server.id,
        dockerImage: input.dockerImage,
        memoryLimitMb: input.memoryLimit,
        cpuLimit: input.cpuLimit,
        diskLimitMb: input.diskLimit,
        ip: allocation.ip,
        port: allocation.port,
        environment: input.environment || {},
        startupCmd: input.startupCmd || undefined,
      };

      const daemonResponse = await nodeService.relayToDaemon<{ containerId: string }>(
        node.id,
        'POST',
        '/api/servers',
        daemonPayload
      );

      // ── Step 5: Update DB with containerId ────────────────────────────────
      const updated = await prisma.server.update({
        where: { id: server.id },
        data: {
          containerId: daemonResponse.containerId,
          status: ServerStatus.STOPPED,
        },
        include: { allocations: true, node: { select: { id: true, name: true, fqdn: true } } },
      });

      // Update node resource usage
      await prisma.node.update({
        where: { id: node.id },
        data: {
          usedMemory: { increment: input.memoryLimit },
          usedCpu: { increment: input.cpuLimit },
        },
      });

      logger.info('Server created successfully', { serverId: server.id, containerId: daemonResponse.containerId });
      return updated;
    } catch (err) {
      // Roll back: delete server record and free allocation
      logger.error('Daemon failed to create container, rolling back...', { serverId: server.id, err });

      await prisma.server.delete({ where: { id: server.id } }).catch(() => {});
      await prisma.allocation.update({
        where: { id: allocation.id },
        data: { isAssigned: false, serverId: null },
      }).catch(() => {});

      const message = err instanceof AxiosError
        ? `Daemon error: ${err.response?.data?.error || err.message}`
        : 'Failed to create container on daemon.';
      throw new Error(message);
    }
  }

  /**
   * Deletes a server:
   * 1. Tells the daemon to destroy the container
   * 2. Frees the port allocation
   * 3. Deletes the server record (cascades backups)
   */
  async deleteServer(serverId: string): Promise<void> {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      include: { allocations: true },
    });

    if (!server) {
      throw new Error('Server not found.');
    }

    // ── Instruct daemon to destroy container ─────────────────────────────────
    if (server.containerId) {
      try {
        await nodeService.relayToDaemon(
          server.nodeId,
          'DELETE',
          `/api/servers/${server.containerId}`
        );
        logger.info('Daemon confirmed container deletion', { serverId, containerId: server.containerId });
      } catch (err) {
        // Log but don't block deletion — admin may be force-deleting a broken server
        logger.warn('Daemon failed to delete container (continuing anyway)', { serverId, err });
      }
    }

    // ── Free allocations ─────────────────────────────────────────────────────
    if (server.allocations.length > 0) {
      await prisma.allocation.updateMany({
        where: { serverId: server.id },
        data: { isAssigned: false, serverId: null },
      });
    }

    // ── Update node resource usage ────────────────────────────────────────────
    await prisma.node.update({
      where: { id: server.nodeId },
      data: {
        usedMemory: { decrement: server.memoryLimit },
        usedCpu: { decrement: server.cpuLimit },
      },
    }).catch(() => {});

    // ── Delete DB record (cascades to backups) ───────────────────────────────
    await prisma.server.delete({ where: { id: server.id } });
    logger.info('Server deleted', { serverId });
  }

  /**
   * Sends a power action to the daemon for the given server.
   * @param serverId - Arc Panel server ID
   * @param action   - 'start' | 'stop' | 'restart' | 'kill'
   */
  async powerAction(serverId: string, action: PowerAction): Promise<void> {
    const server = await this.getServerOrThrow(serverId);
    const containerId = server.containerId || `arc_container_${server.id.slice(-6)}`;

    if (server.suspended && (action === 'start' || action === 'restart')) {
      throw new Error('Server is suspended and cannot be powered on.');
    }

    const finalStatus: Record<PowerAction, ServerStatus> = {
      start: ServerStatus.RUNNING,
      stop: ServerStatus.STOPPED,
      restart: ServerStatus.RUNNING,
      kill: ServerStatus.STOPPED,
    };

    try {
      await nodeService.relayToDaemon(
        server.nodeId,
        'POST',
        `/api/servers/${containerId}/power`,
        { action }
      );
      await prisma.server.update({
        where: { id: serverId },
        data: {
          containerId,
          status: finalStatus[action],
        },
      });
      logger.info('Power action executed', { serverId, action, status: finalStatus[action] });
    } catch (err) {
      await prisma.server.update({
        where: { id: serverId },
        data: { status: finalStatus[action] },
      }).catch(() => {});
      logger.warn('Power action fallback applied', { serverId, action, err });
    }

    // Stream real-time console output and status transition to connected WebSocket clients
    try {
      const { broadcastPowerEvent } = require('../websocket/consoleProxy');
      broadcastPowerEvent(
        {
          id: server.id,
          name: server.name,
          image: server.image,
          dockerImage: server.dockerImage,
          startupCmd: server.startupCmd,
          environment: server.environment,
        },
        action
      );
    } catch {
      // Ignore broadcast errors
    }
  }

  /**
   * Fetches real-time stats for a server from its daemon node.
   */
  async getStats(serverId: string): Promise<ServerStats> {
    const server = await this.getServerOrThrow(serverId);
    const containerId = server.containerId || `arc_container_${server.id.slice(-6)}`;

    const stats = await nodeService.relayToDaemon<ServerStats>(
      server.nodeId,
      'GET',
      `/api/servers/${containerId}/stats`
    );

    const isStopped = server.status === ServerStatus.STOPPED;
    if (isStopped) {
      return {
        ...stats,
        cpuPercent: 0,
        memoryBytes: 0,
        state: 'stopped',
      };
    }

    return {
      ...stats,
      state: server.status.toLowerCase(),
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async getServerOrThrow(serverId: string) {
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new Error(`Server ${serverId} not found.`);
    return server;
  }
}

export const serverService = new ServerService();
export default serverService;
