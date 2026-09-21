import sql from 'mssql';
import { config } from '../config.js';

type ErpDb = 'UC' | 'RU' | 'GSU' | 'GSU_TEST5';

const pools = new Map<ErpDb, sql.ConnectionPool>();

export async function closeErpPools(): Promise<void> {
  await Promise.all([...pools.values()].map((pool) => pool.close().catch(() => undefined)));
  pools.clear();
}

async function getPool(db: ErpDb): Promise<sql.ConnectionPool> {
  const existing = pools.get(db);
  if (existing?.connected) return existing;

  const pool = new sql.ConnectionPool({
    server: config.erpMssql.host,
    port: config.erpMssql.port,
    user: config.erpMssql.user,
    password: config.erpMssql.password,
    database: config.erpMssql.databases[db],
    options: { encrypt: false, trustServerCertificate: true },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout: 12000,
    connectionTimeout: 8000,
  });
  pool.on('error', () => pools.delete(db));
  await pool.connect();
  pools.set(db, pool);
  return pool;
}

interface ProductionItem {
  item_id: number;
  item_code: string;
  item_name: string;
  uom: string | null;
  uom_level: number;
}

interface TestItem {
  item_id: number;
  item_code: string;
  uom: string | null;
  uom_level: number;
}

export interface UsageItemResult {
  item_id: number;
  item_code: string;
  item_name: string;
  uom: string;
  uom_level: number;
  source_item_id: number;
  test_item_id: number;
  test_available: boolean;
}

export async function searchUsageItemGsu(term: string): Promise<UsageItemResult[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];

  const gsuPool = await getPool('GSU');
  const productionResult = await gsuPool.request()
    .input('term', sql.NVarChar, `%${trimmed}%`)
    .query<ProductionItem>(`
      SELECT TOP 50 I.ItemID AS item_id, I.ItemCode AS item_code, I.ItemName AS item_name, U.UOMCode AS uom, CAST(1 AS tinyint) AS uom_level
      FROM dbo.IC_Items I
      LEFT JOIN dbo.IC_UOM U ON U.UOMID = I.UOMID1
      WHERE I.ItemName LIKE @term OR I.ItemCode LIKE @term
      ORDER BY I.ItemName ASC
    `);
  const productionItems = productionResult.recordset;
  if (!productionItems.length) return [];

  const itemCodes = [...new Set(productionItems.map((i) => String(i.item_code ?? '').trim()).filter(Boolean))];
  const testByCode = new Map<string, TestItem>();
  if (itemCodes.length) {
    const test5Pool = await getPool('GSU_TEST5');
    const request = test5Pool.request();
    const placeholders = itemCodes.map((code, i) => { request.input(`code${i}`, sql.NVarChar, code); return `@code${i}`; });
    const testResult = await request.query<TestItem>(`
      SELECT I.ItemID AS item_id, I.ItemCode AS item_code, U.UOMCode AS uom, CAST(1 AS tinyint) AS uom_level
      FROM dbo.IC_Items I
      LEFT JOIN dbo.IC_UOM U ON U.UOMID = I.UOMID1
      WHERE I.ItemCode IN (${placeholders.join(',')})
    `);
    for (const item of testResult.recordset) testByCode.set(String(item.item_code).trim(), item);
  }

  return productionItems.map((item): UsageItemResult => {
    const testItem = testByCode.get(String(item.item_code ?? '').trim());
    return {
      item_id: Number(item.item_id),
      item_code: String(item.item_code ?? ''),
      item_name: String(item.item_name ?? ''),
      uom: String((testItem?.uom ?? item.uom) ?? 'PCS'),
      uom_level: testItem ? Number(testItem.uom_level) : 1,
      source_item_id: Number(item.item_id),
      test_item_id: testItem ? Number(testItem.item_id) : 0,
      test_available: Boolean(testItem),
    };
  });
}

interface SimpleItem { ItemID: number; ItemCode: string; ItemName: string }

export async function searchMaterialSimple(term: string): Promise<string[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];
  const like = `%${trimmed}%`;

  const queryOne = async (db: ErpDb): Promise<SimpleItem[]> => {
    try {
      const pool = await getPool(db);
      const result = await pool.request().input('term', sql.NVarChar, like).query<SimpleItem>(`
        SELECT TOP 200 ItemID, ItemCode, ItemName FROM dbo.IC_Items WHERE ItemName LIKE @term ORDER BY ItemName ASC
      `);
      return result.recordset;
    } catch {
      return [];
    }
  };

  const [uc, ru, gsu] = await Promise.all([queryOne('UC'), queryOne('RU'), queryOne('GSU')]);
  return [...uc, ...ru, ...gsu].map((i) => String(i.ItemName ?? ''));
}
