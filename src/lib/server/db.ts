import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Optional Prisma client. PerkPilot runs fully in demo/guest mode without a
 * database; when DATABASE_URL is set, rules and synced household data are read
 * from and written to PostgreSQL.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): PrismaClient | null {
  if (!dbConfigured()) return null;
  globalForPrisma.prisma ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  return globalForPrisma.prisma;
}
