/**
 * src/routes/domains.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Custom Domain & Connection Resolution Routes:
 *  • GET    /api/servers/:serverId/domains            — List domains, DNS guides, and connection endpoint
 *  • POST   /api/servers/:serverId/domains            — Add custom domain with auto-generated DNS records
 *  • POST   /api/servers/:serverId/domains/:id/verify — Verify DNS propagation
 *  • DELETE /api/servers/:serverId/domains/:id        — Remove custom domain
 */

import { Router, Request, Response } from 'express';
import { promises as dns } from 'dns';
import { z } from 'zod';
import prisma from '../prisma';
import { authenticateToken, requireOwnership, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { auditService } from '../services/AuditService';
import logger from '../logger';

const router = Router({ mergeParams: true });

const AddDomainSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(255)
    .regex(
      /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/,
      'Invalid domain format (e.g. play.myserver.com)'
    ),
  recordType: z.enum(['SRV', 'CNAME', 'A']).default('SRV'),
});

// ─── GET /api/servers/:serverId/domains ───────────────────────────────────────
router.get(
  '/',
  authenticateToken,
  requireOwnership,
  requirePermission('network.manage'),
  async (req: Request, res: Response) => {
    const { serverId } = req.params;
    try {
      const server = await prisma.server.findUnique({
        where: { id: serverId },
        include: {
          node: true,
          allocations: { orderBy: { isPrimary: 'desc' } },
          domains: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (!server) {
        res.status(404).json({ error: 'Server not found.' });
        return;
      }

      const primaryAlloc = server.allocations.find((a) => a.isPrimary) || server.allocations[0];
      const primaryPort = primaryAlloc ? primaryAlloc.port : 25565;

      const node = server.node;
      const nodeDomain = node.domain || null;
      const vpsIp = node.publicIp || (node.fqdn !== '127.0.0.1' ? node.fqdn : '127.0.0.1');
      const isIpv4 = node.isIpv4;

      const tunnelType = server.tunnelType || node.tunnelType || 'NONE';
      const tunnelAddress = server.tunnelAddress || node.tunnelAddress || null;
      const tunnelStatus = server.tunnelStatus || node.tunnelStatus || 'OFFLINE';
      const isTunnelActive = tunnelStatus === 'ACTIVE' && Boolean(tunnelAddress);

      // Determine public connectivity state:
      // If node is non-IPv4 and tunnel is NOT active, the client cannot connect yet
      let connectionStatus: 'DIRECT_IP' | 'NODE_DOMAIN' | 'TUNNEL_ACTIVE' | 'REQUIRES_TUNNEL' = 'DIRECT_IP';
      let displayAddress: string | null = null;
      let tunnelWarning: string | null = null;

      if (!isIpv4 && !isTunnelActive) {
        connectionStatus = 'REQUIRES_TUNNEL';
        displayAddress = null;
        tunnelWarning =
          'This server is hosted on a private / non-IPv4 node. An administrator must configure a Playit.gg or Cloudflare tunnel for this port before public connections can reach your server.';
      } else if (isTunnelActive) {
        connectionStatus = 'TUNNEL_ACTIVE';
        displayAddress = tunnelAddress;
      } else if (nodeDomain) {
        connectionStatus = 'NODE_DOMAIN';
        displayAddress = `${nodeDomain}:${primaryPort}`;
      } else {
        connectionStatus = 'DIRECT_IP';
        displayAddress = `${vpsIp}:${primaryPort}`;
      }

      // If client has configured a custom domain that is verified or primary
      const customDomain = server.customDomain || (server.domains.length > 0 ? server.domains[0].domain : null);

      res.json({
        customDomain,
        domains: server.domains,
        connection: {
          status: connectionStatus,
          displayAddress,
          customDomainAddress: customDomain ? `${customDomain}:${primaryPort}` : null,
          nodeDomain,
          vpsIp,
          isIpv4,
          primaryPort,
          tunnel: {
            type: tunnelType,
            address: tunnelAddress,
            status: tunnelStatus,
            isActive: isTunnelActive,
          },
          tunnelWarning,
        },
      });
    } catch (err) {
      logger.error('GET /api/servers/:serverId/domains error', { err });
      res.status(500).json({ error: 'Failed to retrieve domain configuration.' });
    }
  }
);

// ─── POST /api/servers/:serverId/domains ──────────────────────────────────────
router.post(
  '/',
  authenticateToken,
  requireOwnership,
  requirePermission('network.manage'),
  validate(AddDomainSchema),
  async (req: Request, res: Response) => {
    const { serverId } = req.params;
    const { domain, recordType } = req.body;

    try {
      const server = await prisma.server.findUnique({
        where: { id: serverId },
        include: {
          node: true,
          allocations: { orderBy: { isPrimary: 'desc' } },
        },
      });

      if (!server) {
        res.status(404).json({ error: 'Server not found.' });
        return;
      }

      const primaryAlloc = server.allocations.find((a) => a.isPrimary) || server.allocations[0];
      const primaryPort = primaryAlloc ? primaryAlloc.port : 25565;

      const targetHost =
        server.node.domain || server.node.publicIp || (server.node.fqdn !== '127.0.0.1' ? server.node.fqdn : '127.0.0.1');

      // Check for duplicate domain on this server
      const existing = await prisma.serverDomain.findFirst({
        where: { serverId, domain: domain.toLowerCase() },
      });

      if (existing) {
        res.status(400).json({ error: 'This domain is already added to this server.' });
        return;
      }

      // Create domain record
      const created = await prisma.serverDomain.create({
        data: {
          serverId,
          domain: domain.toLowerCase(),
          recordType: recordType || 'SRV',
          targetHost,
          targetPort: primaryPort,
        },
      });

      // Update server primary custom domain if not already set
      if (!server.customDomain) {
        await prisma.server.update({
          where: { id: serverId },
          data: { customDomain: domain.toLowerCase() },
        });
      }

      // Generate suggested DNS instructions
      const dnsInstructions = {
        srv: {
          type: 'SRV',
          name: `_minecraft._tcp.${domain.toLowerCase()}`,
          priority: 0,
          weight: 5,
          port: primaryPort,
          target: targetHost,
          ttl: 3600,
        },
        cname: {
          type: 'CNAME',
          name: domain.toLowerCase(),
          target: targetHost,
          ttl: 3600,
        },
        a: {
          type: 'A',
          name: domain.toLowerCase(),
          target: server.node.publicIp || targetHost,
          ttl: 3600,
        },
      };

      await auditService.log({
        serverId,
        userId: req.user?.sub,
        action: 'domain.add',
        details: JSON.stringify({ domain: created.domain, recordType: created.recordType }),
        ipAddress: req.ip,
      });

      res.status(201).json({
        domain: created,
        dnsInstructions,
        message: `Custom domain ${created.domain} added successfully. Configure your DNS provider with the records below.`,
      });
    } catch (err) {
      logger.error('POST /api/servers/:serverId/domains error', { err });
      res.status(500).json({ error: 'Failed to add custom domain.' });
    }
  }
);

// ─── POST /api/servers/:serverId/domains/:domainId/verify ─────────────────────
router.post(
  '/:domainId/verify',
  authenticateToken,
  requireOwnership,
  requirePermission('network.manage'),
  async (req: Request, res: Response) => {
    const { serverId, domainId } = req.params;

    try {
      const record = await prisma.serverDomain.findFirst({
        where: { id: domainId, serverId },
      });

      if (!record) {
        res.status(404).json({ error: 'Domain record not found.' });
        return;
      }

      let isResolved = false;
      let resolutionDetails: string | null = null;

      try {
        if (record.recordType === 'SRV') {
          const srvRecords = await dns.resolveSrv(`_minecraft._tcp.${record.domain}`);
          if (srvRecords && srvRecords.length > 0) {
            isResolved = true;
            resolutionDetails = `SRV resolved to ${srvRecords[0].name}:${srvRecords[0].port}`;
          }
        } else if (record.recordType === 'CNAME') {
          const cnames = await dns.resolveCname(record.domain);
          if (cnames && cnames.length > 0) {
            isResolved = true;
            resolutionDetails = `CNAME resolved to ${cnames[0]}`;
          }
        } else {
          const ips = await dns.resolve4(record.domain);
          if (ips && ips.length > 0) {
            isResolved = true;
            resolutionDetails = `A record resolved to ${ips.join(', ')}`;
          }
        }
      } catch {
        // DNS lookup may fail if propagation is still pending
        isResolved = false;
        resolutionDetails = 'DNS propagation in progress. Please allow up to 24-48 hours.';
      }

      const updated = await prisma.serverDomain.update({
        where: { id: domainId },
        data: { isVerified: isResolved },
      });

      res.json({
        verified: isResolved,
        details: resolutionDetails,
        domain: updated,
      });
    } catch (err) {
      logger.error('Verify domain error', { err });
      res.status(500).json({ error: 'DNS verification check failed.' });
    }
  }
);

// ─── DELETE /api/servers/:serverId/domains/:domainId ──────────────────────────
router.delete(
  '/:domainId',
  authenticateToken,
  requireOwnership,
  requirePermission('network.manage'),
  async (req: Request, res: Response) => {
    const { serverId, domainId } = req.params;
    try {
      const record = await prisma.serverDomain.findFirst({
        where: { id: domainId, serverId },
      });

      if (!record) {
        res.status(404).json({ error: 'Domain record not found.' });
        return;
      }

      await prisma.serverDomain.delete({ where: { id: domainId } });

      // Clean up server customDomain if it was the one deleted
      const server = await prisma.server.findUnique({
        where: { id: serverId },
        select: { customDomain: true },
      });

      if (server?.customDomain === record.domain) {
        const remaining = await prisma.serverDomain.findFirst({
          where: { serverId },
          orderBy: { createdAt: 'desc' },
        });

        await prisma.server.update({
          where: { id: serverId },
          data: { customDomain: remaining ? remaining.domain : null },
        });
      }

      await auditService.log({
        serverId,
        userId: req.user?.sub,
        action: 'domain.remove',
        details: JSON.stringify({ domain: record.domain }),
        ipAddress: req.ip,
      });

      res.json({ success: true, message: `Domain ${record.domain} removed.` });
    } catch (err) {
      logger.error('DELETE domain error', { err });
      res.status(500).json({ error: 'Failed to remove domain.' });
    }
  }
);

export default router;
