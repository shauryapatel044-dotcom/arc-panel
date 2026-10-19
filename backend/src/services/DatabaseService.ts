/**
 * src/services/DatabaseService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages per-server isolated MariaDB/MySQL databases on demand.
 * Creates secure databases, usernames, passwords, and grants privileges.
 */

import crypto from 'crypto';
import prisma from '../prisma';
import logger from '../logger';

class DatabaseService {
  /**
   * Create an isolated database and dedicated database user for a server.
   */
  async createDatabase(serverId: string, rawDbName: string) {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      include: { node: true },
    });

    if (!server) {
      throw new Error('Server not found.');
    }

    // Sanitize database name (lowercase alphanumeric and underscore only)
    const sanitizedSuffix = rawDbName
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 16);

    if (!sanitizedSuffix) {
      throw new Error('Database name must contain valid alphanumeric characters.');
    }

    // Check count limit (max 5 databases per server)
    const currentCount = await prisma.serverDatabase.count({
      where: { serverId },
    });

    if (currentCount >= 5) {
      throw new Error('Maximum of 5 databases per server reached.');
    }

    // Unique prefix to avoid collision: arc_s<first 6 chars of serverId>_<name>
    const shortServerId = serverId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toLowerCase();
    const dbName = `arc_s${shortServerId}_${sanitizedSuffix}`;
    const dbUser = `u_${shortServerId}_${sanitizedSuffix}`.slice(0, 32);
    const dbPassword = crypto.randomBytes(16).toString('hex'); // 32 hex chars

    // Check if database name already exists in Prisma records
    const existing = await prisma.serverDatabase.findUnique({
      where: {
        serverId_name: {
          serverId,
          name: sanitizedSuffix,
        },
      },
    });

    if (existing) {
      throw new Error(`Database '${sanitizedSuffix}' already exists on this server.`);
    }

    // Provision on MariaDB
    try {
      await prisma.$executeRawUnsafe(
        `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
      );
      await prisma.$executeRawUnsafe(
        `CREATE USER IF NOT EXISTS '${dbUser}'@'%' IDENTIFIED BY '${dbPassword}';`
      );
      await prisma.$executeRawUnsafe(
        `GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'%';`
      );
      await prisma.$executeRawUnsafe(
        `CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPassword}';`
      );
      await prisma.$executeRawUnsafe(
        `GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'localhost';`
      );
      await prisma.$executeRawUnsafe(`FLUSH PRIVILEGES;`);
    } catch (err: any) {
      logger.error('Failed to execute MariaDB database creation queries', { err: err.message, dbName });
      throw new Error(`Database engine error: ${err.message}`);
    }

    // Determine host to display to the user
    const dbHost =
      server.node?.fqdn && server.node.fqdn !== '127.0.0.1'
        ? server.node.fqdn
        : (process.env.DB_HOST || '127.0.0.1');

    // Save metadata in Prisma
    const record = await prisma.serverDatabase.create({
      data: {
        serverId,
        name: sanitizedSuffix,
        username: dbUser,
        password: dbPassword,
        host: dbHost,
        port: 3306,
        maxConnections: 10,
      },
    });

    return {
      ...record,
      fullDbName: dbName,
      jdbcUrl: `jdbc:mysql://${dbHost}:3306/${dbName}?useSSL=false`,
      connectionString: `mysql://${dbUser}:${dbPassword}@${dbHost}:3306/${dbName}`,
    };
  }

  /**
   * List all databases for a server.
   */
  async listDatabases(serverId: string) {
    const list = await prisma.serverDatabase.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
    });

    const shortServerId = serverId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toLowerCase();

    return list.map((item) => {
      const fullDbName = `arc_s${shortServerId}_${item.name}`;
      return {
        ...item,
        fullDbName,
        jdbcUrl: `jdbc:mysql://${item.host}:3306/${fullDbName}?useSSL=false`,
        connectionString: `mysql://${item.username}:${item.password}@${item.host}:3306/${fullDbName}`,
      };
    });
  }

  /**
   * Delete a database and remove its dedicated user.
   */
  async deleteDatabase(serverId: string, databaseId: string) {
    const record = await prisma.serverDatabase.findFirst({
      where: { id: databaseId, serverId },
    });

    if (!record) {
      throw new Error('Database record not found.');
    }

    const shortServerId = serverId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toLowerCase();
    const dbName = `arc_s${shortServerId}_${record.name}`;
    const dbUser = record.username;

    try {
      await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${dbName}\`;`);
      await prisma.$executeRawUnsafe(`DROP USER IF EXISTS '${dbUser}'@'%';`);
      await prisma.$executeRawUnsafe(`DROP USER IF EXISTS '${dbUser}'@'localhost';`);
      await prisma.$executeRawUnsafe(`FLUSH PRIVILEGES;`);
    } catch (err: any) {
      logger.warn('Failed to drop MariaDB database or user', { err: err.message, dbName, dbUser });
    }

    await prisma.serverDatabase.delete({
      where: { id: databaseId },
    });

    return { success: true };
  }

  /**
   * Rotate / reset password for a server database.
   */
  async rotatePassword(serverId: string, databaseId: string) {
    const record = await prisma.serverDatabase.findFirst({
      where: { id: databaseId, serverId },
    });

    if (!record) {
      throw new Error('Database record not found.');
    }

    const newPassword = crypto.randomBytes(16).toString('hex');
    const dbUser = record.username;

    try {
      await prisma.$executeRawUnsafe(
        `ALTER USER '${dbUser}'@'%' IDENTIFIED BY '${newPassword}';`
      );
      await prisma.$executeRawUnsafe(
        `ALTER USER '${dbUser}'@'localhost' IDENTIFIED BY '${newPassword}';`
      );
      await prisma.$executeRawUnsafe(`FLUSH PRIVILEGES;`);
    } catch (err: any) {
      logger.error('Failed to rotate database password in MariaDB', { err: err.message });
      throw new Error(`Database engine error: ${err.message}`);
    }

    const updated = await prisma.serverDatabase.update({
      where: { id: databaseId },
      data: { password: newPassword },
    });

    return updated;
  }
}

export const databaseService = new DatabaseService();
