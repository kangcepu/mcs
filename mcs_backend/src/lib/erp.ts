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

export type SparepartErpCompany = 'UC' | 'RU' | 'GSU';

export interface SparepartErpItem {
  item_id: number;
  item_code: string;
  item_name: string;
  uom: string;
  balance_qty: number;
  category_name: string | null;
  brand_name: string | null;
  is_serialized: boolean;
  has_expiry: boolean;
  minimum_qty: number | null;
  maximum_qty: number | null;
  reorder_point: number | null;
  lead_time_days: number | null;
  disabled: boolean;
  discontinued: boolean;
  source_updated_at: string | null;
}

function normalizeSparepartErpItem(row: Record<string, unknown>): SparepartErpItem {
  return {
    item_id: Number(row.item_id),
    item_code: String(row.item_code ?? '').trim(),
    item_name: String(row.item_name ?? '').trim(),
    uom: String(row.uom ?? 'PCS').trim() || 'PCS',
    balance_qty: Number(row.balance_qty ?? 0),
    category_name: row.category_name ? String(row.category_name).trim() : null,
    brand_name: row.brand_name ? String(row.brand_name).trim() : null,
    is_serialized: Boolean(row.is_serialized),
    has_expiry: Boolean(row.has_expiry),
    minimum_qty: row.minimum_qty === null || row.minimum_qty === undefined ? null : Number(row.minimum_qty),
    maximum_qty: row.maximum_qty === null || row.maximum_qty === undefined ? null : Number(row.maximum_qty),
    reorder_point: row.reorder_point === null || row.reorder_point === undefined ? null : Number(row.reorder_point),
    lead_time_days: row.lead_time_days === null || row.lead_time_days === undefined ? null : Number(row.lead_time_days),
    disabled: Boolean(row.disabled),
    discontinued: Boolean(row.discontinued),
    source_updated_at: row.source_updated_at instanceof Date
      ? row.source_updated_at.toISOString().slice(0, 19).replace('T', ' ')
      : row.source_updated_at ? String(row.source_updated_at) : null,
  };
}

const sparepartErpSelect = `
  SELECT
    I.ItemID AS item_id,
    I.ItemCode AS item_code,
    I.ItemName AS item_name,
    U.UOMCode AS uom,
    COALESCE(Bal.Balance, 0) AS balance_qty,
    C.StockCategoryName AS category_name,
    Br.BrandName AS brand_name,
    I.RequireSN AS is_serialized,
    I.UseExpiryDate AS has_expiry,
    I.MinQuantity AS minimum_qty,
    I.MaxQuantity AS maximum_qty,
    I.ReorderLevel AS reorder_point,
    I.LeadTime AS lead_time_days,
    I.Disabled AS disabled,
    I.Discontinue AS discontinued,
    I.LastMod AS source_updated_at
  FROM dbo.IC_Items I
  LEFT JOIN dbo.IC_UOM U ON U.UOMID=I.UOMID1
  LEFT JOIN dbo.IC_ItemBalanceCache Bal ON Bal.ItemID=I.ItemID
  LEFT JOIN dbo.IC_StockCategories C ON C.StockCategoryID=I.CategoryID
  LEFT JOIN dbo.IC_Brands Br ON Br.BrandID=I.BrandID`;

export async function listSparepartErpCatalog(input: {
  company: SparepartErpCompany;
  q?: string;
  page: number;
  perPage: number;
  activeOnly?: boolean;
}): Promise<{ items: SparepartErpItem[]; total: number }> {
  const pool = await getPool(input.company);
  const term = input.q?.trim() ?? '';
  const where: string[] = ['1=1'];
  if (term) where.push('(I.ItemCode LIKE @term OR I.ItemName LIKE @term OR C.StockCategoryName LIKE @term)');
  if (input.activeOnly !== false) where.push('ISNULL(I.Disabled,0)=0 AND ISNULL(I.Discontinue,0)=0');

  const countRequest = pool.request();
  if (term) countRequest.input('term', sql.NVarChar, `%${term}%`);
  const countResult = await countRequest.query<{ total: number }>(`
    SELECT COUNT(*) total
    FROM dbo.IC_Items I
    LEFT JOIN dbo.IC_StockCategories C ON C.StockCategoryID=I.CategoryID
    WHERE ${where.join(' AND ')}`);

  const request = pool.request()
    .input('offset', sql.Int, (input.page - 1) * input.perPage)
    .input('limit', sql.Int, input.perPage);
  if (term) request.input('term', sql.NVarChar, `%${term}%`);
  const result = await request.query<Record<string, unknown>>(`
    ${sparepartErpSelect}
    WHERE ${where.join(' AND ')}
    ORDER BY I.ItemName,I.ItemCode
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
  return {
    items: result.recordset.map(normalizeSparepartErpItem),
    total: Number(countResult.recordset[0]?.total ?? 0),
  };
}

export async function getSparepartErpItems(
  company: SparepartErpCompany,
  itemIds: number[],
): Promise<SparepartErpItem[]> {
  if (!itemIds.length) return [];
  const pool = await getPool(company);
  const request = pool.request();
  const placeholders = itemIds.map((itemId, index) => {
    request.input(`item${index}`, sql.Int, itemId);
    return `@item${index}`;
  });
  const result = await request.query<Record<string, unknown>>(`
    ${sparepartErpSelect}
    WHERE I.ItemID IN (${placeholders.join(',')})
    ORDER BY I.ItemName,I.ItemCode`);
  return result.recordset.map(normalizeSparepartErpItem);
}

export async function getSparepartErpItemsByCodes(
  company: SparepartErpCompany,
  itemCodes: string[],
): Promise<SparepartErpItem[]> {
  const codes = [...new Set(itemCodes.map((value) => value.trim()).filter(Boolean))];
  if (!codes.length) return [];
  const pool = await getPool(company);
  const request = pool.request();
  const placeholders = codes.map((code, index) => {
    request.input(`code${index}`, sql.NVarChar, code);
    return `@code${index}`;
  });
  const result = await request.query<Record<string, unknown>>(`
    ${sparepartErpSelect}
    WHERE I.ItemCode IN (${placeholders.join(',')})
    ORDER BY I.ItemName,I.ItemCode`);
  return result.recordset.map(normalizeSparepartErpItem);
}

export interface SparepartErpPurchaseOrder {
  po_id: number;
  po_number: string;
  supplier_code: string | null;
  supplier_name: string | null;
  po_date: string | null;
  expected_delivery_date: string | null;
  warehouse_id: number | null;
  warehouse_code: string | null;
  warehouse_name: string | null;
  remarks: string | null;
  approved: boolean;
  closed: boolean;
  line_count: number;
  ordered_qty: number;
}

export interface SparepartErpPurchaseOrderLine {
  po_detail_id: number;
  item_id: number;
  item_code: string;
  item_name: string;
  uom: string;
  uom_level: number;
  ordered_qty: number;
  expected_delivery_date: string | null;
  remarks: string | null;
}

const erpDate = (value: unknown): string | null => value instanceof Date
  ? value.toISOString().slice(0, 19).replace('T', ' ')
  : value ? String(value) : null;

export async function listSparepartErpPurchaseOrders(input: {
  company: SparepartErpCompany;
  q?: string;
  page: number;
  perPage: number;
  includeClosed?: boolean;
}): Promise<{ items: SparepartErpPurchaseOrder[]; total: number }> {
  const pool = await getPool(input.company);
  const term = input.q?.trim() ?? '';
  const where = ['ISNULL(P.Void,0)=0', 'ISNULL(P.Approved,0)=1'];
  if (!input.includeClosed) where.push('ISNULL(P.Closed,0)=0');
  if (term) where.push('(P.PONumber LIKE @term OR S.SupplierCode LIKE @term OR S.SupplierName LIKE @term)');
  const countRequest = pool.request();
  if (term) countRequest.input('term', sql.NVarChar, `%${term}%`);
  const countResult = await countRequest.query<{ total: number }>(`
    SELECT COUNT(*) total FROM dbo.AP_PurchaseOrders P
    LEFT JOIN dbo.AP_Suppliers S ON S.SupplierID=P.SupplierID
    WHERE ${where.join(' AND ')}`);
  const request = pool.request()
    .input('offset', sql.Int, (input.page - 1) * input.perPage)
    .input('limit', sql.Int, input.perPage);
  if (term) request.input('term', sql.NVarChar, `%${term}%`);
  const result = await request.query<Record<string, unknown>>(`
    SELECT P.POID po_id,P.PONumber po_number,S.SupplierCode supplier_code,S.SupplierName supplier_name,
      P.PODate po_date,P.ExpectedDeliveryDate expected_delivery_date,W.WarehouseID warehouse_id,
      W.WarehouseCode warehouse_code,W.Name warehouse_name,P.Remarks remarks,
      P.Approved approved,P.Closed closed,COUNT(D.PODetailID) line_count,COALESCE(SUM(D.QtyOrdered),0) ordered_qty
    FROM dbo.AP_PurchaseOrders P
    LEFT JOIN dbo.AP_Suppliers S ON S.SupplierID=P.SupplierID
    LEFT JOIN dbo.IC_Warehouses W ON W.WarehouseID=P.DeliveryToWarehouseID
    LEFT JOIN dbo.AP_PurchaseOrderDetails D ON D.POID=P.POID
    WHERE ${where.join(' AND ')}
    GROUP BY P.POID,P.PONumber,S.SupplierCode,S.SupplierName,P.PODate,P.ExpectedDeliveryDate,
      W.WarehouseID,W.WarehouseCode,W.Name,P.Remarks,P.Approved,P.Closed
    ORDER BY P.PODate DESC,P.POID DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
  return {
    items: result.recordset.map((row) => ({
      po_id: Number(row.po_id), po_number: String(row.po_number ?? '').trim(),
      supplier_code: row.supplier_code ? String(row.supplier_code).trim() : null,
      supplier_name: row.supplier_name ? String(row.supplier_name).trim() : null,
      po_date: erpDate(row.po_date), expected_delivery_date: erpDate(row.expected_delivery_date),
      warehouse_id: row.warehouse_id == null ? null : Number(row.warehouse_id),
      warehouse_code: row.warehouse_code ? String(row.warehouse_code).trim() : null,
      warehouse_name: row.warehouse_name ? String(row.warehouse_name).trim() : null,
      remarks: row.remarks ? String(row.remarks).trim() : null,
      approved: Boolean(row.approved), closed: Boolean(row.closed), line_count: Number(row.line_count ?? 0),
      ordered_qty: Number(row.ordered_qty ?? 0),
    })),
    total: Number(countResult.recordset[0]?.total ?? 0),
  };
}

export async function getSparepartErpPurchaseOrder(
  company: SparepartErpCompany,
  poId: number,
): Promise<{ header: SparepartErpPurchaseOrder; lines: SparepartErpPurchaseOrderLine[] } | null> {
  const pool = await getPool(company);
  const headerResult = await pool.request().input('poId', sql.Int, poId).query<Record<string, unknown>>(`
    SELECT P.POID po_id,P.PONumber po_number,S.SupplierCode supplier_code,S.SupplierName supplier_name,
      P.PODate po_date,P.ExpectedDeliveryDate expected_delivery_date,W.WarehouseID warehouse_id,
      W.WarehouseCode warehouse_code,W.Name warehouse_name,P.Remarks remarks,
      P.Approved approved,P.Closed closed,COUNT(D.PODetailID) line_count,COALESCE(SUM(D.QtyOrdered),0) ordered_qty
    FROM dbo.AP_PurchaseOrders P
    LEFT JOIN dbo.AP_Suppliers S ON S.SupplierID=P.SupplierID
    LEFT JOIN dbo.IC_Warehouses W ON W.WarehouseID=P.DeliveryToWarehouseID
    LEFT JOIN dbo.AP_PurchaseOrderDetails D ON D.POID=P.POID
    WHERE P.POID=@poId AND ISNULL(P.Void,0)=0
    GROUP BY P.POID,P.PONumber,S.SupplierCode,S.SupplierName,P.PODate,P.ExpectedDeliveryDate,
      W.WarehouseID,W.WarehouseCode,W.Name,P.Remarks,P.Approved,P.Closed`);
  const row = headerResult.recordset[0];
  if (!row) return null;
  const linesResult = await pool.request().input('poId', sql.Int, poId).query<Record<string, unknown>>(`
    SELECT D.PODetailID po_detail_id,D.ItemID item_id,I.ItemCode item_code,I.ItemName item_name,
      CASE D.UOMLevel WHEN 2 THEN U2.UOMCode WHEN 3 THEN U3.UOMCode WHEN 4 THEN U4.UOMCode ELSE U1.UOMCode END uom,
      D.UOMLevel uom_level,D.QtyOrdered ordered_qty,D.ItemExpectedDate expected_delivery_date,D.Remarks remarks
    FROM dbo.AP_PurchaseOrderDetails D
    JOIN dbo.IC_Items I ON I.ItemID=D.ItemID
    LEFT JOIN dbo.IC_UOM U1 ON U1.UOMID=I.UOMID1 LEFT JOIN dbo.IC_UOM U2 ON U2.UOMID=I.UOMID2
    LEFT JOIN dbo.IC_UOM U3 ON U3.UOMID=I.UOMID3 LEFT JOIN dbo.IC_UOM U4 ON U4.UOMID=I.UOMID4
    WHERE D.POID=@poId ORDER BY D.DisplayIndex,D.PODetailID`);
  const header: SparepartErpPurchaseOrder = {
    po_id: Number(row.po_id), po_number: String(row.po_number ?? '').trim(),
    supplier_code: row.supplier_code ? String(row.supplier_code).trim() : null,
    supplier_name: row.supplier_name ? String(row.supplier_name).trim() : null,
    po_date: erpDate(row.po_date), expected_delivery_date: erpDate(row.expected_delivery_date),
    warehouse_id: row.warehouse_id == null ? null : Number(row.warehouse_id),
    warehouse_code: row.warehouse_code ? String(row.warehouse_code).trim() : null,
    warehouse_name: row.warehouse_name ? String(row.warehouse_name).trim() : null,
    remarks: row.remarks ? String(row.remarks).trim() : null,
    approved: Boolean(row.approved), closed: Boolean(row.closed), line_count: Number(row.line_count ?? 0), ordered_qty: Number(row.ordered_qty ?? 0),
  };
  return { header, lines: linesResult.recordset.map((line) => ({
    po_detail_id: Number(line.po_detail_id), item_id: Number(line.item_id), item_code: String(line.item_code ?? '').trim(),
    item_name: String(line.item_name ?? '').trim(), uom: String(line.uom ?? 'PCS').trim() || 'PCS',
    uom_level: Number(line.uom_level ?? 1), ordered_qty: Number(line.ordered_qty ?? 0),
    expected_delivery_date: erpDate(line.expected_delivery_date), remarks: line.remarks ? String(line.remarks).trim() : null,
  })) };
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

export interface MaterialSearchItem {
  item_id: number;
  item_code: string;
  item_name: string;
  company: 'UC' | 'RU';
  uom: string;
  uom_level: number;
}

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

/**
 * Cari item master UC dan RU sambil mempertahankan identitas ERP asalnya.
 * GSU memakai `searchUsageItemGsu` karena membutuhkan pencocokan tambahan
 * terhadap database GSU_TEST5 untuk metadata UOM.
 */
export async function searchMaterialItemsUcRu(term: string): Promise<MaterialSearchItem[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];

  const queryOne = async (company: 'UC' | 'RU'): Promise<MaterialSearchItem[]> => {
    try {
      const pool = await getPool(company);
      const result = await pool.request()
        .input('term', sql.NVarChar, `%${trimmed}%`)
        .query<{
          item_id: number;
          item_code: string;
          item_name: string;
          uom: string | null;
          uom_level: number | null;
        }>(`
          SELECT TOP 50
            I.ItemID AS item_id,
            I.ItemCode AS item_code,
            I.ItemName AS item_name,
            U.UOMCode AS uom,
            CAST(1 AS tinyint) AS uom_level
          FROM dbo.IC_Items I
          LEFT JOIN dbo.IC_UOM U ON U.UOMID = I.UOMID1
          WHERE I.ItemName LIKE @term OR I.ItemCode LIKE @term
          ORDER BY I.ItemName ASC
        `);
      return result.recordset.map((item) => ({
        item_id: Number(item.item_id),
        item_code: String(item.item_code ?? ''),
        item_name: String(item.item_name ?? ''),
        company,
        uom: String(item.uom ?? 'PCS'),
        uom_level: Number(item.uom_level ?? 1),
      }));
    } catch {
      return [];
    }
  };

  const [uc, ru] = await Promise.all([queryOne('UC'), queryOne('RU')]);
  return [...uc, ...ru];
}
