import { realtimeMiddleware, realtimeRouter } from './realtime.js';
import { assetAttachmentFallbackKey } from './lib/asset-attachments.js';
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import cron from 'node-cron';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { pool } from './db.js';
import { approvalCenterRouter } from './routes/approval-center.js';
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
import { isRouter } from './routes/wo-is.js';
import { maintenanceRouter } from './routes/wo-maintenance.js';
import { productionRouter } from './routes/wo-production.js';
import { mesoRouter } from './routes/wo-meso.js';
import { reportAssetRouter } from './routes/report-asset.js';
import { reportAssetMutationRouter } from './routes/report-asset-mutation.js';
import { reportEquipmentRouter } from './routes/report-equipment.js';
import { reportWoMtcRouter } from './routes/report-wo-mtc.js';
import { integrationsRouter } from './routes/integrations.js';
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
v2.use(approvalCenterRouter); v2.use(integrationsRouter); v2.use(realtimeRouter);
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

const shutdown = async () => { scheduleGenerationTask.stop(); preventiveAlarmTask.stop(); employeeSyncTask.stop(); server.close(); await pool.end(); await closeErpPools(); process.exit(0); };
process.on('SIGINT', () => void shutdown()); process.on('SIGTERM', () => void shutdown());
