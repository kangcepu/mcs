import mysql, { type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 12,
  queueLimit: 0,
  timezone: '+07:00',
  dateStrings: true,
});

export async function rows<T = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [result] = await pool.query(sql, params as never);
  return result as T[];
}

export async function one<T = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await rows<T>(sql, params))[0] ?? null;
}

export async function execute(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [result] = await pool.execute<ResultSetHeader>(sql, params as never);
  return result;
}

export async function transaction<T>(fn: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const value = await fn(connection);
    await connection.commit();
    return value;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function tableExists(name: string): Promise<boolean> {
  return Boolean(await one('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [name]));
}

const columnCache = new Map<string, Set<string>>();

export async function tableColumns(table: string): Promise<Set<string>> {
  const cached = columnCache.get(table);
  if (cached) return cached;
  const columns = await rows<{ COLUMN_NAME: string }>(
    'SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
    [table],
  );
  const set = new Set(columns.map((c) => c.COLUMN_NAME));
  columnCache.set(table, set);
  return set;
}

export async function hasColumn(table: string, column: string): Promise<boolean> {
  return (await tableColumns(table)).has(column);
}
