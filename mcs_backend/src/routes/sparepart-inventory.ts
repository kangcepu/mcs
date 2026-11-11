import { Router } from "express";
import multer from "multer";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { authenticate, requirePermission } from "../auth.js";
import { config } from "../config.js";
import { one, rows, tableExists, transaction, withNamedLock } from "../db.js";
import { asyncHandler, created, HttpError, ok } from "../http.js";
import { deleteObjectKey, saveUploadedFile } from "../lib/storage.js";
import type { AuthRequest } from "../types.js";

export const sparepartInventoryRouter = Router();
const canUse = requirePermission("material_usage");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.min(config.maxUploadBytes, 10 * 1024 * 1024),
    files: 8,
  },
  fileFilter: (_req, file, cb) =>
    cb(
      null,
      /^(image\/(jpeg|png|webp)|application\/pdf)$/i.test(file.mimetype),
    ),
});
const actor = (req: AuthRequest) =>
  String(req.user?.fullname || req.user?.username || "SYSTEM").trim();
const id = (value: unknown, label: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new HttpError(422, `${label} tidak valid.`);
  return parsed;
};
const qty = (value: unknown, label: string, zero = false) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed) || (zero ? parsed < 0 : parsed <= 0))
    throw new HttpError(422, `${label} tidak valid.`);
  return parsed;
};
const text = (value: unknown, max = 500) => {
  const result = String(value ?? "").trim();
  if (!result) return null;
  if (result.length > max)
    throw new HttpError(422, `Teks maksimal ${max} karakter.`);
  return result;
};
const dt = (value: unknown, label: string) => {
  const result = String(value ?? "")
    .trim()
    .replace("T", " ");
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(result))
    throw new HttpError(422, `${label} tidak valid.`);
  return result.length === 16 ? `${result}:00` : result;
};
const doc = (prefix: string) =>
  `${prefix}-${new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14)}-${Math.floor(1000 + Math.random() * 9000)}`;
async function ensureFeature() {
  if (!(await tableExists("sparepart_stock_transfer")))
    throw new HttpError(
      503,
      "Migration Transfer, Stock Opname & Inventory Control belum dijalankan.",
    );
}
async function addAudit(
  connection: PoolConnection,
  entity: string,
  entityId: number,
  event: string,
  from: string | null,
  to: string | null,
  summary: string,
  user: string,
  data?: unknown,
) {
  await connection.execute(
    `INSERT INTO sparepart_inventory_audit (entity_type,entity_id,event_type,from_status,to_status,event_summary,event_data,actor_name,event_at) VALUES (?,?,?,?,?,?,?,?,NOW())`,
    [
      entity,
      entityId,
      event,
      from,
      to,
      summary,
      data ? JSON.stringify(data) : null,
      user,
    ],
  );
}
async function balance(
  connection: PoolConnection,
  sparepartId: number,
  binId: number,
  bucket: string,
  lot: string | null,
  expiry: string | null,
) {
  const [result] = await connection.query(
    `SELECT COALESCE(SUM(quantity_delta),0) total FROM sparepart_stock_ledger WHERE sparepart_id=? AND bin_id=? AND stock_bucket=? AND COALESCE(lot_number,'')=COALESCE(?,'') AND COALESCE(expiry_date,'1000-01-01')=COALESCE(?,'1000-01-01')`,
    [sparepartId, binId, bucket, lot, expiry],
  );
  return Number((result as any[])[0]?.total ?? 0);
}
async function transferableBalance(
  connection: PoolConnection,
  sparepartId: number,
  binId: number,
  bucket: string,
  lot: string | null,
  expiry: string | null,
) {
  const physical = await balance(
    connection,
    sparepartId,
    binId,
    bucket,
    lot,
    expiry,
  );
  if (bucket !== "AVAILABLE" || !(await tableExists("sparepart_wo_allocation")))
    return physical;
  const [result] = await connection.query(
    `SELECT COALESCE(SUM(a.reserved_qty-a.released_qty),0) reserved_qty
    FROM sparepart_wo_allocation a JOIN sparepart_wo_request_line l ON l.id=a.request_line_id JOIN sparepart_wo_request h ON h.id=l.request_id
    WHERE l.sparepart_id=? AND a.bin_id=? AND COALESCE(a.lot_number,'')=COALESCE(?,'') AND COALESCE(a.expiry_date,'1000-01-01')=COALESCE(?,'1000-01-01')
      AND h.status IN ('RESERVED','PICKED')`,
    [sparepartId, binId, lot, expiry],
  );
  return physical - Number((result as any[])[0]?.reserved_qty ?? 0);
}

sparepartInventoryRouter.use("/spareparts/inventory", authenticate, canUse);

sparepartInventoryRouter.get(
  "/spareparts/inventory/overview",
  asyncHandler(async (_req, res) => {
    await ensureFeature();
    const scheduleExists = await tableExists("tb_schedule_header");
    const recountExists = await tableExists("sparepart_stock_opname_recount");
    const [
      transfers,
      opnames,
      policies,
      bins,
      parts,
      balances,
      serials,
      trend,
      audit,
    ] = await Promise.all([
      rows<any>(
        `SELECT t.*,fw.warehouse_code from_code,fw.warehouse_name from_name,tw.warehouse_code to_code,tw.warehouse_name to_name,COUNT(l.id) line_count,SUM(l.quantity) total_qty FROM sparepart_stock_transfer t JOIN sparepart_warehouse fw ON fw.id=t.from_warehouse_id JOIN sparepart_warehouse tw ON tw.id=t.to_warehouse_id LEFT JOIN sparepart_stock_transfer_line l ON l.transfer_id=t.id GROUP BY t.id ORDER BY t.created_at DESC LIMIT 150`,
      ),
      rows<any>(
        `SELECT o.*,w.warehouse_code,w.warehouse_name,COUNT(l.id) line_count,SUM(l.counted_qty IS NOT NULL) counted_lines,COALESCE(SUM(ABS(l.variance_qty)),0) absolute_variance,
          ${recountExists ? "(SELECT COUNT(*) FROM sparepart_stock_opname_recount rc WHERE rc.opname_id=o.id)" : "0"} recount_count
         FROM sparepart_stock_opname o JOIN sparepart_warehouse w ON w.id=o.warehouse_id LEFT JOIN sparepart_stock_opname_line l ON l.opname_id=o.id GROUP BY o.id ORDER BY o.created_at DESC LIMIT 150`,
      ),
      rows<any>(`SELECT p.*,s.part_code,s.part_name,s.base_uom,s.criticality,w.warehouse_code,w.warehouse_name,
      COALESCE((SELECT SUM(l.quantity_delta) FROM sparepart_stock_ledger l WHERE l.sparepart_id=p.sparepart_id AND l.warehouse_id=p.warehouse_id AND l.stock_bucket='AVAILABLE'),0) current_qty,
      (SELECT MAX(l.movement_at) FROM sparepart_stock_ledger l WHERE l.sparepart_id=p.sparepart_id AND l.warehouse_id=p.warehouse_id AND l.quantity_delta<0) last_consumption_at
      FROM sparepart_inventory_policy p JOIN sparepart_master s ON s.id=p.sparepart_id JOIN sparepart_warehouse w ON w.id=p.warehouse_id ORDER BY s.criticality='CRITICAL' DESC,s.part_name`),
      rows<any>(
        `SELECT b.id,b.bin_code,b.bin_name,r.rack_code,w.id warehouse_id,w.warehouse_code,w.warehouse_name FROM sparepart_bin b JOIN sparepart_rack r ON r.id=b.rack_id JOIN sparepart_warehouse w ON w.id=r.warehouse_id WHERE b.status='ACTIVE' AND r.status='ACTIVE' AND w.status='ACTIVE' ORDER BY w.warehouse_name,r.rack_code,b.bin_code`,
      ),
      rows<any>(
        `SELECT id,part_code,part_name,base_uom,criticality,is_serialized FROM sparepart_master WHERE status='ACTIVE' ORDER BY part_name`,
      ),
      rows<any>(
        `SELECT l.sparepart_id,l.warehouse_id,l.bin_id,l.stock_bucket,l.lot_number,l.expiry_date,p.part_code,p.part_name,p.base_uom,p.is_serialized,w.warehouse_code,r.rack_code,b.bin_code,SUM(l.quantity_delta) current_qty FROM sparepart_stock_ledger l JOIN sparepart_master p ON p.id=l.sparepart_id JOIN sparepart_warehouse w ON w.id=l.warehouse_id JOIN sparepart_bin b ON b.id=l.bin_id JOIN sparepart_rack r ON r.id=b.rack_id GROUP BY l.sparepart_id,l.warehouse_id,l.bin_id,l.stock_bucket,l.lot_number,l.expiry_date HAVING current_qty>0 ORDER BY p.part_name,w.warehouse_code,r.rack_code,b.bin_code`,
      ),
      rows<any>(
        `SELECT sl.receipt_serial_id id,sl.sparepart_id,sl.bin_id,sl.stock_bucket,sl.status,s.serial_number FROM sparepart_serial_location sl JOIN sparepart_receipt_serial s ON s.id=sl.receipt_serial_id WHERE sl.status IN ('IN_STOCK','HOLD') ORDER BY s.serial_number`,
      ),
      rows<any>(
        `SELECT DATE_FORMAT(movement_at,'%Y-%m') period,sparepart_id,SUM(-quantity_delta) consumption_qty FROM sparepart_stock_ledger WHERE movement_type='WO_ISSUE' AND quantity_delta<0 AND movement_at>=DATE_SUB(CURDATE(),INTERVAL 12 MONTH) GROUP BY DATE_FORMAT(movement_at,'%Y-%m'),sparepart_id ORDER BY period`,
      ),
      rows<any>(
        `SELECT * FROM sparepart_inventory_audit ORDER BY event_at DESC,id DESC LIMIT 200`,
      ),
    ]);
    const forecast = scheduleExists
      ? await rows<any>(`SELECT p.id sparepart_id,p.part_code,p.part_name,p.base_uom,p.criticality,
    COUNT(DISTINCT h.id) active_schedule_count,
    COALESCE((SELECT SUM(-l.quantity_delta) FROM sparepart_stock_ledger l WHERE l.sparepart_id=p.id AND l.movement_type='WO_ISSUE' AND l.quantity_delta<0 AND l.movement_at>=DATE_SUB(CURDATE(),INTERVAL 180 DAY)),0) consumption_180_days,
    COALESCE((SELECT SUM(l.quantity_delta) FROM sparepart_stock_ledger l WHERE l.sparepart_id=p.id AND l.stock_bucket='AVAILABLE'),0) current_qty
    FROM sparepart_master p JOIN sparepart_asset_compatibility c ON c.sparepart_id=p.id
    JOIN asset a ON (c.compatibility_type='ASSET' AND a.AssetID=c.asset_id) OR (c.compatibility_type='ASSET_CATEGORY' AND a.CategoryAsset=c.asset_category)
    JOIN tb_schedule_header h ON h.AssetCode=a.AssetCode
    WHERE p.status='ACTIVE' GROUP BY p.id,p.part_code,p.part_name,p.base_uom,p.criticality HAVING active_schedule_count>0 ORDER BY p.criticality='CRITICAL' DESC,active_schedule_count DESC`)
      : [];
    const alerts = policies.map((p) => {
      const current = Number(p.current_qty);
      const last = p.last_consumption_at
        ? Math.floor(
            (Date.now() - new Date(p.last_consumption_at).getTime()) / 86400000,
          )
        : null;
      return {
        ...p,
        below_minimum: current <= Number(p.minimum_qty),
        reorder_due: current <= Number(p.reorder_point),
        over_maximum: p.maximum_qty !== null && current > Number(p.maximum_qty),
        movement_class:
          current <= 0
            ? "OUT_OF_STOCK"
            : last === null || last >= Number(p.dead_stock_days)
              ? "DEAD_STOCK"
              : last >= Number(p.slow_moving_days)
                ? "SLOW_MOVING"
                : "ACTIVE",
        days_since_consumption: last,
      };
    });
    ok(res, {
      transfers,
      opnames,
      policies,
      alerts,
      bins,
      parts,
      balances,
      serials,
      trend,
      forecast,
      audit,
      stats: {
        pending_transfer: transfers.filter((x) => x.status === "SUBMITTED")
          .length,
        counting_opname: opnames.filter((x) => ["COUNTING","RECOUNTING"].includes(x.status)).length,
        pending_adjustment: opnames.filter((x) => x.status === "SUBMITTED")
          .length,
        reorder_due: alerts.filter((x) => x.reorder_due).length,
        critical_alert: alerts.filter(
          (x) =>
            x.criticality === "CRITICAL" &&
            (x.reorder_due || x.movement_class !== "ACTIVE"),
        ).length,
        slow_dead: alerts.filter((x) =>
          ["SLOW_MOVING", "DEAD_STOCK"].includes(x.movement_class),
        ).length,
      },
    });
  }),
);

sparepartInventoryRouter.post(
  "/spareparts/inventory/transfers",
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureFeature();
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (!lines.length)
      throw new HttpError(422, "Minimal satu baris transfer wajib diisi.");
    const saved = await transaction(async (connection) => {
      const number = doc("SP-TRF");
      const fromWh = id(req.body.from_warehouse_id, "Warehouse asal");
      const toWh = id(req.body.to_warehouse_id, "Warehouse tujuan");
      const [header] = await connection.execute<ResultSetHeader>(
        `INSERT INTO sparepart_stock_transfer (transfer_number,from_warehouse_id,to_warehouse_id,transferred_at,status,notes,created_by,submitted_by,submitted_at,created_at) VALUES (?,?,?,?,'SUBMITTED',?,?,?,NOW(),NOW())`,
        [
          number,
          fromWh,
          toWh,
          dt(req.body.transferred_at, "Waktu transfer"),
          text(req.body.notes, 5000),
          actor(req),
          actor(req),
        ],
      );
      for (const [index, raw] of lines.entries()) {
        const partId = id(raw.sparepart_id, `Sparepart baris ${index + 1}`);
        const fromBin = id(raw.from_bin_id, `Bin asal baris ${index + 1}`);
        const toBin = id(raw.to_bin_id, `Bin tujuan baris ${index + 1}`);
        if (fromBin === toBin)
          throw new HttpError(
            422,
            `Bin asal dan tujuan baris ${index + 1} tidak boleh sama.`,
          );
        const [partRows] = await connection.query(
          "SELECT * FROM sparepart_master WHERE id=?",
          [partId],
        );
        const part = (partRows as any[])[0];
        if (!part) throw new HttpError(404, "Sparepart tidak ditemukan.");
        const bucket = String(raw.stock_bucket ?? "AVAILABLE").toUpperCase();
        if (!["AVAILABLE", "HOLD"].includes(bucket))
          throw new HttpError(422, "Bucket stok tidak valid.");
        const quantity = qty(raw.quantity, `Qty baris ${index + 1}`);
        const lot = text(raw.lot_number, 120);
        const expiry = text(raw.expiry_date, 10);
        const [locationRows] = await connection.query(
          `SELECT b.id,r.warehouse_id FROM sparepart_bin b JOIN sparepart_rack r ON r.id=b.rack_id WHERE b.id IN (?,?)`,
          [fromBin, toBin],
        );
        const locations = locationRows as any[];
        if (
          locations.find((x) => x.id === fromBin)?.warehouse_id !== fromWh ||
          locations.find((x) => x.id === toBin)?.warehouse_id !== toWh
        )
          throw new HttpError(
            422,
            `Lokasi bin baris ${index + 1} tidak sesuai warehouse header.`,
          );
        const [line] = await connection.execute<ResultSetHeader>(
          `INSERT INTO sparepart_stock_transfer_line (transfer_id,sparepart_id,from_bin_id,to_bin_id,stock_bucket,lot_number,expiry_date,quantity,uom,line_note) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            header.insertId,
            partId,
            fromBin,
            toBin,
            bucket,
            lot,
            expiry,
            quantity,
            part.base_uom,
            text(raw.line_note),
          ],
        );
        const serialIds = Array.isArray(raw.serial_ids)
          ? raw.serial_ids.map((x: unknown) => id(x, "Serial"))
          : [];
        if (Number(part.is_serialized) === 1) {
          if (!Number.isInteger(quantity) || serialIds.length !== quantity)
            throw new HttpError(
              422,
              `Serial baris ${index + 1} harus sama dengan qty transfer.`,
            );
          for (const serialId of serialIds) {
            const [serialRows] = await connection.query(
              `SELECT sl.*,s.serial_number FROM sparepart_serial_location sl JOIN sparepart_receipt_serial s ON s.id=sl.receipt_serial_id WHERE sl.receipt_serial_id=? AND sl.sparepart_id=? AND sl.bin_id=? AND sl.stock_bucket=? AND sl.status IN ('IN_STOCK','HOLD')`,
              [serialId, partId, fromBin, bucket],
            );
            const serial = (serialRows as any[])[0];
            if (!serial)
              throw new HttpError(422, "Serial tidak tersedia pada bin asal.");
            await connection.execute(
              "INSERT INTO sparepart_stock_transfer_serial (transfer_line_id,receipt_serial_id,serial_number) VALUES (?,?,?)",
              [line.insertId, serialId, serial.serial_number],
            );
          }
        }
      }
      await addAudit(
        connection,
        "TRANSFER",
        header.insertId,
        "SUBMIT",
        null,
        "SUBMITTED",
        `Transfer ${number} diajukan`,
        actor(req),
      );
      return { id: header.insertId, transfer_number: number };
    });
    created(res, saved, "Transfer diajukan dan menunggu checker.");
  }),
);

sparepartInventoryRouter.post(
  "/spareparts/inventory/transfers/:id/review",
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureFeature();
    const transferId = id(req.params.id, "Transfer");
    const action = String(req.body.action ?? "").toUpperCase();
    if (!["APPROVE", "REJECT"].includes(action))
      throw new HttpError(422, "Aksi tidak valid.");
    await withNamedLock("sparepart-inventory-transfer", () =>
      transaction(async (connection) => {
        const [headers] = await connection.query(
          "SELECT * FROM sparepart_stock_transfer WHERE id=? FOR UPDATE",
          [transferId],
        );
        const h = (headers as any[])[0];
        if (!h) throw new HttpError(404, "Transfer tidak ditemukan.");
        if (h.status !== "SUBMITTED")
          throw new HttpError(409, "Transfer tidak menunggu review.");
        if (
          String(h.created_by).trim().toLowerCase() === actor(req).toLowerCase()
        )
          throw new HttpError(
            403,
            "Maker tidak boleh menjadi checker transfer yang sama.",
          );
        if (action === "REJECT") {
          await connection.execute(
            `UPDATE sparepart_stock_transfer SET status='REJECTED',checked_by=?,checked_at=NOW(),check_note=?,updated_at=NOW() WHERE id=?`,
            [actor(req), text(req.body.check_note, 5000), transferId],
          );
          await addAudit(
            connection,
            "TRANSFER",
            transferId,
            "REJECT",
            "SUBMITTED",
            "REJECTED",
            "Transfer ditolak checker",
            actor(req),
          );
          return;
        }
        const [lineRows] = await connection.query(
          "SELECT * FROM sparepart_stock_transfer_line WHERE transfer_id=?",
          [transferId],
        );
        for (const line of lineRows as any[]) {
          const available = await transferableBalance(
            connection,
            line.sparepart_id,
            line.from_bin_id,
            line.stock_bucket,
            line.lot_number,
            line.expiry_date,
          );
          if (available < Number(line.quantity))
            throw new HttpError(
              409,
              `Saldo transfer tidak cukup setelah memperhitungkan reservasi WO. Tersedia ${available}.`,
            );
          for (const side of [
            {
              bin: line.from_bin_id,
              wh: h.from_warehouse_id,
              delta: -Number(line.quantity),
              suffix: "OUT",
            },
            {
              bin: line.to_bin_id,
              wh: h.to_warehouse_id,
              delta: Number(line.quantity),
              suffix: "IN",
            },
          ])
            await connection.execute(
              `INSERT INTO sparepart_stock_ledger (movement_number,movement_type,stock_bucket,sparepart_id,warehouse_id,bin_id,lot_number,expiry_date,quantity_delta,uom,source_type,source_id,source_line_id,reference_number,movement_at,notes,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?, 'TRANSFER',?,?,?,?,?,?,NOW())`,
              [
                `${h.transfer_number}-${line.id}-${side.suffix}`,
                `TRANSFER_${side.suffix}`,
                line.stock_bucket,
                line.sparepart_id,
                side.wh,
                side.bin,
                line.lot_number,
                line.expiry_date,
                side.delta,
                line.uom,
                transferId,
                line.id,
                h.transfer_number,
                h.transferred_at,
                line.line_note,
                actor(req),
              ],
            );
          await connection.execute(
            `UPDATE sparepart_serial_location sl JOIN sparepart_stock_transfer_serial ts ON ts.receipt_serial_id=sl.receipt_serial_id SET sl.bin_id=?,sl.updated_at=NOW() WHERE ts.transfer_line_id=?`,
            [line.to_bin_id, line.id],
          );
        }
        await connection.execute(
          `UPDATE sparepart_stock_transfer SET status='APPROVED',checked_by=?,checked_at=NOW(),check_note=?,updated_at=NOW() WHERE id=?`,
          [actor(req), text(req.body.check_note, 5000), transferId],
        );
        await addAudit(
          connection,
          "TRANSFER",
          transferId,
          "APPROVE",
          "SUBMITTED",
          "APPROVED",
          "Transfer disetujui dan kartu stok dipindahkan",
          actor(req),
        );
      }),
    );
    ok(
      res,
      {
        id: transferId,
        status: action === "APPROVE" ? "APPROVED" : "REJECTED",
      },
      "Review transfer tersimpan.",
    );
  }),
);

sparepartInventoryRouter.post(
  "/spareparts/inventory/opnames",
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureFeature();
    const warehouseId = id(req.body.warehouse_id, "Warehouse");
    const saved = await transaction(async (connection) => {
      const number = doc("SP-SO");
      const [header] = await connection.execute<ResultSetHeader>(
        `INSERT INTO sparepart_stock_opname (opname_number,warehouse_id,counted_at,blind_count,status,notes,created_by,created_at) VALUES (?,?,?,1,'COUNTING',?,?,NOW())`,
        [
          number,
          warehouseId,
          dt(req.body.counted_at, "Waktu stock opname"),
          text(req.body.notes, 5000),
          actor(req),
        ],
      );
      await connection.execute(
        `INSERT INTO sparepart_stock_opname_line (opname_id,sparepart_id,bin_id,stock_bucket,lot_number,expiry_date,system_qty,uom)
      SELECT ?,l.sparepart_id,l.bin_id,l.stock_bucket,l.lot_number,l.expiry_date,SUM(l.quantity_delta),p.base_uom FROM sparepart_stock_ledger l JOIN sparepart_master p ON p.id=l.sparepart_id WHERE l.warehouse_id=? GROUP BY l.sparepart_id,l.bin_id,l.stock_bucket,l.lot_number,l.expiry_date,p.base_uom HAVING SUM(l.quantity_delta)<>0`,
        [header.insertId, warehouseId],
      );
      await connection.execute(
        `INSERT INTO sparepart_stock_opname_serial (opname_line_id,receipt_serial_id,serial_number,expected_present,counted_present)
      SELECT ol.id,sl.receipt_serial_id,rs.serial_number,1,0 FROM sparepart_stock_opname_line ol
      JOIN sparepart_master p ON p.id=ol.sparepart_id AND p.is_serialized=1
      JOIN sparepart_serial_location sl ON sl.sparepart_id=ol.sparepart_id AND sl.bin_id=ol.bin_id AND sl.stock_bucket=ol.stock_bucket AND sl.status IN ('IN_STOCK','HOLD')
      JOIN sparepart_receipt_serial rs ON rs.id=sl.receipt_serial_id WHERE ol.opname_id=?`,
        [header.insertId],
      );
      await addAudit(
        connection,
        "OPNAME",
        header.insertId,
        "CREATE",
        null,
        "COUNTING",
        `Blind stock opname ${number} dibuat`,
        actor(req),
      );
      return { id: header.insertId, opname_number: number };
    });
    created(
      res,
      saved,
      "Blind stock opname dibuat. Saldo sistem disembunyikan selama counting.",
    );
  }),
);

sparepartInventoryRouter.get(
  "/spareparts/inventory/opnames/:id",
  asyncHandler(async (req, res) => {
    await ensureFeature();
    const opnameId = id(req.params.id, "Stock opname");
    const header = await one<any>(
      `SELECT o.*,w.warehouse_code,w.warehouse_name FROM sparepart_stock_opname o JOIN sparepart_warehouse w ON w.id=o.warehouse_id WHERE o.id=?`,
      [opnameId],
    );
    if (!header) throw new HttpError(404, "Stock opname tidak ditemukan.");
    const lines = await rows<any>(
      `SELECT l.*,p.part_code,p.part_name,p.is_serialized,r.rack_code,b.bin_code FROM sparepart_stock_opname_line l JOIN sparepart_master p ON p.id=l.sparepart_id JOIN sparepart_bin b ON b.id=l.bin_id JOIN sparepart_rack r ON r.id=b.rack_id WHERE l.opname_id=? ORDER BY p.part_name,r.rack_code,b.bin_code`,
      [opnameId],
    );
    const isBlindCounting = ["COUNTING", "RECOUNTING"].includes(header.status);
    const serials =
      isBlindCounting
        ? []
        : await rows<any>(
            `SELECT s.* FROM sparepart_stock_opname_serial s JOIN sparepart_stock_opname_line l ON l.id=s.opname_line_id WHERE l.opname_id=? ORDER BY s.serial_number`,
            [opnameId],
          );
    ok(res, {
      ...header,
      lines: (isBlindCounting
        ? lines.map(
            ({ system_qty: _system, variance_qty: _variance, ...line }) => line,
          )
        : lines
      ).map((line: any) => ({
        ...line,
        serials: serials.filter(
          (serial: any) => serial.opname_line_id === line.id,
        ),
      })),
    });
  }),
);

sparepartInventoryRouter.put(
  "/spareparts/inventory/opnames/:id/counts",
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureFeature();
    const opnameId = id(req.params.id, "Stock opname");
    const counts = Array.isArray(req.body.lines) ? req.body.lines : [];
    await transaction(async (connection) => {
      const [headers] = await connection.query(
        "SELECT status FROM sparepart_stock_opname WHERE id=? FOR UPDATE",
        [opnameId],
      );
      if (!["COUNTING", "RECOUNTING"].includes((headers as any[])[0]?.status))
        throw new HttpError(409, "Stock opname tidak dalam proses counting.");
      for (const item of counts) {
        const lineId = id(item.id, "Baris");
        const [lineRows] = await connection.query(
          `SELECT l.*,p.is_serialized FROM sparepart_stock_opname_line l JOIN sparepart_master p ON p.id=l.sparepart_id WHERE l.id=? AND l.opname_id=?`,
          [lineId, opnameId],
        );
        const line = (lineRows as any[])[0];
        if (!line)
          throw new HttpError(404, "Baris stock opname tidak ditemukan.");
        let counted = 0;
        if (Number(line.is_serialized) === 1) {
          const serialNumbers = Array.isArray(item.serial_numbers)
            ? [
                ...new Set(
                  item.serial_numbers
                    .map((x: unknown) => String(x).trim())
                    .filter(Boolean),
                ),
              ]
            : [];
          counted = serialNumbers.length;
          await connection.execute(
            "UPDATE sparepart_stock_opname_serial SET counted_present=0 WHERE opname_line_id=?",
            [lineId],
          );
          for (const serialNumber of serialNumbers) {
            const [serialRows] = await connection.query(
              "SELECT id,serial_number FROM sparepart_receipt_serial WHERE sparepart_id=? AND serial_number=? LIMIT 1",
              [line.sparepart_id, serialNumber],
            );
            const serial = (serialRows as any[])[0];
            if (!serial)
              throw new HttpError(
                422,
                `Serial ${serialNumber} tidak terdaftar pada sparepart ini.`,
              );
            await connection.execute(
              `INSERT INTO sparepart_stock_opname_serial (opname_line_id,receipt_serial_id,serial_number,expected_present,counted_present) VALUES (?,?,?,0,1) ON DUPLICATE KEY UPDATE counted_present=1`,
              [lineId, serial.id, serial.serial_number],
            );
          }
        } else {
          counted = qty(item.counted_qty, "Qty count", true);
        }
        await connection.execute(
          `UPDATE sparepart_stock_opname_line SET counted_qty=?,count_note=?,counted_by=?,counted_at=NOW() WHERE id=? AND opname_id=?`,
          [counted, text(item.count_note), actor(req), lineId, opnameId],
        );
      }
      await addAudit(
        connection,
        "OPNAME",
        opnameId,
        "COUNT_SAVED",
        "COUNTING",
        "COUNTING",
        `${counts.length} hasil count disimpan`,
        actor(req),
      );
    });
    ok(res, { id: opnameId }, "Hasil blind count disimpan.");
  }),
);

sparepartInventoryRouter.post(
  "/spareparts/inventory/opnames/:id/submit",
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureFeature();
    const opnameId = id(req.params.id, "Stock opname");
    await transaction(async (connection) => {
      const [headers] = await connection.query(
        "SELECT * FROM sparepart_stock_opname WHERE id=? FOR UPDATE",
        [opnameId],
      );
      const h = (headers as any[])[0];
      if (!h || !["COUNTING", "RECOUNTING"].includes(h.status))
        throw new HttpError(409, "Stock opname tidak dalam proses counting.");
      const fromStatus = h.status;
      const [missing] = await connection.query(
        "SELECT COUNT(*) total FROM sparepart_stock_opname_line WHERE opname_id=? AND counted_qty IS NULL",
        [opnameId],
      );
      if (Number((missing as any[])[0]?.total) > 0)
        throw new HttpError(422, "Semua baris harus dihitung sebelum submit.");
      await connection.execute(
        `UPDATE sparepart_stock_opname_line SET variance_qty=counted_qty-system_qty WHERE opname_id=?`,
        [opnameId],
      );
      await connection.execute(
        `UPDATE sparepart_stock_opname SET status='SUBMITTED',submitted_by=?,submitted_at=NOW(),updated_at=NOW() WHERE id=?`,
        [actor(req), opnameId],
      );
      if (fromStatus === "RECOUNTING" && await tableExists("sparepart_stock_opname_recount")) {
        const [recounts] = await connection.query(`SELECT id FROM sparepart_stock_opname_recount WHERE opname_id=? AND status='REQUESTED' ORDER BY recount_no DESC LIMIT 1`, [opnameId]);
        const recountId = Number((recounts as any[])[0]?.id ?? 0);
        if (recountId) {
          await connection.execute(`UPDATE sparepart_stock_opname_recount_line rl JOIN sparepart_stock_opname_line l ON l.id=rl.opname_line_id
            SET rl.recounted_qty=l.counted_qty,rl.recount_variance_qty=l.variance_qty,rl.recount_note=l.count_note,rl.counted_by=l.counted_by,rl.counted_at=l.counted_at
            WHERE rl.recount_id=?`, [recountId]);
          await connection.execute(`UPDATE sparepart_stock_opname_recount SET status='SUBMITTED',submitted_by=?,submitted_at=NOW() WHERE id=?`, [actor(req), recountId]);
        }
      }
      await addAudit(
        connection,
        "OPNAME",
        opnameId,
        "SUBMIT",
        fromStatus,
        "SUBMITTED",
        "Stock opname diajukan untuk adjustment checker",
        actor(req),
      );
    });
    ok(
      res,
      { id: opnameId, status: "SUBMITTED" },
      "Stock opname diajukan; selisih sistem kini ditampilkan ke checker.",
    );
  }),
);

sparepartInventoryRouter.post(
  "/spareparts/inventory/opnames/:id/review",
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureFeature();
    const opnameId = id(req.params.id, "Stock opname");
    const action = String(req.body.action ?? "").toUpperCase();
    if (!["APPROVE", "REJECT", "RECOUNT"].includes(action))
      throw new HttpError(422, "Aksi tidak valid.");
    await withNamedLock("sparepart-inventory-opname", () =>
      transaction(async (connection) => {
        const [headers] = await connection.query(
          "SELECT * FROM sparepart_stock_opname WHERE id=? FOR UPDATE",
          [opnameId],
        );
        const h = (headers as any[])[0];
        if (!h || h.status !== "SUBMITTED")
          throw new HttpError(409, "Stock opname tidak menunggu checker.");
        if ([h.created_by,h.submitted_by].some(value => String(value ?? '').trim().toLowerCase() === actor(req).toLowerCase()))
          throw new HttpError(
            403,
            "Maker/counter stock opname tidak boleh menjadi checker adjustment.",
          );
        if (action === "RECOUNT") {
          if (!(await tableExists("sparepart_stock_opname_recount")))
            throw new HttpError(503, "Migration workflow recount Stock Opname belum dijalankan.");
          const reason = text(req.body.check_note, 1000);
          if (!reason) throw new HttpError(422, "Alasan recount wajib diisi.");
          const [sequence] = await connection.query(`SELECT COALESCE(MAX(recount_no),0)+1 recount_no FROM sparepart_stock_opname_recount WHERE opname_id=?`,[opnameId]);
          const recountNo = Number((sequence as any[])[0]?.recount_no ?? 1);
          const [recount] = await connection.execute<ResultSetHeader>(`INSERT INTO sparepart_stock_opname_recount
            (opname_id,recount_no,status,reason,requested_by,requested_at) VALUES (?,?,'REQUESTED',?,?,NOW())`,[opnameId,recountNo,reason,actor(req)]);
          await connection.execute(`INSERT INTO sparepart_stock_opname_recount_line
            (recount_id,opname_line_id,system_qty,previous_counted_qty,previous_variance_qty)
            SELECT ?,id,system_qty,counted_qty,variance_qty FROM sparepart_stock_opname_line WHERE opname_id=?`,[recount.insertId,opnameId]);
          await connection.execute(`UPDATE sparepart_stock_opname_line SET counted_qty=NULL,variance_qty=NULL,count_note=NULL,counted_by=NULL,counted_at=NULL WHERE opname_id=?`,[opnameId]);
          await connection.execute(`UPDATE sparepart_stock_opname_serial s JOIN sparepart_stock_opname_line l ON l.id=s.opname_line_id SET s.counted_present=0 WHERE l.opname_id=?`,[opnameId]);
          await connection.execute(`UPDATE sparepart_stock_opname SET status='RECOUNTING',submitted_by=NULL,submitted_at=NULL,checked_by=NULL,checked_at=NULL,check_note=?,updated_at=NOW() WHERE id=?`,[reason,opnameId]);
          await addAudit(connection,"OPNAME",opnameId,"RECOUNT_REQUEST","SUBMITTED","RECOUNTING",`Recount ke-${recountNo} diminta: ${reason}`,actor(req),{recount_id:recount.insertId,recount_no:recountNo});
          return;
        }
        if (action === "REJECT") {
          await connection.execute(
            `UPDATE sparepart_stock_opname SET status='REJECTED',checked_by=?,checked_at=NOW(),check_note=?,updated_at=NOW() WHERE id=?`,
            [actor(req), text(req.body.check_note, 5000), opnameId],
          );
          await addAudit(
            connection,
            "OPNAME",
            opnameId,
            "REJECT",
            "SUBMITTED",
            "REJECTED",
            "Adjustment stock opname ditolak",
            actor(req),
          );
          if (await tableExists("sparepart_stock_opname_recount")) {
            await connection.execute(`UPDATE sparepart_stock_opname_recount SET status='REJECTED',reviewed_by=?,reviewed_at=NOW(),review_note=? WHERE opname_id=? AND status='SUBMITTED'`,[actor(req),text(req.body.check_note,1000),opnameId]);
          }
          return;
        }
        if (await tableExists("sparepart_stock_opname_recount")) {
          await connection.execute(`UPDATE sparepart_stock_opname_recount SET status='APPROVED',reviewed_by=?,reviewed_at=NOW(),review_note=? WHERE opname_id=? AND status='SUBMITTED'`,[actor(req),text(req.body.check_note,1000),opnameId]);
        }
        const [lineRows] = await connection.query(
          "SELECT * FROM sparepart_stock_opname_line WHERE opname_id=? AND ABS(variance_qty)>0.000001",
          [opnameId],
        );
        for (const line of lineRows as any[]) {
          const current = await balance(
            connection,
            line.sparepart_id,
            line.bin_id,
            line.stock_bucket,
            line.lot_number,
            line.expiry_date,
          );
          const delta = Number(line.counted_qty) - current;
          if (Math.abs(delta) <= 0.000001) continue;
          if (current + delta < 0)
            throw new HttpError(409, "Adjustment menghasilkan saldo negatif.");
          const [wh] = await connection.query(
            `SELECT r.warehouse_id FROM sparepart_bin b JOIN sparepart_rack r ON r.id=b.rack_id WHERE b.id=?`,
            [line.bin_id],
          );
          await connection.execute(
            `INSERT INTO sparepart_stock_ledger (movement_number,movement_type,stock_bucket,sparepart_id,warehouse_id,bin_id,lot_number,expiry_date,quantity_delta,uom,source_type,source_id,source_line_id,reference_number,movement_at,notes,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?, 'STOCK_OPNAME',?,?,?,?,?,?,NOW())`,
            [
              `${h.opname_number}-${line.id}`,
              delta > 0 ? "OPNAME_ADJUSTMENT_IN" : "OPNAME_ADJUSTMENT_OUT",
              line.stock_bucket,
              line.sparepart_id,
              (wh as any[])[0].warehouse_id,
              line.bin_id,
              line.lot_number,
              line.expiry_date,
              delta,
              line.uom,
              opnameId,
              line.id,
              h.opname_number,
              h.counted_at,
              line.count_note,
              actor(req),
            ],
          );
        }
        await connection.execute(
          `UPDATE sparepart_serial_location sl JOIN sparepart_stock_opname_serial os ON os.receipt_serial_id=sl.receipt_serial_id JOIN sparepart_stock_opname_line ol ON ol.id=os.opname_line_id SET sl.bin_id=ol.bin_id,sl.stock_bucket=ol.stock_bucket,sl.status=CASE WHEN ol.stock_bucket='HOLD' THEN 'HOLD' ELSE 'IN_STOCK' END,sl.updated_at=NOW() WHERE ol.opname_id=? AND os.counted_present=1`,
          [opnameId],
        );
        await connection.execute(
          `UPDATE sparepart_receipt_serial rs JOIN sparepart_stock_opname_serial os ON os.receipt_serial_id=rs.id JOIN sparepart_stock_opname_line ol ON ol.id=os.opname_line_id SET rs.stock_status=CASE WHEN os.counted_present=1 THEN CASE WHEN ol.stock_bucket='HOLD' THEN 'HOLD' ELSE 'IN_STOCK' END ELSE 'MISSING' END WHERE ol.opname_id=? AND os.expected_present=1`,
          [opnameId],
        );
        await connection.execute(
          `UPDATE sparepart_serial_location sl JOIN sparepart_stock_opname_serial os ON os.receipt_serial_id=sl.receipt_serial_id JOIN sparepart_stock_opname_line ol ON ol.id=os.opname_line_id SET sl.status='MISSING',sl.updated_at=NOW() WHERE ol.opname_id=? AND os.expected_present=1 AND os.counted_present=0`,
          [opnameId],
        );
        await connection.execute(
          `UPDATE sparepart_stock_opname SET status='APPROVED',checked_by=?,checked_at=NOW(),check_note=?,updated_at=NOW() WHERE id=?`,
          [actor(req), text(req.body.check_note, 5000), opnameId],
        );
        await addAudit(
          connection,
          "OPNAME",
          opnameId,
          "APPROVE",
          "SUBMITTED",
          "APPROVED",
          "Adjustment stock opname disetujui dan masuk kartu stok",
          actor(req),
        );
      }),
    );
    ok(
      res,
      { id: opnameId, status: action === "APPROVE" ? "APPROVED" : action === "RECOUNT" ? "RECOUNTING" : "REJECTED" },
      "Review stock opname tersimpan.",
    );
  }),
);

sparepartInventoryRouter.post(
  "/spareparts/inventory/policies",
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureFeature();
    const partId = id(req.body.sparepart_id, "Sparepart");
    const warehouseId = id(req.body.warehouse_id, "Warehouse");
    const minimum = qty(req.body.minimum_qty, "Minimum stock", true);
    const reorder = qty(req.body.reorder_point, "Reorder point", true);
    const maximum =
      req.body.maximum_qty === "" || req.body.maximum_qty == null
        ? null
        : qty(req.body.maximum_qty, "Maximum stock", true);
    if (maximum !== null && maximum < minimum)
      throw new HttpError(
        422,
        "Maximum stock tidak boleh lebih kecil dari minimum stock.",
      );
    const saved = await transaction(async (connection) => {
      await connection.execute(
        `INSERT INTO sparepart_inventory_policy (sparepart_id,warehouse_id,minimum_qty,maximum_qty,reorder_point,reorder_qty,lead_time_days,slow_moving_days,dead_stock_days,status,notes,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE minimum_qty=VALUES(minimum_qty),maximum_qty=VALUES(maximum_qty),reorder_point=VALUES(reorder_point),reorder_qty=VALUES(reorder_qty),lead_time_days=VALUES(lead_time_days),slow_moving_days=VALUES(slow_moving_days),dead_stock_days=VALUES(dead_stock_days),notes=VALUES(notes),updated_by=VALUES(updated_by),updated_at=NOW()`,
        [
          partId,
          warehouseId,
          minimum,
          maximum,
          reorder,
          req.body.reorder_qty === "" || req.body.reorder_qty == null
            ? null
            : qty(req.body.reorder_qty, "Reorder qty", true),
          qty(req.body.lead_time_days ?? 0, "Lead time", true),
          qty(req.body.slow_moving_days ?? 90, "Slow moving days", true),
          qty(req.body.dead_stock_days ?? 180, "Dead stock days", true),
          text(req.body.notes),
          actor(req),
          actor(req),
        ],
      );
      const [policyRows] = await connection.query(
        "SELECT id FROM sparepart_inventory_policy WHERE sparepart_id=? AND warehouse_id=?",
        [partId, warehouseId],
      );
      const policyId = Number((policyRows as any[])[0].id);
      await addAudit(
        connection,
        "POLICY",
        policyId,
        "UPSERT",
        null,
        "ACTIVE",
        "Kebijakan inventory diperbarui",
        actor(req),
      );
      return policyId;
    });
    created(res, { id: saved }, "Kebijakan inventory disimpan.");
  }),
);

sparepartInventoryRouter.post(
  "/spareparts/inventory/attachments",
  upload.array("files", 8),
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureFeature();
    const entity = String(req.body.entity_type ?? "").toUpperCase();
    if (!["TRANSFER", "OPNAME"].includes(entity))
      throw new HttpError(422, "Jenis evidence tidak valid.");
    const entityId = id(req.body.entity_id, "Dokumen");
    const table =
      entity === "TRANSFER"
        ? "sparepart_stock_transfer"
        : "sparepart_stock_opname";
    if (!(await one(`SELECT id FROM ${table} WHERE id=?`, [entityId])))
      throw new HttpError(404, "Dokumen tidak ditemukan.");
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw new HttpError(422, "Pilih minimal satu evidence.");
    const saved = [];
    for (const file of files) {
      const key = await saveUploadedFile(
        file.buffer,
        `spareparts/${entity.toLowerCase()}/${entityId}`,
        file.originalname,
        file.mimetype,
      );
      const result = await transaction(async (connection) => {
        const [insert] = await connection.execute<ResultSetHeader>(
          `INSERT INTO sparepart_inventory_attachment (entity_type,entity_id,file_name,object_key,mime_type,file_size,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?,NOW())`,
          [
            entity,
            entityId,
            file.originalname,
            key,
            file.mimetype,
            file.size,
            actor(req),
          ],
        );
        await addAudit(
          connection,
          entity,
          entityId,
          "EVIDENCE_UPLOADED",
          null,
          null,
          `Evidence ${file.originalname} diunggah`,
          actor(req),
        );
        return insert.insertId;
      });
      saved.push({
        id: result,
        file_name: file.originalname,
        url: `/uploads/${key}`,
      });
    }
    created(res, saved, "Evidence berhasil diunggah.");
  }),
);

sparepartInventoryRouter.get(
  "/spareparts/inventory/attachments",
  asyncHandler(async (req, res) => {
    await ensureFeature();
    const entity = String(req.query.entity_type ?? "").toUpperCase();
    const entityId = id(req.query.entity_id, "Dokumen");
    const result = await rows<any>(
      "SELECT * FROM sparepart_inventory_attachment WHERE entity_type=? AND entity_id=? ORDER BY created_at DESC",
      [entity, entityId],
    );
    ok(
      res,
      result.map((x) => ({
        ...x,
        url: `/uploads/${String(x.object_key).replace(/^\/+/, "")}`,
      })),
    );
  }),
);
sparepartInventoryRouter.delete(
  "/spareparts/inventory/attachments/:id",
  asyncHandler(async (req: AuthRequest, res) => {
    await ensureFeature();
    const attachmentId = id(req.params.id, "Evidence");
    const item = await one<any>(
      "SELECT * FROM sparepart_inventory_attachment WHERE id=?",
      [attachmentId],
    );
    if (!item) throw new HttpError(404, "Evidence tidak ditemukan.");
    await transaction(async (connection) => {
      await connection.execute(
        "DELETE FROM sparepart_inventory_attachment WHERE id=?",
        [attachmentId],
      );
      await addAudit(
        connection,
        item.entity_type,
        item.entity_id,
        "EVIDENCE_DELETED",
        null,
        null,
        `Evidence ${item.file_name} dihapus`,
        actor(req),
      );
    });
    await deleteObjectKey(item.object_key);
    ok(res, { id: attachmentId }, "Evidence dihapus.");
  }),
);
