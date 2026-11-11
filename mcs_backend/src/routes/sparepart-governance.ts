import { Router } from 'express';
import type { ResultSetHeader } from 'mysql2/promise';
import { authenticate, requirePermission } from '../auth.js';
import { one, rows, tableExists, transaction } from '../db.js';
import { getSparepartErpItems, getSparepartErpItemsByCodes, type SparepartErpCompany, type SparepartErpItem } from '../lib/erp.js';
import { asyncHandler, created, HttpError, ok } from '../http.js';
import type { AuthRequest } from '../types.js';

export const sparepartGovernanceRouter=Router();
const canUse=requirePermission('material_usage');
const actor=(req:AuthRequest)=>String(req.user?.fullname||req.user?.username||'SYSTEM').trim();
const required=(v:unknown,label:string,max=500)=>{const x=String(v??'').trim();if(!x)throw new HttpError(422,`${label} wajib diisi.`);if(x.length>max)throw new HttpError(422,`${label} maksimal ${max} karakter.`);return x;};
const optional=(v:unknown,max=5000)=>{const x=String(v??'').trim();if(x.length>max)throw new HttpError(422,`Teks maksimal ${max} karakter.`);return x||null;};
const number=(prefix:string)=>`${prefix}-${new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)}-${Math.floor(1000+Math.random()*9000)}`;
async function ensure(){if(!(await tableExists('sparepart_governance_ncr'))||!(await tableExists('sparepart_erp_reconciliation')))throw new HttpError(503,'Migration Sparepart Governance belum dijalankan.');}
async function autoNcr(){
  await rows(`INSERT IGNORE INTO sparepart_governance_ncr (ncr_number,source_type,source_id,source_key,category,severity,title,description,status,created_by,created_at)
    SELECT CONCAT('NCR-SP-SO-',o.id),'STOCK_OPNAME',o.id,CONCAT('STOCK_OPNAME:',o.id),'VARIANCE','HIGH',CONCAT('Selisih stock opname ',o.opname_number),CONCAT('Stock opname disetujui dengan total selisih ',SUM(ABS(l.variance_qty)),'.'),'OPEN','SYSTEM',NOW()
    FROM sparepart_stock_opname o JOIN sparepart_stock_opname_line l ON l.opname_id=o.id WHERE o.status='APPROVED' AND ABS(l.variance_qty)>0.000001 GROUP BY o.id,o.opname_number`);
  await rows(`INSERT IGNORE INTO sparepart_governance_ncr (ncr_number,source_type,source_id,source_key,category,severity,title,description,status,created_by,created_at)
    SELECT CONCAT('NCR-SP-RCV-',l.id),'RECEIPT_LINE',l.id,CONCAT('RECEIPT_LINE:',l.id),'DAMAGED','MEDIUM',CONCAT('Barang rejected pada ',h.receipt_number),CONCAT(p.part_code,' - ',p.part_name,': rejected ',l.rejected_qty,' ',l.uom,'.'),'OPEN','SYSTEM',NOW()
    FROM sparepart_receipt_line l JOIN sparepart_receipt h ON h.id=l.receipt_id JOIN sparepart_master p ON p.id=l.sparepart_id WHERE h.status='LOCKED' AND l.rejected_qty>0`);
  await rows(`INSERT IGNORE INTO sparepart_governance_ncr (ncr_number,source_type,source_id,source_key,category,severity,title,description,status,created_by,created_at)
    SELECT CONCAT('NCR-SP-REV-',l.id),'STOCK_LEDGER',l.id,CONCAT('STOCK_REVERSAL:',l.id),'WRONG_ISSUE','HIGH',
      CONCAT('Reversal issue terdeteksi: ',l.reference_number),CONCAT(p.part_code,' - ',p.part_name,' mengalami transaksi ',l.movement_type,' sejumlah ',ABS(l.quantity_delta),' ',l.uom,'.'),'OPEN','SYSTEM',NOW()
    FROM sparepart_stock_ledger l JOIN sparepart_master p ON p.id=l.sparepart_id
    WHERE UPPER(l.movement_type) LIKE '%REVERS%'`);
  await rows(`INSERT IGNORE INTO sparepart_governance_ncr (ncr_number,source_type,source_id,source_key,category,severity,title,description,status,created_by,created_at)
    SELECT CONCAT('NCR-SP-WI-',l.id),'WO_REQUEST_LINE',l.id,CONCAT('WO_FULL_RETURN:',l.id),'WRONG_ISSUE','MEDIUM',
      CONCAT('Potensi salah issue pada ',h.wo_number),CONCAT(p.part_code,' - ',p.part_name,': seluruh qty issue ',l.issued_qty,' ',l.uom,' dikembalikan tanpa pemakaian aktual.'),'OPEN','SYSTEM',NOW()
    FROM sparepart_wo_request_line l JOIN sparepart_wo_request h ON h.id=l.request_id JOIN sparepart_master p ON p.id=l.sparepart_id
    WHERE h.status='COMPLETED' AND l.issued_qty>0 AND l.used_qty=0
      AND ABS(l.issued_qty-l.returned_available_qty-l.returned_hold_qty)<=0.000001`);
}
sparepartGovernanceRouter.use('/spareparts/governance',authenticate,canUse);
sparepartGovernanceRouter.get('/spareparts/governance',asyncHandler(async(req,res)=>{await ensure();await autoNcr();const status=String(req.query.status??'').toUpperCase();const where=status?'WHERE n.status=?':'';const params=status?[status]:[];const [receipts,transfers,opnames,wo,ncrs,reconciliations]=await Promise.all([
 rows<any>(`SELECT id,'RECEIPT' source_type,receipt_number reference_number,status,submitted_by requested_by,submitted_at requested_at FROM sparepart_receipt WHERE status='SUBMITTED' ORDER BY submitted_at`),
 rows<any>(`SELECT id,'TRANSFER' source_type,transfer_number reference_number,status,submitted_by requested_by,submitted_at requested_at FROM sparepart_stock_transfer WHERE status='SUBMITTED' ORDER BY submitted_at`),
 rows<any>(`SELECT id,'OPNAME' source_type,opname_number reference_number,status,submitted_by requested_by,submitted_at requested_at FROM sparepart_stock_opname WHERE status='SUBMITTED' ORDER BY submitted_at`),
 rows<any>(`SELECT id,'WO_REQUEST' source_type,request_number reference_number,status,requested_by,requested_at FROM sparepart_wo_request WHERE status IN ('REQUESTED','PICKED') ORDER BY requested_at`),
 rows<any>(`SELECT n.*,(SELECT COUNT(*) FROM sparepart_governance_ncr_action a WHERE a.ncr_id=n.id) action_count FROM sparepart_governance_ncr n ${where} ORDER BY n.created_at DESC`,params),
 rows<any>(`SELECT * FROM sparepart_erp_reconciliation ORDER BY created_at DESC LIMIT 100`)
]);const approvals=[...receipts,...transfers,...opnames,...wo];ok(res,{approvals,ncrs,reconciliations,summary:{approvals:approvals.length,open:ncrs.filter(x=>!['CLOSED','CANCELLED'].includes(x.status)).length,high:ncrs.filter(x=>['HIGH','CRITICAL'].includes(x.severity)&&!['CLOSED','CANCELLED'].includes(x.status)).length,mismatch:reconciliations.reduce((a,x)=>a+Number(x.mismatch_count||0),0)}});}));
sparepartGovernanceRouter.post('/spareparts/governance/ncr',asyncHandler(async(req:AuthRequest,res)=>{await ensure();const result=await transaction(async connection=>{const [insert]=await connection.execute<ResultSetHeader>(`INSERT INTO sparepart_governance_ncr (ncr_number,source_type,source_id,source_key,category,severity,title,description,assigned_to,due_date,status,created_by,created_at) VALUES (?,'MANUAL',NULL,?,?,?,?,?,?,?,'OPEN',?,NOW())`,[number('NCR-SP'),`MANUAL:${Date.now()}:${Math.random()}`,required(req.body.category,'Kategori',30).toUpperCase(),required(req.body.severity,'Severity',20).toUpperCase(),required(req.body.title,'Judul',220),required(req.body.description,'Deskripsi',5000),optional(req.body.assigned_to,120),optional(req.body.due_date,10),actor(req)]);await connection.execute(`INSERT INTO sparepart_governance_ncr_action (ncr_id,action_type,to_status,action_note,acted_by,acted_at) VALUES (?,'CREATE','OPEN',?,?,NOW())`,[insert.insertId,optional(req.body.note),actor(req)]);return insert.insertId;});created(res,{id:result},'NCR Sparepart dibuat.');}));
sparepartGovernanceRouter.patch('/spareparts/governance/ncr/:id',asyncHandler(async(req:AuthRequest,res)=>{await ensure();const id=Number(req.params.id);const target=required(req.body.status,'Status',30).toUpperCase();if(!['OPEN','IN_PROGRESS','PENDING_VERIFICATION','CLOSED','CANCELLED'].includes(target))throw new HttpError(422,'Status NCR tidak valid.');await transaction(async connection=>{const [found]=await connection.query('SELECT * FROM sparepart_governance_ncr WHERE id=? FOR UPDATE',[id]);const n=(found as any[])[0];if(!n)throw new HttpError(404,'NCR tidak ditemukan.');await connection.execute(`UPDATE sparepart_governance_ncr SET status=?,assigned_to=COALESCE(?,assigned_to),root_cause=COALESCE(?,root_cause),corrective_action=COALESCE(?,corrective_action),preventive_action=COALESCE(?,preventive_action),resolution_note=COALESCE(?,resolution_note),verified_by=CASE WHEN ?='CLOSED' THEN ? ELSE verified_by END,verified_at=CASE WHEN ?='CLOSED' THEN NOW() ELSE verified_at END,updated_by=?,updated_at=NOW() WHERE id=?`,[target,optional(req.body.assigned_to,120),optional(req.body.root_cause),optional(req.body.corrective_action),optional(req.body.preventive_action),optional(req.body.resolution_note),target,actor(req),target,actor(req),id]);await connection.execute(`INSERT INTO sparepart_governance_ncr_action (ncr_id,action_type,from_status,to_status,action_note,acted_by,acted_at) VALUES (?,'STATUS_CHANGE',?,?,?,?,NOW())`,[id,n.status,target,optional(req.body.action_note),actor(req)]);});ok(res,{id,status:target},'NCR diperbarui.');}));
sparepartGovernanceRouter.post('/spareparts/governance/reconciliations',asyncHandler(async(req:AuthRequest,res)=>{
  await ensure();
  const company=required(req.body.company_code,'Company',20).toUpperCase() as SparepartErpCompany;
  if(!['UC','RU','GSU'].includes(company))throw new HttpError(422,'Company tidak valid.');
  const mappings=await rows<any>(`SELECT m.id mapping_id,m.sparepart_id,m.erp_item_code,s.erp_item_id
    FROM sparepart_erp_mapping m LEFT JOIN sparepart_erp_snapshot s ON s.mapping_id=m.id
    WHERE m.company_code=? AND m.erp_system='ACCURATE_MSSQL' AND m.status='ACTIVE' ORDER BY m.id`,[company]);
  if(!mappings.length)throw new HttpError(422,'Belum ada item Sparepart yang dipetakan ke ERP untuk company ini.');
  const liveItems:SparepartErpItem[]=[];
  const withId=mappings.filter(x=>globalThis.Number(x.erp_item_id)>0);
  const withoutId=mappings.filter(x=>!globalThis.Number(x.erp_item_id));
  for(let i=0;i<withId.length;i+=500)liveItems.push(...await getSparepartErpItems(company,withId.slice(i,i+500).map(x=>globalThis.Number(x.erp_item_id))));
  for(let i=0;i<withoutId.length;i+=500)liveItems.push(...await getSparepartErpItemsByCodes(company,withoutId.slice(i,i+500).map(x=>String(x.erp_item_code))));
  const byCode=new Map(liveItems.map(item=>[item.item_code,item]));
  const missing=mappings.filter(mapping=>!byCode.has(String(mapping.erp_item_code)));
  if(missing.length)throw new HttpError(502,`Refresh saldo ERP tidak lengkap. ${missing.length} item tidak ditemukan; rekonsiliasi dibatalkan agar tidak memakai saldo lama.`);
  const result=await transaction(async connection=>{
    for(const mapping of mappings){
      const item=byCode.get(String(mapping.erp_item_code))!;
      await connection.execute(`INSERT INTO sparepart_erp_snapshot
        (mapping_id,erp_item_id,balance_qty,category_name,brand_name,is_serialized,has_expiry,minimum_qty,maximum_qty,reorder_point,lead_time_days,source_updated_at,last_synced_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE erp_item_id=VALUES(erp_item_id),balance_qty=VALUES(balance_qty),
        category_name=VALUES(category_name),brand_name=VALUES(brand_name),is_serialized=VALUES(is_serialized),has_expiry=VALUES(has_expiry),
        minimum_qty=VALUES(minimum_qty),maximum_qty=VALUES(maximum_qty),reorder_point=VALUES(reorder_point),lead_time_days=VALUES(lead_time_days),
        source_updated_at=VALUES(source_updated_at),last_synced_at=NOW()`,[mapping.mapping_id,item.item_id,item.balance_qty,item.category_name,item.brand_name,item.is_serialized?1:0,item.has_expiry?1:0,item.minimum_qty,item.maximum_qty,item.reorder_point,item.lead_time_days,item.source_updated_at]);
    }
    const refreshNo=number('SP-ERP-REF');
    if(await tableExists('sparepart_erp_balance_refresh_history'))await connection.execute(`INSERT INTO sparepart_erp_balance_refresh_history
      (refresh_number,company_code,trigger_type,requested_count,refreshed_count,missing_count,status,result_detail,refreshed_by,refreshed_at)
      VALUES (?,?,'RECONCILIATION',?,?,0,'SUCCESS',?,?,NOW())`,[refreshNo,company,mappings.length,liveItems.length,JSON.stringify({balance_source:'IC_ItemBalanceCache'}),actor(req)]);
    const no=number('SP-REC');
    const [header]=await connection.execute<ResultSetHeader>(`INSERT INTO sparepart_erp_reconciliation (reconciliation_number,company_code,status,notes,created_by,created_at) VALUES (?,?,'DRAFT',?,?,NOW())`,[no,company,optional(req.body.notes),actor(req)]);
    await connection.execute(`INSERT INTO sparepart_erp_reconciliation_line (reconciliation_id,mapping_id,sparepart_id,erp_item_code,erp_qty,mcs_qty,variance_qty)
      SELECT ?,m.id,m.sparepart_id,m.erp_item_code,COALESCE(s.balance_qty,0),COALESCE((SELECT SUM(l.quantity_delta) FROM sparepart_stock_ledger l JOIN sparepart_warehouse w ON w.id=l.warehouse_id WHERE l.sparepart_id=m.sparepart_id AND w.company_code=?),0),COALESCE(s.balance_qty,0)-COALESCE((SELECT SUM(l.quantity_delta) FROM sparepart_stock_ledger l JOIN sparepart_warehouse w ON w.id=l.warehouse_id WHERE l.sparepart_id=m.sparepart_id AND w.company_code=?),0) FROM sparepart_erp_mapping m LEFT JOIN sparepart_erp_snapshot s ON s.mapping_id=m.id WHERE m.company_code=? AND m.erp_system='ACCURATE_MSSQL' AND m.status='ACTIVE'`,[header.insertId,company,company,company]);
    await connection.execute(`UPDATE sparepart_erp_reconciliation h SET item_count=(SELECT COUNT(*) FROM sparepart_erp_reconciliation_line l WHERE l.reconciliation_id=h.id),mismatch_count=(SELECT COUNT(*) FROM sparepart_erp_reconciliation_line l WHERE l.reconciliation_id=h.id AND ABS(l.variance_qty)>0.000001),status='SUBMITTED' WHERE h.id=?`,[header.insertId]);
    return{id:header.insertId,reconciliation_number:no,refresh_number:refreshNo,refreshed_count:liveItems.length};
  });
  created(res,result,'Saldo ERP diperbarui dan rekonsiliasi read-only berhasil dibuat.');
}));
sparepartGovernanceRouter.post('/spareparts/governance/reconciliations/:id/review',asyncHandler(async(req:AuthRequest,res)=>{await ensure();const id=Number(req.params.id);const action=String(req.body.action??'').toUpperCase();if(!['APPROVE','REJECT'].includes(action))throw new HttpError(422,'Aksi tidak valid.');await transaction(async connection=>{const [found]=await connection.query('SELECT * FROM sparepart_erp_reconciliation WHERE id=? FOR UPDATE',[id]);const h=(found as any[])[0];if(!h||h.status!=='SUBMITTED')throw new HttpError(409,'Rekonsiliasi tidak menunggu review.');if(String(h.created_by).toLowerCase()===actor(req).toLowerCase())throw new HttpError(403,'Maker tidak boleh menjadi checker.');await connection.execute(`UPDATE sparepart_erp_reconciliation SET status=?,reviewed_by=?,reviewed_at=NOW(),review_note=? WHERE id=?`,[action==='APPROVE'?'RECONCILED':'REJECTED',actor(req),optional(req.body.review_note),id]);});ok(res,{id},'Rekonsiliasi diproses tanpa posting ERP.');}));
sparepartGovernanceRouter.get('/spareparts/governance/export',asyncHandler(async(req,res)=>{await ensure();const type=String(req.query.type??'ncr');let data:any[];if(type==='reconciliation')data=await rows(`SELECT reconciliation_number,company_code,status,item_count,mismatch_count,created_by,created_at,reviewed_by,reviewed_at FROM sparepart_erp_reconciliation ORDER BY created_at DESC`);else data=await rows(`SELECT ncr_number,category,severity,title,assigned_to,due_date,status,created_by,created_at FROM sparepart_governance_ncr ORDER BY created_at DESC`);const keys=data[0]?Object.keys(data[0]):[];const csv=[keys.join(','),...data.map(row=>keys.map(k=>`"${String(row[k]??'').replaceAll('"','""')}"`).join(','))].join('\n');res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="sparepart-${type}.csv"`);res.send('\uFEFF'+csv);}));
