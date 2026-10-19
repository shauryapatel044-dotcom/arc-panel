/**
 * src/services/AuditService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit logging and Discord webhook dispatch service.
 * Tracks user actions on servers (power, files, databases, subusers, backups)
 * and notifies active Discord webhooks with stylized Arc Panel embeds.
 */

import axios from 'axios';
import prisma from '../prisma';
import logger from '../logger';

export interface AuditLogEntry {
  serverId: string;
  action: string;
  details?: string;
  userId?: string;
  ipAddress?: string;
}

export interface DiscordEmbed {
  title: string;
  description: string;
  color: number; // Decimal color code
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
  footer?: { text: string; icon_url?: string };
}

class AuditService {
  /**
   * Log an audit event and asynchronously trigger any subscribed webhooks.
   */
  async logAction(entry: AuditLogEntry): Promise<void> {
    try {
      const log = await prisma.serverAuditLog.create({
        data: {
          serverId: entry.serverId,
          action: entry.action,
          details: entry.details,
          userId: entry.userId,
          ipAddress: entry.ipAddress,
        },
        include: {
          server: { select: { name: true } },
          user: { select: { username: true, email: true } },
        },
      });

      // Dispatch Discord webhooks in background
      this.dispatchWebhooks(log).catch((err) => {
        logger.error('Failed to dispatch webhooks', { err, serverId: entry.serverId });
      });
    } catch (err) {
      logger.error('Failed to create audit log', { err, entry });
    }
  }

  /**
   * Fetch recent audit logs for a server with user details.
   */
  async getRecentLogs(serverId: string, limit = 50) {
    return prisma.serverAuditLog.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: { id: true, username: true, email: true, role: true },
        },
      },
    });
  }

  /**
   * Check matching webhooks and send formatted Discord payloads.
   */
  private async dispatchWebhooks(log: any): Promise<void> {
    const webhooks = await prisma.serverWebhook.findMany({
      where: { serverId: log.serverId, isActive: true },
    });

    if (webhooks.length === 0) return;

    const actionLower = log.action.toLowerCase();
    const serverName = log.server?.name || 'Arc Server';
    const actorName = log.user?.username || 'System';

    // Map action to color & category
    let color = 0x00ccff; // Arc Cyan
    let eventCategory = 'general';

    if (actionLower.includes('start') || actionLower.includes('online')) {
      color = 0x00e676; // Green
      eventCategory = 'start';
    } else if (actionLower.includes('stop') || actionLower.includes('kill')) {
      color = 0xff9900; // Warning Orange
      eventCategory = 'stop';
    } else if (actionLower.includes('crash')) {
      color = 0xff5252; // Coral Alert
      eventCategory = 'crash';
    } else if (actionLower.includes('backup')) {
      color = 0x935cff; // Arc Violet
      eventCategory = 'backup';
    } else if (actionLower.includes('database') || actionLower.includes('db')) {
      color = 0x00bcd4; // Teal
      eventCategory = 'database';
    } else if (actionLower.includes('subuser') || actionLower.includes('collab')) {
      color = 0x3d7bf6; // Blue
      eventCategory = 'subuser';
    } else if (actionLower.includes('plugin') || actionLower.includes('mod')) {
      color = 0xa855f7; // Purple
      eventCategory = 'plugin';
    }

    const embed: DiscordEmbed = {
      title: `⚡ [${serverName}] Event: ${log.action}`,
      description: log.details || `Server event \`${log.action}\` was performed.`,
      color,
      fields: [
        { name: 'Triggered By', value: `\`${actorName}\``, inline: true },
        { name: 'Server', value: serverName, inline: true },
        { name: 'Event ID', value: `\`${log.id.slice(0, 10)}\``, inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Arc Panel Alert System',
      },
    };

    for (const webhook of webhooks) {
      try {
        let subscribedEvents: string[] = [];
        try {
          subscribedEvents = JSON.parse(webhook.events);
        } catch {
          subscribedEvents = ['all'];
        }

        const isSubscribed =
          subscribedEvents.includes('all') ||
          subscribedEvents.includes('*') ||
          subscribedEvents.includes(eventCategory) ||
          subscribedEvents.includes(log.action.toLowerCase());

        if (isSubscribed) {
          await axios.post(
            webhook.url,
            {
              username: 'Arc Panel',
              avatar_url: 'https://avatars.githubusercontent.com/u/1498379?s=200&v=4',
              embeds: [embed],
            },
            { timeout: 5000 }
          );
        }
      } catch (err: any) {
        logger.warn('Error sending Discord webhook', {
          webhookId: webhook.id,
          err: err.message,
        });
      }
    }
  }

  /**
   * Send a test message to a specific webhook URL.
   */
  async sendTestWebhook(url: string, serverName = 'Arc Server'): Promise<boolean> {
    try {
      await axios.post(
        url,
        {
          username: 'Arc Panel',
          avatar_url: 'https://avatars.githubusercontent.com/u/1498379?s=200&v=4',
          embeds: [
            {
              title: `🔔 Arc Panel Webhook Test — ${serverName}`,
              description: `Discord webhooks are successfully configured for **${serverName}**! You will receive live alerts for power changes, crashes, backups, and team activity.`,
              color: 0x00ccff,
              fields: [
                { name: 'Status', value: '✅ Connected', inline: true },
                { name: 'Theme', value: 'Arc Glassmorphism', inline: true },
              ],
              timestamp: new Date().toISOString(),
              footer: { text: 'Arc Panel Notifications' },
            },
          ],
        },
        { timeout: 5000 }
      );
      return true;
    } catch (err: any) {
      logger.error('Webhook test failed', { error: err.message });
      throw new Error(err.response?.data?.message || err.message || 'Failed to send test webhook.');
    }
  }
}

export const auditService = new AuditService();
