import { realtimeMiddleware, realtimeRouter } from './realtime.js';
import { assetAttachmentFallbackKey } from './lib/asset-attachments.js';
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import cron from 'node-cron';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { one, pool } from './db.js';
import { normalizeAssetLookup } from './lib/asset-lookup.js';
import { approvalCenterRouter } from './routes/approval-center.js';
import { myWorkRouter } from './routes/my-work.js';
import { closeErpPools } from './lib/erp.js';
import { runScheduledGeneration } from './lib/preventive-schedule.js';
import { runPreventiveAlarmCron } from './lib/preventive-alarm.js';
import { syncAllUsersEmployeeStatus } from './auth.js';
import { asyncHandler, errorHandler, HttpError } from './http.js';
import { getObjectStream } from './lib/storage.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { healthRouter } from './routes/health.js';
import { masterRouter } from './routes/master.js';
import { assetRouter } from './routes/assets.js';
import { assetMutationRouter } from './routes/asset-mutations.js';
import { workOrderRouter } from './routes/work-orders.js';
import { dailyControlRouter } from './routes/daily-control.js';
import { materialRouter } from './routes/materials.js';
import { equipmentRouter } from './routes/equipment.js';
import { scheduleRouter } from './routes/schedules.js';
import { miscRouter } from './routes/misc.js';
import { gaRouter } from './routes/wo-ga.js';
import { dbBackupRouter } from './routes/db-backup.js';
import { runDueAutoBackup } from './lib/db-backup.js';
import { isRouter } from './routes/wo-is.js';
import { maintenanceRouter } from './routes/wo-maintenance.js';
import { productionRouter } from './routes/wo-production.js';
import { mesoRouter } from './routes/wo-meso.js';
import { reportAssetRouter } from './routes/report-asset.js';
import { reportAssetMutationRouter } from './routes/report-asset-mutation.js';
import { reportEquipmentRouter } from './routes/report-equipment.js';
import { reportWoMtcRouter } from './routes/report-wo-mtc.js';
import { integrationsRouter } from './routes/integrations.js';
import { energyRouter } from './routes/energy.js';
import { energyOperationsRouter } from './routes/energy-operations.js';
import { energyFuelMonitoringRouter } from './routes/energy-fuel-monitoring.js';
import { energyUtilityOperationsRouter } from './routes/energy-utility-operations.js';
import { energyFuelOpnameRouter } from './routes/energy-fuel-opname.js';
import { energyEfficiencyKpiRouter } from './routes/energy-efficiency-kpi.js';
import { energyUtilityAllocationRouter } from './routes/energy-utility-allocation.js';
import { energyMeterMasterRouter } from './routes/energy-meter-master.js';
import { energyGovernanceRouter, syncAutomaticEnergyNcr } from './routes/energy-governance.js';
import { fleetRouter } from './routes/fleet.js';
import { fleetEnhancementsRouter } from './routes/fleet-enhancements.js';
import { sparepartRouter } from './routes/spareparts.js';
import { sparepartWoRouter } from './routes/sparepart-wo.js';
import { sparepartInventoryRouter } from './routes/sparepart-inventory.js';
import { sparepartGovernanceRouter } from './routes/sparepart-governance.js';
import { reportCenterRouter } from './routes/report-center.js';
import { syncAllReportCatalogs } from './lib/report-catalog-sync.js';
import { systemAuditMiddleware } from './system-audit.js';

fs.mkdirSync(config.uploadDir, { recursive: true });
const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin, credentials: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(systemAuditMiddleware);
app.use(realtimeMiddleware);
// Kompatibilitas QR fisik dari MCS PHP. QR lama menunjuk ke
// `/Detail_asset/?id=<bin2hex(AssetID|AssetCode)>`; arahkan ke halaman detail
// Asset web baru tanpa membuat seluruh label lama harus dicetak ulang.
app.get(['/Detail_asset', '/Detail_asset/', '/detail_asset', '/detail_asset/'], asyncHandler(async (req, res) => {
  const identifier = normalizeAssetLookup(req.query.id);
  if (!identifier) throw new HttpError(400, 'Asset ID is required');
  const asset = await one<{ AssetCode: string }>(
    'SELECT AssetCode FROM asset WHERE AssetID=? OR AssetCode=? LIMIT 1',
    [identifier, identifier],
  );
  if (!asset?.AssetCode) throw new HttpError(404, 'Asset not found');
  const encodedCode = asset.AssetCode.split('/').map(encodeURIComponent).join('/');
  res.redirect(302, `${config.webBaseUrl}/assets/${encodedCode}`);
}));
const uploadRoot = path.resolve(config.uploadDir);
app.get('/uploads/*splat', asyncHandler(async (req, res) => {
  const key = decodeURIComponent(req.path.replace(/^\/uploads\//, ''));
  const normalized = path.posix.normalize(key);
  if (normalized !== key || normalized.includes('..')) throw new HttpError(400, 'Invalid path');

  const fallbackKey = assetAttachmentFallbackKey(normalized);
  const candidates = fallbackKey ? [normalized, fallbackKey] : [normalized];
  for (const candidate of candidates) {
    const localPath = path.join(uploadRoot, candidate);
    if (localPath.startsWith(uploadRoot + path.sep) && fs.existsSync(localPath)) {
      return res.sendFile(localPath);
    }
  }

  const rangeHeader = req.headers.range;
  let object = await getObjectStream(normalized, rangeHeader);
  if (!object && fallbackKey) object = await getObjectStream(fallbackKey, rangeHeader);
  if (!object) throw new HttpError(404, 'File not found');
  res.setHeader('Content-Type', object.contentType);
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.setHeader('Accept-Ranges', 'bytes');
  if (object.isPartial && object.rangeStart !== undefined && object.rangeEnd !== undefined && object.totalSize !== undefined) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${object.rangeStart}-${object.rangeEnd}/${object.totalSize}`);
    res.setHeader('Content-Length', String(object.rangeEnd - object.rangeStart + 1));
  } else if (object.contentLength !== undefined) {
    res.setHeader('Content-Length', String(object.contentLength));
  }
  object.stream.pipe(res);
}));
app.use(express.static(path.resolve('public')));

const v2 = express.Router();
v2.use(healthRouter); v2.use(authRouter); v2.use(dashboardRouter); v2.use(masterRouter); v2.use(assetRouter); v2.use(assetMutationRouter); v2.use(workOrderRouter); v2.use(dailyControlRouter); v2.use(materialRouter); v2.use(equipmentRouter); v2.use(scheduleRouter); v2.use(miscRouter); v2.use(mesoRouter); v2.use(maintenanceRouter); v2.use(isRouter); v2.use(productionRouter); v2.use(gaRouter);
v2.use(reportAssetRouter); v2.use(reportAssetMutationRouter); v2.use(reportEquipmentRouter); v2.use(reportWoMtcRouter);
v2.use(approvalCenterRouter); v2.use(myWorkRouter); v2.use(integrationsRouter); v2.use(realtimeRouter); v2.use(dbBackupRouter);
v2.use(energyRouter); v2.use(energyOperationsRouter); v2.use(energyFuelMonitoringRouter); v2.use(energyUtilityOperationsRouter); v2.use(energyFuelOpnameRouter); v2.use(energyEfficiencyKpiRouter); v2.use(energyUtilityAllocationRouter); v2.use(energyMeterMasterRouter); v2.use(energyGovernanceRouter);
v2.use(fleetRouter);
v2.use(fleetEnhancementsRouter);
v2.use(sparepartRouter);
v2.use(sparepartWoRouter);
v2.use(sparepartInventoryRouter);
v2.use(sparepartGovernanceRouter);
v2.use(reportCenterRouter);
app.use('/api/v2', v2);
app.use('/api', authRouter);
app.use((_req,_res,next)=>next(new HttpError(404,'Endpoint not found')));
app.use(errorHandler);

const server = app.listen(config.port, () => console.log(`MCS backend listening on http://localhost:${config.port}`));

const scheduleGenerationTask = cron.schedule(config.scheduleCronExpr, () => {
  runScheduledGeneration()
    .then((generated) => { if (generated.length) console.log(`Preventive schedule: generated ${generated.length} WO(s)`, generated.map((g) => g.wo_number)); })
    .catch((error) => console.error('Preventive schedule generation failed:', error));
}, { timezone: 'Asia/Jakarta' });

const preventiveAlarmTask = cron.schedule(config.preventiveAlarmCronExpr, () => {
  runPreventiveAlarmCron()
    .then((result) => console.log('Preventive alarm cron:', result))
    .catch((error) => console.error('Preventive alarm cron failed:', error));
}, { timezone: 'Asia/Jakarta' });

const employeeSyncTask = cron.schedule(config.employeeSyncCronExpr, () => {
  syncAllUsersEmployeeStatus()
    .then((result) => { if (result.disabled) console.log(`Employee sync: disabled ${result.disabled} user(s) not found in emp.padmoasm.com (checked ${result.checked})`); })
    .catch((error) => console.error('Employee sync cron failed:', error));
}, { timezone: 'Asia/Jakarta' });

const dbBackupTask = cron.schedule('* * * * *', () => {
  runDueAutoBackup().catch((error) => console.error('DB backup tick failed:', error));
}, { timezone: 'Asia/Jakarta' });

const energyGovernanceTask = cron.schedule('*/15 * * * *', () => {
  syncAutomaticEnergyNcr().catch((error) => console.error('Energy Governance NCR sync failed:', error));
}, { timezone: 'Asia/Jakarta' });

const reportCatalogTask = cron.schedule(config.reportCatalogSyncCronExpr, () => {
  syncAllReportCatalogs()
    .then((result) => { if(result.length)console.log('Report catalog sync:',result); })
    .catch((error) => console.error('Report catalog sync failed:',error));
}, { timezone: 'Asia/Jakarta' });

// Sinkron pertama saat service hidup agar tidak perlu menunggu tick cron.
syncAllReportCatalogs()
  .then((result) => { if(result.length)console.log('Initial report catalog sync:',result); })
  .catch((error) => console.error('Initial report catalog sync failed:',error));

const shutdown = async () => { scheduleGenerationTask.stop(); preventiveAlarmTask.stop(); employeeSyncTask.stop(); dbBackupTask.stop(); energyGovernanceTask.stop(); reportCatalogTask.stop(); server.close(); await pool.end(); await closeErpPools(); process.exit(0); };
process.on('SIGINT', () => void shutdown()); process.on('SIGTERM', () => void shutdown());
