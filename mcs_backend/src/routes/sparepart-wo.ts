import { Router } from "express";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { authenticate, requirePermission } from "../auth.js";
import { one, rows, tableExists, transaction, withNamedLock } from "../db.js";
import { asyncHandler, created, HttpError, ok } from "../http.js";
import type { AuthRequest } from "../types.js";

export const sparepartWoRouter = Router();
const canUse = requirePermission("material_usage");
const WO_TABLES: Record<string, string> = {
  is: "tb_wo_it",
  ga: "tb_wo_ga",
  meso: "tb_wo_mtc",
  maintenance: "tb_wo_mtc_operational",
  production: "tb_wo_preventive",
};

function actor(req: AuthRequest): string {
  return String(req.user?.fullname || req.user?.username || "SYSTEM").trim();
}
function positiveId(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0)
    throw new HttpError(422, `${label} tidak valid.`);
  return id;
}
function text(
  value: unknown,
  label: string,
  max: number,
  required = false,
): string | null {
  const result = String(value ?? "").trim();
  if (!result) {
    if (required) throw new HttpError(422, `${label} wajib diisi.`);
    return null;
  }
  if (result.length > max)
    throw new HttpError(422, `${label} maksimal ${max} karakter.`);
  return result;
}
function qty(value: unknown, label: string): number {
  const parsed = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new HttpError(422, `${label} harus berupa angka minimal 0.`);
  return parsed;
}
function requestNumber(): string {
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
  ].join("");
  return `SP-REQ-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
}
async function ensureWoFlow(): Promise<void> {
  if (
    !(await tableExists("sparepart_wo_request")) ||
    !(await tableExists("sparepart_stock_ledger"))
  )
    throw new HttpError(503, "Migration Sparepart WO Flow belum dijalankan.");
}

async function woReference(
  module: string,
  woNumber: string,
  connection?: PoolConnection,
): Promise<any> {
  const table = WO_TABLES[module];
  if (!table) throw new HttpError(422, "Module WO tidak valid.");
  const sql = `SELECT w.wo_number,w.id_equipment,w.job_title,w.status,a.AssetCode,a.AssetName FROM \`${table}\` w LEFT JOIN asset a ON a.AssetID=w.id_equipment WHERE w.wo_number=? LIMIT 1`;
  if (connection) {
    const [result] = await connection.query(sql, [woNumber]);
    return (result as any[])[0] ?? null;
  }
  return one<any>(sql, [woNumber]);
}

async function addHistory(
  connection: PoolConnection,
  requestId: number,
  action: string,
  fromStatus: string | null,
  toStatus: string,
  note: string | null,
  username: string,
): Promise<void> {
  await connection.execute(
    `INSERT INTO sparepart_wo_history (request_id,action_type,from_status,to_status,action_note,acted_by,acted_at) VALUES (?,?,?,?,?,?,NOW())`,
    [requestId, action, fromStatus, toStatus, note, username],
  );
}

sparepartWoRouter.use("/spareparts/wo", authenticate, canUse);

sparepartWoRouter.get(
  "/spareparts/wo/history",
  asyncHandler(async (req, res) => {
    await ensureWoFlow();
    const q = String(req.query.q ?? "").trim().slice(0, 150);
    const assetId = Number(req.query.asset_id ?? 0);
    const woNumber = String(req.query.wo_number ?? "").trim().slice(0, 120);
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const perPage = Math.min(100, Math.max(10, Number(req.query.per_page ?? 25) || 25));
    const where = ["1=1"];
    const params: unknown[] = [];
    if (Number.isInteger(assetId) && assetId > 0) { where.push("h.asset_id=?"); params.push(assetId); }
    if (woNumber) { where.push("h.wo_number LIKE ?"); params.push(`%${woNumber}%`); }
    if (q) {
      where.push("(h.request_number LIKE ? OR h.wo_number LIKE ? OR a.AssetCode LIKE ? OR a.AssetName LIKE ? OR p.part_code LIKE ? OR p.part_name LIKE ?)");
      params.push(...Array(6).fill(`%${q}%`));
    }
    const count = await one<{ total: number }>(
      `SELECT COUNT(*) total FROM sparepart_wo_request_line l
       JOIN sparepart_wo_request h ON h.id=l.request_id JOIN sparepart_master p ON p.id=l.sparepart_id
       LEFT JOIN asset a ON a.AssetID=h.asset_id WHERE ${where.join(" AND ")}`,
      params,
    );
    const items = await rows<any>(
      `SELECT l.id line_id,h.id request_id,h.request_number,h.wo_module,h.wo_number,h.status,h.requested_at,h.requested_by,
        h.completed_at,h.completed_by,a.AssetID asset_id,a.AssetCode,a.AssetName,a.CompanyName,
        p.id sparepart_id,p.part_code,p.part_name,l.uom,l.requested_qty,l.reserved_qty,l.picked_qty,l.issued_qty,
        l.used_qty,l.returned_available_qty,l.returned_hold_qty,l.line_note
       FROM sparepart_wo_request_line l JOIN sparepart_wo_request h ON h.id=l.request_id
       JOIN sparepart_master p ON p.id=l.sparepart_id LEFT JOIN asset a ON a.AssetID=h.asset_id
       WHERE ${where.join(" AND ")} ORDER BY h.requested_at DESC,h.id DESC,l.id
       LIMIT ? OFFSET ?`,
      [...params, perPage, (page - 1) * perPage],
    );
    const summary = await one<any>(
      `SELECT COUNT(DISTINCT h.id) request_count,COUNT(DISTINCT h.wo_number) wo_count,
        COUNT(DISTINCT h.asset_id) asset_count,COALESCE(SUM(l.used_qty),0) used_qty,
        COALESCE(SUM(l.returned_available_qty+l.returned_hold_qty),0) returned_qty
       FROM sparepart_wo_request_line l JOIN sparepart_wo_request h ON h.id=l.request_id
       JOIN sparepart_master p ON p.id=l.sparepart_id LEFT JOIN asset a ON a.AssetID=h.asset_id
       WHERE ${where.join(" AND ")}`,
      params,
    );
    const total = Number(count?.total ?? 0);
    ok(res, { items, summary }, "History sparepart Asset/WO berhasil dimuat.", {
      page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)),
    });
  }),
);

sparepartWoRouter.get(
  "/spareparts/wo/search",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      ok(res, []);
      return;
    }
    const resultSets = await Promise.all(
      Object.entries(WO_TABLES).map(([module, table]) =>
        rows<any>(
          `SELECT '${module}' module,w.wo_number,w.job_title,w.status,w.id_equipment,a.AssetCode,a.AssetName
     FROM \`${table}\` w LEFT JOIN asset a ON a.AssetID=w.id_equipment
     WHERE (w.wo_number LIKE ? OR w.job_title LIKE ? OR a.AssetCode LIKE ? OR a.AssetName LIKE ?)
       AND UPPER(TRIM(COALESCE(w.status,''))) NOT IN ('CLOSED','VOID','REJECT','DECLINE')
     ORDER BY COALESCE(w.created_at,CONCAT(w.date,' 00:00:00')) DESC LIMIT 15`,
          [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`],
        ).catch(() => []),
      ),
    );
    ok(res, resultSets.flat().slice(0, 50));
  }),
);

sparepartWoRouter.get(
  "/spareparts/wo/requests",
  asyncHandler(async (req, res) => {
    await ensureWoFlow();
    const q = String(req.query.q ?? "").trim();
    const status = String(req.query.status ?? "")
      .trim()
      .toUpperCase();
    const where = ["1=1"];
    const params: unknown[] = [];
    if (q) {
      where.push(
        "(h.request_number LIKE ? OR h.wo_number LIKE ? OR a.AssetCode LIKE ? OR a.AssetName LIKE ?)",
      );
      params.push(...Array(4).fill(`%${q}%`));
    }
    if (status) {
      where.push("h.status=?");
      params.push(status);
    }
    const requests = await rows<any>(
      `SELECT h.*,a.AssetCode,a.AssetName,w.warehouse_code,w.warehouse_name,
    COUNT(l.id) line_count,COALESCE(SUM(l.requested_qty),0) requested_qty,COALESCE(SUM(l.reserved_qty),0) reserved_qty,
    COALESCE(SUM(l.issued_qty),0) issued_qty,COALESCE(SUM(l.used_qty),0) used_qty,
    COALESCE(SUM(l.returned_available_qty+l.returned_hold_qty),0) returned_qty
    FROM sparepart_wo_request h LEFT JOIN asset a ON a.AssetID=h.asset_id JOIN sparepart_warehouse w ON w.id=h.warehouse_id
    LEFT JOIN sparepart_wo_request_line l ON l.request_id=h.id WHERE ${where.join(" AND ")}
    GROUP BY h.id ORDER BY h.requested_at DESC,h.id DESC LIMIT 300`,
      params,
    );
    const [parts, warehouses] = await Promise.all([
      rows<any>(
        `SELECT id,part_code,part_name,base_uom,is_serialized,is_lot_controlled,has_expiry FROM sparepart_master WHERE status='ACTIVE' ORDER BY part_name`,
      ),
      rows<any>(
        `SELECT id,warehouse_code,warehouse_name,company_code FROM sparepart_warehouse WHERE status='ACTIVE' ORDER BY warehouse_name`,
      ),
    ]);
    ok(res, { requests, parts, warehouses });
  }),
);

sparepartWoRouter.get(
  "/spareparts/wo/requests/:id",
  asyncHandler(async (req, res) => {
    await ensureWoFlow();
    const id = positiveId(req.params.id, "Request");
    const header = await one<any>(
      `SELECT h.*,a.AssetCode,a.AssetName,w.warehouse_code,w.warehouse_name FROM sparepart_wo_request h LEFT JOIN asset a ON a.AssetID=h.asset_id JOIN sparepart_warehouse w ON w.id=h.warehouse_id WHERE h.id=?`,
      [id],
    );
    if (!header) throw new HttpError(404, "Request sparepart tidak ditemukan.");
    const [lines, allocations, allocationSerials, history] = await Promise.all([
      rows<any>(
        `SELECT l.*,p.part_code,p.part_name,p.is_serialized FROM sparepart_wo_request_line l JOIN sparepart_master p ON p.id=l.sparepart_id WHERE l.request_id=? ORDER BY l.id`,
        [id],
      ),
      rows<any>(
        `SELECT al.*,l.request_id,p.part_code,p.part_name,r.rack_code,b.bin_code FROM sparepart_wo_allocation al JOIN sparepart_wo_request_line l ON l.id=al.request_line_id JOIN sparepart_master p ON p.id=l.sparepart_id JOIN sparepart_bin b ON b.id=al.bin_id JOIN sparepart_rack r ON r.id=b.rack_id WHERE l.request_id=? ORDER BY l.id,al.expiry_date,al.id`,
        [id],
      ),
      rows<any>(
        `SELECT s.*,al.request_line_id FROM sparepart_wo_allocation_serial s JOIN sparepart_wo_allocation al ON al.id=s.allocation_id JOIN sparepart_wo_request_line l ON l.id=al.request_line_id WHERE l.request_id=? ORDER BY s.serial_number`,
        [id],
      ),
      rows<any>(
        `SELECT * FROM sparepart_wo_history WHERE request_id=? ORDER BY acted_at,id`,
        [id],
      ),
    ]);
    ok(res, {
      ...header,
      lines: lines.map((line) => ({
        ...line,
        allocations: allocations
          .filter((item) => item.request_line_id === line.id)
          .map((allocation) => ({
            ...allocation,
            serials: allocationSerials.filter(
              (serial) => serial.allocation_id === allocation.id,
            ),
          })),
      })),
      history,
    });
  }),
);

sparepartWoRouter.post(
  "/spareparts/wo/requests",
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureWoFlow();
    const module = String(req.body.wo_module ?? "")
      .trim()
      .toLowerCase();
    const woNumber = String(text(req.body.wo_number, "Nomor WO", 120, true));
    const warehouseId = positiveId(req.body.warehouse_id, "Warehouse");
    const lines = Array.isArray(req.body.lines)
      ? (req.body.lines as any[])
      : [];
    if (!lines.length)
      throw new HttpError(422, "Minimal satu sparepart wajib diminta.");
    try {
      const id = await transaction(async (connection) => {
        const wo = await woReference(module, woNumber, connection);
        if (!wo) throw new HttpError(404, "Work Order tidak ditemukan.");
        const [warehouseRows] = await connection.query(
          `SELECT id FROM sparepart_warehouse WHERE id=? AND status='ACTIVE'`,
          [warehouseId],
        );
        if (!(warehouseRows as any[])[0])
          throw new HttpError(
            422,
            "Warehouse tidak aktif atau tidak ditemukan.",
          );
        const [insert] = await connection.execute<ResultSetHeader>(
          `INSERT INTO sparepart_wo_request (request_number,wo_module,wo_number,asset_id,warehouse_id,status,request_note,requested_by,requested_at,created_at) VALUES (?,?,?,?,?,'REQUESTED',?,?,NOW(),NOW())`,
          [
            requestNumber(),
            module,
            woNumber,
            wo.id_equipment || null,
            warehouseId,
            text(req.body.request_note, "Catatan", 5000),
            actor(req),
          ],
        );
        const seen = new Set<number>();
        for (const [index, line] of lines.entries()) {
          const partId = positiveId(
            line.sparepart_id,
            `Sparepart baris ${index + 1}`,
          );
          if (seen.has(partId))
            throw new HttpError(
              422,
              "Sparepart yang sama tidak boleh diduplikasi dalam satu request.",
            );
          seen.add(partId);
          const requested = qty(line.requested_qty, `Qty baris ${index + 1}`);
          if (requested <= 0)
            throw new HttpError(
              422,
              `Qty baris ${index + 1} harus lebih dari 0.`,
            );
          const [partRows] = await connection.query(
            `SELECT id,base_uom FROM sparepart_master WHERE id=? AND status='ACTIVE'`,
            [partId],
          );
          const part = (partRows as any[])[0];
          if (!part)
            throw new HttpError(
              422,
              `Sparepart baris ${index + 1} tidak ditemukan.`,
            );
          await connection.execute(
            `INSERT INTO sparepart_wo_request_line (request_id,sparepart_id,requested_qty,uom,line_note,created_at) VALUES (?,?,?,?,?,NOW())`,
            [
              insert.insertId,
              partId,
              requested,
              part.base_uom,
              text(line.line_note, "Catatan baris", 500),
            ],
          );
        }
        await addHistory(
          connection,
          insert.insertId,
          "CREATE",
          null,
          "REQUESTED",
          null,
          actor(req),
        );
        return insert.insertId;
      });
      const saved = await one<any>(
        "SELECT request_number,status FROM sparepart_wo_request WHERE id=?",
        [id],
      );
      created(res, { id, ...saved }, "Request sparepart WO berhasil dibuat.");
    } catch (error) {
      if ((error as any)?.code === "ER_DUP_ENTRY")
        throw new HttpError(409, "Request atau sparepart terduplikasi.");
      throw error;
    }
  }),
);

sparepartWoRouter.post(
  "/spareparts/wo/requests/:id/reserve",
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureWoFlow();
    const id = positiveId(req.params.id, "Request");
    await withNamedLock("sparepart-wo-reservation", () =>
      transaction(async (connection) => {
        const [headerRows] = await connection.query(
          `SELECT * FROM sparepart_wo_request WHERE id=? FOR UPDATE`,
          [id],
        );
        const header = (headerRows as any[])[0];
        if (!header) throw new HttpError(404, "Request tidak ditemukan.");
        if (header.status !== "REQUESTED")
          throw new HttpError(
            409,
            "Hanya request REQUESTED yang dapat direservasi.",
          );
        const [lineRows] = await connection.query(
          `SELECT l.*,p.is_serialized FROM sparepart_wo_request_line l JOIN sparepart_master p ON p.id=l.sparepart_id WHERE l.request_id=? ORDER BY l.id`,
          [id],
        );
        for (const line of lineRows as any[]) {
          const [stockRows] = await connection.query(
            `SELECT l.bin_id,l.lot_number,l.expiry_date,
        SUM(CASE WHEN l.stock_bucket='AVAILABLE' THEN l.quantity_delta ELSE 0 END)
        - COALESCE((SELECT SUM(al.reserved_qty-al.issued_qty-al.released_qty) FROM sparepart_wo_allocation al JOIN sparepart_wo_request_line rl ON rl.id=al.request_line_id JOIN sparepart_wo_request rh ON rh.id=rl.request_id WHERE rl.sparepart_id=? AND al.bin_id=l.bin_id AND COALESCE(al.lot_number,'')=COALESCE(l.lot_number,'') AND COALESCE(al.expiry_date,'1000-01-01')=COALESCE(l.expiry_date,'1000-01-01') AND rh.status IN ('RESERVED','PICKED')),0) available_qty
        FROM sparepart_stock_ledger l WHERE l.sparepart_id=? AND l.warehouse_id=? GROUP BY l.bin_id,l.lot_number,l.expiry_date
        HAVING available_qty>0 ORDER BY (l.expiry_date IS NULL),l.expiry_date,l.bin_id`,
            [line.sparepart_id, line.sparepart_id, header.warehouse_id],
          );
          let remaining = Number(line.requested_qty);
          for (const stock of stockRows as any[]) {
            if (remaining <= 0) break;
            const take = Math.min(remaining, Number(stock.available_qty));
            if (take <= 0) continue;
            if (Number(line.is_serialized) === 1 && !Number.isInteger(take))
              throw new HttpError(
                409,
                "Stok serial menghasilkan alokasi pecahan yang tidak valid.",
              );
            const [allocation] = await connection.execute<ResultSetHeader>(
              `INSERT INTO sparepart_wo_allocation (request_line_id,bin_id,lot_number,expiry_date,reserved_qty,created_at) VALUES (?,?,?,?,?,NOW())`,
              [
                line.id,
                stock.bin_id,
                stock.lot_number,
                stock.expiry_date,
                take,
              ],
            );
            if (Number(line.is_serialized) === 1) {
              const [serialRows] = await connection.query(
                `SELECT s.id,s.serial_number FROM sparepart_receipt_serial s JOIN sparepart_receipt_line rl ON rl.id=s.receipt_line_id WHERE s.sparepart_id=? AND rl.bin_id=? AND COALESCE(rl.lot_number,'')=COALESCE(?,'') AND COALESCE(rl.expiry_date,'1000-01-01')=COALESCE(?,'1000-01-01') AND s.stock_status='IN_STOCK' AND NOT EXISTS (SELECT 1 FROM sparepart_wo_allocation_serial axs JOIN sparepart_wo_allocation ax ON ax.id=axs.allocation_id JOIN sparepart_wo_request_line xl ON xl.id=ax.request_line_id JOIN sparepart_wo_request xh ON xh.id=xl.request_id WHERE axs.receipt_serial_id=s.id AND xh.status IN ('RESERVED','PICKED')) ORDER BY s.id LIMIT ?`,
                [
                  line.sparepart_id,
                  stock.bin_id,
                  stock.lot_number,
                  stock.expiry_date,
                  take,
                ],
              );
              if ((serialRows as any[]).length !== take)
                throw new HttpError(
                  409,
                  "Serial number available tidak mencukupi untuk alokasi.",
                );
              for (const serial of serialRows as any[])
                await connection.execute(
                  `INSERT INTO sparepart_wo_allocation_serial (allocation_id,receipt_serial_id,serial_number,status,created_at) VALUES (?,?,?,'RESERVED',NOW())`,
                  [allocation.insertId, serial.id, serial.serial_number],
                );
            }
            remaining -= take;
          }
          if (remaining > 0.000001)
            throw new HttpError(
              409,
              `Stok ${line.uom} untuk salah satu sparepart tidak mencukupi. Kekurangan ${remaining}.`,
            );
          await connection.execute(
            `UPDATE sparepart_wo_request_line SET reserved_qty=requested_qty,updated_at=NOW() WHERE id=?`,
            [line.id],
          );
        }
        await connection.execute(
          `UPDATE sparepart_wo_request SET status='RESERVED',reserved_by=?,reserved_at=NOW(),updated_at=NOW() WHERE id=?`,
          [actor(req), id],
        );
        await addHistory(
          connection,
          id,
          "RESERVE",
          "REQUESTED",
          "RESERVED",
          null,
          actor(req),
        );
      }),
    );
    ok(
      res,
      { id, status: "RESERVED" },
      "Stok berhasil direservasi secara FEFO.",
    );
  }),
);

sparepartWoRouter.post(
  "/spareparts/wo/requests/:id/pick",
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureWoFlow();
    const id = positiveId(req.params.id, "Request");
    await transaction(async (connection) => {
      const [r] = await connection.query(
        `SELECT status FROM sparepart_wo_request WHERE id=? FOR UPDATE`,
        [id],
      );
      const h = (r as any[])[0];
      if (!h) throw new HttpError(404, "Request tidak ditemukan.");
      if (h.status !== "RESERVED")
        throw new HttpError(
          409,
          "Hanya request RESERVED yang dapat di-picking.",
        );
      await connection.execute(
        `UPDATE sparepart_wo_allocation al JOIN sparepart_wo_request_line l ON l.id=al.request_line_id SET al.picked_qty=al.reserved_qty,al.updated_at=NOW() WHERE l.request_id=?`,
        [id],
      );
      await connection.execute(
        `UPDATE sparepart_wo_allocation_serial s JOIN sparepart_wo_allocation al ON al.id=s.allocation_id JOIN sparepart_wo_request_line l ON l.id=al.request_line_id SET s.status='PICKED',s.updated_at=NOW() WHERE l.request_id=?`,
        [id],
      );
      await connection.execute(
        `UPDATE sparepart_wo_request_line SET picked_qty=reserved_qty,updated_at=NOW() WHERE request_id=?`,
        [id],
      );
      await connection.execute(
        `UPDATE sparepart_wo_request SET status='PICKED',picked_by=?,picked_at=NOW(),updated_at=NOW() WHERE id=?`,
        [actor(req), id],
      );
      await addHistory(
        connection,
        id,
        "PICK",
        "RESERVED",
        "PICKED",
        null,
        actor(req),
      );
    });
    ok(
      res,
      { id, status: "PICKED" },
      "Picking sparepart berhasil dikonfirmasi.",
    );
  }),
);

sparepartWoRouter.post(
  "/spareparts/wo/requests/:id/issue",
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureWoFlow();
    const id = positiveId(req.params.id, "Request");
    await transaction(async (connection) => {
      const [r] = await connection.query(
        `SELECT * FROM sparepart_wo_request WHERE id=? FOR UPDATE`,
        [id],
      );
      const h = (r as any[])[0];
      if (!h) throw new HttpError(404, "Request tidak ditemukan.");
      if (h.status !== "PICKED")
        throw new HttpError(409, "Hanya request PICKED yang dapat di-issue.");
      const [allocRows] = await connection.query(
        `SELECT al.*,l.sparepart_id,l.uom FROM sparepart_wo_allocation al JOIN sparepart_wo_request_line l ON l.id=al.request_line_id WHERE l.request_id=?`,
        [id],
      );
      for (const al of allocRows as any[]) {
        await connection.execute(
          `INSERT INTO sparepart_stock_ledger (movement_number,movement_type,stock_bucket,sparepart_id,warehouse_id,bin_id,lot_number,expiry_date,quantity_delta,uom,source_type,source_id,source_line_id,reference_number,movement_at,notes,created_by,created_at) VALUES (?,?, 'AVAILABLE',?,?,?,?,?,?,?,'WO_ISSUE',?,?,?,?,?,NOW())`,
          [
            `${h.request_number}-${al.id}-ISSUE`,
            "WO_ISSUE",
            al.sparepart_id,
            h.warehouse_id,
            al.bin_id,
            al.lot_number,
            al.expiry_date,
            -Number(al.picked_qty),
            al.uom,
            id,
            al.id,
            h.wo_number,
            new Date().toISOString().slice(0, 19).replace("T", " "),
            `Issue untuk ${h.wo_number}`,
            actor(req),
          ],
        );
        await connection.execute(
          `UPDATE sparepart_wo_allocation SET issued_qty=picked_qty,updated_at=NOW() WHERE id=?`,
          [al.id],
        );
      }
      await connection.execute(
        `UPDATE sparepart_wo_allocation_serial s JOIN sparepart_wo_allocation al ON al.id=s.allocation_id JOIN sparepart_wo_request_line l ON l.id=al.request_line_id JOIN sparepart_receipt_serial rs ON rs.id=s.receipt_serial_id SET s.status='ISSUED',s.updated_at=NOW(),rs.stock_status='ISSUED' WHERE l.request_id=?`,
        [id],
      );
      if (await tableExists("sparepart_serial_location"))
        await connection.execute(
          `UPDATE sparepart_serial_location sl JOIN sparepart_wo_allocation_serial s ON s.receipt_serial_id=sl.receipt_serial_id JOIN sparepart_wo_allocation al ON al.id=s.allocation_id JOIN sparepart_wo_request_line l ON l.id=al.request_line_id SET sl.status='ISSUED',sl.updated_at=NOW() WHERE l.request_id=?`,
          [id],
        );
      await connection.execute(
        `UPDATE sparepart_wo_request_line SET issued_qty=picked_qty,updated_at=NOW() WHERE request_id=?`,
        [id],
      );
      await connection.execute(
        `UPDATE sparepart_wo_request SET status='ISSUED',issued_by=?,issued_at=NOW(),updated_at=NOW() WHERE id=?`,
        [actor(req), id],
      );
      await addHistory(
        connection,
        id,
        "ISSUE",
        "PICKED",
        "ISSUED",
        null,
        actor(req),
      );
    });
    ok(
      res,
      { id, status: "ISSUED" },
      "Sparepart berhasil di-issue dan stok dikurangi.",
    );
  }),
);

sparepartWoRouter.post(
  "/spareparts/wo/requests/:id/settle",
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureWoFlow();
    const id = positiveId(req.params.id, "Request");
    const inputs = Array.isArray(req.body.lines)
      ? (req.body.lines as any[])
      : [];
    await transaction(async (connection) => {
      const [requestRows] = await connection.query(
        `SELECT * FROM sparepart_wo_request WHERE id=? FOR UPDATE`,
        [id],
      );
      const header = (requestRows as any[])[0];
      if (!header) throw new HttpError(404, "Request tidak ditemukan.");
      if (header.status !== "ISSUED")
        throw new HttpError(
          409,
          "Hanya request ISSUED yang dapat diselesaikan.",
        );
      const [lineRows] = await connection.query(
        `SELECT l.*,p.is_serialized FROM sparepart_wo_request_line l JOIN sparepart_master p ON p.id=l.sparepart_id WHERE l.request_id=? ORDER BY l.id`,
        [id],
      );
      for (const line of lineRows as any[]) {
        const input = inputs.find(
          (item) => Number(item.line_id) === Number(line.id),
        );
        if (!input)
          throw new HttpError(
            422,
            "Pemakaian aktual setiap baris wajib diisi.",
          );
        const used = qty(input.used_qty, "Qty terpakai");
        const returnedAvailable = qty(
          input.returned_available_qty,
          "Return baik",
        );
        const returnedHold = qty(input.returned_hold_qty, "Return rusak/hold");
        if (
          Math.abs(
            Number(line.issued_qty) - used - returnedAvailable - returnedHold,
          ) > 0.000001
        )
          throw new HttpError(
            422,
            `Terpakai + return harus sama dengan qty issue untuk ${line.uom}.`,
          );

        if (Number(line.is_serialized) === 1) {
          const serialInputs = Array.isArray(input.serials)
            ? (input.serials as any[])
            : [];
          const [serialRows] = await connection.query(
            `SELECT s.*,al.bin_id FROM sparepart_wo_allocation_serial s JOIN sparepart_wo_allocation al ON al.id=s.allocation_id WHERE al.request_line_id=? AND s.status='ISSUED'`,
            [line.id],
          );
          if (serialInputs.length !== (serialRows as any[]).length)
            throw new HttpError(
              422,
              "Outcome setiap serial number wajib diisi.",
            );
          const outcomeCount = {
            USED: 0,
            RETURNED_AVAILABLE: 0,
            RETURNED_HOLD: 0,
          };
          for (const serial of serialRows as any[]) {
            const serialInput = serialInputs.find(
              (item) =>
                String(item.serial_number).trim() ===
                String(serial.serial_number),
            );
            const outcome = String(serialInput?.outcome ?? "")
              .trim()
              .toUpperCase();
            if (!(outcome in outcomeCount))
              throw new HttpError(
                422,
                `Outcome serial ${serial.serial_number} tidak valid.`,
              );
            outcomeCount[outcome as keyof typeof outcomeCount] += 1;
            const stockStatus =
              outcome === "USED"
                ? "USED"
                : outcome === "RETURNED_AVAILABLE"
                  ? "IN_STOCK"
                  : "HOLD";
            await connection.execute(
              `UPDATE sparepart_wo_allocation_serial SET status=?,updated_at=NOW() WHERE id=?`,
              [outcome, serial.id],
            );
            await connection.execute(
              `UPDATE sparepart_receipt_serial SET stock_status=? WHERE id=?`,
              [stockStatus, serial.receipt_serial_id],
            );
            if (await tableExists("sparepart_serial_location"))
              await connection.execute(
                `UPDATE sparepart_serial_location SET bin_id=?,stock_bucket=?,status=?,updated_at=NOW() WHERE receipt_serial_id=?`,
                [
                  serial.bin_id,
                  outcome === "RETURNED_HOLD" ? "HOLD" : "AVAILABLE",
                  stockStatus,
                  serial.receipt_serial_id,
                ],
              );
          }
          if (
            outcomeCount.USED !== used ||
            outcomeCount.RETURNED_AVAILABLE !== returnedAvailable ||
            outcomeCount.RETURNED_HOLD !== returnedHold
          )
            throw new HttpError(
              422,
              "Outcome serial tidak sesuai qty terpakai/return.",
            );
        }

        let remainingAvailable = returnedAvailable;
        let remainingHold = returnedHold;
        const [allocationRows] = await connection.query(
          `SELECT * FROM sparepart_wo_allocation WHERE request_line_id=? ORDER BY id DESC`,
          [line.id],
        );
        for (const allocation of allocationRows as any[]) {
          let backAvailable: number;
          let backHold: number;
          if (Number(line.is_serialized) === 1) {
            const [outcomeRows] = await connection.query(
              `SELECT SUM(status='RETURNED_AVAILABLE') returned_available,SUM(status='RETURNED_HOLD') returned_hold FROM sparepart_wo_allocation_serial WHERE allocation_id=?`,
              [allocation.id],
            );
            const outcome = (outcomeRows as any[])[0];
            backAvailable = Number(outcome?.returned_available ?? 0);
            backHold = Number(outcome?.returned_hold ?? 0);
          } else {
            let capacity = Number(allocation.issued_qty);
            backAvailable = Math.min(capacity, remainingAvailable);
            capacity -= backAvailable;
            remainingAvailable -= backAvailable;
            backHold = Math.min(capacity, remainingHold);
            remainingHold -= backHold;
          }
          for (const movement of [
            {
              bucket: "AVAILABLE",
              quantity: backAvailable,
              type: "WO_RETURN_AVAILABLE",
            },
            { bucket: "HOLD", quantity: backHold, type: "WO_RETURN_HOLD" },
          ]) {
            if (movement.quantity <= 0) continue;
            await connection.execute(
              `INSERT INTO sparepart_stock_ledger (movement_number,movement_type,stock_bucket,sparepart_id,warehouse_id,bin_id,lot_number,expiry_date,quantity_delta,uom,source_type,source_id,source_line_id,reference_number,movement_at,notes,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?, 'WO_RETURN',?,?,?,?,?,?,NOW())`,
              [
                `${header.request_number}-${allocation.id}-${movement.bucket}`,
                movement.type,
                movement.bucket,
                line.sparepart_id,
                header.warehouse_id,
                allocation.bin_id,
                allocation.lot_number,
                allocation.expiry_date,
                movement.quantity,
                line.uom,
                id,
                allocation.id,
                header.wo_number,
                new Date().toISOString().slice(0, 19).replace("T", " "),
                text(input.note, "Catatan", 500),
                actor(req),
              ],
            );
          }
          await connection.execute(
            `UPDATE sparepart_wo_allocation SET returned_available_qty=?,returned_hold_qty=?,updated_at=NOW() WHERE id=?`,
            [backAvailable, backHold, allocation.id],
          );
        }
        await connection.execute(
          `UPDATE sparepart_wo_request_line SET used_qty=?,returned_available_qty=?,returned_hold_qty=?,updated_at=NOW() WHERE id=?`,
          [used, returnedAvailable, returnedHold, line.id],
        );
        if (used === 0 && Number(line.issued_qty) > 0 && await tableExists("sparepart_governance_ncr")) {
          const [partRows] = await connection.query(`SELECT part_code,part_name FROM sparepart_master WHERE id=?`,[line.sparepart_id]);
          const part = (partRows as any[])[0];
          await connection.execute(`INSERT IGNORE INTO sparepart_governance_ncr
            (ncr_number,source_type,source_id,source_key,category,severity,title,description,status,created_by,created_at)
            VALUES (?,'WO_REQUEST_LINE',?,?,'WRONG_ISSUE','MEDIUM',?,?, 'OPEN','SYSTEM',NOW())`,[
              `NCR-SP-WI-${line.id}`,line.id,`WO_FULL_RETURN:${line.id}`,`Potensi salah issue pada ${header.wo_number}`,
              `${part?.part_code ?? ''} - ${part?.part_name ?? ''}: seluruh qty issue ${line.issued_qty} ${line.uom} dikembalikan tanpa pemakaian aktual.`,
            ]);
        }
      }
      await connection.execute(
        `UPDATE sparepart_wo_request SET status='COMPLETED',completed_by=?,completed_at=NOW(),updated_at=NOW() WHERE id=?`,
        [actor(req), id],
      );
      await addHistory(
        connection,
        id,
        "SETTLE",
        "ISSUED",
        "COMPLETED",
        text(req.body.note, "Catatan", 500),
        actor(req),
      );
    });
    ok(
      res,
      { id, status: "COMPLETED" },
      "Pemakaian aktual dan return berhasil dicatat.",
    );
  }),
);

sparepartWoRouter.post(
  "/spareparts/wo/requests/:id/cancel",
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureWoFlow();
    const id = positiveId(req.params.id, "Request");
    await transaction(async (connection) => {
      const [r] = await connection.query(
        `SELECT status FROM sparepart_wo_request WHERE id=? FOR UPDATE`,
        [id],
      );
      const h = (r as any[])[0];
      if (!h) throw new HttpError(404, "Request tidak ditemukan.");
      if (!["REQUESTED", "RESERVED"].includes(h.status))
        throw new HttpError(
          409,
          "Hanya request REQUESTED/RESERVED yang dapat dibatalkan.",
        );
      if (h.status === "RESERVED") {
        await connection.execute(
          `UPDATE sparepart_wo_allocation al JOIN sparepart_wo_request_line l ON l.id=al.request_line_id SET al.released_qty=al.reserved_qty,al.updated_at=NOW() WHERE l.request_id=?`,
          [id],
        );
        await connection.execute(
          `UPDATE sparepart_wo_allocation_serial s JOIN sparepart_wo_allocation al ON al.id=s.allocation_id JOIN sparepart_wo_request_line l ON l.id=al.request_line_id SET s.status='RELEASED',s.updated_at=NOW() WHERE l.request_id=?`,
          [id],
        );
      }
      const reason = text(req.body.reason, "Alasan", 500, true);
      await connection.execute(
        `UPDATE sparepart_wo_request SET status='CANCELLED',cancelled_by=?,cancelled_at=NOW(),cancellation_reason=?,updated_at=NOW() WHERE id=?`,
        [actor(req), reason, id],
      );
      await addHistory(
        connection,
        id,
        "CANCEL",
        h.status,
        "CANCELLED",
        reason,
        actor(req),
      );
    });
    ok(
      res,
      { id, status: "CANCELLED" },
      "Request dibatalkan dan reservasi dilepas.",
    );
  }),
);
