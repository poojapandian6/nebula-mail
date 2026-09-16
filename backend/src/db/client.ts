import { PrismaClient } from "@prisma/client";

// Single shared Prisma client. In dev with tsx watch this can otherwise
// spawn a new client per reload; a global cache avoids exhausting the
// Postgres connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (env_is_dev()) globalForPrisma.prisma = prisma;

function env_is_dev() {
  return process.env.NODE_ENV !== "production";
}
