import mariadb from "mariadb";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionUrl = process.env.DATABASE_URL;
  if (!connectionUrl) {
    throw new Error("DATABASE_URL environment variable is not defined");
  }

  const url = new URL(connectionUrl);

  const pool = mariadb.createPool({
    host: url.hostname,
    port: parseInt(url.port || "3306", 10),
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectTimeout: 30000,
    acquireTimeout: 30000,
    idleTimeout: 30000,
    connectionLimit: 10,
  });

  const adapter = new PrismaMariaDb(pool);

  return new PrismaClient({
    adapter,
    transactionOptions: {
      maxWait: 20000,
      timeout: 30000,
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
