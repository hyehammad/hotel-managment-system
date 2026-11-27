import mariadb, { type Pool, type PoolConnection } from "mariadb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend/.env reliably regardless of cwd
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

export type RoomStatus = "available" | "occupied" | "cleaning" | "maintenance";

export interface ExecResult {
  affectedRows: number;
  insertId: number;
}

export interface DbClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<ExecResult>;
}

const TRANSIENT_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "PROTOCOL_CONNECTION_LOST",
  "ER_SOCKET_UNEXPECTED_CLOSE",
]);

function isTransientNetworkError(err: any): boolean {
  if (!err) return false;
  if (TRANSIENT_ERROR_CODES.has(err.code) || TRANSIENT_ERROR_CODES.has(err.cause?.code)) {
    return true;
  }
  const msg = String(err.message || "");
  return msg.includes("ECONNRESET") || msg.includes("Connection lost") || msg.includes("socket has unexpectedly been closed");
}

let pool: Pool | undefined;

export function getOrCreatePool(): Pool {
  if (pool) return pool;

  const connectionUrl = process.env.DATABASE_URL;
  if (!connectionUrl) {
    throw new Error("DATABASE_URL environment variable is not defined");
  }

  const url = new URL(connectionUrl);

  pool = mariadb.createPool({
    host: url.hostname,
    port: parseInt(url.port || "3306", 10),
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectTimeout: 30000,
    acquireTimeout: 45000,
    idleTimeout: 120,
    connectionLimit: 6,
    minimumIdle: 1,
    minDelayValidation: 5000,
    pingTimeout: 5000,
    keepAliveDelay: 15000,
    bigIntAsNumber: true,
    insertIdAsNumber: true,
  });

  (pool as unknown as { on(event: string, listener: (err: any) => void): void }).on("error", (err: any) => {
    console.error("[DB Pool] Background pool error:", err?.message || err);
  });

  return pool;
}

async function runWithRetry<T>(operation: () => Promise<T>, maxRetries = 1): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries && isTransientNetworkError(err)) {
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function createClient(
  executor: { query: (sql: string, values?: any[]) => Promise<any> },
  allowRetry: boolean
): DbClient {
  const exec = <T>(fn: () => Promise<T>) => (allowRetry ? runWithRetry(fn, 1) : fn());

  return {
    async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
      return exec(async () => {
        const rows = await executor.query(sql, params);
        return Array.isArray(rows) ? (rows as T[]) : [];
      });
    },
    async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
      return exec(async () => {
        const rows = await executor.query(sql, params);
        return Array.isArray(rows) && rows.length > 0 ? (rows[0] as T) : null;
      });
    },
    async execute(sql: string, params: any[] = []): Promise<ExecResult> {
      const res = await executor.query(sql, params);
      return {
        affectedRows: Number(res?.affectedRows ?? 0),
        insertId: Number(res?.insertId ?? 0),
      };
    },
  };
}

export const db: DbClient = {
  query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return createClient(getOrCreatePool(), true).query<T>(sql, params);
  },
  queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    return createClient(getOrCreatePool(), true).queryOne<T>(sql, params);
  },
  execute(sql: string, params: any[] = []): Promise<ExecResult> {
    return createClient(getOrCreatePool(), false).execute(sql, params);
  },
};

export async function withTransaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
  const conn: PoolConnection = await getOrCreatePool().getConnection();
  try {
    await conn.beginTransaction();
    const tx = createClient(conn, false);
    const result = await fn(tx);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback errors if connection already closed
    }
    throw err;
  } finally {
    conn.release();
  }
}

export function toIsoDate(val: Date | string | null | undefined): string {
  if (!val) return "";
  if (val instanceof Date) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, "0");
    const day = String(val.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(val).split("T")[0].split(" ")[0];
}

export function toIsoDateTime(val: Date | string | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? String(val) : parsed.toISOString();
}
