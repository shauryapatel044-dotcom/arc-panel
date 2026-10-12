/**
 * prisma/seed.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Database seeder for Arc Panel.
 * Seeds:
 *  • Admin user (admin@arc.local / admin — forcePasswordChange: true)
 *  • Local daemon node (127.0.0.1:8085)
 *  • 10 allocations: ports 25500–25509 on 127.0.0.1
 *  • 8 built-in game egg templates
 *
 * Usage: npm run seed
 */

import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Egg Templates ────────────────────────────────────────────────────────────

const EGG_TEMPLATES = [
  {
    name: 'Minecraft Java Edition',
    description: 'Vanilla Minecraft Java server with Paper/Spigot support.',
    slug: 'minecraft-java',
    dockerImage: 'itzg/minecraft-server:latest',
    startupCmd: 'java -Xms${MIN_MEMORY}M -Xmx${MAX_MEMORY}M -jar server.jar nogui',
    envSchema: JSON.stringify([
      { key: 'EULA', description: 'Accept Minecraft EULA', default: 'TRUE', required: true },
      { key: 'TYPE', description: 'Server type (VANILLA, PAPER, SPIGOT, FABRIC)', default: 'PAPER', required: false },
      { key: 'VERSION', description: 'Minecraft version', default: 'LATEST', required: false },
      { key: 'MIN_MEMORY', description: 'Minimum JVM heap in MB', default: '512', required: false },
      { key: 'MAX_MEMORY', description: 'Maximum JVM heap in MB', default: '1024', required: false },
    ]),
  },
  {
    name: 'Minecraft Bedrock Edition',
    description: 'Official Minecraft Bedrock Dedicated Server for cross-platform play.',
    slug: 'minecraft-bedrock',
    dockerImage: 'itzg/minecraft-bedrock-server:latest',
    startupCmd: './bedrock_server',
    envSchema: JSON.stringify([
      { key: 'EULA', description: 'Accept Minecraft EULA', default: 'TRUE', required: true },
      { key: 'GAMEMODE', description: 'Default game mode', default: 'survival', required: false },
      { key: 'DIFFICULTY', description: 'Server difficulty', default: 'easy', required: false },
    ]),
  },
  {
    name: 'Counter-Strike 2',
    description: 'Valve Counter-Strike 2 dedicated server.',
    slug: 'cs2',
    dockerImage: 'joedwards32/cs2:latest',
    startupCmd: './game/bin/linuxSteamRT/cs2 -dedicated -ip 0.0.0.0 -port ${SERVER_PORT} +map ${CS2_STARTMAP}',
    envSchema: JSON.stringify([
      { key: 'STEAMAPPVALIDATE', description: 'Validate Steam files on start', default: '1', required: false },
      { key: 'CS2_STARTMAP', description: 'Starting map name', default: 'de_dust2', required: false },
      { key: 'CS2_MAXPLAYERS', description: 'Max players', default: '16', required: false },
      { key: 'CS2_GAMETYPE', description: 'Game type (0=Classic, 1=Deathmatch)', default: '0', required: false },
      { key: 'CS2_GAMEMODE', description: 'Game mode', default: '1', required: false },
    ]),
  },
  {
    name: 'Valheim',
    description: 'Valheim dedicated server for cooperative Viking survival.',
    slug: 'valheim',
    dockerImage: 'lloesche/valheim-server:latest',
    startupCmd: './valheim_server.x86_64 -name "${SERVER_NAME}" -port ${SERVER_PORT} -world "${WORLD_NAME}" -password "${SERVER_PASS}"',
    envSchema: JSON.stringify([
      { key: 'SERVER_NAME', description: 'Public server name', default: 'My Valheim Server', required: true },
      { key: 'WORLD_NAME', description: 'World save name', default: 'Dedicated', required: true },
      { key: 'SERVER_PASS', description: 'Password (min 5 chars)', default: 'secret', required: true },
    ]),
  },
  {
    name: 'Rust',
    description: 'Rust dedicated server — the multiplayer survival game.',
    slug: 'rust',
    dockerImage: 'didstopia/rust-server:latest',
    startupCmd: './RustDedicated -batchmode +server.hostname "${SERVER_HOSTNAME}" +server.maxplayers ${MAX_PLAYERS} +server.worldsize ${WORLD_SIZE} +server.seed ${WORLD_SEED}',
    envSchema: JSON.stringify([
      { key: 'SERVER_HOSTNAME', description: 'Server display name', default: 'My Rust Server', required: true },
      { key: 'MAX_PLAYERS', description: 'Maximum players', default: '50', required: false },
      { key: 'WORLD_SIZE', description: 'Map size (1000-6000)', default: '3000', required: false },
      { key: 'WORLD_SEED', description: 'Map generation seed', default: '12345', required: false },
      { key: 'RCON_PASSWORD', description: 'RCON password', default: 'changemeplease', required: true },
    ]),
  },
  {
    name: 'Terraria',
    description: 'Terraria dedicated server using TShock.',
    slug: 'terraria',
    dockerImage: 'ryshe/terraria:latest',
    startupCmd: './TShock.Server -world /root/.local/share/Terraria/Worlds/${WORLD_NAME}.wld -port ${SERVER_PORT} -maxplayers ${MAX_PLAYERS}',
    envSchema: JSON.stringify([
      { key: 'WORLD_NAME', description: 'World file name (without .wld)', default: 'world1', required: true },
      { key: 'MAX_PLAYERS', description: 'Maximum players', default: '16', required: false },
      { key: 'SERVER_PASSWORD', description: 'Join password (blank = no password)', default: '', required: false },
    ]),
  },
  {
    name: 'Palworld',
    description: 'Palworld dedicated server for creature-catching survival.',
    slug: 'palworld',
    dockerImage: 'thijsvanloef/palworld-server-docker:latest',
    startupCmd: './PalServer.sh EpicApp=PalServer -port=${SERVER_PORT} -players=${MAX_PLAYERS}',
    envSchema: JSON.stringify([
      { key: 'PLAYERS', description: 'Max players', default: '16', required: false },
      { key: 'SERVER_PASSWORD', description: 'Server join password', default: '', required: false },
      { key: 'ADMIN_PASSWORD', description: 'Admin RCON password', default: 'adminpassword', required: true },
      { key: 'SERVER_NAME', description: 'Server display name', default: 'My Palworld Server', required: false },
    ]),
  },
  {
    name: 'Generic Docker',
    description: 'Run any Docker image as a managed server container.',
    slug: 'generic',
    dockerImage: 'ubuntu:22.04',
    startupCmd: '/bin/bash',
    envSchema: JSON.stringify([
      { key: 'STARTUP_CMD', description: 'Command to run on container start', default: '/bin/bash', required: false },
    ]),
  },
];

// ─── Seed Function ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 Starting Arc Panel database seed...\n');

  // ── 1. Admin User ────────────────────────────────────────────────────────────
  const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
  const adminPassword = await bcrypt.hash('admin', bcryptRounds);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@arc.local' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@arc.local',
      passwordHash: adminPassword,
      role: Role.ADMIN,
      forcePasswordChange: true,
    },
  });

  console.log(`✅ Admin user: ${adminUser.email} (id: ${adminUser.id})`);

  // ── 2. Local Node ────────────────────────────────────────────────────────────
  const daemonToken = process.env.DAEMON_TOKEN || 'changeme';

  const localNode = await prisma.node.upsert({
    where: { name: 'local' },
    update: {},
    create: {
      name: 'local',
      fqdn: '127.0.0.1',
      port: 8085,
      daemonToken,
      isOnline: false,
      totalMemory: 8192,
      totalCpu: 4,
      usedMemory: 0,
      usedCpu: 0,
    },
  });

  console.log(`✅ Local node: ${localNode.name} (id: ${localNode.id})`);

  // ── 3. Port Allocations 25500–25509 ─────────────────────────────────────────
  const allocationPorts = Array.from({ length: 10 }, (_, i) => 25500 + i);
  let allocCreated = 0;

  for (const port of allocationPorts) {
    const existing = await prisma.allocation.findUnique({
      where: {
        nodeId_ip_port: {
          nodeId: localNode.id,
          ip: '127.0.0.1',
          port,
        },
      },
    });

    if (!existing) {
      await prisma.allocation.create({
        data: {
          nodeId: localNode.id,
          ip: '127.0.0.1',
          port,
          isAssigned: false,
        },
      });
      allocCreated++;
    }
  }

  console.log(`✅ Allocations: ${allocCreated} created (ports 25500–25509 on 127.0.0.1)`);

  // ── 4. Egg Templates ─────────────────────────────────────────────────────────
  let eggsCreated = 0;

  for (const egg of EGG_TEMPLATES) {
    await prisma.egg.upsert({
      where: { slug: egg.slug },
      update: {
        name: egg.name,
        description: egg.description,
        dockerImage: egg.dockerImage,
        startupCmd: egg.startupCmd,
        envSchema: egg.envSchema,
      },
      create: egg,
    });
    eggsCreated++;
    console.log(`   🥚 Egg: ${egg.name}`);
  }

  console.log(`✅ Egg templates: ${eggsCreated} upserted`);
  console.log('\n🎉 Seed complete!\n');
  console.log('─────────────────────────────────────────────');
  console.log('  Default Admin Credentials:');
  console.log('  Email:    admin@arc.local');
  console.log('  Password: admin  (CHANGE ON FIRST LOGIN)');
  console.log('─────────────────────────────────────────────\n');
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('❌ Seed failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
